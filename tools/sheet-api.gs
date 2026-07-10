/* ============================================================
   sheet-api.gs — Google Apps Script: อ่าน Sheet ที่กรอกรายวัน
   แล้วเสิร์ฟเป็น JSON (schema เดียวกับ data.json ของ dashboard)
   ------------------------------------------------------------
   วิธีติดตั้ง (ทำครั้งเดียว):
   1. เปิด Google Sheet ที่กรอก → Extensions → Apps Script
   2. ลบโค้ดเดิม วางไฟล์นี้ทั้งไฟล์ แล้วปรับ CONFIG ด้านล่าง
      ให้ตรงชื่อแท็บ/หัวคอลัมน์จริงของ Sheet
   3. Deploy → New deployment → Web app
        - Execute as:      Me
        - Who has access:  Anyone   ← สำคัญ! ถ้าเลือกแบบต้อง login
          เบราว์เซอร์จะ fetch ไม่ได้ (โดน redirect ไปหน้า login)
   4. คัดลอก URL ที่ลงท้าย /exec ไปวางใน SHEET_API_URL
      ที่หัวไฟล์ js/dashboard.js
   หลังจากนั้น: กรอก Sheet ตอนเย็นเสร็จ = จบ dashboard เห็นเอง
   * ถ้าแก้โค้ดในนี้ภายหลัง ต้อง Deploy → Manage deployments →
     ✏️ Edit → Version: New version ไม่งั้น URL เดิมยังเสิร์ฟโค้ดเก่า

   Layout ของ Sheet ที่สคริปต์คาดหวัง (3 แท็บ):
   ── Daily ──  วันละ 1 แถว
      date | spot | spotChg(ไม่กรอกก็ได้ เดี๋ยวคำนวณจากวันก่อนหน้า)
   ── Series ── ซีรีส์ละ 1 แถว (อัปเดตเฉพาะตอนเปลี่ยนซีรีส์)
      series | expiry          เช่น S50U26 | 2026-09-24
   ── OI ──     วันละ (จำนวนซีรีส์ × จำนวนสไตรค์) แถว
      date | series | strike | callOI | putOI | callVol | putVol
           | callIV | putIV | callDelta | putDelta
   ============================================================ */

const CONFIG = {
  /* ชื่อแท็บ + ชื่อหัวคอลัมน์ในแถวแรก (ไม่สนตัวพิมพ์เล็ก/ใหญ่)
     ถ้า Sheet จริงใช้ชื่ออื่น แก้ค่าฝั่งขวาให้ตรงพอ */
  daily: {
    sheet: 'Daily',
    cols: { date: 'date', spot: 'spot', spotChg: 'spotChg' },
  },
  series: {
    sheet: 'Series',
    cols: { series: 'series', expiry: 'expiry' },
  },
  oi: {
    sheet: 'OI',
    cols: {
      date: 'date', series: 'series', strike: 'strike',
      callOI: 'callOI', putOI: 'putOI',
      callVol: 'callVol', putVol: 'putVol',
      callIV: 'callIV', putIV: 'putIV',
      callDelta: 'callDelta', putDelta: 'putDelta',
    },
  },
  historyDays: 60,          // เก็บ history ย้อนหลังสูงสุดกี่วัน
  timezone: 'Asia/Bangkok', // ใช้แปลงเซลล์วันที่เป็น yyyy-MM-dd
};

/* ---------- endpoint หลักที่ dashboard fetch ---------- */
function doGet() {
  const payload = buildPayload(readAllTables());
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

/* รันฟังก์ชันนี้ใน editor (Run ▸ testJson) เพื่อดูตัวอย่าง output
   ก่อน deploy — ถ้า CONFIG ไม่ตรงกับ Sheet จะ error บอกตรงนี้เลย */
function testJson() {
  const payload = buildPayload(readAllTables());
  Logger.log('date=%s spot=%s series=%s history=%s วัน',
    payload.date, payload.spot,
    Object.keys(payload.series).join(','), payload.history.length);
  Logger.log(JSON.stringify(payload).slice(0, 1500));
}

/* ============================================================
   อ่าน 3 แท็บ + normalize ชนิดข้อมูล (วันที่/ตัวเลข)
   ============================================================ */
function readAllTables() {
  const daily = readTable(CONFIG.daily.sheet, CONFIG.daily.cols).map(r => ({
    date: normDate(r.date), spot: toNum(r.spot), spotChg: toNum(r.spotChg),
  }));
  const series = readTable(CONFIG.series.sheet, CONFIG.series.cols).map(r => ({
    series: String(r.series || '').trim(), expiry: normDate(r.expiry),
  }));
  const oi = readTable(CONFIG.oi.sheet, CONFIG.oi.cols).map(r => ({
    date: normDate(r.date),
    series: String(r.series || '').trim(),
    strike: toNum(r.strike),
    callOI: toNum(r.callOI), putOI: toNum(r.putOI),
    callVol: toNum(r.callVol), putVol: toNum(r.putVol),
    callIV: toNum(r.callIV), putIV: toNum(r.putIV),
    callDelta: toNum(r.callDelta), putDelta: toNum(r.putDelta),
  }));
  return { daily, series, oi };
}

/* อ่านแท็บเดียวเป็น array ของ object ตาม mapping ใน cols
   คอลัมน์ไหนหาไม่เจอในหัวตาราง ค่าจะเป็น null (ไม่ throw) */
function readTable(sheetName, cols) {
  const sh = SpreadsheetApp.getActive().getSheetByName(sheetName);
  if (!sh) throw new Error('ไม่พบแท็บชื่อ "' + sheetName + '" — เช็ค CONFIG');
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0].map(h => String(h).trim().toLowerCase());
  const idx = {};
  for (const key in cols) idx[key] = headers.indexOf(cols[key].toLowerCase());

  const out = [];
  for (let i = 1; i < values.length; i++) {
    const rec = {};
    let empty = true;
    for (const key in cols) {
      const v = idx[key] === -1 ? null : values[i][idx[key]];
      rec[key] = v === '' ? null : v;
      if (rec[key] !== null) empty = false;
    }
    if (!empty) out.push(rec); // ข้ามแถวว่างท้ายตาราง
  }
  return out;
}

/* ============================================================
   ประกอบเป็น schema ของ data.json:
   { date, spot, spotChg, dte, series, history }
   - series รายวัน: { <ชื่อ>: { expiry, dte, "<strike>": {...} } }
   - dte top-level = ของซีรีส์ที่ใกล้หมดอายุสุด (front month)
   - history = ทุกวันก่อนวันล่าสุด (ไม่รวมวันล่าสุด) สูงสุด historyDays
   ============================================================ */
function buildPayload(t) {
  const expiryOf = {};
  for (const r of t.series) if (r.series) expiryOf[r.series] = r.expiry;

  const dailyByDate = {};
  for (const r of t.daily) if (r.date) dailyByDate[r.date] = r;

  /* จัดกลุ่ม OI: วันที่ → ซีรีส์ → สไตรค์ */
  const byDate = {};
  for (const r of t.oi) {
    if (!r.date || !r.series || r.strike === null) continue;
    const d = byDate[r.date] || (byDate[r.date] = {});
    const s = d[r.series] || (d[r.series] = {});
    s[String(r.strike)] = {
      callOI: r.callOI, putOI: r.putOI,
      callVol: r.callVol, putVol: r.putVol,
      callIV: r.callIV, putIV: r.putIV,
      callDelta: r.callDelta, putDelta: r.putDelta,
    };
  }

  const dates = Object.keys(byDate).sort();
  if (dates.length === 0) throw new Error('ไม่พบข้อมูลในแท็บ OI');

  const records = dates.map((date, i) => {
    const day = dailyByDate[date] || {};
    const spot = day.spot !== undefined ? day.spot : null;
    const prevDay = i > 0 ? (dailyByDate[dates[i - 1]] || {}) : {};
    const prevSpot = prevDay.spot !== undefined ? prevDay.spot : null;
    const spotChg = day.spotChg !== null && day.spotChg !== undefined
      ? day.spotChg
      : (spot !== null && prevSpot !== null
          ? Math.round((spot - prevSpot) * 100) / 100 : null);

    /* เรียงซีรีส์ตาม expiry (ใกล้สุดก่อน) — dashboard ถือว่า
       ตัวแรกคือ front month ไม่ว่าใน Sheet จะกรอกแถวไหนก่อน */
    const names = Object.keys(byDate[date]).sort((a, b) => {
      const ea = expiryOf[a] || '9999', eb = expiryOf[b] || '9999';
      return ea < eb ? -1 : ea > eb ? 1 : 0;
    });

    const seriesOut = {};
    let frontDte = null;
    for (const name of names) {
      seriesOut[name] = {};
      const exp = expiryOf[name] || null;
      if (exp) {
        seriesOut[name].expiry = exp;
        seriesOut[name].dte = daysBetween(date, exp);
        if (frontDte === null || seriesOut[name].dte < frontDte)
          frontDte = seriesOut[name].dte;
      }
      for (const k in byDate[date][name]) seriesOut[name][k] = byDate[date][name][k];
    }
    return { date: date, spot: spot, spotChg: spotChg, dte: frontDte, series: seriesOut };
  });

  const latest = records[records.length - 1];
  const history = records.slice(0, -1).slice(-CONFIG.historyDays);
  return {
    date: latest.date, spot: latest.spot, spotChg: latest.spotChg,
    dte: latest.dte, series: latest.series, history: history,
  };
}

/* ---------- helpers ---------- */

/* เซลล์วันที่ → 'yyyy-MM-dd'
   รองรับ: Date object (กรอกปกติใน Sheet), สตริง yyyy-MM-dd,
   และสตริง d/M/yyyy (ถ้าเป็นปี พ.ศ. เช่น 2569 จะลบ 543 ให้) */
function normDate(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date)
    return Utilities.formatDate(v, CONFIG.timezone, 'yyyy-MM-dd');
  const s = String(v).trim();
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    let y = Number(dmy[3]);
    if (y > 2400) y -= 543; // ปี พ.ศ. → ค.ศ.
    return y + '-' + pad2(dmy[2]) + '-' + pad2(dmy[1]);
  }
  return s; // คาดว่าเป็น yyyy-MM-dd อยู่แล้ว
}

function pad2(n) { return String(n).length < 2 ? '0' + n : String(n); }

/* จำนวนวันปฏิทินจาก a → b (สตริง yyyy-MM-dd) */
function daysBetween(a, b) {
  const ms = new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00');
  return Math.round(ms / 86400000);
}

/* เซลล์ตัวเลข → number หรือ null (รองรับสตริงมี comma เช่น "2,700") */
function toNum(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/,/g, ''));
  return isFinite(n) ? n : null;
}
