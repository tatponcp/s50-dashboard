/* ============================================================
   dashboard.js — โหลด data.json แล้ว render ทุกอย่าง
   ------------------------------------------------------------
   การคำนวณตัวชี้วัดทั้งหมดอยู่ใน metrics.js (โหลดก่อนไฟล์นี้)
   ไฟล์นี้ทำหน้าที่: จัดการ state, วาดกราฟ ECharts, animation
   สเปกกราฟ (สี/grid/tooltip/จังหวะ animation) ยกมาจากไฟล์ดีไซน์
   "S50 Options Dashboard.dc.html" ใน Claude Design ตรงๆ
   ============================================================ */
'use strict';

(() => {
  const M = Metrics;
  const $ = (id) => document.getElementById(id);

  /* ฟีเจอร์ที่พักไว้พัฒนาต่อ — เปิด ivSmile คู่กับลบ hidden
     ของปุ่มแท็บใน index.html */
  const FEATURES = { ivSmile: false };

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
     ค่าตั้งต้นร่วมของ ECharts ให้เข้ากับธีม (ตามไฟล์ดีไซน์)
     ============================================================ */
  const CHART_FONT = token('--font-sans') || 'IBM Plex Sans, sans-serif';
  const MONO_FONT = token('--font-mono') || 'IBM Plex Mono, monospace';

  function baseOption() {
    return {
      backgroundColor: 'transparent',
      animation: !REDUCED_MOTION,
      textStyle: { fontFamily: CHART_FONT, color: COLOR.textMuted, fontSize: 12 },
      tooltip: {
        trigger: 'axis',
        confine: true, // จอแคบ: tooltip ไม่หลุดขอบจอ
        backgroundColor: COLOR.surfaceRaise,
        borderColor: COLOR.border,
        textStyle: { color: COLOR.textSecondary, fontSize: 12.5 },
      },
    };
  }

  /* แกนสไตรค์ (category) + แกนค่า สไตล์เดียวกันทุกกราฟ */
  function strikeAxis(strikes) {
    return {
      type: 'category',
      data: strikes.map(String),
      axisLine: { lineStyle: { color: COLOR.border } },
      axisLabel: {
        color: COLOR.textMuted, fontSize: 11,
        interval: Math.ceil(strikes.length / 22),
      },
    };
  }

  function valueAxis(formatter) {
    return {
      type: 'value',
      axisLine: { show: false },
      splitLine: { lineStyle: { color: COLOR.grid } },
      axisLabel: { color: COLOR.textMuted, fontSize: 11, formatter },
    };
  }

  /* ปรับขนาดกราฟตามหน้าต่าง (เฉพาะตัวที่สร้างแล้ว) */
  window.addEventListener('resize', () => {
    for (const c of [state.oiChart, state.chgChart, state.ivChart]) {
      if (c) c.resize();
    }
  });

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
      renderAll();
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
    renderAll();
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
    if (name === 'iv' && !FEATURES.ivSmile) return;
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
        else renderIvSmile();
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

  /* fade เบาๆ ตอนสลับ view แล้วให้ ECharts animate ค่าต่อ */
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
     render ทั้งหน้า (เรียกซ้ำเมื่อสลับซีรีส์)
     ============================================================ */
  function renderAll() {
    const d = state.data;
    const sd = d.series[state.seriesName];
    const spot = M.num(d.spot);
    const dte = dteOf(state.seriesName);

    /* ---- คำนวณตัวชี้วัดทั้งหมดจาก metrics.js ---- */
    const maxPain = M.maxPain(sd);
    const pcr = M.pcr(sd, spot);
    const atmIv = M.atmIV(sd, spot);
    const ivHist = M.ivHistoryOf(state.hist, state.seriesName);
    const range = M.expectedRange(spot, atmIv, dte);

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

    renderDte(dte);

    /* ---- กราฟ + ตาราง ----
       กราฟของแท็บ OI Change / IV Smile สร้างครั้งแรกตอนเปิดแท็บ
       (ดู activateTab) — ที่นี่อัปเดตเฉพาะตัวที่สร้างแล้ว */
    renderOiChart(sd, spot, maxPain);
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

  function renderOiChart(sd, spot, maxPain) {
    const strikes = M.strikesOf(sd);
    const callData = strikes.map((k) => M.num(sd[String(k)].callOI));
    const putData = strikes.map((k) => M.num(sd[String(k)].putOI));

    $('oi-hint').textContent =
      `เส้นตั้ง: Spot ${fmt(spot)} และ Max Pain ${fmtInt(maxPain)} · แตะ/ชี้แท่งเพื่อดูตัวเลข`;

    /* เส้นตั้ง Spot (ทึบ) + Max Pain (ประ) — สไตล์ตามไฟล์ดีไซน์ */
    const markLineData = [];
    const spotIdx = fractionalIndex(strikes, spot);
    if (spotIdx !== null) {
      markLineData.push({
        xAxis: spotIdx,
        lineStyle: { color: COLOR.textSecondary, width: 1.5 },
        label: {
          formatter: `Spot ${fmt(spot)}`, color: COLOR.textPrimary,
          backgroundColor: COLOR.surfaceRaise, padding: 5, borderRadius: 6, fontSize: 11,
        },
      });
    }
    if (maxPain !== null) {
      markLineData.push({
        xAxis: fractionalIndex(strikes, maxPain),
        lineStyle: { color: COLOR.textMuted, width: 1.5, type: 'dashed' },
        label: {
          formatter: `Max Pain ${fmtInt(maxPain)}`, color: COLOR.textSecondary,
          backgroundColor: COLOR.surfaceRaise, padding: 5, borderRadius: 6, fontSize: 11,
          /* Spot กับ Max Pain มักอยู่ใกล้กัน — ดันป้ายนี้ต่ำลงมา
             ให้คนละระดับกับป้าย Spot (ตำแหน่ง inside จะหมุนป้ายตามเส้น
             เลยใช้ offset แทน — ป้ายยังแนวนอนอ่านง่าย) */
          offset: [0, 26],
        },
      });
    }

    if (!state.oiChart) state.oiChart = echarts.init($('chart-oi'));
    state.oiChart.setOption({
      ...baseOption(),
      grid: { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
      tooltip: {
        ...baseOption().tooltip,
        axisPointer: { type: 'shadow' },
        formatter: (params) => {
          let s = `สไตรค์ ${strikes[params[0].dataIndex]}`;
          for (const p of params) s += `<br/>${p.seriesName}: ${fmtInt(p.value)}`;
          return s;
        },
      },
      xAxis: strikeAxis(strikes),
      yAxis: valueAxis((v) => (v >= 1000 ? v / 1000 + 'K' : v)),
      series: [
        {
          name: 'Call OI', type: 'bar', data: callData,
          itemStyle: { color: COLOR.call, borderRadius: [3, 3, 0, 0] },
          barMaxWidth: 20,
          markLine: markLineData.length
            ? { silent: true, symbol: 'none', data: markLineData }
            : undefined,
        },
        {
          name: 'Put OI', type: 'bar', data: putData,
          itemStyle: { color: COLOR.put, borderRadius: [3, 3, 0, 0] },
          barMaxWidth: 20,
        },
      ],
    }, true);
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
    if (!past) {
      return { strikes, values: strikes.map(() => null), breakdown: {}, havePast: false };
    }
    const chg = M.oiChange(sd, past.series[state.seriesName]);

    const values = strikes.map((k) => {
      const c = chg[String(k)] || { call: null, put: null };
      if (state.chgSide === 'call') return c.call;
      if (state.chgSide === 'put') return c.put;
      if (c.call === null && c.put === null) return null;
      return M.numOr0(c.call) + M.numOr0(c.put); // รวมสองฝั่ง
    });
    /* breakdown: ให้ tooltip/movers แจกแจง Call/Put ได้ในมุมมอง "รวม" */
    return { strikes, values, breakdown: chg, havePast: true };
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

  /* กล่องสรุป "วันนี้เกิดอะไรขึ้น" เหนือกราฟ — สไตรค์เป็นพระเอก
     ตามด้วยจำนวนสัญญาที่เปลี่ยน อ่านคำตอบได้ก่อนไล่ดูแท่ง */
  function renderMovers(strikes, values, breakdown, havePast) {
    /* กล่องเพิ่ม/ลด: id = สไตรค์, id-delta = จำนวนสัญญา, id-sub = แจกแจง */
    const setBox = (id, strike, delta, sub) => {
      $(id).textContent = strike;
      $(id + '-delta').textContent = delta;
      $(id + '-sub').textContent = sub;
    };

    if (!havePast) {
      setBox('mv-build', '—', '', '');
      setBox('mv-unwind', '—', '', '');
      $('mv-net').textContent = '—';
      $('mv-net').className = 'strike';
      $('mv-net-sub').textContent = '';
      return;
    }

    /* แจกแจง Call/Put เฉพาะมุมมอง "รวม" — มุมมองแยกฝั่งไม่ต้องอธิบายซ้ำ */
    const bd = (k) => {
      if (state.chgSide !== 'both') return '';
      const c = breakdown[String(k)] || {};
      return `Call ${fmtSigned(c.call ?? null)} · Put ${fmtSigned(c.put ?? null)}`;
    };

    let build = null, unwind = null, net = 0, any = false;
    values.forEach((v, i) => {
      if (v === null) return;
      any = true;
      net += v;
      if (v > 0 && (build === null || v > values[build])) build = i;
      if (v < 0 && (unwind === null || v < values[unwind])) unwind = i;
    });

    if (build !== null) {
      setBox('mv-build', String(strikes[build]),
        `${fmtSigned(values[build])} สัญญา`, bd(strikes[build]));
    } else {
      setBox('mv-build', '—', '', 'ไม่มีสไตรค์ที่ OI เพิ่ม');
    }
    if (unwind !== null) {
      setBox('mv-unwind', String(strikes[unwind]),
        `${fmtSigned(values[unwind])} สัญญา`, bd(strikes[unwind]));
    } else {
      setBox('mv-unwind', '—', '', 'ไม่มีสไตรค์ที่ OI ลด');
    }

    const sideLabel = { both: 'Call+Put', call: 'Call', put: 'Put' }[state.chgSide];
    $('mv-net').textContent = any ? fmtSigned(net) : '—';
    $('mv-net').className = 'strike' + (net > 0 ? ' up' : net < 0 ? ' down' : '');
    $('mv-net-sub').textContent =
      `${sideLabel} · เทียบ ${state.chgWindow} วันทำการก่อน`;
  }

  function updateChgChart() {
    const { strikes, values, breakdown, havePast } = chgDataForView();
    const sideLabel = { both: 'Call+Put', call: 'Call', put: 'Put' }[state.chgSide];

    renderMovers(strikes, values, breakdown, havePast);

    $('chg-hint').textContent = havePast
      ? `${sideLabel} เทียบ ${state.chgWindow} วันทำการก่อน · แท่งขวา (เขียว) = เพิ่ม · แท่งซ้าย (แดง) = ลด · ⚡ = ผิดปกติเทียบประวัติสไตรค์นั้นเอง (1D)`
      : `history ยังไม่พอสำหรับกรอบ ${state.chgWindow} วัน`;

    /* สูงตามจำนวนสไตรค์: แถวละ ~30px ทุกสไตรค์ได้พื้นที่อ่านสบาย */
    const box = $('chg-box');
    box.style.height =
      Math.min(820, Math.max(380, strikes.length * 30 + 80)) + 'px';

    /* จอแคบ: ป้ายตัวเลขกินสัดส่วนพื้นที่กราฟมากขึ้น — ยืดแกนเผื่อมากขึ้น
       ไม่งั้นป้ายของแท่งยาวสุดโดนตัดที่ขอบกราฟ */
    const axisPad = box.clientWidth < 520 ? 1.5 : 1.22;

    /* ป้ายตัวเลขบนแท่ง: เฉพาะ 3 อันดับที่ขยับแรงสุด + สไตรค์ผิดปกติ
       (ติดป้ายทุกแท่ง = อ่านไม่ออก, ไม่ติดเลย = ต้องชี้ทีละแท่ง) */
    const top3 = values
      .map((v, i) => ({ abs: Math.abs(v ?? 0), i }))
      .filter((x) => x.abs > 0)
      .sort((a, b) => b.abs - a.abs)
      .slice(0, 3)
      .map((x) => x.i);

    const data = values.map((v, i) => {
      const u = unusualAt(strikes[i]);
      const positive = (v ?? 0) >= 0;
      return {
        value: v,
        itemStyle: {
          color: positive ? COLOR.up : COLOR.down,
          /* มุมโค้งเฉพาะปลายแท่ง (ฝั่งที่ชี้ออกจากเส้นศูนย์) */
          borderRadius: positive ? [0, 3, 3, 0] : [3, 0, 0, 3],
        },
        label: v !== null && (top3.includes(i) || u) ? {
          show: true,
          position: positive ? 'right' : 'left',
          color: COLOR.textSecondary,
          fontSize: 12,
          fontFamily: MONO_FONT,
          formatter: () => (u ? '⚡' : '') + fmtSigned(v),
        } : undefined,
      };
    });

    if (!state.chgChart) state.chgChart = echarts.init($('chart-chg'));
    state.chgChart.resize(); // ความสูง container เพิ่งเปลี่ยนตามจำนวนสไตรค์
    state.chgChart.setOption({
      ...baseOption(),
      grid: { left: 8, right: 16, top: 10, bottom: 8, containLabel: true },
      tooltip: {
        ...baseOption().tooltip,
        axisPointer: { type: 'shadow' },
        formatter: (params) => {
          const p = params[0];
          const k = strikes[p.dataIndex];
          let s = `สไตรค์ ${k}<br/>ΔOI ${sideLabel}: ${fmtSigned(p.value)}`;
          if (state.chgSide === 'both') {
            const c = breakdown[String(k)] || {};
            s += `<br/>Call ${fmtSigned(c.call ?? null)} · Put ${fmtSigned(c.put ?? null)}`;
          }
          const u = unusualAt(k);
          if (u) s += `<br/>⚡ ผิดปกติฝั่ง ${u.side} (z = ${u.z.toFixed(1)})`;
          return s;
        },
      },
      /* แนวนอน: แกนตั้ง = สไตรค์ (สูงอยู่บน) แกนนอน = ΔOI
         ทิศของแท่ง (ซ้าย/ขวาจากเส้นศูนย์) บอกทางซ้ำกับสี
         จึงอ่านได้แม้แยกเขียว/แดงไม่ออก */
      xAxis: {
        type: 'value',
        /* แกนสมมาตร: เส้นศูนย์อยู่กลางกราฟเสมอ ไม่เอียงตามฝั่งที่ค่าโต
           ส่วนเผื่อ (axisPad) กันป้ายตัวเลขท้ายแท่งยาวสุดโดนตัดที่ขอบ */
        min: ({ min, max }) => {
          const m = Math.max(Math.abs(min), Math.abs(max));
          return isFinite(m) && m > 0 ? -m * axisPad : min;
        },
        max: ({ min, max }) => {
          const m = Math.max(Math.abs(min), Math.abs(max));
          return isFinite(m) && m > 0 ? m * axisPad : max;
        },
        axisLine: { show: false },
        splitLine: { lineStyle: { color: COLOR.grid } },
        axisLabel: {
          color: COLOR.textMuted, fontSize: 12,
          /* ขอบแกนเป็นค่าที่ยืดออกมา (ไม่ใช่เลขกลมๆ) — ไม่ต้องโชว์ */
          showMinLabel: false,
          showMaxLabel: false,
          formatter: (v) =>
            (v > 0 ? '+' : '') + (Math.abs(v) >= 1000 ? v / 1000 + 'K' : v),
        },
      },
      yAxis: {
        type: 'category',
        data: strikes.map(String),
        axisLine: { lineStyle: { color: COLOR.border } },
        axisLabel: {
          color: COLOR.textSecondary, fontSize: 12,
          fontFamily: MONO_FONT, interval: 0,
        },
      },
      series: [{
        name: `ΔOI ${sideLabel}`,
        type: 'bar',
        data,
        barMaxWidth: 18,
        markLine: {
          silent: true, symbol: 'none',
          lineStyle: { color: COLOR.textSecondary, width: 1 },
          label: { show: false },
          data: [{ xAxis: 0 }], // เส้นศูนย์กลาง — แกนหลักของการอ่านกราฟนี้
        },
      }],
    }, true);
  }

  /* ============================================================
     กราฟ IV Smile: เส้น IV เฉลี่ย Call/Put ต่อสไตรค์ เทียบ 2 ซีรีส์
     ------------------------------------------------------------
     - ไม่ตาม series picker: ประเด็นคือเทียบโครงสร้าง IV ข้ามอายุสัญญา
       (cross-section ของ IV surface บนข้อมูลจริงที่มี 2 maturity)
     - ข้อมูล EOD ไม่เปลี่ยนระหว่างเปิดหน้า — วาดครั้งเดียวพอ
     - ซีรีส์ไกลใช้เส้นประ: แยกเส้นได้แม้ไม่เห็นสี (CVD/พิมพ์ขาวดำ)
     ============================================================ */
  function renderIvSmile() {
    if (!FEATURES.ivSmile) return; // พักไว้พัฒนาต่อ
    if (state.ivChart) return;
    const d = state.data;
    /* สีรองรับ 2 ซีรีส์ — ใช้ 2 ซีรีส์ใกล้สุด (ไกลกว่านั้นสภาพคล่องต่ำ) */
    const names = Object.keys(d.series).slice(0, 2);
    const lineColors = [COLOR.seriesNear, COLOR.seriesFar];
    const spot = M.num(d.spot);

    /* แกนสไตรค์ = union ของทุกซีรีส์ (บางสไตรค์มีแค่ซีรีส์เดียว) */
    const set = new Set();
    for (const n of names) for (const k of M.strikesOf(d.series[n])) set.add(k);
    const strikes = [...set].sort((a, b) => a - b);

    /* เส้น Spot ปักที่สไตรค์ใกล้สุด (ตามไฟล์ดีไซน์) */
    const spotIdx = strikes.length && spot !== null
      ? strikes.reduce((best, s, i) =>
          (Math.abs(s - spot) < Math.abs(strikes[best] - spot) ? i : best), 0)
      : null;

    $('iv-hint').textContent =
      'เส้น = ค่าเฉลี่ย IV Call/Put ต่อสไตรค์ · เส้นประ = ซีรีส์ไกล · เส้นตั้ง = Spot · แตะ/ชี้จุดเพื่อดู IV แยกฝั่ง';

    const series = names.map((n, i) => ({
      name: `${n} (${dteOf(n) !== null ? dteOf(n) + ' วัน' : '?'})`,
      type: 'line',
      data: strikes.map((k) => M.midIV((d.series[n] || {})[String(k)])),
      lineStyle: { color: lineColors[i], width: 2.5, type: i === 0 ? 'solid' : 'dashed' },
      itemStyle: { color: lineColors[i] },
      symbolSize: 7,
      connectNulls: false, // สไตรค์ที่ไม่มี IV ให้ขาดจริง ไม่ลากเส้นหลอก
      smooth: 0.2,
      animationDuration: 900,
      animationDelay: (idx) => 200 + idx * 22, // จุดทยอยโผล่ซ้าย→ขวา
      markLine: i === 0 && spotIdx !== null ? {
        silent: true, symbol: 'none',
        lineStyle: { color: COLOR.textSecondary, width: 1 },
        label: {
          formatter: `Spot ${fmt(spot)}`, color: COLOR.textPrimary,
          backgroundColor: COLOR.surfaceRaise, padding: 6, borderRadius: 6, fontSize: 12,
        },
        data: [{ xAxis: spotIdx }],
      } : undefined,
    }));

    state.ivChart = echarts.init($('chart-iv'));
    state.ivChart.setOption({
      ...baseOption(),
      animationDuration: 900,
      animationEasing: 'cubicOut',
      grid: { left: 8, right: 16, top: 40, bottom: 8, containLabel: true },
      legend: { top: 0, textStyle: { color: COLOR.textSecondary, fontSize: 12.5 } },
      tooltip: {
        ...baseOption().tooltip,
        formatter: (params) => {
          const k = strikes[params[0].dataIndex];
          let s = `สไตรค์ ${k}`;
          for (const p of params) {
            /* ชื่อ series มีวงเล็บ dte ต่อท้าย — ตัดออกเพื่อ lookup ข้อมูลดิบ */
            const name = p.seriesName.replace(/ \(.*\)$/, '');
            const row = (d.series[name] || {})[String(k)] || {};
            s += `<br/>${p.seriesName}: ${p.value === null ? '–' : fmt(p.value) + '%'}`
              + ` (C ${fmt(M.num(row.callIV))} / P ${fmt(M.num(row.putIV))})`;
          }
          return s;
        },
      },
      xAxis: strikeAxis(strikes),
      yAxis: { ...valueAxis('{value}%'), scale: true }, // ไม่บังคับเริ่มที่ 0 — เส้นอ่านจากตำแหน่ง
      series,
    }, true);
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
