/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ENTERPRISE — js/31-base-karat.js
   Base Karat Standardization — Dynamic Gold Unit Conversion
   ─────────────────────────────────────────────────────────────────────
   • Reads/writes organizations.base_karat via Supabase
   • Persists to localStorage for instant boot
   • Reactive event bus: "gms:baseKaratChanged"
   • Zero impact on stored data — display-only conversion
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const GMS = window.GMS = window.GMS || {};

  /* ─────────────────────────────────────────────────────────────────
     §1 · State
     ───────────────────────────────────────────────────────────────── */
  const S = {
    baseKarat: 21,
    loaded: false,
    listeners: new Set(),
    lastUpdatedAt: null,
  };

  const KARAT_OPTIONS = Object.freeze([
    { value: 24, label: 'عيار 24 (نقي 100%)',  ratio: 1.0000, color: 'primary' },
    { value: 21, label: 'عيار 21 (نقاء 87.5%)', ratio: 0.8750, color: 'warn'    },
    { value: 18, label: 'عيار 18 (نقاء 75%)',   ratio: 0.7500, color: 'info'    },
  ]);

  const KARAT_LABELS = Object.freeze({
    24: 'عيار 24',
    21: 'عيار 21',
    18: 'عيار 18',
  });

  /* ─────────────────────────────────────────────────────────────────
     §2 · Helpers
     ───────────────────────────────────────────────────────────────── */
  function round(v, d = 4) {
    return GMS.round ? GMS.round(v, d)
      : Math.round((Number(v) + Number.EPSILON) * Math.pow(10, d)) / Math.pow(10, d);
  }

  function karatPurity(karat) {
    const k = Number(karat);
    if (!isFinite(k) || k <= 0) return 0;
    if (GMS.karatRatio) {
      const r = GMS.karatRatio(k);
      if (r > 0) return r;
    }
    if (k >= 300 && k <= 999) return round(k / 1000, 4);
    if (k > 0 && k <= 1) return round(k, 4);
    return 0;
  }

  function currentOrgId() {
    try {
      return GMS.Auth?.profile?.organization_id
          || GMS.Auth?.profile?.default_org_id
          || null;
    } catch (_) { return null; }
  }

  /* ─────────────────────────────────────────────────────────────────
     §3 · Conversion Core
     ───────────────────────────────────────────────────────────────── */
  function convert(weight, fromKarat, toKarat) {
    const w  = Number(weight) || 0;
    const tk = Number(toKarat) || S.baseKarat || 21;
    const fk = Number(fromKarat) || 21;

    if (!tk) return w;

    const fromPurity = karatPurity(fk);
    const toPurity   = karatPurity(tk);

    if (fromPurity === 0 || toPurity === 0) return w;

    return round((w * fromPurity) / toPurity, 4);
  }

  function toBase(weight, fromKarat) {
    return convert(weight, fromKarat, S.baseKarat);
  }

  function toPure24(weight, fromKarat) {
    return convert(weight, fromKarat, 24);
  }

  function fromPureToBase(pureWeight) {
    return convert(pureWeight, 24, S.baseKarat);
  }

  /* ─────────────────────────────────────────────────────────────────
     §4 · Aggregate — يحوّل أي مصفوفة أصناف لعيار الأساس
     ───────────────────────────────────────────────────────────────── */
  function aggregate(items, opts = {}) {
    const { price24 = null } = opts;
    let count = 0, net = 0, pure = 0, converted = 0, value = 0;

    (items || []).forEach(item => {
      const qty  = Number(item.quantity) || 1;
      const k    = Number(item.karat) || 21;
      const n    = Number(item.net_weight)  || 0;
      const p    = Number(item.pure_weight) || 0;
      const v    = Number(item.total_cost)  || 0;

      count     += qty;
      net       += n * qty;
      pure      += p * qty;
      converted += toBase(n, k) * qty;
      value     += v * qty;
    });

    return {
      count,
      totalNet:      round(net, 3),
      totalPure:     round(pure, 4),
      totalConverted:round(converted, 4),
      totalValue:    round(value, 2),
      baseKarat:     S.baseKarat,
      baseLabel:     KARAT_LABELS[S.baseKarat] || `عيار ${S.baseKarat}`,
    };
  }

  /* ─────────────────────────────────────────────────────────────────
     §5 · Persistence (Supabase + localStorage)
     ───────────────────────────────────────────────────────────────── */
  function persistLocal() {
    try {
      localStorage.setItem('gms.base_karat', String(S.baseKarat));
      localStorage.setItem('gms.base_karat.updated', String(Date.now()));
    } catch (_) {}
  }

  function loadLocal() {
    try {
      const v = Number(localStorage.getItem('gms.base_karat'));
      const u = Number(localStorage.getItem('gms.base_karat.updated')) || 0;
      if ([18, 21, 24].includes(v)) {
        S.baseKarat = v;
        S.lastUpdatedAt = u;
      }
    } catch (_) {}
  }

  async function load() {
    loadLocal();

    /* Supabase fetch (best-effort) */
    const orgId = currentOrgId();
    if (orgId && GMS.Supabase?.isReady?.()) {
      try {
        const client = GMS.Supabase.get();
        const { data, error } = await client
          .from('organizations')
          .select('base_karat')
          .eq('id', orgId)
          .maybeSingle();

        if (!error && data?.base_karat) {
          const k = Number(data.base_karat);
          if ([18, 21, 24].includes(k)) {
            S.baseKarat = k;
            persistLocal();
            console.log(`[BaseKarat] ☁️ Loaded from Supabase: ${k}K`);
          }
        }
      } catch (e) {
        console.warn('[BaseKarat] Supabase load failed:', e.message);
      }
    } else {
      console.log(`[BaseKarat] ⚙️ Offline — using cached: ${S.baseKarat}K`);
    }

    S.loaded = true;
    notify({ silent: true });
    return S.baseKarat;
  }

  /**
   * Update base karat — with permission + validation
   * @param {number} karat 18|21|24
   * @returns {Promise<{success:boolean, error?:string}>}
   */
  async function set(karat) {
    const k = Number(karat);

    if (![18, 21, 24].includes(k)) {
      return { success: false, error: 'عيار غير صالح — اختر 18 أو 21 أو 24' };
    }

    if (k === S.baseKarat) {
      return { success: true, unchanged: true };
    }

    /* Permission check */
    const role = GMS.Auth?.profile?.role;
    const isAdmin = role === 'SUPER_ADMIN' || role === 'BRANCH_MANAGER' || role === 'ACCOUNTANT';
    if (!isAdmin) {
      return { success: false, error: 'غير مصرح — هذه الصلاحية للمدير فقط' };
    }

    const previous = S.baseKarat;
    S.baseKarat = k;      // optimistic
    persistLocal();

    /* Supabase RPC */
    if (GMS.Supabase?.isReady?.()) {
      try {
        const client = GMS.Supabase.get();
        const { data, error } = await client.rpc('set_base_karat', { p_karat: k });

        if (error) throw error;

        if (data && data.success === false) {
          throw new Error(data.error || 'RPC rejected');
        }
      } catch (e) {
        console.warn('[BaseKarat] Supabase update failed:', e.message);
        S.baseKarat = previous;   // rollback
        persistLocal();
        return { success: false, error: e.message };
      }
    }

    /* Audit */
    if (GMS.Audit) {
      try {
        await GMS.Audit.log(
          'UPDATE', 'settings', null,
          `تغيير عيار الأساس من ${previous}K إلى ${k}K`,
          { base_karat_before: previous, base_karat_after: k }
        );
      } catch (_) {}
    }

    notify();
    return { success: true, baseKarat: k, previous };
  }

  /* ─────────────────────────────────────────────────────────────────
     §6 · Reactive Event Bus
     ───────────────────────────────────────────────────────────────── */
  function on(cb) {
    if (typeof cb !== 'function') return () => {};
    S.listeners.add(cb);
    return () => S.listeners.delete(cb);
  }

  function notify({ silent = false } = {}) {
    const payload = {
      baseKarat: S.baseKarat,
      label: KARAT_LABELS[S.baseKarat] || `عيار ${S.baseKarat}`,
      ratio: karatPurity(S.baseKarat),
    };

    S.listeners.forEach(fn => {
      try { fn(payload); } catch (e) { console.warn('[BaseKarat.listener]', e); }
    });

    try {
      window.dispatchEvent(new CustomEvent('gms:baseKaratChanged', { detail: payload }));
    } catch (_) {}

    /* Auto-rerender relevant views */
    if (!silent && GMS.Router?.currentId) {
      const route = GMS.Router.currentId();
      if (['dashboard', 'inventory', 'accounting', 'analytics'].includes(route)) {
        setTimeout(() => {
          try { GMS.Router.reload({ force: true }); } catch (_) {}
        }, 200);
      }
    }
  }

  /* ─────────────────────────────────────────────────────────────────
     §7 · Formatting Helpers
     ───────────────────────────────────────────────────────────────── */
  function fmtBase(weight, decimals = 3) {
    const w = Number(weight) || 0;
    const unit = GMS.gramFmt ? GMS.gramFmt(w) : w.toFixed(decimals);
    return `${unit} جم`;
  }

  function labelBase() {
    return KARAT_LABELS[S.baseKarat] || `عيار ${S.baseKarat}`;
  }

  function labelBaseShort() {
    return `${S.baseKarat}K`;
  }

  /* ─────────────────────────────────────────────────────────────────
     §8 · Public API
     ───────────────────────────────────────────────────────────────── */
  GMS.BaseKarat = {
    /* Getters */
    get current()   { return S.baseKarat; },
    get label()     { return labelBase(); },
    get labelShort(){ return labelBaseShort(); },
    get ratio()     { return karatPurity(S.baseKarat); },
    get loaded()    { return S.loaded; },
    get lastUpdatedAt() { return S.lastUpdatedAt; },

    /* Constants */
    OPTIONS: KARAT_OPTIONS,
    LABELS: KARAT_LABELS,

    /* Core math */
    karatPurity,
    convert,
    toBase,
    toPure24,
    fromPureToBase,
    aggregate,

    /* Persistence */
    load,
    set,

    /* Reactivity */
    on,
    notify,

    /* Formatting */
    fmtBase,
    labelBase,
  };

  /* ─────────────────────────────────────────────────────────────────
     §9 · Auto-boot
     ───────────────────────────────────────────────────────────────── */
  function scheduleBoot() {
    /* Wait for auth to be ready */
    if (!GMS.Auth?.profile) {
      setTimeout(scheduleBoot, 500);
      return;
    }
    load().catch(e => console.warn('[BaseKarat] boot failed:', e));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(scheduleBoot, 1200));
  } else {
    setTimeout(scheduleBoot, 1200);
  }

  console.log(
    '%c⚖️ Base Karat Module loaded',
    'color:#0f7a43;font-weight:900;font-size:12px;padding:2px 6px;' +
    'background:#e6f6ee;border-radius:4px;'
  );

})();