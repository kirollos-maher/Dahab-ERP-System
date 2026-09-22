/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ENTERPRISE — js/00-interaction-guard.js
   Global Interaction Lock — يمنع أي Rerender أثناء تفاعل المستخدم
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const GMS = window.GMS = window.GMS || {};

  /* ✅ مدة القفل — 15 ثانية عشان تغطي الـ dropdowns */
  const LOCK_MS = 15000;

  window.GMS._lastInteraction = 0;
  window.GMS._lastFormInteraction = 0;

  function markInteraction(isForm = false) {
    const now = Date.now();
    window.GMS._lastInteraction = now;
    if (isForm) window.GMS._lastFormInteraction = now;
  }

  function isLocked() {
    return (Date.now() - window.GMS._lastInteraction) < LOCK_MS;
  }

  function isTypingNow() {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName;
    return (
      tag === 'INPUT' ||
      tag === 'SELECT' ||
      tag === 'TEXTAREA' ||
      el.isContentEditable === true
    );
  }

  /* ✅ فحص وجود dropdown مفتوح */
  function hasOpenDropdown() {
    try {
      /* select في focus */
      const active = document.activeElement;
      if (active && active.tagName === 'SELECT') return true;

      /* أي select أو input له list مفتوح */
      if (active && active.tagName === 'INPUT' && active.getAttribute('list')) {
        return true;
      }
    } catch (_) {}
    return false;
  }

  /* ✅ فحص وجود modal مفتوح */
  function hasOpenModal() {
    try {
      if (GMS.Modal && typeof GMS.Modal.count === 'function') {
        return GMS.Modal.count() > 0;
      }
      /* fallback */
      return document.querySelectorAll('.overlay').length > 0;
    } catch (_) {
      return false;
    }
  }

  /* ─── مراقبة كل التفاعلات على مستوى document (capture) ─── */
  const interactionEvents = [
    'pointerdown',
    'mousedown',
    'touchstart',
    'focusin',
    'keydown',
    'input',
    'change',
    'click',
  ];

  interactionEvents.forEach((evt) => {
    document.addEventListener(
      evt,
      (e) => {
        const t = e.target;
        if (!t) return markInteraction(false);

        const tag = t.tagName;
        const isForm =
          tag === 'INPUT' ||
          tag === 'SELECT' ||
          tag === 'TEXTAREA' ||
          t.isContentEditable === true;

        markInteraction(isForm);
      },
      true
    );
  });

  /* ✅ راقب فتح/إغلاق modals لتحديث القفل */
  const observer = new MutationObserver(() => {
    /* أي mutation في DOM تعني تفاعل */
    markInteraction(false);
  });

  if (document.body) {
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false,
    });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    });
  }

  GMS.InteractionGuard = {
    isLocked,
    isTypingNow,
    hasOpenDropdown,
    hasOpenModal,
    markInteraction,
    lockMs: LOCK_MS,

    /**
     * فحص شامل
     */
    shouldBlock() {
      if (hasOpenModal()) return true;
      if (isTypingNow()) return true;
      if (hasOpenDropdown()) return true;
      if (isLocked()) return true;
      return false;
    },

    release() {
      window.GMS._lastInteraction = 0;
      window.GMS._lastFormInteraction = 0;
    },
  };

  console.log(
    '%c🛡️  Interaction Guard loaded · Lock: ' + LOCK_MS + 'ms',
    'color:#b3261e;font-weight:800;font-size:12px;padding:1px 5px;' +
    'background:#fdecea;border-radius:4px;'
  );
})();
