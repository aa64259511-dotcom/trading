import argparse
import json
import math
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd


REQUIRED_COLUMNS = ["date", "open", "high", "low", "close"]


@dataclass
class Level:
    type: str
    low: float
    high: float
    mid: float
    strength: float
    swing_score: float
    recent_score: float
    body_score: float
    recency_score: float
    touches: int
    sources: list[str]


def parse_date(value: str) -> pd.Timestamp:
    return pd.Timestamp(datetime.strptime(value, "%Y-%m-%d"))


def normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    aliases = {
        "日期": "date",
        "开盘": "open",
        "最高": "high",
        "最低": "low",
        "收盘": "close",
        "成交量": "volume",
        "成交额": "amount",
        "换手率": "turnover",
    }
    df = df.rename(columns={column: aliases.get(column, column) for column in df.columns})
    lowered = {column: str(column).strip().lower() for column in df.columns}
    df = df.rename(columns=lowered)
    missing = [column for column in REQUIRED_COLUMNS if column not in df.columns]
    if missing:
        raise ValueError(f"Missing required columns: {', '.join(missing)}")

    df = df.copy()
    df["date"] = pd.to_datetime(df["date"])
    for column in ["open", "high", "low", "close", "volume"]:
        if column in df.columns:
            df[column] = pd.to_numeric(df[column], errors="coerce")
    return df.dropna(subset=REQUIRED_COLUMNS).sort_values("date").reset_index(drop=True)


def load_csv(path: Path) -> pd.DataFrame:
    try:
        return normalize_columns(pd.read_csv(path, encoding="utf-8-sig"))
    except UnicodeDecodeError:
        return normalize_columns(pd.read_csv(path, encoding="gbk"))


def fetch_akshare_weekly(symbol: str, start: pd.Timestamp, end: pd.Timestamp) -> pd.DataFrame:
    try:
        import akshare as ak
    except ImportError as exc:
        raise RuntimeError("AKShare is not installed. Use --csv, or install akshare first.") from exc

    raw = ak.stock_zh_a_hist(
        symbol=symbol,
        period="weekly",
        start_date=start.strftime("%Y%m%d"),
        end_date=end.strftime("%Y%m%d"),
        adjust="qfq",
    )
    return normalize_columns(raw)


def window_data(df: pd.DataFrame, analysis_date: pd.Timestamp, years: int) -> pd.DataFrame:
    end_mask = df["date"] < analysis_date
    start_date = analysis_date - pd.DateOffset(years=years)
    result = df[end_mask & (df["date"] >= start_date)].copy()
    if len(result) < 30:
        raise ValueError("Not enough weekly candles before analysis date; need at least 30 rows.")
    return result.reset_index(drop=True)


def price_tolerance(price: float, tolerance_pct: float) -> float:
    return max(price * tolerance_pct, 0.01)


def find_swings(df: pd.DataFrame, window: int) -> list[dict]:
    swings = []
    for index in range(window, len(df) - window):
        block = df.iloc[index - window : index + window + 1]
        row = df.iloc[index]
        if row["high"] >= block["high"].max():
            swings.append({"type": "resistance", "price": row["high"], "index": index, "source": "swing_high"})
        if row["low"] <= block["low"].min():
            swings.append({"type": "support", "price": row["low"], "index": index, "source": "swing_low"})
    return swings


def cluster_points(points: list[dict], tolerance_pct: float) -> list[dict]:
    clusters = []
    for point in sorted(points, key=lambda item: item["price"]):
        placed = False
        for cluster in clusters:
            if point["type"] != cluster["type"]:
                continue
            if abs(point["price"] - cluster["mid"]) <= price_tolerance(cluster["mid"], tolerance_pct):
                cluster["points"].append(point)
                prices = [item["price"] for item in cluster["points"]]
                cluster["mid"] = float(np.mean(prices))
                cluster["low"] = float(min(prices))
                cluster["high"] = float(max(prices))
                placed = True
                break
        if not placed:
            clusters.append(
                {
                    "type": point["type"],
                    "mid": float(point["price"]),
                    "low": float(point["price"]),
                    "high": float(point["price"]),
                    "points": [point],
                }
            )
    return clusters


def body_contact_bins(df: pd.DataFrame, bin_pct: float, top_n: int) -> list[dict]:
    min_price = float(df[["open", "close"]].min().min())
    max_price = float(df[["open", "close"]].max().max())
    if min_price <= 0 or max_price <= min_price:
        return []

    step = max(float(df["close"].median()) * bin_pct, 0.01)
    edges = np.arange(min_price * 0.98, max_price * 1.02 + step, step)
    counts = np.zeros(len(edges) - 1)
    recency = np.zeros(len(edges) - 1)

    for index, row in df.iterrows():
        body_low = min(row["open"], row["close"])
        body_high = max(row["open"], row["close"])
        touched = np.where((edges[:-1] <= body_high) & (edges[1:] >= body_low))[0]
        age_factor = (index + 1) / len(df)
        counts[touched] += 1
        recency[touched] += age_factor

    if counts.max() == 0:
        return []

    candidates = []
    current_price = float(df.iloc[-1]["close"])
    threshold = max(np.quantile(counts[counts > 0], 0.72), 2)
    for index, count in enumerate(counts):
        if count < threshold:
            continue
        low = float(edges[index])
        high = float(edges[index + 1])
        mid = (low + high) / 2
        level_type = "support" if mid < current_price else "resistance"
        candidates.append(
            {
                "type": level_type,
                "low": low,
                "high": high,
                "mid": mid,
                "body_count": float(count),
                "body_recency": float(recency[index]),
                "source": "body_cluster",
            }
        )

    return sorted(candidates, key=lambda item: item["body_count"], reverse=True)[:top_n]


def overlap_or_near(zone: dict, price: float, tolerance_pct: float) -> bool:
    buffer = price_tolerance(zone["mid"], tolerance_pct)
    return zone["low"] - buffer <= price <= zone["high"] + buffer


def merge_zones(zones: list[dict], tolerance_pct: float) -> list[dict]:
    merged = []
    for zone in sorted(zones, key=lambda item: item["mid"]):
        placed = False
        for existing in merged:
            if zone["type"] != existing["type"]:
                continue
            if abs(zone["mid"] - existing["mid"]) <= price_tolerance(existing["mid"], tolerance_pct):
                existing["low"] = min(existing["low"], zone["low"])
                existing["high"] = max(existing["high"], zone["high"])
                existing["mid"] = (existing["low"] + existing["high"]) / 2
                existing["sources"].extend(zone.get("sources", [zone.get("source", "unknown")]))
                existing["points"].extend(zone.get("points", []))
                existing["body_count"] += zone.get("body_count", 0)
                placed = True
                break
        if not placed:
            merged.append(
                {
                    "type": zone["type"],
                    "low": float(zone["low"]),
                    "high": float(zone["high"]),
                    "mid": float(zone["mid"]),
                    "sources": list(zone.get("sources", [zone.get("source", "unknown")])),
                    "points": list(zone.get("points", [])),
                    "body_count": float(zone.get("body_count", 0)),
                }
            )
    return merged


def recent_validation_score(df: pd.DataFrame, zone: dict, tolerance_pct: float, reaction_pct: float) -> tuple[float, int]:
    score = 0.0
    touches = 0
    lookahead = 3
    for index in range(len(df) - lookahead):
        row = df.iloc[index]
        touched = row["low"] <= zone["high"] and row["high"] >= zone["low"]
        if not touched:
            continue
        touches += 1
        future = df.iloc[index + 1 : index + lookahead + 1]
        if zone["type"] == "support":
            held = row["close"] >= zone["low"] * (1 - tolerance_pct)
            reacted = future["close"].max() >= zone["mid"] * (1 + reaction_pct)
        else:
            held = row["close"] <= zone["high"] * (1 + tolerance_pct)
            reacted = future["close"].min() <= zone["mid"] * (1 - reaction_pct)
        if held and reacted:
            age_factor = (index + 1) / len(df)
            score += 1 + age_factor
    return score, touches


def score_zones(df: pd.DataFrame, zones: list[dict], weights: dict, tolerance_pct: float, reaction_pct: float) -> list[Level]:
    max_swing = max((len(zone.get("points", [])) for zone in zones), default=1)
    max_body = max((zone.get("body_count", 0) for zone in zones), default=1) or 1
    levels = []
    for zone in zones:
        recent_raw, touches = recent_validation_score(df, zone, tolerance_pct, reaction_pct)
        swing_score = min(len(zone.get("points", [])) / max_swing, 1) * 100
        body_score = min(zone.get("body_count", 0) / max_body, 1) * 100
        recent_score = min(recent_raw / 5, 1) * 100
        newest_index = max([point["index"] for point in zone.get("points", [])], default=len(df) - 1)
        recency_score = ((newest_index + 1) / len(df)) * 100
        strength = (
            swing_score * weights["swing"]
            + recent_score * weights["recent"]
            + body_score * weights["body"]
            + recency_score * weights["recency"]
        )
        sources = sorted(set(zone["sources"]))
        levels.append(
            Level(
                type=zone["type"],
                low=round(zone["low"], 3),
                high=round(zone["high"], 3),
                mid=round(zone["mid"], 3),
                strength=round(float(strength), 1),
                swing_score=round(float(swing_score), 1),
                recent_score=round(float(recent_score), 1),
                body_score=round(float(body_score), 1),
                recency_score=round(float(recency_score), 1),
                touches=int(touches),
                sources=sources,
            )
        )
    return sorted(levels, key=lambda level: level.strength, reverse=True)


def nearest_levels(levels: list[Level], current_price: float) -> dict:
    supports = [level for level in levels if level.type == "support" and level.high <= current_price]
    resistances = [level for level in levels if level.type == "resistance" and level.low >= current_price]
    nearest_support = min(supports, key=lambda item: current_price - item.mid, default=None)
    nearest_resistance = min(resistances, key=lambda item: item.mid - current_price, default=None)
    return {
        "support": asdict(nearest_support) if nearest_support else None,
        "resistance": asdict(nearest_resistance) if nearest_resistance else None,
    }


def distance_error(levels: list[Level], corrections: list[dict]) -> float:
    if not corrections:
        return 0
    total = 0.0
    for correction in corrections:
        level_type = correction["type"]
        target = float(correction["price"])
        typed = [level for level in levels if level.type == level_type]
        if not typed:
            total += 1
            continue
        best = min(typed, key=lambda level: abs(level.mid - target))
        total += abs(best.mid - target) / target
    return total / len(corrections)


def fit_weights(df: pd.DataFrame, zones: list[dict], corrections: list[dict], tolerance_pct: float, reaction_pct: float) -> dict:
    if not corrections:
        return {"swing": 0.3, "recent": 0.3, "body": 0.3, "recency": 0.1}

    candidates = []
    values = [0.1, 0.2, 0.3, 0.4, 0.5]
    for swing in values:
        for recent in values:
            for body in values:
                recency = 1 - swing - recent - body
                if recency < 0.05 or recency > 0.3:
                    continue
                weights = {"swing": swing, "recent": recent, "body": body, "recency": recency}
                levels = score_zones(df, zones, weights, tolerance_pct, reaction_pct)
                typed_levels = levels[:8]
                error = distance_error(typed_levels, corrections)
                candidates.append((error, weights))

    if not candidates:
        return {"swing": 0.3, "recent": 0.3, "body": 0.3, "recency": 0.1}
    return min(candidates, key=lambda item: item[0])[1]


def analyze(
    df: pd.DataFrame,
    analysis_date: str,
    years: int,
    corrections: list[dict] | None,
    swing_window: int,
    cluster_pct: float,
    body_bin_pct: float,
    reaction_pct: float,
) -> dict:
    analysis_ts = parse_date(analysis_date)
    training_df = window_data(df, analysis_ts, years)
    swings = find_swings(training_df, swing_window)
    swing_clusters = cluster_points(swings, cluster_pct)
    swing_zones = [
        {
            "type": cluster["type"],
            "low": cluster["low"] * (1 - cluster_pct / 2),
            "high": cluster["high"] * (1 + cluster_pct / 2),
            "mid": cluster["mid"],
            "source": "swing_cluster",
            "points": cluster["points"],
        }
        for cluster in swing_clusters
    ]
    dense_zones = body_contact_bins(training_df, body_bin_pct, top_n=12)
    zones = merge_zones(swing_zones + dense_zones, cluster_pct)
    corrections = corrections or []
    weights = fit_weights(training_df, zones, corrections, cluster_pct, reaction_pct)
    levels = score_zones(training_df, zones, weights, cluster_pct, reaction_pct)
    current_price = float(training_df.iloc[-1]["close"])
    return {
        "analysisDate": analysis_date,
        "trainingStart": training_df.iloc[0]["date"].strftime("%Y-%m-%d"),
        "trainingEnd": training_df.iloc[-1]["date"].strftime("%Y-%m-%d"),
        "weeks": int(len(training_df)),
        "currentPrice": round(current_price, 3),
        "weights": {key: round(value, 3) for key, value in weights.items()},
        "nearest": nearest_levels(levels, current_price),
        "levels": [asdict(level) for level in levels[:12]],
        "fitError": round(distance_error(levels[:8], corrections), 5) if corrections else None,
    }


def load_corrections(raw: str | None, path: str | None) -> list[dict]:
    if path:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    if raw:
        return json.loads(raw)
    return []


def main() -> None:
    parser = argparse.ArgumentParser(description="Train support and resistance levels from weekly A-share candles.")
    parser.add_argument("--symbol", required=True, help="A-share symbol, for example 000001")
    parser.add_argument("--date", required=True, help="Analysis date, YYYY-MM-DD")
    parser.add_argument("--csv", help="CSV with weekly or daily OHLC data. Required if AKShare is unavailable.")
    parser.add_argument("--corrections", help='JSON corrections, e.g. [{"type":"support","price":26.8}]')
    parser.add_argument("--corrections-file", help="Path to JSON corrections file")
    parser.add_argument("--years", type=int, default=3)
    parser.add_argument("--swing-window", type=int, default=3)
    parser.add_argument("--cluster-pct", type=float, default=0.015)
    parser.add_argument("--body-bin-pct", type=float, default=0.01)
    parser.add_argument("--reaction-pct", type=float, default=0.03)
    args = parser.parse_args()

    analysis_ts = parse_date(args.date)
    if args.csv:
        df = load_csv(Path(args.csv))
    else:
        df = fetch_akshare_weekly(args.symbol, analysis_ts - pd.DateOffset(years=args.years + 1), analysis_ts)

    corrections = load_corrections(args.corrections, args.corrections_file)
    result = analyze(
        df=df,
        analysis_date=args.date,
        years=args.years,
        corrections=corrections,
        swing_window=args.swing_window,
        cluster_pct=args.cluster_pct,
        body_bin_pct=args.body_bin_pct,
        reaction_pct=args.reaction_pct,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
