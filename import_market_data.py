import argparse
import re
import sqlite3
from pathlib import Path

import pandas as pd


DB_SCHEMA = """
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
);

CREATE INDEX IF NOT EXISTS idx_daily_prices_symbol_date
ON daily_prices(symbol, trade_date);

CREATE TABLE IF NOT EXISTS import_files (
  path TEXT PRIMARY KEY,
  symbol TEXT,
  rows_imported INTEGER NOT NULL DEFAULT 0,
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
"""


COLUMN_ALIASES = {
    "日期": "date",
    "交易日期": "date",
    "trade_date": "date",
    "ts_code": "ts_code",
    "股票代码": "symbol",
    "代码": "symbol",
    "symbol": "symbol",
    "开盘": "open",
    "open": "open",
    "最高": "high",
    "high": "high",
    "最低": "low",
    "low": "low",
    "收盘": "close",
    "close": "close",
    "成交量": "volume",
    "vol": "volume",
    "volume": "volume",
    "成交额": "amount",
    "amount": "amount",
    "换手率": "turnover",
    "turnover": "turnover",
}


def normalize_symbol(value):
    if value is None or pd.isna(value):
        return ""
    text = str(value).strip()
    match = re.search(r"(\d{6})", text)
    if match:
        return match.group(1)
    if re.fullmatch(r"\d{1,6}", text):
        return text.zfill(6)
    return text


def symbol_from_path(path):
    match = re.search(r"(?<!\d)(\d{6})(?!\d)", path.name)
    return match.group(1) if match else ""


def read_table(path):
    suffix = path.suffix.lower()
    if suffix in {".csv", ".txt"}:
        try:
            return pd.read_csv(path, encoding="utf-8-sig")
        except UnicodeDecodeError:
            return pd.read_csv(path, encoding="gbk")
    raise ValueError(f"不支持的文件类型：{path}")


def normalize_frame(df, path):
    df = df.rename(columns={column: COLUMN_ALIASES.get(str(column).strip(), str(column).strip().lower()) for column in df.columns})
    if "date" not in df.columns:
        raise ValueError("缺少日期列")
    symbol = ""
    if "symbol" in df.columns and not df["symbol"].dropna().empty:
        symbol = normalize_symbol(df["symbol"].dropna().iloc[0])
    if not symbol and "ts_code" in df.columns and not df["ts_code"].dropna().empty:
        symbol = normalize_symbol(df["ts_code"].dropna().iloc[0])
    if not symbol:
        symbol = symbol_from_path(path)
    if not symbol:
        raise ValueError("无法识别股票代码，请把6位股票代码放在文件名或symbol列中")

    result = pd.DataFrame(index=df.index)
    result["trade_date"] = pd.to_datetime(df["date"], errors="coerce").dt.strftime("%Y-%m-%d")
    result["symbol"] = symbol
    for column in ["open", "high", "low", "close", "volume", "amount", "turnover"]:
        result[column] = pd.to_numeric(df[column], errors="coerce") if column in df.columns else None
    result["source_file"] = str(path)
    result = result.dropna(subset=["trade_date", "open", "high", "low", "close"])
    return result.drop_duplicates(subset=["symbol", "trade_date"], keep="last")


def import_file(conn, path):
    df = normalize_frame(read_table(path), path)
    rows = [
        tuple(row)
        for row in df[["symbol", "trade_date", "open", "high", "low", "close", "volume", "amount", "turnover", "source_file"]].itertuples(index=False, name=None)
    ]
    conn.executemany(
        """
        INSERT OR REPLACE INTO daily_prices
        (symbol, trade_date, open, high, low, close, volume, amount, turnover, source_file)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        rows,
    )
    conn.execute(
        "INSERT OR REPLACE INTO import_files(path, symbol, rows_imported) VALUES (?, ?, ?)",
        (str(path), df["symbol"].iloc[0] if not df.empty else symbol_from_path(path), len(df)),
    )
    return len(df)


def iter_files(root):
    root = Path(root)
    if root.is_file():
        yield root
        return
    for suffix in ("*.csv", "*.txt"):
        for path in root.rglob(suffix):
            if "_weekly_" in path.name.lower() or "_monthly_" in path.name.lower():
                continue
            yield path


def main():
    parser = argparse.ArgumentParser(description="导入A股日线行情到SQLite数据库")
    parser.add_argument("source", help="行情文件或目录")
    parser.add_argument("--db", default="market_data.sqlite", help="SQLite数据库路径")
    parser.add_argument("--quiet", action="store_true", help="减少逐文件输出")
    args = parser.parse_args()

    files = list(iter_files(args.source))
    if not files:
        raise SystemExit("没有找到可导入的 CSV/TXT 文件")

    imported_files = 0
    imported_rows = 0
    failed = []
    with sqlite3.connect(args.db) as conn:
        conn.executescript(DB_SCHEMA)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        for index, path in enumerate(files, start=1):
            try:
                count = import_file(conn, path)
                imported_files += 1
                imported_rows += count
                if not args.quiet:
                    print(f"OK {path} rows={count}")
            except Exception as exc:
                failed.append((path, exc))
                print(f"FAIL {path}: {exc}")
            if args.quiet and index % 100 == 0:
                print(f"进度 {index}/{len(files)}，记录 {imported_rows}，失败 {len(failed)}")
        conn.commit()

    print(f"导入完成：文件 {imported_files}/{len(files)}，记录 {imported_rows}，失败 {len(failed)}")
    if failed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
