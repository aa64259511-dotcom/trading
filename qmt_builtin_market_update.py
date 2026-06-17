# coding:gbk
"""
QMT built-in Python version: update market_data.sqlite.

Paste/run this file inside QMT Python model editor. It avoids pandas by using
C.get_market_data_ex_ori(), because some QMT environments do not bundle pandas.
"""

import os
import sqlite3
import time


DB_PATH = r"C:\Users\admin\Documents\trading advice\market_data.sqlite"
SYMBOLS = "all"  # "all" means existing symbols in DB, or use "000001,600519"
START_DATE = "20260613"
END_DATE = ""
PERIOD = "1d"
BATCH_SIZE = 60
DO_DOWNLOAD = True
FIELDS = ["stime", "open", "high", "low", "close", "volume", "amount"]


def normalize_symbol(symbol):
    text = str(symbol).strip().upper()
    if "." in text:
        text = text.split(".")[0]
    return text


def to_qmt_symbol(symbol):
    code = normalize_symbol(symbol)
    if not code:
        return ""
    if code.startswith(("60", "68", "90", "51", "52", "56", "58", "11", "13")):
        return code + ".SH"
    return code + ".SZ"


def parse_trade_date(value):
    text = str(value).strip()
    digits = "".join([ch for ch in text if ch.isdigit()])
    if len(digits) >= 14:
        return "%s-%s-%s" % (digits[0:4], digits[4:6], digits[6:8])
    if len(digits) == 13:
        try:
            return time.strftime("%Y-%m-%d", time.localtime(int(digits) / 1000.0))
        except Exception:
            pass
    if len(digits) == 10:
        try:
            return time.strftime("%Y-%m-%d", time.localtime(int(digits)))
        except Exception:
            pass
    if len(digits) >= 8:
        return "%s-%s-%s" % (digits[0:4], digits[4:6], digits[6:8])
    return ""


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


def db_symbols(conn):
    rows = conn.execute("SELECT DISTINCT symbol FROM daily_prices ORDER BY symbol").fetchall()
    return [row[0] for row in rows]


def wanted_symbols(conn):
    if str(SYMBOLS).lower() == "all":
        return db_symbols(conn)
    raw = str(SYMBOLS).replace(chr(0xff0c), ",")
    return [normalize_symbol(item) for item in raw.split(",") if normalize_symbol(item)]


def chunks(items, size):
    index = 0
    while index < len(items):
        yield items[index:index + size]
        index += size


def row_value(row, index, key):
    if isinstance(row, dict):
        return row.get(key)
    try:
        return row[index]
    except Exception:
        return None


def rows_from_ori(ori_data, qmt_symbol):
    if not ori_data or qmt_symbol not in ori_data:
        return []
    result = []
    for row in ori_data.get(qmt_symbol) or []:
        trade_date = parse_trade_date(row_value(row, 0, "stime"))
        if not trade_date:
            continue
        try:
            open_price = float(row_value(row, 1, "open"))
            high = float(row_value(row, 2, "high"))
            low = float(row_value(row, 3, "low"))
            close = float(row_value(row, 4, "close"))
        except Exception:
            continue
        volume = row_value(row, 5, "volume")
        amount = row_value(row, 6, "amount")
        try:
            volume = float(volume) if volume is not None else None
        except Exception:
            volume = None
        try:
            amount = float(amount) if amount is not None else None
        except Exception:
            amount = None
        result.append((normalize_symbol(qmt_symbol), trade_date, open_price, high, low, close, volume, amount, None, "qmt_builtin"))
    return result


def upsert_rows(conn, rows):
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


def init(C):
    if not os.path.exists(DB_PATH):
        print("DB not found: " + DB_PATH)
        return
    conn = sqlite3.connect(DB_PATH)
    total = 0
    try:
        ensure_schema(conn)
        symbols = wanted_symbols(conn)
        qmt_symbols = [to_qmt_symbol(item) for item in symbols if to_qmt_symbol(item)]
        print("symbols: %s, start: %s, end: %s" % (len(qmt_symbols), START_DATE, END_DATE or "latest"))
        for batch in chunks(qmt_symbols, BATCH_SIZE):
            print("batch: %s -> %s" % (batch[0], batch[-1]))
            if DO_DOWNLOAD:
                for code in batch:
                    try:
                        download_history_data(code, PERIOD, START_DATE, END_DATE)
                    except Exception as exc:
                        print("download failed %s: %s" % (code, exc))
            ori_data = C.get_market_data_ex_ori(
                FIELDS,
                batch,
                PERIOD,
                START_DATE,
                END_DATE,
                -1,
                "none",
                True,
                False,
            )
            batch_count = 0
            for code in batch:
                rows = rows_from_ori(ori_data, code)
                count = upsert_rows(conn, rows)
                batch_count += count
                if count:
                    print("saved %s: %s rows" % (normalize_symbol(code), count))
            conn.commit()
            total += batch_count
            print("batch saved: %s, total: %s" % (batch_count, total))
    finally:
        conn.close()
    print("done, total rows: %s" % total)
