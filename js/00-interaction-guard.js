/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ENTERPRISE — js/00-interaction-guard.js
   Global Interaction Lock — يمنع أي Rerender أثناء تفاعل المستخدم
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const GMS = window.GMS = window.GMS || {};

  /* مدة القفل بعد آخر تفاعل */
  const LOCK_MS = 5000;

  window.GMS._lastInteraction = 0;
  window.GMS._lastFormInteraction = 0;

  /**
   * تسجيل تفاعل
   */
  function markInteraction(isForm = false) {
    const now = Date.now();
    window.GMS._lastInteraction = now;
    if (isForm) window.GMS._lastFormInteraction = now;
  }

  /**
   * هل النظام في قفل تفاعل؟
   */
  function isLocked() {
    return (Date.now() - window.GMS._lastInteraction) < LOCK_MS;
  }

  /**
   * هل المستخدم يكتب في حقل الآن؟
   */
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

  /* ─── API عامة ─── */
  GMS.InteractionGuard = {
    isLocked,
    isTypingNow,
    markInteraction,
    lockMs: LOCK_MS,

    /**
     * فحص شامل — يُستخدم من Router
     */
    shouldBlock() {
      if (isTypingNow()) return true;
      if (isLocked()) return true;
      return false;
    },

    /**
     * فك القفل يدويًا (للاختبار)
     */
    release() {
      window.GMS._lastInteraction = 0;
      window.GMS._lastFormInteraction = 0;
    },
  };

  console.log(
    '%c🛡️  Interaction Guard loaded · Rerender blocked for ' + LOCK_MS + 'ms after any interaction',
    'color:#b3261e;font-weight:800;font-size:12px;padding:1px 5px;' +
    'background:#fdecea;border-radius:4px;'
  );
})();