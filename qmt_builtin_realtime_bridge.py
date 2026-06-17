# coding:gbk
"""
QMT built-in Python realtime quote bridge.

Paste/run this file inside the QMT/ThinkTrader Python model editor. It starts a
background thread that reads latest quotes from ContextInfo and POSTs them to
the local trading advice server.
"""

import json
import os
import threading
import time

try:
    from urllib import request as urllib_request
except Exception:
    import urllib2 as urllib_request


PROJECT_DIR = r"C:\Users\admin\Documents\trading advice"
SYMBOL_FILE = os.path.join(PROJECT_DIR, "qmt_symbols.txt")
API_URL = "http://127.0.0.1:8765/api/realtime-quote"
SYMBOLS = "000001,600519"  # Use "all" to read qmt_symbols.txt, or add "00700".
PERIOD = "1d"
INTERVAL_SECONDS = 3
BATCH_SIZE = 80
FIELDS = ["stime", "open", "high", "low", "close", "volume", "amount"]

_bridge_running = False


def normalize_symbol(symbol):
    text = str(symbol).strip().upper()
    if "." in text:
        text = text.split(".")[0]
    return text


def to_qmt_symbol(symbol):
    code = normalize_symbol(symbol)
    if not code:
        return ""
    if len(code) == 5:
        return code + ".HK"
    if code.startswith(("60", "68", "90", "51", "52", "56", "58", "11", "13")):
        return code + ".SH"
    if code.startswith(("43", "83", "87", "88", "92")):
        return code + ".BJ"
    return code + ".SZ"


def parse_symbols():
    if str(SYMBOLS).lower() != "all":
        raw = str(SYMBOLS).replace(chr(0xff0c), ",")
        return [to_qmt_symbol(item) for item in raw.split(",") if to_qmt_symbol(item)]
    if not os.path.exists(SYMBOL_FILE):
        print("symbol file not found: " + SYMBOL_FILE)
        return []
    result = []
    f = open(SYMBOL_FILE, "r")
    try:
        for line in f:
            code = to_qmt_symbol(line)
            if code:
                result.append(code)
    finally:
        f.close()
    return result


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
        return None
    try:
        return float(value)
    except Exception:
        return None


def latest_row(ori_data, qmt_symbol):
    if not ori_data or qmt_symbol not in ori_data:
        return None
    rows = ori_data.get(qmt_symbol) or []
    if not rows:
        return None
    row = rows[-1]
    close = safe_float(row_value(row, 4, "close"))
    if close is None:
        return None
    return {
        "symbol": qmt_symbol,
        "stime": row_value(row, 0, "stime"),
        "open": safe_float(row_value(row, 1, "open")) or close,
        "high": safe_float(row_value(row, 2, "high")) or close,
        "low": safe_float(row_value(row, 3, "low")) or close,
        "close": close,
        "volume": safe_float(row_value(row, 5, "volume")) or 0,
        "amount": safe_float(row_value(row, 6, "amount")) or 0,
        "source": "qmt_builtin_realtime",
    }


def post_payload(payload):
    data = json.dumps(payload).encode("utf-8")
    req = urllib_request.Request(API_URL, data=data, headers={"Content-Type": "application/json"})
    try:
        req.get_method = lambda: "POST"
    except Exception:
        pass
    urllib_request.urlopen(req, timeout=3).read()


def quote_data(C, batch):
    if hasattr(C, "get_market_data_ex_ori"):
        return C.get_market_data_ex_ori(FIELDS, batch, PERIOD, "", "", 1, "none", True, True)
    return C.get_market_data_ex(FIELDS, batch, PERIOD, "", "", 1, "none", True, True)


def bridge_loop(C, symbols):
    global _bridge_running
    while _bridge_running:
        try:
            total = 0
            for batch in chunks(symbols, BATCH_SIZE):
                data = quote_data(C, batch)
                payload = {}
                for code in batch:
                    row = latest_row(data, code)
                    if row:
                        payload[code] = row
                if payload:
                    post_payload(payload)
                    total += len(payload)
            if total:
                print("realtime bridge posted %s quotes at %s" % (total, time.strftime("%H:%M:%S")))
        except Exception as exc:
            print("realtime bridge error: %s" % exc)
        time.sleep(max(float(INTERVAL_SECONDS), 0.5))


def init(C):
    global _bridge_running
    if _bridge_running:
        print("realtime bridge already running")
        return
    symbols = parse_symbols()
    if not symbols:
        print("no symbols to bridge")
        return
    _bridge_running = True
    thread = threading.Thread(target=bridge_loop, args=(C, symbols))
    thread.daemon = True
    thread.start()
    print("realtime bridge started: %s symbols, period=%s" % (len(symbols), PERIOD))


def stop(C):
    global _bridge_running
    _bridge_running = False
    print("realtime bridge stopped")
