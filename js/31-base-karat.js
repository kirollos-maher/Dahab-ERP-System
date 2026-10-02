/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ENTERPRISE — js/31-base-karat.js
   نظام توحيد وحدة الذهب — Base Karat Standardization
   ─────────────────────────────────────────────────────────────────────
   يسمح للمدير/المحاسب باختيار عيار الأساس الذي تُعرض به جميع أرصدة
   الذهب في النظام (لوحة التحكم، المخزون، المحاسبة، دفتر العملاء).

   ✅ v1.0.1 — التحديثات:
     • Resilient Supabase: يتخطى بهدوء عند NO_ORG / RPC مفقودة / صلاحيات
     • يظهر تحذير فقط عند فشل حقيقي (network error مثلاً)
     • يستمر في العمل محلياً في كل الحالات بدون كسر الواجهة
     • Console.info بدل warn لحالات "غير مُهيّأ"

   ✅ v1.0.0 المزايا الأساسية:
     • تفاعلي كامل (Reactive) — أي تغيير يُحدّث كل الواجهات فوراً
     • يحفظ في: LocalStorage + IndexedDB + Supabase (اختياري)
     • يتزامن بين التبويبات (BroadcastChannel + storage event)
     • يتحقق من الصلاحيات (SUPER_ADMIN / BRANCH_MANAGER / ACCOUNTANT)
     • دوال تحويل دقيقة (18 ↔ 21 ↔ 24 + مخصص)
     • يحافظ على البيانات الأصلية — التحويل للعرض فقط
     • Auto-init + Diagnostics

   Public API:
     GMS.BaseKarat.current       → 18 | 21 | 24  (getter)
     GMS.BaseKarat.ratio         → 0.75 | 0.875 | 1.0
     GMS.BaseKarat.label         → "عيار 21"
     GMS.BaseKarat.labelShort    → "21K"
     GMS.BaseKarat.OPTIONS       → [{value, ratio, color, icon, label}]
     GMS.BaseKarat.LABELS        → {18: 'عيار 18', 21: '...', 24: '...'}
     GMS.BaseKarat.COLORS        → {18: '#6b7a95', 21: '#9c7726', 24: '#c8a24a'}
     GMS.BaseKarat.set(karat)    → async { success, current, previous, error, skipped? }
     GMS.BaseKarat.convert(w, from, to)
     GMS.BaseKarat.toBase(w, from)      → يحوّل إلى العيار النشط
     GMS.BaseKarat.fromBase(baseW, to)  → يحوّل من العيار النشط
     GMS.BaseKarat.toPure(w, karat)     → يحوّل إلى بندق 24K
     GMS.BaseKarat.fromPure(pure, karat)→ يحوّل من بندق 24K
     GMS.BaseKarat.on(cb)        → unsubscribe
     GMS.BaseKarat.sync()        → مزامنة مع Supabase
     GMS.BaseKarat.init()        → تحميل + تفعيل
     GMS.BaseKarat.destroy()
     GMS.BaseKarat.state         → state كامل (تشخيص)
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const GMS = window.GMS = window.GMS || {};

  /* ═════════════════════════════════════════════════════════════════════
     §1 · CONSTANTS
     ═════════════════════════════════════════════════════════════════════ */
  const STORAGE_KEY = 'gms.base_karat';
  const BROADCAST_CHANNEL = 'gms-base-karat-sync';
  const FALLBACK_KARAT = 21;

  /* الخيارات المتاحة لعيار الأساس */
  const ALLOWED = [18, 21, 24];

  const LABELS = Object.freeze({
    18: 'عيار 18',
    21: 'عيار 21',
    24: 'عيار 24',
  });

  const LABELS_SHORT = Object.freeze({
    18: '18K',
    21: '21K',
    24: '24K',
  });

  const COLORS = Object.freeze({
    18: '#6b7a95',
    21: '#9c7726',
    24: '#c8a24a',
  });

  const ICONS = Object.freeze({
    18: 'sparkles',
    21: 'gem',
    24: 'crown',
  });

  /* Purity ratios القياسية */
  const RATIOS = Object.freeze({
    18: 0.7500,
    21: 0.8750,
    24: 1.0000,
  });

  /* الألوان المناسبة للأزرار في واجهة الإعدادات */
  const UI_COLORS = Object.freeze({
    18: 'info',
    21: 'warn',
    24: 'primary',
  });

  /* الصلاحيات المسموح لها بالتعديل */
  const ALLOWED_ROLES = Object.freeze([
    'SUPER_ADMIN',
    'BRANCH_MANAGER',
    'ACCOUNTANT',
  ]);

  /* ═════════════════════════════════════════════════════════════════════
     §2 · STATE
     ═════════════════════════════════════════════════════════════════════ */
  const State = {
    current: FALLBACK_KARAT,       /* العيار النشط */
    previous: null,                /* العيار السابق */
    initialized: false,
    loading: false,
    source: 'default',             /* 'default' | 'local' | 'supabase' | 'remote' */

    lastChangedAt: null,
    lastChangedBy: null,
    syncStatus: 'idle',            /* 'idle' | 'syncing' | 'synced' | 'error' | 'local-only' */
    lastError: null,

    listeners: new Set(),
    broadcastChannel: null,
    unsubscribers: [],
  };

  /* ═════════════════════════════════════════════════════════════════════
     §3 · HELPERS
     ═════════════════════════════════════════════════════════════════════ */
  function round(v, d = 4) {
    if (GMS.round) return GMS.round(v, d);
    const p = Math.pow(10, d);
    return Math.round((Number(v) + Number.EPSILON) * p) / p;
  }

  function num(v, fallback = 0) {
    const n = Number(v);
    return isFinite(n) ? n : fallback;
  }

  function isAllowedKarat(k) {
    return ALLOWED.includes(Number(k));
  }

  function currentUser() {
    return {
      id: GMS.Auth?.user?.id || null,
      name: GMS.Auth?.profile?.full_name || 'system',
      role: GMS.Auth?.profile?.role || 'GUEST',
      org_id: GMS.Auth?.profile?.org_id || GMS.Auth?.profile?.tenant_id || null,
    };
  }

  function userCanChange() {
    const role = currentUser().role;
    if (!role || role === 'GUEST') return true;   /* سماح بوضع Demo */
    return ALLOWED_ROLES.includes(role);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §4 · PURITY + CONVERSION
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * نسبة نقاء العيار (قياسي أو مخصص)
   * @param {number} karat — 18|21|24 أو 300..999 أو 0.x
   * @returns {number} 0..1
   */
  function purity(karat) {
    const k = num(karat, 0);

    if (k <= 0) return 0;
    if (RATIOS[k] !== undefined) return RATIOS[k];

    /* عيار مخصص: 300..999 → 0.300..0.999 */
    if (k >= 300 && k <= 999) {
      return round(Math.min(1, Math.max(0, k / 1000)), 4);
    }

    /* نسبة نقاء مباشرة 0..1 */
    if (k > 0 && k <= 1) return round(k, 4);

    /* fallback عبر GMS.karatRatio */
    if (typeof GMS.karatRatio === 'function') {
      const r = GMS.karatRatio(k);
      if (isFinite(r) && r > 0) return r;
    }

    return 0;
  }

  /**
   * تحويل وزن من عيار إلى عيار آخر.
   *   Equivalent Weight = (Weight × purity(from)) / purity(to)
   */
  function convert(weight, fromKarat, toKarat) {
    const w = num(weight, 0);
    if (w === 0) return 0;

    const fromP = purity(fromKarat);
    const toP = purity(toKarat);

    if (fromP <= 0 || toP <= 0) return w;

    return round((w * fromP) / toP, 4);
  }

  /** تحويل إلى العيار النشط */
  function toBase(weight, fromKarat) {
    return convert(weight, fromKarat, State.current);
  }

  /** تحويل من العيار النشط إلى عيار آخر */
  function fromBase(baseWeight, toKarat) {
    return convert(baseWeight, State.current, toKarat);
  }

  /** تحويل إلى بندق 24K */
  function toPure(weight, karat) {
    return convert(weight, karat, 24);
  }

  /** تحويل من بندق 24K إلى عيار */
  function fromPure(pureWeight, karat) {
    return convert(pureWeight, 24, karat);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §5 · STORAGE — LocalStorage
     ═════════════════════════════════════════════════════════════════════ */
  function saveLocal(karat, meta = {}) {
    try {
      const payload = {
        base_karat: karat,
        updated_at: new Date().toISOString(),
        updated_by: meta.updated_by || currentUser().name,
        updated_by_id: meta.updated_by_id || currentUser().id,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      return true;
    } catch (e) {
      console.warn('[BaseKarat.saveLocal]', e);
      return false;
    }
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;

      /* دعم القيم القديمة (رقم مباشر) */
      const parsed = (() => {
        try { return JSON.parse(raw); }
        catch (_) { return raw; }
      })();

      const k = typeof parsed === 'object' && parsed !== null
        ? Number(parsed.base_karat)
        : Number(parsed);

      if (!isAllowedKarat(k)) return null;

      return {
        karat: k,
        updated_at: typeof parsed === 'object' ? parsed.updated_at : null,
        updated_by: typeof parsed === 'object' ? parsed.updated_by : null,
      };
    } catch (e) {
      console.warn('[BaseKarat.loadLocal]', e);
      return null;
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §6 · STORAGE — IndexedDB (metadata)
     ═════════════════════════════════════════════════════════════════════ */
  async function saveIdb(karat) {
    try {
      if (GMS.IDB?.metaSet) {
        await GMS.IDB.metaSet(STORAGE_KEY, {
          base_karat: karat,
          updated_at: new Date().toISOString(),
        });
      }
    } catch (e) {
      /* صامت */
    }
  }

  async function loadIdb() {
    try {
      if (GMS.IDB?.metaGet) {
        const data = await GMS.IDB.metaGet(STORAGE_KEY);
        if (data && isAllowedKarat(data.base_karat)) {
          return Number(data.base_karat);
        }
      }
    } catch (e) {
      /* صامت */
    }
    return null;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §7 · SUPABASE SYNC (اختياري + Resilient)
     ─────────────────────────────────────────────────────────────────────
     - لو RPC مش موجودة → نتخطى بهدوء
     - لو organizations فاضي → نتخطى بهدوء
     - لو ما فيش صلاحية → نتخطى بهدوء
     - في كل الحالات: LocalStorage يشتغل عادي
     ═════════════════════════════════════════════════════════════════════ */
  async function saveSupabase(karat) {
    try {
      if (!GMS.Supabase?.isReady?.()) {
        return { skipped: true, reason: 'no_supabase' };
      }

      const client = GMS.Supabase.get();
      if (!client) return { skipped: true, reason: 'no_client' };

      const { data, error } = await client.rpc('set_base_karat', {
        p_karat: karat,
      });

      /* ── خطأ شبكة/SQL ── */
      if (error) {
        const msg = String(error.message || '');

        /* حالات "غير مُهيّأ" — نتخطى بهدوء */
        const isConfigIssue =
          msg.includes('NO_ORG') ||
          msg.includes('does not exist') ||
          msg.includes('permission denied') ||
          msg.includes('function') ||
          msg.includes('schema') ||
          msg.includes('relation');

        if (isConfigIssue) {
          console.info('[BaseKarat] ☁️ Remote skipped (config):', msg);
          return { skipped: true, reason: msg };
        }

        /* خطأ حقيقي */
        return { success: false, error: error.message };
      }

      /* ── الدالة رجعت success:false ── */
      if (data && data.success === false) {
        if (data.error === 'NO_ORG') {
          console.info('[BaseKarat] ☁️ Remote skipped: NO_ORG (no organizations row)');
          return { skipped: true, reason: 'NO_ORG' };
        }
        if (data.error === 'NOT_ADMIN') {
          console.info('[BaseKarat] ☁️ Remote skipped: NOT_ADMIN');
          return { skipped: true, reason: 'NOT_ADMIN' };
        }
        if (data.error === 'INVALID_KARAT') {
          return { success: false, error: 'INVALID_KARAT' };
        }
        return { success: false, error: data.error || 'RPC returned failure' };
      }

      return { success: true, data };
    } catch (e) {
      console.warn('[BaseKarat.saveSupabase] exception:', e);
      return { skipped: true, reason: e.message };
    }
  }

  async function loadSupabase() {
    try {
      if (!GMS.Supabase?.isReady?.()) return null;

      const client = GMS.Supabase.get();
      if (!client) return null;

      /* RPC: current_base_karat */
      const { data, error } = await client.rpc('current_base_karat');

      if (error) {
        const msg = String(error.message || '');

        const isConfigIssue =
          msg.includes('does not exist') ||
          msg.includes('permission denied') ||
          msg.includes('function') ||
          msg.includes('schema');

        if (isConfigIssue) {
          console.info('[BaseKarat] ☁️ Remote load skipped (config):', msg);
        } else {
          console.warn('[BaseKarat.loadSupabase] RPC failed:', msg);
        }
        return null;
      }

      const k = Number(data);
      return isAllowedKarat(k) ? k : null;
    } catch (e) {
      console.warn('[BaseKarat.loadSupabase]', e);
      return null;
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §8 · EVENTS — Local + Broadcast
     ═════════════════════════════════════════════════════════════════════ */
  function notifyListeners(payload) {
    State.listeners.forEach(fn => {
      try { fn(payload); }
      catch (e) { console.warn('[BaseKarat.listener]', e); }
    });
  }

  function dispatchWindowEvent(payload) {
    try {
      window.dispatchEvent(new CustomEvent('gms:baseKaratChanged', {
        detail: payload,
      }));
    } catch (_) {}
  }

  function broadcastChange(payload) {
    try {
      if (!State.broadcastChannel && typeof BroadcastChannel !== 'undefined') {
        State.broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL);
        State.broadcastChannel.onmessage = (e) => {
          if (e.data?.type === 'BASE_KARAT_CHANGED') {
            applyRemoteChange(e.data.payload);
          }
        };
      }

      State.broadcastChannel?.postMessage?.({
        type: 'BASE_KARAT_CHANGED',
        payload,
        at: Date.now(),
      });
    } catch (_) {}
  }

  function applyRemoteChange(payload) {
    try {
      if (!payload || !isAllowedKarat(payload.current)) return;
      if (payload.current === State.current) return;

      const previous = State.current;
      State.current = payload.current;
      State.previous = previous;
      State.source = 'remote';
      State.lastChangedAt = new Date().toISOString();
      State.lastChangedBy = payload.changedBy || 'remote';

      notifyListeners(buildPayload(previous));
      dispatchWindowEvent(buildPayload(previous));

      console.log(`[BaseKarat] 🔄 Remote change: ${previous}K → ${State.current}K`);
    } catch (e) {
      console.warn('[BaseKarat.applyRemoteChange]', e);
    }
  }

  function buildPayload(previous) {
    return {
      current: State.current,
      previous: previous ?? State.previous,
      ratio: State.current === 24 ? 1 : RATIOS[State.current],
      label: LABELS[State.current],
      labelShort: LABELS_SHORT[State.current],
      color: COLORS[State.current],
      changedAt: State.lastChangedAt,
      changedBy: State.lastChangedBy,
      source: State.source,
    };
  }

  /* ═════════════════════════════════════════════════════════════════════
     §9 · UPDATE SYSTEM CACHE
     ═════════════════════════════════════════════════════════════════════ */
  function updateSystemCache() {
    try {
      if (GMS.Cache?.ls?.set) {
        GMS.Cache.ls.set('base_karat', {
          value: State.current,
          ratio: RATIOS[State.current],
          label: LABELS[State.current],
          updated_at: new Date().toISOString(),
        });
      }
    } catch (_) {}
  }

  /* ═════════════════════════════════════════════════════════════════════
     §10 · MAIN PUBLIC: SET
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * تغيير عيار الأساس
   * @param {number} karat — 18 | 21 | 24
   * @param {Object} [opts]
   * @param {boolean} [opts.silent=false]
   * @param {boolean} [opts.skipRemote=false]
   * @returns {Promise<{success:boolean, current?:number, previous?:number, error?:string, skipped?:string}>}
   */
  async function set(karat, opts = {}) {
    const { silent = false, skipRemote = false } = opts;
    const next = Number(karat);

    /* 1 · Validate */
    if (!isAllowedKarat(next)) {
      return {
        success: false,
        error: `عيار غير صالح: ${next} (المسموح: 18, 21, 24)`,
      };
    }

    /* 2 · Permission */
    if (!userCanChange()) {
      return {
        success: false,
        error: 'ليس لديك صلاحية تغيير عيار الأساس',
      };
    }

    /* 3 · No-op */
    if (next === State.current) {
      return {
        success: true,
        current: State.current,
        previous: State.current,
        unchanged: true,
      };
    }

    /* 4 · Loading guard */
    if (State.loading) {
      return { success: false, error: 'التحديث جارٍ بالفعل' };
    }

    State.loading = true;
    State.syncStatus = 'syncing';
    State.lastError = null;

    const previous = State.current;
    let remoteSkipReason = null;

    try {
      /* 5 · Supabase (اختياري — لا يوقف العملية لو فشل التهيئة) */
      if (!skipRemote) {
        const remoteResult = await saveSupabase(next);

        /* ✅ نتوقف فقط عند فشل حقيقي (مش skip) */
        const isRealFailure =
          remoteResult &&
          remoteResult.success === false &&
          !remoteResult.skipped;

        if (isRealFailure) {
          State.loading = false;
          State.syncStatus = 'error';
          State.lastError = remoteResult.error || 'فشل حفظ الإعداد في السحابة';
          return {
            success: false,
            error: State.lastError,
            previous,
          };
        }

        /* لو تم التخطي — نسجّل السبب لكن نكمل */
        if (remoteResult?.skipped) {
          remoteSkipReason = remoteResult.reason;
          console.info('[BaseKarat] → Local-only mode:', remoteSkipReason);
          State.syncStatus = 'local-only';
        }
      }

      /* 6 · Update state */
      State.current = next;
      State.previous = previous;
      State.source = remoteSkipReason ? 'local' : 'supabase';
      State.lastChangedAt = new Date().toISOString();
      State.lastChangedBy = currentUser().name;

      if (!remoteSkipReason) {
        State.syncStatus = 'synced';
      }

      /* 7 · Persist */
      saveLocal(next, {
        updated_by: currentUser().name,
        updated_by_id: currentUser().id,
      });
      await saveIdb(next);
      updateSystemCache();

      /* 8 · Notify */
      const payload = buildPayload(previous);

      if (!silent) {
        notifyListeners(payload);
        dispatchWindowEvent(payload);
        broadcastChange(payload);

        /* Beep */
        GMS.Beep?.complete?.();

        /* Toast */
        GMS.Toast?.ok?.(
          `عيار الأساس: ${LABELS[next]}`,
          `نقاء ${RATIOS[next].toFixed(4)} — تم التحديث في كل الواجهات`
        );
      }

      /* 9 · Audit */
      if (GMS.Audit?.log) {
        try {
          await GMS.Audit.log(
            'UPDATE',
            'settings',
            STORAGE_KEY,
            `تغيير عيار الأساس: ${LABELS[previous]} → ${LABELS[next]}`,
            {
              previous,
              current: next,
              ratio: RATIOS[next],
              changed_by: currentUser().id,
              remote_skipped: Boolean(remoteSkipReason),
            }
          );
        } catch (_) {}
      }

      console.log(
        `%c⚖️ Base Karat: ${previous}K → ${next}K` +
        (remoteSkipReason ? ` (local-only: ${remoteSkipReason})` : ''),
        'color:#a55a00;font-weight:900;font-size:13px;'
      );

      return {
        success: true,
        current: State.current,
        previous,
        ratio: RATIOS[next],
        skipped: remoteSkipReason || undefined,
      };

    } catch (e) {
      console.error('[BaseKarat.set]', e);
      State.syncStatus = 'error';
      State.lastError = e.message;

      /* Rollback */
      State.current = previous;

      return {
        success: false,
        error: e.message,
        previous,
      };
    } finally {
      State.loading = false;
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §11 · SYNC (manual)
     ═════════════════════════════════════════════════════════════════════ */
  async function sync() {
    try {
      State.syncStatus = 'syncing';

      const remote = await loadSupabase();

      if (remote && isAllowedKarat(remote) && remote !== State.current) {
        const previous = State.current;
        State.current = remote;
        State.previous = previous;
        State.source = 'supabase';
        State.lastChangedAt = new Date().toISOString();

        saveLocal(remote, { updated_by: 'supabase-sync' });
        updateSystemCache();

        const payload = buildPayload(previous);
        notifyListeners(payload);
        dispatchWindowEvent(payload);
        broadcastChange(payload);

        console.log(`[BaseKarat] ☁️ Synced: ${previous}K → ${remote}K`);
      }

      State.syncStatus = 'synced';
      return {
        success: true,
        current: State.current,
        source: State.source,
      };
    } catch (e) {
      State.syncStatus = 'error';
      State.lastError = e.message;
      console.warn('[BaseKarat.sync]', e);
      return { success: false, error: e.message };
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §12 · EVENT SUBSCRIPTION
     ═════════════════════════════════════════════════════════════════════ */
  function on(callback) {
    if (typeof callback !== 'function') return () => {};
    State.listeners.add(callback);
    return () => State.listeners.delete(callback);
  }

  function off(callback) {
    State.listeners.delete(callback);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §13 · INIT
     ═════════════════════════════════════════════════════════════════════ */
  async function init() {
    if (State.initialized) return State.current;

    console.log(
      '%c⚖️ BaseKarat initializing…',
      'color:#a55a00;font-weight:800;font-size:12px;'
    );

    try {
      /* 1 · LocalStorage أولاً (سريع) */
      const local = loadLocal();
      if (local && isAllowedKarat(local.karat)) {
        State.current = local.karat;
        State.lastChangedAt = local.updated_at || null;
        State.lastChangedBy = local.updated_by || null;
        State.source = 'local';
      }

      /* 2 · IndexedDB (fallback لو ما في LocalStorage) */
      if (!local) {
        const idbK = await loadIdb();
        if (idbK && isAllowedKarat(idbK)) {
          State.current = idbK;
          State.source = 'local';
          saveLocal(idbK, { updated_by: 'idb-restore' });
        }
      }

      /* 3 · Supabase (مصدر الحقيقة النهائي) */
      try {
        const remote = await loadSupabase();
        if (remote && isAllowedKarat(remote)) {
          if (remote !== State.current) {
            console.log(`[BaseKarat] ☁️ Server override: ${State.current}K → ${remote}K`);
          }
          State.current = remote;
          State.source = 'supabase';
          saveLocal(remote, { updated_by: 'supabase-init' });
          await saveIdb(remote);
        }
      } catch (_) {}

      /* 4 · Init cache */
      updateSystemCache();

      /* 5 · Setup BroadcastChannel + storage listener */
      if (typeof BroadcastChannel !== 'undefined') {
        State.broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL);
        State.broadcastChannel.onmessage = (e) => {
          if (e.data?.type === 'BASE_KARAT_CHANGED') {
            applyRemoteChange(e.data.payload);
          }
        };
      }

      const storageHandler = (e) => {
        if (e.key === STORAGE_KEY && e.newValue) {
          try {
            const parsed = JSON.parse(e.newValue);
            const k = Number(parsed?.base_karat ?? parsed);
            if (isAllowedKarat(k) && k !== State.current) {
              applyRemoteChange({ current: k, changedBy: parsed?.updated_by });
            }
          } catch (_) {}
        }
      };

      window.addEventListener('storage', storageHandler);
      State.unsubscribers.push(() =>
        window.removeEventListener('storage', storageHandler)
      );

      /* 6 · Cross-window custom event */
      const customHandler = (e) => {
        if (e.detail?.current && e.detail.current !== State.current) {
          applyRemoteChange(e.detail);
        }
      };
      window.addEventListener('gms:baseKaratChanged', customHandler);
      State.unsubscribers.push(() =>
        window.removeEventListener('gms:baseKaratChanged', customHandler)
      );

      State.initialized = true;
      State.syncStatus = 'synced';

      console.log(
        `%c✅ BaseKarat ready: ${State.current}K (purity ${RATIOS[State.current].toFixed(4)}) · source: ${State.source}`,
        'color:#0f7a43;font-weight:800;font-size:12px;'
      );

      /* Notify initial subscribers */
      setTimeout(() => {
        const payload = buildPayload(null);
        notifyListeners(payload);
        dispatchWindowEvent(payload);
      }, 0);

      return State.current;

    } catch (e) {
      console.error('[BaseKarat.init]', e);
      State.lastError = e.message;
      State.initialized = true;
      return State.current;
    }
  }

  function destroy() {
    try { State.broadcastChannel?.close?.(); } catch (_) {}
    State.broadcastChannel = null;

    State.unsubscribers.forEach(fn => {
      try { fn(); } catch (_) {}
    });
    State.unsubscribers = [];
    State.listeners.clear();
    State.initialized = false;

    console.log('[BaseKarat] 🛑 Destroyed');
  }

  /* ═════════════════════════════════════════════════════════════════════
     §14 · DIAGNOSTICS
     ═════════════════════════════════════════════════════════════════════ */
  function getDiagnostics() {
    return {
      current: State.current,
      previous: State.previous,
      ratio: RATIOS[State.current],
      label: LABELS[State.current],
      initialized: State.initialized,
      loading: State.loading,
      source: State.source,
      syncStatus: State.syncStatus,
      lastError: State.lastError,
      lastChangedAt: State.lastChangedAt,
      lastChangedBy: State.lastChangedBy,
      allowedRoles: ALLOWED_ROLES.slice(),
      listeners: State.listeners.size,
      canChange: userCanChange(),
    };
  }

  /* ═════════════════════════════════════════════════════════════════════
     §15 · PUBLIC API
     ═════════════════════════════════════════════════════════════════════ */
  const OPTIONS = Object.freeze([
    {
      value: 24,
      ratio: RATIOS[24],
      label: LABELS[24],
      labelShort: LABELS_SHORT[24],
      color: UI_COLORS[24],
      hex: COLORS[24],
      icon: ICONS[24],
      description: 'البندق الخالص — أعلى دقة',
    },
    {
      value: 21,
      ratio: RATIOS[21],
      label: LABELS[21],
      labelShort: LABELS_SHORT[21],
      color: UI_COLORS[21],
      hex: COLORS[21],
      icon: ICONS[21],
      description: 'الأكثر شيوعاً في السوق المصري',
    },
    {
      value: 18,
      ratio: RATIOS[18],
      label: LABELS[18],
      labelShort: LABELS_SHORT[18],
      color: UI_COLORS[18],
      hex: COLORS[18],
      icon: ICONS[18],
      description: 'شائع في المشغولات الأوروبية',
    },
  ]);

  const BaseKarat = {
    /* Getters */
    get current() { return State.current; },
    get ratio() { return RATIOS[State.current] || 0.875; },
    get label() { return LABELS[State.current] || 'عيار 21'; },
    get labelShort() { return LABELS_SHORT[State.current] || '21K'; },
    get color() { return COLORS[State.current] || '#9c7726'; },
    get initialized() { return State.initialized; },
    get state() { return State; },
    get isDefault() { return State.current === FALLBACK_KARAT; },

    /* Constants */
    OPTIONS,
    LABELS,
    LABELS_SHORT,
    COLORS,
    RATIOS,
    ALLOWED,
    FALLBACK: FALLBACK_KARAT,
    STORAGE_KEY,

    /* Core methods */
    init,
    destroy,
    set,
    sync,
    on,
    off,

    /* Conversion */
    purity,
    convert,
    toBase,
    fromBase,
    toPure,
    fromPure,

    /* UI helpers */
    isAllowed: isAllowedKarat,
    canChange: userCanChange,
    getDiagnostics,

    /**
     * نص عرض واضح للعيار النشط (للاستخدام في التسميات)
     * @returns {string}  "21K Equivalent" | "عيار 21 (معادل)"
     */
    displayLabel(lang) {
      const l = lang || (GMS.I18n?.lang) || 'ar';
      if (l === 'en') return `${LABELS_SHORT[State.current]} Equivalent`;
      return `${LABELS[State.current]} (معادل)`;
    },

    /**
     * نص مختصر للتسميات الضيقة
     */
    displayLabelShort() {
      return LABELS_SHORT[State.current];
    },

    /**
     * عنصر OPTIONS الحالي كاملاً
     */
    get currentOption() {
      return OPTIONS.find(o => o.value === State.current) || OPTIONS[1];
    },
  };

  /* Export */
  GMS.BaseKarat = BaseKarat;
  window.BaseKarat = BaseKarat;

  /* ═════════════════════════════════════════════════════════════════════
     §16 · AUTO-INIT
     ═════════════════════════════════════════════════════════════════════ */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      init().catch(e => console.warn('[BaseKarat] init failed:', e));
    });
  } else {
    setTimeout(() => {
      init().catch(e => console.warn('[BaseKarat] init failed:', e));
    }, 100);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §17 · LOADED CONFIRMATION
     ═════════════════════════════════════════════════════════════════════ */
  console.log(
    '%c⚖️  BaseKarat v1.0.1 loaded · Resilient Local-First Mode',
    'color:#a55a00;font-weight:900;font-size:13px;padding:2px 6px;' +
    'background:linear-gradient(135deg,#f0d68c,#9c7726);border-radius:4px;'
  );

  console.log(
    '%c🔁 Options: 18K (0.75) · 21K (0.875) · 24K (1.000) · Reactive + Cross-Tab',
    'color:#6b7a95;font-weight:700;font-size:11px;'
  );

  console.log(
    '%c📖 API: GMS.BaseKarat.set(21) · .convert(w, from, to) · .toBase(w, from) · .on(cb)',
    'color:#1c4fd8;font-weight:700;font-size:11px;'
  );

  console.log(
    '%c☁️  Supabase missing config → silently falls back to LocalStorage (no crash)',
    'color:#0f7a43;font-weight:700;font-size:11px;'
  );

})();
