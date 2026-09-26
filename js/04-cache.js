/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ENTERPRISE — js/04-cache.js
   نظام التخزين المؤقت ذو الطبقتين:
     Layer 1 · LocalStorage — للإعدادات الصغيرة (TTL 12 ساعة)
     Layer 2 · IndexedDB — للمخزون الضخم والطابور
   ✅ v5: getPrice() يقرأ من PriceManager أولاً (سعر لحظي)
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const GMS = window.GMS = window.GMS || {};

  /* ═════════════════════════════════════════════════════════════════════
     §1 · LSCache — LocalStorage Cache Layer
     ═════════════════════════════════════════════════════════════════════ */
  class LSCacheClass {

    constructor() {
      this.PREFIX = GMS.LS_KEYS.CACHE_PREFIX || 'gms.cache.';
      this.TTL_SUFFIX = GMS.LS_KEYS.CACHE_TTL_SUFFIX || '.ttl';
      this.DEFAULT_TTL = GMS.SYNC_CONFIG.CACHE_TTL_MS;
    }

    _k(key) { return this.PREFIX + key; }
    _t(key) { return this.PREFIX + key + this.TTL_SUFFIX; }

    set(key, value, opts = {}) {
      const { ttl = this.DEFAULT_TTL } = opts;
      try {
        const payload = JSON.stringify({
          v: value,
          storedAt: Date.now(),
          ttl,
        });
        localStorage.setItem(this._k(key), payload);
        localStorage.setItem(this._t(key), String(Date.now() + ttl));
        return true;
      } catch (e) {
        console.warn('[LSCache.set]', e.message);
        return false;
      }
    }

    get(key) {
      try {
        const expiresAt = Number(localStorage.getItem(this._t(key))) || 0;
        if (expiresAt > 0 && Date.now() > expiresAt) {
          this.del(key);
          return null;
        }
        const raw = localStorage.getItem(this._k(key));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed.v;
      } catch (e) {
        return null;
      }
    }

    getMeta(key) {
      try {
        const raw = localStorage.getItem(this._k(key));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        const expiresAt = Number(localStorage.getItem(this._t(key))) || 0;
        if (expiresAt > 0 && Date.now() > expiresAt) {
          this.del(key);
          return null;
        }
        return {
          value: parsed.v,
          storedAt: parsed.storedAt,
          expiresAt,
          ttl: expiresAt - Date.now(),
        };
      } catch (e) {
        return null;
      }
    }

    has(key) {
      return this.get(key) !== null;
    }

    ttl(key) {
      const expiresAt = Number(localStorage.getItem(this._t(key))) || 0;
      if (!expiresAt) return null;
      return Math.max(0, expiresAt - Date.now());
    }

    del(key) {
      try {
        localStorage.removeItem(this._k(key));
        localStorage.removeItem(this._t(key));
      } catch (_) {}
    }

    clear() {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(this.PREFIX)) keys.push(k);
      }
      keys.forEach(k => {
        try { localStorage.removeItem(k); } catch (_) {}
      });
    }

    prune() {
      let count = 0;
      const now = Date.now();
      const toDelete = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith(this.PREFIX)) continue;
        if (k.endsWith(this.TTL_SUFFIX)) continue;
        const ttlKey = k + this.TTL_SUFFIX;
        const expiresAt = Number(localStorage.getItem(ttlKey)) || 0;
        if (expiresAt > 0 && now > expiresAt) {
          toDelete.push(k, ttlKey);
        }
      }
      toDelete.forEach(k => {
        try { localStorage.removeItem(k); count++; } catch (_) {}
      });
      return count;
    }

    entries() {
      const out = [];
      for (let i = 0; i < localStorage.length; i++) {
        const fullKey = localStorage.key(i);
        if (!fullKey || !fullKey.startsWith(this.PREFIX)) continue;
        if (fullKey.endsWith(this.TTL_SUFFIX)) continue;
        const shortKey = fullKey.slice(this.PREFIX.length);
        const ttl = this.ttl(shortKey);
        let size = 0;
        try { size = (localStorage.getItem(fullKey) || '').length * 2; } catch (_) {}
        out.push({
          key: shortKey,
          size,
          ttl: ttl || 0,
          expiresAt: ttl !== null ? Date.now() + ttl : null,
        });
      }
      return out.sort((a, b) => a.key.localeCompare(b.key));
    }

    size() {
      let total = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(this.PREFIX)) {
          total += (localStorage.getItem(k) || '').length * 2;
        }
      }
      return total;
    }

    count() {
      return this.entries().length;
    }
  }

  const LSCache = new LSCacheClass();

  /* ═════════════════════════════════════════════════════════════════════
     §2 · IDBEngine — IndexedDB Layer
     ═════════════════════════════════════════════════════════════════════ */
  class IDBEngine {

    constructor() {
      this.db = null;
      this.isOpen = false;
      this._openPromise = null;
      this._queuedOps = [];
    }

    open() {
      if (this.db && this.isOpen) return Promise.resolve(this.db);
      if (this._openPromise) return this._openPromise;

      this._openPromise = new Promise((resolve, reject) => {
        const cfg = GMS.IDB_CONFIG;
        const req = indexedDB.open(cfg.DB_NAME, cfg.DB_VERSION);

        req.onupgradeneeded = (event) => {
          const db = event.target.result;

          if (!db.objectStoreNames.contains(cfg.STORE_INVENTORY)) {
            const store = db.createObjectStore(cfg.STORE_INVENTORY, { keyPath: 'id' });
            store.createIndex('sku', 'sku', { unique: true });
            store.createIndex('karat', 'karat', { unique: false });
            store.createIndex('status', 'status', { unique: false });
            store.createIndex('manufacturer_code', 'manufacturer_code', { unique: false });
            store.createIndex('branch_id', 'branch_id', { unique: false });
            store.createIndex('updated_at', 'updated_at', { unique: false });
            store.createIndex('category', 'category', { unique: false });
            store.createIndex('status_karat', ['status', 'karat'], { unique: false });
          }

          if (!db.objectStoreNames.contains(cfg.STORE_QUEUE)) {
            const store = db.createObjectStore(cfg.STORE_QUEUE, { keyPath: 'id' });
            store.createIndex('created_at', 'created_at', { unique: false });
            store.createIndex('status', 'status', { unique: false });
            store.createIndex('branch_id', 'branch_id', { unique: false });
          }

          if (!db.objectStoreNames.contains(cfg.STORE_META)) {
            db.createObjectStore(cfg.STORE_META, { keyPath: 'key' });
          }

          if (!db.objectStoreNames.contains(cfg.STORE_PENDING_ITEMS)) {
            const store = db.createObjectStore(cfg.STORE_PENDING_ITEMS, { keyPath: 'localId' });
            store.createIndex('created_at', 'created_at', { unique: false });
            store.createIndex('operation', 'operation', { unique: false });
          }

          console.log('[IDB] Schema upgraded to v' + cfg.DB_VERSION);
        };

        req.onsuccess = (event) => {
          this.db = event.target.result;
          this.isOpen = true;

          this.db.onerror = (e) => {
            console.error('[IDB] Global error:', e.target.error);
          };

          this.db.onversionchange = () => {
            console.warn('[IDB] Version change detected, closing');
            this.close();
          };

          this._flushQueue();
          console.log('[IDB] Database opened:', cfg.DB_NAME, 'v' + cfg.DB_VERSION);
          resolve(this.db);
        };

        req.onerror = () => {
          console.error('[IDB] Failed to open:', req.error);
          this._openPromise = null;
          reject(req.error);
        };

        req.onblocked = () => {
          console.warn('[IDB] Blocked — close other tabs');
        };
      });

      return this._openPromise;
    }

    close() {
      if (this.db) {
        this.db.close();
        this.db = null;
        this.isOpen = false;
        this._openPromise = null;
      }
    }

    _flushQueue() {
      const ops = this._queuedOps.splice(0);
      ops.forEach(op => op());
    }

    async _tx(store, mode, fn) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        let tx;
        try { tx = db.transaction(store, mode); }
        catch (e) { return reject(e); }

        const os = tx.objectStore(store);
        let result;
        try { result = fn(os); }
        catch (e) {
          try { tx.abort(); } catch (_) {}
          return reject(e);
        }

        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
      });
    }

    async _req(store, mode, fn) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const os = tx.objectStore(store);
        let req;
        try { req = fn(os); }
        catch (e) { return reject(e); }
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }

    async putMany(items) {
      if (!items || !items.length) return 0;
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('inventory', 'readwrite');
        const store = tx.objectStore('inventory');
        items.forEach(item => {
          try { store.put(item); }
          catch (e) { console.warn('[IDB.putMany] item failed:', e); }
        });
        tx.oncomplete = () => resolve(items.length);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    }

    put(item) { return this._req('inventory', 'readwrite', os => os.put(item)); }
    get(id) { return this._req('inventory', 'readonly', os => os.get(id)); }

    getBySku(sku) {
      const key = String(sku || '').trim().toUpperCase();
      return this._req('inventory', 'readonly', os => os.index('sku').get(key));
    }

    getAll() { return this._req('inventory', 'readonly', os => os.getAll()); }
    count() { return this._req('inventory', 'readonly', os => os.count()); }

    countByStatus(status) {
      return this._req('inventory', 'readonly', os =>
        os.index('status').count(IDBKeyRange.only(status))
      );
    }

    getByStatus(status) {
      return this._req('inventory', 'readonly', os =>
        os.index('status').getAll(IDBKeyRange.only(status))
      );
    }

    getByKarat(karat) {
      const k = Number(karat);
      return this._req('inventory', 'readonly', os =>
        os.index('karat').getAll(IDBKeyRange.only(k))
      );
    }

    getByBranch(branchId) {
      return this._req('inventory', 'readonly', os =>
        os.index('branch_id').getAll(IDBKeyRange.only(branchId))
      );
    }

    getUpdatedAfter(isoTimestamp) {
      return this._req('inventory', 'readonly', os =>
        os.index('updated_at').getAll(IDBKeyRange.lowerBound(isoTimestamp, true))
      );
    }

    delete(id) { return this._req('inventory', 'readwrite', os => os.delete(id)); }

    async deleteMany(ids) {
      if (!ids || !ids.length) return 0;
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('inventory', 'readwrite');
        const store = tx.objectStore('inventory');
        ids.forEach(id => store.delete(id));
        tx.oncomplete = () => resolve(ids.length);
        tx.onerror = () => reject(tx.error);
      });
    }

    clearInventory() {
      return this._req('inventory', 'readwrite', os => os.clear());
    }

    async search(query = '', filters = {}) {
      const {
        karat = null, status = null, branch_id = null,
        manufacturer_code = null, category = null, limit = 500,
      } = filters;

      let candidates;
      if (status) candidates = await this.getByStatus(status);
      else if (branch_id) candidates = await this.getByBranch(branch_id);
      else if (karat !== null) candidates = await this.getByKarat(karat);
      else candidates = await this.getAll();

      if (status && karat !== null) {
        candidates = candidates.filter(i => Number(i.karat) === Number(karat));
      }
      if (branch_id && !status) {
        candidates = candidates.filter(i => i.branch_id === branch_id);
      }
      if (manufacturer_code) {
        candidates = candidates.filter(i =>
          (i.manufacturer_code || '').toUpperCase() ===
          String(manufacturer_code).toUpperCase()
        );
      }
      if (category) candidates = candidates.filter(i => i.category === category);

      const q = String(query || '').trim().toLowerCase();
      if (q) {
        candidates = candidates.filter(i => {
          return (
            (i.sku || '').toLowerCase().includes(q) ||
            (i.manufacturer_name || '').toLowerCase().includes(q) ||
            (i.manufacturer_code || '').toLowerCase().includes(q) ||
            (i.category || '').toLowerCase().includes(q) ||
            (i.notes || '').toLowerCase().includes(q)
          );
        });
      }

      return candidates.slice(0, limit);
    }

    queueAdd(sale) { return this._req('offline_queue', 'readwrite', os => os.put(sale)); }
    queueAll() { return this._req('offline_queue', 'readonly', os => os.getAll()); }
    queueGet(id) { return this._req('offline_queue', 'readonly', os => os.get(id)); }
    queueCount() { return this._req('offline_queue', 'readonly', os => os.count()); }
    queueDelete(id) { return this._req('offline_queue', 'readwrite', os => os.delete(id)); }
    queueClear() { return this._req('offline_queue', 'readwrite', os => os.clear()); }

    async queueOlderThan(ageMs) {
      const all = await this.queueAll();
      const threshold = Date.now() - ageMs;
      return all.filter(s => {
        const t = new Date(s.created_at).getTime();
        return isFinite(t) && t < threshold;
      });
    }

    metaSet(key, value) {
      return this._req('metadata', 'readwrite', os =>
        os.put({ key, value, updatedAt: new Date().toISOString() })
      );
    }

    async metaGet(key) {
      const row = await this._req('metadata', 'readonly', os => os.get(key));
      return row ? row.value : null;
    }

    metaDelete(key) { return this._req('metadata', 'readwrite', os => os.delete(key)); }
    metaAll() { return this._req('metadata', 'readonly', os => os.getAll()); }

    pendingAdd(op) {
      const entry = {
        localId: GMS.uid(),
        created_at: new Date().toISOString(),
        ...op,
      };
      return this._req('pending_items', 'readwrite', os => os.put(entry));
    }

    pendingAll() { return this._req('pending_items', 'readonly', os => os.getAll()); }
    pendingDelete(localId) { return this._req('pending_items', 'readwrite', os => os.delete(localId)); }
    pendingClear() { return this._req('pending_items', 'readwrite', os => os.clear()); }

    async stats() {
      try {
        const [inventoryCount, queueCount, metaCount, pendingCount, sizeInfo] = await Promise.all([
          this.count(),
          this.queueCount(),
          this._req('metadata', 'readonly', os => os.count()),
          this._req('pending_items', 'readonly', os => os.count()),
          this._estimateSize(),
        ]);
        return {
          inventoryCount, queueCount, metaCount, pendingCount,
          usage: sizeInfo.usage, quota: sizeInfo.quota,
          usagePercent: sizeInfo.quota > 0 ? (sizeInfo.usage / sizeInfo.quota) * 100 : 0,
        };
      } catch (e) {
        return {
          inventoryCount: 0, queueCount: 0, metaCount: 0, pendingCount: 0,
          usage: 0, quota: 0, usagePercent: 0, error: e.message,
        };
      }
    }

    async _estimateSize() {
      try {
        if (navigator.storage && navigator.storage.estimate) {
          const est = await navigator.storage.estimate();
          return { usage: est.usage || 0, quota: est.quota || 0 };
        }
      } catch (_) {}
      return { usage: 0, quota: 0 };
    }

    async statusBreakdown() {
      try {
        const [inStock, sold, reserved, returned, melted] = await Promise.all([
          this.countByStatus('IN_STOCK'),
          this.countByStatus('SOLD'),
          this.countByStatus('RESERVED'),
          this.countByStatus('RETURNED'),
          this.countByStatus('MELTED'),
        ]);
        return {
          IN_STOCK: inStock, SOLD: sold, RESERVED: reserved,
          RETURNED: returned, MELTED: melted,
          total: inStock + sold + reserved + returned + melted,
        };
      } catch (e) {
        return { IN_STOCK: 0, SOLD: 0, RESERVED: 0, RETURNED: 0, MELTED: 0, total: 0 };
      }
    }

    async karatBreakdown() {
      try {
        const all = await this.getAll();
        const breakdown = {};
        GMS.KARAT_ORDER.forEach(k => {
          breakdown[k] = { count: 0, netWeight: 0, pureWeight: 0, totalValue: 0 };
        });
        all.forEach(item => {
          const k = Number(item.karat);
          if (!breakdown[k]) {
            breakdown[k] = { count: 0, netWeight: 0, pureWeight: 0, totalValue: 0 };
          }
          breakdown[k].count++;
          breakdown[k].netWeight += Number(item.net_weight || 0);
          breakdown[k].pureWeight += Number(item.pure_weight || 0);
          breakdown[k].totalValue += Number(item.total_cost || 0);
        });
        return breakdown;
      } catch (e) {
        return {};
      }
    }

    async nuke() {
      const cfg = GMS.IDB_CONFIG;
      if (this.db) {
        this.db.close();
        this.db = null;
        this.isOpen = false;
        this._openPromise = null;
      }
      return new Promise((resolve, reject) => {
        const req = indexedDB.deleteDatabase(cfg.DB_NAME);
        req.onsuccess = () => {
          console.log('[IDB] Database deleted:', cfg.DB_NAME);
          resolve();
        };
        req.onerror = () => reject(req.error);
        req.onblocked = () => {
          console.warn('[IDB] Delete blocked — close other tabs');
        };
      });
    }

    async pruneSoldItems(ageMs = 30 * 86400000) {
      const sold = await this.getByStatus('SOLD');
      const threshold = Date.now() - ageMs;
      const toDelete = sold
        .filter(item => {
          const t = new Date(item.updated_at || item.created_at).getTime();
          return isFinite(t) && t < threshold;
        })
        .map(item => item.id);
      if (!toDelete.length) return 0;
      await this.deleteMany(toDelete);
      return toDelete.length;
    }
  }

  const IDB = new IDBEngine();

  /* ═════════════════════════════════════════════════════════════════════
     §3 · CacheManager — ينسق الطبقتين
     ✅ v5: getPrice() يقرأ من PriceManager أولاً
     ═════════════════════════════════════════════════════════════════════ */
  class CacheManagerClass {

    constructor() {
      this.ls = LSCache;
      this.idb = IDB;
    }

    async warmup(data = {}) {
      try {
        await this.idb.open();

        if (data.manufacturers) {
          this.ls.set(GMS.LS_KEYS.CACHE_MANUFACTURERS, data.manufacturers);
        }
        if (data.workmanship) {
          this.ls.set(GMS.LS_KEYS.CACHE_WORKMANSHIP, data.workmanship);
        }
        if (data.profile) {
          this.ls.set(GMS.LS_KEYS.CACHE_PROFILE, data.profile);
        }
        if (data.preferences) {
          this.ls.set(GMS.LS_KEYS.CACHE_PREFERENCES, data.preferences);
        }
        if (data.branches) {
          this.ls.set(GMS.LS_KEYS.CACHE_BRANCHES, data.branches);
        }
        if (data.price) {
          this.ls.set(GMS.LS_KEYS.CACHE_PRICE, data.price);
          this._deriveKaratBoard(data.price);
        }

        const pruned = this.ls.prune();
        if (pruned > 0) {
          console.log(`[Cache] Pruned ${pruned} expired keys`);
        }

        return {
          success: true,
          pruned,
          lsCount: this.ls.count(),
          idbCount: await this.idb.count(),
        };
      } catch (e) {
        console.error('[Cache.warmup]', e);
        return { success: false, error: e.message };
      }
    }

    /**
     * اشتقاق جدول أسعار العيارات من سعر 24K
     * ✅ v5: يستخدم PriceManager إذا متاح
     */
    _deriveKaratBoard(priceObj) {
      const price24 = Number(priceObj?.price_24) || GMS.APP_CONFIG.DEFAULT_PRICE_24;
      const board = {};

      GMS.KARAT_ORDER.forEach(k => {
        board[k] = {
          karat: k,
          ratio: GMS.karatRatio(k),
          pricePerGram: GMS.round(price24 * GMS.karatRatio(k), 2),
        };
      });

      this.ls.set(GMS.LS_KEYS.CACHE_KARAT_BOARD, board);
      return board;
    }

    getManufacturers() {
      return this.ls.get(GMS.LS_KEYS.CACHE_MANUFACTURERS) || [];
    }

    getWorkmanshipMatrix() {
      return this.ls.get(GMS.LS_KEYS.CACHE_WORKMANSHIP) || GMS.WORKMANSHIP_MATRIX;
    }

    getProfile() {
      return this.ls.get(GMS.LS_KEYS.CACHE_PROFILE);
    }

    getPreferences() {
      return this.ls.get(GMS.LS_KEYS.CACHE_PREFERENCES) || {};
    }

    getBranches() {
      return this.ls.get(GMS.LS_KEYS.CACHE_BRANCHES) || GMS.DEFAULT_BRANCHES;
    }

    /* ═══════════════════════════════════════════════════════════════
       ✅ v5: getPrice() — المصدر الوحيد للحقيقة = PriceManager
       ───────────────────────────────────────────────────────────────
       الترتيب:
         1. PriceManager (السعر اللحظي)
         2. LS Cache (السعر اليدوي القديم)
         3. Default (قيمة افتراضية)
       ═══════════════════════════════════════════════════════════════ */
    getPrice() {
      /* 1 · أولوية للأسعار اللحظية */
      try {
        const PM = window.GMS?.PriceManager || window.PriceManager;
        if (PM && typeof PM.getCurrentPrices === 'function') {
          const live = PM.getCurrentPrices();
          if (live && live.price24 > 0) {
            return {
              price_24: live.price24,
              price_22: live.price22,
              price_21: live.price21,
              price_18: live.price18,
              price_14: live.price14,
              scrap_price: live.scrapPrice,
              spread: live.spread,
              updated_at: live.fetchedAt || new Date().toISOString(),
              source: live.sourceLabel || 'live',
              sourceKey: live.source || 'live',
              isLive: true,
              usdPerOz: live.usdPerOz,
              usdToEgp: live.usdToEgp,
              status: live.status,
            };
          }
        }
      } catch (e) {
        console.warn('[Cache.getPrice] PriceManager error:', e);
      }

      /* 2 · Fallback: LS cache */
      const cached = this.ls.get(GMS.LS_KEYS.CACHE_PRICE);
      if (cached && cached.price_24 > 0) {
        return {
          ...cached,
          isLive: false,
          source: cached.source || 'manual',
        };
      }

      /* 3 · Default */
      return {
        price_24: GMS.APP_CONFIG.DEFAULT_PRICE_24,
        updated_at: null,
        isLive: false,
        source: 'default',
      };
    }

    getKaratBoard() {
      /* ✅ v5: نبني الجدول من PriceManager مباشرة */
      try {
        const PM = window.GMS?.PriceManager || window.PriceManager;
        if (PM && typeof PM.getCurrentPrices === 'function') {
          const live = PM.getCurrentPrices();
          if (live && live.price24 > 0) {
            const board = {};
            GMS.KARAT_ORDER.forEach(k => {
              board[k] = {
                karat: k,
                ratio: GMS.karatRatio(k),
                pricePerGram: GMS.round(live.price24 * GMS.karatRatio(k), 2),
              };
            });
            return board;
          }
        }
      } catch (_) {}

      return this.ls.get(GMS.LS_KEYS.CACHE_KARAT_BOARD) || this._deriveKaratBoard(this.getPrice());
    }

    /* ═════════════════════════════════════════════════════════════════
       ✅ MANUFACTURERS MANAGEMENT
       ═════════════════════════════════════════════════════════════════ */

    getManufacturersList() {
      try {
        const raw = localStorage.getItem(GMS.LS_KEYS.MANUFACTURERS);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length) {
            return parsed;
          }
        }
      } catch (_) {}

      return GMS.DEFAULT_MANUFACTURERS.map(m => ({ ...m }));
    }

    setManufacturersList(list) {
      if (!Array.isArray(list)) return false;
      try {
        localStorage.setItem(GMS.LS_KEYS.MANUFACTURERS, JSON.stringify(list));
        this.ls.set(GMS.LS_KEYS.CACHE_MANUFACTURERS, list);
        return true;
      } catch (e) {
        console.warn('[Cache.setManufacturersList]', e.message);
        return false;
      }
    }

    addManufacturer(manufacturer) {
      if (!manufacturer) return null;
      const list = this.getManufacturersList();
      const exists = list.find(m => m.code === manufacturer.code);
      if (exists) {
        console.warn('[Cache.addManufacturer] Code already exists:', manufacturer.code);
        return null;
      }

      const entry = {
        id: 'manu-' + GMS.uid(),
        code: manufacturer.code || 'X',
        letter: manufacturer.letter || manufacturer.code || '؟',
        name: manufacturer.name || 'مصنع جديد',
        phone: manufacturer.phone || '',
        pricingMode: manufacturer.pricingMode || 'fixed',
        letterRates: manufacturer.letterRates || [],
        colorRates: manufacturer.colorRates || [],
        itemRates: manufacturer.itemRates || [],
        fixedRate: manufacturer.fixedRate || 0,
        purchaseRate: manufacturer.purchaseRate || 0,
        saleRate: manufacturer.saleRate || 0,
        rate: manufacturer.rate || 0,
        isActive: manufacturer.isActive !== false,
        notes: manufacturer.notes || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      list.push(entry);
      this.setManufacturersList(list);
      return entry;
    }

    updateManufacturer(id, updates = {}) {
      const list = this.getManufacturersList();
      const idx = list.findIndex(m => m.id === id);
      if (idx < 0) return null;

      list[idx] = {
        ...list[idx],
        ...updates,
        id: list[idx].id,
        updatedAt: new Date().toISOString(),
      };

      this.setManufacturersList(list);
      return list[idx];
    }

    deleteManufacturer(id) {
      const list = this.getManufacturersList();
      const filtered = list.filter(m => m.id !== id);
      if (filtered.length === list.length) return false;
      this.setManufacturersList(filtered);
      return true;
    }

    resetManufacturers() {
      const defaults = GMS.DEFAULT_MANUFACTURERS.map(m => ({ ...m }));
      this.setManufacturersList(defaults);
      return defaults;
    }

    getManufacturerById(id) {
      const list = this.getManufacturersList();
      return list.find(m => m.id === id) || null;
    }

    getManufacturerByCode(code) {
      const list = this.getManufacturersList();
      return list.find(m =>
        String(m.code || '').toUpperCase() === String(code || '').toUpperCase()
      ) || null;
    }

    /* ═════════════════════════════════════════════════════════════════
       INVALIDATION
       ═════════════════════════════════════════════════════════════════ */

    invalidate(key) {
      this.ls.del(key);
      console.log('[Cache] Invalidated:', key);
    }

    invalidateAllLS() {
      this.ls.clear();
      console.log('[Cache] Invalidated all LocalStorage');
    }

    async invalidateInventoryItem(id) {
      try {
        const item = await this.idb.get(id);
        if (item) {
          item.updated_at = new Date().toISOString();
          await this.idb.put(item);
        }
      } catch (e) {
        console.warn('[Cache.invalidateInventoryItem]', e);
      }
    }

    async invalidateInventoryItems(ids) {
      if (!ids || !ids.length) return;
      const now = new Date().toISOString();
      try {
        const items = await Promise.all(ids.map(id => this.idb.get(id)));
        const updated = items
          .filter(Boolean)
          .map(item => ({ ...item, updated_at: now }));
        await this.idb.putMany(updated);
      } catch (e) {
        console.warn('[Cache.invalidateInventoryItems]', e);
      }
    }

    async handleRealtimeInvalidation(event) {
      if (!event || !event.table) return;

      const { table, action, id, row } = event;

      switch (table) {
        case 'price_board':
          this.invalidate(GMS.LS_KEYS.CACHE_PRICE);
          this.invalidate(GMS.LS_KEYS.CACHE_KARAT_BOARD);
          if (row) {
            this.ls.set(GMS.LS_KEYS.CACHE_PRICE, row);
            this._deriveKaratBoard(row);
          }
          break;

        case 'manufacturers':
          this.invalidate(GMS.LS_KEYS.CACHE_MANUFACTURERS);
          break;

        case 'branches':
          this.invalidate(GMS.LS_KEYS.CACHE_BRANCHES);
          break;

        case 'profiles':
          if (id) {
            const cached = this.getProfile();
            if (cached && cached.id === id) {
              this.invalidate(GMS.LS_KEYS.CACHE_PROFILE);
            }
          }
          break;

        case 'inventory':
          if (action === 'DELETE' && id) {
            await this.idb.delete(id);
          } else if ((action === 'INSERT' || action === 'UPDATE') && row) {
            await this.idb.put(row);
          }
          break;

        default:
          break;
      }

      console.log('[Cache] Realtime invalidated:', table, action);
    }

    async getStats() {
      const [idbStats, idbStatus, idbKarat] = await Promise.all([
        this.idb.stats(),
        this.idb.statusBreakdown(),
        this.idb.karatBreakdown(),
      ]);

      return {
        ls: {
          size: this.ls.size(),
          count: this.ls.count(),
          entries: this.ls.entries(),
        },
        idb: {
          ...idbStats,
          status: idbStatus,
          karat: idbKarat,
        },
      };
    }

    async cleanup(opts = {}) {
      const {
        pruneLS = true,
        pruneSoldItems = true,
        soldAgeMs = 30 * 86400000,
      } = opts;

      const result = { lsPruned: 0, itemsPruned: 0, errors: [] };

      try {
        if (pruneLS) result.lsPruned = this.ls.prune();
      } catch (e) {
        result.errors.push('LS prune: ' + e.message);
      }

      try {
        if (pruneSoldItems) {
          result.itemsPruned = await this.idb.pruneSoldItems(soldAgeMs);
        }
      } catch (e) {
        result.errors.push('IDB prune: ' + e.message);
      }

      return result;
    }

    async clearAll() {
      this.ls.clear();
      await this.idb.nuke();
      console.log('[Cache] All cleared');
    }

    async exportSnapshot() {
      const [inventory, queue, meta] = await Promise.all([
        this.idb.getAll(),
        this.idb.queueAll(),
        this.idb.metaAll(),
      ]);

      return {
        exportedAt: new Date().toISOString(),
        version: GMS.APP_CONFIG.VERSION,
        ls: {},
        idb: { inventory, queue, meta },
      };
    }
  }

  const Cache = new CacheManagerClass();

  /* ═════════════════════════════════════════════════════════════════════
     §4 · Auto-cleanup على تحميل التطبيق
     ═════════════════════════════════════════════════════════════════════ */
  function scheduleAutoCleanup() {
    setTimeout(async () => {
      try {
        const result = await Cache.cleanup({
          pruneLS: true,
          pruneSoldItems: true,
          soldAgeMs: 30 * 86400000,
        });

        if (result.lsPruned || result.itemsPruned) {
          console.log(
            `[Cache] Auto-cleanup: ${result.lsPruned} LS keys, ` +
            `${result.itemsPruned} IDB items pruned`
          );
        }
      } catch (e) {
        console.warn('[Cache] Auto-cleanup failed:', e);
      }
    }, 10000);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §5 · EXPORT
     ═════════════════════════════════════════════════════════════════════ */
  GMS.LSCache = LSCache;
  GMS.IDB = IDB;
  GMS.Cache = Cache;
  GMS.IDBEngine = IDBEngine;
  GMS.LSCacheClass = LSCacheClass;
  GMS.CacheManagerClass = CacheManagerClass;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleAutoCleanup);
  } else {
    scheduleAutoCleanup();
  }

  /* ═════════════════════════════════════════════════════════════════════
     §6 · LOADED CONFIRMATION
     ═════════════════════════════════════════════════════════════════════ */
  console.log(
    '%c💾 Cache Engine loaded · LocalStorage + IndexedDB',
    'color:#0e7490;font-weight:800;font-size:12px;padding:1px 5px;' +
    'background:#e0f2f7;border-radius:4px;'
  );

  console.log(
    `%c📦 LS (TTL ${GMS.SYNC_CONFIG.CACHE_TTL_MS / 3600000}h) · ` +
    `IDB v${GMS.IDB_CONFIG.DB_VERSION} · 4 stores · ` +
    `9 indexes · Auto-cleanup enabled`,
    'color:#6b7a95;font-weight:700;font-size:11px;'
  );

  console.log(
    `%c🏭 Manufacturers API: getList/setList/add/update/delete/reset`,
    'color:#0f7a43;font-weight:700;font-size:11px;'
  );

  console.log(
    `%c🆕 v5: getPrice() → PriceManager (Live) → LS Cache → Default`,
    'color:#a55a00;font-weight:900;font-size:11px;'
  );

  /* ═════════════════════════════════════════════════════════════════════
     ✅ js/04-cache.js — نهاية الملف
     ═════════════════════════════════════════════════════════════════════ */

})();
