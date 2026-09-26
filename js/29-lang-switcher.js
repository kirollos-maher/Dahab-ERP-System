/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ENTERPRISE — js/29-lang-switcher.js
   مُبدِّل اللغة المُحصَّن — Hardened Language Switcher
   ✅ يُحمَّل بعد 23-boot.js ويعيد ربط أزرار اللغة بشكل آمن
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const GMS = window.GMS = window.GMS || {};

  /* ─────────────────────────────────────────────────────────────────────
     §1 · الدالة الرئيسية لتبديل اللغة
     ───────────────────────────────────────────────────────────────────── */
  async function switchLanguage(lang) {
    if (!lang || !['ar', 'en'].includes(lang)) lang = 'ar';

    const prevLang = GMS.I18n?.lang || 'ar';
    if (lang === prevLang) {
      updateLangButtons(lang);
      return true;
    }

    try {
      /* 1 · تحديث <html> أولاً — dir + lang */
      const html = document.documentElement;
      html.setAttribute('lang', lang);
      html.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
      html.setAttribute('data-lang', lang);

      /* 2 · استدعاء I18n.setLang (مُحصَّن الآن) */
      if (GMS.I18n?.setLang) {
        GMS.I18n.setLang(lang, { silent: true });
      }

      /* 3 · تحديث أزرار اللغة */
      updateLangButtons(lang);

      /* 4 · إعادة رسم الواجهة الحالية بدون فقدان الحالة */
      await renderCurrentView();

      /* 5 · إشعار */
      GMS.Beep?.info?.();
      GMS.Toast?.ok?.(
        lang === 'ar' ? 'تم التبديل للعربية' : 'Switched to English',
        lang === 'ar' ? 'واجهة RTL' : 'LTR interface'
      );

      return true;

    } catch (err) {
      console.error('[switchLanguage] ❌ فشل التبديل:', err);

      /* Rollback فوري */
      try {
        const html = document.documentElement;
        html.setAttribute('lang', prevLang);
        html.setAttribute('dir', prevLang === 'ar' ? 'rtl' : 'ltr');
        if (GMS.I18n?.setLang) GMS.I18n.setLang(prevLang, { silent: true });
        updateLangButtons(prevLang);
      } catch (_) {}

      showLanguageSwitchFallback(err);
      return false;
    }
  }

  /* ─────────────────────────────────────────────────────────────────────
     §2 · إعادة رسم الواجهة الحالية (بدون location.reload)
     ───────────────────────────────────────────────────────────────────── */
  async function renderCurrentView() {
    const currentRoute = GMS.Router?.currentId?.() || 'dashboard';
    const pageHost = document.getElementById('page');

    /* ─── المسار 1: عبر Router (المسار المفضّل) ─── */
    try {
      if (GMS.Router?.go) {
        await GMS.Router.go(currentRoute, { force: true });
        if (pageHost && pageHost.innerHTML.trim().length > 50) return;
      }
    } catch (e) {
      console.warn('[renderCurrentView] Router.go فشل:', e);
    }

    /* ─── المسار 2: إعادة تصيير مباشرة للـ View ─── */
    try {
      const route = GMS.Router?.getRoute?.(currentRoute);
      if (route && GMS.Views?.[route.view]?.render && pageHost) {
        /* إغلاق أي Modals */
        GMS.Modal?.closeAll?.();

        /* تنظيف الـ View السابق */
        try { GMS.Views[route.view].cleanup?.(); } catch (_) {}

        /* تنظيف صفحة العرض */
        pageHost.innerHTML = `
          <div style="padding:60px;text-align:center">
            <div class="spinner" style="margin:0 auto 14px"></div>
            <div style="font-size:13px;color:var(--muted);font-weight:600">
              ${GMS.I18n?.t?.('status.loading') || 'Loading…'}
            </div>
          </div>`;

        await GMS.Views[route.view].render(pageHost);
        window.lucide?.createIcons();

        if (pageHost.innerHTML.trim().length > 50) return;
      }
    } catch (e) {
      console.warn('[renderCurrentView] Direct render فشل:', e);
    }

    /* ─── المسار 3: Fallback أخير — إعادة تحميل الصفحة ─── */
    console.warn('[renderCurrentView] استخدام fallback: location.reload()');
    location.reload();
  }

  /* ─────────────────────────────────────────────────────────────────────
     §3 · تحديث أزرار اللغة
     ───────────────────────────────────────────────────────────────────── */
  function updateLangButtons(lang) {
    document.querySelectorAll('.lang-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.lang === lang);
    });
  }

  /* ─────────────────────────────────────────────────────────────────────
     §4 · Fallback UI عند الفشل
     ───────────────────────────────────────────────────────────────────── */
  function showLanguageSwitchFallback(error) {
    const pageHost = document.getElementById('page') || document.body;
    const errMsg = error?.message || 'Unknown error';

    pageHost.innerHTML = `
      <div class="card" style="margin:20px auto;max-width:640px">
        <div class="card-body">
          <div class="empty" style="padding:60px 20px">
            <i data-lucide="alert-triangle"
               style="color:var(--warn);width:52px;height:52px;opacity:.7"></i>
            <p style="font-size:16px;margin-top:14px;font-weight:900">
              حدث خطأ أثناء تبديل اللغة
            </p>
            <span style="color:var(--muted);font-size:12px;font-weight:600;
                         display:block;margin-top:8px;line-height:1.7">
              تم استرجاع اللغة السابقة. يمكنك إعادة المحاولة بأمان.
            </span>
            <span style="color:var(--danger);font-family:var(--font-mono);
                         font-size:11px;padding:6px 12px;
                         background:var(--danger-bg);border-radius:8px;
                         display:inline-block;margin-top:14px;font-weight:700">
              ${(GMS.esc ? GMS.esc(errMsg) : errMsg)}
            </span>
            <div style="margin-top:22px;display:flex;gap:9px;justify-content:center;
                        flex-wrap:wrap">
              <button class="btn btn-primary" id="lang-switch-retry">
                <i data-lucide="refresh-cw"></i>
                إعادة التحميل المباشر
              </button>
              <button class="btn btn-ghost" id="lang-switch-home">
                <i data-lucide="home"></i>
                العودة للرئيسية
              </button>
            </div>
          </div>
        </div>
      </div>`;

    window.lucide?.createIcons();

    document.getElementById('lang-switch-retry')?.addEventListener('click', async () => {
      try {
        await renderCurrentView();
      } catch (_) {
        location.reload();
      }
    });

    document.getElementById('lang-switch-home')?.addEventListener('click', () => {
      try { GMS.Router?.go?.('dashboard', { force: true }); }
      catch (_) { location.reload(); }
    });
  }

  /* ─────────────────────────────────────────────────────────────────────
     §5 · إعادة ربط أزرار اللغة (تجاوز 23-boot.js)
     ───────────────────────────────────────────────────────────────────── */
  function bindLanguageButtons() {
    const buttons = document.querySelectorAll('.lang-btn, [data-lang]');
    if (!buttons.length) return;

    buttons.forEach(btn => {
      /* استبدال onclick مباشرة بدون إزالة العنصر */
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const lang = btn.dataset.lang;
        if (!lang) return;
        switchLanguage(lang);
      };
    });

    /* حالة أولية */
    const currentLang = document.documentElement.getAttribute('lang') || 'ar';
    updateLangButtons(currentLang);

    console.log(`[LangSwitcher] ✅ ${buttons.length} زر لغة تم ربطه`);
  }

  /* ─────────────────────────────────────────────────────────────────────
     §6 · التصدير العالمي
     ───────────────────────────────────────────────────────────────────── */
  GMS.switchLanguage = switchLanguage;
  GMS.LangSwitcher = {
    switch: switchLanguage,
    render: renderCurrentView,
    fallback: showLanguageSwitchFallback,
    bind: bindLanguageButtons,
  };

  /* ─────────────────────────────────────────────────────────────────────
     §7 · Auto-init
     ───────────────────────────────────────────────────────────────────── */
  function init() {
    /* ربط الأزرار بعد تحميل DOM */
    bindLanguageButtons();

    /* إعادة الربط في حال أُعيد رسم الـ topbar */
    const observer = new MutationObserver(() => {
      const btns = document.querySelectorAll('.lang-btn');
      if (btns.length && !btns[0].onclick) {
        bindLanguageButtons();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    /* انتظار boot ليُكمل */
    window.addEventListener('gms:ready', bindLanguageButtons, { once: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 400));
  } else {
    setTimeout(init, 400);
  }

  console.log(
    '%c🌍 LangSwitcher loaded · Hardened language switching',
    'color:#6b3fa0;font-weight:900;font-size:12px;padding:1px 5px;' +
    'background:#f0e9fa;border-radius:4px;'
  );

})();