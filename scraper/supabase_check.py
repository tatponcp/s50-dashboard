"""
supabase_check.py — ตรวจสุขภาพข้อมูลบน Supabase (อ่านอย่างเดียว ปลอดภัย)
================================================================
ใช้ยืนยันว่าตั้งค่า Supabase + backfill สำเร็จจริง โดย "ไม่แก้ไขข้อมูลใดๆ"
พิมพ์สรุป: จำนวนแถวแต่ละตาราง, ช่วงวันที่, ซีรีส์, และเทียบกับ data.json

รันในเครื่อง (Windows PowerShell) — ใช้ venv เดียวกับ backfill:
    $env:SUPABASE_URL="https://xxxx.supabase.co"
    $env:SUPABASE_SERVICE_KEY="<service_role key>"
    .venv\\Scripts\\python scraper\\supabase_check.py

หมายเหตุความปลอดภัย: สคริปต์นี้ "ไม่พิมพ์ key ออกจอ" และเรียกแค่ GET เท่านั้น
"""

import os
import sys
import json
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
DATA_FILE = ROOT / "data.json"
NON_STRIKE_KEYS = ("expiry", "dte")
TIMEOUT = 30


def _config() -> tuple[str, str]:
    url = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
    if not url or not key:
        sys.exit("❌ ต้องตั้ง SUPABASE_URL และ SUPABASE_SERVICE_KEY ก่อน "
                 "(ดู HANDBOOK ข้อ 7.5)")
    return url, key


def _get(url: str, key: str, path: str, *, count: bool = False):
    """GET ไปที่ PostgREST — ถ้า count=True ขอจำนวนแถวรวมผ่าน Content-Range"""
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    if count:
        headers["Prefer"] = "count=exact"
        headers["Range-Unit"] = "items"
        headers["Range"] = "0-0"   # ขอแค่แถวเดียว แต่ header จะบอก count รวม
    resp = requests.get(f"{url}/rest/v1/{path}", headers=headers, timeout=TIMEOUT)
    if not resp.ok:
        sys.exit(f"❌ query ล้มเหลว ({path}): HTTP {resp.status_code} — "
                 f"{resp.text[:300]}")
    if count:
        # Content-Range รูปแบบ "0-0/1234" → เอาเลขหลัง /
        rng = resp.headers.get("content-range", "*/0")
        total = rng.split("/")[-1]
        return resp.json(), (int(total) if total.isdigit() else None)
    return resp.json()


def _local_expected() -> dict:
    """นับสิ่งที่ควรมีจาก data.json (history + วันล่าสุด) ไว้เทียบกับ Supabase"""
    if not DATA_FILE.exists():
        return {}
    data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    snaps = list(data.get("history", [])) + [data]
    dates, rows = set(), 0
    for s in snaps:
        d = s.get("date")
        if not d:
            continue
        dates.add(d)
        for series in s.get("series", {}).values():
            rows += sum(1 for k in series if k not in NON_STRIKE_KEYS)
    return {"days": len(dates), "rows": rows,
            "min": min(dates) if dates else None,
            "max": max(dates) if dates else None}


def main() -> None:
    url, key = _config()
    print("🔎 กำลังตรวจข้อมูลบน Supabase (อ่านอย่างเดียว) ...\n")

    # --- daily_summary: จำนวนวัน + ช่วงวันที่ ---
    _, days = _get(url, key, "daily_summary", count=True)
    newest = _get(url, key, "daily_summary?select=trade_date,spot,spot_chg"
                            "&order=trade_date.desc&limit=1")
    oldest = _get(url, key, "daily_summary?select=trade_date"
                            "&order=trade_date.asc&limit=1")

    # --- options_series: จำนวนแถวรวม + ซีรีส์ที่มี ---
    _, srows = _get(url, key, "options_series", count=True)
    series_sample = _get(url, key, "options_series?select=series_code"
                                   "&order=trade_date.desc&limit=500")
    series_codes = sorted({r["series_code"] for r in series_sample})

    print(f"📅 daily_summary : {days} วัน")
    if oldest and newest:
        print(f"   ช่วงวันที่    : {oldest[0]['trade_date']} → "
              f"{newest[0]['trade_date']}")
        n = newest[0]
        chg = n.get("spot_chg")
        chg_s = f"{chg:+g}" if isinstance(chg, (int, float)) else "—"
        print(f"   วันล่าสุด     : spot {n['spot']} ({chg_s})")
    print(f"📈 options_series: {srows} แถว")
    print(f"   ซีรีส์ล่าสุด   : {', '.join(series_codes) or '—'}")

    # --- เทียบกับ data.json ในเครื่อง ---
    exp = _local_expected()
    if exp:
        print(f"\n📄 data.json ในเครื่องมี : {exp['days']} วัน, {exp['rows']} แถว "
              f"({exp['min']} → {exp['max']})")
        day_ok = days is not None and days >= exp["days"]
        row_ok = srows is not None and srows >= exp["rows"]
        print(f"   วันครบ  : {'✅' if day_ok else '⚠ Supabase น้อยกว่า data.json'}"
              f" (Supabase {days} vs local {exp['days']})")
        print(f"   แถวครบ  : {'✅' if row_ok else '⚠ Supabase น้อยกว่า data.json'}"
              f" (Supabase {srows} vs local {exp['rows']})")
        if day_ok and row_ok:
            print("\n✅ ตรวจผ่าน: ข้อมูลบน Supabase ครบเท่ากับ (หรือมากกว่า) data.json")
        else:
            print("\n⚠ ยังไม่ครบ — ลองรัน backfill: "
                  ".venv\\Scripts\\python scraper\\supabase_upload.py --backfill")
    else:
        print("\n(ไม่มี data.json ในเครื่องให้เทียบ — แสดงเฉพาะยอดบน Supabase)")


if __name__ == "__main__":
    main()
