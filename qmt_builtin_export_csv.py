# coding:gbk
"""
QMT built-in Python version: export daily bars to CSV.

This script avoids pandas and sqlite3 because some QMT built-in Python
environments do not bundle them. Run it inside QMT, then import the generated
CSV with qmt_csv_import.py in the project Python.
"""

import os
import time


PROJECT_DIR = r"C:\Users\admin\Documents\trading advice"
SYMBOL_FILE = os.path.join(PROJECT_DIR, "qmt_symbols.txt")
EXPORT_DIR = os.path.join(PROJECT_DIR, "qmt_export")
SYMBOLS = "all"  # "all" reads SYMBOL_FILE, or use "000001,600519"
START_DATE = "20260613"
END_DATE = ""
PERIOD = "1d"
BATCH_SIZE = 60
DO_DOWNLOAD = True
FIELDS = ["open", "high", "low", "close", "volume", "amount"]


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


def parse_symbols():
    if str(SYMBOLS).lower() != "all":
        raw = str(SYMBOLS).replace(chr(0xff0c), ",")
        return [normalize_symbol(item) for item in raw.split(",") if normalize_symbol(item)]
    if not os.path.exists(SYMBOL_FILE):
        print("symbol file not found: " + SYMBOL_FILE)
        return []
    result = []
    f = open(SYMBOL_FILE, "r")
    try:
        for line in f:
            code = normalize_symbol(line)
            if code:
                result.append(code)
    finally:
        f.close()
    return result


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


def safe_float(value):
    if value is None:
        return ""
    try:
        return str(float(value))
    except Exception:
        return ""


def csv_line(values):
    return ",".join([str(value) for value in values]) + "\n"


def rows_from_ori(ori_data, qmt_symbol):
    if not ori_data or qmt_symbol not in ori_data:
        return []
    result = []
    for row in ori_data.get(qmt_symbol) or []:
        trade_date = parse_trade_date(row_value(row, 0, "stime"))
        if not trade_date:
            continue
        open_price = safe_float(row_value(row, 1, "open"))
        high = safe_float(row_value(row, 2, "high"))
        low = safe_float(row_value(row, 3, "low"))
        close = safe_float(row_value(row, 4, "close"))
        if not open_price or not high or not low or not close:
            continue
        volume = safe_float(row_value(row, 5, "volume"))
        amount = safe_float(row_value(row, 6, "amount"))
        result.append([normalize_symbol(qmt_symbol), trade_date, open_price, high, low, close, volume, amount, "", "qmt_builtin_csv"])
    return result


def init(C):
    if not os.path.exists(EXPORT_DIR):
        os.makedirs(EXPORT_DIR)
    symbols = parse_symbols()
    qmt_symbols = [to_qmt_symbol(item) for item in symbols if to_qmt_symbol(item)]
    if not qmt_symbols:
        print("no symbols to export")
        return
    export_name = "qmt_daily_%s_%s.csv" % (START_DATE or "all", time.strftime("%Y%m%d_%H%M%S"))
    export_path = os.path.join(EXPORT_DIR, export_name)
    out = open(export_path, "w")
    total = 0
    try:
        out.write("symbol,trade_date,open,high,low,close,volume,amount,turnover,source_file\n")
        print("symbols: %s, start: %s, end: %s" % (len(qmt_symbols), START_DATE, END_DATE or "latest"))
        print("export: " + export_path)
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
                True,
            )
            batch_count = 0
            for code in batch:
                rows = rows_from_ori(ori_data, code)
                for row in rows:
                    out.write(csv_line(row))
                batch_count += len(rows)
            total += batch_count
            out.flush()
            print("batch exported: %s, total: %s" % (batch_count, total))
    finally:
        out.close()
    print("done, csv: " + export_path)
    print("done, total rows: %s" % total)

