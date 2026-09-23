/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ENTERPRISE — js/01-config.js
   الثوابت العامة، الأدوار، الصلاحيات، وإعدادات النظام
   ✅ النسخة v4: 3 عيارات قياسية + دعم عيارات مخصصة (Custom Karat)
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ═════════════════════════════════════════════════════════════════════
     تهيئة الحاوية الرئيسية
     ═════════════════════════════════════════════════════════════════════ */
  window.GMS = window.GMS || {};

  const GMS = window.GMS;

  /* ═════════════════════════════════════════════════════════════════════
     §1 · نظام العيارات (CARAT SYSTEM)
     ─────────────────────────────────────────────────────────────────────
     ✅ 3 عيارات قياسية: 24K, 21K, 18K
     ✅ v4: دعم عيارات مخصصة لأي قيمة بين 300 و 999
     
     🔑 الفلسفة الجديدة:
        المصدر الوحيد للحقيقة = purity_ratio
        العيار = مجرد واجهة عرض
        
        • 21K       → purity_ratio = 0.8750 (قياسي)
        • سبيكة 888 → purity_ratio = 0.8880 (مخصص)
        • سبيكة 999 → purity_ratio = 0.9990 (مخصص)
        • سويسري    → purity_ratio = 0.9999 (مخصص)
     ═════════════════════════════════════════════════════════════════════ */

  /* ─── العيارات القياسية ─── */
  GMS.KARAT_RATIO = Object.freeze({
    24: 1.0000,
    21: 0.8750,
    18: 0.7500,
  });

  /* ترتيب تنازلي للعرض */
  GMS.KARAT_ORDER = Object.freeze([24, 21, 18]);

  /* ألوان العيارات للمخططات */
  GMS.KARAT_COLORS = Object.freeze({
    24: '#c8a24a',
    21: '#9c7726',
    18: '#6b7a95',
  });

  /* أسماء العيارات بالعربي */
  GMS.KARAT_LABELS = Object.freeze({
    24: 'عيار 24',
    21: 'عيار 21',
    18: 'عيار 18',
  });

  /* ✅ v4: إعدادات العيارات المخصصة */
  GMS.CUSTOM_KARAT = Object.freeze({
    enabled: true,
    label: 'مخصص',
    labelEn: 'Custom',
    icon: 'sliders-horizontal',
    color: '#8b6b2e',
    description: 'عيار من 300 إلى 999 (سبائك، مستورد، كسر)',
  });

  /* ✅ v4: حدود العيار المخصص */
  GMS.KARAT_LIMITS = Object.freeze({
    min: 300,
    max: 999,
    step: 1,
    minPurity: 0.3000,
    maxPurity: 1.0000,
    purityStep: 0.0001,
  });

  /* ═════════════════════════════════════════════════════════════════════
     §2 · الأدوار الوظيفية (ROLES)
     ═════════════════════════════════════════════════════════════════════ */
  GMS.ROLES = Object.freeze({
    SUPER_ADMIN: {
      key: 'SUPER_ADMIN',
      label: 'مدير عام',
      labelEn: 'Super Admin',
      icon: 'crown',
      color: 'gold',
      level: 100,
      description: 'صلاحيات كاملة على جميع الفروع والإعدادات',
    },
    BRANCH_MANAGER: {
      key: 'BRANCH_MANAGER',
      label: 'مدير فرع',
      labelEn: 'Branch Manager',
      icon: 'briefcase',
      color: 'violet',
      level: 80,
      description: 'إدارة فرع واحد مع الموظفين والمخزون',
    },
    ACCOUNTANT: {
      key: 'ACCOUNTANT',
      label: 'محاسب',
      labelEn: 'Accountant',
      icon: 'calculator',
      color: 'info',
      level: 60,
      description: 'مراجعة الفواتير، دفتر الأستاذ، تقارير الأرباح',
    },
    DATA_ENTRY: {
      key: 'DATA_ENTRY',
      label: 'مدخل بيانات',
      labelEn: 'Data Entry',
      icon: 'clipboard-list',
      color: 'teal',
      level: 40,
      description: 'إدخال الأصناف والمخزون بدون صلاحيات البيع',
    },
    SALESPERSON: {
      key: 'SALESPERSON',
      label: 'بائع',
      labelEn: 'Salesperson',
      icon: 'user-circle',
      color: 'success',
      level: 20,
      description: 'بيع الأصناف المتوفرة وإنشاء فواتير بحالة PENDING',
    },
  });

  GMS.ROLE_KEYS = Object.freeze([
    'SUPER_ADMIN',
    'BRANCH_MANAGER',
    'ACCOUNTANT',
    'DATA_ENTRY',
    'SALESPERSON',
  ]);

  /* ═════════════════════════════════════════════════════════════════════
     §3 · صلاحيات كل دور (PERMISSIONS MATRIX)
     ═════════════════════════════════════════════════════════════════════ */
  GMS.PERMISSIONS = Object.freeze({
    SUPER_ADMIN: Object.freeze([
      'viewDashboard',
      'viewEmployees',
      'manageEmployees',
      'viewRoles',
      'viewAuditLog',
      'deleteAuditLog',
      'viewAllBranches',
      'viewAllSales',
      'createSale',
      'approveSale',
      'editSale',
      'deleteSale',
      'viewInventory',
      'editInventory',
      'deleteInventory',
      'viewInventoryCost',
      'viewSuppliers',
      'editSupplierLedger',
      'viewCustomers',
      'editCustomers',
      'editPriceBoard',
      'viewVault',
      'viewProfitReport',
      'closeShift',
      'reopenShift',
      'editGeneralLedger',
      'manageBranches',
      'manageSettings',
      'manageManufacturers',
      'exportData',
      'impersonateUser',
      'viewRealtime',
      'manageRealtime',
      'viewReports',
      'manageBackups',
    ]),

    BRANCH_MANAGER: Object.freeze([
      'viewDashboard',
      'viewEmployees',
      'manageEmployees',
      'viewRoles',
      'viewAuditLog',
      'viewAllSales',
      'createSale',
      'approveSale',
      'editSale',
      'viewInventory',
      'editInventory',
      'viewInventoryCost',
      'viewSuppliers',
      'viewCustomers',
      'editCustomers',
      'viewVault',
      'closeShift',
      'reopenShift',
      'manageManufacturers',
      'exportData',
      'viewRealtime',
      'viewReports',
    ]),

    ACCOUNTANT: Object.freeze([
      'viewDashboard',
      'viewRoles',
      'viewAuditLog',
      'viewAllSales',
      'approveSale',
      'editSale',
      'viewInventory',
      'viewInventoryCost',
      'viewSuppliers',
      'editSupplierLedger',
      'viewCustomers',
      'viewProfitReport',
      'viewVault',
      'editGeneralLedger',
      'exportData',
      'viewRealtime',
      'viewReports',
    ]),

    DATA_ENTRY: Object.freeze([
      'viewDashboard',
      'viewRoles',
      'viewInventory',
      'editInventory',
      'viewSuppliers',
      'viewCustomers',
      'exportData',
    ]),

    SALESPERSON: Object.freeze([
      'viewDashboard',
      'viewRoles',
      'viewInventory',
      'viewOwnInventory',
      'createSale',
      'viewOwnSales',
      'closeShift',
    ]),
  });

  /* ═════════════════════════════════════════════════════════════════════
     §4 · تسميات الصلاحيات بالعربي (PERMISSION LABELS)
     ═════════════════════════════════════════════════════════════════════ */
  GMS.PERM_LABELS = Object.freeze({
    viewDashboard:      'عرض لوحة التحكم',
    viewEmployees:      'عرض الموظفين',
    manageEmployees:    'إدارة الموظفين (إضافة/تعديل/حذف)',
    viewRoles:          'عرض مصفوفة الصلاحيات',
    viewAuditLog:       'عرض سجل الحركات',
    deleteAuditLog:     'حذف سجلات التدقيق',
    impersonateUser:    'انتحال هوية مستخدم',
    manageBranches:     'إدارة الفروع',
    manageSettings:     'إدارة إعدادات النظام',
    manageManufacturers:'إدارة المصانع والماركات',
    manageBackups:      'إدارة النسخ الاحتياطي',

    viewAllBranches:    'عرض جميع الفروع',
    viewAllSales:       'عرض جميع الفواتير',
    viewOwnSales:       'عرض فواتيره فقط',
    createSale:         'إنشاء فاتورة بيع',
    approveSale:        'اعتماد الفواتير المعلقة',
    editSale:           'تعديل الفواتير',
    deleteSale:         'حذف الفواتير',

    viewInventory:      'عرض المخزون',
    viewOwnInventory:   'عرض مخزون فرعه فقط',
    editInventory:      'تعديل المخزون',
    deleteInventory:    'حذف المخزون',
    viewInventoryCost:  'عرض تكلفة المخزون',
    viewVault:          'عرض الخزنة',

    viewSuppliers:      'عرض الموردين',
    editSupplierLedger: 'تعديل دفتر الموردين',
    viewCustomers:      'عرض العملاء',
    editCustomers:      'تعديل العملاء',

    viewProfitReport:   'عرض تقارير الأرباح',
    editPriceBoard:     'تعديل أسعار السوق',
    editGeneralLedger:  'تعديل دفتر الأستاذ',
    closeShift:         'إغلاق الوردية',
    reopenShift:        'إعادة فتح وردية',
    exportData:         'تصدير البيانات',
    viewReports:        'عرض التقارير',

    viewRealtime:       'عرض التحديثات المباشرة',
    manageRealtime:     'إدارة اشتراكات Realtime',
  });

  /* ═════════════════════════════════════════════════════════════════════
     §5 · مجموعات الصلاحيات
     ═════════════════════════════════════════════════════════════════════ */
  GMS.PERM_GROUPS = Object.freeze([
    {
      title: 'النظام والأمان',
      icon: 'shield',
      perms: [
        'viewDashboard', 'viewRoles', 'viewAuditLog', 'deleteAuditLog',
        'manageEmployees', 'manageBranches', 'manageSettings',
        'manageManufacturers', 'impersonateUser', 'manageBackups',
      ],
    },
    {
      title: 'المبيعات والفواتير',
      icon: 'receipt',
      perms: [
        'viewAllSales', 'viewOwnSales', 'createSale',
        'approveSale', 'editSale', 'deleteSale',
      ],
    },
    {
      title: 'المخزون والخزنة',
      icon: 'gem',
      perms: [
        'viewInventory', 'viewOwnInventory', 'editInventory',
        'deleteInventory', 'viewInventoryCost', 'viewVault',
      ],
    },
    {
      title: 'الموردين والعملاء',
      icon: 'users',
      perms: [
        'viewSuppliers', 'editSupplierLedger',
        'viewCustomers', 'editCustomers',
      ],
    },
    {
      title: 'المحاسبة والتقارير',
      icon: 'book-open',
      perms: [
        'viewProfitReport', 'editPriceBoard', 'editGeneralLedger',
        'closeShift', 'reopenShift', 'exportData', 'viewReports',
      ],
    },
    {
      title: 'التحديثات المباشرة',
      icon: 'radio',
      perms: ['viewRealtime', 'manageRealtime'],
    },
  ]);

  /* ═════════════════════════════════════════════════════════════════════
     §6 · حالات الأصناف (ITEM STATUSES)
     ═════════════════════════════════════════════════════════════════════ */
  GMS.ITEM_STATUS = Object.freeze({
    IN_STOCK: {
      key: 'IN_STOCK', label: 'متوفر', labelEn: 'In Stock',
      cls: 'pill-green', icon: 'check-circle-2',
    },
    RESERVED: {
      key: 'RESERVED', label: 'محجوز', labelEn: 'Reserved',
      cls: 'pill-amber', icon: 'clock',
    },
    SOLD: {
      key: 'SOLD', label: 'مباع', labelEn: 'Sold',
      cls: 'pill-gray', icon: 'badge-check',
    },
    RETURNED: {
      key: 'RETURNED', label: 'مرتجع', labelEn: 'Returned',
      cls: 'pill-blue', icon: 'undo-2',
    },
    MELTED: {
      key: 'MELTED', label: 'مصهور', labelEn: 'Melted',
      cls: 'pill-red', icon: 'flame',
    },
    RETURNED_TO_SUPPLIER: {
      key: 'RETURNED_TO_SUPPLIER', label: 'مرتجع للمورد',
      labelEn: 'Returned to Supplier',
      cls: 'pill-blue', icon: 'package-minus',
    },
    TRANSFERRED: {
      key: 'TRANSFERRED', label: 'محوَّل', labelEn: 'Transferred',
      cls: 'pill-violet', icon: 'arrow-right-left',
    },
  });

  /* ═════════════════════════════════════════════════════════════════════
     §7 · تصنيفات الأصناف (ITEM CATEGORIES)
     ═════════════════════════════════════════════════════════════════════ */
  GMS.CATEGORIES = Object.freeze([
    'خاتم', 'سلسلة', 'أسورة', 'حلق', 'توكة', 'دبلة',
    'قلادة', 'تعليقة', 'غوايش', 'كوليه', 'سبيكة', 'ليرة',
    'كسر مُشترى', 'أخرى',
  ]);

  /* ═════════════════════════════════════════════════════════════════════
     §8 · طرق الدفع (PAYMENT METHODS)
     ═════════════════════════════════════════════════════════════════════ */
  GMS.PAYMENT_METHODS = Object.freeze({
    cash:     { key: 'cash',     label: 'نقدي',            labelEn: 'Cash',         icon: 'banknote' },
    card:     { key: 'card',     label: 'بطاقة',           labelEn: 'Card',         icon: 'credit-card' },
    instapay: { key: 'instapay', label: 'إنستاباي',        labelEn: 'Instapay',     icon: 'smartphone' },
    wallet:   { key: 'wallet',   label: 'محفظة إلكترونية', labelEn: 'E-Wallet',     icon: 'smartphone' },
    credit:   { key: 'credit',   label: 'آجل',             labelEn: 'Credit',       icon: 'clock' },
    gold:     { key: 'gold',     label: 'مقايضة ذهب',      labelEn: 'Gold Exchange',icon: 'scale' },
  });

  /* ═════════════════════════════════════════════════════════════════════
     §9 · أنواع الفواتير (INVOICE TYPES)
     ═════════════════════════════════════════════════════════════════════ */
  GMS.INVOICE_TYPES = Object.freeze({
    sale:            { key: 'sale',            label: 'فاتورة بيع',     labelEn: 'Sale Invoice',     icon: 'receipt',             prefix: 'INV' },
    purchase:        { key: 'purchase',        label: 'فاتورة شراء',    labelEn: 'Purchase Invoice', icon: 'truck',               prefix: 'PUR' },
    return_sale:     { key: 'return_sale',     label: 'مرتجع بيع',      labelEn: 'Sales Return',     icon: 'rotate-ccw',          prefix: 'RET' },
    return_purchase: { key: 'return_purchase', label: 'مرتجع شراء',     labelEn: 'Purchase Return',  icon: 'undo-2',              prefix: 'RTP' },
    exchange:        { key: 'exchange',        label: 'استبدال',        labelEn: 'Exchange',         icon: 'arrow-right-left',    prefix: 'EXC' },
    adjustment:      { key: 'adjustment',      label: 'تسوية مخزون',    labelEn: 'Stock Adjustment', icon: 'sliders-horizontal',   prefix: 'ADJ' },
  });

  /* ═════════════════════════════════════════════════════════════════════
     §10 · حالات الفواتير (INVOICE STATUSES)
     ═════════════════════════════════════════════════════════════════════ */
  GMS.INVOICE_STATUS = Object.freeze({
    PENDING_APPROVAL: { key: 'PENDING_APPROVAL', label: 'قيد الموافقة', labelEn: 'Pending Approval', cls: 'pill-amber', icon: 'clock' },
    APPROVED:         { key: 'APPROVED',         label: 'مُعتمد',        labelEn: 'Approved',         cls: 'pill-green', icon: 'check-circle-2' },
    REJECTED:         { key: 'REJECTED',         label: 'مرفوض',         labelEn: 'Rejected',         cls: 'pill-red',   icon: 'x-circle' },
    COMPLETED:        { key: 'COMPLETED',        label: 'مكتمل',         labelEn: 'Completed',        cls: 'pill-blue',  icon: 'badge-check' },
    CANCELLED:        { key: 'CANCELLED',        label: 'ملغى',          labelEn: 'Cancelled',        cls: 'pill-gray',  icon: 'ban' },
  });

  /* ═════════════════════════════════════════════════════════════════════
     §11 · حدود الخسس الطبيعية (LOSS TOLERANCES)
     ═════════════════════════════════════════════════════════════════════ */
  GMS.DEFAULT_TOLERANCES = Object.freeze({
    melting:   { naturalMin: 0.10, naturalMax: 0.30, warningMax: 0.50, label: 'سبك الكسر',      unit: '%' },
    polishing: { naturalMin: 0.05, naturalMax: 0.15, warningMax: 0.25, label: 'التحميم والجلخ', unit: '%' },
    assaying:  { naturalMin: -0.005, naturalMax: 0.005, warningMax: 0.015, label: 'الششني',       unit: 'pt' },
    repair:    { naturalMin: 0.00, naturalMax: 0.50, warningMax: 1.00, label: 'الصيانة',          unit: '%' },
  });

  /* ═════════════════════════════════════════════════════════════════════
     §12 · مستويات خطورة الخسس (LOSS SEVERITY)
     ═════════════════════════════════════════════════════════════════════ */
  GMS.LOSS_SEVERITY = Object.freeze({
    natural:    { key: 'natural',    label: 'طبيعي',              cls: 'pill-green', icon: 'check-circle-2', color: 'success' },
    low:        { key: 'low',        label: 'أقل من الطبيعي',     cls: 'pill-blue',  icon: 'alert-circle',   color: 'info' },
    warning:    { key: 'warning',    label: 'يستدعي المراقبة',    cls: 'pill-amber', icon: 'alert-triangle', color: 'warn' },
    suspicious: { key: 'suspicious', label: 'خسس غير طبيعي',     cls: 'pill-red',   icon: 'shield-alert',   color: 'danger' },
  });

  /* ═════════════════════════════════════════════════════════════════════
     §13 · سياسة الإرجاع (RETURN POLICY)
     ═════════════════════════════════════════════════════════════════════ */
  GMS.RETURN_POLICY = Object.freeze({
    fullRefundDays: 14,
    partialRefundDays: 30,
    partialRefundPct: 90,
    noReturnBeyondDays: 30,
    creditWalletExpiryDays: 180,
  });

  /* ═════════════════════════════════════════════════════════════════════
     §14 · طرق الاسترجاع (REFUND METHODS)
     ═════════════════════════════════════════════════════════════════════ */
  GMS.REFUND_METHODS = Object.freeze({
    cash:     { key: 'cash',     label: 'نقدي من الصندوق',     labelEn: 'Cash Refund',    icon: 'banknote',    color: 'success' },
    card:     { key: 'card',     label: 'إرجاع على البطاقة',   labelEn: 'Card Refund',    icon: 'credit-card', color: 'info' },
    instapay: { key: 'instapay', label: 'إنستاباي',            labelEn: 'Instapay Refund',icon: 'smartphone',  color: 'violet' },
    credit:   { key: 'credit',   label: 'رصيد متجر للعميل',    labelEn: 'Store Credit',   icon: 'wallet',      color: 'teal' },
  });

  /* ═════════════════════════════════════════════════════════════════════
     §15 · طرق شراء الكسر (BUYBACK MODES)
     ═════════════════════════════════════════════════════════════════════ */
  GMS.BUYBACK_MODES = Object.freeze({
    cash:   { key: 'cash',   label: 'دفع نقدي فوري',      labelEn: 'Immediate Cash', icon: 'banknote', color: 'success' },
    credit: { key: 'credit', label: 'رصيد متجر للعميل',   labelEn: 'Store Credit',   icon: 'wallet',   color: 'teal' },
  });

  /* ═════════════════════════════════════════════════════════════════════
     §16 · أنواع الصيانة (POLISHING SERVICES)
     ═════════════════════════════════════════════════════════════════════ */
  GMS.POLISHING_SERVICES = Object.freeze({
    acid:     { key: 'acid',     label: 'تحميم حامض',         labelEn: 'Acid Dip',          icon: 'test-tube' },
    buffing:  { key: 'buffing',  label: 'جلخ وتلميع',         labelEn: 'Buffing & Polish',  icon: 'sparkles' },
    polish:   { key: 'polish',   label: 'تلميع فقط',          labelEn: 'Polish Only',       icon: 'sparkle' },
    combined: { key: 'combined', label: 'تحميم + جلخ + تلميع', labelEn: 'Combined',          icon: 'wand-2' },
  });

  /* ═════════════════════════════════════════════════════════════════════
     §17 · أنواع قيود دفتر الأستاذ (LEDGER ENTRY TYPES)
     ═════════════════════════════════════════════════════════════════════ */
  GMS.LEDGER_ENTRY_TYPES = Object.freeze({
    gold_received:      { key: 'gold_received',      label: 'استلام ذهب',     color: 'et-gold-in' },
    gold_payment:       { key: 'gold_payment',       label: 'تسليم ذهب',      color: 'et-gold-out' },
    cash_payment:       { key: 'cash_payment',       label: 'سداد نقدي',      color: 'et-cash-out' },
    cash_received:      { key: 'cash_received',      label: 'استلام نقدي',    color: 'et-cash-out' },
    workmanship:        { key: 'workmanship',        label: 'مصنعية',          color: 'et-cash-in' },
    scrap_settlement:   { key: 'scrap_settlement',   label: 'تسوية كسر',      color: 'et-gold-in' },
    adjustment:         { key: 'adjustment',         label: 'تسوية يدوية',    color: 'et-adjust' },
    opening:            { key: 'opening',            label: 'رصيد افتتاحي',   color: 'et-neutral' },
    return_to_supplier: { key: 'return_to_supplier', label: 'مرتجع للمورد',   color: 'et-gold-out' },
  });

  /* ═════════════════════════════════════════════════════════════════════
     §18 · فئات المصروفات (EXPENSE CATEGORIES)
     ═════════════════════════════════════════════════════════════════════ */
  GMS.EXPENSE_CATEGORIES = Object.freeze([
    { key: 'rent',         label: 'إيجار',       icon: 'home',           color: 'violet' },
    { key: 'electricity',  label: 'كهرباء',      icon: 'zap',            color: 'warn' },
    { key: 'water',        label: 'مياه',        icon: 'droplets',       color: 'info' },
    { key: 'salaries',     label: 'رواتب',       icon: 'users',          color: 'primary' },
    { key: 'commissions',  label: 'عمولات',      icon: 'hand-coins',     color: 'success' },
    { key: 'maintenance',  label: 'صيانة',       icon: 'wrench',         color: 'danger' },
    { key: 'marketing',    label: 'تسويق',       icon: 'megaphone',      color: 'teal' },
    { key: 'transport',    label: 'نقل',         icon: 'truck',          color: 'primary' },
    { key: 'supplies',     label: 'مستلزمات',    icon: 'package',        color: 'violet' },
    { key: 'insurance',    label: 'تأمينات',     icon: 'shield',         color: 'info' },
    { key: 'taxes',        label: 'ضرائب',       icon: 'receipt',        color: 'danger' },
    { key: 'other',        label: 'أخرى',        icon: 'more-horizontal',color: 'muted' },
  ]);

  /* ═════════════════════════════════════════════════════════════════════
     §19 · دليل الحسابات (CHART OF ACCOUNTS)
     ═════════════════════════════════════════════════════════════════════ */
  GMS.ACCOUNT_TYPES = Object.freeze({
    ASSET:     { key: 'ASSET',     label: 'أصول',           sign: 'dr', color: 'info' },
    LIABILITY: { key: 'LIABILITY', label: 'خصوم',           sign: 'cr', color: 'danger' },
    EQUITY:    { key: 'EQUITY',    label: 'حقوق ملكية',     sign: 'cr', color: 'violet' },
    REVENUE:   { key: 'REVENUE',   label: 'إيرادات',        sign: 'cr', color: 'success' },
    COGS:      { key: 'COGS',      label: 'تكلفة المبيعات', sign: 'dr', color: 'warn' },
    EXPENSE:   { key: 'EXPENSE',   label: 'مصروفات',        sign: 'dr', color: 'danger' },
  });

  GMS.CHART_OF_ACCOUNTS = Object.freeze([
    { code: '1010', name_ar: 'النقدية بالصندوق',   account_type: 'ASSET' },
    { code: '1020', name_ar: 'النقدية بالبنك',     account_type: 'ASSET' },
    { code: '1100', name_ar: 'مخزون الذهب',        account_type: 'ASSET' },
    { code: '1150', name_ar: 'خزنة الذهب (Vault)', account_type: 'ASSET' },
    { code: '1200', name_ar: 'العملاء (مدينون)',   account_type: 'ASSET' },
    { code: '2010', name_ar: 'الموردون (دائنون)',  account_type: 'LIABILITY' },
    { code: '2020', name_ar: 'أرصدة ذهب مستحقة',   account_type: 'LIABILITY' },
    { code: '2050', name_ar: 'ضرائب مستحقة',       account_type: 'LIABILITY' },
    { code: '3010', name_ar: 'رأس المال',          account_type: 'EQUITY' },
    { code: '3020', name_ar: 'الأرباح المحتجزة',   account_type: 'EQUITY' },
    { code: '4010', name_ar: 'إيرادات مبيعات الذهب', account_type: 'REVENUE' },
    { code: '4020', name_ar: 'إيرادات المصنعية',   account_type: 'REVENUE' },
    { code: '4090', name_ar: 'إيرادات أخرى',       account_type: 'REVENUE' },
    { code: '5010', name_ar: 'تكلفة الذهب المبيع', account_type: 'COGS' },
    { code: '6010', name_ar: 'إيجارات',            account_type: 'EXPENSE' },
    { code: '6020', name_ar: 'كهرباء ومياه',       account_type: 'EXPENSE' },
    { code: '6030', name_ar: 'رواتب وأجور',        account_type: 'EXPENSE' },
    { code: '6040', name_ar: 'عمولات مبيعات',      account_type: 'EXPENSE' },
    { code: '6050', name_ar: 'صيانة وإصلاح',       account_type: 'EXPENSE' },
    { code: '6060', name_ar: 'تسويق وإعلان',       account_type: 'EXPENSE' },
    { code: '6090', name_ar: 'مصروفات أخرى',       account_type: 'EXPENSE' },
  ]);

  /* ═════════════════════════════════════════════════════════════════════
     §20 · مفاتيح LocalStorage (STORAGE KEYS)
     ═════════════════════════════════════════════════════════════════════ */
  GMS.LS_KEYS = Object.freeze({
    CONFIG_URL:        'gms.supabase.config.url',
    CONFIG_KEY:        'gms.supabase.config.key',
    THEME:             'gms.theme',
    LANG:              'gms.lang',
    SOUND:             'gms.sound',
    SESSION:           'gms.session',
    COLUMNS:           'gms.inv.columns',
    PRICE24:           'gms.acct.price24',
    BUY_MARGIN:        'gms.buyback.margin',
    TOLERANCES:        'gms.loss.tolerances',
    CACHE_PREFIX:      'gms.cache.',
    CACHE_MANUFACTURERS:'manufacturers',
    CACHE_WORKMANSHIP: 'workmanship',
    CACHE_PROFILE:     'profile',
    CACHE_PREFERENCES: 'preferences',
    CACHE_PRICE:       'price',
    CACHE_KARAT_BOARD: 'karatBoard',
    CACHE_BRANCHES:    'branches',
    CACHE_TTL_SUFFIX:  '.ttl',
    MELTING_RECORDS:   'gms.loss.melting',
    ASSAY_RECORDS:     'gms.loss.assay',
    POLISH_RECORDS:    'gms.loss.polish',
    WALLET:            'gms.rt.wallet',
    FEED:              'gms.rt.feed',
    AUDIT:             'gms.audit',
    SYNC_LOG:          'gms.sync.log',
    MANUFACTURERS:     'gms.manufacturers.v2',
  });

  /* ═════════════════════════════════════════════════════════════════════
     §21 · إعدادات IndexedDB (INDEXEDDB CONFIG)
     ═════════════════════════════════════════════════════════════════════ */
  GMS.IDB_CONFIG = Object.freeze({
    DB_NAME: 'gms_cache_v1',
    DB_VERSION: 1,
    STORE_INVENTORY: 'inventory',
    STORE_QUEUE: 'offline_queue',
    STORE_META: 'metadata',
    STORE_PENDING_ITEMS: 'pending_items',
    BATCH_SIZE: 500,
    MAX_INVENTORY: 50000,
  });

  /* ═════════════════════════════════════════════════════════════════════
     §22 · إعدادات المزامنة (SYNC CONFIG)
     ═════════════════════════════════════════════════════════════════════ */
  GMS.SYNC_CONFIG = Object.freeze({
    CACHE_TTL_MS: 12 * 60 * 60 * 1000,
    REFRESH_DEBOUNCE_MS: 600,
    FEED_MAX_ITEMS: 60,
    RECONNECT_BASE_MS: 1500,
    RECONNECT_MAX_MS: 30000,
    PUSH_BATCH_SIZE: 50,
    FULL_SYNC_BATCH: 500,
    DELTA_SYNC_BATCH: 500,
  });

  /* ═════════════════════════════════════════════════════════════════════
     §23 · إعدادات POS (POS CONFIG)
     ═════════════════════════════════════════════════════════════════════ */
  GMS.POS_CONFIG = Object.freeze({
    SCAN_TIMEOUT_MS: 180,
    SCANNER_MAX_GAP: 70,
    MIN_SKU_LENGTH: 3,
    MAX_CART_ITEMS: 500,
    BEEP_VOLUME: 0.15,
    BEEP_FREQ_SUCCESS: 1180,
    BEEP_FREQ_ERROR: 220,
    BEEP_FREQ_COMPLETE: 1560,
  });

  /* ═════════════════════════════════════════════════════════════════════
     §24 · إعدادات الطباعة (PRINT CONFIG)
     ═════════════════════════════════════════════════════════════════════ */
  GMS.PRINT_CONFIG = Object.freeze({
    LABEL_WIDTH_58MM: 58,
    LABEL_WIDTH_80MM: 80,
    DEFAULT_LABEL_WIDTH: 58,
    QR_SIZE_PX: 320,
    QR_CORRECTION: 'M',
    A4_PAGE_WIDTH_MM: 210,
    A4_PAGE_HEIGHT_MM: 297,
  });

  /* ═════════════════════════════════════════════════════════════════════
     §25 · إعدادات الأمان (SECURITY CONFIG)
     ═════════════════════════════════════════════════════════════════════ */
  GMS.SECURITY_CONFIG = Object.freeze({
    MIN_PASSWORD_LENGTH: 8,
    MAX_TEXT_LENGTH: 1000,
    MAX_NOTES_LENGTH: 5000,
    MAX_FILENAME_LENGTH: 200,
    FORBIDDEN_TAGS: ['script', 'iframe', 'object', 'embed', 'link', 'style', 'meta', 'base', 'form'],
    FORBIDDEN_ATTRS: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'onchange', 'onsubmit', 'onkeydown', 'onkeyup'],
    ALLOWED_PROTOCOLS: ['http:', 'https:', 'mailto:', 'tel:'],
    SESSION_TIMEOUT_MS: 8 * 60 * 60 * 1000,
  });

  /* ═════════════════════════════════════════════════════════════════════
     §26 · إعدادات المخططات (CHARTS CONFIG)
     ═════════════════════════════════════════════════════════════════════ */
  GMS.CHART_CONFIG = Object.freeze({
    PALETTE: ['#c8a24a', '#1c4fd8', '#b3261e', '#6b3fa0', '#0f7a43', '#a55a00', '#0e7490', '#3d4a63', '#e8c874', '#9c7726'],
    DEFAULT_FONT: 'Cairo',
    DEFAULT_HEIGHT: 300,
    DEFAULT_TENSION: 0.35,
    DEFAULT_BORDER_WIDTH: 2.5,
    ANIMATION_DURATION: 500,
    TOOLTIP_BG: 'rgba(15,23,41,.94)',
    TOOLTIP_TEXT: '#e8eefb',
  });

  /* ═════════════════════════════════════════════════════════════════════
     §27 · إعدادات عامة (APP CONFIG)
     ═════════════════════════════════════════════════════════════════════ */
  GMS.APP_CONFIG = Object.freeze({
    NAME: 'Gold MS Enterprise',
    NAME_AR: 'نظام إدارة الذهب',
    VERSION: '1.0.1',
    BUILD: '20260923',
    DEFAULT_LOCALE: 'ar-EG',
    DEFAULT_CURRENCY: 'EGP',
    DEFAULT_KARAT: 21,
    DEFAULT_PRICE_24: 4500,
    DEFAULT_BRANCH_ID: 'br-1',
    DATE_FORMAT: 'ar-EG',
    LOG_LEVEL: 'info',
    DEBUG: false,
  });

  /* ═════════════════════════════════════════════════════════════════════
     §28 · تكوين Supabase (SUPABASE CONFIG)
     ═════════════════════════════════════════════════════════════════════ */
  GMS.SUPABASE_CONFIG = Object.freeze({
    TABLES: {
      INVENTORY: 'inventory',
      SALES: 'sales',
      SALE_ITEMS: 'sale_items',
      SUPPLIERS: 'suppliers',
      CUSTOMERS: 'customers',
      ENTITY_LEDGER: 'entity_ledger',
      PRICE_BOARD: 'price_board',
      MANUFACTURERS: 'manufacturers',
      BRANCHES: 'branches',
      PROFILES: 'profiles',
      AUDIT_LOGS: 'audit_logs',
      SHIFTS: 'shifts',
      RETURNS: 'returns',
      MELTING_BATCHES: 'melting_batches',
      POLISHING_BATCHES: 'polishing_batches',
      ASSAY_RECORDS: 'assay_records',
      CREDIT_WALLET: 'credit_wallet',
      GENERAL_LEDGER: 'general_ledger',
      BRANCH_EXPENSES: 'branch_expenses',
      COMMISSIONS: 'salesperson_commissions',
      REPAIRS: 'repairs',
    },
    REALTIME_CHANNELS: {
      INVENTORY: 'inventory-changes',
      SALES: 'sales-changes',
      LEDGER: 'ledger-changes',
      SHIFTS: 'shifts-changes',
      PRICE_BOARD: 'price-changes',
      EXEC_DASHBOARD: 'exec-dashboard',
    },
    INVENTORY_COLUMNS: [
      'id', 'sku', 'category', 'karat', 'custom_karat', 'purity_ratio',
      'is_custom_karat',
      'weight_grams', 'stone_weight', 'net_weight', 'pure_weight',
      'workmanship_per_gram', 'workmanship_value', 'gold_value',
      'total_cost', 'price_24', 'status', 'quantity', 'notes',
      'branch_id', 'manufacturer_id', 'created_at', 'updated_at',
    ],
    MAX_ROWS_PER_QUERY: 10000,
    MAX_ROWS_PER_BATCH: 500,
  });

  /* ═════════════════════════════════════════════════════════════════════
     §29 · بيانات الفروع الافتراضية (DEMO BRANCHES)
     ═════════════════════════════════════════════════════════════════════ */
  GMS.DEFAULT_BRANCHES = Object.freeze([
    { id: 'br-1', code: 'CAI01', name: 'فرع القاهرة — الصاغة', phone: '0223456789' },
    { id: 'br-2', code: 'ALX01', name: 'فرع الإسكندرية',        phone: '0345678901' },
    { id: 'br-3', code: 'TNT01', name: 'فرع طنطا',              phone: '0434567890' },
  ]);

  /* ═════════════════════════════════════════════════════════════════════
     §30 · طرق تسعير المصانع (MANUFACTURER PRICING MODES)
     ═════════════════════════════════════════════════════════════════════ */
  GMS.PRICING_MODES = Object.freeze({
    letters: { key: 'letters', label: 'حسب الأحرف',     labelEn: 'By Letters',  icon: 'letter-text', description: 'مصنع بيحدد سعره بالحروف: أ، ب، جـ، د...', color: 'primary' },
    colors:  { key: 'colors',  label: 'حسب الألوان',    labelEn: 'By Colors',   icon: 'palette',     description: 'مصنع بيحدد سعره بالألوان: أحمر، أزرق، ذهبي...', color: 'violet' },
    items:   { key: 'items',   label: 'حسب نوع القطعة', labelEn: 'By Item Type',icon: 'shapes',      description: 'مصنع بيحدد سعره حسب نوع القطعة: سلسلة، خاتم...', color: 'info' },
    fixed:   { key: 'fixed',   label: 'سعر ثابت',       labelEn: 'Fixed Rate',  icon: 'equal',       description: 'مصنع بيعطي سعر واحد ثابت لكل القطع', color: 'success' },
  });

  /* قائمة الألوان الجاهزة */
  GMS.PRICING_COLORS = Object.freeze([
    { key: 'red',     label: 'أحمر',    hex: '#dc2626' },
    { key: 'blue',    label: 'أزرق',    hex: '#2563eb' },
    { key: 'green',   label: 'أخضر',    hex: '#16a34a' },
    { key: 'yellow',  label: 'أصفر',    hex: '#facc15' },
    { key: 'black',   label: 'أسود',    hex: '#0a0a0a' },
    { key: 'white',   label: 'أبيض',    hex: '#f5f5f5' },
    { key: 'gold',    label: 'ذهبي',    hex: '#c8a24a' },
    { key: 'silver',  label: 'فضي',     hex: '#94a3b8' },
    { key: 'rose',    label: 'وردي',    hex: '#f472b6' },
    { key: 'violet',  label: 'بنفسجي',  hex: '#7c3aed' },
    { key: 'orange',  label: 'برتقالي', hex: '#ea580c' },
    { key: 'brown',   label: 'بني',     hex: '#78350f' },
    { key: 'teal',    label: 'تركوازي', hex: '#14b8a6' },
    { key: 'navy',    label: 'كحلي',    hex: '#1e3a8a' },
  ]);

  /* أحرف عربية جاهزة */
  GMS.PRICING_LETTERS = Object.freeze([
    'أ', 'ب', 'ج', 'د', 'هـ', 'و', 'ز', 'ح', 'ط', 'ي',
    'ك', 'ل', 'م', 'ن', 'س', 'ع', 'ف', 'ص', 'ق', 'ر',
    'ش', 'ت', 'ث', 'خ', 'ذ', 'ض', 'ظ', 'غ',
  ]);

  /* ═════════════════════════════════════════════════════════════════════
     §31 · بيانات المصانع الافتراضية (DEMO MANUFACTURERS)
     ═════════════════════════════════════════════════════════════════════ */
  GMS.DEFAULT_MANUFACTURERS = Object.freeze([
    {
      id: 'manu-1', code: 'A', letter: 'أ', name: 'مصنع النيل للذهب', phone: '',
      pricingMode: 'letters',
      letterRates: [
        { letter: 'أ', rate: 120 }, { letter: 'ب', rate: 145 },
        { letter: 'ج', rate: 165 }, { letter: 'د', rate: 185 },
      ],
      colorRates: [], itemRates: [], fixedRate: null,
      purchaseRate: 120, saleRate: 150, rate: 120,
      isActive: true, notes: '',
    },
    {
      id: 'manu-2', code: 'B', letter: 'ب', name: 'الشرق للمجوهرات', phone: '',
      pricingMode: 'colors',
      letterRates: [],
      colorRates: [
        { color: 'red',   rate: 100 }, { color: 'blue',  rate: 130 },
        { color: 'green', rate: 160 }, { color: 'gold',  rate: 200 },
      ],
      itemRates: [], fixedRate: null,
      purchaseRate: 130, saleRate: 165, rate: 145,
      isActive: true, notes: '',
    },
    {
      id: 'manu-3', code: 'C', letter: 'ج', name: 'الماسة الذهبية', phone: '',
      pricingMode: 'items',
      letterRates: [], colorRates: [],
      itemRates: [
        { category: 'خاتم',   rate: 150 }, { category: 'دبلة',   rate: 180 },
        { category: 'سلسلة',  rate: 100 }, { category: 'أسورة',  rate: 130 },
        { category: 'حلق',    rate: 140 }, { category: 'توكة',   rate: 110 },
        { category: 'قلادة',  rate: 160 }, { category: 'تعليقة', rate: 120 },
      ],
      fixedRate: null,
      purchaseRate: 100, saleRate: 130, rate: 100,
      isActive: true, notes: '',
    },
    {
      id: 'manu-4', code: 'D', letter: 'د', name: 'الفتح جولد', phone: '',
      pricingMode: 'fixed',
      letterRates: [], colorRates: [], itemRates: [],
      fixedRate: 160,
      purchaseRate: 160, saleRate: 195, rate: 160,
      isActive: true, notes: 'سعر ثابت لكل الأصناف',
    },
    {
      id: 'manu-5', code: 'L', letter: 'ل', name: 'لازوردي', phone: '',
      pricingMode: 'letters',
      letterRates: [
        { letter: 'ل', rate: 180 }, { letter: 'م', rate: 200 },
        { letter: 'ن', rate: 220 }, { letter: 'ص', rate: 250 },
      ],
      colorRates: [], itemRates: [], fixedRate: null,
      purchaseRate: 200, saleRate: 240, rate: 200,
      isActive: true, notes: '',
    },
    {
      id: 'manu-6', code: 'M', letter: 'م', name: 'مصر للذهب والمجوهرات', phone: '',
      pricingMode: 'items',
      letterRates: [], colorRates: [],
      itemRates: [
        { category: 'خاتم',   rate: 135 }, { category: 'دبلة',   rate: 155 },
        { category: 'سلسلة',  rate: 110 }, { category: 'أسورة',  rate: 125 },
        { category: 'حلق',    rate: 140 }, { category: 'قلادة',  rate: 145 },
      ],
      fixedRate: null,
      purchaseRate: 135, saleRate: 165, rate: 135,
      isActive: true, notes: '',
    },
  ]);

  /* ═════════════════════════════════════════════════════════════════════
     §32 · مصفوفة المصنعية (WORKMANSHIP MATRIX) — للعيارات القياسية
     ═════════════════════════════════════════════════════════════════════ */
  GMS.WORKMANSHIP_MATRIX = Object.freeze([
    { karat: 24, min: 40,  max: 80,  default: 55 },
    { karat: 21, min: 90,  max: 250, default: 140 },
    { karat: 18, min: 100, max: 280, default: 165 },
  ]);

  /* ═════════════════════════════════════════════════════════════════════
     §33 · أسماء الأشخاص الوهمية (DEMO SALESPEOPLE)
     ═════════════════════════════════════════════════════════════════════ */
  GMS.DEMO_SALESPEOPLE = Object.freeze([
    'أحمد محمود', 'سارة عبد الله', 'محمد إبراهيم', 'مصطفى سامي',
    'نور الهدى', 'خالد مصطفى', 'منى علي', 'هاني لطفي',
    'ياسمين أحمد', 'كريم الرائد', 'عمرو الشامي', 'دينا عبد الرحمن',
  ]);

  /* ═════════════════════════════════════════════════════════════════════
     §34 · أسماء الورش (DEMO WORKSHOPS)
     ═════════════════════════════════════════════════════════════════════ */
  GMS.DEMO_WORKSHOPS = Object.freeze([
    'ورشة الصاغة الرئيسية',
    'ورشة النور للجلخ',
    'ورشة التحميم الفني',
    'مسبكة القاهرة',
    'ورشة الأمانة',
  ]);

  /* ═════════════════════════════════════════════════════════════════════
     §35 · أسماء مكاتب الششني (ASSAY OFFICES)
     ═════════════════════════════════════════════════════════════════════ */
  GMS.DEMO_ASSAY_OFFICES = Object.freeze([
    'مكتب الششني المعتمد — القاهرة',
    'مكتب المعايرة المركزي',
    'مختبر الششني للذهب',
    'مسبكة الصاغة للفحص',
  ]);

  /* ═════════════════════════════════════════════════════════════════════
     §36 · الفئات المُحجوبة عن البائع (MASKED FIELDS)
     ═════════════════════════════════════════════════════════════════════ */
  GMS.SALESPERSON_MASKED_FIELDS = Object.freeze([
    'cost_price', 'total_cost', 'gold_value', 'workmanship_value',
    'purchase_workmanship', 'profit_margin', 'purchase_price',
  ]);

  /* ═════════════════════════════════════════════════════════════════════
     §37 · تعيينات أنواع الحركة (AUDIT ACTIONS)
     ═════════════════════════════════════════════════════════════════════ */
  GMS.AUDIT_ACTIONS = Object.freeze({
    CREATE:      { key: 'CREATE',      label: 'إنشاء',       icon: 'plus-circle',   cls: 'create' },
    UPDATE:      { key: 'UPDATE',      label: 'تعديل',       icon: 'pencil',        cls: 'update' },
    DELETE:      { key: 'DELETE',      label: 'حذف',         icon: 'trash-2',       cls: 'delete' },
    LOGIN:       { key: 'LOGIN',       label: 'تسجيل دخول',  icon: 'log-in',        cls: 'login' },
    LOGOUT:      { key: 'LOGOUT',      label: 'خروج',        icon: 'log-out',       cls: 'login' },
    APPROVE:     { key: 'APPROVE',     label: 'اعتماد',      icon: 'check-circle-2',cls: 'approve' },
    REJECT:      { key: 'REJECT',      label: 'رفض',         icon: 'x-circle',      cls: 'reject' },
    SHIFT_CLOSE: { key: 'SHIFT_CLOSE', label: 'إغلاق وردية', icon: 'lock',          cls: 'shift' },
    VIEW:        { key: 'VIEW',        label: 'عرض',         icon: 'eye',           cls: 'update' },
    EXPORT:      { key: 'EXPORT',      label: 'تصدير',       icon: 'download',      cls: 'update' },
    IMPORT:      { key: 'IMPORT',      label: 'استيراد',     icon: 'upload',        cls: 'update' },
    RETURN:      { key: 'RETURN',      label: 'مرتجع',       icon: 'rotate-ccw',    cls: 'update' },
    BUYBACK:     { key: 'BUYBACK',     label: 'شراء كسر',    icon: 'recycle',       cls: 'update' },
    SCAN:        { key: 'SCAN',        label: 'مسح صنف',     icon: 'scan-line',     cls: 'update' },
    SYNC:        { key: 'SYNC',        label: 'مزامنة',      icon: 'refresh-cw',    cls: 'update' },
  });

  /* ═════════════════════════════════════════════════════════════════════
     §38 · دوال مساعدة للتكوين (HELPERS)
     ═════════════════════════════════════════════════════════════════════ */

  /* Local round — لأن 02-utils.js لسه مش اتحمّل */
  function _round(v, d) {
    const p = Math.pow(10, d == null ? 4 : d);
    return Math.round((Number(v) + Number.EPSILON) * p) / p;
  }

  /* ─── العيار القياسي ─── */
  GMS.karatIndex = function (karat) {
    return GMS.KARAT_ORDER.indexOf(Number(karat));
  };

  /* ✅ v4: دالة karatRatio المطوّرة — تقبل العيار القياسي أو المخصص */
  GMS.karatRatio = function (karat) {
    const num = Number(karat);

    /* عيار قياسي */
    if (GMS.KARAT_RATIO[num] !== undefined) {
      return GMS.KARAT_RATIO[num];
    }

    /* عيار مخصص بين 300 و 999 */
    if (isFinite(num) && num >= GMS.KARAT_LIMITS.min && num <= GMS.KARAT_LIMITS.max) {
      return _round(num / 1000, 4);
    }

    return 0;
  };

  /* ✅ v4: karatColor — يضيف لون افتراضي للعيارات المخصصة */
  GMS.karatColor = function (karat) {
    const num = Number(karat);
    if (GMS.KARAT_COLORS[num]) return GMS.KARAT_COLORS[num];
    if (isFinite(num) && num >= GMS.KARAT_LIMITS.min && num <= GMS.KARAT_LIMITS.max) {
      return GMS.CUSTOM_KARAT.color;
    }
    return '#6b7a95';
  };

  /* ✅ v4: karatLabel — يدعم المخصص */
  GMS.karatLabel = function (karat) {
    const num = Number(karat);
    if (GMS.KARAT_LABELS[num]) return GMS.KARAT_LABELS[num];
    if (isFinite(num) && num >= GMS.KARAT_LIMITS.min && num <= GMS.KARAT_LIMITS.max) {
      return `عيار ${num}`;
    }
    return `عيار ${karat}`;
  };

  /* ✅ v4: isValidKarat — يقبل القياسي والمخصص */
  GMS.isValidKarat = function (karat) {
    const num = Number(karat);
    if (GMS.KARAT_ORDER.includes(num)) return true;
    if (isFinite(num) && num >= GMS.KARAT_LIMITS.min && num <= GMS.KARAT_LIMITS.max) {
      return true;
    }
    return false;
  };

  /* ✅ v4: isValidPurity — للتحقق من نسبة النقاء */
  GMS.isValidPurity = function (purity) {
    const p = Number(purity);
    return isFinite(p)
      && p >= GMS.KARAT_LIMITS.minPurity
      && p <= GMS.KARAT_LIMITS.maxPurity;
  };

  /* ✅ v4: resolveKarat — يترجم أي مُدخل إلى كائن موحّد
     يقبل:
       • 21 (رقم قياسي)
       • 888 (رقم مخصص)
       • "21K" أو "888" أو "0.8880" (نص)
       • { karat, custom_karat, purity_ratio, is_custom } (كائن)
     يرجّع:
       { karat, custom_karat, purity_ratio, is_custom, display } */
  GMS.resolveKarat = function (input) {
    /* ─── كائن جاهز ─── */
    if (input && typeof input === 'object') {
      if (input.is_custom || (input.custom_karat != null && input.karat == null)) {
        const customNum = Number(input.custom_karat) || Math.round((Number(input.purity_ratio) || 0) * 1000);
        const purity = Number(input.purity_ratio) || (customNum / 1000);
        return {
          karat: null,
          custom_karat: customNum,
          purity_ratio: _round(purity, 4),
          is_custom: true,
          display: customNum ? String(customNum) : 'مخصص',
        };
      }
      const k = Number(input.karat);
      if (GMS.KARAT_RATIO[k] !== undefined) {
        return {
          karat: k,
          custom_karat: null,
          purity_ratio: GMS.KARAT_RATIO[k],
          is_custom: false,
          display: `${k}K`,
        };
      }
    }

    /* ─── نص ─── */
    if (typeof input === 'string') {
      const s = input.trim().toUpperCase().replace(/\s+/g, '');
      if (!s) return GMS.resolveKarat(21);

      /* 21K أو 21 أو 888 */
      const karatMatch = s.match(/^(\d{1,4})K?$/);
      if (karatMatch) {
        const num = Number(karatMatch[1]);

        /* قياسي */
        if (GMS.KARAT_RATIO[num] !== undefined) {
          return {
            karat: num,
            custom_karat: null,
            purity_ratio: GMS.KARAT_RATIO[num],
            is_custom: false,
            display: `${num}K`,
          };
        }

        /* مخصص */
        if (num >= GMS.KARAT_LIMITS.min && num <= GMS.KARAT_LIMITS.max) {
          return {
            karat: null,
            custom_karat: num,
            purity_ratio: _round(num / 1000, 4),
            is_custom: true,
            display: String(num),
          };
        }
      }

      /* 0.8880 أو .8880 */
      const purityMatch = s.match(/^0?\.(\d+)$/);
      if (purityMatch) {
        const purity = Number(s);
        if (GMS.isValidPurity(purity)) {
          const customNum = Math.round(purity * 1000);
          return {
            karat: null,
            custom_karat: customNum,
            purity_ratio: _round(purity, 4),
            is_custom: true,
            display: String(customNum),
          };
        }
      }
    }

    /* ─── رقم مباشر ─── */
    const num = Number(input);
    if (isFinite(num)) {
      /* قياسي */
      if (GMS.KARAT_RATIO[num] !== undefined) {
        return {
          karat: num,
          custom_karat: null,
          purity_ratio: GMS.KARAT_RATIO[num],
          is_custom: false,
          display: `${num}K`,
        };
      }

      /* مخصص */
      if (num >= GMS.KARAT_LIMITS.min && num <= GMS.KARAT_LIMITS.max) {
        return {
          karat: null,
          custom_karat: num,
          purity_ratio: _round(num / 1000, 4),
          is_custom: true,
          display: String(num),
        };
      }
    }

    /* ─── fallback ─── */
    return {
      karat: 21,
      custom_karat: null,
      purity_ratio: 0.8750,
      is_custom: false,
      display: '21K',
    };
  };

  /* ✅ v4: karatFromPurity — ترجمة عكسية من purity إلى karat كائن */
  GMS.karatFromPurity = function (purity) {
    const p = Number(purity);
    if (!isFinite(p)) return GMS.resolveKarat(21);

    /* قياسي؟ */
    for (const k of GMS.KARAT_ORDER) {
      if (Math.abs(GMS.KARAT_RATIO[k] - p) < 0.0001) {
        return {
          karat: k,
          custom_karat: null,
          purity_ratio: GMS.KARAT_RATIO[k],
          is_custom: false,
          display: `${k}K`,
        };
      }
    }

    /* مخصص */
    const customNum = Math.round(p * 1000);
    return {
      karat: null,
      custom_karat: customNum,
      purity_ratio: _round(p, 4),
      is_custom: true,
      display: String(customNum),
    };
  };

  /* ✅ v4: formatKarat — نص موحّد للعرض
     يقبل كائن أو قيمة مباشرة */
  GMS.formatKarat = function (item) {
    if (!item) return '—';

    /* كائن موحّد */
    if (typeof item === 'object') {
      if (item.is_custom) {
        const num = item.custom_karat || Math.round((item.purity_ratio || 0) * 1000);
        return `${num} (مخصص)`;
      }
      if (item.karat != null) return `${item.karat}K`;
      if (item.custom_karat != null) return `${item.custom_karat} (مخصص)`;
      if (item.purity_ratio != null) {
        return GMS.formatKarat(GMS.karatFromPurity(item.purity_ratio));
      }
      return '—';
    }

    /* قيمة مباشرة */
    const num = Number(item);
    if (GMS.KARAT_RATIO[num] !== undefined) return `${num}K`;
    if (isFinite(num) && num >= GMS.KARAT_LIMITS.min && num <= GMS.KARAT_LIMITS.max) {
      return `${num} (مخصص)`;
    }
    return '—';
  };

  /* ✅ v4: formatKaratShort — نسخة مختصرة للجداول والتاجات */
  GMS.formatKaratShort = function (item) {
    if (!item) return '—';
    if (typeof item === 'object') {
      if (item.is_custom) {
        return String(item.custom_karat || Math.round((item.purity_ratio || 0) * 1000));
      }
      if (item.karat != null) return `${item.karat}K`;
      if (item.custom_karat != null) return String(item.custom_karat);
      if (item.purity_ratio != null) {
        return GMS.formatKaratShort(GMS.karatFromPurity(item.purity_ratio));
      }
      return '—';
    }
    const num = Number(item);
    if (GMS.KARAT_RATIO[num] !== undefined) return `${num}K`;
    if (isFinite(num) && num >= GMS.KARAT_LIMITS.min && num <= GMS.KARAT_LIMITS.max) {
      return String(num);
    }
    return '—';
  };

  /* ✅ v4: skuKaratCode — الكود الذي يدخل في الـ SKU
     • عيار 21 → "21"
     • سبيكة 888 → "888"
     • لو مش محدد → "21" */
  GMS.skuKaratCode = function (item) {
    if (!item) return '21';

    if (typeof item === 'object') {
      if (item.is_custom && item.custom_karat != null) return String(item.custom_karat);
      if (item.karat != null) return String(item.karat);
      if (item.custom_karat != null) return String(item.custom_karat);
      if (item.purity_ratio != null) return String(Math.round(item.purity_ratio * 1000));
    }

    const num = Number(item);
    if (GMS.KARAT_RATIO[num] !== undefined) return String(num);
    if (isFinite(num) && num >= GMS.KARAT_LIMITS.min && num <= GMS.KARAT_LIMITS.max) {
      return String(num);
    }
    return '21';
  };

  /* ─── أدوار ─── */
  GMS.getRole = function (roleKey) {
    return GMS.ROLES[roleKey] || null;
  };

  GMS.getRolePermissions = function (roleKey) {
    return GMS.PERMISSIONS[roleKey] || [];
  };

  GMS.getPermLabel = function (permKey) {
    return GMS.PERM_LABELS[permKey] || permKey;
  };

  GMS.isValidRole = function (roleKey) {
    return GMS.ROLE_KEYS.includes(roleKey);
  };

  /* ─── حالات ─── */
  GMS.getStatus = function (statusKey) {
    return GMS.ITEM_STATUS[statusKey] || {
      key: statusKey, label: statusKey, cls: 'pill-gray', icon: 'circle',
    };
  };

  GMS.isValidStatus = function (statusKey) {
    return Object.keys(GMS.ITEM_STATUS).includes(statusKey);
  };

  /* ─── فواتير ─── */
  GMS.getInvoiceType = function (typeKey) {
    return GMS.INVOICE_TYPES[typeKey] || null;
  };

  GMS.getPaymentMethod = function (methodKey) {
    return GMS.PAYMENT_METHODS[methodKey] || {
      key: methodKey, label: methodKey, icon: 'wallet',
    };
  };

  /* ─── خسس ─── */
  GMS.getSeverity = function (severityKey) {
    return GMS.LOSS_SEVERITY[severityKey] || GMS.LOSS_SEVERITY.natural;
  };

  /* ─── مصانع ─── */
  GMS.getPricingMode = function (modeKey) {
    return GMS.PRICING_MODES[modeKey] || GMS.PRICING_MODES.fixed;
  };

  GMS.getPricingColor = function (colorKey) {
    return GMS.PRICING_COLORS.find(c => c.key === colorKey) || null;
  };

  GMS.resolveManufacturerRate = function (manufacturer, context) {
    if (!manufacturer) return 0;
    context = context || {};

    switch (manufacturer.pricingMode) {
      case 'letters': {
        const letter = context.letter || '';
        if (!letter) return Number(manufacturer.purchaseRate || 0);
        const entry = (manufacturer.letterRates || []).find(l => l.letter === letter);
        return entry ? Number(entry.rate || 0) : Number(manufacturer.purchaseRate || 0);
      }
      case 'colors': {
        const color = context.color || '';
        if (!color) return Number(manufacturer.purchaseRate || 0);
        const entry = (manufacturer.colorRates || []).find(c => c.color === color);
        return entry ? Number(entry.rate || 0) : Number(manufacturer.purchaseRate || 0);
      }
      case 'items': {
        const category = context.category || '';
        if (!category) return Number(manufacturer.purchaseRate || 0);
        const entry = (manufacturer.itemRates || []).find(i => i.category === category);
        return entry ? Number(entry.rate || 0) : Number(manufacturer.purchaseRate || 0);
      }
      case 'fixed':
      default:
        return Number(manufacturer.fixedRate || manufacturer.purchaseRate || 0);
    }
  };

  /* ═════════════════════════════════════════════════════════════════════
     §39 · حدود النظام (SYSTEM LIMITS)
     ═════════════════════════════════════════════════════════════════════ */
  GMS.LIMITS = Object.freeze({
    MAX_WEIGHT_GRAMS: 100000,
    MAX_PRICE_24: 50000,
    MIN_PRICE_24: 100,
    MAX_PURITY_RATIO: 1.0,
    MIN_PURITY_RATIO: 0.3000,
    MAX_WORKMANSHIP: 5000,
    MIN_WORKMANSHIP: 0,
    MAX_QTY: 10000,
    MAX_DISCOUNT_PCT: 50,
    MAX_LOSS_PCT: 100,
  });

  /* ═════════════════════════════════════════════════════════════════════
     §40 · أنماط التحقق (VALIDATION PATTERNS)
     ✅ v4: SKU يقبل الآن عيارات مخصصة (2-3 أرقام)
     ═════════════════════════════════════════════════════════════════════ */
  GMS.PATTERNS = Object.freeze({
    EMAIL: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
    PHONE_EG: /^01[0125]\d{8}$/,
    /* يدعم: A21-260923-00001، A888-260923-00001، A-260923-00001 */
    SKU: /^[A-Z0-9]{1,4}(\d{2,3})?-\d{6}-\d{3,5}(-\d{3})?$/i,
    INVOICE_NO: /^[A-Z]{2,4}-\d{6,8}-\d{3,5}$/i,
    BATCH_NO: /^(MB|PL|BB|SR|RT)-[A-Z0-9-]+$/i,
    CURRENCY: /^\d+(\.\d{1,2})?$/,
    WEIGHT: /^\d+(\.\d{1,4})?$/,
    UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  });

  /* ═════════════════════════════════════════════════════════════════════
     §41 · الإصدار والبناء (VERSION INFO)
     ═════════════════════════════════════════════════════════════════════ */
  GMS.VERSION_INFO = Object.freeze({
    APP_VERSION: '1.0.1',
    BUILD_NUMBER: '20260923',
    BUILD_DATE: '2026-09-23',
    ENVIRONMENT: 'production',
    AUTHOR: 'Gold MS Team',
  });

  /* ═════════════════════════════════════════════════════════════════════
     §42 · Supabase Credentials
     ═════════════════════════════════════════════════════════════════════ */
  GMS.SUPABASE_CREDENTIALS = Object.freeze({
    URL: '',
    ANON_KEY: '',
  });

  /* ═════════════════════════════════════════════════════════════════════
     §43 · رسالة التحميل (LOADED CONFIRMATION)
     ═════════════════════════════════════════════════════════════════════ */
  console.log(
    '%c📦 Gold MS Config loaded',
    'color:#c8a24a;font-weight:900;font-size:13px;padding:2px 6px;' +
    'background:linear-gradient(135deg,#f0d68c,#9c7726);border-radius:4px;'
  );

  console.log(
    `%c⚙️  Version ${GMS.VERSION_INFO.APP_VERSION} · Build ${GMS.VERSION_INFO.BUILD_NUMBER}`,
    'color:#6b7a95;font-weight:700;font-size:11px;'
  );

  console.log(
    `%c🎯 ${GMS.KARAT_ORDER.length} carats (24K/21K/18K) + CUSTOM (300-999) · ` +
    `${GMS.ROLE_KEYS.length} roles · ${Object.keys(GMS.PERM_LABELS).length} permissions`,
    'color:#1c4fd8;font-weight:700;font-size:11px;'
  );

  console.log(
    `%c🆕 v4: resolveKarat() · formatKarat() · karatFromPurity() · skuKaratCode()`,
    'color:#0f7a43;font-weight:900;font-size:11px;'
  );

  if (GMS.SUPABASE_CREDENTIALS.URL && GMS.SUPABASE_CREDENTIALS.ANON_KEY) {
    console.log(
      '%c🔌 Supabase credentials pre-configured ✓',
      'color:#0f7a43;font-weight:800;font-size:11px;'
    );
  } else {
    console.log(
      '%c⚠️  Supabase credentials not set — use Settings to configure',
      'color:#a55a00;font-weight:700;font-size:11px;'
    );
  }

  /* ═════════════════════════════════════════════════════════════════════
     ✅ js/01-config.js — نهاية الملف
     ═════════════════════════════════════════════════════════════════════ */

})();
