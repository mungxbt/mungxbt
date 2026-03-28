"""
KSEI Balance Position Scraper v2
Download file resmi dari web.ksei.co.id dan parse langsung.
Tidak ada scraping per-ticker — jauh lebih cepat dan tidak kena 403.

Output: data/ksei.json
"""

import json
import os
import re
from datetime import datetime, date
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError

OUTPUT_PATH = "data/ksei.json"
TIMEOUT = 60

# ─── KSEI FILE URL ─────────────────────────────────────────────────────────────
# Format URL: https://web.ksei.co.id/archive_download/holding_composition
# File: Balancepos{YYYYMMDD}.txt — gw auto-detect tanggal terbaru

BASE_URL = "https://web.ksei.co.id"
ARCHIVE_PAGE = f"{BASE_URL}/archive_download/holding_composition"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Referer": BASE_URL,
}

# ─── KOLOM FILE ────────────────────────────────────────────────────────────────
# Date|Code|Type|Sec. Num|Price|
# Local IS|Local CP|Local PF|Local IB|Local ID|Local MF|Local SC|Local FD|Local OT|Total|
# Foreign IS|Foreign CP|Foreign PF|Foreign IB|Foreign ID|Foreign MF|Foreign SC|Foreign FD|Foreign OT|Total
#
# IS=Insurance, CP=Corporate, PF=Pension Fund, IB=Inv.Bank, ID=Individual
# MF=Mutual Fund, SC=Securities, FD=Foundation, OT=Other

COL_NAMES = [
    "date","code","type","sec_num","price",
    "l_is","l_cp","l_pf","l_ib","l_id","l_mf","l_sc","l_fd","l_ot","l_total",
    "f_is","f_cp","f_pf","f_ib","f_id","f_mf","f_sc","f_fd","f_ot","f_total",
]

# ─── SEKTOR MAPPING (IDX sector codes) ─────────────────────────────────────────
# Ini approximate — bisa diupdate dengan data lengkap dari IDX
SECTOR_MAP = {
    "BBCA":"Financial Services","BBRI":"Financial Services","BMRI":"Financial Services",
    "BBNI":"Financial Services","BRIS":"Financial Services","BJTM":"Financial Services",
    "TLKM":"Communication Services","EXCL":"Communication Services","ISAT":"Communication Services",
    "ASII":"Consumer Cyclical","AALI":"Consumer Defensive","ICBP":"Consumer Defensive",
    "INDF":"Consumer Defensive","MYOR":"Consumer Defensive","UNVR":"Consumer Defensive",
    "ADRO":"Energy","PTBA":"Energy","ITMG":"Energy","INCO":"Basic Materials",
    "ANTM":"Basic Materials","TINS":"Basic Materials","SMGR":"Basic Materials",
    "PGAS":"Utilities","TLKM":"Communication Services",
}

def num(s):
    try: return int(s.strip()) if s.strip() else 0
    except: return 0

# ─── STEP 1: Cari URL file terbaru ─────────────────────────────────────────────
def find_latest_file_url():
    """Scrape halaman arsip KSEI untuk dapat URL file terbaru"""
    print("→ Mencari file terbaru di KSEI archive...")
    try:
        req = Request(ARCHIVE_PAGE, headers=HEADERS)
        with urlopen(req, timeout=TIMEOUT) as resp:
            html = resp.read().decode("utf-8", errors="replace")

        # Cari semua link ke file Balancepos*.txt
        pattern = r'href=["\']([^"\']*Balancepos\d+\.txt)["\']'
        matches = re.findall(pattern, html, re.IGNORECASE)

        if not matches:
            # Fallback: coba format URL langsung dengan tanggal bulan ini
            today = date.today()
            # Coba tanggal akhir bulan lalu (KSEI biasanya update awal bulan)
            if today.month == 1:
                last_month = date(today.year - 1, 12, 27)
            else:
                last_month = date(today.year, today.month - 1, 27)
            fallback = f"{BASE_URL}/files/Balancepos{last_month.strftime('%Y%m%d')}.txt"
            print(f"  [!] Tidak bisa parse halaman, mencoba fallback: {fallback}")
            return fallback

        # Ambil yang terbaru (biasanya yang pertama atau terakhir)
        urls = []
        for m in matches:
            url = m if m.startswith("http") else BASE_URL + m
            urls.append(url)

        # Sort by tanggal dari nama file
        def extract_date(url):
            m = re.search(r'Balancepos(\d{8})\.txt', url, re.IGNORECASE)
            return m.group(1) if m else "00000000"

        urls.sort(key=extract_date, reverse=True)
        latest = urls[0]
        print(f"  ✓ File terbaru: {latest}")
        return latest

    except Exception as e:
        print(f"  [!] Gagal parse archive page: {e}")
        return None

# ─── STEP 2: Download file ─────────────────────────────────────────────────────
def download_file(url):
    print(f"→ Downloading {url}...")
    try:
        req = Request(url, headers=HEADERS)
        with urlopen(req, timeout=TIMEOUT) as resp:
            content = resp.read().decode("utf-8", errors="replace")
        lines = content.strip().splitlines()
        print(f"  ✓ {len(lines)} baris didownload")
        return lines
    except Exception as e:
        print(f"  [!] Download gagal: {e}")
        return None

# ─── STEP 3: Parse file ────────────────────────────────────────────────────────
def parse_lines(lines):
    """Parse pipe-delimited file KSEI jadi list of dict"""
    records = []
    header = None

    for i, line in enumerate(lines):
        line = line.strip()
        if not line:
            continue

        parts = line.split("|")

        # Skip header baris pertama
        if i == 0 and parts[0].upper() == "DATE":
            header = parts
            continue

        if len(parts) < 25:
            continue

        try:
            ticker = parts[1].strip()
            typ    = parts[2].strip()
            if typ != "EQUITY":
                continue  # skip non-equity (bonds, warrants, dll)

            sec_num = num(parts[3])
            price   = num(parts[4])

            # Local breakdown
            l_is = num(parts[5])
            l_cp = num(parts[6])
            l_pf = num(parts[7])
            l_ib = num(parts[8])
            l_id = num(parts[9])
            l_mf = num(parts[10])
            l_sc = num(parts[11])
            l_fd = num(parts[12])
            l_ot = num(parts[13])
            l_total = num(parts[14])

            # Foreign breakdown
            f_is = num(parts[15])
            f_cp = num(parts[16])
            f_pf = num(parts[17])
            f_ib = num(parts[18])
            f_id = num(parts[19])
            f_mf = num(parts[20])
            f_sc = num(parts[21])
            f_fd = num(parts[22])
            f_ot = num(parts[23])
            f_total = num(parts[24])

            total_held = l_total + f_total
            if sec_num == 0:
                continue

            local_pct  = round(l_total / sec_num * 100, 4)
            foreign_pct= round(f_total / sec_num * 100, 4)
            total_pct  = round(total_held / sec_num * 100, 4)
            free_float = round(max(0, 100 - total_pct), 4)

            records.append({
                "ticker":      ticker,
                "sec_num":     sec_num,
                "price":       price,
                "local": {
                    "total":   l_total,
                    "pct":     local_pct,
                    "IS":      l_is,   # Insurance
                    "CP":      l_cp,   # Corporate
                    "PF":      l_pf,   # Pension Fund
                    "IB":      l_ib,   # Investment Bank
                    "ID":      l_id,   # Individual
                    "MF":      l_mf,   # Mutual Fund
                    "SC":      l_sc,   # Securities
                    "FD":      l_fd,   # Foundation
                    "OT":      l_ot,   # Other
                },
                "foreign": {
                    "total":   f_total,
                    "pct":     foreign_pct,
                    "IS":      f_is,
                    "CP":      f_cp,
                    "PF":      f_pf,
                    "IB":      f_ib,
                    "ID":      f_id,
                    "MF":      f_mf,
                    "SC":      f_sc,
                    "FD":      f_fd,
                    "OT":      f_ot,
                },
                "total_pct":   total_pct,
                "free_float":  free_float,
                "sector":      SECTOR_MAP.get(ticker, ""),
            })
        except Exception as e:
            print(f"  [!] Skip baris {i}: {e}")
            continue

    return records

# ─── STEP 4: Hitung stats ───────────────────────────────────────────────────────
def compute_stats(records):
    total_local  = sum(r["local"]["total"]   for r in records)
    total_foreign= sum(r["foreign"]["total"] for r in records)
    grand_total  = total_local + total_foreign or 1

    # Distribusi tipe investor (lokal)
    type_totals = {}
    for r in records:
        for t in ["IS","CP","PF","IB","ID","MF","SC","FD","OT"]:
            type_totals[t] = type_totals.get(t, 0) + r["local"][t] + r["foreign"][t]

    return {
        "total_tickers":  len(records),
        "local_pct":      round(total_local  / grand_total * 100, 1),
        "foreign_pct":    round(total_foreign/ grand_total * 100, 1),
        "investor_types": type_totals,
    }

# ─── MAIN ──────────────────────────────────────────────────────────────────────
def main():
    print("=" * 60)
    print("KSEI Balance Position Scraper v2")
    print(f"Started: {datetime.now().isoformat()}")
    print("=" * 60)

    os.makedirs("data", exist_ok=True)

    # 1. Cari URL file terbaru
    url = find_latest_file_url()
    if not url:
        print("[ERROR] Tidak bisa dapat URL file KSEI. Abort.")
        # Tulis JSON error supaya check output tidak gagal karena file tidak ada
        with open(OUTPUT_PATH, "w") as f:
            json.dump({"error": "Cannot find file URL", "records": [], "stats": {}}, f)
        return

    # 2. Download
    lines = download_file(url)
    if not lines:
        print("[ERROR] Download gagal. Abort.")
        with open(OUTPUT_PATH, "w") as f:
            json.dump({"error": "Download failed", "records": [], "stats": {}}, f)
        return

    # 3. Parse
    print("→ Parsing data...")
    records = parse_lines(lines)
    print(f"  ✓ {len(records)} ticker equity diparsing")

    # 4. Extract tanggal dari nama file
    date_match = re.search(r'Balancepos(\d{8})\.txt', url, re.IGNORECASE)
    file_date = date_match.group(1) if date_match else "unknown"
    if file_date != "unknown":
        file_date = f"{file_date[:4]}-{file_date[4:6]}-{file_date[6:8]}"

    # 5. Stats
    stats = compute_stats(records)

    # 6. Output
    output = {
        "generated_at":  datetime.now().isoformat(),
        "data_date":     file_date,
        "source_url":    url,
        "stats":         stats,
        "records":       records,
    }

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, separators=(",", ":"))

    size_kb = os.path.getsize(OUTPUT_PATH) / 1024
    print("\n" + "=" * 60)
    print(f"✓ Done! {len(records)} tickers")
    print(f"✓ Data date: {file_date}")
    print(f"✓ Local: {stats['local_pct']}% | Foreign: {stats['foreign_pct']}%")
    print(f"✓ Output: {OUTPUT_PATH} ({size_kb:.1f} KB)")
    print("=" * 60)

if __name__ == "__main__":
    main()
