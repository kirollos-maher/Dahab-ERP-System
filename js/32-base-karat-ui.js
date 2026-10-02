/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ENTERPRISE — js/32-base-karat-ui.js
   ربط واجهات النظام بعيار الأساس — v2.1 (بدون كلمة "بندق")
   ═══════════════════════════════════════════════════════════════════════
   ✅ v2.1 المزايا الجديدة:
     • إزالة كلمة "بندق" من كل الموقع
     • استبدال "بندق 18K" → "18K"
     • استبدال "البندق 18K" → "العيار 18K"
     • استبدال "بندق جملة مُباع" → "جملة مُباعة"
     • استبدال "جم بندق" → "جم"
     • تنظيف الأقواس المكررة
     • التحويل الرياضي للأرقام (محفوظ من v2.0)

   Public API:
     GMS.BaseKaratUI.refresh()   → تحديث يدوي
     GMS.BaseKaratUI.cleanText(t) → تنظيف نص واحد
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
    _refreshCount: 0,
  };

  /* ═════════════════════════════════════════════════════════════════════
     §2 · HELPERS
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
     §3 · CLEANING PATTERNS — v2.1 (إزالة "بندق")
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * ترتيب المهم: الأنماط الأكثر تحديداً أولاً
   * كل نمط: {re: regex, rep: string | function}
   */
  const CLEAN_PATTERNS = [
    /* ─── إزالة "بندق" في العناوين المركّبة ─── */

    /* "بندق جملة مُباع (X)" → "جملة مُباعة (X)" */
    { re: /بندق\s+جملة\s+مُباع/gi, rep: 'جملة مُباعة' },

    /* "بندق جملة" → "جملة" */
    { re: /بندق\s+جملة/gi, rep: 'جملة' },

    /* "رصيد الذهب (بندق 18K)" → "رصيد الذهب (18K)" */
    { re: /\(بندق\s+(18K|21K|24K)\)/gi, rep: '($1)' },

    /* "رصيد الذهب (بندق 24)" → "رصيد الذهب (24K)" */
    { re: /\(بندق\s+(\d{2})\)/gi, rep: '($1K)' },

    /* "جم بندق 18K" → "جم 18K" */
    { re: /جم\s+بندق\s+(18K|21K|24K)/gi, rep: 'جم $1' },

    /* "جم بندق" → "جم" */
    { re: /جم\s+بندق/gi, rep: 'جم' },

    /* "البندق 18K" → "العيار 18K" */
    { re: /البندق\s+(18K|21K|24K)/gi, rep: 'العيار $1' },

    /* "البندق المفلتر" → "العيار المفلتر" */
    { re: /البندق\s+الفلتر/gi, rep: 'العيار المفلتر' },
    { re: /البندق\s+المُفلتر/gi, rep: 'العيار المُفلتر' },
    { re: /البندق\s+المفلترة/gi, rep: 'العيار المُفلترة' },

    /* "البندق" وحده → "العيار" */
    { re: /البندق\b/gi, rep: 'العيار' },

    /* "بندق 18K" → "18K" */
    { re: /بندق\s+(18K|21K|24K)/gi, rep: '$1' },

    /* "بندق 24" → "24K" */
    { re: /بندق\s+(\d{2})\b/gi, rep: '$1K' },

    /* "بندق" في أي مكان → حذف + مسافة نظيفة */
    { re: /\s+بندق\s+/gi, rep: ' ' },
    { re: /^بندق\s+/gi, rep: '' },
    { re: /\s+بندق$/gi, rep: '' },
    { re: /بندق/gi, rep: '' },

    /* ─── تنظيف المسافات الزائدة ─── */
    { re: /\s{2,}/g, rep: ' ' },
    { re: /\s+\(/g, rep: ' (' },
    { re: /\)\s+/g, rep: ') ' },
    { re: /\(\s+/g, rep: '(' },
    { re: /\s+\)/g, rep: ')' },

    /* ─── إزالة التكرار: "18K (18K)" → "18K" ─── */
    { re: /(18K|21K|24K)\s*\(\s*\1\s*\)/g, rep: '$1' },
    { re: /\(18K\)\s*\(18K\)/g, rep: '18K' },
    { re: /\(21K\)\s*\(21K\)/g, rep: '21K' },
    { re: /\(24K\)\s*\(24K\)/g, rep: '24K' },

    /* "18K 18K" → "18K" */
    { re: /(18K|21K|24K)\s+(18K|21K|24K)/g, rep: (m, a, b) => a === b ? a : m },

    /* ─── تنظيف أقواس فارغة ─── */
    { re: /\(\s*\)/g, rep: '' },
    { re: /\[\s*\]/g, rep: '' },
  ];

  function cleanText(text) {
    if (!text) return text;
    let out = String(text);
    for (const p of CLEAN_PATTERNS) {
      p.re.lastIndex = 0;
      out = out.replace(p.re, p.rep);
    }
    /* trim أخير */
    out = out.replace(/\s{2,}/g, ' ').trim();
    return out;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §4 · NUMBER CONVERSION
     ═════════════════════════════════════════════════════════════════════ */
  function parseNumber(text) {
    if (!text) return 0;
    const cleaned = String(text)
      .replace(/,/g, '')
      .replace(/[^\d.\-]/g, '');
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
     §5 · CONVERT KPI VALUES
     ═════════════════════════════════════════════════════════════════════ */
  function convertNumbersInDOM(root) {
    if (!root) return 0;
    let changed = 0;

    root.querySelectorAll('[data-karat-value]').forEach(el => {
      try {
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
        if (el.dataset.karatConverted === '1') return;

        const origText = el.textContent;
        const value = parseNumber(origText);

        if (value === 0) return;

        const parent = el.closest('.kpi');
        if (!parent) return;

        const labelEl = parent.querySelector('.kpi-label');
        if (!labelEl) return;

        const labelText = labelEl.textContent || '';
        const isGoldKPI = /ذهب|خزنة|18K|21K|24K/i.test(labelText);

        if (!isGoldKPI) return;

        const converted = toBase(value);
        el.dataset.karatOriginal = String(value);
        el.dataset.karatConverted = '1';

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
     §6 · CHART DATA
     ═════════════════════════════════════════════════════════════════════ */
  function convertChartData() {
    try {
      const charts = GMS.Views?.dashboard?.state?.charts;
      if (!charts) return 0;

      let changed = 0;

      Object.entries(charts).forEach(([key, chart]) => {
        if (!chart || !chart.data || !chart.data.datasets) return;

        let chartChanged = false;

        chart.data.datasets.forEach(ds => {
          if (ds.label) {
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
     §7 · TEXT PROCESSING
     ═════════════════════════════════════════════════════════════════════ */
  function processTextNode(node) {
    if (!node || !node.nodeValue) return false;

    const original = node.nodeValue;
    const cleaned = cleanText(original);

    if (cleaned !== original) {
      node.nodeValue = cleaned;
      return true;
    }
    return false;
  }

  function processElement(root) {
    if (!root) return 0;
    if (root.nodeType === 3) return processTextNode(root) ? 1 : 0;

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
     §8 · MAIN REFRESH
     ═════════════════════════════════════════════════════════════════════ */
  function refresh(opts = {}) {
    const { force = false } = opts;
    const current = getBaseKarat();

    if (!force && State._lastKarat === current) return 0;

    State._lastKarat = current;
    State._refreshCount++;
    State.processedNodes = new WeakSet();

    const page = document.getElementById('page') || document.body;

    const textCount = processElement(page);
    const numCount = convertNumbersInDOM(page);
    const chartCount = convertChartData();

    const total = textCount + numCount + chartCount;

    if (total > 0) {
      console.log(
        `%c✨ BaseKarat UI v2.1: ${textCount} texts, ${numCount} numbers, ${chartCount} charts cleaned`,
        'color:#0f7a43;font-weight:700;font-size:11px;'
      );
    }

    return total;
  }

  function scheduleRefresh(delay = 300) {
    if (State.pendingRefresh) clearTimeout(State.pendingRefresh);
    State.pendingRefresh = setTimeout(() => {
      State.pendingRefresh = null;
      refresh({ force: true });
    }, delay);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §9 · OBSERVER
     ═════════════════════════════════════════════════════════════════════ */
  function startObserver() {
    if (State.observer) return;

    const target = document.getElementById('page');
    if (!target) {
      setTimeout(startObserver, 300);
      return;
    }

    State.observer = new MutationObserver((mutations) => {
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

    console.log('[BaseKaratUI v2.1] 👁️  Observer started');
  }

  function stopObserver() {
    if (State.observer) {
      State.observer.disconnect();
      State.observer = null;
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §10 · HOOKS
     ═════════════════════════════════════════════════════════════════════ */
  function hookRouter() {
    if (!GMS.Router) {
      setTimeout(hookRouter, 300);
      return;
    }
    if (GMS.Router._baseKaratUIHookedV21) return;
    GMS.Router._baseKaratUIHookedV21 = true;

    try {
      const unsub = GMS.Router.on('afterNavigate', () => {
        setTimeout(() => refresh({ force: true }), 400);
      });
      State.unsubscribers.push(unsub);
    } catch (_) {}
  }

  function hookBaseKarat() {
    if (!GMS.BaseKarat) {
      setTimeout(hookBaseKarat, 300);
      return;
    }
    if (State.unsubscribers.some(fn => fn._bkUIV21)) return;

    try {
      const unsub = GMS.BaseKarat.on((payload) => {
        console.log(`[BaseKaratUI v2.1] 🔄 Karat → ${payload.current}K`);
        setTimeout(() => refresh({ force: true }), 500);
      });
      unsub._bkUIV21 = true;
      State.unsubscribers.push(unsub);
    } catch (_) {}

    window.addEventListener('gms:baseKaratChanged', () => {
      scheduleRefresh(400);
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §11 · INIT / DESTROY
     ═════════════════════════════════════════════════════════════════════ */
  function init() {
    if (State.installed) return;

    console.log(
      '%c🏷️  BaseKarat UI v2.1 (No "بندق") initializing…',
      'color:#a55a00;font-weight:800;font-size:12px;'
    );

    hookRouter();
    hookBaseKarat();
    startObserver();

    setTimeout(() => refresh({ force: true }), 1000);
    setTimeout(() => refresh({ force: true }), 3000);

    setInterval(() => {
      try {
        const current = getBaseKarat();
        if (State._lastKarat !== current) {
          refresh({ force: true });
        }
      } catch (_) {}
    }, 10000);

    State.installed = true;

    console.log(
      `%c✅ BaseKarat UI v2.1 ready — no "بندق", following ${getBaseLabel()}`,
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
     §12 · EXPORT
     ═════════════════════════════════════════════════════════════════════ */
  GMS.BaseKaratUI = {
    init,
    destroy,
    refresh,
    scheduleRefresh,
    state: State,
    cleanText,
    parseNumber,
    formatLike,
    toBase,
  };

  window.BaseKaratUI = GMS.BaseKaratUI;

  /* ═════════════════════════════════════════════════════════════════════
     §13 · AUTO-INIT
     ═════════════════════════════════════════════════════════════════════ */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 1500));
  } else {
    setTimeout(init, 1500);
  }

  console.log(
    '%c🏷️  BaseKarat UI v2.1 loaded · No "بندق" · Numbers + Labels + Charts',
    'color:#a55a00;font-weight:900;font-size:13px;padding:2px 6px;' +
    'background:linear-gradient(135deg,#f0d68c,#9c7726);border-radius:4px;'
  );

})();
