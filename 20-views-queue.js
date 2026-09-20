/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ENTERPRISE — js/20-views-queue.js
   طابور المزامنة (Sync Queue):
     - عرض الفواتير المُعلَّقة (offline sales)
     - حالة كل عنصر (pending / uploading / failed)
     - إعادة المحاولة الفردية
     - مزامنة جماعية
     - تفريغ الطابور
     - تفاصيل الفاتورة
     - إحصائيات شاملة
     - Live updates
     - تصدير Excel
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const GMS = window.GMS = window.GMS || {};

  /* ═════════════════════════════════════════════════════════════════════
     §1 · QUEUE STATE
     ═════════════════════════════════════════════════════════════════════ */
  const QState = {
    /* البيانات */
    items: [],
    filtered: [],

    /* Pagination */
    page: 1,
    pageSize: 25,
    totalPages: 1,

    /* الفلاتر */
    filters: {
      search: '',
      status: '',
      dateFrom: '',
      dateTo: '',
    },

    /* Stats */
    stats: {
      total: 0,
      pending: 0,
      uploading: 0,
      failed: 0,
      totalValue: 0,
      totalPure: 0,
      totalItems: 0,
      oldestAt: null,
      newestAt: null,
    },

    /* Loading / Processing */
    loading: false,
    syncing: false,
    syncProgress: {
      current: 0,
      total: 0,
    },

    /* Live updates */
    unsubscribers: [],

    /* Timers */
    timers: {
      search: null,
      autoSync: null,
    },

    /* Settings */
    autoSyncEnabled: true,
    autoSyncIntervalMs: 30000,
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

  function cleanupListeners() {
    QState.unsubscribers.forEach(fn => {
      try { fn(); } catch (_) {}
    });
    QState.unsubscribers = [];

    clearTimeout(QState.timers.search);
    clearInterval(QState.timers.autoSync);
  }

  /**
   * هل الاتصال متاح؟
   */
  function isOnline() {
    return GMS.Sync?.state?.online !== false;
  }

  /**
   * قراءة حالة عنصر من الطابور
   */
  function getItemStatus(item) {
    const s = item.status || 'QUEUED';

    const map = {
      QUEUED: {
        key: 'QUEUED',
        label: 'مُعلَّق',
        cls: 'pill-amber',
        icon: 'clock',
        color: 'warn',
      },
      PENDING: {
        key: 'PENDING',
        label: 'قيد الانتظار',
        cls: 'pill-amber',
        icon: 'clock',
        color: 'warn',
      },
      UPLOADING: {
        key: 'UPLOADING',
        label: 'جارٍ الرفع',
        cls: 'pill-blue',
        icon: 'loader-circle',
        color: 'info',
      },
      SYNCED: {
        key: 'SYNCED',
        label: 'تمت المزامنة',
        cls: 'pill-green',
        icon: 'check-circle-2',
        color: 'success',
      },
      FAILED: {
        key: 'FAILED',
        label: 'فشل',
        cls: 'pill-red',
        icon: 'alert-circle',
        color: 'danger',
      },
      RETRYING: {
        key: 'RETRYING',
        label: 'إعادة المحاولة',
        cls: 'pill-blue',
        icon: 'refresh-cw',
        color: 'info',
      },
    };

    return map[s] || map.QUEUED;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §3 · DATA LOADING
     ───────────────────────────────────────────────────────────────────── */

  async function loadQueue() {
    try {
      QState.loading = true;

      let items = [];

      /* 1 · IndexedDB (المصدر الرئيسي) */
      if (GMS.IDB) {
        try {
          items = await GMS.IDB.queueAll();
        } catch (e) {
          console.warn('[Queue] IDB read failed:', e);
        }
      }

      /* 2 · Fallback: لو لا يوجد IndexedDB — نستخدم queue في الذاكرة */
      if (!items.length && GMS.Sync?.state?.queue?.length) {
        items = GMS.Sync.state.queue.slice();
      }

      /* تطبيع البيانات */
      QState.items = items.map(item => ({
        ...item,
        status: item.status || 'QUEUED',
        _queueId: item.id,
        _addedAt: item.created_at || new Date().toISOString(),
      }));

      updateStats();
      applyFilters();

      return QState.items;

    } catch (e) {
      console.error('[Queue] loadQueue:', e);
      return [];
    } finally {
      QState.loading = false;
    }
  }

  function updateStats() {
    const items = QState.items;

    let totalValue = 0;
    let totalPure = 0;
    let totalItemCount = 0;
    let pending = 0;
    let uploading = 0;
    let failed = 0;

    items.forEach(item => {
      totalValue += Number(item.grand_total || 0);
      totalPure += Number(item.total_pure_weight || 0);
      totalItemCount += Number(item.item_count || 0);

      const status = item.status || 'QUEUED';

      if (status === 'FAILED') failed++;
      else if (status === 'UPLOADING') uploading++;
      else pending++;
    });

    /* الأقدم والأحدث */
    const timestamps = items
      .map(i => new Date(i._addedAt).getTime())
      .filter(t => isFinite(t))
      .sort();

    QState.stats = {
      total: items.length,
      pending,
      uploading,
      failed,
      totalValue: GMS.round(totalValue, 2),
      totalPure: GMS.round(totalPure, 4),
      totalItems: totalItemCount,
      oldestAt: timestamps[0] || null,
      newestAt: timestamps[timestamps.length - 1] || null,
    };
  }

  function applyFilters() {
    const f = QState.filters;
    let rows = QState.items.slice();

    /* Search */
    if (f.search) {
      const q = f.search.toLowerCase();
      rows = rows.filter(r =>
        (r.sale_no || '').toLowerCase().includes(q) ||
        (r.customer_name || '').toLowerCase().includes(q) ||
        (r.branch_id || '').toLowerCase().includes(q) ||
        (r.sku || '').toLowerCase().includes(q)
      );
    }

    /* Status */
    if (f.status) {
      rows = rows.filter(r => r.status === f.status);
    }

    /* Date from */
    if (f.dateFrom) {
      rows = rows.filter(r => {
        const d = (r._addedAt || '').slice(0, 10);
        return d >= f.dateFrom;
      });
    }

    /* Date to */
    if (f.dateTo) {
      rows = rows.filter(r => {
        const d = (r._addedAt || '').slice(0, 10);
        return d <= f.dateTo;
      });
    }

    QState.filtered = rows;
    QState.totalPages = Math.max(1, Math.ceil(rows.length / QState.pageSize));

    if (QState.page > QState.totalPages) {
      QState.page = QState.totalPages;
    }

    return rows;
  }

  function getPageItems() {
    const start = (QState.page - 1) * QState.pageSize;
    const end = start + QState.pageSize;
    return QState.filtered.slice(start, end);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §4 · RENDERERS
     ───────────────────────────────────────────────────────────────────── */

  function renderKPIs() {
    const s = QState.stats;
    const online = isOnline();

    return `
      <div class="kpi-row cols-4">
        <div class="kpi ${s.total > 0 ? 'warn' : 'success'}">
          <div class="kpi-label">
            <i data-lucide="package"></i>
            إجمالي الفواتير المُعلَّقة
          </div>
          <div class="kpi-value">${GMS.intFmt(s.total)}</div>
          <div class="kpi-meta">
            ${s.total > 0
              ? `<b>${GMS.intFmt(s.pending)}</b> قيد الانتظار`
              : 'الطابور فارغ'}
          </div>
        </div>

        <div class="kpi gold">
          <div class="kpi-label">
            <i data-lucide="banknote"></i>
            القيمة الإجمالية
          </div>
          <div class="kpi-value">${GMS.moneyFmt(s.totalValue)} <small>ج.م</small></div>
          <div class="kpi-meta">
            <b>${GMS.intFmt(s.totalItems)}</b> صنف إجمالي
          </div>
        </div>

        <div class="kpi violet">
          <div class="kpi-label">
            <i data-lucide="scale"></i>
            البندق الإجمالي
          </div>
          <div class="kpi-value">${GMS.gramFmt(s.totalPure)} <small>جم</small></div>
          <div class="kpi-meta">
            بندق 24K
          </div>
        </div>

        <div class="kpi ${s.failed > 0 ? 'danger' : online ? 'success' : 'warn'}">
          <div class="kpi-label">
            <i data-lucide="${online ? 'cloud-check' : 'cloud-off'}"></i>
            حالة المزامنة
          </div>
          <div class="kpi-value" style="font-size:20px">
            ${online ? 'متصل' : 'غير متصل'}
          </div>
          <div class="kpi-meta">
            ${s.failed > 0
              ? `<b style="color:var(--danger)">${GMS.intFmt(s.failed)}</b> فشل — يحتاج مراجعة`
              : s.oldestAt
                ? `الأقدم: ${GMS.timeAgo(new Date(s.oldestAt))}`
                : 'لا توجد عناصر'}
          </div>
        </div>
      </div>
    `;
  }

  function renderActiveFilters() {
    const f = QState.filters;
    const chips = [];

    if (f.search) chips.push({ key: 'search', label: 'بحث', value: f.search });
    if (f.status) chips.push({
      key: 'status',
      label: 'حالة',
      value: getItemStatus({ status: f.status }).label,
    });
    if (f.dateFrom) chips.push({ key: 'dateFrom', label: 'من', value: f.dateFrom });
    if (f.dateTo) chips.push({ key: 'dateTo', label: 'إلى', value: f.dateTo });

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
        <button class="btn btn-ghost btn-sm" id="queue-clear-all-filters"
                style="font-size:11px">
          <i data-lucide="x"></i> مسح الكل
        </button>
      </div>
    `;
  }

  function renderQueueItem(item, idx) {
    const status = getItemStatus(item);
    const branchName = GMS.Demo?.getBranches()?.find(b => b.id === item.branch_id)?.name
      || item.branch_name
      || '—';

    const timeAgo = GMS.timeAgo(item._addedAt);
    const date = GMS.dateAr(item._addedAt);
    const time = new Date(item._addedAt).toLocaleTimeString('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const canRetry = item.status === 'FAILED';
    const canDelete = item.status !== 'UPLOADING';

    return `
      <div class="queue-item"
           data-queue-id="${GMS.esc(item._queueId)}"
           style="display:grid;grid-template-columns:auto 1fr auto;
                  gap:14px;align-items:center;padding:14px 16px;
                  border:1px solid var(--border);
                  border-radius:12px;background:var(--surface-2);
                  margin-bottom:10px;
                  transition:all .2s">
        <div style="width:44px;height:44px;border-radius:12px;
                    display:grid;place-items:center;flex-shrink:0;
                    background:${item.status === 'FAILED' ? 'var(--danger-bg)'
                              : item.status === 'UPLOADING' ? 'var(--info-bg)'
                              : 'var(--warn-bg)'};
                    color:${item.status === 'FAILED' ? 'var(--danger)'
                          : item.status === 'UPLOADING' ? 'var(--info)'
                          : 'var(--warn)'}">
          <i data-lucide="${status.icon}"
             style="width:20px;height:20px;
                    ${item.status === 'UPLOADING' ? 'animation:spin 1s linear infinite' : ''}"></i>
        </div>

        <div style="min-width:0">
          <div style="display:flex;align-items:center;gap:8px;
                      flex-wrap:wrap;margin-bottom:4px">
            <span class="mono" style="font-weight:900;font-size:13px;
                        letter-spacing:.3px">
              ${GMS.esc(item.sale_no || '—')}
            </span>
            <span class="pill ${status.cls}"
                  style="font-size:10px">
              ${status.label}
            </span>
          </div>

          <div style="display:flex;flex-wrap:wrap;gap:12px;
                      font-size:11px;color:var(--muted);font-weight:700">
            <span>
              <i data-lucide="package" style="width:10px;height:10px;
                         display:inline;vertical-align:-1px"></i>
              ${GMS.intFmt(item.item_count || 0)} صنف
            </span>
            <span>
              <i data-lucide="scale" style="width:10px;height:10px;
                         display:inline;vertical-align:-1px"></i>
              بندق ${GMS.gramFmt(item.total_pure_weight || 0)} جم
            </span>
            <span>
              <i data-lucide="building-2" style="width:10px;height:10px;
                         display:inline;vertical-align:-1px"></i>
              ${GMS.esc(branchName)}
            </span>
            <span>
              <i data-lucide="clock" style="width:10px;height:10px;
                         display:inline;vertical-align:-1px"></i>
              ${GMS.esc(date)} · ${GMS.esc(time)} (${GMS.esc(timeAgo)})
            </span>
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:6px;
                    align-items:flex-end;flex-shrink:0">
          <div class="mono" style="font-size:16px;font-weight:900;
                      color:var(--primary);letter-spacing:-.3px;
                      direction:ltr">
            ${GMS.moneyFmt(item.grand_total || 0)}
          </div>
          <div style="display:flex;gap:3px">
            <button class="row-act" data-queue-view="${GMS.esc(item._queueId)}"
                    title="عرض التفاصيل" style="width:30px;height:30px">
              <i data-lucide="eye"></i>
            </button>
            ${canRetry ? `
              <button class="row-act" data-queue-retry="${GMS.esc(item._queueId)}"
                      title="إعادة المحاولة"
                      style="width:30px;height:30px;color:var(--info)">
                <i data-lucide="refresh-cw"></i>
              </button>
            ` : ''}
            ${canDelete ? `
              <button class="row-act danger"
                      data-queue-delete="${GMS.esc(item._queueId)}"
                      title="حذف" style="width:30px;height:30px">
                <i data-lucide="trash-2"></i>
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }

  function renderQueueList() {
    const pageItems = getPageItems();

    if (!pageItems.length) {
      return `
        <div class="empty" style="padding:80px 20px">
          <i data-lucide="check-circle-2"
             style="color:var(--success);opacity:.4"></i>
          <p>
            ${QState.items.length === 0
              ? 'الطابور فارغ'
              : 'لا توجد نتائج مطابقة'}
          </p>
          <span>
            ${QState.items.length === 0
              ? 'جميع الفواتير مُزامَنة مع الخادم'
              : 'جرّب تعديل الفلاتر أو مسحها'}
          </span>
          ${QState.items.length === 0 ? `
            <div style="margin-top:20px">
              <button class="btn btn-primary btn-sm" id="queue-go-pos">
                <i data-lucide="scan-line"></i>
                اذهب لنقطة البيع
              </button>
            </div>
          ` : ''}
        </div>
      `;
    }

    return pageItems.map(renderQueueItem).join('');
  }

  function renderPagination() {
    const { page, totalPages, pageSize, filtered } = QState;

    if (totalPages <= 1) return '';

    const startIdx = (page - 1) * pageSize + 1;
    const endIdx = Math.min(page * pageSize, filtered.length);

    const pageButtons = [];
    const windowSize = 2;
    const from = Math.max(1, page - windowSize);
    const to = Math.min(totalPages, page + windowSize);

    const btn = (p, label, opts = {}) => `
      <button class="pg-btn ${opts.active ? 'active' : ''}"
              data-queue-page="${p}"
              ${opts.disabled ? 'disabled' : ''}>
        ${label}
      </button>
    `;

    pageButtons.push(btn(1,
      '<i data-lucide="chevrons-right" style="width:14px;height:14px"></i>',
      { disabled: page === 1 }));
    pageButtons.push(btn(page - 1,
      '<i data-lucide="chevron-right" style="width:14px;height:14px"></i>',
      { disabled: page === 1 }));

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

    pageButtons.push(btn(page + 1,
      '<i data-lucide="chevron-left" style="width:14px;height:14px"></i>',
      { disabled: page === totalPages }));
    pageButtons.push(btn(totalPages,
      '<i data-lucide="chevrons-left" style="width:14px;height:14px"></i>',
      { disabled: page === totalPages }));

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

        <select class="pg-size" id="queue-page-size">
          ${[10, 25, 50, 100].map(s => `
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
     §5 · MAIN RENDER
     ───────────────────────────────────────────────────────────────────── */

  function render(root) {
    const online = isOnline();
    const s = QState.stats;
    const hasItems = s.total > 0;

    root.innerHTML = `
      <div class="page-header">
        <h2>
          <i data-lucide="package-open"></i>
          ${GMS.t('queue.title')}
        </h2>
        <p>${GMS.t('queue.subtitle')}</p>
      </div>

      ${renderKPIs()}

      <!-- Warning banner if offline with items -->
      ${!online && hasItems ? `
        <div style="margin-bottom:16px;padding:14px 18px;border-radius:12px;
                    background:var(--warn-bg);
                    border:1px solid color-mix(in srgb,var(--warn) 35%,transparent);
                    display:flex;align-items:center;gap:12px">
          <i data-lucide="wifi-off"
             style="width:20px;height:20px;color:var(--warn);
                    flex-shrink:0"></i>
          <div style="flex:1">
            <div style="font-weight:800;font-size:13px;color:var(--warn)">
              الجهاز غير متصل بالإنترنت
            </div>
            <div style="font-size:11.5px;color:var(--text-2);
                        font-weight:600;margin-top:3px">
              سيتم رفع ${GMS.intFmt(s.total)} فاتورة تلقائياً عند عودة الاتصال
            </div>
          </div>
        </div>
      ` : ''}

      <!-- Processing banner -->
      ${QState.syncing ? `
        <div style="margin-bottom:16px;padding:14px 18px;border-radius:12px;
                    background:var(--info-bg);
                    border:1px solid color-mix(in srgb,var(--info) 35%,transparent)">
          <div style="display:flex;align-items:center;gap:12px;
                      margin-bottom:10px">
            <i data-lucide="loader-circle"
               style="width:20px;height:20px;color:var(--info);
                      animation:spin 1s linear infinite;flex-shrink:0"></i>
            <div style="flex:1;font-weight:800;font-size:13px;
                        color:var(--info)">
              جارٍ رفع الطابور…
            </div>
            <div class="mono" style="font-weight:900;color:var(--info);
                        font-size:14px">
              ${QState.syncProgress.current} / ${QState.syncProgress.total}
            </div>
          </div>
          <div style="height:6px;background:rgba(0,0,0,.08);
                      border-radius:4px;overflow:hidden">
            <div style="height:100%;
                        width:${QState.syncProgress.total > 0
                          ? (QState.syncProgress.current / QState.syncProgress.total * 100)
                          : 0}%;
                        background:var(--info);border-radius:4px;
                        transition:width .3s ease"></div>
          </div>
        </div>
      ` : ''}

      <!-- Toolbar -->
      <div class="card" style="margin-bottom:16px">
        <div class="toolbar-row">
          <div class="search-wrap" style="flex:1;min-width:240px;max-width:380px">
            <i data-lucide="search"></i>
            <input id="queue-search-input"
                   placeholder="بحث برقم الفاتورة، العميل…"
                   value="${GMS.esc(QState.filters.search)}"
                   autocomplete="off">
            ${QState.filters.search ? `
              <button class="search-clear" id="queue-search-clear">
                <i data-lucide="x"></i>
              </button>
            ` : ''}
          </div>

          <select class="filter-select" id="queue-filter-status"
                  style="min-width:160px">
            <option value="">كل الحالات</option>
            <option value="QUEUED" ${QState.filters.status === 'QUEUED' ? 'selected' : ''}>
              مُعلَّق
            </option>
            <option value="UPLOADING" ${QState.filters.status === 'UPLOADING' ? 'selected' : ''}>
              جارٍ الرفع
            </option>
            <option value="FAILED" ${QState.filters.status === 'FAILED' ? 'selected' : ''}>
              فشل
            </option>
          </select>

          <div class="field" style="min-width:140px;max-width:160px">
            <input type="date" id="queue-filter-from"
                   value="${GMS.esc(QState.filters.dateFrom)}"
                   style="padding:8px 12px">
          </div>

          <div class="field" style="min-width:140px;max-width:160px">
            <input type="date" id="queue-filter-to"
                   value="${GMS.esc(QState.filters.dateTo)}"
                   style="padding:8px 12px">
          </div>

          <div class="spacer" style="flex:1"></div>

          <label class="toggle-switch" style="margin-inline-end:8px">
            <input type="checkbox" id="queue-auto-sync"
                   ${QState.autoSyncEnabled ? 'checked' : ''}>
            <span class="track"></span>
            <span style="font-size:11px">تلقائي</span>
          </label>

          <button class="btn btn-sm btn-ghost" id="queue-export-btn">
            <i data-lucide="download"></i> تصدير
          </button>

          <button class="btn btn-sm btn-ghost" id="queue-refresh-btn">
            <i data-lucide="refresh-cw"></i>
          </button>
        </div>

        ${renderActiveFilters()}
      </div>

      <!-- Actions Bar -->
      ${hasItems ? `
        <div class="card" style="margin-bottom:16px">
          <div class="card-body" style="padding:14px 18px;
                      display:flex;align-items:center;gap:12px;
                      flex-wrap:wrap">
            <div style="display:flex;align-items:center;gap:8px">
              <i data-lucide="list-checks"
                 style="width:16px;height:16px;color:var(--primary)"></i>
              <span style="font-weight:800;font-size:13px">
                إجراءات جماعية
              </span>
            </div>

            <div class="spacer" style="flex:1"></div>

            <button class="btn btn-sm btn-danger" id="queue-clear-btn">
              <i data-lucide="trash-2"></i>
              تفريغ الطابور (${GMS.intFmt(s.total)})
            </button>

            <button class="btn btn-primary btn-sm" id="queue-sync-all-btn"
                    ${!online ? 'disabled' : ''}>
              <i data-lucide="upload-cloud"></i>
              مزامنة الكل (${GMS.intFmt(s.total)})
            </button>
          </div>
        </div>
      ` : ''}

      <!-- Queue List -->
      <div class="card">
        <div class="card-head">
          <h3>
            <i data-lucide="package-open"></i>
            الفواتير في الطابور
          </h3>
          <div class="spacer" style="flex:1"></div>
          <span class="chip info">
            <i data-lucide="database" style="width:12px;height:12px"></i>
            ${GMS.intFmt(QState.filtered.length)} فاتورة
          </span>
        </div>

        <div class="card-body" id="queue-list-host">
          ${renderQueueList()}
        </div>

        <div id="queue-pagination-host">
          ${renderPagination()}
        </div>
      </div>

      <!-- Info Footer -->
      <div style="margin-top:16px;padding:16px 20px;
                  background:var(--surface-2);border:1px solid var(--border);
                  border-radius:var(--radius);
                  display:flex;align-items:center;gap:12px;
                  font-size:12px;color:var(--muted);font-weight:600;
                  line-height:1.7">
        <i data-lucide="info"
           style="width:18px;height:18px;color:var(--info);
                  flex-shrink:0"></i>
        <div>
          الفواتير المُعلَّقة تُحفظ في <b style="color:var(--text-2)">IndexedDB</b>
          محلياً عند عدم وجود اتصال، وتُرفع تلقائياً إلى
          <b style="color:var(--text-2)">Supabase</b> عند عودة الإنترنت.
          جميع الفواتير تُنشأ بحالة
          <span class="pill pill-amber" style="font-size:10px">
            PENDING_APPROVAL
          </span>
          بانتظار مراجعة المحاسب.
        </div>
      </div>
    `;

    window.lucide?.createIcons();
    bindControls();
    bindLiveUpdates();
  }

  function refreshList() {
    const host = document.getElementById('queue-list-host');
    if (host) {
      host.innerHTML = renderQueueList();
      window.lucide?.createIcons();
      bindItemEvents();
    }

    const pagHost = document.getElementById('queue-pagination-host');
    if (pagHost) {
      pagHost.innerHTML = renderPagination();
      window.lucide?.createIcons();
      bindPaginationEvents();
    }
  }

  function refreshFullUI() {
    /* إعادة تصيير كاملة عند تغيير الإحصائيات */
    render(document.getElementById('page'));
  }

  /* ═════════════════════════════════════════════════════════════════════
     §6 · CONTROLS BINDING
     ───────────────────────────────────────────────────────────────────── */

  function bindControls() {
    /* Search */
    const searchInput = document.getElementById('queue-search-input');
    if (searchInput) {
      searchInput.oninput = (e) => {
        clearTimeout(QState.timers.search);
        QState.timers.search = setTimeout(() => {
          QState.filters.search = e.target.value.trim();
          QState.page = 1;
          applyFilters();
          refreshList();
        }, 250);
      };
    }

    /* Clear search */
    const clearBtn = document.getElementById('queue-search-clear');
    if (clearBtn) {
      clearBtn.onclick = () => {
        QState.filters.search = '';
        QState.page = 1;
        applyFilters();
        refreshFullUI();
      };
    }

    /* Status filter */
    const statusFilter = document.getElementById('queue-filter-status');
    if (statusFilter) {
      statusFilter.onchange = () => {
        QState.filters.status = statusFilter.value;
        QState.page = 1;
        applyFilters();
        refreshList();
      };
    }

    /* Date from */
    const fromInput = document.getElementById('queue-filter-from');
    if (fromInput) {
      fromInput.onchange = () => {
        QState.filters.dateFrom = fromInput.value;
        QState.page = 1;
        applyFilters();
        refreshList();
      };
    }

    /* Date to */
    const toInput = document.getElementById('queue-filter-to');
    if (toInput) {
      toInput.onchange = () => {
        QState.filters.dateTo = toInput.value;
        QState.page = 1;
        applyFilters();
        refreshList();
      };
    }

    /* Auto-sync toggle */
    const autoSync = document.getElementById('queue-auto-sync');
    if (autoSync) {
      autoSync.onchange = () => {
        QState.autoSyncEnabled = autoSync.checked;

        try {
          localStorage.setItem('gms.queue.autoSync', JSON.stringify(QState.autoSyncEnabled));
        } catch (_) {}

        if (QState.autoSyncEnabled) {
          startAutoSync();
          GMS.Toast.ok('تم تفعيل المزامنة التلقائية');
        } else {
          stopAutoSync();
          GMS.Toast.info('تم تعطيل المزامنة التلقائية');
        }
      };
    }

    /* Clear individual filters */
    document.querySelectorAll('[data-clear-filter]').forEach(btn => {
      btn.onclick = () => {
        const key = btn.dataset.clearFilter;
        QState.filters[key] = '';
        QState.page = 1;
        applyFilters();
        refreshFullUI();
      };
    });

    /* Clear all */
    const clearAllBtn = document.getElementById('queue-clear-all-filters');
    if (clearAllBtn) {
      clearAllBtn.onclick = () => {
        QState.filters = { search: '', status: '', dateFrom: '', dateTo: '' };
        QState.page = 1;
        applyFilters();
        refreshFullUI();
      };
    }

    /* Refresh */
    const refreshBtn = document.getElementById('queue-refresh-btn');
    if (refreshBtn) {
      refreshBtn.onclick = async () => {
        refreshBtn.classList.add('spinning');
        try {
          await loadQueue();
          refreshFullUI();
          GMS.Toast.ok('تم تحديث الطابور');
        } finally {
          refreshBtn.classList.remove('spinning');
        }
      };
    }

    /* Export */
    const exportBtn = document.getElementById('queue-export-btn');
    if (exportBtn) {
      exportBtn.onclick = () => exportQueue();
    }

    /* Sync all */
    const syncAllBtn = document.getElementById('queue-sync-all-btn');
    if (syncAllBtn) {
      syncAllBtn.onclick = () => syncAll();
    }

    /* Clear all */
    const clearQueueBtn = document.getElementById('queue-clear-btn');
    if (clearQueueBtn) {
      clearQueueBtn.onclick = () => clearQueue();
    }

    /* Go POS (from empty state) */
    const goPos = document.getElementById('queue-go-pos');
    if (goPos) {
      goPos.onclick = () => GMS.Router?.go('pos');
    }

    bindItemEvents();
    bindPaginationEvents();
  }

  function bindItemEvents() {
    /* View details */
    document.querySelectorAll('[data-queue-view]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        showItemDetails(btn.dataset.queueView);
      };
    });

    /* Retry */
    document.querySelectorAll('[data-queue-retry]').forEach(btn => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        await retryItem(btn.dataset.queueRetry);
      };
    });

    /* Delete */
    document.querySelectorAll('[data-queue-delete]').forEach(btn => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        await deleteItem(btn.dataset.queueDelete);
      };
    });

    /* Row click → details */
    document.querySelectorAll('[data-queue-id]').forEach(row => {
      row.onclick = (e) => {
        if (e.target.closest('button')) return;
        showItemDetails(row.dataset.queueId);
      };
    });
  }

  function bindPaginationEvents() {
    document.querySelectorAll('[data-queue-page]').forEach(btn => {
      btn.onclick = () => {
        const page = Number(btn.dataset.queuePage);
        if (page < 1 || page > QState.totalPages) return;

        QState.page = page;
        refreshList();

        document.getElementById('queue-list-host')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      };
    });

    const sizeSelect = document.getElementById('queue-page-size');
    if (sizeSelect) {
      sizeSelect.onchange = () => {
        QState.pageSize = Number(sizeSelect.value);
        QState.page = 1;
        applyFilters();
        refreshList();
      };
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §7 · ACTIONS
     ───────────────────────────────────────────────────────────────────── */

  async function retryItem(queueId) {
    if (!isOnline()) {
      GMS.Beep?.error();
      return GMS.Toast.warn('لا يمكن الرفع', 'الجهاز غير متصل بالإنترنت');
    }

    const item = QState.items.find(x => x._queueId === queueId);
    if (!item) return;

    /* Update status → RETRYING */
    item.status = 'UPLOADING';
    refreshList();

    try {
      /* رفع إلى Supabase */
      if (GMS.Supabase?.isReady()) {
        const client = GMS.Supabase.get();

        const { data: saleRow, error: saleError } = await client
          .from(GMS.SUPABASE_CONFIG.TABLES.SALES)
          .insert({
            sale_no: item.sale_no,
            type: 'sale',
            item_count: item.item_count,
            total_net_weight: item.total_net_weight,
            total_pure_weight: item.total_pure_weight,
            gold_value: item.gold_value,
            total_workmanship: item.total_workmanship,
            grand_total: item.grand_total,
            paid: item.grand_total,
            remaining: 0,
            payment_method: item.payment_method || 'cash',
            branch_id: item.branch_id,
            status: 'PENDING_APPROVAL',
          })
          .select('id')
          .single();

        if (saleError) throw saleError;

        /* بنود الفاتورة */
        if (item.lines?.length) {
          const linePayload = item.lines.map(l => ({
            sale_id: saleRow.id,
            inventory_id: l.inventory_id,
            sku: l.sku,
            karat: l.karat,
            net_weight: l.net_weight,
            pure_weight: l.pure_weight,
            line_total: l.line_total,
          }));

          const { error: linesError } = await client
            .from(GMS.SUPABASE_CONFIG.TABLES.SALE_ITEMS)
            .insert(linePayload);

          if (linesError) throw linesError;
        }

        /* تحديث المخزون */
        const invIds = (item.lines || []).map(l => l.inventory_id).filter(Boolean);
        if (invIds.length) {
          await client
            .from(GMS.SUPABASE_CONFIG.TABLES.INVENTORY)
            .update({ status: 'SOLD', updated_at: new Date().toISOString() })
            .in('id', invIds);
        }
      } else {
        /* Simulation delay */
        await GMS.sleep(800);
      }

      /* Remove from queue */
      if (GMS.IDB) {
        await GMS.IDB.queueDelete(queueId);
      }

      QState.items = QState.items.filter(x => x._queueId !== queueId);

      updateStats();
      applyFilters();
      refreshFullUI();

      GMS.Beep?.success();
      GMS.Toast.ok('تمت المزامنة', item.sale_no);

    } catch (e) {
      console.error('[Queue.retry]', e);

      item.status = 'FAILED';
      item.error = e.message;

      refreshList();

      GMS.Beep?.error();
      GMS.Toast.err('فشلت المزامنة', e.message);
    }
  }

  async function deleteItem(queueId) {
    const item = QState.items.find(x => x._queueId === queueId);
    if (!item) return;

    const ok = await GMS.Confirm.ask(
      `سيتم حذف الفاتورة "${item.sale_no}" من الطابور نهائياً. لا يمكن التراجع.`,
      {
        title: 'حذف من الطابور',
        okText: 'حذف',
        danger: true,
        icon: 'trash-2',
      }
    );

    if (!ok) return;

    try {
      if (GMS.IDB) {
        await GMS.IDB.queueDelete(queueId);
      }

      QState.items = QState.items.filter(x => x._queueId !== queueId);

      updateStats();
      applyFilters();
      refreshFullUI();

      GMS.Beep?.delete();
      GMS.Toast.ok('تم الحذف', item.sale_no);

    } catch (e) {
      console.error('[Queue.delete]', e);
      GMS.Toast.err('فشل الحذف', e.message);
    }
  }

  async function syncAll() {
    if (!isOnline()) {
      GMS.Beep?.error();
      return GMS.Toast.warn('لا يمكن المزامنة', 'الجهاز غير متصل');
    }

    if (!QState.items.length) {
      return GMS.Toast.info('الطابور فارغ');
    }

    const ok = await GMS.Confirm.ask(
      `سيتم رفع ${QState.items.length} فاتورة إلى الخادم. متابعة؟`,
      {
        title: 'مزامنة الطابور',
        okText: 'مزامنة الكل',
        danger: false,
        icon: 'upload-cloud',
      }
    );

    if (!ok) return;

    QState.syncing = true;
    QState.syncProgress = {
      current: 0,
      total: QState.items.length,
    };

    refreshFullUI();

    try {
      let success = 0;
      let failed = 0;

      const items = QState.items.slice();

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        QState.syncProgress.current = i + 1;

        try {
          item.status = 'UPLOADING';

          /* رفع */
          if (GMS.Supabase?.isReady()) {
            const client = GMS.Supabase.get();

            const { data: saleRow, error: saleError } = await client
              .from(GMS.SUPABASE_CONFIG.TABLES.SALES)
              .insert({
                sale_no: item.sale_no,
                type: 'sale',
                item_count: item.item_count,
                total_net_weight: item.total_net_weight,
                total_pure_weight: item.total_pure_weight,
                gold_value: item.gold_value,
                total_workmanship: item.total_workmanship,
                grand_total: item.grand_total,
                paid: item.grand_total,
                remaining: 0,
                payment_method: item.payment_method || 'cash',
                branch_id: item.branch_id,
                status: 'PENDING_APPROVAL',
              })
              .select('id')
              .single();

            if (saleError) throw saleError;

            if (item.lines?.length) {
              const linePayload = item.lines.map(l => ({
                sale_id: saleRow.id,
                inventory_id: l.inventory_id,
                sku: l.sku,
                karat: l.karat,
                net_weight: l.net_weight,
                pure_weight: l.pure_weight,
                line_total: l.line_total,
              }));
              await client.from(GMS.SUPABASE_CONFIG.TABLES.SALE_ITEMS).insert(linePayload);
            }

            const invIds = (item.lines || []).map(l => l.inventory_id).filter(Boolean);
            if (invIds.length) {
              await client
                .from(GMS.SUPABASE_CONFIG.TABLES.INVENTORY)
                .update({ status: 'SOLD', updated_at: new Date().toISOString() })
                .in('id', invIds);
            }
          } else {
            await GMS.sleep(300);
          }

          /* حذف من الطابور */
          if (GMS.IDB) {
            await GMS.IDB.queueDelete(item._queueId);
          }

          success++;

        } catch (e) {
          console.error('[Queue.syncAll] Item failed:', item.sale_no, e);
          item.status = 'FAILED';
          item.error = e.message;
          failed++;
        }

        QState.syncProgress.current = i + 1;
        refreshFullUI();

        await GMS.yieldToUI();
      }

      /* Reload */
      await loadQueue();
      applyFilters();

      QState.syncing = false;
      refreshFullUI();

      GMS.Beep?.complete();

      if (failed > 0) {
        GMS.Toast.warn(
          'اكتملت المزامنة مع أخطاء',
          `${success} نجحت · ${failed} فشلت`
        );
      } else {
        GMS.Toast.ok(
          'تمت مزامنة الطابور',
          `${success} فاتورة رُفعت بنجاح`
        );
      }

      /* Audit */
      if (GMS.Audit) {
        await GMS.Audit.log('SYNC', 'sales', null,
          `مزامنة ${success} فاتورة من الطابور`,
          { success, failed });
      }

    } catch (e) {
      console.error('[Queue.syncAll]', e);
      QState.syncing = false;
      refreshFullUI();
      GMS.Beep?.error();
      GMS.Toast.err('فشلت المزامنة', e.message);
    }
  }

  async function clearQueue() {
    if (!QState.items.length) return;

    const ok = await GMS.Confirm.ask(
      `سيتم حذف ${QState.items.length} فاتورة من الطابور نهائياً بدون رفعها للخادم. لا يمكن التراجع.`,
      {
        title: 'تفريغ الطابور',
        okText: 'تفريغ نهائي',
        danger: true,
        icon: 'alert-octagon',
      }
    );

    if (!ok) return;

    try {
      if (GMS.IDB) {
        await GMS.IDB.queueClear();
      }

      QState.items = [];
      updateStats();
      applyFilters();
      refreshFullUI();

      GMS.Beep?.delete();
      GMS.Toast.warn('تم تفريغ الطابور', 'لم تُرفع الفواتير إلى الخادم');

      /* Audit */
      if (GMS.Audit) {
        await GMS.Audit.log('DELETE', 'sales', null,
          'تفريغ طابور المزامنة بالكامل');
      }

    } catch (e) {
      console.error('[Queue.clearQueue]', e);
      GMS.Toast.err('فشل التفريغ', e.message);
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §8 · DETAILS MODAL
     ───────────────────────────────────────────────────────────────────── */

  function showItemDetails(queueId) {
    const item = QState.items.find(x => x._queueId === queueId);
    if (!item) return;

    const status = getItemStatus(item);
    const branchName = GMS.Demo?.getBranches()?.find(b => b.id === item.branch_id)?.name
      || item.branch_name || '—';

    const lines = item.lines || [];

    GMS.Modal.open({
      title: `تفاصيل الفاتورة — ${item.sale_no}`,
      icon: 'receipt',
      size: 'lg',
      body: `
        <!-- Status banner -->
        <div style="display:flex;align-items:center;gap:12px;
                    padding:14px 16px;background:var(--surface-2);
                    border-radius:12px;margin-bottom:18px;
                    border:1px solid var(--border)">
          <div style="width:44px;height:44px;border-radius:12px;
                      display:grid;place-items:center;flex-shrink:0;
                      background:${item.status === 'FAILED' ? 'var(--danger-bg)'
                                : item.status === 'UPLOADING' ? 'var(--info-bg)'
                                : 'var(--warn-bg)'};
                      color:${item.status === 'FAILED' ? 'var(--danger)'
                            : item.status === 'UPLOADING' ? 'var(--info)'
                            : 'var(--warn)'}">
            <i data-lucide="${status.icon}" style="width:22px;height:22px"></i>
          </div>
          <div style="flex:1">
            <div style="font-weight:900;font-size:15px;
                        letter-spacing:-.2px">
              ${status.label}
            </div>
            <div style="font-size:11.5px;color:var(--muted);
                        font-weight:700;margin-top:3px">
              ${GMS.dateTimeAr(item._addedAt)} ·
              ${GMS.timeAgo(item._addedAt)}
            </div>
          </div>
        </div>

        ${item.error ? `
          <div style="margin-bottom:16px;padding:12px 14px;border-radius:10px;
                      background:var(--danger-bg);color:var(--danger);
                      border:1px solid color-mix(in srgb,var(--danger) 35%,transparent);
                      font-size:12px;font-weight:700;line-height:1.6">
            <div style="display:flex;align-items:center;gap:8px;
                        margin-bottom:5px">
              <i data-lucide="alert-circle" style="width:15px;height:15px"></i>
              <span>سبب الفشل</span>
            </div>
            <div style="font-weight:600;font-size:11.5px">
              ${GMS.esc(item.error)}
            </div>
          </div>
        ` : ''}

        <!-- Summary grid -->
        <div style="display:grid;grid-template-columns:repeat(4,1fr);
                    gap:12px;margin-bottom:18px">
          <div style="padding:12px 14px;background:var(--surface-2);
                      border-radius:10px;border:1px solid var(--border)">
            <div style="font-size:10.5px;font-weight:800;color:var(--muted);
                        text-transform:uppercase;letter-spacing:.3px">
              عدد الأصناف
            </div>
            <div class="mono" style="font-size:16px;font-weight:900;
                        margin-top:4px">
              ${GMS.intFmt(item.item_count || 0)}
            </div>
          </div>

          <div style="padding:12px 14px;background:var(--surface-2);
                      border-radius:10px;border:1px solid var(--border)">
            <div style="font-size:10.5px;font-weight:800;color:var(--muted);
                        text-transform:uppercase;letter-spacing:.3px">
              الوزن الصافي
            </div>
            <div class="mono" style="font-size:16px;font-weight:900;
                        margin-top:4px">
              ${GMS.gramFmt(item.total_net_weight || 0)} <small style="font-size:11px;color:var(--muted)">جم</small>
            </div>
          </div>

          <div style="padding:12px 14px;background:var(--surface-2);
                      border-radius:10px;border:1px solid var(--border)">
            <div style="font-size:10.5px;font-weight:800;color:var(--muted);
                        text-transform:uppercase;letter-spacing:.3px">
              البندق 24K
            </div>
            <div class="mono" style="font-size:16px;font-weight:900;
                        margin-top:4px;color:var(--primary)">
              ${GMS.gramFmt(item.total_pure_weight || 0)} <small style="font-size:11px;color:var(--muted)">جم</small>
            </div>
          </div>

          <div style="padding:12px 14px;background:var(--gold-soft);
                      border-radius:10px;
                      border:1.5px solid color-mix(in srgb,var(--primary) 40%,var(--border))">
            <div style="font-size:10.5px;font-weight:800;
                        color:var(--muted);text-transform:uppercase;
                        letter-spacing:.3px">
              الإجمالي
            </div>
            <div class="mono" style="font-size:16px;font-weight:900;
                        margin-top:4px;color:var(--primary)">
              ${GMS.moneyFmt(item.grand_total || 0)} <small style="font-size:11px;color:var(--muted)">ج.م</small>
            </div>
          </div>
        </div>

        <!-- Info -->
        <div class="calc-list" style="margin-bottom:16px">
          <div class="cl-row">
            <span class="k">
              <i data-lucide="building-2"></i>
              الفرع
            </span>
            <span class="v" style="font-size:12.5px">${GMS.esc(branchName)}</span>
          </div>
          <div class="cl-row">
            <span class="k">
              <i data-lucide="credit-card"></i>
              طريقة الدفع
            </span>
            <span class="v" style="font-size:12.5px">
              ${GMS.getPaymentMethod(item.payment_method || 'cash').label}
            </span>
          </div>
          <div class="cl-row">
            <span class="k">
              <i data-lucide="hash"></i>
              Queue ID
            </span>
            <span class="v mono" style="font-size:11px">
              ${GMS.esc(item._queueId)}
            </span>
          </div>
        </div>

        <!-- Lines -->
        ${lines.length ? `
          <div style="font-size:11px;font-weight:800;color:var(--muted);
                      text-transform:uppercase;letter-spacing:.5px;
                      margin-bottom:9px">
            بنود الفاتورة (${lines.length})
          </div>

          <div style="max-height:280px;overflow-y:auto;
                      border:1px solid var(--border);border-radius:11px">
            <table class="tbl" style="font-size:11.5px">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th class="col-c" style="width:60px">عيار</th>
                  <th class="col-num" style="width:90px">صافي</th>
                  <th class="col-num" style="width:90px">بندق</th>
                  <th class="col-num" style="width:100px">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                ${lines.map(l => `
                  <tr>
                    <td class="mono" style="font-weight:800">
                      ${GMS.esc(l.sku || '—')}
                    </td>
                    <td class="col-c">
                      ${l.karat ? `<span class="karat-badge" data-k="${l.karat}">${l.karat}K</span>` : '—'}
                    </td>
                    <td class="col-num">${GMS.gramFmt(l.net_weight)}</td>
                    <td class="col-num" style="color:var(--primary);font-weight:800">
                      ${GMS.gramFmt(l.pure_weight)}
                    </td>
                    <td class="col-num" style="font-weight:800">
                      ${GMS.moneyFmt(l.line_total)}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : ''}
      `,
      footer: `
        <button class="btn" data-close>إغلاق</button>
        ${item.status === 'FAILED' ? `
          <button class="btn btn-info" id="detail-retry">
            <i data-lucide="refresh-cw"></i> إعادة المحاولة
          </button>
        ` : ''}
        ${item.status !== 'UPLOADING' ? `
          <button class="btn btn-danger" id="detail-delete">
            <i data-lucide="trash-2"></i> حذف من الطابور
          </button>
        ` : ''}
      `,
      onMount: (el, close) => {
        const retryBtn = el.querySelector('#detail-retry');
        if (retryBtn) {
          retryBtn.onclick = () => {
            close();
            retryItem(queueId);
          };
        }

        const deleteBtn = el.querySelector('#detail-delete');
        if (deleteBtn) {
          deleteBtn.onclick = () => {
            close();
            deleteItem(queueId);
          };
        }
      },
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §9 · AUTO SYNC
     ───────────────────────────────────────────────────────────────────── */

  function startAutoSync() {
    stopAutoSync();

    if (!QState.autoSyncEnabled) return;
    if (!isOnline()) return;
    if (QState.items.length === 0) return;

    QState.timers.autoSync = setInterval(() => {
      if (!isOnline()) return;
      if (QState.syncing) return;
      if (QState.items.length === 0) return;
      if (document.hidden) return;

      /* لا نُزامن تلقائياً إلا إذا كان هناك عناصر معلقة */
      const pendingItems = QState.items.filter(
        x => x.status === 'QUEUED' || x.status === 'PENDING'
      );

      if (pendingItems.length > 0) {
        /* مزامنة صامتة (بدون confirm) */
        silentSync();
      }
    }, QState.autoSyncIntervalMs);

    console.log('[Queue] Auto-sync started every',
      QState.autoSyncIntervalMs / 1000, 's');
  }

  function stopAutoSync() {
    if (QState.timers.autoSync) {
      clearInterval(QState.timers.autoSync);
      QState.timers.autoSync = null;
    }
  }

  async function silentSync() {
    if (QState.syncing) return;
    if (!isOnline()) return;

    const items = QState.items.filter(
      x => x.status === 'QUEUED' || x.status === 'PENDING' || x.status === 'FAILED'
    );

    if (!items.length) return;

    console.log('[Queue] Silent sync starting for', items.length, 'items');

    let success = 0;

    for (const item of items) {
      try {
        item.status = 'UPLOADING';

        if (GMS.Supabase?.isReady()) {
          const client = GMS.Supabase.get();

          const { data: saleRow, error: saleError } = await client
            .from(GMS.SUPABASE_CONFIG.TABLES.SALES)
            .insert({
              sale_no: item.sale_no,
              type: 'sale',
              item_count: item.item_count,
              total_pure_weight: item.total_pure_weight,
              grand_total: item.grand_total,
              paid: item.grand_total,
              remaining: 0,
              payment_method: item.payment_method || 'cash',
              branch_id: item.branch_id,
              status: 'PENDING_APPROVAL',
            })
            .select('id')
            .single();

          if (saleError) throw saleError;

          const invIds = (item.lines || []).map(l => l.inventory_id).filter(Boolean);
          if (invIds.length) {
            await client
              .from(GMS.SUPABASE_CONFIG.TABLES.INVENTORY)
              .update({ status: 'SOLD' })
              .in('id', invIds);
          }
        } else {
          await GMS.sleep(500);
        }

        if (GMS.IDB) {
          await GMS.IDB.queueDelete(item._queueId);
        }

        success++;

      } catch (e) {
        console.warn('[Queue] Silent sync failed for', item.sale_no, e);
        item.status = 'FAILED';
        item.error = e.message;
      }
    }

    if (success > 0) {
      await loadQueue();
      updateStats();
      applyFilters();

      if (GMS.Router?.current() === 'queue') {
        refreshFullUI();
      }

      console.log('[Queue] Silent sync completed:', success, 'items');
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §10 · LIVE UPDATES
     ───────────────────────────────────────────────────────────────────── */

  function bindLiveUpdates() {
    /* Sync online change */
    if (GMS.Sync) {
      const unsub1 = GMS.Sync.on('onlineChange', (data) => {
        if (GMS.Router?.current() !== 'queue') return;

        render(document.getElementById('page'));

        if (data.online && QState.autoSyncEnabled && QState.items.length) {
          setTimeout(() => silentSync(), 2000);
        }
      });

      QState.unsubscribers.push(unsub1);
    }

    /* Sync queue change (من Sync.pushQueue) */
    if (GMS.Sync) {
      const unsub2 = GMS.Sync.on('queueChange', () => {
        if (GMS.Router?.current() !== 'queue') return;
        loadQueue().then(() => refreshFullUI());
      });

      QState.unsubscribers.push(unsub2);
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §11 · EXPORT
     ───────────────────────────────────────────────────────────────────── */

  function exportQueue() {
    if (!window.XLSX) {
      GMS.Toast.err('محرك Excel غير متاح');
      return;
    }

    const rows = QState.filtered;

    if (!rows.length) {
      GMS.Toast.warn('لا توجد بيانات للتصدير');
      return;
    }

    try {
      const data = rows.map(item => ({
        'رقم الفاتورة': item.sale_no || '',
        'الحالة': getItemStatus(item).label,
        'عدد الأصناف': item.item_count || 0,
        'الوزن الصافي (جم)': GMS.round(item.total_net_weight || 0, 3),
        'البندق 24K (جم)': GMS.round(item.total_pure_weight || 0, 4),
        'الإجمالي (ج.م)': GMS.round(item.grand_total || 0, 2),
        'طريقة الدفع': GMS.getPaymentMethod(item.payment_method || 'cash').label,
        'الفرع': GMS.Demo?.getBranches()?.find(b => b.id === item.branch_id)?.name
          || item.branch_name || '',
        'التاريخ': GMS.dateTimeAr(item._addedAt),
        'Queue ID': item._queueId,
        'خطأ': item.error || '',
      }));

      const ws = XLSX.utils.json_to_sheet(data);
      ws['!cols'] = [
        { wch: 20 }, { wch: 14 }, { wch: 12 }, { wch: 16 },
        { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 22 },
        { wch: 20 }, { wch: 20 }, { wch: 40 },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'طابور المزامنة');

      /* Stats sheet */
      const s = QState.stats;
      const statsData = [
        ['إحصائيات طابور المزامنة'],
        ['تاريخ التصدير', new Date().toLocaleString('ar-EG')],
        [''],
        ['المؤشر', 'القيمة'],
        ['إجمالي الفواتير', s.total],
        ['مُعلَّقة', s.pending],
        ['قيد الرفع', s.uploading],
        ['فشل', s.failed],
        ['إجمالي الأصناف', s.totalItems],
        ['إجمالي القيمة', s.totalValue],
        ['إجمالي البندق (جم)', s.totalPure],
      ];

      const wsStats = XLSX.utils.aoa_to_sheet(statsData);
      wsStats['!cols'] = [{ wch: 30 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(wb, wsStats, 'الإحصائيات');

      XLSX.writeFile(wb, `sync_queue_${GMS.todayISO()}.xlsx`);
      GMS.Toast.ok(`تم تصدير ${rows.length} فاتورة`);

    } catch (e) {
      console.error('[Queue.export]', e);
      GMS.Toast.err('فشل التصدير', e.message);
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §12 · INIT & CLEANUP
     ───────────────────────────────────────────────────────────────────── */

  async function init() {
    /* Load auto-sync preference */
    try {
      const saved = localStorage.getItem('gms.queue.autoSync');
      if (saved !== null) {
        QState.autoSyncEnabled = JSON.parse(saved);
      }
    } catch (_) {}

    await loadQueue();

    /* Start auto sync */
    if (QState.autoSyncEnabled) {
      startAutoSync();
    }
  }

  function cleanup() {
    cleanupListeners();
    stopAutoSync();
  }

  /* ═════════════════════════════════════════════════════════════════════
     §13 · VIEW REGISTRATION
     ═════════════════════════════════════════════════════════════════════ */
  GMS.Views = GMS.Views || {};

  GMS.Views.queue = {
    render: async (root) => {
      await init();
      render(root);
    },
    cleanup,
    state: QState,

    /* Data */
    load: loadQueue,
    reload: init,
    applyFilters,
    updateStats,

    /* Actions */
    retry: retryItem,
    delete: deleteItem,
    syncAll,
    clearQueue,
    silentSync,

    /* Details */
    showDetails: showItemDetails,

    /* Auto-sync */
    startAutoSync,
    stopAutoSync,

    /* Export */
    export: exportQueue,

    /* Helpers */
    getItemStatus,
    isOnline,
  };

  /* ═════════════════════════════════════════════════════════════════════
     §14 · LOADED CONFIRMATION
     ═════════════════════════════════════════════════════════════════════ */
  console.log(
    '%c📦 Queue View loaded · Offline-First Sync',
    'color:#0e7490;font-weight:800;font-size:12px;padding:1px 5px;' +
    'background:#e0f2f7;border-radius:4px;'
  );

  console.log(
    `%c⚡ Auto-sync · Silent upload · Retry · Bulk actions · Live updates`,
    'color:#6b7a95;font-weight:700;font-size:11px;'
  );

  /* ═════════════════════════════════════════════════════════════════════
     ✅ js/20-views-queue.js — نهاية الملف
     ═════════════════════════════════════════════════════════════════════ */

})();