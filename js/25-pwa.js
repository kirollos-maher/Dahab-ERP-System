/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ENTERPRISE — js/25-pwa.js
   PWA Manager — إدارة التثبيت، التحديثات، والمزامنة الخلفية
   ✅ v1.1.0: زر التثبيت دائم الظهور + إرشادات يدوية

   - Install Prompt (beforeinstallprompt)
   - Update Notifications (SW updates)
   - Network Status Watcher (online/offline)
   - Background Sync Registration
   - Badge API (App Icon Badge)
   - Standalone Detection
   - iOS Manual Install Guide
   - ✅ Manual Install Instructions (fallback)
   - ✅ Always-visible Install Button
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
    platform: 'unknown',
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

    /* ✅ v1.1.0: مفاتيح جديدة — تعمل reset تلقائي للمستخدمين القدام */
    LS_DISMISSED: 'gms.pwa.installDismissed.v2',
    LS_INSTALLED: 'gms.pwa.installed.v2',
    LS_LAST_DISMISS: 'gms.pwa.lastDismissAt.v2',

    /* مدة تجاهل الرفض = 7 أيام */
    DISMISS_COOLDOWN_MS: 7 * 24 * 60 * 60 * 1000,
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

  function detectStandalone() {
    const modes = [
      window.matchMedia('(display-mode: standalone)').matches,
      window.matchMedia('(display-mode: fullscreen)').matches,
      window.matchMedia('(display-mode: minimal-ui)').matches,
      window.navigator.standalone === true,
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
      console.warn('[PWA] Service Worker غير مدعوم');
      return null;
    }

    const isLocalhost =
      location.hostname === 'localhost' ||
      location.hostname === '127.0.0.1';
    const isHttps = location.protocol === 'https:';

    if (!isHttps && !isLocalhost) {
      console.warn('[PWA] Service Worker يتطلب HTTPS');
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

      setupUpdateDetection(registration);

      if (registration.waiting) {
        handleUpdateFound(registration.waiting);
      }

      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) return;

        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
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

  function setupUpdateDetection(registration) {
    setInterval(() => {
      registration.update().catch(() => {});
    }, 30 * 60 * 1000);

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        registration.update().catch(() => {});
      }
    });
  }

  function handleUpdateFound(worker) {
    PWAState.updateAvailable = true;
    PWAState.waitingWorker = worker;

    console.log('[PWA] تحديث جديد متاح');

    if (GMS.Toast) {
      GMS.Toast.show({
        title: 'تحديث جديد متاح',
        desc: 'يتوفر إصدار أحدث — أعد التحميل للحصول على آخر الميزات',
        type: 'info',
        icon: 'download-cloud',
        ms: 0,
        closable: true,
        action: () => applyUpdate(),
        actionLabel: 'تحديث الآن',
      });
    }

    emit('updated', { available: true });
  }

  function applyUpdate() {
    const worker = PWAState.waitingWorker;
    if (!worker) {
      location.reload();
      return;
    }

    worker.postMessage({ type: 'SKIP_WAITING' });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    }, { once: true });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §4 · INSTALL PROMPT — ✅ v1.1.0 (ALWAYS VISIBLE)
     ═════════════════════════════════════════════════════════════════════ */

  function setupInstallPrompt() {
    /* اقرأ الحالة */
    PWAState.isInstalled = lsBoolGet(PWAState.LS_INSTALLED, false) || detectStandalone();

    /* ✅ reset dismiss flag لو مر عليه 7 أيام */
    try {
      const lastDismiss = Number(localStorage.getItem(PWAState.LS_LAST_DISMISS));
      if (lastDismiss && Date.now() - lastDismiss > PWAState.DISMISS_COOLDOWN_MS) {
        localStorage.removeItem(PWAState.LS_DISMISSED);
        localStorage.removeItem(PWAState.LS_LAST_DISMISS);
        PWAState.installDismissed = false;
        console.log('[PWA] 🔄 Reset install dismiss (cooldown expired)');
      } else {
        PWAState.installDismissed = lsBoolGet(PWAState.LS_DISMISSED, false);
      }
    } catch (_) {
      PWAState.installDismissed = false;
    }

    if (PWAState.isInstalled || PWAState.isStandalone) {
      hideInstallButton();
    } else {
      /* ✅ v1.1.0: أظهر الزر دائمًا لو غير مثبت */
      showInstallButton();
    }

    /* ✅ التقاط beforeinstallprompt */
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();

      PWAState.installPrompt = event;
      PWAState.isInstallable = true;

      console.log('[PWA] 📲 beforeinstallprompt fired — install available');

      showInstallButton();
      emit('installAvailable', { available: true });
    });

    /* ✅ التقاط appinstalled */
    window.addEventListener('appinstalled', () => {
      console.log('[PWA] ✅ التطبيق تم تثبيته');

      PWAState.isInstalled = true;
      PWAState.isInstallable = false;
      PWAState.installPrompt = null;

      lsBoolSet(PWAState.LS_INSTALLED, true);

      hideInstallButton();

      if (GMS.Toast) {
        GMS.Toast.ok(
          'تم تثبيت Gold ERP Pro',
          'التطبيق متاح الآن من الشاشة الرئيسية'
        );
      }

      if (GMS.Beep) GMS.Beep.complete();

      emit('installed', { installed: true });
    });

    /* iOS: ما بيطلقش beforeinstallprompt */
    if (PWAState.platform === 'ios' && !PWAState.isStandalone) {
      console.log('[PWA] iOS detected — manual install via Share menu');
    }
  }

  /**
   * عرض زر التثبيت في الـ Topbar
   * ✅ v1.1.0: بيظهر دائمًا لو غير مثبت
   */
  function showInstallButton() {
    const btn = document.getElementById('pwa-install-btn');
    if (!btn) {
      console.warn('[PWA] #pwa-install-btn غير موجود في DOM');
      return;
    }

    btn.style.display = '';
    btn.classList.add('pwa-install-pulse');
    console.log('[PWA] 📲 Install button shown');
  }

  function hideInstallButton() {
    const btn = document.getElementById('pwa-install-btn');
    if (!btn) return;

    btn.style.display = 'none';
    btn.classList.remove('pwa-install-pulse');
  }

  /**
   * تنفيذ التثبيت — مع Fallback للإرشادات اليدوية
   * ✅ v1.1.0: لو مفيش prompt، نعرض الإرشادات بدل ما نرفض
   */
  async function promptInstall() {
    const prompt = PWAState.installPrompt;

    /* iOS → إرشادات Share menu */
    if (PWAState.platform === 'ios') {
      showIOSInstallHint(true);
      return;
    }

    /* مثبت بالفعل */
    if (PWAState.isInstalled || PWAState.isStandalone) {
      if (GMS.Toast) {
        GMS.Toast.info('التطبيق مثبَّت بالفعل', 'مفتوح من الشاشة الرئيسية');
      }
      hideInstallButton();
      return;
    }

    /* مفيش prompt متاح → إرشادات يدوية */
    if (!prompt) {
      console.log('[PWA] No install prompt available — showing instructions');
      showManualInstallInstructions();
      return;
    }

    /* استخدم الـ prompt */
    try {
      prompt.prompt();

      const choice = await prompt.userChoice;

      console.log(`[PWA] Install choice: ${choice.outcome}`);

      if (choice.outcome === 'accepted') {
        console.log('[PWA] المستخدم وافق على التثبيت');
      } else {
        console.log('[PWA] المستخدم رفض التثبيت');

        PWAState.installDismissed = true;
        lsBoolSet(PWAState.LS_DISMISSED, true);

        try {
          localStorage.setItem(PWAState.LS_LAST_DISMISS, String(Date.now()));
        } catch (_) {}

        /* ✅ ما نخفيش الزر — نخليه يظهر تاني لو رجع */
        /* hideInstallButton(); — لا نستخدمها */
      }

      PWAState.installPrompt = null;
      PWAState.isInstallable = false;

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
          try {
            localStorage.setItem(PWAState.LS_LAST_DISMISS, String(Date.now()));
          } catch (_) {}
          close();
        };
        el.querySelector('#pwa-ios-ok').onclick = () => {
          PWAState.installDismissed = true;
          lsBoolSet(PWAState.LS_DISMISSED, true);
          try {
            localStorage.setItem(PWAState.LS_LAST_DISMISS, String(Date.now()));
          } catch (_) {}
          close();
        };
      },
    });
  }

  /**
   * ✅ v1.1.0: إرشادات التثبيت اليدوية (Android/Desktop)
   */
  function showManualInstallInstructions() {
    if (!GMS.Modal) return;

    const isAndroid = PWAState.platform === 'android';
    const isDesktop = PWAState.platform === 'desktop';

    GMS.Modal.open({
      title: 'تثبيت Gold ERP Pro',
      icon: 'download',
      size: 'sm',
      body: `
        <div style="text-align:center;padding:8px 0 20px">
          <div style="width:72px;height:72px;border-radius:22px;
                      background:var(--gold-grad);display:grid;
                      place-items:center;margin:0 auto 14px;color:#2a1f05;
                      box-shadow:0 14px 34px -12px rgba(184,145,47,.9)">
            <i data-lucide="download" style="width:32px;height:32px"></i>
          </div>
          <h3 style="font-size:16px;margin-bottom:6px">
            تثبيت التطبيق على جهازك
          </h3>
          <p style="font-size:12px;color:var(--muted);font-weight:600;
                    line-height:1.7">
            اتبع الخطوات حسب نوع المتصفح
          </p>
        </div>

        ${isAndroid ? `
          <div style="padding:14px;background:var(--info-bg);
                      border-radius:11px;margin-bottom:12px;
                      border-inline-start:3px solid var(--info)">
            <div style="font-size:12.5px;font-weight:900;margin-bottom:8px;
                        color:var(--info)">
              <i data-lucide="chrome" style="width:14px;height:14px;
                 display:inline;vertical-align:-2px"></i>
              Google Chrome / Edge (Android)
            </div>
            <ol style="margin:0;padding-inline-start:18px;
                       font-size:11.5px;line-height:1.9;font-weight:600">
              <li>اضغط على قائمة المتصفح (3 نقاط) في الأعلى</li>
              <li>اختر "تثبيت التطبيق" أو "Add to Home screen"</li>
              <li>أكّد التثبيت</li>
            </ol>
          </div>
        ` : ''}

        ${isDesktop ? `
          <div style="padding:14px;background:var(--info-bg);
                      border-radius:11px;margin-bottom:12px;
                      border-inline-start:3px solid var(--info)">
            <div style="font-size:12.5px;font-weight:900;margin-bottom:8px;
                        color:var(--info)">
              <i data-lucide="monitor" style="width:14px;height:14px;
                 display:inline;vertical-align:-2px"></i>
              على الكمبيوتر
            </div>
            <ol style="margin:0;padding-inline-start:18px;
                       font-size:11.5px;line-height:1.9;font-weight:600">
              <li>ابحث عن أيقونة التثبيت في شريط العنوان (⊕)</li>
              <li>أو افتح القائمة واختر "Install Gold ERP Pro"</li>
              <li>أكّد التثبيت</li>
            </ol>
          </div>
        ` : ''}

        <div style="padding:12px 14px;background:var(--surface-2);
                    border-radius:10px;border:1px solid var(--border);
                    font-size:11.5px;font-weight:600;
                    line-height:1.7;color:var(--text-2);
                    margin-top:12px">
          <i data-lucide="info" style="width:13px;height:13px;
             display:inline;vertical-align:-2px;color:var(--info)"></i>
          <b>ملاحظة:</b> إذا لم تجد خيار التثبيت، فالمتصفح قد لا يدعم
          التثبيت في الوقت الحالي. جرّب تحديث الصفحة أو استخدام
          متصفح Chrome / Edge.
        </div>
      `,
      footer: `
        <button class="btn" data-close>حسناً</button>
        <button class="btn btn-primary" id="pwa-reload-try">
          <i data-lucide="refresh-cw"></i> إعادة تحميل الصفحة
        </button>
      `,
      onMount: (el, close) => {
        const reloadBtn = el.querySelector('#pwa-reload-try');
        if (reloadBtn) {
          reloadBtn.onclick = () => {
            close();
            window.location.reload();
          };
        }
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

      setTimeout(() => triggerQueueSync('online-event'), 1500);
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

    updateUI(navigator.onLine);
  }

  async function triggerQueueSync(source = 'manual') {
    if (!navigator.onLine) {
      console.log('[PWA] لا يمكن المزامنة — لا يوجد اتصال');
      return;
    }

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
    try {
      let count = 0;

      if (GMS.IDB && typeof GMS.IDB.queueCount === 'function') {
        count = await GMS.IDB.queueCount();
      }

      await setBadge(count);

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
     §8 · ✅ v1.1.0: RESET / FORCE INSTALL API
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * إعادة ضبط حالة الرفض — يدويًا
   * مفيد لو المستخدم رفض بالغلط
   */
  function resetInstallDismissed() {
    try {
      localStorage.removeItem(PWAState.LS_DISMISSED);
      localStorage.removeItem(PWAState.LS_LAST_DISMISS);
      PWAState.installDismissed = false;
      showInstallButton();
      console.log('[PWA] 🔄 Install dismissed flag reset');
      return true;
    } catch (e) {
      console.warn('[PWA] resetInstallDismissed failed:', e);
      return false;
    }
  }

  /**
   * معلومات التشخيص — لعرضها في Settings
   */
  function getInstallDiagnostics() {
    return {
      isInstalled: PWAState.isInstalled,
      isStandalone: PWAState.isStandalone,
      isInstallable: PWAState.isInstallable,
      hasPrompt: Boolean(PWAState.installPrompt),
      installDismissed: PWAState.installDismissed,
      platform: PWAState.platform,
      swRegistered: PWAState.registered,
      swSupported: PWAState.supported,
      online: PWAState.online,
      version: '1.1.0',
    };
  }

  /* ═════════════════════════════════════════════════════════════════════
     §9 · PUBLIC API
     ═════════════════════════════════════════════════════════════════════ */

  const PWA = {
    get state() { return PWAState; },
    get supported() { return PWAState.supported; },
    get isInstallable() { return PWAState.isInstallable; },
    get isInstalled() { return PWAState.isInstalled; },
    get isStandalone() { return PWAState.isStandalone; },
    get isOnline() { return PWAState.online; },
    get platform() { return PWAState.platform; },
    get version() { return '1.1.0'; },

    init,
    promptInstall,
    showInstallButton,
    hideInstallButton,
    showIOSInstallHint,
    showManualInstallInstructions,
    resetInstallDismissed,
    getInstallDiagnostics,

    registerServiceWorker,
    applyUpdate,
    getRegistration: () => PWAState.registration,

    registerBackgroundSync,
    triggerSync: triggerQueueSync,

    setBadge,
    updateBadge,

    detectStandalone,

    on,
  };

  /* ═════════════════════════════════════════════════════════════════════
     §10 · INITIALIZATION
     ═════════════════════════════════════════════════════════════════════ */

  async function init() {
    console.log(
      '%c📱 PWA Manager v1.1.0 initializing…',
      'color:#D4A017;font-weight:800;font-size:12px;'
    );

    detectPlatform();
    detectStandalone();

    console.log(`[PWA] Platform: ${PWAState.platform} | Standalone: ${PWAState.isStandalone}`);

    setupNetworkWatcher();
    setupInstallPrompt();

    if (PWAState.supported) {
      setupServiceWorkerMessages();

      const reg = await registerServiceWorker();

      if (reg) {
        console.log('[PWA] ✅ SW registered successfully');

        if (navigator.onLine) {
          registerBackgroundSync().catch(() => {});
        }
      }
    }

    bindInstallButton();

    setTimeout(() => updateBadge(), 2000);
    setInterval(() => updateBadge(), 30000);

    console.log(
      `%c[PWA] ✅ Initialized · v1.1.0 · Platform: ${PWAState.platform}`,
      'color:#0f7a43;font-weight:800;font-size:12px;'
    );

    /* ✅ v1.1.0: أظهر الزر بعد 1 ثانية — حتى لو لم يطلق beforeinstallprompt */
    setTimeout(() => {
      if (!PWAState.isInstalled && !PWAState.isStandalone) {
        showInstallButton();
      }
    }, 1000);

    return PWA;
  }

  function bindInstallButton() {
    const btn = document.getElementById('pwa-install-btn');
    if (!btn) {
      console.warn('[PWA] #pwa-install-btn غير موجود في DOM');
      return;
    }

    btn.onclick = () => promptInstall();

    if (PWAState.isInstalled) {
      btn.style.display = 'none';
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §11 · EXPORT
     ═════════════════════════════════════════════════════════════════════ */
  GMS.PWA = PWA;

  /* ═════════════════════════════════════════════════════════════════════
     §12 · AUTO-INIT
     ═════════════════════════════════════════════════════════════════════ */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => init().catch(e => console.error('[PWA] Init failed:', e)), 100);
    });
  } else {
    setTimeout(() => init().catch(e => console.error('[PWA] Init failed:', e)), 100);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §13 · LOADED CONFIRMATION
     ═════════════════════════════════════════════════════════════════════ */
  console.log(
    '%c📱 PWA Module v1.1.0 loaded · Always-Visible Install',
    'color:#D4A017;font-weight:800;font-size:12px;padding:2px 6px;' +
    'background:#121212;border-radius:4px;'
  );

  console.log(
    `%c🔧 Always-visible install button · Manual instructions fallback · Auto-reset after 7 days`,
    'color:#6b7a95;font-weight:700;font-size:11px;'
  );

  /* ═════════════════════════════════════════════════════════════════════
     ✅ js/25-pwa.js — نهاية الملف
     ═════════════════════════════════════════════════════════════════════ */

})();
