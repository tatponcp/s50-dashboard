"""
supabase_upload.py — ส่ง snapshot รายวันขึ้น Supabase (ฐานข้อมูลถาวร)
================================================================
data.json ที่ root เก็บ history แค่ ~60 วัน (พอสำหรับ dashboard)
แต่ Supabase เก็บ "ทุกวันตลอดไป" ไว้เป็นคลังข้อมูลจริง — ใช้ต่อยอด
IV Rank ระยะยาว / backtest / วิเคราะห์ในอนาคตได้

ออกแบบให้ปลอดภัย:
  - ถ้าไม่ได้ตั้ง SUPABASE_URL / SUPABASE_SERVICE_KEY → ข้ามเงียบๆ
    (scraper ยังทำงานได้ปกติ เขียน data.json เหมือนเดิม)
  - upload ล้มเหลว = ไม่ทำให้ scraper พัง (data.json คือแหล่งหลักของ dashboard
    ส่วน Supabase เป็นส่วนเสริม) — โยน error ให้ main ตัดสินใจว่าจะเตือนหรือหยุด

ใช้ REST API ของ Supabase (PostgREST) ตรงๆ ผ่าน requests ที่มีอยู่แล้ว
จึงไม่ต้องเพิ่ม dependency supabase-py

ตั้งค่า (GitHub Secrets หรือ env ในเครื่อง):
    SUPABASE_URL          เช่น https://xxxx.supabase.co
    SUPABASE_SERVICE_KEY  service_role key (ข้าม RLS ได้ — เก็บเป็นความลับ!)

รัน backfill ประวัติเดิมใน data.json ขึ้น Supabase ครั้งเดียว:
    python scraper/supabase_upload.py --backfill
"""

import os
import sys
import json
from pathlib import Path

import requests

# Windows console (cp874/cp1252) พิมพ์ emoji บางตัวไม่ได้ → บังคับ utf-8 กัน crash
# (เหมือน tfex_scraper.py — จำเป็นตอนรัน --backfill เดี่ยวๆ บน Windows)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
DATA_FILE = ROOT / "data.json"

# คีย์ใน series ที่เป็น metadata ไม่ใช่ราคาสไตรค์ — ข้ามตอนวนสไตรค์
NON_STRIKE_KEYS = ("expiry", "dte")

TIMEOUT = 30


def _config() -> tuple[str, str] | None:
    """คืน (url, key) ถ้าตั้ง env ครบ; ไม่ครบ → None (แปลว่า 'ข้าม Supabase')"""
    url = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
    if not url or not key:
        return None
    return url, key


def _headers(key: str) -> dict:
    """header สำหรับ upsert: merge-duplicates = ชนคีย์ซ้ำให้อัปเดตทับ"""
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        # merge-duplicates: ถ้า PK ซ้ำให้อัปเดต (รันซ้ำวันเดิม = เขียนทับ ไม่ error)
        # return=minimal: ไม่ต้องส่ง row กลับมา ประหยัด bandwidth
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }


def _upsert(url: str, key: str, table: str, rows: list[dict]) -> None:
    """POST upsert แถวลง table เดียว — โยน error ถ้า HTTP ไม่ผ่าน"""
    if not rows:
        return
    resp = requests.post(
        f"{url}/rest/v1/{table}",
        headers=_headers(key),
        data=json.dumps(rows),
        timeout=TIMEOUT,
    )
    if not resp.ok:
        raise RuntimeError(
            f"upsert {table} ล้มเหลว: HTTP {resp.status_code} — {resp.text[:400]}")


def _summary_row(entry: dict) -> dict:
    """แปลง snapshot (payload หรือ history entry) → แถว daily_summary"""
    return {
        "trade_date": entry["date"],
        "spot": entry.get("spot"),
        "spot_chg": entry.get("spotChg"),
        "dte": entry.get("dte"),
        "source": entry.get("source", "TFEX"),
    }


def _series_rows(entry: dict) -> list[dict]:
    """แปลง snapshot → หลายแถวของ options_series (ราย strike ต่อซีรีส์)"""
    trade_date = entry["date"]
    rows: list[dict] = []
    for series_code, series in entry.get("series", {}).items():
        expiry = series.get("expiry")
        if not expiry:
            # ไม่มี expiry = เพี้ยน ข้ามซีรีส์นี้ (FK/PK ต้องมี expiry)
            continue
        for strike_key, cell in series.items():
            if strike_key in NON_STRIKE_KEYS:
                continue
            rows.append({
                "trade_date":  trade_date,
                "series_code": series_code,
                "expiry":      expiry,
                "strike":      float(strike_key),
                "call_oi":     cell.get("callOI"),
                "put_oi":      cell.get("putOI"),
                "call_vol":    cell.get("callVol"),
                "put_vol":     cell.get("putVol"),
                "call_iv":     cell.get("callIV"),
                "put_iv":      cell.get("putIV"),
                "call_delta":  cell.get("callDelta"),
                "put_delta":   cell.get("putDelta"),
                "call_gamma":  cell.get("callGamma"),
                "put_gamma":   cell.get("putGamma"),
            })
    return rows


def _upload_snapshot(url: str, key: str, entry: dict) -> int:
    """อัป 1 วัน: daily_summary ก่อน (FK) แล้วค่อย options_series — คืนจำนวน strike"""
    _upsert(url, key, "daily_summary", [_summary_row(entry)])
    rows = _series_rows(entry)
    _upsert(url, key, "options_series", rows)
    return len(rows)


def upload_payload(payload: dict) -> bool:
    """
    ส่ง snapshot "วันนี้" ขึ้น Supabase (เรียกจาก scraper หลังเขียน data.json)
    คืน True = อัปแล้ว, False = ข้าม (ไม่ได้ตั้ง env) — โยน error ถ้าอัปแล้วพัง
    """
    cfg = _config()
    if cfg is None:
        print("ℹ ไม่ได้ตั้ง SUPABASE_URL/SUPABASE_SERVICE_KEY — ข้ามการอัปขึ้น Supabase")
        return False
    url, key = cfg
    n = _upload_snapshot(url, key, payload)
    print(f"☁ อัปขึ้น Supabase แล้ว: {payload['date']} ({n} strikes)")
    return True


def backfill() -> None:
    """อัปทั้ง history + วันปัจจุบันใน data.json ขึ้น Supabase (idempotent — รันซ้ำได้)"""
    cfg = _config()
    if cfg is None:
        sys.exit("❌ ต้องตั้ง SUPABASE_URL และ SUPABASE_SERVICE_KEY ก่อน backfill")
    url, key = cfg

    if not DATA_FILE.exists():
        sys.exit(f"❌ ไม่พบ {DATA_FILE}")
    data = json.loads(DATA_FILE.read_text(encoding="utf-8"))

    # history (เก่า→ใหม่) + วันปัจจุบัน ตัดวันซ้ำ (upsert อยู่แล้วแต่กันไว้ให้ log สวย)
    snapshots = list(data.get("history", []))
    snapshots.append(data)   # top-level = วันล่าสุด
    seen, ordered = set(), []
    for snap in snapshots:
        d = snap.get("date")
        if d and d not in seen:
            seen.add(d)
            ordered.append(snap)
    ordered.sort(key=lambda s: s["date"])

    print(f"⏳ backfill {len(ordered)} วันขึ้น Supabase ...")
    total = 0
    for snap in ordered:
        n = _upload_snapshot(url, key, snap)
        total += n
        print(f"  ☁ {snap['date']}: {n} strikes")
    print(f"✅ backfill เสร็จ: {len(ordered)} วัน, {total} แถวรวม")


if __name__ == "__main__":
    if "--backfill" in sys.argv:
        backfill()
    else:
        print("ใช้ backfill: python scraper/supabase_upload.py --backfill")
        print("(การอัปรายวันปกติ scraper จะเรียก upload_payload() ให้เอง)")
