/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ENTERPRISE — js/13-views-pos.js
   نقطة البيع (Point of Sale) — v2.0
   ─────────────────────────────────────────────────────────────────────
   ✅ v2.0 التحديثات:
     • عرض "مصنعية الجرام" بخط صغير بجانب إجمالي المصنعية
     • إضافة حقل "خصم (ج.م)" على المصنعية
     • الخصم يُطرح من المصنعية ومن الإجمالي النهائي
     • يُسجَّل الخصم في الفاتورة للمحاسبة والتقارير
     • يعمل في الملخص اللحظي + Modal الدفع
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

    /* ✅ v2.0: الخصم (بالجنيه) على المصنعية */
    discount: 0,

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
      _initialFocusDone: false,
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

  function cssVar(name) {
    return getComputedStyle(document.documentElement)
      .getPropertyValue(name).trim();
  }

  function setText(selector, value) {
    const el = document.querySelector(selector);
    if (el && el.textContent !== String(value)) {
      el.textContent = String(value);
    }
  }

  /**
   * ✅ v2.0: حساب إجماليات السلة مع الخصم
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

    /* ✅ v2.0: متوسط مصنعية الجرام */
    const avgMakingPerGram = net > 0 ? GMS.round(making / net, 2) : 0;

    /* ✅ v2.0: الخصم محدود بالمصنعية */
    const rawDiscount = Number(POSState.discount) || 0;
    const discount = Math.max(0, Math.min(rawDiscount, making));

    /* ✅ v2.0: الإجمالي بعد الخصم */
    total = gold + making + stone - discount;

    return {
      count,
      gross: GMS.round(gross, 3),
      net: GMS.round(net, 3),
      pure: GMS.round(pure, 4),
      gold: GMS.round(gold, 2),
      making: GMS.round(making, 2),
      makingAfterDiscount: GMS.round(making - discount, 2),
      avgMakingPerGram,
      stone: GMS.round(stone, 2),
      discount: GMS.round(discount, 2),
      total: GMS.round(total, 2),
    };
  }

  /**
   * سعر 24K الحالي — ✅ v2.0: يستخدم PriceManager أولاً
   */
  function getPrice24() {
    try {
      if (GMS.PriceManager?.current) {
        const p = GMS.PriceManager.current();
        if (p > 0) return p;
      }
      if (GMS.Cache) {
        const price = GMS.Cache.getPrice();
        if (price && price.price_24) return Number(price.price_24);
      }
    } catch (_) {}
    return GMS.APP_CONFIG.DEFAULT_PRICE_24;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §3 · SEARCH ENGINE
     ═════════════════════════════════════════════════════════════════════ */

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
        const item = items.find(i => i.sku.toUpperCase() === key);
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

  async function searchItems(query, limit = 20) {
    if (!query || query.trim().length < 2) return [];

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
    add(item, qty = 1) {
      if (!item || !item.sku) {
        return { success: false, reason: 'INVALID_ITEM' };
      }

      if (POSState.cart.length >= POSState.config.maxCartItems) {
        return { success: false, reason: 'CART_FULL' };
      }

      const existing = POSState.cart.find(i => i.sku === item.sku);

      if (existing) {
        existing.qty += qty;
        return {
          success: false,
          reason: 'DUPLICATE',
          existing,
        };
      }

      if (item.status && item.status !== 'IN_STOCK') {
        return {
          success: false,
          reason: 'NOT_IN_STOCK',
          status: item.status,
        };
      }

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

    remove(sku) {
      const idx = POSState.cart.findIndex(i => i.sku === sku);
      if (idx < 0) return false;
      POSState.cart.splice(idx, 1);
      return true;
    },

    increment(sku) {
      const item = POSState.cart.find(i => i.sku === sku);
      if (!item) return false;
      item.qty++;
      return true;
    },

    decrement(sku) {
      const item = POSState.cart.find(i => i.sku === sku);
      if (!item) return false;

      if (item.qty <= 1) {
        return this.remove(sku);
      }

      item.qty--;
      return true;
    },

    clear() {
      POSState.cart = [];
      POSState.discount = 0;  /* ✅ v2.0: تصفير الخصم مع السلة */
    },

    has(sku) {
      return POSState.cart.some(i => i.sku === sku);
    },

    getAll() {
      return POSState.cart.slice();
    },

    count() {
      return POSState.cart.length;
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §5 · HTML RENDERERS
     ═════════════════════════════════════════════════════════════════════ */

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
   * ✅ v2.0: سطر السلة — مع مصنعية الجرام بخط صغير
   */
  function renderCartRow(item, idx) {
    const price24 = getPrice24();
    const itemGoldValue = Number(item.pure_weight || 0) * price24;
    const makingPerGram = Number(item.workmanship_per_gram || 0);
    const lineTotal = (
      itemGoldValue +
      Number(item.workmanship_value || 0) +
      Number(item.stone_value || 0)
    ) * item.qty;

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

          <!-- ✅ v2.0: مصنعية الجرام بخط صغير -->
          <div style="font-size:10px;color:var(--muted);
                      font-weight:700;margin-top:3px">
            <i data-lucide="hammer"
               style="width:9px;height:9px;
                      display:inline;vertical-align:-1px"></i>
            مصنعية ${GMS.moneyFmt(makingPerGram)} ج.م/جم
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

  function renderEmptyCart() {
    return `
      <div class="empty" style="padding:60px 20px">
        <i data-lucide="shopping-bag"></i>
        <p>${GMS.t('pos.cartEmpty')}</p>
        <span>${GMS.t('pos.cartEmptyHint')}</span>
      </div>
    `;
  }

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
     ═════════════════════════════════════════════════════════════════════ */

  async function handleScan(rawSku, meta = {}) {
    if (POSState.ui.processingScan) return;

    const sku = String(rawSku || '').trim().toUpperCase();
    if (!sku) return;

    POSState.ui.processingScan = true;
    POSState.stats.scans++;

    try {
      if (POSState.config.beepEnabled) {
        GMS.Beep?.info();
      }

      const result = await findBySku(sku);

      POSState.lastScan = {
        sku,
        item: result.item,
        source: result.source,
        latency: result.latency,
        at: new Date().toISOString(),
        wasScanner: meta.wasScanner || false,
      };

      const resultHost = document.getElementById('pos-scan-result');
      if (resultHost) {
        resultHost.innerHTML = renderScanResult(POSState.lastScan);
        window.lucide?.createIcons();
      }

      if (!result.item) {
        POSState.stats.misses++;
        if (POSState.config.beepEnabled) GMS.Beep?.error();
        return;
      }

      POSState.stats.hits++;

      if (result.item.status && result.item.status !== 'IN_STOCK') {
        if (POSState.config.beepEnabled) GMS.Beep?.error();
        GMS.Toast.warn(
          GMS.t('pos.itemOutOfStock'),
          `${sku} · الحالة: ${GMS.getStatus(result.item.status)?.label || result.item.status}`
        );
        return;
      }

      if (Cart.has(sku)) {
        if (POSState.config.beepEnabled) GMS.Beep?.warning();
        GMS.Toast.warn(
          GMS.t('pos.itemAlreadyAdded'),
          sku
        );
        return;
      }

      if (POSState.config.autoAddScanned) {
        const added = Cart.add(result.item);

        if (added.success) {
          if (POSState.config.beepEnabled) GMS.Beep?.success();
          refreshCart();

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

      clearTimeout(POSState.timers.scanClear);
      POSState.timers.scanClear = setTimeout(() => {
        const resultHost = document.getElementById('pos-scan-result');
        if (resultHost) resultHost.innerHTML = '';
      }, 4000);
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §7 · CART UI REFRESH
     ═════════════════════════════════════════════════════════════════════ */

  function refreshCart() {
    const cartHost = document.getElementById('pos-cart-list');
    if (!cartHost) return;

    if (POSState.cart.length === 0) {
      cartHost.innerHTML = renderEmptyCart();
    } else {
      cartHost.innerHTML = POSState.cart.map(renderCartRow).join('');
    }

    window.lucide?.createIcons();
    bindCartControls(cartHost);
    refreshTotals();
  }

  function bindCartControls(host) {
    host.querySelectorAll('[data-cart-del]').forEach(btn => {
      btn.onclick = () => {
        const idx = Number(btn.dataset.cartDel);
        const item = POSState.cart[idx];
        if (!item) return;

        Cart.remove(item.sku);
        refreshCart();

        if (POSState.config.beepEnabled) GMS.Beep?.delete();
      };
    });

    host.querySelectorAll('[data-cart-inc]').forEach(btn => {
      btn.onclick = () => {
        const idx = Number(btn.dataset.cartInc);
        const item = POSState.cart[idx];
        if (!item) return;

        Cart.increment(item.sku);
        refreshCart();
      };
    });

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
     ─────────────────────────────────────────────────────────────────────
     ✅ v2.0: إضافة عرض مصنعية الجرام + الخصم
     ═════════════════════════════════════════════════════════════════════ */

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

    /* ✅ v2.0: مصنعية الجرام بخط صغير */
    const makingAvgEl = document.getElementById('pos-total-making-avg');
    if (makingAvgEl) {
      makingAvgEl.textContent = t.avgMakingPerGram > 0
        ? `(${GMS.moneyFmt(t.avgMakingPerGram)} ج.م/جم)`
        : '';
    }

    /* ✅ v2.0: عرض سطر الخصم */
    const discountRow = document.getElementById('pos-discount-row');
    const discountAmountEl = document.getElementById('pos-total-discount');
    if (discountRow) {
      if (t.discount > 0) {
        discountRow.style.display = '';
        if (discountAmountEl) {
          discountAmountEl.textContent = `− ${GMS.moneyFmt(t.discount)} ج.م`;
        }
      } else {
        discountRow.style.display = 'none';
      }
    }

    /* ✅ v2.0: إظهار المصنعية بعد الخصم */
    const makingAfterDiscountRow = document.getElementById('pos-making-after-discount-row');
    const makingAfterDiscountEl = document.getElementById('pos-making-after-discount');
    if (makingAfterDiscountRow) {
      if (t.discount > 0) {
        makingAfterDiscountRow.style.display = '';
        if (makingAfterDiscountEl) {
          makingAfterDiscountEl.textContent = `${GMS.moneyFmt(t.makingAfterDiscount)} ج.م`;
        }
      } else {
        makingAfterDiscountRow.style.display = 'none';
      }
    }

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
     ═════════════════════════════════════════════════════════════════════ */

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

                <!-- ✅ v2.0: المصنعية + مصنعية الجرام بخط صغير -->
                <div class="cl-row">
                  <span class="k" style="display:flex;align-items:baseline;gap:6px;flex-wrap:wrap">
                    <span>
                      <i data-lucide="hammer"
                         style="width:12px;height:12px;
                                display:inline;vertical-align:-2px"></i>
                      المصنعية
                    </span>
                    <span id="pos-total-making-avg"
                          style="font-size:10px;color:var(--muted);
                                 font-weight:700;font-family:var(--font-mono);
                                 letter-spacing:0"></span>
                  </span>
                  <span class="v" id="pos-total-making">0.00</span>
                </div>

                <!-- ✅ v2.0: الخصم -->
                <div class="cl-row" id="pos-discount-row" style="display:none">
                  <span class="k" style="color:var(--danger)">
                    <i data-lucide="minus-circle"></i>
                    الخصم (على المصنعية)
                  </span>
                  <span class="v" id="pos-total-discount"
                        style="color:var(--danger)">0.00 ج.م</span>
                </div>

                <!-- ✅ v2.0: المصنعية بعد الخصم -->
                <div class="cl-row" id="pos-making-after-discount-row"
                     style="display:none">
                  <span class="k" style="color:var(--success)">
                    <i data-lucide="check-circle-2"></i>
                    المصنعية بعد الخصم
                  </span>
                  <span class="v" id="pos-making-after-discount"
                        style="color:var(--success)">0.00 ج.م</span>
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
     ═════════════════════════════════════════════════════════════════════ */

  function refreshStats() {
    setText('#pos-stat-scans', GMS.intFmt(POSState.stats.scans));
    setText('#pos-stat-hits', GMS.intFmt(POSState.stats.hits));
    setText('#pos-stat-misses', GMS.intFmt(POSState.stats.misses));
    setText('#pos-stat-sales', GMS.intFmt(POSState.stats.salesCompleted));
    setText('#pos-stat-revenue', GMS.moneyFmt(POSState.stats.totalRevenue) + ' ج.م');
  }

  /* ═════════════════════════════════════════════════════════════════════
     §11 · CONTROLS BINDING
     ═════════════════════════════════════════════════════════════════════ */

  function bindControls() {
    const scanInput = document.getElementById('pos-scan-input');
    const scanHero = document.getElementById('pos-scan-hero');

    if (scanInput) {
      if (POSState.config.autoFocusScan && !POSState.ui._initialFocusDone) {
        setTimeout(() => {
          const active = document.activeElement;
          if (!active || active === document.body) {
            try {
              scanInput.focus({ preventScroll: true });
            } catch (_) {
              scanInput.focus();
            }
          }
          POSState.ui._initialFocusDone = true;
        }, 250);
      }

      scanInput.onfocus = () => scanHero?.classList.add('focused');
      scanInput.onblur = () => scanHero?.classList.remove('focused');

      scanInput.onkeydown = async (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const sku = scanInput.value.trim();
          if (!sku) return;

          await handleScan(sku, { wasScanner: true });
          scanInput.value = '';

          const active = document.activeElement;
          if (!active || active === scanInput || active === document.body) {
            try {
              scanInput.focus({ preventScroll: true });
            } catch (_) {
              scanInput.focus();
            }
          }
        } else if (e.key === 'Escape') {
          scanInput.value = '';
          const resultHost = document.getElementById('pos-scan-result');
          if (resultHost) resultHost.innerHTML = '';
        }
      };
    }

    /* Global Scanner — ألغيه في POS */
    if (GMS.QRScanner) {
      try { GMS.QRScanner.unbind(); } catch (_) {}
    }

    /* Clear cart */
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

        if (POSState.config.beepEnabled) GMS.Beep?.delete?.();

        setTimeout(() => {
          const si = document.getElementById('pos-scan-input');
          const active = document.activeElement;
          if (si && (!active || active === document.body)) {
            try {
              si.focus({ preventScroll: true });
            } catch (_) {
              si.focus();
            }
          }
        }, 100);
      };
    }

    /* Checkout */
    const checkoutBtn = document.getElementById('pos-checkout-btn');
    if (checkoutBtn) {
      checkoutBtn.onclick = () => openCheckoutModal();
    }

    /* Manual Search */
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
                if (POSState.config.beepEnabled) GMS.Beep?.success?.();
              } else if (added.reason === 'DUPLICATE') {
                GMS.Toast.warn('موجود مسبقاً', sku);
              }
            }
          };
        });
      }, 250);
    }

    /* Keyboard shortcuts */
    const keyHandler = (e) => {
      if (GMS.Router?.current() !== 'pos') return;

      const active = document.activeElement;
      const inField = active && (
        active.tagName === 'INPUT' ||
        active.tagName === 'TEXTAREA' ||
        active.tagName === 'SELECT'
      );

      if (e.key === 'F2') {
        e.preventDefault();
        scanInput?.focus();
        scanInput?.select();
        return;
      }

      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        if (POSState.cart.length) openCheckoutModal();
        return;
      }

      if (e.ctrlKey && e.key === 'Backspace') {
        e.preventDefault();
        if (POSState.cart.length) {
          document.getElementById('pos-clear-btn')?.click();
        }
        return;
      }

      if (e.key === 'Escape' && !inField) {
        const resultHost = document.getElementById('pos-scan-result');
        if (resultHost) resultHost.innerHTML = '';
      }
    };

    document.addEventListener('keydown', keyHandler);

    POSState.unsubscribers.push(() => {
      document.removeEventListener('keydown', keyHandler);
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §12 · CHECKOUT MODAL
     ─────────────────────────────────────────────────────────────────────
     ✅ v2.0:
       • عرض مصنعية الجرام بخط صغير
       • حقل خصم (ج.م) على المصنعية
       • حساب مباشر للإجمالي بعد الخصم
     ═════════════════════════════════════════════════════════════════════ */

  function openCheckoutModal() {
    if (!POSState.cart.length) return;

    POSState.ui.checkoutOpen = true;

    const totals = computeCartTotals();
    const price24 = getPrice24();

    /* بناء HTML */
    const linesHTML = POSState.cart.map((item, i) => {
      const makingPerGram = Number(item.workmanship_per_gram || 0);
      const lineTotal = (
        Number(item.pure_weight) * price24 +
        Number(item.workmanship_value) +
        Number(item.stone_value || 0)
      ) * item.qty;

      return `
        <div class="l" style="display:flex;justify-content:space-between;
                    padding:10px 0;border-bottom:1px dashed var(--border);
                    font-size:12.5px">
          <div style="flex:1;min-width:0">
            <div style="color:var(--muted);font-weight:700">
              ${i + 1}. <span class="mono">${GMS.esc(item.sku)}</span>
              · ${item.karat}K
            </div>
            <div style="font-size:11px;color:var(--muted);
                        font-weight:600;margin-top:2px">
              صافي ${GMS.gramFmt(item.net_weight)} جم
              · بندق ${GMS.gramFmt(item.pure_weight)} جم
            </div>
            <!-- ✅ v2.0: مصنعية الجرام بخط صغير -->
            <div style="font-size:10px;color:var(--warn);
                        font-weight:700;margin-top:2px">
              <i data-lucide="hammer"
                 style="width:9px;height:9px;
                        display:inline;vertical-align:-1px"></i>
              مصنعية: ${GMS.moneyFmt(makingPerGram)} ج.م/جم
              (${GMS.moneyFmt(Number(item.workmanship_value) * item.qty)} ج.م)
            </div>
          </div>
          <div class="mono" style="font-weight:900;align-self:flex-start">
            ${GMS.moneyFmt(lineTotal)}
          </div>
        </div>
      `;
    }).join('');

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

            <div style="max-height:260px;overflow-y:auto;
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

              <!-- ✅ v2.0: المصنعية + مصنعية الجرام -->
              <div style="display:flex;justify-content:space-between;
                          padding:6px 0;font-size:12.5px">
                <span style="color:var(--muted);font-weight:700;
                             display:flex;align-items:baseline;gap:6px;flex-wrap:wrap">
                  <span>المصنعية</span>
                  ${totals.avgMakingPerGram > 0 ? `
                    <span style="font-size:10px;color:var(--muted);
                                 font-family:var(--font-mono);font-weight:700">
                      (${GMS.moneyFmt(totals.avgMakingPerGram)} ج.م/جم)
                    </span>
                  ` : ''}
                </span>
                <span class="mono" style="font-weight:800">${GMS.moneyFmt(totals.making)} ج.م</span>
              </div>

              <!-- ✅ v2.0: الخصم على المصنعية -->
              ${totals.discount > 0 ? `
                <div style="display:flex;justify-content:space-between;
                            padding:6px 0;font-size:12.5px">
                  <span style="color:var(--danger);font-weight:700">
                    خصم على المصنعية
                  </span>
                  <span class="mono" style="color:var(--danger);font-weight:800">
                    − ${GMS.moneyFmt(totals.discount)} ج.م
                  </span>
                </div>
              ` : ''}
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

            <!-- ✅ v2.0: حقل الخصم -->
            <div style="margin-top:14px;padding:12px 14px;
                        background:var(--warn-bg);border-radius:10px;
                        border:1px solid color-mix(in srgb,var(--warn) 30%,var(--border))">
              <div class="field" style="margin:0">
                <label style="color:var(--warn);
                              display:flex;align-items:center;
                              justify-content:space-between">
                  <span style="display:flex;align-items:center;gap:5px">
                    <i data-lucide="minus-circle"
                       style="width:13px;height:13px"></i>
                    الخصم على المصنعية (ج.م)
                  </span>
                  <span style="font-size:10px;color:var(--muted);
                               font-weight:700">
                    الحد الأقصى: ${GMS.moneyFmt(totals.making)} ج.م
                  </span>
                </label>
                <input type="number" id="pay-discount"
                       step="0.01" min="0"
                       max="${totals.making}"
                       value="${POSState.discount || 0}"
                       class="mono"
                       style="font-size:16px;font-weight:800;
                              text-align:center;
                              background:var(--surface);
                              border-color:color-mix(in srgb,var(--warn) 40%,var(--border))">
              </div>
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

        /* ✅ v2.0: حقل الخصم */
        const discountInput = el.querySelector('#pay-discount');

        const updateChange = () => {
          const paid = parseFloat(amountInput.value) || 0;
          const currentTotals = computeCartTotals();
          const change = Math.max(0, paid - currentTotals.total);
          changeInput.value = GMS.moneyFmt(change) + ' ج.م';

          if (paid < currentTotals.total) {
            changeInput.style.color = 'var(--danger)';
          } else if (paid > currentTotals.total) {
            changeInput.style.color = 'var(--success)';
          } else {
            changeInput.style.color = 'var(--text)';
          }
        };

        /* ✅ v2.0: ربط حقل الخصم */
        if (discountInput) {
          discountInput.oninput = () => {
            let v = parseFloat(discountInput.value) || 0;
            const currentTotals = computeCartTotals();
            const maxDiscount = currentTotals.making;

            /* تصحيح القيمة */
            v = Math.max(0, Math.min(v, maxDiscount));
            POSState.discount = v;

            /* تحديث الإجماليات في الواجهة الرئيسية */
            refreshTotals();

            /* إعادة حساب الإجمالي الجديد */
            const newTotals = computeCartTotals();
            amountInput.value = newTotals.total.toFixed(2);
            updateChange();
          };
        }

        amountInput.oninput = updateChange;
        updateChange();

        /* Confirm */
        el.querySelector('#confirm-checkout').onclick = async () => {
          const paid = parseFloat(amountInput.value) || 0;
          const method = el.querySelector('[data-pay].active')?.dataset.pay || 'cash';
          const customerId = el.querySelector('#pay-customer').value;
          const notes = el.querySelector('#pay-notes').value.trim();
          const discount = parseFloat(discountInput?.value) || 0;

          const finalTotals = computeCartTotals();

          if (paid < finalTotals.total) {
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
            discount,
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
     ✅ v2.0: يحفظ الخصم في الفاتورة
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

    /* بناء الفاتورة — ✅ v2.0: مع الخصم */
    const discount = Math.max(0, Number(paymentData.discount) || 0);
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

      /* ✅ v2.0: حقول الخصم */
      discount_amount: GMS.round(discount, 2),
      workmanship_after_discount: GMS.round(totals.makingAfterDiscount, 2),
      avg_making_per_gram: totals.avgMakingPerGram,

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
            /* ✅ v2.0 */
            discount_amount: sale.discount_amount,
            workmanship_after_discount: sale.workmanship_after_discount,
            avg_making_per_gram: sale.avg_making_per_gram,
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

        const linePayload = lines.map(l => ({
          sale_id: saleRow.id,
          ...l,
        }));

        const { error: linesError } = await client
          .from(GMS.SUPABASE_CONFIG.TABLES.SALE_ITEMS)
          .insert(linePayload);

        if (linesError) throw linesError;

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
        await GMS.IDB.queueAdd({
          id: sale.id,
          sale_no: sale.sale_no,
          item_count: sale.item_count,
          total_pure_weight: sale.total_pure_weight,
          grand_total: sale.grand_total,
          /* ✅ v2.0 */
          discount_amount: sale.discount_amount,
          workmanship_after_discount: sale.workmanship_after_discount,
          payment_method: sale.payment_method,
          status: 'PENDING_APPROVAL',
          created_at: now,
          lines,
          branch_id: sale.branch_id,
        });
      }

      /* تحديث المخزون محلياً */
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

      /* تحديث الإحصائيات */
      POSState.stats.salesCompleted++;
      POSState.stats.totalRevenue += totals.total;
      POSState.stats.totalPureWeight += totals.pure;

      /* Audit log */
      if (GMS.Audit) {
        await GMS.Audit.log(
          'CREATE',
          'sale',
          sale.id,
          `فاتورة بيع ${sale.sale_no} — ${GMS.moneyFmt(sale.grand_total)} ج.م` +
          (discount > 0 ? ` (خصم: ${GMS.moneyFmt(discount)} ج.م)` : ''),
          {
            invoice_no: sale.sale_no,
            total: sale.grand_total,
            items: sale.item_count,
            discount: sale.discount_amount,
            online,
          }
        );
      }

      /* ✅ v2.0: تصفير الخصم بعد البيع */
      Cart.clear();
      refreshCart();
      refreshStats();

      GMS.Loading.hide();

      if (POSState.config.beepEnabled) {
        GMS.Beep?.complete();
      }

      if (online) {
        GMS.Toast.ok(
          'تمت الفاتورة',
          `${sale.sale_no} · ${GMS.moneyFmt(sale.grand_total)} ج.م` +
          (discount > 0 ? ` · خصم ${GMS.moneyFmt(discount)} ج.م` : '')
        );
      } else {
        GMS.Toast.warn(
          'تم الحفظ محلياً',
          `${sale.sale_no} في الطابور — سيُرفع عند عودة الاتصال`
        );
      }

      /* Realtime */
      if (GMS.Realtime) {
        GMS.Realtime.emit('sales', 'INSERT', sale);
      }

      /* Modal النجاح */
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
     ─────────────────────────────────────────────────────────────────────
     ✅ v2.0: يعرض الخصم
     ═════════════════════════════════════════════════════════════════════ */

  function showSaleSuccess(sale, online) {
    const hasDiscount = Number(sale.discount_amount || 0) > 0;

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

          <!-- ✅ v2.0: عرض الخصم -->
          ${hasDiscount ? `
            <div style="display:flex;justify-content:space-between;
                        padding:6px 0;font-size:12.5px;
                        border-bottom:1px dashed var(--border);
                        background:color-mix(in srgb,var(--danger) 6%,transparent);
                        margin:0 -8px;padding-inline:8px;border-radius:6px">
              <span style="color:var(--danger);font-weight:800">
                <i data-lucide="minus-circle"
                   style="width:11px;height:11px;
                          display:inline;vertical-align:-1px"></i>
                خصم على المصنعية
              </span>
              <span class="mono" style="color:var(--danger);font-weight:900">
                − ${GMS.moneyFmt(sale.discount_amount)} ج.م
              </span>
            </div>
            <div style="display:flex;justify-content:space-between;
                        padding:6px 0;font-size:12.5px;
                        border-bottom:1px dashed var(--border)">
              <span style="color:var(--success);font-weight:700">
                المصنعية بعد الخصم
              </span>
              <span class="mono" style="color:var(--success);font-weight:900">
                ${GMS.moneyFmt(sale.workmanship_after_discount)} ج.م
              </span>
            </div>
          ` : ''}

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
            const si = document.getElementById('pos-scan-input');
            const active = document.activeElement;
            if (si && (!active || active === document.body)) {
              try {
                si.focus({ preventScroll: true });
              } catch (_) {
                si.focus();
              }
            }
          }, 300);
        };
      },
    });
  }

  /**
   * طباعة إيصال الفاتورة — ✅ v2.0: مع الخصم
   */
  function printReceipt(sale) {
    const root = document.getElementById('print-root');
    if (!root) {
      GMS.Toast.err('لا يمكن الطباعة', 'عنصر الطباعة غير موجود');
      return;
    }

    const price24 = getPrice24();
    const hasDiscount = Number(sale.discount_amount || 0) > 0;

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

        ${(sale.lines || []).map((line, i) => {
          const makingPerGram = Number(line.workmanship_per_gram || 0);

          return `
            <div style="margin:2mm 0">
              <div style="font-weight:900;font-size:10.5pt">
                ${i + 1}. ${GMS.esc(line.sku || '—')} — ${line.karat}K
              </div>
              <div class="rp-line" style="font-size:9.5pt">
                <span>صافي ${GMS.gramFmt(line.net_weight)} جم</span>
                <span>بندق ${GMS.gramFmt(line.pure_weight)} جم</span>
              </div>
              <div class="rp-line" style="font-size:8.5pt;color:#666">
                <span>مصنعية الجرام</span>
                <span>${GMS.moneyFmt(makingPerGram)} ج.م/جم</span>
              </div>
              <div class="rp-line" style="font-size:9.5pt">
                <span>ذهب ${GMS.moneyFmt(line.gold_value)}</span>
                <span>مصنعية ${GMS.moneyFmt(line.workmanship_value)}</span>
                <span style="font-weight:900">${GMS.moneyFmt(line.line_total)}</span>
              </div>
            </div>
          `;
        }).join('')}

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

        <!-- ✅ v2.0: عرض الخصم -->
        ${hasDiscount ? `
          <div class="rp-line" style="color:#b3261e">
            <span>خصم على المصنعية</span>
            <b>− ${GMS.moneyFmt(sale.discount_amount)} ج.م</b>
          </div>
          <div class="rp-line" style="color:#0f7a43">
            <span>المصنعية بعد الخصم</span>
            <b>${GMS.moneyFmt(sale.workmanship_after_discount)} ج.م</b>
          </div>
        ` : ''}

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
     ═════════════════════════════════════════════════════════════════════ */

  function cleanup() {
    clearTimeout(POSState.timers.scanClear);
    clearTimeout(POSState.timers.searchDebounce);

    POSState.unsubscribers.forEach(fn => {
      try { fn(); } catch (_) {}
    });
    POSState.unsubscribers = [];

    if (GMS.QRScanner) {
      try { GMS.QRScanner.unbind(); } catch (_) {}
    }

    if (POSState.ui.checkoutOpen) {
      GMS.Modal.closeAll();
      POSState.ui.checkoutOpen = false;
    }

    POSState.ui._initialFocusDone = false;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §16 · VIEW REGISTRATION
     ═════════════════════════════════════════════════════════════════════ */
  GMS.Views = GMS.Views || {};

  GMS.Views.pos = {
    render,
    cleanup,
    state: POSState,

    cart: Cart,

    handleScan,
    findBySku,
    searchItems,
    computeTotals: computeCartTotals,

    checkout: openCheckoutModal,
    printReceipt,

    /* ✅ v2.0: API الخصم */
    getDiscount: () => POSState.discount,
    setDiscount: (v) => {
      POSState.discount = Math.max(0, Number(v) || 0);
      refreshTotals();
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §17 · LOADED CONFIRMATION
     ═════════════════════════════════════════════════════════════════════ */
  console.log(
    '%c🛒 POS View v2.0 loaded · Scanner + Cart + Discount on Workmanship',
    'color:#0f7a43;font-weight:800;font-size:12px;padding:1px 5px;' +
    'background:#e6f6ee;border-radius:4px;'
  );

  console.log(
    `%c⚡ IndexedDB instant search · Offline-first · Hardware scanner · Thermal receipt`,
    'color:#6b7a95;font-weight:700;font-size:11px;'
  );

  console.log(
    `%c🆕 v2.0: Per-gram workmanship display · Discount (EGP) on workmanship`,
    'color:#a55a00;font-weight:900;font-size:11px;'
  );

  /* ═════════════════════════════════════════════════════════════════════
     ✅ js/13-views-pos.js — نهاية الملف
     ═════════════════════════════════════════════════════════════════════ */

})();
