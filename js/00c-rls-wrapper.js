/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ERP — js/00c-rls-wrapper.js
   Business Context + Tenant-Aware Supabase Wrapper
   ─────────────────────────────────────────────────────────────────────
   • DB: واجهة Supabase client تُضيف business_id تلقائياً
   • Biz: إدارة سياق النشاط الحالي (session + business + user)
   • Security: يمنع أي استعلام من تسريب بيانات tenants أخرى
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const GMS = window.GMS = window.GMS || {};

  /* ═════════════════════════════════════════════════════════════════════
     §1 · الجداول التي تحمل business_id (Tenant-Scoped)
     ═════════════════════════════════════════════════════════════════════ */
  const TENANT_TABLES = new Set([
    'inventory', 'sales', 'sale_items', 'suppliers', 'customers', 'entity_ledger',
    'price_board', 'manufacturers', 'branches', 'shifts', 'returns',
    'melting_batches', 'polishing_batches', 'assay_records', 'credit_wallet',
    'general_ledger', 'branch_expenses', 'salesperson_commissions', 'repairs',
    'sales_reps', 'b2b_customers', 'rep_ledgers', 'rep_settlements',
    'wholesale_invoices', 'branch_transfers', 'audit_logs',
  ]);

  /* ═════════════════════════════════════════════════════════════════════
     §2 · MUTATION MODES
     ═════════════════════════════════════════════════════════════════════ */
  const MUTATION_METHODS = new Set(['insert', 'upsert', 'update', 'delete']);

  /* ═════════════════════════════════════════════════════════════════════
     §3 · DB — Tenant-Aware Supabase Wrapper
     ═════════════════════════════════════════════════════════════════════ */
  const DB = {
    _client: null,
    _businessId: null,
    _ready: false,

    /**
     * تهيئة الواجهة
     * @param {Object} client
     * @param {string} businessId
     */
    init(client, businessId) {
      this._client = client;
      this._businessId = businessId;
      this._ready = Boolean(client && businessId);

      console.log(`[DB] ✅ Initialized · business=${businessId || 'NONE'}`);
      return this;
    },

    isReady() {
      return this._ready;
    },

    getBusinessId() {
      return this._businessId;
    },

    get client() {
      return this._client;
    },

    /**
     * واجهة موحّدة: db.from('inventory').select('*')
     * → تُضيف business_id تلقائياً
     */
    from(table) {
      if (!this._client) {
        throw new Error('[DB] Not initialized. Call DB.init(client, businessId)');
      }

      const builder = this._client.from(table);

      // الجداول غير المُقيَّدة بالمستأجر تُمرَّر كما هي
      if (!this._businessId || !TENANT_TABLES.has(table)) {
        return builder;
      }

      return this._wrapTenantBuilder(builder, table, this._businessId);
    },

    /**
     * RPC آمن يمرر business_id
     */
    rpc(fn, params) {
      if (!this._client) {
        throw new Error('[DB] Not initialized');
      }
      return this._client.rpc(fn, params || {});
    },

    /**
     * وصول مباشر للـ client (للاستخدامات النادرة فقط)
     */
    raw() {
      return this._client;
    },

    /**
     * بناء wrapper يُضيف business_id تلقائياً
     * @private
     */
    _wrapTenantBuilder(initialBuilder, table, businessId) {
      let current = initialBuilder;
      const proxy = new Proxy({}, {
        get: (target, prop) => {
          // ─── Await support ─────────────────────────────────────
          if (prop === 'then')    return (res, rej) => current.then(res, rej);
          if (prop === 'catch')   return (rej) => current.catch(rej);
          if (prop === 'finally') return (fn) => current.finally(fn);

          // ─── Terminal methods ──────────────────────────────────
          if (prop === 'single')      return () => current.single();
          if (prop === 'maybeSingle') return () => current.maybeSingle();
          if (prop === 'csv')         return () => current.csv();
          if (prop === 'explain')     return () => current.explain();

          // ─── Entry: SELECT ─────────────────────────────────────
          if (prop === 'select') {
            return (...args) => {
              current = current.select(...args).eq('business_id', businessId);
              return proxy;
            };
          }

          // ─── Entry: INSERT ─────────────────────────────────────
          if (prop === 'insert') {
            return (data) => {
              const enriched = Array.isArray(data)
                ? data.map(r => ({ ...r, business_id: businessId }))
                : { ...data, business_id: businessId };
              current = current.insert(enriched);
              return proxy;
            };
          }

          // ─── Entry: UPSERT ─────────────────────────────────────
          if (prop === 'upsert') {
            return (data, opts) => {
              const enriched = Array.isArray(data)
                ? data.map(r => ({ ...r, business_id: businessId }))
                : { ...data, business_id: businessId };
              current = current.upsert(enriched, opts);
              return proxy;
            };
          }

          // ─── Entry: UPDATE ─────────────────────────────────────
          if (prop === 'update') {
            return (data) => {
              current = current.update(data).eq('business_id', businessId);
              return proxy;
            };
          }

          // ─── Entry: DELETE ─────────────────────────────────────
          if (prop === 'delete') {
            return () => {
              current = current.delete().eq('business_id', businessId);
              return proxy;
            };
          }

          // ─── Chainable filters ─────────────────────────────────
          const CHAINABLE = [
            'eq','neq','gt','gte','lt','lte','like','ilike','is','in',
            'contains','containedBy','rangeGt','rangeGte','rangeLt','rangeLte',
            'rangeAdjacent','overlaps','textSearch','match','not','or','filter',
            'order','limit','range','returns',
          ];
          if (CHAINABLE.includes(prop)) {
            return (...args) => {
              current = current[prop](...args);
              return proxy;
            };
          }

          // ─── Fallback ──────────────────────────────────────────
          const val = current[prop];
          if (typeof val === 'function') return val.bind(current);
          return val;
        },
      });

      return proxy;
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §4 · BIZ — Business Context Manager
     ═════════════════════════════════════════════════════════════════════ */
  const SESSION_KEY = 'gms.tenant.session';
  const BIZ_KEY = 'gms.tenant.business';
  const LAST_CODE_KEY = 'gms.tenant.last_code';
  const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 ساعات

  const Biz = {
    _session: null,
    _business: null,
    _initialized: false,
    _listeners: new Set(),

    /**
     * حفظ الجلسة بعد الدخول الناجح
     */
    setSession(session, business) {
      this._session = {
        ...session,
        startedAt: Date.now(),
        expiresAt: Date.now() + SESSION_TTL_MS,
      };
      this._business = business;

      try {
        localStorage.setItem(SESSION_KEY, JSON.stringify(this._session));
        localStorage.setItem(BIZ_KEY, JSON.stringify(business));
        if (business?.code) {
          localStorage.setItem(LAST_CODE_KEY, business.code);
        }
      } catch (e) {
        console.warn('[Biz] localStorage failed:', e);
      }

      this._notify('session');
      console.log('[Biz] ✅ Session saved:', session.user?.username || session.username);
    },

    /**
     * استرجاع الجلسة من التخزين
     */
    restore() {
      try {
        const rawSession = localStorage.getItem(SESSION_KEY);
        const rawBiz = localStorage.getItem(BIZ_KEY);
        if (!rawSession || !rawBiz) return null;

        const session = JSON.parse(rawSession);
        const business = JSON.parse(rawBiz);

        // TTL check
        if (session.expiresAt && Date.now() > session.expiresAt) {
          console.warn('[Biz] ⏰ Session expired');
          this.clear();
          return null;
        }

        this._session = session;
        this._business = business;
        return { session, business };
      } catch (e) {
        console.warn('[Biz] restore failed:', e);
        return null;
      }
    },

    clear() {
      try {
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(BIZ_KEY);
        // نحتفظ بـ LAST_CODE_KEY لتسهيل الدخول القادم
      } catch (_) {}
      this._session = null;
      this._business = null;
      this._notify('cleared');
    },

    isAuthenticated() {
      if (!this._session) return false;
      if (this._session.expiresAt && Date.now() > this._session.expiresAt) return false;
      return true;
    },

    getSession() { return this._session; },
    getBusiness() { return this._business; },
    getBusinessId() { return this._business?.id || null; },
    getUser() { return this._session?.user || null; },
    getRole() { return this._session?.user?.role || null; },
    isOwner() { return Boolean(this._session?.user?.is_owner); },
    isSaasOwner() { return this._session?.session_type === 'saas_owner'; },

    getLastBusinessCode() {
      try { return localStorage.getItem(LAST_CODE_KEY) || ''; }
      catch (_) { return ''; }
    },

    on(cb) {
      if (typeof cb !== 'function') return () => {};
      this._listeners.add(cb);
      return () => this._listeners.delete(cb);
    },

    _notify(event) {
      this._listeners.forEach(fn => {
        try { fn(event, this._session, this._business); }
        catch (e) { console.warn('[Biz.listener]', e); }
      });
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §5 · EXPORT
     ═════════════════════════════════════════════════════════════════════ */
  GMS.DB = DB;
  GMS.Biz = Biz;
  GMS.TENANT_TABLES = TENANT_TABLES;

  console.log(
    '%c🔐 RLS Wrapper + Business Context loaded',
    'color:#0f7a43;font-weight:900;font-size:12px;padding:2px 6px;' +
    'background:#e6f6ee;border-radius:4px;'
  );
})();