/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ENTERPRISE — js/26-views-accounting.js
   النظام المحاسبي الشامل للذهب والسيولة — دفتر اليومية المزدوج
   ─────────────────────────────────────────────────────────────────────
   المكونات:
     • KPI Cards — رصيد نقدي + أرصدة ذهب مفصلة بالعيارات
     • Ledger Table — دفتر اليومية العام مع فلاتر + Pagination
     • Expense Modal — تسجيل المصروفات التشغيلية
     • Settlement Modal — تسوية ذهب/نقد مع الموردين والورش
     • Entry Details Modal — عرض تفاصيل حركة محاسبية
     • Excel Export — تصدير الدفتر والملخص
     • Realtime Integration — تحديث حي
     • Auto-redirect عبر window.App.navigateTo('accounting')

   ✅ v3: دعم كامل للعيارات المخصصة (سبائك 888، 900، 916، إلخ)
     - قسم تسوية الذهب فيه زرار "مخصص" + حقل نقاء مباشر
     - عرض العيار المخصص في الجدول والتفاصيل
     - KPI ذهب مقسّم للعيارات القياسية + المخصص

   Export:
     • GMS.Views.accounting
     • window.AccountingView
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const GMS = window.GMS = window.GMS || {};

  /* ═════════════════════════════════════════════════════════════════════
     §1 · CONSTANTS — أنواع الحركات المحاسبية
     ═════════════════════════════════════════════════════════════════════ */
  const ENTRY_TYPES = Object.freeze({
    sale:             { key: 'sale',             label: 'فاتورة بيع',      icon: 'receipt',             cls: 'pill-green',  cashSign: +1, goldSign: -1, color: 'success' },
    purchase:         { key: 'purchase',         label: 'فاتورة شراء',     icon: 'truck',               cls: 'pill-blue',   cashSign: -1, goldSign: +1, color: 'info'    },
    expense:          { key: 'expense',          label: 'مصروف تشغيلي',    icon: 'receipt-text',        cls: 'pill-amber',  cashSign: -1, goldSign: 0,  color: 'warn'    },
    cash_received:    { key: 'cash_received',    label: 'استلام نقدي',     icon: 'hand-coins',          cls: 'pill-green',  cashSign: +1, goldSign: 0,  color: 'success' },
    cash_payment:     { key: 'cash_payment',     label: 'سداد نقدي',       icon: 'banknote',            cls: 'pill-red',    cashSign: -1, goldSign: 0,  color: 'danger'  },
    gold_received:    { key: 'gold_received',    label: 'استلام ذهب',      icon: 'package-plus',        cls: 'pill-green',  cashSign: 0,  goldSign: +1, color: 'success' },
    gold_payment:     { key: 'gold_payment',     label: 'تسليم ذهب',       icon: 'package-minus',       cls: 'pill-red',    cashSign: 0,  goldSign: -1, color: 'danger'  },
    gold_settlement:  { key: 'gold_settlement',  label: 'تسوية ذهب',       icon: 'scale',               cls: 'pill-violet', cashSign: 0,  goldSign: +1, color: 'violet'  },
    cash_settlement:  { key: 'cash_settlement',  label: 'تسوية نقدية',     icon: 'sliders-horizontal',  cls: 'pill-violet', cashSign: +1, goldSign: 0,  color: 'violet'  },
    workmanship:      { key: 'workmanship',      label: 'مصنعية',          icon: 'hammer',              cls: 'pill-amber',  cashSign: -1, goldSign: 0,  color: 'warn'    },
    scrap_settlement: { key: 'scrap_settlement', label: 'تسوية كسر',       icon: 'recycle',             cls: 'pill-amber',  cashSign: 0,  goldSign: +1, color: 'warn'    },
    return_sale:      { key: 'return_sale',      label: 'مرتجع بيع',       icon: 'rotate-ccw',          cls: 'pill-blue',   cashSign: -1, goldSign: +1, color: 'info'    },
    return_purchase:  { key: 'return_purchase',  label: 'مرتجع شراء',      icon: 'undo-2',              cls: 'pill-blue',   cashSign: +1, goldSign: -1, color: 'info'    },
    adjustment:       { key: 'adjustment',       label: 'تسوية يدوية',     icon: 'settings-2',          cls: 'pill-violet', cashSign: +1, goldSign: +1, color: 'violet'  },
    opening:          { key: 'opening',          label: 'رصيد افتتاحي',    icon: 'flag',                cls: 'pill-gray',   cashSign: +1, goldSign: +1, color: 'muted'   },
  });

  /* ─── فئات المصروفات ─── */
  const EXPENSE_CATEGORIES = Object.freeze([
    { key: 'rent',        label: 'إيجار',             icon: 'home',             color: 'violet' },
    { key: 'salaries',    label: 'رواتب وأجور',       icon: 'users',            color: 'success' },
    { key: 'electricity', label: 'كهرباء',            icon: 'zap',              color: 'warn' },
    { key: 'water',       label: 'مياه',              icon: 'droplets',         color: 'info' },
    { key: 'gas',         label: 'غاز',               icon: 'flame',            color: 'danger' },
    { key: 'internet',    label: 'إنترنت وهاتف',      icon: 'wifi',             color: 'teal' },
    { key: 'maintenance', label: 'صيانة وإصلاح',      icon: 'wrench',           color: 'danger' },
    { key: 'marketing',   label: 'تسويق وإعلان',      icon: 'megaphone',        color: 'violet' },
    { key: 'transport',   label: 'نقل وشحن',          icon: 'truck',            color: 'info' },
    { key: 'supplies',    label: 'مستلزمات وقرطاسية', icon: 'package',          color: 'teal' },
    { key: 'insurance',   label: 'تأمينات',           icon: 'shield',           color: 'success' },
    { key: 'taxes',       label: 'ضرائب ورسوم',       icon: 'receipt',          color: 'danger' },
    { key: 'hospitality', label: 'ضيافة',             icon: 'coffee',           color: 'warn' },
    { key: 'commissions', label: 'عمولات',            icon: 'hand-coins',       color: 'success' },
    { key: 'other',       label: 'مصروفات أخرى',      icon: 'more-horizontal',  color: 'muted' },
  ]);

  /* ─── أنواع الجهات ─── */
  const ENTITY_TYPES = Object.freeze([
    { key: 'supplier', label: 'مورد',  icon: 'factory' },
    { key: 'workshop', label: 'ورشة',  icon: 'hammer'  },
    { key: 'customer', label: 'عميل',  icon: 'user'    },
    { key: 'other',    label: 'أخرى',  icon: 'circle'  },
  ]);

  const STORE_LEDGER = 'ledger';
  const MAX_ENTRIES  = 5000;

  /* ═════════════════════════════════════════════════════════════════════
     §2 · CacheDB — واجهة تخزين موحّدة
     ═════════════════════════════════════════════════════════════════════ */
  const CacheDB = {
    _prefix: 'gms.acc.',
    _maxPerStore: MAX_ENTRIES,

    async getAll(store) {
      try {
        if (!store) return [];
        const key = this._prefix + store;
        const raw = localStorage.getItem(key);

        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) return parsed;
        }

        if (GMS.IDB && GMS.IDB.isOpen) {
          try {
            const row = await GMS.IDB.metaGet(key);
            if (Array.isArray(row)) return row;
          } catch (_) {}
        }

        return [];
      } catch (e) {
        console.warn(`[CacheDB.getAll:${store}]`, e);
        return [];
      }
    },

    async save(store, entry) {
      try {
        if (!store || !entry || typeof entry !== 'object') return false;

        const key = this._prefix + store;
        const existing = await this.getAll(store);

        const id = entry.id || GMS.uid();
        entry.id = id;

        const idx = existing.findIndex(x => x.id === id);
        if (idx >= 0) {
          existing[idx] = { ...existing[idx], ...entry };
        } else {
          existing.unshift(entry);
        }

        const trimmed = existing.slice(0, this._maxPerStore);

        try {
          localStorage.setItem(key, JSON.stringify(trimmed));
        } catch (e) {
          console.warn('[CacheDB] localStorage quota exceeded — trimming');
          try {
            localStorage.setItem(key, JSON.stringify(trimmed.slice(0, Math.floor(this._maxPerStore / 2))));
          } catch (_) {}
        }

        if (GMS.IDB && GMS.IDB.isOpen) {
          try {
            await GMS.IDB.metaSet(key, trimmed.slice(0, 500));
          } catch (_) {}
        }

        return true;
      } catch (e) {
        console.error(`[CacheDB.save:${store}]`, e);
        return false;
      }
    },

    async delete(store, id) {
      try {
        const key = this._prefix + store;
        const existing = await this.getAll(store);
        const filtered = existing.filter(x => x.id !== id);
        localStorage.setItem(key, JSON.stringify(filtered));
        return true;
      } catch (e) {
        console.warn(`[CacheDB.delete:${store}]`, e);
        return false;
      }
    },

    async clear(store) {
      try {
        localStorage.removeItem(this._prefix + store);
        return true;
      } catch (_) {
        return false;
      }
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §3 · window.App — واجهة التوجيه الموحّدة
     ═════════════════════════════════════════════════════════════════════ */
  window.App = window.App || {
    navigateTo(route) {
      try {
        if (GMS.Router && typeof GMS.Router.go === 'function') {
          GMS.Router.go(route);
        } else {
          window.location.hash = '#/' + route;
        }
      } catch (e) {
        console.warn('[App.navigateTo]', e);
        window.location.hash = '#/' + route;
      }
    },

    reload() {
      try {
        if (GMS.Router && typeof GMS.Router.reload === 'function') {
          GMS.Router.reload();
        } else {
          window.location.reload();
        }
      } catch (_) {
        window.location.reload();
      }
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §4 · STATE
     ═════════════════════════════════════════════════════════════════════ */
  const State = {
    ledger: [],
    filtered: [],

    inventory: [],

    kpis: {
      cashBalance: 0,
      cashRevenue: 0,
      cashExpenses: 0,
      cashPurchases: 0,
      cashSettlements: 0,

      /* ✅ v3: العيارات القياسية */
      gold24Balance: 0,
      gold21Balance: 0,
      gold18Balance: 0,
      gold24Pure: 0,
      gold21Pure: 0,
      gold18Pure: 0,

      /* ✅ v3: العيارات المخصصة — نُجمّعها معاً */
      goldCustomBalance: 0,
      goldCustomPure: 0,
      customKaratCount: 0,

      totalNet: 0,
      totalPure: 0,
      totalEntries: 0,
    },

    page: 1,
    pageSize: 25,
    totalPages: 1,

    filters: {
      search: '',
      type: '',
      dateFrom: '',
      dateTo: '',
      entity: '',
    },

    loading: false,
    initialized: false,

    unsubscribers: [],

    timers: {
      search: null,
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §5 · HELPERS
     ═════════════════════════════════════════════════════════════════════ */

  function esc(v) {
    return GMS.esc ? GMS.esc(v) : String(v == null ? '' : v);
  }

  function moneyFmt(v) {
    return GMS.moneyFmt ? GMS.moneyFmt(v) : Number(v || 0).toFixed(2);
  }

  function gramFmt(v) {
    return GMS.gramFmt ? GMS.gramFmt(v) : Number(v || 0).toFixed(3);
  }

  function intFmt(v) {
    return GMS.intFmt ? GMS.intFmt(v) : String(Math.round(Number(v) || 0));
  }

  function round(v, d = 2) {
    return GMS.round ? GMS.round(v, d) : Math.round((Number(v) + Number.EPSILON) * Math.pow(10, d)) / Math.pow(10, d);
  }

  function dateAr(d) {
    try { return GMS.dateAr ? GMS.dateAr(d) : String(d || '—'); } catch (_) { return '—'; }
  }

  function dateTimeAr(d) {
    try { return GMS.dateTimeAr ? GMS.dateTimeAr(d) : String(d || '—'); } catch (_) { return '—'; }
  }

  function timeAgo(d) {
    try { return GMS.timeAgo ? GMS.timeAgo(d) : '—'; } catch (_) { return '—'; }
  }

  function getPrice24() {
    try {
      if (GMS.Cache && GMS.Cache.getPrice) {
        const p = GMS.Cache.getPrice();
        if (p && p.price_24) return Number(p.price_24);
      }
    } catch (_) {}
    return (GMS.APP_CONFIG && GMS.APP_CONFIG.DEFAULT_PRICE_24) || 4500;
  }

  function getBranches() {
    try {
      if (GMS.Demo && GMS.Demo.getBranches) return GMS.Demo.getBranches() || [];
    } catch (_) {}
    return [];
  }

  function getSuppliers() {
    try {
      if (GMS.Demo && GMS.Demo.getSuppliers) return GMS.Demo.getSuppliers() || [];
    } catch (_) {}
    return [];
  }

  function getWorkshops() {
    try {
      if (GMS.Demo && GMS.Demo.getWorkshops) return GMS.Demo.getWorkshops() || [];
    } catch (_) {}
    return [];
  }

  function getEntryType(key) {
    return ENTRY_TYPES[key] || {
      key, label: key, icon: 'activity', cls: 'pill-gray', color: 'muted',
      cashSign: 0, goldSign: 0,
    };
  }

  function getExpenseCategory(key) {
    return EXPENSE_CATEGORIES.find(c => c.key === key) || {
      key, label: 'مصروف', icon: 'receipt', color: 'muted',
    };
  }

  function getEntityType(key) {
    return ENTITY_TYPES.find(e => e.key === key) || {
      key, label: key, icon: 'circle',
    };
  }

  function generateEntryNo() {
    const d = new Date();
    const stamp =
      String(d.getFullYear()).slice(2) +
      String(d.getMonth() + 1).padStart(2, '0') +
      String(d.getDate()).padStart(2, '0') + '-' +
      String(d.getHours()).padStart(2, '0') +
      String(d.getMinutes()).padStart(2, '0') +
      String(d.getSeconds()).padStart(2, '0');
    const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
    return `ACC-${stamp}-${rand}`;
  }

  function getActiveBranchId() {
    return (GMS.Auth && GMS.Auth.profile && GMS.Auth.profile.branch_id)
      || (GMS.APP_CONFIG && GMS.APP_CONFIG.DEFAULT_BRANCH_ID)
      || 'br-1';
  }

  function cleanupListeners() {
    State.unsubscribers.forEach(fn => {
      try { fn(); } catch (_) {}
    });
    State.unsubscribers = [];
    clearTimeout(State.timers.search);
  }

  /**
   * ✅ v3: قراءة معلومات العيار لحركة (قياسي أو مخصص)
   * @param {Object} entry
   * @returns {{karat, custom_karat, purity_ratio, is_custom, display}}
   */
  function getEntryKaratInfo(entry) {
    if (!entry) return GMS.resolveKarat(21);

    /* لو عنده is_custom_karat صريح */
    if (entry.is_custom_karat === true || entry.custom_karat != null) {
      return GMS.resolveKarat({
        custom_karat: entry.custom_karat,
        purity_ratio: entry.gold_purity_weight && entry.gold_net_weight
          ? (Number(entry.gold_purity_weight) / Number(entry.gold_net_weight))
          : entry.purity_ratio,
        is_custom: true,
      });
    }

    /* قياسي */
    if (entry.gold_karat != null) {
      return GMS.resolveKarat(entry.gold_karat);
    }

    /* fallback */
    return GMS.resolveKarat(21);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §6 · DATA LOADING
     ═════════════════════════════════════════════════════════════════════ */

  async function loadLedger() {
    try {
      State.loading = true;

      let rows = [];

      try {
        rows = await CacheDB.getAll(STORE_LEDGER);
      } catch (e) {
        console.warn('[Accounting] CacheDB read failed:', e);
      }

      if (GMS.Supabase && GMS.Supabase.isReady && GMS.Supabase.isReady()
          && (!GMS.Auth || !GMS.Auth.can || GMS.Auth.can('viewProfitReport'))) {
        try {
          const client = GMS.Supabase.get();
          const { data, error } = await client
            .from(GMS.SUPABASE_CONFIG.TABLES.GENERAL_LEDGER)
            .select('*')
            .order('entry_date', { ascending: false })
            .limit(2000);

          if (!error && Array.isArray(data)) {
            const ids = new Set(rows.map(r => r.id));
            data.forEach(row => {
              if (!ids.has(row.id)) rows.push(row);
            });
          }
        } catch (e) {
          console.warn('[Accounting] Supabase read failed:', e);
        }
      }

      rows.sort((a, b) => {
        const ta = new Date(a.entry_date || a.created_at || 0).getTime();
        const tb = new Date(b.entry_date || b.created_at || 0).getTime();
        return tb - ta;
      });

      State.ledger = rows.slice(0, MAX_ENTRIES);
      return State.ledger;

    } catch (e) {
      console.error('[Accounting] loadLedger failed:', e);
      State.ledger = [];
      return [];
    } finally {
      State.loading = false;
    }
  }

  async function loadInventory() {
    try {
      let items = [];

      if (GMS.IDB && GMS.IDB.isOpen) {
        try {
          items = await GMS.IDB.getAll();
        } catch (_) {}
      }

      if (!items.length && GMS.Demo && GMS.Demo.getInventory) {
        items = GMS.Demo.getInventory();
      }

      State.inventory = Array.isArray(items) ? items : [];
      return State.inventory;
    } catch (e) {
      console.warn('[Accounting] loadInventory failed:', e);
      State.inventory = [];
      return [];
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §7 · KPI COMPUTATION — ✅ v3 مع دعم العيارات المخصصة
     ═════════════════════════════════════════════════════════════════════ */

  function computeKPIs() {
    const ledger = State.ledger;
    const inventory = State.inventory;

    let cashBalance = 0;
    let cashRevenue = 0;
    let cashExpenses = 0;
    let cashPurchases = 0;
    let cashSettlements = 0;

    /* العيارات القياسية */
    const goldByKarat = {
      24: { net: 0, pure: 0 },
      21: { net: 0, pure: 0 },
      18: { net: 0, pure: 0 },
    };

    /* ✅ v3: العيارات المخصصة */
    let customNet = 0;
    let customPure = 0;
    let customKaratCount = 0;

    ledger.forEach(entry => {
      const cashDelta = Number(entry.cash_delta || 0);
      const goldDelta = Number(entry.gold_delta || 0);
      const karat = Number(entry.gold_karat || entry.karat || 0);
      const netWeight = Number(entry.gold_net_weight || entry.net_weight || 0);
      const pureWeight = Number(entry.gold_pure_weight || entry.pure_weight || 0);
      const type = entry.entry_type || entry.type;
      const isCustom = entry.is_custom_karat === true || entry.custom_karat != null;

      cashBalance += cashDelta;

      if (type === 'sale' || type === 'return_sale') {
        cashRevenue += cashDelta;
      } else if (type === 'expense') {
        cashExpenses += Math.abs(cashDelta);
      } else if (type === 'purchase') {
        cashPurchases += Math.abs(cashDelta);
      } else if (type === 'cash_settlement' || type === 'gold_settlement') {
        cashSettlements += cashDelta;
      }

      /* ✅ v3: توزيع الذهب — قياسي أو مخصص */
      if (isCustom) {
        /* عيار مخصص */
        const customPurity = Number(entry.purity_ratio) ||
          (Number(entry.custom_karat) / 1000) ||
          0;

        const net = netWeight || (customPurity > 0 ? goldDelta / customPurity : 0);
        const pure = pureWeight || goldDelta;

        customNet += net;
        customPure += pure;
        customKaratCount++;
      } else if (karat && goldByKarat[karat]) {
        /* عيار قياسي */
        const ratio = GMS.karatRatio ? GMS.karatRatio(karat) : 1;
        const net = netWeight || (ratio > 0 ? goldDelta / ratio : 0);
        const pure = pureWeight || goldDelta;

        goldByKarat[karat].net += net;
        goldByKarat[karat].pure += pure;
      }
    });

    /* fallback — من المخزون إذا كان الدفتر فارغاً */
    if (ledger.length === 0 && inventory.length > 0) {
      inventory.forEach(item => {
        if (item.status !== 'IN_STOCK') return;

        const itemIsCustom = item.is_custom_karat === true || item.custom_karat != null;

        if (itemIsCustom) {
          customNet += Number(item.net_weight || 0);
          customPure += Number(item.pure_weight || 0);
          customKaratCount++;
        } else {
          const k = Number(item.karat);
          if (goldByKarat[k]) {
            goldByKarat[k].net += Number(item.net_weight || 0);
            goldByKarat[k].pure += Number(item.pure_weight || 0);
          }
        }
      });
    }

    let totalNet = 0;
    let totalPure = 0;
    [24, 21, 18].forEach(k => {
      totalNet += goldByKarat[k].net;
      totalPure += goldByKarat[k].pure;
    });

    /* ✅ v3: نضيف المخصص على الإجمالي */
    totalNet += customNet;
    totalPure += customPure;

    State.kpis = {
      cashBalance: round(cashBalance, 2),
      cashRevenue: round(cashRevenue, 2),
      cashExpenses: round(cashExpenses, 2),
      cashPurchases: round(cashPurchases, 2),
      cashSettlements: round(cashSettlements, 2),

      gold24Balance: round(goldByKarat[24].net, 3),
      gold21Balance: round(goldByKarat[21].net, 3),
      gold18Balance: round(goldByKarat[18].net, 3),
      gold24Pure: round(goldByKarat[24].pure, 4),
      gold21Pure: round(goldByKarat[21].pure, 4),
      gold18Pure: round(goldByKarat[18].pure, 4),

      /* ✅ v3 */
      goldCustomBalance: round(customNet, 3),
      goldCustomPure: round(customPure, 4),
      customKaratCount,

      totalNet: round(totalNet, 3),
      totalPure: round(totalPure, 4),
      totalEntries: ledger.length,
    };

    return State.kpis;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §8 · FILTERS + PAGINATION
     ═════════════════════════════════════════════════════════════════════ */

  function applyFilters() {
    const f = State.filters;
    let rows = State.ledger.slice();

    if (f.search) {
      const q = f.search.toLowerCase().trim();
      rows = rows.filter(r => {
        const hay = [
          r.entry_no, r.reference_no, r.description,
          r.entity_name, r.paid_to, r.branch_name,
        ].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(q);
      });
    }

    if (f.type) {
      rows = rows.filter(r => (r.entry_type || r.type) === f.type);
    }

    if (f.dateFrom) {
      rows = rows.filter(r => {
        const d = (r.entry_date || r.created_at || '').slice(0, 10);
        return d >= f.dateFrom;
      });
    }

    if (f.dateTo) {
      rows = rows.filter(r => {
        const d = (r.entry_date || r.created_at || '').slice(0, 10);
        return d <= f.dateTo;
      });
    }

    if (f.entity) {
      rows = rows.filter(r =>
        r.entity_type === f.entity || r.entity_id === f.entity
      );
    }

    State.filtered = rows;
    State.totalPages = Math.max(1, Math.ceil(rows.length / State.pageSize));

    if (State.page > State.totalPages) State.page = State.totalPages;

    return rows;
  }

  function getPageItems() {
    const start = (State.page - 1) * State.pageSize;
    return State.filtered.slice(start, start + State.pageSize);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §9 · HTML RENDERERS — KPI CARDS (v3 مع العيار المخصص)
     ═════════════════════════════════════════════════════════════════════ */

  function renderKPIs() {
    const k = State.kpis;
    const price24 = getPrice24();
    const cashCls = k.cashBalance >= 0 ? 'success' : 'danger';
    const goldValue = round(k.totalPure * price24, 2);

    /* ✅ v3: نص المخصص في meta */
    const customMeta = k.customKaratCount > 0
      ? ` · <b style="color:var(--warn)">${intFmt(k.customKaratCount)}</b> مخصص`
      : '';

    return `
      <div class="kpi-row cols-4">
        <!-- الرصيد النقدي -->
        <div class="kpi ${cashCls}">
          <div class="kpi-label">
            <i data-lucide="wallet"></i>
            إجمالي الرصيد النقدي
          </div>
          <div class="kpi-value">
            ${moneyFmt(k.cashBalance)}
            <small>ج.م</small>
          </div>
          <div class="kpi-meta">
            مبيعات: <b>${moneyFmt(k.cashRevenue)}</b>
            · مصروفات: <b>${moneyFmt(k.cashExpenses)}</b>
          </div>
        </div>

        <!-- ذهب عيار 24 -->
        <div class="kpi gold">
          <div class="kpi-label">
            <i data-lucide="gem"></i>
            ذهب عيار 24
          </div>
          <div class="kpi-value">
            ${gramFmt(k.gold24Balance)}
            <small>جم</small>
          </div>
          <div class="kpi-meta">
            بندق: <b>${gramFmt(k.gold24Pure)}</b> جم
          </div>
        </div>

        <!-- ذهب عيار 21 -->
        <div class="kpi warn">
          <div class="kpi-label">
            <i data-lucide="gem"></i>
            ذهب عيار 21
          </div>
          <div class="kpi-value">
            ${gramFmt(k.gold21Balance)}
            <small>جم</small>
          </div>
          <div class="kpi-meta">
            بندق: <b>${gramFmt(k.gold21Pure)}</b> جم
          </div>
        </div>

        <!-- ذهب عيار 18 -->
        <div class="kpi violet">
          <div class="kpi-label">
            <i data-lucide="gem"></i>
            ذهب عيار 18
          </div>
          <div class="kpi-value">
            ${gramFmt(k.gold18Balance)}
            <small>جم</small>
          </div>
          <div class="kpi-meta">
            بندق: <b>${gramFmt(k.gold18Pure)}</b> جم
          </div>
        </div>
      </div>

      <!-- ✅ v3: صف ثانوي — مع ذهب مخصص -->
      <div class="kpi-row cols-4">
        <!-- ذهب مخصص -->
        <div class="kpi ${k.customKaratCount > 0 ? 'warn' : 'teal'}">
          <div class="kpi-label">
            <i data-lucide="sliders-horizontal"></i>
            ذهب عيار مخصص
          </div>
          <div class="kpi-value">
            ${gramFmt(k.goldCustomBalance)}
            <small>جم</small>
          </div>
          <div class="kpi-meta">
            بندق: <b>${gramFmt(k.goldCustomPure)}</b> جم
            ${k.customKaratCount > 0
              ? ` · <b>${intFmt(k.customKaratCount)}</b> حركة`
              : ' · لا يوجد'}
          </div>
        </div>

        <div class="kpi gold">
          <div class="kpi-label">
            <i data-lucide="scale"></i>
            إجمالي الوزن الصافي
          </div>
          <div class="kpi-value">
            ${gramFmt(k.totalNet)}
            <small>جم</small>
          </div>
          <div class="kpi-meta">
            مجموع جميع العيارات${customMeta}
          </div>
        </div>

        <div class="kpi info">
          <div class="kpi-label">
            <i data-lucide="sparkles"></i>
            إجمالي البندق 24K
          </div>
          <div class="kpi-value">
            ${gramFmt(k.totalPure)}
            <small>جم</small>
          </div>
          <div class="kpi-meta">
            القيمة السوقية: <b>${moneyFmt(goldValue)}</b> ج.م
          </div>
        </div>

        <div class="kpi teal">
          <div class="kpi-label">
            <i data-lucide="list-checks"></i>
            عدد الحركات
          </div>
          <div class="kpi-value">
            ${intFmt(k.totalEntries)}
          </div>
          <div class="kpi-meta">
            في دفتر اليومية
          </div>
        </div>
      </div>
    `;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §10 · HTML RENDERERS — TOOLBAR
     ═════════════════════════════════════════════════════════════════════ */

  function renderToolbar() {
    return `
      <div class="card" style="margin-bottom:16px">
        <div class="toolbar-row">
          <div class="search-wrap" style="flex:1;min-width:220px;max-width:380px">
            <i data-lucide="search"></i>
            <input id="acc-search-input"
                   placeholder="بحث برقم الحركة، البيان، أو المورد…"
                   value="${esc(State.filters.search)}"
                   autocomplete="off">
          </div>

          <select class="filter-select" id="acc-filter-type" style="min-width:170px">
            <option value="">كل الأنواع</option>
            ${Object.values(ENTRY_TYPES).map(t => `
              <option value="${t.key}" ${State.filters.type === t.key ? 'selected' : ''}>
                ${t.label}
              </option>
            `).join('')}
          </select>

          <div class="field" style="min-width:140px;max-width:160px">
            <input type="date" id="acc-filter-from"
                   value="${esc(State.filters.dateFrom)}"
                   style="padding:8px 12px">
          </div>

          <div class="field" style="min-width:140px;max-width:160px">
            <input type="date" id="acc-filter-to"
                   value="${esc(State.filters.dateTo)}"
                   style="padding:8px 12px">
          </div>

          <div class="spacer" style="flex:1"></div>

          <span class="chip info">
            <i data-lucide="database" style="width:12px;height:12px"></i>
            ${intFmt(State.filtered.length)} حركة
          </span>

          <button class="btn btn-sm" id="acc-export-btn" type="button">
            <i data-lucide="download"></i>
            تصدير
          </button>
        </div>

        <div class="toolbar-row">
          <button class="btn btn-primary btn-sm" id="acc-new-expense" type="button">
            <i data-lucide="plus-circle"></i>
            مصروف جديد
          </button>

          <button class="btn btn-info btn-sm" id="acc-new-settlement" type="button">
            <i data-lucide="scale"></i>
            تسوية ذهب/نقد
          </button>

          <button class="btn btn-sm" id="acc-refresh-btn" type="button">
            <i data-lucide="refresh-cw"></i>
            تحديث
          </button>
        </div>
      </div>
    `;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §11 · HTML RENDERERS — LEDGER TABLE (v3 مع العيار المخصص)
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * ✅ v3: عرض شارة العيار — قياسي أو مخصص
   */
  function renderEntryKaratBadge(entry) {
    const info = getEntryKaratInfo(entry);

    if (info.is_custom) {
      const num = info.custom_karat;
      const purity = Number(info.purity_ratio || 0);

      return `
        <span class="karat-badge custom-karat-badge"
              data-k="custom"
              data-custom="${num}"
              title="عيار مخصص ${num} — نقاء ${purity.toFixed(4)}">
          <i data-lucide="sliders-horizontal"
             style="width:10px;height:10px;
                    display:inline;vertical-align:-1px;
                    margin-inline-end:2px"></i>
          ${num}
        </span>
      `;
    }

    return `<span class="karat-badge" data-k="${info.karat}">${info.karat}K</span>`;
  }

  function renderEntryRow(entry) {
    const type = getEntryType(entry.entry_type || entry.type);
    const cashDelta = Number(entry.cash_delta || 0);
    const goldDelta = Number(entry.gold_delta || 0);
    const karatInfo = getEntryKaratInfo(entry);
    const hasKarat = entry.gold_karat != null || entry.custom_karat != null || entry.is_custom_karat;

    const date = entry.entry_date || entry.created_at;

    const cashCls = cashDelta > 0 ? 'pill-green'
                  : cashDelta < 0 ? 'pill-red'
                  : 'pill-gray';

    const goldCls = goldDelta > 0 ? 'pill-green'
                  : goldDelta < 0 ? 'pill-red'
                  : 'pill-gray';

    return `
      <tr data-entry-id="${esc(entry.id)}" style="cursor:pointer">
        <td class="mono" style="font-weight:800;font-size:11.5px">
          ${esc(entry.entry_no || entry.id || '—')}
        </td>
        <td style="font-size:11px;color:var(--muted)">
          <div style="display:flex;flex-direction:column;line-height:1.3">
            <span class="mono" style="font-weight:700">${esc(dateAr(date))}</span>
            <span class="mono" style="font-size:10px">${timeAgo(date)}</span>
          </div>
        </td>
        <td>
          <span class="pill ${type.cls}">
            <i data-lucide="${type.icon}" style="width:10px;height:10px"></i>
            ${esc(type.label)}
          </span>
        </td>
        <td style="font-size:11.5px">${esc(entry.description || '—')}</td>
        <td class="col-num">
          ${cashDelta !== 0
            ? `<span class="pill ${cashCls}" style="font-family:var(--font-mono);font-size:11px">
                 ${cashDelta > 0 ? '+' : '−'}${moneyFmt(Math.abs(cashDelta))}
               </span>`
            : '<span style="color:var(--muted)">—</span>'}
        </td>
        <td class="col-num">
          ${goldDelta !== 0
            ? `<span class="pill ${goldCls}" style="font-family:var(--font-mono);font-size:11px">
                 ${goldDelta > 0 ? '+' : '−'}${gramFmt(Math.abs(goldDelta))}
               </span>`
            : '<span style="color:var(--muted)">—</span>'}
        </td>
        <td class="col-c">
          ${hasKarat
            ? renderEntryKaratBadge(entry)
            : '<span style="color:var(--muted)">—</span>'}
        </td>
        <td class="col-c">
          <button class="row-act" data-view-acc-entry="${esc(entry.id)}" title="تفاصيل">
            <i data-lucide="eye"></i>
          </button>
        </td>
      </tr>
    `;
  }

  function renderLedgerTable() {
    const pageItems = getPageItems();

    if (State.filtered.length === 0) {
      return `
        <div class="empty" style="padding:80px 20px">
          <i data-lucide="book-open"></i>
          <p>لا توجد حركات محاسبية</p>
          <span>${State.filters.search || State.filters.type
            ? 'جرّب تعديل الفلاتر'
            : 'ابدأ بتسجيل مصروف أو تسوية'}</span>
          <div style="margin-top:16px">
            <button class="btn btn-primary btn-sm" id="acc-empty-expense" type="button">
              <i data-lucide="plus-circle"></i>
              مصروف جديد
            </button>
          </div>
        </div>
      `;
    }

    return `
      <div class="table-wrap" style="border:none;border-radius:0;max-height:60vh">
        <table class="tbl">
          <thead>
            <tr>
              <th style="width:150px">رقم الحركة</th>
              <th style="width:120px">التاريخ</th>
              <th style="width:130px">النوع</th>
              <th>البيان</th>
              <th style="width:140px" class="col-num">المبلغ النقدي</th>
              <th style="width:130px" class="col-num">وزن الذهب</th>
              <th style="width:85px"  class="col-c">العيار</th>
              <th style="width:60px"  class="col-c">—</th>
            </tr>
          </thead>
          <tbody>
            ${pageItems.map(renderEntryRow).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderPagination() {
    const { page, totalPages, pageSize, filtered } = State;

    if (totalPages <= 1) return '';

    const startIdx = (page - 1) * pageSize + 1;
    const endIdx = Math.min(page * pageSize, filtered.length);

    const pageButtons = [];
    const winSize = 2;
    const from = Math.max(1, page - winSize);
    const to   = Math.min(totalPages, page + winSize);

    const btn = (p, label, opts = {}) => `
      <button class="pg-btn ${opts.active ? 'active' : ''}"
              data-acc-page="${p}"
              type="button"
              ${opts.disabled ? 'disabled' : ''}>
        ${label}
      </button>
    `;

    pageButtons.push(btn(1, '<i data-lucide="chevrons-right" style="width:14px;height:14px"></i>', { disabled: page === 1 }));
    pageButtons.push(btn(page - 1, '<i data-lucide="chevron-right" style="width:14px;height:14px"></i>', { disabled: page === 1 }));

    if (from > 1) {
      pageButtons.push(btn(1, '1'));
      if (from > 2) pageButtons.push('<span class="pg-ellipsis">…</span>');
    }

    for (let p = from; p <= to; p++) {
      pageButtons.push(btn(p, String(p), { active: p === page }));
    }

    if (to < totalPages) {
      if (to < totalPages - 1) pageButtons.push('<span class="pg-ellipsis">…</span>');
      pageButtons.push(btn(totalPages, String(totalPages)));
    }

    pageButtons.push(btn(page + 1, '<i data-lucide="chevron-left" style="width:14px;height:14px"></i>', { disabled: page === totalPages }));
    pageButtons.push(btn(totalPages, '<i data-lucide="chevrons-left" style="width:14px;height:14px"></i>', { disabled: page === totalPages }));

    return `
      <div class="pager">
        <div class="pg-info">
          <i data-lucide="rows-3" style="width:14px;height:14px"></i>
          <span>عرض</span>
          <b>${intFmt(startIdx)}–${intFmt(endIdx)}</b>
          <span>من</span>
          <b>${intFmt(filtered.length)}</b>
          <span class="sep">·</span>
          <span>صفحة</span>
          <b>${page}</b>
          <span>من</span>
          <b>${totalPages}</b>
        </div>

        <div class="spacer" style="flex:1"></div>

        <select class="pg-size" id="acc-page-size">
          ${[10, 25, 50, 100, 250].map(s => `
            <option value="${s}" ${s === pageSize ? 'selected' : ''}>
              ${s} / صفحة
            </option>
          `).join('')}
        </select>

        <div class="pg-controls">
          ${pageButtons.join('')}
        </div>
      </div>
    `;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §12 · MAIN RENDER
     ═════════════════════════════════════════════════════════════════════ */

  async function render(root) {
    if (!root) {
      console.warn('[Accounting.render] No root element');
      return;
    }

    try {
      root.innerHTML = `
        <div style="padding:60px;text-align:center">
          <div class="spinner" style="margin:0 auto 14px"></div>
          <div style="font-size:13px;color:var(--muted);font-weight:600">
            جارٍ تحميل البيانات المحاسبية…
          </div>
        </div>
      `;

      await loadLedger();
      await loadInventory();

      computeKPIs();
      applyFilters();

      root.innerHTML = `
        <div class="page-header">
          <h2>
            <i data-lucide="book-open"></i>
            المحاسبة والمالية
          </h2>
          <p>
            دفتر اليومية المزدوج — متابعة السيولة النقدية وأرصدة الذهب
            حسب العيارات، مع إدارة المصروفات والتسويات.
            <span class="chip warn" style="font-size:10px;margin-inline-start:6px">
              <i data-lucide="sliders-horizontal" style="width:10px;height:10px"></i>
              يدعم العيارات المخصصة
            </span>
          </p>
        </div>

        ${renderKPIs()}
        ${renderToolbar()}

        <div class="card">
          <div class="card-head">
            <h3>
              <i data-lucide="list"></i>
              دفتر اليومية العام
            </h3>
            <div class="spacer" style="flex:1"></div>
            <span class="card-sub">
              ${intFmt(State.ledger.length)} حركة في الدفتر
            </span>
          </div>

          <div id="acc-table-host">
            ${renderLedgerTable()}
          </div>

          <div id="acc-pagination-host">
            ${renderPagination()}
          </div>
        </div>
      `;

      window.lucide?.createIcons();

      if (typeof afterRender === 'function') afterRender();
      if (typeof initEvents === 'function') initEvents();

    } catch (e) {
      console.error('[Accounting.render]', e);
      root.innerHTML = `
        <div class="card">
          <div class="card-body">
            <div class="empty" style="padding:60px 20px">
              <i data-lucide="alert-circle" style="color:var(--danger)"></i>
              <p>فشل تحميل الصفحة المحاسبية</p>
              <span>${esc(e.message)}</span>
              <div style="margin-top:16px">
                <button class="btn btn-primary" id="acc-retry-btn" type="button">
                  <i data-lucide="refresh-cw"></i>
                  إعادة المحاولة
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
      window.lucide?.createIcons();

      const retry = document.getElementById('acc-retry-btn');
      if (retry) {
        retry.onclick = () => render(document.getElementById('page'));
      }
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §13 · EXPENSE MODAL
     ═════════════════════════════════════════════════════════════════════ */

  function openExpenseModal() {
    try {
      const branches = getBranches();
      const today = new Date().toISOString().slice(0, 10);
      const defaultBranch = getActiveBranchId();

      GMS.Modal.open({
        title: 'تسجيل مصروف تشغيلي',
        icon: 'receipt',
        size: 'lg',
        body: `
          <div class="grid-form">
            <div class="field">
              <label>فئة المصروف <span class="req">*</span></label>
              <select id="exp-category">
                ${EXPENSE_CATEGORIES.map(c => `
                  <option value="${c.key}">${esc(c.label)}</option>
                `).join('')}
              </select>
            </div>

            <div class="field">
              <label>المبلغ (ج.م) <span class="req">*</span></label>
              <input type="number" id="exp-amount"
                     step="0.01" min="0" placeholder="0.00"
                     class="mono big">
            </div>

            <div class="field">
              <label>التاريخ <span class="req">*</span></label>
              <input type="date" id="exp-date" value="${today}">
            </div>

            <div class="field">
              <label>طريقة الدفع</label>
              <select id="exp-payment-method">
                <option value="cash">نقدي من الصندوق</option>
                <option value="bank">تحويل بنكي</option>
                <option value="card">بطاقة</option>
                <option value="credit">آجل (على الحساب)</option>
              </select>
            </div>

            <div class="field">
              <label>المدفوع له / الجهة</label>
              <input id="exp-paid-to" placeholder="اسم المالك، الشركة، الموظف…">
            </div>

            <div class="field">
              <label>رقم الفاتورة / الإيصال</label>
              <input id="exp-receipt-no" placeholder="اختياري" class="mono">
            </div>

            <div class="field">
              <label>الفرع</label>
              <select id="exp-branch">
                ${branches.map(b => `
                  <option value="${b.id}" ${defaultBranch === b.id ? 'selected' : ''}>
                    ${esc(b.name)}
                  </option>
                `).join('')}
              </select>
            </div>

            <div class="field">
              <label>مركز التكلفة</label>
              <select id="exp-cost-center">
                <option value="general">عام</option>
                <option value="workshop">الورشة</option>
                <option value="showroom">صالة العرض</option>
                <option value="office">المكتب</option>
              </select>
            </div>

            <div class="field field-full">
              <label>البيان / الوصف</label>
              <textarea id="exp-description" rows="2"
                        placeholder="وصف تفصيلي للمصروف…"></textarea>
            </div>
          </div>

          <div id="exp-preview"
               style="margin-top:16px;padding:14px;
                      background:var(--warn-bg);border-radius:11px;
                      border:1px solid color-mix(in srgb,var(--warn) 30%,var(--border))">
            <div style="font-size:11px;font-weight:800;color:var(--warn);
                        text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">
              معاينة القيد المحاسبي
            </div>
            <div style="font-family:var(--font-mono);font-size:12.5px;
                        font-weight:700;color:var(--text-2);line-height:1.9">
              ح/ مصروفات &nbsp;<span style="color:var(--danger)">مدين</span><br>
              ح/ النقدية &nbsp;<span style="color:var(--success)">دائن</span>
            </div>
          </div>
        `,
        footer: `
          <button class="btn" data-close>إلغاء</button>
          <button class="btn btn-primary btn-lg" id="exp-save" type="button">
            <i data-lucide="save"></i>
            حفظ المصروف
          </button>
        `,
        onMount: (el, close) => {
          const $ = (id) => el.querySelector('#' + id);

          const updatePreview = () => {
            const cat = $('exp-category')?.value || 'other';
            const amount = parseFloat($('exp-amount')?.value) || 0;
            const categoryLabel = getExpenseCategory(cat).label;
            const method = $('exp-payment-method')?.value || 'cash';

            const methodLabel = {
              cash: 'النقدية بالصندوق',
              bank: 'النقدية بالبنك',
              card: 'بطاقة / شبكة',
              credit: 'حساب آجل',
            }[method];

            const preview = $('exp-preview');
            if (preview) {
              preview.innerHTML = `
                <div style="font-size:11px;font-weight:800;color:var(--warn);
                            text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">
                  معاينة القيد المحاسبي
                </div>
                <div style="font-family:var(--font-mono);font-size:12.5px;
                            font-weight:700;color:var(--text-2);line-height:1.9">
                  <div>ح/ ${esc(categoryLabel)} &nbsp;
                    <span style="color:var(--danger)">مدين</span>
                    &nbsp; ${moneyFmt(amount)} ج.م
                  </div>
                  <div>ح/ ${esc(methodLabel)} &nbsp;
                    <span style="color:var(--success)">دائن</span>
                    &nbsp; ${moneyFmt(amount)} ج.م
                  </div>
                </div>
              `;
            }
          };

          $('exp-amount')?.addEventListener('input', updatePreview);
          $('exp-category')?.addEventListener('change', updatePreview);
          $('exp-payment-method')?.addEventListener('change', updatePreview);

          updatePreview();

          $('exp-save').onclick = () => saveExpense(el, close);

          setTimeout(() => {
            const amt = $('exp-amount');
            if (amt) {
              try { amt.focus({ preventScroll: true }); } catch (_) { amt.focus(); }
            }
          }, 200);
        },
      });
    } catch (e) {
      console.error('[Accounting.openExpenseModal]', e);
      GMS.Toast.err('فشل فتح نافذة المصروف', e.message);
    }
  }

  async function saveExpense(el, closeFn) {
    try {
      const $ = (id) => el.querySelector('#' + id);

      const category = $('exp-category')?.value || 'other';
      const amount = parseFloat($('exp-amount')?.value) || 0;
      const date = $('exp-date')?.value || new Date().toISOString().slice(0, 10);
      const method = $('exp-payment-method')?.value || 'cash';
      const paidTo = $('exp-paid-to')?.value.trim() || '';
      const receiptNo = $('exp-receipt-no')?.value.trim() || '';
      const branchId = $('exp-branch')?.value || getActiveBranchId();
      const costCenter = $('exp-cost-center')?.value || 'general';
      const description = $('exp-description')?.value.trim() || '';

      if (amount <= 0) {
        GMS.Beep?.error?.();
        return GMS.Toast.err('المبلغ مطلوب', 'يجب أن يكون أكبر من صفر');
      }

      if (amount > 10000000) {
        GMS.Beep?.error?.();
        return GMS.Toast.err('المبلغ كبير جداً', 'راجع القيمة المدخلة');
      }

      const saveBtn = $('exp-save');
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = `<i data-lucide="loader-circle"></i> جارٍ الحفظ…`;
        window.lucide?.createIcons();
      }

      const now = new Date().toISOString();
      const categoryLabel = getExpenseCategory(category).label;
      const entryNo = generateEntryNo();

      const entry = {
        id: GMS.uid(),
        entry_no: entryNo,
        entry_date: date + 'T' + new Date().toTimeString().slice(0, 8),
        created_at: now,
        entry_type: 'expense',
        type: 'expense',

        cash_delta: -amount,
        gold_delta: 0,
        gold_karat: null,
        custom_karat: null,
        is_custom_karat: false,
        gold_net_weight: null,
        gold_pure_weight: null,

        expense_category: category,
        expense_category_label: categoryLabel,
        payment_method: method,
        paid_to: paidTo,
        receipt_no: receiptNo,
        cost_center: costCenter,
        description: description || `${categoryLabel}${paidTo ? ' — ' + paidTo : ''}`,
        reference_no: receiptNo || entryNo,

        entity_type: 'expense',
        entity_id: null,
        entity_name: paidTo || categoryLabel,

        branch_id: branchId,
        branch_name: getBranches().find(b => b.id === branchId)?.name || '—',
        created_by: (GMS.Auth && GMS.Auth.profile && GMS.Auth.profile.full_name) || '—',
        created_by_id: (GMS.Auth && GMS.Auth.user && GMS.Auth.user.id) || null,
      };

      const saved = await CacheDB.save(STORE_LEDGER, entry);
      if (!saved) throw new Error('فشل الحفظ في الذاكرة المحلية');

      if (GMS.Supabase && GMS.Supabase.isReady && GMS.Supabase.isReady()) {
        try {
          await GMS.Supabase.get()
            .from(GMS.SUPABASE_CONFIG.TABLES.GENERAL_LEDGER)
            .insert({
              entry_no: entry.entry_no,
              entry_date: entry.entry_date,
              entry_type: entry.entry_type,
              cash_delta: entry.cash_delta,
              gold_delta: entry.gold_delta,
              description: entry.description,
              reference_no: entry.reference_no,
              expense_category: entry.expense_category,
              payment_method: entry.payment_method,
              paid_to: entry.paid_to,
              branch_id: entry.branch_id,
            });
        } catch (e) {
          console.warn('[Accounting.saveExpense] Supabase failed:', e);
          if (GMS.IDB && GMS.IDB.queueAdd) {
            try {
              await GMS.IDB.queueAdd({
                id: 'exp-' + entry.id,
                type: 'expense_create',
                entry,
                created_at: now,
              });
            } catch (_) {}
          }
        }
      }

      if (GMS.Audit) {
        try {
          await GMS.Audit.log(
            'CREATE', 'expense', entry.id,
            `مصروف تشغيلي — ${categoryLabel} · ${moneyFmt(amount)} ج.م`,
            { entry_no: entry.entry_no, category, amount, paid_to: paidTo }
          );
        } catch (_) {}
      }

      if (GMS.Realtime) {
        try { GMS.Realtime.emit('general_ledger', 'INSERT', entry); } catch (_) {}
      }

      State.ledger.unshift(entry);
      computeKPIs();
      applyFilters();

      GMS.Beep?.success?.();
      GMS.Toast.ok('تم تسجيل المصروف', `${categoryLabel} · ${moneyFmt(amount)} ج.م`);

      if (typeof closeFn === 'function') closeFn();
      window.App.navigateTo('accounting');

    } catch (e) {
      console.error('[Accounting.saveExpense]', e);
      GMS.Beep?.error?.();
      GMS.Toast.err('فشل حفظ المصروف', e.message);

      const saveBtn = el.querySelector('#exp-save');
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = `<i data-lucide="save"></i> إعادة المحاولة`;
        window.lucide?.createIcons();
      }
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §14 · SETTLEMENT MODAL — ✅ v3 مع العيار المخصص
     ═════════════════════════════════════════════════════════════════════ */

  function openSettlementModal() {
    try {
      const suppliers = getSuppliers();
      const workshops = getWorkshops();

      GMS.Modal.open({
        title: 'تسوية ذهب أو نقد',
        icon: 'scale',
        size: 'lg',
        body: `
          <!-- نوع الجهة -->
          <div style="margin-bottom:16px">
            <div style="font-size:11px;font-weight:800;color:var(--muted);
                        text-transform:uppercase;letter-spacing:.4px;
                        margin-bottom:9px">
              نوع الجهة
            </div>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px"
                 id="set-entity-type-grid">
              ${ENTITY_TYPES.map(t => `
                <button type="button" data-entity-type="${t.key}"
                        class="settlement-entity-btn ${t.key === 'supplier' ? 'active' : ''}"
                        style="display:flex;flex-direction:column;align-items:center;
                               gap:6px;padding:12px 8px;border-radius:11px;
                               border:1.5px solid ${t.key === 'supplier' ? 'var(--primary)' : 'var(--border)'};
                               background:${t.key === 'supplier' ? 'var(--gold-soft)' : 'var(--surface-2)'};
                               cursor:pointer;font-weight:800;font-size:11.5px;
                               transition:all .2s">
                  <i data-lucide="${t.icon}"
                     style="width:18px;height:18px;
                            color:${t.key === 'supplier' ? 'var(--primary)' : 'var(--text-2)'}"></i>
                  <span style="color:${t.key === 'supplier' ? 'var(--primary)' : 'var(--text-2)'}">
                    ${t.label}
                  </span>
                </button>
              `).join('')}
            </div>
          </div>

          <!-- الجهة المحددة -->
          <div class="field" style="margin-bottom:16px">
            <label>الجهة <span class="req">*</span></label>
            <select id="set-entity">
              <option value="">— اختر جهة —</option>
              ${suppliers.map(s => `
                <option value="${s.id}" data-type="supplier"
                        data-name="${esc(s.name)}">
                  ${esc(s.name)} (مورد)
                </option>
              `).join('')}
              ${workshops.map(w => `
                <option value="workshop-${esc(w)}" data-type="workshop"
                        data-name="${esc(w)}">
                  ${esc(w)} (ورشة)
                </option>
              `).join('')}
            </select>
          </div>

          <!-- نوع التسوية -->
          <div style="margin-bottom:16px">
            <div style="font-size:11px;font-weight:800;color:var(--muted);
                        text-transform:uppercase;letter-spacing:.4px;
                        margin-bottom:9px">
              نوع التسوية
            </div>
            <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px">
              <button type="button" data-settle="gold"
                      class="settlement-type-btn active"
                      style="padding:12px;border-radius:11px;
                             border:1.5px solid var(--primary);
                             background:var(--gold-soft);cursor:pointer;
                             font-weight:800;font-size:12px;
                             color:var(--primary);display:flex;
                             align-items:center;justify-content:center;gap:8px">
                <i data-lucide="gem" style="width:16px;height:16px"></i>
                تسوية ذهب
              </button>
              <button type="button" data-settle="cash"
                      class="settlement-type-btn"
                      style="padding:12px;border-radius:11px;
                             border:1.5px solid var(--border);
                             background:var(--surface-2);cursor:pointer;
                             font-weight:800;font-size:12px;
                             color:var(--text-2);display:flex;
                             align-items:center;justify-content:center;gap:8px">
                <i data-lucide="banknote" style="width:16px;height:16px"></i>
                تسوية نقدية
              </button>
            </div>
          </div>

          <!-- ✅ v3: حقول الذهب مع karat-grid -->
          <div id="set-gold-fields">
            <!-- Karat Selection Grid -->
            <div style="margin-bottom:14px">
              <div style="font-size:11px;font-weight:800;color:var(--muted);
                          text-transform:uppercase;letter-spacing:.4px;
                          margin-bottom:9px;display:flex;align-items:center;gap:8px">
                <i data-lucide="gem" style="width:12px;height:12px"></i>
                العيار
                <span class="chip" style="font-size:9.5px;margin-inline-start:auto">
                  يدعم القياسي والمخصص
                </span>
              </div>

              <div class="karat-grid" id="set-karat-grid">
                ${GMS.KARAT_ORDER.map(k => `
                  <button type="button"
                          class="karat-btn ${k === 21 ? 'active' : ''}"
                          data-set-karat-std="${k}">
                    <div class="kb-num">${k}K</div>
                    <div class="kb-ratio">${GMS.karatRatio(k).toFixed(4)}</div>
                  </button>
                `).join('')}
                <button type="button"
                        class="karat-btn custom-karat-btn"
                        data-set-karat-custom="1">
                  <div class="kb-num">
                    <i data-lucide="sliders-horizontal"
                       style="width:20px;height:20px"></i>
                  </div>
                  <div class="kb-ratio">مخصص</div>
                </button>
              </div>

              <!-- Hidden input للعيار القياسي -->
              <input type="hidden" id="set-karat" value="21">
            </div>

            <!-- ✅ v3: لوحة العيار المخصص -->
            <div id="set-custom-karat-panel"
                 style="margin-bottom:12px;padding:14px 16px;
                        background:var(--warn-bg);
                        border-radius:12px;
                        border:1.5px solid color-mix(in srgb,var(--warn) 35%,var(--border));
                        display:none">
              <div style="font-size:11px;font-weight:800;color:var(--warn);
                          text-transform:uppercase;letter-spacing:.5px;
                          margin-bottom:10px;display:flex;align-items:center;gap:6px">
                <i data-lucide="sliders-horizontal" style="width:12px;height:12px"></i>
                عيار مخصص
              </div>

              <div class="grid-form" style="gap:12px">
                <div class="field">
                  <label>العيار (لكل 1000)</label>
                  <input type="number" id="set-custom-karat"
                         step="1" min="300" max="999"
                         value="888" class="mono"
                         style="font-weight:900;text-align:center;font-size:15px">
                  <span class="hint">300 - 999 (سبائك: 888, 900, 916, 995, 999)</span>
                </div>
                <div class="field">
                  <label>نسبة النقاء</label>
                  <input type="number" id="set-custom-purity"
                         step="0.0001" min="0.3000" max="1.0000"
                         value="0.8880" class="mono"
                         style="font-weight:900;text-align:center;font-size:15px">
                  <span class="hint">0.3000 - 1.0000</span>
                </div>
              </div>

              <!-- Presets -->
              <div style="margin-top:10px;display:flex;gap:5px;flex-wrap:wrap">
                <button type="button" class="btn btn-sm" data-set-custom-preset="999.9">999.9</button>
                <button type="button" class="btn btn-sm" data-set-custom-preset="999">999</button>
                <button type="button" class="btn btn-sm" data-set-custom-preset="995">995</button>
                <button type="button" class="btn btn-sm" data-set-custom-preset="916">916</button>
                <button type="button" class="btn btn-sm" data-set-custom-preset="900">900</button>
                <button type="button" class="btn btn-sm" data-set-custom-preset="888">888</button>
              </div>
            </div>

            <!-- الأوزان -->
            <div class="grid-form three">
              <div class="field">
                <label>الوزن القائم (جم) <span class="req">*</span></label>
                <input type="number" id="set-gross"
                       step="0.001" min="0" placeholder="0.000"
                       class="mono" style="font-weight:800;text-align:center">
              </div>
              <div class="field">
                <label>وزن الأحجار (جم)</label>
                <input type="number" id="set-stones"
                       step="0.001" min="0" value="0"
                       class="mono" style="font-weight:800;text-align:center">
              </div>
              <div class="field">
                <label>الوزن الصافي</label>
                <input id="set-net" readonly class="mono"
                       style="font-weight:800;text-align:center;
                              background:var(--surface-3)">
              </div>
            </div>

            <div class="grid-form" style="margin-top:12px;gap:12px">
              <div class="field">
                <label>البندق 24K</label>
                <input id="set-pure" readonly class="mono"
                       style="font-weight:800;text-align:center;
                              color:var(--primary);background:var(--surface-3)">
              </div>
              <div class="field">
                <label>القيمة التقديرية</label>
                <input id="set-value" readonly class="mono"
                       style="font-weight:800;text-align:center;
                              background:var(--surface-3)">
              </div>
            </div>

            <div style="margin-top:12px">
              <div style="font-size:11px;font-weight:800;color:var(--muted);
                          text-transform:uppercase;letter-spacing:.4px;
                          margin-bottom:9px">
                اتجاه التسوية
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                <label style="display:flex;align-items:center;gap:8px;
                              padding:11px 14px;border-radius:10px;
                              border:1.5px solid var(--success-border);
                              background:var(--success-bg);cursor:pointer;
                              font-weight:700;font-size:12px">
                  <input type="radio" name="set-direction" value="in"
                         checked style="accent-color:var(--success)">
                  <i data-lucide="arrow-down-circle"
                     style="width:15px;height:15px;color:var(--success)"></i>
                  <span style="color:var(--success)">استلام (يدخل للخزنة)</span>
                </label>
                <label style="display:flex;align-items:center;gap:8px;
                              padding:11px 14px;border-radius:10px;
                              border:1.5px solid var(--danger-border);
                              background:var(--danger-bg);cursor:pointer;
                              font-weight:700;font-size:12px">
                  <input type="radio" name="set-direction" value="out"
                         style="accent-color:var(--danger)">
                  <i data-lucide="arrow-up-circle"
                     style="width:15px;height:15px;color:var(--danger)"></i>
                  <span style="color:var(--danger)">تسليم (يخرج من الخزنة)</span>
                </label>
              </div>
            </div>
          </div>

          <!-- حقول النقد -->
          <div id="set-cash-fields" style="display:none">
            <div class="field">
              <label>المبلغ (ج.م) <span class="req">*</span></label>
              <input type="number" id="set-cash-amount"
                     step="0.01" min="0" placeholder="0.00"
                     class="mono big">
            </div>

            <div style="margin-top:12px">
              <div style="font-size:11px;font-weight:800;color:var(--muted);
                          text-transform:uppercase;letter-spacing:.4px;
                          margin-bottom:9px">
                اتجاه التسوية
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                <label style="display:flex;align-items:center;gap:8px;
                              padding:11px 14px;border-radius:10px;
                              border:1.5px solid var(--success-border);
                              background:var(--success-bg);cursor:pointer;
                              font-weight:700;font-size:12px">
                  <input type="radio" name="set-cash-direction" value="in"
                         checked style="accent-color:var(--success)">
                  <i data-lucide="arrow-down-circle"
                     style="width:15px;height:15px;color:var(--success)"></i>
                  <span style="color:var(--success)">استلام نقدي</span>
                </label>
                <label style="display:flex;align-items:center;gap:8px;
                              padding:11px 14px;border-radius:10px;
                              border:1.5px solid var(--danger-border);
                              background:var(--danger-bg);cursor:pointer;
                              font-weight:700;font-size:12px">
                  <input type="radio" name="set-cash-direction" value="out"
                         style="accent-color:var(--danger)">
                  <i data-lucide="arrow-up-circle"
                     style="width:15px;height:15px;color:var(--danger)"></i>
                  <span style="color:var(--danger)">سداد نقدي</span>
                </label>
              </div>
            </div>
          </div>

          <!-- التفاصيل -->
          <div class="field" style="margin-top:16px">
            <label>البيان / الوصف</label>
            <input id="set-description" placeholder="وصف التسوية…">
          </div>

          <div class="field" style="margin-top:12px">
            <label>رقم المرجع</label>
            <input id="set-reference" placeholder="اختياري" class="mono">
          </div>

          <!-- المعاينة -->
          <div id="set-preview"
               style="margin-top:16px;padding:14px;
                      background:var(--info-bg);border-radius:11px;
                      border:1px solid color-mix(in srgb,var(--info) 30%,var(--border))">
            <div style="font-size:11px;font-weight:800;color:var(--info);
                        text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">
              معاينة التسوية
            </div>
            <div style="font-family:var(--font-mono);font-size:12.5px;
                        font-weight:700;color:var(--text-2);line-height:1.9">
              — أدخل البيانات لعرض المعاينة —
            </div>
          </div>
        `,
        footer: `
          <button class="btn" data-close>إلغاء</button>
          <button class="btn btn-primary btn-lg" id="set-save" type="button">
            <i data-lucide="save"></i>
            حفظ التسوية
          </button>
        `,
        onMount: (el, close) => {
          const $ = (id) => el.querySelector('#' + id);

          const state = {
            entityType: 'supplier',
            settlementType: 'gold',

            /* ✅ v3: حالة العيار */
            karatMode: 'standard',
            standardKarat: 21,
            customKarat: 888,
            customPurity: 0.8880,
          };

          /* نوع الجهة */
          el.querySelectorAll('[data-entity-type]').forEach(btn => {
            btn.onclick = () => {
              state.entityType = btn.dataset.entityType;
              el.querySelectorAll('[data-entity-type]').forEach(b => {
                const active = b === btn;
                b.style.borderColor = active ? 'var(--primary)' : 'var(--border)';
                b.style.background = active ? 'var(--gold-soft)' : 'var(--surface-2)';
                const icon = b.querySelector('svg');
                const span = b.querySelector('span');
                if (icon) icon.style.color = active ? 'var(--primary)' : 'var(--text-2)';
                if (span) span.style.color = active ? 'var(--primary)' : 'var(--text-2)';
              });
            };
          });

          /* نوع التسوية */
          el.querySelectorAll('[data-settle]').forEach(btn => {
            btn.onclick = () => {
              state.settlementType = btn.dataset.settle;
              el.querySelectorAll('[data-settle]').forEach(b => {
                const active = b === btn;
                b.style.borderColor = active ? 'var(--primary)' : 'var(--border)';
                b.style.background = active ? 'var(--gold-soft)' : 'var(--surface-2)';
                b.style.color = active ? 'var(--primary)' : 'var(--text-2)';
              });

              const goldFields = $('set-gold-fields');
              const cashFields = $('set-cash-fields');

              if (state.settlementType === 'gold') {
                if (goldFields) goldFields.style.display = '';
                if (cashFields) cashFields.style.display = 'none';
              } else {
                if (goldFields) goldFields.style.display = 'none';
                if (cashFields) cashFields.style.display = '';
              }

              updatePreview();
            };
          });

          /* ✅ v3: دوال مساعدة لقراءة العيار الحالي */
          const getCurrentKarat = () => {
            if (state.karatMode === 'custom') {
              return {
                karat: null,
                custom_karat: state.customKarat,
                purity_ratio: state.customPurity,
                is_custom: true,
              };
            }
            return {
              karat: state.standardKarat,
              custom_karat: null,
              purity_ratio: GMS.karatRatio(state.standardKarat),
              is_custom: false,
            };
          };

          /* ✅ v3: Standard Karat buttons */
          el.querySelectorAll('[data-set-karat-std]').forEach(btn => {
            btn.onclick = () => {
              state.karatMode = 'standard';
              state.standardKarat = Number(btn.dataset.setKaratStd);

              el.querySelectorAll('[data-set-karat-std]').forEach(b => {
                b.classList.toggle('active', b === btn);
              });
              const customBtn = el.querySelector('[data-set-karat-custom]');
              if (customBtn) customBtn.classList.remove('active');

              const panel = $('set-custom-karat-panel');
              if (panel) panel.style.display = 'none';

              const karatInput = $('set-karat');
              if (karatInput) karatInput.value = state.standardKarat;

              recalcGold();
            };
          });

          /* ✅ v3: Custom Karat button */
          const customBtn = el.querySelector('[data-set-karat-custom]');
          if (customBtn) {
            customBtn.onclick = () => {
              state.karatMode = 'custom';

              el.querySelectorAll('[data-set-karat-std]').forEach(b => {
                b.classList.remove('active');
              });
              customBtn.classList.add('active');

              const panel = $('set-custom-karat-panel');
              if (panel) panel.style.display = '';

              setTimeout(() => {
                const input = $('set-custom-karat');
                if (input) {
                  try { input.focus({ preventScroll: true }); } catch (_) { input.focus(); }
                }
              }, 100);

              recalcGold();
            };
          }

          /* ✅ v3: Custom karat inputs */
          const customKaratInput = $('set-custom-karat');
          if (customKaratInput) {
            customKaratInput.oninput = () => {
              let v = parseInt(customKaratInput.value) || 888;
              v = Math.max(GMS.KARAT_LIMITS.min, Math.min(GMS.KARAT_LIMITS.max, v));
              state.customKarat = v;
              state.customPurity = GMS.round(v / 1000, 4);

              const purityInput = $('set-custom-purity');
              if (purityInput) purityInput.value = state.customPurity.toFixed(4);

              recalcGold();
            };
            customKaratInput.onblur = () => {
              customKaratInput.value = state.customKarat;
            };
          }

          const customPurityInput = $('set-custom-purity');
          if (customPurityInput) {
            customPurityInput.oninput = () => {
              let v = parseFloat(customPurityInput.value) || 0.8880;
              v = Math.max(GMS.KARAT_LIMITS.minPurity,
                           Math.min(GMS.KARAT_LIMITS.maxPurity, v));
              state.customPurity = GMS.round(v, 4);
              state.customKarat = Math.round(state.customPurity * 1000);

              const karatInput = $('set-custom-karat');
              if (karatInput) karatInput.value = state.customKarat;

              recalcGold();
            };
            customPurityInput.onblur = () => {
              customPurityInput.value = state.customPurity.toFixed(4);
            };
          }

          /* ✅ v3: Custom karat presets */
          el.querySelectorAll('[data-set-custom-preset]').forEach(btn => {
            btn.onclick = () => {
              const presetVal = parseFloat(btn.dataset.setCustomPreset) || 888;

              if (presetVal >= 300) {
                state.customKarat = Math.round(presetVal);
                state.customPurity = GMS.round(state.customKarat / 1000, 4);
              } else {
                state.customPurity = GMS.round(presetVal, 4);
                state.customKarat = Math.round(state.customPurity * 1000);
              }

              const karatInput = $('set-custom-karat');
              if (karatInput) karatInput.value = state.customKarat;

              const purityInput = $('set-custom-purity');
              if (purityInput) purityInput.value = state.customPurity.toFixed(4);

              recalcGold();
            };
          });

          /* حساب الذهب — ✅ v3 مع purity */
          const recalcGold = () => {
            const karatInfo = getCurrentKarat();
            const gross = parseFloat($('set-gross')?.value) || 0;
            const stones = parseFloat($('set-stones')?.value) || 0;

            const net = Math.max(0, gross - stones);
            const pure = net * karatInfo.purity_ratio;
            const price24 = getPrice24();
            const value = pure * price24;

            if ($('set-net')) $('set-net').value = net.toFixed(3);
            if ($('set-pure')) $('set-pure').value = pure.toFixed(3);
            if ($('set-value')) $('set-value').value = moneyFmt(value) + ' ج.م';

            updatePreview();
          };

          ['set-gross', 'set-stones'].forEach(id => {
            const f = $(id);
            if (f) {
              f.addEventListener('input', recalcGold);
              f.addEventListener('change', recalcGold);
            }
          });

          const cashInput = $('set-cash-amount');
          if (cashInput) cashInput.addEventListener('input', updatePreview);

          /* ✅ v3: تحديث المعاينة مع العيار المخصص */
          function updatePreview() {
            const preview = $('set-preview');
            if (!preview) return;

            const entitySelect = $('set-entity');
            const entityName = entitySelect?.selectedOptions?.[0]?.dataset?.name || '—';

            if (state.settlementType === 'gold') {
              const karatInfo = getCurrentKarat();
              const direction = el.querySelector('input[name="set-direction"]:checked')?.value || 'in';
              const net = parseFloat($('set-net')?.value) || 0;
              const pure = parseFloat($('set-pure')?.value) || 0;
              const value = parseFloat(($('set-value')?.value || '').replace(/[^\d.-]/g, '')) || 0;

              const dirLabel = direction === 'in' ? 'استلام (يدخل للخزنة)' : 'تسليم (يخرج من الخزنة)';
              const dirColor = direction === 'in' ? 'var(--success)' : 'var(--danger)';

              /* ✅ v3: عرض العيار بطريقة مناسبة */
              const karatDisplay = karatInfo.is_custom
                ? `<span style="color:var(--warn);font-weight:900">
                     ${karatInfo.custom_karat} (مخصص)
                     · نقاء ${Number(karatInfo.purity_ratio).toFixed(4)}
                   </span>`
                : `<b>${karatInfo.karat}K</b>`;

              preview.innerHTML = `
                <div style="font-size:11px;font-weight:800;color:var(--info);
                            text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">
                  معاينة التسوية — ذهب
                </div>
                <div style="font-family:var(--font-mono);font-size:12.5px;
                            font-weight:700;color:var(--text-2);line-height:1.9">
                  <div>الجهة: <b>${esc(entityName)}</b></div>
                  <div>الاتجاه: <b style="color:${dirColor}">${dirLabel}</b></div>
                  <div>العيار: ${karatDisplay}</div>
                  <div>الوزن الصافي: <b>${gramFmt(net)}</b> جم</div>
                  <div>البندق: <b style="color:var(--primary)">${gramFmt(pure)}</b> جم</div>
                  <div>القيمة التقديرية: <b>${moneyFmt(value)}</b> ج.م</div>
                </div>
              `;
            } else {
              const amount = parseFloat($('set-cash-amount')?.value) || 0;
              const direction = el.querySelector('input[name="set-cash-direction"]:checked')?.value || 'in';
              const dirLabel = direction === 'in' ? 'استلام نقدي' : 'سداد نقدي';
              const dirColor = direction === 'in' ? 'var(--success)' : 'var(--danger)';

              preview.innerHTML = `
                <div style="font-size:11px;font-weight:800;color:var(--info);
                            text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">
                  معاينة التسوية — نقدي
                </div>
                <div style="font-family:var(--font-mono);font-size:12.5px;
                            font-weight:700;color:var(--text-2);line-height:1.9">
                  <div>الجهة: <b>${esc(entityName)}</b></div>
                  <div>الاتجاه: <b style="color:${dirColor}">${dirLabel}</b></div>
                  <div>المبلغ: <b>${moneyFmt(amount)}</b> ج.م</div>
                </div>
              `;
            }
          }

          el.querySelectorAll('input[name="set-direction"]').forEach(r => {
            r.addEventListener('change', updatePreview);
          });
          el.querySelectorAll('input[name="set-cash-direction"]').forEach(r => {
            r.addEventListener('change', updatePreview);
          });

          const entitySelect = $('set-entity');
          if (entitySelect) entitySelect.addEventListener('change', updatePreview);

          /* حفظ */
          const saveBtn = $('set-save');
          if (saveBtn) {
            saveBtn.onclick = () => saveSettlement(el, close, state, getCurrentKarat);
          }

          setTimeout(() => {
            const grossInput = $('set-gross');
            if (grossInput) {
              try { grossInput.focus({ preventScroll: true }); } catch (_) { grossInput.focus(); }
            }
          }, 250);
        },
      });
    } catch (e) {
      console.error('[Accounting.openSettlementModal]', e);
      GMS.Toast.err('فشل فتح نافذة التسوية', e.message);
    }
  }

  async function saveSettlement(el, closeFn, state, getCurrentKarat) {
    try {
      const $ = (id) => el.querySelector('#' + id);

      const entitySelect = $('set-entity');
      if (!entitySelect || !entitySelect.value) {
        GMS.Beep?.error?.();
        return GMS.Toast.err('الجهة مطلوبة', 'اختر المورد أو الورشة');
      }

      const entityId = entitySelect.value;
      const entityType = entitySelect.selectedOptions?.[0]?.dataset?.type || state.entityType;
      const entityName = entitySelect.selectedOptions?.[0]?.dataset?.name || '—';
      const description = $('set-description')?.value.trim() || '';
      const reference = $('set-reference')?.value.trim() || '';
      const now = new Date().toISOString();

      let entry = null;

      if (state.settlementType === 'gold') {
        const karatInfo = getCurrentKarat();
        const gross = parseFloat($('set-gross')?.value) || 0;
        const stones = parseFloat($('set-stones')?.value) || 0;
        const direction = el.querySelector('input[name="set-direction"]:checked')?.value || 'in';

        if (gross <= 0) {
          GMS.Beep?.error?.();
          return GMS.Toast.err('الوزن مطلوب', 'أدخل الوزن القائم');
        }

        if (karatInfo.is_custom && !GMS.isValidPurity(karatInfo.purity_ratio)) {
          GMS.Beep?.error?.();
          return GMS.Toast.err(
            'نقاء غير صالح',
            `يجب أن يكون بين ${GMS.KARAT_LIMITS.minPurity} و ${GMS.KARAT_LIMITS.maxPurity}`
          );
        }

        const net = Math.max(0, gross - stones);
        const pure = net * karatInfo.purity_ratio;
        const price24 = getPrice24();
        const value = pure * price24;
        const sign = direction === 'in' ? +1 : -1;
        const entryNo = generateEntryNo();

        /* ✅ v3: بناء payload موحّد */
        const karatPayload = GMS.buildKaratPayload({
          karat: karatInfo.is_custom ? null : karatInfo.karat,
          customKarat: karatInfo.is_custom ? karatInfo.custom_karat : null,
          purityRatio: karatInfo.purity_ratio,
          isCustom: karatInfo.is_custom,
        });

        const karatLabel = karatInfo.is_custom
          ? `مخصص ${karatInfo.custom_karat}`
          : `${karatInfo.karat}K`;

        entry = {
          id: GMS.uid(),
          entry_no: entryNo,
          entry_date: now,
          created_at: now,
          entry_type: 'gold_settlement',
          type: 'gold_settlement',

          cash_delta: 0,
          gold_delta: sign * pure,

          /* ✅ v3: حقول العيار الجديدة */
          gold_karat: karatPayload.karat,
          custom_karat: karatPayload.custom_karat,
          is_custom_karat: karatPayload.is_custom_karat,
          purity_ratio: karatPayload.purity_ratio,

          gold_net_weight: sign * net,
          gold_pure_weight: sign * pure,
          gold_value_egp: sign * value,

          description: description ||
            `تسوية ذهب ${karatLabel} — ${entityName} (${direction === 'in' ? 'استلام' : 'تسليم'})`,
          reference_no: reference || entryNo,
          settlement_direction: direction,

          entity_type: entityType,
          entity_id: entityId,
          entity_name: entityName,

          branch_id: getActiveBranchId(),
          created_by: (GMS.Auth && GMS.Auth.profile && GMS.Auth.profile.full_name) || '—',
          created_by_id: (GMS.Auth && GMS.Auth.user && GMS.Auth.user.id) || null,
        };
      } else {
        const amount = parseFloat($('set-cash-amount')?.value) || 0;
        const direction = el.querySelector('input[name="set-cash-direction"]:checked')?.value || 'in';

        if (amount <= 0) {
          GMS.Beep?.error?.();
          return GMS.Toast.err('المبلغ مطلوب', 'أدخل مبلغ التسوية');
        }

        const sign = direction === 'in' ? +1 : -1;
        const entryNo = generateEntryNo();

        entry = {
          id: GMS.uid(),
          entry_no: entryNo,
          entry_date: now,
          created_at: now,
          entry_type: 'cash_settlement',
          type: 'cash_settlement',

          cash_delta: sign * amount,
          gold_delta: 0,
          gold_karat: null,
          custom_karat: null,
          is_custom_karat: false,
          gold_net_weight: null,
          gold_pure_weight: null,

          description: description || `تسوية نقدية — ${entityName} (${direction === 'in' ? 'استلام' : 'سداد'})`,
          reference_no: reference || entryNo,
          settlement_direction: direction,

          entity_type: entityType,
          entity_id: entityId,
          entity_name: entityName,

          branch_id: getActiveBranchId(),
          created_by: (GMS.Auth && GMS.Auth.profile && GMS.Auth.profile.full_name) || '—',
          created_by_id: (GMS.Auth && GMS.Auth.user && GMS.Auth.user.id) || null,
        };
      }

      const saveBtn = $('set-save');
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = `<i data-lucide="loader-circle"></i> جارٍ الحفظ…`;
        window.lucide?.createIcons();
      }

      const saved = await CacheDB.save(STORE_LEDGER, entry);
      if (!saved) throw new Error('فشل الحفظ المحلي');

      if (GMS.Supabase && GMS.Supabase.isReady && GMS.Supabase.isReady()) {
        try {
          await GMS.Supabase.get()
            .from(GMS.SUPABASE_CONFIG.TABLES.GENERAL_LEDGER)
            .insert({
              entry_no: entry.entry_no,
              entry_date: entry.entry_date,
              entry_type: entry.entry_type,
              cash_delta: entry.cash_delta,
              gold_delta: entry.gold_delta,
              gold_karat: entry.gold_karat,
              custom_karat: entry.custom_karat,
              is_custom_karat: entry.is_custom_karat,
              purity_ratio: entry.purity_ratio,
              gold_net_weight: entry.gold_net_weight,
              gold_pure_weight: entry.gold_pure_weight,
              description: entry.description,
              reference_no: entry.reference_no,
              entity_type: entry.entity_type,
              entity_id: entry.entity_id,
              entity_name: entry.entity_name,
              branch_id: entry.branch_id,
            });
        } catch (e) {
          console.warn('[Accounting.saveSettlement] Supabase failed:', e);
          if (GMS.IDB && GMS.IDB.queueAdd) {
            try {
              await GMS.IDB.queueAdd({
                id: 'set-' + entry.id,
                type: 'settlement_create',
                entry,
                created_at: now,
              });
            } catch (_) {}
          }
        }
      }

      if (GMS.Audit) {
        try {
          await GMS.Audit.log(
            'CREATE', 'settlement', entry.id,
            `تسوية ${state.settlementType === 'gold' ? 'ذهب' : 'نقد'} — ${entityName}`,
            {
              entry_no: entry.entry_no,
              cash_delta: entry.cash_delta,
              gold_delta: entry.gold_delta,
              is_custom_karat: entry.is_custom_karat,
              custom_karat: entry.custom_karat,
              entity_type: entityType,
            }
          );
        } catch (_) {}
      }

      if (GMS.Realtime) {
        try { GMS.Realtime.emit('general_ledger', 'INSERT', entry); } catch (_) {}
      }

      State.ledger.unshift(entry);
      computeKPIs();
      applyFilters();

      GMS.Beep?.success?.();

      /* ✅ v3: نص النجاح مع العيار */
      const successDesc = state.settlementType === 'gold'
        ? (entry.is_custom_karat
            ? `${entityName} · مخصص ${entry.custom_karat}`
            : `${entityName} · ${entry.gold_karat}K`)
        : `${entityName} · ${moneyFmt(Math.abs(entry.cash_delta))} ج.م`;

      GMS.Toast.ok('تم حفظ التسوية', successDesc);

      if (typeof closeFn === 'function') closeFn();
      window.App.navigateTo('accounting');

    } catch (e) {
      console.error('[Accounting.saveSettlement]', e);
      GMS.Beep?.error?.();
      GMS.Toast.err('فشل حفظ التسوية', e.message);

      const saveBtn = el.querySelector('#set-save');
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = `<i data-lucide="save"></i> إعادة المحاولة`;
        window.lucide?.createIcons();
      }
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §15 · ENTRY DETAILS MODAL — ✅ v3 مع العيار المخصص
     ═════════════════════════════════════════════════════════════════════ */

  function openEntryDetails(entryId) {
    try {
      const entry = State.ledger.find(e => e.id === entryId);
      if (!entry) {
        return GMS.Toast.warn('لم يتم العثور على الحركة');
      }

      const type = getEntryType(entry.entry_type || entry.type);
      const cashDelta = Number(entry.cash_delta || 0);
      const goldDelta = Number(entry.gold_delta || 0);
      const karatInfo = getEntryKaratInfo(entry);

      GMS.Modal.open({
        title: `تفاصيل الحركة — ${entry.entry_no || entry.id}`,
        icon: 'book-open',
        size: 'lg',
        body: `
          <div style="display:flex;align-items:center;gap:12px;
                      padding:14px 16px;background:var(--surface-2);
                      border-radius:12px;margin-bottom:16px">
            <div style="width:44px;height:44px;border-radius:12px;
                        display:grid;place-items:center;flex-shrink:0;
                        background:var(--${type.color}-bg);
                        color:var(--${type.color})">
              <i data-lucide="${type.icon}" style="width:20px;height:20px"></i>
            </div>
            <div style="flex:1">
              <div style="font-weight:900;font-size:15px">${esc(type.label)}</div>
              <div style="font-size:11.5px;color:var(--muted);
                          font-weight:700;margin-top:3px">
                ${dateTimeAr(entry.entry_date || entry.created_at)}
                · ${timeAgo(entry.entry_date || entry.created_at)}
              </div>
            </div>
            <div class="mono" style="font-size:12px;font-weight:900;
                        color:var(--primary)">
              ${esc(entry.entry_no || '—')}
            </div>
          </div>

          <div class="calc-list" style="margin-bottom:16px">
            <div class="cl-row">
              <span class="k"><i data-lucide="file-text"></i> البيان</span>
              <span class="v" style="font-family:var(--font-ui);font-size:12.5px;
                          direction:rtl;text-align:end;max-width:60%">
                ${esc(entry.description || '—')}
              </span>
            </div>
            ${entry.entity_name ? `
              <div class="cl-row">
                <span class="k"><i data-lucide="user"></i> الجهة</span>
                <span class="v" style="font-size:12.5px">${esc(entry.entity_name)}</span>
              </div>
            ` : ''}
            ${entry.reference_no ? `
              <div class="cl-row">
                <span class="k"><i data-lucide="hash"></i> المرجع</span>
                <span class="v mono" style="font-size:11.5px">${esc(entry.reference_no)}</span>
              </div>
            ` : ''}
            ${entry.branch_name ? `
              <div class="cl-row">
                <span class="k"><i data-lucide="building-2"></i> الفرع</span>
                <span class="v" style="font-size:12.5px">${esc(entry.branch_name)}</span>
              </div>
            ` : ''}
            ${entry.created_by ? `
              <div class="cl-row">
                <span class="k"><i data-lucide="user-check"></i> المستخدم</span>
                <span class="v" style="font-size:12.5px">${esc(entry.created_by)}</span>
              </div>
            ` : ''}
          </div>

          ${cashDelta !== 0 ? `
            <div style="padding:14px 16px;border-radius:11px;
                        background:${cashDelta > 0 ? 'var(--success-bg)' : 'var(--danger-bg)'};
                        margin-bottom:12px;
                        border:1px solid ${cashDelta > 0 ? 'var(--success-border)' : 'var(--danger-border)'}">
              <div style="font-size:11px;font-weight:800;
                          color:${cashDelta > 0 ? 'var(--success)' : 'var(--danger)'};
                          text-transform:uppercase;letter-spacing:.4px;
                          margin-bottom:6px">
                <i data-lucide="wallet" style="width:12px;height:12px;
                   display:inline;vertical-align:-2px"></i>
                الحركة النقدية
              </div>
              <div class="mono" style="font-size:22px;font-weight:900;
                          color:${cashDelta > 0 ? 'var(--success)' : 'var(--danger)'};
                          letter-spacing:-.5px">
                ${cashDelta > 0 ? '+' : '−'}${moneyFmt(Math.abs(cashDelta))} ج.م
              </div>
            </div>
          ` : ''}

          ${goldDelta !== 0 ? `
            <div style="padding:14px 16px;border-radius:11px;
                        background:var(--gold-soft);
                        margin-bottom:12px;
                        border:1px solid color-mix(in srgb,var(--primary) 35%,var(--border))">
              <div style="font-size:11px;font-weight:800;
                          color:var(--warn);text-transform:uppercase;
                          letter-spacing:.4px;margin-bottom:6px">
                <i data-lucide="gem" style="width:12px;height:12px;
                   display:inline;vertical-align:-2px"></i>
                حركة الذهب
              </div>
              <div class="mono" style="font-size:22px;font-weight:900;
                          color:var(--primary);letter-spacing:-.5px">
                ${goldDelta > 0 ? '+' : '−'}${gramFmt(Math.abs(goldDelta))} جم بندق
              </div>

              <!-- ✅ v3: عرض العيار (قياسي أو مخصص) -->
              <div style="font-size:12px;color:var(--text-2);
                          margin-top:6px;font-weight:700">
                ${karatInfo.is_custom ? `
                  العيار:
                  <span style="color:var(--warn);font-weight:900">
                    ${karatInfo.custom_karat} (مخصص)
                  </span>
                  · النقاء:
                  <span class="mono" style="color:var(--warn);font-weight:900">
                    ${Number(karatInfo.purity_ratio).toFixed(4)}
                  </span>
                ` : `
                  العيار: <b>${karatInfo.karat}K</b>
                `}
                ${entry.gold_net_weight ? ` · الصافي: <b>${gramFmt(entry.gold_net_weight)}</b> جم` : ''}
              </div>
            </div>
          ` : ''}
        `,
        footer: `<button class="btn" data-close>إغلاق</button>`,
      });
    } catch (e) {
      console.error('[Accounting.openEntryDetails]', e);
      GMS.Toast.err('فشل عرض التفاصيل', e.message);
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §16 · EXPORT TO EXCEL — ✅ v3 مع عمود العيار المخصص
     ═════════════════════════════════════════════════════════════════════ */

  function exportLedger() {
    try {
      if (!window.XLSX) {
        return GMS.Toast.err('محرك Excel غير متاح');
      }

      const rows = State.filtered.length ? State.filtered : State.ledger;
      if (!rows.length) {
        return GMS.Toast.warn('لا توجد بيانات للتصدير');
      }

      const data = rows.map(e => {
        const type = getEntryType(e.entry_type || e.type);
        const karatInfo = getEntryKaratInfo(e);

        return {
          'رقم الحركة': e.entry_no || e.id,
          'التاريخ': dateAr(e.entry_date || e.created_at),
          'النوع': type.label,
          'البيان': e.description || '',
          'الجهة': e.entity_name || '',
          'المبلغ النقدي (ج.م)': Number(e.cash_delta || 0),
          'الوزن الصافي (جم)': Number(e.gold_net_weight || 0),
          'البندق 24K (جم)': Number(e.gold_pure_weight || e.gold_delta || 0),
          /* ✅ v3: عمود العيار */
          'العيار': karatInfo.is_custom
            ? `${karatInfo.custom_karat} (مخصص)`
            : (karatInfo.karat ? `${karatInfo.karat}K` : ''),
          'النقاء': karatInfo.is_custom
            ? Number(karatInfo.purity_ratio).toFixed(4)
            : '',
          'المرجع': e.reference_no || '',
          'الفرع': e.branch_name || '',
          'المستخدم': e.created_by || '',
        };
      });

      const ws = XLSX.utils.json_to_sheet(data);
      ws['!cols'] = [
        { wch: 20 }, { wch: 14 }, { wch: 16 }, { wch: 40 },
        { wch: 22 }, { wch: 16 }, { wch: 16 }, { wch: 16 },
        { wch: 16 }, { wch: 10 }, { wch: 18 }, { wch: 20 }, { wch: 18 },
      ];

      /* ورقة الملخص */
      const k = State.kpis;
      const summary = [
        ['ملخص الدفتر المحاسبي'],
        ['تاريخ التصدير', new Date().toLocaleString('ar-EG')],
        [''],
        ['المؤشر', 'القيمة'],
        ['الرصيد النقدي (ج.م)', k.cashBalance],
        ['إجمالي المبيعات (ج.م)', k.cashRevenue],
        ['إجمالي المصروفات (ج.م)', k.cashExpenses],
        ['إجمالي المشتريات (ج.م)', k.cashPurchases],
        ['إجمالي التسويات النقدية (ج.م)', k.cashSettlements],
        [''],
        ['ذهب عيار 24 (جم)', k.gold24Balance],
        ['ذهب عيار 21 (جم)', k.gold21Balance],
        ['ذهب عيار 18 (جم)', k.gold18Balance],
        ['ذهب عيار مخصص (جم)', k.goldCustomBalance],
        ['عدد حركات المخصص', k.customKaratCount],
        [''],
        ['إجمالي البندق 24K (جم)', k.totalPure],
        ['إجمالي الوزن الصافي (جم)', k.totalNet],
        [''],
        ['عدد الحركات', k.totalEntries],
      ];

      const wsSummary = XLSX.utils.aoa_to_sheet(summary);
      wsSummary['!cols'] = [{ wch: 34 }, { wch: 20 }];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'دفتر اليومية');
      XLSX.utils.book_append_sheet(wb, wsSummary, 'الملخص');

      const filename = `accounting_ledger_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(wb, filename);

      GMS.Toast.ok(`تم تصدير ${rows.length} حركة`);

      if (GMS.Audit) {
        try {
          GMS.Audit.log('EXPORT', 'accounting', null,
            `تصدير دفتر اليومية — ${rows.length} حركة`,
            { count: rows.length });
        } catch (_) {}
      }

    } catch (e) {
      console.error('[Accounting.exportLedger]', e);
      GMS.Toast.err('فشل التصدير', e.message);
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §17 · afterRender + initEvents
     ═════════════════════════════════════════════════════════════════════ */

  function afterRender() {
    try {
      window.lucide?.createIcons();
    } catch (e) {
      console.warn('[Accounting.afterRender]', e);
    }
  }

  function initEvents() {
    try {
      /* البحث */
      const searchInput = document.getElementById('acc-search-input');
      if (searchInput) {
        searchInput.oninput = (e) => {
          clearTimeout(State.timers.search);
          State.timers.search = setTimeout(() => {
            State.filters.search = e.target.value.trim();
            State.page = 1;
            applyFilters();
            refreshTable();
          }, 250);
        };
      }

      /* فلتر النوع */
      const typeFilter = document.getElementById('acc-filter-type');
      if (typeFilter) {
        typeFilter.onchange = () => {
          State.filters.type = typeFilter.value;
          State.page = 1;
          applyFilters();
          refreshTable();
        };
      }

      /* فلتر التاريخ */
      const fromFilter = document.getElementById('acc-filter-from');
      if (fromFilter) {
        fromFilter.onchange = () => {
          State.filters.dateFrom = fromFilter.value;
          State.page = 1;
          applyFilters();
          refreshTable();
        };
      }

      const toFilter = document.getElementById('acc-filter-to');
      if (toFilter) {
        toFilter.onchange = () => {
          State.filters.dateTo = toFilter.value;
          State.page = 1;
          applyFilters();
          refreshTable();
        };
      }

      /* حجم الصفحة */
      const pageSize = document.getElementById('acc-page-size');
      if (pageSize) {
        pageSize.onchange = () => {
          State.pageSize = Number(pageSize.value);
          State.page = 1;
          applyFilters();
          refreshTable();
        };
      }

      bindPaginationEvents();
      bindRowEvents();

      /* الأزرار العلوية */
      const expenseBtn = document.getElementById('acc-new-expense');
      if (expenseBtn) expenseBtn.onclick = openExpenseModal;

      const settlementBtn = document.getElementById('acc-new-settlement');
      if (settlementBtn) settlementBtn.onclick = openSettlementModal;

      const exportBtn = document.getElementById('acc-export-btn');
      if (exportBtn) exportBtn.onclick = exportLedger;

      const refreshBtn = document.getElementById('acc-refresh-btn');
      if (refreshBtn) {
        refreshBtn.onclick = async () => {
          refreshBtn.classList.add('spinning');
          refreshBtn.disabled = true;
          try {
            await loadLedger();
            await loadInventory();
            computeKPIs();
            applyFilters();
            await render(document.getElementById('page'));
            GMS.Toast.ok('تم التحديث');
          } catch (e) {
            GMS.Toast.err('فشل التحديث', e.message);
          } finally {
            refreshBtn.classList.remove('spinning');
            refreshBtn.disabled = false;
          }
        };
      }

      /* زر empty state */
      const emptyExpense = document.getElementById('acc-empty-expense');
      if (emptyExpense) emptyExpense.onclick = openExpenseModal;

      /* Realtime */
      bindRealtimeUpdates();

    } catch (e) {
      console.error('[Accounting.initEvents]', e);
    }
  }

  function bindPaginationEvents() {
    document.querySelectorAll('[data-acc-page]').forEach(btn => {
      btn.onclick = () => {
        const page = Number(btn.dataset.accPage);
        if (page < 1 || page > State.totalPages) return;

        State.page = page;
        refreshTable();

        document.getElementById('acc-table-host')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      };
    });
  }

  function bindRowEvents() {
    document.querySelectorAll('[data-view-acc-entry]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        openEntryDetails(btn.dataset.viewAccEntry);
      };
    });

    document.querySelectorAll('tr[data-entry-id]').forEach(tr => {
      tr.onclick = (e) => {
        if (e.target.closest('button')) return;
        openEntryDetails(tr.dataset.entryId);
      };
    });
  }

  function refreshTable() {
    const host = document.getElementById('acc-table-host');
    if (host) {
      host.innerHTML = renderLedgerTable();
      window.lucide?.createIcons();
      bindRowEvents();
    }

    const pagHost = document.getElementById('acc-pagination-host');
    if (pagHost) {
      pagHost.innerHTML = renderPagination();
      window.lucide?.createIcons();
      bindPaginationEvents();
    }
  }

  function bindRealtimeUpdates() {
    if (!GMS.Realtime) return;

    const unsub = GMS.Realtime.on('event', (event) => {
      try {
        if (GMS.Router?.currentId() !== 'accounting') return;
        if (!event) return;

        if (event.table === 'general_ledger' || event.table === 'entity_ledger') {
          if (event.action === 'INSERT' && event.row) {
            const exists = State.ledger.find(x => x.id === event.row.id);
            if (!exists) {
              State.ledger.unshift(event.row);
              computeKPIs();
              applyFilters();
              refreshTable();
            }
          }
        }
      } catch (e) {
        console.warn('[Accounting] Realtime handler failed:', e);
      }
    });

    State.unsubscribers.push(unsub);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §18 · CLEANUP
     ═════════════════════════════════════════════════════════════════════ */

  function cleanup() {
    try {
      cleanupListeners();
    } catch (e) {
      console.warn('[Accounting.cleanup]', e);
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §19 · VIEW REGISTRATION
     ═════════════════════════════════════════════════════════════════════ */
  GMS.Views = GMS.Views || {};

  GMS.Views.accounting = {
    render,
    cleanup,
    state: State,
    afterRender,
    initEvents,

    load: loadLedger,
    reload: async () => {
      await loadLedger();
      await loadInventory();
      computeKPIs();
      applyFilters();
      await render(document.getElementById('page'));
    },

    openExpenseModal,
    openSettlementModal,
    openEntryDetails,
    export: exportLedger,

    CacheDB,
  };

  /* ═════════════════════════════════════════════════════════════════════
     §20 · GLOBAL EXPORT
     ═════════════════════════════════════════════════════════════════════ */
  const AccountingView = {
    render,
    cleanup,
    afterRender,
    initEvents,
    state: State,

    load: loadLedger,
    reload: async () => {
      await loadLedger();
      await loadInventory();
      computeKPIs();
      applyFilters();
      await render(document.getElementById('page'));
    },

    openExpenseModal,
    openSettlementModal,
    openEntryDetails,
    exportLedger,

    CacheDB,

    ENTRY_TYPES,
    EXPENSE_CATEGORIES,
    ENTITY_TYPES,
  };

  window.AccountingView = AccountingView;

  /* ═════════════════════════════════════════════════════════════════════
     §21 · LOADED CONFIRMATION
     ═════════════════════════════════════════════════════════════════════ */
  console.log(
    '%c💰 Accounting View v3 loaded · Double-Entry Ledger + Custom Karat',
    'color:#0f7a43;font-weight:900;font-size:13px;padding:2px 6px;' +
    'background:linear-gradient(135deg,#a8dfc4,#0f7a43);border-radius:4px;'
  );

  console.log(
    `%c📊 KPIs (incl. custom karat) · Ledger · Expense · Settlement · Excel Export`,
    'color:#6b7a95;font-weight:700;font-size:11px;'
  );

  console.log(
    `%c🆕 v3: Custom Karat in Settlement · Purity Ratio · 6 presets (999.9, 995, 916, 888...)`,
    'color:#a55a00;font-weight:900;font-size:11px;'
  );

  /* ═════════════════════════════════════════════════════════════════════
     ✅ js/26-views-accounting.js — نهاية الملف
     ═════════════════════════════════════════════════════════════════════ */

})();
