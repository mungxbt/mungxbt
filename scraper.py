"""
KSEI Balance Position Parser v3
Baca file Balancepos*.txt yang sudah ada di repo (folder data/raw/)
Tidak ada network request — tidak bisa di-block.

Cara pakai:
1. Download file dari https://web.ksei.co.id/archive_download/holding_composition
2. Simpan di data/raw/Balancepos20260227.txt (atau tanggal apapun)
3. Jalankan: python scraper.py
4. Output: data/ksei.json
"""

import json, os, re, glob
from datetime import datetime

RAW_DIR     = "data/raw"
OUTPUT_PATH = "data/ksei.json"

def num(s):
    try: return int(s.strip()) if s.strip() else 0
    except: return 0

def find_latest_file():
    files = glob.glob(os.path.join(RAW_DIR, "*.txt"))
    if not files:
        return None
    files.sort(reverse=True)
    return files[0]

def parse_file(filepath):
    print(f"-> Parsing {filepath}...")
    records = []
    with open(filepath, encoding="utf-8", errors="replace") as f:
        lines = f.readlines()
    for i, line in enumerate(lines):
        line = line.strip()
        if not line: continue
        parts = line.split("|")
        if i == 0 and parts[0].upper() == "DATE": continue
        if len(parts) < 25: continue
        try:
            ticker  = parts[1].strip()
            if parts[2].strip() != "EQUITY": continue
            sec_num = num(parts[3])
            price   = num(parts[4])
            if sec_num == 0: continue
            l = [num(parts[x]) for x in range(5,15)]
            f = [num(parts[x]) for x in range(15,25)]
            l_total, f_total = l[9], f[9]
            lp = round(l_total/sec_num*100, 4)
            fp = round(f_total/sec_num*100, 4)
            tp = round((l_total+f_total)/sec_num*100, 4)
            keys = ["IS","CP","PF","IB","ID","MF","SC","FD","OT","total"]
            records.append({
                "ticker": ticker, "sec_num": sec_num, "price": price,
                "local":   dict(zip(keys,l),   pct=lp),
                "foreign": dict(zip(keys,f),   pct=fp),
                "total_pct": tp, "free_float": round(max(0,100-tp),4),
            })
        except Exception as e:
            print(f"  [!] Skip baris {i}: {e}")
    print(f"  OK {len(records)} tickers")
    return records

def main():
    print("="*60)
    print("KSEI Balance Position Parser v3")
    print(f"Started: {datetime.now().isoformat()}")
    print("="*60)
    os.makedirs(RAW_DIR, exist_ok=True)
    os.makedirs("data", exist_ok=True)

    filepath = find_latest_file()
    if not filepath:
        print(f"[ERROR] Tidak ada file .txt di {RAW_DIR}/")
        print("  Download dari: https://web.ksei.co.id/archive_download/holding_composition")
        print(f"  Simpan ke: {RAW_DIR}/Balancepos20260227.txt")
        with open(OUTPUT_PATH,"w") as f:
            json.dump({"error":"No raw file","records":[],"stats":{},"generated_at":datetime.now().isoformat()},f)
        exit(1)

    records = parse_file(filepath)
    tl = sum(r["local"]["total"] for r in records)
    tf = sum(r["foreign"]["total"] for r in records)
    g  = tl+tf or 1
    stats = {"total_tickers":len(records),"local_pct":round(tl/g*100,1),"foreign_pct":round(tf/g*100,1)}

    m = re.search(r'(\d{8})', os.path.basename(filepath))
    rd = m.group(1) if m else "unknown"
    if rd != "unknown": rd = f"{rd[:4]}-{rd[4:6]}-{rd[6:8]}"

    out = {"generated_at":datetime.now().isoformat(),"data_date":rd,
           "source_file":os.path.basename(filepath),"stats":stats,"records":records}
    with open(OUTPUT_PATH,"w",encoding="utf-8") as f:
        json.dump(out,f,ensure_ascii=False,separators=(",",":"))

    print(f"Done! {len(records)} tickers | Local:{stats['local_pct']}% Foreign:{stats['foreign_pct']}%")
    print(f"Output: {OUTPUT_PATH} ({os.path.getsize(OUTPUT_PATH)//1024} KB)")

if __name__ == "__main__":
    main()
