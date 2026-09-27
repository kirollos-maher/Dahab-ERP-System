/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ENTERPRISE — js/30-inventory-count-summary.js
   ملخّص الجرد السريع حسب التصنيف
   ─────────────────────────────────────────────────────────────────────
   المزايا:
     • زر في شريط أدوات المخزون
     • جدول ملخّص حسب التصنيف (خاتم، سلسلة، حلق، ...)
     • عدد القطع + الوزن القائم + الصافي + البندق
     • متوسط المصنعية/جرام + إجمالي المصنعية + الإجمالي
     • يحترم الفلاتر النشطة في المخزون
     • طباعة A4 + تصدير Excel
     • اختصار: Ctrl+Shift+G
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const GMS = window.GMS = window.GMS || {};

  /* ═════════════════════════════════════════════════════════════════════
     §1 · STATE
     ═════════════════════════════════════════════════════════════════════ */
  const State = {
    lastBreakdown: null,
    sortBy: 'count',        /* 'category' | 'count' | 'gross' | 'net' | 'pure' | 'value' */
    sortDir: 'desc',
    lastModal: null,
  };

  /* ═════════════════════════════════════════════════════════════════════
     §2 · HELPERS
     ═════════════════════════════════════════════════════════════════════ */
  const esc = (v) => GMS.esc ? GMS.esc(v) : String(v == null ? '' : v);
  const moneyFmt = (v) => GMS.moneyFmt ? GMS.moneyFmt(v) : Number(v || 0).toFixed(2);
  const gramFmt = (v) => GMS.gramFmt ? GMS.gramFmt(v) : Number(v || 0).toFixed(3);
  const intFmt = (v) => GMS.intFmt ? GMS.intFmt(v) : String(Math.round(Number(v) || 0));
  const round = (v, d = 2) => GMS.round ? GMS.round(v, d)
    : Math.round((Number(v) + Number.EPSILON) * Math.pow(10, d)) / Math.pow(10, d);
  const numOr = (v, f = 0) => { const n = parseFloat(v); return isFinite(n) ? n : f; };

  function getPrice24() {
    try {
      if (GMS.PriceManager?.current) {
        const p = GMS.PriceManager.current();
        if (p > 0) return p;
      }
      if (GMS.Cache?.getPrice) {
        const p = GMS.Cache.getPrice();
        if (p?.price_24) return Number(p.price_24);
      }
    } catch (_) {}
    return GMS.APP_CONFIG?.DEFAULT_PRICE_24 || 4500;
  }

  function getFilteredItems() {
    try {
      const inv = GMS.Views?.inventory;
      if (!inv) return [];
      const filtered = inv.state?.filtered;
      if (Array.isArray(filtered) && filtered.length >= 0) return filtered;
      const items = inv.state?.items;
      return Array.isArray(items) ? items : [];
    } catch (_) {
      return [];
    }
  }

  function getActiveFiltersText() {
    try {
      const f = GMS.Views?.inventory?.state?.filters || {};
      const parts = [];
      if (f.search) parts.push(`بحث: ${f.search}`);
      if (f.karat) parts.push(`عيار: ${f.karat}K`);
      if (f.status) {
        const lbl = GMS.ITEM_STATUS?.[f.status]?.label || f.status;
        parts.push(`حالة: ${lbl}`);
      }
      if (f.branch) {
        const b = GMS.Demo?.getBranches?.()?.find(x => x.id === f.branch);
        parts.push(`فرع: ${b?.name || f.branch}`);
      }
      if (f.manufacturer) parts.push(`ماركة: ${f.manufacturer}`);
      if (f.category) parts.push(`تصنيف: ${f.category}`);
      return parts.length ? parts.join(' · ') : 'بدون فلاتر';
    } catch (_) {
      return 'بدون فلاتر';
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §3 · COMPUTE CATEGORY BREAKDOWN
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * حساب الملخص حسب التصنيف
   * @param {Array} items
   * @returns {{rows: Array, grand: Object, price24: number}}
   */
  function computeBreakdown(items) {
    const price24 = getPrice24();
    const map = new Map();

    const grand = {
      category: 'الإجمالي',
      count: 0,
      gross: 0,
      net: 0,
      pure: 0,
      making: 0,
      goldValue: 0,
      value: 0,
      avgMakingPerGram: 0,
    };

    (items || []).forEach(item => {
      const cat = item.category || 'غير مُصنَّف';

      if (!map.has(cat)) {
        map.set(cat, {
          category: cat,
          count: 0,
          gross: 0,
          net: 0,
          pure: 0,
          making: 0,
          goldValue: 0,
          value: 0,
          avgMakingPerGram: 0,
        });
      }

      const b = map.get(cat);
      const qty = numOr(item.quantity, 1);
      const gross = numOr(item.weight_grams, 0);
      const net = numOr(item.net_weight, 0);
      const pure = numOr(item.pure_weight, 0);
      const making = numOr(item.workmanship_value, 0);
      const total = numOr(item.total_cost, 0);
      const goldValue = round(pure * price24, 2);

      b.count += qty;
      b.gross += gross;
      b.net += net;
      b.pure += pure;
      b.making += making;
      b.goldValue += goldValue;
      b.value += total;

      grand.count += qty;
      grand.gross += gross;
      grand.net += net;
      grand.pure += pure;
      grand.making += making;
      grand.goldValue += goldValue;
      grand.value += total;
    });

    /* متوسط المصنعية للجرام = إجمالي المصنعية / إجمالي الصافي */
    const rows = Array.from(map.values()).map(b => ({
      ...b,
      gross: round(b.gross, 3),
      net: round(b.net, 3),
      pure: round(b.pure, 4),
      making: round(b.making, 2),
      goldValue: round(b.goldValue, 2),
      value: round(b.value, 2),
      avgMakingPerGram: b.net > 0 ? round(b.making / b.net, 2) : 0,
    }));

    grand.gross = round(grand.gross, 3);
    grand.net = round(grand.net, 3);
    grand.pure = round(grand.pure, 4);
    grand.making = round(grand.making, 2);
    grand.goldValue = round(grand.goldValue, 2);
    grand.value = round(grand.value, 2);
    grand.avgMakingPerGram = grand.net > 0 ? round(grand.making / grand.net, 2) : 0;

    return { rows, grand, price24 };
  }

  function sortRows(rows, sortBy, sortDir) {
    const mult = sortDir === 'asc' ? 1 : -1;
    const sorted = rows.slice().sort((a, b) => {
      if (sortBy === 'category') {
        return String(a.category).localeCompare(String(b.category), 'ar') * mult;
      }
      const av = Number(a[sortBy]) || 0;
      const bv = Number(b[sortBy]) || 0;
      return (av - bv) * mult;
    });
    return sorted;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §4 · MODAL — INVENTORY COUNT SUMMARY
     ═════════════════════════════════════════════════════════════════════ */
  function openSummaryModal() {
    const items = getFilteredItems();

    if (!items.length) {
      GMS.Toast?.warn?.('لا توجد أصناف', 'طبّق فلاتر أو أضف أصنافاً أولاً');
      return;
    }

    const breakdown = computeBreakdown(items);
    State.lastBreakdown = breakdown;

    const sorted = sortRows(breakdown.rows, State.sortBy, State.sortDir);
    const g = breakdown.grand;

    const modal = GMS.Modal.open({
      title: '📊 ملخّص الجرد حسب التصنيف',
      icon: 'clipboard-list',
      size: 'xl',
      body: `
        <!-- معلومات الفلاتر -->
        <div style="padding:10px 14px;background:var(--info-bg);
                    border-radius:10px;margin-bottom:14px;
                    border-inline-start:3px solid var(--info);
                    font-size:11.5px;font-weight:700;
                    color:var(--text-2);line-height:1.6">
          <i data-lucide="filter" style="width:12px;height:12px;
             display:inline;vertical-align:-2px;color:var(--info)"></i>
          <b>الفلاتر المُطبَّقة:</b> ${esc(getActiveFiltersText())}
          <br>
          <i data-lucide="coins" style="width:12px;height:12px;
             display:inline;vertical-align:-2px;color:var(--primary);
             margin-top:4px"></i>
          <b>سعر 24K الحالي:</b>
          <span class="mono">${moneyFmt(breakdown.price24)}</span> ج.م/جم
        </div>

        <!-- إحصائيات سريعة -->
        <div style="display:grid;grid-template-columns:repeat(5,1fr);
                    gap:10px;margin-bottom:16px">
          <div style="padding:11px 13px;background:var(--surface-2);
                      border-radius:10px;border:1px solid var(--border)">
            <div style="font-size:10px;font-weight:800;color:var(--muted);
                        text-transform:uppercase">عدد التصنيفات</div>
            <div class="mono" style="font-size:18px;font-weight:900;
                        margin-top:4px;color:var(--info)">
              ${intFmt(breakdown.rows.length)}
            </div>
          </div>
          <div style="padding:11px 13px;background:var(--surface-2);
                      border-radius:10px;border:1px solid var(--border)">
            <div style="font-size:10px;font-weight:800;color:var(--muted);
                        text-transform:uppercase">عدد القطع</div>
            <div class="mono" style="font-size:18px;font-weight:900;
                        margin-top:4px;color:var(--primary)">
              ${intFmt(g.count)}
            </div>
          </div>
          <div style="padding:11px 13px;background:var(--surface-2);
                      border-radius:10px;border:1px solid var(--border)">
            <div style="font-size:10px;font-weight:800;color:var(--muted);
                        text-transform:uppercase">القائم</div>
            <div class="mono" style="font-size:18px;font-weight:900;
                        margin-top:4px;color:var(--success)">
              ${gramFmt(g.gross)}
            </div>
            <div style="font-size:9px;color:var(--muted);
                        font-weight:700;margin-top:2px">جم</div>
          </div>
          <div style="padding:11px 13px;background:var(--surface-2);
                      border-radius:10px;border:1px solid var(--border)">
            <div style="font-size:10px;font-weight:800;color:var(--muted);
                        text-transform:uppercase">البندق 24K</div>
            <div class="mono" style="font-size:18px;font-weight:900;
                        margin-top:4px;color:var(--warn)">
              ${gramFmt(g.pure)}
            </div>
            <div style="font-size:9px;color:var(--muted);
                        font-weight:700;margin-top:2px">جم</div>
          </div>
          <div style="padding:11px 13px;background:var(--gold-soft);
                      border-radius:10px;
                      border:1.5px solid color-mix(in srgb,var(--primary) 40%,var(--border))">
            <div style="font-size:10px;font-weight:800;color:var(--warn);
                        text-transform:uppercase">الإجمالي</div>
            <div class="mono" style="font-size:18px;font-weight:900;
                        margin-top:4px;color:var(--primary)">
              ${moneyFmt(g.value)}
            </div>
            <div style="font-size:9px;color:var(--muted);
                        font-weight:700;margin-top:2px">ج.م</div>
          </div>
        </div>

        <!-- الجدول التفصيلي -->
        <div style="border:1px solid var(--border);border-radius:12px;
                    overflow:hidden">
          <div style="max-height:520px;overflow-y:auto">
            <table class="tbl" style="font-size:12px;min-width:100%">
              <thead>
                <tr>
                  <th style="width:130px;cursor:pointer"
                      data-sort="category">
                    التصنيف
                    ${State.sortBy === 'category' ? `<span style="color:var(--primary)">${State.sortDir === 'asc' ? '↑' : '↓'}</span>` : ''}
                  </th>
                  <th style="width:70px" class="col-c"
                      data-sort="count">
                    عدد
                    ${State.sortBy === 'count' ? `<span style="color:var(--primary)">${State.sortDir === 'asc' ? '↑' : '↓'}</span>` : ''}
                  </th>
                  <th style="width:100px" class="col-num"
                      data-sort="gross">
                    قائم (جم)
                    ${State.sortBy === 'gross' ? `<span style="color:var(--primary)">${State.sortDir === 'asc' ? '↑' : '↓'}</span>` : ''}
                  </th>
                  <th style="width:100px" class="col-num"
                      data-sort="net">
                    صافي (جم)
                    ${State.sortBy === 'net' ? `<span style="color:var(--primary)">${State.sortDir === 'asc' ? '↑' : '↓'}</span>` : ''}
                  </th>
                  <th style="width:100px" class="col-num"
                      data-sort="pure">
                    بندق 24K
                    ${State.sortBy === 'pure' ? `<span style="color:var(--primary)">${State.sortDir === 'asc' ? '↑' : '↓'}</span>` : ''}
                  </th>
                  <th style="width:110px" class="col-num">
                    مصنعية/جم
                  </th>
                  <th style="width:110px" class="col-num">
                    إجمالي مصنعية
                  </th>
                  <th style="width:120px" class="col-num"
                      data-sort="value">
                    الإجمالي (ج.م)
                    ${State.sortBy === 'value' ? `<span style="color:var(--primary)">${State.sortDir === 'asc' ? '↑' : '↓'}</span>` : ''}
                  </th>
                </tr>
              </thead>
              <tbody id="ics-rows-host">
                ${renderRows(sorted)}
              </tbody>
              <tfoot>
                <tr style="background:var(--gold-soft);
                           border-top:2.5px solid var(--primary)">
                  <td style="font-weight:900;font-size:13px;
                             color:var(--primary)">
                    🏆 الإجمالي
                  </td>
                  <td class="col-c mono" style="font-weight:900;
                             color:var(--primary);font-size:14px">
                    ${intFmt(g.count)}
                  </td>
                  <td class="col-num mono" style="font-weight:900;
                             color:var(--primary);font-size:13px">
                    ${gramFmt(g.gross)}
                  </td>
                  <td class="col-num mono" style="font-weight:900;
                             color:var(--primary);font-size:13px">
                    ${gramFmt(g.net)}
                  </td>
                  <td class="col-num mono" style="font-weight:900;
                             color:var(--warn);font-size:13px">
                    ${gramFmt(g.pure)}
                  </td>
                  <td class="col-num mono" style="font-weight:900;
                             color:var(--primary);font-size:13px">
                    ${moneyFmt(g.avgMakingPerGram)}
                  </td>
                  <td class="col-num mono" style="font-weight:900;
                             color:var(--danger);font-size:13px">
                    ${moneyFmt(g.making)}
                  </td>
                  <td class="col-num mono" style="font-weight:900;
                             color:var(--primary);font-size:15px">
                    ${moneyFmt(g.value)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div style="margin-top:12px;padding:10px 14px;
                    background:var(--surface-2);border-radius:10px;
                    font-size:11px;font-weight:600;color:var(--muted);
                    text-align:center;line-height:1.6">
          <i data-lucide="info" style="width:11px;height:11px;
             display:inline;vertical-align:-1px"></i>
          اضغط على رأس أي عمود للترتيب · متوسط المصنعية محسوب = إجمالي المصنعية ÷ إجمالي الصافي
        </div>
      `,
      footer: `
        <button class="btn" data-close>إغلاق</button>
        <button class="btn btn-info" id="ics-copy-btn">
          <i data-lucide="copy"></i> نسخ الأرقام
        </button>
        <button class="btn btn-success" id="ics-excel-btn">
          <i data-lucide="download"></i> تصدير Excel
        </button>
        <button class="btn btn-primary" id="ics-print-btn">
          <i data-lucide="printer"></i> طباعة A4
        </button>
      `,
      onMount: (el, close) => {
        State.lastModal = modal;

        /* الترتيب بالنقر على رأس العمود */
        el.querySelectorAll('[data-sort]').forEach(th => {
          th.style.cursor = 'pointer';
          th.onclick = () => {
            const key = th.dataset.sort;
            if (State.sortBy === key) {
              State.sortDir = State.sortDir === 'asc' ? 'desc' : 'asc';
            } else {
              State.sortBy = key;
              State.sortDir = key === 'category' ? 'asc' : 'desc';
            }
            const newSorted = sortRows(breakdown.rows, State.sortBy, State.sortDir);
            const host = el.querySelector('#ics-rows-host');
            if (host) host.innerHTML = renderRows(newSorted);
            /* تحديث أيقونة الترتيب */
            close();
            setTimeout(openSummaryModal, 50);
          };
        });

        /* نسخ الأرقام */
        el.querySelector('#ics-copy-btn').onclick = async () => {
          const text = buildCopyText(sorted, g);
          const ok = await GMS.copyToClipboard?.(text);
          if (ok !== false) GMS.Toast?.ok?.('تم نسخ الملخص');
        };

        /* تصدير Excel */
        el.querySelector('#ics-excel-btn').onclick = () => {
          exportToExcel(sorted, g, breakdown.price24);
        };

        /* طباعة */
        el.querySelector('#ics-print-btn').onclick = () => {
          printSummary(sorted, g, breakdown.price24);
        };
      },
    });
  }

  function renderRows(rows) {
    return rows.map(r => `
      <tr>
        <td style="font-weight:800;font-size:12.5px">
          ${esc(r.category)}
        </td>
        <td class="col-c mono" style="font-weight:800;
                   color:var(--info);font-size:13px">
          ${intFmt(r.count)}
        </td>
        <td class="col-num mono" style="font-weight:800;
                   color:var(--success)">
          ${gramFmt(r.gross)}
        </td>
        <td class="col-num mono" style="font-weight:800">
          ${gramFmt(r.net)}
        </td>
        <td class="col-num mono" style="font-weight:800;
                   color:var(--warn)">
          ${gramFmt(r.pure)}
        </td>
        <td class="col-num mono" style="font-weight:700">
          ${moneyFmt(r.avgMakingPerGram)}
        </td>
        <td class="col-num mono" style="font-weight:800;
                   color:var(--danger)">
          ${moneyFmt(r.making)}
        </td>
        <td class="col-num mono" style="font-weight:900;
                   color:var(--primary);font-size:13px">
          ${moneyFmt(r.value)}
        </td>
      </tr>
    `).join('');
  }

  function buildCopyText(rows, grand) {
    const lines = [
      'ملخّص الجرد حسب التصنيف',
      '═══════════════════════════',
      'التصنيف\tعدد\tقائم\tصافي\tبندق\tإجمالي مصنعية\tالإجمالي',
    ];
    rows.forEach(r => {
      lines.push(
        `${r.category}\t${r.count}\t${r.gross}\t${r.net}\t${r.pure}\t${r.making}\t${r.value}`
      );
    });
    lines.push('───────────────────────────');
    lines.push(
      `${grand.category}\t${grand.count}\t${grand.gross}\t${grand.net}\t${grand.pure}\t${grand.making}\t${grand.value}`
    );
    return lines.join('\n');
  }

  /* ═════════════════════════════════════════════════════════════════════
     §5 · EXCEL EXPORT
     ═════════════════════════════════════════════════════════════════════ */
  function exportToExcel(rows, grand, price24) {
    if (!window.XLSX) {
      GMS.Toast?.err?.('محرك Excel غير متاح');
      return;
    }

    try {
      const data = rows.map(r => ({
        'التصنيف': r.category,
        'عدد القطع': r.count,
        'الوزن القائم (جم)': r.gross,
        'الوزن الصافي (جم)': r.net,
        'البندق 24K (جم)': r.pure,
        'متوسط المصنعية/جم (ج.م)': r.avgMakingPerGram,
        'إجمالي المصنعية (ج.م)': r.making,
        'قيمة الذهب (ج.م)': r.goldValue,
        'الإجمالي (ج.م)': r.value,
      }));

      /* صف الإجمالي */
      data.push({
        'التصنيف': 'الإجمالي',
        'عدد القطع': grand.count,
        'الوزن القائم (جم)': grand.gross,
        'الوزن الصافي (جم)': grand.net,
        'البندق 24K (جم)': grand.pure,
        'متوسط المصنعية/جم (ج.م)': grand.avgMakingPerGram,
        'إجمالي المصنعية (ج.م)': grand.making,
        'قيمة الذهب (ج.م)': grand.goldValue,
        'الإجمالي (ج.م)': grand.value,
      });

      const ws = XLSX.utils.json_to_sheet(data);
      ws['!cols'] = [
        { wch: 18 }, { wch: 10 }, { wch: 18 }, { wch: 18 },
        { wch: 16 }, { wch: 22 }, { wch: 22 }, { wch: 18 }, { wch: 18 },
      ];

      /* ورقة معلومات */
      const info = [
        ['ملخّص الجرد حسب التصنيف — Gold ERP Pro'],
        ['تاريخ التصدير', new Date().toLocaleString('ar-EG')],
        ['الفلاتر المُطبَّقة', getActiveFiltersText()],
        ['سعر 24K (ج.م/جم)', price24],
        ['عدد التصنيفات', rows.length],
        ['إجمالي القطع', grand.count],
        ['إجمالي القائم (جم)', grand.gross],
        ['إجمالي الصافي (جم)', grand.net],
        ['إجمالي البندق 24K (جم)', grand.pure],
        ['إجمالي المصنعية (ج.م)', grand.making],
        ['الإجمالي العام (ج.م)', grand.value],
      ];
      const wsInfo = XLSX.utils.aoa_to_sheet(info);
      wsInfo['!cols'] = [{ wch: 32 }, { wch: 30 }];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'الملخص');
      XLSX.utils.book_append_sheet(wb, wsInfo, 'معلومات');

      const filename = `inventory_count_summary_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(wb, filename);

      GMS.Toast?.ok?.(`تم تصدير ${rows.length} تصنيف`);

      if (GMS.Audit) {
        GMS.Audit.log('EXPORT', 'inventory', null,
          `تصدير ملخّص جرد — ${rows.length} تصنيف · ${grand.count} قطعة`,
          { count: grand.count, categories: rows.length });
      }
    } catch (e) {
      console.error('[ICS.exportExcel]', e);
      GMS.Toast?.err?.('فشل التصدير', e.message);
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §6 · PRINT A4
     ═════════════════════════════════════════════════════════════════════ */
  function printSummary(rows, grand, price24) {
    const root = document.getElementById('print-root');
    if (!root) return;

    const now = new Date();
    const dateStr = now.toLocaleDateString('ar-EG', {
      year: 'numeric', month: '2-digit', day: '2-digit',
    });
    const timeStr = now.toLocaleTimeString('ar-EG', {
      hour: '2-digit', minute: '2-digit',
    });

    const userName = GMS.Auth?.profile?.full_name || '—';
    const filtersText = getActiveFiltersText();

    root.innerHTML = `
      <div style="font-family:'Cairo',sans-serif;direction:rtl;
                  color:#000;padding:10mm;background:#fff">

        <!-- الهيدر -->
        <div style="text-align:center;
                    border-bottom:2.5px solid #000;
                    padding-bottom:5mm;margin-bottom:5mm">
          <h1 style="font-size:18pt;font-weight:900;margin:0 0 2mm">
            ${esc(GMS.APP_CONFIG?.NAME_AR || 'نظام إدارة الذهب')}
          </h1>
          <p style="margin:0;font-size:11pt;font-weight:700;color:#333">
            📊 تقرير ملخّص الجرد حسب التصنيف
          </p>
        </div>

        <!-- معلومات التقرير -->
        <div style="display:grid;grid-template-columns:1fr 1fr;
                    gap:3mm;font-size:10pt;margin-bottom:5mm;
                    padding:3mm;background:#f5f5f5;border-radius:2mm">
          <div>
            <div><b>التاريخ:</b> ${dateStr} · ${timeStr}</div>
            <div><b>المستخدم:</b> ${esc(userName)}</div>
          </div>
          <div>
            <div><b>عدد التصنيفات:</b> ${intFmt(rows.length)}</div>
            <div><b>سعر 24K:</b>
              <span style="font-family:monospace">
                ${moneyFmt(price24)} ج.م/جم
              </span>
            </div>
          </div>
        </div>

        <!-- الفلاتر -->
        <div style="font-size:9pt;margin-bottom:5mm;padding:2.5mm 3mm;
                    background:#e8f0ff;border-inline-start:3px solid #1c4fd8;
                    border-radius:1mm">
          <b>الفلاتر المُطبَّقة:</b> ${esc(filtersText)}
        </div>

        <!-- الجدول الرئيسي -->
        <table style="width:100%;border-collapse:collapse;
                      font-size:9pt;margin-bottom:5mm">
          <thead>
            <tr style="background:#1a2740;color:#fff">
              <th style="padding:2.5mm 2mm;border:1px solid #000;
                         text-align:right;font-weight:900">
                التصنيف
              </th>
              <th style="padding:2.5mm 2mm;border:1px solid #000;
                         text-align:center;font-weight:900;width:12mm">
                عدد
              </th>
              <th style="padding:2.5mm 2mm;border:1px solid #000;
                         text-align:left;font-weight:900;width:22mm">
                قائم (جم)
              </th>
              <th style="padding:2.5mm 2mm;border:1px solid #000;
                         text-align:left;font-weight:900;width:22mm">
                صافي (جم)
              </th>
              <th style="padding:2.5mm 2mm;border:1px solid #000;
                         text-align:left;font-weight:900;width:22mm">
                بندق (جم)
              </th>
              <th style="padding:2.5mm 2mm;border:1px solid #000;
                         text-align:left;font-weight:900;width:22mm">
                مصنعية/جم
              </th>
              <th style="padding:2.5mm 2mm;border:1px solid #000;
                         text-align:left;font-weight:900;width:25mm">
                إجمالي مصنعية
              </th>
              <th style="padding:2.5mm 2mm;border:1px solid #000;
                         text-align:left;font-weight:900;width:27mm">
                الإجمالي
              </th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td style="padding:2mm;border:1px solid #666;
                           font-weight:800">
                  ${esc(r.category)}
                </td>
                <td style="padding:2mm;border:1px solid #666;
                           text-align:center;
                           font-family:monospace;font-weight:800">
                  ${intFmt(r.count)}
                </td>
                <td style="padding:2mm;border:1px solid #666;
                           text-align:left;
                           font-family:monospace;font-weight:800">
                  ${gramFmt(r.gross)}
                </td>
                <td style="padding:2mm;border:1px solid #666;
                           text-align:left;
                           font-family:monospace">
                  ${gramFmt(r.net)}
                </td>
                <td style="padding:2mm;border:1px solid #666;
                           text-align:left;
                           font-family:monospace;font-weight:800">
                  ${gramFmt(r.pure)}
                </td>
                <td style="padding:2mm;border:1px solid #666;
                           text-align:left;
                           font-family:monospace">
                  ${moneyFmt(r.avgMakingPerGram)}
                </td>
                <td style="padding:2mm;border:1px solid #666;
                           text-align:left;
                           font-family:monospace;font-weight:800">
                  ${moneyFmt(r.making)}
                </td>
                <td style="padding:2mm;border:1px solid #666;
                           text-align:left;
                           font-family:monospace;font-weight:900">
                  ${moneyFmt(r.value)}
                </td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr style="background:#f1e8d0;font-weight:900;
                       border-top:2.5px solid #000">
              <td style="padding:2.5mm 2mm;border:1.5px solid #000">
                الإجمالي
              </td>
              <td style="padding:2.5mm 2mm;border:1.5px solid #000;
                         text-align:center;font-family:monospace;
                         font-size:11pt">
                ${intFmt(grand.count)}
              </td>
              <td style="padding:2.5mm 2mm;border:1.5px solid #000;
                         text-align:left;font-family:monospace;
                         font-size:10pt">
                ${gramFmt(grand.gross)}
              </td>
              <td style="padding:2.5mm 2mm;border:1.5px solid #000;
                         text-align:left;font-family:monospace;
                         font-size:10pt">
                ${gramFmt(grand.net)}
              </td>
              <td style="padding:2.5mm 2mm;border:1.5px solid #000;
                         text-align:left;font-family:monospace;
                         font-size:10pt">
                ${gramFmt(grand.pure)}
              </td>
              <td style="padding:2.5mm 2mm;border:1.5px solid #000;
                         text-align:left;font-family:monospace;
                         font-size:10pt">
                ${moneyFmt(grand.avgMakingPerGram)}
              </td>
              <td style="padding:2.5mm 2mm;border:1.5px solid #000;
                         text-align:left;font-family:monospace;
                         font-size:10pt">
                ${moneyFmt(grand.making)}
              </td>
              <td style="padding:2.5mm 2mm;border:1.5px solid #000;
                         text-align:left;font-family:monospace;
                         font-size:12pt">
                ${moneyFmt(grand.value)}
              </td>
            </tr>
          </tfoot>
        </table>

        <!-- ملاحظة -->
        <div style="font-size:8.5pt;color:#555;margin-bottom:6mm;
                    text-align:center;padding:2mm;
                    background:#fafafa;border-radius:1mm">
          متوسط المصنعية محسوب كـ (إجمالي المصنعية ÷ إجمالي الوزن الصافي)
          · الإجمالي يشمل قيمة الذهب + المصنعية
        </div>

        <!-- التوقيعات -->
        <div style="display:flex;justify-content:space-between;
                    font-size:9pt;margin-top:10mm">
          <div style="border-top:1px solid #000;padding-top:2mm;
                      min-width:40mm;text-align:center">
            <b>أعدَّه</b><br>
            ${esc(userName)}
          </div>
          <div style="border-top:1px solid #000;padding-top:2mm;
                      min-width:40mm;text-align:center">
            <b>راجعه</b>
          </div>
          <div style="border-top:1px solid #000;padding-top:2mm;
                      min-width:40mm;text-align:center">
            <b>اعتمده</b>
          </div>
        </div>
      </div>
    `;

    /* إعادة @page لحجم A4 */
    const pageStyle = document.getElementById('gms-page-size-style');
    const original = pageStyle?.textContent || '';
    if (pageStyle) {
      pageStyle.textContent = `
        @media print {
          @page { size: A4 portrait; margin: 8mm; }
        }
      `;
    }

    setTimeout(() => {
      window.print();
      setTimeout(() => {
        if (pageStyle && original) pageStyle.textContent = original;
      }, 1200);
    }, 150);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §7 · INJECT BUTTON INTO INVENTORY TOOLBAR
     ═════════════════════════════════════════════════════════════════════ */
  function injectButton() {
    if (document.getElementById('inv-count-summary-btn')) return;

    const colsBtn = document.getElementById('inv-cols-btn');
    if (!colsBtn) return;

    const btn = document.createElement('button');
    btn.className = 'btn btn-sm';
    btn.id = 'inv-count-summary-btn';
    btn.type = 'button';
    btn.title = 'ملخّص الجرد حسب التصنيف (Ctrl+Shift+G)';
    btn.style.cssText = `
      background:linear-gradient(135deg,
        color-mix(in srgb,var(--info) 12%,var(--surface)) 0%,
        color-mix(in srgb,var(--info) 4%,var(--surface)) 100%);
      border-color:color-mix(in srgb,var(--info) 40%,var(--border));
      color:var(--info);
      font-weight:800;
    `;
    btn.innerHTML = `
      <i data-lucide="clipboard-list" style="width:13px;height:13px"></i>
      ملخّص الجرد
    `;

    btn.onclick = () => openSummaryModal();

    /* إدراج الزر قبل زر "الأعمدة" */
    colsBtn.parentNode.insertBefore(btn, colsBtn);

    /* إعادة إنشاء الأيقونات */
    window.lucide?.createIcons();
  }

  /* ═════════════════════════════════════════════════════════════════════
     §8 · HOOK INTO INVENTORY RENDER
     ═════════════════════════════════════════════════════════════════════ */
  function installHook() {
    const inv = GMS.Views?.inventory;
    if (!inv || inv._countSummaryInstalled) return false;

    const originalRender = inv.render;

    inv.render = async function (root) {
      const result = await originalRender.call(this, root);
      /* بعد انتهاء الـ render الأصلي، حقن الزر */
      setTimeout(injectButton, 50);
      return result;
    };

    /* لو الصفحة معروضة بالفعل، حقن الزر فوراً */
    if (GMS.Router?.currentId?.() === 'inventory') {
      setTimeout(injectButton, 100);
    }

    inv._countSummaryInstalled = true;
    return true;
  }

  /* محاولة التثبيت مع إعادة المحاولة */
  let retries = 0;
  function tryInstall() {
    if (installHook()) {
      console.log('[ICS] ✅ Installed on inventory view');
      return;
    }
    if (retries++ < 20) {
      setTimeout(tryInstall, 250);
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §9 · KEYBOARD SHORTCUT
     ═════════════════════════════════════════════════════════════════════ */
  document.addEventListener('keydown', (e) => {
    if (!e.ctrlKey || !e.shiftKey) return;
    if (e.key !== 'G' && e.key !== 'g') return;

    if (GMS.Router?.currentId?.() !== 'inventory') return;

    e.preventDefault();
    openSummaryModal();
  });

  /* ═════════════════════════════════════════════════════════════════════
     §10 · EXPORT
     ═════════════════════════════════════════════════════════════════════ */
  GMS.InventoryCountSummary = {
    open: openSummaryModal,
    compute: computeBreakdown,
    getFilteredItems,
    state: State,
  };

  /* ═════════════════════════════════════════════════════════════════════
     §11 · INIT
     ═════════════════════════════════════════════════════════════════════ */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(tryInstall, 1500);
    });
  } else {
    setTimeout(tryInstall, 1500);
  }

  console.log(
    '%c📊 Inventory Count Summary loaded · Group by Category',
    'color:#1c4fd8;font-weight:900;font-size:12px;padding:2px 6px;' +
    'background:#e9efff;border-radius:4px;'
  );

})();