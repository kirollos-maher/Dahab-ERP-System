/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ENTERPRISE — js/23-boot.js
   نقطة التشغيل النهائية + PWA Integration
   ✅ v3: Login محصَّن + Language Switch مدمج (بدون ملف 29)
   ✅ v3.1: Overlay فوري عند تبديل اللغة — يمنع الشاشة البيضاء/السوداء
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
      sw: false,
      pwa: false,
    },

    unsubscribers: [],

    /* ✅ v3.1: flag لمنع تحذير beforeunload عند تبديل اللغة */
    intentionalReload: false,
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

    /* ✅ v3.1: تجاهل beforeunload عند التبديل المُبرمَج */
    window.addEventListener('beforeunload', (e) => {
      if (BootState.intentionalReload) return;
      /* لا نمنع - نترك السلوك الافتراضي */
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §4 · PWA — SERVICE WORKER REGISTRATION
     ═════════════════════════════════════════════════════════════════════ */

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      console.log('[Boot] Service Worker غير مدعوم');
      return false;
    }

    const isLocalhost =
      location.hostname === 'localhost' ||
      location.hostname === '127.0.0.1';
    const isHttps = location.protocol === 'https:';

    if (!isHttps && !isLocalhost) {
      console.warn('[Boot] SW يتطلب HTTPS — تم التخطي');
      return false;
    }

    try {
      if (GMS.PWA && typeof GMS.PWA.registerServiceWorker === 'function') {
        const reg = await GMS.PWA.registerServiceWorker();
        if (reg) {
          markSystem('sw');
          console.log('[Boot] ✅ Service Worker registered');
          return true;
        }
      }

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
     §5 · ✅ LANGUAGE SWITCHER — v3.1 (مدمج + Overlay)
     ─────────────────────────────────────────────────────────────────────
     الطريقة الجديدة:
       1. تحديث <html> dir/lang فوراً
       2. حفظ اللغة في LocalStorage
       3. عرض Overlay تحميل فوري (بدل الشاشة البيضاء)
       4. إعادة تحميل الصفحة بأمان (بدون حفظ حالة DOM المعقدة)
       5. Boot يعيد تحميل اللغة الجديدة من LocalStorage تلقائياً
     ═════════════════════════════════════════════════════════════════════ */

  function showLanguageSwitchOverlay(targetLang) {
    /* احذف أي overlay سابق */
    const existing = document.getElementById('gms-lang-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'gms-lang-overlay';
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 9999;
      display: grid;
      place-items: center;
      background:
        radial-gradient(1000px 500px at 20% 0%,#1e293b 0%,transparent 55%),
        radial-gradient(900px 500px at 100% 100%,#0f172a 0%,transparent 55%),
        #080d18;
      font-family: 'Cairo', system-ui, sans-serif;
      direction: ${targetLang === 'ar' ? 'rtl' : 'ltr'};
      opacity: 0;
      transition: opacity .18s ease;
      pointer-events: all;
    `;

    const isAr = targetLang === 'ar';
    const message = isAr ? 'جارٍ التبديل للعربية…' : 'Switching to English…';
    const sub = isAr ? 'RTL · نظام إدارة الذهب' : 'LTR · Gold Management System';

    overlay.innerHTML = `
      <div style="text-align:center;max-width:340px;padding:20px">
        <div style="width:72px;height:72px;border-radius:20px;
                    background:linear-gradient(135deg,#F0D68C 0%,#D4A017 48%,#9C7726 100%);
                    margin:0 auto 20px;
                    display:grid;place-items:center;
                    color:#2a1f05;font-weight:900;font-size:30px;
                    box-shadow:0 18px 44px -14px rgba(212,160,23,.95);
                    animation:gmsLangPulse 1.4s ease infinite">
          Au
        </div>

        <div style="color:#e8eefb;font-size:15px;font-weight:800;
                    letter-spacing:-.2px;margin-bottom:8px">
          ${message}
        </div>

        <div style="color:#6b7a95;font-size:11.5px;font-weight:600;
                    margin-bottom:22px">
          ${sub}
        </div>

        <div style="height:5px;background:rgba(255,255,255,.1);
                    border-radius:4px;overflow:hidden;max-width:220px;
                    margin:0 auto">
          <div style="height:100%;
                      background:linear-gradient(135deg,#F0D68C 0%,#D4A017 48%,#9C7726 100%);
                      border-radius:4px;
                      animation:gmsLangBar 1.2s ease-in-out infinite"></div>
        </div>
      </div>

      <style>
        @keyframes gmsLangPulse {
          0%,100% { transform: scale(1); }
          50% { transform: scale(1.06); }
        }
        @keyframes gmsLangBar {
          0%   { width: 5%; margin-inline-start: 0; }
          50%  { width: 60%; margin-inline-start: 20%; }
          100% { width: 5%; margin-inline-start: 95%; }
        }
      </style>
    `;

    document.body.appendChild(overlay);

    /* Fade in */
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
    });

    return overlay;
  }

  /**
   * ✅ تبديل اللغة — الدالة الرئيسية
   * @param {'ar'|'en'} lang
   * @returns {Promise<boolean>}
   */
  async function switchLanguage(lang) {
    if (!lang || !['ar', 'en'].includes(lang)) lang = 'ar';

    const currentLang = document.documentElement.getAttribute('lang') || 'ar';
    if (lang === currentLang) {
      console.log('[switchLanguage] ℹ️ اللغة نفسها — لا تغيير');
      updateLangButtons(lang);
      return true;
    }

    console.log(`[switchLanguage] 🔄 ${currentLang} → ${lang}`);

    try {
      /* ─── 1 · تحديث <html> فوراً ─── */
      const html = document.documentElement;
      html.setAttribute('lang', lang);
      html.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
      html.setAttribute('data-lang', lang);

      /* ─── 2 · حفظ اللغة في LocalStorage ─── */
      try {
        const key = (GMS.LS_KEYS && GMS.LS_KEYS.LANG) || 'gms.lang';
        localStorage.setItem(key, lang);
        console.log(`[switchLanguage] 💾 حُفظت اللغة: ${lang}`);
      } catch (e) {
        console.warn('[switchLanguage] localStorage.save failed:', e);
      }

      /* ─── 3 · تحديث أزرار اللغة فوراً (بصرياً) ─── */
      updateLangButtons(lang);

      /* ─── 4 · محاولة تحديث ذكي أولاً ─── */
      let smartSuccess = false;

      try {
        if (GMS.I18n && typeof GMS.I18n.setLang === 'function') {
          GMS.I18n.setLang(lang, { silent: true });
          console.log('[switchLanguage] ✅ I18n.setLang نجح');
          smartSuccess = true;
        }
      } catch (i18nErr) {
        console.warn('[switchLanguage] ⚠️ I18n.setLang فشل:', i18nErr);
        smartSuccess = false;
      }

      /* ─── 5 · لو نجح التحديث الذكي، أعِد رسم الصفحة الحالية ─── */
      if (smartSuccess) {
        try {
          const currentRoute = GMS.Router?.currentId?.();
          if (currentRoute && GMS.Router?.go) {
            /* محاولة إعادة الرسم بدون reload — مع timeout 2.5s */
            const renderPromise = GMS.Router.go(currentRoute, { force: true });
            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('render timeout')), 2500)
            );

            await Promise.race([renderPromise, timeoutPromise]);

            /* لو نجح، تحقق من أن الصفحة ليست فارغة */
            const pageHost = document.getElementById('page');
            const hasContent = pageHost && pageHost.innerHTML.trim().length > 100;

            if (hasContent) {
              console.log('[switchLanguage] ✅ تم التبديل بدون reload');
              GMS.Beep?.info?.();
              GMS.Toast?.ok?.(
                lang === 'ar' ? 'تم التبديل للعربية' : 'Switched to English',
                lang === 'ar' ? 'واجهة RTL' : 'LTR interface'
              );
              return true;
            } else {
              console.warn('[switchLanguage] ⚠️ الصفحة فارغة — سأنتقل للـ reload');
            }
          }
        } catch (renderErr) {
          console.warn('[switchLanguage] ⚠️ الرسم الذكي فشل:', renderErr.message);
        }
      }

      /* ─── 6 · Fallback: Overlay + reload نظيف ─── */
      console.log('[switchLanguage] 🔄 استخدام reload الآمن…');

      /* عرض Overlay فوري — يمنع الشاشة البيضاء */
      showLanguageSwitchOverlay(lang);

      /* علامة للـ beforeunload */
      BootState.intentionalReload = true;
      window.GMS = window.GMS || {};
      window.GMS._intentionalReload = true;

      /* إغلاق Modals لتفادي تعارضات */
      try { GMS.Modal?.closeAll?.(); } catch (_) {}

      /* انتظر قليلاً حتى يرسم Overlay + يُحفظ localStorage */
      await new Promise(r => setTimeout(r, 350));

      /* إعادة التحميل النظيف */
      location.reload();

      return true;

    } catch (err) {
      console.error('[switchLanguage] ❌ خطأ خطير:', err);

      /* عرض Fallback UI بدل الشاشة الفاضية */
      showLanguageSwitchError(err, currentLang);
      return false;
    }
  }

  /**
   * تحديث أزرار اللغة
   */
  function updateLangButtons(lang) {
    document.querySelectorAll('.lang-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.lang === lang);
    });
  }

  /**
   * Fallback UI عند فشل التبديل
   */
  function showLanguageSwitchError(error, fallbackLang) {
    /* استرجاع اللغة السابقة */
    try {
      const html = document.documentElement;
      html.setAttribute('lang', fallbackLang);
      html.setAttribute('dir', fallbackLang === 'ar' ? 'rtl' : 'ltr');
      html.setAttribute('data-lang', fallbackLang);

      const key = (GMS.LS_KEYS && GMS.LS_KEYS.LANG) || 'gms.lang';
      localStorage.setItem(key, fallbackLang);

      if (GMS.I18n && typeof GMS.I18n.setLang === 'function') {
        try { GMS.I18n.setLang(fallbackLang, { silent: true }); } catch (_) {}
      }
      updateLangButtons(fallbackLang);
    } catch (_) {}

    /* عرض شاشة خطأ بدل الشاشة البيضاء */
    const overlay = document.getElementById('gms-lang-overlay');
    if (overlay) overlay.remove();

    const errorOverlay = document.createElement('div');
    errorOverlay.id = 'gms-lang-error';
    errorOverlay.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 9999;
      display: grid;
      place-items: center;
      background: rgba(8,13,24,.95);
      padding: 20px;
      font-family: 'Cairo', system-ui, sans-serif;
    `;

    errorOverlay.innerHTML = `
      <div style="background:var(--surface);border-radius:16px;
                  padding:28px 24px;max-width:400px;width:100%;
                  text-align:center;border:1px solid var(--border)">
        <div style="width:56px;height:56px;border-radius:16px;
                    background:var(--warn-bg);color:var(--warn);
                    display:grid;place-items:center;margin:0 auto 14px;
                    font-size:26px">
          ⚠
        </div>
        <div style="font-size:15px;font-weight:900;color:var(--text);
                    margin-bottom:8px">
          تعذّر تبديل اللغة
        </div>
        <div style="font-size:12px;color:var(--muted);font-weight:600;
                    line-height:1.7;margin-bottom:16px">
          تم استرجاع اللغة السابقة. يمكنك إعادة المحاولة بأمان.
        </div>
        <div style="font-size:10.5px;color:var(--danger);font-weight:700;
                    background:var(--danger-bg);padding:8px 12px;
                    border-radius:8px;margin-bottom:18px;
                    font-family:var(--font-mono);word-break:break-all">
          ${(error?.message || 'Unknown error').slice(0, 120)}
        </div>
        <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
          <button id="gms-lang-retry"
                  style="padding:10px 20px;border-radius:8px;border:none;
                         background:linear-gradient(135deg,#F0D68C,#9C7726);
                         color:#2a1f05;font-weight:900;font-size:13px;
                         cursor:pointer;font-family:inherit">
            🔄 إعادة التحميل
          </button>
          <button id="gms-lang-home"
                  style="padding:10px 20px;border-radius:8px;
                         background:transparent;color:var(--muted);
                         border:1px solid var(--border);font-weight:700;
                         font-size:13px;cursor:pointer;font-family:inherit">
            الرئيسية
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(errorOverlay);

    document.getElementById('gms-lang-retry')?.addEventListener('click', () => {
      errorOverlay.remove();
      location.reload();
    });

    document.getElementById('gms-lang-home')?.addEventListener('click', () => {
      errorOverlay.remove();
      try { GMS.Router?.go?.('dashboard', { force: true }); }
      catch (_) { location.reload(); }
    });
  }

  /**
   * ربط أزرار اللغة — باستخدام Event Delegation (أكثر أماناً)
   */
  function bindLanguageButtons() {
    /* تجنب الربط المتكرر */
    if (window.GMS && window.GMS._langButtonsBound) {
      console.log('[Boot.bindLanguageButtons] ℹ️ مُربط مسبقاً');
      return;
    }
    window.GMS = window.GMS || {};
    window.GMS._langButtonsBound = true;

    /* ✅ Event Delegation على document — يعمل حتى لو أُعيد رسم الأزرار */
    document.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest
        ? e.target.closest('.lang-btn, [data-lang]')
        : null;

      if (!btn) return;

      e.preventDefault();
      e.stopPropagation();

      const lang = btn.dataset.lang;
      if (!lang) return;

      console.log(`[lang-btn] 🖱️ نقرة على: ${lang}`);
      switchLanguage(lang);
    }, true);

    /* حالة أولية */
    const currentLang = document.documentElement.getAttribute('lang') || 'ar';
    updateLangButtons(currentLang);

    console.log('[Boot.bindLanguageButtons] ✅ تم الربط (event delegation)');
  }

  /* ═════════════════════════════════════════════════════════════════════
     §6 · AUTH UI BINDING — محصَّن
     ═════════════════════════════════════════════════════════════════════ */

  function bindLoginForm() {
    const form = document.getElementById('login-form');
    const errEl = document.getElementById('login-error');
    const submitBtn = document.getElementById('login-submit');

    if (!form) {
      console.warn('[Boot.bindLoginForm] ❌ #login-form غير موجود');
      return;
    }

    if (form._gmsLoginBound) {
      console.log('[Boot.bindLoginForm] ℹ️ مُربط مسبقاً — تم التخطي');
      return;
    }
    form._gmsLoginBound = true;

    console.log('[Boot.bindLoginForm] 🔗 بدء ربط نموذج الدخول…');

    let submitting = false;

    const doLogin = async (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }

      if (submitting) {
        console.log('[Boot.login] ⏳ طلب جارٍ بالفعل');
        return;
      }

      const emailEl = document.getElementById('login-email');
      const passEl = document.getElementById('login-password');
      const email = emailEl?.value.trim();
      const password = passEl?.value;

      console.log('[Boot.login] 📤 محاولة دخول:', email);

      if (!email || !password) {
        if (errEl) {
          errEl.textContent = 'البريد الإلكتروني وكلمة المرور مطلوبان';
          errEl.classList.remove('hidden');
        }
        return;
      }

      if (!GMS.Auth || typeof GMS.Auth.signIn !== 'function') {
        console.error('[Boot.login] ❌ GMS.Auth.signIn غير متاح');
        if (errEl) {
          errEl.textContent = 'خطأ في النظام — Auth غير مُهيّأ';
          errEl.classList.remove('hidden');
        }
        return;
      }

      submitting = true;
      const originalHTML = submitBtn?.innerHTML;

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i data-lucide="loader-circle"></i> جارٍ التحقق…';
        window.lucide?.createIcons();
      }

      if (errEl) errEl.classList.add('hidden');

      try {
        const profile = await GMS.Auth.signIn(email, password);
        console.log('[Boot.login] ✅ نجح الدخول:', profile?.full_name);

        const loginScreen = document.getElementById('login-screen');
        if (loginScreen) loginScreen.style.display = 'none';

        const app = document.getElementById('app');
        if (app) app.classList.add('visible');

        if (GMS.Audit && profile) {
          try {
            await GMS.Audit.log(
              'LOGIN',
              'session',
              profile.id,
              `تسجيل دخول — ${profile.full_name}`,
              { email: profile.email, role: profile.role }
            );
          } catch (auditErr) {
            console.warn('[Boot.login] Audit log failed:', auditErr);
          }
        }

        GMS.Beep?.success?.();
        await startApp();

      } catch (err) {
        console.error('[Boot.login] ❌ فشل الدخول:', err);
        submitting = false;

        if (errEl) {
          errEl.textContent = err.message || 'فشل تسجيل الدخول';
          errEl.classList.remove('hidden');
        }

        GMS.Beep?.error?.();

        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = originalHTML || '<i data-lucide="log-in"></i> تسجيل الدخول';
          window.lucide?.createIcons();
        }
      }
    };

    form.onsubmit = doLogin;

    if (submitBtn) {
      submitBtn.onclick = (e) => {
        console.log('[Boot.login] 🖱️ نقرة على زر الدخول');
        doLogin(e);
      };
    }

    const passEl = document.getElementById('login-password');
    if (passEl) {
      passEl.onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          doLogin(e);
        }
      };
    }

    console.log('[Boot.bindLoginForm] ✅ تم الربط بنجاح');

    setTimeout(() => {
      try { document.getElementById('login-email')?.focus(); } catch (_) {}
    }, 400);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §7 · LOGOUT UI
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

      BootState.intentionalReload = true;
      window.GMS._intentionalReload = true;

      setTimeout(() => location.reload(), 300);
    };
  }

  /* ═════════════════════════════════════════════════════════════════════
     §8 · TOPBAR BINDING
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

    /* ✅ Language switcher: مُفوَّض إلى Event Delegation في bindLanguageButtons */
    bindLanguageButtons();

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
          'سيتم إعادة تحميل كل البيانات من الخادم. متابعة؟',
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
          if (GMS.Sync) await GMS.Sync.fullSync();
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
      queueBtn.onclick = () => GMS.Router?.go('queue');
    }

    /* Settings button */
    const settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn) {
      settingsBtn.onclick = () => GMS.Router?.go('settings');
    }

    /* Connection chip */
    const connChip = document.getElementById('conn-chip');
    if (connChip) {
      connChip.onclick = () => showConnectionInfo();
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
            <span class="k"><i data-lucide="globe"></i> الشبكة</span>
            <span class="v" style="color:${online ? 'var(--success)' : 'var(--warn)'}">
              ${online ? 'متصل' : 'غير متصل'}
            </span>
          </div>
          <div class="cl-row">
            <span class="k"><i data-lucide="database"></i> Supabase</span>
            <span class="v" style="color:${sbReady ? 'var(--success)' : 'var(--muted)'}">
              ${sbReady ? 'متصل' : 'غير مُهيّأ'}
            </span>
          </div>
          <div class="cl-row">
            <span class="k"><i data-lucide="radio"></i> Realtime</span>
            <span class="v" style="color:${rtStatus === 'connected' ? 'var(--success)' : 'var(--warn)'}">
              ${rtLabels[rtStatus] || rtStatus}
            </span>
          </div>
          <div class="cl-row">
            <span class="k"><i data-lucide="package"></i> طابور المزامنة</span>
            <span class="v">${GMS.intFmt(queueCount)} فاتورة</span>
          </div>
          <div class="cl-row">
            <span class="k"><i data-lucide="clock"></i> آخر مزامنة</span>
            <span class="v" style="font-size:12px">
              ${GMS.timeAgo(GMS.Sync?.state?.stats?.lastSync)}
            </span>
          </div>
          <div class="cl-row" style="border-top:1.5px solid var(--border);
                       padding-top:14px;margin-top:8px">
            <span class="k"><i data-lucide="smartphone"></i> PWA</span>
            <span class="v" style="color:${pwaStandalone ? 'var(--success)' : 'var(--muted)'}">
              ${pwaStandalone ? 'مثبَّت' : 'متصفح عادي'}
            </span>
          </div>
          ${!pwaStandalone && pwaInstallable ? `
            <div style="padding:10px 12px;background:var(--gold-soft);
                        border-radius:9px;margin-top:8px;font-size:11.5px;
                        font-weight:700;color:var(--warn)">
              التطبيق قابل للتثبيت
            </div>
          ` : ''}
        </div>
      `,
      footer: `
        <button class="btn" data-close>إغلاق</button>
        <button class="btn btn-primary" id="conn-reconnect">
          <i data-lucide="refresh-cw"></i> إعادة الاتصال
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
     §9 · STARTUP SEQUENCE
     ═════════════════════════════════════════════════════════════════════ */

  async function startApp() {
    try {
      updateBootProgress('تهيئة الذاكرة المؤقتة…', 45);

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

      bindRealtimeToUI();

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

      if (GMS.Views?.repair) {
        markSystem('repair');
        console.log('[Boot] ✅ Repair module detected');
      }

      if (GMS.PWA) {
        markSystem('pwa');
        console.log('[Boot] ✅ PWA module detected');
        if (GMS.PWA.updateBadge) {
          setTimeout(() => GMS.PWA.updateBadge(), 500);
        }
      }

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
      GMS.Toast.err('فشل بدء التشغيل', 'تحقق من Console للأخطاء');
      console.error('[Boot] Fatal startup error:', e);
      return false;
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §10 · REALTIME → UI BINDING
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
     §11 · VISIBILITY HANDLER
     ═════════════════════════════════════════════════════════════════════ */

  function bindVisibilityHandler() {
    const handler = () => {
      if (document.hidden) return;

      if (GMS.Sync?.state?.online) {
        setTimeout(() => {
          if (!document.hidden && GMS.Sync?.state?.online) {
            GMS.Sync.deltaSync().catch(() => {});
          }
        }, 1500);
      }

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
     §12 · PERIODIC MAINTENANCE
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
        lastSync: GMS.Sync?.state?.stats?.lastSync,
      };
      if (health.online && health.lastSync) {
        const age = Date.now() - new Date(health.lastSync).getTime();
        if (age > 30 * 60 * 1000) {
          GMS.Sync?.deltaSync?.().catch(() => {});
        }
      }
    }, 60 * 60 * 1000);
    BootState.unsubscribers.push(() => clearInterval(healthInterval));
  }

  /* ═════════════════════════════════════════════════════════════════════
     §13 · BOOT SCREEN HTML
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
     §14 · RESTORE SESSION OR LOGIN
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
     §15 · INITIALIZE NON-AUTH SYSTEMS
     ═════════════════════════════════════════════════════════════════════ */

  async function initNonAuthSystems() {
    updateBootProgress('تحضير اللغة…', 10);

    if (GMS.I18n) {
      try {
        GMS.I18n.init?.();
        markSystem('i18n');
      } catch (e) {
        recordError('i18n', e);
      }
    }

    updateBootProgress('تحميل المظهر…', 18);

    try {
      const theme = localStorage.getItem(GMS.LS_KEYS.THEME) || 'light';
      document.documentElement.setAttribute('data-theme', theme);
    } catch (_) {}

    updateBootProgress('فتح قاعدة البيانات…', 28);

    if (GMS.IDB) {
      try {
        await GMS.IDB.open();
        markSystem('cache');
      } catch (e) {
        recordError('idb', e);
      }
    }

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
     §16 · MAIN BOOT
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

    createBootScreen();
    updateBootProgress('بدء التحميل…', 5);

    bindGlobalErrorHandlers();

    updateBootProgress('تحضير PWA…', 8);
    registerServiceWorker().catch(e => console.warn('[Boot] SW registration failed:', e));

    bindTopbar();
    bindLogoutButton();
    bindVisibilityHandler();

    window.lucide?.createIcons();

    await initNonAuthSystems();

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

    startPeriodicMaintenance();

    window.addEventListener('beforeunload', () => {
      try {
        BootState.unsubscribers.forEach(fn => {
          try { fn(); } catch (_) {}
        });
      } catch (_) {}
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §17 · PUBLIC API
     ═════════════════════════════════════════════════════════════════════ */
  GMS.Boot = {
    boot,
    state: BootState,
    startApp,
    bindLoginForm,
    switchLanguage,
    updateLangButtons,

    getState: () => ({ ...BootState }),

    restart: () => {
      BootState.initialized = false;
      BootState.errors = [];
      boot();
    },
  };

  /* ✅ v3.1: تصدير switchLanguage عالمياً للاستخدام من أي مكان */
  GMS.switchLanguage = switchLanguage;
  GMS.LangSwitcher = {
    switch: switchLanguage,
    updateButtons: updateLangButtons,
    bind: bindLanguageButtons,
  };

  /* ═════════════════════════════════════════════════════════════════════
     §18 · AUTO START
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
     §19 · LOADED CONFIRMATION
     ═════════════════════════════════════════════════════════════════════ */
  console.log(
    '%c⚡ Boot loaded · v3.1 (Lang Switch + Overlay)',
    'color:#0f7a43;font-weight:800;font-size:12px;padding:1px 5px;' +
    'background:#e6f6ee;border-radius:4px;'
  );

  console.log(
    '%c🌍 switchLanguage() متاح عالمياً — بدون ملف 29 مطلوب',
    'color:#6b3fa0;font-weight:700;font-size:11px;'
  );

  /* ═════════════════════════════════════════════════════════════════════
     ✅ js/23-boot.js — نهاية الملف
     ═════════════════════════════════════════════════════════════════════ */

})();
