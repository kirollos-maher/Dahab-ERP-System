/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ENTERPRISE — js/32-base-karat-ui.js
   Base Karat UI — v2.5 (FIX: Hard Reload Persistence)
   ─────────────────────────────────────────────────────────────────────
   ✅ v2.5 الإصلاح الحاسم:
     • يعمل صح عند Hard Reload — مش بس عند التغيير اليدوي
     • يتتبّع hash المحتوى بدل _lastKarat فقط
     • يفحص DOM كل 500ms بدل الاعتماد على Observer فقط
     • يضيف auto-retry كل ثانية لما الصفحة تترسم
     • يحوّل الأرقام مباشرة عند أول render
     • force=true افتراضي في refresh بعد init
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
    _lastDOMHash: null,        /* 🆕 v2.5: hash المحتوى */
    _refreshCount: 0,
    _initTime: Date.now(),
    _lastRefreshAt: null,
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

  /* 🆕 v2.5: حساب hash بسيط للمحتوى */
  function domHash() {
    try {
      const page = document.getElementById('page');
      if (!page) return '';
      const text = page.textContent || '';
      let hash = 0;
      const sample = text.slice(0, 2000);
      for (let i = 0; i < sample.length; i++) {
        hash = ((hash << 5) - hash) + sample.charCodeAt(i);
        hash |= 0;
      }
      return String(hash);
    } catch (_) {
      return '';
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
    '.price-karat-cell',
    '.live-price-cell',
    '[data-price-cell]',
  ];

  function isProtected(el) {
    if (!el || !el.closest) return false;
    for (const sel of PROTECTED_SELECTORS) {
      try { if (el.closest(sel)) return true; } catch (_) {}
    }
    return false;
  }

  function isProtectedText(text) {
    if (!text) return true;
    const t = String(text).trim();
    if (t.length <= 4) return true;
    if (/^\s*[\d.,\-+]+\s*$/.test(t)) return true;
    if (/^(14K|18K|21K|22K|24K)$/.test(t)) return true;
    if (/^(\d{1,3})K?$/.test(t)) return true;
    if (/^[Kk\s\-]+$/.test(t)) return true;
    if (!/[\u0600-\u06FFa-zA-Z]/.test(t)) return true;
    if (/^[\d.]+K?$/.test(t)) return true;
    return false;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §5 · CLEANING PATTERNS — v2.5
     ═════════════════════════════════════════════════════════════════════
     ✅ يعالج "بندق 24K" و "بندق 18K" و "بندق 21K" — كلها
     ═════════════════════════════════════════════════════════════════════ */
  const CLEAN_PATTERNS = [
    /* أولاً: استبدال العيار داخل "بندق X" بالعيار النشط */
    { re: /بندق\s+24K/gi, rep: () => `بندق ${getBaseLabel()}` },
    { re: /بندق\s+21K/gi, rep: () => `بندق ${getBaseLabel()}` },
    { re: /بندق\s+18K/gi, rep: () => `بندق ${getBaseLabel()}` },

    /* ثانياً: مع أقواس */
    { re: /\(\s*بندق\s+(24K|21K|18K)\s*\)/gi, rep: () => `(بندق ${getBaseLabel()})` },

    /* ثالثاً: بندق + رقم */
    { re: /بندق\s+(\d{2})\b/gi, rep: () => `بندق ${getBaseLabel()}` },

    /* رابعاً: "البندق X" */
    { re: /البندق\s+(24K|21K|18K)/gi, rep: () => `العيار ${getBaseLabel()}` },

    /* خامساً: أنماط مركّبة */
    { re: /بندق\s+جملة\s+مُباع/gi, rep: 'جملة مُباعة' },
    { re: /بندق\s+جملة/gi, rep: 'جملة' },
    { re: /جم\s+بندق\s+(24K|21K|18K)/gi, rep: () => `جم ${getBaseLabel()}` },
    { re: /جم\s+بندق/gi, rep: 'جم' },
    { re: /البندق\s+الفلتر/gi, rep: 'العيار المفلتر' },
    { re: /البندق\s+المُفلتر/gi, rep: 'العيار المُفلتر' },
    { re: /البندق\b/gi, rep: 'العيار' },
    { re: /\s+بندق\s+/gi, rep: ' ' },
    { re: /^بندق\s+/gi, rep: '' },
    { re: /\s+بندق$/gi, rep: '' },

    /* تنظيف */
    { re: /\(\s*\)/g, rep: '' },
    { re: /\s{2,}/g, rep: ' ' },
    { re: /\s+\(/g, rep: ' (' },
    { re: /\)\s+/g, rep: ') ' },
    { re: /\(\s+/g, rep: '(' },
    { re: /\s+\)/g, rep: ')' },

    /* إزالة التكرار */
    { re: /(18K|21K|24K)\s*\(\s*\1\s*\)/g, rep: '$1' },
  ];

  function cleanText(text) {
    if (!text) return text;
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
     §6 · NUMBER HELPERS
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
     §7 · 🆕 v2.5: CONVERT NUMBERS — قوي بجد
     ═════════════════════════════════════════════════════════════════════ */
  function convertNumbersInDOM(root) {
    if (!root) return 0;
    if (isSkippedRoute()) return 0;

    const baseKarat = getBaseKarat();
    let changed = 0;

    /* ─── 1 · [data-karat-value] ─── */
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

    /* ─── 2 · .kpi-value داخل .kpi ─── */
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

        /* ✅ نوسّع النطاق: أي KPI فيه "خزنة", "ذهب", "جم", "موردين", "بندق", "18K", "21K", "24K" */
        const isGoldKPI = /ذهب|خزنة|جم|موردين|بندق|18K|21K|24K/i.test(labelText);

        if (!isGoldKPI) return;

        /* ✅ نتحقق: هل القيمة مخزنة كأصلية؟ */
        let origValue = parseFloat(el.dataset.karatOriginal);

        /* ✅ لو ما فيش قيمة أصلية محفوظة → نخزّن الحالية كأصلية */
        if (!isFinite(origValue)) {
          origValue = value;
          el.dataset.karatOriginal = String(origValue);
        }

        /* ✅ نحوّل من الأصلية دايماً — يمنع التحويل المزدوج */
        const converted = toBase(origValue);

        /* نحافظ على HTML الداخلي */
        const innerHTML = el.innerHTML;
        const smallMatch = innerHTML.match(/<small[^>]*>.*?<\/small>/i);
        const smallHTML = smallMatch ? smallMatch[0] : '';

        const formatted = formatLike(converted, origText);
        const newHTML = formatted + (smallHTML ? ' ' + smallHTML : '');

        if (el.innerHTML !== newHTML) {
          el.innerHTML = newHTML;
          changed++;
        }
      } catch (_) {}
    });

    /* ─── 3 · 🆕 v2.5: KPI أخرى فيه أرقام ذهب بدون label واضح ─── */
    /* مثال: بعض البطاقات ممكن تكون قيمها داخل .kpi-value مباشرة أو .cl-row .v */
    root.querySelectorAll('.cl-row .v, .stat-value, .metric-value').forEach(el => {
      try {
        if (isProtected(el)) return;
        if (el.dataset.karatOriginal) return; /* Already processed */

        const origText = el.textContent;
        const value = parseNumber(origText);

        /* نتجاهل القيم الصغيرة جداً (ممكن تكون نسب مئوية) */
        if (value < 1 || value > 1000000) return;

        /* هل العنصر داخل سياق ذهب؟ */
        const container = el.closest('.cl-row') || el.closest('.card') || el.parentElement;
        if (!container) return;

        const contextText = container.textContent || '';

        /* فقط لو فيه إشارة لذهب أو عيار */
        const isGoldContext = /بندق|ذهب|خزنة|18K|21K|24K/i.test(contextText);

        /* لكن لازم نتجنب: أسعار (فيها ج.م), تواريخ, إلخ */
        const isPrice = /ج\.م|جنيه|EGP/i.test(contextText);
        const isPercentage = /%|نسبة|نقاء/i.test(contextText);

        if (!isGoldContext || isPrice || isPercentage) return;

        el.dataset.karatOriginal = String(value);
        const converted = toBase(value);

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
     §8 · CHARTS
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
          if (ds.label && !isProtectedText(ds.label)) {
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
     §9 · TEXT PROCESSING
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
            if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
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
     §10 · 🆕 v2.5: MAIN REFRESH — ذكي
     ═════════════════════════════════════════════════════════════════════ */
  function refresh(opts = {}) {
    const { force = true } = opts;  /* ✅ v2.5: default = true */

    if (isSkippedRoute()) {
      State._lastKarat = getBaseKarat();
      State._lastRoute = GMS.Router?.currentId?.() || 'settings';
      return 0;
    }

    const current = getBaseKarat();
    const route = GMS.Router?.currentId?.() || 'unknown';

    /* 🆕 v2.5: نستخدم hash المحتوى — لو المحتوى تغير، نعالج */
    const hash = domHash();

    if (!force
        && State._lastKarat === current
        && State._lastRoute === route
        && State._lastDOMHash === hash) {
      return 0;
    }

    State._lastKarat = current;
    State._lastRoute = route;
    State._lastDOMHash = hash;
    State._refreshCount++;
    State._lastRefreshAt = new Date().toISOString();
    State.processedNodes = new WeakSet();

    const page = document.getElementById('page') || document.body;

    const textCount = processElement(page);
    const numCount = convertNumbersInDOM(page);
    const chartCount = convertChartData();

    const total = textCount + numCount + chartCount;

    if (total > 0) {
      console.log(
        `%c✨ BaseKarat UI v2.5: ${textCount} texts, ${numCount} numbers, ${chartCount} charts (route: ${route}, karat: ${current}K)`,
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
     §11 · OBSERVER
     ═════════════════════════════════════════════════════════════════════ */
  function startObserver() {
    if (State.observer) return;

    const target = document.getElementById('page');
    if (!target) {
      setTimeout(startObserver, 300);
      return;
    }

    State.observer = new MutationObserver((mutations) => {
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

    console.log('[BaseKaratUI v2.5] 👁️  Observer started');
  }

  function stopObserver() {
    if (State.observer) {
      State.observer.disconnect();
      State.observer = null;
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §12 · 🆕 v2.5: WATCHDOG — يفحص كل 800ms أول 15 ثانية
     ═════════════════════════════════════════════════════════════════════
     هذا هو الإصلاح الرئيسي: يضمن أن الصفحة تُعالج حتى لو ما فيش
     mutation event (مثل عند Hard Reload مع router sync)
     ═════════════════════════════════════════════════════════════════════ */
  function startWatchdog() {
    let ticks = 0;
    const interval = setInterval(() => {
      ticks++;

      /* نتوقف بعد 30 ثانية */
      if (ticks > 40) {
        clearInterval(interval);
        return;
      }

      if (isSkippedRoute()) return;

      try {
        /* نحسب hash — لو تغيّر، نعالج */
        const hash = domHash();
        const current = getBaseKarat();

        if (hash && hash !== State._lastDOMHash) {
          refresh({ force: true });
        }
        /* لو العيار تغيّر */
        else if (current !== State._lastKarat) {
          refresh({ force: true });
        }
        /* أول 8 ثواني — نعيد المحاولة دايماً */
        else if (ticks <= 10) {
          refresh({ force: true });
        }
      } catch (_) {}
    }, 800);

    State.unsubscribers.push(() => clearInterval(interval));
  }

  /* ═════════════════════════════════════════════════════════════════════
     §13 · HOOKS
     ═════════════════════════════════════════════════════════════════════ */
  function hookRouter() {
    if (!GMS.Router) {
      setTimeout(hookRouter, 300);
      return;
    }
    if (GMS.Router._baseKaratUIHookedV25) return;
    GMS.Router._baseKaratUIHookedV25 = true;

    try {
      const unsub = GMS.Router.on('afterNavigate', (data) => {
        const route = data?.to || GMS.Router.currentId?.();
        console.log(`[BaseKaratUI v2.5] 🧭 Navigated to: ${route}`);

        if (SKIP_ROUTES.includes(route)) {
          State._lastRoute = route;
          return;
        }

        /* 🆕 v2.5: نستدعي refresh فوراً + بعد 400ms */
        setTimeout(() => refresh({ force: true }), 50);
        setTimeout(() => refresh({ force: true }), 400);
        setTimeout(() => refresh({ force: true }), 1200);
      });
      State.unsubscribers.push(unsub);
    } catch (_) {}
  }

  function hookBaseKarat() {
    if (!GMS.BaseKarat) {
      setTimeout(hookBaseKarat, 300);
      return;
    }
    if (State.unsubscribers.some(fn => fn._bkUIV25)) return;

    try {
      const unsub = GMS.BaseKarat.on((payload) => {
        console.log(`[BaseKaratUI v2.5] 🔄 Karat → ${payload.current}K`);
        if (isSkippedRoute()) return;

        /* 🆕 نعمل refresh فوراً */
        setTimeout(() => refresh({ force: true }), 100);
        setTimeout(() => refresh({ force: true }), 500);
      });
      unsub._bkUIV25 = true;
      State.unsubscribers.push(unsub);
    } catch (_) {}

    window.addEventListener('gms:baseKaratChanged', () => {
      if (isSkippedRoute()) return;
      scheduleRefresh(200);
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §14 · INIT / DESTROY
     ═════════════════════════════════════════════════════════════════════ */
  function init() {
    if (State.installed) return;

    console.log(
      '%c🏷️  BaseKarat UI v2.5 (Hard Reload FIX) initializing…',
      'color:#a55a00;font-weight:800;font-size:12px;'
    );

    hookRouter();
    hookBaseKarat();
    startObserver();
    startWatchdog();

    /* ✅ v2.5: نستدعي refresh عدة مرات بعد init */
    setTimeout(() => refresh({ force: true }), 500);
    setTimeout(() => refresh({ force: true }), 1000);
    setTimeout(() => refresh({ force: true }), 2000);
    setTimeout(() => refresh({ force: true }), 3500);

    State.installed = true;

    console.log(
      `%c✅ BaseKarat UI v2.5 ready — following ${getBaseLabel()}`,
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
     §16 · AUTO-INIT — 🆕 v2.5: أسرع
     ═════════════════════════════════════════════════════════════════════ */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 500));
  } else {
    setTimeout(init, 500);
  }

  console.log(
    '%c🏷️  BaseKarat UI v2.5 loaded · Hard Reload FIX',
    'color:#a55a00;font-weight:900;font-size:13px;padding:2px 6px;' +
    'background:linear-gradient(135deg,#f0d68c,#9c7726);border-radius:4px;'
  );

})();
