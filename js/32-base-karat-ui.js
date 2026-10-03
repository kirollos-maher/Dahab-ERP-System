/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ENTERPRISE — js/32-base-karat-ui.js
   Base Karat UI — v3.2 (Simple Direct Approach)
   ─────────────────────────────────────────────────────────────────────
   ✅ v3.2 الميزات:
     • يعالج كل .kpi-value بدون فلترة معقدة
     • يستخدم قائمة selectors صريحة للـ KPI
     • يعمل عند init + عند كل تنقل + كل 5 ثواني
     • لا يعتمد على Router hooks فقط
     • Console log واضح لكل عملية
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
    _stats: {
      runs: 0,
      numbersConverted: 0,
      textsCleaned: 0,
      lastRun: null,
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §2 · SKIP ROUTES
     ═════════════════════════════════════════════════════════════════════ */
  const SKIP_ROUTES = ['settings', 'audit'];

  function isSkipRoute() {
    try {
      const r = GMS.Router?.currentId?.();
      if (!r) return false;
      return SKIP_ROUTES.includes(r);
    } catch (_) {
      return false;
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §3 · HELPERS
     ═════════════════════════════════════════════════════════════════════ */
  function getKarat() {
    try { return GMS.BaseKarat?.current || 24; } catch (_) { return 24; }
  }

  function getLabel() {
    try { return GMS.BaseKarat?.labelShort || '24K'; } catch (_) { return '24K'; }
  }

  function convertWeight(w) {
    const v = parseFloat(w);
    if (!isFinite(v) || v === 0) return 0;
    try {
      if (GMS.BaseKarat?.fromPure) {
        return GMS.BaseKarat.fromPure(v, getKarat());
      }
      const k = getKarat();
      return v * (24 / k);
    } catch (_) {
      return v;
    }
  }

  function parseNumber(text) {
    if (!text) return 0;
    const cleaned = String(text).replace(/,/g, '').replace(/[^\d.\-]/g, '');
    const n = parseFloat(cleaned);
    return isFinite(n) ? n : 0;
  }

  function formatLike(value, template) {
    const v = Number(value);
    if (!isFinite(v)) return String(template);
    const hasComma = /,/.test(template);
    const match = String(template).match(/\.(\d+)/);
    const decimals = match ? match[1].length : 0;
    let s = v.toFixed(decimals);
    if (hasComma) {
      const parts = s.split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      s = parts.join('.');
    }
    return s;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §4 · CLEAN TEXT
     ═════════════════════════════════════════════════════════════════════ */
  function cleanText(text) {
    if (!text) return text;

    const t = String(text).trim();
    if (t.length < 2) return text;
    if (!/[\u0600-\u06FFa-zA-Z]/.test(t)) return text;

    const baseLabel = getLabel();
    let out = String(text);

    /* إزالة "بندق" و "بندقي" */
    out = out.replace(/\(\s*بندق[ي]?\s+(18K|21K|24K)\s*\)/g, (m, k) => {
      return k === baseLabel ? `(${k})` : `(${baseLabel})`;
    });

    out = out.replace(/\(\s*بندق[ي]?\s+(\d{2,3})\s*\)/g, () => `(${baseLabel})`);
    out = out.replace(/بندق[ي]?\s+(18K|21K|24K)/g, (m, k) => k === baseLabel ? k : baseLabel);
    out = out.replace(/بندق[ي]?\s+(\d{2,3})\b/g, () => baseLabel);
    out = out.replace(/البندق[ي]?\s+(18K|21K|24K)/g, (m, k) => `العيار ${k === baseLabel ? k : baseLabel}`);
    out = out.replace(/بندق[ي]?\s+جملة\s+مُباع/gi, 'ذهب جملة مُباع');
    out = out.replace(/بندق[ي]?\s+جملة/gi, 'ذهب جملة');
    out = out.replace(/جم\s+بندق[ي]?\s+(18K|21K|24K)/g, (m, k) => `جم ${k === baseLabel ? k : baseLabel}`);
    out = out.replace(/جم\s+بندق[ي]?/gi, 'جم');
    out = out.replace(/البندق[ي]?\s+المُفلتر/gi, 'العيار المُفلتر');
    out = out.replace(/البندق[ي]?\s+الفلتر/gi, 'العيار المفلتر');
    out = out.replace(/البندق[ي]?\b/g, 'العيار');
    out = out.replace(/\s+بندق[ي]?\s+/g, ' ');
    out = out.replace(/^بندق[ي]?\s+/g, '');
    out = out.replace(/\s+بندق[ي]?$/g, '');

    /* استبدال العيارات */
    out = out.replace(/\(\s*(24K|21K|18K)\s*\)/g, (m, k) => k === baseLabel ? m : `(${baseLabel})`);
    out = out.replace(/\b(24K|21K|18K)\b/g, (m, k) => k === baseLabel ? m : baseLabel);

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
     §5 · CONVERT ALL KPI VALUES — v3.2 (بدون فلترة)
     ═════════════════════════════════════════════════════════════════════
     يستهدف كل .kpi-value مباشرة ويحوّلها
     الاستثناءات الوحيدة:
       1. KPI داخل Settings
       2. KPI فيه "عدد" (فواتير/أصناف/قطع)
       3. KPI فيه "نسبة" أو "%"
       4. KPI فيه "ج.م" أو "جنيه" (أسعار نقدية)
     ═════════════════════════════════════════════════════════════════════ */
  function convertKPIValues(root) {
    if (!root) return 0;

    let converted = 0;

    root.querySelectorAll('.kpi').forEach(kpi => {
      try {
        /* استثناء settings */
        if (kpi.closest('#set-base-karat-card')) return;
        if (kpi.closest('[data-no-karat-ui]')) return;

        const labelEl = kpi.querySelector('.kpi-label');
        const valueEl = kpi.querySelector('.kpi-value');
        if (!labelEl || !valueEl) return;

        const labelText = (labelEl.textContent || '').trim();
        const valueText = (valueEl.textContent || '').trim();

        /* استثناءات المحتوى */
        if (/عدد|فواتير|أصناف|قطع|نسبة|%|ج\.م|جنيه|صافي|صافي الفترة|عمر/i.test(labelText)) {
          return;
        }

        /* استخراج القيمة */
        const numValue = parseNumber(valueText);
        if (numValue === 0) return;

        /* نتحقق إن كان الرقم معقول لـ ذهب (100-100000) */
        if (numValue < 0.1 || numValue > 1000000) return;

        /* القيمة الأصلية */
        let originalValue = parseFloat(valueEl.dataset.karatOriginal);

        /* لو ما تخزنتش، نخزّن القيمة الحالية كأصلية */
        if (!isFinite(originalValue)) {
          originalValue = numValue;
          valueEl.dataset.karatOriginal = String(originalValue);
        }

        /* نحوّل من الأصلية */
        const convertedValue = convertWeight(originalValue);

        /* نحافظ على <small> */
        const innerHTML = valueEl.innerHTML;
        const smallMatch = innerHTML.match(/<small[^>]*>[\s\S]*?<\/small>/i);
        const smallHTML = smallMatch ? smallMatch[0] : '';

        const formatted = formatLike(convertedValue, valueText);
        const newHTML = formatted + (smallHTML ? ' ' + smallHTML : '');

        if (valueEl.innerHTML !== newHTML) {
          valueEl.innerHTML = newHTML;
          converted++;

          console.log(`  ✅ "${labelText}": ${valueText} → ${newHTML}`);
        }
      } catch (_) {}
    });

    return converted;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §6 · CLEAN TEXT NODES
     ═════════════════════════════════════════════════════════════════════ */
  function cleanTextNodes(root) {
    if (!root) return 0;

    let cleaned = 0;

    try {
      const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node) => {
            if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
            const parent = node.parentNode;
            if (!parent) return NodeFilter.FILTER_REJECT;
            const tag = parent.tagName;
            if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') {
              return NodeFilter.FILTER_REJECT;
            }
            /* استثناء settings */
            if (parent.closest && parent.closest('#set-base-karat-card')) {
              return NodeFilter.FILTER_REJECT;
            }
            if (parent.closest && parent.closest('[data-no-karat-ui]')) {
              return NodeFilter.FILTER_REJECT;
            }
            /* استثناء buttons/inputs */
            if (parent.closest && parent.closest('button, input, select, textarea')) {
              return NodeFilter.FILTER_REJECT;
            }
            return NodeFilter.FILTER_ACCEPT;
          },
        }
      );

      const updates = [];
      let node;
      while ((node = walker.nextNode())) {
        const original = node.nodeValue;
        const newText = cleanText(original);
        if (newText !== original) {
          updates.push({ node, newText });
        }
      }

      updates.forEach(({ node, newText }) => {
        node.nodeValue = newText;
        cleaned++;
      });
    } catch (e) {
      console.warn('[BaseKaratUI v3.2] cleanTextNodes error:', e);
    }

    return cleaned;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §7 · CHART LABELS
     ═════════════════════════════════════════════════════════════════════ */
  function updateCharts() {
    try {
      const charts = GMS.Views?.dashboard?.state?.charts;
      if (!charts) return 0;

      let updated = 0;

      Object.values(charts).forEach(chart => {
        if (!chart?.data?.datasets) return;
        let changed = false;

        chart.data.datasets.forEach(ds => {
          if (ds.label) {
            const cleaned = cleanText(ds.label);
            if (cleaned !== ds.label) {
              ds.label = cleaned;
              changed = true;
            }
          }
        });

        if (changed) {
          try { chart.update('none'); } catch (_) {}
          updated++;
        }
      });

      return updated;
    } catch (_) { return 0; }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §8 · MAIN PROCESS
     ═════════════════════════════════════════════════════════════════════ */
  function processPage(opts = {}) {
    const { silent = false } = opts;

    if (isSkipRoute()) {
      return { skipped: true, reason: 'route_skipped' };
    }

    const page = document.getElementById('page');
    if (!page) return { skipped: true, reason: 'no_page' };

    State._stats.runs++;
    const t0 = performance.now();

    const kpiCount = convertKPIValues(page);
    const textCount = cleanTextNodes(page);
    const chartCount = updateCharts();

    const total = kpiCount + textCount + chartCount;
    State._stats.numbersConverted += kpiCount;
    State._stats.textsCleaned += textCount;
    State._stats.lastRun = new Date().toISOString();

    const elapsed = Math.round((performance.now() - t0) * 100) / 100;

    if (!silent) {
      console.log(
        `%c🏷️ BaseKaratUI v3.2 [run #${State._stats.runs}]: ${kpiCount} numbers, ${textCount} texts, ${chartCount} charts (${elapsed}ms) → ${getLabel()}`,
        'color:#0f7a43;font-weight:800;font-size:12px;'
      );
    }

    return {
      success: true,
      numbersConverted: kpiCount,
      textsCleaned: textCount,
      chartsUpdated: chartCount,
      total,
      elapsed,
      karat: getKarat(),
      label: getLabel(),
    };
  }

  /* ═════════════════════════════════════════════════════════════════════
     §9 · SCHEDULE
     ═════════════════════════════════════════════════════════════════════ */
  function scheduleProcess(delay = 300) {
    if (State._timer) clearTimeout(State._timer);
    State._timer = setTimeout(() => {
      State._timer = null;
      processPage();
    }, delay);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §10 · HOOKS
     ═════════════════════════════════════════════════════════════════════ */
  function hookRouter() {
    if (!GMS.Router) {
      setTimeout(hookRouter, 500);
      return;
    }

    if (GMS.Router._baseKaratUIHookedV32) return;
    GMS.Router._baseKaratUIHookedV32 = true;

    try {
      GMS.Router.on('afterNavigate', (data) => {
        const route = data?.to || GMS.Router.currentId?.();
        if (SKIP_ROUTES.includes(route)) return;

        /* 3 محاولات */
        setTimeout(() => processPage(), 100);
        setTimeout(() => processPage(), 500);
        setTimeout(() => processPage(), 1500);
      });

      console.log('[BaseKaratUI v3.2] ✅ Router hooked');
    } catch (_) {}
  }

  function hookBaseKarat() {
    if (!GMS.BaseKarat?.on) {
      setTimeout(hookBaseKarat, 500);
      return;
    }

    try {
      GMS.BaseKarat.on((payload) => {
        console.log(`[BaseKaratUI v3.2] 🔄 Karat → ${payload.current}K`);

        if (isSkipRoute()) return;

        setTimeout(() => processPage(), 50);
        setTimeout(() => processPage(), 400);
      });

      console.log('[BaseKaratUI v3.2] ✅ BaseKarat hooked');
    } catch (_) {}
  }

  /* ═════════════════════════════════════════════════════════════════════
     §11 · OBSERVER (خفيف جدًا)
     ═════════════════════════════════════════════════════════════════════ */
  function startObserver() {
    const target = document.getElementById('page');
    if (!target) {
      setTimeout(startObserver, 500);
      return;
    }

    const obs = new MutationObserver((mutations) => {
      if (isSkipRoute()) return;

      let hasNewKPI = false;
      for (const m of mutations) {
        if (m.type === 'childList' && m.addedNodes.length > 0) {
          for (const node of m.addedNodes) {
            if (node.nodeType === 1 && (node.classList?.contains('kpi') || node.querySelector?.('.kpi'))) {
              hasNewKPI = true;
              break;
            }
          }
        }
        if (hasNewKPI) break;
      }

      if (hasNewKPI) scheduleProcess(300);
    });

    obs.observe(target, { childList: true, subtree: true });
    State._observer = obs;

    console.log('[BaseKaratUI v3.2] 👁️ Observer started');
  }

  /* ═════════════════════════════════════════════════════════════════════
     §12 · INIT / DESTROY
     ═════════════════════════════════════════════════════════════════════ */
  function init() {
    if (State.installed) return;

    console.log(
      '%c🏷️  BaseKarat UI v3.2 initializing…',
      'color:#a55a00;font-weight:800;font-size:13px;'
    );

    hookRouter();
    hookBaseKarat();
    startObserver();

    /* معالجة أولية — 5 محاولات */
    setTimeout(() => processPage(), 300);
    setTimeout(() => processPage(), 1000);
    setTimeout(() => processPage(), 2000);
    setTimeout(() => processPage(), 3500);
    setTimeout(() => processPage(), 5000);

    /* معالجة دورية كل 10 ثواني (خفيفة) */
    State._interval = setInterval(() => {
      try {
        if (!document.hidden && !isSkipRoute()) {
          processPage({ silent: true });
        }
      } catch (_) {}
    }, 10000);

    State.installed = true;

    console.log(
      `%c✅ BaseKarat UI v3.2 ready · ${getLabel()}`,
      'color:#0f7a43;font-weight:800;font-size:13px;'
    );
  }

  function destroy() {
    if (State._observer) { State._observer.disconnect(); State._observer = null; }
    if (State._timer) { clearTimeout(State._timer); State._timer = null; }
    if (State._interval) { clearInterval(State._interval); State._interval = null; }
    State.installed = false;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §13 · EXPORT
     ═════════════════════════════════════════════════════════════════════ */
  GMS.BaseKaratUI = {
    init,
    destroy,
    refresh: processPage,
    processPage,
    cleanText,
    isSkipRoute,
    diagnostics: () => ({
      installed: State.installed,
      route: GMS.Router?.currentId?.(),
      skip: isSkipRoute(),
      karat: getKarat(),
      label: getLabel(),
      stats: { ...State._stats },
      skipRoutes: SKIP_ROUTES,
    }),
    SKIP_ROUTES,
    get state() { return State; },
  };

  window.BaseKaratUI = GMS.BaseKaratUI;

  /* ═════════════════════════════════════════════════════════════════════
     §14 · AUTO-INIT — أسرع (300ms)
     ═════════════════════════════════════════════════════════════════════ */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 300));
  } else {
    setTimeout(init, 300);
  }

  console.log(
    '%c🏷️  BaseKarat UI v3.2 LOADED · Ready',
    'color:#a55a00;font-weight:900;font-size:14px;padding:3px 8px;' +
    'background:linear-gradient(135deg,#f0d68c,#9c7726);border-radius:4px;'
  );

})();
