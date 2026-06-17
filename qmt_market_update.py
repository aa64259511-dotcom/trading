"""
Update market_data.sqlite from QMT/xtquant daily bars.

Run with the QMT bundled Python, for example:
D:\国金QMT交易端模拟\bin.x64\python.exe qmt_market_update.py --start 20260617

The script updates:
- daily_prices for A shares
- hk_daily_prices for Hong Kong stocks already present in the local DB or passed
  as 09988 / HK:09988 / 09988.HK / 31#09988

QMT history updates should be done by download_history_data first. This script
then reads only the requested date range from the local QMT cache and writes it
to SQLite; it does not use realtime tick snapshots as a substitute for history.
"""

import argparse
import sqlite3
from datetime import datetime
from pathlib import Path

import pandas as pd


DEFAULT_DB = Path("market_data.sqlite")
DEFAULT_FIELDS = ["time", "open", "high", "low", "close", "volume", "amount", "suspendFlag"]
HK_VOLUME_DEFAULT_UNIT = 100.0


def normalize_symbol(symbol):
    raw = str(symbol or "").strip().upper()
    if not raw:
        return ""
    if raw.startswith("HK:"):
        raw = raw.split(":", 1)[1]
    if raw.startswith("31#"):
        raw = raw.split("#", 1)[1]
    return raw.split(".")[0]


def to_qmt_symbol(symbol, market=None):
    raw = str(symbol or "").strip().upper()
    market_hint = str(market or "").strip().lower()
    if not raw:
        return ""
    if raw.endswith(".HK") or raw.startswith("HK:") or raw.startswith("31#") or market_hint == "hk":
        return normalize_symbol(raw).zfill(5) + ".HK"
    if "." in raw:
        return raw
    code = normalize_symbol(raw)
    if len(code) == 5:
        return code.zfill(5) + ".HK"
    if code.startswith(("60", "68", "90", "51", "52", "56", "58", "11", "13")):
        return code + ".SH"
    if code.startswith(("43", "83", "87", "88", "92")):
        return code + ".BJ"
    return code + ".SZ"


def qmt_market(qmt_symbol):
    text = str(qmt_symbol or "").upper()
    return "hk" if text.endswith(".HK") else "cn"


def compact_date(value):
    if not value:
        return ""
    return str(value).replace("-", "").replace("/", "").strip()


def qmt_time_to_date(value):
    if value is None:
        return None
    try:
        if isinstance(value, float) and pd.isna(value):
            return None
    except Exception:
        pass
    if isinstance(value, pd.Timestamp):
        return value.strftime("%Y-%m-%d")
    text = str(value).strip()
    if not text:
        return None
    digits = "".join(ch for ch in text if ch.isdigit())
    if len(digits) >= 14:
        try:
            return datetime.strptime(digits[:14], "%Y%m%d%H%M%S").strftime("%Y-%m-%d")
        except ValueError:
            pass
    if len(digits) == 13:
        try:
            return datetime.fromtimestamp(int(digits) / 1000).strftime("%Y-%m-%d")
        except Exception:
            pass
    if len(digits) == 10:
        try:
            return datetime.fromtimestamp(int(digits)).strftime("%Y-%m-%d")
        except Exception:
            pass
    if len(digits) >= 8:
        try:
            return datetime.strptime(digits[:8], "%Y%m%d").strftime("%Y-%m-%d")
        except ValueError:
            pass
    parsed = pd.to_datetime(text, errors="coerce")
    if pd.isna(parsed):
        return None
    return parsed.strftime("%Y-%m-%d")


def ensure_schema(conn):
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS daily_prices (
          symbol TEXT NOT NULL,
          trade_date TEXT NOT NULL,
          open REAL,
          high REAL,
          low REAL,
          close REAL,
          volume REAL,
          amount REAL,
          turnover REAL,
          source_file TEXT,
          PRIMARY KEY (symbol, trade_date)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS hk_daily_prices (
          raw_code TEXT NOT NULL,
          symbol TEXT NOT NULL,
          market TEXT NOT NULL,
          trade_date TEXT NOT NULL,
          open REAL,
          high REAL,
          low REAL,
          close REAL,
          volume REAL,
          amount REAL,
          turnover REAL,
          source_file TEXT,
          PRIMARY KEY (raw_code, trade_date)
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_hk_daily_symbol_date ON hk_daily_prices(symbol, trade_date)")


def local_qmt_symbols(conn):
    result = []
    for row in conn.execute("SELECT DISTINCT symbol FROM daily_prices ORDER BY symbol").fetchall():
        code = to_qmt_symbol(row[0], "cn")
        if code:
            result.append(code)
    try:
        rows = conn.execute("SELECT DISTINCT symbol FROM hk_daily_prices ORDER BY symbol").fetchall()
    except sqlite3.OperationalError:
        rows = []
    for row in rows:
        code = to_qmt_symbol(row[0], "hk")
        if code:
            result.append(code)
    return result


def parse_symbols(value, conn):
    if str(value or "").lower() == "all":
        symbols = local_qmt_symbols(conn)
        if not symbols:
            raise SystemExit("market_data.sqlite has no existing symbols; pass --symbols explicitly.")
        return symbols
    raw = str(value).replace("\uff0c", ",")
    return [to_qmt_symbol(item) for item in raw.split(",") if to_qmt_symbol(item)]


def chunked(items, size):
    for index in range(0, len(items), size):
        yield items[index:index + size]


def dataframe_from_xtdata_result(result, qmt_symbol):
    if result is None:
        return pd.DataFrame()
    if qmt_symbol in result and isinstance(result[qmt_symbol], pd.DataFrame):
        return result[qmt_symbol].copy()
    field_frames = {}
    try:
        iterator = result.items()
    except Exception:
        iterator = []
    for key, value in iterator:
        if isinstance(value, pd.DataFrame):
            field_frames[key] = value
    if field_frames:
        columns = {}
        for field, frame in field_frames.items():
            if qmt_symbol in frame.index:
                columns[field] = frame.loc[qmt_symbol]
        if columns:
            return pd.DataFrame(columns)
    return pd.DataFrame()


def existing_hk_volume_unit(conn, symbol):
    try:
        rows = conn.execute(
            """
            SELECT close, volume, amount
            FROM hk_daily_prices
            WHERE symbol = ? AND close > 0 AND volume > 0 AND amount > 0
            ORDER BY trade_date DESC
            LIMIT 20
            """,
            (symbol,),
        ).fetchall()
    except Exception:
        rows = []
    factors = []
    for close, volume, amount in rows:
        try:
            factors.append(float(amount) / float(close) / float(volume))
        except Exception:
            pass
    factors = sorted(value for value in factors if value > 0)
    return factors[len(factors) // 2] if factors else HK_VOLUME_DEFAULT_UNIT


def normalize_hk_volume(conn, symbol, volume, amount, close):
    try:
        volume = float(volume)
        amount = float(amount)
        close = float(close)
    except Exception:
        return volume
    if volume <= 0 or amount <= 0 or close <= 0:
        return volume
    target_unit = existing_hk_volume_unit(conn, symbol)
    raw_unit = amount / close / volume
    if raw_unit < target_unit / 5:
        return amount / close / target_unit
    return volume


def normalize_daily_frame(df, qmt_symbol, conn):
    if df.empty:
        return pd.DataFrame()
    frame = df.copy()
    if "time" in frame.columns:
        frame["trade_date"] = frame["time"].map(qmt_time_to_date)
    else:
        frame["trade_date"] = pd.Series(frame.index, index=frame.index).map(qmt_time_to_date)
    for col in ["open", "high", "low", "close", "volume", "amount"]:
        if col not in frame.columns:
            frame[col] = None
        frame[col] = pd.to_numeric(frame[col], errors="coerce")
    frame["turnover"] = pd.to_numeric(frame.get("turnover"), errors="coerce") if "turnover" in frame.columns else None
    frame = frame.dropna(subset=["trade_date", "open", "high", "low", "close"])
    symbol = normalize_symbol(qmt_symbol).zfill(5) if qmt_market(qmt_symbol) == "hk" else normalize_symbol(qmt_symbol).zfill(6)
    if qmt_market(qmt_symbol) == "hk":
        frame["volume"] = frame.apply(lambda row: normalize_hk_volume(conn, symbol, row.get("volume"), row.get("amount"), row.get("close")), axis=1)
        frame["raw_code"] = "31#" + symbol
        frame["symbol"] = symbol
        frame["market"] = "hk"
        frame["source_file"] = "qmt_xtdata"
        columns = ["raw_code", "symbol", "market", "trade_date", "open", "high", "low", "close", "volume", "amount", "turnover", "source_file"]
    else:
        frame["symbol"] = symbol
        frame["source_file"] = "qmt_xtdata"
        columns = ["symbol", "trade_date", "open", "high", "low", "close", "volume", "amount", "turnover", "source_file"]
    return frame[columns].drop_duplicates(columns[:2] if qmt_market(qmt_symbol) == "cn" else ["raw_code", "trade_date"], keep="last")


def upsert_daily(conn, frame, market):
    if frame.empty:
        return 0
    rows = list(frame.itertuples(index=False, name=None))
    if market == "hk":
        conn.executemany(
            """
            INSERT OR REPLACE INTO hk_daily_prices
              (raw_code, symbol, market, trade_date, open, high, low, close, volume, amount, turnover, source_file)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            rows,
        )
    else:
        conn.executemany(
            """
            INSERT OR REPLACE INTO daily_prices
              (symbol, trade_date, open, high, low, close, volume, amount, turnover, source_file)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            rows,
        )
    return len(rows)


def load_cached_history(xtdata, qmt_symbol, start_time, end_time):
    data = xtdata.get_market_data_ex(
        DEFAULT_FIELDS,
        [qmt_symbol],
        period="1d",
        start_time=start_time,
        end_time=end_time,
        count=0,
        dividend_type="none",
        fill_data=True,
    )
    return dataframe_from_xtdata_result(data, qmt_symbol)


def update_from_qmt(args):
    try:
        from xtquant import xtdata
    except ImportError as exc:
        raise SystemExit("Current Python cannot import xtquant; run with QMT bundled Python.") from exc

    db_path = Path(args.db)
    start_time = compact_date(args.start)
    end_time = compact_date(args.end)
    conn = sqlite3.connect(str(db_path))
    total = 0
    try:
        ensure_schema(conn)
        qmt_symbols = parse_symbols(args.symbols, conn)
        for batch in chunked(qmt_symbols, args.batch_size):
            print("processing %s symbols: %s ... %s" % (len(batch), batch[0], batch[-1]))
            if args.download:
                for code in batch:
                    print("download %s %s %s -> %s" % (code, args.period, start_time or "ALL", end_time or "latest"))
                    xtdata.download_history_data(code, args.period, start_time, end_time)
            for qmt_code in batch:
                market = qmt_market(qmt_code)
                frame = normalize_daily_frame(load_cached_history(xtdata, qmt_code, start_time, end_time), qmt_code, conn)
                count = upsert_daily(conn, frame, market)
                total += count
                if count:
                    print("saved %s: %s rows, %s -> %s" % (qmt_code, count, frame["trade_date"].min(), frame["trade_date"].max()))
                else:
                    print("no data %s" % qmt_code)
            conn.commit()
    finally:
        conn.close()
    print("done: saved/updated %s rows into %s" % (total, db_path))


def main():
    parser = argparse.ArgumentParser(description="Update market_data.sqlite daily bars from QMT/xtdata")
    parser.add_argument("--db", default=str(DEFAULT_DB), help="SQLite db path, default market_data.sqlite")
    parser.add_argument("--symbols", default="all", help="all, or comma-separated symbols like 300059,600519,09988.HK")
    parser.add_argument("--start", default="", help="start date YYYYMMDD or YYYY-MM-DD")
    parser.add_argument("--end", default="", help="end date YYYYMMDD or YYYY-MM-DD; empty means latest")
    parser.add_argument("--period", default="1d", help="period, default 1d")
    parser.add_argument("--dividend-type", default="none", choices=["none", "front", "back", "front_ratio", "back_ratio"], help="kept for compatibility")
    parser.add_argument("--batch-size", type=int, default=80, help="symbols per batch")
    parser.add_argument("--no-download", dest="download", action="store_false", help="do not call download_history_data first")
    parser.set_defaults(download=True)
    args = parser.parse_args()
    if args.period != "1d":
        raise SystemExit("This script writes daily tables only; keep --period 1d.")
    update_from_qmt(args)


if __name__ == "__main__":
    main()
