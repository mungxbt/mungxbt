"""
KSEI Ownership Scraper
Scrape data kepemilikan saham >1% dari IDX public API
Output: data/ksei.json
"""

import json
import time
import os
import re
from datetime import datetime
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError
from urllib.parse import urlencode

# ─── CONFIG ────────────────────────────────────────────────────────────────────
OUTPUT_PATH = "data/ksei.json"
DELAY_BETWEEN_REQUESTS = 1.2   # detik antar request (jangan terlalu cepat)
MAX_RETRIES = 3
TIMEOUT = 30

# Endpoint IDX public (unofficial, sudah banyak dipakai komunitas)
IDX_BASE = "https://www.idx.co.id"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; KSEI-Scraper/1.0)",
    "Accept": "application/json",
    "Referer": "https://www.idx.co.id/",
}

# ─── UTILS ─────────────────────────────────────────────────────────────────────
def fetch(url, retries=MAX_RETRIES):
    for attempt in range(retries):
        try:
            req = Request(url, headers=HEADERS)
            with urlopen(req, timeout=TIMEOUT) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except (HTTPError, URLError) as e:
            print(f"  [!] Attempt {attempt+1}/{retries} failed: {e}")
            if attempt < retries - 1:
                time.sleep(2 ** attempt)  # exponential backoff
    return None

def fmt_number(s):
    """Bersihkan string angka dari IDX jadi int"""
    if not s:
        return 0
    try:
        return int(str(s).replace(",", "").replace(".", "").strip())
    except:
        return 0

# ─── STEP 1: Ambil semua ticker dari IDX ────────────────────────────────────────
def get_all_tickers():
    print("→ Fetching semua ticker dari IDX...")
    url = f"{IDX_BASE}/primary/StockData/GetSecurities?start=0&length=9999&type=s"
    data = fetch(url)
    if not data or "data" not in data:
        print("  [!] Gagal fetch ticker list")
        return []
    tickers = []
    for item in data["data"]:
        code = item.get("Code", "").strip()
        name = item.get("Name", "").strip()
        sector = item.get("Sector", "").strip()
        if code:
            tickers.append({"code": code, "name": name, "sector": sector})
    print(f"  ✓ {len(tickers)} tickers ditemukan")
    return tickers

# ─── STEP 2: Ambil shareholders per ticker ─────────────────────────────────────
def get_shareholders(ticker_code):
    """Ambil pemegang saham >1% untuk satu ticker"""
    url = (
        f"{IDX_BASE}/primary/TradingData/GetStockHolder"
        f"?StockCode={ticker_code}&start=0&length=100"
    )
    data = fetch(url)
    if not data or "data" not in data:
        return []

    holders = []
    for row in data.get("data", []):
        # Field names dari IDX API (bisa berubah, sudah di-handle fallback)
        investor = (
            row.get("HolderName") or
            row.get("Holder") or
            row.get("ShareholderName") or ""
        ).strip().upper()

        pct_raw = row.get("Percentage") or row.get("Pct") or row.get("Portion") or 0
        try:
            pct = float(str(pct_raw).replace(",", ".").replace("%", "").strip())
        except:
            pct = 0.0

        shares_raw = row.get("Shares") or row.get("SharesAmount") or 0
        shares = fmt_number(shares_raw)

        # Deteksi tipe investor dari nama
        investor_type = classify_investor(investor)
        is_foreign = classify_foreign(investor)

        if investor and pct >= 1.0:
            holders.append({
                "investor": investor,
                "type": investor_type,
                "lf": "F" if is_foreign else "L",
                "shares": shares,
                "pct": round(pct, 4),
            })

    # Sort by pct desc
    holders.sort(key=lambda x: x["pct"], reverse=True)
    return holders

# ─── CLASSIFIER ────────────────────────────────────────────────────────────────
CORPORATE_KEYWORDS = ["PT ", "TBK", "LTD", "INC", "PLC", "CORP", "CO.", "GROUP",
                       "FUND", "TRUST", "BANK", "HOLDING", "INVESTMENT", "VENTURES",
                       "ENTERPRISES", "PARTNERS", "CAPITAL", "MANAGEMENT", "ASSET"]
MUTUAL_FUND_KEYWORDS = ["REKSA DANA", "MUTUAL FUND", "DANA", "SCHRODERS", "MANULIFE",
                         "DANAREKSA", "SUCORINVEST", "EMCO", "PANIN", "TRIMEGAH",
                         "FIDELITY", "VANGUARD", "BLACKROCK", "HSBC AMANAH"]
INV_BANK_KEYWORDS = ["SECURITIES", "SEKURITAS", "BROKERAGE", "UBS", "CREDIT SUISSE",
                      "GOLDMAN", "MORGAN", "CITIBANK", "DEUTSCHE", "MERRILL",
                      "UOB KAY HIAN", "CLSA", "MACQUARIE", "NOMURA"]
FOREIGN_KEYWORDS = ["GOVERNMENT OF", "KINGDOM OF", "SINGAPORE", "NORWAY", "MALAYSIA",
                     "JAPAN", "KOREA", "CHINA", "HONGKONG", "HONG KONG", "USA",
                     "UNITED STATES", "AUSTRALIA", "UK ", "UNITED KINGDOM",
                     "CAYMAN", "LUXEMBOURG", "NETHERLANDS", "SWITZERLAND",
                     "JARDINE", "VALE ", "BANPU", "FIDELITY", "VANGUARD",
                     "BLACKROCK", "SCHRODERS", "UBS", "CREDIT SUISSE",
                     "GOLDMAN", "MORGAN STANLEY", "CITIBANK", "DEUTSCHE",
                     "HSBC", "STANDARD CHARTERED", "DBS ", "OCBC", "UOB ",
                     "MITSUI", "SUMITOMO", "TOYOTA", "LTD.", " INC.", " PLC",
                     "UOB KAY HIAN", "CLSA", "MACQUARIE", "NOMURA",
                     "GOVERNMENT OF THE KINGDOM", "BANK OF SINGAPORE"]

def classify_investor(name):
    n = name.upper()
    for kw in MUTUAL_FUND_KEYWORDS:
        if kw in n:
            return "MF"
    for kw in INV_BANK_KEYWORDS:
        if kw in n:
            return "IB"
    for kw in CORPORATE_KEYWORDS:
        if kw in n:
            return "CP"
    return "ID"  # default: individual

def classify_foreign(name):
    n = name.upper()
    for kw in FOREIGN_KEYWORDS:
        if kw in n:
            return True
    return False

# ─── STEP 3: Hitung stats ───────────────────────────────────────────────────────
def compute_stats(records):
    all_investors = set()
    local_pct_sum = 0
    foreign_pct_sum = 0
    total_entries = 0

    for r in records:
        all_investors.add(r["investor"])
        if r["lf"] == "L":
            local_pct_sum += r["pct"]
        else:
            foreign_pct_sum += r["pct"]
        total_entries += 1

    total = local_pct_sum + foreign_pct_sum
    local_ratio = round(local_pct_sum / total * 100, 1) if total else 0
    foreign_ratio = round(foreign_pct_sum / total * 100, 1) if total else 0

    return {
        "total_investors": len(all_investors),
        "local_pct": local_ratio,
        "foreign_pct": foreign_ratio,
    }

# ─── MAIN ──────────────────────────────────────────────────────────────────────
def main():
    print("=" * 60)
    print("KSEI Ownership Scraper")
    print(f"Started: {datetime.now().isoformat()}")
    print("=" * 60)

    # Buat output dir
    os.makedirs("data", exist_ok=True)

    # 1. Ambil semua ticker
    tickers = get_all_tickers()
    if not tickers:
        print("[ERROR] Tidak bisa fetch ticker list. Abort.")
        return

    # 2. Per ticker, ambil shareholders
    all_records = []
    ticker_summary = {}
    success = 0
    failed = 0

    for i, t in enumerate(tickers):
        code = t["code"]
        print(f"[{i+1}/{len(tickers)}] {code} — {t['name'][:40]}")

        holders = get_shareholders(code)
        if holders is None:
            failed += 1
            print(f"  [!] Skip (fetch failed)")
        else:
            for h in holders:
                all_records.append({
                    "ticker": code,
                    "company": t["name"],
                    "sector": t["sector"],
                    **h
                })
            ticker_summary[code] = {
                "name": t["name"],
                "sector": t["sector"],
                "holders": holders,
            }
            success += 1
            if holders:
                print(f"  ✓ {len(holders)} holders")
            else:
                print(f"  — no 1%+ holders")

        time.sleep(DELAY_BETWEEN_REQUESTS)

    # 3. Stats
    stats = compute_stats(all_records)
    stats["total_tickers"] = success

    # 4. Output JSON
    output = {
        "generated_at": datetime.now().isoformat(),
        "stats": stats,
        "records": all_records,
        "tickers": ticker_summary,
    }

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, separators=(",", ":"))

    size_kb = os.path.getsize(OUTPUT_PATH) / 1024
    print("\n" + "=" * 60)
    print(f"✓ Done! {success} tickers scraped, {failed} failed")
    print(f"✓ {len(all_records)} total holder records")
    print(f"✓ Output: {OUTPUT_PATH} ({size_kb:.1f} KB)")
    print(f"  Local: {stats['local_pct']}% | Foreign: {stats['foreign_pct']}%")
    print("=" * 60)

if __name__ == "__main__":
    main()
