/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ENTERPRISE — js/00-interaction-guard.js
   Global Interaction Guard — يحمي التفاعل على كل المستويات:
     1. LOCK: منع Rerender بعد أي تفاعل
     2. SELECT GUARD: منع أي تغيير في DOM أثناء فتح <select>
     3. FOCUS GUARD: منع سرقة الـ focus من المستخدم
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const GMS = window.GMS = window.GMS || {};

  /* ─── الإعدادات ─── */
  const LOCK_MS = 15000;               /* قفل بعد أي تفاعل */
  const SELECT_LOCK_MS = 60000;        /* قفل أثناء فتح select */
  const SELECT_GRACE_MS = 2000;        /* فترة سماح بعد اختيار */
  const FOCUS_LOCK_MS = 800;           /* منع سرقة focus لمدة 800ms */
  const FOCUS_BLOCK_SAME_MS = 250;     /* منع نفس الحقل يسرق focus خلال 250ms */

  window.GMS._lastInteraction = 0;
  window.GMS._lastFormInteraction = 0;

  /* ─── حالة داخلية ─── */
  let _selectOpenUntil = 0;
  let _focusLockUntil = 0;
  let _lastClickedField = null;
  let _lastClickedFieldAt = 0;

  /* ═════════════════════════════════════════════════════════════════════
     §1 · HELPERS
     ═════════════════════════════════════════════════════════════════════ */

  function markInteraction(isForm) {
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

  function hasOpenModal() {
    try {
      if (GMS.Modal && typeof GMS.Modal.count === 'function') {
        return GMS.Modal.count() > 0;
      }
      return document.querySelectorAll('.overlay').length > 0;
    } catch (_) {
      return false;
    }
  }

  function isSelectOpen() {
    /* ✅ فحص 1: قفل مؤقت من آخر select */
    if (Date.now() < _selectOpenUntil) return true;

    /* ✅ فحص 2: فيه select في focus الآن */
    const active = document.activeElement;
    if (active && active.tagName === 'SELECT') return true;

    return false;
  }

  function isFocusLocked() {
    return Date.now() < _focusLockUntil;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §2 · SELECT GUARD — حماية القوائم المنسدلة
     ═════════════════════════════════════════════════════════════════════ */

  /* على pointerdown على select → اقفل لمدة 60 ثانية */
  document.addEventListener('pointerdown', (e) => {
    const t = e.target;
    if (!t) return;
    if (t.tagName === 'SELECT') {
      _selectOpenUntil = Date.now() + SELECT_LOCK_MS;
      console.log('[Guard] 🔒 Select OPEN — locked until:', 
        new Date(_selectOpenUntil).toLocaleTimeString());
    }
  }, true);

  /* على focus على select → اقفل */
  document.addEventListener('focusin', (e) => {
    const t = e.target;
    if (!t) return;
    if (t.tagName === 'SELECT') {
      _selectOpenUntil = Date.now() + SELECT_LOCK_MS;
    }
  }, true);

  /* على change في select → اقفل لفترة سماح قصيرة */
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t && t.tagName === 'SELECT') {
      _selectOpenUntil = Math.max(_selectOpenUntil, Date.now() + SELECT_GRACE_MS);
      console.log('[Guard] 🔓 Select CHANGED — grace 2s');
    }
  }, true);

  /* على blur في select → اقفل لفترة قصيرة */
  document.addEventListener('blur', (e) => {
    const t = e.target;
    if (t && t.tagName === 'SELECT') {
      _selectOpenUntil = Math.max(_selectOpenUntil, Date.now() + 500);
    }
  }, true);

  /* ═════════════════════════════════════════════════════════════════════
     §3 · FOCUS GUARD — منع سرقة الـ focus من المستخدم
     ═════════════════════════════════════════════════════════════════════ */

  /* على أي click على حقل → سجّل الحقل + اقفل 800ms */
  document.addEventListener('pointerdown', (e) => {
    const t = e.target;
    if (!t) return;
    const isField = (
      t.tagName === 'INPUT' ||
      t.tagName === 'TEXTAREA' ||
      t.tagName === 'SELECT' ||
      t.isContentEditable === true
    );
    if (isField) {
      _lastClickedField = t;
      _lastClickedFieldAt = Date.now();
      _focusLockUntil = Date.now() + FOCUS_LOCK_MS;
    }
  }, true);

  /* ✅ الاعتراض على HTMLElement.prototype.focus */
  if (typeof HTMLElement !== 'undefined' && HTMLElement.prototype) {
    const originalFocus = HTMLElement.prototype.focus;

    HTMLElement.prototype.focus = function (options) {
      const now = Date.now();
      const timeSinceClick = now - _lastClickedFieldAt;
      const active = document.activeElement;

      /* ✅ فحص 1: المستخدم لسه ضغط على حقل آخر خلال FOCUS_LOCK_MS */
      if (timeSinceClick < FOCUS_LOCK_MS &&
          _lastClickedField &&
          _lastClickedField !== this &&
          active &&
          active !== this &&
          active !== document.body &&
          active !== document.documentElement &&
          (active.tagName === 'INPUT' ||
           active.tagName === 'TEXTAREA' ||
           active.tagName === 'SELECT' ||
           active.isContentEditable === true)) {
        console.log(
          '%c🛡️ Focus BLOCKED on',
          'color:#b3261e;font-weight:800;',
          this.id || this.className || this.tagName,
          '— user is on',
          active.id || active.className || active.tagName
        );
        return;
      }

      /* ✅ فحص 2: فيه select مفتوح الآن */
      if (isSelectOpen() && this.tagName !== 'SELECT') {
        console.log(
          '%c🛡️ Focus BLOCKED (select open) on',
          'color:#b3261e;font-weight:800;',
          this.id || this.className || this.tagName
        );
        return;
      }

      /* ✅ فحص 3: فيه modal مفتوح وthis ليس داخل الـ modal */
      if (hasOpenModal()) {
        try {
          const modalRoot = document.getElementById('modal-root');
          if (modalRoot && !modalRoot.contains(this)) {
            /* اسمح بالـ focus فقط داخل modal */
            if (document.activeElement === document.body) {
              /* لو مافيش حاجة focused، اسمح */
            } else {
              console.log(
                '%c🛡️ Focus BLOCKED (modal open) on',
                'color:#b3261e;font-weight:800;',
                this.id || this.className || this.tagName
              );
              return;
            }
          }
        } catch (_) {}
      }

      /* ✅ اسمح بالـ focus */
      try {
        return originalFocus.call(this, options);
      } catch (e) {
        /* fallback للـ Safari القديم */
        return originalFocus.call(this);
      }
    };

    console.log('[Guard] ✅ HTMLElement.focus overridden');
  }

  /* ═════════════════════════════════════════════════════════════════════
     §4 · INTERACTION TRACKING
     ═════════════════════════════════════════════════════════════════════ */

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
    document.addEventListener(evt, (e) => {
      const t = e.target;
      if (!t) return markInteraction(false);

      const tag = t.tagName;
      const isForm = (
        tag === 'INPUT' ||
        tag === 'SELECT' ||
        tag === 'TEXTAREA' ||
        t.isContentEditable === true
      );

      markInteraction(isForm);
    }, true);
  });

  /* مراقبة أي تغيير في DOM كتفاعل */
  try {
    const observer = new MutationObserver(() => {
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
  } catch (_) {}

  /* ═════════════════════════════════════════════════════════════════════
     §5 · PUBLIC API
     ═════════════════════════════════════════════════════════════════════ */

  GMS.InteractionGuard = {
    isLocked,
    isTypingNow,
    hasOpenModal,
    isSelectOpen,
    isFocusLocked,
    markInteraction,
    lockMs: LOCK_MS,
    selectLockMs: SELECT_LOCK_MS,
    focusLockMs: FOCUS_LOCK_MS,

    /**
     * فحص شامل — يُستخدم من Router
     */
    shouldBlock() {
      if (hasOpenModal()) return true;
      if (isSelectOpen()) return true;
      if (isTypingNow()) return true;
      if (isLocked()) return true;
      return false;
    },

    /**
     * فك كل الأقفال (للاختبار)
     */
    release() {
      window.GMS._lastInteraction = 0;
      window.GMS._lastFormInteraction = 0;
      _selectOpenUntil = 0;
      _focusLockUntil = 0;
      _lastClickedField = null;
      _lastClickedFieldAt = 0;
    },

    /**
     * Diagnostics
     */
    getState() {
      return {
        locked: isLocked(),
        typing: isTypingNow(),
        selectOpen: isSelectOpen(),
        focusLocked: isFocusLocked(),
        modalOpen: hasOpenModal(),
        lastClickedField: _lastClickedField
          ? (_lastClickedField.id || _lastClickedField.className || _lastClickedField.tagName)
          : null,
        lockRemainingMs: Math.max(0, LOCK_MS - (Date.now() - window.GMS._lastInteraction)),
        selectLockRemainingMs: Math.max(0, _selectOpenUntil - Date.now()),
        focusLockRemainingMs: Math.max(0, _focusLockUntil - Date.now()),
      };
    },
  };

  console.log(
    '%c🛡️  Interaction Guard v2 loaded',
    'color:#b3261e;font-weight:900;font-size:13px;padding:2px 6px;' +
    'background:#fdecea;border-radius:4px;'
  );

  console.log(
    `%c🔒 Lock: ${LOCK_MS}ms · Select: ${SELECT_LOCK_MS}ms · ` +
    `Focus: ${FOCUS_LOCK_MS}ms · Focus override: ACTIVE`,
    'color:#6b7a95;font-weight:700;font-size:11px;'
  );
})();
