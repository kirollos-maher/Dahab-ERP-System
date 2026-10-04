/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ENTERPRISE — js/06-auth.js
   نظام المصادقة والصلاحيات وسجل التدقيق:
     - تسجيل الدخول والخروج
     - إدارة الجلسة
     - RBAC (Role-Based Access Control)
     - سجل التدقيق غير القابل للتعديل (Audit Trail)
     - إدارة الموظفين
   ✅ v2: دعم B2B_REP + حقل rep_id في الجلسة والملف الشخصي
   ✅ v2.1: FIX — tryRestoreSession يقرأ من gms.tenant.session كـ fallback
             (يحل مشكلة role: undefined بعد Tenant Wizard login)
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const GMS = window.GMS = window.GMS || {};

  /* ═════════════════════════════════════════════════════════════════════
     §1 · DEMO USERS (يعمل بدون Supabase)
     ═════════════════════════════════════════════════════════════════════ */
  const DEMO_USERS = [
    {
      id: 'usr-1',
      email: 'admin@goldms.eg',
      password: 'Admin@123',
      full_name: 'مصطفى عبد الرحمن',
      phone: '01001234567',
      role: 'SUPER_ADMIN',
      branch_id: null,
      rep_id: null,
      is_active: true,
      created_at: new Date(Date.now() - 400 * 86400000).toISOString(),
      last_login: null,
    },
    {
      id: 'usr-2',
      email: 'manager@goldms.eg',
      password: 'Manage@123',
      full_name: 'سارة إبراهيم',
      phone: '01098765432',
      role: 'BRANCH_MANAGER',
      branch_id: 'br-1',
      rep_id: null,
      is_active: true,
      created_at: new Date(Date.now() - 220 * 86400000).toISOString(),
      last_login: null,
    },
    {
      id: 'usr-3',
      email: 'accountant@goldms.eg',
      password: 'Account@1',
      full_name: 'محمد الشريف',
      phone: '01122334455',
      role: 'ACCOUNTANT',
      branch_id: 'br-1',
      rep_id: null,
      is_active: true,
      created_at: new Date(Date.now() - 180 * 86400000).toISOString(),
      last_login: null,
    },
    {
      id: 'usr-4',
      email: 'cashier@goldms.eg',
      password: 'Cashier@1',
      full_name: 'أحمد محمود',
      phone: '01555566677',
      role: 'SALESPERSON',
      branch_id: 'br-1',
      rep_id: null,
      is_active: true,
      created_at: new Date(Date.now() - 90 * 86400000).toISOString(),
      last_login: null,
    },
    {
      id: 'usr-5',
      email: 'cashier2@goldms.eg',
      password: 'Cashier@2',
      full_name: 'منى علي',
      phone: '01277788899',
      role: 'SALESPERSON',
      branch_id: 'br-2',
      rep_id: null,
      is_active: true,
      created_at: new Date(Date.now() - 60 * 86400000).toISOString(),
      last_login: null,
    },
    {
      id: 'usr-6',
      email: 'data@goldms.eg',
      password: 'Data@1234',
      full_name: 'خالد مصطفى',
      phone: '01033344455',
      role: 'DATA_ENTRY',
      branch_id: 'br-1',
      rep_id: null,
      is_active: true,
      created_at: new Date(Date.now() - 45 * 86400000).toISOString(),
      last_login: null,
    },
    {
      id: 'usr-7',
      email: 'ex-manager@goldms.eg',
      password: 'Ex@12345',
      full_name: 'كريم الرائد',
      phone: '01199988877',
      role: 'BRANCH_MANAGER',
      branch_id: 'br-2',
      rep_id: null,
      is_active: false,
      created_at: new Date(Date.now() - 300 * 86400000).toISOString(),
      last_login: null,
    },
    /* ✅ B2B_REP — بياعو الجملة المستقلون */
    {
      id: 'usr-8',
      email: 'rep1@goldms.eg',
      password: 'Rep@1234',
      full_name: 'محمود الباز',
      phone: '01155667788',
      role: 'B2B_REP',
      branch_id: 'br-1',
      rep_id: 'rep-1',          /* ✅ ربط ببياع جملة */
      is_active: true,
      created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
      last_login: null,
    },
    {
      id: 'usr-9',
      email: 'rep2@goldms.eg',
      password: 'Rep@1234',
      full_name: 'وليد النجار',
      phone: '01099887766',
      role: 'B2B_REP',
      branch_id: 'br-1',
      rep_id: 'rep-2',          /* ✅ بياع جملة آخر */
      is_active: true,
      created_at: new Date(Date.now() - 20 * 86400000).toISOString(),
      last_login: null,
    },
  ];

  /* ═════════════════════════════════════════════════════════════════════
     §2 · AUTH STATE
     ═════════════════════════════════════════════════════════════════════ */
  const AuthState = {
    /* المستخدم الحالي */
    user: null,           // { id, email }
    profile: null,        // { id, email, full_name, role, rep_id, ... }

    /* الصلاحيات */
    permissions: new Set(),

    /* حالة الجلسة */
    signedIn: false,
    sessionStartedAt: null,

    /* المستمعون */
    listeners: {
      signIn: new Set(),
      signOut: new Set(),
      sessionRestored: new Set(),
    },

    /* قائمة الموظفين المحلية */
    employees: DEMO_USERS.map(u => ({ ...u })),

    /* الحالة */
    initialized: false,
  };

  /* ═════════════════════════════════════════════════════════════════════
     §3 · EVENT EMITTER
     ═════════════════════════════════════════════════════════════════════ */

  function emit(event, data) {
    const set = AuthState.listeners[event];
    if (!set) return;

    set.forEach(fn => {
      try {
        fn(data);
      } catch (e) {
        console.error(`[Auth.emit:${event}]`, e);
      }
    });
  }

  function on(event, fn) {
    const set = AuthState.listeners[event];
    if (!set || typeof fn !== 'function') return () => {};

    set.add(fn);
    return () => set.delete(fn);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §4 · AUDIT LOG ENGINE
     ═════════════════════════════════════════════════════════════════════ */
  const Audit = {
    logs: [],
    MAX: 500,

    async log(action, entityType, entityId, description, metadata = {}) {
      const entry = {
        id: GMS.uid(),
        user_id: AuthState.user?.id || null,
        user_name: AuthState.profile?.full_name || 'غير معروف',
        user_email: AuthState.profile?.email || null,
        user_role: AuthState.profile?.role || null,
        user_rep_id: AuthState.profile?.rep_id || null,
        action,
        entity_type: entityType,
        entity_id: entityId,
        description,
        metadata: metadata || {},
        ip: '—',
        branch_id: AuthState.profile?.branch_id || null,
        created_at: new Date().toISOString(),
      };

      this.logs.unshift(entry);
      if (this.logs.length > this.MAX) {
        this.logs = this.logs.slice(0, this.MAX);
      }

      try {
        localStorage.setItem(
          GMS.LS_KEYS.AUDIT,
          JSON.stringify(this.logs.slice(0, 100))
        );
      } catch (_) {}

      if (GMS.Supabase.isReady()) {
        try {
          const client = GMS.Supabase.get();
          await client
            .from(GMS.SUPABASE_CONFIG.TABLES.AUDIT_LOGS)
            .insert({
              user_id: entry.user_id,
              action: entry.action,
              entity_type: entry.entity_type,
              entity_id: entry.entity_id,
              description: entry.description,
              metadata: entry.metadata,
              branch_id: entry.branch_id,
            });
        } catch (e) {
          console.warn('[Audit] Failed to persist to Supabase:', e.message);
        }
      }

      return entry;
    },

    getAll() {
      return this.logs;
    },

    filter(filters = {}) {
      const {
        action = '',
        role = '',
        search = '',
        entityType = '',
        limit = 200,
      } = filters;

      let rows = this.logs;

      if (action) rows = rows.filter(r => r.action === action);
      if (role) rows = rows.filter(r => r.user_role === role);
      if (entityType) rows = rows.filter(r => r.entity_type === entityType);

      if (search) {
        const q = search.toLowerCase();
        rows = rows.filter(r =>
          (r.user_name || '').toLowerCase().includes(q) ||
          (r.description || '').toLowerCase().includes(q) ||
          (r.entity_type || '').toLowerCase().includes(q) ||
          (r.action || '').toLowerCase().includes(q)
        );
      }

      return rows.slice(0, limit);
    },

    load() {
      try {
        const stored = localStorage.getItem(GMS.LS_KEYS.AUDIT);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            this.logs = parsed;
          }
        }
      } catch (_) {}
    },

    clear() {
      this.logs = [];
      try {
        localStorage.removeItem(GMS.LS_KEYS.AUDIT);
      } catch (_) {}
    },

    stats() {
      const byAction = {};
      const byRole = {};

      this.logs.forEach(l => {
        byAction[l.action] = (byAction[l.action] || 0) + 1;
        if (l.user_role) {
          byRole[l.user_role] = (byRole[l.user_role] || 0) + 1;
        }
      });

      return {
        total: this.logs.length,
        byAction,
        byRole,
        firstLog: this.logs[this.logs.length - 1]?.created_at,
        lastLog: this.logs[0]?.created_at,
      };
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §5 · AUTH ENGINE
     ═════════════════════════════════════════════════════════════════════ */
  const Auth = {

    /* ─── Getters ─────────────────────────────────────────────────── */

    get user() { return AuthState.user; },
    get profile() { return AuthState.profile; },
    get role() { return AuthState.profile?.role || null; },
    get branchId() { return AuthState.profile?.branch_id || null; },
    get repId() { return AuthState.profile?.rep_id || null; },   /* ✅ جديد */
    get isAuthenticated() { return AuthState.signedIn; },
    get permissionCount() { return AuthState.permissions.size; },

    /* ─── Initialization ──────────────────────────────────────────── */

    async init() {
      if (AuthState.initialized) return AuthState;

      Audit.load();

      const restored = this.tryRestoreSession();

      AuthState.initialized = true;

      return {
        restored,
        user: AuthState.user,
        profile: AuthState.profile,
      };
    },

    /* ─── Sign In ─────────────────────────────────────────────────── */

    async signIn(email, password) {
      email = String(email || '').trim().toLowerCase();

      if (!GMS.Validate.email(email)) {
        throw new Error(GMS.t('err.invalidEmail'));
      }
      if (!password || password.length < 6) {
        throw new Error(GMS.t('auth.invalidCredentials'));
      }

      /* ─── وضع Supabase ─────────────────────────────────────────── */
      if (GMS.Supabase.isReady()) {
        try {
          const client = GMS.Supabase.get();

          const { data, error } = await client.auth.signInWithPassword({
            email,
            password,
          });

          if (error) throw new Error(error.message);

          AuthState.user = {
            id: data.user.id,
            email: data.user.email,
          };

          const profileLoaded = await this._loadProfileFromSupabase();
          if (!profileLoaded) {
            throw new Error('لا يوجد ملف شخصي مرتبط بهذا الحساب');
          }

          if (!AuthState.profile.is_active) {
            throw new Error(GMS.t('auth.accountDisabled'));
          }

          this._computePermissions();
          await this._finalizeSignIn();

          return AuthState.profile;

        } catch (e) {
          console.error('[Auth.signIn] Supabase failed:', e);
          if (e.message.includes('Failed to fetch') ||
              e.message.includes('NetworkError')) {
            return this._signInDemo(email, password);
          }
          throw e;
        }
      }

      /* ─── وضع تجريبي ───────────────────────────────────────────── */
      return this._signInDemo(email, password);
    },

    async _signInDemo(email, password) {
      await GMS.sleep(350);

      const user = AuthState.employees.find(
        u => u.email.toLowerCase() === email
      );

      if (!user) {
        throw new Error(GMS.t('auth.invalidCredentials'));
      }

      if (user.password !== password) {
        throw new Error(GMS.t('auth.invalidCredentials'));
      }

      if (!user.is_active) {
        throw new Error(GMS.t('auth.accountDisabled'));
      }

      AuthState.user = {
        id: user.id,
        email: user.email,
      };

      AuthState.profile = { ...user };

      this._computePermissions();
      await this._finalizeSignIn();

      return AuthState.profile;
    },

    async _finalizeSignIn() {
      AuthState.signedIn = true;
      AuthState.sessionStartedAt = Date.now();

      if (AuthState.profile) {
        AuthState.profile.last_login = new Date().toISOString();

        const idx = AuthState.employees.findIndex(
          e => e.id === AuthState.profile.id
        );
        if (idx >= 0) {
          AuthState.employees[idx].last_login = AuthState.profile.last_login;
        }

        this._persistSession();

        await Audit.log(
          'LOGIN',
          'session',
          AuthState.profile.id,
          `تسجيل دخول ناجح — ${AuthState.profile.full_name}`,
          {
            email: AuthState.profile.email,
            role: AuthState.profile.role,
            rep_id: AuthState.profile.rep_id || null,   /* ✅ جديد */
            user_agent: navigator.userAgent.slice(0, 100),
          }
        );
      }

      emit('signIn', AuthState.profile);
    },

    /* ─── Sign Out ────────────────────────────────────────────────── */

    async signOut(opts = {}) {
      const { silent = false } = opts;

      if (!silent && AuthState.profile) {
        try {
          await Audit.log(
            'LOGOUT',
            'session',
            AuthState.profile.id,
            `تسجيل خروج — ${AuthState.profile.full_name}`
          );
        } catch (e) {
          console.warn('[Auth.signOut] Audit failed:', e);
        }
      }

      const lastProfile = AuthState.profile;
      emit('signOut', lastProfile);

      if (GMS.Supabase.isReady()) {
        try {
          await GMS.Supabase.get().auth.signOut();
        } catch (e) {
          console.warn('[Auth.signOut] Supabase failed:', e);
        }
      }

      AuthState.user = null;
      AuthState.profile = null;
      AuthState.permissions.clear();
      AuthState.signedIn = false;
      AuthState.sessionStartedAt = null;

      try {
        localStorage.removeItem(GMS.LS_KEYS.SESSION);
        /* ✅ v2.1: نظّف جلسة الـ Tenant أيضاً */
        localStorage.removeItem('gms.tenant.session');
        localStorage.removeItem('gms.tenant.business');
      } catch (_) {}
    },

    /* ─── Session Persistence ─────────────────────────────────────── */

    _persistSession() {
      try {
        localStorage.setItem(GMS.LS_KEYS.SESSION, JSON.stringify({
          userId: AuthState.user.id,
          email: AuthState.user.email,
          rep_id: AuthState.profile?.rep_id || null,   /* ✅ جديد */
          startedAt: AuthState.sessionStartedAt,
        }));
      } catch (_) {}
    },

    /**
     * ✅ v2.1: استرجاع الجلسة مع دعم مصادر متعددة
     * ─────────────────────────────────────────────────────────────────
     * الترتيب:
     *   1. gms.session (المصدر الأساسي — من Auth.signIn)
     *   2. gms.tenant.session (من Tenant Wizard — 00a-tenant-auth.js)
     *   3. Supabase auth (لو متاح)
     */
    tryRestoreSession() {
      try {
        /* ═══════════════════════════════════════════════════════════
           [1] المحاولة الأولى: gms.session (المسار العادي)
           ═══════════════════════════════════════════════════════════ */
        const stored = localStorage.getItem(GMS.LS_KEYS.SESSION);

        if (stored) {
          try {
            const session = JSON.parse(stored);

            if (session && session.userId) {
              /* فحص TTL */
              const elapsed = Date.now() - (session.startedAt || 0);
              if (elapsed > GMS.SECURITY_CONFIG.SESSION_TIMEOUT_MS) {
                console.warn('[Auth] ⏰ Session expired');
                localStorage.removeItem(GMS.LS_KEYS.SESSION);
                /* لا نرجع false — نكمل للمصادر الأخرى */
              } else {
                /* ابحث في employees */
                const user = AuthState.employees.find(u => u.id === session.userId);

                if (user && user.is_active) {
                  AuthState.user = { id: user.id, email: user.email };
                  AuthState.profile = { ...user };
                  AuthState.sessionStartedAt = session.startedAt || Date.now();
                  this._computePermissions();
                  AuthState.signedIn = true;

                  emit('sessionRestored', AuthState.profile);
                  console.log('[Auth] ✅ Restored from gms.session:', user.username || user.email);
                  return true;
                }
              }
            }
          } catch (parseErr) {
            console.warn('[Auth] Failed to parse gms.session:', parseErr.message);
          }
        }

        /* ═══════════════════════════════════════════════════════════
           [2] المحاولة الثانية: gms.tenant.session
               (من Tenant Wizard — 00a-tenant-auth.js)
           ═══════════════════════════════════════════════════════════ */
        const tenantRaw = localStorage.getItem('gms.tenant.session');

        if (tenantRaw) {
          try {
            const tenantSession = JSON.parse(tenantRaw);
            const tenantUser = tenantSession?.user;

            if (tenantUser && tenantUser.id) {
              /* فحص TTL */
              const startedAt = tenantSession.startedAt || Date.now();
              const expiresAt = tenantSession.expiresAt || (startedAt + GMS.SECURITY_CONFIG.SESSION_TIMEOUT_MS);
              const elapsed = Date.now() - startedAt;

              if (expiresAt && Date.now() > expiresAt) {
                console.warn('[Auth] ⏰ Tenant session expired');
                localStorage.removeItem('gms.tenant.session');
                localStorage.removeItem('gms.tenant.business');
              } else {
                /* ✅ نبني profile متوافق مع نموذج Auth */
                const profile = {
                  id: tenantUser.id,
                  email: tenantUser.email || null,
                  username: tenantUser.username,
                  full_name: tenantUser.full_name || tenantUser.username,
                  phone: tenantUser.phone || null,
                  role: tenantUser.role || 'SALESPERSON',
                  branch_id: tenantUser.branch_id || null,
                  rep_id: tenantUser.rep_id || null,
                  is_owner: Boolean(tenantUser.is_owner),
                  is_active: tenantUser.is_active !== false,
                  last_login: tenantUser.last_login || null,
                  created_at: tenantUser.created_at || null,
                  _source: 'tenant.session',
                };

                AuthState.user = {
                  id: profile.id,
                  email: profile.email || profile.username,
                };
                AuthState.profile = profile;
                AuthState.sessionStartedAt = startedAt;
                AuthState.signedIn = true;

                this._computePermissions();

                /* ✅ نُزامن للـ gms.session عشان الاستدعاءات القادمة */
                try {
                  localStorage.setItem(
                    GMS.LS_KEYS.SESSION,
                    JSON.stringify({
                      userId: profile.id,
                      email: profile.email || profile.username,
                      rep_id: profile.rep_id || null,
                      startedAt: startedAt,
                    })
                  );
                } catch (_) {}

                /* نضيف الموظف للـ employees عشان يبقى متاح في getEmployeeById */
                const exists = AuthState.employees.find(e => e.id === profile.id);
                if (!exists) {
                  AuthState.employees.push({
                    id: profile.id,
                    email: profile.email,
                    username: profile.username,
                    full_name: profile.full_name,
                    phone: profile.phone,
                    role: profile.role,
                    branch_id: profile.branch_id,
                    rep_id: profile.rep_id,
                    is_owner: profile.is_owner,
                    is_active: profile.is_active,
                    created_at: profile.created_at,
                    last_login: profile.last_login,
                  });
                }

                emit('sessionRestored', AuthState.profile);

                console.log(
                  '%c[Auth] ✅ Restored from gms.tenant.session:',
                  'color:#0f7a43;font-weight:800;',
                  profile.username,
                  '· role:', profile.role,
                  '· perms:', AuthState.permissions.size
                );

                return true;
              }
            }
          } catch (parseErr) {
            console.warn('[Auth] Failed to parse gms.tenant.session:', parseErr.message);
          }
        }

        /* ═══════════════════════════════════════════════════════════
           [3] لا يوجد أي جلسة صالحة
           ═══════════════════════════════════════════════════════════ */
        return false;

      } catch (e) {
        console.warn('[Auth.tryRestoreSession]', e.message);
        return false;
      }
    },

    /* ─── Profile Loading ─────────────────────────────────────────── */

    async _loadProfileFromSupabase() {
      try {
        const client = GMS.Supabase.get();
        if (!client || !AuthState.user) return false;

        const { data, error } = await client
          .from(GMS.SUPABASE_CONFIG.TABLES.PROFILES)
          .select('*')
          .eq('id', AuthState.user.id)
          .maybeSingle();

        if (error) throw error;
        if (!data) return false;

        /* ✅ تطبيع rep_id */
        if (data.rep_id === undefined) data.rep_id = null;

        AuthState.profile = data;
        return true;
      } catch (e) {
        console.error('[Auth._loadProfileFromSupabase]', e.message);
        return false;
      }
    },

    /* ─── RBAC ────────────────────────────────────────────────────── */

    _computePermissions() {
      AuthState.permissions.clear();

      const role = AuthState.profile?.role;
      if (!role) {
        console.warn('[Auth] ⚠️ No role found — permissions empty');
        return;
      }

      if (!GMS.PERMISSIONS || !GMS.PERMISSIONS[role]) {
        console.warn(`[Auth] ⚠️ Unknown role: ${role} — no permissions matrix`);
        return;
      }

      GMS.PERMISSIONS[role].forEach(p => AuthState.permissions.add(p));

      console.log(
        `%c[Auth] ✅ Permissions computed for role "${role}": ${AuthState.permissions.size}`,
        'color:#0f7a43;font-weight:700;font-size:11px;'
      );
    },

    can(permission) {
      return AuthState.permissions.has(permission);
    },

    canAny(...permissions) {
      return permissions.some(p => this.can(p));
    },

    canAll(...permissions) {
      return permissions.every(p => this.can(p));
    },

    isRole(roleKey) {
      return AuthState.profile?.role === roleKey;
    },

    isAnyRole(...roleKeys) {
      return roleKeys.includes(AuthState.profile?.role);
    },

    atLeast(roleKey) {
      const userLevel = GMS.ROLES[AuthState.profile?.role]?.level || 0;
      const requiredLevel = GMS.ROLES[roleKey]?.level || 999;
      return userLevel >= requiredLevel;
    },

    getPermissions() {
      return Array.from(AuthState.permissions);
    },

    isInBranch(branchId) {
      if (this.isRole('SUPER_ADMIN')) return true;
      return AuthState.profile?.branch_id === branchId;
    },

    /* ✅ جديد: هل المستخدم بياع جملة؟ */
    isB2BRep() {
      return AuthState.profile?.role === 'B2B_REP';
    },

    /* ✅ جديد: هل يمكنه الوصول لبياع معين؟ */
    canAccessRep(repId) {
      if (this.isRole('SUPER_ADMIN') ||
          this.isRole('BRANCH_MANAGER') ||
          this.isRole('ACCOUNTANT')) {
        return true;
      }
      if (this.isB2BRep()) {
        return AuthState.profile?.rep_id === repId;
      }
      return false;
    },

    /* ─── Employee Management ─────────────────────────────────────── */

    getEmployees(filters = {}) {
      const { role = '', branch_id = '', active = null, search = '' } = filters;

      let rows = AuthState.employees.slice();

      if (role) rows = rows.filter(u => u.role === role);
      if (branch_id) rows = rows.filter(u => u.branch_id === branch_id);
      if (active !== null) rows = rows.filter(u => u.is_active === active);

      if (search) {
        const q = search.toLowerCase();
        rows = rows.filter(u =>
          (u.full_name || '').toLowerCase().includes(q) ||
          (u.email || '').toLowerCase().includes(q) ||
          (u.phone || '').includes(q)
        );
      }

      return rows;
    },

    getEmployeeById(id) {
      return AuthState.employees.find(u => u.id === id) || null;
    },

    getEmployeeByEmail(email) {
      return AuthState.employees.find(
        u => u.email && u.email.toLowerCase() === String(email).toLowerCase()
      ) || null;
    },

    async createEmployee(data) {
      if (!this.can('manageEmployees')) {
        throw new Error(GMS.t('err.permissionDenied'));
      }

      if (!data.full_name || data.full_name.trim().length < 2) {
        throw new Error(GMS.t('err.required'));
      }
      if (!GMS.Validate.email(data.email)) {
        throw new Error(GMS.t('err.invalidEmail'));
      }
      if (!GMS.Validate.phoneEG(data.phone)) {
        throw new Error(GMS.t('err.invalidPhone'));
      }
      if (!GMS.isValidRole(data.role)) {
        throw new Error(GMS.t('err.invalidFormat'));
      }

      if (this.getEmployeeByEmail(data.email)) {
        throw new Error(GMS.t('err.alreadyExists'));
      }

      if (data.password) {
        const pwdCheck = GMS.Validate.password(data.password);
        if (!pwdCheck.valid) {
          throw new Error(GMS.t('emp.passwordRequirements'));
        }
      }

      const sanitized = GMS.sanitizePayload({
        full_name: data.full_name,
        email: data.email.toLowerCase().trim(),
        phone: data.phone.trim(),
        role: data.role,
        branch_id: data.branch_id || null,
        rep_id: data.rep_id || null,   /* ✅ جديد */
        notes: data.notes || '',
      }, { maxLength: 200 });

      const newUser = {
        id: 'usr-' + GMS.uid(),
        ...sanitized,
        password: data.password || 'Temp@1234',
        is_active: true,
        created_at: new Date().toISOString(),
        last_login: null,
        created_by: AuthState.profile?.id || null,
      };

      AuthState.employees.push(newUser);

      if (GMS.Supabase.isReady()) {
        try {
          const client = GMS.Supabase.get();

          const { data: authData, error: authError } = await client.auth.signUp({
            email: newUser.email,
            password: data.password || 'Temp@1234',
            options: {
              data: {
                full_name: newUser.full_name,
                role: newUser.role,
              },
            },
          });

          if (authError) throw authError;

          if (authData?.user) {
            await client
              .from(GMS.SUPABASE_CONFIG.TABLES.PROFILES)
              .insert({
                id: authData.user.id,
                email: newUser.email,
                full_name: newUser.full_name,
                phone: newUser.phone,
                role: newUser.role,
                branch_id: newUser.branch_id,
                rep_id: newUser.rep_id,   /* ✅ جديد */
                is_active: true,
              });
          }
        } catch (e) {
          console.warn('[Auth.createEmployee] Supabase failed:', e.message);
        }
      }

      await Audit.log(
        'CREATE',
        'user',
        newUser.id,
        `أنشأ حساب موظف جديد: ${newUser.full_name} (${GMS.getRole(newUser.role)?.label || newUser.role})`,
        {
          email: newUser.email,
          role: newUser.role,
          branch_id: newUser.branch_id,
          rep_id: newUser.rep_id,
        }
      );

      return newUser;
    },

    async updateEmployee(id, data) {
      if (!this.can('manageEmployees')) {
        throw new Error(GMS.t('err.permissionDenied'));
      }

      const idx = AuthState.employees.findIndex(u => u.id === id);
      if (idx < 0) throw new Error(GMS.t('err.notFound'));

      const old = AuthState.employees[idx];

      if (data.full_name !== undefined && data.full_name.trim().length < 2) {
        throw new Error(GMS.t('err.required'));
      }
      if (data.email !== undefined && !GMS.Validate.email(data.email)) {
        throw new Error(GMS.t('err.invalidEmail'));
      }
      if (data.phone !== undefined && !GMS.Validate.phoneEG(data.phone)) {
        throw new Error(GMS.t('err.invalidPhone'));
      }
      if (data.role !== undefined && !GMS.isValidRole(data.role)) {
        throw new Error(GMS.t('err.invalidFormat'));
      }

      if (data.role !== undefined && !this.isRole('SUPER_ADMIN')) {
        delete data.role;
      }

      const sanitized = GMS.sanitizePayload(data, { maxLength: 200 });

      const updated = {
        ...old,
        ...sanitized,
        updated_at: new Date().toISOString(),
        updated_by: AuthState.profile?.id || null,
      };

      AuthState.employees[idx] = updated;

      if (GMS.Supabase.isReady() && !id.startsWith('usr-') === false) {
        try {
          const client = GMS.Supabase.get();
          await client
            .from(GMS.SUPABASE_CONFIG.TABLES.PROFILES)
            .update({
              full_name: updated.full_name,
              phone: updated.phone,
              role: updated.role,
              branch_id: updated.branch_id,
              rep_id: updated.rep_id,   /* ✅ جديد */
              is_active: updated.is_active,
            })
            .eq('id', id);
        } catch (e) {
          console.warn('[Auth.updateEmployee] Supabase failed:', e.message);
        }
      }

      if (AuthState.profile && AuthState.profile.id === id) {
        AuthState.profile = { ...updated };
        this._computePermissions();
      }

      const changes = Object.keys(sanitized).filter(k => old[k] !== sanitized[k]);

      await Audit.log(
        'UPDATE',
        'user',
        id,
        `عدّل بيانات الموظف: ${updated.full_name}`,
        {
          changed_fields: changes,
          before: GMS.pick(old, changes),
          after: GMS.pick(sanitized, changes),
        }
      );

      return updated;
    },

    async toggleEmployeeActive(id, isActive) {
      if (!this.can('manageEmployees')) {
        throw new Error(GMS.t('err.permissionDenied'));
      }

      if (AuthState.profile?.id === id) {
        throw new Error('لا يمكنك تعطيل حسابك الخاص');
      }

      return this.updateEmployee(id, { is_active: isActive });
    },

    /* ─── Utilities ───────────────────────────────────────────────── */

    getSessionTimeRemaining() {
      if (!AuthState.sessionStartedAt) return 0;
      const elapsed = Date.now() - AuthState.sessionStartedAt;
      return Math.max(0, GMS.SECURITY_CONFIG.SESSION_TIMEOUT_MS - elapsed);
    },

    refreshSession() {
      AuthState.sessionStartedAt = Date.now();
      this._persistSession();
    },

    getSummary() {
      if (!AuthState.profile) return null;

      return {
        id: AuthState.profile.id,
        name: AuthState.profile.full_name,
        initials: GMS.initials(AuthState.profile.full_name),
        email: AuthState.profile.email,
        phone: AuthState.profile.phone,
        role: AuthState.profile.role,
        roleLabel: GMS.getRole(AuthState.profile.role)?.label || '',
        roleIcon: GMS.getRole(AuthState.profile.role)?.icon || 'user',
        branchId: AuthState.profile.branch_id,
        branchName: AuthState.profile.branch_id
          ? (GMS.getBranches().find(b => b.id === AuthState.profile.branch_id)?.name || '—')
          : 'كل الفروع',
        repId: AuthState.profile.rep_id || null,   /* ✅ جديد */
        permissionCount: AuthState.permissions.size,
      };
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §6 · PERMISSION GUARDS
     ═════════════════════════════════════════════════════════════════════ */
  const Guard = {

    denied(title, message) {
      const t = title || GMS.t('err.permissionDenied');
      const m = message || GMS.t('err.permissionDeniedDesc');

      return `
        <div class="empty" style="padding:80px 20px">
          <i data-lucide="lock" style="color:var(--danger);opacity:.5"></i>
          <p>${GMS.esc(t)}</p>
          <span>${GMS.esc(m)}</span>
        </div>`;
    },

    require(permission) {
      return Auth.can(permission);
    },

    requireRole(...roles) {
      return Auth.isAnyRole(...roles);
    },

    hideIfNoPermission(el, permission) {
      const target = typeof el === 'string' ? GMS.$(el) : el;
      if (!target) return;

      if (!Auth.can(permission)) {
        target.style.display = 'none';
      }
    },

    disableIfNoPermission(el, permission) {
      const target = typeof el === 'string' ? GMS.$(el) : el;
      if (!target) return;

      if (!Auth.can(permission)) {
        target.disabled = true;
        target.setAttribute('title', GMS.t('err.permissionDenied'));
      }
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §7 · EXPORT
     ═════════════════════════════════════════════════════════════════════ */
  GMS.Auth = Auth;
  GMS.Audit = Audit;
  GMS.Guard = Guard;
  GMS.AuthState = AuthState;
  GMS.DEMO_USERS = DEMO_USERS;

  /* ═════════════════════════════════════════════════════════════════════
     §8 · LOADED CONFIRMATION
     ═════════════════════════════════════════════════════════════════════ */
  console.log(
    '%c🔐 Auth & RBAC v2.1 loaded · 6 roles + B2B_REP · Multi-Source Session Restore',
    'color:#b3261e;font-weight:800;font-size:12px;padding:1px 5px;' +
    'background:#fdecea;border-radius:4px;'
  );

  console.log(
    `%c👥 ${DEMO_USERS.length} demo users (2 B2B reps) · ` +
    `${Object.keys(GMS.PERM_LABELS).length} permissions`,
    'color:#6b7a95;font-weight:700;font-size:11px;'
  );

  console.log(
    `%c🆕 v2.1: tryRestoreSession reads from gms.session → gms.tenant.session`,
    'color:#a55a00;font-weight:900;font-size:11px;'
  );

  console.log(
    `%c🆕 v2.1: signOut clears both gms.session + gms.tenant.session`,
    'color:#a55a00;font-weight:900;font-size:11px;'
  );

  /* ═════════════════════════════════════════════════════════════════════
     ✅ js/06-auth.js — نهاية الملف
     ═════════════════════════════════════════════════════════════════════ */

})();
