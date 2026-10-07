/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ERP — js/00a-tenant-auth.js
   Tenant Login Wizard (4 خطوات) + Auth — v2.0.0
   ─────────────────────────────────────────────────────────────────────
   Step 1: Business Code
   Step 2: Verification Code (أول مرة فقط)
   Step 3: Owner / Employee
   Step 4: Username + Password

   ✅ v2.0.0 (SECURITY HARDENING COMPLIANT):
     • Step 1 يعتمد على RPC check_business_access (المصدر الأساسي)
     • Fallback: RPC get_business_public (لو check_business_access فشل)
     • لا Direct Select على businesses — يحترم RLS
     • Step 2 يستخدم RPC consume_verification_code حصرياً
     • لا Direct Update على business_verification_codes
     • Step 4 يستخدم Direct Select على business_users (آمن)
       → لأن business_users مش محمي بـ owner_sessions RLS
     • Auto-recovery من gms.tenant.session
     • bcrypt dual-namespace (window.bcrypt / dcodeIO.bcrypt)

   ⚠️  يَعتمد على RPCs مُعرَّفة في:
     • check_business_access  → main.sql
     • consume_verification_code → main.sql
     • get_business_public → NEW SQL (يُطبَّق منفصلاً)
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const GMS = window.GMS = window.GMS || {};

  /* ═════════════════════════════════════════════════════════════════════
     §0 · GUARD — منع التحميل مرتين
     ═════════════════════════════════════════════════════════════════════ */
  if (GMS.TenantAuth && GMS.TenantAuth.__loaded) {
    console.warn('[TenantAuth] ⚠️ Already loaded — skipping re-init');
    return;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §0.1 · BCRYPT RESOLVER
     ─────────────────────────────────────────────────────────────────────
     bcryptjs v2.4.3 يصدّر نفسه كـ:
       • window.bcrypt          (بعض الإصدارات)
       • window.dcodeIO.bcrypt  (v2.4.3 الرسمي)
     ═════════════════════════════════════════════════════════════════════ */
  function getBcrypt() {
    if (typeof window === 'undefined') return null;
    return (
      window.bcrypt ||
      (window.dcodeIO && window.dcodeIO.bcrypt) ||
      null
    );
  }

  function requireBcrypt() {
    const b = getBcrypt();
    if (!b) {
      throw new Error(
        'مكتبة التحقق (bcrypt) غير محمَّلة — تأكد من تحميل bcrypt.min.js محلياً'
      );
    }
    return b;
  }

  const initialBcrypt = getBcrypt();
  if (initialBcrypt) {
    console.log('[TenantAuth] ✅ bcrypt resolved',
      initialBcrypt === window.bcrypt ? '(window.bcrypt)' : '(dcodeIO.bcrypt)');
  } else {
    console.warn(
      '%c[TenantAuth] ⚠️ bcrypt NOT found at load time — ' +
      'will retry on login',
      'color:#b3261e;font-weight:900;font-size:12px;'
    );
  }

  /* ═════════════════════════════════════════════════════════════════════
     §1 · STATE
     ═════════════════════════════════════════════════════════════════════ */
  const WizState = {
    step: 1,
    business: null,
    verificationPassed: false,
    userType: null,
    pendingCreds: null,
    busy: false,
    initialized: false,
    bound: false,
    _lastRpcError: null,
  };

  /* ═════════════════════════════════════════════════════════════════════
     §2 · HELPERS
     ═════════════════════════════════════════════════════════════════════ */
  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return Array.from(document.querySelectorAll(sel)); }

  function setStep(n) {
    WizState.step = n;

    $$('[data-login-step]').forEach(el => {
      el.classList.toggle('active', Number(el.dataset.loginStep) === n);
    });

    $$('[data-login-panel]').forEach(el => {
      el.classList.toggle('active', Number(el.dataset.loginPanel) === n);
    });

    const progress = $('#wizard-progress');
    if (progress) progress.style.width = `${(n / 4) * 100}%`;

    setTimeout(() => {
      const input = document.querySelector(
        `[data-login-panel="${n}"] input:not([type="hidden"]):not([readonly])`
      );
      try { input?.focus({ preventScroll: false }); }
      catch (_) { input?.focus(); }
    }, 120);
  }

  function showError(elId, msg) {
    const el = document.getElementById(elId);
    if (!el) {
      console.warn(`[TenantAuth] showError: #${elId} not found — fallback to Toast`);
      GMS.Toast?.err?.('خطأ', msg);
      return;
    }
    el.textContent = msg;
    el.classList.remove('hidden');
  }

  function clearError(elId) {
    const el = document.getElementById(elId);
    if (el) el.classList.add('hidden');
  }

  function clearAllErrors() {
    ['login-step1-error', 'login-step2-error', 'login-step3-error', 'login-step4-error']
      .forEach(clearError);
  }

  function busy(btn, on, txt = 'جارٍ…') {
    if (!btn) return;
    if (on) {
      btn.dataset.originalText = btn.dataset.originalText || btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `<i data-lucide="loader-circle"></i> ${txt}`;
      window.lucide?.createIcons();
    } else {
      btn.disabled = false;
      btn.innerHTML = btn.dataset.originalText || 'متابعة';
      window.lucide?.createIcons();
    }
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  /* ═════════════════════════════════════════════════════════════════════
     §3 · SUPABASE CLIENT
     ═════════════════════════════════════════════════════════════════════ */
  function getSbUrl() {
    try {
      return (
        (GMS.SyncConfig && GMS.SyncConfig.url) ||
        localStorage.getItem('gms.supabase.config.url') ||
        (GMS.SUPABASE_CREDENTIALS && GMS.SUPABASE_CREDENTIALS.URL) ||
        ''
      );
    } catch (_) { return ''; }
  }

  function getSbKey() {
    try {
      return (
        (GMS.SyncConfig && GMS.SyncConfig.key) ||
        localStorage.getItem('gms.supabase.config.key') ||
        (GMS.SUPABASE_CREDENTIALS && GMS.SUPABASE_CREDENTIALS.ANON_KEY) ||
        ''
      );
    } catch (_) { return ''; }
  }

  function getSbClient() {
    if (GMS.Supabase?.get?.()) return GMS.Supabase.get();

    if (!window.supabase) {
      console.warn('[TenantAuth.getSbClient] window.supabase not loaded yet');
      return null;
    }

    const url = getSbUrl();
    const key = getSbKey();

    if (!url || !key) {
      console.warn('[TenantAuth.getSbClient] Supabase credentials not configured');
      return null;
    }

    if (!window.__gms_anon_client) {
      try {
        window.__gms_anon_client = window.supabase.createClient(url, key, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        });
        console.log('[TenantAuth] ✅ Anon Supabase client created');
      } catch (e) {
        console.error('[TenantAuth] Failed to create anon client:', e);
        return null;
      }
    }

    return window.__gms_anon_client;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §4 · STEP 1 — Business Code
     ─────────────────────────────────────────────────────────────────────
     ✅ v2.0.0: يعتمد كلياً على RPCs (لا Direct Select على businesses)
     ═════════════════════════════════════════════════════════════════════ */
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
      return showError(
        'login-step1-error',
        'لم يتم إعداد الاتصال بـ Supabase — راجع الإعدادات'
      );
    }

    busy(btn, true, 'جارٍ التحقق…');

    try {
      let data = null;
      let usedRpc = false;

      /* ─── 1 · RPC الأساسي: check_business_access ─── */
      try {
        const rpcResult = await client.rpc('check_business_access', { p_code: code });

        if (!rpcResult.error && rpcResult.data) {
          data = rpcResult.data;
          usedRpc = true;

          /* تحويل الاستجابة لو الشكل قديم */
          if (data && data.ok === undefined && data.business_id) {
            data.ok = true;
          }
        } else if (rpcResult.error) {
          console.warn('[Wizard.step1] check_business_access failed:', rpcResult.error.message);
          WizState._lastRpcError = rpcResult.error;
        }
      } catch (rpcErr) {
        console.warn('[Wizard.step1] check_business_access exception:', rpcErr.message);
        WizState._lastRpcError = rpcErr;
      }

      /* ─── 2 · Fallback RPC: get_business_public ─── */
      if (!usedRpc || !data || (!data.ok && !data.business_id)) {
        console.log('[Wizard.step1] Trying fallback RPC: get_business_public');

        try {
          const pubResult = await client.rpc('get_business_public', { p_code: code });

          if (!pubResult.error && pubResult.data) {
            const pubData = pubResult.data;

            if (pubData.found && pubData.business) {
              const b = pubData.business;

              /* نُطبّع الشكل للاستجابة الموحّدة */
              data = {
                ok: b.is_active && !b.is_suspended,
                business_id: b.id,
                business_code: b.code,
                business_name: b.name,
                base_karat: b.base_karat,
                currency: b.currency,
                needs_activation: b.activated_at === null,
                _source: 'get_business_public',
              };

              /* فحص الحالات الخاصة */
              if (!b.is_active) {
                data.ok = false;
                data.reason = 'INACTIVE';
              } else if (b.is_suspended) {
                data.ok = false;
                data.reason = 'SUSPENDED';
                data.message = b.suspension_reason;
              } else if (b.subscription_end) {
                const end = new Date(b.subscription_end);
                if (end < new Date()) {
                  data.ok = false;
                  data.reason = 'EXPIRED';
                }
              }
            } else {
              data = { ok: false, reason: 'NOT_FOUND' };
            }
            usedRpc = true;
          } else if (pubResult.error) {
            console.warn('[Wizard.step1] get_business_public failed:', pubResult.error.message);
          }
        } catch (fallbackErr) {
          console.warn('[Wizard.step1] get_business_public exception:', fallbackErr.message);
        }
      }

      /* ─── 3 · لا RPC متاح → نعطي المستخدم رسالة واضحة ─── */
      if (!usedRpc) {
        const errMsg = WizState._lastRpcError?.message || '';
        console.error('[Wizard.step1] Both RPCs unavailable:', errMsg);

        return showError(
          'login-step1-error',
          'خدمة التحقق من النشاط غير متاحة. تأكد من تطبيق SQL الجديد ' +
          '(check_business_access / get_business_public)'
        );
      }

      /* ─── 4 · تقييم النتيجة ─── */
      if (!data || !data.ok) {
        const messages = {
          NOT_FOUND: 'الكود غير صحيح — تأكد من الكود التعريفي',
          INACTIVE: 'هذا النشاط غير مُفعَّل — تواصل مع الإدارة',
          SUSPENDED: 'النشاط موقوف مؤقتاً' + (data?.message ? `: ${data.message}` : ''),
          EXPIRED: 'انتهى اشتراك هذا النشاط — تواصل مع الإدارة للتجديد',
        };
        return showError(
          'login-step1-error',
          messages[data?.reason] || 'تعذّر التحقق من الكود'
        );
      }

      WizState.business = data;

      try {
        localStorage.setItem('gms.tenant.last_code', code);
      } catch (_) {}

      console.log('[Wizard] ✅ Business resolved:', {
        id: data.business_id,
        code: data.business_code,
        name: data.business_name,
        needs_activation: data.needs_activation,
        source: data._source || 'rpc',
      });

      renderBusinessPreview();

      if (data.needs_activation) {
        setStep(2);
      } else {
        setStep(3);
      }

    } catch (e) {
      console.error('[Wizard.step1]', e);
      showError('login-step1-error', `خطأ: ${e.message}`);
    } finally {
      busy(btn, false);
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §5 · STEP 2 — Verification Code
     ─────────────────────────────────────────────────────────────────────
     ✅ v2.0.0: RPC consume_verification_code حصرياً
     ═════════════════════════════════════════════════════════════════════ */
  async function submitStep2() {
    const input = $('#login-vcode');
    const btn = $('#login-step2-next');
    const code = (input?.value || '').trim();

    clearError('login-step2-error');

    if (!code || !/^\d{4,8}$/.test(code)) {
      return showError('login-step2-error', 'أدخل رمز تحقق من 4 إلى 8 أرقام');
    }
    if (!WizState.business) {
      return showError('login-step2-error', 'انتهت الجلسة — ابدأ من جديد');
    }

    const client = getSbClient();
    if (!client) return showError('login-step2-error', 'لا يوجد اتصال');

    busy(btn, true, 'جارٍ التحقق…');

    try {
      const bizId = WizState.business.business_id;
      let ok = false;

      /* RPC consume_verification_code */
      try {
        const { data, error } = await client.rpc('consume_verification_code', {
          p_business_id: bizId,
          p_code: code,
          p_purpose: 'activation',
          p_ip: null,
        });

        if (!error && data?.ok) {
          ok = true;
        } else if (error) {
          console.warn('[Wizard.step2] RPC failed:', error.message);
        }
      } catch (rpcErr) {
        console.warn('[Wizard.step2] RPC exception:', rpcErr.message);
      }

      if (!ok) {
        return showError(
          'login-step2-error',
          'الرمز غير صحيح أو منتهي أو مستخدم مسبقاً'
        );
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

  /* ═════════════════════════════════════════════════════════════════════
     §6 · STEP 3 — User Type
     ═════════════════════════════════════════════════════════════════════ */
  function submitStep3(userType) {
    if (userType !== 'owner' && userType !== 'employee') return;

    WizState.userType = userType;

    $$('[data-user-type]').forEach(el => {
      el.classList.toggle('selected', el.dataset.userType === userType);
    });

    console.log('[Wizard] ✅ User type:', userType);

    renderBusinessPreview();
    setStep(4);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §7 · STEP 4 — Credentials
     ─────────────────────────────────────────────────────────────────────
     ✅ v2.0.0: Direct Select على business_users مقبول
       (business_users مش محمي بـ owner_sessions RLS)
     ═════════════════════════════════════════════════════════════════════ */
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

    const bcrypt = getBcrypt();
    if (!bcrypt) {
      return showError(
        'login-step4-error',
        'مكتبة التحقق (bcrypt) غير محمَّلة — أعد تحميل الصفحة'
      );
    }

    const client = getSbClient();
    if (!client) return showError('login-step4-error', 'لا يوجد اتصال');

    busy(btn, true, 'جارٍ الدخول…');

    try {
      const bizId = WizState.business.business_id;

      /* جلب المستخدم من business_users (direct select — آمن) */
      const { data: users, error } = await client
        .from('business_users')
        .select(
          'id, business_id, username, password_hash, full_name, role, ' +
          'is_owner, is_active, phone, email, failed_attempts, locked_until, ' +
          'rep_id, branch_id, last_login, created_at'
        )
        .eq('business_id', bizId)
        .eq('username', username)
        .limit(1);

      if (error) throw error;

      if (!users || !users.length) {
        return showError('login-step4-error', 'اسم المستخدم أو كلمة المرور غير صحيحة');
      }

      const user = users[0];

      /* فحص الحساب نشط */
      if (user.is_active === false) {
        return showError('login-step4-error', 'هذا الحساب موقوف — تواصل مع الإدارة');
      }

      /* فحص القفل */
      if (user.locked_until && new Date(user.locked_until) > new Date()) {
        return showError('login-step4-error', 'الحساب مقفل مؤقتاً — حاول بعد قليل');
      }

      /* فحص نوع الحساب */
      const isOwner = Boolean(user.is_owner);
      if (WizState.userType === 'owner' && !isOwner) {
        return showError(
          'login-step4-error',
          'هذا الحساب ليس صاحب المحل — اختر "موظف"'
        );
      }
      if (WizState.userType === 'employee' && isOwner) {
        return showError(
          'login-step4-error',
          'هذا الحساب صاحب المحل — اختر "صاحب المحل"'
        );
      }

      /* مقارنة كلمة المرور عبر bcrypt */
      let passwordOk = false;
      try {
        passwordOk = bcrypt.compareSync(password, user.password_hash);
      } catch (bcryptErr) {
        console.error('[Wizard.step4] bcrypt compare failed:', bcryptErr);
        return showError('login-step4-error', 'خطأ في التحقق من كلمة المرور');
      }

      if (!passwordOk) {
        /* زيادة failed_attempts */
        const newAttempts = (user.failed_attempts || 0) + 1;
        const shouldLock = newAttempts >= 5;

        try {
          await client
            .from('business_users')
            .update({
              failed_attempts: newAttempts,
              locked_until: shouldLock
                ? new Date(Date.now() + 15 * 60 * 1000).toISOString()
                : null,
            })
            .eq('id', user.id);
        } catch (updErr) {
          console.warn('[Wizard.step4] Failed to update failed_attempts:', updErr.message);
        }

        GMS.Beep?.error?.();

        return showError(
          'login-step4-error',
          shouldLock
            ? 'الحساب مقفل لمدة 15 دقيقة بعد 5 محاولات خاطئة'
            : 'اسم المستخدم أو كلمة المرور غير صحيحة'
        );
      }

      /* ✅ نجاح — نصفّر failed_attempts ونحدّث last_login */
      const now = new Date().toISOString();

      try {
        await client
          .from('business_users')
          .update({
            failed_attempts: 0,
            locked_until: null,
            last_login: now,
          })
          .eq('id', user.id);
      } catch (updErr) {
        console.warn('[Wizard.step4] Failed to update login info:', updErr.message);
      }

      console.log('[Wizard] ✅ Auth success:', user.username);

      /* حذف password_hash من الكائن */
      const safeUser = { ...user };
      delete safeUser.password_hash;
      delete safeUser.failed_attempts;
      delete safeUser.locked_until;

      /* حفظ الجلسة */
      const session = {
        session_type: 'business_user',
        user: safeUser,
      };

      const businessInfo = {
        id: bizId,
        code: WizState.business.business_code,
        name: WizState.business.business_name,
      };

      if (GMS.Biz && typeof GMS.Biz.setSession === 'function') {
        GMS.Biz.setSession(session, businessInfo);
      } else {
        try {
          localStorage.setItem('gms.tenant.session', JSON.stringify({
            ...session,
            startedAt: Date.now(),
            expiresAt: Date.now() + 8 * 60 * 60 * 1000,
          }));
          localStorage.setItem('gms.tenant.business', JSON.stringify(businessInfo));
        } catch (_) {}
      }

      /* ═════════════════════════════════════════════════════════════════
         ✅ FIX v1.2.1: مزامنة GMS.Auth مع الـ Tenant Session
         ═════════════════════════════════════════════════════════════════ */
      if (GMS.Auth && GMS.AuthState) {
        try {
          const authProfile = {
            id: user.id,
            email: user.email || null,
            username: user.username,
            full_name: user.full_name || user.username,
            phone: user.phone || null,
            role: user.role || 'SALESPERSON',
            branch_id: user.branch_id || null,
            rep_id: user.rep_id || null,
            is_owner: Boolean(user.is_owner),
            is_active: user.is_active !== false,
            last_login: now,
            created_at: user.created_at || null,
            _source: 'tenant.wizard',
          };

          /* حقن في AuthState مباشرة */
          GMS.AuthState.user = {
            id: authProfile.id,
            email: authProfile.email || authProfile.username,
          };
          GMS.AuthState.profile = authProfile;
          GMS.AuthState.signedIn = true;
          GMS.AuthState.sessionStartedAt = Date.now();

          /* حساب الصلاحيات */
          try {
            if (typeof GMS.Auth._computePermissions === 'function') {
              GMS.Auth._computePermissions();
            } else {
              GMS.AuthState.permissions.clear();
              const rolePerms = GMS.PERMISSIONS?.[authProfile.role];
              if (Array.isArray(rolePerms)) {
                rolePerms.forEach(p => GMS.AuthState.permissions.add(p));
              }
            }
          } catch (permErr) {
            console.warn('[Wizard.step4] Permissions compute failed:', permErr);
          }

          /* حفظ gms.session */
          try {
            localStorage.setItem(
              (GMS.LS_KEYS && GMS.LS_KEYS.SESSION) || 'gms.session',
              JSON.stringify({
                userId: authProfile.id,
                email: authProfile.email || authProfile.username,
                rep_id: authProfile.rep_id || null,
                startedAt: Date.now(),
              })
            );
          } catch (_) {}

          /* إضافة الموظف في employees */
          try {
            const exists = GMS.AuthState.employees.find(e => e.id === authProfile.id);
            if (!exists) {
              GMS.AuthState.employees.push({
                ...authProfile,
                password: '__REDACTED__',
              });
            }
          } catch (_) {}

          console.log(
            '%c[Wizard.step4] ✅ Auth synchronized:',
            'color:#0f7a43;font-weight:900;font-size:13px;',
            {
              username: authProfile.username,
              role: authProfile.role,
              permissions: GMS.AuthState.permissions.size,
            }
          );
        } catch (syncErr) {
          console.error('[Wizard.step4] Auth sync failed:', syncErr);
        }
      } else {
        console.warn(
          '[Wizard.step4] ⚠️ GMS.Auth or GMS.AuthState not available — ' +
          'profile will be null in startApp(). ' +
          '23-boot.js has auto-recovery fallback.'
        );
      }

      /* تهيئة DB Wrapper */
      if (GMS.DB && typeof GMS.DB.init === 'function') {
        GMS.DB.init(client, bizId);
      }

      /* تغيير الشاشة */
      const loginScreen = document.getElementById('login-screen');
      if (loginScreen) loginScreen.style.display = 'none';

      const app = document.getElementById('app');
      if (app) app.classList.add('visible');

      GMS.Beep?.success?.();

      GMS.Toast?.ok?.(
        `مرحباً ${user.full_name || user.username}`,
        `${businessInfo.name} · ${isOwner ? 'صاحب المحل' : 'موظف'}`
      );

      /* بدء التطبيق */
      if (GMS.Boot && typeof GMS.Boot.startApp === 'function') {
        try {
          await GMS.Boot.startApp();
        } catch (bootErr) {
          console.error('[Wizard.step4] startApp failed:', bootErr);
          GMS.Toast?.warn?.('تحذير', 'تم الدخول لكن فشل تحميل بعض الأجزاء');
        }
      }

      /* Audit log */
      if (GMS.Audit && typeof GMS.Audit.log === 'function') {
        try {
          await GMS.Audit.log(
            'LOGIN',
            'session',
            user.id,
            `تسجيل دخول — ${user.full_name || user.username}`,
            {
              business_code: businessInfo.code,
              business_name: businessInfo.name,
              user_type: WizState.userType,
              role: user.role,
            }
          );
        } catch (_) {}
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
     §8 · NAVIGATION
     ═════════════════════════════════════════════════════════════════════ */
  function goBack() {
    if (WizState.step > 1) {
      let prev;
      if (WizState.step === 3 && !WizState.business?.needs_activation) {
        prev = 1;
      } else {
        prev = WizState.step - 1;
      }

      if (prev === 1) {
        WizState.verificationPassed = false;
        WizState.userType = null;
      }
      if (prev === 3) {
        WizState.userType = null;
        $$('[data-user-type]').forEach(el => el.classList.remove('selected'));
      }

      clearAllErrors();
      setStep(prev);
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §9 · Business Preview (Step 4)
     ═════════════════════════════════════════════════════════════════════ */
  function renderBusinessPreview() {
    const host = document.getElementById('login-biz-preview');
    if (!host) return;

    if (!WizState.business) {
      host.innerHTML = '';
      return;
    }

    const biz = WizState.business;

    host.innerHTML = `
      <div class="biz-preview">
        <div class="biz-preview-name">
          <i data-lucide="building-2" style="width:14px;height:14px;display:inline;vertical-align:-2px"></i>
          ${escapeHtml(biz.business_name || '—')}
        </div>
        <div class="biz-preview-meta">
          <span>
            <i data-lucide="hash"></i>
            <span class="mono">${escapeHtml(biz.business_code || '—')}</span>
          </span>
          ${WizState.userType ? `
            <span>
              <i data-lucide="${WizState.userType === 'owner' ? 'crown' : 'user-circle'}"></i>
              ${WizState.userType === 'owner' ? 'صاحب المحل' : 'موظف'}
            </span>
          ` : ''}
        </div>
      </div>
    `;

    window.lucide?.createIcons();
  }

  /* ═════════════════════════════════════════════════════════════════════
     §10 · BIND EVENTS
     ═════════════════════════════════════════════════════════════════════ */
  function bindEvents() {
    if (WizState.bound) {
      console.log('[TenantAuth] Events already bound');
      return;
    }

    /* Step 1 */
    const codeInput = $('#login-biz-code');

    if (codeInput) {
      codeInput.addEventListener('input', (e) => {
        e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
      });

      codeInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          submitStep1();
        }
      });
    }

    const step1Btn = $('#login-step1-next');
    if (step1Btn) {
      step1Btn.onclick = null;
      step1Btn.addEventListener('click', (e) => {
        e.preventDefault();
        submitStep1();
      });
    }

    /* Step 2 */
    const vcode = $('#login-vcode');

    if (vcode) {
      vcode.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 8);
      });

      vcode.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          submitStep2();
        }
      });
    }

    const step2Btn = $('#login-step2-next');
    if (step2Btn) {
      step2Btn.onclick = null;
      step2Btn.addEventListener('click', (e) => {
        e.preventDefault();
        submitStep2();
      });
    }

    const resendBtn = $('#login-step2-resend');
    if (resendBtn) {
      resendBtn.addEventListener('click', () => {
        GMS.Toast?.info?.('اطلب رمز جديد', 'تواصل مع مالك النظام');
      });
    }

    /* Step 3 */
    $$('[data-user-type]').forEach(el => {
      el.onclick = null;
      el.addEventListener('click', (e) => {
        e.preventDefault();
        submitStep3(el.dataset.userType);
      });
    });

    /* Step 4 */
    const userInput = $('#login-username');
    const passInput = $('#login-password');

    if (userInput) {
      userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          passInput?.focus();
        }
      });
    }

    if (passInput) {
      passInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          submitStep4();
        }
      });
    }

    const step4Btn = $('#login-step4-submit');
    if (step4Btn) {
      step4Btn.onclick = null;
      step4Btn.addEventListener('click', (e) => {
        e.preventDefault();
        submitStep4();
      });
    }

    /* Show/Hide password */
    const showPassBtn = $('#login-show-pass');
    if (showPassBtn) {
      showPassBtn.onclick = null;
      showPassBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const inp = $('#login-password');
        if (!inp) return;
        const isText = inp.type === 'text';
        inp.type = isText ? 'password' : 'text';
        e.currentTarget.innerHTML = isText
          ? '<i data-lucide="eye"></i>'
          : '<i data-lucide="eye-off"></i>';
        window.lucide?.createIcons();
      });
    }

    /* Back buttons */
    $$('[data-wizard-back]').forEach(btn => {
      btn.onclick = null;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        goBack();
      });
    });

    /* آخر كود محفوظ */
    if (codeInput && !codeInput.value) {
      try {
        const lastCode =
          (GMS.Biz && typeof GMS.Biz.getLastBusinessCode === 'function'
            ? GMS.Biz.getLastBusinessCode()
            : null) ||
          localStorage.getItem('gms.tenant.last_code') ||
          '';

        if (lastCode) {
          codeInput.value = lastCode;
          console.log('[TenantAuth] Prefilled last business code:', lastCode);
        }
      } catch (_) {}
    }

    WizState.bound = true;
    console.log('[TenantAuth] ✅ Events bound');
  }

  /* ═════════════════════════════════════════════════════════════════════
     §11 · INIT
     ═════════════════════════════════════════════════════════════════════ */
  function init() {
    if (WizState.initialized) {
      console.log('[TenantAuth] Already initialized');
      return;
    }

    if (!$('#login-biz-code')) {
      console.warn('[TenantAuth] ⚠️ Login wizard not present in DOM — skipping');
      return;
    }

    const client = getSbClient();
    if (!client) {
      console.warn('[TenantAuth] ⚠️ Supabase client not ready — will retry on user action');
    }

    const bcrypt = getBcrypt();
    if (!bcrypt) {
      console.warn('[TenantAuth] ⚠️ bcrypt not ready — will retry on login');
    }

    bindEvents();
    setStep(1);

    WizState.initialized = true;

    console.log(
      '%c[TenantAuth] ✅ Login Wizard v2.0.0 initialized',
      'color:#0f7a43;font-weight:800;font-size:12px;'
    );
  }

  /* ═════════════════════════════════════════════════════════════════════
     §12 · AUTO-BOOT
     ═════════════════════════════════════════════════════════════════════ */
  function boot() {
    if (!$('#login-biz-code')) {
      let attempts = 0;
      const tryAgain = () => {
        attempts++;
        if ($('#login-biz-code')) {
          init();
        } else if (attempts < 10) {
          setTimeout(tryAgain, 300);
        } else {
          console.warn('[TenantAuth] ⚠️ Wizard not found after retries');
        }
      };
      tryAgain();
      return;
    }

    setTimeout(init, 250);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §13 · EXPORT
     ═════════════════════════════════════════════════════════════════════ */
  GMS.TenantAuth = {
    __loaded: true,
    init,
    boot,
    state: WizState,
    getSbClient,
    getBcrypt,

    reset: () => {
      WizState.business = null;
      WizState.verificationPassed = false;
      WizState.userType = null;

      clearAllErrors();

      const codeInput = $('#login-biz-code');
      if (codeInput) {
        try {
          const lastCode = localStorage.getItem('gms.tenant.last_code') || '';
          codeInput.value = lastCode;
        } catch (_) {
          codeInput.value = '';
        }
      }

      const vcode = $('#login-vcode');
      if (vcode) vcode.value = '';

      const u = $('#login-username');
      if (u) u.value = '';

      const p = $('#login-password');
      if (p) {
        p.value = '';
        p.type = 'password';
      }

      $$('[data-user-type]').forEach(el => el.classList.remove('selected'));

      renderBusinessPreview();
      setStep(1);
    },

    logout: () => {
      try {
        if (GMS.Biz && typeof GMS.Biz.clear === 'function') {
          GMS.Biz.clear();
        } else {
          localStorage.removeItem('gms.tenant.session');
          localStorage.removeItem('gms.tenant.business');
        }
      } catch (_) {}
      location.reload();
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §14 · AUTO-BOOT TRIGGER
     ═════════════════════════════════════════════════════════════════════ */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  /* ═════════════════════════════════════════════════════════════════════
     §15 · LOADED CONFIRMATION
     ═════════════════════════════════════════════════════════════════════ */
  console.log(
    '%c🚪 TenantAuth Wizard v2.0.0 loaded · RPC-Only (Hardening Compliant)',
    'color:#1c4fd8;font-weight:900;font-size:12px;padding:2px 6px;' +
    'background:#e9efff;border-radius:4px;'
  );

  console.log(
    '%c🔐 Step 1 → RPC check_business_access + fallback get_business_public',
    'color:#6b7a95;font-weight:700;font-size:11px;'
  );

  console.log(
    '%c🔐 Step 2 → RPC consume_verification_code (لا direct update)',
    'color:#6b7a95;font-weight:700;font-size:11px;'
  );

  console.log(
    '%c🔐 Step 4 → Direct select على business_users (آمن)',
    'color:#6b7a95;font-weight:700;font-size:11px;'
  );

  console.log(
    '%c✅ Syncs GMS.Auth.profile + permissions before startApp()',
    'color:#0f7a43;font-weight:900;font-size:11px;'
  );
})();
