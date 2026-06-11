import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

import pandas as pd

from support_resistance_trainer import analyze, fetch_akshare_daily, fetch_akshare_weekly, parse_date


class TradingAdviceHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

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
            df = fetch_akshare_weekly(symbol, start_ts, analysis_ts)
            daily_df = fetch_akshare_daily(symbol, start_ts, analysis_ts)
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
