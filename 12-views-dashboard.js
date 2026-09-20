/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ENTERPRISE — js/12-views-dashboard.js
   لوحة التحكم التنفيذية:
     - 5 بطاقات KPI مع تحديث حي
     - مخطط المبيعات (24 ساعة + 7 أيام)
     - توزيع العيارات (Doughnut)
     - أداء الفروع
     - لوحة شرف البائعين
     - سجل الأحداث المباشر
     - تحليل الركود المصغّر
     - اختصارات سريعة
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const GMS = window.GMS = window.GMS || {};

  /* ═════════════════════════════════════════════════════════════════════
     §1 · DASHBOARD STATE
     ═════════════════════════════════════════════════════════════════════ */
  const DashState = {
    /* بيانات مخزنة مؤقتاً */
    kpis: {},
    charts: {
      sales24h: null,
      carats: null,
      weekly: null,
      leaderboard: null,
    },

    /* تحديثات حية */
    refreshing: false,
    refreshTimer: null,

    /* سجل التحديثات */
    updateCount: 0,
    lastRefresh: null,

    /* المستمعون */
    unsubscribers: [],
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
   * تدمير مخطط موجود
   * @param {string} key
   */
  function destroyChart(key) {
    if (DashState.charts[key]) {
      try {
        DashState.charts[key].destroy();
      } catch (_) {}
      DashState.charts[key] = null;
    }
  }

  /**
   * هل Chart.js جاهز؟
   * @returns {boolean}
   */
  function isChartReady() {
    return typeof window.Chart !== 'undefined';
  }

  /* ═════════════════════════════════════════════════════════════════════
     §3 · DATA COMPUTATION
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * حساب كل بيانات لوحة التحكم
   * @returns {Promise<Object>}
   */
  async function computeDashboardData() {
    const data = {
      kpis: {},
      sales24h: [],
      sales7d: [],
      carats: {},
      branches: [],
      leaderboard: [],
      recentEvents: [],
      deadStock: {},
      price24: GMS.APP_CONFIG.DEFAULT_PRICE_24,
    };

    try {
      /* ─── سعر الذهب ──────────────────────────────────────────── */
      if (GMS.Cache) {
        const price = GMS.Cache.getPrice();
        data.price24 = Number(price?.price_24) || GMS.APP_CONFIG.DEFAULT_PRICE_24;
      }

      /* ─── المخزون ─────────────────────────────────────────────── */
      let inventory = [];

      if (GMS.IDB && GMS.IDB.isOpen) {
        try {
          inventory = await GMS.IDB.getAll();
        } catch (e) {
          console.warn('[Dash] IDB read failed:', e);
        }
      }

      if (!inventory.length && GMS.Demo) {
        inventory = GMS.Demo.getInventory();
      }

      /* ─── حساب KPIs المخزون ──────────────────────────────────── */
      const inStock = inventory.filter(i => i.status === 'IN_STOCK');
      const soldItems = inventory.filter(i => i.status === 'SOLD');

      const stockNet = inStock.reduce((s, i) => s + Number(i.net_weight || 0), 0);
      const stockPure = inStock.reduce((s, i) => s + Number(i.pure_weight || 0), 0);
      const stockValue = inStock.reduce((s, i) => s + Number(i.total_cost || 0), 0);

      data.kpis.vaultGold = GMS.round(stockPure, 4);
      data.kpis.vaultValue = GMS.round(stockPure * data.price24, 2);
      data.kpis.stockPieces = inStock.length;
      data.kpis.stockNetWeight = GMS.round(stockNet, 3);
      data.kpis.stockValue = GMS.round(stockValue, 2);
      data.kpis.soldCount = soldItems.length;

      /* ─── توزيع العيارات ─────────────────────────────────────── */
      GMS.KARAT_ORDER.forEach(k => {
        data.carats[k] = {
          karat: k,
          count: 0,
          netWeight: 0,
          pureWeight: 0,
          totalValue: 0,
        };
      });

      inStock.forEach(item => {
        const k = Number(item.karat);
        if (!data.carats[k]) {
          data.carats[k] = { karat: k, count: 0, netWeight: 0, pureWeight: 0, totalValue: 0 };
        }
        data.carats[k].count++;
        data.carats[k].netWeight += Number(item.net_weight || 0);
        data.carats[k].pureWeight += Number(item.pure_weight || 0);
        data.carats[k].totalValue += Number(item.total_cost || 0);
      });

      /* ─── المبيعات ───────────────────────────────────────────── */
      let sales = [];

      if (GMS.Demo) {
        sales = GMS.Demo.getSales();
      }

      /* 24 ساعة */
      const now = Date.now();
      const start24h = now - 24 * 3600 * 1000;
      const sales24 = sales.filter(s =>
        new Date(s.created_at).getTime() > start24h
      );

      /* تجميع كل ساعة */
      const hourlyBuckets = {};
      for (let i = 0; i < 24; i++) {
        const h = new Date();
        h.setHours(h.getHours() - (23 - i), 0, 0, 0);
        hourlyBuckets[h.getHours()] = 0;
      }

      sales24.forEach(s => {
        const h = new Date(s.created_at).getHours();
        if (hourlyBuckets[h] !== undefined) {
          hourlyBuckets[h] += Number(s.grand_total || 0);
        }
      });

      data.sales24h = Object.entries(hourlyBuckets)
        .map(([hour, value]) => ({
          hour: Number(hour),
          value: GMS.round(value, 2),
        }))
        .sort((a, b) => a.hour - b.hour);

      /* 7 أيام */
      const start7d = new Date();
      start7d.setDate(start7d.getDate() - 6);
      start7d.setHours(0, 0, 0, 0);

      const dailyBuckets = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        dailyBuckets[key] = { date: key, value: 0, gold: 0, count: 0 };
      }

      sales.forEach(s => {
        const key = s.created_at.slice(0, 10);
        if (dailyBuckets[key]) {
          dailyBuckets[key].value += Number(s.grand_total || 0);
          dailyBuckets[key].gold += Number(s.total_pure_weight || 0);
          dailyBuckets[key].count++;
        }
      });

      data.sales7d = Object.values(dailyBuckets).sort((a, b) =>
        a.date.localeCompare(b.date)
      );

      /* ─── KPI المبيعات ───────────────────────────────────────── */
      const today = GMS.todayISO();
      const todaySales = sales.filter(s => s.created_at.slice(0, 10) === today);

      data.kpis.dailySales = todaySales.reduce((s, x) => s + Number(x.grand_total || 0), 0);
      data.kpis.dailyGold = todaySales.reduce((s, x) => s + Number(x.total_pure_weight || 0), 0);
      data.kpis.dailyTxns = todaySales.length;
      data.kpis.dailyAvg = todaySales.length ? data.kpis.dailySales / todaySales.length : 0;

      /* ─── الموردين ───────────────────────────────────────────── */
      if (GMS.Demo) {
        const suppliers = GMS.Demo.getSuppliers();
        const ledger = GMS.Demo.getLedgerEntries();

        let totalSupplierGold = 0;
        let totalSupplierCash = 0;

        suppliers.forEach(sup => {
          const entries = ledger.filter(e => e.entity_id === sup.id);
          const gold = Number(sup.opening_gold || 0) +
            entries.reduce((a, e) => a + Number(e.gold_delta || 0), 0);
          const cash = Number(sup.opening_cash || 0) +
            entries.reduce((a, e) => a + Number(e.cash_delta || 0), 0);

          totalSupplierGold += gold;
          totalSupplierCash += cash;
        });

        data.kpis.supplierGold = GMS.round(totalSupplierGold, 4);
        data.kpis.supplierCash = GMS.round(totalSupplierCash, 2);
      }

      /* ─── الفروع ─────────────────────────────────────────────── */
      const branches = GMS.Demo ? GMS.Demo.getBranches() : [];

      data.branches = branches.map(b => {
        const branchStock = inStock.filter(i => i.branch_id === b.id);
        const branchSalesToday = todaySales.filter(s => s.branch_id === b.id);

        return {
          id: b.id,
          code: b.code,
          name: b.name,
          manager: b.manager,
          pure: GMS.round(branchStock.reduce((s, i) => s + Number(i.pure_weight || 0), 0), 4),
          netWeight: GMS.round(branchStock.reduce((s, i) => s + Number(i.net_weight || 0), 0), 3),
          pieces: branchStock.length,
          salesToday: GMS.round(branchSalesToday.reduce((s, x) => s + Number(x.grand_total || 0), 0), 2),
          txnsToday: branchSalesToday.length,
        };
      }).sort((a, b) => b.pure - a.pure);

      /* ─── لوحة شرف البائعين ──────────────────────────────────── */
      const people = {};

      sales.slice(0, 500).forEach(s => {
        const name = s.cashier_name || 'غير محدد';
        if (!people[name]) {
          people[name] = { name, revenue: 0, count: 0, gold: 0 };
        }
        people[name].revenue += Number(s.grand_total || 0);
        people[name].gold += Number(s.total_pure_weight || 0);
        people[name].count++;
      });

      data.leaderboard = Object.values(people)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 6)
        .map(p => ({
          ...p,
          revenue: GMS.round(p.revenue, 2),
          gold: GMS.round(p.gold, 4),
        }));

      /* ─── الأحداث الأخيرة ───────────────────────────────────── */
      if (GMS.Realtime && GMS.Realtime.Feed) {
        data.recentEvents = GMS.Realtime.Feed.getAll({ limit: 8 });
      }

      /* ─── تحليل الركود المصغّر ───────────────────────────────── */
      const deadStock = inStock.filter(i => {
        const daysIdle = GMS.daysBetween(i.created_at, new Date());
        return daysIdle >= 90;
      });

      data.deadStock = {
        count: deadStock.length,
        capital: GMS.round(deadStock.reduce((s, i) => s + Number(i.total_cost || 0), 0), 2),
        gold: GMS.round(deadStock.reduce((s, i) => s + Number(i.pure_weight || 0), 0), 4),
      };

      /* ─── حساب معدل إصابة الذاكرة ────────────────────────────── */
      if (GMS.Sync?.state?.stats) {
        const s = GMS.Sync.state.stats;
        const total = (s.totalSyncs || 0);
        data.kpis.syncCount = total;
        data.kpis.lastSync = s.lastSync;
      }

      /* ─── queue ──────────────────────────────────────────────── */
      if (GMS.IDB) {
        try {
          data.kpis.queueCount = await GMS.IDB.queueCount();
        } catch (_) {
          data.kpis.queueCount = 0;
        }
      }

      /* ─── حالة الاتصال ───────────────────────────────────────── */
      data.kpis.online = GMS.Sync?.state?.online !== false;
      data.kpis.realtimeStatus = GMS.Realtime?.state?.channelStatus || 'idle';

      return data;

    } catch (e) {
      console.error('[Dashboard] computeData failed:', e);
      return data;
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §4 · HTML RENDERERS
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * بطاقة KPI
   * @param {Object} opts
   * @returns {string}
   */
  function renderKPI(opts) {
    const {
      key,
      cls = 'gold',
      icon = 'activity',
      label,
      value,
      unit = '',
      meta = '',
      metaIcon = '',
    } = opts;

    return `
      <div class="kpi ${cls}" data-kpi="${key}">
        <div class="kpi-label">
          <i data-lucide="${icon}"></i>
          ${GMS.esc(label)}
        </div>
        <div class="kpi-value">
          ${value}
          ${unit ? `<small>${GMS.esc(unit)}</small>` : ''}
        </div>
        <div class="kpi-meta">
          ${metaIcon ? `<i data-lucide="${metaIcon}" style="width:11px;height:11px;display:inline;vertical-align:-1px"></i> ` : ''}
          ${meta}
        </div>
      </div>
    `;
  }

  /**
   * صف حدث
   * @param {Object} event
   * @returns {string}
   */
  function renderFeedItem(event) {
    if (!event) return '';

    const meta = event.meta || {};
    const icon = meta.icon || 'activity';
    const cls = meta.cls || 'update';

    const time = GMS.timeAgo(event.timestamp);

    return `
      <div class="feed-item">
        <div class="feed-icon ${cls}">
          <i data-lucide="${icon}"></i>
        </div>
        <div class="feed-body">
          <div class="feed-title">${GMS.esc(event.title || '—')}</div>
          ${event.description ? `<div class="feed-desc">${GMS.esc(event.description)}</div>` : ''}
          <div class="feed-meta">
            ${event.amount ? `<span class="feed-amount">${GMS.esc(event.amount)}${GMS.esc(event.amountUnit || '')}</span>` : ''}
            <span class="feed-time">${GMS.esc(time)}</span>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * صف فرع
   * @param {Object} branch
   * @param {number} maxPure
   * @param {number} idx
   * @returns {string}
   */
  function renderBranchRow(branch, maxPure, idx) {
    const pct = maxPure > 0 ? (branch.pure / maxPure) * 100 : 0;
    const colors = ['#c8a24a', '#1c4fd8', '#0f7a43', '#6b3fa0', '#a55a00'];

    return `
      <div class="branch-row">
        <div class="branch-name">
          <span class="bn-dot" style="background:${colors[idx % colors.length]}"></span>
          ${GMS.esc(branch.name)}
        </div>
        <div class="branch-metric" style="color:var(--primary)">
          ${GMS.gramFmt(branch.pure)}
          <small>بندق (جم)</small>
        </div>
        <div class="branch-metric" style="color:var(--info)">
          ${GMS.moneyFmt(branch.salesToday)}
          <small>مبيعات اليوم</small>
        </div>
        <div class="branch-bar">
          <div style="width:${pct}%"></div>
        </div>
      </div>
    `;
  }

  /**
   * صف بائع
   * @param {Object} person
   * @param {number} idx
   * @param {number} maxRev
   * @returns {string}
   */
  function renderLeaderboardRow(person, idx, maxRev) {
    const pct = maxRev > 0 ? (person.revenue / maxRev) * 100 : 0;

    const rankCls = idx === 0 ? 'rank-1'
                   : idx === 1 ? 'rank-2'
                   : idx === 2 ? 'rank-3'
                   : '';

    return `
      <div style="display:flex;align-items:center;gap:11px;padding:10px 0;
                  border-bottom:1px dashed var(--border)">
        <div style="width:28px;height:28px;border-radius:50%;
                    display:grid;place-items:center;flex-shrink:0;
                    font-weight:900;font-size:11.5px;
                    background:${idx === 0 ? 'var(--gold-grad)'
                                : idx === 1 ? 'linear-gradient(135deg,#e5e5e5,#b5b5b5)'
                                : idx === 2 ? 'linear-gradient(135deg,#e8b98c,#b17a4d)'
                                : 'var(--surface-3)'};
                    color:${idx <= 2 ? '#2a1f05' : 'var(--text-2)'}">
          ${idx + 1}
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:800;font-size:12.5px;
                      white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
            ${GMS.esc(person.name)}
          </div>
          <div style="height:4px;background:var(--surface-3);border-radius:2px;
                      overflow:hidden;margin-top:5px">
            <div style="height:100%;width:${pct}%;
                        background:var(--gold-grad);border-radius:2px"></div>
          </div>
        </div>
        <div style="text-align:end;flex-shrink:0">
          <div style="font-family:var(--font-mono);font-size:12.5px;
                      font-weight:900;color:var(--primary);direction:ltr">
            ${GMS.moneyFmt(person.revenue)}
          </div>
          <div style="font-size:10px;color:var(--muted);font-weight:700">
            ${person.count} فاتورة
          </div>
        </div>
      </div>
    `;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §5 · CHART RENDERERS
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * مخطط المبيعات — 24 ساعة
   * @param {Array} data
   */
  function renderSales24hChart(data) {
    destroyChart('sales24h');

    if (!isChartReady()) return;

    const canvas = document.getElementById('chart-sales-24h');
    if (!canvas) return;

    const labels = data.map(d => String(d.hour).padStart(2, '0') + ':00');
    const values = data.map(d => d.value);
    const total = values.reduce((a, b) => a + b, 0);

    /* تحديث العنوان الفرعي */
    const subEl = document.getElementById('sales-24h-sub');
    if (subEl) {
      subEl.textContent = `${GMS.moneyFmt(total)} ج.م · ${values.filter(v => v > 0).length} ساعة نشطة`;
    }

    const textClr = cssVar('--text');
    const mutedClr = cssVar('--muted');
    const borderClr = cssVar('--border');
    const primaryClr = cssVar('--primary') || '#c8a24a';

    DashState.charts.sales24h = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'المبيعات (ج.م)',
          data: values,
          borderColor: primaryClr,
          backgroundColor: 'rgba(200,162,74,.14)',
          borderWidth: 2.5,
          tension: 0.38,
          fill: true,
          pointRadius: 0,
          pointHoverRadius: 6,
          pointBackgroundColor: primaryClr,
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 500 },
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
              label: (c) => `  ${GMS.moneyFmt(c.parsed.y)} ج.م`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: mutedClr,
              font: { size: 10 },
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 12,
            },
          },
          y: {
            grid: { color: borderClr, drawBorder: false },
            ticks: {
              color: mutedClr,
              font: { size: 10 },
              callback: (v) => GMS.shortMoney(v),
            },
          },
        },
      },
    });
  }

  /**
   * مخطط توزيع العيارات
   * @param {Object} carats
   */
  function renderCaratsChart(carats) {
    destroyChart('carats');

    if (!isChartReady()) return;

    const canvas = document.getElementById('chart-carats');
    if (!canvas) return;

    const entries = GMS.KARAT_ORDER
      .filter(k => carats[k] && carats[k].count > 0)
      .map(k => ({
        karat: k,
        count: carats[k].count,
        pure: carats[k].pureWeight,
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

    DashState.charts.carats = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: entries.map(e => e.karat + 'K'),
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
        animation: { duration: 500 },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: textClr,
              font: { family: 'Cairo', size: 11, weight: '600' },
              padding: 10,
              usePointStyle: true,
              pointStyle: 'circle',
              generateLabels: (chart) => {
                const ds = chart.data.datasets[0];
                return chart.data.labels.map((label, i) => {
                  const value = ds.data[i];
                  const pct = totalPure > 0 ? ((value / totalPure) * 100).toFixed(0) : '0';
                  return {
                    text: `${label} · ${pct}%`,
                    fillStyle: ds.backgroundColor[i],
                    strokeStyle: ds.backgroundColor[i],
                    lineWidth: 0,
                    pointStyle: 'circle',
                    hidden: false,
                    index: i,
                  };
                });
              },
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
                ];
              },
            },
          },
        },
      },
    });
  }

  /**
   * مخطط المبيعات — 7 أيام
   * @param {Array} data
   */
  function renderWeeklyChart(data) {
    destroyChart('weekly');

    if (!isChartReady()) return;

    const canvas = document.getElementById('chart-weekly');
    if (!canvas) return;

    const labels = data.map(d => {
      const dt = new Date(d.date);
      return dt.toLocaleDateString('ar-EG', { weekday: 'short', day: '2-digit' });
    });

    const values = data.map(d => d.value);
    const goldValues = data.map(d => d.gold);
    const total = values.reduce((a, b) => a + b, 0);
    const avg = values.length ? total / values.length : 0;

    /* تحديث العنوان الفرعي */
    const subEl = document.getElementById('weekly-sub');
    if (subEl) {
      subEl.textContent = `متوسط يومي: ${GMS.moneyFmt(avg)} ج.م`;
    }

    const textClr = cssVar('--text');
    const mutedClr = cssVar('--muted');
    const borderClr = cssVar('--border');

    DashState.charts.weekly = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'المبيعات (ج.م)',
          data: values,
          backgroundColor: values.map((_, i) =>
            i === values.length - 1
              ? '#c8a24a'
              : 'rgba(200,162,74,.55)'
          ),
          borderRadius: 6,
          maxBarThickness: 42,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 500 },
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
                const idx = c.dataIndex;
                return [
                  `  المبيعات: ${GMS.moneyFmt(c.parsed.y)} ج.م`,
                  `  الذهب: ${GMS.gramFmt(goldValues[idx])} جم`,
                ];
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: textClr,
              font: { size: 10.5, weight: '600' },
            },
          },
          y: {
            grid: { color: borderClr, drawBorder: false },
            ticks: {
              color: mutedClr,
              font: { size: 10 },
              callback: (v) => GMS.shortMoney(v),
            },
          },
        },
      },
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §6 · MAIN RENDER
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * تصيير لوحة التحكم
   * @param {Element} root
   * @param {Object} data
   * @returns {void}
   */
  function renderDashboard(root, data) {
    const k = data.kpis;

    /* ─── HPIs ─────────────────────────────────────────────────── */
    const kpiHTML = `
      <div class="kpi-row cols-5">
        ${renderKPI({
          key: 'vault',
          cls: 'gold',
          icon: 'vault',
          label: GMS.t('dash.vaultGold'),
          value: GMS.gramFmt(k.vaultGold || 0),
          unit: GMS.t('unit.gram'),
          meta: `القيمة: <b>${GMS.moneyFmt(k.vaultValue || 0)}</b> ج.م`,
          metaIcon: 'coins',
        })}

        ${renderKPI({
          key: 'daily-sales',
          cls: 'cash',
          icon: 'banknote',
          label: GMS.t('dash.dailySales'),
          value: GMS.moneyFmt(k.dailySales || 0),
          unit: GMS.t('unit.egp'),
          meta: `<b>${GMS.intFmt(k.dailyTxns || 0)}</b> فاتورة اليوم`,
          metaIcon: 'receipt',
        })}

        ${renderKPI({
          key: 'daily-gold',
          cls: 'success',
          icon: 'scale',
          label: GMS.t('dash.dailyGold'),
          value: GMS.gramFmt(k.dailyGold || 0),
          unit: GMS.t('unit.gram'),
          meta: `متوسط: <b>${GMS.moneyFmt(k.dailyAvg || 0)}</b> ج.م`,
          metaIcon: 'trending-up',
        })}

        ${renderKPI({
          key: 'suppliers',
          cls: 'danger',
          icon: 'factory',
          label: GMS.t('dash.suppliersGold'),
          value: GMS.gramFmt(k.supplierGold || 0),
          unit: GMS.t('unit.gram'),
          meta: `النقد: <b>${GMS.moneyFmt(k.supplierCash || 0)}</b> ج.م`,
          metaIcon: 'wallet',
        })}

        ${renderKPI({
          key: 'queue',
          cls: k.queueCount > 0 ? 'warn' : 'violet',
          icon: 'package',
          label: GMS.t('dash.queueCount'),
          value: GMS.intFmt(k.queueCount || 0),
          unit: 'فاتورة',
          meta: k.queueCount > 0 ? 'بحاجة للرفع' : 'الطابور فارغ',
          metaIcon: 'cloud',
        })}
      </div>
    `;

    /* ─── Live Feed (الأحداث الأخيرة) ──────────────────────────── */
    const feedHTML = data.recentEvents.length
      ? data.recentEvents.map(renderFeedItem).join('')
      : `
        <div class="feed-empty">
          <i data-lucide="radio"></i>
          <div>لا توجد أحداث بعد</div>
          <div style="font-size:10.5px;margin-top:4px;opacity:.7">
            ستظهر الحركات الجديدة هنا فوراً
          </div>
        </div>`;

    /* ─── Main Content ─────────────────────────────────────────── */
    root.innerHTML = `
      <div class="page-header">
        <h2>
          <i data-lucide="layout-dashboard"></i>
          ${GMS.t('dash.title')}
        </h2>
        <p>${GMS.t('dash.subtitle')}</p>
      </div>

      ${kpiHTML}

      <!-- Charts Row 1: 24h + Carats -->
      <div class="charts-row">
        <div class="card">
          <div class="card-head">
            <h3><i data-lucide="activity"></i> ${GMS.t('dash.sales24h')}</h3>
            <div class="spacer" style="flex:1"></div>
            <span class="card-sub" id="sales-24h-sub">—</span>
          </div>
          <div class="card-body">
            <div class="chart-wrap chart-tall">
              <canvas id="chart-sales-24h"></canvas>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <h3><i data-lucide="pie-chart"></i> ${GMS.t('dash.caratDistribution')}</h3>
          </div>
          <div class="card-body">
            <div class="chart-wrap chart-tall">
              <canvas id="chart-carats"></canvas>
            </div>
          </div>
        </div>
      </div>

      <!-- Weekly Chart -->
      <div class="card">
        <div class="card-head">
          <h3><i data-lucide="bar-chart-3"></i> ${GMS.t('dash.sales7d')}</h3>
          <div class="spacer" style="flex:1"></div>
          <span class="card-sub" id="weekly-sub">—</span>
        </div>
        <div class="card-body">
          <div class="chart-wrap chart-short">
            <canvas id="chart-weekly"></canvas>
          </div>
        </div>
      </div>

      <!-- Branch Performance -->
      <div class="card">
        <div class="card-head">
          <h3><i data-lucide="building-2"></i> ${GMS.t('dash.branchPerformance')}</h3>
          <div class="spacer" style="flex:1"></div>
          <span class="card-sub">${data.branches.length} فرع نشط</span>
        </div>
        <div id="branch-list">
          ${data.branches.length
            ? data.branches.map((b, i) =>
                renderBranchRow(b, data.branches[0]?.pure || 1, i)
              ).join('')
            : `
              <div class="empty" style="padding:30px">
                <i data-lucide="building-2"></i>
                <p>لا توجد بيانات فروع</p>
              </div>`
          }
        </div>
      </div>

      <!-- Leaderboard + Dead Stock -->
      <div class="charts-row">
        <div class="card">
          <div class="card-head">
            <h3><i data-lucide="trophy"></i> ${GMS.t('dash.topSellers')}</h3>
          </div>
          <div class="card-body">
            ${data.leaderboard.length
              ? data.leaderboard.map((p, i) =>
                  renderLeaderboardRow(p, i, data.leaderboard[0]?.revenue || 1)
                ).join('')
              : `
                <div class="empty" style="padding:30px">
                  <i data-lucide="users"></i>
                  <p>لا توجد بيانات بائعين</p>
                </div>`
            }
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <h3><i data-lucide="alert-octagon"></i> ${GMS.t('dash.deadStock')}</h3>
          </div>
          <div class="card-body">
            <div class="calc-list">
              <div class="cl-row">
                <span class="k"><i data-lucide="package-x"></i> عدد القطع الراكدة</span>
                <span class="v" style="color:var(--danger);font-weight:900">
                  ${GMS.intFmt(data.deadStock.count || 0)}
                </span>
              </div>
              <div class="cl-row">
                <span class="k"><i data-lucide="banknote"></i> رأس المال المجمّد</span>
                <span class="v" style="color:var(--danger);font-weight:900">
                  ${GMS.moneyFmt(data.deadStock.capital || 0)} ج.م
                </span>
              </div>
              <div class="cl-row">
                <span class="k"><i data-lucide="scale"></i> ذهب راكد</span>
                <span class="v" style="color:var(--warn);font-weight:900">
                  ${GMS.gramFmt(data.deadStock.gold || 0)} جم
                </span>
              </div>
              <div class="cl-row hi">
                <span class="k"><i data-lucide="clock"></i> عمر المخزون</span>
                <span class="v" style="color:var(--primary);font-weight:900">
                  > 90 يوم
                </span>
              </div>
            </div>

            ${data.deadStock.count > 0 ? `
              <div style="margin-top:14px;padding:12px 14px;border-radius:10px;
                          background:var(--danger-bg);
                          border:1px solid color-mix(in srgb,var(--danger) 30%,transparent);
                          font-size:12px;color:var(--danger);font-weight:700;
                          line-height:1.6">
                <i data-lucide="alert-triangle"
                   style="width:14px;height:14px;display:inline;vertical-align:-2px"></i>
                يوجد ${GMS.intFmt(data.deadStock.count)} قطعة راكدة — راجع تقرير التحليلات
              </div>
            ` : `
              <div style="margin-top:14px;padding:12px 14px;border-radius:10px;
                          background:var(--success-bg);
                          border:1px solid color-mix(in srgb,var(--success) 30%,transparent);
                          font-size:12px;color:var(--success);font-weight:700;
                          line-height:1.6">
                <i data-lucide="check-circle-2"
                   style="width:14px;height:14px;display:inline;vertical-align:-2px"></i>
                لا يوجد ركود في المخزون
              </div>
            `}
          </div>
        </div>
      </div>

      <!-- Live Feed -->
      <div class="card">
        <div class="card-head">
          <h3><i data-lucide="radio"></i> ${GMS.t('dash.recentActivity')}</h3>
          <div class="spacer" style="flex:1"></div>
          <span class="chip ${data.kpis.realtimeStatus === 'connected' ? 'ok' : 'warn'}"
                id="realtime-chip">
            <i data-lucide="wifi" style="width:12px;height:12px"></i>
            ${data.kpis.realtimeStatus === 'connected' ? 'مباشر' : 'غير متصل'}
          </span>
        </div>
        <div class="card-body" style="padding:8px 0" id="dash-feed">
          ${feedHTML}
        </div>
      </div>

      <!-- Quick Actions -->
      <div class="card">
        <div class="card-head">
          <h3><i data-lucide="zap"></i> إجراءات سريعة</h3>
        </div>
        <div class="card-body">
          <div class="btn-row">
            <button class="btn btn-primary" data-action="pos">
              <i data-lucide="scan-line"></i> فاتورة بيع جديدة
            </button>
            <button class="btn" data-action="inventory">
              <i data-lucide="package"></i> عرض المخزون
            </button>
            <button class="btn" data-action="suppliers">
              <i data-lucide="factory"></i> الموردين
            </button>
            <button class="btn" data-action="analytics">
              <i data-lucide="bar-chart-3"></i> التحليلات
            </button>
            <button class="btn btn-success" data-action="sync">
              <i data-lucide="refresh-cw"></i> مزامنة الآن
            </button>
            <button class="btn" data-action="export">
              <i data-lucide="download"></i> تصدير Excel
            </button>
          </div>
        </div>
      </div>
    `;

    /* ─── Icons + Charts ───────────────────────────────────────── */
    window.lucide?.createIcons();

    requestAnimationFrame(() => {
      renderSales24hChart(data.sales24h);
      renderCaratsChart(data.carats);
      renderWeeklyChart(data.sales7d);
    });

    /* ─── Bind Actions ─────────────────────────────────────────── */
    bindActions();
  }

  /* ═════════════════════════════════════════════════════════════════════
     §7 · ACTION BINDINGS
     ═════════════════════════════════════════════════════════════════════ */

  function bindActions() {
    document.querySelectorAll('[data-action]').forEach(btn => {
      btn.onclick = async () => {
        const action = btn.dataset.action;

        switch (action) {
          case 'pos':
            GMS.Router?.go('pos');
            break;

          case 'inventory':
            GMS.Router?.go('inventory');
            break;

          case 'suppliers':
            GMS.Router?.go('suppliers');
            break;

          case 'analytics':
            GMS.Router?.go('analytics');
            break;

          case 'sync':
            btn.disabled = true;
            btn.classList.add('loading');
            try {
              if (GMS.Sync) {
                await GMS.Sync.deltaSync();
                await GMS.Sync.pushQueue();
              }
              GMS.Toast.ok('تمت المزامنة');
            } catch (e) {
              GMS.Toast.err('فشلت المزامنة', e.message);
            } finally {
              btn.disabled = false;
              btn.classList.remove('loading');
            }
            break;

          case 'export':
            GMS.Excel?.exportMenu();
            break;
        }
      };
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §8 · LIVE UPDATES
     ─────────────────────────────────────────────────────────────────────
     الاستماع لأحداث Realtime وتحديث البطاقات تلقائياً
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * تفعيل المستمعين
   */
  function bindLiveUpdates() {
    /* تفريغ المستمعين السابقين */
    DashState.unsubscribers.forEach(fn => fn());
    DashState.unsubscribers = [];

    /* Realtime feed update */
    if (GMS.Realtime) {
      const unsub1 = GMS.Realtime.on('feedUpdate', (event) => {
        /* إذا كانت الصفحة الحالية هي لوحة التحكم */
        if (GMS.Router?.current() !== 'dashboard') return;

        /* تحديث الـ feed */
        const feedEl = document.getElementById('dash-feed');
        if (!feedEl) return;

        if (!event) {
          /* clear */
          feedEl.innerHTML = `
            <div class="feed-empty">
              <i data-lucide="radio"></i>
              <div>لا توجد أحداث بعد</div>
            </div>`;
          window.lucide?.createIcons();
          return;
        }

        /* إضافة في الأعلى */
        const newItem = document.createElement('div');
        newItem.innerHTML = renderFeedItem(event);
        const firstChild = feedEl.querySelector('.feed-item');

        if (firstChild) {
          firstChild.style.animation = 'none';
          feedEl.insertBefore(newItem.firstChild, firstChild);
        } else {
          feedEl.innerHTML = '';
          feedEl.appendChild(newItem.firstChild);
        }

        /* إزالة الزائد */
        const items = feedEl.querySelectorAll('.feed-item');
        if (items.length > 8) {
          items[items.length - 1].remove();
        }

        window.lucide?.createIcons();

        /* Pulse على KPI المطابق */
        pulseRelevantKPI(event);
      });

      DashState.unsubscribers.push(unsub1);
    }

    /* Online change */
    if (GMS.Sync) {
      const unsub2 = GMS.Sync.on('onlineChange', () => {
        if (GMS.Router?.current() !== 'dashboard') return;
        scheduleRefresh();
      });
      DashState.unsubscribers.push(unsub2);
    }

    /* Connection change */
    if (GMS.Realtime) {
      const unsub3 = GMS.Realtime.on('connectionChange', () => {
        if (GMS.Router?.current() !== 'dashboard') return;
        updateRealtimeChip();
      });
      DashState.unsubscribers.push(unsub3);
    }
  }

  /**
   * نبضة على KPI المطابق للحدث
   * @param {Object} event
   */
  function pulseRelevantKPI(event) {
    if (!event || !event.table) return;

    const mappings = {
      sales: 'daily-sales',
      inventory: 'vault',
      entity_ledger: 'suppliers',
      price_board: 'vault',
    };

    const kpiKey = mappings[event.table];
    if (!kpiKey) return;

    const kpiEl = document.querySelector(`[data-kpi="${kpiKey}"]`);
    if (!kpiEl) return;

    kpiEl.classList.remove('pulse');
    void kpiEl.offsetWidth;
    kpiEl.classList.add('pulse');

    setTimeout(() => kpiEl.classList.remove('pulse'), 1500);

    /* جدولة تحديث كامل بعد فترة قصيرة */
    scheduleRefresh();
  }

  /**
   * تحديث chip الـ realtime
   */
  function updateRealtimeChip() {
    const chip = document.getElementById('realtime-chip');
    if (!chip) return;

    const status = GMS.Realtime?.state?.channelStatus || 'idle';

    if (status === 'connected') {
      chip.className = 'chip ok';
      chip.innerHTML = `<i data-lucide="wifi" style="width:12px;height:12px"></i> مباشر`;
    } else if (status === 'connecting') {
      chip.className = 'chip warn';
      chip.innerHTML = `<i data-lucide="loader-circle" style="width:12px;height:12px"></i> جارٍ الاتصال…`;
    } else {
      chip.className = 'chip warn';
      chip.innerHTML = `<i data-lucide="wifi-off" style="width:12px;height:12px"></i> غير متصل`;
    }

    window.lucide?.createIcons();
  }

  /**
   * جدولة تحديث تلقائي (debounced)
   */
  function scheduleRefresh() {
    if (DashState.refreshTimer) {
      clearTimeout(DashState.refreshTimer);
    }

    DashState.refreshTimer = setTimeout(() => {
      refreshKPIs();
    }, 1500);
  }

  /**
   * تحديث KPIs فقط (بدون إعادة تصيير كاملة)
   */
  async function refreshKPIs() {
    if (GMS.Router?.current() !== 'dashboard') return;
    if (DashState.refreshing) return;

    DashState.refreshing = true;

    try {
      const data = await computeDashboardData();

      /* تحديث البطاقات بدون إعادة تصيير */
      updateKPICard('vault', {
        value: GMS.gramFmt(data.kpis.vaultGold),
        meta: `القيمة: <b>${GMS.moneyFmt(data.kpis.vaultValue)}</b> ج.م`,
      });

      updateKPICard('daily-sales', {
        value: GMS.moneyFmt(data.kpis.dailySales),
        meta: `<b>${GMS.intFmt(data.kpis.dailyTxns)}</b> فاتورة اليوم`,
      });

      updateKPICard('daily-gold', {
        value: GMS.gramFmt(data.kpis.dailyGold),
        meta: `متوسط: <b>${GMS.moneyFmt(data.kpis.dailyAvg)}</b> ج.م`,
      });

      updateKPICard('suppliers', {
        value: GMS.gramFmt(data.kpis.supplierGold),
        meta: `النقد: <b>${GMS.moneyFmt(data.kpis.supplierCash)}</b> ج.م`,
      });

      const queueEl = document.querySelector('[data-kpi="queue"] .kpi-value');
      if (queueEl) {
        queueEl.innerHTML = `${GMS.intFmt(data.kpis.queueCount || 0)} <small>فاتورة</small>`;
      }

      /* تحديث العيارات */
      renderCaratsChart(data.carats);

      DashState.lastRefresh = new Date().toISOString();
      DashState.updateCount++;

    } catch (e) {
      console.warn('[Dashboard] refresh failed:', e);
    } finally {
      DashState.refreshing = false;
    }
  }

  /**
   * تحديث بطاقة KPI محددة
   * @param {string} key
   * @param {Object} updates
   */
  function updateKPICard(key, updates) {
    const el = document.querySelector(`[data-kpi="${key}"]`);
    if (!el) return;

    const valueEl = el.querySelector('.kpi-value');
    const metaEl = el.querySelector('.kpi-meta');

    /* حفظ القيم القديمة للمقارنة */
    const oldValue = valueEl?.textContent?.trim();

    if (valueEl && updates.value !== undefined) {
      valueEl.innerHTML = updates.value;
    }

    if (metaEl && updates.meta !== undefined) {
      metaEl.innerHTML = updates.meta;
    }

    /* وميض */
    const newValue = valueEl?.textContent?.trim();
    if (oldValue && newValue && oldValue !== newValue) {
      el.classList.remove('flash-up', 'flash-down');
      void el.offsetWidth;
      el.classList.add('flash-up');
      setTimeout(() => el.classList.remove('flash-up'), 1200);
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §9 · MAIN ENTRY POINT
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * تصيير لوحة التحكم الرئيسية
   * @param {Element} root
   * @returns {Promise<void>}
   */
  async function render(root) {
    /* Loading state */
    root.innerHTML = `
      <div style="padding:60px;text-align:center">
        <div class="spinner" style="margin:0 auto 14px"></div>
        <div style="font-size:13px;color:var(--muted);font-weight:600">
          جارٍ تحميل لوحة التحكم…
        </div>
      </div>
    `;

    try {
      /* حساب البيانات */
      const data = await computeDashboardData();

      /* تصيير */
      renderDashboard(root, data);

      /* تفعيل التحديثات الحية */
      bindLiveUpdates();

      /* تحديث تلقائي كل 30 ثانية */
      startAutoRefresh();

      /* تدمير المخططات عند مغادرة الصفحة */
      DashState.lastRefresh = new Date().toISOString();

    } catch (e) {
      console.error('[Dashboard.render]', e);
      root.innerHTML = `
        <div class="card">
          <div class="card-body">
            <div class="empty">
              <i data-lucide="alert-circle" style="color:var(--danger)"></i>
              <p>فشل تحميل لوحة التحكم</p>
              <span>${GMS.esc(e.message)}</span>
            </div>
          </div>
        </div>`;
      window.lucide?.createIcons();
    }
  }

  /**
   * بدء التحديث التلقائي
   */
  function startAutoRefresh() {
    stopAutoRefresh();

    DashState.refreshTimer = setInterval(() => {
      if (GMS.Router?.current() !== 'dashboard') {
        stopAutoRefresh();
        return;
      }
      if (!document.hidden) {
        refreshKPIs();
      }
    }, 30000); /* كل 30 ثانية */
  }

  /**
   * إيقاف التحديث التلقائي
   */
  function stopAutoRefresh() {
    if (DashState.refreshTimer) {
      clearInterval(DashState.refreshTimer);
      DashState.refreshTimer = null;
    }
  }

  /**
   * تنظيف موارد الصفحة
   */
  function cleanup() {
    stopAutoRefresh();

    /* إزالة المستمعين */
    DashState.unsubscribers.forEach(fn => fn());
    DashState.unsubscribers = [];

    /* تدمير المخططات */
    Object.keys(DashState.charts).forEach(destroyChart);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §10 · VIEW REGISTRATION
     ═════════════════════════════════════════════════════════════════════ */
  GMS.Views = GMS.Views || {};

  GMS.Views.dashboard = {
    render,
    cleanup,
    refresh: refreshKPIs,
    state: DashState,

    /* Helpers معرّضة للاستخدام من الصفحات الأخرى */
    computeData: computeDashboardData,
    renderKPI,
    renderFeedItem,

    /* Charts */
    destroyCharts: () => {
      Object.keys(DashState.charts).forEach(destroyChart);
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §11 · LOADED CONFIRMATION
     ═════════════════════════════════════════════════════════════════════ */
  console.log(
    '%c📊 Dashboard View loaded · 5 KPIs + 4 charts',
    'color:#c8a24a;font-weight:800;font-size:12px;padding:1px 5px;' +
    'background:#fdf3e3;border-radius:4px;'
  );

  console.log(
    `%c🎯 Live updates · Auto-refresh (30s) · Branch performance · Leaderboard · Dead stock`,
    'color:#6b7a95;font-weight:700;font-size:11px;'
  );

  /* ═════════════════════════════════════════════════════════════════════
     ✅ js/12-views-dashboard.js — نهاية الملف
     ═════════════════════════════════════════════════════════════════════ */

})();