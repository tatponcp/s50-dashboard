/* ============================================================
   dashboard.js — โหลด data.json แล้ว render ทุกอย่าง
   ------------------------------------------------------------
   การคำนวณตัวชี้วัดทั้งหมดอยู่ใน metrics.js (โหลดก่อนไฟล์นี้)
   ไฟล์นี้ทำหน้าที่: จัดการ state, วาดกราฟ Chart.js, animation
   ============================================================ */
'use strict';

(() => {
  const M = Metrics;
  const $ = (id) => document.getElementById(id);

  /* อ่านค่าสีจาก CSS tokens — แก้ธีมใน styles.css แล้วกราฟเปลี่ยนตาม */
  const css = getComputedStyle(document.documentElement);
  const token = (name) => css.getPropertyValue(name).trim();
  const COLOR = {
    call: token('--clr-call'),
    put: token('--clr-put'),
    seriesNear: token('--clr-series-near'),
    seriesFar: token('--clr-series-far'),
    up: token('--clr-up'),
    down: token('--clr-down'),
    grid: token('--grid-line'),
    textMuted: token('--text-muted'),
    textSecondary: token('--text-secondary'),
    textPrimary: token('--text-primary'),
    surfaceRaise: token('--surface-raise'),
    border: token('--border'),
  };

  const REDUCED_MOTION =
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- state ---------- */
  const state = {
    data: null,
    hist: [],          // history เรียงเก่า→ใหม่ (ไม่รวมวันนี้)
    seriesName: null,
    tab: 'overview',   // overview | change | iv
    chgWindow: 1,      // 1 / 5 / 10 วันทำการ
    chgSide: 'both',   // both | call | put
    oiChart: null,
    chgChart: null,
    ivChart: null,
    unusualBySide: { call: {}, put: {} }, // strike -> ผล unusualOiChange (1D)
  };

  /* ---------- number formatting ---------- */
  const fmtInt = (v) => v === null ? '–' : Math.round(v).toLocaleString('en-US');
  const fmtSigned = (v) => v === null ? '–' :
    (v > 0 ? '+' : '') + Math.round(v).toLocaleString('en-US');
  const fmt = (v, d = 1) => v === null ? '–' : v.toFixed(d);

  /* ============================================================
     ตัวเลขนับขึ้นตอนโหลด — จุดเดียวที่ใช้ GSAP เพราะ CSS ทำไม่ได้
     ease เดียวกับ CSS: cubic-bezier(0.16, 1, 0.3, 1)
     ============================================================ */
  const hasGsap = typeof gsap !== 'undefined' && typeof CustomEase !== 'undefined';
  if (hasGsap) {
    gsap.registerPlugin(CustomEase);
    CustomEase.create('ekOut', '0.16, 1, 0.3, 1');
  }

  function countUp(el, value, format, delay = 0) {
    if (value === null || value === undefined) { el.textContent = '–'; return; }
    if (REDUCED_MOTION || !hasGsap) { el.textContent = format(value); return; }
    const obj = { v: 0 };
    gsap.to(obj, {
      v: value,
      duration: 1.1,
      delay,
      ease: 'ekOut',
      onUpdate: () => { el.textContent = format(obj.v); },
      onComplete: () => { el.textContent = format(value); },
    });
  }

  /* ============================================================
     Chart.js defaults ให้เข้ากับธีม
     ============================================================ */
  function setupChartDefaults() {
    const d = Chart.defaults;
    d.font.family = token('--font-sans') || 'system-ui, sans-serif';
    d.font.size = 11;
    d.color = COLOR.textMuted;
    d.plugins.tooltip.backgroundColor = COLOR.surfaceRaise;
    d.plugins.tooltip.titleColor = COLOR.textPrimary;
    d.plugins.tooltip.bodyColor = COLOR.textSecondary;
    d.plugins.tooltip.footerColor = token('--clr-warn');
    d.plugins.tooltip.borderColor = 'rgba(255,255,255,0.12)';
    d.plugins.tooltip.borderWidth = 1;
    d.plugins.tooltip.cornerRadius = 8;
    d.plugins.tooltip.padding = 10;
    d.plugins.tooltip.boxPadding = 4;
    d.plugins.legend.display = false; // ใช้ legend ของเราเองใน HTML
  }

  /* แท่งกราฟทยอยโตทีละแท่ง (~90ms ต่อแท่ง) เฉพาะ render แรก
     ตอน update ข้อมูล (สลับ series/กรอบเวลา) ให้ transition ปกติ */
  function staggerAnimation() {
    if (REDUCED_MOTION) return false;
    let firstRenderDone = false;
    return {
      onComplete: () => { firstRenderDone = true; },
      delay: (ctx) =>
        (ctx.type === 'data' && ctx.mode === 'default' && !firstRenderDone)
          ? ctx.dataIndex * 90 + ctx.datasetIndex * 45
          : 0,
      duration: 550,
      easing: 'easeOutQuart',
    };
  }

  /* ============================================================
     โหลดข้อมูลแล้วเริ่ม
     ------------------------------------------------------------
     SHEET_API_URL = URL ของ Apps Script Web App ที่อ่าน Google Sheet
     ที่กรอกรายวัน (วิธีติดตั้งอยู่หัวไฟล์ tools/sheet-api.gs)
     - ใส่ URL → ดึงจาก Sheet ก่อน ถ้าพังค่อยถอยมาใช้ data.json
     - เว้นว่าง → ใช้ data.json ในโฟลเดอร์เหมือนเดิม
     cache: no-store กันเบราว์เซอร์จำข้อมูลวันเก่า
     ============================================================ */
  const SHEET_API_URL = ''; // ← วาง URL ที่ลงท้าย /exec ตรงนี้

  const fetchJson = (url) =>
    fetch(url, { cache: 'no-store' })
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });

  (SHEET_API_URL
    ? fetchJson(SHEET_API_URL).catch((err) => {
        console.warn('ดึงจาก Sheet ไม่สำเร็จ ใช้ data.json แทน:', err);
        return fetchJson('data.json');
      })
    : fetchJson('data.json'))
    .then(boot)
    .catch((err) => {
      console.error('โหลดข้อมูลไม่สำเร็จ:', err);
      $('load-error').classList.add('show');
    });

  function boot(data) {
    state.data = data;
    state.hist = M.sortedHistory(data);
    setupChartDefaults();

    /* dropdown เลือก series (ถ้ามีหลาย expiration) */
    const names = Object.keys(data.series || {});
    if (names.length === 0) { $('load-error').classList.add('show'); return; }
    state.seriesName = names[0]; // ตัวแรกถือเป็น series หลัก (front month)
    const picker = $('series-picker');
    for (const n of names) {
      const opt = document.createElement('option');
      opt.value = n;
      opt.textContent = n;
      picker.appendChild(opt);
    }
    picker.style.display = names.length > 1 ? '' : 'none';
    picker.addEventListener('change', () => {
      state.seriesName = picker.value;
      renderAll(false);
    });

    /* segmented controls ของกราฟ OI change */
    bindSeg('seg-window', 'data-window', (v) => {
      state.chgWindow = Number(v);
      swapChgChart();
    });
    bindSeg('seg-side', 'data-side', (v) => {
      state.chgSide = v;
      swapChgChart();
    });

    bindTabs();
    renderAll(true);
  }

  /* ============================================================
     Tabs: Overview / OI Change / IV Smile
     ------------------------------------------------------------
     กราฟใน panel ที่ hidden มีขนาด 0 — จึงสร้างกราฟของแท็บนั้น
     "ครั้งแรกที่เปิด" แทนการสร้างทั้งหมดตอนโหลด (lazy init)
     ============================================================ */
  const TAB_PANELS = { overview: 'panel-overview', change: 'panel-change', iv: 'panel-iv' };

  function bindTabs() {
    document.querySelectorAll('.tabs button').forEach((btn) => {
      btn.addEventListener('click', () => activateTab(btn.dataset.tab));
    });
  }

  function activateTab(name) {
    if (state.tab === name) return;
    state.tab = name;
    document.querySelectorAll('.tabs button').forEach((b) => {
      const on = b.dataset.tab === name;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', String(on));
    });
    for (const [t, id] of Object.entries(TAB_PANELS)) $(id).hidden = t !== name;

    /* สร้าง/ปรับขนาดกราฟหลัง panel แสดงผลแล้ว (ให้ layout คำนวณขนาดก่อน) */
    requestAnimationFrame(() => {
      if (name === 'change' && !$('chg-card').hidden) {
        if (state.chgChart) state.chgChart.resize();
        else updateChgChart();
      }
      if (name === 'iv') {
        if (state.ivChart) state.ivChart.resize();
        else renderIvSmile(true);
      }
    });
  }

  function bindSeg(id, attr, onChange) {
    const seg = $(id);
    seg.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn || btn.classList.contains('active')) return;
      seg.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      onChange(btn.getAttribute(attr));
    });
  }

  /* fade เบาๆ ตอนสลับ view แล้วให้ Chart.js animate ค่าต่อ */
  function swapChgChart() {
    const box = $('chg-box');
    box.classList.add('swapping');
    setTimeout(() => {
      updateChgChart();
      box.classList.remove('swapping');
    }, REDUCED_MOTION ? 0 : 120);
  }

  /* ============================================================
     DTE ของ series ที่เลือก
     data.json ปัจจุบันมี dte เดียวที่ top-level (ของ series หลัก)
     ถ้า scraper เพิ่ม expiry/dte รายซีรีส์เมื่อไหร่ โค้ดนี้ใช้ได้ทันที
     ============================================================ */
  function dteOf(seriesName) {
    const d = state.data;
    const sd = d.series[seriesName] || {};
    if (M.num(sd.dte) !== null) return sd.dte;
    if (typeof sd.expiry === 'string') {
      const days = Math.round(
        (new Date(sd.expiry) - new Date(d.date)) / 86400000);
      if (isFinite(days)) return days;
    }
    // fallback: dte รวมใช้ได้กับ series แรก (front) เท่านั้น
    const first = Object.keys(d.series)[0];
    return seriesName === first ? M.num(d.dte) : null;
  }

  /* ============================================================
     render ทั้งหน้า (initial = ครั้งแรก มี count-up / stagger)
     ============================================================ */
  function renderAll(initial) {
    const d = state.data;
    const sd = d.series[state.seriesName];
    const spot = M.num(d.spot);
    const dte = dteOf(state.seriesName);

    /* ---- คำนวณตัวชี้วัดทั้งหมดจาก metrics.js ---- */
    const maxPain = M.maxPain(sd);
    const pcr = M.pcr(sd, spot);
    const atmIv = M.atmIV(sd, spot);
    const ivHist = M.ivHistoryOf(state.hist, state.seriesName);
    const rank = M.ivRank(atmIv, ivHist.map((x) => x.iv));
    const range = M.expectedRange(spot, atmIv, dte);
    const skew = M.skew(sd, spot);

    /* unusual flag (1D) ต่อสไตรค์ต่อฝั่ง — ใช้ทั้งกราฟและตาราง
       ถ้าไม่มี history เลย อย่าคำนวณ ΔOI (จะกลายเป็น OI เต็มก้อน) */
    const past1 = M.nDaysBack(state.hist, 1);
    const chg1 = past1
      ? M.oiChange(sd, past1.series[state.seriesName])
      : {};
    state.unusualBySide = { call: {}, put: {} };
    for (const k of M.strikesOf(sd)) {
      for (const side of ['call', 'put']) {
        state.unusualBySide[side][k] = M.unusualOiChange(
          state.hist, state.seriesName, k, side,
          (chg1[String(k)] || {})[side]);
      }
    }

    /* ---- header / banner ---- */
    $('data-date').textContent = `ข้อมูล ณ ${d.date}`;
    renderRolloverBanner(dte);

    /* ---- hero ---- */
    countUp($('spot-value'), spot, (v) => v.toFixed(1));
    const chgEl = $('spot-chg');
    const sc = M.num(d.spotChg);
    if (sc !== null) {
      chgEl.textContent = `${sc >= 0 ? '▲' : '▼'} ${Math.abs(sc).toFixed(1)}`;
      chgEl.className = 'spot-chg ' + (sc >= 0 ? 'up' : 'down');
    } else { chgEl.textContent = ''; }
    renderExpectedRange(range, spot, dte);

    /* ---- stat tiles ---- */
    countUp($('stat-maxpain'), maxPain, (v) => fmtInt(v), 0.05);
    $('stat-maxpain-sub').textContent = (maxPain !== null && spot !== null)
      ? `ห่าง spot ${(maxPain - spot >= 0 ? '+' : '')}${(maxPain - spot).toFixed(1)} จุด`
      : '';

    countUp($('stat-pcr'), pcr.total, (v) => v.toFixed(2), 0.1);
    $('stat-pcr-sub').textContent = pcr.near !== null
      ? `เฉพาะสไตรค์ ±5% ของ spot: ${pcr.near.toFixed(2)}` : '';

    countUp($('stat-atmiv'), atmIv, (v) => v.toFixed(1) + '%', 0.15);
    $('stat-atmiv-sub').textContent = atmIv !== null
      ? `ที่สไตรค์ ${fmtInt(M.atmStrike(sd, spot))}` : '';
    renderIvSpark(ivHist, atmIv);

    renderIvRank(rank);
    renderDte(dte);

    if (skew) {
      countUp($('stat-skew'), skew.skew,
        (v) => (v >= 0 ? '+' : '') + v.toFixed(2), 0.25);
      $('stat-skew-sub').textContent =
        `Put ${skew.putStrike} @${fmt(skew.putIV)} − Call ${skew.callStrike} @${fmt(skew.callIV)}`;
    } else {
      $('stat-skew').textContent = '–';
      $('stat-skew-sub').textContent = 'IV ฝั่ง OTM ไม่พอคำนวณ';
    }

    /* ---- กราฟ + ตาราง ----
       กราฟของแท็บ OI Change / IV Smile สร้างครั้งแรกตอนเปิดแท็บ
       (ดู activateTab) — ที่นี่อัปเดตเฉพาะตัวที่สร้างแล้ว */
    renderOiChart(sd, spot, maxPain, initial);
    renderChangeTab();
    renderTable(sd, chg1, spot, maxPain);
  }

  /* ============================================================
     แท็บ OI Change: ถ้ายังไม่มีสแนปช็อตย้อนหลังเลย (เทียบ 1D ไม่ได้)
     ให้แสดง empty state แทนกราฟ — การเทียบกับ 0 จะหลอกตา
     ============================================================ */
  function renderChangeTab() {
    const havePast = !!M.nDaysBack(state.hist, 1);
    $('chg-empty').hidden = havePast;
    $('chg-card').hidden = !havePast;
    if (havePast && state.chgChart) updateChgChart();
  }

  /* ============================================================
     Rollover banner + คำเตือน Max Pain เมื่อ DTE < 5
     ============================================================ */
  function renderRolloverBanner(dte) {
    const banner = $('rollover-banner');
    const names = Object.keys(state.data.series);
    if (dte !== null && dte < 5) {
      const next = names.find((n) => n !== state.seriesName);
      /* สร้างข้อความด้วย textContent — ชื่อซีรีส์มาจากไฟล์ข้อมูล
         ไม่ประกอบ HTML string ตรงๆ */
      const box = $('rollover-text');
      box.textContent = '';
      const b1 = document.createElement('strong');
      b1.textContent = `${state.seriesName} เหลือ ${dte} วัน`;
      box.appendChild(b1);
      box.appendChild(document.createTextNode(
        ' — สภาพคล่องกำลังย้ายซีรีส์ เริ่มติดตาม'));
      if (next) {
        const b2 = document.createElement('strong');
        b2.textContent = next;
        box.appendChild(b2);
      } else {
        box.appendChild(document.createTextNode('ซีรีส์ถัดไป'));
      }
      box.appendChild(document.createTextNode(
        ' และช่วงนี้ราคามีแนวโน้มถูกดึงเข้าหา Max Pain มากขึ้น'));
      banner.classList.add('show');
    } else {
      banner.classList.remove('show');
    }
  }

  function renderDte(dte) {
    countUp($('stat-dte'), dte, (v) => `${Math.round(v)} วัน`, 0.2);
    const sub = $('stat-dte-sub');
    if (dte === null) {
      $('stat-dte').textContent = '–';
      sub.textContent = 'ไม่มีข้อมูลวันหมดอายุรายซีรีส์ (ต้องเพิ่ม expiry ใน scraper)';
      sub.className = 'sub';
    } else if (dte < 5) {
      sub.textContent = '⚠ ใกล้หมดอายุ — Max Pain มีน้ำหนักมากขึ้น';
      sub.className = 'sub warn';
    } else {
      sub.textContent = `หมดอายุซีรีส์ ${state.seriesName}`;
      sub.className = 'sub';
    }
  }

  /* ============================================================
     IV Rank / Percentile (ต้องมี history ≥ 20 วัน)
     ============================================================ */
  function renderIvRank(rank) {
    const el = $('stat-ivrank');
    const sub = $('stat-ivrank-sub');
    if (rank.insufficient) {
      el.innerHTML = '<span class="not-enough">ข้อมูลสะสมยังไม่พอ</span>';
      sub.textContent = `มี ${rank.days} วัน (ต้องการอย่างน้อย 20 วัน)`;
      return;
    }
    countUp(el, rank.rank, (v) => Math.round(v) + '%', 0.2);
    sub.textContent =
      `Percentile ${Math.round(rank.percentile)} · ช่วง ${rank.min.toFixed(1)}–${rank.max.toFixed(1)}% (${rank.days} วัน)`;
  }

  /* ============================================================
     Expected Range bar (±0.5σ ซ้อนบน ±1σ)
     ============================================================ */
  function renderExpectedRange(range, spot, dte) {
    const label = $('range-label');
    if (!range) {
      label.textContent = 'Expected Range — คำนวณไม่ได้ (ไม่มี IV หรือ DTE)';
      return;
    }
    label.textContent = `Expected Range ถึงหมดอายุ (${dte} วัน)`;

    /* โดเมนของแถบ = ช่วง ±1σ เผื่อขอบ 12% ต่อข้าง */
    const pad = range.move1 * 0.12;
    const lo = range.sigma1.low - pad;
    const hi = range.sigma1.high + pad;
    const pct = (v) => ((v - lo) / (hi - lo)) * 100;

    placeBand($('band-sigma1'), pct(range.sigma1.low), pct(range.sigma1.high));
    placeBand($('band-sigma05'), pct(range.sigma05.low), pct(range.sigma05.high));
    $('range-spot-tick').style.left = `calc(${pct(spot)}% - 1px)`;
    $('range-low').textContent = range.sigma1.low.toFixed(1);
    $('range-high').textContent = range.sigma1.high.toFixed(1);
    $('range-mid').textContent =
      `±0.5σ ${range.sigma05.low.toFixed(0)}–${range.sigma05.high.toFixed(0)} · ±1σ`;
  }

  function placeBand(el, fromPct, toPct) {
    el.style.left = fromPct + '%';
    el.style.width = (toPct - fromPct) + '%';
    /* scaleX 0→1 ผ่าน CSS transition (แถบค่อยๆ กางออกจากกึ่งกลาง) */
    requestAnimationFrame(() =>
      requestAnimationFrame(() => { el.style.transform = 'scaleX(1)'; }));
  }

  /* ============================================================
     sparkline ATM IV ย้อนหลัง (SVG เล็กๆ ใน tile)
     ============================================================ */
  function renderIvSpark(ivHist, current) {
    const box = $('iv-spark');
    box.textContent = '';
    const pts = ivHist.slice(-12).map((x) => x.iv);
    if (current !== null) pts.push(current);
    if (pts.length < 3) return;

    const W = 120, H = 30, P = 3;
    const min = Math.min(...pts), max = Math.max(...pts);
    const x = (i) => P + (i / (pts.length - 1)) * (W - P * 2);
    const y = (v) => max === min ? H / 2
      : H - P - ((v - min) / (max - min)) * (H - P * 2);
    const path = pts.map((v, i) =>
      `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    const line = document.createElementNS(svg.namespaceURI, 'path');
    line.setAttribute('d', path);
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke', COLOR.textMuted);
    line.setAttribute('stroke-width', '1.5');
    const dot = document.createElementNS(svg.namespaceURI, 'circle');
    dot.setAttribute('cx', x(pts.length - 1));
    dot.setAttribute('cy', y(pts[pts.length - 1]));
    dot.setAttribute('r', '2.5');
    dot.setAttribute('fill', COLOR.call);
    svg.appendChild(line);
    svg.appendChild(dot);
    box.appendChild(svg);
  }

  /* ============================================================
     กราฟหลัก: OI รายสไตรค์ + เส้น Spot + เส้น Max Pain
     ============================================================ */

  /* ตำแหน่งของ "ราคา" บนแกนสไตรค์ (category) แบบ fractional index
     เช่น spot 866.3 อยู่ระหว่าง 850(idx 4) กับ 875(idx 5) → 4.65 */
  function fractionalIndex(strikes, price) {
    if (price === null) return null;
    if (price <= strikes[0]) return 0;
    for (let i = 0; i < strikes.length - 1; i++) {
      const a = strikes[i], b = strikes[i + 1];
      if (price >= a && price <= b) return i + (price - a) / (b - a);
    }
    return strikes.length - 1;
  }

  function renderOiChart(sd, spot, maxPain, initial) {
    const strikes = M.strikesOf(sd);
    const callData = strikes.map((k) => M.num(sd[String(k)].callOI));
    const putData = strikes.map((k) => M.num(sd[String(k)].putOI));

    $('oi-hint').textContent =
      `เส้นตั้ง: Spot ${fmt(spot)} และ Max Pain ${fmtInt(maxPain)} · แตะ/ชี้แท่งเพื่อดูตัวเลข`;

    const annotations = {};
    const spotIdx = fractionalIndex(strikes, spot);
    if (spotIdx !== null) {
      annotations.spotLine = {
        type: 'line', xMin: spotIdx, xMax: spotIdx,
        borderColor: COLOR.textSecondary, borderWidth: 1.5,
        label: {
          display: true, content: `Spot ${fmt(spot)}`,
          position: 'start', backgroundColor: COLOR.surfaceRaise,
          color: COLOR.textPrimary, font: { size: 10 },
          padding: 4, borderRadius: 6,
        },
      };
    }
    if (maxPain !== null) {
      const mpIdx = fractionalIndex(strikes, maxPain);
      annotations.maxPainLine = {
        type: 'line', xMin: mpIdx, xMax: mpIdx,
        borderColor: COLOR.textMuted, borderWidth: 1.5, borderDash: [5, 4],
        label: {
          display: true, content: `Max Pain ${fmtInt(maxPain)}`,
          position: 'end', backgroundColor: COLOR.surfaceRaise,
          color: COLOR.textSecondary, font: { size: 10 },
          padding: 4, borderRadius: 6,
        },
      };
    }

    const config = {
      type: 'bar',
      data: {
        labels: strikes.map(String),
        datasets: [
          {
            label: 'Call OI', data: callData,
            backgroundColor: COLOR.call,
            borderRadius: 3, borderSkipped: 'start',
            maxBarThickness: 20, categoryPercentage: 0.75, barPercentage: 0.92,
          },
          {
            label: 'Put OI', data: putData,
            backgroundColor: COLOR.put,
            borderRadius: 3, borderSkipped: 'start',
            maxBarThickness: 20, categoryPercentage: 0.75, barPercentage: 0.92,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: initial ? staggerAnimation() : { duration: 400 },
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { grid: { display: false }, ticks: { color: COLOR.textMuted } },
          y: {
            grid: { color: COLOR.grid, lineWidth: 1 },
            border: { display: false },
            ticks: {
              color: COLOR.textMuted,
              callback: (v) => v >= 1000 ? (v / 1000) + 'K' : v,
            },
          },
        },
        plugins: {
          annotation: { annotations },
          tooltip: {
            callbacks: {
              title: (items) => `สไตรค์ ${items[0].label}`,
              label: (item) =>
                ` ${item.dataset.label}: ${fmtInt(item.parsed.y)}`,
            },
          },
        },
      },
    };

    if (state.oiChart) {
      state.oiChart.data = config.data;
      state.oiChart.options.plugins.annotation.annotations = annotations;
      state.oiChart.update();
    } else {
      state.oiChart = new Chart($('chart-oi'), config);
    }
  }

  /* ============================================================
     กราฟ OI Change: diverging bar (เพิ่ม=เขียว ลด=แดง)
     แกนสไตรค์เดียวกับกราฟ OI ด้านบน + ⚡ ที่สไตรค์ผิดปกติ (มุมมอง 1D)
     ============================================================ */
  function chgDataForView() {
    const sd = state.data.series[state.seriesName];
    const strikes = M.strikesOf(sd);
    const past = M.nDaysBack(state.hist, state.chgWindow);
    /* history ไม่พอสำหรับกรอบนี้ → ไม่พล็อต (การเทียบกับ 0 จะหลอกตา) */
    if (!past) return { strikes, values: strikes.map(() => null), havePast: false };
    const chg = M.oiChange(sd, past.series[state.seriesName]);

    const values = strikes.map((k) => {
      const c = chg[String(k)] || { call: null, put: null };
      if (state.chgSide === 'call') return c.call;
      if (state.chgSide === 'put') return c.put;
      if (c.call === null && c.put === null) return null;
      return M.numOr0(c.call) + M.numOr0(c.put); // รวมสองฝั่ง
    });
    return { strikes, values, havePast: !!past };
  }

  /* สไตรค์นี้ผิดปกติไหมใน view ปัจจุบัน (เฉพาะกรอบ 1D) */
  function unusualAt(strike) {
    if (state.chgWindow !== 1) return null;
    const sides = state.chgSide === 'both' ? ['call', 'put'] : [state.chgSide];
    for (const s of sides) {
      const u = state.unusualBySide[s][strike];
      if (u && u.unusual) return { side: s, z: u.z };
    }
    return null;
  }

  function updateChgChart() {
    const { strikes, values, havePast } = chgDataForView();
    const sideLabel = { both: 'Call+Put', call: 'Call', put: 'Put' }[state.chgSide];

    $('chg-hint').textContent = havePast
      ? `${sideLabel} เทียบ ${state.chgWindow} วันทำการก่อน · เขียว = เพิ่ม แดง = ลด · ⚡ = ผิดปกติเทียบประวัติสไตรค์นั้นเอง (1D)`
      : `history ยังไม่พอสำหรับกรอบ ${state.chgWindow} วัน`;

    const config = {
      type: 'bar',
      data: {
        labels: strikes.map((k) => unusualAt(k) ? `⚡${k}` : String(k)),
        datasets: [{
          label: `ΔOI ${sideLabel}`,
          data: values,
          /* สีตามทิศทาง: เพิ่ม=เขียว ลด=แดง (ทิศของแท่งบอกซ้ำอีกชั้น
             จึงไม่ได้พึ่งสีอย่างเดียว) */
          backgroundColor: values.map((v) =>
            v === null ? COLOR.grid : (v >= 0 ? COLOR.up : COLOR.down)),
          borderRadius: 3, borderSkipped: 'start',
          maxBarThickness: 20, categoryPercentage: 0.6, barPercentage: 0.9,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: REDUCED_MOTION ? false : { duration: 450, easing: 'easeOutQuart' },
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { grid: { display: false }, ticks: { color: COLOR.textMuted } },
          y: {
            grid: { color: COLOR.grid, lineWidth: 1 },
            border: { display: false },
            ticks: {
              color: COLOR.textMuted,
              callback: (v) => (v > 0 ? '+' : '') +
                (Math.abs(v) >= 1000 ? (v / 1000) + 'K' : v),
            },
          },
        },
        plugins: {
          annotation: {
            annotations: {
              zero: {
                type: 'line', yMin: 0, yMax: 0,
                borderColor: COLOR.textMuted, borderWidth: 1,
              },
            },
          },
          tooltip: {
            callbacks: {
              title: (items) => `สไตรค์ ${items[0].label.replace('⚡', '')}`,
              label: (item) => ` ΔOI ${sideLabel}: ${fmtSigned(item.parsed.y)}`,
              footer: (items) => {
                const k = Number(items[0].label.replace('⚡', ''));
                const u = unusualAt(k);
                return u ? `⚡ ผิดปกติฝั่ง ${u.side} (z = ${u.z.toFixed(1)})` : '';
              },
            },
          },
        },
      },
    };

    if (state.chgChart) {
      state.chgChart.data = config.data;
      state.chgChart.update();
    } else {
      state.chgChart = new Chart($('chart-chg'), config);
    }
  }

  /* ============================================================
     กราฟ IV Smile: เส้น IV เฉลี่ย Call/Put ต่อสไตรค์ เทียบ 2 ซีรีส์
     ------------------------------------------------------------
     - ไม่ตาม series picker: ประเด็นคือเทียบโครงสร้าง IV ข้ามอายุสัญญา
       (cross-section ของ IV surface บนข้อมูลจริงที่มี 2 maturity)
     - ข้อมูล EOD ไม่เปลี่ยนระหว่างเปิดหน้า — วาดครั้งเดียวพอ
     - ซีรีส์ไกลใช้เส้นประ: แยกเส้นได้แม้ไม่เห็นสี (CVD/พิมพ์ขาวดำ)
     ============================================================ */
  function renderIvSmile(initial) {
    if (state.ivChart) return;
    const d = state.data;
    /* token สีรองรับ 2 ซีรีส์ — ใช้ 2 ซีรีส์ใกล้สุด (ไกลกว่านั้นสภาพคล่องต่ำ) */
    const names = Object.keys(d.series).slice(0, 2);
    const colors = [COLOR.seriesNear, COLOR.seriesFar];
    const spot = M.num(d.spot);

    /* แกนสไตรค์ = union ของทุกซีรีส์ (บางสไตรค์มีแค่ซีรีส์เดียว) */
    const set = new Set();
    for (const n of names) for (const k of M.strikesOf(d.series[n])) set.add(k);
    const strikes = [...set].sort((a, b) => a - b);

    const datasets = names.map((n, i) => ({
      label: n,
      data: strikes.map((k) => M.midIV((d.series[n] || {})[String(k)])),
      borderColor: colors[i],
      backgroundColor: colors[i],
      borderWidth: 2.5,
      borderDash: i === 0 ? [] : [6, 4],
      pointRadius: 3,
      pointHoverRadius: 5.5,
      cubicInterpolationMode: 'monotone', // โค้งนุ่มโดยไม่ overshoot จุดจริง
      spanGaps: false, // สไตรค์ที่ไม่มี IV ให้ขาดจริง ไม่ลากเส้นหลอก
    }));

    /* legend สร้างเอง (ชื่อซีรีส์มาจากไฟล์ข้อมูล) — ซีรีส์เดียวไม่ต้องมี */
    const legend = $('iv-legend');
    legend.textContent = '';
    if (names.length >= 2) {
      names.forEach((n, i) => {
        const key = document.createElement('span');
        key.className = 'key';
        const sw = document.createElement('span');
        sw.className = 'swatch line';
        sw.style.background = i === 0 ? colors[i]
          : `repeating-linear-gradient(90deg, ${colors[i]} 0 6px, transparent 6px 10px)`;
        key.appendChild(sw);
        const dte = dteOf(n);
        key.appendChild(document.createTextNode(
          dte !== null ? `${n} (${dte} วัน)` : n));
        legend.appendChild(key);
      });
    }
    $('iv-hint').textContent =
      'เส้น = ค่าเฉลี่ย IV Call/Put ต่อสไตรค์ · เส้นประ = ซีรีส์ไกล · เส้นตั้ง = Spot · แตะ/ชี้จุดเพื่อดู IV แยกฝั่ง';

    const annotations = {};
    const spotIdx = fractionalIndex(strikes, spot);
    if (spotIdx !== null) {
      annotations.spotLine = {
        type: 'line', xMin: spotIdx, xMax: spotIdx,
        borderColor: COLOR.textSecondary, borderWidth: 1.5,
        label: {
          display: true, content: `Spot ${fmt(spot)}`,
          position: 'start', backgroundColor: COLOR.surfaceRaise,
          color: COLOR.textPrimary, font: { size: 10 },
          padding: 4, borderRadius: 6,
        },
      };
    }

    state.ivChart = new Chart($('chart-iv'), {
      type: 'line',
      data: { labels: strikes.map(String), datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        /* จุดทยอยโผล่ซ้าย→ขวาเหมือนแท่งกราฟอื่น (ปิดเองเมื่อ reduced motion) */
        animation: initial ? staggerAnimation() : false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { grid: { display: false }, ticks: { color: COLOR.textMuted } },
          y: {
            /* ไม่บังคับเริ่มที่ 0 — เส้นอ่านจากตำแหน่ง ไม่ใช่ความยาวแท่ง */
            grid: { color: COLOR.grid, lineWidth: 1 },
            border: { display: false },
            ticks: { color: COLOR.textMuted, callback: (v) => v + '%' },
          },
        },
        plugins: {
          annotation: { annotations },
          tooltip: {
            callbacks: {
              title: (items) => `สไตรค์ ${items[0].label}`,
              label: (item) => {
                const row =
                  (d.series[item.dataset.label] || {})[item.label] || {};
                return ` ${item.dataset.label}: ${fmt(item.parsed.y)}%`
                  + ` (C ${fmt(M.num(row.callIV))} / P ${fmt(M.num(row.putIV))})`;
              },
            },
          },
        },
      },
    });
  }

  /* ============================================================
     ตารางรายสไตรค์ (มุมมองแบบตารางของข้อมูลทุกกราฟ)
     ============================================================ */
  function renderTable(sd, chg1, spot, maxPain) {
    const tbody = $('strike-table').querySelector('tbody');
    tbody.textContent = '';
    const atm = M.atmStrike(sd, spot);
    const strikes = M.strikesOf(sd);

    /* แถบ OI ในเซลล์: ยาวตามสัดส่วนเทียบค่าสูงสุดของฝั่งตัวเอง
       (Call เทียบ Call, Put เทียบ Put — คนละสเกลกันโดยตั้งใจ) */
    const maxCallOI = Math.max(1, ...strikes.map((k) => M.numOr0((sd[String(k)] || {}).callOI)));
    const maxPutOI = Math.max(1, ...strikes.map((k) => M.numOr0((sd[String(k)] || {}).putOI)));

    for (const k of strikes) {
      const row = sd[String(k)] || {};
      const c = chg1[String(k)] || { call: null, put: null };
      const tr = document.createElement('tr');
      if (k === atm) tr.classList.add('atm');
      if (k === maxPain) tr.classList.add('mp');

      tr.appendChild(tdStrike(k));
      tr.appendChild(tdOi(row.callOI, 'call', maxCallOI));
      tr.appendChild(tdChange(c.call, state.unusualBySide.call[k]));
      tr.appendChild(tdRatio(M.volOiRatio(row, 'call'), 'call'));
      tr.appendChild(tdOi(row.putOI, 'put', maxPutOI));
      tr.appendChild(tdChange(c.put, state.unusualBySide.put[k]));
      tr.appendChild(tdRatio(M.volOiRatio(row, 'put'), 'put'));
      tr.appendChild(td(
        `${fmt(M.num(row.callIV))} / ${fmt(M.num(row.putIV))}`));
      tbody.appendChild(tr);
    }

    function td(text) {
      const el = document.createElement('td');
      el.textContent = text; // textContent เสมอ — ข้อมูลภายนอกห้าม innerHTML
      return el;
    }

    /* Strike + ป้าย ATM / MAX PAIN (ตรงกันทั้งคู่ = "ATM · MP") */
    function tdStrike(k) {
      const el = td(String(k));
      let tag = '';
      if (k === atm && k === maxPain) tag = 'ATM · MP';
      else if (k === atm) tag = 'ATM';
      else if (k === maxPain) tag = 'MAX PAIN';
      if (tag) {
        const t = document.createElement('span');
        t.className = 'tag';
        t.textContent = tag;
        el.appendChild(t);
      }
      return el;
    }

    /* OI + แถบพื้นหลังตามสัดส่วน (มองแนวโน้มได้โดยไม่ต้องอ่านตัวเลข) */
    function tdOi(v, side, max) {
      const el = document.createElement('td');
      el.className = 'oi-cell';
      const bar = document.createElement('div');
      bar.className = 'oi-bar ' + side;
      bar.style.width = (M.numOr0(v) / max * 100).toFixed(1) + '%';
      el.appendChild(bar);
      const span = document.createElement('span');
      span.textContent = fmtInt(M.num(v));
      el.appendChild(span);
      return el;
    }

    /* ΔOI: สี+เครื่องหมายตามทิศ, badge ⚡ ถ้าผิดปกติ */
    function tdChange(v, u) {
      const el = document.createElement('td');
      const span = document.createElement('span');
      span.textContent = fmtSigned(v);
      if (v !== null && v !== 0) span.className = v > 0 ? 'chg-up' : 'chg-down';
      el.appendChild(span);
      if (u && u.unusual) {
        const b = document.createElement('span');
        b.className = 'badge unusual';
        b.textContent = `⚡ z ${u.z.toFixed(1)}`;
        b.title = `เปลี่ยนแปลงมากกว่าปกติของสไตรค์นี้ (${u.samples} วัน)`;
        el.appendChild(b);
      }
      return el;
    }

    /* Vol/OI > 1 (เงินใหม่เข้าผิดปกติ): สีตามฝั่ง + ▲ กำกับ
       ไม่พึ่งสีอย่างเดียว — สัญลักษณ์บอกซ้ำอีกชั้น */
    function tdRatio(r, side) {
      const el = document.createElement('td');
      const span = document.createElement('span');
      if (r === null) {
        span.textContent = '–';
      } else {
        span.textContent = r.toFixed(2) + (r > 1 ? ' ▲' : '');
        if (r > 1) span.className = 'volhot ' + side;
      }
      el.appendChild(span);
      return el;
    }
  }
})();
