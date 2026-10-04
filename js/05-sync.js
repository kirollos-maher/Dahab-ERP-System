/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ENTERPRISE — js/05-sync.js
   محرك المزامنة الشامل:
     - Full Sync (تحميل كامل)
     - Delta Sync (المزامنة التفاضلية)
     - Offline Queue Push (رفع الطابور)
     - Realtime WebSocket (التحديثات المباشرة)
     - Auto-reconnect (إعادة الاتصال التلقائي)

   ✅ v6.1: Demo optional — النظام يعمل بدون GMS.Demo
     • كل استخدامات GMS.Demo أصبحت optional
     • عند غياب Demo → Full/Delta Sync ترجع مصفوفة فاضية
     • Realtime demo simulator معطّل تلقائياً
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

      try {
        const stored = SyncState.log.slice(0, 50);
        localStorage.setItem(GMS.LS_KEYS.SYNC_LOG, JSON.stringify(stored));
      } catch (_) {}

      return entry;
    },

    getAll() { return SyncState.log; },

    clear() {
      SyncState.log = [];
      try { localStorage.removeItem(GMS.LS_KEYS.SYNC_LOG); } catch (_) {}
    },

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
  function emit(event, data) {
    const set = SyncState.listeners[event];
    if (!set) return;

    set.forEach(fn => {
      try { fn(data); }
      catch (e) { console.error(`[Sync.emit:${event}]`, e); }
    });
  }

  function on(event, fn) {
    const set = SyncState.listeners[event];
    if (!set || typeof fn !== 'function') return () => {};

    set.add(fn);
    return () => set.delete(fn);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §4 · CONFIG HELPERS
     ═════════════════════════════════════════════════════════════════════ */
  const Config = {
    get url() {
      try {
        const saved = localStorage.getItem(GMS.LS_KEYS.CONFIG_URL);
        if (saved && saved.length > 0) return saved;
      } catch (_) {}
      return (GMS.SUPABASE_CREDENTIALS && GMS.SUPABASE_CREDENTIALS.URL) || '';
    },

    get key() {
      try {
        const saved = localStorage.getItem(GMS.LS_KEYS.CONFIG_KEY);
        if (saved && saved.length > 0) return saved;
      } catch (_) {}
      return (GMS.SUPABASE_CREDENTIALS && GMS.SUPABASE_CREDENTIALS.ANON_KEY) || '';
    },

    save(url, key) {
      try {
        localStorage.setItem(GMS.LS_KEYS.CONFIG_URL, String(url || '').trim());
        localStorage.setItem(GMS.LS_KEYS.CONFIG_KEY, String(key || '').trim());
      } catch (_) {}
    },

    get ready() {
      return Boolean(this.url && this.key && window.supabase);
    },

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

    async init() {
      if (!Config.ready) {
        SyncState.supabaseReady = false;
        console.log(`[SB] Not configured (source: ${Config.source}) — running without cloud sync`);
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
            params: { eventsPerSecond: 20 },
          },
        });

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

    get() { return this.client; },

    isReady() {
      return this.client !== null && SyncState.supabaseReady;
    },

    async close() {
      if (this.client) {
        try { await this.client.removeAllChannels(); } catch (_) {}
        this.client = null;
      }
      SyncState.supabaseReady = false;
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §6 · DEMO HELPERS — ✅ v6.1 (Optional)
     ─────────────────────────────────────────────────────────────────────
     GMS.Demo أصبح اختياري. لو موجود → نستخدمه.
     لو مش موجود → نتخطى بهدوء.
     ═════════════════════════════════════════════════════════════════════ */

  function isDemoAvailable() {
    return Boolean(
      GMS.Demo &&
      typeof GMS.Demo.getInventory === 'function'
    );
  }

  function getDemoInventory() {
    if (!isDemoAvailable()) return [];
    try {
      const items = GMS.Demo.getInventory();
      return Array.isArray(items) ? items : [];
    } catch (e) {
      console.warn('[Sync] Demo getInventory failed:', e);
      return [];
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §7 · FULL SYNC
     ═════════════════════════════════════════════════════════════════════ */

  async function fullSync(opts = {}) {
    const { onProgress, force = false } = opts;

    if (SyncState.syncing && !force) {
      console.warn('[Sync] Sync already in progress');
      return { skipped: true, reason: 'already_syncing' };
    }

    const startedAt = Date.now();
    SyncState.syncing = true;
    SyncState.syncType = 'full';

    const meta = { type: 'full', startedAt, total: 0, written: 0 };
    emit('syncStart', meta);

    try {
      SyncLog.add('info', 'بدء المزامنة الكاملة', 'تحميل كل الأصناف من الخادم');

      let all = [];

      if (SB.isReady()) {
        all = await fetchAllFromSupabase(onProgress);
      } else {
        /* ✅ v6.1: Demo optional */
        if (isDemoAvailable()) {
          console.log('[Sync] Supabase not ready — using Demo fallback');
          all = getDemoInventory();
          if (onProgress) onProgress(all.length, all.length);
        } else {
          console.log('[Sync] Supabase not ready & Demo unavailable — skipping');
          all = [];
          if (onProgress) onProgress(0, 0);
        }
      }

      meta.total = all.length;

      await GMS.IDB.clearInventory();

      const batchSize = GMS.SYNC_CONFIG.FULL_SYNC_BATCH;
      let written = 0;

      for (let i = 0; i < all.length; i += batchSize) {
        const batch = all.slice(i, i + batchSize);
        await GMS.IDB.putMany(batch);
        written += batch.length;

        meta.written = written;
        if (onProgress) onProgress(written, all.length);

        emit('syncProgress', {
          type: 'full',
          written,
          total: all.length,
          percent: Math.round((written / all.length) * 100),
        });

        await GMS.yieldToUI();
      }

      const now = new Date().toISOString();
      await GMS.IDB.metaSet('last_sync', now);
      await GMS.IDB.metaSet('last_full_sync', now);
      await GMS.IDB.metaSet('inventory_count', all.length);

      SyncState.stats.lastSync = now;
      SyncState.stats.lastFullSync = now;
      SyncState.stats.totalSyncs++;
      SyncState.stats.totalItemsSynced += all.length;

      const elapsed = Date.now() - startedAt;

      SyncLog.add(
        'success',
        'اكتملت المزامنة الكاملة',
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

  async function fetchAllFromSupabase(onProgress) {
    const client = SB.get();
    if (!client) throw new Error('Supabase client not ready');

    const table = GMS.SUPABASE_CONFIG.TABLES.INVENTORY;
    const pageSize = GMS.SUPABASE_CONFIG.MAX_ROWS_PER_BATCH;

    const { count, error: countError } = await client
      .from(table)
      .select('id', { count: 'exact', head: true });

    if (countError) throw countError;

    const total = count || 0;
    if (total === 0) return [];

    if (onProgress) onProgress(0, total);

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

  async function deltaSync(opts = {}) {
    const { onProgress } = opts;

    if (SyncState.syncing) {
      return { skipped: true, reason: 'already_syncing' };
    }

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

      SyncLog.add(
        'info',
        'بدء المزامنة التفاضلية',
        `جلب الأصناف المُعدَّلة بعد ${GMS.timeAgo(lastSync)}`
      );

      let changes = [];

      if (SB.isReady()) {
        changes = await fetchDeltaFromSupabase(lastSync, onProgress);
      } else {
        /* ✅ v6.1: Demo optional */
        if (isDemoAvailable()) {
          console.log('[Sync] Supabase not ready — using Demo delta fallback');
          changes = getDemoInventory()
            .filter(item => item.updated_at > lastSync)
            .slice(0, 50);
          if (onProgress) onProgress(changes.length, changes.length);
        } else {
          console.log('[Sync] Supabase not ready & Demo unavailable — no changes');
          changes = [];
          if (onProgress) onProgress(0, 0);
        }
      }

      if (!changes.length) {
        const now = new Date().toISOString();
        await GMS.IDB.metaSet('last_sync', now);

        SyncState.stats.lastSync = now;
        SyncState.stats.lastDeltaSync = now;

        SyncLog.add('success', 'لا توجد تغييرات', 'الذاكرة المحلية محدَّثة');

        const result = {
          success: true,
          type: 'delta',
          count: 0,
          elapsed: Date.now() - startedAt,
        };
        emit('syncComplete', result);
        return result;
      }

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

      const now = new Date().toISOString();
      await GMS.IDB.metaSet('last_sync', now);

      SyncState.stats.lastSync = now;
      SyncState.stats.lastDeltaSync = now;
      SyncState.stats.totalSyncs++;
      SyncState.stats.totalItemsSynced += changes.length;

      const elapsed = Date.now() - startedAt;

      SyncLog.add(
        'success',
        'اكتملت المزامنة التفاضلية',
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

  async function fetchDeltaFromSupabase(sinceISO, onProgress) {
    const client = SB.get();
    if (!client) throw new Error('Supabase client not ready');

    const table = GMS.SUPABASE_CONFIG.TABLES.INVENTORY;
    const pageSize = GMS.SUPABASE_CONFIG.MAX_ROWS_PER_BATCH;

    const { count, error: countError } = await client
      .from(table)
      .select('id', { count: 'exact', head: true })
      .gt('updated_at', sinceISO);

    if (countError) throw countError;

    const total = count || 0;
    if (total === 0) return [];

    if (onProgress) onProgress(0, total);

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
      SyncLog.add('info', 'رفع طابور الفواتير', `${queue.length} فاتورة في الطابور`);

      let pushed = 0;
      let failed = 0;
      const failures = [];

      for (let i = 0; i < queue.length; i++) {
        const sale = queue[i];

        try {
          if (SB.isReady()) {
            await pushSaleToSupabase(sale);
          } else {
            /* ✅ v6.1: بدون Supabase ولا Demo — نتخطى بهدوء */
            await GMS.sleep(60);
          }

          await GMS.IDB.queueDelete(sale.id);
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
        SyncLog.add(
          'warn',
          'اكتمل رفع الطابور مع أخطاء',
          `${pushed} نجحت · ${failed} فشلت`,
          { pushed, failed, failures }
        );
      } else {
        SyncLog.add(
          'success',
          'اكتمل رفع الطابور',
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

    const { data: saleRow, error: saleError } = await client
      .from(salesTable)
      .insert(salePayload)
      .select('id')
      .single();

    if (saleError) throw saleError;

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

  function subscribeRealtime() {
    if (!SB.isReady()) {
      /* ✅ v6.1: Demo optional */
      if (isDemoAvailable()) {
        startDemoSimulator();
        setChannelStatus('connected', 'وضع تجريبي · محاكاة');
      } else {
        console.log('[Realtime] Supabase not ready & Demo unavailable — realtime disabled');
        setChannelStatus('idle', 'غير متصل');
      }
      return;
    }

    setChannelStatus('connecting');

    try {
      if (SyncState.channel) {
        try { SB.get().removeChannel(SyncState.channel); } catch (_) {}
        SyncState.channel = null;
      }

      const channelName = GMS.SUPABASE_CONFIG.REALTIME_CHANNELS.EXEC_DASHBOARD +
        '-' + SyncState.reconnectAttempts + '-' + Date.now();

      SyncState.channel = SB.get()
        .channel(channelName, {
          config: { broadcast: { self: false } },
        })

        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'sales' },
          (payload) => handleSaleChange(payload)
        )

        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'inventory' },
          (payload) => handleInventoryChange(payload)
        )

        .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'entity_ledger' },
          (payload) => handleLedgerChange(payload)
        )

        .on('postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'shifts' },
          (payload) => handleShiftChange(payload)
        )

        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'price_board' },
          (payload) => handlePriceBoardChange(payload)
        )

        .subscribe((status, err) => {
          switch (status) {
            case 'SUBSCRIBED':
              SyncState.reconnectAttempts = 0;
              setChannelStatus('connected', 'مباشر · متصل');
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

  function unsubscribeRealtime() {
    if (SyncState.channel && SB.isReady()) {
      try { SB.get().removeChannel(SyncState.channel); } catch (_) {}
      SyncState.channel = null;
    }
    stopDemoSimulator();
    setChannelStatus('idle', 'غير متصل');
  }

  function setChannelStatus(status, text) {
    SyncState.channelStatus = status;
    emit('onlineChange', {
      status,
      text: text || '',
      online: SyncState.online,
    });
  }

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

  function clearReconnectTimer() {
    if (SyncState.reconnectTimer) {
      clearTimeout(SyncState.reconnectTimer);
      SyncState.reconnectTimer = null;
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §11 · REALTIME EVENT HANDLERS
     ═════════════════════════════════════════════════════════════════════ */

  async function handleSaleChange(payload) {
    const { eventType, new: newRow, old: oldRow } = payload;
    SyncState.stats.totalEvents++;
    SyncState.stats.lastRealtimeEvent = new Date().toISOString();

    const row = eventType === 'DELETE' ? oldRow : newRow;
    if (!row) return;

    await GMS.Cache.handleRealtimeInvalidation({
      table: 'sales',
      action: eventType,
      id: row.id,
      row,
    });

    emit('realtimeEvent', {
      table: 'sales',
      action: eventType,
      row,
      old: oldRow,
    });

    SyncLog.add('info', `Realtime: sales · ${eventType}`, row.sale_no || row.id);
  }

  async function handleInventoryChange(payload) {
    const { eventType, new: newRow, old: oldRow } = payload;
    SyncState.stats.totalEvents++;
    SyncState.stats.lastRealtimeEvent = new Date().toISOString();

    const row = eventType === 'DELETE' ? oldRow : newRow;
    if (!row) return;

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

    SyncLog.add('info', `Realtime: inventory · ${eventType}`, row.sku || row.id);
  }

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
     §12 · DEMO SIMULATOR (يعمل فقط لو GMS.Demo متاح)
     ═════════════════════════════════════════════════════════════════════ */
  let demoTimer = null;

  function startDemoSimulator() {
    /* ✅ v6.1: لو GMS.Demo مش متاح → لا نشغل المحاكاة */
    if (!isDemoAvailable()) {
      console.log('[Realtime] Demo simulator skipped — GMS.Demo not available');
      return;
    }

    if (demoTimer) clearInterval(demoTimer);

    demoTimer = setInterval(() => {
      const rnd = Math.random();
      const now = new Date().toISOString();

      if (rnd < 0.60) {
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

  function setOnline(online) {
    const changed = SyncState.online !== online;
    SyncState.online = online;

    if (changed) {
      emit('onlineChange', { online, status: SyncState.channelStatus });

      if (online) {
        SyncLog.add('success', 'عاد الاتصال', 'جارٍ رفع الطابور');
        setTimeout(() => {
          pushQueue().catch(e => console.warn('[Sync] Auto-push failed:', e));
        }, 800);
      } else {
        SyncLog.add('warn', 'انقطع الاتصال', 'العمل مستمر محلياً');
      }
    }
  }

  function checkOnline() {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  }

  function bindNetworkListeners() {
    window.addEventListener('online', () => setOnline(true));
    window.addEventListener('offline', () => setOnline(false));
    setOnline(checkOnline());
  }

  /* ═════════════════════════════════════════════════════════════════════
     §14 · AUTO-SYNC SCHEDULER
     ═════════════════════════════════════════════════════════════════════ */
  let autoSyncTimer = null;

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

  function stopAutoSync() {
    if (autoSyncTimer) {
      clearInterval(autoSyncTimer);
      autoSyncTimer = null;
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §15 · SYNC STATISTICS
     ═════════════════════════════════════════════════════════════════════ */

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

  async function init(opts = {}) {
    const {
      autoSync = true,
      realtime = true,
      initialSync = true,
    } = opts;

    SyncLog.load();
    await GMS.IDB.open();
    await SB.init();

    setOnline(checkOnline());
    bindNetworkListeners();

    if (initialSync) {
      const lastSync = await GMS.IDB.metaGet('last_sync');
      const count = await GMS.IDB.count();

      if (count === 0 || !lastSync) {
        try { await fullSync(); }
        catch (e) { console.warn('[Sync] Initial full sync failed:', e.message); }
      } else {
        try { await deltaSync(); }
        catch (e) { console.warn('[Sync] Initial delta sync failed:', e.message); }
      }
    }

    if (realtime) subscribeRealtime();
    if (autoSync) startAutoSync();

    console.log('[Sync] Initialized', {
      online: SyncState.online,
      supabaseReady: SyncState.supabaseReady,
      channelStatus: SyncState.channelStatus,
      configSource: Config.source,
      demoAvailable: isDemoAvailable(),
    });

    return {
      online: SyncState.online,
      supabaseReady: SyncState.supabaseReady,
      channelStatus: SyncState.channelStatus,
    };
  }

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
    state: SyncState,

    init,
    shutdown,
    fullSync,
    deltaSync,
    pushQueue,

    subscribeRealtime,
    unsubscribeRealtime,
    setChannelStatus,
    scheduleReconnect,
    clearReconnectTimer,

    setOnline,
    checkOnline,
    bindNetworkListeners,

    startAutoSync,
    stopAutoSync,

    getStats,
    resetStats,

    on,

    log: SyncLog,
    config: Config,
    sb: SB,

    /* ✅ v6.1: معرّضة للاستخدام الخارجي */
    isDemoAvailable,
  };

  GMS.SyncConfig = Config;
  GMS.Supabase = SB;
  GMS.SyncLog = SyncLog;

  /* ═════════════════════════════════════════════════════════════════════
     §18 · LOADED CONFIRMATION
     ═════════════════════════════════════════════════════════════════════ */
  console.log(
    '%c🔄 Sync Engine v6.1 loaded · Demo optional',
    'color:#1c4fd8;font-weight:800;font-size:12px;padding:1px 5px;' +
    'background:#e9efff;border-radius:4px;'
  );

  console.log(
    `%c🔌 Supabase ${Config.ready ? '✓ configured' : '· demo mode'} · ` +
    `Auto-reconnect · Exponential backoff · ${GMS.SYNC_CONFIG.RECONNECT_MAX_MS / 1000}s max`,
    'color:#6b7a95;font-weight:700;font-size:11px;'
  );

  console.log(
    `%c✅ v6.1: كل استخدامات GMS.Demo أصبحت اختيارية — يعمل بدون 08-demo.js`,
    'color:#0f7a43;font-weight:900;font-size:11px;'
  );

  /* ═════════════════════════════════════════════════════════════════════
     ✅ js/05-sync.js — نهاية الملف
     ═════════════════════════════════════════════════════════════════════ */

})();
