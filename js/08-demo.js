/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ENTERPRISE — js/08-demo.js
   مولّد البيانات التجريبية الكامل:
     - الفروع والماركات والموردين
     - العملاء والموظفين
     - المخزون (10,000+ صنف)
     - الفواتير والبنود
     - دفتر الأستاذ (ذهبي + نقدي)
     - الورديات والمصروفات والعمولات
     - سجلات الخسس (سبك، تحميم، ششني)
     - طابور المزامنة
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const GMS = window.GMS = window.GMS || {};

  /* ═════════════════════════════════════════════════════════════════════
     §1 · PRNG DETERMINISTIC
     ─────────────────────────────────────────────────────────────────────
     مولّد أرقام شبه عشوائي مع بذرة ثابتة — لضمان ثبات البيانات
     ═════════════════════════════════════════════════════════════════════ */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ═════════════════════════════════════════════════════════════════════
     §2 · STATIC DEMO DATA
     ═════════════════════════════════════════════════════════════════════ */

  const BRANCHES = [
    {
      id: 'br-1',
      code: 'CAI01',
      name: 'فرع القاهرة — الصاغة',
      address: 'شارع الصاغة، الحسين، القاهرة',
      phone: '0223456789',
      manager: 'سارة إبراهيم',
      is_active: true,
      opened_at: '2020-01-15',
    },
    {
      id: 'br-2',
      code: 'ALX01',
      name: 'فرع الإسكندرية',
      address: 'شارع النبي دانيال، الإسكندرية',
      phone: '0345678901',
      manager: 'كريم الرائد',
      is_active: true,
      opened_at: '2021-03-20',
    },
    {
      id: 'br-3',
      code: 'TNT01',
      name: 'فرع طنطا',
      address: 'شارع البحر، طنطا، الغربية',
      phone: '0434567890',
      manager: 'هاني لطفي',
      is_active: true,
      opened_at: '2022-06-10',
    },
  ];

  const MANUFACTURERS = [
    { id: 'manu-1', code: 'A', letter: 'أ', name: 'مصنع النيل للذهب', rate: 120, is_active: true },
    { id: 'manu-2', code: 'B', letter: 'ب', name: 'الشرق للمجوهرات', rate: 145, is_active: true },
    { id: 'manu-3', code: 'C', letter: 'ج', name: 'الماسة الذهبية', rate: 100, is_active: true },
    { id: 'manu-4', code: 'D', letter: 'د', name: 'الفتح جولد', rate: 160, is_active: true },
    { id: 'manu-5', code: 'L', letter: 'ل', name: 'لازوردي', rate: 200, is_active: true },
    { id: 'manu-6', code: 'M', letter: 'م', name: 'مصر للذهب والمجوهرات', rate: 135, is_active: true },
  ];

  const CATEGORIES = [
    'خاتم', 'سلسلة', 'أسورة', 'حلق', 'توكة', 'دبلة',
    'قلادة', 'تعليقة', 'غوايش', 'كوليه', 'سبيكة', 'ليرة',
  ];

  const SUPPLIERS = [
    {
      id: 'sup-1', code: 'SUP-001', name: 'مصنع النيل للذهب',
      contact_person: 'أحمد النيلي', phone: '01001234567',
      address: 'الصاغة — القاهرة', tax_id: '512-345-678',
      opening_gold: 245.8120, opening_cash: 18500.00,
      is_active: true,
    },
    {
      id: 'sup-2', code: 'SUP-002', name: 'الشرق للمجوهرات',
      contact_person: 'محمد الشرقاوي', phone: '01098765432',
      address: 'الغورية — القاهرة', tax_id: '512-987-654',
      opening_gold: 88.4500, opening_cash: -4250.00,
      is_active: true,
    },
    {
      id: 'sup-3', code: 'SUP-003', name: 'الماسة الذهبية',
      contact_person: 'سامي عبد الله', phone: '01122334455',
      address: 'الإسكندرية', tax_id: '513-223-344',
      opening_gold: 0, opening_cash: 0,
      is_active: true,
    },
    {
      id: 'sup-4', code: 'SUP-004', name: 'الفتح جولد',
      contact_person: 'إبراهيم فتحي', phone: '01555566677',
      address: 'المنصورة', tax_id: '514-555-666',
      opening_gold: 512.3400, opening_cash: 127800.00,
      is_active: true,
    },
    {
      id: 'sup-5', code: 'SUP-005', name: 'لازوردي',
      contact_person: 'هاني لطفي', phone: '01277788899',
      address: 'مدينة نصر — القاهرة', tax_id: '512-777-888',
      opening_gold: 34.1250, opening_cash: -15800.00,
      is_active: true,
    },
    {
      id: 'sup-6', code: 'SUP-006', name: 'مصر للذهب والمجوهرات',
      contact_person: 'عصام الشامي', phone: '01033344455',
      address: 'وسط البلد — القاهرة', tax_id: '511-333-444',
      opening_gold: 178.5000, opening_cash: 45200.00,
      is_active: true,
    },
  ];

  const CUSTOMERS = [
    { id: 'cust-1', name: 'ياسمين أحمد', phone: '01001234567', address: 'مدينة نصر', notes: 'عميلة دائمة' },
    { id: 'cust-2', name: 'خالد مصطفى', phone: '01098765432', address: 'المعادي', notes: '' },
    { id: 'cust-3', name: 'منى علي', phone: '01122334455', address: 'الزمالك', notes: '' },
    { id: 'cust-4', name: 'أحمد محمود', phone: '01555566677', address: 'مصر الجديدة', notes: '' },
    { id: 'cust-5', name: 'نور الهدى', phone: '01277788899', address: 'الدقي', notes: '' },
    { id: 'cust-6', name: 'كريم الرائد', phone: '01199988877', address: 'المهندسين', notes: '' },
    { id: 'cust-7', name: 'سارة عبد الله', phone: '01011122233', address: 'شبرا', notes: '' },
    { id: 'cust-8', name: 'محمد إبراهيم', phone: '01044455566', address: 'حلوان', notes: '' },
    { id: 'cust-9', name: 'دينا عبد الرحمن', phone: '01266677788', address: 'المقطم', notes: '' },
    { id: 'cust-10', name: 'عمرو الشامي', phone: '01577788899', address: 'الشيخ زايد', notes: '' },
  ];

  const SALESPEOPLE = [
    'أحمد محمود',
    'سارة عبد الله',
    'محمد إبراهيم',
    'مصطفى سامي',
    'نور الهدى',
    'خالد مصطفى',
    'منى علي',
    'هاني لطفي',
    'ياسمين أحمد',
    'كريم الرائد',
    'عمرو الشامي',
    'دينا عبد الرحمن',
  ];

  const WORKSHOPS = [
    'ورشة الصاغة الرئيسية',
    'ورشة النور للجلخ',
    'ورشة التحميم الفني',
    'مسبكة القاهرة',
    'ورشة الأمانة',
  ];

  const ASSAY_OFFICES = [
    'مكتب الششني المعتمد — القاهرة',
    'مكتب المعايرة المركزي',
    'مختبر الششني للذهب',
    'مسبكة الصاغة للفحص',
  ];

  const EXPENSE_CATEGORIES = [
    { key: 'rent', label: 'إيجار', icon: 'home' },
    { key: 'electricity', label: 'كهرباء', icon: 'zap' },
    { key: 'water', label: 'مياه', icon: 'droplets' },
    { key: 'salaries', label: 'رواتب', icon: 'users' },
    { key: 'commissions', label: 'عمولات', icon: 'hand-coins' },
    { key: 'maintenance', label: 'صيانة', icon: 'wrench' },
    { key: 'marketing', label: 'تسويق', icon: 'megaphone' },
    { key: 'transport', label: 'نقل', icon: 'truck' },
    { key: 'supplies', label: 'مستلزمات', icon: 'package' },
    { key: 'insurance', label: 'تأمينات', icon: 'shield' },
    { key: 'taxes', label: 'ضرائب', icon: 'receipt' },
    { key: 'other', label: 'أخرى', icon: 'more-horizontal' },
  ];

  /* ═════════════════════════════════════════════════════════════════════
     §3 · INVENTORY GENERATOR
     ═════════════════════════════════════════════════════════════════════ */

  let _inventoryCache = null;

  /**
   * توليد مصفوفة المخزون الكاملة
   * @param {number} [count=1200]
   * @param {number} [seed=1337]
   * @param {number} [timeOffsetMs=0] — لإزاحة زمنية للاختبار
   * @returns {Array}
   */
  function generateInventory(count = 1200, seed = 1337, timeOffsetMs = 0) {
    const rnd = mulberry32(seed);
    const arr = [];
    const price24 = GMS.APP_CONFIG.DEFAULT_PRICE_24;
    const now = Date.now() - timeOffsetMs;

    for (let i = 0; i < count; i++) {
      arr.push(_makeItem(i, rnd, now, price24));
    }

    return arr;
  }

  /**
   * توليد صنف واحد
   * @param {number} idx
   * @param {Function} rnd
   * @param {number} now
   * @param {number} price24
   * @returns {Object}
   * @private
   */
  function _makeItem(idx, rnd, now, price24) {
    /* اختيار عشوائي */
    const karat = GMS.KARAT_ORDER[Math.floor(rnd() * GMS.KARAT_ORDER.length)];
    const ratio = GMS.karatRatio(karat);
    const category = CATEGORIES[Math.floor(rnd() * CATEGORIES.length)];
    const manu = MANUFACTURERS[Math.floor(rnd() * MANUFACTURERS.length)];
    const branch = BRANCHES[Math.floor(rnd() * BRANCHES.length)];

    /* الأوزان */
    const gross = GMS.round(1.2 + rnd() * 12, 3);
    const stones = rnd() < 0.15 ? GMS.round(rnd() * 0.5, 3) : 0;
    const net = GMS.round(Math.max(0.3, gross - stones), 3);
    const pure = GMS.round(net * ratio, 4);

    /* المصنعية */
    const rateOptions = [95, 110, 125, 140, 160, 185, 210, 240];
    const rate = rateOptions[Math.floor(rnd() * rateOptions.length)];

    /* القيم */
    const goldValue = GMS.round(pure * price24, 2);
    const makeValue = GMS.round(net * rate, 2);
    const totalCost = GMS.round(goldValue + makeValue, 2);

    /* التواريخ */
    const daysBack = Math.floor(rnd() * 120);
    const created = new Date(now - daysBack * 86400000);
    const updated = new Date(created.getTime() + Math.floor(rnd() * 5000) * 1000);

    /* SKU */
    const stamp = String(created.getFullYear()).slice(2) +
      String(created.getMonth() + 1).padStart(2, '0') +
      String(created.getDate()).padStart(2, '0');
    const seq = String(idx + 1).padStart(5, '0');
    const sku = `${manu.code}${karat}-${stamp}-${seq}`;

    /* الحالة */
    const roll = rnd();
    let status;
    if (roll < 0.82) status = 'IN_STOCK';
    else if (roll < 0.90) status = 'SOLD';
    else if (roll < 0.95) status = 'RESERVED';
    else if (roll < 0.98) status = 'RETURNED';
    else status = 'MELTED';

    /* بيانات إضافية */
    const quantity = 1;
    const notes = rnd() < 0.05 ? 'يحتاج تلميع' : null;

    return {
      id: `inv-${String(idx + 1).padStart(6, '0')}`,
      sku,
      category,
      karat,
      purity_ratio: ratio,
      weight_grams: gross,
      stone_weight: stones,
      net_weight: net,
      pure_weight: pure,
      workmanship_per_gram: rate,
      workmanship_value: makeValue,
      gold_value: goldValue,
      total_cost: totalCost,
      price_24: price24,
      status,
      quantity,
      notes,
      branch_id: branch.id,
      branch_name: branch.name,
      branch_code: branch.code,
      manufacturer_id: manu.id,
      manufacturer_code: manu.code,
      manufacturer_name: manu.name,
      letter_code: manu.letter,
      created_at: created.toISOString(),
      updated_at: updated.toISOString(),
    };
  }

  /* ═════════════════════════════════════════════════════════════════════
     §4 · SALES GENERATOR
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * توليد فواتير البيع
   * @param {Array} inventory
   * @param {number} [count=500]
   * @param {number} [daysBack=90]
   * @param {number} [seed=4242]
   * @returns {Array}
   */
  function generateSales(inventory, count = 500, daysBack = 90, seed = 4242) {
    const rnd = mulberry32(seed);
    const soldItems = inventory.filter(i => i.status === 'SOLD');
    const pool = soldItems.length ? soldItems : inventory;

    if (!pool.length) return [];

    const sales = [];

    for (let i = 0; i < count; i++) {
      const daysAgo = Math.floor(rnd() * daysBack);
      const created = new Date(Date.now() - daysAgo * 86400000 - Math.floor(rnd() * 86400) * 1000);

      const item = pool[Math.floor(rnd() * pool.length)];
      const branch = BRANCHES.find(b => b.id === item.branch_id) || BRANCHES[0];
      const cashier = SALESPEOPLE[Math.floor(rnd() * SALESPEOPLE.length)];
      const customer = rnd() < 0.4 ? CUSTOMERS[Math.floor(rnd() * CUSTOMERS.length)] : null;

      const paymentMethods = ['cash', 'cash', 'cash', 'card', 'instapay'];
      const method = paymentMethods[Math.floor(rnd() * paymentMethods.length)];

      const isPaid = rnd() < 0.88;
      const paid = isPaid ? item.total_cost : GMS.round(item.total_cost * (0.3 + rnd() * 0.5), 2);
      const remaining = GMS.round(item.total_cost - paid, 2);

      /* حالة الفاتورة */
      const statusRoll = rnd();
      const status = statusRoll < 0.7 ? 'APPROVED'
                    : statusRoll < 0.9 ? 'COMPLETED'
                    : 'PENDING_APPROVAL';

      const saleNo = `INV-${String(created.getFullYear()).slice(2)}` +
        `${String(created.getMonth() + 1).padStart(2, '0')}` +
        `${String(created.getDate()).padStart(2, '0')}-` +
        `${String(i + 1).padStart(4, '0')}`;

      sales.push({
        id: `sale-${String(i + 1).padStart(6, '0')}`,
        sale_no: saleNo,
        invoice_no: saleNo,
        type: 'sale',
        branch_id: branch.id,
        branch_name: branch.name,
        cashier_name: cashier,
        customer_id: customer?.id || null,
        customer_name: customer?.name || 'عميل نقدي',
        customer_phone: customer?.phone || null,
        item_count: 1,
        total_gross_weight: item.weight_grams,
        total_net_weight: item.net_weight,
        total_pure_weight: item.pure_weight,
        total_workmanship: item.workmanship_value,
        gold_value: item.gold_value,
        grand_total: item.total_cost,
        paid,
        remaining,
        payment_method: method,
        status,
        review_notes: null,
        reviewed_at: status !== 'PENDING_APPROVAL' ? created.toISOString() : null,
        created_at: created.toISOString(),
      });
    }

    return sales.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  /* ═════════════════════════════════════════════════════════════════════
     §5 · LEDGER ENTRIES GENERATOR
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * توليد قيود دفتر الأستاذ للموردين
   * @param {number} [count=200]
   * @param {number} [daysBack=180]
   * @param {number} [seed=5555]
   * @returns {Array}
   */
  function generateLedgerEntries(count = 200, daysBack = 180, seed = 5555) {
    const rnd = mulberry32(seed);
    const entries = [];

    const entryTypes = [
      { type: 'gold_received', weight: 0 },
      { type: 'gold_payment', weight: 1 },
      { type: 'cash_payment', weight: 1.5 },
      { type: 'cash_received', weight: 0.5 },
      { type: 'workmanship', weight: 0.8 },
      { type: 'scrap_settlement', weight: 0.4 },
      { type: 'return_to_supplier', weight: 0.3 },
    ];

    /* جدول تراكمي */
    const weights = entryTypes.map(t => t.weight);
    const totalWeight = weights.reduce((a, b) => a + b, 0);

    function pickType() {
      let roll = rnd() * totalWeight;
      for (let i = 0; i < entryTypes.length; i++) {
        roll -= weights[i];
        if (roll <= 0) return entryTypes[i].type;
      }
      return entryTypes[0].type;
    }

    for (let i = 0; i < count; i++) {
      const daysAgo = Math.floor(rnd() * daysBack);
      const created = new Date(Date.now() - daysAgo * 86400000);

      const supplier = SUPPLIERS[Math.floor(rnd() * SUPPLIERS.length)];
      const type = pickType();
      const branch = BRANCHES[Math.floor(rnd() * BRANCHES.length)];

      let goldDelta = 0;
      let cashDelta = 0;
      let description = '';
      let goldKarat = null;
      let goldGrossWeight = null;
      let goldNetWeight = null;
      let goldPurityWeight = null;

      switch (type) {
        case 'gold_received': {
          goldKarat = [21, 21, 21, 18, 24][Math.floor(rnd() * 5)];
          goldGrossWeight = GMS.round(10 + rnd() * 100, 3);
          goldNetWeight = goldGrossWeight;
          const ratio = GMS.karatRatio(goldKarat);
          goldPurityWeight = GMS.round(goldNetWeight * ratio, 4);
          goldDelta = goldPurityWeight;
          description = `شحنة ذهب عيار ${goldKarat}`;
          break;
        }
        case 'gold_payment':
          goldDelta = -GMS.round(5 + rnd() * 50, 4);
          description = 'تسليم ذهب للمورد';
          break;
        case 'cash_payment':
          cashDelta = -GMS.round(5000 + rnd() * 80000, 2);
          description = 'سداد نقدي';
          break;
        case 'cash_received':
          cashDelta = GMS.round(2000 + rnd() * 30000, 2);
          description = 'استرداد من المورد';
          break;
        case 'workmanship':
          cashDelta = GMS.round(1000 + rnd() * 5000, 2);
          description = 'مصنعية مستحقة';
          break;
        case 'scrap_settlement':
          goldDelta = GMS.round(2 + rnd() * 15, 4);
          description = 'تسوية كسر';
          break;
        case 'return_to_supplier':
          goldDelta = -GMS.round(2 + rnd() * 20, 4);
          description = 'إرجاع ذهب للمورد';
          break;
      }

      entries.push({
        id: `ledger-${String(i + 1).padStart(6, '0')}`,
        entity_type: 'supplier',
        entity_id: supplier.id,
        supplier_name: supplier.name,
        entry_type: type,
        gold_delta: goldDelta,
        cash_delta: cashDelta,
        gold_karat: goldKarat,
        gold_gross_weight: goldGrossWeight,
        gold_net_weight: goldNetWeight,
        gold_purity_weight: goldPurityWeight,
        description,
        reference_no: `REF-${String(i + 1).padStart(5, '0')}`,
        branch_id: branch.id,
        created_at: created.toISOString(),
      });
    }

    return entries.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  /* ═════════════════════════════════════════════════════════════════════
     §6 · SHIFTS GENERATOR
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * توليد الورديات
   * @param {number} [count=30]
   * @param {number} [seed=7777]
   * @returns {Array}
   */
  function generateShifts(count = 30, seed = 7777) {
    const rnd = mulberry32(seed);
    const shifts = [];

    for (let i = 0; i < count; i++) {
      const daysAgo = Math.floor(i / 1);
      const date = new Date(Date.now() - daysAgo * 86400000);
      const branch = BRANCHES[Math.floor(rnd() * BRANCHES.length)];
      const cashier = SALESPEOPLE[Math.floor(rnd() * SALESPEOPLE.length)];

      const openingCash = GMS.round(3000 + rnd() * 5000, 2);
      const cashSales = GMS.round(30000 + rnd() * 180000, 2);
      const cardSales = GMS.round(5000 + rnd() * 40000, 2);
      const cashExpenses = GMS.round(0 + rnd() * 3000, 2);
      const cashDeposits = GMS.round(rnd() * 100000, 2);

      const expectedCash = GMS.round(
        openingCash + cashSales + cashDeposits - cashExpenses, 2
      );

      const variance = rnd() < 0.7
        ? 0
        : GMS.round((rnd() - 0.5) * 200, 2);

      const countedCash = GMS.round(expectedCash + variance, 2);

      const openingGold = GMS.round(50 + rnd() * 200, 4);
      const goldReceived = GMS.round(rnd() * 50, 4);
      const goldSold = GMS.round(5 + rnd() * 40, 4);
      const expectedGold = GMS.round(openingGold + goldReceived - goldSold, 4);
      const goldVariance = rnd() < 0.8 ? 0 : GMS.round((rnd() - 0.5) * 0.5, 4);
      const countedGold = GMS.round(expectedGold + goldVariance, 4);

      const isToday = daysAgo === 0;
      const status = isToday ? 'OPEN' : 'CLOSED';

      const stamp = String(date.getFullYear()).slice(2) +
        String(date.getMonth() + 1).padStart(2, '0') +
        String(date.getDate()).padStart(2, '0');

      shifts.push({
        id: `shift-${String(i + 1).padStart(4, '0')}`,
        shift_no: `SH-${branch.code}-${stamp}-${String(i + 1).padStart(2, '0')}`,
        branch_id: branch.id,
        branch_name: branch.name,
        cashier_name: cashier,
        counter_name: 'كاشير 1',
        shift_date: date.toISOString().slice(0, 10),
        opened_at: new Date(date.setHours(9, 0, 0, 0)).toISOString(),
        closed_at: status === 'CLOSED'
          ? new Date(date.setHours(21, 0, 0, 0)).toISOString()
          : null,
        opening_cash: openingCash,
        opening_gold_pure: openingGold,
        cash_sales: cashSales,
        card_sales: cardSales,
        gold_received_pure: goldReceived,
        gold_sold_pure: goldSold,
        cash_expenses: cashExpenses,
        cash_deposits: cashDeposits,
        expected_cash: expectedCash,
        counted_cash: countedCash,
        cash_variance: variance,
        expected_gold_pure: expectedGold,
        counted_gold_pure: countedGold,
        gold_variance: goldVariance,
        status,
        notes: variance !== 0 ? 'فرق بسيط في الصندوق' : null,
      });
    }

    return shifts.sort((a, b) => new Date(b.opened_at) - new Date(a.opened_at));
  }

  /* ═════════════════════════════════════════════════════════════════════
     §7 · EXPENSES GENERATOR
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * توليد مصروفات الفروع
   * @param {number} [count=80]
   * @param {number} [daysBack=90]
   * @param {number} [seed=8888]
   * @returns {Array}
   */
  function generateExpenses(count = 80, daysBack = 90, seed = 8888) {
    const rnd = mulberry32(seed);
    const out = [];

    const templates = {
      rent: { min: 10000, max: 30000, desc: 'إيجار شهري', vendor: 'المالك' },
      electricity: { min: 1500, max: 5000, desc: 'فاتورة كهرباء', vendor: 'شركة الكهرباء' },
      water: { min: 200, max: 800, desc: 'فاتورة مياه', vendor: 'شركة المياه' },
      salaries: { min: 25000, max: 60000, desc: 'رواتب الشهر', vendor: 'الموظفين' },
      commissions: { min: 2000, max: 15000, desc: 'عمولات مبيعات', vendor: 'البائعين' },
      maintenance: { min: 500, max: 4000, desc: 'صيانة', vendor: 'ورشة الصيانة' },
      marketing: { min: 2000, max: 12000, desc: 'حملة إعلانية', vendor: 'وكالة تسويق' },
      transport: { min: 300, max: 2000, desc: 'نقل وشحن', vendor: 'شركة نقل' },
      supplies: { min: 200, max: 3000, desc: 'مستلزمات مكتبية', vendor: 'مكتبة' },
      insurance: { min: 3000, max: 8000, desc: 'قسط تأمين', vendor: 'شركة تأمين' },
      taxes: { min: 5000, max: 20000, desc: 'ضرائب', vendor: 'مصلحة الضرائب' },
      other: { min: 100, max: 2000, desc: 'مصروفات متنوعة', vendor: '—' },
    };

    const keys = Object.keys(templates);

    for (let i = 0; i < count; i++) {
      const daysAgo = Math.floor(rnd() * daysBack);
      const date = new Date(Date.now() - daysAgo * 86400000);

      const catKey = keys[Math.floor(rnd() * keys.length)];
      const tmpl = templates[catKey];
      const amount = GMS.round(tmpl.min + rnd() * (tmpl.max - tmpl.min), 2);

      const branch = BRANCHES[Math.floor(rnd() * BRANCHES.length)];

      const methods = ['cash', 'cash', 'bank', 'card'];
      const method = methods[Math.floor(rnd() * methods.length)];

      out.push({
        id: `exp-${String(i + 1).padStart(5, '0')}`,
        branch_id: branch.id,
        branch_name: branch.name,
        category: catKey,
        amount,
        expense_date: date.toISOString().slice(0, 10),
        description: tmpl.desc,
        paid_to: tmpl.vendor,
        payment_method: method,
        receipt_no: rnd() < 0.6 ? `RN-${String(i + 1).padStart(5, '0')}` : null,
        status: 'APPROVED',
        created_at: date.toISOString(),
      });
    }

    return out.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  /* ═════════════════════════════════════════════════════════════════════
     §8 · COMMISSIONS GENERATOR
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * توليد عمولات البائعين
   * @param {number} [seed=9999]
   * @returns {Array}
   */
  function generateCommissions(seed = 9999) {
    const rnd = mulberry32(seed);
    const out = [];

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString().slice(0, 10);
    const monthEnd = now.toISOString().slice(0, 10);

    SALESPEOPLE.forEach((name, i) => {
      const salesTotal = GMS.round(50000 + rnd() * 200000, 2);
      const goldSold = GMS.round(salesTotal / 4500 * 0.95, 3);
      const workmanship = GMS.round(salesTotal * 0.08, 2);

      const rateOptions = [1.2, 1.5, 1.8];
      const rate = rateOptions[Math.floor(rnd() * rateOptions.length)];

      const commissionAmount = GMS.round(salesTotal * rate / 100, 2);

      const statusRoll = rnd();
      const status = statusRoll < 0.6 ? 'PENDING' : 'APPROVED';

      out.push({
        id: `comm-${String(i + 1).padStart(4, '0')}`,
        branch_id: BRANCHES[i % BRANCHES.length].id,
        branch_name: BRANCHES[i % BRANCHES.length].name,
        salesperson_name: name,
        period_start: monthStart,
        period_end: monthEnd,
        sales_total: salesTotal,
        gold_sold_pure: goldSold,
        workmanship_total: workmanship,
        commission_rate: rate,
        commission_amount: commissionAmount,
        status,
        approved_at: status === 'APPROVED' ? new Date().toISOString() : null,
        created_at: new Date().toISOString(),
      });
    });

    return out;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §9 · MELTING BATCHES GENERATOR
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * توليد دفعات السبك
   * @param {number} [count=25]
   * @param {number} [seed=1010]
   * @returns {Array}
   */
  function generateMeltingBatches(count = 25, seed = 1010) {
    const rnd = mulberry32(seed);
    const out = [];

    for (let i = 0; i < count; i++) {
      const daysAgo = Math.floor(rnd() * 60);
      const created = new Date(Date.now() - daysAgo * 86400000);

      const preWeight = GMS.round(50 + rnd() * 300, 3);

      /* نسبة خسس عشوائية (معظمها طبيعي) */
      const lossRoll = rnd();
      let lossPct;
      if (lossRoll < 0.70) {
        /* طبيعي: 0.10% - 0.30% */
        lossPct = 0.10 + rnd() * 0.20;
      } else if (lossRoll < 0.90) {
        /* مراقبة: 0.30% - 0.50% */
        lossPct = 0.30 + rnd() * 0.20;
      } else {
        /* مشبوه: 0.50% - 0.80% */
        lossPct = 0.50 + rnd() * 0.30;
      }

      const lossWeight = GMS.round(preWeight * lossPct / 100, 3);
      const postWeight = GMS.round(preWeight - lossWeight, 3);

      const isSuspicious = lossPct > 0.5;
      const severity = lossPct < 0.10 ? 'low'
                     : lossPct <= 0.30 ? 'natural'
                     : lossPct <= 0.50 ? 'warning'
                     : 'suspicious';

      const batchNo = `MB-${String(created.getFullYear()).slice(2)}` +
        `${String(created.getMonth() + 1).padStart(2, '0')}` +
        `${String(created.getDate()).padStart(2, '0')}-` +
        `${String(i + 1).padStart(3, '0')}`;

      out.push({
        id: `melt-${String(i + 1).padStart(4, '0')}`,
        batch_no: batchNo,
        pre_melt_weight: preWeight,
        post_melt_weight: postWeight,
        loss_weight: lossWeight,
        loss_percentage: GMS.round(lossPct, 4),
        target_karat: 24,
        piece_count: Math.floor(3 + rnd() * 20),
        severity,
        is_suspicious: isSuspicious,
        notes: isSuspicious ? 'يحتاج مراجعة — خسس غير طبيعي' : null,
        created_at: created.toISOString(),
      });
    }

    return out.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  /* ═════════════════════════════════════════════════════════════════════
     §10 · ASSAY RECORDS GENERATOR
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * توليد سجلات الششني
   * @param {number} [count=40]
   * @param {number} [seed=2020]
   * @returns {Array}
   */
  function generateAssayRecords(count = 40, seed = 2020) {
    const rnd = mulberry32(seed);
    const out = [];

    for (let i = 0; i < count; i++) {
      const daysAgo = Math.floor(rnd() * 90);
      const created = new Date(Date.now() - daysAgo * 86400000);

      const karat = GMS.KARAT_ORDER[Math.floor(rnd() * 5)];
      const claimedPurity = GMS.karatRatio(karat);
      const weight = GMS.round(2 + rnd() * 30, 3);

      /* النقاء المُختبَر — قريب من المُدَّعى مع اختلاف طفيف */
      const delta = (rnd() - 0.5) * 0.03;
      const testedPurity = Math.max(0.4, Math.min(1.0,
        GMS.round(claimedPurity + delta, 4)
      ));

      const claimedPure = GMS.round(weight * claimedPurity, 4);
      const testedPure = GMS.round(weight * testedPurity, 4);
      const pureDelta = GMS.round(testedPure - claimedPure, 4);

      const feeMethod = rnd() < 0.7 ? 'cash' : 'gold';
      const feeAmount = feeMethod === 'cash' ? GMS.round(50 + rnd() * 200, 2) : 0;
      const feeGoldGrams = feeMethod === 'gold' ? GMS.round(0.01 + rnd() * 0.05, 4) : 0;

      const office = ASSAY_OFFICES[Math.floor(rnd() * ASSAY_OFFICES.length)];

      const stamp = String(created.getFullYear()).slice(2) +
        String(created.getMonth() + 1).padStart(2, '0') +
        String(created.getDate()).padStart(2, '0');

      out.push({
        id: `assay-${String(i + 1).padStart(4, '0')}`,
        sku: `AS${karat}-${stamp}-${String(i + 1).padStart(4, '0')}`,
        certificate_no: `CERT-${stamp}-${String(i + 1).padStart(4, '0')}`,
        claimed_karat: karat,
        claimed_purity: claimedPurity,
        tested_purity: testedPurity,
        weight_grams: weight,
        claimed_pure: claimedPure,
        tested_pure: testedPure,
        pure_delta: pureDelta,
        assayer_name: office,
        fee_method: feeMethod,
        fee_amount: feeAmount,
        fee_gold_grams: feeGoldGrams,
        notes: Math.abs(pureDelta) > 0.05 ? 'فرق كبير في النقاء' : null,
        created_at: created.toISOString(),
      });
    }

    return out.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  /* ═════════════════════════════════════════════════════════════════════
     §11 · POLISHING BATCHES GENERATOR
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * توليد دفعات التحميم والجلخ
   * @param {number} [count=30]
   * @param {number} [seed=3030]
   * @returns {Array}
   */
  function generatePolishingBatches(count = 30, seed = 3030) {
    const rnd = mulberry32(seed);
    const out = [];

    const services = ['acid', 'buffing', 'polish', 'combined'];
    const serviceLabels = {
      acid: 'تحميم حامض',
      buffing: 'جلخ وتلميع',
      polish: 'تلميع فقط',
      combined: 'تحميم + جلخ + تلميع',
    };

    for (let i = 0; i < count; i++) {
      const daysAgo = Math.floor(rnd() * 60);
      const created = new Date(Date.now() - daysAgo * 86400000);

      const preWeight = GMS.round(20 + rnd() * 150, 3);

      /* نسبة خسس عشوائية (طبيعي 0.05% - 0.15%) */
      const lossRoll = rnd();
      let lossPct;
      if (lossRoll < 0.75) {
        lossPct = 0.05 + rnd() * 0.10;
      } else if (lossRoll < 0.92) {
        lossPct = 0.15 + rnd() * 0.10;
      } else {
        lossPct = 0.25 + rnd() * 0.15;
      }

      const lossWeight = GMS.round(preWeight * lossPct / 100, 3);
      const postWeight = GMS.round(preWeight - lossWeight, 3);

      const isSuspicious = lossPct > 0.25;
      const severity = lossPct < 0.05 ? 'low'
                     : lossPct <= 0.15 ? 'natural'
                     : lossPct <= 0.25 ? 'warning'
                     : 'suspicious';

      const serviceType = services[Math.floor(rnd() * services.length)];
      const workshop = WORKSHOPS[Math.floor(rnd() * WORKSHOPS.length)];

      const stamp = String(created.getFullYear()).slice(2) +
        String(created.getMonth() + 1).padStart(2, '0') +
        String(created.getDate()).padStart(2, '0');

      out.push({
        id: `polish-${String(i + 1).padStart(4, '0')}`,
        batch_no: `PL-${stamp}-${String(i + 1).padStart(3, '0')}`,
        service_type: serviceType,
        service_label: serviceLabels[serviceType],
        workshop_name: workshop,
        pre_weight: preWeight,
        post_weight: postWeight,
        loss_weight: lossWeight,
        loss_percentage: GMS.round(lossPct, 4),
        piece_count: Math.floor(2 + rnd() * 15),
        severity,
        is_suspicious: isSuspicious,
        notes: isSuspicious ? 'خسس مرتفع — يحتاج مراجعة' : null,
        created_at: created.toISOString(),
      });
    }

    return out.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  /* ═════════════════════════════════════════════════════════════════════
     §12 · RETURNS GENERATOR
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * توليد المرتجعات
   * @param {Array} inventory
   * @param {number} [count=50]
   * @param {number} [seed=6060]
   * @returns {Array}
   */
  function generateReturns(inventory, count = 50, seed = 6060) {
    const rnd = mulberry32(seed);
    const out = [];

    const returnTypes = [
      { type: 'customer_return', weight: 2 },
      { type: 'buyback', weight: 3 },
      { type: 'supplier_return', weight: 1 },
    ];

    const totalWeight = returnTypes.reduce((a, b) => a + b.weight, 0);

    function pickType() {
      let roll = rnd() * totalWeight;
      for (const rt of returnTypes) {
        roll -= rt.weight;
        if (roll <= 0) return rt.type;
      }
      return 'customer_return';
    }

    for (let i = 0; i < count; i++) {
      const daysAgo = Math.floor(rnd() * 60);
      const created = new Date(Date.now() - daysAgo * 86400000);

      const type = pickType();
      const item = inventory[Math.floor(rnd() * inventory.length)];

      const reasons = ['size', 'defect', 'not_as_described', 'change_mind', 'exchange'];
      const reason = reasons[Math.floor(rnd() * reasons.length)];

      const stamp = String(created.getFullYear()).slice(2) +
        String(created.getMonth() + 1).padStart(2, '0') +
        String(created.getDate()).padStart(2, '0');

      let refundAmount = 0;
      let refundMethod = null;
      let creditIssued = 0;

      if (type === 'customer_return') {
        refundAmount = item.total_cost;
        const methods = ['cash', 'cash', 'card', 'credit'];
        refundMethod = methods[Math.floor(rnd() * methods.length)];
        if (refundMethod === 'credit') {
          creditIssued = refundAmount;
          refundAmount = 0;
        }
      } else if (type === 'buyback') {
        refundAmount = GMS.round(item.pure_weight * 4500 * 0.92, 2);
        refundMethod = rnd() < 0.7 ? 'cash' : 'credit';
        if (refundMethod === 'credit') {
          creditIssued = refundAmount;
          refundAmount = 0;
        }
      }

      const prefixes = {
        customer_return: 'RT',
        buyback: 'BB',
        supplier_return: 'SR',
      };

      out.push({
        id: `return-${String(i + 1).padStart(4, '0')}`,
        return_no: `${prefixes[type]}-${stamp}-${String(i + 1).padStart(4, '0')}`,
        return_type: type,
        inventory_id: item.id,
        sku: item.sku,
        karat: item.karat,
        gross_weight: item.weight_grams,
        net_weight: item.net_weight,
        pure_weight: item.pure_weight,
        tested_purity: item.purity_ratio,
        refund_amount: refundAmount,
        refund_method: refundMethod,
        credit_issued: creditIssued,
        reason,
        customer_name: rnd() < 0.5 ? CUSTOMERS[Math.floor(rnd() * CUSTOMERS.length)].name : null,
        party_type: type === 'supplier_return' ? 'supplier' : 'customer',
        party_id: type === 'supplier_return'
          ? SUPPLIERS[Math.floor(rnd() * SUPPLIERS.length)].id
          : null,
        branch_id: item.branch_id,
        status: 'COMPLETED',
        notes: null,
        created_at: created.toISOString(),
      });
    }

    return out.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  /* ═════════════════════════════════════════════════════════════════════
     §13 · CACHE CONTROLLER
     ─────────────────────────────────────────────────────────────────────
     يخزّن كل البيانات المُولَّدة ويوفرها بسرعة
     ═════════════════════════════════════════════════════════════════════ */
  const DemoData = {

    /* مخزون مؤقت */
    _inventory: null,
    _sales: null,
    _ledgerEntries: null,
    _shifts: null,
    _expenses: null,
    _commissions: null,
    _meltingBatches: null,
    _assayRecords: null,
    _polishingBatches: null,
    _returns: null,

    /* ─── Accessors مع lazy-loading ──────────────────────────────── */

    /**
     * قراءة المخزون (يُولَّد مرة واحدة)
     * @param {boolean} [force=false] — إعادة التوليد
     * @returns {Array}
     */
    getInventory(force = false) {
      if (!this._inventory || force) {
        this._inventory = generateInventory(1200, 1337);
        console.log(`[Demo] Generated ${this._inventory.length} inventory items`);
      }
      return this._inventory;
    },

    /**
     * قراءة الفواتير
     * @param {boolean} [force=false]
     * @returns {Array}
     */
    getSales(force = false) {
      if (!this._sales || force) {
        this._sales = generateSales(this.getInventory(), 500, 90);
        console.log(`[Demo] Generated ${this._sales.length} sales`);
      }
      return this._sales;
    },

    /**
     * قراءة قيود دفتر الأستاذ
     * @param {boolean} [force=false]
     * @returns {Array}
     */
    getLedgerEntries(force = false) {
      if (!this._ledgerEntries || force) {
        this._ledgerEntries = generateLedgerEntries(200, 180);
        console.log(`[Demo] Generated ${this._ledgerEntries.length} ledger entries`);
      }
      return this._ledgerEntries;
    },

    /**
     * قراءة الورديات
     * @param {boolean} [force=false]
     * @returns {Array}
     */
    getShifts(force = false) {
      if (!this._shifts || force) {
        this._shifts = generateShifts(30);
        console.log(`[Demo] Generated ${this._shifts.length} shifts`);
      }
      return this._shifts;
    },

    /**
     * قراءة المصروفات
     * @param {boolean} [force=false]
     * @returns {Array}
     */
    getExpenses(force = false) {
      if (!this._expenses || force) {
        this._expenses = generateExpenses(80, 90);
        console.log(`[Demo] Generated ${this._expenses.length} expenses`);
      }
      return this._expenses;
    },

    /**
     * قراءة العمولات
     * @param {boolean} [force=false]
     * @returns {Array}
     */
    getCommissions(force = false) {
      if (!this._commissions || force) {
        this._commissions = generateCommissions();
        console.log(`[Demo] Generated ${this._commissions.length} commissions`);
      }
      return this._commissions;
    },

    /**
     * قراءة دفعات السبك
     * @param {boolean} [force=false]
     * @returns {Array}
     */
    getMeltingBatches(force = false) {
      if (!this._meltingBatches || force) {
        this._meltingBatches = generateMeltingBatches(25);
        console.log(`[Demo] Generated ${this._meltingBatches.length} melting batches`);
      }
      return this._meltingBatches;
    },

    /**
     * قراءة سجلات الششني
     * @param {boolean} [force=false]
     * @returns {Array}
     */
    getAssayRecords(force = false) {
      if (!this._assayRecords || force) {
        this._assayRecords = generateAssayRecords(40);
        console.log(`[Demo] Generated ${this._assayRecords.length} assay records`);
      }
      return this._assayRecords;
    },

    /**
     * قراءة دفعات الصيانة
     * @param {boolean} [force=false]
     * @returns {Array}
     */
    getPolishingBatches(force = false) {
      if (!this._polishingBatches || force) {
        this._polishingBatches = generatePolishingBatches(30);
        console.log(`[Demo] Generated ${this._polishingBatches.length} polishing batches`);
      }
      return this._polishingBatches;
    },

    /**
     * قراءة المرتجعات
     * @param {boolean} [force=false]
     * @returns {Array}
     */
    getReturns(force = false) {
      if (!this._returns || force) {
        this._returns = generateReturns(this.getInventory(), 50);
        console.log(`[Demo] Generated ${this._returns.length} returns`);
      }
      return this._returns;
    },

    /* ─── Static data (لا تحتاج توليد) ───────────────────────────── */

    getBranches() {
      return BRANCHES;
    },

    getManufacturers() {
      return MANUFACTURERS;
    },

    getSuppliers() {
      return SUPPLIERS;
    },

    getCustomers() {
      return CUSTOMERS;
    },

    getSalespeople() {
      return SALESPEOPLE;
    },

    getWorkshops() {
      return WORKSHOPS;
    },

    getAssayOffices() {
      return ASSAY_OFFICES;
    },

    getExpenseCategories() {
      return EXPENSE_CATEGORIES;
    },

    getCategories() {
      return CATEGORIES;
    },

    /* ─── Bulk generation ─────────────────────────────────────────── */

    /**
     * توليد كل البيانات دفعة واحدة
     * @returns {Object}
     */
    generateAll() {
      return {
        branches: BRANCHES,
        manufacturers: MANUFACTURERS,
        suppliers: SUPPLIERS,
        customers: CUSTOMERS,
        salespeople: SALESPEOPLE,
        inventory: this.getInventory(),
        sales: this.getSales(),
        ledgerEntries: this.getLedgerEntries(),
        shifts: this.getShifts(),
        expenses: this.getExpenses(),
        commissions: this.getCommissions(),
        meltingBatches: this.getMeltingBatches(),
        assayRecords: this.getAssayRecords(),
        polishingBatches: this.getPolishingBatches(),
        returns: this.getReturns(),
      };
    },

    /**
     * تفريغ كل البيانات المُولَّدة
     */
    clearCache() {
      this._inventory = null;
      this._sales = null;
      this._ledgerEntries = null;
      this._shifts = null;
      this._expenses = null;
      this._commissions = null;
      this._meltingBatches = null;
      this._assayRecords = null;
      this._polishingBatches = null;
      this._returns = null;
      console.log('[Demo] Cache cleared');
    },

    /**
     * إعادة توليد كل شيء ببذرة جديدة
     * @param {number} [seed=Date.now()]
     */
    regenerate(seed) {
      this.clearCache();
      _inventoryCache = null;

      if (seed) {
        this._inventory = generateInventory(1200, seed);
      } else {
        this.getInventory(true);
      }

      console.log('[Demo] Regenerated all data');
      return this.generateAll();
    },

    /* ─── Statistics ──────────────────────────────────────────────── */

    /**
     * إحصائيات سريعة عن البيانات التجريبية
     * @returns {Object}
     */
    stats() {
      const inv = this.getInventory();
      const byStatus = {};
      const byKarat = {};

      inv.forEach(item => {
        byStatus[item.status] = (byStatus[item.status] || 0) + 1;
        byKarat[item.karat] = (byKarat[item.karat] || 0) + 1;
      });

      return {
        branches: BRANCHES.length,
        manufacturers: MANUFACTURERS.length,
        suppliers: SUPPLIERS.length,
        customers: CUSTOMERS.length,
        salespeople: SALESPEOPLE.length,
        inventory: inv.length,
        inventoryByStatus: byStatus,
        inventoryByKarat: byKarat,
        sales: this.getSales().length,
        ledgerEntries: this.getLedgerEntries().length,
        shifts: this.getShifts().length,
        expenses: this.getExpenses().length,
        commissions: this.getCommissions().length,
        meltingBatches: this.getMeltingBatches().length,
        assayRecords: this.getAssayRecords().length,
        polishingBatches: this.getPolishingBatches().length,
        returns: this.getReturns().length,
      };
    },

    /* ─── Search/Filter helpers ───────────────────────────────────── */

    /**
     * البحث في المخزون
     * @param {string} query
     * @param {Object} [filters={}]
     * @returns {Array}
     */
    searchInventory(query, filters = {}) {
      const { karat, status, branch_id, category, limit = 200 } = filters;
      let rows = this.getInventory();

      if (karat) rows = rows.filter(i => Number(i.karat) === Number(karat));
      if (status) rows = rows.filter(i => i.status === status);
      if (branch_id) rows = rows.filter(i => i.branch_id === branch_id);
      if (category) rows = rows.filter(i => i.category === category);

      if (query) {
        const q = query.toLowerCase();
        rows = rows.filter(i =>
          i.sku.toLowerCase().includes(q) ||
          i.manufacturer_name.toLowerCase().includes(q) ||
          i.category.toLowerCase().includes(q)
        );
      }

      return rows.slice(0, limit);
    },

    /**
     * فاتورة بالمعرف
     * @param {string} id
     * @returns {Object|null}
     */
    getSaleById(id) {
      return this.getSales().find(s => s.id === id) || null;
    },

    /**
     * فاتورة برقم الفاتورة
     * @param {string} saleNo
     * @returns {Object|null}
     */
    getSaleByNo(saleNo) {
      return this.getSales().find(s =>
        s.sale_no === saleNo || s.invoice_no === saleNo
      ) || null;
    },

    /**
     * فواتير بتاريخ معين
     * @param {string} dateISO — YYYY-MM-DD
     * @returns {Array}
     */
    getSalesByDate(dateISO) {
      return this.getSales().filter(s =>
        s.created_at.slice(0, 10) === dateISO
      );
    },

    /**
     * فواتير بفرع معين
     * @param {string} branchId
     * @returns {Array}
     */
    getSalesByBranch(branchId) {
      return this.getSales().filter(s => s.branch_id === branchId);
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §14 · EXPORT
     ═════════════════════════════════════════════════════════════════════ */
  GMS.Demo = DemoData;

  /* ─── Static data معرّضة أيضاً ─────────────────────────────────── */
  GMS.DEMO_DATA = {
    BRANCHES,
    MANUFACTURERS,
    SUPPLIERS,
    CUSTOMERS,
    SALESPEOPLE,
    WORKSHOPS,
    ASSAY_OFFICES,
    EXPENSE_CATEGORIES,
    CATEGORIES,
  };

  /* ─── Utilities معرّضة للاستخدام الخارجي ──────────────────────── */
  GMS.DemoUtils = {
    generateInventory,
    generateSales,
    generateLedgerEntries,
    generateShifts,
    generateExpenses,
    generateCommissions,
    generateMeltingBatches,
    generateAssayRecords,
    generatePolishingBatches,
    generateReturns,
    mulberry32,
  };

  /* ─── Backward-compat alias ──────────────────────────────────── */
  GMS.DEMO_BRANCHES = BRANCHES;
  GMS.DEMO_MANUFACTURERS = MANUFACTURERS;
  GMS.DEMO_SUPPLIERS = SUPPLIERS;
  GMS.DEMO_CUSTOMERS = CUSTOMERS;
  GMS.DEMO_SALESPEOPLE = SALESPEOPLE;

  /* ═════════════════════════════════════════════════════════════════════
     §15 · LOADED CONFIRMATION
     ═════════════════════════════════════════════════════════════════════ */
  console.log(
    '%c📊 Demo Data loaded · 9 entity types',
    'color:#a55a00;font-weight:800;font-size:12px;padding:1px 5px;' +
    'background:#fdf3e3;border-radius:4px;'
  );

  console.log(
    `%c🏢 ${BRANCHES.length} branches · ${MANUFACTURERS.length} manufacturers · ` +
    `${SUPPLIERS.length} suppliers · 1,200 inventory items · 500 sales`,
    'color:#6b7a95;font-weight:700;font-size:11px;'
  );

  /* ═════════════════════════════════════════════════════════════════════
     ✅ js/08-demo.js — نهاية الملف
     ═════════════════════════════════════════════════════════════════════ */

})();