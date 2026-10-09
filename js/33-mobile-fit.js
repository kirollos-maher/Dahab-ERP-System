/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ERP — js/33-mobile-fit.js  (v1.0)
   يعمل على layout الموبايل فقط (data-layout="mobile"):
   1) قائمة "المزيد" في الشريط العلوي (مزامنة / ذاكرة مؤقتة / اللغة / الدور)
   2) تحويل الجداول (.tbl) لبطاقات: يضيف data-label لكل خلية من عنوان العمود
   3) توسيط التبويب النشط في شريط التبويبات
   لإبقاء جدول كجدول عادي: أضف عليه class="tbl-keep"
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var root = document.documentElement;

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  ready(function () {
    // style.css §56 بيستخدم data-device-touch بينما الـ detection بيكتب data-touch
    try {
      var touch = (window.GMS && window.GMS.DeviceTouch) ||
                  ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
      root.setAttribute('data-device-touch', touch ? 'yes' : 'no');
    } catch (e) { /* ignore */ }

    if (root.getAttribute('data-layout') !== 'mobile') return;

    try { buildMoreMenu(); } catch (e) { console.warn('[mobile-fit] more menu:', e); }
    try { initCardTables(); } catch (e) { console.warn('[mobile-fit] tables:', e); }
    try { initTabCentering(); } catch (e) { console.warn('[mobile-fit] tabs:', e); }
  });

  /* ───────────────────────── 1) قائمة المزيد ───────────────────────── */
  function buildMoreMenu() {
    var bar = document.querySelector('.topbar');
    if (!bar || document.getElementById('more-btn')) return;

    var isEn = root.getAttribute('lang') === 'en';
    var label = isEn ? 'More' : 'المزيد';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'more-btn';
    btn.className = 'icon-btn';
    btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
      '<circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>';

    var theme = document.getElementById('theme-btn');
    var logout = document.getElementById('logout-btn');
    bar.insertBefore(btn, theme || logout || null);

    var panel = document.createElement('div');
    panel.id = 'topbar-more';
    // ننقل نفس العناصر (مش نسخ) عشان الـ event handlers المرتبطة بالـ id تفضل شغالة
    ['topbar-role', 'lang-switch', 'sync-btn', 'cache-btn'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) panel.appendChild(el);
    });
    document.body.appendChild(panel);

    function setOpen(open) {
      panel.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      setOpen(!panel.classList.contains('open'));
    });

    document.addEventListener('click', function (e) {
      if (!panel.classList.contains('open')) return;
      if (panel.contains(e.target) || btn.contains(e.target)) return;
      setOpen(false);
    });

    panel.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('.icon-btn, .lang-btn')) {
        setTimeout(function () { setOpen(false); }, 150);
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setOpen(false);
    });
  }

  /* ───────────────────────── 2) الجداول → بطاقات ───────────────────────── */
  function txt(el) {
    return (el.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function isChk(td) {
    return !!td.querySelector('input[type="checkbox"], input.cb') && !txt(td);
  }

  function isAct(td) {
    return !!td.querySelector('.row-actions, .row-act, .icon-action, .btn');
  }

  function headerLabels(tbl) {
    var thead = tbl.tHead;
    if (!thead || !thead.rows.length) return null;
    var row = thead.rows[thead.rows.length - 1];
    var labels = [];
    for (var i = 0; i < row.cells.length; i++) {
      var c = row.cells[i];
      var span = c.colSpan || 1;
      var t = c.querySelector('input[type="checkbox"]') ? '' : txt(c);
      for (var k = 0; k < span; k++) labels.push(k === 0 ? t : '');
    }
    return labels;
  }

  function labelTable(tbl) {
    if (tbl.classList.contains('tbl-keep')) return;
    var labels = headerLabels(tbl);
    if (!labels || !labels.length) return;

    var rows = tbl.querySelectorAll('tbody > tr, tfoot > tr');
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];
      var cells = row.cells;
      var n = cells.length;
      if (!n) continue;

      // الصف اتعمله label قبل كده
      if (cells[0].hasAttribute('data-label') && cells[n - 1].hasAttribute('data-label')) continue;

      // صف "لا توجد بيانات"
      if (n === 1 && labels.length > 1) {
        row.classList.add('m-empty');
        cells[0].setAttribute('data-label', '');
        cells[0].classList.add('m-full');
        continue;
      }

      var col = 0, mainDone = false, hasChk = false;
      for (var c = 0; c < n; c++) {
        var td = cells[c];
        var span = td.colSpan || 1;
        var label = span === 1 ? (labels[col] || '') : '';
        col += span;
        td.setAttribute('data-label', label);

        if (isChk(td)) { td.classList.add('m-chk'); hasChk = true; continue; }
        if (isAct(td)) { td.classList.add('m-act'); continue; }
        if (!txt(td) && !td.children.length) { td.classList.add('m-blank'); continue; }
        if (!mainDone) { td.classList.add('m-main'); mainDone = true; continue; }
        if (!label) td.classList.add('m-full');
      }
      if (hasChk) row.classList.add('m-has-chk');
    }

    tbl.classList.add('m-cards');
    var p = tbl.parentElement;
    if (p && (p.classList.contains('table-wrap') || p.classList.contains('table-scroll'))) {
      p.classList.add('m-cards-wrap');
    }
  }

  function scanTables() {
    var tables = document.querySelectorAll('table.tbl');
    for (var i = 0; i < tables.length; i++) labelTable(tables[i]);
  }

  function relevant(rec) {
    var t = rec.target;
    var el = t && t.nodeType === 1 ? t : (t && t.parentElement);
    if (el && (el.tagName === 'TABLE' || (el.closest && el.closest('table')))) return true;
    var added = rec.addedNodes;
    for (var i = 0; i < added.length; i++) {
      var n = added[i];
      if (n.nodeType !== 1) continue;
      if (n.tagName === 'TABLE') return true;
      if (n.querySelector && n.querySelector('table.tbl')) return true;
    }
    return false;
  }

  function initCardTables() {
    scanTables();
    var obs = new MutationObserver(function (recs) {
      for (var i = 0; i < recs.length; i++) {
        if (relevant(recs[i])) { scanTables(); return; }
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  /* ───────────────────────── 3) توسيط التبويب النشط ───────────────────────── */
  function initTabCentering() {
    var bar = document.getElementById('tabs-bar');
    if (!bar) return;

    function center(tab) {
      if (!tab) return;
      var b = bar.getBoundingClientRect();
      var t = tab.getBoundingClientRect();
      bar.scrollLeft += (t.left + t.width / 2) - (b.left + b.width / 2);
    }

    bar.addEventListener('click', function (e) {
      var tab = e.target.closest && e.target.closest('.tab');
      if (tab) setTimeout(function () { center(tab); }, 30);
    });

    setTimeout(function () { center(bar.querySelector('.tab.active')); }, 800);
  }
})();