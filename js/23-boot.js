/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ENTERPRISE — js/23-boot.js
   نقطة التشغيل النهائية + PWA Integration
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const GMS = window.GMS = window.GMS || {};

  /* ═════════════════════════════════════════════════════════════════════
     §1 · BOOT STATE
     ═════════════════════════════════════════════════════════════════════ */
  const BootState = {
    stage: 'idle',
    startedAt: null,
    completedAt: null,
    elapsedMs: 0,

    initialized: false,
    authenticated: false,
    appReady: false,

    errors: [],

    systems: {
      i18n: false,
      cache: false,
      auth: false,
      sync: false,
      realtime: false,
      router: false,
      ui: false,
      repair: false,
      /* ✅ PWA */
      sw: false,
      pwa: false,
    },

    unsubscribers: [],
  };

  /* ═════════════════════════════════════════════════════════════════════
     §2 · HELPERS
     ═════════════════════════════════════════════════════════════════════ */

  function recordError(system, error) {
    const entry = {
      system,
      message: error?.message || String(error),
      stack: error?.stack || '',
      at: new Date().toISOString(),
    };
    BootState.errors.push(entry);
    console.error(`[Boot] ${system} failed:`, error);
    return entry;
  }

  function markSystem(system) {
    if (BootState.systems.hasOwnProperty(system)) {
      BootState.systems[system] = true;
    }
  }

  function updateBootProgress(label, percent) {
    const el = document.getElementById('boot-progress-label');
    const fill = document.getElementById('boot-progress-fill');

    if (el) el.textContent = label;
    if (fill) fill.style.width = Math.max(0, Math.min(100, percent)) + '%';
  }

  function hideBootScreen() {
    const el = document.getElementById('boot-screen');
    if (!el) return;

    el.style.opacity = '0';
    setTimeout(() => {
      el.style.display = 'none';
      el.remove();
    }, 350);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §3 · GLOBAL ERROR HANDLERS
     ═════════════════════════════════════════════════════════════════════ */

  function bindGlobalErrorHandlers() {
    window.addEventListener('error', (event) => {
      recordError('window', event.error || event.message);

      if (GMS.Toast && !event.filename?.includes('extension')) {
        GMS.Toast.err('حدث خطأ غير متوقع', event.message || 'راجع Console');
      }
    });

    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      recordError('promise', reason);

      if (reason?.name === 'AbortError') return;

      if (GMS.Toast) {
        GMS.Toast.warn(
          'عملية غير مكتملة',
          reason?.message || 'لم تكتمل العملية بنجاح'
        );
      }
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §4 · ✅ PWA — SERVICE WORKER REGISTRATION
     ─────────────────────────────────────────────────────────────────────
     يتم التسجيل مبكراً حتى تُخزَّن الملفات بينما يستمر الـ Boot
     ═════════════════════════════════════════════════════════════════════ */

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      console.log('[Boot] Service Worker غير مدعوم');
      return false;
    }

    /* تحقق من وجود HTTPS (أو localhost) */
    const isLocalhost =
      location.hostname === 'localhost' ||
      location.hostname === '127.0.0.1';
    const isHttps = location.protocol === 'https:';

    if (!isHttps && !isLocalhost) {
      console.warn('[Boot] SW يتطلب HTTPS — تم التخطي');
      return false;
    }

    try {
      /* التسجيل الفعلي مُدار عبر js/25-pwa.js لتفادي التكرار */
      if (GMS.PWA && typeof GMS.PWA.registerServiceWorker === 'function') {
        const reg = await GMS.PWA.registerServiceWorker();
        if (reg) {
          markSystem('sw');
          console.log('[Boot] ✅ Service Worker registered');
          return true;
        }
      }

      /* Fallback — تسجيل مباشر */
      const reg = await navigator.serviceWorker.register('./service-worker.js');
      markSystem('sw');
      console.log('[Boot] ✅ Service Worker registered (fallback)');
      return Boolean(reg);

    } catch (e) {
      recordError('sw', e);
      return false;
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §5 · AUTH UI BINDING
     ═════════════════════════════════════════════════════════════════════ */

  function bindLoginForm() {
    const form = document.getElementById('login-form');
    const errEl = document.getElementById('login-error');
    const submitBtn = document.getElementById('login-submit');

    if (!form) return;

    form.onsubmit = async (e) => {
      e.preventDefault();

      const email = document.getElementById('login-email')?.value.trim();
      const password = document.getElementById('login-password')?.value;

      if (!email || !password) return;

      const originalHTML = submitBtn?.innerHTML;
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `
          <i data-lucide="loader-circle"></i>
          جارٍ التحقق…
        `;
        window.lucide?.createIcons();
      }

      if (errEl) errEl.classList.add('hidden');

      try {
        const profile = await GMS.Auth.signIn(email, password);

        /* ✅ إخفاء شاشة تسجيل الدخول وإظهار التطبيق */
        const loginScreen = document.getElementById('login-screen');
        if (loginScreen) loginScreen.style.display = 'none';

        const app = document.getElementById('app');
        if (app) app.classList.add('visible');

        if (GMS.Audit) {
          await GMS.Audit.log(
            'LOGIN',
            'session',
            profile.id,
            `تسجيل دخول — ${profile.full_name}`,
            { email: profile.email, role: profile.role }
          );
        }

        GMS.Beep?.success?.();

        await startApp();

      } catch (err) {
        console.error('[Boot] Login failed:', err);

        if (errEl) {
          errEl.textContent = err.message || 'فشل تسجيل الدخول';
          errEl.classList.remove('hidden');
        }

        GMS.Beep?.error?.();

        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = originalHTML;
          window.lucide?.createIcons();
        }
      }
    };

    setTimeout(() => {
      document.getElementById('login-email')?.focus();
    }, 400);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §6 · LOGOUT UI
     ═════════════════════════════════════════════════════════════════════ */

  function bindLogoutButton() {
    const btn = document.getElementById('logout-btn');
    if (!btn) return;

    btn.onclick = async () => {
      const ok = await GMS.Confirm.ask(
        'هل تريد تسجيل الخروج من النظام؟',
        {
          title: 'تسجيل الخروج',
          okText: 'خروج',
          cancelText: 'إلغاء',
          danger: true,
          icon: 'log-out',
        }
      );

      if (!ok) return;

      try {
        if (GMS.Audit && GMS.Auth.profile) {
          await GMS.Audit.log(
            'LOGOUT',
            'session',
            GMS.Auth.profile.id,
            `تسجيل خروج — ${GMS.Auth.profile.full_name}`
          );
        }
      } catch (_) {}

      try {
        if (GMS.Router) GMS.Router.destroy();
        if (GMS.Realtime) GMS.Realtime.shutdown();
        if (GMS.Sync) GMS.Sync.shutdown?.();
        if (GMS.Queue) GMS.Queue.stopAutoSync?.();
      } catch (e) {
        console.warn('[Boot] Shutdown error:', e);
      }

      await GMS.Auth.signOut();

      GMS.Beep?.delete?.();

      setTimeout(() => location.reload(), 300);
    };
  }

  /* ═════════════════════════════════════════════════════════════════════
     §7 · TOPBAR BINDING
     ═════════════════════════════════════════════════════════════════════ */

  function bindTopbar() {
    /* Theme toggle */
    const themeBtn = document.getElementById('theme-btn');
    if (themeBtn) {
      themeBtn.onclick = () => {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';

        document.documentElement.setAttribute('data-theme', next);
        try {
          localStorage.setItem(GMS.LS_KEYS.THEME, next);
        } catch (_) {}

        themeBtn.innerHTML = `<i data-lucide="${next === 'dark' ? 'sun' : 'moon'}"></i>`;
        window.lucide?.createIcons();

        if (GMS.Views?.settings?.state?.draft) {
          GMS.Views.settings.state.draft.theme = next;
        }

        GMS.Beep?.info?.();
      };

      const current = document.documentElement.getAttribute('data-theme');
      themeBtn.innerHTML = `<i data-lucide="${current === 'dark' ? 'sun' : 'moon'}"></i>`;
      window.lucide?.createIcons();
    }

    /* Language switcher */
    document.querySelectorAll('.lang-btn, [data-lang]').forEach(btn => {
      btn.onclick = () => {
        const lang = btn.dataset.lang;
        if (!lang) return;

        if (GMS.I18n?.setLang) {
          GMS.I18n.setLang(lang);
        }

        document.querySelectorAll('.lang-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.lang === lang);
        });

        if (GMS.Router) {
          GMS.Router.reload();
        }

        GMS.Beep?.info?.();
      };
    });

    /* Sync button */
    const syncBtn = document.getElementById('sync-btn');
    if (syncBtn) {
      syncBtn.onclick = async () => {
        syncBtn.classList.add('spinning');
        syncBtn.disabled = true;

        try {
          if (GMS.Sync) {
            await GMS.Sync.deltaSync();
            if (GMS.Sync.state.online) {
              await GMS.Sync.pushQueue();
            }
          }

          GMS.Toast.ok('تمت المزامنة');

        } catch (e) {
          GMS.Toast.err('فشلت المزامنة', e.message);
        } finally {
          syncBtn.classList.remove('spinning');
          syncBtn.disabled = false;
        }
      };
    }

    /* Cache refresh button */
    const cacheBtn = document.getElementById('cache-btn');
    if (cacheBtn) {
      cacheBtn.onclick = async () => {
        const ok = await GMS.Confirm.ask(
          'سيتم إعادة تحميل كل البيانات من الخادم. قد يستغرق بعض الوقت. متابعة؟',
          {
            title: 'تحديث الذاكرة',
            okText: 'تحديث',
            danger: false,
            icon: 'database-zap',
          }
        );

        if (!ok) return;

        cacheBtn.classList.add('spinning');
        cacheBtn.disabled = true;

        try {
          if (GMS.Sync) {
            await GMS.Sync.fullSync();
          }
          GMS.Toast.ok('تم تحديث الذاكرة المؤقتة');

        } catch (e) {
          GMS.Toast.err('فشل التحديث', e.message);
        } finally {
          cacheBtn.classList.remove('spinning');
          cacheBtn.disabled = false;
        }
      };
    }

    /* Queue button */
    const queueBtn = document.getElementById('queue-btn');
    if (queueBtn) {
      queueBtn.onclick = () => {
        GMS.Router?.go('queue');
      };
    }

    /* Settings button */
    const settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn) {
      settingsBtn.onclick = () => {
        GMS.Router?.go('settings');
      };
    }

    /* Connection chip */
    const connChip = document.getElementById('conn-chip');
    if (connChip) {
      connChip.onclick = () => {
        showConnectionInfo();
      };
    }
  }

  function showConnectionInfo() {
    const online = GMS.Sync?.state?.online !== false;
    const sbReady = GMS.Sync?.state?.supabaseReady || false;
    const rtStatus = GMS.Realtime?.state?.channelStatus || 'idle';
    const queueCount = GMS.Queue?.state?.items?.length || 0;
    const pwaStandalone = GMS.PWA?.isStandalone || false;
    const pwaInstallable = GMS.PWA?.isInstallable || false;

    const rtLabels = {
      connected: 'مباشر · متصل',
      connecting: 'جارٍ الاتصال…',
      error: 'خطأ',
      idle: 'غير متصل',
    };

    GMS.Modal.open({
      title: 'حالة الاتصال والنظام',
      icon: 'wifi',
      size: 'sm',
      body: `
        <div class="calc-list">
          <div class="cl-row">
            <span class="k">
              <i data-lucide="globe"></i>
              الشبكة
            </span>
            <span class="v" style="color:${online ? 'var(--success)' : 'var(--warn)'}">
              ${online ? 'متصل' : 'غير متصل'}
            </span>
          </div>

          <div class="cl-row">
            <span class="k">
              <i data-lucide="database"></i>
              Supabase
            </span>
            <span class="v" style="color:${sbReady ? 'var(--success)' : 'var(--muted)'}">
              ${sbReady ? 'متصل' : 'غير مُهيّأ'}
            </span>
          </div>

          <div class="cl-row">
            <span class="k">
              <i data-lucide="radio"></i>
              Realtime
            </span>
            <span class="v" style="color:${rtStatus === 'connected' ? 'var(--success)' : 'var(--warn)'}">
              ${rtLabels[rtStatus] || rtStatus}
            </span>
          </div>

          <div class="cl-row">
            <span class="k">
              <i data-lucide="package"></i>
              طابور المزامنة
            </span>
            <span class="v" style="color:${queueCount > 0 ? 'var(--warn)' : 'var(--muted)'}">
              ${GMS.intFmt(queueCount)} فاتورة
            </span>
          </div>

          <div class="cl-row">
            <span class="k">
              <i data-lucide="clock"></i>
              آخر مزامنة
            </span>
            <span class="v" style="font-size:12px">
              ${GMS.timeAgo(GMS.Sync?.state?.stats?.lastSync)}
            </span>
          </div>

          <div class="cl-row">
            <span class="k">
              <i data-lucide="activity"></i>
              الأحداث المستقبلة
            </span>
            <span class="v">
              ${GMS.intFmt(GMS.Realtime?.state?.stats?.totalEvents || 0)}
            </span>
          </div>

          <div class="cl-row" style="border-top:1.5px solid var(--border);
                       padding-top:14px;margin-top:8px">
            <span class="k">
              <i data-lucide="smartphone"></i>
              PWA
            </span>
            <span class="v" style="color:${pwaStandalone ? 'var(--success)' : 'var(--muted)'}">
              ${pwaStandalone ? 'مثبَّت (Standalone)' : 'متصفح عادي'}
            </span>
          </div>

          ${!pwaStandalone && pwaInstallable ? `
            <div style="padding:10px 12px;background:var(--gold-soft);
                        border-radius:9px;margin-top:8px;font-size:11.5px;
                        font-weight:700;color:var(--warn)">
              <i data-lucide="download" style="width:12px;height:12px;
                 display:inline;vertical-align:-2px"></i>
              التطبيق قابل للتثبيت — اضغط أيقونة التحميل في الشريط العلوي
            </div>
          ` : ''}
        </div>
      `,
      footer: `
        <button class="btn" data-close>إغلاق</button>
        <button class="btn btn-primary" id="conn-reconnect">
          <i data-lucide="refresh-cw"></i>
          إعادة الاتصال
        </button>
      `,
      onMount: (el, close) => {
        el.querySelector('#conn-reconnect').onclick = () => {
          close();
          if (GMS.Realtime) {
            GMS.Realtime.unsubscribe();
            setTimeout(() => GMS.Realtime.subscribe(), 200);
          }
          GMS.Toast.info('جارٍ إعادة الاتصال…');
        };
      },
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §8 · STARTUP SEQUENCE
     ═════════════════════════════════════════════════════════════════════ */

  async function startApp() {
    try {
      updateBootProgress('تهيئة الذاكرة المؤقتة…', 45);

      /* 1 · Cache warmup */
      if (GMS.Cache) {
        try {
          await GMS.Cache.warmup({
            manufacturers: GMS.Demo?.getManufacturers(),
            workmanship: GMS.WORKMANSHIP_MATRIX,
            profile: GMS.Auth?.profile,
            preferences: {
              theme: GMS.Auth?.profile?.theme || 'light',
              lang: GMS.Auth?.profile?.lang || 'ar',
            },
            branches: GMS.Demo?.getBranches(),
          });

          markSystem('cache');
          updateBootProgress('الذاكرة جاهزة', 55);

        } catch (e) {
          recordError('cache', e);
        }
      }

      /* 2 · Sync engine */
      updateBootProgress('الاتصال بـ Supabase…', 65);

      if (GMS.Sync) {
        try {
          await GMS.Sync.init({
            autoSync: true,
            realtime: false,
            initialSync: false,
          });

          markSystem('sync');
          updateBootProgress('المزامنة جاهزة', 75);

        } catch (e) {
          recordError('sync', e);
        }
      }

      /* 3 · Realtime */
      updateBootProgress('تفعيل التحديثات المباشرة…', 82);

      if (GMS.Realtime) {
        try {
          await GMS.Realtime.init({
            autoSubscribe: true,
            loadFeed: true,
          });

          markSystem('realtime');
          updateBootProgress('التحديثات المباشرة جاهزة', 88);

        } catch (e) {
          recordError('realtime', e);
        }
      }

      /* 4 · Realtime to UI */
      bindRealtimeToUI();

      /* 5 · Router */
      updateBootProgress('تحضير الواجهة…', 92);

      if (GMS.Router) {
        try {
          await GMS.Router.init({
            defaultRoute: 'dashboard',
            listenHash: true,
            listenKeyboard: true,
          });

          markSystem('router');
          updateBootProgress('الواجهة جاهزة', 97);

        } catch (e) {
          recordError('router', e);
        }
      }

      /* 6 · Repair module check */
      if (GMS.Views?.repair) {
        markSystem('repair');
        console.log('[Boot] ✅ Repair module detected');
      }

      /* ✅ 7 · PWA module check */
      if (GMS.PWA) {
        markSystem('pwa');
        console.log('[Boot] ✅ PWA module detected');

        /* تأكد من أن Badge محدَّث */
        if (GMS.PWA.updateBadge) {
          setTimeout(() => GMS.PWA.updateBadge(), 500);
        }
      }

      /* 8 · Welcome */
      updateBootProgress('جارٍ التشغيل…', 100);

      await GMS.sleep(200);

      hideBootScreen();

      BootState.appReady = true;
      BootState.completedAt = new Date().toISOString();
      BootState.elapsedMs = Date.now() - BootState.startedAt;

      try {
        localStorage.setItem('gms.lastBoot', BootState.completedAt);
      } catch (_) {}

      const profile = GMS.Auth.profile;
      GMS.Toast.ok(
        `مرحباً ${profile.full_name} 👋`,
        `أنت مسجَّل الدخول بدور: ${GMS.ROLES[profile.role]?.label || profile.role}`
      );

      console.log(
        `[Boot] ✅ App ready in ${BootState.elapsedMs}ms`,
        BootState.systems
      );

      window.dispatchEvent(new CustomEvent('gms:ready', {
        detail: { bootState: BootState },
      }));

      return true;

    } catch (e) {
      recordError('startApp', e);
      hideBootScreen();

      GMS.Toast.err(
        'فشل بدء التشغيل',
        'تحقق من Console للأخطاء'
      );

      console.error('[Boot] Fatal startup error:', e);
      return false;
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §9 · REALTIME → UI BINDING
     ═════════════════════════════════════════════════════════════════════ */

  function bindRealtimeToUI() {
    if (!GMS.Realtime) return;

    const unsub = GMS.Realtime.on('event', (event) => {
      if (GMS.Router?.currentId() === 'dashboard') {
        GMS.Router.scheduleRerender(1500);
      }
    });

    BootState.unsubscribers.push(unsub);

    if (GMS.Sync) {
      const unsub2 = GMS.Sync.on('onlineChange', (data) => {
        if (data.online) {
          GMS.Toast.ok('عاد الاتصال', 'جارٍ رفع الطابور…');

          setTimeout(() => {
            if (GMS.Sync.state.online) {
              GMS.Sync.pushQueue().catch(() => {});
            }
          }, 1200);
        } else {
          GMS.Toast.warn('انقطع الاتصال', 'العمل مستمر محلياً');
        }
      });

      BootState.unsubscribers.push(unsub2);
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §10 · VISIBILITY HANDLER
     ─────────────────────────────────────────────────────────────────────
     ✅ مُصلَح: لا نعمل rerender على visibilitychange
     ده كان سبب مشكلة "الريفريش" المستمر على الموبايل
     ═════════════════════════════════════════════════════════════════════ */

  function bindVisibilityHandler() {
    const handler = () => {
      if (document.hidden) {
        console.log('[Boot] Tab hidden');
        return;
      }

      console.log('[Boot] Tab visible');

      /* ✅ لا نعمل rerender على visibilitychange
         — ده كان سبب المشكلة الرئيسي على الموبايل */

      /* مزامنة تفاضلية فقط (بدون rerender) */
      if (GMS.Sync?.state?.online) {
        setTimeout(() => {
          if (!document.hidden && GMS.Sync?.state?.online) {
            GMS.Sync.deltaSync().catch(() => {});
          }
        }, 1500);
      }

      /* تحديث الـ Badge بس — بدون rerender */
      if (GMS.PWA?.updateBadge) {
        setTimeout(() => {
          if (!document.hidden) GMS.PWA.updateBadge();
        }, 500);
      }
    };

    document.addEventListener('visibilitychange', handler);
    BootState.unsubscribers.push(() => {
      document.removeEventListener('visibilitychange', handler);
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §11 · PERIODIC MAINTENANCE
     ═════════════════════════════════════════════════════════════════════ */

  function startPeriodicMaintenance() {
    const interval = setInterval(() => {
      if (document.hidden) return;

      try {
        GMS.Cache?.cleanup?.({
          pruneLS: true,
          pruneSoldItems: true,
          soldAgeMs: 30 * 86400000,
        });
      } catch (e) {
        console.warn('[Boot] Periodic cleanup failed:', e);
      }
    }, 5 * 60 * 1000);

    BootState.unsubscribers.push(() => clearInterval(interval));

    const healthInterval = setInterval(() => {
      if (document.hidden) return;

      const health = {
        online: GMS.Sync?.state?.online,
        realtime: GMS.Realtime?.state?.channelStatus,
        queue: GMS.Queue?.state?.items?.length || 0,
        lastSync: GMS.Sync?.state?.stats?.lastSync,
      };

      if (health.online && health.lastSync) {
        const age = Date.now() - new Date(health.lastSync).getTime();
        if (age > 30 * 60 * 1000) {
          console.warn('[Boot] Last sync is stale:', age / 60000, 'min');
          GMS.Sync?.deltaSync?.().catch(() => {});
        }
      }

    }, 60 * 60 * 1000);

    BootState.unsubscribers.push(() => clearInterval(healthInterval));
  }

  /* ═════════════════════════════════════════════════════════════════════
     §12 · BOOT SCREEN HTML
     ═════════════════════════════════════════════════════════════════════ */

  function createBootScreen() {
    if (document.getElementById('boot-screen')) return;

    const div = document.createElement('div');
    div.id = 'boot-screen';
    div.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 9500;
      background:
        radial-gradient(1000px 500px at 20% 0%,#1e293b 0%,transparent 55%),
        radial-gradient(900px 500px at 100% 100%,#0f172a 0%,transparent 55%),
        #080d18;
      display: grid;
      place-items: center;
      padding: 20px;
      transition: opacity .35s ease;
    `;

    div.innerHTML = `
      <div style="text-align:center;max-width:380px;width:100%">
        <div style="width:80px;height:80px;border-radius:22px;
                    background:linear-gradient(135deg,#F0D68C 0%,#D4A017 48%,#9C7726 100%);
                    margin:0 auto 22px;
                    display:grid;place-items:center;
                    color:#2a1f05;font-weight:900;font-size:34px;
                    box-shadow:0 18px 44px -14px rgba(212,160,23,.95);
                    animation:pulse 2s ease infinite">
          Au
        </div>

        <h1 style="font-size:22px;font-weight:900;color:#fff;
                   letter-spacing:-.4px;margin:0 0 8px">
          Gold ERP Pro
        </h1>

        <p style="color:#6b7a95;font-size:12px;font-weight:600;
                  margin:0 0 32px">
          نظام إدارة الذهب والمجوهرات
        </p>

        <div style="background:rgba(255,255,255,.06);
                    border-radius:12px;padding:14px 16px;
                    border:1px solid rgba(255,255,255,.08)">
          <div id="boot-progress-label"
               style="font-size:12px;font-weight:700;
                      color:#e8eefb;margin-bottom:10px">
            جارٍ التحميل…
          </div>

          <div style="height:6px;background:rgba(255,255,255,.1);
                      border-radius:4px;overflow:hidden">
            <div id="boot-progress-fill"
                 style="height:100%;width:0%;
                        background:linear-gradient(135deg,#F0D68C 0%,#D4A017 48%,#9C7726 100%);
                        border-radius:4px;
                        transition:width .3s ease"></div>
          </div>
        </div>

        <p style="color:#5f6f8d;font-size:10.5px;font-weight:600;
                  margin:24px 0 0">
          الإصدار ${GMS.APP_CONFIG.VERSION} · Build ${GMS.APP_CONFIG.BUILD}
        </p>
      </div>

      <style>
        @keyframes pulse {
          0%,100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
      </style>
    `;

    document.body.appendChild(div);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §13 · RESTORE SESSION OR LOGIN
     ═════════════════════════════════════════════════════════════════════ */

  async function determineStartMode() {
    const restored = GMS.Auth?.tryRestoreSession?.();

    if (restored && GMS.Auth.profile) {
      console.log('[Boot] Session restored for', GMS.Auth.profile.full_name);

      const loginScreen = document.getElementById('login-screen');
      if (loginScreen) loginScreen.style.display = 'none';

      const app = document.getElementById('app');
      if (app) app.classList.add('visible');

      return await startApp();
    }

    const loginScreen = document.getElementById('login-screen');
    if (loginScreen) loginScreen.style.display = '';

    const app = document.getElementById('app');
    if (app) app.classList.remove('visible');

    bindLoginForm();

    await GMS.sleep(400);
    hideBootScreen();

    BootState.stage = 'awaiting-login';

    console.log('[Boot] Awaiting login');
    return false;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §14 · INITIALIZE NON-AUTH SYSTEMS
     ═════════════════════════════════════════════════════════════════════ */

  async function initNonAuthSystems() {
    /* 1 · i18n */
    updateBootProgress('تحضير اللغة…', 10);

    if (GMS.I18n) {
      try {
        GMS.I18n.init?.();
        markSystem('i18n');
      } catch (e) {
        recordError('i18n', e);
      }
    }

    /* 2 · Theme */
    updateBootProgress('تحميل المظهر…', 18);

    try {
      const theme = localStorage.getItem(GMS.LS_KEYS.THEME) || 'light';
      document.documentElement.setAttribute('data-theme', theme);
    } catch (_) {}

    /* 3 · Cache — فتح IndexedDB */
    updateBootProgress('فتح قاعدة البيانات…', 28);

    if (GMS.IDB) {
      try {
        await GMS.IDB.open();
        markSystem('cache');
      } catch (e) {
        recordError('idb', e);
      }
    }

    /* 4 · Auth init */
    updateBootProgress('تهيئة المصادقة…', 35);

    if (GMS.Auth) {
      try {
        await GMS.Auth.init?.();
        markSystem('auth');
      } catch (e) {
        recordError('auth', e);
      }
    }

    return true;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §15 · MAIN BOOT
     ═════════════════════════════════════════════════════════════════════ */

  async function boot() {
    if (BootState.initialized) return;

    BootState.initialized = true;
    BootState.startedAt = Date.now();
    BootState.stage = 'initializing';

    console.log(
      `%c🚀 Gold ERP Pro Boot · v${GMS.APP_CONFIG.VERSION}`,
      'color:#D4A017;font-weight:900;font-size:14px;padding:4px 8px;' +
      'background:#121212;border-radius:6px;'
    );

    /* 1 · Boot screen */
    createBootScreen();
    updateBootProgress('بدء التحميل…', 5);

    /* 2 · Error handlers */
    bindGlobalErrorHandlers();

    /* ✅ 3 · Service Worker — يُسجَّل مبكراً */
    updateBootProgress('تحضير PWA…', 8);
    registerServiceWorker().catch(e => console.warn('[Boot] SW registration failed:', e));

    /* 4 · Topbar */
    bindTopbar();
    bindLogoutButton();
    bindVisibilityHandler();

    /* 5 · Icons */
    window.lucide?.createIcons();

    /* 6 · Non-auth systems */
    await initNonAuthSystems();

    /* 7 · Determine mode */
    updateBootProgress('التحقق من الجلسة…', 40);

    try {
      await determineStartMode();
    } catch (e) {
      recordError('startMode', e);
      hideBootScreen();

      const loginScreen = document.getElementById('login-screen');
      if (loginScreen) loginScreen.style.display = '';

      bindLoginForm();
    }

    /* 8 · Periodic maintenance */
    startPeriodicMaintenance();

    /* 9 · Cleanup on unload */
    window.addEventListener('beforeunload', () => {
      try {
        BootState.unsubscribers.forEach(fn => {
          try { fn(); } catch (_) {}
        });
      } catch (_) {}
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §16 · PUBLIC API
     ═════════════════════════════════════════════════════════════════════ */
  GMS.Boot = {
    boot,
    state: BootState,
    startApp,

    getState: () => ({ ...BootState }),

    restart: () => {
      BootState.initialized = false;
      BootState.errors = [];
      boot();
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §17 · AUTO START
     ═════════════════════════════════════════════════════════════════════ */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      boot().catch(e => {
        console.error('[Boot] Fatal error:', e);
        recordError('boot', e);
      });
    });
  } else {
    setTimeout(() => {
      boot().catch(e => {
        console.error('[Boot] Fatal error:', e);
        recordError('boot', e);
      });
    }, 0);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §18 · LOADED CONFIRMATION
     ═════════════════════════════════════════════════════════════════════ */
  console.log(
    '%c⚡ Boot loaded · Ready to start',
    'color:#0f7a43;font-weight:800;font-size:12px;padding:1px 5px;' +
    'background:#e6f6ee;border-radius:4px;'
  );

  /* ═════════════════════════════════════════════════════════════════════
     ✅ js/23-boot.js — نهاية الملف
     ═════════════════════════════════════════════════════════════════════ */

})();
