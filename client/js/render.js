/* ============================================================
   client/js/render.js — หน้า Morning Brief ฝั่งลูกค้า
   ------------------------------------------------------------
   อ่านเฉพาะไฟล์ที่ publish แล้วใน data/ — ไม่รู้จักฟอร์ม/draft ของ
   IC console เลย (แยกโซนสมบูรณ์) โครงสร้าง section ทั้งหมดมาจาก
   JSON ที่โหลด ไม่ hardcode รายชื่อ section ไว้ในไฟล์นี้ เพื่อให้
   เพิ่ม/ลด section ได้จากฝั่ง IC โดยไม่ต้องแก้โค้ดนี้
   ============================================================ */
(function () {
  'use strict';

  const THEME_KEY = 'mb-client-theme';
  const SIDEBAR_KEY = 'mb-client-sidebar-collapsed';

  // ---- theme toggle ----
  function initTheme() {
    const toggle = document.getElementById('theme-toggle');
    function apply(theme) {
      document.documentElement.dataset.mbTheme = theme;
      toggle.setAttribute('aria-checked', theme === 'light' ? 'true' : 'false');
    }
    apply(localStorage.getItem(THEME_KEY) || 'dark');
    toggle.addEventListener('click', () => {
      const next = document.documentElement.dataset.mbTheme === 'dark' ? 'light' : 'dark';
      apply(next);
      localStorage.setItem(THEME_KEY, next);
    });
  }

  // ---- sidebar collapse (desktop) + hamburger (mobile) ----
  function initSidebar() {
    const sidebar = document.getElementById('mb-sidebar');
    const collapsed = localStorage.getItem(SIDEBAR_KEY) === '1';
    document.body.classList.toggle('mb-sidebar-collapsed', collapsed);

    document.getElementById('btn-collapse').addEventListener('click', () => {
      const isCollapsed = document.body.classList.toggle('mb-sidebar-collapsed');
      localStorage.setItem(SIDEBAR_KEY, isCollapsed ? '1' : '0');
    });

    const overlay = document.getElementById('sidebar-overlay');
    function openMobile() {
      document.body.classList.add('mb-sidebar-open-mobile');
    }
    function closeMobile() {
      document.body.classList.remove('mb-sidebar-open-mobile');
    }
    document.getElementById('btn-hamburger').addEventListener('click', openMobile);
    overlay.addEventListener('click', closeMobile);
    sidebar.querySelectorAll('.mb-nav-link').forEach((a) => a.addEventListener('click', closeMobile));
  }

  // ---- active section highlight ตาม scroll ----
  function initScrollSpy() {
    const links = [...document.querySelectorAll('.mb-nav-link')];
    if (!links.length) return;
    const targets = links.map((a) => document.getElementById(a.dataset.target)).filter(Boolean);
    if (!targets.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          links.forEach((a) => a.classList.toggle('active', a.dataset.target === entry.target.id));
        });
      },
      { rootMargin: '-20% 0px -70% 0px' }
    );
    targets.forEach((t) => observer.observe(t));
  }

  function buildNavLink(id, title, iconType) {
    const a = document.createElement('a');
    a.className = 'mb-nav-link';
    a.href = `#${id}`;
    a.dataset.target = id;
    a.innerHTML = `${window.MB.svgIcon(iconType || 'list', 16)}<span>${window.MB.escapeHtml(title)}</span>`;
    return a;
  }

  async function loadDayData(date) {
    const res = await fetch(`data/${date}.json`, { cache: 'no-store' });
    if (!res.ok) throw new Error('โหลดข้อมูลวันที่ ' + date + ' ไม่สำเร็จ');
    return res.json();
  }

  async function loadIndex() {
    try {
      const res = await fetch('data/index.json', { cache: 'no-store' });
      if (!res.ok) return { dates: [] };
      return res.json();
    } catch (e) {
      return { dates: [] };
    }
  }

  function renderDatePicker(dates, current, onChange) {
    const sel = document.getElementById('date-picker');
    sel.innerHTML = dates
      .map((d) => `<option value="${d}"${d === current ? ' selected' : ''}>${window.MB.formatThaiDate(d)}</option>`)
      .join('');
    sel.addEventListener('change', (e) => onChange(e.target.value));
  }

  async function renderDay(date) {
    const content = document.getElementById('mb-content');
    const navSections = document.getElementById('nav-sections');
    content.innerHTML = '';
    navSections.querySelectorAll('.mb-nav-link').forEach((a) => a.remove());

    let data;
    try {
      data = await loadDayData(date);
    } catch (e) {
      document.getElementById('mb-empty-state').hidden = false;
      document.getElementById('mb-empty-state').textContent = 'โหลดข้อมูลวันที่ ' + date + ' ไม่สำเร็จ';
      return;
    }
    document.getElementById('mb-empty-state').hidden = true;

    const ovContainer = document.createElement('section');
    ovContainer.className = 'mb-card mb-overview-card';
    ovContainer.id = 'section-overview';
    content.appendChild(ovContainer);
    window.MB.renderOverview(ovContainer, data.overview, data.date);

    // เส้นคั่นหัวทอง: ปิดท้ายบล็อกภาพรวมก่อนเข้ารายหัวข้อ
    const rule = document.createElement('hr');
    rule.className = 'mb-rule';
    content.appendChild(rule);

    const foot = document.getElementById('mb-sidebar-foot');
    document.getElementById('mb-published-label').textContent =
      'เผยแพร่แล้ว · ' + window.MB.formatThaiDate(data.date);
    foot.hidden = false;

    (data.sections || []).forEach((sec) => {
      const container = document.createElement('section');
      container.className = 'mb-card';
      container.id = `section-${sec.id}`;
      content.appendChild(container);
      window.MB.renderSection(container, sec, data.date);

      const meta = (window.MB.SECTION_META && window.MB.SECTION_META[sec.id]) || {};
      navSections.appendChild(buildNavLink(`section-${sec.id}`, sec.title, meta.icon));
    });

    initScrollSpy();
  }

  async function init() {
    initTheme();
    initSidebar();

    const idx = await loadIndex();
    const dates = (idx.dates || []).slice().sort().reverse();
    if (!dates.length) {
      document.getElementById('mb-empty-state').hidden = false;
      return;
    }
    const params = new URLSearchParams(location.search);
    const requested = params.get('date');
    const current = dates.includes(requested) ? requested : dates[0];

    renderDatePicker(dates, current, (d) => {
      history.replaceState(null, '', `?date=${d}`);
      renderDay(d);
    });
    await renderDay(current);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
