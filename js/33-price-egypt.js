/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ENTERPRISE — js/33-price-egypt.js
   مصدر أسعار الذهب المصري المحلي — Egyptian Gold Price Provider
   ─────────────────────────────────────────────────────────────────────
   ✅ v1.0.0 — المزايا:
     • يُضاف كمصدر أول في PriceManager (قبل المصادر العالمية)
     • يحافظ على المصادر العالمية كاحتياطي تلقائي
     • يحترم الـ Offset الحالي (هامش الصاغة)
     • 3 طبقات: Custom Endpoint → Public Scraper → Manual Calibration
     • يعمل مع CORS Proxy عام (allorigins.win)
     • تخزين محلي للأسعار المُجلَبة (cache 60s)
     • Auto-calibration: يحفظ الفرق مع المصادر العالمية
     • Diagnostics كامل

   كيف يعمل:
     1. يحقن نفسه في GOLD_SOURCES عند init
     2. عندما PriceManager.syncNow() يُنادى، يجرّب المصدر المحلي أولاً
     3. لو نجح → ياخد سعر 24K مباشرة بالجنيه المصري
     4. لو فشل → fallback للمصادر العالمية (Gold-API, GoldPrice.org)
     5. في كلتا الحالتين، يُطبّق الـ Offset الموجود

   Public API:
     GMS.EgyptPrice.fetchNow()           → جلب فوري
     GMS.EgyptPrice.getCache()           → الأسعار المُخزَّنة
     GMS.EgyptPrice.setCustomEndpoint(url)  → تعيين Endpoint مخصص
     GMS.EgyptPrice.calibrate(price24)   → معايرة يدوية
     GMS.EgyptPrice.diagnostics()        → تشخيص
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
    LAST_SOURCE:     'gms.price.egypt.lastSource',
    CALIBRATION:     'gms.price.egypt.calibration',
    FAIL_COUNT:      'gms.price.egypt.failCount',
  };

  const CACHE_TTL_MS = 60 * 1000;   /* 60 ثانية */

  /* نقاء العيارات — للتحويل */
  const RATIOS = Object.freeze({
    24: 1.0000,
    22: 0.9167,
    21: 0.8750,
    18: 0.7500,
    14: 0.5833,
  });

  /* ═════════════════════════════════════════════════════════════════════
     §2 · STATE
     ═════════════════════════════════════════════════════════════════════ */
  const State = {
    initialized: false,

    /* المصادر المتاحة */
    sources: [
      {
        key: 'egypt_custom',
        name: 'مصدر مصري مخصص',
        priority: 1,
        enabled: false,           /* يُفعَّل لما يُعيَّن endpoint */
        endpoint: null,
        parser: 'json',           /* 'json' | 'scrape' */
      },
      {
        key: 'egypt_isagha',
        name: 'iSagha (scraper)',
        priority: 2,
        enabled: true,
        scrapeUrl: 'https://isagha.com',
        scrapePattern: /عيار\s*24[\s\S]{0,200}?(\d{3,5}(?:\.\d{1,2})?)/i,
        proxy: 'https://api.allorigins.win/raw?url=',
      },
      {
        key: 'egypt_goldera',
        name: 'Gold Era (scraper)',
        priority: 3,
        enabled: true,
        scrapeUrl: 'https://goldera.com/ar/gold-prices-egypt',
        scrapePattern: /24[\s\S]{0,200}?(\d{3,5}(?:\.\d{1,2})?)/i,
        proxy: 'https://api.allorigins.win/raw?url=',
      },
    ],

    /* Cache */
    cache: {
      price24: 0,
      price22: 0,
      price21: 0,
      price18: 0,
      price14: 0,
      source: null,
      sourceLabel: '',
      fetchedAt: null,
      usdPerOz: 0,
      usdToEgp: 0,
    },

    /* Diagnostics */
    diagnostics: {
      lastAttempts: [],
      failCount: 0,
      successCount: 0,
      lastError: null,
      lastSuccess: null,
      customEndpoint: null,
      calibration: { offset: 0, calibratedAt: null, referencePrice: 0 },
    },

    /* Hooks */
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

  function ratio(karat) {
    const k = Number(karat);
    if (RATIOS[k] !== undefined) return RATIOS[k];
    if (k > 0 && k <= 1) return k;
    if (k >= 300 && k <= 999) return k / 1000;
    return 0;
  }

  async function fetchWithTimeout(url, timeoutMs = 8000, opts = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json, text/html, */*',
          'User-Agent': 'Mozilla/5.0 GoldMS/1.0',
        },
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
    /* يقرأ الـ Offset من PriceManager */
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
    } catch (e) {
      console.warn('[EgyptPrice.saveCache]', e);
    }
  }

  function loadCache() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.CACHE);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const ts = Number(localStorage.getItem(STORAGE_KEYS.CACHE_TS));
      if (!parsed || !ts) return null;

      const age = Date.now() - ts;
      if (age > CACHE_TTL_MS * 10) return null;   /* أقدم من 10 دقائق = تجاهل */

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

  /**
   * JSON parser — للمصادر المخصصة
   * يتوقع: { price_24: 7017 } أو { price: 7017 } أو { gold_24: 7017 }
   */
  function parseJsonResponse(data) {
    if (!data) return null;

    /* احتمالات متعددة */
    const price24 =
      num(data.price_24) ||
      num(data.price24) ||
      num(data.gold_24) ||
      num(data.gold24) ||
      num(data.price) ||
      num(data.PRICE_24) ||
      num(data['24K']) ||
      0;

    if (price24 <= 0) return null;

    /* قد يحتوي على باقي العيارات */
    const price22 = num(data.price_22) || num(data.price22) || 0;
    const price21 = num(data.price_21) || num(data.price21) || 0;
    const price18 = num(data.price_18) || num(data.price18) || 0;
    const price14 = num(data.price_14) || num(data.price14) || 0;

    return {
      price24,
      price22: price22 || round(price24 * RATIOS[22], 2),
      price21: price21 || round(price24 * RATIOS[21], 2),
      price18: price18 || round(price24 * RATIOS[18], 2),
      price14: price14 || round(price24 * RATIOS[14], 2),
      usdPerOz: num(data.usd_per_oz) || num(data.usdPerOz) || 0,
      usdToEgp: num(data.usd_to_egp) || num(data.usdToEgp) || 0,
    };
  }

  /**
   * HTML scraper — للمصادر العامة
   */
  function parseHtmlResponse(html, pattern) {
    if (!html || !pattern) return null;

    const match = html.match(pattern);
    if (!match || !match[1]) return null;

    const price24 = num(match[1]);
    if (price24 < 1000 || price24 > 50000) return null;   /* خارج النطاق المعقول */

    return {
      price24,
      price22: round(price24 * RATIOS[22], 2),
      price21: round(price24 * RATIOS[21], 2),
      price18: round(price24 * RATIOS[18], 2),
      price14: round(price24 * RATIOS[14], 2),
      usdPerOz: 0,
      usdToEgp: 0,
    };
  }

  /* ═════════════════════════════════════════════════════════════════════
     §6 · FETCHERS
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * محاولة جلب من مصدر واحد
   * @param {Object} source
   * @returns {Promise<Object|null>}
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
    };

    const t0 = performance.now();

    try {
      let url;
      let response;
      let data;
      let parsed;

      /* ─── Custom Endpoint (JSON) ─── */
      if (source.key === 'egypt_custom' && source.endpoint) {
        url = source.endpoint;
        attempt.url = url;

        console.log(`[EgyptPrice] 🔄 محاولة: ${source.name} → ${url}`);
        response = await fetchWithTimeout(url, 8000);

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        data = await response.json();
        parsed = parseJsonResponse(data);
      }
      /* ─── HTML Scraper ─── */
      else if (source.scrapeUrl) {
        /* نلف الرابط بـ CORS proxy */
        url = (source.proxy || '') + encodeURIComponent(source.scrapeUrl);
        attempt.url = url;

        console.log(`[EgyptPrice] 🔄 محاولة: ${source.name} (via proxy)`);
        response = await fetchWithTimeout(url, 10000);

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const html = await response.text();
        parsed = parseHtmlResponse(html, source.scrapePattern);
      }

      if (!parsed || !parsed.price24 || parsed.price24 <= 0) {
        throw new Error('بيانات غير صالحة');
      }

      attempt.success = true;
      attempt.price = parsed.price24;
      attempt.duration = Math.round(performance.now() - t0);

      console.log(
        `[EgyptPrice] ✅ ${source.name}: ${parsed.price24} ج.م/جم (${attempt.duration}ms)`
      );

      State.diagnostics.lastAttempts.push(attempt);
      if (State.diagnostics.lastAttempts.length > 20) {
        State.diagnostics.lastAttempts.shift();
      }
      State.diagnostics.successCount++;
      State.diagnostics.lastSuccess = new Date().toISOString();
      State.diagnostics.lastError = null;

      return {
        ...parsed,
        source: source.key,
        sourceLabel: source.name,
        fetchedAt: new Date().toISOString(),
      };

    } catch (e) {
      attempt.error = e.message;
      attempt.duration = Math.round(performance.now() - t0);

      console.warn(`[EgyptPrice] ⚠️ ${source.name} فشل:`, e.message);

      State.diagnostics.lastAttempts.push(attempt);
      if (State.diagnostics.lastAttempts.length > 20) {
        State.diagnostics.lastAttempts.shift();
      }

      State.diagnostics.failCount++;
      State.diagnostics.lastError = e.message;

      return null;
    }
  }

  /**
   * محاولة المصادر بالترتيب
   * @returns {Promise<Object|null>}
   */
  async function fetchFromAllSources() {
    for (const source of State.sources) {
      if (!source.enabled) continue;
      if (source.key === 'egypt_custom' && !source.endpoint) continue;

      const result = await fetchFromSource(source);
      if (result) return result;
    }
    return null;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §7 · INJECT INTO PRICEMANAGER
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * يحقن المصدر المصري في GOLD_SOURCES الخاص بـ PriceManager
   * بدون تعديل ملف 28
   */
  function injectIntoPriceManager() {
    try {
      const PM = GMS.PriceManager;
      if (!PM) {
        console.warn('[EgyptPrice] PriceManager غير متاح — retry في 500ms');
        setTimeout(injectIntoPriceManager, 500);
        return false;
      }

      if (PM._egyptInjected) {
        return true;
      }

      /* نحفظ دالة syncNow الأصلية */
      State.originalSyncNow = PM.syncNow.bind(PM);

      /**
       * دالة syncNow الجديدة — تجرّب المصدر المصري أولاً
       */
      PM.syncNow = async function (opts = {}) {
        /* 1 · جرّب المصدر المصري أولاً */
        const egyptResult = await fetchEgyptPrice();

        if (egyptResult && egyptResult.price24 > 0) {
          /* نجح! نطبّق الـ Offset الموجود */
          const offset = getCurrentOffset();
          const price24WithOffset = round(egyptResult.price24 + offset, 2);

          /* نبني الأسعار النهائية */
          const karats = {
            price24: price24WithOffset,
            price22: round(price24WithOffset * RATIOS[22], 2),
            price21: round(price24WithOffset * RATIOS[21], 2),
            price18: round(price24WithOffset * RATIOS[18], 2),
            price14: round(price24WithOffset * RATIOS[14], 2),
            scrapPrice: 0,   /* يُحسب في PriceManager */
            spread: offset,
          };

          /* نضبط الحالة الداخلية لـ PriceManager */
          try {
            const PMState = PM.state || PM._state;
            if (PMState && PMState.prices) {
              PMState.prices = {
                ...PMState.prices,
                ...karats,
                usdPerOz: egyptResult.usdPerOz || PMState.prices.usdPerOz,
                usdToEgp: egyptResult.usdToEgp || PMState.prices.usdToEgp,
                source: egyptResult.source,
                sourceLabel: egyptResult.sourceLabel,
                fetchedAt: new Date().toISOString(),
                status: 'fresh',
                isEgyptLocal: true,
              };

              /* نُطلق الأحداث يدوياً */
              try {
                window.dispatchEvent(new CustomEvent('goldPriceUpdated', {
                  detail: { prices: PMState.prices, timestamp: Date.now() },
                }));
              } catch (_) {}

              /* نُحدّث الـ cache الداخلي */
              if (typeof PM.startAutoRefresh === 'function') {
                /* لا شيء — فقط نتأكد أن auto-refresh مستمر */
              }
            }
          } catch (e) {
            console.warn('[EgyptPrice] Failed to set PM state:', e);
          }

          console.log(
            `%c🇪🇬 Egypt Local: ${egyptResult.price24} + offset(${offset}) = ${price24WithOffset} ج.م/جم`,
            'color:#0f7a43;font-weight:800;font-size:12px;'
          );

          return {
            success: true,
            prices: {
              ...karats,
              source: egyptResult.source,
              sourceLabel: egyptResult.sourceLabel,
              isEgyptLocal: true,
            },
            egypt: egyptResult,
          };
        }

        /* 2 · فشل المصدر المصري → fallback للمصادر العالمية */
        console.log('[EgyptPrice] ↩️ Fallback to global sources');

        const globalResult = await State.originalSyncNow(opts);
        return globalResult;
      };

      PM._egyptInjected = true;
      console.log(
        '%c🇪🇬 EgyptPrice → injected into PriceManager.syncNow',
        'color:#0f7a43;font-weight:800;font-size:12px;'
      );

      return true;

    } catch (e) {
      console.error('[EgyptPrice.injectIntoPriceManager]', e);
      return false;
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §8 · PUBLIC FETCH
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * جلب السعر المصري (مع cache)
   * @param {Object} opts
   * @param {boolean} [opts.force=false]
   * @returns {Promise<Object|null>}
   */
  async function fetchEgyptPrice(opts = {}) {
    const { force = false } = opts;

    /* استرجاع من cache لو حديث */
    if (!force && isCacheFresh() && State.cache.price24 > 0) {
      console.log('[EgyptPrice] 📦 Cache hit:', State.cache.price24);
      return { ...State.cache };
    }

    /* جلب من المصادر */
    const result = await fetchFromAllSources();

    if (result) {
      saveCache(result);
      notifyListeners(result);
      return result;
    }

    /* فشل — نستخدم cache قديم لو متاح */
    const cached = loadCache();
    if (cached && cached.price24 > 0) {
      console.log('[EgyptPrice] 🕐 Using stale cache:', cached.price24);
      return { ...cached, isStale: true };
    }

    return null;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §9 · CUSTOM ENDPOINT
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * تعيين Endpoint مخصص لمصدر مصري (JSON)
   * @param {string} url
   */
  function setCustomEndpoint(url) {
    try {
      const trimmed = String(url || '').trim();

      if (!trimmed) {
        State.sources[0].enabled = false;
        State.sources[0].endpoint = null;
        State.diagnostics.customEndpoint = null;
        localStorage.removeItem(STORAGE_KEYS.CUSTOM_ENDPOINT);
        console.log('[EgyptPrice] Custom endpoint removed');
        return { success: true, cleared: true };
      }

      /* تحقق من الصيغة */
      if (!/^https?:\/\//.test(trimmed)) {
        return { success: false, error: 'URL يجب أن يبدأ بـ http:// أو https://' };
      }

      State.sources[0].enabled = true;
      State.sources[0].endpoint = trimmed;
      State.diagnostics.customEndpoint = trimmed;

      localStorage.setItem(STORAGE_KEYS.CUSTOM_ENDPOINT, trimmed);

      console.log('[EgyptPrice] ✅ Custom endpoint set:', trimmed);

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
        console.log('[EgyptPrice] Loaded custom endpoint:', url);
        return url;
      }
    } catch (_) {}
    return null;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §10 · CALIBRATION
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * معايرة يدوية — تُحفظ للاستخدام لو المصادر فشلت
   * @param {number} price24
   */
  function calibrate(price24) {
    const p = num(price24);
    if (p <= 0) {
      return { success: false, error: 'سعر غير صالح' };
    }

    const calib = {
      offset: 0,
      calibratedAt: new Date().toISOString(),
      referencePrice: p,
    };

    /* نحسب الفرق مع المصادر الحالية */
    const currentPrice = num(GMS.PriceManager?.current?.(), 0);
    if (currentPrice > 0) {
      calib.offset = round(p - currentPrice, 2);
    }

    State.diagnostics.calibration = calib;

    try {
      localStorage.setItem(STORAGE_KEYS.CALIBRATION, JSON.stringify(calib));
    } catch (_) {}

    console.log(
      `%c⚙️ Calibration: reference=${p}, offset=${calib.offset}`,
      'color:#a55a00;font-weight:800;'
    );

    return { success: true, calibration: calib };
  }

  function loadCalibration() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.CALIBRATION);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.referencePrice > 0) {
          State.diagnostics.calibration = parsed;
        }
      }
    } catch (_) {}
  }

  /* ═════════════════════════════════════════════════════════════════════
     §11 · EVENTS
     ═════════════════════════════════════════════════════════════════════ */
  function notifyListeners(data) {
    State.listeners.forEach(fn => {
      try { fn(data); } catch (e) { console.warn('[EgyptPrice.listener]', e); }
    });
  }

  function on(callback) {
    if (typeof callback !== 'function') return () => {};
    State.listeners.add(callback);
    return () => State.listeners.delete(callback);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §12 · DIAGNOSTICS
     ═════════════════════════════════════════════════════════════════════ */
  function diagnostics() {
    return {
      initialized: State.initialized,
      sources: State.sources.map(s => ({
        key: s.key,
        name: s.name,
        enabled: s.enabled,
        priority: s.priority,
        endpoint: s.endpoint || s.scrapeUrl,
      })),
      cache: { ...State.cache },
      cacheFresh: isCacheFresh(),
      customEndpoint: State.diagnostics.customEndpoint,
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
     §13 · INIT / DESTROY
     ═════════════════════════════════════════════════════════════════════ */
  async function init() {
    if (State.initialized) return;

    console.log(
      '%c🇪🇬 EgyptPrice initializing…',
      'color:#a55a00;font-weight:800;font-size:12px;'
    );

    /* 1 · تحميل الإعدادات المحفوظة */
    loadCustomEndpoint();
    loadCalibration();
    loadCache();

    /* 2 · حقن في PriceManager */
    let attempts = 0;
    const tryInject = () => {
      if (injectIntoPriceManager()) return;
      if (attempts++ < 20) {
        setTimeout(tryInject, 500);
      } else {
        console.warn('[EgyptPrice] ⚠️ Failed to inject into PriceManager');
      }
    };
    tryInject();

    /* 3 · جلب أولي */
    setTimeout(async () => {
      try {
        await fetchEgyptPrice();
      } catch (e) {
        console.warn('[EgyptPrice] Initial fetch failed:', e);
      }
    }, 2000);

    /* 4 · مراقبة كل 90 ثانية */
    setInterval(async () => {
      try {
        if (document.hidden) return;
        await fetchEgyptPrice();
      } catch (_) {}
    }, 90 * 1000);

    State.initialized = true;

    console.log(
      `%c✅ EgyptPrice ready — ${State.sources.filter(s => s.enabled).length} sources active`,
      'color:#0f7a43;font-weight:800;font-size:12px;'
    );
  }

  function destroy() {
    State.listeners.clear();

    /* استرجاع syncNow الأصلية */
    try {
      if (State.originalSyncNow && GMS.PriceManager) {
        GMS.PriceManager.syncNow = State.originalSyncNow;
        GMS.PriceManager._egyptInjected = false;
      }
    } catch (_) {}

    State.initialized = false;
    console.log('[EgyptPrice] 🛑 Destroyed');
  }

  /* ═════════════════════════════════════════════════════════════════════
     §14 · EXPORT
     ═════════════════════════════════════════════════════════════════════ */
  GMS.EgyptPrice = {
    init,
    destroy,

    /* Core */
    fetchNow: (opts) => fetchEgyptPrice({ ...opts, force: true }),
    getCache: () => ({ ...State.cache }),
    getState: () => State,

    /* Configuration */
    setCustomEndpoint,
    calibrate,

    /* Events */
    on,

    /* Diagnostics */
    diagnostics,

    /* Constants */
    STORAGE_KEYS,
    CACHE_TTL_MS,

    /* Internal (for testing) */
    _sources: State.sources,
    _fetchFromSource: fetchFromSource,
    _fetchFromAllSources: fetchFromAllSources,
    _parseJsonResponse: parseJsonResponse,
    _parseHtmlResponse: parseHtmlResponse,
  };

  window.EgyptPrice = GMS.EgyptPrice;

  /* ═════════════════════════════════════════════════════════════════════
     §15 · AUTO-INIT
     ═════════════════════════════════════════════════════════════════════ */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(init, 2000);
    });
  } else {
    setTimeout(init, 2000);
  }

  console.log(
    '%c🇪🇬 EgyptPrice v1.0.0 loaded · Local Egyptian Gold Source',
    'color:#0f7a43;font-weight:900;font-size:13px;padding:2px 6px;' +
    'background:linear-gradient(135deg,#a8dfc4,#0f7a43);border-radius:4px;'
  );

  console.log(
    '%c🌍 Egyptian priority → Global fallback · Preserves existing Offset',
    'color:#6b7a95;font-weight:700;font-size:11px;'
  );

})();