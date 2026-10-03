/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ENTERPRISE — js/14-views-inventory.js
   صفحة المخزون الشاملة — النسخة v6.1
   ─────────────────────────────────────────────────────────────────────
   ✅ v6.1 التحديثات:
     • 🆕 دعم BaseKarat — تحويل القيم الرياضية + تسميات ديناميكية
     • 🆕 إخفاء التبويبات الفارغة تلقائياً (خزنة بدون قطع)
     • 🆕 عرض "الكل" فقط عند وجود أكثر من كيان به بضاعة
     • 🆕 الافتراضي = أول كيان فيه بضاعة فعلاً
     • 🆕 Auto-refresh عند تغيير عيار الأساس
     • 🆕 ربط event 'gms:baseKaratChanged' لإعادة الحسابات
   ─────────────────────────────────────────────────────────────────────
   المزايا المحفوظة من v6.0:
     • عزل العهدة حسب الدور (Role-Based Holder Filtering)
     • شريط تابات للتنقل بين (الكل | المحل القطاعي | عهد البياعين)
     • عمود "العهدة / الموقع" في جدول المنتجات
     • كروت تجميع لكل كيان (صافي + عدد + قيمة)
     • أمر نقل بضاعة داخلي (Internal Stock Voucher)
     • PriceManager لحظي · CRUD · QR · Bulk · Excel · Custom Karat
     • Interaction Lock (10s) لمنع إغلاق القوائم أثناء التفاعل
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const GMS = window.GMS = window.GMS || {};

  /* ═════════════════════════════════════════════════════════════════════
     §0 · ENTITY TYPES (KEEPS / HOLDERS)
     ═════════════════════════════════════════════════════════════════════ */
  const ENTITY_TYPES = Object.freeze({
    RETAIL_SHOP: {
      key: 'retail_shop',
      label: 'المحل القطاعي',
      shortLabel: 'قطاعي',
      icon: 'store',
      color: 'success',
      defaultId: 'retail-main',
    },
    B2B_REP: {
      key: 'b2b_rep',
      label: 'عهدة بياع جملة',
      shortLabel: 'بياع',
      icon: 'user-check',
      color: 'violet',
      defaultId: null,
    },
    MAIN_VAULT: {
      key: 'main_vault',
      label: 'الخزنة الرئيسية',
      shortLabel: 'خزنة',
      icon: 'vault',
      color: 'gold',
      defaultId: 'vault-main',
    },
  });

  /* ═════════════════════════════════════════════════════════════════════
     §0.1 · INTERACTION LOCK
     ═════════════════════════════════════════════════════════════════════ */
  const INTERACTION_LOCK_MS = 10000;

  function lockInteraction() {
    window.GMS = window.GMS || {};
    window.GMS._invInteractionUntil = Date.now() + INTERACTION_LOCK_MS;
  }

  function isInteractionLocked() {
    const until = window.GMS?._invInteractionUntil || 0;
    return Date.now() < until;
  }

  (function installInteractionListeners() {
    if (window.GMS._invListenersInstalled) return;
    window.GMS._invListenersInstalled = true;

    const handler = (e) => {
      const t = e.target;
      if (!t) return;
      const tag = t.tagName;
      if (tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA' ||
          t.isContentEditable) {
        lockInteraction();
      }
    };

    document.addEventListener('pointerdown', handler, true);
    document.addEventListener('focusin', handler, true);
    document.addEventListener('keydown', handler, true);
    document.addEventListener('change', handler, true);
    document.addEventListener('input', handler, true);

    console.log('[Inventory] ✅ Interaction lock installed');
  })();

  /* ═════════════════════════════════════════════════════════════════════
     §1 · INVENTORY STATE
     ═════════════════════════════════════════════════════════════════════ */
  const InvState = {
    items: [],
    filtered: [],

    page: 1,
    pageSize: 50,
    totalPages: 1,

    /* فلتر العهدة */
    entityFilter: 'all',

    entities: [],
    entitiesLoaded: false,

    filters: {
      search: '',
      karat: '',
      status: 'IN_STOCK',
      branch: '',
      manufacturer: '',
      category: '',
      onlyCustomKarat: false,
    },

    selected: new Set(),

    sortBy: 'created_at',
    sortDir: 'desc',

    columns: {
      holder: true,
      sku: true,
      category: true,
      karat: true,
      weight_grams: true,
      net_weight: true,
      pure_weight: true,
      workmanship_per_gram: true,
      total_cost: true,
      branch: true,
      manufacturer: true,
      status: true,
      created_at: false,
    },

    stats: {
      total: 0,
      filtered: 0,
      inStock: 0,
      sold: 0,
      reserved: 0,
      totalPure: 0,
      totalNet: 0,
      totalValue: 0,
      totalStoredCost: 0,
      customKaratCount: 0,
      price24: 0,
    },

    entitySummary: {},

    loading: false,
    lastRenderAt: null,

    unsubscribers: [],

    timers: {
      search: null,
    },
  };

  const COLUMNS = [
    { key: 'holder', label: 'العهدة / الموقع', width: 140, sortable: true, align: 'start' },
    { key: 'sku', label: 'كود التاج', width: 175, sortable: true, align: 'start' },
    { key: 'category', label: 'التصنيف', width: 100, sortable: true, align: 'start' },
    { key: 'karat', label: 'العيار', width: 95, sortable: true, align: 'center' },
    { key: 'weight_grams', label: 'قائم', width: 85, sortable: true, align: 'end' },
    { key: 'net_weight', label: 'صافي', width: 85, sortable: true, align: 'end' },
    { key: 'pure_weight', label: 'بندق 24K', width: 100, sortable: true, align: 'end' },
    { key: 'workmanship_per_gram', label: 'مصنعية/جم', width: 100, sortable: true, align: 'end' },
    { key: 'total_cost', label: 'الإجمالي', width: 110, sortable: true, align: 'end' },
    { key: 'branch', label: 'الفرع', width: 130, sortable: false, align: 'start' },
    { key: 'manufacturer', label: 'الماركة', width: 110, sortable: false, align: 'start' },
    { key: 'status', label: 'الحالة', width: 100, sortable: true, align: 'center' },
    { key: 'created_at', label: 'التاريخ', width: 105, sortable: true, align: 'start' },
  ];

  /* ═════════════════════════════════════════════════════════════════════
     §2 · HELPERS
     ═════════════════════════════════════════════════════════════════════ */

  function setText(selector, value) {
    const el = document.querySelector(selector);
    if (el && el.textContent !== String(value)) {
      el.textContent = String(value);
    }
  }

  function cleanupListeners() {
    InvState.unsubscribers.forEach(fn => {
      try { fn(); } catch (_) {}
    });
    InvState.unsubscribers = [];

    clearTimeout(InvState.timers.search);
  }

  function getManufacturers() {
    if (GMS.Cache?.getManufacturersList) {
      const list = GMS.Cache.getManufacturersList();
      if (list && list.length) return list;
    }
    if (GMS.Demo?.getManufacturers) return GMS.Demo.getManufacturers();
    return GMS.DEFAULT_MANUFACTURERS.map(m => ({ ...m }));
  }

  function buildUniqueSku(baseSku, index, total) {
    if (total <= 1) return baseSku;
    const suffix = String(index).padStart(3, '0');
    const clean = String(baseSku || '').replace(/-\d{3}$/, '');
    return `${clean}-${suffix}`;
  }

  function getItemKaratInfo(item) {
    if (!item) return GMS.resolveKarat(21);
    return GMS.getItemKarat(item);
  }

  function getCurrentPrice24() {
    try {
      if (GMS.PriceManager?.current) {
        const p = GMS.PriceManager.current();
        if (p > 0) return p;
      }
      if (GMS.Cache?.getPrice) {
        const p = GMS.Cache.getPrice();
        if (p && p.price_24) return Number(p.price_24);
      }
    } catch (_) {}
    return Number(GMS.APP_CONFIG?.DEFAULT_PRICE_24) || 4500;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §2.1 · BASE KARAT HELPERS — ✅ جديد
     ═════════════════════════════════════════════════════════════════════ */

  /** تسمية العيار النشط (مثلاً "18K") */
  function getBaseLabel() {
    try {
      if (GMS.BaseKarat?.labelShort) return GMS.BaseKarat.labelShort;
    } catch (_) {}
    return '24K';
  }

  /** العيار النشط رقمياً */
  function getBaseKarat() {
    try {
      if (GMS.BaseKarat?.current) return GMS.BaseKarat.current;
    } catch (_) {}
    return 24;
  }

  /**
   * تحويل قيمة بندق 24K إلى العيار النشط
   * @param {number} pure24 — القيمة ببندق 24K
   * @returns {number}
   */
  function convertFromPure24(pure24) {
    const v = Number(pure24) || 0;
    if (v === 0) return 0;
    try {
      if (GMS.BaseKarat?.fromPure) {
        return GMS.BaseKarat.fromPure(v, getBaseKarat());
      }
      /* Fallback: pure24 × (24 / base) */
      const ratio = getBaseKarat() / 24;
      return ratio > 0 ? v / ratio : v;
    } catch (_) {
      return v;
    }
  }

  /** label موحّد: "بندق 18K" أو "بندق 24K" */
  function bondokLabel() {
    return `بندق ${getBaseLabel()}`;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §2.5 · ENTITY / HOLDER HELPERS
     ═════════════════════════════════════════════════════════════════════ */

  function getItemHolder(item) {
    if (!item) {
      return {
        type: ENTITY_TYPES.RETAIL_SHOP.key,
        id: ENTITY_TYPES.RETAIL_SHOP.defaultId,
        name: ENTITY_TYPES.RETAIL_SHOP.label,
      };
    }

    const type = item.holder_type || ENTITY_TYPES.RETAIL_SHOP.key;
    const id = item.holder_id || (
      type === ENTITY_TYPES.B2B_REP.key ? null : ENTITY_TYPES.RETAIL_SHOP.defaultId
    );
    const name = item.holder_name || (
      type === ENTITY_TYPES.B2B_REP.key ? 'بياع جملة' : ENTITY_TYPES.RETAIL_SHOP.label
    );

    return { type, id, name };
  }

  function setItemHolder(item, holder) {
    if (!item || !holder) return item;
    item.holder_type = holder.type || ENTITY_TYPES.RETAIL_SHOP.key;
    item.holder_id = holder.id || null;
    item.holder_name = holder.name || '—';
    return item;
  }

  function isCurrentUserRep() {
    try {
      const role = GMS.Auth?.profile?.role;
      return role === 'B2B_REP';
    } catch (_) { return false; }
  }

  function isCurrentUserManager() {
    try {
      const role = GMS.Auth?.profile?.role;
      return role === 'SUPER_ADMIN' ||
             role === 'BRANCH_MANAGER' ||
             role === 'ACCOUNTANT';
    } catch (_) { return false; }
  }

  function getCurrentRepId() {
    try {
      return GMS.Auth?.profile?.rep_id || null;
    } catch (_) { return null; }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §2.6 · LOAD ENTITIES — ✅ v6.1 (إخفاء الفارغة + عدّاد لكل كيان)
     ═════════════════════════════════════════════════════════════════════
     - فقط الكيانات التي فيها بضاعة فعلية تظهر
     - "الكل" يظهر فقط لو فيه أكثر من كيان غير فارغ
     - الافتراضي = أول كيان فيه بضاعة
     ═════════════════════════════════════════════════════════════════════ */
  async function loadEntities() {
    const list = [];
    const visibleItems = (InvState.items || []).filter(itemVisibleToUser);

    /* ─── عدّ العناصر في كل كيان ─── */
    const counts = {
      retail_shop: 0,
      main_vault: 0,
      reps: {},
    };

    visibleItems.forEach(item => {
      const holder = getItemHolder(item);

      if (holder.type === ENTITY_TYPES.RETAIL_SHOP.key) {
        counts.retail_shop++;
      } else if (holder.type === ENTITY_TYPES.MAIN_VAULT.key) {
        counts.main_vault++;
      } else if (holder.type === ENTITY_TYPES.B2B_REP.key && holder.id) {
        counts.reps[holder.id] = (counts.reps[holder.id] || 0) + 1;
      } else {
        /* fallback: عنصر بدون holder صحيح → يُحسب في retail */
        counts.retail_shop++;
      }
    });

    if (isCurrentUserManager()) {
      /* عدد الكيانات غير الفارغة */
      const nonEmptyCount =
        (counts.retail_shop > 0 ? 1 : 0) +
        (counts.main_vault > 0 ? 1 : 0) +
        Object.values(counts.reps).filter(c => c > 0).length;

      /* "الكل" فقط لو فيه أكثر من كيان به بضاعة */
      if (nonEmptyCount > 1) {
        list.push({
          key: 'all',
          id: 'all',
          name: 'كل المخزون',
          shortLabel: 'الكل',
          type: 'all',
          icon: 'layers',
          color: 'gold',
          isAll: true,
          count: visibleItems.length,
        });
      }

      /* المحل القطاعي — فقط لو فيه عناصر */
      if (counts.retail_shop > 0) {
        list.push({
          key: ENTITY_TYPES.RETAIL_SHOP.key,
          id: ENTITY_TYPES.RETAIL_SHOP.defaultId,
          name: ENTITY_TYPES.RETAIL_SHOP.label,
          shortLabel: ENTITY_TYPES.RETAIL_SHOP.shortLabel,
          type: ENTITY_TYPES.RETAIL_SHOP.key,
          icon: ENTITY_TYPES.RETAIL_SHOP.icon,
          color: ENTITY_TYPES.RETAIL_SHOP.color,
          count: counts.retail_shop,
        });
      }

      /* الخزنة الرئيسية — فقط لو فيها عناصر */
      if (counts.main_vault > 0) {
        list.push({
          key: ENTITY_TYPES.MAIN_VAULT.key,
          id: ENTITY_TYPES.MAIN_VAULT.defaultId,
          name: ENTITY_TYPES.MAIN_VAULT.label,
          shortLabel: ENTITY_TYPES.MAIN_VAULT.shortLabel,
          type: ENTITY_TYPES.MAIN_VAULT.key,
          icon: ENTITY_TYPES.MAIN_VAULT.icon,
          color: ENTITY_TYPES.MAIN_VAULT.color,
          count: counts.main_vault,
        });
      }

      /* بياعي الجملة — فقط اللي عندهم بضاعة */
      try {
        const reps = GMS.B2B?.getReps?.() || [];
        reps.forEach(rep => {
          const repCount = counts.reps[rep.id] || 0;
          if (repCount > 0) {
            list.push({
              key: `rep:${rep.id}`,
              id: rep.id,
              name: rep.name,
              shortLabel: rep.code || rep.name,
              type: ENTITY_TYPES.B2B_REP.key,
              icon: ENTITY_TYPES.B2B_REP.icon,
              color: ENTITY_TYPES.B2B_REP.color,
              rep_code: rep.code,
              rep_phone: rep.phone,
              count: repCount,
            });
          }
        });
      } catch (e) {
        console.warn('[Inventory] Failed to load reps:', e);
      }
    } else if (isCurrentUserRep()) {
      /* بياع الجملة → يرى نفسه فقط */
      const myRepId = getCurrentRepId();
      if (myRepId) {
        try {
          const reps = GMS.B2B?.getReps?.() || [];
          const me = reps.find(r => r.id === myRepId);
          const repCount = counts.reps[myRepId] || 0;

          if (repCount > 0 || true) {
            /* نعرض نفسه حتى لو فارغ */
            list.push({
              key: `rep:${myRepId}`,
              id: myRepId,
              name: me?.name || 'عهدتي',
              shortLabel: me?.code || 'عهدتي',
              type: ENTITY_TYPES.B2B_REP.key,
              icon: ENTITY_TYPES.B2B_REP.icon,
              color: ENTITY_TYPES.B2B_REP.color,
              count: repCount,
            });
          }
        } catch (_) {
          list.push({
            key: `rep:${myRepId}`,
            id: myRepId,
            name: 'عهدتي',
            shortLabel: 'عهدتي',
            type: ENTITY_TYPES.B2B_REP.key,
            icon: ENTITY_TYPES.B2B_REP.icon,
            color: ENTITY_TYPES.B2B_REP.color,
            count: counts.reps[myRepId] || 0,
          });
        }
      }
    }

    /* بائع قطاعي أو أي دور آخر → المحل القطاعي فقط */
    if (!list.length) {
      list.push({
        key: ENTITY_TYPES.RETAIL_SHOP.key,
        id: ENTITY_TYPES.RETAIL_SHOP.defaultId,
        name: ENTITY_TYPES.RETAIL_SHOP.label,
        shortLabel: ENTITY_TYPES.RETAIL_SHOP.shortLabel,
        type: ENTITY_TYPES.RETAIL_SHOP.key,
        icon: ENTITY_TYPES.RETAIL_SHOP.icon,
        color: ENTITY_TYPES.RETAIL_SHOP.color,
        count: counts.retail_shop,
      });
    }

    InvState.entities = list;
    InvState.entitiesLoaded = true;

    /* ─── تعيين الفلتر الافتراضي ─── */
    if (isCurrentUserRep()) {
      /* بياع → عهدته */
      InvState.entityFilter = list[0]?.key || 'all';
    } else if (isCurrentUserManager()) {
      /* مدير → "الكل" لو موجود، وإلا أول كيان */
      const allEntity = list.find(e => e.isAll);
      InvState.entityFilter = allEntity ? 'all' : (list[0]?.key || 'all');
    } else {
      /* أدوار أخرى → أول كيان */
      InvState.entityFilter = list[0]?.key || 'all';
    }

    console.log('[Inventory] ✅ Entities loaded:', {
      total: list.length,
      filter: InvState.entityFilter,
      counts,
    });

    return list;
  }

  function getActiveEntityId() {
    if (!InvState.entityFilter || InvState.entityFilter === 'all') return null;
    const ent = InvState.entities.find(e => e.key === InvState.entityFilter);
    return ent ? ent.id : null;
  }

  function itemMatchesEntity(item) {
    if (InvState.entityFilter === 'all') return true;

    const holder = getItemHolder(item);
    const ent = InvState.entities.find(e => e.key === InvState.entityFilter);
    if (!ent) return true;

    if (ent.type === 'all') return true;

    if (ent.type === ENTITY_TYPES.B2B_REP.key) {
      return holder.type === ENTITY_TYPES.B2B_REP.key && holder.id === ent.id;
    }

    return holder.type === ent.type;
  }

  function itemVisibleToUser(item) {
    if (isCurrentUserManager()) return true;

    if (isCurrentUserRep()) {
      const myRepId = getCurrentRepId();
      if (!myRepId) return false;
      const holder = getItemHolder(item);
      return holder.type === ENTITY_TYPES.B2B_REP.key && holder.id === myRepId;
    }

    /* بائع قطاعي → يرى المحل فقط */
    const holder = getItemHolder(item);
    return holder.type === ENTITY_TYPES.RETAIL_SHOP.key ||
           holder.type === ENTITY_TYPES.MAIN_VAULT.key;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §3 · DATA LOADING
     ═════════════════════════════════════════════════════════════════════ */

  async function loadInventory() {
    try {
      InvState.loading = true;

      if (GMS.IDB && GMS.IDB.isOpen) {
        try {
          const items = await GMS.IDB.getAll();
          if (items.length) {
            items.forEach(it => {
              if (!it.holder_type) {
                it.holder_type = ENTITY_TYPES.RETAIL_SHOP.key;
                it.holder_id = ENTITY_TYPES.RETAIL_SHOP.defaultId;
                it.holder_name = ENTITY_TYPES.RETAIL_SHOP.label;
              }
            });
            InvState.items = items;
            return items;
          }
        } catch (e) {
          console.warn('[Inventory] IDB read failed:', e);
        }
      }

      if (GMS.Demo) {
        const items = GMS.Demo.getInventory();
        items.forEach(it => {
          if (!it.holder_type) {
            it.holder_type = ENTITY_TYPES.RETAIL_SHOP.key;
            it.holder_id = ENTITY_TYPES.RETAIL_SHOP.defaultId;
            it.holder_name = ENTITY_TYPES.RETAIL_SHOP.label;
          }
        });
        InvState.items = items;
        return InvState.items;
      }

      InvState.items = [];
      return [];
    } finally {
      InvState.loading = false;
    }
  }

  function applyFilters() {
    const f = InvState.filters;

    let rows = InvState.items.filter(itemVisibleToUser);

    /* فلتر الكيان */
    if (InvState.entityFilter && InvState.entityFilter !== 'all') {
      rows = rows.filter(itemMatchesEntity);
    }

    if (f.search) {
      const q = f.search.toLowerCase().trim();
      rows = rows.filter(i =>
        (i.sku || '').toLowerCase().includes(q) ||
        (i.manufacturer_name || '').toLowerCase().includes(q) ||
        (i.manufacturer_code || '').toLowerCase().includes(q) ||
        (i.category || '').toLowerCase().includes(q) ||
        (i.holder_name || '').toLowerCase().includes(q)
      );
    }

    if (f.karat) {
      if (f.karat === 'custom') {
        rows = rows.filter(i => i.is_custom_karat === true || i.custom_karat != null);
      } else {
        const karatNum = Number(f.karat);
        rows = rows.filter(i => Number(i.karat) === karatNum);
      }
    }

    if (f.status) rows = rows.filter(i => i.status === f.status);
    if (f.branch) rows = rows.filter(i => i.branch_id === f.branch);

    if (f.manufacturer) {
      rows = rows.filter(i =>
        (i.manufacturer_code || '').toUpperCase() === f.manufacturer.toUpperCase()
      );
    }

    if (f.category) rows = rows.filter(i => i.category === f.category);
    if (f.onlyCustomKarat) {
      rows = rows.filter(i => i.is_custom_karat === true || i.custom_karat != null);
    }

    const dir = InvState.sortDir === 'desc' ? -1 : 1;
    const key = InvState.sortBy;

    rows.sort((a, b) => {
      if (key === 'holder') {
        const ha = getItemHolder(a).name || '';
        const hb = getItemHolder(b).name || '';
        return ha.localeCompare(hb, 'ar') * dir;
      }

      let av = a[key];
      let bv = b[key];

      if (key === 'karat') {
        const aInfo = getItemKaratInfo(a);
        const bInfo = getItemKaratInfo(b);
        const aScore = aInfo.is_custom ? (1000 + aInfo.custom_karat) : aInfo.karat;
        const bScore = bInfo.is_custom ? (1000 + bInfo.custom_karat) : bInfo.karat;
        return (aScore - bScore) * dir;
      }

      if (key === 'total_cost') {
        const aVal = computeLiveValue(a);
        const bVal = computeLiveValue(b);
        return (aVal - bVal) * dir;
      }

      if (av === undefined || av === null) av = '';
      if (bv === undefined || bv === null) bv = '';

      if (typeof av === 'number' && typeof bv === 'number') {
        return (av - bv) * dir;
      }
      return String(av).localeCompare(String(bv), 'ar') * dir;
    });

    InvState.filtered = rows;
    InvState.totalPages = Math.max(1, Math.ceil(rows.length / InvState.pageSize));
    if (InvState.page > InvState.totalPages) InvState.page = InvState.totalPages;

    updateStats();
    computeEntitySummary();
    return rows;
  }

  function computeLiveValue(item, price24) {
    if (!item) return 0;
    const p24 = price24 || getCurrentPrice24();
    const pure = Number(item.pure_weight || 0);
    const net = Number(item.net_weight || 0);
    const saleMake = Number(item.workmanship_per_gram || 0);
    return GMS.round((pure * p24) + (net * saleMake), 2);
  }

  function computeAggregateValues(items, price24) {
    const p24 = price24 || getCurrentPrice24();
    let total = 0;
    let stored = 0;
    (items || []).forEach(item => {
      total += computeLiveValue(item, p24);
      stored += Number(item.total_cost || 0);
    });
    return {
      total: GMS.round(total, 2),
      stored: GMS.round(stored, 2),
      diff: GMS.round(total - stored, 2),
    };
  }

  function updateStats() {
    const all = InvState.items.filter(itemVisibleToUser);
    const filtered = InvState.filtered;
    const price24 = getCurrentPrice24();

    let totalPure = 0;
    let totalNet = 0;
    let totalValue = 0;
    let totalStoredCost = 0;
    let customKaratCount = 0;

    filtered.forEach(i => {
      const pure = Number(i.pure_weight || 0);
      const net = Number(i.net_weight || 0);
      totalPure += pure;
      totalNet += net;
      totalValue += computeLiveValue(i, price24);
      totalStoredCost += Number(i.total_cost || 0);
      if (i.is_custom_karat === true || i.custom_karat != null) customKaratCount++;
    });

    InvState.stats = {
      total: all.length,
      filtered: filtered.length,
      inStock: all.filter(i => i.status === 'IN_STOCK').length,
      sold: all.filter(i => i.status === 'SOLD').length,
      reserved: all.filter(i => i.status === 'RESERVED').length,
      totalPure: GMS.round(totalPure, 4),
      totalNet: GMS.round(totalNet, 3),
      totalValue: GMS.round(totalValue, 2),
      totalStoredCost: GMS.round(totalStoredCost, 2),
      customKaratCount,
      price24: Number(price24),
    };
  }

  function computeEntitySummary() {
    const summary = {};
    const price24 = getCurrentPrice24();
    const visible = InvState.items.filter(itemVisibleToUser);

    InvState.entities.forEach(ent => {
      summary[ent.key] = {
        count: 0,
        net: 0,
        pure: 0,
        value: 0,
      };
    });

    if (summary['all']) {
      visible.forEach(item => {
        const net = Number(item.net_weight || 0);
        const pure = Number(item.pure_weight || 0);
        summary['all'].count++;
        summary['all'].net += net;
        summary['all'].pure += pure;
        summary['all'].value += computeLiveValue(item, price24);
      });
      summary['all'].net = GMS.round(summary['all'].net, 3);
      summary['all'].pure = GMS.round(summary['all'].pure, 4);
      summary['all'].value = GMS.round(summary['all'].value, 2);
    }

    visible.forEach(item => {
      const holder = getItemHolder(item);
      const key = holder.type === ENTITY_TYPES.B2B_REP.key
        ? `rep:${holder.id}`
        : holder.type;

      if (!summary[key]) return;

      const net = Number(item.net_weight || 0);
      const pure = Number(item.pure_weight || 0);
      summary[key].count++;
      summary[key].net += net;
      summary[key].pure += pure;
      summary[key].value += computeLiveValue(item, price24);
    });

    Object.keys(summary).forEach(k => {
      summary[k].net = GMS.round(summary[k].net, 3);
      summary[k].pure = GMS.round(summary[k].pure, 4);
      summary[k].value = GMS.round(summary[k].value, 2);
    });

    InvState.entitySummary = summary;
    return summary;
  }

  function getPageItems() {
    const start = (InvState.page - 1) * InvState.pageSize;
    return InvState.filtered.slice(start, start + InvState.pageSize);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §4 · HTML RENDERERS — KPI
     ═════════════════════════════════════════════════════════════════════ */

  function renderKPI(cls, icon, label, value, unit, meta) {
    return `
      <div class="kpi ${cls}">
        <div class="kpi-label">
          <i data-lucide="${icon}"></i>
          ${GMS.esc(label)}
        </div>
        <div class="kpi-value">
          ${value}
          ${unit ? `<small>${GMS.esc(unit)}</small>` : ''}
        </div>
        <div class="kpi-meta">${meta}</div>
      </div>
    `;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §4.5 · ENTITY TABS
     ═════════════════════════════════════════════════════════════════════ */

  function renderEntityTabs() {
    if (!InvState.entities.length) return '';
    /* لا نُظهر التابات لو هناك كيان واحد فقط ولا يوجد "الكل" */
    if (InvState.entities.length <= 1) return '';

    return `
      <div class="card" style="margin-bottom:14px;padding:14px 18px">
        <div style="display:flex;align-items:center;gap:12px;
                    flex-wrap:wrap;margin-bottom:12px">
          <div style="display:flex;align-items:center;gap:8px">
            <i data-lucide="layout-grid"
               style="width:16px;height:16px;color:var(--primary)"></i>
            <span style="font-size:12.5px;font-weight:900">
              تصفية حسب العهدة
            </span>
          </div>
          <div class="spacer" style="flex:1"></div>
          <span class="chip info" style="font-size:10.5px">
            <i data-lucide="layers" style="width:11px;height:11px"></i>
            ${GMS.intFmt(InvState.entities.length)} كيان
          </span>
          ${isCurrentUserManager() ? `
            <button class="btn btn-sm btn-primary"
                    id="inv-internal-transfer-btn"
                    type="button"
                    title="نقل بضاعة من كيان لآخر">
              <i data-lucide="arrow-right-left"></i>
              أمر نقل بضاعة
            </button>
          ` : ''}
        </div>

        <div class="tabs-bar" style="position:relative;top:0;
                    padding:0;background:transparent;
                    border-bottom:none;margin-bottom:0;
                    overflow-x:auto;gap:6px">
          ${InvState.entities.map(ent => {
            const isActive = InvState.entityFilter === ent.key;
            const sm = InvState.entitySummary[ent.key] || { count: 0, pure: 0 };

            const colorMap = {
              'gold': 'var(--primary)',
              'success': 'var(--success)',
              'violet': 'var(--violet)',
              'info': 'var(--info)',
            };
            const clr = colorMap[ent.color] || 'var(--primary)';

            return `
              <button class="tab ${isActive ? 'active' : ''}"
                      data-entity-tab="${GMS.esc(ent.key)}"
                      type="button"
                      style="padding:10px 16px;border-radius:10px 10px 0 0;
                             min-height:auto;
                             ${isActive ? `
                               background:color-mix(in srgb,${clr} 12%,var(--surface-2));
                               border-bottom:2.5px solid ${clr};
                             ` : ''}">
                <i data-lucide="${ent.icon}"
                   style="width:13px;height:13px;
                          ${isActive ? `color:${clr}` : ''}"></i>
                <span style="font-weight:800;font-size:11.5px;
                             ${isActive ? `color:${clr}` : ''}">
                  ${GMS.esc(ent.shortLabel || ent.name)}
                </span>
                <span class="chip"
                      style="font-size:9.5px;padding:1px 6px;
                             margin-inline-start:6px;
                             background:${isActive
                               ? `color-mix(in srgb,${clr} 18%,transparent)`
                               : 'var(--surface-3)'};
                             color:${isActive ? clr : 'var(--muted)'}">
                  ${GMS.intFmt(sm.count)}
                </span>
              </button>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  function renderEntitySummaryCards() {
    if (!isCurrentUserManager()) return '';
    if (!InvState.entities.length) return '';
    const entities = InvState.entities.filter(e => !e.isAll);
    if (entities.length <= 0) return '';

    const baseLabel = getBaseLabel();

    return `
      <div style="display:grid;
                  grid-template-columns:repeat(auto-fit,minmax(200px,1fr));
                  gap:10px;margin-bottom:14px">
        ${entities.map(ent => {
          const sm = InvState.entitySummary[ent.key] || { count: 0, pure: 0, value: 0 };
          const colorMap = {
            'gold': 'var(--primary)',
            'success': 'var(--success)',
            'violet': 'var(--violet)',
            'info': 'var(--info)',
          };
          const clr = colorMap[ent.color] || 'var(--primary)';

          /* ✅ تحويل القيمة للعيار النشط */
          const displayPure = convertFromPure24(sm.pure);

          return `
            <div style="padding:12px 14px;
                        background:linear-gradient(135deg,
                          color-mix(in srgb,${clr} 8%,var(--surface)) 0%,
                          var(--surface) 100%);
                        border-radius:11px;
                        border:1.5px solid color-mix(in srgb,${clr} 35%,var(--border));
                        cursor:pointer;
                        transition:all .2s"
                 data-entity-card="${GMS.esc(ent.key)}">
              <div style="display:flex;align-items:center;gap:8px;
                          margin-bottom:8px">
                <div style="width:26px;height:26px;border-radius:7px;
                            background:${clr};color:#fff;
                            display:grid;place-items:center;
                            flex-shrink:0">
                  <i data-lucide="${ent.icon}" style="width:13px;height:13px"></i>
                </div>
                <div style="font-size:11.5px;font-weight:900;
                            color:${clr};flex:1;
                            white-space:nowrap;overflow:hidden;
                            text-overflow:ellipsis">
                  ${GMS.esc(ent.shortLabel || ent.name)}
                </div>
                <span class="chip" style="font-size:10px;
                            background:color-mix(in srgb,${clr} 15%,transparent);
                            color:${clr}">
                  ${GMS.intFmt(sm.count)} قطعة
                </span>
              </div>
              <div style="display:flex;justify-content:space-between;
                          align-items:baseline;gap:6px">
                <div>
                  <div style="font-size:9.5px;color:var(--muted);
                              font-weight:800">
                    الصافي ${baseLabel}
                  </div>
                  <div class="mono" style="font-size:13px;font-weight:900;
                              color:${clr}">
                    ${GMS.gramFmt(displayPure)} جم
                  </div>
                </div>
                <div style="text-align:end">
                  <div style="font-size:9.5px;color:var(--muted);
                              font-weight:800">القيمة</div>
                  <div class="mono" style="font-size:13px;font-weight:900;
                              color:var(--primary)">
                    ${GMS.moneyFmt(sm.value)}
                  </div>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §5 · TABLE RENDERERS
     ═════════════════════════════════════════════════════════════════════ */

  function renderHeader(col) {
    if (!InvState.columns[col.key]) return '';

    /* ✅ v6.1: عمود البندق يعرض العيار النشط */
    let label = col.label;
    if (col.key === 'pure_weight') {
      label = `بندق ${getBaseLabel()}`;
    }

    const isSorted = InvState.sortBy === col.key;
    const sortIcon = !col.sortable
      ? ''
      : isSorted
        ? (InvState.sortDir === 'asc' ? 'arrow-up' : 'arrow-down')
        : 'arrow-up-down';

    const alignClass = col.align === 'end' ? 'col-num'
                     : col.align === 'center' ? 'col-c' : '';

    return `
      <th class="${col.sortable ? 'sortable' : ''} ${isSorted ? 'sorted' : ''} ${alignClass}"
          ${col.sortable ? `data-sort="${col.key}"` : ''}
          style="width:${col.width}px;cursor:${col.sortable ? 'pointer' : 'default'}">
        <div style="display:flex;align-items:center;gap:5px;
                    justify-content:${col.align === 'end' ? 'flex-end' : col.align === 'center' ? 'center' : 'flex-start'}">
          <span>${GMS.esc(label)}</span>
          ${col.sortable ? `
            <i data-lucide="${sortIcon}"
               style="width:11px;height:11px;opacity:${isSorted ? '1' : '0.35'};
                      color:${isSorted ? 'var(--primary)' : 'currentColor'}"></i>
          ` : ''}
        </div>
      </th>
    `;
  }

  function renderKaratBadge(item) {
    const info = getItemKaratInfo(item);

    if (info.is_custom) {
      const num = info.custom_karat;
      const purity = Number(info.purity_ratio || 0);
      return `
        <span class="karat-badge custom-karat-badge"
              data-k="custom" data-custom="${num}"
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

  function renderHolderBadge(item) {
    const holder = getItemHolder(item);

    const meta = holder.type === ENTITY_TYPES.B2B_REP.key
      ? ENTITY_TYPES.B2B_REP
      : holder.type === ENTITY_TYPES.MAIN_VAULT.key
        ? ENTITY_TYPES.MAIN_VAULT
        : ENTITY_TYPES.RETAIL_SHOP;

    const colorMap = {
      'gold': 'var(--primary)',
      'success': 'var(--success)',
      'violet': 'var(--violet)',
      'info': 'var(--info)',
    };
    const clr = colorMap[meta.color] || 'var(--primary)';

    return `
      <span style="display:inline-flex;align-items:center;gap:5px;
                   padding:3px 9px;border-radius:20px;
                   background:color-mix(in srgb,${clr} 12%,transparent);
                   color:${clr};font-size:10.5px;font-weight:800;
                   white-space:nowrap">
        <i data-lucide="${meta.icon}" style="width:10px;height:10px"></i>
        ${GMS.esc(holder.name || meta.label)}
      </span>
    `;
  }

  function renderRow(item, idx, globalIdx) {
    const isSelected = InvState.selected.has(item.sku);
    const status = GMS.getStatus(item.status);

    const branchName = item.branch_name
      || (GMS.Demo?.getBranches()?.find(b => b.id === item.branch_id)?.name || '—');

    const cells = [];

    if (InvState.columns.holder) {
      cells.push(`<td>${renderHolderBadge(item)}</td>`);
    }

    if (InvState.columns.sku) {
      cells.push(`
        <td>
          <div class="cell-sku">
            <span class="sku-code">${GMS.esc(item.sku || '—')}</span>
            <span class="sku-meta">${GMS.esc(item.manufacturer_name || '—')}</span>
          </div>
        </td>
      `);
    }

    if (InvState.columns.category) {
      cells.push(`<td style="font-size:11.5px">${GMS.esc(item.category || '—')}</td>`);
    }

    if (InvState.columns.karat) {
      cells.push(`<td class="col-c">${renderKaratBadge(item)}</td>`);
    }

    if (InvState.columns.weight_grams) {
      cells.push(`<td class="col-num">${GMS.gramFmt(item.weight_grams)}</td>`);
    }

    if (InvState.columns.net_weight) {
      cells.push(`<td class="col-num"><b>${GMS.gramFmt(item.net_weight)}</b></td>`);
    }

    if (InvState.columns.pure_weight) {
      /* ✅ v6.1: تحويل القيمة للعيار النشط */
      const displayPure = convertFromPure24(item.pure_weight);
      cells.push(`<td class="col-num" style="color:var(--primary);font-weight:900">
        ${GMS.gramFmt(displayPure)}</td>`);
    }

    if (InvState.columns.workmanship_per_gram) {
      cells.push(`<td class="col-num">${GMS.moneyFmt(item.workmanship_per_gram)}</td>`);
    }

    if (InvState.columns.total_cost) {
      const price24 = getCurrentPrice24();
      const liveValue = computeLiveValue(item, price24);
      const storedCost = Number(item.total_cost || 0);
      const diff = GMS.round(liveValue - storedCost, 2);

      cells.push(`
        <td class="col-num" style="font-weight:900">
          ${GMS.moneyFmt(liveValue)}
          ${Math.abs(diff) > 0.5 ? `
            <div style="font-size:9px;font-weight:700;
                        color:${diff > 0 ? 'var(--success)' : 'var(--danger)'};
                        margin-top:1px;opacity:.85">
              ${diff > 0 ? '+' : ''}${GMS.moneyFmt(diff)}
            </div>
          ` : ''}
        </td>
      `);
    }

    if (InvState.columns.branch) {
      cells.push(`<td style="font-size:11px;color:var(--muted)">${GMS.esc(branchName)}</td>`);
    }

    if (InvState.columns.manufacturer) {
      cells.push(`<td>
        <span style="font-weight:800;font-size:11.5px">
          ${GMS.esc(item.manufacturer_code || '—')}
        </span>
      </td>`);
    }

    if (InvState.columns.status) {
      cells.push(`<td class="col-c">
        <span class="pill ${status.cls}">
          <i data-lucide="${status.icon}"></i>
          ${status.label}
        </span>
      </td>`);
    }

    if (InvState.columns.created_at) {
      cells.push(`<td style="font-size:10.5px;color:var(--muted)">
        ${GMS.dateAr(item.created_at)}
      </td>`);
    }

    return `
      <tr data-row-sku="${GMS.esc(item.sku)}" class="${isSelected ? 'selected' : ''}">
        <td class="col-c" style="width:38px">
          <input type="checkbox" class="cb inv-check"
                 data-sku="${GMS.esc(item.sku)}"
                 ${isSelected ? 'checked' : ''}>
        </td>
        ${cells.join('')}
        <td class="col-c" style="width:120px;white-space:nowrap">
          <div style="display:flex;gap:3px;justify-content:center">
            <button class="row-act" data-action="view"
                    data-sku="${GMS.esc(item.sku)}" title="عرض">
              <i data-lucide="eye"></i>
            </button>
            <button class="row-act" data-action="edit"
                    data-sku="${GMS.esc(item.sku)}" title="تعديل">
              <i data-lucide="pencil"></i>
            </button>
            <button class="row-act" data-action="tag"
                    data-sku="${GMS.esc(item.sku)}" title="طباعة تاج">
              <i data-lucide="qr-code"></i>
            </button>
            <button class="row-act danger" data-action="delete"
                    data-sku="${GMS.esc(item.sku)}" title="حذف">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }

  function renderTable() {
    const cols = COLUMNS.filter(c => InvState.columns[c.key]);
    const pageItems = getPageItems();
    const startIdx = (InvState.page - 1) * InvState.pageSize;

    if (!pageItems.length) {
      return `
        <div class="empty" style="padding:60px 20px">
          <i data-lucide="package-x"></i>
          <p>لا توجد أصناف مطابقة</p>
          <span>${InvState.entityFilter !== 'all'
            ? 'جرّب تغيير التبويب أو مسح الفلاتر'
            : 'جرّب تعديل الفلاتر أو مسحها'}</span>
        </div>
      `;
    }

    const pageAggregate = computeAggregateValues(pageItems);

    return `
      <div class="table-wrap" style="border:none;border-radius:0;max-height:64vh">
        <table class="tbl" style="table-layout:fixed">
          <thead>
            <tr>
              <th class="col-c" style="width:38px">
                <input type="checkbox" class="cb" id="inv-select-page">
              </th>
              ${cols.map(renderHeader).join('')}
              <th class="col-c" style="width:120px">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            ${pageItems.map((item, i) => renderRow(item, i, startIdx + i)).join('')}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="${1 + cols.length}">
                إجمالي الصفحة:
                <b class="mono">${GMS.intFmt(pageItems.length)}</b> صنف
              </td>
              <td class="col-num">
                <span class="mono" style="color:var(--primary)">
                  ${GMS.moneyFmt(pageAggregate.total)} ج.م
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
  }

  function renderPagination() {
    const { page, totalPages, pageSize, filtered } = InvState;
    if (totalPages <= 1) return '';

    const startIdx = (page - 1) * pageSize + 1;
    const endIdx = Math.min(page * pageSize, filtered.length);

    const pageButtons = [];
    const winSize = 2;
    const from = Math.max(1, page - winSize);
    const to = Math.min(totalPages, page + winSize);

    const btn = (p, label, opts = {}) => `
      <button class="pg-btn ${opts.active ? 'active' : ''}"
              data-page="${p}" ${opts.disabled ? 'disabled' : ''}>
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
          <b>${GMS.intFmt(startIdx)}–${GMS.intFmt(endIdx)}</b>
          <span>من</span>
          <b>${GMS.intFmt(filtered.length)}</b>
          <span class="sep">·</span>
          <span>صفحة</span>
          <b>${page}</b>
          <span>من</span>
          <b>${totalPages}</b>
        </div>
        <div class="spacer" style="flex:1"></div>
        <select class="pg-size" id="inv-page-size">
          ${[25, 50, 100, 250, 500].map(s => `
            <option value="${s}" ${s === pageSize ? 'selected' : ''}>${s} / صفحة</option>
          `).join('')}
        </select>
        <div class="pg-controls">${pageButtons.join('')}</div>
      </div>
    `;
  }

  function renderActiveFilters() {
    const f = InvState.filters;
    const chips = [];

    if (f.search) chips.push({ key: 'search', label: 'بحث', value: f.search });
    if (f.karat) {
      let label = `${f.karat}K`;
      if (f.karat === 'custom') label = 'مخصص فقط';
      chips.push({ key: 'karat', label: 'عيار', value: label });
    }
    if (f.status) chips.push({ key: 'status', label: 'حالة', value: GMS.getStatus(f.status).label });
    if (f.branch) {
      const b = GMS.Demo?.getBranches()?.find(x => x.id === f.branch);
      chips.push({ key: 'branch', label: 'فرع', value: b?.name || f.branch });
    }
    if (f.manufacturer) chips.push({ key: 'manufacturer', label: 'ماركة', value: f.manufacturer });
    if (f.category) chips.push({ key: 'category', label: 'تصنيف', value: f.category });
    if (f.onlyCustomKarat) chips.push({ key: 'onlyCustomKarat', label: 'عيار', value: 'مخصص فقط' });

    if (!chips.length) return '';

    return `
      <div style="display:flex;flex-wrap:wrap;gap:7px;align-items:center;
                  padding:12px 20px;border-bottom:1px solid var(--border);
                  background:var(--surface-2)">
        <span style="font-size:11px;font-weight:800;color:var(--muted);
                     text-transform:uppercase;letter-spacing:.4px">
          الفلاتر النشطة:
        </span>
        ${chips.map(c => `
          <span class="filter-chip">
            <span>${GMS.esc(c.label)}: <b>${GMS.esc(c.value)}</b></span>
            <button class="chip-x" data-clear-filter="${c.key}" type="button">
              <i data-lucide="x"></i>
            </button>
          </span>
        `).join('')}
        <button class="btn btn-ghost btn-sm" id="inv-clear-all-filters"
                style="font-size:11px">
          <i data-lucide="x"></i> مسح الكل
        </button>
      </div>
    `;
  }

  function renderBulkBar() {
    if (InvState.selected.size === 0) return '';

    return `
      <div style="display:flex;align-items:center;gap:12px;
                  padding:11px 20px;background:var(--gold-soft);
                  border-bottom:1px solid var(--primary);flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:8px;
                    font-size:12.5px;font-weight:800">
          <i data-lucide="check-square"
             style="width:15px;height:15px;color:var(--primary)"></i>
          <span>تم تحديد</span>
          <span style="background:var(--primary);color:#2a1f05;
                       padding:2px 9px;border-radius:20px;font-weight:900">
            ${InvState.selected.size}
          </span>
          <span>صنف</span>
        </div>
        <div class="spacer" style="flex:1"></div>
        ${isCurrentUserManager() ? `
          <button class="btn btn-sm" data-bulk-action="transfer">
            <i data-lucide="arrow-right-left"></i> نقل عهدة
          </button>
        ` : ''}
        <button class="btn btn-sm" data-bulk-action="tag">
          <i data-lucide="qr-code"></i> طباعة تاجات
        </button>
        <button class="btn btn-sm" data-bulk-action="export">
          <i data-lucide="download"></i> تصدير
        </button>
        <button class="btn btn-sm btn-danger" data-bulk-action="delete">
          <i data-lucide="trash-2"></i> حذف
        </button>
        <button class="btn btn-sm btn-ghost" data-bulk-action="clear">
          <i data-lucide="x"></i> إلغاء التحديد
        </button>
      </div>
    `;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §6 · MAIN RENDER
     ═════════════════════════════════════════════════════════════════════ */

  function render(root) {
    const branches = GMS.Demo?.getBranches() || [];
    const manufacturers = getManufacturers();
    const categories = GMS.CATEGORIES;

    const karatOptions = [
      ...GMS.KARAT_ORDER.map(k => ({ value: String(k), label: `${k}K` })),
      { value: 'custom', label: '🔸 مخصص فقط' },
    ];

    const price24 = getCurrentPrice24();
    const avgLive = InvState.filtered.length
      ? InvState.stats.totalValue / InvState.filtered.length
      : 0;
    const valueDiff = InvState.stats.totalValue - InvState.stats.totalStoredCost;

    const activeEntity = InvState.entities.find(e => e.key === InvState.entityFilter);
    const entityLabel = activeEntity ? activeEntity.name : 'كل المخزون';

    /* ✅ v6.1: تحويل القيم للعيار النشط */
    const baseLabel = getBaseLabel();
    const displayTotalPure = convertFromPure24(InvState.stats.totalPure);

    root.innerHTML = `
      <div class="page-header">
        <h2>
          <i data-lucide="gem"></i>
          ${GMS.t('inv.title')}
          ${activeEntity && !activeEntity.isAll ? `
            <span class="chip ${activeEntity.color === 'violet' ? 'violet' : activeEntity.color === 'success' ? 'ok' : 'gold'}"
                  style="font-size:11px;margin-inline-start:6px">
              <i data-lucide="${activeEntity.icon}"
                 style="width:11px;height:11px"></i>
              ${GMS.esc(entityLabel)}
            </span>
          ` : ''}
        </h2>
        <p>${GMS.t('inv.subtitle')}
          <span class="chip success" style="font-size:10px;margin-inline-start:6px">
            <i data-lucide="zap" style="width:10px;height:10px"></i>
            سعر ${baseLabel} لحظي: ${GMS.moneyFmt(price24)} ج.م
          </span>
        </p>
      </div>

      <!-- كروت تجميع الكيانات -->
      ${renderEntitySummaryCards()}

      <!-- تابات الكيانات -->
      ${renderEntityTabs()}

      <div class="kpi-row cols-4">
        ${renderKPI('gold', 'package', 'إجمالي الأصناف',
            GMS.intFmt(InvState.items.filter(itemVisibleToUser).length), '',
            `<b>${GMS.intFmt(InvState.stats.inStock)}</b> متوفر · <b>${GMS.intFmt(InvState.stats.sold)}</b> مباع` +
            (InvState.stats.customKaratCount > 0
              ? ` · <b style="color:var(--warn)">${GMS.intFmt(InvState.stats.customKaratCount)}</b> مخصص`
              : ''))}

        ${renderKPI('info', 'filter', 'النتائج المُفلترة',
            GMS.intFmt(InvState.filtered.length), '',
            `من إجمالي <b>${GMS.intFmt(InvState.items.filter(itemVisibleToUser).length)}</b> صنف` +
            (InvState.entityFilter !== 'all' ? ` · <b>${GMS.esc(entityLabel)}</b>` : ''))}

        ${renderKPI('success', 'scale', `إجمالي البندق ${baseLabel} المُفلتر`,
            GMS.gramFmt(displayTotalPure), 'جم',
            `القيمة السوقية: <b>${GMS.moneyFmt(InvState.stats.totalValue)}</b> ج.م` +
            (Math.abs(valueDiff) > 0.5
              ? ` · <span style="color:${valueDiff > 0 ? 'var(--success)' : 'var(--danger)'}">${valueDiff > 0 ? '+' : ''}${GMS.moneyFmt(valueDiff)}</span>`
              : ''))}

        ${renderKPI('violet', 'trending-up', 'متوسط القيمة',
            InvState.filtered.length ? GMS.moneyFmt(avgLive) : '0.00',
            'ج.م',
            `على <b>${GMS.intFmt(InvState.filtered.length)}</b> صنف · سعر ${baseLabel}: <b>${GMS.moneyFmt(price24)}</b>`)}
      </div>

      <div class="card" style="margin-bottom:16px">
        <div class="toolbar-row">
          <div class="search-wrap" style="flex:1;min-width:240px;max-width:420px">
            <i data-lucide="search"></i>
            <input id="inv-search-input"
                   placeholder="${GMS.t('inv.searchPlaceholder')}"
                   autocomplete="off">
            ${InvState.filters.search ? `
              <button class="search-clear" id="inv-search-clear">
                <i data-lucide="x"></i>
              </button>
            ` : ''}
          </div>

          <select class="filter-select" id="inv-filter-karat" style="min-width:130px">
            <option value="">كل العيارات</option>
            ${karatOptions.map(opt => `
              <option value="${opt.value}" ${InvState.filters.karat === opt.value ? 'selected' : ''}>
                ${opt.label}
              </option>
            `).join('')}
          </select>

          <select class="filter-select" id="inv-filter-status" style="min-width:130px">
            <option value="">كل الحالات</option>
            ${Object.entries(GMS.ITEM_STATUS).map(([k, v]) => `
              <option value="${k}" ${InvState.filters.status === k ? 'selected' : ''}>${v.label}</option>
            `).join('')}
          </select>

          <select class="filter-select" id="inv-filter-branch" style="min-width:150px">
            <option value="">كل الفروع</option>
            ${branches.map(b => `
              <option value="${b.id}" ${InvState.filters.branch === b.id ? 'selected' : ''}>
                ${GMS.esc(b.name)}
              </option>
            `).join('')}
          </select>

          <select class="filter-select" id="inv-filter-manufacturer" style="min-width:140px">
            <option value="">كل الماركات</option>
            ${manufacturers.map(m => `
              <option value="${m.code}" ${InvState.filters.manufacturer === m.code ? 'selected' : ''}>
                ${GMS.esc(m.code)} — ${GMS.esc(m.name)}
              </option>
            `).join('')}
          </select>

          <select class="filter-select" id="inv-filter-category" style="min-width:140px">
            <option value="">كل التصنيفات</option>
            ${categories.map(c => `
              <option value="${c}" ${InvState.filters.category === c ? 'selected' : ''}>
                ${GMS.esc(c)}
              </option>
            `).join('')}
          </select>

          <div class="spacer" style="flex:1"></div>

          <button class="btn btn-sm" id="inv-cols-btn" title="إدارة الأعمدة">
            <i data-lucide="columns-3"></i> الأعمدة
          </button>

          <button class="btn btn-sm" id="inv-import-btn">
            <i data-lucide="upload"></i> استيراد
          </button>

          <button class="btn btn-sm" id="inv-export-btn">
            <i data-lucide="download"></i> تصدير
          </button>

          <button class="btn btn-primary btn-sm" id="inv-add-btn">
            <i data-lucide="plus"></i> صنف جديد
          </button>
        </div>

        <div data-active-filters-host>${renderActiveFilters()}</div>
      </div>

      <div id="inv-bulk-host">${renderBulkBar()}</div>

      <div class="card">
        <div id="inv-table-host">${renderTable()}</div>
        <div id="inv-pagination-host">${renderPagination()}</div>
      </div>
    `;

    window.lucide?.createIcons();
    bindControls();
    refreshBulkBar();
  }

  function updateActiveFiltersHost() {
    const host = document.querySelector('[data-active-filters-host]');
    if (!host) return;
    host.innerHTML = renderActiveFilters();
    window.lucide?.createIcons();

    host.querySelectorAll('[data-clear-filter]').forEach(btn => {
      btn.onclick = () => {
        const key = btn.dataset.clearFilter;
        if (key === 'onlyCustomKarat') InvState.filters.onlyCustomKarat = false;
        else InvState.filters[key] = '';
        InvState.page = 1;
        applyFilters();
        syncFilterSelects();
        refreshTable();
        updateActiveFiltersHost();
      };
    });

    const clearAllBtn = host.querySelector('#inv-clear-all-filters');
    if (clearAllBtn) {
      clearAllBtn.onclick = () => {
        InvState.filters = {
          search: '', karat: '', status: '',
          branch: '', manufacturer: '', category: '',
          onlyCustomKarat: false,
        };
        InvState.page = 1;
        applyFilters();
        syncFilterSelects();
        refreshTable();
        updateActiveFiltersHost();
      };
    }

    const searchClearBtn = document.getElementById('inv-search-clear');
    if (searchClearBtn) {
      searchClearBtn.onclick = () => {
        InvState.filters.search = '';
        InvState.page = 1;
        applyFilters();
        syncFilterSelects();
        refreshTable();
        updateActiveFiltersHost();
      };
    }
  }

  function syncFilterSelects() {
    const map = [
      { id: 'inv-filter-karat', key: 'karat' },
      { id: 'inv-filter-status', key: 'status' },
      { id: 'inv-filter-branch', key: 'branch' },
      { id: 'inv-filter-manufacturer', key: 'manufacturer' },
      { id: 'inv-filter-category', key: 'category' },
    ];
    map.forEach(({ id, key }) => {
      const el = document.getElementById(id);
      if (el) el.value = InvState.filters[key] || '';
    });
    const searchEl = document.getElementById('inv-search-input');
    if (searchEl) searchEl.value = InvState.filters.search || '';
  }

  function refreshTable() {
    const host = document.getElementById('inv-table-host');
    if (host) {
      host.innerHTML = renderTable();
      window.lucide?.createIcons();
      bindTableEvents();
    }

    const pagHost = document.getElementById('inv-pagination-host');
    if (pagHost) {
      pagHost.innerHTML = renderPagination();
      window.lucide?.createIcons();
      bindPaginationEvents();
    }

    refreshKPIs();
  }

  function refreshKPIs() {
    const kpiHost = document.querySelector('.kpi-row');
    if (!kpiHost) return;

    const price24 = getCurrentPrice24();
    const avgLive = InvState.filtered.length
      ? InvState.stats.totalValue / InvState.filtered.length
      : 0;
    const valueDiff = InvState.stats.totalValue - InvState.stats.totalStoredCost;
    const visibleItems = InvState.items.filter(itemVisibleToUser);

    const baseLabel = getBaseLabel();
    const displayTotalPure = convertFromPure24(InvState.stats.totalPure);

    const kpis = kpiHost.querySelectorAll('.kpi');
    if (kpis[0]) {
      const val = kpis[0].querySelector('.kpi-value');
      const meta = kpis[0].querySelector('.kpi-meta');
      if (val) val.innerHTML = GMS.intFmt(visibleItems.length);
      if (meta) {
        meta.innerHTML = `<b>${GMS.intFmt(InvState.stats.inStock)}</b> متوفر · ` +
          `<b>${GMS.intFmt(InvState.stats.sold)}</b> مباع` +
          (InvState.stats.customKaratCount > 0
            ? ` · <b style="color:var(--warn)">${GMS.intFmt(InvState.stats.customKaratCount)}</b> مخصص`
            : '');
      }
    }
    if (kpis[1]) {
      const val = kpis[1].querySelector('.kpi-value');
      const meta = kpis[1].querySelector('.kpi-meta');
      if (val) val.innerHTML = GMS.intFmt(InvState.filtered.length);
      if (meta) {
        const activeEntity = InvState.entities.find(e => e.key === InvState.entityFilter);
        meta.innerHTML = `من إجمالي <b>${GMS.intFmt(visibleItems.length)}</b> صنف` +
          (activeEntity && !activeEntity.isAll
            ? ` · <b>${GMS.esc(activeEntity.name)}</b>`
            : '');
      }
    }
    if (kpis[2]) {
      const label = kpis[2].querySelector('.kpi-label');
      const val = kpis[2].querySelector('.kpi-value');
      const meta = kpis[2].querySelector('.kpi-meta');
      if (label) {
        label.innerHTML = `
          <i data-lucide="scale" style="width:12px;height:12px"></i>
          إجمالي البندق ${baseLabel} المُفلتر
        `;
      }
      if (val) val.innerHTML = `${GMS.gramFmt(displayTotalPure)} <small>جم</small>`;
      if (meta) {
        meta.innerHTML = `القيمة السوقية: <b>${GMS.moneyFmt(InvState.stats.totalValue)}</b> ج.م` +
          (Math.abs(valueDiff) > 0.5
            ? ` · <span style="color:${valueDiff > 0 ? 'var(--success)' : 'var(--danger)'}">${valueDiff > 0 ? '+' : ''}${GMS.moneyFmt(valueDiff)}</span>`
            : '');
      }
    }
    if (kpis[3]) {
      const val = kpis[3].querySelector('.kpi-value');
      const meta = kpis[3].querySelector('.kpi-meta');
      if (val) val.innerHTML = `${InvState.filtered.length ? GMS.moneyFmt(avgLive) : '0.00'} <small>ج.م</small>`;
      if (meta) {
        meta.innerHTML = `على <b>${GMS.intFmt(InvState.filtered.length)}</b> صنف · سعر ${baseLabel}: <b>${GMS.moneyFmt(price24)}</b>`;
      }
    }

    const headerChip = document.querySelector('.page-header .chip.success');
    if (headerChip) {
      headerChip.innerHTML = `
        <i data-lucide="zap" style="width:10px;height:10px"></i>
        سعر ${baseLabel} لحظي: ${GMS.moneyFmt(price24)} ج.م
      `;
      window.lucide?.createIcons();
    }
  }

  function refreshBulkBar() {
    const host = document.getElementById('inv-bulk-host');
    if (!host) return;
    host.innerHTML = renderBulkBar();
    window.lucide?.createIcons();
    host.querySelectorAll('[data-bulk-action]').forEach(btn => {
      btn.onclick = () => handleBulkAction(btn.dataset.bulkAction);
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §7 · CONTROLS BINDING
     ═════════════════════════════════════════════════════════════════════ */

  function bindControls() {
    document.querySelectorAll('[data-entity-tab]').forEach(tab => {
      tab.onclick = () => {
        InvState.entityFilter = tab.dataset.entityTab;
        InvState.page = 1;
        applyFilters();
        render(document.getElementById('page'));
      };
    });

    document.querySelectorAll('[data-entity-card]').forEach(card => {
      card.onclick = () => {
        InvState.entityFilter = card.dataset.entityCard;
        InvState.page = 1;
        applyFilters();
        render(document.getElementById('page'));
      };
    });

    const transferBtn = document.getElementById('inv-internal-transfer-btn');
    if (transferBtn) transferBtn.onclick = () => openTransferModal();

    const searchInput = document.getElementById('inv-search-input');
    if (searchInput) {
      searchInput.value = InvState.filters.search;
      searchInput.oninput = (e) => {
        lockInteraction();
        clearTimeout(InvState.timers.search);
        InvState.timers.search = setTimeout(() => {
          InvState.filters.search = e.target.value.trim();
          InvState.page = 1;
          applyFilters();
          refreshTable();
        }, 250);
      };
    }

    const clearBtn = document.getElementById('inv-search-clear');
    if (clearBtn) {
      clearBtn.onclick = () => {
        InvState.filters.search = '';
        InvState.page = 1;
        applyFilters();
        syncFilterSelects();
        refreshTable();
        updateActiveFiltersHost();
      };
    }

    const filterIds = [
      { id: 'inv-filter-karat', key: 'karat' },
      { id: 'inv-filter-status', key: 'status' },
      { id: 'inv-filter-branch', key: 'branch' },
      { id: 'inv-filter-manufacturer', key: 'manufacturer' },
      { id: 'inv-filter-category', key: 'category' },
    ];

    filterIds.forEach(({ id, key }) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.onfocus = () => lockInteraction();
      el.onmousedown = () => lockInteraction();
      el.onchange = () => {
        lockInteraction();
        InvState.filters[key] = el.value;
        InvState.page = 1;
        applyFilters();
        refreshTable();
        updateActiveFiltersHost();
      };
    });

    refreshBulkBar();

    const addBtn = document.getElementById('inv-add-btn');
    if (addBtn) addBtn.onclick = () => openItemModal();

    const importBtn = document.getElementById('inv-import-btn');
    if (importBtn) {
      importBtn.onclick = () => GMS.Excel?.Importer?.openFilePicker();
    }

    const exportBtn = document.getElementById('inv-export-btn');
    if (exportBtn) exportBtn.onclick = () => exportFiltered();

    const colsBtn = document.getElementById('inv-cols-btn');
    if (colsBtn) colsBtn.onclick = (e) => openColumnsMenu(e.currentTarget);

    bindTableEvents();
    bindPaginationEvents();

    const keyHandler = (e) => {
      if (GMS.Router?.current() !== 'inventory') return;
      if (e.key === 'Escape') {
        const search = document.getElementById('inv-search-input');
        if (document.activeElement === search) {
          search.value = '';
          search.dispatchEvent(new Event('input'));
        }
      }
    };

    document.addEventListener('keydown', keyHandler);
    InvState.unsubscribers.push(() => {
      document.removeEventListener('keydown', keyHandler);
    });
  }

  function bindTableEvents() {
    document.querySelectorAll('[data-action][data-sku]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        handleRowAction(btn.dataset.action, btn.dataset.sku);
      };
    });

    document.querySelectorAll('.inv-check').forEach(cb => {
      cb.onclick = (e) => {
        e.stopPropagation();
        const sku = cb.dataset.sku;
        if (cb.checked) InvState.selected.add(sku);
        else InvState.selected.delete(sku);
        const row = cb.closest('tr');
        if (row) row.classList.toggle('selected', cb.checked);
        refreshBulkBar();
      };
    });

    const selectPageCb = document.getElementById('inv-select-page');
    if (selectPageCb) {
      selectPageCb.onclick = () => {
        const pageItems = getPageItems();
        const allSelected = pageItems.every(i => InvState.selected.has(i.sku));
        if (allSelected) pageItems.forEach(i => InvState.selected.delete(i.sku));
        else pageItems.forEach(i => InvState.selected.add(i.sku));
        refreshTable();
        refreshBulkBar();
      };
    }

    document.querySelectorAll('th[data-sort]').forEach(th => {
      th.onclick = () => {
        const key = th.dataset.sort;
        if (InvState.sortBy === key) {
          InvState.sortDir = InvState.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          InvState.sortBy = key;
          InvState.sortDir = 'desc';
        }
        applyFilters();
        refreshTable();
      };
    });

    document.querySelectorAll('tr[data-row-sku]').forEach(tr => {
      tr.onclick = (e) => {
        if (e.target.closest('button') || e.target.closest('input')) return;
        handleRowAction('view', tr.dataset.rowSku);
      };
    });
  }

  function bindPaginationEvents() {
    document.querySelectorAll('.pg-btn[data-page]').forEach(btn => {
      btn.onclick = () => {
        const page = Number(btn.dataset.page);
        if (page < 1 || page > InvState.totalPages) return;
        InvState.page = page;
        refreshTable();
        document.getElementById('inv-table-host')?.scrollIntoView({
          behavior: 'smooth', block: 'start',
        });
      };
    });

    const sizeSelect = document.getElementById('inv-page-size');
    if (sizeSelect) {
      sizeSelect.onfocus = () => lockInteraction();
      sizeSelect.onchange = () => {
        InvState.pageSize = Number(sizeSelect.value);
        InvState.page = 1;
        applyFilters();
        refreshTable();
      };
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §8 · ROW ACTIONS
     ═════════════════════════════════════════════════════════════════════ */

  async function handleRowAction(action, sku) {
    const item = InvState.items.find(i => i.sku === sku);
    if (!item) return;

    switch (action) {
      case 'view':   showItemDetails(item); break;
      case 'edit':   openItemModal(item); break;
      case 'tag':    await printTag(item); break;
      case 'delete': await deleteItem(item); break;
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §9 · DETAILS MODAL
     ═════════════════════════════════════════════════════════════════════ */

  function showItemDetails(item) {
    const price24 = getCurrentPrice24();
    const status = GMS.getStatus(item.status);
    const karatInfo = getItemKaratInfo(item);
    const baseLabel = getBaseLabel();

    const branchName = item.branch_name
      || (GMS.Demo?.getBranches()?.find(b => b.id === item.branch_id)?.name || '—');

    const purchaseRate = Number(item.purchase_workmanship || item.workmanship_per_gram || 0);
    const saleRate = Number(item.workmanship_per_gram || 0);
    const marginPerGram = saleRate - purchaseRate;
    const liveValue = computeLiveValue(item, price24);
    const storedCost = Number(item.total_cost || 0);
    const diff = GMS.round(liveValue - storedCost, 2);

    /* تحويل القيم للعيار النشط */
    const displayPure = convertFromPure24(item.pure_weight);

    GMS.Modal.open({
      title: `تفاصيل الصنف — ${item.sku}`,
      icon: 'gem',
      size: 'lg',
      body: `
        <div style="display:grid;grid-template-columns:repeat(4,1fr);
                    gap:12px;margin-bottom:18px">
          <div style="padding:12px 14px;background:var(--surface-2);
                      border-radius:11px;border:1px solid var(--border)">
            <div style="font-size:10.5px;color:var(--muted);font-weight:800;
                        text-transform:uppercase">العهدة</div>
            <div style="margin-top:4px">${renderHolderBadge(item)}</div>
          </div>
          <div style="padding:12px 14px;background:var(--surface-2);
                      border-radius:11px;border:1px solid var(--border)">
            <div style="font-size:10.5px;color:var(--muted);font-weight:800;
                        text-transform:uppercase">العيار</div>
            <div style="margin-top:4px">
              ${renderKaratBadge(item)}
              ${karatInfo.is_custom ? `
                <div class="mono" style="font-size:10.5px;
                            color:var(--muted);font-weight:700;margin-top:5px">
                  نقاء: ${Number(karatInfo.purity_ratio).toFixed(4)}
                </div>
              ` : ''}
            </div>
          </div>
          <div style="padding:12px 14px;background:var(--surface-2);
                      border-radius:11px;border:1px solid var(--border)">
            <div style="font-size:10.5px;color:var(--muted);font-weight:800;
                        text-transform:uppercase">الحالة</div>
            <div style="margin-top:4px">
              <span class="pill ${status.cls}">${status.label}</span>
            </div>
          </div>
          <div style="padding:12px 14px;background:var(--surface-2);
                      border-radius:11px;border:1px solid var(--border)">
            <div style="font-size:10.5px;color:var(--muted);font-weight:800;
                        text-transform:uppercase">الفرع</div>
            <div style="font-weight:800;margin-top:4px;font-size:12.5px">
              ${GMS.esc(branchName)}
            </div>
          </div>
        </div>

        <div class="calc-list" style="margin-bottom:16px">
          <div class="cl-row">
            <span class="k"><i data-lucide="package"></i> التصنيف</span>
            <span class="v">${GMS.esc(item.category || '—')}</span>
          </div>
          <div class="cl-row">
            <span class="k"><i data-lucide="factory"></i> الماركة</span>
            <span class="v">${GMS.esc(item.manufacturer_code || '—')} — ${GMS.esc(item.manufacturer_name || '')}</span>
          </div>
          <div class="cl-row">
            <span class="k"><i data-lucide="scale"></i> الوزن القائم</span>
            <span class="v">${GMS.gramFmt(item.weight_grams)} جم</span>
          </div>
          <div class="cl-row">
            <span class="k"><i data-lucide="gem"></i> وزن الأحجار</span>
            <span class="v">${GMS.gramFmt(item.stone_weight)} جم</span>
          </div>
          <div class="cl-row">
            <span class="k"><i data-lucide="scale"></i> الوزن الصافي</span>
            <span class="v">${GMS.gramFmt(item.net_weight)} جم</span>
          </div>
          <div class="cl-row hi">
            <span class="k"><i data-lucide="sparkles"></i> البندق ${baseLabel}</span>
            <span class="v">${GMS.gramFmt(displayPure)} جم</span>
          </div>
        </div>

        <div class="calc-list">
          <div class="cl-row">
            <span class="k"><i data-lucide="coins"></i> قيمة المصنعية (بيع)</span>
            <span class="v">${GMS.moneyFmt(item.workmanship_value)} ج.م</span>
          </div>
          <div class="cl-row">
            <span class="k"><i data-lucide="trending-up"></i> سعر ${baseLabel} الحالي</span>
            <span class="v" style="color:var(--primary)">${GMS.moneyFmt(price24)} ج.م</span>
          </div>
          <div class="cl-row hi">
            <span class="k"><i data-lucide="banknote"></i> القيمة السوقية</span>
            <span class="v">${GMS.moneyFmt(liveValue)} ج.م</span>
          </div>
        </div>
      `,
      footer: `
        <button class="btn" data-close>إغلاق</button>
        ${isCurrentUserManager() ? `
          <button class="btn btn-info" data-transfer>
            <i data-lucide="arrow-right-left"></i> نقل لعهدة أخرى
          </button>
        ` : ''}
        <button class="btn" data-edit>
          <i data-lucide="pencil"></i> تعديل
        </button>
        <button class="btn btn-primary" data-print-tag>
          <i data-lucide="qr-code"></i> طباعة تاج
        </button>
      `,
      onMount: (el, close) => {
        el.querySelector('[data-close]').onclick = () => close();
        el.querySelector('[data-edit]').onclick = () => {
          close();
          openItemModal(item);
        };
        el.querySelector('[data-print-tag]').onclick = async () => {
          close();
          await printTag(item);
        };
        const transferBtn = el.querySelector('[data-transfer]');
        if (transferBtn) {
          transferBtn.onclick = () => {
            close();
            openTransferModal([item.sku]);
          };
        }
      },
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §10 · INTERNAL STOCK TRANSFER MODAL
     ═════════════════════════════════════════════════════════════════════ */

  function openTransferModal(preselectedSkus = null) {
    if (!isCurrentUserManager()) {
      return GMS.Toast?.err?.('غير مصرح', 'هذه العملية للمدير فقط');
    }

    if (!InvState.entities.length) {
      return GMS.Toast?.warn?.('لا توجد كيانات');
    }

    let items;
    if (preselectedSkus && preselectedSkus.length) {
      items = InvState.items.filter(i => preselectedSkus.includes(i.sku));
    } else if (InvState.selected.size > 0) {
      items = InvState.items.filter(i => InvState.selected.has(i.sku));
    } else {
      items = [];
    }

    const entities = InvState.entities.filter(e => !e.isAll);

    if (!entities.length) {
      return GMS.Toast?.warn?.('لا توجد كيانات للنقل');
    }

    const defaultTo = entities.length > 1 ? entities[1].key : entities[0].key;

    GMS.Modal.open({
      title: '📦 أمر نقل بضاعة داخلي',
      icon: 'arrow-right-left',
      size: 'xl',
      body: `
        <div style="padding:12px 14px;background:var(--info-bg);
                    border-radius:10px;margin-bottom:14px;
                    border-inline-start:3px solid var(--info);
                    font-size:11.5px;font-weight:700;
                    color:var(--text-2);line-height:1.6">
          <i data-lucide="info" style="width:12px;height:12px;
             display:inline;vertical-align:-2px;color:var(--info)"></i>
          <b>أمر نقل بضاعة داخلي:</b> ينقل القطع من عهدة إلى عهدة أخرى
          بدون تغيير ملكية المحل. تُسجَّل العملية في دفتر الأستاذ للسجلات.
        </div>

        <div style="display:grid;grid-template-columns:1fr auto 1fr;
                    gap:14px;align-items:end;margin-bottom:16px">
          <div class="field">
            <label>من عهدة <span class="req">*</span></label>
            <select id="trf-from">
              <option value="">— اختر —</option>
              ${entities.map(e => `
                <option value="${GMS.esc(e.key)}">
                  ${GMS.esc(e.name)}${e.rep_code ? ` (${e.rep_code})` : ''}
                </option>
              `).join('')}
            </select>
          </div>

          <div style="padding-bottom:8px;color:var(--primary);
                      font-weight:900">
            <i data-lucide="arrow-left" style="width:24px;height:24px"></i>
          </div>

          <div class="field">
            <label>إلى عهدة <span class="req">*</span></label>
            <select id="trf-to">
              <option value="">— اختر —</option>
              ${entities.map(e => `
                <option value="${GMS.esc(e.key)}" ${e.key === defaultTo ? 'selected' : ''}>
                  ${GMS.esc(e.name)}${e.rep_code ? ` (${e.rep_code})` : ''}
                </option>
              `).join('')}
            </select>
          </div>
        </div>

        <div style="font-size:11px;font-weight:800;color:var(--muted);
                    text-transform:uppercase;letter-spacing:.4px;
                    margin-bottom:10px;display:flex;align-items:center;
                    gap:8px">
          <i data-lucide="package" style="width:12px;height:12px"></i>
          القطع المشمولة بالنقل
          <span class="spacer" style="flex:1"></span>
          <span class="chip info" id="trf-items-count">
            ${GMS.intFmt(items.length)} قطعة
          </span>
          <button class="btn btn-sm" id="trf-picker-btn" type="button">
            <i data-lucide="list-plus"></i> إضافة قطع
          </button>
        </div>

        <div id="trf-items-host"
             style="max-height:320px;overflow-y:auto;
                    border:1px solid var(--border);border-radius:11px">
          ${renderTransferItemsTable(items)}
        </div>

        <div class="field" style="margin-top:14px">
          <label>ملاحظات على النقل</label>
          <input id="trf-notes" placeholder="سبب النقل، رقم التسليم اليدوي…">
        </div>

        <div id="trf-preview" style="margin-top:14px"></div>
      `,
      footer: `
        <button class="btn" data-close type="button">إلغاء</button>
        <button class="btn btn-primary btn-lg" id="trf-confirm" type="button">
          <i data-lucide="check-circle-2"></i>
          تأكيد النقل
        </button>
      `,
      onMount: (el, close) => {
        let selectedItems = items.slice();

        const $ = (id) => el.querySelector('#' + id);

        el.querySelectorAll('[data-close]').forEach(b => {
          b.onclick = () => close();
        });

        $('trf-picker-btn').onclick = () => {
          openItemPicker({
            excludeSkus: selectedItems.map(i => i.sku),
            onAdd: (newItems) => {
              newItems.forEach(ni => {
                if (!selectedItems.find(x => x.sku === ni.sku)) {
                  selectedItems.push(ni);
                }
              });
              updateItemsList();
            },
          });
        };

        function updateItemsList() {
          $('trf-items-host').innerHTML = renderTransferItemsTable(selectedItems);
          $('trf-items-count').textContent = `${selectedItems.length} قطعة`;
          window.lucide?.createIcons();
          bindItemsRemove();

          const btn = $('trf-confirm');
          if (btn) btn.disabled = selectedItems.length === 0;
        }

        function bindItemsRemove() {
          $('trf-items-host').querySelectorAll('[data-remove-sku]').forEach(b => {
            b.onclick = () => {
              const sku = b.dataset.removeSku;
              selectedItems = selectedItems.filter(x => x.sku !== sku);
              updateItemsList();
            };
          });
        }

        bindItemsRemove();
        updateItemsList();

        function updatePreview() {
          const fromKey = $('trf-from').value;
          const toKey = $('trf-to').value;
          const fromEnt = InvState.entities.find(e => e.key === fromKey);
          const toEnt = InvState.entities.find(e => e.key === toKey);
          const totalPure = selectedItems.reduce(
            (a, i) => a + Number(i.pure_weight || 0), 0
          );

          const preview = $('trf-preview');
          if (!fromEnt || !toEnt) { preview.innerHTML = ''; return; }

          if (fromEnt.key === toEnt.key) {
            preview.innerHTML = `
              <div style="padding:12px 14px;background:var(--danger-bg);
                          border-radius:10px;
                          border:1px solid color-mix(in srgb,var(--danger) 35%,transparent);
                          color:var(--danger);font-size:12px;font-weight:800">
                <i data-lucide="alert-triangle"
                   style="width:14px;height:14px;
                          display:inline;vertical-align:-2px"></i>
                لا يمكن النقل لنفس العهدة — اختر عهدة مختلفة.
              </div>
            `;
            $('trf-confirm').disabled = true;
            window.lucide?.createIcons();
            return;
          }

          const baseLabel = getBaseLabel();
          const displayTotalPure = convertFromPure24(totalPure);

          preview.innerHTML = `
            <div style="padding:14px 16px;background:var(--gold-soft);
                        border-radius:11px;
                        border:1.5px solid color-mix(in srgb,var(--primary) 40%,var(--border));
                        position:relative;overflow:hidden">
              <div style="position:absolute;inset-block:0;
                          inset-inline-start:0;width:3px;
                          background:var(--gold-grad)"></div>
              <div style="font-size:11px;font-weight:900;
                          color:var(--warn);text-transform:uppercase;
                          letter-spacing:.4px;margin-bottom:8px">
                معاينة النقل
              </div>
              <div style="font-family:var(--font-mono);font-size:12.5px;
                          font-weight:700;color:var(--text-2);
                          line-height:1.9">
                <div>من: <b>${GMS.esc(fromEnt.name)}</b></div>
                <div>إلى: <b>${GMS.esc(toEnt.name)}</b></div>
                <div>عدد القطع: <b>${selectedItems.length}</b></div>
                <div>إجمالي البندق ${baseLabel}: <b style="color:var(--primary)">
                  ${GMS.gramFmt(displayTotalPure)} جم
                </b></div>
              </div>
            </div>
          `;
          $('trf-confirm').disabled = false;
          window.lucide?.createIcons();
        }

        $('trf-from').onchange = updatePreview;
        $('trf-to').onchange = updatePreview;

        $('trf-confirm').onclick = async () => {
          const fromKey = $('trf-from').value;
          const toKey = $('trf-to').value;
          const notes = $('trf-notes').value.trim();

          const fromEnt = InvState.entities.find(e => e.key === fromKey);
          const toEnt = InvState.entities.find(e => e.key === toKey);

          if (!fromEnt || !toEnt) {
            return GMS.Toast?.err?.('اختر العهدتين');
          }
          if (fromEnt.key === toEnt.key) {
            return GMS.Toast?.err?.('لا يمكن النقل لنفس العهدة');
          }
          if (!selectedItems.length) {
            return GMS.Toast?.err?.('أضف قطعة واحدة على الأقل');
          }

          const ok = await GMS.Confirm?.ask?.(
            `سيتم نقل ${selectedItems.length} قطعة من "${fromEnt.name}" إلى "${toEnt.name}". متابعة؟`,
            { title: 'تأكيد النقل', okText: 'تنفيذ النقل', icon: 'arrow-right-left' }
          );
          if (!ok) return;

          const btn = $('trf-confirm');
          btn.disabled = true;
          btn.innerHTML = `<i data-lucide="loader-circle"></i> جارٍ النقل…`;
          window.lucide?.createIcons();

          try {
            await executeInternalTransfer({
              fromEntity: fromEnt,
              toEntity: toEnt,
              items: selectedItems,
              notes,
            });

            close();
            GMS.Beep?.complete?.();
            GMS.Toast?.ok?.(
              `تم نقل ${selectedItems.length} قطعة`,
              `من ${fromEnt.name} → ${toEnt.name}`
            );

            await loadInventory();
            await loadEntities();
            applyFilters();
            render(document.getElementById('page'));
          } catch (e) {
            console.error('[Inventory.transfer]', e);
            GMS.Beep?.error?.();
            GMS.Toast?.err?.('فشل النقل', e.message);
            btn.disabled = false;
            btn.innerHTML = `<i data-lucide="check-circle-2"></i> إعادة المحاولة`;
            window.lucide?.createIcons();
          }
        };

        setTimeout(updatePreview, 100);
      },
    });
  }

  function renderTransferItemsTable(items) {
    if (!items.length) {
      return `
        <div class="empty" style="padding:40px 20px">
          <i data-lucide="package"></i>
          <p>لا توجد قطع مُضافة</p>
          <span>اضغط "إضافة قطع" لاختيار القطع من المخزون</span>
        </div>
      `;
    }

    const baseLabel = getBaseLabel();

    return `
      <table class="tbl" style="font-size:11.5px">
        <thead>
          <tr>
            <th>كود التاج</th>
            <th style="width:60px" class="col-c">عيار</th>
            <th style="width:90px" class="col-num">صافي (جم)</th>
            <th style="width:100px" class="col-num">بندق ${baseLabel}</th>
            <th style="width:120px" class="col-num">القيمة</th>
            <th style="width:50px" class="col-c">—</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(it => {
            const info = getItemKaratInfo(it);
            const val = computeLiveValue(it);
            const displayPure = convertFromPure24(it.pure_weight);

            return `
              <tr>
                <td class="mono" style="font-weight:800">${GMS.esc(it.sku)}</td>
                <td class="col-c">
                  ${info.is_custom
                    ? `<span class="karat-badge custom-karat-badge" style="font-size:10px">${info.custom_karat}</span>`
                    : `<span class="karat-badge" data-k="${info.karat}" style="font-size:10px">${info.karat}K</span>`}
                </td>
                <td class="col-num">${GMS.gramFmt(it.net_weight)}</td>
                <td class="col-num" style="color:var(--primary);font-weight:800">
                  ${GMS.gramFmt(displayPure)}
                </td>
                <td class="col-num" style="font-weight:800">
                  ${GMS.moneyFmt(val)}
                </td>
                <td class="col-c">
                  <button class="row-act danger" data-remove-sku="${GMS.esc(it.sku)}"
                          type="button" style="width:26px;height:26px">
                    <i data-lucide="x"></i>
                  </button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  }

  async function executeInternalTransfer({ fromEntity, toEntity, items, notes }) {
    const now = new Date().toISOString();
    const voucherNo = `TRF-${Date.now().toString(36).toUpperCase().slice(-8)}`;

    const newHolder = {
      type: toEntity.type,
      id: toEntity.id,
      name: toEntity.name,
    };

    for (const item of items) {
      try {
        const fresh = await GMS.IDB?.get?.(item.id) || item;
        setItemHolder(fresh, newHolder);
        fresh.updated_at = now;

        if (GMS.IDB) {
          await GMS.IDB.put(fresh);
        }

        const idx = InvState.items.findIndex(x => x.sku === item.sku);
        if (idx >= 0) InvState.items[idx] = fresh;
      } catch (e) {
        console.warn('[Inventory.transfer] IDB update failed for', item.sku, e);
      }
    }

    if (GMS.Supabase?.isReady?.()) {
      try {
        const client = GMS.Supabase.get();
        const ids = items.map(i => i.id).filter(Boolean);
        if (ids.length) {
          await client
            .from(GMS.SUPABASE_CONFIG.TABLES.INVENTORY)
            .update({
              holder_type: newHolder.type,
              holder_id: newHolder.id,
              holder_name: newHolder.name,
              updated_at: now,
            })
            .in('id', ids);
        }
      } catch (e) {
        console.warn('[Inventory.transfer] Supabase failed:', e);
      }
    }

    if (GMS.Audit) {
      try {
        const totalPure = items.reduce(
          (a, i) => a + Number(i.pure_weight || 0), 0
        );
        await GMS.Audit.log(
          'TRANSFER',
          'inventory',
          voucherNo,
          `نقل ${items.length} قطعة من "${fromEntity.name}" إلى "${toEntity.name}"`,
          {
            voucher_no: voucherNo,
            from: fromEntity.key,
            to: toEntity.key,
            count: items.length,
            total_pure: GMS.round(totalPure, 4),
            skus: items.map(i => i.sku).slice(0, 50),
            notes: notes || '',
          }
        );
      } catch (_) {}
    }

    if (GMS.Realtime) {
      try {
        GMS.Realtime.emit('inventory', 'UPDATE', {
          action: 'transfer',
          voucher_no: voucherNo,
          from: fromEntity.key,
          to: toEntity.key,
          count: items.length,
        });
      } catch (_) {}
    }

    console.log(
      `[Inventory] ✅ Transfer ${voucherNo}: ${items.length} items`,
      { from: fromEntity.key, to: toEntity.key }
    );

    return { voucherNo, count: items.length };
  }

  /* ═════════════════════════════════════════════════════════════════════
     §11 · ITEM PICKER
     ═════════════════════════════════════════════════════════════════════ */

  function openItemPicker(opts = {}) {
    const { excludeSkus = [], onAdd = null } = opts;

    const available = InvState.items
      .filter(itemVisibleToUser)
      .filter(i => i.status === 'IN_STOCK')
      .filter(i => !excludeSkus.includes(i.sku));

    GMS.Modal.open({
      title: 'اختيار قطع من المخزون',
      icon: 'list-plus',
      size: 'xl',
      body: `
        <div class="search-wrap" style="margin-bottom:14px">
          <i data-lucide="search"></i>
          <input id="picker-search" placeholder="بحث بكود التاج…" autocomplete="off">
        </div>
        <div id="picker-list"
             style="max-height:480px;overflow-y:auto;
                    border:1px solid var(--border);border-radius:11px">
          ${renderPickerItems(available)}
        </div>
      `,
      footer: `
        <button class="btn" data-close type="button">إغلاق</button>
        <button class="btn btn-primary" id="picker-confirm" type="button" disabled>
          إضافة المحدد
        </button>
      `,
      onMount: (el, close) => {
        const picked = new Set();

        const $ = (id) => el.querySelector('#' + id);
        const searchInput = $('picker-search');
        const listHost = $('picker-list');
        const confirmBtn = $('picker-confirm');

        function bindList() {
          listHost.querySelectorAll('[data-pick-sku]').forEach(row => {
            const cb = row.querySelector('.cb');
            row.onclick = (e) => {
              if (e.target.tagName === 'INPUT') return;
              cb.checked = !cb.checked;
              cb.dispatchEvent(new Event('change'));
            };
            cb.onchange = () => {
              if (cb.checked) picked.add(cb.dataset.sku);
              else picked.delete(cb.dataset.sku);
              confirmBtn.disabled = picked.size === 0;
              confirmBtn.innerHTML = picked.size
                ? `إضافة ${picked.size} قطعة`
                : 'إضافة المحدد';
            };
          });
        }

        bindList();

        if (searchInput) {
          searchInput.oninput = (e) => {
            const q = e.target.value.toLowerCase().trim();
            const filtered = !q ? available : available.filter(i =>
              (i.sku || '').toLowerCase().includes(q) ||
              (i.category || '').toLowerCase().includes(q) ||
              (i.manufacturer_name || '').toLowerCase().includes(q)
            );
            listHost.innerHTML = renderPickerItems(filtered, picked);
            window.lucide?.createIcons();
            bindList();
          };
        }

        $('picker-confirm').onclick = () => {
          const selected = available.filter(i => picked.has(i.sku));
          if (typeof onAdd === 'function') onAdd(selected);
          close();
        };

        el.querySelectorAll('[data-close]').forEach(b => {
          b.onclick = () => close();
        });
      },
    });
  }

  function renderPickerItems(items, picked = new Set()) {
    if (!items.length) {
      return `<div class="empty" style="padding:40px"><i data-lucide="package-x"></i><p>لا توجد قطع</p></div>`;
    }

    const baseLabel = getBaseLabel();

    return items.slice(0, 500).map(it => {
      const info = getItemKaratInfo(it);
      const checked = picked.has(it.sku) ? 'checked' : '';
      const displayPure = convertFromPure24(it.pure_weight);

      return `
        <div data-pick-sku="${GMS.esc(it.sku)}"
             style="display:grid;grid-template-columns:auto 1fr auto;
                    gap:12px;align-items:center;
                    padding:11px 14px;
                    border-bottom:1px solid var(--border);
                    cursor:pointer;transition:background .15s">
          <input type="checkbox" class="cb" data-sku="${GMS.esc(it.sku)}" ${checked}>
          <div style="min-width:0">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;
                        margin-bottom:3px">
              <span class="mono" style="font-weight:800;font-size:12.5px">
                ${GMS.esc(it.sku)}
              </span>
              ${info.is_custom
                ? `<span class="karat-badge custom-karat-badge" style="font-size:9.5px">${info.custom_karat}</span>`
                : `<span class="karat-badge" data-k="${info.karat}" style="font-size:9.5px">${info.karat}K</span>`}
              ${renderHolderBadge(it)}
            </div>
            <div style="font-size:10.5px;color:var(--muted);font-weight:700">
              ${GMS.esc(it.category || '—')} · صافي ${GMS.gramFmt(it.net_weight)} جم
            </div>
          </div>
          <div style="text-align:end">
            <div class="mono" style="font-size:12px;font-weight:900;
                        color:var(--primary)">
              ${GMS.gramFmt(displayPure)} جم
            </div>
            <div style="font-size:9.5px;color:var(--muted);font-weight:700">
              بندق ${baseLabel}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  /* ═════════════════════════════════════════════════════════════════════
     §12 · ITEM MODAL (ADD / EDIT)
     ═════════════════════════════════════════════════════════════════════ */

  function openItemModal(item = null) {
    const isEdit = Boolean(item);
    const item_ = item || {};

    const manufacturers = getManufacturers();
    const branches = GMS.Demo?.getBranches() || [];
    const categories = GMS.CATEGORIES;

    const mstate = {
      pricingMode: 'fixed',
      selectedManufacturer: null,
      selectedLetter: item_.letter_code || '',
      selectedColor: item_.color_code || '',
      purchaseRate: Number(item_.purchase_workmanship || 0),
      saleRate: Number(item_.workmanship_per_gram || 0),
      stonesIncluded: Boolean(item_.stones_included) || false,

      karatMode: 'standard',
      standardKarat: Number(item_.karat) || 21,
      customKarat: Number(item_.custom_karat) || 888,
      customPurity: Number(item_.purity_ratio) || 0.8880,

      quantity: 1,
      sameWeight: true,
      individualWeights: [],

      holderKey: item_
        ? (getItemHolder(item_).type === ENTITY_TYPES.B2B_REP.key
            ? `rep:${getItemHolder(item_).id}`
            : getItemHolder(item_).type)
        : (InvState.entityFilter !== 'all' ? InvState.entityFilter : 'retail_shop'),
    };

    if (isEdit && (item_.is_custom_karat === true || item_.custom_karat != null)) {
      mstate.karatMode = 'custom';
      mstate.customKarat = Number(item_.custom_karat) ||
        Math.round((Number(item_.purity_ratio) || 0.888) * 1000);
      mstate.customPurity = Number(item_.purity_ratio) || (mstate.customKarat / 1000);
    }

    const currentManu = manufacturers.find(m => m.code === item_.manufacturer_code);
    if (currentManu) {
      mstate.selectedManufacturer = currentManu;
      mstate.pricingMode = currentManu.pricingMode || 'fixed';
      mstate.purchaseRate = mstate.purchaseRate || Number(currentManu.purchaseRate || 0);
      mstate.saleRate = mstate.saleRate || Number(currentManu.saleRate || 0);
    }

    GMS.Modal.open({
      title: isEdit ? `تعديل الصنف — ${item_.sku}` : 'إضافة صنف جديد',
      icon: isEdit ? 'pencil' : 'plus-circle',
      size: 'xl',
      body: `<div id="item-modal-body">${renderItemForm(isEdit, item_, manufacturers, branches, categories, mstate)}</div>`,
      footer: `
        <button class="btn" data-close>إلغاء</button>
        <button class="btn btn-primary btn-lg" id="f-save">
          <i data-lucide="save"></i> ${isEdit ? 'حفظ التعديلات' : 'إنشاء الصنف'}
        </button>
      `,
      onMount: (el, close) => {
        bindItemForm(el, close, isEdit, item_, mstate, manufacturers, categories);
      },
    });
  }

  function renderItemForm(isEdit, item_, manufacturers, branches, categories, mstate) {
    const price24 = getCurrentPrice24();
    const baseLabel = getBaseLabel();

    const holderOptions = InvState.entities.filter(e => !e.isAll).map(e => `
      <option value="${GMS.esc(e.key)}" ${mstate.holderKey === e.key ? 'selected' : ''}>
        ${GMS.esc(e.name)}${e.rep_code ? ` (${e.rep_code})` : ''}
      </option>
    `).join('');

    return `
      <div style="padding:14px 16px;background:var(--violet-bg);border-radius:12px;
                  border:1.5px solid color-mix(in srgb,var(--violet) 30%,var(--border));
                  margin-bottom:16px">
        <div style="font-size:11px;font-weight:800;color:var(--violet);
                    text-transform:uppercase;letter-spacing:.5px;
                    margin-bottom:10px;display:flex;align-items:center;gap:6px">
          <i data-lucide="map-pin" style="width:12px;height:12px"></i>
          العهدة / موقع القطعة
        </div>
        <div class="field" style="margin:0">
          <label style="color:var(--violet)">العهدة المسؤولة</label>
          <select id="f-holder">
            ${holderOptions}
          </select>
          <span class="hint">
            القطعة تُحتسب في جرد هذه العهدة — للنقل استخدم "أمر نقل بضاعة" من الشريط العلوي.
          </span>
        </div>
      </div>

      <div class="grid-form three">
        <div class="field">
          <label>كود التاج الأساسي <span class="req">*</span>
            ${!isEdit ? `<span class="hint" style="display:inline">— سيُضاف رقم مسلسل لكل قطعة</span>` : ''}
          </label>
          <div style="display:flex;gap:8px">
            <input id="f-sku" value="${GMS.esc(item_.sku || '')}"
                   class="mono" dir="ltr" ${isEdit ? 'readonly' : ''}
                   style="font-weight:800">
            ${isEdit ? '' : `
              <button type="button" class="btn btn-sm" id="f-gen-sku"
                      style="flex-shrink:0" title="توليد تلقائي">
                <i data-lucide="refresh-cw"></i>
              </button>
            `}
          </div>
        </div>

        <div class="field">
          <label>المصنع / الماركة <span class="req">*</span></label>
          <select id="f-manufacturer">
            <option value="">— اختر مصنع —</option>
            ${manufacturers.map(m => {
              const mode = GMS.getPricingMode(m.pricingMode);
              return `
                <option value="${GMS.esc(m.code)}"
                        data-mode="${m.pricingMode}"
                        data-purchase="${m.purchaseRate || 0}"
                        data-sale="${m.saleRate || 0}"
                        data-fixed="${m.fixedRate || 0}"
                        data-name="${GMS.esc(m.name)}"
                        data-letter="${GMS.esc(m.letter || '')}"
                        data-manu-id="${GMS.esc(m.id)}"
                        ${item_.manufacturer_code === m.code ? 'selected' : ''}>
                  ${GMS.esc(m.code)} — ${GMS.esc(m.name)} (${mode.label})
                </option>
              `;
            }).join('')}
          </select>
        </div>

        <div class="field">
          <label>التصنيف <span class="req">*</span></label>
          <select id="f-category">
            ${categories.map(c => `
              <option ${item_.category === c ? 'selected' : ''}>${GMS.esc(c)}</option>
            `).join('')}
          </select>
        </div>
      </div>

      <div style="margin-top:18px">
        <div style="font-size:11px;font-weight:800;color:var(--muted);
                    text-transform:uppercase;letter-spacing:.5px;
                    margin-bottom:11px;display:flex;align-items:center;gap:8px">
          <i data-lucide="gem" style="width:12px;height:12px"></i>
          العيار
          <span class="chip" style="font-size:9.5px;margin-inline-start:auto">
            يدعم العيارات القياسية والمخصصة
          </span>
        </div>

        <div class="karat-grid" id="f-karat-standard-grid">
          ${GMS.KARAT_ORDER.map(k => `
            <button type="button"
                    class="karat-btn ${mstate.karatMode === 'standard' && mstate.standardKarat === k ? 'active' : ''}"
                    data-karat-std="${k}">
              <div class="kb-num">${k}K</div>
              <div class="kb-ratio">${GMS.karatRatio(k).toFixed(4)}</div>
            </button>
          `).join('')}
          <button type="button"
                  class="karat-btn ${mstate.karatMode === 'custom' ? 'active' : ''} custom-karat-btn"
                  data-karat-custom="1">
            <div class="kb-num">
              <i data-lucide="sliders-horizontal" style="width:20px;height:20px"></i>
            </div>
            <div class="kb-ratio">مخصص</div>
          </button>
        </div>

        <input type="hidden" id="f-karat" value="${mstate.standardKarat}">

        <div id="f-custom-karat-panel"
             style="margin-top:12px;padding:16px 18px;
                    background:var(--warn-bg);border-radius:12px;
                    border:1.5px solid color-mix(in srgb,var(--warn) 35%,var(--border));
                    ${mstate.karatMode === 'custom' ? '' : 'display:none'}">
          <div style="font-size:11px;font-weight:800;color:var(--warn);
                      text-transform:uppercase;letter-spacing:.5px;
                      margin-bottom:12px;display:flex;align-items:center;gap:6px">
            <i data-lucide="sliders-horizontal" style="width:12px;height:12px"></i>
            عيار مخصص
          </div>

          <div class="grid-form" style="gap:12px">
            <div class="field">
              <label>العيار (لكل 1000)</label>
              <input type="number" id="f-custom-karat"
                     step="1" min="300" max="999"
                     value="${mstate.customKarat}"
                     class="mono"
                     style="font-weight:900;text-align:center;font-size:16px">
              <span class="hint">من 300 إلى 999</span>
            </div>
            <div class="field">
              <label>أو نسبة النقاء مباشرة</label>
              <input type="number" id="f-custom-purity"
                     step="0.0001" min="0.3000" max="1.0000"
                     value="${mstate.customPurity.toFixed(4)}"
                     class="mono"
                     style="font-weight:900;text-align:center;font-size:16px">
              <span class="hint">من 0.3000 إلى 1.0000</span>
            </div>
          </div>

          <div style="margin-top:12px;display:flex;gap:6px;flex-wrap:wrap">
            <button type="button" class="btn btn-sm" data-custom-preset="999.9">999.9 (سويسري)</button>
            <button type="button" class="btn btn-sm" data-custom-preset="999">999</button>
            <button type="button" class="btn btn-sm" data-custom-preset="995">995</button>
            <button type="button" class="btn btn-sm" data-custom-preset="916">916</button>
            <button type="button" class="btn btn-sm" data-custom-preset="900">900</button>
            <button type="button" class="btn btn-sm" data-custom-preset="888">888</button>
          </div>

          <div style="margin-top:12px;padding:10px 14px;background:var(--surface);
                      border-radius:9px;font-size:11.5px;font-weight:700;
                      color:var(--text-2);display:flex;align-items:center;gap:8px">
            <i data-lucide="info" style="width:13px;height:13px;color:var(--warn);flex-shrink:0"></i>
            <span>
              سيتم استخدام النقاء
              <b class="mono" id="f-purity-display" style="color:var(--warn);font-size:13px">
                ${mstate.customPurity.toFixed(4)}
              </b>
              لحساب البندق ${baseLabel} والقيمة السوقية.
            </span>
          </div>
        </div>
      </div>

      <div class="grid-form" style="margin-top:18px;grid-template-columns:1fr 1fr">
        <div class="field">
          <label>الفرع</label>
          <select id="f-branch">
            ${branches.map(b => `
              <option value="${b.id}" ${item_.branch_id === b.id ? 'selected' : ''}>
                ${GMS.esc(b.name)}
              </option>
            `).join('')}
          </select>
        </div>

        <div class="field">
          <label>الحالة</label>
          <select id="f-status">
            ${Object.entries(GMS.ITEM_STATUS).map(([k, v]) => `
              <option value="${k}" ${item_.status === k ? 'selected' : ''}>${v.label}</option>
            `).join('')}
          </select>
        </div>
      </div>

      <div id="f-pricing-section" style="margin-top:18px">
        ${renderPricingSection(mstate)}
      </div>

      ${!isEdit ? renderQuantitySection(mstate) : renderSingleWeightSection(item_, mstate)}

      <div class="field" style="margin-top:13px">
        <label>ملاحظات</label>
        <input id="f-notes" value="${GMS.esc(item_.notes || '')}"
               placeholder="ملاحظات على الصنف…">
      </div>

      <div id="f-preview" style="margin-top:16px"></div>
    `;
  }

  function renderQuantitySection(mstate) {
    return `
      <div class="divider" style="margin:18px 0 14px"></div>

      <div style="font-size:11px;font-weight:800;color:var(--muted);
                  text-transform:uppercase;letter-spacing:.5px;
                  margin-bottom:12px;display:flex;align-items:center;gap:6px">
        <i data-lucide="package" style="width:12px;height:12px"></i>
        عدد القطع والأوزان
      </div>

      <div style="padding:16px 18px;background:var(--info-bg);
                  border-radius:12px;
                  border:1px solid color-mix(in srgb,var(--info) 30%,var(--border))">

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:end">
          <div class="field">
            <label>عدد القطع <span class="req">*</span></label>
            <input type="number" id="f-quantity"
                   step="1" min="1" max="9999"
                   value="${mstate.quantity || 1}"
                   class="mono"
                   style="font-size:16px;font-weight:900;
                          text-align:center;color:var(--info)">
          </div>

          <div class="field">
            <label>طريقة إدخال الأوزان</label>
            <div style="display:flex;gap:6px;padding:4px;
                        background:var(--surface);border-radius:10px;
                        border:1px solid var(--border)">
              <button type="button" id="f-mode-same"
                      style="flex:1;padding:9px 12px;border-radius:8px;
                             font-weight:800;font-size:11.5px;cursor:pointer;
                             border:none;font-family:inherit;
                             background:${mstate.sameWeight ? 'var(--primary)' : 'transparent'};
                             color:${mstate.sameWeight ? '#2a1f05' : 'var(--text-2)'};
                             transition:all .2s">
                <i data-lucide="equal" style="width:11px;height:11px;display:inline;vertical-align:-1px"></i>
                وزن موحّد
              </button>
              <button type="button" id="f-mode-diff"
                      style="flex:1;padding:9px 12px;border-radius:8px;
                             font-weight:800;font-size:11.5px;cursor:pointer;
                             border:none;font-family:inherit;
                             background:${!mstate.sameWeight ? 'var(--primary)' : 'transparent'};
                             color:${!mstate.sameWeight ? '#2a1f05' : 'var(--text-2)'};
                             transition:all .2s">
                <i data-lucide="list" style="width:11px;height:11px;display:inline;vertical-align:-1px"></i>
                أوزان متنوعة
              </button>
            </div>
          </div>
        </div>

        <div id="f-unified-weight-host"
             style="margin-top:14px;${mstate.sameWeight ? '' : 'display:none'}">
          <div class="grid-form three">
            <div class="field">
              <label>الوزن القائم (للوحدة) <span class="req">*</span></label>
              <input type="number" id="f-weight" step="0.001" min="0"
                     value="" class="mono"
                     style="font-size:15px;font-weight:800;text-align:center"
                     placeholder="0.000">
            </div>
            <div class="field">
              <label>وزن الأحجار (للوحدة)</label>
              <input type="number" id="f-stone" step="0.001" min="0"
                     value="0" class="mono"
                     style="text-align:center">
            </div>
            <div class="field">
              <label>إجمالي الوزن القائم</label>
              <input id="f-total-weight" readonly class="mono"
                     style="text-align:center;font-weight:900;
                            color:var(--primary);background:var(--surface-3)">
            </div>
          </div>
        </div>

        <div id="f-individual-weight-host"
             style="margin-top:14px;${!mstate.sameWeight ? '' : 'display:none'}">
          <div class="field">
            <label>أوزان القطع <span class="req">*</span></label>
            <textarea id="f-weights-list" rows="6"
                      placeholder="مثال:&#10;5.234&#10;5.421&#10;5.156"
                      class="mono"
                      style="width:100%;padding:11px 13px;
                             border-radius:var(--radius-sm);
                             border:1px solid var(--border);
                             background:var(--surface-2);
                             font-weight:700;font-size:13px;
                             line-height:1.8;direction:ltr;
                             text-align:left;resize:vertical"></textarea>
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:8px;
                      font-size:11.5px;font-weight:700">
            <span id="f-weights-counter" style="color:var(--muted)">عدد الأوزان: 0</span>
            <span id="f-weights-status"></span>
          </div>
        </div>

        <div class="grid-form three" style="margin-top:14px">
          <div class="field">
            <label>الوزن الصافي (للوحدة)</label>
            <input id="f-net" readonly class="mono"
                   style="text-align:center;font-weight:800;background:var(--surface-3)">
          </div>
          <div class="field">
            <label>البندق ${getBaseLabel()} (للوحدة)</label>
            <input id="f-pure" readonly class="mono"
                   style="text-align:center;color:var(--primary);
                          font-weight:900;background:var(--surface-3)">
          </div>
          <div class="field">
            <label>الإجمالي (للوحدة)</label>
            <input id="f-total" readonly class="mono"
                   style="text-align:center;font-weight:800;background:var(--surface-3)">
          </div>
        </div>
      </div>
    `;
  }

  function renderSingleWeightSection(item_, mstate) {
    const baseLabel = getBaseLabel();
    const displayPure = convertFromPure24(item_.pure_weight);

    return `
      <div class="divider" style="margin:18px 0 14px"></div>
      <div style="font-size:11px;font-weight:800;color:var(--muted);
                  text-transform:uppercase;letter-spacing:.5px;
                  margin-bottom:12px;display:flex;align-items:center;gap:6px">
        <i data-lucide="scale" style="width:12px;height:12px"></i>
        الأوزان
      </div>

      <div class="grid-form three">
        <div class="field">
          <label>الوزن القائم (جم) <span class="req">*</span></label>
          <input type="number" id="f-weight" step="0.001" min="0"
                 value="${item_.weight_grams || ''}" class="mono"
                 style="font-size:15px;font-weight:800;text-align:center">
        </div>
        <div class="field">
          <label>وزن الأحجار (جم)</label>
          <input type="number" id="f-stone" step="0.001" min="0"
                 value="${item_.stone_weight || 0}" class="mono"
                 style="text-align:center">
        </div>
        <div class="field">
          <label>الوزن الصافي (جم)</label>
          <input id="f-net" readonly class="mono"
                 value="${item_.net_weight || ''}"
                 style="text-align:center;font-weight:800;background:var(--surface-3)">
        </div>
      </div>

      <div class="grid-form three" style="margin-top:13px">
        <div class="field">
          <label>البندق ${baseLabel} (جم)</label>
          <input id="f-pure" readonly class="mono"
                 value="${displayPure.toFixed(3)}"
                 style="text-align:center;color:var(--primary);
                        font-weight:900;background:var(--surface-3)">
        </div>
        <div class="field">
          <label>الإجمالي (ج.م)</label>
          <input id="f-total" readonly class="mono"
                 value="${item_.total_cost || ''}"
                 style="text-align:center;font-weight:800;background:var(--surface-3)">
        </div>
        <div class="field">
          <label>سعر ${baseLabel} الحالي</label>
          <input readonly class="mono"
                 value="${GMS.moneyFmt(getCurrentPrice24())} ج.م"
                 style="text-align:center;font-weight:700;background:var(--surface-3)">
        </div>
      </div>
    `;
  }

  function renderPricingSection(mstate) {
    const mode = mstate.pricingMode || 'fixed';
    const manu = mstate.selectedManufacturer;

    if (!manu) {
      return `
        <div style="padding:20px;background:var(--surface-2);
                    border-radius:12px;border:1px dashed var(--border);
                    text-align:center;color:var(--muted);
                    font-size:12.5px;font-weight:700">
          <i data-lucide="factory" style="width:24px;height:24px;
                     opacity:.4;display:block;margin:0 auto 8px"></i>
          اختر مصنعاً أولاً لعرض حقول المصنعية المناسبة
        </div>
      `;
    }

    const modeMeta = GMS.getPricingMode(mode);

    return `
      <div style="padding:16px 18px;background:var(--gold-soft);
                  border-radius:12px;
                  border:1.5px solid color-mix(in srgb,var(--primary) 30%,var(--border))">
        <div style="display:flex;align-items:center;gap:10px;
                    margin-bottom:14px;flex-wrap:wrap">
          <div style="width:34px;height:34px;border-radius:9px;
                      display:grid;place-items:center;
                      background:var(--${modeMeta.color});
                      color:#fff;flex-shrink:0">
            <i data-lucide="${modeMeta.icon}" style="width:16px;height:16px"></i>
          </div>
          <div style="flex:1">
            <div style="font-size:12.5px;font-weight:900;color:var(--${modeMeta.color})">
              ${modeMeta.label} — ${GMS.esc(manu.name)}
            </div>
            <div style="font-size:10.5px;color:var(--muted);font-weight:600;margin-top:2px">
              ${modeMeta.description}
            </div>
          </div>
        </div>

        ${renderDynamicSelector(mode, manu, mstate)}

        <div class="grid-form" style="gap:12px;margin-top:14px">
          <div class="field">
            <label style="color:var(--danger)">
              <i data-lucide="shopping-cart" style="width:12px;height:12px"></i>
              مصنعية الشراء (ج.م/جم)
            </label>
            <input type="number" id="f-purchase-rate" step="1" min="0"
                   value="${mstate.purchaseRate || 0}" class="mono"
                   style="font-weight:900;text-align:center;font-size:16px;color:var(--danger)">
          </div>
          <div class="field">
            <label style="color:var(--success)">
              <i data-lucide="tag" style="width:12px;height:12px"></i>
              مصنعية البيع (ج.م/جم)
            </label>
            <input type="number" id="f-sale-rate" step="1" min="0"
                   value="${mstate.saleRate || 0}" class="mono"
                   style="font-weight:900;text-align:center;font-size:16px;color:var(--success)">
          </div>
        </div>

        <div id="f-margin-indicator"
             style="margin-top:12px;padding:10px 14px;
                    background:var(--surface);border-radius:9px;text-align:center">
          ${renderMarginIndicator(mstate)}
        </div>
      </div>
    `;
  }

  function renderDynamicSelector(mode, manu, mstate) {
    if (mode === 'letters') {
      return `
        <div class="field">
          <label>الحرف <span class="req">*</span></label>
          <select id="f-letter">
            <option value="">— اختر حرف —</option>
            ${(manu.letterRates || []).map(l => `
              <option value="${GMS.esc(l.letter)}" data-rate="${l.rate}"
                      ${mstate.selectedLetter === l.letter ? 'selected' : ''}>
                ${GMS.esc(l.letter)} — ${GMS.moneyFmt(l.rate)} ج.م/جم
              </option>
            `).join('')}
          </select>
        </div>
      `;
    }
    if (mode === 'colors') {
      return `
        <div class="field">
          <label>اللون <span class="req">*</span></label>
          <select id="f-color">
            <option value="">— اختر لون —</option>
            ${(manu.colorRates || []).map(c => {
              const color = GMS.getPricingColor(c.color);
              return `
                <option value="${c.color}" data-rate="${c.rate}"
                        data-hex="${color?.hex || '#6b7a95'}"
                        ${mstate.selectedColor === c.color ? 'selected' : ''}>
                  ${color?.label || c.color} — ${GMS.moneyFmt(c.rate)} ج.م/جم
                </option>
              `;
            }).join('')}
          </select>
          <div id="f-color-preview" style="margin-top:8px"></div>
        </div>
      `;
    }
    if (mode === 'items') {
      return `
        <div style="padding:10px 14px;background:var(--surface);
                    border-radius:9px;font-size:11.5px;
                    color:var(--muted);font-weight:600;
                    display:flex;align-items:center;gap:8px">
          <i data-lucide="info" style="width:13px;height:13px;flex-shrink:0"></i>
          سيتم تحديد السعر تلقائياً بناءً على "التصنيف" المختار أعلاه
        </div>
      `;
    }
    if (mode === 'fixed') {
      return `
        <div style="padding:10px 14px;background:var(--surface);
                    border-radius:9px;font-size:11.5px;
                    color:var(--muted);font-weight:600;
                    display:flex;align-items:center;gap:8px">
          <i data-lucide="equal" style="width:13px;height:13px;flex-shrink:0"></i>
          هذا المصنع له سعر ثابت — تم تعبئته تلقائياً
        </div>
      `;
    }
    return '';
  }

  function renderMarginIndicator(mstate) {
    const purchase = Number(mstate.purchaseRate || 0);
    const sale = Number(mstate.saleRate || 0);
    const margin = sale - purchase;
    let color = 'var(--muted)', icon = 'minus', label = 'لا يوجد هامش';

    if (margin > 0) { color = 'var(--success)'; icon = 'trending-up'; label = 'الربح المتوقع لكل جرام'; }
    else if (margin < 0) { color = 'var(--danger)'; icon = 'alert-triangle'; label = 'تحذير: سعر البيع أقل من الشراء!'; }

    return `
      <span style="color:${color};font-weight:900;
                   display:inline-flex;align-items:center;gap:8px;font-size:13px">
        <i data-lucide="${icon}" style="width:15px;height:15px"></i>
        <span>${label}:</span>
        <span class="mono" style="font-size:15px">
          ${margin > 0 ? '+' : ''}${GMS.moneyFmt(margin)}
        </span>
        <span style="font-size:11px;opacity:.7">ج.م/جم</span>
      </span>
    `;
  }

  function bindItemForm(el, closeFn, isEdit, item_, mstate, manufacturers, categories) {
    const $id = (id) => el.querySelector('#' + id);

    const closeBtn = el.querySelector('[data-close]');
    if (closeBtn) closeBtn.onclick = () => closeFn();

    const getCurrentKarat = () => {
      if (mstate.karatMode === 'custom') {
        return {
          karat: null,
          custom_karat: mstate.customKarat,
          purity_ratio: mstate.customPurity,
          is_custom: true,
        };
      }
      return {
        karat: mstate.standardKarat,
        custom_karat: null,
        purity_ratio: GMS.karatRatio(mstate.standardKarat),
        is_custom: false,
      };
    };

    const recalc = () => {
      const karatInfo = getCurrentKarat();
      const purityRatio = karatInfo.purity_ratio;
      const purchaseRate = parseFloat($id('f-purchase-rate')?.value) || 0;
      const saleRate = parseFloat($id('f-sale-rate')?.value) || 0;
      const price24 = getCurrentPrice24();
      const qty = isEdit ? 1 : (parseInt($id('f-quantity')?.value) || 1);

      let netUnit = 0;
      let stoneUnit = 0;

      if (mstate.sameWeight || isEdit) {
        const gross = parseFloat($id('f-weight')?.value) || 0;
        stoneUnit = parseFloat($id('f-stone')?.value) || 0;
        netUnit = GMS.round(Math.max(0, gross - stoneUnit), 3);
      } else {
        const weights = parseWeightsInput($id('f-weights-list')?.value);
        if (weights.length) netUnit = GMS.round(weights[0], 3);
      }

      const pureUnit = GMS.round(netUnit * purityRatio, 4);
      const goldValueUnit = GMS.round(pureUnit * price24, 2);
      const purchaseMakeUnit = GMS.round(netUnit * purchaseRate, 2);
      const saleMakeUnit = GMS.round(netUnit * saleRate, 2);
      const totalUnit = GMS.round(goldValueUnit + saleMakeUnit, 2);
      const profitUnit = GMS.round(saleMakeUnit - purchaseMakeUnit, 2);

      if ($id('f-net')) $id('f-net').value = netUnit.toFixed(3);
      if ($id('f-pure')) {
        /* ✅ v6.1: عرض القيمة بالعيار النشط */
        const displayPure = convertFromPure24(pureUnit);
        $id('f-pure').value = displayPure.toFixed(3);
      }
      if ($id('f-total')) $id('f-total').value = GMS.moneyFmt(totalUnit);

      if ($id('f-total-weight')) {
        const gross = parseFloat($id('f-weight')?.value) || 0;
        $id('f-total-weight').value = `${GMS.gramFmt(gross * qty)} جم`;
      }

      const marginHost = $id('f-margin-indicator');
      if (marginHost) {
        mstate.purchaseRate = purchaseRate;
        mstate.saleRate = saleRate;
        marginHost.innerHTML = renderMarginIndicator(mstate);
        window.lucide?.createIcons();
      }

      updatePreviewBox(el, {
        netUnit, pureUnit, goldValueUnit, purchaseMakeUnit,
        saleMakeUnit, totalUnit, profitUnit, qty,
        purityRatio, karatInfo,
      });
    };

    el.querySelectorAll('[data-karat-std]').forEach(btn => {
      btn.onclick = () => {
        mstate.karatMode = 'standard';
        mstate.standardKarat = Number(btn.dataset.karatStd);
        el.querySelectorAll('[data-karat-std]').forEach(b => b.classList.toggle('active', b === btn));
        const cb = el.querySelector('[data-karat-custom]');
        if (cb) cb.classList.remove('active');
        const panel = $id('f-custom-karat-panel');
        if (panel) panel.style.display = 'none';
        const ki = $id('f-karat');
        if (ki) ki.value = mstate.standardKarat;
        if (mstate.pricingMode === 'items' && mstate.selectedManufacturer) {
          applyItemBasedRate(el, mstate, recalc);
        }
        recalc();
      };
    });

    const customBtn = el.querySelector('[data-karat-custom]');
    if (customBtn) {
      customBtn.onclick = () => {
        mstate.karatMode = 'custom';
        el.querySelectorAll('[data-karat-std]').forEach(b => b.classList.remove('active'));
        customBtn.classList.add('active');
        const panel = $id('f-custom-karat-panel');
        if (panel) panel.style.display = '';
        setTimeout(() => {
          const input = $id('f-custom-karat');
          if (input) {
            try { input.focus({ preventScroll: true }); } catch (_) { input.focus(); }
          }
        }, 100);
        recalc();
      };
    }

    const customKaratInput = $id('f-custom-karat');
    if (customKaratInput) {
      customKaratInput.oninput = () => {
        lockInteraction();
        let v = parseInt(customKaratInput.value) || 888;
        v = Math.max(GMS.KARAT_LIMITS.min, Math.min(GMS.KARAT_LIMITS.max, v));
        mstate.customKarat = v;
        mstate.customPurity = GMS.round(v / 1000, 4);
        const purityInput = $id('f-custom-purity');
        if (purityInput) purityInput.value = mstate.customPurity.toFixed(4);
        const disp = $id('f-purity-display');
        if (disp) disp.textContent = mstate.customPurity.toFixed(4);
        recalc();
      };
    }

    const customPurityInput = $id('f-custom-purity');
    if (customPurityInput) {
      customPurityInput.oninput = () => {
        lockInteraction();
        let v = parseFloat(customPurityInput.value) || 0.8880;
        v = Math.max(GMS.KARAT_LIMITS.minPurity, Math.min(GMS.KARAT_LIMITS.maxPurity, v));
        mstate.customPurity = GMS.round(v, 4);
        mstate.customKarat = Math.round(mstate.customPurity * 1000);
        const karatInput = $id('f-custom-karat');
        if (karatInput) karatInput.value = mstate.customKarat;
        const disp = $id('f-purity-display');
        if (disp) disp.textContent = mstate.customPurity.toFixed(4);
        recalc();
      };
    }

    el.querySelectorAll('[data-custom-preset]').forEach(btn => {
      btn.onclick = () => {
        const presetVal = parseFloat(btn.dataset.customPreset) || 888;
        if (presetVal >= 300) {
          mstate.customKarat = Math.round(presetVal);
          mstate.customPurity = GMS.round(mstate.customKarat / 1000, 4);
        } else {
          mstate.customPurity = GMS.round(presetVal, 4);
          mstate.customKarat = Math.round(mstate.customPurity * 1000);
        }
        const k = $id('f-custom-karat');
        if (k) k.value = mstate.customKarat;
        const p = $id('f-custom-purity');
        if (p) p.value = mstate.customPurity.toFixed(4);
        const disp = $id('f-purity-display');
        if (disp) disp.textContent = mstate.customPurity.toFixed(4);
        recalc();
      };
    });

    const manuSelect = $id('f-manufacturer');
    if (manuSelect) {
      manuSelect.onfocus = () => lockInteraction();
      manuSelect.onchange = () => {
        lockInteraction();
        const opt = manuSelect.selectedOptions[0];
        const mode = opt?.dataset.mode || 'fixed';
        const purchase = Number(opt?.dataset.purchase || 0);
        const sale = Number(opt?.dataset.sale || 0);
        const fixed = Number(opt?.dataset.fixed || 0);
        const code = manuSelect.value;
        const manu = manufacturers.find(m => m.code === code);

        mstate.pricingMode = mode;
        mstate.selectedManufacturer = manu || null;
        mstate.selectedLetter = '';
        mstate.selectedColor = '';

        if (mode === 'fixed') {
          mstate.purchaseRate = fixed;
          mstate.saleRate = sale || Math.round(fixed * 1.2);
        } else {
          mstate.purchaseRate = purchase;
          mstate.saleRate = sale;
        }

        const section = $id('f-pricing-section');
        if (section) {
          section.innerHTML = renderPricingSection(mstate);
          window.lucide?.createIcons();
          bindPricingInputs(el, mstate, manufacturers, recalc);
        }
        recalc();
      };
    }

    ['f-weight', 'f-stone'].forEach(id => {
      const inp = $id(id);
      if (inp) inp.oninput = () => { lockInteraction(); recalc(); };
    });

    const qtyInput = $id('f-quantity');
    if (qtyInput) {
      qtyInput.oninput = () => {
        lockInteraction();
        let v = parseInt(qtyInput.value) || 1;
        v = Math.max(1, Math.min(9999, v));
        mstate.quantity = v;
        updateWeightsCounter(el, mstate);
        recalc();
      };
    }

    const sameModeBtn = $id('f-mode-same');
    const diffModeBtn = $id('f-mode-diff');

    if (sameModeBtn) {
      sameModeBtn.onclick = () => {
        mstate.sameWeight = true;
        $id('f-unified-weight-host').style.display = '';
        $id('f-individual-weight-host').style.display = 'none';
        $id('f-mode-same').style.background = 'var(--primary)';
        $id('f-mode-same').style.color = '#2a1f05';
        $id('f-mode-diff').style.background = 'transparent';
        $id('f-mode-diff').style.color = 'var(--text-2)';
        recalc();
      };
    }

    if (diffModeBtn) {
      diffModeBtn.onclick = () => {
        mstate.sameWeight = false;
        $id('f-unified-weight-host').style.display = 'none';
        $id('f-individual-weight-host').style.display = '';
        $id('f-mode-diff').style.background = 'var(--primary)';
        $id('f-mode-diff').style.color = '#2a1f05';
        $id('f-mode-same').style.background = 'transparent';
        $id('f-mode-same').style.color = 'var(--text-2)';
        updateWeightsCounter(el, mstate);
        recalc();
      };
    }

    const weightsList = $id('f-weights-list');
    if (weightsList) {
      weightsList.oninput = () => {
        lockInteraction();
        updateWeightsCounter(el, mstate);
        recalc();
      };
    }

    const categorySelect = $id('f-category');
    if (categorySelect) {
      categorySelect.onfocus = () => lockInteraction();
      categorySelect.onchange = () => {
        lockInteraction();
        if (mstate.pricingMode === 'items' && mstate.selectedManufacturer) {
          applyItemBasedRate(el, mstate, recalc);
        }
      };
    }

    bindPricingInputs(el, mstate, manufacturers, recalc);

    const genBtn = $id('f-gen-sku');
    if (genBtn) {
      genBtn.onclick = () => {
        const karatInfo = getCurrentKarat();
        const manuCode = manuSelect?.value || 'X';
        const manu = manufacturers.find(m => m.code === manuCode);
        const letter = manu?.letter || manuCode;
        const sku = GMS.generateSKU({
          manufacturerCode: manuCode,
          letter,
          karat: karatInfo.is_custom ? null : karatInfo.karat,
          customKarat: karatInfo.is_custom ? karatInfo.custom_karat : null,
          purityRatio: karatInfo.is_custom ? karatInfo.purity_ratio : null,
          seq: Math.floor(Math.random() * 10000),
        });
        $id('f-sku').value = sku;
      };
    }

    $id('f-save').onclick = async () => {
      await handleSave(el, closeFn, isEdit, item_, mstate, manufacturers, categories, getCurrentKarat);
    };

    setTimeout(() => {
      if (mstate.pricingMode === 'items' && mstate.selectedManufacturer) {
        applyItemBasedRate(el, mstate, recalc);
      }
      recalc();
    }, 50);
  }

  function parseWeightsInput(text) {
    if (!text) return [];
    return String(text).split(/\r?\n/)
      .map(line => parseFloat(line.trim()))
      .filter(n => isFinite(n) && n > 0);
  }

  function updateWeightsCounter(el, mstate) {
    const counter = el.querySelector('#f-weights-counter');
    const status = el.querySelector('#f-weights-status');
    if (!counter || !status) return;

    const weights = parseWeightsInput(el.querySelector('#f-weights-list')?.value);
    const qty = parseInt(el.querySelector('#f-quantity')?.value) || 1;

    counter.textContent = `عدد الأوزان المُدخلة: ${weights.length}`;

    if (weights.length === qty) {
      status.innerHTML = `<span style="color:var(--success);font-weight:800">
        <i data-lucide="check-circle-2" style="width:12px;height:12px;display:inline;vertical-align:-1px"></i>
        مطابق ✓
      </span>`;
    } else if (weights.length < qty) {
      status.innerHTML = `<span style="color:var(--warn);font-weight:800">متبقي ${qty - weights.length} وزن</span>`;
    } else {
      status.innerHTML = `<span style="color:var(--danger);font-weight:800">زيادة ${weights.length - qty} وزن</span>`;
    }
    window.lucide?.createIcons();
  }

  function updatePreviewBox(el, d) {
    const preview = el.querySelector('#f-preview');
    if (!preview) return;

    const qty = d.qty || 1;
    const isCustom = d.karatInfo?.is_custom;
    const baseLabel = getBaseLabel();

    const displayPure = convertFromPure24(d.pureUnit);

    preview.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(5,1fr);
                  gap:10px;padding:14px;
                  background:var(--surface-2);border-radius:11px;
                  border:1px solid var(--border)">
        <div>
          <div style="font-size:10px;color:var(--muted);font-weight:800;text-transform:uppercase">
            قيمة الذهب${qty > 1 ? '/وحدة' : ''}
          </div>
          <div class="mono" style="font-size:13px;font-weight:900;margin-top:3px">
            ${GMS.moneyFmt(d.goldValueUnit)}
          </div>
        </div>
        <div>
          <div style="font-size:10px;color:var(--danger);font-weight:800;text-transform:uppercase">
            مصنعية الشراء
          </div>
          <div class="mono" style="font-size:13px;font-weight:900;margin-top:3px;color:var(--danger)">
            ${GMS.moneyFmt(d.purchaseMakeUnit)}
          </div>
        </div>
        <div>
          <div style="font-size:10px;color:var(--success);font-weight:800;text-transform:uppercase">
            مصنعية البيع
          </div>
          <div class="mono" style="font-size:13px;font-weight:900;margin-top:3px;color:var(--success)">
            ${GMS.moneyFmt(d.saleMakeUnit)}
          </div>
        </div>
        <div>
          <div style="font-size:10px;color:var(--muted);font-weight:800;text-transform:uppercase">
            البندق ${baseLabel}${qty > 1 ? '/وحدة' : ''}
          </div>
          <div class="mono" style="font-size:13px;font-weight:900;margin-top:3px;color:var(--primary)">
            ${displayPure.toFixed(3)} جم
          </div>
          ${isCustom ? `<div class="mono" style="font-size:9.5px;color:var(--warn);font-weight:800;margin-top:2px">
            نقاء ${Number(d.purityRatio).toFixed(4)}
          </div>` : ''}
        </div>
        <div>
          <div style="font-size:10px;color:var(--primary);font-weight:800;text-transform:uppercase">
            الإجمالي${qty > 1 ? '/وحدة' : ''}
          </div>
          <div class="mono" style="font-size:13px;font-weight:900;margin-top:3px;color:var(--primary)">
            ${GMS.moneyFmt(d.totalUnit)}
          </div>
        </div>
      </div>
    `;
    window.lucide?.createIcons();
  }

  function bindPricingInputs(el, mstate, manufacturers, recalc) {
    const $id = (id) => el.querySelector('#' + id);

    const letterSelect = $id('f-letter');
    if (letterSelect) {
      letterSelect.onfocus = () => lockInteraction();
      letterSelect.onchange = () => {
        lockInteraction();
        const opt = letterSelect.selectedOptions[0];
        const rate = Number(opt?.dataset.rate || 0);
        mstate.selectedLetter = letterSelect.value;
        if (rate > 0) {
          const pi = $id('f-purchase-rate');
          if (pi) { pi.value = rate; mstate.purchaseRate = rate; }
        }
        recalc();
      };
    }

    const colorSelect = $id('f-color');
    if (colorSelect) {
      colorSelect.onfocus = () => lockInteraction();
      colorSelect.onchange = () => {
        lockInteraction();
        const opt = colorSelect.selectedOptions[0];
        const rate = Number(opt?.dataset.rate || 0);
        const hex = opt?.dataset.hex || '#6b7a95';
        mstate.selectedColor = colorSelect.value;
        const preview = $id('f-color-preview');
        if (preview && colorSelect.value) {
          preview.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;
                        background:var(--surface);border-radius:8px;
                        font-size:11.5px;font-weight:700">
              <span style="width:20px;height:20px;border-radius:5px;
                           border:1px solid var(--border);background:${hex}"></span>
              <span>معاينة اللون</span>
            </div>
          `;
        } else if (preview) preview.innerHTML = '';
        if (rate > 0) {
          const pi = $id('f-purchase-rate');
          if (pi) { pi.value = rate; mstate.purchaseRate = rate; }
        }
        recalc();
      };
    }

    const purchaseInput = $id('f-purchase-rate');
    if (purchaseInput) {
      purchaseInput.oninput = (e) => {
        lockInteraction();
        mstate.purchaseRate = parseFloat(e.target.value) || 0;
        recalc();
      };
    }

    const saleInput = $id('f-sale-rate');
    if (saleInput) {
      saleInput.oninput = (e) => {
        lockInteraction();
        mstate.saleRate = parseFloat(e.target.value) || 0;
        recalc();
      };
    }
  }

  function applyItemBasedRate(el, mstate, recalc) {
    const categorySelect = el.querySelector('#f-category');
    if (!categorySelect || !mstate.selectedManufacturer) return;
    const category = categorySelect.value;
    const manu = mstate.selectedManufacturer;
    const entry = (manu.itemRates || []).find(i => i.category === category);
    if (entry) {
      const purchaseInput = el.querySelector('#f-purchase-rate');
      if (purchaseInput) {
        purchaseInput.value = entry.rate;
        mstate.purchaseRate = entry.rate;
      }
      recalc();
    }
  }

  async function handleSave(el, closeFn, isEdit, item_, mstate, manufacturers, categories, getCurrentKarat) {
    const $id = (id) => el.querySelector('#' + id);

    const baseSku = ($id('f-sku').value || '').trim().toUpperCase();
    const manuCode = $id('f-manufacturer')?.value || '';
    const qty = isEdit ? 1 : (parseInt($id('f-quantity')?.value) || 1);
    const stonesIncluded = $id('f-stones-included')?.checked || false;
    const purchaseRate = parseFloat($id('f-purchase-rate')?.value) || 0;
    const saleRate = parseFloat($id('f-sale-rate')?.value) || 0;
    const price24 = getCurrentPrice24();

    const karatInfo = getCurrentKarat();

    const holderKey = $id('f-holder')?.value || 'retail_shop';
    const holderEnt = InvState.entities.find(e => e.key === holderKey);
    const holder = holderEnt
      ? { type: holderEnt.type, id: holderEnt.id, name: holderEnt.name }
      : { type: ENTITY_TYPES.RETAIL_SHOP.key, id: ENTITY_TYPES.RETAIL_SHOP.defaultId, name: ENTITY_TYPES.RETAIL_SHOP.label };

    if (!baseSku) { GMS.Beep?.error?.(); return GMS.Toast.err('كود SKU مطلوب'); }
    if (!manuCode) { GMS.Beep?.error?.(); return GMS.Toast.err('المصنع مطلوب'); }

    if (karatInfo.is_custom) {
      if (!GMS.isValidPurity(karatInfo.purity_ratio)) {
        GMS.Beep?.error?.();
        return GMS.Toast.err('نقاء غير صالح',
          `يجب أن يكون بين ${GMS.KARAT_LIMITS.minPurity} و ${GMS.KARAT_LIMITS.maxPurity}`);
      }
    }

    let weights = [];
    if (isEdit || mstate.sameWeight) {
      const gross = parseFloat($id('f-weight')?.value) || 0;
      if (gross <= 0) { GMS.Beep?.error?.(); return GMS.Toast.err('الوزن مطلوب'); }
      weights = Array(qty).fill(gross);
    } else {
      weights = parseWeightsInput($id('f-weights-list')?.value);
      if (weights.length !== qty) {
        GMS.Beep?.error?.();
        return GMS.Toast.err('عدد الأوزان غير مطابق',
          `أدخلت ${weights.length} وزن — المطلوب ${qty}`);
      }
    }

    const stoneUnit = stonesIncluded ? 0 : (parseFloat($id('f-stone')?.value) || 0);
    const manu = manufacturers.find(m => m.code === manuCode);
    const letterCode = $id('f-letter')?.value || '';
    const colorCode = $id('f-color')?.value || '';
    const now = new Date().toISOString();

    const karatPayload = GMS.buildKaratPayload({
      karat: karatInfo.is_custom ? null : karatInfo.karat,
      customKarat: karatInfo.is_custom ? karatInfo.custom_karat : null,
      purityRatio: karatInfo.purity_ratio,
      isCustom: karatInfo.is_custom,
    });

    const items = weights.map((gross, idx) => {
      const net = GMS.round(Math.max(0, gross - stoneUnit), 3);
      const pure = GMS.round(net * karatInfo.purity_ratio, 4);
      const goldValue = GMS.round(pure * price24, 2);
      const makeValue = GMS.round(net * saleRate, 2);
      const purchaseMakeValue = GMS.round(net * purchaseRate, 2);
      const total = GMS.round(goldValue + makeValue, 2);
      const profit = GMS.round(makeValue - purchaseMakeValue, 2);

      const uniqueSku = isEdit ? baseSku : buildUniqueSku(baseSku, idx + 1, qty);

      const payload = {
        sku: uniqueSku,
        parent_sku: qty > 1 ? baseSku : null,
        instance_number: qty > 1 ? (idx + 1) : null,
        category: $id('f-category').value,

        karat: karatPayload.karat,
        custom_karat: karatPayload.custom_karat,
        purity_ratio: karatPayload.purity_ratio,
        is_custom_karat: karatPayload.is_custom_karat,

        weight_grams: GMS.round(gross, 3),
        stone_weight: stoneUnit,
        stones_included: stonesIncluded,
        net_weight: net,
        pure_weight: pure,
        workmanship_per_gram: saleRate,
        purchase_workmanship: purchaseRate,
        workmanship_value: makeValue,
        purchase_workmanship_value: purchaseMakeValue,
        profit_margin: profit,
        gold_value: goldValue,
        total_cost: total,
        price_24: price24,
        status: $id('f-status').value,
        branch_id: $id('f-branch').value,
        manufacturer_code: manuCode,
        manufacturer_name: manu?.name || null,
        manufacturer_id: manu?.id || null,
        manufacturer_mode: manu?.pricingMode || null,
        letter_code: letterCode || null,
        color_code: colorCode || null,

        holder_type: holder.type,
        holder_id: holder.id,
        holder_name: holder.name,

        notes: $id('f-notes').value.trim() || null,
        updated_at: now,
      };

      if (!isEdit) {
        payload.id = 'inv-' + GMS.uid();
        payload.created_at = now;
      }

      return { id: item_?.id || payload.id, ...payload };
    });

    try {
      const saveBtn = $id('f-save');
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = `<i data-lucide="loader-circle"></i> جارٍ الحفظ…`;
        window.lucide?.createIcons();
      }

      if (GMS.IDB) {
        for (const item of items) await GMS.IDB.put(item);
      }

      if (GMS.Supabase?.isReady()) {
        const client = GMS.Supabase.get();
        if (isEdit) {
          await client.from(GMS.SUPABASE_CONFIG.TABLES.INVENTORY)
            .update(items[0]).eq('sku', items[0].sku);
        } else {
          await client.from(GMS.SUPABASE_CONFIG.TABLES.INVENTORY).insert(items);
        }
      }

      if (isEdit) {
        const idx = InvState.items.findIndex(i => i.sku === items[0].sku);
        if (idx >= 0) InvState.items[idx] = items[0];
      } else {
        items.forEach(it => InvState.items.unshift(it));
      }

      if (GMS.Audit) {
        await GMS.Audit.log(
          isEdit ? 'UPDATE' : 'CREATE',
          'inventory', items[0].id,
          isEdit ? `عدّل الصنف ${items[0].sku}`
                 : `أضاف ${qty} قطعة — ${baseSku} (عهدة: ${holder.name})`,
          {
            base_sku: baseSku,
            count: qty,
            holder_type: holder.type,
            holder_id: holder.id,
            holder_name: holder.name,
          }
        );
      }

      GMS.Beep?.success?.();
      closeFn();
      await loadEntities();
      applyFilters();
      render(document.getElementById('page'));
    } catch (e) {
      console.error('[Inventory.save]', e);
      GMS.Beep?.error?.();
      GMS.Toast.err('فشل الحفظ', e.message);
      const saveBtn = $id('f-save');
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = `<i data-lucide="save"></i> إعادة المحاولة`;
        window.lucide?.createIcons();
      }
    }
  }

  async function deleteItem(item) {
    const ok = await GMS.Confirm.delete(`سيتم حذف الصنف "${item.sku}" نهائياً. لا يمكن التراجع.`);
    if (!ok) return;

    try {
      if (GMS.IDB) await GMS.IDB.delete(item.id);
      if (GMS.Supabase?.isReady()) {
        await GMS.Supabase.get()
          .from(GMS.SUPABASE_CONFIG.TABLES.INVENTORY)
          .delete().eq('id', item.id);
      }
      const idx = InvState.items.findIndex(i => i.sku === item.sku);
      if (idx >= 0) InvState.items.splice(idx, 1);
      InvState.selected.delete(item.sku);
      if (GMS.Audit) {
        await GMS.Audit.log('DELETE', 'inventory', item.id, `حذف الصنف ${item.sku}`);
      }
      GMS.Toast.ok('تم الحذف', item.sku);
      GMS.Beep?.delete?.();
      await loadEntities();
      applyFilters();
      render(document.getElementById('page'));
    } catch (e) {
      console.error('[Inventory.delete]', e);
      GMS.Toast.err('فشل الحذف', e.message);
    }
  }

  async function handleBulkAction(action) {
    const selected = Array.from(InvState.selected);
    if (!selected.length) return;
    const items = InvState.items.filter(i => selected.includes(i.sku));

    switch (action) {
      case 'clear':
        InvState.selected.clear();
        refreshTable();
        refreshBulkBar();
        break;
      case 'tag': await bulkPrintTags(items); break;
      case 'export': bulkExport(items); break;
      case 'delete': await bulkDelete(items); break;
      case 'transfer': openTransferModal(selected); break;
    }
  }

  async function bulkPrintTags(items) {
    if (!GMS.QR?.Printer) return GMS.Toast.err('محرك الطباعة غير متاح');
    try {
      GMS.Loading.show('جارٍ توليد التاجات…');
      await GMS.QR.Printer.print(items);
      GMS.Toast.ok(`تمت طباعة ${items.length} تاج`);
    } catch (e) {
      GMS.Toast.err('فشلت الطباعة', e.message);
    } finally { GMS.Loading.hide(); }
  }

  function bulkExport(items) {
    if (!GMS.Excel?.Exporter) return GMS.Toast.err('محرك Excel غير متاح');
    GMS.Excel.Exporter.inventory(items, { filters: InvState.filters });
  }

  async function bulkDelete(items) {
    const ok = await GMS.Confirm.delete(`سيتم حذف ${items.length} صنف نهائياً.`);
    if (!ok) return;
    GMS.Loading.show('جارٍ الحذف…');
    let deleted = 0, failed = 0;
    try {
      for (const item of items) {
        try {
          if (GMS.IDB) await GMS.IDB.delete(item.id);
          if (GMS.Supabase?.isReady()) {
            await GMS.Supabase.get()
              .from(GMS.SUPABASE_CONFIG.TABLES.INVENTORY)
              .delete().eq('id', item.id);
          }
          const idx = InvState.items.findIndex(i => i.sku === item.sku);
          if (idx >= 0) InvState.items.splice(idx, 1);
          deleted++;
        } catch (e) { failed++; }
      }
      InvState.selected.clear();
      if (GMS.Audit) {
        await GMS.Audit.log('DELETE', 'inventory', null,
          `حذف جماعي: ${deleted} صنف`, { deleted, failed });
      }
      if (failed) GMS.Toast.warn('اكتمل الحذف مع أخطاء', `${deleted} نجح · ${failed} فشل`);
      else GMS.Toast.ok('تم الحذف', `${deleted} صنف`);
      await loadEntities();
      applyFilters();
      render(document.getElementById('page'));
    } finally { GMS.Loading.hide(); }
  }

  function exportFiltered() {
    if (!InvState.filtered.length) return GMS.Toast.warn('لا توجد بيانات للتصدير');
    if (!GMS.Excel?.Exporter) return GMS.Toast.err('محرك Excel غير متاح');
    const price24 = getCurrentPrice24();
    const enriched = InvState.filtered.map(item => ({
      ...item,
      live_value: computeLiveValue(item, price24),
      current_price_24: price24,
      holder_name: getItemHolder(item).name,
    }));
    GMS.Excel.Exporter.inventory(enriched, { filters: InvState.filters });
  }

  async function printTag(item) {
    if (!GMS.QR?.Printer) return GMS.Toast.err('محرك الطباعة غير متاح');
    try { await GMS.QR.Printer.printOne(item); }
    catch (e) { GMS.Toast.err('فشلت الطباعة', e.message); }
  }

  function openColumnsMenu(anchorEl) {
    document.querySelector('.col-mgr')?.remove();

    const el = document.createElement('div');
    el.className = 'col-mgr';
    el.style.cssText = `position:absolute;top:calc(100% + 6px);
      inset-inline-end:0;z-index:60;background:var(--surface);
      border:1px solid var(--border-strong);border-radius:12px;
      box-shadow:var(--shadow-2);min-width:240px;max-height:400px;
      overflow-y:auto;padding:9px;`;

    el.innerHTML = `
      <div style="padding:6px 9px 10px;font-size:10.5px;font-weight:800;
                  color:var(--muted);text-transform:uppercase;
                  letter-spacing:.5px;border-bottom:1px solid var(--border);
                  margin-bottom:5px">
        إظهار / إخفاء الأعمدة
      </div>
      ${COLUMNS.map(c => `
        <label style="display:flex;align-items:center;gap:9px;
                      padding:7px 9px;border-radius:7px;font-size:12px;
                      font-weight:700;cursor:pointer">
          <input type="checkbox" class="cb inv-col-toggle"
                 data-col="${c.key}"
                 ${InvState.columns[c.key] ? 'checked' : ''}>
          <span>${GMS.esc(c.label)}</span>
        </label>
      `).join('')}
      <div style="padding:10px 9px 3px;margin-top:5px;border-top:1px solid var(--border)">
        <button class="btn btn-sm btn-block" id="inv-cols-reset">
          <i data-lucide="rotate-ccw"></i> إعادة ضبط
        </button>
      </div>
    `;

    const parent = anchorEl.parentElement;
    parent.style.position = 'relative';
    parent.appendChild(el);
    window.lucide?.createIcons();

    el.querySelectorAll('.inv-col-toggle').forEach(cb => {
      cb.onchange = () => {
        const key = cb.dataset.col;
        const visibleCount = Object.values(InvState.columns).filter(Boolean).length;
        if (!cb.checked && visibleCount <= 2) {
          cb.checked = true;
          GMS.Toast.warn('يجب إبقاء عمودين على الأقل');
          return;
        }
        InvState.columns[key] = cb.checked;
        refreshTable();
      };
    });

    el.querySelector('#inv-cols-reset').onclick = () => {
      const defaults = {
        holder: true, sku: true, category: true, karat: true, weight_grams: true,
        net_weight: true, pure_weight: true, workmanship_per_gram: true,
        total_cost: true, branch: true, manufacturer: true,
        status: true, created_at: false,
      };
      Object.assign(InvState.columns, defaults);
      el.remove();
      refreshTable();
    };

    const closeFn = (e) => {
      if (!el.contains(e.target) && !anchorEl.contains(e.target)) {
        el.remove();
        document.removeEventListener('mousedown', closeFn);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', closeFn), 0);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §18 · ✅ v6.1: PRICE LISTENER + BASEKARAT LISTENER
     ═════════════════════════════════════════════════════════════════════ */

  function bindPriceListener() {
    /* 1 · PriceManager */
    if (GMS.PriceManager?.on) {
      const unsub = GMS.PriceManager.on((newPrice, oldPrice) => {
        if (GMS.Router?.currentId?.() !== 'inventory') return;
        applyFilters();
        refreshTable();
      });
      InvState.unsubscribers.push(unsub);
    }

    /* 2 · Custom event */
    const priceHandler = (e) => {
      if (GMS.Router?.currentId?.() !== 'inventory') return;
      if (!e.detail?.prices?.price24) return;
      applyFilters();
      refreshTable();
    };
    window.addEventListener('goldPriceUpdated', priceHandler);
    InvState.unsubscribers.push(() => {
      window.removeEventListener('goldPriceUpdated', priceHandler);
    });

    /* 3 · ✅ v6.1: BaseKarat listener */
    if (GMS.BaseKarat?.on) {
      const unsub = GMS.BaseKarat.on(() => {
        console.log('[Inventory] 🔄 Base Karat changed — refreshing view');
        if (GMS.Router?.currentId?.() !== 'inventory') return;
        applyFilters();
        render(document.getElementById('page'));
      });
      InvState.unsubscribers.push(unsub);
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §19 · INIT & CLEANUP
     ═════════════════════════════════════════════════════════════════════ */

  async function init() {
    try {
      await loadInventory();
      await loadEntities();
      applyFilters();
      bindPriceListener();
    } catch (e) {
      console.error('[Inventory.init]', e);
      GMS.Toast.err('فشل تحميل المخزون', e.message);
    }
  }

  function cleanup() {
    cleanupListeners();
    InvState.selected.clear();
  }

  /* ═════════════════════════════════════════════════════════════════════
     §20 · VIEW REGISTRATION
     ═════════════════════════════════════════════════════════════════════ */
  GMS.Views = GMS.Views || {};

  GMS.Views.inventory = {
    render: async (root) => {
      await init();
      render(root);
    },
    cleanup,
    state: InvState,

    load: loadInventory,
    loadEntities,
    applyFilters,

    openItemModal,
    showItemDetails,
    deleteItem,
    printTag,
    export: exportFiltered,
    openTransferModal,

    bulkPrintTags,
    bulkExport,
    bulkDelete,

    columns: COLUMNS,

    buildUniqueSku,
    lockInteraction,
    isInteractionLocked,
    getItemKaratInfo,
    getCurrentPrice24,
    computeLiveValue,
    computeAggregateValues,

    getItemHolder,
    setItemHolder,
    isCurrentUserRep,
    isCurrentUserManager,
    ENTITY_TYPES,

    /* ✅ v6.1: Base Karat helpers */
    getBaseLabel,
    getBaseKarat,
    convertFromPure24,
  };

  /* ═════════════════════════════════════════════════════════════════════
     §21 · LOADED CONFIRMATION
     ═════════════════════════════════════════════════════════════════════ */
  console.log(
    '%c📦 Inventory View v6.1 loaded · Base Karat + Hide Empty Tabs',
    'color:#b8912f;font-weight:900;font-size:13px;padding:2px 6px;' +
    'background:linear-gradient(135deg,#f0d68c,#9c7726);border-radius:4px;'
  );

  console.log(
    `%c🔒 Role-Based Isolation · Auto-Hide Empty Entities · Live Karat Conversion`,
    'color:#0f7a43;font-weight:700;font-size:11px;'
  );

  console.log(
    `%c🆕 v6.1: getBaseLabel / getBaseKarat / convertFromPure24 — العيار النشط يظهر في كل الصفحة`,
    'color:#a55a00;font-weight:900;font-size:11px;'
  );

  /* ═════════════════════════════════════════════════════════════════════
     ✅ js/14-views-inventory.js — نهاية الملف
     ═════════════════════════════════════════════════════════════════════ */

})();
