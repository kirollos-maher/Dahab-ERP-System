/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ERP — js/00a-tenant-auth.js
   Tenant Login Wizard (4 خطوات) + Auth
   ─────────────────────────────────────────────────────────────────────
   Step 1: Business Code
   Step 2: Verification Code (أول مرة فقط)
   Step 3: Owner / Employee
   Step 4: Username + Password
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const GMS = window.GMS = window.GMS || {};
  if (!window.bcrypt) {
    console.warn('[TenantAuth] ⚠️ bcryptjs not loaded — authentication will fail');
  }

  /* ═════════════════════════════════════════════════════════════════════
     §1 · STATE
     ═════════════════════════════════════════════════════════════════════ */
  const WizState = {
    step: 1,
    business: null,          // { id, code, name, needs_activation, ... }
    verificationPassed: false,
    userType: null,          // 'owner' | 'employee'
    pendingCreds: null,
    busy: false,
  };

  /* ═════════════════════════════════════════════════════════════════════
     §2 · HELPERS
     ═════════════════════════════════════════════════════════════════════ */
  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return Array.from(document.querySelectorAll(sel)); }
  function show(el) { el?.classList.remove('hidden'); }
  function hide(el) { el?.classList.add('hidden'); }

  function setStep(n) {
    WizState.step = n;
    $$('[data-login-step]').forEach(el => {
      el.classList.toggle('active', Number(el.dataset.loginStep) === n);
    });
    $$('[data-login-panel]').forEach(el => {
      el.classList.toggle('active', Number(el.dataset.loginPanel) === n);
    });
    // Progress bar
    const progress = $('#wizard-progress');
    if (progress) progress.style.width = `${(n / 4) * 100}%`;
    // Focus auto
    setTimeout(() => {
      const input = document.querySelector(`[data-login-panel="${n}"] input:not([type="hidden"])`);
      input?.focus();
    }, 120);
  }

  function showError(elId, msg) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
  }

  function clearError(elId) {
    const el = document.getElementById(elId);
    if (el) el.classList.add('hidden');
  }

  function busy(btn, on, txt = 'جارٍ…') {
    if (!btn) return;
    if (on) {
      btn.dataset.originalText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `<i data-lucide="loader-circle"></i> ${txt}`;
      window.lucide?.createIcons();
    } else {
      btn.disabled = false;
      btn.innerHTML = btn.dataset.originalText || 'متابعة';
      window.lucide?.createIcons();
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §3 · SUPABASE CLIENT (anon, لا نحتاج init كامل)
     ═════════════════════════════════════════════════════════════════════ */
  function getSbClient() {
    if (window.GMS?.Supabase?.get?.()) return window.GMS.Supabase.get();
    if (!window.supabase) return null;
    const url = GMS.SyncConfig?.url || localStorage.getItem('gms.supabase.config.url');
    const key = GMS.SyncConfig?.key || localStorage.getItem('gms.supabase.config.key');
    if (!url || !key) return null;
    if (!window.__gms_anon_client) {
      window.__gms_anon_client = window.supabase.createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }
    return window.__gms_anon_client;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §4 · WIZARD STEPS
     ═════════════════════════════════════════════════════════════════════ */

  /* ─── STEP 1: Business Code ─────────────────────────────────────── */
  async function submitStep1() {
    const input = $('#login-biz-code');
    const btn = $('#login-step1-next');
    const code = (input?.value || '').trim().toUpperCase();

    clearError('login-step1-error');

    if (!code) {
      return showError('login-step1-error', 'أدخل كود النشاط');
    }
    if (!/^[A-Z0-9-]{4,32}$/.test(code)) {
      return showError('login-step1-error', 'صيغة الكود غير صحيحة');
    }

    const client = getSbClient();
    if (!client) {
      return showError('login-step1-error', 'لم يتم إعداد الاتصال بـ Supabase');
    }

    busy(btn, true, 'جارٍ التحقق…');

    try {
      const { data, error } = await client.rpc('check_business_access', { p_code: code });

      if (error) throw error;

      if (!data || !data.ok) {
        const messages = {
          NOT_FOUND: 'الكود غير صحيح — تأكد من الكود التعريفي',
          INACTIVE: 'هذا النشاط غير مُفعَّل — تواصل مع الإدارة',
          SUSPENDED: 'النشاط موقوف مؤقتاً' + (data?.message ? `: ${data.message}` : ''),
          EXPIRED: 'انتهى اشتراك هذا النشاط — تواصل مع الإدارة للتجديد',
        };
        return showError('login-step1-error',
          messages[data?.reason] || 'تعذّر التحقق من الكود');
      }

      WizState.business = data;
      console.log('[Wizard] ✅ Business resolved:', data);

      // لو محتاج تفعيل → Step 2
      if (data.needs_activation) {
        setStep(2);
      } else {
        // تجاوز Step 2
        setStep(3);
      }
    } catch (e) {
      console.error('[Wizard.step1]', e);
      showError('login-step1-error', `خطأ: ${e.message}`);
    } finally {
      busy(btn, false);
    }
  }

  /* ─── STEP 2: Verification Code ─────────────────────────────────── */
  async function submitStep2() {
    const input = $('#login-vcode');
    const btn = $('#login-step2-next');
    const code = (input?.value || '').trim();

    clearError('login-step2-error');

    if (!code || !/^\d{6,8}$/.test(code)) {
      return showError('login-step2-error', 'أدخل رمز تحقق من 6 إلى 8 أرقام');
    }
    if (!WizState.business) {
      return showError('login-step2-error', 'انتهت الجلسة — ابدأ من جديد');
    }

    const client = getSbClient();
    if (!client) return showError('login-step2-error', 'لا يوجد اتصال');

    busy(btn, true, 'جارٍ التحقق…');

    try {
      const { data, error } = await client.rpc('consume_verification_code', {
        p_business_id: WizState.business.business_id,
        p_code: code,
        p_purpose: 'activation',
        p_ip: null,
      });

      if (error) throw error;
      if (!data?.ok) {
        return showError('login-step2-error', 'الرمز غير صحيح أو منتهي أو مستخدم مسبقاً');
      }

      WizState.verificationPassed = true;
      console.log('[Wizard] ✅ Verification passed');
      setStep(3);
    } catch (e) {
      console.error('[Wizard.step2]', e);
      showError('login-step2-error', `خطأ: ${e.message}`);
    } finally {
      busy(btn, false);
    }
  }

  /* ─── STEP 3: User Type ─────────────────────────────────────────── */
  function submitStep3(userType) {
    WizState.userType = userType;
    $$('[data-user-type]').forEach(el => {
      el.classList.toggle('selected', el.dataset.userType === userType);
    });
    console.log('[Wizard] ✅ User type:', userType);
    setStep(4);
  }

  /* ─── STEP 4: Credentials ───────────────────────────────────────── */
  async function submitStep4() {
    const userInput = $('#login-username');
    const passInput = $('#login-password');
    const btn = $('#login-step4-submit');

    const username = (userInput?.value || '').trim();
    const password = passInput?.value || '';

    clearError('login-step4-error');

    if (!username || username.length < 3) {
      return showError('login-step4-error', 'اسم المستخدم قصير جداً');
    }
    if (!password || password.length < 6) {
      return showError('login-step4-error', 'كلمة المرور قصيرة جداً');
    }
    if (!WizState.business || !WizState.userType) {
      return showError('login-step4-error', 'انتهت الجلسة — ابدأ من جديد');
    }

    const client = getSbClient();
    if (!client) return showError('login-step4-error', 'لا يوجد اتصال');

    busy(btn, true, 'جارٍ الدخول…');

    try {
      // ✅ hash محلياً قبل الإرسال
      const passwordHash = window.bcrypt.hashSync(password, 10);

      const { data, error } = await client.rpc('authenticate_business_user', {
        p_business_code: WizState.business.business_code,
        p_username: username,
        p_password_hash: passwordHash,
      });

      if (error) throw error;

      if (!data || !data.ok) {
        const errMap = {
          BUSINESS_NOT_FOUND: 'النشاط غير موجود',
          SUSPENDED: 'النشاط موقوف',
          USER_NOT_FOUND: 'المستخدم غير موجود',
          INVALID_PASSWORD: 'كلمة المرور غير صحيحة',
          LOCKED: 'الحساب مقفل مؤقتاً — حاول لاحقاً',
        };
        return showError('login-step4-error',
          errMap[data?.error] || 'فشل تسجيل الدخول');
      }

      // ✅ التحقق من نوع المستخدم (owner/employee)
      const isOwner = Boolean(data.user.is_owner);
      if (WizState.userType === 'owner' && !isOwner) {
        return showError('login-step4-error',
          'هذا الحساب ليس صاحب المحل — اختر "موظف"');
      }
      if (WizState.userType === 'employee' && isOwner) {
        return showError('login-step4-error',
          'هذا الحساب صاحب المحل — اختر "صاحب المحل"');
      }

      console.log('[Wizard] ✅ Auth success:', data.user.username);

      // ✅ حفظ الجلسة
      GMS.Biz.setSession({
        session_type: 'business_user',
        user: data.user,
      }, data.business);

      // ✅ تهيئة DB Wrapper
      GMS.DB.init(client, data.business.id);

      // ✅ تغيير شاشة العرض
      const loginScreen = document.getElementById('login-screen');
      if (loginScreen) loginScreen.style.display = 'none';
      const app = document.getElementById('app');
      if (app) app.classList.add('visible');

      GMS.Beep?.success?.();
      GMS.Toast?.ok?.(
        `مرحباً ${data.user.full_name}`,
        `${data.business.name} · ${isOwner ? 'صاحب المحل' : 'موظف'}`
      );

      // ✅ بدء التطبيق
      if (GMS.Boot?.startApp) {
        await GMS.Boot.startApp();
      }

    } catch (e) {
      console.error('[Wizard.step4]', e);
      showError('login-step4-error', `خطأ: ${e.message}`);
      GMS.Beep?.error?.();
    } finally {
      busy(btn, false);
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §5 · NAVIGATION
     ═════════════════════════════════════════════════════════════════════ */
  function goBack() {
    if (WizState.step > 1) {
      const prev = WizState.step === 3 && !WizState.business?.needs_activation ? 1 : WizState.step - 1;
      setStep(prev);
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §6 · BIND EVENTS
     ═════════════════════════════════════════════════════════════════════ */
  function bindEvents() {
    // Step 1
    const codeInput = $('#login-biz-code');
    codeInput?.addEventListener('input', (e) => {
      e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
    });
    codeInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); submitStep1(); }
    });
    $('#login-step1-next')?.addEventListener('click', submitStep1);

    // Step 2
    const vcode = $('#login-vcode');
    vcode?.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 8);
    });
    vcode?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); submitStep2(); }
    });
    $('#login-step2-next')?.addEventListener('click', submitStep2);
    $('#login-step2-resend')?.addEventListener('click', () => {
      GMS.Toast?.info?.('اطلب رمز جديد', 'تواصل مع مالك النظام');
    });

    // Step 3
    $$('[data-user-type]').forEach(el => {
      el.addEventListener('click', () => submitStep3(el.dataset.userType));
    });

    // Step 4
    const userInput = $('#login-username');
    const passInput = $('#login-password');
    userInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') passInput?.focus();
    });
    passInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); submitStep4(); }
    });
    $('#login-step4-submit')?.addEventListener('click', submitStep4);

    // Show/Hide password
    $('#login-show-pass')?.addEventListener('click', (e) => {
      const inp = $('#login-password');
      if (!inp) return;
      const isText = inp.type === 'text';
      inp.type = isText ? 'password' : 'text';
      e.currentTarget.innerHTML = isText
        ? '<i data-lucide="eye"></i>'
        : '<i data-lucide="eye-off"></i>';
      window.lucide?.createIcons();
    });

    // Back buttons
    $$('[data-wizard-back]').forEach(btn => btn.addEventListener('click', goBack));

    // Business code helper: آخر كود محفوظ
    const lastCode = GMS.Biz.getLastBusinessCode();
    if (lastCode && codeInput && !codeInput.value) {
      codeInput.value = lastCode;
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §7 · INIT
     ═════════════════════════════════════════════════════════════════════ */
  function init() {
    if (!$('#login-biz-code')) {
      console.warn('[TenantAuth] Login wizard not present in DOM');
      return;
    }
    bindEvents();
    setStep(1);
    console.log('[TenantAuth] ✅ Login Wizard initialized');
  }

  /* ═════════════════════════════════════════════════════════════════════
     §8 · EXPORT
     ═════════════════════════════════════════════════════════════════════ */
  GMS.TenantAuth = {
    init,
    state: WizState,
    reset: () => {
      WizState.business = null;
      WizState.verificationPassed = false;
      WizState.userType = null;
      setStep(1);
      $('#login-biz-code') && ($('#login-biz-code').value = GMS.Biz.getLastBusinessCode());
      $('#login-vcode') && ($('#login-vcode').value = '');
      $('#login-username') && ($('#login-username').value = '');
      $('#login-password') && ($('#login-password').value = '');
    },
    logout: () => {
      GMS.Biz.clear();
      location.reload();
    },
  };

  console.log(
    '%c🚪 TenantAuth Wizard loaded · 4 steps',
    'color:#1c4fd8;font-weight:900;font-size:12px;padding:2px 6px;' +
    'background:#e9efff;border-radius:4px;'
  );
})();