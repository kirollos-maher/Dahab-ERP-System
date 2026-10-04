/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ERP — js/00-saas-owner.js
   Owner Panel — المنطق الكامل لمالك النظام (SaaS Owner)
   ─────────────────────────────────────────────────────────────────────
   يعمل هذا الملف فقط داخل owner.html ولا يُحمَّل في index.html

   الوظائف:
     • تسجيل دخول المالك + حفظ الجلسة
     • لوحة تحكم بإحصائيات كل الأنشطة
     • إدارة الأنشطة (Create / Edit / Delete)
     • إدارة المستخدمين لكل نشاط
     • توليد رموز التحقق
     • إدارة الاشتراكات (تمديد/إيقاف/تعليق)
     • تسجيل المدفوعات
     • سجل الحركات (Audit Log)
     • الإعدادات العامة
     • 🆕 إعدادات Supabase قبل تسجيل الدخول (Chicken-and-egg fix)
     • 🆕 Guard ضد الربط المزدوج لـ SBConfig
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ═════════════════════════════════════════════════════════════════════
     §1 · CONSTANTS
     ═════════════════════════════════════════════════════════════════════ */
  const SESSION_KEY = 'gms.saas.owner.session';
  const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 ساعات

  const SUBSCRIPTION_PLANS = Object.freeze({
    monthly:   { days: 30,  label: 'شهري',     icon: 'calendar' },
    quarterly: { days: 90,  label: 'ربع سنوي', icon: 'calendar-days' },
    yearly:    { days: 365, label: 'سنوي',     icon: 'calendar-check' },
    custom:    { days: 0,   label: 'مخصص',     icon: 'sliders-horizontal' },
  });

  const ROLE_LABELS = Object.freeze({
    SUPER_ADMIN:    { label: 'مدير عام',      color: 'primary' },
    BRANCH_MANAGER: { label: 'مدير فرع',      color: 'violet' },
    ACCOUNTANT:     { label: 'محاسب',         color: 'info' },
    DATA_ENTRY:     { label: 'مدخل بيانات',   color: 'teal' },
    SALESPERSON:    { label: 'بائع',          color: 'success' },
    B2B_REP:        { label: 'بياع جملة',     color: 'violet' },
  });

  const STATUS_META = Object.freeze({
    ACTIVE:    { pill: 'pill-green',  label: 'نشط',           icon: 'check-circle-2' },
    SOON:      { pill: 'pill-amber',  label: 'ينتهي قريباً',  icon: 'clock' },
    EXPIRED:   { pill: 'pill-red',    label: 'منتهي',          icon: 'alert-circle' },
    SUSPENDED: { pill: 'pill-red',    label: 'موقوف',          icon: 'pause-circle' },
    INACTIVE:  { pill: 'pill-gray',   label: 'معطَّل',         icon: 'ban' },
  });

  /* ═════════════════════════════════════════════════════════════════════
     §2 · STATE
     ═════════════════════════════════════════════════════════════════════ */
  const State = {
    owner: null,           // { id, username, full_name }
    businesses: [],
    payments: [],
    auditLogs: [],
    activeTab: 'dashboard',
    currentModal: null,
    supabaseClient: null,
    initialized: false,
    loading: false,
  };

  /* ═════════════════════════════════════════════════════════════════════
     §3 · DOM HELPERS
     ═════════════════════════════════════════════════════════════════════ */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function createEl(tag, attrs, children) {
    const el = document.createElement(tag);
    if (attrs) {
      Object.entries(attrs).forEach(([k, v]) => {
        if (v == null || v === false) return;
        if (k === 'class') el.className = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k === 'dataset' && typeof v === 'object') Object.assign(el.dataset, v);
        else if (k.startsWith('on') && typeof v === 'function') {
          el.addEventListener(k.slice(2).toLowerCase(), v);
        } else {
          el.setAttribute(k, v);
        }
      });
    }
    if (children != null) {
      const list = Array.isArray(children) ? children : [children];
      list.forEach(c => {
        if (c == null) return;
        if (typeof c === 'string' || typeof c === 'number') {
          el.appendChild(document.createTextNode(String(c)));
        } else if (c instanceof Node) {
          el.appendChild(c);
        }
      });
    }
    return el;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §4 · FORMAT HELPERS
     ═════════════════════════════════════════════════════════════════════ */
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function moneyFmt(v, decimals) {
    const n = Number(v) || 0;
    return n.toLocaleString('en-EG', {
      minimumFractionDigits: decimals == null ? 2 : decimals,
      maximumFractionDigits: decimals == null ? 2 : decimals,
    });
  }

  function intFmt(v) {
    return Math.round(Number(v) || 0).toLocaleString('en-EG');
  }

  function dateAr(d) {
    if (!d) return '—';
    const dt = d instanceof Date ? d : new Date(d);
    if (isNaN(dt.getTime())) return '—';
    return dt.toLocaleDateString('ar-EG', {
      year: 'numeric', month: '2-digit', day: '2-digit',
    });
  }

  function dateTimeAr(d) {
    if (!d) return '—';
    const dt = d instanceof Date ? d : new Date(d);
    if (isNaN(dt.getTime())) return '—';
    return dt.toLocaleString('ar-EG', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  }

  function timeAgo(d) {
    if (!d) return '—';
    const dt = d instanceof Date ? d : new Date(d);
    if (isNaN(dt.getTime())) return '—';
    const diff = Date.now() - dt.getTime();
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return 'الآن';
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min} دقيقة`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr} ساعة`;
    const day = Math.floor(hr / 24);
    if (day < 30) return `${day} يوم`;
    const mon = Math.floor(day / 30);
    if (mon < 12) return `${mon} شهر`;
    return `${Math.floor(mon / 12)} سنة`;
  }

  function daysBetween(a, b) {
    const d1 = a instanceof Date ? a : new Date(a);
    const d2 = b instanceof Date ? b : new Date(b);
    if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 0;
    return Math.floor((d2.getTime() - d1.getTime()) / 86400000);
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function addDaysISO(iso, days) {
    const d = new Date(iso);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function pct(v, total) {
    if (!total) return 0;
    return Math.round((v / total) * 100);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §5 · TOAST SYSTEM
     ═════════════════════════════════════════════════════════════════════ */
  const Toast = {
    show(opts) {
      const { title, desc, type = 'info', ms = 3500 } = opts || {};
      const host = document.getElementById('toasts');
      if (!host) return;

      const el = createEl('div', { class: `toast ${type}` });
      el.innerHTML = `
        <div class="toast-title">${esc(title || '')}</div>
        ${desc ? `<div class="toast-desc">${esc(desc)}</div>` : ''}
      `;
      host.appendChild(el);

      setTimeout(() => {
        el.style.transition = 'opacity .25s, transform .25s';
        el.style.opacity = '0';
        el.style.transform = 'translateX(-20px)';
        setTimeout(() => el.remove(), 300);
      }, ms);
    },
    ok(title, desc) { return this.show({ title, desc, type: 'ok' }); },
    err(title, desc) { return this.show({ title, desc, type: 'err', ms: 5000 }); },
    warn(title, desc) { return this.show({ title, desc, type: 'warn', ms: 4500 }); },
    info(title, desc) { return this.show({ title, desc, type: 'info' }); },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §6 · MODAL SYSTEM
     ═════════════════════════════════════════════════════════════════════ */
  const Modal = {
    show(opts) {
      const {
        title = '',
        icon = 'info',
        body = '',
        footer = '',
        wide = false,
        closable = true,
        onMount = null,
        onClose = null,
      } = opts || {};

      const host = document.getElementById('owner-modal-root');
      if (!host) {
        console.warn('[OwnerModal] No #owner-modal-root');
        return null;
      }

      const overlay = createEl('div', { class: 'overlay' });
      overlay.innerHTML = `
        <div class="owner-modal ${wide ? 'wide' : ''}">
          <div class="owner-modal-head">
            <h3>
              <i data-lucide="${esc(icon)}"></i>
              <span>${esc(title)}</span>
            </h3>
            ${closable ? `
              <button class="icon-btn" data-modal-close type="button" aria-label="إغلاق">
                <i data-lucide="x"></i>
              </button>
            ` : ''}
          </div>
          <div class="owner-modal-body">${body}</div>
          ${footer ? `<div class="owner-modal-foot">${footer}</div>` : ''}
        </div>
      `;

      host.appendChild(overlay);
      window.lucide?.createIcons();

      const modalEl = overlay.querySelector('.owner-modal');

      const close = () => {
        overlay.style.opacity = '0';
        setTimeout(() => {
          overlay.remove();
          if (typeof onClose === 'function') {
            try { onClose(); } catch (e) { console.error('[OwnerModal.onClose]', e); }
          }
        }, 160);
      };

      // زر الإغلاق
      const closeBtn = overlay.querySelector('[data-modal-close]');
      if (closeBtn) closeBtn.onclick = close;

      // النقر على الخلفية
      if (closable) {
        overlay.addEventListener('mousedown', (e) => {
          if (e.target === overlay) close();
        });
      }

      // Escape
      const escHandler = (e) => {
        if (e.key === 'Escape' && closable) {
          close();
          document.removeEventListener('keydown', escHandler);
        }
      };
      document.addEventListener('keydown', escHandler);

      // Mount
      if (typeof onMount === 'function') {
        try { onMount(modalEl, close, overlay); }
        catch (e) { console.error('[OwnerModal.onMount]', e); }
      }

      State.currentModal = { overlay, modalEl, close };
      return { overlay, modalEl, close };
    },

    closeAll() {
      const host = document.getElementById('owner-modal-root');
      if (!host) return;
      Array.from(host.querySelectorAll('.overlay')).forEach(o => o.remove());
      State.currentModal = null;
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §7 · 🆕 SUPABASE CONFIG — داخل شاشة الدخول
     ─────────────────────────────────────────────────────────────────────
     يسمح بإدخال بيانات Supabase قبل تسجيل الدخول
     (حل مشكلة chicken-and-egg)
     ═════════════════════════════════════════════════════════════════════ */

  const SBConfig = {
    URL_KEY: 'gms.supabase.config.url',
    KEY_KEY: 'gms.supabase.config.key',

    get url() {
      try { return localStorage.getItem(this.URL_KEY) || ''; }
      catch (_) { return ''; }
    },

    get key() {
      try { return localStorage.getItem(this.KEY_KEY) || ''; }
      catch (_) { return ''; }
    },

    get isConfigured() {
      return Boolean(this.url && this.key);
    },

    save(url, key) {
      try {
        localStorage.setItem(this.URL_KEY, String(url || '').trim());
        localStorage.setItem(this.KEY_KEY, String(key || '').trim());
        return true;
      } catch (e) {
        console.warn('[SBConfig.save]', e);
        return false;
      }
    },

    clear() {
      try {
        localStorage.removeItem(this.URL_KEY);
        localStorage.removeItem(this.KEY_KEY);
        return true;
      } catch (_) { return false; }
    },
  };

  function bindSupabaseConfig() {
    /* 🛡️ Guard: امنع الربط المزدوج */
    if (window._gms_owner_sbconfig_bound) {
      console.log('[SBConfig] Already bound — skip');
      return;
    }

    const toggle   = document.getElementById('sb-config-toggle');
    const panel    = document.getElementById('sb-config-panel');
    const urlInput = document.getElementById('sb-config-url');
    const keyInput = document.getElementById('sb-config-key');
    const keyTgl   = document.getElementById('sb-config-key-toggle');
    const saveBtn  = document.getElementById('sb-config-save');
    const testBtn  = document.getElementById('sb-config-test');
    const clearBtn = document.getElementById('sb-config-clear');
    const errEl    = document.getElementById('sb-config-error');
    const statusDt = document.getElementById('sb-status-dot');

    if (!urlInput || !keyInput) {
      console.warn('[SBConfig] Login screen elements not found');
      return;
    }

    /* ✅ علّم كـ مُربّط بعد التأكد من وجود العناصر */
    window._gms_owner_sbconfig_bound = true;

    /* ─── تحميل القيم الحالية ─── */
    urlInput.value = SBConfig.url;
    keyInput.value = SBConfig.key;

    const updateStatus = () => {
      if (!statusDt) return;
      statusDt.classList.toggle('connected', SBConfig.isConfigured);
      statusDt.title = SBConfig.isConfigured
        ? 'متصل بـ Supabase'
        : 'لم يتم الإعداد بعد';
    };
    updateStatus();

    /* ─── Toggle Panel ─── */
    if (toggle && panel) {
      toggle.onclick = () => {
        const isHidden = panel.classList.contains('hidden');

        if (isHidden && !SBConfig.isConfigured) {
          /* أول مرة — افتح تلقائياً */
          panel.classList.remove('hidden');
        } else {
          panel.classList.toggle('hidden');
        }
        window.lucide?.createIcons();
      };

      /* افتح تلقائياً لو مش مُهيّأ */
      if (!SBConfig.isConfigured) {
        panel.classList.remove('hidden');
      }
    }

    /* ─── Show/Hide Key ─── */
    if (keyTgl) {
      keyTgl.onclick = () => {
        const isText = keyInput.type === 'text';
        keyInput.type = isText ? 'password' : 'text';
        keyTgl.innerHTML = isText
          ? '<i data-lucide="eye"></i>'
          : '<i data-lucide="eye-off"></i>';
        window.lucide?.createIcons();
      };
    }

    /* ─── Helpers ─── */
    function showErr(msg) {
      if (!errEl) return;
      errEl.textContent = msg;
      errEl.classList.remove('hidden');
      try {
        errEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } catch (_) {}
    }

    function clearErr() {
      if (errEl) errEl.classList.add('hidden');
    }

    function setBusy(btn, busy, txt) {
      if (!btn) return;
      if (busy) {
        btn.dataset._orig = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `<i data-lucide="loader-circle"></i> ${txt || 'جارٍ…'}`;
        window.lucide?.createIcons();
      } else {
        btn.disabled = false;
        if (btn.dataset._orig) btn.innerHTML = btn.dataset._orig;
        window.lucide?.createIcons();
      }
    }

    /* ─── SAVE ─── */
    if (saveBtn) {
      saveBtn.onclick = () => {
        clearErr();

        const url = urlInput.value.trim();
        const key = keyInput.value.trim();

        if (!url) return showErr('Project URL مطلوب');
        if (!key) return showErr('Anon Key مطلوب');

        if (!/^https?:\/\/.+/i.test(url)) {
          return showErr('URL غير صحيح — يجب أن يبدأ بـ https://');
        }

        if (key.length < 20) {
          return showErr('المفتاح يبدو غير صحيح (قصير جداً)');
        }

        if (!SBConfig.save(url, key)) {
          return showErr('فشل الحفظ في LocalStorage');
        }

        updateStatus();
        Toast.ok('✅ تم الحفظ', 'جارٍ إعادة التحميل…');

        setTimeout(() => {
          window.GMS = window.GMS || {};
          window.GMS._intentionalReload = true;
          location.reload();
        }, 800);
      };
    }

    /* ─── TEST ─── */
    if (testBtn) {
      testBtn.onclick = async () => {
        clearErr();

        const url = urlInput.value.trim();
        const key = keyInput.value.trim();

        if (!url || !key) return showErr('أدخل URL و Anon Key أولاً');

        if (!window.supabase) {
          return showErr('مكتبة Supabase غير محمَّلة — أعد تحميل الصفحة');
        }

        setBusy(testBtn, true, 'جارٍ الاختبار…');

        try {
          const testClient = window.supabase.createClient(url, key, {
            auth: { persistSession: false, autoRefreshToken: false },
          });

          /* اختبار الجدول الرئيسي */
          const { error } = await testClient
            .from('saas_owners')
            .select('id', { count: 'exact', head: true })
            .limit(1);

          if (error) {
            /* جرّب جدول بديل */
            const { error: err2 } = await testClient
              .from('businesses')
              .select('id', { count: 'exact', head: true })
              .limit(1);

            if (err2) throw new Error(err2.message);
          }

          Toast.ok('✅ الاتصال ناجح', 'تم الوصول لقاعدة البيانات');

          /* علّم كمُهيّأ */
          if (statusDt) statusDt.classList.add('connected');

        } catch (e) {
          console.error('[SBConfig.test]', e);
          showErr(`فشل الاتصال: ${e.message}`);
        } finally {
          setBusy(testBtn, false);
        }
      };
    }

    /* ─── CLEAR ─── */
    if (clearBtn) {
      clearBtn.onclick = () => {
        if (!confirm('⚠️ سيتم حذف إعدادات Supabase من هذا الجهاز.\n\nمتابعة؟')) return;

        SBConfig.clear();
        urlInput.value = '';
        keyInput.value = '';
        clearErr();
        updateStatus();

        Toast.warn('تم حذف الإعدادات', 'جارٍ إعادة التحميل…');

        setTimeout(() => {
          window.GMS = window.GMS || {};
          window.GMS._intentionalReload = true;
          location.reload();
        }, 800);
      };
    }

    /* ─── Enter key: Focus flow ─── */
    urlInput.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        keyInput.focus();
      }
    };

    keyInput.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (saveBtn) saveBtn.click();
      }
    };

    console.log('[SBConfig] ✅ Bound — Configured:', SBConfig.isConfigured);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §8 · SUPABASE CLIENT
     ═════════════════════════════════════════════════════════════════════ */
  function getSb() {
    if (State.supabaseClient) return State.supabaseClient;

    if (!window.supabase) {
      console.error('[Owner] Supabase library not loaded');
      return null;
    }

    /* ✅ نستخدم SBConfig كمصدر موحّد */
    const url = SBConfig.url;
    const key = SBConfig.key;

    if (!url || !key) {
      console.warn('[Owner] Supabase credentials not configured');
      return null;
    }

    try {
      State.supabaseClient = window.supabase.createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
        realtime: { params: { eventsPerSecond: 10 } },
      });
      return State.supabaseClient;
    } catch (e) {
      console.error('[Owner] Supabase client init failed:', e);
      return null;
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §9 · CODE GENERATORS
     ═════════════════════════════════════════════════════════════════════ */
  function genCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const arr = new Uint8Array(6);
    crypto.getRandomValues(arr);
    let s = '';
    for (let i = 0; i < 6; i++) {
      s += chars[arr[i] % chars.length];
    }
    return `GLD-${s}`;
  }

  function genVCode() {
    const arr = new Uint8Array(4);
    crypto.getRandomValues(arr);
    const num = ((arr[0] << 24) | (arr[1] << 16) | (arr[2] << 8) | arr[3]) >>> 0;
    return String(num).padStart(10, '0').slice(0, 6);
  }

  function generatePassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#';
    const arr = new Uint8Array(12);
    crypto.getRandomValues(arr);
    return Array.from(arr, b => chars[b % chars.length]).join('');
  }

  /* ═════════════════════════════════════════════════════════════════════
     §10 · AUTH
     ═════════════════════════════════════════════════════════════════════ */
  async function loginOwner(username, password) {
    const client = getSb();
    if (!client) throw new Error('لا يوجد اتصال بـ Supabase — أضف الإعدادات أولاً');

    const { data: rows, error } = await client
      .from('saas_owners')
      .select('id, username, full_name, password_hash, is_active, locked_until, failed_attempts')
      .eq('username', String(username).trim())
      .limit(1);

    if (error) throw error;
    if (!rows || !rows.length) throw new Error('بيانات الدخول غير صحيحة');

    const owner = rows[0];
    if (!owner.is_active) throw new Error('الحساب موقوف');

    if (owner.locked_until && new Date(owner.locked_until) > new Date()) {
      throw new Error('الحساب مقفل مؤقتاً — حاول بعد قليل');
    }

    if (!window.bcrypt) throw new Error('مكتبة التحقق غير محمَّلة');

    const ok = window.bcrypt.compareSync(password, owner.password_hash);

    if (!ok) {
      await client
        .from('saas_owners')
        .update({
          failed_attempts: (owner.failed_attempts || 0) + 1,
          locked_until: (owner.failed_attempts || 0) + 1 >= 5
            ? new Date(Date.now() + 15 * 60 * 1000).toISOString()
            : null,
        })
        .eq('id', owner.id);
      throw new Error('بيانات الدخول غير صحيحة');
    }

    await client
      .from('saas_owners')
      .update({
        last_login: new Date().toISOString(),
        failed_attempts: 0,
        locked_until: null,
      })
      .eq('id', owner.id);

    const session = {
      session_type: 'saas_owner',
      owner: {
        id: owner.id,
        username: owner.username,
        full_name: owner.full_name,
      },
      startedAt: Date.now(),
      expiresAt: Date.now() + SESSION_TTL_MS,
    };

    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch (_) {}

    State.owner = session.owner;
    return session;
  }

  function restoreOwnerSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;

      const s = JSON.parse(raw);
      if (!s || !s.owner) return null;

      if (s.expiresAt && Date.now() > s.expiresAt) {
        localStorage.removeItem(SESSION_KEY);
        return null;
      }

      State.owner = s.owner;
      return s;
    } catch (e) {
      console.warn('[Owner.restore]', e);
      return null;
    }
  }

  function logoutOwner() {
    try { localStorage.removeItem(SESSION_KEY); } catch (_) {}
    State.owner = null;
    location.reload();
  }

  /* ═════════════════════════════════════════════════════════════════════
     §11 · DATA LOADERS
     ═════════════════════════════════════════════════════════════════════ */
  async function loadBusinesses() {
    const client = getSb();
    if (!client) return [];

    const { data, error } = await client
      .from('businesses')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Owner.loadBusinesses]', error);
      return [];
    }

    State.businesses = data || [];
    return State.businesses;
  }

  async function loadPayments() {
    const client = getSb();
    if (!client) return [];

    const { data, error } = await client
      .from('subscription_payments')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) {
      console.error('[Owner.loadPayments]', error);
      return [];
    }

    State.payments = data || [];
    return State.payments;
  }

  async function loadBusinessUsers(businessId) {
    const client = getSb();
    if (!client) return [];

    const { data, error } = await client
      .from('business_users')
      .select('id, username, full_name, role, is_owner, is_active, last_login, phone, email, created_at')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Owner.loadBusinessUsers]', error);
      return [];
    }

    return data || [];
  }

  async function loadAuditLogs(limit) {
    const client = getSb();
    if (!client) return [];

    const { data, error } = await client
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit || 200);

    if (error) {
      console.error('[Owner.loadAuditLogs]', error);
      return [];
    }

    State.auditLogs = data || [];
    return State.auditLogs;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §12 · RENDER HELPERS
     ═════════════════════════════════════════════════════════════════════ */
  function getBusinessStatus(b) {
    if (b.is_suspended) return 'SUSPENDED';
    if (!b.is_active) return 'INACTIVE';

    const end = new Date(b.subscription_end);
    const now = new Date();
    const daysLeft = daysBetween(now, end);

    if (daysLeft < 0) return 'EXPIRED';
    if (daysLeft <= 7) return 'SOON';
    return 'ACTIVE';
  }

  function getDaysLeft(b) {
    return daysBetween(new Date(), new Date(b.subscription_end));
  }

  function getStatusBadgeHTML(status) {
    const meta = STATUS_META[status] || STATUS_META.INACTIVE;
    return `<span class="pill ${meta.pill}">
      <i data-lucide="${meta.icon}"></i>
      ${esc(meta.label)}
    </span>`;
  }

  function getRoleBadgeHTML(role) {
    const meta = ROLE_LABELS[role] || { label: role, color: 'info' };
    return `<span class="pill pill-${meta.color}">${esc(meta.label)}</span>`;
  }

  function getDaysLeftColor(days) {
    if (days < 0) return 'var(--danger)';
    if (days <= 7) return 'var(--warn)';
    return 'var(--success)';
  }

  /* ═════════════════════════════════════════════════════════════════════
     §13 · RENDER — DASHBOARD
     ═════════════════════════════════════════════════════════════════════ */
  function renderDashboard() {
    const now = new Date();
    const soon = new Date(Date.now() + 7 * 86400000);

    const total = State.businesses.length;
    const active = State.businesses.filter(b =>
      b.is_active && !b.is_suspended &&
      new Date(b.subscription_end) > now
    ).length;
    const expiringSoon = State.businesses.filter(b => {
      if (!b.is_active || b.is_suspended) return false;
      const end = new Date(b.subscription_end);
      return end > now && end <= soon;
    }).length;
    const expired = State.businesses.filter(b =>
      new Date(b.subscription_end) < now
    ).length;
    const suspended = State.businesses.filter(b => b.is_suspended).length;

    // إيرادات الشهر الحالي
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonthRevenue = State.payments
      .filter(p => new Date(p.created_at) >= thisMonthStart)
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    // إجمالي الإيرادات
    const totalRevenue = State.payments
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    return `
      <h2 style="font-size:22px;font-weight:900;margin:0 0 20px;display:flex;align-items:center;gap:10px">
        <i data-lucide="layout-dashboard" style="color:var(--primary)"></i>
        لوحة التحكم
      </h2>

      <div class="kpi-row">
        <div class="kpi">
          <div class="kpi-label">
            <i data-lucide="building-2"></i> إجمالي الأنشطة
          </div>
          <div class="kpi-value">${intFmt(total)}</div>
          <div class="kpi-meta">${intFmt(active)} نشط حالياً</div>
        </div>

        <div class="kpi green">
          <div class="kpi-label">
            <i data-lucide="check-circle-2"></i> أنشطة نشطة
          </div>
          <div class="kpi-value" style="color:var(--success)">${intFmt(active)}</div>
          <div class="kpi-meta">
            نسبة النشاط: ${pct(active, total)}%
          </div>
        </div>

        <div class="kpi">
          <div class="kpi-label">
            <i data-lucide="clock"></i> تنتهي خلال 7 أيام
          </div>
          <div class="kpi-value" style="color:var(--warn)">${intFmt(expiringSoon)}</div>
          <div class="kpi-meta">تحتاج متابعة للتجديد</div>
        </div>

        <div class="kpi red">
          <div class="kpi-label">
            <i data-lucide="alert-circle"></i> منتهية
          </div>
          <div class="kpi-value" style="color:var(--danger)">${intFmt(expired)}</div>
          <div class="kpi-meta">بانتظار تجديد الاشتراك</div>
        </div>

        <div class="kpi red">
          <div class="kpi-label">
            <i data-lucide="pause-circle"></i> موقوفة
          </div>
          <div class="kpi-value" style="color:var(--danger)">${intFmt(suspended)}</div>
          <div class="kpi-meta">معلّقة مؤقتاً</div>
        </div>

        <div class="kpi blue">
          <div class="kpi-label">
            <i data-lucide="banknote"></i> إيرادات هذا الشهر
          </div>
          <div class="kpi-value" style="color:var(--info);font-size:20px">
            ${moneyFmt(thisMonthRevenue)}
          </div>
          <div class="kpi-meta">
            إجمالي: <b>${moneyFmt(totalRevenue)}</b> ج.م
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <h3><i data-lucide="zap"></i> إجراءات سريعة</h3>
        </div>
        <div class="card-body">
          <div style="display:flex;flex-wrap:wrap;gap:10px">
            <button class="btn btn-primary" onclick="OwnerPanel.openCreateBusiness()">
              <i data-lucide="plus-circle"></i> إنشاء نشاط جديد
            </button>
            <button class="btn" onclick="OwnerPanel.switchTab('businesses')">
              <i data-lucide="building-2"></i> عرض كل الأنشطة
            </button>
            <button class="btn" onclick="OwnerPanel.switchTab('payments')">
              <i data-lucide="banknote"></i> سجل المدفوعات
            </button>
            <button class="btn" onclick="OwnerPanel.refreshAll()">
              <i data-lucide="refresh-cw"></i> تحديث البيانات
            </button>
          </div>
        </div>
      </div>

      ${expiringSoon > 0 ? `
        <div class="card">
          <div class="card-head">
            <h3><i data-lucide="alert-triangle" style="color:var(--warn)"></i>
              اشتراكات تحتاج متابعة (${expiringSoon})</h3>
          </div>
          <div class="card-body" style="padding:0">
            ${State.businesses
              .filter(b => {
                if (!b.is_active || b.is_suspended) return false;
                const end = new Date(b.subscription_end);
                return end > now && end <= soon;
              })
              .map(b => `
                <div style="padding:12px 18px;border-bottom:1px solid var(--border);
                            display:flex;align-items:center;gap:12px">
                  <div style="width:40px;height:40px;border-radius:10px;
                              background:var(--warn-bg);color:var(--warn);
                              display:grid;place-items:center;flex-shrink:0">
                    <i data-lucide="clock" style="width:18px;height:18px"></i>
                  </div>
                  <div style="flex:1;min-width:0">
                    <div style="font-weight:800;font-size:13px">${esc(b.name)}</div>
                    <div style="font-size:11px;color:var(--muted);font-weight:700;margin-top:2px">
                      <span class="mono">${esc(b.code)}</span> ·
                      ينتهي بعد <b style="color:var(--warn)">${getDaysLeft(b)} يوم</b>
                    </div>
                  </div>
                  <button class="btn btn-sm btn-primary"
                          onclick="OwnerPanel.openSubscription('${esc(b.id)}')">
                    <i data-lucide="credit-card"></i> تجديد
                  </button>
                </div>
              `).join('')}
          </div>
        </div>
      ` : ''}
    `;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §14 · RENDER — BUSINESSES
     ═════════════════════════════════════════════════════════════════════ */
  function renderBusinessRow(b) {
    const status = getBusinessStatus(b);
    const daysLeft = getDaysLeft(b);
    const daysColor = getDaysLeftColor(daysLeft);

    return `
      <tr data-business-id="${esc(b.id)}">
        <td>
          <span class="code-chip" style="font-size:12px">
            ${esc(b.code)}
          </span>
        </td>
        <td>
          <div style="font-weight:800;font-size:13px">${esc(b.name)}</div>
          ${b.address ? `
            <div style="font-size:10.5px;color:var(--muted);
                        font-weight:600;margin-top:2px">
              ${esc(b.address)}
            </div>
          ` : ''}
        </td>
        <td class="mono" style="font-size:11.5px">
          ${esc(b.phone || '—')}
        </td>
        <td style="font-size:11.5px;font-weight:700">
          ${esc(SUBSCRIPTION_PLANS[b.subscription_type]?.label || b.subscription_type || '—')}
        </td>
        <td class="mono" style="font-size:11.5px">
          ${dateAr(b.subscription_end)}
        </td>
        <td class="col-c"
            style="color:${daysColor};font-weight:900;
                   font-family:var(--font-mono);font-size:13px">
          ${daysLeft >= 0 ? daysLeft + ' يوم' : 'منتهي'}
        </td>
        <td class="col-c">
          ${getStatusBadgeHTML(status)}
        </td>
        <td class="col-c">
          <div style="display:flex;gap:4px;justify-content:center;flex-wrap:wrap">
            <button class="icon-btn" title="المستخدمون"
                    onclick="OwnerPanel.openUsers('${esc(b.id)}')"
                    type="button">
              <i data-lucide="users"></i>
            </button>
            <button class="icon-btn" title="رمز تحقق"
                    onclick="OwnerPanel.openVerificationCode('${esc(b.id)}')"
                    type="button">
              <i data-lucide="key"></i>
            </button>
            <button class="icon-btn" title="الاشتراك"
                    onclick="OwnerPanel.openSubscription('${esc(b.id)}')"
                    type="button">
              <i data-lucide="credit-card"></i>
            </button>
            <button class="icon-btn" title="تعديل"
                    onclick="OwnerPanel.openEditBusiness('${esc(b.id)}')"
                    type="button">
              <i data-lucide="pencil"></i>
            </button>
            <button class="icon-btn" title="حذف"
                    onclick="OwnerPanel.deleteBusiness('${esc(b.id)}')"
                    style="color:var(--danger)"
                    type="button">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }

  function renderBusinesses() {
    return `
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px;
                  flex-wrap:wrap">
        <h2 style="font-size:22px;font-weight:900;margin:0;display:flex;
                   align-items:center;gap:10px">
          <i data-lucide="building-2" style="color:var(--primary)"></i>
          الأنشطة التجارية
        </h2>
        <span class="pill pill-blue" style="font-size:11px">
          ${intFmt(State.businesses.length)} نشاط
        </span>
        <div class="spacer" style="flex:1"></div>
        <button class="btn btn-primary" onclick="OwnerPanel.openCreateBusiness()"
                type="button">
          <i data-lucide="plus-circle"></i> نشاط جديد
        </button>
        <button class="btn" onclick="OwnerPanel.refreshAll()" type="button">
          <i data-lucide="refresh-cw"></i>
        </button>
      </div>

      <div class="card">
        ${State.businesses.length === 0 ? `
          <div class="empty" style="padding:80px 20px">
            <i data-lucide="inbox"></i>
            <div style="font-weight:800;font-size:15px;margin-top:8px">
              لا توجد أنشطة بعد
            </div>
            <div style="font-size:12px;color:var(--muted);margin-top:6px">
              ابدأ بإنشاء أول نشاط تجاري
            </div>
            <div style="margin-top:18px">
              <button class="btn btn-primary"
                      onclick="OwnerPanel.openCreateBusiness()" type="button">
                <i data-lucide="plus-circle"></i> إنشاء نشاط
              </button>
            </div>
          </div>
        ` : `
          <div style="overflow-x:auto">
            <table class="tbl">
              <thead>
                <tr>
                  <th style="width:130px">الكود</th>
                  <th>الاسم</th>
                  <th style="width:130px">الهاتف</th>
                  <th style="width:110px">الاشتراك</th>
                  <th style="width:120px">تاريخ الانتهاء</th>
                  <th class="col-c" style="width:100px">المتبقي</th>
                  <th class="col-c" style="width:130px">الحالة</th>
                  <th class="col-c" style="width:220px">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                ${State.businesses.map(renderBusinessRow).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>
    `;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §15 · RENDER — PAYMENTS
     ═════════════════════════════════════════════════════════════════════ */
  function renderPayments() {
    const total = State.payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);

    return `
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px;
                  flex-wrap:wrap">
        <h2 style="font-size:22px;font-weight:900;margin:0;display:flex;
                   align-items:center;gap:10px">
          <i data-lucide="banknote" style="color:var(--primary)"></i>
          سجل المدفوعات
        </h2>
        <span class="pill pill-green" style="font-size:11px">
          الإجمالي: ${moneyFmt(total)} ج.م
        </span>
        <div class="spacer" style="flex:1"></div>
        <button class="btn" onclick="OwnerPanel.refreshAll()" type="button">
          <i data-lucide="refresh-cw"></i>
        </button>
      </div>

      <div class="card">
        ${State.payments.length === 0 ? `
          <div class="empty" style="padding:80px 20px">
            <i data-lucide="receipt"></i>
            <div style="font-weight:800;font-size:15px;margin-top:8px">
              لا توجد مدفوعات مسجَّلة
            </div>
          </div>
        ` : `
          <div style="overflow-x:auto">
            <table class="tbl">
              <thead>
                <tr>
                  <th style="width:150px">التاريخ</th>
                  <th>النشاط</th>
                  <th class="col-num" style="width:130px">المبلغ</th>
                  <th style="width:110px">طريقة الدفع</th>
                  <th style="width:160px">الفترة</th>
                  <th>المرجع</th>
                </tr>
              </thead>
              <tbody>
                ${State.payments.map(p => {
                  const biz = State.businesses.find(b => b.id === p.business_id);
                  return `
                    <tr>
                      <td class="mono" style="font-size:11px">
                        ${dateTimeAr(p.created_at)}
                      </td>
                      <td style="font-weight:700;font-size:12px">
                        ${esc(biz?.name || '—')}
                        ${biz ? `<div class="mono"
                                  style="font-size:10px;color:var(--muted);
                                         font-weight:700;margin-top:2px">
                          ${esc(biz.code)}
                        </div>` : ''}
                      </td>
                      <td class="col-num"
                          style="font-weight:900;color:var(--success);
                                 font-size:14px">
                        ${moneyFmt(p.amount)}
                      </td>
                      <td style="font-size:11.5px">
                        ${esc(p.payment_method || '—')}
                      </td>
                      <td class="mono" style="font-size:10.5px">
                        ${p.period_start ? dateAr(p.period_start) : '—'}
                        ${p.period_end ? ` → ${dateAr(p.period_end)}` : ''}
                      </td>
                      <td class="mono" style="font-size:11px">
                        ${esc(p.reference_no || '—')}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>
    `;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §16 · RENDER — AUDIT
     ═════════════════════════════════════════════════════════════════════ */
  function renderAudit() {
    return `
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px;
                  flex-wrap:wrap">
        <h2 style="font-size:22px;font-weight:900;margin:0;display:flex;
                   align-items:center;gap:10px">
          <i data-lucide="scroll-text" style="color:var(--primary)"></i>
          سجل الحركات
        </h2>
        <span class="pill pill-blue" style="font-size:11px">
          ${intFmt(State.auditLogs.length)} إدخال
        </span>
        <div class="spacer" style="flex:1"></div>
        <button class="btn" onclick="OwnerPanel.refreshAudit()" type="button">
          <i data-lucide="refresh-cw"></i> تحديث
        </button>
      </div>

      <div class="card">
        ${State.auditLogs.length === 0 ? `
          <div class="empty" style="padding:80px 20px">
            <i data-lucide="inbox"></i>
            <div style="font-weight:800;font-size:15px;margin-top:8px">
              لا توجد حركات مسجَّلة
            </div>
          </div>
        ` : `
          <div style="overflow-x:auto;max-height:70vh">
            <table class="tbl">
              <thead>
                <tr>
                  <th style="width:160px">التاريخ</th>
                  <th style="width:150px">المستخدم</th>
                  <th style="width:120px">الحركة</th>
                  <th style="width:140px">النشاط</th>
                  <th>البيان</th>
                </tr>
              </thead>
              <tbody>
                ${State.auditLogs.map(log => {
                  const biz = State.businesses.find(b => b.id === log.business_id);
                  return `
                    <tr>
                      <td class="mono" style="font-size:11px">
                        ${dateTimeAr(log.created_at)}
                      </td>
                      <td style="font-size:11.5px;font-weight:700">
                        ${esc(log.user_name || log.actor_id || '—')}
                      </td>
                      <td>
                        <span class="pill pill-blue" style="font-size:10px">
                          ${esc(log.action || '—')}
                        </span>
                      </td>
                      <td class="mono" style="font-size:11px">
                        ${esc(biz?.code || '—')}
                      </td>
                      <td style="font-size:11.5px">
                        ${esc(log.description || '—')}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>
    `;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §17 · RENDER — SETTINGS
     ═════════════════════════════════════════════════════════════════════ */
  function renderSettings() {
    const url = SBConfig.url;
    const key = SBConfig.key;

    return `
      <h2 style="font-size:22px;font-weight:900;margin:0 0 20px;display:flex;
                 align-items:center;gap:10px">
        <i data-lucide="settings" style="color:var(--primary)"></i>
        الإعدادات العامة
      </h2>

      <div class="card">
        <div class="card-head">
          <h3><i data-lucide="user"></i> حساب المالك</h3>
        </div>
        <div class="card-body">
          <div class="grid-form">
            <div class="field">
              <label>Username</label>
              <input readonly value="${esc(State.owner?.username || '')}"
                     class="mono" dir="ltr">
            </div>
            <div class="field">
              <label>الاسم الكامل</label>
              <input readonly value="${esc(State.owner?.full_name || '')}">
            </div>
          </div>

          <div style="margin-top:18px;padding-top:18px;
                      border-top:1px dashed var(--border)">
            <h4 style="font-size:13px;font-weight:900;margin:0 0 12px">
              تغيير كلمة المرور
            </h4>
            <div class="grid-form">
              <div class="field">
                <label>كلمة المرور الحالية</label>
                <input type="password" id="set-current-pass"
                       class="mono" dir="ltr">
              </div>
              <div class="field">
                <label>كلمة المرور الجديدة</label>
                <input type="password" id="set-new-pass"
                       class="mono" dir="ltr">
              </div>
              <div class="field">
                <label>تأكيد كلمة المرور</label>
                <input type="password" id="set-confirm-pass"
                       class="mono" dir="ltr">
              </div>
            </div>
            <div id="set-pass-error" class="hidden"
                 style="margin-top:10px;padding:10px;
                        background:var(--danger-bg);color:var(--danger);
                        border-radius:8px;font-size:12px;font-weight:700"></div>
            <button class="btn btn-primary" id="set-save-pass"
                    style="margin-top:12px" type="button">
              <i data-lucide="key"></i> تحديث كلمة المرور
            </button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <h3><i data-lucide="database"></i> اتصال Supabase</h3>
          <div class="spacer" style="flex:1"></div>
          <span class="chip ${SBConfig.isConfigured ? 'ok' : 'err'}">
            <i data-lucide="${SBConfig.isConfigured ? 'cloud-check' : 'cloud-off'}"
               style="width:12px;height:12px"></i>
            ${SBConfig.isConfigured ? 'متصل' : 'غير مُهيّأ'}
          </span>
        </div>
        <div class="card-body">
          <div class="grid-form">
            <div class="field field-full">
              <label>Project URL</label>
              <input id="set-sb-url" value="${esc(url)}"
                     class="mono" dir="ltr"
                     placeholder="https://xxxx.supabase.co">
            </div>
            <div class="field field-full">
              <label>Anon Key</label>
              <input id="set-sb-key" value="${esc(key)}"
                     class="mono" dir="ltr"
                     placeholder="eyJhbGciOi..." style="font-size:11px">
            </div>
          </div>
          <div id="set-sb-error" class="hidden"
               style="margin-top:10px;padding:10px;
                      background:var(--danger-bg);color:var(--danger);
                      border-radius:8px;font-size:12px;font-weight:700"></div>
          <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap">
            <button class="btn btn-primary" id="set-save-sb" type="button">
              <i data-lucide="save"></i> حفظ وإعادة الاتصال
            </button>
            <button class="btn" id="set-test-sb" type="button">
              <i data-lucide="plug"></i> اختبار الاتصال
            </button>
            <button class="btn btn-danger" id="set-clear-sb" type="button">
              <i data-lucide="trash-2"></i> حذف الإعدادات
            </button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <h3><i data-lucide="info"></i> معلومات النظام</h3>
        </div>
        <div class="card-body">
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px">
            <div>
              <div style="font-size:11px;color:var(--muted);font-weight:800;text-transform:uppercase">
                عدد الأنشطة
              </div>
              <div class="mono" style="font-size:20px;font-weight:900;margin-top:4px">
                ${intFmt(State.businesses.length)}
              </div>
            </div>
            <div>
              <div style="font-size:11px;color:var(--muted);font-weight:800;text-transform:uppercase">
                عدد المدفوعات
              </div>
              <div class="mono" style="font-size:20px;font-weight:900;margin-top:4px">
                ${intFmt(State.payments.length)}
              </div>
            </div>
            <div>
              <div style="font-size:11px;color:var(--muted);font-weight:800;text-transform:uppercase">
                إصدار لوحة المالك
              </div>
              <div class="mono" style="font-size:20px;font-weight:900;margin-top:4px">
                v1.1.0
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §18 · RENDER — MAIN
     ═════════════════════════════════════════════════════════════════════ */
  function renderCurrentTab() {
    const host = document.getElementById('owner-content');
    if (!host) return;

    let html = '';
    switch (State.activeTab) {
      case 'dashboard':  html = renderDashboard();  break;
      case 'businesses': html = renderBusinesses(); break;
      case 'payments':   html = renderPayments();   break;
      case 'audit':      html = renderAudit();      break;
      case 'settings':   html = renderSettings();   break;
      default:           html = renderDashboard();
    }

    host.innerHTML = html;
    window.lucide?.createIcons();

    // bind dynamic events
    if (State.activeTab === 'settings') {
      bindSettingsEvents();
    }

    // تحديث tab النشط
    $$('.otab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.ownerTab === State.activeTab);
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §19 · COPY HELPER
     ═════════════════════════════════════════════════════════════════════ */
  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      Toast.ok('تم النسخ', text);
      return true;
    } catch (e) {
      Toast.err('فشل النسخ', e.message);
      return false;
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §20 · MODAL — CREATE BUSINESS
     ═════════════════════════════════════════════════════════════════════ */
  function openCreateBusiness() {
    const defaultCode = genCode();
    const today = todayISO();
    const monthLater = addDaysISO(today, 30);

    Modal.show({
      title: 'إنشاء نشاط جديد',
      icon: 'plus-circle',
      wide: true,
      body: `
        <h4 style="margin:0 0 12px;font-size:12px;color:var(--muted);
                   text-transform:uppercase;letter-spacing:.4px;
                   font-weight:900">
          🏢 بيانات النشاط
        </h4>
        <div class="grid-form">
          <div class="field">
            <label>الكود التعريفي *</label>
            <input id="nb-code" class="mono" value="${esc(defaultCode)}"
                   readonly
                   style="font-weight:900;color:var(--primary);
                          letter-spacing:1px;font-size:14px">
          </div>
          <div class="field">
            <label>اسم النشاط *</label>
            <input id="nb-name" placeholder="محل الذهب الفاخر"
                   autofocus>
          </div>
          <div class="field">
            <label>الهاتف</label>
            <input id="nb-phone" class="mono" dir="ltr"
                   placeholder="01xxxxxxxxx">
          </div>
          <div class="field">
            <label>البريد</label>
            <input id="nb-email" type="email" class="mono" dir="ltr">
          </div>
          <div class="field field-full">
            <label>العنوان</label>
            <input id="nb-address" placeholder="شارع، مدينة">
          </div>
          <div class="field">
            <label>الدولة</label>
            <input id="nb-country" value="EG" class="mono" dir="ltr">
          </div>
          <div class="field">
            <label>العملة</label>
            <input id="nb-currency" value="EGP" class="mono" dir="ltr">
          </div>
          <div class="field">
            <label>عيار الأساس</label>
            <select id="nb-base-karat">
              <option value="18">18K</option>
              <option value="21" selected>21K</option>
              <option value="24">24K</option>
            </select>
          </div>
          <div class="field">
            <label>أقصى عدد مستخدمين</label>
            <input id="nb-max-users" type="number" value="10" min="1">
          </div>
          <div class="field">
            <label>أقصى عدد فروع</label>
            <input id="nb-max-branches" type="number" value="3" min="1">
          </div>
        </div>

        <h4 style="margin:22px 0 12px;font-size:12px;color:var(--muted);
                   text-transform:uppercase;letter-spacing:.4px;
                   font-weight:900">
          📅 الاشتراك
        </h4>
        <div class="grid-form">
          <div class="field">
            <label>نوع الاشتراك</label>
            <select id="nb-sub-type">
              <option value="monthly">شهري (30 يوم)</option>
              <option value="quarterly">ربع سنوي (90 يوم)</option>
              <option value="yearly">سنوي (365 يوم)</option>
              <option value="custom">مخصص (أدخل التاريخ يدوياً)</option>
            </select>
          </div>
          <div class="field">
            <label>تاريخ البداية</label>
            <input id="nb-sub-start" type="date" value="${today}">
          </div>
          <div class="field">
            <label>تاريخ النهاية</label>
            <input id="nb-sub-end" type="date" value="${monthLater}">
          </div>
          <div class="field">
            <label>أيام السماح</label>
            <input id="nb-grace" type="number" value="7" min="0">
          </div>
          <div class="field">
            <label>المبلغ المدفوع (اختياري)</label>
            <input id="nb-amount" type="number" value="0"
                   step="0.01" class="mono">
          </div>
        </div>

        <h4 style="margin:22px 0 12px;font-size:12px;color:var(--muted);
                   text-transform:uppercase;letter-spacing:.4px;
                   font-weight:900">
          👤 حساب صاحب المحل (Owner)
        </h4>
        <div class="grid-form">
          <div class="field">
            <label>الاسم الكامل *</label>
            <input id="nb-owner-name" placeholder="اسم صاحب المحل">
          </div>
          <div class="field">
            <label>Username *</label>
            <input id="nb-owner-username" class="mono" dir="ltr"
                   placeholder="owner_shop">
          </div>
          <div class="field field-full">
            <label>كلمة المرور *</label>
            <div style="display:flex;gap:8px">
              <input id="nb-owner-password" type="text" class="mono"
                     dir="ltr" value="${esc(generatePassword())}"
                     style="flex:1">
              <button class="btn" type="button" id="nb-gen-pass"
                      style="flex-shrink:0">
                <i data-lucide="refresh-cw"></i>
              </button>
            </div>
            <span style="font-size:10.5px;color:var(--muted);
                         font-weight:600;margin-top:4px">
              انسخها الآن وأرسلها لصاحب المحل
            </span>
          </div>
          <div class="field">
            <label>الهاتف</label>
            <input id="nb-owner-phone" class="mono" dir="ltr">
          </div>
        </div>

        <div id="nb-error" class="hidden"
             style="margin-top:14px;padding:10px;
                    background:var(--danger-bg);color:var(--danger);
                    border-radius:8px;font-size:12px;font-weight:700"></div>
      `,
      footer: `
        <button class="btn" data-cancel type="button">إلغاء</button>
        <button class="btn btn-primary" id="nb-submit" type="button">
          <i data-lucide="check"></i> إنشاء النشاط
        </button>
      `,
      onMount: (el, close) => {
        el.querySelector('[data-cancel]').onclick = close;

        // زر توليد كلمة مرور جديدة
        el.querySelector('#nb-gen-pass').onclick = () => {
          el.querySelector('#nb-owner-password').value = generatePassword();
        };

        // recalc end date
        const subType = el.querySelector('#nb-sub-type');
        const start = el.querySelector('#nb-sub-start');
        const end = el.querySelector('#nb-sub-end');

        function recalcEnd() {
          const t = subType.value;
          if (t === 'custom') return;
          const days = SUBSCRIPTION_PLANS[t]?.days || 30;
          end.value = addDaysISO(start.value, days);
        }
        subType.onchange = recalcEnd;
        start.onchange = recalcEnd;

        // submit
        el.querySelector('#nb-submit').onclick = async () => {
          const get = (id) => el.querySelector('#' + id).value.trim();
          const errEl = el.querySelector('#nb-error');
          const btn = el.querySelector('#nb-submit');

          function showErr(msg) {
            errEl.textContent = msg;
            errEl.classList.remove('hidden');
            errEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          function clearErr() { errEl.classList.add('hidden'); }

          clearErr();

          const payload = {
            code: get('nb-code').toUpperCase(),
            name: get('nb-name'),
            phone: get('nb-phone') || null,
            email: get('nb-email') || null,
            address: get('nb-address') || null,
            country: get('nb-country') || 'EG',
            currency: get('nb-currency') || 'EGP',
            base_karat: parseInt(get('nb-base-karat'), 10) || 21,
            max_users: parseInt(get('nb-max-users'), 10) || 10,
            max_branches: parseInt(get('nb-max-branches'), 10) || 3,
            subscription_type: get('nb-sub-type'),
            subscription_start: new Date(get('nb-sub-start')).toISOString(),
            subscription_end: new Date(get('nb-sub-end')).toISOString(),
            grace_period_days: parseInt(get('nb-grace'), 10) || 7,
            created_by: State.owner?.id || null,
          };

          const owner = {
            full_name: get('nb-owner-name'),
            username: get('nb-owner-username'),
            password: get('nb-owner-password'),
            phone: get('nb-owner-phone'),
          };

          const amount = parseFloat(get('nb-amount')) || 0;

          // Validation
          if (!payload.name) return showErr('اسم النشاط مطلوب');
          if (!owner.full_name) return showErr('اسم صاحب المحل مطلوب');
          if (!owner.username || owner.username.length < 3)
            return showErr('Username يجب أن يكون 3 أحرف على الأقل');
          if (!owner.password || owner.password.length < 6)
            return showErr('كلمة المرور يجب أن تكون 6 أحرف على الأقل');

          btn.disabled = true;
          btn.innerHTML = '<i data-lucide="loader-circle"></i> جارٍ الإنشاء…';
          window.lucide?.createIcons();

          try {
            const client = getSb();
            if (!client) throw new Error('لا يوجد اتصال بـ Supabase');

            // 1) إنشاء النشاط
            const { data: biz, error: bizErr } = await client
              .from('businesses')
              .insert(payload)
              .select('id, code, name')
              .single();

            if (bizErr) {
              if (bizErr.code === '23505') {
                throw new Error('الكود التعريفي مستخدم مسبقاً — حاول مرة أخرى');
              }
              throw bizErr;
            }

            // 2) إنشاء حساب Owner
            const passwordHash = window.bcrypt.hashSync(owner.password, 10);

            const { error: userErr } = await client
              .from('business_users')
              .insert({
                business_id: biz.id,
                username: owner.username,
                password_hash: passwordHash,
                full_name: owner.full_name,
                phone: owner.phone || null,
                role: 'SUPER_ADMIN',
                is_owner: true,
                created_by: State.owner?.id || null,
              });

            if (userErr) {
              // rollback
              await client.from('businesses').delete().eq('id', biz.id);
              throw userErr;
            }

            // 3) توليد رمز تحقق
            const vcode = genVCode();
            const expiresAt = new Date(Date.now() + 48 * 3600 * 1000).toISOString();

            const { error: vErr } = await client
              .from('business_verification_codes')
              .insert({
                business_id: biz.id,
                code: vcode,
                purpose: 'activation',
                expires_at: expiresAt,
                created_by: State.owner?.id || null,
              });

            if (vErr) throw vErr;

            // 4) تسجيل دفعة (لو فيه مبلغ)
            if (amount > 0) {
              try {
                await client.from('subscription_payments').insert({
                  business_id: biz.id,
                  amount: amount,
                  currency: payload.currency,
                  period_start: payload.subscription_start,
                  period_end: payload.subscription_end,
                  payment_method: 'cash',
                  received_by: State.owner?.id || null,
                });
              } catch (pe) {
                console.warn('Payment record failed:', pe);
              }
            }

            close();
            Toast.ok('✅ تم إنشاء النشاط', biz.name);

            // تحديث البيانات + إظهار الكود
            await refreshAll();
            showSuccessCodes(biz, vcode, owner);

          } catch (e) {
            console.error('[CreateBusiness]', e);
            showErr(`فشل: ${e.message}`);
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="check"></i> إعادة المحاولة';
            window.lucide?.createIcons();
          }
        };
      },
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §21 · MODAL — SUCCESS CODES (بعد إنشاء النشاط)
     ═════════════════════════════════════════════════════════════════════ */
  function showSuccessCodes(biz, vcode, owner) {
    Modal.show({
      title: 'تم إنشاء النشاط بنجاح',
      icon: 'check-circle-2',
      closable: false,
      body: `
        <div style="text-align:center;padding:12px 0 20px">
          <div style="width:72px;height:72px;border-radius:22px;
                      background:var(--gold-grad);display:grid;
                      place-items:center;margin:0 auto 16px;
                      color:#2a1f05;
                      box-shadow:0 14px 34px -12px rgba(212,160,23,.9)">
            <i data-lucide="check" style="width:36px;height:36px"></i>
          </div>
          <h3 style="font-size:17px;margin:0 0 6px">${esc(biz.name)}</h3>
          <p style="color:var(--muted);font-size:12px;
                    font-weight:600;margin:0">
            سلّم البيانات التالية لصاحب المحل
          </p>
        </div>

        <div style="display:flex;flex-direction:column;gap:14px">
          <div>
            <div style="font-size:11px;font-weight:800;color:var(--muted);
                        text-transform:uppercase;margin-bottom:6px">
              كود النشاط
            </div>
            <div class="code-chip"
                 style="width:100%;justify-content:space-between;
                        font-size:16px;padding:12px 14px">
              <span>${esc(biz.code)}</span>
              <button type="button"
                      onclick="OwnerPanel.copyText('${esc(biz.code)}')"
                      title="نسخ"
                      style="background:transparent;border:none;
                             color:var(--muted);cursor:pointer">
                <i data-lucide="copy" style="width:16px;height:16px"></i>
              </button>
            </div>
          </div>

          <div>
            <div style="font-size:11px;font-weight:800;color:var(--muted);
                        text-transform:uppercase;margin-bottom:6px">
              رمز التحقق (صالح 48 ساعة)
            </div>
            <div class="code-chip"
                 style="width:100%;justify-content:space-between;
                        font-size:20px;padding:12px 14px;
                        color:var(--warn);letter-spacing:3px">
              <span>${esc(vcode)}</span>
              <button type="button"
                      onclick="OwnerPanel.copyText('${esc(vcode)}')"
                      title="نسخ"
                      style="background:transparent;border:none;
                             color:var(--warn);cursor:pointer">
                <i data-lucide="copy" style="width:16px;height:16px"></i>
              </button>
            </div>
          </div>

          <div>
            <div style="font-size:11px;font-weight:800;color:var(--muted);
                        text-transform:uppercase;margin-bottom:6px">
              بيانات دخول صاحب المحل
            </div>
            <div style="padding:12px;background:var(--surface-2);
                        border-radius:8px;font-family:var(--font-mono);
                        font-size:13px;line-height:1.9">
              <div>Username:
                <b style="color:var(--primary)">${esc(owner.username)}</b>
              </div>
              <div>Password:
                <b style="color:var(--primary)">${esc(owner.password)}</b>
              </div>
            </div>
          </div>

          <div style="padding:12px 14px;background:var(--info-bg);
                      border-radius:8px;font-size:11.5px;
                      color:var(--text-2);font-weight:600;line-height:1.8;
                      border-inline-start:3px solid var(--info)">
            <b style="color:var(--info)">📤 الخطوة القادمة:</b><br>
            أرسل لصاحب المحل:<br>
            • الرابط: <span class="mono" style="color:var(--text)">
              ${esc(location.origin)}
            </span><br>
            • كود النشاط: <span class="mono" style="color:var(--primary)">
              ${esc(biz.code)}
            </span><br>
            • رمز التحقق: <span class="mono" style="color:var(--warn)">
              ${esc(vcode)}
            </span><br>
            • بيانات الدخول: <span class="mono" style="color:var(--primary)">
              ${esc(owner.username)} / ${esc(owner.password)}
            </span>
          </div>
        </div>
      `,
      footer: `
        <button class="btn" onclick="OwnerPanel.copyAllCodes('${esc(biz.code)}','${esc(vcode)}','${esc(owner.username)}','${esc(owner.password)}')"
                type="button">
          <i data-lucide="copy"></i> نسخ كل البيانات
        </button>
        <button class="btn btn-primary" data-close type="button">
          <i data-lucide="check"></i> فهمت
        </button>
      `,
      onMount: (el, close) => {
        el.querySelector('[data-close]').onclick = close;
      },
    });
  }

  function copyAllCodes(code, vcode, username, password) {
    const text = `
🔐 بيانات دخول محل الذهب — Gold MS ERP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔗 الرابط: ${location.origin}
📌 كود النشاط: ${code}
🔑 رمز التحقق: ${vcode}

👤 بيانات الدخول:
   Username: ${username}
   Password: ${password}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
الخطوات:
1. افتح الرابط
2. أدخل كود النشاط + رمز التحقق
3. اختر "صاحب المحل"
4. أدخل Username + Password
`.trim();
    copyText(text);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §22 · MODAL — EDIT BUSINESS
     ═════════════════════════════════════════════════════════════════════ */
  function openEditBusiness(bizId) {
    const biz = State.businesses.find(b => b.id === bizId);
    if (!biz) return Toast.err('النشاط غير موجود');

    Modal.show({
      title: `تعديل النشاط — ${biz.name}`,
      icon: 'pencil',
      wide: true,
      body: `
        <div class="grid-form">
          <div class="field">
            <label>الكود التعريفي</label>
            <input value="${esc(biz.code)}" readonly class="mono"
                   style="font-weight:900;color:var(--primary)">
          </div>
          <div class="field">
            <label>اسم النشاط</label>
            <input id="eb-name" value="${esc(biz.name)}">
          </div>
          <div class="field">
            <label>الهاتف</label>
            <input id="eb-phone" value="${esc(biz.phone || '')}"
                   class="mono" dir="ltr">
          </div>
          <div class="field">
            <label>البريد</label>
            <input id="eb-email" type="email"
                   value="${esc(biz.email || '')}" class="mono" dir="ltr">
          </div>
          <div class="field field-full">
            <label>العنوان</label>
            <input id="eb-address" value="${esc(biz.address || '')}">
          </div>
          <div class="field">
            <label>الدولة</label>
            <input id="eb-country" value="${esc(biz.country || 'EG')}"
                   class="mono" dir="ltr">
          </div>
          <div class="field">
            <label>العملة</label>
            <input id="eb-currency" value="${esc(biz.currency || 'EGP')}"
                   class="mono" dir="ltr">
          </div>
          <div class="field">
            <label>عيار الأساس</label>
            <select id="eb-base-karat">
              <option value="18" ${biz.base_karat === 18 ? 'selected' : ''}>18K</option>
              <option value="21" ${biz.base_karat === 21 ? 'selected' : ''}>21K</option>
              <option value="24" ${biz.base_karat === 24 ? 'selected' : ''}>24K</option>
            </select>
          </div>
          <div class="field">
            <label>أقصى عدد مستخدمين</label>
            <input id="eb-max-users" type="number"
                   value="${biz.max_users || 10}" min="1">
          </div>
          <div class="field">
            <label>أقصى عدد فروع</label>
            <input id="eb-max-branches" type="number"
                   value="${biz.max_branches || 3}" min="1">
          </div>
          <div class="field field-full">
            <label>ملاحظات</label>
            <textarea id="eb-notes" rows="3">${esc(biz.notes || '')}</textarea>
          </div>
        </div>

        <div id="eb-error" class="hidden"
             style="margin-top:14px;padding:10px;
                    background:var(--danger-bg);color:var(--danger);
                    border-radius:8px;font-size:12px;font-weight:700"></div>
      `,
      footer: `
        <button class="btn" data-cancel type="button">إلغاء</button>
        <button class="btn btn-primary" id="eb-submit" type="button">
          <i data-lucide="save"></i> حفظ التعديلات
        </button>
      `,
      onMount: (el, close) => {
        el.querySelector('[data-cancel]').onclick = close;

        el.querySelector('#eb-submit').onclick = async () => {
          const get = (id) => el.querySelector('#' + id).value.trim();
          const errEl = el.querySelector('#eb-error');
          const btn = el.querySelector('#eb-submit');

          const updates = {
            name: get('eb-name'),
            phone: get('eb-phone') || null,
            email: get('eb-email') || null,
            address: get('eb-address') || null,
            country: get('eb-country') || 'EG',
            currency: get('eb-currency') || 'EGP',
            base_karat: parseInt(get('eb-base-karat'), 10) || 21,
            max_users: parseInt(get('eb-max-users'), 10) || 10,
            max_branches: parseInt(get('eb-max-branches'), 10) || 3,
            notes: get('eb-notes') || null,
            updated_at: new Date().toISOString(),
          };

          if (!updates.name) {
            errEl.textContent = 'الاسم مطلوب';
            errEl.classList.remove('hidden');
            return;
          }

          btn.disabled = true;
          btn.innerHTML = '<i data-lucide="loader-circle"></i> جارٍ الحفظ…';
          window.lucide?.createIcons();

          try {
            const client = getSb();
            if (!client) throw new Error('لا يوجد اتصال');

            const { error } = await client
              .from('businesses')
              .update(updates)
              .eq('id', bizId);

            if (error) throw error;

            close();
            Toast.ok('تم حفظ التعديلات');
            await refreshAll();

          } catch (e) {
            console.error(e);
            errEl.textContent = `فشل: ${e.message}`;
            errEl.classList.remove('hidden');
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="save"></i> إعادة المحاولة';
            window.lucide?.createIcons();
          }
        };
      },
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §23 · MODAL — USERS
     ═════════════════════════════════════════════════════════════════════ */
  async function openUsers(bizId) {
    const biz = State.businesses.find(b => b.id === bizId);
    if (!biz) return Toast.err('النشاط غير موجود');

    const { el, close } = Modal.show({
      title: `المستخدمون — ${biz.name}`,
      icon: 'users',
      wide: true,
      body: `
        <div id="u-loading" style="text-align:center;padding:40px">
          <div class="spinner" style="margin:0 auto 12px;
                      width:32px;height:32px;border:3px solid var(--border);
                      border-top-color:var(--primary);border-radius:50%;
                      animation:spin 1s linear infinite"></div>
          <div style="font-size:12px;color:var(--muted);font-weight:700">
            جارٍ تحميل المستخدمين…
          </div>
        </div>
        <div id="u-content" class="hidden"></div>
      `,
      footer: `
        <button class="btn" data-cancel type="button">إغلاق</button>
        <button class="btn btn-primary" id="u-add" type="button">
          <i data-lucide="user-plus"></i> مستخدم جديد
        </button>
      `,
      onMount: (modalEl, closeFn) => {
        modalEl.querySelector('[data-cancel]').onclick = closeFn;
        modalEl.querySelector('#u-add').onclick = () => openAddUser(bizId, () => {
          closeFn();
          openUsers(bizId);
        });
      },
    });

    // جلب المستخدمين
    try {
      const users = await loadBusinessUsers(bizId);
      const loadingEl = el.querySelector('#u-loading');
      const contentEl = el.querySelector('#u-content');

      loadingEl.classList.add('hidden');
      contentEl.classList.remove('hidden');

      if (!users.length) {
        contentEl.innerHTML = `
          <div class="empty" style="padding:60px 20px">
            <i data-lucide="user-x"></i>
            <div style="font-weight:800;font-size:14px;margin-top:8px">
              لا يوجد مستخدمون
            </div>
            <div style="font-size:12px;color:var(--muted);margin-top:4px">
              أضف أول مستخدم لهذا النشاط
            </div>
          </div>
        `;
        window.lucide?.createIcons();
        return;
      }

      contentEl.innerHTML = `
        <div style="overflow-x:auto">
          <table class="tbl">
            <thead>
              <tr>
                <th>الاسم</th>
                <th style="width:140px">Username</th>
                <th style="width:130px">الدور</th>
                <th class="col-c" style="width:100px">الحالة</th>
                <th class="col-c" style="width:140px">آخر دخول</th>
                <th class="col-c" style="width:80px">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              ${users.map(u => `
                <tr>
                  <td>
                    <div style="font-weight:800;font-size:13px">
                      ${esc(u.full_name || '—')}
                    </div>
                    ${u.is_owner ? `
                      <span class="pill pill-amber" style="font-size:9.5px;
                                  margin-top:3px">
                        <i data-lucide="crown" style="width:9px;height:9px"></i>
                        صاحب المحل
                      </span>
                    ` : ''}
                  </td>
                  <td class="mono" style="font-size:11.5px">
                    ${esc(u.username)}
                  </td>
                  <td>${getRoleBadgeHTML(u.role)}</td>
                  <td class="col-c">
                    <span class="pill ${u.is_active ? 'pill-green' : 'pill-gray'}">
                      ${u.is_active ? 'نشط' : 'موقوف'}
                    </span>
                  </td>
                  <td class="col-c mono"
                      style="font-size:10.5px;color:var(--muted)">
                    ${u.last_login ? timeAgo(u.last_login) : '—'}
                  </td>
                  <td class="col-c">
                    <div style="display:flex;gap:4px;justify-content:center">
                      <button class="icon-btn" title="إعادة تعيين كلمة المرور"
                              onclick="OwnerPanel.resetUserPassword('${esc(u.id)}','${esc(bizId)}')"
                              type="button">
                        <i data-lucide="key"></i>
                      </button>
                      <button class="icon-btn" title="${u.is_active ? 'إيقاف' : 'تنشيط'}"
                              onclick="OwnerPanel.toggleUserActive('${esc(u.id)}','${esc(bizId)}',${!u.is_active})"
                              type="button">
                        <i data-lucide="${u.is_active ? 'pause-circle' : 'play-circle'}"></i>
                      </button>
                      <button class="icon-btn" title="حذف"
                              style="color:var(--danger)"
                              onclick="OwnerPanel.deleteUser('${esc(u.id)}','${esc(bizId)}')"
                              type="button">
                        <i data-lucide="trash-2"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
      window.lucide?.createIcons();

    } catch (e) {
      console.error(e);
      el.querySelector('#u-loading').innerHTML = `
        <div style="padding:30px;text-align:center;color:var(--danger);
                    font-weight:700;font-size:12px">
          فشل: ${esc(e.message)}
        </div>
      `;
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §24 · MODAL — ADD USER
     ═════════════════════════════════════════════════════════════════════ */
  function openAddUser(bizId, onSuccess) {
    Modal.show({
      title: 'إضافة مستخدم جديد',
      icon: 'user-plus',
      body: `
        <div class="grid-form">
          <div class="field">
            <label>الاسم الكامل *</label>
            <input id="au-name" autofocus>
          </div>
          <div class="field">
            <label>Username *</label>
            <input id="au-username" class="mono" dir="ltr"
                   placeholder="user_name">
          </div>
          <div class="field field-full">
            <label>كلمة المرور *</label>
            <div style="display:flex;gap:8px">
              <input id="au-password" class="mono" dir="ltr"
                     value="${esc(generatePassword())}" style="flex:1">
              <button class="btn" type="button" id="au-gen-pass"
                      style="flex-shrink:0">
                <i data-lucide="refresh-cw"></i>
              </button>
            </div>
          </div>
          <div class="field">
            <label>الدور</label>
            <select id="au-role">
              <option value="SUPER_ADMIN">مدير عام</option>
              <option value="BRANCH_MANAGER">مدير فرع</option>
              <option value="ACCOUNTANT">محاسب</option>
              <option value="SALESPERSON" selected>بائع</option>
              <option value="DATA_ENTRY">مدخل بيانات</option>
              <option value="B2B_REP">بياع جملة</option>
            </select>
          </div>
          <div class="field">
            <label>الهاتف</label>
            <input id="au-phone" class="mono" dir="ltr">
          </div>
          <div class="field">
            <label>البريد</label>
            <input id="au-email" type="email" class="mono" dir="ltr">
          </div>
          <div class="field">
            <label>صاحب المحل؟</label>
            <select id="au-owner">
              <option value="false">لا</option>
              <option value="true">نعم</option>
            </select>
          </div>
        </div>
        <div id="au-error" class="hidden"
             style="margin-top:14px;padding:10px;
                    background:var(--danger-bg);color:var(--danger);
                    border-radius:8px;font-size:12px;font-weight:700"></div>
      `,
      footer: `
        <button class="btn" data-cancel type="button">إلغاء</button>
        <button class="btn btn-primary" id="au-submit" type="button">
          <i data-lucide="check"></i> إضافة المستخدم
        </button>
      `,
      onMount: (el, close) => {
        el.querySelector('[data-cancel]').onclick = close;
        el.querySelector('#au-gen-pass').onclick = () => {
          el.querySelector('#au-password').value = generatePassword();
        };

        el.querySelector('#au-submit').onclick = async () => {
          const get = (id) => el.querySelector('#' + id).value.trim();
          const errEl = el.querySelector('#au-error');
          const btn = el.querySelector('#au-submit');

          function showErr(m) {
            errEl.textContent = m;
            errEl.classList.remove('hidden');
          }
          errEl.classList.add('hidden');

          const payload = {
            business_id: bizId,
            full_name: get('au-name'),
            username: get('au-username'),
            password_hash: window.bcrypt.hashSync(get('au-password'), 10),
            role: get('au-role'),
            phone: get('au-phone') || null,
            email: get('au-email') || null,
            is_owner: get('au-owner') === 'true',
            created_by: State.owner?.id || null,
          };

          if (!payload.full_name) return showErr('الاسم مطلوب');
          if (payload.username.length < 3)
            return showErr('Username يجب أن يكون 3 أحرف على الأقل');

          btn.disabled = true;
          btn.innerHTML = '<i data-lucide="loader-circle"></i> جارٍ الإضافة…';
          window.lucide?.createIcons();

          try {
            const client = getSb();
            if (!client) throw new Error('لا يوجد اتصال');

            const { error } = await client
              .from('business_users')
              .insert(payload);

            if (error) {
              if (error.code === '23505') {
                throw new Error('Username مستخدم مسبقاً في هذا النشاط');
              }
              throw error;
            }

            close();
            Toast.ok('✅ تمت إضافة المستخدم', payload.username);

            if (typeof onSuccess === 'function') onSuccess();

          } catch (e) {
            console.error(e);
            showErr(`فشل: ${e.message}`);
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="check"></i> إعادة المحاولة';
            window.lucide?.createIcons();
          }
        };
      },
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §25 · USER ACTIONS
     ═════════════════════════════════════════════════════════════════════ */
  async function deleteUser(userId, bizId) {
    const ok = confirm('⚠️ سيتم حذف المستخدم نهائياً.\nهل أنت متأكد؟');
    if (!ok) return;

    try {
      const client = getSb();
      if (!client) throw new Error('لا يوجد اتصال');

      const { error } = await client
        .from('business_users')
        .delete()
        .eq('id', userId);

      if (error) throw error;

      Toast.ok('تم حذف المستخدم');
      // إعادة فتح المودال
      Modal.closeAll();
      setTimeout(() => openUsers(bizId), 200);

    } catch (e) {
      console.error(e);
      Toast.err('فشل الحذف', e.message);
    }
  }

  async function toggleUserActive(userId, bizId, activate) {
    try {
      const client = getSb();
      if (!client) throw new Error('لا يوجد اتصال');

      const { error } = await client
        .from('business_users')
        .update({ is_active: activate })
        .eq('id', userId);

      if (error) throw error;

      Toast.ok(activate ? 'تم تنشيط المستخدم' : 'تم إيقاف المستخدم');
      Modal.closeAll();
      setTimeout(() => openUsers(bizId), 200);

    } catch (e) {
      console.error(e);
      Toast.err('فشل التحديث', e.message);
    }
  }

  async function resetUserPassword(userId, bizId) {
    Modal.show({
      title: 'إعادة تعيين كلمة المرور',
      icon: 'key',
      body: `
        <div class="field">
          <label>كلمة المرور الجديدة</label>
          <div style="display:flex;gap:8px">
            <input id="rp-pass" class="mono" dir="ltr"
                   value="${esc(generatePassword())}" style="flex:1">
            <button class="btn" type="button" id="rp-gen"
                    style="flex-shrink:0">
              <i data-lucide="refresh-cw"></i>
            </button>
          </div>
        </div>
        <div id="rp-error" class="hidden"
             style="margin-top:14px;padding:10px;
                    background:var(--danger-bg);color:var(--danger);
                    border-radius:8px;font-size:12px;font-weight:700"></div>
      `,
      footer: `
        <button class="btn" data-cancel type="button">إلغاء</button>
        <button class="btn btn-primary" id="rp-submit" type="button">
          <i data-lucide="check"></i> تحديث
        </button>
      `,
      onMount: (el, close) => {
        el.querySelector('[data-cancel]').onclick = close;
        el.querySelector('#rp-gen').onclick = () => {
          el.querySelector('#rp-pass').value = generatePassword();
        };

        el.querySelector('#rp-submit').onclick = async () => {
          const pass = el.querySelector('#rp-pass').value.trim();
          const errEl = el.querySelector('#rp-error');
          const btn = el.querySelector('#rp-submit');

          if (pass.length < 6) {
            errEl.textContent = 'كلمة المرور قصيرة';
            errEl.classList.remove('hidden');
            return;
          }

          btn.disabled = true;
          btn.innerHTML = '<i data-lucide="loader-circle"></i> جارٍ…';
          window.lucide?.createIcons();

          try {
            const client = getSb();
            const { error } = await client
              .from('business_users')
              .update({
                password_hash: window.bcrypt.hashSync(pass, 10),
                failed_attempts: 0,
                locked_until: null,
              })
              .eq('id', userId);

            if (error) throw error;

            close();
            Toast.ok('تم تحديث كلمة المرور', `الجديدة: ${pass}`);

          } catch (e) {
            console.error(e);
            errEl.textContent = `فشل: ${e.message}`;
            errEl.classList.remove('hidden');
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="check"></i> إعادة المحاولة';
            window.lucide?.createIcons();
          }
        };
      },
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §26 · MODAL — VERIFICATION CODE
     ═════════════════════════════════════════════════════════════════════ */
  function openVerificationCode(bizId) {
    const biz = State.businesses.find(b => b.id === bizId);
    if (!biz) return Toast.err('النشاط غير موجود');

    const newCode = genVCode();

    Modal.show({
      title: `توليد رمز تحقق — ${biz.name}`,
      icon: 'key',
      body: `
        <div style="padding:12px 14px;background:var(--info-bg);
                    border-radius:8px;font-size:12px;font-weight:700;
                    color:var(--text-2);line-height:1.7;margin-bottom:16px;
                    border-inline-start:3px solid var(--info)">
          <i data-lucide="info" style="width:13px;height:13px;
             display:inline;vertical-align:-2px;color:var(--info)"></i>
          رمز التحقق صالح لمرة واحدة فقط، ولتفعيل النشاط أو استعادة
          كلمة مرور صاحب المحل.
        </div>

        <div class="grid-form">
          <div class="field">
            <label>الغرض</label>
            <select id="vc-purpose">
              <option value="activation">تفعيل الحساب (لأول مرة)</option>
              <option value="reset_password">إعادة تعيين كلمة المرور</option>
            </select>
          </div>
          <div class="field">
            <label>صلاحية الرمز</label>
            <select id="vc-duration">
              <option value="24">24 ساعة</option>
              <option value="48" selected>48 ساعة</option>
              <option value="72">72 ساعة</option>
              <option value="168">7 أيام</option>
            </select>
          </div>
        </div>

        <div style="margin-top:20px">
          <div style="font-size:11px;color:var(--muted);font-weight:800;
                      text-transform:uppercase;margin-bottom:8px">
            الرمز المُولَّد
          </div>
          <div class="code-chip"
               style="width:100%;justify-content:space-between;
                      padding:16px 18px;font-size:26px;
                      letter-spacing:6px;color:var(--warn)">
            <span id="vc-value">${esc(newCode)}</span>
            <button type="button"
                    onclick="OwnerPanel.copyText('${esc(newCode)}')"
                    style="background:transparent;border:none;
                           color:var(--warn);cursor:pointer">
              <i data-lucide="copy" style="width:20px;height:20px"></i>
            </button>
          </div>
          <div style="font-size:10.5px;color:var(--muted);font-weight:600;
                      margin-top:8px;text-align:center">
            هذا الرمز لن يُحفظ — انسخه الآن قبل الإغلاق
          </div>
        </div>

        <div id="vc-error" class="hidden"
             style="margin-top:14px;padding:10px;
                    background:var(--danger-bg);color:var(--danger);
                    border-radius:8px;font-size:12px;font-weight:700"></div>
      `,
      footer: `
        <button class="btn" data-cancel type="button">إلغاء</button>
        <button class="btn btn-primary" id="vc-submit" type="button">
          <i data-lucide="save"></i> حفظ الرمز في قاعدة البيانات
        </button>
      `,
      onMount: (el, close) => {
        el.querySelector('[data-cancel]').onclick = close;

        el.querySelector('#vc-submit').onclick = async () => {
          const purpose = el.querySelector('#vc-purpose').value;
          const duration = parseInt(el.querySelector('#vc-duration').value, 10) || 48;
          const errEl = el.querySelector('#vc-error');
          const btn = el.querySelector('#vc-submit');

          btn.disabled = true;
          btn.innerHTML = '<i data-lucide="loader-circle"></i> جارٍ الحفظ…';
          window.lucide?.createIcons();

          try {
            const client = getSb();
            if (!client) throw new Error('لا يوجد اتصال');

            const expiresAt = new Date(Date.now() + duration * 3600 * 1000).toISOString();

            const { error } = await client
              .from('business_verification_codes')
              .insert({
                business_id: bizId,
                code: newCode,
                purpose: purpose,
                expires_at: expiresAt,
                created_by: State.owner?.id || null,
              });

            if (error) throw error;

            close();
            Toast.ok('✅ تم توليد الرمز', `صالح لمدة ${duration} ساعة`);

          } catch (e) {
            console.error(e);
            errEl.textContent = `فشل: ${e.message}`;
            errEl.classList.remove('hidden');
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="save"></i> إعادة المحاولة';
            window.lucide?.createIcons();
          }
        };
      },
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §27 · MODAL — SUBSCRIPTION
     ═════════════════════════════════════════════════════════════════════ */
  function openSubscription(bizId) {
    const biz = State.businesses.find(b => b.id === bizId);
    if (!biz) return Toast.err('النشاط غير موجود');

    const status = getBusinessStatus(biz);
    const daysLeft = getDaysLeft(biz);

    Modal.show({
      title: `إدارة الاشتراك — ${biz.name}`,
      icon: 'credit-card',
      wide: true,
      body: `
        <div style="padding:16px;background:var(--surface-2);
                    border-radius:10px;margin-bottom:18px">
          <div style="display:grid;
                      grid-template-columns:repeat(auto-fit,minmax(140px,1fr));
                      gap:14px">
            <div>
              <div style="font-size:10.5px;color:var(--muted);
                          font-weight:800;text-transform:uppercase">
                الحالة الحالية
              </div>
              <div style="margin-top:6px">
                ${getStatusBadgeHTML(status)}
              </div>
            </div>
            <div>
              <div style="font-size:10.5px;color:var(--muted);
                          font-weight:800;text-transform:uppercase">
                تاريخ الانتهاء
              </div>
              <div class="mono" style="font-size:14px;font-weight:800;margin-top:6px">
                ${dateAr(biz.subscription_end)}
              </div>
            </div>
            <div>
              <div style="font-size:10.5px;color:var(--muted);
                          font-weight:800;text-transform:uppercase">
                الأيام المتبقية
              </div>
              <div class="mono"
                   style="font-size:14px;font-weight:900;margin-top:6px;
                          color:${getDaysLeftColor(daysLeft)}">
                ${daysLeft >= 0 ? daysLeft + ' يوم' : 'منتهي'}
              </div>
            </div>
            <div>
              <div style="font-size:10.5px;color:var(--muted);
                          font-weight:800;text-transform:uppercase">
                نوع الاشتراك
              </div>
              <div style="font-size:12.5px;font-weight:800;margin-top:6px">
                ${esc(SUBSCRIPTION_PLANS[biz.subscription_type]?.label || '—')}
              </div>
            </div>
          </div>
        </div>

        <h4 style="font-size:12px;font-weight:900;margin:0 0 12px;
                   text-transform:uppercase;color:var(--muted);
                   letter-spacing:.4px">
          📅 تمديد الاشتراك
        </h4>
        <div class="grid-form">
          <div class="field">
            <label>مدة التمديد</label>
            <select id="sb-extend-days">
              <option value="30">+30 يوم (شهر)</option>
              <option value="90">+90 يوم (3 شهور)</option>
              <option value="180">+180 يوم (6 شهور)</option>
              <option value="365">+365 يوم (سنة)</option>
              <option value="custom">مخصص</option>
            </select>
          </div>
          <div class="field hidden" id="sb-custom-wrap">
            <label>عدد الأيام</label>
            <input type="number" id="sb-custom-days"
                   value="30" min="1" class="mono">
          </div>
          <div class="field">
            <label>المبلغ المدفوع (اختياري)</label>
            <input type="number" id="sb-amount"
                   value="0" step="0.01" class="mono">
          </div>
          <div class="field">
            <label>طريقة الدفع</label>
            <select id="sb-payment-method">
              <option value="cash">نقدي</option>
              <option value="bank">تحويل بنكي</option>
              <option value="instapay">إنستاباي</option>
              <option value="wallet">محفظة إلكترونية</option>
            </select>
          </div>
          <div class="field field-full">
            <label>ملاحظات</label>
            <input id="sb-notes" placeholder="اختياري">
          </div>
        </div>

        <div id="sb-error" class="hidden"
             style="margin-top:14px;padding:10px;
                    background:var(--danger-bg);color:var(--danger);
                    border-radius:8px;font-size:12px;font-weight:700"></div>

        <h4 style="font-size:12px;font-weight:900;margin:22px 0 12px;
                   text-transform:uppercase;color:var(--muted);
                   letter-spacing:.4px">
          ⚙️ إجراءات إضافية
        </h4>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          <button class="btn btn-sm" id="sb-toggle-suspend" type="button">
            <i data-lucide="${biz.is_suspended ? 'play-circle' : 'pause-circle'}"></i>
            ${biz.is_suspended ? 'إلغاء التعليق' : 'تعليق مؤقت'}
          </button>
          <button class="btn btn-sm" id="sb-toggle-active" type="button">
            <i data-lucide="${biz.is_active ? 'ban' : 'check-circle-2'}"></i>
            ${biz.is_active ? 'تعطيل النشاط' : 'تنشيط النشاط'}
          </button>
        </div>
      `,
      footer: `
        <button class="btn" data-cancel type="button">إغلاق</button>
        <button class="btn btn-primary" id="sb-submit" type="button">
          <i data-lucide="check"></i> تمديد وحفظ
        </button>
      `,
      onMount: (el, close) => {
        el.querySelector('[data-cancel]').onclick = close;

        // custom days
        const select = el.querySelector('#sb-extend-days');
        const customWrap = el.querySelector('#sb-custom-wrap');
        select.onchange = () => {
          customWrap.classList.toggle('hidden', select.value !== 'custom');
        };

        // تعليق
        el.querySelector('#sb-toggle-suspend').onclick = async () => {
          const newVal = !biz.is_suspended;
          const reason = newVal ? (prompt('سبب التعليق؟') || 'بدون سبب') : null;
          await updateBusiness(bizId, {
            is_suspended: newVal,
            suspension_reason: reason,
          });
          close();
          setTimeout(() => openSubscription(bizId), 200);
        };

        // تعطيل
        el.querySelector('#sb-toggle-active').onclick = async () => {
          const newVal = !biz.is_active;
          const ok = confirm(newVal ? 'تنشيط النشاط؟' : '⚠️ تعطيل النشاط؟');
          if (!ok) return;
          await updateBusiness(bizId, { is_active: newVal });
          close();
          setTimeout(() => openSubscription(bizId), 200);
        };

        // Submit
        el.querySelector('#sb-submit').onclick = async () => {
          const errEl = el.querySelector('#sb-error');
          const btn = el.querySelector('#sb-submit');

          let days;
          if (select.value === 'custom') {
            days = parseInt(el.querySelector('#sb-custom-days').value, 10) || 0;
          } else {
            days = parseInt(select.value, 10) || 0;
          }

          if (days <= 0) {
            errEl.textContent = 'أدخل عدد أيام صحيح';
            errEl.classList.remove('hidden');
            return;
          }

          const amount = parseFloat(el.querySelector('#sb-amount').value) || 0;
          const paymentMethod = el.querySelector('#sb-payment-method').value;
          const notes = el.querySelector('#sb-notes').value.trim();

          btn.disabled = true;
          btn.innerHTML = '<i data-lucide="loader-circle"></i> جارٍ التمديد…';
          window.lucide?.createIcons();

          try {
            const client = getSb();
            if (!client) throw new Error('لا يوجد اتصال');

            // حساب التاريخ الجديد
            const currentEnd = new Date(biz.subscription_end);
            const baseDate = currentEnd > new Date() ? currentEnd : new Date();
            const newEnd = new Date(baseDate.getTime() + days * 86400000);

            // تحديث النشاط
            const { error: bizErr } = await client
              .from('businesses')
              .update({
                subscription_end: newEnd.toISOString(),
                subscription_start: biz.subscription_start,
                is_suspended: false,
                suspension_reason: null,
              })
              .eq('id', bizId);

            if (bizErr) throw bizErr;

            // تسجيل الدفعة (لو فيه مبلغ)
            if (amount > 0) {
              const { error: payErr } = await client
                .from('subscription_payments')
                .insert({
                  business_id: bizId,
                  amount: amount,
                  currency: biz.currency || 'EGP',
                  period_start: baseDate.toISOString(),
                  period_end: newEnd.toISOString(),
                  payment_method: paymentMethod,
                  notes: notes || null,
                  received_by: State.owner?.id || null,
                });

              if (payErr) console.warn('Payment record failed:', payErr);
            }

            close();
            Toast.ok('✅ تم تمديد الاشتراك', `+${days} يوم`);
            await refreshAll();

          } catch (e) {
            console.error(e);
            errEl.textContent = `فشل: ${e.message}`;
            errEl.classList.remove('hidden');
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="check"></i> إعادة المحاولة';
            window.lucide?.createIcons();
          }
        };
      },
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §28 · MODAL — DELETE BUSINESS
     ═════════════════════════════════════════════════════════════════════ */
  function deleteBusiness(bizId) {
    const biz = State.businesses.find(b => b.id === bizId);
    if (!biz) return Toast.err('النشاط غير موجود');

    Modal.show({
      title: 'تأكيد حذف النشاط',
      icon: 'alert-triangle',
      body: `
        <div style="text-align:center;padding:14px 0 10px">
          <div style="width:72px;height:72px;border-radius:22px;
                      background:var(--danger-bg);color:var(--danger);
                      display:grid;place-items:center;margin:0 auto 14px">
            <i data-lucide="alert-octagon" style="width:36px;height:36px"></i>
          </div>
          <h3 style="font-size:16px;margin:0 0 8px">
            سيتم حذف "${esc(biz.name)}" نهائياً
          </h3>
          <p style="color:var(--muted);font-size:12px;font-weight:600;
                    margin:0;line-height:1.7">
            سيتم حذف:
          </p>
          <ul style="text-align:right;display:inline-block;margin:10px 0;
                     padding-inline-start:20px;font-size:12px;
                     color:var(--text-2);font-weight:700;line-height:1.9">
            <li>كل بيانات النشاط (المخزون، الفواتير، الموردين…)</li>
            <li>كل مستخدمي هذا النشاط</li>
            <li>رموز التحقق والاشتراكات</li>
            <li>كل سجل الحركات الخاص به</li>
          </ul>
          <p style="color:var(--danger);font-size:13px;font-weight:900;
                    margin:14px 0 0">
            ⚠️ لا يمكن التراجع عن هذه العملية
          </p>
        </div>

        <div class="field" style="margin-top:18px">
          <label>للتأكيد، اكتب كود النشاط: <code class="mono">${esc(biz.code)}</code></label>
          <input id="del-confirm" class="mono" dir="ltr"
                 placeholder="${esc(biz.code)}"
                 style="text-align:center;font-weight:900">
        </div>

        <div id="del-error" class="hidden"
             style="margin-top:12px;padding:10px;
                    background:var(--danger-bg);color:var(--danger);
                    border-radius:8px;font-size:12px;font-weight:700"></div>
      `,
      footer: `
        <button class="btn" data-cancel type="button">إلغاء</button>
        <button class="btn btn-danger" id="del-submit" type="button">
          <i data-lucide="trash-2"></i> حذف نهائي
        </button>
      `,
      onMount: (el, close) => {
        el.querySelector('[data-cancel]').onclick = close;

        el.querySelector('#del-submit').onclick = async () => {
          const input = el.querySelector('#del-confirm').value.trim();
          const errEl = el.querySelector('#del-error');
          const btn = el.querySelector('#del-submit');

          if (input !== biz.code) {
            errEl.textContent = 'كود النشاط غير مطابق';
            errEl.classList.remove('hidden');
            return;
          }

          btn.disabled = true;
          btn.innerHTML = '<i data-lucide="loader-circle"></i> جارٍ الحذف…';
          window.lucide?.createIcons();

          try {
            const client = getSb();
            if (!client) throw new Error('لا يوجد اتصال');

            const { error } = await client
              .from('businesses')
              .delete()
              .eq('id', bizId);

            if (error) throw error;

            close();
            Toast.ok('🗑️ تم حذف النشاط', biz.name);
            await refreshAll();

          } catch (e) {
            console.error(e);
            errEl.textContent = `فشل: ${e.message}`;
            errEl.classList.remove('hidden');
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="trash-2"></i> إعادة المحاولة';
            window.lucide?.createIcons();
          }
        };
      },
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §29 · UPDATE HELPERS
     ═════════════════════════════════════════════════════════════════════ */
  async function updateBusiness(bizId, updates) {
    try {
      const client = getSb();
      if (!client) throw new Error('لا يوجد اتصال');

      const { error } = await client
        .from('businesses')
        .update(updates)
        .eq('id', bizId);

      if (error) throw error;

      Toast.ok('تم التحديث');
      await refreshAll();
      return true;

    } catch (e) {
      console.error(e);
      Toast.err('فشل التحديث', e.message);
      return false;
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §30 · TAB SWITCHING
     ═════════════════════════════════════════════════════════════════════ */
  function switchTab(tab) {
    State.activeTab = tab;
    renderCurrentTab();
  }

  /* ═════════════════════════════════════════════════════════════════════
     §31 · REFRESH HELPERS
     ═════════════════════════════════════════════════════════════════════ */
  async function refreshAll() {
    State.loading = true;

    try {
      await Promise.all([
        loadBusinesses(),
        loadPayments(),
      ]);

      renderCurrentTab();

    } catch (e) {
      console.error('[Owner.refreshAll]', e);
      Toast.err('فشل التحديث', e.message);
    } finally {
      State.loading = false;
    }
  }

  async function refreshAudit() {
    try {
      await loadAuditLogs(200);
      renderCurrentTab();
    } catch (e) {
      console.error('[Owner.refreshAudit]', e);
      Toast.err('فشل تحميل السجل', e.message);
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §32 · SETTINGS EVENTS
     ═════════════════════════════════════════════════════════════════════ */
  function bindSettingsEvents() {
    // حفظ كلمة المرور
    const savePass = document.getElementById('set-save-pass');
    if (savePass) {
      savePass.onclick = async () => {
        const current = document.getElementById('set-current-pass').value;
        const newPass = document.getElementById('set-new-pass').value;
        const confirmPass = document.getElementById('set-confirm-pass').value;
        const errEl = document.getElementById('set-pass-error');
        const btn = document.getElementById('set-save-pass');

        function showErr(m) {
          errEl.textContent = m;
          errEl.classList.remove('hidden');
        }
        errEl.classList.add('hidden');

        if (!current || !newPass) return showErr('جميع الحقول مطلوبة');
        if (newPass.length < 8) return showErr('كلمة المرور 8 أحرف على الأقل');
        if (newPass !== confirmPass) return showErr('كلمتا المرور غير متطابقتين');

        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader-circle"></i> جارٍ…';
        window.lucide?.createIcons();

        try {
          const client = getSb();
          const { data: rows } = await client
            .from('saas_owners')
            .select('password_hash')
            .eq('id', State.owner.id)
            .single();

          if (!rows) throw new Error('المالك غير موجود');

          const ok = window.bcrypt.compareSync(current, rows.password_hash);
          if (!ok) {
            showErr('كلمة المرور الحالية غير صحيحة');
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="key"></i> تحديث كلمة المرور';
            window.lucide?.createIcons();
            return;
          }

          const newHash = window.bcrypt.hashSync(newPass, 10);
          const { error } = await client
            .from('saas_owners')
            .update({ password_hash: newHash })
            .eq('id', State.owner.id);

          if (error) throw error;

          Toast.ok('✅ تم تحديث كلمة المرور');
          document.getElementById('set-current-pass').value = '';
          document.getElementById('set-new-pass').value = '';
          document.getElementById('set-confirm-pass').value = '';

        } catch (e) {
          console.error(e);
          showErr(`فشل: ${e.message}`);
        } finally {
          btn.disabled = false;
          btn.innerHTML = '<i data-lucide="key"></i> تحديث كلمة المرور';
          window.lucide?.createIcons();
        }
      };
    }

    // حفظ Supabase
    const saveSb = document.getElementById('set-save-sb');
    if (saveSb) {
      saveSb.onclick = () => {
        const url = document.getElementById('set-sb-url').value.trim();
        const key = document.getElementById('set-sb-key').value.trim();
        const errEl = document.getElementById('set-sb-error');

        if (!url || !key) {
          errEl.textContent = 'URL و Anon Key مطلوبان';
          errEl.classList.remove('hidden');
          return;
        }

        SBConfig.save(url, key);

        State.supabaseClient = null;

        Toast.ok('✅ تم حفظ الإعدادات', 'سيتم إعادة التحميل…');
        setTimeout(() => {
          window.GMS = window.GMS || {};
          window.GMS._intentionalReload = true;
          location.reload();
        }, 800);
      };
    }

    // اختبار الاتصال
    const testSb = document.getElementById('set-test-sb');
    if (testSb) {
      testSb.onclick = async () => {
        const url = document.getElementById('set-sb-url').value.trim();
        const key = document.getElementById('set-sb-key').value.trim();
        const errEl = document.getElementById('set-sb-error');
        const btn = testSb;

        if (!url || !key) {
          errEl.textContent = 'URL و Anon Key مطلوبان';
          errEl.classList.remove('hidden');
          return;
        }

        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader-circle"></i> جارٍ…';
        window.lucide?.createIcons();

        try {
          const testClient = window.supabase.createClient(url, key);
          const { error } = await testClient
            .from('businesses')
            .select('id')
            .limit(1);

          if (error) throw error;

          errEl.classList.add('hidden');
          Toast.ok('✅ الاتصال ناجح');

        } catch (e) {
          console.error(e);
          errEl.textContent = `فشل: ${e.message}`;
          errEl.classList.remove('hidden');
        } finally {
          btn.disabled = false;
          btn.innerHTML = '<i data-lucide="plug"></i> اختبار الاتصال';
          window.lucide?.createIcons();
        }
      };
    }

    // حذف الإعدادات
    const clearSb = document.getElementById('set-clear-sb');
    if (clearSb) {
      clearSb.onclick = () => {
        if (!confirm('سيتم حذف إعدادات Supabase. متابعة؟')) return;
        SBConfig.clear();
        State.supabaseClient = null;
        Toast.warn('تم الحذف', 'جارٍ إعادة التحميل…');
        setTimeout(() => {
          window.GMS = window.GMS || {};
          window.GMS._intentionalReload = true;
          location.reload();
        }, 800);
      };
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §33 · LOGIN SCREEN
     ═════════════════════════════════════════════════════════════════════ */
  function bindLogin() {
    const form = document.getElementById('owner-login-form');
    const errEl = document.getElementById('owner-login-error');

    if (!form) return;

    /* 🆕 اربط إعدادات Supabase أولاً */
    bindSupabaseConfig();

    form.onsubmit = async (e) => {
      e.preventDefault();

      const username = document.getElementById('owner-username').value.trim();
      const password = document.getElementById('owner-password').value;
      const btn = form.querySelector('button[type="submit"]');

      errEl.classList.add('hidden');

      if (!username || !password) {
        errEl.textContent = 'أدخل Username و Password';
        errEl.classList.remove('hidden');
        return;
      }

      btn.disabled = true;
      btn.innerHTML = '<i data-lucide="loader-circle"></i> جارٍ التحقق…';
      window.lucide?.createIcons();

      try {
        await loginOwner(username, password);
        showApp();

      } catch (err) {
        console.error('[OwnerLogin]', err);
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="log-in"></i> تسجيل الدخول';
        window.lucide?.createIcons();
      }
    };

    setTimeout(() => {
      document.getElementById('owner-username')?.focus();
    }, 200);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §34 · SHOW APP / LOGIN
     ═════════════════════════════════════════════════════════════════════ */
  function showApp() {
    const loginScreen = document.getElementById('owner-login-screen');
    if (loginScreen) loginScreen.style.display = 'none';

    const app = document.getElementById('owner-app');
    if (app) {
      app.classList.remove('hidden');
      app.style.display = 'flex';
    }

    // تحديث اسم المالك
    const nameEl = document.getElementById('owner-name-display');
    if (nameEl && State.owner) {
      nameEl.textContent = State.owner.full_name || State.owner.username;
    }

    // تحميل البيانات وعرض dashboard
    refreshAll();
  }

  function showLogin() {
    const loginScreen = document.getElementById('owner-login-screen');
    if (loginScreen) loginScreen.style.display = '';

    const app = document.getElementById('owner-app');
    if (app) {
      app.classList.add('hidden');
      app.style.display = 'none';
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §35 · TOPBAR EVENTS
     ═════════════════════════════════════════════════════════════════════ */
  function bindTopbar() {
    const logoutBtn = document.getElementById('owner-logout-btn');
    if (logoutBtn) {
      logoutBtn.onclick = () => {
        if (confirm('تسجيل الخروج من لوحة المالك؟')) logoutOwner();
      };
    }

    const refreshBtn = document.getElementById('owner-refresh-btn');
    if (refreshBtn) {
      refreshBtn.onclick = () => {
        refreshBtn.classList.add('loading');
        refreshAll().finally(() => {
          refreshBtn.classList.remove('loading');
          Toast.ok('تم التحديث');
        });
      };
    }
  }

  function bindTabs() {
    document.querySelectorAll('.otab').forEach(tab => {
      tab.onclick = () => switchTab(tab.dataset.ownerTab);
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §36 · INIT
     ═════════════════════════════════════════════════════════════════════ */
  async function init() {
    if (State.initialized) return;
    State.initialized = true;

    console.log(
      '%c🔐 SaaS Owner Panel initializing…',
      'color:#D4A017;font-weight:900;font-size:13px;'
    );

    /* 🆕 اربط إعدادات Supabase (حتى قبل تسجيل الدخول) */
    bindSupabaseConfig();

    // استرجاع الجلسة
    const session = restoreOwnerSession();

    if (session && State.owner) {
      showApp();
    } else {
      showLogin();
      bindLogin();
    }

    bindTopbar();
    bindTabs();

    // تحديث أيقونات lucide
    if (window.lucide) {
      setTimeout(() => window.lucide.createIcons(), 100);
    }

    console.log(
      `%c✅ Owner Panel ready${State.owner ? ` · ${State.owner.username}` : ''}`,
      'color:#0f7a43;font-weight:900;font-size:13px;'
    );
  }

  /* ═════════════════════════════════════════════════════════════════════
     §37 · EXPORT — window.OwnerPanel
     ═════════════════════════════════════════════════════════════════════ */
  window.OwnerPanel = {
    /* Lifecycle */
    init,
    refreshAll,
    refreshAudit,
    switchTab,

    /* Auth */
    logout: logoutOwner,

    /* Modals */
    openCreateBusiness,
    openEditBusiness,
    openUsers,
    openAddUser,
    openVerificationCode,
    openSubscription,
    deleteBusiness,
    deleteUser,
    toggleUserActive,
    resetUserPassword,

    /* Helpers */
    copyText,
    copyAllCodes,

    /* 🆕 Supabase Config */
    SBConfig,
    bindSupabaseConfig,

    /* State (للتصحيح فقط) */
    getState: () => ({ ...State }),
  };

  /* ═════════════════════════════════════════════════════════════════════
     §38 · AUTO-INIT
     ═════════════════════════════════════════════════════════════════════ */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(init, 150);
    });
  } else {
    setTimeout(init, 150);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §39 · LOADED CONFIRMATION
     ═════════════════════════════════════════════════════════════════════ */
  console.log(
    '%c👑 SaaS Owner Panel v1.1.0 loaded · Supabase Config in Login Screen',
    'color:#D4A017;font-weight:900;font-size:13px;padding:3px 8px;' +
    'background:linear-gradient(135deg,#f0d68c,#9c7726);border-radius:4px;'
  );

  console.log(
    '%c🌐 Available on: /owner.html · API: window.OwnerPanel',
    'color:#6b7a95;font-weight:700;font-size:11px;'
  );

  console.log(
    '%c🆕 v1.1.0: SBConfig + bindSupabaseConfig() — إعداد Supabase قبل تسجيل الدخول',
    'color:#0f7a43;font-weight:900;font-size:11px;'
  );

})();
