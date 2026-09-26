/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ENTERPRISE — js/28-price-manager.js
   مدير أسعار الذهب اللحظية — Real-Time Gold Price Manager
   ─────────────────────────────────────────────────────────────────────
   ✅ v1.0.1: استخدام APIs حقيقية تعمل فعلاً
     • GoldPrice.org → XAU/USD (الأولوية)
     • Gold-API.com  → XAU/USD (احتياطي)
     • Open ER API   → USD/EGP (الأولوية)
     • Frankfurter   → USD/EGP (احتياطي)

   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const GMS = window.GMS = window.GMS || {};

  const TROY_OUNCE_GRAMS = 31.1034768;

  const STORAGE_KEYS = {
    PRICES:       'gms.price.prices',
    LAST_FETCH:   'gms.price.lastFetch',
    OFFSET:       'gms.price.offset',
    AUTO_REFRESH: 'gms.price.autoRefresh',
    SOURCE:       'gms.price.lastSource',
  };

  const DEFAULT_CONFIG = {
    autoRefreshEnabled: true,
    autoRefreshInterval: 60000,
    offsetEGP: 0,
    fetchTimeout: 10000,
  };

  /* ═══════════════════════════════════════════════════════════════════
     ✅ المصادر الفعلية — مرتبة حسب الأولوية
     ═══════════════════════════════════════════════════════════════════ */

  /* مصادر سعر الذهب (XAU/USD) */
  const GOLD_SOURCES = [
    {
      key: 'goldprice_org',
      name: 'GoldPrice.org',
      label: 'GoldPrice.org Live',
      url: 'https://data-asg.goldprice.org/dbXRates/USD',
      parse: function (data) {
        try {
          /* { ts, items: [{ xauPrice, xagPrice, ... }] } */
          if (!data || !Array.isArray(data.items) || !data.items.length) {
            return null;
          }
          const price = Number(data.items[0].xauPrice);
          if (!isFinite(price) || price <= 0) return null;

          return {
            spot_usd_oz: price,
            status: 'fresh',
            asOf: data.ts ? new Date(Number(data.ts)).toISOString() : new Date().toISOString(),
          };
        } catch (e) {
          return null;
        }
      },
      testUrl: 'https://data-asg.goldprice.org/dbXRates/USD',
    },
    {
      key: 'gold_api',
      name: 'Gold-API.com',
      label: 'Gold-API.com',
      url: 'https://api.gold-api.com/price/XAU',
      parse: function (data) {
        try {
          /* { name: "Gold", price: 2650.50, symbol: "XAU", updatedAt: "..." } */
          if (!data) return null;
          const price = Number(data.price);
          if (!isFinite(price) || price <= 0) return null;

          return {
            spot_usd_oz: price,
            status: 'fresh',
            asOf: data.updatedAt || new Date().toISOString(),
          };
        } catch (e) {
          return null;
        }
      },
      testUrl: 'https://api.gold-api.com/price/XAU',
    },
  ];

  /* مصادر سعر الصرف USD → EGP */
  const RATE_SOURCES = [
    {
      key: 'open_er',
      name: 'Open ER API',
      url: 'https://open.er-api.com/v6/latest/USD',
      parse: function (data) {
        try {
          /* { result: "success", rates: { EGP: 48.5, ... } } */
          if (!data || !data.rates) return null;
          const egp = Number(data.rates.EGP);
          if (!isFinite(egp) || egp <= 0) return null;
          return { usd_egp: egp };
        } catch (e) {
          return null;
        }
      },
    },
    {
      key: 'frankfurter',
      name: 'Frankfurter',
      url: 'https://api.frankfurter.app/latest?from=USD&to=EGP',
      parse: function (data) {
        try {
          /* { amount: 1, base: "USD", date: "...", rates: { EGP: 48.5 } } */
          if (!data || !data.rates) return null;
          const egp = Number(data.rates.EGP);
          if (!isFinite(egp) || egp <= 0) return null;
          return { usd_egp: egp };
        } catch (e) {
          return null;
        }
      },
    },
  ];

  const FALLBACK_RATE_USD_EGP = 48.50;

  /* ═══════════════════════════════════════════════════════════════════
     STATE
     ═══════════════════════════════════════════════════════════════════ */
  const State = {
    prices: {
      price24: 0,
      price22: 0,
      price21: 0,
      price18: 0,
      price14: 0,
      scrapPrice: 0,
      spread: 0,
      source: 'none',
      sourceLabel: '',
      fetchedAt: null,
      usdPerOz: 0,
      usdToEgp: 0,
      status: 'idle',
      error: null,
    },
    config: { ...DEFAULT_CONFIG },
    listeners: new Set(),
    autoRefreshTimer: null,
    initialized: false,
    failedSources: [],
    broadcastChannel: null,
    diagnostics: {
      lastGoldAttempts: [],
      lastRateAttempts: [],
    },
  };

  /* ═══════════════════════════════════════════════════════════════════
     HELPERS
     ═══════════════════════════════════════════════════════════════════ */
  function round(v, d = 2) {
    if (GMS.round) return GMS.round(v, d);
    const p = Math.pow(10, d);
    return Math.round((Number(v) + Number.EPSILON) * p) / p;
  }

  function num(v, fallback = 0) {
    const n = Number(v);
    return isFinite(n) ? n : fallback;
  }

  async function fetchWithTimeout(url, timeoutMs = 10000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' },
        cache: 'no-store',
        mode: 'cors',
      });
      clearTimeout(timer);
      return response;
    } catch (e) {
      clearTimeout(timer);
      throw e;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════
     FETCH GOLD PRICE (XAU/USD)
     ═══════════════════════════════════════════════════════════════════ */
  async function fetchGoldPrice() {
    const attempts = [];

    for (const source of GOLD_SOURCES) {
      const attempt = {
        key: source.key,
        name: source.name,
        url: source.url,
        success: false,
        error: null,
        price: null,
        duration: 0,
      };

      const t0 = performance.now();
      try {
        console.log(`[PriceManager] 🔄 محاولة سعر الذهب: ${source.name}`);
        const response = await fetchWithTimeout(source.url, State.config.fetchTimeout);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const parsed = source.parse(data);

        if (!parsed || !parsed.spot_usd_oz || parsed.spot_usd_oz <= 0) {
          throw new Error('بيانات غير صالحة');
        }

        attempt.success = true;
        attempt.price = parsed.spot_usd_oz;
        attempt.duration = Math.round(performance.now() - t0);

        console.log(`[PriceManager] ✅ ${source.name}: $${parsed.spot_usd_oz}/oz (${attempt.duration}ms)`);

        attempts.push(attempt);
        State.diagnostics.lastGoldAttempts = attempts;

        return {
          success: true,
          spot_usd_oz: parsed.spot_usd_oz,
          source: source.key,
          sourceLabel: source.label,
          asOf: parsed.asOf,
          status: parsed.status || 'fresh',
        };

      } catch (e) {
        attempt.error = e.message;
        attempt.duration = Math.round(performance.now() - t0);
        console.warn(`[PriceManager] ⚠️ ${source.name} فشل:`, e.message);
        attempts.push(attempt);
      }
    }

    State.diagnostics.lastGoldAttempts = attempts;
    return { success: false, error: 'كل مصادر سعر الذهب فشلت' };
  }

  /* ═══════════════════════════════════════════════════════════════════
     FETCH USD → EGP RATE
     ═══════════════════════════════════════════════════════════════════ */
  async function fetchExchangeRate() {
    const attempts = [];

    for (const source of RATE_SOURCES) {
      const attempt = {
        key: source.key,
        name: source.name,
        url: source.url,
        success: false,
        error: null,
        rate: null,
        duration: 0,
      };

      const t0 = performance.now();
      try {
        console.log(`[PriceManager] 🔄 محاولة سعر الصرف: ${source.name}`);
        const response = await fetchWithTimeout(source.url, State.config.fetchTimeout);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        const parsed = source.parse(data);

        if (!parsed || !parsed.usd_egp || parsed.usd_egp <= 0) {
          throw new Error('بيانات غير صالحة');
        }

        attempt.success = true;
        attempt.rate = parsed.usd_egp;
        attempt.duration = Math.round(performance.now() - t0);

        console.log(`[PriceManager] ✅ ${source.name}: 1 USD = ${parsed.usd_egp} EGP (${attempt.duration}ms)`);

        attempts.push(attempt);
        State.diagnostics.lastRateAttempts = attempts;

        return {
          success: true,
          usd_egp: parsed.usd_egp,
          source: source.key,
          sourceLabel: source.name,
        };

      } catch (e) {
        attempt.error = e.message;
        attempt.duration = Math.round(performance.now() - t0);
        console.warn(`[PriceManager] ⚠️ ${source.name} فشل:`, e.message);
        attempts.push(attempt);
      }
    }

    State.diagnostics.lastRateAttempts = attempts;

    /* fallback */
    console.warn(`[PriceManager] ⚠️ استخدام سعر الصرف الاحتياطي: ${FALLBACK_RATE_USD_EGP}`);
    return {
      success: true,
      usd_egp: FALLBACK_RATE_USD_EGP,
      source: 'fallback',
      sourceLabel: 'قيمة احتياطية',
      isFallback: true,
    };
  }

  /* ═══════════════════════════════════════════════════════════════════
     COMPUTE KARAT PRICES
     ═══════════════════════════════════════════════════════════════════ */
  function computeKaratPrices(price24, offsetEGP = 0) {
    const p = num(price24);
    const off = num(offsetEGP);

    const price24Final = round(p + off, 2);
    const price22Final = round(p * (22 / 24) + off, 2);
    const price21Final = round(p * (21 / 24) + off, 2);
    const price18Final = round(p * (18 / 24) + off, 2);
    const price14Final = round(p * (14 / 24) + off, 2);

    let scrapMargin = 8;
    try {
      const saved = Number(localStorage.getItem(
        (GMS.LS_KEYS && GMS.LS_KEYS.BUY_MARGIN) || 'gms.buyback.margin'
      ));
      if (isFinite(saved) && saved >= 0 && saved < 30) scrapMargin = saved;
    } catch (_) {}

    const scrapPrice = round(price24Final * (1 - scrapMargin / 100), 2);

    return {
      price24: price24Final,
      price22: price22Final,
      price21: price21Final,
      price18: price18Final,
      price14: price14Final,
      scrapPrice,
      spread: off,
    };
  }

  /* ═══════════════════════════════════════════════════════════════════
     MAIN UPDATE PIPELINE
     ═══════════════════════════════════════════════════════════════════ */
  async function updatePrices(opts = {}) {
    const { silent = false } = opts;

    if (State.prices.status === 'fetching') {
      return { success: false, reason: 'already_fetching' };
    }

    State.prices.status = 'fetching';
    State.failedSources = [];

    try {
      /* 1 · جلب سعر الذهب (XAU/USD) */
      const goldResult = await fetchGoldPrice();

      if (!goldResult.success) {
        State.prices.status = 'error';
        State.prices.error = goldResult.error;

        if (!silent) {
          GMS.Toast?.err?.(
            'فشل جلب سعر الذهب',
            'تحقق من اتصال الإنترنت أو راجع Console للأخطاء'
          );
        }

        notifyListeners({ error: goldResult.error });
        return goldResult;
      }

      /* 2 · جلب سعر الصرف (USD → EGP) */
      const rateResult = await fetchExchangeRate();

      /* 3 · حساب السعر النهائي */
      const usdPerOz = num(goldResult.spot_usd_oz);
      const usdToEgp = num(rateResult.usd_egp);
      const offset = num(State.config.offsetEGP);

      /* price24 = (USD/oz ÷ 31.1035) × USD/EGP + spread */
      const price24Base = round(
        (usdPerOz / TROY_OUNCE_GRAMS) * usdToEgp,
        2
      );

      const karats = computeKaratPrices(price24Base, offset);

      const oldPrice = State.prices.price24;

      /* 4 · تحديث الحالة */
      State.prices = {
        ...State.prices,
        ...karats,
        usdPerOz,
        usdToEgp,
        source: goldResult.source,
        sourceLabel: goldResult.sourceLabel,
        rateSource: rateResult.sourceLabel,
        fetchedAt: new Date().toISOString(),
        status: goldResult.status === 'stale' ? 'stale' : 'fresh',
        error: null,
      };

      /* 5 · حفظ في التخزين */
      savePricesToCache();
      savePricesToCacheDB();
      updateSystemCache(State.prices);

      /* 6 · إطلاق الأحداث */
      dispatchPriceEvent(State.prices);
      notifyListeners(State.prices);
      broadcastToTabs(State.prices);

      /* 7 · إشعار */
      if (!silent) {
        const changeInfo = oldPrice > 0 && Math.abs(oldPrice - State.prices.price24) > 0.5
          ? ` (${oldPrice} → ${State.prices.price24})`
          : '';

        GMS.Toast?.ok?.(
          'تم تحديث أسعار الذهب',
          `24K: ${State.prices.price24} ج.م/جم${changeInfo}`
        );
      }

      console.log(
        `%c💰 Price updated: 24K = ${State.prices.price24} ج.م/جم`,
        'color:#c8a24a;font-weight:900;font-size:13px;',
        {
          source: State.prices.sourceLabel,
          rate: `${State.prices.usdToEgp} EGP/USD`,
          gold: `$${State.prices.usdPerOz}/oz`,
        }
      );

      return { success: true, prices: State.prices };

    } catch (e) {
      console.error('[PriceManager] Update failed:', e);
      State.prices.status = 'error';
      State.prices.error = e.message;

      if (!silent) {
        GMS.Toast?.err?.('فشل تحديث الأسعار', e.message);
      }

      notifyListeners({ error: e.message });
      return { success: false, error: e.message };
    }
  }

  /* ═══════════════════════════════════════════════════════════════════
     EVENT DISPATCH
     ═══════════════════════════════════════════════════════════════════ */
  function dispatchPriceEvent(prices) {
    try {
      window.dispatchEvent(new CustomEvent('goldPriceUpdated', {
        detail: { prices: { ...prices }, timestamp: Date.now() },
      }));
    } catch (e) {
      console.warn('[PriceManager] dispatchPriceEvent failed:', e);
    }
  }

  function notifyListeners(data) {
    State.listeners.forEach(fn => {
      try { fn(data); } catch (e) { console.warn('[PriceManager.listener]', e); }
    });
  }

  function broadcastToTabs(prices) {
    try {
      if (!State.broadcastChannel && typeof BroadcastChannel !== 'undefined') {
        State.broadcastChannel = new BroadcastChannel('gms-price-sync');
        State.broadcastChannel.onmessage = (e) => {
          if (e.data?.type === 'PRICE_UPDATE') {
            applyPricesFromBroadcast(e.data.prices);
          }
        };
      }
      State.broadcastChannel?.postMessage?.({
        type: 'PRICE_UPDATE',
        prices: { ...prices },
        at: Date.now(),
      });
    } catch (_) {}
  }

  function applyPricesFromBroadcast(prices) {
    try {
      if (!prices || !prices.price24) return;
      if (Math.abs((State.prices.price24 || 0) - prices.price24) < 0.01) return;

      State.prices = { ...State.prices, ...prices };
      savePricesToCache();
      updateSystemCache(State.prices);
      dispatchPriceEvent(State.prices);
      notifyListeners(State.prices);
    } catch (e) {
      console.warn('[PriceManager] applyPricesFromBroadcast failed:', e);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════
     SYSTEM CACHE INTEGRATION
     ═══════════════════════════════════════════════════════════════════ */
  function updateSystemCache(prices) {
    try {
      if (GMS.Cache?.ls?.set) {
        GMS.Cache.ls.set(GMS.LS_KEYS.CACHE_PRICE, {
          price_24: prices.price24,
          price_21: prices.price21,
          price_18: prices.price18,
          updated_at: prices.fetchedAt,
          source: prices.sourceLabel,
        });
      }
    } catch (e) {
      console.warn('[PriceManager] updateSystemCache failed:', e);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════
     CACHE PERSISTENCE
     ═══════════════════════════════════════════════════════════════════ */
  function savePricesToCache() {
    try {
      localStorage.setItem(STORAGE_KEYS.PRICES, JSON.stringify({
        ...State.prices,
        savedAt: Date.now(),
      }));
      localStorage.setItem(STORAGE_KEYS.LAST_FETCH, String(Date.now()));
    } catch (e) {
      console.warn('[PriceManager] savePricesToCache failed:', e);
    }
  }

  function loadCachedPrices() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.PRICES);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.price24 || parsed.price24 <= 0) return null;
      return parsed;
    } catch (_) {
      return null;
    }
  }

  async function savePricesToCacheDB() {
    try {
      if (GMS.IDB?.metaSet) {
        await GMS.IDB.metaSet('gold_prices', {
          ...State.prices,
          savedAt: Date.now(),
        });
      }
    } catch (_) {}
  }

  /* ═══════════════════════════════════════════════════════════════════
     AUTO REFRESH
     ═══════════════════════════════════════════════════════════════════ */
  function startAutoRefresh(intervalMs) {
    const interval = num(intervalMs, State.config.autoRefreshInterval);
    stopAutoRefresh();

    if (!State.config.autoRefreshEnabled) return;

    State.config.autoRefreshInterval = interval;

    State.autoRefreshTimer = setInterval(() => {
      if (document.hidden) return;
      if (State.prices.status === 'fetching') return;
      updatePrices({ silent: true }).catch(() => {});
    }, interval);

    try {
      localStorage.setItem(STORAGE_KEYS.AUTO_REFRESH, JSON.stringify({
        enabled: true,
        interval,
      }));
    } catch (_) {}

    console.log(`[PriceManager] ✅ Auto-refresh: كل ${interval / 1000}ث`);
  }

  function stopAutoRefresh() {
    if (State.autoRefreshTimer) {
      clearInterval(State.autoRefreshTimer);
      State.autoRefreshTimer = null;
    }
  }

  function setAutoRefresh(enabled) {
    State.config.autoRefreshEnabled = Boolean(enabled);
    if (enabled) startAutoRefresh();
    else stopAutoRefresh();

    try {
      localStorage.setItem(STORAGE_KEYS.AUTO_REFRESH, JSON.stringify({
        enabled: State.config.autoRefreshEnabled,
        interval: State.config.autoRefreshInterval,
      }));
    } catch (_) {}

    return State.config.autoRefreshEnabled;
  }

  /* ═══════════════════════════════════════════════════════════════════
     SETTINGS
     ═══════════════════════════════════════════════════════════════════ */
  function setOffset(offsetEGP) {
    const v = num(offsetEGP, 0);
    State.config.offsetEGP = Math.max(-100, Math.min(100, v));

    try {
      localStorage.setItem(STORAGE_KEYS.OFFSET, String(State.config.offsetEGP));
    } catch (_) {}

    if (State.prices.usdPerOz > 0 && State.prices.usdToEgp > 0) {
      const price24Base = round(
        (State.prices.usdPerOz / TROY_OUNCE_GRAMS) * State.prices.usdToEgp,
        2
      );
      const karats = computeKaratPrices(price24Base, State.config.offsetEGP);
      State.prices = { ...State.prices, ...karats };

      savePricesToCache();
      updateSystemCache(State.prices);
      dispatchPriceEvent(State.prices);
      notifyListeners(State.prices);
    }

    return State.config.offsetEGP;
  }

  function loadConfig() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.AUTO_REFRESH);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.enabled === 'boolean') {
          State.config.autoRefreshEnabled = parsed.enabled;
        }
        if (parsed.interval > 0) {
          State.config.autoRefreshInterval = num(parsed.interval, 60000);
        }
      }
    } catch (_) {}

    try {
      const raw = localStorage.getItem(STORAGE_KEYS.OFFSET);
      if (raw !== null) State.config.offsetEGP = num(raw, 0);
    } catch (_) {}
  }

  /* ═══════════════════════════════════════════════════════════════════
     DIAGNOSTICS — لاختبار المصادر
     ═══════════════════════════════════════════════════════════════════ */
  async function testSources() {
    console.log('%c🔍 Testing all sources…', 'color:#1c4fd8;font-weight:900;');

    const results = {
      gold: [],
      rate: [],
    };

    /* Test gold sources */
    for (const source of GOLD_SOURCES) {
      const t0 = performance.now();
      try {
        const r = await fetchWithTimeout(source.url, 8000);
        const d = await r.json();
        const parsed = source.parse(d);
        results.gold.push({
          name: source.name,
          url: source.url,
          status: r.status,
          ok: r.ok,
          parsed: parsed,
          duration: Math.round(performance.now() - t0),
        });
        console.log(`✅ ${source.name}:`, parsed);
      } catch (e) {
        results.gold.push({
          name: source.name,
          url: source.url,
          error: e.message,
          duration: Math.round(performance.now() - t0),
        });
        console.error(`❌ ${source.name}:`, e.message);
      }
    }

    /* Test rate sources */
    for (const source of RATE_SOURCES) {
      const t0 = performance.now();
      try {
        const r = await fetchWithTimeout(source.url, 8000);
        const d = await r.json();
        const parsed = source.parse(d);
        results.rate.push({
          name: source.name,
          url: source.url,
          status: r.status,
          ok: r.ok,
          parsed: parsed,
          duration: Math.round(performance.now() - t0),
        });
        console.log(`✅ ${source.name}:`, parsed);
      } catch (e) {
        results.rate.push({
          name: source.name,
          url: source.url,
          error: e.message,
          duration: Math.round(performance.now() - t0),
        });
        console.error(`❌ ${source.name}:`, e.message);
      }
    }

    console.table(results.gold);
    console.table(results.rate);
    return results;
  }

  /* ═══════════════════════════════════════════════════════════════════
     INIT
     ═══════════════════════════════════════════════════════════════════ */
  async function init() {
    if (State.initialized) return State.prices;
    State.initialized = true;

    console.log('%c💹 PriceManager v1.0.1 initializing…', 'color:#D4A017;font-weight:800;');

    loadConfig();

    /* استرجاع الكاش */
    const cached = loadCachedPrices();
    if (cached && cached.price24 > 0) {
      State.prices = { ...State.prices, ...cached };
      updateSystemCache(State.prices);
      setTimeout(() => {
        dispatchPriceEvent(State.prices);
        notifyListeners(State.prices);
      }, 100);
    }

    /* جلب أول أسعار */
    setTimeout(() => {
      updatePrices({ silent: true }).catch(() => {});
    }, 500);

    /* Auto-refresh */
    if (State.config.autoRefreshEnabled) {
      startAutoRefresh();
    }

    /* Storage event (تبويبات أخرى) */
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEYS.PRICES && e.newValue) {
        try {
          const data = JSON.parse(e.newValue);
          if (data && data.price24 > 0) applyPricesFromBroadcast(data);
        } catch (_) {}
      }
    });

    /* Visibility */
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      const ageMs = Date.now() - new Date(State.prices.fetchedAt || 0).getTime();
      if (ageMs > State.config.autoRefreshInterval * 1.5 && State.config.autoRefreshEnabled) {
        updatePrices({ silent: true }).catch(() => {});
      }
    });

    /* Online */
    window.addEventListener('online', () => {
      setTimeout(() => updatePrices({ silent: true }).catch(() => {}), 1500);
    });

    console.log('%c✅ PriceManager initialized', 'color:#0f7a43;font-weight:800;');

    return State.prices;
  }

  /* ═══════════════════════════════════════════════════════════════════
     PUBLIC API
     ═══════════════════════════════════════════════════════════════════ */
  const PriceManager = {
    getCurrentPrices() { return { ...State.prices }; },

    current() { return State.prices.price24 || 0; },

    forKarat(karat) {
      const k = Number(karat);
      if (k === 24) return State.prices.price24 || 0;
      if (k === 22) return State.prices.price22 || 0;
      if (k === 21) return State.prices.price21 || 0;
      if (k === 18) return State.prices.price18 || 0;
      if (k === 14) return State.prices.price14 || 0;
      if (isFinite(k) && k > 0 && k <= 24) {
        return round((State.prices.price24 || 0) * (k / 24), 2);
      }
      return 0;
    },

    scrapPrice() { return State.prices.scrapPrice || 0; },

    getStatus() {
      return {
        status: State.prices.status,
        source: State.prices.source,
        sourceLabel: State.prices.sourceLabel,
        rateSource: State.prices.rateSource,
        fetchedAt: State.prices.fetchedAt,
        error: State.prices.error,
        failedSources: State.failedSources.slice(),
        autoRefresh: State.config.autoRefreshEnabled,
        interval: State.config.autoRefreshInterval,
        offset: State.config.offsetEGP,
        diagnostics: State.diagnostics,
      };
    },

    syncNow(opts = {}) {
      return updatePrices({ silent: false, ...opts });
    },

    testSources,

    startAutoRefresh(intervalMs) { return startAutoRefresh(intervalMs); },
    stopAutoRefresh() { return stopAutoRefresh(); },
    setAutoRefresh(enabled) { return setAutoRefresh(enabled); },
    setOffset(offsetEGP) { return setOffset(offsetEGP); },
    getOffset() { return State.config.offsetEGP; },

    on(callback) {
      if (typeof callback !== 'function') return () => {};
      State.listeners.add(callback);
      return () => State.listeners.delete(callback);
    },

    computeKaratPrice(price24, karat) {
      return round(num(price24) * (Number(karat) / 24), 2);
    },

    convertOzToGram(usdPerOz, usdToEgp) {
      const oz = num(usdPerOz);
      const rate = num(usdToEgp);
      if (oz <= 0 || rate <= 0) return 0;
      return round((oz / TROY_OUNCE_GRAMS) * rate, 2);
    },

    init,

    destroy() {
      stopAutoRefresh();
      State.listeners.clear();
      try { State.broadcastChannel?.close?.(); } catch (_) {}
      State.initialized = false;
    },

    get state() { return State; },
    get config() { return { ...State.config }; },
    get prices() { return { ...State.prices }; },
  };

  GMS.PriceManager = PriceManager;
  window.PriceManager = PriceManager;

  /* Auto-init */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      init().catch(e => console.warn('[PriceManager] init failed:', e));
    });
  } else {
    setTimeout(() => init().catch(e => console.warn('[PriceManager] init failed:', e)), 100);
  }

  console.log(
    '%c💹 PriceManager v1.0.1 loaded',
    'color:#0f7a43;font-weight:900;font-size:13px;padding:2px 6px;' +
    'background:linear-gradient(135deg,#a8dfc4,#0f7a43);border-radius:4px;'
  );

  console.log(
    '%c🌐 Gold: GoldPrice.org + Gold-API.com · Rate: Open ER + Frankfurter',
    'color:#6b7a95;font-weight:700;font-size:11px;'
  );

  console.log(
    '%c🔍 للتشخيص: PriceManager.testSources()',
    'color:#1c4fd8;font-weight:700;font-size:11px;'
  );

})();
