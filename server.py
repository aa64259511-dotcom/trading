import json
import os
import random
import time
from contextlib import contextmanager
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

import pandas as pd
import requests

from support_resistance_trainer import analyze, fetch_akshare_daily, fetch_akshare_weekly, load_csv, parse_date


RANDOM_SYMBOLS = [
    "000001",
    "000333",
    "000651",
    "000858",
    "002594",
    "300059",
    "300750",
    "600036",
    "600519",
    "600887",
    "601318",
]

CACHE_DIR = Path("data_cache")
TRADE_REPLAY_DATASET = Path("trade_replay_samples.jsonl")
PROXY_ENV_KEYS = (
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "NO_PROXY",
    "http_proxy",
    "https_proxy",
    "all_proxy",
    "no_proxy",
)


@contextmanager
def without_proxy():
    previous = {key: os.environ.get(key) for key in PROXY_ENV_KEYS}
    for key in PROXY_ENV_KEYS:
        os.environ.pop(key, None)
    os.environ["NO_PROXY"] = "*"
    os.environ["no_proxy"] = "*"
    try:
        yield
    finally:
        for key in PROXY_ENV_KEYS:
            if previous[key] is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = previous[key]


def fetch_with_retry(fetcher, symbol, start_ts, analysis_ts, label, attempts=3):
    last_error = None
    for attempt in range(1, attempts + 1):
        try:
            return fetcher(symbol, start_ts, analysis_ts)
        except Exception as exc:
            last_error = exc
            if attempt < attempts:
                time.sleep(1.5 * attempt)
    try:
        with without_proxy():
            return fetcher(symbol, start_ts, analysis_ts)
    except Exception as exc:
        last_error = exc
    raise RuntimeError(f"{label}数据拉取失败，已重试{attempts}次：{last_error}")


def cache_path(symbol, start_ts, analysis_ts, period):
    CACHE_DIR.mkdir(exist_ok=True)
    return CACHE_DIR / f"{symbol}_{period}_{start_ts.strftime('%Y%m%d')}_{analysis_ts.strftime('%Y%m%d')}.csv"


def eastmoney_market_id(symbol):
    return "1" if symbol.startswith(("5", "6", "9")) else "0"


def market_symbol(symbol):
    return f"sh{symbol}" if symbol.startswith(("5", "6", "9")) else f"sz{symbol}"


def fetch_tencent_daily(symbol, start_ts, analysis_ts):
    session = requests.Session()
    session.trust_env = False
    response = session.get(
        "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get",
        params={
            "param": f"{market_symbol(symbol)},day,{start_ts.strftime('%Y-%m-%d')},{analysis_ts.strftime('%Y-%m-%d')},1500,qfq"
        },
        headers={"User-Agent": "Mozilla/5.0"},
        timeout=20,
    )
    response.raise_for_status()
    payload = response.json()
    stock_data = (payload.get("data") or {}).get(market_symbol(symbol)) or {}
    klines = stock_data.get("qfqday") or stock_data.get("day") or []
    rows = []
    for values in klines:
        if len(values) < 6:
            continue
        rows.append(
            {
                "date": values[0],
                "open": values[1],
                "close": values[2],
                "high": values[3],
                "low": values[4],
                "volume": values[5],
            }
        )
    if not rows:
        raise RuntimeError(f"Tencent did not return daily data for {symbol}.")
    return load_normalized_dataframe(rows)


def fetch_eastmoney_daily(symbol, start_ts, analysis_ts):
    last_error = None
    response = None
    success = False
    for attempt in range(1, 4):
        session = requests.Session()
        session.trust_env = False
        try:
            response = session.get(
                "https://push2his.eastmoney.com/api/qt/stock/kline/get",
                params={
                    "fields1": "f1,f2,f3,f4,f5,f6",
                    "fields2": "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f116",
                    "ut": "7eea3edcaed734bea9cbfc24409ed989",
                    "klt": "101",
                    "fqt": "1",
                    "secid": f"{eastmoney_market_id(symbol)}.{symbol}",
                    "beg": start_ts.strftime("%Y%m%d"),
                    "end": analysis_ts.strftime("%Y%m%d"),
                },
                headers={"User-Agent": "Mozilla/5.0"},
                timeout=20,
            )
            response.raise_for_status()
            success = True
            break
        except Exception as exc:
            last_error = exc
            if attempt < 3:
                time.sleep(1.2 * attempt)
    if not success or response is None:
        raise RuntimeError(f"Eastmoney daily data request failed for {symbol}: {last_error}")
    payload = response.json()
    klines = (payload.get("data") or {}).get("klines") or []
    rows = []
    for line in klines:
        values = line.split(",")
        if len(values) < 6:
            continue
        rows.append(
            {
                "date": values[0],
                "open": values[1],
                "close": values[2],
                "high": values[3],
                "low": values[4],
                "volume": values[5],
            }
        )
    if not rows:
        raise RuntimeError(f"Eastmoney did not return daily data for {symbol}.")
    return load_normalized_dataframe(rows)


def load_normalized_dataframe(rows):
    from support_resistance_trainer import normalize_columns

    return normalize_columns(pd.DataFrame(rows))


def daily_to_weekly(df):
    weekly = (
        df.assign(week=df["date"].dt.to_period("W-FRI"))
        .groupby("week", as_index=False)
        .agg({"date": "max", "open": "first", "high": "max", "low": "min", "close": "last", "volume": "sum"})
        .dropna(subset=["open", "high", "low", "close"])
    )
    return weekly.drop(columns=["week"], errors="ignore").reset_index(drop=True)


def daily_to_monthly(df):
    monthly = (
        df.assign(month=df["date"].dt.to_period("M"))
        .groupby("month", as_index=False)
        .agg({"date": "max", "open": "first", "high": "max", "low": "min", "close": "last", "volume": "sum"})
        .dropna(subset=["open", "high", "low", "close"])
    )
    return monthly.drop(columns=["month"], errors="ignore").reset_index(drop=True)


def candles_to_records(df):
    return [
        {
            "date": row["date"].strftime("%Y-%m-%d"),
            "open": round(float(row["open"]), 3),
            "high": round(float(row["high"]), 3),
            "low": round(float(row["low"]), 3),
            "close": round(float(row["close"]), 3),
            "volume": round(float(row.get("volume", 0)), 3),
        }
        for _, row in df.iterrows()
    ]


def fetch_direct_fallback(symbol, start_ts, analysis_ts, period):
    try:
        daily = fetch_tencent_daily(symbol, start_ts, analysis_ts)
    except Exception:
        daily = fetch_eastmoney_daily(symbol, start_ts, analysis_ts)
    if period == "weekly":
        return daily_to_weekly(daily)
    return daily


def cached_paths(symbol, period):
    if not CACHE_DIR.exists():
        return []
    return sorted(CACHE_DIR.glob(f"{symbol}_{period}_*.csv"), key=lambda path: path.stat().st_mtime, reverse=True)


def load_nearest_cache(symbol, period, start_ts, analysis_ts, anchor_ts=None):
    fallback = None
    for path in cached_paths(symbol, period):
        try:
            df = load_csv(path)
        except Exception:
            continue
        filtered = df[(df["date"] >= start_ts) & (df["date"] <= analysis_ts)].copy()
        if not filtered.empty:
            filtered = filtered.reset_index(drop=True)
            if anchor_ts is None:
                return filtered
            if filtered["date"].min() <= anchor_ts <= filtered["date"].max():
                return filtered
            if fallback is None:
                fallback = filtered
    return fallback


def covers_anchor(df, anchor_ts):
    if anchor_ts is None or df.empty:
        return True
    return df["date"].min() <= anchor_ts <= df["date"].max()


def fetch_cached(fetcher, symbol, start_ts, analysis_ts, period, label, anchor_ts=None):
    path = cache_path(symbol, start_ts, analysis_ts, period)
    fetch_error = None
    try:
        df = fetch_with_retry(fetcher, symbol, start_ts, analysis_ts, label)
        if covers_anchor(df, anchor_ts):
            df.to_csv(path, index=False, encoding="utf-8-sig")
            return df
    except Exception as exc:
        fetch_error = exc
    try:
        df = fetch_direct_fallback(symbol, start_ts, analysis_ts, period)
        if covers_anchor(df, anchor_ts):
            df.to_csv(path, index=False, encoding="utf-8-sig")
            return df
    except Exception as exc:
        fetch_error = fetch_error or exc
    if path.exists():
        df = load_csv(path)
        if covers_anchor(df, anchor_ts):
            return df
    cached = load_nearest_cache(symbol, period, start_ts, analysis_ts, anchor_ts=anchor_ts)
    if cached is not None:
        return cached
    if fetch_error is not None:
        raise fetch_error
    raise ValueError(f"{label}数据不覆盖目标日期。")


def fetch_market_data(symbol, analysis_ts, years=3):
    start_ts = analysis_ts - pd.DateOffset(years=years + 1)
    daily_df = fetch_cached(fetch_akshare_daily, symbol, start_ts, analysis_ts, "daily", "日线")
    try:
        weekly_df = fetch_cached(fetch_akshare_weekly, symbol, start_ts, analysis_ts, "weekly", "周线")
    except Exception:
        weekly_df = daily_to_weekly(daily_df)
        weekly_df.to_csv(cache_path(symbol, start_ts, analysis_ts, "weekly"), index=False, encoding="utf-8-sig")
    return daily_df, weekly_df


def trade_replay_payload(symbol, start_date, lookback=700):
    start_ts = parse_date(start_date)
    fetch_start = start_ts - pd.DateOffset(years=4)
    fetch_end = max(previous_trading_day(), start_ts + pd.DateOffset(years=2))
    daily = fetch_cached(fetch_akshare_daily, symbol, fetch_start, fetch_end, "daily", "日线", anchor_ts=start_ts)
    daily = daily[daily["date"] <= fetch_end].copy().reset_index(drop=True)
    if daily.empty:
        raise ValueError(f"No daily data for {symbol}.")
    candidates = daily[daily["date"] <= start_ts]
    if candidates.empty:
        raise ValueError("Start date is earlier than available market data.")
    cursor = int(candidates.index[-1])
    window_start = max(0, cursor - int(lookback) + 1)
    replay_daily = daily.iloc[window_start:].copy().reset_index(drop=True)
    cursor = cursor - window_start
    return {
        "symbol": symbol,
        "startDate": replay_daily.iloc[cursor]["date"].strftime("%Y-%m-%d"),
        "cursor": cursor,
        "position": None,
        "timeframes": {
            "daily": candles_to_records(replay_daily),
            "weekly": candles_to_records(daily_to_weekly(replay_daily)),
            "monthly": candles_to_records(daily_to_monthly(replay_daily)),
        },
    }


def save_trade_replay_decision(payload):
    record = dict(payload)
    record["savedAt"] = pd.Timestamp.now().isoformat()
    with TRADE_REPLAY_DATASET.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False) + "\n")
    return {"saved": True, "path": str(TRADE_REPLAY_DATASET)}


def read_trade_replay_records():
    records = []
    if not TRADE_REPLAY_DATASET.exists():
        return records
    with TRADE_REPLAY_DATASET.open("r", encoding="utf-8") as handle:
        for index, line in enumerate(handle):
            line = line.strip()
            if not line:
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                continue
            record["id"] = index
            records.append(record)
    return records


def trade_replay_records():
    records = read_trade_replay_records()
    records.reverse()
    return {"records": records, "count": len(records)}


def trade_replay_datasets():
    records = read_trade_replay_records()
    groups = {}
    for record in records:
        session_id = record.get("sessionId") or f"legacy:{record.get('symbol', '')}:{record.get('trainingStartDate') or record.get('date', '')}"
        if session_id not in groups:
            groups[session_id] = {
                "id": session_id,
                "symbol": record.get("symbol"),
                "startDate": record.get("trainingStartDate") or record.get("date"),
                "endDate": record.get("date"),
                "savedAt": record.get("savedAt"),
                "actions": [],
                "recordIds": [],
            }
        group = groups[session_id]
        group["actions"].append(record)
        group["recordIds"].append(record["id"])
        group["endDate"] = record.get("date") or group["endDate"]
        group["savedAt"] = record.get("savedAt") or group["savedAt"]
    datasets = list(groups.values())
    datasets.sort(key=lambda item: item.get("savedAt") or "", reverse=True)
    return {"datasets": datasets, "count": len(datasets), "recordCount": len(records)}


def delete_trade_replay_record(record_id=None, session_id=None):
    if not TRADE_REPLAY_DATASET.exists():
        return {"deleted": False, "count": 0}
    if record_id is None and session_id is None:
        return {"deleted": False, "count": 0}
    target = int(record_id) if record_id is not None else None
    kept = []
    deleted = False
    with TRADE_REPLAY_DATASET.open("r", encoding="utf-8") as handle:
        for index, line in enumerate(handle):
            remove = index == target
            if session_id is not None:
                try:
                    record = json.loads(line)
                    record_session = record.get("sessionId") or f"legacy:{record.get('symbol', '')}:{record.get('trainingStartDate') or record.get('date', '')}"
                    remove = record_session == session_id
                except json.JSONDecodeError:
                    remove = False
            if remove:
                deleted = True
                continue
            kept.append(line)
    with TRADE_REPLAY_DATASET.open("w", encoding="utf-8") as handle:
        handle.writelines(kept)
    return {"deleted": deleted, "count": len(kept)}


def latest_window(df, analysis_ts):
    window = df[df["date"] <= analysis_ts].copy().reset_index(drop=True)
    if len(window) < 120:
        raise ValueError("Not enough daily candles before analysis date; need at least 120 rows.")
    return window


def moving_average(series, window):
    return series.rolling(window).mean()


def slope_pct(series, days):
    if len(series) <= days or pd.isna(series.iloc[-days - 1]) or pd.isna(series.iloc[-1]):
        return 0.0
    base = float(series.iloc[-days - 1])
    if base == 0:
        return 0.0
    return (float(series.iloc[-1]) - base) / base


def body_low(row):
    return float(min(row["open"], row["close"]))


def body_high(row):
    return float(max(row["open"], row["close"]))


def is_bullish(row):
    return float(row["close"]) > float(row["open"])


def detect_trend(daily_df, weekly_df):
    daily = daily_df.copy()
    weekly = weekly_df.copy()
    daily["ma20"] = moving_average(daily["close"], 20)
    daily["ma60"] = moving_average(daily["close"], 60)
    daily["ma120"] = moving_average(daily["close"], 120)
    weekly["ma10"] = moving_average(weekly["close"], 10)
    weekly["ma30"] = moving_average(weekly["close"], 30)
    last = daily.iloc[-1]
    weekly_last = weekly.iloc[-1]

    daily_up_score = 0
    daily_up_score += 1 if last["close"] > last["ma60"] else 0
    daily_up_score += 1 if last["ma20"] > last["ma60"] else 0
    daily_up_score += 1 if slope_pct(daily["ma60"], 20) > 0.015 else 0
    weekly_up_score = 0
    weekly_up_score += 1 if weekly_last["close"] > weekly_last["ma30"] else 0
    weekly_up_score += 1 if weekly_last["ma10"] > weekly_last["ma30"] else 0
    weekly_up_score += 1 if slope_pct(weekly["ma30"], 10) > 0.01 else 0

    daily_down_score = 0
    daily_down_score += 1 if last["close"] < last["ma60"] else 0
    daily_down_score += 1 if last["ma20"] < last["ma60"] else 0
    daily_down_score += 1 if slope_pct(daily["ma60"], 20) < -0.015 else 0
    weekly_down_score = 0
    weekly_down_score += 1 if weekly_last["close"] < weekly_last["ma30"] else 0
    weekly_down_score += 1 if weekly_last["ma10"] < weekly_last["ma30"] else 0
    weekly_down_score += 1 if slope_pct(weekly["ma30"], 10) < -0.01 else 0

    if daily_up_score + weekly_up_score >= 4:
        return {
            "type": "uptrend",
            "label": "上升趋势",
            "detail": "日线与周线均线斜率偏上，优先寻找回调后重新转强的延续买点。",
            "score": daily_up_score + weekly_up_score,
        }
    if daily_down_score + weekly_down_score >= 4:
        return {
            "type": "downtrend",
            "label": "下跌趋势",
            "detail": "日线与周线结构偏弱，只按超跌反弹模型处理，不做趋势追涨。",
            "score": daily_down_score + weekly_down_score,
        }
    return {
        "type": "range",
        "label": "盘整无趋势",
        "detail": "均线斜率和价格位置没有形成单边方向，重点看支撑压力区间内的反抽确认。",
        "score": max(daily_up_score + weekly_up_score, daily_down_score + weekly_down_score),
    }


def detect_phase(daily_df, weekly_df, trend):
    daily = daily_df.copy()
    weekly = weekly_df.copy()
    daily["ma20"] = moving_average(daily["close"], 20)
    daily["ma60"] = moving_average(daily["close"], 60)
    daily["ma120"] = moving_average(daily["close"], 120)
    weekly["ma10"] = moving_average(weekly["close"], 10)
    weekly["ma30"] = moving_average(weekly["close"], 30)
    weekly["ma60"] = moving_average(weekly["close"], 60)

    last = daily.iloc[-1]
    previous = daily.iloc[-2]
    current = float(last["close"])
    high_120 = float(daily.tail(120)["high"].max())
    high_250 = float(daily.tail(250)["high"].max())
    drawdown = (current - high_120) / high_120 if high_120 else 0
    major_drawdown = (current - high_250) / high_250 if high_250 else 0
    weekly_low_30 = float(weekly.tail(30)["low"].min())
    recent_low_60 = float(daily.tail(60)["low"].min())
    above_weekly_low = current > weekly_low_30 * 1.02
    weekly_ma30_up = slope_pct(weekly["ma30"], 10) > 0.03
    weekly_ma60_up = slope_pct(weekly["ma60"], 10) > 0.03
    long_trend_up = (weekly_ma30_up or weekly_ma60_up) and above_weekly_low
    short_structure_broken = current < float(last["ma20"]) and current < float(last["ma60"])
    fast_drop = (float(daily.tail(12)["high"].max()) - float(daily.tail(12)["low"].min())) / current >= 0.12
    initial_reclaim = current > float(daily.tail(5)["low"].min()) * 1.06 or (is_bullish(previous) and previous["close"] > previous["open"])

    if long_trend_up and drawdown <= -0.12 and short_structure_broken:
        if fast_drop and initial_reclaim:
            label = "上升趋势中的大调整，急跌后初步拉回，等待踩稳确认"
            state = "uptrend_deep_pullback_reclaiming"
            detail = "大趋势斜率仍偏上，但从阶段高点回撤较大，短线均线被打坏；当前只视为急跌后的初步拉回，需要等待平台和缩量确认。"
        else:
            label = "上升趋势中的大调整，等待止跌结构"
            state = "uptrend_deep_pullback"
            detail = "大趋势没有完全破坏，但短线结构处于调整段，买入策略应等待支撑踩稳和价格形态转强。"
        return {
            "type": state,
            "label": label,
            "detail": detail,
            "majorTrend": "uptrend",
            "drawdownPct": round(drawdown * 100, 2),
            "majorDrawdownPct": round(major_drawdown * 100, 2),
            "weeklyKeyLow": round(weekly_low_30, 3),
            "recentKeyLow": round(recent_low_60, 3),
        }

    if trend["type"] == "uptrend":
        return {
            "type": "uptrend_continuation",
            "label": "上升趋势延续，等待回调后的转强买点",
            "detail": "大趋势和当前结构同向偏强，适合等待回调踩稳后重新突破。",
            "majorTrend": "uptrend",
            "drawdownPct": round(drawdown * 100, 2),
            "majorDrawdownPct": round(major_drawdown * 100, 2),
            "weeklyKeyLow": round(weekly_low_30, 3),
            "recentKeyLow": round(recent_low_60, 3),
        }

    if trend["type"] == "downtrend":
        return {
            "type": "downtrend_rebound_watch",
            "label": "下跌趋势，只有超跌反弹观察价值",
            "detail": "大小周期结构偏弱，只观察关键支撑拉回、平台不破或连续上涨形成的反弹机会。",
            "majorTrend": "downtrend",
            "drawdownPct": round(drawdown * 100, 2),
            "majorDrawdownPct": round(major_drawdown * 100, 2),
            "weeklyKeyLow": round(weekly_low_30, 3),
            "recentKeyLow": round(recent_low_60, 3),
        }

    return {
        "type": "range_waiting_breakout",
        "label": "盘整结构，等待区间边界确认",
        "detail": "当前缺少明确单边趋势，重点等待支撑拉回确认或突破交易密集区后的回踩不破。",
        "majorTrend": "range",
        "drawdownPct": round(drawdown * 100, 2),
        "majorDrawdownPct": round(major_drawdown * 100, 2),
        "weeklyKeyLow": round(weekly_low_30, 3),
        "recentKeyLow": round(recent_low_60, 3),
    }


def corrected_level(level, level_type, corrections):
    value = corrections.get(level_type)
    if value and value > 0:
        width = max(value * 0.006, 0.02)
        return {"type": level_type, "low": value - width, "high": value + width, "mid": value, "strength": 100, "sources": ["manual"]}
    return level


def find_nearest_from_levels(levels, current_price, corrections):
    supports = [item for item in levels if item.get("type") == "support" and item.get("high", 0) <= current_price]
    resistances = [item for item in levels if item.get("type") == "resistance" and item.get("low", 0) >= current_price]
    support = min(supports, key=lambda item: current_price - item["mid"], default=None)
    resistance = min(resistances, key=lambda item: item["mid"] - current_price, default=None)
    return {
        "support": corrected_level(support, "support", corrections),
        "resistance": corrected_level(resistance, "resistance", corrections),
    }


def risk_reward(current_price, stop_loss, resistance):
    if not resistance or stop_loss >= current_price:
        return {"target": None, "ratio": None}
    target = float(resistance["mid"])
    reward = target - current_price
    risk = current_price - stop_loss
    if reward <= 0 or risk <= 0:
        return {"target": target, "ratio": None}
    return {"target": target, "ratio": reward / risk}


def support_reclaim_signal(recent, support):
    if not support:
        return {"hit": False, "score": 0, "detail": "没有可用支撑位。"}
    support_low = float(support["low"])
    support_high = float(support["high"])
    last = recent.iloc[-1]
    previous = recent.iloc[:-1].tail(8)
    breached = bool((previous["low"] < support_low).any() or last["low"] < support_low)
    reclaimed_today = last["close"] > support_high and last["low"] < support_high
    wick_reclaim = last["low"] < support_low and last["close"] > support_high
    post_breach = recent[recent["low"] < support_low]
    validation = False
    shrink_volume = False
    if not post_breach.empty:
        breach_index = post_breach.index[-1]
        after = recent.loc[breach_index + 1 :]
        validation = len(after) >= 2 and bool((after["close"] >= support_low).all())
        shrink_volume = len(after) >= 2 and float(after["volume"].iloc[-1]) < float(recent["volume"].tail(20).mean())
    bullish_above = is_bullish(last) and last["close"] > support_high
    hit = bool((wick_reclaim or (breached and validation and shrink_volume and bullish_above)) and bullish_above)
    score = 0
    score += 20 if breached else 0
    score += 20 if wick_reclaim else 0
    score += 20 if validation else 0
    score += 15 if shrink_volume else 0
    score += 15 if bullish_above else 0
    return {
        "hit": hit,
        "score": score,
        "detail": "支撑跌破后被拉回，并在支撑上方出现阳线确认。" if hit else "支撑拉回模型尚未完整确认。",
    }


def uptrend_pullback_signal(daily):
    last = daily.iloc[-1]
    previous = daily.iloc[-2]
    recent = daily.tail(30)
    ma20 = moving_average(daily["close"], 20)
    pulled_back = bool((recent.tail(12)["low"] <= ma20.tail(12) * 1.01).any())
    recent_high = float(recent.iloc[:-1]["high"].max())
    reclaimed = is_bullish(last) and last["close"] > previous["high"]
    regained_ma20 = is_bullish(last) and last["close"] > ma20.iloc[-1] and previous["close"] <= ma20.iloc[-2] * 1.02
    breakout_continuation = last["close"] >= recent.iloc[:-1].tail(5)["high"].max()
    hit = bool(pulled_back and (reclaimed or regained_ma20 or breakout_continuation))
    score = 0
    score += 25 if pulled_back else 0
    score += 25 if reclaimed else 0
    score += 20 if regained_ma20 else 0
    score += 20 if breakout_continuation else 0
    return {
        "hit": hit,
        "score": score,
        "detail": "上升趋势中回调后当天重新拉回，属于突破回调后的延续买点。" if hit else "上升趋势回调延续模型尚未触发。",
    }


def downtrend_rebound_signal(daily, support):
    recent = daily.tail(20)
    last = recent.iloc[-1]
    previous = recent.iloc[-2]
    drop_pct = (float(recent["close"].head(10).max()) - float(recent["low"].min())) / float(recent["close"].head(10).max())
    new_low = float(recent["low"].iloc[-5:].min()) <= float(daily["low"].tail(80).min()) * 1.01
    two_up_days = is_bullish(previous) and is_bullish(last) and last["close"] > previous["close"]
    support_signal = support_reclaim_signal(recent, support)
    platform = False
    if len(recent) >= 8:
        last_lows = recent.tail(6)["low"]
        platform = (last_lows.max() - last_lows.min()) / max(last_lows.mean(), 0.01) <= 0.035 and last["close"] > recent.tail(6)["close"].mean()
    hit = bool((drop_pct >= 0.08 and two_up_days) or support_signal["hit"] or (new_low and platform and is_bullish(last)))
    score = 0
    score += 25 if drop_pct >= 0.08 else 0
    score += 20 if new_low else 0
    score += 25 if two_up_days else 0
    score += 20 if platform else 0
    score += min(support_signal["score"], 25)
    return {
        "hit": hit,
        "score": score,
        "detail": "下跌趋势中出现超跌后的支撑拉回、平台不破或连续两天上涨。" if hit else "下跌趋势只观察超跌反弹，当前确认不足。",
    }


def wait_pattern_for_phase(phase, support, resistance):
    support_text = f"{support['low']:.2f}-{support['high']:.2f}" if support else "最近有效支撑"
    resistance_text = f"{resistance['low']:.2f}-{resistance['high']:.2f}" if resistance else "上方压力"
    recent_low_text = f"{phase['recentKeyLow']:.2f}" if phase.get("recentKeyLow") else "急跌低点"
    if phase["type"].startswith("uptrend_deep_pullback"):
        return {
            "label": "等待踩稳后的价格形态",
            "items": [
                f"优先观察急跌低点 {recent_low_text} 一带能否形成平台，后续回踩不再有效跌破。",
                f"若继续下探，则再看更大级别支撑 {support_text} 是否出现快速拉回。",
                "回踩阶段成交量缩小，说明抛压减弱。",
                f"突破短期交易密集区或颈线后，回踩不破再考虑；如果形成头肩底、双底、箱体突破，优先级更高。",
                "支撑上方重新出现阳线可加分，但不是必须；更关键是低点不再下移、缩量回踩不破。",
                f"若接近 {resistance_text}，需要重新计算盈亏比，低于 3 不追。",
            ],
        }
    if phase["type"] == "range_waiting_breakout":
        return {
            "label": "等待区间突破或支撑拉回确认",
            "items": [
                f"在 {support_text} 附近出现跌破后快速拉回，或下影线收回。",
                "之后回踩支撑不破并缩量，确认卖压减弱。",
                "突破交易密集区后回踩不破，或形成头肩底后站上颈线。",
                "支撑上方阳线是确认信号之一，但不是硬性条件。",
            ],
        }
    if phase["type"] == "downtrend_rebound_watch":
        return {
            "label": "等待超跌反弹结构确认",
            "items": [
                f"跌破关键支撑后能快速拉回 {support_text} 上方。",
                "多次验证支撑不破，或新低后出现平台整理。",
                "快速下跌后出现连续两天上涨，或平台上沿被放量突破。",
                "只按反弹处理，不能用趋势买入仓位。",
            ],
        }
    return {
        "label": "等待回调转强",
        "items": [
            "回调不破关键均线或前低，随后重新站回短期交易密集区。",
            "突破后回踩不破，缩量优先。",
            "出现阳线确认更好，但核心是回踩不破和上方空间足够。",
        ],
    }


def evaluate_buy_models(daily_df, trend, phase, support, resistance):
    current = daily_df.iloc[-1]
    current_price = float(current["close"])
    recent = daily_df.tail(30)
    if phase["type"].startswith("uptrend_deep_pullback"):
        model = support_reclaim_signal(recent, support)
        model_name = "上升趋势大调整后的踩稳确认"
        base_score = 38
    elif trend["type"] == "uptrend":
        model = uptrend_pullback_signal(daily_df)
        model_name = "上升趋势回调延续"
        base_score = 45
    elif trend["type"] == "range":
        model = support_reclaim_signal(recent, support)
        model_name = "盘整支撑跌破拉回"
        base_score = 40
    else:
        model = downtrend_rebound_signal(daily_df, support)
        model_name = "下跌趋势超跌反弹"
        base_score = 32

    stop_loss = body_low(current)
    rr = risk_reward(current_price, stop_loss, resistance)
    ratio = rr["ratio"]
    rr_score = 0 if ratio is None or not model["hit"] else min(ratio / 3, 1.5) * 30
    support_score = 0
    if support and model["hit"]:
        support_distance = abs(current_price - support["mid"]) / current_price
        support_score = max(0, 15 - support_distance * 300)
    signal_score = min(model["score"], 35) if model["hit"] else min(model["score"], 18)
    score = round(min(100, base_score + signal_score + rr_score + support_score))
    worth_buying = bool(model["hit"] and ratio is not None and ratio >= 3)
    decision = "值得买入" if worth_buying else "暂不买入"
    if model["hit"] and (ratio is None or ratio < 3):
        decision = "信号出现但盈亏比不足"
    return {
        "model": model_name,
        "modelHit": model["hit"],
        "modelDetail": model["detail"],
        "score": score,
        "worthBuying": worth_buying,
        "decision": decision,
        "entryDate": current["date"].strftime("%Y-%m-%d"),
        "entryPrice": round(current_price, 3),
        "stopLoss": round(stop_loss, 3),
        "stopBasis": "信号K线实体下沿",
        "targetPrice": round(rr["target"], 3) if rr["target"] else None,
        "riskReward": round(ratio, 2) if ratio is not None else None,
        "waitPattern": wait_pattern_for_phase(phase, support, resistance),
    }


def buy_analysis(symbol, analysis_date, corrections):
    analysis_ts = parse_date(analysis_date)
    daily_df, weekly_df = fetch_market_data(symbol, analysis_ts, years=3)
    daily_window = latest_window(daily_df, analysis_ts)
    weekly_window = weekly_df[weekly_df["date"] <= analysis_ts].copy().reset_index(drop=True)
    sr_date = (analysis_ts + pd.Timedelta(days=1)).strftime("%Y-%m-%d")
    sr_result = analyze(
        df=weekly_df,
        analysis_date=sr_date,
        years=3,
        corrections=[
            {"type": key, "price": value}
            for key, value in corrections.items()
            if value and value > 0
        ],
        swing_window=3,
        cluster_pct=0.015,
        body_bin_pct=0.01,
        reaction_pct=0.03,
        daily_df=daily_df,
    )
    current_price = float(daily_window.iloc[-1]["close"])
    levels = sr_result.get("levels") or []
    nearest = find_nearest_from_levels(levels, current_price, corrections)
    trend = detect_trend(daily_window, weekly_window)
    phase = detect_phase(daily_window, weekly_window, trend)
    model = evaluate_buy_models(daily_window, trend, phase, nearest["support"], nearest["resistance"])
    return {
        "symbol": symbol,
        "analysisDate": analysis_date,
        "currentPrice": round(current_price, 3),
        "trend": trend,
        "phase": phase,
        "support": nearest["support"],
        "resistance": nearest["resistance"],
        "levels": levels[:8],
        "model": model,
        "trainingStart": sr_result.get("trainingStart"),
        "trainingEnd": sr_result.get("trainingEnd"),
    }


def previous_trading_day(reference=None):
    day = pd.Timestamp.today().normalize() if reference is None else pd.Timestamp(reference).normalize()
    day -= pd.Timedelta(days=1)
    while day.weekday() >= 5:
        day -= pd.Timedelta(days=1)
    return day


def cached_symbols():
    if not CACHE_DIR.exists():
        return []
    symbols = {
        path.name.split("_", 1)[0]
        for path in list(CACHE_DIR.glob("*_daily_*.csv")) + list(CACHE_DIR.glob("*_weekly_*.csv"))
        if "_" in path.name
    }
    return sorted(symbol for symbol in symbols if symbol in RANDOM_SYMBOLS)


def cached_symbol_start_date(symbol):
    starts = []
    for path in CACHE_DIR.glob(f"{symbol}_daily_*.csv"):
        try:
            df = pd.read_csv(path, usecols=["date"])
            if not df.empty:
                starts.append(pd.to_datetime(df["date"]).min())
        except Exception:
            continue
    return min(starts) if starts else None


def cached_symbol_trade_dates(symbol, start_bound, end_bound):
    dates = []
    for path in CACHE_DIR.glob(f"{symbol}_daily_*.csv"):
        try:
            df = pd.read_csv(path, usecols=["date"])
            series = pd.to_datetime(df["date"], errors="coerce").dropna()
            series = series[(series >= start_bound) & (series <= end_bound)]
            dates.extend(series.tolist())
        except Exception:
            continue
    return sorted(set(dates))


def valid_random_replay_symbols(start_bound, end_bound):
    symbols = cached_symbols() or RANDOM_SYMBOLS
    valid = []
    for symbol in symbols:
        dates = cached_symbol_trade_dates(symbol, start_bound, end_bound)
        if dates:
            valid.append((symbol, dates))
    return valid


class TradingAdviceHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/random-training-sample":
            self.write_json(200, self.random_training_sample())
            return
        if parsed.path == "/api/trade-replay-records":
            self.write_json(200, trade_replay_records())
            return
        if parsed.path == "/api/trade-replay-datasets":
            self.write_json(200, trade_replay_datasets())
            return
        super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/train-support-resistance":
            self.handle_train_support_resistance()
            return
        if parsed.path == "/api/buy-analysis":
            self.handle_buy_analysis()
            return
        if parsed.path == "/api/trade-replay":
            self.handle_trade_replay()
            return
        if parsed.path == "/api/trade-replay-decision":
            self.handle_trade_replay_decision()
            return
        if parsed.path == "/api/delete-trade-replay-record":
            self.handle_delete_trade_replay_record()
            return
        self.send_error(404, "Not found")

    def read_json_payload(self):
        length = int(self.headers.get("Content-Length", "0"))
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def handle_buy_analysis(self):
        try:
            payload = self.read_json_payload()
            symbol = str(payload.get("symbol", "")).strip()
            analysis_date = str(payload.get("date", "")).strip()
            if not symbol:
                raise ValueError("symbol is required")
            if not analysis_date:
                analysis_date = previous_trading_day().strftime("%Y-%m-%d")
            corrections = {
                "support": float(payload.get("supportCorrection") or 0),
                "resistance": float(payload.get("resistanceCorrection") or 0),
            }
            self.write_json(200, buy_analysis(symbol, analysis_date, corrections))
        except Exception as exc:
            self.write_json(400, {"error": str(exc)})

    def handle_train_support_resistance(self):
        try:
            payload = self.read_json_payload()
            symbol = str(payload.get("symbol", "")).strip()
            analysis_date = str(payload.get("date", "")).strip()
            if not symbol:
                raise ValueError("symbol is required")
            if not analysis_date:
                analysis_date = previous_trading_day().strftime("%Y-%m-%d")

            analysis_ts = parse_date(analysis_date)
            years = int(payload.get("years", 3))
            daily_df, df = fetch_market_data(symbol, analysis_ts, years=years)
            if df.empty:
                raise ValueError(f"AKShare did not return weekly data for {symbol}. Check the stock code and date.")
            result = analyze(
                df=df,
                analysis_date=analysis_date,
                years=years,
                corrections=payload.get("corrections") or [],
                swing_window=int(payload.get("swingWindow", 3)),
                cluster_pct=float(payload.get("clusterPct", 0.015)),
                body_bin_pct=float(payload.get("bodyBinPct", 0.01)),
                reaction_pct=float(payload.get("reactionPct", 0.03)),
                daily_df=daily_df,
            )
            self.write_json(200, result)
        except Exception as exc:
            self.write_json(400, {"error": str(exc)})

    def handle_trade_replay(self):
        try:
            payload = self.read_json_payload()
            symbol = str(payload.get("symbol", "")).strip()
            start_date = str(payload.get("date", "")).strip()
            if not symbol:
                raise ValueError("symbol is required")
            if not start_date:
                start_date = previous_trading_day().strftime("%Y-%m-%d")
            lookback = int(payload.get("lookback", 700))
            self.write_json(200, trade_replay_payload(symbol, start_date, lookback=lookback))
        except Exception as exc:
            self.write_json(400, {"error": str(exc)})

    def handle_trade_replay_decision(self):
        try:
            payload = self.read_json_payload()
            self.write_json(200, save_trade_replay_decision(payload))
        except Exception as exc:
            self.write_json(400, {"error": str(exc)})

    def handle_delete_trade_replay_record(self):
        try:
            payload = self.read_json_payload()
            self.write_json(200, delete_trade_replay_record(payload.get("id"), payload.get("sessionId")))
        except Exception as exc:
            self.write_json(400, {"error": str(exc)})

    def random_training_sample(self):
        start_bound = pd.Timestamp("2014-01-01")
        end = pd.Timestamp("2026-06-01")
        candidates = valid_random_replay_symbols(start_bound, end)
        if not candidates:
            raise ValueError("没有可用于随机盲训的缓存行情，请先输入股票代码拉取一次数据。")
        symbol, dates = random.choice(candidates)
        random_day = random.choice(dates)
        return {
            "symbol": symbol,
            "date": pd.Timestamp(random_day).strftime("%Y-%m-%d"),
        }

    def write_json(self, status, data):
        body = json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    server = ThreadingHTTPServer(("127.0.0.1", 8765), TradingAdviceHandler)
    print("Trading advice server running at http://127.0.0.1:8765/")
    server.serve_forever()


if __name__ == "__main__":
    main()
