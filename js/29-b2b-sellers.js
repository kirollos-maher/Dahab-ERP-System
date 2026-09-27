/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ENTERPRISE — js/29-b2b-sellers.js
   نظام بياعي الجملة المستقلين + عملاء الجملة (Multi-Tenant B2B)
   ─────────────────────────────────────────────────────────────────────
   ✅ v1.2.0 — إضافات:
     • FIX #1: الرصيد الافتتاحي للعميل لا يُحسب مرتين
     • FIX #2: خزينة البياع لا تتضخم بحركات الرصيد الافتتاحي للعملاء
     • FIX #3: تصنيف الحركات (rep_open vs customer_open)
     • 🆕 NEW: قسم "المستحقات المتوقعة" (Receivables) منفصل عن الخزينة الفعلية
     • 🆕 NEW: قسم "الإجمالي المتوقع" (الخزينة + المستحقات)
     • 🆕 NEW: عرض تفصيلي لكل عميل مدين مع المبلغ
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const GMS = window.GMS = window.GMS || {};

  /* ═════════════════════════════════════════════════════════════════════
     §1 · CONSTANTS
     ═════════════════════════════════════════════════════════════════════ */
  const STORES = Object.freeze({
    REPS:         'sales_reps',
    CUSTOMERS:    'b2b_customers',
    LEDGERS:      'rep_ledgers',
    SETTLEMENTS:  'rep_settlements',
    INVOICES:     'wholesale_invoices',
  });

  const PREFIX = 'gms.b2b.';
  const MAX_ENTRIES = 3000;

  const LEDGER_TYPES = Object.freeze({
    invoice:          { key: 'invoice',          label: 'فاتورة جملة',    icon: 'receipt',       cashSign: +1, goldSign: -1, color: 'success' },
    invoice_credit:   { key: 'invoice_credit',   label: 'فاتورة آجلة',    icon: 'clock',         cashSign: 0,  goldSign: -1, color: 'warn' },
    cash_received:    { key: 'cash_received',    label: 'استلام نقدي',    icon: 'hand-coins',    cashSign: +1, goldSign: 0,  color: 'success' },
    cash_payment:     { key: 'cash_payment',     label: 'سداد نقدي',      icon: 'banknote',      cashSign: -1, goldSign: 0,  color: 'danger' },
    gold_received:    { key: 'gold_received',    label: 'استلام ذهب',     icon: 'package-plus',  cashSign: 0,  goldSign: +1, color: 'success' },
    gold_delivered:   { key: 'gold_delivered',   label: 'تسليم ذهب',      icon: 'package-minus', cashSign: 0,  goldSign: -1, color: 'danger' },
    adjustment:       { key: 'adjustment',       label: 'تسوية يدوية',    icon: 'sliders',       cashSign: +1, goldSign: +1, color: 'violet' },
    settlement:       { key: 'settlement',       label: 'تصفية مع المحل', icon: 'vault',         cashSign: -1, goldSign: -1, color: 'violet' },
    opening:          { key: 'opening',          label: 'رصيد افتتاحي',   icon: 'flag',          cashSign: +1, goldSign: +1, color: 'muted' },
  });

  const SETTLEMENT_STATUS = Object.freeze({
    DRAFT:    { key: 'DRAFT',    label: 'مسودة',           cls: 'pill-gray',   icon: 'file-edit',      color: 'muted' },
    PENDING:  { key: 'PENDING',  label: 'بانتظار الاعتماد', cls: 'pill-amber', icon: 'clock',          color: 'warn' },
    APPROVED: { key: 'APPROVED', label: 'معتمدة',          cls: 'pill-green',  icon: 'check-circle-2', color: 'success' },
    REJECTED: { key: 'REJECTED', label: 'مرفوضة',          cls: 'pill-red',    icon: 'x-circle',       color: 'danger' },
    CANCELLED:{ key: 'CANCELLED',label: 'ملغاة',           cls: 'pill-gray',   icon: 'ban',            color: 'muted' },
  });

  const DEFAULT_REP_TREASURY = {
    cash: 0,
    gold_pure: 0,
    gold_by_karat: { 24: 0, 22: 0, 21: 0, 18: 0, 14: 0 },
    custom_gold_pure: 0,
    custom_gold_net: 0,
  };

  /* ═════════════════════════════════════════════════════════════════════
     §2 · CacheDB
     ═════════════════════════════════════════════════════════════════════ */
  const CacheDB = {
    _key(store) { return PREFIX + store; },

    async getAll(store) {
      try {
        if (!store) return [];
        const key = this._key(store);

        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed;
          }
        } catch (_) {}

        if (GMS.IDB?.isOpen) {
          try {
            const row = await GMS.IDB.metaGet(key);
            if (Array.isArray(row)) return row;
          } catch (_) {}
        }

        return [];
      } catch (e) {
        console.warn(`[B2B.CacheDB.getAll:${store}]`, e);
        return [];
      }
    },

    async save(store, entry) {
      try {
        if (!store || !entry || typeof entry !== 'object') return false;

        const key = this._key(store);
        const existing = await this.getAll(store);
        const id = entry.id || (GMS.uid ? GMS.uid() : 'b2b-' + Date.now());
        entry.id = id;

        const idx = existing.findIndex(x => x.id === id);
        if (idx >= 0) existing[idx] = { ...existing[idx], ...entry, _updatedAt: Date.now() };
        else {
          entry._createdAt = Date.now();
          existing.unshift(entry);
        }

        const trimmed = existing.slice(0, MAX_ENTRIES);

        try {
          localStorage.setItem(key, JSON.stringify(trimmed));
        } catch (e) {
          console.warn('[B2B] Quota — trimming');
          try {
            localStorage.setItem(key, JSON.stringify(trimmed.slice(0, Math.floor(MAX_ENTRIES / 2))));
          } catch (_) {}
        }

        if (GMS.IDB?.isOpen) {
          try { await GMS.IDB.metaSet(key, trimmed.slice(0, 500)); } catch (_) {}
        }

        return true;
      } catch (e) {
        console.error(`[B2B.CacheDB.save:${store}]`, e);
        return false;
      }
    },

    async delete(store, id) {
      try {
        const key = this._key(store);
        const existing = await this.getAll(store);
        const filtered = existing.filter(x => x.id !== id);
        localStorage.setItem(key, JSON.stringify(filtered));
        return true;
      } catch (e) {
        console.warn(`[B2B.CacheDB.delete:${store}]`, e);
        return false;
      }
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §3 · STATE
     ═════════════════════════════════════════════════════════════════════ */
  const State = {
    activeTab: 'reps',

    reps: [],
    customers: [],
    ledgers: [],
    settlements: [],
    invoices: [],

    activeRepFilter: null,

    page: 1,
    pageSize: 25,

    filters: {
      search: '',
      status: '',
      repId: '',
    },

    kpis: {
      totalReps: 0,
      activeReps: 0,
      totalRepCash: 0,
      totalRepGold: 0,
      totalCustomers: 0,
      totalCustomerCash: 0,
      totalCustomerGold: 0,
      pendingSettlements: 0,
      approvedSettlementsValue: 0,
      /* 🆕 NEW */
      totalExpectedCash: 0,
      totalExpectedGold: 0,
    },

    draft: null,
    editingRep: null,
    editingCustomer: null,

    loading: false,
    initialized: false,
    unsubscribers: [],
    timers: { search: null },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §4 · HELPERS
     ═════════════════════════════════════════════════════════════════════ */
  const esc = (v) => GMS.esc ? GMS.esc(v) : String(v == null ? '' : v);
  const moneyFmt = (v) => GMS.moneyFmt ? GMS.moneyFmt(v) : Number(v || 0).toFixed(2);
  const gramFmt = (v) => GMS.gramFmt ? GMS.gramFmt(v) : Number(v || 0).toFixed(3);
  const intFmt = (v) => GMS.intFmt ? GMS.intFmt(v) : String(Math.round(Number(v) || 0));
  const round = (v, d = 2) => GMS.round ? GMS.round(v, d)
    : Math.round((Number(v) + Number.EPSILON) * Math.pow(10, d)) / Math.pow(10, d);
  const dateAr = (d) => { try { return GMS.dateAr ? GMS.dateAr(d) : '—'; } catch (_) { return '—'; } };
  const dateTimeAr = (d) => { try { return GMS.dateTimeAr ? GMS.dateTimeAr(d) : '—'; } catch (_) { return '—'; } };
  const timeAgo = (d) => { try { return GMS.timeAgo ? GMS.timeAgo(d) : '—'; } catch (_) { return '—'; } };
  const numOr = (v, f = 0) => { const n = parseFloat(v); return isFinite(n) ? n : f; };
  const uid = () => GMS.uid ? GMS.uid() : 'b2b-' + Date.now() + Math.random().toString(36).slice(2, 7);

  function getPrice24() {
    try {
      if (GMS.PriceManager?.current) {
        const p = GMS.PriceManager.current();
        if (p > 0) return p;
      }
      if (GMS.Cache?.getPrice) {
        const p = GMS.Cache.getPrice();
        if (p?.price_24) return Number(p.price_24);
      }
    } catch (_) {}
    return GMS.APP_CONFIG?.DEFAULT_PRICE_24 || 4500;
  }

  function currentUser() {
    return {
      id: GMS.Auth?.user?.id || null,
      name: GMS.Auth?.profile?.full_name || 'مستخدم',
      role: GMS.Auth?.profile?.role || 'GUEST',
      rep_id: GMS.Auth?.profile?.rep_id || null,
      branch_id: GMS.Auth?.profile?.branch_id || null,
    };
  }

  function isManager() {
    const r = currentUser().role;
    return r === 'SUPER_ADMIN' || r === 'BRANCH_MANAGER' || r === 'ACCOUNTANT';
  }

  function isRepRole() {
    return currentUser().role === 'B2B_REP';
  }

  function canAccessRep(repId) {
    if (isManager()) return true;
    if (isRepRole()) return currentUser().rep_id === repId;
    return false;
  }

  function getEffectiveRepId() {
    if (isRepRole()) return currentUser().rep_id;
    return State.activeRepFilter;
  }

  function cleanupListeners() {
    State.unsubscribers.forEach(fn => { try { fn(); } catch (_) {} });
    State.unsubscribers = [];
    clearTimeout(State.timers.search);
  }

  function generateRepCode() {
    const n = State.reps.length + 1;
    return `REP-${String(n).padStart(3, '0')}`;
  }

  function generateCustomerCode() {
    const n = State.customers.length + 1;
    return `B2C-${String(n).padStart(4, '0')}`;
  }

  function generateSettlementNo() {
    const d = new Date();
    const stamp = String(d.getFullYear()).slice(2) +
      String(d.getMonth() + 1).padStart(2, '0') +
      String(d.getDate()).padStart(2, '0') + '-' +
      String(d.getHours()).padStart(2, '0') +
      String(d.getMinutes()).padStart(2, '0');
    const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
    return `STL-${stamp}-${rand}`;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §5 · DATA LOADING
     ═════════════════════════════════════════════════════════════════════ */
  async function loadAll() {
    try {
      State.loading = true;
      const [reps, customers, ledgers, settlements, invoices] = await Promise.all([
        CacheDB.getAll(STORES.REPS),
        CacheDB.getAll(STORES.CUSTOMERS),
        CacheDB.getAll(STORES.LEDGERS),
        CacheDB.getAll(STORES.SETTLEMENTS),
        CacheDB.getAll(STORES.INVOICES),
      ]);

      State.reps = reps;
      State.customers = customers;
      State.ledgers = ledgers;
      State.settlements = settlements;
      State.invoices = invoices;

      if (isRepRole()) {
        State.activeRepFilter = currentUser().rep_id;
      }

      computeKPIs();
      return true;
    } catch (e) {
      console.error('[B2B.loadAll]', e);
      return false;
    } finally {
      State.loading = false;
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §6 · KPIs + TREASURY + RECEIVABLES
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * ✅ v1.2.0: حساب خزينة البياع الفعلية
   * - تستثني الرصيد الافتتاحي للعملاء (ديون)
   * - تشمل: rep_open + كل الحركات الفعلية
   */
  function computeRepTreasury(repId) {
    const treasury = JSON.parse(JSON.stringify(DEFAULT_REP_TREASURY));
    const repLedgers = State.ledgers.filter(l => l.rep_id === repId);

    repLedgers.forEach(entry => {
      const isCustomerOpening = entry.type === 'opening' && entry.customer_id;
      if (isCustomerOpening) return;
      if (entry.status === 'CANCELLED' || entry.is_cancelled) return;

      const cashDelta = numOr(entry.cash_delta, 0);
      const goldDelta = numOr(entry.gold_delta, 0);
      const karat = Number(entry.gold_karat || 0);
      const isCustom = entry.is_custom_karat === true || entry.custom_karat != null;
      const netWeight = numOr(entry.gold_net_weight, 0);

      treasury.cash += cashDelta;
      treasury.gold_pure += goldDelta;

      if (isCustom) {
        treasury.custom_gold_pure += goldDelta;
        treasury.custom_gold_net += netWeight;
      } else if (karat && treasury.gold_by_karat[karat] !== undefined) {
        treasury.gold_by_karat[karat] += netWeight;
      }
    });

    treasury.cash = round(treasury.cash, 2);
    treasury.gold_pure = round(treasury.gold_pure, 4);
    treasury.custom_gold_pure = round(treasury.custom_gold_pure, 4);
    treasury.custom_gold_net = round(treasury.custom_gold_net, 3);
    Object.keys(treasury.gold_by_karat).forEach(k => {
      treasury.gold_by_karat[k] = round(treasury.gold_by_karat[k], 3);
    });

    return treasury;
  }

  /**
   * ✅ v1.2.0: حساب رصيد العميل (من دفتر الأستاذ فقط)
   */
  function computeCustomerBalance(customerId) {
    const cust = State.customers.find(c => c.id === customerId);
    if (!cust) return { cash: 0, gold_pure: 0, by_karat: {}, custom_pure: 0 };

    let cash = 0;
    let goldPure = 0;
    const byKarat = { 24: 0, 22: 0, 21: 0, 18: 0, 14: 0 };
    let customPure = 0;

    const custLedgers = State.ledgers.filter(l => {
      if (l.customer_id !== customerId) return false;
      if (l.status === 'CANCELLED' || l.is_cancelled) return false;
      return true;
    });

    custLedgers.forEach(entry => {
      cash += numOr(entry.cash_delta, 0);
      goldPure += numOr(entry.gold_delta, 0);

      const karat = Number(entry.gold_karat || 0);
      const net = numOr(entry.gold_net_weight, 0);
      const isCustom = entry.is_custom_karat === true || entry.custom_karat != null;

      if (isCustom) customPure += numOr(entry.gold_delta, 0);
      else if (karat && byKarat[karat] !== undefined) byKarat[karat] += net;
    });

    return {
      cash: round(cash, 2),
      gold_pure: round(goldPure, 4),
      by_karat: byKarat,
      custom_pure: round(customPure, 4),
    };
  }

  /**
   * 🆕 v1.2.0: حساب المستحقات المتوقعة (Receivables) من عملاء البياع
   * ─────────────────────────────────────────────────────────────────
   * يجمع فقط المديونيات الموجبة (cash > 0 و gold_pure > 0)
   * أي: العملاء المدينون للبياع
   *
   * @returns {{
   *   totalCash: number,
   *   totalGoldPure: number,
   *   customers: Array<{id, name, code, cash, gold_pure}>,
   *   customersCount: number
   * }}
   */
  function computeRepReceivables(repId) {
    const repCustomers = State.customers.filter(c =>
      c.rep_id === repId && c.is_active !== false
    );

    let totalCash = 0;
    let totalGoldPure = 0;
    const debtors = [];

    repCustomers.forEach(cust => {
      const balance = computeCustomerBalance(cust.id);

      /* فقط المديونيات الموجبة (العميل مدين لنا) */
      const cashDebt = Math.max(0, balance.cash);
      const goldDebt = Math.max(0, balance.gold_pure);

      if (cashDebt > 0.01 || goldDebt > 0.0001) {
        totalCash += cashDebt;
        totalGoldPure += goldDebt;

        debtors.push({
          id: cust.id,
          code: cust.code,
          name: cust.name,
          phone: cust.phone,
          cash: round(cashDebt, 2),
          gold_pure: round(goldDebt, 4),
        });
      }
    });

    /* ترتيب حسب أكبر مديونية */
    debtors.sort((a, b) => b.cash - a.cash);

    return {
      totalCash: round(totalCash, 2),
      totalGoldPure: round(totalGoldPure, 4),
      customers: debtors,
      customersCount: debtors.length,
    };
  }

  /**
   * 🆕 v1.2.0: حساب الوضعية الكاملة للبياع
   * = الخزينة الفعلية + المستحقات المتوقعة
   */
  function computeRepFullPosition(repId) {
    const treasury = computeRepTreasury(repId);
    const receivables = computeRepReceivables(repId);
    const price24 = getPrice24();

    /* القيم بالجنيه */
    const treasuryCashValue = treasury.cash;
    const treasuryGoldValue = round(treasury.gold_pure * price24, 2);

    const receivablesCashValue = receivables.totalCash;
    const receivablesGoldValue = round(receivables.totalGoldPure * price24, 2);

    return {
      /* الخزينة الفعلية */
      treasury: {
        cash: treasury.cash,
        gold_pure: treasury.gold_pure,
        gold_value: treasuryGoldValue,
        total_value: round(treasuryCashValue + treasuryGoldValue, 2),
        gold_by_karat: treasury.gold_by_karat,
      },

      /* المستحقات المتوقعة */
      receivables: {
        cash: receivables.totalCash,
        gold_pure: receivables.totalGoldPure,
        gold_value: receivablesGoldValue,
        total_value: round(receivablesCashValue + receivablesGoldValue, 2),
        customersCount: receivables.customersCount,
        customers: receivables.customers,
      },

      /* الإجمالي المتوقع بعد التحصيل الكامل */
      expected: {
        cash: round(treasury.cash + receivables.totalCash, 2),
        gold_pure: round(treasury.gold_pure + receivables.totalGoldPure, 4),
        gold_value: round(treasuryGoldValue + receivablesGoldValue, 2),
        total_value: round(
          treasuryCashValue + treasuryGoldValue +
          receivablesCashValue + receivablesGoldValue,
          2
        ),
      },

      price24,
    };
  }

  function computeKPIs() {
    const reps = State.reps.filter(r => r.is_active !== false);
    let totalRepCash = 0;
    let totalRepGold = 0;
    let totalExpectedCash = 0;
    let totalExpectedGold = 0;

    reps.forEach(r => {
      const pos = computeRepFullPosition(r.id);
      totalRepCash += pos.treasury.cash;
      totalRepGold += pos.treasury.gold_pure;
      totalExpectedCash += pos.expected.cash;
      totalExpectedGold += pos.expected.gold_pure;
    });

    let custCash = 0;
    let custGold = 0;
    State.customers.forEach(c => {
      const b = computeCustomerBalance(c.id);
      custCash += b.cash;
      custGold += b.gold_pure;
    });

    const pending = State.settlements.filter(s => s.status === 'PENDING').length;
    const approvedValue = State.settlements
      .filter(s => s.status === 'APPROVED')
      .reduce((a, s) => a + numOr(s.cash_amount, 0), 0);

    State.kpis = {
      totalReps: State.reps.length,
      activeReps: reps.length,
      totalRepCash: round(totalRepCash, 2),
      totalRepGold: round(totalRepGold, 4),
      totalCustomers: State.customers.length,
      totalCustomerCash: round(custCash, 2),
      totalCustomerGold: round(custGold, 4),
      pendingSettlements: pending,
      approvedSettlementsValue: round(approvedValue, 2),
      /* 🆕 NEW */
      totalExpectedCash: round(totalExpectedCash, 2),
      totalExpectedGold: round(totalExpectedGold, 4),
    };

    return State.kpis;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §7 · REP LEDGER
     ═════════════════════════════════════════════════════════════════════ */
  async function addLedgerEntry(entry) {
    if (!entry || !entry.rep_id) {
      return { success: false, error: 'rep_id مطلوب' };
    }

    if (!canAccessRep(entry.rep_id) && !entry._system) {
      return { success: false, error: 'غير مصرح' };
    }

    let entryKind = entry.entry_kind || 'normal';
    if (entry.type === 'opening') {
      entryKind = entry.customer_id ? 'customer_open' : 'rep_open';
    }

    const fullEntry = {
      id: uid(),
      type: entry.type || 'adjustment',
      entry_kind: entryKind,
      created_at: new Date().toISOString(),
      created_by_id: currentUser().id,
      created_by: currentUser().name,
      ...entry,
    };

    const ok = await CacheDB.save(STORES.LEDGERS, fullEntry);
    if (!ok) return { success: false, error: 'فشل الحفظ' };

    State.ledgers.unshift(fullEntry);
    computeKPIs();

    if (GMS.Realtime) {
      try { GMS.Realtime.emit('rep_ledgers', 'INSERT', fullEntry); } catch (_) {}
    }

    return { success: true, entry: fullEntry };
  }

  async function recordInvoiceToLedger(invoice, repId) {
    if (!invoice || !repId) return null;

    const cashPaid = numOr(invoice.payment?.cash_paid, 0);
    const goldReceived = numOr(invoice.payment?.gold_received?.weight_pure, 0);

    await addLedgerEntry({
      rep_id: repId,
      customer_id: invoice.recipient?.id || null,
      customer_name: invoice.recipient?.name || '—',
      type: 'invoice',
      cash_delta: cashPaid,
      gold_delta: -numOr(invoice.totals?.total_pure, 0),
      gold_karat: null,
      gold_net_weight: -numOr(invoice.totals?.total_net, 0),
      description: `فاتورة جملة ${invoice.invoice_no} — ${invoice.recipient?.name || ''}`,
      reference_no: invoice.invoice_no,
      linked_invoice_id: invoice.id,
      _system: true,
    });

    if (goldReceived > 0 && invoice.payment?.gold_received) {
      const gr = invoice.payment.gold_received;
      await addLedgerEntry({
        rep_id: repId,
        customer_id: invoice.recipient?.id || null,
        type: 'gold_received',
        cash_delta: 0,
        gold_delta: goldReceived,
        gold_karat: gr.karat,
        gold_net_weight: numOr(gr.weight_net, 0),
        description: `ذهب خام مستلم من ${invoice.recipient?.name || ''}`,
        reference_no: invoice.invoice_no,
        linked_invoice_id: invoice.id,
        _system: true,
      });
    }

    return true;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §8 · REP CRUD
     ═════════════════════════════════════════════════════════════════════ */
  async function saveRep(rep) {
    if (!rep) return { success: false, error: 'بيانات مطلوبة' };

    if (!rep.name || rep.name.trim().length < 2) {
      return { success: false, error: 'الاسم مطلوب' };
    }

    const isNew = !rep.id;
    const payload = {
      id: rep.id || uid(),
      code: rep.code || generateRepCode(),
      name: rep.name.trim(),
      phone: (rep.phone || '').trim(),
      pin: rep.pin || null,
      branch_id: rep.branch_id || currentUser().branch_id || GMS.APP_CONFIG?.DEFAULT_BRANCH_ID || 'br-1',
      opening_cash: numOr(rep.opening_cash, 0),
      opening_gold_pure: numOr(rep.opening_gold_pure, 0),
      notes: (rep.notes || '').trim(),
      is_active: rep.is_active !== false,
      created_at: rep.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: currentUser().id,
    };

    const ok = await CacheDB.save(STORES.REPS, payload);
    if (!ok) return { success: false, error: 'فشل الحفظ' };

    if (isNew && (payload.opening_cash > 0 || payload.opening_gold_pure > 0)) {
      await addLedgerEntry({
        rep_id: payload.id,
        type: 'opening',
        entry_kind: 'rep_open',
        cash_delta: payload.opening_cash,
        gold_delta: payload.opening_gold_pure,
        description: 'رصيد افتتاحي للبياع',
        _system: true,
      });
    }

    const idx = State.reps.findIndex(r => r.id === payload.id);
    if (idx >= 0) State.reps[idx] = payload;
    else State.reps.unshift(payload);

    computeKPIs();

    if (GMS.Audit) {
      try {
        await GMS.Audit.log(
          isNew ? 'CREATE' : 'UPDATE',
          'sales_rep', payload.id,
          `${isNew ? 'أضاف' : 'عدّل'} بياع جملة: ${payload.name}`,
          { rep_code: payload.code, name: payload.name }
        );
      } catch (_) {}
    }

    if (GMS.Realtime) {
      try { GMS.Realtime.emit('sales_reps', isNew ? 'INSERT' : 'UPDATE', payload); } catch (_) {}
    }

    return { success: true, rep: payload };
  }

  async function deleteRep(repId) {
    const rep = State.reps.find(r => r.id === repId);
    if (!rep) return { success: false, error: 'غير موجود' };

    const hasLedger = State.ledgers.some(l => l.rep_id === repId);
    if (hasLedger) {
      rep.is_active = false;
      await CacheDB.save(STORES.REPS, rep);
      return { success: true, soft: true };
    }

    await CacheDB.delete(STORES.REPS, repId);
    State.reps = State.reps.filter(r => r.id !== repId);
    computeKPIs();
    return { success: true };
  }

  /* ═════════════════════════════════════════════════════════════════════
     §9 · B2B CUSTOMER CRUD
     ═════════════════════════════════════════════════════════════════════ */
  async function saveCustomer(cust) {
    if (!cust) return { success: false, error: 'بيانات مطلوبة' };
    if (!cust.name || cust.name.trim().length < 2) return { success: false, error: 'الاسم مطلوب' };
    if (!cust.rep_id) return { success: false, error: 'البياع مطلوب' };
    if (!canAccessRep(cust.rep_id)) return { success: false, error: 'غير مصرح' };

    const isNew = !cust.id;
    const payload = {
      id: cust.id || uid(),
      code: cust.code || generateCustomerCode(),
      name: cust.name.trim(),
      phone: (cust.phone || '').trim(),
      address: (cust.address || '').trim(),
      tax_id: (cust.tax_id || '').trim(),
      rep_id: cust.rep_id,
      opening_balance_cash: numOr(cust.opening_balance_cash, 0),
      opening_balance_gold_pure: numOr(cust.opening_balance_gold_pure, 0),
      credit_limit_cash: numOr(cust.credit_limit_cash, 0),
      notes: (cust.notes || '').trim(),
      is_active: cust.is_active !== false,
      created_at: cust.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: currentUser().id,
    };

    const ok = await CacheDB.save(STORES.CUSTOMERS, payload);
    if (!ok) return { success: false, error: 'فشل الحفظ' };

    if (isNew && (payload.opening_balance_cash !== 0 || payload.opening_balance_gold_pure !== 0)) {
      await addLedgerEntry({
        rep_id: payload.rep_id,
        customer_id: payload.id,
        customer_name: payload.name,
        type: 'opening',
        entry_kind: 'customer_open',
        cash_delta: payload.opening_balance_cash,
        gold_delta: payload.opening_balance_gold_pure,
        description: `رصيد افتتاحي — ${payload.name}`,
        _system: true,
      });
    }

    const idx = State.customers.findIndex(c => c.id === payload.id);
    if (idx >= 0) State.customers[idx] = payload;
    else State.customers.unshift(payload);

    computeKPIs();

    if (GMS.Audit) {
      try {
        await GMS.Audit.log(
          isNew ? 'CREATE' : 'UPDATE',
          'b2b_customer', payload.id,
          `${isNew ? 'أضاف' : 'عدّل'} عميل جملة: ${payload.name}`,
          { code: payload.code, rep_id: payload.rep_id }
        );
      } catch (_) {}
    }

    return { success: true, customer: payload };
  }

  async function deleteCustomer(id) {
    await CacheDB.delete(STORES.CUSTOMERS, id);
    State.customers = State.customers.filter(c => c.id !== id);
    computeKPIs();
    return { success: true };
  }

  /* ═════════════════════════════════════════════════════════════════════
     §10 · SETTLEMENTS
     ═════════════════════════════════════════════════════════════════════ */
  async function createSettlement(repId, data) {
    if (!canAccessRep(repId) && !isManager()) return { success: false, error: 'غير مصرح' };

    const rep = State.reps.find(r => r.id === repId);
    if (!rep) return { success: false, error: 'البياع غير موجود' };

    const treasury = computeRepTreasury(repId);

    const cashAmount = numOr(data.cash_amount, 0);
    const goldPure = numOr(data.gold_pure, 0);

    if (cashAmount <= 0 && goldPure <= 0) {
      return { success: false, error: 'يجب إدخال مبلغ نقدي أو وزن ذهب' };
    }

    if (cashAmount > treasury.cash + 0.01) {
      return { success: false, error: 'المبلغ يتجاوز رصيد الخزينة النقدية' };
    }

    if (goldPure > treasury.gold_pure + 0.0001) {
      return { success: false, error: 'الوزن يتجاوز رصيد خزينة الذهب' };
    }

    const settlement = {
      id: uid(),
      settlement_no: generateSettlementNo(),
      rep_id: repId,
      rep_code: rep.code,
      rep_name: rep.name,
      cash_amount: round(cashAmount, 2),
      gold_pure: round(goldPure, 4),
      gold_by_karat: data.gold_by_karat || {},
      notes: (data.notes || '').trim(),
      status: 'PENDING',
      treasury_before: {
        cash: treasury.cash,
        gold_pure: treasury.gold_pure,
      },
      created_at: new Date().toISOString(),
      created_by: currentUser().id,
      created_by_name: currentUser().name,
      approved_by: null,
      approved_at: null,
    };

    const ok = await CacheDB.save(STORES.SETTLEMENTS, settlement);
    if (!ok) return { success: false, error: 'فشل الحفظ' };

    State.settlements.unshift(settlement);
    computeKPIs();

    if (GMS.Audit) {
      try {
        await GMS.Audit.log(
          'CREATE', 'rep_settlement', settlement.id,
          `إذن تصفية ${settlement.settlement_no} للبياع ${rep.name}`,
          {
            cash_amount: settlement.cash_amount,
            gold_pure: settlement.gold_pure,
            rep_id: repId,
          }
        );
      } catch (_) {}
    }

    return { success: true, settlement };
  }

  async function approveSettlement(settlementId) {
    if (!isManager()) return { success: false, error: 'الاعتماد للمدير فقط' };

    const s = State.settlements.find(x => x.id === settlementId);
    if (!s) return { success: false, error: 'غير موجود' };
    if (s.status !== 'PENDING') return { success: false, error: 'الحالة لا تسمح' };

    const treasury = computeRepTreasury(s.rep_id);

    if (s.cash_amount > treasury.cash + 0.01) {
      return { success: false, error: 'الخزينة النقدية تغيرت — أعد المحاولة' };
    }
    if (s.gold_pure > treasury.gold_pure + 0.0001) {
      return { success: false, error: 'خزينة الذهب تغيرت — أعد المحاولة' };
    }

    await addLedgerEntry({
      rep_id: s.rep_id,
      type: 'settlement',
      cash_delta: -s.cash_amount,
      gold_delta: -s.gold_pure,
      description: `تصفية مع المحل — ${s.settlement_no}`,
      reference_no: s.settlement_no,
      linked_settlement_id: s.id,
      _system: true,
    });

    s.status = 'APPROVED';
    s.approved_by = currentUser().id;
    s.approved_by_name = currentUser().name;
    s.approved_at = new Date().toISOString();

    await CacheDB.save(STORES.SETTLEMENTS, s);

    try {
      const ledgerEntry = {
        id: uid(),
        entry_no: 'STL-' + s.settlement_no.slice(-6),
        entry_date: new Date().toISOString(),
        entry_type: 'cash_received',
        cash_delta: s.cash_amount,
        gold_delta: s.gold_pure,
        description: `تصفية بياع جملة ${s.rep_name} — ${s.settlement_no}`,
        reference_no: s.settlement_no,
        entity_type: 'sales_rep',
        entity_id: s.rep_id,
        entity_name: s.rep_name,
        branch_id: currentUser().branch_id,
        created_by: currentUser().name,
      };

      if (window.AccountingView?.CacheDB?.save) {
        await window.AccountingView.CacheDB.save('ledger', ledgerEntry);
      } else {
        const key = 'gms.acc.ledger';
        const existing = JSON.parse(localStorage.getItem(key) || '[]');
        existing.unshift(ledgerEntry);
        localStorage.setItem(key, JSON.stringify(existing.slice(0, 5000)));
      }
    } catch (e) {
      console.warn('[B2B.approveSettlement] Ledger sync failed:', e);
    }

    computeKPIs();

    if (GMS.Audit) {
      try {
        await GMS.Audit.log(
          'APPROVE', 'rep_settlement', s.id,
          `اعتمد تصفية ${s.settlement_no} — ${moneyFmt(s.cash_amount)} ج.م · ${gramFmt(s.gold_pure)} جم`,
          { settlement_no: s.settlement_no }
        );
      } catch (_) {}
    }

    return { success: true, settlement: s };
  }

  async function rejectSettlement(settlementId, reason = '') {
    if (!isManager()) return { success: false, error: 'الاعتماد للمدير فقط' };

    const s = State.settlements.find(x => x.id === settlementId);
    if (!s) return { success: false, error: 'غير موجود' };

    s.status = 'REJECTED';
    s.rejected_by = currentUser().id;
    s.rejected_at = new Date().toISOString();
    s.reject_reason = reason;

    await CacheDB.save(STORES.SETTLEMENTS, s);
    computeKPIs();

    return { success: true };
  }

  /* ═════════════════════════════════════════════════════════════════════
     §11 · RENDER — KPIs + Tabs
     ═════════════════════════════════════════════════════════════════════ */
  function renderKPIs() {
    const k = State.kpis;
    const price24 = getPrice24();
    const expectedGoldValue = round(k.totalExpectedGold * price24, 2);
    const actualGoldValue = round(k.totalRepGold * price24, 2);

    return `
      <div class="kpi-row cols-4">
        <div class="kpi violet">
          <div class="kpi-label">
            <i data-lucide="user-check"></i>
            بياعو الجملة
          </div>
          <div class="kpi-value">${intFmt(k.activeReps)} <small>نشط</small></div>
          <div class="kpi-meta">
            من إجمالي <b>${intFmt(k.totalReps)}</b> بياع
          </div>
        </div>

        <div class="kpi success">
          <div class="kpi-label">
            <i data-lucide="wallet"></i>
            الخزائن الفعلية (كاش)
          </div>
          <div class="kpi-value">${moneyFmt(k.totalRepCash)} <small>ج.م</small></div>
          <div class="kpi-meta">
            ذهب فعلي: <b>${gramFmt(k.totalRepGold)}</b> جم
            (<b>${moneyFmt(actualGoldValue)}</b> ج.م)
          </div>
        </div>

        <div class="kpi warn">
          <div class="kpi-label">
            <i data-lucide="hand-coins"></i>
            المستحقات المتوقعة
          </div>
          <div class="kpi-value">${moneyFmt(k.totalExpectedCash - k.totalRepCash)} <small>ج.م</small></div>
          <div class="kpi-meta">
            ذهب مستحق: <b>${gramFmt(k.totalExpectedGold - k.totalRepGold)}</b> جم
            · من <b>${intFmt(k.totalCustomers)}</b> عميل
          </div>
        </div>

        <div class="kpi gold">
          <div class="kpi-label">
            <i data-lucide="trending-up"></i>
            الإجمالي المتوقع (بعد التحصيل)
          </div>
          <div class="kpi-value">${moneyFmt(k.totalExpectedCash)} <small>ج.م</small></div>
          <div class="kpi-meta">
            ذهب متوقع: <b>${gramFmt(k.totalExpectedGold)}</b> جم
            (<b>${moneyFmt(expectedGoldValue)}</b> ج.م)
          </div>
        </div>
      </div>
    `;
  }

  function renderTabs() {
    const tabs = [
      { key: 'reps',        label: 'بياعو الجملة',     icon: 'user-check',   badge: 0 },
      { key: 'customers',   label: 'عملاء الجملة',     icon: 'users',        badge: 0 },
      { key: 'audit',       label: 'رقابة المدير',     icon: 'shield-check', badge: 0 },
      { key: 'settlements', label: 'إذون التصفية',     icon: 'vault',        badge: State.kpis.pendingSettlements },
    ];

    const visibleTabs = isManager() ? tabs : tabs.filter(t => t.key !== 'audit');

    return `
      <div class="tabs-bar" style="position:relative;top:0;padding:0;
                  background:transparent;border-bottom:1px solid var(--border);
                  margin-bottom:20px;overflow-x:auto">
        ${visibleTabs.map(t => `
          <button class="tab ${State.activeTab === t.key ? 'active' : ''}"
                  data-b2b-tab="${t.key}" type="button">
            <i data-lucide="${t.icon}"></i>
            <span>${t.label}</span>
            ${t.badge > 0 ? `<span class="tab-badge">${intFmt(t.badge)}</span>` : ''}
          </button>
        `).join('')}
      </div>
    `;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §12 · REPS TAB — 🆕 مع قسم المستحقات والإجمالي المتوقع
     ═════════════════════════════════════════════════════════════════════ */
  function renderRepsTab() {
    const visibleReps = isRepRole()
      ? State.reps.filter(r => r.id === currentUser().rep_id)
      : State.reps;

    return `
      ${isManager() ? `
        <div class="card" style="margin-bottom:16px">
          <div class="toolbar-row">
            <div class="search-wrap" style="flex:1;min-width:220px;max-width:360px">
              <i data-lucide="search"></i>
              <input id="b2b-rep-search"
                     placeholder="بحث بالاسم، الكود، الهاتف…"
                     autocomplete="off">
            </div>
            <div class="spacer" style="flex:1"></div>
            <button class="btn btn-primary btn-sm" id="b2b-new-rep" type="button">
              <i data-lucide="plus-circle"></i> بياع جديد
            </button>
          </div>
        </div>
      ` : ''}

      <div class="card">
        <div class="card-head">
          <h3>
            <i data-lucide="user-check"></i>
            ${isRepRole() ? 'خزينتي' : 'قائمة بياعي الجملة'}
          </h3>
          <div class="spacer" style="flex:1"></div>
          <span class="card-sub">${intFmt(visibleReps.length)} بياع</span>
        </div>

        <div id="b2b-reps-host">
          ${visibleReps.length ? visibleReps.map(renderRepCard).join('') : renderEmptyReps()}
        </div>
      </div>
    `;
  }

  /**
   * 🆕 v1.2.0: بطاقة البياع مع 3 أقسام منفصلة
   *   1. الخزينة الفعلية (كاش + ذهب موجود فعلاً)
   *   2. المستحقات المتوقعة (مديونيات العملاء)
   *   3. الإجمالي المتوقع بعد التحصيل
   */
  function renderRepCard(rep) {
    const pos = computeRepFullPosition(rep.id);
    const isActive = rep.is_active !== false;

    return `
      <div class="queue-item" data-b2b-rep-card="${esc(rep.id)}"
           style="cursor:default;display:block;padding:16px">

        <!-- ═══ Header: اسم البياع + الأزرار ═══ -->
        <div style="display:flex;align-items:center;gap:12px;
                    margin-bottom:14px;flex-wrap:wrap">
          <div style="width:48px;height:48px;border-radius:12px;
                      background:${isActive ? 'var(--gold-grad)' : 'var(--surface-3)'};
                      display:grid;place-items:center;flex-shrink:0;
                      color:${isActive ? '#2a1f05' : 'var(--muted)'};
                      font-weight:900;font-size:16px">
            ${esc((rep.name || '?').slice(0, 2).toUpperCase())}
          </div>

          <div style="flex:1;min-width:200px">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;
                        margin-bottom:3px">
              <span style="font-weight:900;font-size:15px">
                ${esc(rep.name)}
              </span>
              <span class="chip ${isActive ? 'ok' : ''}" style="font-size:10px">
                ${isActive ? 'نشط' : 'موقوف'}
              </span>
              <span class="mono" style="font-size:11px;color:var(--muted);
                          font-weight:700">
                ${esc(rep.code)}
              </span>
            </div>
            <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:11px;
                        color:var(--muted);font-weight:700">
              ${rep.phone ? `<span>
                <i data-lucide="phone" style="width:10px;height:10px;
                           display:inline;vertical-align:-1px"></i>
                ${esc(rep.phone)}
              </span>` : ''}
              <span>
                <i data-lucide="users" style="width:10px;height:10px;
                           display:inline;vertical-align:-1px"></i>
                ${intFmt(pos.receivables.customersCount)} عميل
              </span>
            </div>
          </div>

          <div style="display:flex;gap:4px">
            <button class="row-act" data-b2b-rep-view="${esc(rep.id)}"
                    title="عرض التفاصيل الكاملة" type="button"
                    style="width:34px;height:34px">
              <i data-lucide="eye"></i>
            </button>
            ${isManager() ? `
              <button class="row-act" data-b2b-rep-settle="${esc(rep.id)}"
                      title="تصفية الحساب" type="button"
                      style="width:34px;height:34px;color:var(--violet)">
                <i data-lucide="vault"></i>
              </button>
              <button class="row-act" data-b2b-rep-edit="${esc(rep.id)}"
                      title="تعديل" type="button"
                      style="width:34px;height:34px">
                <i data-lucide="pencil"></i>
              </button>
            ` : `
              <button class="row-act" data-b2b-rep-settle="${esc(rep.id)}"
                      title="طلب تصفية" type="button"
                      style="width:34px;height:34px;color:var(--violet)">
                <i data-lucide="vault"></i>
              </button>
            `}
          </div>
        </div>

        <!-- ═══ 3 أقسام مالية منفصلة ═══ -->
        <div style="display:grid;grid-template-columns:repeat(3,1fr);
                    gap:10px">

          <!-- ✅ القسم 1: الخزينة الفعلية -->
          <div style="padding:12px 14px;
                      background:linear-gradient(135deg,
                        color-mix(in srgb,var(--success) 8%,var(--surface-2)) 0%,
                        var(--surface-2) 100%);
                      border-radius:10px;
                      border:1.5px solid color-mix(in srgb,var(--success) 35%,var(--border))">
            <div style="font-size:10px;font-weight:900;color:var(--success);
                        text-transform:uppercase;letter-spacing:.4px;
                        margin-bottom:8px;display:flex;align-items:center;gap:5px">
              <i data-lucide="wallet" style="width:11px;height:11px"></i>
              الخزينة الفعلية
            </div>

            <div style="display:flex;flex-direction:column;gap:4px">
              <div style="display:flex;justify-content:space-between;
                          align-items:baseline;font-size:11px">
                <span style="color:var(--muted);font-weight:700">نقدية:</span>
                <span class="mono" style="font-weight:900;color:var(--success);
                            font-size:13px">
                  ${moneyFmt(pos.treasury.cash)} ج.م
                </span>
              </div>
              <div style="display:flex;justify-content:space-between;
                          align-items:baseline;font-size:11px">
                <span style="color:var(--muted);font-weight:700">ذهب:</span>
                <span class="mono" style="font-weight:900;color:var(--primary);
                            font-size:13px">
                  ${gramFmt(pos.treasury.gold_pure)} جم
                </span>
              </div>
              <div style="display:flex;justify-content:space-between;
                          align-items:baseline;font-size:11px">
                <span style="color:var(--muted);font-weight:700">قيمة الذهب:</span>
                <span class="mono" style="font-weight:800;font-size:12px">
                  ${moneyFmt(pos.treasury.gold_value)} ج.م
                </span>
              </div>
            </div>

            <div style="margin-top:9px;padding-top:8px;
                        border-top:1px dashed color-mix(in srgb,var(--success) 30%,var(--border));
                        display:flex;justify-content:space-between;align-items:baseline">
              <span style="font-size:10.5px;font-weight:900;color:var(--success)">
                الإجمالي:
              </span>
              <span class="mono" style="font-weight:900;color:var(--success);
                          font-size:14px">
                ${moneyFmt(pos.treasury.total_value)} ج.م
              </span>
            </div>
          </div>

          <!-- ✅ القسم 2: المستحقات المتوقعة -->
          <div style="padding:12px 14px;
                      background:linear-gradient(135deg,
                        color-mix(in srgb,var(--warn) 8%,var(--surface-2)) 0%,
                        var(--surface-2) 100%);
                      border-radius:10px;
                      border:1.5px solid color-mix(in srgb,var(--warn) 35%,var(--border))">
            <div style="font-size:10px;font-weight:900;color:var(--warn);
                        text-transform:uppercase;letter-spacing:.4px;
                        margin-bottom:8px;display:flex;align-items:center;gap:5px">
              <i data-lucide="hand-coins" style="width:11px;height:11px"></i>
              المستحقات المتوقعة
              <span class="chip" style="font-size:9px;padding:1px 6px;
                          margin-inline-start:auto">
                ${intFmt(pos.receivables.customersCount)} عميل
              </span>
            </div>

            <div style="display:flex;flex-direction:column;gap:4px">
              <div style="display:flex;justify-content:space-between;
                          align-items:baseline;font-size:11px">
                <span style="color:var(--muted);font-weight:700">مديونية نقدية:</span>
                <span class="mono" style="font-weight:900;color:var(--warn);
                            font-size:13px">
                  ${moneyFmt(pos.receivables.cash)} ج.م
                </span>
              </div>
              <div style="display:flex;justify-content:space-between;
                          align-items:baseline;font-size:11px">
                <span style="color:var(--muted);font-weight:700">مديونية ذهب:</span>
                <span class="mono" style="font-weight:900;color:var(--warn);
                            font-size:13px">
                  ${gramFmt(pos.receivables.gold_pure)} جم
                </span>
              </div>
              <div style="display:flex;justify-content:space-between;
                          align-items:baseline;font-size:11px">
                <span style="color:var(--muted);font-weight:700">قيمة الذهب:</span>
                <span class="mono" style="font-weight:800;font-size:12px">
                  ${moneyFmt(pos.receivables.gold_value)} ج.م
                </span>
              </div>
            </div>

            <div style="margin-top:9px;padding-top:8px;
                        border-top:1px dashed color-mix(in srgb,var(--warn) 30%,var(--border));
                        display:flex;justify-content:space-between;align-items:baseline">
              <span style="font-size:10.5px;font-weight:900;color:var(--warn)">
                الإجمالي:
              </span>
              <span class="mono" style="font-weight:900;color:var(--warn);
                          font-size:14px">
                ${moneyFmt(pos.receivables.total_value)} ج.م
              </span>
            </div>
          </div>

          <!-- ✅ القسم 3: الإجمالي المتوقع بعد التحصيل -->
          <div style="padding:12px 14px;
                      background:var(--gold-soft);
                      border-radius:10px;
                      border:2px solid color-mix(in srgb,var(--primary) 50%,var(--border));
                      position:relative;overflow:hidden">
            <div style="position:absolute;inset-block:0;inset-inline-start:0;
                        width:3px;background:var(--gold-grad)"></div>
            <div style="font-size:10px;font-weight:900;color:var(--primary);
                        text-transform:uppercase;letter-spacing:.4px;
                        margin-bottom:8px;display:flex;align-items:center;gap:5px">
              <i data-lucide="trending-up" style="width:11px;height:11px"></i>
              الإجمالي المتوقع
            </div>

            <div style="display:flex;flex-direction:column;gap:4px">
              <div style="display:flex;justify-content:space-between;
                          align-items:baseline;font-size:11px">
                <span style="color:var(--muted);font-weight:700">نقدية متوقعة:</span>
                <span class="mono" style="font-weight:900;color:var(--primary);
                            font-size:13px">
                  ${moneyFmt(pos.expected.cash)} ج.م
                </span>
              </div>
              <div style="display:flex;justify-content:space-between;
                          align-items:baseline;font-size:11px">
                <span style="color:var(--muted);font-weight:700">ذهب متوقع:</span>
                <span class="mono" style="font-weight:900;color:var(--primary);
                            font-size:13px">
                  ${gramFmt(pos.expected.gold_pure)} جم
                </span>
              </div>
              <div style="display:flex;justify-content:space-between;
                          align-items:baseline;font-size:11px">
                <span style="color:var(--muted);font-weight:700">قيمة الذهب:</span>
                <span class="mono" style="font-weight:800;font-size:12px">
                  ${moneyFmt(pos.expected.gold_value)} ج.م
                </span>
              </div>
            </div>

            <div style="margin-top:9px;padding-top:8px;
                        border-top:1.5px solid color-mix(in srgb,var(--primary) 40%,var(--border));
                        display:flex;justify-content:space-between;align-items:baseline">
              <span style="font-size:11px;font-weight:900;color:var(--primary)">
                الإجمالي:
              </span>
              <span class="mono" style="font-weight:900;color:var(--primary);
                          font-size:16px;letter-spacing:-.4px">
                ${moneyFmt(pos.expected.total_value)} ج.م
              </span>
            </div>

            <div style="font-size:9.5px;color:var(--muted);font-weight:700;
                        text-align:center;margin-top:5px;line-height:1.5">
              = الخزينة + المستحقات
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderEmptyReps() {
    return `
      <div class="empty" style="padding:80px 20px">
        <i data-lucide="user-x"></i>
        <p>لا يوجد بياعو جملة</p>
        <span>${isRepRole() ? 'حسابك غير مرتبط ببياع' : 'ابدأ بإضافة بياع جملة جديد'}</span>
      </div>
    `;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §13 · CUSTOMERS TAB
     ═════════════════════════════════════════════════════════════════════ */
  function renderCustomersTab() {
    const effectiveRep = getEffectiveRepId();
    let customers = State.customers;

    if (effectiveRep) {
      customers = customers.filter(c => c.rep_id === effectiveRep);
    }

    if (State.filters.search) {
      const q = State.filters.search.toLowerCase();
      customers = customers.filter(c =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.code || '').toLowerCase().includes(q) ||
        (c.phone || '').includes(q)
      );
    }

    return `
      <div class="card" style="margin-bottom:16px">
        <div class="toolbar-row">
          <div class="search-wrap" style="flex:1;min-width:220px;max-width:360px">
            <i data-lucide="search"></i>
            <input id="b2b-cust-search"
                   placeholder="بحث بالاسم، الكود، الهاتف…"
                   value="${esc(State.filters.search)}"
                   autocomplete="off">
          </div>

          ${isManager() ? `
            <select class="filter-select" id="b2b-cust-filter-rep"
                    style="min-width:180px">
              <option value="">كل البياعين</option>
              ${State.reps.map(r => `
                <option value="${esc(r.id)}"
                        ${State.activeRepFilter === r.id ? 'selected' : ''}>
                  ${esc(r.name)}
                </option>
              `).join('')}
            </select>
          ` : ''}

          <div class="spacer" style="flex:1"></div>

          <button class="btn btn-primary btn-sm" id="b2b-new-customer" type="button">
            <i data-lucide="user-plus"></i> عميل جديد
          </button>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <h3>
            <i data-lucide="users"></i>
            عملاء الجملة
          </h3>
          <div class="spacer" style="flex:1"></div>
          <span class="card-sub">${intFmt(customers.length)} عميل</span>
        </div>

        <div id="b2b-customers-host">
          ${customers.length ? `
            <div class="table-wrap" style="border:none;border-radius:0;max-height:60vh">
              <table class="tbl">
                <thead>
                  <tr>
                    <th style="width:120px">الكود</th>
                    <th>العميل</th>
                    <th style="width:150px">البياع المسؤول</th>
                    <th style="width:140px" class="col-num">مديونية نقدية</th>
                    <th style="width:140px" class="col-num">مديونية ذهب</th>
                    <th style="width:140px" class="col-c">الحالة</th>
                    <th style="width:80px" class="col-c">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  ${customers.map(renderCustomerRow).join('')}
                </tbody>
              </table>
            </div>
          ` : `
            <div class="empty" style="padding:60px 20px">
              <i data-lucide="user-x"></i>
              <p>لا يوجد عملاء جملة</p>
              <span>ابدأ بإضافة عميل جملة جديد</span>
            </div>
          `}
        </div>
      </div>
    `;
  }

  function renderCustomerRow(c) {
    const balance = computeCustomerBalance(c.id);
    const rep = State.reps.find(r => r.id === c.rep_id);
    const cashCls = balance.cash > 0 ? 'var(--danger)'
                   : balance.cash < 0 ? 'var(--success)' : 'var(--muted)';
    const goldCls = balance.gold_pure > 0 ? 'var(--danger)'
                   : balance.gold_pure < 0 ? 'var(--success)' : 'var(--muted)';

    return `
      <tr data-b2b-cust-id="${esc(c.id)}" style="cursor:pointer">
        <td class="mono" style="font-weight:800;font-size:11.5px">
          ${esc(c.code)}
        </td>
        <td>
          <div class="cell-sku">
            <span class="sku-code">${esc(c.name)}</span>
            <span class="sku-meta mono">${esc(c.phone || '—')}</span>
          </div>
        </td>
        <td style="font-size:11.5px;color:var(--muted)">
          ${esc(rep?.name || '—')}
        </td>
        <td class="col-num" style="font-weight:900;color:${cashCls}">
          ${moneyFmt(Math.abs(balance.cash))} ج.م
        </td>
        <td class="col-num" style="font-weight:900;color:${goldCls}">
          ${gramFmt(Math.abs(balance.gold_pure))} جم
        </td>
        <td class="col-c">
          <span class="pill ${c.is_active !== false ? 'pill-green' : 'pill-gray'}">
            ${c.is_active !== false ? 'نشط' : 'موقوف'}
          </span>
        </td>
        <td class="col-c">
          <div style="display:flex;gap:3px;justify-content:center">
            <button class="row-act" data-b2b-cust-ledger="${esc(c.id)}"
                    title="دفتر الحساب" type="button"
                    style="width:30px;height:30px">
              <i data-lucide="book-open"></i>
            </button>
            <button class="row-act" data-b2b-cust-edit="${esc(c.id)}"
                    title="تعديل" type="button"
                    style="width:30px;height:30px">
              <i data-lucide="pencil"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §14 · AUDIT TAB — 🆕 يعرض الأعمدة الثلاثة (فعلي + مستحقات + متوقع)
     ═════════════════════════════════════════════════════════════════════ */
  function renderAuditTab() {
    if (!isManager()) {
      return `<div class="empty" style="padding:60px"><i data-lucide="lock"></i><p>محجوب</p></div>`;
    }

    const reps = State.reps;

    /* الإجماليات */
    let grandTreasuryCash = 0, grandTreasuryGold = 0;
    let grandReceivableCash = 0, grandReceivableGold = 0;
    let grandExpectedCash = 0, grandExpectedGold = 0;

    reps.forEach(rep => {
      const pos = computeRepFullPosition(rep.id);
      grandTreasuryCash += pos.treasury.cash;
      grandTreasuryGold += pos.treasury.gold_pure;
      grandReceivableCash += pos.receivables.cash;
      grandReceivableGold += pos.receivables.gold_pure;
      grandExpectedCash += pos.expected.cash;
      grandExpectedGold += pos.expected.gold_pure;
    });

    return `
      <div class="card" style="margin-bottom:16px">
        <div class="card-head">
          <h3>
            <i data-lucide="shield-check"></i>
            لوحة رقابة المدير
          </h3>
          <div class="spacer" style="flex:1"></div>
          <span class="card-sub">مقارنة أداء البياعين</span>
        </div>

        <div class="card-body">
          <div class="table-wrap">
            <table class="tbl">
              <thead>
                <tr>
                  <th rowspan="2" style="vertical-align:middle">البياع</th>
                  <th colspan="2" style="text-align:center;background:var(--success-bg);color:var(--success)">
                    الخزينة الفعلية
                  </th>
                  <th colspan="2" style="text-align:center;background:var(--warn-bg);color:var(--warn)">
                    المستحقات المتوقعة
                  </th>
                  <th colspan="2" style="text-align:center;background:var(--gold-soft);color:var(--warn)">
                    الإجمالي المتوقع
                  </th>
                  <th rowspan="2" style="vertical-align:middle;width:90px" class="col-c">إجراء</th>
                </tr>
                <tr>
                  <th class="col-num" style="width:120px;background:var(--success-bg);color:var(--success)">كاش</th>
                  <th class="col-num" style="width:110px;background:var(--success-bg);color:var(--success)">ذهب (جم)</th>
                  <th class="col-num" style="width:120px;background:var(--warn-bg);color:var(--warn)">كاش</th>
                  <th class="col-num" style="width:110px;background:var(--warn-bg);color:var(--warn)">ذهب (جم)</th>
                  <th class="col-num" style="width:130px;background:var(--gold-soft);color:var(--warn)">كاش</th>
                  <th class="col-num" style="width:120px;background:var(--gold-soft);color:var(--warn)">ذهب (جم)</th>
                </tr>
              </thead>
              <tbody>
                ${reps.map(rep => {
                  const pos = computeRepFullPosition(rep.id);

                  return `
                    <tr>
                      <td>
                        <div class="cell-sku">
                          <span class="sku-code">${esc(rep.name)}</span>
                          <span class="sku-meta mono">${esc(rep.code)}</span>
                        </div>
                      </td>
                      <td class="col-num" style="font-weight:900;color:var(--success)">
                        ${moneyFmt(pos.treasury.cash)}
                      </td>
                      <td class="col-num" style="font-weight:900;color:var(--primary)">
                        ${gramFmt(pos.treasury.gold_pure)}
                      </td>
                      <td class="col-num" style="font-weight:900;color:var(--warn)">
                        ${moneyFmt(pos.receivables.cash)}
                      </td>
                      <td class="col-num" style="font-weight:900;color:var(--warn)">
                        ${gramFmt(pos.receivables.gold_pure)}
                      </td>
                      <td class="col-num" style="font-weight:900;color:var(--primary);
                                  background:color-mix(in srgb,var(--primary) 6%,transparent)">
                        ${moneyFmt(pos.expected.cash)}
                      </td>
                      <td class="col-num" style="font-weight:900;color:var(--primary);
                                  background:color-mix(in srgb,var(--primary) 6%,transparent)">
                        ${gramFmt(pos.expected.gold_pure)}
                      </td>
                      <td class="col-c">
                        <button class="row-act" data-b2b-rep-view="${esc(rep.id)}"
                                title="تفاصيل" type="button"
                                style="width:30px;height:30px">
                          <i data-lucide="eye"></i>
                        </button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
              <tfoot>
                <tr style="background:var(--surface-2);font-weight:900">
                  <td>الإجمالي</td>
                  <td class="col-num" style="color:var(--success)">
                    ${moneyFmt(grandTreasuryCash)}
                  </td>
                  <td class="col-num" style="color:var(--primary)">
                    ${gramFmt(grandTreasuryGold)}
                  </td>
                  <td class="col-num" style="color:var(--warn)">
                    ${moneyFmt(grandReceivableCash)}
                  </td>
                  <td class="col-num" style="color:var(--warn)">
                    ${gramFmt(grandReceivableGold)}
                  </td>
                  <td class="col-num" style="color:var(--primary);
                              background:color-mix(in srgb,var(--primary) 10%,transparent)">
                    ${moneyFmt(grandExpectedCash)}
                  </td>
                  <td class="col-num" style="color:var(--primary);
                              background:color-mix(in srgb,var(--primary) 10%,transparent)">
                    ${gramFmt(grandExpectedGold)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §15 · SETTLEMENTS TAB
     ═════════════════════════════════════════════════════════════════════ */
  function renderSettlementsTab() {
    let settlements = State.settlements;
    if (isRepRole()) {
      settlements = settlements.filter(s => s.rep_id === currentUser().rep_id);
    } else if (State.activeRepFilter) {
      settlements = settlements.filter(s => s.rep_id === State.activeRepFilter);
    }

    if (State.filters.status) {
      settlements = settlements.filter(s => s.status === State.filters.status);
    }

    return `
      <div class="card" style="margin-bottom:16px">
        <div class="toolbar-row">
          <select class="filter-select" id="b2b-stl-status" style="min-width:180px">
            <option value="">كل الحالات</option>
            ${Object.values(SETTLEMENT_STATUS).map(s => `
              <option value="${s.key}" ${State.filters.status === s.key ? 'selected' : ''}>
                ${s.label}
              </option>
            `).join('')}
          </select>
          <div class="spacer" style="flex:1"></div>
          <span class="chip info">
            <i data-lucide="vault" style="width:12px;height:12px"></i>
            ${intFmt(settlements.length)} إذن
          </span>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <h3>
            <i data-lucide="vault"></i>
            إذون التصفية
          </h3>
        </div>

        <div>
          ${settlements.length ? settlements.map(renderSettlementRow).join('') : `
            <div class="empty" style="padding:60px 20px">
              <i data-lucide="vault"></i>
              <p>لا توجد إذون تصفية</p>
            </div>
          `}
        </div>
      </div>
    `;
  }

  function renderSettlementRow(s) {
    const status = SETTLEMENT_STATUS[s.status] || SETTLEMENT_STATUS.DRAFT;

    return `
      <div style="padding:14px 16px;border-bottom:1px solid var(--border);
                  display:grid;grid-template-columns:auto 1fr auto;gap:14px;
                  align-items:center">
        <div style="width:44px;height:44px;border-radius:12px;
                    display:grid;place-items:center;
                    background:var(--${status.color}-bg);
                    color:var(--${status.color})">
          <i data-lucide="${status.icon}" style="width:20px;height:20px"></i>
        </div>

        <div style="min-width:0">
          <div style="display:flex;align-items:center;gap:8px;
                      flex-wrap:wrap;margin-bottom:4px">
            <span class="mono" style="font-weight:900;font-size:13px">
              ${esc(s.settlement_no)}
            </span>
            <span class="pill ${status.cls}" style="font-size:10px">
              ${status.label}
            </span>
          </div>

          <div style="font-size:11.5px;font-weight:700;
                      color:var(--text-2);margin-bottom:3px">
            ${esc(s.rep_name)}
          </div>

          <div style="display:flex;gap:12px;flex-wrap:wrap;
                      font-size:10.5px;color:var(--muted);font-weight:700">
            <span>
              <i data-lucide="wallet" style="width:10px;height:10px;
                 display:inline;vertical-align:-1px"></i>
              ${moneyFmt(s.cash_amount)} ج.م
            </span>
            <span>
              <i data-lucide="scale" style="width:10px;height:10px;
                 display:inline;vertical-align:-1px"></i>
              ${gramFmt(s.gold_pure)} جم
            </span>
            <span>
              <i data-lucide="clock" style="width:10px;height:10px;
                 display:inline;vertical-align:-1px"></i>
              ${timeAgo(s.created_at)}
            </span>
          </div>
        </div>

        <div style="display:flex;gap:3px">
          ${s.status === 'PENDING' && isManager() ? `
            <button class="row-act" data-b2b-stl-approve="${esc(s.id)}"
                    title="اعتماد" type="button"
                    style="width:32px;height:32px;color:var(--success)">
              <i data-lucide="check-circle-2"></i>
            </button>
            <button class="row-act danger" data-b2b-stl-reject="${esc(s.id)}"
                    title="رفض" type="button"
                    style="width:32px;height:32px">
              <i data-lucide="x-circle"></i>
            </button>
          ` : ''}
          <button class="row-act" data-b2b-stl-view="${esc(s.id)}"
                  title="عرض" type="button"
                  style="width:32px;height:32px">
            <i data-lucide="eye"></i>
          </button>
        </div>
      </div>
    `;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §16 · MAIN RENDER
     ═════════════════════════════════════════════════════════════════════ */
  async function render(root) {
    if (!root) return;

    if (!isManager() && !isRepRole()) {
      root.innerHTML = GMS.Guard?.denied?.(
        'غير مصرح',
        'هذه الصفحة لبياعي الجملة والمدراء فقط'
      ) || `<div class="empty" style="padding:80px"><p>غير مصرح</p></div>`;
      window.lucide?.createIcons();
      return;
    }

    try {
      root.innerHTML = `
        <div style="padding:60px;text-align:center">
          <div class="spinner" style="margin:0 auto 14px"></div>
          <div style="font-size:13px;color:var(--muted);font-weight:600">
            جارٍ تحميل نظام بياعي الجملة…
          </div>
        </div>
      `;

      await loadAll();

      let content = '';
      if (State.activeTab === 'reps') content = renderRepsTab();
      else if (State.activeTab === 'customers') content = renderCustomersTab();
      else if (State.activeTab === 'audit') content = renderAuditTab();
      else if (State.activeTab === 'settlements') content = renderSettlementsTab();

      root.innerHTML = `
        <div class="page-header">
          <h2>
            <i data-lucide="user-check"></i>
            نظام بياعي الجملة المستقلين
          </h2>
          <p>
            إدارة كاملة لبياعي الجملة (B2B Sales Reps) ككيانات مستقلة
            بخزائن نقدية وذهبية معزولة، مع دفتر عملاء مستقل،
            ولوحة رقابة شاملة للمدير.
            ${isRepRole() ? `
              <span class="chip warn" style="font-size:10px;margin-inline-start:6px">
                <i data-lucide="eye" style="width:10px;height:10px"></i>
                عرض معزول — أنت ترى بياناتك فقط
              </span>
            ` : ''}
          </p>
        </div>

        ${renderKPIs()}
        ${renderTabs()}
        ${content}
      `;

      window.lucide?.createIcons();
      bindEvents();
      bindRealtime();

    } catch (e) {
      console.error('[B2B.render]', e);
      root.innerHTML = `
        <div class="card">
          <div class="card-body">
            <div class="empty" style="padding:60px 20px">
              <i data-lucide="alert-circle" style="color:var(--danger)"></i>
              <p>فشل تحميل الصفحة</p>
              <span>${esc(e.message)}</span>
            </div>
          </div>
        </div>
      `;
      window.lucide?.createIcons();
    }
  }

  function refreshUI() {
    render(document.getElementById('page'));
  }

  /* ═════════════════════════════════════════════════════════════════════
     §17 · EVENTS
     ═════════════════════════════════════════════════════════════════════ */
  function bindEvents() {
    document.querySelectorAll('[data-b2b-tab]').forEach(tab => {
      tab.onclick = () => {
        State.activeTab = tab.dataset.b2bTab;
        State.page = 1;
        refreshUI();
      };
    });

    const repSearch = document.getElementById('b2b-rep-search');
    if (repSearch) {
      repSearch.oninput = (e) => {
        clearTimeout(State.timers.search);
        State.timers.search = setTimeout(() => {
          State.filters.search = e.target.value.trim();
          refreshUI();
        }, 250);
      };
    }

    const custSearch = document.getElementById('b2b-cust-search');
    if (custSearch) {
      custSearch.oninput = (e) => {
        clearTimeout(State.timers.search);
        State.timers.search = setTimeout(() => {
          State.filters.search = e.target.value.trim();
          refreshUI();
        }, 250);
      };
    }

    const repFilter = document.getElementById('b2b-cust-filter-rep');
    if (repFilter) {
      repFilter.onchange = () => {
        State.activeRepFilter = repFilter.value || null;
        refreshUI();
      };
    }

    const stlStatus = document.getElementById('b2b-stl-status');
    if (stlStatus) {
      stlStatus.onchange = () => {
        State.filters.status = stlStatus.value;
        refreshUI();
      };
    }

    const newRepBtn = document.getElementById('b2b-new-rep');
    if (newRepBtn) newRepBtn.onclick = () => openRepModal();

    const newCustBtn = document.getElementById('b2b-new-customer');
    if (newCustBtn) newCustBtn.onclick = () => openCustomerModal();

    document.querySelectorAll('[data-b2b-rep-view]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        openRepDetails(btn.dataset.b2bRepView);
      };
    });

    document.querySelectorAll('[data-b2b-rep-edit]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const rep = State.reps.find(r => r.id === btn.dataset.b2bRepEdit);
        if (rep) openRepModal(rep);
      };
    });

    document.querySelectorAll('[data-b2b-rep-settle]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        openSettlementModal(btn.dataset.b2bRepSettle);
      };
    });

    document.querySelectorAll('[data-b2b-cust-ledger]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        openCustomerLedger(btn.dataset.b2bCustLedger);
      };
    });

    document.querySelectorAll('[data-b2b-cust-edit]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const c = State.customers.find(x => x.id === btn.dataset.b2bCustEdit);
        if (c) openCustomerModal(c);
      };
    });

    document.querySelectorAll('tr[data-b2b-cust-id]').forEach(tr => {
      tr.onclick = (e) => {
        if (e.target.closest('button')) return;
        openCustomerLedger(tr.dataset.b2bCustId);
      };
    });

    document.querySelectorAll('[data-b2b-stl-approve]').forEach(btn => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        const ok = await GMS.Confirm.ask(
          'سيتم اعتماد إذن التصفية وخصم المبالغ من خزينة البياع. متابعة؟',
          { title: 'اعتماد التصفية', okText: 'اعتماد', danger: false, icon: 'check-circle-2' }
        );
        if (!ok) return;

        const result = await approveSettlement(btn.dataset.b2bStlApprove);
        if (result.success) {
          GMS.Toast.ok('تم اعتماد التصفية');
          GMS.Beep?.success?.();
          refreshUI();
        } else {
          GMS.Toast.err('فشل الاعتماد', result.error);
        }
      };
    });

    document.querySelectorAll('[data-b2b-stl-reject]').forEach(btn => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        const reason = await GMS.Prompt.ask({
          title: 'رفض إذن التصفية',
          label: 'سبب الرفض',
          required: false,
          icon: 'x-circle',
        });
        if (reason === null) return;

        const result = await rejectSettlement(btn.dataset.b2bStlReject, reason);
        if (result.success) {
          GMS.Toast.warn('تم رفض الإذن');
          refreshUI();
        }
      };
    });

    document.querySelectorAll('[data-b2b-stl-view]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        openSettlementDetails(btn.dataset.b2bStlView);
      };
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §18 · MODAL — REP
     ═════════════════════════════════════════════════════════════════════ */
  function openRepModal(rep = null) {
    if (!isManager()) return GMS.Toast.err('غير مصرح');

    const isEdit = Boolean(rep);
    const r = rep || {};

    GMS.Modal.open({
      title: isEdit ? `تعديل بياع — ${r.name}` : 'إضافة بياع جملة جديد',
      icon: isEdit ? 'pencil' : 'user-plus',
      size: 'lg',
      body: `
        <div class="grid-form">
          <div class="field">
            <label>الكود</label>
            <input id="b2b-r-code" value="${esc(r.code || generateRepCode())}"
                   class="mono" dir="ltr">
          </div>

          <div class="field">
            <label>الاسم <span class="req">*</span></label>
            <input id="b2b-r-name" value="${esc(r.name || '')}"
                   placeholder="اسم البياع الكامل">
          </div>

          <div class="field">
            <label>رقم الهاتف</label>
            <input id="b2b-r-phone" value="${esc(r.phone || '')}"
                   class="mono" dir="ltr" inputmode="tel">
          </div>

          <div class="field">
            <label>رمز PIN (اختياري)</label>
            <input id="b2b-r-pin" value="${esc(r.pin || '')}"
                   type="password" class="mono" dir="ltr"
                   placeholder="4 أرقام">
            <span class="hint">لدخول سريع في وضع POS</span>
          </div>

          ${!isEdit ? `
            <div class="field">
              <label>الرصيد الافتتاحي النقدي (ج.م)</label>
              <input type="number" id="b2b-r-open-cash"
                     value="0" step="0.01" class="mono">
            </div>

            <div class="field">
              <label>الرصيد الافتتاحي الذهب (جم بندق 24K)</label>
              <input type="number" id="b2b-r-open-gold"
                     value="0" step="0.0001" class="mono">
            </div>
          ` : ''}

          <div class="field field-full">
            <label>ملاحظات</label>
            <input id="b2b-r-notes" value="${esc(r.notes || '')}">
          </div>

          <div class="field field-full">
            <label class="toggle-switch">
              <input type="checkbox" id="b2b-r-active"
                     ${r.is_active !== false ? 'checked' : ''}>
              <span class="track"></span>
              <span>نشط</span>
            </label>
          </div>
        </div>
      `,
      footer: `
        <button class="btn" data-close>إلغاء</button>
        ${isEdit && isManager() ? `
          <button class="btn btn-danger" id="b2b-r-delete">
            <i data-lucide="trash-2"></i> حذف
          </button>
        ` : ''}
        <button class="btn btn-primary" id="b2b-r-save">
          <i data-lucide="save"></i> ${isEdit ? 'حفظ' : 'إضافة'}
        </button>
      `,
      onMount: (el, close) => {
        const $ = (id) => el.querySelector('#' + id);

        $('b2b-r-save').onclick = async () => {
          const payload = {
            id: r.id || null,
            code: $('b2b-r-code').value.trim(),
            name: $('b2b-r-name').value.trim(),
            phone: $('b2b-r-phone').value.trim(),
            pin: $('b2b-r-pin').value.trim() || null,
            notes: $('b2b-r-notes').value.trim(),
            is_active: $('b2b-r-active').checked,
          };

          if (!isEdit) {
            payload.opening_cash = numOr($('b2b-r-open-cash')?.value, 0);
            payload.opening_gold_pure = numOr($('b2b-r-open-gold')?.value, 0);
          }

          const result = await saveRep(payload);
          if (result.success) {
            GMS.Toast.ok(isEdit ? 'تم حفظ التعديلات' : 'تمت إضافة البياع');
            GMS.Beep?.success?.();
            close();
            refreshUI();
          } else {
            GMS.Toast.err('فشل الحفظ', result.error);
          }
        };

        const delBtn = $('b2b-r-delete');
        if (delBtn) {
          delBtn.onclick = async () => {
            const ok = await GMS.Confirm.danger(
              `سيتم حذف البياع "${r.name}".\n` +
              (State.ledgers.some(l => l.rep_id === r.id)
                ? '⚠ لديه حركات — سيتم تعطيله بدل حذفه.'
                : 'لا يمكن التراجع.')
            );
            if (!ok) return;

            const result = await deleteRep(r.id);
            if (result.success) {
              GMS.Toast.ok(result.soft ? 'تم تعطيل البياع' : 'تم الحذف');
              close();
              refreshUI();
            }
          };
        }
      },
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §19 · MODAL — CUSTOMER
     ═════════════════════════════════════════════════════════════════════ */
  function openCustomerModal(cust = null) {
    const isEdit = Boolean(cust);
    const c = cust || {};

    const availableReps = isRepRole()
      ? State.reps.filter(r => r.id === currentUser().rep_id)
      : State.reps.filter(r => r.is_active !== false);

    GMS.Modal.open({
      title: isEdit ? `تعديل عميل — ${c.name}` : 'إضافة عميل جملة جديد',
      icon: isEdit ? 'pencil' : 'user-plus',
      size: 'lg',
      body: `
        <div class="grid-form">
          <div class="field">
            <label>الكود</label>
            <input id="b2b-c-code" value="${esc(c.code || generateCustomerCode())}"
                   class="mono" dir="ltr">
          </div>

          <div class="field">
            <label>الاسم <span class="req">*</span></label>
            <input id="b2b-c-name" value="${esc(c.name || '')}">
          </div>

          <div class="field">
            <label>رقم الهاتف</label>
            <input id="b2b-c-phone" value="${esc(c.phone || '')}"
                   class="mono" dir="ltr" inputmode="tel">
          </div>

          <div class="field">
            <label>البياع المسؤول <span class="req">*</span></label>
            <select id="b2b-c-rep" ${isRepRole() ? 'disabled' : ''}>
              <option value="">— اختر —</option>
              ${availableReps.map(r => `
                <option value="${esc(r.id)}"
                        ${(c.rep_id === r.id || (!c.rep_id && isRepRole())) ? 'selected' : ''}>
                  ${esc(r.name)} — ${esc(r.code)}
                </option>
              `).join('')}
            </select>
          </div>

          <div class="field">
            <label>السجل الضريبي</label>
            <input id="b2b-c-tax" value="${esc(c.tax_id || '')}"
                   class="mono" dir="ltr">
          </div>

          <div class="field field-full">
            <label>العنوان</label>
            <input id="b2b-c-address" value="${esc(c.address || '')}">
          </div>

          ${!isEdit ? `
            <div class="field">
              <label>مديونية افتتاحية (ج.م)</label>
              <input type="number" id="b2b-c-open-cash"
                     value="0" step="0.01" class="mono">
              <span class="hint">موجب = العميل مدين · سالب = العميل دائن</span>
            </div>

            <div class="field">
              <label>مديونية افتتاحية ذهب (جم بندق)</label>
              <input type="number" id="b2b-c-open-gold"
                     value="0" step="0.0001" class="mono">
            </div>
          ` : ''}

          <div class="field">
            <label>حد الائتمان (ج.م)</label>
            <input type="number" id="b2b-c-credit"
                   value="${numOr(c.credit_limit_cash, 0)}"
                   step="100" class="mono">
          </div>

          <div class="field field-full">
            <label>ملاحظات</label>
            <input id="b2b-c-notes" value="${esc(c.notes || '')}">
          </div>

          <div class="field field-full">
            <label class="toggle-switch">
              <input type="checkbox" id="b2b-c-active"
                     ${c.is_active !== false ? 'checked' : ''}>
              <span class="track"></span>
              <span>نشط</span>
            </label>
          </div>
        </div>
      `,
      footer: `
        <button class="btn" data-close>إلغاء</button>
        <button class="btn btn-primary" id="b2b-c-save">
          <i data-lucide="save"></i> ${isEdit ? 'حفظ' : 'إضافة'}
        </button>
      `,
      onMount: (el, close) => {
        const $ = (id) => el.querySelector('#' + id);

        $('b2b-c-save').onclick = async () => {
          const repId = isRepRole()
            ? currentUser().rep_id
            : $('b2b-c-rep').value;

          const payload = {
            id: c.id || null,
            code: $('b2b-c-code').value.trim(),
            name: $('b2b-c-name').value.trim(),
            phone: $('b2b-c-phone').value.trim(),
            address: $('b2b-c-address').value.trim(),
            tax_id: $('b2b-c-tax').value.trim(),
            rep_id: repId,
            credit_limit_cash: numOr($('b2b-c-credit').value, 0),
            notes: $('b2b-c-notes').value.trim(),
            is_active: $('b2b-c-active').checked,
          };

          if (!isEdit) {
            payload.opening_balance_cash = numOr($('b2b-c-open-cash')?.value, 0);
            payload.opening_balance_gold_pure = numOr($('b2b-c-open-gold')?.value, 0);
          }

          const result = await saveCustomer(payload);
          if (result.success) {
            GMS.Toast.ok(isEdit ? 'تم الحفظ' : 'تمت إضافة العميل');
            GMS.Beep?.success?.();
            close();
            refreshUI();
          } else {
            GMS.Toast.err('فشل الحفظ', result.error);
          }
        };
      },
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §20 · MODAL — CUSTOMER LEDGER
     ═════════════════════════════════════════════════════════════════════ */
  function openCustomerLedger(customerId) {
    const c = State.customers.find(x => x.id === customerId);
    if (!c) return;
    if (!canAccessRep(c.rep_id)) return GMS.Toast.err('غير مصرح');

    const balance = computeCustomerBalance(c.id);
    const entries = State.ledgers
      .filter(l => l.customer_id === c.id)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    GMS.Modal.open({
      title: `دفتر حساب العميل — ${c.name}`,
      icon: 'book-open',
      size: 'xl',
      body: `
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;
                    margin-bottom:16px">
          <div style="padding:14px;background:${balance.cash > 0 ? 'var(--danger-bg)' : balance.cash < 0 ? 'var(--success-bg)' : 'var(--surface-2)'};border-radius:11px;border:1px solid var(--border)">
            <div style="font-size:10.5px;font-weight:800;text-transform:uppercase;
                        color:${balance.cash > 0 ? 'var(--danger)' : balance.cash < 0 ? 'var(--success)' : 'var(--muted)'}">
              المديونية النقدية
            </div>
            <div class="mono" style="font-size:20px;font-weight:900;
                        color:${balance.cash > 0 ? 'var(--danger)' : balance.cash < 0 ? 'var(--success)' : 'var(--muted)'};margin-top:5px">
              ${moneyFmt(Math.abs(balance.cash))} ج.م
            </div>
            <div style="font-size:10.5px;color:var(--muted);font-weight:600;margin-top:3px">
              ${balance.cash > 0 ? 'مدين لنا' : balance.cash < 0 ? 'دائن' : 'متوازن'}
            </div>
          </div>

          <div style="padding:14px;background:${balance.gold_pure > 0 ? 'var(--warn-bg)' : balance.gold_pure < 0 ? 'var(--success-bg)' : 'var(--surface-2)'};border-radius:11px;border:1px solid var(--border)">
            <div style="font-size:10.5px;font-weight:800;text-transform:uppercase;
                        color:${balance.gold_pure > 0 ? 'var(--warn)' : balance.gold_pure < 0 ? 'var(--success)' : 'var(--muted)'}">
              المديونية الذهبية
            </div>
            <div class="mono" style="font-size:20px;font-weight:900;
                        color:${balance.gold_pure > 0 ? 'var(--warn)' : balance.gold_pure < 0 ? 'var(--success)' : 'var(--muted)'};margin-top:5px">
              ${gramFmt(Math.abs(balance.gold_pure))} جم
            </div>
            <div style="font-size:10.5px;color:var(--muted);font-weight:600;margin-top:3px">
              بندق 24K
            </div>
          </div>

          <div style="padding:14px;background:var(--gold-soft);border-radius:11px;
                      border:1px solid color-mix(in srgb,var(--primary) 40%,var(--border))">
            <div style="font-size:10.5px;font-weight:800;text-transform:uppercase;
                        color:var(--warn)">
              القيمة الإجمالية
            </div>
            <div class="mono" style="font-size:20px;font-weight:900;
                        color:var(--primary);margin-top:5px">
              ${moneyFmt(Math.abs(balance.cash) + Math.abs(balance.gold_pure) * getPrice24())} ج.م
            </div>
            <div style="font-size:10.5px;color:var(--muted);font-weight:600;margin-top:3px">
              (نقد + ذهب بسعر السوق)
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <h3>
              <i data-lucide="list"></i>
              حركات الحساب
            </h3>
            <div class="spacer" style="flex:1"></div>
            <span class="card-sub">${intFmt(entries.length)} حركة</span>
          </div>

          <div style="max-height:420px;overflow-y:auto">
            ${entries.length ? `
              <table class="tbl">
                <thead>
                  <tr>
                    <th style="width:140px">التاريخ</th>
                    <th style="width:140px">النوع</th>
                    <th>البيان</th>
                    <th class="col-num" style="width:130px">نقد (ج.م)</th>
                    <th class="col-num" style="width:130px">ذهب (جم)</th>
                  </tr>
                </thead>
                <tbody>
                  ${entries.map(e => {
                    const t = LEDGER_TYPES[e.type] || LEDGER_TYPES.adjustment;
                    const cashCls = numOr(e.cash_delta, 0) > 0 ? 'var(--danger)' : numOr(e.cash_delta, 0) < 0 ? 'var(--success)' : 'var(--muted)';
                    const goldCls = numOr(e.gold_delta, 0) > 0 ? 'var(--warn)' : numOr(e.gold_delta, 0) < 0 ? 'var(--success)' : 'var(--muted)';
                    return `
                      <tr>
                        <td class="mono" style="font-size:11px;color:var(--muted)">
                          ${dateTimeAr(e.created_at)}
                        </td>
                        <td>
                          <span class="pill" style="background:var(--${t.color}-bg);color:var(--${t.color});font-size:10px">
                            <i data-lucide="${t.icon}" style="width:10px;height:10px"></i>
                            ${t.label}
                          </span>
                        </td>
                        <td style="font-size:11.5px;font-weight:600">
                          ${esc(e.description || '—')}
                        </td>
                        <td class="col-num" style="font-weight:900;color:${cashCls}">
                          ${numOr(e.cash_delta, 0) !== 0
                            ? (numOr(e.cash_delta, 0) > 0 ? '+' : '') + moneyFmt(e.cash_delta)
                            : '—'}
                        </td>
                        <td class="col-num" style="font-weight:900;color:${goldCls}">
                          ${numOr(e.gold_delta, 0) !== 0
                            ? (numOr(e.gold_delta, 0) > 0 ? '+' : '') + gramFmt(e.gold_delta)
                            : '—'}
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            ` : `
              <div class="empty" style="padding:40px">
                <i data-lucide="inbox"></i>
                <p>لا توجد حركات</p>
              </div>
            `}
          </div>
        </div>
      `,
      footer: `
        <button class="btn" data-close>إغلاق</button>
        <button class="btn btn-primary" id="b2b-cust-add-payment">
          <i data-lucide="banknote"></i> تسجيل حركة
        </button>
      `,
      onMount: (el, close) => {
        const addPayment = el.querySelector('#b2b-cust-add-payment');
        if (addPayment) {
          addPayment.onclick = () => {
            close();
            openCustomerPaymentModal(c.id);
          };
        }
      },
    });
  }

  function openCustomerPaymentModal(customerId) {
    const c = State.customers.find(x => x.id === customerId);
    if (!c) return;

    GMS.Modal.open({
      title: `تسجيل حركة — ${c.name}`,
      icon: 'banknote',
      size: 'lg',
      body: `
        <div style="font-size:11px;font-weight:800;color:var(--muted);
                    text-transform:uppercase;letter-spacing:.4px;
                    margin-bottom:10px">
          نوع الحركة
        </div>

        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:16px">
          <button type="button" data-b2b-pay-type="cash_received"
                  style="padding:12px;border-radius:10px;border:1.5px solid var(--success-border);background:var(--success-bg);cursor:pointer;font-weight:800;font-size:12px;color:var(--success);font-family:inherit">
            <i data-lucide="hand-coins" style="width:16px;height:16px"></i>
            استلام نقدي من العميل
          </button>
          <button type="button" data-b2b-pay-type="cash_payment"
                  style="padding:12px;border-radius:10px;border:1.5px solid var(--danger-border);background:var(--danger-bg);cursor:pointer;font-weight:800;font-size:12px;color:var(--danger);font-family:inherit">
            <i data-lucide="banknote" style="width:16px;height:16px"></i>
            دفع نقدي للعميل
          </button>
          <button type="button" data-b2b-pay-type="gold_received"
                  style="padding:12px;border-radius:10px;border:1.5px solid var(--warn-border);background:var(--warn-bg);cursor:pointer;font-weight:800;font-size:12px;color:var(--warn);font-family:inherit">
            <i data-lucide="package-plus" style="width:16px;height:16px"></i>
            استلام ذهب من العميل
          </button>
          <button type="button" data-b2b-pay-type="gold_delivered"
                  style="padding:12px;border-radius:10px;border:1.5px solid var(--info-border);background:var(--info-bg);cursor:pointer;font-weight:800;font-size:12px;color:var(--info);font-family:inherit">
            <i data-lucide="package-minus" style="width:16px;height:16px"></i>
            تسليم ذهب للعميل
          </button>
        </div>

        <div class="grid-form">
          <div class="field">
            <label>المبلغ النقدي (ج.م)</label>
            <input type="number" id="b2b-pay-cash" value="0"
                   step="0.01" class="mono big">
          </div>

          <div class="field">
            <label>وزن الذهب (جم صافي/بندق)</label>
            <input type="number" id="b2b-pay-gold" value="0"
                   step="0.0001" class="mono big">
          </div>

          <div class="field">
            <label>عيار الذهب</label>
            <select id="b2b-pay-karat">
              ${GMS.KARAT_ORDER.map(k => `
                <option value="${k}" ${k === 21 ? 'selected' : ''}>${k}K</option>
              `).join('')}
            </select>
          </div>

          <div class="field field-full">
            <label>ملاحظات</label>
            <input id="b2b-pay-notes" placeholder="وصف الحركة…">
          </div>
        </div>
      `,
      footer: `
        <button class="btn" data-close>إلغاء</button>
        <button class="btn btn-primary" id="b2b-pay-save">
          <i data-lucide="save"></i> حفظ الحركة
        </button>
      `,
      onMount: (el, close) => {
        const $ = (id) => el.querySelector('#' + id);
        let selectedType = 'cash_received';

        el.querySelectorAll('[data-b2b-pay-type]').forEach(btn => {
          btn.onclick = () => {
            selectedType = btn.dataset.b2bPayType;
            el.querySelectorAll('[data-b2b-pay-type]').forEach(b => {
              b.style.opacity = b === btn ? '1' : '0.5';
            });
          };
          btn.style.opacity = selectedType === btn.dataset.b2bPayType ? '1' : '0.5';
        });

        $('b2b-pay-save').onclick = async () => {
          const cash = numOr($('b2b-pay-cash').value, 0);
          const gold = numOr($('b2b-pay-gold').value, 0);
          const karat = Number($('b2b-pay-karat').value);
          const notes = $('b2b-pay-notes').value.trim();

          if (cash === 0 && gold === 0) {
            return GMS.Toast.err('أدخل مبلغاً أو وزناً');
          }

          const typeMeta = LEDGER_TYPES[selectedType];

          const cashDelta = selectedType === 'cash_received' ? cash
                          : selectedType === 'cash_payment' ? -cash : 0;
          const goldDelta = selectedType === 'gold_received' ? gold
                          : selectedType === 'gold_delivered' ? -gold : 0;

          const result = await addLedgerEntry({
            rep_id: c.rep_id,
            customer_id: c.id,
            customer_name: c.name,
            type: selectedType,
            cash_delta: cashDelta,
            gold_delta: goldDelta,
            gold_karat: gold !== 0 ? karat : null,
            gold_net_weight: selectedType === 'gold_received' ? gold
                            : selectedType === 'gold_delivered' ? -gold : 0,
            description: notes || typeMeta.label,
          });

          if (result.success) {
            GMS.Toast.ok('تم تسجيل الحركة');
            GMS.Beep?.success?.();
            close();
            refreshUI();
          } else {
            GMS.Toast.err('فشل', result.error);
          }
        };
      },
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §21 · MODAL — REP DETAILS — 🆕 مع المستحقات والإجمالي المتوقع
     ═════════════════════════════════════════════════════════════════════ */
  function openRepDetails(repId) {
    if (!canAccessRep(repId)) return GMS.Toast.err('غير مصرح');

    const rep = State.reps.find(r => r.id === repId);
    if (!rep) return;

    const pos = computeRepFullPosition(repId);
    const entries = State.ledgers
      .filter(l => l.rep_id === repId)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 100);

    const repCustomers = State.customers.filter(c => c.rep_id === repId);

    GMS.Modal.open({
      title: `الوضع المالي الكامل — ${rep.name}`,
      icon: 'vault',
      size: 'xl',
      body: `

        <!-- ═══════════════════════════════════════════════════════════
             قسم 1: الخزينة الفعلية
             ═══════════════════════════════════════════════════════════ -->
        <div style="padding:16px;
                    background:linear-gradient(135deg,
                      color-mix(in srgb,var(--success) 10%,var(--surface)) 0%,
                      var(--surface) 100%);
                    border-radius:14px;margin-bottom:14px;
                    border:2px solid color-mix(in srgb,var(--success) 40%,var(--border))">
          <div style="font-size:12px;font-weight:900;color:var(--success);
                      text-transform:uppercase;letter-spacing:.4px;
                      margin-bottom:12px;display:flex;align-items:center;gap:7px">
            <i data-lucide="wallet" style="width:14px;height:14px"></i>
            الخزينة الفعلية (الموجودة في يد البياع حالياً)
          </div>

          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
            <div style="padding:14px;background:var(--surface);
                        border-radius:10px;border:1px solid var(--border)">
              <div style="font-size:10.5px;font-weight:800;color:var(--success);
                          text-transform:uppercase">نقدية فعلية</div>
              <div class="mono" style="font-size:22px;font-weight:900;
                          color:var(--success);margin-top:5px">
                ${moneyFmt(pos.treasury.cash)}
              </div>
              <div style="font-size:10px;color:var(--muted);
                          font-weight:700;margin-top:3px">
                ج.م
              </div>
            </div>

            <div style="padding:14px;background:var(--surface);
                        border-radius:10px;border:1px solid var(--border)">
              <div style="font-size:10.5px;font-weight:800;color:var(--primary);
                          text-transform:uppercase">ذهب فعلي</div>
              <div class="mono" style="font-size:22px;font-weight:900;
                          color:var(--primary);margin-top:5px">
                ${gramFmt(pos.treasury.gold_pure)}
              </div>
              <div style="font-size:10px;color:var(--muted);
                          font-weight:700;margin-top:3px">
                جم بندق 24K
              </div>
            </div>

            <div style="padding:14px;background:var(--surface);
                        border-radius:10px;border:1px solid var(--border)">
              <div style="font-size:10.5px;font-weight:800;color:var(--info);
                          text-transform:uppercase">القيمة الفعلية</div>
              <div class="mono" style="font-size:22px;font-weight:900;
                          color:var(--info);margin-top:5px">
                ${moneyFmt(pos.treasury.total_value)}
              </div>
              <div style="font-size:10px;color:var(--muted);
                          font-weight:700;margin-top:3px">
                ج.م
              </div>
            </div>
          </div>

          ${Object.values(pos.treasury.gold_by_karat).some(v => v !== 0) ? `
            <div style="margin-top:12px;padding-top:10px;
                        border-top:1px dashed color-mix(in srgb,var(--success) 30%,var(--border))">
              <div style="font-size:10px;font-weight:800;color:var(--muted);
                          text-transform:uppercase;margin-bottom:6px">
                توزيع الذهب الفعلي حسب العيار
              </div>
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                ${Object.entries(pos.treasury.gold_by_karat).filter(([, v]) => v !== 0).map(([k, v]) => `
                  <span class="pill" style="background:var(--gold-soft);color:var(--warn)">
                    ${k}K: ${gramFmt(v)} جم
                  </span>
                `).join('')}
              </div>
            </div>
          ` : ''}
        </div>

        <!-- ═══════════════════════════════════════════════════════════
             قسم 2: المستحقات المتوقعة من العملاء
             ═══════════════════════════════════════════════════════════ -->
        <div style="padding:16px;
                    background:linear-gradient(135deg,
                      color-mix(in srgb,var(--warn) 10%,var(--surface)) 0%,
                      var(--surface) 100%);
                    border-radius:14px;margin-bottom:14px;
                    border:2px solid color-mix(in srgb,var(--warn) 40%,var(--border))">
          <div style="font-size:12px;font-weight:900;color:var(--warn);
                      text-transform:uppercase;letter-spacing:.4px;
                      margin-bottom:12px;display:flex;align-items:center;gap:7px">
            <i data-lucide="hand-coins" style="width:14px;height:14px"></i>
            المستحقات المتوقعة (مديونيات العملاء)
            <span class="chip" style="font-size:10px;
                        margin-inline-start:auto">
              ${intFmt(pos.receivables.customersCount)} عميل مدين
            </span>
          </div>

          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
            <div style="padding:14px;background:var(--surface);
                        border-radius:10px;border:1px solid var(--border)">
              <div style="font-size:10.5px;font-weight:800;color:var(--warn);
                          text-transform:uppercase">مديونية نقدية</div>
              <div class="mono" style="font-size:22px;font-weight:900;
                          color:var(--warn);margin-top:5px">
                ${moneyFmt(pos.receivables.cash)}
              </div>
              <div style="font-size:10px;color:var(--muted);
                          font-weight:700;margin-top:3px">
                ج.م
              </div>
            </div>

            <div style="padding:14px;background:var(--surface);
                        border-radius:10px;border:1px solid var(--border)">
              <div style="font-size:10.5px;font-weight:800;color:var(--warn);
                          text-transform:uppercase">مديونية ذهب</div>
              <div class="mono" style="font-size:22px;font-weight:900;
                          color:var(--warn);margin-top:5px">
                ${gramFmt(pos.receivables.gold_pure)}
              </div>
              <div style="font-size:10px;color:var(--muted);
                          font-weight:700;margin-top:3px">
                جم بندق 24K
              </div>
            </div>

            <div style="padding:14px;background:var(--surface);
                        border-radius:10px;border:1px solid var(--border)">
              <div style="font-size:10.5px;font-weight:800;color:var(--warn);
                          text-transform:uppercase">القيمة المتوقعة</div>
              <div class="mono" style="font-size:22px;font-weight:900;
                          color:var(--warn);margin-top:5px">
                ${moneyFmt(pos.receivables.total_value)}
              </div>
              <div style="font-size:10px;color:var(--muted);
                          font-weight:700;margin-top:3px">
                ج.م
              </div>
            </div>
          </div>

          <!-- قائمة العملاء المدينين -->
          ${pos.receivables.customers.length ? `
            <div style="margin-top:14px;padding-top:12px;
                        border-top:1px dashed color-mix(in srgb,var(--warn) 30%,var(--border))">
              <div style="font-size:10.5px;font-weight:800;color:var(--muted);
                          text-transform:uppercase;margin-bottom:8px">
                تفصيل المديونيات حسب العميل
              </div>
              <div style="max-height:220px;overflow-y:auto">
                <table class="tbl" style="font-size:11.5px">
                  <thead>
                    <tr>
                      <th style="width:100px">الكود</th>
                      <th>اسم العميل</th>
                      <th style="width:120px" class="col-num">مديونية نقدية</th>
                      <th style="width:120px" class="col-num">مديونية ذهب</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${pos.receivables.customers.map(cust => `
                      <tr>
                        <td class="mono" style="font-weight:800;font-size:11px">
                          ${esc(cust.code)}
                        </td>
                        <td style="font-weight:700">
                          ${esc(cust.name)}
                          ${cust.phone ? `<span class="mono" style="font-size:10px;
                                   color:var(--muted);font-weight:600;
                                   margin-inline-start:6px">
                            ${esc(cust.phone)}
                          </span>` : ''}
                        </td>
                        <td class="col-num" style="font-weight:900;color:var(--danger)">
                          ${cust.cash > 0 ? moneyFmt(cust.cash) : '—'}
                        </td>
                        <td class="col-num" style="font-weight:900;color:var(--warn)">
                          ${cust.gold_pure > 0 ? gramFmt(cust.gold_pure) : '—'}
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          ` : `
            <div style="margin-top:12px;padding:20px;text-align:center;
                        color:var(--muted);font-size:12px;font-weight:600">
              لا يوجد عملاء مدينون حالياً
            </div>
          `}
        </div>

        <!-- ═══════════════════════════════════════════════════════════
             قسم 3: الإجمالي المتوقع (بعد التحصيل الكامل)
             ═══════════════════════════════════════════════════════════ -->
        <div style="padding:16px;background:var(--gold-soft);
                    border-radius:14px;margin-bottom:16px;
                    border:2.5px solid color-mix(in srgb,var(--primary) 50%,var(--border));
                    position:relative;overflow:hidden">
          <div style="position:absolute;inset-block:0;inset-inline-start:0;
                      width:4px;background:var(--gold-grad)"></div>
          <div style="font-size:12px;font-weight:900;color:var(--primary);
                      text-transform:uppercase;letter-spacing:.4px;
                      margin-bottom:12px;display:flex;align-items:center;gap:7px">
            <i data-lucide="trending-up" style="width:14px;height:14px"></i>
            الإجمالي المتوقع = الخزينة الفعلية + المستحقات
          </div>

          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
            <div style="padding:14px;background:var(--surface);
                        border-radius:10px;
                        border:1px solid color-mix(in srgb,var(--primary) 30%,var(--border))">
              <div style="font-size:10.5px;font-weight:800;color:var(--primary);
                          text-transform:uppercase">نقدية متوقعة</div>
              <div class="mono" style="font-size:22px;font-weight:900;
                          color:var(--primary);margin-top:5px">
                ${moneyFmt(pos.expected.cash)}
              </div>
              <div style="font-size:10px;color:var(--muted);
                          font-weight:700;margin-top:3px">
                ج.م
              </div>
            </div>

            <div style="padding:14px;background:var(--surface);
                        border-radius:10px;
                        border:1px solid color-mix(in srgb,var(--primary) 30%,var(--border))">
              <div style="font-size:10.5px;font-weight:800;color:var(--primary);
                          text-transform:uppercase">ذهب متوقع</div>
              <div class="mono" style="font-size:22px;font-weight:900;
                          color:var(--primary);margin-top:5px">
                ${gramFmt(pos.expected.gold_pure)}
              </div>
              <div style="font-size:10px;color:var(--muted);
                          font-weight:700;margin-top:3px">
                جم بندق 24K
              </div>
            </div>

            <div style="padding:14px;background:var(--surface);
                        border-radius:10px;
                        border:1.5px solid var(--primary);
                        background:color-mix(in srgb,var(--primary) 8%,var(--surface))">
              <div style="font-size:10.5px;font-weight:900;color:var(--primary);
                          text-transform:uppercase">الإجمالي الكامل</div>
              <div class="mono" style="font-size:24px;font-weight:900;
                          color:var(--primary);margin-top:5px;
                          letter-spacing:-.5px">
                ${moneyFmt(pos.expected.total_value)}
              </div>
              <div style="font-size:10px;color:var(--muted);
                          font-weight:700;margin-top:3px">
                ج.م (قيمة إجمالية)
              </div>
            </div>
          </div>

          <div style="margin-top:12px;padding:10px 14px;
                      background:var(--surface);border-radius:9px;
                      font-size:11px;font-weight:700;
                      color:var(--text-2);text-align:center;
                      line-height:1.6">
            <i data-lucide="info" style="width:12px;height:12px;
               display:inline;vertical-align:-2px;color:var(--info)"></i>
            الرقم أعلاه يمثل الوضع المالي الكامل للبياع
            <b>إذا تم تحصيل كل المديونيات</b> من عملائه.
          </div>
        </div>

        <!-- ═══════════════════════════════════════════════════════════
             قسم 4: آخر الحركات
             ═══════════════════════════════════════════════════════════ -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          <div class="card">
            <div class="card-head">
              <h3>
                <i data-lucide="users"></i>
                عملاؤه
              </h3>
              <div class="spacer" style="flex:1"></div>
              <span class="chip">${intFmt(repCustomers.length)}</span>
            </div>
            <div style="max-height:200px;overflow-y:auto;padding:8px 12px">
              ${repCustomers.length ? repCustomers.slice(0, 10).map(c => {
                const b = computeCustomerBalance(c.id);
                return `
                  <div style="padding:8px 0;border-bottom:1px dashed var(--border);
                              display:flex;justify-content:space-between;
                              font-size:11.5px">
                    <span style="font-weight:700">${esc(c.name)}</span>
                    <span class="mono" style="color:${b.cash > 0 ? 'var(--danger)' : 'var(--muted)'};font-weight:800">
                      ${moneyFmt(Math.abs(b.cash))}
                    </span>
                  </div>
                `;
              }).join('') : '<div style="color:var(--muted);text-align:center;padding:20px;font-size:11.5px">لا يوجد عملاء</div>'}
            </div>
          </div>

          <div class="card">
            <div class="card-head">
              <h3>
                <i data-lucide="list"></i>
                آخر الحركات
              </h3>
            </div>
            <div style="max-height:200px;overflow-y:auto;padding:8px 12px">
              ${entries.length ? entries.slice(0, 10).map(e => {
                const t = LEDGER_TYPES[e.type] || LEDGER_TYPES.adjustment;
                return `
                  <div style="padding:6px 0;border-bottom:1px dashed var(--border);
                              font-size:11px">
                    <div style="display:flex;justify-content:space-between;
                                margin-bottom:2px">
                      <span class="pill" style="background:var(--${t.color}-bg);color:var(--${t.color});font-size:9.5px">
                        ${t.label}
                      </span>
                      <span class="mono" style="font-weight:800;color:var(--muted)">
                        ${dateAr(e.created_at)}
                      </span>
                    </div>
                    <div style="color:var(--text-2);font-weight:600;
                                white-space:nowrap;overflow:hidden;
                                text-overflow:ellipsis">
                      ${esc(e.description || '—')}
                    </div>
                  </div>
                `;
              }).join('') : '<div style="color:var(--muted);text-align:center;padding:20px;font-size:11.5px">لا توجد حركات</div>'}
            </div>
          </div>
        </div>
      `,
      footer: `
        <button class="btn" data-close>إغلاق</button>
        <button class="btn btn-info" id="b2b-rep-manual-entry">
          <i data-lucide="plus-circle"></i> حركة يدوية
        </button>
        <button class="btn btn-primary" id="b2b-rep-settle-btn">
          <i data-lucide="vault"></i> تصفية الحساب الفعلي
        </button>
      `,
      onMount: (el, close) => {
        const manualBtn = el.querySelector('#b2b-rep-manual-entry');
        if (manualBtn) {
          manualBtn.onclick = () => {
            close();
            openManualRepEntry(repId);
          };
        }

        const settleBtn = el.querySelector('#b2b-rep-settle-btn');
        if (settleBtn) {
          settleBtn.onclick = () => {
            close();
            openSettlementModal(repId);
          };
        }
      },
    });
  }

  function openManualRepEntry(repId) {
    const rep = State.reps.find(r => r.id === repId);
    if (!rep) return;

    GMS.Modal.open({
      title: `حركة يدوية — ${rep.name}`,
      icon: 'sliders',
      size: 'md',
      body: `
        <div class="grid-form">
          <div class="field">
            <label>المبلغ النقدي (ج.م)</label>
            <input type="number" id="b2b-me-cash" value="0"
                   step="0.01" class="mono big">
            <span class="hint">موجب = إيداع في الخزينة · سالب = سحب</span>
          </div>

          <div class="field">
            <label>الوزن الذهبي (جم بندق)</label>
            <input type="number" id="b2b-me-gold" value="0"
                   step="0.0001" class="mono big">
            <span class="hint">موجب = إيداع ذهب · سالب = سحب ذهب</span>
          </div>

          <div class="field field-full">
            <label>البيان</label>
            <input id="b2b-me-notes" placeholder="سبب الحركة…">
          </div>
        </div>
      `,
      footer: `
        <button class="btn" data-close>إلغاء</button>
        <button class="btn btn-primary" id="b2b-me-save">
          <i data-lucide="save"></i> حفظ
        </button>
      `,
      onMount: (el, close) => {
        const $ = (id) => el.querySelector('#' + id);

        $('b2b-me-save').onclick = async () => {
          const cash = numOr($('b2b-me-cash').value, 0);
          const gold = numOr($('b2b-me-gold').value, 0);
          const notes = $('b2b-me-notes').value.trim() || 'حركة يدوية';

          if (cash === 0 && gold === 0) return GMS.Toast.err('أدخل قيمة');

          const result = await addLedgerEntry({
            rep_id: repId,
            type: 'adjustment',
            cash_delta: cash,
            gold_delta: gold,
            description: notes,
          });

          if (result.success) {
            GMS.Toast.ok('تم تسجيل الحركة');
            close();
            refreshUI();
          } else {
            GMS.Toast.err('فشل', result.error);
          }
        };
      },
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §22 · MODAL — SETTLEMENT
     ═════════════════════════════════════════════════════════════════════ */
  function openSettlementModal(repId) {
    if (!canAccessRep(repId) && !isRepRole()) {
      return GMS.Toast.err('غير مصرح');
    }

    const rep = State.reps.find(r => r.id === repId);
    if (!rep) return GMS.Toast.err('البياع غير موجود');

    const pos = computeRepFullPosition(repId);

    GMS.Modal.open({
      title: `تصفية حساب — ${rep.name}`,
      icon: 'vault',
      size: 'lg',
      body: `
        <div style="padding:14px 16px;background:var(--surface-2);
                    border-radius:12px;margin-bottom:16px;
                    border:1px solid var(--border)">
          <div style="font-size:11px;font-weight:800;color:var(--muted);
                      text-transform:uppercase;letter-spacing:.4px;
                      margin-bottom:10px">
            ملخص الوضع المالي
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div style="padding:12px;background:var(--success-bg);
                        border-radius:10px">
              <div style="font-size:10.5px;font-weight:800;color:var(--success);
                          text-transform:uppercase">
                الخزينة الفعلية
              </div>
              <div class="mono" style="font-size:16px;font-weight:900;
                          color:var(--success);margin-top:4px">
                ${moneyFmt(pos.treasury.cash)} ج.م
              </div>
              <div class="mono" style="font-size:13px;font-weight:800;
                          color:var(--success);margin-top:2px">
                ${gramFmt(pos.treasury.gold_pure)} جم
              </div>
            </div>

            <div style="padding:12px;background:var(--warn-bg);
                        border-radius:10px">
              <div style="font-size:10.5px;font-weight:800;color:var(--warn);
                          text-transform:uppercase">
                المستحقات (للعلم فقط)
              </div>
              <div class="mono" style="font-size:16px;font-weight:900;
                          color:var(--warn);margin-top:4px">
                ${moneyFmt(pos.receivables.cash)} ج.م
              </div>
              <div class="mono" style="font-size:13px;font-weight:800;
                          color:var(--warn);margin-top:2px">
                ${gramFmt(pos.receivables.gold_pure)} جم
              </div>
            </div>
          </div>
        </div>

        <div style="margin-bottom:14px;padding:12px 14px;
                    background:var(--info-bg);border-radius:10px;
                    font-size:11.5px;font-weight:600;line-height:1.7;
                    color:var(--text-2);
                    border-inline-start:3px solid var(--info)">
          <i data-lucide="info" style="width:13px;height:13px;
             display:inline;vertical-align:-2px;color:var(--info)"></i>
          <b>ملاحظة مهمة:</b> التصفية تشمل فقط
          <b>الخزينة الفعلية</b> (الكاش والذهب الموجود في يد البياع).
          المستحقات على العملاء لا تُصفَّى، لأنها لم تُحصَّل بعد.
        </div>

        <div class="grid-form">
          <div class="field">
            <label>مبلغ التصفية النقدي (ج.م)</label>
            <input type="number" id="b2b-stl-cash"
                   value="${pos.treasury.cash}" step="0.01"
                   max="${pos.treasury.cash}" min="0" class="mono big">
            <span class="hint">الحد الأقصى: ${moneyFmt(pos.treasury.cash)} ج.م</span>
          </div>

          <div class="field">
            <label>وزن التصفية الذهبي (جم بندق)</label>
            <input type="number" id="b2b-stl-gold"
                   value="${pos.treasury.gold_pure}" step="0.0001"
                   max="${pos.treasury.gold_pure}" min="0" class="mono big">
            <span class="hint">الحد الأقصى: ${gramFmt(pos.treasury.gold_pure)} جم</span>
          </div>

          <div class="field field-full">
            <label>ملاحظات</label>
            <input id="b2b-stl-notes"
                   placeholder="ملاحظات على التصفية…">
          </div>
        </div>
      `,
      footer: `
        <button class="btn" data-close>إلغاء</button>
        <button class="btn btn-primary" id="b2b-stl-save">
          <i data-lucide="save"></i> إرسال للمدير
        </button>
      `,
      onMount: (el, close) => {
        const $ = (id) => el.querySelector('#' + id);

        $('b2b-stl-save').onclick = async () => {
          const cash = numOr($('b2b-stl-cash').value, 0);
          const gold = numOr($('b2b-stl-gold').value, 0);
          const notes = $('b2b-stl-notes').value.trim();

          const result = await createSettlement(repId, {
            cash_amount: cash,
            gold_pure: gold,
            notes,
          });

          if (result.success) {
            GMS.Toast.ok(
              `إذن ${result.settlement.settlement_no} أُرسل للمدير`,
              isManager() ? 'يمكنك اعتماده فوراً' : 'بانتظار اعتماد المدير'
            );
            GMS.Beep?.success?.();
            close();
            refreshUI();
          } else {
            GMS.Toast.err('فشل', result.error);
          }
        };
      },
    });
  }

  function openSettlementDetails(settlementId) {
    const s = State.settlements.find(x => x.id === settlementId);
    if (!s) return;
    if (!canAccessRep(s.rep_id) && !isRepRole()) return GMS.Toast.err('غير مصرح');

    const status = SETTLEMENT_STATUS[s.status] || SETTLEMENT_STATUS.DRAFT;

    GMS.Modal.open({
      title: `تفاصيل إذن التصفية — ${s.settlement_no}`,
      icon: 'vault',
      size: 'lg',
      body: `
        <div style="display:flex;align-items:center;gap:12px;padding:14px 16px;
                    background:var(--${status.color}-bg);border-radius:12px;
                    margin-bottom:16px">
          <div style="width:44px;height:44px;border-radius:12px;
                      background:var(--${status.color});color:#fff;
                      display:grid;place-items:center;flex-shrink:0">
            <i data-lucide="${status.icon}" style="width:20px;height:20px"></i>
          </div>
          <div style="flex:1">
            <div style="font-weight:900;font-size:15px;color:var(--${status.color})">
              ${status.label}
            </div>
            <div style="font-size:11.5px;color:var(--muted);font-weight:700;
                        margin-top:3px">
              ${dateTimeAr(s.created_at)} · ${timeAgo(s.created_at)}
            </div>
          </div>
        </div>

        <div class="calc-list">
          <div class="cl-row">
            <span class="k"><i data-lucide="user-check"></i> البياع</span>
            <span class="v" style="font-size:12.5px">${esc(s.rep_name)}</span>
          </div>
          <div class="cl-row">
            <span class="k"><i data-lucide="wallet"></i> مبلغ نقدي</span>
            <span class="v" style="color:var(--success);font-weight:900">
              ${moneyFmt(s.cash_amount)} ج.م
            </span>
          </div>
          <div class="cl-row">
            <span class="k"><i data-lucide="scale"></i> وزن ذهبي</span>
            <span class="v" style="color:var(--primary);font-weight:900">
              ${gramFmt(s.gold_pure)} جم بندق
            </span>
          </div>
          ${s.notes ? `
            <div class="cl-row">
              <span class="k"><i data-lucide="file-text"></i> ملاحظات</span>
              <span class="v" style="font-size:12px">${esc(s.notes)}</span>
            </div>
          ` : ''}
          <div class="cl-row">
            <span class="k"><i data-lucide="user"></i> أُنشئ بواسطة</span>
            <span class="v" style="font-size:12px">${esc(s.created_by_name || '—')}</span>
          </div>
          ${s.approved_by_name ? `
            <div class="cl-row hi">
              <span class="k"><i data-lucide="check-circle-2"></i> اعتمد بواسطة</span>
              <span class="v" style="font-size:12px">${esc(s.approved_by_name)}</span>
            </div>
          ` : ''}
        </div>
      `,
      footer: `
        <button class="btn" data-close>إغلاق</button>
        ${s.status === 'PENDING' && isManager() ? `
          <button class="btn btn-danger" id="b2b-stl-det-reject">
            <i data-lucide="x-circle"></i> رفض
          </button>
          <button class="btn btn-success" id="b2b-stl-det-approve">
            <i data-lucide="check-circle-2"></i> اعتماد
          </button>
        ` : ''}
      `,
      onMount: (el, close) => {
        const approveBtn = el.querySelector('#b2b-stl-det-approve');
        if (approveBtn) {
          approveBtn.onclick = async () => {
            close();
            const ok = await GMS.Confirm.ask(
              'سيتم اعتماد التصفية وخصم المبالغ من خزينة البياع. متابعة؟',
              { title: 'اعتماد', okText: 'اعتماد', icon: 'check-circle-2' }
            );
            if (!ok) return;

            const result = await approveSettlement(settlementId);
            if (result.success) {
              GMS.Toast.ok('تم الاعتماد');
              GMS.Beep?.success?.();
              refreshUI();
            } else {
              GMS.Toast.err('فشل', result.error);
            }
          };
        }

        const rejectBtn = el.querySelector('#b2b-stl-det-reject');
        if (rejectBtn) {
          rejectBtn.onclick = async () => {
            close();
            const reason = await GMS.Prompt.ask({
              title: 'سبب الرفض',
              label: 'السبب',
              required: false,
              icon: 'x-circle',
            });
            if (reason === null) return;

            const result = await rejectSettlement(settlementId, reason);
            if (result.success) {
              GMS.Toast.warn('تم الرفض');
              refreshUI();
            }
          };
        }
      },
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §23 · REALTIME
     ═════════════════════════════════════════════════════════════════════ */
  function bindRealtime() {
    if (!GMS.Realtime) return;

    const unsub = GMS.Realtime.on('event', (event) => {
      try {
        if (!event) return;
        if (GMS.Router?.currentId() !== 'b2b') return;

        if (['sales_reps', 'b2b_customers', 'rep_ledgers', 'rep_settlements'].includes(event.table)) {
          setTimeout(async () => {
            await loadAll();
            refreshUI();
          }, 400);
        }
      } catch (e) {
        console.warn('[B2B.realtime]', e);
      }
    });

    State.unsubscribers.push(unsub);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §24 · PUBLIC API
     ═════════════════════════════════════════════════════════════════════ */

  function getRepsForSelect() {
    if (isRepRole()) {
      return State.reps.filter(r => r.id === currentUser().rep_id);
    }
    return State.reps.filter(r => r.is_active !== false);
  }

  function getCustomersForSelect(repId) {
    return State.customers.filter(c =>
      c.is_active !== false && (!repId || c.rep_id === repId)
    );
  }

  function getDefaultRepId() {
    if (isRepRole()) return currentUser().rep_id;
    return State.activeRepFilter || null;
  }

  async function attachInvoiceToRep(invoice, repId) {
    if (!repId) return false;
    try {
      await recordInvoiceToLedger(invoice, repId);
      return true;
    } catch (e) {
      console.error('[B2B.attachInvoiceToRep]', e);
      return false;
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §25 · CLEANUP
     ═════════════════════════════════════════════════════════════════════ */
  function cleanup() {
    cleanupListeners();
  }

  /* ═════════════════════════════════════════════════════════════════════
     §26 · VIEW REGISTRATION
     ═════════════════════════════════════════════════════════════════════ */
  GMS.Views = GMS.Views || {};

  GMS.Views.b2b = {
    render,
    cleanup,
    state: State,

    load: loadAll,
    reload: async () => {
      await loadAll();
      render(document.getElementById('page'));
    },

    saveRep,
    deleteRep,
    openRepModal,
    openRepDetails,
    openManualRepEntry,

    saveCustomer,
    deleteCustomer,
    openCustomerModal,
    openCustomerLedger,
    openCustomerPaymentModal,

    addLedgerEntry,
    computeRepTreasury,
    computeCustomerBalance,
    computeRepReceivables,
    computeRepFullPosition,

    createSettlement,
    approveSettlement,
    rejectSettlement,
    openSettlementModal,
    openSettlementDetails,

    getRepsForSelect,
    getCustomersForSelect,
    getDefaultRepId,
    attachInvoiceToRep,

    STORES,
    LEDGER_TYPES,
    SETTLEMENT_STATUS,

    CacheDB,
  };

  window.B2BView = GMS.Views.b2b;

  GMS.B2B = {
    getReps: getRepsForSelect,
    getCustomers: getCustomersForSelect,
    getDefaultRepId,

    addLedgerEntry,
    attachInvoiceToRep,
    computeRepTreasury,
    computeCustomerBalance,
    computeRepReceivables,
    computeRepFullPosition,

    createSettlement,
    approveSettlement,

    LEDGER_TYPES,
    SETTLEMENT_STATUS,
    STORES,

    isManager,
    isRepRole,
    currentUser,
    canAccessRep,
  };

  console.log(
    '%c🏪 B2B Sellers Module v1.2.0 loaded · Multi-Tenant + Receivables',
    'color:#6b3fa0;font-weight:900;font-size:13px;padding:2px 6px;' +
    'background:linear-gradient(135deg,#d4c4f0,#6b3fa0);border-radius:4px;'
  );

  console.log(
    '%c✅ FIX: Customer opening balance no longer double-counted',
    'color:#0f7a43;font-weight:800;font-size:11px;'
  );

  console.log(
    '%c✅ FIX: Rep treasury excludes customer opening entries (receivables)',
    'color:#0f7a43;font-weight:800;font-size:11px;'
  );

  console.log(
    '%c🆕 NEW: 3-section rep card — Treasury | Receivables | Expected Total',
    'color:#1c4fd8;font-weight:900;font-size:11px;'
  );

  console.log(
    '%c🆕 NEW: computeRepReceivables() + computeRepFullPosition() APIs',
    'color:#1c4fd8;font-weight:900;font-size:11px;'
  );

})();
