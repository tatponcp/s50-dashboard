/* ============================================================
   metrics.js — ฟังก์ชันคำนวณตัวชี้วัดล้วนๆ (ไม่มี DOM/กราฟ)
   ------------------------------------------------------------
   ทุกฟังก์ชันรับข้อมูลดิบจาก data.json แล้วคืนตัวเลข/ออบเจกต์
   ค่า null หรือ field ที่หายไปจะถูกข้าม ไม่ทำให้หน้าเว็บพัง
   ไฟล์นี้โหลดใน Node ได้ด้วย (มี module.exports ท้ายไฟล์)
   เพื่อให้เขียนเทสต์ตรวจสูตรได้
   ============================================================ */
'use strict';

const Metrics = (() => {

  /** แปลงค่าเป็นตัวเลขแบบปลอดภัย: null/undefined/NaN -> null */
  function num(v) {
    return (typeof v === 'number' && isFinite(v)) ? v : null;
  }

  /** เหมือน num() แต่ถ้าไม่ใช่ตัวเลขให้เป็น 0 (ใช้ตอนบวกรวม OI/Volume) */
  function numOr0(v) {
    const n = num(v);
    return n === null ? 0 : n;
  }

  /** รายชื่อสไตรค์ของ series เรียงจากน้อยไปมาก (คืน number[]) */
  function strikesOf(seriesData) {
    if (!seriesData) return [];
    return Object.keys(seriesData)
      .map(Number)
      .filter(k => isFinite(k))
      .sort((a, b) => a - b);
  }

  /* ------------------------------------------------------------
     Max Pain
     ------------------------------------------------------------
     แนวคิด: ถ้าดัชนีปิด (settle) ที่ราคา K ในวันหมดอายุ
     ผู้ "ถือ" options ทั้งตลาดจะได้เงินรวม =
       Σ ทุกสไตรค์ s ของ [ callOI(s) × max(K−s, 0)   ← call ITM
                          + putOI(s)  × max(s−K, 0) ] ← put ITM
     Max Pain คือ K ที่ทำให้ยอดนี้ "ต่ำที่สุด" — จุดที่ผู้ถือ
     ขาดทุนรวมมากสุด / ผู้ขาย (writer) จ่ายน้อยสุด
     เราลองเฉพาะ K = สไตรค์ที่มีอยู่จริง (ตามธรรมเนียมการคำนวณ)
     ------------------------------------------------------------ */
  function maxPain(seriesData) {
    const strikes = strikesOf(seriesData);
    if (strikes.length === 0) return null;

    let best = null;
    for (const K of strikes) {
      let payout = 0;
      for (const s of strikes) {
        const row = seriesData[String(s)] || {};
        payout += numOr0(row.callOI) * Math.max(K - s, 0);
        payout += numOr0(row.putOI) * Math.max(s - K, 0);
      }
      if (best === null || payout < best.payout) best = { strike: K, payout };
    }
    return best ? best.strike : null;
  }

  /* ------------------------------------------------------------
     PCR (Put/Call Ratio จาก Open Interest)
     ------------------------------------------------------------
     PCR = Σ putOI / Σ callOI
     - total: รวมทุกสไตรค์
     - near : เฉพาะสไตรค์ในช่วง ±bandPct ของ spot (ดีฟอลต์ ±5%)
              สะท้อนการวางสถานะ "ใกล้ราคาปัจจุบัน" ชัดกว่าแบบรวม
     คืน null ถ้า callOI รวมเป็น 0 (หารไม่ได้)
     ------------------------------------------------------------ */
  function pcr(seriesData, spot, bandPct = 0.05) {
    const strikes = strikesOf(seriesData);
    let cAll = 0, pAll = 0, cNear = 0, pNear = 0;
    const lo = spot * (1 - bandPct);
    const hi = spot * (1 + bandPct);

    for (const s of strikes) {
      const row = seriesData[String(s)] || {};
      const c = numOr0(row.callOI), p = numOr0(row.putOI);
      cAll += c; pAll += p;
      if (s >= lo && s <= hi) { cNear += c; pNear += p; }
    }
    return {
      total: cAll > 0 ? pAll / cAll : null,
      near: cNear > 0 ? pNear / cNear : null,
    };
  }

  /** สไตรค์ที่ใกล้ spot ที่สุด (ATM) */
  function atmStrike(seriesData, spot) {
    const strikes = strikesOf(seriesData);
    if (strikes.length === 0 || num(spot) === null) return null;
    let best = strikes[0];
    for (const s of strikes) {
      if (Math.abs(s - spot) < Math.abs(best - spot)) best = s;
    }
    return best;
  }

  /* ------------------------------------------------------------
     ATM IV = ค่าเฉลี่ย callIV/putIV ของสไตรค์ที่ใกล้ spot สุด
     ถ้าฝั่งใดฝั่งหนึ่งเป็น null ใช้อีกฝั่งเดียว
     ถ้า null ทั้งคู่ ลองขยับไปสไตรค์ข้างเคียง (ใกล้ spot ถัดไป)
     ------------------------------------------------------------ */
  function atmIV(seriesData, spot) {
    const strikes = strikesOf(seriesData);
    if (strikes.length === 0 || num(spot) === null) return null;
    const ordered = [...strikes].sort(
      (a, b) => Math.abs(a - spot) - Math.abs(b - spot)
    );
    for (const s of ordered) {
      const row = seriesData[String(s)] || {};
      const c = num(row.callIV), p = num(row.putIV);
      if (c !== null && p !== null) return (c + p) / 2;
      if (c !== null) return c;
      if (p !== null) return p;
    }
    return null;
  }

  /* ------------------------------------------------------------
     Mid IV ของสไตรค์เดียว = ค่าเฉลี่ย callIV/putIV
     ถ้าฝั่งใดฝั่งหนึ่งเป็น null ใช้อีกฝั่งเดียว (ตรรกะเดียวกับ atmIV)
     ใช้วาดเส้น IV Smile — คืน null ถ้าไม่มี IV ทั้งสองฝั่ง
     ------------------------------------------------------------ */
  function midIV(row) {
    if (!row) return null;
    const c = num(row.callIV), p = num(row.putIV);
    if (c !== null && p !== null) return (c + p) / 2;
    return c !== null ? c : p;
  }

  /* ------------------------------------------------------------
     IV Rank / IV Percentile เทียบกับ history
     ------------------------------------------------------------
     IV Rank       = (IV วันนี้ − IV ต่ำสุด) / (IV สูงสุด − IV ต่ำสุด) × 100
                     → วันนี้อยู่ตรงไหนของ "ช่วง" ต่ำสุด-สูงสุดในอดีต
     IV Percentile = % ของวันในอดีตที่ IV ต่ำกว่าวันนี้
                     → ทนต่อค่า outlier มากกว่า Rank
     ivHistory: number[] ของ ATM IV รายวันในอดีต (ไม่รวมวันนี้)
     ต้องมีข้อมูลอย่างน้อย minDays วัน ไม่งั้นคืน { insufficient: true }
     เพื่อให้ UI ขึ้น "ข้อมูลสะสมยังไม่พอ" แทนตัวเลขที่หลอกตา
     ------------------------------------------------------------ */
  function ivRank(currentIV, ivHistory, minDays = 20) {
    const cur = num(currentIV);
    const hist = (ivHistory || []).map(num).filter(v => v !== null);
    if (cur === null || hist.length < minDays) {
      return { insufficient: true, days: hist.length };
    }
    const min = Math.min(...hist);
    const max = Math.max(...hist);
    const rank = max > min ? ((cur - min) / (max - min)) * 100 : 50;
    const below = hist.filter(v => v < cur).length;
    const percentile = (below / hist.length) * 100;
    return { insufficient: false, days: hist.length, rank, percentile, min, max };
  }

  /* ------------------------------------------------------------
     Expected Range จาก ATM IV และ DTE
     ------------------------------------------------------------
     การเคลื่อนไหว 1 ส่วนเบี่ยงเบนมาตรฐาน (1σ) ถึงวันหมดอายุ:
       move(1σ) = spot × (IV/100) × √(DTE/365)
     ใช้ 365 วันปฏิทิน เพราะ dte จาก scraper เป็นวันปฏิทิน
     ตีความ: ตลาด (ผ่านราคา options) ให้โอกาส ~68% ที่ราคาจะปิด
     ในช่วง ±1σ และ ~38% ในช่วง ±0.5σ
     ------------------------------------------------------------ */
  function expectedRange(spot, ivPct, dte) {
    const S = num(spot), v = num(ivPct), d = num(dte);
    if (S === null || v === null || d === null || d < 0) return null;
    const move1 = S * (v / 100) * Math.sqrt(d / 365);
    return {
      move1,
      sigma1: { low: S - move1, high: S + move1 },
      sigma05: { low: S - move1 * 0.5, high: S + move1 * 0.5 },
    };
  }

  /* ------------------------------------------------------------
     Skew: IV ของ Put OTM เทียบ Call OTM ที่ระยะ ~otmPct จาก spot
     ------------------------------------------------------------
     - Put OTM  : สไตรค์ใกล้ spot×(1−otmPct) ที่มี putIV ใช้ได้
     - Call OTM : สไตรค์ใกล้ spot×(1+otmPct) ที่มี callIV ใช้ได้
     skew = putIV − callIV (จุด IV)
     ค่าบวกมาก = ตลาดยอมจ่ายแพงเพื่อกันขาลง (กังวล downside)
     ค่าติดลบ  = ฝั่ง call แพงกว่า (ไล่ราคาขาขึ้น) — เจอไม่บ่อย
     ------------------------------------------------------------ */
  function skew(seriesData, spot, otmPct = 0.03) {
    const S = num(spot);
    const strikes = strikesOf(seriesData);
    if (S === null || strikes.length === 0) return null;

    // หาสไตรค์ใกล้ target สุดที่ IV ฝั่งนั้นไม่เป็น null
    function nearestWithIV(target, field) {
      const ordered = [...strikes].sort(
        (a, b) => Math.abs(a - target) - Math.abs(b - target)
      );
      for (const s of ordered) {
        const v = num((seriesData[String(s)] || {})[field]);
        // ยอมรับเฉพาะสไตรค์ที่ห่างจาก target ไม่เกิน 2 เท่าของระยะ OTM
        if (v !== null && Math.abs(s - target) <= S * otmPct * 2) {
          return { strike: s, iv: v };
        }
      }
      return null;
    }

    const put = nearestWithIV(S * (1 - otmPct), 'putIV');
    const call = nearestWithIV(S * (1 + otmPct), 'callIV');
    if (!put || !call) return null;
    return {
      skew: put.iv - call.iv,
      putStrike: put.strike, putIV: put.iv,
      callStrike: call.strike, callIV: call.iv,
    };
  }

  /* ------------------------------------------------------------
     history helpers
     ------------------------------------------------------------ */

  /** history เรียงเก่า→ใหม่ ตัด entry ที่ date ตรงกับวันนี้ออก (กันซ้ำ) */
  function sortedHistory(data) {
    const h = Array.isArray(data.history) ? [...data.history] : [];
    return h
      .filter(d => d && d.date && d.date !== data.date)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }

  /** snapshot ของ n วันทำการก่อนหน้า (n=1 คือเมื่อวาน) หรือ null ถ้าไม่พอ */
  function nDaysBack(history, n) {
    if (!Array.isArray(history) || history.length < n) return null;
    return history[history.length - n];
  }

  /** ATM IV รายวันจาก history ของ series ที่เลือก (ใช้ spot ของวันนั้นๆ) */
  function ivHistoryOf(history, seriesName) {
    const out = [];
    for (const snap of history) {
      const sd = snap.series && snap.series[seriesName];
      if (!sd) continue;
      const v = atmIV(sd, snap.spot);
      if (v !== null) out.push({ date: snap.date, iv: v });
    }
    return out;
  }

  /* ------------------------------------------------------------
     OI Change รายสไตรค์: วันนี้ เทียบ snapshot ในอดีต
     ------------------------------------------------------------
     คืน map: strike -> { call, put } (จำนวนสัญญาที่เปลี่ยน)
     - สไตรค์ที่ไม่มีในอดีต (เพิ่งเปิดใหม่) นับจากฐาน 0
     - ถ้า OI ของฝั่งนั้นเป็น null ทั้งสองวัน ให้ null (ไม่รู้จริง)
     ------------------------------------------------------------ */
  function oiChange(todaySeries, pastSeries) {
    const out = {};
    if (!todaySeries) return out;
    const strikes = strikesOf(todaySeries);
    for (const s of strikes) {
      const key = String(s);
      const now = todaySeries[key] || {};
      const old = (pastSeries && pastSeries[key]) || {};
      const diff = (a, b) => {
        const na = num(a), nb = num(b);
        if (na === null && nb === null) return null;
        return numOr0(a) - numOr0(b);
      };
      out[key] = {
        call: diff(now.callOI, old.callOI),
        put: diff(now.putOI, old.putOI),
      };
    }
    return out;
  }

  /* ------------------------------------------------------------
     Unusual OI Change: เทียบกับ "ประวัติของสไตรค์ตัวเอง"
     ------------------------------------------------------------
     หลักการ: สไตรค์ไกลๆ OI ขยับทีละน้อยอยู่แล้ว จะเอา threshold
     เดียวกับสไตรค์ ATM ไม่ได้ — จึงวัดเป็น z-score ต่อสไตรค์:
       1) หา ΔOI รายวันของสไตรค์นั้น (ฝั่ง call/put แยกกัน)
          จาก history ย้อนหลังทั้งหมด
       2) z = (ΔOI วันนี้ − ค่าเฉลี่ย ΔOI ในอดีต) / SD ของ ΔOI ในอดีต
       3) |z| ≥ zThreshold (ดีฟอลต์ 2 = ~นาน 1 ครั้งใน 20 วัน) → ผิดปกติ
     ต้องมี ΔOI ในอดีตอย่างน้อย minSamples ค่า และ SD > 0
     ไม่งั้นคืน null (ตัดสินไม่ได้ ไม่เดา)
     ------------------------------------------------------------ */
  function unusualOiChange(history, seriesName, strike, side, todayChange,
                           zThreshold = 2, minSamples = 10) {
    const chg = num(todayChange);
    if (chg === null) return null;
    const field = side === 'call' ? 'callOI' : 'putOI';
    const key = String(strike);

    // ΔOI รายวันในอดีตของสไตรค์นี้ (วันที่ i เทียบ i-1)
    const diffs = [];
    for (let i = 1; i < history.length; i++) {
      const a = history[i - 1].series && history[i - 1].series[seriesName];
      const b = history[i].series && history[i].series[seriesName];
      if (!a || !b) continue;
      const va = num((a[key] || {})[field]);
      const vb = num((b[key] || {})[field]);
      if (va === null || vb === null) continue;
      diffs.push(vb - va);
    }
    if (diffs.length < minSamples) return null;

    const mean = diffs.reduce((s, v) => s + v, 0) / diffs.length;
    const sd = Math.sqrt(
      diffs.reduce((s, v) => s + (v - mean) * (v - mean), 0) / diffs.length
    );
    if (sd <= 0) return null;

    const z = (chg - mean) / sd;
    return { z, unusual: Math.abs(z) >= zThreshold, mean, sd, samples: diffs.length };
  }

  /* ------------------------------------------------------------
     Volume/OI Ratio ต่อสไตรค์ต่อฝั่ง
     > 1 = ปริมาณซื้อขายวันนี้มากกว่าสถานะคงค้างทั้งหมด
         → มีเงินใหม่เข้า/ออกผิดปกติที่สไตรค์นั้น
     คืน null ถ้า volume เป็น null หรือ OI ≤ 0
     ------------------------------------------------------------ */
  function volOiRatio(row, side) {
    if (!row) return null;
    const vol = num(side === 'call' ? row.callVol : row.putVol);
    const oi = num(side === 'call' ? row.callOI : row.putOI);
    if (vol === null || oi === null || oi <= 0) return null;
    return vol / oi;
  }

  return {
    num, numOr0, strikesOf, maxPain, pcr, atmStrike, atmIV, midIV, ivRank,
    expectedRange, skew, sortedHistory, nDaysBack, ivHistoryOf,
    oiChange, unusualOiChange, volOiRatio,
  };
})();

/* ให้ Node โหลดไปเขียนเทสต์ได้ (บนเบราว์เซอร์บรรทัดนี้ถูกข้าม) */
if (typeof module !== 'undefined' && module.exports) module.exports = Metrics;
