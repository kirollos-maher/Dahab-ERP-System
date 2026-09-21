/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ENTERPRISE — js/16-views-returns.js
   صفحة المرتجعات وشراء الكسر:
     - مرتجع مبيعات (Customer Return)
     - شراء كسر / مستعمل (Scrap Buyback)
     - مرتجع موردين (Supplier Return)
     - كشف حساب عميل (Store Credit)
     - طباعة إيصالات
     - سياسة إرجاع قابلة للتخصيص
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const GMS = window.GMS = window.GMS || {};

  /* ═════════════════════════════════════════════════════════════════════
     §1 · RETURNS STATE
     ═════════════════════════════════════════════════════════════════════ */
  const RetState = {
    /* البيانات */
    returns: [],
    wallet: [],

    /* التبويب النشط */
    activeTab: 'sales-return',

    /* ─── مرتجع مبيعات ────────────────────────────────────────── */
    salesReturn: {
      scanInput: '',
      lastScan: null,
      item: null,
      sale: null,
      daysSinceSale: 0,
      refundPct: 100,
      refundAmount: 0,
      refundMethod: 'cash',
      reason: '',
      notes: '',
      valid: false,
    },

    /* ─── شراء كسر ───────────────────────────────────────────── */
    buyback: {
      karat: 21,
      gross: 0,
      stones: 0,
      testedPurity: GMS.karatRatio(21),
      mode: 'cash',
      customerName: '',
      customerPhone: '',
      notes: '',
      // Computed
      net: 0,
      pure: 0,
      baseRate: 0,
      appliedRate: 0,
      value: 0,
    },

    /* ─── مرتجع مورد ─────────────────────────────────────────── */
    supplierReturn: {
      supplierId: '',
      selectedItems: new Set(),
      itemPool: [],
      supplierBalance: { gold: 0, cash: 0 },
      notes: '',
    },

    /* الإحصائيات */
    stats: {
      totalReturns: 0,
      totalRefundEGP: 0,
      totalGoldReturned: 0,
      buybackCount: 0,
      buybackGold: 0,
      buybackValue: 0,
    },

    /* المستمعون */
    unsubscribers: [],

    /* مؤقتات */
    timers: {
      scan: null,
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §2 · HELPERS
     ═════════════════════════════════════════════════════════════════════ */

  function setText(selector, value) {
    const el = document.querySelector(selector);
    if (el && el.textContent !== String(value)) {
      el.textContent = String(value);
    }
  }

  function cleanupListeners() {
    RetState.unsubscribers.forEach(fn => {
      try { fn(); } catch (_) {}
    });
    RetState.unsubscribers = [];

    clearTimeout(RetState.timers.scan);
  }

  /**
   * سعر 24K الحالي
   */
  function getPrice24() {
    if (GMS.Cache) {
      const p = GMS.Cache.getPrice();
      if (p?.price_24) return Number(p.price_24);
    }
    return GMS.APP_CONFIG.DEFAULT_PRICE_24;
  }

  /**
   * هامش شراء الكسر
   */
  function getBuyMargin() {
    try {
      const saved = Number(localStorage.getItem(GMS.LS_KEYS.BUY_MARGIN));
      if (isFinite(saved) && saved > 0 && saved < 30) return saved;
    } catch (_) {}
    return 8;
  }

  /**
   * سياسة الإرجاع
   */
  function getReturnPolicy() {
    try {
      const saved = JSON.parse(localStorage.getItem('gms.return.policy') || 'null');
      if (saved) return saved;
    } catch (_) {}
    return {
      fullRefundDays: 14,
      partialRefundDays: 30,
      partialRefundPct: 90,
      noReturnBeyondDays: 30,
      creditWalletExpiryDays: 180,
    };
  }

  /* ═════════════════════════════════════════════════════════════════════
     §3 · DATA LOADING
     ───────────────────────────────────────────────────────────────────── */

  async function loadReturns() {
    try {
      if (GMS.Supabase?.isReady()) {
        try {
          const client = GMS.Supabase.get();
          const { data, error } = await client
            .from(GMS.SUPABASE_CONFIG.TABLES.RETURNS)
            .select('*')
            .order('created_at', { ascending: false })
            .limit(200);

          if (!error && data) {
            RetState.returns = data;
            return data;
          }
        } catch (e) {
          console.warn('[Returns] Supabase read failed:', e);
        }
      }

      if (GMS.Demo) {
        RetState.returns = GMS.Demo.getReturns();
        return RetState.returns;
      }

      return [];
    } catch (e) {
      console.error('[Returns] loadReturns:', e);
      return [];
    }
  }

  /**
   * تحميل محفظة العميل (Store Credit)
   */
  function loadWallet() {
    try {
      const saved = JSON.parse(localStorage.getItem(GMS.LS_KEYS.WALLET) || '[]');
      RetState.wallet = Array.isArray(saved) ? saved : [];
    } catch (_) {
      RetState.wallet = [];
    }
  }

  function saveWallet() {
    try {
      localStorage.setItem(GMS.LS_KEYS.WALLET, JSON.stringify(RetState.wallet.slice(0, 500)));
    } catch (_) {}
  }

  /**
   * البحث عن فاتورة بيع بواسطة SKU
   */
  async function findSaleBySku(sku) {
    const key = String(sku || '').trim().toUpperCase();
    if (!key) return null;

    /* 1 · IDB */
    if (GMS.IDB?.isOpen) {
      try {
        const item = await GMS.IDB.getBySku(key);
        if (item) {
          /* ابحث عن الفاتورة الأصلية */
          const sale = findSaleForItem(item.id);
          return { item, sale };
        }
      } catch (e) {
        console.warn('[Returns] IDB search failed:', e);
      }
    }

    /* 2 · Demo */
    if (GMS.Demo) {
      try {
        const item = GMS.Demo.getInventory().find(i => i.sku.toUpperCase() === key);
        if (item) {
          const sale = findSaleForItem(item.id);
          return { item, sale };
        }
      } catch (e) {
        console.warn('[Returns] Demo search failed:', e);
      }
    }

    return null;
  }

  /**
   * البحث عن فاتورة تحتوي على الصنف
   */
  function findSaleForItem(itemId) {
    if (!itemId) return null;
    if (!GMS.Demo) return null;

    const sales = GMS.Demo.getSales();
    /* ابحث في الفواتير الحديثة أولاً */
    return sales.find(s => {
      if (!s.lines) return false;
      return s.lines.some(l => l.inventory_id === itemId);
    }) || null;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §4 · RENDERERS — KPI + HEADER
     ───────────────────────────────────────────────────────────────────── */

  function updateStats() {
    const rows = RetState.returns;

    let refundEGP = 0;
    let goldReturned = 0;
    let buybackCount = 0;
    let buybackGold = 0;
    let buybackValue = 0;

    rows.forEach(r => {
      if (r.return_type === 'customer_return') {
        refundEGP += Number(r.refund_amount || 0) + Number(r.credit_issued || 0);
        goldReturned += Number(r.pure_weight || 0);
      } else if (r.return_type === 'buyback') {
        buybackCount++;
        buybackGold += Number(r.pure_weight || 0);
        buybackValue += Number(r.refund_amount || 0) + Number(r.credit_issued || 0);
      }
    });

    RetState.stats = {
      totalReturns: rows.length,
      totalRefundEGP: GMS.round(refundEGP, 2),
      totalGoldReturned: GMS.round(goldReturned, 4),
      buybackCount,
      buybackGold: GMS.round(buybackGold, 4),
      buybackValue: GMS.round(buybackValue, 2),
    };
  }

  function renderKPIs() {
    const s = RetState.stats;

    return `
      <div class="kpi-row cols-4">
        <div class="kpi warn">
          <div class="kpi-label">
            <i data-lucide="rotate-ccw"></i>
            إجمالي المرتجعات
          </div>
          <div class="kpi-value">${GMS.intFmt(s.totalReturns)}</div>
          <div class="kpi-meta">
            آخر 30 يوم
          </div>
        </div>

        <div class="kpi danger">
          <div class="kpi-label">
            <i data-lucide="banknote"></i>
            المبالغ المُستردة
          </div>
          <div class="kpi-value">${GMS.moneyFmt(s.totalRefundEGP)} <small>ج.م</small></div>
          <div class="kpi-meta">
            نقدي + رصيد متجر
          </div>
        </div>

        <div class="kpi gold">
          <div class="kpi-label">
            <i data-lucide="scale"></i>
            ذهب مرتجع
          </div>
          <div class="kpi-value">${GMS.gramFmt(s.totalGoldReturned)} <small>جم</small></div>
          <div class="kpi-meta">
            بندق 24K
          </div>
        </div>

        <div class="kpi success">
          <div class="kpi-label">
            <i data-lucide="recycle"></i>
            شراء الكسر
          </div>
          <div class="kpi-value">${GMS.gramFmt(s.buybackGold)} <small>جم</small></div>
          <div class="kpi-meta">
            <b>${s.buybackCount}</b> عملية · ${GMS.moneyFmt(s.buybackValue)} ج.م
          </div>
        </div>
      </div>
    `;
  }

  function renderTabs() {
    const tabs = [
      { key: 'sales-return', label: 'مرتجع مبيعات', icon: 'rotate-ccw' },
      { key: 'buyback', label: 'شراء كسر / مستعمل', icon: 'recycle' },
      { key: 'supplier-return', label: 'مرتجع موردين', icon: 'package-minus' },
    ];

    return `
      <div class="tabs-bar" style="position:relative;top:0;padding:0;
                  background:transparent;border-bottom:1px solid var(--border);
                  margin-bottom:20px">
        ${tabs.map(t => `
          <button class="tab ${RetState.activeTab === t.key ? 'active' : ''}"
                  data-ret-tab="${t.key}">
            <i data-lucide="${t.icon}"></i>
            <span>${t.label}</span>
          </button>
        `).join('')}
      </div>
    `;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §5 · TAB 1 — SALES RETURN
     ───────────────────────────────────────────────────────────────────── */

  function renderSalesReturnTab() {
    const r = RetState.salesReturn;

    return `
      <div class="workspace">
        <!-- LEFT: scan + verification -->
        <div>
          <!-- Scan Hero -->
          <div class="scan-hero" id="ret-scan-hero">
            <div class="sh-icon">
              <i data-lucide="scan-line"></i>
            </div>
            <h2>${GMS.t('ret.scanReturn')}</h2>
            <p>امسح باركود القطعة المُرجعة أو أدخل الكود يدوياً ثم اضغط Enter</p>
            <input id="ret-scan-input"
                   placeholder="SKU-XXXX-XXXX-XXXX"
                   value="${GMS.esc(r.scanInput)}"
                   autocomplete="off"
                   autocapitalize="off"
                   autocorrect="off"
                   spellcheck="false">
            <div class="scan-hint">
              <span><kbd>Enter</kbd> بحث</span>
              <span><kbd>Esc</kbd> مسح</span>
              <span><kbd>F2</kbd> تركيز</span>
            </div>
          </div>

          <!-- Verification / Result -->
          <div id="ret-verify-host">
            ${renderVerifyPlaceholder()}
          </div>
        </div>

        <!-- RIGHT: Refund summary -->
        <div style="position:sticky;top:calc(calc(var(--topbar-h) + var(--tabs-h)) + 22px)">
          <div class="card">
            <div class="card-head">
              <h3>
                <i data-lucide="receipt"></i>
                ملخص الاسترجاع
              </h3>
            </div>
            <div class="card-body" id="ret-summary">
              ${renderReturnSummary()}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderVerifyPlaceholder() {
    return `
      <div class="card">
        <div class="card-body">
          <div class="empty">
            <i data-lucide="package-search"></i>
            <p>في انتظار مسح الباركود</p>
            <span>امسح كود التاج للبحث عن القطعة وفاتورة البيع الأصلية</span>
          </div>
        </div>
      </div>
    `;
  }

  function renderVerifyCard(state = 'result') {
    if (state === 'loading') {
      return `
        <div class="verify-card">
          <div class="verify-head">
            <div class="vh-icon">
              <i data-lucide="loader-circle"></i>
            </div>
            <div>
              <div class="verify-title">جارٍ البحث…</div>
              <div class="verify-sub">يتم الاستعلام عن القطعة في قاعدة البيانات</div>
            </div>
          </div>
        </div>
      `;
    }

    const r = RetState.salesReturn;

    if (!r.item) {
      return `
        <div class="verify-card err">
          <div class="verify-head">
            <div class="vh-icon">
              <i data-lucide="x-circle"></i>
            </div>
            <div>
              <div class="verify-title">لم يتم العثور على القطعة</div>
              <div class="verify-sub">تأكد من كود التاج أو ابحث يدوياً</div>
            </div>
          </div>
        </div>
      `;
    }

    const it = r.item;
    const sale = r.sale;
    const policy = getReturnPolicy();

    /* تحديد الحالة */
    let cardClass = 'ok';
    let verifyTitle = 'القطعة مؤهلة للإرجاع';
    let verifySub = `تم العثور على الفاتورة الأصلية بتاريخ ${GMS.dateAr(sale?.created_at)}`;

    if (it.status !== 'SOLD') {
      cardClass = 'err';
      verifyTitle = 'القطعة غير قابلة للإرجاع';
      verifySub = `الحالة الحالية: ${GMS.getStatus(it.status)?.label || it.status}`;
    } else if (!sale) {
      cardClass = 'warn';
      verifyTitle = 'لا توجد فاتورة بيع أصلية';
      verifySub = 'يمكن استلامها ككسر بسعر الشراء فقط';
    } else if (r.daysSinceSale > policy.noReturnBeyondDays) {
      cardClass = 'err';
      verifyTitle = 'تجاوزت المدة المسموحة للإرجاع';
      verifySub = `${r.daysSinceSale} يوم منذ البيع — الحد الأقصى ${policy.noReturnBeyondDays} يوم`;
    } else if (r.daysSinceSale > policy.fullRefundDays) {
      cardClass = 'warn';
      verifyTitle = 'إرجاع بنسبة جزئية';
      verifySub = `بعد ${policy.fullRefundDays} يوم — خصم ${100 - policy.partialRefundPct}% رسوم إرجاع`;
    }

    return `
      <div class="verify-card ${cardClass}" style="margin-bottom:16px">
        <div class="verify-head">
          <div class="vh-icon">
            <i data-lucide="${cardClass === 'ok' ? 'check-circle-2' : cardClass === 'warn' ? 'alert-triangle' : 'x-circle'}"></i>
          </div>
          <div style="flex:1;min-width:0">
            <div class="verify-title">${GMS.esc(verifyTitle)}</div>
            <div class="verify-sub">${GMS.esc(verifySub)}</div>
          </div>
        </div>

        <div class="verify-grid">
          <div class="vg-item">
            <div class="vgi-k">كود التاج</div>
            <div class="vgi-v mono" style="font-size:12px">${GMS.esc(it.sku)}</div>
          </div>
          <div class="vg-item">
            <div class="vgi-k">العيار</div>
            <div class="vgi-v">
              <span class="karat-badge" data-k="${it.karat}">${it.karat}K</span>
            </div>
          </div>
          <div class="vg-item">
            <div class="vgi-k">الوزن الصافي</div>
            <div class="vgi-v">${GMS.gramFmt(it.net_weight)} <small>جم</small></div>
          </div>
          <div class="vg-item">
            <div class="vgi-k">البندق 24K</div>
            <div class="vgi-v" style="color:var(--primary)">${GMS.gramFmt(it.pure_weight)} <small>جم</small></div>
          </div>
        </div>

        ${sale ? `
          <div class="verify-grid" style="margin-top:14px">
            <div class="vg-item">
              <div class="vgi-k">رقم الفاتورة</div>
              <div class="vgi-v mono" style="font-size:11.5px">${GMS.esc(sale.sale_no || sale.invoice_no)}</div>
            </div>
            <div class="vg-item">
              <div class="vgi-k">العميل</div>
              <div class="vgi-v" style="font-size:12px">${GMS.esc(sale.customer_name || 'عميل نقدي')}</div>
            </div>
            <div class="vg-item">
              <div class="vgi-k">أيام منذ البيع</div>
              <div class="vgi-v" style="color:${r.daysSinceSale > policy.fullRefundDays ? 'var(--warn)' : 'var(--success)'}">
                ${r.daysSinceSale} يوم
              </div>
            </div>
            <div class="vg-item">
              <div class="vgi-k">المبلغ الأصلي</div>
              <div class="vgi-v" style="font-size:13px">${GMS.moneyFmt(sale.grand_total)} <small>ج.م</small></div>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  function renderReturnSummary() {
    const r = RetState.salesReturn;

    if (!r.item || !r.sale || !r.valid) {
      return `
        <div class="empty" style="padding:40px 20px">
          <i data-lucide="calculator"></i>
          <p>لا يوجد استرجاع نشط</p>
          <span>ابدأ بمسح الباركود</span>
        </div>
      `;
    }

    const policy = getReturnPolicy();
    const isPartial = r.refundPct < 100 && r.refundPct > 0;

    return `
      <div class="calc-list">
        <div class="cl-row">
          <span class="k"><i data-lucide="receipt"></i> الفاتورة الأصلية</span>
          <span class="v mono">${GMS.esc(r.sale.sale_no || r.sale.invoice_no)}</span>
        </div>
        <div class="cl-row">
          <span class="k"><i data-lucide="calendar"></i> تاريخ البيع</span>
          <span class="v">${GMS.dateAr(r.sale.created_at)}</span>
        </div>
        <div class="cl-row">
          <span class="k"><i data-lucide="clock"></i> عدد الأيام</span>
          <span class="v">${r.daysSinceSale} يوم</span>
        </div>
        <div class="cl-row">
          <span class="k"><i data-lucide="percent"></i> نسبة الاسترجاع</span>
          <span class="v" style="color:${r.refundPct === 100 ? 'var(--success)' : r.refundPct > 0 ? 'var(--warn)' : 'var(--danger)'}">
            ${r.refundPct}%
          </span>
        </div>
        <div class="cl-row">
          <span class="k"><i data-lucide="banknote"></i> السعر الأصلي</span>
          <span class="v mono">${GMS.moneyFmt(r.sale.grand_total)} ج.م</span>
        </div>
        ${isPartial ? `
          <div class="cl-row">
            <span class="k" style="color:var(--warn)">
              <i data-lucide="alert-triangle"></i> خصم رسوم الإرجاع
            </span>
            <span class="v mono" style="color:var(--warn)">
              − ${GMS.moneyFmt(r.sale.grand_total - r.refundAmount)} ج.م
            </span>
          </div>
        ` : ''}
        <div class="cl-row hi">
          <span class="k"><i data-lucide="arrow-down-circle"></i> المبلغ المُسترد</span>
          <span class="v mono">${GMS.moneyFmt(r.refundAmount)} ج.م</span>
        </div>
      </div>

      <div class="divider"></div>

      <div style="font-size:11px;font-weight:800;color:var(--muted);
                  text-transform:uppercase;letter-spacing:.5px;margin-bottom:9px;
                  display:flex;align-items:center;gap:6px">
        <i data-lucide="wallet" style="width:12px;height:12px"></i>
        طريقة الاسترجاع
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
        ${Object.entries(GMS.REFUND_METHODS).map(([key, m]) => `
          <button type="button"
                  class="mode-btn ${r.refundMethod === key ? 'active' : ''}"
                  data-refund="${key}"
                  style="border:1px solid ${r.refundMethod === key ? 'var(--primary)' : 'var(--border)'};
                         background:${r.refundMethod === key ? 'color-mix(in srgb,var(--primary) 12%,var(--surface))' : 'var(--surface-2)'};
                         padding:11px 12px;border-radius:9px;cursor:pointer;
                         display:flex;align-items:center;justify-content:center;
                         gap:7px;font-weight:800;font-size:12px;
                         color:${r.refundMethod === key ? 'var(--primary)' : 'var(--text-2)'};
                         transition:all .2s">
            <i data-lucide="${m.icon}" style="width:15px;height:15px"></i>
            ${m.label}
          </button>
        `).join('')}
      </div>

      <div class="field" style="margin-bottom:11px">
        <label>سبب الإرجاع <span class="req">*</span></label>
        <select id="ret-reason">
          <option value="">— اختر السبب —</option>
          <option value="size" ${r.reason === 'size' ? 'selected' : ''}>المقاس غير مناسب</option>
          <option value="defect" ${r.reason === 'defect' ? 'selected' : ''}>عيب صناعة</option>
          <option value="not_as_described" ${r.reason === 'not_as_described' ? 'selected' : ''}>مخالف للوصف</option>
          <option value="change_mind" ${r.reason === 'change_mind' ? 'selected' : ''}>تغيير رأي العميل</option>
          <option value="exchange" ${r.reason === 'exchange' ? 'selected' : ''}>استبدال بقطعة أخرى</option>
          <option value="other" ${r.reason === 'other' ? 'selected' : ''}>سبب آخر</option>
        </select>
      </div>

      <div class="field">
        <label>ملاحظات إضافية</label>
        <input id="ret-notes"
               placeholder="اختياري…"
               value="${GMS.esc(r.notes)}">
      </div>

      <div style="display:flex;gap:9px;margin-top:16px">
        <button class="btn btn-ghost" id="ret-cancel" style="flex:0 0 auto">
          <i data-lucide="x"></i>
          إلغاء
        </button>
        <button class="btn btn-primary btn-lg" id="ret-confirm"
                style="flex:1" ${!r.valid || !r.reason ? 'disabled' : ''}>
          <i data-lucide="check-circle-2"></i>
          تأكيد الإرجاع واسترداد ${GMS.moneyFmt(r.refundAmount)} ج.م
        </button>
      </div>
    `;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §6 · TAB 2 — BUYBACK
     ───────────────────────────────────────────────────────────────────── */

  function renderBuybackTab() {
    const b = RetState.buyback;
    const buy24 = GMS.round(getPrice24() * (1 - getBuyMargin() / 100), 2);

    return `
      <div class="workspace">
        <!-- LEFT: form -->
        <div>
          <div class="card">
            <div class="card-head">
              <h3>
                <i data-lucide="recycle"></i>
                شراء كسر / مستعمل
              </h3>
              <div class="spacer" style="flex:1"></div>
              <span class="card-sub">
                سعر الشراء 24K: ${GMS.moneyFmt(buy24)} ج.م/جم
              </span>
            </div>

            <div class="card-body">
              <!-- Karat -->
              <div style="font-size:11px;font-weight:800;color:var(--muted);
                          text-transform:uppercase;letter-spacing:.5px;
                          margin-bottom:9px">
                <i data-lucide="gem" style="width:12px;height:12px;
                           display:inline;vertical-align:-2px"></i>
                العيار المُدَّعى
              </div>
              <div class="karat-grid" id="bb-karat-grid">
                ${GMS.KARAT_ORDER.map(k => `
                  <button type="button"
                          class="karat-btn ${k === b.karat ? 'active' : ''}"
                          data-bb-karat="${k}">
                    <div class="kb-num">${k}K</div>
                    <div class="kb-ratio">${GMS.karatRatio(k).toFixed(4)}</div>
                  </button>
                `).join('')}
              </div>

              <!-- Weights -->
              <div class="grid-form three" style="margin-top:14px">
                <div class="field">
                  <label>
                    الوزن القائم (جم)
                    <span class="hint">0.001g</span>
                  </label>
                  <input type="number" id="bb-gross" class="big"
                         step="0.001" min="0"
                         value="${b.gross || ''}"
                         placeholder="0.000">
                </div>
                <div class="field">
                  <label>وزن الأحجار (جم)</label>
                  <input type="number" id="bb-stones"
                         step="0.001" min="0"
                         value="${b.stones || 0}"
                         style="text-align:center;font-weight:800">
                </div>
                <div class="field">
                  <label>الوزن الصافي (جم)</label>
                  <input id="bb-net" readonly
                         value="${b.net || 0}"
                         style="text-align:center;font-weight:800;
                                background:var(--surface-3)">
                </div>
              </div>

              <!-- Purity -->
              <div style="background:var(--surface-2);border-radius:12px;
                          padding:14px 16px;border:1px solid var(--border);
                          margin-top:14px">
                <div style="display:flex;align-items:center;
                            justify-content:space-between;margin-bottom:10px">
                  <div style="font-size:11.5px;font-weight:800;color:var(--text-2);
                              display:flex;align-items:center;gap:6px">
                    <i data-lucide="test-tube" style="width:13px;height:13px"></i>
                    النقاء المُختبَر (XRF / Acid Test)
                  </div>
                  <div class="mono" id="bb-purity-display"
                       style="font-size:18px;font-weight:900;
                              color:var(--primary)">
                    ${b.testedPurity.toFixed(4)}
                  </div>
                </div>

                <input type="range" id="bb-purity-slider"
                       min="0.5000" max="1.0000" step="0.0005"
                       value="${b.testedPurity}"
                       style="width:100%;height:6px;border-radius:4px;
                              -webkit-appearance:none;
                              background:linear-gradient(90deg,
                                color-mix(in srgb,var(--danger) 40%,var(--surface-3)) 0%,
                                color-mix(in srgb,var(--warn) 40%,var(--surface-3)) 50%,
                                color-mix(in srgb,var(--success) 40%,var(--surface-3)) 100%)">

                <div style="display:flex;justify-content:space-between;
                            font-size:10px;color:var(--muted);font-weight:700;
                            margin-top:6px;font-family:var(--font-mono)">
                  <span>0.5000</span>
                  <span>0.7500 (18K)</span>
                  <span>0.8750 (21K)</span>
                  <span>1.0000 (24K)</span>
                </div>

                <div class="grid-form three" style="gap:9px;margin-top:12px">
                  <div class="field">
                    <label style="font-size:10.5px">نقاء مُدخل يدوياً</label>
                    <input type="number" id="bb-purity-input"
                           step="0.0001" min="0.4" max="1.0"
                           value="${b.testedPurity}"
                           style="text-align:center;font-weight:800;font-size:13px">
                  </div>
                  <div class="field">
                    <label style="font-size:10.5px">فرق عن العيار</label>
                    <input id="bb-purity-diff" readonly
                           style="text-align:center;font-weight:800;
                                  font-size:13px;background:var(--surface-3)">
                  </div>
                  <div class="field">
                    <label style="font-size:10.5px">التصنيف</label>
                    <input id="bb-purity-grade" readonly
                           style="text-align:center;font-weight:800;
                                  font-size:12px;background:var(--surface-3)">
                  </div>
                </div>

                <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">
                  ${GMS.KARAT_ORDER.slice(0, 4).map(k => `
                    <button type="button" class="btn btn-sm"
                            data-purity-preset="${GMS.karatRatio(k)}">
                      ${k}K دقيق
                    </button>
                  `).join('')}
                </div>
              </div>

              <!-- Payment Mode -->
              <div style="font-size:11px;font-weight:800;color:var(--muted);
                          text-transform:uppercase;letter-spacing:.5px;
                          margin:16px 0 9px">
                <i data-lucide="wallet" style="width:12px;height:12px;
                           display:inline;vertical-align:-2px"></i>
                طريقة الدفع
              </div>

              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;
                          margin-bottom:14px">
                ${Object.entries(GMS.BUYBACK_MODES).map(([k, m]) => `
                  <button type="button"
                          class="mode-btn ${b.mode === k ? 'active' : ''}"
                          data-bb-mode="${k}"
                          style="border:1.5px solid ${b.mode === k ? 'var(--primary)' : 'var(--border)'};
                                 background:${b.mode === k ? 'color-mix(in srgb,var(--primary) 12%,var(--surface))' : 'var(--surface-2)'};
                                 padding:12px;border-radius:10px;cursor:pointer;
                                 display:flex;align-items:center;justify-content:center;
                                 gap:7px;font-weight:800;font-size:12.5px;
                                 color:${b.mode === k ? 'var(--primary)' : 'var(--text-2)'};
                                 transition:all .2s">
                    <i data-lucide="${m.icon}" style="width:16px;height:16px"></i>
                    ${m.label}
                  </button>
                `).join('')}
              </div>

              <!-- Customer -->
              <div class="grid-form">
                <div class="field">
                  <label>اسم العميل (اختياري)</label>
                  <input id="bb-cust-name"
                         placeholder="اسم العميل…"
                         value="${GMS.esc(b.customerName)}">
                </div>
                <div class="field">
                  <label>الهاتف ${b.mode === 'credit' ? '<span class="req">*</span>' : '(اختياري)'}</label>
                  <input id="bb-cust-phone"
                         placeholder="01xxxxxxxxx"
                         inputmode="tel"
                         class="mono"
                         value="${GMS.esc(b.customerPhone)}">
                </div>
                <div class="field field-full">
                  <label>ملاحظات على القطعة</label>
                  <input id="bb-notes"
                         placeholder="مثال: سلسلة مكسورة، خاتم قديم…"
                         value="${GMS.esc(b.notes)}">
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- RIGHT: Live calc -->
        <div style="position:sticky;top:calc(calc(var(--topbar-h) + var(--tabs-h)) + 22px)">
          <div class="card">
            <div class="card-head">
              <h3>
                <i data-lucide="calculator"></i>
                الحساب المباشر
              </h3>
            </div>
            <div class="card-body" id="bb-calc">
              ${renderBuybackCalc()}
            </div>
          </div>

          <!-- Wallet search -->
          <div class="card">
            <div class="card-head">
              <h3>
                <i data-lucide="wallet"></i>
                رصيد عميل سابق
              </h3>
            </div>
            <div class="card-body">
              <div class="field" style="margin-bottom:9px">
                <input id="bb-wallet-search"
                       placeholder="01xxxxxxxxx — ابحث عن رصيد قائم"
                       inputmode="tel"
                       autocomplete="off"
                       class="mono">
              </div>
              <div id="bb-wallet-result"></div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderBuybackCalc() {
    const b = RetState.buyback;
    const buy24 = GMS.round(getPrice24() * (1 - getBuyMargin() / 100), 2);

    if (!b.net || b.net <= 0) {
      return `
        <div class="empty" style="padding:30px 20px">
          <i data-lucide="calculator"></i>
          <p>أدخل الوزن لحساب القيمة</p>
          <span>سيتم حساب قيمة الشراء تلقائياً</span>
        </div>
      `;
    }

    const isCash = b.mode === 'cash';

    return `
      <div class="calc-list" style="margin-bottom:16px">
        <div class="cl-row">
          <span class="k"><i data-lucide="scale"></i> الوزن القائم</span>
          <span class="v">${GMS.gramFmt(b.gross)} جم</span>
        </div>
        ${b.stones > 0 ? `
          <div class="cl-row">
            <span class="k"><i data-lucide="gem"></i> وزن الأحجار</span>
            <span class="v" style="color:var(--danger)">− ${GMS.gramFmt(b.stones)} جم</span>
          </div>
        ` : ''}
        <div class="cl-row">
          <span class="k"><i data-lucide="scale"></i> الوزن الصافي</span>
          <span class="v">${GMS.gramFmt(b.net)} جم</span>
        </div>
        <div class="cl-row">
          <span class="k"><i data-lucide="percent"></i> النقاء المُختبَر</span>
          <span class="v">${b.testedPurity.toFixed(4)}</span>
        </div>
        <div class="cl-row hi">
          <span class="k"><i data-lucide="sparkles"></i> البندق 24K</span>
          <span class="v">${GMS.gramFmt(b.pure)} جم</span>
        </div>
      </div>

      <div class="divider"></div>

      <div class="calc-list" style="margin-bottom:16px">
        <div class="cl-row">
          <span class="k"><i data-lucide="trending-up"></i> سعر البيع 24K</span>
          <span class="v">${GMS.moneyFmt(getPrice24())} ج.م</span>
        </div>
        <div class="cl-row">
          <span class="k"><i data-lucide="minus-circle"></i> هامش الشراء</span>
          <span class="v" style="color:var(--danger)">− ${getBuyMargin().toFixed(1)}%</span>
        </div>
        <div class="cl-row">
          <span class="k"><i data-lucide="tag"></i> سعر الشراء النهائي</span>
          <span class="v" style="color:var(--success);font-weight:900">
            ${GMS.moneyFmt(buy24)} ج.م/جم بندق
          </span>
        </div>
      </div>

      <div style="padding:16px;border-radius:12px;
                  background:linear-gradient(135deg,
                    color-mix(in srgb,var(--primary) 15%,var(--surface)) 0%,
                    color-mix(in srgb,var(--primary) 4%,var(--surface)) 100%);
                  border:1.5px solid color-mix(in srgb,var(--primary) 45%,var(--border));
                  position:relative;overflow:hidden">
        <div style="position:absolute;inset-block:0;inset-inline-start:0;
                    width:4px;background:var(--gold-grad)"></div>
        <div style="font-size:10.5px;font-weight:800;color:var(--muted);
                    text-transform:uppercase;letter-spacing:.4px;
                    display:flex;align-items:center;gap:6px">
          <i data-lucide="${isCash ? 'banknote' : 'wallet'}"
             style="width:12px;height:12px"></i>
          ${isCash ? 'المبلغ النقدي المستحق' : 'رصيد المتجر للعميل'}
        </div>
        <div class="mono" style="font-size:28px;font-weight:900;
                    color:var(--primary);letter-spacing:-1px;
                    margin-top:5px;display:flex;align-items:baseline;gap:6px">
          <span>${GMS.moneyFmt(b.value)}</span>
          <small style="font-size:13px;color:var(--muted)">ج.م</small>
        </div>
      </div>

      <div style="display:flex;gap:8px;margin-top:16px">
        <button class="btn btn-ghost" id="bb-reset" style="flex:0 0 auto">
          <i data-lucide="rotate-ccw"></i>
          تفريغ
        </button>
        <button class="btn btn-success btn-lg" id="bb-confirm"
                style="flex:1" ${b.value > 0 ? '' : 'disabled'}>
          <i data-lucide="check-circle-2"></i>
          ${isCash ? `دفع ${GMS.moneyFmt(b.value)} ج.م` : `إصدار رصيد ${GMS.moneyFmt(b.value)} ج.م`}
        </button>
      </div>
    `;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §7 · TAB 3 — SUPPLIER RETURN
     ───────────────────────────────────────────────────────────────────── */

  function renderSupplierReturnTab() {
    const s = RetState.supplierReturn;
    const suppliers = GMS.Demo?.getSuppliers() || [];
    const branches = GMS.Demo?.getBranches() || [];

    return `
      <!-- Supplier selector -->
      <div class="card" style="margin-bottom:16px">
        <div class="card-head">
          <h3>
            <i data-lucide="package-minus"></i>
            مرتجع إلى مورد
          </h3>
          <div class="spacer" style="flex:1"></div>
          <span class="card-sub">اختر المورد ثم القطع المُرجعة</span>
        </div>
        <div class="card-body">
          <div class="grid-form three">
            <div class="field">
              <label>المورد <span class="req">*</span></label>
              <select id="sr-supplier">
                <option value="">— اختر مورد —</option>
                ${suppliers.map(sup => `
                  <option value="${GMS.esc(sup.id)}"
                          ${s.supplierId === sup.id ? 'selected' : ''}>
                    ${GMS.esc(sup.code || '')} — ${GMS.esc(sup.name)}
                  </option>
                `).join('')}
              </select>
            </div>

            <div class="field">
              <label>الفرع</label>
              <select id="sr-branch">
                ${branches.map(b => `
                  <option value="${GMS.esc(b.id)}">${GMS.esc(b.name)}</option>
                `).join('')}
              </select>
            </div>

            <div class="field">
              <label>بحث بالكود</label>
              <input id="sr-search" placeholder="SKU…" autocomplete="off">
            </div>
          </div>

          ${s.supplierId ? `
            <div style="margin-top:14px;padding:16px;border-radius:14px;
                        background:linear-gradient(135deg,
                          color-mix(in srgb,var(--success) 12%,var(--surface)) 0%,
                          color-mix(in srgb,var(--success) 3%,var(--surface)) 100%);
                        border:1.5px solid color-mix(in srgb,var(--success) 40%,var(--border));
                        position:relative;overflow:hidden">
              <div style="position:absolute;inset-block:0;inset-inline-start:0;
                          width:4px;background:linear-gradient(180deg,#3ecf8e,#0f7a43)"></div>
              <div style="font-size:10.5px;font-weight:800;color:var(--success);
                          text-transform:uppercase;letter-spacing:.4px;
                          display:flex;align-items:center;gap:6px">
                <i data-lucide="scale" style="width:14px;height:14px"></i>
                رصيد الذهب الحالي للمورد
              </div>
              <div class="mono" style="font-size:26px;font-weight:900;
                          margin-top:6px;letter-spacing:-.7px;
                          color:${s.supplierBalance.gold >= 0 ? 'var(--primary)' : 'var(--danger)'}">
                ${GMS.gramFmt(s.supplierBalance.gold)}
                <small style="font-size:13px;color:var(--muted)">جم بندق</small>
              </div>
              <div style="font-size:11.5px;color:var(--text-2);margin-top:6px;
                          font-weight:700">
                ${s.supplierBalance.gold > 0
                  ? `مستحق للمورد · قيمته ${GMS.moneyFmt(s.supplierBalance.gold * getPrice24())} ج.م`
                  : s.supplierBalance.gold < 0
                    ? 'مستحق لنا على المورد'
                    : 'الحساب متوازن'}
              </div>
            </div>
          ` : ''}
        </div>
      </div>

      <!-- Summary + table -->
      <div class="card">
        <div style="padding:16px 18px;
                    background:linear-gradient(135deg,
                      color-mix(in srgb,var(--primary) 6%,var(--surface)) 0%,
                      var(--surface) 100%);
                    border-bottom:1px solid var(--border);
                    display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
          ${renderSupplierSummary()}
        </div>

        <div id="sr-table-host">
          ${renderSupplierTable()}
        </div>

        <div class="modal-foot" style="justify-content:space-between;
                    background:var(--surface-2)">
          <div style="display:flex;gap:9px;flex-wrap:wrap">
            <button class="btn" id="sr-select-all">
              <i data-lucide="check-square"></i>
              تحديد الكل
            </button>
            <button class="btn btn-ghost" id="sr-clear-selection">
              <i data-lucide="x"></i>
              إلغاء التحديد
            </button>
          </div>
          <button class="btn btn-primary btn-lg" id="sr-confirm" disabled>
            <i data-lucide="package-minus"></i>
            تأكيد المرتجع
          </button>
        </div>
      </div>
    `;
  }

  function renderSupplierSummary() {
    const s = RetState.supplierReturn;
    const selected = s.itemPool.filter(i => s.selectedItems.has(i.id));

    const totalNet = selected.reduce((a, i) => a + Number(i.net_weight || 0), 0);
    const totalPure = selected.reduce((a, i) => a + Number(i.pure_weight || 0), 0);
    const totalValue = selected.reduce((a, i) => a + Number(i.total_cost || 0), 0);

    return `
      <div style="padding:11px 14px;border-radius:10px;
                  background:var(--surface);border:1.5px solid var(--border)">
        <div style="font-size:10.5px;font-weight:800;color:var(--muted);
                    text-transform:uppercase;letter-spacing:.4px">
          عدد القطع المحددة
        </div>
        <div class="mono" style="font-size:18px;font-weight:900;margin-top:5px">
          ${selected.length}
          <small style="font-size:11px;color:var(--muted)">قطعة</small>
        </div>
      </div>

      <div style="padding:11px 14px;border-radius:10px;
                  background:var(--surface);border:1.5px solid var(--border)">
        <div style="font-size:10.5px;font-weight:800;color:var(--muted);
                    text-transform:uppercase;letter-spacing:.4px">
          إجمالي الوزن الصافي
        </div>
        <div class="mono" style="font-size:18px;font-weight:900;margin-top:5px">
          ${GMS.gramFmt(totalNet)}
          <small style="font-size:11px;color:var(--muted)">جم</small>
        </div>
      </div>

      <div style="padding:11px 14px;border-radius:10px;
                  background:var(--surface);border:1.5px solid var(--border)">
        <div style="font-size:10.5px;font-weight:800;color:var(--muted);
                    text-transform:uppercase;letter-spacing:.4px">
          إجمالي البندق (24K)
        </div>
        <div class="mono" style="font-size:18px;font-weight:900;margin-top:5px;
                    color:var(--primary)">
          ${GMS.gramFmt(totalPure)}
          <small style="font-size:11px;color:var(--muted)">جم</small>
        </div>
      </div>

      <div style="padding:11px 14px;border-radius:10px;
                  background:var(--surface);border:1.5px solid var(--border)">
        <div style="font-size:10.5px;font-weight:800;color:var(--muted);
                    text-transform:uppercase;letter-spacing:.4px">
          القيمة التقديرية
        </div>
        <div class="mono" style="font-size:18px;font-weight:900;margin-top:5px;
                    color:var(--danger)">
          ${GMS.moneyFmt(totalValue)}
          <small style="font-size:11px;color:var(--muted)">ج.م</small>
        </div>
      </div>
    `;
  }

  function renderSupplierTable() {
    const s = RetState.supplierReturn;
    const pool = s.itemPool;

    if (!pool.length) {
      return `
        <div class="empty" style="padding:50px 20px">
          <i data-lucide="package-search"></i>
          <p>لا توجد قطع متوفرة</p>
          <span>${s.supplierId ? 'هذا المورد ليس له قطع في المخزون' : 'اختر مورداً أولاً'}</span>
        </div>
      `;
    }

    return `
      <div class="table-wrap" style="border:none;border-radius:0;max-height:54vh">
        <table class="tbl">
          <thead>
            <tr>
              <th style="width:44px" class="col-c"></th>
              <th>كود التاج</th>
              <th style="width:120px">التصنيف</th>
              <th style="width:70px" class="col-c">عيار</th>
              <th style="width:90px" class="col-num">قائم</th>
              <th style="width:90px" class="col-num">صافي</th>
              <th style="width:100px" class="col-num">بندق 24K</th>
              <th style="width:110px" class="col-num">القيمة</th>
              <th style="width:100px" class="col-c">التاريخ</th>
            </tr>
          </thead>
          <tbody>
            ${pool.map(item => {
              const selected = s.selectedItems.has(item.id);
              return `
                <tr class="${selected ? 'selected' : ''}"
                    data-sr-item="${GMS.esc(item.id)}">
                  <td class="col-c">
                    <input type="checkbox" class="cb"
                           data-sr-check="${GMS.esc(item.id)}"
                           ${selected ? 'checked' : ''}>
                  </td>
                  <td>
                    <div class="cell-sku">
                      <span class="sku-code mono">${GMS.esc(item.sku)}</span>
                      <span class="sku-meta">${GMS.esc(item.manufacturer_name || '—')}</span>
                    </div>
                  </td>
                  <td style="font-size:11.5px">${GMS.esc(item.category || '—')}</td>
                  <td class="col-c">
                    <span class="karat-badge" data-k="${item.karat}">${item.karat}K</span>
                  </td>
                  <td class="col-num">${GMS.gramFmt(item.weight_grams)}</td>
                  <td class="col-num">${GMS.gramFmt(item.net_weight)}</td>
                  <td class="col-num" style="color:var(--primary);font-weight:800">
                    ${GMS.gramFmt(item.pure_weight)}
                  </td>
                  <td class="col-num" style="font-weight:800">${GMS.moneyFmt(item.total_cost)}</td>
                  <td class="col-c" style="font-size:11px;color:var(--muted)">
                    ${GMS.dateAr(item.created_at)}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §8 · RENDER MAIN
     ───────────────────────────────────────────────────────────────────── */

  function render(root) {
    updateStats();

    let tabContent = '';

    if (RetState.activeTab === 'sales-return') {
      tabContent = renderSalesReturnTab();
    } else if (RetState.activeTab === 'buyback') {
      tabContent = renderBuybackTab();
    } else if (RetState.activeTab === 'supplier-return') {
      tabContent = renderSupplierReturnTab();
    }

    root.innerHTML = `
      <div class="page-header">
        <h2>
          <i data-lucide="rotate-ccw"></i>
          ${GMS.t('ret.title')}
        </h2>
        <p>${GMS.t('ret.subtitle')}</p>
      </div>

      ${renderKPIs()}
      ${renderTabs()}
      ${tabContent}

      <!-- Recent returns -->
      <div class="card" style="margin-top:16px">
        <div class="card-head">
          <h3>
            <i data-lucide="history"></i>
            أحدث المرتجعات
          </h3>
          <div class="spacer" style="flex:1"></div>
          <span class="card-sub">${RetState.returns.length} سجل</span>
          <button class="btn btn-sm" id="ret-export-btn">
            <i data-lucide="download"></i> تصدير
          </button>
        </div>
        <div class="card-body" style="padding:8px 0">
          ${renderRecentReturns()}
        </div>
      </div>
    `;

    window.lucide?.createIcons();
    bindControls();

    /* إعادة رسم القيم للحقول */
    if (RetState.activeTab === 'buyback') {
      setTimeout(() => {
        recalcBuyback();
        updatePurityDisplay();
      }, 50);
    }

    /* ملخص الاسترجاع */
    if (RetState.activeTab === 'sales-return' && RetState.salesReturn.item) {
      setTimeout(() => {
        updateReturnSummaryVisibility();
      }, 50);
    }
  }

  function renderRecentReturns() {
    const rows = RetState.returns.slice(0, 10);

    if (!rows.length) {
      return `
        <div class="empty" style="padding:32px 20px">
          <i data-lucide="inbox"></i>
          <p>لا توجد مرتجعات مسجَّلة</p>
          <span>ستظهر هنا بعد كل عملية</span>
        </div>
      `;
    }

    const typeLabels = {
      customer_return: { label: 'مرتجع عميل', icon: 'rotate-ccw', cls: 'return' },
      buyback: { label: 'شراء كسر', icon: 'recycle', cls: 'buyback' },
      supplier_return: { label: 'مرتجع مورد', icon: 'package-minus', cls: 'supplier' },
    };

    return rows.map(r => {
      const t = typeLabels[r.return_type] || { label: r.return_type, icon: 'activity', cls: 'update' };
      const amount = Number(r.refund_amount || 0) + Number(r.credit_issued || 0);

      return `
        <div class="feed-item">
          <div class="feed-icon ${t.cls}">
            <i data-lucide="${t.icon}"></i>
          </div>
          <div class="feed-body">
            <div class="feed-title">
              ${GMS.esc(r.return_no || '—')} · ${GMS.esc(t.label)}
            </div>
            <div class="feed-desc">
              ${GMS.esc(r.sku || '—')}
              ${r.karat ? ` · ${r.karat}K` : ''}
              ${r.pure_weight ? ` · ${GMS.gramFmt(r.pure_weight)} جم` : ''}
            </div>
            <div class="feed-meta">
              ${amount > 0 ? `<span class="feed-amount">${GMS.moneyFmt(amount)} ج.م</span>` : ''}
              <span class="feed-time">${GMS.timeAgo(r.created_at)}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  /* ═════════════════════════════════════════════════════════════════════
     §9 · CONTROLS BINDING
     ───────────────────────────────────────────────────────────────────── */

  function bindControls() {
    /* ─── Tabs ─────────────────────────────────────────────── */
    document.querySelectorAll('[data-ret-tab]').forEach(tab => {
      tab.onclick = () => {
        const key = tab.dataset.retTab;
        if (key === RetState.activeTab) return;

        RetState.activeTab = key;
        render(document.getElementById('page'));
      };
    });

    /* ─── Sales Return tab ────────────────────────────────── */
    if (RetState.activeTab === 'sales-return') {
      bindSalesReturn();
    }

    /* ─── Buyback tab ─────────────────────────────────────── */
    if (RetState.activeTab === 'buyback') {
      bindBuyback();
    }

    /* ─── Supplier Return tab ─────────────────────────────── */
    if (RetState.activeTab === 'supplier-return') {
      bindSupplierReturn();
    }

    /* ─── Export ──────────────────────────────────────────── */
    const exportBtn = document.getElementById('ret-export-btn');
    if (exportBtn) {
      exportBtn.onclick = () => exportReturns();
    }

    /* ─── Global keyboard ─────────────────────────────────── */
    const keyHandler = (e) => {
      if (GMS.Router?.current() !== 'returns') return;

      if (e.key === 'F2') {
        e.preventDefault();
        const scanInput = document.getElementById('ret-scan-input');
        scanInput?.focus();
        scanInput?.select();
      }
    };

    document.addEventListener('keydown', keyHandler);
    RetState.unsubscribers.push(() => {
      document.removeEventListener('keydown', keyHandler);
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §10 · BIND — SALES RETURN
     ───────────────────────────────────────────────────────────────────── */

  function bindSalesReturn() {
    const input = document.getElementById('ret-scan-input');
    const hero = document.getElementById('ret-scan-hero');
    const verifyHost = document.getElementById('ret-verify-host');
    const summaryHost = document.getElementById('ret-summary');

    if (!input) return;

    setTimeout(() => input.focus(), 150);

    input.onfocus = () => hero?.classList.add('focused');
    input.onblur = () => hero?.classList.remove('focused');

    input.onkeydown = async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const sku = input.value.trim();
        if (!sku) return;

        await lookupReturnItem(sku);
      } else if (e.key === 'Escape') {
        input.value = '';
        resetReturnFlow();
        if (verifyHost) verifyHost.innerHTML = renderVerifyPlaceholder();
        if (summaryHost) summaryHost.innerHTML = renderReturnSummary();
        window.lucide?.createIcons();
      }
    };

    /* Refund method buttons */
    document.querySelectorAll('[data-refund]').forEach(btn => {
      btn.onclick = () => {
        RetState.salesReturn.refundMethod = btn.dataset.refund;
        if (summaryHost) {
          summaryHost.innerHTML = renderReturnSummary();
          window.lucide?.createIcons();
        }
        bindSalesReturnSummary();
      };
    });

    /* Reason select */
    const reasonSel = document.getElementById('ret-reason');
    if (reasonSel) {
      reasonSel.onchange = (e) => {
        RetState.salesReturn.reason = e.target.value;
        updateReturnSummaryVisibility();
      };
    }

    /* Notes */
    const notesInput = document.getElementById('ret-notes');
    if (notesInput) {
      notesInput.oninput = (e) => {
        RetState.salesReturn.notes = e.target.value;
      };
    }

    /* Cancel */
    const cancelBtn = document.getElementById('ret-cancel');
    if (cancelBtn) {
      cancelBtn.onclick = () => {
        resetReturnFlow();
        render(document.getElementById('page'));
      };
    }

    /* Confirm */
    const confirmBtn = document.getElementById('ret-confirm');
    if (confirmBtn) {
      confirmBtn.onclick = () => confirmSalesReturn();
    }
  }

  function bindSalesReturnSummary() {
    /* أزرار طريقة الاسترجاع */
    document.querySelectorAll('[data-refund]').forEach(btn => {
      btn.onclick = () => {
        RetState.salesReturn.refundMethod = btn.dataset.refund;
        const host = document.getElementById('ret-summary');
        if (host) {
          host.innerHTML = renderReturnSummary();
          window.lucide?.createIcons();
          bindSalesReturnSummary();
        }
      };
    });

    /* Reason */
    const reasonSel = document.getElementById('ret-reason');
    if (reasonSel) {
      reasonSel.onchange = (e) => {
        RetState.salesReturn.reason = e.target.value;
        updateReturnSummaryVisibility();
      };
    }

    /* Notes */
    const notesInput = document.getElementById('ret-notes');
    if (notesInput) {
      notesInput.oninput = (e) => {
        RetState.salesReturn.notes = e.target.value;
      };
    }

    /* Cancel */
    const cancelBtn = document.getElementById('ret-cancel');
    if (cancelBtn) {
      cancelBtn.onclick = () => {
        resetReturnFlow();
        render(document.getElementById('page'));
      };
    }

    /* Confirm */
    const confirmBtn = document.getElementById('ret-confirm');
    if (confirmBtn) {
      confirmBtn.onclick = () => confirmSalesReturn();
    }
  }

  function updateReturnSummaryVisibility() {
    const btn = document.getElementById('ret-confirm');
    if (!btn) return;

    const r = RetState.salesReturn;
    const ready = r.valid && r.reason;
    btn.disabled = !ready;

    if (ready) {
      btn.innerHTML = `<i data-lucide="check-circle-2"></i>
        تأكيد الإرجاع واسترداد ${GMS.moneyFmt(r.refundAmount)} ج.م`;
      window.lucide?.createIcons();
    }
  }

  async function lookupReturnItem(code) {
    const verifyHost = document.getElementById('ret-verify-host');
    if (verifyHost) verifyHost.innerHTML = renderVerifyCard('loading');
    window.lucide?.createIcons();

    try {
      const found = await findSaleBySku(code);

      if (!found) {
        RetState.salesReturn = {
          ...RetState.salesReturn,
          item: null,
          sale: null,
          valid: false,
          refundPct: 0,
          refundAmount: 0,
        };

        if (verifyHost) verifyHost.innerHTML = renderVerifyCard('result');
        window.lucide?.createIcons();
        GMS.Beep?.error();
        GMS.Toast.err('لم يتم العثور على الصنف', code);
        return;
      }

      const { item, sale } = found;

      /* حساب الاستحقاق */
      const policy = getReturnPolicy();
      const daysSinceSale = sale
        ? GMS.daysBetween(sale.created_at, new Date())
        : 0;

      let refundPct = 100;
      if (sale) {
        if (daysSinceSale > policy.noReturnBeyondDays) {
          refundPct = 0;
        } else if (daysSinceSale > policy.fullRefundDays) {
          refundPct = policy.partialRefundPct;
        }
      } else {
        refundPct = 0;
      }

      const refundAmount = sale
        ? GMS.round(sale.grand_total * refundPct / 100, 2)
        : 0;

      RetState.salesReturn = {
        ...RetState.salesReturn,
        item,
        sale,
        daysSinceSale,
        refundPct,
        refundAmount,
        valid: Boolean(item && sale && refundPct > 0 && item.status === 'SOLD'),
      };

      GMS.Beep?.success();

      if (verifyHost) verifyHost.innerHTML = renderVerifyCard('result');

      const summaryHost = document.getElementById('ret-summary');
      if (summaryHost) summaryHost.innerHTML = renderReturnSummary();

      window.lucide?.createIcons();
      bindSalesReturnSummary();

    } catch (e) {
      console.error('[Returns.lookup]', e);
      RetState.salesReturn.item = null;
      RetState.salesReturn.valid = false;
      if (verifyHost) verifyHost.innerHTML = renderVerifyCard('result');
      window.lucide?.createIcons();
      GMS.Toast.err('خطأ في البحث', e.message);
    }
  }

  function resetReturnFlow() {
    RetState.salesReturn = {
      scanInput: '',
      lastScan: null,
      item: null,
      sale: null,
      daysSinceSale: 0,
      refundPct: 100,
      refundAmount: 0,
      refundMethod: 'cash',
      reason: '',
      notes: '',
      valid: false,
    };
  }

  async function confirmSalesReturn() {
    const r = RetState.salesReturn;

    if (!r.item || !r.sale || !r.valid) {
      GMS.Beep?.error();
      return GMS.Toast.err('لا يمكن تنفيذ الإرجاع');
    }

    if (!r.reason) {
      GMS.Beep?.error();
      return GMS.Toast.err('اختر سبب الإرجاع');
    }

    const method = GMS.REFUND_METHODS[r.refundMethod];

    const ok = await GMS.Confirm.ask(
      `سيتم استرجاع "${r.item.sku}" بمبلغ ${GMS.moneyFmt(r.refundAmount)} ج.م عبر ${method.label}.`,
      {
        title: 'تأكيد استرجاع المبيعات',
        okText: 'تنفيذ الإرجاع',
        danger: false,
        icon: 'rotate-ccw',
      }
    );

    if (!ok) return;

    const btn = document.getElementById('ret-confirm');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<i data-lucide="loader-circle"></i> جارٍ التنفيذ…`;
      window.lucide?.createIcons();
    }

    try {
      const returnNo = `RT-${GMS.uid().toUpperCase().slice(0, 10)}`;
      const now = new Date().toISOString();

      const returnRecord = {
        id: GMS.uid(),
        return_no: returnNo,
        return_type: 'customer_return',
        original_sale_id: r.sale.id || null,
        original_invoice_no: r.sale.sale_no || r.sale.invoice_no || null,
        inventory_id: r.item.id,
        sku: r.item.sku,
        karat: r.item.karat,
        gross_weight: r.item.weight_grams,
        net_weight: r.item.net_weight,
        pure_weight: r.item.pure_weight,
        tested_purity: r.item.purity_ratio,
        refund_amount: r.refundMethod === 'credit' ? 0 : r.refundAmount,
        refund_method: r.refundMethod,
        credit_issued: r.refundMethod === 'credit' ? r.refundAmount : 0,
        customer_name: r.sale.customer_name || null,
        customer_phone: r.sale.customer_phone || null,
        reason: r.reason,
        notes: r.notes || null,
        branch_id: r.item.branch_id,
        status: 'COMPLETED',
        created_at: now,
      };

      /* 1 · IDB — تغيير حالة الصنف */
      if (GMS.IDB) {
        try {
          const item = await GMS.IDB.get(r.item.id);
          if (item) {
            item.status = 'IN_STOCK';
            item.updated_at = now;
            await GMS.IDB.put(item);
          }
        } catch (e) {
          console.warn('[Returns] IDB update failed:', e);
        }
      }

      /* 2 · Supabase */
      if (GMS.Supabase?.isReady()) {
        try {
          const client = GMS.Supabase.get();

          /* تحديث حالة الصنف */
          await client
            .from(GMS.SUPABASE_CONFIG.TABLES.INVENTORY)
            .update({ status: 'IN_STOCK', updated_at: now })
            .eq('id', r.item.id);

          /* إدراج المرتجع */
          await client
            .from(GMS.SUPABASE_CONFIG.TABLES.RETURNS)
            .insert(returnRecord);
        } catch (e) {
          console.warn('[Returns] Supabase insert failed:', e);
        }
      }

      /* 3 · Credit wallet */
      if (r.refundMethod === 'credit' && r.sale.customer_phone) {
        RetState.wallet.unshift({
          id: GMS.uid(),
          customer_name: r.sale.customer_name,
          customer_phone: r.sale.customer_phone,
          original_amount: r.refundAmount,
          remaining_amount: r.refundAmount,
          source_return_no: returnNo,
          status: 'ACTIVE',
          expires_at: new Date(Date.now() + 180 * 86400000).toISOString(),
          created_at: now,
        });
        saveWallet();
      }

      /* 4 · المصفوفة المحلية */
      RetState.returns.unshift(returnRecord);

      /* 5 · Audit */
      if (GMS.Audit) {
        await GMS.Audit.log('RETURN', 'sale', r.sale.id,
          `مرتجع مبيعات ${returnNo} — ${r.item.sku} · ${GMS.moneyFmt(r.refundAmount)} ج.م`,
          {
            sku: r.item.sku,
            refund_amount: r.refundAmount,
            refund_method: r.refundMethod,
            reason: r.reason,
          });
      }

      /* 6 · Realtime */
      if (GMS.Realtime) {
        GMS.Realtime.emit('returns', 'INSERT', returnRecord);
        GMS.Realtime.emit('inventory', 'UPDATE', { ...r.item, status: 'IN_STOCK' });
      }

      GMS.Beep?.complete();
      GMS.Toast.ok(
        `تم تنفيذ الإرجاع ${returnNo}`,
        `${GMS.moneyFmt(r.refundAmount)} ج.م عبر ${method.label}`
      );

      /* 7 · Modal receipt */
      showReturnReceipt(returnRecord, r.item, r.sale);

      /* Reset */
      resetReturnFlow();
      render(document.getElementById('page'));

    } catch (e) {
      console.error('[Returns.confirm]', e);
      GMS.Beep?.error();
      GMS.Toast.err('فشل تنفيذ الإرجاع', e.message);

      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="check-circle-2"></i> إعادة المحاولة`;
        window.lucide?.createIcons();
      }
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §11 · BIND — BUYBACK
     ───────────────────────────────────────────────────────────────────── */

  function bindBuyback() {
    const b = RetState.buyback;

    /* Karat buttons */
    document.querySelectorAll('[data-bb-karat]').forEach(btn => {
      btn.onclick = () => {
        b.karat = Number(btn.dataset.bbKarat);
        b.testedPurity = GMS.karatRatio(b.karat);

        /* Update UI */
        document.querySelectorAll('[data-bb-karat]').forEach(b2 => {
          b2.classList.toggle('active', b2 === btn);
        });

        const slider = document.getElementById('bb-purity-slider');
        if (slider) slider.value = b.testedPurity;

        const input = document.getElementById('bb-purity-input');
        if (input) input.value = b.testedPurity;

        recalcBuyback();
        updatePurityDisplay();
      };
    });

    /* Weight inputs */
    ['bb-gross', 'bb-stones'].forEach(id => {
      const inp = document.getElementById(id);
      if (inp) inp.oninput = recalcBuyback;
    });

    /* Purity slider */
    const slider = document.getElementById('bb-purity-slider');
    if (slider) {
      slider.oninput = (e) => {
        b.testedPurity = Number(e.target.value);
        const input = document.getElementById('bb-purity-input');
        if (input) input.value = b.testedPurity;
        recalcBuyback();
        updatePurityDisplay();
      };
    }

    /* Purity input */
    const pInput = document.getElementById('bb-purity-input');
    if (pInput) {
      pInput.oninput = (e) => {
        let v = Number(e.target.value);
        if (!isFinite(v)) return;
        v = Math.max(0.4, Math.min(1.0, v));
        b.testedPurity = v;

        const slider2 = document.getElementById('bb-purity-slider');
        if (slider2) slider2.value = v;

        recalcBuyback();
        updatePurityDisplay();
      };
    }

    /* Purity presets */
    document.querySelectorAll('[data-purity-preset]').forEach(btn => {
      btn.onclick = () => {
        const v = Number(btn.dataset.purityPreset);
        b.testedPurity = v;

        const slider2 = document.getElementById('bb-purity-slider');
        if (slider2) slider2.value = v;

        const input2 = document.getElementById('bb-purity-input');
        if (input2) input2.value = v;

        recalcBuyback();
        updatePurityDisplay();
      };
    });

    /* Mode toggle */
    document.querySelectorAll('[data-bb-mode]').forEach(btn => {
      btn.onclick = () => {
        b.mode = btn.dataset.bbMode;
        render(document.getElementById('page'));
      };
    });

    /* Customer fields */
    const nameInput = document.getElementById('bb-cust-name');
    if (nameInput) {
      nameInput.oninput = (e) => { b.customerName = e.target.value; };
    }

    const phoneInput = document.getElementById('bb-cust-phone');
    if (phoneInput) {
      phoneInput.oninput = (e) => { b.customerPhone = e.target.value; };
    }

    const notesInput = document.getElementById('bb-notes');
    if (notesInput) {
      notesInput.oninput = (e) => { b.notes = e.target.value; };
    }

    /* Wallet search */
    const walletSearch = document.getElementById('bb-wallet-search');
    if (walletSearch) {
      walletSearch.oninput = GMS.debounce((e) => {
        searchWallet(e.target.value);
      }, 300);
    }
  }

  function updatePurityDisplay() {
    const b = RetState.buyback;
    const nominal = GMS.karatRatio(b.karat);
    const diff = GMS.round(b.testedPurity - nominal, 4);

    const disp = document.getElementById('bb-purity-display');
    if (disp) disp.textContent = b.testedPurity.toFixed(4);

    const diffEl = document.getElementById('bb-purity-diff');
    if (diffEl) {
      diffEl.value = (diff > 0 ? '+' : '') + diff.toFixed(4);
      diffEl.style.color = diff > 0.001 ? 'var(--success)'
                        : diff < -0.001 ? 'var(--danger)'
                        : 'var(--text-2)';
    }

    const gradeEl = document.getElementById('bb-purity-grade');
    if (gradeEl) {
      const p = b.testedPurity;
      let grade = '—';
      if (p >= 0.99) grade = '24K دقيق';
      else if (p >= 0.91) grade = '22K مرتفع';
      else if (p >= 0.86) grade = '21K مرتفع';
      else if (p >= 0.83) grade = '21K منخفض';
      else if (p >= 0.74) grade = '18K قياسي';
      else if (p >= 0.70) grade = '18K منخفض';
      else if (p >= 0.56) grade = '14K قياسي';
      else grade = 'أقل من الحد الأدنى';

      gradeEl.value = grade;
      gradeEl.style.color = Math.abs(diff) < 0.01 ? 'var(--success)'
                          : Math.abs(diff) < 0.03 ? 'var(--warn)'
                          : 'var(--danger)';
    }
  }

  function recalcBuyback() {
    const b = RetState.buyback;

    b.gross = Math.max(0, parseFloat(document.getElementById('bb-gross')?.value) || 0);
    b.stones = Math.max(0, parseFloat(document.getElementById('bb-stones')?.value) || 0);
    b.net = Math.max(0, GMS.round(b.gross - b.stones, 3));
    b.pure = GMS.round(b.net * b.testedPurity, 4);

    const buy24 = GMS.round(getPrice24() * (1 - getBuyMargin() / 100), 2);
    b.baseRate = getPrice24();
    b.appliedRate = buy24;
    b.value = GMS.round(b.pure * buy24, 2);

    /* Net field */
    const netEl = document.getElementById('bb-net');
    if (netEl) netEl.value = b.net ? b.net.toFixed(3) : '';

    /* Update calc panel */
    const calcHost = document.getElementById('bb-calc');
    if (calcHost) {
      calcHost.innerHTML = renderBuybackCalc();
      window.lucide?.createIcons();

      /* Rebind */
      const resetBtn = document.getElementById('bb-reset');
      if (resetBtn) resetBtn.onclick = () => resetBuyback();

      const confirmBtn = document.getElementById('bb-confirm');
      if (confirmBtn) confirmBtn.onclick = () => confirmBuyback();
    }
  }

  function resetBuyback() {
    RetState.buyback = {
      karat: 21,
      gross: 0,
      stones: 0,
      testedPurity: GMS.karatRatio(21),
      mode: 'cash',
      customerName: '',
      customerPhone: '',
      notes: '',
      net: 0,
      pure: 0,
      baseRate: 0,
      appliedRate: 0,
      value: 0,
    };
    render(document.getElementById('page'));
  }

  async function confirmBuyback() {
    const b = RetState.buyback;

    if (!(b.net > 0)) {
      GMS.Beep?.error();
      return GMS.Toast.err('أدخل وزناً صحيحاً');
    }

    if (b.mode === 'credit' && !b.customerPhone.trim()) {
      GMS.Beep?.error();
      return GMS.Toast.err('رقم هاتف العميل مطلوب لإصدار الرصيد');
    }

    const modeLabel = GMS.BUYBACK_MODES[b.mode].label;

    const ok = await GMS.Confirm.ask(
      `سيتم شراء ${GMS.gramFmt(b.pure)} جم بندق 24K بمبلغ ${GMS.moneyFmt(b.value)} ج.م عبر ${modeLabel}.`,
      {
        title: 'تأكيد شراء الكسر',
        okText: 'تنفيذ الشراء',
        danger: false,
        icon: 'recycle',
      }
    );

    if (!ok) return;

    const btn = document.getElementById('bb-confirm');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<i data-lucide="loader-circle"></i> جارٍ التنفيذ…`;
      window.lucide?.createIcons();
    }

    try {
      const returnNo = `BB-${GMS.uid().toUpperCase().slice(0, 10)}`;
      const scrapSku = `SCR-${b.karat}-${Date.now().toString(36).toUpperCase().slice(-8)}`;
      const now = new Date().toISOString();

      const record = {
        id: GMS.uid(),
        return_no: returnNo,
        return_type: 'buyback',
        inventory_id: null,
        sku: scrapSku,
        item_description: b.notes || `كسر ${b.karat}K`,
        karat: b.karat,
        gross_weight: b.gross,
        net_weight: b.net,
        tested_purity: b.testedPurity,
        pure_weight: b.pure,
        base_rate_24: b.baseRate,
        buy_margin_pct: getBuyMargin(),
        applied_rate: b.appliedRate,
        refund_amount: b.mode === 'cash' ? b.value : 0,
        refund_method: b.mode,
        credit_issued: b.mode === 'credit' ? b.value : 0,
        customer_name: b.customerName || null,
        customer_phone: b.customerPhone || null,
        reason: 'scrap_purchase',
        notes: b.notes || null,
        branch_id: GMS.Auth?.profile?.branch_id || GMS.APP_CONFIG.DEFAULT_BRANCH_ID,
        status: 'COMPLETED',
        created_at: now,
      };

      /* 1 · IDB — إضافة صنف جديد */
      if (GMS.IDB) {
        try {
          const newItem = {
            id: 'inv-' + GMS.uid(),
            sku: scrapSku,
            category: 'كسر مُشترى',
            karat: b.karat,
            purity_ratio: b.testedPurity,
            weight_grams: b.gross,
            stone_weight: b.stones,
            net_weight: b.net,
            pure_weight: b.pure,
            workmanship_per_gram: 0,
            workmanship_value: 0,
            gold_value: GMS.round(b.pure * getPrice24(), 2),
            total_cost: b.value,
            price_24: getPrice24(),
            status: 'MELTED',
            notes: b.notes || null,
            branch_id: record.branch_id,
            manufacturer_code: null,
            manufacturer_name: null,
            created_at: now,
            updated_at: now,
          };

          await GMS.IDB.put(newItem);
          record.inventory_id = newItem.id;
        } catch (e) {
          console.warn('[Buyback] IDB insert failed:', e);
        }
      }

      /* 2 · Supabase */
      if (GMS.Supabase?.isReady()) {
        try {
          const client = GMS.Supabase.get();

          await client
            .from(GMS.SUPABASE_CONFIG.TABLES.RETURNS)
            .insert(record);

          /* صنف جديد في المخزون */
          await client
            .from(GMS.SUPABASE_CONFIG.TABLES.INVENTORY)
            .insert({
              sku: scrapSku,
              category: 'كسر مُشترى',
              karat: b.karat,
              purity_ratio: b.testedPurity,
              weight_grams: b.gross,
              stone_weight: b.stones,
              net_weight: b.net,
              pure_weight: b.pure,
              workmanship_per_gram: 0,
              workmanship_value: 0,
              gold_value: GMS.round(b.pure * getPrice24(), 2),
              total_cost: b.value,
              price_24: getPrice24(),
              status: 'MELTED',
              notes: b.notes || null,
            });
        } catch (e) {
          console.warn('[Buyback] Supabase insert failed:', e);
        }
      }

      /* 3 · Credit wallet */
      if (b.mode === 'credit' && b.customerPhone) {
        RetState.wallet.unshift({
          id: GMS.uid(),
          customer_name: b.customerName || null,
          customer_phone: b.customerPhone,
          original_amount: b.value,
          remaining_amount: b.value,
          source_return_no: returnNo,
          status: 'ACTIVE',
          expires_at: new Date(Date.now() + 180 * 86400000).toISOString(),
          created_at: now,
        });
        saveWallet();
      }

      RetState.returns.unshift(record);

      /* 4 · Audit */
      if (GMS.Audit) {
        await GMS.Audit.log('BUYBACK', 'inventory', record.id,
          `شراء كسر ${scrapSku} — ${GMS.gramFmt(b.pure)} جم · ${GMS.moneyFmt(b.value)} ج.م`,
          {
            sku: scrapSku,
            karat: b.karat,
            pure: b.pure,
            value: b.value,
            mode: b.mode,
          });
      }

      /* 5 · Realtime */
      if (GMS.Realtime) {
        GMS.Realtime.emit('returns', 'INSERT', record);
      }

      GMS.Beep?.complete();
      GMS.Toast.ok(
        `تم شراء الكسر ${returnNo}`,
        `${GMS.gramFmt(b.pure)} جم · ${GMS.moneyFmt(b.value)} ج.م`
      );

      /* 6 · Receipt modal */
      showBuybackReceipt(record);

      /* Reset */
      resetBuyback();

    } catch (e) {
      console.error('[Buyback.confirm]', e);
      GMS.Beep?.error();
      GMS.Toast.err('فشل تنفيذ الشراء', e.message);

      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="check-circle-2"></i> إعادة المحاولة`;
        window.lucide?.createIcons();
      }
    }
  }

  function searchWallet(phone) {
    const host = document.getElementById('bb-wallet-result');
    if (!host) return;

    const q = String(phone || '').trim();
    if (!q || q.length < 3) {
      host.innerHTML = '';
      return;
    }

    const matches = RetState.wallet.filter(w =>
      w.status === 'ACTIVE' &&
      w.remaining_amount > 0 &&
      w.customer_phone.includes(q)
    );

    if (!matches.length) {
      host.innerHTML = `
        <div style="padding:12px 14px;background:var(--surface-2);
                    border-radius:9px;border:1px dashed var(--border);
                    font-size:11.5px;color:var(--muted);font-weight:700;
                    text-align:center">
          لا يوجد رصيد قائم لهذا الرقم
        </div>
      `;
      return;
    }

    const total = matches.reduce((a, m) => a + m.remaining_amount, 0);

    host.innerHTML = `
      <div style="padding:11px 13px;background:var(--success-bg);
                  border:1px solid color-mix(in srgb,var(--success) 35%,var(--border));
                  border-radius:9px;margin-bottom:8px">
        <div style="font-size:10.5px;font-weight:800;color:var(--success);
                    text-transform:uppercase;letter-spacing:.4px">
          رصيد قائم
        </div>
        <div style="font-size:18px;font-weight:900;color:var(--success);
                    margin-top:3px;font-variant-numeric:tabular-nums;
                    font-family:var(--font-mono)">
          ${GMS.moneyFmt(total)} ج.م
        </div>
      </div>
      ${matches.map(m => `
        <div style="padding:8px 11px;background:var(--surface-2);
                    border-radius:7px;margin-bottom:4px;
                    display:flex;justify-content:space-between;
                    font-size:11.5px">
          <span style="color:var(--muted);font-weight:700">
            ${GMS.esc(m.customer_name || 'عميل')}
          </span>
          <span class="mono" style="font-weight:800">
            ${GMS.moneyFmt(m.remaining_amount)} ج.م
          </span>
        </div>
      `).join('')}
      <button class="btn btn-success btn-block btn-sm"
              style="margin-top:9px" id="bb-use-credit">
        <i data-lucide="arrow-right-circle"></i>
        استخدم هذا الرصيد
      </button>
    `;

    window.lucide?.createIcons();

    const useBtn = document.getElementById('bb-use-credit');
    if (useBtn) {
      useBtn.onclick = () => {
        RetState.buyback.customerPhone = matches[0].customer_phone;
        RetState.buyback.customerName = matches[0].customer_name || '';
        RetState.buyback.notes = `يوجد رصيد قائم بمبلغ ${GMS.moneyFmt(total)} ج.م`;

        const phoneEl = document.getElementById('bb-cust-phone');
        if (phoneEl) phoneEl.value = matches[0].customer_phone;

        const nameEl = document.getElementById('bb-cust-name');
        if (nameEl) nameEl.value = matches[0].customer_name || '';

        GMS.Toast.info('تم تحميل بيانات العميل');
      };
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §12 · BIND — SUPPLIER RETURN
     ───────────────────────────────────────────────────────────────────── */

  function bindSupplierReturn() {
    const s = RetState.supplierReturn;

    /* Supplier select */
    const supSel = document.getElementById('sr-supplier');
    if (supSel) {
      supSel.onchange = async (e) => {
        s.supplierId = e.target.value;
        s.selectedItems.clear();

        const sup = GMS.Demo?.getSuppliers()?.find(x => x.id === s.supplierId);
        s.supplierBalance = sup
          ? { gold: Number(sup.opening_gold || 0), cash: Number(sup.opening_cash || 0) }
          : { gold: 0, cash: 0 };

        await loadSupplierReturnPool();
        render(document.getElementById('page'));
      };
    }

    /* Search */
    const searchInput = document.getElementById('sr-search');
    if (searchInput) {
      searchInput.oninput = GMS.debounce((e) => {
        filterSupplierPool(e.target.value);
      }, 250);
    }

    /* Checkboxes */
    document.querySelectorAll('[data-sr-check]').forEach(cb => {
      cb.onchange = (e) => {
        e.stopPropagation();
        const id = cb.dataset.srCheck;

        if (cb.checked) {
          s.selectedItems.add(id);
        } else {
          s.selectedItems.delete(id);
        }

        const tr = cb.closest('tr');
        if (tr) tr.classList.toggle('selected', cb.checked);

        /* Update summary */
        const summaryGrid = document.querySelector('.card > div:first-child');
        if (summaryGrid && summaryGrid.style.display === 'grid') {
          summaryGrid.innerHTML = renderSupplierSummary();
        }

        updateSupplierConfirmButton();
      };
    });

    /* Row click → toggle */
    document.querySelectorAll('[data-sr-item]').forEach(tr => {
      tr.onclick = (e) => {
        if (e.target.tagName === 'INPUT') return;
        const cb = tr.querySelector('[data-sr-check]');
        if (cb) {
          cb.checked = !cb.checked;
          cb.dispatchEvent(new Event('change'));
        }
      };
    });

    /* Select all */
    const selectAllBtn = document.getElementById('sr-select-all');
    if (selectAllBtn) {
      selectAllBtn.onclick = () => {
        s.itemPool.forEach(i => s.selectedItems.add(i.id));
        render(document.getElementById('page'));
      };
    }

    /* Clear */
    const clearBtn = document.getElementById('sr-clear-selection');
    if (clearBtn) {
      clearBtn.onclick = () => {
        s.selectedItems.clear();
        render(document.getElementById('page'));
      };
    }

    /* Confirm */
    const confirmBtn = document.getElementById('sr-confirm');
    if (confirmBtn) {
      confirmBtn.onclick = () => confirmSupplierReturn();
    }

    updateSupplierConfirmButton();
  }

  function updateSupplierConfirmButton() {
    const btn = document.getElementById('sr-confirm');
    if (!btn) return;

    const s = RetState.supplierReturn;
    const count = s.selectedItems.size;

    if (count === 0) {
      btn.disabled = true;
      btn.innerHTML = `<i data-lucide="package-minus"></i> تأكيد المرتجع`;
    } else {
      const selected = s.itemPool.filter(i => s.selectedItems.has(i.id));
      const totalPure = selected.reduce((a, i) => a + Number(i.pure_weight || 0), 0);
      btn.disabled = false;
      btn.innerHTML = `<i data-lucide="package-minus"></i>
        تأكيد إرجاع ${count} قطعة (${GMS.gramFmt(totalPure)} جم)`;
    }
    window.lucide?.createIcons();
  }

  async function loadSupplierReturnPool() {
    const s = RetState.supplierReturn;
    if (!s.supplierId) {
      s.itemPool = [];
      return;
    }

    /* Load من IDB */
    if (GMS.IDB) {
      try {
        const all = await GMS.IDB.getAll();
        s.itemPool = all.filter(i => i.status === 'IN_STOCK').slice(0, 500);
        return;
      } catch (e) {
        console.warn('[SupplierReturn] IDB read failed:', e);
      }
    }

    /* Demo fallback */
    if (GMS.Demo) {
      s.itemPool = GMS.Demo.getInventory()
        .filter(i => i.status === 'IN_STOCK')
        .slice(0, 500);
    } else {
      s.itemPool = [];
    }
  }

  function filterSupplierPool(query) {
    const s = RetState.supplierReturn;
    const host = document.getElementById('sr-table-host');
    if (!host) return;

    if (!query.trim()) {
      host.innerHTML = renderSupplierTable();
    } else {
      const q = query.toLowerCase();
      const filtered = s.itemPool.filter(i =>
        (i.sku || '').toLowerCase().includes(q) ||
        (i.category || '').toLowerCase().includes(q)
      );

      const original = s.itemPool;
      s.itemPool = filtered;
      host.innerHTML = renderSupplierTable();
      s.itemPool = original;
    }

    window.lucide?.createIcons();

    /* Rebind checkboxes */
    document.querySelectorAll('[data-sr-check]').forEach(cb => {
      cb.onchange = (e) => {
        const id = cb.dataset.srCheck;
        if (cb.checked) s.selectedItems.add(id);
        else s.selectedItems.delete(id);

        const tr = cb.closest('tr');
        if (tr) tr.classList.toggle('selected', cb.checked);

        updateSupplierConfirmButton();
      };
    });
  }

  async function confirmSupplierReturn() {
    const s = RetState.supplierReturn;
    const count = s.selectedItems.size;

    if (!count || !s.supplierId) {
      GMS.Beep?.error();
      return GMS.Toast.err('اختر مورداً وقطعاً أولاً');
    }

    const supplier = GMS.Demo?.getSuppliers()?.find(x => x.id === s.supplierId);
    const selected = s.itemPool.filter(i => s.selectedItems.has(i.id));
    const totalPure = GMS.round(
      selected.reduce((a, i) => a + Number(i.pure_weight || 0), 0), 4
    );
    const totalValue = GMS.round(
      selected.reduce((a, i) => a + Number(i.total_cost || 0), 0), 2
    );

    const newBalance = GMS.round(s.supplierBalance.gold - totalPure, 4);

    const ok = await GMS.Confirm.ask(
      `سيتم إرجاع ${count} قطعة إلى المورد "${supplier?.name}".\n\n` +
      `إجمالي البندق المُرجَع: ${GMS.gramFmt(totalPure)} جم\n` +
      `الرصيد بعد المرتجع: ${GMS.gramFmt(newBalance)} جم`,
      {
        title: 'تأكيد مرتجع المورد',
        okText: 'تنفيذ الإرجاع',
        danger: false,
        icon: 'package-minus',
      }
    );

    if (!ok) return;

    const btn = document.getElementById('sr-confirm');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<i data-lucide="loader-circle"></i> جارٍ التنفيذ…`;
      window.lucide?.createIcons();
    }

    try {
      const returnNo = `SR-${GMS.uid().toUpperCase().slice(0, 10)}`;
      const now = new Date().toISOString();

      const record = {
        id: GMS.uid(),
        return_no: returnNo,
        return_type: 'supplier_return',
        inventory_id: null,
        sku: `${count} قطعة`,
        item_description: selected.map(i => i.sku).join(', ').slice(0, 500),
        karat: null,
        gross_weight: GMS.round(selected.reduce((a, i) => a + Number(i.weight_grams || 0), 0), 3),
        net_weight: GMS.round(selected.reduce((a, i) => a + Number(i.net_weight || 0), 0), 3),
        pure_weight: totalPure,
        base_rate_24: getPrice24(),
        refund_amount: 0,
        credit_issued: 0,
        reason: 'supplier_return',
        notes: s.notes || null,
        party_type: 'supplier',
        party_id: s.supplierId,
        branch_id: GMS.Auth?.profile?.branch_id || null,
        status: 'COMPLETED',
        created_at: now,
      };

      /* 1 · تحديث حالات الأصناف في IDB */
      if (GMS.IDB) {
        for (const item of selected) {
          try {
            const fresh = await GMS.IDB.get(item.id);
            if (fresh) {
              fresh.status = 'RETURNED_TO_SUPPLIER';
              fresh.updated_at = now;
              await GMS.IDB.put(fresh);
            }
          } catch (_) {}
        }
      }

      /* 2 · Supabase */
      if (GMS.Supabase?.isReady()) {
        try {
          const client = GMS.Supabase.get();

          await client
            .from(GMS.SUPABASE_CONFIG.TABLES.INVENTORY)
            .update({
              status: 'RETURNED_TO_SUPPLIER',
              updated_at: now,
            })
            .in('id', selected.map(i => i.id));

          await client
            .from(GMS.SUPABASE_CONFIG.TABLES.RETURNS)
            .insert(record);

          /* Ledger entry */
          await client
            .from(GMS.SUPABASE_CONFIG.TABLES.ENTITY_LEDGER)
            .insert({
              entity_type: 'supplier',
              entity_id: s.supplierId,
              entry_type: 'return_to_supplier',
              gold_delta: GMS.round(-totalPure, 4),
              cash_delta: 0,
              description: `مرتجع إلى المورد — ${returnNo} (${count} قطعة)`,
              reference_no: returnNo,
              branch_id: record.branch_id,
            });
        } catch (e) {
          console.warn('[SupplierReturn] Supabase insert failed:', e);
        }
      }

      RetState.returns.unshift(record);

      /* 3 · تحديث محلي */
      if (supplier) {
        supplier.opening_gold = GMS.round(
          Number(supplier.opening_gold || 0) - totalPure, 4
        );
      }

      /* 4 · Audit */
      if (GMS.Audit) {
        await GMS.Audit.log('SUPPLIER_RETURN', 'supplier', s.supplierId,
          `مرتجع مورد ${returnNo} — ${count} قطعة · ${GMS.gramFmt(totalPure)} جم`,
          {
            return_no: returnNo,
            piece_count: count,
            total_pure: totalPure,
            supplier_name: supplier?.name,
          });
      }

      /* 5 · Realtime */
      if (GMS.Realtime) {
        GMS.Realtime.emit('returns', 'INSERT', record);
      }

      GMS.Beep?.complete();
      GMS.Toast.ok(
        `تم إرجاع ${count} قطعة إلى المورد`,
        `${GMS.gramFmt(totalPure)} جم بندق · القيمة ${GMS.moneyFmt(totalValue)} ج.م`
      );

      /* Reset */
      s.selectedItems.clear();
      await loadSupplierReturnPool();
      render(document.getElementById('page'));

    } catch (e) {
      console.error('[SupplierReturn.confirm]', e);
      GMS.Beep?.error();
      GMS.Toast.err('فشل تنفيذ المرتجع', e.message);

      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="package-minus"></i> إعادة المحاولة`;
        window.lucide?.createIcons();
      }
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §13 · RECEIPT MODALS
     ───────────────────────────────────────────────────────────────────── */

  function showReturnReceipt(record, item, sale) {
    GMS.Modal.open({
      title: `تم الإرجاع بنجاح — ${record.return_no}`,
      icon: 'check-circle-2',
      size: 'lg',
      body: `
        <div style="text-align:center;padding:8px 0 20px">
          <div style="width:64px;height:64px;border-radius:20px;
                      background:var(--gold-grad);display:grid;
                      place-items:center;margin:0 auto 12px;color:#2a1f05;
                      box-shadow:0 14px 34px -12px rgba(184,145,47,.9)">
            <i data-lucide="check" style="width:30px;height:30px"></i>
          </div>
          <h3 style="font-size:16px;margin-bottom:4px">
            تم إرجاع القطعة إلى المخزون
          </h3>
          <div class="mono" style="font-size:12px;color:var(--muted);font-weight:800">
            ${GMS.esc(record.return_no)}
          </div>
        </div>

        <div class="calc-list">
          <div class="cl-row">
            <span class="k"><i data-lucide="package"></i> الصنف</span>
            <span class="v mono" style="font-size:12px">${GMS.esc(item.sku)}</span>
          </div>
          <div class="cl-row">
            <span class="k"><i data-lucide="gem"></i> العيار</span>
            <span class="v">${item.karat}K</span>
          </div>
          <div class="cl-row">
            <span class="k"><i data-lucide="scale"></i> الوزن الصافي</span>
            <span class="v">${GMS.gramFmt(item.net_weight)} جم</span>
          </div>
          <div class="cl-row">
            <span class="k"><i data-lucide="user"></i> العميل</span>
            <span class="v" style="font-size:12px">${GMS.esc(sale?.customer_name || 'عميل نقدي')}</span>
          </div>
          <div class="cl-row hi">
            <span class="k"><i data-lucide="arrow-down-circle"></i> المبلغ المُسترد</span>
            <span class="v mono">${GMS.moneyFmt(record.refund_amount || record.credit_issued)} ج.م</span>
          </div>
          <div class="cl-row">
            <span class="k"><i data-lucide="wallet"></i> طريقة الاسترجاع</span>
            <span class="v" style="font-size:12px">${GMS.REFUND_METHODS[record.refund_method]?.label || record.refund_method}</span>
          </div>
        </div>
      `,
      footer: `
        <button class="btn" data-close>إغلاق</button>
        <button class="btn btn-primary" id="ret-print">
          <i data-lucide="printer"></i> طباعة الإيصال
        </button>
      `,
      onMount: (el, close) => {
        el.querySelector('#ret-print').onclick = () => {
          close();
          printReturnReceipt(record, item, sale);
        };
      },
    });
  }

  function showBuybackReceipt(record) {
    const isCash = record.refund_method === 'cash';

    GMS.Modal.open({
      title: `تم شراء الكسر — ${record.return_no}`,
      icon: 'check-circle-2',
      size: 'lg',
      body: `
        <div style="text-align:center;padding:8px 0 20px">
          <div style="width:64px;height:64px;border-radius:20px;
                      background:linear-gradient(135deg,#3ecf8e,#0f7a43);
                      display:grid;place-items:center;margin:0 auto 12px;
                      color:#fff;
                      box-shadow:0 14px 34px -12px rgba(15,122,67,.9)">
            <i data-lucide="${isCash ? 'banknote' : 'wallet'}" style="width:30px;height:30px"></i>
          </div>
          <h3 style="font-size:16px;margin-bottom:4px">
            ${isCash ? 'تم دفع المبلغ نقداً' : 'تم إصدار رصيد للعميل'}
          </h3>
          <div class="mono" style="font-size:12px;color:var(--muted);font-weight:800">
            ${GMS.esc(record.return_no)}
          </div>
        </div>

        <div class="calc-list">
          <div class="cl-row">
            <span class="k"><i data-lucide="package"></i> كود الكسر</span>
            <span class="v mono" style="font-size:11.5px">${GMS.esc(record.sku)}</span>
          </div>
          <div class="cl-row">
            <span class="k"><i data-lucide="gem"></i> العيار</span>
            <span class="v">${record.karat}K</span>
          </div>
          <div class="cl-row">
            <span class="k"><i data-lucide="test-tube"></i> النقاء المُختبَر</span>
            <span class="v mono">${record.tested_purity.toFixed(4)}</span>
          </div>
          <div class="cl-row">
            <span class="k"><i data-lucide="scale"></i> الوزن الصافي</span>
            <span class="v">${GMS.gramFmt(record.net_weight)} جم</span>
          </div>
          <div class="cl-row hi">
            <span class="k"><i data-lucide="sparkles"></i> البندق 24K</span>
            <span class="v">${GMS.gramFmt(record.pure_weight)} جم</span>
          </div>
          <div class="cl-row">
            <span class="k"><i data-lucide="tag"></i> سعر الشراء المُطبَّق</span>
            <span class="v">${GMS.moneyFmt(record.applied_rate)} ج.م/جم</span>
          </div>
          <div class="cl-row" style="font-size:15px;margin-top:6px;
                      border-top:1.5px solid var(--border-strong);
                      padding-top:12px">
            <span class="k" style="font-weight:900;color:var(--text)">الإجمالي</span>
            <span class="v mono" style="color:var(--success);
                        font-size:20px;font-weight:900">
              ${GMS.moneyFmt(record.refund_amount || record.credit_issued)} ج.م
            </span>
          </div>
        </div>
      `,
      footer: `
        <button class="btn" data-close>إغلاق</button>
        <button class="btn btn-primary" id="bb-print-receipt">
          <i data-lucide="printer"></i> طباعة الإيصال
        </button>
      `,
      onMount: (el, close) => {
        el.querySelector('#bb-print-receipt').onclick = () => {
          close();
          printBuybackReceipt(record);
        };
      },
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §14 · PRINT RECEIPTS
     ───────────────────────────────────────────────────────────────────── */

  function printReturnReceipt(ret, item, sale) {
    const root = document.getElementById('print-root');
    if (!root) return;

    root.innerHTML = `
      <div class="receipt-print">
        <h2>${GMS.t('receipt.returnTitle')}</h2>

        <div style="text-align:center;font-size:10pt;margin-bottom:5mm">
          ${GMS.esc(GMS.APP_CONFIG.NAME_AR)}<br>
          ${GMS.esc(GMS.Auth?.profile?.full_name || '—')}
        </div>

        <hr>

        <div class="rp-line">
          <span>رقم الإيصال</span>
          <b>${GMS.esc(ret.return_no)}</b>
        </div>
        <div class="rp-line">
          <span>التاريخ</span>
          <b>${GMS.dateTimeAr(new Date())}</b>
        </div>

        <hr>

        <div class="rp-line">
          <span>كود التاج</span>
          <b>${GMS.esc(item.sku)}</b>
        </div>
        <div class="rp-line">
          <span>التصنيف</span>
          <b>${GMS.esc(item.category || '—')}</b>
        </div>
        <div class="rp-line">
          <span>العيار</span>
          <b>${item.karat}K</b>
        </div>
        <div class="rp-line">
          <span>الوزن الصافي</span>
          <b>${GMS.gramFmt(item.net_weight)} جم</b>
        </div>
        <div class="rp-line">
          <span>البندق 24K</span>
          <b>${GMS.gramFmt(item.pure_weight)} جم</b>
        </div>

        <hr>

        <div class="rp-line">
          <span>الفاتورة الأصلية</span>
          <b>${GMS.esc(sale?.sale_no || sale?.invoice_no || '—')}</b>
        </div>
        <div class="rp-line">
          <span>تاريخ البيع</span>
          <b>${GMS.dateAr(sale?.created_at)}</b>
        </div>
        <div class="rp-line">
          <span>العميل</span>
          <b>${GMS.esc(sale?.customer_name || '—')}</b>
        </div>

        <hr>

        <div class="rp-row total">
          <span>المبلغ المُسترد</span>
          <b>${GMS.moneyFmt(ret.refund_amount || ret.credit_issued)} ج.م</b>
        </div>

        <div class="rp-line" style="margin-top:2mm">
          <span>طريقة الاسترجاع</span>
          <b>${GMS.REFUND_METHODS[ret.refund_method]?.label || ret.refund_method}</b>
        </div>

        ${ret.reason ? `
          <hr>
          <div class="rp-line">
            <span>السبب</span>
            <b>${GMS.esc(ret.reason)}</b>
          </div>
        ` : ''}

        <hr>

        <div style="text-align:center;font-size:9pt;margin-top:5mm">
          ${GMS.t('receipt.thanks')}
        </div>

        <div class="pr-sign" style="margin-top:8mm;display:flex;
                    justify-content:space-between;font-size:9pt">
          <div style="border-top:1px solid #000;padding-top:2mm;
                      min-width:30mm;text-align:center">
            ${GMS.t('receipt.customerSignature')}
          </div>
          <div style="border-top:1px solid #000;padding-top:2mm;
                      min-width:30mm;text-align:center">
            ${GMS.t('receipt.cashierSignature')}
          </div>
        </div>
      </div>
    `;

    setTimeout(() => window.print(), 150);
  }

  function printBuybackReceipt(record) {
    const root = document.getElementById('print-root');
    if (!root) return;

    const isCash = record.refund_method === 'cash';

    root.innerHTML = `
      <div class="receipt-print">
        <h2>${GMS.t('receipt.buybackTitle')}</h2>

        <div style="text-align:center;font-size:10pt;margin-bottom:5mm">
          ${GMS.esc(GMS.APP_CONFIG.NAME_AR)}<br>
          ${GMS.esc(GMS.Auth?.profile?.full_name || '—')}
        </div>

        <hr>

        <div class="rp-line">
          <span>رقم الإيصال</span>
          <b>${GMS.esc(record.return_no)}</b>
        </div>
        <div class="rp-line">
          <span>التاريخ</span>
          <b>${GMS.dateTimeAr(new Date())}</b>
        </div>

        <hr>

        <div class="rp-line">
          <span>كود الكسر</span>
          <b>${GMS.esc(record.sku)}</b>
        </div>
        <div class="rp-line">
          <span>العيار المُدَّعى</span>
          <b>${record.karat}K</b>
        </div>
        <div class="rp-line">
          <span>النقاء المُختبَر</span>
          <b>${record.tested_purity.toFixed(4)}</b>
        </div>
        <div class="rp-line">
          <span>الوزن القائم</span>
          <b>${GMS.gramFmt(record.gross_weight)} جم</b>
        </div>
        <div class="rp-line">
          <span>الوزن الصافي</span>
          <b>${GMS.gramFmt(record.net_weight)} جم</b>
        </div>
        <div class="rp-line">
          <span>البندق 24K</span>
          <b>${GMS.gramFmt(record.pure_weight)} جم</b>
        </div>

        <hr>

        <div class="rp-line">
          <span>سعر 24K المرجعي</span>
          <b>${GMS.moneyFmt(record.base_rate_24)} ج.م</b>
        </div>
        <div class="rp-line">
          <span>هامش الشراء</span>
          <b>${Number(record.buy_margin_pct).toFixed(1)}%</b>
        </div>
        <div class="rp-line">
          <span>السعر المُطبَّق</span>
          <b>${GMS.moneyFmt(record.applied_rate)} ج.م/جم</b>
        </div>

        <div class="rp-row total">
          <span>${isCash ? 'المبلغ المدفوع' : 'الرصيد المُصدر'}</span>
          <b>${GMS.moneyFmt(record.refund_amount || record.credit_issued)} ج.م</b>
        </div>

        <div class="rp-line" style="margin-top:2mm">
          <span>طريقة الدفع</span>
          <b>${GMS.BUYBACK_MODES[record.refund_method]?.label || record.refund_method}</b>
        </div>

        ${record.customer_name || record.customer_phone ? `
          <hr>
          ${record.customer_name ? `
            <div class="rp-line">
              <span>العميل</span>
              <b>${GMS.esc(record.customer_name)}</b>
            </div>
          ` : ''}
          ${record.customer_phone ? `
            <div class="rp-line">
              <span>الهاتف</span>
              <b>${GMS.esc(record.customer_phone)}</b>
            </div>
          ` : ''}
        ` : ''}

        <hr>

        <div style="text-align:center;font-size:9pt;margin-top:5mm">
          ${GMS.t('receipt.thanks')}
        </div>

        <div class="pr-sign" style="margin-top:8mm;display:flex;
                    justify-content:space-between;font-size:9pt">
          <div style="border-top:1px solid #000;padding-top:2mm;
                      min-width:30mm;text-align:center">
            ${GMS.t('receipt.customerSignature')}
          </div>
          <div style="border-top:1px solid #000;padding-top:2mm;
                      min-width:30mm;text-align:center">
            ${GMS.t('receipt.cashierSignature')}
          </div>
        </div>
      </div>
    `;

    setTimeout(() => window.print(), 150);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §15 · EXPORT
     ───────────────────────────────────────────────────────────────────── */

  function exportReturns() {
    if (!RetState.returns.length) {
      GMS.Toast.warn('لا توجد بيانات');
      return;
    }

    if (!GMS.Excel?.Exporter) {
      GMS.Toast.err('محرك Excel غير متاح');
      return;
    }

    GMS.Excel.Exporter.returns(RetState.returns);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §16 · INITIALIZATION
     ───────────────────────────────────────────────────────────────────── */

  async function init() {
    try {
      await loadReturns();
      loadWallet();
      updateStats();

      /* إن كان في تبويب مرتجع المورد، حمّل القطع */
      if (RetState.activeTab === 'supplier-return' && RetState.supplierReturn.supplierId) {
        await loadSupplierReturnPool();
      }
    } catch (e) {
      console.error('[Returns.init]', e);
      GMS.Toast.err('فشل تحميل البيانات', e.message);
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §17 · CLEANUP
     ───────────────────────────────────────────────────────────────────── */

  function cleanup() {
    cleanupListeners();
    resetReturnFlow();
    RetState.supplierReturn.selectedItems.clear();
  }

  /* ═════════════════════════════════════════════════════════════════════
     §18 · VIEW REGISTRATION
     ═════════════════════════════════════════════════════════════════════ */
  GMS.Views = GMS.Views || {};

  GMS.Views.returns = {
    render: async (root) => {
      await init();
      render(root);
    },
    cleanup,
    state: RetState,

    /* Data */
    load: loadReturns,
    reload: init,

    /* Actions */
    lookupReturnItem,
    confirmSalesReturn,
    confirmBuyback,
    confirmSupplierReturn,

    /* Receipts */
    printReturnReceipt,
    printBuybackReceipt,

    /* Export */
    export: exportReturns,

    /* Wallet */
    getWallet: () => RetState.wallet.slice(),
    saveWallet,
  };

  /* ═════════════════════════════════════════════════════════════════════
     §19 · LOADED CONFIRMATION
     ═════════════════════════════════════════════════════════════════════ */
  console.log(
    '%c↩️ Returns View loaded · 3 workflows',
    'color:#0f7a43;font-weight:800;font-size:12px;padding:1px 5px;' +
    'background:#e6f6ee;border-radius:4px;'
  );

  console.log(
    `%c📋 Sales Return · Scrap Buyback · Supplier Return · Receipts · Wallet`,
    'color:#6b7a95;font-weight:700;font-size:11px;'
  );

  /* ═════════════════════════════════════════════════════════════════════
     ✅ js/16-views-returns.js — نهاية الملف
     ═════════════════════════════════════════════════════════════════════ */

})();
