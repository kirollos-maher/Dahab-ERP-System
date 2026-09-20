/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ENTERPRISE — js/25-pwa.js
   PWA Manager — إدارة التثبيت، التحديثات، والمزامنة الخلفية

   - Install Prompt (beforeinstallprompt)
   - Update Notifications (SW updates)
   - Network Status Watcher (online/offline)
   - Background Sync Registration
   - Badge API (App Icon Badge)
   - Standalone Detection
   - iOS Manual Install Guide
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const GMS = window.GMS = window.GMS || {};

  /* ═════════════════════════════════════════════════════════════════════
     §1 · PWA STATE
     ═════════════════════════════════════════════════════════════════════ */
  const PWAState = {
    /* الحالة العامة */
    supported: 'serviceWorker' in navigator,
    registered: false,
    registration: null,

    /* Install prompt */
    installPrompt: null,
    isInstallable: false,
    isInstalled: false,
    installDismissed: false,

    /* Platform detection */
    platform: 'unknown',       // 'android' | 'ios' | 'desktop'
    isStandalone: false,

    /* Network */
    online: navigator.onLine,

    /* Update */
    updateAvailable: false,
    waitingWorker: null,

    /* Badge */
    badgeCount: 0,

    /* DOM */
    installBtn: null,

    /* Events */
    listeners: {
      installAvailable: new Set(),
      installed: new Set(),
      updated: new Set(),
      onlineChange: new Set(),
    },

    /* Keys */
    LS_DISMISSED: 'gms.pwa.installDismissed',
    LS_INSTALLED: 'gms.pwa.installed',
  };

  /* ═════════════════════════════════════════════════════════════════════
     §2 · HELPERS
     ═════════════════════════════════════════════════════════════════════ */

  function emit(event, data) {
    const set = PWAState.listeners[event];
    if (!set) return;
    set.forEach(fn => {
      try { fn(data); } catch (e) { console.error(`[PWA.emit:${event}]`, e); }
    });
  }

  function on(event, fn) {
    const set = PWAState.listeners[event];
    if (!set || typeof fn !== 'function') return () => {};
    set.add(fn);
    return () => set.delete(fn);
  }

  /**
   * قراءة قيمة Boolean من LocalStorage
   */
  function lsBoolGet(key, fallback = false) {
    try {
      const v = localStorage.getItem(key);
      if (v === null) return fallback;
      return v === 'true';
    } catch (_) {
      return fallback;
    }
  }

  function lsBoolSet(key, value) {
    try {
      localStorage.setItem(key, value ? 'true' : 'false');
    } catch (_) {}
  }

  /**
   * كشف المنصة
   */
  function detectPlatform() {
    const ua = navigator.userAgent || '';

    if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) {
      PWAState.platform = 'ios';
    } else if (/android/i.test(ua)) {
      PWAState.platform = 'android';
    } else {
      PWAState.platform = 'desktop';
    }
  }

  /**
   * كشف وضع Standalone
   */
  function detectStandalone() {
    const modes = [
      window.matchMedia('(display-mode: standalone)').matches,
      window.matchMedia('(display-mode: fullscreen)').matches,
      window.matchMedia('(display-mode: minimal-ui)').matches,
      window.navigator.standalone === true, // iOS
    ];
    PWAState.isStandalone = modes.some(v => v === true);

    if (PWAState.isStandalone) {
      document.documentElement.setAttribute('data-pwa-standalone', 'true');
    }

    return PWAState.isStandalone;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §3 · SERVICE WORKER REGISTRATION
     ═════════════════════════════════════════════════════════════════════ */

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      console.warn('[PWA] Service Worker غير مدعوم في هذا المتصفح');
      return null;
    }

    /* لا نُسجِّل SW في file:// أو localhost بدون https (ما عدا التطوير) */
    const isLocalhost =
      location.hostname === 'localhost' ||
      location.hostname === '127.0.0.1';
    const isHttps = location.protocol === 'https:';

    if (!isHttps && !isLocalhost) {
      console.warn('[PWA] Service Worker يتطلب HTTPS (أو localhost)');
      return null;
    }

    try {
      const registration = await navigator.serviceWorker.register(
        './service-worker.js',
        { scope: './' }
      );

      PWAState.registration = registration;
      PWAState.registered = true;

      console.log(
        `%c[PWA] ✅ SW registered · scope: ${registration.scope}`,
        'color:#0f7a43;font-weight:800;font-size:11px;'
      );

      /* فحص التحديثات */
      setupUpdateDetection(registration);

      /* فحص ما إذا كان هناك worker في الانتظار */
      if (registration.waiting) {
        handleUpdateFound(registration.waiting);
      }

      /* مراقبة تحديثات مستقبلية */
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) return;

        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            /* SW جديد تم تثبيته — يُنتظر التنشيط */
            handleUpdateFound(installing);
          }
        });
      });

      return registration;

    } catch (e) {
      console.error('[PWA] فشل تسجيل Service Worker:', e);
      return null;
    }
  }

  /**
   * الاستماع للرسائل القادمة من الـ SW
   */
  function setupServiceWorkerMessages() {
    navigator.serviceWorker.addEventListener('message', (event) => {
      const data = event.data || {};

      switch (data.type) {
        case 'SW_ACTIVATED':
          console.log(`[PWA] SW activated: ${data.version}`);
          break;

        case 'TRIGGER_QUEUE_SYNC':
          console.log('[PWA] Background sync requested by SW');
          triggerQueueSync();
          break;
      }
    });
  }

  /**
   * إعداد اكتشاف التحديثات
   */
  function setupUpdateDetection(registration) {
    /* نبحث عن تحديث كل 30 دقيقة */
    setInterval(() => {
      registration.update().catch(() => {});
    }, 30 * 60 * 1000);

    /* ومرة أخرى عند تغيير الصفحة */
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        registration.update().catch(() => {});
      }
    });
  }

  /**
   * عند وجود SW جديد جاهز
   */
  function handleUpdateFound(worker) {
    PWAState.updateAvailable = true;
    PWAState.waitingWorker = worker;

    console.log('[PWA] تحديث جديد متاح');

    /* أظهر إشعار للمستخدم */
    if (GMS.Toast) {
      GMS.Toast.show({
        title: 'تحديث جديد متاح',
        desc: 'يتوفر إصدار أحدث — أعد التحميل للحصول على آخر الميزات',
        type: 'info',
        icon: 'download-cloud',
        ms: 0, // لا تُغلقه تلقائياً
        closable: true,
        action: () => applyUpdate(),
        actionLabel: 'تحديث الآن',
      });
    }

    emit('updated', { available: true });
  }

  /**
   * تفعيل SW الجديد وإعادة تحميل الصفحة
   */
  function applyUpdate() {
    const worker = PWAState.waitingWorker;
    if (!worker) {
      location.reload();
      return;
    }

    /* أخبر SW بتخطي الانتظار */
    worker.postMessage({ type: 'SKIP_WAITING' });

    /* أعد التحميل عند تفعيل SW الجديد */
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    }, { once: true });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §4 · INSTALL PROMPT
     ═════════════════════════════════════════════════════════════════════ */

  function setupInstallPrompt() {
    /* نتحقق من الحالة المحفوظة أولاً */
    PWAState.installDismissed = lsBoolGet(PWAState.LS_DISMISSED, false);
    PWAState.isInstalled = lsBoolGet(PWAState.LS_INSTALLED, false);

    /* إذا كان مثبَّتاً بالفعل */
    if (detectStandalone()) {
      PWAState.isInstalled = true;
      lsBoolSet(PWAState.LS_INSTALLED, true);
    }

    /* التقاط beforeinstallprompt */
    window.addEventListener('beforeinstallprompt', (event) => {
      /* منع السلوك الافتراضي (baner المتصفح) */
      event.preventDefault();

      PWAState.installPrompt = event;
      PWAState.isInstallable = true;

      console.log('[PWA] 📲 Install prompt متاح');

      /* أظهر زر التثبيت */
      showInstallButton();

      emit('installAvailable', { available: true });
    });

    /* التقاط حدث appinstalled */
    window.addEventListener('appinstalled', () => {
      console.log('[PWA] ✅ التطبيق تم تثبيته');

      PWAState.isInstalled = true;
      PWAState.isInstallable = false;
      PWAState.installPrompt = null;

      lsBoolSet(PWAState.LS_INSTALLED, true);

      /* اخفِ الزر */
      hideInstallButton();

      /* إشعار */
      if (GMS.Toast) {
        GMS.Toast.ok(
          'تم تثبيت Gold ERP Pro',
          'التطبيق متاح الآن من الشاشة الرئيسية'
        );
      }

      if (GMS.Beep) GMS.Beep.complete();

      emit('installed', { installed: true });
    });

    /* iOS: لا يُطلق beforeinstallprompt — نظهر إرشادات يدوية */
    if (PWAState.platform === 'ios' && !PWAState.isStandalone && !PWAState.installDismissed) {
      showIOSInstallHint();
    }
  }

  /**
   * عرض زر التثبيت في الـ Topbar
   */
  function showInstallButton() {
    const btn = document.getElementById('pwa-install-btn');
    if (!btn) return;

    btn.style.display = '';
    btn.classList.add('pwa-install-pulse');
  }

  function hideInstallButton() {
    const btn = document.getElementById('pwa-install-btn');
    if (!btn) return;

    btn.style.display = 'none';
    btn.classList.remove('pwa-install-pulse');
  }

  /**
   * تنفيذ التثبيت
   */
  async function promptInstall() {
    const prompt = PWAState.installPrompt;

    if (!prompt) {
      /* ربما iOS أو التطبيق مثبَّت بالفعل */
      if (PWAState.platform === 'ios') {
        showIOSInstallHint(true);
        return;
      }
      if (PWAState.isInstalled) {
        if (GMS.Toast) GMS.Toast.info('التطبيق مثبَّت بالفعل');
        return;
      }
      if (GMS.Toast) {
        GMS.Toast.warn(
          'التثبيت غير متاح حالياً',
          'افتح القائمة في المتصفح واختر "تثبيت التطبيق"'
        );
      }
      return;
    }

    try {
      /* اعرض نافذة التثبيت */
      prompt.prompt();

      /* انتظر اختيار المستخدم */
      const choice = await prompt.userChoice;

      console.log(`[PWA] Install choice: ${choice.outcome}`);

      if (choice.outcome === 'accepted') {
        console.log('[PWA] المستخدم وافق على التثبيت');
      } else {
        console.log('[PWA] المستخدم رفض التثبيت');
        PWAState.installDismissed = true;
        lsBoolSet(PWAState.LS_DISMISSED, true);
        hideInstallButton();
      }

      /* يمكن استدعاء prompt مرة واحدة فقط */
      PWAState.installPrompt = null;

    } catch (e) {
      console.error('[PWA] Install failed:', e);
      if (GMS.Toast) GMS.Toast.err('فشل التثبيت', e.message);
    }
  }

  /**
   * إرشادات التثبيت على iOS
   */
  function showIOSInstallHint(force = false) {
    if (PWAState.installDismissed && !force) return;

    if (!GMS.Modal) return;

    GMS.Modal.open({
      title: 'تثبيت Gold ERP Pro على iPhone/iPad',
      icon: 'smartphone',
      size: 'sm',
      body: `
        <div style="text-align:center;padding:8px 0 20px">
          <div style="width:72px;height:72px;border-radius:22px;
                      background:var(--gold-grad);display:grid;
                      place-items:center;margin:0 auto 14px;color:#2a1f05">
            <i data-lucide="share" style="width:32px;height:32px"></i>
          </div>
          <h3 style="font-size:16px;margin-bottom:6px">
            تثبيت التطبيق
          </h3>
          <p style="font-size:12px;color:var(--muted);font-weight:600;
                    line-height:1.7">
            اتبع الخطوات التالية لتثبيت التطبيق على شاشتك الرئيسية
          </p>
        </div>

        <ol style="list-style:none;padding:0;margin:0;
                   display:flex;flex-direction:column;gap:14px">
          <li style="display:flex;gap:12px;align-items:flex-start">
            <span style="width:28px;height:28px;border-radius:50%;
                         background:var(--gold-grad);color:#2a1f05;
                         display:grid;place-items:center;flex-shrink:0;
                         font-weight:900;font-size:13px">1</span>
            <div>
              <div style="font-weight:800;font-size:13px">
                اضغط على زر المشاركة <i data-lucide="share"
                  style="width:14px;height:14px;display:inline;
                  vertical-align:-2px"></i>
              </div>
              <div style="font-size:11.5px;color:var(--muted);
                          font-weight:600;margin-top:3px">
                في أسفل شاشة Safari
              </div>
            </div>
          </li>

          <li style="display:flex;gap:12px;align-items:flex-start">
            <span style="width:28px;height:28px;border-radius:50%;
                         background:var(--gold-grad);color:#2a1f05;
                         display:grid;place-items:center;flex-shrink:0;
                         font-weight:900;font-size:13px">2</span>
            <div>
              <div style="font-weight:800;font-size:13px">
                اختر "إضافة إلى الشاشة الرئيسية"
              </div>
              <div style="font-size:11.5px;color:var(--muted);
                          font-weight:600;margin-top:3px">
                <i data-lucide="plus-square"
                   style="width:12px;height:12px;display:inline;
                   vertical-align:-2px"></i>
                Add to Home Screen
              </div>
            </div>
          </li>

          <li style="display:flex;gap:12px;align-items:flex-start">
            <span style="width:28px;height:28px;border-radius:50%;
                         background:var(--gold-grad);color:#2a1f05;
                         display:grid;place-items:center;flex-shrink:0;
                         font-weight:900;font-size:13px">3</span>
            <div>
              <div style="font-weight:800;font-size:13px">
                اضغط "إضافة" في الأعلى
              </div>
              <div style="font-size:11.5px;color:var(--muted);
                          font-weight:600;margin-top:3px">
                سيظهر التطبيق على الشاشة الرئيسية
              </div>
            </div>
          </li>
        </ol>
      `,
      footer: `
        <button class="btn" id="pwa-ios-dismiss">لاحقاً</button>
        <button class="btn btn-primary" id="pwa-ios-ok">
          <i data-lucide="check"></i> فهمت
        </button>
      `,
      onMount: (el, close) => {
        el.querySelector('#pwa-ios-dismiss').onclick = () => {
          PWAState.installDismissed = true;
          lsBoolSet(PWAState.LS_DISMISSED, true);
          close();
        };
        el.querySelector('#pwa-ios-ok').onclick = () => {
          PWAState.installDismissed = true;
          lsBoolSet(PWAState.LS_DISMISSED, true);
          close();
        };
      },
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §5 · NETWORK STATUS WATCHER
     ═════════════════════════════════════════════════════════════════════ */

  function setupNetworkWatcher() {
    const updateUI = (online) => {
      PWAState.online = online;

      const pill = document.getElementById('net-pill');
      const text = document.getElementById('net-text');

      if (pill && text) {
        pill.classList.toggle('offline', !online);
        pill.classList.toggle('online', online);
        text.textContent = online ? 'متصل' : 'غير متصل';
      }

      emit('onlineChange', { online });
    };

    window.addEventListener('online', () => {
      console.log('[PWA] 🌐 عاد الاتصال');
      updateUI(true);

      if (GMS.Beep) GMS.Beep.info();

      if (GMS.Toast) {
        GMS.Toast.ok(
          'عاد الاتصال بالإنترنت',
          'جارٍ مزامنة العمليات المعلَّقة…'
        );
      }

      /* شغّل المزامنة بعد 1.5 ثانية (لضمان استقرار الاتصال) */
      setTimeout(() => triggerQueueSync('online-event'), 1500);

      /* سجّل Background Sync للاحتياط */
      registerBackgroundSync();
    });

    window.addEventListener('offline', () => {
      console.log('[PWA] 📴 انقطع الاتصال');
      updateUI(false);

      if (GMS.Beep) GMS.Beep.warning();

      if (GMS.Toast) {
        GMS.Toast.warn(
          'انقطع الاتصال بالإنترنت',
          'العمل مستمر محلياً — ستتم المزامنة عند عودة الشبكة'
        );
      }
    });

    /* التهيئة الأولية */
    updateUI(navigator.onLine);
  }

  /**
   * مزامنة الطابور — تستدعي SyncEngine.pushQueue()
   */
  async function triggerQueueSync(source = 'manual') {
    if (!navigator.onLine) {
      console.log('[PWA] لا يمكن المزامنة — لا يوجد اتصال');
      return;
    }

    /* استخدم GMS.Sync لو متاح */
    if (GMS.Sync && typeof GMS.Sync.pushQueue === 'function') {
      try {
        console.log(`[PWA] 🔄 Triggering queue sync (${source})`);

        const result = await GMS.Sync.pushQueue();

        if (result && (result.pushed > 0 || result.failed > 0)) {
          const pushed = result.pushed || 0;
          const failed = result.failed || 0;

          if (failed > 0) {
            if (GMS.Toast) {
              GMS.Toast.warn(
                'اكتملت المزامنة مع أخطاء',
                `${pushed} نجحت · ${failed} فشلت`
              );
            }
          } else {
            if (GMS.Toast) {
              GMS.Toast.ok(
                `تمت مزامنة ${pushed} عملية`,
                'كل العمليات المعلَّقة رُفعت بنجاح'
              );
            }
            if (GMS.Beep) GMS.Beep.complete();
          }

          /* حدّث الـ Badge */
          updateBadge();
        }
      } catch (e) {
        console.warn('[PWA] Queue sync failed:', e);
      }
    } else {
      console.warn('[PWA] GMS.Sync.pushQueue not available');
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §6 · BACKGROUND SYNC
     ═════════════════════════════════════════════════════════════════════ */

  async function registerBackgroundSync() {
    if (!('serviceWorker' in navigator) || !('SyncManager' in window)) {
      return false;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.sync.register('gold-sync-queue');
      console.log('[PWA] ✅ Background Sync registered');
      return true;
    } catch (e) {
      console.warn('[PWA] Background Sync registration failed:', e);
      return false;
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §7 · BADGE API
     ═════════════════════════════════════════════════════════════════════ */

  async function setBadge(count) {
    PWAState.badgeCount = Math.max(0, Number(count) || 0);

    if (!('setAppBadge' in navigator)) return false;

    try {
      if (PWAState.badgeCount > 0) {
        await navigator.setAppBadge(PWAState.badgeCount);
      } else {
        await navigator.clearAppBadge();
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  async function updateBadge() {
    /* اقرأ عدد العمليات في الطابور */
    try {
      let count = 0;

      if (GMS.IDB && typeof GMS.IDB.queueCount === 'function') {
        count = await GMS.IDB.queueCount();
      }

      await setBadge(count);

      /* حدّث الـ topbar badge */
      const queueBadge = document.getElementById('queue-badge');
      const tabQueueBadge = document.getElementById('tab-queue-badge');

      if (queueBadge) {
        if (count > 0) {
          queueBadge.style.display = '';
          queueBadge.textContent = count > 99 ? '99+' : String(count);
        } else {
          queueBadge.style.display = 'none';
        }
      }

      if (tabQueueBadge) {
        if (count > 0) {
          tabQueueBadge.style.display = '';
          tabQueueBadge.textContent = count > 99 ? '99+' : String(count);
        } else {
          tabQueueBadge.style.display = 'none';
        }
      }
    } catch (e) {
      console.warn('[PWA] Badge update failed:', e);
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §8 · PUBLIC API
     ═════════════════════════════════════════════════════════════════════ */

  const PWA = {
    /* State */
    get state() { return PWAState; },
    get supported() { return PWAState.supported; },
    get isInstallable() { return PWAState.isInstallable; },
    get isInstalled() { return PWAState.isInstalled; },
    get isStandalone() { return PWAState.isStandalone; },
    get isOnline() { return PWAState.online; },
    get platform() { return PWAState.platform; },
    get version() { return '1.0.0'; },

    /* Init */
    init,

    /* Install */
    promptInstall,
    showInstallButton,
    hideInstallButton,
    showIOSInstallHint,

    /* Service Worker */
    registerServiceWorker,
    applyUpdate,
    getRegistration: () => PWAState.registration,

    /* Background Sync */
    registerBackgroundSync,
    triggerSync: triggerQueueSync,

    /* Badge */
    setBadge,
    updateBadge,

    /* Utilities */
    detectStandalone,

    /* Events */
    on,
  };

  /* ═════════════════════════════════════════════════════════════════════
     §9 · INITIALIZATION
     ═════════════════════════════════════════════════════════════════════ */

  async function init() {
    console.log(
      '%c📱 PWA Manager initializing…',
      'color:#D4A017;font-weight:800;font-size:12px;'
    );

    /* 1 · كشف المنصة */
    detectPlatform();
    detectStandalone();

    console.log(`[PWA] Platform: ${PWAState.platform} | Standalone: ${PWAState.isStandalone}`);

    /* 2 · شبكة */
    setupNetworkWatcher();

    /* 3 · Install prompt */
    setupInstallPrompt();

    /* 4 · Service Worker */
    if (PWAState.supported) {
      setupServiceWorkerMessages();

      const reg = await registerServiceWorker();

      if (reg) {
        console.log('[PWA] ✅ SW registered successfully');

        /* سجّل Background Sync للاحتياط */
        if (navigator.onLine) {
          registerBackgroundSync().catch(() => {});
        }
      }
    }

    /* 5 · ربط زر التثبيت */
    bindInstallButton();

    /* 6 · تحديث الـ Badge الأولي */
    setTimeout(() => updateBadge(), 2000);

    /* 7 · راقب تغييرات الطابور لتحديث الـ Badge */
    setInterval(() => updateBadge(), 30000);

    /* 8 · أحجام الشاشة (install button visibility) */
    observeInstallability();

    console.log(
      `%c[PWA] ✅ Initialized · v1.0.0 · Platform: ${PWAState.platform}`,
      'color:#0f7a43;font-weight:800;font-size:12px;'
    );

    return PWA;
  }

  /**
   * ربط زر التثبيت
   */
  function bindInstallButton() {
    const btn = document.getElementById('pwa-install-btn');
    if (!btn) {
      console.warn('[PWA] #pwa-install-btn غير موجود في DOM');
      return;
    }

    btn.onclick = () => promptInstall();

    /* إذا كان مثبَّتاً بالفعل — أخفِ الزر */
    if (PWAState.isInstalled) {
      btn.style.display = 'none';
    }
  }

  /**
   * راقب قابلية التثبيت
   */
  function observeInstallability() {
    /* إذا كان installPrompt متاح، أظهر الزر */
    if (PWAState.installPrompt && !PWAState.isInstalled) {
      showInstallButton();
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §10 · EXPORT
     ═════════════════════════════════════════════════════════════════════ */
  GMS.PWA = PWA;

  /* ═════════════════════════════════════════════════════════════════════
     §11 · AUTO-INIT
     ═════════════════════════════════════════════════════════════════════
     ننتظر حتى ينتهي تحميل DOM ثم نبدأ
     ═════════════════════════════════════════════════════════════════════ */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      /* تأخير بسيط لضمان تحميل باقي الموديولات */
      setTimeout(() => init().catch(e => console.error('[PWA] Init failed:', e)), 100);
    });
  } else {
    setTimeout(() => init().catch(e => console.error('[PWA] Init failed:', e)), 100);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §12 · LOADED CONFIRMATION
     ═════════════════════════════════════════════════════════════════════ */
  console.log(
    '%c📱 PWA Module loaded · Install + Update + Background Sync',
    'color:#D4A017;font-weight:800;font-size:12px;padding:2px 6px;' +
    'background:#121212;border-radius:4px;'
  );

  console.log(
    `%c🔧 beforeinstallprompt · Update notifications · Network watcher · Badge API`,
    'color:#6b7a95;font-weight:700;font-size:11px;'
  );

  /* ═════════════════════════════════════════════════════════════════════
     ✅ js/25-pwa.js — نهاية الملف
     ═════════════════════════════════════════════════════════════════════ */

})();