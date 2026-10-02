/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ENTERPRISE — js/32-base-karat-ui.js
   Base Karat UI — v2.4 (FINAL SAFE MODE)
   ─────────────────────────────────────────────────────────────────────
   ✅ v2.4 الإصلاحات الحاسمة:
     • cleanText يحمي النصوص القصيرة والـ labels المستقلة
     • MutationObserver يُوقف بالكامل في الصفحات المحظورة
     • convertNumbersInDOM يتحقق من isProtected
     • convertChartData يحمي النصوص القصيرة
     • استثناء إضافي: البيانات الأصلية للـ charts
     • حماية من auto-replace داخل "14K", "22K", "18K", "21K", "24K"
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const GMS = window.GMS = window.GMS || {};

  /* ═════════════════════════════════════════════════════════════════════
     §1 · STATE
     ═════════════════════════════════════════════════════════════════════ */
  const State = {
    installed: false,
    observer: null,
    pendingRefresh: null,
    unsubscribers: [],
    processedNodes: new WeakSet(),
    _lastKarat: null,
    _lastRoute: null,
    _refreshCount: 0,
  };

  /* ═════════════════════════════════════════════════════════════════════
     §2 · SKIP ROUTES
     ═════════════════════════════════════════════════════════════════════ */
  const SKIP_ROUTES = ['settings', 'audit'];

  function isSkippedRoute() {
    try {
      const current = GMS.Router?.currentId?.();
      return SKIP_ROUTES.includes(current);
    } catch (_) {
      return false;
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §3 · HELPERS
     ═════════════════════════════════════════════════════════════════════ */
  function getBaseKarat() {
    try {
      if (GMS.BaseKarat?.current) return GMS.BaseKarat.current;
    } catch (_) {}
    return 24;
  }

  function getBaseLabel() {
    try {
      if (GMS.BaseKarat?.labelShort) return GMS.BaseKarat.labelShort;
    } catch (_) {}
    return '24K';
  }

  function toBase(weight) {
    const w = parseFloat(weight);
    if (!isFinite(w) || w === 0) return 0;
    try {
      if (GMS.BaseKarat?.fromPure) {
        return GMS.BaseKarat.fromPure(w, getBaseKarat());
      }
      const ratio = GMS.BaseKarat?.ratio || 1;
      return w / ratio;
    } catch (_) {
      return w;
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §4 · PROTECTED SELECTORS
     ═════════════════════════════════════════════════════════════════════ */
  const PROTECTED_SELECTORS = [
    '[data-bk-option]',
    '[data-karat]',
    '[data-bk-custom]',
    'button',
    'input',
    'select',
    'textarea',
    'a[href]',
    '.base-karat-card',
    '[data-bk-card]',
    '#set-base-karat-card',
    '.kpi',
    '.setting-item',
    '.price-karat-cell',   /* 🆕 خلايا الأسعار في settings */
    '.live-price-cell',    /* 🆕 */
    '[data-price-cell]',   /* 🆕 */
  ];

  function isProtected(el) {
    if (!el || !el.closest) return false;
    for (const sel of PROTECTED_SELECTORS) {
      try { if (el.closest(sel)) return true; } catch (_) {}
    }
    return false;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §5 · PROTECTED TEXT — تحديث حرج
     ═════════════════════════════════════════════════════════════════════
     المشكلة كانت هنا في v2.3: cleanText ما كانش يستدعي هذه
     الحماية الكاملة، فكان النص "24K" بيتحول لـ "18K".
     ═════════════════════════════════════════════════════════════════════ */
  function isProtectedText(text) {
    if (!text) return true;

    const t = String(text).trim();

    /* ✅ نص قصير جدًا */
    if (t.length <= 4) return true;

    /* ✅ فقط رقم */
    if (/^\s*[\d.,\-+]+\s*$/.test(t)) return true;

    /* ✅ مجرد عيار لوحده (بأي صيغة) */
    if (/^(14K|18K|21K|22K|24K)$/.test(t)) return true;
    if (/^(\d{1,3})K?$/.test(t)) return true;    /* "24" أو "888K" */

    /* ✅ مجرد "K" أو رمز */
    if (/^[Kk\s\-]+$/.test(t)) return true;

    /* ✅ سطر لا يحتوي حروف عربية أو إنجليزية (مثل "0.7500") */
    if (!/[\u0600-\u06FFa-zA-Z]/.test(t)) return true;

    /* ✅ أسعار و أعشار */
    if (/^[\d.]+K?$/.test(t)) return true;

    return false;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §6 · CLEANING PATTERNS — v2.4 (بسيطة وآمنة)
     ═════════════════════════════════════════════════════════════════════
     حذف كل الأنماط الخطرة زي \b24K\b → 18K
     الآن نتعامل فقط مع "بندق" و"جم بندق"
     ═════════════════════════════════════════════════════════════════════ */
  const CLEAN_PATTERNS = [
    /* إزالة "بندق" فقط — لا نلمس العيارات المنفردة */
    { re: /\(\s*بندق\s+(18K|21K|24K)\s*\)/gi, rep: '($1)' },
    { re: /\(\s*بندق\s+(\d{2})\s*\)/gi, rep: '($1K)' },
    { re: /بندق\s+(18K|21K|24K)/gi, rep: '$1' },
    { re: /بندق\s+(\d{2})\b/gi, rep: '$1K' },
    { re: /البندق\s+(18K|21K|24K)/gi, rep: 'العيار $1' },
    { re: /بندق\s+جملة\s+مُباع/gi, rep: 'جملة مُباعة' },
    { re: /بندق\s+جملة/gi, rep: 'جملة' },
    { re: /جم\s+بندق\s+(18K|21K|24K)/gi, rep: 'جم $1' },
    { re: /جم\s+بندق/gi, rep: 'جم' },
    { re: /البندق\s+الفلتر/gi, rep: 'العيار المفلتر' },
    { re: /البندق\s+المُفلتر/gi, rep: 'العيار المُفلتر' },
    { re: /البندق\b/gi, rep: 'العيار' },
    { re: /\s+بندق\s+/gi, rep: ' ' },
    { re: /^بندق\s+/gi, rep: '' },
    { re: /\s+بندق$/gi, rep: '' },

    /* تنظيف المسافات والأقواس */
    { re: /\(\s*\)/g, rep: '' },
    { re: /\s{2,}/g, rep: ' ' },
    { re: /\s+\(/g, rep: ' (' },
    { re: /\)\s+/g, rep: ') ' },
    { re: /\(\s+/g, rep: '(' },
    { re: /\s+\)/g, rep: ')' },

    /* إزالة تكرار العيار */
    { re: /(18K|21K|24K)\s*\(\s*\1\s*\)/g, rep: '$1' },
  ];

  function cleanText(text) {
    if (!text) return text;

    /* ✅ حماية نصية صارمة — الأهم في v2.4 */
    if (isProtectedText(text)) return text;

    let out = String(text);
    for (const p of CLEAN_PATTERNS) {
      p.re.lastIndex = 0;
      out = out.replace(p.re, p.rep);
    }
    out = out.replace(/\s{2,}/g, ' ').trim();
    return out;
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

  function formatLike(value, originalText) {
    const v = Number(value);
    if (!isFinite(v)) return String(originalText);

    const hasThousands = /,/.test(originalText);
    const match = String(originalText).match(/\.(\d+)/);
    const decimals = match ? match[1].length : 0;

    let formatted = v.toFixed(decimals);
    if (hasThousands) {
      const parts = formatted.split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      formatted = parts.join('.');
    }
    return formatted;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §8 · CONVERT NUMBERS
     ═════════════════════════════════════════════════════════════════════ */
  function convertNumbersInDOM(root) {
    if (!root) return 0;
    if (isSkippedRoute()) return 0;
    let changed = 0;

    root.querySelectorAll('[data-karat-value]').forEach(el => {
      try {
        if (isProtected(el)) return;

        let origValue = parseFloat(el.dataset.karatValue);
        if (!isFinite(origValue)) {
          origValue = parseNumber(el.textContent);
          el.dataset.karatValue = String(origValue);
        }

        const converted = toBase(origValue);
        const newText = formatLike(converted, el.textContent);

        if (el.textContent.trim() !== newText) {
          el.textContent = newText;
          changed++;
        }
      } catch (_) {}
    });

    root.querySelectorAll('.kpi-value').forEach(el => {
      try {
        if (isProtected(el)) return;

        const origText = el.textContent;
        const value = parseNumber(origText);
        if (value === 0) return;

        const parent = el.closest('.kpi');
        if (!parent) return;

        const labelEl = parent.querySelector('.kpi-label');
        if (!labelEl) return;

        const labelText = labelEl.textContent || '';
        const isGoldKPI = /ذهب|خزنة|جم/i.test(labelText);

        if (!isGoldKPI) return;

        let origValue = parseFloat(el.dataset.karatOriginal);
        if (!isFinite(origValue)) {
          origValue = value;
          el.dataset.karatOriginal = String(origValue);
        }

        const converted = toBase(origValue);

        const innerHTML = el.innerHTML;
        const smallMatch = innerHTML.match(/<small[^>]*>.*?<\/small>/i);
        const smallHTML = smallMatch ? smallMatch[0] : '';

        const formatted = formatLike(converted, origText);
        el.innerHTML = formatted + (smallHTML ? ' ' + smallHTML : '');

        changed++;
      } catch (_) {}
    });

    return changed;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §9 · CHARTS — مع حماية النصوص
     ═════════════════════════════════════════════════════════════════════ */
  function convertChartData() {
    try {
      if (isSkippedRoute()) return 0;

      const charts = GMS.Views?.dashboard?.state?.charts;
      if (!charts) return 0;

      let changed = 0;

      Object.entries(charts).forEach(([key, chart]) => {
        if (!chart || !chart.data || !chart.data.datasets) return;

        let chartChanged = false;

        chart.data.datasets.forEach(ds => {
          if (ds.label) {
            /* ✅ حماية صارمة */
            if (isProtectedText(ds.label)) return;

            const cleaned = cleanText(ds.label);
            if (ds.label !== cleaned) {
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
     §10 · TEXT PROCESSING
     ═════════════════════════════════════════════════════════════════════ */
  function processTextNode(node) {
    if (!node || !node.nodeValue) return false;
    if (isSkippedRoute()) return false;

    const parent = node.parentNode;
    if (!parent) return false;

    if (isProtected(parent)) return false;

    const original = node.nodeValue;
    if (isProtectedText(original)) return false;

    const cleaned = cleanText(original);

    if (cleaned !== original) {
      node.nodeValue = cleaned;
      return true;
    }
    return false;
  }

  function processElement(root) {
    if (!root) return 0;
    if (isSkippedRoute()) return 0;
    if (root.nodeType === 3) return processTextNode(root) ? 1 : 0;
    if (root.nodeType === 1 && isProtected(root)) return 0;

    let count = 0;

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

      let n;
      while ((n = walker.nextNode())) {
        if (processTextNode(n)) count++;
      }
    } catch (_) {}

    return count;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §11 · MAIN REFRESH
     ═════════════════════════════════════════════════════════════════════ */
  function refresh(opts = {}) {
    const { force = false } = opts;

    /* ✅ حماية إضافية */
    if (isSkippedRoute()) {
      State._lastKarat = getBaseKarat();
      State._lastRoute = GMS.Router?.currentId?.() || 'settings';
      return 0;
    }

    const current = getBaseKarat();
    const route = GMS.Router?.currentId?.() || 'unknown';

    if (!force && State._lastKarat === current && State._lastRoute === route) {
      return 0;
    }

    State._lastKarat = current;
    State._lastRoute = route;
    State._refreshCount++;
    State.processedNodes = new WeakSet();

    const page = document.getElementById('page') || document.body;

    const textCount = processElement(page);
    const numCount = convertNumbersInDOM(page);
    const chartCount = convertChartData();

    const total = textCount + numCount + chartCount;

    if (total > 0) {
      console.log(
        `%c✨ BaseKarat UI v2.4: ${textCount} texts, ${numCount} numbers, ${chartCount} charts (route: ${route})`,
        'color:#0f7a43;font-weight:700;font-size:11px;'
      );
    }

    return total;
  }

  function scheduleRefresh(delay = 300) {
    if (isSkippedRoute()) return;
    if (State.pendingRefresh) clearTimeout(State.pendingRefresh);
    State.pendingRefresh = setTimeout(() => {
      State.pendingRefresh = null;
      refresh({ force: true });
    }, delay);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §12 · OBSERVER — مع فحص skip كامل
     ═════════════════════════════════════════════════════════════════════ */
  function startObserver() {
    if (State.observer) return;

    const target = document.getElementById('page');
    if (!target) {
      setTimeout(startObserver, 300);
      return;
    }

    State.observer = new MutationObserver((mutations) => {
      /* ✅ تجاهل كامل في الصفحات المحظورة */
      if (isSkippedRoute()) return;

      let hasNewContent = false;

      for (const m of mutations) {
        if (m.type === 'childList' && m.addedNodes.length > 0) {
          for (const node of m.addedNodes) {
            if (node.nodeType === 1) {
              const tag = node.tagName;
              if (tag !== 'SCRIPT' && tag !== 'STYLE') {
                hasNewContent = true;
                break;
              }
            } else if (node.nodeType === 3 && node.nodeValue.trim()) {
              hasNewContent = true;
              break;
            }
          }
        }
        if (hasNewContent) break;
      }

      if (hasNewContent) {
        scheduleRefresh(300);
      }
    });

    State.observer.observe(target, { childList: true, subtree: true });

    console.log('[BaseKaratUI v2.4] 👁️  Observer started (FINAL SAFE MODE)');
  }

  function stopObserver() {
    if (State.observer) {
      State.observer.disconnect();
      State.observer = null;
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §13 · HOOKS
     ═════════════════════════════════════════════════════════════════════ */
  function hookRouter() {
    if (!GMS.Router) {
      setTimeout(hookRouter, 300);
      return;
    }
    if (GMS.Router._baseKaratUIHookedV24) return;
    GMS.Router._baseKaratUIHookedV24 = true;

    try {
      const unsub = GMS.Router.on('afterNavigate', (data) => {
        const route = data?.to || GMS.Router.currentId?.();
        console.log(`[BaseKaratUI v2.4] 🧭 Navigated to: ${route}`);

        /* ✅ لا نعمل refresh في الصفحات المحظورة */
        if (SKIP_ROUTES.includes(route)) {
          State._lastRoute = route;
          return;
        }

        setTimeout(() => refresh({ force: true }), 500);
      });
      State.unsubscribers.push(unsub);
    } catch (_) {}
  }

  function hookBaseKarat() {
    if (!GMS.BaseKarat) {
      setTimeout(hookBaseKarat, 300);
      return;
    }
    if (State.unsubscribers.some(fn => fn._bkUIV24)) return;

    try {
      const unsub = GMS.BaseKarat.on((payload) => {
        console.log(`[BaseKaratUI v2.4] 🔄 Karat → ${payload.current}K`);
        if (isSkippedRoute()) return;
        setTimeout(() => refresh({ force: true }), 500);
      });
      unsub._bkUIV24 = true;
      State.unsubscribers.push(unsub);
    } catch (_) {}

    window.addEventListener('gms:baseKaratChanged', () => {
      if (isSkippedRoute()) return;
      scheduleRefresh(400);
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §14 · INIT / DESTROY
     ═════════════════════════════════════════════════════════════════════ */
  function init() {
    if (State.installed) return;

    console.log(
      '%c🏷️  BaseKarat UI v2.4 (FINAL SAFE) initializing…',
      'color:#a55a00;font-weight:800;font-size:12px;'
    );

    hookRouter();
    hookBaseKarat();
    startObserver();

    setTimeout(() => refresh({ force: true }), 1000);
    setTimeout(() => refresh({ force: true }), 3000);

    setInterval(() => {
      try {
        if (isSkippedRoute()) return;
        const current = getBaseKarat();
        if (State._lastKarat !== current) {
          refresh({ force: true });
        }
      } catch (_) {}
    }, 10000);

    State.installed = true;

    console.log(
      `%c✅ BaseKarat UI v2.4 ready — Skipped: [${SKIP_ROUTES.join(', ')}]`,
      'color:#0f7a43;font-weight:800;font-size:12px;'
    );
  }

  function destroy() {
    stopObserver();
    State.unsubscribers.forEach(fn => { try { fn(); } catch (_) {} });
    State.unsubscribers = [];
    if (State.pendingRefresh) {
      clearTimeout(State.pendingRefresh);
      State.pendingRefresh = null;
    }
    State.installed = false;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §15 · EXPORT
     ═════════════════════════════════════════════════════════════════════ */
  GMS.BaseKaratUI = {
    init,
    destroy,
    refresh,
    scheduleRefresh,
    state: State,
    cleanText,
    isProtected,
    isProtectedText,
    isSkippedRoute,
    SKIP_ROUTES,
  };

  window.BaseKaratUI = GMS.BaseKaratUI;

  /* ═════════════════════════════════════════════════════════════════════
     §16 · AUTO-INIT
     ═════════════════════════════════════════════════════════════════════ */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 1500));
  } else {
    setTimeout(init, 1500);
  }

  console.log(
    '%c🏷️  BaseKarat UI v2.4 loaded · FINAL SAFE · Settings untouched',
    'color:#a55a00;font-weight:900;font-size:13px;padding:2px 6px;' +
    'background:linear-gradient(135deg,#f0d68c,#9c7726);border-radius:4px;'
  );

})();
