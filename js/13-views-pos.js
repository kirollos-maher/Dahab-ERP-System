/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ENTERPRISE — js/13-views-pos.js
   نقطة البيع (Point of Sale):
     - مسح باركود سريع (Hardware Scanner)
     - بحث محلي فوري من IndexedDB
     - سلة تسوق ديناميكية
     - حساب لحظي للأوزان والقيم
     - Modal إتمام البيعة (الدفع)
     - حفظ فوري (online) أو Queue (offline)
     - طباعة إيصال حرارية
     - Offline-First بالكامل
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const GMS = window.GMS = window.GMS || {};

  /* ═════════════════════════════════════════════════════════════════════
     §1 · POS STATE
     ═════════════════════════════════════════════════════════════════════ */
  const POSState = {
    /* السلة */
    cart: [],

    /* نتائج المسح الأخيرة */
    lastScan: null,

    /* إعدادات */
    config: {
      maxCartItems: 500,
      scanTimeout: 180,
      beepEnabled: true,
      autoFocusScan: true,
      autoAddScanned: true,
    },

    /* إحصائيات الجلسة */
    stats: {
      scans: 0,
      hits: 0,
      misses: 0,
      errors: 0,
      salesCompleted: 0,
      totalRevenue: 0,
      totalPureWeight: 0,
      sessionStartedAt: null,
    },

    /* حالة الواجهة */
    ui: {
      scanFocused: false,
      processingScan: false,
      checkoutOpen: false,
    },

    /* مستمعو الأحداث */
    unsubscribers: [],

    /* مؤقتات */
    timers: {
      scanClear: null,
      searchDebounce: null,
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §2 · HELPERS
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * قراءة لون CSS
   * @param {string} name
   * @returns {string}
   */
  function cssVar(name) {
    return getComputedStyle(document.documentElement)
      .getPropertyValue(name).trim();
  }

  /**
   * تحديث عنصر نصي بأمان
   * @param {string} selector
   * @param {string} value
   */
  function setText(selector, value) {
    const el = document.querySelector(selector);
    if (el && el.textContent !== String(value)) {
      el.textContent = String(value);
    }
  }

  /**
   * حساب إجماليات السلة
   * @returns {Object}
   */
  function computeCartTotals() {
    const items = POSState.cart;

    let count = 0;
    let gross = 0;
    let net = 0;
    let pure = 0;
    let gold = 0;
    let making = 0;
    let stone = 0;
    let total = 0;

    const price24 = getPrice24();

    items.forEach(item => {
      const qty = Number(item.qty || 1);

      count += qty;
      gross += Number(item.weight_grams || 0) * qty;
      net += Number(item.net_weight || 0) * qty;
      pure += Number(item.pure_weight || 0) * qty;
      making += Number(item.workmanship_value || 0) * qty;
      stone += Number(item.stone_value || 0) * qty;

      /* قيمة الذهب محسوبة على السعر الحالي */
      const itemGoldValue = Number(item.pure_weight || 0) * price24;
      gold += itemGoldValue * qty;
    });

    total = gold + making + stone;

    return {
      count,
      gross: GMS.round(gross, 3),
      net: GMS.round(net, 3),
      pure: GMS.round(pure, 4),
      gold: GMS.round(gold, 2),
      making: GMS.round(making, 2),
      stone: GMS.round(stone, 2),
      total: GMS.round(total, 2),
    };
  }

  /**
   * سعر 24K الحالي
   * @returns {number}
   */
  function getPrice24() {
    if (GMS.Cache) {
      const price = GMS.Cache.getPrice();
      if (price && price.price_24) return Number(price.price_24);
    }
    return GMS.APP_CONFIG.DEFAULT_PRICE_24;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §3 · SEARCH ENGINE
     ─────────────────────────────────────────────────────────────────────
     بحث محلي فوري في IndexedDB (مع fallback على Demo)
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * البحث عن صنف بواسطة SKU (فوري — IndexedDB)
   * @param {string} sku
   * @returns {Promise<Object|null>}
   */
  async function findBySku(sku) {
    const key = String(sku || '').trim().toUpperCase();
    if (!key) return null;

    const t0 = performance.now();

    /* 1 · IndexedDB (سريع) */
    if (GMS.IDB && GMS.IDB.isOpen) {
      try {
        const item = await GMS.IDB.getBySku(key);
        if (item) {
          return {
            item,
            source: 'idb',
            latency: GMS.round(performance.now() - t0, 2),
          };
        }
      } catch (e) {
        console.warn('[POS] IDB search failed:', e);
      }
    }

    /* 2 · Demo data */
    if (GMS.Demo) {
      try {
        const items = GMS.Demo.getInventory();
        const item = items.find(
          i => i.sku.toUpperCase() === key
        );
        if (item) {
          return {
            item,
            source: 'demo',
            latency: GMS.round(performance.now() - t0, 2),
          };
        }
      } catch (e) {
        console.warn('[POS] Demo search failed:', e);
      }
    }

    return {
      item: null,
      source: 'miss',
      latency: GMS.round(performance.now() - t0, 2),
    };
  }

  /**
   * بحث نصي شامل (للبحث اليدوي)
   * @param {string} query
   * @param {number} [limit=20]
   * @returns {Promise<Array>}
   */
  async function searchItems(query, limit = 20) {
    if (!query || query.trim().length < 2) return [];

    /* 1 · IndexedDB */
    if (GMS.IDB && GMS.IDB.isOpen) {
      try {
        const items = await GMS.IDB.search(query, {
          status: 'IN_STOCK',
          limit,
        });
        if (items.length) return items;
      } catch (e) {
        console.warn('[POS] IDB text search failed:', e);
      }
    }

    /* 2 · Demo fallback */
    if (GMS.Demo) {
      try {
        return GMS.Demo.searchInventory(query, {
          status: 'IN_STOCK',
          limit,
        });
      } catch (e) {
        console.warn('[POS] Demo text search failed:', e);
      }
    }

    return [];
  }

  /* ═════════════════════════════════════════════════════════════════════
     §4 · CART OPERATIONS
     ═════════════════════════════════════════════════════════════════════ */

  const Cart = {

    /**
     * إضافة صنف للسلة
     * @param {Object} item
     * @param {number} [qty=1]
     * @returns {Object}
     */
    add(item, qty = 1) {
      if (!item || !item.sku) {
        return { success: false, reason: 'INVALID_ITEM' };
      }

      /* فحص حد أقصى */
      if (POSState.cart.length >= POSState.config.maxCartItems) {
        return { success: false, reason: 'CART_FULL' };
      }

      /* فحص التكرار */
      const existing = POSState.cart.find(i => i.sku === item.sku);

      if (existing) {
        existing.qty += qty;
        return {
          success: false,
          reason: 'DUPLICATE',
          existing,
        };
      }

      /* فحص الحالة */
      if (item.status && item.status !== 'IN_STOCK') {
        return {
          success: false,
          reason: 'NOT_IN_STOCK',
          status: item.status,
        };
      }

      /* إضافة */
      const entry = {
        ...item,
        qty,
        addedAt: Date.now(),
        cartId: GMS.uid(),
      };

      POSState.cart.push(entry);

      return {
        success: true,
        entry,
      };
    },

    /**
     * إزالة صنف من السلة
     * @param {string} sku
     * @returns {boolean}
     */
    remove(sku) {
      const idx = POSState.cart.findIndex(i => i.sku === sku);
      if (idx < 0) return false;

      POSState.cart.splice(idx, 1);
      return true;
    },

    /**
     * زيادة الكمية
     * @param {string} sku
     * @returns {boolean}
     */
    increment(sku) {
      const item = POSState.cart.find(i => i.sku === sku);
      if (!item) return false;

      item.qty++;
      return true;
    },

    /**
     * تقليل الكمية (أو حذف إذا وصلت 1)
     * @param {string} sku
     * @returns {boolean}
     */
    decrement(sku) {
      const item = POSState.cart.find(i => i.sku === sku);
      if (!item) return false;

      if (item.qty <= 1) {
        return this.remove(sku);
      }

      item.qty--;
      return true;
    },

    /**
     * تفريغ السلة
     */
    clear() {
      POSState.cart = [];
    },

    /**
     * هل السلة تحتوي الصنف؟
     * @param {string} sku
     * @returns {boolean}
     */
    has(sku) {
      return POSState.cart.some(i => i.sku === sku);
    },

    /**
     * قراءة السلة
     * @returns {Array}
     */
    getAll() {
      return POSState.cart.slice();
    },

    /**
     * عدد الأصناف
     * @returns {number}
     */
    count() {
      return POSState.cart.length;
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §5 · HTML RENDERERS
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * HTML لبطاقة نتيجة المسح
   * @param {Object} scan
   * @returns {string}
   */
  function renderScanResult(scan) {
    if (!scan) return '';

    if (!scan.item) {
      return `
        <div class="scan-result show err">
          <div class="sr-head">
            <i data-lucide="x-circle"
               style="width:22px;height:22px;color:var(--danger)"></i>
            <div style="flex:1;min-width:0">
              <div class="sr-title">${GMS.t('pos.itemNotFound')}</div>
              <div class="sr-sub">${GMS.esc(scan.sku || '')}</div>
            </div>
            <span class="sr-latency">${scan.latency} ms</span>
          </div>
        </div>
      `;
    }

    const item = scan.item;

    return `
      <div class="scan-result show ok">
        <div class="sr-head">
          <i data-lucide="check-circle-2"
             style="width:22px;height:22px;color:var(--success)"></i>
          <div style="flex:1;min-width:0">
            <div class="sr-title">${GMS.t('pos.itemFound')}</div>
            <div class="sr-sub">
              ${GMS.esc(item.category || '—')} · ${GMS.esc(item.manufacturer_name || '—')}
            </div>
          </div>
          <span class="sr-latency">${scan.latency} ms</span>
        </div>

        <div class="sr-meta">
          <span>SKU: <b class="mono">${GMS.esc(item.sku)}</b></span>
          <span>العيار: <b>${item.karat}K</b></span>
          <span>صافي: <b class="mono">${GMS.gramFmt(item.net_weight)} جم</b></span>
          <span>بندق: <b class="mono">${GMS.gramFmt(item.pure_weight)} جم</b></span>
          <span>الإجمالي: <b class="mono">${GMS.moneyFmt(item.total_cost)} ج.م</b></span>
        </div>
      </div>
    `;
  }

  /**
   * HTML لسطر في السلة
   * @param {Object} item
   * @param {number} idx
   * @returns {string}
   */
  function renderCartRow(item, idx) {
    const price24 = getPrice24();
    const itemGoldValue = Number(item.pure_weight || 0) * price24;
    const lineTotal = (itemGoldValue + Number(item.workmanship_value || 0) + Number(item.stone_value || 0)) * item.qty;

    return `
      <div class="queue-item" data-cart-sku="${GMS.esc(item.sku)}">
        <div class="qi-icon" style="background:var(--gold-soft);color:var(--warn)">
          <i data-lucide="gem"></i>
        </div>

        <div class="qi-body">
          <div class="qi-title mono">${GMS.esc(item.sku)}</div>
          <div class="qi-meta">
            <span>${item.karat}K</span>
            <span>صافي ${GMS.gramFmt(item.net_weight)} جم</span>
            <span>بندق ${GMS.gramFmt(item.pure_weight)} جم</span>
          </div>

          <div style="display:flex;align-items:center;gap:8px;margin-top:8px">
            <button class="row-act" data-cart-dec="${idx}" title="تقليل"
                    style="width:24px;height:24px;border:1px solid var(--border);
                           border-radius:6px">
              <i data-lucide="minus" style="width:11px;height:11px"></i>
            </button>
            <span class="mono" style="min-width:24px;text-align:center;
                        font-weight:800;font-size:12.5px">
              ${item.qty}
            </span>
            <button class="row-act" data-cart-inc="${idx}" title="زيادة"
                    style="width:24px;height:24px;border:1px solid var(--border);
                           border-radius:6px">
              <i data-lucide="plus" style="width:11px;height:11px"></i>
            </button>
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">
          <div class="qi-amount">${GMS.moneyFmt(lineTotal)}</div>
          <button class="qi-del" data-cart-del="${idx}" title="حذف">
            <i data-lucide="x"></i>
          </button>
        </div>
      </div>
    `;
  }

  /**
   * HTML لسلة فاضية
   * @returns {string}
   */
  function renderEmptyCart() {
    return `
      <div class="empty" style="padding:60px 20px">
        <i data-lucide="shopping-bag"></i>
        <p>${GMS.t('pos.cartEmpty')}</p>
        <span>${GMS.t('pos.cartEmptyHint')}</span>
      </div>
    `;
  }

  /**
   * HTML لقائمة نتائج البحث النصي
   * @param {Array} items
   * @returns {string}
   */
  function renderSearchResults(items) {
    if (!items.length) {
      return `
        <div class="empty" style="padding:20px">
          <i data-lucide="search-x"></i>
          <p>لا توجد نتائج</p>
        </div>
      `;
    }

    return `
      <div style="padding:8px 0;max-height:340px;overflow-y:auto">
        ${items.map(item => `
          <div class="queue-item" data-search-add="${GMS.esc(item.sku)}"
               style="cursor:pointer">
            <div class="qi-icon" style="background:var(--gold-soft);color:var(--warn)">
              <i data-lucide="gem"></i>
            </div>
            <div class="qi-body">
              <div class="qi-title mono">${GMS.esc(item.sku)}</div>
              <div class="qi-meta">
                <span>${item.karat}K</span>
                <span>${GMS.esc(item.category || '—')}</span>
                <span>${GMS.gramFmt(item.net_weight)} جم</span>
              </div>
            </div>
            <div class="qi-amount">${GMS.moneyFmt(item.total_cost)}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §6 · SCAN HANDLER
     ─────────────────────────────────────────────────────────────────────
     معالجة مسح واحد
     ═════════════════════════════════════════════════════════════════════ */

  async function handleScan(rawSku, meta = {}) {
    if (POSState.ui.processingScan) return;

    const sku = String(rawSku || '').trim().toUpperCase();
    if (!sku) return;

    POSState.ui.processingScan = true;
    POSState.stats.scans++;

    try {
      /* تشغيل صوت */
      if (POSState.config.beepEnabled) {
        GMS.Beep?.info();
      }

      /* البحث */
      const result = await findBySku(sku);

      /* تحديث آخر مسح */
      POSState.lastScan = {
        sku,
        item: result.item,
        source: result.source,
        latency: result.latency,
        at: new Date().toISOString(),
        wasScanner: meta.wasScanner || false,
      };

      /* عرض النتيجة */
      const resultHost = document.getElementById('pos-scan-result');
      if (resultHost) {
        resultHost.innerHTML = renderScanResult(POSState.lastScan);
        window.lucide?.createIcons();
      }

      /* لم يُعثر عليه */
      if (!result.item) {
        POSState.stats.misses++;
        if (POSState.config.beepEnabled) {
          GMS.Beep?.error();
        }
        return;
      }

      /* موجود */
      POSState.stats.hits++;

      /* فحص الحالة */
      if (result.item.status && result.item.status !== 'IN_STOCK') {
        if (POSState.config.beepEnabled) {
          GMS.Beep?.error();
        }
        GMS.Toast.warn(
          GMS.t('pos.itemOutOfStock'),
          `${sku} · الحالة: ${GMS.getStatus(result.item.status)?.label || result.item.status}`
        );
        return;
      }

      /* فحص التكرار */
      if (Cart.has(sku)) {
        if (POSState.config.beepEnabled) {
          GMS.Beep?.warning();
        }
        GMS.Toast.warn(
          GMS.t('pos.itemAlreadyAdded'),
          sku
        );
        return;
      }

      /* أضف للسلة */
      if (POSState.config.autoAddScanned) {
        const added = Cart.add(result.item);

        if (added.success) {
          if (POSState.config.beepEnabled) {
            GMS.Beep?.success();
          }

          /* تحديث السلة */
          refreshCart();

          /* تأثير بصري */
          const scanHero = document.getElementById('pos-scan-hero');
          if (scanHero) {
            scanHero.classList.add('scanning');
            setTimeout(() => scanHero.classList.remove('scanning'), 600);
          }
        }
      }

    } catch (e) {
      POSState.stats.errors++;
      console.error('[POS.handleScan]', e);
      GMS.Toast.err('خطأ في المسح', e.message);
    } finally {
      POSState.ui.processingScan = false;

      /* جدولة مسح النتيجة بعد فترة */
      clearTimeout(POSState.timers.scanClear);
      POSState.timers.scanClear = setTimeout(() => {
        const resultHost = document.getElementById('pos-scan-result');
        if (resultHost) {
          resultHost.innerHTML = '';
        }
      }, 4000);
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §7 · CART UI REFRESH
     ───────────────────────────────────────────────────────────────────── */

  function refreshCart() {
    const cartHost = document.getElementById('pos-cart-list');
    if (!cartHost) return;

    /* السلة فاضية */
    if (POSState.cart.length === 0) {
      cartHost.innerHTML = renderEmptyCart();
    } else {
      cartHost.innerHTML = POSState.cart.map(renderCartRow).join('');
    }

    window.lucide?.createIcons();

    /* ربط الأحداث */
    bindCartControls(cartHost);

    /* تحديث الإجماليات */
    refreshTotals();
  }

  function bindCartControls(host) {
    /* حذف */
    host.querySelectorAll('[data-cart-del]').forEach(btn => {
      btn.onclick = () => {
        const idx = Number(btn.dataset.cartDel);
        const item = POSState.cart[idx];
        if (!item) return;

        Cart.remove(item.sku);
        refreshCart();

        if (POSState.config.beepEnabled) {
          GMS.Beep?.delete();
        }
      };
    });

    /* زيادة */
    host.querySelectorAll('[data-cart-inc]').forEach(btn => {
      btn.onclick = () => {
        const idx = Number(btn.dataset.cartInc);
        const item = POSState.cart[idx];
        if (!item) return;

        Cart.increment(item.sku);
        refreshCart();
      };
    });

    /* تقليل */
    host.querySelectorAll('[data-cart-dec]').forEach(btn => {
      btn.onclick = () => {
        const idx = Number(btn.dataset.cartDec);
        const item = POSState.cart[idx];
        if (!item) return;

        Cart.decrement(item.sku);
        refreshCart();
      };
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §8 · TOTALS REFRESH
     ───────────────────────────────────────────────────────────────────── */

  function refreshTotals() {
    const t = computeCartTotals();

    /* الهيدر */
    setText('#pos-cart-count', `${t.count} ${GMS.t('unit.piece')}`);

    /* الإجماليات */
    setText('#pos-total-count', GMS.intFmt(t.count));
    setText('#pos-total-net', GMS.gramFmt(t.net));
    setText('#pos-total-pure', GMS.gramFmt(t.pure));
    setText('#pos-total-gold', GMS.moneyFmt(t.gold));
    setText('#pos-total-making', GMS.moneyFmt(t.making));
    setText('#pos-total-stone', GMS.moneyFmt(t.stone));
    setText('#pos-total-grand', GMS.moneyFmt(t.total));

    /* زر الدفع */
    const checkoutBtn = document.getElementById('pos-checkout-btn');
    if (checkoutBtn) {
      checkoutBtn.disabled = POSState.cart.length === 0;
      checkoutBtn.innerHTML = POSState.cart.length
        ? `<i data-lucide="credit-card"></i>
           ${GMS.t('pos.checkout')} · ${GMS.moneyFmt(t.total)} ج.م`
        : `<i data-lucide="credit-card"></i> ${GMS.t('pos.checkout')}`;
      window.lucide?.createIcons();
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §9 · MAIN RENDER
     ───────────────────────────────────────────────────────────────────── */

  /**
   * تصيير الصفحة الرئيسية
   * @param {Element} root
   */
  function render(root) {
    const online = GMS.Sync?.state?.online !== false;
    const price24 = getPrice24();

    root.innerHTML = `
      <div class="page-header">
        <h2>
          <i data-lucide="scan-line"></i>
          ${GMS.t('pos.title')}
        </h2>
        <p>${GMS.t('pos.subtitle')}</p>
      </div>

      <div class="workspace">
        <!-- LEFT: scan + cart -->
        <div>
          <!-- Scan Hero -->
          <div class="scan-hero" id="pos-scan-hero">
            <div class="sh-icon">
              <i data-lucide="scan-line"></i>
            </div>
            <h2>${GMS.t('pos.scanTitle')}</h2>
            <p>${GMS.t('pos.scanHint')}</p>

            <input id="pos-scan-input"
                   placeholder="${GMS.t('pos.scanPlaceholder')}"
                   autocomplete="off"
                   spellcheck="false"
                   autocapitalize="off"
                   autocorrect="off">

            <div class="scan-hint">
              <span><kbd>Enter</kbd> بحث</span>
              <span><kbd>Esc</kbd> مسح</span>
              <span>
                <span style="display:inline-block;width:6px;height:6px;
                             border-radius:50%;margin-inline-end:5px;
                             background:${online ? 'var(--success)' : 'var(--warn)'}"></span>
                ${online ? 'متصل' : 'غير متصل — يعمل محلياً'}
              </span>
            </div>
          </div>

          <!-- Scan Result -->
          <div id="pos-scan-result"></div>

          <!-- Cart -->
          <div class="card" style="margin-top:16px">
            <div class="card-head">
              <h3>
                <i data-lucide="shopping-cart"></i>
                ${GMS.t('pos.cart')}
              </h3>
              <div class="spacer" style="flex:1"></div>
              <span class="chip ${online ? 'ok' : 'warn'}">
                <i data-lucide="${online ? 'cloud-check' : 'cloud-off'}"
                   style="width:12px;height:12px"></i>
                ${online ? 'دفع فوري' : 'يُحفظ محلياً'}
              </span>
              <span class="card-sub" id="pos-cart-count">0 ${GMS.t('unit.piece')}</span>
            </div>

            <div class="card-body" style="padding:0" id="pos-cart-list">
              ${renderEmptyCart()}
            </div>

            <div class="modal-foot" style="justify-content:space-between;
                        background:var(--surface-2)">
              <button class="btn btn-ghost" id="pos-clear-btn">
                <i data-lucide="trash-2"></i> ${GMS.t('action.clear')}
              </button>
              <button class="btn btn-primary btn-lg" id="pos-checkout-btn" disabled>
                <i data-lucide="credit-card"></i> ${GMS.t('pos.checkout')}
              </button>
            </div>
          </div>

          <!-- Search Fallback -->
          <div class="card" style="margin-top:16px">
            <div class="card-head">
              <h3>
                <i data-lucide="search"></i>
                بحث يدوي
              </h3>
              <div class="spacer" style="flex:1"></div>
              <span class="card-sub">بديل للباركود</span>
            </div>
            <div class="card-body">
              <div class="field">
                <input id="pos-search-input"
                       placeholder="اكتب SKU، الماركة، أو التصنيف…"
                       autocomplete="off">
              </div>
              <div id="pos-search-results" style="margin-top:12px"></div>
            </div>
          </div>
        </div>

        <!-- RIGHT: totals -->
        <div style="position:sticky;top:calc(calc(var(--topbar-h) + var(--tabs-h)) + 22px)">
          <div class="card">
            <div class="card-head">
              <h3>
                <i data-lucide="calculator"></i>
                الملخص اللحظي
              </h3>
            </div>
            <div class="card-body">
              <div class="calc-list">
                <div class="cl-row">
                  <span class="k"><i data-lucide="package"></i> عدد القطع</span>
                  <span class="v" id="pos-total-count">0</span>
                </div>
                <div class="cl-row">
                  <span class="k"><i data-lucide="scale"></i> الوزن الصافي</span>
                  <span class="v" id="pos-total-net">0.000 جم</span>
                </div>
                <div class="cl-row hi">
                  <span class="k"><i data-lucide="sparkles"></i> البندق 24K</span>
                  <span class="v" id="pos-total-pure">0.000 جم</span>
                </div>
              </div>

              <div class="divider"></div>

              <div class="calc-list">
                <div class="cl-row">
                  <span class="k"><i data-lucide="coins"></i> قيمة الذهب</span>
                  <span class="v" id="pos-total-gold">0.00</span>
                </div>
                <div class="cl-row">
                  <span class="k"><i data-lucide="hammer"></i> المصنعية</span>
                  <span class="v" id="pos-total-making">0.00</span>
                </div>
                <div class="cl-row">
                  <span class="k"><i data-lucide="gem"></i> قيمة الأحجار</span>
                  <span class="v" id="pos-total-stone">0.00</span>
                </div>
              </div>

              <div style="margin-top:16px;padding:16px;border-radius:12px;
                          background:linear-gradient(135deg,
                            color-mix(in srgb,var(--primary) 15%,var(--surface)) 0%,
                            color-mix(in srgb,var(--primary) 4%,var(--surface)) 100%);
                          border:1.5px solid color-mix(in srgb,var(--primary) 45%,var(--border));
                          position:relative;overflow:hidden">
                <div style="position:absolute;inset-block:0;inset-inline-start:0;
                            width:4px;background:var(--gold-grad)"></div>
                <div style="font-size:11px;font-weight:800;color:var(--muted);
                            text-transform:uppercase;letter-spacing:.5px">
                  ${GMS.t('pos.totalAmount')}
                </div>
                <div style="font-family:var(--font-mono);font-size:28px;
                            font-weight:900;color:var(--primary);
                            letter-spacing:-1px;margin-top:6px;
                            display:flex;align-items:baseline;gap:6px">
                  <span id="pos-total-grand">0.00</span>
                  <small style="font-size:14px;color:var(--muted)">ج.م</small>
                </div>
              </div>

              <div style="margin-top:12px;padding:10px 14px;border-radius:9px;
                          background:var(--surface-2);font-size:11px;
                          font-weight:700;color:var(--muted);text-align:center">
                <i data-lucide="info"
                   style="width:12px;height:12px;display:inline;vertical-align:-2px"></i>
                سعر الجرام 24K الحالي:
                <b class="mono" style="color:var(--primary)">
                  ${GMS.moneyFmt(price24)} ج.م
                </b>
              </div>
            </div>
          </div>

          <!-- Session Stats -->
          <div class="card">
            <div class="card-head">
              <h3>
                <i data-lucide="activity"></i>
                إحصائيات الجلسة
              </h3>
            </div>
            <div class="card-body">
              <div class="calc-list">
                <div class="cl-row">
                  <span class="k">عمليات المسح</span>
                  <span class="v" id="pos-stat-scans">0</span>
                </div>
                <div class="cl-row">
                  <span class="k" style="color:var(--success)">نجح</span>
                  <span class="v" id="pos-stat-hits"
                        style="color:var(--success)">0</span>
                </div>
                <div class="cl-row">
                  <span class="k" style="color:var(--danger)">فشل</span>
                  <span class="v" id="pos-stat-misses"
                        style="color:var(--danger)">0</span>
                </div>
                <div class="cl-row">
                  <span class="k">فواتير مكتملة</span>
                  <span class="v" id="pos-stat-sales">0</span>
                </div>
                <div class="cl-row hi">
                  <span class="k">إجمالي المبيعات</span>
                  <span class="v" id="pos-stat-revenue">0.00 ج.م</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    window.lucide?.createIcons();
    refreshCart();
    refreshStats();
    bindControls();
  }

  /* ═════════════════════════════════════════════════════════════════════
     §10 · STATS REFRESH
     ───────────────────────────────────────────────────────────────────── */

  function refreshStats() {
    setText('#pos-stat-scans', GMS.intFmt(POSState.stats.scans));
    setText('#pos-stat-hits', GMS.intFmt(POSState.stats.hits));
    setText('#pos-stat-misses', GMS.intFmt(POSState.stats.misses));
    setText('#pos-stat-sales', GMS.intFmt(POSState.stats.salesCompleted));
    setText('#pos-stat-revenue', GMS.moneyFmt(POSState.stats.totalRevenue) + ' ج.م');
  }

  /* ═════════════════════════════════════════════════════════════════════
     §11 · CONTROLS BINDING
     ───────────────────────────────────────────────────────────────────── */

  function bindControls() {
    /* ─── Scan input ─────────────────────────────────────────── */
    const scanInput = document.getElementById('pos-scan-input');
    const scanHero = document.getElementById('pos-scan-hero');

    if (scanInput) {
      /* تركيز أولي */
      if (POSState.config.autoFocusScan) {
        setTimeout(() => scanInput.focus(), 200);
      }

      /* تركيز بصري */
      scanInput.onfocus = () => scanHero?.classList.add('focused');
      scanInput.onblur = () => scanHero?.classList.remove('focused');

      /* معالج Enter */
      scanInput.onkeydown = async (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const sku = scanInput.value.trim();
          if (!sku) return;

          await handleScan(sku, { wasScanner: true });
          scanInput.value = '';
          scanInput.focus();
        } else if (e.key === 'Escape') {
          scanInput.value = '';
          const resultHost = document.getElementById('pos-scan-result');
          if (resultHost) resultHost.innerHTML = '';
        }
      };
    }

    /* ─── Global scanner listener ───────────────────────────── */
    if (GMS.QRScanner) {
      GMS.QRScanner.bind(async (code, meta) => {
        /* تجاهل إذا كنا في صفحة أخرى */
        if (GMS.Router?.current() !== 'pos') return;

        /* تجاهل إذا كان التركيز على input آخر */
        const active = document.activeElement;
        if (active && active.id !== 'pos-scan-input' &&
            (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
          return;
        }

        await handleScan(code, meta);
      });
    }

    /* ─── Clear cart ────────────────────────────────────────── */
    const clearBtn = document.getElementById('pos-clear-btn');
    if (clearBtn) {
      clearBtn.onclick = async () => {
        if (!POSState.cart.length) return;

        const ok = await GMS.Confirm.ask(
          `سيتم حذف ${POSState.cart.length} صنف من السلة.`,
          {
            title: 'تفريغ السلة',
            okText: 'تفريغ',
            danger: true,
          }
        );

        if (!ok) return;

        Cart.clear();
        refreshCart();

        if (POSState.config.beepEnabled) {
          GMS.Beep?.delete();
        }
      };
    }

    /* ─── Checkout ──────────────────────────────────────────── */
    const checkoutBtn = document.getElementById('pos-checkout-btn');
    if (checkoutBtn) {
      checkoutBtn.onclick = () => openCheckoutModal();
    }

    /* ─── Manual Search ─────────────────────────────────────── */
    const searchInput = document.getElementById('pos-search-input');
    if (searchInput) {
      searchInput.oninput = GMS.debounce(async (e) => {
        const q = e.target.value.trim();
        const host = document.getElementById('pos-search-results');

        if (!host) return;

        if (q.length < 2) {
          host.innerHTML = '';
          return;
        }

        const results = await searchItems(q, 15);
        host.innerHTML = renderSearchResults(results);
        window.lucide?.createIcons();

        /* Bind click */
        host.querySelectorAll('[data-search-add]').forEach(el => {
          el.onclick = () => {
            const sku = el.dataset.searchAdd;
            const item = results.find(i => i.sku === sku);
            if (item) {
              const added = Cart.add(item);
              if (added.success) {
                refreshCart();
                GMS.Toast.ok('تمت الإضافة', sku);
                searchInput.value = '';
                host.innerHTML = '';
                if (POSState.config.beepEnabled) {
                  GMS.Beep?.success();
                }
              } else if (added.reason === 'DUPLICATE') {
                GMS.Toast.warn('موجود مسبقاً', sku);
              }
            }
          };
        });
      }, 250);
    }

    /* ─── Keyboard shortcuts ────────────────────────────────── */
    const keyHandler = (e) => {
      if (GMS.Router?.current() !== 'pos') return;

      /* F2 — تركيز الماسح */
      if (e.key === 'F2') {
        e.preventDefault();
        scanInput?.focus();
        scanInput?.select();
        return;
      }

      /* Ctrl+Enter — إتمام البيعة */
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        if (POSState.cart.length) {
          openCheckoutModal();
        }
        return;
      }

      /* Ctrl+Backspace — تفريغ السلة */
      if (e.ctrlKey && e.key === 'Backspace') {
        e.preventDefault();
        if (POSState.cart.length) {
          document.getElementById('pos-clear-btn')?.click();
        }
        return;
      }

      /* Escape — تفريغ حقل البحث */
      if (e.key === 'Escape') {
        const resultHost = document.getElementById('pos-scan-result');
        if (resultHost) resultHost.innerHTML = '';
      }
    };

    document.addEventListener('keydown', keyHandler);

    /* حفظ مرجع للتنظيف */
    POSState.unsubscribers.push(() => {
      document.removeEventListener('keydown', keyHandler);
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §12 · CHECKOUT MODAL
     ───────────────────────────────────────────────────────────────────── */

  function openCheckoutModal() {
    if (!POSState.cart.length) return;

    POSState.ui.checkoutOpen = true;

    const totals = computeCartTotals();
    const price24 = getPrice24();

    /* بناء HTML */
    const linesHTML = POSState.cart.map((item, i) => `
      <div class="l" style="display:flex;justify-content:space-between;
                  padding:8px 0;border-bottom:1px dashed var(--border);
                  font-size:12.5px">
        <span style="color:var(--muted);font-weight:700">
          ${i + 1}. <span class="mono">${GMS.esc(item.sku)}</span>
          · ${item.karat}K · ${GMS.gramFmt(item.net_weight)} جم
        </span>
        <span class="mono" style="font-weight:900">
          ${GMS.moneyFmt((Number(item.pure_weight) * price24 + Number(item.workmanship_value)) * item.qty)}
        </span>
      </div>
    `).join('');

    const modal = GMS.Modal.open({
      title: GMS.t('pos.checkout'),
      icon: 'credit-card',
      size: 'lg',
      body: `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          <!-- LEFT: Summary -->
          <div>
            <div style="font-size:11px;font-weight:800;color:var(--muted);
                        text-transform:uppercase;letter-spacing:.5px;margin-bottom:9px">
              ملخص القطع (${POSState.cart.length})
            </div>

            <div style="max-height:240px;overflow-y:auto;
                        background:var(--surface-2);border-radius:11px;
                        padding:12px 14px;
                        border:1px solid var(--border)">
              ${linesHTML}

              <div style="display:flex;justify-content:space-between;
                          padding-top:12px;margin-top:8px;
                          border-top:2px solid var(--border-strong);
                          font-size:14px">
                <span style="color:var(--muted);font-weight:800">الإجمالي</span>
                <span class="mono" style="color:var(--primary);
                            font-weight:900;font-size:16px">
                  ${GMS.moneyFmt(totals.total)} ج.م
                </span>
              </div>
            </div>

            <div style="margin-top:14px">
              <div style="display:flex;justify-content:space-between;
                          padding:6px 0;font-size:12.5px">
                <span style="color:var(--muted);font-weight:700">عدد القطع</span>
                <span class="mono" style="font-weight:800">${totals.count}</span>
              </div>
              <div style="display:flex;justify-content:space-between;
                          padding:6px 0;font-size:12.5px">
                <span style="color:var(--muted);font-weight:700">إجمالي الوزن الصافي</span>
                <span class="mono" style="font-weight:800">${GMS.gramFmt(totals.net)} جم</span>
              </div>
              <div style="display:flex;justify-content:space-between;
                          padding:6px 0;font-size:12.5px">
                <span style="color:var(--muted);font-weight:700">إجمالي البندق 24K</span>
                <span class="mono" style="color:var(--primary);font-weight:800">
                  ${GMS.gramFmt(totals.pure)} جم
                </span>
              </div>
              <div style="display:flex;justify-content:space-between;
                          padding:6px 0;font-size:12.5px">
                <span style="color:var(--muted);font-weight:700">قيمة الذهب</span>
                <span class="mono" style="font-weight:800">${GMS.moneyFmt(totals.gold)} ج.م</span>
              </div>
              <div style="display:flex;justify-content:space-between;
                          padding:6px 0;font-size:12.5px">
                <span style="color:var(--muted);font-weight:700">المصنعية</span>
                <span class="mono" style="font-weight:800">${GMS.moneyFmt(totals.making)} ج.م</span>
              </div>
            </div>
          </div>

          <!-- RIGHT: Payment -->
          <div>
            <div style="font-size:11px;font-weight:800;color:var(--muted);
                        text-transform:uppercase;letter-spacing:.5px;margin-bottom:9px">
              طريقة الدفع
            </div>

            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px"
                 id="pay-methods">
              ${Object.entries(GMS.PAYMENT_METHODS).slice(0, 3).map(([key, m]) => `
                <button type="button" class="pay-btn ${key === 'cash' ? 'active' : ''}"
                        data-pay="${key}"
                        style="display:flex;flex-direction:column;align-items:center;
                               gap:6px;padding:12px 8px;border-radius:11px;
                               border:1.5px solid ${key === 'cash' ? 'var(--primary)' : 'var(--border)'};
                               background:${key === 'cash' ? 'color-mix(in srgb,var(--primary) 12%,var(--surface))' : 'var(--surface-2)'};
                               cursor:pointer;font-weight:700;font-size:11.5px;
                               transition:all .2s">
                  <i data-lucide="${m.icon}" style="width:18px;height:18px;
                             color:${key === 'cash' ? 'var(--primary)' : 'var(--text-2)'}"></i>
                  <span style="color:${key === 'cash' ? 'var(--primary)' : 'var(--text-2)'}">
                    ${m.label}
                  </span>
                </button>
              `).join('')}
            </div>

            <div style="margin-top:14px">
              <div class="field" style="margin-bottom:11px">
                <label>المبلغ المستلم (ج.م)</label>
                <input type="number" id="pay-amount" step="0.01" min="0"
                       value="${totals.total.toFixed(2)}"
                       class="mono"
                       style="font-size:17px;font-weight:800;text-align:center">
              </div>

              <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                <div class="field">
                  <label>الباقي للعميل</label>
                  <input type="text" id="pay-change" readonly
                         class="mono"
                         style="font-weight:800;text-align:center;
                                background:var(--surface-3)">
                </div>
                <div class="field">
                  <label>الحالة</label>
                  <input type="text"
                         value="${GMS.Sync?.state?.online !== false ? 'APPROVED' : 'PENDING'}"
                         readonly
                         style="font-weight:700;font-size:11px;text-align:center;
                                background:var(--surface-3)">
                </div>
              </div>

              <div class="field" style="margin-top:11px">
                <label>العميل (اختياري)</label>
                <select id="pay-customer">
                  <option value="">عميل نقدي</option>
                  ${(GMS.Demo?.getCustomers() || []).map(c => `
                    <option value="${c.id}">${GMS.esc(c.name)} — ${GMS.esc(c.phone || '')}</option>
                  `).join('')}
                </select>
              </div>

              <div class="field" style="margin-top:11px">
                <label>ملاحظات</label>
                <input id="pay-notes" placeholder="ملاحظات على الفاتورة…">
              </div>
            </div>
          </div>
        </div>
      `,
      footer: `
        <button class="btn" data-close>${GMS.t('action.cancel')}</button>
        <button class="btn btn-primary btn-lg" id="confirm-checkout">
          <i data-lucide="check-circle-2"></i>
          تأكيد البيع
        </button>
      `,
      onMount: (el, close) => {
        /* Payment method switching */
        el.querySelectorAll('[data-pay]').forEach(btn => {
          btn.onclick = () => {
            el.querySelectorAll('[data-pay]').forEach(b => {
              const active = b === btn;
              b.style.borderColor = active ? 'var(--primary)' : 'var(--border)';
              b.style.background = active
                ? 'color-mix(in srgb,var(--primary) 12%,var(--surface))'
                : 'var(--surface-2)';
              b.classList.toggle('active', active);
              const icon = b.querySelector('svg');
              const span = b.querySelector('span');
              if (icon) icon.style.color = active ? 'var(--primary)' : 'var(--text-2)';
              if (span) span.style.color = active ? 'var(--primary)' : 'var(--text-2)';
            });
          };
        });

        /* Amount input */
        const amountInput = el.querySelector('#pay-amount');
        const changeInput = el.querySelector('#pay-change');

        const updateChange = () => {
          const paid = parseFloat(amountInput.value) || 0;
          const change = Math.max(0, paid - totals.total);
          changeInput.value = GMS.moneyFmt(change) + ' ج.م';

          /* لون حسب الحالة */
          if (paid < totals.total) {
            changeInput.style.color = 'var(--danger)';
          } else if (paid > totals.total) {
            changeInput.style.color = 'var(--success)';
          } else {
            changeInput.style.color = 'var(--text)';
          }
        };

        amountInput.oninput = updateChange;
        updateChange();

        /* Confirm */
        el.querySelector('#confirm-checkout').onclick = async () => {
          const paid = parseFloat(amountInput.value) || 0;
          const method = el.querySelector('[data-pay].active')?.dataset.pay || 'cash';
          const customerId = el.querySelector('#pay-customer').value;
          const notes = el.querySelector('#pay-notes').value.trim();

          if (paid < totals.total) {
            GMS.Toast.err('المبلغ المستلم أقل من الإجمالي');
            amountInput.focus();
            return;
          }

          close();
          await completeSale({
            paid,
            method,
            customerId,
            notes,
          });
        };
      },
      onClose: () => {
        POSState.ui.checkoutOpen = false;
      },
    });

    return modal;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §13 · COMPLETE SALE
     ─────────────────────────────────────────────────────────────────────
     حفظ الفاتورة (فوراً عبر Supabase أو في Queue)
     ═════════════════════════════════════════════════════════════════════ */

  async function completeSale(paymentData) {
    const totals = computeCartTotals();
    const online = GMS.Sync?.state?.online !== false;
    const now = new Date().toISOString();

    /* بناء رقم فاتورة */
    const saleNo = GMS.invoiceNo('INV');

    /* بناء بنود الفاتورة */
    const lines = POSState.cart.map(item => {
      const price24 = getPrice24();
      const goldValue = GMS.round(Number(item.pure_weight || 0) * price24, 2);
      const makeValue = Number(item.workmanship_value || 0);
      const stoneValue = Number(item.stone_value || 0);
      const lineTotal = GMS.round((goldValue + makeValue + stoneValue) * item.qty, 2);

      return {
        inventory_id: item.id,
        sku: item.sku,
        karat: item.karat,
        weight_grams: item.weight_grams,
        net_weight: item.net_weight,
        pure_weight: item.pure_weight,
        workmanship_per_gram: item.workmanship_per_gram,
        workmanship_value: makeValue,
        gold_value: goldValue,
        line_total: lineTotal,
      };
    });

    /* بناء الفاتورة */
    const sale = {
      id: GMS.uid(),
      sale_no: saleNo,
      invoice_no: saleNo,
      type: 'sale',
      item_count: totals.count,
      total_gross_weight: totals.gross,
      total_net_weight: totals.net,
      total_pure_weight: totals.pure,
      gold_value: totals.gold,
      total_workmanship: totals.making,
      grand_total: totals.total,
      paid: GMS.round(paymentData.paid, 2),
      remaining: GMS.round(Math.max(0, totals.total - paymentData.paid), 2),
      change_due: GMS.round(Math.max(0, paymentData.paid - totals.total), 2),
      payment_method: paymentData.method,
      customer_id: paymentData.customerId || null,
      customer_name: paymentData.customerId
        ? (GMS.Demo?.getCustomers().find(c => c.id === paymentData.customerId)?.name || 'عميل')
        : 'عميل نقدي',
      cashier_name: GMS.Auth?.profile?.full_name || 'كاشير',
      cashier_id: GMS.Auth?.user?.id || null,
      branch_id: GMS.Auth?.profile?.branch_id || GMS.APP_CONFIG.DEFAULT_BRANCH_ID,
      status: online ? 'APPROVED' : 'PENDING_APPROVAL',
      notes: paymentData.notes || null,
      created_at: now,
      lines,
    };

    try {
      GMS.Loading.show('جارٍ حفظ الفاتورة…');

      /* ─── حفظ في Supabase أو Queue ──────────────────────────── */
      if (online && GMS.Supabase?.isReady()) {
        /* حفظ فوري */
        const client = GMS.Supabase.get();

        const { data: saleRow, error: saleError } = await client
          .from(GMS.SUPABASE_CONFIG.TABLES.SALES)
          .insert({
            sale_no: sale.sale_no,
            type: sale.type,
            item_count: sale.item_count,
            total_gross_weight: sale.total_gross_weight,
            total_net_weight: sale.total_net_weight,
            total_pure_weight: sale.total_pure_weight,
            gold_value: sale.gold_value,
            total_workmanship: sale.total_workmanship,
            grand_total: sale.grand_total,
            paid: sale.paid,
            remaining: sale.remaining,
            payment_method: sale.payment_method,
            customer_id: sale.customer_id,
            cashier_id: sale.cashier_id,
            branch_id: sale.branch_id,
            status: sale.status,
            notes: sale.notes,
          })
          .select('id')
          .single();

        if (saleError) throw saleError;

        /* إدراج البنود */
        const linePayload = lines.map(l => ({
          sale_id: saleRow.id,
          ...l,
        }));

        const { error: linesError } = await client
          .from(GMS.SUPABASE_CONFIG.TABLES.SALE_ITEMS)
          .insert(linePayload);

        if (linesError) throw linesError;

        /* تحديث المخزون */
        const inventoryIds = lines.map(l => l.inventory_id).filter(Boolean);

        if (inventoryIds.length) {
          await client
            .from(GMS.SUPABASE_CONFIG.TABLES.INVENTORY)
            .update({
              status: 'SOLD',
              updated_at: now,
            })
            .in('id', inventoryIds);
        }

      } else {
        /* حفظ في Queue */
        await GMS.IDB.queueAdd({
          id: sale.id,
          sale_no: sale.sale_no,
          item_count: sale.item_count,
          total_pure_weight: sale.total_pure_weight,
          grand_total: sale.grand_total,
          payment_method: sale.payment_method,
          status: 'PENDING_APPROVAL',
          created_at: now,
          lines,
          branch_id: sale.branch_id,
        });
      }

      /* ─── تحديث المخزون محلياً (IndexedDB) ─────────────────── */
      for (const line of lines) {
        if (!line.inventory_id) continue;

        try {
          const item = await GMS.IDB.get(line.inventory_id);
          if (item) {
            item.status = 'SOLD';
            item.updated_at = now;
            await GMS.IDB.put(item);
          }
        } catch (e) {
          console.warn('[POS] IDB update failed:', e);
        }
      }

      /* ─── تحديث الإحصائيات ─────────────────────────────────── */
      POSState.stats.salesCompleted++;
      POSState.stats.totalRevenue += totals.total;
      POSState.stats.totalPureWeight += totals.pure;

      /* ─── Audit log ─────────────────────────────────────────── */
      if (GMS.Audit) {
        await GMS.Audit.log(
          'CREATE',
          'sale',
          sale.id,
          `فاتورة بيع ${sale.sale_no} — ${GMS.moneyFmt(sale.grand_total)} ج.م`,
          {
            invoice_no: sale.sale_no,
            total: sale.grand_total,
            items: sale.item_count,
            online,
          }
        );
      }

      /* ─── تفريغ السلة ───────────────────────────────────────── */
      Cart.clear();
      refreshCart();
      refreshStats();

      GMS.Loading.hide();

      /* ─── صوت النجاح ────────────────────────────────────────── */
      if (POSState.config.beepEnabled) {
        GMS.Beep?.complete();
      }

      /* ─── إشعار ────────────────────────────────────────────── */
      if (online) {
        GMS.Toast.ok(
          'تمت الفاتورة',
          `${sale.sale_no} · ${GMS.moneyFmt(sale.grand_total)} ج.م`
        );
      } else {
        GMS.Toast.warn(
          'تم الحفظ محلياً',
          `${sale.sale_no} في الطابور — سيُرفع عند عودة الاتصال`
        );
      }

      /* ─── إطلاق حدث Realtime (محلي) ────────────────────────── */
      if (GMS.Realtime) {
        GMS.Realtime.emit('sales', 'INSERT', sale);
      }

      /* ─── عرض Modal النجاح ─────────────────────────────────── */
      showSaleSuccess(sale, online);

    } catch (e) {
      GMS.Loading.hide();
      console.error('[POS.completeSale]', e);
      GMS.Toast.err('فشل حفظ الفاتورة', e.message);
      if (POSState.config.beepEnabled) {
        GMS.Beep?.error();
      }
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §14 · SUCCESS MODAL + RECEIPT
     ═════════════════════════════════════════════════════════════════════ */

  function showSaleSuccess(sale, online) {
    GMS.Modal.open({
      title: online ? 'تم إنشاء الفاتورة' : 'تم الحفظ محلياً',
      icon: online ? 'check-circle-2' : 'cloud-off',
      size: 'lg',
      dismissible: false,
      body: `
        <div style="text-align:center;padding:10px 0 20px">
          <div style="width:72px;height:72px;border-radius:22px;
                      background:${online ? 'var(--gold-grad)' : 'var(--info-bg)'};
                      display:grid;place-items:center;margin:0 auto 14px;
                      color:${online ? '#2a1f05' : 'var(--info)'};
                      box-shadow:0 14px 36px -12px rgba(184,145,47,.9)">
            <i data-lucide="${online ? 'check' : 'cloud-off'}"
               style="width:36px;height:36px"></i>
          </div>

          <h3 style="font-size:18px;margin-bottom:6px">
            ${online ? 'تم إنشاء الفاتورة بنجاح' : 'تم الحفظ محلياً'}
          </h3>

          <div class="mono" style="font-size:22px;font-weight:900;
                      color:var(--primary);letter-spacing:.5px;margin-top:6px">
            ${GMS.esc(sale.sale_no)}
          </div>

          <div style="font-size:12px;color:var(--muted);margin-top:8px;font-weight:700">
            الحالة:
            <span class="pill ${online ? 'pill-green' : 'pill-amber'}"
                  style="margin-inline-start:4px">
              ${online ? 'معتمد · APPROVED' : 'قيد المزامنة · QUEUED'}
            </span>
          </div>
        </div>

        <div style="background:var(--surface-2);border-radius:12px;
                    padding:16px;border:1px solid var(--border)">
          <div style="display:flex;justify-content:space-between;
                      padding:6px 0;font-size:12.5px;
                      border-bottom:1px dashed var(--border)">
            <span style="color:var(--muted);font-weight:700">عدد القطع</span>
            <span class="mono" style="font-weight:900">${sale.item_count}</span>
          </div>
          <div style="display:flex;justify-content:space-between;
                      padding:6px 0;font-size:12.5px;
                      border-bottom:1px dashed var(--border)">
            <span style="color:var(--muted);font-weight:700">إجمالي الوزن الصافي</span>
            <span class="mono" style="font-weight:900">
              ${GMS.gramFmt(sale.total_net_weight)} جم
            </span>
          </div>
          <div style="display:flex;justify-content:space-between;
                      padding:6px 0;font-size:12.5px;
                      border-bottom:1px dashed var(--border)">
            <span style="color:var(--muted);font-weight:700">إجمالي البندق 24K</span>
            <span class="mono" style="color:var(--primary);font-weight:900">
              ${GMS.gramFmt(sale.total_pure_weight)} جم
            </span>
          </div>
          <div style="display:flex;justify-content:space-between;
                      padding:6px 0;font-size:12.5px;
                      border-bottom:1px dashed var(--border)">
            <span style="color:var(--muted);font-weight:700">قيمة الذهب</span>
            <span class="mono" style="font-weight:900">
              ${GMS.moneyFmt(sale.gold_value)} ج.م
            </span>
          </div>
          <div style="display:flex;justify-content:space-between;
                      padding:6px 0;font-size:12.5px;
                      border-bottom:1px dashed var(--border)">
            <span style="color:var(--muted);font-weight:700">المصنعية</span>
            <span class="mono" style="font-weight:900">
              ${GMS.moneyFmt(sale.total_workmanship)} ج.م
            </span>
          </div>
          <div style="display:flex;justify-content:space-between;
                      padding:12px 0 4px;font-size:15px;
                      border-top:2px solid var(--border-strong);margin-top:6px">
            <span style="color:var(--text);font-weight:900">الإجمالي</span>
            <span class="mono" style="color:var(--primary);
                        font-weight:900;font-size:18px">
              ${GMS.moneyFmt(sale.grand_total)} ج.م
            </span>
          </div>
          ${sale.change_due > 0 ? `
            <div style="display:flex;justify-content:space-between;
                        padding:6px 0;font-size:13px;
                        border-top:1px dashed var(--border);margin-top:6px">
              <span style="color:var(--muted);font-weight:700">الباقي للعميل</span>
              <span class="mono" style="color:var(--success);font-weight:900">
                ${GMS.moneyFmt(sale.change_due)} ج.م
              </span>
            </div>
          ` : ''}
        </div>
      `,
      footer: `
        <button class="btn" id="print-receipt">
          <i data-lucide="printer"></i> طباعة الإيصال
        </button>
        <button class="btn btn-primary" id="next-sale">
          <i data-lucide="plus-circle"></i> فاتورة جديدة
        </button>
      `,
      onMount: (el, close) => {
        el.querySelector('#print-receipt').onclick = () => {
          printReceipt(sale);
        };

        el.querySelector('#next-sale').onclick = () => {
          close();
          setTimeout(() => {
            document.getElementById('pos-scan-input')?.focus();
          }, 300);
        };
      },
    });
  }

  /**
   * طباعة إيصال الفاتورة
   * @param {Object} sale
   */
  function printReceipt(sale) {
    const root = document.getElementById('print-root');
    if (!root) {
      GMS.Toast.err('لا يمكن الطباعة', 'عنصر الطباعة غير موجود');
      return;
    }

    const price24 = getPrice24();

    root.innerHTML = `
      <div class="receipt-print">
        <h2>${GMS.t('receipt.title')}</h2>

        <div style="text-align:center;font-size:10pt;margin-bottom:5mm">
          ${GMS.esc(GMS.APP_CONFIG.NAME_AR)}<br>
          ${GMS.esc(GMS.Auth?.profile?.full_name || '—')}<br>
          ${GMS.esc(GMS.Demo?.getBranches()?.find(b => b.id === sale.branch_id)?.name || '—')}
        </div>

        <hr>

        <div class="rp-line">
          <span>${GMS.t('receipt.no')}</span>
          <b>${GMS.esc(sale.sale_no)}</b>
        </div>
        <div class="rp-line">
          <span>${GMS.t('receipt.date')}</span>
          <b>${GMS.dateTimeAr(sale.created_at)}</b>
        </div>
        <div class="rp-line">
          <span>${GMS.t('receipt.customer')}</span>
          <b>${GMS.esc(sale.customer_name || 'عميل نقدي')}</b>
        </div>

        <hr>

        ${(sale.lines || []).map((line, i) => `
          <div style="margin:2mm 0">
            <div style="font-weight:900;font-size:10.5pt">
              ${i + 1}. ${GMS.esc(line.sku || '—')} — ${line.karat}K
            </div>
            <div class="rp-line" style="font-size:9.5pt">
              <span>صافي ${GMS.gramFmt(line.net_weight)} جم</span>
              <span>بندق ${GMS.gramFmt(line.pure_weight)} جم</span>
            </div>
            <div class="rp-line" style="font-size:9.5pt">
              <span>ذهب ${GMS.moneyFmt(line.gold_value)}</span>
              <span>مصنعية ${GMS.moneyFmt(line.workmanship_value)}</span>
              <span style="font-weight:900">${GMS.moneyFmt(line.line_total)}</span>
            </div>
          </div>
        `).join('')}

        <hr>

        <div class="rp-line">
          <span>عدد القطع</span>
          <b>${GMS.intFmt(sale.item_count)}</b>
        </div>
        <div class="rp-line">
          <span>إجمالي الوزن الصافي</span>
          <b>${GMS.gramFmt(sale.total_net_weight)} جم</b>
        </div>
        <div class="rp-line">
          <span>إجمالي البندق 24K</span>
          <b>${GMS.gramFmt(sale.total_pure_weight)} جم</b>
        </div>
        <div class="rp-line">
          <span>سعر 24K الحالي</span>
          <b>${GMS.moneyFmt(price24)} ج.م</b>
        </div>

        <hr>

        <div class="rp-line">
          <span>قيمة الذهب</span>
          <b>${GMS.moneyFmt(sale.gold_value)} ج.م</b>
        </div>
        <div class="rp-line">
          <span>المصنعية</span>
          <b>${GMS.moneyFmt(sale.total_workmanship)} ج.م</b>
        </div>

        <div class="rp-total">
          <span>الإجمالي</span>
          <span>${GMS.moneyFmt(sale.grand_total)} ج.م</span>
        </div>

        <div class="rp-line" style="margin-top:2mm">
          <span>طريقة الدفع</span>
          <b>${GMS.getPaymentMethod(sale.payment_method)?.label || sale.payment_method}</b>
        </div>
        <div class="rp-line">
          <span>المدفوع</span>
          <b>${GMS.moneyFmt(sale.paid)} ج.م</b>
        </div>
        ${sale.change_due > 0 ? `
          <div class="rp-line">
            <span>الباقي</span>
            <b>${GMS.moneyFmt(sale.change_due)} ج.م</b>
          </div>
        ` : ''}

        <hr>

        <div style="text-align:center;font-size:9pt;margin-top:5mm">
          ${GMS.t('receipt.thanks')}<br>
          ${GMS.t('receipt.warrantyNote')}
        </div>

        <div class="pr-sign" style="margin-top:8mm;display:flex;justify-content:space-between;font-size:9pt">
          <div style="border-top:1px solid #000;padding-top:2mm;min-width:30mm;text-align:center">
            ${GMS.t('receipt.customerSignature')}
          </div>
          <div style="border-top:1px solid #000;padding-top:2mm;min-width:30mm;text-align:center">
            ${GMS.t('receipt.cashierSignature')}
          </div>
        </div>
      </div>
    `;

    setTimeout(() => window.print(), 150);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §15 · CLEANUP
     ───────────────────────────────────────────────────────────────────── */

  function cleanup() {
    /* تنظيف المؤقتات */
    clearTimeout(POSState.timers.scanClear);
    clearTimeout(POSState.timers.searchDebounce);

    /* إلغاء المستمعين */
    POSState.unsubscribers.forEach(fn => {
      try { fn(); } catch (_) {}
    });
    POSState.unsubscribers = [];

    /* إلغاء تفعيل الـ scanner */
    if (GMS.QRScanner) {
      GMS.QRScanner.unbind();
    }

    /* إغلاق modal مفتوح */
    if (POSState.ui.checkoutOpen) {
      GMS.Modal.closeAll();
      POSState.ui.checkoutOpen = false;
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §16 · VIEW REGISTRATION
     ═════════════════════════════════════════════════════════════════════ */
  GMS.Views = GMS.Views || {};

  GMS.Views.pos = {
    render,
    cleanup,
    state: POSState,

    /* Cart API */
    cart: Cart,

    /* Helpers */
    handleScan,
    findBySku,
    searchItems,
    computeTotals: computeCartTotals,

    /* Actions */
    checkout: openCheckoutModal,
    printReceipt,
  };

  /* ═════════════════════════════════════════════════════════════════════
     §17 · LOADED CONFIRMATION
     ═════════════════════════════════════════════════════════════════════ */
  console.log(
    '%c🛒 POS View loaded · Scanner + Cart + Checkout',
    'color:#0f7a43;font-weight:800;font-size:12px;padding:1px 5px;' +
    'background:#e6f6ee;border-radius:4px;'
  );

  console.log(
    `%c⚡ IndexedDB instant search · Offline-first · Hardware scanner · Thermal receipt`,
    'color:#6b7a95;font-weight:700;font-size:11px;'
  );

  /* ═════════════════════════════════════════════════════════════════════
     ✅ js/13-views-pos.js — نهاية الملف
     ═════════════════════════════════════════════════════════════════════ */

})();