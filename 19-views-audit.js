/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ENTERPRISE — js/19-views-audit.js
   سجل الحركات (Audit Trail):
     - عرض كامل للسجل غير القابل للتعديل
     - فلاتر متعددة (نوع الحركة، الدور، الكيان، التاريخ، البحث)
     - ترقيم صفحات (Pagination)
     - عرض تفاصيل الحركة مع Metadata
     - إحصائيات شاملة
     - تصدير Excel
     - Realtime live updates
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const GMS = window.GMS = window.GMS || {};

  /* ═════════════════════════════════════════════════════════════════════
     §1 · AUDIT STATE
     ═════════════════════════════════════════════════════════════════════ */
  const AuditState = {
    /* البيانات */
    allLogs: [],
    filtered: [],

    /* Pagination */
    page: 1,
    pageSize: 50,
    totalPages: 1,

    /* الفلاتر */
    filters: {
      search: '',
      action: '',
      role: '',
      entityType: '',
      dateFrom: '',
      dateTo: '',
      user: '',
    },

    /* Stats */
    stats: {
      total: 0,
      today: 0,
      week: 0,
      month: 0,
      byAction: {},
      byRole: {},
      byEntity: {},
      uniqueUsers: 0,
    },

    /* Loading */
    loading: false,

    /* Live updates */
    liveEnabled: true,
    unsubscribers: [],

    /* Timers */
    timers: {
      search: null,
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

  /**
   * قراءة أيقونة الحركة ولونها
   */
  function getActionMeta(action) {
    const map = {
      CREATE:        { icon: 'plus-circle',     cls: 'create',  color: 'success' },
      UPDATE:        { icon: 'pencil',          cls: 'update',  color: 'info' },
      DELETE:        { icon: 'trash-2',         cls: 'delete',  color: 'danger' },
      LOGIN:         { icon: 'log-in',          cls: 'login',   color: 'violet' },
      LOGOUT:        { icon: 'log-out',         cls: 'login',   color: 'violet' },
      APPROVE:       { icon: 'check-circle-2',  cls: 'approve', color: 'success' },
      REJECT:        { icon: 'x-circle',        cls: 'reject',  color: 'danger' },
      SHIFT_CLOSE:   { icon: 'lock',            cls: 'shift',   color: 'teal' },
      VIEW:          { icon: 'eye',             cls: 'update',  color: 'info' },
      EXPORT:        { icon: 'download',        cls: 'update',  color: 'info' },
      IMPORT:        { icon: 'upload',          cls: 'update',  color: 'info' },
      RETURN:        { icon: 'rotate-ccw',      cls: 'update',  color: 'warn' },
      BUYBACK:       { icon: 'recycle',         cls: 'update',  color: 'warn' },
      SCAN:          { icon: 'scan-line',       cls: 'update',  color: 'info' },
      SYNC:          { icon: 'refresh-cw',      cls: 'update',  color: 'info' },
      PAYMENT:       { icon: 'banknote',        cls: 'update',  color: 'success' },
      SUPPLIER_RETURN: { icon: 'package-minus', cls: 'update',  color: 'warn' },
      MELTING_BATCH: { icon: 'flame',           cls: 'update',  color: 'warn' },
      POLISHING_BATCH: { icon: 'sparkles',      cls: 'update',  color: 'violet' },
      ASSAY:         { icon: 'test-tube',       cls: 'update',  color: 'info' },
    };

    return map[action] || { icon: 'activity', cls: 'update', color: 'muted' };
  }

  /**
   * قراءة لون CSS
   */
  function cssVar(name) {
    return getComputedStyle(document.documentElement)
      .getPropertyValue(name).trim();
  }

  function cleanupListeners() {
    AuditState.unsubscribers.forEach(fn => {
      try { fn(); } catch (_) {}
    });
    AuditState.unsubscribers = [];

    clearTimeout(AuditState.timers.search);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §3 · DATA LOADING
     ───────────────────────────────────────────────────────────────────── */

  async function loadAuditLogs() {
    try {
      AuditState.loading = true;

      /* 1 · الذاكرة المحلية من GMS.Audit */
      if (GMS.Audit && typeof GMS.Audit.getAll === 'function') {
        AuditState.allLogs = GMS.Audit.getAll() || [];
      }

      /* 2 · Supabase (إذا متاح + الصلاحية موجودة) */
      if (GMS.Supabase?.isReady() && GMS.Auth?.can('viewAuditLog')) {
        try {
          const client = GMS.Supabase.get();
          const { data, error } = await client
            .from(GMS.SUPABASE_CONFIG.TABLES.AUDIT_LOGS)
            .select('*')
            .order('created_at', { ascending: false })
            .limit(2000);

          if (!error && data?.length) {
            /* دمج مع المحلي */
            const localIds = new Set(AuditState.allLogs.map(l => l.id));
            const merged = [...AuditState.allLogs];

            data.forEach(row => {
              if (!localIds.has(row.id)) {
                merged.push({
                  id: row.id,
                  user_id: row.user_id,
                  user_name: row.user_name || '—',
                  user_role: row.user_role,
                  action: row.action,
                  entity_type: row.entity_type,
                  entity_id: row.entity_id,
                  description: row.description,
                  metadata: row.metadata || {},
                  branch_id: row.branch_id,
                  created_at: row.created_at,
                });
              }
            });

            merged.sort((a, b) =>
              new Date(b.created_at) - new Date(a.created_at)
            );
            AuditState.allLogs = merged;
          }
        } catch (e) {
          console.warn('[Audit] Supabase read failed:', e);
        }
      }

      /* 3 · Demo fallback — إن كان السجل فارغاً */
      if (!AuditState.allLogs.length && GMS.Demo) {
        AuditState.allLogs = generateDemoLogs();
      }

      updateStats();
      applyFilters();

      return AuditState.allLogs;

    } catch (e) {
      console.error('[Audit] loadAuditLogs:', e);
      return [];
    } finally {
      AuditState.loading = false;
    }
  }

  /**
   * توليد سجل تجريبي (للعرض في وضع Demo)
   */
  function generateDemoLogs() {
    const actions = ['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'APPROVE', 'REJECT', 'SHIFT_CLOSE', 'PAYMENT', 'RETURN', 'BUYBACK'];
    const roles = ['SUPER_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT', 'DATA_ENTRY', 'SALESPERSON'];
    const entities = ['sale', 'inventory', 'supplier', 'customer', 'shift', 'price_board', 'user'];
    const names = GMS.DEMO_SALESPEOPLE || ['أحمد محمود', 'سارة إبراهيم', 'منى علي'];

    const logs = [];

    for (let i = 0; i < 120; i++) {
      const action = actions[Math.floor(Math.random() * actions.length)];
      const role = roles[Math.floor(Math.random() * roles.length)];
      const entityType = entities[Math.floor(Math.random() * entities.length)];
      const userName = names[Math.floor(Math.random() * names.length)];
      const daysAgo = Math.floor(Math.random() * 30);
      const created = new Date(Date.now() - daysAgo * 86400000 - Math.floor(Math.random() * 86400) * 1000);

      const descriptions = {
        CREATE: `أنشأ ${entityType === 'sale' ? 'فاتورة' : 'سجل'} جديد`,
        UPDATE: `عدّل ${entityType === 'inventory' ? 'بيانات صنف' : entityType}`,
        DELETE: `حذف ${entityType}`,
        LOGIN: 'تسجيل دخول ناجح',
        APPROVE: `اعتمد ${entityType === 'sale' ? 'فاتورة بيع' : entityType}`,
        REJECT: `رفض ${entityType}`,
        SHIFT_CLOSE: 'أغلقت وردية',
        PAYMENT: 'سجل سداد',
        RETURN: 'مرتجع مبيعات',
        BUYBACK: 'شراء كسر',
      };

      logs.push({
        id: `demo-log-${i}`,
        user_id: `usr-${Math.floor(Math.random() * 5) + 1}`,
        user_name: userName,
        user_role: role,
        action,
        entity_type: entityType,
        entity_id: `ent-${Math.floor(Math.random() * 9999)}`,
        description: descriptions[action] || `${action} ${entityType}`,
        metadata: {
          timestamp: created.toISOString(),
          ip: `192.168.1.${Math.floor(Math.random() * 255)}`,
        },
        branch_id: ['br-1', 'br-2', 'br-3'][Math.floor(Math.random() * 3)],
        created_at: created.toISOString(),
      });
    }

    return logs.sort((a, b) =>
      new Date(b.created_at) - new Date(a.created_at)
    );
  }

  /* ═════════════════════════════════════════════════════════════════════
     §4 · STATS + FILTERS
     ───────────────────────────────────────────────────────────────────── */

  function updateStats() {
    const logs = AuditState.allLogs;
    const now = Date.now();
    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = now - 7 * 86400000;
    const monthAgo = now - 30 * 86400000;

    let todayCount = 0;
    let weekCount = 0;
    let monthCount = 0;
    const byAction = {};
    const byRole = {};
    const byEntity = {};
    const users = new Set();

    logs.forEach(l => {
      const ts = new Date(l.created_at).getTime();

      if (l.created_at.slice(0, 10) === today) todayCount++;
      if (ts > weekAgo) weekCount++;
      if (ts > monthAgo) monthCount++;

      byAction[l.action] = (byAction[l.action] || 0) + 1;
      if (l.user_role) byRole[l.user_role] = (byRole[l.user_role] || 0) + 1;
      if (l.entity_type) byEntity[l.entity_type] = (byEntity[l.entity_type] || 0) + 1;
      if (l.user_name) users.add(l.user_name);
    });

    AuditState.stats = {
      total: logs.length,
      today: todayCount,
      week: weekCount,
      month: monthCount,
      byAction,
      byRole,
      byEntity,
      uniqueUsers: users.size,
    };
  }

  function applyFilters() {
    const f = AuditState.filters;
    let rows = AuditState.allLogs.slice();

    /* Search */
    if (f.search) {
      const q = f.search.toLowerCase();
      rows = rows.filter(r =>
        (r.user_name || '').toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q) ||
        (r.entity_type || '').toLowerCase().includes(q) ||
        (r.action || '').toLowerCase().includes(q)
      );
    }

    /* Action */
    if (f.action) {
      rows = rows.filter(r => r.action === f.action);
    }

    /* Role */
    if (f.role) {
      rows = rows.filter(r => r.user_role === f.role);
    }

    /* Entity Type */
    if (f.entityType) {
      rows = rows.filter(r => r.entity_type === f.entityType);
    }

    /* User */
    if (f.user) {
      rows = rows.filter(r => r.user_name === f.user);
    }

    /* Date From */
    if (f.dateFrom) {
      rows = rows.filter(r =>
        r.created_at.slice(0, 10) >= f.dateFrom
      );
    }

    /* Date To */
    if (f.dateTo) {
      rows = rows.filter(r =>
        r.created_at.slice(0, 10) <= f.dateTo
      );
    }

    /* Pagination */
    AuditState.filtered = rows;
    AuditState.totalPages = Math.max(1, Math.ceil(rows.length / AuditState.pageSize));

    if (AuditState.page > AuditState.totalPages) {
      AuditState.page = AuditState.totalPages;
    }

    return rows;
  }

  function getPageItems() {
    const start = (AuditState.page - 1) * AuditState.pageSize;
    const end = start + AuditState.pageSize;
    return AuditState.filtered.slice(start, end);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §5 · RENDERERS
     ───────────────────────────────────────────────────────────────────── */

  function renderKPIs() {
    const s = AuditState.stats;

    return `
      <div class="kpi-row cols-4">
        <div class="kpi gold">
          <div class="kpi-label">
            <i data-lucide="scroll-text"></i>
            إجمالي الحركات
          </div>
          <div class="kpi-value">${GMS.intFmt(s.total)}</div>
          <div class="kpi-meta">
            <b>${GMS.intFmt(s.uniqueUsers)}</b> مستخدم نشط
          </div>
        </div>

        <div class="kpi info">
          <div class="kpi-label">
            <i data-lucide="calendar"></i>
            حركات اليوم
          </div>
          <div class="kpi-value">${GMS.intFmt(s.today)}</div>
          <div class="kpi-meta">
            <b>${GMS.intFmt(s.week)}</b> هذا الأسبوع
          </div>
        </div>

        <div class="kpi success">
          <div class="kpi-label">
            <i data-lucide="clock"></i>
            آخر 30 يوم
          </div>
          <div class="kpi-value">${GMS.intFmt(s.month)}</div>
          <div class="kpi-meta">
            متوسط يومي: <b>${GMS.intFmt(s.month / 30)}</b>
          </div>
        </div>

        <div class="kpi ${s.byAction?.DELETE > 5 ? 'danger' : 'violet'}">
          <div class="kpi-label">
            <i data-lucide="trash-2"></i>
            عمليات الحذف
          </div>
          <div class="kpi-value">${GMS.intFmt(s.byAction?.DELETE || 0)}</div>
          <div class="kpi-meta">
            تحتاج مراجعة دورية
          </div>
        </div>
      </div>
    `;
  }

  function renderActiveFilters() {
    const f = AuditState.filters;
    const chips = [];

    if (f.search) chips.push({ key: 'search', label: 'بحث', value: f.search });
    if (f.action) chips.push({ key: 'action', label: 'حركة', value: GMS.AUDIT_ACTIONS[f.action]?.label || f.action });
    if (f.role) chips.push({ key: 'role', label: 'دور', value: GMS.ROLES[f.role]?.label || f.role });
    if (f.entityType) chips.push({ key: 'entityType', label: 'كيان', value: f.entityType });
    if (f.user) chips.push({ key: 'user', label: 'مستخدم', value: f.user });
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
        <button class="btn btn-ghost btn-sm" id="audit-clear-all-filters"
                style="font-size:11px">
          <i data-lucide="x"></i> مسح الكل
        </button>
      </div>
    `;
  }

  function renderRow(log) {
    const meta = getActionMeta(log.action);
    const roleMeta = GMS.ROLES[log.user_role] || { label: log.user_role, icon: 'user-circle' };
    const actionLabel = GMS.AUDIT_ACTIONS[log.action]?.label || log.action;

    const time = new Date(log.created_at);
    const timeStr = time.toLocaleTimeString('ar-EG', {
      hour: '2-digit', minute: '2-digit',
    });
    const dateStr = GMS.dateAr(log.created_at);

    return `
      <tr data-audit-id="${GMS.esc(log.id)}" style="cursor:pointer">
        <td style="width:110px">
          <div style="display:flex;flex-direction:column;line-height:1.3">
            <span class="mono" style="font-weight:800;font-size:11.5px">
              ${GMS.esc(dateStr)}
            </span>
            <span class="mono" style="font-size:10px;color:var(--muted);
                        font-weight:600">
              ${GMS.esc(timeStr)}
            </span>
          </div>
        </td>

        <td style="width:170px">
          <div style="display:flex;align-items:center;gap:9px">
            <div style="width:30px;height:30px;border-radius:50%;
                        display:grid;place-items:center;flex-shrink:0;
                        background:var(--gold-grad);color:#2a1f05;
                        font-weight:900;font-size:11px">
              ${GMS.esc(GMS.initials(log.user_name || '?'))}
            </div>
            <div style="min-width:0">
              <div style="font-weight:800;font-size:12px;
                          white-space:nowrap;overflow:hidden;
                          text-overflow:ellipsis">
                ${GMS.esc(log.user_name || '—')}
              </div>
              <div style="font-size:10px;color:var(--muted);font-weight:700">
                ${GMS.esc(roleMeta.label || '—')}
              </div>
            </div>
          </div>
        </td>

        <td style="width:120px">
          <span class="audit-action-icon ${meta.cls}"
                style="display:inline-grid;place-items:center;
                       width:auto;padding:3px 10px;border-radius:20px;
                       gap:5px;font-size:10.5px;font-weight:800">
            <span style="display:flex;align-items:center;gap:5px">
              <i data-lucide="${meta.icon}" style="width:11px;height:11px"></i>
              ${GMS.esc(actionLabel)}
            </span>
          </span>
        </td>

        <td style="width:100px">
          <span style="font-family:var(--font-mono);font-size:11px;
                       font-weight:700;color:var(--muted)">
            ${GMS.esc(log.entity_type || '—')}
          </span>
        </td>

        <td style="font-size:12px;font-weight:600;
                    overflow:hidden;text-overflow:ellipsis">
          ${GMS.esc(log.description || '—')}
        </td>

        <td style="width:80px" class="col-c">
          <button class="row-act" data-view-audit="${GMS.esc(log.id)}"
                  title="عرض التفاصيل">
            <i data-lucide="eye"></i>
          </button>
        </td>
      </tr>
    `;
  }

  function renderTable() {
    const pageItems = getPageItems();

    if (!pageItems.length) {
      return `
        <div class="empty" style="padding:60px 20px">
          <i data-lucide="inbox"></i>
          <p>لا توجد سجلات مطابقة</p>
          <span>جرّب تعديل الفلاتر أو البحث بكلمة أخرى</span>
        </div>
      `;
    }

    return `
      <div class="table-wrap" style="border:none;border-radius:0;max-height:62vh">
        <table class="tbl">
          <thead>
            <tr>
              <th style="width:110px">التوقيت</th>
              <th style="width:170px">المستخدم</th>
              <th style="width:120px">الحركة</th>
              <th style="width:100px">الكيان</th>
              <th>البيان</th>
              <th style="width:80px" class="col-c">تفاصيل</th>
            </tr>
          </thead>
          <tbody>
            ${pageItems.map(renderRow).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderPagination() {
    const { page, totalPages, pageSize, filtered } = AuditState;

    if (totalPages <= 1) return '';

    const startIdx = (page - 1) * pageSize + 1;
    const endIdx = Math.min(page * pageSize, filtered.length);

    const pageButtons = [];
    const windowSize = 2;
    const from = Math.max(1, page - windowSize);
    const to = Math.min(totalPages, page + windowSize);

    const btn = (p, label, opts = {}) => `
      <button class="pg-btn ${opts.active ? 'active' : ''}"
              data-audit-page="${p}"
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

        <select class="pg-size" id="audit-page-size">
          ${[25, 50, 100, 250, 500].map(s => `
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

  function renderStatsPanel() {
    const s = AuditState.stats;
    const actionEntries = Object.entries(s.byAction || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);

    const roleEntries = Object.entries(s.byRole || {})
      .sort((a, b) => b[1] - a[1]);

    const entityEntries = Object.entries(s.byEntity || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);

    return `
      <div class="card" style="margin-bottom:16px">
        <div class="card-head">
          <h3>
            <i data-lucide="bar-chart-3"></i>
            إحصائيات السجل
          </h3>
          <div class="spacer" style="flex:1"></div>
          <span class="card-sub">توزيع الحركات حسب النوع والدور والكيان</span>
        </div>

        <div class="card-body">
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px">
            <!-- By Action -->
            <div>
              <div style="font-size:10.5px;font-weight:800;color:var(--muted);
                          text-transform:uppercase;letter-spacing:.5px;
                          margin-bottom:10px;display:flex;align-items:center;gap:6px">
                <i data-lucide="activity" style="width:12px;height:12px"></i>
                حسب نوع الحركة
              </div>
              ${actionEntries.length ? actionEntries.map(([action, count]) => {
                const meta = getActionMeta(action);
                const pct = s.total > 0 ? (count / s.total) * 100 : 0;
                return `
                  <div style="margin-bottom:9px">
                    <div style="display:flex;justify-content:space-between;
                                align-items:center;margin-bottom:4px">
                      <span style="font-size:11.5px;font-weight:700;
                                  display:flex;align-items:center;gap:5px">
                        <i data-lucide="${meta.icon}"
                           style="width:11px;height:11px;
                                  color:var(--${meta.color})"></i>
                        ${GMS.esc(GMS.AUDIT_ACTIONS[action]?.label || action)}
                      </span>
                      <span class="mono" style="font-size:11.5px;font-weight:900">
                        ${GMS.intFmt(count)}
                      </span>
                    </div>
                    <div style="height:5px;background:var(--surface-3);
                                border-radius:3px;overflow:hidden">
                      <div style="height:100%;width:${pct}%;
                                  background:var(--${meta.color});
                                  border-radius:3px"></div>
                    </div>
                  </div>
                `;
              }).join('') : `<div style="color:var(--muted);font-size:11.5px">
                لا توجد بيانات</div>`}
            </div>

            <!-- By Role -->
            <div>
              <div style="font-size:10.5px;font-weight:800;color:var(--muted);
                          text-transform:uppercase;letter-spacing:.5px;
                          margin-bottom:10px;display:flex;align-items:center;gap:6px">
                <i data-lucide="users" style="width:12px;height:12px"></i>
                حسب الدور
              </div>
              ${roleEntries.length ? roleEntries.map(([role, count]) => {
                const r = GMS.ROLES[role] || { label: role, icon: 'user' };
                const pct = s.total > 0 ? (count / s.total) * 100 : 0;
                return `
                  <div style="margin-bottom:9px">
                    <div style="display:flex;justify-content:space-between;
                                align-items:center;margin-bottom:4px">
                      <span style="font-size:11.5px;font-weight:700;
                                  display:flex;align-items:center;gap:5px">
                        <i data-lucide="${r.icon}"
                           style="width:11px;height:11px;
                                  color:var(--primary)"></i>
                        ${GMS.esc(r.label)}
                      </span>
                      <span class="mono" style="font-size:11.5px;font-weight:900">
                        ${GMS.intFmt(count)}
                      </span>
                    </div>
                    <div style="height:5px;background:var(--surface-3);
                                border-radius:3px;overflow:hidden">
                      <div style="height:100%;width:${pct}%;
                                  background:var(--primary);border-radius:3px"></div>
                    </div>
                  </div>
                `;
              }).join('') : `<div style="color:var(--muted);font-size:11.5px">
                لا توجد بيانات</div>`}
            </div>

            <!-- By Entity -->
            <div>
              <div style="font-size:10.5px;font-weight:800;color:var(--muted);
                          text-transform:uppercase;letter-spacing:.5px;
                          margin-bottom:10px;display:flex;align-items:center;gap:6px">
                <i data-lucide="layers" style="width:12px;height:12px"></i>
                حسب الكيان
              </div>
              ${entityEntries.length ? entityEntries.map(([entity, count]) => {
                const pct = s.total > 0 ? (count / s.total) * 100 : 0;
                return `
                  <div style="margin-bottom:9px">
                    <div style="display:flex;justify-content:space-between;
                                align-items:center;margin-bottom:4px">
                      <span class="mono" style="font-size:11px;font-weight:800">
                        ${GMS.esc(entity)}
                      </span>
                      <span class="mono" style="font-size:11.5px;font-weight:900">
                        ${GMS.intFmt(count)}
                      </span>
                    </div>
                    <div style="height:5px;background:var(--surface-3);
                                border-radius:3px;overflow:hidden">
                      <div style="height:100%;width:${pct}%;
                                  background:var(--info);border-radius:3px"></div>
                    </div>
                  </div>
                `;
              }).join('') : `<div style="color:var(--muted);font-size:11.5px">
                لا توجد بيانات</div>`}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §6 · MAIN RENDER
     ───────────────────────────────────────────────────────────────────── */

  function render(root) {
    /* Guard */
    if (GMS.Auth && !GMS.Auth.can('viewAuditLog')) {
      root.innerHTML = GMS.Guard.denied(
        'سجل الحركات محجوب',
        'لا تملك صلاحية عرض سجلات التدقيق. هذه الصلاحية متاحة للمدراء والمحاسبين فقط.'
      );
      window.lucide?.createIcons();
      return;
    }

    /* Unique users for filter */
    const uniqueUsers = Array.from(new Set(
      AuditState.allLogs.map(l => l.user_name).filter(Boolean)
    )).sort();

    const uniqueEntities = Array.from(new Set(
      AuditState.allLogs.map(l => l.entity_type).filter(Boolean)
    )).sort();

    root.innerHTML = `
      <div class="page-header">
        <h2>
          <i data-lucide="scroll-text"></i>
          ${GMS.t('audit.title')}
        </h2>
        <p>${GMS.t('audit.subtitle')}</p>
      </div>

      ${renderKPIs()}

      <!-- Filters Toolbar -->
      <div class="card" style="margin-bottom:16px">
        <div class="toolbar-row">
          <div class="search-wrap" style="flex:1;min-width:240px;max-width:380px">
            <i data-lucide="search"></i>
            <input id="audit-search-input"
                   placeholder="بحث بالاسم، البيان، الحركة…"
                   value="${GMS.esc(AuditState.filters.search)}"
                   autocomplete="off">
            ${AuditState.filters.search ? `
              <button class="search-clear" id="audit-search-clear">
                <i data-lucide="x"></i>
              </button>
            ` : ''}
          </div>

          <select class="filter-select" id="audit-filter-action"
                  style="min-width:150px">
            <option value="">كل الحركات</option>
            ${Object.entries(GMS.AUDIT_ACTIONS).map(([k, v]) => `
              <option value="${k}" ${AuditState.filters.action === k ? 'selected' : ''}>
                ${v.label}
              </option>
            `).join('')}
          </select>

          <select class="filter-select" id="audit-filter-role"
                  style="min-width:150px">
            <option value="">كل الأدوار</option>
            ${GMS.ROLE_KEYS.map(k => `
              <option value="${k}" ${AuditState.filters.role === k ? 'selected' : ''}>
                ${GMS.ROLES[k].label}
              </option>
            `).join('')}
          </select>

          <select class="filter-select" id="audit-filter-entity"
                  style="min-width:150px">
            <option value="">كل الكيانات</option>
            ${uniqueEntities.map(e => `
              <option value="${e}" ${AuditState.filters.entityType === e ? 'selected' : ''}>
                ${e}
              </option>
            `).join('')}
          </select>

          <div class="spacer" style="flex:1"></div>

          <button class="btn btn-sm" id="audit-toggle-live"
                  title="التحديث الحي">
            <i data-lucide="radio"></i>
            ${AuditState.liveEnabled ? 'مباشر' : 'موقوف'}
          </button>

          <button class="btn btn-sm" id="audit-export-btn">
            <i data-lucide="download"></i> تصدير
          </button>

          <button class="btn btn-sm btn-ghost" id="audit-refresh-btn">
            <i data-lucide="refresh-cw"></i>
          </button>
        </div>

        <!-- Row 2: Date range + users -->
        <div class="toolbar-row">
          <div class="field" style="min-width:150px;max-width:180px">
            <label style="font-size:10.5px">من تاريخ</label>
            <input type="date" id="audit-filter-from"
                   value="${GMS.esc(AuditState.filters.dateFrom)}"
                   style="padding:8px 12px">
          </div>

          <div class="field" style="min-width:150px;max-width:180px">
            <label style="font-size:10.5px">إلى تاريخ</label>
            <input type="date" id="audit-filter-to"
                   value="${GMS.esc(AuditState.filters.dateTo)}"
                   style="padding:8px 12px">
          </div>

          <select class="filter-select" id="audit-filter-user"
                  style="min-width:180px">
            <option value="">كل المستخدمين</option>
            ${uniqueUsers.map(u => `
              <option value="${u}" ${AuditState.filters.user === u ? 'selected' : ''}>
                ${u}
              </option>
            `).join('')}
          </select>

          <button class="btn btn-sm btn-ghost" id="audit-quick-today">
            اليوم
          </button>
          <button class="btn btn-sm btn-ghost" id="audit-quick-week">
            الأسبوع
          </button>
          <button class="btn btn-sm btn-ghost" id="audit-quick-month">
            30 يوم
          </button>

          <div class="spacer" style="flex:1"></div>

          <span class="chip info">
            <i data-lucide="database" style="width:12px;height:12px"></i>
            ${GMS.intFmt(AuditState.filtered.length)} سجل مطابق
          </span>

          <span class="pill pill-red">
            <i data-lucide="lock" style="width:10px;height:10px"></i>
            Append-Only
          </span>
        </div>

        ${renderActiveFilters()}
      </div>

      <!-- Stats Panel -->
      ${renderStatsPanel()}

      <!-- Table Card -->
      <div class="card">
        <div class="card-head">
          <h3>
            <i data-lucide="list"></i>
            السجل الكامل
          </h3>
          <div class="spacer" style="flex:1"></div>
          <span class="card-sub">
            الصفحة ${AuditState.page} من ${AuditState.totalPages}
          </span>
        </div>

        <div id="audit-table-host">
          ${renderTable()}
        </div>

        <div id="audit-pagination-host">
          ${renderPagination()}
        </div>
      </div>
    `;

    window.lucide?.createIcons();
    bindControls();
    bindLiveUpdates();
  }

  function refreshTable() {
    const tableHost = document.getElementById('audit-table-host');
    if (tableHost) {
      tableHost.innerHTML = renderTable();
      window.lucide?.createIcons();
      bindTableEvents();
    }

    const pagHost = document.getElementById('audit-pagination-host');
    if (pagHost) {
      pagHost.innerHTML = renderPagination();
      window.lucide?.createIcons();
      bindPaginationEvents();
    }

    setText('.card-head .card-sub',
      `الصفحة ${AuditState.page} من ${AuditState.totalPages}`);

    /* Update info chip */
    const infoChip = document.querySelector('.chip.info');
    if (infoChip) {
      infoChip.innerHTML = `
        <i data-lucide="database" style="width:12px;height:12px"></i>
        ${GMS.intFmt(AuditState.filtered.length)} سجل مطابق
      `;
      window.lucide?.createIcons();
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §7 · CONTROLS BINDING
     ───────────────────────────────────────────────────────────────────── */

  function bindControls() {
    /* Search */
    const searchInput = document.getElementById('audit-search-input');
    if (searchInput) {
      searchInput.oninput = (e) => {
        clearTimeout(AuditState.timers.search);
        AuditState.timers.search = setTimeout(() => {
          AuditState.filters.search = e.target.value.trim();
          AuditState.page = 1;
          applyFilters();
          refreshTable();
        }, 250);
      };
    }

    /* Clear search */
    const clearBtn = document.getElementById('audit-search-clear');
    if (clearBtn) {
      clearBtn.onclick = () => {
        AuditState.filters.search = '';
        AuditState.page = 1;
        applyFilters();
        render(document.getElementById('page'));
      };
    }

    /* Filters */
    const filterMap = {
      'audit-filter-action': 'action',
      'audit-filter-role': 'role',
      'audit-filter-entity': 'entityType',
      'audit-filter-user': 'user',
    };

    Object.entries(filterMap).forEach(([id, key]) => {
      const el = document.getElementById(id);
      if (!el) return;

      el.onchange = () => {
        AuditState.filters[key] = el.value;
        AuditState.page = 1;
        applyFilters();
        refreshTable();
      };
    });

    /* Date inputs */
    const fromInput = document.getElementById('audit-filter-from');
    if (fromInput) {
      fromInput.onchange = () => {
        AuditState.filters.dateFrom = fromInput.value;
        AuditState.page = 1;
        applyFilters();
        refreshTable();
      };
    }

    const toInput = document.getElementById('audit-filter-to');
    if (toInput) {
      toInput.onchange = () => {
        AuditState.filters.dateTo = toInput.value;
        AuditState.page = 1;
        applyFilters();
        refreshTable();
      };
    }

    /* Quick ranges */
    const todayBtn = document.getElementById('audit-quick-today');
    if (todayBtn) {
      todayBtn.onclick = () => {
        const today = GMS.todayISO();
        AuditState.filters.dateFrom = today;
        AuditState.filters.dateTo = today;
        AuditState.page = 1;
        applyFilters();
        render(document.getElementById('page'));
      };
    }

    const weekBtn = document.getElementById('audit-quick-week');
    if (weekBtn) {
      weekBtn.onclick = () => {
        AuditState.filters.dateFrom = GMS.daysAgoISO(7);
        AuditState.filters.dateTo = GMS.todayISO();
        AuditState.page = 1;
        applyFilters();
        render(document.getElementById('page'));
      };
    }

    const monthBtn = document.getElementById('audit-quick-month');
    if (monthBtn) {
      monthBtn.onclick = () => {
        AuditState.filters.dateFrom = GMS.daysAgoISO(30);
        AuditState.filters.dateTo = GMS.todayISO();
        AuditState.page = 1;
        applyFilters();
        render(document.getElementById('page'));
      };
    }

    /* Clear individual filters */
    document.querySelectorAll('[data-clear-filter]').forEach(btn => {
      btn.onclick = () => {
        const key = btn.dataset.clearFilter;
        AuditState.filters[key] = '';
        AuditState.page = 1;
        applyFilters();
        render(document.getElementById('page'));
      };
    });

    /* Clear all */
    const clearAllBtn = document.getElementById('audit-clear-all-filters');
    if (clearAllBtn) {
      clearAllBtn.onclick = () => {
        AuditState.filters = {
          search: '',
          action: '',
          role: '',
          entityType: '',
          dateFrom: '',
          dateTo: '',
          user: '',
        };
        AuditState.page = 1;
        applyFilters();
        render(document.getElementById('page'));
      };
    }

    /* Live toggle */
    const liveBtn = document.getElementById('audit-toggle-live');
    if (liveBtn) {
      liveBtn.onclick = () => {
        AuditState.liveEnabled = !AuditState.liveEnabled;
        render(document.getElementById('page'));
      };
    }

    /* Refresh */
    const refreshBtn = document.getElementById('audit-refresh-btn');
    if (refreshBtn) {
      refreshBtn.onclick = async () => {
        refreshBtn.classList.add('spinning');
        try {
          await loadAuditLogs();
          refreshTable();
          updateStats();

          /* تحديث KPIs */
          const kpiHost = document.querySelector('.kpi-row');
          if (kpiHost) {
            kpiHost.outerHTML = renderKPIs();
            window.lucide?.createIcons();
          }

          GMS.Toast.ok('تم تحديث السجل');
        } catch (e) {
          GMS.Toast.err('فشل التحديث', e.message);
        } finally {
          refreshBtn.classList.remove('spinning');
        }
      };
    }

    /* Export */
    const exportBtn = document.getElementById('audit-export-btn');
    if (exportBtn) {
      exportBtn.onclick = () => exportAudit();
    }

    /* Table + Pagination */
    bindTableEvents();
    bindPaginationEvents();
  }

  function bindTableEvents() {
    /* Row click → details */
    document.querySelectorAll('tr[data-audit-id]').forEach(tr => {
      tr.onclick = (e) => {
        if (e.target.closest('button')) return;
        const id = tr.dataset.auditId;
        showAuditDetails(id);
      };
    });

    /* View button */
    document.querySelectorAll('[data-view-audit]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        showAuditDetails(btn.dataset.viewAudit);
      };
    });
  }

  function bindPaginationEvents() {
    document.querySelectorAll('[data-audit-page]').forEach(btn => {
      btn.onclick = () => {
        const page = Number(btn.dataset.auditPage);
        if (page < 1 || page > AuditState.totalPages) return;

        AuditState.page = page;
        refreshTable();

        document.getElementById('audit-table-host')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      };
    });

    const sizeSelect = document.getElementById('audit-page-size');
    if (sizeSelect) {
      sizeSelect.onchange = () => {
        AuditState.pageSize = Number(sizeSelect.value);
        AuditState.page = 1;
        applyFilters();
        refreshTable();
      };
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §8 · DETAILS MODAL
     ───────────────────────────────────────────────────────────────────── */

  function showAuditDetails(id) {
    const log = AuditState.allLogs.find(l => l.id === id);
    if (!log) return;

    const meta = getActionMeta(log.action);
    const roleMeta = GMS.ROLES[log.user_role] || { label: log.user_role, icon: 'user' };
    const actionLabel = GMS.AUDIT_ACTIONS[log.action]?.label || log.action;

    /* Metadata table */
    const metaEntries = Object.entries(log.metadata || {});
    const metaHTML = metaEntries.length ? metaEntries.map(([k, v]) => {
      let value = v;
      if (typeof v === 'object') value = JSON.stringify(v, null, 2);
      else value = String(v);

      return `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid var(--border);
                      background:var(--surface-2);font-weight:700;font-size:11.5px;
                      font-family:var(--font-mono);width:180px">
            ${GMS.esc(k)}
          </td>
          <td style="padding:8px 12px;border-bottom:1px solid var(--border);
                      font-family:var(--font-mono);font-size:11.5px;
                      word-break:break-all">
            <pre style="margin:0;white-space:pre-wrap;
                        font-family:var(--font-mono);font-size:11px">${GMS.esc(value)}</pre>
          </td>
        </tr>
      `;
    }).join('') : `
      <tr>
        <td colspan="2" style="text-align:center;padding:20px;
                    color:var(--muted);font-size:11.5px;
                    font-weight:600">
          لا توجد بيانات إضافية
        </td>
      </tr>
    `;

    GMS.Modal.open({
      title: `تفاصيل الحركة — ${actionLabel}`,
      icon: meta.icon,
      size: 'lg',
      body: `
        <!-- Header -->
        <div style="display:flex;align-items:center;gap:14px;
                    padding:14px 16px;background:var(--surface-2);
                    border-radius:12px;margin-bottom:18px;
                    border:1px solid var(--border)">
          <div class="audit-action-icon ${meta.cls}"
               style="width:48px;height:48px;border-radius:14px;
                      display:grid;place-items:center;flex-shrink:0">
            <i data-lucide="${meta.icon}" style="width:22px;height:22px"></i>
          </div>

          <div style="flex:1;min-width:0">
            <div style="font-size:15px;font-weight:900;
                        letter-spacing:-.2px">
              ${GMS.esc(actionLabel)}
            </div>
            <div style="font-size:11.5px;color:var(--muted);
                        font-weight:700;margin-top:3px">
              ${GMS.dateTimeAr(log.created_at)} ·
              ${GMS.timeAgo(log.created_at)}
            </div>
          </div>
        </div>

        <!-- User -->
        <div style="display:grid;grid-template-columns:1fr 1fr;
                    gap:12px;margin-bottom:18px">
          <div style="padding:12px 14px;background:var(--surface-2);
                      border-radius:10px;border:1px solid var(--border)">
            <div style="font-size:10.5px;font-weight:800;color:var(--muted);
                        text-transform:uppercase;letter-spacing:.4px">
              المستخدم
            </div>
            <div style="display:flex;align-items:center;gap:9px;margin-top:8px">
              <div style="width:34px;height:34px;border-radius:50%;
                          display:grid;place-items:center;
                          background:var(--gold-grad);color:#2a1f05;
                          font-weight:900;font-size:12px">
                ${GMS.esc(GMS.initials(log.user_name || '?'))}
              </div>
              <div>
                <div style="font-weight:800;font-size:13px">
                  ${GMS.esc(log.user_name || '—')}
                </div>
                <div style="font-size:11px;color:var(--muted);font-weight:700">
                  <i data-lucide="${roleMeta.icon}"
                     style="width:10px;height:10px;display:inline;
                            vertical-align:-1px"></i>
                  ${GMS.esc(roleMeta.label || '—')}
                </div>
              </div>
            </div>
          </div>

          <div style="padding:12px 14px;background:var(--surface-2);
                      border-radius:10px;border:1px solid var(--border)">
            <div style="font-size:10.5px;font-weight:800;color:var(--muted);
                        text-transform:uppercase;letter-spacing:.4px">
              الكيان المتأثر
            </div>
            <div class="mono" style="font-size:15px;font-weight:900;
                        margin-top:8px;letter-spacing:-.2px">
              ${GMS.esc(log.entity_type || '—')}
            </div>
            ${log.entity_id ? `
              <div class="mono" style="font-size:10.5px;
                          color:var(--muted);font-weight:700;margin-top:3px">
                ID: ${GMS.esc(String(log.entity_id).slice(0, 16))}
              </div>
            ` : ''}
          </div>
        </div>

        <!-- Description -->
        <div style="margin-bottom:18px">
          <div style="font-size:10.5px;font-weight:800;color:var(--muted);
                      text-transform:uppercase;letter-spacing:.5px;
                      margin-bottom:9px">
            البيان
          </div>
          <div style="padding:14px 16px;background:var(--surface-2);
                      border-radius:10px;
                      border-inline-start:3px solid var(--primary);
                      font-size:13px;font-weight:600;line-height:1.7">
            ${GMS.esc(log.description || '—')}
          </div>
        </div>

        <!-- Metadata -->
        <div>
          <div style="font-size:10.5px;font-weight:800;color:var(--muted);
                      text-transform:uppercase;letter-spacing:.5px;
                      margin-bottom:9px;display:flex;align-items:center;gap:6px">
            <i data-lucide="code" style="width:12px;height:12px"></i>
            البيانات الإضافية (Metadata)
          </div>
          <div style="border:1px solid var(--border);border-radius:10px;
                      overflow:hidden">
            <table style="width:100%;border-collapse:separate;
                          border-spacing:0;font-size:12px">
              <tbody>${metaHTML}</tbody>
            </table>
          </div>
        </div>

        <!-- ID -->
        <div style="margin-top:16px;padding:10px 14px;
                    background:var(--surface-3);border-radius:9px;
                    font-size:10.5px;color:var(--muted);font-weight:700;
                    font-family:var(--font-mono)">
          Log ID: ${GMS.esc(log.id)}
        </div>
      `,
      footer: `
        <button class="btn" data-close>إغلاق</button>
        <button class="btn btn-ghost" id="audit-copy-json">
          <i data-lucide="copy"></i> نسخ JSON
        </button>
      `,
      onMount: (el, close) => {
        el.querySelector('#audit-copy-json').onclick = async () => {
          const json = JSON.stringify(log, null, 2);
          const ok = await GMS.copyToClipboard(json);
          if (ok) GMS.Toast.ok('تم نسخ البيانات');
        };
      },
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §9 · LIVE UPDATES
     ───────────────────────────────────────────────────────────────────── */

  function bindLiveUpdates() {
    if (!GMS.Realtime || !AuditState.liveEnabled) return;

    const unsub = GMS.Realtime.on('event', (event) => {
      if (GMS.Router?.current() !== 'audit') return;
      if (!AuditState.liveEnabled) return;

      /* أضف الحركة الجديدة للقائمة */
      if (event.action === 'INSERT' && event.table === 'audit_logs') {
        setTimeout(async () => {
          await loadAuditLogs();
          refreshTable();
        }, 500);
      }
    });

    AuditState.unsubscribers.push(unsub);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §10 · EXPORT
     ───────────────────────────────────────────────────────────────────── */

  function exportAudit() {
    if (!window.XLSX) {
      GMS.Toast.err('محرك Excel غير متاح');
      return;
    }

    const rows = AuditState.filtered;

    if (!rows.length) {
      GMS.Toast.warn('لا توجد بيانات للتصدير');
      return;
    }

    try {
      /* Main data sheet */
      const data = rows.map(l => ({
        'التاريخ والوقت': GMS.dateTimeAr(l.created_at),
        'المستخدم': l.user_name || '',
        'الدور': GMS.ROLES[l.user_role]?.label || l.user_role || '',
        'الحركة': GMS.AUDIT_ACTIONS[l.action]?.label || l.action,
        'الكيان': l.entity_type || '',
        'البيان': l.description || '',
        'معرف الكيان': l.entity_id || '',
        'الفرع': l.branch_id || '',
      }));

      const ws = XLSX.utils.json_to_sheet(data);
      ws['!cols'] = [
        { wch: 20 }, { wch: 22 }, { wch: 18 }, { wch: 16 },
        { wch: 16 }, { wch: 50 }, { wch: 20 }, { wch: 12 },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'سجل التدقيق');

      /* Filters sheet */
      const filtersData = Object.entries(AuditState.filters)
        .filter(([, v]) => v)
        .map(([k, v]) => [k, v]);

      if (filtersData.length) {
        const wsFilters = XLSX.utils.aoa_to_sheet([
          ['الفلاتر المُطبَّقة'],
          ...filtersData,
        ]);
        wsFilters['!cols'] = [{ wch: 20 }, { wch: 30 }];
        XLSX.utils.book_append_sheet(wb, wsFilters, 'الفلاتر');
      }

      /* Stats sheet */
      const statsData = [
        ['إحصائيات السجل'],
        [''],
        ['المؤشر', 'القيمة'],
        ['إجمالي الحركات', AuditState.stats.total],
        ['حركات اليوم', AuditState.stats.today],
        ['هذا الأسبوع', AuditState.stats.week],
        ['آخر 30 يوم', AuditState.stats.month],
        ['عدد المستخدمين', AuditState.stats.uniqueUsers],
        [''],
        ['حسب نوع الحركة', ''],
        ...Object.entries(AuditState.stats.byAction || {})
          .sort((a, b) => b[1] - a[1])
          .map(([action, count]) => [
            GMS.AUDIT_ACTIONS[action]?.label || action, count,
          ]),
        [''],
        ['حسب الدور', ''],
        ...Object.entries(AuditState.stats.byRole || {})
          .sort((a, b) => b[1] - a[1])
          .map(([role, count]) => [GMS.ROLES[role]?.label || role, count]),
      ];

      const wsStats = XLSX.utils.aoa_to_sheet(statsData);
      wsStats['!cols'] = [{ wch: 30 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(wb, wsStats, 'الإحصائيات');

      XLSX.writeFile(wb, `audit_log_${GMS.todayISO()}.xlsx`);
      GMS.Toast.ok(`تم تصدير ${rows.length} سجل`);

      /* Audit the export itself */
      if (GMS.Audit) {
        GMS.Audit.log('EXPORT', 'audit_logs', null,
          `تصدير ${rows.length} سجل تدقيق إلى Excel`,
          { count: rows.length });
      }

    } catch (e) {
      console.error('[Audit.export]', e);
      GMS.Toast.err('فشل التصدير', e.message);
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §11 · INIT & CLEANUP
     ───────────────────────────────────────────────────────────────────── */

  async function init() {
    await loadAuditLogs();
  }

  function cleanup() {
    cleanupListeners();
  }

  /* ═════════════════════════════════════════════════════════════════════
     §12 · VIEW REGISTRATION
     ═════════════════════════════════════════════════════════════════════ */
  GMS.Views = GMS.Views || {};

  GMS.Views.audit = {
    render: async (root) => {
      await init();
      render(root);
    },
    cleanup,
    state: AuditState,

    /* Data */
    load: loadAuditLogs,
    reload: init,
    applyFilters,
    updateStats,

    /* Actions */
    showDetails: showAuditDetails,

    /* Export */
    export: exportAudit,

    /* Helpers */
    getActionMeta,
    generateDemoLogs,
  };

  /* ═════════════════════════════════════════════════════════════════════
     §13 · LOADED CONFIRMATION
     ═════════════════════════════════════════════════════════════════════ */
  console.log(
    '%c📜 Audit View loaded · Immutable trail',
    'color:#6b3fa0;font-weight:800;font-size:12px;padding:1px 5px;' +
    'background:#f0e9fa;border-radius:4px;'
  );

  console.log(
    `%c🔒 Append-only · 7 filters · Pagination · Details · Real-time · Export`,
    'color:#6b7a95;font-weight:700;font-size:11px;'
  );

  /* ═════════════════════════════════════════════════════════════════════
     ✅ js/19-views-audit.js — نهاية الملف
     ═════════════════════════════════════════════════════════════════════ */

})();