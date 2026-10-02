/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ENTERPRISE — js/33-price-egypt.js
   مصدر أسعار الذهب المصري المحلي — v1.1 (Improved Sources)
   ─────────────────────────────────────────────────────────────────────
   ✅ v1.1 — التحسينات:
     • استبدال allorigins.win (بطيء) بـ corsproxy.io (أسرع)
     • إضافة goldera.com كمصدر أول (بدون CORS)
     • تقليل timeout من 10s إلى 6s
     • 5 مصادر بدل 3
     • كشف مصادر CORS-disabled تلقائياً
     • Diagnostics أوضح

   الترتيب:
     1. Custom Endpoint (لك أنت)
     2. goldera.com → JSON مباشر (الأسرع)
     3. goldera.com → Scraper via corsproxy.io
     4. isagha.com → Scraper via corsproxy.io
     5. Fallback → Gold-API (عالمي)
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const GMS = window.GMS = window.GMS || {};

  /* ═════════════════════════════════════════════════════════════════════
     §1 · CONSTANTS
     ═════════════════════════════════════════════════════════════════════ */
  const STORAGE_KEYS = {
    CACHE:           'gms.price.egypt.cache',
    CACHE_TS:        'gms.price.egypt.cacheTs',
    CUSTOM_ENDPOINT: 'gms.price.egypt.customEndpoint',
    CALIBRATION:     'gms.price.egypt.calibration',
  };

  const CACHE_TTL_MS = 60 * 1000;

  const RATIOS = Object.freeze({
    24: 1.0000,
    22: 0.9167,
    21: 0.8750,
    18: 0.7500,
    14: 0.5833,
  });

  /* ✅ CORS Proxies (مرتبة حسب السرعة) */
  const CORS_PROXIES = [
    { name: 'corsproxy.io', url: 'https://corsproxy.io/?' },
    { name: 'cors.eu.org', url: 'https://cors.eu.org/' },
    { name: 'thingproxy', url: 'https://thingproxy.freeboard.io/fetch/' },
    { name: 'allorigins', url: 'https://api.allorigins.win/raw?url=' },
  ];

  /* ═════════════════════════════════════════════════════════════════════
     §2 · STATE
     ═════════════════════════════════════════════════════════════════════ */
  const State = {
    initialized: false,

    /* ✅ المصادر — v1.1 */
    sources: [
      {
        key: 'egypt_custom',
        name: 'مصدر مصري مخصص',
        priority: 1,
        enabled: false,
        endpoint: null,
        parser: 'json',
      },
      {
        key: 'goldera_api',
        name: 'Gold Era (API مباشر)',
        priority: 2,
        enabled: true,
        apiUrl: 'https://goldera.com/api/prices/egypt',
        parser: 'json',
        /* لا يحتاج proxy */
        directFetch: true,
      },
      {
        key: 'goldera_scrape',
        name: 'Gold Era (scraper)',
        priority: 3,
        enabled: true,
        scrapeUrl: 'https://goldera.com/ar/gold-prices-egypt',
        scrapePattern: /(?:24|عيار\s*24)[\s\S]{0,300}?(\d{3,5}(?:\.\d{1,2})?)/i,
        useProxy: true,
      },
      {
        key: 'isagha_scrape',
        name: 'iSagha (scraper)',
        priority: 4,
        enabled: true,
        scrapeUrl: 'https://isagha.com',
        scrapePattern: /(?:24|عيار\s*24)[\s\S]{0,300}?(\d{3,5}(?:\.\d{1,2})?)/i,
        useProxy: true,
      },
    ],

    cache: {
      price24: 0,
      price22: 0,
      price21: 0,
      price18: 0,
      price14: 0,
      source: null,
      sourceLabel: '',
      fetchedAt: null,
    },

    diagnostics: {
      lastAttempts: [],
      failCount: 0,
      successCount: 0,
      lastError: null,
      lastSuccess: null,
      customEndpoint: null,
      activeProxy: null,
      calibration: { offset: 0, calibratedAt: null, referencePrice: 0 },
    },

    originalSyncNow: null,
    listeners: new Set(),
  };

  /* ═════════════════════════════════════════════════════════════════════
     §3 · HELPERS
     ═════════════════════════════════════════════════════════════════════ */
  function round(v, d = 2) {
    if (GMS.round) return GMS.round(v, d);
    const p = Math.pow(10, d);
    return Math.round((Number(v) + Number.EPSILON) * p) / p;
  }

  function num(v, fallback = 0) {
    const n = Number(v);
    return isFinite(n) ? n : fallback;
  }

  async function fetchWithTimeout(url, timeoutMs = 6000, opts = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        cache: 'no-store',
        mode: 'cors',
        ...opts,
      });
      clearTimeout(timer);
      return response;
    } catch (e) {
      clearTimeout(timer);
      throw e;
    }
  }

  function getCurrentOffset() {
    try {
      if (GMS.PriceManager?.getOffset) {
        return num(GMS.PriceManager.getOffset(), 0);
      }
    } catch (_) {}
    return 0;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §4 · CACHE
     ═════════════════════════════════════════════════════════════════════ */
  function saveCache(data) {
    try {
      State.cache = {
        ...State.cache,
        ...data,
        fetchedAt: new Date().toISOString(),
      };
      localStorage.setItem(STORAGE_KEYS.CACHE, JSON.stringify(State.cache));
      localStorage.setItem(STORAGE_KEYS.CACHE_TS, String(Date.now()));
    } catch (_) {}
  }

  function loadCache() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.CACHE);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const ts = Number(localStorage.getItem(STORAGE_KEYS.CACHE_TS));
      if (!parsed || !ts) return null;
      if (Date.now() - ts > CACHE_TTL_MS * 10) return null;
      State.cache = { ...State.cache, ...parsed };
      return parsed;
    } catch (_) {
      return null;
    }
  }

  function isCacheFresh() {
    if (!State.cache.fetchedAt) return false;
    const age = Date.now() - new Date(State.cache.fetchedAt).getTime();
    return age < CACHE_TTL_MS;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §5 · PARSERS
     ═════════════════════════════════════════════════════════════════════ */
  function parseJsonResponse(data) {
    if (!data) return null;

    /* لو data جاي في مصفوفة أو object متداخل */
    if (Array.isArray(data)) {
      for (const item of data) {
        const r = parseJsonResponse(item);
        if (r) return r;
      }
      return null;
    }

    if (typeof data === 'object' && data.data) {
      const r = parseJsonResponse(data.data);
      if (r) return r;
    }

    const price24 =
      num(data.price_24) ||
      num(data.price24) ||
      num(data.gold_24) ||
      num(data.gold24) ||
      num(data.gold_21) * (1 / RATIOS[21]) ||
      num(data.price_21) * (1 / RATIOS[21]) ||
      num(data.price) ||
      0;

    if (price24 < 1000 || price24 > 50000) return null;

    return {
      price24,
      price22: num(data.price_22) || round(price24 * RATIOS[22], 2),
      price21: num(data.price_21) || round(price24 * RATIOS[21], 2),
      price18: num(data.price_18) || round(price24 * RATIOS[18], 2),
      price14: num(data.price_14) || round(price24 * RATIOS[14], 2),
    };
  }

  function parseHtmlResponse(html, pattern) {
    if (!html || !pattern) return null;

    /* بحث في أول 500KB فقط للأداء */
    const content = html.slice(0, 500000);
    const match = content.match(pattern);

    if (!match || !match[1]) return null;

    const price24 = num(match[1]);
    if (price24 < 1000 || price24 > 50000) return null;

    return {
      price24,
      price22: round(price24 * RATIOS[22], 2),
      price21: round(price24 * RATIOS[21], 2),
      price18: round(price24 * RATIOS[18], 2),
      price14: round(price24 * RATIOS[14], 2),
    };
  }

  /* ═════════════════════════════════════════════════════════════════════
     §6 · FETCHERS
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * محاولة مصدر واحد
   */
  async function fetchFromSource(source) {
    if (!source || !source.enabled) return null;

    const attempt = {
      key: source.key,
      name: source.name,
      url: null,
      success: false,
      error: null,
      price: null,
      duration: 0,
      proxy: null,
    };

    const t0 = performance.now();

    try {
      /* ─── 1 · Custom Endpoint (JSON) ─── */
      if (source.key === 'egypt_custom' && source.endpoint) {
        attempt.url = source.endpoint;

        console.log(`[EgyptPrice] 🔄 ${source.name}`);
        const response = await fetchWithTimeout(source.endpoint, 5000);

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        const parsed = parseJsonResponse(data);

        if (!parsed) throw new Error('بيانات غير صالحة');

        attempt.success = true;
        attempt.price = parsed.price24;
        attempt.duration = Math.round(performance.now() - t0);

        console.log(`[EgyptPrice] ✅ ${source.name}: ${parsed.price24} ج.م/جم (${attempt.duration}ms)`);

        recordAttempt(attempt);
        return {
          ...parsed,
          source: source.key,
          sourceLabel: source.name,
          fetchedAt: new Date().toISOString(),
        };
      }

      /* ─── 2 · Gold Era API مباشر (بدون proxy) ─── */
      if (source.key === 'goldera_api' && source.apiUrl) {
        attempt.url = source.apiUrl;

        console.log(`[EgyptPrice] 🔄 ${source.name} (direct)`);
        const response = await fetchWithTimeout(source.apiUrl, 5000);

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        const parsed = parseJsonResponse(data);

        if (!parsed) throw new Error('بيانات غير صالحة');

        attempt.success = true;
        attempt.price = parsed.price24;
        attempt.duration = Math.round(performance.now() - t0);

        console.log(`[EgyptPrice] ✅ ${source.name}: ${parsed.price24} ج.م/جم (${attempt.duration}ms)`);

        recordAttempt(attempt);
        return {
          ...parsed,
          source: source.key,
          sourceLabel: source.name,
          fetchedAt: new Date().toISOString(),
        };
      }

      /* ─── 3 · Scrapers (HTML) عبر CORS Proxy ─── */
      if (source.scrapeUrl && source.useProxy) {
        /* نجرّب كل الـ proxies بالترتيب */
        for (const proxy of CORS_PROXIES) {
          const url = proxy.url + encodeURIComponent(source.scrapeUrl);
          attempt.url = url;
          attempt.proxy = proxy.name;

          try {
            console.log(`[EgyptPrice] 🔄 ${source.name} via ${proxy.name}`);
            const response = await fetchWithTimeout(url, 6000);

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const html = await response.text();
            const parsed = parseHtmlResponse(html, source.scrapePattern);

            if (!parsed) throw new Error('لم يُعثر على السعر');

            attempt.success = true;
            attempt.price = parsed.price24;
            attempt.duration = Math.round(performance.now() - t0);

            console.log(
              `[EgyptPrice] ✅ ${source.name} via ${proxy.name}: ${parsed.price24} ج.م/جم (${attempt.duration}ms)`
            );

            State.diagnostics.activeProxy = proxy.name;
            recordAttempt(attempt);
            return {
              ...parsed,
              source: source.key,
              sourceLabel: `${source.name} (${proxy.name})`,
              fetchedAt: new Date().toISOString(),
            };
          } catch (proxyErr) {
            console.warn(`[EgyptPrice] ⚠️ ${source.name} via ${proxy.name} فشل:`, proxyErr.message);
            attempt.error = `${proxy.name}: ${proxyErr.message}`;
          }
        }

        /* كل الـ proxies فشلت */
        throw new Error('كل الـ proxies فشلت');
      }

      return null;

    } catch (e) {
      attempt.error = e.message;
      attempt.duration = Math.round(performance.now() - t0);

      console.warn(`[EgyptPrice] ⚠️ ${source.name} فشل:`, e.message);

      recordAttempt(attempt);
      return null;
    }
  }

  function recordAttempt(attempt) {
    State.diagnostics.lastAttempts.push(attempt);
    if (State.diagnostics.lastAttempts.length > 30) {
      State.diagnostics.lastAttempts.shift();
    }

    if (attempt.success) {
      State.diagnostics.successCount++;
      State.diagnostics.lastSuccess = new Date().toISOString();
    } else {
      State.diagnostics.failCount++;
      State.diagnostics.lastError = attempt.error;
    }
  }

  async function fetchFromAllSources() {
    for (const source of State.sources) {
      if (!source.enabled) continue;
      if (source.key === 'egypt_custom' && !source.endpoint) continue;

      const result = await fetchFromSource(source);
      if (result && result.price24 > 0) return result;
    }
    return null;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §7 · INJECT INTO PRICEMANAGER
     ═════════════════════════════════════════════════════════════════════ */
  function injectIntoPriceManager() {
    try {
      const PM = GMS.PriceManager;
      if (!PM) {
        setTimeout(injectIntoPriceManager, 500);
        return false;
      }

      if (PM._egyptInjected) return true;

      State.originalSyncNow = PM.syncNow.bind(PM);

      PM.syncNow = async function (opts = {}) {
        /* 1 · جرّب المصري */
        const egyptResult = await fetchEgyptPrice();

        if (egyptResult && egyptResult.price24 > 0) {
          const offset = getCurrentOffset();
          const price24WithOffset = round(egyptResult.price24 + offset, 2);

          const karats = {
            price24: price24WithOffset,
            price22: round(price24WithOffset * RATIOS[22], 2),
            price21: round(price24WithOffset * RATIOS[21], 2),
            price18: round(price24WithOffset * RATIOS[18], 2),
            price14: round(price24WithOffset * RATIOS[14], 2),
            spread: offset,
          };

          /* نحدّث حالة PM */
          try {
            const PMState = PM.state || PM._state;
            if (PMState && PMState.prices) {
              PMState.prices = {
                ...PMState.prices,
                ...karats,
                source: egyptResult.source,
                sourceLabel: egyptResult.sourceLabel,
                fetchedAt: new Date().toISOString(),
                status: 'fresh',
                isEgyptLocal: true,
              };

              try {
                window.dispatchEvent(new CustomEvent('goldPriceUpdated', {
                  detail: { prices: PMState.prices, timestamp: Date.now() },
                }));
              } catch (_) {}
            }
          } catch (_) {}

          console.log(
            `%c🇪🇬 Egypt: ${egyptResult.price24} + offset(${offset}) = ${price24WithOffset} ج.م/جم`,
            'color:#0f7a43;font-weight:800;font-size:12px;'
          );

          return {
            success: true,
            prices: { ...karats, source: egyptResult.source, isEgyptLocal: true },
          };
        }

        /* 2 · Fallback */
        console.log('[EgyptPrice] ↩️ Fallback to global');
        return State.originalSyncNow(opts);
      };

      PM._egyptInjected = true;
      console.log('%c🇪🇬 EgyptPrice → injected', 'color:#0f7a43;font-weight:800;');
      return true;

    } catch (e) {
      console.error('[EgyptPrice.inject]', e);
      return false;
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §8 · PUBLIC FETCH
     ═════════════════════════════════════════════════════════════════════ */
  async function fetchEgyptPrice(opts = {}) {
    const { force = false } = opts;

    if (!force && isCacheFresh() && State.cache.price24 > 0) {
      return { ...State.cache };
    }

    const result = await fetchFromAllSources();

    if (result) {
      saveCache(result);
      notifyListeners(result);
      return result;
    }

    const cached = loadCache();
    if (cached && cached.price24 > 0) {
      return { ...cached, isStale: true };
    }

    return null;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §9 · CONFIG
     ═════════════════════════════════════════════════════════════════════ */
  function setCustomEndpoint(url) {
    try {
      const trimmed = String(url || '').trim();

      if (!trimmed) {
        State.sources[0].enabled = false;
        State.sources[0].endpoint = null;
        State.diagnostics.customEndpoint = null;
        localStorage.removeItem(STORAGE_KEYS.CUSTOM_ENDPOINT);
        return { success: true, cleared: true };
      }

      if (!/^https?:\/\//.test(trimmed)) {
        return { success: false, error: 'URL يجب أن يبدأ بـ http://' };
      }

      State.sources[0].enabled = true;
      State.sources[0].endpoint = trimmed;
      State.diagnostics.customEndpoint = trimmed;
      localStorage.setItem(STORAGE_KEYS.CUSTOM_ENDPOINT, trimmed);

      return { success: true, endpoint: trimmed };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  function loadCustomEndpoint() {
    try {
      const url = localStorage.getItem(STORAGE_KEYS.CUSTOM_ENDPOINT);
      if (url && /^https?:\/\//.test(url)) {
        State.sources[0].enabled = true;
        State.sources[0].endpoint = url;
        State.diagnostics.customEndpoint = url;
      }
    } catch (_) {}
  }

  function calibrate(price24) {
    const p = num(price24);
    if (p <= 0) return { success: false, error: 'سعر غير صالح' };

    const calib = {
      offset: 0,
      calibratedAt: new Date().toISOString(),
      referencePrice: p,
    };

    const currentPrice = num(GMS.PriceManager?.current?.(), 0);
    if (currentPrice > 0) calib.offset = round(p - currentPrice, 2);

    State.diagnostics.calibration = calib;

    try {
      localStorage.setItem(STORAGE_KEYS.CALIBRATION, JSON.stringify(calib));
    } catch (_) {}

    return { success: true, calibration: calib };
  }

  function loadCalibration() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.CALIBRATION);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.referencePrice > 0) {
          State.diagnostics.calibration = parsed;
        }
      }
    } catch (_) {}
  }

  /* ═════════════════════════════════════════════════════════════════════
     §10 · EVENTS
     ═════════════════════════════════════════════════════════════════════ */
  function notifyListeners(data) {
    State.listeners.forEach(fn => {
      try { fn(data); } catch (e) {}
    });
  }

  function on(callback) {
    if (typeof callback !== 'function') return () => {};
    State.listeners.add(callback);
    return () => State.listeners.delete(callback);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §11 · DIAGNOSTICS
     ═════════════════════════════════════════════════════════════════════ */
  function diagnostics() {
    return {
      initialized: State.initialized,
      sources: State.sources.map(s => ({
        key: s.key,
        name: s.name,
        enabled: s.enabled,
        priority: s.priority,
      })),
      cache: { ...State.cache },
      cacheFresh: isCacheFresh(),
      customEndpoint: State.diagnostics.customEndpoint,
      activeProxy: State.diagnostics.activeProxy,
      calibration: State.diagnostics.calibration,
      stats: {
        successCount: State.diagnostics.successCount,
        failCount: State.diagnostics.failCount,
        lastSuccess: State.diagnostics.lastSuccess,
        lastError: State.diagnostics.lastError,
      },
      lastAttempts: State.diagnostics.lastAttempts.slice(-10),
      injectedIntoPM: Boolean(GMS.PriceManager?._egyptInjected),
      currentOffset: getCurrentOffset(),
    };
  }

  /* ═════════════════════════════════════════════════════════════════════
     §12 · INIT / DESTROY
     ═════════════════════════════════════════════════════════════════════ */
  async function init() {
    if (State.initialized) return;

    console.log('%c🇪🇬 EgyptPrice v1.1 initializing…', 'color:#a55a00;font-weight:800;');

    loadCustomEndpoint();
    loadCalibration();
    loadCache();

    let attempts = 0;
    const tryInject = () => {
      if (injectIntoPriceManager()) return;
      if (attempts++ < 20) setTimeout(tryInject, 500);
    };
    tryInject();

    /* جلب أولي بعد 2 ثانية */
    setTimeout(async () => {
      try { await fetchEgyptPrice(); } catch (_) {}
    }, 2000);

    /* كل 90 ثانية */
    setInterval(async () => {
      try {
        if (document.hidden) return;
        await fetchEgyptPrice();
      } catch (_) {}
    }, 90 * 1000);

    State.initialized = true;
    console.log('%c✅ EgyptPrice v1.1 ready', 'color:#0f7a43;font-weight:800;');
  }

  function destroy() {
    State.listeners.clear();
    try {
      if (State.originalSyncNow && GMS.PriceManager) {
        GMS.PriceManager.syncNow = State.originalSyncNow;
        GMS.PriceManager._egyptInjected = false;
      }
    } catch (_) {}
    State.initialized = false;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §13 · EXPORT
     ═════════════════════════════════════════════════════════════════════ */
  GMS.EgyptPrice = {
    init,
    destroy,
    fetchNow: (opts) => fetchEgyptPrice({ ...opts, force: true }),
    getCache: () => ({ ...State.cache }),
    getState: () => State,
    setCustomEndpoint,
    calibrate,
    on,
    diagnostics,
    STORAGE_KEYS,
    CACHE_TTL_MS,
    _sources: State.sources,
    _fetchFromSource: fetchFromSource,
    _fetchFromAllSources: fetchFromAllSources,
    _parseJsonResponse: parseJsonResponse,
    _parseHtmlResponse: parseHtmlResponse,
    _CORS_PROXIES: CORS_PROXIES,
  };

  window.EgyptPrice = GMS.EgyptPrice;

  /* ═════════════════════════════════════════════════════════════════════
     §14 · AUTO-INIT
     ═════════════════════════════════════════════════════════════════════ */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 2000));
  } else {
    setTimeout(init, 2000);
  }

  console.log(
    '%c🇪🇬 EgyptPrice v1.1 loaded · Improved CORS · Multi-Proxy',
    'color:#0f7a43;font-weight:900;font-size:13px;padding:2px 6px;' +
    'background:linear-gradient(135deg,#a8dfc4,#0f7a43);border-radius:4px;'
  );

})();
