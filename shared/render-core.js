/* ============================================================
   shared/render-core.js — Morning Brief
   ------------------------------------------------------------
   ตัวกลาง render ที่ทั้ง internal/ (preview ตอนกรอก) และ client/
   (หน้าลูกค้าจริง) เรียกใช้ร่วมกัน เพื่อไม่ให้ preview กับของจริง
   หน้าตาเพี้ยนกัน — แก้ layout ที่นี่ที่เดียวพอ

   ไม่มี dependency ภายนอก (vanilla เท่านั้น) เพราะไฟล์นี้ต้องขึ้น
   client/ (public) ด้วย
   ============================================================ */
(function (global) {
  'use strict';

  // ---- section metadata คงที่ (ไอคอน/สี accent ต่อ section) ----
  // สีอ้างอิงจาก theme navy/gold เดิมของ dashboard + accent เสริมต่อหมวด
  const SECTION_META = {
    1: { icon: 'chart-up', accent: 'var(--mb-accent-gold)' },
    2: { icon: 'flow', accent: 'var(--mb-accent-cyan)' },
    3: { icon: 'dollar', accent: 'var(--mb-accent-green)' },
    4: { icon: 'target', accent: 'var(--mb-accent-gold)' },
    5: { icon: 'breadth', accent: 'var(--mb-accent-purple)' },
    6: { icon: 'globe', accent: 'var(--mb-accent-cyan)' },
  };

  const ICONS = {
    'chart-up': '<path d="M4 17l5-6 4 4 7-9" /><path d="M15 6h5v5" />',
    'flow': '<path d="M4 6h10a4 4 0 0 1 0 8H8a2 2 0 0 0 0 4h10" />',
    'dollar': '<path d="M12 3v18M8 7.5c0-1.5 1.5-2.5 4-2.5s4 1.2 4 2.7c0 3-8 1.8-8 4.8 0 1.5 1.5 2.5 4 2.5s4-1 4-2.5" />',
    'target': '<circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="0.6" fill="currentColor" />',
    'breadth': '<path d="M4 19V9M10 19V5M16 19v-7M22 19V11" />',
    'globe': '<circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.6 2.4 4 5.3 4 8.5s-1.4 6.1-4 8.5c-2.6-2.4-4-5.3-4-8.5s1.4-6.1 4-8.5z" />',
    'list': '<path d="M8 6h12M8 12h12M8 18h12M3 6h.01M3 12h.01M3 18h.01" />',
    'brain': '<path d="M9 4a3 3 0 0 0-3 3v.3A3 3 0 0 0 4 10v1a3 3 0 0 0 1.5 2.6A3 3 0 0 0 8 18a3 3 0 0 0 3-2.8V7a3 3 0 0 0-2-3z" /><path d="M15 4a3 3 0 0 1 3 3v.3a3 3 0 0 1 2 2.7v1a3 3 0 0 1-1.5 2.6A3 3 0 0 1 16 18a3 3 0 0 1-3-2.8V7a3 3 0 0 1 2-3z" />',
    'bolt': '<path d="M13 3 5 14h6l-1 7 8-11h-6z" />',
    'menu': '<path d="M4 7h16M4 12h16M4 17h16" />',
    'chevron-left': '<path d="M15 6l-6 6 6 6" />',
    'sun': '<circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />',
    'moon': '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z" />',
    'overview': '<path d="M4 6h16v12H4z" /><path d="M4 10h16" />',
  };

  function svgIcon(type, size) {
    const d = ICONS[type] || ICONS.list;
    size = size || 18;
    return `<svg class="mb-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  }

  const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

  // "2026-08-06" -> "06 ส.ค. 2569" (พ.ศ.) — ถ้า parse ไม่ได้ คืนค่าเดิม
  function formatThaiDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) return iso || '';
    return `${m[3]} ${THAI_MONTHS[Number(m[2]) - 1]} ${Number(m[1]) + 543}`;
  }

  function dateBadge(date) {
    if (!date) return '';
    return `<span class="mb-date-badge"><span class="mb-live-dot" aria-hidden="true"></span>ข้อมูล ณ <b>${escapeHtml(formatThaiDate(date))}</b></span>`;
  }

  // ตัวเลขที่ขึ้นต้นด้วย + / - ให้ระบายสีขึ้น-ลงเอง (ระบุ dir: 'pos'|'neg'|'flat' ทับได้)
  function statDirClass(stat) {
    if (stat.dir === 'pos') return ' is-pos';
    if (stat.dir === 'neg') return ' is-neg';
    if (stat.dir) return '';
    const v = String(stat.value || '').trim();
    if (/^\+/.test(v)) return ' is-pos';
    if (/^[-−]/.test(v)) return ' is-neg';
    return '';
  }

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // แปลง "S50U26" แบบ keyword ให้ขึ้น highlight สีทองใน insight bar
  // (ตัวเลขและคำที่ครอบด้วย ** จะถูก highlight)
  function highlightInsight(text) {
    if (!text) return '';
    return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<span class="mb-hl">$1</span>');
  }

  function bulletList(items, iconType) {
    if (!items || !items.length) return '';
    return `<ul class="mb-bullets">${items
      .map((t) => `<li>${svgIcon(iconType || 'list', 14)}<span>${escapeHtml(t)}</span></li>`)
      .join('')}</ul>`;
  }

  function actionList(items) {
    if (!items || !items.length) return '';
    return `<dl class="mb-actionlist">${items
      .map(
        (it) =>
          `<div class="mb-action-row">${svgIcon(it.icon || 'bolt', 14)}<dt>${escapeHtml(it.label)}</dt><dd>${escapeHtml(it.value)}</dd></div>`
      )
      .join('')}</dl>`;
  }

  function imageBlock(images) {
    if (!images || !images.length) {
      return `<div class="mb-img-placeholder">ยังไม่มีภาพแนบ</div>`;
    }
    return `<div class="mb-img-grid mb-img-grid-${images.length}">${images
      .map(
        (img) =>
          `<figure class="mb-img-fig"><img src="${escapeHtml(img.src)}" alt="${escapeHtml(img.label || '')}" loading="lazy" /><figcaption>${escapeHtml(img.label || '')}</figcaption></figure>`
      )
      .join('')}</div>`;
  }

  function statsRow(stats) {
    if (!stats || !stats.length) return '';
    return `<div class="mb-stats-row">${stats
      .map((s) => {
        const raw = escapeHtml(s.value);
        return `<div class="mb-stat-chip"><span class="mb-stat-label">${escapeHtml(s.label)}</span><span class="mb-stat-value${statDirClass(s)}" data-final="${raw}">${raw}</span></div>`;
      })
      .join('')}</div>`;
  }

  function historyTable(history, columns) {
    if (!history || !history.length || !columns || !columns.length) return '';
    return `
      <details class="mb-history">
        <summary>ตารางย้อนหลัง (${history.length} แถว)</summary>
        <div class="mb-table-scroll">
          <table>
            <thead><tr>${columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join('')}</tr></thead>
            <tbody>${history
              .map(
                (row) => `<tr>${columns.map((c) => `<td>${escapeHtml(row[c.key])}</td>`).join('')}</tr>`
              )
              .join('')}</tbody>
          </table>
        </div>
      </details>`;
  }

  // ---- Overview card ----
  function renderOverview(container, ov, date) {
    if (!container) return;
    ov = ov || {};
    const bigPicture = (ov.bigPicture || [])
      .map(
        (b, i) => `
        <div class="mb-bp-card">
          <span class="mb-bp-num">${i + 1}</span>
          ${svgIcon(b.iconType || 'chart-up', 20)}
          <div class="mb-bp-title">${escapeHtml(b.title)}</div>
          <div class="mb-bp-text">${escapeHtml(b.text)}</div>
        </div>`
      )
      .join('');

    const miniSections = (ov.sectionsPreview || [])
      .map(
        (s) => `
        <a class="mb-mini-card" href="#section-${s.id}">
          <div class="mb-mini-head">${svgIcon((SECTION_META[s.id] || {}).icon || 'list', 14)}<span>${escapeHtml(s.title)}</span></div>
          <div class="mb-mini-legend">${escapeHtml(s.legend || '')}</div>
        </a>`
      )
      .join('');

    container.innerHTML = `
      <header class="mb-card-head">
        <div class="mb-head-left">
          ${svgIcon('overview', 22)}
          <div>
            <h2>สรุปภาพรวม Action วันนี้</h2>
            <p class="mb-subtitle">${escapeHtml(ov.subtitle)}</p>
          </div>
        </div>
        ${dateBadge(date)}
      </header>

      ${bigPicture ? `<div class="mb-bp-grid">${bigPicture}</div>` : ''}
      ${miniSections ? `<div class="mb-mini-grid">${miniSections}</div>` : ''}

      <div class="mb-box-grid mb-box-grid-2">
        <div class="mb-box">
          <h3>${svgIcon('brain', 16)}สิ่งที่ Data กำลังบอก</h3>
          ${bulletList(ov.dataSignals, 'list')}
        </div>
        <div class="mb-box">
          <h3>${svgIcon('bolt', 16)}Action วันนี้ (ภาพรวม)</h3>
          ${actionList(ov.actionToday)}
        </div>
      </div>

      ${ov.insight ? `<div class="mb-insight-bar">${highlightInsight(ov.insight)}</div>` : ''}
    `;
    enhanceCard(container);
  }

  // ---- Section card (ใช้ config เดียวกันทั้ง 6 sections) ----
  function renderSection(container, sec, date) {
    if (!container) return;
    sec = sec || {};
    const meta = SECTION_META[sec.id] || {};
    container.style.setProperty('--sec-accent', meta.accent || 'var(--mb-accent-gold)');

    container.innerHTML = `
      <header class="mb-card-head">
        <div class="mb-head-left">
          <span class="mb-sec-num" style="--sec-accent:${meta.accent || 'var(--mb-accent-gold)'}">${sec.id}</span>
          ${svgIcon(meta.icon || 'list', 20)}
          <div>
            <h2>${escapeHtml(sec.title)}</h2>
            <p class="mb-subtitle">${escapeHtml(sec.subtitle)}</p>
          </div>
        </div>
        ${dateBadge(date)}
      </header>

      ${imageBlock(sec.images)}
      ${statsRow(sec.stats)}
      ${historyTable(sec.history, sec.historyColumns)}

      <div class="mb-box-grid mb-box-grid-3">
        <div class="mb-box">
          <h3>${svgIcon('list', 16)}สรุปสั้น</h3>
          ${bulletList(sec.summary, 'list')}
        </div>
        <div class="mb-box">
          <h3>${svgIcon('brain', 16)}แปลความ</h3>
          <p class="mb-interp">${escapeHtml(sec.interpretation)}</p>
        </div>
        <div class="mb-box">
          <h3>${svgIcon('bolt', 16)}Action วันนี้</h3>
          ${actionList(sec.actionToday)}
        </div>
      </div>

      ${sec.insight ? `<div class="mb-insight-bar">${highlightInsight(sec.insight)}</div>` : ''}
    `;
    enhanceCard(container);
  }

  // ================= ปฏิสัมพันธ์: reveal ตอน scroll + ตัวเลขนับขึ้น + lightbox ภาพ =================
  // ทำงานอัตโนมัติทุกครั้งที่ renderOverview/renderSection ถูกเรียก ไม่ต้อง wiring
  // เพิ่มในฝั่ง client/ หรือ internal/ เลย (ใช้ร่วมกันเพราะอยู่ใน shared/)
  const prefersReducedMotion = () =>
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function enhanceCard(container) {
    if (!container) return;
    if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
      container.classList.add('mb-revealed');
      animateStats(container);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('mb-revealed');
          animateStats(entry.target);
          io.unobserve(entry.target);
        });
      },
      { threshold: 0.08, rootMargin: '0px 0px -6% 0px' }
    );
    io.observe(container);
  }

  // นับตัวเลขขึ้นจาก 0 ถึงค่าจริงตอนการ์ดเลื่อนเข้ามาในจอ — หา "ตัวเลขตัวแรก" ในสตริง
  // แล้วแอนิเมตเฉพาะส่วนนั้น ส่วนที่เหลือ (เช่น หน่วย/เปอร์เซ็นต์ในวงเล็บ) คงเดิมเสมอ
  // จบด้วยการเซ็ตกลับเป็นค่าดั้งเดิม (data-final) แบบ exact เพื่อกันความคลาดเคลื่อนจากการปัดเศษ
  function animateStats(container) {
    if (prefersReducedMotion()) return;
    const nodes = container.querySelectorAll('.mb-stat-value[data-final]');
    nodes.forEach((node) => {
      const final = node.dataset.final;
      const m = /-?[\d,]+\.?\d*/.exec(final);
      if (!m) return;
      const numStr = m[0];
      const target = parseFloat(numStr.replace(/,/g, ''));
      if (!isFinite(target)) return;
      const hasComma = numStr.includes(',');
      const decimals = (numStr.split('.')[1] || '').length;
      const prefix = final.slice(0, m.index);
      const suffix = final.slice(m.index + numStr.length);
      const duration = 900;
      const t0 = performance.now();
      function frame(t) {
        const p = Math.min(1, (t - t0) / duration);
        const eased = 1 - Math.pow(1 - p, 3);
        const val = target * eased;
        const formatted = hasComma
          ? val.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
          : val.toFixed(decimals);
        node.textContent = prefix + formatted + suffix;
        if (p < 1) requestAnimationFrame(frame);
        else node.textContent = final;
      }
      requestAnimationFrame(frame);
    });
  }

  // lightbox ดูภาพกราฟขยาย — ผูก event ครั้งเดียวด้วย delegation กันการ bind ซ้ำทุกครั้งที่ re-render
  let lightboxReady = false;
  function ensureLightbox() {
    if (lightboxReady || typeof document === 'undefined') return;
    lightboxReady = true;
    const overlay = document.createElement('div');
    overlay.className = 'mb-lightbox';
    overlay.innerHTML = '<button class="mb-lightbox-close" type="button" aria-label="ปิดภาพขยาย">✕</button><img alt="">';
    document.body.appendChild(overlay);
    const imgEl = overlay.querySelector('img');
    const close = () => overlay.classList.remove('is-open');
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.closest('.mb-lightbox-close')) close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });
    document.addEventListener('click', (e) => {
      const img = e.target.closest('.mb-img-fig img');
      if (!img) return;
      imgEl.src = img.currentSrc || img.src;
      imgEl.alt = img.alt || '';
      overlay.classList.add('is-open');
    });
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', ensureLightbox);
    } else {
      ensureLightbox();
    }
  }

  global.MB = {
    SECTION_META,
    svgIcon,
    escapeHtml,
    formatThaiDate,
    renderOverview,
    renderSection,
  };
})(window);
