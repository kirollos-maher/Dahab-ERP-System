/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ENTERPRISE — js/32-base-karat-ui.js
   Base Karat UI — v3.0 (إعادة كتابة كاملة)
   ─────────────────────────────────────────────────────────────────────
   ✅ v3.0 — المنطق الجديد:
     • يعمل مرة واحدة فقط عند كل render (بدون Observer)
     • يستثني Settings و Audit نهائياً
     • يحوّل الأرقام + النصوص في مرور واحد
     • يعمل صح بعد Hard Reload
     • يستمع لحدث BaseKarat.on() للتحديث الفوري
     • لا يتضارب مع ملف 31 (فصل واضح للمسؤوليات)

   كيف يعمل:
     1. عند init → يربط نفسه بـ Router.afterNavigate
     2. عند كل تنقل → يستدعي processPage() مرة واحدة
     3. processPage():
        أ. يمسح عناصر الذهب (.kpi-value مع label ذهب)
        ب. يحوّل الأرقام الرياضية
        ج. ينظّف النصوص (استبدال 24K/21K/18K + إزالة "بندق")
        د. يحدث Chart labels
     4. عند تغيير BaseKarat → يعيد processPage() فوراً

   Public API:
     GMS.BaseKaratUI.refresh()         → معالجة فورية
     GMS.BaseKaratUI.processPage()     → اسم بديل
     GMS.BaseKaratUI.isSkipRoute()     → هل الصفحة محظورة؟
     GMS.BaseKaratUI.diagnostics()     → تشخيص
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const GMS = window.GMS = window.GMS || {};

  /* ═════════════════════════════════════════════════════════════════════
     §1 · STATE — بسيط جدًا
     ═════════════════════════════════════════════════════════════════════ */
  const State = {
    installed: false,
    _currentRoute: null,
    _unsubscribers: [],
    _stats: {
      totalProcessed: 0,
      numbersConverted: 0,
      textsCleaned: 0,
      chartsUpdated: 0,
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
      return SKIP_ROUTES.includes(r);
    } catch (_) {
      return false;
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §3 · BASE KARAT HELPERS
     ═════════════════════════════════════════════════════════════════════ */
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
      const ratio = getKarat() / 24;
      return ratio > 0 ? v / ratio : v;
    } catch (_) {
      return v;
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §4 · PROTECTED — لا نلمس
     ═════════════════════════════════════════════════════════════════════ */
  const PROTECTED_SELECTORS = [
    'button', 'input', 'select', 'textarea',
    'a[href]',
    '[data-bk-option]',
    '[data-karat]',
    '[data-no-karat-ui]',
    '.base-karat-card',
    '.kpi', // بطاقات في Settings
  ];

  function isProtected(el) {
    if (!el || !el.closest) return false;
    for (const sel of PROTECTED_SELECTORS) {
      try { if (el.closest(sel)) return true; } catch (_) {}
    }
    return false;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §5 · TEXT PROTECTION
     ═════════════════════════════════════════════════════════════════════ */
  function isProtectedText(text) {
    if (!text) return true;
    const t = String(text).trim();

    /* نص قصير جدًا */
    if (t.length < 3) return true;

    /* نص كله أرقام ورموز */
    if (!/[\u0600-\u06FFa-zA-Z]/.test(t)) return true;

    return false;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §6 · TEXT CLEANING — v3.0 (منظّم)
     ═════════════════════════════════════════════════════════════════════
     المرحلة 1: استبدال العيار القديم بالجديد
     المرحلة 2: إزالة "بندق"
     المرحلة 3: تنظيف المسافات والأقواس
     ═════════════════════════════════════════════════════════════════════ */
  function cleanText(text) {
    if (!text) return text;
    if (isProtectedText(text)) return text;

    const baseLabel = getLabel();
    let out = String(text);

    /* ─── المرحلة 1: استبدال العيارات غير النشطة ─── */

    /* "(24K)" و "(21K)" و "(18K)" → "(baseLabel)" — لو مختلفة */
    out = out.replace(/\(\s*(24K|21K|18K)\s*\)/g, (m, k) => {
      return k === baseLabel ? m : `(${baseLabel})`;
    });

    /* "24K" و "21K" و "18K" منفصلة → baseLabel */
    out = out.replace(/\b(24K|21K|18K)\b/g, (m, k) => {
      return k === baseLabel ? m : baseLabel;
    });

    /* ─── المرحلة 2: إزالة "بندق" ─── */

    /* "(بندق 24K)" أو "(بندق 18K)" → "(24K)" أو "(18K)" */
    out = out.replace(/\(\s*بندق\s+(24K|21K|18K)\s*\)/g, (m, k) => {
      return k === baseLabel ? `(${k})` : `(${baseLabel})`;
    });

    /* "(بندق 24)" → "(24K)" */
    out = out.replace(/\(\s*بندق\s+(\d{2,3})\s*\)/g, () => `(${baseLabel})`);

    /* "بندق 24K" أو "بندق 18K" → "24K" أو "18K" */
    out = out.replace(/بندق\s+(24K|21K|18K)/g, (m, k) => {
      return k === baseLabel ? k : baseLabel;
    });

    /* "بندق 24" → "24K" */
    out = out.replace(/بندق\s+(\d{2,3})\b/g, () => baseLabel);

    /* "البندق X" → "العيار X" */
    out = out.replace(/البندق\s+(24K|21K|18K)/g, (m, k) => {
      const lbl = k === baseLabel ? k : baseLabel;
      return `العيار ${lbl}`;
    });

    /* أنماط مركّبة */
    out = out.replace(/بندق\s+جملة\s+مُباع/gi, 'ذهب جملة مُباع');
    out = out.replace(/بندق\s+جملة/gi, 'ذهب جملة');
    out = out.replace(/جم\s+بندق\s+(24K|21K|18K)/g, (m, k) => {
      return `جم ${k === baseLabel ? k : baseLabel}`;
    });
    out = out.replace(/جم\s+بندق/gi, 'جم');
    out = out.replace(/البندق\s+المُفلتر/gi, 'العيار المُفلتر');
    out = out.replace(/البندق\s+الفلتر/gi, 'العيار المفلتر');

    /* "البندق" بدون سياق → "العيار" */
    out = out.replace(/البندق\b/g, 'العيار');

    /* "بندق" متبقية → حذف نظيف */
    out = out.replace(/\s+بندق\s+/g, ' ');
    out = out.replace(/^بندق\s+/g, '');
    out = out.replace(/\s+بندق$/g, '');

    /* ─── المرحلة 3: تنظيف المسافات والأقواس ─── */
    out = out.replace(/\(\s*\)/g, '');
    out = out.replace(/\s{2,}/g, ' ');
    out = out.replace(/\s+\(/g, ' (');
    out = out.replace(/\)\s+/g, ') ');
    out = out.replace(/\(\s+/g, '(');
    out = out.replace(/\s+\)/g, ')');

    /* ─── المرحلة 4: إزالة التكرار ─── */
    out = out.replace(new RegExp(`\\b(${baseLabel})\\s*\\(\\s*\\1\\s*\\)`, 'g'), '$1');
    out = out.replace(/(24K|21K|18K)\s*\(\s*\1\s*\)/g, '$1');
    out = out.replace(/(24K|21K|18K)\s+(24K|21K|18K)/g, (m, a, b) => {
      return a === b ? a : m;
    });

    return out.trim();
  }

  /* ═════════════════════════════════════════════════════════════════════
     §7 · NUMBER HELPERS
     ═════════════════════════════════════════════════════════════════════ */
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
     §8 · CONVERT KPI NUMBERS
     ═════════════════════════════════════════════════════════════════════
     يستهدف: .kpi-value داخل .kpi (لكن ليس داخل Settings)
     ═════════════════════════════════════════════════════════════════════ */
  function convertNumbers(root) {
    if (!root) return 0;

    let changed = 0;
    const baseLabel = getLabel();

    root.querySelectorAll('.kpi').forEach(kpi => {
      /* تخطي بطاقات settings */
      if (kpi.closest('[data-no-karat-ui]')) return;
      if (kpi.closest('#set-base-karat-card')) return;

      const labelEl = kpi.querySelector('.kpi-label');
      const valueEl = kpi.querySelector('.kpi-value');
      if (!labelEl || !valueEl) return;

      const labelText = labelEl.textContent || '';

      /* هل KPI هذا عن ذهب؟ */
      const isGoldKPI = /ذهب|خزنة|بندق|جم/i.test(labelText);
      if (!isGoldKPI) return;

      /* تجاهل لو KPI سعر */
      const isPriceKPI = /ج\.م|جنيه/i.test(labelText);
      if (isPriceKPI) return;

      /* استخراج القيمة العددية */
      const currentText = valueEl.textContent;
      const currentValue = parseNumber(currentText);
      if (currentValue === 0) return;

      /* القيمة الأصلية (بندق 24K) مخزنة */
      let originalValue = parseFloat(valueEl.dataset.karatOriginal);

      /* لو ما فيش → نخزّن الحالية (بافتراض أنها بندق 24K من state) */
      if (!isFinite(originalValue)) {
        originalValue = currentValue;
        valueEl.dataset.karatOriginal = String(originalValue);
        valueEl.dataset.karatProcessed = '1';
      }

      /* نحوّل من الأصلية */
      const converted = convert(originalValue);

      /* نحافظ على الـ small tag */
      const innerHTML = valueEl.innerHTML;
      const smallMatch = innerHTML.match(/<small[^>]*>[\s\S]*?<\/small>/i);
      const smallHTML = smallMatch ? smallMatch[0] : '';

      const formatted = formatLike(converted, currentText);
      const newHTML = formatted + (smallHTML ? ' ' + smallHTML : '');

      if (valueEl.innerHTML !== newHTML) {
        valueEl.innerHTML = newHTML;
        changed++;
      }
    });

    return changed;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §9 · CLEAN TEXT NODES
     ═════════════════════════════════════════════════════════════════════
     يستخدم TreeWalker — يزور كل النصوص مرة واحدة
     ═════════════════════════════════════════════════════════════════════ */
  function cleanTextNodes(root) {
    if (!root) return 0;

    let changed = 0;

    try {
      const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node) => {
            if (!node.nodeValue || !node.nodeValue.trim()) {
              return NodeFilter.FILTER_REJECT;
            }

            const parent = node.parentNode;
            if (!parent) return NodeFilter.FILTER_REJECT;

            const tag = parent.tagName;
            if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') {
              return NodeFilter.FILTER_REJECT;
            }

            if (isProtected(parent)) return NodeFilter.FILTER_REJECT;
            if (isProtectedText(node.nodeValue)) return NodeFilter.FILTER_REJECT;

            return NodeFilter.FILTER_ACCEPT;
          },
        }
      );

      let node;
      const nodesToUpdate = [];

      while ((node = walker.nextNode())) {
        const original = node.nodeValue;
        const cleaned = cleanText(original);

        if (cleaned !== original) {
          nodesToUpdate.push({ node, cleaned });
        }
      }

      nodesToUpdate.forEach(({ node, cleaned }) => {
        node.nodeValue = cleaned;
        changed++;
      });

    } catch (e) {
      console.warn('[BaseKaratUI.cleanTextNodes]', e);
    }

    return changed;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §10 · CHART LABELS
     ═════════════════════════════════════════════════════════════════════ */
  function updateChartLabels() {
    try {
      const charts = GMS.Views?.dashboard?.state?.charts;
      if (!charts) return 0;

      let changed = 0;

      Object.values(charts).forEach(chart => {
        if (!chart || !chart.data || !chart.data.datasets) return;

        let chartChanged = false;

        chart.data.datasets.forEach(ds => {
          if (ds.label && !isProtectedText(ds.label)) {
            const cleaned = cleanText(ds.label);
            if (cleaned !== ds.label) {
              ds.label = cleaned;
              chartChanged = true;
            }
          }
        });

        if (chartChanged) {
          try { chart.update('none'); } catch (_) {}
          changed++;
        }
      });

      return changed;
    } catch (_) {
      return 0;
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §11 · MAIN PROCESS PAGE
     ═════════════════════════════════════════════════════════════════════ */
  function processPage() {
    /* استثناء Settings و Audit */
    if (isSkipRoute()) {
      return {
        skipped: true,
        reason: 'route_skipped',
        route: GMS.Router?.currentId?.(),
      };
    }

    const page = document.getElementById('page');
    if (!page) {
      return { skipped: true, reason: 'no_page' };
    }

    const t0 = performance.now();

    /* 1 · تنظيف النصوص */
    const textsCleaned = cleanTextNodes(page);

    /* 2 · تحويل الأرقام */
    const numbersConverted = convertNumbers(page);

    /* 3 · تحديث Charts */
    const chartsUpdated = updateChartLabels();

    /* 4 · تحديث الإحصائيات */
    const total = textsCleaned + numbersConverted + chartsUpdated;
    State._stats.totalProcessed += total;
    State._stats.textsCleaned += textsCleaned;
    State._stats.numbersConverted += numbersConverted;
    State._stats.chartsUpdated += chartsUpdated;
    State._stats.lastRun = new Date().toISOString();

    const elapsed = Math.round((performance.now() - t0) * 100) / 100;

    if (total > 0) {
      console.log(
        `%c🏷️ BaseKaratUI: ${textsCleaned} texts, ${numbersConverted} numbers, ${chartsUpdated} charts (${elapsed}ms) → ${getLabel()}`,
        'color:#0f7a43;font-weight:700;font-size:11px;'
      );
    }

    return {
      success: true,
      route: GMS.Router?.currentId?.(),
      karat: getKarat(),
      label: getLabel(),
      textsCleaned,
      numbersConverted,
      chartsUpdated,
      total,
      elapsed,
    };
  }

  /* alias */
  function refresh(opts = {}) {
    return processPage();
  }

  /* ═════════════════════════════════════════════════════════════════════
     §12 · HOOKS
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * Hook Router — يعمل بعد كل render
   */
  function hookRouter() {
    if (!GMS.Router) {
      setTimeout(hookRouter, 300);
      return;
    }

    if (GMS.Router._baseKaratUIHookedV3) return;
    GMS.Router._baseKaratUIHookedV3 = true;

    try {
      const unsub = GMS.Router.on('afterNavigate', (data) => {
        const route = data?.to || GMS.Router?.currentId?.();
        State._currentRoute = route;

        console.log(`[BaseKaratUI v3] 🧭 Navigated to: ${route}`);

        if (SKIP_ROUTES.includes(route)) {
          return;
        }

        /* استدعاء مرة واحدة بعد اكتمال الرسم */
        setTimeout(() => {
          processPage();
        }, 250);

        /* استدعاء تأكيدي بعد 800ms (لو الرسم تأخر) */
        setTimeout(() => {
          processPage();
        }, 800);
      });

      State._unsubscribers.push(unsub);

      console.log('[BaseKaratUI v3] ✅ Hooked to Router');
    } catch (e) {
      console.warn('[BaseKaratUI v3] hookRouter failed:', e);
    }
  }

  /**
   * Hook BaseKarat — يعمل عند تغيير العيار
   */
  function hookBaseKarat() {
    if (!GMS.BaseKarat?.on) {
      setTimeout(hookBaseKarat, 300);
      return;
    }

    if (State._unsubscribers.some(fn => fn._karatHook)) return;

    try {
      const unsub = GMS.BaseKarat.on((payload) => {
        console.log(`[BaseKaratUI v3] 🔄 Karat → ${payload.current}K`);

        if (isSkipRoute()) return;

        /* معالجة فورية */
        processPage();

        /* معالجة تأكيدية بعد لحظات */
        setTimeout(() => {
          if (!isSkipRoute()) processPage();
        }, 400);
      });

      unsub._karatHook = true;
      State._unsubscribers.push(unsub);

      console.log('[BaseKaratUI v3] ✅ Hooked to BaseKarat');
    } catch (e) {
      console.warn('[BaseKaratUI v3] hookBaseKarat failed:', e);
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §13 · INIT / DESTROY
     ═════════════════════════════════════════════════════════════════════ */
  function init() {
    if (State.installed) return;

    console.log(
      '%c🏷️  BaseKarat UI v3.0 initializing…',
      'color:#a55a00;font-weight:800;font-size:12px;'
    );

    /* 1 · Hook Router */
    hookRouter();

    /* 2 · Hook BaseKarat */
    hookBaseKarat();

    /* 3 · معالجة أولية للصفحة الحالية (لو مش settings) */
    setTimeout(() => {
      if (!isSkipRoute()) {
        processPage();
      }
    }, 1000);

    /* 4 · معالجة تأكيدية بعد اكتمال boot */
    setTimeout(() => {
      if (!isSkipRoute()) {
        processPage();
      }
    }, 2500);

    State.installed = true;

    console.log(
      `%c✅ BaseKarat UI v3.0 ready (Skipped: [${SKIP_ROUTES.join(', ')}])`,
      'color:#0f7a43;font-weight:800;font-size:12px;'
    );
  }

  function destroy() {
    State._unsubscribers.forEach(fn => {
      try { fn(); } catch (_) {}
    });
    State._unsubscribers = [];
    State.installed = false;
    console.log('[BaseKaratUI v3] 🛑 Destroyed');
  }

  /* ═════════════════════════════════════════════════════════════════════
     §14 · DIAGNOSTICS
     ═════════════════════════════════════════════════════════════════════ */
  function diagnostics() {
    return {
      installed: State.installed,
      currentRoute: GMS.Router?.currentId?.(),
      skipRoute: isSkipRoute(),
      karat: getKarat(),
      label: getLabel(),
      stats: { ...State._stats },
      stats_human: {
        totalProcessed: State._stats.totalProcessed,
        textsCleaned: State._stats.textsCleaned,
        numbersConverted: State._stats.numbersConverted,
        chartsUpdated: State._stats.chartsUpdated,
      },
      skipRoutes: SKIP_ROUTES,
    };
  }

  /* ═════════════════════════════════════════════════════════════════════
     §15 · EXPORT
     ═════════════════════════════════════════════════════════════════════ */
  GMS.BaseKaratUI = {
    init,
    destroy,
    refresh,
    processPage,
    cleanText,
    isSkipRoute,
    diagnostics,
    SKIP_ROUTES,
    get state() { return State; },
  };

  window.BaseKaratUI = GMS.BaseKaratUI;

  /* ═════════════════════════════════════════════════════════════════════
     §16 · AUTO-INIT
     ═════════════════════════════════════════════════════════════════════ */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 800));
  } else {
    setTimeout(init, 800);
  }

  console.log(
    '%c🏷️  BaseKarat UI v3.0 loaded · Router-driven · No Observer',
    'color:#a55a00;font-weight:900;font-size:13px;padding:2px 6px;' +
    'background:linear-gradient(135deg,#f0d68c,#9c7726);border-radius:4px;'
  );

})();
