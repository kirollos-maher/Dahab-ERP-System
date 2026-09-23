/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ENTERPRISE — js/15-views-suppliers.js
   صفحة الموردين مع الأرصدة المزدوجة:
     - جدول الموردين مع رصيد الذهب (بندق 24K) + رصيد النقد (EGP)
     - إضافة/تعديل/حذف الموردين
     - حركات الموردين (استلام ذهب، سداد، تسوية كسر، ...)
     - تسجيل السداد (نقدي / ذهب)
     - كشف حساب مزدوج مع مخطط تطور الرصيد
     - بحث وفلترة
     - تصدير Excel

   ✅ v3: دعم كامل للعيارات المخصصة في حركات الذهب
     - karat-grid فيه 4 أزرار (3 قياسي + مخصص)
     - حقل نقاء مباشر (purity_ratio)
     - presets جاهزة للسبائك
     - عرض العيار المخصص في كشف الحساب
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const GMS = window.GMS = window.GMS || {};

  /* ═════════════════════════════════════════════════════════════════════
     §1 · SUPPLIERS STATE
     ═════════════════════════════════════════════════════════════════════ */
  const SupState = {
    suppliers: [],
    filtered: [],
    ledgerEntries: [],

    balances: new Map(),

    filters: {
      search: '',
      balanceFilter: '',
      active: true,
    },

    stats: {
      total: 0,
      totalGold: 0,
      totalCash: 0,
      creditors: 0,
      debtors: 0,
    },

    loading: false,
    statementChart: null,

    unsubscribers: [],

    timers: {
      search: null,
    },
  };

  /* أنواع حركات الموردين */
  const TX_TYPES = {
    gold_received: {
      key: 'gold_received',
      label: 'استلام ذهب',
      labelEn: 'Gold Received',
      sub: 'شحنة مخزون جديدة',
      icon: 'package-plus',
      color: 'et-gold-in',
      goldSign: +1,
      cashSign: 0,
      needsGold: true,
      needsCash: false,
    },
    gold_payment: {
      key: 'gold_payment',
      label: 'تسليم ذهب',
      labelEn: 'Gold Payment',
      sub: 'سداد بالبندق',
      icon: 'package-minus',
      color: 'et-gold-out',
      goldSign: -1,
      cashSign: 0,
      needsGold: true,
      needsCash: false,
    },
    cash_payment: {
      key: 'cash_payment',
      label: 'سداد نقدي',
      labelEn: 'Cash Payment',
      sub: 'دفع للمورد',
      icon: 'banknote',
      color: 'et-cash-out',
      goldSign: 0,
      cashSign: -1,
      needsGold: false,
      needsCash: true,
    },
    cash_received: {
      key: 'cash_received',
      label: 'استلام نقدي',
      labelEn: 'Cash Received',
      sub: 'استرداد من المورد',
      icon: 'hand-coins',
      color: 'et-cash-out',
      goldSign: 0,
      cashSign: -1,
      needsGold: false,
      needsCash: true,
    },
    workmanship: {
      key: 'workmanship',
      label: 'مصنعية',
      labelEn: 'Workmanship',
      sub: 'رسوم تصنيع مستحقة',
      icon: 'hammer',
      color: 'et-cash-in',
      goldSign: 0,
      cashSign: +1,
      needsGold: false,
      needsCash: true,
    },
    scrap_settlement: {
      key: 'scrap_settlement',
      label: 'تسوية كسر',
      labelEn: 'Scrap Settlement',
      sub: 'استلام كسر ذهب',
      icon: 'recycle',
      color: 'et-gold-in',
      goldSign: +1,
      cashSign: 0,
      needsGold: true,
      needsCash: false,
    },
    return_to_supplier: {
      key: 'return_to_supplier',
      label: 'إرجاع للمورد',
      labelEn: 'Return to Supplier',
      sub: 'مرتجع ذهب',
      icon: 'undo-2',
      color: 'et-gold-out',
      goldSign: -1,
      cashSign: 0,
      needsGold: true,
      needsCash: false,
    },
    adjustment: {
      key: 'adjustment',
      label: 'تسوية يدوية',
      labelEn: 'Manual Adjustment',
      sub: 'تعديل الرصيد',
      icon: 'sliders-horizontal',
      color: 'et-adjust',
      goldSign: +1,
      cashSign: +1,
      needsGold: true,
      needsCash: true,
      manual: true,
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §2 · HELPERS
     ═════════════════════════════════════════════════════════════════════ */

  function setText(selector, value) {
    const el = document.querySelector(selector);
    if (el && el.textContent !== String(value)) {
      el.textContent = String(value);
    }
  }

  function esc(v) {
    return GMS.esc ? GMS.esc(v) : String(v == null ? '' : v);
  }

  function cleanupListeners() {
    SupState.unsubscribers.forEach(fn => {
      try { fn(); } catch (_) {}
    });
    SupState.unsubscribers = [];

    clearTimeout(SupState.timers.search);

    if (SupState.statementChart) {
      try {
        SupState.statementChart.destroy();
      } catch (_) {}
      SupState.statementChart = null;
    }
  }

  /**
   * ✅ v3: قراءة معلومات العيار لحركة مورد (قياسي أو مخصص)
   */
  function getEntryKaratInfo(entry) {
    if (!entry) return GMS.resolveKarat(21);

    if (entry.is_custom_karat === true || entry.custom_karat != null) {
      return GMS.resolveKarat({
        custom_karat: entry.custom_karat,
        purity_ratio: entry.purity_ratio,
        is_custom: true,
      });
    }

    if (entry.gold_karat != null) {
      return GMS.resolveKarat(entry.gold_karat);
    }

    return GMS.resolveKarat(21);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §3 · DATA LOADING
     ═════════════════════════════════════════════════════════════════════ */

  async function loadSuppliers() {
    try {
      SupState.loading = true;

      if (GMS.Supabase?.isReady()) {
        try {
          const client = GMS.Supabase.get();
          const { data, error } = await client
            .from(GMS.SUPABASE_CONFIG.TABLES.SUPPLIERS)
            .select('*')
            .eq('is_active', true)
            .order('name', { ascending: true });

          if (!error && data?.length) {
            SupState.suppliers = data;
            return data;
          }
        } catch (e) {
          console.warn('[Suppliers] Supabase read failed:', e);
        }
      }

      if (GMS.Demo) {
        SupState.suppliers = GMS.Demo.getSuppliers();
        return SupState.suppliers;
      }

      SupState.suppliers = [];
      return [];

    } finally {
      SupState.loading = false;
    }
  }

  async function loadLedgerEntries() {
    try {
      if (GMS.Supabase?.isReady()) {
        try {
          const client = GMS.Supabase.get();
          const { data, error } = await client
            .from(GMS.SUPABASE_CONFIG.TABLES.ENTITY_LEDGER)
            .select('*')
            .eq('party_type', 'supplier')
            .order('created_at', { ascending: false })
            .limit(5000);

          if (!error && data) {
            SupState.ledgerEntries = data;
            return data;
          }
        } catch (e) {
          console.warn('[Suppliers] Ledger read failed:', e);
        }
      }

      if (GMS.Demo) {
        SupState.ledgerEntries = GMS.Demo.getLedgerEntries();
        return SupState.ledgerEntries;
      }

      SupState.ledgerEntries = [];
      return [];

    } catch (e) {
      console.error('[Suppliers] loadLedgerEntries:', e);
      SupState.ledgerEntries = [];
      return [];
    }
  }

  function computeBalances() {
    SupState.balances.clear();

    const map = new Map();

    SupState.suppliers.forEach(sup => {
      map.set(sup.id, {
        gold: Number(sup.opening_gold || 0),
        cash: Number(sup.opening_cash || 0),
        entryCount: 0,
        lastActivity: null,
        lastEntry: null,
        customKaratCount: 0,   /* ✅ v3 */
      });
    });

    SupState.ledgerEntries.forEach(entry => {
      const entityId = entry.entity_id || entry.supplier_id;
      if (!entityId) return;

      if (!map.has(entityId)) {
        map.set(entityId, {
          gold: 0,
          cash: 0,
          entryCount: 0,
          lastActivity: null,
          lastEntry: null,
          customKaratCount: 0,
        });
      }

      const b = map.get(entityId);
      b.gold += Number(entry.gold_delta || 0);
      b.cash += Number(entry.cash_delta || 0);
      b.entryCount++;

      /* ✅ v3 */
      if (entry.is_custom_karat === true || entry.custom_karat != null) {
        b.customKaratCount++;
      }

      const ts = new Date(entry.created_at).getTime();
      if (!b.lastActivity || ts > new Date(b.lastActivity).getTime()) {
        b.lastActivity = entry.created_at;
        b.lastEntry = entry;
      }
    });

    map.forEach((v, k) => {
      v.gold = GMS.round(v.gold, 4);
      v.cash = GMS.round(v.cash, 2);
      SupState.balances.set(k, v);
    });

    updateStats();
  }

  function updateStats() {
    let totalGold = 0;
    let totalCash = 0;
    let creditors = 0;
    let debtors = 0;

    SupState.suppliers.forEach(sup => {
      const b = SupState.balances.get(sup.id) || { gold: 0, cash: 0 };
      totalGold += b.gold;
      totalCash += b.cash;

      if (b.gold > 0.0005 || b.cash > 0.005) creditors++;
      if (b.gold < -0.0005 || b.cash < -0.005) debtors++;
    });

    SupState.stats = {
      total: SupState.suppliers.length,
      totalGold: GMS.round(totalGold, 4),
      totalCash: GMS.round(totalCash, 2),
      creditors,
      debtors,
    };
  }

  function applyFilters() {
    const f = SupState.filters;
    let rows = SupState.suppliers.slice();

    if (f.search) {
      const q = f.search.toLowerCase();
      rows = rows.filter(s => {
        const hay = [
          s.name, s.code, s.phone,
          s.contact_person, s.address,
        ].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(q);
      });
    }

    if (f.balanceFilter) {
      rows = rows.filter(s => {
        const b = SupState.balances.get(s.id) || { gold: 0, cash: 0 };
        const goldOwed = b.gold > 0.0005;
        const cashOwed = b.cash > 0.005;
        const goldHeld = b.gold < -0.0005;
        const cashHeld = b.cash < -0.005;

        switch (f.balanceFilter) {
          case 'owed_to_supplier':
            return goldOwed || cashOwed;
          case 'owed_to_us':
            return goldHeld || cashHeld;
          case 'settled':
            return Math.abs(b.gold) < 0.0005 && Math.abs(b.cash) < 0.005;
          default:
            return true;
        }
      });
    }

    rows.sort((a, b) => {
      const ba = SupState.balances.get(a.id) || { gold: 0, cash: 0 };
      const bb = SupState.balances.get(b.id) || { gold: 0, cash: 0 };

      const scoreA = Math.abs(ba.gold) * 1000 + Math.abs(ba.cash);
      const scoreB = Math.abs(bb.gold) * 1000 + Math.abs(bb.cash);

      return scoreB - scoreA;
    });

    SupState.filtered = rows;
    return rows;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §4 · RENDERERS
     ═════════════════════════════════════════════════════════════════════ */

  function renderKPI(cls, icon, label, value, unit, meta, metaIcon) {
    return `
      <div class="kpi ${cls}">
        <div class="kpi-label">
          <i data-lucide="${icon}"></i>
          ${esc(label)}
        </div>
        <div class="kpi-value">
          ${value}
          ${unit ? `<small>${esc(unit)}</small>` : ''}
        </div>
        <div class="kpi-meta">
          ${metaIcon ? `<i data-lucide="${metaIcon}" style="width:11px;height:11px;display:inline;vertical-align:-1px"></i> ` : ''}
          ${meta}
        </div>
      </div>
    `;
  }

  function renderSupplierRow(sup) {
    const b = SupState.balances.get(sup.id) || { gold: 0, cash: 0, customKaratCount: 0 };
    const goldCls = b.gold > 0.0005 ? 'bal-positive'
                   : b.gold < -0.0005 ? 'bal-negative'
                   : 'bal-zero';
    const cashCls = b.cash > 0.005 ? 'bal-positive'
                   : b.cash < -0.005 ? 'bal-negative'
                   : 'bal-zero';

    return `
      <tr data-supplier-id="${esc(sup.id)}">
        <td>
          <div class="cell-sku">
            <span class="sku-code">${esc(sup.name)}</span>
            <span class="sku-meta">
              <span class="mono">${esc(sup.code || '—')}</span>
              ${sup.phone ? ` · <span class="mono">${esc(sup.phone)}</span>` : ''}
              ${sup.contact_person ? ` · ${esc(sup.contact_person)}` : ''}
            </span>
          </div>
        </td>

        <td style="width:180px">
          <div class="balance-dual ${goldCls}">
            <span class="num mono">
              ${GMS.gramFmt(b.gold)}
              <small style="font-size:10px;font-weight:700;color:var(--muted)">جم</small>
            </span>
            <span class="tag">
              ${Math.abs(b.gold) < 0.0005 ? 'مُسوّى'
                : b.gold > 0 ? 'مستحق للمورد' : 'مستحق لنا'}
              ${b.customKaratCount > 0 ? ` · <span style="color:var(--warn)">${b.customKaratCount} مخصص</span>` : ''}
            </span>
          </div>
        </td>

        <td style="width:190px" class="cash-balance">
          <div class="balance-dual ${cashCls}">
            <span class="num mono">
              ${GMS.moneyFmt(b.cash)}
              <small style="font-size:10px;font-weight:700;color:var(--muted)">ج.م</small>
            </span>
            <span class="tag">
              ${Math.abs(b.cash) < 0.005 ? 'مُسوّى'
                : b.cash > 0 ? 'مستحق للمورد' : 'مستحق لنا'}
            </span>
          </div>
        </td>

        <td style="width:110px">
          <div class="cell-sku" style="align-items:flex-end">
            <span class="mono" style="font-weight:800;font-size:12.5px">
              ${b.entryCount}
            </span>
            <span class="sku-meta">
              ${b.lastActivity ? GMS.timeAgo(b.lastActivity) : '—'}
            </span>
          </div>
        </td>

        <td style="width:180px">
          <div style="display:flex;gap:4px;justify-content:flex-end;flex-wrap:nowrap">
            <button class="icon-action gold"
                    data-sup-action="transaction"
                    data-sup-id="${esc(sup.id)}"
                    title="حركة جديدة">
              <i data-lucide="plus-circle"></i>
            </button>
            <button class="icon-action blue"
                    data-sup-action="statement"
                    data-sup-id="${esc(sup.id)}"
                    title="كشف حساب">
              <i data-lucide="file-text"></i>
            </button>
            <button class="icon-action"
                    data-sup-action="payment"
                    data-sup-id="${esc(sup.id)}"
                    title="تسجيل سداد">
              <i data-lucide="banknote"></i>
            </button>
            <button class="icon-action"
                    data-sup-action="edit"
                    data-sup-id="${esc(sup.id)}"
                    title="تعديل">
              <i data-lucide="pencil"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }

  function renderTable() {
    if (!SupState.filtered.length) {
      return `
        <div class="empty" style="padding:60px 20px">
          <i data-lucide="factory"></i>
          <p>${SupState.suppliers.length === 0
            ? 'لا يوجد موردون بعد'
            : 'لا توجد نتائج مطابقة'}</p>
          <span>${SupState.suppliers.length === 0
            ? 'ابدأ بإضافة مورد جديد'
            : 'جرّب تعديل الفلاتر'}</span>
        </div>
      `;
    }

    return `
      <div class="table-wrap" style="border:none;border-radius:0;max-height:64vh">
        <table class="tbl" style="table-layout:fixed">
          <thead>
            <tr>
              <th>الحساب</th>
              <th class="grp-gold" style="text-align:end;width:180px">
                <i data-lucide="scale" style="width:11px;height:11px;display:inline;vertical-align:-1px"></i>
                رصيد الذهب (بندق 24K)
              </th>
              <th class="grp-cash" style="text-align:end;width:190px">
                <i data-lucide="wallet" style="width:11px;height:11px;display:inline;vertical-align:-1px"></i>
                رصيد النقد (EGP)
              </th>
              <th style="text-align:end;width:110px">آخر حركة</th>
              <th style="text-align:end;width:180px">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            ${SupState.filtered.map(renderSupplierRow).join('')}
          </tbody>
          <tfoot>
            <tr>
              <td>الإجمالي (${SupState.filtered.length} مورد)</td>
              <td class="col-num">
                <span class="mono" style="color:var(--primary);font-weight:900">
                  ${GMS.gramFmt(SupState.filtered.reduce((s, sup) => {
                    const b = SupState.balances.get(sup.id) || { gold: 0 };
                    return s + Number(b.gold || 0);
                  }, 0))} جم
                </span>
              </td>
              <td class="col-num">
                <span class="mono" style="color:var(--danger);font-weight:900">
                  ${GMS.moneyFmt(SupState.filtered.reduce((s, sup) => {
                    const b = SupState.balances.get(sup.id) || { cash: 0 };
                    return s + Number(b.cash || 0);
                  }, 0))} ج.م
                </span>
              </td>
              <td colspan="2"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
  }

  function renderActiveFilters() {
    const f = SupState.filters;
    const chips = [];

    if (f.search) chips.push({ key: 'search', label: 'بحث', value: f.search });
    if (f.balanceFilter) {
      const labels = {
        owed_to_supplier: 'مستحق للمورد',
        owed_to_us: 'مستحق لنا',
        settled: 'مُسوّى',
      };
      chips.push({
        key: 'balanceFilter',
        label: 'الرصيد',
        value: labels[f.balanceFilter] || f.balanceFilter,
      });
    }

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
            <span>${esc(c.label)}: <b>${esc(c.value)}</b></span>
            <button class="chip-x" data-clear-filter="${c.key}" type="button">
              <i data-lucide="x"></i>
            </button>
          </span>
        `).join('')}
        <button class="btn btn-ghost btn-sm" id="sup-clear-all-filters"
                style="font-size:11px">
          <i data-lucide="x"></i> مسح الكل
        </button>
      </div>
    `;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §5 · MAIN RENDER
     ═════════════════════════════════════════════════════════════════════ */

  function render(root) {
    const stats = SupState.stats;

    root.innerHTML = `
      <div class="page-header">
        <h2>
          <i data-lucide="factory"></i>
          ${GMS.t('sup.title')}
        </h2>
        <p>${GMS.t('sup.subtitle')}
          <span class="chip warn" style="font-size:10px;margin-inline-start:6px">
            <i data-lucide="sliders-horizontal" style="width:10px;height:10px"></i>
            يدعم العيارات المخصصة
          </span>
        </p>
      </div>

      <div class="kpi-row cols-4">
        ${renderKPI('gold', 'scale', 'إجمالي ذهب الموردين',
            GMS.gramFmt(stats.totalGold), 'جم',
            `<b>${stats.creditors}</b> مستحق للمورد · <b>${stats.debtors}</b> مستحق لنا`,
            'users')}

        ${renderKPI('danger', 'banknote', 'إجمالي الرصيد النقدي',
            GMS.moneyFmt(stats.totalCash), 'ج.م',
            `القيمة السوقية للذهب: <b>${GMS.moneyFmt(stats.totalGold * (GMS.Cache?.getPrice()?.price_24 || 4500))}</b> ج.م`,
            'coins')}

        ${renderKPI('info', 'factory', 'عدد الموردين',
            GMS.intFmt(stats.total), 'حساب',
            `<b>${stats.creditors + stats.debtors}</b> لديهم أرصدة قائمة`,
            'activity')}

        ${renderKPI('violet', 'calendar', 'آخر تحديث',
            '<span style="font-size:14px">' + GMS.timeAgo(new Date()) + '</span>', '',
            'تحديث تلقائي عبر Realtime',
            'refresh-cw')}
      </div>

      <div class="card" style="margin-bottom:16px">
        <div class="toolbar-row">
          <div class="search-wrap" style="flex:1;min-width:240px;max-width:420px">
            <i data-lucide="search"></i>
            <input id="sup-search-input"
                   placeholder="بحث بالاسم، الكود، الهاتف…"
                   value="${esc(SupState.filters.search)}"
                   autocomplete="off">
            ${SupState.filters.search ? `
              <button class="search-clear" id="sup-search-clear">
                <i data-lucide="x"></i>
              </button>
            ` : ''}
          </div>

          <select class="filter-select" id="sup-filter-balance" style="min-width:180px">
            <option value="">كل الأرصدة</option>
            <option value="owed_to_supplier" ${SupState.filters.balanceFilter === 'owed_to_supplier' ? 'selected' : ''}>مستحق للمورد</option>
            <option value="owed_to_us" ${SupState.filters.balanceFilter === 'owed_to_us' ? 'selected' : ''}>مستحق لنا</option>
            <option value="settled" ${SupState.filters.balanceFilter === 'settled' ? 'selected' : ''}>مُسوّى</option>
          </select>

          <div class="spacer" style="flex:1"></div>

          <button class="btn btn-sm" id="sup-export-btn">
            <i data-lucide="download"></i> تصدير Excel
          </button>

          <button class="btn btn-primary btn-sm" id="sup-add-btn">
            <i data-lucide="user-plus"></i> مورد جديد
          </button>
        </div>

        ${renderActiveFilters()}
      </div>

      <div class="card">
        <div id="sup-table-host">
          ${renderTable()}
        </div>
      </div>
    `;

    window.lucide?.createIcons();
    bindControls();
  }

  function refreshTable() {
    const host = document.getElementById('sup-table-host');
    if (host) {
      host.innerHTML = renderTable();
      window.lucide?.createIcons();
      bindTableEvents();
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §6 · CONTROLS BINDING
     ═════════════════════════════════════════════════════════════════════ */

  function bindControls() {
    const searchInput = document.getElementById('sup-search-input');
    if (searchInput) {
      searchInput.oninput = (e) => {
        clearTimeout(SupState.timers.search);
        SupState.timers.search = setTimeout(() => {
          SupState.filters.search = e.target.value.trim();
          applyFilters();
          refreshTable();
        }, 250);
      };
    }

    const clearBtn = document.getElementById('sup-search-clear');
    if (clearBtn) {
      clearBtn.onclick = () => {
        SupState.filters.search = '';
        applyFilters();
        render(document.getElementById('page'));
      };
    }

    const balanceFilter = document.getElementById('sup-filter-balance');
    if (balanceFilter) {
      balanceFilter.onchange = () => {
        SupState.filters.balanceFilter = balanceFilter.value;
        applyFilters();
        render(document.getElementById('page'));
      };
    }

    document.querySelectorAll('[data-clear-filter]').forEach(btn => {
      btn.onclick = () => {
        const key = btn.dataset.clearFilter;
        SupState.filters[key] = '';
        applyFilters();
        render(document.getElementById('page'));
      };
    });

    const clearAllBtn = document.getElementById('sup-clear-all-filters');
    if (clearAllBtn) {
      clearAllBtn.onclick = () => {
        SupState.filters = { search: '', balanceFilter: '', active: true };
        applyFilters();
        render(document.getElementById('page'));
      };
    }

    const addBtn = document.getElementById('sup-add-btn');
    if (addBtn) addBtn.onclick = () => openSupplierModal();

    const exportBtn = document.getElementById('sup-export-btn');
    if (exportBtn) {
      exportBtn.onclick = () => exportSuppliers();
    }

    bindTableEvents();
  }

  function bindTableEvents() {
    document.querySelectorAll('[data-sup-action]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const action = btn.dataset.supAction;
        const id = btn.dataset.supId;

        const sup = SupState.suppliers.find(s => s.id === id);
        if (!sup) return;

        switch (action) {
          case 'transaction':
            openTransactionModal(sup);
            break;
          case 'statement':
            openStatementModal(sup);
            break;
          case 'payment':
            openPaymentModal(sup);
            break;
          case 'edit':
            openSupplierModal(sup);
            break;
        }
      };
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §7 · SUPPLIER MODAL (ADD / EDIT)
     ═════════════════════════════════════════════════════════════════════ */

  function openSupplierModal(sup = null) {
    const isEdit = Boolean(sup);
    const s = sup || {};

    GMS.Modal.open({
      title: isEdit ? `تعديل — ${s.name}` : 'إضافة مورد جديد',
      icon: isEdit ? 'pencil' : 'user-plus',
      size: 'lg',
      body: `
        <div class="grid-form">
          <div class="field">
            <label>الكود</label>
            <input id="sf-code" value="${esc(s.code || '')}"
                   class="mono" dir="ltr"
                   placeholder="SUP-001">
          </div>

          <div class="field">
            <label>الاسم <span class="req">*</span></label>
            <input id="sf-name" value="${esc(s.name || '')}"
                   placeholder="اسم المورد">
          </div>

          <div class="field">
            <label>الشخص المسؤول</label>
            <input id="sf-contact" value="${esc(s.contact_person || '')}"
                   placeholder="اسم جهة الاتصال">
          </div>

          <div class="field">
            <label>الهاتف</label>
            <input id="sf-phone" value="${esc(s.phone || '')}"
                   class="mono" dir="ltr"
                   placeholder="01xxxxxxxxx">
          </div>

          <div class="field field-full">
            <label>العنوان</label>
            <input id="sf-address" value="${esc(s.address || '')}"
                   placeholder="العنوان الكامل">
          </div>

          <div class="field field-full">
            <label>السجل الضريبي</label>
            <input id="sf-tax" value="${esc(s.tax_id || '')}"
                   class="mono" dir="ltr"
                   placeholder="000-000-000">
          </div>
        </div>

        ${!isEdit ? `
          <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border)">
            <div style="font-size:11px;font-weight:800;color:var(--muted);
                        text-transform:uppercase;letter-spacing:.5px;margin-bottom:11px">
              الرصيد الافتتاحي (اختياري)
            </div>
            <div class="grid-form">
              <div class="field">
                <label>رصيد الذهب (بندق 24K — جم)</label>
                <input type="number" id="sf-opening-gold"
                       step="0.0001" value="0" class="mono">
                <span class="hint">موجب = مستحق للمورد · سالب = مستحق لنا</span>
              </div>
              <div class="field">
                <label>رصيد النقد (ج.م)</label>
                <input type="number" id="sf-opening-cash"
                       step="0.01" value="0" class="mono">
                <span class="hint">موجب = مستحق للمورد · سالب = مستحق لنا</span>
              </div>
            </div>
          </div>
        ` : ''}
      `,
      footer: `
        <button class="btn" data-close>إلغاء</button>
        <button class="btn btn-primary" id="sf-save">
          <i data-lucide="save"></i> ${isEdit ? 'حفظ التعديلات' : 'إنشاء المورد'}
        </button>
      `,
      onMount: (el, close) => {
        const $f = (id) => el.querySelector('#' + id);

        $f('sf-save').onclick = async () => {
          const name = $f('sf-name').value.trim();
          if (!name) {
            GMS.Toast.err('الاسم مطلوب');
            $f('sf-name').focus();
            return;
          }

          const payload = {
            code: $f('sf-code').value.trim() || null,
            name,
            contact_person: $f('sf-contact').value.trim() || null,
            phone: $f('sf-phone').value.trim() || null,
            address: $f('sf-address').value.trim() || null,
            tax_id: $f('sf-tax').value.trim() || null,
          };

          try {
            if (isEdit) {
              const idx = SupState.suppliers.findIndex(x => x.id === sup.id);
              if (idx >= 0) {
                SupState.suppliers[idx] = { ...SupState.suppliers[idx], ...payload };
              }

              if (GMS.Supabase?.isReady()) {
                await GMS.Supabase.get()
                  .from(GMS.SUPABASE_CONFIG.TABLES.SUPPLIERS)
                  .update(payload)
                  .eq('id', sup.id);
              }

              if (GMS.Audit) {
                await GMS.Audit.log('UPDATE', 'supplier', sup.id,
                  `عدّل بيانات المورد ${name}`, { changes: Object.keys(payload) });
              }

              GMS.Toast.ok('تم حفظ التعديلات');

            } else {
              payload.opening_gold = parseFloat($f('sf-opening-gold').value) || 0;
              payload.opening_cash = parseFloat($f('sf-opening-cash').value) || 0;
              payload.is_active = true;
              payload.created_at = new Date().toISOString();

              const newId = 'sup-' + GMS.uid();
              SupState.suppliers.push({ id: newId, ...payload });

              if (GMS.Supabase?.isReady()) {
                const { data } = await GMS.Supabase.get()
                  .from(GMS.SUPABASE_CONFIG.TABLES.SUPPLIERS)
                  .insert(payload)
                  .select('id')
                  .single();

                if (data) {
                  SupState.suppliers[SupState.suppliers.length - 1].id = data.id;
                }
              }

              if (GMS.Audit) {
                await GMS.Audit.log('CREATE', 'supplier', newId,
                  `أضاف مورد جديد: ${name}`, payload);
              }

              GMS.Toast.ok('تمت إضافة المورد');
            }

            computeBalances();
            applyFilters();
            render(document.getElementById('page'));
            close();

          } catch (e) {
            console.error('[Suppliers.save]', e);
            GMS.Toast.err('فشل الحفظ', e.message);
          }
        };
      },
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §8 · TRANSACTION MODAL — ✅ v3 مع العيار المخصص
     ═════════════════════════════════════════════════════════════════════ */

  function openTransactionModal(sup) {
    const b = SupState.balances.get(sup.id) || { gold: 0, cash: 0 };

    let selectedType = 'gold_received';

    GMS.Modal.open({
      title: `حركة جديدة — ${sup.name}`,
      icon: 'plus-circle',
      size: 'lg',
      body: `
        <!-- Current balances -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;
                    margin-bottom:20px">
          <div class="stmt-box">
            <div class="sb-k">
              <i data-lucide="scale"></i> رصيد الذهب الحالي
            </div>
            <div class="sb-v mono"
                 style="color:${b.gold > 0.0005 ? 'var(--warn)' : b.gold < -0.0005 ? 'var(--success)' : 'var(--muted)'}">
              ${GMS.gramFmt(b.gold)} <small>جم</small>
            </div>
          </div>
          <div class="stmt-box">
            <div class="sb-k">
              <i data-lucide="wallet"></i> الرصيد النقدي الحالي
            </div>
            <div class="sb-v mono"
                 style="color:${b.cash > 0.005 ? 'var(--danger)' : b.cash < -0.005 ? 'var(--success)' : 'var(--muted)'}">
              ${GMS.moneyFmt(b.cash)} <small>ج.م</small>
            </div>
          </div>
        </div>

        <!-- Type selector -->
        <div style="font-size:11px;font-weight:800;color:var(--muted);
                    text-transform:uppercase;letter-spacing:.5px;margin-bottom:11px">
          نوع الحركة
        </div>

        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:9px"
             id="tx-type-grid">
          ${Object.values(TX_TYPES).map(t => `
            <button type="button" class="tx-type-btn ${t.key === selectedType ? 'active' : ''}"
                    data-tx="${t.key}"
                    style="display:flex;flex-direction:column;
                           align-items:center;justify-content:center;
                           gap:6px;padding:13px 8px;border-radius:12px;
                           border:1.5px solid ${t.key === selectedType ? 'var(--primary)' : 'var(--border)'};
                           background:${t.key === selectedType ? 'color-mix(in srgb,var(--primary) 12%,var(--surface))' : 'var(--surface-2)'};
                           cursor:pointer;text-align:center;min-height:82px;
                           transition:all .2s;font-family:inherit">
              <span style="width:34px;height:34px;border-radius:10px;
                           display:grid;place-items:center;
                           background:${t.key === selectedType ? 'var(--gold-grad)' : 'var(--surface-3)'};
                           color:${t.key === selectedType ? '#2a1f05' : 'var(--text-2)'}">
                <i data-lucide="${t.icon}" style="width:17px;height:17px"></i>
              </span>
              <span style="font-size:11.5px;font-weight:800;
                           color:${t.key === selectedType ? 'var(--text)' : 'var(--text-2)'};
                           line-height:1.25">
                ${t.label}
              </span>
              <span style="font-size:9.5px;color:var(--muted);font-weight:700">
                ${t.sub}
              </span>
            </button>
          `).join('')}
        </div>

        <!-- Dynamic fields -->
        <div id="tx-fields" style="margin-top:20px"></div>

        <!-- Live preview -->
        <div id="tx-preview" style="margin-top:16px"></div>
      `,
      footer: `
        <button class="btn" data-close>إلغاء</button>
        <button class="btn btn-primary" id="tx-save" disabled>
          <i data-lucide="save"></i> حفظ الحركة
        </button>
      `,
      onMount: (el, close) => {
        const $q = (sel) => el.querySelector(sel);

        /* ─── local state for karat ─── */
        const kState = {
          mode: 'standard',
          standard: 21,
          custom: 888,
          purity: 0.8880,
        };

        const getCurrentKarat = () => {
          if (kState.mode === 'custom') {
            return {
              karat: null,
              custom_karat: kState.custom,
              purity_ratio: kState.purity,
              is_custom: true,
            };
          }
          return {
            karat: kState.standard,
            custom_karat: null,
            purity_ratio: GMS.karatRatio(kState.standard),
            is_custom: false,
          };
        };

        /* ─── Render fields ───────────────────────────────── */
        const renderFields = () => {
          const t = TX_TYPES[selectedType];
          const host = $q('#tx-fields');
          if (!host) return;

          const price24 = GMS.Cache?.getPrice()?.price_24 || GMS.APP_CONFIG.DEFAULT_PRICE_24;

          host.innerHTML = `
            ${t.needsGold ? `
              <div style="padding:16px;background:var(--gold-soft);
                          border-radius:12px;
                          border:1px solid color-mix(in srgb,var(--primary) 30%,var(--border));
                          margin-bottom:14px">
                <div style="font-size:11px;font-weight:800;color:var(--warn);
                            text-transform:uppercase;letter-spacing:.5px;
                            margin-bottom:11px;display:flex;align-items:center;gap:6px">
                  <i data-lucide="scale" style="width:13px;height:13px"></i>
                  تفاصيل الذهب
                </div>

                <!-- ✅ v3: Karat grid -->
                <div class="karat-grid" id="tx-karat-grid" style="margin-bottom:12px">
                  ${GMS.KARAT_ORDER.map(k => `
                    <button type="button"
                            class="karat-btn ${k === 21 && kState.mode === 'standard' ? 'active' : ''}"
                            data-tx-karat-std="${k}">
                      <div class="kb-num">${k}K</div>
                      <div class="kb-ratio">${GMS.karatRatio(k).toFixed(4)}</div>
                    </button>
                  `).join('')}
                  <button type="button"
                          class="karat-btn custom-karat-btn"
                          data-tx-karat-custom="1">
                    <div class="kb-num">
                      <i data-lucide="sliders-horizontal"
                         style="width:20px;height:20px"></i>
                    </div>
                    <div class="kb-ratio">مخصص</div>
                  </button>
                </div>

                <input type="hidden" id="tx-karat" value="21">

                <!-- ✅ v3: Custom karat panel -->
                <div id="tx-custom-panel"
                     style="margin-bottom:12px;padding:12px 14px;
                            background:var(--warn-bg);
                            border-radius:10px;
                            border:1.5px solid color-mix(in srgb,var(--warn) 35%,var(--border));
                            display:none">
                  <div style="font-size:10.5px;font-weight:800;color:var(--warn);
                              text-transform:uppercase;letter-spacing:.4px;
                              margin-bottom:8px">
                    عيار مخصص
                  </div>
                  <div class="grid-form" style="gap:10px">
                    <div class="field">
                      <label style="font-size:10.5px">العيار</label>
                      <input type="number" id="tx-custom-karat"
                             step="1" min="300" max="999"
                             value="888" class="mono"
                             style="font-weight:900;text-align:center;font-size:14px">
                    </div>
                    <div class="field">
                      <label style="font-size:10.5px">النقاء</label>
                      <input type="number" id="tx-custom-purity"
                             step="0.0001" min="0.3000" max="1.0000"
                             value="0.8880" class="mono"
                             style="font-weight:900;text-align:center;font-size:14px">
                    </div>
                  </div>
                  <div style="margin-top:8px;display:flex;gap:5px;flex-wrap:wrap">
                    <button type="button" class="btn btn-sm" data-tx-preset="999.9">999.9</button>
                    <button type="button" class="btn btn-sm" data-tx-preset="999">999</button>
                    <button type="button" class="btn btn-sm" data-tx-preset="995">995</button>
                    <button type="button" class="btn btn-sm" data-tx-preset="916">916</button>
                    <button type="button" class="btn btn-sm" data-tx-preset="900">900</button>
                    <button type="button" class="btn btn-sm" data-tx-preset="888">888</button>
                  </div>
                </div>

                <div style="display:grid;grid-template-columns:repeat(2,1fr);
                            gap:11px">
                  <div class="field">
                    <label>الوزن القائم (جم) <span class="req">*</span></label>
                    <input type="number" id="tx-gross"
                           step="0.001" min="0" placeholder="0.000"
                           class="mono"
                           style="font-weight:800;text-align:center;font-size:15px">
                  </div>

                  <div class="field">
                    <label>وزن الأحجار (جم)</label>
                    <input type="number" id="tx-stones"
                           step="0.001" min="0" value="0" class="mono"
                           style="font-weight:700;text-align:center">
                  </div>
                </div>

                <div style="display:grid;grid-template-columns:repeat(3,1fr);
                            gap:11px;margin-top:11px">
                  <div class="field">
                    <label style="color:var(--muted);font-size:10px">الوزن الصافي</label>
                    <input id="tx-net" readonly class="mono"
                           style="font-weight:800;text-align:center;background:rgba(255,255,255,.6)">
                  </div>
                  <div class="field">
                    <label style="color:var(--primary);font-size:10px">البندق 24K</label>
                    <input id="tx-pure" readonly class="mono"
                           style="font-weight:900;text-align:center;color:var(--primary);background:rgba(255,255,255,.6)">
                  </div>
                  <div class="field">
                    <label style="color:var(--muted);font-size:10px">القيمة التقديرية</label>
                    <input id="tx-value" readonly class="mono"
                           style="font-weight:800;text-align:center;background:rgba(255,255,255,.6)">
                  </div>
                </div>
              </div>
            ` : ''}

            ${t.needsCash ? `
              <div style="padding:16px;background:var(--info-bg);
                          border-radius:12px;
                          border:1px solid color-mix(in srgb,var(--info) 30%,var(--border));
                          margin-bottom:14px">
                <div style="font-size:11px;font-weight:800;color:var(--info);
                            text-transform:uppercase;letter-spacing:.5px;
                            margin-bottom:11px;display:flex;align-items:center;gap:6px">
                  <i data-lucide="banknote" style="width:13px;height:13px"></i>
                  تفاصيل النقد
                </div>
                <div class="field">
                  <label>${selectedType === 'workmanship' ? 'قيمة المصنعية (ج.م)' : 'المبلغ (ج.م)'} <span class="req">*</span></label>
                  <input type="number" id="tx-cash"
                         step="0.01" min="0" placeholder="0.00"
                         class="mono"
                         style="font-weight:800;text-align:center;font-size:16px">
                </div>
              </div>
            ` : ''}

            ${t.manual ? `
              <div style="padding:14px 16px;background:var(--violet-bg);
                          border-radius:12px;
                          border:1px solid color-mix(in srgb,var(--violet) 30%,var(--border));
                          margin-bottom:14px">
                <div style="font-size:11px;font-weight:800;color:var(--violet);
                            text-transform:uppercase;letter-spacing:.5px;
                            margin-bottom:11px;display:flex;align-items:center;gap:6px">
                  <i data-lucide="sliders-horizontal" style="width:13px;height:13px"></i>
                  اتجاه التسوية
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:11px">
                  <div class="field">
                    <label>اتجاه الذهب</label>
                    <select id="tx-gold-dir">
                      <option value="+1">موجب (+ زيادة مستحقات المورد)</option>
                      <option value="-1">سالب (− تخفيض مستحقات المورد)</option>
                    </select>
                  </div>
                  <div class="field">
                    <label>اتجاه النقد</label>
                    <select id="tx-cash-dir">
                      <option value="+1">موجب (+ زيادة مستحقات المورد)</option>
                      <option value="-1">سالب (− تخفيض مستحقات المورد)</option>
                    </select>
                  </div>
                </div>
              </div>
            ` : ''}

            <div class="grid-form">
              <div class="field">
                <label>رقم المرجع</label>
                <input id="tx-ref" placeholder="SH-1042 / PV-2101…">
              </div>
              <div class="field">
                <label>البيان</label>
                <input id="tx-desc" placeholder="وصف مختصر…"
                       value="${t.label} — ${esc(sup.name)}">
              </div>
            </div>
          `;

          window.lucide?.createIcons();
          bindFieldEvents();
          recalcPreview();
        };

        /* ─── Bind field events ──────────────────────────── */
        const bindFieldEvents = () => {
          /* ✅ v3: Karat buttons */
          el.querySelectorAll('[data-tx-karat-std]').forEach(btn => {
            btn.onclick = () => {
              kState.mode = 'standard';
              kState.standard = Number(btn.dataset.txKaratStd);

              el.querySelectorAll('[data-tx-karat-std]').forEach(b => {
                b.classList.toggle('active', b === btn);
              });
              const cb = el.querySelector('[data-tx-karat-custom]');
              if (cb) cb.classList.remove('active');

              const panel = $q('#tx-custom-panel');
              if (panel) panel.style.display = 'none';

              const ki = $q('#tx-karat');
              if (ki) ki.value = kState.standard;

              recalcPreview();
            };
          });

          const customBtn = el.querySelector('[data-tx-karat-custom]');
          if (customBtn) {
            customBtn.onclick = () => {
              kState.mode = 'custom';

              el.querySelectorAll('[data-tx-karat-std]').forEach(b => {
                b.classList.remove('active');
              });
              customBtn.classList.add('active');

              const panel = $q('#tx-custom-panel');
              if (panel) panel.style.display = '';

              recalcPreview();
            };
          }

          const ckInput = $q('#tx-custom-karat');
          if (ckInput) {
            ckInput.oninput = () => {
              let v = parseInt(ckInput.value) || 888;
              v = Math.max(GMS.KARAT_LIMITS.min, Math.min(GMS.KARAT_LIMITS.max, v));
              kState.custom = v;
              kState.purity = GMS.round(v / 1000, 4);

              const p = $q('#tx-custom-purity');
              if (p) p.value = kState.purity.toFixed(4);

              recalcPreview();
            };
          }

          const cpInput = $q('#tx-custom-purity');
          if (cpInput) {
            cpInput.oninput = () => {
              let v = parseFloat(cpInput.value) || 0.8880;
              v = Math.max(GMS.KARAT_LIMITS.minPurity,
                           Math.min(GMS.KARAT_LIMITS.maxPurity, v));
              kState.purity = GMS.round(v, 4);
              kState.custom = Math.round(kState.purity * 1000);

              const k = $q('#tx-custom-karat');
              if (k) k.value = kState.custom;

              recalcPreview();
            };
          }

          el.querySelectorAll('[data-tx-preset]').forEach(btn => {
            btn.onclick = () => {
              const pv = parseFloat(btn.dataset.txPreset) || 888;
              if (pv >= 300) {
                kState.custom = Math.round(pv);
                kState.purity = GMS.round(kState.custom / 1000, 4);
              } else {
                kState.purity = GMS.round(pv, 4);
                kState.custom = Math.round(kState.purity * 1000);
              }

              const k = $q('#tx-custom-karat');
              if (k) k.value = kState.custom;

              const p = $q('#tx-custom-purity');
              if (p) p.value = kState.purity.toFixed(4);

              recalcPreview();
            };
          });

          ['tx-gross', 'tx-stones'].forEach(id => {
            const inp = $q('#' + id);
            if (inp) inp.oninput = recalcPreview;
          });

          const cashInp = $q('#tx-cash');
          if (cashInp) cashInp.oninput = recalcPreview;

          const goldDir = $q('#tx-gold-dir');
          if (goldDir) goldDir.onchange = recalcPreview;

          const cashDir = $q('#tx-cash-dir');
          if (cashDir) cashDir.onchange = recalcPreview;
        };

        /* ─── Recalculate + preview ──────────────────────── */
        const recalcPreview = () => {
          const t = TX_TYPES[selectedType];
          const price24 = GMS.Cache?.getPrice()?.price_24 || GMS.APP_CONFIG.DEFAULT_PRICE_24;
          const karatInfo = getCurrentKarat();

          let goldDelta = 0;
          let cashDelta = 0;
          let pure = 0;
          let net = 0;

          if (t.needsGold) {
            const gross = parseFloat($q('#tx-gross')?.value) || 0;
            const stones = parseFloat($q('#tx-stones')?.value) || 0;

            net = GMS.round(Math.max(0, gross - stones), 3);
            pure = GMS.round(net * karatInfo.purity_ratio, 4);

            if ($q('#tx-net')) $q('#tx-net').value = net.toFixed(3);
            if ($q('#tx-pure')) $q('#tx-pure').value = pure.toFixed(3);
            if ($q('#tx-value')) $q('#tx-value').value = GMS.moneyFmt(pure * price24);

            const sign = t.manual ? Number($q('#tx-gold-dir')?.value) || +1 : t.goldSign;
            goldDelta = GMS.round(pure * sign, 4);
          }

          if (t.needsCash) {
            const cash = parseFloat($q('#tx-cash')?.value) || 0;
            const sign = t.manual ? Number($q('#tx-cash-dir')?.value) || +1 : t.cashSign;
            cashDelta = GMS.round(cash * sign, 2);
          }

          const newGold = GMS.round(b.gold + goldDelta, 4);
          const newCash = GMS.round(b.cash + cashDelta, 2);

          const goldCls = goldDelta > 0.00005 ? 'up' : goldDelta < -0.00005 ? 'down' : 'same';
          const cashCls = cashDelta > 0.005 ? 'up' : cashDelta < -0.005 ? 'down' : 'same';

          const previewHost = $q('#tx-preview');
          if (previewHost) {
            /* ✅ v3: عرض العيار */
            const karatDisplay = karatInfo.is_custom
              ? `<span class="karat-badge custom-karat-badge"
                       style="font-size:10px">
                   ${karatInfo.custom_karat} (مخصص)
                 </span>
                 <span style="font-family:var(--font-mono);font-size:10px;
                              color:var(--muted);margin-inline-start:4px">
                   ${Number(karatInfo.purity_ratio).toFixed(4)}
                 </span>`
              : `<span class="karat-badge" data-k="${karatInfo.karat}"
                       style="font-size:10px">
                   ${karatInfo.karat}K
                 </span>`;

            previewHost.innerHTML = `
              <div style="padding:14px;background:var(--surface-2);
                          border-radius:11px;border:1px solid var(--border)">
                <div style="font-size:10.5px;font-weight:800;color:var(--muted);
                            text-transform:uppercase;letter-spacing:.4px;
                            margin-bottom:10px;display:flex;align-items:center;gap:6px">
                  <i data-lucide="eye" style="width:12px;height:12px"></i>
                  المعاينة قبل الحفظ
                </div>

                ${t.needsGold && pure > 0 ? `
                  <div style="display:flex;justify-content:space-between;
                              align-items:center;padding:7px 0;
                              font-size:12.5px;
                              border-bottom:1px dashed var(--border)">
                    <span style="color:var(--muted);font-weight:700">
                      العيار المستخدم
                    </span>
                    <span>${karatDisplay}</span>
                  </div>
                ` : ''}

                <div style="display:flex;justify-content:space-between;
                            padding:7px 0;font-size:12.5px;
                            border-bottom:1px dashed var(--border)">
                  <span style="color:var(--muted);font-weight:700">رصيد الذهب</span>
                  <span>
                    <span class="mono" style="font-weight:800">${GMS.gramFmt(b.gold)} جم</span>
                    ${goldDelta !== 0 ? `
                      <span style="margin-inline-start:8px;color:${goldCls === 'up' ? 'var(--warn)' : 'var(--success)'};font-weight:900">
                        ← ${GMS.gramFmt(newGold)} جم
                        (${goldDelta > 0 ? '+' : ''}${GMS.gramFmt(goldDelta)})
                      </span>
                    ` : '<span style="color:var(--muted);margin-inline-start:8px">بدون تغيير</span>'}
                  </span>
                </div>

                <div style="display:flex;justify-content:space-between;
                            padding:7px 0;font-size:12.5px">
                  <span style="color:var(--muted);font-weight:700">الرصيد النقدي</span>
                  <span>
                    <span class="mono" style="font-weight:800">${GMS.moneyFmt(b.cash)} ج.م</span>
                    ${cashDelta !== 0 ? `
                      <span style="margin-inline-start:8px;color:${cashCls === 'up' ? 'var(--danger)' : 'var(--success)'};font-weight:900">
                        ← ${GMS.moneyFmt(newCash)} ج.م
                        (${cashDelta > 0 ? '+' : ''}${GMS.moneyFmt(cashDelta)})
                      </span>
                    ` : '<span style="color:var(--muted);margin-inline-start:8px">بدون تغيير</span>'}
                  </span>
                </div>
              </div>
            `;
            window.lucide?.createIcons();
          }

          const saveBtn = $q('#tx-save');
          if (saveBtn) {
            const valid =
              (t.needsGold ? pure > 0 : true) &&
              (t.needsCash ? Math.abs(cashDelta) > 0.005 : true);

            saveBtn.disabled = !valid;
          }
        };

        /* ─── Type selection ────────────────────────────── */
        $q('#tx-type-grid')?.querySelectorAll('[data-tx]').forEach(btn => {
          btn.onclick = () => {
            selectedType = btn.dataset.tx;

            $q('#tx-type-grid').querySelectorAll('[data-tx]').forEach(b => {
              const isActive = b.dataset.tx === selectedType;
              b.style.borderColor = isActive ? 'var(--primary)' : 'var(--border)';
              b.style.background = isActive
                ? 'color-mix(in srgb,var(--primary) 12%,var(--surface))'
                : 'var(--surface-2)';
              const iconWrap = b.querySelector('span:first-child');
              if (iconWrap) {
                iconWrap.style.background = isActive ? 'var(--gold-grad)' : 'var(--surface-3)';
                iconWrap.style.color = isActive ? '#2a1f05' : 'var(--text-2)';
              }
            });

            renderFields();
          };
        });

        /* ─── Save ──────────────────────────────────────── */
        $q('#tx-save').onclick = async () => {
          const t = TX_TYPES[selectedType];
          const karatInfo = getCurrentKarat();

          let goldDelta = 0;
          let cashDelta = 0;
          let karat = null;
          let customKarat = null;
          let isCustom = false;
          let purity = null;
          let gross = null;
          let stones = null;
          let net = null;
          let pure = null;

          if (t.needsGold) {
            karat = karatInfo.karat;
            customKarat = karatInfo.custom_karat;
            isCustom = karatInfo.is_custom;
            purity = karatInfo.purity_ratio;

            gross = parseFloat($q('#tx-gross')?.value) || 0;
            stones = parseFloat($q('#tx-stones')?.value) || 0;
            net = GMS.round(Math.max(0, gross - stones), 3);
            pure = GMS.round(net * karatInfo.purity_ratio, 4);

            const sign = t.manual ? Number($q('#tx-gold-dir')?.value) || +1 : t.goldSign;
            goldDelta = GMS.round(pure * sign, 4);
          }

          if (t.needsCash) {
            const cash = parseFloat($q('#tx-cash')?.value) || 0;
            const sign = t.manual ? Number($q('#tx-cash-dir')?.value) || +1 : t.cashSign;
            cashDelta = GMS.round(cash * sign, 2);
          }

          const now = new Date().toISOString();
          const karatLabel = isCustom
            ? `مخصص ${customKarat}`
            : (karat ? `${karat}K` : '');

          const entry = {
            id: GMS.uid(),
            entity_type: 'supplier',
            entity_id: sup.id,
            entry_type: selectedType,
            gold_delta: goldDelta,
            cash_delta: cashDelta,
            gold_karat: karat,
            custom_karat: customKarat,
            is_custom_karat: isCustom,
            purity_ratio: purity,
            gold_gross_weight: gross,
            gold_stone_weight: stones,
            gold_net_weight: net,
            gold_purity_weight: pure,
            gold_price_24: GMS.Cache?.getPrice()?.price_24 || GMS.APP_CONFIG.DEFAULT_PRICE_24,
            reference_no: $q('#tx-ref').value.trim() || null,
            description: $q('#tx-desc').value.trim() || `${t.label}${karatLabel ? ' · ' + karatLabel : ''}`,
            branch_id: GMS.Auth?.profile?.branch_id || null,
            created_at: now,
          };

          try {
            GMS.Loading.show('جارٍ الحفظ…');

            SupState.ledgerEntries.unshift(entry);

            if (GMS.Supabase?.isReady()) {
              const client = GMS.Supabase.get();
              await client
                .from(GMS.SUPABASE_CONFIG.TABLES.ENTITY_LEDGER)
                .insert(entry);
            }

            if (GMS.IDB) {
              try {
                await GMS.IDB._req('metadata', 'readwrite', os => 
                  os.put({ key: 'ledger_' + entry.id, value: entry })
                );
              } catch (_) {}
            }

            computeBalances();
            applyFilters();
            render(document.getElementById('page'));

            if (GMS.Audit) {
              await GMS.Audit.log(
                selectedType.toUpperCase(),
                'supplier',
                sup.id,
                `${t.label}${karatLabel ? ' · ' + karatLabel : ''}: ` +
                `${t.needsGold ? GMS.gramFmt(Math.abs(goldDelta)) + ' جم · ' : ''}` +
                `${t.needsCash ? GMS.moneyFmt(Math.abs(cashDelta)) + ' ج.م' : ''}`,
                {
                  entry_type: selectedType,
                  gold_delta: goldDelta,
                  cash_delta: cashDelta,
                  is_custom_karat: isCustom,
                  custom_karat: customKarat,
                }
              );
            }

            if (GMS.Realtime) {
              GMS.Realtime.emit('entity_ledger', 'INSERT', entry);
            }

            GMS.Loading.hide();
            GMS.Beep?.success();

            const successDesc = isCustom
              ? `${t.label} · مخصص ${customKarat} · ${esc(sup.name)}`
              : `${t.label}${karatLabel ? ' · ' + karatLabel : ''} — ${esc(sup.name)}`;

            GMS.Toast.ok('تم تسجيل الحركة', successDesc);
            close();

          } catch (e) {
            GMS.Loading.hide();
            console.error('[Suppliers.transaction]', e);
            GMS.Toast.err('فشل الحفظ', e.message);
          }
        };

        renderFields();
      },
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §9 · PAYMENT MODAL
     ═════════════════════════════════════════════════════════════════════ */

  function openPaymentModal(sup) {
    const b = SupState.balances.get(sup.id) || { gold: 0, cash: 0 };

    GMS.Modal.open({
      title: `تسجيل سداد — ${sup.name}`,
      icon: 'banknote',
      size: 'sm',
      body: `
        <div style="padding:14px;background:var(--surface-2);
                    border-radius:11px;border:1px solid var(--border);
                    margin-bottom:16px">
          <div style="font-size:11px;font-weight:800;color:var(--muted);
                      text-transform:uppercase;letter-spacing:.4px;
                      margin-bottom:8px">
            الأرصدة الحالية
          </div>
          <div style="display:flex;justify-content:space-between;
                      padding:5px 0;font-size:12.5px">
            <span style="color:var(--muted);font-weight:700">الذهب</span>
            <span class="mono" style="font-weight:900;
                        color:${b.gold > 0 ? 'var(--warn)' : b.gold < 0 ? 'var(--success)' : 'var(--muted)'}">
              ${GMS.gramFmt(b.gold)} جم
            </span>
          </div>
          <div style="display:flex;justify-content:space-between;
                      padding:5px 0;font-size:12.5px">
            <span style="color:var(--muted);font-weight:700">النقد</span>
            <span class="mono" style="font-weight:900;
                        color:${b.cash > 0 ? 'var(--danger)' : b.cash < 0 ? 'var(--success)' : 'var(--muted)'}">
              ${GMS.moneyFmt(b.cash)} ج.م
            </span>
          </div>
        </div>

        <div class="grid-form">
          <div class="field">
            <label>مبلغ نقدي (ج.م)</label>
            <input type="number" id="pay-cash"
                   step="0.01" min="0" value="0" class="mono"
                   style="font-size:15px;font-weight:800;text-align:center">
          </div>

          <div class="field">
            <label>وزن ذهب (بندق 24K — جم)</label>
            <input type="number" id="pay-gold"
                   step="0.0001" min="0" value="0" class="mono"
                   style="font-size:15px;font-weight:800;text-align:center">
          </div>

          <div class="field field-full">
            <label>ملاحظات</label>
            <input id="pay-notes" placeholder="سداد نقدي / تسليم ذهب…">
          </div>
        </div>

        <p style="font-size:11.5px;color:var(--muted);margin-top:12px;
                  line-height:1.7;font-weight:600">
          <i data-lucide="info"
             style="width:12px;height:12px;display:inline;vertical-align:-2px"></i>
          الإشارة السالبة تُقلّل الرصيد المستحق. القيم الموجبة تُزيد الرصيد.
        </p>
      `,
      footer: `
        <button class="btn" data-close>إلغاء</button>
        <button class="btn btn-primary" id="pay-save">
          <i data-lucide="save"></i> تسجيل السداد
        </button>
      `,
      onMount: (el, close) => {
        const $q = (id) => el.querySelector('#' + id);

        $q('pay-save').onclick = async () => {
          const cash = parseFloat($q('pay-cash').value) || 0;
          const gold = parseFloat($q('pay-gold').value) || 0;

          if (cash <= 0 && gold <= 0) {
            GMS.Toast.err('أدخل قيمة السداد');
            return;
          }

          const entry = {
            id: GMS.uid(),
            entity_type: 'supplier',
            entity_id: sup.id,
            entry_type: 'payment',
            gold_delta: GMS.round(-gold, 4),
            cash_delta: GMS.round(-cash, 2),
            is_custom_karat: false,
            description: $q('pay-notes').value.trim() || 'سداد',
            branch_id: GMS.Auth?.profile?.branch_id || null,
            created_at: new Date().toISOString(),
          };

          try {
            SupState.ledgerEntries.unshift(entry);

            if (GMS.Supabase?.isReady()) {
              await GMS.Supabase.get()
                .from(GMS.SUPABASE_CONFIG.TABLES.ENTITY_LEDGER)
                .insert(entry);
            }

            computeBalances();
            applyFilters();
            render(document.getElementById('page'));

            if (GMS.Audit) {
              await GMS.Audit.log('PAYMENT', 'supplier', sup.id,
                `سداد: ${gold > 0 ? GMS.gramFmt(gold) + ' جم · ' : ''}${cash > 0 ? GMS.moneyFmt(cash) + ' ج.م' : ''}`);
            }

            GMS.Beep?.success();
            GMS.Toast.ok('تم تسجيل السداد', sup.name);
            close();

          } catch (e) {
            console.error('[Suppliers.payment]', e);
            GMS.Toast.err('فشل الحفظ', e.message);
          }
        };
      },
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §10 · STATEMENT MODAL — ✅ v3 مع العيار المخصص
     ═════════════════════════════════════════════════════════════════════ */

  function openStatementModal(sup) {
    const entries = SupState.ledgerEntries
      .filter(e => e.entity_id === sup.id)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    let runGold = Number(sup.opening_gold || 0);
    let runCash = Number(sup.opening_cash || 0);

    const rows = entries.map(e => {
      runGold += Number(e.gold_delta || 0);
      runCash += Number(e.cash_delta || 0);
      return {
        ...e,
        balance_gold_after: GMS.round(runGold, 4),
        balance_cash_after: GMS.round(runCash, 2),
      };
    });

    const openRow = {
      _isOpening: true,
      created_at: sup.created_at || new Date().toISOString(),
      entry_type: 'opening',
      description: 'رصيد افتتاحي',
      gold_delta: Number(sup.opening_gold || 0),
      cash_delta: Number(sup.opening_cash || 0),
      balance_gold_after: Number(sup.opening_gold || 0),
      balance_cash_after: Number(sup.opening_cash || 0),
    };

    const fullRows = (Number(sup.opening_gold) !== 0 || Number(sup.opening_cash) !== 0)
      ? [openRow, ...rows]
      : rows;

    const finalBalance = fullRows.length
      ? {
          gold: fullRows[fullRows.length - 1].balance_gold_after,
          cash: fullRows[fullRows.length - 1].balance_cash_after,
        }
      : { gold: 0, cash: 0 };

    const totals = {
      goldIn: rows.filter(r => Number(r.gold_delta) > 0).reduce((s, r) => s + Number(r.gold_delta), 0),
      goldOut: rows.filter(r => Number(r.gold_delta) < 0).reduce((s, r) => s + Math.abs(Number(r.gold_delta)), 0),
      cashIn: rows.filter(r => Number(r.cash_delta) > 0).reduce((s, r) => s + Number(r.cash_delta), 0),
      cashOut: rows.filter(r => Number(r.cash_delta) < 0).reduce((s, r) => s + Math.abs(Number(r.cash_delta)), 0),
      customKaratCount: entries.filter(e => e.is_custom_karat === true || e.custom_karat != null).length,
    };

    GMS.Modal.open({
      title: `كشف حساب مزدوج — ${sup.name}`,
      icon: 'file-text',
      size: 'xl',
      body: `
        <div class="stmt-header">
          <div class="sh-brand">
            <div class="brand-logo">Au</div>
            <div>
              <h2>كشف حساب مزدوج</h2>
              <p>الذهب (بندق 24K) + النقد (EGP)</p>
            </div>
          </div>

          <div class="sh-entity">
            <h3>${esc(sup.name)}</h3>
            <p>
              ${sup.code ? `كود: ${esc(sup.code)} · ` : ''}
              ${sup.phone ? `${esc(sup.phone)} · ` : ''}
              مورد
            </p>
            <p style="margin-top:5px">
              عدد الحركات: <b>${rows.length}</b>
              ${totals.customKaratCount > 0 ? `
                · <span style="color:var(--warn)">
                  <b>${totals.customKaratCount}</b> بعيار مخصص
                </span>
              ` : ''}
            </p>
          </div>
        </div>

        <div class="stmt-summary">
          <div class="stmt-box">
            <div class="sb-k">
              <i data-lucide="flag"></i> الرصيد الافتتاحي
            </div>
            <div class="sb-v mono"
                 style="color:${Number(sup.opening_gold || 0) > 0 ? 'var(--warn)' : Number(sup.opening_gold || 0) < 0 ? 'var(--success)' : 'var(--muted)'}">
              ${GMS.gramFmt(sup.opening_gold || 0)} <small>جم</small>
            </div>
            <div style="font-size:11px;font-weight:700;color:var(--muted);margin-top:3px"
                 class="mono">
              ${GMS.moneyFmt(sup.opening_cash || 0)} ج.م
            </div>
          </div>

          <div class="stmt-box">
            <div class="sb-k">
              <i data-lucide="arrow-down-circle"></i> إجمالي الوارد
            </div>
            <div class="sb-v mono" style="color:var(--warn)">
              ${GMS.gramFmt(totals.goldIn)} <small>جم</small>
            </div>
            <div style="font-size:11px;font-weight:700;color:var(--muted);margin-top:3px"
                 class="mono">
              ${GMS.moneyFmt(totals.cashIn)} ج.م
            </div>
          </div>

          <div class="stmt-box">
            <div class="sb-k">
              <i data-lucide="arrow-up-circle"></i> إجمالي الصادر
            </div>
            <div class="sb-v mono" style="color:var(--success)">
              ${GMS.gramFmt(totals.goldOut)} <small>جم</small>
            </div>
            <div style="font-size:11px;font-weight:700;color:var(--muted);margin-top:3px"
                 class="mono">
              ${GMS.moneyFmt(totals.cashOut)} ج.م
            </div>
          </div>

          <div class="stmt-box hi">
            <div class="sb-k" style="color:var(--primary)">
              <i data-lucide="wallet"></i> الرصيد الحالي
            </div>
            <div class="sb-v mono"
                 style="color:${finalBalance.gold > 0.0005 ? 'var(--warn)' : finalBalance.gold < -0.0005 ? 'var(--success)' : 'var(--muted)'}">
              ${GMS.gramFmt(finalBalance.gold)} <small>جم</small>
            </div>
            <div style="font-size:12px;font-weight:800;
                        color:${finalBalance.cash > 0.005 ? 'var(--danger)' : finalBalance.cash < -0.005 ? 'var(--success)' : 'var(--muted)'};
                        margin-top:3px"
                 class="mono">
              ${GMS.moneyFmt(finalBalance.cash)} ج.م
            </div>
          </div>
        </div>

        <div class="card" style="margin-bottom:16px">
          <div class="card-head" style="padding:11px 16px">
            <h3 style="font-size:12.5px">
              <i data-lucide="trending-up"></i>
              تطور الرصيد
            </h3>
          </div>
          <div class="card-body" style="padding:14px 16px">
            <div class="chart-wrap" style="height:220px">
              <canvas id="stmt-chart"></canvas>
            </div>
          </div>
        </div>

        <div style="max-height:420px;overflow:auto;
                    border:1px solid var(--border);border-radius:11px">
          <table class="tbl" style="font-size:11.5px">
            <thead>
              <tr>
                <th style="width:100px">التاريخ</th>
                <th style="width:130px">النوع</th>
                <th>البيان</th>
                <th style="width:90px" class="col-num">ذهب (جم)</th>
                <th style="width:90px" class="col-num">بندق 24K</th>
                <th style="width:110px" class="col-num">نقد (ج.م)</th>
                <th style="width:100px" class="col-num">رصيد الذهب</th>
                <th style="width:110px" class="col-num">الرصيد النقدي</th>
              </tr>
            </thead>
            <tbody>
              ${fullRows.length ? fullRows.slice().reverse().map(r => {
                const t = TX_TYPES[r.entry_type] || {};
                const gold = Number(r.gold_delta || 0);
                const cash = Number(r.cash_delta || 0);
                const karatInfo = getEntryKaratInfo(r);

                /* ✅ v3: عرض العيار */
                const karatText = karatInfo.is_custom
                  ? `<span class="custom-karat-badge karat-badge"
                           style="font-size:9px;padding:1px 5px">
                       ${karatInfo.custom_karat}
                     </span>`
                  : (karatInfo.karat
                      ? `<span style="color:var(--muted);font-size:9.5px"> (${karatInfo.karat}K)</span>`
                      : '');

                return `
                  <tr>
                    <td class="mono" style="font-size:10.5px;color:var(--muted)">
                      ${GMS.dateAr(r.created_at)}
                    </td>
                    <td>
                      <span class="entry-type-pill ${t.color || 'et-neutral'}"
                            style="font-size:9.5px;padding:2px 7px">
                        ${esc(t.label || r.entry_type)}
                      </span>
                    </td>
                    <td style="font-weight:600">
                      ${esc(r.description || '—')}
                      ${r.reference_no ? `
                        <span style="color:var(--muted);font-size:10px;display:block">
                          ${esc(r.reference_no)}
                        </span>
                      ` : ''}
                    </td>
                    <td class="col-num">
                      ${r.gold_gross_weight ? GMS.gramFmt(r.gold_gross_weight) : (gold !== 0 ? '—' : '')}
                      ${karatText}
                    </td>
                    <td class="col-num" style="font-weight:800;
                        color:${gold > 0 ? 'var(--warn)' : gold < 0 ? 'var(--success)' : 'var(--muted)'}">
                      ${gold !== 0 ? (gold > 0 ? '+' : '') + GMS.gramFmt(gold) : '—'}
                    </td>
                    <td class="col-num" style="font-weight:800;
                        color:${cash > 0 ? 'var(--danger)' : cash < 0 ? 'var(--success)' : 'var(--muted)'}">
                      ${cash !== 0 ? (cash > 0 ? '+' : '') + GMS.moneyFmt(cash) : '—'}
                    </td>
                    <td class="col-num" style="font-weight:900;
                        color:${r.balance_gold_after > 0.0005 ? 'var(--warn)' : r.balance_gold_after < -0.0005 ? 'var(--success)' : 'var(--muted)'}">
                      ${GMS.gramFmt(r.balance_gold_after)}
                    </td>
                    <td class="col-num" style="font-weight:900;
                        color:${r.balance_cash_after > 0.005 ? 'var(--danger)' : r.balance_cash_after < -0.005 ? 'var(--success)' : 'var(--muted)'}">
                      ${GMS.moneyFmt(r.balance_cash_after)}
                    </td>
                  </tr>
                `;
              }).join('') : `
                <tr>
                  <td colspan="8" style="text-align:center;padding:40px;color:var(--muted)">
                    لا توجد حركات مسجَّلة
                  </td>
                </tr>
              `}
            </tbody>
          </table>
        </div>

        <p style="font-size:11px;color:var(--muted);margin-top:11px;
                  font-weight:600;text-align:center">
          <i data-lucide="info"
             style="width:11px;height:11px;display:inline;vertical-align:-1px"></i>
          إشارة الرصيد:
          <b style="color:var(--warn)">موجب</b> = مستحق للمورد ·
          <b style="color:var(--success)">سالب</b> = مستحق لنا
        </p>
      `,
      footer: `
        <button class="btn" id="stmt-print">
          <i data-lucide="printer"></i> طباعة
        </button>
        <button class="btn" id="stmt-export">
          <i data-lucide="download"></i> تصدير Excel
        </button>
        <button class="btn btn-primary" data-close>إغلاق</button>
      `,
      onMount: (el, close) => {
        setTimeout(() => {
          drawStatementChart(fullRows);
        }, 100);

        el.querySelector('#stmt-print').onclick = () => {
          printStatement(sup, fullRows, finalBalance, totals);
        };

        el.querySelector('#stmt-export').onclick = () => {
          exportStatement(sup, fullRows);
        };
      },
    });
  }

  function drawStatementChart(rows) {
    const canvas = document.getElementById('stmt-chart');
    if (!canvas || typeof window.Chart === 'undefined') return;

    if (SupState.statementChart) {
      try { SupState.statementChart.destroy(); } catch (_) {}
    }

    const labels = rows.map(r => GMS.dateAr(r.created_at));
    const goldSeries = rows.map(r => Number(r.balance_gold_after || 0));
    const cashSeries = rows.map(r => Number(r.balance_cash_after || 0));

    const css = getComputedStyle(document.documentElement);

    SupState.statementChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'رصيد الذهب (جم)',
            data: goldSeries,
            borderColor: css.getPropertyValue('--primary').trim(),
            backgroundColor: 'rgba(200,162,74,.12)',
            fill: true,
            tension: .35,
            borderWidth: 2.4,
            pointRadius: 0,
            pointHoverRadius: 5,
            yAxisID: 'y',
          },
          {
            label: 'الرصيد النقدي (ج.م)',
            data: cashSeries,
            borderColor: css.getPropertyValue('--info').trim(),
            backgroundColor: 'rgba(28,79,216,.08)',
            fill: false,
            tension: .35,
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 5,
            borderDash: [5, 4],
            yAxisID: 'y1',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: css.getPropertyValue('--text').trim(),
              font: { size: 10.5, family: 'Cairo' },
              padding: 12,
              usePointStyle: true,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: css.getPropertyValue('--muted').trim(),
              font: { size: 10 },
              maxRotation: 0,
              autoSkipPadding: 30,
            },
          },
          y: {
            position: 'right',
            grid: { color: css.getPropertyValue('--border').trim() },
            ticks: {
              color: css.getPropertyValue('--muted').trim(),
              font: { size: 10 },
              callback: v => GMS.gramFmt(v),
            },
          },
          y1: {
            position: 'left',
            grid: { display: false },
            ticks: {
              color: css.getPropertyValue('--muted').trim(),
              font: { size: 10 },
              callback: v => GMS.shortMoney(v),
            },
          },
        },
      },
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §11 · PRINT STATEMENT
     ═════════════════════════════════════════════════════════════════════ */

  function printStatement(sup, rows, finalBalance, totals) {
    const root = document.getElementById('print-root');
    if (!root) return;

    const pageStyle = document.getElementById('gms-page-size-style');
    const original = pageStyle?.textContent || '';
    if (pageStyle) {
      pageStyle.textContent = `
        @media print {
          @page { size: A4 portrait; margin: 12mm; }
        }
      `;
    }

    root.innerHTML = `
      <div style="font-family:'Cairo',sans-serif;direction:rtl;color:#000">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;
                    border-bottom:2px solid #000;padding-bottom:9mm;margin-bottom:7mm">
          <div>
            <h1 style="font-size:18pt;font-weight:900;margin:0 0 2mm">
              ${esc(GMS.APP_CONFIG.NAME_AR)}
            </h1>
            <p style="margin:0;font-size:9.5pt;color:#333">
              كشف حساب مزدوج — مورد
            </p>
          </div>
          <div style="text-align:left;font-size:10pt">
            <h2 style="margin:0 0 2mm;font-size:14pt;font-weight:900">
              ${esc(sup.name)}
            </h2>
            ${sup.code ? `<p style="margin:1mm 0;color:#333">الكود: ${esc(sup.code)}</p>` : ''}
            ${sup.phone ? `<p style="margin:1mm 0;color:#333">الهاتف: ${esc(sup.phone)}</p>` : ''}
            <p style="margin:1mm 0;color:#333">التاريخ: ${GMS.dateAr(new Date())}</p>
          </div>
        </div>

        <div style="text-align:center;font-size:14pt;font-weight:900;
                    background:#f1e8d0;padding:3mm;border:1.5px solid #000;
                    margin-bottom:6mm">
          كشف حساب مزدوج — ذهب ونقد
        </div>

        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4mm;
                    margin-bottom:6mm">
          <div style="border:1.5px solid #000;padding:3mm 4mm;border-radius:2mm">
            <div style="font-size:8.5pt;font-weight:800;color:#555">الرصيد الافتتاحي</div>
            <div style="font-size:12pt;font-weight:900;margin-top:1.5mm">
              ${GMS.gramFmt(sup.opening_gold || 0)} جم
            </div>
            <div style="font-size:9pt;color:#333;margin-top:1mm">
              ${GMS.moneyFmt(sup.opening_cash || 0)} ج.م
            </div>
          </div>

          <div style="border:1.5px solid #000;padding:3mm 4mm;border-radius:2mm">
            <div style="font-size:8.5pt;font-weight:800;color:#555">إجمالي الوارد</div>
            <div style="font-size:12pt;font-weight:900;margin-top:1.5mm">
              ${GMS.gramFmt(totals.goldIn)} جم
            </div>
            <div style="font-size:9pt;color:#333;margin-top:1mm">
              ${GMS.moneyFmt(totals.cashIn)} ج.م
            </div>
          </div>

          <div style="border:1.5px solid #000;padding:3mm 4mm;border-radius:2mm">
            <div style="font-size:8.5pt;font-weight:800;color:#555">إجمالي الصادر</div>
            <div style="font-size:12pt;font-weight:900;margin-top:1.5mm">
              ${GMS.gramFmt(totals.goldOut)} جم
            </div>
            <div style="font-size:9pt;color:#333;margin-top:1mm">
              ${GMS.moneyFmt(totals.cashOut)} ج.م
            </div>
          </div>

          <div style="border:1.5px solid #000;padding:3mm 4mm;border-radius:2mm;
                      background:#f1e8d0">
            <div style="font-size:8.5pt;font-weight:800;color:#555">الرصيد الحالي</div>
            <div style="font-size:12pt;font-weight:900;margin-top:1.5mm">
              ${GMS.gramFmt(finalBalance.gold)} جم
            </div>
            <div style="font-size:10pt;font-weight:900;margin-top:1mm">
              ${GMS.moneyFmt(finalBalance.cash)} ج.م
            </div>
          </div>
        </div>

        <table style="width:100%;border-collapse:collapse;font-size:9pt">
          <thead>
            <tr>
              <th style="background:#e8e8e8;padding:2.5mm 2mm;text-align:right;
                         font-weight:900;border:1px solid #000;font-size:9pt">
                التاريخ
              </th>
              <th style="background:#e8e8e8;padding:2.5mm 2mm;text-align:right;
                         font-weight:900;border:1px solid #000;font-size:9pt">
                النوع
              </th>
              <th style="background:#e8e8e8;padding:2.5mm 2mm;text-align:right;
                         font-weight:900;border:1px solid #000;font-size:9pt">
                البيان
              </th>
              <th style="background:#e8e8e8;padding:2.5mm 2mm;text-align:left;
                         font-weight:900;border:1px solid #000;font-size:9pt">
                ذهب (جم)
              </th>
              <th style="background:#e8e8e8;padding:2.5mm 2mm;text-align:left;
                         font-weight:900;border:1px solid #000;font-size:9pt">
                نقد (ج.م)
              </th>
              <th style="background:#e8e8e8;padding:2.5mm 2mm;text-align:left;
                         font-weight:900;border:1px solid #000;font-size:9pt">
                رصيد الذهب
              </th>
              <th style="background:#e8e8e8;padding:2.5mm 2mm;text-align:left;
                         font-weight:900;border:1px solid #000;font-size:9pt">
                رصيد النقد
              </th>
            </tr>
          </thead>
          <tbody>
            ${rows.slice().reverse().map(r => {
              const t = TX_TYPES[r.entry_type] || {};
              const karatInfo = getEntryKaratInfo(r);
              const karatSuffix = karatInfo.is_custom
                ? ` (${karatInfo.custom_karat})`
                : (karatInfo.karat ? ` (${karatInfo.karat}K)` : '');

              return `
                <tr>
                  <td style="padding:2mm;border:1px solid #666;vertical-align:top">
                    ${GMS.dateAr(r.created_at)}
                  </td>
                  <td style="padding:2mm;border:1px solid #666;vertical-align:top">
                    ${esc(t.label || r.entry_type)}${karatSuffix}
                  </td>
                  <td style="padding:2mm;border:1px solid #666;vertical-align:top">
                    ${esc(r.description || '—')}
                  </td>
                  <td style="padding:2mm;border:1px solid #666;text-align:left;vertical-align:top;
                             font-variant-numeric:tabular-nums">
                    ${Number(r.gold_delta) !== 0
                      ? (Number(r.gold_delta) > 0 ? '+' : '') + GMS.gramFmt(r.gold_delta)
                      : '—'}
                  </td>
                  <td style="padding:2mm;border:1px solid #666;text-align:left;vertical-align:top;
                             font-variant-numeric:tabular-nums">
                    ${Number(r.cash_delta) !== 0
                      ? (Number(r.cash_delta) > 0 ? '+' : '') + GMS.moneyFmt(r.cash_delta)
                      : '—'}
                  </td>
                  <td style="padding:2mm;border:1px solid #666;text-align:left;vertical-align:top;
                             font-variant-numeric:tabular-nums;font-weight:900">
                    ${GMS.gramFmt(r.balance_gold_after)}
                  </td>
                  <td style="padding:2mm;border:1px solid #666;text-align:left;vertical-align:top;
                             font-variant-numeric:tabular-nums;font-weight:900">
                    ${GMS.moneyFmt(r.balance_cash_after)}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>

        <div style="margin-top:8mm;padding:3mm 4mm;border:1px dashed #666;
                    font-size:9pt;background:#fafafa">
          <b>ملاحظة:</b> إشارة الرصيد الموجبة (+) تعني مستحق للمورد،
          والسالبة (−) تعني مستحق لنا. جميع الأوزان معبَّر عنها بالوزن الصافي
          المعادل لعيار 24 قيراط (البندق).
        </div>

        <div style="margin-top:12mm;display:flex;justify-content:space-between;
                    font-size:9.5pt">
          <div style="border-top:1.5px dashed #000;padding-top:2mm;
                      min-width:35mm;text-align:center;font-weight:800">
            توقيع المورد
          </div>
          <div style="border-top:1.5px dashed #000;padding-top:2mm;
                      min-width:35mm;text-align:center;font-weight:800">
            توقيع المستلم
          </div>
          <div style="border-top:1.5px dashed #000;padding-top:2mm;
                      min-width:35mm;text-align:center;font-weight:800">
            ختم الشركة
          </div>
        </div>
      </div>
    `;

    setTimeout(() => {
      window.print();
      setTimeout(() => {
        if (pageStyle && original) pageStyle.textContent = original;
      }, 1000);
    }, 150);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §12 · EXPORT
     ═════════════════════════════════════════════════════════════════════ */

  function exportSuppliers() {
    if (!SupState.filtered.length) {
      GMS.Toast.warn('لا توجد بيانات');
      return;
    }

    if (!GMS.Excel?.Exporter) {
      GMS.Toast.err('محرك Excel غير متاح');
      return;
    }

    const data = SupState.filtered.map(s => {
      const b = SupState.balances.get(s.id) || { gold: 0, cash: 0 };
      return {
        ...s,
        gold_balance: b.gold,
        cash_balance: b.cash,
      };
    });

    GMS.Excel.Exporter.suppliers(data, {
      filters: SupState.filters,
    });
  }

  function exportStatement(sup, rows) {
    if (!rows.length) {
      GMS.Toast.warn('لا توجد حركات');
      return;
    }

    if (!GMS.Excel || !window.XLSX) {
      GMS.Toast.err('محرك Excel غير متاح');
      return;
    }

    const data = rows.slice().reverse().map(r => {
      const karatInfo = getEntryKaratInfo(r);
      return {
        'التاريخ': GMS.dateTimeAr(r.created_at),
        'النوع': TX_TYPES[r.entry_type]?.label || r.entry_type,
        'البيان': r.description || '',
        'المرجع': r.reference_no || '',
        'ذهب (جم)': Number(r.gold_delta) || 0,
        'نقد (ج.م)': Number(r.cash_delta) || 0,
        'العيار': karatInfo.is_custom
          ? `${karatInfo.custom_karat} (مخصص)`
          : (karatInfo.karat ? `${karatInfo.karat}K` : ''),
        'النقاء': karatInfo.is_custom
          ? Number(karatInfo.purity_ratio).toFixed(4)
          : '',
        'رصيد الذهب بعد': r.balance_gold_after || 0,
        'رصيد النقد بعد': r.balance_cash_after || 0,
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [
      { wch: 20 }, { wch: 18 }, { wch: 30 }, { wch: 14 },
      { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 10 },
      { wch: 16 }, { wch: 16 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'كشف حساب');

    XLSX.writeFile(wb, `statement_${sup.code || sup.name}_${GMS.todayISO()}.xlsx`);
    GMS.Toast.ok('تم تصدير كشف الحساب');
  }

  /* ═════════════════════════════════════════════════════════════════════
     §13 · INITIALIZATION
     ═════════════════════════════════════════════════════════════════════ */

  async function init() {
    try {
      await Promise.all([
        loadSuppliers(),
        loadLedgerEntries(),
      ]);

      computeBalances();
      applyFilters();

    } catch (e) {
      console.error('[Suppliers.init]', e);
      GMS.Toast.err('فشل تحميل البيانات', e.message);
    }
  }

  function cleanup() {
    cleanupListeners();
  }

  /* ═════════════════════════════════════════════════════════════════════
     §14 · REALTIME HOOKS
     ═════════════════════════════════════════════════════════════════════ */

  function bindRealtimeUpdates() {
    if (!GMS.Realtime) return;

    const unsub = GMS.Realtime.on('event', (event) => {
      if (GMS.Router?.current() !== 'suppliers') return;

      if (event.table === 'entity_ledger' || event.table === 'suppliers') {
        setTimeout(async () => {
          await loadLedgerEntries();
          computeBalances();
          applyFilters();
          refreshTable();
        }, 300);
      }
    });

    SupState.unsubscribers.push(unsub);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §15 · VIEW REGISTRATION
     ═════════════════════════════════════════════════════════════════════ */
  GMS.Views = GMS.Views || {};

  GMS.Views.suppliers = {
    render: async (root) => {
      await init();
      render(root);
      bindRealtimeUpdates();
    },
    cleanup,
    state: SupState,

    load: loadSuppliers,
    reload: loadLedgerEntries,
    computeBalances,
    applyFilters,

    openSupplierModal,
    openTransactionModal,
    openPaymentModal,
    openStatementModal,

    export: exportSuppliers,
    exportStatement,

    TX_TYPES,
  };

  /* ═════════════════════════════════════════════════════════════════════
     §16 · LOADED CONFIRMATION
     ═════════════════════════════════════════════════════════════════════ */
  console.log(
    '%c🏭 Suppliers View v3 loaded · Dual balances + Custom Karat',
    'color:#6b3fa0;font-weight:800;font-size:12px;padding:1px 5px;' +
    'background:#f0e9fa;border-radius:4px;'
  );

  console.log(
    `%c💰 8 transaction types · Dual ledger · Statement with chart · Custom karat support`,
    'color:#6b7a95;font-weight:700;font-size:11px;'
  );

  console.log(
    `%c🆕 v3: Custom Karat in transactions · Purity Ratio · 6 presets · Statement shows custom karat`,
    'color:#a55a00;font-weight:900;font-size:11px;'
  );

  /* ═════════════════════════════════════════════════════════════════════
     ✅ js/15-views-suppliers.js — نهاية الملف
     ═════════════════════════════════════════════════════════════════════ */

})();
