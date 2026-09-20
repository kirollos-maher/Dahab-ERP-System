/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ENTERPRISE — js/14-views-inventory.js
   صفحة المخزون الشاملة:
     - جدول أصناف مع pagination
     - بحث فوري (IndexedDB)
     - فلاتر (عيار، حالة، فرع، ماركة، تصنيف)
     - إدارة أعمدة
     - تحديد متعدد (Bulk actions)
     - CRUD كامل (إضافة/تعديل/حذف)
     - تصدير/استيراد Excel
     - طباعة تاجات QR
     - عرض تفاصيل الصنف
     - ✅ Filter interactions محمية من Rerender الفجائي
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const GMS = window.GMS = window.GMS || {};

  /* ═════════════════════════════════════════════════════════════════════
     §1 · INVENTORY STATE
     ═════════════════════════════════════════════════════════════════════ */
  const InvState = {
    /* البيانات */
    items: [],
    filtered: [],

    /* Pagination */
    page: 1,
    pageSize: 50,
    totalPages: 1,

    /* Filters */
    filters: {
      search: '',
      karat: '',
      status: 'IN_STOCK',
      branch: '',
      manufacturer: '',
      category: '',
    },

    /* Selection */
    selected: new Set(),

    /* Sorting */
    sortBy: 'created_at',
    sortDir: 'desc',

    /* Column visibility */
    columns: {
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

    /* Stats */
    stats: {
      total: 0,
      inStock: 0,
      sold: 0,
      reserved: 0,
      totalPure: 0,
      totalValue: 0,
    },

    /* Loading */
    loading: false,
    lastRenderAt: null,

    /* المستمعون */
    unsubscribers: [],

    /* مؤقتات */
    timers: {
      search: null,
    },
  };

  /* تعريفات الأعمدة */
  const COLUMNS = [
    { key: 'sku', label: 'كود التاج', width: 155, sortable: true, align: 'start' },
    { key: 'category', label: 'التصنيف', width: 100, sortable: true, align: 'start' },
    { key: 'karat', label: 'العيار', width: 75, sortable: true, align: 'center' },
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

  /**
   * تدمير مستمعي الفلاتر السابقين
   */
  function cleanupListeners() {
    InvState.unsubscribers.forEach(fn => {
      try { fn(); } catch (_) {}
    });
    InvState.unsubscribers = [];

    clearTimeout(InvState.timers.search);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §3 · DATA LOADING
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * تحميل كل الأصناف
   * @returns {Promise<Array>}
   */
  async function loadInventory() {
    try {
      InvState.loading = true;

      /* 1 · IndexedDB */
      if (GMS.IDB && GMS.IDB.isOpen) {
        try {
          const items = await GMS.IDB.getAll();
          if (items.length) {
            InvState.items = items;
            return items;
          }
        } catch (e) {
          console.warn('[Inventory] IDB read failed:', e);
        }
      }

      /* 2 · Demo fallback */
      if (GMS.Demo) {
        InvState.items = GMS.Demo.getInventory();
        return InvState.items;
      }

      InvState.items = [];
      return [];

    } finally {
      InvState.loading = false;
    }
  }

  /**
   * تطبيق الفلاتر والفرز
   */
  function applyFilters() {
    const f = InvState.filters;
    let rows = InvState.items.slice();

    /* Search */
    if (f.search) {
      const q = f.search.toLowerCase().trim();
      rows = rows.filter(i =>
        (i.sku || '').toLowerCase().includes(q) ||
        (i.manufacturer_name || '').toLowerCase().includes(q) ||
        (i.manufacturer_code || '').toLowerCase().includes(q) ||
        (i.category || '').toLowerCase().includes(q)
      );
    }

    /* Karat */
    if (f.karat) {
      rows = rows.filter(i => Number(i.karat) === Number(f.karat));
    }

    /* Status */
    if (f.status) {
      rows = rows.filter(i => i.status === f.status);
    }

    /* Branch */
    if (f.branch) {
      rows = rows.filter(i => i.branch_id === f.branch);
    }

    /* Manufacturer */
    if (f.manufacturer) {
      rows = rows.filter(i =>
        (i.manufacturer_code || '').toUpperCase() === f.manufacturer.toUpperCase()
      );
    }

    /* Category */
    if (f.category) {
      rows = rows.filter(i => i.category === f.category);
    }

    /* Sort */
    const dir = InvState.sortDir === 'desc' ? -1 : 1;
    const key = InvState.sortBy;

    rows.sort((a, b) => {
      let av = a[key];
      let bv = b[key];

      if (av === undefined || av === null) av = '';
      if (bv === undefined || bv === null) bv = '';

      /* أرقام */
      if (typeof av === 'number' && typeof bv === 'number') {
        return (av - bv) * dir;
      }

      /* نصوص */
      return String(av).localeCompare(String(bv), 'ar') * dir;
    });

    InvState.filtered = rows;
    InvState.totalPages = Math.max(1, Math.ceil(rows.length / InvState.pageSize));

    /* ضمان أن الصفحة صحيحة */
    if (InvState.page > InvState.totalPages) {
      InvState.page = InvState.totalPages;
    }

    updateStats();
    return rows;
  }

  /**
   * تحديث الإحصائيات
   */
  function updateStats() {
    const all = InvState.items;
    const filtered = InvState.filtered;

    let totalPure = 0;
    let totalValue = 0;

    filtered.forEach(i => {
      totalPure += Number(i.pure_weight || 0);
      totalValue += Number(i.total_cost || 0);
    });

    InvState.stats = {
      total: all.length,
      filtered: filtered.length,
      inStock: all.filter(i => i.status === 'IN_STOCK').length,
      sold: all.filter(i => i.status === 'SOLD').length,
      reserved: all.filter(i => i.status === 'RESERVED').length,
      totalPure: GMS.round(totalPure, 4),
      totalValue: GMS.round(totalValue, 2),
    };
  }

  /**
   * قراءة الصفحة الحالية
   * @returns {Array}
   */
  function getPageItems() {
    const start = (InvState.page - 1) * InvState.pageSize;
    const end = start + InvState.pageSize;
    return InvState.filtered.slice(start, end);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §4 · HTML RENDERERS
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * بطاقة KPI
   */
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

  /**
   * رأس العمود
   * @param {Object} col
   * @returns {string}
   */
  function renderHeader(col) {
    if (!InvState.columns[col.key]) return '';

    const isSorted = InvState.sortBy === col.key;
    const sortIcon = !col.sortable
      ? ''
      : isSorted
        ? (InvState.sortDir === 'asc' ? 'arrow-up' : 'arrow-down')
        : 'arrow-up-down';

    const alignClass = col.align === 'end'
      ? 'col-num'
      : col.align === 'center'
        ? 'col-c'
        : '';

    return `
      <th class="${col.sortable ? 'sortable' : ''} ${isSorted ? 'sorted' : ''} ${alignClass}"
          ${col.sortable ? `data-sort="${col.key}"` : ''}
          style="width:${col.width}px;cursor:${col.sortable ? 'pointer' : 'default'}">
        <div style="display:flex;align-items:center;gap:5px;
                    justify-content:${col.align === 'end' ? 'flex-end' : col.align === 'center' ? 'center' : 'flex-start'}">
          <span>${GMS.esc(col.label)}</span>
          ${col.sortable ? `
            <i data-lucide="${sortIcon}"
               style="width:11px;height:11px;opacity:${isSorted ? '1' : '0.35'};
                      color:${isSorted ? 'var(--primary)' : 'currentColor'}"></i>
          ` : ''}
        </div>
      </th>
    `;
  }

  /**
   * صف صنف
   * @param {Object} item
   * @param {number} idx
   * @param {number} globalIdx
   * @returns {string}
   */
  function renderRow(item, idx, globalIdx) {
    const isSelected = InvState.selected.has(item.sku);
    const status = GMS.getStatus(item.status);

    const branchName = item.branch_name
      || (GMS.Demo?.getBranches()?.find(b => b.id === item.branch_id)?.name || '—');

    const cells = [];

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
      cells.push(`
        <td class="col-c">
          <span class="karat-badge" data-k="${item.karat}">${item.karat}K</span>
        </td>
      `);
    }

    if (InvState.columns.weight_grams) {
      cells.push(`<td class="col-num">${GMS.gramFmt(item.weight_grams)}</td>`);
    }

    if (InvState.columns.net_weight) {
      cells.push(`<td class="col-num"><b>${GMS.gramFmt(item.net_weight)}</b></td>`);
    }

    if (InvState.columns.pure_weight) {
      cells.push(`
        <td class="col-num" style="color:var(--primary);font-weight:900">
          ${GMS.gramFmt(item.pure_weight)}
        </td>
      `);
    }

    if (InvState.columns.workmanship_per_gram) {
      cells.push(`<td class="col-num">${GMS.moneyFmt(item.workmanship_per_gram)}</td>`);
    }

    if (InvState.columns.total_cost) {
      cells.push(`<td class="col-num" style="font-weight:900">${GMS.moneyFmt(item.total_cost)}</td>`);
    }

    if (InvState.columns.branch) {
      cells.push(`<td style="font-size:11px;color:var(--muted)">${GMS.esc(branchName)}</td>`);
    }

    if (InvState.columns.manufacturer) {
      cells.push(`
        <td>
          <span style="font-weight:800;font-size:11.5px">
            ${GMS.esc(item.manufacturer_code || '—')}
          </span>
        </td>
      `);
    }

    if (InvState.columns.status) {
      cells.push(`
        <td class="col-c">
          <span class="pill ${status.cls}">
            <i data-lucide="${status.icon}"></i>
            ${status.label}
          </span>
        </td>
      `);
    }

    if (InvState.columns.created_at) {
      cells.push(`
        <td style="font-size:10.5px;color:var(--muted)">
          ${GMS.dateAr(item.created_at)}
        </td>
      `);
    }

    return `
      <tr data-row-sku="${GMS.esc(item.sku)}"
          class="${isSelected ? 'selected' : ''}">
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

  /**
   * بناء جدول كامل
   */
  function renderTable() {
    const cols = COLUMNS.filter(c => InvState.columns[c.key]);
    const pageItems = getPageItems();
    const startIdx = (InvState.page - 1) * InvState.pageSize;

    if (!pageItems.length) {
      return `
        <div class="empty" style="padding:60px 20px">
          <i data-lucide="package-x"></i>
          <p>لا توجد أصناف مطابقة</p>
          <span>جرّب تعديل الفلاتر أو مسحها</span>
        </div>
      `;
    }

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
                <b class="mono">${GMS.intFmt(pageItems.length)}</b>
                صنف
              </td>
              <td class="col-num">
                <span class="mono" style="color:var(--primary)">
                  ${GMS.moneyFmt(pageItems.reduce((s, i) => s + Number(i.total_cost || 0), 0))} ج.م
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
  }

  /**
   * شريط الترقيم
   */
  function renderPagination() {
    const { page, totalPages, pageSize, filtered } = InvState;

    if (totalPages <= 1) return '';

    const startIdx = (page - 1) * pageSize + 1;
    const endIdx = Math.min(page * pageSize, filtered.length);

    /* أزرار الصفحات */
    const pageButtons = [];
    const window = 2;
    const from = Math.max(1, page - window);
    const to = Math.min(totalPages, page + window);

    const btn = (p, label, opts = {}) => `
      <button class="pg-btn ${opts.active ? 'active' : ''}"
              data-page="${p}"
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

        <div class="pg-controls">
          ${pageButtons.join('')}
        </div>
      </div>
    `;
  }

  /**
   * شريط الفلاتر النشطة
   */
  function renderActiveFilters() {
    const f = InvState.filters;
    const chips = [];

    if (f.search) chips.push({ key: 'search', label: 'بحث', value: f.search });
    if (f.karat) chips.push({ key: 'karat', label: 'عيار', value: `${f.karat}K` });
    if (f.status) {
      chips.push({ key: 'status', label: 'حالة', value: GMS.getStatus(f.status).label });
    }
    if (f.branch) {
      const b = GMS.Demo?.getBranches()?.find(x => x.id === f.branch);
      chips.push({ key: 'branch', label: 'فرع', value: b?.name || f.branch });
    }
    if (f.manufacturer) {
      chips.push({ key: 'manufacturer', label: 'ماركة', value: f.manufacturer });
    }
    if (f.category) {
      chips.push({ key: 'category', label: 'تصنيف', value: f.category });
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

  /**
   * شريط التحديد المتعدد
   */
  function renderBulkBar() {
    if (InvState.selected.size === 0) return '';

    return `
      <div style="display:flex;align-items:center;gap:12px;
                  padding:11px 20px;
                  background:var(--gold-soft);
                  border-bottom:1px solid var(--primary);
                  flex-wrap:wrap">
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
     §5 · MAIN RENDER
     ═════════════════════════════════════════════════════════════════════ */

  function render(root) {
    const branches = GMS.Demo?.getBranches() || [];
    const manufacturers = GMS.Demo?.getManufacturers() || [];
    const categories = GMS.CATEGORIES;

    root.innerHTML = `
      <div class="page-header">
        <h2>
          <i data-lucide="gem"></i>
          ${GMS.t('inv.title')}
        </h2>
        <p>${GMS.t('inv.subtitle')}</p>
      </div>

      <!-- KPIs -->
      <div class="kpi-row cols-4">
        ${renderKPI('gold', 'package', 'إجمالي الأصناف',
            GMS.intFmt(InvState.items.length), '',
            `<b>${GMS.intFmt(InvState.stats.inStock)}</b> متوفر · <b>${GMS.intFmt(InvState.stats.sold)}</b> مباع`)}

        ${renderKPI('info', 'filter', 'النتائج المُفلترة',
            GMS.intFmt(InvState.filtered.length), '',
            `من إجمالي <b>${GMS.intFmt(InvState.items.length)}</b> صنف`)}

        ${renderKPI('success', 'scale', 'إجمالي البندق المُفلتر',
            GMS.gramFmt(InvState.stats.totalPure), 'جم',
            `القيمة: <b>${GMS.moneyFmt(InvState.stats.totalValue)}</b> ج.م`)}

        ${renderKPI('violet', 'trending-up', 'متوسط القيمة',
            InvState.filtered.length
              ? GMS.moneyFmt(InvState.stats.totalValue / InvState.filtered.length)
              : '0.00',
            'ج.م',
            `على <b>${GMS.intFmt(InvState.filtered.length)}</b> صنف`)}
      </div>

      <!-- Toolbar -->
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

          <select class="filter-select" id="inv-filter-karat" style="min-width:120px">
            <option value="">كل العيارات</option>
            ${GMS.KARAT_ORDER.map(k => `
              <option value="${k}" ${InvState.filters.karat == k ? 'selected' : ''}>${k}K</option>
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

        <div data-active-filters-host>
          ${renderActiveFilters()}
        </div>
      </div>

      <!-- Bulk Bar -->
      <div id="inv-bulk-host"></div>

      <!-- Table -->
      <div class="card">
        <div id="inv-table-host">
          ${renderTable()}
        </div>
        <div id="inv-pagination-host">
          ${renderPagination()}
        </div>
      </div>
    `;

    window.lucide?.createIcons();
    bindControls();
    refreshBulkBar();
  }

  /**
   * ✅ تحديث قسم "الفلاتر النشطة" (chips) دون إعادة بناء الصفحة كاملة
   */
  function updateActiveFiltersHost() {
    const host = document.querySelector('[data-active-filters-host]');
    if (!host) return;

    host.innerHTML = renderActiveFilters();
    window.lucide?.createIcons();

    /* أعد ربط أزرار مسح الفلاتر الجديدة */
    host.querySelectorAll('[data-clear-filter]').forEach(btn => {
      btn.onclick = () => {
        const key = btn.dataset.clearFilter;
        InvState.filters[key] = '';
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
          search: '',
          karat: '',
          status: '',
          branch: '',
          manufacturer: '',
          category: '',
        };
        InvState.page = 1;
        applyFilters();
        syncFilterSelects();
        refreshTable();
        updateActiveFiltersHost();
      };
    }

    /* تحديث زر مسح البحث إن وُجد */
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

  /**
   * ✅ مزامنة قيم الـ select مع InvState.filters
   * (بديل خفيف عن إعادة بناء الصفحة)
   */
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

  /**
   * تحديث الجدول بدون إعادة تصيير كامل
   */
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

    /* تحديث KPIs */
    const kpiHost = document.querySelector('.kpi-row');
    if (kpiHost) {
      /* نحدّث القيم فقط */
      const kpis = kpiHost.querySelectorAll('.kpi .kpi-value');
      if (kpis[1]) {
        kpis[1].innerHTML = `${GMS.intFmt(InvState.filtered.length)}`;
      }
      if (kpis[2]) {
        kpis[2].innerHTML = `${GMS.gramFmt(InvState.stats.totalPure)} <small>جم</small>`;
      }
      if (kpis[3]) {
        const avg = InvState.filtered.length
          ? InvState.stats.totalValue / InvState.filtered.length
          : 0;
        kpis[3].innerHTML = `${GMS.moneyFmt(avg)} <small>ج.م</small>`;
      }
    }
  }

  function refreshBulkBar() {
    const host = document.getElementById('inv-bulk-host');
    if (!host) return;

    host.innerHTML = renderBulkBar();
    window.lucide?.createIcons();

    /* ربط أزرار Bulk */
    host.querySelectorAll('[data-bulk-action]').forEach(btn => {
      btn.onclick = () => handleBulkAction(btn.dataset.bulkAction);
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §6 · CONTROLS BINDING
     ═════════════════════════════════════════════════════════════════════ */

  function bindControls() {
    /* ─── Search ─────────────────────────────────────────────── */
    const searchInput = document.getElementById('inv-search-input');
    if (searchInput) {
      searchInput.value = InvState.filters.search;

      searchInput.oninput = (e) => {
        clearTimeout(InvState.timers.search);
        InvState.timers.search = setTimeout(() => {
          InvState.filters.search = e.target.value.trim();
          InvState.page = 1;
          applyFilters();
          refreshTable();
        }, 250);
      };
    }

    /* ─── Clear search ──────────────────────────────────────── */
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

    /* ─── Filters ───────────────────────────────────────────── */
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

      el.onchange = () => {
        InvState.filters[key] = el.value;
        InvState.page = 1;
        applyFilters();
        /* ✅ إصلاح: بدلاً من render() الكامل — نُحدّث فقط الجدول والفلاتر النشطة */
        refreshTable();
        updateActiveFiltersHost();
      };
    });

    /* ─── Clear individual filter (initial bindings) ──────── */
    document.querySelectorAll('[data-clear-filter]').forEach(btn => {
      btn.onclick = () => {
        const key = btn.dataset.clearFilter;
        InvState.filters[key] = '';
        InvState.page = 1;
        applyFilters();
        /* ✅ إصلاح: نفس المبدأ */
        syncFilterSelects();
        refreshTable();
        updateActiveFiltersHost();
      };
    });

    /* ─── Clear all filters ─────────────────────────────────── */
    const clearAllBtn = document.getElementById('inv-clear-all-filters');
    if (clearAllBtn) {
      clearAllBtn.onclick = () => {
        InvState.filters = {
          search: '',
          karat: '',
          status: '',
          branch: '',
          manufacturer: '',
          category: '',
        };
        InvState.page = 1;
        applyFilters();
        /* ✅ إصلاح: نُحدّث الجدول + الفلاتر النشطة + نُعيد تصيير الـ select values */
        syncFilterSelects();
        refreshTable();
        updateActiveFiltersHost();
      };
    }

    /* ─── Bulk bar ──────────────────────────────────────────── */
    refreshBulkBar();

    /* ─── Actions buttons ───────────────────────────────────── */
    const addBtn = document.getElementById('inv-add-btn');
    if (addBtn) addBtn.onclick = () => openItemModal();

    const importBtn = document.getElementById('inv-import-btn');
    if (importBtn) {
      importBtn.onclick = () => {
        GMS.Excel?.Importer?.openFilePicker();
      };
    }

    const exportBtn = document.getElementById('inv-export-btn');
    if (exportBtn) {
      exportBtn.onclick = () => exportFiltered();
    }

    const colsBtn = document.getElementById('inv-cols-btn');
    if (colsBtn) colsBtn.onclick = (e) => openColumnsMenu(e.currentTarget);

    /* ─── Table + Pagination events ─────────────────────────── */
    bindTableEvents();
    bindPaginationEvents();

    /* ─── Global ESC to clear search ───────────────────────── */
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
    /* Row action buttons */
    document.querySelectorAll('[data-action][data-sku]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const sku = btn.dataset.sku;

        handleRowAction(action, sku);
      };
    });

    /* Row checkboxes */
    document.querySelectorAll('.inv-check').forEach(cb => {
      cb.onclick = (e) => {
        e.stopPropagation();
        const sku = cb.dataset.sku;

        if (cb.checked) {
          InvState.selected.add(sku);
        } else {
          InvState.selected.delete(sku);
        }

        /* تحديث الصف */
        const row = cb.closest('tr');
        if (row) row.classList.toggle('selected', cb.checked);

        refreshBulkBar();
      };
    });

    /* Select all on page */
    const selectPageCb = document.getElementById('inv-select-page');
    if (selectPageCb) {
      selectPageCb.onclick = () => {
        const pageItems = getPageItems();
        const allSelected = pageItems.every(i => InvState.selected.has(i.sku));

        if (allSelected) {
          /* إزالة الكل */
          pageItems.forEach(i => InvState.selected.delete(i.sku));
        } else {
          /* إضافة الكل */
          pageItems.forEach(i => InvState.selected.add(i.sku));
        }

        /* إعادة تصيير الجدول */
        refreshTable();
        refreshBulkBar();
      };
    }

    /* Sort headers */
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

    /* Row click → view */
    document.querySelectorAll('tr[data-row-sku]').forEach(tr => {
      tr.onclick = (e) => {
        /* تجاهل النقر على الأزرار */
        if (e.target.closest('button') || e.target.closest('input')) return;

        handleRowAction('view', tr.dataset.rowSku);
      };
    });
  }

  function bindPaginationEvents() {
    /* Page buttons */
    document.querySelectorAll('.pg-btn[data-page]').forEach(btn => {
      btn.onclick = () => {
        const page = Number(btn.dataset.page);
        if (page < 1 || page > InvState.totalPages) return;

        InvState.page = page;
        refreshTable();

        /* Scroll للأعلى */
        document.getElementById('inv-table-host')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      };
    });

    /* Page size */
    const sizeSelect = document.getElementById('inv-page-size');
    if (sizeSelect) {
      sizeSelect.onchange = () => {
        InvState.pageSize = Number(sizeSelect.value);
        InvState.page = 1;
        applyFilters();
        refreshTable();
      };
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §7 · ROW ACTIONS
     ═════════════════════════════════════════════════════════════════════ */

  async function handleRowAction(action, sku) {
    const item = InvState.items.find(i => i.sku === sku);
    if (!item) return;

    switch (action) {
      case 'view':
        showItemDetails(item);
        break;

      case 'edit':
        openItemModal(item);
        break;

      case 'tag':
        await printTag(item);
        break;

      case 'delete':
        await deleteItem(item);
        break;
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §8 · ITEM DETAILS MODAL
     ═════════════════════════════════════════════════════════════════════ */

  function showItemDetails(item) {
    const price24 = GMS.Cache?.getPrice()?.price_24 || GMS.APP_CONFIG.DEFAULT_PRICE_24;
    const status = GMS.getStatus(item.status);

    const branchName = item.branch_name
      || (GMS.Demo?.getBranches()?.find(b => b.id === item.branch_id)?.name || '—');

    GMS.Modal.open({
      title: `تفاصيل الصنف — ${item.sku}`,
      icon: 'gem',
      size: 'lg',
      body: `
        <div style="display:grid;grid-template-columns:repeat(3,1fr);
                    gap:12px;margin-bottom:18px">
          <div style="padding:12px 14px;background:var(--surface-2);
                      border-radius:11px;border:1px solid var(--border)">
            <div style="font-size:10.5px;color:var(--muted);font-weight:800;
                        text-transform:uppercase">العيار</div>
            <div style="margin-top:4px">
              <span class="karat-badge" data-k="${item.karat}"
                    style="font-size:14px;padding:4px 10px">
                ${item.karat}K
              </span>
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
            <span class="k"><i data-lucide="sparkles"></i> البندق 24K</span>
            <span class="v">${GMS.gramFmt(item.pure_weight)} جم</span>
          </div>
        </div>

        <div class="calc-list">
          <div class="cl-row">
            <span class="k"><i data-lucide="hammer"></i> مصنعية / جرام</span>
            <span class="v">${GMS.moneyFmt(item.workmanship_per_gram)} ج.م</span>
          </div>
          <div class="cl-row">
            <span class="k"><i data-lucide="coins"></i> قيمة المصنعية</span>
            <span class="v">${GMS.moneyFmt(item.workmanship_value)} ج.م</span>
          </div>
          <div class="cl-row">
            <span class="k"><i data-lucide="trending-up"></i> سعر 24K الحالي</span>
            <span class="v">${GMS.moneyFmt(price24)} ج.م</span>
          </div>
          <div class="cl-row">
            <span class="k"><i data-lucide="coins"></i> قيمة الذهب</span>
            <span class="v">${GMS.moneyFmt(Number(item.pure_weight) * price24)} ج.م</span>
          </div>
          <div class="cl-row hi">
            <span class="k"><i data-lucide="banknote"></i> الإجمالي</span>
            <span class="v">${GMS.moneyFmt(item.total_cost)} ج.م</span>
          </div>
        </div>

        <div class="calc-list" style="margin-top:16px">
          <div class="cl-row">
            <span class="k"><i data-lucide="calendar"></i> تاريخ الإضافة</span>
            <span class="v" style="font-size:12px">${GMS.dateTimeAr(item.created_at)}</span>
          </div>
          ${item.updated_at ? `
            <div class="cl-row">
              <span class="k"><i data-lucide="refresh-cw"></i> آخر تحديث</span>
              <span class="v" style="font-size:12px">${GMS.dateTimeAr(item.updated_at)}</span>
            </div>
          ` : ''}
        </div>

        ${item.notes ? `
          <div style="margin-top:14px;padding:12px 14px;border-radius:10px;
                      background:var(--info-bg);
                      border:1px solid color-mix(in srgb,var(--info) 30%,transparent)">
            <div style="font-size:10.5px;font-weight:800;color:var(--info);
                        text-transform:uppercase;margin-bottom:5px">ملاحظات</div>
            <div style="font-size:12.5px;color:var(--text-2);font-weight:600">
              ${GMS.esc(item.notes)}
            </div>
          </div>
        ` : ''}
      `,
      footer: `
        <button class="btn" data-close>إغلاق</button>
        <button class="btn" data-edit>
          <i data-lucide="pencil"></i> تعديل
        </button>
        <button class="btn btn-primary" data-print-tag>
          <i data-lucide="qr-code"></i> طباعة تاج
        </button>
      `,
      onMount: (el, close) => {
        el.querySelector('[data-edit]').onclick = () => {
          close();
          openItemModal(item);
        };

        el.querySelector('[data-print-tag]').onclick = async () => {
          close();
          await printTag(item);
        };
      },
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §9 · ITEM MODAL (ADD / EDIT)
     ═════════════════════════════════════════════════════════════════════ */

  function openItemModal(item = null) {
    const isEdit = Boolean(item);
    const item_ = item || {};

    const manufacturers = GMS.Demo?.getManufacturers() || [];
    const branches = GMS.Demo?.getBranches() || [];
    const categories = GMS.CATEGORIES;

    GMS.Modal.open({
      title: isEdit ? `تعديل الصنف — ${item_.sku}` : 'إضافة صنف جديد',
      icon: isEdit ? 'pencil' : 'plus-circle',
      size: 'lg',
      body: `
        <div class="grid-form three">
          <div class="field">
            <label>كود التاج <span class="req">*</span></label>
            <div style="display:flex;gap:8px">
              <input id="f-sku" value="${GMS.esc(item_.sku || '')}"
                     class="mono" dir="ltr"
                     ${isEdit ? 'readonly' : ''}
                     style="font-weight:800">
              ${isEdit ? '' : `
                <button type="button" class="btn btn-sm" id="f-gen-sku"
                        style="flex-shrink:0">
                  <i data-lucide="refresh-cw"></i>
                </button>
              `}
            </div>
          </div>

          <div class="field">
            <label>الماركة <span class="req">*</span></label>
            <select id="f-manufacturer">
              ${manufacturers.map(m => `
                <option value="${m.code}" data-rate="${m.rate}"
                        ${item_.manufacturer_code === m.code ? 'selected' : ''}>
                  ${GMS.esc(m.code)} — ${GMS.esc(m.name)}
                </option>
              `).join('')}
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

          <div class="field">
            <label>العيار <span class="req">*</span></label>
            <select id="f-karat">
              ${GMS.KARAT_ORDER.map(k => `
                <option value="${k}" ${Number(item_.karat) === k ? 'selected' : ''}>
                  ${k}K — نقاء ${GMS.karatRatio(k).toFixed(4)}
                </option>
              `).join('')}
            </select>
          </div>

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

        <div class="divider"></div>

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
                   value="${item_.stone_weight || 0}" class="mono">
          </div>

          <div class="field">
            <label>المصنعية / جرام</label>
            <input type="number" id="f-workmanship" step="0.01" min="0"
                   value="${item_.workmanship_per_gram || 0}" class="mono">
          </div>
        </div>

        <div class="grid-form three" style="margin-top:13px">
          <div class="field">
            <label>الوزن الصافي (جم)</label>
            <input id="f-net" readonly class="mono"
                   value="${item_.net_weight || ''}"
                   style="text-align:center;background:var(--surface-3)">
          </div>

          <div class="field">
            <label>البندق 24K (جم)</label>
            <input id="f-pure" readonly class="mono"
                   value="${item_.pure_weight || ''}"
                   style="text-align:center;color:var(--primary);
                          font-weight:900;background:var(--surface-3)">
          </div>

          <div class="field">
            <label>الإجمالي (ج.م)</label>
            <input id="f-total" readonly class="mono"
                   value="${item_.total_cost || ''}"
                   style="text-align:center;font-weight:800;background:var(--surface-3)">
          </div>
        </div>

        <div class="field" style="margin-top:13px">
          <label>ملاحظات</label>
          <input id="f-notes" value="${GMS.esc(item_.notes || '')}"
                 placeholder="ملاحظات على الصنف…">
        </div>

        <div id="f-preview" style="margin-top:14px"></div>
      `,
      footer: `
        <button class="btn" data-close>إلغاء</button>
        <button class="btn btn-primary" id="f-save">
          <i data-lucide="save"></i> ${isEdit ? 'حفظ التعديلات' : 'إنشاء الصنف'}
        </button>
      `,
      onMount: (el, close) => {
        const $f = (id) => el.querySelector('#' + id);

        /* ─── Recalculate ──────────────────────────────────── */
        const recalc = () => {
          const karat = Number($f('f-karat').value);
          const gross = parseFloat($f('f-weight').value) || 0;
          const stone = parseFloat($f('f-stone').value) || 0;
          const rate = parseFloat($f('f-workmanship').value) || 0;
          const price24 = GMS.Cache?.getPrice()?.price_24 || GMS.APP_CONFIG.DEFAULT_PRICE_24;

          const net = GMS.round(Math.max(0, gross - stone), 3);
          const pure = GMS.round(net * GMS.karatRatio(karat), 4);
          const goldValue = GMS.round(pure * price24, 2);
          const makeValue = GMS.round(net * rate, 2);
          const total = GMS.round(goldValue + makeValue, 2);

          $f('f-net').value = net.toFixed(3);
          $f('f-pure').value = pure.toFixed(3);
          $f('f-total').value = GMS.moneyFmt(total);

          /* Preview */
          const preview = $f('f-preview');
          if (preview) {
            preview.innerHTML = `
              <div style="display:grid;grid-template-columns:repeat(4,1fr);
                          gap:10px;padding:12px;
                          background:var(--surface-2);border-radius:10px;
                          border:1px solid var(--border)">
                <div>
                  <div style="font-size:10px;color:var(--muted);font-weight:800">
                    قيمة الذهب
                  </div>
                  <div class="mono" style="font-size:14px;font-weight:900;
                              margin-top:2px">
                    ${GMS.moneyFmt(goldValue)}
                  </div>
                </div>
                <div>
                  <div style="font-size:10px;color:var(--muted);font-weight:800">
                    قيمة المصنعية
                  </div>
                  <div class="mono" style="font-size:14px;font-weight:900;
                              margin-top:2px">
                    ${GMS.moneyFmt(makeValue)}
                  </div>
                </div>
                <div>
                  <div style="font-size:10px;color:var(--muted);font-weight:800">
                    البندق
                  </div>
                  <div class="mono" style="font-size:14px;font-weight:900;
                              margin-top:2px;color:var(--primary)">
                    ${pure.toFixed(3)} جم
                  </div>
                </div>
                <div>
                  <div style="font-size:10px;color:var(--muted);font-weight:800">
                    الإجمالي
                  </div>
                  <div class="mono" style="font-size:14px;font-weight:900;
                              margin-top:2px;color:var(--primary)">
                    ${GMS.moneyFmt(total)}
                  </div>
                </div>
              </div>
            `;
          }
        };

        /* ─── Auto-rate from manufacturer ──────────────────── */
        const manuSelect = $f('f-manufacturer');
        const applyRate = () => {
          const opt = manuSelect.selectedOptions[0];
          const rate = opt?.dataset.rate;
          if (rate && !isEdit) {
            $f('f-workmanship').value = rate;
            recalc();
          }
        };

        manuSelect.onchange = applyRate;

        /* ─── Field events ─────────────────────────────────── */
        ['f-karat', 'f-weight', 'f-stone', 'f-workmanship'].forEach(id => {
          const field = $f(id);
          if (field) {
            field.oninput = recalc;
            field.onchange = recalc;
          }
        });

        /* ─── Generate SKU ─────────────────────────────────── */
        const genBtn = $f('f-gen-sku');
        if (genBtn) {
          genBtn.onclick = () => {
            const karat = Number($f('f-karat').value);
            const manu = $f('f-manufacturer').value;
            const sku = GMS.generateSKU({
              manufacturerCode: manu,
              karat,
              seq: Math.floor(Math.random() * 10000),
            });
            $f('f-sku').value = sku;
          };
        }

        /* ─── Save ─────────────────────────────────────────── */
        $f('f-save').onclick = async () => {
          const sku = $f('f-sku').value.trim().toUpperCase();
          const karat = Number($f('f-karat').value);
          const gross = parseFloat($f('f-weight').value) || 0;

          if (!sku) {
            GMS.Toast.err('كود SKU مطلوب');
            return;
          }

          if (gross <= 0) {
            GMS.Toast.err('الوزن مطلوب');
            return;
          }

          const stone = parseFloat($f('f-stone').value) || 0;
          const net = GMS.round(Math.max(0, gross - stone), 3);
          const pure = GMS.round(net * GMS.karatRatio(karat), 4);
          const rate = parseFloat($f('f-workmanship').value) || 0;
          const price24 = GMS.Cache?.getPrice()?.price_24 || GMS.APP_CONFIG.DEFAULT_PRICE_24;
          const goldValue = GMS.round(pure * price24, 2);
          const makeValue = GMS.round(net * rate, 2);
          const total = GMS.round(goldValue + makeValue, 2);

          const manuCode = $f('f-manufacturer').value;
          const manu = manufacturers.find(m => m.code === manuCode);

          const payload = {
            sku,
            category: $f('f-category').value,
            karat,
            purity_ratio: GMS.karatRatio(karat),
            weight_grams: gross,
            stone_weight: stone,
            net_weight: net,
            pure_weight: pure,
            workmanship_per_gram: rate,
            workmanship_value: makeValue,
            gold_value: goldValue,
            total_cost: total,
            price_24: price24,
            status: $f('f-status').value,
            branch_id: $f('f-branch').value,
            manufacturer_code: manuCode,
            manufacturer_name: manu?.name || null,
            notes: $f('f-notes').value.trim() || null,
            updated_at: new Date().toISOString(),
          };

          if (!isEdit) {
            payload.id = 'inv-' + GMS.uid();
            payload.created_at = new Date().toISOString();
          }

          try {
            /* 1 · IndexedDB */
            if (GMS.IDB) {
              const full = {
                id: item_?.id || payload.id,
                ...payload,
              };
              await GMS.IDB.put(full);
            }

            /* 2 · Supabase (إذا متصل) */
            if (GMS.Supabase?.isReady()) {
              const client = GMS.Supabase.get();

              if (isEdit) {
                await client
                  .from(GMS.SUPABASE_CONFIG.TABLES.INVENTORY)
                  .update(payload)
                  .eq('sku', sku);
              } else {
                await client
                  .from(GMS.SUPABASE_CONFIG.TABLES.INVENTORY)
                  .insert(payload);
              }
            }

            /* 3 · تحديث المصفوفة المحلية */
            if (isEdit) {
              const idx = InvState.items.findIndex(i => i.sku === sku);
              if (idx >= 0) {
                InvState.items[idx] = { ...InvState.items[idx], ...payload };
              }
            } else {
              InvState.items.unshift({
                id: payload.id,
                ...payload,
              });
            }

            /* 4 · Audit */
            if (GMS.Audit) {
              await GMS.Audit.log(
                isEdit ? 'UPDATE' : 'CREATE',
                'inventory',
                payload.id,
                isEdit
                  ? `عدّل الصنف ${sku}`
                  : `أضاف صنف جديد: ${sku}`,
                { sku, karat, net, pure, total }
              );
            }

            /* 5 · إشعار */
            GMS.Toast.ok(
              isEdit ? 'تم حفظ التعديلات' : 'تمت إضافة الصنف',
              `${sku} · ${GMS.gramFmt(net)} جم صافي`
            );

            /* 6 · صوت */
            GMS.Beep?.success();

            /* 7 · إغلاق + إعادة تصيير */
            close();
            applyFilters();
            render(document.getElementById('page'));

          } catch (e) {
            console.error('[Inventory.save]', e);
            GMS.Toast.err('فشل الحفظ', e.message);
          }
        };

        /* ─── Recalc initial ───────────────────────────────── */
        setTimeout(recalc, 50);
        if (!isEdit) applyRate();
      },
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §10 · DELETE ITEM
     ═════════════════════════════════════════════════════════════════════ */

  async function deleteItem(item) {
    const ok = await GMS.Confirm.delete(
      `سيتم حذف الصنف "${item.sku}" نهائياً من قاعدة البيانات. لا يمكن التراجع.`
    );

    if (!ok) return;

    try {
      /* IndexedDB */
      if (GMS.IDB) {
        await GMS.IDB.delete(item.id);
      }

      /* Supabase */
      if (GMS.Supabase?.isReady()) {
        await GMS.Supabase.get()
          .from(GMS.SUPABASE_CONFIG.TABLES.INVENTORY)
          .delete()
          .eq('id', item.id);
      }

      /* المصفوفة */
      const idx = InvState.items.findIndex(i => i.sku === item.sku);
      if (idx >= 0) InvState.items.splice(idx, 1);

      InvState.selected.delete(item.sku);

      /* Audit */
      if (GMS.Audit) {
        await GMS.Audit.log('DELETE', 'inventory', item.id,
          `حذف الصنف ${item.sku}`);
      }

      GMS.Toast.ok('تم الحذف', item.sku);
      GMS.Beep?.delete();

      applyFilters();
      render(document.getElementById('page'));

    } catch (e) {
      console.error('[Inventory.delete]', e);
      GMS.Toast.err('فشل الحذف', e.message);
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §11 · BULK ACTIONS
     ═════════════════════════════════════════════════════════════════════ */

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

      case 'tag':
        await bulkPrintTags(items);
        break;

      case 'export':
        bulkExport(items);
        break;

      case 'delete':
        await bulkDelete(items);
        break;
    }
  }

  async function bulkPrintTags(items) {
    if (!GMS.QR?.Printer) {
      GMS.Toast.err('محرك الطباعة غير متاح');
      return;
    }

    try {
      GMS.Loading.show('جارٍ توليد التاجات…');
      await GMS.QR.Printer.print(items);
      GMS.Toast.ok(`تمت طباعة ${items.length} تاج`);
    } catch (e) {
      GMS.Toast.err('فشلت الطباعة', e.message);
    } finally {
      GMS.Loading.hide();
    }
  }

  function bulkExport(items) {
    if (!GMS.Excel?.Exporter) {
      GMS.Toast.err('محرك Excel غير متاح');
      return;
    }

    GMS.Excel.Exporter.inventory(items, {
      filters: InvState.filters,
    });
  }

  async function bulkDelete(items) {
    const ok = await GMS.Confirm.delete(
      `سيتم حذف ${items.length} صنف نهائياً. لا يمكن التراجع.`
    );

    if (!ok) return;

    GMS.Loading.show('جارٍ الحذف…');

    let deleted = 0;
    let failed = 0;

    try {
      for (const item of items) {
        try {
          if (GMS.IDB) {
            await GMS.IDB.delete(item.id);
          }

          if (GMS.Supabase?.isReady()) {
            await GMS.Supabase.get()
              .from(GMS.SUPABASE_CONFIG.TABLES.INVENTORY)
              .delete()
              .eq('id', item.id);
          }

          const idx = InvState.items.findIndex(i => i.sku === item.sku);
          if (idx >= 0) InvState.items.splice(idx, 1);

          deleted++;
        } catch (e) {
          console.warn('[Inventory] Bulk delete item failed:', item.sku, e);
          failed++;
        }
      }

      InvState.selected.clear();

      if (GMS.Audit) {
        await GMS.Audit.log('DELETE', 'inventory', null,
          `حذف جماعي: ${deleted} صنف`, { deleted, failed });
      }

      if (failed) {
        GMS.Toast.warn('اكتمل الحذف مع أخطاء',
          `${deleted} نجح · ${failed} فشل`);
      } else {
        GMS.Toast.ok('تم الحذف', `${deleted} صنف`);
      }

      applyFilters();
      render(document.getElementById('page'));

    } finally {
      GMS.Loading.hide();
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §12 · EXPORT
     ═════════════════════════════════════════════════════════════════════ */

  function exportFiltered() {
    if (!InvState.filtered.length) {
      GMS.Toast.warn('لا توجد بيانات للتصدير');
      return;
    }

    if (!GMS.Excel?.Exporter) {
      GMS.Toast.err('محرك Excel غير متاح');
      return;
    }

    GMS.Excel.Exporter.inventory(InvState.filtered, {
      filters: InvState.filters,
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §13 · PRINT TAG
     ═════════════════════════════════════════════════════════════════════ */

  async function printTag(item) {
    if (!GMS.QR?.Printer) {
      GMS.Toast.err('محرك الطباعة غير متاح');
      return;
    }

    try {
      await GMS.QR.Printer.printOne(item);
    } catch (e) {
      GMS.Toast.err('فشلت الطباعة', e.message);
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §14 · COLUMNS MANAGER
     ═════════════════════════════════════════════════════════════════════ */

  function openColumnsMenu(anchorEl) {
    /* إزالة أي menu موجود */
    document.querySelector('.col-mgr')?.remove();

    const el = document.createElement('div');
    el.className = 'col-mgr';
    el.style.cssText = `
      position:absolute;
      top:calc(100% + 6px);
      inset-inline-end:0;
      z-index:60;
      background:var(--surface);
      border:1px solid var(--border-strong);
      border-radius:12px;
      box-shadow:var(--shadow-2);
      min-width:220px;
      max-height:400px;
      overflow-y:auto;
      padding:9px;
    `;

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
                      font-weight:700;cursor:pointer;transition:background .15s"
               onmouseover="this.style.background='var(--surface-3)'"
               onmouseout="this.style.background='transparent'">
          <input type="checkbox" class="cb inv-col-toggle"
                 data-col="${c.key}"
                 ${InvState.columns[c.key] ? 'checked' : ''}>
          <span>${GMS.esc(c.label)}</span>
        </label>
      `).join('')}

      <div style="padding:10px 9px 3px;margin-top:5px;
                  border-top:1px solid var(--border)">
        <button class="btn btn-sm btn-block" id="inv-cols-reset">
          <i data-lucide="rotate-ccw"></i> إعادة ضبط
        </button>
      </div>
    `;

    const parent = anchorEl.parentElement;
    parent.style.position = 'relative';
    parent.appendChild(el);

    window.lucide?.createIcons();

    /* Bind toggles */
    el.querySelectorAll('.inv-col-toggle').forEach(cb => {
      cb.onchange = () => {
        const key = cb.dataset.col;

        /* ضمان عمودان مرئيان على الأقل */
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

    /* Reset */
    el.querySelector('#inv-cols-reset').onclick = () => {
      const defaults = {
        sku: true, category: true, karat: true, weight_grams: true,
        net_weight: true, pure_weight: true, workmanship_per_gram: true,
        total_cost: true, branch: true, manufacturer: true,
        status: true, created_at: false,
      };
      Object.assign(InvState.columns, defaults);
      el.remove();
      refreshTable();
    };

    /* إغلاق عند النقر خارجاً */
    const closeFn = (e) => {
      if (!el.contains(e.target) && !anchorEl.contains(e.target)) {
        el.remove();
        document.removeEventListener('mousedown', closeFn);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', closeFn), 0);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §15 · INITIALIZATION
     ═════════════════════════════════════════════════════════════════════ */

  async function init() {
    try {
      await loadInventory();
      applyFilters();
    } catch (e) {
      console.error('[Inventory.init]', e);
      GMS.Toast.err('فشل تحميل المخزون', e.message);
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §16 · CLEANUP
     ═════════════════════════════════════════════════════════════════════ */

  function cleanup() {
    cleanupListeners();
    InvState.selected.clear();
  }

  /* ═════════════════════════════════════════════════════════════════════
     §17 · VIEW REGISTRATION
     ═════════════════════════════════════════════════════════════════════ */
  GMS.Views = GMS.Views || {};

  GMS.Views.inventory = {
    render: async (root) => {
      await init();
      render(root);
    },
    cleanup,
    state: InvState,

    /* Data API */
    load: loadInventory,
    applyFilters,

    /* Actions */
    openItemModal,
    showItemDetails,
    deleteItem,
    printTag,
    export: exportFiltered,

    /* Bulk */
    bulkPrintTags,
    bulkExport,
    bulkDelete,

    /* Columns */
    columns: COLUMNS,
  };

  /* ═════════════════════════════════════════════════════════════════════
     §18 · LOADED CONFIRMATION
     ═════════════════════════════════════════════════════════════════════ */
  console.log(
    '%c📦 Inventory View loaded · Pagination + CRUD + Bulk',
    'color:#b8912f;font-weight:800;font-size:12px;padding:1px 5px;' +
    'background:#fdf3e3;border-radius:4px;'
  );

  console.log(
    `%c📊 12 columns · 6 filters · Bulk select · Sort · Excel · QR Tags`,
    'color:#6b7a95;font-weight:700;font-size:11px;'
  );

  console.log(
    `%c🛡️  Filter-aware: لا rerender عند تفاعل المستخدم مع الفلاتر`,
    'color:#0f7a43;font-weight:700;font-size:11px;'
  );

  /* ═════════════════════════════════════════════════════════════════════
     ✅ js/14-views-inventory.js — نهاية الملف
     ═════════════════════════════════════════════════════════════════════ */

})();
