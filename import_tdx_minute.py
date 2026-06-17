"""
Import TongDaXin .lc5 minute bars into SQLite.

Default source root: C:\\D\\TDX\\vipdoc
Default table: minute_prices

TongDaXin A-share 5-minute files are usually under:
  sh/fzline/*.lc5, sz/fzline/*.lc5, bj/fzline/*.lc5
"""

from __future__ import annotations

import argparse
import sqlite3
import struct
from pathlib import Path


DEFAULT_TDX_ROOT = Path(r"C:\D\TDX\vipdoc")
DEFAULT_DB = Path("market_data.sqlite")
RECORD_SIZE = 32
STOCK_MARKETS = {"sh", "sz", "bj"}
PERIOD_TO_EXT = {
    "1m": ".lc1",
    "5m": ".lc5",
}


def is_stock_code(market: str, code: str) -> bool:
    if market == "sh":
        return code.startswith(("600", "601", "603", "605", "688", "689"))
    if market == "sz":
        return code.startswith(("000", "001", "002", "003", "300", "301"))
    if market == "bj":
        return code.startswith(("4", "8", "9"))
    return False


def normalize_code(path: Path, market: str) -> str:
    raw_code = path.stem
    lower_raw = raw_code.lower()
    return raw_code[2:] if lower_raw.startswith(market) else raw_code


def parse_symbols(value: str) -> set[str]:
    symbols = set()
    for item in value.replace("；", ",").replace(";", ",").replace("，", ",").split(","):
        text = item.strip().upper()
        if not text:
            continue
        if "." in text:
            text = text.split(".", 1)[0]
        if text[:2].lower() in STOCK_MARKETS:
            text = text[2:]
        symbols.add(text)
    return symbols


def decode_lc_date(value: int) -> str:
    year = value // 2048 + 2004
    rest = value % 2048
    month = rest // 100
    day = rest % 100
    if not (1990 <= year <= 2100 and 1 <= month <= 12 and 1 <= day <= 31):
        return ""
    return f"{year:04d}-{month:02d}-{day:02d}"


def decode_lc_time(value: int) -> str:
    hour = value // 60
    minute = value % 60
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        return ""
    return f"{hour:02d}:{minute:02d}:00"


def ensure_schema(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS minute_prices (
          symbol TEXT NOT NULL,
          market TEXT NOT NULL,
          period TEXT NOT NULL,
          trade_time TEXT NOT NULL,
          trade_date TEXT NOT NULL,
          open REAL,
          high REAL,
          low REAL,
          close REAL,
          volume REAL,
          amount REAL,
          source_file TEXT,
          PRIMARY KEY (symbol, period, trade_time)
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_minute_prices_symbol_date "
        "ON minute_prices(symbol, period, trade_date)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_minute_prices_time "
        "ON minute_prices(period, trade_time)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_minute_prices_period_date_symbol "
        "ON minute_prices(period, trade_date, symbol)"
    )


def read_minute_file(path: Path, market: str, period: str, include_non_stock: bool = False) -> list[tuple]:
    symbol = normalize_code(path, market)
    if market in STOCK_MARKETS and not include_non_stock and not is_stock_code(market, symbol):
        return []

    rows = []
    data = path.read_bytes()
    usable = len(data) - (len(data) % RECORD_SIZE)
    for offset in range(0, usable, RECORD_SIZE):
        record = data[offset : offset + RECORD_SIZE]
        date_code, minute_code, open_price, high, low, close, amount, volume, _reserved = struct.unpack(
            "<HHfffffii",
            record,
        )
        trade_date = decode_lc_date(int(date_code))
        trade_clock = decode_lc_time(int(minute_code))
        if not trade_date or not trade_clock:
            continue
        trade_time = f"{trade_date} {trade_clock}"
        rows.append(
            (
                symbol,
                market,
                period,
                trade_time,
                trade_date,
                float(open_price),
                float(high),
                float(low),
                float(close),
                float(volume),
                float(amount),
                f"tdx_{market}_{period}",
            )
        )
    return rows


def upsert_rows(conn: sqlite3.Connection, rows: list[tuple]) -> int:
    if not rows:
        return 0
    conn.executemany(
        """
        INSERT INTO minute_prices
          (symbol, market, period, trade_time, trade_date, open, high, low, close, volume, amount, source_file)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(symbol, period, trade_time) DO UPDATE SET
          market=excluded.market,
          trade_date=excluded.trade_date,
          open=excluded.open,
          high=excluded.high,
          low=excluded.low,
          close=excluded.close,
          volume=excluded.volume,
          amount=excluded.amount,
          source_file=excluded.source_file
        """,
        rows,
    )
    return len(rows)


def iter_minute_files(root: Path, markets: list[str], period: str) -> list[tuple[str, Path]]:
    extension = PERIOD_TO_EXT[period]
    files = []
    for market in markets:
        folder = root / market / "fzline"
        if not folder.exists():
            print(f"skip missing folder: {folder}")
            continue
        for path in sorted(folder.glob(f"{market}*{extension}")):
            files.append((market, path))
    return files


def main() -> None:
    parser = argparse.ArgumentParser(description="Import TongDaXin vipdoc minute .lc files into SQLite.")
    parser.add_argument("--tdx-root", type=Path, default=DEFAULT_TDX_ROOT)
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    parser.add_argument("--markets", default="sh,sz,bj", help="Comma-separated markets: sh,sz,bj")
    parser.add_argument("--period", choices=sorted(PERIOD_TO_EXT), default="5m")
    parser.add_argument("--symbols", default="", help="Only import specified symbols, comma separated.")
    parser.add_argument("--start-date", default="", help="Only import bars on/after YYYY-MM-DD.")
    parser.add_argument("--end-date", default="", help="Only import bars on/before YYYY-MM-DD.")
    parser.add_argument("--include-non-stock", action="store_true")
    parser.add_argument("--commit-every", type=int, default=200000)
    args = parser.parse_args()

    markets = [item.strip().lower() for item in args.markets.split(",") if item.strip()]
    unsupported = [item for item in markets if item not in STOCK_MARKETS]
    if unsupported:
        raise SystemExit(f"Unsupported market(s): {', '.join(unsupported)}")
    wanted = parse_symbols(args.symbols)
    files = iter_minute_files(args.tdx_root, markets, args.period)
    if not files:
        raise SystemExit("No minute files found.")

    start_date = args.start_date.strip()
    end_date = args.end_date.strip()
    conn = sqlite3.connect(args.db)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    total = 0
    pending = []
    try:
        ensure_schema(conn)
        for index, (market, path) in enumerate(files, 1):
            symbol = normalize_code(path, market)
            if wanted and symbol not in wanted:
                continue
            rows = read_minute_file(path, market, args.period, include_non_stock=args.include_non_stock)
            if start_date:
                rows = [row for row in rows if row[4] >= start_date]
            if end_date:
                rows = [row for row in rows if row[4] <= end_date]
            pending.extend(rows)
            if len(pending) >= args.commit_every:
                total += upsert_rows(conn, pending)
                conn.commit()
                pending = []
                print(f"written {total} rows... file {index}/{len(files)}")
        if pending:
            total += upsert_rows(conn, pending)
            conn.commit()
    finally:
        conn.close()
    print(f"done: imported/updated {total} rows from {len(files)} files into minute_prices.")


if __name__ == "__main__":
    main()
