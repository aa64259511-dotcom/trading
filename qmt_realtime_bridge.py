"""
Bridge QMT/xtquant realtime quotes into the local trading advice server.

Run this with a Python environment that can import xtquant while QMT is open.
The script subscribes quotes, polls the latest bar, and POSTs it to:
http://127.0.0.1:8765/api/realtime-quote
"""

import argparse
import json
import time
import urllib.request
from pathlib import Path


PROJECT_DIR = Path(r"C:\Users\admin\Documents\trading advice")
SYMBOL_FILE = PROJECT_DIR / "qmt_symbols.txt"
DEFAULT_API = "http://127.0.0.1:8765/api/realtime-quote"
DEFAULT_WATCHLIST_API = "http://127.0.0.1:8765/api/realtime-watchlist"


def normalize_symbol(symbol):
    text = str(symbol or "").strip().upper()
    return text.split(".")[0] if text else ""


def to_qmt_symbol(symbol):
    raw = str(symbol or "").strip().upper()
    if "." in raw:
        return raw
    if raw.startswith("HK:"):
        raw = raw.split(":", 1)[1]
    if raw.startswith("31#"):
        raw = raw.split("#", 1)[1]
    code = normalize_symbol(raw)
    if not code:
        return ""
    if len(code) == 5:
        return f"{code}.HK"
    if code.startswith(("60", "68", "90", "51", "52", "56", "58", "11", "13")):
        return f"{code}.SH"
    if code.startswith(("43", "83", "87", "88", "92")):
        return f"{code}.BJ"
    return f"{code}.SZ"


def read_symbols(value):
    if value.lower() != "all":
        raw = value.replace("\uff0c", ",")
        return [to_qmt_symbol(item) for item in raw.split(",") if to_qmt_symbol(item)]
    if not SYMBOL_FILE.exists():
        raise SystemExit(f"symbol file not found: {SYMBOL_FILE}")
    return [to_qmt_symbol(line) for line in SYMBOL_FILE.read_text(encoding="utf-8").splitlines() if to_qmt_symbol(line)]


def json_value(value):
    try:
        if hasattr(value, "item"):
            value = value.item()
    except Exception:
        pass
    if value is None:
        return None
    if isinstance(value, (int, float, str, bool)):
        return value
    return str(value)


def latest_row(frame):
    if frame is None:
        return None
    try:
        if len(frame) <= 0:
            return None
        row = frame.tail(1).iloc[0]
        result = {str(key): json_value(value) for key, value in row.to_dict().items()}
        if "time" not in result and "stime" not in result:
            result["time"] = json_value(row.name)
        return result
    except Exception:
        return None


def quote_from_full_tick(row):
    if not isinstance(row, dict):
        return None
    return {str(key): json_value(value) for key, value in row.items()}


def post_quotes(api, payload):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        api,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    urllib.request.urlopen(request, timeout=3).read()


def get_watchlist_symbols(api):
    try:
        with urllib.request.urlopen(api, timeout=3) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        print(f"watchlist fetch failed: {exc}")
        return []
    items = []
    if isinstance(payload, dict):
        if isinstance(payload.get("symbols"), list):
            items.extend(payload.get("symbols"))
        elif isinstance(payload.get("current"), dict):
            items.append(payload.get("current"))
    elif isinstance(payload, list):
        items.extend(payload)
    symbols = []
    for item in items:
        if isinstance(item, dict):
            code = item.get("symbol") or item.get("code") or item.get("stock_code")
        else:
            code = item
        qmt_code = to_qmt_symbol(code)
        if qmt_code and qmt_code not in symbols:
            symbols.append(qmt_code)
    return symbols


def subscribe_new_symbols(xtdata, symbols, subscribed):
    for code in symbols:
        if code in subscribed:
            continue
        try:
            seq = xtdata.subscribe_quote(code, period="tick")
            subscribed[code] = seq
            print(f"subscribed {code}")
        except Exception as exc:
            print(f"subscribe failed {code}: {exc}")


def unsubscribe_removed_symbols(xtdata, symbols, subscribed):
    active = set(symbols)
    for code in list(subscribed):
        if code in active:
            continue
        seq = subscribed.pop(code)
        if seq is None:
            print(f"removed {code} from polling")
            continue
        try:
            xtdata.unsubscribe_quote(seq)
            print(f"unsubscribed {code}")
        except Exception as exc:
            print(f"unsubscribe failed {code}: {exc}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--symbols", default="000001,600519", help='"auto" follows the local watchlist, "all" reads qmt_symbols.txt, or comma-separated symbols.')
    parser.add_argument("--period", default="1d", help='QMT period, for example "1d", "1m", or "tick".')
    parser.add_argument("--interval", type=float, default=3.0, help="Polling interval seconds.")
    parser.add_argument("--api", default=DEFAULT_API)
    parser.add_argument("--watchlist-api", default=DEFAULT_WATCHLIST_API)
    args = parser.parse_args()

    from xtquant import xtdata

    auto_symbols = args.symbols.lower() == "auto"
    symbols = [] if auto_symbols else read_symbols(args.symbols)
    subscribed = {}
    if not symbols and not auto_symbols:
        raise SystemExit("no symbols to subscribe")
    if auto_symbols:
        print(f"following realtime watchlist: {args.watchlist_api}")
    else:
        print(f"subscribing {len(symbols)} symbols, period=tick")
        subscribe_new_symbols(xtdata, symbols, subscribed)
    time.sleep(1)

    while True:
        try:
            if auto_symbols:
                latest_symbols = get_watchlist_symbols(args.watchlist_api)
                if latest_symbols != symbols:
                    symbols = latest_symbols
                    print(f"watchlist now: {','.join(symbols) if symbols else '(empty)'}")
                subscribe_new_symbols(xtdata, symbols, subscribed)
                unsubscribe_removed_symbols(xtdata, symbols, subscribed)
            if not symbols:
                time.sleep(max(args.interval, 0.5))
                continue
            data = xtdata.get_full_tick(symbols)
            payload = {}
            for code in symbols:
                row = quote_from_full_tick(data.get(code) if isinstance(data, dict) else None)
                if not row:
                    continue
                row["symbol"] = code
                row["source"] = "qmt_xtdata_realtime"
                payload[code] = row
            if payload:
                post_quotes(args.api, payload)
                print(f"posted {len(payload)} quotes at {time.strftime('%H:%M:%S')}")
        except KeyboardInterrupt:
            raise
        except Exception as exc:
            print(f"bridge error: {exc}")
        time.sleep(max(args.interval, 0.5))


if __name__ == "__main__":
    main()
