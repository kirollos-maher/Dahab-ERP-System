/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ENTERPRISE — js/18-views-loss.js
   إدارة الخسس الشاملة:
     - سبك الكسر (Scrap Melting) مع محرك التسامح
     - الششني (Assaying) مع معايرة النقاء
     - التحميم والجلخ (Polishing) مع تسامح منفصل
     - دفتر خسس التشغيل
     - تصدير Excel
     - طباعة إيصالات

   ✅ v2: دعم كامل للعيارات المخصصة
     - السبك يقبل أي عيار (888، 916، 995...)
     - الششني بحسب النقاء مباشرة
     - التحميم بحسب النقاء الصحيح
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const GMS = window.GMS = window.GMS || {};

  /* ═════════════════════════════════════════════════════════════════════
     §1 · STATE
     ═════════════════════════════════════════════════════════════════════ */
  const LossState = {
    activeTab: 'melting',

    melting: {
      pieces: [],
      postWeight: 0,
      targetKarat: 24,
      notes: '',
      batchNo: '',
    },

    assaying: {
      sku: '',
      claimedKarat: 21,
      claimedPurity: GMS.karatRatio(21),
      claimedKaratMode: 'standard',
      claimedCustomKarat: 888,
      weightGrams: 0,
      testedPurity: GMS.karatRatio(21),
      assayerName: '',
      certificateNo: '',
      feeAmount: 0,
      feeMethod: 'cash',
      feeGoldGrams: 0,
      notes: '',
    },

    polishing: {
      batchNo: '',
      pieces: [],
      postWeight: 0,
      serviceType: 'acid',
      workshopName: '',
      notes: '',
    },

    meltingRecords: [],
    assayRecords: [],
    polishRecords: [],

    tolerances: null,

    loading: false,
    unsubscribers: [],
    timers: { recalc: null },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §2 · HELPERS
     ═════════════════════════════════════════════════════════════════════ */

  function setText(selector, value) {
    const el = document.querySelector(selector);
    if (el && el.textContent !== String(value)) {
      el.textContent = String(value);
    }
  }

  function esc(v) {
    return GMS.esc ? GMS.esc(v) : String(v == null ? '' : v);
  }

  function getPrice24() {
    if (GMS.Cache) {
      const p = GMS.Cache.getPrice();
      if (p?.price_24) return Number(p.price_24);
    }
    return GMS.APP_CONFIG.DEFAULT_PRICE_24;
  }

  /**
   * ✅ v2: قراءة معلومات العيار من قطعة كسر (قياسي أو مخصص)
   */
  function getPieceKaratInfo(piece) {
    if (!piece) return GMS.resolveKarat(21);

    if (piece.is_custom_karat === true || piece.custom_karat != null) {
      return GMS.resolveKarat({
        custom_karat: piece.custom_karat,
        purity_ratio: piece.purity_ratio,
        is_custom: true,
      });
    }

    if (piece.karat != null) {
      return GMS.resolveKarat(piece.karat);
    }

    return GMS.resolveKarat(21);
  }

  function loadTolerances() {
    try {
      const saved = JSON.parse(localStorage.getItem(GMS.LS_KEYS.TOLERANCES) || 'null');
      if (saved) {
        LossState.tolerances = saved;
        return;
      }
    } catch (_) {}

    LossState.tolerances = JSON.parse(JSON.stringify(GMS.DEFAULT_TOLERANCES));
  }

  function saveTolerances() {
    try {
      localStorage.setItem(
        GMS.LS_KEYS.TOLERANCES,
        JSON.stringify(LossState.tolerances)
      );
    } catch (_) {}
  }

  function evaluateTolerance(type, lossPct) {
    const t = LossState.tolerances[type];
    if (!t) return {
      severity: 'natural',
      severityMeta: GMS.LOSS_SEVERITY.natural,
      interpretation: '—',
      isSuspicious: false,
    };

    const abs = Math.abs(Number(lossPct) || 0);

    if (abs < t.naturalMin) {
      return {
        severity: 'low',
        severityMeta: GMS.LOSS_SEVERITY.low,
        interpretation: `أقل من الحد الطبيعي (${t.naturalMin}% – ${t.naturalMax}%) — راجع دقة الموازين`,
        isSuspicious: false,
      };
    }

    if (abs <= t.naturalMax) {
      return {
        severity: 'natural',
        severityMeta: GMS.LOSS_SEVERITY.natural,
        interpretation: `داخل النطاق الطبيعي (${t.naturalMin}% – ${t.naturalMax}%)`,
        isSuspicious: false,
      };
    }

    if (abs <= t.warningMax) {
      return {
        severity: 'warning',
        severityMeta: GMS.LOSS_SEVERITY.warning,
        interpretation: `أعلى من الطبيعي — يستدعي المراقبة (الحد: ${t.warningMax}%)`,
        isSuspicious: false,
      };
    }

    return {
      severity: 'suspicious',
      severityMeta: GMS.LOSS_SEVERITY.suspicious,
      interpretation: `⚠ خسس غير طبيعي — تجاوز حد الأمان (${t.warningMax}%) — احتمالية تلاعب أو سرقة`,
      isSuspicious: true,
    };
  }

  function markerPosition(lossPct, type) {
    const t = LossState.tolerances[type];
    if (!t) return 0;
    const max = t.warningMax * 2;
    return Math.min(100, (Math.abs(lossPct) / max) * 100);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §3 · DATA LOADING
     ═════════════════════════════════════════════════════════════════════ */

  function loadRecords() {
    try {
      LossState.meltingRecords = JSON.parse(
        localStorage.getItem(GMS.LS_KEYS.MELTING_RECORDS) || '[]'
      );
      LossState.assayRecords = JSON.parse(
        localStorage.getItem(GMS.LS_KEYS.ASSAY_RECORDS) || '[]'
      );
      LossState.polishRecords = JSON.parse(
        localStorage.getItem(GMS.LS_KEYS.POLISH_RECORDS) || '[]'
      );
    } catch (_) {
      LossState.meltingRecords = [];
      LossState.assayRecords = [];
      LossState.polishRecords = [];
    }

    if (!LossState.meltingRecords.length && GMS.Demo) {
      LossState.meltingRecords = GMS.Demo.getMeltingBatches().slice(0, 30).map(r => ({
        id: r.id,
        batch_no: r.batch_no,
        pre_melt_weight: r.pre_melt_weight,
        post_melt_weight: r.post_melt_weight,
        loss_weight: r.loss_weight,
        loss_percentage: r.loss_percentage,
        target_karat: r.target_karat,
        piece_count: r.piece_count,
        severity: r.severity,
        is_suspicious: r.is_suspicious,
        notes: r.notes,
        created_at: r.created_at,
      }));
    }

    if (!LossState.assayRecords.length && GMS.Demo) {
      LossState.assayRecords = GMS.Demo.getAssayRecords().slice(0, 30);
    }

    if (!LossState.polishRecords.length && GMS.Demo) {
      LossState.polishRecords = GMS.Demo.getPolishingBatches().slice(0, 30).map(r => ({
        id: r.id,
        batch_no: r.batch_no,
        service_type: r.service_type,
        workshop_name: r.workshop_name,
        pre_weight: r.pre_weight,
        post_weight: r.post_weight,
        loss_weight: r.loss_weight,
        loss_percentage: r.loss_percentage,
        piece_count: r.piece_count,
        severity: r.severity,
        is_suspicious: r.is_suspicious,
        notes: r.notes,
        created_at: r.created_at,
      }));
    }
  }

  function saveRecords() {
    try {
      localStorage.setItem(
        GMS.LS_KEYS.MELTING_RECORDS,
        JSON.stringify(LossState.meltingRecords.slice(0, 100))
      );
      localStorage.setItem(
        GMS.LS_KEYS.ASSAY_RECORDS,
        JSON.stringify(LossState.assayRecords.slice(0, 100))
      );
      localStorage.setItem(
        GMS.LS_KEYS.POLISH_RECORDS,
        JSON.stringify(LossState.polishRecords.slice(0, 100))
      );
    } catch (e) {
      console.warn('[Loss] localStorage quota exceeded');
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §4 · KPIs
     ═════════════════════════════════════════════════════════════════════ */

  function computeStats() {
    const all = [
      ...LossState.meltingRecords.map(r => ({ ...r, _opType: 'melting', loss: Number(r.loss_weight), lossPct: Number(r.loss_percentage) })),
      ...LossState.polishRecords.map(r => ({ ...r, _opType: 'polishing', loss: Number(r.loss_weight), lossPct: Number(r.loss_percentage) })),
    ];

    const thirtyDaysAgo = Date.now() - 30 * 86400000;
    const recent = all.filter(r => new Date(r.created_at).getTime() > thirtyDaysAgo);

    const totalGrams = recent.reduce((a, r) => a + r.loss, 0);
    const totalValue = totalGrams * getPrice24();
    const suspicious = recent.filter(r => r.is_suspicious).length;
    const avgPct = recent.length
      ? recent.reduce((a, r) => a + r.lossPct, 0) / recent.length
      : 0;

    return {
      total: recent.length,
      totalGrams: GMS.round(totalGrams, 3),
      totalValue: GMS.round(totalValue, 2),
      suspicious,
      avgPct: GMS.round(avgPct, 3),
    };
  }

  function renderKPIs(stats) {
    return `
      <div class="kpi-row cols-4">
        <div class="kpi gold">
          <div class="kpi-label">
            <i data-lucide="scale"></i>
            إجمالي الخسس (30 يوم)
          </div>
          <div class="kpi-value">${GMS.gramFmt(stats.totalGrams)} <small>جم</small></div>
          <div class="kpi-meta">
            ${GMS.intFmt(stats.total)} عملية
          </div>
        </div>

        <div class="kpi danger">
          <div class="kpi-label">
            <i data-lucide="coins"></i>
            القيمة التقديرية
          </div>
          <div class="kpi-value">${GMS.moneyFmt(stats.totalValue)} <small>ج.م</small></div>
          <div class="kpi-meta">
            بسعر ${GMS.moneyFmt(getPrice24())} ج.م/جم
          </div>
        </div>

        <div class="kpi info">
          <div class="kpi-label">
            <i data-lucide="percent"></i>
            متوسط النسبة
          </div>
          <div class="kpi-value">${stats.avgPct.toFixed(3)} <small>%</small></div>
          <div class="kpi-meta">
            عبر جميع العمليات
          </div>
        </div>

        <div class="kpi ${stats.suspicious > 0 ? 'danger' : 'success'}">
          <div class="kpi-label">
            <i data-lucide="shield-alert"></i>
            عمليات مشبوهة
          </div>
          <div class="kpi-value">${GMS.intFmt(stats.suspicious)}</div>
          <div class="kpi-meta">
            تجاوزت الحد الآمن
          </div>
        </div>
      </div>
    `;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §5 · TABS
     ═════════════════════════════════════════════════════════════════════ */

  function renderTabs() {
    const tabs = [
      { key: 'melting', label: 'سبك الكسر', icon: 'flame' },
      { key: 'assaying', label: 'الششني والمعايرة', icon: 'test-tube' },
      { key: 'polishing', label: 'التحميم والجلخ', icon: 'sparkles' },
      { key: 'ledger', label: 'دفتر خسس التشغيل', icon: 'book-open' },
    ];

    return `
      <div class="tabs-bar" style="position:relative;top:0;padding:0;
                  background:transparent;border-bottom:1px solid var(--border);
                  margin-bottom:20px">
        ${tabs.map(t => `
          <button class="tab ${LossState.activeTab === t.key ? 'active' : ''}"
                  data-loss-tab="${t.key}">
            <i data-lucide="${t.icon}"></i>
            <span>${t.label}</span>
          </button>
        `).join('')}
      </div>
    `;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §6 · KARAT BADGE (v2)
     ═════════════════════════════════════════════════════════════════════ */

  function renderKaratBadge(piece) {
    const info = getPieceKaratInfo(piece);

    if (info.is_custom) {
      return `
        <span class="karat-badge custom-karat-badge"
              data-k="custom"
              data-custom="${info.custom_karat}"
              title="عيار مخصص ${info.custom_karat} — نقاء ${Number(info.purity_ratio).toFixed(4)}"
              style="font-size:10px">
          <i data-lucide="sliders-horizontal"
             style="width:9px;height:9px;
                    display:inline;vertical-align:-1px;
                    margin-inline-end:2px"></i>
          ${info.custom_karat}
        </span>
      `;
    }

    return `<span class="karat-badge" data-k="${info.karat}" style="font-size:10px">${info.karat}K</span>`;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §7 · TAB 1 — MELTING (v2)
     ═════════════════════════════════════════════════════════════════════ */

  function renderMeltingTab() {
    const m = LossState.melting;
    const tol = LossState.tolerances.melting;

    const preTotal = m.pieces.reduce((a, p) => a + Number(p.weight || 0), 0);
    const loss = Math.max(0, GMS.round(preTotal - Number(m.postWeight || 0), 3));
    const lossPct = GMS.lossPct(loss, preTotal);
    const evaluation = evaluateTolerance('melting', lossPct);
    const markerPos = markerPosition(lossPct, 'melting');
    const lossValue = GMS.round(loss * getPrice24(), 2);

    return `
      <div class="workspace">
        <div>
          <div class="card">
            <div class="card-head">
              <h3>
                <i data-lucide="package-plus"></i>
                قطع الكسر المُدخلة
              </h3>
              <div class="spacer" style="flex:1"></div>
              <span class="card-sub">
                <span id="loss-pieces-count">${m.pieces.length}</span> قطعة ·
                إجمالي <b class="mono" id="loss-pieces-total">${GMS.gramFmt(preTotal)}</b> جم
              </span>
            </div>

            <div class="card-body">
              <div class="scrap-add" style="display:grid;
                          grid-template-columns:1fr 110px 100px auto;
                          gap:8px;align-items:end">
                <div class="field">
                  <label>وصف القطعة</label>
                  <input id="loss-piece-label"
                         placeholder="كسر عميل — سلسلة مكسورة">
                </div>
                <div class="field">
                  <label>العيار</label>
                  <select id="loss-piece-karat">
                    ${GMS.KARAT_ORDER.map(k => `
                      <option value="${k}" ${k === 21 ? 'selected' : ''}>${k}K</option>
                    `).join('')}
                    <option value="custom">🔸 مخصص</option>
                  </select>
                </div>
                <div class="field">
                  <label>الوزن (جم)</label>
                  <input type="number" id="loss-piece-weight"
                         step="0.001" min="0" placeholder="0.000"
                         class="mono"
                         style="text-align:center;font-weight:800;font-size:14px">
                </div>
                <button class="btn btn-primary" id="loss-piece-add"
                        style="height:40px">
                  <i data-lucide="plus"></i> إضافة
                </button>
              </div>

              <!-- ✅ v2: Custom karat panel for pieces -->
              <div id="loss-piece-custom-panel"
                   style="margin-top:10px;padding:12px 14px;
                          background:var(--warn-bg);border-radius:10px;
                          border:1.5px solid color-mix(in srgb,var(--warn) 35%,var(--border));
                          display:none">
                <div style="font-size:10.5px;font-weight:800;color:var(--warn);
                            text-transform:uppercase;letter-spacing:.4px;
                            margin-bottom:8px">
                  عيار مخصص للقطعة
                </div>
                <div class="grid-form" style="gap:10px">
                  <div class="field">
                    <label style="font-size:10.5px">العيار</label>
                    <input type="number" id="loss-piece-custom-karat"
                           step="1" min="300" max="999" value="888"
                           class="mono"
                           style="font-weight:900;text-align:center;font-size:14px">
                  </div>
                  <div class="field">
                    <label style="font-size:10.5px">النقاء</label>
                    <input type="number" id="loss-piece-custom-purity"
                           step="0.0001" min="0.3000" max="1.0000" value="0.8880"
                           class="mono"
                           style="font-weight:900;text-align:center;font-size:14px">
                  </div>
                </div>
              </div>

              <div style="margin-top:14px" id="loss-pieces-list">
                ${m.pieces.length === 0 ? `
                  <div class="empty" style="padding:28px 16px">
                    <i data-lucide="package"></i>
                    <p>لم تُضف قطع كسر بعد</p>
                    <span>أضف كل قطعة كسر لتتبع الخسس</span>
                  </div>
                ` : m.pieces.map(p => {
                  const info = getPieceKaratInfo(p);
                  return `
                    <div class="scrap-row" style="display:grid;
                                grid-template-columns:1fr 130px 100px 36px;
                                gap:8px;align-items:center;
                                padding:8px 10px;background:var(--surface);
                                border:1px solid var(--border);border-radius:9px;
                                margin-bottom:6px">
                      <div style="font-size:12px;font-weight:700;
                                  white-space:nowrap;overflow:hidden;
                                  text-overflow:ellipsis">
                        ${esc(p.label || '—')}
                      </div>
                      <div style="text-align:center">
                        ${info.is_custom
                          ? `<span class="karat-badge custom-karat-badge"
                                   style="font-size:10px">
                               ${info.custom_karat}
                             </span>
                             <span class="mono" style="font-size:9.5px;
                                          color:var(--muted);
                                          margin-inline-start:3px">
                               ${Number(info.purity_ratio).toFixed(4)}
                             </span>`
                          : `<span class="karat-badge" data-k="${p.karat}"
                                   style="font-size:10px">${p.karat}K</span>`}
                      </div>
                      <div class="mono" style="text-align:end;font-weight:900;
                                  color:var(--primary)">
                        ${GMS.gramFmt(p.weight)} جم
                      </div>
                      <button class="row-act danger"
                              data-loss-piece-rm="${esc(p.id)}"
                              style="width:26px;height:26px">
                        <i data-lucide="x"></i>
                      </button>
                    </div>
                  `;
                }).join('')}
              </div>

              ${m.pieces.length > 0 ? `
                <div style="margin-top:14px;padding:12px 14px;
                            background:var(--surface-2);border-radius:10px;
                            border:1px dashed var(--border)">
                  <div style="display:flex;justify-content:space-between;
                              align-items:baseline">
                    <span style="font-weight:800;font-size:13px">
                      إجمالي وزن الكسر قبل السبك
                    </span>
                    <span class="mono" style="font-weight:900;
                                font-size:16px;color:var(--primary)">
                      ${GMS.gramFmt(preTotal)} جم
                    </span>
                  </div>
                </div>
              ` : ''}
            </div>
          </div>

          <div class="card">
            <div class="card-head">
              <h3>
                <i data-lucide="package-check"></i>
                نتيجة السبك — المسبوكة
              </h3>
              <div class="spacer" style="flex:1"></div>
              <span class="card-sub">بعد الصهر والتبريد</span>
            </div>
            <div class="card-body">
              <div class="grid-form three">
                <div class="field">
                  <label>وزن المسبوكة النهائي (جم) <span class="req">*</span></label>
                  <input type="number" id="loss-post-weight"
                         step="0.001" min="0"
                         value="${m.postWeight || ''}"
                         placeholder="0.000"
                         class="big mono">
                  <span class="hint">الوزن بعد الصهر والتنظيف</span>
                </div>

                <div class="field">
                  <label>عيار المسبوكة المستهدف</label>
                  <select id="loss-target-karat">
                    ${GMS.KARAT_ORDER.slice(0, 3).map(k => `
                      <option value="${k}" ${k === m.targetKarat ? 'selected' : ''}>
                        ${k}K
                      </option>
                    `).join('')}
                  </select>
                  <span class="hint">عادةً 24K للسبائك</span>
                </div>

                <div class="field">
                  <label>رقم الدفعة</label>
                  <input id="loss-batch-no" readonly
                         value="${esc(m.batchNo)}"
                         class="mono"
                         style="font-weight:800;text-align:center">
                </div>
              </div>

              <div class="field field-full" style="margin-top:13px">
                <label>ملاحظات على الدفعة</label>
                <input id="loss-melt-notes"
                       placeholder="ملاحظات فنية، اسم الصائغ…"
                       value="${esc(m.notes)}">
              </div>

              <div style="margin-top:16px;padding:12px 14px;
                          background:var(--surface-2);border-radius:10px;
                          border:1px solid var(--border);
                          font-size:11.5px;line-height:1.8">
                <div style="font-weight:800;color:var(--text-2);
                            margin-bottom:5px;display:flex;align-items:center;gap:6px">
                  <i data-lucide="info" style="width:13px;height:13px;
                             color:var(--primary)"></i>
                  مؤشر الخسس الطبيعي المرجعي
                </div>
                <div style="display:flex;gap:16px;flex-wrap:wrap;
                            color:var(--muted);font-weight:600">
                  <span>طبيعي: <b style="color:var(--success)" class="mono">${tol.naturalMin}% – ${tol.naturalMax}%</b></span>
                  <span>مراقبة: <b style="color:var(--warn)" class="mono">حتى ${tol.warningMax}%</b></span>
                  <span>غير طبيعي: <b style="color:var(--danger)" class="mono">&gt; ${tol.warningMax}%</b></span>
                </div>
              </div>

              <div style="display:flex;gap:9px;margin-top:16px">
                <button class="btn btn-ghost" id="loss-melt-reset">
                  <i data-lucide="rotate-ccw"></i>
                  تفريغ
                </button>
                <button class="btn btn-primary btn-lg" id="loss-melt-save"
                        style="flex:1"
                        ${preTotal > 0 && m.postWeight > 0 ? '' : 'disabled'}>
                  <i data-lucide="save"></i>
                  حفظ دفعة السبك
                </button>
              </div>
            </div>
          </div>
        </div>

        <div style="position:sticky;top:calc(calc(var(--topbar-h) + var(--tabs-h)) + 22px)">
          <div class="gauge ${evaluation.severity}" id="loss-melt-gauge">
            <div class="gauge-head">
              <div class="gauge-icon">
                <i data-lucide="${evaluation.severityMeta.icon}"></i>
              </div>
              <div>
                <div class="gauge-title">
                  ${esc(evaluation.severityMeta.label)}
                </div>
                <div class="gauge-sub">
                  ${esc(evaluation.interpretation)}
                </div>
              </div>
            </div>

            <div class="gauge-value">
              ${lossPct > 0 ? lossPct.toFixed(3) : '0.000'}
              <small>%</small>
            </div>
            <div class="gauge-meta">
              الخسس: <b class="mono">${GMS.gramFmt(loss)}</b> جم ·
              القيمة: <b class="mono">${GMS.moneyFmt(lossValue)}</b> ج.م
            </div>

            <div class="tolerance-bar">
              <div class="tolerance-zones">
                <div class="zone-natural"></div>
                <div class="zone-warning"></div>
                <div class="zone-suspicious"></div>
              </div>
              ${lossPct > 0 ? `
                <div class="tolerance-marker" style="left:${markerPos}%"></div>
              ` : ''}
            </div>
            <div class="tolerance-zones-labels">
              <span class="zl-natural">طبيعي</span>
              <span class="zl-warning">مراقبة</span>
              <span class="zl-suspicious">غير طبيعي</span>
            </div>
            <div class="tolerance-labels">
              <span>0%</span>
              <span class="mono">${tol.naturalMax}%</span>
              <span class="mono">${tol.warningMax}%</span>
              <span class="mono">${(tol.warningMax * 2).toFixed(2)}%</span>
            </div>
          </div>

          <div class="card">
            <div class="card-head">
              <h3>
                <i data-lucide="calculator"></i>
                ملخص الدفعة
              </h3>
            </div>
            <div class="card-body">
              <div class="calc-list">
                <div class="cl-row">
                  <span class="k"><i data-lucide="package"></i> عدد القطع</span>
                  <span class="v">${m.pieces.length}</span>
                </div>
                <div class="cl-row">
                  <span class="k"><i data-lucide="scale"></i> الوزن قبل السبك</span>
                  <span class="v">${GMS.gramFmt(preTotal)} جم</span>
                </div>
                <div class="cl-row">
                  <span class="k"><i data-lucide="package-check"></i> وزن المسبوكة</span>
                  <span class="v">${m.postWeight > 0 ? GMS.gramFmt(m.postWeight) + ' جم' : '—'}</span>
                </div>
                <div class="cl-row hi">
                  <span class="k"><i data-lucide="flame"></i> الخسس</span>
                  <span class="v">${GMS.gramFmt(loss)} جم</span>
                </div>
              </div>

              ${evaluation.isSuspicious ? `
                <div style="margin-top:14px;padding:12px 14px;border-radius:10px;
                            background:var(--danger-bg);color:var(--danger);
                            border:1px solid color-mix(in srgb,var(--danger) 30%,transparent);
                            font-size:12px;font-weight:800;line-height:1.6">
                  <div style="display:flex;align-items:center;gap:8px;
                              margin-bottom:5px">
                    <i data-lucide="shield-alert" style="width:15px;height:15px"></i>
                    <span>تنبيه خسس غير طبيعي</span>
                  </div>
                  <div style="font-weight:600;font-size:11.5px">
                    تجاوزت نسبة الخسس حد الأمان. يُنصح بمراجعة الموازين
                    أو التحقق من إجراءات السبك قبل حفظ الدفعة.
                  </div>
                </div>
              ` : ''}
            </div>
          </div>

          <div class="card">
            <div class="card-head">
              <h3>
                <i data-lucide="history"></i>
                أحدث دفعات السبك
              </h3>
              <div class="spacer" style="flex:1"></div>
              <span class="card-sub">${LossState.meltingRecords.length} دفعة</span>
            </div>
            <div class="card-body" style="padding:8px 0;max-height:280px;
                        overflow-y:auto">
              ${renderRecentMelting()}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderRecentMelting() {
    const rows = LossState.meltingRecords.slice(0, 12);

    if (!rows.length) {
      return `
        <div class="empty" style="padding:28px 16px">
          <i data-lucide="inbox"></i>
          <p>لا توجد دفعات سابقة</p>
        </div>
      `;
    }

    return rows.map(r => {
      const meta = GMS.LOSS_SEVERITY[r.severity] || GMS.LOSS_SEVERITY.natural;
      const sevColor = r.severity === 'suspicious' ? 'var(--danger)'
                     : r.severity === 'warning' ? 'var(--warn)'
                     : r.severity === 'low' ? 'var(--info)'
                     : 'var(--success)';
      const sevBg = r.severity === 'suspicious' ? 'var(--danger-bg)'
                  : r.severity === 'warning' ? 'var(--warn-bg)'
                  : r.severity === 'low' ? 'var(--info-bg)'
                  : 'var(--success-bg)';

      return `
        <div style="padding:11px 16px;border-bottom:1px dashed var(--border);
                    display:grid;grid-template-columns:auto 1fr auto;
                    gap:11px;align-items:center">
          <div style="width:32px;height:32px;border-radius:9px;
                      display:grid;place-items:center;
                      background:${sevBg};color:${sevColor}">
            <i data-lucide="${meta.icon}" style="width:15px;height:15px"></i>
          </div>
          <div style="min-width:0">
            <div style="font-size:12px;font-weight:800;
                        font-family:var(--font-mono);
                        direction:ltr;text-align:left">
              ${esc(r.batch_no || '—')}
            </div>
            <div style="font-size:10.5px;color:var(--muted);
                        font-weight:600;margin-top:2px">
              ${GMS.gramFmt(r.pre_melt_weight)} → ${GMS.gramFmt(r.post_melt_weight)} جم ·
              ${GMS.timeAgo(r.created_at)}
            </div>
          </div>
          <div style="text-align:end">
            <div class="mono" style="font-size:12.5px;font-weight:900;
                        color:${sevColor}">
              ${Number(r.loss_percentage).toFixed(3)}%
            </div>
            <div style="font-size:9.5px;color:var(--muted);font-weight:700">
              ${GMS.gramFmt(r.loss_weight)} جم
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  /* ═════════════════════════════════════════════════════════════════════
     §8 · TAB 2 — ASSAYING (v2)
     ═════════════════════════════════════════════════════════════════════ */

  function renderAssayingTab() {
    const a = LossState.assaying;
    const claimedPure = GMS.round(a.weightGrams * a.claimedPurity, 4);
    const testedPure = GMS.round(a.weightGrams * a.testedPurity, 4);
    const pureDelta = GMS.round(testedPure - claimedPure, 4);
    const purityDelta = GMS.round(a.testedPurity - a.claimedPurity, 4);
    const valueDelta = GMS.round(pureDelta * getPrice24(), 2);

    const feeGold = a.feeMethod === 'gold'
      ? Number(a.feeGoldGrams || 0)
      : (a.feeAmount > 0 ? GMS.round(a.feeAmount / getPrice24(), 4) : 0);

    return `
      <div class="workspace">
        <div>
          <div class="card">
            <div class="card-head">
              <h3>
                <i data-lucide="clipboard-list"></i>
                بيانات الفحص
              </h3>
              <div class="spacer" style="flex:1"></div>
              <span class="card-sub">من شهادة مكتب الششني</span>
            </div>

            <div class="card-body">
              <div class="grid-form three">
                <div class="field">
                  <label>كود القطعة / الدفعة</label>
                  <input id="loss-assay-sku"
                         placeholder="A21-260918-00001"
                         dir="ltr"
                         class="mono"
                         value="${esc(a.sku)}">
                </div>

                <div class="field">
                  <label>الوزن (جرام)</label>
                  <input type="number" id="loss-assay-weight"
                         step="0.001" min="0" class="big mono"
                         value="${a.weightGrams || ''}"
                         placeholder="0.000">
                </div>

                <div class="field">
                  <label>رقم شهادة الفحص</label>
                  <input id="loss-assay-cert"
                         placeholder="CERT-2024-001"
                         dir="ltr"
                         class="mono"
                         value="${esc(a.certificateNo)}">
                </div>
              </div>

              <!-- ✅ v2: Claimed Karat with custom support -->
              <div style="margin-top:18px">
                <div style="font-size:11px;font-weight:800;color:var(--muted);
                            text-transform:uppercase;letter-spacing:.4px;
                            margin-bottom:9px;display:flex;align-items:center;gap:6px">
                  <i data-lucide="gem" style="width:12px;height:12px"></i>
                  العيار المُدَّعى (حسب الوسم)
                </div>

                <div class="karat-grid">
                  ${GMS.KARAT_ORDER.map(k => `
                    <button type="button"
                            class="karat-btn ${a.claimedKaratMode === 'standard' && k === a.claimedKarat ? 'active' : ''}"
                            data-loss-claimed="${k}">
                      <div class="kb-num">${k}K</div>
                      <div class="kb-ratio">${GMS.karatRatio(k).toFixed(4)}</div>
                    </button>
                  `).join('')}
                  <button type="button"
                          class="karat-btn custom-karat-btn ${a.claimedKaratMode === 'custom' ? 'active' : ''}"
                          data-loss-claimed-custom="1">
                    <div class="kb-num">
                      <i data-lucide="sliders-horizontal"
                         style="width:20px;height:20px"></i>
                    </div>
                    <div class="kb-ratio">مخصص</div>
                  </button>
                </div>

                <!-- ✅ v2: Custom panel -->
                <div id="loss-assay-custom-panel"
                     style="margin-top:12px;padding:14px 16px;
                            background:var(--warn-bg);border-radius:11px;
                            border:1.5px solid color-mix(in srgb,var(--warn) 35%,var(--border));
                            ${a.claimedKaratMode === 'custom' ? '' : 'display:none'}">
                  <div style="font-size:10.5px;font-weight:800;color:var(--warn);
                              text-transform:uppercase;letter-spacing:.4px;
                              margin-bottom:10px">
                    العيار المخصص المُدَّعى
                  </div>

                  <div class="grid-form" style="gap:12px">
                    <div class="field">
                      <label style="font-size:10.5px">العيار</label>
                      <input type="number" id="loss-assay-custom-karat"
                             step="1" min="300" max="999"
                             value="${a.claimedCustomKarat || 888}"
                             class="mono"
                             style="font-weight:900;text-align:center;font-size:15px">
                    </div>
                    <div class="field">
                      <label style="font-size:10.5px">النقاء</label>
                      <input type="number" id="loss-assay-custom-purity"
                             step="0.0001" min="0.3000" max="1.0000"
                             value="${Number(a.claimedPurity || 0.888).toFixed(4)}"
                             class="mono"
                             style="font-weight:900;text-align:center;font-size:15px">
                    </div>
                  </div>
                </div>
              </div>

              <!-- Tested Purity -->
              <div style="margin-top:20px">
                <div class="field">
                  <label style="justify-content:space-between">
                    <span>النقاء المُختبَر من الششني</span>
                    <span class="mono" id="loss-assay-tested-display"
                          style="color:var(--primary);font-weight:900;font-size:14px">
                      ${a.testedPurity.toFixed(4)}
                    </span>
                  </label>

                  <input type="range" id="loss-assay-tested-slider"
                         min="0.5000" max="1.0000" step="0.0005"
                         value="${a.testedPurity}"
                         style="width:100%;height:6px;border-radius:4px;
                                -webkit-appearance:none;
                                background:linear-gradient(90deg,
                                  color-mix(in srgb,var(--danger) 40%,var(--surface-3)) 0%,
                                  color-mix(in srgb,var(--warn) 40%,var(--surface-3)) 50%,
                                  color-mix(in srgb,var(--success) 40%,var(--surface-3)) 100%);
                                margin-top:8px">

                  <input type="number" id="loss-assay-tested-input"
                         step="0.0001" min="0.4" max="1.0"
                         value="${a.testedPurity}"
                         class="big mono"
                         style="margin-top:8px">
                </div>
              </div>

              <!-- Fee -->
              <div style="margin-top:18px">
                <div style="font-size:11px;font-weight:800;color:var(--muted);
                            text-transform:uppercase;letter-spacing:.4px;
                            margin-bottom:9px;display:flex;align-items:center;gap:6px">
                  <i data-lucide="receipt" style="width:12px;height:12px"></i>
                  رسوم الششني
                </div>

                <div class="grid-form three">
                  <div class="field">
                    <label>طريقة الدفع</label>
                    <select id="loss-assay-fee-method">
                      <option value="cash" ${a.feeMethod === 'cash' ? 'selected' : ''}>
                        نقدي (ج.م)
                      </option>
                      <option value="gold" ${a.feeMethod === 'gold' ? 'selected' : ''}>
                        خصم ذهب (جم)
                      </option>
                    </select>
                  </div>

                  <div class="field" id="loss-assay-fee-cash-field"
                       style="${a.feeMethod === 'gold' ? 'display:none' : ''}">
                    <label>المبلغ (ج.م)</label>
                    <input type="number" id="loss-assay-fee-amount"
                           step="0.01" min="0"
                           value="${a.feeAmount || ''}"
                           placeholder="0.00" class="big mono">
                  </div>

                  <div class="field" id="loss-assay-fee-gold-field"
                       style="${a.feeMethod === 'cash' ? 'display:none' : ''}">
                    <label>الوزن المخصوم (جم)</label>
                    <input type="number" id="loss-assay-fee-gold"
                           step="0.001" min="0"
                           value="${a.feeGoldGrams || ''}"
                           placeholder="0.000" class="big mono">
                  </div>

                  <div class="field">
                    <label>اسم الفاحص / المكتب</label>
                    <input id="loss-assay-assayer"
                           placeholder="مكتب الششني المعتمد"
                           value="${esc(a.assayerName)}">
                  </div>
                </div>
              </div>

              <div class="field field-full" style="margin-top:14px">
                <label>ملاحظات</label>
                <input id="loss-assay-notes"
                       placeholder="ملاحظات على نتيجة الفحص…"
                       value="${esc(a.notes)}">
              </div>

              <!-- Comparison -->
              ${a.weightGrams > 0 ? `
                <div style="display:grid;grid-template-columns:1fr auto 1fr;
                            gap:14px;align-items:stretch;margin:18px 0">
                  <div style="padding:14px 16px;border-radius:12px;
                              border:1.5px solid var(--border-strong);
                              background:var(--surface)">
                    <div style="font-size:10.5px;font-weight:800;
                                color:var(--muted);text-transform:uppercase;
                                letter-spacing:.4px;margin-bottom:9px">
                      قبل الفحص (المُدَّعى)
                    </div>
                    <div class="mono" style="font-size:22px;font-weight:900;
                                letter-spacing:-.5px;line-height:1">
                      ${a.claimedPurity.toFixed(4)}
                    </div>
                    <div class="mono" style="font-size:15px;font-weight:800;
                                margin-top:8px;color:var(--text-2)">
                      ${GMS.gramFmt(claimedPure)} جم
                    </div>
                    <div style="font-size:10.5px;color:var(--muted);
                                font-weight:700;margin-top:3px">
                      الوزن الصافي 24K المُدَّعى
                    </div>
                  </div>

                  <div style="display:grid;place-items:center;
                              color:var(--muted)">
                    <i data-lucide="arrow-left" style="width:24px;height:24px"></i>
                  </div>

                  <div style="padding:14px 16px;border-radius:12px;
                              border:1.5px solid color-mix(in srgb,var(--primary) 40%,var(--border));
                              background:var(--gold-soft)">
                    <div style="font-size:10.5px;font-weight:800;
                                color:var(--warn);text-transform:uppercase;
                                letter-spacing:.4px;margin-bottom:9px">
                      بعد الفحص (المُختبَر)
                    </div>
                    <div class="mono" style="font-size:22px;font-weight:900;
                                letter-spacing:-.5px;line-height:1">
                      ${a.testedPurity.toFixed(4)}
                    </div>
                    <div class="mono" style="font-size:15px;font-weight:800;
                                margin-top:8px;color:var(--primary)">
                      ${GMS.gramFmt(testedPure)} جم
                    </div>
                    <div style="font-size:10.5px;color:var(--muted);
                                font-weight:700;margin-top:3px">
                      الوزن الصافي 24K المؤكد
                    </div>
                  </div>
                </div>

                <div style="text-align:center">
                  <span style="display:inline-flex;align-items:center;gap:5px;
                               padding:5px 11px;border-radius:20px;
                               font-size:11.5px;font-weight:900;
                               font-family:var(--font-mono);
                               background:${pureDelta > 0.0001 ? 'var(--success-bg)'
                                          : pureDelta < -0.0001 ? 'var(--danger-bg)'
                                          : 'var(--surface-3)'};
                               color:${pureDelta > 0.0001 ? 'var(--success)'
                                     : pureDelta < -0.0001 ? 'var(--danger)'
                                     : 'var(--muted)'}">
                    <i data-lucide="${pureDelta > 0 ? 'arrow-up' : pureDelta < 0 ? 'arrow-down' : 'minus'}"
                       style="width:12px;height:12px"></i>
                    ${pureDelta > 0 ? '+' : ''}${GMS.gramFmt(pureDelta)} جم
                    (${valueDelta > 0 ? '+' : ''}${GMS.moneyFmt(valueDelta)} ج.م)
                  </span>
                </div>
              ` : ''}

              <div style="display:flex;gap:9px;margin-top:18px">
                <button class="btn btn-ghost" id="loss-assay-reset">
                  <i data-lucide="rotate-ccw"></i>
                  تفريغ
                </button>
                <button class="btn btn-primary btn-lg" id="loss-assay-save"
                        style="flex:1"
                        ${a.weightGrams > 0 ? '' : 'disabled'}>
                  <i data-lucide="save"></i>
                  حفظ نتيجة الفحص
                </button>
              </div>
            </div>
          </div>
        </div>

        <div style="position:sticky;top:calc(calc(var(--topbar-h) + var(--tabs-h)) + 22px)">
          <div class="card">
            <div class="card-head">
              <h3>
                <i data-lucide="calculator"></i>
                التعديل الصافي
              </h3>
            </div>
            <div class="card-body">
              <div class="calc-list">
                <div class="cl-row">
                  <span class="k"><i data-lucide="scale"></i> الوزن الفيزيائي</span>
                  <span class="v">${GMS.gramFmt(a.weightGrams)} جم</span>
                </div>
                <div class="cl-row">
                  <span class="k"><i data-lucide="percent"></i> فرق النقاء</span>
                  <span class="v" style="color:${purityDelta > 0 ? 'var(--success)'
                                        : purityDelta < 0 ? 'var(--danger)'
                                        : 'var(--muted)'}">
                    ${purityDelta > 0 ? '+' : ''}${purityDelta.toFixed(4)}
                  </span>
                </div>
                <div class="cl-row">
                  <span class="k"><i data-lucide="sparkles"></i> فرق البندق</span>
                  <span class="v" style="color:${pureDelta > 0 ? 'var(--success)'
                                        : pureDelta < 0 ? 'var(--danger)'
                                        : 'var(--muted)'}">
                    ${pureDelta > 0 ? '+' : ''}${GMS.gramFmt(pureDelta)} جم
                  </span>
                </div>
                <div class="cl-row hi">
                  <span class="k"><i data-lucide="coins"></i> القيمة المُصحَّحة</span>
                  <span class="v">${valueDelta > 0 ? '+' : ''}${GMS.moneyFmt(valueDelta)} ج.م</span>
                </div>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-head">
              <h3>
                <i data-lucide="wallet"></i>
                رسوم الششني
              </h3>
            </div>
            <div class="card-body">
              <div class="calc-list">
                <div class="cl-row">
                  <span class="k"><i data-lucide="tag"></i> طريقة الدفع</span>
                  <span class="v" style="font-size:13px">
                    ${a.feeMethod === 'cash' ? 'نقدي' : 'خصم ذهب'}
                  </span>
                </div>

                ${a.feeMethod === 'cash' && a.feeAmount > 0 ? `
                  <div class="cl-row">
                    <span class="k"><i data-lucide="banknote"></i> المبلغ</span>
                    <span class="v">${GMS.moneyFmt(a.feeAmount)} ج.م</span>
                  </div>
                  <div class="cl-row">
                    <span class="k"><i data-lucide="scale"></i> المُعادل بالذهب</span>
                    <span class="v">${GMS.gramFmt(feeGold)} جم</span>
                  </div>
                ` : ''}

                ${a.feeMethod === 'gold' && a.feeGoldGrams > 0 ? `
                  <div class="cl-row">
                    <span class="k"><i data-lucide="scale"></i> الذهب المخصوم</span>
                    <span class="v">${GMS.gramFmt(a.feeGoldGrams)} جم</span>
                  </div>
                  <div class="cl-row">
                    <span class="k"><i data-lucide="banknote"></i> المُعادل النقدي</span>
                    <span class="v">${GMS.moneyFmt(a.feeGoldGrams * getPrice24())} ج.م</span>
                  </div>
                ` : ''}
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-head">
              <h3>
                <i data-lucide="history"></i>
                أحدث الفحوصات
              </h3>
              <div class="spacer" style="flex:1"></div>
              <span class="card-sub">${LossState.assayRecords.length} سجل</span>
            </div>
            <div class="card-body" style="padding:8px 0;max-height:280px;
                        overflow-y:auto">
              ${renderRecentAssay()}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderRecentAssay() {
    const rows = LossState.assayRecords.slice(0, 10);

    if (!rows.length) {
      return `
        <div class="empty" style="padding:28px 16px">
          <i data-lucide="inbox"></i>
          <p>لا توجد فحوصات سابقة</p>
        </div>
      `;
    }

    return rows.map(r => {
      const delta = Number(r.pure_delta || 0);
      const deltaColor = delta > 0 ? 'var(--success)'
                       : delta < 0 ? 'var(--danger)'
                       : 'var(--muted)';

      const isCustom = r.is_custom_karat === true || r.custom_karat != null;

      const karatLabel = isCustom
        ? `مخصص ${r.custom_karat || '—'}`
        : `${r.claimed_karat || '—'}K`;

      return `
        <div style="padding:11px 16px;border-bottom:1px dashed var(--border);
                    display:grid;grid-template-columns:auto 1fr auto;
                    gap:11px;align-items:center">
          <div style="width:32px;height:32px;border-radius:9px;
                      display:grid;place-items:center;
                      background:${isCustom ? 'var(--warn-bg)' : 'var(--info-bg)'};
                      color:${isCustom ? 'var(--warn)' : 'var(--info)'}">
            <i data-lucide="${isCustom ? 'sliders-horizontal' : 'test-tube'}"
               style="width:15px;height:15px"></i>
          </div>
          <div style="min-width:0">
            <div style="font-size:12px;font-weight:800;
                        font-family:var(--font-mono);
                        direction:ltr;text-align:left">
              ${esc(r.sku || '—')}
            </div>
            <div style="font-size:10.5px;color:var(--muted);
                        font-weight:600;margin-top:2px">
              ${karatLabel} → ${Number(r.tested_purity || 0).toFixed(4)} ·
              ${GMS.timeAgo(r.created_at)}
            </div>
          </div>
          <div style="text-align:end">
            <div class="mono" style="font-size:12.5px;font-weight:900;
                        color:${deltaColor}">
              ${delta > 0 ? '+' : ''}${GMS.gramFmt(delta)}
            </div>
            <div style="font-size:9.5px;color:var(--muted);font-weight:700">
              جم بندق
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  /* ═════════════════════════════════════════════════════════════════════
     §9 · TAB 3 — POLISHING (v2)
     ═════════════════════════════════════════════════════════════════════ */

  function renderPolishingTab() {
    const p = LossState.polishing;
    const tol = LossState.tolerances.polishing;

    const preTotal = p.pieces.reduce((a, x) => a + Number(x.preWeight || 0), 0);
    const loss = Math.max(0, GMS.round(preTotal - Number(p.postWeight || 0), 3));
    const lossPct = GMS.lossPct(loss, preTotal);
    const evaluation = evaluateTolerance('polishing', lossPct);
    const markerPos = markerPosition(lossPct, 'polishing');
    const lossValue = GMS.round(loss * getPrice24(), 2);

    return `
      <div class="workspace">
        <div>
          <div class="card">
            <div class="card-head">
              <h3>
                <i data-lucide="package-plus"></i>
                قطع الصيانة
              </h3>
              <div class="spacer" style="flex:1"></div>
              <span class="card-sub">
                ${p.pieces.length} قطعة · إجمالي
                <b class="mono">${GMS.gramFmt(preTotal)}</b> جم
              </span>
            </div>

            <div class="card-body">
              <div class="scrap-add" style="display:grid;
                          grid-template-columns:1fr 110px 100px auto;
                          gap:8px;align-items:end">
                <div class="field">
                  <label>كود القطعة</label>
                  <input id="loss-polish-sku"
                         placeholder="A21-260918-00001"
                         dir="ltr" class="mono">
                </div>
                <div class="field">
                  <label>العيار</label>
                  <select id="loss-polish-karat">
                    ${GMS.KARAT_ORDER.map(k => `
                      <option value="${k}" ${k === 21 ? 'selected' : ''}>${k}K</option>
                    `).join('')}
                    <option value="custom">🔸 مخصص</option>
                  </select>
                </div>
                <div class="field">
                  <label>الوزن قبل (جم)</label>
                  <input type="number" id="loss-polish-weight"
                         step="0.001" min="0" placeholder="0.000"
                         class="mono"
                         style="text-align:center;font-weight:800;font-size:14px">
                </div>
                <button class="btn btn-primary" id="loss-polish-add"
                        style="height:40px">
                  <i data-lucide="plus"></i> إضافة
                </button>
              </div>

              <!-- ✅ v2: Custom karat panel -->
              <div id="loss-polish-custom-panel"
                   style="margin-top:10px;padding:12px 14px;
                          background:var(--warn-bg);border-radius:10px;
                          border:1.5px solid color-mix(in srgb,var(--warn) 35%,var(--border));
                          display:none">
                <div style="font-size:10.5px;font-weight:800;color:var(--warn);
                            text-transform:uppercase;letter-spacing:.4px;
                            margin-bottom:8px">
                  عيار مخصص
                </div>
                <div class="grid-form" style="gap:10px">
                  <div class="field">
                    <label style="font-size:10.5px">العيار</label>
                    <input type="number" id="loss-polish-custom-karat"
                           step="1" min="300" max="999" value="888"
                           class="mono"
                           style="font-weight:900;text-align:center;font-size:14px">
                  </div>
                  <div class="field">
                    <label style="font-size:10.5px">النقاء</label>
                    <input type="number" id="loss-polish-custom-purity"
                           step="0.0001" min="0.3000" max="1.0000" value="0.8880"
                           class="mono"
                           style="font-weight:900;text-align:center;font-size:14px">
                  </div>
                </div>
              </div>

              <div style="margin-top:14px">
                ${p.pieces.length === 0 ? `
                  <div class="empty" style="padding:28px 16px">
                    <i data-lucide="package"></i>
                    <p>لم تُضف قطع صيانة بعد</p>
                    <span>أضف كل قطعة مرسلة للورشة</span>
                  </div>
                ` : p.pieces.map(piece => {
                  const info = getPieceKaratInfo(piece);
                  return `
                    <div style="display:grid;
                                grid-template-columns:1fr 130px 100px 36px;
                                gap:8px;align-items:center;
                                padding:8px 10px;background:var(--surface);
                                border:1px solid var(--border);border-radius:9px;
                                margin-bottom:6px">
                      <div class="mono" style="font-size:12px;font-weight:700;
                                  white-space:nowrap;overflow:hidden;
                                  text-overflow:ellipsis">
                        ${esc(piece.sku || '—')}
                      </div>
                      <div style="text-align:center">
                        ${info.is_custom
                          ? `<span class="karat-badge custom-karat-badge"
                                   style="font-size:10px">
                               ${info.custom_karat}
                             </span>
                             <span class="mono" style="font-size:9.5px;
                                          color:var(--muted);
                                          margin-inline-start:3px">
                               ${Number(info.purity_ratio).toFixed(4)}
                             </span>`
                          : `<span class="karat-badge" data-k="${piece.karat}"
                                   style="font-size:10px">${piece.karat}K</span>`}
                      </div>
                      <div class="mono" style="text-align:end;font-weight:900;
                                  color:var(--primary)">
                        ${GMS.gramFmt(piece.preWeight)} جم
                      </div>
                      <button class="row-act danger"
                              data-loss-polish-rm="${esc(piece.id)}"
                              style="width:26px;height:26px">
                        <i data-lucide="x"></i>
                      </button>
                    </div>
                  `;
                }).join('')}
              </div>

              ${p.pieces.length > 0 ? `
                <div style="margin-top:14px;padding:12px 14px;
                            background:var(--surface-2);border-radius:10px;
                            border:1px dashed var(--border);
                            display:flex;justify-content:space-between;
                            align-items:baseline">
                  <span style="font-weight:800;font-size:13px">
                    إجمالي الوزن قبل الصيانة
                  </span>
                  <span class="mono" style="font-weight:900;
                              font-size:16px;color:var(--primary)">
                    ${GMS.gramFmt(preTotal)} جم
                  </span>
                </div>
              ` : ''}
            </div>
          </div>

          <div class="card">
            <div class="card-head">
              <h3>
                <i data-lucide="wrench"></i>
                تفاصيل الصيانة
              </h3>
            </div>

            <div class="card-body">
              <div class="grid-form three">
                <div class="field">
                  <label>نوع الخدمة</label>
                  <select id="loss-polish-service">
                    ${Object.entries(GMS.POLISHING_SERVICES).map(([k, v]) => `
                      <option value="${k}" ${p.serviceType === k ? 'selected' : ''}>
                        ${v.label}
                      </option>
                    `).join('')}
                  </select>
                </div>

                <div class="field">
                  <label>اسم الورشة</label>
                  <input id="loss-polish-workshop"
                         placeholder="ورشة الصيانة"
                         value="${esc(p.workshopName)}">
                </div>

                <div class="field">
                  <label>رقم الدفعة</label>
                  <input id="loss-polish-batch-no" readonly
                         value="${esc(p.batchNo)}"
                         class="mono"
                         style="font-weight:800;text-align:center">
                </div>
              </div>

              <div class="field field-full" style="margin-top:13px">
                <label>الوزن بعد الصيانة (جم) <span class="req">*</span></label>
                <input type="number" id="loss-polish-post-weight"
                       step="0.001" min="0"
                       value="${p.postWeight || ''}"
                       placeholder="0.000"
                       class="big mono">
                <span class="hint">الوزن بعد استلام القطع من الورشة</span>
              </div>

              <div class="field field-full" style="margin-top:13px">
                <label>ملاحظات</label>
                <input id="loss-polish-notes"
                       placeholder="ملاحظات على الحالة…"
                       value="${esc(p.notes)}">
              </div>

              <div style="margin-top:16px;padding:12px 14px;
                          background:var(--surface-2);border-radius:10px;
                          border:1px solid var(--border);
                          font-size:11.5px;line-height:1.8">
                <div style="font-weight:800;color:var(--text-2);
                            margin-bottom:5px;display:flex;align-items:center;gap:6px">
                  <i data-lucide="info" style="width:13px;height:13px;
                             color:var(--primary)"></i>
                  الحدود القياسية لخسس التحميم والجلخ
                </div>
                <div style="display:flex;gap:16px;flex-wrap:wrap;
                            color:var(--muted);font-weight:600">
                  <span>طبيعي: <b style="color:var(--success)" class="mono">${tol.naturalMin}% – ${tol.naturalMax}%</b></span>
                  <span>مراقبة: <b style="color:var(--warn)" class="mono">حتى ${tol.warningMax}%</b></span>
                  <span>مرفوض: <b style="color:var(--danger)" class="mono">&gt; ${tol.warningMax}%</b></span>
                </div>
              </div>

              <div style="display:flex;gap:9px;margin-top:16px">
                <button class="btn btn-ghost" id="loss-polish-reset">
                  <i data-lucide="rotate-ccw"></i>
                  تفريغ
                </button>
                <button class="btn btn-primary btn-lg" id="loss-polish-save"
                        style="flex:1"
                        ${preTotal > 0 && p.postWeight > 0 ? '' : 'disabled'}>
                  <i data-lucide="save"></i>
                  حفظ دفعة الصيانة
                </button>
              </div>
            </div>
          </div>
        </div>

        <div style="position:sticky;top:calc(calc(var(--topbar-h) + var(--tabs-h)) + 22px)">
          <div class="gauge ${evaluation.severity}" id="loss-polish-gauge">
            <div class="gauge-head">
              <div class="gauge-icon">
                <i data-lucide="${evaluation.severityMeta.icon}"></i>
              </div>
              <div>
                <div class="gauge-title">
                  ${esc(evaluation.severityMeta.label)}
                </div>
                <div class="gauge-sub">
                  ${esc(evaluation.interpretation)}
                </div>
              </div>
            </div>

            <div class="gauge-value">
              ${lossPct > 0 ? lossPct.toFixed(3) : '0.000'}
              <small>%</small>
            </div>
            <div class="gauge-meta">
              الخسس: <b class="mono">${GMS.gramFmt(loss)}</b> جم ·
              القيمة: <b class="mono">${GMS.moneyFmt(lossValue)}</b> ج.م
            </div>

            <div class="tolerance-bar">
              <div class="tolerance-zones">
                <div class="zone-natural"></div>
                <div class="zone-warning"></div>
                <div class="zone-suspicious"></div>
              </div>
              ${lossPct > 0 ? `
                <div class="tolerance-marker" style="left:${markerPos}%"></div>
              ` : ''}
            </div>
            <div class="tolerance-zones-labels">
              <span class="zl-natural">طبيعي</span>
              <span class="zl-warning">مراقبة</span>
              <span class="zl-suspicious">مرفوض</span>
            </div>
            <div class="tolerance-labels">
              <span>0%</span>
              <span class="mono">${tol.naturalMax}%</span>
              <span class="mono">${tol.warningMax}%</span>
              <span class="mono">${(tol.warningMax * 2).toFixed(2)}%</span>
            </div>
          </div>

          <div class="card">
            <div class="card-head">
              <h3>
                <i data-lucide="history"></i>
                أحدث دفعات الصيانة
              </h3>
              <div class="spacer" style="flex:1"></div>
              <span class="card-sub">${LossState.polishRecords.length} سجل</span>
            </div>
            <div class="card-body" style="padding:8px 0;max-height:340px;
                        overflow-y:auto">
              ${renderRecentPolishing()}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderRecentPolishing() {
    const rows = LossState.polishRecords.slice(0, 12);

    if (!rows.length) {
      return `
        <div class="empty" style="padding:28px 16px">
          <i data-lucide="inbox"></i>
          <p>لا توجد دفعات سابقة</p>
        </div>
      `;
    }

    return rows.map(r => {
      const meta = GMS.LOSS_SEVERITY[r.severity] || GMS.LOSS_SEVERITY.natural;
      const sevColor = r.severity === 'suspicious' ? 'var(--danger)'
                     : r.severity === 'warning' ? 'var(--warn)'
                     : 'var(--success)';
      const sevBg = r.severity === 'suspicious' ? 'var(--danger-bg)'
                  : r.severity === 'warning' ? 'var(--warn-bg)'
                  : 'var(--success-bg)';

      return `
        <div style="padding:11px 16px;border-bottom:1px dashed var(--border);
                    display:grid;grid-template-columns:auto 1fr auto;
                    gap:11px;align-items:center">
          <div style="width:32px;height:32px;border-radius:9px;
                      display:grid;place-items:center;
                      background:${sevBg};color:${sevColor}">
            <i data-lucide="${meta.icon}" style="width:15px;height:15px"></i>
          </div>
          <div style="min-width:0">
            <div style="font-size:12px;font-weight:800;
                        font-family:var(--font-mono);
                        direction:ltr;text-align:left">
              ${esc(r.batch_no || '—')}
            </div>
            <div style="font-size:10.5px;color:var(--muted);
                        font-weight:600;margin-top:2px">
              ${r.piece_count} قطعة · ${GMS.timeAgo(r.created_at)}
            </div>
          </div>
          <div style="text-align:end">
            <div class="mono" style="font-size:12.5px;font-weight:900;
                        color:${sevColor}">
              ${Number(r.loss_percentage).toFixed(3)}%
            </div>
            <div style="font-size:9.5px;color:var(--muted);font-weight:700">
              ${GMS.gramFmt(r.loss_weight)} جم
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  /* ═════════════════════════════════════════════════════════════════════
     §10 · TAB 4 — OPERATIONAL LEDGER (v2)
     ═════════════════════════════════════════════════════════════════════ */

  function renderLedgerTab() {
    const all = [
      ...LossState.meltingRecords.map(r => ({
        ...r,
        _type: 'melting',
        _label: 'سبك الكسر',
        _icon: 'flame',
        _cls: 'pill-amber',
      })),
      ...LossState.polishRecords.map(r => ({
        ...r,
        _type: 'polishing',
        _label: 'تحميم وجلخ',
        _icon: 'sparkles',
        _cls: 'pill-violet',
      })),
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const totalGrams = all.reduce((a, r) => a + Number(r.loss_weight || 0), 0);
    const totalEGP = totalGrams * getPrice24();
    const suspiciousCount = all.filter(r => r.is_suspicious).length;
    const monthGrams = all
      .filter(r => new Date(r.created_at).getTime() > Date.now() - 30 * 86400000)
      .reduce((a, r) => a + Number(r.loss_weight || 0), 0);

    return `
      <div class="kpi-row cols-4">
        <div class="kpi gold">
          <div class="kpi-label">
            <i data-lucide="scale"></i>
            إجمالي الخسس التراكمي
          </div>
          <div class="kpi-value">${GMS.gramFmt(totalGrams)} <small>جم</small></div>
          <div class="kpi-meta">
            من بداية التشغيل
          </div>
        </div>

        <div class="kpi danger">
          <div class="kpi-label">
            <i data-lucide="coins"></i>
            القيمة التراكمية
          </div>
          <div class="kpi-value">${GMS.moneyFmt(totalEGP)} <small>ج.م</small></div>
          <div class="kpi-meta">
            بسعر اليوم
          </div>
        </div>

        <div class="kpi info">
          <div class="kpi-label">
            <i data-lucide="calendar"></i>
            خسس آخر 30 يوم
          </div>
          <div class="kpi-value">${GMS.gramFmt(monthGrams)} <small>جم</small></div>
          <div class="kpi-meta">
            ${GMS.intFmt(all.filter(r => new Date(r.created_at).getTime() > Date.now() - 30 * 86400000).length)} عملية
          </div>
        </div>

        <div class="kpi ${suspiciousCount > 0 ? 'danger' : 'success'}">
          <div class="kpi-label">
            <i data-lucide="shield-alert"></i>
            عمليات مُعلَّمة
          </div>
          <div class="kpi-value">${GMS.intFmt(suspiciousCount)}</div>
          <div class="kpi-meta">
            تحتاج مراجعة
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <h3>
            <i data-lucide="list"></i>
            سجل الحركات التفصيلي
          </h3>
          <div class="spacer" style="flex:1"></div>
          <span class="card-sub">${all.length} حركة</span>
          <button class="btn btn-sm" id="loss-ledger-export">
            <i data-lucide="download"></i> تصدير Excel
          </button>
        </div>

        <div class="table-wrap" style="border:none;border-radius:0;
                    max-height:640px">
          <table class="tbl">
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>النوع</th>
                <th>رقم المرجع</th>
                <th>الوصف</th>
                <th class="col-num">الخسس (جم)</th>
                <th class="col-num">النسبة</th>
                <th class="col-num">القيمة (ج.م)</th>
                <th class="col-c">الحالة</th>
              </tr>
            </thead>
            <tbody>
              ${all.length ? all.slice(0, 200).map(r => {
                const meta = GMS.LOSS_SEVERITY[r.severity] || GMS.LOSS_SEVERITY.natural;
                const lossVal = GMS.round(Number(r.loss_weight || 0) * getPrice24(), 2);
                const sevColor = r.severity === 'suspicious' ? 'var(--danger)'
                              : r.severity === 'warning' ? 'var(--warn)'
                              : r.severity === 'low' ? 'var(--info)'
                              : 'var(--success)';
                const desc = r._type === 'melting'
                  ? `${r.piece_count} قطعة كسر`
                  : `${r.piece_count} قطعة — ${r.workshop_name || 'ورشة'}`;

                return `
                  <tr>
                    <td class="mono" style="font-size:11px;
                                color:var(--muted)">
                      ${GMS.dateAr(r.created_at)}
                    </td>
                    <td>
                      <span class="pill ${r._cls}">
                        <i data-lucide="${r._icon}"
                           style="width:10px;height:10px"></i>
                        ${r._label}
                      </span>
                    </td>
                    <td class="mono" style="font-size:11.5px;
                                font-weight:800">
                      ${esc(r.batch_no || '—')}
                    </td>
                    <td style="font-size:11.5px">${esc(desc)}</td>
                    <td class="col-num" style="font-weight:800">
                      ${GMS.gramFmt(r.loss_weight)}
                    </td>
                    <td class="col-num" style="font-weight:900;
                                color:${sevColor}">
                      ${Number(r.loss_percentage).toFixed(3)}%
                    </td>
                    <td class="col-num">${GMS.moneyFmt(lossVal)}</td>
                    <td class="col-c">
                      <span class="pill ${meta.cls}">
                        <i data-lucide="${meta.icon}"
                           style="width:10px;height:10px"></i>
                        ${meta.label}
                      </span>
                    </td>
                  </tr>
                `;
              }).join('') : `
                <tr>
                  <td colspan="8" style="text-align:center;
                              padding:48px;color:var(--muted)">
                    <i data-lucide="inbox"
                       style="width:34px;height:34px;opacity:.3;
                              display:block;margin:0 auto 10px"></i>
                    <div style="font-weight:800;color:var(--text-2)">
                      لا توجد حركات في الدفتر
                    </div>
                    <div style="font-size:11.5px;margin-top:4px">
                      ستُسجَّل الحركات تلقائياً عند حفظ الدفعات
                    </div>
                  </td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §11 · MAIN RENDER
     ═════════════════════════════════════════════════════════════════════ */

  function render(root) {
    const stats = computeStats();

    let tabContent = '';
    if (LossState.activeTab === 'melting') {
      tabContent = renderMeltingTab();
    } else if (LossState.activeTab === 'assaying') {
      tabContent = renderAssayingTab();
    } else if (LossState.activeTab === 'polishing') {
      tabContent = renderPolishingTab();
    } else if (LossState.activeTab === 'ledger') {
      tabContent = renderLedgerTab();
    }

    root.innerHTML = `
      <div class="page-header">
        <h2>
          <i data-lucide="flame"></i>
          ${GMS.t('loss.title')}
        </h2>
        <p>${GMS.t('loss.subtitle')}
          <span class="chip warn" style="font-size:10px;margin-inline-start:6px">
            <i data-lucide="sliders-horizontal" style="width:10px;height:10px"></i>
            يدعم العيارات المخصصة
          </span>
        </p>
      </div>

      ${renderKPIs(stats)}
      ${renderTabs()}
      ${tabContent}
    `;

    window.lucide?.createIcons();
    bindControls();
  }

  /* ═════════════════════════════════════════════════════════════════════
     §12 · CONTROLS BINDING
     ═════════════════════════════════════════════════════════════════════ */

  function bindControls() {
    document.querySelectorAll('[data-loss-tab]').forEach(tab => {
      tab.onclick = () => {
        const key = tab.dataset.lossTab;
        if (key === LossState.activeTab) return;

        LossState.activeTab = key;
        render(document.getElementById('page'));
      };
    });

    if (LossState.activeTab === 'melting') bindMelting();
    else if (LossState.activeTab === 'assaying') bindAssaying();
    else if (LossState.activeTab === 'polishing') bindPolishing();
    else if (LossState.activeTab === 'ledger') bindLedger();
  }

  /* ═════════════════════════════════════════════════════════════════════
     §13 · BIND — MELTING (v2)
     ═════════════════════════════════════════════════════════════════════ */

  function bindMelting() {
    const m = LossState.melting;

    if (!m.batchNo) {
      m.batchNo = GMS.batchNo('MB');
      const el = document.getElementById('loss-batch-no');
      if (el) el.value = m.batchNo;
    }

    /* Karat select — handle custom option */
    const karatSelect = document.getElementById('loss-piece-karat');
    const customPanel = document.getElementById('loss-piece-custom-panel');
    if (karatSelect && customPanel) {
      karatSelect.onchange = () => {
        const isCustom = karatSelect.value === 'custom';
        customPanel.style.display = isCustom ? '' : 'none';
      };
    }

    /* Custom karat input sync */
    const ckInput = document.getElementById('loss-piece-custom-karat');
    const cpInput = document.getElementById('loss-piece-custom-purity');
    if (ckInput && cpInput) {
      ckInput.oninput = () => {
        let v = parseInt(ckInput.value) || 888;
        v = Math.max(GMS.KARAT_LIMITS.min, Math.min(GMS.KARAT_LIMITS.max, v));
        cpInput.value = GMS.round(v / 1000, 4).toFixed(4);
      };
      cpInput.oninput = () => {
        let v = parseFloat(cpInput.value) || 0.8880;
        v = Math.max(GMS.KARAT_LIMITS.minPurity,
                     Math.min(GMS.KARAT_LIMITS.maxPurity, v));
        ckInput.value = Math.round(v * 1000);
      };
    }

    const addBtn = document.getElementById('loss-piece-add');
    if (addBtn) {
      addBtn.onclick = () => {
        const label = document.getElementById('loss-piece-label')?.value.trim();
        const karatVal = karatSelect?.value || '21';
        const weight = parseFloat(document.getElementById('loss-piece-weight')?.value) || 0;

        if (weight <= 0) {
          GMS.Beep?.error();
          GMS.Toast.err('أدخل وزناً صحيحاً');
          return;
        }

        let pieceKarat = 21;
        let customKarat = null;
        let purity = GMS.karatRatio(21);
        let isCustom = false;

        if (karatVal === 'custom') {
          const ck = parseInt(ckInput?.value) || 888;
          const cp = parseFloat(cpInput?.value) || 0.8880;
          isCustom = true;
          customKarat = ck;
          purity = cp;
        } else {
          pieceKarat = Number(karatVal) || 21;
          purity = GMS.karatRatio(pieceKarat);
        }

        m.pieces.push({
          id: GMS.uid(),
          label: label || (isCustom ? `كسر مخصص ${customKarat}` : `كسر ${pieceKarat}K`),
          karat: isCustom ? null : pieceKarat,
          custom_karat: customKarat,
          is_custom_karat: isCustom,
          purity_ratio: purity,
          weight: GMS.round(weight, 3),
        });

        const labelInput = document.getElementById('loss-piece-label');
        if (labelInput) labelInput.value = '';
        const weightInput = document.getElementById('loss-piece-weight');
        if (weightInput) weightInput.value = '';

        GMS.Beep?.click?.() || GMS.Beep?.info?.();
        render(document.getElementById('page'));
      };
    }

    const weightInput = document.getElementById('loss-piece-weight');
    if (weightInput) {
      weightInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          document.getElementById('loss-piece-add')?.click();
        }
      };
    }

    document.querySelectorAll('[data-loss-piece-rm]').forEach(btn => {
      btn.onclick = () => {
        const id = btn.dataset.lossPieceRm;
        m.pieces = m.pieces.filter(p => p.id !== id);
        GMS.Beep?.delete?.();
        render(document.getElementById('page'));
      };
    });

    const postInput = document.getElementById('loss-post-weight');
    if (postInput) {
      postInput.oninput = (e) => {
        m.postWeight = parseFloat(e.target.value) || 0;
        updateMeltingGauge();
      };
    }

    const targetKarat = document.getElementById('loss-target-karat');
    if (targetKarat) {
      targetKarat.onchange = (e) => {
        m.targetKarat = Number(e.target.value);
      };
    }

    const notes = document.getElementById('loss-melt-notes');
    if (notes) {
      notes.oninput = (e) => { m.notes = e.target.value; };
    }

    const resetBtn = document.getElementById('loss-melt-reset');
    if (resetBtn) {
      resetBtn.onclick = async () => {
        if (!m.pieces.length && !m.postWeight) return;

        const ok = await GMS.Confirm.ask(
          'سيتم تفريغ جميع بيانات الدفعة الحالية.',
          { title: 'تفريغ الدفعة', okText: 'تفريغ', danger: true }
        );

        if (!ok) return;

        LossState.melting = {
          pieces: [],
          postWeight: 0,
          targetKarat: 24,
          notes: '',
          batchNo: GMS.batchNo('MB'),
        };
        render(document.getElementById('page'));
      };
    }

    const saveBtn = document.getElementById('loss-melt-save');
    if (saveBtn) {
      saveBtn.onclick = () => saveMeltingBatch();
    }
  }

  function updateMeltingGauge() {
    const m = LossState.melting;
    const preTotal = m.pieces.reduce((a, p) => a + Number(p.weight || 0), 0);
    const loss = Math.max(0, GMS.round(preTotal - Number(m.postWeight || 0), 3));
    const lossPct = GMS.lossPct(loss, preTotal);
    const evaluation = evaluateTolerance('melting', lossPct);
    const markerPos = markerPosition(lossPct, 'melting');
    const lossValue = GMS.round(loss * getPrice24(), 2);

    const gauge = document.getElementById('loss-melt-gauge');
    if (!gauge) return;

    gauge.className = `gauge ${evaluation.severity}`;
    gauge.innerHTML = `
      <div class="gauge-head">
        <div class="gauge-icon">
          <i data-lucide="${evaluation.severityMeta.icon}"></i>
        </div>
        <div>
          <div class="gauge-title">
            ${esc(evaluation.severityMeta.label)}
          </div>
          <div class="gauge-sub">
            ${esc(evaluation.interpretation)}
          </div>
        </div>
      </div>

      <div class="gauge-value">
        ${lossPct > 0 ? lossPct.toFixed(3) : '0.000'}
        <small>%</small>
      </div>
      <div class="gauge-meta">
        الخسس: <b class="mono">${GMS.gramFmt(loss)}</b> جم ·
        القيمة: <b class="mono">${GMS.moneyFmt(lossValue)}</b> ج.م
      </div>

      <div class="tolerance-bar">
        <div class="tolerance-zones">
          <div class="zone-natural"></div>
          <div class="zone-warning"></div>
          <div class="zone-suspicious"></div>
        </div>
        ${lossPct > 0 ? `
          <div class="tolerance-marker" style="left:${markerPos}%"></div>
        ` : ''}
      </div>
      <div class="tolerance-zones-labels">
        <span class="zl-natural">طبيعي</span>
        <span class="zl-warning">مراقبة</span>
        <span class="zl-suspicious">غير طبيعي</span>
      </div>
      <div class="tolerance-labels">
        <span>0%</span>
        <span class="mono">${LossState.tolerances.melting.naturalMax}%</span>
        <span class="mono">${LossState.tolerances.melting.warningMax}%</span>
        <span class="mono">${(LossState.tolerances.melting.warningMax * 2).toFixed(2)}%</span>
      </div>
    `;
    window.lucide?.createIcons();

    const summaryRows = document.querySelectorAll('.calc-list .cl-row .v');
    if (summaryRows[2]) {
      summaryRows[2].textContent = m.postWeight > 0
        ? `${GMS.gramFmt(m.postWeight)} جم`
        : '—';
    }
    if (summaryRows[3]) {
      summaryRows[3].textContent = `${GMS.gramFmt(loss)} جم`;
    }

    const saveBtn = document.getElementById('loss-melt-save');
    if (saveBtn) {
      const pre = m.pieces.reduce((a, p) => a + Number(p.weight || 0), 0);
      saveBtn.disabled = !(pre > 0 && m.postWeight > 0);
    }
  }

  async function saveMeltingBatch() {
    const m = LossState.melting;
    const preTotal = m.pieces.reduce((a, p) => a + Number(p.weight || 0), 0);
    const loss = Math.max(0, GMS.round(preTotal - Number(m.postWeight || 0), 3));
    const lossPct = GMS.lossPct(loss, preTotal);
    const evaluation = evaluateTolerance('melting', lossPct);
    const lossValue = GMS.round(loss * getPrice24(), 2);

    if (evaluation.isSuspicious) {
      const ok = await GMS.Confirm.ask(
        `نسبة الخسس ${lossPct.toFixed(3)}% تتجاوز حد الأمان ${LossState.tolerances.melting.warningMax}%.\n` +
        `سيتم تسجيل الدفعة كـ SUSPICIOUS_LOSS. متابعة؟`,
        {
          title: 'خسس غير طبيعي',
          okText: 'حفظ مع التنبيه',
          danger: true,
          icon: 'shield-alert',
        }
      );

      if (!ok) return;
    }

    /* ✅ v2: حساب الإجماليات بكل عيار */
    let customCount = 0;
    let puritySum = 0;
    m.pieces.forEach(p => {
      if (p.is_custom_karat) customCount++;
      puritySum += Number(p.purity_ratio || 0);
    });

    const avgPurity = m.pieces.length ? puritySum / m.pieces.length : 0;

    const record = {
      id: GMS.uid(),
      batch_no: m.batchNo,
      pre_melt_weight: GMS.round(preTotal, 3),
      post_melt_weight: GMS.round(m.postWeight, 3),
      loss_weight: loss,
      loss_percentage: lossPct,
      loss_value_egp: lossValue,
      target_karat: m.targetKarat,
      severity: evaluation.severity,
      is_suspicious: evaluation.isSuspicious,
      piece_count: m.pieces.length,
      pieces: m.pieces.slice(),
      /* ✅ v2 */
      custom_karat_count: customCount,
      avg_purity: GMS.round(avgPurity, 4),
      notes: m.notes,
      created_at: new Date().toISOString(),
      created_by: GMS.Auth?.profile?.full_name || '—',
    };

    if (GMS.Supabase?.isReady()) {
      try {
        await GMS.Supabase.get()
          .from('melting_batches')
          .insert({
            batch_no: record.batch_no,
            pre_melt_weight: record.pre_melt_weight,
            post_melt_weight: record.post_melt_weight,
            loss_weight: record.loss_weight,
            loss_percentage: record.loss_percentage,
            is_suspicious: record.is_suspicious,
            target_karat: record.target_karat,
            piece_count: record.piece_count,
            custom_karat_count: record.custom_karat_count,
            avg_purity: record.avg_purity,
            notes: record.notes,
          });
      } catch (e) {
        console.warn('[Loss] Supabase insert failed:', e);
      }
    }

    LossState.meltingRecords.unshift(record);
    saveRecords();

    if (evaluation.isSuspicious) {
      GMS.Beep?.error();
      GMS.Toast.err(
        `⚠ خسس غير طبيعي — ${record.batch_no}`,
        `نسبة الخسس: ${lossPct.toFixed(3)}% (الحد: ${LossState.tolerances.melting.warningMax}%)`
      );
    } else if (evaluation.severity === 'warning') {
      GMS.Beep?.warning();
      GMS.Toast.warn(
        `تحذير — ${record.batch_no}`,
        `نسبة الخسس ${lossPct.toFixed(3)}% أعلى من الطبيعي، تحتاج مراجعة`
      );
    } else {
      GMS.Beep?.complete();
      GMS.Toast.ok(
        `تم حفظ دفعة السبك`,
        `${record.batch_no} · خسس ${lossPct.toFixed(3)}% (${GMS.gramFmt(loss)} جم)`
      );
    }

    if (GMS.Audit) {
      await GMS.Audit.log('MELTING_BATCH', 'inventory', record.id,
        `دفعة سبك ${record.batch_no} — خسس ${lossPct.toFixed(3)}%`,
        {
          batch_no: record.batch_no,
          loss: record.loss_weight,
          severity: record.severity,
          custom_karat_count: customCount,
        });
    }

    showMeltingReceipt(record);

    LossState.melting = {
      pieces: [],
      postWeight: 0,
      targetKarat: 24,
      notes: '',
      batchNo: GMS.batchNo('MB'),
    };
    render(document.getElementById('page'));
  }

  /* ═════════════════════════════════════════════════════════════════════
     §14 · BIND — ASSAYING (v2)
     ═════════════════════════════════════════════════════════════════════ */

  function bindAssaying() {
    const a = LossState.assaying;

    const skuInput = document.getElementById('loss-assay-sku');
    if (skuInput) {
      skuInput.oninput = (e) => { a.sku = e.target.value; };
    }

    const weightInput = document.getElementById('loss-assay-weight');
    if (weightInput) {
      weightInput.oninput = (e) => {
        a.weightGrams = parseFloat(e.target.value) || 0;
        const value = e.target.value;
        const focusId = document.activeElement?.id;
        render(document.getElementById('page'));
        setTimeout(() => {
          const el = document.getElementById(focusId);
          if (el) {
            el.value = value;
            el.focus();
          }
        }, 0);
      };
    }

    const certInput = document.getElementById('loss-assay-cert');
    if (certInput) {
      certInput.oninput = (e) => { a.certificateNumber = e.target.value; a.certificateNo = e.target.value; };
    }

    /* ✅ v2: Karat buttons — standard */
    document.querySelectorAll('[data-loss-claimed]').forEach(btn => {
      btn.onclick = () => {
        const k = Number(btn.dataset.lossClaimed);
        a.claimedKaratMode = 'standard';
        a.claimedKarat = k;
        a.claimedPurity = GMS.karatRatio(k);

        if (Math.abs(a.testedPurity - a.claimedPurity) > 0.05) {
          a.testedPurity = a.claimedPurity;
        }

        render(document.getElementById('page'));
      };
    });

    /* ✅ v2: Custom karat button */
    const customBtn = document.querySelector('[data-loss-claimed-custom]');
    if (customBtn) {
      customBtn.onclick = () => {
        a.claimedKaratMode = 'custom';
        a.claimedPurity = Number(a.claimedPurity) || (a.claimedCustomKarat / 1000);
        if (a.testedPurity < 0.5) a.testedPurity = a.claimedPurity;
        render(document.getElementById('page'));
      };
    }

    /* ✅ v2: Custom karat inputs */
    const ckInput = document.getElementById('loss-assay-custom-karat');
    const cpInput = document.getElementById('loss-assay-custom-purity');
    if (ckInput && cpInput) {
      ckInput.oninput = () => {
        let v = parseInt(ckInput.value) || 888;
        v = Math.max(GMS.KARAT_LIMITS.min, Math.min(GMS.KARAT_LIMITS.max, v));
        a.claimedCustomKarat = v;
        a.claimedPurity = GMS.round(v / 1000, 4);
        cpInput.value = a.claimedPurity.toFixed(4);

        const summaryEl = document.querySelector('.calc-list');
        if (summaryEl) render(document.getElementById('page'));
      };
      cpInput.oninput = () => {
        let v = parseFloat(cpInput.value) || 0.8880;
        v = Math.max(GMS.KARAT_LIMITS.minPurity,
                     Math.min(GMS.KARAT_LIMITS.maxPurity, v));
        a.claimedPurity = GMS.round(v, 4);
        a.claimedCustomKarat = Math.round(v * 1000);
        ckInput.value = a.claimedCustomKarat;
      };
    }

    const slider = document.getElementById('loss-assay-tested-slider');
    if (slider) {
      slider.oninput = (e) => {
        a.testedPurity = Number(e.target.value);
        updateAssayDisplay();
      };
    }

    const input = document.getElementById('loss-assay-tested-input');
    if (input) {
      input.oninput = (e) => {
        let v = Number(e.target.value);
        if (!isFinite(v)) return;
        v = Math.max(0.4, Math.min(1.0, v));
        a.testedPurity = v;

        const slider2 = document.getElementById('loss-assay-tested-slider');
        if (slider2) slider2.value = v;

        updateAssayDisplay();
      };
    }

    const feeMethod = document.getElementById('loss-assay-fee-method');
    if (feeMethod) {
      feeMethod.onchange = (e) => {
        a.feeMethod = e.target.value;
        const cashField = document.getElementById('loss-assay-fee-cash-field');
        const goldField = document.getElementById('loss-assay-fee-gold-field');
        if (cashField) cashField.style.display = a.feeMethod === 'cash' ? '' : 'none';
        if (goldField) goldField.style.display = a.feeMethod === 'gold' ? '' : 'none';
      };
    }

    const feeAmount = document.getElementById('loss-assay-fee-amount');
    if (feeAmount) {
      feeAmount.oninput = (e) => { a.feeAmount = parseFloat(e.target.value) || 0; };
    }

    const feeGold = document.getElementById('loss-assay-fee-gold');
    if (feeGold) {
      feeGold.oninput = (e) => { a.feeGoldGrams = parseFloat(e.target.value) || 0; };
    }

    const assayerInput = document.getElementById('loss-assay-assayer');
    if (assayerInput) {
      assayerInput.oninput = (e) => { a.assayerName = e.target.value; };
    }

    const notesInput = document.getElementById('loss-assay-notes');
    if (notesInput) {
      notesInput.oninput = (e) => { a.notes = e.target.value; };
    }

    const resetBtn = document.getElementById('loss-assay-reset');
    if (resetBtn) {
      resetBtn.onclick = () => {
        LossState.assaying = {
          sku: '',
          claimedKarat: 21,
          claimedPurity: GMS.karatRatio(21),
          claimedKaratMode: 'standard',
          claimedCustomKarat: 888,
          weightGrams: 0,
          testedPurity: GMS.karatRatio(21),
          assayerName: '',
          certificateNo: '',
          feeAmount: 0,
          feeMethod: 'cash',
          feeGoldGrams: 0,
          notes: '',
        };
        render(document.getElementById('page'));
      };
    }

    const saveBtn = document.getElementById('loss-assay-save');
    if (saveBtn) {
      saveBtn.onclick = () => saveAssay();
    }
  }

  function updateAssayDisplay() {
    const a = LossState.assaying;

    const disp = document.getElementById('loss-assay-tested-display');
    if (disp) disp.textContent = a.testedPurity.toFixed(4);

    const slider = document.getElementById('loss-assay-tested-slider');
    if (slider) slider.value = a.testedPurity;

    const input = document.getElementById('loss-assay-tested-input');
    if (input && document.activeElement !== input) {
      input.value = a.testedPurity;
    }
  }

  async function saveAssay() {
    const a = LossState.assaying;

    if (!a.weightGrams || a.weightGrams <= 0) {
      GMS.Beep?.error();
      return GMS.Toast.err('أدخل الوزن', 'الوزن مطلوب لإتمام الحفظ');
    }

    const claimedPure = GMS.round(a.weightGrams * a.claimedPurity, 4);
    const testedPure = GMS.round(a.weightGrams * a.testedPurity, 4);
    const pureDelta = GMS.round(testedPure - claimedPure, 4);
    const valueDelta = GMS.round(pureDelta * getPrice24(), 2);

    const karatPayload = GMS.buildKaratPayload({
      karat: a.claimedKaratMode === 'custom' ? null : a.claimedKarat,
      customKarat: a.claimedKaratMode === 'custom' ? a.claimedCustomKarat : null,
      purityRatio: a.claimedPurity,
      isCustom: a.claimedKaratMode === 'custom',
    });

    const record = {
      id: GMS.uid(),
      sku: a.sku || 'بدون كود',
      certificate_no: a.certificateNo,

      /* ✅ v2: حقول العيار */
      claimed_karat: karatPayload.karat,
      claimed_custom_karat: karatPayload.custom_karat,
      is_custom_karat: karatPayload.is_custom_karat,
      claimed_purity: karatPayload.purity_ratio,

      tested_purity: a.testedPurity,
      weight_grams: a.weightGrams,
      claimed_pure: claimedPure,
      tested_pure: testedPure,
      pure_delta: pureDelta,
      value_delta_egp: valueDelta,
      assayer_name: a.assayerName,
      fee_method: a.feeMethod,
      fee_amount: a.feeAmount,
      fee_gold_grams: a.feeMethod === 'gold'
        ? a.feeGoldGrams
        : GMS.round((a.feeAmount / getPrice24()), 4),
      notes: a.notes,
      created_at: new Date().toISOString(),
    };

    if (GMS.Supabase?.isReady()) {
      try {
        await GMS.Supabase.get()
          .from('assay_records')
          .insert({
            sku: record.sku,
            certificate_no: record.certificate_no,
            claimed_karat: record.claimed_karat,
            claimed_custom_karat: record.claimed_custom_karat,
            is_custom_karat: record.is_custom_karat,
            claimed_purity: record.claimed_purity,
            tested_purity: record.tested_purity,
            weight_grams: record.weight_grams,
            pure_delta: record.pure_delta,
            fee_method: record.fee_method,
            fee_amount: record.fee_amount,
            fee_gold_grams: record.fee_gold_grams,
            assayer_name: record.assayer_name,
          });
      } catch (e) {
        console.warn('[Loss] Assay Supabase insert failed:', e);
      }
    }

    LossState.assayRecords.unshift(record);
    saveRecords();

    if (Math.abs(pureDelta) > 0.01) {
      GMS.Beep?.warning();
      GMS.Toast.warn(
        `تعديل الوزن الصافي — ${record.sku}`,
        `الفرق: ${pureDelta > 0 ? '+' : ''}${GMS.gramFmt(pureDelta)} جم (${GMS.moneyFmt(valueDelta)} ج.م)`
      );
    } else {
      GMS.Beep?.success();
      const karatLabel = record.is_custom_karat
        ? `مخصص ${record.claimed_custom_karat}`
        : `${record.claimed_karat}K`;
      GMS.Toast.ok(
        'تم حفظ نتيجة الفحص',
        `${record.sku} · ${karatLabel} → ${record.tested_purity.toFixed(4)}`
      );
    }

    if (GMS.Audit) {
      await GMS.Audit.log('ASSAY', 'inventory', record.id,
        `فحص ششني ${record.sku} — ${record.is_custom_karat ? 'مخصص ' + record.claimed_custom_karat : record.claimed_karat + 'K'} → ${record.tested_purity.toFixed(4)}`,
        {
          sku: record.sku,
          pure_delta: pureDelta,
          is_custom_karat: record.is_custom_karat,
          claimed_custom_karat: record.claimed_custom_karat,
        });
    }

    LossState.assaying = {
      sku: '',
      claimedKarat: 21,
      claimedPurity: GMS.karatRatio(21),
      claimedKaratMode: 'standard',
      claimedCustomKarat: 888,
      weightGrams: 0,
      testedPurity: GMS.karatRatio(21),
      assayerName: '',
      certificateNo: '',
      feeAmount: 0,
      feeMethod: 'cash',
      feeGoldGrams: 0,
      notes: '',
    };
    render(document.getElementById('page'));
  }

  /* ═════════════════════════════════════════════════════════════════════
     §15 · BIND — POLISHING (v2)
     ═════════════════════════════════════════════════════════════════════ */

  function bindPolishing() {
    const p = LossState.polishing;

    if (!p.batchNo) {
      p.batchNo = GMS.batchNo('PL');
      const el = document.getElementById('loss-polish-batch-no');
      if (el) el.value = p.batchNo;
    }

    const karatSelect = document.getElementById('loss-polish-karat');
    const customPanel = document.getElementById('loss-polish-custom-panel');
    if (karatSelect && customPanel) {
      karatSelect.onchange = () => {
        const isCustom = karatSelect.value === 'custom';
        customPanel.style.display = isCustom ? '' : 'none';
      };
    }

    const ckInput = document.getElementById('loss-polish-custom-karat');
    const cpInput = document.getElementById('loss-polish-custom-purity');
    if (ckInput && cpInput) {
      ckInput.oninput = () => {
        let v = parseInt(ckInput.value) || 888;
        v = Math.max(GMS.KARAT_LIMITS.min, Math.min(GMS.KARAT_LIMITS.max, v));
        cpInput.value = GMS.round(v / 1000, 4).toFixed(4);
      };
      cpInput.oninput = () => {
        let v = parseFloat(cpInput.value) || 0.8880;
        v = Math.max(GMS.KARAT_LIMITS.minPurity,
                     Math.min(GMS.KARAT_LIMITS.maxPurity, v));
        ckInput.value = Math.round(v * 1000);
      };
    }

    const addBtn = document.getElementById('loss-polish-add');
    if (addBtn) {
      addBtn.onclick = () => {
        const sku = document.getElementById('loss-polish-sku')?.value.trim();
        const karatVal = karatSelect?.value || '21';
        const preWeight = parseFloat(document.getElementById('loss-polish-weight')?.value) || 0;

        if (preWeight <= 0) {
          GMS.Beep?.error();
          GMS.Toast.err('أدخل وزناً صحيحاً');
          return;
        }

        let pieceKarat = 21;
        let customKarat = null;
        let purity = GMS.karatRatio(21);
        let isCustom = false;

        if (karatVal === 'custom') {
          isCustom = true;
          customKarat = parseInt(ckInput?.value) || 888;
          purity = parseFloat(cpInput?.value) || 0.8880;
        } else {
          pieceKarat = Number(karatVal) || 21;
          purity = GMS.karatRatio(pieceKarat);
        }

        p.pieces.push({
          id: GMS.uid(),
          sku: sku || `SKU-${GMS.uid().toUpperCase().slice(0, 6)}`,
          karat: isCustom ? null : pieceKarat,
          custom_karat: customKarat,
          is_custom_karat: isCustom,
          purity_ratio: purity,
          preWeight: GMS.round(preWeight, 3),
        });

        const skuInput = document.getElementById('loss-polish-sku');
        if (skuInput) skuInput.value = '';
        const weightInput = document.getElementById('loss-polish-weight');
        if (weightInput) weightInput.value = '';

        render(document.getElementById('page'));
      };
    }

    const weightInput = document.getElementById('loss-polish-weight');
    if (weightInput) {
      weightInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          document.getElementById('loss-polish-add')?.click();
        }
      };
    }

    document.querySelectorAll('[data-loss-polish-rm]').forEach(btn => {
      btn.onclick = () => {
        const id = btn.dataset.lossPolishRm;
        p.pieces = p.pieces.filter(x => x.id !== id);
        render(document.getElementById('page'));
      };
    });

    const postInput = document.getElementById('loss-polish-post-weight');
    if (postInput) {
      postInput.oninput = (e) => {
        p.postWeight = parseFloat(e.target.value) || 0;
        updatePolishingGauge();
      };
    }

    const serviceType = document.getElementById('loss-polish-service');
    if (serviceType) {
      serviceType.onchange = (e) => { p.serviceType = e.target.value; };
    }

    const workshopInput = document.getElementById('loss-polish-workshop');
    if (workshopInput) {
      workshopInput.oninput = (e) => { p.workshopName = e.target.value; };
    }

    const notesInput = document.getElementById('loss-polish-notes');
    if (notesInput) {
      notesInput.oninput = (e) => { p.notes = e.target.value; };
    }

    const resetBtn = document.getElementById('loss-polish-reset');
    if (resetBtn) {
      resetBtn.onclick = async () => {
        if (!p.pieces.length && !p.postWeight) return;

        const ok = await GMS.Confirm.ask(
          'سيتم تفريغ بيانات الدفعة الحالية.',
          { title: 'تفريغ', okText: 'تفريغ', danger: true }
        );

        if (!ok) return;

        LossState.polishing = {
          batchNo: GMS.batchNo('PL'),
          pieces: [],
          postWeight: 0,
          serviceType: 'acid',
          workshopName: '',
          notes: '',
        };
        render(document.getElementById('page'));
      };
    }

    const saveBtn = document.getElementById('loss-polish-save');
    if (saveBtn) {
      saveBtn.onclick = () => savePolishBatch();
    }
  }

  function updatePolishingGauge() {
    const p = LossState.polishing;
    const preTotal = p.pieces.reduce((a, x) => a + Number(x.preWeight || 0), 0);
    const loss = Math.max(0, GMS.round(preTotal - Number(p.postWeight || 0), 3));
    const lossPct = GMS.lossPct(loss, preTotal);
    const evaluation = evaluateTolerance('polishing', lossPct);
    const markerPos = markerPosition(lossPct, 'polishing');
    const lossValue = GMS.round(loss * getPrice24(), 2);

    const gauge = document.getElementById('loss-polish-gauge');
    if (!gauge) return;

    gauge.className = `gauge ${evaluation.severity}`;
    gauge.innerHTML = `
      <div class="gauge-head">
        <div class="gauge-icon">
          <i data-lucide="${evaluation.severityMeta.icon}"></i>
        </div>
        <div>
          <div class="gauge-title">
            ${esc(evaluation.severityMeta.label)}
          </div>
          <div class="gauge-sub">
            ${esc(evaluation.interpretation)}
          </div>
        </div>
      </div>

      <div class="gauge-value">
        ${lossPct > 0 ? lossPct.toFixed(3) : '0.000'}
        <small>%</small>
      </div>
      <div class="gauge-meta">
        الخسس: <b class="mono">${GMS.gramFmt(loss)}</b> جم ·
        القيمة: <b class="mono">${GMS.moneyFmt(lossValue)}</b> ج.م
      </div>

      <div class="tolerance-bar">
        <div class="tolerance-zones">
          <div class="zone-natural"></div>
          <div class="zone-warning"></div>
          <div class="zone-suspicious"></div>
        </div>
        ${lossPct > 0 ? `
          <div class="tolerance-marker" style="left:${markerPos}%"></div>
        ` : ''}
      </div>
      <div class="tolerance-zones-labels">
        <span class="zl-natural">طبيعي</span>
        <span class="zl-warning">مراقبة</span>
        <span class="zl-suspicious">مرفوض</span>
      </div>
      <div class="tolerance-labels">
        <span>0%</span>
        <span class="mono">${LossState.tolerances.polishing.naturalMax}%</span>
        <span class="mono">${LossState.tolerances.polishing.warningMax}%</span>
        <span class="mono">${(LossState.tolerances.polishing.warningMax * 2).toFixed(2)}%</span>
      </div>
    `;
    window.lucide?.createIcons();

    const saveBtn = document.getElementById('loss-polish-save');
    if (saveBtn) {
      const pre = p.pieces.reduce((a, x) => a + Number(x.preWeight || 0), 0);
      saveBtn.disabled = !(pre > 0 && p.postWeight > 0);
    }
  }

  async function savePolishBatch() {
    const p = LossState.polishing;
    const preTotal = p.pieces.reduce((a, x) => a + Number(x.preWeight || 0), 0);
    const loss = Math.max(0, GMS.round(preTotal - Number(p.postWeight || 0), 3));
    const lossPct = GMS.lossPct(loss, preTotal);
    const evaluation = evaluateTolerance('polishing', lossPct);
    const lossValue = GMS.round(loss * getPrice24(), 2);

    if (evaluation.isSuspicious) {
      const ok = await GMS.Confirm.ask(
        `نسبة الخسس ${lossPct.toFixed(3)}% تتجاوز الحد المسموح ${LossState.tolerances.polishing.warningMax}%.\n` +
        `سيتم تحويل الدفعة إلى دفتر خسس التشغيل للمراجعة. متابعة؟`,
        {
          title: 'خسس مرتفع',
          okText: 'حفظ مع التنبيه',
          danger: true,
          icon: 'shield-alert',
        }
      );

      if (!ok) return;
    }

    let customCount = 0;
    let puritySum = 0;
    p.pieces.forEach(piece => {
      if (piece.is_custom_karat) customCount++;
      puritySum += Number(piece.purity_ratio || 0);
    });

    const avgPurity = p.pieces.length ? puritySum / p.pieces.length : 0;

    const record = {
      id: GMS.uid(),
      batch_no: p.batchNo,
      service_type: p.serviceType,
      service_label: GMS.POLISHING_SERVICES[p.serviceType]?.label || p.serviceType,
      workshop_name: p.workshopName,
      piece_count: p.pieces.length,
      pieces: p.pieces.slice(),
      pre_weight: GMS.round(preTotal, 3),
      post_weight: GMS.round(p.postWeight, 3),
      loss_weight: loss,
      loss_percentage: lossPct,
      loss_value_egp: lossValue,
      severity: evaluation.severity,
      is_suspicious: evaluation.isSuspicious,
      custom_karat_count: customCount,
      avg_purity: GMS.round(avgPurity, 4),
      notes: p.notes,
      created_at: new Date().toISOString(),
    };

    if (GMS.Supabase?.isReady()) {
      try {
        await GMS.Supabase.get()
          .from('polishing_batches')
          .insert({
            batch_no: record.batch_no,
            service_type: record.service_type,
            workshop_name: record.workshop_name,
            piece_count: record.piece_count,
            pre_weight: record.pre_weight,
            post_weight: record.post_weight,
            loss_weight: record.loss_weight,
            loss_percentage: record.loss_percentage,
            is_suspicious: record.is_suspicious,
            custom_karat_count: record.custom_karat_count,
            avg_purity: record.avg_purity,
            notes: record.notes,
          });
      } catch (e) {
        console.warn('[Loss] Polish Supabase insert failed:', e);
      }
    }

    LossState.polishRecords.unshift(record);
    saveRecords();

    if (evaluation.isSuspicious) {
      GMS.Beep?.error();
      GMS.Toast.err(
        `⚠ خسس مرتفع — ${record.batch_no}`,
        `النسبة: ${lossPct.toFixed(3)}% · القيمة: ${GMS.moneyFmt(lossValue)} ج.م`
      );
    } else if (evaluation.severity === 'warning') {
      GMS.Beep?.warning();
      GMS.Toast.warn(
        `تحذير — ${record.batch_no}`,
        `الخسس ${lossPct.toFixed(3)}% أعلى من الطبيعي`
      );
    } else {
      GMS.Beep?.complete();
      GMS.Toast.ok(
        'تم حفظ دفعة الصيانة',
        `${record.batch_no} · خسس ${lossPct.toFixed(3)}%`
      );
    }

    if (GMS.Audit) {
      await GMS.Audit.log('POLISHING_BATCH', 'inventory', record.id,
        `دفعة تحميم ${record.batch_no} — خسس ${lossPct.toFixed(3)}%`,
        {
          batch_no: record.batch_no,
          loss: record.loss_weight,
          custom_karat_count: customCount,
        });
    }

    LossState.polishing = {
      batchNo: GMS.batchNo('PL'),
      pieces: [],
      postWeight: 0,
      serviceType: 'acid',
      workshopName: '',
      notes: '',
    };
    render(document.getElementById('page'));
  }

  /* ═════════════════════════════════════════════════════════════════════
     §16 · BIND — LEDGER
     ═════════════════════════════════════════════════════════════════════ */

  function bindLedger() {
    const exportBtn = document.getElementById('loss-ledger-export');
    if (exportBtn) {
      exportBtn.onclick = () => exportLedger();
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §17 · MELTING RECEIPT MODAL
     ═════════════════════════════════════════════════════════════════════ */

  function showMeltingReceipt(record) {
    const meta = GMS.LOSS_SEVERITY[record.severity] || GMS.LOSS_SEVERITY.natural;

    GMS.Modal.open({
      title: `دفعة السبك — ${record.batch_no}`,
      icon: 'flame',
      size: 'lg',
      body: `
        <div style="text-align:center;padding:8px 0 18px">
          <div style="width:64px;height:64px;border-radius:20px;
                      background:${record.severity === 'suspicious'
                        ? 'linear-gradient(135deg,#ff6b60,#b3261e)'
                        : 'var(--gold-grad)'};
                      display:grid;place-items:center;margin:0 auto 12px;
                      color:${record.severity === 'suspicious' ? '#fff' : '#2a1f05'};
                      box-shadow:0 14px 34px -12px rgba(184,145,47,.9)">
            <i data-lucide="${meta.icon}" style="width:30px;height:30px"></i>
          </div>
          <h3 style="font-size:16px;margin-bottom:4px">
            ${esc(meta.label)}
          </h3>
          <div class="mono" style="font-size:12px;color:var(--muted);
                      font-weight:800">
            ${esc(record.batch_no)}
          </div>
        </div>

        <div class="calc-list">
          <div class="cl-row">
            <span class="k"><i data-lucide="package"></i> عدد القطع</span>
            <span class="v">${record.piece_count}</span>
          </div>
          ${record.custom_karat_count > 0 ? `
            <div class="cl-row">
              <span class="k">
                <i data-lucide="sliders-horizontal" style="color:var(--warn)"></i>
                قطع بعيار مخصص
              </span>
              <span class="v" style="color:var(--warn)">
                ${record.custom_karat_count}
              </span>
            </div>
          ` : ''}
          <div class="cl-row">
            <span class="k"><i data-lucide="scale"></i> الوزن قبل السبك</span>
            <span class="v">${GMS.gramFmt(record.pre_melt_weight)} جم</span>
          </div>
          <div class="cl-row">
            <span class="k"><i data-lucide="package-check"></i> الوزن بعد السبك</span>
            <span class="v">${GMS.gramFmt(record.post_melt_weight)} جم</span>
          </div>
          <div class="cl-row hi">
            <span class="k"><i data-lucide="flame"></i> الخسس</span>
            <span class="v">${GMS.gramFmt(record.loss_weight)} جم · ${Number(record.loss_percentage).toFixed(3)}%</span>
          </div>
          <div class="cl-row">
            <span class="k"><i data-lucide="coins"></i> القيمة التقديرية</span>
            <span class="v">${GMS.moneyFmt(record.loss_value_egp || 0)} ج.م</span>
          </div>
          <div class="cl-row">
            <span class="k"><i data-lucide="target"></i> عيار المسبوكة</span>
            <span class="v">${record.target_karat}K</span>
          </div>
        </div>

        ${record.is_suspicious ? `
          <div style="margin-top:14px;padding:12px 14px;border-radius:10px;
                      background:var(--danger-bg);color:var(--danger);
                      border:1px solid color-mix(in srgb,var(--danger) 35%,transparent);
                      font-size:12px;font-weight:800;line-height:1.6">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
              <i data-lucide="shield-alert" style="width:15px;height:15px"></i>
              <span>SUSPICIOUS_LOSS — تم تسجيل الدفعة للمراجعة</span>
            </div>
            <div style="font-weight:600;font-size:11.5px">
              تجاوزت نسبة الخسس الحد الآمن. سيتم إشعار المحاسب.
            </div>
          </div>
        ` : ''}
      `,
      footer: `
        <button class="btn" data-close>إغلاق</button>
        <button class="btn btn-primary" id="loss-melt-print">
          <i data-lucide="printer"></i> طباعة الإيصال
        </button>
      `,
      onMount: (el, close) => {
        el.querySelector('#loss-melt-print').onclick = () => {
          close();
          printMeltingReceipt(record);
        };
      },
    });
  }

  function printMeltingReceipt(record) {
    const root = document.getElementById('print-root');
    if (!root) return;

    const meta = GMS.LOSS_SEVERITY[record.severity] || GMS.LOSS_SEVERITY.natural;

    root.innerHTML = `
      <div class="receipt-print">
        <h2>${GMS.t('receipt.meltingTitle')}</h2>

        <div style="text-align:center;font-size:10pt;margin-bottom:5mm">
          ${esc(GMS.APP_CONFIG.NAME_AR)}
        </div>

        <hr>

        <div class="rp-line">
          <span>رقم الدفعة</span>
          <b>${esc(record.batch_no)}</b>
        </div>
        <div class="rp-line">
          <span>التاريخ</span>
          <b>${GMS.dateTimeAr(record.created_at)}</b>
        </div>
        <div class="rp-line">
          <span>الحالة</span>
          <b>${esc(meta.label)}</b>
        </div>

        <hr>

        <div class="rp-line">
          <span>عدد القطع</span>
          <b>${record.piece_count}</b>
        </div>
        ${record.custom_karat_count > 0 ? `
          <div class="rp-line">
            <span>قطع بعيار مخصص</span>
            <b>${record.custom_karat_count}</b>
          </div>
        ` : ''}
        <div class="rp-line">
          <span>الوزن قبل السبك</span>
          <b>${GMS.gramFmt(record.pre_melt_weight)} جم</b>
        </div>
        <div class="rp-line">
          <span>الوزن بعد السبك</span>
          <b>${GMS.gramFmt(record.post_melt_weight)} جم</b>
        </div>
        <div class="rp-line">
          <span>عيار المسبوكة</span>
          <b>${record.target_karat}K</b>
        </div>

        <hr>

        <div class="rp-line">
          <span>الخسس</span>
          <b>${GMS.gramFmt(record.loss_weight)} جم</b>
        </div>
        <div class="rp-line">
          <span>نسبة الخسس</span>
          <b>${Number(record.loss_percentage).toFixed(3)}%</b>
        </div>
        <div class="rp-line">
          <span>القيمة التقديرية</span>
          <b>${GMS.moneyFmt(record.loss_value_egp || 0)} ج.م</b>
        </div>

        ${record.notes ? `
          <hr>
          <div class="rp-line">
            <span>ملاحظات</span>
            <b>${esc(record.notes)}</b>
          </div>
        ` : ''}

        ${record.is_suspicious ? `
          <div style="margin-top:4mm;padding:2.5mm 3mm;background:#fdecea;
                      border:1px solid #b3261e;border-radius:1mm;
                      font-size:9pt;font-weight:800;color:#b3261e;
                      text-align:center">
            ⚠ تنبيه خسس غير طبيعي — تجاوز حد الأمان
          </div>
        ` : ''}

        <hr>

        <div style="text-align:center;font-size:9pt;margin-top:5mm">
          ${esc(meta.label)}
        </div>

        <div class="pr-sign" style="margin-top:8mm;display:flex;
                    justify-content:space-between;font-size:9pt">
          <div style="border-top:1px solid #000;padding-top:2mm;
                      min-width:30mm;text-align:center">
            توقيع الصائغ
          </div>
          <div style="border-top:1px solid #000;padding-top:2mm;
                      min-width:30mm;text-align:center">
            توقيع المسؤول
          </div>
        </div>
      </div>
    `;

    setTimeout(() => window.print(), 150);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §18 · EXPORT
     ═════════════════════════════════════════════════════════════════════ */

  function exportLedger() {
    if (!window.XLSX) {
      GMS.Toast.err('محرك Excel غير متاح');
      return;
    }

    const all = [
      ...LossState.meltingRecords.map(r => ({
        _type: 'melting',
        _label: 'سبك الكسر',
        batch_no: r.batch_no,
        created_at: r.created_at,
        piece_count: r.piece_count,
        custom_karat_count: r.custom_karat_count || 0,
        pre_weight: r.pre_melt_weight,
        post_weight: r.post_melt_weight,
        loss_weight: r.loss_weight,
        loss_percentage: r.loss_percentage,
        severity: r.severity,
        is_suspicious: r.is_suspicious,
        notes: r.notes,
      })),
      ...LossState.polishRecords.map(r => ({
        _type: 'polishing',
        _label: 'تحميم وجلخ',
        batch_no: r.batch_no,
        created_at: r.created_at,
        piece_count: r.piece_count,
        custom_karat_count: r.custom_karat_count || 0,
        pre_weight: r.pre_weight,
        post_weight: r.post_weight,
        loss_weight: r.loss_weight,
        loss_percentage: r.loss_percentage,
        severity: r.severity,
        is_suspicious: r.is_suspicious,
        notes: r.notes,
      })),
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    if (!all.length) {
      GMS.Toast.warn('لا توجد بيانات');
      return;
    }

    const rows = all.map(r => ({
      'التاريخ': GMS.dateTimeAr(r.created_at),
      'النوع': r._label,
      'رقم الدفعة': r.batch_no,
      'عدد القطع': r.piece_count,
      'قطع بعيار مخصص': r.custom_karat_count,
      'الوزن قبل (جم)': r.pre_weight,
      'الوزن بعد (جم)': r.post_weight,
      'الخسس (جم)': r.loss_weight,
      'النسبة %': r.loss_percentage,
      'القيمة (ج.م)': GMS.round(Number(r.loss_weight || 0) * getPrice24(), 2),
      'الحالة': r.severity === 'suspicious' ? 'حرج'
              : r.severity === 'warning' ? 'إنذار'
              : r.severity === 'low' ? 'منخفض'
              : 'طبيعي',
      'ملاحظات': r.notes || '',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 20 }, { wch: 14 }, { wch: 20 }, { wch: 10 },
      { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
      { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 30 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'خسس التشغيل');

    XLSX.writeFile(wb, `operational_loss_ledger_${GMS.todayISO()}.xlsx`);
    GMS.Toast.ok(`تم تصدير ${rows.length} حركة`);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §19 · CLEANUP
     ═════════════════════════════════════════════════════════════════════ */

  function cleanup() {
    LossState.unsubscribers.forEach(fn => {
      try { fn(); } catch (_) {}
    });
    LossState.unsubscribers = [];

    clearTimeout(LossState.timers.recalc);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §20 · INIT
     ═════════════════════════════════════════════════════════════════════ */

  function init() {
    loadTolerances();
    loadRecords();
  }

  /* ═════════════════════════════════════════════════════════════════════
     §21 · VIEW REGISTRATION
     ═════════════════════════════════════════════════════════════════════ */
  GMS.Views = GMS.Views || {};

  GMS.Views.loss = {
    render: (root) => {
      init();
      render(root);
    },
    cleanup,
    state: LossState,

    init,
    loadRecords,
    saveRecords,
    loadTolerances,
    saveTolerances,
    evaluateTolerance,

    saveMeltingBatch,
    saveAssay,
    savePolishBatch,

    printMeltingReceipt,

    export: exportLedger,
  };

  /* ═════════════════════════════════════════════════════════════════════
     §22 · LOADED CONFIRMATION
     ═════════════════════════════════════════════════════════════════════ */
  console.log(
    '%c🔥 Loss Management v2 loaded · Custom Karat support',
    'color:#b3261e;font-weight:800;font-size:12px;padding:1px 5px;' +
    'background:#fdecea;border-radius:4px;'
  );

  console.log(
    `%c⚗️ Melting · Assaying · Polishing · Tolerance Engine · Operational Ledger`,
    'color:#6b7a95;font-weight:700;font-size:11px;'
  );

  console.log(
    `%c🆕 v2: Custom Karat in all 3 operations · Purity Ratio · Custom karat count in records`,
    'color:#a55a00;font-weight:900;font-size:11px;'
  );

  /* ═════════════════════════════════════════════════════════════════════
     ✅ js/18-views-loss.js — نهاية الملف
     ═════════════════════════════════════════════════════════════════════ */

})();
