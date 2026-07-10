"""
tfex_scraper.py — ดึงข้อมูล SET50 Index Options จาก API ของ TFEX
================================================================
รันวันละครั้งหลังตลาดปิด (เย็น) แล้วเขียนทับ data.json ที่ root
ของโปรเจกต์ ให้ dashboard (index.html) อ่านต่อได้ทันที

ทำไมใช้ API ไม่ใช่แกะตาราง HTML:
  หน้าเว็บ TFEX render ตารางแค่ซีรีส์เดียว (ซีรีส์อื่นซ่อนใน JS)
  แต่ API ตัวจริงที่หน้าเว็บใช้ ให้ครบทุกซีรีส์ + วันหมดอายุ + Greeks
  ในรูป JSON ตรงๆ — เสถียรกว่าและได้ข้อมูลมากกว่า

การเลือกซีรีส์ (ไม่ต้องแก้โค้ดเมื่อเปลี่ยนปี):
  SET50 options มีซีรีส์รายไตรมาส (มี.ค./มิ.ย./ก.ย./ธ.ค. = H/M/U/Z)
  เป็นซีรีส์หลักที่สภาพคล่องสูง สคริปต์จะกรองเอาเฉพาะซีรีส์ไตรมาส
  ที่ "ยังไม่หมดอายุ" แล้วเลือก 2 ตัวที่ใกล้หมดอายุที่สุดโดยอัตโนมัติ
  เช่น ก.ค. 2026 → U26, Z26 · พอขึ้น ม.ค. 2027 → H27, M27 เอง

วิธีรันเองในเครื่อง (ปกติไม่ต้อง — GitHub Actions รันให้ทุกเย็น):
    pip install requests
    python scraper/tfex_scraper.py

หลักความปลอดภัยของข้อมูล:
  ตรวจสอบความสมเหตุสมผล (validate) ก่อนเขียนทับ data.json เสมอ
  ถ้าข้อมูลผิดปกติ สคริปต์จะจบด้วย error โดย "ไม่แตะไฟล์เดิม"
  → dashboard ยังแสดงข้อมูลวันล่าสุดที่ดีอยู่ ไม่พังกลางทาง
"""

import json
import sys
import time
from datetime import date, datetime
from pathlib import Path

import requests

# Windows console (cp874) ไม่รองรับ emoji บางตัว → บังคับ utf-8 กัน crash
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# ---------------------------------------------------------------
# CONFIG
# ---------------------------------------------------------------
ROOT = Path(__file__).resolve().parent.parent   # โฟลเดอร์โปรเจกต์ (แม่ของ scraper/)
DATA_FILE = ROOT / "data.json"

# หน้าเว็บ (เข้าเพื่อรับ cookie ก่อน — API ปฏิเสธ request ที่ไม่มี cookie)
PAGE_URL = "https://www.tfex.co.th/en/products/equity/set50-index-options/market-data"
# API ตารางออปชัน: ทุก contract month ทุกสไตรค์ พร้อม OI/Vol/IV/Greeks/วันหมดอายุ
OPTIONS_API = "https://www.tfex.co.th/api/set/tfex/marketlist/TXI_O/options-trading"
# API ดัชนี SET50: ราคาปิดล่าสุด + การเปลี่ยนแปลง
INDEX_API = "https://www.tfex.co.th/api/set/index/SET50/info"

QUARTER_MONTHS = {3, 6, 9, 12}      # ซีรีส์หลักรายไตรมาส (H/M/U/Z)
NUM_SERIES = 2                       # เก็บ 2 ซีรีส์ใกล้หมดอายุที่สุด (near/far)
HISTORY_DAYS = 60                    # เก็บ history ย้อนหลังกี่วันใน data.json
MIN_STRIKES = 10                     # ต่อซีรีส์ ต่ำกว่านี้ถือว่าข้อมูลผิดปกติ
RETRIES = 3                          # จำนวนครั้งที่ลองใหม่เมื่อ network พัง

# รหัสเดือนของ TFEX เช่น U26 = ก.ย. 2026 (ใช้ตั้งชื่อซีรีส์ S50U26)
MONTH_CODE = {1: "F", 2: "G", 3: "H", 4: "J", 5: "K", 6: "M",
              7: "N", 8: "Q", 9: "U", 10: "V", 11: "X", 12: "Z"}

HEADERS = {
    # ปลอมตัวเป็นเบราว์เซอร์ปกติ — ถ้าไม่ใส่ เว็บตอบ 403 Forbidden
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                   "AppleWebKit/537.36 (KHTML, like Gecko) "
                   "Chrome/126.0.0.0 Safari/537.36"),
    "Accept-Language": "en-US,en;q=0.9,th;q=0.8",
}


# ---------------------------------------------------------------
# STEP 1: FETCH — เปิด session รับ cookie แล้วเรียก API ทั้งสองตัว
# ---------------------------------------------------------------
def fetch_all() -> tuple[dict, dict]:
    """คืน (options_payload, index_payload) — retry ให้เองเมื่อพลาด"""
    last_err = None
    for attempt in range(1, RETRIES + 1):
        try:
            s = requests.Session()
            s.headers.update(HEADERS)
            # เข้าเพจก่อนเพื่อรับ cookie (Incapsula) — ขาดขั้นนี้ API จะตอบ 403
            s.get(PAGE_URL, timeout=30).raise_for_status()
            api_headers = {"Referer": PAGE_URL, "Accept": "application/json"}
            r1 = s.get(OPTIONS_API, headers=api_headers, timeout=30)
            r1.raise_for_status()
            r2 = s.get(INDEX_API, headers=api_headers, timeout=30)
            r2.raise_for_status()
            return r1.json(), r2.json()
        except Exception as e:  # network พัง / โดนบล็อก / JSON เพี้ยน
            last_err = e
            print(f"⚠ ครั้งที่ {attempt}/{RETRIES} ไม่สำเร็จ: {e}")
            if attempt < RETRIES:
                time.sleep(5 * attempt)   # รอเพิ่มขึ้นเรื่อยๆ ก่อนลองใหม่
    raise RuntimeError(f"เรียก TFEX ไม่สำเร็จหลังลอง {RETRIES} ครั้ง: {last_err}")


# ---------------------------------------------------------------
# STEP 2: BUILD — เลือกซีรีส์ไตรมาสที่ยังไม่หมดอายุ แล้วแปลง schema
# ---------------------------------------------------------------
def _iso_date(s: str) -> date:
    """'2026-09-29T00:00:00+07:00' → date(2026, 9, 29)"""
    return datetime.fromisoformat(s).date()


def _num(v):
    """API ให้ null เมื่อไม่มีค่า (เช่นไม่มีการซื้อขาย) — ปล่อยผ่านเป็น None"""
    return float(v) if isinstance(v, (int, float)) else None


def _strike_key(v: float) -> str:
    """1010.0 → '1010' (คีย์สไตรค์ใน data.json เป็นสตริงเลขจำนวนเต็มถ้าลงตัว)"""
    f = float(v)
    return str(int(f)) if f == int(f) else str(f)


def series_name(expiry: date) -> str:
    """ตั้งชื่อซีรีส์จากวันหมดอายุ เช่น 2026-09-29 → S50U26"""
    return f"S50{MONTH_CODE[expiry.month]}{expiry.year % 100:02d}"


def build_payload(options: dict, index: dict) -> dict:
    """แปลง JSON ของ TFEX → schema ของ data.json ที่ dashboard ใช้"""
    trading_date = _iso_date(options["tradingDate"])

    # --- เลือก contract month: เฉพาะไตรมาส + ยังไม่หมดอายุ + ใกล้สุด 2 ตัว ---
    months = []
    for inst in options.get("instruments", []):
        for cm in inst.get("contractMonths", []):
            expiry = _iso_date(cm["contractMonthDate"])
            if expiry.month in QUARTER_MONTHS and expiry >= trading_date:
                months.append((expiry, cm))
    months.sort(key=lambda t: t[0])            # เรียงใกล้หมดอายุ → ไกล
    months = months[:NUM_SERIES]

    if len(months) < NUM_SERIES:
        raise RuntimeError(
            f"พบซีรีส์ไตรมาสที่ยังไม่หมดอายุแค่ {len(months)} ตัว "
            f"(ต้องการ {NUM_SERIES}) — โครงข้อมูล TFEX อาจเปลี่ยน")

    # --- แปลงรายสไตรค์ของแต่ละซีรีส์ ---
    series: dict = {}
    for expiry, cm in months:
        name = series_name(expiry)
        rows: dict = {
            # ใส่ expiry/dte ไว้ในซีรีส์เลย — dashboard ใช้คำนวณ DTE รายซีรีส์
            # (metrics.js กรองคีย์ที่ไม่ใช่ตัวเลขทิ้งเอง ไม่ปนกับสไตรค์)
            "expiry": expiry.isoformat(),
            "dte": (expiry - trading_date).days,
        }
        for row in cm.get("callPutList", []):
            call, put = row.get("call") or {}, row.get("put") or {}
            strike = call.get("strikePrice") or put.get("strikePrice")
            if strike is None:
                continue
            rows[_strike_key(strike)] = {
                "callOI":    _num(call.get("oi")),
                "putOI":     _num(put.get("oi")),
                "callVol":   _num(call.get("volume")),
                "putVol":    _num(put.get("volume")),
                "callIV":    _num(call.get("iv")),
                "putIV":     _num(put.get("iv")),
                "callDelta": _num(call.get("delta")),
                "putDelta":  _num(put.get("delta")),
                # gamma เก็บเผื่อโปรเจกต์ GEX ในอนาคต (dashboard ยังไม่ใช้)
                "callGamma": _num(call.get("gamma")),
                "putGamma":  _num(put.get("gamma")),
            }
        series[name] = rows

    front_expiry, _ = months[0]
    return {
        "date": trading_date.isoformat(),
        "source": "TFEX",                       # ธงว่าเป็นข้อมูลจริง (ไม่ใช่ mock)
        "spot": _num(index.get("last")),
        "spotChg": _num(index.get("change")),
        "dte": (front_expiry - trading_date).days,   # ของซีรีส์หลัก (fallback เดิม)
        "series": series,
        "history": [],                          # เติมทีหลังใน merge_history()
    }


# ---------------------------------------------------------------
# STEP 3: VALIDATE — เช็คความสมเหตุสมผลก่อนเขียนทับไฟล์เดิม
# ---------------------------------------------------------------
def validate(payload: dict) -> list[str]:
    """คืน list ของปัญหา; ว่าง = ผ่าน (ไม่ผ่าน = ห้ามเขียนไฟล์)"""
    errors = []

    spot = payload.get("spot")
    if not isinstance(spot, float) or not (100 < spot < 3000):
        errors.append(f"spot ผิดปกติ: {spot}")

    # ข้อมูลเก่าเกิน 7 วัน = อาจดึงมาผิด/ตลาดปิดยาว — เตือนไว้ก่อน
    age = (date.today() - date.fromisoformat(payload["date"])).days
    if age > 7:
        errors.append(f"tradingDate {payload['date']} เก่ากว่า 7 วัน")

    for name, rows in payload["series"].items():
        strikes = [k for k in rows if k not in ("expiry", "dte")]
        if len(strikes) < MIN_STRIKES:
            errors.append(f"{name}: มีแค่ {len(strikes)} strikes "
                          f"(ต้องอย่างน้อย {MIN_STRIKES})")
        call_oi = sum((rows[k].get("callOI") or 0) for k in strikes)
        put_oi = sum((rows[k].get("putOI") or 0) for k in strikes)
        if call_oi <= 0:
            errors.append(f"{name}: ΣCall OI = {call_oi} (ต้องมากกว่า 0)")
        if put_oi <= 0:
            errors.append(f"{name}: ΣPut OI = {put_oi} (ต้องมากกว่า 0)")
    return errors


# ---------------------------------------------------------------
# STEP 4: HISTORY — ย้าย snapshot วันก่อนเข้า history แล้วตัดให้สั้น
# ---------------------------------------------------------------
def merge_history(payload: dict) -> None:
    """
    อ่าน data.json เดิม (ถ้ามี) แล้วต่อ history ให้ payload ใหม่:
      - เอา history เดิมมาทั้งหมด + snapshot ของ "วันก่อน" ต่อท้าย
      - ตัด entry ที่วันซ้ำกับวันนี้ (รันซ้ำวันเดียวกัน = เขียนทับ ไม่ซ้ำ)
      - เก็บแค่ HISTORY_DAYS วันล่าสุด
    ข้อมูล mock (ไม่มี source='TFEX') จะถูกทิ้งทั้งก้อน — ห้ามปน
    ประวัติปลอมกับข้อมูลจริง เพราะ IV Rank / OI Change จะเพี้ยนหมด
    """
    if not DATA_FILE.exists():
        return
    try:
        old = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        print("⚠ data.json เดิมอ่านไม่ได้ — เริ่ม history ใหม่")
        return
    if old.get("source") != "TFEX":
        print("ℹ data.json เดิมเป็น mock — เริ่มสะสม history จริงจากวันนี้")
        return

    history = [h for h in old.get("history", [])
               if h.get("date") and h["date"] != payload["date"]]
    if old.get("date") and old["date"] != payload["date"]:
        # snapshot ของวันก่อน = ทุกอย่างยกเว้น history/source ของมันเอง
        history.append({k: old[k] for k in
                        ("date", "spot", "spotChg", "dte", "series")
                        if k in old})
    history.sort(key=lambda h: h["date"])
    payload["history"] = history[-HISTORY_DAYS:]


# ---------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------
def main() -> None:
    print("⏳ กำลังดึงข้อมูลจาก TFEX API ...")
    options, index = fetch_all()
    payload = build_payload(options, index)

    print(f"📊 ข้อมูลวันที่ {payload['date']} | SET50 {payload['spot']} "
          f"({payload['spotChg']:+g})")
    for name, rows in payload["series"].items():
        strikes = [k for k in rows if k not in ("expiry", "dte")]
        call_oi = sum((rows[k].get("callOI") or 0) for k in strikes)
        put_oi = sum((rows[k].get("putOI") or 0) for k in strikes)
        pcr = f"{put_oi / call_oi:.2f}" if call_oi else "N/A"
        print(f"  {name}: หมดอายุ {rows['expiry']} (DTE {rows['dte']}) | "
              f"{len(strikes)} strikes | ΣCall OI {call_oi:,.0f} | "
              f"ΣPut OI {put_oi:,.0f} | PCR {pcr}")

    errors = validate(payload)
    if errors:
        print("❌ Validation ไม่ผ่าน — ไม่เขียนทับ data.json เดิม:")
        for e in errors:
            print(f"   - {e}")
        sys.exit(1)

    merge_history(payload)
    DATA_FILE.write_text(
        json.dumps(payload, ensure_ascii=False, indent=1),
        encoding="utf-8")
    print(f"✅ เขียน {DATA_FILE.name} แล้ว "
          f"(history {len(payload['history'])} วัน)")


if __name__ == "__main__":
    main()
