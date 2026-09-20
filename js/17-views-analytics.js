/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ENTERPRISE — js/17-views-analytics.js
   التحليلات الذكية وتشخيص الركود:
     - مخطط الارتباط (Sales vs Gold Rate)
     - توزيع العيارات (Doughnut)
     - لوحة شرف البائعين (Bar)
     - الأصناف الأكثر حركة (Top 10)
     - محرّك الركود (Dead Stock Engine)
     - تحليلات الخسس التشغيلية
     - تقارير قابلة للتصدير
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const GMS = window.GMS = window.GMS || {};

  /* ═════════════════════════════════════════════════════════════════════
     §1 · ANALYTICS STATE
     ═════════════════════════════════════════════════════════════════════ */
  const AnaState = {
    /* الفترة الزمنية */
    days: 30,

    /* الفلاتر */
    filters: {
      branch: '',
      karat: '',
    },

    /* البيانات المحسوبة */
    data: {
      dailySales: [],
      dailyRate: [],
      carats: {},
      leaderboard: [],
      fastMoving: [],
      deadStock: [],
      deadSummary: null,
      lossRecords: [],
      lossSummary: null,
    },

    /* المخططات */
    charts: {
      correlation: null,
      carats: null,
      leaderboard: null,
      lossTrend: null,
      lossType: null,
    },

    /* Loading */
    loading: false,

    /* المستمعون */
    unsubscribers: [],

    /* مؤقتات */
    timers: {
      refresh: null,
    },
  };

  /* عتبات الركود */
  const DEAD_STOCK = {
    watch: 90,
    warn: 120,
    critical: 180,
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

  function destroyChart(key) {
    if (AnaState.charts[key]) {
      try {
        AnaState.charts[key].destroy();
      } catch (_) {}
      AnaState.charts[key] = null;
    }
  }

  function destroyAllCharts() {
    Object.keys(AnaState.charts).forEach(destroyChart);
  }

  function isChartReady() {
    return typeof window.Chart !== 'undefined';
  }

  function cleanupListeners() {
    AnaState.unsubscribers.forEach(fn => {
      try { fn(); } catch (_) {}
    });
    AnaState.unsubscribers = [];

    clearTimeout(AnaState.timers.refresh);
  }

  /**
   * حساب معامل الارتباط (Pearson)
   */
  function pearson(xs, ys) {
    const n = Math.min(xs.length, ys.length);
    if (n < 3) return 0;

    let mx = 0, my = 0;
    for (let i = 0; i < n; i++) { mx += xs[i]; my += ys[i]; }
    mx /= n; my /= n;

    let num = 0, dx = 0, dy = 0;
    for (let i = 0; i < n; i++) {
      const a = xs[i] - mx;
      const b = ys[i] - my;
      num += a * b;
      dx += a * a;
      dy += b * b;
    }

    const denom = Math.sqrt(dx * dy);
    return denom === 0 ? 0 : GMS.round(num / denom, 3);
  }

  /**
   * تفسير معامل الارتباط
   */
  function interpretCorr(r) {
    const abs = Math.abs(r);
    const dir = r < 0 ? 'عكسي' : r > 0 ? 'طردي' : 'محايد';
    const strength = abs >= 0.7 ? 'قوي جداً'
                   : abs >= 0.5 ? 'قوي'
                   : abs >= 0.3 ? 'متوسط'
                   : abs >= 0.1 ? 'ضعيف'
                   : 'معدوم';
    return { abs, dir, strength, label: `${strength} · ${dir}` };
  }

  /* ═════════════════════════════════════════════════════════════════════
     §3 · DATA COMPUTATION
     ───────────────────────────────────────────────────────────────────── */

  async function computeAnalytics() {
    const days = AnaState.days;
    const data = AnaState.data;

    try {
      AnaState.loading = true;

      /* ─── 1 · البيانات الأساسية ───────────────────────────── */
      let inventory = [];
      let sales = [];

      if (GMS.IDB?.isOpen) {
        try {
          inventory = await GMS.IDB.getAll();
        } catch (e) {
          console.warn('[Ana] IDB read failed:', e);
        }
      }

      if (!inventory.length && GMS.Demo) {
        inventory = GMS.Demo.getInventory();
      }

      if (GMS.Demo) {
        sales = GMS.Demo.getSales();
      }

      /* الفلاتر */
      if (AnaState.filters.branch) {
        inventory = inventory.filter(i => i.branch_id === AnaState.filters.branch);
        sales = sales.filter(s => s.branch_id === AnaState.filters.branch);
      }

      if (AnaState.filters.karat) {
        inventory = inventory.filter(i => Number(i.karat) === Number(AnaState.filters.karat));
        sales = sales.filter(s => Number(s.karat) === Number(AnaState.filters.karat));
      }

      /* ─── 2 · المبيعات اليومية ─────────────────────────────── */
      const since = new Date();
      since.setDate(since.getDate() - days);

      const dailyMap = new Map();

      for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        dailyMap.set(key, { date: key, revenue: 0, gold: 0, count: 0 });
      }

      sales.forEach(s => {
        const key = s.created_at.slice(0, 10);
        if (!dailyMap.has(key)) return;

        const b = dailyMap.get(key);
        b.revenue += Number(s.grand_total || 0);
        b.gold += Number(s.total_pure_weight || 0);
        b.count++;
      });

      data.dailySales = Array.from(dailyMap.values()).map(d => ({
        date: d.date,
        revenue: GMS.round(d.revenue, 2),
        gold: GMS.round(d.gold, 4),
        count: d.count,
      }));

      /* ─── 3 · أسعار الذهب اليومية ─────────────────────────── */
      const price24 = GMS.Cache?.getPrice()?.price_24 || GMS.APP_CONFIG.DEFAULT_PRICE_24;

      /* نحاكي تطوراً بسيطاً للسعر */
      data.dailyRate = data.dailySales.map((d, i) => {
        const offset = (i - days / 2) / days * 200;
        const noise = Math.sin(i / 4) * 30;
        return {
          date: d.date,
          price24: GMS.round(price24 + offset + noise, 2),
        };
      });

      /* ─── 4 · توزيع العيارات ──────────────────────────────── */
      const carats = {};
      GMS.KARAT_ORDER.forEach(k => {
        carats[k] = { karat: k, count: 0, netWeight: 0, pureWeight: 0, totalValue: 0 };
      });

      const inStock = inventory.filter(i => i.status === 'IN_STOCK');

      inStock.forEach(item => {
        const k = Number(item.karat);
        if (!carats[k]) {
          carats[k] = { karat: k, count: 0, netWeight: 0, pureWeight: 0, totalValue: 0 };
        }
        carats[k].count++;
        carats[k].netWeight += Number(item.net_weight || 0);
        carats[k].pureWeight += Number(item.pure_weight || 0);
        carats[k].totalValue += Number(item.total_cost || 0);
      });

      /* تقريب */
      Object.keys(carats).forEach(k => {
        carats[k].netWeight = GMS.round(carats[k].netWeight, 3);
        carats[k].pureWeight = GMS.round(carats[k].pureWeight, 4);
        carats[k].totalValue = GMS.round(carats[k].totalValue, 2);
      });

      data.carats = carats;

      /* ─── 5 · لوحة شرف البائعين ───────────────────────────── */
      const people = {};

      sales.forEach(s => {
        const name = s.cashier_name || 'غير محدد';
        if (!people[name]) {
          people[name] = { name, revenue: 0, gold: 0, count: 0 };
        }
        people[name].revenue += Number(s.grand_total || 0);
        people[name].gold += Number(s.total_pure_weight || 0);
        people[name].count++;
      });

      data.leaderboard = Object.values(people)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 12)
        .map(p => ({
          ...p,
          revenue: GMS.round(p.revenue, 2),
          gold: GMS.round(p.gold, 4),
        }));

      /* ─── 6 · الأصناف الأكثر حركة ─────────────────────────── */
      const itemCounts = new Map();

      sales.slice(0, 500).forEach(s => {
        if (!s.lines) return;
        s.lines.forEach(l => {
          if (!l.sku) return;
          if (!itemCounts.has(l.sku)) {
            itemCounts.set(l.sku, {
              sku: l.sku,
              karat: l.karat,
              category: null,
              soldCount: 0,
              pureWeight: 0,
              revenue: 0,
            });
          }
          const e = itemCounts.get(l.sku);
          e.soldCount++;
          e.pureWeight += Number(l.pure_weight || 0);
          e.revenue += Number(l.line_total || 0);
        });
      });

      /* إثراء بالبيانات من المخزون */
      const invMap = new Map();
      inventory.forEach(i => invMap.set(i.sku, i));

      data.fastMoving = Array.from(itemCounts.values())
        .map(item => {
          const inv = invMap.get(item.sku);
          return {
            ...item,
            category: inv?.category || '—',
            karat: item.karat || inv?.karat,
            pureWeight: GMS.round(item.pureWeight, 3),
            revenue: GMS.round(item.revenue, 2),
          };
        })
        .sort((a, b) => b.soldCount - a.soldCount || b.revenue - a.revenue)
        .slice(0, 10);

      /* ─── 7 · محرّك الركود ─────────────────────────────────── */
      const now = Date.now();

      data.deadStock = inStock
        .map(item => {
          const daysIdle = Math.floor(
            (now - new Date(item.created_at).getTime()) / 86400000
          );

          if (daysIdle < DEAD_STOCK.watch) return null;

          const pureWeight = Number(item.pure_weight || 0);
          const capitalEGP = Number(item.total_cost || 0);
          const marketValue = GMS.round(pureWeight * price24, 2);

          const severity = daysIdle >= DEAD_STOCK.critical ? 'critical'
                          : daysIdle >= DEAD_STOCK.warn ? 'warn'
                          : 'watch';

          return {
            ...item,
            daysIdle,
            pureWeight,
            capitalEGP,
            marketValue,
            severity,
          };
        })
        .filter(Boolean)
        .sort((a, b) => b.daysIdle - a.daysIdle);

      const ds = data.deadStock;

      data.deadSummary = {
        total: ds.length,
        capital: GMS.round(ds.reduce((a, i) => a + i.capitalEGP, 0), 2),
        gold: GMS.round(ds.reduce((a, i) => a + i.pureWeight, 0), 4),
        market: GMS.round(ds.reduce((a, i) => a + i.marketValue, 0), 2),
        critical: ds.filter(i => i.severity === 'critical').length,
        warn: ds.filter(i => i.severity === 'warn').length,
        watch: ds.filter(i => i.severity === 'watch').length,
        criticalCapital: GMS.round(
          ds.filter(i => i.severity === 'critical')
            .reduce((a, i) => a + i.capitalEGP, 0),
          2
        ),
        avgDays: ds.length
          ? Math.round(ds.reduce((a, i) => a + i.daysIdle, 0) / ds.length)
          : 0,
      };

      /* ─── 8 · تحليلات الخسس ────────────────────────────────── */
      const melting = GMS.Demo?.getMeltingBatches() || [];
      const polishing = GMS.Demo?.getPolishingBatches() || [];

      data.lossRecords = [
        ...melting.map(r => ({
          ...r,
          opType: 'melting',
          lossWeight: Number(r.loss_weight || 0),
          lossPct: Number(r.loss_percentage || 0),
          base: Number(r.pre_melt_weight || 0),
          lossValueEGP: GMS.round(Number(r.loss_weight || 0) * price24, 2),
          lossDate: r.created_at,
        })),
        ...polishing.map(r => ({
          ...r,
          opType: 'polishing',
          lossWeight: Number(r.loss_weight || 0),
          lossPct: Number(r.loss_percentage || 0),
          base: Number(r.pre_weight || 0),
          lossValueEGP: GMS.round(Number(r.loss_weight || 0) * price24, 2),
          lossDate: r.created_at,
        })),
      ].sort((a, b) => new Date(b.lossDate) - new Date(a.lossDate));

      const recentLoss = data.lossRecords.filter(r =>
        new Date(r.lossDate).getTime() > Date.now() - 30 * 86400000
      );

      data.lossSummary = {
        total: recentLoss.length,
        totalGrams: GMS.round(recentLoss.reduce((a, r) => a + r.lossWeight, 0), 3),
        totalValue: GMS.round(recentLoss.reduce((a, r) => a + r.lossValueEGP, 0), 2),
        avgPct: recentLoss.length
          ? GMS.round(recentLoss.reduce((a, r) => a + r.lossPct, 0) / recentLoss.length, 3)
          : 0,
        suspicious: recentLoss.filter(r => r.is_suspicious).length,
        meltingCount: recentLoss.filter(r => r.opType === 'melting').length,
        polishingCount: recentLoss.filter(r => r.opType === 'polishing').length,
      };

      return data;

    } catch (e) {
      console.error('[Ana] computeAnalytics:', e);
      return data;
    } finally {
      AnaState.loading = false;
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §4 · CHART RENDERERS
     ───────────────────────────────────────────────────────────────────── */

  function renderCorrelationChart() {
    destroyChart('correlation');
    if (!isChartReady()) return;

    const canvas = document.getElementById('ana-chart-correlation');
    if (!canvas) return;

    const sales = AnaState.data.dailySales || [];
    const rates = AnaState.data.dailyRate || [];

    if (!sales.length) {
      canvas.parentElement.innerHTML = `
        <div class="empty" style="padding:40px">
          <i data-lucide="line-chart"></i>
          <p>لا توجد بيانات للفترة المحددة</p>
        </div>`;
      window.lucide?.createIcons();
      return;
    }

    const labels = sales.map(s => {
      const d = new Date(s.date);
      return d.toLocaleDateString('ar-EG', { day: '2-digit', month: '2-digit' });
    });

    const revenueSeries = sales.map(s => s.revenue);
    const rateSeries = rates.map(r => r.price24);

    /* الارتباط */
    const r = pearson(revenueSeries, rateSeries);
    const info = interpretCorr(r);

    /* تحديث الشارة */
    const badge = document.getElementById('ana-corr-badge');
    if (badge) {
      let cls = 'corr-none';
      if (info.abs >= 0.5) cls = 'corr-strong';
      else if (info.abs >= 0.3) cls = 'corr-moderate';
      else if (info.abs >= 0.1) cls = 'corr-weak';

      badge.className = `corr-badge ${cls}`;
      const icon = info.abs >= 0.5 ? 'trending-down'
                 : info.abs >= 0.3 ? 'activity'
                 : 'minus';
      badge.innerHTML = `
        <i data-lucide="${icon}" style="width:12px;height:12px"></i>
        <span>ارتباط ${info.label} · r = ${r.toFixed(3)}</span>
      `;
    }

    const explain = document.getElementById('ana-corr-explain');
    if (explain) {
      if (r < -0.3) explain.textContent = 'عند ارتفاع السعر تنخفض الكميات المبيعة';
      else if (r > 0.3) explain.textContent = 'ارتفاع السعر يصحبه ارتفاع في القيمة الإجمالية';
      else explain.textContent = 'لا يوجد ارتباط واضح بين السعر وحجم المبيعات';
    }

    const textClr = cssVar('--text');
    const mutedClr = cssVar('--muted');
    const borderClr = cssVar('--border');
    const primaryClr = cssVar('--primary') || '#c8a24a';
    const infoClr = cssVar('--info') || '#1c4fd8';

    AnaState.charts.correlation = new Chart(canvas, {
      data: {
        labels,
        datasets: [
          {
            type: 'bar',
            label: 'حجم المبيعات (ج.م)',
            data: revenueSeries,
            backgroundColor: 'rgba(200, 162, 74, 0.55)',
            borderColor: primaryClr,
            borderWidth: 1,
            borderRadius: 4,
            yAxisID: 'y',
            order: 2,
          },
          {
            type: 'line',
            label: 'سعر 24K (ج.م/جم)',
            data: rateSeries,
            borderColor: infoClr,
            backgroundColor: 'rgba(28, 79, 216, 0.10)',
            borderWidth: 2.5,
            tension: 0.35,
            pointRadius: 0,
            pointHoverRadius: 5,
            fill: false,
            yAxisID: 'y1',
            order: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 41, 0.94)',
            titleColor: '#fff',
            bodyColor: '#e8eefb',
            padding: 12,
            cornerRadius: 8,
            titleFont: { family: 'Cairo', size: 12, weight: '700' },
            bodyFont: { family: 'Cairo', size: 12 },
            callbacks: {
              label: (c) => {
                if (c.datasetIndex === 0) {
                  return `  المبيعات: ${GMS.moneyFmt(c.parsed.y)} ج.م`;
                }
                return `  السعر: ${GMS.moneyFmt(c.parsed.y)} ج.م/جم`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: mutedClr,
              font: { size: 10, family: 'Cairo' },
              maxRotation: 0,
              autoSkipPadding: 12,
            },
          },
          y: {
            position: 'right',
            grid: { color: borderClr, drawBorder: false },
            ticks: {
              color: mutedClr,
              font: { size: 10 },
              callback: (v) => GMS.shortMoney(v),
            },
            title: {
              display: true,
              text: 'المبيعات (ج.م)',
              color: mutedClr,
              font: { size: 10, family: 'Cairo', weight: '700' },
            },
          },
          y1: {
            position: 'left',
            grid: { display: false },
            ticks: {
              color: infoClr,
              font: { size: 10 },
              callback: (v) => GMS.shortMoney(v),
            },
            title: {
              display: true,
              text: 'سعر 24K (ج.م)',
              color: infoClr,
              font: { size: 10, family: 'Cairo', weight: '700' },
            },
          },
        },
      },
    });
  }

  function renderCaratsChart() {
    destroyChart('carats');
    if (!isChartReady()) return;

    const canvas = document.getElementById('ana-chart-carats');
    if (!canvas) return;

    const carats = AnaState.data.carats || {};

    const entries = GMS.KARAT_ORDER
      .filter(k => carats[k] && carats[k].count > 0)
      .map(k => ({
        karat: k,
        count: carats[k].count,
        pure: carats[k].pureWeight,
        value: carats[k].totalValue,
        color: GMS.karatColor(k),
      }));

    if (!entries.length) {
      canvas.parentElement.innerHTML = `
        <div class="empty" style="padding:30px">
          <i data-lucide="package-x"></i>
          <p>لا توجد بيانات مخزون</p>
        </div>`;
      window.lucide?.createIcons();
      return;
    }

    const totalPure = entries.reduce((a, e) => a + e.pure, 0);
    const textClr = cssVar('--text');

    AnaState.charts.carats = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: entries.map(e => `${e.karat}K`),
        datasets: [{
          data: entries.map(e => GMS.round(e.pure, 3)),
          backgroundColor: entries.map(e => e.color),
          borderWidth: 2,
          borderColor: cssVar('--surface'),
          hoverOffset: 8,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: textClr,
              font: { family: 'Cairo', size: 11, weight: '600' },
              padding: 10,
              usePointStyle: true,
              pointStyle: 'circle',
            },
          },
          tooltip: {
            backgroundColor: 'rgba(15,23,41,.94)',
            titleColor: '#fff',
            bodyColor: '#e8eefb',
            padding: 11,
            cornerRadius: 8,
            titleFont: { family: 'Cairo', size: 12, weight: '700' },
            bodyFont: { family: 'Cairo', size: 12 },
            callbacks: {
              label: (c) => {
                const entry = entries[c.dataIndex];
                const pct = totalPure > 0 ? ((entry.pure / totalPure) * 100).toFixed(1) : '0';
                return [
                  `  البندق: ${GMS.gramFmt(entry.pure)} جم (${pct}%)`,
                  `  عدد القطع: ${GMS.intFmt(entry.count)}`,
                  `  القيمة: ${GMS.moneyFmt(entry.value)} ج.م`,
                ];
              },
            },
          },
        },
      },
    });

    /* Legend */
    const legend = document.getElementById('ana-carats-legend');
    if (legend) {
      legend.innerHTML = entries.map(e => {
        const pct = totalPure > 0 ? ((e.pure / totalPure) * 100).toFixed(1) : '0';
        return `
          <div class="legend-item">
            <span class="legend-dot" style="background:${e.color}"></span>
            <span><b>${e.karat}K</b> · ${GMS.gramFmt(e.pure)}جم · ${pct}%</span>
          </div>
        `;
      }).join('');
    }
  }

  function renderLeaderboardChart() {
    destroyChart('leaderboard');
    if (!isChartReady()) return;

    const canvas = document.getElementById('ana-chart-leaderboard');
    if (!canvas) return;

    const data = AnaState.data.leaderboard || [];
    if (!data.length) {
      canvas.parentElement.innerHTML = `
        <div class="empty" style="padding:30px">
          <i data-lucide="users"></i>
          <p>لا توجد بيانات بائعين</p>
        </div>`;
      window.lucide?.createIcons();
      return;
    }

    const totalRev = data.reduce((a, x) => a + x.revenue, 0);

    const sub = document.getElementById('ana-lb-sub');
    if (sub) {
      sub.textContent = `${data.length} بائع · ${GMS.moneyFmt(totalRev)} ج.م`;
    }

    const labels = data.map(d => d.name);
    const values = data.map(d => GMS.round(d.revenue, 2));

    const colors = values.map((_, i) =>
      i === 0 ? '#c8a24a'
      : i === 1 ? '#e8c874'
      : i === 2 ? '#9c7726'
      : 'rgba(107, 122, 149, 0.7)'
    );

    const textClr = cssVar('--text');
    const mutedClr = cssVar('--muted');
    const borderClr = cssVar('--border');

    AnaState.charts.leaderboard = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'إجمالي المبيعات (ج.م)',
          data: values,
          backgroundColor: colors,
          borderRadius: 7,
          maxBarThickness: 28,
          borderSkipped: false,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(15,23,41,.94)',
            titleColor: '#fff',
            bodyColor: '#e8eefb',
            padding: 11,
            cornerRadius: 8,
            titleFont: { family: 'Cairo', size: 12, weight: '700' },
            bodyFont: { family: 'Cairo', size: 12 },
            callbacks: {
              label: (c) => {
                const d = data[c.dataIndex];
                const pct = totalRev > 0 ? ((d.revenue / totalRev) * 100).toFixed(1) : '0';
                return [
                  `  المبيعات: ${GMS.moneyFmt(d.revenue)} ج.م (${pct}%)`,
                  `  عدد الفواتير: ${GMS.intFmt(d.count)}`,
                  `  بندق: ${GMS.gramFmt(d.gold)} جم`,
                ];
              },
            },
          },
        },
        scales: {
          x: {
            grid: { color: borderClr, drawBorder: false },
            ticks: {
              color: mutedClr,
              font: { size: 10 },
              callback: (v) => GMS.shortMoney(v),
            },
          },
          y: {
            grid: { display: false },
            ticks: {
              color: textClr,
              font: { size: 11, family: 'Cairo', weight: '700' },
            },
          },
        },
      },
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §5 · RENDER: FAST MOVING TABLE
     ───────────────────────────────────────────────────────────────────── */

  function renderFastMoving() {
    const host = document.getElementById('ana-fast-moving-host');
    if (!host) return;

    const data = AnaState.data.fastMoving || [];

    if (!data.length) {
      host.innerHTML = `
        <div class="empty" style="padding:40px 20px">
          <i data-lucide="zap"></i>
          <p>لا توجد حركات في آخر 30 يوم</p>
          <span>لم تُسجَّل أي عملية بيع للأصناف في هذه الفترة</span>
        </div>`;
      window.lucide?.createIcons();
      return;
    }

    const maxSold = Math.max(...data.map(d => d.soldCount));

    host.innerHTML = `
      <table class="tbl">
        <thead>
          <tr>
            <th style="width:44px" class="col-c">#</th>
            <th>الصنف</th>
            <th style="width:60px" class="col-c">عيار</th>
            <th style="width:80px" class="col-num">عدد البيوع</th>
            <th style="width:100px" class="col-num">بندق (جم)</th>
            <th style="width:110px" class="col-num">الإيراد (ج.م)</th>
          </tr>
        </thead>
        <tbody>
          ${data.map((d, i) => {
            const rankCls = i === 0 ? 'rank-1'
                          : i === 1 ? 'rank-2'
                          : i === 2 ? 'rank-3'
                          : '';
            const pct = (d.soldCount / maxSold) * 100;

            return `
              <tr>
                <td class="col-c">
                  <span style="display:inline-flex;align-items:center;
                               justify-content:center;width:26px;height:26px;
                               border-radius:50%;font-weight:900;font-size:11.5px;
                               background:${i === 0 ? 'var(--gold-grad)'
                                          : i === 1 ? 'linear-gradient(135deg,#e5e5e5,#b5b5b5)'
                                          : i === 2 ? 'linear-gradient(135deg,#e8b98c,#b17a4d)'
                                          : 'var(--surface-3)'};
                               color:${i <= 2 ? '#2a1f05' : 'var(--text-2)'}">
                    ${i + 1}
                  </span>
                </td>
                <td>
                  <div class="cell-sku">
                    <span class="sku-code mono">${GMS.esc(d.sku)}</span>
                    <div style="display:flex;align-items:center;gap:6px;margin-top:2px">
                      <span class="sku-meta">${GMS.esc(d.category || '—')}</span>
                      <span style="flex:1;height:3px;background:var(--surface-3);
                                   border-radius:2px;overflow:hidden;max-width:80px">
                        <span style="display:block;height:100%;width:${pct}%;
                                     background:var(--gold-grad);border-radius:2px"></span>
                      </span>
                    </div>
                  </div>
                </td>
                <td class="col-c">
                  <span class="karat-badge" data-k="${d.karat}">${d.karat}K</span>
                </td>
                <td class="col-num" style="font-weight:900;color:var(--primary)">
                  ${GMS.intFmt(d.soldCount)}
                </td>
                <td class="col-num">${GMS.gramFmt(d.pureWeight)}</td>
                <td class="col-num" style="font-weight:800">${GMS.moneyFmt(d.revenue)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="3">الإجمالي (Top 10)</td>
            <td class="col-num">${GMS.intFmt(data.reduce((a, d) => a + d.soldCount, 0))}</td>
            <td class="col-num">${GMS.gramFmt(data.reduce((a, d) => a + d.pureWeight, 0))}</td>
            <td class="col-num">${GMS.moneyFmt(data.reduce((a, d) => a + d.revenue, 0))}</td>
          </tr>
        </tfoot>
      </table>
    `;
    window.lucide?.createIcons();
  }

  /* ═════════════════════════════════════════════════════════════════════
     §6 · RENDER: DEAD STOCK
     ───────────────────────────────────────────────────────────────────── */

  function renderDeadStock() {
    const summaryHost = document.getElementById('ana-dead-summary');
    const tableHost = document.getElementById('ana-dead-table-host');

    const summary = AnaState.data.deadSummary;
    const data = AnaState.data.deadStock || [];

    if (!summaryHost || !tableHost) return;

    /* Summary */
    if (!summary || !summary.total) {
      summaryHost.innerHTML = `
        <div class="ds-box info" style="grid-column:1/-1">
          <div class="ds-k">
            <i data-lucide="check-circle-2"></i>
            لا يوجد ركود
          </div>
          <div class="ds-v" style="font-size:16px;color:var(--success)">
            جميع الأصناف بحركة جيدة
          </div>
          <div class="ds-meta">
            لا توجد أصناف في المخزون لأكثر من 90 يوم
          </div>
        </div>`;
    } else {
      summaryHost.innerHTML = `
        <div class="ds-box danger">
          <div class="ds-k">
            <i data-lucide="alert-octagon"></i>
            قطع راكدة
          </div>
          <div class="ds-v">
            ${GMS.intFmt(summary.total)}
            <small>قطعة</small>
          </div>
          <div class="ds-meta">
            ${GMS.intFmt(summary.critical)} حرجة ·
            ${GMS.intFmt(summary.warn)} إنذار ·
            ${GMS.intFmt(summary.watch)} مراقبة
          </div>
        </div>

        <div class="ds-box danger">
          <div class="ds-k">
            <i data-lucide="banknote"></i>
            رأس مال مجمّد
          </div>
          <div class="ds-v">
            ${GMS.moneyFmt(summary.capital)}
            <small>ج.م</small>
          </div>
          <div class="ds-meta">
            منها <b style="color:var(--danger)">${GMS.moneyFmt(summary.criticalCapital)}</b> ج.م حرجة
          </div>
        </div>

        <div class="ds-box gold">
          <div class="ds-k">
            <i data-lucide="scale"></i>
            ذهب مجمّد (بندق)
          </div>
          <div class="ds-v">
            ${GMS.gramFmt(summary.gold)}
            <small>جم</small>
          </div>
          <div class="ds-meta">
            القيمة السوقية: <b>${GMS.moneyFmt(summary.market)}</b> ج.م
          </div>
        </div>

        <div class="ds-box warn">
          <div class="ds-k">
            <i data-lucide="hourglass"></i>
            متوسط العمر
          </div>
          <div class="ds-v">
            ${GMS.intFmt(summary.avgDays)}
            <small>يوم</small>
          </div>
          <div class="ds-meta">
            منذ آخر تحديث للمخزون
          </div>
        </div>
      `;
    }

    /* Table */
    if (!data.length) {
      tableHost.innerHTML = `
        <div class="empty" style="padding:50px 20px">
          <i data-lucide="check-circle-2" style="color:var(--success);opacity:.4"></i>
          <p>لا يوجد ركود في المخزون</p>
          <span>جميع القطع المتوفرة عمرها أقل من 90 يوم</span>
        </div>`;
      window.lucide?.createIcons();
      return;
    }

    /* نعرض أول 200 صف للأداء */
    const visible = data.slice(0, 200);

    tableHost.innerHTML = `
      <table class="tbl">
        <thead>
          <tr>
            <th>كود التاج</th>
            <th style="width:100px">التصنيف</th>
            <th style="width:70px" class="col-c">عيار</th>
            <th style="width:220px">عمر المخزون</th>
            <th style="width:100px" class="col-num">الوزن الصافي</th>
            <th style="width:100px" class="col-num">بندق 24K</th>
            <th style="width:120px" class="col-num">رأس المال</th>
            <th style="width:120px" class="col-num">القيمة السوقية</th>
            <th style="width:90px" class="col-c">التصنيف</th>
          </tr>
        </thead>
        <tbody>
          ${visible.map(i => {
            const ageCls = i.severity === 'critical' ? 'age-critical'
                          : i.severity === 'warn' ? 'age-warn'
                          : 'age-watch';
            const agePct = Math.min(100, (i.daysIdle / 400) * 100);
            const sevLabel = i.severity === 'critical' ? 'حرج'
                            : i.severity === 'warn' ? 'إنذار'
                            : 'مراقبة';
            const sevPill = i.severity === 'critical' ? 'pill-red'
                          : i.severity === 'warn' ? 'pill-amber'
                          : 'pill-blue';
            const sevIcon = i.severity === 'critical' ? 'flame'
                          : i.severity === 'warn' ? 'alert-triangle'
                          : 'eye';

            return `
              <tr>
                <td>
                  <div class="cell-sku">
                    <span class="sku-code mono">${GMS.esc(i.sku)}</span>
                    <span class="sku-meta">
                      ${GMS.esc(i.manufacturer_code || '—')} · ${GMS.dateAr(i.created_at)}
                    </span>
                  </div>
                </td>
                <td style="font-size:11.5px">${GMS.esc(i.category || '—')}</td>
                <td class="col-c">
                  <span class="karat-badge" data-k="${i.karat}">${i.karat}K</span>
                </td>
                <td>
                  <div style="display:flex;align-items:center;gap:9px;min-width:0">
                    <div style="flex:1;height:6px;background:var(--surface-3);
                                border-radius:3px;overflow:hidden;min-width:44px">
                      <div style="height:100%;border-radius:3px;
                                  width:${agePct}%;
                                  background:${i.severity === 'critical' ? 'linear-gradient(90deg,#ff6b60,#b3261e)'
                                             : i.severity === 'warn' ? 'linear-gradient(90deg,#ffa056,#e67e22)'
                                             : 'linear-gradient(90deg,#ffd97a,#f0b445)'}"></div>
                    </div>
                    <span class="mono ${ageCls}"
                          style="font-weight:900;font-size:12.5px;
                                 min-width:44px;text-align:end;
                                 color:${i.severity === 'critical' ? 'var(--danger)'
                                       : i.severity === 'warn' ? '#d2691e'
                                       : 'var(--warn)'}">
                      ${GMS.intFmt(i.daysIdle)} ي
                    </span>
                  </div>
                </td>
                <td class="col-num">${GMS.gramFmt(i.net_weight)}</td>
                <td class="col-num" style="color:var(--primary);font-weight:800">
                  ${GMS.gramFmt(i.pureWeight)}
                </td>
                <td class="col-num" style="font-weight:900;color:var(--danger)">
                  ${GMS.moneyFmt(i.capitalEGP)}
                </td>
                <td class="col-num" style="font-weight:700">
                  ${GMS.moneyFmt(i.marketValue)}
                </td>
                <td class="col-c">
                  <span class="pill ${sevPill}">
                    <i data-lucide="${sevIcon}" style="width:10px;height:10px"></i>
                    ${sevLabel}
                  </span>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
      ${data.length > 200 ? `
        <div style="padding:14px;text-align:center;font-size:11.5px;
                    color:var(--muted);font-weight:700;
                    background:var(--surface-2);border-top:1px solid var(--border)">
          عرض أول 200 من ${GMS.intFmt(data.length)} صف —
          استخدم زر التصدير للحصول على القائمة الكاملة
        </div>
      ` : ''}
    `;
    window.lucide?.createIcons();
  }

  /* ═════════════════════════════════════════════════════════════════════
     §7 · RENDER: LOSS ANALYTICS
     ───────────────────────────────────────────────────────────────────── */

  function renderLossSection() {
    const host = document.getElementById('ana-loss-host');
    if (!host) return;

    const summary = AnaState.data.lossSummary || { total: 0, totalGrams: 0, totalValue: 0, avgPct: 0, suspicious: 0 };

    host.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(4,1fr);
                  gap:12px;padding:16px 18px;
                  background:linear-gradient(135deg,
                    color-mix(in srgb,var(--primary) 6%,var(--surface)) 0%,
                    var(--surface) 100%);
                  border-bottom:1px solid var(--border)">
        <div style="padding:13px 15px;border-radius:11px;background:var(--surface);
                    border:1.5px solid var(--border);position:relative;overflow:hidden">
          <div style="position:absolute;inset-block:0;inset-inline-start:0;
                      width:3px;background:var(--gold-grad)"></div>
          <div style="font-size:10.5px;font-weight:800;color:var(--muted);
                      text-transform:uppercase;letter-spacing:.4px">
            إجمالي الخسس (30 يوم)
          </div>
          <div class="mono" style="font-size:20px;font-weight:900;
                      margin-top:5px;letter-spacing:-.4px">
            ${GMS.gramFmt(summary.totalGrams)}
            <small style="font-size:11px;font-weight:700;color:var(--muted)">جم</small>
          </div>
          <div style="font-size:10.5px;color:var(--muted);margin-top:4px;font-weight:600">
            ${GMS.intFmt(summary.total)} عملية
          </div>
        </div>

        <div style="padding:13px 15px;border-radius:11px;background:var(--surface);
                    border:1.5px solid var(--border);position:relative;overflow:hidden">
          <div style="position:absolute;inset-block:0;inset-inline-start:0;
                      width:3px;background:var(--danger)"></div>
          <div style="font-size:10.5px;font-weight:800;color:var(--muted);
                      text-transform:uppercase;letter-spacing:.4px">
            القيمة التقديرية للخسس
          </div>
          <div class="mono" style="font-size:20px;font-weight:900;
                      margin-top:5px;letter-spacing:-.4px;color:var(--danger)">
            ${GMS.moneyFmt(summary.totalValue)}
            <small style="font-size:11px;font-weight:700;color:var(--muted)">ج.م</small>
          </div>
          <div style="font-size:10.5px;color:var(--muted);margin-top:4px;font-weight:600">
            بسعر ${GMS.moneyFmt(GMS.Cache?.getPrice()?.price_24 || 4500)} ج.م/جم
          </div>
        </div>

        <div style="padding:13px 15px;border-radius:11px;background:var(--surface);
                    border:1.5px solid var(--border);position:relative;overflow:hidden">
          <div style="position:absolute;inset-block:0;inset-inline-start:0;
                      width:3px;background:var(--info)"></div>
          <div style="font-size:10.5px;font-weight:800;color:var(--muted);
                      text-transform:uppercase;letter-spacing:.4px">
            متوسط نسبة الخسس
          </div>
          <div class="mono" style="font-size:20px;font-weight:900;
                      margin-top:5px;letter-spacing:-.4px;color:var(--info)">
            ${summary.avgPct.toFixed(3)}
            <small style="font-size:11px;font-weight:700;color:var(--muted)">%</small>
          </div>
          <div style="font-size:10.5px;color:var(--muted);margin-top:4px;font-weight:600">
            ${GMS.intFmt(summary.meltingCount || 0)} سبك · ${GMS.intFmt(summary.polishingCount || 0)} تحميم
          </div>
        </div>

        <div style="padding:13px 15px;border-radius:11px;background:var(--surface);
                    border:1.5px solid var(--border);position:relative;overflow:hidden">
          <div style="position:absolute;inset-block:0;inset-inline-start:0;
                      width:3px;background:${summary.suspicious > 0 ? 'var(--danger)' : 'var(--success)'}"></div>
          <div style="font-size:10.5px;font-weight:800;color:var(--muted);
                      text-transform:uppercase;letter-spacing:.4px">
            عمليات مشبوهة
          </div>
          <div class="mono" style="font-size:20px;font-weight:900;
                      margin-top:5px;letter-spacing:-.4px;
                      color:${summary.suspicious > 0 ? 'var(--danger)' : 'var(--success)'}">
            ${GMS.intFmt(summary.suspicious)}
          </div>
          <div style="font-size:10.5px;color:var(--muted);margin-top:4px;font-weight:600">
            تجاوزت الحد الآمن
          </div>
        </div>
      </div>

      <!-- Charts -->
      <div style="display:grid;grid-template-columns:2fr 1fr;gap:16px;
                  padding:18px">
        <div>
          <div style="font-size:11px;font-weight:800;color:var(--muted);
                      text-transform:uppercase;letter-spacing:.5px;
                      margin-bottom:11px">
            <i data-lucide="trending-down" style="width:12px;height:12px;
                       display:inline;vertical-align:-2px"></i>
            اتجاه الخسس اليومي
          </div>
          <div class="chart-wrap" style="height:240px">
            <canvas id="ana-chart-loss-trend"></canvas>
          </div>
        </div>
        <div>
          <div style="font-size:11px;font-weight:800;color:var(--muted);
                      text-transform:uppercase;letter-spacing:.5px;
                      margin-bottom:11px">
            <i data-lucide="pie-chart" style="width:12px;height:12px;
                       display:inline;vertical-align:-2px"></i>
            توزيع الخسس
          </div>
          <div class="chart-wrap" style="height:240px">
            <canvas id="ana-chart-loss-type"></canvas>
          </div>
        </div>
      </div>
    `;

    window.lucide?.createIcons();

    setTimeout(() => {
      renderLossTrendChart();
      renderLossTypeChart();
    }, 100);
  }

  function renderLossTrendChart() {
    destroyChart('lossTrend');
    if (!isChartReady()) return;

    const canvas = document.getElementById('ana-chart-loss-trend');
    if (!canvas) return;

    const records = AnaState.data.lossRecords || [];

    /* تجميع آخر 14 يوم */
    const days = {};
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days[d.toISOString().slice(0, 10)] = { melting: 0, polishing: 0 };
    }

    records.forEach(r => {
      const key = r.lossDate?.slice(0, 10);
      if (days[key]) {
        const k = r.opType === 'melting' ? 'melting' : 'polishing';
        days[key][k] += r.lossWeight;
      }
    });

    const labels = Object.keys(days).map(d => {
      const dt = new Date(d);
      return dt.toLocaleDateString('ar-EG', { day: '2-digit', month: '2-digit' });
    });

    const css = getComputedStyle(document.documentElement);
    const primary = css.getPropertyValue('--primary').trim();
    const violet = css.getPropertyValue('--violet').trim();
    const textClr = css.getPropertyValue('--text').trim();
    const mutedClr = css.getPropertyValue('--muted').trim();
    const borderClr = css.getPropertyValue('--border').trim();

    AnaState.charts.lossTrend = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'خسس السبك (جم)',
            data: Object.values(days).map(d => GMS.round(d.melting, 3)),
            borderColor: primary,
            backgroundColor: 'rgba(200,162,74,.15)',
            borderWidth: 2.5,
            tension: 0.35,
            fill: true,
            pointRadius: 0,
            pointHoverRadius: 5,
          },
          {
            label: 'خسس الصيانة (جم)',
            data: Object.values(days).map(d => GMS.round(d.polishing, 3)),
            borderColor: violet,
            backgroundColor: 'rgba(107,63,160,.08)',
            borderWidth: 2,
            tension: 0.35,
            fill: false,
            pointRadius: 0,
            pointHoverRadius: 5,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: textClr,
              font: { family: 'Cairo', size: 11, weight: '600' },
              padding: 14,
              usePointStyle: true,
            },
          },
          tooltip: {
            backgroundColor: 'rgba(15,23,41,.94)',
            titleColor: '#fff',
            bodyColor: '#e8eefb',
            padding: 11,
            cornerRadius: 8,
            callbacks: {
              label: (c) => `  ${c.dataset.label}: ${GMS.gramFmt(c.parsed.y)} جم`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: mutedClr, font: { size: 10 }, maxRotation: 0 },
          },
          y: {
            grid: { color: borderClr },
            ticks: {
              color: mutedClr,
              font: { size: 10 },
              callback: (v) => GMS.gramFmt(v),
            },
          },
        },
      },
    });
  }

  function renderLossTypeChart() {
    destroyChart('lossType');
    if (!isChartReady()) return;

    const canvas = document.getElementById('ana-chart-loss-type');
    if (!canvas) return;

    const records = AnaState.data.lossRecords || [];

    const melting = records.filter(r => r.opType === 'melting');
    const polishing = records.filter(r => r.opType === 'polishing');

    const meltingLoss = melting.reduce((a, r) => a + r.lossWeight, 0);
    const polishingLoss = polishing.reduce((a, r) => a + r.lossWeight, 0);

    const css = getComputedStyle(document.documentElement);
    const textClr = css.getPropertyValue('--text').trim();

    AnaState.charts.lossType = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: ['خسس السبك', 'خسس الصيانة'],
        datasets: [{
          data: [GMS.round(meltingLoss, 3), GMS.round(polishingLoss, 3)],
          backgroundColor: ['#c8a24a', '#6b3fa0'],
          borderWidth: 2,
          borderColor: css.getPropertyValue('--surface').trim(),
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '60%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: textClr,
              font: { family: 'Cairo', size: 11.5, weight: '600' },
              padding: 14,
              usePointStyle: true,
            },
          },
          tooltip: {
            backgroundColor: 'rgba(15,23,41,.94)',
            titleColor: '#fff',
            bodyColor: '#e8eefb',
            padding: 11,
            cornerRadius: 8,
            callbacks: {
              label: (c) => `  ${GMS.gramFmt(c.parsed)} جم`,
            },
          },
        },
      },
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §8 · MAIN RENDER
     ───────────────────────────────────────────────────────────────────── */

  async function render(root) {
    /* Loading state */
    root.innerHTML = `
      <div style="padding:60px;text-align:center">
        <div class="spinner" style="margin:0 auto 14px"></div>
        <div style="font-size:13px;color:var(--muted);font-weight:600">
          جارٍ تحليل البيانات…
        </div>
      </div>
    `;

    try {
      /* Compute */
      await computeAnalytics();

      const branches = GMS.Demo?.getBranches() || [];
      const data = AnaState.data;
      const price24 = GMS.Cache?.getPrice()?.price_24 || GMS.APP_CONFIG.DEFAULT_PRICE_24;

      /* Main render */
      root.innerHTML = `
        <div class="page-header">
          <h2>
            <i data-lucide="bar-chart-3"></i>
            ${GMS.t('ana.title')}
          </h2>
          <p>${GMS.t('ana.subtitle')}</p>
        </div>

        <!-- Toolbar -->
        <div class="card" style="margin-bottom:16px">
          <div class="toolbar-row">
            <div style="display:inline-flex;gap:3px;padding:4px;
                        background:var(--surface-2);border:1px solid var(--border);
                        border-radius:11px">
              ${[
                { d: 7, label: '7 أيام' },
                { d: 30, label: '30 يوم' },
                { d: 90, label: '90 يوم' },
                { d: 180, label: '6 أشهر' },
                { d: 365, label: 'سنة' },
              ].map(p => `
                <button class="period-btn ${AnaState.days === p.d ? 'active' : ''}"
                        data-ana-days="${p.d}"
                        style="padding:7px 14px;border:none;border-radius:8px;
                               font-weight:800;font-size:12px;cursor:pointer;
                               transition:all .2s;
                               background:${AnaState.days === p.d ? 'var(--gold-grad)' : 'transparent'};
                               color:${AnaState.days === p.d ? '#2a1f05' : 'var(--muted)'}">
                  ${p.label}
                </button>
              `).join('')}
            </div>

            <select class="filter-select" id="ana-filter-branch"
                    style="min-width:150px">
              <option value="">كل الفروع</option>
              ${branches.map(b => `
                <option value="${b.id}" ${AnaState.filters.branch === b.id ? 'selected' : ''}>
                  ${GMS.esc(b.name)}
                </option>
              `).join('')}
            </select>

            <select class="filter-select" id="ana-filter-karat"
                    style="min-width:120px">
              <option value="">كل العيارات</option>
              ${GMS.KARAT_ORDER.map(k => `
                <option value="${k}" ${AnaState.filters.karat === String(k) ? 'selected' : ''}>
                  ${k}K
                </option>
              `).join('')}
            </select>

            <div class="spacer" style="flex:1"></div>

            <span class="chip info">
              <i data-lucide="clock" style="width:12px;height:12px"></i>
              ${GMS.days} يوم · آخر تحديث: ${GMS.timeAgo(new Date())}
            </span>

            <button class="btn btn-sm" id="ana-refresh-btn">
              <i data-lucide="refresh-cw"></i> تحديث
            </button>

            <button class="btn btn-sm" id="ana-export-btn">
              <i data-lucide="download"></i> تصدير
            </button>
          </div>
        </div>

        <!-- Charts Row 1: Correlation + Carats -->
        <div style="display:grid;grid-template-columns:2fr 1fr;gap:16px;
                    margin-bottom:18px">
          <div class="card">
            <div class="card-head">
              <h3>
                <i data-lucide="activity"></i>
                ${GMS.t('ana.salesVsRate')}
              </h3>
              <div class="spacer" style="flex:1"></div>
              <span id="ana-corr-badge" class="corr-badge corr-none">
                <i data-lucide="loader-circle" style="width:12px;height:12px"></i>
                <span>جارٍ الحساب…</span>
              </span>
            </div>
            <div class="card-body">
              <div class="chart-wrap chart-tall" style="height:320px">
                <canvas id="ana-chart-correlation"></canvas>
              </div>
            </div>
            <div class="legend-row">
              <div class="legend-item">
                <span class="legend-dot" style="background:#c8a24a"></span>
                <span>حجم المبيعات (ج.م)</span>
              </div>
              <div class="legend-item">
                <span class="legend-dot line" style="background:#1c4fd8"></span>
                <span>سعر جرام 24K (ج.م)</span>
              </div>
              <div class="legend-item" style="margin-inline-start:auto">
                <i data-lucide="info" style="width:12px;height:12px;color:var(--muted)"></i>
                <span id="ana-corr-explain" style="color:var(--muted)"></span>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-head">
              <h3>
                <i data-lucide="pie-chart"></i>
                توزيع المخزون حسب العيار
              </h3>
            </div>
            <div class="card-body">
              <div class="chart-wrap chart-tall" style="height:320px">
                <canvas id="ana-chart-carats"></canvas>
              </div>
            </div>
            <div class="legend-row" id="ana-carats-legend"></div>
          </div>
        </div>

        <!-- Charts Row 2: Leaderboard + Fast Moving -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;
                    margin-bottom:18px">
          <div class="card">
            <div class="card-head">
              <h3>
                <i data-lucide="trophy"></i>
                ${GMS.t('ana.leaderboard')}
              </h3>
              <div class="spacer" style="flex:1"></div>
              <span class="card-sub" id="ana-lb-sub">—</span>
            </div>
            <div class="card-body">
              <div class="chart-wrap" style="height:340px">
                <canvas id="ana-chart-leaderboard"></canvas>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-head">
              <h3>
                <i data-lucide="zap"></i>
                ${GMS.t('ana.fastMoving')}
              </h3>
              <div class="spacer" style="flex:1"></div>
              <span class="chip success">
                آخر 30 يوم
              </span>
            </div>
            <div style="overflow:auto;max-height:400px" id="ana-fast-moving-host"></div>
          </div>
        </div>

        <!-- Dead Stock Engine -->
        <div class="card" style="margin-top:18px">
          <div class="card-head">
            <h3>
              <i data-lucide="alert-octagon" style="color:var(--danger)"></i>
              ${GMS.t('ana.deadStockEngine')}
            </h3>
            <div class="spacer" style="flex:1"></div>
            <span class="chip err">
              <i data-lucide="clock" style="width:12px;height:12px"></i>
              عمر المخزون > 90 يوم
            </span>
            <button class="btn btn-sm" id="ana-dead-export">
              <i data-lucide="download"></i> Excel
            </button>
          </div>

          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;
                      padding:18px;
                      background:linear-gradient(135deg,
                        color-mix(in srgb,var(--danger) 6%,var(--surface)) 0%,
                        var(--surface) 100%);
                      border-bottom:1px solid var(--border)"
               id="ana-dead-summary"></div>

          <div id="ana-dead-table-host"
               style="overflow:auto;max-height:520px"></div>
        </div>

        <!-- Loss Analytics -->
        <div class="card" style="margin-top:18px">
          <div class="card-head">
            <h3>
              <i data-lucide="flame" style="color:var(--warn)"></i>
              تحليلات الخسس التشغيلية
            </h3>
            <div class="spacer" style="flex:1"></div>
            <span class="chip warn">
              آخر 30 يوم
            </span>
          </div>
          <div id="ana-loss-host"></div>
        </div>
      `;

      window.lucide?.createIcons();

      /* Render charts + tables */
      requestAnimationFrame(() => {
        renderCorrelationChart();
        renderCaratsChart();
        renderLeaderboardChart();
        renderFastMoving();
        renderDeadStock();
        renderLossSection();
      });

      /* Bind controls */
      bindControls();

    } catch (e) {
      console.error('[Analytics.render]', e);
      root.innerHTML = `
        <div class="card">
          <div class="card-body">
            <div class="empty">
              <i data-lucide="alert-circle" style="color:var(--danger)"></i>
              <p>فشل تحميل التحليلات</p>
              <span>${GMS.esc(e.message)}</span>
            </div>
          </div>
        </div>`;
      window.lucide?.createIcons();
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §9 · CONTROLS BINDING
     ───────────────────────────────────────────────────────────────────── */

  function bindControls() {
    /* Period buttons */
    document.querySelectorAll('[data-ana-days]').forEach(btn => {
      btn.onclick = () => {
        const days = Number(btn.dataset.anaDays);
        if (days === AnaState.days) return;

        AnaState.days = days;
        render(document.getElementById('page'));
      };
    });

    /* Branch filter */
    const branchFilter = document.getElementById('ana-filter-branch');
    if (branchFilter) {
      branchFilter.onchange = () => {
        AnaState.filters.branch = branchFilter.value;
        render(document.getElementById('page'));
      };
    }

    /* Karat filter */
    const karatFilter = document.getElementById('ana-filter-karat');
    if (karatFilter) {
      karatFilter.onchange = () => {
        AnaState.filters.karat = karatFilter.value;
        render(document.getElementById('page'));
      };
    }

    /* Refresh */
    const refreshBtn = document.getElementById('ana-refresh-btn');
    if (refreshBtn) {
      refreshBtn.onclick = () => {
        render(document.getElementById('page'));
      };
    }

    /* Export */
    const exportBtn = document.getElementById('ana-export-btn');
    if (exportBtn) {
      exportBtn.onclick = () => exportAnalytics();
    }

    /* Dead stock export */
    const deadExport = document.getElementById('ana-dead-export');
    if (deadExport) {
      deadExport.onclick = () => exportDeadStock();
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §10 · EXPORT
     ───────────────────────────────────────────────────────────────────── */

  function exportAnalytics() {
    if (!window.XLSX) {
      GMS.Toast.err('محرك Excel غير متاح');
      return;
    }

    try {
      const data = AnaState.data;
      const wb = XLSX.utils.book_new();

      /* ─── Sheet 1: Summary ───────────────────────────────── */
      const summaryRows = [
        ['تقرير التحليلات — Gold Analytics Report'],
        ['تاريخ التصدير', new Date().toLocaleString('ar-EG')],
        ['الفترة', `${AnaState.days} يوم`],
        ['الفرع', AnaState.filters.branch
          ? (GMS.Demo?.getBranches()?.find(b => b.id === AnaState.filters.branch)?.name || AnaState.filters.branch)
          : 'كل الفروع'],
        ['العيار', AnaState.filters.karat ? AnaState.filters.karat + 'K' : 'كل العيارات'],
        [''],
        ['المؤشر', 'القيمة'],
        ['عدد الأصناف المتوفرة', Object.values(data.carats).reduce((a, c) => a + c.count, 0)],
        ['إجمالي البندق (جم)', GMS.round(Object.values(data.carats).reduce((a, c) => a + c.pureWeight, 0), 4)],
        ['إجمالي القيمة', GMS.round(Object.values(data.carats).reduce((a, c) => a + c.totalValue, 0), 2)],
        [''],
        ['محرّك الركود', ''],
        ['عدد القطع الراكدة', data.deadSummary?.total || 0],
        ['رأس المال المجمّد', data.deadSummary?.capital || 0],
        ['الذهب المجمّد (جم)', data.deadSummary?.gold || 0],
        ['قطع حرجة (180+ يوم)', data.deadSummary?.critical || 0],
      ];

      const ws1 = XLSX.utils.aoa_to_sheet(summaryRows);
      ws1['!cols'] = [{ wch: 32 }, { wch: 24 }];
      XLSX.utils.book_append_sheet(wb, ws1, 'الملخص');

      /* ─── Sheet 2: Daily Sales ──────────────────────────── */
      if (data.dailySales?.length) {
        const rows = data.dailySales.map(d => ({
          'التاريخ': d.date,
          'المبيعات (ج.م)': d.revenue,
          'الذهب المُباع (جم)': d.gold,
          'عدد الفواتير': d.count,
        }));
        const ws2 = XLSX.utils.json_to_sheet(rows);
        ws2['!cols'] = [{ wch: 14 }, { wch: 18 }, { wch: 22 }, { wch: 14 }];
        XLSX.utils.book_append_sheet(wb, ws2, 'المبيعات اليومية');
      }

      /* ─── Sheet 3: Carats ────────────────────────────────── */
      const caratRows = GMS.KARAT_ORDER
        .filter(k => data.carats[k]?.count > 0)
        .map(k => ({
          'العيار': `${k}K`,
          'عدد القطع': data.carats[k].count,
          'الوزن الصافي (جم)': data.carats[k].netWeight,
          'البندق 24K (جم)': data.carats[k].pureWeight,
          'القيمة (ج.م)': data.carats[k].totalValue,
        }));
      if (caratRows.length) {
        const ws3 = XLSX.utils.json_to_sheet(caratRows);
        ws3['!cols'] = [{ wch: 10 }, { wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 16 }];
        XLSX.utils.book_append_sheet(wb, ws3, 'توزيع العيارات');
      }

      /* ─── Sheet 4: Leaderboard ──────────────────────────── */
      if (data.leaderboard?.length) {
        const rows = data.leaderboard.map((p, i) => ({
          'الترتيب': i + 1,
          'البائع': p.name,
          'المبيعات (ج.م)': p.revenue,
          'عدد الفواتير': p.count,
          'الذهب المُباع (جم)': p.gold,
        }));
        const ws4 = XLSX.utils.json_to_sheet(rows);
        ws4['!cols'] = [{ wch: 8 }, { wch: 22 }, { wch: 18 }, { wch: 14 }, { wch: 20 }];
        XLSX.utils.book_append_sheet(wb, ws4, 'لوحة البائعين');
      }

      /* ─── Sheet 5: Fast Moving ───────────────────────────── */
      if (data.fastMoving?.length) {
        const rows = data.fastMoving.map((d, i) => ({
          'الترتيب': i + 1,
          'SKU': d.sku,
          'التصنيف': d.category,
          'العيار': `${d.karat}K`,
          'عدد البيوع': d.soldCount,
          'بندق (جم)': d.pureWeight,
          'الإيراد (ج.م)': d.revenue,
        }));
        const ws5 = XLSX.utils.json_to_sheet(rows);
        ws5['!cols'] = [{ wch: 8 }, { wch: 20 }, { wch: 14 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 16 }];
        XLSX.utils.book_append_sheet(wb, ws5, 'الأكثر حركة');
      }

      /* ─── Sheet 6: Dead Stock ────────────────────────────── */
      if (data.deadStock?.length) {
        const rows = data.deadStock.map(i => ({
          'SKU': i.sku,
          'التصنيف': i.category || '',
          'العيار': `${i.karat}K`,
          'الماركة': i.manufacturer_code || '',
          'أيام الركود': i.daysIdle,
          'الوزن الصافي (جم)': i.net_weight,
          'البندق 24K (جم)': i.pureWeight,
          'رأس المال (ج.م)': i.capitalEGP,
          'القيمة السوقية (ج.م)': i.marketValue,
          'التصنيف': i.severity === 'critical' ? 'حرج'
                    : i.severity === 'warn' ? 'إنذار' : 'مراقبة',
          'تاريخ الإضافة': i.created_at,
        }));
        const ws6 = XLSX.utils.json_to_sheet(rows);
        ws6['!cols'] = [
          { wch: 20 }, { wch: 14 }, { wch: 8 }, { wch: 10 }, { wch: 12 },
          { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 10 }, { wch: 22 },
        ];
        XLSX.utils.book_append_sheet(wb, ws6, 'الركود');
      }

      /* ─── Sheet 7: Loss Records ─────────────────────────── */
      if (data.lossRecords?.length) {
        const rows = data.lossRecords.slice(0, 500).map(r => ({
          'التاريخ': r.lossDate,
          'النوع': r.opType === 'melting' ? 'سبك' : 'تحميم',
          'رقم الدفعة': r.batch_no,
          'الوزن قبل (جم)': r.base,
          'الخسس (جم)': r.lossWeight,
          'النسبة %': r.lossPct,
          'القيمة (ج.م)': r.lossValueEGP,
          'الحالة': r.is_suspicious ? 'مشبوه' : 'طبيعي',
        }));
        const ws7 = XLSX.utils.json_to_sheet(rows);
        ws7['!cols'] = Array(8).fill({ wch: 16 });
        XLSX.utils.book_append_sheet(wb, ws7, 'الخسس');
      }

      XLSX.writeFile(wb, `analytics_${AnaState.days}d_${GMS.todayISO()}.xlsx`);
      GMS.Toast.ok('تم تصدير التقرير');

    } catch (e) {
      console.error('[Analytics.export]', e);
      GMS.Toast.err('فشل التصدير', e.message);
    }
  }

  function exportDeadStock() {
    if (!window.XLSX) {
      GMS.Toast.err('محرك Excel غير متاح');
      return;
    }

    const data = AnaState.data.deadStock || [];
    if (!data.length) {
      GMS.Toast.warn('لا توجد بيانات ركود');
      return;
    }

    const rows = data.map(i => ({
      'SKU': i.sku,
      'التصنيف': i.category || '',
      'العيار': `${i.karat}K`,
      'الماركة': i.manufacturer_code || '',
      'أيام الركود': i.daysIdle,
      'الوزن الصافي (جم)': i.net_weight,
      'البندق 24K (جم)': i.pureWeight,
      'رأس المال (ج.م)': i.capitalEGP,
      'القيمة السوقية (ج.م)': i.marketValue,
      'التصنيف': i.severity === 'critical' ? 'حرج'
                : i.severity === 'warn' ? 'إنذار' : 'مراقبة',
      'تاريخ الإضافة': i.created_at,
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = Array(11).fill({ wch: 16 });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'الركود');

    XLSX.writeFile(wb, `dead_stock_${GMS.todayISO()}.xlsx`);
    GMS.Toast.ok(`تم تصدير ${data.length} قطعة راكدة`);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §11 · CLEANUP
     ───────────────────────────────────────────────────────────────────── */

  function cleanup() {
    cleanupListeners();
    destroyAllCharts();
  }

  /* ═════════════════════════════════════════════════════════════════════
     §12 · VIEW REGISTRATION
     ═════════════════════════════════════════════════════════════════════ */
  GMS.Views = GMS.Views || {};

  GMS.Views.analytics = {
    render,
    cleanup,
    state: AnaState,

    /* Data */
    compute: computeAnalytics,

    /* Charts */
    renderCorrelation: renderCorrelationChart,
    renderCarats: renderCaratsChart,
    renderLeaderboard: renderLeaderboardChart,

    /* Export */
    export: exportAnalytics,
    exportDeadStock,

    /* Utils */
    pearson,
    interpretCorr,

    /* Constants */
    DEAD_STOCK,
  };

  /* ═════════════════════════════════════════════════════════════════════
     §13 · LOADED CONFIRMATION
     ═════════════════════════════════════════════════════════════════════ */
  console.log(
    '%c📈 Analytics View loaded · 5 charts + Dead Stock',
    'color:#1c4fd8;font-weight:800;font-size:12px;padding:1px 5px;' +
    'background:#e9efff;border-radius:4px;'
  );

  console.log(
    `%c🎯 Correlation · Carats · Leaderboard · Fast-Moving · Dead Stock · Loss Analytics`,
    'color:#6b7a95;font-weight:700;font-size:11px;'
  );

  /* ═════════════════════════════════════════════════════════════════════
     ✅ js/17-views-analytics.js — نهاية الملف
     ═════════════════════════════════════════════════════════════════════ */

})();