/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ENTERPRISE — js/32-base-karat-ui.js
   Base Karat UI — v4.1 (FINAL — User-Typing Safe)
   ─────────────────────────────────────────────────────────────────────
   ✅ v4.1 التحديثات:
     • FIX: تجاهل عملية التحويل أثناء الكتابة في الحقول
     • FIX: isUserTyping() + hasRecentInteraction() guards
     • FIX: MutationObserver يتجاهل التغييرات أثناء الكتابة
     • FIX: Auto-refresh (10s) يحترم حالة الكتابة
     • FIX: convertNumbers يستثني input/textarea/select
     • FIX: cleanTextNodes يتجاهل [data-no-karat-ui]
   ✅ v4.0 المزايا الأساسية:
     • Direct Number Conversion — KPI values
     • Clean Text — إزالة "بندق" واستبدال 24K/21K
     • Charts label cleaning
     • Router hooks + BaseKarat event listener
     • Cross-tab synchronization
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const GMS = window.GMS = window.GMS || {};

  /* ═════════════════════════════════════════════════════════════════════
     §1 · STATE
     ═════════════════════════════════════════════════════════════════════ */
  const State = {
    installed: false,
    _timer: null,
    _interval: null,
    _observer: null,
    _stats: {
      runs: 0,
      converted: 0,
      cleaned: 0,
      skipped: 0,
      lastRun: null,
    },
  };

  /* الصفحات المُستثناة من التحويل */
  const SKIP_ROUTES = ['settings', 'audit'];

  /* ═════════════════════════════════════════════════════════════════════
     §2 · HELPERS — Route & Karat
     ═════════════════════════════════════════════════════════════════════ */

  function isSkipRoute() {
    try {
      const r = GMS.Router?.currentId?.();
      return r ? SKIP_ROUTES.includes(r) : false;
    } catch (_) { return false; }
  }

  function getKarat() {
    try { return GMS.BaseKarat?.current || 24; } catch (_) { return 24; }
  }

  function getLabel() {
    try { return GMS.BaseKarat?.labelShort || '24K'; } catch (_) { return '24K'; }
  }

  /**
   * تحويل من بندق 24K إلى العيار النشط
   */
  function convert(w) {
    const v = parseFloat(w);
    if (!isFinite(v) || v === 0) return 0;
    try {
      if (GMS.BaseKarat?.fromPure) {
        return GMS.BaseKarat.fromPure(v, getKarat());
      }
      return v * (24 / getKarat());
    } catch (_) { return v; }
  }

  /**
   * استخراج رقم من نص (يدعم الفواصل)
   */
  function parseNum(t) {
    if (!t) return 0;
    const n = parseFloat(String(t).replace(/,/g, '').replace(/[^\d.\-]/g, ''));
    return isFinite(n) ? n : 0;
  }

  /**
   * تنسيق رقم بنفس قالب النص الأصلي
   */
  function fmt(v, template) {
    const n = Number(v);
    if (!isFinite(n)) return String(template);
    const hasComma = /,/.test(template);
    const m = String(template).match(/\.(\d+)/);
    const dec = m ? m[1].length : 0;
    let s = n.toFixed(dec);
    if (hasComma) {
      const p = s.split('.');
      p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      s = p.join('.');
    }
    return s;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §3 · ✅ v4.1: USER TYPING GUARDS
     ─────────────────────────────────────────────────────────────────────
     Guards لمنع الخروج من الحقول أثناء الكتابة:
       • isUserTyping()         → هل المستخدم يكتب في input حالياً؟
       • hasRecentInteraction() → هل تفاعل خلال آخر 5 ثواني؟
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * هل المستخدم يكتب في حقل حالياً؟
   * @returns {boolean}
   */
  function isUserTyping() {
    try {
      const active = document.activeElement;
      if (!active) return false;

      const tag = active.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        return true;
      }
      if (active.isContentEditable) return true;

      return false;
    } catch (_) {
      return false;
    }
  }

  /**
   * هل كان فيه تفاعل حديث (آخر 5 ثواني)؟
   * @returns {boolean}
   */
  function hasRecentInteraction() {
    try {
      const lastInteraction = window.GMS?._lastInteraction || 0;
      const lastFormInteraction = window.GMS?._lastFormInteraction || 0;
      const latest = Math.max(lastInteraction, lastFormInteraction);
      if (!latest) return false;
      return (Date.now() - latest) < 5000;
    } catch (_) {
      return false;
    }
  }

  /**
   * هل Modal مفتوح حالياً؟ (لو أيوه، نتجاهل كل شيء)
   * @returns {boolean}
   */
  function isModalOpen() {
    try {
      const modalRoot = document.getElementById('modal-root');
      if (!modalRoot) return false;
      return modalRoot.querySelectorAll('.overlay').length > 0;
    } catch (_) {
      return false;
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §4 · CLEAN TEXT — إزالة "بندق" + استبدال 24K/21K
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * تنظيف نص من كلمة "بندق" واستبدال عيارات 18K/21K/24K بالعيار النشط
   * @param {string} text
   * @returns {string}
   */
  function cleanText(text) {
    if (!text) return text;
    const t = String(text).trim();
    if (t.length < 2) return text;
    if (!/[\u0600-\u06FFa-zA-Z]/.test(t)) return text;

    const baseLabel = getLabel();
    let out = String(text);

    /* إزالة "بندق" و"بندقي" */
    out = out.replace(/\(\s*بندق[ي]?\s+(18K|21K|24K)\s*\)/g, (m, k) =>
      k === baseLabel ? `(${k})` : `(${baseLabel})`);
    out = out.replace(/\(\s*بندق[ي]?\s+(\d{2,3})\s*\)/g, () => `(${baseLabel})`);
    out = out.replace(/بندق[ي]?\s+(18K|21K|24K)/g, (m, k) =>
      k === baseLabel ? k : baseLabel);
    out = out.replace(/بندق[ي]?\s+(\d{2,3})\b/g, () => baseLabel);
    out = out.replace(/البندق[ي]?\s+(18K|21K|24K)/g, (m, k) =>
      `العيار ${k === baseLabel ? k : baseLabel}`);
    out = out.replace(/بندق[ي]?\s+جملة\s+مُباع/gi, 'ذهب جملة مُباع');
    out = out.replace(/بندق[ي]?\s+جملة/gi, 'ذهب جملة');
    out = out.replace(/جم\s+بندق[ي]?\s+(18K|21K|24K)/g, (m, k) =>
      `جم ${k === baseLabel ? k : baseLabel}`);
    out = out.replace(/جم\s+بندق[ي]?/gi, 'جم');
    out = out.replace(/البندق[ي]?\s+المُفلتر/gi, 'العيار المُفلتر');
    out = out.replace(/البندق[ي]?\s+الفلتر/gi, 'العيار المفلتر');
    out = out.replace(/البندق[ي]?\b/g, 'العيار');
    out = out.replace(/\s+بندق[ي]?\s+/g, ' ');
    out = out.replace(/^بندق[ي]?\s+/g, '');
    out = out.replace(/\s+بندق[ي]?$/g, '');

    /* استبدال العيارات — 24K و21K و18K → baseLabel */
    out = out.replace(/\(\s*(24K|21K|18K)\s*\)/g, (m, k) =>
      k === baseLabel ? m : `(${baseLabel})`);
    out = out.replace(/\b(24K|21K|18K)\b/g, (m, k) =>
      k === baseLabel ? m : baseLabel);

    /* تنظيف */
    out = out.replace(/\(\s*\)/g, '');
    out = out.replace(/\s{2,}/g, ' ');
    out = out.replace(/\s+\(/g, ' (');
    out = out.replace(/\)\s+/g, ') ');
    out = out.replace(/\(\s+/g, '(');
    out = out.replace(/\s+\)/g, ')');
    out = out.replace(/(18K|21K|24K)\s*\(\s*\1\s*\)/g, '$1');

    return out.trim();
  }

  /* ═════════════════════════════════════════════════════════════════════
     §5 · CONVERT NUMBERS — ✅ v4.1 مع الحمايات
     ─────────────────────────────────────────────────────────────────────
     يستهدف كل KPI value في كل الصفحات بشكل مباشر
     ✅ يستثني input/textarea/select لمنع الخروج من الحقول
     ═════════════════════════════════════════════════════════════════════ */

  function convertNumbers(root) {
    if (!root) return 0;
    let converted = 0;

    root.querySelectorAll('.kpi-value').forEach(el => {
      try {
        /* ✅ تجاهل حقول الإدخال وأي عنصر تفاعلي */
        const tag = el.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

        /* ✅ تجاهل لو أحد الآباء تفاعلي */
        if (el.closest('input, textarea, select, form, [contenteditable="true"]')) return;

        /* تجاهل بطاقة Base Karat UI */
        if (el.closest('#set-base-karat-card')) return;

        /* تجاهل العناصر المُستثناة */
        if (el.closest('[data-no-karat-ui]')) return;

        const kpi = el.closest('.kpi');
        const labelText = kpi?.querySelector('.kpi-label')?.textContent?.trim() || '';
        const valueText = el.textContent?.trim() || '';

        if (!valueText) return;

        /* استثناءات ذكية */
        if (/عدد|فواتير|نتائج|نتيجة/i.test(labelText)) return;      /* أعداد صحيحة */
        if (/%|نسبة|نقاء/i.test(labelText)) return;                  /* نسب */
        if (/عمر|يوم|شهر|سنة/i.test(labelText)) return;              /* فترات زمنية */
        if (/ج\.م|جنيه|سعر|قيمة نقدية|EGP/i.test(labelText) &&
            /ج\.م|جنيه/.test(valueText)) return;                     /* أسعار نقدية */

        /* نستخرج الرقم */
        const current = parseNum(valueText);
        if (current === 0) return;

        /* القيمة الأصلية — أو نخزّن الحالية */
        let original = parseFloat(el.dataset.karatOriginal);
        if (!isFinite(original)) {
          original = current;
          el.dataset.karatOriginal = String(original);
        }

        /* نحول من الأصلية */
        const result = convert(original);

        /* نحافظ على <small> */
        const innerHTML = el.innerHTML;
        const m = innerHTML.match(/<small[^>]*>[\s\S]*?<\/small>/i);
        const smallHTML = m ? m[0] : '';

        const formatted = fmt(result, valueText);
        const newHTML = formatted + (smallHTML ? ' ' + smallHTML : '');

        if (el.innerHTML !== newHTML) {
          el.innerHTML = newHTML;
          converted++;
          console.log(`   ✅ ${labelText}: ${valueText} → ${newHTML}`);
        }
      } catch (_) {}
    });

    return converted;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §6 · CLEAN TEXT NODES — ✅ v4.1 مع الاستثناءات
     ═════════════════════════════════════════════════════════════════════ */

  function cleanTextNodes(root) {
    if (!root) return 0;

    let count = 0;
    const updates = [];

    try {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => {
          if (!node.nodeValue?.trim()) return NodeFilter.FILTER_REJECT;
          const p = node.parentNode;
          if (!p) return NodeFilter.FILTER_REJECT;
          const tag = p.tagName;

          /* تجاهل script/style/noscript */
          if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') {
            return NodeFilter.FILTER_REJECT;
          }

          /* ✅ تجاهل بطاقة Base Karat UI */
          if (p.closest?.('#set-base-karat-card')) return NodeFilter.FILTER_REJECT;

          /* ✅ تجاهل العناصر المُستثناة */
          if (p.closest?.('[data-no-karat-ui]')) return NodeFilter.FILTER_REJECT;

          /* ✅ تجاهل الحقول التفاعلية */
          if (p.closest?.('button, input, select, textarea, a, [contenteditable="true"]')) {
            return NodeFilter.FILTER_REJECT;
          }

          return NodeFilter.FILTER_ACCEPT;
        },
      });

      let node;
      while ((node = walker.nextNode())) {
        const orig = node.nodeValue;
        const next = cleanText(orig);
        if (next !== orig) updates.push({ node, next });
      }

      updates.forEach(({ node, next }) => {
        node.nodeValue = next;
        count++;
      });
    } catch (_) {}

    return count;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §7 · CHARTS — تحديث labels المخططات
     ═════════════════════════════════════════════════════════════════════ */

  function updateCharts() {
    try {
      const charts = GMS.Views?.dashboard?.state?.charts;
      if (!charts) return 0;
      let c = 0;

      Object.values(charts).forEach(chart => {
        if (!chart?.data?.datasets) return;
        let changed = false;

        chart.data.datasets.forEach(ds => {
          if (ds.label) {
            const clean = cleanText(ds.label);
            if (clean !== ds.label) {
              ds.label = clean;
              changed = true;
            }
          }
        });

        if (changed) {
          try { chart.update('none'); } catch (_) {}
          c++;
        }
      });

      return c;
    } catch (_) { return 0; }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §8 · MAIN — processPage
     ─────────────────────────────────────────────────────────────────────
     ✅ v4.1: يحترم حالة الكتابة + Modal مفتوح + التفاعل الحديث
     ═════════════════════════════════════════════════════════════════════ */

  function processPage(opts = {}) {
    const { silent = false } = opts;

    /* ✅ فحص المسار */
    if (isSkipRoute()) {
      return { skipped: true, reason: 'skip-route' };
    }

    /* ✅ فحص الكتابة الحالية */
    if (isUserTyping()) {
      State._stats.skipped++;
      if (!silent) {
        console.log('[BaseKaratUI] ⛔ Skipped — user is typing');
      }
      return { skipped: true, reason: 'user-typing' };
    }

    /* ✅ فحص التفاعل الحديث */
    if (hasRecentInteraction()) {
      State._stats.skipped++;
      if (!silent) {
        console.log('[BaseKaratUI] ⛔ Skipped — recent interaction');
      }
      return { skipped: true, reason: 'recent-interaction' };
    }

    /* ✅ فحص Modal مفتوح */
    if (isModalOpen()) {
      State._stats.skipped++;
      if (!silent) {
        console.log('[BaseKaratUI] ⛔ Skipped — modal is open');
      }
      return { skipped: true, reason: 'modal-open' };
    }

    const page = document.getElementById('page');
    if (!page) return { skipped: true, reason: 'no-page' };

    State._stats.runs++;
    const t0 = performance.now();

    const nums = convertNumbers(page);
    const texts = cleanTextNodes(page);
    const charts = updateCharts();

    State._stats.converted += nums;
    State._stats.cleaned += texts;
    State._stats.lastRun = new Date().toISOString();

    const total = nums + texts + charts;
    const ms = Math.round((performance.now() - t0) * 100) / 100;

    if (!silent) {
      console.log(
        `%c🏷️ BaseKaratUI v4.1 [#${State._stats.runs}]: ${nums} numbers, ${texts} texts, ${charts} charts (${ms}ms) → ${getLabel()}`,
        'color:#0f7a43;font-weight:800;font-size:12px;'
      );
    }

    return { success: true, numbers: nums, texts, charts, ms };
  }

  /**
   * جدولة تشغيل processPage مع debounce
   * @param {number} delay
   */
  function schedule(delay = 250) {
    if (State._timer) clearTimeout(State._timer);
    State._timer = setTimeout(() => {
      State._timer = null;
      processPage();
    }, delay);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §9 · HOOKS
     ═════════════════════════════════════════════════════════════════════ */

  /* ─── Router hook ─── */
  function hookRouter() {
    if (!GMS.Router) {
      setTimeout(hookRouter, 500);
      return;
    }
    if (GMS.Router._bkUIV41) return;
    GMS.Router._bkUIV41 = true;

    try {
      GMS.Router.on('afterNavigate', (data) => {
        const route = data?.to || GMS.Router.currentId?.();
        if (SKIP_ROUTES.includes(route)) return;

        setTimeout(() => processPage(), 100);
        setTimeout(() => processPage(), 500);
        setTimeout(() => processPage(), 1500);
      });

      console.log('[BaseKaratUI] ✅ Router hook installed');
    } catch (e) {
      console.warn('[BaseKaratUI] Router hook failed:', e);
    }
  }

  /* ─── BaseKarat hook ─── */
  function hookBaseKarat() {
    if (!GMS.BaseKarat?.on) {
      setTimeout(hookBaseKarat, 500);
      return;
    }

    try {
      GMS.BaseKarat.on(() => {
        if (isSkipRoute()) return;

        setTimeout(() => processPage(), 50);
        setTimeout(() => processPage(), 400);
      });

      console.log('[BaseKaratUI] ✅ BaseKarat hook installed');
    } catch (e) {
      console.warn('[BaseKaratUI] BaseKarat hook failed:', e);
    }
  }

  /* ─── MutationObserver — ✅ v4.1 مع Guards ─── */
  function startObserver() {
    const target = document.getElementById('page') || document.body;
    if (!target) {
      setTimeout(startObserver, 500);
      return;
    }

    State._observer = new MutationObserver((mutations) => {
      if (isSkipRoute()) return;

      /* ✅ تجاهل لو المستخدم بيكتب */
      if (isUserTyping()) return;

      /* ✅ تجاهل لو فيه تفاعل حديث */
      if (hasRecentInteraction()) return;

      /* ✅ تجاهل لو Modal مفتوح */
      if (isModalOpen()) return;

      let hasNew = false;
      for (const m of mutations) {
        if (m.type === 'childList' && m.addedNodes.length) {
          for (const n of m.addedNodes) {
            if (n.nodeType === 1 &&
                (n.classList?.contains('kpi') || n.querySelector?.('.kpi'))) {
              hasNew = true;
              break;
            }
          }
        }
        if (hasNew) break;
      }

      if (hasNew) schedule(300);
    });

    State._observer.observe(target, {
      childList: true,
      subtree: true,
    });

    console.log('[BaseKaratUI] ✅ MutationObserver installed');
  }

  /* ═════════════════════════════════════════════════════════════════════
     §10 · INIT
     ═════════════════════════════════════════════════════════════════════ */

  function init() {
    if (State.installed) return;

    console.log(
      '%c🏷️ BaseKarat UI v4.1 initializing…',
      'color:#a55a00;font-weight:800;font-size:13px;'
    );

    hookRouter();
    hookBaseKarat();
    startObserver();

    /* ✅ عمليات أولية بعد التحميل */
    setTimeout(() => processPage(), 300);
    setTimeout(() => processPage(), 1000);
    setTimeout(() => processPage(), 2000);
    setTimeout(() => processPage(), 4000);

    /* ✅ v4.1: Auto-refresh كل 10 ثواني — مع احترام Guards */
    State._interval = setInterval(() => {
      if (document.hidden) return;
      if (isSkipRoute()) return;

      /* ✅ تجاهل لو المستخدم بيكتب */
      if (isUserTyping()) return;

      /* ✅ تجاهل لو فيه تفاعل حديث */
      if (hasRecentInteraction()) return;

      /* ✅ تجاهل لو Modal مفتوح */
      if (isModalOpen()) return;

      processPage({ silent: true });
    }, 10000);

    State.installed = true;

    console.log(
      `%c✅ BaseKarat UI v4.1 ready → ${getLabel()}`,
      'color:#0f7a43;font-weight:800;font-size:13px;'
    );
  }

  function destroy() {
    if (State._observer) State._observer.disconnect();
    if (State._timer) clearTimeout(State._timer);
    if (State._interval) clearInterval(State._interval);
    State.installed = false;

    console.log('[BaseKaratUI] 🛑 Destroyed');
  }

  /* ═════════════════════════════════════════════════════════════════════
     §11 · EXPORT
     ═════════════════════════════════════════════════════════════════════ */
  GMS.BaseKaratUI = {
    init,
    destroy,
    refresh: processPage,
    processPage,
    cleanText,
    isSkipRoute,

    /* ✅ v4.1: الحمايات الجديدة */
    isUserTyping,
    hasRecentInteraction,
    isModalOpen,

    /* تشخيص */
    diagnostics: () => ({
      installed: State.installed,
      route: GMS.Router?.currentId?.(),
      skip: isSkipRoute(),
      karat: getKarat(),
      label: getLabel(),
      isUserTyping: isUserTyping(),
      hasRecentInteraction: hasRecentInteraction(),
      isModalOpen: isModalOpen(),
      stats: { ...State._stats },
    }),

    SKIP_ROUTES,
    get state() { return State; },
  };

  window.BaseKaratUI = GMS.BaseKaratUI;

  /* ═════════════════════════════════════════════════════════════════════
     §12 · AUTO-INIT
     ═════════════════════════════════════════════════════════════════════ */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 300));
  } else {
    setTimeout(init, 300);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §13 · LOADED CONFIRMATION
     ═════════════════════════════════════════════════════════════════════ */
  console.log(
    '%c🏷️ BaseKarat UI v4.1 LOADED · User-Typing Safe',
    'color:#a55a00;font-weight:900;font-size:14px;padding:3px 8px;' +
    'background:linear-gradient(135deg,#f0d68c,#9c7726);border-radius:4px;'
  );

  console.log(
    '%c🛡️ Guards: isUserTyping() + hasRecentInteraction() + isModalOpen()',
    'color:#0f7a43;font-weight:700;font-size:11px;'
  );

  console.log(
    '%c⚡ Auto-refresh (10s) respects typing state · No more focus loss',
    'color:#1c4fd8;font-weight:700;font-size:11px;'
  );

  /* ═════════════════════════════════════════════════════════════════════
     ✅ js/32-base-karat-ui.js — نهاية الملف
     ═════════════════════════════════════════════════════════════════════ */

})();
