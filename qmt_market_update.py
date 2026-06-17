"""
Update market_data.sqlite from QMT/xtquant daily bars.

Run this script with the Python environment that can import xtquant, usually the
Python bundled with QMT/迅投. The normal project Python may not include xtquant.
"""

from __future__ import annotations

import argparse
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Iterable

import pandas as pd


DEFAULT_DB = Path("market_data.sqlite")
DEFAULT_FIELDS = ["time", "open", "high", "low", "close", "volume", "amount", "suspendFlag"]


def normalize_symbol(symbol: str) -> str:
    raw = str(symbol).strip().upper()
    if not raw:
        return ""
    return raw.split(".")[0]


def to_qmt_symbol(symbol: str) -> str:
    raw = str(symbol).strip().upper()
    if "." in raw:
        return raw
    code = normalize_symbol(raw)
    if not code:
        return ""
    if code.startswith(("60", "68", "90", "51", "52", "56", "58", "11", "13")):
        return f"{code}.SH"
    return f"{code}.SZ"


def compact_date(value: str | None) -> str:
    if not value:
        return ""
    return str(value).replace("-", "").replace("/", "").strip()


def display_date(value: str | None) -> str:
    compact = compact_date(value)
    if len(compact) != 8:
        return compact
    return f"{compact[:4]}-{compact[4:6]}-{compact[6:8]}"


def qmt_time_to_date(value) -> str | None:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
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
        except (OverflowError, ValueError):
            pass
    if len(digits) == 10:
        try:
            return datetime.fromtimestamp(int(digits)).strftime("%Y-%m-%d")
        except (OverflowError, ValueError):
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


def local_symbols(db_path: Path) -> list[str]:
    if not db_path.exists():
        return []
    conn = sqlite3.connect(db_path)
    try:
        rows = conn.execute("SELECT DISTINCT symbol FROM daily_prices ORDER BY symbol").fetchall()
    finally:
        conn.close()
    return [row[0] for row in rows]


def parse_symbols(value: str, db_path: Path) -> list[str]:
    if value.lower() == "all":
        symbols = local_symbols(db_path)
        if not symbols:
            raise SystemExit("market_data.sqlite 中没有已有股票；请用 --symbols 指定代码。")
        return symbols
    return [normalize_symbol(item) for item in value.replace("，", ",").split(",") if normalize_symbol(item)]


def chunked(items: list[str], size: int) -> Iterable[list[str]]:
    for index in range(0, len(items), size):
        yield items[index : index + size]


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


def dataframe_from_xtdata_result(result, qmt_symbol: str) -> pd.DataFrame:
    if result is None:
        return pd.DataFrame()
    if qmt_symbol in result and isinstance(result[qmt_symbol], pd.DataFrame):
        return result[qmt_symbol].copy()

    # Some xtdata APIs return {field: DataFrame}; normalize that to one DataFrame.
    field_frames = {key: value for key, value in getattr(result, "items", lambda: [])() if isinstance(value, pd.DataFrame)}
    if field_frames:
        columns = {}
        for field, frame in field_frames.items():
            if qmt_symbol in frame.index:
                columns[field] = frame.loc[qmt_symbol]
        if columns:
            return pd.DataFrame(columns)
    return pd.DataFrame()


def normalize_daily_frame(df: pd.DataFrame, symbol: str) -> pd.DataFrame:
    if df.empty:
        return pd.DataFrame()
    frame = df.copy()
    if "time" in frame.columns:
        date_values = frame["time"].map(qmt_time_to_date)
    else:
        date_values = pd.Series(frame.index, index=frame.index).map(qmt_time_to_date)
    frame["trade_date"] = date_values
    frame["symbol"] = normalize_symbol(symbol)
    for col in ["open", "high", "low", "close", "volume", "amount"]:
        if col not in frame.columns:
            frame[col] = None
        frame[col] = pd.to_numeric(frame[col], errors="coerce")
    frame["turnover"] = pd.to_numeric(frame.get("turnover"), errors="coerce") if "turnover" in frame.columns else None
    frame["source_file"] = "qmt_xtdata"
    frame = frame.dropna(subset=["trade_date", "open", "high", "low", "close"])
    frame = frame[["symbol", "trade_date", "open", "high", "low", "close", "volume", "amount", "turnover", "source_file"]]
    return frame.drop_duplicates(["symbol", "trade_date"], keep="last")


def upsert_daily(conn: sqlite3.Connection, frame: pd.DataFrame) -> int:
    if frame.empty:
        return 0
    rows = list(frame.itertuples(index=False, name=None))
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


def update_from_qmt(args: argparse.Namespace) -> None:
    try:
        from xtquant import xtdata
    except ImportError as exc:
        raise SystemExit("当前 Python 无法 import xtquant；请使用 QMT/迅投自带或已安装 xtquant 的 Python 运行。") from exc

    db_path = Path(args.db)
    symbols = parse_symbols(args.symbols, db_path)
    qmt_symbols = [to_qmt_symbol(symbol) for symbol in symbols]
    start_time = compact_date(args.start)
    end_time = compact_date(args.end)
    conn = sqlite3.connect(db_path)
    total = 0
    try:
      ensure_schema(conn)
      for batch in chunked(qmt_symbols, args.batch_size):
          print(f"处理 {len(batch)} 只：{batch[0]} ... {batch[-1]}")
          if args.download:
              for code in batch:
                  print(f"下载 {code} {args.period} {start_time or 'ALL'} -> {end_time or 'latest'}")
                  xtdata.download_history_data(code, args.period, start_time, end_time)
          data = xtdata.get_market_data_ex(
              DEFAULT_FIELDS,
              batch,
              period=args.period,
              start_time=start_time,
              end_time=end_time,
              count=-1,
              dividend_type=args.dividend_type,
              fill_data=True,
          )
          for qmt_code in batch:
              frame = normalize_daily_frame(dataframe_from_xtdata_result(data, qmt_code), qmt_code)
              count = upsert_daily(conn, frame)
              total += count
              if count:
                  print(f"写入 {normalize_symbol(qmt_code)}：{count} 行，{frame['trade_date'].min()} -> {frame['trade_date'].max()}")
              else:
                  print(f"无数据 {qmt_code}")
          conn.commit()
    finally:
        conn.close()
    print(f"完成：共写入/更新 {total} 行到 {db_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="从 QMT/xtdata 更新本项目 market_data.sqlite 日线行情")
    parser.add_argument("--db", default=str(DEFAULT_DB), help="SQLite 数据库路径，默认 market_data.sqlite")
    parser.add_argument("--symbols", default="all", help="股票代码，逗号分隔；默认 all 表示更新库中已有股票")
    parser.add_argument("--start", default="", help="开始日期 YYYYMMDD 或 YYYY-MM-DD；空表示尽可能早")
    parser.add_argument("--end", default="", help="结束日期 YYYYMMDD 或 YYYY-MM-DD；空表示最新")
    parser.add_argument("--period", default="1d", help="周期，默认 1d")
    parser.add_argument("--dividend-type", default="none", choices=["none", "front", "back", "front_ratio", "back_ratio"], help="复权方式")
    parser.add_argument("--batch-size", type=int, default=80, help="每批读取股票数")
    parser.add_argument("--no-download", dest="download", action="store_false", help="不先下载历史行情，只读取本地已有数据")
    parser.set_defaults(download=True)
    args = parser.parse_args()
    if args.period != "1d":
        raise SystemExit("当前项目 daily_prices 只接收日线，请保持 --period 1d。")
    update_from_qmt(args)


if __name__ == "__main__":
    main()
