"""
Import QMT-exported CSV files into market_data.sqlite.
"""

from __future__ import annotations

import argparse
import csv
import sqlite3
from pathlib import Path


DEFAULT_DB = Path("market_data.sqlite")
DEFAULT_EXPORT_DIR = Path("qmt_export")


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


def to_float(value: str | None):
    if value is None or value == "":
        return None
    try:
        return float(value)
    except ValueError:
        return None


def import_csv(conn: sqlite3.Connection, path: Path) -> int:
    rows = []
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for item in reader:
            symbol = (item.get("symbol") or "").strip()
            trade_date = (item.get("trade_date") or "").strip()
            if not symbol or not trade_date:
                continue
            rows.append(
                (
                    symbol,
                    trade_date,
                    to_float(item.get("open")),
                    to_float(item.get("high")),
                    to_float(item.get("low")),
                    to_float(item.get("close")),
                    to_float(item.get("volume")),
                    to_float(item.get("amount")),
                    to_float(item.get("turnover")),
                    item.get("source_file") or path.name,
                )
            )
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


def latest_csv(export_dir: Path) -> Path:
    files = sorted(export_dir.glob("qmt_daily_*.csv"), key=lambda item: item.stat().st_mtime, reverse=True)
    if not files:
        raise SystemExit(f"未找到 CSV：{export_dir / 'qmt_daily_*.csv'}")
    return files[0]


def main() -> None:
    parser = argparse.ArgumentParser(description="导入 QMT 导出的日线 CSV 到 market_data.sqlite")
    parser.add_argument("--db", default=str(DEFAULT_DB), help="SQLite 数据库路径")
    parser.add_argument("--csv", default="", help="CSV 文件路径；不填则导入 qmt_export 下最新文件")
    args = parser.parse_args()
    db_path = Path(args.db)
    csv_path = Path(args.csv) if args.csv else latest_csv(DEFAULT_EXPORT_DIR)
    conn = sqlite3.connect(db_path)
    try:
        ensure_schema(conn)
        count = import_csv(conn, csv_path)
        conn.commit()
    finally:
        conn.close()
    print(f"已导入/更新 {count} 行：{csv_path}")


if __name__ == "__main__":
    main()
