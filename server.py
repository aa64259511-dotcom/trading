import json
import os
import random
import sqlite3
import time
from contextlib import contextmanager
from concurrent.futures import ThreadPoolExecutor, TimeoutError
from functools import lru_cache
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
REALTIME_QUOTE_CACHE = Path("realtime_quotes.json")
REALTIME_WATCHLIST_CACHE = Path("realtime_watchlist.json")
MARKET_HISTORY_START = pd.Timestamp("1990-01-01")
HK_STOCK_NAME_OVERRIDES = {
    "00005": "汇丰控股",
    "00016": "新鸿基地产",
    "00027": "银河娱乐",
    "00066": "港铁公司",
    "00175": "吉利汽车",
    "00241": "阿里健康",
    "00267": "中信股份",
    "00288": "万洲国际",
    "00386": "中国石油化工股份",
    "00669": "创科实业",
    "00700": "腾讯控股",
    "00728": "中国电信",
    "00762": "中国联通",
    "00857": "中国石油股份",
    "00883": "中国海洋石油",
    "00939": "建设银行",
    "00941": "中国移动",
    "00992": "联想集团",
    "01024": "快手-W",
    "01088": "中国神华",
    "01211": "比亚迪股份",
    "01299": "友邦保险",
    "01398": "工商银行",
    "01810": "小米集团-W",
    "01818": "招金矿业",
    "01876": "百威亚太",
    "01918": "融创中国",
    "02015": "理想汽车-W",
    "02020": "安踏体育",
    "02269": "药明生物",
    "02318": "中国平安",
    "02319": "蒙牛乳业",
    "02331": "李宁",
    "02333": "长城汽车",
    "02382": "舜宇光学科技",
    "02628": "中国人寿",
    "02800": "盈富基金",
    "02828": "恒生中国企业",
    "02899": "紫金矿业",
    "03690": "美团-W",
    "03968": "招商银行",
    "03988": "中国银行",
    "06030": "中信证券",
    "06618": "京东健康",
    "06690": "海尔智家",
    "09868": "小鹏汽车-W",
    "09888": "百度集团-SW",
    "09961": "携程集团-S",
    "09988": "阿里巴巴-W",
    "09999": "网易-S",
}
HK_STOCK_NAME_OVERRIDES.update({
    "00700": "\u817e\u8baf\u63a7\u80a1",
    "00941": "\u4e2d\u56fd\u79fb\u52a8",
    "01810": "\u5c0f\u7c73\u96c6\u56e2-W",
    "03690": "\u7f8e\u56e2-W",
    "09988": "\u963f\u91cc\u5df4\u5df4-W",
    "09999": "\u7f51\u6613-S",
})
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


def normalize_security_symbol(symbol, market=None):
    text = str(symbol or "").strip().upper().replace(" ", "")
    market_hint = str(market or "").strip().lower()
    if not text:
        raise ValueError("symbol is required")

    explicit_hk = market_hint in {"hk", "hongkong", "hkg", "港股"}
    if text.startswith("31#"):
        explicit_hk = True
        code = text.split("#", 1)[1]
        raw_code = text
    else:
        raw_code = ""
        code = text
        for prefix in ("HK:", "HK.", "HK-", "HK_"):
            if code.startswith(prefix):
                explicit_hk = True
                code = code[len(prefix):]
                break
        if code.startswith("HK") and code[2:].isdigit():
            explicit_hk = True
            code = code[2:]
        for suffix in (".HK", "-HK", "_HK", ":HK"):
            if code.endswith(suffix):
                explicit_hk = True
                code = code[:-len(suffix)]
                break
        for suffix in (".SH", ".SZ", ".BJ"):
            if code.endswith(suffix):
                code = code[:-len(suffix)]
                break
        if "#" in code:
            prefix, tail = code.split("#", 1)
            explicit_hk = explicit_hk or prefix == "31"
            raw_code = code
            code = tail

    if explicit_hk or (code.isdigit() and len(code) == 5):
        hk_symbol = code.zfill(5) if code.isdigit() else code
        return {
            "market": "hk",
            "symbol": hk_symbol,
            "raw_code": raw_code or f"31#{hk_symbol}",
            "display": f"HK:{hk_symbol}",
            "table": "hk_daily_prices",
        }

    cn_symbol = code.zfill(6) if code.isdigit() else code
    return {
        "market": "cn",
        "symbol": cn_symbol,
        "raw_code": "",
        "display": cn_symbol,
        "table": "daily_prices",
    }


def load_local_daily(symbol, start_ts=None, end_ts=None, market=None):
    info = normalize_security_symbol(symbol, market)
    conditions = ["symbol = ?"]
    params = [info["symbol"]]
    if info["market"] == "hk" and info["raw_code"]:
        conditions = ["(symbol = ? OR raw_code = ?)"]
        params = [info["symbol"], info["raw_code"]]
    if start_ts is not None:
        conditions.append("trade_date >= ?")
        params.append(pd.Timestamp(start_ts).strftime("%Y-%m-%d"))
    if end_ts is not None:
        conditions.append("trade_date <= ?")
        params.append(pd.Timestamp(end_ts).strftime("%Y-%m-%d"))
    table = info["table"]
    query = f"""
        SELECT trade_date AS date, open, high, low, close, volume, amount, turnover
        FROM {table}
        WHERE {' AND '.join(conditions)}
        ORDER BY trade_date
    """
    with market_db_connect() as conn:
        df = pd.read_sql_query(query, conn, params=params)
    if df.empty:
        raise ValueError(f"本地数据库没有 {info['display']} 在指定日期范围内的日线数据。")
    df["date"] = pd.to_datetime(df["date"])
    for column in ["open", "high", "low", "close", "volume", "amount", "turnover"]:
        if column in df.columns:
            df[column] = pd.to_numeric(df[column], errors="coerce")
    df["market"] = info["market"]
    df["symbol"] = info["symbol"]
    return df.dropna(subset=["date", "open", "high", "low", "close"]).reset_index(drop=True)


def load_local_minute(symbol, start_ts=None, end_ts=None, market=None, period="5m"):
    info = normalize_security_symbol(symbol, market)
    if info["market"] != "cn":
        return pd.DataFrame(columns=["date", "tradeDate", "open", "high", "low", "close", "volume", "amount", "market", "symbol"])
    conditions = ["symbol = ?", "period = ?"]
    params = [info["symbol"], period]
    if start_ts is not None:
        conditions.append("trade_date >= ?")
        params.append(pd.Timestamp(start_ts).strftime("%Y-%m-%d"))
    if end_ts is not None:
        conditions.append("trade_date <= ?")
        params.append(pd.Timestamp(end_ts).strftime("%Y-%m-%d"))
    query = f"""
        SELECT trade_time AS date, trade_date AS tradeDate, open, high, low, close, volume, amount
        FROM minute_prices
        WHERE {' AND '.join(conditions)}
        ORDER BY trade_time
    """
    try:
        with market_db_connect() as conn:
            df = pd.read_sql_query(query, conn, params=params)
    except (sqlite3.OperationalError, ValueError):
        return pd.DataFrame(columns=["date", "tradeDate", "open", "high", "low", "close", "volume", "amount", "market", "symbol"])
    if df.empty:
        return df
    df["date"] = pd.to_datetime(df["date"])
    df["tradeDate"] = df["tradeDate"].astype(str)
    for column in ["open", "high", "low", "close", "volume", "amount"]:
        if column in df.columns:
            df[column] = pd.to_numeric(df[column], errors="coerce")
    df["market"] = info["market"]
    df["symbol"] = info["symbol"]
    return df.dropna(subset=["date", "open", "high", "low", "close"]).reset_index(drop=True)


def aggregate_minute_bars(df, bars_per_group):
    if df.empty:
        return df.copy()
    rows = []
    for _, day_df in df.sort_values("date").groupby("tradeDate", sort=True):
        day_df = day_df.reset_index(drop=True)
        grouped = day_df.assign(_bucket=day_df.index // int(bars_per_group)).groupby("_bucket", as_index=False)
        agg = grouped.agg({
            "date": "last",
            "tradeDate": "last",
            "open": "first",
            "high": "max",
            "low": "min",
            "close": "last",
            "volume": "sum",
            "amount": "sum",
            "market": "last",
            "symbol": "last",
        })
        rows.append(agg.drop(columns=["_bucket"], errors="ignore"))
    return pd.concat(rows, ignore_index=True) if rows else df.iloc[0:0].copy()


def latest_local_trade_day(symbol, market=None):
    info = normalize_security_symbol(symbol, market)
    conditions = ["symbol = ?"]
    params = [info["symbol"]]
    if info["market"] == "hk" and info["raw_code"]:
        conditions = ["(symbol = ? OR raw_code = ?)"]
        params = [info["symbol"], info["raw_code"]]
    with market_db_connect() as conn:
        row = conn.execute(
            f"""
            SELECT MAX(trade_date) AS trade_date
            FROM {info['table']}
            WHERE {' AND '.join(conditions)}
            """,
            params,
        ).fetchone()
    if not row or not row["trade_date"]:
        raise ValueError(f"No local daily data for {info['display']}.")
    return pd.Timestamp(row["trade_date"])


def safe_float(value, default=None):
    try:
        if value is None or value == "":
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def quote_date(value=None):
    if value in (None, ""):
        return pd.Timestamp.now().strftime("%Y-%m-%d")
    text = str(value).strip()
    digits = "".join(ch for ch in text if ch.isdigit())
    if len(digits) >= 14:
        return f"{digits[:4]}-{digits[4:6]}-{digits[6:8]}"
    if len(digits) == 13:
        return pd.Timestamp.fromtimestamp(int(digits) / 1000).strftime("%Y-%m-%d")
    if len(digits) == 10:
        return pd.Timestamp.fromtimestamp(int(digits)).strftime("%Y-%m-%d")
    if len(digits) >= 8:
        return f"{digits[:4]}-{digits[4:6]}-{digits[6:8]}"
    parsed = pd.to_datetime(text, errors="coerce")
    return pd.Timestamp.now().strftime("%Y-%m-%d") if pd.isna(parsed) else parsed.strftime("%Y-%m-%d")


def realtime_key(symbol, market=None):
    info = normalize_security_symbol(symbol, market)
    return f"{info['market']}:{info['symbol']}", info


def load_realtime_quotes():
    if not REALTIME_QUOTE_CACHE.exists():
        return {}
    try:
        with REALTIME_QUOTE_CACHE.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def save_realtime_quotes(quotes):
    with REALTIME_QUOTE_CACHE.open("w", encoding="utf-8") as handle:
        json.dump(quotes, handle, ensure_ascii=False, indent=2)


def row_get(row, *keys):
    if not isinstance(row, dict):
        return None
    for key in keys:
        if key in row and row[key] not in (None, ""):
            return row[key]
    return None


@lru_cache(maxsize=2048)
def local_volume_unit_factor(symbol, market=None):
    info = normalize_security_symbol(symbol, market)
    try:
        with market_db_connect() as conn:
            rows = conn.execute(
                f"""
                SELECT close, volume, amount
                FROM {info['table']}
                WHERE symbol = ? AND close > 0 AND volume > 0 AND amount > 0
                ORDER BY trade_date DESC
                LIMIT 20
                """,
                (info["symbol"],),
            ).fetchall()
    except Exception:
        return 1.0
    factors = []
    for row in rows:
        close = safe_float(row["close"])
        volume = safe_float(row["volume"])
        amount = safe_float(row["amount"])
        if close and volume and amount:
            factors.append(amount / close / volume)
    if not factors:
        return 1.0
    factors = sorted(value for value in factors if value > 0)
    if not factors:
        return 1.0
    return float(factors[len(factors) // 2])


def normalize_realtime_volume(info, row, close):
    raw_volume = safe_float(row_get(row, "volume", "vol"), 0)
    amount = safe_float(row_get(row, "amount"), 0)
    if not raw_volume or not amount or not close:
        return raw_volume, raw_volume
    local_factor = local_volume_unit_factor(info["symbol"], info["market"])
    if not local_factor:
        return raw_volume, raw_volume
    implied_shares = amount / close
    # QMT returns different volume units by market; align realtime bars to the
    # local daily table unit so the volume pane stays comparable.
    return implied_shares / local_factor, raw_volume


def normalize_realtime_quote(symbol, row=None, market=None):
    row = row or {}
    code = row_get(row, "symbol", "stock_code", "code", "instrument") or symbol
    info = normalize_security_symbol(code, row_get(row, "market") or market)
    close = safe_float(row_get(row, "close", "lastPrice", "last_price", "price", "latest", "last"))
    open_price = safe_float(row_get(row, "open"), close)
    high = safe_float(row_get(row, "high"), close)
    low = safe_float(row_get(row, "low"), close)
    if close is None or open_price is None or high is None or low is None:
        raise ValueError(f"实时行情缺少 OHLC/最新价字段：{info['display']}")
    trade_date = quote_date(row_get(row, "trade_date", "date", "stime", "time", "timetag", "datetime"))
    normalized_volume, raw_volume = normalize_realtime_volume(info, row, close)
    quote = {
        "symbol": info["symbol"],
        "market": info["market"],
        "displaySymbol": info["display"],
        "trade_date": trade_date,
        "open": open_price,
        "high": max(high, open_price, close, low),
        "low": min(low, open_price, close, high),
        "close": close,
        "volume": normalized_volume,
        "rawVolume": raw_volume,
        "amount": safe_float(row_get(row, "amount"), 0),
        "turnover": safe_float(row_get(row, "turnover")),
        "source": str(row_get(row, "source") or "qmt_realtime"),
        "receivedAt": pd.Timestamp.now().isoformat(),
    }
    key, _ = realtime_key(info["symbol"], info["market"])
    return key, quote


def flatten_realtime_payload(payload):
    if isinstance(payload, list):
        for item in payload:
            if isinstance(item, dict):
                yield row_get(item, "symbol", "stock_code", "code", "instrument"), item
        return
    if not isinstance(payload, dict):
        return
    if "quotes" in payload:
        yield from flatten_realtime_payload(payload.get("quotes"))
        return
    if row_get(payload, "symbol", "stock_code", "code", "instrument"):
        yield row_get(payload, "symbol", "stock_code", "code", "instrument"), payload
        return
    for symbol, row in payload.items():
        if isinstance(row, dict):
            yield symbol, row


def save_realtime_payload(payload):
    quotes = load_realtime_quotes()
    saved = []
    for symbol, row in flatten_realtime_payload(payload):
        if not symbol:
            continue
        key, quote = normalize_realtime_quote(symbol, row)
        quotes[key] = quote
        saved.append(quote)
    if saved:
        save_realtime_quotes(quotes)
    return {"saved": len(saved), "quotes": saved}


def realtime_quote(symbol, market=None):
    key, info = realtime_key(symbol, market)
    quote = load_realtime_quotes().get(key)
    if not quote:
        return {"symbol": info["symbol"], "market": info["market"], "displaySymbol": info["display"], "quote": None}
    return {"symbol": info["symbol"], "market": info["market"], "displaySymbol": info["display"], "quote": quote}


def normalize_realtime_watch_item(symbol, market=None, meta=None):
    meta = meta or {}
    info = normalize_security_symbol(symbol, market)
    return {
        "symbol": info["symbol"],
        "market": info["market"],
        "displaySymbol": meta.get("displaySymbol") or info["display"],
        "name": str(meta.get("name") or "").strip(),
        "updatedAt": pd.Timestamp.now().isoformat(),
    }


def load_realtime_watchlist():
    if not REALTIME_WATCHLIST_CACHE.exists():
        return {"current": None, "symbols": []}
    try:
        with REALTIME_WATCHLIST_CACHE.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except Exception:
        return {"current": None, "symbols": []}
    if not isinstance(payload, dict):
        return {"current": None, "symbols": []}
    symbols = payload.get("symbols")
    if not isinstance(symbols, list):
        symbols = []
    return {
        "current": payload.get("current") if isinstance(payload.get("current"), dict) else None,
        "symbols": [item for item in symbols if isinstance(item, dict)],
    }


def save_realtime_watchlist(payload):
    existing = load_realtime_watchlist()
    items = []
    if isinstance(payload, dict) and isinstance(payload.get("symbols"), list):
        for item in payload.get("symbols"):
            if not isinstance(item, dict):
                continue
            code = row_get(item, "symbol", "stock_code", "code", "instrument")
            if code:
                items.append(normalize_realtime_watch_item(code, item.get("market"), item))
    elif isinstance(payload, dict):
        code = row_get(payload, "symbol", "stock_code", "code", "instrument")
        if code:
            items.append(normalize_realtime_watch_item(code, payload.get("market"), payload))
    allow_empty = isinstance(payload, dict) and isinstance(payload.get("symbols"), list)
    if not items and not allow_empty:
        raise ValueError("symbol is required")

    replace = not isinstance(payload, dict) or payload.get("replace", True)
    merged = items if replace else items + existing.get("symbols", [])
    deduped = []
    seen = set()
    for item in merged:
        key = f"{item['market']}:{item['symbol']}"
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    result = {
        "current": deduped[0] if deduped else None,
        "symbols": deduped[:20],
        "updatedAt": pd.Timestamp.now().isoformat(),
    }
    with REALTIME_WATCHLIST_CACHE.open("w", encoding="utf-8") as handle:
        json.dump(result, handle, ensure_ascii=False, indent=2)
    return result


def remember_realtime_symbol(symbol, market=None, meta=None):
    try:
        payload = {"symbol": symbol, "market": market, "replace": True}
        if meta:
            payload.update(meta)
        return save_realtime_watchlist(payload)
    except Exception:
        return None


def append_realtime_daily(daily, symbol, market=None):
    quote = realtime_quote(symbol, market).get("quote")
    if not quote:
        return daily, None
    quote_ts = pd.Timestamp(quote["trade_date"])
    last_ts = daily["date"].max() if not daily.empty else None
    if last_ts is not None and quote_ts < pd.Timestamp(last_ts):
        return daily, None
    row = {
        "date": quote_ts,
        "open": quote["open"],
        "high": quote["high"],
        "low": quote["low"],
        "close": quote["close"],
        "volume": quote.get("volume") or 0,
        "amount": quote.get("amount") or 0,
        "turnover": quote.get("turnover"),
        "market": quote.get("market"),
        "symbol": quote.get("symbol"),
        "realtime": True,
    }
    result = daily.copy()
    if last_ts is not None and quote_ts == pd.Timestamp(last_ts):
        result = result[result["date"] < quote_ts].copy()
    result = pd.concat([result, pd.DataFrame([row])], ignore_index=True)
    return result.sort_values("date").reset_index(drop=True), quote


def latest_available_trade_day(symbol, market=None):
    latest = latest_local_trade_day(symbol, market=market)
    quote = realtime_quote(symbol, market=market).get("quote")
    if quote:
        quote_ts = pd.Timestamp(quote["trade_date"])
        if quote_ts > latest:
            return quote_ts
    return latest


def local_symbols(include_hk=True):
    with market_db_connect() as conn:
        rows = conn.execute("SELECT symbol FROM daily_prices GROUP BY symbol ORDER BY symbol").fetchall()
        symbols = [row["symbol"] for row in rows]
        if include_hk:
            try:
                hk_rows = conn.execute("SELECT symbol FROM hk_daily_prices GROUP BY symbol ORDER BY symbol").fetchall()
                symbols.extend(row["symbol"] for row in hk_rows)
            except sqlite3.OperationalError:
                pass
    return symbols


def load_stock_name_index():
    symbols = set(local_symbols())
    records = []
    if STOCK_NAME_INDEX.exists():
        with STOCK_NAME_INDEX.open("r", encoding="utf-8") as handle:
            for item in json.load(handle):
                info = normalize_security_symbol(item.get("symbol", ""))
                symbol = info["symbol"]
                if symbol not in symbols:
                    continue
                name = HK_STOCK_NAME_OVERRIDES.get(symbol, "") if info["market"] == "hk" else str(item.get("name", "")).strip()
                records.append({
                    "symbol": symbol,
                    "market": info["market"],
                    "displaySymbol": info["display"],
                    "name": name,
                    "initials": str(item.get("initials", "")).strip().upper(),
                })
    indexed = {f"{item['market']}:{item['symbol']}" for item in records}
    records.extend({
        "symbol": symbol,
        "market": "hk" if len(symbol) == 5 else "cn",
        "displaySymbol": f"HK:{symbol}" if len(symbol) == 5 else symbol,
        "name": HK_STOCK_NAME_OVERRIDES.get(symbol, "") if len(symbol) == 5 else "",
        "initials": "",
    } for symbol in sorted(symbols) if f"{'hk' if len(symbol) == 5 else 'cn'}:{symbol}" not in indexed)
    return records


def security_display_name(symbol, market=None):
    info = normalize_security_symbol(symbol, market)
    if info["market"] == "hk":
        return HK_STOCK_NAME_OVERRIDES.get(info["symbol"], "")
    if STOCK_NAME_INDEX.exists():
        try:
            with STOCK_NAME_INDEX.open("r", encoding="utf-8") as handle:
                for item in json.load(handle):
                    if normalize_security_symbol(item.get("symbol", ""))["symbol"] == info["symbol"]:
                        return str(item.get("name", "")).strip()
        except Exception:
            return ""
    return ""


def search_stock_names(query, limit=20):
    text = str(query or "").strip()
    if not text:
        return {"matches": [], "count": 0}
    upper = text.upper()
    records = load_stock_name_index()
    matches = []
    for item in records:
        symbol = item["symbol"]
        display_symbol = item.get("displaySymbol") or symbol
        name = item.get("name") or ""
        initials = item.get("initials") or ""
        score = None
        try:
            normalized = normalize_security_symbol(text)
        except Exception:
            normalized = None
        if normalized and item.get("market") == normalized.get("market") and symbol == normalized.get("symbol"):
            score = 0
        elif symbol.startswith(text) or display_symbol.upper().startswith(upper):
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


def stock_name_lookup():
    lookup = {}
    for item in load_stock_name_index():
        key = f"{item.get('market') or 'cn'}:{item.get('symbol')}"
        lookup[key] = item
    return lookup


def market_watchlist_snapshot(items):
    names = stock_name_lookup()
    results = []
    with market_db_connect() as conn:
        for item in items or []:
            raw_symbol = item.get("symbol") if isinstance(item, dict) else item
            raw_market = item.get("market") if isinstance(item, dict) else None
            if not raw_symbol:
                continue
            info = normalize_security_symbol(raw_symbol, raw_market)
            conditions = ["symbol = ?"]
            params = [info["symbol"]]
            if info["market"] == "hk" and info["raw_code"]:
                conditions = ["(symbol = ? OR raw_code = ?)"]
                params = [info["symbol"], info["raw_code"]]
            rows = conn.execute(
                f"""
                SELECT trade_date, close
                FROM {info['table']}
                WHERE {' AND '.join(conditions)}
                ORDER BY trade_date DESC
                LIMIT 2
                """,
                params,
            ).fetchall()
            latest = rows[0] if rows else None
            previous = rows[1] if len(rows) > 1 else None
            latest_close = safe_float(latest["close"]) if latest else None
            previous_close = safe_float(previous["close"]) if previous else None
            change_pct = None
            if latest_close is not None and previous_close and previous_close > 0:
                change_pct = (latest_close - previous_close) / previous_close * 100
            name_item = names.get(f"{info['market']}:{info['symbol']}", {})
            results.append({
                "symbol": info["symbol"],
                "market": info["market"],
                "displaySymbol": info["display"],
                "name": (item.get("name") if isinstance(item, dict) else "") or name_item.get("name") or security_display_name(info["symbol"], info["market"]),
                "initials": name_item.get("initials") or "",
                "latestDate": latest["trade_date"] if latest else "",
                "latestClose": latest_close,
                "previousClose": previous_close,
                "changePct": change_pct,
            })
    return {"items": results}


def local_trade_dates(symbol, start_bound, end_bound, market=None):
    info = normalize_security_symbol(symbol, market)
    conditions = ["symbol = ?"]
    params = [info["symbol"]]
    if info["market"] == "hk" and info["raw_code"]:
        conditions = ["(symbol = ? OR raw_code = ?)"]
        params = [info["symbol"], info["raw_code"]]
    conditions.extend(["trade_date >= ?", "trade_date <= ?"])
    params.extend([pd.Timestamp(start_bound).strftime("%Y-%m-%d"), pd.Timestamp(end_bound).strftime("%Y-%m-%d")])
    with market_db_connect() as conn:
        rows = conn.execute(
            f"""
            SELECT trade_date FROM {info['table']}
            WHERE {' AND '.join(conditions)}
            ORDER BY trade_date
            """,
            params,
        ).fetchall()
    return [pd.Timestamp(row["trade_date"]) for row in rows]


def candles_to_records(df):
    records = []
    for _, row in df.iterrows():
        record = {
            "date": row["date"].strftime("%Y-%m-%d"),
            "open": round(float(row["open"]), 3),
            "high": round(float(row["high"]), 3),
            "low": round(float(row["low"]), 3),
            "close": round(float(row["close"]), 3),
            "volume": round(float(row.get("volume", 0)), 3),
        }
        if bool(row.get("realtime", False)):
            record["realtime"] = True
        records.append(record)
    return records


def minute_candles_to_records(df):
    records = []
    for _, row in df.iterrows():
        date_value = pd.Timestamp(row["date"])
        trade_date = str(row.get("tradeDate") or date_value.strftime("%Y-%m-%d"))
        records.append({
            "date": date_value.strftime("%Y-%m-%d %H:%M"),
            "tradeDate": trade_date,
            "time": date_value.strftime("%H:%M"),
            "open": round(float(row["open"]), 3),
            "high": round(float(row["high"]), 3),
            "low": round(float(row["low"]), 3),
            "close": round(float(row["close"]), 3),
            "volume": round(float(row.get("volume", 0)), 3),
            "amount": round(float(row.get("amount", 0)), 3),
        })
    return records


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


def fetch_market_data(symbol, analysis_ts, years=3, market=None, include_realtime=False):
    start_ts = analysis_ts - pd.DateOffset(years=years + 1)
    daily_df = load_local_daily(symbol, start_ts, analysis_ts, market=market)
    if include_realtime:
        daily_df, _ = append_realtime_daily(daily_df, symbol, market=market)
    daily_df = daily_df[daily_df["date"] <= pd.Timestamp(analysis_ts)].copy().reset_index(drop=True)
    weekly_df = daily_to_weekly(daily_df)
    return daily_df, weekly_df


def trade_replay_payload(symbol, start_date, lookback=700, fresh=False, market=None, include_realtime=False):
    info = normalize_security_symbol(symbol, market)
    start_ts = parse_date(start_date)
    fetch_end = latest_local_trade_day(info["symbol"], market=info["market"])
    daily = load_local_daily(info["symbol"], None, fetch_end, market=info["market"])
    realtime = None
    if include_realtime:
        daily, realtime = append_realtime_daily(daily, info["symbol"], info["market"])
    daily = daily[daily["date"] <= fetch_end].copy().reset_index(drop=True)
    if realtime:
        realtime_ts = pd.Timestamp(realtime["trade_date"])
        if realtime_ts > fetch_end:
            quote_row = {
                "date": realtime_ts,
                "open": realtime["open"],
                "high": realtime["high"],
                "low": realtime["low"],
                "close": realtime["close"],
                "volume": realtime.get("volume") or 0,
                "amount": realtime.get("amount") or 0,
                "turnover": realtime.get("turnover"),
                "market": realtime.get("market"),
                "symbol": realtime.get("symbol"),
                "realtime": True,
            }
            daily = pd.concat([daily, pd.DataFrame([quote_row])], ignore_index=True)
            daily = daily.sort_values("date").reset_index(drop=True)
    if daily.empty:
        raise ValueError(f"No daily data for {info['display']}.")
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
    minute_start = replay_daily.iloc[0]["date"] if not replay_daily.empty else start_ts
    minute_end = replay_daily.iloc[-1]["date"] if not replay_daily.empty else fetch_end
    minute_5m = load_local_minute(info["symbol"], minute_start, minute_end, market=info["market"], period="5m")
    minute_30m = aggregate_minute_bars(minute_5m, 6)
    minute_60m = aggregate_minute_bars(minute_5m, 12)
    return {
        "symbol": info["symbol"],
        "market": info["market"],
        "displaySymbol": info["display"],
        "name": security_display_name(info["symbol"], info["market"]),
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
            "5m": minute_candles_to_records(minute_5m),
            "30m": minute_candles_to_records(minute_30m),
            "60m": minute_candles_to_records(minute_60m),
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
            try:
                info = normalize_security_symbol(record.get("symbol"), record.get("market"))
            except Exception:
                info = {"symbol": record.get("symbol"), "market": record.get("market") or "cn", "display": record.get("displaySymbol") or record.get("symbol")}
            groups[session_id] = {
                "id": session_id,
                "symbol": info["symbol"],
                "market": info["market"],
                "displaySymbol": info["display"],
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
        try:
            info = normalize_security_symbol(record.get("symbol"), record.get("market"))
        except Exception:
            continue
        key = f"{info['market']}:{info['symbol']}"
        by_symbol.setdefault(key, {"info": info, "records": []})["records"].append(record)

    dataframes = {}
    errors = []
    for key, group in by_symbol.items():
        info = group["info"]
        symbol_records = group["records"]
        dates = [parse_date(record.get("date")) for record in symbol_records if record.get("date")]
        if not dates:
            continue
        start_ts = min(dates) - pd.DateOffset(days=260)
        end_ts = max(dates) + pd.DateOffset(days=120)
        try:
            dataframes[key] = load_local_daily(info["symbol"], start_ts, end_ts, market=info["market"])
        except Exception as exc:
            errors.append({"symbol": info["display"], "error": str(exc)})

    items = []
    for record in buys:
        try:
            info = normalize_security_symbol(record.get("symbol"), record.get("market"))
        except Exception:
            continue
        key = f"{info['market']}:{info['symbol']}"
        df = dataframes.get(key)
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
            "symbol": info["symbol"],
            "market": info["market"],
            "displaySymbol": info["display"],
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


def buy_analysis(symbol, analysis_date, corrections, market=None, include_realtime=False):
    analysis_ts = parse_date(analysis_date)
    info = normalize_security_symbol(symbol, market)
    daily_df, weekly_df = fetch_market_data(
        info["symbol"],
        analysis_ts,
        years=3,
        market=info["market"],
        include_realtime=include_realtime,
    )
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
        "symbol": info["symbol"],
        "market": info["market"],
        "displaySymbol": info["display"],
        "name": security_display_name(info["symbol"], info["market"]),
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
            SELECT symbol, 'cn' AS market
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
            market = row["market"]
            table = "hk_daily_prices" if market == "hk" else "daily_prices"
            dates = conn.execute(
                f"""
                SELECT trade_date
                FROM {table}
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
            return normalize_security_symbol(symbol, market), random.choice(date_values)
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
        if parsed.path == "/api/realtime-quote":
            self.handle_get_realtime_quote(parsed)
            return
        if parsed.path == "/api/realtime-watchlist":
            self.write_json(200, load_realtime_watchlist())
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
        if parsed.path == "/api/realtime-quote":
            self.handle_realtime_quote()
            return
        if parsed.path == "/api/realtime-watchlist":
            self.handle_realtime_watchlist()
            return
        if parsed.path == "/api/market-watchlist-snapshot":
            self.handle_market_watchlist_snapshot()
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
            include_realtime = bool(payload.get("includeRealtime"))
            if not analysis_date:
                latest_day = latest_available_trade_day(symbol, market=payload.get("market")) if include_realtime else latest_local_trade_day(symbol, market=payload.get("market"))
                analysis_date = latest_day.strftime("%Y-%m-%d")
            corrections = {
                "support": float(payload.get("supportCorrection") or 0),
                "resistance": float(payload.get("resistanceCorrection") or 0),
            }
            self.write_json(200, buy_analysis(symbol, analysis_date, corrections, market=payload.get("market"), include_realtime=include_realtime))
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
                analysis_date = latest_local_trade_day(symbol, market=payload.get("market")).strftime("%Y-%m-%d")

            analysis_ts = parse_date(analysis_date)
            years = int(payload.get("years", 3))
            market = payload.get("market")
            info = normalize_security_symbol(symbol, market)
            daily_df, df = fetch_market_data(info["symbol"], analysis_ts, years=years, market=info["market"])
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
            result["symbol"] = info["symbol"]
            result["market"] = info["market"]
            result["displaySymbol"] = info["display"]
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
            include_realtime = bool(payload.get("includeRealtime"))
            if not start_date:
                latest_day = latest_available_trade_day(symbol, market=payload.get("market")) if include_realtime else latest_local_trade_day(symbol, market=payload.get("market"))
                start_date = latest_day.strftime("%Y-%m-%d")
            lookback = int(payload.get("lookback", 700))
            fresh = bool(payload.get("fresh"))
            self.write_json(200, trade_replay_payload(symbol, start_date, lookback=lookback, fresh=fresh, market=payload.get("market"), include_realtime=include_realtime))
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

    def handle_get_realtime_quote(self, parsed):
        try:
            params = parse_qs(parsed.query)
            symbol = (params.get("symbol") or [""])[0]
            market = (params.get("market") or [None])[0]
            if symbol:
                self.write_json(200, realtime_quote(symbol, market=market))
            else:
                self.write_json(200, {"quotes": load_realtime_quotes()})
        except Exception as exc:
            self.write_json(400, {"error": str(exc)})

    def handle_realtime_quote(self):
        try:
            payload = self.read_json_payload()
            self.write_json(200, save_realtime_payload(payload))
        except Exception as exc:
            self.write_json(400, {"error": str(exc)})

    def handle_realtime_watchlist(self):
        try:
            payload = self.read_json_payload()
            self.write_json(200, save_realtime_watchlist(payload))
        except Exception as exc:
            self.write_json(400, {"error": str(exc)})

    def handle_market_watchlist_snapshot(self):
        try:
            payload = self.read_json_payload()
            self.write_json(200, market_watchlist_snapshot(payload.get("symbols") or payload.get("items") or []))
        except Exception as exc:
            self.write_json(400, {"error": str(exc)})

    def random_training_sample(self):
        start_bound = pd.Timestamp("2010-01-01")
        one_year_ago = pd.Timestamp.now().normalize() - pd.DateOffset(years=1)
        end = min(pd.Timestamp("2026-06-01"), one_year_ago)
        if end < start_bound:
            raise ValueError("随机盲训没有满足距离当前日期1年以上的可用日期。")
        info, random_day = random_local_training_sample(start_bound, end)
        if info and random_day:
            return {
                "symbol": info["symbol"],
                "market": info["market"],
                "displaySymbol": info["display"],
                "date": pd.Timestamp(random_day).strftime("%Y-%m-%d"),
                "fresh": False,
                "dataSource": "local_sqlite",
            }
        symbols = local_symbols(include_hk=False)
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
            info = normalize_security_symbol(symbol)
            return {
                "symbol": info["symbol"],
                "market": info["market"],
                "displaySymbol": info["display"],
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
