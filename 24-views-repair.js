/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ENTERPRISE — js/24-views-repair.js
   موديول الصيانة والورشة والتعديلات:
     - استلام القطع بـ QR (Inbound Ticket)
     - تضييق المقاسات (Shrinking / Cutting)
     - توسيع المقاسات (Expanding)
     - ركوب وتثبيت الفصوص (Stone Setting)
     - لحام وتصليح عام (Soldering / General Repair)
     - تلميع وتحميم (Polishing)
     - مطابقة الوزن عند التسليم + محرّك الهالك
     - Dual Ledger Settlement (ذهب صافي 24K + نقد EGP)
     - طباعة إيصالات استلام/تسليم
     - تصدير Excel + دفتر تشغيل
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const GMS = window.GMS = window.GMS || {};

  /* ═════════════════════════════════════════════════════════════════════
     §1 · CONSTANTS
     ═════════════════════════════════════════════════════════════════════ */

  /* حدود خسس الصيانة (Repair Tolerance) — معيار السوق المصري */
  const REPAIR_TOLERANCE = Object.freeze({
    naturalMin: 0.00,   // يمكن أن يكون سالباً (زيادة نادرة)
    naturalMax: 0.50,   // 0.5% طبيعي
    warningMax: 1.00,   // 1% يستدعي المراقبة
  });

  /* أنواع خدمات الصيانة */
  const SERVICE_TYPES = Object.freeze({
    repair: {
      key: 'repair',
      label: 'تصليح عام / لحام',
      labelEn: 'General Repair',
      icon: 'wrench',
      color: 'info',
      hasGoldChange: false,
      defaultFee: 50,
    },
    expanding: {
      key: 'expanding',
      label: 'توسيع مقاس',
      labelEn: 'Expanding',
      icon: 'maximize-2',
      color: 'success',
      hasGoldChange: 'add',
      defaultFee: 80,
    },
    shrinking: {
      key: 'shrinking',
      label: 'تضييق مقاس',
      labelEn: 'Shrinking',
      icon: 'minimize-2',
      color: 'warn',
      hasGoldChange: 'cut',
      defaultFee: 70,
    },
    stone_setting: {
      key: 'stone_setting',
      label: 'ركوب فصوص',
      labelEn: 'Stone Setting',
      icon: 'gem',
      color: 'violet',
      hasGoldChange: false,
      defaultFee: 100,
    },
    polishing: {
      key: 'polishing',
      label: 'تلميع وتحميم',
      labelEn: 'Polishing',
      icon: 'sparkles',
      color: 'teal',
      hasGoldChange: false,
      defaultFee: 40,
    },
  });

  /* حالات تكت الصيانة (Lifecycle) */
  const TICKET_STATUS = Object.freeze({
    RECEIVED:    { key: 'RECEIVED',    label: 'مستلم',       icon: 'inbox',          cls: 'pill-amber',  color: 'warn'    },
    IN_PROGRESS: { key: 'IN_PROGRESS', label: 'قيد الصيانة', icon: 'hammer',         cls: 'pill-blue',   color: 'info'    },
    READY:       { key: 'READY',       label: 'جاهز',         icon: 'package-check',  cls: 'pill-violet', color: 'violet'  },
    DELIVERED:   { key: 'DELIVERED',   label: 'مُسلَّم',       icon: 'check-circle-2', cls: 'pill-green',  color: 'success' },
    CANCELLED:   { key: 'CANCELLED',   label: 'ملغى',         icon: 'x-circle',       cls: 'pill-gray',   color: 'muted'   },
  });

  /* خيارات التصرف في الذهب المقصوص */
  const CUT_DISPOSITION = Object.freeze({
    return_to_customer: {
      key: 'return_to_customer',
      label: 'يُرجَع للعميل كـ كسر',
      labelEn: 'Return to Customer',
      icon: 'rotate-ccw',
      description: 'يُسلَّم الكسر للعميل مع القطعة، لا خصم من الفاتورة',
    },
    shop_keeps: {
      key: 'shop_keeps',
      label: 'يُدخَل خزنة كسر المحل',
      labelEn: 'Shop Keeps',
      icon: 'vault',
      description: 'يُخصم من قيمة الفاتورة بسعر الكسر (هامش الشراء)',
    },
  });

  /* مفاتيح التخزين */
  const LS_KEY = 'gms.repair.tickets';
  const LS_WALLET_KEY = 'gms.repair.scrapVault'; // خزنة كسر الصيانة
  const MAX_TICKETS = 500;

  /* ═════════════════════════════════════════════════════════════════════
     §2 · STATE
     ═════════════════════════════════════════════════════════════════════ */
  const RState = {
    activeTab: 'intake',
    tickets: [],
    scrapVault: [],
    filtered: [],
    page: 1,
    pageSize: 25,
    totalPages: 1,

    filters: {
      search: '',
      status: '',
      service: '',
      dateFrom: '',
      dateTo: '',
    },

    stats: {
      total: 0,
      received: 0,
      inProgress: 0,
      ready: 0,
      delivered: 0,
      cancelled: 0,
      totalCashRevenue: 0,
      totalAddedGold: 0,
      totalCutGold: 0,
      suspiciousLosses: 0,
      scrapVaultGold: 0,
    },

    intake: null,      // يُبنى عند فتح modal الاستلام
    delivery: null,    // يُبنى عند فتح modal التسليم

    unsubscribers: [],
    timers: { search: null, recalc: null },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §3 · HELPERS
     ═════════════════════════════════════════════════════════════════════ */

  function getPrice24() {
    if (GMS.Cache?.getPrice) {
      const p = GMS.Cache.getPrice();
      if (p?.price_24) return Number(p.price_24);
    }
    return GMS.APP_CONFIG?.DEFAULT_PRICE_24 || 4500;
  }

  function getScrapBuyPrice() {
    let margin = 8;
    try {
      const saved = Number(localStorage.getItem(
        (GMS.LS_KEYS && GMS.LS_KEYS.BUY_MARGIN) || 'gms.buyback.margin'
      ));
      if (isFinite(saved) && saved >= 0 && saved < 30) margin = saved;
    } catch (_) {}
    return GMS.round(getPrice24() * (1 - margin / 100), 2);
  }

  function getRepairTolerance() {
    try {
      const saved = JSON.parse(
        localStorage.getItem(
          (GMS.LS_KEYS && GMS.LS_KEYS.TOLERANCES) || 'gms.loss.tolerances'
        ) || 'null'
      );
      if (saved && saved.repair) return saved.repair;
    } catch (_) {}
    return REPAIR_TOLERANCE;
  }

  function generateTicketNo() {
    const d = new Date();
    const stamp =
      String(d.getFullYear()).slice(2) +
      String(d.getMonth() + 1).padStart(2, '0') +
      String(d.getDate()).padStart(2, '0') + '-' +
      String(d.getHours()).padStart(2, '0') +
      String(d.getMinutes()).padStart(2, '0');
    const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
    return `RP-${stamp}-${rand}`;
  }

  function sanitizeNumber(v, fallback = 0) {
    const n = parseFloat(v);
    return isFinite(n) ? n : fallback;
  }

  function setText(selector, value) {
    const el = document.querySelector(selector);
    if (el && el.textContent !== String(value)) el.textContent = String(value);
  }

  function cleanupListeners() {
    RState.unsubscribers.forEach(fn => {
      try { fn(); } catch (_) {}
    });
    RState.unsubscribers = [];
    clearTimeout(RState.timers.search);
    clearTimeout(RState.timers.recalc);
  }

  /* ─────────────────────────────────────────────────────────────────
     محرّك التسامح
     ───────────────────────────────────────────────────────────────── */
  function evaluateRepairTolerance(lossPct) {
    const t = getRepairTolerance();
    const abs = Math.abs(Number(lossPct) || 0);

    if (abs < t.naturalMin) {
      return {
        severity: 'low',
        severityMeta: GMS.LOSS_SEVERITY?.low || { label: 'أقل من الطبيعي', cls: 'pill-blue', icon: 'alert-circle' },
        interpretation: `أقل من الحد الطبيعي (${t.naturalMin}% – ${t.naturalMax}%)`,
        isSuspicious: false,
      };
    }
    if (abs <= t.naturalMax) {
      return {
        severity: 'natural',
        severityMeta: GMS.LOSS_SEVERITY?.natural || { label: 'طبيعي', cls: 'pill-green', icon: 'check-circle-2' },
        interpretation: `داخل النطاق الطبيعي (${t.naturalMin}% – ${t.naturalMax}%)`,
        isSuspicious: false,
      };
    }
    if (abs <= t.warningMax) {
      return {
        severity: 'warning',
        severityMeta: GMS.LOSS_SEVERITY?.warning || { label: 'يستدعي المراقبة', cls: 'pill-amber', icon: 'alert-triangle' },
        interpretation: `خسس مرتفع — يستدعي المراقبة (حد الأمان: ${t.warningMax}%)`,
        isSuspicious: false,
      };
    }
    return {
      severity: 'suspicious',
      severityMeta: GMS.LOSS_SEVERITY?.suspicious || { label: 'غير طبيعي', cls: 'pill-red', icon: 'shield-alert' },
      interpretation: `⚠ خسس غير طبيعي — تجاوز حد الأمان (${t.warningMax}%) — احتمالية تسريب`,
      isSuspicious: true,
    };
  }

  /* ─────────────────────────────────────────────────────────────────
     المعادلة المعيارية للوزن
     Expected_out_net = Win_net + Added_net − Cut_net
     Expected_out_pure = Win_pure + (Added_net × P_added) − (Cut_net × P_cut)
     ───────────────────────────────────────────────────────────────── */
  function computeExpectedOut(ticket) {
    const services = ticket.services || {};

    const wInNet = Number(ticket.weight_in_net || 0);
    const wInPure = Number(ticket.weight_in_pure || 0);
    const karatIn = Number(ticket.karat_in || 21);

    // Gold added (expanding)
    let addedNet = 0;
    let addedPure = 0;
    let addedKarat = null;
    if (services.expanding?.enabled) {
      addedNet = GMS.round(Number(services.expanding.addedGross || 0), 3);
      addedKarat = Number(services.expanding.addedKarat || karatIn);
      addedPure = GMS.round(addedNet * GMS.karatRatio(addedKarat), 4);
    }

    // Gold cut (shrinking)
    let cutNet = 0;
    let cutPure = 0;
    let cutKarat = null;
    if (services.shrinking?.enabled) {
      cutNet = GMS.round(Number(services.shrinking.cutGross || 0), 3);
      cutKarat = Number(services.shrinking.cutKarat || karatIn);
      cutPure = GMS.round(cutNet * GMS.karatRatio(cutKarat), 4);
    }

    const expectedNet = GMS.round(wInNet + addedNet - cutNet, 3);
    const expectedPure = GMS.round(wInPure + addedPure - cutPure, 4);

    return {
      expectedNet,
      expectedPure,
      addedNet,
      addedPure,
      addedKarat,
      cutNet,
      cutPure,
      cutKarat,
      wInNet,
      wInPure,
      karatIn,
    };
  }

  /* ─────────────────────────────────────────────────────────────────
     حساب التكاليف النهائية (Dual Ledger)
     ───────────────────────────────────────────────────────────────── */
  function computeRepairCost(ticket) {
    const services = ticket.services || {};
    const price24 = getPrice24();
    const scrapPrice = getScrapBuyPrice();

    let laborFee = 0;
    let addedGoldCost = 0;
    let cutGoldCredit = 0;
    let stonesCost = 0;

    // Labor fees
    Object.values(services).forEach(svc => {
      if (svc && svc.enabled && svc.fee) {
        laborFee += Number(svc.fee || 0);
      }
    });

    // Added gold cost (يُحسب بسعر البيع الحالي)
    if (services.expanding?.enabled) {
      const addedNet = Number(services.expanding.addedGross || 0);
      const addedKarat = Number(services.expanding.addedKarat || ticket.karat_in || 21);
      const addedPure = GMS.round(addedNet * GMS.karatRatio(addedKarat), 4);
      addedGoldCost = GMS.round(addedPure * price24, 2);
    }

    // Cut gold credit (يُحسب بسعر شراء الكسر — أقل من سعر البيع)
    if (services.shrinking?.enabled && services.shrinking.disposition === 'shop_keeps') {
      const cutNet = Number(services.shrinking.cutGross || 0);
      const cutKarat = Number(services.shrinking.cutKarat || ticket.karat_in || 21);
      const cutPure = GMS.round(cutNet * GMS.karatRatio(cutKarat), 4);
      cutGoldCredit = GMS.round(cutPure * scrapPrice, 2);
    }

    // Stones cost
    if (services.stone_setting?.enabled) {
      stonesCost = Number(services.stone_setting.stonesCost || 0);
    }

    const subtotal = GMS.round(laborFee + addedGoldCost + stonesCost, 2);
    const grandTotal = GMS.round(Math.max(0, subtotal - cutGoldCredit), 2);

    // Gold delta (from shop's vault perspective: positive = shop gained gold)
    const addedPure = services.expanding?.enabled
      ? GMS.round(Number(services.expanding.addedGross || 0) * GMS.karatRatio(services.expanding.addedKarat || ticket.karat_in || 21), 4)
      : 0;
    const cutPureKept = (services.shrinking?.enabled && services.shrinking.disposition === 'shop_keeps')
      ? GMS.round(Number(services.shrinking.cutGross || 0) * GMS.karatRatio(services.shrinking.cutKarat || ticket.karat_in || 21), 4)
      : 0;
    const goldDelta = GMS.round(cutPureKept - addedPure, 4);

    return {
      laborFee: GMS.round(laborFee, 2),
      addedGoldCost: GMS.round(addedGoldCost, 2),
      cutGoldCredit: GMS.round(cutGoldCredit, 2),
      stonesCost: GMS.round(stonesCost, 2),
      subtotal,
      grandTotal,
      goldDelta,
      cashDelta: grandTotal,
      addedPure,
      cutPureKept,
    };
  }

  /* ═════════════════════════════════════════════════════════════════════
     §4 · DATA LOADING & PERSISTENCE
     ═════════════════════════════════════════════════════════════════════ */

  function loadTickets() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      RState.tickets = Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      RState.tickets = [];
    }

    // Scrap vault
    try {
      const raw = localStorage.getItem(LS_WALLET_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      RState.scrapVault = Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      RState.scrapVault = [];
    }
  }

  function saveTickets() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(RState.tickets.slice(0, MAX_TICKETS)));
    } catch (e) {
      console.warn('[Repair] localStorage quota exceeded');
    }
  }

  function saveScrapVault() {
    try {
      localStorage.setItem(LS_WALLET_KEY, JSON.stringify(RState.scrapVault.slice(0, 300)));
    } catch (_) {}
  }

  /* ═════════════════════════════════════════════════════════════════════
     §5 · STATS
     ═════════════════════════════════════════════════════════════════════ */

  function updateStats() {
    const tickets = RState.tickets;

    let totalCashRevenue = 0;
    let totalAddedGold = 0;
    let totalCutGold = 0;
    let suspiciousLosses = 0;

    const byStatus = { RECEIVED: 0, IN_PROGRESS: 0, READY: 0, DELIVERED: 0, CANCELLED: 0 };

    tickets.forEach(t => {
      const st = t.status || 'RECEIVED';
      if (byStatus.hasOwnProperty(st)) byStatus[st]++;

      if (st === 'DELIVERED') {
        totalCashRevenue += Number(t.payment?.paid || t.grand_total || 0);
        if (t.gold_delta) {
          if (t.gold_delta > 0) totalCutGold += Number(t.gold_delta);
          else totalAddedGold += Math.abs(Number(t.gold_delta));
        }
      }

      if (t.actual_loss?.isSuspicious) suspiciousLosses++;
    });

    const scrapVaultGold = RState.scrapVault.reduce(
      (a, x) => a + Number(x.pure_weight || 0), 0
    );

    RState.stats = {
      total: tickets.length,
      received: byStatus.RECEIVED,
      inProgress: byStatus.IN_PROGRESS,
      ready: byStatus.READY,
      delivered: byStatus.DELIVERED,
      cancelled: byStatus.CANCELLED,
      totalCashRevenue: GMS.round(totalCashRevenue, 2),
      totalAddedGold: GMS.round(totalAddedGold, 4),
      totalCutGold: GMS.round(totalCutGold, 4),
      suspiciousLosses,
      scrapVaultGold: GMS.round(scrapVaultGold, 4),
    };
  }

  /* ═════════════════════════════════════════════════════════════════════
     §6 · FILTERS
     ═════════════════════════════════════════════════════════════════════ */

  function applyFilters() {
    const f = RState.filters;
    let rows = RState.tickets.slice();

    if (f.search) {
      const q = f.search.toLowerCase();
      rows = rows.filter(t =>
        (t.ticket_no || '').toLowerCase().includes(q) ||
        (t.customer?.name || '').toLowerCase().includes(q) ||
        (t.customer?.phone || '').includes(q) ||
        (t.item?.sku || '').toLowerCase().includes(q)
      );
    }

    if (f.status) rows = rows.filter(t => t.status === f.status);

    if (f.service) {
      rows = rows.filter(t =>
        t.services && t.services[f.service] && t.services[f.service].enabled
      );
    }

    if (f.dateFrom) {
      rows = rows.filter(t => (t.created_at || '').slice(0, 10) >= f.dateFrom);
    }

    if (f.dateTo) {
      rows = rows.filter(t => (t.created_at || '').slice(0, 10) <= f.dateTo);
    }

    rows.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    RState.filtered = rows;
    RState.totalPages = Math.max(1, Math.ceil(rows.length / RState.pageSize));
    if (RState.page > RState.totalPages) RState.page = RState.totalPages;

    return rows;
  }

  function getPageItems() {
    const start = (RState.page - 1) * RState.pageSize;
    return RState.filtered.slice(start, start + RState.pageSize);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §7 · RENDERERS — TABS
     ═════════════════════════════════════════════════════════════════════ */

  function renderTabs() {
    const s = RState.stats;
    const tabs = [
      { key: 'intake',   label: 'الاستلام',       icon: 'inbox',          badge: s.received },
      { key: 'workshop', label: 'الورشة',         icon: 'hammer',         badge: s.inProgress + s.ready },
      { key: 'delivery', label: 'التسليم',        icon: 'package-check',  badge: s.ready },
      { key: 'ledger',   label: 'دفتر الصيانة',   icon: 'book-open',      badge: 0 },
    ];

    return `
      <div class="tabs-bar" style="position:relative;top:0;padding:0;
                  background:transparent;border-bottom:1px solid var(--border);
                  margin-bottom:20px">
        ${tabs.map(t => `
          <button class="tab ${RState.activeTab === t.key ? 'active' : ''}"
                  data-rep-tab="${t.key}" type="button">
            <i data-lucide="${t.icon}"></i>
            <span>${t.label}</span>
            ${t.badge > 0 ? `<span class="tab-badge">${GMS.intFmt(t.badge)}</span>` : ''}
          </button>
        `).join('')}
      </div>
    `;
  }

  function renderKPIs() {
    const s = RState.stats;
    const price24 = getPrice24();

    return `
      <div class="kpi-row cols-5">
        <div class="kpi gold">
          <div class="kpi-label">
            <i data-lucide="clipboard-list"></i>
            تكتات الصيانة
          </div>
          <div class="kpi-value">${GMS.intFmt(s.total)}</div>
          <div class="kpi-meta">
            <b>${GMS.intFmt(s.inProgress)}</b> قيد الصيانة · <b>${GMS.intFmt(s.ready)}</b> جاهز
          </div>
        </div>

        <div class="kpi success">
          <div class="kpi-label">
            <i data-lucide="banknote"></i>
            إجمالي الإيرادات
          </div>
          <div class="kpi-value">${GMS.moneyFmt(s.totalCashRevenue)} <small>ج.م</small></div>
          <div class="kpi-meta">
            من ${GMS.intFmt(s.delivered)} تكت مُسلَّم
          </div>
        </div>

        <div class="kpi info">
          <div class="kpi-label">
            <i data-lucide="plus-circle"></i>
            ذهب مضاف للتوسيع
          </div>
          <div class="kpi-value">${GMS.gramFmt(s.totalAddedGold)} <small>جم</small></div>
          <div class="kpi-meta">
            بندق 24K · خصم من الخزنة
          </div>
        </div>

        <div class="kpi violet">
          <div class="kpi-label">
            <i data-lucide="vault"></i>
            خزنة كسر الصيانة
          </div>
          <div class="kpi-value">${GMS.gramFmt(s.scrapVaultGold)} <small>جم</small></div>
          <div class="kpi-meta">
            بندق 24K · قيمته
            <b>${GMS.moneyFmt(s.scrapVaultGold * price24)}</b> ج.م
          </div>
        </div>

        <div class="kpi ${s.suspiciousLosses > 0 ? 'danger' : 'success'}">
          <div class="kpi-label">
            <i data-lucide="shield-alert"></i>
            خسس مشبوه
          </div>
          <div class="kpi-value">${GMS.intFmt(s.suspiciousLosses)}</div>
          <div class="kpi-meta">
            ${s.suspiciousLosses > 0 ? 'تحتاج مراجعة فورية' : 'لا توجد عمليات مشبوهة'}
          </div>
        </div>
      </div>
    `;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §8 · TAB 1 — INTAKE
     ═════════════════════════════════════════════════════════════════════ */

  function renderIntakeTab() {
    const received = RState.tickets.filter(t => t.status === 'RECEIVED').slice(0, 20);

    return `
      <div class="card" style="margin-bottom:16px;
                  background:linear-gradient(135deg,
                    color-mix(in srgb,var(--primary) 8%,var(--surface)) 0%,
                    var(--surface) 100%);
                  border-color:color-mix(in srgb,var(--primary) 30%,var(--border))">
        <div class="card-body" style="padding:22px 24px">
          <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
            <div style="width:58px;height:58px;border-radius:16px;
                        background:var(--gold-grad);display:grid;place-items:center;
                        color:#2a1f05;flex-shrink:0;
                        box-shadow:0 14px 34px -12px rgba(184,145,47,.9)">
              <i data-lucide="inbox" style="width:28px;height:28px"></i>
            </div>
            <div style="flex:1;min-width:200px">
              <h3 style="font-size:16px;font-weight:900;margin-bottom:4px">
                استلام قطعة للصيانة
              </h3>
              <p style="font-size:12px;color:var(--muted);font-weight:600;
                        margin:0;line-height:1.6">
                سجّل وزن الاستلام بدقة 0.001 جم، واختر الخدمات المطلوبة،
                وطباعة إيصال استلام بـ QR Code لمتابعة القطعة.
              </p>
            </div>
            <button class="btn btn-primary btn-lg" id="rep-new-intake">
              <i data-lucide="plus-circle"></i>
              استلام قطعة جديدة
            </button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <h3>
            <i data-lucide="clock"></i>
            أحدث القطع المستلمة
          </h3>
          <div class="spacer" style="flex:1"></div>
          <span class="card-sub">
            ${GMS.intFmt(received.length)} تكت في انتظار بدء الصيانة
          </span>
        </div>

        ${received.length === 0
          ? `<div class="empty" style="padding:60px 20px">
              <i data-lucide="inbox"></i>
              <p>لا توجد قطع مستلمة حالياً</p>
              <span>جميع القطع بدأت مرحلة الصيانة أو تم تسليمها</span>
             </div>`
          : `<div style="padding:12px 14px">${received.map(renderTicketRow).join('')}</div>`
        }
      </div>
    `;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §9 · TAB 2 — WORKSHOP
     ═════════════════════════════════════════════════════════════════════ */

  function renderWorkshopTab() {
    const active = RState.tickets.filter(t =>
      t.status === 'IN_PROGRESS' || t.status === 'READY'
    );

    return `
      <div class="card">
        <div class="card-head">
          <h3>
            <i data-lucide="hammer"></i>
            القطع قيد الصيانة
          </h3>
          <div class="spacer" style="flex:1"></div>
          <span class="card-sub">
            ${GMS.intFmt(active.length)} قطعة نشطة
          </span>
        </div>

        ${active.length === 0
          ? `<div class="empty" style="padding:60px 20px">
              <i data-lucide="hammer"></i>
              <p>الورشة فارغة</p>
              <span>ابدأ صيانة القطع المستلمة من تبويب "الاستلام"</span>
             </div>`
          : `<div style="padding:12px 14px">${active.map(renderTicketRow).join('')}</div>`
        }
      </div>
    `;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §10 · TAB 3 — DELIVERY
     ═════════════════════════════════════════════════════════════════════ */

  function renderDeliveryTab() {
    const ready = RState.tickets.filter(t => t.status === 'READY');
    const delivered = RState.tickets.filter(t => t.status === 'DELIVERED').slice(0, 15);

    return `
      <div class="card" style="margin-bottom:16px;
                  background:linear-gradient(135deg,
                    color-mix(in srgb,var(--success) 8%,var(--surface)) 0%,
                    var(--surface) 100%);
                  border-color:color-mix(in srgb,var(--success) 30%,var(--border))">
        <div class="card-body" style="padding:22px 24px">
          <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
            <div style="width:58px;height:58px;border-radius:16px;
                        background:linear-gradient(135deg,#3ecf8e,#0f7a43);
                        display:grid;place-items:center;
                        color:#fff;flex-shrink:0;
                        box-shadow:0 14px 34px -12px rgba(15,122,67,.9)">
              <i data-lucide="package-check" style="width:28px;height:28px"></i>
            </div>
            <div style="flex:1;min-width:200px">
              <h3 style="font-size:16px;font-weight:900;margin-bottom:4px">
                قطع جاهزة للتسليم
              </h3>
              <p style="font-size:12px;color:var(--muted);font-weight:600;
                        margin:0;line-height:1.6">
                ${ready.length > 0
                  ? `يوجد ${GMS.intFmt(ready.length)} قطعة جاهزة. اضغط "تسليم" لبدء مطابقة الوزن وتحصيل الرسوم.`
                  : 'لا توجد قطع جاهزة للتسليم حالياً.'}
              </p>
            </div>
          </div>
        </div>
      </div>

      ${ready.length > 0 ? `
        <div class="card" style="margin-bottom:16px">
          <div class="card-head">
            <h3>
              <i data-lucide="check-circle-2" style="color:var(--success)"></i>
              جاهز للتسليم (${ready.length})
            </h3>
          </div>
          <div style="padding:12px 14px">
            ${ready.map(renderTicketRow).join('')}
          </div>
        </div>
      ` : ''}

      <div class="card">
        <div class="card-head">
          <h3>
            <i data-lucide="history"></i>
            أحدث التسليمات
          </h3>
          <div class="spacer" style="flex:1"></div>
          <span class="card-sub">${delivered.length} تكت</span>
        </div>
        ${delivered.length === 0
          ? `<div class="empty" style="padding:40px 20px">
              <i data-lucide="package-check"></i>
              <p>لا توجد عمليات تسليم سابقة</p>
             </div>`
          : `<div style="padding:12px 14px">${delivered.map(renderTicketRow).join('')}</div>`
        }
      </div>
    `;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §11 · TAB 4 — LEDGER
     ═════════════════════════════════════════════════════════════════════ */

  function renderLedgerTab() {
    return `
      <div class="card" style="margin-bottom:16px">
        <div class="toolbar-row">
          <div class="search-wrap" style="flex:1;min-width:220px;max-width:380px">
            <i data-lucide="search"></i>
            <input id="rep-search" placeholder="بحث برقم التكت، الاسم، الهاتف…"
                   value="${escapeHTML(RState.filters.search)}" autocomplete="off">
          </div>

          <select class="filter-select" id="rep-filter-status" style="min-width:150px">
            <option value="">كل الحالات</option>
            ${Object.values(TICKET_STATUS).map(s => `
              <option value="${s.key}" ${RState.filters.status === s.key ? 'selected' : ''}>
                ${s.label}
              </option>
            `).join('')}
          </select>

          <select class="filter-select" id="rep-filter-service" style="min-width:150px">
            <option value="">كل الخدمات</option>
            ${Object.values(SERVICE_TYPES).map(s => `
              <option value="${s.key}" ${RState.filters.service === s.key ? 'selected' : ''}>
                ${s.label}
              </option>
            `).join('')}
          </select>

          <div class="field" style="min-width:140px;max-width:160px">
            <input type="date" id="rep-filter-from"
                   value="${escapeHTML(RState.filters.dateFrom)}"
                   style="padding:8px 12px">
          </div>

          <div class="field" style="min-width:140px;max-width:160px">
            <input type="date" id="rep-filter-to"
                   value="${escapeHTML(RState.filters.dateTo)}"
                   style="padding:8px 12px">
          </div>

          <div class="spacer" style="flex:1"></div>

          <span class="chip info">
            <i data-lucide="database" style="width:12px;height:12px"></i>
            ${GMS.intFmt(RState.filtered.length)} تكت
          </span>

          <button class="btn btn-sm" id="rep-export-btn">
            <i data-lucide="download"></i> تصدير Excel
          </button>
        </div>
      </div>

      <div class="card">
        <div class="table-wrap" style="border:none;border-radius:0;max-height:64vh">
          <table class="tbl">
            <thead>
              <tr>
                <th style="width:140px">رقم التكت</th>
                <th style="width:200px">العميل</th>
                <th style="width:130px">التصنيف</th>
                <th style="width:70px" class="col-c">عيار</th>
                <th style="width:100px" class="col-num">وارد (جم)</th>
                <th style="width:100px" class="col-num">صادر (جم)</th>
                <th style="width:90px" class="col-num">الخسس %</th>
                <th style="width:110px" class="col-num">الإجمالي</th>
                <th style="width:110px" class="col-c">الحالة</th>
                <th style="width:80px" class="col-c">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              ${RState.filtered.length === 0
                ? `<tr><td colspan="10" style="text-align:center;padding:60px;
                            color:var(--muted)">
                    <i data-lucide="inbox" style="width:34px;height:34px;
                       opacity:.3;display:block;margin:0 auto 10px"></i>
                    <div style="font-weight:800;color:var(--text-2)">
                      لا توجد تكتات مطابقة
                    </div>
                   </td></tr>`
                : RState.filtered.slice(0, 200).map(t => {
                    const status = TICKET_STATUS[t.status] || TICKET_STATUS.RECEIVED;
                    const lossPct = t.actual_loss?.pct ?? null;
                    const lossCls = lossPct === null ? 'var(--muted)'
                                  : t.actual_loss?.isSuspicious ? 'var(--danger)'
                                  : t.actual_loss?.severity === 'warning' ? 'var(--warn)'
                                  : 'var(--success)';

                    return `
                      <tr data-rep-id="${escapeHTML(t.id)}">
                        <td class="mono" style="font-weight:800;font-size:11.5px">
                          ${escapeHTML(t.ticket_no)}
                        </td>
                        <td>
                          <div class="cell-sku">
                            <span class="sku-code">${escapeHTML(t.customer?.name || '—')}</span>
                            <span class="sku-meta mono">${escapeHTML(t.customer?.phone || '—')}</span>
                          </div>
                        </td>
                        <td style="font-size:11.5px">
                          ${escapeHTML(t.item?.category || '—')}
                        </td>
                        <td class="col-c">
                          <span class="karat-badge" data-k="${t.karat_in}">${t.karat_in}K</span>
                        </td>
                        <td class="col-num">${GMS.gramFmt(t.weight_in_net)}</td>
                        <td class="col-num" style="font-weight:800">
                          ${t.weight_out_net ? GMS.gramFmt(t.weight_out_net) : '—'}
                        </td>
                        <td class="col-num" style="font-weight:900;color:${lossCls}">
                          ${lossPct !== null ? lossPct.toFixed(3) + '%' : '—'}
                        </td>
                        <td class="col-num" style="font-weight:900;color:var(--primary)">
                          ${GMS.moneyFmt(t.grand_total || 0)}
                        </td>
                        <td class="col-c">
                          <span class="pill ${status.cls}">
                            <i data-lucide="${status.icon}" style="width:10px;height:10px"></i>
                            ${status.label}
                          </span>
                        </td>
                        <td class="col-c">
                          <button class="row-act" data-rep-view="${escapeHTML(t.id)}"
                                  title="تفاصيل">
                            <i data-lucide="eye"></i>
                          </button>
                        </td>
                      </tr>
                    `;
                  }).join('')
              }
            </tbody>
          </table>
        </div>

        ${RState.filtered.length > 200 ? `
          <div style="padding:14px;text-align:center;font-size:11.5px;
                      color:var(--muted);font-weight:700;background:var(--surface-2)">
            عرض أول 200 من ${GMS.intFmt(RState.filtered.length)} تكت
          </div>
        ` : ''}
      </div>
    `;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §12 · RENDER — TICKET ROW (card style)
     ═════════════════════════════════════════════════════════════════════ */

  function renderTicketRow(ticket) {
    const status = TICKET_STATUS[ticket.status] || TICKET_STATUS.RECEIVED;
    const serviceList = Object.values(SERVICE_TYPES)
      .filter(s => ticket.services?.[s.key]?.enabled);

    const loss = ticket.actual_loss;

    return `
      <div class="queue-item" data-rep-card="${escapeHTML(ticket.id)}"
           style="cursor:default">
        <div class="qi-icon" style="width:42px;height:42px;
                    background:var(--${status.color}-bg);
                    color:var(--${status.color})">
          <i data-lucide="${status.icon}"></i>
        </div>

        <div class="qi-body">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;
                      margin-bottom:4px">
            <span class="mono" style="font-weight:900;font-size:13px">
              ${escapeHTML(ticket.ticket_no)}
            </span>
            <span class="pill ${status.cls}" style="font-size:10px">
              ${status.label}
            </span>
            ${loss?.isSuspicious ? `
              <span class="pill pill-red" style="font-size:10px">
                <i data-lucide="shield-alert" style="width:10px;height:10px"></i>
                خسس مشبوه
              </span>
            ` : ''}
          </div>

          <div style="font-size:12px;font-weight:800;margin-bottom:3px">
            ${escapeHTML(ticket.customer?.name || '—')}
            <span class="mono" style="color:var(--muted);font-size:11px;
                        font-weight:600;margin-inline-start:6px">
              ${escapeHTML(ticket.customer?.phone || '')}
            </span>
          </div>

          <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:10.5px;
                      color:var(--muted);font-weight:700">
            <span>
              <i data-lucide="gem" style="width:10px;height:10px;
                         display:inline;vertical-align:-1px"></i>
              ${escapeHTML(ticket.item?.category || '—')}
            </span>
            <span>
              <span class="karat-badge" data-k="${ticket.karat_in}"
                    style="font-size:9.5px;padding:1px 5px">${ticket.karat_in}K</span>
            </span>
            <span>
              <i data-lucide="scale" style="width:10px;height:10px;
                         display:inline;vertical-align:-1px"></i>
              صافي ${GMS.gramFmt(ticket.weight_in_net)} جم
            </span>
            <span>
              <i data-lucide="clock" style="width:10px;height:10px;
                         display:inline;vertical-align:-1px"></i>
              ${GMS.timeAgo(ticket.created_at)}
            </span>
          </div>

          ${serviceList.length > 0 ? `
            <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:6px">
              ${serviceList.map(s => `
                <span style="font-size:9.5px;font-weight:800;padding:2px 7px;
                             border-radius:10px;background:var(--${s.color}-bg);
                             color:var(--${s.color})">
                  <i data-lucide="${s.icon}"
                     style="width:9px;height:9px;display:inline;
                            vertical-align:-1px"></i>
                  ${s.label}
                </span>
              `).join('')}
            </div>
          ` : ''}
        </div>

        <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">
          <div class="mono" style="font-size:15px;font-weight:900;
                      color:var(--primary);direction:ltr">
            ${GMS.moneyFmt(ticket.grand_total || 0)} ج.م
          </div>
          <div style="display:flex;gap:3px">
            ${renderTicketActions(ticket)}
          </div>
        </div>
      </div>
    `;
  }

  function renderTicketActions(ticket) {
    const status = ticket.status;
    const btns = [];

    // View details
    btns.push(`
      <button class="row-act" data-rep-view="${escapeHTML(ticket.id)}"
              title="تفاصيل" style="width:30px;height:30px">
        <i data-lucide="eye"></i>
      </button>
    `);

    // Print intake receipt
    btns.push(`
      <button class="row-act" data-rep-print-intake="${escapeHTML(ticket.id)}"
              title="طباعة إيصال الاستلام" style="width:30px;height:30px">
        <i data-lucide="printer"></i>
      </button>
    `);

    if (status === 'RECEIVED') {
      btns.push(`
        <button class="row-act" data-rep-start="${escapeHTML(ticket.id)}"
                title="بدء الصيانة" style="width:30px;height:30px;
                       color:var(--info)">
          <i data-lucide="play"></i>
        </button>
      `);
    }

    if (status === 'IN_PROGRESS') {
      btns.push(`
        <button class="row-act" data-rep-ready="${escapeHTML(ticket.id)}"
                title="جاهز للتسليم" style="width:30px;height:30px;
                       color:var(--violet)">
          <i data-lucide="check"></i>
        </button>
      `);
    }

    if (status === 'READY') {
      btns.push(`
        <button class="row-act" data-rep-deliver="${escapeHTML(ticket.id)}"
                title="تسليم" style="width:30px;height:30px;
                       color:var(--success)">
          <i data-lucide="package-check"></i>
        </button>
      `);
    }

    if (status === 'DELIVERED') {
      btns.push(`
        <button class="row-act" data-rep-print-delivery="${escapeHTML(ticket.id)}"
                title="طباعة إيصال التسليم" style="width:30px;height:30px">
          <i data-lucide="file-check"></i>
        </button>
      `);
    }

    return btns.join('');
  }

  /* ═════════════════════════════════════════════════════════════════════
     §13 · MAIN RENDER
     ═════════════════════════════════════════════════════════════════════ */

  function render(root) {
    updateStats();
    applyFilters();

    let tabContent = '';
    if (RState.activeTab === 'intake')   tabContent = renderIntakeTab();
    if (RState.activeTab === 'workshop') tabContent = renderWorkshopTab();
    if (RState.activeTab === 'delivery') tabContent = renderDeliveryTab();
    if (RState.activeTab === 'ledger')   tabContent = renderLedgerTab();

    root.innerHTML = `
      <div class="page-header">
        <h2>
          <i data-lucide="wrench"></i>
          الصيانة والورشة والتعديلات
        </h2>
        <p>
          إدارة كاملة لعمليات التصليح، اللحام، توسيع وتضييق المقاسات،
          وركوب الفصوص — بدقة 0.001 جرام ودفتر مزدوج (ذهب صافي + نقد).
        </p>
      </div>

      ${renderKPIs()}
      ${renderTabs()}
      ${tabContent}
    `;

    window.lucide?.createIcons();
    bindControls();
    bindRealtimeUpdates();
  }

  function refreshFullUI() {
    render(document.getElementById('page'));
  }

  /* ═════════════════════════════════════════════════════════════════════
     §14 · CONTROLS BINDING
     ═════════════════════════════════════════════════════════════════════ */

  function bindControls() {
    /* Tabs */
    document.querySelectorAll('[data-rep-tab]').forEach(tab => {
      tab.onclick = () => {
        RState.activeTab = tab.dataset.repTab;
        refreshFullUI();
      };
    });

    /* New intake */
    const newBtn = document.getElementById('rep-new-intake');
    if (newBtn) newBtn.onclick = () => openIntakeModal();

    /* Ticket actions (delegated) */
    document.querySelectorAll('[data-rep-view]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        showTicketDetails(btn.dataset.repView);
      };
    });

    document.querySelectorAll('[data-rep-start]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        startRepair(btn.dataset.repStart);
      };
    });

    document.querySelectorAll('[data-rep-ready]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        markReady(btn.dataset.repReady);
      };
    });

    document.querySelectorAll('[data-rep-deliver]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        openDeliveryModal(btn.dataset.repDeliver);
      };
    });

    document.querySelectorAll('[data-rep-print-intake]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        printIntakeReceipt(btn.dataset.repPrintIntake);
      };
    });

    document.querySelectorAll('[data-rep-print-delivery]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        printDeliveryReceipt(btn.dataset.repPrintDelivery);
      };
    });

    /* Row click */
    document.querySelectorAll('[data-rep-card]').forEach(card => {
      card.onclick = (e) => {
        if (e.target.closest('button')) return;
        showTicketDetails(card.dataset.repCard);
      };
    });

    /* Ledger filters */
    const searchEl = document.getElementById('rep-search');
    if (searchEl) {
      searchEl.oninput = GMS.debounce((e) => {
        RState.filters.search = e.target.value.trim();
        RState.page = 1;
        applyFilters();
        const host = document.getElementById('page');
        if (host && RState.activeTab === 'ledger') {
          const tbody = host.querySelector('.tbl tbody');
          const tfoot = host.querySelector('.chip.info');
          if (tbody) {
            // إعادة تصيير الجدول فقط
            host.querySelector('.table-wrap').outerHTML =
              renderLedgerTab().match(/<div class="table-wrap[\s\S]*?<\/div>\s*<\/div>/)?.[0]
              || host.querySelector('.table-wrap').outerHTML;
            window.lucide?.createIcons();
            bindControls();
          }
        }
      }, 250);
    }

    ['status', 'service'].forEach(key => {
      const el = document.getElementById(`rep-filter-${key}`);
      if (el) {
        el.onchange = () => {
          RState.filters[key === 'status' ? 'status' : 'service'] = el.value;
          RState.page = 1;
          refreshFullUI();
        };
      }
    });

    ['from', 'to'].forEach(which => {
      const el = document.getElementById(`rep-filter-${which}`);
      if (el) {
        el.onchange = () => {
          RState.filters[which === 'from' ? 'dateFrom' : 'dateTo'] = el.value;
          RState.page = 1;
          refreshFullUI();
        };
      }
    });

    /* Export */
    const exportBtn = document.getElementById('rep-export-btn');
    if (exportBtn) exportBtn.onclick = () => exportLedger();
  }

  function bindRealtimeUpdates() {
    if (!GMS.Realtime) return;

    const unsub = GMS.Realtime.on('event', (event) => {
      if (GMS.Router?.currentId() !== 'repair') return;
      if (event.table === 'repairs') {
        setTimeout(() => {
          loadTickets();
          refreshFullUI();
        }, 400);
      }
    });

    RState.unsubscribers.push(unsub);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §15 · INTAKE MODAL
     ═════════════════════════════════════════════════════════════════════ */

  function initIntakeDraft() {
    RState.intake = {
      customer: { name: '', phone: '' },
      item: { category: 'خاتم', karat: 21, gross: 0, stones: 0, notes: '' },
      services: {
        repair:        { enabled: false, fee: SERVICE_TYPES.repair.defaultFee },
        expanding:     { enabled: false, fee: SERVICE_TYPES.expanding.defaultFee, addedGross: 0, addedKarat: 21 },
        shrinking:     { enabled: false, fee: SERVICE_TYPES.shrinking.defaultFee, cutGross: 0, cutKarat: 21, disposition: 'return_to_customer' },
        stone_setting: { enabled: false, fee: SERVICE_TYPES.stone_setting.defaultFee, stoneCount: 0, stonesWeight: 0, stonesCost: 0 },
        polishing:     { enabled: false, fee: SERVICE_TYPES.polishing.defaultFee },
      },
      workshop: { name: '', assignedTo: '', notes: '' },
      notes: '',
    };
  }

  function openIntakeModal() {
    initIntakeDraft();

    GMS.Modal.open({
      title: 'استلام قطعة جديدة للصيانة',
      icon: 'inbox',
      size: 'xl',
      body: `<div id="rep-intake-body">${renderIntakeForm()}</div>`,
      footer: `
        <button class="btn" data-close>إلغاء</button>
        <button class="btn btn-primary btn-lg" id="rep-intake-save">
          <i data-lucide="save"></i>
          حفظ وإنشاء تكت الصيانة
        </button>
      `,
      onMount: (el, close) => {
        bindIntakeForm(el);

        el.querySelector('#rep-intake-save').onclick = async () => {
          await createTicket(el, close);
        };
      },
    });
  }

  function renderIntakeForm() {
    const d = RState.intake;

    return `
      <!-- Section 1: Customer -->
      <div style="padding:16px 18px;background:var(--surface-2);border-radius:12px;
                  border:1px solid var(--border);margin-bottom:18px">
        <div style="font-size:11px;font-weight:800;color:var(--muted);
                    text-transform:uppercase;letter-spacing:.5px;
                    margin-bottom:12px;display:flex;align-items:center;gap:6px">
          <i data-lucide="user" style="width:12px;height:12px"></i>
          بيانات العميل
        </div>

        <div class="grid-form three">
          <div class="field">
            <label>اسم العميل <span class="req">*</span></label>
            <input id="ri-cust-name" placeholder="الاسم الكامل"
                   value="${escapeHTML(d.customer.name)}">
          </div>

          <div class="field">
            <label>رقم الهاتف <span class="req">*</span></label>
            <input id="ri-cust-phone" placeholder="01xxxxxxxxx"
                   inputmode="tel" class="mono"
                   value="${escapeHTML(d.customer.phone)}">
          </div>

          <div class="field">
            <label>ملاحظات العميل</label>
            <input id="ri-cust-notes" placeholder="اختياري…">
          </div>
        </div>
      </div>

      <!-- Section 2: Item at intake -->
      <div style="padding:16px 18px;background:var(--gold-soft);border-radius:12px;
                  border:1px solid color-mix(in srgb,var(--primary) 30%,var(--border));
                  margin-bottom:18px">
        <div style="font-size:11px;font-weight:800;color:var(--warn);
                    text-transform:uppercase;letter-spacing:.5px;
                    margin-bottom:12px;display:flex;align-items:center;gap:6px">
          <i data-lucide="gem" style="width:12px;height:12px"></i>
          القطعة عند الاستلام
        </div>

        <div class="grid-form four">
          <div class="field">
            <label>التصنيف <span class="req">*</span></label>
            <select id="ri-item-cat">
              ${GMS.CATEGORIES.map(c => `
                <option ${d.item.category === c ? 'selected' : ''}>${escapeHTML(c)}</option>
              `).join('')}
            </select>
          </div>

          <div class="field">
            <label>العيار <span class="req">*</span></label>
            <select id="ri-item-karat">
              ${GMS.KARAT_ORDER.map(k => `
                <option value="${k}" ${d.item.karat === k ? 'selected' : ''}>
                  عيار ${k} — نقاء ${GMS.karatRatio(k).toFixed(4)}
                </option>
              `).join('')}
            </select>
          </div>

          <div class="field">
            <label>الوزن القائم (جم) <span class="req">*</span>
              <span class="hint" style="display:inline;margin-inline-start:auto">
                دقة 0.001g
              </span>
            </label>
            <input type="number" id="ri-item-gross" step="0.001" min="0"
                   value="${d.item.gross || ''}" placeholder="0.000"
                   class="big mono">
          </div>

          <div class="field">
            <label>وزن الأحجار (جم)</label>
            <input type="number" id="ri-item-stones" step="0.001" min="0"
                   value="${d.item.stones || 0}"
                   class="mono" style="text-align:center">
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;
                    margin-top:12px">
          <div class="field">
            <label style="color:var(--muted)">
              <i data-lucide="scale" style="width:12px;height:12px"></i>
              الوزن الصافي (محسوب)
            </label>
            <input id="ri-item-net" readonly class="mono"
                   style="font-weight:900;font-size:15px;text-align:center;
                          background:var(--surface)">
          </div>

          <div class="field">
            <label style="color:var(--primary)">
              <i data-lucide="sparkles" style="width:12px;height:12px"></i>
              البندق 24K (محسوب)
            </label>
            <input id="ri-item-pure" readonly class="mono"
                   style="font-weight:900;font-size:15px;text-align:center;
                          color:var(--primary);background:var(--surface)">
          </div>
        </div>

        <div class="field" style="margin-top:12px">
          <label>وصف العيب / ملاحظات على القطعة</label>
          <input id="ri-item-notes" placeholder="مثال: حلقة مكسورة، خدش عميق…"
                 value="${escapeHTML(d.item.notes)}">
        </div>
      </div>

      <!-- Section 3: Services -->
      <div style="margin-bottom:18px">
        <div style="font-size:11px;font-weight:800;color:var(--muted);
                    text-transform:uppercase;letter-spacing:.5px;
                    margin-bottom:12px;display:flex;align-items:center;gap:6px">
          <i data-lucide="wrench" style="width:12px;height:12px"></i>
          الخدمات المطلوبة (اختر خدمة أو أكثر)
        </div>

        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px">
          ${Object.values(SERVICE_TYPES).map(svc => renderServiceCard(svc)).join('')}
        </div>
      </div>

      <!-- Section 4: Workshop + Notes -->
      <div style="padding:16px 18px;background:var(--surface-2);border-radius:12px;
                  border:1px solid var(--border);margin-bottom:18px">
        <div style="font-size:11px;font-weight:800;color:var(--muted);
                    text-transform:uppercase;letter-spacing:.5px;
                    margin-bottom:12px;display:flex;align-items:center;gap:6px">
          <i data-lucide="hammer" style="width:12px;height:12px"></i>
          معلومات الورشة
        </div>

        <div class="grid-form three">
          <div class="field">
            <label>اسم الورشة / الصائغ</label>
            <input id="ri-workshop" placeholder="ورشة الصاغة الرئيسية"
                   value="${escapeHTML(RState.intake.workshop.name)}"
                   list="rep-workshop-list">
            <datalist id="rep-workshop-list">
              ${(GMS.Demo?.getWorkshops?.() || []).map(w => `
                <option value="${escapeHTML(w)}"></option>
              `).join('')}
            </datalist>
          </div>

          <div class="field">
            <label>المسؤول / العامل</label>
            <input id="ri-assigned" placeholder="اسم الصائغ"
                   value="${escapeHTML(RState.intake.workshop.assignedTo)}">
          </div>

          <div class="field">
            <label>ملاحظات الورشة</label>
            <input id="ri-workshop-notes" placeholder="اختياري…">
          </div>
        </div>
      </div>

      <!-- Live Summary -->
      <div id="ri-summary" style="padding:16px;border-radius:12px;
                  background:var(--gold-soft);
                  border:1.5px solid color-mix(in srgb,var(--primary) 40%,var(--border))">
        ${renderIntakeSummary()}
      </div>
    `;
  }

  function renderServiceCard(svc) {
    const d = RState.intake.services[svc.key];
    const enabled = d.enabled;

    return `
      <div class="service-card ${enabled ? 'active' : ''}"
           data-service-card="${svc.key}"
           style="border:1.5px solid ${enabled
             ? `var(--${svc.color})`
             : 'var(--border)'};
                  background:${enabled
             ? `color-mix(in srgb,var(--${svc.color}) 8%,var(--surface))`
             : 'var(--surface-2)'};
                  border-radius:12px;padding:14px;transition:all .2s">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
          <label class="toggle-switch" style="flex:1;justify-content:flex-start;
                      cursor:pointer;gap:10px">
            <input type="checkbox" data-service-toggle="${svc.key}"
                   ${enabled ? 'checked' : ''}>
            <span class="track"></span>
            <span style="display:flex;align-items:center;gap:8px">
              <span style="width:32px;height:32px;border-radius:9px;
                           display:grid;place-items:center;
                           background:${enabled ? `var(--${svc.color})` : 'var(--surface-3)'};
                           color:${enabled ? '#fff' : 'var(--text-2)'}">
                <i data-lucide="${svc.icon}" style="width:16px;height:16px"></i>
              </span>
              <span style="font-size:12.5px;font-weight:800;
                           color:${enabled ? 'var(--text)' : 'var(--text-2)'}">
                ${svc.label}
              </span>
            </span>
          </label>
        </div>

        ${enabled ? `
          <div style="display:grid;gap:10px">
            <div class="field">
              <label style="font-size:10.5px">أجرة الخدمة (ج.م)</label>
              <input type="number" data-service-fee="${svc.key}"
                     step="1" min="0" value="${d.fee || 0}"
                     class="mono"
                     style="font-weight:800;text-align:center;padding:7px 10px">
            </div>

            ${svc.key === 'expanding' ? `
              <div class="grid-form" style="gap:8px">
                <div class="field">
                  <label style="font-size:10.5px;color:var(--success)">
                    <i data-lucide="plus-circle" style="width:10px;height:10px"></i>
                    الذهب المضاف (جم)
                  </label>
                  <input type="number" data-service-field="addedGross"
                         step="0.001" min="0"
                         value="${d.addedGross || ''}"
                         placeholder="0.000" class="mono"
                         style="font-weight:800;text-align:center">
                </div>
                <div class="field">
                  <label style="font-size:10.5px">عيار المضاف</label>
                  <select data-service-field="addedKarat" style="padding:7px 10px">
                    ${GMS.KARAT_ORDER.map(k => `
                      <option value="${k}" ${d.addedKarat === k ? 'selected' : ''}>
                        ${k}K
                      </option>
                    `).join('')}
                  </select>
                </div>
              </div>
            ` : ''}

            ${svc.key === 'shrinking' ? `
              <div class="grid-form" style="gap:8px">
                <div class="field">
                  <label style="font-size:10.5px;color:var(--warn)">
                    <i data-lucide="minus-circle" style="width:10px;height:10px"></i>
                    الذهب المقصوص (جم)
                  </label>
                  <input type="number" data-service-field="cutGross"
                         step="0.001" min="0"
                         value="${d.cutGross || ''}"
                         placeholder="0.000" class="mono"
                         style="font-weight:800;text-align:center">
                </div>
                <div class="field">
                  <label style="font-size:10.5px">عيار المقصوص</label>
                  <select data-service-field="cutKarat" style="padding:7px 10px">
                    ${GMS.KARAT_ORDER.map(k => `
                      <option value="${k}" ${d.cutKarat === k ? 'selected' : ''}>
                        ${k}K
                      </option>
                    `).join('')}
                  </select>
                </div>
              </div>

              <div class="field">
                <label style="font-size:10.5px">
                  <i data-lucide="help-circle" style="width:10px;height:10px"></i>
                  التصرف في الذهب المقصوص
                </label>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
                  ${Object.values(CUT_DISPOSITION).map(opt => `
                    <label style="display:flex;align-items:center;gap:6px;
                                  padding:8px 10px;border-radius:9px;
                                  border:1.5px solid ${d.disposition === opt.key
                                    ? 'var(--primary)' : 'var(--border)'};
                                  background:${d.disposition === opt.key
                                    ? 'var(--gold-soft)' : 'var(--surface)'};
                                  cursor:pointer;font-size:10.5px;
                                  font-weight:800;text-align:center;
                                  justify-content:center">
                      <input type="radio" name="cut_disposition"
                             data-service-radio="disposition"
                             value="${opt.key}"
                             ${d.disposition === opt.key ? 'checked' : ''}
                             style="display:none">
                      ${opt.label}
                    </label>
                  `).join('')}
                </div>
              </div>
            ` : ''}

            ${svc.key === 'stone_setting' ? `
              <div class="grid-form" style="gap:8px">
                <div class="field">
                  <label style="font-size:10.5px">عدد الفصوص</label>
                  <input type="number" data-service-field="stoneCount"
                         step="1" min="0" value="${d.stoneCount || 0}"
                         class="mono" style="font-weight:800;text-align:center">
                </div>
                <div class="field">
                  <label style="font-size:10.5px">وزن الفصوص (قيراط)</label>
                  <input type="number" data-service-field="stonesWeight"
                         step="0.01" min="0" value="${d.stonesWeight || 0}"
                         class="mono" style="font-weight:800;text-align:center">
                </div>
              </div>
              <div class="field">
                <label style="font-size:10.5px">قيمة الفصوص (ج.م)</label>
                <input type="number" data-service-field="stonesCost"
                       step="0.01" min="0" value="${d.stonesCost || 0}"
                       class="mono" style="font-weight:800;text-align:center">
              </div>
            ` : ''}
          </div>
        ` : `
          <div style="font-size:10.5px;color:var(--muted);font-weight:600;
                      padding:4px 0">
            فعّل الخدمة لإدخال التفاصيل
          </div>
        `}
      </div>
    `;
  }

  function renderIntakeSummary() {
    const d = RState.intake;
    const gross = Number(d.item.gross || 0);
    const stones = Number(d.item.stones || 0);
    const net = GMS.round(Math.max(0, gross - stones), 3);
    const pure = GMS.round(net * GMS.karatRatio(d.item.karat), 4);
    const price24 = getPrice24();
    const value = GMS.round(pure * price24, 2);

    // Cost breakdown
    let labor = 0;
    Object.values(d.services).forEach(s => {
      if (s.enabled) labor += Number(s.fee || 0);
    });

    let addedCost = 0;
    if (d.services.expanding.enabled) {
      const addedPure = GMS.round(
        Number(d.services.expanding.addedGross || 0) *
        GMS.karatRatio(d.services.expanding.addedKarat || d.item.karat),
        4
      );
      addedCost = GMS.round(addedPure * price24, 2);
    }

    let cutCredit = 0;
    if (d.services.shrinking.enabled &&
        d.services.shrinking.disposition === 'shop_keeps') {
      const cutPure = GMS.round(
        Number(d.services.shrinking.cutGross || 0) *
        GMS.karatRatio(d.services.shrinking.cutKarat || d.item.karat),
        4
      );
      cutCredit = GMS.round(cutPure * getScrapBuyPrice(), 2);
    }

    let stonesCost = 0;
    if (d.services.stone_setting.enabled) {
      stonesCost = Number(d.services.stone_setting.stonesCost || 0);
    }

    const subtotal = GMS.round(labor + addedCost + stonesCost, 2);
    const total = GMS.round(Math.max(0, subtotal - cutCredit), 2);

    return `
      <div style="font-size:11px;font-weight:800;color:var(--warn);
                  text-transform:uppercase;letter-spacing:.5px;
                  margin-bottom:10px;display:flex;align-items:center;gap:6px">
        <i data-lucide="calculator" style="width:12px;height:12px"></i>
        الملخص اللحظي
      </div>

      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;
                  padding-bottom:12px;border-bottom:1px dashed var(--border);
                  margin-bottom:12px">
        <div>
          <div style="font-size:10.5px;color:var(--muted);font-weight:800">الوزن الصافي</div>
          <div class="mono" style="font-size:16px;font-weight:900;margin-top:4px">
            ${GMS.gramFmt(net)} <small style="font-size:10px;color:var(--muted)">جم</small>
          </div>
        </div>
        <div>
          <div style="font-size:10.5px;color:var(--muted);font-weight:800">البندق 24K</div>
          <div class="mono" style="font-size:16px;font-weight:900;margin-top:4px;
                      color:var(--primary)">
            ${GMS.gramFmt(pure)} <small style="font-size:10px;color:var(--muted)">جم</small>
          </div>
        </div>
        <div>
          <div style="font-size:10.5px;color:var(--muted);font-weight:800">القيمة الحالية</div>
          <div class="mono" style="font-size:16px;font-weight:900;margin-top:4px">
            ${GMS.moneyFmt(value)} <small style="font-size:10px;color:var(--muted)">ج.م</small>
          </div>
        </div>
        <div>
          <div style="font-size:10.5px;color:var(--muted);font-weight:800">عدد الخدمات</div>
          <div class="mono" style="font-size:16px;font-weight:900;margin-top:4px">
            ${Object.values(d.services).filter(s => s.enabled).length}
          </div>
        </div>
      </div>

      <div class="calc-list">
        <div class="cl-row">
          <span class="k"><i data-lucide="wrench"></i> أجرة الخدمات</span>
          <span class="v">${GMS.moneyFmt(labor)} ج.م</span>
        </div>
        ${addedCost > 0 ? `
          <div class="cl-row">
            <span class="k"><i data-lucide="plus-circle" style="color:var(--success)"></i>
              قيمة الذهب المضاف</span>
            <span class="v" style="color:var(--success)">
              + ${GMS.moneyFmt(addedCost)} ج.م
            </span>
          </div>
        ` : ''}
        ${stonesCost > 0 ? `
          <div class="cl-row">
            <span class="k"><i data-lucide="gem"></i> قيمة الفصوص</span>
            <span class="v">${GMS.moneyFmt(stonesCost)} ج.م</span>
          </div>
        ` : ''}
        ${cutCredit > 0 ? `
          <div class="cl-row">
            <span class="k"><i data-lucide="vault" style="color:var(--warn)"></i>
              رصيد الكسر (خزنة المحل)</span>
            <span class="v" style="color:var(--warn)">
              − ${GMS.moneyFmt(cutCredit)} ج.م
            </span>
          </div>
        ` : ''}
        <div class="cl-row hi">
          <span class="k">
            <i data-lucide="banknote"></i>
            الإجمالي المستحق
          </span>
          <span class="v">${GMS.moneyFmt(total)} ج.م</span>
        </div>
      </div>
    `;
  }

  function bindIntakeForm(root) {
    const $ = (sel) => root.querySelector(sel);

    /* Customer */
    const custName = $('#ri-cust-name');
    if (custName) custName.oninput = (e) => { RState.intake.customer.name = e.target.value; };

    const custPhone = $('#ri-cust-phone');
    if (custPhone) custPhone.oninput = (e) => { RState.intake.customer.phone = e.target.value; };

    /* Item */
    const catEl = $('#ri-item-cat');
    if (catEl) catEl.onchange = (e) => {
      RState.intake.item.category = e.target.value;
    };

    const karatEl = $('#ri-item-karat');
    if (karatEl) karatEl.onchange = (e) => {
      RState.intake.item.karat = Number(e.target.value);
      recalcIntake(root);
    };

    const grossEl = $('#ri-item-gross');
    if (grossEl) grossEl.oninput = (e) => {
      RState.intake.item.gross = sanitizeNumber(e.target.value, 0);
      recalcIntake(root);
    };

    const stonesEl = $('#ri-item-stones');
    if (stonesEl) stonesEl.oninput = (e) => {
      RState.intake.item.stones = sanitizeNumber(e.target.value, 0);
      recalcIntake(root);
    };

    const notesEl = $('#ri-item-notes');
    if (notesEl) notesEl.oninput = (e) => { RState.intake.item.notes = e.target.value; };

    /* Service toggles */
    root.querySelectorAll('[data-service-toggle]').forEach(cb => {
      cb.onchange = () => {
        const key = cb.dataset.serviceToggle;
        RState.intake.services[key].enabled = cb.checked;
        rebuildIntakeForm(root);
      };
    });

    /* Service fees */
    root.querySelectorAll('[data-service-fee]').forEach(input => {
      input.oninput = (e) => {
        const key = input.dataset.serviceFee;
        RState.intake.services[key].fee = sanitizeNumber(e.target.value, 0);
        recalcIntake(root);
      };
    });

    /* Service fields */
    root.querySelectorAll('[data-service-field]').forEach(input => {
      const field = input.dataset.serviceField;
      const parent = input.closest('[data-service-card]');
      if (!parent) return;
      const key = parent.dataset.serviceCard;

      const handler = () => {
        const val = input.type === 'number'
          ? sanitizeNumber(input.value, 0)
          : input.value;

        RState.intake.services[key][field] =
          field.toLowerCase().includes('karat') ? Number(val) : val;

        recalcIntake(root);
      };

      input.oninput = handler;
      input.onchange = handler;
    });

    /* Radio (disposition) */
    root.querySelectorAll('[data-service-radio]').forEach(radio => {
      radio.onchange = () => {
        if (!radio.checked) return;
        const parent = radio.closest('[data-service-card]');
        const key = parent.dataset.serviceCard;
        RState.intake.services[key][radio.dataset.serviceRadio] = radio.value;
        rebuildIntakeForm(root);
      };
    });

    /* Workshop */
    const wsEl = $('#ri-workshop');
    if (wsEl) wsEl.oninput = (e) => { RState.intake.workshop.name = e.target.value; };

    const assignedEl = $('#ri-assigned');
    if (assignedEl) assignedEl.oninput = (e) => {
      RState.intake.workshop.assignedTo = e.target.value;
    };

    /* Initial recalc */
    recalcIntake(root);
  }

  function rebuildIntakeForm(root) {
    const host = root.querySelector('#rep-intake-body');
    if (!host) return;
    host.innerHTML = renderIntakeForm();
    window.lucide?.createIcons();
    bindIntakeForm(root);
  }

  function recalcIntake(root) {
    const d = RState.intake;
    const gross = Number(d.item.gross || 0);
    const stones = Number(d.item.stones || 0);
    const net = GMS.round(Math.max(0, gross - stones), 3);
    const pure = GMS.round(net * GMS.karatRatio(d.item.karat), 4);

    const netEl = root.querySelector('#ri-item-net');
    if (netEl) netEl.value = net.toFixed(3);

    const pureEl = root.querySelector('#ri-item-pure');
    if (pureEl) pureEl.value = pure.toFixed(3);

    const summaryEl = root.querySelector('#ri-summary');
    if (summaryEl) {
      summaryEl.innerHTML = renderIntakeSummary();
      window.lucide?.createIcons();
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §16 · CREATE TICKET (ACTION)
     ═════════════════════════════════════════════════════════════════════ */

  async function createTicket(root, closeFn) {
    const d = RState.intake;

    /* Validation */
    if (!d.customer.name || d.customer.name.trim().length < 2) {
      GMS.Beep?.error?.();
      return GMS.Toast.err('اسم العميل مطلوب');
    }

    if (!d.customer.phone || !GMS.Validate.phoneEG(d.customer.phone)) {
      GMS.Beep?.error?.();
      return GMS.Toast.err('رقم هاتف صحيح مطلوب', '01xxxxxxxxx');
    }

    if (!d.item.gross || d.item.gross <= 0) {
      GMS.Beep?.error?.();
      return GMS.Toast.err('الوزن القائم مطلوب', 'أدخل الوزن بدقة 0.001 جم');
    }

    const enabledServices = Object.values(d.services).filter(s => s.enabled);
    if (enabledServices.length === 0) {
      GMS.Beep?.error?.();
      return GMS.Toast.err('يجب اختيار خدمة واحدة على الأقل');
    }

    /* التحقق من خدمات الذهب */
    if (d.services.expanding.enabled && !d.services.expanding.addedGross) {
      GMS.Beep?.error?.();
      return GMS.Toast.err('أدخل وزن الذهب المضاف للتوسيع');
    }

    if (d.services.shrinking.enabled && !d.services.shrinking.cutGross) {
      GMS.Beep?.error?.();
      return GMS.Toast.err('أدخل وزن الذهب المقصوص للتضييق');
    }

    const saveBtn = root.querySelector('#rep-intake-save');
    const originalHTML = saveBtn?.innerHTML;
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = `<i data-lucide="loader-circle"></i> جارٍ الحفظ…`;
      window.lucide?.createIcons();
    }

    try {
      const gross = Number(d.item.gross || 0);
      const stones = Number(d.item.stones || 0);
      const net = GMS.round(Math.max(0, gross - stones), 3);
      const purityRatio = GMS.karatRatio(d.item.karat);
      const pure = GMS.round(net * purityRatio, 4);

      const ticketNo = generateTicketNo();
      const ticketId = GMS.uuid();
      const now = new Date().toISOString();

      /* بناء الخدمات */
      const services = {};
      Object.entries(d.services).forEach(([key, svc]) => {
        if (!svc.enabled) return;
        services[key] = { ...svc, enabled: true };
      });
      

      /* التكاليف */
      const draftTicket = {
        karat_in: d.item.karat,
        services,
      };
      const cost = computeRepairCost(draftTicket);

      /* المتوقع عند التسليم */
      const expected = computeExpectedOut({
        weight_in_net: net,
        weight_in_pure: pure,
        karat_in: d.item.karat,
        services,
      });

      const ticket = {
        id: ticketId,
        ticket_no: ticketNo,
        status: 'RECEIVED',

        // Customer
        customer: {
          name: d.customer.name.trim(),
          phone: d.customer.phone.trim(),
        },

        // Item at intake
        item: {
          category: d.item.category,
          sku: generateRepairSKU(d.item.karat),
          notes: d.item.notes || '',
        },
        karat_in: d.item.karat,
        purity_ratio_in: purityRatio,
        weight_in_gross: GMS.round(gross, 3),
        weight_in_stones: GMS.round(stones, 3),
        weight_in_net: net,
        weight_in_pure: pure,

        // Services
        services,

        // Expected output
        expected_net: expected.expectedNet,
        expected_pure: expected.expectedPure,
        added_net: expected.addedNet,
        added_pure: expected.addedPure,
        added_karat: expected.addedKarat,
        cut_net: expected.cutNet,
        cut_pure: expected.cutPure,
        cut_karat: expected.cutKarat,

        // Costs
        labor_fee: cost.laborFee,
        added_gold_cost: cost.addedGoldCost,
        cut_gold_credit: cost.cutGoldCredit,
        stones_cost: cost.stonesCost,
        subtotal: cost.subtotal,
        grand_total: cost.grandTotal,

        // Ledger deltas (recorded at delivery)
        gold_delta: 0,
        cash_delta: 0,

        // Payment (filled at delivery)
        payment: null,

        // Actual output (filled at delivery)
        weight_out_gross: null,
        weight_out_stones: null,
        weight_out_net: null,
        weight_out_pure: null,
        actual_loss: null,

        // Workshop
        workshop: {
          name: d.workshop.name || '',
          assignedTo: d.workshop.assignedTo || '',
          notes: d.workshop.notes || '',
        },

        // Meta
        branch_id: GMS.Auth?.profile?.branch_id || GMS.APP_CONFIG.DEFAULT_BRANCH_ID,
        created_by: GMS.Auth?.profile?.full_name || '—',
        created_at: now,
        updated_at: now,
      };

      /* 1 · حفظ محلي */
      RState.tickets.unshift(ticket);
      saveTickets();

      /* 2 · IDB Queue للأوفلاين */
      if (GMS.IDB) {
        try {
          await GMS.IDB.queueAdd({
            id: 'rep-' + ticket.id,
            type: 'repair_create',
            ticket,
            created_at: now,
          });
        } catch (e) {
          console.warn('[Repair] IDB queue failed:', e);
        }
      }

      /* 3 · Supabase إذا متصل */
      if (GMS.Supabase?.isReady?.()) {
        try {
          const client = GMS.Supabase.get();
          await client
            .from('repairs')
            .insert({
              ticket_no: ticket.ticket_no,
              status: ticket.status,
              customer_name: ticket.customer.name,
              customer_phone: ticket.customer.phone,
              item_category: ticket.item.category,
              item_sku: ticket.item.sku,
              karat_in: ticket.karat_in,
              weight_in_gross: ticket.weight_in_gross,
              weight_in_stones: ticket.weight_in_stones,
              weight_in_net: ticket.weight_in_net,
              weight_in_pure: ticket.weight_in_pure,
              services: ticket.services,
              expected_net: ticket.expected_net,
              expected_pure: ticket.expected_pure,
              grand_total: ticket.grand_total,
              workshop_name: ticket.workshop.name,
              created_at: now,
            });
        } catch (e) {
          console.warn('[Repair] Supabase insert failed:', e);
        }
      }

      /* 4 · Audit */
      if (GMS.Audit) {
        await GMS.Audit.log(
          'CREATE',
          'repair',
          ticket.id,
          `تكت صيانة جديد ${ticket.ticket_no} — ${ticket.customer.name} · ${GMS.gramFmt(net)} جم`,
          {
            ticket_no: ticket.ticket_no,
            services: Object.keys(services),
            weight_in_net: net,
            weight_in_pure: pure,
            grand_total: ticket.grand_total,
          }
        );
      }

      /* 5 · Realtime emit */
      if (GMS.Realtime) {
        GMS.Realtime.emit('repairs', 'INSERT', ticket);
      }

      /* 6 · Feedback */
      GMS.Beep?.complete?.();

      GMS.Toast.ok(
        `تكت الصيانة ${ticket.ticket_no}`,
        `تم الاستلام · ${GMS.moneyFmt(ticket.grand_total)} ج.م متوقعة`
      );

      /* 7 · إغلاق وإعادة تصيير */
      closeFn();
      refreshFullUI();

      /* 8 · عرض نافذة نجاح مع QR */
      setTimeout(() => showIntakeSuccess(ticket), 300);

    } catch (e) {
      console.error('[Repair.createTicket]', e);
      GMS.Beep?.error?.();
      GMS.Toast.err('فشل حفظ التكت', e.message);

      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalHTML;
        window.lucide?.createIcons();
      }
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §17 · SUCCESS MODAL (with QR)
     ═════════════════════════════════════════════════════════════════════ */

  async function showIntakeSuccess(ticket) {
    /* QR payload */
    const qrPayload = [
      'REPAIR',
      ticket.ticket_no,
      ticket.customer.phone,
      ticket.karat_in + 'K',
      GMS.round(ticket.weight_in_net, 3).toFixed(3),
    ].join('|');

    const modal = GMS.Modal.open({
      title: `تكت الصيانة — ${ticket.ticket_no}`,
      icon: 'check-circle-2',
      size: 'lg',
      body: `
        <div style="text-align:center;padding:6px 0 20px">
          <div style="width:72px;height:72px;border-radius:22px;
                      background:var(--gold-grad);display:grid;
                      place-items:center;margin:0 auto 14px;color:#2a1f05;
                      box-shadow:0 14px 34px -12px rgba(184,145,47,.9)">
            <i data-lucide="check" style="width:34px;height:34px"></i>
          </div>
          <h3 style="font-size:17px;margin-bottom:4px">
            تم إنشاء تكت الصيانة بنجاح
          </h3>
          <div class="mono" style="font-size:14px;color:var(--primary);
                      font-weight:900;letter-spacing:.5px">
            ${escapeHTML(ticket.ticket_no)}
          </div>
        </div>

        <div style="display:flex;justify-content:center;padding:8px 0">
          <div id="rep-qr-host"
               style="width:220px;height:220px;background:#fff;
                      border-radius:14px;display:grid;place-items:center;
                      border:1px solid var(--border);
                      box-shadow:0 8px 24px -8px rgba(0,0,0,.3)">
            <div class="spinner sm"></div>
          </div>
        </div>

        <p style="text-align:center;font-size:11px;color:var(--muted);
                  font-weight:700;margin:10px 0 18px">
          امسح رمز QR لمتابعة القطعة
        </p>

        <div class="calc-list">
          <div class="cl-row">
            <span class="k"><i data-lucide="user"></i> العميل</span>
            <span class="v" style="font-size:12.5px">${escapeHTML(ticket.customer.name)}</span>
          </div>
          <div class="cl-row">
            <span class="k"><i data-lucide="phone"></i> الهاتف</span>
            <span class="v mono" style="font-size:12.5px">${escapeHTML(ticket.customer.phone)}</span>
          </div>
          <div class="cl-row">
            <span class="k"><i data-lucide="gem"></i> العيار</span>
            <span class="v">${ticket.karat_in}K</span>
          </div>
          <div class="cl-row">
            <span class="k"><i data-lucide="scale"></i> الوزن الصافي</span>
            <span class="v">${GMS.gramFmt(ticket.weight_in_net)} جم</span>
          </div>
          <div class="cl-row hi">
            <span class="k"><i data-lucide="banknote"></i> الإجمالي المتوقع</span>
            <span class="v">${GMS.moneyFmt(ticket.grand_total)} ج.م</span>
          </div>
        </div>
      `,
      footer: `
        <button class="btn" data-close>إغلاق</button>
        <button class="btn btn-ghost" id="rep-success-copy">
          <i data-lucide="copy"></i> نسخ رقم التكت
        </button>
        <button class="btn btn-primary" id="rep-success-print">
          <i data-lucide="printer"></i> طباعة الإيصال
        </button>
      `,
      onMount: (el, close) => {
        /* توليد QR */
        if (GMS.QR?.QR?.generate) {
          const host = el.querySelector('#rep-qr-host');
          if (host) {
            GMS.QR.QR.generate(host, qrPayload, { size: 200 })
              .catch(e => console.warn('[Repair] QR gen failed:', e));
          }
        } else {
          const host = el.querySelector('#rep-qr-host');
          if (host) host.innerHTML = `<i data-lucide="qr-code" style="width:80px;height:80px;color:var(--muted);opacity:.3"></i>`;
          window.lucide?.createIcons();
        }

        /* Copy */
        el.querySelector('#rep-success-copy').onclick = async () => {
          const ok = await GMS.copyToClipboard(ticket.ticket_no);
          if (ok) GMS.Toast.ok('تم النسخ', ticket.ticket_no);
        };

        /* Print */
        el.querySelector('#rep-success-print').onclick = () => {
          close();
          printIntakeReceipt(ticket.id);
        };
      },
    });

    return modal;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §18 · STATUS TRANSITIONS
     ═════════════════════════════════════════════════════════════════════ */

  async function startRepair(ticketId) {
    const ticket = RState.tickets.find(t => t.id === ticketId);
    if (!ticket || ticket.status !== 'RECEIVED') return;

    ticket.status = 'IN_PROGRESS';
    ticket.updated_at = new Date().toISOString();

    saveTickets();

    if (GMS.Supabase?.isReady?.()) {
      try {
        await GMS.Supabase.get()
          .from('repairs')
          .update({ status: 'IN_PROGRESS', updated_at: ticket.updated_at })
          .eq('ticket_no', ticket.ticket_no);
      } catch (e) {
        console.warn('[Repair] Status update failed:', e);
      }
    }

    if (GMS.Audit) {
      await GMS.Audit.log('UPDATE', 'repair', ticket.id,
        `بدء صيانة التكت ${ticket.ticket_no}`, { status: 'IN_PROGRESS' });
    }

    GMS.Beep?.info?.();
    GMS.Toast.info('بدأت الصيانة', ticket.ticket_no);
    refreshFullUI();
  }

  async function markReady(ticketId) {
    const ticket = RState.tickets.find(t => t.id === ticketId);
    if (!ticket || ticket.status !== 'IN_PROGRESS') return;

    ticket.status = 'READY';
    ticket.updated_at = new Date().toISOString();
    ticket.ready_at = new Date().toISOString();

    saveTickets();

    if (GMS.Supabase?.isReady?.()) {
      try {
        await GMS.Supabase.get()
          .from('repairs')
          .update({ status: 'READY', updated_at: ticket.updated_at })
          .eq('ticket_no', ticket.ticket_no);
      } catch (e) {
        console.warn('[Repair] Status update failed:', e);
      }
    }

    if (GMS.Audit) {
      await GMS.Audit.log('UPDATE', 'repair', ticket.id,
        `جاهز للتسليم: ${ticket.ticket_no}`, { status: 'READY' });
    }

    GMS.Beep?.success?.();
    GMS.Toast.ok('القطعة جاهزة', ticket.ticket_no);
    refreshFullUI();
  }

  /* ═════════════════════════════════════════════════════════════════════
     §19 · DELIVERY MODAL
     ═════════════════════════════════════════════════════════════════════ */

  function openDeliveryModal(ticketId) {
    const ticket = RState.tickets.find(t => t.id === ticketId);
    if (!ticket) return;
    if (ticket.status !== 'READY' && ticket.status !== 'IN_PROGRESS') {
      return GMS.Toast.warn('التكت غير جاهز للتسليم');
    }

    RState.delivery = {
      ticket,
      weightOut: { gross: 0, stones: 0, net: 0, pure: 0 },
      actualLoss: { grams: 0, pct: 0, severity: 'natural', isSuspicious: false },
      payment: { method: 'cash', paid: 0, change: 0 },
      notes: '',
    };

    GMS.Modal.open({
      title: `تسليم القطعة — ${ticket.ticket_no}`,
      icon: 'package-check',
      size: 'xl',
      body: `<div id="rep-delivery-body">${renderDeliveryForm()}</div>`,
      footer: `
        <button class="btn" data-close>إلغاء</button>
        <button class="btn btn-success btn-lg" id="rep-delivery-save">
          <i data-lucide="check-circle-2"></i>
          تأكيد التسليم والتحصيل
        </button>
      `,
      onMount: (el, close) => {
        bindDeliveryForm(el);

        el.querySelector('#rep-delivery-save').onclick = async () => {
          await confirmDelivery(el, close);
        };
      },
    });
  }

  function renderDeliveryForm() {
    const d = RState.delivery;
    const ticket = d.ticket;

    return `
      <!-- Customer + Ticket header -->
      <div style="padding:14px 18px;background:var(--surface-2);
                  border-radius:12px;border:1px solid var(--border);
                  margin-bottom:18px;display:flex;align-items:center;gap:14px;
                  flex-wrap:wrap">
        <div style="width:46px;height:46px;border-radius:12px;
                    background:var(--gold-grad);display:grid;place-items:center;
                    color:#2a1f05;flex-shrink:0;font-weight:900">
          <i data-lucide="user" style="width:22px;height:22px"></i>
        </div>
        <div style="flex:1;min-width:200px">
          <div style="font-size:15px;font-weight:900">
            ${escapeHTML(ticket.customer.name)}
          </div>
          <div class="mono" style="font-size:11.5px;color:var(--muted);
                      font-weight:700;margin-top:3px">
            ${escapeHTML(ticket.customer.phone)}
            · ${escapeHTML(ticket.item.category)}
            · ${ticket.karat_in}K
          </div>
        </div>
        <div style="text-align:end">
          <div class="mono" style="font-size:11px;color:var(--muted);
                      font-weight:800">رقم التكت</div>
          <div class="mono" style="font-size:14px;font-weight:900;
                      color:var(--primary)">${escapeHTML(ticket.ticket_no)}</div>
        </div>
      </div>

      <!-- Comparison: In vs Expected vs Out -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;
                  margin-bottom:18px">
        <div style="padding:14px;background:var(--surface-2);border-radius:12px;
                    border:1.5px solid var(--border)">
          <div style="font-size:10.5px;font-weight:800;color:var(--muted);
                      text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">
            <i data-lucide="arrow-down-circle" style="width:12px;height:12px;
                       display:inline;vertical-align:-2px"></i>
            وزن الاستلام (Win)
          </div>
          <div class="mono" style="font-size:20px;font-weight:900;
                      letter-spacing:-.5px">
            ${GMS.gramFmt(ticket.weight_in_net)} <small style="font-size:11px;
                      color:var(--muted)">جم</small>
          </div>
          <div class="mono" style="font-size:11px;color:var(--muted);
                      font-weight:700;margin-top:5px">
            بندق: ${GMS.gramFmt(ticket.weight_in_pure)} جم
          </div>
        </div>

        <div style="padding:14px;background:var(--info-bg);border-radius:12px;
                    border:1.5px solid color-mix(in srgb,var(--info) 30%,var(--border))">
          <div style="font-size:10.5px;font-weight:800;color:var(--info);
                      text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">
            <i data-lucide="target" style="width:12px;height:12px;
                       display:inline;vertical-align:-2px"></i>
            الوزن المتوقع
          </div>
          <div class="mono" style="font-size:20px;font-weight:900;
                      letter-spacing:-.5px;color:var(--info)">
            ${GMS.gramFmt(ticket.expected_net)} <small style="font-size:11px;
                      color:var(--muted)">جم</small>
          </div>
          <div class="mono" style="font-size:11px;color:var(--muted);
                      font-weight:700;margin-top:5px">
            بندق: ${GMS.gramFmt(ticket.expected_pure)} جم
          </div>
        </div>

        <div style="padding:14px;background:var(--gold-soft);border-radius:12px;
                    border:1.5px solid color-mix(in srgb,var(--primary) 40%,var(--border))">
          <div style="font-size:10.5px;font-weight:800;color:var(--warn);
                      text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">
            <i data-lucide="arrow-up-circle" style="width:12px;height:12px;
                       display:inline;vertical-align:-2px"></i>
            وزن التسليم (Wout)
          </div>
          <div class="mono" style="font-size:20px;font-weight:900;
                      letter-spacing:-.5px;color:var(--primary)">
            <span id="rd-out-net-display">0.000</span>
            <small style="font-size:11px;color:var(--muted)">جم</small>
          </div>
          <div class="mono" style="font-size:11px;color:var(--muted);
                      font-weight:700;margin-top:5px">
            بندق: <span id="rd-out-pure-display">0.000</span> جم
          </div>
        </div>
      </div>

      <!-- Actual weights input -->
      <div style="padding:16px 18px;background:var(--surface-2);
                  border-radius:12px;border:1px solid var(--border);
                  margin-bottom:18px">
        <div style="font-size:11px;font-weight:800;color:var(--muted);
                    text-transform:uppercase;letter-spacing:.5px;
                    margin-bottom:12px;display:flex;align-items:center;gap:6px">
          <i data-lucide="scale" style="width:12px;height:12px"></i>
          القياس الفعلي عند التسليم
        </div>

        <div class="grid-form three">
          <div class="field">
            <label>الوزن القائم (جم) <span class="req">*</span></label>
            <input type="number" id="rd-gross" step="0.001" min="0"
                   placeholder="0.000" class="big mono" autofocus>
          </div>

          <div class="field">
            <label>وزن الأحجار (جم)</label>
            <input type="number" id="rd-stones" step="0.001" min="0"
                   value="0" class="mono"
                   style="font-weight:800;text-align:center">
          </div>

          <div class="field">
            <label>الوزن الصافي (محسوب)</label>
            <input id="rd-net" readonly class="mono"
                   style="font-weight:900;font-size:16px;text-align:center;
                          background:var(--surface-3)">
          </div>
        </div>
      </div>

      <!-- Tolerance evaluation (live) -->
      <div id="rd-tolerance-host"></div>

      <!-- Payment -->
      <div style="padding:16px 18px;background:var(--surface-2);
                  border-radius:12px;border:1px solid var(--border);
                  margin-top:18px">
        <div style="font-size:11px;font-weight:800;color:var(--muted);
                    text-transform:uppercase;letter-spacing:.5px;
                    margin-bottom:12px;display:flex;align-items:center;gap:6px">
          <i data-lucide="banknote" style="width:12px;height:12px"></i>
          الدفع
        </div>

        <div class="calc-list" style="margin-bottom:14px">
          <div class="cl-row">
            <span class="k"><i data-lucide="wrench"></i> أجرة الخدمات</span>
            <span class="v mono">${GMS.moneyFmt(ticket.labor_fee || 0)} ج.م</span>
          </div>
          ${Number(ticket.added_gold_cost || 0) > 0 ? `
            <div class="cl-row">
              <span class="k"><i data-lucide="plus-circle" style="color:var(--success)"></i>
                قيمة الذهب المضاف</span>
              <span class="v mono" style="color:var(--success)">
                ${GMS.moneyFmt(ticket.added_gold_cost)} ج.م
              </span>
            </div>
          ` : ''}
          ${Number(ticket.stones_cost || 0) > 0 ? `
            <div class="cl-row">
              <span class="k"><i data-lucide="gem"></i> قيمة الفصوص</span>
              <span class="v mono">${GMS.moneyFmt(ticket.stones_cost)} ج.م</span>
            </div>
          ` : ''}
          ${Number(ticket.cut_gold_credit || 0) > 0 ? `
            <div class="cl-row">
              <span class="k"><i data-lucide="vault" style="color:var(--warn)"></i>
                رصيد الكسر</span>
              <span class="v mono" style="color:var(--warn)">
                − ${GMS.moneyFmt(ticket.cut_gold_credit)} ج.م
              </span>
            </div>
          ` : ''}
          <div class="cl-row hi">
            <span class="k"><i data-lucide="banknote"></i> الإجمالي النهائي</span>
            <span class="v mono">${GMS.moneyFmt(ticket.grand_total || 0)} ج.م</span>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;
                    margin-bottom:12px">
          ${Object.entries(GMS.PAYMENT_METHODS).slice(0, 4).map(([k, m]) => `
            <button type="button" class="pay-btn ${k === 'cash' ? 'active' : ''}"
                    data-rd-pay="${k}"
                    style="padding:10px 8px;border-radius:10px;cursor:pointer;
                           border:1.5px solid ${k === 'cash' ? 'var(--primary)' : 'var(--border)'};
                           background:${k === 'cash' ? 'var(--gold-soft)' : 'var(--surface)'};
                           display:flex;flex-direction:column;align-items:center;
                           gap:5px;font-weight:800;font-size:11px;
                           color:${k === 'cash' ? 'var(--primary)' : 'var(--text-2)'};
                           transition:all .2s">
              <i data-lucide="${m.icon}" style="width:15px;height:15px"></i>
              ${m.label}
            </button>
          `).join('')}
        </div>

        <div class="grid-form">
          <div class="field">
            <label>المبلغ المستلم (ج.م)</label>
            <input type="number" id="rd-paid" step="0.01" min="0"
                   value="${ticket.grand_total || 0}" class="mono big">
          </div>
          <div class="field">
            <label>الباقي للعميل</label>
            <input id="rd-change" readonly class="mono"
                   style="font-weight:900;text-align:center;font-size:16px;
                          background:var(--surface-3)">
          </div>
        </div>

        <div class="field" style="margin-top:12px">
          <label>ملاحظات التسليم</label>
          <input id="rd-notes" placeholder="اختياري…">
        </div>
      </div>
    `;
  }

  function renderTolerancePanel() {
    const d = RState.delivery;
    const ev = d.actualLoss;
    const sev = ev.severity;
    const meta = GMS.LOSS_SEVERITY?.[sev] || { label: ev.severity, cls: 'pill-gray', icon: 'circle' };

    const tol = getRepairTolerance();
    const marker = Math.min(100, (Math.abs(ev.pct) / (tol.warningMax * 2)) * 100);

    return `
      <div class="gauge ${sev}">
        <div class="gauge-head">
          <div class="gauge-icon">
            <i data-lucide="${meta.icon}"></i>
          </div>
          <div>
            <div class="gauge-title">${meta.label}</div>
            <div class="gauge-sub">
              ${ev.pct > tol.warningMax
                ? `⚠ تجاوز حد الأمان (${tol.warningMax}%) — يُسجَّل كخسس مشبوه`
                : ev.pct > tol.naturalMax
                  ? `أعلى من الطبيعي (${tol.naturalMax}%) — يستدعي المراقبة`
                  : `داخل النطاق الطبيعي (حتى ${tol.naturalMax}%)`}
            </div>
          </div>
        </div>

        <div class="gauge-value">
          ${ev.pct > 0 ? ev.pct.toFixed(3) : '0.000'}
          <small>%</small>
        </div>
        <div class="gauge-meta">
          الخسس الفعلي:
          <b class="mono">${ev.grams > 0 ? GMS.gramFmt(ev.grams) : '0.000'}</b> جم
          · القيمة التقديرية:
          <b class="mono">${GMS.moneyFmt(Math.max(0, ev.grams) * getPrice24())}</b> ج.م
        </div>

        <div class="tolerance-bar">
          <div class="tolerance-zones">
            <div class="zone-natural"></div>
            <div class="zone-warning"></div>
            <div class="zone-suspicious"></div>
          </div>
          ${ev.pct > 0 ? `<div class="tolerance-marker" style="left:${marker}%"></div>` : ''}
        </div>
        <div class="tolerance-zones-labels">
          <span class="zl-natural">طبيعي</span>
          <span class="zl-warning">مراقبة</span>
          <span class="zl-suspicious">مشبوه</span>
        </div>
      </div>
    `;
  }

  function bindDeliveryForm(root) {
    const $ = (sel) => root.querySelector(sel);

    const grossEl = $('#rd-gross');
    const stonesEl = $('#rd-stones');

    const recalc = () => {
      const gross = sanitizeNumber(grossEl?.value, 0);
      const stones = sanitizeNumber(stonesEl?.value, 0);
      const net = GMS.round(Math.max(0, gross - stones), 3);
      const ticket = RState.delivery.ticket;
      const pure = GMS.round(net * GMS.karatRatio(ticket.karat_in), 4);

      RState.delivery.weightOut = { gross, stones, net, pure };

      const netEl = $('#rd-net');
      if (netEl) netEl.value = net.toFixed(3);

      const outNet = $('#rd-out-net-display');
      if (outNet) outNet.textContent = net.toFixed(3);

      const outPure = $('#rd-out-pure-display');
      if (outPure) outPure.textContent = pure.toFixed(3);

      /* Loss calculation */
      const expected = Number(ticket.expected_net || 0);
      const lossGrams = GMS.round(expected - net, 3);
      const lossPct = expected > 0 ? GMS.round((lossGrams / expected) * 100, 4) : 0;
      const ev = evaluateRepairTolerance(lossPct);

      RState.delivery.actualLoss = {
        grams: lossGrams,
        pct: lossPct,
        severity: ev.severity,
        isSuspicious: ev.isSuspicious,
      };

      /* Update tolerance panel */
      const panel = $('#rd-tolerance-host');
      if (panel) {
        panel.innerHTML = renderTolerancePanel();
        window.lucide?.createIcons();
      }

      /* Update change */
      updateChangeAmount(root);
    };

    if (grossEl) grossEl.oninput = recalc;
    if (stonesEl) stonesEl.oninput = recalc;

    /* Payment method */
    root.querySelectorAll('[data-rd-pay]').forEach(btn => {
      btn.onclick = () => {
        const method = btn.dataset.rdPay;
        RState.delivery.payment.method = method;

        root.querySelectorAll('[data-rd-pay]').forEach(b => {
          const active = b.dataset.rdPay === method;
          b.style.borderColor = active ? 'var(--primary)' : 'var(--border)';
          b.style.background = active ? 'var(--gold-soft)' : 'var(--surface)';
          b.style.color = active ? 'var(--primary)' : 'var(--text-2)';
        });
      };
    });

    /* Paid input */
    const paidEl = $('#rd-paid');
    if (paidEl) paidEl.oninput = () => updateChangeAmount(root);

    /* Notes */
    const notesEl = $('#rd-notes');
    if (notesEl) notesEl.oninput = (e) => { RState.delivery.notes = e.target.value; };

    /* Initial */
    recalc();
    setTimeout(() => grossEl?.focus(), 200);
  }

  function updateChangeAmount(root) {
    const paidEl = root.querySelector('#rd-paid');
    const changeEl = root.querySelector('#rd-change');
    if (!paidEl || !changeEl) return;

    const ticket = RState.delivery.ticket;
    const total = Number(ticket.grand_total || 0);
    const paid = sanitizeNumber(paidEl.value, 0);
    const change = Math.max(0, paid - total);

    changeEl.value = GMS.moneyFmt(change) + ' ج.م';
    changeEl.style.color = paid < total ? 'var(--danger)'
                         : paid > total ? 'var(--success)'
                         : 'var(--text)';
  }

  /* ═════════════════════════════════════════════════════════════════════
     §20 · CONFIRM DELIVERY (Dual Ledger Settlement)
     ═════════════════════════════════════════════════════════════════════ */

  async function confirmDelivery(root, closeFn) {
    const d = RState.delivery;
    const ticket = d.ticket;
    const outNet = d.weightOut.net;

    if (!outNet || outNet <= 0) {
      GMS.Beep?.error?.();
      return GMS.Toast.err('أدخل الوزن الفعلي');
    }

    const paid = sanitizeNumber(root.querySelector('#rd-paid')?.value, 0);
    const total = Number(ticket.grand_total || 0);

    if (paid < total) {
      const ok = await GMS.Confirm.ask(
        `المبلغ المستلم (${GMS.moneyFmt(paid)} ج.م) أقل من الإجمالي (${GMS.moneyFmt(total)} ج.م). متابعة؟`,
        { title: 'دفع غير مكتمل', okText: 'متابعة', danger: true }
      );
      if (!ok) return;
    }

    /* إذا كان الخسس مشبوهاً — تأكيد إضافي */
    if (d.actualLoss.isSuspicious) {
      const ok = await GMS.Confirm.danger(
        `⚠ خسس الصيانة ${d.actualLoss.pct.toFixed(3)}% تجاوز حد الأمان (${getRepairTolerance().warningMax}%).\n` +
        `الخسس: ${GMS.gramFmt(d.actualLoss.grams)} جم.\n` +
        `سيُسجَّل كـ SUSPICIOUS_LOSS ويحتاج مراجعة المحاسب. متابعة؟`
      );
      if (!ok) return;
    }

    const saveBtn = root.querySelector('#rep-delivery-save');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = `<i data-lucide="loader-circle"></i> جارٍ التسليم…`;
      window.lucide?.createIcons();
    }

    try {
      const now = new Date().toISOString();
      const cost = computeRepairCost(ticket);

      /* تعبئة بيانات التسليم */
      ticket.status = 'DELIVERED';
      ticket.updated_at = now;
      ticket.delivered_at = now;

      ticket.weight_out_gross = d.weightOut.gross;
      ticket.weight_out_stones = d.weightOut.stones;
      ticket.weight_out_net = outNet;
      ticket.weight_out_pure = d.weightOut.pure;

      ticket.actual_loss = { ...d.actualLoss };

      ticket.payment = {
        method: d.payment.method,
        paid: GMS.round(paid, 2),
        change: GMS.round(Math.max(0, paid - total), 2),
        paid_at: now,
      };

      /* Dual Ledger deltas */
      ticket.gold_delta = cost.goldDelta;
      ticket.cash_delta = GMS.round(paid, 2);

      /* 1 · Scrap vault (إن أدخل المحل الكسر) */
      if (ticket.services?.shrinking?.enabled &&
          ticket.services.shrinking.disposition === 'shop_keeps' &&
          ticket.cut_pure > 0) {

        RState.scrapVault.unshift({
          id: GMS.uid(),
          source_ticket: ticket.ticket_no,
          karat: ticket.cut_karat || ticket.karat_in,
          net_weight: ticket.cut_net,
          pure_weight: ticket.cut_pure,
          value_egp: GMS.round(ticket.cut_pure * getPrice24(), 2),
          description: `كسر صيانة من تكت ${ticket.ticket_no} — ${ticket.customer.name}`,
          created_at: now,
        });
        saveScrapVault();

        if (GMS.Realtime) {
          GMS.Realtime.emit('scrap_vault', 'INSERT', {
            source_ticket: ticket.ticket_no,
            pure_weight: ticket.cut_pure,
          });
        }
      }

      saveTickets();

      /* 2 · Supabase update */
      if (GMS.Supabase?.isReady?.()) {
        try {
          const client = GMS.Supabase.get();
          await client
            .from('repairs')
            .update({
              status: 'DELIVERED',
              weight_out_gross: ticket.weight_out_gross,
              weight_out_stones: ticket.weight_out_stones,
              weight_out_net: ticket.weight_out_net,
              weight_out_pure: ticket.weight_out_pure,
              actual_loss_grams: ticket.actual_loss.grams,
              actual_loss_pct: ticket.actual_loss.pct,
              loss_severity: ticket.actual_loss.severity,
              is_suspicious: ticket.actual_loss.isSuspicious,
              payment: ticket.payment,
              gold_delta: ticket.gold_delta,
              cash_delta: ticket.cash_delta,
              delivered_at: now,
            })
            .eq('ticket_no', ticket.ticket_no);
        } catch (e) {
          console.warn('[Repair] Supabase delivery update failed:', e);
        }
      }

      /* 3 · Audit */
      if (GMS.Audit) {
        await GMS.Audit.log(
          'APPROVE',
          'repair',
          ticket.id,
          `تسليم تكت الصيانة ${ticket.ticket_no} — خسس ${ticket.actual_loss.pct.toFixed(3)}%`,
          {
            ticket_no: ticket.ticket_no,
            weight_in: ticket.weight_in_net,
            weight_expected: ticket.expected_net,
            weight_out: ticket.weight_out_net,
            loss_pct: ticket.actual_loss.pct,
            is_suspicious: ticket.actual_loss.isSuspicious,
            gold_delta: ticket.gold_delta,
            cash_delta: ticket.cash_delta,
            payment_method: ticket.payment.method,
          }
        );
      }

      /* 4 · Realtime emit */
      if (GMS.Realtime) {
        GMS.Realtime.emit('repairs', 'UPDATE', ticket);
      }

      /* 5 · Feedback */
      GMS.Beep?.complete?.();

      if (ticket.actual_loss.isSuspicious) {
        GMS.Toast.err(
          `⚠ تسليم بخسس مشبوه — ${ticket.ticket_no}`,
          `تم التسجيل للمراجعة · الخسس ${ticket.actual_loss.pct.toFixed(3)}%`
        );
      } else {
        GMS.Toast.ok(
          `تم التسليم — ${ticket.ticket_no}`,
          `${GMS.moneyFmt(paid)} ج.م · خسس ${ticket.actual_loss.pct.toFixed(3)}%`
        );
      }

      /* 6 · إغلاق وإعادة تصيير */
      closeFn();
      refreshFullUI();

      /* 7 · عرض إيصال النجاح */
      setTimeout(() => showDeliverySuccess(ticket), 300);

    } catch (e) {
      console.error('[Repair.confirmDelivery]', e);
      GMS.Beep?.error?.();
      GMS.Toast.err('فشل التسليم', e.message);

      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = `<i data-lucide="check-circle-2"></i> تأكيد التسليم والتحصيل`;
        window.lucide?.createIcons();
      }
    }
  }

  function showDeliverySuccess(ticket) {
    const sev = ticket.actual_loss?.severity || 'natural';
    const isSus = ticket.actual_loss?.isSuspicious;

    GMS.Modal.open({
      title: `تم التسليم — ${ticket.ticket_no}`,
      icon: 'check-circle-2',
      size: 'lg',
      body: `
        <div style="text-align:center;padding:8px 0 20px">
          <div style="width:72px;height:72px;border-radius:22px;
                      background:${isSus
                        ? 'linear-gradient(135deg,#ff6b60,#b3261e)'
                        : 'linear-gradient(135deg,#3ecf8e,#0f7a43)'};
                      display:grid;place-items:center;margin:0 auto 14px;
                      color:#fff;
                      box-shadow:0 14px 34px -12px ${isSus
                        ? 'rgba(179,38,30,.9)' : 'rgba(15,122,67,.9)'}">
            <i data-lucide="${isSus ? 'shield-alert' : 'check'}"
               style="width:34px;height:34px"></i>
          </div>
          <h3 style="font-size:17px;margin-bottom:4px">
            ${isSus ? 'تم التسليم مع تنبيه' : 'تم التسليم بنجاح'}
          </h3>
          <div class="mono" style="font-size:13px;color:var(--muted);
                      font-weight:800">
            ${escapeHTML(ticket.ticket_no)}
          </div>
        </div>

        <div class="calc-list">
          <div class="cl-row">
            <span class="k"><i data-lucide="user"></i> العميل</span>
            <span class="v" style="font-size:12.5px">${escapeHTML(ticket.customer.name)}</span>
          </div>
          <div class="cl-row">
            <span class="k"><i data-lucide="arrow-down-circle"></i> الوزن عند الاستلام</span>
            <span class="v">${GMS.gramFmt(ticket.weight_in_net)} جم</span>
          </div>
          <div class="cl-row">
            <span class="k"><i data-lucide="target"></i> المتوقع</span>
            <span class="v">${GMS.gramFmt(ticket.expected_net)} جم</span>
          </div>
          <div class="cl-row hi">
            <span class="k"><i data-lucide="arrow-up-circle"></i> الوزن الفعلي عند التسليم</span>
            <span class="v">${GMS.gramFmt(ticket.weight_out_net)} جم</span>
          </div>
        </div>

        <div class="calc-list" style="margin-top:12px">
          <div class="cl-row">
            <span class="k"><i data-lucide="percent"></i> نسبة الخسس</span>
            <span class="v" style="color:${isSus ? 'var(--danger)'
                        : sev === 'warning' ? 'var(--warn)'
                        : 'var(--success)'};font-weight:900">
              ${ticket.actual_loss.pct.toFixed(3)}%
            </span>
          </div>
          <div class="cl-row">
            <span class="k"><i data-lucide="scale"></i> الخسس (جم)</span>
            <span class="v">${GMS.gramFmt(ticket.actual_loss.grams)} جم</span>
          </div>
        </div>

        ${isSus ? `
          <div style="margin-top:14px;padding:12px 14px;border-radius:10px;
                      background:var(--danger-bg);color:var(--danger);
                      border:1px solid color-mix(in srgb,var(--danger) 35%,transparent);
                      font-size:12px;font-weight:800;line-height:1.6">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
              <i data-lucide="shield-alert" style="width:15px;height:15px"></i>
              <span>SUSPICIOUS_LOSS — تم تسجيل العملية للمراجعة</span>
            </div>
            <div style="font-weight:600;font-size:11.5px">
              تجاوزت نسبة الخسس الحد الآمن. سيتم إشعار المحاسب للمراجعة.
            </div>
          </div>
        ` : ''}
      `,
      footer: `
        <button class="btn" data-close>إغلاق</button>
        <button class="btn btn-primary" id="rep-delivered-print">
          <i data-lucide="printer"></i> طباعة إيصال التسليم
        </button>
      `,
      onMount: (el, close) => {
        el.querySelector('#rep-delivered-print').onclick = () => {
          close();
          printDeliveryReceipt(ticket.id);
        };
      },
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §21 · DETAILS MODAL
     ═════════════════════════════════════════════════════════════════════ */

  function showTicketDetails(ticketId) {
    const ticket = RState.tickets.find(t => t.id === ticketId);
    if (!ticket) return;

    const status = TICKET_STATUS[ticket.status] || TICKET_STATUS.RECEIVED;
    const serviceList = Object.values(SERVICE_TYPES)
      .filter(s => ticket.services?.[s.key]?.enabled);

    GMS.Modal.open({
      title: `تفاصيل التكت — ${ticket.ticket_no}`,
      icon: 'clipboard-list',
      size: 'lg',
      body: `
        <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;
                    background:var(--${status.color}-bg);border-radius:12px;
                    margin-bottom:16px;border:1px solid
                    color-mix(in srgb,var(--${status.color}) 30%,var(--border))">
          <div style="width:40px;height:40px;border-radius:11px;
                      background:var(--${status.color});color:#fff;
                      display:grid;place-items:center;flex-shrink:0">
            <i data-lucide="${status.icon}" style="width:20px;height:20px"></i>
          </div>
          <div style="flex:1">
            <div style="font-weight:900;font-size:14px;
                        color:var(--${status.color})">
              ${status.label}
            </div>
            <div style="font-size:11px;color:var(--muted);font-weight:700;
                        margin-top:3px">
              ${GMS.dateTimeAr(ticket.created_at)} · ${GMS.timeAgo(ticket.created_at)}
            </div>
          </div>
          <span class="mono" style="font-size:12px;font-weight:900;
                      color:var(--primary)">
            ${escapeHTML(ticket.ticket_no)}
          </span>
        </div>

        <div class="calc-list" style="margin-bottom:14px">
          <div class="cl-row">
            <span class="k"><i data-lucide="user"></i> العميل</span>
            <span class="v" style="font-size:12.5px">
              ${escapeHTML(ticket.customer.name)}
            </span>
          </div>
          <div class="cl-row">
            <span class="k"><i data-lucide="phone"></i> الهاتف</span>
            <span class="v mono" style="font-size:12.5px">
              ${escapeHTML(ticket.customer.phone)}
            </span>
          </div>
          <div class="cl-row">
            <span class="k"><i data-lucide="gem"></i> القطعة</span>
            <span class="v" style="font-size:12.5px">
              ${escapeHTML(ticket.item.category)}
            </span>
          </div>
          <div class="cl-row">
            <span class="k"><i data-lucide="hash"></i> كود القطعة</span>
            <span class="v mono" style="font-size:11px">
              ${escapeHTML(ticket.item.sku)}
            </span>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;
                    margin-bottom:14px">
          <div style="padding:12px;background:var(--surface-2);border-radius:10px;
                      border:1px solid var(--border)">
            <div style="font-size:10.5px;color:var(--muted);font-weight:800;
                        text-transform:uppercase">وزن الاستلام</div>
            <div class="mono" style="font-size:16px;font-weight:900;margin-top:5px">
              ${GMS.gramFmt(ticket.weight_in_net)} جم
            </div>
            <div style="font-size:10px;color:var(--muted);font-weight:700;
                        margin-top:3px">
              ${ticket.karat_in}K · بندق ${GMS.gramFmt(ticket.weight_in_pure)}
            </div>
          </div>

          <div style="padding:12px;background:var(--info-bg);border-radius:10px;
                      border:1px solid color-mix(in srgb,var(--info) 30%,var(--border))">
            <div style="font-size:10.5px;color:var(--info);font-weight:800;
                        text-transform:uppercase">المتوقع</div>
            <div class="mono" style="font-size:16px;font-weight:900;margin-top:5px;
                        color:var(--info)">
              ${GMS.gramFmt(ticket.expected_net)} جم
            </div>
            <div style="font-size:10px;color:var(--muted);font-weight:700;
                        margin-top:3px">
              بندق ${GMS.gramFmt(ticket.expected_pure)}
            </div>
          </div>

          <div style="padding:12px;background:var(--gold-soft);border-radius:10px;
                      border:1px solid color-mix(in srgb,var(--primary) 40%,var(--border))">
            <div style="font-size:10.5px;color:var(--warn);font-weight:800;
                        text-transform:uppercase">الوزن الفعلي</div>
            <div class="mono" style="font-size:16px;font-weight:900;margin-top:5px;
                        color:var(--primary)">
              ${ticket.weight_out_net ? GMS.gramFmt(ticket.weight_out_net) + ' جم' : '—'}
            </div>
            ${ticket.actual_loss ? `
              <div style="font-size:10px;font-weight:800;margin-top:3px;
                          color:${ticket.actual_loss.isSuspicious ? 'var(--danger)'
                                : ticket.actual_loss.severity === 'warning' ? 'var(--warn)'
                                : 'var(--success)'}">
                خسس ${ticket.actual_loss.pct.toFixed(3)}%
              </div>
            ` : ''}
          </div>
        </div>

        <div style="font-size:11px;font-weight:800;color:var(--muted);
                    text-transform:uppercase;letter-spacing:.4px;
                    margin:16px 0 9px">الخدمات المطلوبة</div>

        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));
                    gap:8px;margin-bottom:14px">
          ${serviceList.map(s => `
            <div style="padding:10px 12px;border-radius:10px;
                        background:var(--${s.color}-bg);
                        border:1px solid color-mix(in srgb,var(--${s.color}) 30%,var(--border))">
              <div style="display:flex;align-items:center;gap:6px;
                          font-size:11.5px;font-weight:800;
                          color:var(--${s.color})">
                <i data-lucide="${s.icon}" style="width:13px;height:13px"></i>
                ${s.label}
              </div>
              ${ticket.services[s.key]?.fee ? `
                <div class="mono" style="font-size:11px;font-weight:800;
                            margin-top:4px;color:var(--text-2)">
                  ${GMS.moneyFmt(ticket.services[s.key].fee)} ج.م
                </div>
              ` : ''}
            </div>
          `).join('')}
        </div>

        <div class="calc-list">
          <div class="cl-row">
            <span class="k"><i data-lucide="wrench"></i> أجرة الخدمات</span>
            <span class="v">${GMS.moneyFmt(ticket.labor_fee || 0)} ج.م</span>
          </div>
          ${Number(ticket.added_gold_cost || 0) > 0 ? `
            <div class="cl-row">
              <span class="k"><i data-lucide="plus-circle"></i> قيمة الذهب المضاف</span>
              <span class="v" style="color:var(--success)">
                ${GMS.moneyFmt(ticket.added_gold_cost)} ج.م
              </span>
            </div>
          ` : ''}
          ${Number(ticket.cut_gold_credit || 0) > 0 ? `
            <div class="cl-row">
              <span class="k"><i data-lucide="vault"></i> رصيد الكسر</span>
              <span class="v" style="color:var(--warn)">
                − ${GMS.moneyFmt(ticket.cut_gold_credit)} ج.م
              </span>
            </div>
          ` : ''}
          <div class="cl-row hi">
            <span class="k"><i data-lucide="banknote"></i> الإجمالي</span>
            <span class="v">${GMS.moneyFmt(ticket.grand_total || 0)} ج.م</span>
          </div>
          ${ticket.payment ? `
            <div class="cl-row">
              <span class="k"><i data-lucide="check-circle-2"></i> المدفوع</span>
              <span class="v" style="color:var(--success)">
                ${GMS.moneyFmt(ticket.payment.paid)} ج.م
              </span>
            </div>
          ` : ''}
        </div>
      `,
      footer: `
        <button class="btn" data-close>إغلاق</button>
        <button class="btn" id="rep-details-print-intake">
          <i data-lucide="printer"></i> إيصال الاستلام
        </button>
        ${ticket.status === 'DELIVERED' ? `
          <button class="btn btn-primary" id="rep-details-print-delivery">
            <i data-lucide="printer"></i> إيصال التسليم
          </button>
        ` : ''}
      `,
      onMount: (el, close) => {
        el.querySelector('#rep-details-print-intake').onclick = () => {
          close();
          printIntakeReceipt(ticket.id);
        };

        const delBtn = el.querySelector('#rep-details-print-delivery');
        if (delBtn) {
          delBtn.onclick = () => {
            close();
            printDeliveryReceipt(ticket.id);
          };
        }
      },
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §22 · PRINT RECEIPTS
     ═════════════════════════════════════════════════════════════════════ */

  function printIntakeReceipt(ticketId) {
    const ticket = typeof ticketId === 'object'
      ? ticketId
      : RState.tickets.find(t => t.id === ticketId);
    if (!ticket) return;

    const root = document.getElementById('print-root');
    if (!root) return;

    const serviceList = Object.values(SERVICE_TYPES)
      .filter(s => ticket.services?.[s.key]?.enabled);

    root.innerHTML = `
      <div style="font-family:'Cairo',sans-serif;direction:rtl;color:#000;
                  width:80mm;padding:4mm">
        <div style="text-align:center;border-bottom:1.5px dashed #000;
                    padding-bottom:3mm;margin-bottom:3mm">
          <h1 style="font-size:14pt;font-weight:900;margin:0 0 2mm">
            ${GMS.esc(GMS.APP_CONFIG.NAME_AR)}
          </h1>
          <p style="margin:1mm 0;font-size:9pt;color:#333">
            إيصال استلام قطعة للصيانة
          </p>
        </div>

        <div style="text-align:center;font-size:11pt;font-weight:900;
                    background:#f1e8d0;padding:2.5mm;border:1px solid #000;
                    margin-bottom:3mm;letter-spacing:.5px">
          ${GMS.esc(ticket.ticket_no)}
        </div>

        <div class="rp-line">
          <span>التاريخ</span>
          <b>${GMS.dateTimeAr(ticket.created_at)}</b>
        </div>
        <div class="rp-line">
          <span>العميل</span>
          <b>${GMS.esc(ticket.customer.name)}</b>
        </div>
        <div class="rp-line">
          <span>الهاتف</span>
          <b class="mono">${GMS.esc(ticket.customer.phone)}</b>
        </div>

        <hr style="border:none;border-top:1px dashed #666;margin:3mm 0">

        <div class="rp-line">
          <span>نوع القطعة</span>
          <b>${GMS.esc(ticket.item.category)}</b>
        </div>
        <div class="rp-line">
          <span>كود القطعة</span>
          <b class="mono" style="font-size:8.5pt">${GMS.esc(ticket.item.sku)}</b>
        </div>
        <div class="rp-line">
          <span>العيار</span>
          <b>${ticket.karat_in}K</b>
        </div>

        <hr style="border:none;border-top:1px dashed #666;margin:3mm 0">

        <div class="rp-row" style="display:flex;justify-content:space-between;
                    font-size:9.5pt;margin:1.5mm 0">
          <span>الوزن القائم</span>
          <b class="mono">${GMS.gramFmt(ticket.weight_in_gross)} جم</b>
        </div>
        <div class="rp-row" style="display:flex;justify-content:space-between;
                    font-size:9.5pt;margin:1.5mm 0">
          <span>وزن الأحجار</span>
          <b class="mono">${GMS.gramFmt(ticket.weight_in_stones)} جم</b>
        </div>
        <div class="rp-row" style="display:flex;justify-content:space-between;
                    font-size:10.5pt;margin:1.5mm 0;font-weight:900">
          <span>الوزن الصافي</span>
          <b class="mono">${GMS.gramFmt(ticket.weight_in_net)} جم</b>
        </div>
        <div class="rp-row" style="display:flex;justify-content:space-between;
                    font-size:9.5pt;margin:1.5mm 0">
          <span>البندق 24K</span>
          <b class="mono">${GMS.gramFmt(ticket.weight_in_pure)} جم</b>
        </div>

        <hr style="border:none;border-top:1px dashed #666;margin:3mm 0">

        <div style="font-size:9pt;font-weight:900;margin-bottom:2mm">
          الخدمات المطلوبة:
        </div>
        ${serviceList.map(s => `
          <div style="display:flex;justify-content:space-between;
                      font-size:9pt;margin:1mm 0">
            <span>• ${s.label}</span>
            ${ticket.services[s.key]?.fee ? `
              <span class="mono">${GMS.moneyFmt(ticket.services[s.key].fee)} ج.م</span>
            ` : ''}
          </div>
        `).join('')}

        <hr style="border:none;border-top:1.5px solid #000;margin:3mm 0">
        <div style="display:flex;justify-content:space-between;
                    font-size:11pt;font-weight:900">
          <span>الإجمالي المتوقع</span>
          <span class="mono">${GMS.moneyFmt(ticket.grand_total || 0)} ج.م</span>
        </div>

        ${ticket.expected_net ? `
          <div style="margin-top:2mm;padding:2mm;background:#f5f5f5;
                      border-radius:1mm;font-size:8.5pt;text-align:center">
            الوزن المتوقع عند التسليم:
            <b class="mono">${GMS.gramFmt(ticket.expected_net)} جم</b>
          </div>
        ` : ''}

        <hr style="border:none;border-top:1px dashed #666;margin:4mm 0 3mm">

        <div style="text-align:center;font-size:8.5pt;color:#333;
                    margin-bottom:4mm">
          يُرجى إحضار هذا الإيصال عند التسليم<br>
          الشركة غير مسؤولة عن القطع بعد 60 يوم من جاهزيتها
        </div>

        <div style="display:flex;justify-content:space-between;font-size:8.5pt;
                    margin-top:6mm">
          <div style="border-top:1px solid #000;padding-top:2mm;
                      min-width:28mm;text-align:center">توقيع المستلم</div>
          <div style="border-top:1px solid #000;padding-top:2mm;
                      min-width:28mm;text-align:center">توقيع البائع</div>
        </div>
      </div>
    `;

    /* إعادة @page للحجم الحراري */
    const pageStyle = document.getElementById('gms-page-size-style');
    if (pageStyle) {
      pageStyle.textContent = `
        @media print {
          @page { size: 80mm auto; margin: 0; }
        }
      `;
    }

    setTimeout(() => {
      window.print();
      setTimeout(() => {
        if (pageStyle) {
          pageStyle.textContent = `
            @media print {
              @page { size: 80mm auto; margin: 0; }
            }
          `;
        }
      }, 1500);
    }, 150);
  }

  function printDeliveryReceipt(ticketId) {
    const ticket = typeof ticketId === 'object'
      ? ticketId
      : RState.tickets.find(t => t.id === ticketId);
    if (!ticket || !ticket.delivered_at) return;

    const root = document.getElementById('print-root');
    if (!root) return;

    const isSus = ticket.actual_loss?.isSuspicious;

    root.innerHTML = `
      <div style="font-family:'Cairo',sans-serif;direction:rtl;color:#000;
                  width:80mm;padding:4mm">
        <div style="text-align:center;border-bottom:1.5px dashed #000;
                    padding-bottom:3mm;margin-bottom:3mm">
          <h1 style="font-size:14pt;font-weight:900;margin:0 0 2mm">
            ${GMS.esc(GMS.APP_CONFIG.NAME_AR)}
          </h1>
          <p style="margin:1mm 0;font-size:9pt;color:#333">
            إيصال تسليم قطعة صيانة
          </p>
        </div>

        <div style="text-align:center;font-size:11pt;font-weight:900;
                    background:#e6f6ee;padding:2.5mm;border:1px solid #000;
                    margin-bottom:3mm">
          ${GMS.esc(ticket.ticket_no)}
        </div>

        <div class="rp-line">
          <span>التاريخ</span>
          <b>${GMS.dateTimeAr(ticket.delivered_at)}</b>
        </div>
        <div class="rp-line">
          <span>العميل</span>
          <b>${GMS.esc(ticket.customer.name)}</b>
        </div>
        <div class="rp-line">
          <span>الهاتف</span>
          <b class="mono">${GMS.esc(ticket.customer.phone)}</b>
        </div>

        <hr style="border:none;border-top:1px dashed #666;margin:3mm 0">

        <div class="rp-row" style="display:flex;justify-content:space-between;
                    font-size:9.5pt;margin:1.5mm 0">
          <span>الوزن عند الاستلام</span>
          <b class="mono">${GMS.gramFmt(ticket.weight_in_net)} جم</b>
        </div>
        <div class="rp-row" style="display:flex;justify-content:space-between;
                    font-size:9.5pt;margin:1.5mm 0">
          <span>الوزن المتوقع</span>
          <b class="mono">${GMS.gramFmt(ticket.expected_net)} جم</b>
        </div>
        <div class="rp-row" style="display:flex;justify-content:space-between;
                    font-size:11pt;margin:1.5mm 0;font-weight:900">
          <span>الوزن الفعلي عند التسليم</span>
          <b class="mono">${GMS.gramFmt(ticket.weight_out_net)} جم</b>
        </div>
        <div class="rp-row" style="display:flex;justify-content:space-between;
                    font-size:9pt;margin:1.5mm 0;color:#333">
          <span>نسبة الخسس</span>
          <b class="mono">${ticket.actual_loss.pct.toFixed(3)}%</b>
        </div>

        <hr style="border:none;border-top:1px dashed #666;margin:3mm 0">

        <div class="rp-row" style="display:flex;justify-content:space-between;
                    font-size:9.5pt;margin:1.5mm 0">
          <span>أجرة الخدمات</span>
          <b class="mono">${GMS.moneyFmt(ticket.labor_fee || 0)} ج.م</b>
        </div>
        ${Number(ticket.added_gold_cost || 0) > 0 ? `
          <div class="rp-row" style="display:flex;justify-content:space-between;
                      font-size:9.5pt;margin:1.5mm 0">
            <span>قيمة الذهب المضاف</span>
            <b class="mono">${GMS.moneyFmt(ticket.added_gold_cost)} ج.م</b>
          </div>
        ` : ''}
        ${Number(ticket.cut_gold_credit || 0) > 0 ? `
          <div class="rp-row" style="display:flex;justify-content:space-between;
                      font-size:9.5pt;margin:1.5mm 0;color:#a55a00">
            <span>رصيد الكسر (خزنة المحل)</span>
            <b class="mono">− ${GMS.moneyFmt(ticket.cut_gold_credit)} ج.م</b>
          </div>
        ` : ''}

        <hr style="border:none;border-top:1.5px solid #000;margin:3mm 0">
        <div style="display:flex;justify-content:space-between;
                    font-size:12pt;font-weight:900">
          <span>الإجمالي</span>
          <span class="mono">${GMS.moneyFmt(ticket.grand_total || 0)} ج.م</span>
        </div>

        <div class="rp-line" style="margin-top:2mm">
          <span>طريقة الدفع</span>
          <b>${GMS.getPaymentMethod(ticket.payment.method).label}</b>
        </div>
        <div class="rp-line">
          <span>المدفوع</span>
          <b class="mono">${GMS.moneyFmt(ticket.payment.paid)} ج.م</b>
        </div>
        ${ticket.payment.change > 0 ? `
          <div class="rp-line">
            <span>الباقي</span>
            <b class="mono">${GMS.moneyFmt(ticket.payment.change)} ج.م</b>
          </div>
        ` : ''}

        ${isSus ? `
          <div style="margin-top:4mm;padding:2.5mm;background:#fdecea;
                      border:1px solid #b3261e;border-radius:1mm;
                      font-size:8.5pt;font-weight:800;color:#b3261e;
                      text-align:center">
            ⚠ تنبيه خسس غير طبيعي — تم تسجيل العملية للمراجعة
          </div>
        ` : ''}

        <hr style="border:none;border-top:1px dashed #666;margin:4mm 0 3mm">
        <div style="text-align:center;font-size:8.5pt;color:#333">
          شكراً لتعاملكم معنا
        </div>

        <div style="display:flex;justify-content:space-between;font-size:8.5pt;
                    margin-top:6mm">
          <div style="border-top:1px solid #000;padding-top:2mm;
                      min-width:28mm;text-align:center">توقيع العميل</div>
          <div style="border-top:1px solid #000;padding-top:2mm;
                      min-width:28mm;text-align:center">توقيع البائع</div>
        </div>
      </div>
    `;

    const pageStyle = document.getElementById('gms-page-size-style');
    if (pageStyle) {
      pageStyle.textContent = `
        @media print {
          @page { size: 80mm auto; margin: 0; }
        }
      `;
    }

    setTimeout(() => window.print(), 150);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §23 · EXPORT
     ═════════════════════════════════════════════════════════════════════ */

  function exportLedger() {
    if (!window.XLSX) {
      GMS.Toast.err('محرك Excel غير متاح');
      return;
    }

    const rows = RState.filtered.length ? RState.filtered : RState.tickets;
    if (!rows.length) {
      GMS.Toast.warn('لا توجد بيانات للتصدير');
      return;
    }

    try {
      const data = rows.map(t => {
        const services = Object.values(SERVICE_TYPES)
          .filter(s => t.services?.[s.key]?.enabled)
          .map(s => s.label).join(' + ');

        return {
          'رقم التكت': t.ticket_no,
          'الحالة': TICKET_STATUS[t.status]?.label || t.status,
          'اسم العميل': t.customer?.name || '',
          'الهاتف': t.customer?.phone || '',
          'التصنيف': t.item?.category || '',
          'كود القطعة': t.item?.sku || '',
          'العيار': t.karat_in,
          'الخدمات': services,
          'وزن الاستلام (جم)': t.weight_in_net,
          'البندق وارد (جم)': t.weight_in_pure,
          'الوزن المتوقع (جم)': t.expected_net,
          'الوزن الفعلي (جم)': t.weight_out_net || '',
          'الخسس (جم)': t.actual_loss?.grams || '',
          'الخسس (%)': t.actual_loss?.pct || '',
          'تصنيف الخسس': t.actual_loss?.severity || '',
          'خسس مشبوه': t.actual_loss?.isSuspicious ? 'نعم' : 'لا',
          'أجرة الخدمات (ج.م)': t.labor_fee,
          'قيمة الذهب المضاف (ج.م)': t.added_gold_cost,
          'رصيد الكسر (ج.م)': t.cut_gold_credit,
          'الإجمالي (ج.م)': t.grand_total,
          'المدفوع (ج.م)': t.payment?.paid || '',
          'طريقة الدفع': t.payment ? GMS.getPaymentMethod(t.payment.method).label : '',
          'تاريخ الاستلام': GMS.dateTimeAr(t.created_at),
          'تاريخ التسليم': t.delivered_at ? GMS.dateTimeAr(t.delivered_at) : '',
          'بواسطة': t.created_by,
        };
      });

      const ws = XLSX.utils.json_to_sheet(data);
      ws['!cols'] = [
        { wch: 18 }, { wch: 14 }, { wch: 20 }, { wch: 14 },
        { wch: 12 }, { wch: 20 }, { wch: 8 }, { wch: 30 },
        { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 },
        { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 },
        { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 14 },
        { wch: 14 }, { wch: 14 }, { wch: 20 }, { wch: 20 },
        { wch: 20 },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'دفتر الصيانة');

      /* Stats sheet */
      const s = RState.stats;
      const statsData = [
        ['إحصائيات دفتر الصيانة'],
        ['تاريخ التصدير', new Date().toLocaleString('ar-EG')],
        [''],
        ['المؤشر', 'القيمة'],
        ['إجمالي التكتات', s.total],
        ['قيد الانتظار', s.received],
        ['قيد الصيانة', s.inProgress],
        ['جاهز للتسليم', s.ready],
        ['مُسلَّم', s.delivered],
        ['ملغى', s.cancelled],
        ['إجمالي الإيرادات (ج.م)', s.totalCashRevenue],
        ['ذهب مضاف (بندق 24K)', s.totalAddedGold],
        ['ذهب مقصوص للخزنة (بندق 24K)', s.totalCutGold],
        ['خزنة كسر الصيانة (بندق 24K)', s.scrapVaultGold],
        ['عمليات خسس مشبوهة', s.suspiciousLosses],
      ];

      const wsStats = XLSX.utils.aoa_to_sheet(statsData);
      wsStats['!cols'] = [{ wch: 32 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(wb, wsStats, 'الإحصائيات');

      XLSX.writeFile(wb, `repair_ledger_${GMS.todayISO()}.xlsx`);
      GMS.Toast.ok(`تم تصدير ${rows.length} تكت`);

      if (GMS.Audit) {
        GMS.Audit.log('EXPORT', 'repair', null,
          `تصدير ${rows.length} تكت صيانة`, { count: rows.length });
      }

    } catch (e) {
      console.error('[Repair.exportLedger]', e);
      GMS.Toast.err('فشل التصدير', e.message);
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §24 · INIT & CLEANUP
     ═════════════════════════════════════════════════════════════════════ */

  async function init() {
    loadTickets();

    /* Load من Supabase إذا متصل */
    if (GMS.Supabase?.isReady?.()) {
      try {
        const client = GMS.Supabase.get();
        const { data, error } = await client
          .from('repairs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(200);

        if (!error && data && data.length) {
          // merge with local — prefer local (has full state)
          const localIds = new Set(RState.tickets.map(t => t.ticket_no));
          data.forEach(row => {
            if (!localIds.has(row.ticket_no)) {
              RState.tickets.push({
                id: row.id || GMS.uid(),
                ticket_no: row.ticket_no,
                status: row.status,
                customer: {
                  name: row.customer_name || '',
                  phone: row.customer_phone || '',
                },
                item: {
                  category: row.item_category || '',
                  sku: row.item_sku || '',
                  notes: row.notes || '',
                },
                karat_in: row.karat_in,
                weight_in_gross: row.weight_in_gross,
                weight_in_stones: row.weight_in_stones,
                weight_in_net: row.weight_in_net,
                weight_in_pure: row.weight_in_pure,
                services: row.services || {},
                expected_net: row.expected_net,
                expected_pure: row.expected_pure,
                weight_out_net: row.weight_out_net,
                weight_out_pure: row.weight_out_pure,
                actual_loss: row.actual_loss_pct ? {
                  grams: row.actual_loss_grams,
                  pct: row.actual_loss_pct,
                  severity: row.loss_severity,
                  isSuspicious: row.is_suspicious,
                } : null,
                labor_fee: row.labor_fee || 0,
                added_gold_cost: row.added_gold_cost || 0,
                cut_gold_credit: row.cut_gold_credit || 0,
                stones_cost: row.stones_cost || 0,
                grand_total: row.grand_total || 0,
                payment: row.payment,
                gold_delta: row.gold_delta || 0,
                cash_delta: row.cash_delta || 0,
                created_at: row.created_at,
                delivered_at: row.delivered_at,
                created_by: row.created_by || '—',
              });
            }
          });
        }
      } catch (e) {
        console.warn('[Repair] Supabase load failed:', e);
      }
    }

    applyFilters();
    updateStats();
  }

  function cleanup() {
    cleanupListeners();
  }

  /* ═════════════════════════════════════════════════════════════════════
     §25 · VIEW REGISTRATION
     ═════════════════════════════════════════════════════════════════════ */
  GMS.Views = GMS.Views || {};

  GMS.Views.repair = {
    render: async (root) => {
      await init();
      render(root);
    },
    cleanup,
    state: RState,

    /* Data */
    load: loadTickets,
    reload: init,

    /* Actions */
    openIntake: openIntakeModal,
    openDelivery: openDeliveryModal,
    showDetails: showTicketDetails,
    startRepair,
    markReady,

    /* Print */
    printIntake: printIntakeReceipt,
    printDelivery: printDeliveryReceipt,

    /* Export */
    export: exportLedger,

    /* Helpers (testable) */
    computeExpectedOut,
    computeRepairCost,
    evaluateRepairTolerance,
    getTolerance: getRepairTolerance,

    /* Constants */
    SERVICE_TYPES,
    TICKET_STATUS,
    CUT_DISPOSITION,
  };

  /* Expose constants globally */
  GMS.REPAIR_CONSTANTS = {
    SERVICE_TYPES,
    TICKET_STATUS,
    CUT_DISPOSITION,
    TOLERANCE: REPAIR_TOLERANCE,
  };

  /* ═════════════════════════════════════════════════════════════════════
     §26 · LOADED CONFIRMATION
     ═════════════════════════════════════════════════════════════════════ */
  console.log(
    '%c🔧 Repair & Workshop Module loaded',
    'color:#b8912f;font-weight:900;font-size:13px;padding:2px 6px;' +
    'background:linear-gradient(135deg,#f0d68c,#9c7726);border-radius:4px;'
  );

  console.log(
    `%c📋 5 services · 5 statuses · Dual Ledger (Gold+Cash) · Tolerance Engine`,
    'color:#6b7a95;font-weight:700;font-size:11px;'
  );

  /* ═════════════════════════════════════════════════════════════════════
     ✅ js/24-views-repair.js — نهاية الملف
     ═════════════════════════════════════════════════════════════════════ */

})();