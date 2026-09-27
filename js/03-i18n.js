/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ENTERPRISE — js/03-i18n.js
   نظام الترجمة: عربي (مصري) + إنجليزي مع RTL/LTR والجمع
   ✅ v4: إضافة nav.b2b + role.B2B_REP + B2B translations كاملة
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const GMS = window.GMS = window.GMS || {};

  /* ═════════════════════════════════════════════════════════════════════
     §1 · TRANSLATIONS DICTIONARY
     ═════════════════════════════════════════════════════════════════════ */
  const TRANSLATIONS = {

    /* ═══════════════════════════════════════════════════════════════════
       ARABIC
       ═══════════════════════════════════════════════════════════════════ */
    ar: {

      /* ─── App Shell ──────────────────────────────────────────────── */
      'app.name':                    'نظام إدارة الذهب',
      'app.nameFull':                'نظام إدارة الذهب والمجوهرات',
      'app.tagline':                 'نظام إدارة الذهب والمجوهرات',
      'app.version':                 'الإصدار',
      'app.loading':                 'جارٍ التحميل…',
      'app.ready':                   'النظام جاهز',
      'app.title':                   'نظام إدارة الذهب — Gold MS Enterprise',

      /* ─── Auth & Login ───────────────────────────────────────────── */
      'auth.login':                  'تسجيل الدخول',
      'auth.logout':                 'تسجيل الخروج',
      'auth.email':                  'البريد الإلكتروني',
      'auth.password':               'كلمة المرور',
      'auth.rememberMe':             'تذكرني',
      'auth.forgotPassword':         'نسيت كلمة المرور؟',
      'auth.signIn':                 'دخول',
      'auth.signOut':                'خروج',
      'auth.welcomeBack':            'مرحباً بعودتك',
      'auth.loginSuccess':           'تم تسجيل الدخول بنجاح',
      'auth.loginFailed':            'فشل تسجيل الدخول',
      'auth.invalidCredentials':     'البريد الإلكتروني أو كلمة المرور غير صحيحة',
      'auth.accountDisabled':        'الحساب موقوف، تواصل مع الإدارة',
      'auth.sessionExpired':         'انتهت الجلسة، يرجى تسجيل الدخول مرة أخرى',
      'auth.youAre':                 'أنت مسجَّل الدخول بدور',
      'auth.demoCredentials':        'بيانات تجريبية',
      'auth.logoutConfirm':          'هل تريد تسجيل الخروج؟',

      /* ─── Roles ──────────────────────────────────────────────────── */
      'role.SUPER_ADMIN':            'مدير عام',
      'role.BRANCH_MANAGER':         'مدير فرع',
      'role.ACCOUNTANT':             'محاسب',
      'role.DATA_ENTRY':             'مدخل بيانات',
      'role.SALESPERSON':            'بائع',
      'role.B2B_REP':                'بياع جملة',

      /* ─── Navigation ─────────────────────────────────────────────── */
      'nav.dashboard':               'لوحة التحكم',
      'nav.pos':                     'نقطة البيع',
      'nav.inventory':               'المخزون',
      'nav.suppliers':               'الموردين',
      'nav.customers':               'العملاء',
      'nav.returns':                 'المرتجعات',
      'nav.buyback':                 'شراء كسر',
      'nav.analytics':               'التحليلات',
      'nav.reports':                 'التقارير',
      'nav.loss':                    'إدارة الخسس',
      'nav.melting':                 'سبك الكسر',
      'nav.assaying':                'الششني',
      'nav.polishing':               'التحميم والجلخ',
      'nav.repair':                  'الصيانة والورشة',
      'nav.audit':                   'سجل الحركات',
      'nav.ledger':                  'دفتر الأستاذ',
      'nav.accounting':              'المحاسبة والمالية',
      'nav.wholesale':               'التوريد والجملة',
      'nav.b2b':                     'بياعو الجملة',
      'nav.transfers':               'التحويلات بين الفروع',
      'nav.shifts':                  'الورديات',
      'nav.queue':                   'المزامنة',
      'nav.employees':               'الموظفون',
      'nav.settings':                'الإعدادات',
      'nav.security':                'الأمان',
      'nav.cache':                   'الذاكرة المؤقتة',
      'nav.realtime':                'التحديثات المباشرة',

      /* ─── Actions (Generic) ──────────────────────────────────────── */
      'action.save':                 'حفظ',
      'action.saveChanges':          'حفظ التعديلات',
      'action.cancel':               'إلغاء',
      'action.close':                'إغلاق',
      'action.confirm':              'تأكيد',
      'action.apply':                'تطبيق',
      'action.reset':                'إعادة ضبط',
      'action.clear':                'تفريغ',
      'action.delete':               'حذف',
      'action.edit':                 'تعديل',
      'action.view':                 'عرض',
      'action.details':              'تفاصيل',
      'action.print':                'طباعة',
      'action.export':               'تصدير',
      'action.import':               'استيراد',
      'action.download':             'تنزيل',
      'action.upload':               'رفع',
      'action.refresh':              'تحديث',
      'action.reload':               'إعادة تحميل',
      'action.search':               'بحث',
      'action.filter':               'تصفية',
      'action.sort':                 'ترتيب',
      'action.add':                  'إضافة',
      'action.create':               'إنشاء',
      'action.new':                  'جديد',
      'action.back':                 'رجوع',
      'action.next':                 'التالي',
      'action.previous':             'السابق',
      'action.continue':             'متابعة',
      'action.confirmAndSave':       'تأكيد وحفظ',
      'action.selectAll':            'تحديد الكل',
      'action.deselectAll':          'إلغاء تحديد الكل',
      'action.copy':                 'نسخ',
      'action.copied':               'تم النسخ',
      'action.undo':                 'تراجع',
      'action.retry':                'إعادة المحاولة',
      'action.skip':                 'تخطي',
      'action.optional':             'اختياري',
      'action.required':             'مطلوب',

      /* ─── Statuses ───────────────────────────────────────────────── */
      'status.online':               'متصل',
      'status.offline':              'غير متصل',
      'status.syncing':              'مزامنة…',
      'status.connected':            'متصل',
      'status.disconnected':         'غير متصل',
      'status.error':                'خطأ',
      'status.warning':              'تحذير',
      'status.success':              'نجاح',
      'status.failed':               'فشل',
      'status.pending':              'قيد الانتظار',
      'status.loading':              'جارٍ التحميل…',
      'status.ready':                'جاهز',
      'status.active':               'نشط',
      'status.inactive':             'موقوف',
      'status.completed':            'مكتمل',
      'status.cancelled':            'ملغى',

      /* ─── Item Statuses ──────────────────────────────────────────── */
      'item.status.inStock':         'متوفر',
      'item.status.reserved':        'محجوز',
      'item.status.sold':            'مباع',
      'item.status.returned':        'مرتجع',
      'item.status.melted':          'مصهور',
      'item.status.returnedToSupplier': 'مرتجع للمورد',
      'item.status.transferred':     'محوَّل',

      /* ─── Carats ─────────────────────────────────────────────────── */
      'carat.24':                    'عيار 24',
      'carat.22':                    'عيار 22',
      'carat.21':                    'عيار 21',
      'carat.18':                    'عيار 18',
      'carat.14':                    'عيار 14',
      'carat.short':                 'عيار',
      'carat.purity':                'النقاء',
      'carat.custom':                'عيار مخصص',
      'carat.customHint':            'من 300 إلى 999 (سبائك، مستورد، كسر)',

      /* ─── Manufacturers ──────────────────────────────────────────── */
      'manu.nile':                   'مصنع النيل للذهب',
      'manu.sharq':                  'الشرق للمجوهرات',
      'manu.masat':                  'الماسة الذهبية',
      'manu.fath':                   'الفتح جولد',
      'manu.lazurdi':                'لازوردي',
      'manu.misr':                   'مصر للذهب والمجوهرات',

      /* ─── Categories ─────────────────────────────────────────────── */
      'cat.ring':                    'خاتم',
      'cat.necklace':                'سلسلة',
      'cat.bracelet':                'أسورة',
      'cat.earring':                 'حلق',
      'cat.hairpin':                 'توكة',
      'cat.weddingBand':             'دبلة',
      'cat.pendant':                 'قلادة',
      'cat.charm':                   'تعليقة',
      'cat.cuff':                    'غوايش',
      'cat.collier':                 'كوليه',
      'cat.bar':                     'سبيكة',
      'cat.lire':                    'ليرة',
      'cat.scrap':                   'كسر مُشترى',
      'cat.other':                   'أخرى',

      /* ─── Units ──────────────────────────────────────────────────── */
      'unit.gram':                   'جم',
      'unit.kg':                     'كجم',
      'unit.egp':                    'ج.م',
      'unit.percent':                '%',
      'unit.piece':                  'قطعة',
      'unit.pieces':                 'قطع',
      'unit.invoice':                'فاتورة',
      'unit.invoices':               'فواتير',
      'unit.day':                    'يوم',
      'unit.days':                   'أيام',
      'unit.hour':                   'ساعة',
      'unit.hours':                  'ساعات',
      'unit.minute':                 'دقيقة',
      'unit.minutes':                'دقائق',
      'unit.second':                 'ثانية',
      'unit.seconds':                'ثواني',
      'unit.batch':                  'دفعة',
      'unit.certificate':            'شهادة',

      /* ─── Common Labels ──────────────────────────────────────────── */
      'label.name':                  'الاسم',
      'label.fullName':              'الاسم الكامل',
      'label.email':                 'البريد الإلكتروني',
      'label.phone':                 'الهاتف',
      'label.address':               'العنوان',
      'label.notes':                 'ملاحظات',
      'label.date':                  'التاريخ',
      'label.time':                  'الوقت',
      'label.total':                 'الإجمالي',
      'label.subtotal':              'المجموع الفرعي',
      'label.discount':              'الخصم',
      'label.tax':                   'الضريبة',
      'label.paid':                  'المدفوع',
      'label.remaining':             'المتبقي',
      'label.balance':               'الرصيد',
      'label.quantity':              'الكمية',
      'label.price':                 'السعر',
      'label.unitPrice':             'سعر الوحدة',
      'label.description':           'البيان',
      'label.code':                  'الكود',
      'label.sku':                   'كود التاج',
      'label.category':              'التصنيف',
      'label.branch':                'الفرع',
      'label.status':                'الحالة',
      'label.type':                  'النوع',
      'label.reference':             'المرجع',
      'label.referenceNo':           'رقم المرجع',
      'label.certificateNo':         'رقم الشهادة',
      'label.invoiceNo':             'رقم الفاتورة',
      'label.batchNo':               'رقم الدفعة',
      'label.createdAt':             'تاريخ الإنشاء',
      'label.updatedAt':             'آخر تحديث',
      'label.createdBy':             'بواسطة',
      'label.weight':                'الوزن',
      'label.netWeight':             'الوزن الصافي',
      'label.grossWeight':           'الوزن القائم',
      'label.pureWeight':            'الوزن الصافي (البندق)',
      'label.stoneWeight':           'وزن الأحجار',
      'label.workmanship':           'المصنعية',
      'label.workmanshipPerGram':    'المصنعية / جرام',
      'label.workmanshipValue':      'قيمة المصنعية',
      'label.goldValue':             'قيمة الذهب',
      'label.totalCost':             'الإجمالي',
      'label.purity':                'النقاء',
      'label.testedPurity':          'النقاء المُختبَر',
      'label.claimedPurity':         'النقاء المُدَّعى',
      'label.manufacturer':          'الماركة',
      'label.supplier':              'المورد',
      'label.customer':              'العميل',
      'label.customerName':          'اسم العميل',
      'label.reason':                'السبب',
      'label.method':                'الطريقة',
      'label.performance':           'الأداء',
      'label.rep':                   'البياع',
      'label.repCode':               'كود البياع',
      'label.treasury':              'الخزينة',

      /* ─── Dashboard ──────────────────────────────────────────────── */
      'dash.title':                  'لوحة التحكم التنفيذية',
      'dash.subtitle':               'نظرة شاملة على المخزون والمبيعات والمزامنة',
      'dash.vaultGold':              'رصيد الخزنة (بندق 24K)',
      'dash.vaultValue':             'قيمة الخزنة التقديرية',
      'dash.dailySales':             'مبيعات اليوم',
      'dash.dailyGold':              'ذهب مُباع اليوم',
      'dash.dailyTxns':              'عدد الفواتير',
      'dash.suppliersGold':          'أرصدة ذهب الموردين',
      'dash.suppliersCash':          'أرصدة نقد الموردين',
      'dash.cacheHitRate':           'معدل إصابة الذاكرة',
      'dash.queueCount':             'طابور المزامنة',
      'dash.deadStock':              'رأس مال راكد',
      'dash.systemStatus':           'حالة النظام',
      'dash.caratDistribution':      'توزيع العيارات',
      'dash.recentActivity':         'آخر الأنشطة',
      'dash.branchPerformance':      'الأداء حسب الفرع',
      'dash.topSellers':             'لوحة شرف البائعين',
      'dash.sales24h':               'مبيعات آخر 24 ساعة',
      'dash.sales7d':                'اتجاه المبيعات — 7 أيام',

      /* ─── POS ────────────────────────────────────────────────────── */
      'pos.title':                   'نقطة البيع',
      'pos.subtitle':                'امسح باركود الصنف — بحث فوري من الذاكرة المحلية',
      'pos.scanTitle':               'امسح كود الصنف',
      'pos.scanPlaceholder':         'SKU-XXXX-XXXX-XXXX',
      'pos.scanHint':                'استخدم قارئ الباركود أو اكتب الكود يدوياً ثم Enter',
      'pos.scanStart':               'ابدأ بمسح باركود القطعة',
      'pos.cartEmpty':               'السلة فارغة',
      'pos.cartEmptyHint':           'ابدأ بمسح باركود القطعة',
      'pos.cart':                    'سلة المبيعات',
      'pos.cartItems':               'عنصر',
      'pos.itemFound':               'تم العثور على الصنف',
      'pos.itemNotFound':            'لم يتم العثور على الصنف',
      'pos.itemOutOfStock':          'الصنف غير متوفر',
      'pos.itemAlreadyAdded':        'الصنف موجود في السلة',
      'pos.checkout':                'إتمام الفاتورة',
      'pos.quickCheckout':           'إتمام سريع',
      'pos.saveOffline':             'حفظ محلياً',
      'pos.saleCompleted':           'تمت الفاتورة',
      'pos.saleQueued':              'حُفظت محلياً — في انتظار المزامنة',
      'pos.totalPure':               'إجمالي البندق',
      'pos.totalAmount':             'الإجمالي النهائي',

      /* ─── Inventory ──────────────────────────────────────────────── */
      'inv.title':                   'المخزون',
      'inv.subtitle':                'مخزَّن محلياً في IndexedDB — بحث فوري بدون شبكة',
      'inv.search':                  'بحث',
      'inv.searchPlaceholder':       'SKU، ماركة، تصنيف…',
      'inv.filterKarat':             'العيار',
      'inv.filterStatus':            'الحالة',
      'inv.filterBranch':            'الفرع',
      'inv.filterManufacturer':      'الماركة',
      'inv.filterCategory':          'التصنيف',
      'inv.allKarats':               'كل العيارات',
      'inv.allStatuses':             'كل الحالات',
      'inv.allBranches':             'كل الفروع',
      'inv.allManufacturers':        'كل الماركات',
      'inv.allCategories':           'كل التصنيفات',
      'inv.resultCount':             'نتيجة',
      'inv.noResults':               'لا توجد نتائج مطابقة',
      'inv.noData':                  'لا توجد أصناف في المخزون',
      'inv.export':                  'تصدير Excel',
      'inv.import':                  'استيراد Excel',
      'inv.newItem':                 'صنف جديد',
      'inv.editItem':                'تعديل الصنف',
      'inv.deleteItem':              'حذف الصنف',
      'inv.deleteConfirm':           'سيتم حذف الصنف نهائياً من قاعدة البيانات. لا يمكن التراجع.',
      'inv.pagination.showing':      'عرض',
      'inv.pagination.of':           'من',
      'inv.pagination.page':         'صفحة',
      'inv.pagination.ofTotal':      'من',
      'inv.pagination.goTo':         'انتقل إلى',
      'inv.pagination.perPage':      'لكل صفحة',

      /* ─── Suppliers ──────────────────────────────────────────────── */
      'sup.title':                   'الموردين',
      'sup.subtitle':                'أرصدة مزدوجة: ذهب (بندق 24K) + نقد (EGP)',
      'sup.totalGold':               'إجمالي ذهب الموردين',
      'sup.totalCash':               'إجمالي النقد',
      'sup.count':                   'عدد الموردين',
      'sup.goldBalance':             'رصيد الذهب',
      'sup.cashBalance':             'الرصيد النقدي',
      'sup.owedToSupplier':          'مستحق للمورد',
      'sup.owedToUs':                'مستحق لنا',
      'sup.settled':                 'مُسوّى',
      'sup.statement':               'كشف حساب',
      'sup.transaction':             'حركة جديدة',
      'sup.payment':                 'تسجيل سداد',
      'sup.newSupplier':             'مورد جديد',
      'sup.goldReceived':            'استلام ذهب',
      'sup.goldPayment':             'تسليم ذهب',
      'sup.cashPayment':             'سداد نقدي',
      'sup.cashReceived':            'استلام نقدي',
      'sup.scrapSettlement':         'تسوية كسر',
      'sup.openingBalance':          'رصيد افتتاحي',

      /* ─── Returns ────────────────────────────────────────────────── */
      'ret.title':                   'المرتجعات وشراء الكسر',
      'ret.subtitle':                'مرتجع مبيعات، شراء كسر، مرتجع موردين',
      'ret.salesReturn':             'مرتجع مبيعات',
      'ret.buyback':                 'شراء كسر',
      'ret.supplierReturn':          'مرتجع مورد',
      'ret.scanReturn':              'امسح باركود القطعة المُرجعة',
      'ret.searchItem':              'بحث عن الصنف',
      'ret.originalInvoice':         'الفاتورة الأصلية',
      'ret.daysSinceSale':           'عدد الأيام',
      'ret.refundPct':               'نسبة الاسترجاع',
      'ret.refundAmount':            'المبلغ المُسترد',
      'ret.refundMethod':            'طريقة الاسترجاع',
      'ret.cashRefund':              'نقدي من الصندوق',
      'ret.cardRefund':              'إرجاع على البطاقة',
      'ret.storeCredit':             'رصيد متجر للعميل',
      'ret.returnEligible':          'القطعة مؤهلة للإرجاع',
      'ret.returnNotEligible':       'القطعة غير قابلة للإرجاع',
      'ret.beyondReturnWindow':      'تجاوزت المدة المسموحة',
      'ret.partialReturn':           'إرجاع بنسبة جزئية',
      'ret.confirmReturn':           'تأكيد الإرجاع',
      'ret.returnCompleted':         'تم الإرجاع بنجاح',
      'ret.returnToInventory':       'تم إرجاع القطعة إلى المخزون',

      /* ─── Buyback ────────────────────────────────────────────────── */
      'bb.title':                    'شراء كسر / مستعمل',
      'bb.claimedKarat':             'العيار المُدَّعى',
      'bb.testedPurity':             'النقاء المُختبَر',
      'bb.grossWeight':              'الوزن القائم',
      'bb.stoneWeight':              'وزن الأحجار',
      'bb.netWeight':                'الوزن الصافي',
      'bb.pureWeight':               'البندق 24K',
      'bb.buyRate':                  'سعر الشراء',
      'bb.sellRate':                 'سعر البيع',
      'bb.buyMargin':                'هامش الشراء',
      'bb.totalValue':               'المبلغ المستحق',
      'bb.immediateCash':            'دفع نقدي فوري',
      'bb.issueCredit':              'إصدار رصيد للعميل',
      'bb.confirmPurchase':          'تأكيد الشراء',
      'bb.purchaseCompleted':        'تم شراء الكسر',

      /* ─── Analytics ──────────────────────────────────────────────── */
      'ana.title':                   'التحليلات الذكية',
      'ana.subtitle':                'مخططات تفاعلية لمتابعة الأداء والاتجاهات',
      'ana.salesVsRate':             'حجم المبيعات مقابل سعر الذهب',
      'ana.correlation':             'معامل الارتباط',
      'ana.corrStrong':              'ارتباط قوي',
      'ana.corrModerate':            'ارتباط متوسط',
      'ana.corrWeak':                'ارتباط ضعيف',
      'ana.corrNone':                'لا يوجد ارتباط',
      'ana.correlationHint':         'عند ارتفاع السعر تنخفض الكميات المبيعة',
      'ana.leaderboard':             'لوحة شرف البائعين',
      'ana.fastMoving':              'الأصناف الأكثر حركة',
      'ana.deadStock':               'الركود',
      'ana.deadStockEngine':         'محرّك تشخيص الركود',
      'ana.stale90Days':             'عمر المخزون > 90 يوم',
      'ana.stagnant':                'قطع راكدة',
      'ana.capitalTied':             'رأس مال مجمّد',
      'ana.goldTied':                'ذهب مجمّد',
      'ana.averageAge':              'متوسط العمر',
      'ana.severityWatch':           'مراقبة',
      'ana.severityWarn':            'إنذار',
      'ana.severityCritical':        'حرج',

      /* ─── Loss Management ────────────────────────────────────────── */
      'loss.title':                  'إدارة الخسس',
      'loss.subtitle':               'سبك الكسر، التحميم والجلخ، الششني',
      'loss.melting':                'سبك الكسر',
      'loss.meltingSubtitle':        'تحويل الكسر إلى سبائك',
      'loss.polishing':              'التحميم والجلخ',
      'loss.polishingSubtitle':      'صيانة وتلميع المجوهرات',
      'loss.assaying':               'الششني',
      'loss.assayingSubtitle':       'فحص ومعايرة العيار',
      'loss.scrapPieces':            'قطع الكسر المُدخلة',
      'loss.preMeltWeight':          'الوزن قبل السبك',
      'loss.postMeltWeight':         'الوزن بعد السبك',
      'loss.lossWeight':             'الخسس (بالميللي)',
      'loss.lossPct':                'نسبة الخسس',
      'loss.naturalLoss':            'الخسس الطبيعي',
      'loss.naturalRange':           'النطاق الطبيعي',
      'loss.warningRange':           'يستدعي المراقبة',
      'loss.suspiciousLoss':         'خسس غير طبيعي',
      'loss.suspiciousHint':         'احتمالية تلاعب أو سرقة',
      'loss.toleranceEngine':        'مؤشر الخسس الطبيعي',
      'loss.addPiece':               'إضافة قطعة',
      'loss.saveBatch':              'حفظ دفعة السبك',
      'loss.confirmSuspicious':      'تجاوزت نسبة الخسس حد الأمان. هل تريد المتابعة؟',
      'loss.batchSaved':             'تم حفظ دفعة السبك',
      'loss.recentBatches':          'أحدث الدفعات',
      'loss.operationalLedger':      'دفتر خسس التشغيل',
      'loss.totalLoss':              'إجمالي الخسس',
      'loss.lossValue':              'قيمة الخسس',
      'loss.avgLossPct':             'متوسط نسبة الخسس',
      'loss.suspiciousCount':        'عمليات مشبوهة',
      'loss.serviceType':            'نوع الخدمة',
      'loss.acidDip':                'تحميم حامض',
      'loss.buffing':                'جلخ وتلميع',
      'loss.polishOnly':             'تلميع فقط',
      'loss.combined':               'تحميم + جلخ + تلميع',
      'loss.workshop':               'الورشة',
      'loss.assayerFee':             'رسوم الششني',
      'loss.feeInCash':              'نقدي',
      'loss.feeInGold':              'خصم ذهب',
      'loss.certificateNo':          'رقم شهادة الفحص',
      'loss.assayerName':            'اسم الفاحص',

      /* ─── Repair & Workshop ──────────────────────────────────────── */
      'repair.title':                'الصيانة والورشة والتعديلات',
      'repair.subtitle':             'تصليح · توسيع · تضييق · ركوب فصوص · تلميع',
      'repair.intake':               'الاستلام',
      'repair.workshop':             'الورشة',
      'repair.delivery':             'التسليم',
      'repair.ledger':               'دفتر الصيانة',
      'repair.newIntake':            'استلام قطعة جديدة',
      'repair.service.repair':       'تصليح عام / لحام',
      'repair.service.expanding':    'توسيع مقاس',
      'repair.service.shrinking':    'تضييق مقاس',
      'repair.service.stoneSetting': 'ركوب فصوص',
      'repair.service.polishing':    'تلميع وتحميم',
      'repair.status.received':      'مستلم',
      'repair.status.inProgress':    'قيد الصيانة',
      'repair.status.ready':         'جاهز',
      'repair.status.delivered':     'مُسلَّم',
      'repair.status.cancelled':     'ملغى',

      /* ─── Audit ──────────────────────────────────────────────────── */
      'audit.title':                 'سجل الحركات',
      'audit.subtitle':              'سجل غير قابل للتعديل لكل العمليات الحساسة',
      'audit.action':                'نوع الحركة',
      'audit.user':                  'المستخدم',
      'audit.entity':                'الكيان',
      'audit.description':           'البيان',
      'audit.timestamp':             'التوقيت',
      'audit.ipAddress':             'عنوان IP',
      'audit.noLogs':                'لا توجد حركات مسجَّلة',
      'audit.readOnly':              'سجل للقراءة فقط',
      'audit.appendOnly':            'Append-Only',
      'audit.hidden':                'سجل الحركات محجوب',
      'audit.noPermission':          'لا تملك صلاحية عرض السجل',

      /* ─── Employees ──────────────────────────────────────────────── */
      'emp.title':                   'دليل الموظفين',
      'emp.subtitle':                'إدارة جميع حسابات الموظفين والصلاحيات',
      'emp.directory':               'قائمة الموظفين',
      'emp.newEmployee':             'موظف جديد',
      'emp.editEmployee':            'تعديل الموظف',
      'emp.fullName':                'الاسم الكامل',
      'emp.email':                   'البريد الإلكتروني',
      'emp.phone':                   'رقم الهاتف',
      'emp.role':                    'الدور الوظيفي',
      'emp.branch':                  'الفرع',
      'emp.allBranches':             'كل الفروع',
      'emp.status':                  'الحالة',
      'emp.active':                  'نشط',
      'emp.inactive':                'موقوف',
      'emp.lastLogin':               'آخر دخول',
      'emp.initialPassword':         'كلمة مرور مبدئية',
      'emp.weakPassword':            'كلمة المرور ضعيفة جداً',
      'emp.passwordRequirements':    'يجب أن تحتوي على 8 أحرف، حرف كبير، حرف صغير، رقم، ورمز',
      'emp.onlyAdminsCanManage':     'الإدارة فقط تستطيع إضافة الموظفين',
      'emp.cannotEdit':              'غير مصرح لك بتعديل الموظفين',
      'emp.repId':                   'كود البياع المرتبط',
      'emp.repIdHint':               'للبياعين فقط — يُربط بحساب B2B',

      /* ─── Shifts ─────────────────────────────────────────────────── */
      'shift.title':                 'إغلاق الوردية',
      'shift.subtitle':              'تسوية النقد والذهب اليومية',
      'shift.openingCash':           'الرصيد الافتتاحي',
      'shift.cashSales':             'مبيعات نقدية',
      'shift.cardSales':             'تحصيل بطاقات',
      'shift.cashDeposits':          'إيداعات',
      'shift.cashExpenses':          'مصروفات نقدية',
      'shift.expectedCash':          'الرصيد المتوقع',
      'shift.countedCash':           'النقد المُحصى فعلياً',
      'shift.cashVariance':          'فرق النقد',
      'shift.openingGold':           'رصيد افتتاحي (بندق)',
      'shift.goldReceived':          'ذهب وارد',
      'shift.goldSold':              'ذهب مُباع',
      'shift.expectedGold':          'الرصيد المتوقع (بندق)',
      'shift.countedGold':           'الذهب المُحصى فعلياً',
      'shift.goldVariance':          'فرق الذهب',
      'shift.closeShift':            'إغلاق الوردية',
      'shift.shiftClosed':           'تم إغلاق الوردية بنجاح',
      'shift.shortage':              'عجز',
      'shift.surplus':               'زيادة',
      'shift.confirmClose':          'سيتم إغلاق الوردية وتسجيل الفروقات. لا يمكن التراجع.',
      'shift.notes':                 'ملاحظات الإغلاق',

      /* ─── Cache & Sync ───────────────────────────────────────────── */
      'cache.title':                 'الذاكرة المؤقتة والمزامنة',
      'cache.subtitle':              'نظام ذو طبقتين: LocalStorage + IndexedDB',
      'cache.localStorage':          'LocalStorage · إعدادات سريعة',
      'cache.indexedDB':             'IndexedDB · مخزون ضخم',
      'cache.size':                  'الحجم',
      'cache.keys':                  'عدد المفاتيح',
      'cache.ttl':                   'الوقت المتبقي',
      'cache.clearCache':            'تفريغ الذاكرة',
      'cache.clearConfirm':          'سيتم تفريغ جميع بيانات الذاكرة المؤقتة. متابعة؟',
      'cache.fullSync':              'مزامنة كاملة',
      'cache.deltaSync':             'مزامنة تفاضلية',
      'cache.refreshCache':          'تحديث الذاكرة',
      'cache.syncNow':               'مزامنة الآن',
      'cache.lastSync':              'آخر مزامنة',
      'cache.indexes':               'الفهارس المُنشأة',
      'cache.estimate':              'الحجم التقديري',
      'cache.avgSize':               'متوسط الحجم/صنف',

      /* ─── Sync Queue ─────────────────────────────────────────────── */
      'queue.title':                 'طابور المزامنة',
      'queue.subtitle':              'الفواتير المُنشأة بدون اتصال — تُرفع تلقائياً',
      'queue.pending':               'فواتير معلقة',
      'queue.totalValue':            'القيمة الإجمالية',
      'queue.totalPure':             'الوزن الصافي الإجمالي',
      'queue.syncAll':               'مزامنة الكل',
      'queue.clearQueue':            'تفريغ الطابور',
      'queue.clearConfirm':          'سيتم حذف جميع الفواتير من الطابور نهائياً. متابعة؟',
      'queue.empty':                 'الطابور فارغ',
      'queue.allSynced':             'جميع الفواتير مُزامَنة',
      'queue.syncCompleted':         'تم رفع الطابور',
      'queue.autoSyncHint':          'سيتم رفع الطابور تلقائياً عند عودة الاتصال',

      /* ─── Settings ───────────────────────────────────────────────── */
      'settings.title':              'الإعدادات',
      'settings.subtitle':           'التحكم في التخزين والمزامنة والتفضيلات',
      'settings.general':            'عام',
      'settings.appearance':         'المظهر',
      'settings.language':           'اللغة',
      'settings.theme':              'الوضع',
      'settings.themeLight':         'فاتح',
      'settings.themeDark':          'داكن',
      'settings.sound':              'التنبيهات الصوتية',
      'settings.notifications':      'الإشعارات',
      'settings.sync':               'المزامنة',
      'settings.autoSync':           'مزامنة تلقائية',
      'settings.data':               'البيانات',
      'settings.storage':            'التخزين',
      'settings.supabase':           'Supabase',
      'settings.supabaseUrl':        'رابط المشروع',
      'settings.supabaseKey':        'المفتاح العام',
      'settings.saveConfig':         'حفظ الإعدادات',
      'settings.configSaved':        'تم حفظ الإعدادات',
      'settings.reloadNeeded':       'يجب إعادة تحميل الصفحة',
      'settings.connectionStatus':   'حالة الاتصال',
      'settings.sessionInfo':        'معلومات الجلسة',
      'settings.role':               'الدور',
      'settings.permissions':        'الصلاحيات',
      'settings.anonymousKey':       'مفتاح anon',
      'settings.networkSimulation':  'محاكاة الشبكة',
      'settings.offlineMode':        'وضع عدم الاتصال',
      'settings.offlineHint':        'لاختبار العمل بدون إنترنت',

      /* ─── KPI Labels ─────────────────────────────────────────────── */
      'kpi.vault.label':             'رصيد الخزنة (بندق 24K)',
      'kpi.vault.meta':              'مجمّع من جميع الفروع',
      'kpi.sales.label':             'مبيعات اليوم',
      'kpi.sales.meta':              'نقدي + بطاقات + إنستاباي',
      'kpi.goldSold.label':          'ذهب مُباع اليوم',
      'kpi.goldSold.meta':           'الوزن الصافي المعادل',
      'kpi.txns.label':              'عدد الفواتير',
      'kpi.txns.meta':               'آخر تحديث الآن',
      'kpi.suppliers.label':         'أرصدة ذهب الموردين',
      'kpi.suppliers.meta':          'مستحق للموردين',
      'kpi.cacheHit.label':          'معدل إصابة الذاكرة',
      'kpi.cacheHit.meta':           'البحث المحلي',
      'kpi.queue.label':             'طابور المزامنة',
      'kpi.queue.meta':              'بحاجة للرفع',
      'kpi.deadStock.label':         'رأس مال راكد',
      'kpi.deadStock.meta':          'قطع لم تُبَع من فترة',

      /* ─── Toast Messages ─────────────────────────────────────────── */
      'toast.saved.title':           'تم الحفظ بنجاح',
      'toast.saved.desc':            'تمت العملية بنجاح',
      'toast.deleted.title':         'تم الحذف',
      'toast.deleted.desc':          'تم حذف العنصر نهائياً',
      'toast.error.title':           'حدث خطأ',
      'toast.error.desc':            'تعذّر إتمام العملية، أعد المحاولة',
      'toast.warning.title':         'تحذير',
      'toast.info.title':            'معلومة',
      'toast.copied':                'تم النسخ إلى الحافظة',
      'toast.syncComplete':          'اكتملت المزامنة',
      'toast.langChanged':           'تم تبديل اللغة',
      'toast.themeChanged':          'تم تبديل الوضع',
      'toast.offline':               'انقطع الاتصال — العمل مستمر محلياً',
      'toast.online':                'عاد الاتصال — جاري رفع الطابور',
      'toast.batchSaved':            'تم حفظ الدفعة',
      'toast.itemAdded':             'تمت إضافة الصنف',
      'toast.itemRemoved':           'تم حذف الصنف',

      /* ─── Modal Titles ───────────────────────────────────────────── */
      'modal.confirm.title':         'تأكيد العملية',
      'modal.delete.title':          'تأكيد الحذف',
      'modal.delete.message':        'سيتم حذف العنصر نهائياً. لا يمكن التراجع.',
      'modal.unsaved.title':         'تغييرات غير محفوظة',
      'modal.unsaved.message':       'لديك تغييرات غير محفوظة. هل تريد المغادرة؟',
      'modal.save':                  'حفظ',
      'modal.discard':               'تجاهل',
      'modal.ok':                    'حسناً',

      /* ─── Errors ─────────────────────────────────────────────────── */
      'err.required':                'هذا الحقل مطلوب',
      'err.invalidEmail':            'البريد الإلكتروني غير صالح',
      'err.invalidPhone':            'رقم الهاتف غير صالح',
      'err.invalidSku':              'كود SKU غير صالح',
      'err.invalidWeight':           'الوزن يجب أن يكون أكبر من صفر',
      'err.invalidPrice':            'السعر غير صالح',
      'err.invalidPurity':           'النقاء يجب أن يكون بين 0.4 و 1.0',
      'err.tooLong':                 'النص طويل جداً',
      'err.tooShort':                'النص قصير جداً',
      'err.invalidFormat':           'الصيغة غير صحيحة',
      'err.networkError':            'خطأ في الشبكة',
      'err.permissionDenied':        'غير مصرح لك بهذه العملية',
      'err.notFound':                'العنصر غير موجود',
      'err.alreadyExists':           'العنصر موجود بالفعل',
      'err.duplicateSku':            'كود SKU مستخدم بالفعل',
      'err.noData':                  'لا توجد بيانات',
      'err.connectionLost':          'انقطع الاتصال',
      'err.storageQuotaExceeded':    'مساحة التخزين ممتلئة',
      'err.indexedDBFailed':         'فشل الوصول إلى IndexedDB',
      'err.failedToSave':            'فشل الحفظ',
      'err.failedToLoad':            'فشل التحميل',
      'err.failedToDelete':          'فشل الحذف',
      'err.failedToSync':            'فشلت المزامنة',
      'err.permissionDeniedDesc':    'هذه الصفحة متاحة للمصرح لهم فقط',

      /* ─── Confirmations ──────────────────────────────────────────── */
      'confirm.areYouSure':          'هل أنت متأكد؟',
      'confirm.yes':                 'نعم',
      'confirm.no':                  'لا',
      'confirm.delete':              'حذف',
      'confirm.cancel':              'إلغاء',
      'confirm.continue':            'متابعة',
      'confirm.close':               'إغلاق',

      /* ─── Placeholders ───────────────────────────────────────────── */
      'ph.search':                   'بحث…',
      'ph.searchSku':                'ابحث بكود التاج…',
      'ph.searchName':               'ابحث بالاسم…',
      'ph.searchPhone':              '01xxxxxxxxx',
      'ph.searchInvoice':            'ابحث برقم الفاتورة…',
      'ph.notes':                    'اكتب ملاحظاتك هنا…',
      'ph.optional':                 'اختياري',
      'ph.selectBranch':             'اختر الفرع…',
      'ph.selectManufacturer':       'اختر الماركة…',
      'ph.selectSupplier':           'اختر المورد…',
      'ph.selectCustomer':           'اختر العميل…',
      'ph.selectRole':               'اختر الدور…',
      'ph.selectRep':                'اختر البياع…',

      /* ─── Wholesale & Transfers ──────────────────────────────────── */
      'wsl.title':                   'التوريد والجملة والتحويلات',
      'wsl.subtitle':                'بيع بالجملة · تحويلات بين الفروع · مقايضة ذهب',
      'wsl.tab.wholesale':           'فواتير الجملة',
      'wsl.tab.transfers':           'التحويلات بين الفروع',
      'wsl.mode.wholesale':          'بيع جملة (B2B)',
      'wsl.mode.inter_branch':       'تحويل بين الفروع',
      'wsl.mode.retail':             'بيع قطاعي',
      'wsl.pay.cash':                'دفع نقدي',
      'wsl.pay.goldExchange':        'مقايضة ذهب خام',
      'wsl.pay.credit':              'على الحساب',
      'wsl.pay.mixed':               'دفع مختلط',
      'wsl.status.draft':            'مسودة',
      'wsl.status.confirmed':        'مؤكدة',
      'wsl.status.partial':          'مسددة جزئياً',
      'wsl.status.paid':             'مسددة',
      'wsl.status.cancelled':        'ملغاة',
      'wsl.action.newInvoice':       'فاتورة توريد جديدة',
      'wsl.action.newTransfer':      'أمر تحويل جديد',
      'wsl.action.printInvoice':     'طباعة الفاتورة',
      'wsl.action.printManifest':    'طباعة إذن التوريد',

      /* ─── ✅ B2B Sellers (v4 جديد) ──────────────────────────────── */
      'b2b.title':                   'نظام بياعي الجملة المستقلين',
      'b2b.subtitle':                'كيانات B2B مستقلة بخزائن نقدية وذهبية منفصلة',
      'b2b.tab.reps':                'بياعو الجملة',
      'b2b.tab.customers':           'عملاء الجملة',
      'b2b.tab.audit':               'رقابة المدير',
      'b2b.tab.settlements':         'إذون التصفية',

      /* Reps */
      'b2b.rep.title':               'بياعو الجملة',
      'b2b.rep.new':                 'بياع جملة جديد',
      'b2b.rep.edit':                'تعديل بياع',
      'b2b.rep.code':                'كود البياع',
      'b2b.rep.name':                'اسم البياع',
      'b2b.rep.phone':               'رقم الهاتف',
      'b2b.rep.pin':                 'رمز PIN',
      'b2b.rep.pinHint':             '4-6 أرقام للدخول السريع',
      'b2b.rep.branch':              'الفرع التابع له',
      'b2b.rep.openingCash':         'الرصيد الافتتاحي النقدي (ج.م)',
      'b2b.rep.openingGold':         'الرصيد الافتتاحي الذهبي (جم بندق)',
      'b2b.rep.treasury':            'الخزينة',
      'b2b.rep.cashDrawer':          'خزنة النقدية',
      'b2b.rep.goldDrawer':          'خزنة الذهب',
      'b2b.rep.totalValue':          'إجمالي الخزينة',
      'b2b.rep.settle':              'تصفية الحساب',
      'b2b.rep.settleRequest':       'طلب تصفية',
      'b2b.rep.manualEntry':         'حركة يدوية',
      'b2b.rep.active':              'نشط',
      'b2b.rep.inactive':            'موقوف',
      'b2b.rep.myTreasury':          'خزينتي',
      'b2b.rep.isolatedView':        'عرض معزول — أنت ترى بياناتك فقط',
      'b2b.rep.deleteWarning':       'سيتم حذف البياع. لا يمكن التراجع.',
      'b2b.rep.deleteWarningSoft':   'لديه حركات — سيتم تعطيله بدل حذفه.',
      'b2b.rep.autoDisabled':        'تم تعطيل البياع',

      /* Customers */
      'b2b.customer.title':          'عملاء الجملة',
      'b2b.customer.new':            'عميل جملة جديد',
      'b2b.customer.edit':           'تعديل عميل',
      'b2b.customer.code':           'الكود',
      'b2b.customer.name':           'اسم العميل',
      'b2b.customer.phone':          'رقم الهاتف',
      'b2b.customer.address':        'العنوان',
      'b2b.customer.taxId':          'السجل الضريبي',
      'b2b.customer.responsibleRep': 'البياع المسؤول',
      'b2b.customer.openingCash':    'مديونية افتتاحية نقدية (ج.م)',
      'b2b.customer.openingGold':    'مديونية افتتاحية ذهبية (جم بندق)',
      'b2b.customer.creditLimit':    'حد الائتمان (ج.م)',
      'b2b.customer.balance':        'الرصيد',
      'b2b.customer.cashDebt':       'المديونية النقدية',
      'b2b.customer.goldDebt':       'المديونية الذهبية',
      'b2b.customer.totalValue':     'القيمة الإجمالية',
      'b2b.customer.ledger':         'دفتر الحساب',
      'b2b.customer.ledgerTitle':    'دفتر حساب العميل',
      'b2b.customer.addMovement':    'تسجيل حركة',
      'b2b.customer.noCustomers':    'لا يوجد عملاء جملة',
      'b2b.customer.noCustomersHint':'ابدأ بإضافة عميل جملة جديد',

      /* Ledger Types */
      'b2b.ledger.invoice':          'فاتورة جملة',
      'b2b.ledger.invoiceCredit':    'فاتورة آجلة',
      'b2b.ledger.cashReceived':     'استلام نقدي',
      'b2b.ledger.cashPayment':      'سداد نقدي',
      'b2b.ledger.goldReceived':     'استلام ذهب',
      'b2b.ledger.goldDelivered':    'تسليم ذهب',
      'b2b.ledger.adjustment':       'تسوية يدوية',
      'b2b.ledger.settlement':       'تصفية مع المحل',
      'b2b.ledger.opening':          'رصيد افتتاحي',

      /* Movement Types */
      'b2b.movement.cashFromCustomer': 'استلام نقدي من العميل',
      'b2b.movement.cashToCustomer':   'دفع نقدي للعميل',
      'b2b.movement.goldFromCustomer': 'استلام ذهب من العميل',
      'b2b.movement.goldToCustomer':   'تسليم ذهب للعميل',
      'b2b.movement.notes':            'ملاحظات',
      'b2b.movement.notesPlaceholder': 'وصف الحركة…',
      'b2b.movement.save':             'حفظ الحركة',
      'b2b.movement.saved':            'تم تسجيل الحركة',

      /* Treasury */
      'b2b.treasury.cash':           'نقدية',
      'b2b.treasury.gold':           'ذهب',
      'b2b.treasury.value':          'القيمة',
      'b2b.treasury.distribution':   'توزيع الذهب حسب العيار',
      'b2b.treasury.customGold':     'مخصص',
      'b2b.treasury.availableCash':  'نقدية متاحة',
      'b2b.treasury.availableGold':  'ذهب متاح',
      'b2b.treasury.totalCash':      'إجمالي خزائن البياعين (نقد)',
      'b2b.treasury.goldAvailable':  'ذهب متاح',

      /* Settlement */
      'b2b.settlement.title':        'إذون التصفية',
      'b2b.settlement.new':          'إذن تصفية جديد',
      'b2b.settlement.no':           'رقم الإذن',
      'b2b.settlement.status':       'الحالة',
      'b2b.settlement.amount':       'المبلغ النقدي',
      'b2b.settlement.goldWeight':   'الوزن الذهبي',
      'b2b.settlement.approve':      'اعتماد',
      'b2b.settlement.reject':       'رفض',
      'b2b.settlement.approved':     'تم الاعتماد',
      'b2b.settlement.rejected':     'تم الرفض',
      'b2b.settlement.sendToManager':'إرسال للمدير',
      'b2b.settlement.sent':         'تم إرسال الإذن للمدير',
      'b2b.settlement.awaitingApproval': 'بانتظار اعتماد المدير',
      'b2b.settlement.confirmApprove': 'سيتم اعتماد التصفية وخصم المبالغ من خزينة البياع. متابعة؟',
      'b2b.settlement.rejectReason': 'سبب الرفض',
      'b2b.settlement.pending':      'معلّق',
      'b2b.settlement.approved_value': 'معتمد',
      'b2b.settlement.details':      'تفاصيل إذن التصفية',
      'b2b.settlement.before':       'الرصيد قبل التصفية',
      'b2b.settlement.createdBy':    'أُنشئ بواسطة',
      'b2b.settlement.approvedBy':   'اعتمد بواسطة',

      /* Audit Dashboard */
      'b2b.audit.title':             'لوحة رقابة المدير',
      'b2b.audit.subtitle':          'مقارنة أداء البياعين',
      'b2b.audit.repName':           'البياع',
      'b2b.audit.cashTreasury':      'خزنة نقدية',
      'b2b.audit.goldTreasury':      'خزنة ذهب',
      'b2b.audit.goldValue':         'قيمة الذهب',
      'b2b.audit.customersCount':    'عملاء الجملة',
      'b2b.audit.salesTotal':        'مبيعات الفترة',
      'b2b.audit.invoicesCount':     'عدد الفواتير',
      'b2b.audit.action':            'إجراء',

      /* KPI Cards */
      'b2b.kpi.reps':                'بياعو الجملة',
      'b2b.kpi.activeReps':          'نشط',
      'b2b.kpi.totalReps':           'إجمالي البياعين',
      'b2b.kpi.totalRepCash':        'إجمالي خزائن البياعين (نقد)',
      'b2b.kpi.totalRepGold':        'إجمالي خزائن البياعين (ذهب)',
      'b2b.kpi.customers':           'عملاء الجملة',
      'b2b.kpi.customerDebts':       'مديونيات',
      'b2b.kpi.pendingSettlements':  'إذون التصفية',
      'b2b.kpi.approvedValue':       'معتمد',
      'b2b.kpi.goldLabel':           'ذهب',
      'b2b.kpi.cashLabel':           'نقدية',

      /* Errors & Warnings */
      'b2b.err.repRequired':         'البياع مطلوب',
      'b2b.err.customerRequired':    'العميل مطلوب',
      'b2b.err.accessDenied':        'غير مصرح بالوصول لبيانات هذا البياع',
      'b2b.err.noRepAssigned':       'حسابك غير مرتبط ببياع',
      'b2b.err.noRepAssignedHint':   'تواصل مع المدير لربط حسابك',
      'b2b.err.insufficientCash':    'المبلغ يتجاوز رصيد الخزينة النقدية',
      'b2b.err.insufficientGold':    'الوزن يتجاوز رصيد خزينة الذهب',
      'b2b.err.treasuryChanged':     'الخزينة تغيرت — أعد المحاولة',
      'b2b.err.cannotDisableSelf':   'لا يمكنك تعطيل حسابك الخاص',
      'b2b.warn.isolatedView':       'عرض معزول — أنت ترى بياناتك فقط',

      /* Confirmations */
      'b2b.confirm.clearData':       'تحذير أخير: سيتم حذف كل بيانات B2B. اكتب "حذف" للمتابعة.',
      'b2b.confirm.deleteRep':       'سيتم حذف البياع نهائياً. متابعة؟',
      'b2b.confirm.deleteCustomer':  'سيتم حذف العميل نهائياً. متابعة؟',

      /* ─── Pluralization (6 Arabic forms) ─────────────────────────── */
      'plural.items.zero':           'لا توجد قطع',
      'plural.items.one':            'قطعة واحدة',
      'plural.items.two':            'قطعتان',
      'plural.items.few':            '{{count}} قطع',
      'plural.items.many':           '{{count}} قطعة',
      'plural.items.other':          '{{count}} قطعة',

      'plural.invoices.zero':        'لا توجد فواتير',
      'plural.invoices.one':         'فاتورة واحدة',
      'plural.invoices.two':         'فاتورتان',
      'plural.invoices.few':         '{{count}} فواتير',
      'plural.invoices.many':        '{{count}} فاتورة',
      'plural.invoices.other':       '{{count}} فاتورة',

      'plural.days.zero':            'اليوم',
      'plural.days.one':             'يوم واحد',
      'plural.days.two':             'يومان',
      'plural.days.few':             '{{count}} أيام',
      'plural.days.many':            '{{count}} يوم',
      'plural.days.other':           '{{count}} يوم',

      'plural.hours.zero':           'الآن',
      'plural.hours.one':            'ساعة واحدة',
      'plural.hours.two':            'ساعتان',
      'plural.hours.few':            '{{count}} ساعات',
      'plural.hours.many':           '{{count}} ساعة',
      'plural.hours.other':          '{{count}} ساعة',

      'plural.pieces.zero':          'لا توجد قطع',
      'plural.pieces.one':           'قطعة واحدة',
      'plural.pieces.two':           'قطعتان',
      'plural.pieces.few':           '{{count}} قطع',
      'plural.pieces.many':          '{{count}} قطعة',
      'plural.pieces.other':         '{{count}} قطعة',

      /* ─── Number Formatting Labels ───────────────────────────────── */
      'fmt.number':                  'رقم كبير',
      'fmt.weight':                  'الوزن بالجرام',
      'fmt.currency':                'المبلغ بالجنيه',
      'fmt.date':                    'التاريخ',
      'fmt.datetime':                'التاريخ والوقت',
      'fmt.relative':                'منذ فترة',
      'fmt.percent':                 'النسبة المئوية',

      /* ─── Receipt ────────────────────────────────────────────────── */
      'receipt.title':               'فاتورة بيع ذهب',
      'receipt.returnTitle':         'إيصال استرجاع',
      'receipt.buybackTitle':        'إيصال شراء كسر',
      'receipt.supplierReturnTitle': 'إيصال مرتجع مورد',
      'receipt.meltingTitle':        'إيصال سبك',
      'receipt.no':                  'رقم الإيصال',
      'receipt.date':                'التاريخ',
      'receipt.customer':            'العميل',
      'receipt.customerPhone':       'هاتف العميل',
      'receipt.branch':              'الفرع',
      'receipt.item':                'الصنف',
      'receipt.karat':               'العيار',
      'receipt.weight':              'الوزن الصافي',
      'receipt.pure':                'بندق 24K',
      'receipt.workmanship':         'المصنعية',
      'receipt.total':               'الإجمالي',
      'receipt.customerSignature':   'توقيع العميل',
      'receipt.cashierSignature':    'توقيع الكاشير',
      'receipt.managerSignature':    'توقيع المسؤول',
      'receipt.thanks':              'شكراً لتعاملكم معنا',
      'receipt.warrantyNote':        'البضاعة المباعة لا تُرد ولا تُستبدل بعد 14 يوم',
      'receipt.alertSuspicious':     'تنبيه خسس غير طبيعي — تجاوز حد الأمان',
    },

    /* ═══════════════════════════════════════════════════════════════════
       ENGLISH
       ═══════════════════════════════════════════════════════════════════ */
    en: {

      /* ─── App Shell ──────────────────────────────────────────────── */
      'app.name':                    'Gold Management System',
      'app.nameFull':                'Gold & Jewelry Management System',
      'app.tagline':                 'Gold & Jewelry Management System',
      'app.version':                 'Version',
      'app.loading':                 'Loading…',
      'app.ready':                   'System Ready',
      'app.title':                   'Gold Management System — Gold MS Enterprise',

      /* ─── Auth & Login ───────────────────────────────────────────── */
      'auth.login':                  'Sign In',
      'auth.logout':                 'Sign Out',
      'auth.email':                  'Email',
      'auth.password':               'Password',
      'auth.rememberMe':             'Remember me',
      'auth.forgotPassword':         'Forgot password?',
      'auth.signIn':                 'Sign In',
      'auth.signOut':                'Sign Out',
      'auth.welcomeBack':            'Welcome back',
      'auth.loginSuccess':           'Signed in successfully',
      'auth.loginFailed':            'Login failed',
      'auth.invalidCredentials':     'Invalid email or password',
      'auth.accountDisabled':        'Account disabled, contact administration',
      'auth.sessionExpired':         'Session expired, please sign in again',
      'auth.youAre':                 'You are signed in as',
      'auth.demoCredentials':        'Demo credentials',
      'auth.logoutConfirm':          'Do you want to sign out?',

      /* ─── Roles ──────────────────────────────────────────────────── */
      'role.SUPER_ADMIN':            'Super Admin',
      'role.BRANCH_MANAGER':         'Branch Manager',
      'role.ACCOUNTANT':             'Accountant',
      'role.DATA_ENTRY':             'Data Entry',
      'role.SALESPERSON':            'Salesperson',
      'role.B2B_REP':                'B2B Sales Rep',

      /* ─── Navigation ─────────────────────────────────────────────── */
      'nav.dashboard':               'Dashboard',
      'nav.pos':                     'Point of Sale',
      'nav.inventory':               'Inventory',
      'nav.suppliers':               'Suppliers',
      'nav.customers':               'Customers',
      'nav.returns':                 'Returns',
      'nav.buyback':                 'Scrap Buyback',
      'nav.analytics':               'Analytics',
      'nav.reports':                 'Reports',
      'nav.loss':                    'Loss Management',
      'nav.melting':                 'Melting',
      'nav.assaying':                'Assaying',
      'nav.polishing':               'Polishing',
      'nav.repair':                  'Repair & Workshop',
      'nav.audit':                   'Audit Log',
      'nav.ledger':                  'General Ledger',
      'nav.accounting':              'Accounting',
      'nav.wholesale':               'Wholesale & Supply',
      'nav.b2b':                     'B2B Reps',
      'nav.transfers':               'Branch Transfers',
      'nav.shifts':                  'Shifts',
      'nav.queue':                   'Sync Queue',
      'nav.employees':               'Employees',
      'nav.settings':                'Settings',
      'nav.security':                'Security',
      'nav.cache':                   'Cache',
      'nav.realtime':                'Realtime',

      /* ─── Actions ────────────────────────────────────────────────── */
      'action.save':                 'Save',
      'action.saveChanges':          'Save Changes',
      'action.cancel':               'Cancel',
      'action.close':                'Close',
      'action.confirm':              'Confirm',
      'action.apply':                'Apply',
      'action.reset':                'Reset',
      'action.clear':                'Clear',
      'action.delete':               'Delete',
      'action.edit':                 'Edit',
      'action.view':                 'View',
      'action.details':              'Details',
      'action.print':                'Print',
      'action.export':               'Export',
      'action.import':               'Import',
      'action.download':             'Download',
      'action.upload':               'Upload',
      'action.refresh':              'Refresh',
      'action.reload':               'Reload',
      'action.search':               'Search',
      'action.filter':               'Filter',
      'action.sort':                 'Sort',
      'action.add':                  'Add',
      'action.create':               'Create',
      'action.new':                  'New',
      'action.back':                 'Back',
      'action.next':                 'Next',
      'action.previous':             'Previous',
      'action.continue':             'Continue',
      'action.confirmAndSave':       'Confirm & Save',
      'action.selectAll':            'Select All',
      'action.deselectAll':          'Deselect All',
      'action.copy':                 'Copy',
      'action.copied':               'Copied',
      'action.undo':                 'Undo',
      'action.retry':                'Retry',
      'action.skip':                 'Skip',
      'action.optional':             'Optional',
      'action.required':             'Required',

      /* ─── Statuses ───────────────────────────────────────────────── */
      'status.online':               'Online',
      'status.offline':              'Offline',
      'status.syncing':              'Syncing…',
      'status.connected':            'Connected',
      'status.disconnected':         'Disconnected',
      'status.error':                'Error',
      'status.warning':              'Warning',
      'status.success':              'Success',
      'status.failed':               'Failed',
      'status.pending':              'Pending',
      'status.loading':              'Loading…',
      'status.ready':                'Ready',
      'status.active':               'Active',
      'status.inactive':             'Inactive',
      'status.completed':            'Completed',
      'status.cancelled':            'Cancelled',

      /* ─── Item Statuses ──────────────────────────────────────────── */
      'item.status.inStock':         'In Stock',
      'item.status.reserved':        'Reserved',
      'item.status.sold':            'Sold',
      'item.status.returned':        'Returned',
      'item.status.melted':          'Melted',
      'item.status.returnedToSupplier': 'Returned to Supplier',
      'item.status.transferred':     'Transferred',

      /* ─── Carats ─────────────────────────────────────────────────── */
      'carat.24':                    'Carat 24',
      'carat.22':                    'Carat 22',
      'carat.21':                    'Carat 21',
      'carat.18':                    'Carat 18',
      'carat.14':                    'Carat 14',
      'carat.short':                 'Karat',
      'carat.purity':                'Purity',
      'carat.custom':                'Custom Karat',
      'carat.customHint':            '300 to 999 (bullion, imports, scrap)',

      /* ─── Manufacturers ──────────────────────────────────────────── */
      'manu.nile':                   'Nile Gold Factory',
      'manu.sharq':                  'Al-Sharq Jewelry',
      'manu.masat':                  'Golden Diamond',
      'manu.fath':                   'Al-Fath Gold',
      'manu.lazurdi':                'Lazurdi',
      'manu.misr':                   'Egypt Gold & Jewelry',

      /* ─── Categories ─────────────────────────────────────────────── */
      'cat.ring':                    'Ring',
      'cat.necklace':                'Necklace',
      'cat.bracelet':                'Bracelet',
      'cat.earring':                 'Earring',
      'cat.hairpin':                 'Hairpin',
      'cat.weddingBand':             'Wedding Band',
      'cat.pendant':                 'Pendant',
      'cat.charm':                   'Charm',
      'cat.cuff':                    'Cuff',
      'cat.collier':                 'Collier',
      'cat.bar':                     'Bullion Bar',
      'cat.lire':                    'Lire',
      'cat.scrap':                   'Purchased Scrap',
      'cat.other':                   'Other',

      /* ─── Units ──────────────────────────────────────────────────── */
      'unit.gram':                   'g',
      'unit.kg':                     'kg',
      'unit.egp':                    'EGP',
      'unit.percent':                '%',
      'unit.piece':                  'piece',
      'unit.pieces':                 'pieces',
      'unit.invoice':                'invoice',
      'unit.invoices':               'invoices',
      'unit.day':                    'day',
      'unit.days':                   'days',
      'unit.hour':                   'hour',
      'unit.hours':                  'hours',
      'unit.minute':                 'minute',
      'unit.minutes':                'minutes',
      'unit.second':                 'second',
      'unit.seconds':                'seconds',
      'unit.batch':                  'batch',
      'unit.certificate':            'certificate',

      /* ─── Common Labels ──────────────────────────────────────────── */
      'label.name':                  'Name',
      'label.fullName':              'Full Name',
      'label.email':                 'Email',
      'label.phone':                 'Phone',
      'label.address':               'Address',
      'label.notes':                 'Notes',
      'label.date':                  'Date',
      'label.time':                  'Time',
      'label.total':                 'Total',
      'label.subtotal':              'Subtotal',
      'label.discount':              'Discount',
      'label.tax':                   'Tax',
      'label.paid':                  'Paid',
      'label.remaining':             'Remaining',
      'label.balance':               'Balance',
      'label.quantity':              'Quantity',
      'label.price':                 'Price',
      'label.unitPrice':             'Unit Price',
      'label.description':           'Description',
      'label.code':                  'Code',
      'label.sku':                   'SKU',
      'label.category':              'Category',
      'label.branch':                'Branch',
      'label.status':                'Status',
      'label.type':                  'Type',
      'label.reference':             'Reference',
      'label.referenceNo':           'Reference No.',
      'label.certificateNo':         'Certificate No.',
      'label.invoiceNo':             'Invoice No.',
      'label.batchNo':               'Batch No.',
      'label.createdAt':             'Created At',
      'label.updatedAt':             'Updated At',
      'label.createdBy':             'Created By',
      'label.weight':                'Weight',
      'label.netWeight':             'Net Weight',
      'label.grossWeight':           'Gross Weight',
      'label.pureWeight':            'Pure Weight (24K)',
      'label.stoneWeight':           'Stone Weight',
      'label.workmanship':           'Workmanship',
      'label.workmanshipPerGram':    'Workmanship / gram',
      'label.workmanshipValue':      'Workmanship Value',
      'label.goldValue':             'Gold Value',
      'label.totalCost':             'Total',
      'label.purity':                'Purity',
      'label.testedPurity':          'Tested Purity',
      'label.claimedPurity':         'Claimed Purity',
      'label.manufacturer':          'Manufacturer',
      'label.supplier':              'Supplier',
      'label.customer':              'Customer',
      'label.customerName':          'Customer Name',
      'label.reason':                'Reason',
      'label.method':                'Method',
      'label.performance':           'Performance',
      'label.rep':                   'Sales Rep',
      'label.repCode':               'Rep Code',
      'label.treasury':              'Treasury',

      /* ─── Dashboard ──────────────────────────────────────────────── */
      'dash.title':                  'Executive Dashboard',
      'dash.subtitle':               'Overview of inventory, sales, and sync',
      'dash.vaultGold':              'Vault Balance (24K)',
      'dash.vaultValue':             'Vault Market Value',
      'dash.dailySales':             "Today's Sales",
      'dash.dailyGold':              "Today's Gold Sold",
      'dash.dailyTxns':              'Invoice Count',
      'dash.suppliersGold':          'Supplier Gold Balances',
      'dash.suppliersCash':          'Supplier Cash Balances',
      'dash.cacheHitRate':           'Cache Hit Rate',
      'dash.queueCount':             'Sync Queue',
      'dash.deadStock':              'Dead Capital',
      'dash.systemStatus':           'System Status',
      'dash.caratDistribution':      'Carat Distribution',
      'dash.recentActivity':         'Recent Activity',
      'dash.branchPerformance':      'Branch Performance',
      'dash.topSellers':             'Salesperson Leaderboard',
      'dash.sales24h':               'Sales — Last 24 Hours',
      'dash.sales7d':                'Sales Trend — 7 Days',

      /* ─── POS ────────────────────────────────────────────────────── */
      'pos.title':                   'Point of Sale',
      'pos.subtitle':                'Scan barcode — instant search from local cache',
      'pos.scanTitle':               'Scan Item Barcode',
      'pos.scanPlaceholder':         'SKU-XXXX-XXXX-XXXX',
      'pos.scanHint':                'Use barcode scanner or type manually then Enter',
      'pos.scanStart':               'Start scanning item barcode',
      'pos.cartEmpty':               'Cart is empty',
      'pos.cartEmptyHint':           'Start scanning item barcode',
      'pos.cart':                    'Sales Cart',
      'pos.cartItems':               'items',
      'pos.itemFound':               'Item Found',
      'pos.itemNotFound':            'Item Not Found',
      'pos.itemOutOfStock':          'Item Out of Stock',
      'pos.itemAlreadyAdded':        'Item already in cart',
      'pos.checkout':                'Complete Sale',
      'pos.quickCheckout':           'Quick Checkout',
      'pos.saveOffline':             'Save Offline',
      'pos.saleCompleted':           'Sale completed',
      'pos.saleQueued':              'Saved locally — pending sync',
      'pos.totalPure':               'Total Pure Gold',
      'pos.totalAmount':             'Grand Total',

      /* ─── Inventory ──────────────────────────────────────────────── */
      'inv.title':                   'Inventory',
      'inv.subtitle':                'Locally cached in IndexedDB — instant search',
      'inv.search':                  'Search',
      'inv.searchPlaceholder':       'SKU, brand, category…',
      'inv.filterKarat':             'Carat',
      'inv.filterStatus':            'Status',
      'inv.filterBranch':            'Branch',
      'inv.filterManufacturer':      'Manufacturer',
      'inv.filterCategory':          'Category',
      'inv.allKarats':               'All Carats',
      'inv.allStatuses':             'All Statuses',
      'inv.allBranches':             'All Branches',
      'inv.allManufacturers':        'All Manufacturers',
      'inv.allCategories':           'All Categories',
      'inv.resultCount':             'results',
      'inv.noResults':               'No matching results',
      'inv.noData':                  'No items in inventory',
      'inv.export':                  'Export Excel',
      'inv.import':                  'Import Excel',
      'inv.newItem':                 'New Item',
      'inv.editItem':                'Edit Item',
      'inv.deleteItem':              'Delete Item',
      'inv.deleteConfirm':           'This item will be permanently deleted. Cannot be undone.',
      'inv.pagination.showing':      'Showing',
      'inv.pagination.of':           'of',
      'inv.pagination.page':         'Page',
      'inv.pagination.ofTotal':      'of',
      'inv.pagination.goTo':         'Go to',
      'inv.pagination.perPage':      'per page',

      /* ─── Suppliers ──────────────────────────────────────────────── */
      'sup.title':                   'Suppliers',
      'sup.subtitle':                'Dual balances: Gold (24K) + Cash (EGP)',
      'sup.totalGold':               'Total Supplier Gold',
      'sup.totalCash':               'Total Cash',
      'sup.count':                   'Supplier Count',
      'sup.goldBalance':             'Gold Balance',
      'sup.cashBalance':             'Cash Balance',
      'sup.owedToSupplier':          'Owed to Supplier',
      'sup.owedToUs':                'Owed to Us',
      'sup.settled':                 'Settled',
      'sup.statement':               'Statement',
      'sup.transaction':             'New Transaction',
      'sup.payment':                 'Record Payment',
      'sup.newSupplier':             'New Supplier',
      'sup.goldReceived':            'Gold Received',
      'sup.goldPayment':             'Gold Payment',
      'sup.cashPayment':             'Cash Payment',
      'sup.cashReceived':            'Cash Received',
      'sup.scrapSettlement':         'Scrap Settlement',
      'sup.openingBalance':          'Opening Balance',

      /* ─── Returns ────────────────────────────────────────────────── */
      'ret.title':                   'Returns & Buyback',
      'ret.subtitle':                'Sales returns, scrap buyback, supplier returns',
      'ret.salesReturn':             'Sales Return',
      'ret.buyback':                 'Scrap Buyback',
      'ret.supplierReturn':          'Supplier Return',
      'ret.scanReturn':              'Scan returned item barcode',
      'ret.searchItem':              'Search Item',
      'ret.originalInvoice':         'Original Invoice',
      'ret.daysSinceSale':           'Days Since Sale',
      'ret.refundPct':               'Refund Percentage',
      'ret.refundAmount':            'Refund Amount',
      'ret.refundMethod':            'Refund Method',
      'ret.cashRefund':              'Cash Refund',
      'ret.cardRefund':              'Card Refund',
      'ret.storeCredit':             'Store Credit',
      'ret.returnEligible':          'Item eligible for return',
      'ret.returnNotEligible':       'Item not eligible for return',
      'ret.beyondReturnWindow':      'Beyond return window',
      'ret.partialReturn':           'Partial refund',
      'ret.confirmReturn':           'Confirm Return',
      'ret.returnCompleted':         'Return completed',
      'ret.returnToInventory':       'Item returned to inventory',

      /* ─── Buyback ────────────────────────────────────────────────── */
      'bb.title':                    'Scrap Buyback',
      'bb.claimedKarat':             'Claimed Carat',
      'bb.testedPurity':             'Tested Purity',
      'bb.grossWeight':              'Gross Weight',
      'bb.stoneWeight':              'Stone Weight',
      'bb.netWeight':                'Net Weight',
      'bb.pureWeight':               '24K Pure Weight',
      'bb.buyRate':                  'Buy Rate',
      'bb.sellRate':                 'Sell Rate',
      'bb.buyMargin':                'Buy Margin',
      'bb.totalValue':               'Total Value',
      'bb.immediateCash':            'Immediate Cash',
      'bb.issueCredit':              'Issue Store Credit',
      'bb.confirmPurchase':          'Confirm Purchase',
      'bb.purchaseCompleted':        'Scrap purchased',

      /* ─── Analytics ──────────────────────────────────────────────── */
      'ana.title':                   'Smart Analytics',
      'ana.subtitle':                'Interactive charts for trends and performance',
      'ana.salesVsRate':             'Sales Volume vs Gold Rate',
      'ana.correlation':             'Correlation',
      'ana.corrStrong':              'Strong correlation',
      'ana.corrModerate':            'Moderate correlation',
      'ana.corrWeak':                'Weak correlation',
      'ana.corrNone':                'No correlation',
      'ana.correlationHint':         'Higher price correlates with lower volumes',
      'ana.leaderboard':             'Salesperson Leaderboard',
      'ana.fastMoving':              'Fast-Moving Items',
      'ana.deadStock':               'Dead Stock',
      'ana.deadStockEngine':         'Dead Stock Engine',
      'ana.stale90Days':             'Age > 90 days',
      'ana.stagnant':                'Stagnant pieces',
      'ana.capitalTied':             'Frozen Capital',
      'ana.goldTied':                'Frozen Gold',
      'ana.averageAge':              'Average Age',
      'ana.severityWatch':           'Watch',
      'ana.severityWarn':            'Warning',
      'ana.severityCritical':        'Critical',

      /* ─── Loss Management ────────────────────────────────────────── */
      'loss.title':                  'Loss Management',
      'loss.subtitle':               'Melting, polishing, assaying',
      'loss.melting':                'Scrap Melting',
      'loss.meltingSubtitle':        'Convert scrap to bullion',
      'loss.polishing':              'Polishing & Buffing',
      'loss.polishingSubtitle':      'Jewelry maintenance and polish',
      'loss.assaying':               'Assaying',
      'loss.assayingSubtitle':       'Purity testing and adjustment',
      'loss.scrapPieces':            'Scrap Pieces',
      'loss.preMeltWeight':          'Pre-Melt Weight',
      'loss.postMeltWeight':         'Post-Melt Weight',
      'loss.lossWeight':             'Loss (grams)',
      'loss.lossPct':                'Loss Percentage',
      'loss.naturalLoss':            'Natural Loss',
      'loss.naturalRange':           'Natural Range',
      'loss.warningRange':           'Monitoring Range',
      'loss.suspiciousLoss':         'Suspicious Loss',
      'loss.suspiciousHint':         'Possible fraud or theft',
      'loss.toleranceEngine':        'Tolerance Engine',
      'loss.addPiece':               'Add Piece',
      'loss.saveBatch':              'Save Batch',
      'loss.confirmSuspicious':      'Loss exceeds safety threshold. Continue?',
      'loss.batchSaved':             'Batch saved',
      'loss.recentBatches':          'Recent Batches',
      'loss.operationalLedger':      'Operational Loss Ledger',
      'loss.totalLoss':              'Total Loss',
      'loss.lossValue':              'Loss Value',
      'loss.avgLossPct':             'Avg Loss %',
      'loss.suspiciousCount':        'Suspicious Batches',
      'loss.serviceType':            'Service Type',
      'loss.acidDip':                'Acid Dip',
      'loss.buffing':                'Buffing & Polish',
      'loss.polishOnly':             'Polish Only',
      'loss.combined':               'Combined Service',
      'loss.workshop':               'Workshop',
      'loss.assayerFee':             'Assayer Fee',
      'loss.feeInCash':              'Cash',
      'loss.feeInGold':              'Gold Deduction',
      'loss.certificateNo':          'Certificate No.',
      'loss.assayerName':            'Assayer Name',

      /* ─── Repair & Workshop ──────────────────────────────────────── */
      'repair.title':                'Repair & Workshop',
      'repair.subtitle':             'Repair · Expanding · Shrinking · Stone Setting',
      'repair.intake':               'Intake',
      'repair.workshop':             'Workshop',
      'repair.delivery':             'Delivery',
      'repair.ledger':               'Repair Ledger',
      'repair.newIntake':            'New Repair Intake',
      'repair.service.repair':       'General Repair',
      'repair.service.expanding':    'Expanding',
      'repair.service.shrinking':    'Shrinking',
      'repair.service.stoneSetting': 'Stone Setting',
      'repair.service.polishing':    'Polishing',
      'repair.status.received':      'Received',
      'repair.status.inProgress':    'In Progress',
      'repair.status.ready':         'Ready',
      'repair.status.delivered':     'Delivered',
      'repair.status.cancelled':     'Cancelled',

      /* ─── Audit ──────────────────────────────────────────────────── */
      'audit.title':                 'Audit Log',
      'audit.subtitle':              'Immutable trail of all sensitive operations',
      'audit.action':                'Action',
      'audit.user':                  'User',
      'audit.entity':                'Entity',
      'audit.description':           'Description',
      'audit.timestamp':             'Timestamp',
      'audit.ipAddress':             'IP Address',
      'audit.noLogs':                'No audit logs',
      'audit.readOnly':              'Read-only log',
      'audit.appendOnly':            'Append-Only',
      'audit.hidden':                'Audit log hidden',
      'audit.noPermission':          'You do not have permission to view the log',

      /* ─── Employees ──────────────────────────────────────────────── */
      'emp.title':                   'Employee Directory',
      'emp.subtitle':                'Manage all employee accounts and permissions',
      'emp.directory':               'Employee List',
      'emp.newEmployee':             'New Employee',
      'emp.editEmployee':            'Edit Employee',
      'emp.fullName':                'Full Name',
      'emp.email':                   'Email',
      'emp.phone':                   'Phone',
      'emp.role':                    'Role',
      'emp.branch':                  'Branch',
      'emp.allBranches':             'All Branches',
      'emp.status':                  'Status',
      'emp.active':                  'Active',
      'emp.inactive':                'Inactive',
      'emp.lastLogin':               'Last Login',
      'emp.initialPassword':         'Initial Password',
      'emp.weakPassword':            'Password too weak',
      'emp.passwordRequirements':    '8+ chars, upper, lower, digit, symbol',
      'emp.onlyAdminsCanManage':     'Only admins can add employees',
      'emp.cannotEdit':              'Not authorized to edit employees',
      'emp.repId':                   'Linked Rep Code',
      'emp.repIdHint':               'For B2B reps only — links to B2B account',

      /* ─── Shifts ─────────────────────────────────────────────────── */
      'shift.title':                 'Shift Close',
      'shift.subtitle':              'Daily cash and gold reconciliation',
      'shift.openingCash':           'Opening Cash',
      'shift.cashSales':             'Cash Sales',
      'shift.cardSales':             'Card Sales',
      'shift.cashDeposits':          'Deposits',
      'shift.cashExpenses':          'Cash Expenses',
      'shift.expectedCash':          'Expected Cash',
      'shift.countedCash':           'Counted Cash',
      'shift.cashVariance':          'Cash Variance',
      'shift.openingGold':           'Opening Gold',
      'shift.goldReceived':          'Gold Received',
      'shift.goldSold':              'Gold Sold',
      'shift.expectedGold':          'Expected Gold',
      'shift.countedGold':           'Counted Gold',
      'shift.goldVariance':          'Gold Variance',
      'shift.closeShift':            'Close Shift',
      'shift.shiftClosed':           'Shift closed successfully',
      'shift.shortage':              'Shortage',
      'shift.surplus':               'Surplus',
      'shift.confirmClose':          'Shift will be closed and variances recorded. Cannot be undone.',
      'shift.notes':                 'Closing Notes',

      /* ─── Cache & Sync ───────────────────────────────────────────── */
      'cache.title':                 'Cache & Sync',
      'cache.subtitle':              'Two-layer: LocalStorage + IndexedDB',
      'cache.localStorage':          'LocalStorage · Config cache',
      'cache.indexedDB':             'IndexedDB · Heavy inventory',
      'cache.size':                  'Size',
      'cache.keys':                  'Keys',
      'cache.ttl':                   'Time to live',
      'cache.clearCache':            'Clear Cache',
      'cache.clearConfirm':          'All cached data will be cleared. Continue?',
      'cache.fullSync':              'Full Sync',
      'cache.deltaSync':             'Delta Sync',
      'cache.refreshCache':          'Refresh Cache',
      'cache.syncNow':               'Sync Now',
      'cache.lastSync':              'Last Sync',
      'cache.indexes':               'Indexes',
      'cache.estimate':              'Estimated Size',
      'cache.avgSize':               'Avg Size / Item',

      /* ─── Sync Queue ─────────────────────────────────────────────── */
      'queue.title':                 'Sync Queue',
      'queue.subtitle':              'Offline sales — auto-pushed when online',
      'queue.pending':               'Pending Invoices',
      'queue.totalValue':            'Total Value',
      'queue.totalPure':             'Total Pure Weight',
      'queue.syncAll':               'Sync All',
      'queue.clearQueue':            'Clear Queue',
      'queue.clearConfirm':          'All queued invoices will be permanently deleted. Continue?',
      'queue.empty':                 'Queue is empty',
      'queue.allSynced':             'All invoices synced',
      'queue.syncCompleted':         'Queue pushed',
      'queue.autoSyncHint':          'Queue will auto-sync when connection restored',

      /* ─── Settings ───────────────────────────────────────────────── */
      'settings.title':              'Settings',
      'settings.subtitle':           'Cache, sync, and preferences',
      'settings.general':            'General',
      'settings.appearance':         'Appearance',
      'settings.language':           'Language',
      'settings.theme':              'Theme',
      'settings.themeLight':         'Light',
      'settings.themeDark':          'Dark',
      'settings.sound':              'Sound',
      'settings.notifications':      'Notifications',
      'settings.sync':               'Sync',
      'settings.autoSync':           'Auto Sync',
      'settings.data':               'Data',
      'settings.storage':            'Storage',
      'settings.supabase':           'Supabase',
      'settings.supabaseUrl':        'Project URL',
      'settings.supabaseKey':        'Public Key',
      'settings.saveConfig':         'Save Config',
      'settings.configSaved':        'Config saved',
      'settings.reloadNeeded':       'Page reload required',
      'settings.connectionStatus':   'Connection Status',
      'settings.sessionInfo':        'Session Info',
      'settings.role':               'Role',
      'settings.permissions':        'Permissions',
      'settings.anonymousKey':       'Anon key',
      'settings.networkSimulation':  'Network Simulation',
      'settings.offlineMode':        'Offline Mode',
      'settings.offlineHint':        'Test offline operation',

      /* ─── KPI Labels ─────────────────────────────────────────────── */
      'kpi.vault.label':             'Vault Balance (24K)',
      'kpi.vault.meta':              'Aggregated across branches',
      'kpi.sales.label':             "Today's Sales",
      'kpi.sales.meta':              'Cash + card + Instapay',
      'kpi.goldSold.label':          'Gold Sold Today',
      'kpi.goldSold.meta':           'Net pure weight',
      'kpi.txns.label':              'Invoice Count',
      'kpi.txns.meta':               'Updated just now',
      'kpi.suppliers.label':         'Supplier Gold Balances',
      'kpi.suppliers.meta':          'Payable to suppliers',
      'kpi.cacheHit.label':          'Cache Hit Rate',
      'kpi.cacheHit.meta':           'Local search efficiency',
      'kpi.queue.label':             'Sync Queue',
      'kpi.queue.meta':              'Pending upload',
      'kpi.deadStock.label':         'Dead Capital',
      'kpi.deadStock.meta':          'Stale inventory',

      /* ─── Toast Messages ─────────────────────────────────────────── */
      'toast.saved.title':           'Saved successfully',
      'toast.saved.desc':            'Operation completed',
      'toast.deleted.title':         'Deleted',
      'toast.deleted.desc':          'Item permanently deleted',
      'toast.error.title':           'Error occurred',
      'toast.error.desc':            'Operation failed, please retry',
      'toast.warning.title':         'Warning',
      'toast.info.title':            'Info',
      'toast.copied':                'Copied to clipboard',
      'toast.syncComplete':          'Sync complete',
      'toast.langChanged':           'Language switched',
      'toast.themeChanged':          'Theme switched',
      'toast.offline':               'Connection lost — working offline',
      'toast.online':                'Connection restored — pushing queue',
      'toast.batchSaved':            'Batch saved',
      'toast.itemAdded':             'Item added',
      'toast.itemRemoved':           'Item removed',

      /* ─── Modal Titles ───────────────────────────────────────────── */
      'modal.confirm.title':         'Confirm Operation',
      'modal.delete.title':          'Confirm Deletion',
      'modal.delete.message':        'Item will be permanently deleted. Cannot be undone.',
      'modal.unsaved.title':         'Unsaved Changes',
      'modal.unsaved.message':       'You have unsaved changes. Leave anyway?',
      'modal.save':                  'Save',
      'modal.discard':               'Discard',
      'modal.ok':                    'OK',

      /* ─── Errors ─────────────────────────────────────────────────── */
      'err.required':                'This field is required',
      'err.invalidEmail':            'Invalid email',
      'err.invalidPhone':            'Invalid phone number',
      'err.invalidSku':              'Invalid SKU',
      'err.invalidWeight':           'Weight must be greater than zero',
      'err.invalidPrice':            'Invalid price',
      'err.invalidPurity':           'Purity must be between 0.4 and 1.0',
      'err.tooLong':                 'Text too long',
      'err.tooShort':                'Text too short',
      'err.invalidFormat':           'Invalid format',
      'err.networkError':            'Network error',
      'err.permissionDenied':        'Not authorized for this operation',
      'err.notFound':                'Item not found',
      'err.alreadyExists':           'Item already exists',
      'err.duplicateSku':            'SKU already in use',
      'err.noData':                  'No data available',
      'err.connectionLost':          'Connection lost',
      'err.storageQuotaExceeded':    'Storage quota exceeded',
      'err.indexedDBFailed':         'IndexedDB access failed',
      'err.failedToSave':            'Failed to save',
      'err.failedToLoad':            'Failed to load',
      'err.failedToDelete':          'Failed to delete',
      'err.failedToSync':            'Sync failed',
      'err.permissionDeniedDesc':    'This page is restricted to authorized users',

      /* ─── Confirmations ──────────────────────────────────────────── */
      'confirm.areYouSure':          'Are you sure?',
      'confirm.yes':                 'Yes',
      'confirm.no':                  'No',
      'confirm.delete':              'Delete',
      'confirm.cancel':              'Cancel',
      'confirm.continue':            'Continue',
      'confirm.close':               'Close',

      /* ─── Placeholders ───────────────────────────────────────────── */
      'ph.search':                   'Search…',
      'ph.searchSku':                'Search by SKU…',
      'ph.searchName':               'Search by name…',
      'ph.searchPhone':              '01xxxxxxxxx',
      'ph.searchInvoice':            'Search by invoice number…',
      'ph.notes':                    'Type your notes here…',
      'ph.optional':                 'Optional',
      'ph.selectBranch':             'Select branch…',
      'ph.selectManufacturer':       'Select manufacturer…',
      'ph.selectSupplier':           'Select supplier…',
      'ph.selectCustomer':           'Select customer…',
      'ph.selectRole':               'Select role…',
      'ph.selectRep':                'Select rep…',

      /* ─── Wholesale & Transfers ──────────────────────────────────── */
      'wsl.title':                   'Wholesale & Branch Transfers',
      'wsl.subtitle':                'B2B Sales · Inter-Branch Transfers · Gold Exchange',
      'wsl.tab.wholesale':           'Wholesale Invoices',
      'wsl.tab.transfers':           'Branch Transfers',
      'wsl.mode.wholesale':          'Wholesale (B2B)',
      'wsl.mode.inter_branch':       'Inter-Branch Transfer',
      'wsl.mode.retail':             'Retail',
      'wsl.pay.cash':                'Cash Payment',
      'wsl.pay.goldExchange':        'Gold Exchange',
      'wsl.pay.credit':              'On Credit',
      'wsl.pay.mixed':               'Mixed Payment',
      'wsl.status.draft':            'Draft',
      'wsl.status.confirmed':        'Confirmed',
      'wsl.status.partial':          'Partially Paid',
      'wsl.status.paid':             'Paid',
      'wsl.status.cancelled':        'Cancelled',
      'wsl.action.newInvoice':       'New Wholesale Invoice',
      'wsl.action.newTransfer':      'New Transfer Order',
      'wsl.action.printInvoice':     'Print Invoice',
      'wsl.action.printManifest':    'Print Manifest',

      /* ─── ✅ B2B Sellers (v4 new) ──────────────────────────────── */
      'b2b.title':                   'B2B Sales Representatives',
      'b2b.subtitle':                'Independent B2B entities with isolated cash & gold treasuries',
      'b2b.tab.reps':                'Sales Reps',
      'b2b.tab.customers':           'B2B Customers',
      'b2b.tab.audit':               'Manager Audit',
      'b2b.tab.settlements':         'Settlements',

      /* Reps */
      'b2b.rep.title':               'Sales Reps',
      'b2b.rep.new':                 'New B2B Rep',
      'b2b.rep.edit':                'Edit Rep',
      'b2b.rep.code':                'Rep Code',
      'b2b.rep.name':                'Rep Name',
      'b2b.rep.phone':               'Phone',
      'b2b.rep.pin':                 'PIN Code',
      'b2b.rep.pinHint':             '4-6 digits for quick access',
      'b2b.rep.branch':              'Assigned Branch',
      'b2b.rep.openingCash':         'Opening Cash (EGP)',
      'b2b.rep.openingGold':         'Opening Gold (Pure 24K)',
      'b2b.rep.treasury':            'Treasury',
      'b2b.rep.cashDrawer':          'Cash Drawer',
      'b2b.rep.goldDrawer':          'Gold Drawer',
      'b2b.rep.totalValue':          'Total Treasury Value',
      'b2b.rep.settle':              'Settle Account',
      'b2b.rep.settleRequest':       'Request Settlement',
      'b2b.rep.manualEntry':         'Manual Entry',
      'b2b.rep.active':              'Active',
      'b2b.rep.inactive':            'Inactive',
      'b2b.rep.myTreasury':          'My Treasury',
      'b2b.rep.isolatedView':        'Isolated view — you only see your data',
      'b2b.rep.deleteWarning':       'Rep will be deleted. Cannot be undone.',
      'b2b.rep.deleteWarningSoft':   'Has transactions — will be disabled instead.',
      'b2b.rep.autoDisabled':        'Rep disabled',

      /* Customers */
      'b2b.customer.title':          'B2B Customers',
      'b2b.customer.new':            'New B2B Customer',
      'b2b.customer.edit':           'Edit Customer',
      'b2b.customer.code':           'Code',
      'b2b.customer.name':           'Customer Name',
      'b2b.customer.phone':          'Phone',
      'b2b.customer.address':        'Address',
      'b2b.customer.taxId':          'Tax ID',
      'b2b.customer.responsibleRep': 'Responsible Rep',
      'b2b.customer.openingCash':    'Opening Cash Debt (EGP)',
      'b2b.customer.openingGold':    'Opening Gold Debt (Pure)',
      'b2b.customer.creditLimit':    'Credit Limit (EGP)',
      'b2b.customer.balance':        'Balance',
      'b2b.customer.cashDebt':       'Cash Debt',
      'b2b.customer.goldDebt':       'Gold Debt',
      'b2b.customer.totalValue':     'Total Value',
      'b2b.customer.ledger':         'Ledger',
      'b2b.customer.ledgerTitle':    'Customer Ledger',
      'b2b.customer.addMovement':    'Add Movement',
      'b2b.customer.noCustomers':    'No B2B customers',
      'b2b.customer.noCustomersHint':'Start by adding a new B2B customer',

      /* Ledger Types */
      'b2b.ledger.invoice':          'Wholesale Invoice',
      'b2b.ledger.invoiceCredit':    'Credit Invoice',
      'b2b.ledger.cashReceived':     'Cash Received',
      'b2b.ledger.cashPayment':      'Cash Payment',
      'b2b.ledger.goldReceived':     'Gold Received',
      'b2b.ledger.goldDelivered':    'Gold Delivered',
      'b2b.ledger.adjustment':       'Manual Adjustment',
      'b2b.ledger.settlement':       'Shop Settlement',
      'b2b.ledger.opening':          'Opening Balance',

      /* Movement Types */
      'b2b.movement.cashFromCustomer': 'Cash From Customer',
      'b2b.movement.cashToCustomer':   'Cash To Customer',
      'b2b.movement.goldFromCustomer': 'Gold From Customer',
      'b2b.movement.goldToCustomer':   'Gold To Customer',
      'b2b.movement.notes':            'Notes',
      'b2b.movement.notesPlaceholder': 'Movement description…',
      'b2b.movement.save':             'Save Movement',
      'b2b.movement.saved':            'Movement recorded',

      /* Treasury */
      'b2b.treasury.cash':           'Cash',
      'b2b.treasury.gold':           'Gold',
      'b2b.treasury.value':          'Value',
      'b2b.treasury.distribution':   'Gold Distribution by Karat',
      'b2b.treasury.customGold':     'Custom',
      'b2b.treasury.availableCash':  'Available Cash',
      'b2b.treasury.availableGold':  'Available Gold',
      'b2b.treasury.totalCash':      'Total Reps Treasury (Cash)',
      'b2b.treasury.goldAvailable':  'Available Gold',

      /* Settlement */
      'b2b.settlement.title':        'Settlements',
      'b2b.settlement.new':          'New Settlement',
      'b2b.settlement.no':           'Settlement No.',
      'b2b.settlement.status':       'Status',
      'b2b.settlement.amount':       'Cash Amount',
      'b2b.settlement.goldWeight':   'Gold Weight',
      'b2b.settlement.approve':      'Approve',
      'b2b.settlement.reject':       'Reject',
      'b2b.settlement.approved':     'Approved',
      'b2b.settlement.rejected':     'Rejected',
      'b2b.settlement.sendToManager':'Send to Manager',
      'b2b.settlement.sent':         'Settlement sent to manager',
      'b2b.settlement.awaitingApproval': 'Awaiting manager approval',
      'b2b.settlement.confirmApprove': 'Settlement will be approved and deducted from rep treasury. Continue?',
      'b2b.settlement.rejectReason': 'Rejection Reason',
      'b2b.settlement.pending':      'Pending',
      'b2b.settlement.approved_value': 'Approved',
      'b2b.settlement.details':      'Settlement Details',
      'b2b.settlement.before':       'Balance Before Settlement',
      'b2b.settlement.createdBy':    'Created By',
      'b2b.settlement.approvedBy':   'Approved By',

      /* Audit Dashboard */
      'b2b.audit.title':             'Manager Audit Dashboard',
      'b2b.audit.subtitle':          'Rep performance comparison',
      'b2b.audit.repName':           'Rep',
      'b2b.audit.cashTreasury':      'Cash Treasury',
      'b2b.audit.goldTreasury':      'Gold Treasury',
      'b2b.audit.goldValue':         'Gold Value',
      'b2b.audit.customersCount':    'B2B Customers',
      'b2b.audit.salesTotal':        'Period Sales',
      'b2b.audit.invoicesCount':     'Invoices',
      'b2b.audit.action':            'Action',

      /* KPI Cards */
      'b2b.kpi.reps':                'B2B Reps',
      'b2b.kpi.activeReps':          'Active',
      'b2b.kpi.totalReps':           'Total Reps',
      'b2b.kpi.totalRepCash':        'Total Reps Treasury (Cash)',
      'b2b.kpi.totalRepGold':        'Total Reps Treasury (Gold)',
      'b2b.kpi.customers':           'B2B Customers',
      'b2b.kpi.customerDebts':       'Debts',
      'b2b.kpi.pendingSettlements':  'Settlements',
      'b2b.kpi.approvedValue':       'Approved',
      'b2b.kpi.goldLabel':           'Gold',
      'b2b.kpi.cashLabel':           'Cash',

      /* Errors & Warnings */
      'b2b.err.repRequired':         'Rep is required',
      'b2b.err.customerRequired':    'Customer is required',
      'b2b.err.accessDenied':        'Not authorized to access this rep data',
      'b2b.err.noRepAssigned':       'Your account is not linked to a rep',
      'b2b.err.noRepAssignedHint':   'Contact manager to link your account',
      'b2b.err.insufficientCash':    'Amount exceeds cash treasury balance',
      'b2b.err.insufficientGold':    'Weight exceeds gold treasury balance',
      'b2b.err.treasuryChanged':     'Treasury changed — please retry',
      'b2b.err.cannotDisableSelf':   'You cannot disable your own account',
      'b2b.warn.isolatedView':       'Isolated view — you only see your data',

      /* Confirmations */
      'b2b.confirm.clearData':       'Final warning: all B2B data will be deleted. Type "حذف" to continue.',
      'b2b.confirm.deleteRep':       'Rep will be permanently deleted. Continue?',
      'b2b.confirm.deleteCustomer':  'Customer will be permanently deleted. Continue?',

      /* ─── Pluralization (English) ────────────────────────────────── */
      'plural.items.zero':           'No items',
      'plural.items.one':            '1 item',
      'plural.items.two':            '2 items',
      'plural.items.few':            '{{count}} items',
      'plural.items.many':           '{{count}} items',
      'plural.items.other':          '{{count}} items',

      'plural.invoices.zero':        'No invoices',
      'plural.invoices.one':         '1 invoice',
      'plural.invoices.two':         '2 invoices',
      'plural.invoices.few':         '{{count}} invoices',
      'plural.invoices.many':        '{{count}} invoices',
      'plural.invoices.other':       '{{count}} invoices',

      'plural.days.zero':            'Today',
      'plural.days.one':             '1 day',
      'plural.days.two':             '2 days',
      'plural.days.few':             '{{count}} days',
      'plural.days.many':            '{{count}} days',
      'plural.days.other':           '{{count}} days',

      'plural.hours.zero':           'Now',
      'plural.hours.one':            '1 hour',
      'plural.hours.two':            '2 hours',
      'plural.hours.few':            '{{count}} hours',
      'plural.hours.many':           '{{count}} hours',
      'plural.hours.other':          '{{count}} hours',

      'plural.pieces.zero':          'No pieces',
      'plural.pieces.one':           '1 piece',
      'plural.pieces.two':           '2 pieces',
      'plural.pieces.few':           '{{count}} pieces',
      'plural.pieces.many':          '{{count}} pieces',
      'plural.pieces.other':         '{{count}} pieces',

      /* ─── Number Formatting Labels ───────────────────────────────── */
      'fmt.number':                  'Large Number',
      'fmt.weight':                  'Weight in grams',
      'fmt.currency':                'Currency (EGP)',
      'fmt.date':                    'Date',
      'fmt.datetime':                'Date & Time',
      'fmt.relative':                'Relative Time',
      'fmt.percent':                 'Percentage',

      /* ─── Receipt ────────────────────────────────────────────────── */
      'receipt.title':               'Gold Sale Receipt',
      'receipt.returnTitle':         'Return Receipt',
      'receipt.buybackTitle':        'Scrap Buyback Receipt',
      'receipt.supplierReturnTitle': 'Supplier Return Receipt',
      'receipt.meltingTitle':        'Melting Receipt',
      'receipt.no':                  'Receipt No.',
      'receipt.date':                'Date',
      'receipt.customer':            'Customer',
      'receipt.customerPhone':       'Customer Phone',
      'receipt.branch':              'Branch',
      'receipt.item':                'Item',
      'receipt.karat':               'Carat',
      'receipt.weight':              'Net Weight',
      'receipt.pure':                '24K Pure',
      'receipt.workmanship':         'Workmanship',
      'receipt.total':               'Total',
      'receipt.customerSignature':   'Customer Signature',
      'receipt.cashierSignature':    'Cashier Signature',
      'receipt.managerSignature':    'Manager Signature',
      'receipt.thanks':              'Thank you for your business',
      'receipt.warrantyNote':        'No returns or exchanges after 14 days',
      'receipt.alertSuspicious':     'Suspicious loss — safety threshold exceeded',
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §2 · I18N STATE & CONFIG
     ═════════════════════════════════════════════════════════════════════ */
  const STATE = {
    lang: 'ar',
    dir: 'rtl',
    locale: 'ar-EG',
    listeners: new Set(),
  };

  const LANG_META = {
    ar: { dir: 'rtl', locale: 'ar-EG', name: 'العربية', flag: '🇪🇬' },
    en: { dir: 'ltr', locale: 'en-GB', name: 'English', flag: '🇬🇧' },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §3 · INTERPOLATION
     ═════════════════════════════════════════════════════════════════════ */

  function interpolate(str, params) {
    if (!params || typeof str !== 'string') return str;
    return str.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
      const v = params[key];
      return v === undefined || v === null ? '' : String(v);
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §4 · PLURAL RULES
     ═════════════════════════════════════════════════════════════════════ */

  function arabicPluralForm(n) {
    const abs = Math.abs(Number(n) || 0);
    if (abs === 0) return 'zero';
    if (abs === 1) return 'one';
    if (abs === 2) return 'two';
    if (abs % 100 >= 3 && abs % 100 <= 10) return 'few';
    if (abs % 100 >= 11 && abs % 100 <= 99) return 'many';
    return 'other';
  }

  function englishPluralForm(n) {
    const abs = Math.abs(Number(n) || 0);
    if (abs === 0) return 'zero';
    if (abs === 1) return 'one';
    if (abs === 2) return 'two';
    return 'other';
  }

  /* ═════════════════════════════════════════════════════════════════════
     §5 · I18N CORE
     ═════════════════════════════════════════════════════════════════════ */
  const I18n = {

    get lang() { return STATE.lang; },
    get dir() { return STATE.dir; },
    get locale() { return STATE.locale; },
    get isRTL() { return STATE.dir === 'rtl'; },
    get isLTR() { return STATE.dir === 'ltr'; },

    t(key, params) {
      try {
        if (!key) return '';

        let str = TRANSLATIONS[STATE.lang]?.[key];

        if (str === undefined) str = TRANSLATIONS.en?.[key];
        if (str === undefined) str = TRANSLATIONS.ar?.[key];
        if (str === undefined) str = key;

        return interpolate(str, params);
      } catch (e) {
        console.warn('[I18n.t] error for key:', key, e);
        return String(key || '');
      }
    },

    tn(baseKey, count, extraParams) {
      try {
        const n = Number(count) || 0;
        const form = STATE.lang === 'ar'
          ? arabicPluralForm(n)
          : englishPluralForm(n);

        let key = `${baseKey}.${form}`;
        let str = TRANSLATIONS[STATE.lang]?.[key];

        if (str === undefined) str = TRANSLATIONS[STATE.lang]?.[`${baseKey}.other`];
        if (str === undefined) str = TRANSLATIONS[STATE.lang]?.[baseKey];
        if (str === undefined) str = TRANSLATIONS.en?.[key];
        if (str === undefined) str = TRANSLATIONS.en?.[`${baseKey}.other`];
        if (str === undefined) str = TRANSLATIONS.ar?.[key];
        if (str === undefined) str = TRANSLATIONS.ar?.[`${baseKey}.other`];
        if (str === undefined) str = baseKey;

        return interpolate(str, { count: n, n, ...(extraParams || {}) });
      } catch (e) {
        console.warn('[I18n.tn] error for key:', baseKey, e);
        return String(baseKey || '');
      }
    },

    setLang(lang, opts = {}) {
      const { silent = false } = opts;

      if (!LANG_META[lang]) lang = 'ar';
      if (lang === STATE.lang && !silent) return;

      const meta = LANG_META[lang];
      const prevLang = STATE.lang;
      const prevDir = STATE.dir;

      STATE.lang = lang;
      STATE.dir = meta.dir;
      STATE.locale = meta.locale;

      try {
        localStorage.setItem(GMS.LS_KEYS.LANG, lang);
      } catch (_) {}

      try {
        const html = document.documentElement;
        html.setAttribute('lang', lang);
        html.setAttribute('dir', STATE.dir);
        html.setAttribute('data-lang', lang);
      } catch (e) {
        console.error('[I18n.setLang] <html> update failed:', e);
      }

      try {
        I18n.applyTo(document);
      } catch (e) {
        console.error('[I18n.setLang] applyTo failed:', e);

        STATE.lang = prevLang;
        STATE.dir = prevDir;
        STATE.locale = LANG_META[prevLang].locale;

        try {
          const html = document.documentElement;
          html.setAttribute('lang', prevLang);
          html.setAttribute('dir', prevDir);
          html.setAttribute('data-lang', prevLang);
        } catch (_) {}

        throw e;
      }

      STATE.listeners.forEach(fn => {
        try {
          fn(lang, STATE.dir);
        } catch (e) {
          console.error('[I18n.listener] error:', e);
        }
      });
    },

    toggle() {
      I18n.setLang(STATE.lang === 'ar' ? 'en' : 'ar');
    },

    on(event, fn) {
      if (event === 'change' && typeof fn === 'function') {
        STATE.listeners.add(fn);
        return () => STATE.listeners.delete(fn);
      }
      return () => {};
    },

    applyTo(root) {
      root = root || document;
      if (!root) return;

      if (typeof GMS.$$ !== 'function') {
        console.warn('[I18n.applyTo] GMS.$$ غير متاح — تم التخطي');
        return;
      }

      const safeQuery = (sel) => {
        try {
          return GMS.$$(sel, root);
        } catch (e) {
          console.warn('[I18n.applyTo] query failed for:', sel, e);
          return [];
        }
      };

      safeQuery('[data-i18n]').forEach(el => {
        try {
          const key = el.getAttribute('data-i18n');
          if (key) el.textContent = I18n.t(key);
        } catch (_) {}
      });

      safeQuery('[data-i18n-html]').forEach(el => {
        try {
          const key = el.getAttribute('data-i18n-html');
          if (key) el.innerHTML = I18n.t(key);
        } catch (_) {}
      });

      safeQuery('[data-i18n-attr]').forEach(el => {
        try {
          const spec = el.getAttribute('data-i18n-attr');
          if (!spec) return;
          spec.split(',').forEach(pair => {
            const [attr, key] = pair.split(':').map(s => s.trim());
            if (attr && key) el.setAttribute(attr, I18n.t(key));
          });
        } catch (_) {}
      });

      safeQuery('[data-i18n-placeholder]').forEach(el => {
        try {
          const key = el.getAttribute('data-i18n-placeholder');
          if (key) el.setAttribute('placeholder', I18n.t(key));
        } catch (_) {}
      });

      safeQuery('[data-i18n-title]').forEach(el => {
        try {
          const key = el.getAttribute('data-i18n-title');
          if (key) el.setAttribute('title', I18n.t(key));
        } catch (_) {}
      });

      safeQuery('[data-i18n-aria]').forEach(el => {
        try {
          const key = el.getAttribute('data-i18n-aria');
          if (key) el.setAttribute('aria-label', I18n.t(key));
        } catch (_) {}
      });

      safeQuery('[data-i18n-plural]').forEach(el => {
        try {
          const base = el.getAttribute('data-i18n-plural');
          const count = Number(el.getAttribute('data-i18n-count')) || 0;
          if (base) el.textContent = I18n.tn(base, count);
        } catch (_) {}
      });
    },

    formatNumber(n, decimals = 0) {
      const v = Number(n);
      if (!isFinite(v)) return '—';
      return new Intl.NumberFormat(STATE.locale, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(v);
    },

    formatCurrency(n, currency = 'EGP', decimals = 2) {
      const v = Number(n);
      if (!isFinite(v)) return '—';
      try {
        return new Intl.NumberFormat(STATE.locale, {
          style: 'currency',
          currency,
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        }).format(v);
      } catch (_) {
        return I18n.formatNumber(v, decimals) + ' ' + currency;
      }
    },

    formatPercent(n, decimals = 1) {
      const v = Number(n);
      if (!isFinite(v)) return '—';
      return new Intl.NumberFormat(STATE.locale, {
        style: 'percent',
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(v / 100);
    },

    formatDate(d, opts = {}) {
      const date = d instanceof Date ? d : new Date(d);
      if (isNaN(date.getTime())) return '—';
      const defaults = { year: 'numeric', month: '2-digit', day: '2-digit' };
      return new Intl.DateTimeFormat(STATE.locale, { ...defaults, ...opts }).format(date);
    },

    formatDateTime(d) {
      const date = d instanceof Date ? d : new Date(d);
      if (isNaN(date.getTime())) return '—';
      return new Intl.DateTimeFormat(STATE.locale, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
    },

    formatTime(d) {
      const date = d instanceof Date ? d : new Date(d);
      if (isNaN(date.getTime())) return '—';
      return new Intl.DateTimeFormat(STATE.locale, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(date);
    },

    formatRelative(d) {
      const date = d instanceof Date ? d : new Date(d);
      if (isNaN(date.getTime())) return '—';

      const diff = Date.now() - date.getTime();
      const abs = Math.abs(diff);
      const sec = Math.floor(abs / 1000);
      const min = Math.floor(sec / 60);
      const hr = Math.floor(min / 60);
      const day = Math.floor(hr / 24);

      const isFuture = diff < 0;
      const rtf = new Intl.RelativeTimeFormat(STATE.lang, { numeric: 'auto' });

      if (sec < 45) return rtf.format(isFuture ? 1 : -1, 'second');
      if (min < 45) return rtf.format(isFuture ? min : -min, 'minute');
      if (hr < 22) return rtf.format(isFuture ? hr : -hr, 'hour');
      if (day < 30) return rtf.format(isFuture ? day : -day, 'day');
      return I18n.formatDate(date);
    },

    init() {
      let saved = null;
      try {
        saved = localStorage.getItem(GMS.LS_KEYS.LANG);
      } catch (_) {}

      if (!saved) {
        const browser = (navigator.language || 'ar').toLowerCase();
        saved = browser.startsWith('ar') ? 'ar' : 'en';
      }

      try {
        I18n.setLang(saved, { silent: true });
        I18n.applyTo(document);
      } catch (e) {
        console.error('[I18n.init] failed:', e);
        try {
          document.documentElement.setAttribute('lang', 'ar');
          document.documentElement.setAttribute('dir', 'rtl');
        } catch (_) {}
      }

      return I18n;
    },

    getAvailableLangs() {
      return Object.entries(LANG_META).map(([key, meta]) => ({
        key,
        name: meta.name,
        flag: meta.flag,
      }));
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §6 · EXPORT
     ═════════════════════════════════════════════════════════════════════ */
  GMS.I18n = I18n;
  GMS.TRANSLATIONS = TRANSLATIONS;

  GMS.t = (key, params) => {
    try {
      return I18n.t(key, params);
    } catch (e) {
      console.warn('[GMS.t] error:', e);
      return String(key || '');
    }
  };

  GMS.tn = (base, count, params) => {
    try {
      return I18n.tn(base, count, params);
    } catch (e) {
      console.warn('[GMS.tn] error:', e);
      return String(base || '');
    }
  };

  /* ═════════════════════════════════════════════════════════════════════
     §7 · LOADED CONFIRMATION
     ═════════════════════════════════════════════════════════════════════ */
  console.log(
    '%c🌍 i18n v4 loaded · AR + EN · RTL/LTR · Pluralization · B2B',
    'color:#6b3fa0;font-weight:800;font-size:12px;padding:1px 5px;' +
    'background:#f0e9fa;border-radius:4px;'
  );

  console.log(
    `%c📚 ${Object.keys(TRANSLATIONS.ar).length} AR keys · ` +
    `${Object.keys(TRANSLATIONS.en).length} EN keys · ` +
    `${LANG_META.ar.name} / ${LANG_META.en.name}`,
    'color:#6b7a95;font-weight:700;font-size:11px;'
  );

  console.log(
    `%c🆕 v4: B2B translations (reps, customers, treasuries, settlements) · nav.b2b · role.B2B_REP`,
    'color:#0f7a43;font-weight:900;font-size:11px;'
  );

  /* ═════════════════════════════════════════════════════════════════════
     ✅ js/03-i18n.js — نهاية الملف
     ═════════════════════════════════════════════════════════════════════ */

})();
