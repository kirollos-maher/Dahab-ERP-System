/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ENTERPRISE — js/27-views-wholesale.js
   وحدة التوريد والمبيعات بالجملة والتحويلات بين الفروع
   ─────────────────────────────────────────────────────────────────────
   Supply Modes:
     • Wholesale B2B   — بيع للمحلات والورش بأسعار جملة
     • Inter-Branch    — تحويل مشغولات بين الفروع (Transfer Manifest)
     • Retail B2C      — البيع العادي (يُعالج من POS)

   المكونات:
     • شاشة إنشاء فاتورة توريد / جملة (Wholesale Invoice Builder)
     • شاشة إدارة حركة الفروع (Branch Transfers Management)
     • محرك ترحيل محاسبي مزدوج (دفتر اليومية + دفتر الموردين)
     • طباعة: إذن توريد / فاتورة جملة / Transfer Manifest
     • Excel Export
     • Realtime Integration

   التخزين (CacheDB):
     • wholesale_invoices
     • branch_transfers

   Export:
     • GMS.Views.wholesale
     • window.WholesaleView
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const GMS = window.GMS = window.GMS || {};

  /* ═════════════════════════════════════════════════════════════════════
     §1 · CONSTANTS
     ═════════════════════════════════════════════════════════════════════ */

  /* أنماط التوريد */
  const SUPPLY_MODES = Object.freeze({
    wholesale: {
      key: 'wholesale',
      label: 'بيع جملة (B2B)',
      icon: 'factory',
      color: 'violet',
      defaultDiscount: 15,   /* % خصم على المصنعية */
      description: 'بيع للمحلات والورش بأسعار جملة',
    },
    inter_branch: {
      key: 'inter_branch',
      label: 'تحويل بين الفروع',
      icon: 'arrow-right-left',
      color: 'info',
      defaultDiscount: 0,
      description: 'نقل مشغولات من المركز للفروع',
    },
    retail: {
      key: 'retail',
      label: 'بيع قطاعي',
      icon: 'user',
      color: 'success',
      defaultDiscount: 0,
      description: 'البيع المباشر للزبائن',
    },
  });

  /* حالات فاتورة الجملة */
  const INVOICE_STATUS = Object.freeze({
    DRAFT:     { key: 'DRAFT',     label: 'مسودة',       icon: 'file-edit',       cls: 'pill-gray',   color: 'muted'   },
    CONFIRMED: { key: 'CONFIRMED', label: 'مؤكدة',       icon: 'check-circle-2',  cls: 'pill-green',  color: 'success' },
    PARTIAL:   { key: 'PARTIAL',   label: 'مسددة جزئياً', icon: 'clock',          cls: 'pill-amber',  color: 'warn'    },
    PAID:      { key: 'PAID',      label: 'مسددة',       icon: 'badge-check',     cls: 'pill-blue',   color: 'info'    },
    CANCELLED: { key: 'CANCELLED', label: 'ملغاة',        icon: 'x-circle',       cls: 'pill-red',    color: 'danger'  },
  });

  /* حالات أمر التحويل */
  const TRANSFER_STATUS = Object.freeze({
    PENDING:    { key: 'PENDING',    label: 'قيد التحضير', icon: 'clock',        cls: 'pill-amber',  color: 'warn'    },
    IN_TRANSIT: { key: 'IN_TRANSIT', label: 'قيد النقل',   icon: 'truck',        cls: 'pill-blue',   color: 'info'    },
    DELIVERED:  { key: 'DELIVERED',  label: 'تم التسليم',  icon: 'package-check', cls: 'pill-violet', color: 'violet'  },
    RECEIVED:   { key: 'RECEIVED',   label: 'تم الاستلام', icon: 'check-circle-2', cls: 'pill-green', color: 'success' },
    CANCELLED:  { key: 'CANCELLED',  label: 'ملغى',        icon: 'x-circle',     cls: 'pill-red',    color: 'danger'  },
  });

  /* أنماط الدفع */
  const PAYMENT_MODES = Object.freeze({
    cash: {
      key: 'cash',
      label: 'دفع نقدي',
      icon: 'banknote',
      color: 'success',
      description: 'سداد كامل الفاتورة نقداً',
    },
    gold_exchange: {
      key: 'gold_exchange',
      label: 'مقايضة ذهب خام',
      icon: 'repeat',
      color: 'warn',
      description: 'تسليم ذهب كسر/صافي + فرق المصنعية نقداً',
    },
    credit: {
      key: 'credit',
      label: 'على الحساب',
      icon: 'clock',
      color: 'danger',
      description: 'قيد الفاتورة كمديونية جملة',
    },
    mixed: {
      key: 'mixed',
      label: 'دفع مختلط',
      icon: 'split',
      color: 'violet',
      description: 'جزء ذهب + جزء نقدي',
    },
  });

  /* أنواع الأطراف المستلمة */
  const RECIPIENT_TYPES = Object.freeze([
    { key: 'branch',   label: 'فرع تابع',  icon: 'building-2' },
    { key: 'shop',     label: 'محل خارجي', icon: 'store' },
    { key: 'workshop', label: 'ورشة',      icon: 'hammer' },
    { key: 'customer', label: 'عميل جملة', icon: 'user' },
  ]);

  /* المفاتيح */
  const STORE_INVOICES   = 'wholesale_invoices';
  const STORE_TRANSFERS  = 'branch_transfers';
  const MAX_ENTRIES      = 2000;

  /* ═════════════════════════════════════════════════════════════════════
     §2 · CacheDB — واجهة التخزين الموحّدة
     ═════════════════════════════════════════════════════════════════════ */
  const CacheDB = {
    _prefix: 'gms.wsl.',

    async getAll(store) {
      try {
        if (!store) return [];
        const key = this._prefix + store;

        /* 1 · LocalStorage */
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed;
          }
        } catch (_) {}

        /* 2 · IndexedDB fallback */
        if (GMS.IDB && GMS.IDB.isOpen) {
          try {
            const row = await GMS.IDB.metaGet(key);
            if (Array.isArray(row)) return row;
          } catch (_) {}
        }

        return [];
      } catch (e) {
        console.warn(`[WSL.CacheDB.getAll:${store}]`, e);
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

        const trimmed = existing.slice(0, MAX_ENTRIES);

        try {
          localStorage.setItem(key, JSON.stringify(trimmed));
        } catch (e) {
          console.warn('[WSL.CacheDB] Quota exceeded — trimming');
          try {
            localStorage.setItem(key, JSON.stringify(trimmed.slice(0, Math.floor(MAX_ENTRIES / 2))));
          } catch (_) {}
        }

        if (GMS.IDB && GMS.IDB.isOpen) {
          try {
            await GMS.IDB.metaSet(key, trimmed.slice(0, 500));
          } catch (_) {}
        }

        return true;
      } catch (e) {
        console.error(`[WSL.CacheDB.save:${store}]`, e);
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
        console.warn(`[WSL.CacheDB.delete:${store}]`, e);
        return false;
      }
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §3 · window.App — واجهة التوجيه
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
    activeTab: 'wholesale',   /* 'wholesale' | 'transfers' */

    invoices: [],
    transfers: [],

    inventory: [],

    /* Pagination — Invoices */
    invPage: 1,
    invPageSize: 25,

    /* Pagination — Transfers */
    trfPage: 1,
    trfPageSize: 25,

    /* Filters */
    filters: {
      invSearch: '',
      invStatus: '',
      invMode: '',
      trfSearch: '',
      trfStatus: '',
      trfDirection: '',    /* 'outgoing' | 'incoming' */
    },

    /* KPI */
    kpis: {
      totalInvoices: 0,
      totalWholesaleValue: 0,
      totalWholesalePure: 0,
      totalWholesaleCash: 0,
      outstandingCash: 0,
      outstandingGold: 0,

      totalTransfers: 0,
      transfersInTransit: 0,
      transfersPending: 0,
      transfersDelivered: 0,
    },

    /* Draft state للمودالات */
    draft: null,

    loading: false,
    initialized: false,
    unsubscribers: [],
    timers: { search: null },
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
    return GMS.round ? GMS.round(v, d)
      : Math.round((Number(v) + Number.EPSILON) * Math.pow(10, d)) / Math.pow(10, d);
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
  function numOr(v, fallback = 0) {
    const n = parseFloat(v);
    return isFinite(n) ? n : fallback;
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
  function getScrapBuyPrice() {
    let margin = 8;
    try {
      const saved = Number(localStorage.getItem(
        (GMS.LS_KEYS && GMS.LS_KEYS.BUY_MARGIN) || 'gms.buyback.margin'
      ));
      if (isFinite(saved) && saved >= 0 && saved < 30) margin = saved;
    } catch (_) {}
    return round(getPrice24() * (1 - margin / 100), 2);
  }
  function getBranches() {
    try { return GMS.Demo?.getBranches?.() || GMS.DEFAULT_BRANCHES || []; }
    catch (_) { return []; }
  }
  function getSuppliers() {
    try { return GMS.Demo?.getSuppliers?.() || []; } catch (_) { return []; }
  }
  function getCustomers() {
    try { return GMS.Demo?.getCustomers?.() || []; } catch (_) { return []; }
  }
  function getActiveBranchId() {
    return (GMS.Auth?.profile?.branch_id) ||
      (GMS.APP_CONFIG?.DEFAULT_BRANCH_ID) || 'br-1';
  }
  function getActiveUserName() {
    return GMS.Auth?.profile?.full_name || '—';
  }

  function getSupplyMode(key) {
    return SUPPLY_MODES[key] || SUPPLY_MODES.wholesale;
  }
  function getInvoiceStatus(key) {
    return INVOICE_STATUS[key] || INVOICE_STATUS.DRAFT;
  }
  function getTransferStatus(key) {
    return TRANSFER_STATUS[key] || TRANSFER_STATUS.PENDING;
  }
  function getPaymentMode(key) {
    return PAYMENT_MODES[key] || PAYMENT_MODES.cash;
  }
  function getRecipientType(key) {
    return RECIPIENT_TYPES.find(t => t.key === key) || RECIPIENT_TYPES[0];
  }

  function generateInvoiceNo(mode = 'WS') {
    const d = new Date();
    const stamp =
      String(d.getFullYear()).slice(2) +
      String(d.getMonth() + 1).padStart(2, '0') +
      String(d.getDate()).padStart(2, '0') + '-' +
      String(d.getHours()).padStart(2, '0') +
      String(d.getMinutes()).padStart(2, '0');
    const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
    return `${mode}-${stamp}-${rand}`;
  }

  function cleanupListeners() {
    State.unsubscribers.forEach(fn => {
      try { fn(); } catch (_) {}
    });
    State.unsubscribers = [];
    clearTimeout(State.timers.search);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §6 · DATA LOADING
     ═════════════════════════════════════════════════════════════════════ */

  async function loadInvoices() {
    try {
      const rows = await CacheDB.getAll(STORE_INVOICES);
      rows.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      State.invoices = rows;
      return rows;
    } catch (e) {
      console.error('[WSL.loadInvoices]', e);
      State.invoices = [];
      return [];
    }
  }

  async function loadTransfers() {
    try {
      const rows = await CacheDB.getAll(STORE_TRANSFERS);
      rows.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      State.transfers = rows;
      return rows;
    } catch (e) {
      console.error('[WSL.loadTransfers]', e);
      State.transfers = [];
      return [];
    }
  }

  async function loadInventory() {
    try {
      let items = [];
      if (GMS.IDB && GMS.IDB.isOpen) {
        try { items = await GMS.IDB.getAll(); } catch (_) {}
      }
      if (!items.length && GMS.Demo?.getInventory) {
        items = GMS.Demo.getInventory();
      }
      State.inventory = Array.isArray(items) ? items : [];
      return State.inventory;
    } catch (e) {
      console.warn('[WSL.loadInventory]', e);
      State.inventory = [];
      return [];
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §7 · KPI COMPUTATION
     ═════════════════════════════════════════════════════════════════════ */

  function computeKPIs() {
    const invoices = State.invoices.filter(i => i.status !== 'CANCELLED');
    const transfers = State.transfers;

    let totalValue = 0;
    let totalPure = 0;
    let totalCash = 0;
    let outstandingCash = 0;
    let outstandingGold = 0;

    invoices.forEach(inv => {
      totalValue += Number(inv.totals?.grand_total || 0);
      totalPure += Number(inv.totals?.total_pure || 0);
      totalCash += Number(inv.payment?.cash_paid || 0);

      /* المتبقي على الحساب */
      if (inv.status === 'CONFIRMED' || inv.status === 'PARTIAL') {
        outstandingCash += Number(inv.payment?.cash_due || 0);
        outstandingGold += Number(inv.payment?.gold_due_pure || 0);
      }
    });

    State.kpis = {
      totalInvoices: invoices.length,
      totalWholesaleValue: round(totalValue, 2),
      totalWholesalePure: round(totalPure, 4),
      totalWholesaleCash: round(totalCash, 2),
      outstandingCash: round(outstandingCash, 2),
      outstandingGold: round(outstandingGold, 4),

      totalTransfers: transfers.length,
      transfersPending: transfers.filter(t => t.status === 'PENDING').length,
      transfersInTransit: transfers.filter(t => t.status === 'IN_TRANSIT' || t.status === 'DELIVERED').length,
      transfersDelivered: transfers.filter(t => t.status === 'RECEIVED').length,
    };

    return State.kpis;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §8 · FILTERS + PAGINATION
     ═════════════════════════════════════════════════════════════════════ */

  function filterInvoices() {
    const f = State.filters;
    let rows = State.invoices.slice();

    if (f.invSearch) {
      const q = f.invSearch.toLowerCase();
      rows = rows.filter(r =>
        (r.invoice_no || '').toLowerCase().includes(q) ||
        (r.recipient?.name || '').toLowerCase().includes(q) ||
        (r.recipient?.phone || '').includes(q)
      );
    }

    if (f.invStatus) rows = rows.filter(r => r.status === f.invStatus);
    if (f.invMode)   rows = rows.filter(r => r.mode === f.invMode);

    return rows;
  }

  function filterTransfers() {
    const f = State.filters;
    let rows = State.transfers.slice();
    const myBranch = getActiveBranchId();

    if (f.trfSearch) {
      const q = f.trfSearch.toLowerCase();
      rows = rows.filter(r =>
        (r.transfer_no || '').toLowerCase().includes(q) ||
        (r.from_branch_name || '').toLowerCase().includes(q) ||
        (r.to_branch_name || '').toLowerCase().includes(q)
      );
    }

    if (f.trfStatus) rows = rows.filter(r => r.status === f.trfStatus);

    if (f.trfDirection === 'outgoing') {
      rows = rows.filter(r => r.from_branch_id === myBranch);
    } else if (f.trfDirection === 'incoming') {
      rows = rows.filter(r => r.to_branch_id === myBranch);
    }

    return rows;
  }

  function paginate(rows, page, pageSize) {
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const start = (safePage - 1) * pageSize;
    return {
      items: rows.slice(start, start + pageSize),
      page: safePage,
      totalPages,
      total: rows.length,
    };
  }

  /* ═════════════════════════════════════════════════════════════════════
     §9 · HTML RENDERERS — KPIs + Tabs + Toolbar
     ═════════════════════════════════════════════════════════════════════ */

  function renderKPIs() {
    const k = State.kpis;

    return `
      <div class="kpi-row cols-4">
        <div class="kpi violet">
          <div class="kpi-label">
            <i data-lucide="factory"></i>
            إجمالي فواتير الجملة
          </div>
          <div class="kpi-value">${intFmt(k.totalInvoices)}</div>
          <div class="kpi-meta">
            القيمة الإجمالية: <b>${moneyFmt(k.totalWholesaleValue)}</b> ج.م
          </div>
        </div>

        <div class="kpi gold">
          <div class="kpi-label">
            <i data-lucide="scale"></i>
            بندق جملة مُباع
          </div>
          <div class="kpi-value">${gramFmt(k.totalWholesalePure)} <small>جم</small></div>
          <div class="kpi-meta">
            نقدي مُحصَّل: <b>${moneyFmt(k.totalWholesaleCash)}</b> ج.م
          </div>
        </div>

        <div class="kpi ${k.outstandingCash > 0 ? 'danger' : 'success'}">
          <div class="kpi-label">
            <i data-lucide="banknote"></i>
            مديونيات جملة نقدية
          </div>
          <div class="kpi-value">${moneyFmt(k.outstandingCash)} <small>ج.م</small></div>
          <div class="kpi-meta">
            ذهب مستحق: <b>${gramFmt(k.outstandingGold)}</b> جم
          </div>
        </div>

        <div class="kpi info">
          <div class="kpi-label">
            <i data-lucide="truck"></i>
            أوامر التحويل
          </div>
          <div class="kpi-value">${intFmt(k.totalTransfers)}</div>
          <div class="kpi-meta">
            <b>${intFmt(k.transfersInTransit)}</b> قيد النقل
            · <b>${intFmt(k.transfersPending)}</b> قيد التحضير
          </div>
        </div>
      </div>
    `;
  }

  function renderTabs() {
    const tabs = [
      { key: 'wholesale', label: 'فواتير الجملة', icon: 'factory', badge: State.invoices.length },
      { key: 'transfers', label: 'التحويلات بين الفروع', icon: 'arrow-right-left', badge: State.transfers.length },
    ];

    return `
      <div class="tabs-bar" style="position:relative;top:0;padding:0;
                  background:transparent;border-bottom:1px solid var(--border);
                  margin-bottom:20px">
        ${tabs.map(t => `
          <button class="tab ${State.activeTab === t.key ? 'active' : ''}"
                  data-wsl-tab="${t.key}" type="button">
            <i data-lucide="${t.icon}"></i>
            <span>${t.label}</span>
            ${t.badge > 0 ? `<span class="tab-badge">${intFmt(t.badge)}</span>` : ''}
          </button>
        `).join('')}
      </div>
    `;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §10 · RENDERERS — WHOLESALE TAB
     ═════════════════════════════════════════════════════════════════════ */

  function renderWholesaleToolbar() {
    return `
      <div class="card" style="margin-bottom:16px">
        <div class="toolbar-row">
          <div class="search-wrap" style="flex:1;min-width:220px;max-width:380px">
            <i data-lucide="search"></i>
            <input id="wsl-inv-search"
                   placeholder="بحث برقم الفاتورة، الطرف، الهاتف…"
                   value="${esc(State.filters.invSearch)}"
                   autocomplete="off">
          </div>

          <select class="filter-select" id="wsl-inv-status" style="min-width:150px">
            <option value="">كل الحالات</option>
            ${Object.values(INVOICE_STATUS).map(s => `
              <option value="${s.key}" ${State.filters.invStatus === s.key ? 'selected' : ''}>
                ${s.label}
              </option>
            `).join('')}
          </select>

          <select class="filter-select" id="wsl-inv-mode" style="min-width:150px">
            <option value="">كل الأنماط</option>
            ${Object.values(SUPPLY_MODES).map(m => `
              <option value="${m.key}" ${State.filters.invMode === m.key ? 'selected' : ''}>
                ${m.label}
              </option>
            `).join('')}
          </select>

          <div class="spacer" style="flex:1"></div>

          <button class="btn btn-sm" id="wsl-inv-export" type="button">
            <i data-lucide="download"></i> تصدير
          </button>

          <button class="btn btn-primary btn-sm" id="wsl-inv-new" type="button">
            <i data-lucide="plus-circle"></i>
            فاتورة توريد جديدة
          </button>
        </div>
      </div>
    `;
  }

  function renderInvoiceRow(inv) {
    const status = getInvoiceStatus(inv.status);
    const mode = getSupplyMode(inv.mode);
    const recipient = inv.recipient || {};
    const totals = inv.totals || {};
    const payment = inv.payment || {};

    const cashDelta = Number(payment.cash_paid || 0);
    const cashDue = Number(payment.cash_due || 0);

    return `
      <tr data-wsl-inv-id="${esc(inv.id)}" style="cursor:pointer">
        <td class="mono" style="font-weight:800;font-size:11.5px">
          ${esc(inv.invoice_no || '—')}
        </td>
        <td style="font-size:11px;color:var(--muted)">
          <div class="mono">${dateAr(inv.created_at)}</div>
          <div class="mono" style="font-size:10px">${timeAgo(inv.created_at)}</div>
        </td>
        <td>
          <div class="cell-sku">
            <span class="sku-code">${esc(recipient.name || '—')}</span>
            <span class="sku-meta mono">${esc(recipient.phone || '')}</span>
          </div>
        </td>
        <td>
          <span class="pill" style="background:var(--${mode.color}-bg);
                       color:var(--${mode.color})">
            <i data-lucide="${mode.icon}" style="width:10px;height:10px"></i>
            ${mode.label}
          </span>
        </td>
        <td class="col-num" style="font-weight:700">
          ${gramFmt(totals.total_pure || 0)}
        </td>
        <td class="col-num" style="font-weight:900;color:var(--primary)">
          ${moneyFmt(totals.grand_total || 0)}
        </td>
        <td class="col-num">
          ${cashDelta > 0
            ? `<span class="pill pill-green" style="font-family:var(--font-mono);font-size:11px">
                 +${moneyFmt(cashDelta)}
               </span>`
            : '<span style="color:var(--muted)">—</span>'}
        </td>
        <td class="col-num">
          ${cashDue > 0
            ? `<span class="pill pill-red" style="font-family:var(--font-mono);font-size:11px">
                 ${moneyFmt(cashDue)}
               </span>`
            : '<span style="color:var(--muted)">—</span>'}
        </td>
        <td class="col-c">
          <span class="pill ${status.cls}">
            <i data-lucide="${status.icon}" style="width:10px;height:10px"></i>
            ${status.label}
          </span>
        </td>
        <td class="col-c">
          <button class="row-act" data-wsl-inv-view="${esc(inv.id)}"
                  title="تفاصيل" type="button">
            <i data-lucide="eye"></i>
          </button>
        </td>
      </tr>
    `;
  }

  function renderInvoicesTable() {
    const filtered = filterInvoices();
    const pg = paginate(filtered, State.invPage, State.invPageSize);
    State.invPage = pg.page;

    if (!pg.items.length) {
      return `
        <div class="empty" style="padding:80px 20px">
          <i data-lucide="factory"></i>
          <p>لا توجد فواتير جملة مسجَّلة</p>
          <span>ابدأ بإنشاء فاتورة توريد جديدة</span>
          <div style="margin-top:16px">
            <button class="btn btn-primary btn-sm" id="wsl-empty-new" type="button">
              <i data-lucide="plus-circle"></i>
              فاتورة جديدة
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
              <th style="width:150px">رقم الفاتورة</th>
              <th style="width:110px">التاريخ</th>
              <th>الطرف المستلم</th>
              <th style="width:150px">النمط</th>
              <th style="width:100px" class="col-num">بندق (جم)</th>
              <th style="width:120px" class="col-num">الإجمالي</th>
              <th style="width:110px" class="col-num">مدفوع نقداً</th>
              <th style="width:110px" class="col-num">متبقي</th>
              <th style="width:120px" class="col-c">الحالة</th>
              <th style="width:60px" class="col-c">—</th>
            </tr>
          </thead>
          <tbody>
            ${pg.items.map(renderInvoiceRow).join('')}
          </tbody>
        </table>
      </div>
      ${renderPagination(pg, 'inv')}
    `;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §11 · RENDERERS — TRANSFERS TAB
     ═════════════════════════════════════════════════════════════════════ */

  function renderTransfersToolbar() {
    return `
      <div class="card" style="margin-bottom:16px">
        <div class="toolbar-row">
          <div class="search-wrap" style="flex:1;min-width:220px;max-width:380px">
            <i data-lucide="search"></i>
            <input id="wsl-trf-search"
                   placeholder="بحث برقم الأمر، الفرع…"
                   value="${esc(State.filters.trfSearch)}"
                   autocomplete="off">
          </div>

          <select class="filter-select" id="wsl-trf-status" style="min-width:150px">
            <option value="">كل الحالات</option>
            ${Object.values(TRANSFER_STATUS).map(s => `
              <option value="${s.key}" ${State.filters.trfStatus === s.key ? 'selected' : ''}>
                ${s.label}
              </option>
            `).join('')}
          </select>

          <select class="filter-select" id="wsl-trf-dir" style="min-width:150px">
            <option value="">كل الاتجاهات</option>
            <option value="outgoing" ${State.filters.trfDirection === 'outgoing' ? 'selected' : ''}>صادر من فرعي</option>
            <option value="incoming" ${State.filters.trfDirection === 'incoming' ? 'selected' : ''}>وارد إلى فرعي</option>
          </select>

          <div class="spacer" style="flex:1"></div>

          <button class="btn btn-sm" id="wsl-trf-export" type="button">
            <i data-lucide="download"></i> تصدير
          </button>

          <button class="btn btn-primary btn-sm" id="wsl-trf-new" type="button">
            <i data-lucide="plus-circle"></i>
            أمر تحويل جديد
          </button>
        </div>
      </div>
    `;
  }

  function renderTransferRow(trf) {
    const status = getTransferStatus(trf.status);
    const totals = trf.totals || {};
    const isIncoming = trf.to_branch_id === getActiveBranchId();

    return `
      <tr data-wsl-trf-id="${esc(trf.id)}" style="cursor:pointer">
        <td class="mono" style="font-weight:800;font-size:11.5px">
          ${esc(trf.transfer_no || '—')}
        </td>
        <td style="font-size:11px;color:var(--muted)">
          <div class="mono">${dateAr(trf.created_at)}</div>
          <div class="mono" style="font-size:10px">${timeAgo(trf.created_at)}</div>
        </td>
        <td style="font-size:11.5px">
          <i data-lucide="building-2" style="width:11px;height:11px;
                     display:inline;vertical-align:-1px;color:var(--muted)"></i>
          ${esc(trf.from_branch_name || '—')}
        </td>
        <td style="font-size:11.5px">
          <i data-lucide="${isIncoming ? 'arrow-down-circle' : 'arrow-up-circle'}"
             style="width:11px;height:11px;display:inline;vertical-align:-1px;
                    color:${isIncoming ? 'var(--success)' : 'var(--danger)'}"></i>
          ${esc(trf.to_branch_name || '—')}
        </td>
        <td class="col-num" style="font-weight:800">
          ${intFmt((trf.items || []).length)}
        </td>
        <td class="col-num" style="font-weight:700">
          ${gramFmt(totals.total_pure || 0)}
        </td>
        <td class="col-num" style="font-weight:800;color:var(--primary)">
          ${moneyFmt(totals.grand_total || 0)}
        </td>
        <td class="col-c">
          <span class="pill ${status.cls}">
            <i data-lucide="${status.icon}" style="width:10px;height:10px"></i>
            ${status.label}
          </span>
        </td>
        <td class="col-c">
          <button class="row-act" data-wsl-trf-view="${esc(trf.id)}"
                  title="تفاصيل" type="button">
            <i data-lucide="eye"></i>
          </button>
        </td>
      </tr>
    `;
  }

  function renderTransfersTable() {
    const filtered = filterTransfers();
    const pg = paginate(filtered, State.trfPage, State.trfPageSize);
    State.trfPage = pg.page;

    if (!pg.items.length) {
      return `
        <div class="empty" style="padding:80px 20px">
          <i data-lucide="arrow-right-left"></i>
          <p>لا توجد أوامر تحويل</p>
          <span>ابدأ بإنشاء أمر تحويل بين الفروع</span>
          <div style="margin-top:16px">
            <button class="btn btn-primary btn-sm" id="wsl-empty-trf" type="button">
              <i data-lucide="plus-circle"></i>
              أمر تحويل جديد
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
              <th style="width:150px">رقم الأمر</th>
              <th style="width:110px">التاريخ</th>
              <th>من فرع</th>
              <th>إلى فرع</th>
              <th style="width:70px" class="col-num">القطع</th>
              <th style="width:100px" class="col-num">بندق (جم)</th>
              <th style="width:120px" class="col-num">القيمة</th>
              <th style="width:130px" class="col-c">الحالة</th>
              <th style="width:60px" class="col-c">—</th>
            </tr>
          </thead>
          <tbody>
            ${pg.items.map(renderTransferRow).join('')}
          </tbody>
        </table>
      </div>
      ${renderPagination(pg, 'trf')}
    `;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §12 · PAGINATION
     ═════════════════════════════════════════════════════════════════════ */

  function renderPagination(pg, kind) {
    if (pg.totalPages <= 1) return '';

    const startIdx = (pg.page - 1) * (kind === 'inv' ? State.invPageSize : State.trfPageSize) + 1;
    const endIdx = Math.min(pg.page * (kind === 'inv' ? State.invPageSize : State.trfPageSize), pg.total);

    const btns = [];
    const win = 2;
    const from = Math.max(1, pg.page - win);
    const to = Math.min(pg.totalPages, pg.page + win);

    const btn = (p, label, opts = {}) => `
      <button class="pg-btn ${opts.active ? 'active' : ''}"
              data-wsl-page-${kind}="${p}"
              type="button"
              ${opts.disabled ? 'disabled' : ''}>
        ${label}
      </button>
    `;

    btns.push(btn(1, '<i data-lucide="chevrons-right" style="width:14px;height:14px"></i>', { disabled: pg.page === 1 }));
    btns.push(btn(pg.page - 1, '<i data-lucide="chevron-right" style="width:14px;height:14px"></i>', { disabled: pg.page === 1 }));

    if (from > 1) {
      btns.push(btn(1, '1'));
      if (from > 2) btns.push('<span class="pg-ellipsis">…</span>');
    }

    for (let p = from; p <= to; p++) {
      btns.push(btn(p, String(p), { active: p === pg.page }));
    }

    if (to < pg.totalPages) {
      if (to < pg.totalPages - 1) btns.push('<span class="pg-ellipsis">…</span>');
      btns.push(btn(pg.totalPages, String(pg.totalPages)));
    }

    btns.push(btn(pg.page + 1, '<i data-lucide="chevron-left" style="width:14px;height:14px"></i>', { disabled: pg.page === pg.totalPages }));
    btns.push(btn(pg.totalPages, '<i data-lucide="chevrons-left" style="width:14px;height:14px"></i>', { disabled: pg.page === pg.totalPages }));

    const pageSize = kind === 'inv' ? State.invPageSize : State.trfPageSize;
    const sizes = [10, 25, 50, 100, 250];

    return `
      <div class="pager">
        <div class="pg-info">
          <i data-lucide="rows-3" style="width:14px;height:14px"></i>
          <span>عرض</span>
          <b>${intFmt(startIdx)}–${intFmt(endIdx)}</b>
          <span>من</span>
          <b>${intFmt(pg.total)}</b>
          <span class="sep">·</span>
          <span>صفحة</span>
          <b>${pg.page}</b>
          <span>من</span>
          <b>${pg.totalPages}</b>
        </div>
        <div class="spacer" style="flex:1"></div>
        <select class="pg-size" id="wsl-page-size-${kind}">
          ${sizes.map(s => `
            <option value="${s}" ${s === pageSize ? 'selected' : ''}>${s} / صفحة</option>
          `).join('')}
        </select>
        <div class="pg-controls">
          ${btns.join('')}
        </div>
      </div>
    `;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §13 · MAIN RENDER
     ═════════════════════════════════════════════════════════════════════ */

  async function render(root) {
    if (!root) return;

    try {
      root.innerHTML = `
        <div style="padding:60px;text-align:center">
          <div class="spinner" style="margin:0 auto 14px"></div>
          <div style="font-size:13px;color:var(--muted);font-weight:600">
            جارٍ تحميل وحدة التوريد…
          </div>
        </div>
      `;

      await Promise.all([
        loadInvoices(),
        loadTransfers(),
        loadInventory(),
      ]);

      computeKPIs();

      let tabContent = '';
      if (State.activeTab === 'wholesale') {
        tabContent = `
          ${renderWholesaleToolbar()}
          <div class="card">
            <div class="card-head">
              <h3>
                <i data-lucide="factory"></i>
                فواتير الجملة والتوريد
              </h3>
              <div class="spacer" style="flex:1"></div>
              <span class="card-sub">${intFmt(State.invoices.length)} فاتورة</span>
            </div>
            <div id="wsl-inv-table-host">${renderInvoicesTable()}</div>
          </div>
        `;
      } else {
        tabContent = `
          ${renderTransfersToolbar()}
          <div class="card">
            <div class="card-head">
              <h3>
                <i data-lucide="arrow-right-left"></i>
                أوامر التحويل بين الفروع
              </h3>
              <div class="spacer" style="flex:1"></div>
              <span class="card-sub">${intFmt(State.transfers.length)} أمر</span>
            </div>
            <div id="wsl-trf-table-host">${renderTransfersTable()}</div>
          </div>
        `;
      }

      root.innerHTML = `
        <div class="page-header">
          <h2>
            <i data-lucide="truck"></i>
            التوريد والجملة والتحويلات
          </h2>
          <p>
            نظام موحّد لتوريد المشغولات: بيع بالجملة B2B، تحويل بين الفروع،
            ومقايضة الذهب الخام — مع ترحيل محاسبي مزدوج (ذهب + نقد).
            <span class="chip violet" style="font-size:10px;margin-inline-start:6px">
              <i data-lucide="split" style="width:10px;height:10px"></i>
              Dual-Ledger · B2B
            </span>
          </p>
        </div>

        ${renderKPIs()}
        ${renderTabs()}
        ${tabContent}
      `;

      window.lucide?.createIcons();
      bindEvents();
      bindRealtime();

    } catch (e) {
      console.error('[WSL.render]', e);
      root.innerHTML = `
        <div class="card">
          <div class="card-body">
            <div class="empty" style="padding:60px 20px">
              <i data-lucide="alert-circle" style="color:var(--danger)"></i>
              <p>فشل تحميل الصفحة</p>
              <span>${esc(e.message)}</span>
              <div style="margin-top:16px">
                <button class="btn btn-primary" id="wsl-retry" type="button">
                  <i data-lucide="refresh-cw"></i> إعادة المحاولة
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
      window.lucide?.createIcons();
      const retry = document.getElementById('wsl-retry');
      if (retry) retry.onclick = () => render(document.getElementById('page'));
    }
  }

  function refreshWholesaleTab() {
    const host = document.getElementById('wsl-inv-table-host');
    if (host) {
      host.innerHTML = renderInvoicesTable();
      window.lucide?.createIcons();
      bindInvoiceRowEvents();
      bindPaginationEvents('inv');
    }
  }

  function refreshTransfersTab() {
    const host = document.getElementById('wsl-trf-table-host');
    if (host) {
      host.innerHTML = renderTransfersTable();
      window.lucide?.createIcons();
      bindTransferRowEvents();
      bindPaginationEvents('trf');
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §14 · EVENTS BINDING
     ═════════════════════════════════════════════════════════════════════ */

  function bindEvents() {
    /* Tabs */
    document.querySelectorAll('[data-wsl-tab]').forEach(tab => {
      tab.onclick = () => {
        State.activeTab = tab.dataset.wslTab;
        render(document.getElementById('page'));
      };
    });

    /* Search — invoices */
    const invSearch = document.getElementById('wsl-inv-search');
    if (invSearch) {
      invSearch.oninput = (e) => {
        clearTimeout(State.timers.search);
        State.timers.search = setTimeout(() => {
          State.filters.invSearch = e.target.value.trim();
          State.invPage = 1;
          refreshWholesaleTab();
        }, 250);
      };
    }

    /* Filters — invoices */
    const invStatus = document.getElementById('wsl-inv-status');
    if (invStatus) {
      invStatus.onchange = () => {
        State.filters.invStatus = invStatus.value;
        State.invPage = 1;
        refreshWholesaleTab();
      };
    }

    const invMode = document.getElementById('wsl-inv-mode');
    if (invMode) {
      invMode.onchange = () => {
        State.filters.invMode = invMode.value;
        State.invPage = 1;
        refreshWholesaleTab();
      };
    }

    /* Search — transfers */
    const trfSearch = document.getElementById('wsl-trf-search');
    if (trfSearch) {
      trfSearch.oninput = (e) => {
        clearTimeout(State.timers.search);
        State.timers.search = setTimeout(() => {
          State.filters.trfSearch = e.target.value.trim();
          State.trfPage = 1;
          refreshTransfersTab();
        }, 250);
      };
    }

    /* Filters — transfers */
    const trfStatus = document.getElementById('wsl-trf-status');
    if (trfStatus) {
      trfStatus.onchange = () => {
        State.filters.trfStatus = trfStatus.value;
        State.trfPage = 1;
        refreshTransfersTab();
      };
    }

    const trfDir = document.getElementById('wsl-trf-dir');
    if (trfDir) {
      trfDir.onchange = () => {
        State.filters.trfDirection = trfDir.value;
        State.trfPage = 1;
        refreshTransfersTab();
      };
    }

    /* Primary actions */
    const newInv = document.getElementById('wsl-inv-new');
    if (newInv) newInv.onclick = () => openWholesaleModal();

    const newTrf = document.getElementById('wsl-trf-new');
    if (newTrf) newTrf.onclick = () => openTransferModal();

    const emptyInv = document.getElementById('wsl-empty-new');
    if (emptyInv) emptyInv.onclick = () => openWholesaleModal();

    const emptyTrf = document.getElementById('wsl-empty-trf');
    if (emptyTrf) emptyTrf.onclick = () => openTransferModal();

    /* Export */
    const invExport = document.getElementById('wsl-inv-export');
    if (invExport) invExport.onclick = () => exportInvoices();

    const trfExport = document.getElementById('wsl-trf-export');
    if (trfExport) trfExport.onclick = () => exportTransfers();

    /* Row + Pagination */
    bindInvoiceRowEvents();
    bindTransferRowEvents();
    bindPaginationEvents('inv');
    bindPaginationEvents('trf');
  }

  function bindInvoiceRowEvents() {
    document.querySelectorAll('[data-wsl-inv-view]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        openInvoiceDetails(btn.dataset.wslInvView);
      };
    });

    document.querySelectorAll('tr[data-wsl-inv-id]').forEach(tr => {
      tr.onclick = (e) => {
        if (e.target.closest('button')) return;
        openInvoiceDetails(tr.dataset.wslInvId);
      };
    });
  }

  function bindTransferRowEvents() {
    document.querySelectorAll('[data-wsl-trf-view]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        openTransferDetails(btn.dataset.wslTrfView);
      };
    });

    document.querySelectorAll('tr[data-wsl-trf-id]').forEach(tr => {
      tr.onclick = (e) => {
        if (e.target.closest('button')) return;
        openTransferDetails(tr.dataset.wslTrfId);
      };
    });
  }

  function bindPaginationEvents(kind) {
    document.querySelectorAll(`[data-wsl-page-${kind}]`).forEach(btn => {
      btn.onclick = () => {
        const page = Number(btn.dataset[`wslPage${kind === 'inv' ? 'Inv' : 'Trf'}`]);
        if (kind === 'inv') {
          State.invPage = page;
          refreshWholesaleTab();
        } else {
          State.trfPage = page;
          refreshTransfersTab();
        }
      };
    });

    const sizeSel = document.getElementById(`wsl-page-size-${kind}`);
    if (sizeSel) {
      sizeSel.onchange = () => {
        if (kind === 'inv') {
          State.invPageSize = Number(sizeSel.value);
          State.invPage = 1;
          refreshWholesaleTab();
        } else {
          State.trfPageSize = Number(sizeSel.value);
          State.trfPage = 1;
          refreshTransfersTab();
        }
      };
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §15 · WHOLESALE INVOICE MODAL
     ═════════════════════════════════════════════════════════════════════ */

  function initInvoiceDraft(mode = 'wholesale') {
    const supplyMode = getSupplyMode(mode);
    const branches = getBranches();

    State.draft = {
      mode: supplyMode.key,
      recipient: {
        type: 'shop',
        id: '',
        name: '',
        phone: '',
        branch_id: '',
      },
      items: [],
      discountPct: supplyMode.defaultDiscount,
      payment: {
        mode: 'cash',
        cash_paid: 0,
        gold_received: {
          karat: 21,
          purity_ratio: GMS.karatRatio(21),
          weight_gross: 0,
          weight_stones: 0,
          weight_net: 0,
          weight_pure: 0,
          value_at_scrap: 0,
        },
        cash_due: 0,
        gold_due_pure: 0,
      },
      notes: '',
      branch_id: getActiveBranchId(),
      _branches: branches,
    };
  }

  function openWholesaleModal(mode = 'wholesale') {
    initInvoiceDraft(mode);

    GMS.Modal.open({
      title: 'فاتورة توريد / جملة جديدة',
      icon: 'factory',
      size: 'xl',
      body: `<div id="wsl-form-host">${renderInvoiceForm()}</div>`,
      footer: `
        <button class="btn" data-close type="button">إلغاء</button>
        <button class="btn btn-info" id="wsl-preview" type="button">
          <i data-lucide="eye"></i> معاينة
        </button>
        <button class="btn btn-primary btn-lg" id="wsl-save" type="button">
          <i data-lucide="save"></i> حفظ الفاتورة
        </button>
      `,
      onMount: (el, close) => {
        bindInvoiceForm(el);

        el.querySelector('#wsl-preview').onclick = () => previewInvoice(el);
        el.querySelector('#wsl-save').onclick = () => saveInvoice(el, close);
      },
    });
  }

  function renderInvoiceForm() {
    const d = State.draft;
    if (!d) return '';

    const branches = getBranches();
    const customers = getCustomers();
    const suppliers = getSuppliers();

    return `
      <!-- Section 1: Mode + Recipient -->
      <div style="padding:16px 18px;background:var(--surface-2);border-radius:12px;
                  border:1px solid var(--border);margin-bottom:16px">

        <div style="font-size:11px;font-weight:800;color:var(--muted);
                    text-transform:uppercase;letter-spacing:.4px;
                    margin-bottom:10px;display:flex;align-items:center;gap:6px">
          <i data-lucide="package" style="width:12px;height:12px"></i>
          نمط التوريد
        </div>

        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;
                    margin-bottom:16px">
          ${Object.values(SUPPLY_MODES).map(m => `
            <button type="button" data-wsl-mode="${m.key}"
                    style="display:flex;flex-direction:column;align-items:center;
                           gap:6px;padding:12px 8px;border-radius:11px;
                           border:1.5px solid ${d.mode === m.key ? `var(--${m.color})` : 'var(--border)'};
                           background:${d.mode === m.key ? `var(--${m.color}-bg)` : 'var(--surface)'};
                           cursor:pointer;font-weight:800;font-size:11.5px;
                           transition:all .2s;font-family:inherit">
              <i data-lucide="${m.icon}"
                 style="width:18px;height:18px;
                        color:${d.mode === m.key ? `var(--${m.color})` : 'var(--text-2)'}"></i>
              <span style="color:${d.mode === m.key ? `var(--${m.color})` : 'var(--text-2)'}">
                ${m.label}
              </span>
            </button>
          `).join('')}
        </div>

        <div class="grid-form" style="gap:11px">
          <div class="field">
            <label>نوع الطرف المستلم</label>
            <select id="wsl-recipient-type">
              ${RECIPIENT_TYPES.map(t => `
                <option value="${t.key}" ${d.recipient.type === t.key ? 'selected' : ''}>
                  ${t.label}
                </option>
              `).join('')}
            </select>
          </div>

          <div class="field">
            <label>الطرف المستلم <span class="req">*</span></label>
            <select id="wsl-recipient-id">
              <option value="">— اختر —</option>
              ${d.recipient.type === 'branch' ? branches.map(b => `
                <option value="${b.id}" ${d.recipient.id === b.id ? 'selected' : ''}>
                  ${esc(b.name)}
                </option>
              `).join('') : ''}
              ${d.recipient.type === 'shop' || d.recipient.type === 'workshop' ? suppliers.map(s => `
                <option value="${s.id}" ${d.recipient.id === s.id ? 'selected' : ''}>
                  ${esc(s.name)} ${s.phone ? `(${esc(s.phone)})` : ''}
                </option>
              `).join('') : ''}
              ${d.recipient.type === 'customer' ? customers.map(c => `
                <option value="${c.id}" ${d.recipient.id === c.id ? 'selected' : ''}>
                  ${esc(c.name)} ${c.phone ? `(${esc(c.phone)})` : ''}
                </option>
              `).join('') : ''}
            </select>
          </div>

          <div class="field">
            <label>اسم الطرف يدوياً</label>
            <input id="wsl-recipient-name"
                   placeholder="اسم الطرف…"
                   value="${esc(d.recipient.name)}">
          </div>

          <div class="field">
            <label>الهاتف</label>
            <input id="wsl-recipient-phone" class="mono"
                   placeholder="01xxxxxxxxx" inputmode="tel"
                   value="${esc(d.recipient.phone)}">
          </div>

          <div class="field">
            <label>الفرع المُصدِر</label>
            <select id="wsl-source-branch">
              ${branches.map(b => `
                <option value="${b.id}" ${d.branch_id === b.id ? 'selected' : ''}>
                  ${esc(b.name)}
                </option>
              `).join('')}
            </select>
          </div>

          <div class="field">
            <label>نسبة خصم المصنعية %</label>
            <input type="number" id="wsl-discount-pct"
                   step="0.5" min="0" max="50"
                   value="${d.discountPct}"
                   class="mono"
                   style="font-weight:800;text-align:center">
          </div>
        </div>
      </div>

      <!-- Section 2: Item Picker -->
      <div style="padding:16px 18px;background:var(--gold-soft);border-radius:12px;
                  border:1px solid color-mix(in srgb,var(--primary) 30%,var(--border));
                  margin-bottom:16px">

        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
          <div style="width:32px;height:32px;border-radius:9px;
                      background:var(--gold-grad);display:grid;place-items:center;
                      color:#2a1f05;font-weight:900">
            <i data-lucide="gem" style="width:16px;height:16px"></i>
          </div>
          <div style="flex:1">
            <div style="font-size:12.5px;font-weight:900;color:var(--warn)">
              المشغولات (${d.items.length} قطعة)
            </div>
            <div style="font-size:10.5px;color:var(--muted);font-weight:600">
              امسح الباركود أو اختر من المخزون
            </div>
          </div>

          <button type="button" class="btn btn-primary btn-sm" id="wsl-add-item-btn">
            <i data-lucide="plus"></i> إضافة قطعة
          </button>
        </div>

        <div id="wsl-items-host">
          ${renderInvoiceItemsList()}
        </div>
      </div>

      <!-- Section 3: Payment -->
      <div style="padding:16px 18px;background:var(--surface-2);border-radius:12px;
                  border:1px solid var(--border);margin-bottom:16px">
        <div style="font-size:11px;font-weight:800;color:var(--muted);
                    text-transform:uppercase;letter-spacing:.4px;
                    margin-bottom:10px;display:flex;align-items:center;gap:6px">
          <i data-lucide="wallet" style="width:12px;height:12px"></i>
          طريقة التسوية
        </div>

        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;
                    margin-bottom:14px">
          ${Object.values(PAYMENT_MODES).map(p => `
            <button type="button" data-wsl-pay="${p.key}"
                    style="display:flex;flex-direction:column;align-items:center;
                           gap:6px;padding:12px 8px;border-radius:11px;
                           border:1.5px solid ${d.payment.mode === p.key ? `var(--${p.color})` : 'var(--border)'};
                           background:${d.payment.mode === p.key ? `var(--${p.color}-bg)` : 'var(--surface)'};
                           cursor:pointer;font-weight:800;font-size:11px;
                           transition:all .2s;font-family:inherit">
              <i data-lucide="${p.icon}"
                 style="width:16px;height:16px;
                        color:${d.payment.mode === p.key ? `var(--${p.color})` : 'var(--text-2)'}"></i>
              <span style="color:${d.payment.mode === p.key ? `var(--${p.color})` : 'var(--text-2)'}">
                ${p.label}
              </span>
            </button>
          `).join('')}
        </div>

        <!-- Cash Fields -->
        ${d.payment.mode === 'cash' || d.payment.mode === 'mixed' ? `
          <div class="field" style="margin-bottom:12px">
            <label>المبلغ المستلم نقداً (ج.م)</label>
            <input type="number" id="wsl-cash-paid" step="0.01" min="0"
                   value="${d.payment.cash_paid}"
                   class="mono big">
          </div>
        ` : ''}

        <!-- Gold Exchange Fields -->
        ${d.payment.mode === 'gold_exchange' || d.payment.mode === 'mixed' ? `
          <div style="padding:14px;background:var(--gold-soft);border-radius:10px;
                      border:1px solid color-mix(in srgb,var(--primary) 30%,var(--border));
                      margin-bottom:12px">
            <div style="font-size:11px;font-weight:800;color:var(--warn);
                        text-transform:uppercase;letter-spacing:.4px;
                        margin-bottom:10px;display:flex;align-items:center;gap:6px">
              <i data-lucide="repeat" style="width:12px;height:12px"></i>
              ذهب خام مُستلم
            </div>

            <div class="grid-form" style="gap:10px">
              <div class="field">
                <label>العيار</label>
                <select id="wsl-gold-karat">
                  ${GMS.KARAT_ORDER.map(k => `
                    <option value="${k}" ${d.payment.gold_received.karat === k ? 'selected' : ''}>
                      ${k}K
                    </option>
                  `).join('')}
                </select>
              </div>

              <div class="field">
                <label>الوزن القائم (جم)</label>
                <input type="number" id="wsl-gold-gross"
                       step="0.001" min="0"
                       value="${d.payment.gold_received.weight_gross || ''}"
                       class="mono"
                       style="font-weight:800;text-align:center">
              </div>

              <div class="field">
                <label>وزن الأحجار (جم)</label>
                <input type="number" id="wsl-gold-stones"
                       step="0.001" min="0"
                       value="${d.payment.gold_received.weight_stones || 0}"
                       class="mono"
                       style="font-weight:800;text-align:center">
              </div>

              <div class="field">
                <label>الوزن الصافي</label>
                <input id="wsl-gold-net" readonly class="mono"
                       style="font-weight:800;text-align:center;
                              background:var(--surface)">
              </div>

              <div class="field">
                <label>البندق 24K</label>
                <input id="wsl-gold-pure" readonly class="mono"
                       style="font-weight:800;text-align:center;
                              color:var(--primary);background:var(--surface)">
              </div>

              <div class="field">
                <label>القيمة بسعر الكسر</label>
                <input id="wsl-gold-value" readonly class="mono"
                       style="font-weight:800;text-align:center;
                              background:var(--surface)">
              </div>
            </div>
          </div>
        ` : ''}

        <div class="field">
          <label>ملاحظات</label>
          <input id="wsl-invoice-notes"
                 placeholder="ملاحظات على الفاتورة…"
                 value="${esc(d.notes)}">
        </div>
      </div>

      <!-- Live Summary -->
      <div id="wsl-summary-host">
        ${renderInvoiceSummary()}
      </div>
    `;
  }

  function renderInvoiceItemsList() {
    const d = State.draft;
    if (!d || !d.items.length) {
      return `
        <div style="padding:30px 20px;text-align:center;
                    background:var(--surface);border-radius:10px;
                    border:1px dashed var(--border)">
          <i data-lucide="package"
             style="width:32px;height:32px;opacity:.3;
                    margin:0 auto 8px;display:block"></i>
          <div style="font-size:12.5px;font-weight:800;color:var(--text-2)">
            لا توجد قطع مُضافة
          </div>
          <div style="font-size:11px;color:var(--muted);font-weight:600;
                      margin-top:4px">
            اضغط "إضافة قطعة" لاختيار من المخزون
          </div>
        </div>
      `;
    }

    return `
      <div class="table-wrap" style="border-radius:10px;max-height:340px;
                  border:1px solid var(--border);background:var(--surface)">
        <table class="tbl" style="font-size:11.5px">
          <thead>
            <tr>
              <th>كود التاج</th>
              <th style="width:60px" class="col-c">عيار</th>
              <th style="width:90px" class="col-num">صافي (جم)</th>
              <th style="width:100px" class="col-num">بندق (جم)</th>
              <th style="width:100px" class="col-num">مصنعية/جم</th>
              <th style="width:110px" class="col-num">إجمالي</th>
              <th style="width:50px" class="col-c">—</th>
            </tr>
          </thead>
          <tbody>
            ${d.items.map((item, idx) => {
              const isCustom = item.is_custom_karat === true || item.custom_karat != null;

              return `
                <tr data-wsl-item-idx="${idx}">
                  <td class="mono" style="font-weight:800">${esc(item.sku)}</td>
                  <td class="col-c">
                    ${isCustom
                      ? `<span class="karat-badge custom-karat-badge" style="font-size:10px">
                           ${item.custom_karat}
                         </span>`
                      : `<span class="karat-badge" data-k="${item.karat}" style="font-size:10px">
                           ${item.karat}K
                         </span>`}
                  </td>
                  <td class="col-num">${gramFmt(item.net_weight)}</td>
                  <td class="col-num" style="color:var(--primary);font-weight:800">
                    ${gramFmt(item.pure_weight)}
                  </td>
                  <td class="col-num">
                    <input type="number" class="mono"
                           data-wsl-item-fee="${idx}"
                           step="1" min="0"
                           value="${item.workmanship_per_gram}"
                           style="width:80px;padding:4px 6px;
                                  text-align:center;font-weight:800;
                                  border:1px solid var(--border);
                                  border-radius:6px">
                  </td>
                  <td class="col-num" style="font-weight:900;color:var(--primary)">
                    ${moneyFmt(item.total_value)}
                  </td>
                  <td class="col-c">
                    <button class="row-act danger"
                            data-wsl-item-rm="${idx}" type="button"
                            style="width:26px;height:26px">
                      <i data-lucide="x"></i>
                    </button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderInvoiceSummary() {
    const d = State.draft;
    if (!d) return '';

    const totals = computeInvoiceTotals();
    const price24 = getPrice24();
    const scrapPrice = getScrapBuyPrice();
    const pay = d.payment;

    const remaining = Math.max(0,
      totals.grand_total
      - Number(pay.cash_paid || 0)
      - Number(pay.gold_received?.value_at_scrap || 0)
    );

    const payment = getPaymentMode(pay.mode);

    return `
      <div style="padding:16px 18px;background:var(--info-bg);
                  border-radius:12px;
                  border:1.5px solid color-mix(in srgb,var(--info) 30%,var(--border))">

        <div style="font-size:11px;font-weight:800;color:var(--info);
                    text-transform:uppercase;letter-spacing:.4px;
                    margin-bottom:12px;display:flex;align-items:center;gap:6px">
          <i data-lucide="calculator" style="width:12px;height:12px"></i>
          الملخص اللحظي
        </div>

        <div class="calc-list" style="margin-bottom:14px">
          <div class="cl-row">
            <span class="k"><i data-lucide="package"></i> عدد القطع</span>
            <span class="v">${totals.item_count}</span>
          </div>
          <div class="cl-row">
            <span class="k"><i data-lucide="scale"></i> الوزن الصافي</span>
            <span class="v">${gramFmt(totals.total_net)} جم</span>
          </div>
          <div class="cl-row hi">
            <span class="k"><i data-lucide="sparkles"></i> البندق 24K</span>
            <span class="v">${gramFmt(totals.total_pure)} جم</span>
          </div>
        </div>

        <div class="calc-list" style="margin-bottom:14px">
          <div class="cl-row">
            <span class="k"><i data-lucide="coins"></i> قيمة الذهب</span>
            <span class="v">${moneyFmt(totals.total_gold_value)} ج.م</span>
          </div>
          <div class="cl-row">
            <span class="k"><i data-lucide="hammer"></i> إجمالي المصنعية</span>
            <span class="v">${moneyFmt(totals.total_workmanship)} ج.م</span>
          </div>
          ${d.discountPct > 0 ? `
            <div class="cl-row">
              <span class="k" style="color:var(--warn)">
                <i data-lucide="percent"></i> خصم ${d.discountPct}%
              </span>
              <span class="v" style="color:var(--warn)">
                − ${moneyFmt(totals.discount_amount)} ج.م
              </span>
            </div>
          ` : ''}
          <div class="cl-row hi">
            <span class="k"><i data-lucide="banknote"></i> الإجمالي النهائي</span>
            <span class="v">${moneyFmt(totals.grand_total)} ج.م</span>
          </div>
        </div>

        <div style="padding:12px;background:var(--surface);border-radius:10px;
                    border:1px solid var(--border);margin-bottom:12px">
          <div style="font-size:10.5px;font-weight:800;color:var(--muted);
                      text-transform:uppercase;letter-spacing:.4px;
                      margin-bottom:8px">
            طريقة التسوية: <span style="color:var(--${payment.color})">
              ${payment.label}
            </span>
          </div>

          <div class="calc-list">
            ${pay.mode === 'cash' || pay.mode === 'mixed' ? `
              <div class="cl-row">
                <span class="k"><i data-lucide="banknote"></i> نقدي مستلم</span>
                <span class="v" style="color:var(--success)">
                  + ${moneyFmt(pay.cash_paid)} ج.م
                </span>
              </div>
            ` : ''}

            ${(pay.mode === 'gold_exchange' || pay.mode === 'mixed') && pay.gold_received?.weight_pure > 0 ? `
              <div class="cl-row">
                <span class="k"><i data-lucide="repeat"></i> ذهب مستلم</span>
                <span class="v" style="color:var(--warn)">
                  + ${gramFmt(pay.gold_received.weight_pure)} جم
                  (${moneyFmt(pay.gold_received.value_at_scrap)} ج.م)
                </span>
              </div>
            ` : ''}

            <div class="cl-row hi">
              <span class="k">
                <i data-lucide="${remaining > 0 ? 'alert-circle' : 'check-circle-2'}"></i>
                ${remaining > 0 ? 'المتبقي على الحساب' : 'مسددة بالكامل'}
              </span>
              <span class="v" style="color:${remaining > 0 ? 'var(--danger)' : 'var(--success)'}">
                ${moneyFmt(remaining)} ج.م
              </span>
            </div>
          </div>
        </div>

        <div style="font-size:10.5px;color:var(--muted);text-align:center;
                    font-weight:700">
          سعر 24K: ${moneyFmt(price24)} ج.م/جم
          · سعر الكسر: ${moneyFmt(scrapPrice)} ج.م/جم
        </div>
      </div>
    `;
  }

  function computeInvoiceTotals() {
    const d = State.draft;
    if (!d) return { item_count: 0, total_net: 0, total_pure: 0, total_gold_value: 0, total_workmanship: 0, discount_amount: 0, grand_total: 0 };

    const price24 = getPrice24();
    let itemCount = 0;
    let totalNet = 0;
    let totalPure = 0;
    let totalGoldValue = 0;
    let totalWorkmanship = 0;

    d.items.forEach(item => {
      itemCount++;
      totalNet += Number(item.net_weight || 0);
      totalPure += Number(item.pure_weight || 0);
      totalGoldValue += Number(item.gold_value || 0);
      totalWorkmanship += Number(item.workmanship_value || 0);
    });

    const discountAmount = round(totalWorkmanship * (Number(d.discountPct) || 0) / 100, 2);
    const grandTotal = round(totalGoldValue + totalWorkmanship - discountAmount, 2);

    return {
      item_count: itemCount,
      total_net: round(totalNet, 3),
      total_pure: round(totalPure, 4),
      total_gold_value: round(totalGoldValue, 2),
      total_workmanship: round(totalWorkmanship, 2),
      discount_amount: discountAmount,
      grand_total: grandTotal,
    };
  }

  function recalcInvoiceTotals() {
    const d = State.draft;
    if (!d) return;

    const price24 = getPrice24();
    const scrapPrice = getScrapBuyPrice();

    /* Recalculate each item */
    d.items.forEach(item => {
      const purity = Number(item.purity_ratio) || GMS.karatRatio(item.karat);
      const net = Number(item.net_weight || 0);
      const pure = round(net * purity, 4);
      const goldValue = round(pure * price24, 2);
      const makeValue = round(net * Number(item.workmanship_per_gram || 0), 2);

      item.pure_weight = pure;
      item.gold_value = goldValue;
      item.workmanship_value = makeValue;
      item.total_value = round(goldValue + makeValue, 2);
    });

    /* Update gold payment */
    if (d.payment.mode === 'gold_exchange' || d.payment.mode === 'mixed') {
      const gr = d.payment.gold_received;
      const purity = gr.purity_ratio || GMS.karatRatio(gr.karat);
      const net = Math.max(0, (Number(gr.weight_gross) || 0) - (Number(gr.weight_stones) || 0));
      const pure = round(net * purity, 4);
      const value = round(pure * scrapPrice, 2);

      gr.weight_net = round(net, 3);
      gr.weight_pure = pure;
      gr.value_at_scrap = value;
    }

    /* Update totals */
    const totals = computeInvoiceTotals();
    const remaining = Math.max(0,
      totals.grand_total
      - Number(d.payment.cash_paid || 0)
      - Number(d.payment.gold_received?.value_at_scrap || 0)
    );

    d.payment.cash_due = remaining;
    d.payment.gold_due_pure = 0;
    d._totals = totals;
  }

  function refreshInvoiceForm() {
    const host = document.getElementById('wsl-form-host');
    if (!host) return;

    recalcInvoiceTotals();
    host.innerHTML = renderInvoiceForm();
    window.lucide?.createIcons();
    bindInvoiceForm(document);
  }

  function bindInvoiceForm(root) {
    const $ = (id) => root.querySelector('#' + id);

    /* Mode selection */
    root.querySelectorAll('[data-wsl-mode]').forEach(btn => {
      btn.onclick = () => {
        const mode = btn.dataset.wslMode;
        State.draft.mode = mode;
        State.draft.discountPct = getSupplyMode(mode).defaultDiscount;
        refreshInvoiceForm();
      };
    });

    /* Recipient type */
    const typeSelect = $('wsl-recipient-type');
    if (typeSelect) {
      typeSelect.onchange = (e) => {
        State.draft.recipient.type = e.target.value;
        State.draft.recipient.id = '';
        State.draft.recipient.name = '';
        State.draft.recipient.phone = '';
        refreshInvoiceForm();
      };
    }

    /* Recipient select */
    const recipientSel = $('wsl-recipient-id');
    if (recipientSel) {
      recipientSel.onchange = (e) => {
        const id = e.target.value;
        const opt = e.target.selectedOptions?.[0];
        State.draft.recipient.id = id;
        if (opt && opt.textContent) {
          State.draft.recipient.name = opt.textContent.trim();
        }
        /* Auto-fill name field */
        const nameInput = $('wsl-recipient-name');
        if (nameInput) nameInput.value = State.draft.recipient.name;
      };
    }

    /* Manual name/phone */
    const nameInput = $('wsl-recipient-name');
    if (nameInput) {
      nameInput.oninput = (e) => { State.draft.recipient.name = e.target.value; };
    }

    const phoneInput = $('wsl-recipient-phone');
    if (phoneInput) {
      phoneInput.oninput = (e) => { State.draft.recipient.phone = e.target.value; };
    }

    const sourceBranch = $('wsl-source-branch');
    if (sourceBranch) {
      sourceBranch.onchange = (e) => { State.draft.branch_id = e.target.value; };
    }

    /* Discount */
    const discountInput = $('wsl-discount-pct');
    if (discountInput) {
      discountInput.oninput = (e) => {
        let v = numOr(e.target.value, 0);
        v = Math.max(0, Math.min(50, v));
        State.draft.discountPct = v;
        updateSummaryOnly();
      };
    }

    /* Add item */
    const addBtn = $('wsl-add-item-btn');
    if (addBtn) {
      addBtn.onclick = () => openItemPicker();
    }

    /* Payment mode */
    root.querySelectorAll('[data-wsl-pay]').forEach(btn => {
      btn.onclick = () => {
        State.draft.payment.mode = btn.dataset.wslPay;
        refreshInvoiceForm();
      };
    });

    /* Cash paid */
    const cashPaid = $('wsl-cash-paid');
    if (cashPaid) {
      cashPaid.oninput = (e) => {
        State.draft.payment.cash_paid = numOr(e.target.value, 0);
        updateSummaryOnly();
      };
    }

    /* Gold received fields */
    const goldKarat = $('wsl-gold-karat');
    if (goldKarat) {
      goldKarat.onchange = (e) => {
        const k = Number(e.target.value);
        State.draft.payment.gold_received.karat = k;
        State.draft.payment.gold_received.purity_ratio = GMS.karatRatio(k);
        updateGoldRecalc();
      };
    }

    ['wsl-gold-gross', 'wsl-gold-stones'].forEach(id => {
      const inp = $(id);
      if (inp) {
        inp.oninput = (e) => {
          if (id === 'wsl-gold-gross') {
            State.draft.payment.gold_received.weight_gross = numOr(e.target.value, 0);
          } else {
            State.draft.payment.gold_received.weight_stones = numOr(e.target.value, 0);
          }
          updateGoldRecalc();
        };
      }
    });

    /* Notes */
    const notesInput = $('wsl-invoice-notes');
    if (notesInput) {
      notesInput.oninput = (e) => { State.draft.notes = e.target.value; };
    }

    /* Item actions */
    root.querySelectorAll('[data-wsl-item-fee]').forEach(input => {
      input.oninput = () => {
        const idx = Number(input.dataset.wslItemFee);
        const item = State.draft.items[idx];
        if (item) {
          item.workmanship_per_gram = numOr(input.value, 0);
          recalcInvoiceTotals();
          updateSummaryOnly();
          /* Update row total display */
          const row = input.closest('tr');
          if (row) {
            const cells = row.querySelectorAll('td');
            if (cells[5]) {
              cells[5].innerHTML = moneyFmt(item.total_value);
            }
          }
        }
      };
    });

    root.querySelectorAll('[data-wsl-item-rm]').forEach(btn => {
      btn.onclick = () => {
        const idx = Number(btn.dataset.wslItemRm);
        State.draft.items.splice(idx, 1);
        refreshInvoiceForm();
      };
    });

    /* Initial recalcs */
    updateGoldRecalc();
  }

  function updateSummaryOnly() {
    const host = document.getElementById('wsl-summary-host');
    if (!host) return;
    recalcInvoiceTotals();
    host.innerHTML = renderInvoiceSummary();
    window.lucide?.createIcons();
  }

  function updateGoldRecalc() {
    const d = State.draft;
    if (!d) return;

    const gr = d.payment.gold_received;
    const purity = gr.purity_ratio || GMS.karatRatio(gr.karat);
    const net = Math.max(0, (Number(gr.weight_gross) || 0) - (Number(gr.weight_stones) || 0));
    const pure = round(net * purity, 4);
    const scrapPrice = getScrapBuyPrice();
    const value = round(pure * scrapPrice, 2);

    gr.weight_net = round(net, 3);
    gr.weight_pure = pure;
    gr.value_at_scrap = value;

    /* Update readonly displays */
    const netEl = document.getElementById('wsl-gold-net');
    if (netEl) netEl.value = net.toFixed(3);

    const pureEl = document.getElementById('wsl-gold-pure');
    if (pureEl) pureEl.value = pure.toFixed(3);

    const valEl = document.getElementById('wsl-gold-value');
    if (valEl) valEl.value = moneyFmt(value) + ' ج.م';

    updateSummaryOnly();
  }

  /* ─────────────────────────────────────────────────────────────────
     Item Picker Modal
     ───────────────────────────────────────────────────────────────── */
  function openItemPicker() {
    const inv = State.inventory.filter(i => i.status === 'IN_STOCK');

    const selectedSkus = new Set(State.draft.items.map(i => i.sku));
    const available = inv.filter(i => !selectedSkus.has(i.sku));

    const host = document.createElement('div');

    GMS.Modal.open({
      title: 'اختيار المشغولات من المخزون',
      icon: 'gem',
      size: 'xl',
      body: `
        <div class="search-wrap" style="margin-bottom:14px">
          <i data-lucide="search"></i>
          <input id="wsl-picker-search"
                 placeholder="بحث بكود التاج، التصنيف…"
                 autocomplete="off">
        </div>

        <div id="wsl-picker-list"
             style="max-height:440px;overflow-y:auto;
                    border:1px solid var(--border);border-radius:11px">
          ${renderPickerList(available)}
        </div>
      `,
      footer: `
        <button class="btn" data-close type="button">إغلاق</button>
        <span class="chip info" id="wsl-picker-count" style="margin-inline-end:auto">
          ${intFmt(available.length)} قطعة متوفرة
        </span>
      `,
      onMount: (el, close) => {
        const searchInput = el.querySelector('#wsl-picker-search');
        const listHost = el.querySelector('#wsl-picker-list');

        const bindList = () => {
          listHost.querySelectorAll('[data-pick-sku]').forEach(row => {
            row.onclick = () => {
              const sku = row.dataset.pickSku;
              addItemToInvoice(sku);
              close();
              refreshInvoiceForm();
            };
          });
        };

        bindList();

        if (searchInput) {
          searchInput.oninput = (e) => {
            const q = e.target.value.toLowerCase().trim();
            const filtered = !q ? available : available.filter(i =>
              (i.sku || '').toLowerCase().includes(q) ||
              (i.category || '').toLowerCase().includes(q) ||
              (i.manufacturer_name || '').toLowerCase().includes(q)
            );
            listHost.innerHTML = renderPickerList(filtered);
            window.lucide?.createIcons();
            bindList();
          };
          setTimeout(() => searchInput.focus(), 150);
        }
      },
    });
  }

  function renderPickerList(items) {
    if (!items.length) {
      return `
        <div class="empty" style="padding:40px 20px">
          <i data-lucide="package-x"></i>
          <p>لا توجد قطع متوفرة</p>
        </div>
      `;
    }

    return items.slice(0, 500).map(item => {
      const isCustom = item.is_custom_karat === true || item.custom_karat != null;
      const price24 = getPrice24();
      const pure = Number(item.pure_weight || 0);
      const goldValue = round(pure * price24, 2);
      const saleRate = Number(item.workmanship_per_gram || 0);

      return `
        <div data-pick-sku="${esc(item.sku)}"
             style="display:grid;grid-template-columns:auto 1fr auto;
                    gap:12px;align-items:center;padding:11px 14px;
                    border-bottom:1px solid var(--border);cursor:pointer;
                    transition:background .15s">
          <div style="width:36px;height:36px;border-radius:10px;
                      background:var(--gold-soft);display:grid;
                      place-items:center;color:var(--warn);flex-shrink:0">
            <i data-lucide="gem" style="width:17px;height:17px"></i>
          </div>
          <div style="min-width:0">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">
              <span class="mono" style="font-weight:800;font-size:12.5px">
                ${esc(item.sku)}
              </span>
              ${isCustom
                ? `<span class="karat-badge custom-karat-badge" style="font-size:9.5px">
                     ${item.custom_karat}
                   </span>`
                : `<span class="karat-badge" data-k="${item.karat}" style="font-size:9.5px">
                     ${item.karat}K
                   </span>`}
            </div>
            <div style="font-size:10.5px;color:var(--muted);font-weight:700">
              ${esc(item.category || '—')} ·
              صافي ${gramFmt(item.net_weight)} جم ·
              بندق ${gramFmt(pure)} جم ·
              مصنعية ${moneyFmt(saleRate)} ج.م
            </div>
          </div>
          <div style="text-align:end">
            <div class="mono" style="font-size:13px;font-weight:900;
                        color:var(--primary)">
              ${moneyFmt(goldValue)}
            </div>
            <div style="font-size:9.5px;color:var(--muted);font-weight:700">
              قيمة الذهب
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  function addItemToInvoice(sku) {
    const item = State.inventory.find(i => i.sku === sku);
    if (!item) return;

    const d = State.draft;
    if (d.items.find(i => i.sku === sku)) {
      return GMS.Toast.warn('الصنف مُضاف مسبقاً');
    }

    const purity = Number(item.purity_ratio) || GMS.karatRatio(item.karat);
    const net = Number(item.net_weight || 0);
    const pure = round(net * purity, 4);
    const price24 = getPrice24();
    const goldValue = round(pure * price24, 2);
    const saleRate = Number(item.workmanship_per_gram || 0);
    const makeValue = round(net * saleRate, 2);

    d.items.push({
      sku: item.sku,
      inventory_id: item.id,
      category: item.category,
      karat: item.karat,
      custom_karat: item.custom_karat || null,
      is_custom_karat: item.is_custom_karat === true || item.custom_karat != null,
      purity_ratio: purity,
      weight_gross: Number(item.weight_grams || 0),
      weight_stones: Number(item.stone_weight || 0),
      net_weight: net,
      pure_weight: pure,
      workmanship_per_gram: saleRate,
      workmanship_value: makeValue,
      gold_value: goldValue,
      total_value: round(goldValue + makeValue, 2),
      branch_id: item.branch_id,
    });

    GMS.Beep?.info?.();
    recalcInvoiceTotals();
  }

  /* ═════════════════════════════════════════════════════════════════════
     §16 · SAVE INVOICE
     ═════════════════════════════════════════════════════════════════════ */

  async function saveInvoice(root, closeFn) {
    const d = State.draft;

    /* Validation */
    if (!d.recipient.name && !d.recipient.id) {
      GMS.Beep?.error?.();
      return GMS.Toast.err('الطرف المستلم مطلوب');
    }

    if (!d.items.length) {
      GMS.Beep?.error?.();
      return GMS.Toast.err('يجب إضافة قطعة واحدة على الأقل');
    }

    const totals = computeInvoiceTotals();

    /* Determine status based on payment */
    const paidCash = Number(d.payment.cash_paid || 0);
    const paidGold = Number(d.payment.gold_received?.value_at_scrap || 0);
    const remaining = totals.grand_total - paidCash - paidGold;

    let status = 'CONFIRMED';
    if (d.payment.mode === 'credit') status = 'CONFIRMED';
    else if (remaining <= 0.01) status = 'PAID';
    else if (paidCash > 0 || paidGold > 0) status = 'PARTIAL';

    const saveBtn = root.querySelector('#wsl-save');
    const originalHTML = saveBtn?.innerHTML;
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = `<i data-lucide="loader-circle"></i> جارٍ الحفظ…`;
      window.lucide?.createIcons();
    }

    try {
      const now = new Date().toISOString();
      const modePrefix = d.mode === 'wholesale' ? 'WS'
                       : d.mode === 'inter_branch' ? 'IB'
                       : 'RT';
      const invoiceNo = generateInvoiceNo(modePrefix);

      const sourceBranch = getBranches().find(b => b.id === d.branch_id);
      const recipientType = getRecipientType(d.recipient.type);

      const invoice = {
        id: GMS.uid(),
        invoice_no: invoiceNo,
        mode: d.mode,
        status,

        recipient: {
          type: d.recipient.type,
          type_label: recipientType.label,
          id: d.recipient.id,
          name: d.recipient.name || 'طرف غير محدد',
          phone: d.recipient.phone || '',
        },

        items: d.items.slice(),
        totals: {
          item_count: totals.item_count,
          total_gross: round(d.items.reduce((a, i) => a + Number(i.weight_gross || 0), 0), 3),
          total_net: totals.total_net,
          total_pure: totals.total_pure,
          total_gold_value: totals.total_gold_value,
          total_workmanship: totals.total_workmanship,
          discount_pct: d.discountPct,
          discount_amount: totals.discount_amount,
          grand_total: totals.grand_total,
        },

        payment: {
          mode: d.payment.mode,
          cash_paid: paidCash,
          gold_received: d.payment.gold_received ? { ...d.payment.gold_received } : null,
          cash_due: Math.max(0, round(remaining, 2)),
          gold_due_pure: 0,
          paid_at: (paidCash > 0 || paidGold > 0) ? now : null,
        },

        notes: d.notes || '',
        branch_id: d.branch_id,
        branch_name: sourceBranch?.name || '—',
        created_at: now,
        created_by: getActiveUserName(),
        created_by_id: GMS.Auth?.user?.id || null,
      };

      /* 1 · Save locally */
      const saved = await CacheDB.save(STORE_INVOICES, invoice);
      if (!saved) throw new Error('فشل الحفظ المحلي');

      /* 2 · Update inventory — mark items as SOLD/TRANSFERRED */
      const newStatus = d.mode === 'inter_branch' ? 'TRANSFERRED' : 'SOLD';
      for (const item of invoice.items) {
        if (!item.inventory_id) continue;
        try {
          if (GMS.IDB) {
            const existing = await GMS.IDB.get(item.inventory_id);
            if (existing) {
              existing.status = newStatus;
              existing.updated_at = now;
              existing.current_branch_id = d.recipient.type === 'branch'
                ? d.recipient.id
                : existing.branch_id;
              await GMS.IDB.put(existing);
            }
          }
        } catch (e) {
          console.warn('[WSL.saveInvoice] IDB update failed:', e);
        }
      }

      /* 3 · Supabase */
      if (GMS.Supabase?.isReady?.()) {
        try {
          const client = GMS.Supabase.get();
          await client.from('wholesale_invoices').insert({
            invoice_no: invoice.invoice_no,
            mode: invoice.mode,
            status: invoice.status,
            recipient_type: invoice.recipient.type,
            recipient_id: invoice.recipient.id,
            recipient_name: invoice.recipient.name,
            recipient_phone: invoice.recipient.phone,
            items: invoice.items,
            totals: invoice.totals,
            payment: invoice.payment,
            notes: invoice.notes,
            branch_id: invoice.branch_id,
            created_at: now,
          });
        } catch (e) {
          console.warn('[WSL.saveInvoice] Supabase failed:', e);
          /* Queue for later */
          if (GMS.IDB?.queueAdd) {
            try {
              await GMS.IDB.queueAdd({
                id: 'ws-inv-' + invoice.id,
                type: 'wholesale_invoice_create',
                payload: invoice,
                created_at: now,
              });
            } catch (_) {}
          }
        }
      }

      /* 4 · Ledger entry — dual */
      try {
        await recordLedgerEntry(invoice);
      } catch (e) {
        console.warn('[WSL.saveInvoice] Ledger failed:', e);
      }

      /* 5 · Audit */
      if (GMS.Audit) {
        try {
          await GMS.Audit.log(
            'CREATE',
            'wholesale_invoice',
            invoice.id,
            `فاتورة جملة ${invoice.invoice_no} — ${invoice.recipient.name} · ${moneyFmt(invoice.totals.grand_total)} ج.م`,
            {
              invoice_no: invoice.invoice_no,
              mode: invoice.mode,
              items_count: invoice.items.length,
              total_pure: invoice.totals.total_pure,
              grand_total: invoice.totals.grand_total,
              payment_mode: invoice.payment.mode,
            }
          );
        } catch (_) {}
      }

      /* 6 · Realtime */
      if (GMS.Realtime) {
        try { GMS.Realtime.emit('wholesale_invoices', 'INSERT', invoice); } catch (_) {}
      }

      /* 7 · Success */
      State.invoices.unshift(invoice);
      computeKPIs();

      GMS.Beep?.complete?.();
      GMS.Toast.ok(
        `تم حفظ الفاتورة ${invoice.invoice_no}`,
        `${invoice.recipient.name} · ${moneyFmt(invoice.totals.grand_total)} ج.م`
      );

      if (typeof closeFn === 'function') closeFn();

      /* 8 · Offer print */
      setTimeout(() => {
        GMS.Confirm.ask(
          'هل تريد طباعة الفاتورة؟',
          { title: 'طباعة', okText: 'طباعة', cancelText: 'لاحقاً', icon: 'printer' }
        ).then(shouldPrint => {
          if (shouldPrint) printInvoice(invoice.id);
        });
      }, 400);

      window.App.navigateTo('wholesale');

    } catch (e) {
      console.error('[WSL.saveInvoice]', e);
      GMS.Beep?.error?.();
      GMS.Toast.err('فشل حفظ الفاتورة', e.message);

      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalHtml || '<i data-lucide="save"></i> إعادة المحاولة';
        window.lucide?.createIcons();
      }
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §17 · LEDGER INTEGRATION
     ═════════════════════════════════════════════════════════════════════ */

  async function recordLedgerEntry(invoice) {
    try {
      const now = new Date().toISOString();
      const entryNo = generateInvoiceNo('LG');

      const cashDelta = Number(invoice.payment.cash_paid || 0);
      const goldDelta = -Number(invoice.totals.total_pure || 0); /* يخرج من الخزنة */

      const entries = [];

      /* Main entry — ذهب + نقد */
      entries.push({
        id: GMS.uid(),
        entry_no: entryNo,
        entry_date: now,
        created_at: now,
        entry_type: invoice.mode === 'inter_branch' ? 'gold_settlement' : 'sale',
        type: invoice.mode === 'inter_branch' ? 'gold_settlement' : 'sale',
        cash_delta: cashDelta,
        gold_delta: goldDelta,
        description: `${invoice.mode === 'wholesale' ? 'بيع جملة' : invoice.mode === 'inter_branch' ? 'تحويل فرع' : 'بيع'} — ${invoice.recipient.name} (${invoice.invoice_no})`,
        reference_no: invoice.invoice_no,
        entity_type: invoice.recipient.type,
        entity_id: invoice.recipient.id,
        entity_name: invoice.recipient.name,
        branch_id: invoice.branch_id,
        created_by: invoice.created_by,
        linked_invoice_id: invoice.id,
      });

      /* If gold exchange — add entry for received gold */
      if (invoice.payment.gold_received && invoice.payment.gold_received.weight_pure > 0) {
        entries.push({
          id: GMS.uid(),
          entry_no: entryNo + '-G',
          entry_date: now,
          created_at: now,
          entry_type: 'gold_received',
          type: 'gold_received',
          cash_delta: 0,
          gold_delta: Number(invoice.payment.gold_received.weight_pure),
          gold_karat: invoice.payment.gold_received.karat,
          gold_net_weight: invoice.payment.gold_received.weight_net,
          gold_pure_weight: invoice.payment.gold_received.weight_pure,
          description: `ذهب خام مُستلم — ${invoice.recipient.name}`,
          reference_no: invoice.invoice_no,
          entity_type: invoice.recipient.type,
          entity_id: invoice.recipient.id,
          entity_name: invoice.recipient.name,
          branch_id: invoice.branch_id,
          created_by: invoice.created_by,
          linked_invoice_id: invoice.id,
        });
      }

      /* Save entries to accounting ledger */
      for (const entry of entries) {
        try {
          /* Try GMS.Accounting.CacheDB if available */
          if (window.AccountingView?.CacheDB?.save) {
            await window.AccountingView.CacheDB.save('ledger', entry);
          } else {
            /* Fallback — direct localStorage */
            const ledgerKey = 'gms.acc.ledger';
            const existing = JSON.parse(localStorage.getItem(ledgerKey) || '[]');
            existing.unshift(entry);
            localStorage.setItem(ledgerKey, JSON.stringify(existing.slice(0, 5000)));
          }
        } catch (e) {
          console.warn('[WSL.recordLedgerEntry] Save failed:', e);
        }
      }

      console.log(`[WSL] Ledger entries recorded: ${entries.length}`);
      return entries;

    } catch (e) {
      console.error('[WSL.recordLedgerEntry]', e);
      throw e;
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §18 · BRANCH TRANSFER MODAL
     ═════════════════════════════════════════════════════════════════════ */

  function initTransferDraft() {
    const branches = getBranches();
    const myBranch = getActiveBranchId();

    State.draft = {
      from_branch_id: myBranch,
      to_branch_id: '',
      items: [],
      notes: '',
      courier: '',
      expected_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      _branches: branches,
    };
  }

  function openTransferModal() {
    initTransferDraft();

    GMS.Modal.open({
      title: 'أمر تحويل بين الفروع',
      icon: 'arrow-right-left',
      size: 'xl',
      body: `<div id="wsl-trf-form-host">${renderTransferForm()}</div>`,
      footer: `
        <button class="btn" data-close type="button">إلغاء</button>
        <button class="btn btn-primary btn-lg" id="wsl-trf-save" type="button">
          <i data-lucide="save"></i> حفظ أمر التحويل
        </button>
      `,
      onMount: (el, close) => {
        bindTransferForm(el);
        el.querySelector('#wsl-trf-save').onclick = () => saveTransfer(el, close);
      },
    });
  }

  function renderTransferForm() {
    const d = State.draft;
    if (!d) return '';

    const branches = getBranches();

    return `
      <!-- Section 1: Branches -->
      <div style="padding:16px 18px;background:var(--info-bg);border-radius:12px;
                  border:1px solid color-mix(in srgb,var(--info) 30%,var(--border));
                  margin-bottom:16px">
        <div style="font-size:11px;font-weight:800;color:var(--info);
                    text-transform:uppercase;letter-spacing:.4px;
                    margin-bottom:12px;display:flex;align-items:center;gap:6px">
          <i data-lucide="arrow-right-left" style="width:12px;height:12px"></i>
          مسار التحويل
        </div>

        <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:14px;
                    align-items:end">
          <div class="field">
            <label>من فرع <span class="req">*</span></label>
            <select id="wsl-trf-from">
              ${branches.map(b => `
                <option value="${b.id}" ${d.from_branch_id === b.id ? 'selected' : ''}>
                  ${esc(b.name)}
                </option>
              `).join('')}
            </select>
          </div>

          <div style="padding-bottom:8px;color:var(--info);font-weight:900">
            <i data-lucide="arrow-left" style="width:24px;height:24px"></i>
          </div>

          <div class="field">
            <label>إلى فرع <span class="req">*</span></label>
            <select id="wsl-trf-to">
              <option value="">— اختر —</option>
              ${branches
                .filter(b => b.id !== d.from_branch_id)
                .map(b => `
                  <option value="${b.id}" ${d.to_branch_id === b.id ? 'selected' : ''}>
                    ${esc(b.name)}
                  </option>
                `).join('')}
            </select>
          </div>
        </div>

        <div class="grid-form" style="margin-top:12px;gap:11px">
          <div class="field">
            <label>اسم المندوب / الناقل</label>
            <input id="wsl-trf-courier"
                   placeholder="اسم الناقل…"
                   value="${esc(d.courier)}">
          </div>

          <div class="field">
            <label>التاريخ المتوقع للتسليم</label>
            <input type="date" id="wsl-trf-date"
                   value="${esc(d.expected_date)}">
          </div>
        </div>
      </div>

      <!-- Section 2: Items -->
      <div style="padding:16px 18px;background:var(--gold-soft);border-radius:12px;
                  border:1px solid color-mix(in srgb,var(--primary) 30%,var(--border));
                  margin-bottom:16px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
          <div style="width:32px;height:32px;border-radius:9px;
                      background:var(--gold-grad);display:grid;place-items:center;
                      color:#2a1f05;font-weight:900">
            <i data-lucide="package" style="width:16px;height:16px"></i>
          </div>
          <div style="flex:1">
            <div style="font-size:12.5px;font-weight:900;color:var(--warn)">
              قطع الشحنة (${d.items.length} قطعة)
            </div>
            <div style="font-size:10.5px;color:var(--muted);font-weight:600">
              اختر القطع من مخزون الفرع المُصدِر
            </div>
          </div>
          <button type="button" class="btn btn-primary btn-sm" id="wsl-trf-add">
            <i data-lucide="plus"></i> إضافة قطعة
          </button>
        </div>

        <div id="wsl-trf-items-host">
          ${renderTransferItemsList()}
        </div>
      </div>

      <!-- Section 3: Notes -->
      <div class="field">
        <label>ملاحظات الشحنة</label>
        <input id="wsl-trf-notes"
               placeholder="ملاحظات على الشحنة…"
               value="${esc(d.notes)}">
      </div>

      <!-- Summary -->
      <div id="wsl-trf-summary" style="margin-top:16px">
        ${renderTransferSummary()}
      </div>
    `;
  }

  function renderTransferItemsList() {
    const d = State.draft;
    if (!d || !d.items.length) {
      return `
        <div style="padding:30px 20px;text-align:center;
                    background:var(--surface);border-radius:10px;
                    border:1px dashed var(--border)">
          <i data-lucide="package"
             style="width:32px;height:32px;opacity:.3;
                    margin:0 auto 8px;display:block"></i>
          <div style="font-size:12.5px;font-weight:800;color:var(--text-2)">
            لا توجد قطع مُضافة
          </div>
        </div>
      `;
    }

    return `
      <div class="table-wrap" style="border-radius:10px;max-height:320px;
                  border:1px solid var(--border);background:var(--surface)">
        <table class="tbl" style="font-size:11.5px">
          <thead>
            <tr>
              <th>كود التاج</th>
              <th style="width:60px" class="col-c">عيار</th>
              <th style="width:90px" class="col-num">صافي (جم)</th>
              <th style="width:100px" class="col-num">بندق (جم)</th>
              <th style="width:110px" class="col-num">القيمة</th>
              <th style="width:50px" class="col-c">—</th>
            </tr>
          </thead>
          <tbody>
            ${d.items.map((item, idx) => {
              const isCustom = item.is_custom_karat === true || item.custom_karat != null;
              return `
                <tr>
                  <td class="mono" style="font-weight:800">${esc(item.sku)}</td>
                  <td class="col-c">
                    ${isCustom
                      ? `<span class="karat-badge custom-karat-badge" style="font-size:10px">
                           ${item.custom_karat}
                         </span>`
                      : `<span class="karat-badge" data-k="${item.karat}" style="font-size:10px">
                           ${item.karat}K
                         </span>`}
                  </td>
                  <td class="col-num">${gramFmt(item.net_weight)}</td>
                  <td class="col-num" style="color:var(--primary);font-weight:800">
                    ${gramFmt(item.pure_weight)}
                  </td>
                  <td class="col-num" style="font-weight:900">
                    ${moneyFmt(item.total_value)}
                  </td>
                  <td class="col-c">
                    <button class="row-act danger"
                            data-wsl-trf-rm="${idx}" type="button"
                            style="width:26px;height:26px">
                      <i data-lucide="x"></i>
                    </button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderTransferSummary() {
    const d = State.draft;
    if (!d) return '';

    const totals = computeTransferTotals();
    const fromBranch = getBranches().find(b => b.id === d.from_branch_id);
    const toBranch = getBranches().find(b => b.id === d.to_branch_id);

    return `
      <div style="padding:14px 16px;background:var(--info-bg);
                  border-radius:11px;
                  border:1px solid color-mix(in srgb,var(--info) 30%,var(--border))">
        <div style="font-size:11px;font-weight:800;color:var(--info);
                    text-transform:uppercase;letter-spacing:.4px;
                    margin-bottom:10px;display:flex;align-items:center;gap:6px">
          <i data-lucide="calculator" style="width:12px;height:12px"></i>
          ملخص الشحنة
        </div>

        <div class="calc-list">
          <div class="cl-row">
            <span class="k"><i data-lucide="arrow-left"></i> من</span>
            <span class="v" style="font-size:12.5px">
              ${esc(fromBranch?.name || '—')}
            </span>
          </div>
          <div class="cl-row">
            <span class="k"><i data-lucide="arrow-right"></i> إلى</span>
            <span class="v" style="font-size:12.5px">
              ${esc(toBranch?.name || '—')}
            </span>
          </div>
          <div class="cl-row">
            <span class="k"><i data-lucide="package"></i> عدد القطع</span>
            <span class="v">${totals.item_count}</span>
          </div>
          <div class="cl-row">
            <span class="k"><i data-lucide="scale"></i> الوزن الصافي</span>
            <span class="v">${gramFmt(totals.total_net)} جم</span>
          </div>
          <div class="cl-row hi">
            <span class="k"><i data-lucide="sparkles"></i> البندق 24K</span>
            <span class="v">${gramFmt(totals.total_pure)} جم</span>
          </div>
          <div class="cl-row">
            <span class="k"><i data-lucide="banknote"></i> القيمة التقديرية</span>
            <span class="v">${moneyFmt(totals.grand_total)} ج.م</span>
          </div>
        </div>
      </div>
    `;
  }

  function computeTransferTotals() {
    const d = State.draft;
    if (!d) return { item_count: 0, total_net: 0, total_pure: 0, grand_total: 0 };

    let net = 0, pure = 0, value = 0;
    d.items.forEach(i => {
      net += Number(i.net_weight || 0);
      pure += Number(i.pure_weight || 0);
      value += Number(i.total_value || 0);
    });

    return {
      item_count: d.items.length,
      total_net: round(net, 3),
      total_pure: round(pure, 4),
      grand_total: round(value, 2),
    };
  }

  function refreshTransferForm() {
    const host = document.getElementById('wsl-trf-form-host');
    if (!host) return;
    host.innerHTML = renderTransferForm();
    window.lucide?.createIcons();
    bindTransferForm(document);
  }

  function bindTransferForm(root) {
    const $ = (id) => root.querySelector('#' + id);

    const fromSel = $('wsl-trf-from');
    if (fromSel) {
      fromSel.onchange = (e) => {
        State.draft.from_branch_id = e.target.value;
        State.draft.to_branch_id = '';
        State.draft.items = [];
        refreshTransferForm();
      };
    }

    const toSel = $('wsl-trf-to');
    if (toSel) {
      toSel.onchange = (e) => {
        State.draft.to_branch_id = e.target.value;
        updateTransferSummaryOnly();
      };
    }

    const courier = $('wsl-trf-courier');
    if (courier) courier.oninput = (e) => { State.draft.courier = e.target.value; };

    const dateEl = $('wsl-trf-date');
    if (dateEl) dateEl.onchange = (e) => { State.draft.expected_date = e.target.value; };

    const notesEl = $('wsl-trf-notes');
    if (notesEl) notesEl.oninput = (e) => { State.draft.notes = e.target.value; };

    const addBtn = $('wsl-trf-add');
    if (addBtn) addBtn.onclick = () => openTransferItemPicker();

    root.querySelectorAll('[data-wsl-trf-rm]').forEach(btn => {
      btn.onclick = () => {
        const idx = Number(btn.dataset.wslTrfRm);
        State.draft.items.splice(idx, 1);
        refreshTransferForm();
      };
    });
  }

  function updateTransferSummaryOnly() {
    const host = document.getElementById('wsl-trf-summary');
    if (!host) return;
    host.innerHTML = renderTransferSummary();
    window.lucide?.createIcons();
  }

  function openTransferItemPicker() {
    const sourceBranch = State.draft.from_branch_id;
    const inv = State.inventory.filter(i =>
      i.status === 'IN_STOCK' &&
      (!sourceBranch || i.branch_id === sourceBranch)
    );

    const selectedSkus = new Set(State.draft.items.map(i => i.sku));
    const available = inv.filter(i => !selectedSkus.has(i.sku));

    GMS.Modal.open({
      title: 'اختيار القطع للتحويل',
      icon: 'package',
      size: 'xl',
      body: `
        <div class="search-wrap" style="margin-bottom:14px">
          <i data-lucide="search"></i>
          <input id="wsl-trf-picker-search"
                 placeholder="بحث بكود التاج…"
                 autocomplete="off">
        </div>
        <div id="wsl-trf-picker-list"
             style="max-height:440px;overflow-y:auto;
                    border:1px solid var(--border);border-radius:11px">
          ${renderPickerList(available)}
        </div>
      `,
      footer: `
        <button class="btn" data-close type="button">إغلاق</button>
        <span class="chip info" style="margin-inline-end:auto">
          ${intFmt(available.length)} قطعة متوفرة
        </span>
      `,
      onMount: (el, close) => {
        const searchInput = el.querySelector('#wsl-trf-picker-search');
        const listHost = el.querySelector('#wsl-trf-picker-list');

        const bindList = () => {
          listHost.querySelectorAll('[data-pick-sku]').forEach(row => {
            row.onclick = () => {
              const sku = row.dataset.pickSku;
              addItemToTransfer(sku);
              close();
              refreshTransferForm();
            };
          });
        };

        bindList();

        if (searchInput) {
          searchInput.oninput = (e) => {
            const q = e.target.value.toLowerCase().trim();
            const filtered = !q ? available : available.filter(i =>
              (i.sku || '').toLowerCase().includes(q) ||
              (i.category || '').toLowerCase().includes(q)
            );
            listHost.innerHTML = renderPickerList(filtered);
            window.lucide?.createIcons();
            bindList();
          };
        }
      },
    });
  }

  function addItemToTransfer(sku) {
    const item = State.inventory.find(i => i.sku === sku);
    if (!item) return;

    const d = State.draft;
    if (d.items.find(i => i.sku === sku)) {
      return GMS.Toast.warn('الصنف مُضاف مسبقاً');
    }

    const purity = Number(item.purity_ratio) || GMS.karatRatio(item.karat);
    const net = Number(item.net_weight || 0);
    const pure = round(net * purity, 4);
    const price24 = getPrice24();
    const goldValue = round(pure * price24, 2);

    d.items.push({
      sku: item.sku,
      inventory_id: item.id,
      category: item.category,
      karat: item.karat,
      custom_karat: item.custom_karat || null,
      is_custom_karat: item.is_custom_karat === true || item.custom_karat != null,
      purity_ratio: purity,
      net_weight: net,
      pure_weight: pure,
      workmanship_per_gram: Number(item.workmanship_per_gram || 0),
      gold_value: goldValue,
      total_value: goldValue,
      from_branch_id: d.from_branch_id,
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §19 · SAVE TRANSFER
     ═════════════════════════════════════════════════════════════════════ */

  async function saveTransfer(root, closeFn) {
    const d = State.draft;

    if (!d.to_branch_id) {
      GMS.Beep?.error?.();
      return GMS.Toast.err('الفرع المستقبِل مطلوب');
    }

    if (d.from_branch_id === d.to_branch_id) {
      GMS.Beep?.error?.();
      return GMS.Toast.err('لا يمكن التحويل لنفس الفرع');
    }

    if (!d.items.length) {
      GMS.Beep?.error?.();
      return GMS.Toast.err('يجب إضافة قطعة واحدة على الأقل');
    }

    const saveBtn = root.querySelector('#wsl-trf-save');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = `<i data-lucide="loader-circle"></i> جارٍ الحفظ…`;
      window.lucide?.createIcons();
    }

    try {
      const now = new Date().toISOString();
      const transferNo = generateInvoiceNo('TRF');
      const totals = computeTransferTotals();

      const fromBranch = getBranches().find(b => b.id === d.from_branch_id);
      const toBranch = getBranches().find(b => b.id === d.to_branch_id);

      const transfer = {
        id: GMS.uid(),
        transfer_no: transferNo,
        status: 'PENDING',

        from_branch_id: d.from_branch_id,
        from_branch_name: fromBranch?.name || '—',
        to_branch_id: d.to_branch_id,
        to_branch_name: toBranch?.name || '—',

        items: d.items.slice(),
        totals: {
          item_count: totals.item_count,
          total_net: totals.total_net,
          total_pure: totals.total_pure,
          grand_total: totals.grand_total,
        },

        courier: d.courier || '',
        expected_date: d.expected_date,
        notes: d.notes || '',

        manifest: {
          sent_by: getActiveUserName(),
          sent_at: null,
          received_by: null,
          received_at: null,
        },

        created_at: now,
        created_by: getActiveUserName(),
        created_by_id: GMS.Auth?.user?.id || null,
      };

      /* 1 · Save */
      const saved = await CacheDB.save(STORE_TRANSFERS, transfer);
      if (!saved) throw new Error('فشل الحفظ المحلي');

      /* 2 · Supabase */
      if (GMS.Supabase?.isReady?.()) {
        try {
          await GMS.Supabase.get().from('branch_transfers').insert({
            transfer_no: transfer.transfer_no,
            status: transfer.status,
            from_branch_id: transfer.from_branch_id,
            to_branch_id: transfer.to_branch_id,
            items: transfer.items,
            totals: transfer.totals,
            courier: transfer.courier,
            expected_date: transfer.expected_date,
            notes: transfer.notes,
            created_at: now,
          });
        } catch (e) {
          console.warn('[WSL.saveTransfer] Supabase failed:', e);
        }
      }

      /* 3 · Audit */
      if (GMS.Audit) {
        try {
          await GMS.Audit.log(
            'CREATE',
            'branch_transfer',
            transfer.id,
            `أمر تحويل ${transfer.transfer_no}: ${transfer.from_branch_name} ← ${transfer.to_branch_name}`,
            {
              transfer_no: transfer.transfer_no,
              from_branch: transfer.from_branch_id,
              to_branch: transfer.to_branch_id,
              items_count: transfer.items.length,
              total_pure: transfer.totals.total_pure,
            }
          );
        } catch (_) {}
      }

      /* 4 · Realtime */
      if (GMS.Realtime) {
        try { GMS.Realtime.emit('branch_transfers', 'INSERT', transfer); } catch (_) {}
      }

      State.transfers.unshift(transfer);
      computeKPIs();

      GMS.Beep?.complete?.();
      GMS.Toast.ok(
        `تم إنشاء أمر التحويل ${transfer.transfer_no}`,
        `${transfer.from_branch_name} ← ${transfer.to_branch_name} · ${transfer.items.length} قطعة`
      );

      if (typeof closeFn === 'function') closeFn();

      /* 5 · Print manifest */
      setTimeout(() => {
        GMS.Confirm.ask(
          'هل تريد طباعة إذن التوريد (Transfer Manifest)؟',
          { title: 'طباعة', okText: 'طباعة', cancelText: 'لاحقاً', icon: 'printer' }
        ).then(shouldPrint => {
          if (shouldPrint) printTransferManifest(transfer.id);
        });
      }, 400);

      window.App.navigateTo('wholesale');

    } catch (e) {
      console.error('[WSL.saveTransfer]', e);
      GMS.Beep?.error?.();
      GMS.Toast.err('فشل حفظ أمر التحويل', e.message);

      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = `<i data-lucide="save"></i> إعادة المحاولة`;
        window.lucide?.createIcons();
      }
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §20 · DETAILS MODALS
     ═════════════════════════════════════════════════════════════════════ */

  function openInvoiceDetails(invoiceId) {
    try {
      const invoice = State.invoices.find(i => i.id === invoiceId);
      if (!invoice) return GMS.Toast.warn('لم يتم العثور على الفاتورة');

      const status = getInvoiceStatus(invoice.status);
      const mode = getSupplyMode(invoice.mode);
      const payment = getPaymentMode(invoice.payment?.mode);

      GMS.Modal.open({
        title: `تفاصيل الفاتورة — ${invoice.invoice_no}`,
        icon: 'factory',
        size: 'xl',
        body: `
          <div style="display:flex;align-items:center;gap:12px;
                      padding:14px 16px;background:var(--surface-2);
                      border-radius:12px;margin-bottom:16px">
            <div style="width:44px;height:44px;border-radius:12px;
                        display:grid;place-items:center;flex-shrink:0;
                        background:var(--${mode.color}-bg);
                        color:var(--${mode.color})">
              <i data-lucide="${mode.icon}" style="width:20px;height:20px"></i>
            </div>
            <div style="flex:1">
              <div style="font-weight:900;font-size:15px">${mode.label}</div>
              <div style="font-size:11.5px;color:var(--muted);font-weight:700;
                          margin-top:3px">
                ${dateTimeAr(invoice.created_at)} · ${timeAgo(invoice.created_at)}
              </div>
            </div>
            <span class="pill ${status.cls}">
              <i data-lucide="${status.icon}" style="width:10px;height:10px"></i>
              ${status.label}
            </span>
          </div>

          <div class="calc-list" style="margin-bottom:14px">
            <div class="cl-row">
              <span class="k"><i data-lucide="user"></i> الطرف</span>
              <span class="v" style="font-size:12.5px">${esc(invoice.recipient.name)}</span>
            </div>
            ${invoice.recipient.phone ? `
              <div class="cl-row">
                <span class="k"><i data-lucide="phone"></i> الهاتف</span>
                <span class="v mono" style="font-size:12.5px">${esc(invoice.recipient.phone)}</span>
              </div>
            ` : ''}
            <div class="cl-row">
              <span class="k"><i data-lucide="wallet"></i> طريقة التسوية</span>
              <span class="v" style="color:var(--${payment.color});font-size:12.5px">
                ${payment.label}
              </span>
            </div>
          </div>

          <div style="font-size:11px;font-weight:800;color:var(--muted);
                      text-transform:uppercase;letter-spacing:.4px;
                      margin-bottom:9px">
            القطع (${invoice.items.length})
          </div>

          <div class="table-wrap" style="max-height:300px;margin-bottom:14px">
            <table class="tbl" style="font-size:11.5px">
              <thead>
                <tr>
                  <th>كود التاج</th>
                  <th style="width:60px" class="col-c">عيار</th>
                  <th style="width:80px" class="col-num">صافي</th>
                  <th style="width:80px" class="col-num">بندق</th>
                  <th style="width:90px" class="col-num">مصنعية/جم</th>
                  <th style="width:100px" class="col-num">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                ${invoice.items.map(item => {
                  const isCustom = item.is_custom_karat === true || item.custom_karat != null;
                  return `
                    <tr>
                      <td class="mono" style="font-weight:800">${esc(item.sku)}</td>
                      <td class="col-c">
                        ${isCustom
                          ? `<span class="karat-badge custom-karat-badge" style="font-size:10px">${item.custom_karat}</span>`
                          : `<span class="karat-badge" data-k="${item.karat}" style="font-size:10px">${item.karat}K</span>`}
                      </td>
                      <td class="col-num">${gramFmt(item.net_weight)}</td>
                      <td class="col-num" style="color:var(--primary)">${gramFmt(item.pure_weight)}</td>
                      <td class="col-num">${moneyFmt(item.workmanship_per_gram)}</td>
                      <td class="col-num" style="font-weight:800">
                        ${moneyFmt(item.total_value)}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>

          <div class="calc-list">
            <div class="cl-row">
              <span class="k"><i data-lucide="coins"></i> قيمة الذهب</span>
              <span class="v">${moneyFmt(invoice.totals.total_gold_value)} ج.م</span>
            </div>
            <div class="cl-row">
              <span class="k"><i data-lucide="hammer"></i> إجمالي المصنعية</span>
              <span class="v">${moneyFmt(invoice.totals.total_workmanship)} ج.م</span>
            </div>
            ${invoice.totals.discount_amount > 0 ? `
              <div class="cl-row">
                <span class="k" style="color:var(--warn)">خصم</span>
                <span class="v" style="color:var(--warn)">
                  − ${moneyFmt(invoice.totals.discount_amount)} ج.م
                </span>
              </div>
            ` : ''}
            <div class="cl-row hi">
              <span class="k"><i data-lucide="banknote"></i> الإجمالي</span>
              <span class="v">${moneyFmt(invoice.totals.grand_total)} ج.م</span>
            </div>
            ${invoice.payment.cash_paid > 0 ? `
              <div class="cl-row">
                <span class="k">مدفوع نقداً</span>
                <span class="v" style="color:var(--success)">
                  ${moneyFmt(invoice.payment.cash_paid)} ج.م
                </span>
              </div>
            ` : ''}
            ${invoice.payment.gold_received?.weight_pure > 0 ? `
              <div class="cl-row">
                <span class="k">ذهب مستلم</span>
                <span class="v" style="color:var(--warn)">
                  ${gramFmt(invoice.payment.gold_received.weight_pure)} جم
                </span>
              </div>
            ` : ''}
            ${invoice.payment.cash_due > 0 ? `
              <div class="cl-row hi">
                <span class="k"><i data-lucide="alert-circle"></i> متبقي</span>
                <span class="v" style="color:var(--danger)">
                  ${moneyFmt(invoice.payment.cash_due)} ج.م
                </span>
              </div>
            ` : ''}
          </div>

          ${invoice.notes ? `
            <div style="margin-top:14px;padding:12px 14px;
                        background:var(--info-bg);border-radius:10px;
                        border-inline-start:3px solid var(--info)">
              <div style="font-size:10.5px;font-weight:800;color:var(--info);
                          text-transform:uppercase;margin-bottom:5px">ملاحظات</div>
              <div style="font-size:12.5px;font-weight:600">
                ${esc(invoice.notes)}
              </div>
            </div>
          ` : ''}
        `,
        footer: `
          <button class="btn" data-close>إغلاق</button>
          <button class="btn btn-primary" id="wsl-inv-print" type="button">
            <i data-lucide="printer"></i> طباعة
          </button>
        `,
        onMount: (el, close) => {
          el.querySelector('#wsl-inv-print').onclick = () => {
            close();
            printInvoice(invoice.id);
          };
        },
      });
    } catch (e) {
      console.error('[WSL.openInvoiceDetails]', e);
      GMS.Toast.err('فشل عرض التفاصيل', e.message);
    }
  }

  function openTransferDetails(transferId) {
    try {
      const trf = State.transfers.find(t => t.id === transferId);
      if (!trf) return GMS.Toast.warn('لم يتم العثور على الأمر');

      const status = getTransferStatus(trf.status);

      GMS.Modal.open({
        title: `تفاصيل أمر التحويل — ${trf.transfer_no}`,
        icon: 'arrow-right-left',
        size: 'xl',
        body: `
          <div style="display:flex;align-items:center;gap:12px;
                      padding:14px 16px;background:var(--info-bg);
                      border-radius:12px;margin-bottom:16px">
            <div style="width:44px;height:44px;border-radius:12px;
                        display:grid;place-items:center;flex-shrink:0;
                        background:var(--${status.color}-bg);
                        color:var(--${status.color})">
              <i data-lucide="${status.icon}" style="width:20px;height:20px"></i>
            </div>
            <div style="flex:1">
              <div style="font-weight:900;font-size:15px">
                ${esc(trf.from_branch_name)}
                <span style="color:var(--muted);margin:0 8px">←</span>
                ${esc(trf.to_branch_name)}
              </div>
              <div style="font-size:11.5px;color:var(--muted);font-weight:700;
                          margin-top:3px">
                ${dateTimeAr(trf.created_at)} · ${timeAgo(trf.created_at)}
              </div>
            </div>
            <span class="pill ${status.cls}">
              <i data-lucide="${status.icon}" style="width:10px;height:10px"></i>
              ${status.label}
            </span>
          </div>

          ${trf.courier || trf.expected_date ? `
            <div class="calc-list" style="margin-bottom:14px">
              ${trf.courier ? `
                <div class="cl-row">
                  <span class="k"><i data-lucide="user"></i> الناقل</span>
                  <span class="v" style="font-size:12.5px">${esc(trf.courier)}</span>
                </div>
              ` : ''}
              ${trf.expected_date ? `
                <div class="cl-row">
                  <span class="k"><i data-lucide="calendar"></i> تاريخ التسليم المتوقع</span>
                  <span class="v" style="font-size:12.5px">${esc(trf.expected_date)}</span>
                </div>
              ` : ''}
            </div>
          ` : ''}

          <div style="font-size:11px;font-weight:800;color:var(--muted);
                      text-transform:uppercase;letter-spacing:.4px;
                      margin-bottom:9px">
            القطع (${trf.items.length})
          </div>

          <div class="table-wrap" style="max-height:300px;margin-bottom:14px">
            <table class="tbl" style="font-size:11.5px">
              <thead>
                <tr>
                  <th>كود التاج</th>
                  <th style="width:60px" class="col-c">عيار</th>
                  <th style="width:90px" class="col-num">صافي</th>
                  <th style="width:100px" class="col-num">بندق</th>
                  <th style="width:120px" class="col-num">القيمة</th>
                </tr>
              </thead>
              <tbody>
                ${trf.items.map(item => {
                  const isCustom = item.is_custom_karat === true || item.custom_karat != null;
                  return `
                    <tr>
                      <td class="mono" style="font-weight:800">${esc(item.sku)}</td>
                      <td class="col-c">
                        ${isCustom
                          ? `<span class="karat-badge custom-karat-badge" style="font-size:10px">${item.custom_karat}</span>`
                          : `<span class="karat-badge" data-k="${item.karat}" style="font-size:10px">${item.karat}K</span>`}
                      </td>
                      <td class="col-num">${gramFmt(item.net_weight)}</td>
                      <td class="col-num" style="color:var(--primary)">${gramFmt(item.pure_weight)}</td>
                      <td class="col-num" style="font-weight:800">${moneyFmt(item.total_value)}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>

          <div class="calc-list">
            <div class="cl-row">
              <span class="k">عدد القطع</span>
              <span class="v">${trf.totals.item_count}</span>
            </div>
            <div class="cl-row">
              <span class="k">الوزن الصافي</span>
              <span class="v">${gramFmt(trf.totals.total_net)} جم</span>
            </div>
            <div class="cl-row hi">
              <span class="k"><i data-lucide="sparkles"></i> البندق 24K</span>
              <span class="v">${gramFmt(trf.totals.total_pure)} جم</span>
            </div>
          </div>

          ${trf.notes ? `
            <div style="margin-top:14px;padding:12px 14px;
                        background:var(--info-bg);border-radius:10px;
                        border-inline-start:3px solid var(--info)">
              <div style="font-size:10.5px;font-weight:800;color:var(--info);
                          text-transform:uppercase;margin-bottom:5px">ملاحظات</div>
              <div style="font-size:12.5px;font-weight:600">${esc(trf.notes)}</div>
            </div>
          ` : ''}
        `,
        footer: `
          <button class="btn" data-close>إغلاق</button>
          ${trf.status === 'PENDING' ? `
            <button class="btn btn-info" id="wsl-trf-ship" type="button">
              <i data-lucide="truck"></i> إرسال
            </button>
          ` : ''}
          ${trf.status === 'IN_TRANSIT' ? `
            <button class="btn btn-success" id="wsl-trf-receive" type="button">
              <i data-lucide="check-circle-2"></i> تأكيد الاستلام
            </button>
          ` : ''}
          <button class="btn btn-primary" id="wsl-trf-print" type="button">
            <i data-lucide="printer"></i> طباعة إذن التوريد
          </button>
        `,
        onMount: (el, close) => {
          const shipBtn = el.querySelector('#wsl-trf-ship');
          if (shipBtn) {
            shipBtn.onclick = async () => {
              close();
              await updateTransferStatus(trf.id, 'IN_TRANSIT');
            };
          }

          const recvBtn = el.querySelector('#wsl-trf-receive');
          if (recvBtn) {
            recvBtn.onclick = async () => {
              close();
              await receiveTransfer(trf.id);
            };
          }

          el.querySelector('#wsl-trf-print').onclick = () => {
            close();
            printTransferManifest(trf.id);
          };
        },
      });
    } catch (e) {
      console.error('[WSL.openTransferDetails]', e);
      GMS.Toast.err('فشل عرض التفاصيل', e.message);
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §21 · TRANSFER WORKFLOW ACTIONS
     ═════════════════════════════════════════════════════════════════════ */

  async function updateTransferStatus(transferId, newStatus) {
    try {
      const trf = State.transfers.find(t => t.id === transferId);
      if (!trf) return;

      const now = new Date().toISOString();
      trf.status = newStatus;

      if (newStatus === 'IN_TRANSIT') {
        trf.manifest.sent_at = now;
        trf.manifest.sent_by = getActiveUserName();
      }

      await CacheDB.save(STORE_TRANSFERS, trf);

      if (GMS.Supabase?.isReady?.()) {
        try {
          await GMS.Supabase.get()
            .from('branch_transfers')
            .update({ status: newStatus, manifest: trf.manifest })
            .eq('transfer_no', trf.transfer_no);
        } catch (e) {
          console.warn('[WSL.updateTransferStatus] Supabase failed:', e);
        }
      }

      if (GMS.Audit) {
        try {
          await GMS.Audit.log(
            'UPDATE',
            'branch_transfer',
            trf.id,
            `تحديث حالة التحويل ${trf.transfer_no}: ${newStatus}`,
            { transfer_no: trf.transfer_no, new_status: newStatus }
          );
        } catch (_) {}
      }

      GMS.Beep?.success?.();
      GMS.Toast.ok('تم التحديث', `الحالة الجديدة: ${getTransferStatus(newStatus).label}`);

      await loadTransfers();
      computeKPIs();
      window.App.navigateTo('wholesale');

    } catch (e) {
      console.error('[WSL.updateTransferStatus]', e);
      GMS.Toast.err('فشل التحديث', e.message);
    }
  }

  async function receiveTransfer(transferId) {
    try {
      const trf = State.transfers.find(t => t.id === transferId);
      if (!trf) return;

      const ok = await GMS.Confirm.ask(
        `سيتم تأكيد استلام ${trf.items.length} قطعة في فرع "${trf.to_branch_name}".\n` +
        `سيتم نقل ملكية القطع وتحديث المخزون.`,
        { title: 'تأكيد الاستلام', okText: 'استلام', danger: false, icon: 'package-check' }
      );

      if (!ok) return;

      const now = new Date().toISOString();

      /* 1 · Update each item's branch */
      for (const item of trf.items) {
        if (!item.inventory_id) continue;
        try {
          if (GMS.IDB) {
            const existing = await GMS.IDB.get(item.inventory_id);
            if (existing) {
              existing.branch_id = trf.to_branch_id;
              existing.branch_name = trf.to_branch_name;
              existing.status = 'IN_STOCK';
              existing.updated_at = now;
              await GMS.IDB.put(existing);
            }
          }
        } catch (e) {
          console.warn('[WSL.receiveTransfer] IDB update failed:', e);
        }
      }

      /* 2 · Update transfer status */
      trf.status = 'RECEIVED';
      trf.manifest.received_at = now;
      trf.manifest.received_by = getActiveUserName();
      await CacheDB.save(STORE_TRANSFERS, trf);

      /* 3 · Supabase */
      if (GMS.Supabase?.isReady?.()) {
        try {
          const client = GMS.Supabase.get();
          await client.from('branch_transfers')
            .update({
              status: 'RECEIVED',
              manifest: trf.manifest,
            })
            .eq('transfer_no', trf.transfer_no);

          /* Update items branch in Supabase */
          for (const item of trf.items) {
            if (!item.inventory_id) continue;
            try {
              await client.from('inventory')
                .update({ branch_id: trf.to_branch_id })
                .eq('id', item.inventory_id);
            } catch (_) {}
          }
        } catch (e) {
          console.warn('[WSL.receiveTransfer] Supabase failed:', e);
        }
      }

      /* 4 · Audit */
      if (GMS.Audit) {
        try {
          await GMS.Audit.log(
            'APPROVE',
            'branch_transfer',
            trf.id,
            `استلام ${trf.transfer_no} في فرع ${trf.to_branch_name}`,
            {
              transfer_no: trf.transfer_no,
              to_branch: trf.to_branch_id,
              items_count: trf.items.length,
            }
          );
        } catch (_) {}
      }

      GMS.Beep?.complete?.();
      GMS.Toast.ok('تم الاستلام بنجاح', `${trf.items.length} قطعة في ${trf.to_branch_name}`);

      await loadTransfers();
      computeKPIs();
      window.App.navigateTo('wholesale');

    } catch (e) {
      console.error('[WSL.receiveTransfer]', e);
      GMS.Toast.err('فشل الاستلام', e.message);
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §22 · PRINT FUNCTIONS
     ═════════════════════════════════════════════════════════════════════ */

  function printInvoice(invoiceId) {
    try {
      const invoice = State.invoices.find(i => i.id === invoiceId);
      if (!invoice) return;

      const root = document.getElementById('print-root');
      if (!root) return;

      const mode = getSupplyMode(invoice.mode);
      const price24 = getPrice24();

      root.innerHTML = `
        <div style="font-family:'Cairo',sans-serif;direction:rtl;color:#000;
                    padding:6mm">
          <div style="text-align:center;border-bottom:2px solid #000;
                      padding-bottom:4mm;margin-bottom:5mm">
            <h1 style="font-size:16pt;font-weight:900;margin:0 0 2mm">
              ${esc(GMS.APP_CONFIG.NAME_AR)}
            </h1>
            <p style="margin:1mm 0;font-size:10pt;color:#333">
              ${esc(mode.label)} — فاتورة توريد
            </p>
          </div>

          <div style="text-align:center;font-size:14pt;font-weight:900;
                      background:#f1e8d0;padding:3mm;border:1.5px solid #000;
                      margin-bottom:5mm;letter-spacing:.5px">
            ${esc(invoice.invoice_no)}
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:4mm;
                      font-size:10pt;margin-bottom:4mm">
            <div>
              <div style="margin-bottom:1.5mm">
                <b>التاريخ:</b> ${dateTimeAr(invoice.created_at)}
              </div>
              <div style="margin-bottom:1.5mm">
                <b>الفرع المُصدِر:</b> ${esc(invoice.branch_name || '—')}
              </div>
              <div>
                <b>البائع:</b> ${esc(invoice.created_by || '—')}
              </div>
            </div>
            <div style="text-align:left">
              <div style="margin-bottom:1.5mm">
                <b>الطرف:</b> ${esc(invoice.recipient.name)}
              </div>
              ${invoice.recipient.phone ? `
                <div style="margin-bottom:1.5mm">
                  <b>الهاتف:</b> ${esc(invoice.recipient.phone)}
                </div>
              ` : ''}
              <div>
                <b>النوع:</b> ${esc(invoice.recipient.type_label || '—')}
              </div>
            </div>
          </div>

          <hr style="border:none;border-top:1px dashed #666;margin:4mm 0">

          <table style="width:100%;border-collapse:collapse;font-size:9pt;
                        margin-bottom:4mm">
            <thead>
              <tr style="background:#e8e8e8">
                <th style="padding:2mm;border:1px solid #666;text-align:right">
                  كود التاج
                </th>
                <th style="padding:2mm;border:1px solid #666;text-align:center;width:15mm">
                  عيار
                </th>
                <th style="padding:2mm;border:1px solid #666;text-align:left;width:22mm">
                  صافي (جم)
                </th>
                <th style="padding:2mm;border:1px solid #666;text-align:left;width:22mm">
                  بندق (جم)
                </th>
                <th style="padding:2mm;border:1px solid #666;text-align:left;width:22mm">
                  مصنعية/جم
                </th>
                <th style="padding:2mm;border:1px solid #666;text-align:left;width:25mm">
                  الإجمالي
                </th>
              </tr>
            </thead>
            <tbody>
              ${invoice.items.map(item => {
                const isCustom = item.is_custom_karat === true || item.custom_karat != null;
                const karatLabel = isCustom ? `${item.custom_karat}` : `${item.karat}K`;
                return `
                  <tr>
                    <td style="padding:2mm;border:1px solid #666;
                               font-family:monospace;font-size:8.5pt">
                      ${esc(item.sku)}
                    </td>
                    <td style="padding:2mm;border:1px solid #666;
                               text-align:center">
                      ${karatLabel}
                    </td>
                    <td style="padding:2mm;border:1px solid #666;
                               text-align:left;font-variant-numeric:tabular-nums">
                      ${gramFmt(item.net_weight)}
                    </td>
                    <td style="padding:2mm;border:1px solid #666;
                               text-align:left;font-variant-numeric:tabular-nums">
                      ${gramFmt(item.pure_weight)}
                    </td>
                    <td style="padding:2mm;border:1px solid #666;
                               text-align:left;font-variant-numeric:tabular-nums">
                      ${moneyFmt(item.workmanship_per_gram)}
                    </td>
                    <td style="padding:2mm;border:1px solid #666;
                               text-align:left;font-variant-numeric:tabular-nums;
                               font-weight:900">
                      ${moneyFmt(item.total_value)}
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6mm;
                      font-size:10pt;margin-bottom:4mm">
            <div style="border:1px solid #666;padding:3mm;border-radius:2mm">
              <div style="margin-bottom:1.5mm">
                <b>عدد القطع:</b> ${invoice.totals.item_count}
              </div>
              <div style="margin-bottom:1.5mm">
                <b>الوزن الصافي:</b> ${gramFmt(invoice.totals.total_net)} جم
              </div>
              <div>
                <b>البندق 24K:</b>
                <span style="font-weight:900">
                  ${gramFmt(invoice.totals.total_pure)} جم
                </span>
              </div>
            </div>

            <div style="border:1.5px solid #000;padding:3mm;border-radius:2mm;
                        background:#f1e8d0">
              <div style="display:flex;justify-content:space-between;
                          margin-bottom:1.5mm">
                <span>قيمة الذهب:</span>
                <span style="font-variant-numeric:tabular-nums">
                  ${moneyFmt(invoice.totals.total_gold_value)} ج.م
                </span>
              </div>
              <div style="display:flex;justify-content:space-between;
                          margin-bottom:1.5mm">
                <span>المصنعية:</span>
                <span style="font-variant-numeric:tabular-nums">
                  ${moneyFmt(invoice.totals.total_workmanship)} ج.م
                </span>
              </div>
              ${invoice.totals.discount_amount > 0 ? `
                <div style="display:flex;justify-content:space-between;
                            margin-bottom:1.5mm">
                  <span>خصم (${invoice.totals.discount_pct}%):</span>
                  <span style="font-variant-numeric:tabular-nums">
                    − ${moneyFmt(invoice.totals.discount_amount)} ج.م
                  </span>
                </div>
              ` : ''}
              <div style="display:flex;justify-content:space-between;
                          border-top:1.5px solid #000;padding-top:2mm;
                          margin-top:2mm;font-size:12pt;font-weight:900">
                <span>الإجمالي:</span>
                <span style="font-variant-numeric:tabular-nums">
                  ${moneyFmt(invoice.totals.grand_total)} ج.م
                </span>
              </div>
            </div>
          </div>

          <div style="border:1px dashed #666;padding:3mm;border-radius:2mm;
                      font-size:9.5pt;margin-bottom:4mm">
            <div style="font-weight:900;margin-bottom:2mm">تفاصيل التسوية:</div>
            <div style="margin-bottom:1mm">
              <b>طريقة الدفع:</b>
              ${esc(getPaymentMode(invoice.payment.mode).label)}
            </div>
            ${invoice.payment.cash_paid > 0 ? `
              <div style="margin-bottom:1mm">
                <b>مدفوع نقداً:</b>
                ${moneyFmt(invoice.payment.cash_paid)} ج.م
              </div>
            ` : ''}
            ${invoice.payment.gold_received?.weight_pure > 0 ? `
              <div style="margin-bottom:1mm">
                <b>ذهب خام مُستلم:</b>
                ${gramFmt(invoice.payment.gold_received.weight_pure)} جم
                (${invoice.payment.gold_received.karat}K)
              </div>
            ` : ''}
            ${invoice.payment.cash_due > 0 ? `
              <div style="font-weight:900;color:#b3261e">
                <b>المتبقي على الحساب:</b>
                ${moneyFmt(invoice.payment.cash_due)} ج.م
              </div>
            ` : ''}
          </div>

          ${invoice.notes ? `
            <div style="margin-bottom:4mm;padding:2mm;background:#f5f5f5;
                        border-radius:1mm;font-size:9pt">
              <b>ملاحظات:</b> ${esc(invoice.notes)}
            </div>
          ` : ''}

          <div style="text-align:center;font-size:9pt;color:#555;
                      margin-top:6mm;padding-top:3mm;
                      border-top:1px dashed #666">
            سعر 24K المرجعي: ${moneyFmt(price24)} ج.م / جرام
            · شكراً لتعاملكم معنا
          </div>

          <div style="display:flex;justify-content:space-between;
                      margin-top:10mm;font-size:9.5pt">
            <div style="border-top:1px solid #000;padding-top:2mm;
                        min-width:35mm;text-align:center">
              توقيع المستلم
            </div>
            <div style="border-top:1px solid #000;padding-top:2mm;
                        min-width:35mm;text-align:center">
              توقيع البائع
            </div>
            <div style="border-top:1px solid #000;padding-top:2mm;
                        min-width:35mm;text-align:center">
              ختم الشركة
            </div>
          </div>
        </div>
      `;

      /* A4 page */
      const pageStyle = document.getElementById('gms-page-size-style');
      const original = pageStyle?.textContent || '';
      if (pageStyle) {
        pageStyle.textContent = `
          @media print {
            @page { size: A4 portrait; margin: 10mm; }
          }
        `;
      }

      setTimeout(() => {
        window.print();
        setTimeout(() => {
          if (pageStyle && original) pageStyle.textContent = original;
        }, 1200);
      }, 150);

    } catch (e) {
      console.error('[WSL.printInvoice]', e);
      GMS.Toast.err('فشل الطباعة', e.message);
    }
  }

  function printTransferManifest(transferId) {
    try {
      const trf = State.transfers.find(t => t.id === transferId);
      if (!trf) return;

      const root = document.getElementById('print-root');
      if (!root) return;

      root.innerHTML = `
        <div style="font-family:'Cairo',sans-serif;direction:rtl;color:#000;
                    padding:6mm">
          <div style="text-align:center;border-bottom:2px solid #000;
                      padding-bottom:4mm;margin-bottom:5mm">
            <h1 style="font-size:16pt;font-weight:900;margin:0 0 2mm">
              ${esc(GMS.APP_CONFIG.NAME_AR)}
            </h1>
            <p style="margin:1mm 0;font-size:11pt;color:#333">
              إذن توريد / Transfer Manifest
            </p>
          </div>

          <div style="text-align:center;font-size:14pt;font-weight:900;
                      background:#e6f6ee;padding:3mm;border:1.5px solid #000;
                      margin-bottom:5mm">
            ${esc(trf.transfer_no)}
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:4mm;
                      font-size:10pt;margin-bottom:4mm">
            <div style="border:1px solid #666;padding:3mm;border-radius:2mm">
              <div style="font-size:9pt;color:#666;font-weight:800;
                          margin-bottom:2mm">
                من فرع (المُصدِر)
              </div>
              <div style="font-size:12pt;font-weight:900">
                ${esc(trf.from_branch_name)}
              </div>
            </div>

            <div style="border:1px solid #666;padding:3mm;border-radius:2mm;
                        background:#e6f6ee">
              <div style="font-size:9pt;color:#666;font-weight:800;
                          margin-bottom:2mm">
                إلى فرع (المُستلِم)
              </div>
              <div style="font-size:12pt;font-weight:900">
                ${esc(trf.to_branch_name)}
              </div>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;
                      gap:3mm;font-size:9.5pt;margin-bottom:4mm">
            <div><b>التاريخ:</b> ${dateTimeAr(trf.created_at)}</div>
            ${trf.courier ? `<div><b>الناقل:</b> ${esc(trf.courier)}</div>` : '<div></div>'}
            ${trf.expected_date ? `<div><b>التسليم المتوقع:</b> ${esc(trf.expected_date)}</div>` : '<div></div>'}
          </div>

          <hr style="border:none;border-top:1px dashed #666;margin:4mm 0">

          <table style="width:100%;border-collapse:collapse;font-size:9pt;
                        margin-bottom:4mm">
            <thead>
              <tr style="background:#e8e8e8">
                <th style="padding:2mm;border:1px solid #666;text-align:right">
                  كود التاج
                </th>
                <th style="padding:2mm;border:1px solid #666;text-align:center;width:15mm">
                  عيار
                </th>
                <th style="padding:2mm;border:1px solid #666;text-align:left;width:25mm">
                  صافي (جم)
                </th>
                <th style="padding:2mm;border:1px solid #666;text-align:left;width:25mm">
                  بندق (جم)
                </th>
                <th style="padding:2mm;border:1px solid #666;text-align:left;width:30mm">
                  القيمة (ج.م)
                </th>
              </tr>
            </thead>
            <tbody>
              ${trf.items.map(item => {
                const isCustom = item.is_custom_karat === true || item.custom_karat != null;
                const karatLabel = isCustom ? `${item.custom_karat}` : `${item.karat}K`;
                return `
                  <tr>
                    <td style="padding:2mm;border:1px solid #666;
                               font-family:monospace;font-size:8.5pt">
                      ${esc(item.sku)}
                    </td>
                    <td style="padding:2mm;border:1px solid #666;
                               text-align:center">${karatLabel}</td>
                    <td style="padding:2mm;border:1px solid #666;
                               text-align:left;font-variant-numeric:tabular-nums">
                      ${gramFmt(item.net_weight)}
                    </td>
                    <td style="padding:2mm;border:1px solid #666;
                               text-align:left;font-variant-numeric:tabular-nums">
                      ${gramFmt(item.pure_weight)}
                    </td>
                    <td style="padding:2mm;border:1px solid #666;
                               text-align:left;font-variant-numeric:tabular-nums">
                      ${moneyFmt(item.total_value)}
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>

          <div style="border:1.5px solid #000;padding:3mm;border-radius:2mm;
                      background:#f1e8d0;font-size:11pt;margin-bottom:4mm">
            <div style="display:flex;justify-content:space-between;
                        margin-bottom:2mm">
              <span>عدد القطع:</span>
              <span style="font-weight:900">${trf.totals.item_count}</span>
            </div>
            <div style="display:flex;justify-content:space-between;
                        margin-bottom:2mm">
              <span>إجمالي الوزن الصافي:</span>
              <span style="font-weight:900;font-variant-numeric:tabular-nums">
                ${gramFmt(trf.totals.total_net)} جم
              </span>
            </div>
            <div style="display:flex;justify-content:space-between;
                        margin-bottom:2mm">
              <span>إجمالي البندق 24K:</span>
              <span style="font-weight:900;font-variant-numeric:tabular-nums">
                ${gramFmt(trf.totals.total_pure)} جم
              </span>
            </div>
            <div style="display:flex;justify-content:space-between;
                        border-top:1px solid #000;padding-top:2mm;
                        font-weight:900;font-size:12pt">
              <span>القيمة الإجمالية:</span>
              <span style="font-variant-numeric:tabular-nums">
                ${moneyFmt(trf.totals.grand_total)} ج.م
              </span>
            </div>
          </div>

          ${trf.notes ? `
            <div style="margin-bottom:4mm;padding:2.5mm;background:#f5f5f5;
                        border-radius:1mm;font-size:9pt">
              <b>ملاحظات:</b> ${esc(trf.notes)}
            </div>
          ` : ''}

          <div style="font-size:9.5pt;line-height:1.9;margin-bottom:6mm">
            <div>• جميع القطع المذكورة أعلاه تم تسليمها بحالتها كما هي مُبيَّنة.</div>
            <div>• يجب على الفرع المُستلِم فحص القطع وتأكيد الاستلام في النظام.</div>
            <div>• أي فرق في الوزن أو الحالة يجب الإبلاغ عنه فوراً.</div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;
                      gap:6mm;margin-top:10mm;font-size:9.5pt">
            <div style="border-top:1.5px solid #000;padding-top:3mm;
                        text-align:center">
              <div style="font-weight:900">المُسلِّم</div>
              <div style="font-size:8.5pt;color:#555;margin-top:1mm">
                ${esc(trf.manifest.sent_by || '—')}
              </div>
            </div>
            <div style="border-top:1.5px solid #000;padding-top:3mm;
                        text-align:center">
              <div style="font-weight:900">الناقل</div>
              <div style="font-size:8.5pt;color:#555;margin-top:1mm">
                ${esc(trf.courier || '—')}
              </div>
            </div>
            <div style="border-top:1.5px solid #000;padding-top:3mm;
                        text-align:center">
              <div style="font-weight:900">المُستلِم</div>
              <div style="font-size:8.5pt;color:#555;margin-top:1mm">
                ${esc(trf.manifest.received_by || '—')}
              </div>
            </div>
          </div>
        </div>
      `;

      const pageStyle = document.getElementById('gms-page-size-style');
      const original = pageStyle?.textContent || '';
      if (pageStyle) {
        pageStyle.textContent = `
          @media print {
            @page { size: A4 portrait; margin: 10mm; }
          }
        `;
      }

      setTimeout(() => {
        window.print();
        setTimeout(() => {
          if (pageStyle && original) pageStyle.textContent = original;
        }, 1200);
      }, 150);

    } catch (e) {
      console.error('[WSL.printTransferManifest]', e);
      GMS.Toast.err('فشل الطباعة', e.message);
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §23 · EXPORT TO EXCEL
     ═════════════════════════════════════════════════════════════════════ */

  function exportInvoices() {
    try {
      if (!window.XLSX) {
        return GMS.Toast.err('محرك Excel غير متاح');
      }

      const rows = filterInvoices();
      if (!rows.length) return GMS.Toast.warn('لا توجد بيانات');

      const data = rows.map(inv => ({
        'رقم الفاتورة': inv.invoice_no,
        'التاريخ': dateTimeAr(inv.created_at),
        'النمط': getSupplyMode(inv.mode).label,
        'الحالة': getInvoiceStatus(inv.status).label,
        'نوع الطرف': inv.recipient.type_label || inv.recipient.type,
        'الطرف': inv.recipient.name,
        'الهاتف': inv.recipient.phone,
        'عدد القطع': inv.totals.item_count,
        'الوزن الصافي (جم)': inv.totals.total_net,
        'البندق 24K (جم)': inv.totals.total_pure,
        'قيمة الذهب (ج.م)': inv.totals.total_gold_value,
        'المصنعية (ج.م)': inv.totals.total_workmanship,
        'خصم مصنعية (%)': inv.totals.discount_pct,
        'خصم (ج.م)': inv.totals.discount_amount,
        'الإجمالي (ج.م)': inv.totals.grand_total,
        'طريقة التسوية': getPaymentMode(inv.payment.mode).label,
        'مدفوع نقداً (ج.م)': inv.payment.cash_paid,
        'ذهب مستلم (جم)': inv.payment.gold_received?.weight_pure || 0,
        'متبقي (ج.م)': inv.payment.cash_due,
        'الفرع': inv.branch_name,
        'المستخدم': inv.created_by,
      }));

      const ws = XLSX.utils.json_to_sheet(data);
      ws['!cols'] = Array(21).fill({ wch: 16 });
      ws['!cols'][0] = { wch: 22 };
      ws['!cols'][5] = { wch: 24 };

      /* Summary sheet */
      const k = State.kpis;
      const summary = [
        ['ملخص فواتير الجملة'],
        ['تاريخ التصدير', new Date().toLocaleString('ar-EG')],
        [''],
        ['المؤشر', 'القيمة'],
        ['إجمالي الفواتير', k.totalInvoices],
        ['القيمة الإجمالية (ج.م)', k.totalWholesaleValue],
        ['بندق مُباع (جم)', k.totalWholesalePure],
        ['نقدي مُحصَّل (ج.م)', k.totalWholesaleCash],
        ['مديونيات نقدية (ج.م)', k.outstandingCash],
        ['ذهب مستحق (جم)', k.outstandingGold],
      ];

      const wsSummary = XLSX.utils.aoa_to_sheet(summary);
      wsSummary['!cols'] = [{ wch: 32 }, { wch: 20 }];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'فواتير الجملة');
      XLSX.utils.book_append_sheet(wb, wsSummary, 'الملخص');

      XLSX.writeFile(wb, `wholesale_invoices_${new Date().toISOString().slice(0, 10)}.xlsx`);
      GMS.Toast.ok(`تم تصدير ${rows.length} فاتورة`);

    } catch (e) {
      console.error('[WSL.exportInvoices]', e);
      GMS.Toast.err('فشل التصدير', e.message);
    }
  }

  function exportTransfers() {
    try {
      if (!window.XLSX) {
        return GMS.Toast.err('محرك Excel غير متاح');
      }

      const rows = filterTransfers();
      if (!rows.length) return GMS.Toast.warn('لا توجد بيانات');

      const data = rows.map(trf => ({
        'رقم الأمر': trf.transfer_no,
        'التاريخ': dateTimeAr(trf.created_at),
        'الحالة': getTransferStatus(trf.status).label,
        'من فرع': trf.from_branch_name,
        'إلى فرع': trf.to_branch_name,
        'عدد القطع': trf.totals.item_count,
        'الوزن الصافي (جم)': trf.totals.total_net,
        'البندق 24K (جم)': trf.totals.total_pure,
        'القيمة (ج.م)': trf.totals.grand_total,
        'الناقل': trf.courier,
        'تاريخ التسليم المتوقع': trf.expected_date,
        'المُرسِل': trf.manifest?.sent_by || '',
        'تاريخ الإرسال': trf.manifest?.sent_at ? dateTimeAr(trf.manifest.sent_at) : '',
        'المُستلِم': trf.manifest?.received_by || '',
        'تاريخ الاستلام': trf.manifest?.received_at ? dateTimeAr(trf.manifest.received_at) : '',
        'ملاحظات': trf.notes,
      }));

      const ws = XLSX.utils.json_to_sheet(data);
      ws['!cols'] = Array(16).fill({ wch: 18 });

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'أوامر التحويل');

      XLSX.writeFile(wb, `branch_transfers_${new Date().toISOString().slice(0, 10)}.xlsx`);
      GMS.Toast.ok(`تم تصدير ${rows.length} أمر`);

    } catch (e) {
      console.error('[WSL.exportTransfers]', e);
      GMS.Toast.err('فشل التصدير', e.message);
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §24 · REALTIME INTEGRATION
     ═════════════════════════════════════════════════════════════════════ */

  function bindRealtime() {
    if (!GMS.Realtime) return;

    const unsub = GMS.Realtime.on('event', (event) => {
      try {
        if (!event) return;
        if (GMS.Router?.currentId() !== 'wholesale') return;

        if (event.table === 'wholesale_invoices' && event.action === 'INSERT') {
          const exists = State.invoices.find(x => x.id === event.row?.id);
          if (!exists && event.row) {
            State.invoices.unshift(event.row);
            computeKPIs();
            refreshWholesaleTab();
          }
        }

        if (event.table === 'branch_transfers') {
          const idx = State.transfers.findIndex(x => x.id === event.row?.id);
          if (idx >= 0 && event.action === 'UPDATE') {
            State.transfers[idx] = { ...State.transfers[idx], ...event.row };
            computeKPIs();
            refreshTransfersTab();
          } else if (event.action === 'INSERT' && event.row) {
            State.transfers.unshift(event.row);
            computeKPIs();
            refreshTransfersTab();
          }
        }
      } catch (e) {
        console.warn('[WSL.realtime]', e);
      }
    });

    State.unsubscribers.push(unsub);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §25 · CLEANUP
     ═════════════════════════════════════════════════════════════════════ */

  function cleanup() {
    try {
      cleanupListeners();
    } catch (e) {
      console.warn('[WSL.cleanup]', e);
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §26 · VIEW REGISTRATION
     ═════════════════════════════════════════════════════════════════════ */
  GMS.Views = GMS.Views || {};

  GMS.Views.wholesale = {
    render,
    cleanup,
    state: State,

    load: async () => {
      await Promise.all([loadInvoices(), loadTransfers(), loadInventory()]);
      computeKPIs();
    },

    reload: async () => {
      await Promise.all([loadInvoices(), loadTransfers(), loadInventory()]);
      computeKPIs();
      await render(document.getElementById('page'));
    },

    /* Actions */
    openWholesaleModal,
    openTransferModal,
    openInvoiceDetails,
    openTransferDetails,

    /* Transfer workflow */
    updateTransferStatus,
    receiveTransfer,

    /* Print */
    printInvoice,
    printTransferManifest,

    /* Export */
    exportInvoices,
    exportTransfers,

    /* Constants */
    SUPPLY_MODES,
    INVOICE_STATUS,
    TRANSFER_STATUS,
    PAYMENT_MODES,
    RECIPIENT_TYPES,

    CacheDB,
  };

  /* ═════════════════════════════════════════════════════════════════════
     §27 · GLOBAL EXPORT
     ═════════════════════════════════════════════════════════════════════ */
  const WholesaleView = {
    render,
    cleanup,
    state: State,

    load: GMS.Views.wholesale.load,
    reload: GMS.Views.wholesale.reload,

    openWholesaleModal,
    openTransferModal,
    openInvoiceDetails,
    openTransferDetails,

    updateTransferStatus,
    receiveTransfer,

    printInvoice,
    printTransferManifest,

    exportInvoices,
    exportTransfers,

    SUPPLY_MODES,
    INVOICE_STATUS,
    TRANSFER_STATUS,
    PAYMENT_MODES,
    RECIPIENT_TYPES,

    CacheDB,
  };

  window.WholesaleView = WholesaleView;

  /* ═════════════════════════════════════════════════════════════════════
     §28 · LOADED CONFIRMATION
     ═════════════════════════════════════════════════════════════════════ */
  console.log(
    '%c🏭 Wholesale & Transfers View loaded',
    'color:#6b3fa0;font-weight:900;font-size:13px;padding:2px 6px;' +
    'background:linear-gradient(135deg,#e0d4f5,#6b3fa0);border-radius:4px;'
  );

  console.log(
    `%c📦 B2B Wholesale · Inter-Branch Transfers · Gold Exchange · Dual Ledger`,
    'color:#6b7a95;font-weight:700;font-size:11px;'
  );

  /* ═════════════════════════════════════════════════════════════════════
     ✅ js/27-views-wholesale.js — نهاية الملف
     ═════════════════════════════════════════════════════════════════════ */

})();