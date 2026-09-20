/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ENTERPRISE — js/21-views-settings.js
   الإعدادات الشاملة:
     - إعدادات عامة (الفروع، الماركات)
     - المظهر واللغة والصوت
     - لوحة الأسعار وهامش الشراء
     - سياسة الإرجاع
     - حدود الخسس
     - ✅ إدارة المصانع (CRUD كامل + 4 أنماط تسعير)
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

    /* ✅ المصانع */
    manufacturers: [],
    manufacturersDirty: false,

    /* مؤقت draft للمصنع الحالي */
    manuDraft: null,

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
     ═════════════════════════════════════════════════════════════════════ */

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

    /* ✅ Manufacturers */
    SetState.manufacturers = GMS.Cache?.getManufacturersList
      ? GMS.Cache.getManufacturersList()
      : GMS.DEFAULT_MANUFACTURERS.map(m => ({ ...m }));

    SetState.manufacturersDirty = false;

    /* احفظ نسخة */
    SetState.saved = { ...SetState.draft };
    SetState.dirty = false;

    return SetState.draft;
  }

  function markDirty() {
    SetState.dirty = true;
    updateDirtyIndicator();
  }

  function markManufacturersDirty() {
    SetState.manufacturersDirty = true;
    SetState.dirty = true;
    updateDirtyIndicator();
  }

  function updateDirtyIndicator() {
    const indicator = document.getElementById('settings-dirty-indicator');
    if (!indicator) return;

    if (SetState.dirty || SetState.manufacturersDirty) {
      indicator.style.display = '';
      indicator.className = 'chip warn';

      let label = 'تعديلات غير محفوظة';
      if (SetState.manufacturersDirty) {
        label = 'تعديلات مصانع غير محفوظة';
      }

      indicator.innerHTML = `
        <i data-lucide="alert-circle" style="width:12px;height:12px"></i>
        <span>${label}</span>
      `;
    } else {
      indicator.style.display = 'none';
    }
    window.lucide?.createIcons();
  }

  /* ═════════════════════════════════════════════════════════════════════
     §4 · RENDERERS — TABS
     ═════════════════════════════════════════════════════════════════════ */

  function renderTabs() {
    const tabs = [
      { key: 'general',       label: 'عام',          icon: 'sliders-horizontal' },
      { key: 'appearance',    label: 'المظهر',        icon: 'palette' },
      { key: 'pricing',       label: 'الأسعار',       icon: 'trending-up' },
      { key: 'manufacturers', label: 'المصانع',       icon: 'factory' },
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
                  data-set-tab="${t.key}" type="button">
            <i data-lucide="${t.icon}"></i>
            <span>${t.label}</span>
            ${t.key === 'manufacturers' && SetState.manufacturersDirty ? `
              <span class="tab-badge" style="background:var(--warn)">
                ${SetState.manufacturers.length}
              </span>
            ` : ''}
          </button>
        `).join('')}
      </div>
    `;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §5 · TAB: GENERAL
     ═════════════════════════════════════════════════════════════════════ */

  function renderGeneralTab() {
    const d = SetState.draft;
    const branches = GMS.Demo?.getBranches() || [];
    const manufacturers = SetState.manufacturers;

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

        <!-- Right: Branches & Manufacturers Summary -->
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
                المصانع المسجَّلة
              </h3>
              <div class="spacer" style="flex:1"></div>
              <span class="chip">${manufacturers.length} مصنع</span>
              <button class="btn btn-sm btn-primary" id="goto-manufacturers-btn">
                <i data-lucide="settings-2"></i> إدارة
              </button>
            </div>

            <div class="card-body" style="padding:8px 0;max-height:220px;
                        overflow-y:auto">
              ${manufacturers.length ? manufacturers.slice(0, 8).map(m => {
                const mode = GMS.getPricingMode(m.pricingMode);
                return `
                  <div style="padding:11px 16px;border-bottom:1px dashed var(--border);
                              display:flex;align-items:center;gap:11px">
                    <div style="width:34px;height:34px;border-radius:10px;
                                display:grid;place-items:center;flex-shrink:0;
                                background:var(--gold-grad);color:#2a1f05;
                                font-weight:900;font-size:13px">
                      ${GMS.esc(m.code || '?')}
                    </div>
                    <div style="flex:1;min-width:0">
                      <div style="font-weight:800;font-size:12.5px">
                        ${GMS.esc(m.name)}
                      </div>
                      <div style="font-size:10.5px;color:var(--muted);
                                  font-weight:600;margin-top:2px">
                        <i data-lucide="${mode.icon}"
                           style="width:10px;height:10px;display:inline;
                                  vertical-align:-1px"></i>
                        ${GMS.esc(mode.label)}
                      </div>
                    </div>
                    ${!m.isActive ? `<span class="pill pill-gray">موقوف</span>` : ''}
                  </div>
                `;
              }).join('') : `
                <div class="empty" style="padding:30px 20px">
                  <i data-lucide="factory"></i>
                  <p>لا توجد مصانع</p>
                </div>
              `}
              ${manufacturers.length > 8 ? `
                <div style="padding:10px 16px;text-align:center;
                            font-size:11px;color:var(--muted);font-weight:700">
                  +${manufacturers.length - 8} مصنع إضافي — اضغط "إدارة"
                </div>
              ` : ''}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §6 · TAB: APPEARANCE
     ═════════════════════════════════════════════════════════════════════ */

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
     ═════════════════════════════════════════════════════════════════════ */

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
     §8 · ✅ TAB: MANUFACTURERS
     ═════════════════════════════════════════════════════════════════════ */

  function renderManufacturersTab() {
    const list = SetState.manufacturers;

    return `
      <!-- Header -->
      <div class="card" style="margin-bottom:16px;
                  background:linear-gradient(135deg,
                    color-mix(in srgb,var(--primary) 8%,var(--surface)) 0%,
                    var(--surface) 100%);
                  border-color:color-mix(in srgb,var(--primary) 30%,var(--border))">
        <div class="card-body" style="padding:20px 22px">
          <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
            <div style="width:56px;height:56px;border-radius:16px;
                        background:var(--gold-grad);display:grid;place-items:center;
                        color:#2a1f05;flex-shrink:0;
                        box-shadow:0 14px 34px -12px rgba(184,145,47,.9)">
              <i data-lucide="factory" style="width:26px;height:26px"></i>
            </div>
            <div style="flex:1;min-width:200px">
              <h3 style="font-size:16px;font-weight:900;margin-bottom:4px">
                إدارة المصانع والماركات
              </h3>
              <p style="font-size:12px;color:var(--muted);font-weight:600;
                        margin:0;line-height:1.6">
                4 أنماط تسعير مدعومة: حسب الأحرف · الألوان · نوع القطعة · سعر ثابت.
                أضف لكل مصنع ما تريد من الأسعار (مصنعية شراء + مصنعية بيع).
              </p>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn btn-ghost btn-sm" id="manu-reset-all">
                <i data-lucide="rotate-ccw"></i>
                إعادة ضبط الافتراضي
              </button>
              <button class="btn btn-primary btn-lg" id="manu-add-new">
                <i data-lucide="plus-circle"></i>
                إضافة مصنع جديد
              </button>
            </div>
          </div>

          <!-- Summary stats -->
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;
                      margin-top:18px;padding-top:18px;
                      border-top:1px solid var(--border)">
            ${renderManuStat('letters', 'حسب الأحرف', 'letter-text')}
            ${renderManuStat('colors', 'حسب الألوان', 'palette')}
            ${renderManuStat('items', 'حسب نوع القطعة', 'shapes')}
            ${renderManuStat('fixed', 'سعر ثابت', 'equal')}
          </div>
        </div>
      </div>

      <!-- Manufacturers List -->
      <div class="card">
        <div class="card-head">
          <h3>
            <i data-lucide="list"></i>
            قائمة المصانع
          </h3>
          <div class="spacer" style="flex:1"></div>
          <span class="chip info">
            ${GMS.intFmt(list.length)} مصنع
          </span>
        </div>

        <div style="padding:12px 14px">
          ${list.length ? list.map(m => renderManuCard(m)).join('') : `
            <div class="empty" style="padding:60px 20px">
              <i data-lucide="factory"></i>
              <p>لا توجد مصانع مسجَّلة</p>
              <span>ابدأ بإضافة مصنع جديد</span>
              <div style="margin-top:16px">
                <button class="btn btn-primary btn-sm" id="manu-add-empty">
                  <i data-lucide="plus-circle"></i>
                  إضافة مصنع
                </button>
              </div>
            </div>
          `}
        </div>
      </div>
    `;
  }

  function renderManuStat(modeKey, label, icon) {
    const mode = GMS.PRICING_MODES[modeKey];
    const count = SetState.manufacturers.filter(m => m.pricingMode === modeKey).length;

    return `
      <div style="padding:12px 14px;border-radius:10px;
                  background:var(--surface-2);
                  border:1px solid var(--border);
                  display:flex;align-items:center;gap:11px">
        <div style="width:34px;height:34px;border-radius:9px;
                    display:grid;place-items:center;flex-shrink:0;
                    background:color-mix(in srgb,var(--${mode.color}) 20%,var(--surface-3));
                    color:var(--${mode.color})">
          <i data-lucide="${icon}" style="width:16px;height:16px"></i>
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:10.5px;font-weight:800;
                      color:var(--muted);text-transform:uppercase">
            ${label}
          </div>
          <div class="mono" style="font-size:16px;font-weight:900;margin-top:2px">
            ${count}
          </div>
        </div>
      </div>
    `;
  }

  function renderManuCard(m) {
    const mode = GMS.getPricingMode(m.pricingMode);

    /* عرض الأسعار المختصرة */
    let ratesPreview = '';

    if (m.pricingMode === 'letters' && m.letterRates?.length) {
      ratesPreview = m.letterRates.slice(0, 4).map(l =>
        `<span class="pill pill-gold" style="font-size:10px">
          ${GMS.esc(l.letter)}: ${GMS.moneyFmt(l.rate)}
        </span>`
      ).join('');
      if (m.letterRates.length > 4) {
        ratesPreview += `<span class="chip" style="font-size:10px">+${m.letterRates.length - 4}</span>`;
      }
    } else if (m.pricingMode === 'colors' && m.colorRates?.length) {
      ratesPreview = m.colorRates.slice(0, 4).map(c => {
        const color = GMS.getPricingColor(c.color);
        const bg = color?.hex || '#6b7a95';
        return `<span class="chip" style="font-size:10px">
          <span style="width:8px;height:8px;border-radius:50%;
                       display:inline-block;background:${bg}"></span>
          ${GMS.esc(color?.label || c.color)}: ${GMS.moneyFmt(c.rate)}
        </span>`;
      }).join('');
      if (m.colorRates.length > 4) {
        ratesPreview += `<span class="chip" style="font-size:10px">+${m.colorRates.length - 4}</span>`;
      }
    } else if (m.pricingMode === 'items' && m.itemRates?.length) {
      ratesPreview = m.itemRates.slice(0, 4).map(i =>
        `<span class="chip info" style="font-size:10px">
          ${GMS.esc(i.category)}: ${GMS.moneyFmt(i.rate)}
        </span>`
      ).join('');
      if (m.itemRates.length > 4) {
        ratesPreview += `<span class="chip" style="font-size:10px">+${m.itemRates.length - 4}</span>`;
      }
    } else if (m.pricingMode === 'fixed') {
      ratesPreview = `<span class="pill pill-green" style="font-size:11px">
        سعر ثابت: ${GMS.moneyFmt(m.fixedRate || 0)} ج.م
      </span>`;
    } else {
      ratesPreview = `<span class="chip" style="font-size:10px;opacity:.6">
        لم تُضف أسعار بعد
      </span>`;
    }

    return `
      <div style="padding:16px 18px;border:1.5px solid var(--border);
                  border-radius:14px;background:var(--surface-2);
                  margin-bottom:10px;transition:all .2s;
                  ${!m.isActive ? 'opacity:.6' : ''}"
           data-manu-id="${GMS.esc(m.id)}">

        <!-- Header row -->
        <div style="display:flex;align-items:center;gap:14px;
                    flex-wrap:wrap;margin-bottom:12px">
          <div style="width:52px;height:52px;border-radius:14px;
                      display:grid;place-items:center;flex-shrink:0;
                      background:var(--gold-grad);color:#2a1f05;
                      font-weight:900;font-size:20px;
                      box-shadow:0 8px 20px -10px rgba(184,145,47,.9)">
            ${GMS.esc(m.code || '?')}
          </div>

          <div style="flex:1;min-width:200px">
            <div style="display:flex;align-items:center;gap:8px;
                        flex-wrap:wrap;margin-bottom:4px">
              <h4 style="font-size:15px;font-weight:900;margin:0">
                ${GMS.esc(m.name)}
              </h4>
              ${!m.isActive ? `<span class="pill pill-gray">موقوف</span>` : ''}
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;
                        font-size:11px;color:var(--muted);font-weight:700">
              <span style="display:flex;align-items:center;gap:4px">
                <i data-lucide="${mode.icon}"
                   style="width:11px;height:11px;color:var(--${mode.color})"></i>
                ${mode.label}
              </span>
              ${m.phone ? `
                <span style="display:flex;align-items:center;gap:4px">
                  <i data-lucide="phone"
                     style="width:11px;height:11px"></i>
                  <span class="mono">${GMS.esc(m.phone)}</span>
                </span>
              ` : ''}
              ${m.notes ? `
                <span style="display:flex;align-items:center;gap:4px">
                  <i data-lucide="sticky-note"
                     style="width:11px;height:11px"></i>
                  ${GMS.esc(m.notes)}
                </span>
              ` : ''}
            </div>
          </div>

          <!-- Actions -->
          <div style="display:flex;gap:4px;flex-wrap:wrap">
            <button class="icon-action gold" data-manu-action="edit"
                    data-manu-id="${GMS.esc(m.id)}" title="تعديل">
              <i data-lucide="pencil"></i>
            </button>
            <button class="icon-action" data-manu-action="toggle"
                    data-manu-id="${GMS.esc(m.id)}"
                    title="${m.isActive ? 'إيقاف' : 'تفعيل'}">
              <i data-lucide="${m.isActive ? 'pause' : 'play'}"></i>
            </button>
            <button class="icon-action danger" data-manu-action="delete"
                    data-manu-id="${GMS.esc(m.id)}" title="حذف">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        </div>

        <!-- Default rates row -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;
                    padding:10px 12px;background:var(--surface);
                    border-radius:9px;margin-bottom:10px;
                    border:1px solid var(--border)">
          <div>
            <div style="font-size:10px;font-weight:800;color:var(--muted);
                        text-transform:uppercase;margin-bottom:3px">
              مصنعية الشراء الافتراضية
            </div>
            <div class="mono" style="font-size:14px;font-weight:900;
                        color:var(--danger)">
              ${GMS.moneyFmt(m.purchaseRate || 0)}
              <small style="font-size:10px;color:var(--muted)">ج.م/جم</small>
            </div>
          </div>
          <div>
            <div style="font-size:10px;font-weight:800;color:var(--muted);
                        text-transform:uppercase;margin-bottom:3px">
              مصنعية البيع الافتراضية
            </div>
            <div class="mono" style="font-size:14px;font-weight:900;
                        color:var(--success)">
              ${GMS.moneyFmt(m.saleRate || 0)}
              <small style="font-size:10px;color:var(--muted)">ج.م/جم</small>
            </div>
          </div>
        </div>

        <!-- Rates preview -->
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
          <span style="font-size:10px;font-weight:800;color:var(--muted);
                       text-transform:uppercase;margin-inline-end:6px">
            الأسعار المسجَّلة:
          </span>
          ${ratesPreview}
        </div>
      </div>
    `;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §9 · MANUFACTURER MODAL (ADD / EDIT)
     ═════════════════════════════════════════════════════════════════════ */

  function openManufacturerModal(manufacturer = null) {
    const isEdit = Boolean(manufacturer);

    /* بناء draft */
    SetState.manuDraft = manufacturer
      ? JSON.parse(JSON.stringify(manufacturer))
      : {
          id: null,
          code: '',
          letter: '',
          name: '',
          phone: '',
          pricingMode: 'letters',
          letterRates: [],
          colorRates: [],
          itemRates: [],
          fixedRate: 0,
          purchaseRate: 0,
          saleRate: 0,
          rate: 0,
          isActive: true,
          notes: '',
        };

    GMS.Modal.open({
      title: isEdit
        ? `تعديل مصنع — ${manufacturer.name}`
        : 'إضافة مصنع جديد',
      icon: isEdit ? 'pencil' : 'plus-circle',
      size: 'xl',
      body: `<div id="manu-modal-body">${renderManufacturerForm()}</div>`,
      footer: `
        <button class="btn" data-close>إلغاء</button>
        <button class="btn btn-primary btn-lg" id="manu-save-btn">
          <i data-lucide="save"></i>
          ${isEdit ? 'حفظ التعديلات' : 'إضافة المصنع'}
        </button>
      `,
      onMount: (el, close) => {
        bindManufacturerForm(el);

        el.querySelector('#manu-save-btn').onclick = () => {
          saveManufacturerFromModal(el, close);
        };
      },
    });
  }

  function renderManufacturerForm() {
    const d = SetState.manuDraft;
    if (!d) return '';

    return `
      <!-- Section 1: Basic Info -->
      <div style="padding:16px 18px;background:var(--surface-2);
                  border-radius:12px;border:1px solid var(--border);
                  margin-bottom:18px">
        <div style="font-size:11px;font-weight:800;color:var(--muted);
                    text-transform:uppercase;letter-spacing:.5px;
                    margin-bottom:12px;display:flex;align-items:center;gap:6px">
          <i data-lucide="info" style="width:12px;height:12px"></i>
          البيانات الأساسية
        </div>

        <div class="grid-form three">
          <div class="field">
            <label>كود المصنع <span class="req">*</span>
              <span class="hint" style="display:inline">حرف أو رمز قصير</span>
            </label>
            <input id="manu-code" value="${GMS.esc(d.code)}"
                   placeholder="A / B / C / M"
                   maxlength="4"
                   style="font-weight:900;text-align:center;
                          font-size:17px;text-transform:uppercase"
                   dir="ltr">
          </div>

          <div class="field">
            <label>الرمز بالعربي</label>
            <input id="manu-letter" value="${GMS.esc(d.letter)}"
                   placeholder="أ / ب / جـ"
                   maxlength="3"
                   style="font-weight:900;text-align:center;font-size:15px">
          </div>

          <div class="field">
            <label>اسم المصنع <span class="req">*</span></label>
            <input id="manu-name" value="${GMS.esc(d.name)}"
                   placeholder="مصنع النيل للذهب">
          </div>

          <div class="field">
            <label>رقم الهاتف</label>
            <input id="manu-phone" value="${GMS.esc(d.phone || '')}"
                   placeholder="01xxxxxxxxx"
                   inputmode="tel" class="mono" dir="ltr">
          </div>

          <div class="field">
            <label>الحالة</label>
            <select id="manu-active">
              <option value="1" ${d.isActive ? 'selected' : ''}>نشط</option>
              <option value="0" ${!d.isActive ? 'selected' : ''}>موقوف</option>
            </select>
          </div>

          <div class="field">
            <label>ملاحظات</label>
            <input id="manu-notes" value="${GMS.esc(d.notes || '')}"
                   placeholder="اختياري…">
          </div>
        </div>
      </div>

      <!-- Section 2: Pricing Mode -->
      <div style="margin-bottom:18px">
        <div style="font-size:11px;font-weight:800;color:var(--muted);
                    text-transform:uppercase;letter-spacing:.5px;
                    margin-bottom:12px;display:flex;align-items:center;gap:6px">
          <i data-lucide="dollar-sign" style="width:12px;height:12px"></i>
          نمط التسعير — كيف بيحدد المصنع مصنعيته؟
        </div>

        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
          ${Object.values(GMS.PRICING_MODES).map(mode => {
            const active = d.pricingMode === mode.key;
            return `
              <button type="button" data-manu-mode="${mode.key}"
                      style="padding:16px 12px;border-radius:12px;
                             cursor:pointer;text-align:center;
                             border:1.5px solid ${active
                               ? `var(--${mode.color})`
                               : 'var(--border)'};
                             background:${active
                               ? `color-mix(in srgb,var(--${mode.color}) 10%,var(--surface))`
                               : 'var(--surface-2)'};
                             transition:all .2s;font-family:inherit">
                <div style="width:40px;height:40px;border-radius:11px;
                            display:grid;place-items:center;
                            margin:0 auto 10px;
                            background:${active ? `var(--${mode.color})` : 'var(--surface-3)'};
                            color:${active ? '#fff' : 'var(--text-2)'}">
                  <i data-lucide="${mode.icon}"
                     style="width:20px;height:20px"></i>
                </div>
                <div style="font-size:12.5px;font-weight:800;
                            color:${active ? `var(--${mode.color})` : 'var(--text-2)'}">
                  ${mode.label}
                </div>
                <div style="font-size:10px;color:var(--muted);
                            font-weight:600;margin-top:4px;
                            line-height:1.4">
                  ${mode.description}
                </div>
              </button>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Section 3: Default Rates -->
      <div style="padding:16px 18px;background:var(--gold-soft);
                  border-radius:12px;
                  border:1px solid color-mix(in srgb,var(--primary) 30%,var(--border));
                  margin-bottom:18px">
        <div style="font-size:11px;font-weight:800;color:var(--warn);
                    text-transform:uppercase;letter-spacing:.5px;
                    margin-bottom:12px;display:flex;align-items:center;gap:6px">
          <i data-lucide="tag" style="width:12px;height:12px"></i>
          المصنعية الافتراضية (Fallback)
        </div>

        <p style="font-size:11.5px;color:var(--text-2);font-weight:600;
                  margin:0 0 12px;line-height:1.7">
          تُستخدم عندما لا نجد سعراً مطابقاً في القائمة أدناه.
        </p>

        <div class="grid-form">
          <div class="field">
            <label>مصنعية الشراء الافتراضية (ج.م/جم)
              <span class="hint" style="display:inline">اللي بتدفعه للمصنع</span>
            </label>
            <input type="number" id="manu-purchase-rate"
                   step="1" min="0"
                   value="${d.purchaseRate || 0}"
                   class="mono"
                   style="font-weight:900;text-align:center;
                          font-size:16px;color:var(--danger)">
          </div>

          <div class="field">
            <label>مصنعية البيع الافتراضية (ج.م/جم)
              <span class="hint" style="display:inline">اللي هتبيع بيه</span>
            </label>
            <input type="number" id="manu-sale-rate"
                   step="1" min="0"
                   value="${d.saleRate || 0}"
                   class="mono"
                   style="font-weight:900;text-align:center;
                          font-size:16px;color:var(--success)">
          </div>
        </div>

        <div id="manu-margin-preview"
             style="margin-top:12px;padding:10px 14px;
                    background:var(--surface);border-radius:9px;
                    text-align:center;font-size:12px;font-weight:700">
          ${renderMarginPreview()}
        </div>
      </div>

      <!-- Section 4: Dynamic Rates -->
      <div style="padding:16px 18px;background:var(--surface-2);
                  border-radius:12px;border:1px solid var(--border);
                  margin-bottom:18px">
        <div style="display:flex;align-items:center;gap:8px;
                    margin-bottom:12px;flex-wrap:wrap">
          <div style="font-size:11px;font-weight:800;color:var(--muted);
                      text-transform:uppercase;letter-spacing:.5px;
                      display:flex;align-items:center;gap:6px">
            <i data-lucide="list-plus" style="width:12px;height:12px"></i>
            قائمة الأسعار التفصيلية
          </div>
          <div class="spacer" style="flex:1"></div>
          <button class="btn btn-sm btn-primary" id="manu-add-row">
            <i data-lucide="plus"></i>
            ${getAddRowLabel()}
          </button>
        </div>

        <div id="manu-rows-host">
          ${renderDynamicRows()}
        </div>
      </div>
    `;
  }

  function getAddRowLabel() {
    const d = SetState.manuDraft;
    if (!d) return 'إضافة صف';

    switch (d.pricingMode) {
      case 'letters': return 'إضافة حرف';
      case 'colors':  return 'إضافة لون';
      case 'items':   return 'إضافة قطعة';
      default:        return 'إضافة صف';
    }
  }

  function renderMarginPreview() {
    const d = SetState.manuDraft;
    if (!d) return '';

    const purchase = Number(d.purchaseRate || 0);
    const sale = Number(d.saleRate || 0);
    const margin = sale - purchase;

    let color = 'var(--muted)';
    let icon = 'minus';
    let label = 'لا يوجد هامش';

    if (margin > 0) {
      color = 'var(--success)';
      icon = 'trending-up';
      label = 'ربح متوقع';
    } else if (margin < 0) {
      color = 'var(--danger)';
      icon = 'trending-down';
      label = 'تحذير: البيع أقل من الشراء!';
    }

    return `
      <span style="color:${color};font-weight:900;
                   display:inline-flex;align-items:center;gap:6px">
        <i data-lucide="${icon}" style="width:14px;height:14px"></i>
        هامش الربح: <span class="mono">${margin > 0 ? '+' : ''}${GMS.moneyFmt(margin)}</span>
        ج.م/جم — ${label}
      </span>
    `;
  }

  function renderDynamicRows() {
    const d = SetState.manuDraft;
    if (!d) return '';

    switch (d.pricingMode) {
      case 'letters':
        return renderLettersRows();
      case 'colors':
        return renderColorsRows();
      case 'items':
        return renderItemsRows();
      case 'fixed':
      default:
        return renderFixedRow();
    }
  }

  function renderLettersRows() {
    const d = SetState.manuDraft;
    const rows = d.letterRates || [];

    if (!rows.length) {
      return `
        <div class="empty" style="padding:32px 20px">
          <i data-lucide="letter-text"></i>
          <p>لا توجد أحرف مسجَّلة</p>
          <span>اضغط "إضافة حرف" لبدء إدخال الأسعار</span>
        </div>
      `;
    }

    return `
      <table class="tbl" style="font-size:12.5px">
        <thead>
          <tr>
            <th style="width:60px" class="col-c">#</th>
            <th style="width:140px">الحرف</th>
            <th class="col-num">مصنعية (ج.م/جم)</th>
            <th style="width:60px" class="col-c"></th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row, idx) => `
            <tr>
              <td class="col-c" style="font-weight:800;color:var(--muted)">
                ${idx + 1}
              </td>
              <td>
                <select data-row-letter="${idx}"
                        style="padding:7px 10px;font-weight:800;
                               text-align:center">
                  ${GMS.PRICING_LETTERS.map(l => `
                    <option value="${l}" ${row.letter === l ? 'selected' : ''}>
                      ${l}
                    </option>
                  `).join('')}
                </select>
              </td>
              <td>
                <input type="number" data-row-rate="${idx}"
                       step="1" min="0" value="${row.rate || 0}"
                       class="mono"
                       style="font-weight:900;text-align:center">
              </td>
              <td class="col-c">
                <button class="row-act danger" data-manu-row-remove="${idx}"
                        type="button" title="حذف">
                  <i data-lucide="trash-2"></i>
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  function renderColorsRows() {
    const d = SetState.manuDraft;
    const rows = d.colorRates || [];

    if (!rows.length) {
      return `
        <div class="empty" style="padding:32px 20px">
          <i data-lucide="palette"></i>
          <p>لا توجد ألوان مسجَّلة</p>
          <span>اضغط "إضافة لون" لبدء إدخال الأسعار</span>
        </div>
      `;
    }

    return `
      <table class="tbl" style="font-size:12.5px">
        <thead>
          <tr>
            <th style="width:60px" class="col-c">#</th>
            <th style="width:200px">اللون</th>
            <th style="width:80px" class="col-c">معاينة</th>
            <th class="col-num">مصنعية (ج.م/جم)</th>
            <th style="width:60px" class="col-c"></th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row, idx) => {
            const color = GMS.getPricingColor(row.color);
            return `
              <tr>
                <td class="col-c" style="font-weight:800;color:var(--muted)">
                  ${idx + 1}
                </td>
                <td>
                  <select data-row-color="${idx}"
                          style="padding:7px 10px;font-weight:800">
                    ${GMS.PRICING_COLORS.map(c => `
                      <option value="${c.key}"
                              ${row.color === c.key ? 'selected' : ''}>
                        ${c.label}
                      </option>
                    `).join('')}
                  </select>
                </td>
                <td class="col-c">
                  <span style="display:inline-block;width:26px;height:26px;
                               border-radius:6px;
                               border:1px solid var(--border);
                               background:${color?.hex || '#6b7a95'}"></span>
                </td>
                <td>
                  <input type="number" data-row-rate="${idx}"
                         step="1" min="0" value="${row.rate || 0}"
                         class="mono"
                         style="font-weight:900;text-align:center">
                </td>
                <td class="col-c">
                  <button class="row-act danger"
                          data-manu-row-remove="${idx}"
                          type="button" title="حذف">
                    <i data-lucide="trash-2"></i>
                  </button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  }

  function renderItemsRows() {
    const d = SetState.manuDraft;
    const rows = d.itemRates || [];

    if (!rows.length) {
      return `
        <div class="empty" style="padding:32px 20px">
          <i data-lucide="shapes"></i>
          <p>لا توجد قطع مسجَّلة</p>
          <span>اضغط "إضافة قطعة" لبدء إدخال الأسعار</span>
        </div>
      `;
    }

    return `
      <table class="tbl" style="font-size:12.5px">
        <thead>
          <tr>
            <th style="width:60px" class="col-c">#</th>
            <th style="width:200px">نوع القطعة</th>
            <th class="col-num">مصنعية (ج.م/جم)</th>
            <th style="width:60px" class="col-c"></th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row, idx) => `
            <tr>
              <td class="col-c" style="font-weight:800;color:var(--muted)">
                ${idx + 1}
              </td>
              <td>
                <select data-row-category="${idx}"
                        style="padding:7px 10px;font-weight:800">
                  ${GMS.CATEGORIES.map(c => `
                    <option value="${c}"
                            ${row.category === c ? 'selected' : ''}>
                      ${c}
                    </option>
                  `).join('')}
                </select>
              </td>
              <td>
                <input type="number" data-row-rate="${idx}"
                       step="1" min="0" value="${row.rate || 0}"
                       class="mono"
                       style="font-weight:900;text-align:center">
              </td>
              <td class="col-c">
                <button class="row-act danger"
                        data-manu-row-remove="${idx}"
                        type="button" title="حذف">
                  <i data-lucide="trash-2"></i>
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  function renderFixedRow() {
    const d = SetState.manuDraft;

    return `
      <div style="padding:20px;background:var(--surface);
                  border-radius:10px;
                  border:1.5px dashed color-mix(in srgb,var(--success) 40%,var(--border));
                  text-align:center">
        <div style="font-size:11.5px;font-weight:800;color:var(--muted);
                    text-transform:uppercase;margin-bottom:12px">
          السعر الثابت لكل القطع
        </div>

        <div style="max-width:280px;margin:0 auto">
          <div class="field">
            <label style="text-align:center;
                          justify-content:center;
                          font-size:12px;
                          color:var(--success)">
              <i data-lucide="equal"
                 style="width:12px;height:12px"></i>
              المصنعية الثابتة (ج.م/جم)
            </label>
            <input type="number" id="manu-fixed-rate"
                   step="1" min="0"
                   value="${d.fixedRate || 0}"
                   class="big mono"
                   style="color:var(--success);font-weight:900">
          </div>
        </div>

        <p style="font-size:11px;color:var(--muted);font-weight:600;
                  margin:12px 0 0;line-height:1.6">
          هذه القيمة ستُستخدم لكل قطعة من هذا المصنع
        </p>
      </div>
    `;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §10 · BINDING MANUFACTURER FORM
     ═════════════════════════════════════════════════════════════════════ */

  function bindManufacturerForm(el) {
    const $ = (sel) => el.querySelector(sel);
    const $id = (id) => el.querySelector('#' + id);

    /* Basic info */
    const codeInput = $id('manu-code');
    if (codeInput) {
      codeInput.oninput = (e) => {
        SetState.manuDraft.code = String(e.target.value || '')
          .toUpperCase().trim().slice(0, 4);
        e.target.value = SetState.manuDraft.code;
      };
    }

    const letterInput = $id('manu-letter');
    if (letterInput) {
      letterInput.oninput = (e) => {
        SetState.manuDraft.letter = String(e.target.value || '').trim().slice(0, 3);
      };
    }

    const nameInput = $id('manu-name');
    if (nameInput) {
      nameInput.oninput = (e) => {
        SetState.manuDraft.name = String(e.target.value || '').trim();
      };
    }

    const phoneInput = $id('manu-phone');
    if (phoneInput) {
      phoneInput.oninput = (e) => {
        SetState.manuDraft.phone = String(e.target.value || '').trim();
      };
    }

    const activeSelect = $id('manu-active');
    if (activeSelect) {
      activeSelect.onchange = (e) => {
        SetState.manuDraft.isActive = e.target.value === '1';
      };
    }

    const notesInput = $id('manu-notes');
    if (notesInput) {
      notesInput.oninput = (e) => {
        SetState.manuDraft.notes = String(e.target.value || '').trim();
      };
    }

    /* Pricing mode buttons */
    el.querySelectorAll('[data-manu-mode]').forEach(btn => {
      btn.onclick = () => {
        const newMode = btn.dataset.manuMode;
        if (newMode === SetState.manuDraft.pricingMode) return;

        SetState.manuDraft.pricingMode = newMode;
        rebuildManufacturerForm(el);
      };
    });

    /* Default rates */
    const purchaseInput = $id('manu-purchase-rate');
    if (purchaseInput) {
      purchaseInput.oninput = (e) => {
        SetState.manuDraft.purchaseRate = parseFloat(e.target.value) || 0;
        updateMarginPreview(el);
      };
    }

    const saleInput = $id('manu-sale-rate');
    if (saleInput) {
      saleInput.oninput = (e) => {
        SetState.manuDraft.saleRate = parseFloat(e.target.value) || 0;
        updateMarginPreview(el);
      };
    }

    /* Add row button */
    const addRowBtn = $id('manu-add-row');
    if (addRowBtn) {
      addRowBtn.onclick = () => addDynamicRow(el);
    }

    /* Dynamic rows inputs */
    bindDynamicRows(el);

    /* Fixed rate */
    const fixedInput = $id('manu-fixed-rate');
    if (fixedInput) {
      fixedInput.oninput = (e) => {
        SetState.manuDraft.fixedRate = parseFloat(e.target.value) || 0;
      };
    }
  }

  function bindDynamicRows(el) {
    const d = SetState.manuDraft;
    if (!d) return;

    /* Letters */
    if (d.pricingMode === 'letters') {
      el.querySelectorAll('[data-row-letter]').forEach(sel => {
        sel.onchange = (e) => {
          const idx = Number(sel.dataset.rowLetter);
          if (d.letterRates[idx]) {
            d.letterRates[idx].letter = e.target.value;
          }
        };
      });
    }

    /* Colors */
    if (d.pricingMode === 'colors') {
      el.querySelectorAll('[data-row-color]').forEach(sel => {
        sel.onchange = (e) => {
          const idx = Number(sel.dataset.rowColor);
          if (d.colorRates[idx]) {
            d.colorRates[idx].color = e.target.value;

            /* تحديث معاينة اللون */
            const color = GMS.getPricingColor(e.target.value);
            const tr = sel.closest('tr');
            const previewSpan = tr?.querySelector('td:nth-child(3) span');
            if (previewSpan && color) {
              previewSpan.style.background = color.hex;
            }
          }
        };
      });
    }

    /* Items */
    if (d.pricingMode === 'items') {
      el.querySelectorAll('[data-row-category]').forEach(sel => {
        sel.onchange = (e) => {
          const idx = Number(sel.dataset.rowCategory);
          if (d.itemRates[idx]) {
            d.itemRates[idx].category = e.target.value;
          }
        };
      });
    }

    /* Rates (all modes) */
    el.querySelectorAll('[data-row-rate]').forEach(inp => {
      inp.oninput = (e) => {
        const idx = Number(inp.dataset.rowRate);
        const val = parseFloat(e.target.value) || 0;

        if (d.pricingMode === 'letters' && d.letterRates[idx]) {
          d.letterRates[idx].rate = val;
        } else if (d.pricingMode === 'colors' && d.colorRates[idx]) {
          d.colorRates[idx].rate = val;
        } else if (d.pricingMode === 'items' && d.itemRates[idx]) {
          d.itemRates[idx].rate = val;
        }
      };
    });

    /* Remove buttons */
    el.querySelectorAll('[data-manu-row-remove]').forEach(btn => {
      btn.onclick = () => {
        const idx = Number(btn.dataset.manuRowRemove);
        removeDynamicRow(el, idx);
      };
    });
  }

  function rebuildManufacturerForm(el) {
    const host = el.querySelector('#manu-modal-body');
    if (!host) return;

    host.innerHTML = renderManufacturerForm();
    window.lucide?.createIcons();
    bindManufacturerForm(el);
  }

  function updateMarginPreview(el) {
    const host = el.querySelector('#manu-margin-preview');
    if (!host) return;

    host.innerHTML = renderMarginPreview();
    window.lucide?.createIcons();
  }

  function addDynamicRow(el) {
    const d = SetState.manuDraft;
    if (!d) return;

    switch (d.pricingMode) {
      case 'letters': {
        /* ابحث عن أول حرف غير مستخدم */
        const used = new Set((d.letterRates || []).map(r => r.letter));
        const nextLetter = GMS.PRICING_LETTERS.find(l => !used.has(l)) || 'أ';

        d.letterRates.push({
          letter: nextLetter,
          rate: 0,
        });
        break;
      }

      case 'colors': {
        const used = new Set((d.colorRates || []).map(r => r.color));
        const nextColor = GMS.PRICING_COLORS.find(c => !used.has(c.key)) || GMS.PRICING_COLORS[0];

        d.colorRates.push({
          color: nextColor.key,
          rate: 0,
        });
        break;
      }

      case 'items': {
        const used = new Set((d.itemRates || []).map(r => r.category));
        const nextCat = GMS.CATEGORIES.find(c => !used.has(c)) || GMS.CATEGORIES[0];

        d.itemRates.push({
          category: nextCat,
          rate: 0,
        });
        break;
      }
    }

    /* إعادة تصيير قائمة الصفوف فقط */
    const rowsHost = el.querySelector('#manu-rows-host');
    if (rowsHost) {
      rowsHost.innerHTML = renderDynamicRows();
      window.lucide?.createIcons();
      bindDynamicRows(el);
    }
  }

  function removeDynamicRow(el, idx) {
    const d = SetState.manuDraft;
    if (!d) return;

    switch (d.pricingMode) {
      case 'letters':
        d.letterRates.splice(idx, 1);
        break;
      case 'colors':
        d.colorRates.splice(idx, 1);
        break;
      case 'items':
        d.itemRates.splice(idx, 1);
        break;
    }

    const rowsHost = el.querySelector('#manu-rows-host');
    if (rowsHost) {
      rowsHost.innerHTML = renderDynamicRows();
      window.lucide?.createIcons();
      bindDynamicRows(el);
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §11 · SAVE MANUFACTURER FROM MODAL
     ═════════════════════════════════════════════════════════════════════ */

  function saveManufacturerFromModal(el, closeFn) {
    const d = SetState.manuDraft;
    if (!d) return;

    /* Validation */
    if (!d.code || d.code.length < 1) {
      GMS.Beep?.error?.();
      return GMS.Toast.err('كود المصنع مطلوب', 'حرف أو رمز قصير (مثلاً: A)');
    }

    if (!d.name || d.name.length < 2) {
      GMS.Beep?.error?.();
      return GMS.Toast.err('اسم المصنع مطلوب');
    }

    /* التحقق من عدم تكرار الكود (في حالة الإضافة) */
    if (!d.id) {
      const existing = SetState.manufacturers.find(
        m => String(m.code).toUpperCase() === String(d.code).toUpperCase()
      );
      if (existing) {
        GMS.Beep?.error?.();
        return GMS.Toast.err(
          'كود المصنع مستخدم',
          `يوجد مصنع آخر بنفس الكود "${d.code}": ${existing.name}`
        );
      }
    } else {
      /* في حالة التعديل — التحقق من عدم تكرار الكود مع مصنع آخر */
      const existing = SetState.manufacturers.find(
        m => m.id !== d.id &&
             String(m.code).toUpperCase() === String(d.code).toUpperCase()
      );
      if (existing) {
        GMS.Beep?.error?.();
        return GMS.Toast.err(
          'كود المصنع مستخدم',
          `مصنع آخر بنفس الكود "${d.code}": ${existing.name}`
        );
      }
    }

    /* التحقق من وجود أسعار */
    if (d.pricingMode === 'letters' && !d.letterRates?.length) {
      const ok = confirm('لم تُضف أي حرف. هل تريد الحفظ على أي حال؟');
      if (!ok) return;
    }

    if (d.pricingMode === 'colors' && !d.colorRates?.length) {
      const ok = confirm('لم تُضف أي لون. هل تريد الحفظ على أي حال؟');
      if (!ok) return;
    }

    if (d.pricingMode === 'items' && !d.itemRates?.length) {
      const ok = confirm('لم تُضف أي قطعة. هل تريد الحفظ على أي حال؟');
      if (!ok) return;
    }

    /* بناء المصنع النهائي */
    const manufacturer = {
      id: d.id || null,
      code: String(d.code || '').toUpperCase().trim(),
      letter: String(d.letter || '').trim(),
      name: String(d.name || '').trim(),
      phone: String(d.phone || '').trim(),
      pricingMode: d.pricingMode || 'fixed',
      letterRates: Array.isArray(d.letterRates) ? [...d.letterRates] : [],
      colorRates: Array.isArray(d.colorRates) ? [...d.colorRates] : [],
      itemRates: Array.isArray(d.itemRates) ? [...d.itemRates] : [],
      fixedRate: Number(d.fixedRate || 0),
      purchaseRate: Number(d.purchaseRate || 0),
      saleRate: Number(d.saleRate || 0),
      rate: Number(d.purchaseRate || 0),  // للتوافق مع الكود القديم
      isActive: d.isActive !== false,
      notes: String(d.notes || '').trim(),
    };

    /* حفظ */
    if (d.id) {
      /* تعديل مصنع موجود */
      const idx = SetState.manufacturers.findIndex(m => m.id === d.id);
      if (idx >= 0) {
        SetState.manufacturers[idx] = {
          ...SetState.manufacturers[idx],
          ...manufacturer,
          updatedAt: new Date().toISOString(),
        };
      }
    } else {
      /* إضافة مصنع جديد */
      manufacturer.id = 'manu-' + GMS.uid();
      manufacturer.createdAt = new Date().toISOString();
      manufacturer.updatedAt = manufacturer.createdAt;
      SetState.manufacturers.push(manufacturer);
    }

    /* علامة "تعديلات غير محفوظة" */
    markManufacturersDirty();

    GMS.Beep?.success?.();
    GMS.Toast.ok(
      d.id ? 'تم تحديث المصنع' : 'تمت إضافة المصنع',
      `${manufacturer.name} — ${manufacturer.code}`
    );

    closeFn();

    /* إعادة تصيير الصفحة */
    render(document.getElementById('page'));

    /* Audit */
    if (GMS.Audit) {
      GMS.Audit.log(
        d.id ? 'UPDATE' : 'CREATE',
        'manufacturers',
        manufacturer.id,
        d.id
          ? `عدّل المصنع ${manufacturer.name}`
          : `أضاف مصنع جديد: ${manufacturer.name} (${manufacturer.code})`,
        {
          code: manufacturer.code,
          pricingMode: manufacturer.pricingMode,
        }
      ).catch(() => {});
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §12 · TAB: RETURNS
     ═════════════════════════════════════════════════════════════════════ */

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
     §13 · TAB: LOSSES
     ═════════════════════════════════════════════════════════════════════ */

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
     §14 · TAB: SYNC
     ═════════════════════════════════════════════════════════════════════ */

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
     §15 · TAB: SUPABASE
     ═════════════════════════════════════════════════════════════════════ */

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
     §16 · TAB: SESSION
     ═════════════════════════════════════════════════════════════════════ */

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
     §17 · TAB: BACKUP
     ═════════════════════════════════════════════════════════════════════ */

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
              الإعدادات، الموردين المحليين، طابور المزامنة، وسجل الحركات،
              وقائمة المصانع.
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
     §18 · TAB: DANGER
     ═════════════════════════════════════════════════════════════════════ */

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
     §19 · MAIN RENDER
     ═════════════════════════════════════════════════════════════════════ */

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
      case 'general':       tabContent = renderGeneralTab(); break;
      case 'appearance':    tabContent = renderAppearanceTab(); break;
      case 'pricing':       tabContent = renderPricingTab(); break;
      case 'manufacturers': tabContent = renderManufacturersTab(); break;
      case 'returns':       tabContent = renderReturnsTab(); break;
      case 'losses':        tabContent = renderLossesTab(); break;
      case 'sync':          tabContent = renderSyncTab(); break;
      case 'supabase':      tabContent = renderSupabaseTab(); break;
      case 'session':       tabContent = renderSessionTab(); break;
      case 'backup':        tabContent = renderBackupTab(); break;
      case 'danger':        tabContent = renderDangerTab(); break;
      default:              tabContent = renderGeneralTab(); break;
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
     §20 · BIND CONTROLS
     ═════════════════════════════════════════════════════════════════════ */

  function bindControls() {
    /* Tabs */
    document.querySelectorAll('[data-set-tab]').forEach(tab => {
      tab.onclick = async () => {
        const key = tab.dataset.setTab;
        if (key === SetState.activeTab) return;

        /* Warn if dirty */
        if (SetState.dirty || SetState.manufacturersDirty) {
          const ok = await GMS.Confirm.ask(
            'لديك تعديلات غير محفوظة. هل تريد المتابعة بدون حفظ؟',
            { title: 'تعديلات غير محفوظة', okText: 'متابعة', danger: true }
          );
          if (!ok) return;
          SetState.dirty = false;
          SetState.manufacturersDirty = false;
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
      case 'general':       bindGeneralTab(); break;
      case 'appearance':    bindAppearanceTab(); break;
      case 'pricing':       bindPricingTab(); break;
      case 'manufacturers': bindManufacturersTab(); break;
      case 'returns':       bindReturnsTab(); break;
      case 'losses':        bindLossesTab(); break;
      case 'sync':          bindSyncTab(); break;
      case 'supabase':      bindSupabaseTab(); break;
      case 'session':       bindSessionTab(); break;
      case 'backup':        bindBackupTab(); break;
      case 'danger':        bindDangerTab(); break;
    }

    /* Warn on navigate away if dirty */
    const beforeUnload = (e) => {
      if (SetState.dirty || SetState.manufacturersDirty) {
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
     §21 · BIND GENERAL TAB
     ═════════════════════════════════════════════════════════════════════ */

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

    /* Goto manufacturers */
    const gotoBtn = document.getElementById('goto-manufacturers-btn');
    if (gotoBtn) {
      gotoBtn.onclick = () => {
        SetState.activeTab = 'manufacturers';
        render(document.getElementById('page'));
      };
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §22 · BIND APPEARANCE TAB
     ═════════════════════════════════════════════════════════════════════ */

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
     §23 · BIND PRICING TAB
     ═════════════════════════════════════════════════════════════════════ */

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
     §24 · ✅ BIND MANUFACTURERS TAB
     ═════════════════════════════════════════════════════════════════════ */

  function bindManufacturersTab() {
    /* Add button (header) */
    const addBtn = document.getElementById('manu-add-new');
    if (addBtn) {
      addBtn.onclick = () => openManufacturerModal();
    }

    /* Add button (empty state) */
    const addEmptyBtn = document.getElementById('manu-add-empty');
    if (addEmptyBtn) {
      addEmptyBtn.onclick = () => openManufacturerModal();
    }

    /* Reset all */
    const resetBtn = document.getElementById('manu-reset-all');
    if (resetBtn) {
      resetBtn.onclick = async () => {
        const ok = await GMS.Confirm.ask(
          'سيتم استرجاع المصانع الافتراضية وحذف كل التعديلات. متابعة؟',
          {
            title: 'إعادة ضبط المصانع',
            okText: 'استرجاع الافتراضي',
            danger: true,
            icon: 'rotate-ccw',
          }
        );
        if (!ok) return;

        SetState.manufacturers = GMS.DEFAULT_MANUFACTURERS.map(m => ({ ...m }));
        markManufacturersDirty();

        GMS.Beep?.success?.();
        GMS.Toast.ok('تم استرجاع المصانع الافتراضية');
        render(document.getElementById('page'));
      };
    }

    /* Action buttons on cards */
    document.querySelectorAll('[data-manu-action]').forEach(btn => {
      btn.onclick = async (e) => {
        e.stopPropagation();

        const action = btn.dataset.manuAction;
        const id = btn.dataset.manuId;

        const manufacturer = SetState.manufacturers.find(m => m.id === id);
        if (!manufacturer) return;

        switch (action) {
          case 'edit':
            openManufacturerModal(manufacturer);
            break;

          case 'toggle':
            manufacturer.isActive = !manufacturer.isActive;
            markManufacturersDirty();
            GMS.Beep?.info?.();
            GMS.Toast.info(
              manufacturer.isActive ? 'تم تفعيل المصنع' : 'تم إيقاف المصنع',
              manufacturer.name
            );
            render(document.getElementById('page'));
            break;

          case 'delete':
            await deleteManufacturer(id, manufacturer);
            break;
        }
      };
    });
  }

  async function deleteManufacturer(id, manufacturer) {
    /* احسب عدد الأصناف المرتبطة (إن أمكن) */
    let usage = 0;
    try {
      if (GMS.IDB?.isOpen) {
        const all = await GMS.IDB.getAll();
        usage = all.filter(i => i.manufacturer_code === manufacturer.code).length;
      } else if (GMS.Demo?.getInventory) {
        usage = GMS.Demo.getInventory()
          .filter(i => i.manufacturer_code === manufacturer.code)
          .length;
      }
    } catch (_) {}

    let msg = `سيتم حذف المصنع "${manufacturer.name}" (${manufacturer.code}).`;
    if (usage > 0) {
      msg += `\n\n⚠️ يوجد ${usage} صنف مرتبط بهذا المصنع في المخزون. الأصناف لن تُحذف، لكنها ستفقد الارتباط بالمصنع.`;
    }
    msg += '\n\nلا يمكن التراجع.';

    const ok = await GMS.Confirm.ask(msg, {
      title: 'حذف المصنع',
      okText: 'حذف',
      danger: true,
      icon: 'trash-2',
    });

    if (!ok) return;

    const idx = SetState.manufacturers.findIndex(m => m.id === id);
    if (idx < 0) return;

    SetState.manufacturers.splice(idx, 1);
    markManufacturersDirty();

    GMS.Beep?.delete?.();
    GMS.Toast.warn('تم الحذف', manufacturer.name);

    render(document.getElementById('page'));

    /* Audit */
    if (GMS.Audit) {
      GMS.Audit.log(
        'DELETE',
        'manufacturers',
        id,
        `حذف المصنع ${manufacturer.name} (${manufacturer.code})`,
        { code: manufacturer.code, usage }
      ).catch(() => {});
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §25 · BIND RETURNS TAB
     ═════════════════════════════════════════════════════════════════════ */

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
     §26 · BIND LOSSES TAB
     ═════════════════════════════════════════════════════════════════════ */

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
     §27 · BIND SYNC TAB
     ═════════════════════════════════════════════════════════════════════ */

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
     §28 · BIND SUPABASE TAB
     ═════════════════════════════════════════════════════════════════════ */

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
     §29 · BIND SESSION TAB
     ═════════════════════════════════════════════════════════════════════ */

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
        SetState.manufacturersDirty = false;

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
     §30 · BIND BACKUP TAB
     ═════════════════════════════════════════════════════════════════════ */

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
     §31 · BIND DANGER TAB
     ═════════════════════════════════════════════════════════════════════ */

  function bindDangerTab() {
    /* Clear LocalStorage */
    const clearLS = document.getElementById('danger-clear-ls');
    if (clearLS) {
      clearLS.onclick = async () => {
        const ok = await GMS.Confirm.danger(
          'سيتم حذف جميع مفاتيح LocalStorage الخاصة بالنظام (الإعدادات، السجلات المحلية، قائمة المصانع). لا يمكن التراجع.'
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
     §32 · SAVE / RESET ALL
     ═════════════════════════════════════════════════════════════════════ */

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

      /* 9 · ✅ Manufacturers */
      if (SetState.manufacturersDirty || SetState.manufacturers.length) {
        try {
          GMS.Cache?.setManufacturersList?.(SetState.manufacturers);
          SetState.manufacturersDirty = false;

          /* إذا Supabase متاح — حفظ نسخة أيضاً */
          if (GMS.Supabase?.isReady?.()) {
            try {
              /* حذف الكل ثم إعادة الإدراج */
              const client = GMS.Supabase.get();
              await client.from('manufacturers').delete().neq('id', 'none');

              const payload = SetState.manufacturers.map(m => ({
                id: m.id,
                code: m.code,
                letter: m.letter || null,
                name: m.name,
                phone: m.phone || null,
                pricing_mode: m.pricingMode,
                letter_rates: m.letterRates || [],
                color_rates: m.colorRates || [],
                item_rates: m.itemRates || [],
                fixed_rate: m.fixedRate || 0,
                purchase_rate: m.purchaseRate || 0,
                sale_rate: m.saleRate || 0,
                is_active: m.isActive !== false,
                notes: m.notes || null,
              }));

              if (payload.length) {
                await client.from('manufacturers').insert(payload);
              }
            } catch (e) {
              console.warn('[Settings] Supabase manufacturers sync failed:', e);
            }
          }
        } catch (e) {
          console.warn('[Settings] Manufacturers save failed:', e);
        }
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
          'حدّث إعدادات النظام',
          {
            manufacturersCount: SetState.manufacturers.length,
          }
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
    if (!SetState.dirty && !SetState.manufacturersDirty) {
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
     §33 · BACKUP / RESTORE
     ═════════════════════════════════════════════════════════════════════ */

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
        /* ✅ Manufacturers */
        manufacturers: SetState.manufacturers,
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

      /* ✅ Restore manufacturers */
      if (data.manufacturers && Array.isArray(data.manufacturers)) {
        try {
          localStorage.setItem(
            GMS.LS_KEYS.MANUFACTURERS,
            JSON.stringify(data.manufacturers)
          );
          SetState.manufacturers = data.manufacturers;
        } catch (_) {}
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

      /* ✅ Manufacturers sheet */
      if (SetState.manufacturers.length) {
        const manuRows = SetState.manufacturers.map(m => {
          const mode = GMS.getPricingMode(m.pricingMode);

          /* تلخيص الأسعار */
          let ratesSummary = '';
          if (m.pricingMode === 'letters') {
            ratesSummary = (m.letterRates || [])
              .map(r => `${r.letter}: ${r.rate}`).join(' · ');
          } else if (m.pricingMode === 'colors') {
            ratesSummary = (m.colorRates || [])
              .map(r => {
                const c = GMS.getPricingColor(r.color);
                return `${c?.label || r.color}: ${r.rate}`;
              }).join(' · ');
          } else if (m.pricingMode === 'items') {
            ratesSummary = (m.itemRates || [])
              .map(r => `${r.category}: ${r.rate}`).join(' · ');
          } else {
            ratesSummary = `ثابت: ${m.fixedRate || 0}`;
          }

          return {
            'الكود': m.code,
            'الرمز': m.letter || '',
            'الاسم': m.name,
            'الهاتف': m.phone || '',
            'نمط التسعير': mode.label,
            'مصنعية الشراء': m.purchaseRate || 0,
            'مصنعية البيع': m.saleRate || 0,
            'هامش الربح': (m.saleRate || 0) - (m.purchaseRate || 0),
            'التفاصيل': ratesSummary,
            'الحالة': m.isActive !== false ? 'نشط' : 'موقوف',
            'ملاحظات': m.notes || '',
          };
        });

        const ws2 = XLSX.utils.json_to_sheet(manuRows);
        ws2['!cols'] = [
          { wch: 8 }, { wch: 8 }, { wch: 25 }, { wch: 14 },
          { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 14 },
          { wch: 60 }, { wch: 10 }, { wch: 25 },
        ];
        XLSX.utils.book_append_sheet(wb, ws2, 'المصانع');
      }

      XLSX.writeFile(wb, `settings_export_${GMS.todayISO()}.xlsx`);
      GMS.Toast.ok('تم التصدير');

    } catch (e) {
      console.error('[Settings.exportAllDataExcel]', e);
      GMS.Toast.err('فشل التصدير', e.message);
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §34 · INIT & CLEANUP
     ═════════════════════════════════════════════════════════════════════ */

  function init() {
    loadSettings();
  }

  function cleanup() {
    cleanupListeners();
  }

  /* ═════════════════════════════════════════════════════════════════════
     §35 · VIEW REGISTRATION
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

    /* Manufacturers */
    openManufacturerModal,
    deleteManufacturer,
    getManufacturers: () => SetState.manufacturers,

    /* Backup */
    exportBackup,
    importBackup,
    exportAllDataExcel,

    /* Helpers */
    markDirty,
    markManufacturersDirty,
  };

  /* ═════════════════════════════════════════════════════════════════════
     §36 · LOADED CONFIRMATION
     ═════════════════════════════════════════════════════════════════════ */
  console.log(
    '%c⚙️  Settings View loaded · 11 tabs',
    'color:#6b7a95;font-weight:800;font-size:12px;padding:1px 5px;' +
    'background:#eef2f8;border-radius:4px;'
  );

  console.log(
    `%c🎛️  General · Appearance · Pricing · Manufacturers · Returns · Losses · Sync · Supabase · Session · Backup · Danger`,
    'color:#6b7a95;font-weight:700;font-size:11px;'
  );

  console.log(
    `%c🏭 Manufacturers: 4 pricing modes (letters/colors/items/fixed) + CRUD`,
    'color:#0f7a43;font-weight:700;font-size:11px;'
  );

  /* ═════════════════════════════════════════════════════════════════════
     ✅ js/21-views-settings.js — نهاية الملف
     ═════════════════════════════════════════════════════════════════════ */

})();
