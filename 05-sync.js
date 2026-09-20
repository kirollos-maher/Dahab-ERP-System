/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ENTERPRISE — js/05-sync.js
   محرك المزامنة الشامل:
     - Full Sync (تحميل كامل)
     - Delta Sync (المزامنة التفاضلية)
     - Offline Queue Push (رفع الطابور)
     - Realtime WebSocket (التحديثات المباشرة)
     - Auto-reconnect (إعادة الاتصال التلقائي)
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const GMS = window.GMS = window.GMS || {};

  /* ═════════════════════════════════════════════════════════════════════
     §1 · SYNC STATE
     ═════════════════════════════════════════════════════════════════════ */
  const SyncState = {
    /* حالة الاتصال */
    online: true,
    supabaseReady: false,
    channel: null,
    channelStatus: 'idle',
    reconnectAttempts: 0,
    reconnectTimer: null,

    /* حالة المزامنة */
    syncing: false,
    syncType: null,          // 'full' | 'delta' | 'queue' | 'realtime'

    /* إحصائيات */
    stats: {
      lastSync: null,
      lastFullSync: null,
      lastDeltaSync: null,
      lastQueuePush: null,
      lastRealtimeEvent: null,
      totalSyncs: 0,
      totalEvents: 0,
      totalBytesDownloaded: 0,
      totalItemsSynced: 0,
      totalQueueItemsPushed: 0,
      failedSyncs: 0,
    },

    /* سجل المزامنة */
    log: [],

    /* المستمعون */
    listeners: {
      syncStart: new Set(),
      syncProgress: new Set(),
      syncComplete: new Set(),
      syncError: new Set(),
      onlineChange: new Set(),
      queueChange: new Set(),
      realtimeEvent: new Set(),
    },

    /* رد النداء أثناء التقدم */
    _progressCallback: null,
  };

  /* ═════════════════════════════════════════════════════════════════════
     §2 · LOG ENGINE
     ═════════════════════════════════════════════════════════════════════ */
  const SyncLog = {
    MAX: 200,

    /**
     * إضافة إدخال
     * @param {'success'|'error'|'info'|'warn'} level
     * @param {string} title
     * @param {string} [desc='']
     * @param {Object} [meta={}]
     * @returns {Object}
     */
    add(level, title, desc = '', meta = {}) {
      const entry = {
        id: GMS.uid(),
        level,
        title,
        desc,
        meta,
        time: new Date().toISOString(),
      };

      SyncState.log.unshift(entry);
      if (SyncState.log.length > this.MAX) {
        SyncState.log = SyncState.log.slice(0, this.MAX);
      }

      // حفظ في LocalStorage
      try {
        const stored = SyncState.log.slice(0, 50);
        localStorage.setItem(GMS.LS_KEYS.SYNC_LOG, JSON.stringify(stored));
      } catch (_) {}

      return entry;
    },

    /**
     * قراءة السجل
     * @returns {Array}
     */
    getAll() {
      return SyncState.log;
    },

    /**
     * تفريغ السجل
     */
    clear() {
      SyncState.log = [];
      try {
        localStorage.removeItem(GMS.LS_KEYS.SYNC_LOG);
      } catch (_) {}
    },

    /**
     * تحميل من LocalStorage
     */
    load() {
      try {
        const stored = localStorage.getItem(GMS.LS_KEYS.SYNC_LOG);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            SyncState.log = parsed;
          }
        }
      } catch (_) {}
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §3 · EVENT EMITTER
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * إطلاق حدث
   * @param {string} event
   * @param {*} data
   */
  function emit(event, data) {
    const set = SyncState.listeners[event];
    if (!set) return;

    set.forEach(fn => {
      try {
        fn(data);
      } catch (e) {
        console.error(`[Sync.emit:${event}]`, e);
      }
    });
  }

  /**
   * الاشتراك في حدث
   * @param {string} event
   * @param {Function} fn
   * @returns {Function} إلغاء الاشتراك
   */
  function on(event, fn) {
    const set = SyncState.listeners[event];
    if (!set || typeof fn !== 'function') return () => {};

    set.add(fn);
    return () => set.delete(fn);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §4 · CONFIG HELPERS
     ─────────────────────────────────────────────────────────────────────
     يقرأ الإعدادات من LocalStorage أولاً،
     وإن لم توجد → يستخدم GMS.SUPABASE_CREDENTIALS من 01-config.js
     ═════════════════════════════════════════════════════════════════════ */
  const Config = {
    /**
     * قراءة URL
     * @returns {string}
     */
    get url() {
      try {
        const saved = localStorage.getItem(GMS.LS_KEYS.CONFIG_URL);
        if (saved && saved.length > 0) return saved;
      } catch (_) {}
      return (GMS.SUPABASE_CREDENTIALS && GMS.SUPABASE_CREDENTIALS.URL) || '';
    },

    /**
     * قراءة المفتاح
     * @returns {string}
     */
    get key() {
      try {
        const saved = localStorage.getItem(GMS.LS_KEYS.CONFIG_KEY);
        if (saved && saved.length > 0) return saved;
      } catch (_) {}
      return (GMS.SUPABASE_CREDENTIALS && GMS.SUPABASE_CREDENTIALS.ANON_KEY) || '';
    },

    /**
     * حفظ الإعدادات (يُخزَّن في LocalStorage ويُتقدّم على الافتراضي)
     * @param {string} url
     * @param {string} key
     */
    save(url, key) {
      try {
        localStorage.setItem(GMS.LS_KEYS.CONFIG_URL, String(url || '').trim());
        localStorage.setItem(GMS.LS_KEYS.CONFIG_KEY, String(key || '').trim());
      } catch (_) {}
    },

    /**
     * التحقق من الجهوزية
     * @returns {boolean}
     */
    get ready() {
      return Boolean(this.url && this.key && window.supabase);
    },

    /**
     * قراءة مصدر الإعدادات الحالي
     * @returns {'localStorage' | 'config' | 'none'}
     */
    get source() {
      try {
        const savedUrl = localStorage.getItem(GMS.LS_KEYS.CONFIG_URL);
        const savedKey = localStorage.getItem(GMS.LS_KEYS.CONFIG_KEY);
        if (savedUrl && savedKey) return 'localStorage';
      } catch (_) {}

      if (GMS.SUPABASE_CREDENTIALS &&
          GMS.SUPABASE_CREDENTIALS.URL &&
          GMS.SUPABASE_CREDENTIALS.ANON_KEY) {
        return 'config';
      }

      return 'none';
    },

    /**
     * تفريغ الإعدادات (يعود للافتراضي)
     */
    clear() {
      try {
        localStorage.removeItem(GMS.LS_KEYS.CONFIG_URL);
        localStorage.removeItem(GMS.LS_KEYS.CONFIG_KEY);
      } catch (_) {}
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §5 · SUPABASE CLIENT
     ═════════════════════════════════════════════════════════════════════ */
  const SB = {
    client: null,

    /**
     * تهيئة عميل Supabase
     * @returns {Promise<boolean>}
     */
    async init() {
      if (!Config.ready) {
        SyncState.supabaseReady = false;
        console.log(`[SB] Not configured (source: ${Config.source}) — running in demo mode`);
        return false;
      }

      try {
        this.client = window.supabase.createClient(Config.url, Config.key, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false,
          },
          realtime: {
            params: {
              eventsPerSecond: 20,
            },
          },
        });

        // اختبار الاتصال
        const { error } = await this.client
          .from(GMS.SUPABASE_CONFIG.TABLES.INVENTORY)
          .select('id', { count: 'exact', head: true })
          .limit(1);

        if (error) throw error;

        SyncState.supabaseReady = true;
        console.log(`[SB] ✅ Connected to Supabase (source: ${Config.source})`);
        return true;
      } catch (e) {
        console.warn('[SB] Failed to connect:', e.message);
        this.client = null;
        SyncState.supabaseReady = false;
        return false;
      }
    },

    /**
     * الحصول على العميل (أو null)
     * @returns {Object|null}
     */
    get() {
      return this.client;
    },

    /**
     * التحقق من الجهوزية
     * @returns {boolean}
     */
    isReady() {
      return this.client !== null && SyncState.supabaseReady;
    },

    /**
     * إغلاق الاتصال
     */
    async close() {
      if (this.client) {
        try {
          await this.client.removeAllChannels();
        } catch (_) {}
        this.client = null;
      }
      SyncState.supabaseReady = false;
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §6 · DEMO DATA GENERATOR
     ─────────────────────────────────────────────────────────────────────
     يُستخدم عندما لا يوجد اتصال بـ Supabase
     ═════════════════════════════════════════════════════════════════════ */
  const DemoData = {
    _inventory: null,
    _seed: 1337,

    /**
     * توليد مصفوفة المخزون (مرة واحدة)
     * @param {number} [count=1200]
     * @returns {Array}
     */
    getInventory(count = 1200) {
      if (this._inventory) return this._inventory;

      const rnd = this._rand(this._seed);
      const arr = [];
      const categories = GMS.CATEGORIES.slice(0, 10);

      for (let i = 0; i < count; i++) {
        arr.push(this._makeItem(i, rnd, categories));
      }

      this._inventory = arr;
      return arr;
    },

    /**
     * إنشاء صنف واحد
     * @param {number} idx
     * @param {Function} rnd
     * @param {Array} categories
     * @returns {Object}
     */
    _makeItem(idx, rnd, categories) {
      const karat = GMS.KARAT_ORDER[Math.floor(rnd() * 5)];
      const ratio = GMS.karatRatio(karat);
      const cat = categories[Math.floor(rnd() * categories.length)];
      const manu = GMS.DEFAULT_MANUFACTURERS[Math.floor(rnd() * GMS.DEFAULT_MANUFACTURERS.length)];
      const branch = GMS.DEFAULT_BRANCHES[Math.floor(rnd() * GMS.DEFAULT_BRANCHES.length)];

      const gross = GMS.round(1.2 + rnd() * 12, 3);
      const stones = rnd() < 0.15 ? GMS.round(rnd() * 0.5, 3) : 0;
      const net = GMS.round(Math.max(0.3, gross - stones), 3);
      const pure = GMS.round(net * ratio, 4);
      const rate = [95, 110, 125, 140, 160, 185, 210][Math.floor(rnd() * 7)];
      const goldValue = GMS.round(pure * GMS.APP_CONFIG.DEFAULT_PRICE_24, 2);
      const makeValue = GMS.round(net * rate, 2);

      const daysBack = Math.floor(rnd() * 120);
      const created = new Date(Date.now() - daysBack * 86400000);
      const updated = new Date(created.getTime() + Math.floor(rnd() * 5000) * 1000);

      const stamp = String(created.getFullYear()).slice(2) +
        String(created.getMonth() + 1).padStart(2, '0') +
        String(created.getDate()).padStart(2, '0');
      const seq = String(idx + 1).padStart(5, '0');

      const roll = rnd();
      const status = roll < 0.82 ? 'IN_STOCK'
                    : roll < 0.90 ? 'SOLD'
                    : roll < 0.95 ? 'RESERVED'
                    : 'RETURNED';

      return {
        id: 'demo-inv-' + String(idx + 1).padStart(6, '0'),
        sku: `${manu.code}${karat}-${stamp}-${seq}`,
        category: cat,
        karat,
        purity_ratio: ratio,
        weight_grams: gross,
        stone_weight: stones,
        net_weight: net,
        pure_weight: pure,
        workmanship_per_gram: rate,
        workmanship_value: makeValue,
        gold_value: goldValue,
        total_cost: GMS.round(goldValue + makeValue, 2),
        price_24: GMS.APP_CONFIG.DEFAULT_PRICE_24,
        status,
        quantity: 1,
        notes: null,
        branch_id: branch.id,
        branch_name: branch.name,
        manufacturer_code: manu.code,
        manufacturer_name: manu.name,
        letter_code: manu.code,
        created_at: created.toISOString(),
        updated_at: updated.toISOString(),
      };
    },

    /**
     * PRNG محدد
     * @param {number} seed
     * @returns {Function}
     */
    _rand(seed) {
      let a = seed >>> 0;
      return function () {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §7 · FULL SYNC
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * مزامنة كاملة — تحميل كل المخزون من الخادم
   * @param {Object} [opts]
   * @param {Function} [opts.onProgress]
   * @param {boolean} [opts.force=false]
   * @returns {Promise<Object>}
   */
  async function fullSync(opts = {}) {
    const { onProgress, force = false } = opts;

    if (SyncState.syncing && !force) {
      console.warn('[Sync] Sync already in progress');
      return { skipped: true, reason: 'already_syncing' };
    }

    const startedAt = Date.now();
    SyncState.syncing = true;
    SyncState.syncType = 'full';

    const meta = {
      type: 'full',
      startedAt,
      total: 0,
      written: 0,
    };

    emit('syncStart', meta);

    try {
      SyncLog.add('info', 'بدء المزامنة الكاملة', 'تحميل كل الأصناف من الخادم');

      let all;

      if (SB.isReady()) {
        // تحميل من Supabase (بالدفعات)
        all = await fetchAllFromSupabase(onProgress);
      } else {
        // وضع تجريبي
        all = DemoData.getInventory();
        if (onProgress) onProgress(0, all.length);
      }

      meta.total = all.length;

      // تفريغ المخزون القديم
      await GMS.IDB.clearInventory();

      // كتابة بالدفعات
      const batchSize = GMS.SYNC_CONFIG.FULL_SYNC_BATCH;
      let written = 0;

      for (let i = 0; i < all.length; i += batchSize) {
        const batch = all.slice(i, i + batchSize);
        await GMS.IDB.putMany(batch);
        written += batch.length;

        meta.written = written;

        if (onProgress) onProgress(written, all.length);

        // إطلاق التقدم
        emit('syncProgress', {
          type: 'full',
          written,
          total: all.length,
          percent: Math.round((written / all.length) * 100),
        });

        // التنازل لواجهة المستخدم كل دفعة
        await GMS.yieldToUI();
      }

      // حفظ timestamp
      const now = new Date().toISOString();
      await GMS.IDB.metaSet('last_sync', now);
      await GMS.IDB.metaSet('last_full_sync', now);
      await GMS.IDB.metaSet('inventory_count', all.length);

      // تحديث الإحصائيات
      SyncState.stats.lastSync = now;
      SyncState.stats.lastFullSync = now;
      SyncState.stats.totalSyncs++;
      SyncState.stats.totalItemsSynced += all.length;

      const elapsed = Date.now() - startedAt;

      SyncLog.add('success', 'اكتملت المزامنة الكاملة',
        `${GMS.intFmt(all.length)} صنف في ${(elapsed / 1000).toFixed(2)} ثانية`,
        { count: all.length, elapsed }
      );

      const result = {
        success: true,
        type: 'full',
        count: all.length,
        elapsed,
      };

      emit('syncComplete', result);

      return result;

    } catch (e) {
      console.error('[Sync] Full sync failed:', e);
      SyncState.stats.failedSyncs++;

      SyncLog.add('error', 'فشلت المزامنة الكاملة', e.message);

      emit('syncError', { type: 'full', error: e.message });

      throw e;

    } finally {
      SyncState.syncing = false;
      SyncState.syncType = null;
    }
  }

  /**
   * تحميل كل البيانات من Supabase بالدفعات
   * @param {Function} [onProgress]
   * @returns {Promise<Array>}
   */
  async function fetchAllFromSupabase(onProgress) {
    const client = SB.get();
    if (!client) throw new Error('Supabase client not ready');

    const table = GMS.SUPABASE_CONFIG.TABLES.INVENTORY;
    const pageSize = GMS.SUPABASE_CONFIG.MAX_ROWS_PER_BATCH;

    // 1 · احصل على العدد الكلي أولاً
    const { count, error: countError } = await client
      .from(table)
      .select('id', { count: 'exact', head: true });

    if (countError) throw countError;

    const total = count || 0;
    if (total === 0) return [];

    if (onProgress) onProgress(0, total);

    // 2 · جلب الصفحات
    const out = [];
    let offset = 0;

    while (offset < total) {
      const { data, error } = await client
        .from(table)
        .select(GMS.SUPABASE_CONFIG.INVENTORY_COLUMNS.join(','))
        .order('updated_at', { ascending: true })
        .range(offset, offset + pageSize - 1);

      if (error) throw error;
      if (!data || !data.length) break;

      out.push(...data);
      offset += data.length;

      if (onProgress) onProgress(out.length, total);

      // حماية من الحلقة اللانهائية
      if (out.length > GMS.IDB_CONFIG.MAX_INVENTORY) {
        console.warn('[Sync] Reached max inventory cap');
        break;
      }

      await GMS.yieldToUI();
    }

    return out;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §8 · DELTA SYNC
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * مزامنة تفاضلية — جلب الأصناف المُعدَّلة فقط
   * @param {Object} [opts]
   * @param {Function} [opts.onProgress]
   * @returns {Promise<Object>}
   */
  async function deltaSync(opts = {}) {
    const { onProgress } = opts;

    if (SyncState.syncing) {
      return { skipped: true, reason: 'already_syncing' };
    }

    // إذا لم تتم مزامنة كاملة بعد، ابدأ بـ full sync
    const lastFullSync = await GMS.IDB.metaGet('last_full_sync');
    if (!lastFullSync) {
      console.log('[Sync] No previous full sync — running full sync first');
      return fullSync(opts);
    }

    const startedAt = Date.now();
    SyncState.syncing = true;
    SyncState.syncType = 'delta';

    emit('syncStart', { type: 'delta', startedAt });

    try {
      const lastSync = await GMS.IDB.metaGet('last_sync') || lastFullSync;

      SyncLog.add('info', 'بدء المزامنة التفاضلية',
        `جلب الأصناف المُعدَّلة بعد ${GMS.timeAgo(lastSync)}`);

      let changes;

      if (SB.isReady()) {
        changes = await fetchDeltaFromSupabase(lastSync, onProgress);
      } else {
        // وضع تجريبي: نحوّل التحديثات الوهمية
        changes = DemoData.getInventory().filter(
          item => item.updated_at > lastSync
        ).slice(0, 50);
      }

      if (!changes.length) {
        const now = new Date().toISOString();
        await GMS.IDB.metaSet('last_sync', now);
        SyncState.stats.lastSync = now;
        SyncState.stats.lastDeltaSync = now;

        SyncLog.add('success', 'لا توجد تغييرات', 'الذاكرة المحلية محدَّثة');

        const result = { success: true, type: 'delta', count: 0, elapsed: Date.now() - startedAt };
        emit('syncComplete', result);
        return result;
      }

      // كتابة بالدفعات
      const batchSize = GMS.SYNC_CONFIG.DELTA_SYNC_BATCH;
      let written = 0;

      for (let i = 0; i < changes.length; i += batchSize) {
        const batch = changes.slice(i, i + batchSize);
        await GMS.IDB.putMany(batch);
        written += batch.length;

        if (onProgress) onProgress(written, changes.length);

        emit('syncProgress', {
          type: 'delta',
          written,
          total: changes.length,
          percent: Math.round((written / changes.length) * 100),
        });

        await GMS.yieldToUI();
      }

      // حفظ timestamp
      const now = new Date().toISOString();
      await GMS.IDB.metaSet('last_sync', now);

      SyncState.stats.lastSync = now;
      SyncState.stats.lastDeltaSync = now;
      SyncState.stats.totalSyncs++;
      SyncState.stats.totalItemsSynced += changes.length;

      const elapsed = Date.now() - startedAt;

      SyncLog.add('success', 'اكتملت المزامنة التفاضلية',
        `${GMS.intFmt(changes.length)} صنف مُحدَّث في ${(elapsed / 1000).toFixed(2)} ثانية`,
        { count: changes.length, elapsed }
      );

      const result = {
        success: true,
        type: 'delta',
        count: changes.length,
        elapsed,
      };

      emit('syncComplete', result);
      return result;

    } catch (e) {
      console.error('[Sync] Delta sync failed:', e);
      SyncState.stats.failedSyncs++;
      SyncLog.add('error', 'فشلت المزامنة التفاضلية', e.message);
      emit('syncError', { type: 'delta', error: e.message });
      throw e;
    } finally {
      SyncState.syncing = false;
      SyncState.syncType = null;
    }
  }

  /**
   * جلب الأصناف المُعدَّلة من Supabase
   * @param {string} sinceISO
   * @param {Function} [onProgress]
   * @returns {Promise<Array>}
   */
  async function fetchDeltaFromSupabase(sinceISO, onProgress) {
    const client = SB.get();
    if (!client) throw new Error('Supabase client not ready');

    const table = GMS.SUPABASE_CONFIG.TABLES.INVENTORY;
    const pageSize = GMS.SUPABASE_CONFIG.MAX_ROWS_PER_BATCH;

    // 1 · احصل على عدد التغييرات
    const { count, error: countError } = await client
      .from(table)
      .select('id', { count: 'exact', head: true })
      .gt('updated_at', sinceISO);

    if (countError) throw countError;

    const total = count || 0;
    if (total === 0) return [];

    if (onProgress) onProgress(0, total);

    // 2 · جلب التغييرات
    const out = [];
    let offset = 0;

    while (offset < total) {
      const { data, error } = await client
        .from(table)
        .select(GMS.SUPABASE_CONFIG.INVENTORY_COLUMNS.join(','))
        .gt('updated_at', sinceISO)
        .order('updated_at', { ascending: true })
        .range(offset, offset + pageSize - 1);

      if (error) throw error;
      if (!data || !data.length) break;

      out.push(...data);
      offset += data.length;

      if (onProgress) onProgress(out.length, total);

      await GMS.yieldToUI();
    }

    return out;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §9 · OFFLINE QUEUE PUSH
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * رفع طابور الفواتير المُعلَّقة
   * @param {Object} [opts]
   * @param {boolean} [opts.force=false]
   * @param {Function} [opts.onProgress]
   * @returns {Promise<Object>}
   */
  async function pushQueue(opts = {}) {
    const { force = false, onProgress } = opts;

    if (!SyncState.online && !force) {
      return { skipped: true, reason: 'offline' };
    }

    const queue = await GMS.IDB.queueAll();

    if (!queue.length) {
      return { success: true, pushed: 0, failed: 0, total: 0 };
    }

    if (SyncState.syncing) {
      return { skipped: true, reason: 'already_syncing' };
    }

    const startedAt = Date.now();
    SyncState.syncing = true;
    SyncState.syncType = 'queue';

    emit('syncStart', { type: 'queue', total: queue.length, startedAt });

    try {
      SyncLog.add('info', 'رفع طابور الفواتير',
        `${queue.length} فاتورة في الطابور`);

      let pushed = 0;
      let failed = 0;
      const failures = [];

      for (let i = 0; i < queue.length; i++) {
        const sale = queue[i];

        try {
          if (SB.isReady()) {
            // رفع إلى Supabase
            await pushSaleToSupabase(sale);
          } else {
            // وضع تجريبي: تأخير وهمي
            await GMS.sleep(60);
          }

          // حذف من الطابور
          await GMS.IDB.queueDelete(sale.id);

          // تحديث حالة الأصناف محلياً
          await updateLocalItemsAfterSale(sale);

          pushed++;

        } catch (e) {
          console.error('[Sync] Queue item failed:', sale.id, e);
          failed++;
          failures.push({ id: sale.id, error: e.message });
        }

        if (onProgress) onProgress(i + 1, queue.length);

        emit('syncProgress', {
          type: 'queue',
          written: i + 1,
          total: queue.length,
          percent: Math.round(((i + 1) / queue.length) * 100),
        });

        await GMS.yieldToUI();
      }

      const now = new Date().toISOString();
      SyncState.stats.lastQueuePush = now;
      SyncState.stats.totalQueueItemsPushed += pushed;

      const elapsed = Date.now() - startedAt;

      if (failed > 0) {
        SyncLog.add('warn', 'اكتمل رفع الطابور مع أخطاء',
          `${pushed} نجحت · ${failed} فشلت`,
          { pushed, failed, failures }
        );
      } else {
        SyncLog.add('success', 'اكتمل رفع الطابور',
          `${pushed} فاتورة في ${(elapsed / 1000).toFixed(2)} ثانية`,
          { pushed, elapsed }
        );
      }

      const result = {
        success: true,
        type: 'queue',
        pushed,
        failed,
        total: queue.length,
        failures,
        elapsed,
      };

      emit('syncComplete', result);
      emit('queueChange', { count: await GMS.IDB.queueCount() });

      return result;

    } catch (e) {
      console.error('[Sync] Queue push failed:', e);
      SyncState.stats.failedSyncs++;
      SyncLog.add('error', 'فشل رفع الطابور', e.message);
      emit('syncError', { type: 'queue', error: e.message });
      throw e;

    } finally {
      SyncState.syncing = false;
      SyncState.syncType = null;
    }
  }

  /**
   * رفع فاتورة واحدة إلى Supabase
   * @param {Object} sale
   * @returns {Promise<void>}
   */
  async function pushSaleToSupabase(sale) {
    const client = SB.get();
    if (!client) throw new Error('Supabase client not ready');

    const salesTable = GMS.SUPABASE_CONFIG.TABLES.SALES;
    const itemsTable = GMS.SUPABASE_CONFIG.TABLES.SALE_ITEMS;
    const inventoryTable = GMS.SUPABASE_CONFIG.TABLES.INVENTORY;

    const salePayload = {
      sale_no: sale.sale_no,
      item_count: sale.item_count,
      total_pure_weight: sale.total_pure_weight,
      grand_total: sale.grand_total,
      payment_method: sale.payment_method || 'cash',
      status: 'PENDING_APPROVAL',
      created_at: sale.created_at,
    };

    // 1 · إدراج الفاتورة
    const { data: saleRow, error: saleError } = await client
      .from(salesTable)
      .insert(salePayload)
      .select('id')
      .single();

    if (saleError) throw saleError;

    // 2 · إدراج بنود الفاتورة
    if (sale.lines && sale.lines.length) {
      const linePayload = sale.lines.map(line => ({
        sale_id: saleRow.id,
        inventory_id: line.inventory_id,
        sku: line.sku,
        karat: line.karat,
        weight_grams: line.weight_grams,
        net_weight: line.net_weight,
        pure_weight: line.pure_weight,
        workmanship_per_gram: line.workmanship_per_gram,
        workmanship_value: line.workmanship_value,
        gold_value: line.gold_value,
        line_total: line.line_total,
      }));

      const { error: linesError } = await client
        .from(itemsTable)
        .insert(linePayload);

      if (linesError) throw linesError;
    }

    // 3 · تحديث حالة الأصناف إلى SOLD
    const inventoryIds = (sale.lines || [])
      .map(l => l.inventory_id)
      .filter(Boolean);

    if (inventoryIds.length) {
      const { error: updateError } = await client
        .from(inventoryTable)
        .update({ status: 'SOLD', updated_at: new Date().toISOString() })
        .in('id', inventoryIds);

      if (updateError) throw updateError;
    }
  }

  /**
   * تحديث الأصناف محلياً بعد رفع الفاتورة
   * @param {Object} sale
   * @returns {Promise<void>}
   */
  async function updateLocalItemsAfterSale(sale) {
    const lines = sale.lines || [];

    for (const line of lines) {
      if (!line.inventory_id) continue;

      const item = await GMS.IDB.get(line.inventory_id);
      if (item) {
        item.status = 'SOLD';
        item.updated_at = new Date().toISOString();
        await GMS.IDB.put(item);
      }
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §10 · REALTIME WEBSOCKET
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * بدء الاشتراك في قنوات Realtime
   * @returns {void}
   */
  function subscribeRealtime() {
    if (!SB.isReady()) {
      // وضع تجريبي: محاكاة أحداث
      startDemoSimulator();
      setChannelStatus('connected', 'وضع تجريبي · محاكاة');
      return;
    }

    setChannelStatus('connecting');

    try {
      // إزالة القناة القديمة
      if (SyncState.channel) {
        try {
          SB.get().removeChannel(SyncState.channel);
        } catch (_) {}
        SyncState.channel = null;
      }

      const channelName = GMS.SUPABASE_CONFIG.REALTIME_CHANNELS.EXEC_DASHBOARD +
        '-' + SyncState.reconnectAttempts + '-' + Date.now();

      SyncState.channel = SB.get()
        .channel(channelName, {
          config: {
            broadcast: { self: false },
          },
        })

        /* ─── جدول sales ─────────────────────────────────────── */
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'sales' },
          (payload) => handleSaleChange(payload)
        )

        /* ─── جدول inventory ─────────────────────────────────── */
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'inventory' },
          (payload) => handleInventoryChange(payload)
        )

        /* ─── جدول entity_ledger ─────────────────────────────── */
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'entity_ledger' },
          (payload) => handleLedgerChange(payload)
        )

        /* ─── جدول shifts ────────────────────────────────────── */
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'shifts' },
          (payload) => handleShiftChange(payload)
        )

        /* ─── جدول price_board ───────────────────────────────── */
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'price_board' },
          (payload) => handlePriceBoardChange(payload)
        )

        /* ─── حالة الاشتراك ──────────────────────────────────── */
        .subscribe((status, err) => {
          switch (status) {
            case 'SUBSCRIBED':
              SyncState.reconnectAttempts = 0;
              setChannelStatus('connected', `مباشر · متصل`);
              clearReconnectTimer();
              SyncLog.add('success', 'اتصال Realtime نشط');
              break;

            case 'CHANNEL_ERROR':
              console.warn('[Realtime] Channel error:', err);
              setChannelStatus('error', 'خطأ في الاتصال');
              scheduleReconnect();
              break;

            case 'TIMED_OUT':
              setChannelStatus('error', 'انتهت المهلة');
              scheduleReconnect();
              break;

            case 'CLOSED':
              if (SyncState.channelStatus !== 'error') {
                setChannelStatus('connecting', 'إعادة الاتصال…');
              }
              break;
          }
        });

    } catch (e) {
      console.error('[Realtime] Subscribe failed:', e);
      setChannelStatus('error', e.message);
      scheduleReconnect();
    }
  }

  /**
   * إلغاء الاشتراك
   */
  function unsubscribeRealtime() {
    if (SyncState.channel && SB.isReady()) {
      try {
        SB.get().removeChannel(SyncState.channel);
      } catch (_) {}
      SyncState.channel = null;
    }
    stopDemoSimulator();
    setChannelStatus('idle', 'غير متصل');
  }

  /**
   * تحديث حالة القناة
   * @param {'idle'|'connecting'|'connected'|'error'} status
   * @param {string} [text]
   */
  function setChannelStatus(status, text) {
    SyncState.channelStatus = status;
    emit('onlineChange', {
      status,
      text: text || '',
      online: SyncState.online,
    });
  }

  /**
   * جدولة إعادة الاتصال بـ exponential backoff
   */
  function scheduleReconnect() {
    if (SyncState.reconnectTimer) return;

    SyncState.reconnectAttempts++;

    const delay = Math.min(
      GMS.SYNC_CONFIG.RECONNECT_MAX_MS,
      GMS.SYNC_CONFIG.RECONNECT_BASE_MS *
        Math.pow(1.6, SyncState.reconnectAttempts - 1)
    );

    setChannelStatus('connecting',
      `إعادة الاتصال خلال ${Math.round(delay / 1000)} ث…`);

    SyncState.reconnectTimer = setTimeout(() => {
      SyncState.reconnectTimer = null;
      subscribeRealtime();
    }, delay);
  }

  /**
   * إلغاء مؤقت إعادة الاتصال
   */
  function clearReconnectTimer() {
    if (SyncState.reconnectTimer) {
      clearTimeout(SyncState.reconnectTimer);
      SyncState.reconnectTimer = null;
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §11 · REALTIME EVENT HANDLERS
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * عند تغيير في جدول sales
   * @param {Object} payload
   */
  async function handleSaleChange(payload) {
    const { eventType, new: newRow, old: oldRow } = payload;
    SyncState.stats.totalEvents++;
    SyncState.stats.lastRealtimeEvent = new Date().toISOString();

    const row = eventType === 'DELETE' ? oldRow : newRow;
    if (!row) return;

    // إبطال الذاكرة
    await GMS.Cache.handleRealtimeInvalidation({
      table: 'sales',
      action: eventType,
      id: row.id,
      row,
    });

    // إطلاق الحدث
    emit('realtimeEvent', {
      table: 'sales',
      action: eventType,
      row,
      old: oldRow,
    });

    SyncLog.add('info', `Realtime: sales · ${eventType}`,
      row.sale_no || row.id);
  }

  /**
   * عند تغيير في جدول inventory
   * @param {Object} payload
   */
  async function handleInventoryChange(payload) {
    const { eventType, new: newRow, old: oldRow } = payload;
    SyncState.stats.totalEvents++;
    SyncState.stats.lastRealtimeEvent = new Date().toISOString();

    const row = eventType === 'DELETE' ? oldRow : newRow;
    if (!row) return;

    // إبطال الذاكرة
    await GMS.Cache.handleRealtimeInvalidation({
      table: 'inventory',
      action: eventType,
      id: row.id,
      row,
    });

    emit('realtimeEvent', {
      table: 'inventory',
      action: eventType,
      row,
      old: oldRow,
    });

    SyncLog.add('info', `Realtime: inventory · ${eventType}`,
      row.sku || row.id);
  }

  /**
   * عند تغيير في entity_ledger
   * @param {Object} payload
   */
  async function handleLedgerChange(payload) {
    const row = payload.new;
    if (!row) return;

    SyncState.stats.totalEvents++;
    SyncState.stats.lastRealtimeEvent = new Date().toISOString();

    await GMS.Cache.handleRealtimeInvalidation({
      table: 'entity_ledger',
      action: 'INSERT',
      id: row.id,
      row,
    });

    emit('realtimeEvent', {
      table: 'entity_ledger',
      action: 'INSERT',
      row,
    });

    SyncLog.add('info', 'Realtime: entity_ledger · INSERT',
      row.entry_type || row.id);
  }

  /**
   * عند تغيير في shifts
   * @param {Object} payload
   */
  async function handleShiftChange(payload) {
    const newRow = payload.new;
    const oldRow = payload.old;
    if (!newRow) return;

    SyncState.stats.totalEvents++;
    SyncState.stats.lastRealtimeEvent = new Date().toISOString();

    const closed = oldRow?.status !== 'CLOSED' && newRow.status === 'CLOSED';

    if (closed) {
      SyncLog.add('info', 'Realtime: إغلاق وردية',
        newRow.shift_no || newRow.id);
    }

    emit('realtimeEvent', {
      table: 'shifts',
      action: 'UPDATE',
      row: newRow,
      old: oldRow,
      isClosure: closed,
    });
  }

  /**
   * عند تغيير في price_board
   * @param {Object} payload
   */
  async function handlePriceBoardChange(payload) {
    const row = payload.new;
    if (!row) return;

    SyncState.stats.totalEvents++;
    SyncState.stats.lastRealtimeEvent = new Date().toISOString();

    await GMS.Cache.handleRealtimeInvalidation({
      table: 'price_board',
      action: payload.eventType,
      id: row.id,
      row,
    });

    emit('realtimeEvent', {
      table: 'price_board',
      action: payload.eventType,
      row,
    });

    SyncLog.add('info', 'Realtime: تحديث سعر الذهب',
      `${row.price_24} ج.م / 24K`);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §12 · DEMO SIMULATOR (عند عدم وجود Supabase)
     ═════════════════════════════════════════════════════════════════════ */
  let demoTimer = null;

  function startDemoSimulator() {
    if (demoTimer) clearInterval(demoTimer);

    demoTimer = setInterval(() => {
      const rnd = Math.random();
      const now = new Date().toISOString();

      if (rnd < 0.60) {
        // بيعة
        const pure = GMS.round(1.2 + Math.random() * 14, 4);
        const value = GMS.round(pure * GMS.APP_CONFIG.DEFAULT_PRICE_24 * (1.05 + Math.random() * 0.15), 2);

        handleSaleChange({
          eventType: 'INSERT',
          new: {
            id: GMS.uid(),
            sale_no: GMS.invoiceNo('INV'),
            grand_total: value,
            total_pure_weight: pure,
            payment_method: ['cash', 'card', 'instapay'][Math.floor(Math.random() * 3)],
            created_at: now,
          },
        });

      } else if (rnd < 0.80) {
        // تحديث مخزون
        handleInventoryChange({
          eventType: 'INSERT',
          new: {
            id: GMS.uid(),
            sku: GMS.generateSKU({
              manufacturerCode: 'A',
              karat: 21,
              seq: Math.floor(Math.random() * 1000),
            }),
            karat: 21,
            status: 'IN_STOCK',
            pure_weight: GMS.round(Math.random() * 5, 4),
            updated_at: now,
          },
        });

      } else if (rnd < 0.95) {
        // دفتر الموردين
        handleLedgerChange({
          new: {
            id: GMS.uid(),
            entry_type: ['gold_received', 'cash_payment'][Math.floor(Math.random() * 2)],
            gold_delta: GMS.round((Math.random() - 0.4) * 30, 4),
            cash_delta: GMS.round((Math.random() - 0.4) * 80000, 2),
            created_at: now,
          },
        });

      } else {
        // إغلاق وردية
        handleShiftChange({
          new: {
            id: GMS.uid(),
            shift_no: 'SH-' + GMS.uid().toUpperCase(),
            status: 'CLOSED',
            closed_at: now,
          },
          old: { status: 'OPEN' },
        });
      }
    }, 4500 + Math.random() * 3000);
  }

  function stopDemoSimulator() {
    if (demoTimer) {
      clearInterval(demoTimer);
      demoTimer = null;
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §13 · ONLINE/OFFLINE DETECTION
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * تعيين حالة الاتصال
   * @param {boolean} online
   */
  function setOnline(online) {
    const changed = SyncState.online !== online;
    SyncState.online = online;

    if (changed) {
      emit('onlineChange', {
        online,
        status: SyncState.channelStatus,
      });

      if (online) {
        SyncLog.add('success', 'عاد الاتصال', 'جارٍ رفع الطابور');
        // رفع الطابور تلقائياً
        setTimeout(() => {
          pushQueue().catch(e => console.warn('[Sync] Auto-push failed:', e));
        }, 800);
      } else {
        SyncLog.add('warn', 'انقطع الاتصال', 'العمل مستمر محلياً');
      }
    }
  }

  /**
   * قراءة حالة الاتصال من المتصفح
   * @returns {boolean}
   */
  function checkOnline() {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  }

  /**
   * تفعيل مستمعي online/offline
   */
  function bindNetworkListeners() {
    window.addEventListener('online', () => setOnline(true));
    window.addEventListener('offline', () => setOnline(false));

    // الفحص الأولي
    setOnline(checkOnline());
  }

  /* ═════════════════════════════════════════════════════════════════════
     §14 · AUTO-SYNC SCHEDULER
     ═════════════════════════════════════════════════════════════════════ */
  let autoSyncTimer = null;

  /**
   * جدولة مزامنة دورية
   * @param {number} [intervalMs=5*60*1000] — كل 5 دقائق افتراضياً
   */
  function startAutoSync(intervalMs = 5 * 60 * 1000) {
    stopAutoSync();

    autoSyncTimer = setInterval(async () => {
      if (!SyncState.online) return;
      if (SyncState.syncing) return;

      try {
        await deltaSync();
      } catch (e) {
        console.warn('[Sync] Auto-sync failed:', e.message);
      }
    }, intervalMs);

    console.log(`[Sync] Auto-sync enabled (every ${intervalMs / 1000}s)`);
  }

  /**
   * إيقاف المزامنة الدورية
   */
  function stopAutoSync() {
    if (autoSyncTimer) {
      clearInterval(autoSyncTimer);
      autoSyncTimer = null;
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §15 · SYNC STATISTICS
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * قراءة كل الإحصائيات
   * @returns {Promise<Object>}
   */
  async function getStats() {
    const [idbStats, queueCount, lastSync, lastFullSync] = await Promise.all([
      GMS.IDB.stats(),
      GMS.IDB.queueCount(),
      GMS.IDB.metaGet('last_sync'),
      GMS.IDB.metaGet('last_full_sync'),
    ]);

    return {
      ...SyncState.stats,
      online: SyncState.online,
      supabaseReady: SyncState.supabaseReady,
      channelStatus: SyncState.channelStatus,
      reconnectAttempts: SyncState.reconnectAttempts,
      syncing: SyncState.syncing,
      syncType: SyncState.syncType,
      queueCount,
      idbStats,
      lastSync: lastSync || SyncState.stats.lastSync,
      lastFullSync: lastFullSync || SyncState.stats.lastFullSync,
    };
  }

  /**
   * تفريغ الإحصائيات
   */
  function resetStats() {
    SyncState.stats = {
      lastSync: null,
      lastFullSync: null,
      lastDeltaSync: null,
      lastQueuePush: null,
      lastRealtimeEvent: null,
      totalSyncs: 0,
      totalEvents: 0,
      totalBytesDownloaded: 0,
      totalItemsSynced: 0,
      totalQueueItemsPushed: 0,
      failedSyncs: 0,
    };
  }

  /* ═════════════════════════════════════════════════════════════════════
     §16 · INITIALIZATION
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * تهيئة محرك المزامنة
   * @param {Object} [opts]
   * @param {boolean} [opts.autoSync=true]
   * @param {boolean} [opts.realtime=true]
   * @param {boolean} [opts.initialSync=true]
   * @returns {Promise<Object>}
   */
  async function init(opts = {}) {
    const {
      autoSync = true,
      realtime = true,
      initialSync = true,
    } = opts;

    // 1 · تحميل سجل المزامنة
    SyncLog.load();

    // 2 · فتح قاعدة البيانات
    await GMS.IDB.open();

    // 3 · تهيئة Supabase
    await SB.init();

    // 4 · قراءة حالة الاتصال
    setOnline(checkOnline());

    // 5 · ربط مستمعي الشبكة
    bindNetworkListeners();

    // 6 · المزامنة الأولية
    if (initialSync) {
      const lastSync = await GMS.IDB.metaGet('last_sync');
      const count = await GMS.IDB.count();

      if (count === 0 || !lastSync) {
        // لا توجد بيانات → full sync
        try {
          await fullSync();
        } catch (e) {
          console.warn('[Sync] Initial full sync failed:', e.message);
        }
      } else {
        // بيانات موجودة → delta sync
        try {
          await deltaSync();
        } catch (e) {
          console.warn('[Sync] Initial delta sync failed:', e.message);
        }
      }
    }

    // 7 · تشغيل Realtime
    if (realtime) {
      subscribeRealtime();
    }

    // 8 · تشغيل Auto-sync
    if (autoSync) {
      startAutoSync();
    }

    console.log('[Sync] Initialized', {
      online: SyncState.online,
      supabaseReady: SyncState.supabaseReady,
      channelStatus: SyncState.channelStatus,
      configSource: Config.source,
    });

    return {
      online: SyncState.online,
      supabaseReady: SyncState.supabaseReady,
      channelStatus: SyncState.channelStatus,
    };
  }

  /**
   * إيقاف كل شيء
   */
  function shutdown() {
    unsubscribeRealtime();
    stopAutoSync();
    stopDemoSimulator();
    clearReconnectTimer();
  }

  /* ═════════════════════════════════════════════════════════════════════
     §17 · EXPORT
     ═════════════════════════════════════════════════════════════════════ */
  GMS.Sync = {
    /* State */
    state: SyncState,

    /* Core operations */
    init,
    shutdown,
    fullSync,
    deltaSync,
    pushQueue,

    /* Realtime */
    subscribeRealtime,
    unsubscribeRealtime,
    setChannelStatus,
    scheduleReconnect,
    clearReconnectTimer,

    /* Online/offline */
    setOnline,
    checkOnline,
    bindNetworkListeners,

    /* Auto-sync */
    startAutoSync,
    stopAutoSync,

    /* Stats */
    getStats,
    resetStats,

    /* Events */
    on,

    /* Internal */
    log: SyncLog,
    config: Config,
    sb: SB,
    demo: DemoData,
  };

  /* ─── Convenience exports ──────────────────────────────────────── */
  GMS.SyncConfig = Config;
  GMS.Supabase = SB;
  GMS.SyncLog = SyncLog;

  /* ═════════════════════════════════════════════════════════════════════
     §18 · LOADED CONFIRMATION
     ═════════════════════════════════════════════════════════════════════ */
  console.log(
    '%c🔄 Sync Engine loaded · Full + Delta + Queue + Realtime',
    'color:#1c4fd8;font-weight:800;font-size:12px;padding:1px 5px;' +
    'background:#e9efff;border-radius:4px;'
  );

  console.log(
    `%c🔌 Supabase ${Config.ready ? '✓ configured' : '· demo mode'} · ` +
    `Auto-reconnect · Exponential backoff · ${GMS.SYNC_CONFIG.RECONNECT_MAX_MS / 1000}s max`,
    'color:#6b7a95;font-weight:700;font-size:11px;'
  );

  /* ═════════════════════════════════════════════════════════════════════
     ✅ js/05-sync.js — نهاية الملف
     ═════════════════════════════════════════════════════════════════════ */

})();