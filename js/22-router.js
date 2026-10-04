/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ENTERPRISE — js/22-router.js
   الراوتر الرئيسي:
     - التنقل بين الصفحات (Hash-based routing)
     - إدارة الصلاحيات قبل الدخول
     - Cleanup تلقائي للصفحة السابقة
     - Active tab management
     - Page title/subtitle update
     - Scheduled rerender (debounced)
     - Navigation history
     - Browser back/forward
     - Route guards
     - ✅ Form Interaction Tracker (يحمي النماذج والفلاتر أثناء التفاعل)
     - ✅ v2: reload({force}) + renderView backup/restore (منع الشاشة البيضاء)
     - ✅ v3: إضافة مسار b2b (بياعي الجملة المستقلين)
     - ✅ v4 (NEW): Pointer + Selection guards
       • shouldSkipRerender يحترم highlight + pointerdown حديث
       • Form tracker يسجّل pointerdown + selectionchange
       • Guards أقوى (3000ms من pointer، 5000ms من form)
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const GMS = window.GMS = window.GMS || {};

  /* ═════════════════════════════════════════════════════════════════════
     §1 · ROUTES DEFINITION
     ═════════════════════════════════════════════════════════════════════ */
  const ROUTES = {
    dashboard: {
      id: 'dashboard',
      label: 'لوحة التحكم',
      subtitle: 'نظرة عامة على الأداء',
      icon: 'layout-dashboard',
      view: 'dashboard',
      permission: null,
      roles: null,
      hidden: false,
      default: true,
    },

    pos: {
      id: 'pos',
      label: 'نقطة البيع',
      subtitle: 'إنشاء فاتورة بيع جديدة',
      icon: 'scan-line',
      view: 'pos',
      permission: 'createSale',
      roles: null,
      hidden: false,
    },

    inventory: {
      id: 'inventory',
      label: 'المخزون',
      subtitle: 'إدارة مخزون الذهب والمجوهرات',
      icon: 'gem',
      view: 'inventory',
      permission: 'viewInventory',
      roles: null,
      hidden: false,
    },

    suppliers: {
      id: 'suppliers',
      label: 'الموردين',
      subtitle: 'أرصدة الذهب والنقد للموردين',
      icon: 'factory',
      view: 'suppliers',
      permission: 'viewSuppliers',
      roles: null,
      hidden: false,
    },

    returns: {
      id: 'returns',
      label: 'المرتجعات',
      subtitle: 'مرتجع مبيعات · شراء كسر · مرتجع موردين',
      icon: 'rotate-ccw',
      view: 'returns',
      permission: 'viewInventory',
      roles: null,
      hidden: false,
    },

    analytics: {
      id: 'analytics',
      label: 'التحليلات',
      subtitle: 'تحليلات ذكية وتشخيص الركود',
      icon: 'bar-chart-3',
      view: 'analytics',
      permission: 'viewReports',
      roles: null,
      hidden: false,
    },

    loss: {
      id: 'loss',
      label: 'إدارة الخسس',
      subtitle: 'سبك · ششني · تحميم · دفتر تشغيلي',
      icon: 'flame',
      view: 'loss',
      permission: 'editInventory',
      roles: null,
      hidden: false,
    },

    repair: {
      id: 'repair',
      label: 'الصيانة والورشة',
      subtitle: 'تصليح · توسيع · تضييق · ركوب فصوص',
      icon: 'wrench',
      view: 'repair',
      permission: 'viewInventory',
      roles: null,
      hidden: false,
    },

    audit: {
      id: 'audit',
      label: 'سجل الحركات',
      subtitle: 'سجل غير قابل للتعديل',
      icon: 'scroll-text',
      view: 'audit',
      permission: 'viewAuditLog',
      roles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT'],
      hidden: false,
    },

    accounting: {
      id: 'accounting',
      label: 'المحاسبة والمالية',
      subtitle: 'دفتر اليومية المزدوج — نقد + ذهب',
      icon: 'book-open',
      view: 'accounting',
      permission: 'viewProfitReport',
      roles: null,
      hidden: false,
    },

    wholesale: {
      id: 'wholesale',
      label: 'التوريد والجملة',
      subtitle: 'بيع بالجملة · تحويلات بين الفروع · مقايضة',
      icon: 'truck',
      view: 'wholesale',
      permission: 'createSale',
      roles: null,
      hidden: false,
    },

    /* ✅ وحدة بياعي الجملة المستقلين (Multi-Tenant B2B) */
    b2b: {
      id: 'b2b',
      label: 'بياعو الجملة',
      subtitle: 'كيانات B2B مستقلة بخزائن منفصلة',
      icon: 'user-check',
      view: 'b2b',
      permission: 'viewB2BCustomers',
      roles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT', 'B2B_REP'],
      hidden: false,
    },

    queue: {
      id: 'queue',
      label: 'المزامنة',
      subtitle: 'الفواتير المعلقة',
      icon: 'package-open',
      view: 'queue',
      permission: null,
      roles: null,
      hidden: false,
    },

    settings: {
      id: 'settings',
      label: 'الإعدادات',
      subtitle: 'الأسعار، الماركات، الفروع، الاتصال',
      icon: 'settings',
      view: 'settings',
      permission: null,
      roles: null,
      hidden: false,
    },
  };

  /* ✅ ترتيب التبويبات في الواجهة */
  const TAB_ORDER = [
    'dashboard',
    'pos',
    'inventory',
    'suppliers',
    'returns',
    'analytics',
    'loss',
    'repair',
    'audit',
    'accounting',
    'wholesale',
    'b2b',
    'queue',
    'settings',
  ];

  /* ═════════════════════════════════════════════════════════════════════
     §2 · ROUTER STATE
     ═════════════════════════════════════════════════════════════════════ */
  const RState = {
    current: null,
    previous: null,
    initialized: false,
    rendering: false,
    lastRenderAt: null,

    scheduledRerender: null,
    scheduledDelay: 400,
    suspended: false,

    history: [],
    maxHistory: 30,

    listeners: {
      beforeNavigate: new Set(),
      afterNavigate: new Set(),
      navigationBlocked: new Set(),
      renderError: new Set(),
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §3 · HELPERS
     ═════════════════════════════════════════════════════════════════════ */

  function getHashRoute() {
    const hash = location.hash || '';
    if (!hash) return '';
    return hash.replace(/^#\/?/, '').split('?')[0].trim();
  }

  function setHashRoute(route) {
    const newHash = '#/' + route;
    if (location.hash !== newHash) {
      history.pushState(null, '', newHash);
    }
  }

  function checkRouteAccess(route) {
    if (!route) {
      return { allowed: false, reason: 'ROUTE_NOT_FOUND' };
    }

    if (!GMS.Auth?.profile) {
      return { allowed: true, reason: '' };
    }

    if (route.permission && !GMS.Auth.can(route.permission)) {
      return {
        allowed: false,
        reason: 'PERMISSION_DENIED',
        message: `لا تملك صلاحية الوصول لهذه الصفحة (${route.label})`,
      };
    }

    if (route.roles && route.roles.length > 0) {
      const userRole = GMS.Auth.profile.role;
      if (!route.roles.includes(userRole)) {
        return {
          allowed: false,
          reason: 'ROLE_NOT_ALLOWED',
          message: `هذه الصفحة متاحة لأدوار محددة فقط (${route.label})`,
        };
      }
    }

    return { allowed: true, reason: '' };
  }

  function emit(event, data) {
    const set = RState.listeners[event];
    if (!set) return;
    set.forEach(fn => {
      try { fn(data); } catch (e) { console.error(`[Router.emit:${event}]`, e); }
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §3.5 · FORM INTERACTION TRACKER — ✅ v4 (Pointer + Selection)
     ─────────────────────────────────────────────────────────────────────
     بيسجّل:
       • focusin / keydown / input / change (الحقول)
       • pointerdown / mousedown / touchstart (أي عنصر)
       • selectionchange (highlight بالماوس)
     ═════════════════════════════════════════════════════════════════════ */
  (function initFormTracker() {
    const markInteraction = () => {
      window.GMS = window.GMS || {};
      window.GMS._lastFormInteraction = Date.now();
      window.GMS._lastInteraction = Date.now();
    };

    const markPointer = () => {
      window.GMS = window.GMS || {};
      window.GMS._lastPointer = Date.now();
      window.GMS._lastInteraction = Date.now();
    };

    /* ─── الحقول ─── */
    ['focusin', 'keydown', 'input', 'change'].forEach(evt => {
      document.addEventListener(evt, (e) => {
        const target = e.target;
        if (!target) return;

        const tag = target.tagName;
        if (
          tag === 'INPUT' ||
          tag === 'SELECT' ||
          tag === 'TEXTAREA' ||
          target.isContentEditable
        ) {
          markInteraction();
        }
      }, true);
    });

    /* ─── ✅ NEW: pointerdown/mousedown على أي عنصر ─── */
    document.addEventListener('pointerdown', markPointer, true);
    document.addEventListener('mousedown', markPointer, true);
    document.addEventListener('touchstart', markPointer, {
      capture: true,
      passive: true,
    });

    /* ─── ✅ NEW: selectionchange (highlight بالماوس) ─── */
    document.addEventListener('selectionchange', markInteraction, true);

    console.log('[Router] ✅ Form interaction tracker active (v4 — pointer + selection)');
  })();

  /* ═════════════════════════════════════════════════════════════════════
     §4 · CORE NAVIGATION
     ═════════════════════════════════════════════════════════════════════ */

  async function go(routeId, opts = {}) {
    const { force = false, replace = false } = opts;

    const route = ROUTES[routeId];
    if (!route) {
      console.warn('[Router] Unknown route:', routeId);
      return go('dashboard');
    }

    if (RState.current === routeId && !force) {
      if (GMS.Modal) GMS.Modal.closeAll();
      return true;
    }

    const navData = {
      from: RState.current,
      to: routeId,
      route,
    };
    emit('beforeNavigate', navData);

    if (!force) {
      const access = checkRouteAccess(route);

      if (!access.allowed) {
        console.warn('[Router] Access denied:', access.reason, routeId);

        GMS.Toast?.warn(
          'غير مصرح',
          access.message || 'لا يمكن الوصول لهذه الصفحة'
        );

        emit('navigationBlocked', { ...navData, reason: access.reason });

        if (routeId !== 'dashboard') {
          return go('dashboard', { force: true });
        }
        return false;
      }
    }

    if (GMS.Modal && (RState.current !== routeId || force)) {
      GMS.Modal.closeAll();
    }

    if (RState.current && (RState.current !== routeId || force)) {
      try {
        const currentView = GMS.Views?.[ROUTES[RState.current]?.view];
        if (currentView?.cleanup && typeof currentView.cleanup === 'function') {
          currentView.cleanup();
        }
      } catch (e) {
        console.warn('[Router] Cleanup failed:', e);
      }
    }

    RState.previous = RState.current;
    RState.current = routeId;
    RState.rendering = true;

    updateActiveTab(routeId);
    updatePageTitle(route);

    if (replace) {
      history.replaceState(null, '', '#/' + routeId);
    } else {
      setHashRoute(routeId);
    }

    pushHistory({
      route: routeId,
      at: new Date().toISOString(),
    });

    try {
      await renderView(route);

      RState.lastRenderAt = new Date().toISOString();

      emit('afterNavigate', {
        ...navData,
        success: true,
      });

      RState.rendering = false;
      return true;

    } catch (e) {
      console.error('[Router] Render failed:', e);

      renderError(route, e);

      emit('renderError', { ...navData, error: e.message });

      emit('afterNavigate', {
        ...navData,
        success: false,
        error: e.message,
      });

      RState.rendering = false;
      return false;
    }
  }

  async function renderView(route) {
    const host = document.getElementById('page');
    if (!host) {
      throw new Error('عنصر #page غير موجود');
    }

    const backup = host.innerHTML;
    const view = GMS.Views?.[route.view];

    if (!view) {
      throw new Error(`View "${route.view}" غير معرّف`);
    }

    try {
      if (typeof view.render === 'function') {
        await view.render(host);
      } else if (typeof view.mount === 'function') {
        await view.mount(host);
      } else {
        throw new Error(`View "${route.view}" لا يحتوي على دالة render`);
      }

      if (!host.innerHTML.trim() || host.innerHTML.trim().length < 30) {
        console.warn('[Router] View rendered empty content — restoring backup');
        host.innerHTML = backup || `
          <div class="empty" style="padding:60px 20px">
            <i data-lucide="inbox"></i>
            <p>لا يوجد محتوى</p>
          </div>`;
      }

      window.lucide?.createIcons();

    } catch (e) {
      if (backup && backup.trim().length > 30) {
        host.innerHTML = backup;
        window.lucide?.createIcons();
      }
      throw e;
    }
  }

  function renderError(route, error) {
    const host = document.getElementById('page');
    if (!host) return;

    host.innerHTML = `
      <div class="page-header">
        <h2>
          <i data-lucide="alert-circle" style="color:var(--danger)"></i>
          خطأ في تحميل الصفحة
        </h2>
        <p>${GMS.esc(route.label)}</p>
      </div>

      <div class="card">
        <div class="card-body">
          <div class="empty" style="padding:50px 20px">
            <i data-lucide="alert-octagon"
               style="color:var(--danger);width:52px;height:52px;
                      opacity:.6"></i>
            <p style="font-size:16px;margin-top:12px">
              تعذّر تحميل الصفحة
            </p>
            <span style="color:var(--danger);
                        font-family:var(--font-mono);font-size:12px;
                        padding:8px 14px;background:var(--danger-bg);
                        border-radius:8px;display:inline-block;
                        margin-top:12px;font-weight:700">
              ${GMS.esc(error.message || 'خطأ غير معروف')}
            </span>

            <div style="margin-top:20px;display:flex;gap:9px;
                        justify-content:center">
              <button class="btn btn-primary" id="route-retry">
                <i data-lucide="refresh-cw"></i>
                إعادة المحاولة
              </button>
              <button class="btn" id="route-home">
                <i data-lucide="home"></i>
                العودة للرئيسية
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    window.lucide?.createIcons();

    document.getElementById('route-retry')?.addEventListener('click', () => {
      go(route.id, { force: true });
    });

    document.getElementById('route-home')?.addEventListener('click', () => {
      go('dashboard');
    });
  }

  function updateActiveTab(routeId) {
    document.querySelectorAll('[data-tab]').forEach(tab => {
      const isActive = tab.dataset.tab === routeId;
      tab.classList.toggle('active', isActive);
    });
  }

  function updatePageTitle(route) {
    const titleEl = document.getElementById('page-title');
    const subtitleEl = document.getElementById('page-sub');

    if (titleEl) titleEl.textContent = route.label || '';
    if (subtitleEl) subtitleEl.textContent = route.subtitle || '';

    document.title = `${route.label} — ${GMS.APP_CONFIG.NAME_AR}`;
  }

  function pushHistory(entry) {
    RState.history.unshift(entry);
    if (RState.history.length > RState.maxHistory) {
      RState.history = RState.history.slice(0, RState.maxHistory);
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §5 · SCHEDULED RERENDER
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * ✅ v4: guards أقوى
   *   1. Modal مفتوح
   *   2. حقل عليه focus
   *   3. نص محدد (highlight)
   *   4. pointerdown حديث (< 3000ms)
   *   5. form interaction حديث (< 5000ms)
   *   6. أي interaction حديث (< 3000ms)
   */
  function shouldSkipRerender() {
    /* 1 · Modal مفتوح */
    if (GMS.Modal && typeof GMS.Modal.count === 'function' && GMS.Modal.count() > 0) {
      return true;
    }

    /* 2 · حقل عليه focus */
    const active = document.activeElement;
    if (active) {
      const tag = active.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
        return true;
      }
      if (active.isContentEditable) {
        return true;
      }
    }

    /* 3 · ✅ NEW: نص محدد (highlight) */
    try {
      const sel = window.getSelection?.();
      if (sel && !sel.isCollapsed && sel.toString().trim().length > 0) {
        return true;
      }
    } catch (_) {}

    /* 4 · ✅ NEW: pointerdown حديث (< 3000ms) */
    if (window.GMS?._lastPointer) {
      const elapsed = Date.now() - window.GMS._lastPointer;
      if (elapsed < 3000) return true;
    }

    /* 5 · form interaction حديث (< 5000ms) */
    if (window.GMS && window.GMS._lastFormInteraction) {
      const elapsed = Date.now() - window.GMS._lastFormInteraction;
      if (elapsed < 5000) return true;
    }

    /* 6 · أي interaction حديث (< 3000ms) */
    if (window.GMS && window.GMS._lastInteraction) {
      const elapsed = Date.now() - window.GMS._lastInteraction;
      if (elapsed < 3000) return true;
    }

    return false;
  }

  function isModalOpen() {
    return shouldSkipRerender();
  }

  function scheduleRerender(delay) {
    if (RState.suspended) {
      console.log('[Router] ⛔ Rerender suspended — تجاهل الجدولة');
      return;
    }

    if (shouldSkipRerender()) {
      console.log('[Router] ⛔ Rerender blocked — user interacting');
      return;
    }

    if (RState.scheduledRerender) {
      clearTimeout(RState.scheduledRerender);
    }

    const d = delay || RState.scheduledDelay;

    RState.scheduledRerender = setTimeout(async () => {
      RState.scheduledRerender = null;

      if (RState.suspended) {
        console.log('[Router] ⛔ Rerender suspended — تجاهل التنفيذ');
        return;
      }

      if (shouldSkipRerender()) {
        console.log('[Router] ⛔ Deferred rerender — user still interacting');
        scheduleRerender(d);
        return;
      }

      if (RState.rendering) {
        scheduleRerender(d);
        return;
      }

      if (document.hidden) return;

      console.log('[Router] 🔄 Scheduled rerender executing');

      try {
        await go(RState.current, { force: true });
      } catch (e) {
        console.warn('[Router] Scheduled rerender failed:', e);
      }
    }, d);
  }

  function suspendScheduling() {
    RState.suspended = true;
    cancelScheduledRerender();
  }

  function resumeScheduling() {
    RState.suspended = false;
  }

  function cancelScheduledRerender() {
    if (RState.scheduledRerender) {
      clearTimeout(RState.scheduledRerender);
      RState.scheduledRerender = null;
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §6 · NAVIGATION HELPERS
     ═════════════════════════════════════════════════════════════════════ */

  function back() {
    if (RState.history.length > 1) {
      const previous = RState.history[1];
      if (previous && previous.route !== RState.current) {
        return go(previous.route, { force: true });
      }
    }

    return go('dashboard', { force: true });
  }

  function reload(opts = {}) {
    const { force = false } = opts;

    if (!force && shouldSkipRerender()) {
      console.log('[Router] ⛔ reload() blocked — user interacting, retrying in 400ms');
      setTimeout(() => reload(opts), 400);
      return Promise.resolve(false);
    }

    return go(RState.current, { force: true });
  }

  function current() {
    return RState.current ? ROUTES[RState.current] : null;
  }

  function currentId() {
    return RState.current;
  }

  function previous() {
    return RState.previous ? ROUTES[RState.previous] : null;
  }

  function isCurrent(routeId) {
    return RState.current === routeId;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §7 · HASH CHANGE HANDLER
     ═════════════════════════════════════════════════════════════════════ */

  function handleHashChange() {
    const hashRoute = getHashRoute();

    if (!hashRoute) {
      if (RState.current !== 'dashboard') {
        go('dashboard', { replace: true });
      }
      return;
    }

    if (hashRoute === RState.current) return;

    if (ROUTES[hashRoute]) {
      go(hashRoute);
    } else {
      console.warn('[Router] Unknown hash route:', hashRoute);
      go('dashboard', { replace: true });
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §8 · TABS BINDING
     ═════════════════════════════════════════════════════════════════════ */

  function bindTabs() {
    const tabBar = document.getElementById('tabs-bar');
    if (!tabBar) return;

    tabBar.querySelectorAll('[data-tab]').forEach(tab => {
      const newTab = tab.cloneNode(true);
      tab.parentNode.replaceChild(newTab, tab);

      const route = ROUTES[newTab.dataset.tab];
      if (route) {
        const access = checkRouteAccess(route);
        if (!access.allowed) {
          newTab.style.display = 'none';
        } else {
          newTab.style.display = '';
        }
      }

      newTab.onclick = (e) => {
        e.preventDefault();
        const routeId = newTab.dataset.tab;
        go(routeId);
      };
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §9 · KEYBOARD SHORTCUTS
     ═════════════════════════════════════════════════════════════════════ */

  function bindKeyboardShortcuts() {
    const handler = (e) => {
      const tag = document.activeElement?.tagName;
      const inField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      if (e.altKey && !e.ctrlKey && !e.shiftKey) {
        const num = parseInt(e.key, 10);
        if (num >= 1 && num <= 9) {
          const routeId = TAB_ORDER[num - 1];
          if (routeId) {
            e.preventDefault();
            go(routeId);
            return;
          }
        }

        if (e.key === '0') {
          const routeId = TAB_ORDER[TAB_ORDER.length - 1];
          if (routeId) {
            e.preventDefault();
            go(routeId);
            return;
          }
        }
      }

      if (e.altKey && !inField) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          back();
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r' && !inField) {
        e.preventDefault();
        reload();
        GMS.Toast?.info('تم تحديث الصفحة');
      }
    };

    document.addEventListener('keydown', handler);
    RState._keyboardHandler = handler;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §10 · PUBLIC API — GET ROUTES
     ═════════════════════════════════════════════════════════════════════ */

  function getRoutes() {
    return { ...ROUTES };
  }

  function getTabOrder() {
    return TAB_ORDER.slice();
  }

  function getAccessibleRoutes() {
    return TAB_ORDER
      .map(id => ROUTES[id])
      .filter(route => {
        if (!route) return false;
        const access = checkRouteAccess(route);
        return access.allowed;
      });
  }

  function getRoute(id) {
    return ROUTES[id] || null;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §11 · ROUTE GUARD
     ═════════════════════════════════════════════════════════════════════ */

  const customGuards = new Map();

  function addGuard(routeId, guard) {
    if (!customGuards.has(routeId)) {
      customGuards.set(routeId, []);
    }
    customGuards.get(routeId).push(guard);
  }

  function runCustomGuards(route) {
    const guards = customGuards.get(route.id) || [];

    for (const guard of guards) {
      try {
        const result = guard(route, GMS.Auth?.profile);
        if (result && result.allowed === false) {
          return result;
        }
      } catch (e) {
        console.warn(`[Router] Guard failed for ${route.id}:`, e);
      }
    }

    return { allowed: true };
  }

  /* ═════════════════════════════════════════════════════════════════════
     §12 · EVENT SUBSCRIPTIONS
     ═════════════════════════════════════════════════════════════════════ */

  function on(event, fn) {
    const set = RState.listeners[event];
    if (!set || typeof fn !== 'function') return () => {};
    set.add(fn);
    return () => set.delete(fn);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §13 · INITIALIZATION
     ═════════════════════════════════════════════════════════════════════ */

  async function init(opts = {}) {
    const {
      defaultRoute = 'dashboard',
      listenHash = true,
      listenKeyboard = true,
    } = opts;

    if (RState.initialized) {
      console.log('[Router] Already initialized');
      return { current: RState.current };
    }

    RState.initialized = true;

    bindTabs();

    if (listenHash) {
      window.addEventListener('hashchange', handleHashChange);
      RState._hashHandler = handleHashChange;
    }

    if (listenKeyboard) {
      bindKeyboardShortcuts();
    }

    let initialRoute = getHashRoute();

    if (!initialRoute || !ROUTES[initialRoute]) {
      initialRoute = defaultRoute;
    }

    const access = checkRouteAccess(ROUTES[initialRoute]);
    if (!access.allowed) {
      initialRoute = 'dashboard';
    }

    await go(initialRoute, { force: true });

    console.log('[Router] Initialized', {
      current: RState.current,
      accessible: getAccessibleRoutes().length,
      total: TAB_ORDER.length,
    });

    return {
      current: RState.current,
      route: current(),
      accessible: getAccessibleRoutes(),
    };
  }

  function destroy() {
    if (RState._hashHandler) {
      window.removeEventListener('hashchange', RState._hashHandler);
      RState._hashHandler = null;
    }

    if (RState._keyboardHandler) {
      document.removeEventListener('keydown', RState._keyboardHandler);
      RState._keyboardHandler = null;
    }

    cancelScheduledRerender();
    RState.initialized = false;
    console.log('[Router] Destroyed');
  }

  /* ═════════════════════════════════════════════════════════════════════
     §14 · DIAGNOSTICS
     ═════════════════════════════════════════════════════════════════════ */

  function getState() {
    return {
      current: RState.current,
      currentRoute: current(),
      previous: RState.previous,
      initialized: RState.initialized,
      rendering: RState.rendering,
      lastRenderAt: RState.lastRenderAt,
      historyLength: RState.history.length,
      accessible: getAccessibleRoutes().length,
      total: TAB_ORDER.length,
      shouldSkipRerender: shouldSkipRerender(),
      lastFormInteraction: window.GMS?._lastFormInteraction || null,
      lastInteraction: window.GMS?._lastInteraction || null,
      lastPointer: window.GMS?._lastPointer || null,
    };
  }

  function clearHistory() {
    RState.history = [];
    console.log('[Router] History cleared');
  }

  /* ═════════════════════════════════════════════════════════════════════
     §15 · EXPORT
     ═════════════════════════════════════════════════════════════════════ */
  GMS.Router = {
    init,
    destroy,
    go,
    back,
    reload,

    state: RState,
    current,
    currentId,
    previous,
    isCurrent,

    scheduleRerender,
    cancelScheduledRerender,
    suspendScheduling,
    resumeScheduling,
    isModalOpen,
    shouldSkipRerender,

    getRoutes,
    getRoute,
    getTabOrder,
    getAccessibleRoutes,

    addGuard,
    checkRouteAccess,

    on,

    getState,
    clearHistory,

    ROUTES,
    TAB_ORDER,
  };

  GMS.navigate = go;
  GMS.navTo = go;

  console.log(
    '%c🧭 Router v4 loaded · Pointer + Selection Guards',
    'color:#1c4fd8;font-weight:800;font-size:12px;padding:1px 5px;' +
    'background:#e9efff;border-radius:4px;'
  );

  console.log(
    `%c📍 ${TAB_ORDER.length} routes · Guards · Scheduled rerender · Pointer-aware`,
    'color:#6b7a95;font-weight:700;font-size:11px;'
  );

  console.log(
    `%c🛡️  Form-aware: rerender يُؤجَّل عند الكتابة · highlight · pointerdown`,
    'color:#0f7a43;font-weight:700;font-size:11px;'
  );

})();
