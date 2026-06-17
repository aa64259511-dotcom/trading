"""
Import TongDaXin .day daily bars into SQLite.

Default source root: C:\\D\\TDX\\vipdoc

Tables:
- daily_prices: A-share stock daily bars from sh/sz/bj.
- hk_daily_prices: Hong Kong stock daily bars from hk.
- futures_daily_prices: Futures/other extended-market bars from ds.

The default import still only reads A-share stocks. Add `hk` or `ds` to
--markets when those local TongDaXin folders contain data you want to import.
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
HK_MARKETS = {"hk"}
FUTURES_MARKETS = {"ds"}


def is_stock_code(market: str, code: str) -> bool:
    if market == "sh":
        return code.startswith(("600", "601", "603", "605", "688", "689"))
    if market == "sz":
        return code.startswith(("000", "001", "002", "003", "300", "301"))
    if market == "bj":
        return code.startswith(("4", "8", "9"))
    return False


def table_for_market(market: str) -> str:
    if market in STOCK_MARKETS:
        return "daily_prices"
    if market in HK_MARKETS:
        return "hk_daily_prices"
    if market in FUTURES_MARKETS:
        return "futures_daily_prices"
    raise ValueError(f"Unsupported market: {market}")


def logical_market_for_file(market: str, raw_code: str) -> str:
    if market == "ds" and raw_code.startswith("31#"):
        return "hk"
    return market


def ensure_schema(conn: sqlite3.Connection) -> None:
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
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS futures_daily_prices (
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
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_hk_daily_symbol_date "
        "ON hk_daily_prices(symbol, trade_date)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_futures_daily_symbol_date "
        "ON futures_daily_prices(symbol, trade_date)"
    )


def parse_date(value: int) -> str:
    text = str(value)
    if len(text) != 8:
        return ""
    return f"{text[:4]}-{text[4:6]}-{text[6:8]}"


def normalize_code(path: Path, market: str) -> tuple[str, str]:
    raw_code = path.stem
    lower_raw = raw_code.lower()
    if lower_raw[:2] in {"sh", "sz", "bj", "hk"}:
        symbol = raw_code[2:]
    elif "#" in raw_code:
        symbol = raw_code.split("#", 1)[1]
    else:
        symbol = raw_code
    return raw_code, symbol


def read_day_file(path: Path, market: str, include_non_stock: bool = False) -> list[tuple]:
    raw_code, symbol = normalize_code(path, market)
    logical_market = logical_market_for_file(market, raw_code)
    if market in STOCK_MARKETS and not include_non_stock and not is_stock_code(market, symbol):
        return []

    rows = []
    data = path.read_bytes()
    usable = len(data) - (len(data) % RECORD_SIZE)
    for offset in range(0, usable, RECORD_SIZE):
        record = data[offset : offset + RECORD_SIZE]
        if market in STOCK_MARKETS:
            date, open_i, high_i, low_i, close_i, amount, volume, _reserved = struct.unpack(
                "<iiiiifii", record
            )
            open_price = open_i / 100.0
            high_price = high_i / 100.0
            low_price = low_i / 100.0
            close_price = close_i / 100.0
        else:
            date, open_price, high_price, low_price, close_price, amount, volume, _reserved = struct.unpack(
                "<ifffffii", record
            )
        trade_date = parse_date(date)
        if not trade_date:
            continue
        base_values = (
            trade_date,
            float(open_price),
            float(high_price),
            float(low_price),
            float(close_price),
            float(volume),
            float(amount),
            None,
            f"tdx_{market}_day",
        )
        if market in STOCK_MARKETS:
            rows.append((symbol, *base_values))
        else:
            rows.append((raw_code, symbol, logical_market, *base_values))
    return rows


def upsert_stock_rows(conn: sqlite3.Connection, rows: list[tuple]) -> int:
    if not rows:
        return 0
    conn.executemany(
        """
        INSERT INTO daily_prices
          (symbol, trade_date, open, high, low, close, volume, amount, turnover, source_file)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(symbol, trade_date) DO UPDATE SET
          open=excluded.open,
          high=excluded.high,
          low=excluded.low,
          close=excluded.close,
          volume=excluded.volume,
          amount=excluded.amount,
          turnover=excluded.turnover,
          source_file=excluded.source_file
        """,
        rows,
    )
    return len(rows)


def upsert_extended_rows(conn: sqlite3.Connection, table: str, rows: list[tuple]) -> int:
    if not rows:
        return 0
    if table not in {"hk_daily_prices", "futures_daily_prices"}:
        raise ValueError(f"Unsupported extended table: {table}")
    conn.executemany(
        f"""
        INSERT INTO {table}
          (raw_code, symbol, market, trade_date, open, high, low, close, volume, amount, turnover, source_file)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(raw_code, trade_date) DO UPDATE SET
          symbol=excluded.symbol,
          market=excluded.market,
          open=excluded.open,
          high=excluded.high,
          low=excluded.low,
          close=excluded.close,
          volume=excluded.volume,
          amount=excluded.amount,
          turnover=excluded.turnover,
          source_file=excluded.source_file
        """,
        rows,
    )
    return len(rows)


def upsert_rows(conn: sqlite3.Connection, table: str, rows: list[tuple]) -> int:
    if table == "daily_prices":
        return upsert_stock_rows(conn, rows)
    return upsert_extended_rows(conn, table, rows)


def iter_day_files(root: Path, markets: list[str]) -> list[tuple[str, Path]]:
    files = []
    for market in markets:
        folder = root / market / "lday"
        if not folder.exists():
            print(f"skip missing folder: {folder}")
            continue
        pattern = f"{market}*.day" if market in STOCK_MARKETS | HK_MARKETS else "*.day"
        for path in sorted(folder.glob(pattern)):
            files.append((market, path))
    return files


def parse_symbols(value: str) -> set[str]:
    return {item.strip() for item in value.replace(";", ",").split(",") if item.strip()}


def main() -> None:
    parser = argparse.ArgumentParser(description="Import TongDaXin vipdoc daily .day files into SQLite.")
    parser.add_argument("--tdx-root", default=str(DEFAULT_TDX_ROOT), help="TongDaXin vipdoc folder.")
    parser.add_argument("--db", default=str(DEFAULT_DB), help="SQLite database path.")
    parser.add_argument("--markets", default="sh,sz,bj", help="Comma separated markets: sh,sz,bj,hk,ds.")
    parser.add_argument("--symbols", default="", help="Only import specified symbols/raw codes, comma separated.")
    parser.add_argument("--raw-prefix", default="", help="Only import files whose raw code starts with this prefix.")
    parser.add_argument("--start-after", default="", help="Skip files whose raw code is <= this value.")
    parser.add_argument("--include-non-stock", action="store_true", help="Include indices/funds in stock markets.")
    parser.add_argument("--batch-size", type=int, default=50000, help="Rows per SQLite batch.")
    parser.add_argument("--init-only", action="store_true", help="Only create/update tables, do not import files.")
    args = parser.parse_args()

    root = Path(args.tdx_root)
    markets = [item.strip().lower() for item in args.markets.split(",") if item.strip()]
    unsupported = [market for market in markets if market not in STOCK_MARKETS | HK_MARKETS | FUTURES_MARKETS]
    if unsupported:
        raise SystemExit(f"Unsupported markets: {', '.join(unsupported)}")

    wanted = parse_symbols(args.symbols)
    conn = sqlite3.connect(args.db)
    total_rows = 0
    total_files = 0
    buffers: dict[str, list[tuple]] = {}
    try:
        ensure_schema(conn)
        conn.commit()
        if args.init_only:
            print("schema ready: daily_prices, hk_daily_prices, futures_daily_prices")
            return

        for market, path in iter_day_files(root, markets):
            raw_code, symbol = normalize_code(path, market)
            if args.start_after and raw_code <= args.start_after:
                continue
            if args.raw_prefix and not raw_code.startswith(args.raw_prefix):
                continue
            if wanted and raw_code not in wanted and symbol not in wanted:
                continue
            rows = read_day_file(path, market, include_non_stock=args.include_non_stock)
            if not rows:
                continue
            table = table_for_market(logical_market_for_file(market, raw_code))
            total_files += 1
            buffer = buffers.setdefault(table, [])
            buffer.extend(rows)
            if len(buffer) >= args.batch_size:
                total_rows += upsert_rows(conn, table, buffer)
                conn.commit()
                print(f"written {total_rows} rows...")
                buffers[table] = []

        for table, buffer in buffers.items():
            if buffer:
                total_rows += upsert_rows(conn, table, buffer)
                conn.commit()
    finally:
        conn.close()
    print(f"done: imported/updated {total_rows} rows from {total_files} files.")


if __name__ == "__main__":
    main()
