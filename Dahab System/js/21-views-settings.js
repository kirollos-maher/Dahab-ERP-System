/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ENTERPRISE — js/21-views-settings.js
   الإعدادات الشاملة:
     - إعدادات عامة (الفروع، الماركات)
     - المظهر واللغة والصوت
     - لوحة الأسعار وهامش الشراء
     - سياسة الإرجاع
     - حدود الخسس
     - إعدادات Supabase
     - إعدادات المزامنة والذاكرة
     - معلومات الجلسة والصلاحيات
     - الأعمدة المفضلة
     - نسخ احتياطي واستعادة
     - منطقة الخطر
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const GMS = window.GMS = window.GMS || {};

  /* ═════════════════════════════════════════════════════════════════════
     §1 · SETTINGS STATE
     ═════════════════════════════════════════════════════════════════════ */
  const SetState = {
    /* التبويب النشط */
    activeTab: 'general',

    /* البيانات المؤقتة */
    draft: {
      price24: 4500,
      buyMargin: 8,
      fullRefundDays: 14,
      partialRefundDays: 30,
      partialRefundPct: 90,
      noReturnBeyondDays: 30,
      creditWalletExpiryDays: 180,
      meltingNaturalMin: 0.10,
      meltingNaturalMax: 0.30,
      meltingWarningMax: 0.50,
      polishingNaturalMin: 0.05,
      polishingNaturalMax: 0.15,
      polishingWarningMax: 0.25,
      autoSyncInterval: 30,
      autoSyncEnabled: true,
      soundEnabled: true,
      theme: 'light',
      lang: 'ar',
      supabaseUrl: '',
      supabaseKey: '',
    },

    /* آخر نسخة محفوظة */
    saved: {},

    /* التعديلات غير المحفوظة */
    dirty: false,

    /* Statistiques */
    stats: {},

    /* المستمعون */
    unsubscribers: [],

    /* مؤقتات */
    timers: {
      checkDirty: null,
    },
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

  function readNumber(id, fallback = 0) {
    const el = document.getElementById(id);
    if (!el) return fallback;
    const v = parseFloat(el.value);
    return isFinite(v) ? v : fallback;
  }

  function readString(id, fallback = '') {
    const el = document.getElementById(id);
    return el ? String(el.value || '').trim() : fallback;
  }

  function readBool(id) {
    const el = document.getElementById(id);
    return el ? Boolean(el.checked) : false;
  }

  function cleanupListeners() {
    SetState.unsubscribers.forEach(fn => {
      try { fn(); } catch (_) {}
    });
    SetState.unsubscribers = [];
  }

  /* ═════════════════════════════════════════════════════════════════════
     §3 · DATA LOADING
     ───────────────────────────────────────────────────────────────────── */

  function loadSettings() {
    /* Price */
    try {
      const price = GMS.Cache?.getPrice();
      SetState.draft.price24 = Number(price?.price_24)
        || GMS.APP_CONFIG.DEFAULT_PRICE_24;
    } catch (_) {
      SetState.draft.price24 = GMS.APP_CONFIG.DEFAULT_PRICE_24;
    }

    /* Buy margin */
    try {
      const saved = Number(localStorage.getItem(GMS.LS_KEYS.BUY_MARGIN));
      if (isFinite(saved) && saved >= 0 && saved < 30) {
        SetState.draft.buyMargin = saved;
      }
    } catch (_) {}

    /* Return policy */
    try {
      const saved = JSON.parse(localStorage.getItem('gms.return.policy') || 'null');
      if (saved) {
        SetState.draft.fullRefundDays = saved.fullRefundDays || 14;
        SetState.draft.partialRefundDays = saved.partialRefundDays || 30;
        SetState.draft.partialRefundPct = saved.partialRefundPct || 90;
        SetState.draft.noReturnBeyondDays = saved.noReturnBeyondDays || 30;
        SetState.draft.creditWalletExpiryDays = saved.creditWalletExpiryDays || 180;
      }
    } catch (_) {}

    /* Tolerances */
    try {
      const saved = JSON.parse(localStorage.getItem(GMS.LS_KEYS.TOLERANCES) || 'null');
      if (saved) {
        if (saved.melting) {
          SetState.draft.meltingNaturalMin = saved.melting.naturalMin || 0.10;
          SetState.draft.meltingNaturalMax = saved.melting.naturalMax || 0.30;
          SetState.draft.meltingWarningMax = saved.melting.warningMax || 0.50;
        }
        if (saved.polishing) {
          SetState.draft.polishingNaturalMin = saved.polishing.naturalMin || 0.05;
          SetState.draft.polishingNaturalMax = saved.polishing.naturalMax || 0.15;
          SetState.draft.polishingWarningMax = saved.polishing.warningMax || 0.25;
        }
      }
    } catch (_) {}

    /* Auto-sync */
    try {
      const autoSyncEnabled = localStorage.getItem('gms.queue.autoSync');
      if (autoSyncEnabled !== null) {
        SetState.draft.autoSyncEnabled = JSON.parse(autoSyncEnabled);
      }

      const interval = Number(localStorage.getItem('gms.queue.autoSyncInterval'));
      if (isFinite(interval) && interval > 0) {
        SetState.draft.autoSyncInterval = interval;
      }
    } catch (_) {}

    /* Sound */
    SetState.draft.soundEnabled = GMS.Beep?.isEnabled?.() !== false;

    /* Theme */
    SetState.draft.theme = document.documentElement.getAttribute('data-theme') || 'light';

    /* Language */
    SetState.draft.lang = document.documentElement.getAttribute('lang') || 'ar';

    /* Supabase */
    SetState.draft.supabaseUrl = GMS.SyncConfig?.url || '';
    SetState.draft.supabaseKey = GMS.SyncConfig?.key || '';

    /* احفظ نسخة */
    SetState.saved = { ...SetState.draft };
    SetState.dirty = false;

    return SetState.draft;
  }

  function markDirty() {
    SetState.dirty = true;
    updateDirtyIndicator();
  }

  function updateDirtyIndicator() {
    const indicator = document.getElementById('settings-dirty-indicator');
    if (!indicator) return;

    if (SetState.dirty) {
      indicator.style.display = '';
      indicator.className = 'chip warn';
      indicator.innerHTML = `
        <i data-lucide="alert-circle" style="width:12px;height:12px"></i>
        <span>تعديلات غير محفوظة</span>
      `;
    } else {
      indicator.style.display = 'none';
    }
    window.lucide?.createIcons();
  }

  /* ═════════════════════════════════════════════════════════════════════
     §4 · RENDERERS — TABS
     ───────────────────────────────────────────────────────────────────── */

  function renderTabs() {
    const tabs = [
      { key: 'general',       label: 'عام',          icon: 'sliders-horizontal' },
      { key: 'appearance',    label: 'المظهر',        icon: 'palette' },
      { key: 'pricing',       label: 'الأسعار',       icon: 'trending-up' },
      { key: 'returns',       label: 'الإرجاع',       icon: 'rotate-ccw' },
      { key: 'losses',        label: 'الخسس',         icon: 'flame' },
      { key: 'sync',          label: 'المزامنة',      icon: 'refresh-cw' },
      { key: 'supabase',      label: 'Supabase',      icon: 'database' },
      { key: 'session',       label: 'الجلسة',        icon: 'user' },
      { key: 'backup',        label: 'النسخ الاحتياطي', icon: 'hard-drive' },
      { key: 'danger',        label: 'منطقة الخطر',   icon: 'alert-octagon' },
    ];

    return `
      <div class="tabs-bar" style="position:relative;top:0;padding:0;
                  background:transparent;border-bottom:1px solid var(--border);
                  margin-bottom:20px;overflow-x:auto">
        ${tabs.map(t => `
          <button class="tab ${SetState.activeTab === t.key ? 'active' : ''}"
                  data-set-tab="${t.key}">
            <i data-lucide="${t.icon}"></i>
            <span>${t.label}</span>
          </button>
        `).join('')}
      </div>
    `;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §5 · TAB: GENERAL
     ───────────────────────────────────────────────────────────────────── */

  function renderGeneralTab() {
    const d = SetState.draft;
    const branches = GMS.Demo?.getBranches() || [];
    const manufacturers = GMS.Demo?.getManufacturers() || [];

    return `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <!-- Left: Preferences -->
        <div>
          <div class="card">
            <div class="card-head">
              <h3>
                <i data-lucide="user-cog"></i>
                التفضيلات العامة
              </h3>
            </div>
            <div class="card-body">

              <div class="setting-item">
                <div class="si-body">
                  <div class="si-title">الوضع الافتراضي</div>
                  <div class="si-desc">الوضع الذي يفتح به النظام عند التشغيل</div>
                </div>
                <select id="set-default-theme" style="width:130px">
                  <option value="light" ${d.theme === 'light' ? 'selected' : ''}>
                    فاتح
                  </option>
                  <option value="dark" ${d.theme === 'dark' ? 'selected' : ''}>
                    داكن
                  </option>
                </select>
              </div>

              <div class="setting-item">
                <div class="si-body">
                  <div class="si-title">اللغة الافتراضية</div>
                  <div class="si-desc">لغة الواجهة عند فتح النظام</div>
                </div>
                <select id="set-default-lang" style="width:130px">
                  <option value="ar" ${d.lang === 'ar' ? 'selected' : ''}>
                    العربية
                  </option>
                  <option value="en" ${d.lang === 'en' ? 'selected' : ''}>
                    English
                  </option>
                </select>
              </div>

              <div class="setting-item">
                <div class="si-body">
                  <div class="si-title">التنبيهات الصوتية</div>
                  <div class="si-desc">تشغيل نغمات عند المسح والنجاح والأخطاء</div>
                </div>
                <label class="toggle-switch">
                  <input type="checkbox" id="set-sound-enabled"
                         ${d.soundEnabled ? 'checked' : ''}>
                  <span class="track"></span>
                </label>
              </div>

              <div class="setting-item">
                <div class="si-body">
                  <div class="si-title">المزامنة التلقائية</div>
                  <div class="si-desc">
                    مزامنة تلقائية كل
                    <b>${d.autoSyncInterval}</b> ثانية
                  </div>
                </div>
                <label class="toggle-switch">
                  <input type="checkbox" id="set-auto-sync"
                         ${d.autoSyncEnabled ? 'checked' : ''}>
                  <span class="track"></span>
                </label>
              </div>

              <div class="field" style="margin-top:14px">
                <label>فترة المزامنة التلقائية (ثانية)</label>
                <input type="number" id="set-auto-sync-interval"
                       step="5" min="10" max="300"
                       value="${d.autoSyncInterval}"
                       class="mono"
                       style="text-align:center;font-weight:800">
                <span class="hint">من 10 إلى 300 ثانية</span>
              </div>

            </div>
          </div>
        </div>

        <!-- Right: Branches & Manufacturers -->
        <div>
          <div class="card">
            <div class="card-head">
              <h3>
                <i data-lucide="building-2"></i>
                الفروع النشطة
              </h3>
              <div class="spacer" style="flex:1"></div>
              <span class="chip">${branches.length} فرع</span>
            </div>

            <div class="card-body" style="padding:8px 0;max-height:220px;
                        overflow-y:auto">
              ${branches.length ? branches.map(b => `
                <div style="padding:11px 16px;border-bottom:1px dashed var(--border);
                            display:flex;align-items:center;gap:11px">
                  <div style="width:34px;height:34px;border-radius:10px;
                              display:grid;place-items:center;flex-shrink:0;
                              background:var(--gold-soft);color:var(--warn)">
                    <i data-lucide="building-2" style="width:16px;height:16px"></i>
                  </div>
                  <div style="flex:1;min-width:0">
                    <div style="font-weight:800;font-size:12.5px">
                      ${GMS.esc(b.name)}
                    </div>
                    <div style="font-size:10.5px;color:var(--muted);
                                font-weight:600;margin-top:2px">
                      <span class="mono">${GMS.esc(b.code)}</span>
                      ${b.phone ? ` · ${GMS.esc(b.phone)}` : ''}
                    </div>
                  </div>
                  <span class="pill pill-green">نشط</span>
                </div>
              `).join('') : `
                <div class="empty" style="padding:30px 20px">
                  <i data-lucide="building-2"></i>
                  <p>لا توجد فروع</p>
                </div>
              `}
            </div>
          </div>

          <div class="card">
            <div class="card-head">
              <h3>
                <i data-lucide="factory"></i>
                الماركات المسجَّلة
              </h3>
              <div class="spacer" style="flex:1"></div>
              <span class="chip">${manufacturers.length} ماركة</span>
            </div>

            <div class="card-body" style="padding:8px 0;max-height:220px;
                        overflow-y:auto">
              ${manufacturers.length ? manufacturers.map(m => `
                <div style="padding:11px 16px;border-bottom:1px dashed var(--border);
                            display:flex;align-items:center;gap:11px">
                  <div style="width:34px;height:34px;border-radius:10px;
                              display:grid;place-items:center;flex-shrink:0;
                              background:var(--gold-grad);color:#2a1f05;
                              font-weight:900;font-size:13px">
                    ${GMS.esc(m.code)}
                  </div>
                  <div style="flex:1;min-width:0">
                    <div style="font-weight:800;font-size:12.5px">
                      ${GMS.esc(m.name)}
                    </div>
                    <div style="font-size:10.5px;color:var(--muted);
                                font-weight:600;margin-top:2px">
                      حرف: ${GMS.esc(m.letter || m.code)} ·
                      مصنعية افتراضية: ${GMS.moneyFmt(m.rate)} ج.م
                    </div>
                  </div>
                </div>
              `).join('') : `
                <div class="empty" style="padding:30px 20px">
                  <i data-lucide="factory"></i>
                  <p>لا توجد ماركات</p>
                </div>
              `}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §6 · TAB: APPEARANCE
     ───────────────────────────────────────────────────────────────────── */

  function renderAppearanceTab() {
    const d = SetState.draft;
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';

    return `
      <div style="max-width:760px;margin:0 auto">
        <div class="card">
          <div class="card-head">
            <h3>
              <i data-lucide="palette"></i>
              المظهر
            </h3>
            <div class="spacer" style="flex:1"></div>
            <span class="card-sub">الوضع الحالي: ${currentTheme === 'dark' ? 'داكن' : 'فاتح'}</span>
          </div>

          <div class="card-body">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
              <!-- Light -->
              <button type="button" data-theme-select="light"
                      style="padding:20px;border-radius:14px;cursor:pointer;
                             border:2px solid ${currentTheme === 'light' ? 'var(--primary)' : 'var(--border)'};
                             background:${currentTheme === 'light' ? 'var(--gold-soft)' : 'var(--surface-2)'};
                             text-align:start;transition:all .2s">
                <div style="width:100%;height:120px;border-radius:10px;
                            background:linear-gradient(135deg,#f7f9fc 0%,#eef1f7 100%);
                            border:1px solid #dfe5ef;
                            margin-bottom:14px;padding:12px;
                            display:flex;flex-direction:column;gap:8px">
                  <div style="height:8px;width:70%;background:#c8a24a;
                              border-radius:4px"></div>
                  <div style="height:6px;width:90%;background:#dfe5ef;
                              border-radius:4px"></div>
                  <div style="height:6px;width:50%;background:#dfe5ef;
                              border-radius:4px"></div>
                  <div style="flex:1;background:#fff;border-radius:6px;
                              margin-top:6px;border:1px solid #dfe5ef"></div>
                </div>
                <div style="display:flex;align-items:center;gap:8px;
                            font-weight:800;font-size:14px">
                  <i data-lucide="sun" style="width:16px;height:16px;
                             color:#c8a24a"></i>
                  الوضع الفاتح
                </div>
                <div style="font-size:11.5px;color:var(--muted);
                            font-weight:600;margin-top:3px">
                  مناسب للاستخدام النهاري وفي الإضاءة الساطعة
                </div>
              </button>

              <!-- Dark -->
              <button type="button" data-theme-select="dark"
                      style="padding:20px;border-radius:14px;cursor:pointer;
                             border:2px solid ${currentTheme === 'dark' ? 'var(--primary)' : 'var(--border)'};
                             background:${currentTheme === 'dark' ? 'var(--gold-soft)' : 'var(--surface-2)'};
                             text-align:start;transition:all .2s">
                <div style="width:100%;height:120px;border-radius:10px;
                            background:linear-gradient(135deg,#0f1729 0%,#080d18 100%);
                            border:1px solid #1f2c47;
                            margin-bottom:14px;padding:12px;
                            display:flex;flex-direction:column;gap:8px">
                  <div style="height:8px;width:70%;background:#d9b153;
                              border-radius:4px"></div>
                  <div style="height:6px;width:90%;background:#1f2c47;
                              border-radius:4px"></div>
                  <div style="height:6px;width:50%;background:#1f2c47;
                              border-radius:4px"></div>
                  <div style="flex:1;background:#131e34;border-radius:6px;
                              margin-top:6px;border:1px solid #1f2c47"></div>
                </div>
                <div style="display:flex;align-items:center;gap:8px;
                            font-weight:800;font-size:14px">
                  <i data-lucide="moon" style="width:16px;height:16px;
                             color:#d9b153"></i>
                  الوضع الداكن
                </div>
                <div style="font-size:11.5px;color:var(--muted);
                            font-weight:600;margin-top:3px">
                  مريح للعين في الإضاءة المنخفضة، يوفّر البطارية
                </div>
              </button>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <h3>
              <i data-lucide="languages"></i>
              اللغة
            </h3>
          </div>

          <div class="card-body">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
              <button type="button" data-lang-select="ar"
                      style="padding:20px;border-radius:14px;cursor:pointer;
                             border:2px solid ${d.lang === 'ar' ? 'var(--primary)' : 'var(--border)'};
                             background:${d.lang === 'ar' ? 'var(--gold-soft)' : 'var(--surface-2)'};
                             text-align:start;transition:all .2s">
                <div style="font-size:32px;margin-bottom:10px">🇪🇬</div>
                <div style="font-weight:800;font-size:14px">العربية</div>
                <div style="font-size:11.5px;color:var(--muted);
                            font-weight:600;margin-top:3px">
                  RTL · الخط: Cairo
                </div>
              </button>

              <button type="button" data-lang-select="en"
                      style="padding:20px;border-radius:14px;cursor:pointer;
                             border:2px solid ${d.lang === 'en' ? 'var(--primary)' : 'var(--border)'};
                             background:${d.lang === 'en' ? 'var(--gold-soft)' : 'var(--surface-2)'};
                             text-align:start;transition:all .2s">
                <div style="font-size:32px;margin-bottom:10px">🇬🇧</div>
                <div style="font-weight:800;font-size:14px">English</div>
                <div style="font-size:11.5px;color:var(--muted);
                            font-weight:600;margin-top:3px">
                  LTR · Font: Inter
                </div>
              </button>
            </div>

            <p style="font-size:11.5px;color:var(--muted);margin-top:14px;
                      line-height:1.7;font-weight:600">
              <i data-lucide="info"
                 style="width:12px;height:12px;display:inline;
                        vertical-align:-2px"></i>
              تغيير اللغة يُحدِّث كامل الواجهة فورياً بدون إعادة تحميل الصفحة.
            </p>
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <h3>
              <i data-lucide="volume-2"></i>
              الصوت
            </h3>
          </div>

          <div class="card-body">
            <div class="setting-item">
              <div class="si-body">
                <div class="si-title">التنبيهات الصوتية</div>
                <div class="si-desc">
                  نغمات للنجاح، الفشل، التحذير، المسح، والإتمام
                </div>
              </div>
              <label class="toggle-switch">
                <input type="checkbox" id="set-appearance-sound"
                       ${d.soundEnabled ? 'checked' : ''}>
                <span class="track"></span>
              </label>
            </div>

            <div style="margin-top:14px;padding:14px;
                        background:var(--surface-2);border-radius:11px;
                        border:1px solid var(--border)">
              <div style="font-size:11px;font-weight:800;color:var(--muted);
                          text-transform:uppercase;letter-spacing:.5px;
                          margin-bottom:10px">
                اختبار الأصوات
              </div>

              <div style="display:grid;grid-template-columns:repeat(3,1fr);
                          gap:8px">
                <button class="btn btn-sm" data-test-sound="success">
                  <i data-lucide="check-circle-2"
                     style="width:13px;height:13px;
                            color:var(--success)"></i>
                  نجاح
                </button>
                <button class="btn btn-sm" data-test-sound="error">
                  <i data-lucide="alert-circle"
                     style="width:13px;height:13px;
                            color:var(--danger)"></i>
                  خطأ
                </button>
                <button class="btn btn-sm" data-test-sound="warning">
                  <i data-lucide="alert-triangle"
                     style="width:13px;height:13px;
                            color:var(--warn)"></i>
                  تحذير
                </button>
                <button class="btn btn-sm" data-test-sound="info">
                  <i data-lucide="info"
                     style="width:13px;height:13px;
                            color:var(--info)"></i>
                  معلومة
                </button>
                <button class="btn btn-sm" data-test-sound="complete">
                  <i data-lucide="sparkles"
                     style="width:13px;height:13px;
                            color:var(--primary)"></i>
                  إتمام
                </button>
                <button class="btn btn-sm" data-test-sound="delete">
                  <i data-lucide="trash-2"
                     style="width:13px;height:13px;
                            color:var(--danger)"></i>
                  حذف
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §7 · TAB: PRICING
     ───────────────────────────────────────────────────────────────────── */

  function renderPricingTab() {
    const d = SetState.draft;
    const buy24 = GMS.round(d.price24 * (1 - d.buyMargin / 100), 2);

    return `
      <div style="max-width:900px;margin:0 auto">
        <div class="card">
          <div class="card-head">
            <h3>
              <i data-lucide="trending-up"></i>
              لوحة الأسعار
            </h3>
          </div>

          <div class="card-body">
            <div class="field" style="max-width:340px">
              <label>سعر جرام 24K الحالي (ج.م)</label>
              <input type="number" id="set-price24"
                     step="0.5" min="100"
                     value="${d.price24}"
                     class="big mono">
              <span class="hint">
                هذا السعر يُستخدم لحساب كل أسعار العيارات
              </span>
            </div>

            <div style="margin-top:20px;
                        padding:16px;background:var(--surface-2);
                        border-radius:12px;
                        border:1px solid var(--border)">
              <div style="font-size:11px;font-weight:800;color:var(--muted);
                          text-transform:uppercase;letter-spacing:.5px;
                          margin-bottom:12px">
                الأسعار المشتقة
              </div>

              <div style="display:grid;grid-template-columns:repeat(5,1fr);
                          gap:10px">
                ${GMS.KARAT_ORDER.map(k => {
                  const price = GMS.round(d.price24 * GMS.karatRatio(k), 2);
                  return `
                    <div style="padding:11px 13px;background:var(--surface);
                                border-radius:10px;
                                border:1px solid var(--border);
                                text-align:center">
                      <div style="font-size:11.5px;font-weight:800;
                                  color:var(--muted);margin-bottom:5px">
                        ${k}K
                      </div>
                      <div class="mono" style="font-size:15px;font-weight:900;
                                  color:var(--primary);
                                  letter-spacing:-.3px">
                        ${GMS.moneyFmt(price)}
                      </div>
                      <div style="font-size:10px;color:var(--muted);
                                  font-weight:700;margin-top:3px">
                        ${GMS.karatRatio(k).toFixed(4)}
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <h3>
              <i data-lucide="arrow-down-circle"></i>
              هامش شراء الكسر
            </h3>
            <div class="spacer" style="flex:1"></div>
            <span class="card-sub">
              سعر الشراء الحالي: ${GMS.moneyFmt(buy24)} ج.م
            </span>
          </div>

          <div class="card-body">
            <div class="grid-form">
              <div class="field">
                <label>نسبة هامش الشراء من سعر 24K (%)</label>
                <input type="number" id="set-buy-margin"
                       step="0.5" min="0" max="20"
                       value="${d.buyMargin}"
                       class="mono"
                       style="font-size:16px;font-weight:800;text-align:center">
                <span class="hint">
                  سعر شراء الكسر = سعر 24K × (1 − الهامش)
                </span>
              </div>

              <div class="field">
                <label>سعر شراء 24K (محسوب)</label>
                <input id="set-buy24-display" readonly
                       value="${GMS.moneyFmt(buy24)} ج.م"
                       class="mono"
                       style="font-size:16px;font-weight:900;text-align:center;
                              color:var(--success);
                              background:var(--surface-3)">
                <span class="hint">
                  يُستخدم في شراء الكسر ومستعمل
                </span>
              </div>
            </div>

            <div style="margin-top:16px;padding:14px;
                        background:var(--info-bg);border-radius:10px;
                        border-inline-start:3px solid var(--info);
                        font-size:11.5px;line-height:1.8;
                        color:var(--text-2);font-weight:600">
              <b style="color:var(--info)">ملاحظة:</b>
              الهامش الافتراضي في السوق المصري 6% – 10%.
              الهامش الأعلى يعني حماية أكبر ضد تقلبات السعر.
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §8 · TAB: RETURNS
     ───────────────────────────────────────────────────────────────────── */

  function renderReturnsTab() {
    const d = SetState.draft;

    return `
      <div style="max-width:800px;margin:0 auto">
        <div class="card">
          <div class="card-head">
            <h3>
              <i data-lucide="rotate-ccw"></i>
              سياسة الإرجاع
            </h3>
          </div>

          <div class="card-body">
            <div class="grid-form">
              <div class="field">
                <label>مدة الاسترجاع الكامل (يوم)</label>
                <input type="number" id="set-full-refund-days"
                       step="1" min="0" max="60"
                       value="${d.fullRefundDays}"
                       class="mono"
                       style="font-size:15px;font-weight:800;
                              text-align:center">
                <span class="hint">
                  استرجاع 100% من المبلغ خلال هذه الفترة
                </span>
              </div>

              <div class="field">
                <label>مدة الاسترجاع الجزئي (يوم)</label>
                <input type="number" id="set-partial-refund-days"
                       step="1" min="0" max="120"
                       value="${d.partialRefundDays}"
                       class="mono"
                       style="font-size:15px;font-weight:800;
                              text-align:center">
                <span class="hint">
                  استرجاع بنسبة مخفَّضة بين الفترتين
                </span>
              </div>

              <div class="field">
                <label>نسبة الاسترجاع الجزئي (%)</label>
                <input type="number" id="set-partial-refund-pct"
                       step="1" min="0" max="100"
                       value="${d.partialRefundPct}"
                       class="mono"
                       style="font-size:15px;font-weight:800;
                              text-align:center">
                <span class="hint">
                  يُطبَّق بعد انتهاء فترة الاسترجاع الكامل
                </span>
              </div>

              <div class="field">
                <label>الحد النهائي للإرجاع (يوم)</label>
                <input type="number" id="set-no-return-days"
                       step="1" min="0" max="365"
                       value="${d.noReturnBeyondDays}"
                       class="mono"
                       style="font-size:15px;font-weight:800;
                              text-align:center">
                <span class="hint">
                  بعد هذا الحد، تُرفض طلبات الإرجاع نهائياً
                </span>
              </div>
            </div>

            <div class="divider"></div>

            <div class="field">
              <label>صلاحية رصيد المتجر (يوم)</label>
              <input type="number" id="set-credit-expiry"
                     step="30" min="30" max="365"
                     value="${d.creditWalletExpiryDays}"
                     class="mono"
                     style="font-size:15px;font-weight:800;
                            text-align:center;max-width:280px">
              <span class="hint">
                مدة صلاحية رصيد المتجر المُصدر من المرتجعات
              </span>
            </div>

            <div style="margin-top:16px;padding:14px;
                        background:var(--warn-bg);border-radius:10px;
                        border-inline-start:3px solid var(--warn);
                        font-size:11.5px;line-height:1.8;
                        color:var(--text-2);font-weight:600">
              <b style="color:var(--warn)">ملاحظة:</b>
              السياسة الافتراضية للسوق المصري:
              استرجاع كامل خلال 14 يوم، جزئي حتى 30 يوم بنسبة 90%.
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §9 · TAB: LOSSES
     ───────────────────────────────────────────────────────────────────── */

  function renderLossesTab() {
    const d = SetState.draft;

    return `
      <div style="max-width:900px;margin:0 auto">
        <div class="card">
          <div class="card-head">
            <h3>
              <i data-lucide="flame"></i>
              حدود خسس السبك
            </h3>
            <div class="spacer" style="flex:1"></div>
            <span class="card-sub">
              المرجع: 0.1% – 0.3% طبيعي
            </span>
          </div>

          <div class="card-body">
            <div class="grid-form three">
              <div class="field">
                <label>الحد الطبيعي الأدنى (%)</label>
                <input type="number" id="set-melting-natural-min"
                       step="0.01" min="0"
                       value="${d.meltingNaturalMin}"
                       class="mono"
                       style="font-weight:800;text-align:center;
                              color:var(--success)">
              </div>

              <div class="field">
                <label>الحد الطبيعي الأقصى (%)</label>
                <input type="number" id="set-melting-natural-max"
                       step="0.01" min="0"
                       value="${d.meltingNaturalMax}"
                       class="mono"
                       style="font-weight:800;text-align:center;
                              color:var(--success)">
              </div>

              <div class="field">
                <label>حد التنبيه — غير طبيعي (%)</label>
                <input type="number" id="set-melting-warning-max"
                       step="0.01" min="0"
                       value="${d.meltingWarningMax}"
                       class="mono"
                       style="font-weight:800;text-align:center;
                              color:var(--danger)">
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <h3>
              <i data-lucide="sparkles"></i>
              حدود خسس التحميم والجلخ
            </h3>
            <div class="spacer" style="flex:1"></div>
            <span class="card-sub">
              المرجع: 0.05% – 0.15% طبيعي
            </span>
          </div>

          <div class="card-body">
            <div class="grid-form three">
              <div class="field">
                <label>الحد الطبيعي الأدنى (%)</label>
                <input type="number" id="set-polishing-natural-min"
                       step="0.01" min="0"
                       value="${d.polishingNaturalMin}"
                       class="mono"
                       style="font-weight:800;text-align:center;
                              color:var(--success)">
              </div>

              <div class="field">
                <label>الحد الطبيعي الأقصى (%)</label>
                <input type="number" id="set-polishing-natural-max"
                       step="0.01" min="0"
                       value="${d.polishingNaturalMax}"
                       class="mono"
                       style="font-weight:800;text-align:center;
                              color:var(--success)">
              </div>

              <div class="field">
                <label>حد التنبيه — غير طبيعي (%)</label>
                <input type="number" id="set-polishing-warning-max"
                       step="0.01" min="0"
                       value="${d.polishingWarningMax}"
                       class="mono"
                       style="font-weight:800;text-align:center;
                              color:var(--danger)">
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <h3>
              <i data-lucide="info"></i>
              تفسير الحدود
            </h3>
          </div>
          <div class="card-body">
            <div style="font-size:12px;line-height:1.9;color:var(--text-2);
                        font-weight:600">
              <div style="display:flex;gap:10px;margin-bottom:8px">
                <i data-lucide="check-circle-2"
                   style="width:16px;height:16px;
                          color:var(--success);flex-shrink:0;
                          margin-top:3px"></i>
                <div>
                  <b style="color:var(--text)">طبيعي:</b>
                  الخسس بين الحد الأدنى والأقصى — لا إجراء مطلوب.
                </div>
              </div>
              <div style="display:flex;gap:10px;margin-bottom:8px">
                <i data-lucide="alert-triangle"
                   style="width:16px;height:16px;
                          color:var(--warn);flex-shrink:0;
                          margin-top:3px"></i>
                <div>
                  <b style="color:var(--text)">مراقبة:</b>
                  بين الحد الأقصى الطبيعي وحد التنبيه — يستدعي مراجعة.
                </div>
              </div>
              <div style="display:flex;gap:10px">
                <i data-lucide="shield-alert"
                   style="width:16px;height:16px;
                          color:var(--danger);flex-shrink:0;
                          margin-top:3px"></i>
                <div>
                  <b style="color:var(--text)">غير طبيعي:</b>
                  تجاوز حد التنبيه — يُعلَّم كـ SUSPICIOUS_LOSS ويحتاج مراجعة فورية.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §10 · TAB: SYNC
     ───────────────────────────────────────────────────────────────────── */

  function renderSyncTab() {
    const d = SetState.draft;
    const syncStats = GMS.Sync?.getStats?.() || {};

    return `
      <div style="max-width:800px;margin:0 auto">
        <div class="card">
          <div class="card-head">
            <h3>
              <i data-lucide="refresh-cw"></i>
              إعدادات المزامنة
            </h3>
          </div>

          <div class="card-body">
            <div class="setting-item">
              <div class="si-body">
                <div class="si-title">المزامنة التلقائية</div>
                <div class="si-desc">
                  رفع طابور الفواتير تلقائياً عند عودة الاتصال
                </div>
              </div>
              <label class="toggle-switch">
                <input type="checkbox" id="set-sync-auto"
                       ${d.autoSyncEnabled ? 'checked' : ''}>
                <span class="track"></span>
              </label>
            </div>

            <div class="setting-item">
              <div class="si-body">
                <div class="si-title">فترة المزامنة (ثانية)</div>
                <div class="si-desc">
                  كل كم ثانية تُجرى المزامنة الدورية
                </div>
              </div>
              <input type="number" id="set-sync-interval"
                     step="5" min="10" max="300"
                     value="${d.autoSyncInterval}"
                     class="mono"
                     style="width:90px;text-align:center;
                            font-weight:800">
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <h3>
              <i data-lucide="activity"></i>
              إحصائيات المزامنة
            </h3>
          </div>

          <div class="card-body">
            <div class="calc-list">
              <div class="cl-row">
                <span class="k">
                  <i data-lucide="wifi"></i> حالة الاتصال
                </span>
                <span class="v" style="color:${GMS.Sync?.state?.online !== false
                          ? 'var(--success)' : 'var(--warn)'}">
                  ${GMS.Sync?.state?.online !== false ? 'متصل' : 'غير متصل'}
                </span>
              </div>
              <div class="cl-row">
                <span class="k">
                  <i data-lucide="radio"></i> حالة Realtime
                </span>
                <span class="v" style="color:${GMS.Realtime?.state?.channelStatus === 'connected'
                          ? 'var(--success)' : 'var(--warn)'}">
                  ${GMS.Realtime?.state?.channelStatus === 'connected' ? 'مباشر' : 'غير متصل'}
                </span>
              </div>
              <div class="cl-row">
                <span class="k">
                  <i data-lucide="clock"></i> آخر مزامنة
                </span>
                <span class="v" style="font-size:12px">
                  ${GMS.timeAgo(syncStats.lastSync)}
                </span>
              </div>
              <div class="cl-row">
                <span class="k">
                  <i data-lucide="package"></i> عدد الفواتير في الطابور
                </span>
                <span class="v">${GMS.intFmt(GMS.Queue?.state?.items?.length || 0)}</span>
              </div>
              <div class="cl-row">
                <span class="k">
                  <i data-lucide="check-circle-2"></i> إجمالي المزامنات الناجحة
                </span>
                <span class="v" style="color:var(--success)">
                  ${GMS.intFmt(syncStats.totalSyncs || 0)}
                </span>
              </div>
              <div class="cl-row">
                <span class="k">
                  <i data-lucide="x-circle"></i> المزامنات الفاشلة
                </span>
                <span class="v" style="color:var(--danger)">
                  ${GMS.intFmt(syncStats.failedSyncs || 0)}
                </span>
              </div>
            </div>

            <div style="margin-top:16px;display:flex;gap:9px;flex-wrap:wrap">
              <button class="btn btn-primary" id="set-force-delta-sync">
                <i data-lucide="git-compare"></i>
                مزامنة تفاضلية الآن
              </button>
              <button class="btn" id="set-force-full-sync">
                <i data-lucide="refresh-cw"></i>
                إعادة مزامنة كاملة
              </button>
              <button class="btn btn-info" id="set-push-queue">
                <i data-lucide="upload-cloud"></i>
                رفع الطابور الآن
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §11 · TAB: SUPABASE
     ───────────────────────────────────────────────────────────────────── */

  function renderSupabaseTab() {
    const d = SetState.draft;
    const ready = GMS.SyncConfig?.ready || false;
    const online = GMS.Sync?.state?.supabaseReady || false;

    return `
      <div style="max-width:800px;margin:0 auto">
        <div class="card">
          <div class="card-head">
            <h3>
              <i data-lucide="database"></i>
              اتصال Supabase
            </h3>
            <div class="spacer" style="flex:1"></div>
            <span class="chip ${online ? 'ok' : ready ? 'warn' : 'err'}">
              <i data-lucide="${online ? 'cloud-check' : ready ? 'cloud-off' : 'alert-circle'}"
                 style="width:12px;height:12px"></i>
              ${online ? 'متصل' : ready ? 'غير متصل' : 'غير مُهيّأ'}
            </span>
          </div>

          <div class="card-body">
            <div class="field" style="margin-bottom:14px">
              <label>Project URL</label>
              <input id="set-supabase-url"
                     value="${GMS.esc(d.supabaseUrl)}"
                     placeholder="https://xxxx.supabase.co"
                     dir="ltr" class="mono"
                     style="font-weight:700">
            </div>

            <div class="field" style="margin-bottom:14px">
              <label>Anon Public Key</label>
              <input id="set-supabase-key"
                     value="${GMS.esc(d.supabaseKey)}"
                     placeholder="eyJhbGciOi..."
                     dir="ltr" class="mono"
                     style="font-weight:700;font-size:11px">
            </div>

            <div style="padding:14px;background:var(--info-bg);
                        border-radius:10px;
                        border-inline-start:3px solid var(--info);
                        font-size:11.5px;line-height:1.8;
                        color:var(--text-2);font-weight:600">
              <b style="color:var(--info)">ملاحظات أمنية:</b>
              <ul style="margin:8px 0 0;padding-inline-start:18px;
                         line-height:1.9">
                <li>يُخزَّن المفتاح في <code>localStorage</code> محلياً فقط</li>
                <li>استخدم فقط مفتاح <code>anon public</code> في الواجهة</li>
                <li>لا تستخدم <code>service_role</code> key في المتصفح</li>
                <li>تأكد من تفعيل RLS على كل الجداول</li>
              </ul>
            </div>

            <div style="display:flex;gap:9px;margin-top:16px;flex-wrap:wrap">
              <button class="btn btn-primary" id="set-supabase-save">
                <i data-lucide="save"></i>
                حفظ وإعادة الاتصال
              </button>
              <button class="btn" id="set-supabase-test">
                <i data-lucide="plug"></i>
                اختبار الاتصال
              </button>
              <button class="btn btn-ghost" id="set-supabase-clear">
                <i data-lucide="trash-2"></i>
                حذف الإعدادات
              </button>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <h3>
              <i data-lucide="list-tree"></i>
              الجداول المتوقعة
            </h3>
          </div>

          <div class="card-body">
            <div style="display:grid;
                        grid-template-columns:repeat(auto-fill,minmax(180px,1fr));
                        gap:8px">
              ${Object.entries(GMS.SUPABASE_CONFIG.TABLES).map(([key, table]) => `
                <div style="padding:9px 12px;background:var(--surface-2);
                            border-radius:9px;
                            border:1px solid var(--border);
                            font-family:var(--font-mono);
                            font-size:11px;font-weight:700;
                            display:flex;align-items:center;gap:7px">
                  <i data-lucide="table"
                     style="width:12px;height:12px;
                            color:var(--primary);flex-shrink:0"></i>
                  ${table}
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §12 · TAB: SESSION
     ───────────────────────────────────────────────────────────────────── */

  function renderSessionTab() {
    const profile = GMS.Auth?.profile;
    const user = GMS.Auth?.user;
    const perms = GMS.Auth?.getPermissions?.() || [];

    if (!profile) {
      return `
        <div class="card">
          <div class="card-body">
            <div class="empty" style="padding:60px 20px">
              <i data-lucide="user-x"></i>
              <p>لا توجد جلسة نشطة</p>
            </div>
          </div>
        </div>
      `;
    }

    const roleMeta = GMS.ROLES[profile.role] || { label: profile.role, icon: 'user' };

    return `
      <div style="max-width:900px;margin:0 auto">

        <!-- Profile card -->
        <div class="card">
          <div class="card-head">
            <h3>
              <i data-lucide="user-circle"></i>
              معلومات الحساب
            </h3>
          </div>

          <div class="card-body">
            <div style="display:flex;align-items:center;gap:16px;
                        padding:16px;background:var(--surface-2);
                        border-radius:14px;margin-bottom:18px">
              <div style="width:64px;height:64px;border-radius:50%;
                          display:grid;place-items:center;flex-shrink:0;
                          background:var(--gold-grad);color:#2a1f05;
                          font-weight:900;font-size:22px">
                ${GMS.esc(GMS.initials(profile.full_name || user?.email || '?'))}
              </div>

              <div style="flex:1;min-width:0">
                <div style="font-size:17px;font-weight:900;
                            letter-spacing:-.3px">
                  ${GMS.esc(profile.full_name || '—')}
                </div>
                <div style="font-size:12.5px;color:var(--muted);
                            font-weight:700;margin-top:4px">
                  <span class="mono">${GMS.esc(profile.email || user?.email || '—')}</span>
                </div>
                <div style="display:flex;gap:7px;margin-top:9px;flex-wrap:wrap">
                  <span class="pill pill-gold">
                    <i data-lucide="${roleMeta.icon}"
                       style="width:10px;height:10px"></i>
                    ${GMS.esc(roleMeta.label)}
                  </span>
                  ${profile.branch_id ? `
                    <span class="pill pill-blue">
                      <i data-lucide="building-2"
                         style="width:10px;height:10px"></i>
                      ${GMS.esc(
                        GMS.Demo?.getBranches()?.find(b => b.id === profile.branch_id)?.name
                        || '—'
                      )}
                    </span>
                  ` : `
                    <span class="pill pill-violet">
                      <i data-lucide="globe"
                         style="width:10px;height:10px"></i>
                      كل الفروع
                    </span>
                  `}
                </div>
              </div>
            </div>

            <div class="grid-form">
              <div class="field">
                <label>معرّف المستخدم</label>
                <input readonly value="${GMS.esc(user?.id || '—')}"
                       class="mono"
                       style="font-size:11px;background:var(--surface-3)">
              </div>

              <div class="field">
                <label>الهاتف</label>
                <input readonly value="${GMS.esc(profile.phone || '—')}"
                       class="mono"
                       style="background:var(--surface-3)">
              </div>

              <div class="field">
                <label>آخر تسجيل دخول</label>
                <input readonly
                       value="${profile.last_login ? GMS.dateTimeAr(profile.last_login) : '—'}"
                       style="background:var(--surface-3)">
              </div>

              <div class="field">
                <label>الحالة</label>
                <input readonly value="${profile.is_active ? 'نشط' : 'موقوف'}"
                       style="background:var(--surface-3);
                              color:${profile.is_active ? 'var(--success)' : 'var(--danger)'};
                              font-weight:800">
              </div>
            </div>
          </div>
        </div>

        <!-- Permissions -->
        <div class="card">
          <div class="card-head">
            <h3>
              <i data-lucide="shield-check"></i>
              الصلاحيات المُمنوحة
            </h3>
            <div class="spacer" style="flex:1"></div>
            <span class="chip info">${perms.length} صلاحية</span>
          </div>

          <div class="card-body">
            <div style="display:grid;
                        grid-template-columns:repeat(auto-fill,minmax(220px,1fr));
                        gap:9px">
              ${perms.map(p => `
                <div style="padding:10px 12px;background:var(--success-bg);
                            border-radius:9px;
                            border:1px solid color-mix(in srgb,var(--success) 25%,transparent);
                            display:flex;align-items:center;gap:8px;
                            font-size:11.5px;font-weight:700;
                            color:var(--success)">
                  <i data-lucide="check-circle-2"
                     style="width:13px;height:13px;flex-shrink:0"></i>
                  <span>${GMS.esc(GMS.getPermLabel(p))}</span>
                </div>
              `).join('')}
            </div>
          </div>
        </div>

        <!-- Session Actions -->
        <div class="card">
          <div class="card-head">
            <h3>
              <i data-lucide="log-out"></i>
              إجراءات الجلسة
            </h3>
          </div>

          <div class="card-body">
            <div style="display:flex;gap:9px;flex-wrap:wrap">
              <button class="btn" id="set-refresh-session">
                <i data-lucide="refresh-cw"></i>
                تجديد الجلسة
              </button>
              <button class="btn btn-danger" id="set-logout">
                <i data-lucide="log-out"></i>
                تسجيل الخروج
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §13 · TAB: BACKUP
     ───────────────────────────────────────────────────────────────────── */

  function renderBackupTab() {
    const lsSize = GMS.LS?.size?.() || 0;
    const lsCount = Object.keys(localStorage).filter(k => k.startsWith('gms.')).length;
    const idbCount = GMS.IDB?.state?.inventoryCount || 0;
    const queueCount = GMS.Queue?.state?.items?.length || 0;

    return `
      <div style="max-width:800px;margin:0 auto">
        <div class="card">
          <div class="card-head">
            <h3>
              <i data-lucide="hard-drive"></i>
              استخدام التخزين
            </h3>
          </div>

          <div class="card-body">
            <div class="calc-list">
              <div class="cl-row">
                <span class="k">
                  <i data-lucide="database"></i> LocalStorage
                </span>
                <span class="v" style="font-size:12px">
                  ${GMS.bytesFmt(lsSize)} · ${lsCount} مفتاح
                </span>
              </div>
              <div class="cl-row">
                <span class="k">
                  <i data-lucide="package"></i> IndexedDB — أصناف
                </span>
                <span class="v" style="font-size:12px">
                  ${GMS.intFmt(idbCount)} صنف
                </span>
              </div>
              <div class="cl-row">
                <span class="k">
                  <i data-lucide="package-open"></i> طابور المزامنة
                </span>
                <span class="v" style="font-size:12px">
                  ${GMS.intFmt(queueCount)} فاتورة
                </span>
              </div>
            </div>

            <div style="margin-top:16px;padding:14px;
                        background:var(--info-bg);border-radius:10px;
                        border-inline-start:3px solid var(--info);
                        font-size:11.5px;line-height:1.8;
                        color:var(--text-2);font-weight:600">
              <b style="color:var(--info)">ملاحظة:</b>
              النسخة الاحتياطية تحتوي على:
              الإعدادات، الموردين المحليين، طابور المزامنة، وسجل الحركات.
              <b>لا</b> تحتوي على المخزون الكامل (يُزامَن من Supabase).
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <h3>
              <i data-lucide="download"></i>
              تصدير النسخة الاحتياطية
            </h3>
          </div>

          <div class="card-body">
            <p style="font-size:12.5px;color:var(--text-2);
                      margin:0 0 14px;line-height:1.7;font-weight:600">
              احفظ نسخة كاملة من إعداداتك وبياناتك المحلية في ملف JSON.
              يمكنك استعادتها على أي جهاز آخر.
            </p>

            <div style="display:flex;gap:9px;flex-wrap:wrap">
              <button class="btn btn-primary" id="set-backup-export">
                <i data-lucide="download"></i>
                تصدير نسخة احتياطية (JSON)
              </button>
              <button class="btn" id="set-backup-export-excel">
                <i data-lucide="file-spreadsheet"></i>
                تصدير البيانات (Excel)
              </button>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <h3>
              <i data-lucide="upload"></i>
              استعادة النسخة الاحتياطية
            </h3>
          </div>

          <div class="card-body">
            <p style="font-size:12.5px;color:var(--text-2);
                      margin:0 0 14px;line-height:1.7;font-weight:600">
              استرجع نسخة سابقة. سيتم دمج البيانات مع الحالية.
            </p>

            <div class="dropzone" id="set-backup-dropzone"
                 style="padding:30px 20px">
              <div class="dz-icon" style="width:54px;height:54px;
                          border-radius:14px">
                <i data-lucide="upload-cloud" style="width:24px;height:24px"></i>
              </div>
              <h3 style="font-size:14px;margin-bottom:5px">
                اسحب ملف النسخة هنا
              </h3>
              <p style="font-size:11.5px">أو انقر للاختيار</p>
              <div style="margin-top:10px">
                <span class="chip" style="font-size:10.5px">.json</span>
              </div>
            </div>

            <input type="file" id="set-backup-file-input"
                   accept=".json" style="display:none">
          </div>
        </div>
      </div>
    `;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §14 · TAB: DANGER
     ───────────────────────────────────────────────────────────────────── */

  function renderDangerTab() {
    return `
      <div style="max-width:800px;margin:0 auto">
        <div class="card" style="border-color:var(--danger-border)">
          <div class="card-head" style="background:var(--danger-bg);
                      border-bottom-color:var(--danger-border)">
            <h3 style="color:var(--danger)">
              <i data-lucide="alert-octagon"
                 style="color:var(--danger)"></i>
              منطقة الخطر
            </h3>
          </div>

          <div class="card-body">
            <p style="font-size:12.5px;line-height:1.8;
                      color:var(--text-2);font-weight:600;
                      margin:0 0 20px">
              الإجراءات في هذا القسم <b style="color:var(--danger)">لا يمكن التراجع عنها</b>.
              تأكد من عمل نسخة احتياطية قبل المتابعة.
            </p>

            <!-- Clear LocalStorage -->
            <div style="padding:14px 16px;background:var(--surface-2);
                        border-radius:11px;margin-bottom:12px;
                        border:1px solid var(--border);
                        display:flex;align-items:center;gap:14px">
              <div style="width:42px;height:42px;border-radius:11px;
                          display:grid;place-items:center;flex-shrink:0;
                          background:var(--warn-bg);color:var(--warn)">
                <i data-lucide="hard-drive" style="width:20px;height:20px"></i>
              </div>
              <div style="flex:1;min-width:0">
                <div style="font-weight:800;font-size:13px">
                  تفريغ الذاكرة المحلية
                </div>
                <div style="font-size:11.5px;color:var(--muted);
                            font-weight:600;margin-top:3px">
                  حذف جميع مفاتيح LocalStorage وإعدادات النظام.
                  لن يتأثر المخزون أو الفواتير في السحابة.
                </div>
              </div>
              <button class="btn btn-danger btn-sm" id="danger-clear-ls">
                <i data-lucide="trash-2"></i>
                تفريغ
              </button>
            </div>

            <!-- Clear IndexedDB -->
            <div style="padding:14px 16px;background:var(--surface-2);
                        border-radius:11px;margin-bottom:12px;
                        border:1px solid var(--border);
                        display:flex;align-items:center;gap:14px">
              <div style="width:42px;height:42px;border-radius:11px;
                          display:grid;place-items:center;flex-shrink:0;
                          background:var(--danger-bg);color:var(--danger)">
                <i data-lucide="database" style="width:20px;height:20px"></i>
              </div>
              <div style="flex:1;min-width:0">
                <div style="font-weight:800;font-size:13px">
                  حذف قاعدة IndexedDB
                </div>
                <div style="font-size:11.5px;color:var(--muted);
                            font-weight:600;margin-top:3px">
                  حذف المخزون المحلي وطابور المزامنة بالكامل.
                  سيحتاج النظام إلى مزامنة كاملة بعد ذلك.
                </div>
              </div>
              <button class="btn btn-danger btn-sm" id="danger-nuke-idb">
                <i data-lucide="trash-2"></i>
                حذف
              </button>
            </div>

            <!-- Clear Queue -->
            <div style="padding:14px 16px;background:var(--surface-2);
                        border-radius:11px;margin-bottom:12px;
                        border:1px solid var(--border);
                        display:flex;align-items:center;gap:14px">
              <div style="width:42px;height:42px;border-radius:11px;
                          display:grid;place-items:center;flex-shrink:0;
                          background:var(--danger-bg);color:var(--danger)">
                <i data-lucide="package-open"
                   style="width:20px;height:20px"></i>
              </div>
              <div style="flex:1;min-width:0">
                <div style="font-weight:800;font-size:13px">
                  تفريغ طابور المزامنة
                </div>
                <div style="font-size:11.5px;color:var(--muted);
                            font-weight:600;margin-top:3px">
                  حذف جميع الفواتير المُعلَّقة بدون رفعها للخادم.
                  <b style="color:var(--danger)">ستُفقد البيانات</b>.
                </div>
              </div>
              <button class="btn btn-danger btn-sm" id="danger-clear-queue">
                <i data-lucide="trash-2"></i>
                تفريغ
              </button>
            </div>

            <!-- Full Reset -->
            <div style="padding:16px;background:var(--danger-bg);
                        border-radius:11px;
                        border:1.5px solid var(--danger-border)">
              <div style="display:flex;align-items:center;gap:14px">
                <div style="width:48px;height:48px;border-radius:12px;
                            display:grid;place-items:center;flex-shrink:0;
                            background:var(--danger);color:#fff">
                  <i data-lucide="skull" style="width:24px;height:24px"></i>
                </div>
                <div style="flex:1;min-width:0">
                  <div style="font-weight:900;font-size:14px;
                              color:var(--danger)">
                    إعادة ضبط كاملة للنظام
                  </div>
                  <div style="font-size:11.5px;color:var(--text-2);
                              font-weight:600;margin-top:4px;
                              line-height:1.7">
                    حذف <b>كل</b> البيانات المحلية:
                    LocalStorage، IndexedDB، الإعدادات، الطابور، سجل الحركات.
                    سيسجّل النظام خروجك فوراً.
                    <b>لا يمكن التراجع.</b>
                  </div>
                </div>
              </div>

              <button class="btn btn-danger btn-block btn-lg"
                      style="margin-top:14px" id="danger-full-reset">
                <i data-lucide="skull"></i>
                إعادة ضبط كاملة
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §15 · MAIN RENDER
     ───────────────────────────────────────────────────────────────────── */

  function render(root) {
    /* Guard */
    if (GMS.Auth && !GMS.Auth.can('viewDashboard')) {
      root.innerHTML = GMS.Guard.denied(
        'الإعدادات محجوبة',
        'لا تملك صلاحية الوصول للإعدادات.'
      );
      window.lucide?.createIcons();
      return;
    }

    /* Load current settings */
    if (!Object.keys(SetState.saved).length) {
      loadSettings();
    }

    let tabContent = '';

    switch (SetState.activeTab) {
      case 'general':    tabContent = renderGeneralTab(); break;
      case 'appearance': tabContent = renderAppearanceTab(); break;
      case 'pricing':    tabContent = renderPricingTab(); break;
      case 'returns':    tabContent = renderReturnsTab(); break;
      case 'losses':     tabContent = renderLossesTab(); break;
      case 'sync':       tabContent = renderSyncTab(); break;
      case 'supabase':   tabContent = renderSupabaseTab(); break;
      case 'session':    tabContent = renderSessionTab(); break;
      case 'backup':     tabContent = renderBackupTab(); break;
      case 'danger':     tabContent = renderDangerTab(); break;
      default:           tabContent = renderGeneralTab(); break;
    }

    root.innerHTML = `
      <div class="page-header">
        <h2>
          <i data-lucide="settings"></i>
          ${GMS.t('settings.title')}
        </h2>
        <p>${GMS.t('settings.subtitle')}</p>
      </div>

      ${renderTabs()}

      ${tabContent}

      <!-- Sticky Footer -->
      <div id="settings-sticky-footer"
           style="position:sticky;bottom:16px;z-index:20;
                  margin-top:20px;
                  background:color-mix(in srgb,var(--surface) 92%,transparent);
                  backdrop-filter:blur(14px);
                  border:1px solid var(--border);
                  border-radius:14px;
                  box-shadow:var(--shadow-2);
                  padding:14px 20px;
                  display:flex;align-items:center;gap:12px;
                  flex-wrap:wrap">
        <span id="settings-dirty-indicator"
              class="chip warn" style="display:none">
          <i data-lucide="alert-circle" style="width:12px;height:12px"></i>
          <span>تعديلات غير محفوظة</span>
        </span>

        <div class="spacer" style="flex:1"></div>

        <button class="btn btn-ghost" id="settings-reset">
          <i data-lucide="rotate-ccw"></i>
          إلغاء التعديلات
        </button>

        <button class="btn btn-primary btn-lg" id="settings-save">
          <i data-lucide="save"></i>
          حفظ الإعدادات
        </button>
      </div>
    `;

    window.lucide?.createIcons();
    bindControls();
    updateDirtyIndicator();
  }

  /* ═════════════════════════════════════════════════════════════════════
     §16 · BIND CONTROLS
     ───────────────────────────────────────────────────────────────────── */

  function bindControls() {
    /* Tabs */
    document.querySelectorAll('[data-set-tab]').forEach(tab => {
      tab.onclick = async () => {
        const key = tab.dataset.setTab;
        if (key === SetState.activeTab) return;

        /* Warn if dirty */
        if (SetState.dirty) {
          const ok = await GMS.Confirm.ask(
            'لديك تعديلات غير محفوظة. هل تريد المتابعة بدون حفظ؟',
            { title: 'تعديلات غير محفوظة', okText: 'متابعة', danger: true }
          );
          if (!ok) return;
          SetState.dirty = false;
          loadSettings();
        }

        SetState.activeTab = key;
        render(document.getElementById('page'));
      };
    });

    /* Save & Reset */
    const saveBtn = document.getElementById('settings-save');
    if (saveBtn) saveBtn.onclick = () => saveAll();

    const resetBtn = document.getElementById('settings-reset');
    if (resetBtn) resetBtn.onclick = () => resetAll();

    /* Per tab */
    switch (SetState.activeTab) {
      case 'general':    bindGeneralTab(); break;
      case 'appearance': bindAppearanceTab(); break;
      case 'pricing':    bindPricingTab(); break;
      case 'returns':    bindReturnsTab(); break;
      case 'losses':     bindLossesTab(); break;
      case 'sync':       bindSyncTab(); break;
      case 'supabase':   bindSupabaseTab(); break;
      case 'session':    bindSessionTab(); break;
      case 'backup':     bindBackupTab(); break;
      case 'danger':     bindDangerTab(); break;
    }

    /* Warn on navigate away if dirty */
    const beforeUnload = (e) => {
      if (SetState.dirty) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);

    SetState.unsubscribers.push(() => {
      window.removeEventListener('beforeunload', beforeUnload);
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §17 · BIND GENERAL TAB
     ───────────────────────────────────────────────────────────────────── */

  function bindGeneralTab() {
    const themeSelect = document.getElementById('set-default-theme');
    if (themeSelect) {
      themeSelect.onchange = () => {
        SetState.draft.theme = themeSelect.value;
        markDirty();
      };
    }

    const langSelect = document.getElementById('set-default-lang');
    if (langSelect) {
      langSelect.onchange = () => {
        SetState.draft.lang = langSelect.value;
        markDirty();
      };
    }

    const soundToggle = document.getElementById('set-sound-enabled');
    if (soundToggle) {
      soundToggle.onchange = () => {
        SetState.draft.soundEnabled = soundToggle.checked;
        /* Apply immediately */
        GMS.Beep?.setEnabled?.(soundToggle.checked);
        markDirty();
      };
    }

    const autoSyncToggle = document.getElementById('set-auto-sync');
    if (autoSyncToggle) {
      autoSyncToggle.onchange = () => {
        SetState.draft.autoSyncEnabled = autoSyncToggle.checked;
        markDirty();
      };
    }

    const intervalInput = document.getElementById('set-auto-sync-interval');
    if (intervalInput) {
      intervalInput.oninput = () => {
        let v = readNumber('set-auto-sync-interval', 30);
        v = Math.max(10, Math.min(300, v));
        SetState.draft.autoSyncInterval = v;
        markDirty();
      };
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §18 · BIND APPEARANCE TAB
     ───────────────────────────────────────────────────────────────────── */

  function bindAppearanceTab() {
    /* Theme cards */
    document.querySelectorAll('[data-theme-select]').forEach(btn => {
      btn.onclick = () => {
        const theme = btn.dataset.themeSelect;

        document.documentElement.setAttribute('data-theme', theme);
        try {
          localStorage.setItem('gms.theme', theme);
        } catch (_) {}

        SetState.draft.theme = theme;
        SetState.dirty = true;

        GMS.Beep?.info?.();
        render(document.getElementById('page'));
      };
    });

    /* Language cards */
    document.querySelectorAll('[data-lang-select]').forEach(btn => {
      btn.onclick = () => {
        const lang = btn.dataset.langSelect;

        if (GMS.I18n?.setLang) {
          GMS.I18n.setLang(lang);
        } else {
          document.documentElement.setAttribute('lang', lang);
          document.documentElement.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
          try { localStorage.setItem('gms.lang', lang); } catch (_) {}
        }

        SetState.draft.lang = lang;
        SetState.dirty = true;

        GMS.Beep?.info?.();
        render(document.getElementById('page'));
      };
    });

    /* Sound toggle */
    const soundToggle = document.getElementById('set-appearance-sound');
    if (soundToggle) {
      soundToggle.onchange = () => {
        SetState.draft.soundEnabled = soundToggle.checked;
        GMS.Beep?.setEnabled?.(soundToggle.checked);
        markDirty();
      };
    }

    /* Test sounds */
    document.querySelectorAll('[data-test-sound]').forEach(btn => {
      btn.onclick = async () => {
        const type = btn.dataset.testSound;
        await GMS.Beep?.unlock?.();

        switch (type) {
          case 'success':  GMS.Beep?.success?.(); break;
          case 'error':    GMS.Beep?.error?.(); break;
          case 'warning':  GMS.Beep?.warning?.(); break;
          case 'info':     GMS.Beep?.info?.(); break;
          case 'complete': GMS.Beep?.complete?.(); break;
          case 'delete':   GMS.Beep?.delete?.(); break;
        }
      };
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §19 · BIND PRICING TAB
     ───────────────────────────────────────────────────────────────────── */

  function bindPricingTab() {
    const priceInput = document.getElementById('set-price24');
    const marginInput = document.getElementById('set-buy-margin');

    const recalcDerived = () => {
      const price = readNumber('set-price24', 4500);
      const margin = readNumber('set-buy-margin', 8);

      const buy24 = GMS.round(price * (1 - margin / 100), 2);

      const buyDisplay = document.getElementById('set-buy24-display');
      if (buyDisplay) buyDisplay.value = GMS.moneyFmt(buy24) + ' ج.م';
    };

    if (priceInput) {
      priceInput.oninput = () => {
        SetState.draft.price24 = readNumber('set-price24', 4500);
        recalcDerived();
        markDirty();
      };
    }

    if (marginInput) {
      marginInput.oninput = () => {
        let v = readNumber('set-buy-margin', 8);
        v = Math.max(0, Math.min(20, v));
        SetState.draft.buyMargin = v;
        recalcDerived();
        markDirty();
      };
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §20 · BIND RETURNS TAB
     ───────────────────────────────────────────────────────────────────── */

  function bindReturnsTab() {
    const fields = {
      'set-full-refund-days': 'fullRefundDays',
      'set-partial-refund-days': 'partialRefundDays',
      'set-partial-refund-pct': 'partialRefundPct',
      'set-no-return-days': 'noReturnBeyondDays',
      'set-credit-expiry': 'creditWalletExpiryDays',
    };

    Object.entries(fields).forEach(([id, key]) => {
      const el = document.getElementById(id);
      if (!el) return;

      el.oninput = () => {
        const v = readNumber(id, SetState.draft[key]);
        SetState.draft[key] = v;
        markDirty();
      };
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §21 · BIND LOSSES TAB
     ───────────────────────────────────────────────────────────────────── */

  function bindLossesTab() {
    const fields = {
      'set-melting-natural-min': 'meltingNaturalMin',
      'set-melting-natural-max': 'meltingNaturalMax',
      'set-melting-warning-max': 'meltingWarningMax',
      'set-polishing-natural-min': 'polishingNaturalMin',
      'set-polishing-natural-max': 'polishingNaturalMax',
      'set-polishing-warning-max': 'polishingWarningMax',
    };

    Object.entries(fields).forEach(([id, key]) => {
      const el = document.getElementById(id);
      if (!el) return;

      el.oninput = () => {
        const v = readNumber(id, SetState.draft[key]);
        SetState.draft[key] = v;
        markDirty();
      };
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §22 · BIND SYNC TAB
     ───────────────────────────────────────────────────────────────────── */

  function bindSyncTab() {
    const autoToggle = document.getElementById('set-sync-auto');
    if (autoToggle) {
      autoToggle.onchange = () => {
        SetState.draft.autoSyncEnabled = autoToggle.checked;
        markDirty();
      };
    }

    const intervalInput = document.getElementById('set-sync-interval');
    if (intervalInput) {
      intervalInput.oninput = () => {
        let v = readNumber('set-sync-interval', 30);
        v = Math.max(10, Math.min(300, v));
        SetState.draft.autoSyncInterval = v;
        markDirty();
      };
    }

    /* Delta sync */
    const deltaBtn = document.getElementById('set-force-delta-sync');
    if (deltaBtn) {
      deltaBtn.onclick = async () => {
        deltaBtn.classList.add('loading');
        deltaBtn.disabled = true;
        try {
          await GMS.Sync.deltaSync();
          GMS.Toast.ok('تمت المزامنة التفاضلية');
          render(document.getElementById('page'));
        } catch (e) {
          GMS.Toast.err('فشلت المزامنة', e.message);
        } finally {
          deltaBtn.classList.remove('loading');
          deltaBtn.disabled = false;
        }
      };
    }

    /* Full sync */
    const fullBtn = document.getElementById('set-force-full-sync');
    if (fullBtn) {
      fullBtn.onclick = async () => {
        const ok = await GMS.Confirm.ask(
          'المزامنة الكاملة تُعيد تحميل كل المخزون. قد تستغرق دقيقة. متابعة؟',
          { title: 'مزامنة كاملة', okText: 'بدء', danger: false, icon: 'refresh-cw' }
        );
        if (!ok) return;

        fullBtn.classList.add('loading');
        fullBtn.disabled = true;
        try {
          await GMS.Sync.fullSync();
          GMS.Toast.ok('تمت المزامنة الكاملة');
          render(document.getElementById('page'));
        } catch (e) {
          GMS.Toast.err('فشلت المزامنة', e.message);
        } finally {
          fullBtn.classList.remove('loading');
          fullBtn.disabled = false;
        }
      };
    }

    /* Push queue */
    const pushBtn = document.getElementById('set-push-queue');
    if (pushBtn) {
      pushBtn.onclick = async () => {
        pushBtn.classList.add('loading');
        pushBtn.disabled = true;
        try {
          await GMS.Sync.pushQueue();
          GMS.Toast.ok('تم رفع الطابور');
        } catch (e) {
          GMS.Toast.err('فشل الرفع', e.message);
        } finally {
          pushBtn.classList.remove('loading');
          pushBtn.disabled = false;
        }
      };
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §23 · BIND SUPABASE TAB
     ───────────────────────────────────────────────────────────────────── */

  function bindSupabaseTab() {
    const urlInput = document.getElementById('set-supabase-url');
    const keyInput = document.getElementById('set-supabase-key');

    if (urlInput) {
      urlInput.oninput = () => {
        SetState.draft.supabaseUrl = urlInput.value.trim();
        markDirty();
      };
    }

    if (keyInput) {
      keyInput.oninput = () => {
        SetState.draft.supabaseKey = keyInput.value.trim();
        markDirty();
      };
    }

    const saveBtn = document.getElementById('set-supabase-save');
    if (saveBtn) {
      saveBtn.onclick = async () => {
        const url = readString('set-supabase-url');
        const key = readString('set-supabase-key');

        if (!url || !key) {
          return GMS.Toast.err('كلا الحقلين مطلوبان');
        }

        const ok = await GMS.Confirm.ask(
          'سيتم حفظ الإعدادات وإعادة تحميل الصفحة لإعادة الاتصال.',
          { title: 'حفظ الإعدادات', okText: 'حفظ', danger: false, icon: 'save' }
        );
        if (!ok) return;

        GMS.SyncConfig.save(url, key);
        SetState.dirty = false;

        GMS.Toast.ok('تم الحفظ — جارٍ إعادة التحميل…');
        setTimeout(() => location.reload(), 700);
      };
    }

    const testBtn = document.getElementById('set-supabase-test');
    if (testBtn) {
      testBtn.onclick = async () => {
        const url = readString('set-supabase-url');
        const key = readString('set-supabase-key');

        if (!url || !key) {
          return GMS.Toast.err('كلا الحقلين مطلوبان');
        }

        testBtn.classList.add('loading');
        testBtn.disabled = true;

        try {
          if (!window.supabase) throw new Error('مكتبة Supabase غير محمَّلة');

          const client = window.supabase.createClient(url, key);
          const { error } = await client
            .from('inventory')
            .select('id', { count: 'exact', head: true })
            .limit(1);

          if (error) throw error;

          GMS.Toast.ok('الاتصال ناجح ✓', 'تم الوصول إلى قاعدة البيانات');
        } catch (e) {
          console.error(e);
          GMS.Toast.err('فشل الاتصال', e.message);
        } finally {
          testBtn.classList.remove('loading');
          testBtn.disabled = false;
        }
      };
    }

    const clearBtn = document.getElementById('set-supabase-clear');
    if (clearBtn) {
      clearBtn.onclick = async () => {
        const ok = await GMS.Confirm.ask(
          'سيتم حذف إعدادات الاتصال. سيؤدي ذلك إلى فقدان الاتصال بـ Supabase.',
          { title: 'حذف الإعدادات', okText: 'حذف', danger: true }
        );
        if (!ok) return;

        GMS.SyncConfig.clear();
        GMS.Toast.warn('تم الحذف', 'جارٍ إعادة التحميل');
        setTimeout(() => location.reload(), 700);
      };
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §24 · BIND SESSION TAB
     ───────────────────────────────────────────────────────────────────── */

  function bindSessionTab() {
    const refreshBtn = document.getElementById('set-refresh-session');
    if (refreshBtn) {
      refreshBtn.onclick = () => {
        GMS.Auth?.refreshSession?.();
        GMS.Toast.ok('تم تجديد الجلسة');
      };
    }

    const logoutBtn = document.getElementById('set-logout');
    if (logoutBtn) {
      logoutBtn.onclick = async () => {
        const ok = await GMS.Confirm.ask(
          'سيتم تسجيل خروجك من النظام. متابعة؟',
          {
            title: 'تسجيل الخروج',
            okText: 'خروج',
            danger: true,
            icon: 'log-out',
          }
        );
        if (!ok) return;

        SetState.dirty = false;

        try {
          if (GMS.Audit) {
            await GMS.Audit.log('LOGOUT', 'session', null, 'تسجيل خروج');
          }
          if (GMS.Auth?.signOut) {
            GMS.Auth.signOut();
          }
          location.reload();
        } catch (e) {
          GMS.Toast.err('فشل الخروج', e.message);
        }
      };
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §25 · BIND BACKUP TAB
     ───────────────────────────────────────────────────────────────────── */

  function bindBackupTab() {
    const exportBtn = document.getElementById('set-backup-export');
    if (exportBtn) {
      exportBtn.onclick = () => exportBackup();
    }

    const excelBtn = document.getElementById('set-backup-export-excel');
    if (excelBtn) {
      excelBtn.onclick = () => exportAllDataExcel();
    }

    /* Dropzone */
    const dropzone = document.getElementById('set-backup-dropzone');
    const fileInput = document.getElementById('set-backup-file-input');

    if (dropzone && fileInput) {
      dropzone.onclick = () => fileInput.click();

      fileInput.onchange = (e) => {
        const file = e.target.files?.[0];
        if (file) importBackup(file);
        e.target.value = '';
      };

      dropzone.ondragover = (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
      };

      dropzone.ondragleave = () => {
        dropzone.classList.remove('dragover');
      };

      dropzone.ondrop = (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');

        const file = e.dataTransfer.files?.[0];
        if (file) importBackup(file);
      };
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §26 · BIND DANGER TAB
     ───────────────────────────────────────────────────────────────────── */

  function bindDangerTab() {
    /* Clear LocalStorage */
    const clearLS = document.getElementById('danger-clear-ls');
    if (clearLS) {
      clearLS.onclick = async () => {
        const ok = await GMS.Confirm.danger(
          'سيتم حذف جميع مفاتيح LocalStorage الخاصة بالنظام (الإعدادات، السجلات المحلية). لا يمكن التراجع.'
        );
        if (!ok) return;

        GMS.LS?.clearAll?.();
        GMS.Toast.warn('تم تفريغ LocalStorage', 'جارٍ إعادة التحميل');
        setTimeout(() => location.reload(), 700);
      };
    }

    /* Nuke IndexedDB */
    const nukeIdb = document.getElementById('danger-nuke-idb');
    if (nukeIdb) {
      nukeIdb.onclick = async () => {
        const ok = await GMS.Confirm.danger(
          'سيتم حذف قاعدة IndexedDB بالكامل: المخزون المحلي وطابور المزامنة. لا يمكن التراجع.'
        );
        if (!ok) return;

        try {
          if (GMS.IDB?.nuke) {
            await GMS.IDB.nuke();
          }
          GMS.Toast.warn('تم حذف IndexedDB', 'سيحتاج النظام لمزامنة كاملة');
          setTimeout(() => location.reload(), 1000);
        } catch (e) {
          GMS.Toast.err('فشل الحذف', e.message);
        }
      };
    }

    /* Clear Queue */
    const clearQueue = document.getElementById('danger-clear-queue');
    if (clearQueue) {
      clearQueue.onclick = async () => {
        const ok = await GMS.Confirm.danger(
          'سيتم حذف جميع فواتير طابور المزامنة بدون رفعها للخادم. ستُفقد البيانات نهائياً.'
        );
        if (!ok) return;

        try {
          if (GMS.IDB?.queueClear) {
            await GMS.IDB.queueClear();
          }
          GMS.Queue?.state && (GMS.Queue.state.items = []);
          GMS.Toast.warn('تم تفريغ الطابور');
          render(document.getElementById('page'));
        } catch (e) {
          GMS.Toast.err('فشل التفريغ', e.message);
        }
      };
    }

    /* Full Reset */
    const fullReset = document.getElementById('danger-full-reset');
    if (fullReset) {
      fullReset.onclick = async () => {
        const ok = await GMS.Confirm.danger(
          'تحذير أخير: سيتم حذف كل شيء محلياً وتسجيل خروجك. لا يمكن التراجع.'
        );
        if (!ok) return;

        const confirmText = await GMS.Prompt.ask({
          title: 'تأكيد نهائي',
          label: 'اكتب كلمة "حذف" للمتابعة',
          placeholder: 'حذف',
          icon: 'skull',
        });

        if (confirmText !== 'حذف') {
          return GMS.Toast.warn('تم إلغاء العملية');
        }

        try {
          GMS.LS?.clearAll?.();
          if (GMS.IDB?.nuke) await GMS.IDB.nuke();
          GMS.Auth?.signOut?.();

          GMS.Toast.warn('تم إعادة الضبط', 'جارٍ إعادة التحميل…');
          setTimeout(() => location.reload(), 1000);
        } catch (e) {
          GMS.Toast.err('فشل إعادة الضبط', e.message);
        }
      };
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §27 · SAVE / RESET ALL
     ───────────────────────────────────────────────────────────────────── */

  async function saveAll() {
    const btn = document.getElementById('settings-save');
    if (btn) {
      btn.disabled = true;
      btn.classList.add('loading');
      btn.innerHTML = `<i data-lucide="loader-circle"></i> جارٍ الحفظ…`;
      window.lucide?.createIcons();
    }

    try {
      const d = SetState.draft;

      /* 1 · Price board */
      try {
        if (Math.abs(d.price24 - (GMS.Cache?.getPrice()?.price_24 || 0)) > 0.01) {
          if (GMS.Supabase?.isReady?.()) {
            await GMS.Supabase.get()
              .from('price_board')
              .insert({
                price_24: d.price24,
                effective_date: GMS.todayISO(),
              });
          }

          GMS.Cache?.ls?.set?.(GMS.LS_KEYS.CACHE_PRICE, {
            price_24: d.price24,
            updated_at: new Date().toISOString(),
          });

          /* Update karat board */
          if (GMS.Cache?._deriveKaratBoard) {
            GMS.Cache._deriveKaratBoard({ price_24: d.price24 });
          }
        }
      } catch (e) {
        console.warn('[Settings] Price save failed:', e);
      }

      /* 2 · Buy margin */
      try {
        localStorage.setItem(GMS.LS_KEYS.BUY_MARGIN, String(d.buyMargin));
      } catch (_) {}

      /* 3 · Return policy */
      try {
        localStorage.setItem('gms.return.policy', JSON.stringify({
          fullRefundDays: d.fullRefundDays,
          partialRefundDays: d.partialRefundDays,
          partialRefundPct: d.partialRefundPct,
          noReturnBeyondDays: d.noReturnBeyondDays,
          creditWalletExpiryDays: d.creditWalletExpiryDays,
        }));
      } catch (_) {}

      /* 4 · Tolerances */
      try {
        localStorage.setItem(GMS.LS_KEYS.TOLERANCES, JSON.stringify({
          melting: {
            naturalMin: d.meltingNaturalMin,
            naturalMax: d.meltingNaturalMax,
            warningMax: d.meltingWarningMax,
          },
          polishing: {
            naturalMin: d.polishingNaturalMin,
            naturalMax: d.polishingNaturalMax,
            warningMax: d.polishingWarningMax,
          },
          assaying: GMS.DEFAULT_TOLERANCES.assaying,
        }));
      } catch (_) {}

      /* 5 · Auto-sync */
      try {
        localStorage.setItem('gms.queue.autoSync',
          JSON.stringify(d.autoSyncEnabled));
        localStorage.setItem('gms.queue.autoSyncInterval',
          String(d.autoSyncInterval));

        if (GMS.Queue) {
          GMS.Queue.state.autoSyncEnabled = d.autoSyncEnabled;
          GMS.Queue.state.autoSyncIntervalMs = d.autoSyncInterval * 1000;

          if (d.autoSyncEnabled) {
            GMS.Queue.startAutoSync?.();
          } else {
            GMS.Queue.stopAutoSync?.();
          }
        }
      } catch (_) {}

      /* 6 · Sound */
      try {
        GMS.Beep?.setEnabled?.(d.soundEnabled);
      } catch (_) {}

      /* 7 · Theme + Language (already applied live) */
      try {
        localStorage.setItem('gms.theme', d.theme);
        localStorage.setItem('gms.lang', d.lang);
      } catch (_) {}

      /* 8 · Supabase */
      if (d.supabaseUrl && d.supabaseKey &&
          (d.supabaseUrl !== (GMS.SyncConfig?.url || '') ||
           d.supabaseKey !== (GMS.SyncConfig?.key || ''))) {
        GMS.SyncConfig.save(d.supabaseUrl, d.supabaseKey);
        GMS.Toast.info('تم حفظ إعدادات Supabase',
          'أعد تحميل الصفحة لتطبيق الاتصال الجديد');
      }

      /* Sync with saved state */
      SetState.saved = { ...d };
      SetState.dirty = false;
      updateDirtyIndicator();

      GMS.Beep?.success();
      GMS.Toast.ok('تم حفظ الإعدادات بنجاح');

      /* Audit */
      if (GMS.Audit) {
        await GMS.Audit.log(
          'UPDATE',
          'settings',
          null,
          'حدّث إعدادات النظام'
        );
      }

    } catch (e) {
      console.error('[Settings.saveAll]', e);
      GMS.Beep?.error();
      GMS.Toast.err('فشل الحفظ', e.message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.classList.remove('loading');
        btn.innerHTML = `<i data-lucide="save"></i> حفظ الإعدادات`;
        window.lucide?.createIcons();
      }
    }
  }

  async function resetAll() {
    if (!SetState.dirty) {
      return GMS.Toast.info('لا توجد تعديلات لإلغائها');
    }

    const ok = await GMS.Confirm.ask(
      'سيتم إلغاء كل التعديلات غير المحفوظة والعودة للقيم السابقة.',
      { title: 'إلغاء التعديلات', okText: 'إلغاء', danger: true }
    );
    if (!ok) return;

    loadSettings();
    render(document.getElementById('page'));
    GMS.Toast.info('تم إلغاء التعديلات');
  }

  /* ═════════════════════════════════════════════════════════════════════
     §28 · BACKUP / RESTORE
     ───────────────────────────────────────────────────────────────────── */

  async function exportBackup() {
    try {
      GMS.Loading.show('جارٍ تجهيز النسخة…');

      const backup = {
        _meta: {
          app: GMS.APP_CONFIG.NAME,
          version: GMS.APP_CONFIG.VERSION,
          exportedAt: new Date().toISOString(),
          environment: 'production',
        },
        settings: {
          price24: SetState.draft.price24,
          buyMargin: SetState.draft.buyMargin,
          returnPolicy: {
            fullRefundDays: SetState.draft.fullRefundDays,
            partialRefundDays: SetState.draft.partialRefundDays,
            partialRefundPct: SetState.draft.partialRefundPct,
            noReturnBeyondDays: SetState.draft.noReturnBeyondDays,
            creditWalletExpiryDays: SetState.draft.creditWalletExpiryDays,
          },
          tolerances: {
            melting: {
              naturalMin: SetState.draft.meltingNaturalMin,
              naturalMax: SetState.draft.meltingNaturalMax,
              warningMax: SetState.draft.meltingWarningMax,
            },
            polishing: {
              naturalMin: SetState.draft.polishingNaturalMin,
              naturalMax: SetState.draft.polishingNaturalMax,
              warningMax: SetState.draft.polishingWarningMax,
            },
          },
          autoSync: {
            enabled: SetState.draft.autoSyncEnabled,
            interval: SetState.draft.autoSyncInterval,
          },
          sound: SetState.draft.soundEnabled,
          theme: SetState.draft.theme,
          lang: SetState.draft.lang,
          columnPrefs: GMS.LS?.get?.(GMS.LS_KEYS.COLUMNS) || null,
        },
        queue: [],
        audit: [],
        wallet: [],
        records: {
          melting: [],
          polish: [],
          assay: [],
        },
      };

      /* Queue */
      try {
        if (GMS.IDB?.queueAll) {
          backup.queue = await GMS.IDB.queueAll();
        }
      } catch (_) {}

      /* Audit */
      try {
        backup.audit = GMS.Audit?.getAll?.() || [];
      } catch (_) {}

      /* Wallet */
      try {
        backup.wallet = GMS.Views?.returns?.getWallet?.() || [];
      } catch (_) {}

      /* Records */
      try {
        backup.records.melting = JSON.parse(
          localStorage.getItem(GMS.LS_KEYS.MELTING_RECORDS) || '[]'
        );
        backup.records.polish = JSON.parse(
          localStorage.getItem(GMS.LS_KEYS.POLISH_RECORDS) || '[]'
        );
        backup.records.assay = JSON.parse(
          localStorage.getItem(GMS.LS_KEYS.ASSAY_RECORDS) || '[]'
        );
      } catch (_) {}

      /* Download */
      const filename = `gold_ms_backup_${GMS.todayISO()}.json`;
      const json = JSON.stringify(backup, null, 2);

      GMS.downloadText(filename, json, 'application/json;charset=utf-8');

      GMS.Loading.hide();
      GMS.Beep?.success();
      GMS.Toast.ok('تم تصدير النسخة', filename);

    } catch (e) {
      GMS.Loading.hide();
      console.error('[Settings.exportBackup]', e);
      GMS.Toast.err('فشل التصدير', e.message);
    }
  }

  async function importBackup(file) {
    if (!file) return;
    if (!file.name.endsWith('.json')) {
      return GMS.Toast.err('صيغة غير مدعومة', 'يُسمح بملفات JSON فقط');
    }

    const ok = await GMS.Confirm.ask(
      'سيتم دمج البيانات من النسخة مع الحالية. الإعدادات الحالية ستُستبدَل. متابعة؟',
      { title: 'استعادة النسخة', okText: 'استعادة', danger: true, icon: 'upload' }
    );
    if (!ok) return;

    try {
      GMS.Loading.show('جارٍ قراءة الملف…');

      const text = await GMS.readFileAsText(file);
      const data = JSON.parse(text);

      if (!data._meta || !data._meta.app) {
        throw new Error('الملف لا يبدو نسخة احتياطية صالحة');
      }

      /* Restore settings */
      if (data.settings) {
        const s = data.settings;

        if (s.price24) {
          GMS.Cache?.ls?.set?.(GMS.LS_KEYS.CACHE_PRICE, {
            price_24: s.price24,
            updated_at: new Date().toISOString(),
          });
        }

        if (s.buyMargin !== undefined) {
          localStorage.setItem(GMS.LS_KEYS.BUY_MARGIN, String(s.buyMargin));
        }

        if (s.returnPolicy) {
          localStorage.setItem('gms.return.policy',
            JSON.stringify(s.returnPolicy));
        }

        if (s.tolerances) {
          localStorage.setItem(GMS.LS_KEYS.TOLERANCES,
            JSON.stringify({
              ...s.tolerances,
              assaying: GMS.DEFAULT_TOLERANCES.assaying,
            }));
        }

        if (s.autoSync) {
          localStorage.setItem('gms.queue.autoSync',
            JSON.stringify(s.autoSync.enabled));
          localStorage.setItem('gms.queue.autoSyncInterval',
            String(s.autoSync.interval));
        }

        if (s.columnPrefs) {
          localStorage.setItem(GMS.LS_KEYS.COLUMNS,
            JSON.stringify(s.columnPrefs));
        }
      }

      /* Restore queue */
      if (data.queue && data.queue.length) {
        let restored = 0;
        for (const item of data.queue) {
          try {
            await GMS.IDB?.queueAdd?.(item);
            restored++;
          } catch (_) {}
        }
        console.log('[Restore] Queue items restored:', restored);
      }

      /* Restore audit */
      if (data.audit && data.audit.length) {
        try {
          localStorage.setItem(GMS.LS_KEYS.AUDIT,
            JSON.stringify(data.audit.slice(0, 100)));
        } catch (_) {}
      }

      /* Restore wallet */
      if (data.wallet && data.wallet.length) {
        try {
          localStorage.setItem(GMS.LS_KEYS.WALLET,
            JSON.stringify(data.wallet.slice(0, 500)));
        } catch (_) {}
      }

      /* Restore records */
      if (data.records) {
        try {
          if (data.records.melting?.length) {
            localStorage.setItem(GMS.LS_KEYS.MELTING_RECORDS,
              JSON.stringify(data.records.melting.slice(0, 100)));
          }
          if (data.records.polish?.length) {
            localStorage.setItem(GMS.LS_KEYS.POLISH_RECORDS,
              JSON.stringify(data.records.polish.slice(0, 100)));
          }
          if (data.records.assay?.length) {
            localStorage.setItem(GMS.LS_KEYS.ASSAY_RECORDS,
              JSON.stringify(data.records.assay.slice(0, 100)));
          }
        } catch (_) {}
      }

      GMS.Loading.hide();
      GMS.Beep?.complete();
      GMS.Toast.ok('تمت الاستعادة بنجاح', 'جارٍ إعادة التحميل…');

      setTimeout(() => location.reload(), 1200);

    } catch (e) {
      GMS.Loading.hide();
      console.error('[Settings.importBackup]', e);
      GMS.Toast.err('فشل الاستعادة', e.message);
    }
  }

  function exportAllDataExcel() {
    if (!window.XLSX) {
      return GMS.Toast.err('محرك Excel غير متاح');
    }

    try {
      const wb = XLSX.utils.book_new();

      /* Settings sheet */
      const d = SetState.draft;
      const settingsRows = [
        ['إعدادات النظام — Gold MS'],
        ['تاريخ التصدير', new Date().toLocaleString('ar-EG')],
        [''],
        ['الفئة', 'الإعداد', 'القيمة'],
        ['الأسعار', 'سعر 24K', d.price24],
        ['الأسعار', 'هامش الشراء %', d.buyMargin],
        ['الإرجاع', 'استرجاع كامل (يوم)', d.fullRefundDays],
        ['الإرجاع', 'استرجاع جزئي (يوم)', d.partialRefundDays],
        ['الإرجاع', 'نسبة الجزئي %', d.partialRefundPct],
        ['الإرجاع', 'الحد النهائي (يوم)', d.noReturnBeyondDays],
        ['الإرجاع', 'صلاحية الرصيد (يوم)', d.creditWalletExpiryDays],
        ['الخسس', 'سبك — طبيعي أدنى %', d.meltingNaturalMin],
        ['الخسس', 'سبك — طبيعي أقصى %', d.meltingNaturalMax],
        ['الخسس', 'سبك — حد التنبيه %', d.meltingWarningMax],
        ['الخسس', 'تحميم — طبيعي أدنى %', d.polishingNaturalMin],
        ['الخسس', 'تحميم — طبيعي أقصى %', d.polishingNaturalMax],
        ['الخسس', 'تحميم — حد التنبيه %', d.polishingWarningMax],
        ['المزامنة', 'فترة المزامنة (ثانية)', d.autoSyncInterval],
        ['المزامنة', 'المزامنة التلقائية', d.autoSyncEnabled ? 'مفعّلة' : 'معطّلة'],
      ];

      const ws1 = XLSX.utils.aoa_to_sheet(settingsRows);
      ws1['!cols'] = [{ wch: 14 }, { wch: 30 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(wb, ws1, 'الإعدادات');

      XLSX.writeFile(wb, `settings_export_${GMS.todayISO()}.xlsx`);
      GMS.Toast.ok('تم التصدير');

    } catch (e) {
      console.error('[Settings.exportAllDataExcel]', e);
      GMS.Toast.err('فشل التصدير', e.message);
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §29 · INIT & CLEANUP
     ───────────────────────────────────────────────────────────────────── */

  function init() {
    loadSettings();
  }

  function cleanup() {
    cleanupListeners();
  }

  /* ═════════════════════════════════════════════════════════════════════
     §30 · VIEW REGISTRATION
     ═════════════════════════════════════════════════════════════════════ */
  GMS.Views = GMS.Views || {};

  GMS.Views.settings = {
    render: (root) => {
      if (!Object.keys(SetState.saved).length) init();
      render(root);
    },
    cleanup,
    state: SetState,

    /* Data */
    load: loadSettings,

    /* Actions */
    save: saveAll,
    reset: resetAll,

    /* Backup */
    exportBackup,
    importBackup,
    exportAllDataExcel,

    /* Helpers */
    markDirty,
  };

  /* ═════════════════════════════════════════════════════════════════════
     §31 · LOADED CONFIRMATION
     ═════════════════════════════════════════════════════════════════════ */
  console.log(
    '%c⚙️  Settings View loaded · 10 tabs',
    'color:#6b7a95;font-weight:800;font-size:12px;padding:1px 5px;' +
    'background:#eef2f8;border-radius:4px;'
  );

  console.log(
    `%c🎛️  General · Appearance · Pricing · Returns · Losses · Sync · Supabase · Session · Backup · Danger`,
    'color:#6b7a95;font-weight:700;font-size:11px;'
  );

  /* ═════════════════════════════════════════════════════════════════════
     ✅ js/21-views-settings.js — نهاية الملف
     ═════════════════════════════════════════════════════════════════════ */

})();