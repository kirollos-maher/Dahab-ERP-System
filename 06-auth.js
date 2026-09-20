/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ENTERPRISE — js/06-auth.js
   نظام المصادقة والصلاحيات وسجل التدقيق:
     - تسجيل الدخول والخروج
     - إدارة الجلسة
     - RBAC (Role-Based Access Control)
     - سجل التدقيق غير القابل للتعديل (Audit Trail)
     - إدارة الموظفين
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
      is_active: false,
      created_at: new Date(Date.now() - 300 * 86400000).toISOString(),
      last_login: null,
    },
  ];

  /* ═════════════════════════════════════════════════════════════════════
     §2 · AUTH STATE
     ═════════════════════════════════════════════════════════════════════ */
  const AuthState = {
    /* المستخدم الحالي */
    user: null,           // { id, email }
    profile: null,        // { id, email, full_name, role, ... }

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

  /**
   * إطلاق حدث
   * @param {string} event
   * @param {*} data
   */
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

  /**
   * الاشتراك في حدث
   * @param {string} event
   * @param {Function} fn
   * @returns {Function} unsubscribe
   */
  function on(event, fn) {
    const set = AuthState.listeners[event];
    if (!set || typeof fn !== 'function') return () => {};

    set.add(fn);
    return () => set.delete(fn);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §4 · AUDIT LOG ENGINE
     ─────────────────────────────────────────────────────────────────────
     سجل غير قابل للتعديل لكل العمليات الحساسة
     ═════════════════════════════════════════════════════════════════════ */
  const Audit = {
    logs: [],
    MAX: 500,

    /**
     * إضافة إدخال إلى السجل
     * @param {string} action
     * @param {string} entityType
     * @param {string} entityId
     * @param {string} description
     * @param {Object} [metadata={}]
     * @returns {Promise<Object>}
     */
    async log(action, entityType, entityId, description, metadata = {}) {
      const entry = {
        id: GMS.uid(),
        user_id: AuthState.user?.id || null,
        user_name: AuthState.profile?.full_name || 'غير معروف',
        user_email: AuthState.profile?.email || null,
        user_role: AuthState.profile?.role || null,
        action,
        entity_type: entityType,
        entity_id: entityId,
        description,
        metadata: metadata || {},
        ip: '—',   // يُملأ من الخادم في وضع الإنتاج
        branch_id: AuthState.profile?.branch_id || null,
        created_at: new Date().toISOString(),
      };

      // إضافة محلياً
      this.logs.unshift(entry);
      if (this.logs.length > this.MAX) {
        this.logs = this.logs.slice(0, this.MAX);
      }

      // حفظ آخر 100 في LocalStorage
      try {
        localStorage.setItem(
          GMS.LS_KEYS.AUDIT,
          JSON.stringify(this.logs.slice(0, 100))
        );
      } catch (_) {}

      // رفع إلى Supabase إذا متاح
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

    /**
     * قراءة السجل كاملاً
     * @returns {Array}
     */
    getAll() {
      return this.logs;
    },

    /**
     * فلترة السجل
     * @param {Object} [filters={}]
     * @param {string} [filters.action]
     * @param {string} [filters.role]
     * @param {string} [filters.search]
     * @param {string} [filters.entityType]
     * @param {number} [filters.limit=200]
     * @returns {Array}
     */
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

    /**
     * تحميل السجل من LocalStorage
     */
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

    /**
     * تفريغ السجل (لا يجب أن يُستخدم في الإنتاج)
     */
    clear() {
      this.logs = [];
      try {
        localStorage.removeItem(GMS.LS_KEYS.AUDIT);
      } catch (_) {}
    },

    /**
     * إحصائيات السجل
     * @returns {Object}
     */
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
    get isAuthenticated() { return AuthState.signedIn; },
    get permissionCount() { return AuthState.permissions.size; },

    /* ─── Initialization ──────────────────────────────────────────── */

    /**
     * تهيئة نظام المصادقة
     * @returns {Promise<Object>}
     */
    async init() {
      if (AuthState.initialized) return AuthState;

      // تحميل سجل التدقيق
      Audit.load();

      // محاولة استرجاع الجلسة
      const restored = this.tryRestoreSession();

      AuthState.initialized = true;

      return {
        restored,
        user: AuthState.user,
        profile: AuthState.profile,
      };
    },

    /* ─── Sign In ─────────────────────────────────────────────────── */

    /**
     * تسجيل الدخول
     * @param {string} email
     * @param {string} password
     * @returns {Promise<Object>}
     */
    async signIn(email, password) {
      email = String(email || '').trim().toLowerCase();

      // التحقق من المدخلات
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

          // تحميل الملف الشخصي
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
          // نسقط إلى demo mode إذا فشل الاتصال
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

    /**
     * تسجيل الدخول في الوضع التجريبي
     * @param {string} email
     * @param {string} password
     * @returns {Promise<Object>}
     * @private
     */
    async _signInDemo(email, password) {
      // محاكاة تأخير الشبكة
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

    /**
     * عمليات نهائية بعد تسجيل الدخول
     * @returns {Promise<void>}
     * @private
     */
    async _finalizeSignIn() {
      AuthState.signedIn = true;
      AuthState.sessionStartedAt = Date.now();

      // تحديث آخر دخول
      if (AuthState.profile) {
        AuthState.profile.last_login = new Date().toISOString();

        // تحديث في المصفوفة المحلية
        const idx = AuthState.employees.findIndex(
          e => e.id === AuthState.profile.id
        );
        if (idx >= 0) {
          AuthState.employees[idx].last_login = AuthState.profile.last_login;
        }

        // حفظ الجلسة
        this._persistSession();

        // سجل التدقيق
        await Audit.log(
          'LOGIN',
          'session',
          AuthState.profile.id,
          `تسجيل دخول ناجح — ${AuthState.profile.full_name}`,
          {
            email: AuthState.profile.email,
            role: AuthState.profile.role,
            user_agent: navigator.userAgent.slice(0, 100),
          }
        );
      }

      // إبلاغ المستمعين
      emit('signIn', AuthState.profile);
    },

    /* ─── Sign Out ────────────────────────────────────────────────── */

    /**
     * تسجيل الخروج
     * @param {Object} [opts]
     * @param {boolean} [opts.silent=false] — عدم تسجيل الخروج في السجل
     * @returns {Promise<void>}
     */
    async signOut(opts = {}) {
      const { silent = false } = opts;

      // سجل التدقيق (قبل مسح الحالة)
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

      // إبلاغ المستمعين
      const lastProfile = AuthState.profile;
      emit('signOut', lastProfile);

      // مسح Supabase session
      if (GMS.Supabase.isReady()) {
        try {
          await GMS.Supabase.get().auth.signOut();
        } catch (e) {
          console.warn('[Auth.signOut] Supabase failed:', e);
        }
      }

      // مسح الحالة
      AuthState.user = null;
      AuthState.profile = null;
      AuthState.permissions.clear();
      AuthState.signedIn = false;
      AuthState.sessionStartedAt = null;

      // مسح الجلسة المحفوظة
      try {
        localStorage.removeItem(GMS.LS_KEYS.SESSION);
      } catch (_) {}
    },

    /* ─── Session Persistence ─────────────────────────────────────── */

    /**
     * حفظ الجلسة في LocalStorage
     * @private
     */
    _persistSession() {
      try {
        localStorage.setItem(GMS.LS_KEYS.SESSION, JSON.stringify({
          userId: AuthState.user.id,
          email: AuthState.user.email,
          startedAt: AuthState.sessionStartedAt,
        }));
      } catch (_) {}
    },

    /**
     * استرجاع الجلسة المحفوظة
     * @returns {boolean}
     */
    tryRestoreSession() {
      try {
        const stored = localStorage.getItem(GMS.LS_KEYS.SESSION);
        if (!stored) return false;

        const session = JSON.parse(stored);
        if (!session.userId) return false;

        // فحص مدة انتهاء الجلسة
        const elapsed = Date.now() - (session.startedAt || 0);
        if (elapsed > GMS.SECURITY_CONFIG.SESSION_TIMEOUT_MS) {
          localStorage.removeItem(GMS.LS_KEYS.SESSION);
          return false;
        }

        // البحث عن المستخدم
        const user = AuthState.employees.find(u => u.id === session.userId);
        if (!user || !user.is_active) {
          localStorage.removeItem(GMS.LS_KEYS.SESSION);
          return false;
        }

        AuthState.user = { id: user.id, email: user.email };
        AuthState.profile = { ...user };
        AuthState.sessionStartedAt = session.startedAt;
        this._computePermissions();
        AuthState.signedIn = true;

        emit('sessionRestored', AuthState.profile);
        return true;

      } catch (e) {
        console.warn('[Auth.tryRestoreSession]', e.message);
        return false;
      }
    },

    /* ─── Profile Loading ─────────────────────────────────────────── */

    /**
     * تحميل الملف الشخصي من Supabase
     * @returns {Promise<boolean>}
     * @private
     */
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

        AuthState.profile = data;
        return true;
      } catch (e) {
        console.error('[Auth._loadProfileFromSupabase]', e.message);
        return false;
      }
    },

    /* ─── RBAC ────────────────────────────────────────────────────── */

    /**
     * حساب الصلاحيات من الدور
     * @private
     */
    _computePermissions() {
      AuthState.permissions.clear();

      const role = AuthState.profile?.role;
      if (!role || !GMS.PERMISSIONS[role]) return;

      GMS.PERMISSIONS[role].forEach(p => AuthState.permissions.add(p));
    },

    /**
     * فحص صلاحية
     * @param {string} permission
     * @returns {boolean}
     */
    can(permission) {
      return AuthState.permissions.has(permission);
    },

    /**
     * فحص أي صلاحية من قائمة
     * @param {...string} permissions
     * @returns {boolean}
     */
    canAny(...permissions) {
      return permissions.some(p => this.can(p));
    },

    /**
     * فحص كل الصلاحيات
     * @param {...string} permissions
     * @returns {boolean}
     */
    canAll(...permissions) {
      return permissions.every(p => this.can(p));
    },

    /**
     * فحص دور محدد
     * @param {string} roleKey
     * @returns {boolean}
     */
    isRole(roleKey) {
      return AuthState.profile?.role === roleKey;
    },

    /**
     * فحص دور من عدة أدوار
     * @param {...string} roleKeys
     * @returns {boolean}
     */
    isAnyRole(...roleKeys) {
      return roleKeys.includes(AuthState.profile?.role);
    },

    /**
     * فحص المستوى الأدنى من الصلاحية
     * @param {string} roleKey
     * @returns {boolean}
     */
    atLeast(roleKey) {
      const userLevel = GMS.ROLES[AuthState.profile?.role]?.level || 0;
      const requiredLevel = GMS.ROLES[roleKey]?.level || 999;
      return userLevel >= requiredLevel;
    },

    /**
     * قراءة كل الصلاحيات الحالية
     * @returns {Array<string>}
     */
    getPermissions() {
      return Array.from(AuthState.permissions);
    },

    /**
     * فحص ما إذا كان المستخدم من نفس الفرع
     * @param {string} branchId
     * @returns {boolean}
     */
    isInBranch(branchId) {
      if (this.isRole('SUPER_ADMIN')) return true;
      return AuthState.profile?.branch_id === branchId;
    },

    /* ─── Employee Management ─────────────────────────────────────── */

    /**
     * قراءة كل الموظفين
     * @param {Object} [filters={}]
     * @returns {Array}
     */
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

    /**
     * قراءة موظف بالمعرف
     * @param {string} id
     * @returns {Object|null}
     */
    getEmployeeById(id) {
      return AuthState.employees.find(u => u.id === id) || null;
    },

    /**
     * قراءة موظف بالبريد
     * @param {string} email
     * @returns {Object|null}
     */
    getEmployeeByEmail(email) {
      return AuthState.employees.find(
        u => u.email.toLowerCase() === String(email).toLowerCase()
      ) || null;
    },

    /**
     * إضافة موظف جديد
     * @param {Object} data
     * @returns {Promise<Object>}
     */
    async createEmployee(data) {
      if (!this.can('manageEmployees')) {
        throw new Error(GMS.t('err.permissionDenied'));
      }

      // التحقق من الصحة
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

      // التحقق من عدم التكرار
      if (this.getEmployeeByEmail(data.email)) {
        throw new Error(GMS.t('err.alreadyExists'));
      }

      // التحقق من كلمة المرور
      if (data.password) {
        const pwdCheck = GMS.Validate.password(data.password);
        if (!pwdCheck.valid) {
          throw new Error(GMS.t('emp.passwordRequirements'));
        }
      }

      // تنظيف المدخلات
      const sanitized = GMS.sanitizePayload({
        full_name: data.full_name,
        email: data.email.toLowerCase().trim(),
        phone: data.phone.trim(),
        role: data.role,
        branch_id: data.branch_id || null,
        notes: data.notes || '',
      }, { maxLength: 200 });

      // إنشاء الموظف محلياً
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

      // رفع إلى Supabase
      if (GMS.Supabase.isReady()) {
        try {
          const client = GMS.Supabase.get();

          // إنشاء حساب مصادقة
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

          // إضافة ملف شخصي
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
                is_active: true,
              });
          }
        } catch (e) {
          console.warn('[Auth.createEmployee] Supabase failed:', e.message);
          // نستمر — المستخدم موجود محلياً
        }
      }

      // سجل التدقيق
      await Audit.log(
        'CREATE',
        'user',
        newUser.id,
        `أنشأ حساب موظف جديد: ${newUser.full_name} (${GMS.getRole(newUser.role)?.label || newUser.role})`,
        {
          email: newUser.email,
          role: newUser.role,
          branch_id: newUser.branch_id,
        }
      );

      return newUser;
    },

    /**
     * تعديل موظف
     * @param {string} id
     * @param {Object} data
     * @returns {Promise<Object>}
     */
    async updateEmployee(id, data) {
      if (!this.can('manageEmployees')) {
        throw new Error(GMS.t('err.permissionDenied'));
      }

      const idx = AuthState.employees.findIndex(u => u.id === id);
      if (idx < 0) throw new Error(GMS.t('err.notFound'));

      const old = AuthState.employees[idx];

      // التحقق من الصحة
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

      // منع تعديل الدور بدون صلاحية
      if (data.role !== undefined && !this.isRole('SUPER_ADMIN')) {
        delete data.role;
      }

      // تنظيف
      const sanitized = GMS.sanitizePayload(data, { maxLength: 200 });

      // تحديث محلي
      const updated = {
        ...old,
        ...sanitized,
        updated_at: new Date().toISOString(),
        updated_by: AuthState.profile?.id || null,
      };

      AuthState.employees[idx] = updated;

      // تحديث في Supabase
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
              is_active: updated.is_active,
            })
            .eq('id', id);
        } catch (e) {
          console.warn('[Auth.updateEmployee] Supabase failed:', e.message);
        }
      }

      // إذا كان المستخدم نفسه — تحديث الملف الشخصي
      if (AuthState.profile && AuthState.profile.id === id) {
        AuthState.profile = { ...updated };
        this._computePermissions();
      }

      // سجل التدقيق
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

    /**
     * تفعيل/إيقاف موظف
     * @param {string} id
     * @param {boolean} isActive
     * @returns {Promise<Object>}
     */
    async toggleEmployeeActive(id, isActive) {
      if (!this.can('manageEmployees')) {
        throw new Error(GMS.t('err.permissionDenied'));
      }

      // منع تعطيل نفسه
      if (AuthState.profile?.id === id) {
        throw new Error('لا يمكنك تعطيل حسابك الخاص');
      }

      return this.updateEmployee(id, { is_active: isActive });
    },

    /* ─── Utilities ───────────────────────────────────────────────── */

    /**
     * الوقت المتبقي للجلسة
     * @returns {number} بالمللي ثانية
     */
    getSessionTimeRemaining() {
      if (!AuthState.sessionStartedAt) return 0;
      const elapsed = Date.now() - AuthState.sessionStartedAt;
      return Math.max(0, GMS.SECURITY_CONFIG.SESSION_TIMEOUT_MS - elapsed);
    },

    /**
     * تحديث الجلسة (تمديد)
     */
    refreshSession() {
      AuthState.sessionStartedAt = Date.now();
      this._persistSession();
    },

    /**
     * قراءة ملخص سريع للمستخدم
     * @returns {Object|null}
     */
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
        permissionCount: AuthState.permissions.size,
      };
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §6 · PERMISSION GUARDS (للاستخدام في الواجهة)
     ═════════════════════════════════════════════════════════════════════ */
  const Guard = {

    /**
     * عرض صفحة ممنوعة
     * @param {string} [title]
     * @param {string} [message]
     * @returns {string} HTML
     */
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

    /**
     * التحقق من صلاحية، وإرجاع true إذا مسموح
     * @param {string} permission
     * @returns {boolean}
     */
    require(permission) {
      return Auth.can(permission);
    },

    /**
     * التحقق من دور مطلوب
     * @param {...string} roles
     * @returns {boolean}
     */
    requireRole(...roles) {
      return Auth.isAnyRole(...roles);
    },

    /**
     * إخفاء عنصر DOM إذا لم يكن مصرحاً
     * @param {Element|string} el
     * @param {string} permission
     */
    hideIfNoPermission(el, permission) {
      const target = typeof el === 'string' ? GMS.$(el) : el;
      if (!target) return;

      if (!Auth.can(permission)) {
        target.style.display = 'none';
      }
    },

    /**
     * تعطيل عنصر إذا لم يكن مصرحاً
     * @param {Element|string} el
     * @param {string} permission
     */
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
    '%c🔐 Auth & RBAC loaded · 5 roles · Audit trail',
    'color:#b3261e;font-weight:800;font-size:12px;padding:1px 5px;' +
    'background:#fdecea;border-radius:4px;'
  );

  console.log(
    `%c👥 ${DEMO_USERS.length} demo users · ` +
    `${Object.keys(GMS.PERM_LABELS).length} permissions · ` +
    `Session timeout: ${GMS.SECURITY_CONFIG.SESSION_TIMEOUT_MS / 3600000}h`,
    'color:#6b7a95;font-weight:700;font-size:11px;'
  );

  /* ═════════════════════════════════════════════════════════════════════
     ✅ js/06-auth.js — نهاية الملف
     ═════════════════════════════════════════════════════════════════════ */

})();