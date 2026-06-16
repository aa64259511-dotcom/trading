import json
import os
import random
import sqlite3
import time
from contextlib import contextmanager
from concurrent.futures import ThreadPoolExecutor, TimeoutError
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import pandas as pd

try:
    import requests
except ImportError:
    requests = None

from support_resistance_trainer import analyze, fetch_akshare_daily, fetch_akshare_weekly, load_csv, parse_date


RANDOM_SYMBOLS = [
    "000001",
    "000333",
    "000858",
    "002594",
    "300059",
    "300750",
    "600036",
    "600519",
    "600887",
    "601318",
]

RANDOM_SYMBOL_LISTING_DATES = {
    "000001": "1991-04-03",
    "000333": "2013-09-18",
    "000858": "1998-04-27",
    "002594": "2011-06-30",
    "300059": "2010-03-19",
    "300750": "2018-06-11",
    "600036": "2002-04-09",
    "600519": "2001-08-27",
    "600887": "1996-03-12",
    "601318": "2007-03-01",
}

CACHE_DIR = Path("data_cache")
MARKET_DB = Path("market_data.sqlite")
TRADE_REPLAY_DATASET = Path("trade_replay_samples.jsonl")
LEVEL_TRAINING_DATASET = Path("level_training_samples.jsonl")
STOCK_NAME_INDEX = Path("stock_names.json")
MARKET_HISTORY_START = pd.Timestamp("1990-01-01")
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


def fetch_akshare_daily_quick(symbol, start_ts, analysis_ts, timeout=12):
    executor = ThreadPoolExecutor(max_workers=1)
    future = executor.submit(fetch_akshare_daily, symbol, start_ts, analysis_ts)
    try:
        return future.result(timeout=timeout)
    except TimeoutError as exc:
        future.cancel()
        raise RuntimeError(f"AkShare daily data request timed out for {symbol} after {timeout}s") from exc
    finally:
        executor.shutdown(wait=False, cancel_futures=True)


def cache_path(symbol, start_ts, analysis_ts, period):
    CACHE_DIR.mkdir(exist_ok=True)
    return CACHE_DIR / f"{symbol}_{period}_{start_ts.strftime('%Y%m%d')}_{analysis_ts.strftime('%Y%m%d')}.csv"


def eastmoney_market_id(symbol):
    return "1" if symbol.startswith(("5", "6", "9")) else "0"


def market_symbol(symbol):
    return f"sh{symbol}" if symbol.startswith(("5", "6", "9")) else f"sz{symbol}"


def fetch_tencent_daily(symbol, start_ts, analysis_ts):
    if requests is None:
        raise RuntimeError("requests is not installed; Tencent fallback data source is unavailable.")
    session = requests.Session()
    session.trust_env = False
    response = session.get(
        "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get",
        params={
            "param": f"{market_symbol(symbol)},day,{start_ts.strftime('%Y-%m-%d')},{analysis_ts.strftime('%Y-%m-%d')},5000,qfq"
        },
        headers={"User-Agent": "Mozilla/5.0"},
        timeout=8,
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


def fetch_eastmoney_daily(symbol, start_ts, analysis_ts, attempts=3):
    if requests is None:
        raise RuntimeError("requests is not installed; Eastmoney fallback data source is unavailable.")
    last_error = None
    response = None
    success = False
    for attempt in range(1, attempts + 1):
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
                timeout=8,
            )
            response.raise_for_status()
            success = True
            break
        except Exception as exc:
            last_error = exc
            if attempt < attempts:
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


def ensure_market_db():
    if not MARKET_DB.exists():
        raise ValueError("本地行情数据库不存在，请先导入行情数据 market_data.sqlite。")


def market_db_connect():
    ensure_market_db()
    conn = sqlite3.connect(MARKET_DB)
    conn.row_factory = sqlite3.Row
    return conn


def load_local_daily(symbol, start_ts=None, end_ts=None):
    symbol = str(symbol).strip().zfill(6)
    conditions = ["symbol = ?"]
    params = [symbol]
    if start_ts is not None:
        conditions.append("trade_date >= ?")
        params.append(pd.Timestamp(start_ts).strftime("%Y-%m-%d"))
    if end_ts is not None:
        conditions.append("trade_date <= ?")
        params.append(pd.Timestamp(end_ts).strftime("%Y-%m-%d"))
    query = f"""
        SELECT trade_date AS date, open, high, low, close, volume, amount, turnover
        FROM daily_prices
        WHERE {' AND '.join(conditions)}
        ORDER BY trade_date
    """
    with market_db_connect() as conn:
        df = pd.read_sql_query(query, conn, params=params)
    if df.empty:
        raise ValueError(f"本地数据库没有 {symbol} 在指定日期范围内的日线数据。")
    df["date"] = pd.to_datetime(df["date"])
    for column in ["open", "high", "low", "close", "volume", "amount", "turnover"]:
        if column in df.columns:
            df[column] = pd.to_numeric(df[column], errors="coerce")
    return df.dropna(subset=["date", "open", "high", "low", "close"]).reset_index(drop=True)


def local_symbols():
    with market_db_connect() as conn:
        rows = conn.execute("SELECT symbol FROM daily_prices GROUP BY symbol ORDER BY symbol").fetchall()
    return [row["symbol"] for row in rows]


def load_stock_name_index():
    symbols = set(local_symbols())
    records = []
    if STOCK_NAME_INDEX.exists():
        with STOCK_NAME_INDEX.open("r", encoding="utf-8") as handle:
            for item in json.load(handle):
                symbol = str(item.get("symbol", "")).strip().zfill(6)
                if symbol not in symbols:
                    continue
                records.append({
                    "symbol": symbol,
                    "name": str(item.get("name", "")).strip(),
                    "initials": str(item.get("initials", "")).strip().upper(),
                })
    indexed = {item["symbol"] for item in records}
    records.extend({"symbol": symbol, "name": "", "initials": ""} for symbol in sorted(symbols - indexed))
    return records


def search_stock_names(query, limit=20):
    text = str(query or "").strip()
    if not text:
        return {"matches": [], "count": 0}
    upper = text.upper()
    records = load_stock_name_index()
    matches = []
    for item in records:
        symbol = item["symbol"]
        name = item.get("name") or ""
        initials = item.get("initials") or ""
        score = None
        if symbol == text.zfill(6) or symbol.startswith(text):
            score = 0
        elif name == text:
            score = 1
        elif initials == upper:
            score = 2
        elif name.startswith(text):
            score = 3
        elif initials.startswith(upper):
            score = 4
        elif text in name:
            score = 5
        if score is None:
            continue
        matches.append({**item, "displayName": name or symbol, "_score": score})
    matches.sort(key=lambda item: (item["_score"], item["symbol"]))
    limited = [{key: value for key, value in item.items() if key != "_score"} for item in matches[:int(limit)]]
    return {"matches": limited, "count": len(matches)}


def local_trade_dates(symbol, start_bound, end_bound):
    with market_db_connect() as conn:
        rows = conn.execute(
            """
            SELECT trade_date FROM daily_prices
            WHERE symbol = ? AND trade_date >= ? AND trade_date <= ?
            ORDER BY trade_date
            """,
            (str(symbol).zfill(6), pd.Timestamp(start_bound).strftime("%Y-%m-%d"), pd.Timestamp(end_bound).strftime("%Y-%m-%d")),
        ).fetchall()
    return [pd.Timestamp(row["trade_date"]) for row in rows]


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
    except Exception as tencent_error:
        try:
            daily = fetch_eastmoney_daily(symbol, start_ts, analysis_ts, attempts=1)
        except Exception as eastmoney_error:
            raise RuntimeError(f"Tencent daily data request failed for {symbol}: {tencent_error}; Eastmoney daily data request failed for {symbol}: {eastmoney_error}") from eastmoney_error
    if period == "weekly":
        return daily_to_weekly(daily)
    return daily


def fetch_daily_batched(symbol, start_ts, analysis_ts, candles_per_batch=50, max_consecutive_errors=3):
    frames = []
    errors = []
    consecutive_errors = 0
    batch_start = pd.Timestamp(start_ts)
    analysis_ts = pd.Timestamp(analysis_ts)
    batch_days = max(int(candles_per_batch / 5 * 7) + 5, 30)
    while batch_start <= analysis_ts:
        batch_end = min(batch_start + pd.Timedelta(days=batch_days - 1), analysis_ts)
        try:
            frames.append(fetch_direct_fallback(symbol, batch_start, batch_end, "daily"))
            consecutive_errors = 0
        except Exception as exc:
            errors.append(f"{batch_start.strftime('%Y-%m-%d')}~{batch_end.strftime('%Y-%m-%d')}: {exc}")
            consecutive_errors += 1
            if not frames and consecutive_errors >= max_consecutive_errors:
                raise RuntimeError(f"分批拉取日线失败：{'; '.join(errors[-max_consecutive_errors:])}")
        batch_start = batch_end + pd.Timedelta(days=1)
        time.sleep(0.15)
    if not frames:
        raise RuntimeError(f"分批拉取日线失败：{'; '.join(errors[-3:])}")
    merged = pd.concat(frames, ignore_index=True)
    merged = merged.sort_values("date").drop_duplicates(subset=["date"], keep="last").reset_index(drop=True)
    return merged


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


def load_merged_cache(symbol, period, start_ts, analysis_ts):
    frames = []
    for path in cached_paths(symbol, period):
        try:
            df = load_csv(path)
        except Exception:
            continue
        filtered = df[(df["date"] >= start_ts) & (df["date"] <= analysis_ts)].copy()
        if not filtered.empty:
            frames.append(filtered)
    if not frames:
        return None
    merged = pd.concat(frames, ignore_index=True)
    merged = merged.sort_values("date").drop_duplicates(subset=["date"], keep="last")
    return merged.reset_index(drop=True)


def covers_anchor(df, anchor_ts):
    if anchor_ts is None or df.empty:
        return True
    return df["date"].min() <= anchor_ts <= df["date"].max()


def has_history(df, anchor_ts, lookback):
    if anchor_ts is None or df.empty:
        return True
    return len(df[df["date"] <= anchor_ts]) >= int(lookback)


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
    daily_df = load_local_daily(symbol, start_ts, analysis_ts)
    weekly_df = daily_to_weekly(daily_df)
    return daily_df, weekly_df


def trade_replay_payload(symbol, start_date, lookback=700, fresh=False):
    start_ts = parse_date(start_date)
    fetch_end = previous_trading_day()
    daily = load_local_daily(symbol, None, fetch_end)
    daily = daily[daily["date"] <= fetch_end].copy().reset_index(drop=True)
    if daily.empty:
        raise ValueError(f"No daily data for {symbol}.")
    candidates = daily[daily["date"] <= start_ts]
    if candidates.empty:
        raise ValueError("Start date is earlier than available market data.")
    available_history = len(candidates)
    cursor = int(candidates.index[-1])
    history_start = max(0, cursor - int(lookback) + 1)
    history = daily.iloc[history_start:cursor + 1].copy()
    future = daily.iloc[cursor + 1:].copy()
    replay_daily = pd.concat([history, future], ignore_index=True)
    cursor = len(history) - 1
    return {
        "symbol": symbol,
        "startDate": replay_daily.iloc[cursor]["date"].strftime("%Y-%m-%d"),
        "cursor": cursor,
        "position": None,
        "requestedLookback": int(lookback),
        "availableHistory": available_history,
        "historyMode": "lookback" if available_history >= int(lookback) else "all_available",
        "dataSource": "local_sqlite",
        "fresh": False,
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


def save_level_training_sample(payload):
    record = dict(payload)
    record["savedAt"] = pd.Timestamp.now().isoformat()
    with LEVEL_TRAINING_DATASET.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False) + "\n")
    return {"saved": True, "path": str(LEVEL_TRAINING_DATASET)}


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


def safe_number(value, default=None):
    try:
        if value is None or value == "":
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def pct_change(next_price, base_price):
    if next_price is None or not base_price:
        return None
    return (float(next_price) / float(base_price) - 1) * 100


def close_return_at(future_df, entry_price, offset):
    if len(future_df) <= offset or entry_price <= 0:
        return None
    return round(pct_change(future_df.iloc[offset]["close"], entry_price), 2)


def classify_timing(item):
    if item.get("stopLoss") is None or item.get("stopLoss") <= 0:
        return "missing_stop", "缺少止损，无法判断买点是否可执行"
    if item.get("stopLoss") >= item.get("entryPrice"):
        return "invalid_stop", "止损不低于买入价，训练样本需要修正止损"
    if item.get("hitStop20") and (item.get("r20") or 0) > 3:
        return "early_or_tight_stop", "20日后方向仍向上，但先触发止损，偏买早或止损过紧"
    if item.get("hitStop20") and (item.get("mfe20") or 0) >= 8:
        return "early_or_tight_stop", "后续给过较大浮盈，但先触发止损，偏买早或止损过紧"
    if item.get("hitStop20"):
        return "bad_timing", "20日内先触发止损，择时失败概率高"
    if (item.get("r10") or 0) < -3 and (item.get("mfe20") or 0) < 5:
        return "weak_follow_through", "买入后10日仍弱，且后续浮盈不足，延续性不够"
    if (item.get("mae20") or 0) <= -8 and (item.get("mfe20") or 0) >= 8:
        return "wide_swing", "方向有机会但波动过大，需要更好的确认或更宽止损"
    if (item.get("r10") or 0) > 0 and (item.get("mfeR") or 0) >= 2:
        return "good_timing", "买入后较快给出正反馈，并至少接近2R浮盈"
    return "neutral_timing", "结果中性，需要结合形态复盘买点是否可优化"


def trade_replay_timing_quality():
    records = read_trade_replay_records()
    buys = [record for record in records if record.get("action") == "buy"]
    if not buys:
        return {"summary": {"buyCount": 0}, "items": [], "qualityCounts": {}}

    by_symbol = {}
    for record in buys:
        symbol = str(record.get("symbol") or "").strip().zfill(6)
        if not symbol:
            continue
        by_symbol.setdefault(symbol, []).append(record)

    dataframes = {}
    errors = []
    for symbol, symbol_records in by_symbol.items():
        dates = [parse_date(record.get("date")) for record in symbol_records if record.get("date")]
        if not dates:
            continue
        start_ts = min(dates) - pd.DateOffset(days=260)
        end_ts = max(dates) + pd.DateOffset(days=120)
        try:
            dataframes[symbol] = load_local_daily(symbol, start_ts, end_ts)
        except Exception as exc:
            errors.append({"symbol": symbol, "error": str(exc)})

    items = []
    for record in buys:
        symbol = str(record.get("symbol") or "").strip().zfill(6)
        df = dataframes.get(symbol)
        entry_price = safe_number(record.get("price"), 0)
        if df is None or df.empty or entry_price <= 0 or not record.get("date"):
            continue
        entry_ts = parse_date(record.get("date"))
        matches = df.index[df["date"] >= entry_ts].tolist()
        if not matches:
            continue
        start_index = int(matches[0])
        future = df.iloc[start_index:start_index + 21].copy()
        if len(future) < 2:
            continue
        stop_loss = safe_number(record.get("stopLoss"))
        high20 = float(future["high"].max())
        low20 = float(future["low"].min())
        risk = entry_price - stop_loss if stop_loss is not None else None
        mfe = pct_change(high20, entry_price)
        mae = pct_change(low20, entry_price)
        item = {
            "symbol": symbol,
            "date": record.get("date"),
            "entryPrice": round(entry_price, 3),
            "stopLoss": round(stop_loss, 3) if stop_loss is not None else None,
            "stopPct": round((stop_loss / entry_price - 1) * 100, 2) if stop_loss and entry_price else None,
            "r5": close_return_at(future, entry_price, 5),
            "r10": close_return_at(future, entry_price, 10),
            "r20": close_return_at(future, entry_price, 20),
            "mfe20": round(mfe, 2) if mfe is not None else None,
            "mae20": round(mae, 2) if mae is not None else None,
            "mfeR": round((high20 - entry_price) / risk, 2) if risk and risk > 0 else None,
            "maeR": round((low20 - entry_price) / risk, 2) if risk and risk > 0 else None,
            "hitStop20": bool(stop_loss and (future["low"] <= stop_loss).any()),
            "model": record.get("aiAdviceModel") or "人工记录",
            "reason": record.get("reason") or record.get("note") or "",
        }
        quality, quality_reason = classify_timing(item)
        item["quality"] = quality
        item["qualityReason"] = quality_reason
        items.append(item)

    quality_counts = {}
    for item in items:
        quality_counts[item["quality"]] = quality_counts.get(item["quality"], 0) + 1

    def avg(values):
        values = [value for value in values if value is not None]
        return round(sum(values) / len(values), 2) if values else None

    evaluated = len(items)
    hit_stop = sum(1 for item in items if item.get("hitStop20"))
    positive_r10 = sum(1 for item in items if item.get("r10") is not None and item["r10"] > 0)
    positive_r20 = sum(1 for item in items if item.get("r20") is not None and item["r20"] > 0)
    summary = {
        "buyCount": len(buys),
        "evaluatedBuyCount": evaluated,
        "hitStop20Count": hit_stop,
        "hitStop20Rate": round(hit_stop / evaluated * 100, 1) if evaluated else None,
        "positiveR10Rate": round(positive_r10 / evaluated * 100, 1) if evaluated else None,
        "positiveR20Rate": round(positive_r20 / evaluated * 100, 1) if evaluated else None,
        "avgR5": avg([item.get("r5") for item in items]),
        "avgR10": avg([item.get("r10") for item in items]),
        "avgR20": avg([item.get("r20") for item in items]),
        "avgMfe20": avg([item.get("mfe20") for item in items]),
        "avgMae20": avg([item.get("mae20") for item in items]),
    }
    severity = {
        "invalid_stop": 0,
        "missing_stop": 1,
        "bad_timing": 2,
        "early_or_tight_stop": 3,
        "wide_swing": 4,
        "weak_follow_through": 5,
        "neutral_timing": 6,
        "good_timing": 7,
    }
    items.sort(key=lambda item: (severity.get(item["quality"], 9), item.get("r10") if item.get("r10") is not None else 999))
    return {
        "summary": summary,
        "qualityCounts": quality_counts,
        "items": items[:120],
        "errors": errors,
    }


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
    try:
        return local_symbols()
    except Exception:
        if not CACHE_DIR.exists():
            return []
        symbols = {
            path.name.split("_", 1)[0]
            for path in CACHE_DIR.glob("*_daily_*.csv")
            if "_" in path.name
        }
        return sorted(symbols)


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


def cached_symbol_trade_dates_with_history(symbol, start_bound, end_bound, lookback=700):
    dates = cached_symbol_trade_dates(symbol, pd.Timestamp.min, end_bound)
    if not dates:
        return []
    eligible_start_index = min(max(int(lookback) - 1, 0), len(dates) - 1)
    eligible = dates[eligible_start_index:]
    return [date for date in eligible if date >= start_bound]


def valid_random_replay_symbols(start_bound, end_bound):
    symbols = cached_symbols() or RANDOM_SYMBOLS
    valid = []
    for symbol in symbols:
        try:
            dates = local_trade_dates(symbol, start_bound, end_bound)
        except Exception:
            dates = cached_symbol_trade_dates_with_history(symbol, start_bound, end_bound, lookback=700)
        if dates:
            valid.append((symbol, dates))
    return valid


def random_local_training_sample(start_bound, end_bound, min_history=700, symbol_attempts=80):
    start_text = pd.Timestamp(start_bound).strftime("%Y-%m-%d")
    end_text = pd.Timestamp(end_bound).strftime("%Y-%m-%d")
    with market_db_connect() as conn:
        rows = conn.execute(
            """
            SELECT symbol
            FROM daily_prices
            WHERE trade_date <= ?
            GROUP BY symbol
            ORDER BY RANDOM()
            LIMIT ?
            """,
            (end_text, int(symbol_attempts)),
        ).fetchall()
        for row in rows:
            symbol = row["symbol"]
            dates = conn.execute(
                """
                SELECT trade_date
                FROM daily_prices
                WHERE symbol = ? AND trade_date >= ? AND trade_date <= ?
                ORDER BY trade_date
                """,
                (symbol, start_text, end_text),
            ).fetchall()
            date_values = [item["trade_date"] for item in dates]
            if not date_values:
                continue
            if len(date_values) >= int(min_history):
                date_values = date_values[int(min_history) - 1:]
            return symbol, random.choice(date_values)
    return None, None


class TradingAdviceHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/search-stocks":
            params = parse_qs(parsed.query)
            query = (params.get("q") or [""])[0]
            limit = int((params.get("limit") or ["20"])[0])
            self.write_json(200, search_stock_names(query, limit=limit))
            return
        if parsed.path == "/api/random-training-sample":
            self.write_json(200, self.random_training_sample())
            return
        if parsed.path == "/api/trade-replay-records":
            self.write_json(200, trade_replay_records())
            return
        if parsed.path == "/api/trade-replay-datasets":
            self.write_json(200, trade_replay_datasets())
            return
        if parsed.path == "/api/trade-replay-timing-quality":
            self.write_json(200, trade_replay_timing_quality())
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
        if parsed.path == "/api/level-training-sample":
            self.handle_level_training_sample()
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
            fresh = bool(payload.get("fresh"))
            self.write_json(200, trade_replay_payload(symbol, start_date, lookback=lookback, fresh=fresh))
        except Exception as exc:
            self.write_json(400, {"error": str(exc)})

    def handle_trade_replay_decision(self):
        try:
            payload = self.read_json_payload()
            self.write_json(200, save_trade_replay_decision(payload))
        except Exception as exc:
            self.write_json(400, {"error": str(exc)})

    def handle_level_training_sample(self):
        try:
            payload = self.read_json_payload()
            self.write_json(200, save_level_training_sample(payload))
        except Exception as exc:
            self.write_json(400, {"error": str(exc)})

    def handle_delete_trade_replay_record(self):
        try:
            payload = self.read_json_payload()
            self.write_json(200, delete_trade_replay_record(payload.get("id"), payload.get("sessionId")))
        except Exception as exc:
            self.write_json(400, {"error": str(exc)})

    def random_training_sample(self):
        start_bound = pd.Timestamp("2010-01-01")
        one_year_ago = pd.Timestamp.now().normalize() - pd.DateOffset(years=1)
        end = min(pd.Timestamp("2026-06-01"), one_year_ago)
        if end < start_bound:
            raise ValueError("随机盲训没有满足距离当前日期1年以上的可用日期。")
        symbol, random_day = random_local_training_sample(start_bound, end)
        if symbol and random_day:
            return {
                "symbol": symbol,
                "date": pd.Timestamp(random_day).strftime("%Y-%m-%d"),
                "fresh": False,
                "dataSource": "local_sqlite",
            }
        symbols = local_symbols()
        if not symbols:
            raise ValueError("本地行情数据库没有可用于随机盲训的股票。")
        random.shuffle(symbols)
        for symbol in symbols[:80]:
            dates = local_trade_dates(symbol, start_bound, end)
            if not dates:
                continue
            if len(dates) >= 700:
                dates = dates[699:]
            random_day = random.choice(dates)
            return {
                "symbol": symbol,
                "date": pd.Timestamp(random_day).strftime("%Y-%m-%d"),
                "fresh": False,
                "dataSource": "local_sqlite",
            }
        raise ValueError("本地行情数据库没有可用于随机盲训的行情。")

    def write_json(self, status, data):
        body = json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    server = ThreadingHTTPServer(("127.0.0.1", 8765), TradingAdviceHandler)
    print("Trading advice server running at http://127.0.0.1:8765/")
    server.serve_forever()


if __name__ == "__main__":
    main()
