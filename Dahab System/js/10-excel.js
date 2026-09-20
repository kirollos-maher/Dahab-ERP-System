/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ENTERPRISE — js/10-excel.js
   محرك Excel شامل باستخدام SheetJS (XLSX):
     - تصدير: مخزون، فواتير، دفتر أستاذ، تقارير، حسابات
     - استيراد: ملفات XLSX/XLS/CSV مع تحقق ومعاينة
     - قوالب جاهزة للتحميل
     - معالجة بالدفعات للأداء العالي
     - تنسيق متقدم للأعمدة والخلايا
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const GMS = window.GMS = window.GMS || {};

  /* ═════════════════════════════════════════════════════════════════════
     §1 · EXCEL STATE
     ═════════════════════════════════════════════════════════════════════ */
  const ExcelState = {
    /* حالة الاستيراد الحالية */
    import: {
      file: null,
      workbook: null,
      sheetName: null,
      rawRows: [],
      parsedRows: [],
      detection: {},
      stats: {
        total: 0,
        valid: 0,
        invalid: 0,
        warned: 0,
      },
    },

    /* حالة التصدير */
    export: {
      running: false,
      lastExport: null,
    },

    /* مستمعو الأحداث */
    listeners: {
      importStart: new Set(),
      importProgress: new Set(),
      importComplete: new Set(),
      exportStart: new Set(),
      exportComplete: new Set(),
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §2 · EVENT EMITTER
     ═════════════════════════════════════════════════════════════════════ */
  function emit(event, data) {
    const set = ExcelState.listeners[event];
    if (!set) return;
    set.forEach(fn => {
      try { fn(data); } catch (e) { console.error(`[Excel.emit:${event}]`, e); }
    });
  }

  function on(event, fn) {
    const set = ExcelState.listeners[event];
    if (!set || typeof fn !== 'function') return () => {};
    set.add(fn);
    return () => set.delete(fn);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §3 · XLSX CHECK
     ═════════════════════════════════════════════════════════════════════ */
  function isXLSXAvailable() {
    return typeof window.XLSX !== 'undefined' &&
           typeof window.XLSX.utils !== 'undefined';
  }

  /* ═════════════════════════════════════════════════════════════════════
     §4 · COLUMN DEFINITIONS
     ─────────────────────────────────────────────────────────────────────
     تعريف الأعمدة القياسية لكل نوع بيانات
     ═════════════════════════════════════════════════════════════════════ */

  /* ─── المخزون ────────────────────────────────────────────────────── */
  const INVENTORY_COLUMNS = [
    { key: 'sku', label: 'كود التاج', width: 22, type: 'text', required: true },
    { key: 'category', label: 'التصنيف', width: 14, type: 'text' },
    { key: 'karat', label: 'العيار', width: 8, type: 'int', required: true },
    { key: 'weight_grams', label: 'الوزن القائم (جم)', width: 14, type: 'weight', required: true },
    { key: 'stone_weight', label: 'وزن الأحجار (جم)', width: 14, type: 'weight' },
    { key: 'net_weight', label: 'الوزن الصافي (جم)', width: 14, type: 'weight' },
    { key: 'pure_weight', label: 'البندق 24K (جم)', width: 14, type: 'weight' },
    { key: 'workmanship_per_gram', label: 'المصنعية / جرام', width: 14, type: 'money' },
    { key: 'workmanship_value', label: 'قيمة المصنعية', width: 14, type: 'money' },
    { key: 'gold_value', label: 'قيمة الذهب', width: 14, type: 'money' },
    { key: 'total_cost', label: 'الإجمالي', width: 14, type: 'money' },
    { key: 'manufacturer_code', label: 'الماركة', width: 10, type: 'text' },
    { key: 'manufacturer_name', label: 'اسم الماركة', width: 22, type: 'text' },
    { key: 'branch_name', label: 'الفرع', width: 22, type: 'text' },
    { key: 'status', label: 'الحالة', width: 14, type: 'text' },
    { key: 'created_at', label: 'تاريخ الإضافة', width: 18, type: 'date' },
  ];

  /* ─── الفواتير ───────────────────────────────────────────────────── */
  const SALES_COLUMNS = [
    { key: 'sale_no', label: 'رقم الفاتورة', width: 22, type: 'text' },
    { key: 'type', label: 'النوع', width: 14, type: 'text' },
    { key: 'customer_name', label: 'العميل', width: 22, type: 'text' },
    { key: 'cashier_name', label: 'الكاشير', width: 20, type: 'text' },
    { key: 'branch_name', label: 'الفرع', width: 22, type: 'text' },
    { key: 'item_count', label: 'عدد الأصناف', width: 12, type: 'int' },
    { key: 'total_net_weight', label: 'الوزن الصافي (جم)', width: 16, type: 'weight' },
    { key: 'total_pure_weight', label: 'البندق 24K (جم)', width: 16, type: 'weight' },
    { key: 'gold_value', label: 'قيمة الذهب', width: 14, type: 'money' },
    { key: 'total_workmanship', label: 'المصنعية', width: 14, type: 'money' },
    { key: 'grand_total', label: 'الإجمالي', width: 14, type: 'money' },
    { key: 'paid', label: 'المدفوع', width: 14, type: 'money' },
    { key: 'remaining', label: 'المتبقي', width: 14, type: 'money' },
    { key: 'payment_method', label: 'طريقة الدفع', width: 14, type: 'text' },
    { key: 'status', label: 'الحالة', width: 16, type: 'text' },
    { key: 'created_at', label: 'التاريخ', width: 18, type: 'date' },
  ];

  /* ─── دفتر الأستاذ ───────────────────────────────────────────────── */
  const LEDGER_COLUMNS = [
    { key: 'created_at', label: 'التاريخ', width: 18, type: 'date' },
    { key: 'supplier_name', label: 'المورد', width: 25, type: 'text' },
    { key: 'entry_type', label: 'نوع الحركة', width: 18, type: 'text' },
    { key: 'description', label: 'البيان', width: 30, type: 'text' },
    { key: 'reference_no', label: 'المرجع', width: 16, type: 'text' },
    { key: 'gold_delta', label: 'ذهب (جم)', width: 14, type: 'weight' },
    { key: 'cash_delta', label: 'نقد (ج.م)', width: 14, type: 'money' },
  ];

  /* ─── المرتجعات ──────────────────────────────────────────────────── */
  const RETURNS_COLUMNS = [
    { key: 'return_no', label: 'رقم المرتجع', width: 22, type: 'text' },
    { key: 'return_type', label: 'النوع', width: 18, type: 'text' },
    { key: 'sku', label: 'كود الصنف', width: 22, type: 'text' },
    { key: 'karat', label: 'العيار', width: 8, type: 'int' },
    { key: 'net_weight', label: 'الوزن الصافي', width: 14, type: 'weight' },
    { key: 'pure_weight', label: 'البندق', width: 14, type: 'weight' },
    { key: 'refund_amount', label: 'المُسترد', width: 14, type: 'money' },
    { key: 'refund_method', label: 'طريقة الاسترجاع', width: 18, type: 'text' },
    { key: 'reason', label: 'السبب', width: 20, type: 'text' },
    { key: 'customer_name', label: 'العميل', width: 22, type: 'text' },
    { key: 'created_at', label: 'التاريخ', width: 18, type: 'date' },
  ];

  /* ─── الموردين ───────────────────────────────────────────────────── */
  const SUPPLIERS_COLUMNS = [
    { key: 'code', label: 'الكود', width: 14, type: 'text' },
    { key: 'name', label: 'الاسم', width: 30, type: 'text' },
    { key: 'contact_person', label: 'الشخص المسؤول', width: 22, type: 'text' },
    { key: 'phone', label: 'الهاتف', width: 16, type: 'text' },
    { key: 'address', label: 'العنوان', width: 30, type: 'text' },
    { key: 'gold_balance', label: 'رصيد الذهب (جم)', width: 18, type: 'weight' },
    { key: 'cash_balance', label: 'الرصيد النقدي', width: 16, type: 'money' },
  ];

  /* ─── سجل التدقيق ────────────────────────────────────────────────── */
  const AUDIT_COLUMNS = [
    { key: 'created_at', label: 'التاريخ والوقت', width: 20, type: 'date' },
    { key: 'user_name', label: 'المستخدم', width: 22, type: 'text' },
    { key: 'user_role', label: 'الدور', width: 14, type: 'text' },
    { key: 'action', label: 'الحركة', width: 14, type: 'text' },
    { key: 'entity_type', label: 'الكيان', width: 16, type: 'text' },
    { key: 'description', label: 'البيان', width: 40, type: 'text' },
  ];

  /* ─── إعدادات التصدير لكل نوع ───────────────────────────────────── */
  const EXPORT_CONFIGS = {
    inventory: {
      columns: INVENTORY_COLUMNS,
      sheetName: 'المخزون',
      filename: () => `inventory_${GMS.todayISO()}`,
      title: 'تقرير المخزون',
    },
    sales: {
      columns: SALES_COLUMNS,
      sheetName: 'الفواتير',
      filename: () => `sales_${GMS.todayISO()}`,
      title: 'تقرير المبيعات',
    },
    ledger: {
      columns: LEDGER_COLUMNS,
      sheetName: 'دفتر الأستاذ',
      filename: () => `ledger_${GMS.todayISO()}`,
      title: 'دفتر أستاذ الموردين',
    },
    returns: {
      columns: RETURNS_COLUMNS,
      sheetName: 'المرتجعات',
      filename: () => `returns_${GMS.todayISO()}`,
      title: 'تقرير المرتجعات',
    },
    suppliers: {
      columns: SUPPLIERS_COLUMNS,
      sheetName: 'الموردين',
      filename: () => `suppliers_${GMS.todayISO()}`,
      title: 'قائمة الموردين',
    },
    audit: {
      columns: AUDIT_COLUMNS,
      sheetName: 'سجل التدقيق',
      filename: () => `audit_${GMS.todayISO()}`,
      title: 'سجل التدقيق',
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §5 · CELL FORMATTERS
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * تنسيق قيمة الخلية حسب النوع
   * @param {*} value
   * @param {string} type
   * @param {Object} row
   * @returns {*}
   * @private
   */
  function formatCell(value, type, row) {
    if (value === null || value === undefined) return '';

    switch (type) {
      case 'money':
        return Number(value) || 0;

      case 'weight':
        return Number(value) || 0;

      case 'int':
        return parseInt(value) || 0;

      case 'date':
        if (value instanceof Date) return value;
        try {
          const d = new Date(value);
          return isNaN(d.getTime()) ? '' : d;
        } catch (_) {
          return '';
        }

      case 'text':
      default:
        /* ترجمة الحالات الخاصة */
        if (type === 'text' && typeof value === 'string') {
          /* لا نترجم — نُبقي القيمة الأصلية */
        }
        return String(value);
    }
  }

  /**
   * تنسيق النوع لـ SheetJS
   * @param {string} type
   * @returns {string}
   * @private
   */
  function getCellFormat(type) {
    switch (type) {
      case 'money':
      case 'weight':
        return '#,##0.00';

      case 'int':
        return '#,##0';

      case 'date':
        return 'yyyy-mm-dd hh:mm';

      default:
        return '@';
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §6 · EXPORT ENGINE
     ═════════════════════════════════════════════════════════════════════ */
  const Exporter = {

    /**
     * تصدير بيانات إلى Excel
     * @param {Array<Object>} rows
     * @param {Object} config
     * @param {Array<Object>} config.columns
     * @param {string} config.sheetName
     * @param {string} config.filename
     * @param {string} [config.title]
     * @param {Object} [opts={}]
     * @param {boolean} [opts.includeFilters=true]
     * @param {Object} [opts.filters]
     * @param {boolean} [opts.includeSummary=false]
     * @param {Object} [opts.summary]
     * @returns {boolean}
     */
    export(rows, config, opts = {}) {
      if (!isXLSXAvailable()) {
        GMS.Toast.err('مكتبة Excel غير محمّلة');
        return false;
      }

      const {
        includeFilters = true,
        filters = {},
        includeSummary = false,
        summary = null,
      } = opts;

      try {
        emit('exportStart', { count: rows.length, config });

        /* ─── 1 · ورقة البيانات الرئيسية ─────────────────────────── */
        const wsData = this._buildDataSheet(rows, config.columns);

        /* ─── 2 · ورقة الملخص (اختياري) ──────────────────────────── */
        let wsSummary = null;
        if (includeSummary && summary) {
          wsSummary = this._buildSummarySheet(summary, config);
        }

        /* ─── 3 · ورقة الفلاتر (اختياري) ─────────────────────────── */
        let wsFilters = null;
        if (includeFilters && Object.keys(filters).length) {
          wsFilters = this._buildFiltersSheet(filters);
        }

        /* ─── 4 · إنشاء Workbook ─────────────────────────────────── */
        const wb = XLSX.utils.book_new();

        XLSX.utils.book_append_sheet(wb, wsData, config.sheetName || 'Sheet1');

        if (wsSummary) {
          XLSX.utils.book_append_sheet(wb, wsSummary, 'الملخص');
        }

        if (wsFilters) {
          XLSX.utils.book_append_sheet(wb, wsFilters, 'الفلاتر');
        }

        /* ─── 5 · الحفظ ──────────────────────────────────────────── */
        const filename = typeof config.filename === 'function'
          ? config.filename()
          : config.filename;

        XLSX.writeFile(wb, `${filename}.xlsx`);

        ExcelState.export.lastExport = {
          filename,
          count: rows.length,
          at: new Date().toISOString(),
        };

        emit('exportComplete', {
          count: rows.length,
          filename,
        });

        GMS.Toast.ok(
          'تم التصدير بنجاح',
          `${GMS.intFmt(rows.length)} صف — ${filename}.xlsx`
        );

        return true;

      } catch (e) {
        console.error('[Excel.export]', e);
        GMS.Toast.err('فشل التصدير', e.message);
        return false;
      }
    },

    /**
     * بناء ورقة البيانات الرئيسية
     * @param {Array<Object>} rows
     * @param {Array<Object>} columns
     * @returns {Object}
     * @private
     */
    _buildDataSheet(rows, columns) {
      /* بناء صفوف JSON */
      const jsonRows = rows.map((row, idx) => {
        const out = { '#': idx + 1 };

        columns.forEach(col => {
          let value = row[col.key];

          /* قيم مشتقة */
          if (value === undefined && col.key === 'branch_name' && row.branch_id) {
            value = GMS.Demo?.getBranches().find(b => b.id === row.branch_id)?.name;
          }

          out[col.label] = formatCell(value, col.type, row);
        });

        return out;
      });

      /* إنشاء الورقة */
      const headers = ['#', ...columns.map(c => c.label)];
      const ws = XLSX.utils.json_to_sheet(jsonRows, { header: headers });

      /* ─── أعمدة ───────────────────────────────────────────────── */
      ws['!cols'] = [
        { wch: 6 },
        ...columns.map(c => ({ wch: c.width || 15 })),
      ];

      /* ─── تنسيق الخلايا ───────────────────────────────────────── */
      const range = XLSX.utils.decode_range(ws['!ref']);

      for (let R = range.s.r + 1; R <= range.e.r; R++) {
        for (let C = range.s.c; C <= range.e.c; C++) {
          const addr = XLSX.utils.encode_cell({ r: R, c: C });
          const cell = ws[addr];
          if (!cell) continue;

          const colIdx = C - 1;
          const col = columns[colIdx];
          if (!col) continue;

          /* نوع الخلية */
          if (typeof cell.v === 'number') {
            cell.t = 'n';
            cell.z = getCellFormat(col.type);
          } else if (col.type === 'date') {
            cell.t = 'd';
            cell.z = getCellFormat(col.type);
          } else {
            cell.t = 's';
          }
        }
      }

      return ws;
    },

    /**
     * بناء ورقة الملخص
     * @param {Object} summary
     * @param {Object} config
     * @returns {Object}
     * @private
     */
    _buildSummarySheet(summary, config) {
      const rows = [
        [config.title || 'ملخص التقرير', ''],
        ['تاريخ التصدير', new Date().toLocaleString('ar-EG')],
        [''],
        ['المؤشر', 'القيمة'],
      ];

      if (summary.count !== undefined) {
        rows.push(['عدد السجلات', summary.count]);
      }

      if (summary.totalNetWeight !== undefined) {
        rows.push(['إجمالي الوزن الصافي (جم)', GMS.round(summary.totalNetWeight, 3)]);
      }

      if (summary.totalPureWeight !== undefined) {
        rows.push(['إجمالي البندق 24K (جم)', GMS.round(summary.totalPureWeight, 4)]);
      }

      if (summary.totalValue !== undefined) {
        rows.push(['إجمالي القيمة (ج.م)', GMS.round(summary.totalValue, 2)]);
      }

      if (summary.totalGold !== undefined) {
        rows.push(['إجمالي الذهب (ج.م)', GMS.round(summary.totalGold, 2)]);
      }

      if (summary.totalMaking !== undefined) {
        rows.push(['إجمالي المصنعية (ج.م)', GMS.round(summary.totalMaking, 2)]);
      }

      if (summary.totalPaid !== undefined) {
        rows.push(['المدفوع (ج.م)', GMS.round(summary.totalPaid, 2)]);
      }

      if (summary.totalRemaining !== undefined) {
        rows.push(['المتبقي (ج.م)', GMS.round(summary.totalRemaining, 2)]);
      }

      /* حسب العيار */
      if (summary.byKarat && Object.keys(summary.byKarat).length) {
        rows.push(['']);
        rows.push(['التوزيع حسب العيار', '']);
        rows.push(['العيار', 'عدد القطع', 'الوزن الصافي (جم)', 'البندق (جم)', 'القيمة (ج.م)']);

        GMS.KARAT_ORDER.forEach(k => {
          const kd = summary.byKarat[k];
          if (!kd) return;
          rows.push([
            `${k}K`,
            kd.count || 0,
            GMS.round(kd.netWeight || 0, 3),
            GMS.round(kd.pureWeight || 0, 4),
            GMS.round(kd.totalValue || 0, 2),
          ]);
        });
      }

      /* حسب الحالة */
      if (summary.byStatus && Object.keys(summary.byStatus).length) {
        rows.push(['']);
        rows.push(['التوزيع حسب الحالة', '']);
        rows.push(['الحالة', 'عدد القطع']);

        Object.entries(summary.byStatus).forEach(([key, val]) => {
          const label = GMS.getStatus(key)?.label || key;
          rows.push([label, val]);
        });
      }

      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = [
        { wch: 28 },
        { wch: 18 },
        { wch: 18 },
        { wch: 18 },
        { wch: 18 },
      ];

      return ws;
    },

    /**
     * بناء ورقة الفلاتر
     * @param {Object} filters
     * @returns {Object}
     * @private
     */
    _buildFiltersSheet(filters) {
      const rows = [['الفلاتر المُطبَّقة', '']];

      Object.entries(filters).forEach(([k, v]) => {
        if (v === null || v === undefined || v === '') return;

        /* تحويل المفاتيح لتسميات عربية */
        const labels = {
          branch: 'الفرع',
          karat: 'العيار',
          status: 'الحالة',
          search: 'البحث',
          manufacturer: 'الماركة',
          category: 'التصنيف',
          from: 'من تاريخ',
          to: 'إلى تاريخ',
          type: 'النوع',
        };

        const label = labels[k] || k;
        let value = v;

        /* ترجمة القيم */
        if (k === 'status') value = GMS.getStatus(v)?.label || v;
        if (k === 'karat') value = `${v}K`;
        if (k === 'branch' && v) {
          value = GMS.Demo?.getBranches().find(b => b.id === v)?.name || v;
        }

        rows.push([label, String(value)]);
      });

      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = [{ wch: 20 }, { wch: 40 }];

      return ws;
    },

    /* ─── اختصارات لأنواع جاهزة ──────────────────────────────────── */

    /**
     * تصدير المخزون
     * @param {Array<Object>} items
     * @param {Object} [opts]
     * @returns {boolean}
     */
    inventory(items, opts = {}) {
      const totals = this._computeInventorySummary(items);
      return this.export(items, EXPORT_CONFIGS.inventory, {
        includeSummary: true,
        summary: totals,
        ...opts,
      });
    },

    /**
     * تصدير المبيعات
     * @param {Array<Object>} sales
     * @param {Object} [opts]
     * @returns {boolean}
     */
    sales(sales, opts = {}) {
      const summary = this._computeSalesSummary(sales);
      return this.export(sales, EXPORT_CONFIGS.sales, {
        includeSummary: true,
        summary,
        ...opts,
      });
    },

    /**
     * تصدير دفتر الأستاذ
     * @param {Array<Object>} entries
     * @param {Object} [opts]
     * @returns {boolean}
     */
    ledger(entries, opts = {}) {
      return this.export(entries, EXPORT_CONFIGS.ledger, opts);
    },

    /**
     * تصدير المرتجعات
     * @param {Array<Object>} returns_
     * @param {Object} [opts]
     * @returns {boolean}
     */
    returns(returns_, opts = {}) {
      return this.export(returns_, EXPORT_CONFIGS.returns, opts);
    },

    /**
     * تصدير الموردين
     * @param {Array<Object>} suppliers
     * @param {Object} [opts]
     * @returns {boolean}
     */
    suppliers(suppliers, opts = {}) {
      return this.export(suppliers, EXPORT_CONFIGS.suppliers, opts);
    },

    /**
     * تصدير سجل التدقيق
     * @param {Array<Object>} logs
     * @param {Object} [opts]
     * @returns {boolean}
     */
    audit(logs, opts = {}) {
      return this.export(logs, EXPORT_CONFIGS.audit, opts);
    },

    /* ─── ملخصات ──────────────────────────────────────────────────── */

    /**
     * ملخص المخزون
     * @param {Array} items
     * @returns {Object}
     * @private
     */
    _computeInventorySummary(items) {
      const summary = {
        count: items.length,
        totalNetWeight: 0,
        totalPureWeight: 0,
        totalValue: 0,
        totalMaking: 0,
        byKarat: {},
        byStatus: {},
      };

      items.forEach(item => {
        const net = Number(item.net_weight || 0);
        const pure = Number(item.pure_weight || 0);
        const value = Number(item.total_cost || 0);
        const making = Number(item.workmanship_value || 0);
        const karat = Number(item.karat);
        const status = item.status;

        summary.totalNetWeight += net;
        summary.totalPureWeight += pure;
        summary.totalValue += value;
        summary.totalMaking += making;

        /* by karat */
        if (!summary.byKarat[karat]) {
          summary.byKarat[karat] = {
            count: 0,
            netWeight: 0,
            pureWeight: 0,
            totalValue: 0,
          };
        }
        summary.byKarat[karat].count++;
        summary.byKarat[karat].netWeight += net;
        summary.byKarat[karat].pureWeight += pure;
        summary.byKarat[karat].totalValue += value;

        /* by status */
        if (!summary.byStatus[status]) summary.byStatus[status] = 0;
        summary.byStatus[status]++;
      });

      return summary;
    },

    /**
     * ملخص المبيعات
     * @param {Array} sales
     * @returns {Object}
     * @private
     */
    _computeSalesSummary(sales) {
      const summary = {
        count: sales.length,
        totalPureWeight: 0,
        totalValue: 0,
        totalGold: 0,
        totalMaking: 0,
        totalPaid: 0,
        totalRemaining: 0,
      };

      sales.forEach(s => {
        summary.totalPureWeight += Number(s.total_pure_weight || 0);
        summary.totalValue += Number(s.grand_total || 0);
        summary.totalGold += Number(s.gold_value || 0);
        summary.totalMaking += Number(s.total_workmanship || 0);
        summary.totalPaid += Number(s.paid || 0);
        summary.totalRemaining += Number(s.remaining || 0);
      });

      return summary;
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §7 · IMPORT ENGINE
     ═════════════════════════════════════════════════════════════════════ */

  /* خرائط الأعمدة — تطابق بين الأسماء العربية/الإنجليزية والحقول الداخلية */
  const IMPORT_FIELD_ALIASES = {
    /* SKU */
    sku: [
      'sku', 'code', 'كود', 'الكود', 'كود التاج', 'كود الصنف',
      'كود القطعة', 'الرمز', 'الكود الصنفي',
    ],
    /* Manufacturer */
    manufacturer_code: [
      'manufacturer_code', 'manufacturer', 'manu', 'الماركة',
      'المصنع', 'كود الماركة', 'حرف', 'الحرف', 'code',
    ],
    manufacturer_name: [
      'manufacturer_name', 'manu_name', 'اسم الماركة',
      'اسم المصنع', 'اسم المورد',
    ],
    /* Category */
    category: [
      'category', 'type', 'التصنيف', 'النوع', 'الفئة', 'الصنف',
    ],
    /* Karat */
    karat: [
      'karat', 'carat', 'k', 'العيار', 'عيار', 'قيراط', 'نقاء',
    ],
    /* Weight */
    weight_grams: [
      'weight', 'weight_grams', 'gross_weight', 'gross',
      'الوزن', 'الوزن القائم', 'الوزن (جم)', 'الوزن بالجرام',
      'الوزن القائم (جم)', 'الوزن الإجمالي',
    ],
    stone_weight: [
      'stone_weight', 'stone', 'stones',
      'وزن الأحجار', 'الأحجار', 'أحجار', 'وزن الأحجار (جم)',
    ],
    /* Workmanship */
    workmanship_per_gram: [
      'workmanship_per_gram', 'workmanship', 'making',
      'المصنعية', 'مصنعية', 'مصنعية/جم', 'المصنعية/جرام',
      'المصنعية للجرام',
    ],
    /* Status */
    status: [
      'status', 'state', 'الحالة',
    ],
    /* Notes */
    notes: [
      'notes', 'note', 'remarks', 'ملاحظات', 'ملاحظة',
    ],
  };

  const Importer = {

    /**
     * فتح نافذة اختيار ملف
     */
    openFilePicker() {
      const input = document.getElementById('file-input');
      if (!input) {
        /* أنشئ input ديناميكي */
        const dynInput = document.createElement('input');
        dynInput.type = 'file';
        dynInput.accept = '.xlsx,.xls,.csv';
        dynInput.style.display = 'none';
        dynInput.onchange = (e) => {
          const file = e.target.files?.[0];
          if (file) this.handleFile(file);
          dynInput.remove();
        };
        document.body.appendChild(dynInput);
        dynInput.click();
        return;
      }

      input.value = '';
      input.click();
    },

    /**
     * معالجة ملف مختار
     * @param {File} file
     * @returns {Promise<boolean>}
     */
    async handleFile(file) {
      if (!file) return false;

      /* الحجم */
      const maxSize = 20 * 1024 * 1024;
      if (file.size > maxSize) {
        GMS.Toast.err('الملف كبير جداً', 'الحد الأقصى 20 ميجابايت');
        return false;
      }

      /* الصيغة */
      const ext = file.name.split('.').pop().toLowerCase();
      if (!['xlsx', 'xls', 'csv'].includes(ext)) {
        GMS.Toast.err('صيغة غير مدعومة', 'المسموح: xlsx, xls, csv');
        return false;
      }

      if (!isXLSXAvailable()) {
        GMS.Toast.err('مكتبة Excel غير محمّلة');
        return false;
      }

      try {
        GMS.Loading.show('جارٍ قراءة الملف…');

        emit('importStart', { filename: file.name });

        /* قراءة الملف */
        const buffer = await GMS.readFileAsBuffer(file);
        const wb = XLSX.read(buffer, {
          type: 'array',
          cellDates: true,
          cellText: false,
        });

        if (!wb.SheetNames || !wb.SheetNames.length) {
          throw new Error('الملف لا يحتوي على أوراق عمل');
        }

        /* الورقة الأولى */
        const sheetName = wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];

        const raw = XLSX.utils.sheet_to_json(ws, {
          defval: '',
          raw: false,
          blankrows: false,
        });

        if (!raw.length) {
          throw new Error('الملف فارغ أو لا يحتوي على بيانات');
        }

        /* كشف الأعمدة */
        const detection = this._detectColumns(raw);

        /* تحليل وتحقق */
        const parsed = this._parseAndValidate(raw, detection);

        /* حفظ الحالة */
        ExcelState.import = {
          file,
          workbook: wb,
          sheetName,
          rawRows: raw,
          parsedRows: parsed,
          detection,
          stats: {
            total: parsed.length,
            valid: parsed.filter(r => !r._errors.length).length,
            invalid: parsed.filter(r => r._errors.length).length,
            warned: parsed.filter(r => !r._errors.length && r._warnings.length).length,
          },
        };

        GMS.Loading.hide();

        /* عرض المعاينة */
        this._showPreviewModal();

        return true;

      } catch (e) {
        GMS.Loading.hide();
        console.error('[Excel.import]', e);
        GMS.Toast.err('فشل قراءة الملف', e.message);
        return false;
      }
    },

    /**
     * كشف الأعمدة تلقائياً
     * @param {Array<Object>} raw
     * @returns {Object}
     * @private
     */
    _detectColumns(raw) {
      if (!raw.length) return {};

      const headers = Object.keys(raw[0]);
      const detection = {};

      Object.keys(IMPORT_FIELD_ALIASES).forEach(field => {
        const aliases = IMPORT_FIELD_ALIASES[field];

        const match = headers.find(h => {
          const hn = String(h).trim().toLowerCase();
          return aliases.some(a => a.toLowerCase() === hn);
        });

        if (match) detection[field] = match;
      });

      return detection;
    },

    /**
     * تحليل وتحقق من الصفوف
     * @param {Array<Object>} raw
     * @param {Object} detection
     * @returns {Array<Object>}
     * @private
     */
    _parseAndValidate(raw, detection) {
      const seenSkus = new Set();
      const parsed = [];

      for (let i = 0; i < raw.length; i++) {
        const r = raw[i];
        const row = this._parseRow(r, detection, i + 2);

        /* تحقق SKU مكرر */
        if (row.sku && seenSkus.has(row.sku)) {
          row._errors.push('كود مكرر في الملف');
        } else if (row.sku) {
          seenSkus.add(row.sku);
        }

        parsed.push(row);
      }

      return parsed;
    },

    /**
     * تحليل صف واحد
     * @param {Object} raw
     * @param {Object} detection
     * @param {number} rowNum
     * @returns {Object}
     * @private
     */
    _parseRow(raw, detection, rowNum) {
      const get = (field) => {
        const key = detection[field];
        return key ? String(raw[key] ?? '').trim() : '';
      };

      const row = {
        _row: rowNum,
        _errors: [],
        _warnings: [],

        sku: get('sku').toUpperCase(),
        manufacturer_code: get('manufacturer_code').toUpperCase(),
        manufacturer_name: get('manufacturer_name'),
        category: get('category'),
        karat: this._parseInt(get('karat')),
        weight_grams: this._parseFloat(get('weight_grams')),
        stone_weight: this._parseFloat(get('stone_weight')),
        workmanship_per_gram: this._parseFloat(get('workmanship_per_gram')),
        status: get('status'),
        notes: get('notes'),
      };

      /* ─── التحقق ──────────────────────────────────────────────── */

      /* SKU */
      if (!row.sku) {
        row._errors.push('كود SKU مطلوب');
      } else if (row.sku.length > 60) {
        row._errors.push('كود SKU طويل جداً');
      }

      /* العيار */
      if (!row.karat || !GMS.KARAT_RATIO[row.karat]) {
        row._errors.push('العيار غير صالح (14/18/21/22/24)');
      }

      /* الوزن */
      if (!isFinite(row.weight_grams) || row.weight_grams <= 0) {
        row._errors.push('الوزن مطلوب ويجب أن يكون أكبر من صفر');
      } else if (row.weight_grams > 10000) {
        row._warnings.push('الوزن كبير جداً (> 10 كجم)');
      }

      /* الأحجار */
      if (row.stone_weight < 0) {
        row._errors.push('وزن الأحجار لا يمكن أن يكون سالباً');
      }
      if (row.weight_grams > 0 && row.stone_weight >= row.weight_grams) {
        row._errors.push('وزن الأحجار أكبر من أو يساوي الوزن القائم');
      }

      /* المصنعية */
      if (row.workmanship_per_gram < 0) {
        row._errors.push('المصنعية لا يمكن أن تكون سالبة');
      }

      /* ─── الحسابات المشتقة ─────────────────────────────────────── */
      if (!row._errors.length) {
        const ratio = GMS.karatRatio(row.karat);
        const net = GMS.round(row.weight_grams - row.stone_weight, 3);
        const pure = GMS.round(net * ratio, 4);
        const price24 = GMS.APP_CONFIG.DEFAULT_PRICE_24;
        const goldValue = GMS.round(pure * price24, 2);
        const makeValue = GMS.round(net * row.workmanship_per_gram, 2);
        const totalCost = GMS.round(goldValue + makeValue, 2);

        row.purity_ratio = ratio;
        row.net_weight = net;
        row.pure_weight = pure;
        row.gold_value = goldValue;
        row.workmanship_value = makeValue;
        row.total_cost = totalCost;
        row.price_24 = price24;
      }

      /* تطبيع الحالة */
      row.status = this._normalizeStatus(row.status);

      return row;
    },

    /**
     * تحويل الحالة إلى قيمة قياسية
     * @param {string} value
     * @returns {string}
     * @private
     */
    _normalizeStatus(value) {
      if (!value) return 'IN_STOCK';

      const s = String(value).trim().toUpperCase();

      if (GMS.ITEM_STATUS[s]) return s;

      const map = {
        'متوفر': 'IN_STOCK',
        'متاح': 'IN_STOCK',
        'في المخزون': 'IN_STOCK',
        'محجوز': 'RESERVED',
        'حجز': 'RESERVED',
        'مباع': 'SOLD',
        'مبيع': 'SOLD',
        'مبيوع': 'SOLD',
        'مرتجع': 'RETURNED',
        'مرتجع بيع': 'RETURNED',
        'مصهور': 'MELTED',
        'مذاب': 'MELTED',
      };

      return map[String(value).trim()] || 'IN_STOCK';
    },

    /**
     * تحويل نص إلى عدد صحيح
     * @param {string} v
     * @returns {number|null}
     * @private
     */
    _parseInt(v) {
      if (!v) return null;
      const n = parseInt(String(v).replace(/[^\d-]/g, ''), 10);
      return isFinite(n) ? n : null;
    },

    /**
     * تحويل نص إلى رقم عشري
     * @param {string} v
     * @returns {number}
     * @private
     */
    _parseFloat(v) {
      if (v === '' || v === null || v === undefined) return 0;
      const n = parseFloat(String(v).replace(/[^\d.-]/g, ''));
      return isFinite(n) ? n : 0;
    },

    /**
     * عرض نافذة المعاينة
     * @private
     */
    _showPreviewModal() {
      const {
        file,
        sheetName,
        parsedRows,
        detection,
        stats,
      } = ExcelState.import;

      /* الأعمدة المُكتشفة */
      const mappedFields = Object.entries(detection).filter(([, v]) => v);
      const missingFields = Object.entries(detection).filter(([, v]) => !v);

      const fieldLabels = {
        sku: 'SKU',
        manufacturer_code: 'كود الماركة',
        manufacturer_name: 'اسم الماركة',
        category: 'التصنيف',
        karat: 'العيار',
        weight_grams: 'الوزن',
        stone_weight: 'وزن الأحجار',
        workmanship_per_gram: 'المصنعية',
        status: 'الحالة',
        notes: 'ملاحظات',
      };

      /* أول 50 صف */
      const previewRows = parsedRows.slice(0, 50);

      GMS.Modal.open({
        title: 'معاينة استيراد Excel',
        icon: 'upload',
        size: 'xl',
        body: `
          <div style="display:flex;align-items:center;gap:11px;padding:11px 14px;
                      background:var(--surface-2);border-radius:11px;margin-bottom:16px;
                      border:1px solid var(--border)">
            <i data-lucide="file-spreadsheet"
               style="width:22px;height:22px;color:var(--primary)"></i>
            <div style="flex:1;min-width:0">
              <div style="font-weight:800;font-size:13px;
                          white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                ${GMS.esc(file.name)}
              </div>
              <div style="font-size:11px;color:var(--muted);font-weight:600">
                ورقة العمل: ${GMS.esc(sheetName)} · ${parsedRows.length} صف
              </div>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:repeat(4,1fr);
                      gap:11px;margin-bottom:18px">
            ${this._previewStat('إجمالي الصفوف', stats.total, 'info')}
            ${this._previewStat('صفوف صالحة', stats.valid, 'success')}
            ${this._previewStat('صفوف بها أخطاء', stats.invalid, 'danger')}
            ${this._previewStat('تحذيرات', stats.warned, 'warn')}
          </div>

          <div style="margin-bottom:16px">
            <div style="font-size:11px;font-weight:800;color:var(--muted);
                        text-transform:uppercase;letter-spacing:.5px;margin-bottom:9px">
              الأعمدة المُكتشفة
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:6px">
              ${mappedFields.map(([field, col]) => `
                <span class="chip ok" style="font-size:11px">
                  <i data-lucide="check" style="width:11px;height:11px"></i>
                  ${GMS.esc(fieldLabels[field] || field)} ← ${GMS.esc(col)}
                </span>
              `).join('')}
              ${missingFields.map(([field]) => `
                <span class="chip" style="font-size:11px;opacity:.5">
                  <i data-lucide="minus" style="width:11px;height:11px"></i>
                  ${GMS.esc(fieldLabels[field] || field)}
                </span>
              `).join('')}
            </div>
          </div>

          <div style="font-size:11px;font-weight:800;color:var(--muted);
                      text-transform:uppercase;letter-spacing:.5px;margin-bottom:9px">
            معاينة البيانات (أول ${Math.min(50, parsedRows.length)} صف)
          </div>

          <div style="max-height:420px;overflow:auto;border:1px solid var(--border);
                      border-radius:11px">
            <table class="tbl" style="font-size:12px">
              <thead>
                <tr>
                  <th style="width:44px">#</th>
                  <th style="width:150px">SKU</th>
                  <th style="width:60px">عيار</th>
                  <th style="width:90px">قائم</th>
                  <th style="width:80px">أحجار</th>
                  <th style="width:90px">صافي</th>
                  <th style="width:100px">بندق</th>
                  <th style="width:100px">مصنعية</th>
                  <th style="width:120px">الإجمالي</th>
                  <th>الحالة / الأخطاء</th>
                </tr>
              </thead>
              <tbody>
                ${previewRows.map(r => {
                  const hasErr = r._errors.length > 0;
                  const hasWarn = r._warnings.length > 0 && !hasErr;
                  const bg = hasErr
                    ? 'background:color-mix(in srgb,var(--danger) 8%,transparent)'
                    : hasWarn
                      ? 'background:color-mix(in srgb,var(--warn) 8%,transparent)'
                      : '';

                  return `
                    <tr style="${bg}">
                      <td style="text-align:center;color:var(--muted);font-weight:700;font-size:11px">
                        ${r._row}
                      </td>
                      <td class="mono" style="font-weight:800;font-size:11.5px">
                        ${GMS.esc(r.sku || '—')}
                      </td>
                      <td>
                        ${r.karat
                          ? `<span class="karat-badge" data-k="${r.karat}">${r.karat}K</span>`
                          : '—'}
                      </td>
                      <td class="col-num">${r.weight_grams ? GMS.gramFmt(r.weight_grams) : '—'}</td>
                      <td class="col-num">${r.stone_weight ? GMS.gramFmt(r.stone_weight) : '—'}</td>
                      <td class="col-num">${r.net_weight ? GMS.gramFmt(r.net_weight) : '—'}</td>
                      <td class="col-num" style="color:var(--primary);font-weight:800">
                        ${r.pure_weight ? GMS.gramFmt(r.pure_weight) : '—'}
                      </td>
                      <td class="col-num">
                        ${r.workmanship_per_gram ? GMS.moneyFmt(r.workmanship_per_gram) : '—'}
                      </td>
                      <td class="col-num" style="font-weight:800">
                        ${r.total_cost ? GMS.moneyFmt(r.total_cost) : '—'}
                      </td>
                      <td>
                        ${r._errors.map(e =>
                          `<div style="color:var(--danger);font-size:11px;font-weight:700">✕ ${GMS.esc(e)}</div>`
                        ).join('')}
                        ${r._warnings.map(w =>
                          `<div style="color:var(--warn);font-size:11px;font-weight:700">⚠ ${GMS.esc(w)}</div>`
                        ).join('')}
                        ${!r._errors.length && !r._warnings.length
                          ? '<span class="pill pill-green">سليم</span>'
                          : ''}
                      </td>
                    </tr>
                  `;
                }).join('')}
                ${parsedRows.length > 50 ? `
                  <tr>
                    <td colspan="10" style="text-align:center;padding:14px;
                              color:var(--muted);font-weight:700;font-size:11.5px">
                      … و ${parsedRows.length - 50} صف إضافي
                    </td>
                  </tr>
                ` : ''}
              </tbody>
            </table>
          </div>

          <div id="imp-progress-host"></div>
        `,
        footer: `
          <button class="btn" data-close>إلغاء</button>
          ${stats.invalid > 0 ? `
            <button class="btn btn-ghost" data-export-errors>
              <i data-lucide="download"></i> تنزيل الأخطاء
            </button>
          ` : ''}
          <button class="btn btn-primary btn-lg" data-confirm-import
                  ${stats.valid === 0 ? 'disabled' : ''}>
            <i data-lucide="upload-cloud"></i>
            استيراد ${GMS.intFmt(stats.valid)} صف صالح
          </button>
        `,
        onMount: (el, close) => {
          /* تصدير الأخطاء */
          const errBtn = el.querySelector('[data-export-errors]');
          if (errBtn) {
            errBtn.onclick = () => this._exportErrors();
          }

          /* تأكيد الاستيراد */
          const confirmBtn = el.querySelector('[data-confirm-import]');
          if (confirmBtn) {
            confirmBtn.onclick = async () => {
              await this._executeImport(el, close);
            };
          }
        },
      });
    },

    /**
     * صندوق إحصائيات صغير
     * @param {string} label
     * @param {number} value
     * @param {string} type
     * @returns {string}
     * @private
     */
    _previewStat(label, value, type) {
      const colors = {
        info: { bg: 'var(--info-bg)', fg: 'var(--info)' },
        success: { bg: 'var(--success-bg)', fg: 'var(--success)' },
        danger: { bg: 'var(--danger-bg)', fg: 'var(--danger)' },
        warn: { bg: 'var(--warn-bg)', fg: 'var(--warn)' },
      };
      const c = colors[type] || colors.info;

      return `
        <div style="padding:13px 15px;border-radius:11px;
                    background:${c.bg};border:1px solid color-mix(in srgb,${c.fg} 30%,transparent)">
          <div style="font-size:10.5px;font-weight:800;color:${c.fg};
                      text-transform:uppercase;letter-spacing:.4px">
            ${GMS.esc(label)}
          </div>
          <div style="font-size:22px;font-weight:900;margin-top:5px;
                      letter-spacing:-.5px;font-variant-numeric:tabular-nums;
                      font-family:var(--font-mono);color:${c.fg}">
            ${GMS.intFmt(value)}
          </div>
        </div>
      `;
    },

    /**
     * تصدير صفوف الأخطاء
     * @private
     */
    _exportErrors() {
      const invalid = ExcelState.import.parsedRows.filter(r => r._errors.length > 0);
      if (!invalid.length) {
        GMS.Toast.warn('لا توجد أخطاء للتصدير');
        return;
      }

      const data = invalid.map(r => ({
        'الصف': r._row,
        'SKU': r.sku || '',
        'العيار': r.karat || '',
        'الوزن': r.weight_grams || '',
        'الأخطاء': r._errors.join(' | '),
        'التحذيرات': r._warnings.join(' | '),
      }));

      const ws = XLSX.utils.json_to_sheet(data);
      ws['!cols'] = [
        { wch: 8 },
        { wch: 20 },
        { wch: 8 },
        { wch: 12 },
        { wch: 50 },
        { wch: 40 },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'الأخطاء');
      XLSX.writeFile(wb, `import_errors_${GMS.todayISO()}.xlsx`);
    },

    /**
     * تنفيذ الاستيراد الفعلي
     * @param {Element} modalEl
     * @param {Function} closeModal
     * @returns {Promise<void>}
     * @private
     */
    async _executeImport(modalEl, closeModal) {
      const confirmBtn = modalEl.querySelector('[data-confirm-import]');
      confirmBtn.disabled = true;

      const validRows = ExcelState.import.parsedRows.filter(r => !r._errors.length);
      const total = validRows.length;

      /* عرض شريط التقدم */
      const progressHost = modalEl.querySelector('#imp-progress-host');
      progressHost.innerHTML = `
        <div class="progress-wrap">
          <div style="font-weight:800;font-size:12.5px;color:var(--text)">
            <i data-lucide="loader-circle"
               style="width:13px;height:13px;display:inline;vertical-align:-2px"></i>
            جارٍ الاستيراد إلى قاعدة البيانات…
          </div>
          <div class="progress-bar">
            <div class="progress-fill" id="imp-fill" style="width:0%"></div>
          </div>
          <div class="progress-text">
            <span id="imp-status">بدأ الاتصال…</span>
            <span><b id="imp-pct">0%</b></span>
          </div>
        </div>
      `;
      window.lucide?.createIcons();

      const fillEl = modalEl.querySelector('#imp-fill');
      const statusEl = modalEl.querySelector('#imp-status');
      const pctEl = modalEl.querySelector('#imp-pct');

      const batchSize = 200;
      let imported = 0;
      let failed = 0;
      const errors = [];

      try {
        for (let i = 0; i < validRows.length; i += batchSize) {
          const chunk = validRows.slice(i, i + batchSize);

          /* بناء payload */
          const payloads = chunk.map(r => ({
            sku: r.sku,
            category: r.category || null,
            karat: r.karat,
            purity_ratio: r.purity_ratio,
            weight_grams: r.weight_grams,
            stone_weight: r.stone_weight,
            net_weight: r.net_weight,
            pure_weight: r.pure_weight,
            workmanship_per_gram: r.workmanship_per_gram,
            workmanship_value: r.workmanship_value,
            gold_value: r.gold_value,
            total_cost: r.total_cost,
            price_24: r.price_24,
            status: r.status,
            quantity: 1,
            notes: r.notes || null,
            manufacturer_code: r.manufacturer_code || null,
            manufacturer_name: r.manufacturer_name || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }));

          /* إدراج */
          try {
            if (GMS.Supabase.isReady()) {
              const client = GMS.Supabase.get();

              /* محاولة upsert أولاً */
              const { error: upsertError } = await client
                .from(GMS.SUPABASE_CONFIG.TABLES.INVENTORY)
                .upsert(payloads, {
                  onConflict: 'sku',
                  ignoreDuplicates: false,
                });

              if (upsertError) {
                /* fallback: insert */
                console.warn('[Excel] Upsert failed, trying insert:', upsertError.message);

                const { error: insertError } = await client
                  .from(GMS.SUPABASE_CONFIG.TABLES.INVENTORY)
                  .insert(payloads);

                if (insertError) {
                  failed += chunk.length;
                  errors.push({
                    batch: Math.floor(i / batchSize) + 1,
                    message: insertError.message,
                  });
                } else {
                  imported += chunk.length;
                }
              } else {
                imported += chunk.length;
              }
            } else {
              /* وضع تجريبي — إضافة للمخزون المحلي */
              const demoInv = GMS.Demo?.getInventory();
              if (demoInv) {
                payloads.forEach(p => {
                  /* إزالة القديم إن وُجد */
                  const existingIdx = demoInv.findIndex(x => x.sku === p.sku);
                  if (existingIdx >= 0) demoInv.splice(existingIdx, 1);

                  demoInv.unshift({
                    id: 'imp-' + GMS.uid(),
                    ...p,
                    branch_id: GMS.APP_CONFIG.DEFAULT_BRANCH_ID,
                  });
                });
              }
              imported += chunk.length;
            }
          } catch (e) {
            failed += chunk.length;
            errors.push({
              batch: Math.floor(i / batchSize) + 1,
              message: e.message,
            });
          }

          /* حفظ في IndexedDB أيضاً */
          try {
            if (GMS.IDB) {
              const idbPayloads = payloads.map(p => ({
                id: 'imp-' + GMS.uid(),
                ...p,
                branch_id: GMS.APP_CONFIG.DEFAULT_BRANCH_ID,
              }));
              await GMS.IDB.putMany(idbPayloads);
            }
          } catch (e) {
            console.warn('[Excel] IDB insert failed:', e);
          }

          /* تحديث التقدم */
          const pct = Math.round(((i + chunk.length) / total) * 100);
          fillEl.style.width = pct + '%';
          pctEl.textContent = pct + '%';
          statusEl.textContent = `تم استيراد ${GMS.intFmt(imported)} من ${GMS.intFmt(total)} صف`;

          /* التنازل للواجهة */
          await GMS.yieldToUI();
        }

        /* اكتمال */
        fillEl.style.width = '100%';
        pctEl.textContent = '100%';
        statusEl.textContent = 'اكتمل الاستيراد';

        await GMS.sleep(350);
        closeModal();

        /* إشعار */
        if (failed) {
          GMS.Toast.err(
            `تم استيراد ${GMS.intFmt(imported)} صف`,
            `فشل ${GMS.intFmt(failed)} صف — راجع سجل الأخطاء`
          );
        } else {
          GMS.Toast.ok(
            'تم الاستيراد بنجاح',
            `${GMS.intFmt(imported)} صنف أُضيف للمخزون`
          );
        }

        /* تسجيل في سجل التدقيق */
        if (GMS.Audit) {
          await GMS.Audit.log(
            'IMPORT',
            'inventory',
            null,
            `استورد ${imported} صنف من ملف Excel`,
            {
              filename: ExcelState.import.file?.name,
              imported,
              failed,
            }
          );
        }

        /* إبلاغ المستمعين */
        emit('importComplete', { imported, failed, errors });

        /* إعادة تصيير الصفحة الحالية */
        if (GMS.Router) {
          GMS.Router.render();
        }

      } catch (e) {
        console.error('[Excel._executeImport]', e);
        statusEl.textContent = 'فشل الاستيراد: ' + e.message;
        GMS.Toast.err('فشل الاستيراد', e.message);
        confirmBtn.disabled = false;
      }
    },

    /**
     * استيراد من ملف (API مباشر)
     * @param {File} file
     * @returns {Promise<boolean>}
     */
    async fromFile(file) {
      return this.handleFile(file);
    },

    /**
     * تفريغ حالة الاستيراد
     */
    reset() {
      ExcelState.import = {
        file: null,
        workbook: null,
        sheetName: null,
        rawRows: [],
        parsedRows: [],
        detection: {},
        stats: { total: 0, valid: 0, invalid: 0, warned: 0 },
      };
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §8 · TEMPLATES
     ─────────────────────────────────────────────────────────────────────
     قوالب جاهزة للتحميل
     ═════════════════════════════════════════════════════════════════════ */
  const Templates = {

    /**
     * تحميل قالب استيراد المخزون
     */
    inventory() {
      if (!isXLSXAvailable()) {
        GMS.Toast.err('مكتبة Excel غير محمّلة');
        return;
      }

      /* صف رأس */
      const headers = [
        'كود التاج',
        'التصنيف',
        'العيار',
        'الوزن (جم)',
        'وزن الأحجار (جم)',
        'المصنعية',
        'الحالة',
        'ملاحظات',
      ];

      /* صفوف نموذجية */
      const examples = [
        ['A21-260918-00001', 'خاتم', 21, 5.400, 0.200, 140, 'متوفر', ''],
        ['B18-260918-00002', 'سلسلة', 18, 8.750, 0, 165, 'متوفر', ''],
        ['L21-260918-00003', 'أسورة', 21, 12.300, 0, 210, 'متوفر', 'يحتاج تلميع'],
        ['', '', '', '', '', '', '', ''],
      ];

      const ws = XLSX.utils.aoa_to_sheet([headers, ...examples]);
      ws['!cols'] = [
        { wch: 22 },
        { wch: 14 },
        { wch: 8 },
        { wch: 14 },
        { wch: 14 },
        { wch: 14 },
        { wch: 14 },
        { wch: 30 },
      ];

      /* تنسيق الرأس */
      for (let C = 0; C < headers.length; C++) {
        const addr = XLSX.utils.encode_cell({ r: 0, c: C });
        if (ws[addr]) {
          ws[addr].s = {
            font: { bold: true, color: { rgb: 'FFFFFF' } },
            fill: { fgColor: { rgb: 'B8912F' } },
            alignment: { horizontal: 'center', vertical: 'center' },
          };
        }
      }

      /* ورقة التعليمات */
      const instructions = [
        ['قالب استيراد المخزون — Gold MS'],
        [''],
        ['تعليمات:'],
        ['1. املأ البيانات في الورقة الأولى (المخزون)'],
        ['2. لا تحذف صف الرأس'],
        ['3. الحقول المطلوبة: كود التاج، العيار، الوزن'],
        ['4. الحقول الاختيارية: التصنيف، وزن الأحجار، المصنعية، الحالة، ملاحظات'],
        [''],
        ['تفاصيل الحقول:'],
        ['كود التاج', 'نص فريد — مثال: A21-260918-00001'],
        ['التصنيف', 'خاتم، سلسلة، أسورة، حلق، توكة، دبلة، قلادة، تعليقة، غوايش، كوليه'],
        ['العيار', 'رقم: 14، 18، 21، 22، 24'],
        ['الوزن (جم)', 'رقم عشري — مثال: 5.400'],
        ['وزن الأحجار (جم)', 'رقم عشري — افتراضي 0'],
        ['المصنعية', 'رقم عشري — مثال: 140 (للجرام)'],
        ['الحالة', 'متوفر، محجوز، مباع، مرتجع، مصهور'],
        ['ملاحظات', 'نص حر — اختياري'],
      ];

      const wsInstructions = XLSX.utils.aoa_to_sheet(instructions);
      wsInstructions['!cols'] = [{ wch: 25 }, { wch: 70 }];

      /* إنشاء Workbook */
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'المخزون');
      XLSX.utils.book_append_sheet(wb, wsInstructions, 'التعليمات');

      XLSX.writeFile(wb, `inventory_template_${GMS.todayISO()}.xlsx`);
      GMS.Toast.ok('تم تحميل القالب', 'استخدمه لملء بيانات المخزون');
    },

    /**
     * تحميل قالب فارغ بالمصطلحات
     */
    empty() {
      if (!isXLSXAvailable()) return;

      const headers = INVENTORY_COLUMNS.map(c => c.label);
      const ws = XLSX.utils.aoa_to_sheet([headers]);
      ws['!cols'] = INVENTORY_COLUMNS.map(c => ({ wch: c.width || 15 }));

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'المخزون');

      XLSX.writeFile(wb, `inventory_headers_${GMS.todayISO()}.xlsx`);
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §9 · GLOBAL BINDINGS
     ═════════════════════════════════════════════════════════════════════ */
  function bindGlobalControls() {
    /* زر الاستيراد */
    const importBtn = document.getElementById('import-btn');
    if (importBtn) {
      importBtn.onclick = () => Importer.openFilePicker();
    }

    /* input الملف */
    const fileInput = document.getElementById('file-input');
    if (fileInput) {
      fileInput.onchange = (e) => {
        const file = e.target.files?.[0];
        if (file) Importer.handleFile(file);
        e.target.value = '';
      };
    }

    /* زر التصدير */
    const exportBtn = document.getElementById('export-btn');
    if (exportBtn) {
      exportBtn.onclick = () => openExportMenu();
    }
  }

  /**
   * فتح قائمة التصدير
   */
  function openExportMenu() {
    GMS.Modal.open({
      title: 'تصدير البيانات إلى Excel',
      icon: 'download',
      size: 'sm',
      body: `
        <p style="margin:0 0 16px;font-size:12.5px;color:var(--muted);line-height:1.7">
          اختر نوع البيانات للتصدير. سيتم إنشاء ملف <b>.xlsx</b> منسّق
          يحتوي على ورقة بيانات + ورقة ملخص + ورقة فلاتر.
        </p>

        <div style="display:grid;gap:9px">
          ${this._exportOption('inventory', 'المخزون', 'package', 'inventory')}
          ${this._exportOption('sales', 'المبيعات', 'receipt', 'sales')}
          ${this._exportOption('ledger', 'دفتر الأستاذ', 'book-open', 'ledger')}
          ${this._exportOption('returns', 'المرتجعات', 'rotate-ccw', 'returns')}
          ${this._exportOption('suppliers', 'الموردين', 'factory', 'suppliers')}
          ${this._exportOption('audit', 'سجل التدقيق', 'scroll-text', 'audit')}
        </div>

        <div class="divider"></div>

        <button class="btn btn-ghost btn-block" data-download-template>
          <i data-lucide="file-down"></i> تحميل قالب استيراد المخزون
        </button>
      `,
      footer: `<button class="btn" data-close>إغلاق</button>`,
      onMount: (el, close) => {
        /* أزرار التصدير */
        el.querySelectorAll('[data-export-type]').forEach(btn => {
          btn.onclick = () => {
            const type = btn.dataset.exportType;
            close();
            this._runExport(type);
          };
        });

        /* زر القالب */
        const tplBtn = el.querySelector('[data-download-template]');
        if (tplBtn) {
          tplBtn.onclick = () => {
            Templates.inventory();
          };
        }
      },
    });

    /* helper داخل modal */
    this._exportOption = (type, label, icon, method) => `
      <button class="btn btn-block" data-export-type="${type}"
              style="justify-content:flex-start;padding:14px 16px;text-align:start">
        <div style="display:flex;align-items:center;gap:12px;flex:1">
          <div style="width:38px;height:38px;border-radius:10px;
                      background:var(--surface-3);display:grid;place-items:center;
                      color:var(--text-2);flex-shrink:0">
            <i data-lucide="${icon}" style="width:18px;height:18px"></i>
          </div>
          <div style="flex:1;text-align:start">
            <div style="font-weight:800;font-size:13px">${label}</div>
            <div style="font-size:11px;color:var(--muted);font-weight:600;margin-top:2px">
              تصدير Excel كامل
            </div>
          </div>
          <i data-lucide="arrow-left" style="width:15px;height:15px;color:var(--muted)"></i>
        </div>
      </button>
      <span style="display:none" data-method="${method}"></span>
    `;
  }

  /**
   * تنفيذ التصدير حسب النوع
   * @param {string} type
   * @returns {Promise<void>}
   */
  async function _runExport(type) {
    try {
      let data = [];

      switch (type) {
        case 'inventory': {
          /* حاول من IDB */
          if (GMS.IDB && GMS.IDB.isOpen) {
            data = await GMS.IDB.getAll();
          }
          if (!data.length && GMS.Demo) {
            data = GMS.Demo.getInventory();
          }
          Exporter.inventory(data);
          break;
        }

        case 'sales': {
          if (GMS.Demo) {
            data = GMS.Demo.getSales();
          } else if (GMS.Supabase.isReady()) {
            const client = GMS.Supabase.get();
            const { data: rows } = await client
              .from(GMS.SUPABASE_CONFIG.TABLES.SALES)
              .select('*')
              .order('created_at', { ascending: false })
              .limit(5000);
            data = rows || [];
          }
          Exporter.sales(data);
          break;
        }

        case 'ledger': {
          if (GMS.Demo) {
            data = GMS.Demo.getLedgerEntries();
          }
          Exporter.ledger(data);
          break;
        }

        case 'returns': {
          if (GMS.Demo) {
            data = GMS.Demo.getReturns();
          }
          Exporter.returns(data);
          break;
        }

        case 'suppliers': {
          /* بناء قائمة الموردين مع الأرصدة */
          const suppliers = GMS.Demo?.getSuppliers() || [];
          const ledger = GMS.Demo?.getLedgerEntries() || [];

          data = suppliers.map(s => {
            const entries = ledger.filter(e => e.entity_id === s.id);
            const goldBalance = entries.reduce(
              (sum, e) => sum + Number(e.gold_delta || 0),
              Number(s.opening_gold || 0)
            );
            const cashBalance = entries.reduce(
              (sum, e) => sum + Number(e.cash_delta || 0),
              Number(s.opening_cash || 0)
            );

            return {
              ...s,
              gold_balance: GMS.round(goldBalance, 4),
              cash_balance: GMS.round(cashBalance, 2),
            };
          });
          Exporter.suppliers(data);
          break;
        }

        case 'audit': {
          if (GMS.Audit) {
            data = GMS.Audit.getAll();
          }
          Exporter.audit(data);
          break;
        }

        default:
          GMS.Toast.warn('نوع غير معروف');
          return;
      }

    } catch (e) {
      console.error('[Excel._runExport]', e);
      GMS.Toast.err('فشل التصدير', e.message);
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §10 · INITIALIZATION
     ═════════════════════════════════════════════════════════════════════ */
  function init() {
    bindGlobalControls();

    if (!isXLSXAvailable()) {
      console.warn('[Excel] SheetJS (XLSX) not loaded — Excel features disabled');
    } else {
      console.log('[Excel] SheetJS loaded:', XLSX.version || 'unknown');
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §11 · EXPORT
     ═════════════════════════════════════════════════════════════════════ */
  GMS.Excel = {
    /* State */
    state: ExcelState,

    /* Export */
    Exporter,
    export: (rows, config, opts) => Exporter.export(rows, config, opts),
    exportMenu: openExportMenu,

    /* Import */
    Importer,
    import: (file) => Importer.handleFile(file),

    /* Templates */
    Templates,

    /* Columns */
    columns: {
      INVENTORY: INVENTORY_COLUMNS,
      SALES: SALES_COLUMNS,
      LEDGER: LEDGER_COLUMNS,
      RETURNS: RETURNS_COLUMNS,
      SUPPLIERS: SUPPLIERS_COLUMNS,
      AUDIT: AUDIT_COLUMNS,
    },

    /* Configs */
    configs: EXPORT_CONFIGS,

    /* Events */
    on,

    /* Init */
    init,

    /* Utils */
    isAvailable: isXLSXAvailable,
  };

  /* ─── Convenience shortcuts ──────────────────────────────────── */
  GMS.ExcelExport = Exporter;
  GMS.ExcelImport = Importer;
  GMS.ExcelTemplates = Templates;

  /* ═════════════════════════════════════════════════════════════════════
     §12 · LOADED CONFIRMATION
     ═════════════════════════════════════════════════════════════════════ */
  console.log(
    '%c📊 Excel Engine loaded · SheetJS',
    'color:#0f7a43;font-weight:800;font-size:12px;padding:1px 5px;' +
    'background:#e6f6ee;border-radius:4px;'
  );

  console.log(
    `%c📁 6 export types · XLSX import with validation · Templates · Multi-sheet`,
    'color:#6b7a95;font-weight:700;font-size:11px;'
  );

  /* ═════════════════════════════════════════════════════════════════════
     ✅ js/10-excel.js — نهاية الملف
     ═════════════════════════════════════════════════════════════════════ */

})();