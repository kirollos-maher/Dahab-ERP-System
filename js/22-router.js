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
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const GMS = window.GMS = window.GMS || {};

  /* ═════════════════════════════════════════════════════════════════════
     §1 · ROUTES DEFINITION
     ─────────────────────────────────────────────────────────────────────
     تعريف كل الصفحات مع:
     - id: مفتاح الصفحة
     - label: العنوان في التبويب
     - subtitle: العنوان الفرعي
     - icon: أيقونة Lucide
     - permission: الصلاحية المطلوبة (اختياري)
     - roles: الأدوار المسموحة (اختياري)
     - view: اسم الـ View في GMS.Views
     - hidden: إخفاء من التبويبات (اختياري)
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

  /* ترتيب التبويبات في الواجهة */
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
    'queue',
    'settings',
  ];

  /* ═════════════════════════════════════════════════════════════════════
     §2 · ROUTER STATE
     ═════════════════════════════════════════════════════════════════════ */
  const RState = {
    /* الصفحة الحالية */
    current: null,
    previous: null,

    /* هل الراوتر جاهز؟ */
    initialized: false,

    /* هل نحن في عملية تصيير؟ */
    rendering: false,

    /* آخر render time */
    lastRenderAt: null,

    /* Scheduled rerender */
    scheduledRerender: null,
    scheduledDelay: 400,   /* ms */

    /* سجل التنقل */
    history: [],
    maxHistory: 30,

    /* المستمعون */
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

  /**
   * قراءة hash الحالي
   * @returns {string}
   */
  function getHashRoute() {
    const hash = location.hash || '';
    if (!hash) return '';
    return hash.replace(/^#\/?/, '').split('?')[0].trim();
  }

  /**
   * كتابة hash جديد بدون إعادة تحميل
   * @param {string} route
   */
  function setHashRoute(route) {
    const newHash = '#/' + route;
    if (location.hash !== newHash) {
      history.pushState(null, '', newHash);
    }
  }

  /**
   * التحقق من صلاحية المسار
   * @param {Object} route
   * @returns {{allowed: boolean, reason: string}}
   */
  function checkRouteAccess(route) {
    if (!route) {
      return { allowed: false, reason: 'ROUTE_NOT_FOUND' };
    }

    /* إذا لم يكن هناك Auth — اسمح (وضع تجريبي) */
    if (!GMS.Auth?.profile) {
      return { allowed: true, reason: '' };
    }

    /* فحص الصلاحية */
    if (route.permission && !GMS.Auth.can(route.permission)) {
      return {
        allowed: false,
        reason: 'PERMISSION_DENIED',
        message: `لا تملك صلاحية الوصول لهذه الصفحة (${route.label})`,
      };
    }

    /* فحص الأدوار */
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

  /**
   * إطلاق حدث
   */
  function emit(event, data) {
    const set = RState.listeners[event];
    if (!set) return;
    set.forEach(fn => {
      try { fn(data); } catch (e) { console.error(`[Router.emit:${event}]`, e); }
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §3.5 · FORM INTERACTION TRACKER
     ─────────────────────────────────────────────────────────────────────
     يتابع آخر مرة تفاعل فيها المستخدم مع حقل إدخال
     لمنع Rerender فجائي أثناء الكتابة أو اختيار قيم من القوائم
     ═════════════════════════════════════════════════════════════════════ */
  (function initFormTracker() {
    const markInteraction = () => {
      window.GMS = window.GMS || {};
      window.GMS._lastFormInteraction = Date.now();
      window.GMS._lastInteraction = Date.now();
    };

    /* تفعيل المستمعين على document بمستوى capture */
    ['focusin', 'keydown', 'pointerdown', 'input', 'change'].forEach(evt => {
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

    console.log('[Router] ✅ Form interaction tracker active');
  })();

  /* ═════════════════════════════════════════════════════════════════════
     §4 · CORE NAVIGATION
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * الانتقال إلى مسار
   * @param {string} routeId
   * @param {Object} [opts]
   * @param {boolean} [opts.force=false]  — تجاهل الفحوصات
   * @param {boolean} [opts.replace=false] — استبدال التاريخ بدل الإضافة
   * @param {Object} [opts.params={}]     — معاملات إضافية
   * @returns {Promise<boolean>}
   */
  async function go(routeId, opts = {}) {
    const { force = false, replace = false } = opts;

    /* تأكد من وجود المسار */
    const route = ROUTES[routeId];
    if (!route) {
      console.warn('[Router] Unknown route:', routeId);
      return go('dashboard');
    }

    /* لا حاجة لإعادة التصيير إذا كان نفس الصفحة */
    if (RState.current === routeId && !force) {
      /* إغلاق أي modal مفتوح */
      if (GMS.Modal) GMS.Modal.closeAll();
      return true;
    }

    /* إطلاق حدث before */
    const navData = {
      from: RState.current,
      to: routeId,
      route,
    };
    emit('beforeNavigate', navData);

    /* فحص الصلاحية */
    if (!force) {
      const access = checkRouteAccess(route);

      if (!access.allowed) {
        console.warn('[Router] Access denied:', access.reason, routeId);

        GMS.Toast?.warn(
          'غير مصرح',
          access.message || 'لا يمكن الوصول لهذه الصفحة'
        );

        emit('navigationBlocked', { ...navData, reason: access.reason });

        /* ارجع للصفحة الافتراضية */
        if (routeId !== 'dashboard') {
          return go('dashboard', { force: true });
        }
        return false;
      }
    }

    /* ✅ إغلاق Modals فقط عند تنقل حقيقي (من صفحة إلى أخرى) */
    if (GMS.Modal && RState.current !== routeId) {
      GMS.Modal.closeAll();
    }

    /* Cleanup الصفحة الحالية */
    if (RState.current && RState.current !== routeId) {
      try {
        const currentView = GMS.Views?.[ROUTES[RState.current]?.view];
        if (currentView?.cleanup && typeof currentView.cleanup === 'function') {
          currentView.cleanup();
        }
      } catch (e) {
        console.warn('[Router] Cleanup failed:', e);
      }
    }

    /* تحديث الحالة */
    RState.previous = RState.current;
    RState.current = routeId;
    RState.rendering = true;

    /* تحديث التبويب النشط */
    updateActiveTab(routeId);

    /* تحديث العنوان */
    updatePageTitle(route);

    /* تحديث hash */
    if (replace) {
      history.replaceState(null, '', '#/' + routeId);
    } else {
      setHashRoute(routeId);
    }

    /* إضافة إلى السجل */
    pushHistory({
      route: routeId,
      at: new Date().toISOString(),
    });

    /* تصيير الصفحة */
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

      /* عرض صفحة خطأ */
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

  /**
   * تصيير الصفحة الحالية
   * @param {Object} route
   * @returns {Promise<void>}
   */
  async function renderView(route) {
    const host = document.getElementById('page');
    if (!host) {
      throw new Error('عنصر #page غير موجود');
    }

    /* ابحث عن الـ View */
    const view = GMS.Views?.[route.view];

    if (!view) {
      throw new Error(`View "${route.view}" غير معرّف`);
    }

    /* إذا كان للصفحة دوال خاصة */
    if (view.render && typeof view.render === 'function') {
      await view.render(host);
    } else if (view.mount && typeof view.mount === 'function') {
      await view.mount(host);
    } else {
      throw new Error(`View "${route.view}" لا يحتوي على دالة render`);
    }

    /* إعادة رسم الأيقونات */
    window.lucide?.createIcons();
  }

  /**
   * عرض صفحة خطأ
   */
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

    /* Bind buttons */
    document.getElementById('route-retry')?.addEventListener('click', () => {
      go(route.id, { force: true });
    });

    document.getElementById('route-home')?.addEventListener('click', () => {
      go('dashboard');
    });
  }

  /**
   * تحديث التبويب النشط
   * @param {string} routeId
   */
  function updateActiveTab(routeId) {
    document.querySelectorAll('[data-tab]').forEach(tab => {
      const isActive = tab.dataset.tab === routeId;
      tab.classList.toggle('active', isActive);
    });
  }

  /**
   * تحديث عنوان الصفحة
   * @param {Object} route
   */
  function updatePageTitle(route) {
    const titleEl = document.getElementById('page-title');
    const subtitleEl = document.getElementById('page-sub');

    if (titleEl) {
      titleEl.textContent = route.label || '';
    }

    if (subtitleEl) {
      subtitleEl.textContent = route.subtitle || '';
    }

    /* عنوان الصفحة (browser tab) */
    document.title = `${route.label} — ${GMS.APP_CONFIG.NAME_AR}`;
  }

  /**
   * إضافة إلى السجل
   */
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
   * ✅ فحص إذا كان يجب تأجيل إعادة التصيير
   *
   * يعود true (يجب التخطي) إذا:
   *   0. كان InteractionGuard موجود وقفل التفاعل
   *   1. كان هناك Modal مفتوح
   *   2. كان المستخدم يكتب في حقل (Input/Select/Textarea)
   *   3. كان هناك تفاعل حديث مع حقل (آخر 5 ثواني)
   *   4. كان هناك أي تفاعل حديث (آخر 3 ثواني)
   *
   * @returns {boolean}
   */
  function shouldSkipRerender() {
    /* ✅ فحص 0: استخدم الـ InteractionGuard لو موجود */
    if (GMS.InteractionGuard && typeof GMS.InteractionGuard.shouldBlock === 'function') {
      if (GMS.InteractionGuard.shouldBlock()) {
        return true;
      }
    }

    /* فحص 1: Modal مفتوح */
    if (GMS.Modal && typeof GMS.Modal.count === 'function' && GMS.Modal.count() > 0) {
      return true;
    }

    /* فحص 2: المستخدم يكتب في حقل (Input, Select, Textarea) */
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

    /* فحص 3: تفاعل نموذج خلال آخر 5 ثواني */
    if (window.GMS && window.GMS._lastFormInteraction) {
      const elapsed = Date.now() - window.GMS._lastFormInteraction;
      if (elapsed < 5000) {
        return true;
      }
    }

    /* ✅ فحص 4: أي تفاعل خلال آخر 3 ثواني */
    if (window.GMS && window.GMS._lastInteraction) {
      const elapsed = Date.now() - window.GMS._lastInteraction;
      if (elapsed < 3000) {
        return true;
      }
    }

    return false;
  }

  /**
   * @deprecated استخدم shouldSkipRerender
   */
  function isModalOpen() {
    return shouldSkipRerender();
  }

  /**
   * جدولة إعادة تصيير للصفحة الحالية (debounced)
   *
   * ✅ التحديثات:
   *   - يتخطى Rerender إذا كان هناك Modal مفتوح
   *   - يتخطى إذا كان المستخدم يكتب في حقل
   *   - يتخطى إذا كان هناك أي تفاعل حديث (آخر 3 ثواني)
   */
  function scheduleRerender(delay) {
    /* ✅ فحص أولي — قبل الجدولة */
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

      /* ✅ فحص ثاني — ربما تغيّر الوضع */
      if (shouldSkipRerender()) {
        console.log('[Router] ⛔ Deferred rerender — user still interacting');
        scheduleRerender(d);
        return;
      }

      /* تجاهل إذا كان هناك تصيير جارٍ */
      if (RState.rendering) {
        /* أعد الجدولة */
        scheduleRerender(d);
        return;
      }

      /* تجاهل إذا كانت الصفحة مخفية */
      if (document.hidden) {
        return;
      }

      console.log('[Router] 🔄 Scheduled rerender executing');

      try {
        await go(RState.current, { force: true });
      } catch (e) {
        console.warn('[Router] Scheduled rerender failed:', e);
      }
    }, d);
  }

  /**
   * إلغاء scheduled rerender
   */
  function cancelScheduledRerender() {
    if (RState.scheduledRerender) {
      clearTimeout(RState.scheduledRerender);
      RState.scheduledRerender = null;
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §6 · NAVIGATION HELPERS
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * الانتقال للصفحة السابقة
   */
  function back() {
    if (RState.history.length > 1) {
      const previous = RState.history[1];
      if (previous && previous.route !== RState.current) {
        return go(previous.route, { force: true });
      }
    }

    /* fallback */
    return go('dashboard', { force: true });
  }

  /**
   * إعادة تحميل الصفحة الحالية
   */
  function reload() {
    return go(RState.current, { force: true });
  }

  /**
   * قراءة المسار الحالي
   * @returns {Object|null}
   */
  function current() {
    return RState.current ? ROUTES[RState.current] : null;
  }

  /**
   * قراءة معرف المسار الحالي
   * @returns {string|null}
   */
  function currentId() {
    return RState.current;
  }

  /**
   * قراءة المسار السابق
   * @returns {Object|null}
   */
  function previous() {
    return RState.previous ? ROUTES[RState.previous] : null;
  }

  /**
   * فحص إذا كان مسار محدد هو الحالي
   * @param {string} routeId
   * @returns {boolean}
   */
  function isCurrent(routeId) {
    return RState.current === routeId;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §7 · HASH CHANGE HANDLER
     ═════════════════════════════════════════════════════════════════════ */

  function handleHashChange() {
    const hashRoute = getHashRoute();

    if (!hashRoute) {
      /* انتقل للصفحة الافتراضية */
      if (RState.current !== 'dashboard') {
        go('dashboard', { replace: true });
      }
      return;
    }

    if (hashRoute === RState.current) {
      return;
    }

    if (ROUTES[hashRoute]) {
      go(hashRoute);
    } else {
      /* مسار غير معروف — انتقل للافتراضي */
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

    /* ابحث عن كل التبويبات */
    tabBar.querySelectorAll('[data-tab]').forEach(tab => {
      /* إزالة أي handler سابق */
      const newTab = tab.cloneNode(true);
      tab.parentNode.replaceChild(newTab, tab);

      /* إذا كان التبويب يحتاج صلاحية غير متاحة — اخفيه */
      const route = ROUTES[newTab.dataset.tab];
      if (route) {
        const access = checkRouteAccess(route);
        if (!access.allowed) {
          newTab.style.display = 'none';
        } else {
          newTab.style.display = '';
        }
      }

      /* ربط الحدث */
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
      /* تجاهل داخل حقول الإدخال */
      const tag = document.activeElement?.tagName;
      const inField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      /* Alt + رقم = التنقل السريع */
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

        /* Alt + 0 = الصفحة الأخيرة */
        if (e.key === '0') {
          const routeId = TAB_ORDER[TAB_ORDER.length - 1];
          if (routeId) {
            e.preventDefault();
            go(routeId);
            return;
          }
        }
      }

      /* Alt + Left/Right = التنقل بين الصفحات */
      if (e.altKey && !inField) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          back();
        }
      }

      /* Ctrl + R — تعطيل إعادة تحميل المتصفح، بدلاً منها نعيد تحميل الصفحة */
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r' && !inField) {
        e.preventDefault();
        reload();
        GMS.Toast?.info('تم تحديث الصفحة');
      }
    };

    document.addEventListener('keydown', handler);

    /* احفظ مرجعاً للتنظيف */
    RState._keyboardHandler = handler;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §10 · PUBLIC API — GET ROUTES
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * قراءة كل المسارات
   * @returns {Object}
   */
  function getRoutes() {
    return { ...ROUTES };
  }

  /**
   * قراءة ترتيب التبويبات
   * @returns {Array<string>}
   */
  function getTabOrder() {
    return TAB_ORDER.slice();
  }

  /**
   * قراءة المسارات المتاحة للمستخدم الحالي
   * @returns {Array<Object>}
   */
  function getAccessibleRoutes() {
    return TAB_ORDER
      .map(id => ROUTES[id])
      .filter(route => {
        if (!route) return false;
        const access = checkRouteAccess(route);
        return access.allowed;
      });
  }

  /**
   * قراءة المسار بالمعرف
   * @param {string} id
   * @returns {Object|null}
   */
  function getRoute(id) {
    return ROUTES[id] || null;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §11 · ROUTE GUARD
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * إضافة حارس مخصص لمسار
   * @param {string} routeId
   * @param {Function} guard — (route, user) => { allowed: boolean, message?: string }
   */
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

  /**
   * تهيئة الراوتر
   * @param {Object} [opts]
   * @param {string} [opts.defaultRoute='dashboard']
   * @param {boolean} [opts.listenHash=true]
   * @param {boolean} [opts.listenKeyboard=true]
   * @returns {Promise<Object>}
   */
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

    /* 1 · تحديث شريط التبويبات */
    bindTabs();

    /* 2 · Hash listener */
    if (listenHash) {
      window.addEventListener('hashchange', handleHashChange);
      RState._hashHandler = handleHashChange;
    }

    /* 3 · Keyboard shortcuts */
    if (listenKeyboard) {
      bindKeyboardShortcuts();
    }

    /* 4 · تحديد المسار الابتدائي */
    let initialRoute = getHashRoute();

    if (!initialRoute || !ROUTES[initialRoute]) {
      initialRoute = defaultRoute;
    }

    /* 5 · فحص الصلاحيات */
    const access = checkRouteAccess(ROUTES[initialRoute]);
    if (!access.allowed) {
      initialRoute = 'dashboard';
    }

    /* 6 · الانتقال */
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

  /**
   * إيقاف الراوتر
   */
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

  /**
   * قراءة حالة الراوتر كاملة
   * @returns {Object}
   */
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
    };
  }

  /**
   * تفريغ سجل التنقل
   */
  function clearHistory() {
    RState.history = [];
    console.log('[Router] History cleared');
  }

  /* ═════════════════════════════════════════════════════════════════════
     §15 · EXPORT
     ═════════════════════════════════════════════════════════════════════ */
  GMS.Router = {
    /* Core */
    init,
    destroy,
    go,
    back,
    reload,

    /* State */
    state: RState,
    current,
    currentId,
    previous,
    isCurrent,

    /* Schedule */
    scheduleRerender,
    cancelScheduledRerender,
    isModalOpen,
    shouldSkipRerender,

    /* Routes */
    getRoutes,
    getRoute,
    getTabOrder,
    getAccessibleRoutes,

    /* Guards */
    addGuard,
    checkRouteAccess,

    /* Events */
    on,

    /* Diagnostics */
    getState,
    clearHistory,

    /* Constants */
    ROUTES,
    TAB_ORDER,
  };

  /* ─── Aliases مختصرة ──────────────────────────────────────────── */
  GMS.navigate = go;
  GMS.navTo = go;

  /* ═════════════════════════════════════════════════════════════════════
     §16 · AUTO-INIT ON DOMContentLoaded (اختياري)
     ─────────────────────────────────────────────────────────────────────
     ملاحظة: `23-boot.js` هو المسؤول عن استدعاء `Router.init()`
     هذا الجزء يبقى معطّلاً لتجنب التعارض.
     ═════════════════════════════════════════════════════════════════════ */
  /* تم التعطيل عمداً — يُدار عبر 23-boot.js */

  /* ═════════════════════════════════════════════════════════════════════
     §17 · LOADED CONFIRMATION
     ═════════════════════════════════════════════════════════════════════ */
  console.log(
    '%c🧭 Router loaded · Hash-based SPA navigation',
    'color:#1c4fd8;font-weight:800;font-size:12px;padding:1px 5px;' +
    'background:#e9efff;border-radius:4px;'
  );

  console.log(
    `%c📍 ${TAB_ORDER.length} routes · Guards · Scheduled rerender · Alt+1..9 shortcuts`,
    'color:#6b7a95;font-weight:700;font-size:11px;'
  );

  console.log(
    `%c🛡️  Form-aware: rerender يُؤجَّل عند الكتابة في حقول أو فتح Modal`,
    'color:#0f7a43;font-weight:700;font-size:11px;'
  );

  /* ═════════════════════════════════════════════════════════════════════
     ✅ js/22-router.js — نهاية الملف
     ═════════════════════════════════════════════════════════════════════ */

})();
