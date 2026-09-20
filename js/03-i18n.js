/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ENTERPRISE — js/03-i18n.js
   نظام الترجمة: عربي (مصري) + إنجليزي مع RTL/LTR والجمع
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const GMS = window.GMS = window.GMS || {};

  /* ═════════════════════════════════════════════════════════════════════
     §1 · TRANSLATIONS DICTIONARY
     ─────────────────────────────────────────────────────────────────────
     كامل شامل كل النصوص في النظام
     ═════════════════════════════════════════════════════════════════════ */
  const TRANSLATIONS = {

    /* ═══════════════════════════════════════════════════════════════════
       ARABIC (المصرية الفصحى المبسطة للتعامل اليومي)
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
      'nav.audit':                   'سجل الحركات',
      'nav.ledger':                  'دفتر الأستاذ',
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

      /* ─── Pluralization (English 2 forms) ────────────────────────── */
      'pluralE.items.zero':          'No items',
      'pluralE.items.one':           '1 item',
      'pluralE.items.other':         '{{count}} items',

      'pluralE.invoices.zero':       'No invoices',
      'pluralE.invoices.one':        '1 invoice',
      'pluralE.invoices.other':      '{{count}} invoices',

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
      'nav.audit':                   'Audit Log',
      'nav.ledger':                  'General Ledger',
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

  /**
   * استبدال {{key}} بقيم params
   * @param {string} str
   * @param {Object} [params]
   * @returns {string}
   */
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

  /**
   * قاعدة الجمع العربية (CLDR-compatible)
   * @param {number} n
   * @returns {'zero'|'one'|'two'|'few'|'many'|'other'}
   */
  function arabicPluralForm(n) {
    const abs = Math.abs(Number(n) || 0);
    if (abs === 0) return 'zero';
    if (abs === 1) return 'one';
    if (abs === 2) return 'two';
    if (abs % 100 >= 3 && abs % 100 <= 10) return 'few';
    if (abs % 100 >= 11 && abs % 100 <= 99) return 'many';
    return 'other';
  }

  /**
   * قاعدة الجمع الإنجليزية
   * @param {number} n
   * @returns {'zero'|'one'|'two'|'other'}
   */
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

    /* ─── Public getters ──────────────────────────────────────────── */
    get lang() { return STATE.lang; },
    get dir() { return STATE.dir; },
    get locale() { return STATE.locale; },
    get isRTL() { return STATE.dir === 'rtl'; },
    get isLTR() { return STATE.dir === 'ltr'; },

    /**
     * ترجمة مفتاح
     * @param {string} key
     * @param {Object} [params]
     * @returns {string}
     */
    t(key, params) {
      if (!key) return '';

      let str = TRANSLATIONS[STATE.lang]?.[key];

      // fallback إلى الإنجليزية
      if (str === undefined) str = TRANSLATIONS.en?.[key];

      // fallback للمفتاح نفسه
      if (str === undefined) str = key;

      return interpolate(str, params);
    },

    /**
     * ترجمة مع جمع
     * @param {string} baseKey
     * @param {number} count
     * @param {Object} [extraParams]
     * @returns {string}
     */
    tn(baseKey, count, extraParams) {
      const n = Number(count) || 0;
      const form = STATE.lang === 'ar'
        ? arabicPluralForm(n)
        : englishPluralForm(n);

      let key = `${baseKey}.${form}`;
      let str = TRANSLATIONS[STATE.lang]?.[key];

      // fallback
      if (str === undefined) str = TRANSLATIONS[STATE.lang]?.[`${baseKey}.other`];
      if (str === undefined) str = TRANSLATIONS[STATE.lang]?.[baseKey];
      if (str === undefined) str = TRANSLATIONS.en?.[key];
      if (str === undefined) str = TRANSLATIONS.en?.[`${baseKey}.other`];
      if (str === undefined) str = baseKey;

      return interpolate(str, { count: n, n, ...(extraParams || {}) });
    },

    /**
     * تبديل اللغة
     * @param {'ar'|'en'} lang
     * @param {Object} [opts]
     * @param {boolean} [opts.silent=false]
     */
    setLang(lang, opts = {}) {
      const { silent = false } = opts;

      if (!LANG_META[lang]) lang = 'ar';
      if (lang === STATE.lang && !silent) return;

      const meta = LANG_META[lang];
      STATE.lang = lang;
      STATE.dir = meta.dir;
      STATE.locale = meta.locale;

      // حفظ
      try {
        localStorage.setItem(GMS.LS_KEYS.LANG, lang);
      } catch (_) {}

      // تحديث HTML
      const html = document.documentElement;
      html.setAttribute('lang', lang);
      html.setAttribute('dir', STATE.dir);
      html.setAttribute('data-lang', lang);

      // ترجمة الصفحة
      I18n.applyTo(document);

      // إبلاغ المستمعين
      STATE.listeners.forEach(fn => {
        try { fn(lang, STATE.dir); } catch (e) { console.error('[I18n]', e); }
      });
    },

    /**
     * تبديل اللغة (عربي ↔ إنجليزي)
     */
    toggle() {
      I18n.setLang(STATE.lang === 'ar' ? 'en' : 'ar');
    },

    /**
     * الاشتراك في تغيير اللغة
     * @param {'change'} event
     * @param {Function} fn
     * @returns {Function} unsubscribe
     */
    on(event, fn) {
      if (event === 'change' && typeof fn === 'function') {
        STATE.listeners.add(fn);
        return () => STATE.listeners.delete(fn);
      }
      return () => {};
    },

    /**
     * ترجمة DOM subtree
     * @param {Element|Document} [root=document]
     */
    applyTo(root) {
      root = root || document;

      // 1 · data-i18n
      GMS.$$('[data-i18n]', root).forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (key) el.textContent = I18n.t(key);
      });

      // 2 · data-i18n-html
      GMS.$$('[data-i18n-html]', root).forEach(el => {
        const key = el.getAttribute('data-i18n-html');
        if (key) el.innerHTML = I18n.t(key);
      });

      // 3 · data-i18n-attr="placeholder:key,title:key"
      GMS.$$('[data-i18n-attr]', root).forEach(el => {
        const spec = el.getAttribute('data-i18n-attr');
        if (!spec) return;
        spec.split(',').forEach(pair => {
          const [attr, key] = pair.split(':').map(s => s.trim());
          if (attr && key) el.setAttribute(attr, I18n.t(key));
        });
      });

      // 4 · data-i18n-placeholder
      GMS.$$('[data-i18n-placeholder]', root).forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (key) el.setAttribute('placeholder', I18n.t(key));
      });

      // 5 · data-i18n-title
      GMS.$$('[data-i18n-title]', root).forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        if (key) el.setAttribute('title', I18n.t(key));
      });

      // 6 · data-i18n-aria
      GMS.$$('[data-i18n-aria]', root).forEach(el => {
        const key = el.getAttribute('data-i18n-aria');
        if (key) el.setAttribute('aria-label', I18n.t(key));
      });

      // 7 · data-i18n-plural
      GMS.$$('[data-i18n-plural]', root).forEach(el => {
        const base = el.getAttribute('data-i18n-plural');
        const count = Number(el.getAttribute('data-i18n-count')) || 0;
        if (base) el.textContent = I18n.tn(base, count);
      });
    },

    /* ─── Formatters ──────────────────────────────────────────────── */

    /**
     * تنسيق رقم حسب اللغة
     * @param {number} n
     * @param {number} [decimals=0]
     * @returns {string}
     */
    formatNumber(n, decimals = 0) {
      const v = Number(n);
      if (!isFinite(v)) return '—';
      return new Intl.NumberFormat(STATE.locale, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(v);
    },

    /**
     * تنسيق مبلغ مالي
     * @param {number} n
     * @param {string} [currency='EGP']
     * @param {number} [decimals=2]
     * @returns {string}
     */
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

    /**
     * تنسيق نسبة مئوية
     * @param {number} n
     * @param {number} [decimals=1]
     * @returns {string}
     */
    formatPercent(n, decimals = 1) {
      const v = Number(n);
      if (!isFinite(v)) return '—';
      return new Intl.NumberFormat(STATE.locale, {
        style: 'percent',
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(v / 100);
    },

    /**
     * تنسيق تاريخ
     * @param {Date|string} d
     * @param {Object} [opts]
     * @returns {string}
     */
    formatDate(d, opts = {}) {
      const date = d instanceof Date ? d : new Date(d);
      if (isNaN(date.getTime())) return '—';
      const defaults = { year: 'numeric', month: '2-digit', day: '2-digit' };
      return new Intl.DateTimeFormat(STATE.locale, { ...defaults, ...opts }).format(date);
    },

    /**
     * تنسيق تاريخ ووقت
     * @param {Date|string} d
     * @returns {string}
     */
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

    /**
     * تنسيق وقت
     * @param {Date|string} d
     * @returns {string}
     */
    formatTime(d) {
      const date = d instanceof Date ? d : new Date(d);
      if (isNaN(date.getTime())) return '—';
      return new Intl.DateTimeFormat(STATE.locale, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(date);
    },

    /**
     * تنسيق وقت نسبي
     * @param {Date|string} d
     * @returns {string}
     */
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

    /* ─── Initialization ──────────────────────────────────────────── */

    /**
     * تهيئة نظام الترجمة
     */
    init() {
      let saved = null;
      try {
        saved = localStorage.getItem(GMS.LS_KEYS.LANG);
      } catch (_) {}

      if (!saved) {
        const browser = (navigator.language || 'ar').toLowerCase();
        saved = browser.startsWith('ar') ? 'ar' : 'en';
      }

      I18n.setLang(saved, { silent: true });
      I18n.applyTo(document);

      return I18n;
    },

    /**
     * قائمة اللغات المتاحة
     * @returns {Array<{key:string, name:string, flag:string}>}
     */
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

  /* اختصارات سريعة */
  GMS.t = (key, params) => I18n.t(key, params);
  GMS.tn = (base, count, params) => I18n.tn(base, count, params);

  /* ═════════════════════════════════════════════════════════════════════
     §7 · LOADED CONFIRMATION
     ═════════════════════════════════════════════════════════════════════ */
  console.log(
    '%c🌍 i18n loaded · AR + EN · RTL/LTR · Pluralization',
    'color:#6b3fa0;font-weight:800;font-size:12px;padding:1px 5px;' +
    'background:#f0e9fa;border-radius:4px;'
  );

  console.log(
    `%c📚 ${Object.keys(TRANSLATIONS.ar).length} AR keys · ` +
    `${Object.keys(TRANSLATIONS.en).length} EN keys · ` +
    `${LANG_META.ar.name} / ${LANG_META.en.name}`,
    'color:#6b7a95;font-weight:700;font-size:11px;'
  );

  /* ═════════════════════════════════════════════════════════════════════
     ✅ js/03-i18n.js — نهاية الملف
     ═════════════════════════════════════════════════════════════════════ */

})();