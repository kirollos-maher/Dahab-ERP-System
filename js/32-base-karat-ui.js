/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ENTERPRISE — js/32-base-karat-ui.js
   Base Karat UI — v2.2 (Full Label Cleanup)
   ─────────────────────────────────────────────────────────────────────
   ✅ v2.2 الإصلاحات:
     • يعالج أي ذكر لـ "24K" / "21K" / "18K" منفردًا ويستبدله بعيار الأساس
     • يحافظ على "18K" لو هو العيار المختار (يخليها ثابتة)
     • يستهدف عناصر .kpi-label و .card-sub و [data-i18n] مباشرة
     • يغطي I18n labels القادمة من GMS.t()
     • يعيد المعالجة عند كل تغيير عيار
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
     §3 · CLEANING PATTERNS — v2.2
     ═════════════════════════════════════════════════════════════════════
     الترتيب مهم — الأكثر تحديدًا أولًا
     ═════════════════════════════════════════════════════════════════════ */
  const CLEAN_PATTERNS = [
    /* ─── الجزء 1: إزالة "بندق" مع أي عيار ─── */

    /* "(بندق 18K)" → "(18K)" */
    { re: /\(\s*بندق\s+(18K|21K|24K)\s*\)/gi, rep: '($1)' },

    /* "(بندق 24)" → "(24K)" */
    { re: /\(\s*بندق\s+(\d{2})\s*\)/gi, rep: '($1K)' },

    /* "بندق 18K" → "18K" */
    { re: /بندق\s+(18K|21K|24K)/gi, rep: '$1' },

    /* "بندق 24" → "24K" */
    { re: /بندق\s+(\d{2})\b/gi, rep: '$1K' },

    /* "البندق 18K" → "العيار 18K" */
    { re: /البندق\s+(18K|21K|24K)/gi, rep: 'العيار $1' },

    /* ─── الجزء 2: تنظيف مركّبات "بندق" ─── */

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
    { re: /بندق/gi, rep: '' },

    /* ─── الجزء 3: استبدال أي "24K" بالعيار النشط (الأهم!) ─── */

    /* "(24K)" → "(18K)" */
    { re: /\(\s*24K\s*\)/g, rep: () => `(${getBaseLabel()})` },
    /* "(21K)" → "(18K)" */
    { re: /\(\s*21K\s*\)/g, rep: () => `(${getBaseLabel()})` },
    /* "(18K)" → "(18K)" — يبقى كما هو لو الأساس 18 */
    /* لا نكتب قاعدة لـ 18K لأنه قد يكون هو الهدف */

    /* "24K" و "21K" واقفين لوحدهم (مش جوه قوسين) */
    { re: /\b24K\b/g, rep: () => getBaseLabel() },
    { re: /\b21K\b/g, rep: () => getBaseLabel() },
    /* "18K" — نتركه لأنه قد يكون هو العيار الحالي */

    /* ─── الجزء 4: تنظيف المسافات والأقواس ─── */
    { re: /\(\s*\)/g, rep: '' },
    { re: /\[\s*\]/g, rep: '' },
    { re: /\s{2,}/g, rep: ' ' },
    { re: /\s+\(/g, rep: ' (' },
    { re: /\)\s+/g, rep: ') ' },
    { re: /\(\s+/g, rep: '(' },
    { re: /\s+\)/g, rep: ')' },

    /* ─── الجزء 5: إزالة تكرار العيار ─── */
    { re: /(18K|21K|24K)\s*\(\s*\1\s*\)/g, rep: '$1' },
    { re: /(18K|21K|24K)\s+(18K|21K|24K)/g, rep: (m, a, b) => a === b ? a : a },
  ];

  function cleanText(text) {
    if (!text) return text;
    let out = String(text);
    for (const p of CLEAN_PATTERNS) {
      p.re.lastIndex = 0;
      out = out.replace(p.re, p.rep);
    }
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
     §5 · DIRECT KPI LABEL FIX (v2.2 — الأهم)
     ═════════════════════════════════════════════════════════════════════
     يستهدف عناصر labels بطريقة محددة ومباشرة
     ═════════════════════════════════════════════════════════════════════ */
  function fixKPILabels(root) {
    if (!root) return 0;
    let changed = 0;

    /* كل عناصر label المحتملة */
    const labelSelectors = [
      '.kpi-label',
      '.card-sub',
      '.si-title',
      '.si-desc',
      '[data-i18n]',
      '.chip',
      '.pill',
      '.feed-title',
      '.calc-list .k',
      '.stmt-box .sb-k',
      'th',
      'label',
    ];

    labelSelectors.forEach(sel => {
      root.querySelectorAll(sel).forEach(el => {
        try {
          const original = el.textContent;
          if (!original) return;

          /* تخطي العناصر اللي فيها أرقام كتير (يقصد بها قيم) */
          if (/^\s*[\d.,\-+]+\s*$/.test(original)) return;

          const cleaned = cleanText(original);
          if (cleaned !== original) {
            /* نحافظ على أيقونات lucide -->
            /* نستبدل text فقط لو العنصر ما فيه عناصر داخلية */
            const hasChildElements = el.querySelector('svg, i, img');

            if (hasChildElements) {
              /* نحدّث النصوص داخل النودز مباشرة */
              el.childNodes.forEach(node => {
                if (node.nodeType === 3) {
                  const old = node.nodeValue;
                  const fixed = cleanText(old);
                  if (fixed !== old) {
                    node.nodeValue = fixed;
                    changed++;
                  }
                }
              });
            } else {
              el.textContent = cleaned;
              changed++;
            }
          }
        } catch (_) {}
      });
    });

    return changed;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §6 · CONVERT KPI VALUES
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

    /* KPI cards العامة */
    root.querySelectorAll('.kpi-value').forEach(el => {
      try {
        const origText = el.textContent;
        const value = parseNumber(origText);
        if (value === 0) return;

        const parent = el.closest('.kpi');
        if (!parent) return;

        const labelEl = parent.querySelector('.kpi-label');
        if (!labelEl) return;

        const labelText = labelEl.textContent || '';
        const isGoldKPI = /ذهب|خزنة|18K|21K|24K|جم/i.test(labelText);

        if (!isGoldKPI) return;

        /* نستخدم القيمة الأصلية المخزنة إن وجدت */
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
     §7 · CHART DATA
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
     §8 · TEXT PROCESSING
     ═════════════════════════════════════════════════════════════════════ */
  function processTextNode(node) {
    if (!node || !node.nodeValue) return false;

    const original = node.nodeValue;

    /* تجاهل النصوص اللي كلها أرقام */
    if (/^\s*[\d.,\-+]+\s*$/.test(original)) return false;

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
     §9 · MAIN REFRESH
     ═════════════════════════════════════════════════════════════════════ */
  function refresh(opts = {}) {
    const { force = false } = opts;
    const current = getBaseKarat();

    if (!force && State._lastKarat === current) return 0;

    State._lastKarat = current;
    State._refreshCount++;
    State.processedNodes = new WeakSet();

    const page = document.getElementById('page') || document.body;

    /* 1 · نصوص عامة */
    const textCount = processElement(page);

    /* 2 · labels محددة (KPIs, cards, tables) */
    const labelCount = fixKPILabels(page);

    /* 3 · الأرقام */
    const numCount = convertNumbersInDOM(page);

    /* 4 · المخططات */
    const chartCount = convertChartData();

    const total = textCount + labelCount + numCount + chartCount;

    if (total > 0) {
      console.log(
        `%c✨ BaseKarat UI v2.2: ${textCount}+${labelCount} labels, ${numCount} numbers, ${chartCount} charts`,
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
     §10 · OBSERVER
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

    console.log('[BaseKaratUI v2.2] 👁️  Observer started');
  }

  function stopObserver() {
    if (State.observer) {
      State.observer.disconnect();
      State.observer = null;
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §11 · HOOKS
     ═════════════════════════════════════════════════════════════════════ */
  function hookRouter() {
    if (!GMS.Router) {
      setTimeout(hookRouter, 300);
      return;
    }
    if (GMS.Router._baseKaratUIHookedV22) return;
    GMS.Router._baseKaratUIHookedV22 = true;

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
    if (State.unsubscribers.some(fn => fn._bkUIV22)) return;

    try {
      const unsub = GMS.BaseKarat.on((payload) => {
        console.log(`[BaseKaratUI v2.2] 🔄 Karat → ${payload.current}K`);
        setTimeout(() => refresh({ force: true }), 500);
      });
      unsub._bkUIV22 = true;
      State.unsubscribers.push(unsub);
    } catch (_) {}

    window.addEventListener('gms:baseKaratChanged', () => {
      scheduleRefresh(400);
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §12 · INIT / DESTROY
     ═════════════════════════════════════════════════════════════════════ */
  function init() {
    if (State.installed) return;

    console.log(
      '%c🏷️  BaseKarat UI v2.2 (Full Label Cleanup) initializing…',
      'color:#a55a00;font-weight:800;font-size:12px;'
    );

    hookRouter();
    hookBaseKarat();
    startObserver();

    setTimeout(() => refresh({ force: true }), 1000);
    setTimeout(() => refresh({ force: true }), 3000);
    setTimeout(() => refresh({ force: true }), 6000);

    setInterval(() => {
      try {
        const current = getBaseKarat();
        if (State._lastKarat !== current) {
          refresh({ force: true });
        }
      } catch (_) {}
    }, 8000);

    State.installed = true;

    console.log(
      `%c✅ BaseKarat UI v2.2 ready — following ${getBaseLabel()}`,
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
     §13 · EXPORT
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
     §14 · AUTO-INIT
     ═════════════════════════════════════════════════════════════════════ */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 1500));
  } else {
    setTimeout(init, 1500);
  }

  console.log(
    '%c🏷️  BaseKarat UI v2.2 loaded · Full Label Cleanup · No "بندق"',
    'color:#a55a00;font-weight:900;font-size:13px;padding:2px 6px;' +
    'background:linear-gradient(135deg,#f0d68c,#9c7726);border-radius:4px;'
  );

})();
