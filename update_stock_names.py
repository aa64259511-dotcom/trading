import argparse
import json
import sqlite3
import unicodedata
from pathlib import Path

import akshare as ak


GBK_INITIAL_RANGES = [
    (-20319, -20284, "A"),
    (-20283, -19776, "B"),
    (-19775, -19219, "C"),
    (-19218, -18711, "D"),
    (-18710, -18527, "E"),
    (-18526, -18240, "F"),
    (-18239, -17923, "G"),
    (-17922, -17418, "H"),
    (-17417, -16475, "J"),
    (-16474, -16213, "K"),
    (-16212, -15641, "L"),
    (-15640, -15166, "M"),
    (-15165, -14923, "N"),
    (-14922, -14915, "O"),
    (-14914, -14631, "P"),
    (-14630, -14150, "Q"),
    (-14149, -14091, "R"),
    (-14090, -13319, "S"),
    (-13318, -12839, "T"),
    (-12838, -12557, "W"),
    (-12556, -11848, "X"),
    (-11847, -11056, "Y"),
    (-11055, -10247, "Z"),
]

CHAR_INITIAL_OVERRIDES = {
    "锂": "L",
    "钴": "G",
    "镍": "N",
    "铝": "L",
    "锌": "X",
    "钛": "T",
    "钼": "M",
    "钨": "W",
    "锰": "M",
    "锆": "G",
    "硅": "G",
    "碳": "T",
    "磷": "L",
    "氟": "F",
    "氢": "Q",
    "储": "C",
    "能": "N",
    "源": "Y",
    "芯": "X",
    "锂": "L",
    "行": "H",
    "厦": "X",
    "长": "C",
    "重": "C",
    "藏": "Z",
}


def chinese_initial(char):
    normalized = unicodedata.normalize("NFKC", char)
    if normalized in CHAR_INITIAL_OVERRIDES:
        return CHAR_INITIAL_OVERRIDES[normalized]
    if normalized.isascii() and normalized.isalnum():
        return normalized.upper()
    try:
        encoded = normalized.encode("gbk")
    except UnicodeEncodeError:
        return ""
    if len(encoded) < 2:
        return ""
    code = encoded[0] * 256 + encoded[1] - 65536
    for start, end, initial in GBK_INITIAL_RANGES:
        if start <= code <= end:
            return initial
    return ""


def initials_for_name(name):
    return "".join(chinese_initial(char) for char in str(name).strip())


def local_symbols(db_path):
    if not db_path.exists():
        return None
    with sqlite3.connect(db_path) as conn:
        rows = conn.execute("SELECT symbol FROM daily_prices GROUP BY symbol").fetchall()
    return {str(row[0]).zfill(6) for row in rows}


def main():
    parser = argparse.ArgumentParser(description="更新A股股票名称和拼音首字母索引")
    parser.add_argument("--db", default="market_data.sqlite", help="本地行情数据库路径")
    parser.add_argument("--out", default="stock_names.json", help="输出索引文件")
    args = parser.parse_args()

    allowed = local_symbols(Path(args.db))
    df = ak.stock_info_a_code_name()
    records = []
    for row in df.itertuples(index=False):
        symbol = str(getattr(row, "code")).strip().zfill(6)
        if allowed is not None and symbol not in allowed:
            continue
        name = unicodedata.normalize("NFKC", str(getattr(row, "name")).strip()).replace(" ", "")
        records.append({
            "symbol": symbol,
            "name": name,
            "initials": initials_for_name(name),
        })
    records.sort(key=lambda item: item["symbol"])
    Path(args.out).write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"updated {args.out}: {len(records)} stocks")


if __name__ == "__main__":
    main()
