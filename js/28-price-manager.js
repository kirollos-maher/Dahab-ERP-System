/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ENTERPRISE — js/28-price-manager.js
   مدير أسعار الذهب اللحظية المباشرة — Real-Time Gold Price Manager
   ─────────────────────────────────────────────────────────────────────
   المزايا:
     • جلب سعر الأونصة العالمي XAU/USD (بدون مفتاح API)
     • تحويل تلقائي إلى الجنيه المصري (EGP)
     • حساب تلقائي لجميع العيارات (24 / 21 / 18 / مخصص)
     • استراتيجية Fallback Multi-Source (3 مصادر)
     • تحديث تلقائي كل X ثانية (افتراضي 60)
     • هامش صاغة محلي قابل للتعديل (Spread/Margin Offset)
     • Event Bus — إشعار جميع أجزاء النظام فوراً
     • Publish/Subscribe Pattern
     • التخزين المؤقت وحالة الأوفلاين (LocalStorage + CacheDB)
     • واجهة برمجية: window.PriceManager
     • محصّن بالكامل بـ try...catch

   المصادر المستخدمة:
     1 · XAUS.com     → https://xaus.com/api/v1/spot?compact=1
     2 · goldprice.dev → https://api.goldprice.dev/v1/prices?symbol=XAU-USD-SPOT
     3 · exchangerate.fun → https://api.exchangerate.fun/latest
     4 · currency-api  → CDN fallback

   Export:
     • window.PriceManager
     • GMS.PriceManager
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const GMS = window.GMS = window.GMS || {};

  /* ═════════════════════════════════════════════════════════════════════
     §1 · CONSTANTS
     ═════════════════════════════════════════════════════════════════════ */

  const TROY_OUNCE_GRAMS = 31.1034768;   /* 1 أونصة = 31.1035 جرام */

  const STORAGE_KEYS = {
    PRICES:      'gms.price.prices',       /* الأسعار الكاملة */
    LAST_FETCH:  'gms.price.lastFetch',    /* آخر وقت جلب */
    OFFSET:      'gms.price.offset',       /* هامش الصاغة */
    AUTO_REFRESH:'gms.price.autoRefresh',  /* إعدادات التحديث التلقائي */
    SOURCE:      'gms.price.lastSource',   /* آخر مصدر ناجح */
  };

  const DEFAULT_CONFIG = {
    autoRefreshEnabled: true,
    autoRefreshInterval: 60000,   /* 60 ثانية */
    offsetEGP: 0,                 /* هامش الصاغة بالجنيه */
    maxRetries: 3,
    retryDelay: 2000,
    fetchTimeout: 8000,           /* 8 ثواني timeout */
    cacheMaxAgeMs: 5 * 60 * 1000, /* 5 دقائق */
  };

  /* قائمة المصادر — مرتبة حسب الأولوية */
  const SOURCES = [
    {
      key: 'xaus',
      name: 'XAUS.com',
      label: 'XAUS Gold API',
      url: 'https://xaus.com/api/v1/spot?compact=1',
      type: 'xau_usd',
      parse: parseXAUSResponse,
      enabled: true,
    },
    {
      key: 'goldprice',
      name: 'goldprice.dev',
      label: 'GoldPrice.dev API',
      url: 'https://api.goldprice.dev/v1/prices?symbol=XAU-USD-SPOT',
      type: 'xau_usd',
      parse: parseGoldPriceDevResponse,
      enabled: true,
    },
    {
      key: 'exchangerate',
      name: 'exchangerate.fun',
      label: 'ExchangeRate.fun API',
      url: 'https://api.exchangerate.fun/latest',
      type: 'usd_egp_only',
      parse: parseExchangeRateResponse,
      enabled: true,
    },
  ];

  const FALLBACK_RATE_USD_EGP = 48.50;  /* سعر احتياطي لو كل المصادر فشلت */

  /* ═════════════════════════════════════════════════════════════════════
     §2 · STATE
     ═════════════════════════════════════════════════════════════════════ */
  const State = {
    /* الأسعار الحالية */
    prices: {
      price24: 0,         /* سعر جرام 24K بالجنيه */
      price21: 0,
      price18: 0,
      price22: 0,
      price14: 0,
      scrapPrice: 0,      /* سعر شراء الكسر */
      spread: 0,          /* هامش الصاغة */
      source: 'none',     /* المصدر الحالي */
      sourceLabel: '',    /* وصف المصدر */
      fetchedAt: null,    /* وقت الجلب */
      usdPerOz: 0,        /* سعر الأونصة بالدولار */
      usdToEgp: 0,        /* سعر صرف الدولار */
      status: 'idle',     /* idle | fetching | fresh | stale | error */
      error: null,
    },

    /* الإعدادات */
    config: { ...DEFAULT_CONFIG },

    /* المستمعون */
    listeners: new Set(),

    /* التحديث التلقائي */
    autoRefreshTimer: null,

    /* حالة أولية */
    initialized: false,

    /* آخر محاولة */
    lastAttempt: null,

    /* مصادر فاشلة في آخر دورة */
    failedSources: [],

    /* BroadcastChannel */
    broadcastChannel: null,
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

  function timeAr(date) {
    try {
      const d = date instanceof Date ? date : new Date(date);
      return d.toLocaleTimeString('ar-EG', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (_) {
      return '—';
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §4 · FETCH WITH TIMEOUT
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * جلب مع مهلة زمنية
   * @param {string} url
   * @param {number} [timeoutMs=8000]
   * @returns {Promise<Response>}
   */
  async function fetchWithTimeout(url, timeoutMs = 8000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
        },
        cache: 'no-store',
      });
      clearTimeout(timer);
      return response;
    } catch (e) {
      clearTimeout(timer);
      throw e;
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §5 · RESPONSE PARSERS
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * تحليل استجابة XAUS.com
   * @param {Object} data
   * @returns {{spot_usd_oz: number, status: string, asOf: string}|null}
   */
  function parseXAUSResponse(data) {
    try {
      if (!data || typeof data !== 'object') return null;

      const spot = num(data.spot_usd_oz || data.xau?.price);
      if (!spot || spot <= 0) return null;

      const state = data.data_state || {};
      const status = state.status || 'fresh';   /* 'fresh' | 'stale' */

      return {
        spot_usd_oz: spot,
        status,
        asOf: state.as_of || data.updated_at || new Date().toISOString(),
        ageSeconds: num(state.age_seconds, 0),
      };
    } catch (e) {
      console.warn('[PriceManager] parseXAUSResponse failed:', e);
      return null;
    }
  }

  /**
   * تحليل استجابة goldprice.dev
   * @param {Object} data
   * @returns {{spot_usd_oz: number, status: string, asOf: string}|null}
   */
  function parseGoldPriceDevResponse(data) {
    try {
      if (!data || typeof data !== 'object') return null;

      const price = num(data.price || data.spot_usd_oz);
      if (!price || price <= 0) return null;

      const isStale = data.is_stale === true;

      return {
        spot_usd_oz: price,
        status: isStale ? 'stale' : 'fresh',
        asOf: data.computed_at || new Date().toISOString(),
        ageSeconds: 0,
      };
    } catch (e) {
      console.warn('[PriceManager] parseGoldPriceDevResponse failed:', e);
      return null;
    }
  }

  /**
   * تحليل استجابة exchangerate.fun (سعر الصرف فقط)
   * @param {Object} data
   * @returns {{usd_egp: number}|null}
   */
  function parseExchangeRateResponse(data) {
    try {
      if (!data || typeof data !== 'object') return null;

      const rates = data.rates || {};
      const egp = num(rates.EGP || rates.egp);

      if (!egp || egp <= 0) return null;

      return { usd_egp: egp };
    } catch (e) {
      console.warn('[PriceManager] parseExchangeRateResponse failed:', e);
      return null;
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §6 · FETCH USD/EGP (مصدر منفصل)
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * جلب سعر صرف USD/EGP
   * @returns {Promise<number>}
   */
  async function fetchUSDToEGP() {
    /* المصدر 1: exchangerate.fun */
    try {
      const r = await fetchWithTimeout(
        'https://api.exchangerate.fun/latest',
        6000
      );
      if (r.ok) {
        const data = await r.json();
        const parsed = parseExchangeRateResponse(data);
        if (parsed && parsed.usd_egp > 0) {
          console.log('[PriceManager] ✅ USD/EGP من exchangerate.fun:', parsed.usd_egp);
          return parsed.usd_egp;
        }
      }
    } catch (e) {
      console.warn('[PriceManager] exchangerate.fun failed:', e.message);
    }

    /* المصدر 2: currency-api (CDN) */
    try {
      const r = await fetchWithTimeout(
        'https://cdn.jsdelivr.net/gh/NemesisX1/currency-api@main/v1/currencies/usd.min.json',
        6000
      );
      if (r.ok) {
        const data = await r.json();
        const egp = num(data.usd?.egp || data.egp);
        if (egp > 0) {
          console.log('[PriceManager] ✅ USD/EGP من currency-api:', egp);
          return egp;
        }
      }
    } catch (e) {
      console.warn('[PriceManager] currency-api failed:', e.message);
    }

    /* المصدر 3: open.er-api.com */
    try {
      const r = await fetchWithTimeout('https://open.er-api.com/v6/latest/USD', 6000);
      if (r.ok) {
        const data = await r.json();
        const egp = num(data.rates?.EGP);
        if (egp > 0) {
          console.log('[PriceManager] ✅ USD/EGP من open.er-api.com:', egp);
          return egp;
        }
      }
    } catch (e) {
      console.warn('[PriceManager] open.er-api.com failed:', e.message);
    }

    /* fallback */
    console.warn('[PriceManager] ⚠️ كل مصادر USD/EGP فشلت — استخدام القيمة الاحتياطية');
    return FALLBACK_RATE_USD_EGP;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §7 · COMPUTE KARAT PRICES
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * حساب أسعار كل العيارات من سعر 24K
   * @param {number} price24
   * @param {number} offsetEGP
   * @returns {Object}
   */
  function computeKaratPrices(price24, offsetEGP = 0) {
    const p = num(price24);
    const off = num(offsetEGP);

    /* الأسعار الأساسية من البورصة */
    const base24 = p;
    const base22 = round(p * (22 / 24), 2);
    const base21 = round(p * (21 / 24), 2);
    const base18 = round(p * (18 / 24), 2);
    const base14 = round(p * (14 / 24), 2);

    /* تطبيق هامش الصاغة */
    const price24Final = round(base24 + off, 2);
    const price22Final = round(base22 + off, 2);
    const price21Final = round(base21 + off, 2);
    const price18Final = round(base18 + off, 2);
    const price14Final = round(base14 + off, 2);

    /* سعر الشراء (الكسر) — افتراضي 8% أقل */
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
      base24,
      base21,
      base18,
    };
  }

  /* ═════════════════════════════════════════════════════════════════════
     §8 · FETCH LIVE GOLD PRICES (Multi-Source Fallback)
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * جلب أسعار الذهب اللحظية من مصادر متعددة
   * @returns {Promise<Object>}
   */
  async function fetchLiveGoldPrices() {
    const results = {
      success: false,
      spot_usd_oz: 0,
      usdToEgp: 0,
      source: 'none',
      status: 'error',
      error: null,
    };

    /* 1 · جلب سعر USD/EGP أولاً (بالتوازي) */
    let usdToEgp = FALLBACK_RATE_USD_EGP;
    try {
      usdToEgp = await fetchUSDToEGP();
    } catch (e) {
      console.warn('[PriceManager] USD/EGP fetch failed:', e);
    }
    results.usdToEgp = usdToEgp;

    /* 2 · محاولة كل مصدر للحصول على سعر الأونصة */
    State.failedSources = [];

    for (const source of SOURCES) {
      if (!source.enabled) continue;
      if (source.type === 'usd_egp_only') continue; /* تم بالفعل */

      try {
        console.log(`[PriceManager] 🔄 محاولة: ${source.name}…`);

        const response = await fetchWithTimeout(source.url, State.config.fetchTimeout);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        const parsed = source.parse(data);

        if (!parsed || !parsed.spot_usd_oz || parsed.spot_usd_oz <= 0) {
          throw new Error('بيانات غير صالحة من المصدر');
        }

        console.log(`[PriceManager] ✅ ${source.name}: $${parsed.spot_usd_oz}/oz (${parsed.status})`);

        results.success = true;
        results.spot_usd_oz = parsed.spot_usd_oz;
        results.source = source.key;
        results.status = parsed.status === 'stale' ? 'stale' : 'fresh';
        results.asOf = parsed.asOf;
        results.sourceLabel = source.label;

        return results;

      } catch (e) {
        console.warn(`[PriceManager] ⚠️ ${source.name} فشل:`, e.message);
        State.failedSources.push({
          key: source.key,
          name: source.name,
          error: e.message,
        });
        /* الانتقال للمصدر التالي */
      }
    }

    /* 3 · فشل كل المصادر → استخدام الكاش */
    console.warn('[PriceManager] ❌ جميع المصادر فشلت');

    const cached = loadCachedPrices();
    if (cached && cached.price24 > 0) {
      results.success = true;
      results.fromCache = true;
      results.status = 'stale';
      results.spot_usd_oz = cached.usdPerOz || 0;
      results.usdToEgp = cached.usdToEgp || usdToEgp;
      results.source = 'cache';
      results.sourceLabel = 'الذاكرة المؤقتة';
      results.error = 'لا يوجد اتصال — استخدام آخر سعر محفوظ';
      return results;
    }

    /* 4 · لا يوجد كاش → فشل كامل */
    results.error = 'لا يمكن جلب الأسعار من أي مصدر';
    return results;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §9 · UPDATE PRICES (Main Pipeline)
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * تحديث الأسعار — الدالة الرئيسية
   * @param {Object} [opts]
   * @param {boolean} [opts.silent=false]
   * @param {string} [opts.source='auto']
   * @returns {Promise<Object>}
   */
  async function updatePrices(opts = {}) {
    const { silent = false, source = 'auto' } = opts;

    if (State.prices.status === 'fetching') {
      console.log('[PriceManager] ⏳ تحديث جارٍ بالفعل…');
      return { success: false, reason: 'already_fetching' };
    }

    State.prices.status = 'fetching';
    State.lastAttempt = new Date().toISOString();

    try {
      /* 1 · جلب البيانات */
      const result = await fetchLiveGoldPrices();

      if (!result.success) {
        State.prices.status = 'error';
        State.prices.error = result.error;

        if (!silent) {
          GMS.Toast?.warn?.(
            'فشل تحديث الأسعار',
            result.error || 'تعذّر الاتصال بمصادر البيانات'
          );
        }

        /* إشعار المستمعين بالفشل */
        notifyListeners({ error: result.error });
        return result;
      }

      /* 2 · حساب الأسعار */
      const offset = num(State.config.offsetEGP, 0);
      const usdPerOz = num(result.spot_usd_oz);
      const usdToEgp = num(result.usdToEgp) || FALLBACK_RATE_USD_EGP;

      /* المعادلة: price24 = (USD/oz ÷ 31.1035) × USD/EGP */
      const price24Base = round(
        (usdPerOz / TROY_OUNCE_GRAMS) * usdToEgp,
        2
      );

      /* 3 · حساب كل العيارات */
      const karats = computeKaratPrices(price24Base, offset);

      /* 4 · تحديث الحالة */
      const oldPrice24 = State.prices.price24;

      State.prices = {
        ...State.prices,
        ...karats,
        usdPerOz,
        usdToEgp,
        source: result.source,
        sourceLabel: result.sourceLabel || result.source,
        fetchedAt: new Date().toISOString(),
        status: result.status === 'stale' ? 'stale' : 'fresh',
        error: result.error || null,
      };

      /* 5 · حفظ في الكاش */
      savePricesToCache();

      /* 6 · حفظ في CacheDB (لتكامل مع النظام) */
      savePricesToCacheDB();

      /* 7 · إطلاق الأحداث */
      dispatchPriceEvent(State.prices);
      notifyListeners(State.prices);

      /* 8 · Broadcast للتبويبات الأخرى */
      broadcastToTabs(State.prices);

      /* 9 · تحديث الذاكرة المحلية للنظام */
      updateSystemCache(State.prices);

      /* 10 · إشعار */
      if (!silent) {
        const changeInfo = oldPrice24 > 0
          ? ` (${oldPrice24} → ${State.prices.price24})`
          : '';

        GMS.Toast?.ok?.(
          'تم تحديث أسعار الذهب',
          `24K: ${State.prices.price24} ج.م/جم${changeInfo}`
        );
      }

      console.log(
        `%c💰 Price updated via ${State.prices.sourceLabel}`,
        'color:#c8a24a;font-weight:900;font-size:12px;',
        {
          '24K': State.prices.price24,
          '21K': State.prices.price21,
          '18K': State.prices.price18,
          'USD/EGP': State.prices.usdToEgp,
          'XAU/USD': State.prices.usdPerOz,
        }
      );

      return {
        success: true,
        prices: State.prices,
        source: State.prices.source,
      };

    } catch (e) {
      console.error('[PriceManager] Update failed:', e);
      State.prices.status = 'error';
      State.prices.error = e.message;

      if (!silent) {
        GMS.Toast?.err?.('فشل تحديث الأسعار', e.message);
      }

      notifyListeners({ error: e.message });
      return { success: false, error: e.message };

    } finally {
      State.lastAttempt = new Date().toISOString();
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §10 · EVENT DISPATCH
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * إطلاق CustomEvent عالمي
   * @param {Object} prices
   */
  function dispatchPriceEvent(prices) {
    try {
      const event = new CustomEvent('goldPriceUpdated', {
        detail: {
          prices: { ...prices },
          timestamp: Date.now(),
          source: prices.source,
        },
      });
      window.dispatchEvent(event);
      console.log('[PriceManager] 📢 goldPriceUpdated event dispatched');
    } catch (e) {
      console.warn('[PriceManager] dispatchPriceEvent failed:', e);
    }
  }

  /**
   * إبلاغ المستمعين المسجلين
   * @param {Object} data
   */
  function notifyListeners(data) {
    State.listeners.forEach(fn => {
      try {
        fn(data);
      } catch (e) {
        console.warn('[PriceManager.listener]', e);
      }
    });
  }

  /**
   * بث للتبويبات الأخرى
   * @param {Object} prices
   */
  function broadcastToTabs(prices) {
    try {
      if (!State.broadcastChannel && typeof BroadcastChannel !== 'undefined') {
        State.broadcastChannel = new BroadcastChannel('gms-price-sync');
        State.broadcastChannel.onmessage = (e) => {
          if (e.data?.type === 'PRICE_UPDATE') {
            console.log('[PriceManager] 📥 تحديث من تبويب آخر');
            /* تحديث محلي بدون إعادة جلب */
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

  /**
   * تطبيق أسعار واردة من تبويب آخر
   * @param {Object} prices
   */
  function applyPricesFromBroadcast(prices) {
    try {
      if (!prices || !prices.price24) return;
      if (Math.abs((State.prices.price24 || 0) - prices.price24) < 0.01) return;

      const oldPrice = State.prices.price24;
      State.prices = { ...State.prices, ...prices };

      savePricesToCache();
      updateSystemCache(State.prices);
      dispatchPriceEvent(State.prices);
      notifyListeners(State.prices);

      console.log(`[PriceManager] Synced from tab: ${oldPrice} → ${prices.price24}`);
    } catch (e) {
      console.warn('[PriceManager] applyPricesFromBroadcast failed:', e);
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §11 · SYSTEM CACHE INTEGRATION
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * تحديث ذاكرة النظام (GMS.Cache) لتتكامل مع باقي المكونات
   * @param {Object} prices
   */
  function updateSystemCache(prices) {
    try {
      /* 1 · تحديث Cache LS */
      if (GMS.Cache?.ls?.set) {
        GMS.Cache.ls.set(GMS.LS_KEYS.CACHE_PRICE, {
          price_24: prices.price24,
          price_21: prices.price21,
          price_18: prices.price18,
          updated_at: prices.fetchedAt,
          source: prices.sourceLabel || prices.source,
        });

        /* 2 · اشتقاق جدول العيارات */
        if (GMS.Cache._deriveKaratBoard) {
          GMS.Cache._deriveKaratBoard({ price_24: prices.price24 });
        }
      }
    } catch (e) {
      console.warn('[PriceManager] updateSystemCache failed:', e);
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §12 · CACHE PERSISTENCE
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * حفظ الأسعار في LocalStorage
   */
  function savePricesToCache() {
    try {
      localStorage.setItem(STORAGE_KEYS.PRICES, JSON.stringify({
        ...State.prices,
        savedAt: Date.now(),
      }));
      localStorage.setItem(STORAGE_KEYS.LAST_FETCH, String(Date.now()));
      localStorage.setItem(STORAGE_KEYS.SOURCE, State.prices.source || '');
    } catch (e) {
      console.warn('[PriceManager] savePricesToCache failed:', e);
    }
  }

  /**
   * قراءة الأسعار من LocalStorage
   * @returns {Object|null}
   */
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

  /**
   * حفظ في CacheDB (IndexedDB metadata) للتكامل مع النظام
   */
  async function savePricesToCacheDB() {
    try {
      if (GMS.IDB?.metaSet) {
        await GMS.IDB.metaSet('gold_prices', {
          ...State.prices,
          savedAt: Date.now(),
        });
      }
    } catch (e) {
      console.warn('[PriceManager] savePricesToCacheDB failed:', e);
    }
  }

  /**
   * استرجاع الأسعار من CacheDB
   */
  async function loadPricesFromCacheDB() {
    try {
      if (GMS.IDB?.metaGet) {
        const cached = await GMS.IDB.metaGet('gold_prices');
        if (cached && cached.price24 > 0) return cached;
      }
    } catch (_) {}
    return null;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §13 · AUTO REFRESH
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * بدء التحديث التلقائي
   * @param {number} [intervalMs]
   */
  function startAutoRefresh(intervalMs) {
    const interval = num(intervalMs, State.config.autoRefreshInterval);

    stopAutoRefresh();

    if (!State.config.autoRefreshEnabled) {
      console.log('[PriceManager] Auto-refresh معطّل');
      return;
    }

    State.config.autoRefreshInterval = interval;

    State.autoRefreshTimer = setInterval(() => {
      /* تجاهل إذا كانت الصفحة مخفية */
      if (document.hidden) return;

      /* تجاهل إذا كنا في وضع fetching */
      if (State.prices.status === 'fetching') return;

      console.log('[PriceManager] 🔄 Auto-refresh tick');
      updatePrices({ silent: true, source: 'auto' }).catch(() => {});

    }, interval);

    /* حفظ الإعداد */
    try {
      localStorage.setItem(STORAGE_KEYS.AUTO_REFRESH, JSON.stringify({
        enabled: true,
        interval,
      }));
    } catch (_) {}

    console.log(`[PriceManager] ✅ Auto-refresh بدأ (كل ${interval / 1000} ثانية)`);
  }

  /**
   * إيقاف التحديث التلقائي
   */
  function stopAutoRefresh() {
    if (State.autoRefreshTimer) {
      clearInterval(State.autoRefreshTimer);
      State.autoRefreshTimer = null;
      console.log('[PriceManager] 🛑 Auto-refresh متوقف');
    }
  }

  /**
   * تفعيل/تعطيل التحديث التلقائي
   * @param {boolean} enabled
   */
  function setAutoRefresh(enabled) {
    State.config.autoRefreshEnabled = Boolean(enabled);

    if (enabled) {
      startAutoRefresh();
    } else {
      stopAutoRefresh();
    }

    try {
      localStorage.setItem(STORAGE_KEYS.AUTO_REFRESH, JSON.stringify({
        enabled: State.config.autoRefreshEnabled,
        interval: State.config.autoRefreshInterval,
      }));
    } catch (_) {}

    return State.config.autoRefreshEnabled;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §14 · SETTINGS
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * ضبط هامش الصاغة (Spread)
   * @param {number} offsetEGP
   */
  function setOffset(offsetEGP) {
    const v = num(offsetEGP, 0);

    /* حد أقصى ±100 جنيه */
    State.config.offsetEGP = Math.max(-100, Math.min(100, v));

    try {
      localStorage.setItem(STORAGE_KEYS.OFFSET, String(State.config.offsetEGP));
    } catch (_) {}

    console.log(`[PriceManager] Offset = ${State.config.offsetEGP} ج.م`);

    /* إعادة حساب بدون إعادة جلب */
    if (State.prices.usdPerOz > 0) {
      const basePrice24 = round(
        (State.prices.usdPerOz / TROY_OUNCE_GRAMS) * State.prices.usdToEgp,
        2
      );
      const karats = computeKaratPrices(basePrice24, State.config.offsetEGP);

      State.prices = { ...State.prices, ...karats };

      savePricesToCache();
      updateSystemCache(State.prices);
      dispatchPriceEvent(State.prices);
      notifyListeners(State.prices);
    }

    return State.config.offsetEGP;
  }

  /**
   * قراءة هامش الصاغة
   */
  function getOffset() {
    return State.config.offsetEGP;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §15 · CONFIG PERSISTENCE
     ═════════════════════════════════════════════════════════════════════ */

  function loadConfig() {
    /* Auto-refresh */
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.AUTO_REFRESH);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.enabled === 'boolean') {
          State.config.autoRefreshEnabled = parsed.enabled;
        }
        if (parsed.interval > 0) {
          State.config.autoRefreshInterval = num(
            parsed.interval,
            DEFAULT_CONFIG.autoRefreshInterval
          );
        }
      }
    } catch (_) {}

    /* Offset */
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.OFFSET);
      if (raw !== null) {
        State.config.offsetEGP = num(raw, 0);
      }
    } catch (_) {}

    console.log('[PriceManager] Config loaded:', {
      autoRefresh: State.config.autoRefreshEnabled,
      interval: State.config.autoRefreshInterval / 1000 + 's',
      offset: State.config.offsetEGP + ' ج.م',
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §16 · INIT
     ═════════════════════════════════════════════════════════════════════ */

  async function init() {
    if (State.initialized) return State.prices;
    State.initialized = true;

    console.log(
      '%c💹 PriceManager initializing…',
      'color:#D4A017;font-weight:800;font-size:12px;'
    );

    /* 1 · تحميل الإعدادات */
    loadConfig();

    /* 2 · استرجاع آخر أسعار من الكاش */
    const cached = loadCachedPrices();

    if (cached && cached.price24 > 0) {
      State.prices = { ...State.prices, ...cached };

      const ageMs = Date.now() - (cached.savedAt || 0);
      const ageMinutes = Math.round(ageMs / 60000);

      console.log(`[PriceManager] 📦 Cache loaded (${ageMinutes} دقيقة)`);

      /* تحديث ذاكرة النظام */
      updateSystemCache(State.prices);

      /* إطلاق حدث أولي */
      setTimeout(() => {
        dispatchPriceEvent(State.prices);
        notifyListeners(State.prices);
      }, 100);
    } else {
      /* محاولة CacheDB */
      try {
        const fromIDB = await loadPricesFromCacheDB();
        if (fromIDB && fromIDB.price24 > 0) {
          State.prices = { ...State.prices, ...fromIDB };
          updateSystemCache(State.prices);
          console.log('[PriceManager] 📦 Cache loaded from IndexedDB');
        }
      } catch (_) {}
    }

    /* 3 · جلب أول أسعار في الخلفية */
    setTimeout(() => {
      updatePrices({ silent: true, source: 'init' }).catch(() => {});
    }, 500);

    /* 4 · بدء التحديث التلقائي */
    if (State.config.autoRefreshEnabled) {
      startAutoRefresh();
    }

    /* 5 · الاستماع لتغييرات التبويبات */
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEYS.PRICES && e.newValue) {
        try {
          const data = JSON.parse(e.newValue);
          if (data && data.price24 > 0) {
            applyPricesFromBroadcast(data);
          }
        } catch (_) {}
      }
    });

    /* 6 · استئناف عند عودة التبويب للظهور */
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;

      const ageMs = Date.now() - new Date(State.prices.fetchedAt || 0).getTime();
      const needsRefresh = !State.prices.fetchedAt
        || ageMs > State.config.autoRefreshInterval * 1.5;

      if (needsRefresh && State.config.autoRefreshEnabled) {
        console.log('[PriceManager] 👁 Tab visible — refreshing…');
        updatePrices({ silent: true, source: 'visibility' }).catch(() => {});
      }
    });

    /* 7 · استئناف عند عودة الإنترنت */
    window.addEventListener('online', () => {
      console.log('[PriceManager] 🌐 Online — refreshing…');
      setTimeout(() => {
        updatePrices({ silent: true, source: 'online' }).catch(() => {});
      }, 1500);
    });

    console.log(
      '%c✅ PriceManager initialized',
      'color:#0f7a43;font-weight:800;font-size:12px;'
    );

    return State.prices;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §17 · PUBLIC API
     ═════════════════════════════════════════════════════════════════════ */

  const PriceManager = {

    /* ─── قراءة ─── */

    /**
     * قراءة الأسعار الحالية
     * @returns {Object}
     */
    getCurrentPrices() {
      return { ...State.prices };
    },

    /**
     * قراءة السعر الحالي لـ 24K
     * @returns {number}
     */
    current() {
      return State.prices.price24 || 0;
    },

    /**
     * سعر عيار معين
     * @param {number} karat
     * @returns {number}
     */
    forKarat(karat) {
      const k = Number(karat);
      if (k === 24) return State.prices.price24 || 0;
      if (k === 22) return State.prices.price22 || 0;
      if (k === 21) return State.prices.price21 || 0;
      if (k === 18) return State.prices.price18 || 0;
      if (k === 14) return State.prices.price14 || 0;

      /* مخصص */
      if (isFinite(k) && k > 0 && k <= 24) {
        return round((State.prices.price24 || 0) * (k / 24), 2);
      }
      return 0;
    },

    /**
     * سعر شراء الكسر
     * @returns {number}
     */
    scrapPrice() {
      return State.prices.scrapPrice || 0;
    },

    /**
     * حالة النظام
     * @returns {Object}
     */
    getStatus() {
      return {
        status: State.prices.status,
        source: State.prices.source,
        sourceLabel: State.prices.sourceLabel,
        fetchedAt: State.prices.fetchedAt,
        error: State.prices.error,
        failedSources: State.failedSources.slice(),
        autoRefresh: State.config.autoRefreshEnabled,
        interval: State.config.autoRefreshInterval,
        offset: State.config.offsetEGP,
      };
    },

    /* ─── تحكم ─── */

    /**
     * تحديث فوري
     * @param {Object} [opts]
     * @returns {Promise<Object>}
     */
    syncNow(opts = {}) {
      return updatePrices({ silent: false, source: 'manual', ...opts });
    },

    /**
     * بدء التحديث التلقائي
     * @param {number} [intervalMs]
     */
    startAutoRefresh(intervalMs) {
      return startAutoRefresh(intervalMs);
    },

    /**
     * إيقاف التحديث التلقائي
     */
    stopAutoRefresh() {
      return stopAutoRefresh();
    },

    /**
     * تفعيل/تعطيل التحديث التلقائي
     * @param {boolean} enabled
     */
    setAutoRefresh(enabled) {
      return setAutoRefresh(enabled);
    },

    /**
     * ضبط هامش الصاغة
     * @param {number} offsetEGP
     */
    setOffset(offsetEGP) {
      return setOffset(offsetEGP);
    },

    /**
     * قراءة هامش الصاغة
     */
    getOffset() {
      return getOffset();
    },

    /* ─── اشتراك ─── */

    /**
     * الاشتراك في تحديثات الأسعار
     * @param {Function} callback
     * @returns {Function} unsubscribe
     */
    on(callback) {
      if (typeof callback !== 'function') return () => {};
      State.listeners.add(callback);
      return () => State.listeners.delete(callback);
    },

    /* ─── أدوات ─── */

    /**
     * حساب سعر أي عيار
     * @param {number} price24
     * @param {number} karat
     */
    computeKaratPrice(price24, karat) {
      return round(num(price24) * (Number(karat) / 24), 2);
    },

    /**
     * تحويل USD/oz إلى EGP/g
     * @param {number} usdPerOz
     * @param {number} usdToEgp
     */
    convertOzToGram(usdPerOz, usdToEgp) {
      const oz = num(usdPerOz);
      const rate = num(usdToEgp);
      if (oz <= 0 || rate <= 0) return 0;
      return round((oz / TROY_OUNCE_GRAMS) * rate, 2);
    },

    /* ─── تهيئة ─── */
    init,

    /* ─── تفريغ ─── */
    destroy() {
      stopAutoRefresh();
      State.listeners.clear();
      try { State.broadcastChannel?.close?.(); } catch (_) {}
      State.initialized = false;
      console.log('[PriceManager] 🛑 Destroyed');
    },

    /* ─── State (للقراءة فقط) ─── */
    get state() { return State; },
    get config() { return { ...State.config }; },
    get prices() { return { ...State.prices }; },
    get sources() { return SOURCES.map(s => ({ ...s })); },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §18 · EXPORT
     ═════════════════════════════════════════════════════════════════════ */
  GMS.PriceManager = PriceManager;
  window.PriceManager = PriceManager;

  /* ═════════════════════════════════════════════════════════════════════
     §19 · AUTO-INIT
     ═════════════════════════════════════════════════════════════════════ */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      init().catch(e => console.warn('[PriceManager] init failed:', e));
    });
  } else {
    setTimeout(() => {
      init().catch(e => console.warn('[PriceManager] init failed:', e));
    }, 100);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §20 · LOADED CONFIRMATION
     ═════════════════════════════════════════════════════════════════════ */
  console.log(
    '%c💹 PriceManager v1.0.0 loaded · Real-Time Gold Prices',
    'color:#0f7a43;font-weight:900;font-size:13px;padding:2px 6px;' +
    'background:linear-gradient(135deg,#a8dfc4,#0f7a43);border-radius:4px;'
  );

  console.log(
    '%c🌐 3 Sources · XAUS + GoldPrice.dev + ExchangeRate.fun · CORS-enabled',
    'color:#6b7a95;font-weight:700;font-size:11px;'
  );

  console.log(
    '%c⚡ API: PriceManager.getCurrentPrices() · syncNow() · setOffset() · on()',
    'color:#1c4fd8;font-weight:700;font-size:11px;'
  );

  /* ═════════════════════════════════════════════════════════════════════
     ✅ js/28-price-manager.js — نهاية الملف
     ═════════════════════════════════════════════════════════════════════ */

})();