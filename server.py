import json
import random
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

import pandas as pd

from support_resistance_trainer import analyze, fetch_akshare_daily, fetch_akshare_weekly, parse_date


RANDOM_SYMBOLS = [
    "000001",
    "000333",
    "000651",
    "000858",
    "002594",
    "300059",
    "300750",
    "600036",
    "600519",
    "600887",
    "601318",
]

CACHE_DIR = Path("data_cache")


def fetch_with_retry(fetcher, symbol, start_ts, analysis_ts, label, attempts=3):
    last_error = None
    for attempt in range(1, attempts + 1):
        try:
            return fetcher(symbol, start_ts, analysis_ts)
        except Exception as exc:
            last_error = exc
            if attempt < attempts:
                time.sleep(1.5 * attempt)
    raise RuntimeError(f"{label}数据拉取失败，已重试{attempts}次：{last_error}")


def cache_path(symbol, start_ts, analysis_ts, period):
    CACHE_DIR.mkdir(exist_ok=True)
    return CACHE_DIR / f"{symbol}_{period}_{start_ts.strftime('%Y%m%d')}_{analysis_ts.strftime('%Y%m%d')}.csv"


def fetch_cached(fetcher, symbol, start_ts, analysis_ts, period, label):
    path = cache_path(symbol, start_ts, analysis_ts, period)
    try:
        df = fetch_with_retry(fetcher, symbol, start_ts, analysis_ts, label)
        df.to_csv(path, index=False, encoding="utf-8-sig")
        return df
    except Exception:
        if path.exists():
            from support_resistance_trainer import load_csv

            return load_csv(path)
        raise


class TradingAdviceHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/random-training-sample":
            self.write_json(200, self.random_training_sample())
            return
        super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path != "/api/train-support-resistance":
            self.send_error(404, "Not found")
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            symbol = str(payload.get("symbol", "")).strip()
            analysis_date = str(payload.get("date", "")).strip()
            if not symbol or not analysis_date:
                raise ValueError("symbol and date are required")

            analysis_ts = parse_date(analysis_date)
            years = int(payload.get("years", 3))
            start_ts = analysis_ts - pd.DateOffset(years=years + 1)
            df = fetch_cached(fetch_akshare_weekly, symbol, start_ts, analysis_ts, "weekly", "周线")
            daily_df = fetch_cached(fetch_akshare_daily, symbol, start_ts, analysis_ts, "daily", "日线")
            if df.empty:
                raise ValueError(f"AKShare did not return weekly data for {symbol}. Check the stock code and date.")
            result = analyze(
                df=df,
                analysis_date=analysis_date,
                years=years,
                corrections=payload.get("corrections") or [],
                swing_window=int(payload.get("swingWindow", 3)),
                cluster_pct=float(payload.get("clusterPct", 0.015)),
                body_bin_pct=float(payload.get("bodyBinPct", 0.01)),
                reaction_pct=float(payload.get("reactionPct", 0.03)),
                daily_df=daily_df,
            )
            self.write_json(200, result)
        except Exception as exc:
            self.write_json(400, {"error": str(exc)})

    def random_training_sample(self):
        start = pd.Timestamp("2024-01-01")
        end = min(pd.Timestamp("2026-05-31"), pd.Timestamp.today().normalize() - pd.Timedelta(days=30))
        offset = random.randint(0, max((end - start).days, 1))
        return {
            "symbol": random.choice(RANDOM_SYMBOLS),
            "date": (start + pd.Timedelta(days=offset)).strftime("%Y-%m-%d"),
        }

    def write_json(self, status, data):
        body = json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    server = ThreadingHTTPServer(("127.0.0.1", 8765), TradingAdviceHandler)
    print("Trading advice server running at http://127.0.0.1:8765/")
    server.serve_forever()


if __name__ == "__main__":
    main()
