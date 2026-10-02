/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ENTERPRISE — js/32-base-karat-ui.js
   ربط واجهات النظام بعيار الأساس — v2.0 (Numbers + Labels)
   ═══════════════════════════════════════════════════════════════════════
   ✅ v2.0 المزايا الجديدة:
     • تحويل الأرقام الفعلية (وليس فقط التسميات)
     • مراقبة كل KPI card ويستبدل القيمة المحوّلة
     • إزالة تكرار الـ labels (18K (18K) → 18K)
     • يعمل على كل الصفحات: Dashboard, Inventory, POS, Suppliers,
       Returns, Loss, Wholesale, B2B
     • يحافظ على القيم الأصلية في الـ state (لا يُفسد البيانات)

   كيف يعمل:
     1. يخزّن القيم الأصلية (بندق 24K) في data-original-value
     2. عند تغيير العيار، يقرأ الأصلي ويحوّله للعيار الجديد
     3. يكتب القيمة المحوّلة في الـ DOM
     4. عند التكرار، يعيد التحويل من الأصل (آمن)
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
    /* يحوّل من بندق 24K إلى العيار النشط */
    const w = parseFloat(weight);
    if (!isFinite(w) || w === 0) return 0;
    try {
      if (GMS.BaseKarat?.fromPure) {
        return GMS.BaseKarat.fromPure(w, getBaseKarat());
      }
      /* fallback: manual conversion */
      const ratio = GMS.BaseKarat?.ratio || 1;
      return w / ratio;
    } catch (_) {
      return w;
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §3 · TEXT PATTERNS — تنظيف وتوحيد
     ═════════════════════════════════════════════════════════════════════ */
  const LABEL_PATTERNS = [
    /* 24K → baseLabel */
    { re: /بندق\s+24\s*K/gi, rep: () => `بندق ${getBaseLabel()}` },
    { re: /\(بندق\s+24\s*K\)/gi, rep: () => `(بندق ${getBaseLabel()})` },
    { re: /البندق\s+24\s*K/g, rep: () => `البندق ${getBaseLabel()}` },

    /* Cleanup: منع التكرار مثل "18K (18K)" */
    { re: /(18K|21K|24K)\s*\(\s*\1\s*\)/g, rep: (_, k) => k },
    { re: /\(18K\)\s*\(18K\)/g, rep: '18K' },
    { re: /\(21K\)\s*\(21K\)/g, rep: '21K' },
    { re: /\(24K\)\s*\(24K\)/g, rep: '24K' },
    /* حالات أخرى */
    { re: /(18K|21K|24K)\s+\((18K|21K|24K)\)/g,
      rep: (_, a, b) => a },  /* نأخذ الأول دائمًا */
  ];

  function cleanText(text) {
    if (!text) return text;
    let out = text;
    for (const p of LABEL_PATTERNS) {
      p.re.lastIndex = 0;
      if (typeof p.rep === 'function') {
        out = out.replace(p.re, p.rep);
      } else {
        out = out.replace(p.re, p.rep);
      }
    }
    return out;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §4 · NUMBER CONVERSION — العنصر الأساسي
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * يقرأ قيمة رقمية من نص (يستخرج الأرقام فقط)
   * @param {string} text
   * @returns {number}
   */
  function parseNumber(text) {
    if (!text) return 0;
    const cleaned = String(text)
      .replace(/,/g, '')          /* فاصلة الآلاف */
      .replace(/[^\d.\-]/g, '');  /* احتفظ بالأرقام والعلامات */
    const n = parseFloat(cleaned);
    return isFinite(n) ? n : 0;
  }

  /**
   * يُنسّق رقم بنفس نمط الأصلي
   */
  function formatLike(value, originalText) {
    const v = Number(value);
    if (!isFinite(v)) return String(originalText);

    /* هل الأصلي عنده فواصل آلاف؟ */
    const hasThousands = /,/.test(originalText);

    /* عدد الفواصل العشرية في الأصلي */
    const match = String(originalText).match(/\.(\d+)/);
    const decimals = match ? match[1].length : 0;

    /* اختر الفاصلة */
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

  /**
   * يبحث عن كل عناصر KPI وحدود الذهب في الصفحة، ويحوّل الأرقام
   * يستخدم data-original-labels لتخزين القيم الأصلية
   */
  function convertNumbersInDOM(root) {
    if (!root) return 0;

    const baseKarat = getBaseKarat();
    let changed = 0;

    /* ─── 1 · العناصر التي تحمل data-karat-value ─── */
    root.querySelectorAll('[data-karat-value]').forEach(el => {
      try {
        /* القيمة الأصلية (بندق 24K) مخزنة في data-attribute */
        let origValue = parseFloat(el.dataset.karatValue);
        if (!isFinite(origValue)) {
          /* أول مرة: نأخذ النص الحالي كقيمة أصلية */
          origValue = parseNumber(el.textContent);
          el.dataset.karatValue = String(origValue);
        }

        /* نحوّل للعيار النشط */
        const converted = toBase(origValue);
        const newText = formatLike(converted, el.textContent);

        if (el.textContent.trim() !== newText) {
          el.textContent = newText;
          changed++;
        }
      } catch (e) {
        /* تجاهل */
      }
    });

    /* ─── 2 · KPI cards العامة ─── */
    /* KPI elements لها .kpi-value داخلها */
    root.querySelectorAll('.kpi-value').forEach(el => {
      try {
        if (el.dataset.karatConverted === '1') return;

        const origText = el.textContent;
        const value = parseNumber(origText);

        if (value === 0) return;

        /* هل العنصر يحتوي على label ذهب في نفس البطاقة؟ */
        const parent = el.closest('.kpi');
        if (!parent) return;

        const labelEl = parent.querySelector('.kpi-label');
        if (!labelEl) return;

        const labelText = labelEl.textContent || '';

        /* هل البطاقة عن ذهب؟ */
        const isGoldKPI = /بندق|ذهب|خزنة|24K|18K|21K/i.test(labelText);

        if (!isGoldKPI) return;

        /* نحول الرقم */
        const converted = toBase(value);
        el.dataset.karatOriginal = String(value);
        el.dataset.karatConverted = '1';

        /* نحافظ على HTML الداخلي (small tags) */
        const innerHTML = el.innerHTML;
        const smallMatch = innerHTML.match(/<small[^>]*>.*?<\/small>/i);
        const smallHTML = smallMatch ? smallMatch[0] : '';

        const formatted = formatLike(converted, origText);
        el.innerHTML = formatted + (smallHTML ? ' ' + smallHTML : '');

        changed++;
      } catch (e) {
        /* تجاهل */
      }
    });

    return changed;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §6 · CONVERT CHART DATA
     ═════════════════════════════════════════════════════════════════════ */

  function convertChartData() {
    try {
      const charts = GMS.Views?.dashboard?.state?.charts;
      if (!charts) return 0;

      let changed = 0;
      const baseKarat = getBaseKarat();
      const baseLabel = getBaseLabel();

      Object.entries(charts).forEach(([key, chart]) => {
        if (!chart || !chart.data || !chart.data.datasets) return;

        chart.data.datasets.forEach(ds => {
          /* استبدال "24K" في التسميات */
          if (ds.label) {
            const newLabel = ds.label
              .replace(/بندق\s+24\s*K/gi, `بندق ${baseLabel}`)
              .replace(/\(24K\)/g, `(${baseLabel})`);
            if (ds.label !== newLabel) {
              ds.label = newLabel;
              changed++;
            }
          }

          /* لا نحوّل data مباشرة (يُفسد المخططات التاريخية) */
        });

        if (changed > 0) {
          try { chart.update('none'); } catch (_) {}
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
    if (root.nodeType === 3) {
      return processTextNode(root) ? 1 : 0;
    }

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

    /* 1 · تنظيف النصوص (إزالة تكرار الـ labels + تحديث labels) */
    const textCount = processElement(page);

    /* 2 · تحويل الأرقام في KPI cards */
    const numCount = convertNumbersInDOM(page);

    /* 3 · تحويل chart labels */
    const chartCount = convertChartData();

    const total = textCount + numCount + chartCount;

    if (total > 0) {
      console.log(
        `%c🏷️  BaseKarat UI v2: ${textCount} texts, ${numCount} numbers, ${chartCount} charts → ${getBaseLabel()}`,
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
     §9 · MUTATION OBSERVER
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

    console.log('[BaseKaratUI v2] 👁️  Observer started');
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

    if (GMS.Router._baseKaratUIHookedV2) return;
    GMS.Router._baseKaratUIHookedV2 = true;

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

    if (State.unsubscribers.some(fn => fn._bkUIV2)) return;

    try {
      const unsub = GMS.BaseKarat.on((payload) => {
        console.log(`[BaseKaratUI v2] 🔄 Karat changed to ${payload.current}K`);
        setTimeout(() => refresh({ force: true }), 500);
      });
      unsub._bkUIV2 = true;
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
      '%c🏷️  BaseKarat UI v2 (Numbers + Labels) initializing…',
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
      `%c✅ BaseKarat UI v2 ready — following ${getBaseLabel()}`,
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

    /* utils */
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
    '%c🏷️  BaseKarat UI v2.0 loaded · Numbers + Labels + Chart sync',
    'color:#a55a00;font-weight:900;font-size:13px;padding:2px 6px;' +
    'background:linear-gradient(135deg,#f0d68c,#9c7726);border-radius:4px;'
  );

})();
