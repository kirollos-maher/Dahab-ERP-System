/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ENTERPRISE — js/07-ui.js
   مكونات واجهة المستخدم الأساسية:
     - Toast Notifications (إشعارات)
     - Modals (النوافذ المنبثقة)
     - Confirmation Dialogs (نوافذ التأكيد)
     - Loading Indicators (مؤشرات التحميل)
     - Notification Center (مركز الإشعارات)
     - Sound Feedback (التنبيهات الصوتية)
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const GMS = window.GMS = window.GMS || {};

  /* ═════════════════════════════════════════════════════════════════════
     §1 · UI STATE
     ═════════════════════════════════════════════════════════════════════ */
  const UIState = {
    /* Modals نشطة */
    activeModals: [],

    /* Modal stack */
    modalStack: [],

    /* Loading overlays نشطة */
    loadingCount: 0,

    /* سجل الإشعارات */
    notifications: [],
    maxNotifications: 100,

    /* حالة الصوت */
    soundEnabled: true,

    /* مستمعو الأحداث */
    listeners: {
      modalOpen: new Set(),
      modalClose: new Set(),
      toastShow: new Set(),
      notificationAdd: new Set(),
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §2 · EVENT EMITTER
     ═════════════════════════════════════════════════════════════════════ */

  function emit(event, data) {
    const set = UIState.listeners[event];
    if (!set) return;

    set.forEach(fn => {
      try {
        fn(data);
      } catch (e) {
        console.error(`[UI.emit:${event}]`, e);
      }
    });
  }

  function on(event, fn) {
    const set = UIState.listeners[event];
    if (!set || typeof fn !== 'function') return () => {};

    set.add(fn);
    return () => set.delete(fn);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §3 · SOUND ENGINE (Web Audio API)
     ═════════════════════════════════════════════════════════════════════ */
  const Sound = {
    ctx: null,
    enabled: true,
    _lastPlay: 0,

    /**
     * تهيئة AudioContext
     */
    init() {
      if (this.ctx) return;

      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) {
          this.ctx = new AC({ latencyHint: 'interactive' });
        }
      } catch (e) {
        console.warn('[Sound] AudioContext init failed:', e.message);
      }
    },

    /**
     * تفعيل السياق (يحتاج تفاعل المستخدم)
     * @returns {Promise<void>}
     */
    async unlock() {
      this.init();
      if (this.ctx?.state === 'suspended') {
        try {
          await this.ctx.resume();
        } catch (_) {}
      }
    },

    /**
     * تشغيل نغمة
     * @param {number} freq
     * @param {number} durMs
     * @param {Object} [opts={}]
     * @param {number} [opts.vol=0.15]
     * @param {'sine'|'square'|'triangle'|'sawtooth'} [opts.type='sine']
     * @param {number} [opts.delay=0]
     * @private
     */
    _tone(freq, durMs, opts = {}) {
      if (!this.enabled) return;
      if (this.ctx?.state === 'suspended') return;

      this.init();
      if (!this.ctx) return;

      const {
        vol = 0.15,
        type = 'sine',
        delay = 0,
      } = opts;

      // منع الازدحام
      const now = performance.now();
      if (now - this._lastPlay < 25) return;
      this._lastPlay = now;

      const t0 = this.ctx.currentTime + delay / 1000;
      const dur = durMs / 1000;

      try {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, t0);

        gain.gain.setValueAtTime(0, t0);
        gain.gain.linearRampToValueAtTime(vol, t0 + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(t0);
        osc.stop(t0 + dur + 0.02);
      } catch (e) {
        // تجاهل الأخطاء الصوتية
      }
    },

    /**
     * نغمة نجاح (صاعدتين)
     */
    success() {
      this._tone(1180, 55, { vol: 0.15, type: 'sine', delay: 0 });
      this._tone(1560, 65, { vol: 0.13, type: 'sine', delay: 55 });
    },

    /**
     * نغمة خطأ (buzz منخفض)
     */
    error() {
      this._tone(220, 190, { vol: 0.13, type: 'square', delay: 0 });
    },

    /**
     * نغمة تحذير
     */
    warning() {
      this._tone(440, 100, { vol: 0.12, type: 'triangle', delay: 0 });
      this._tone(330, 150, { vol: 0.12, type: 'triangle', delay: 110 });
    },

    /**
     * نغمة معلومة (click خفيف)
     */
    info() {
      this._tone(2400, 25, { vol: 0.06, type: 'sine', delay: 0 });
    },

    /**
     * نغمة إتمام (3 نغمات)
     */
    complete() {
      this._tone(880, 70, { vol: 0.15, type: 'sine', delay: 0 });
      this._tone(1180, 70, { vol: 0.15, type: 'sine', delay: 85 });
      this._tone(1560, 130, { vol: 0.15, type: 'sine', delay: 170 });
    },

    /**
     * نغمة حذف
     */
    delete() {
      this._tone(520, 70, { vol: 0.12, type: 'triangle', delay: 0 });
      this._tone(350, 100, { vol: 0.12, type: 'triangle', delay: 80 });
    },

    /**
     * نغمة فتح
     */
    open() {
      this._tone(880, 45, { vol: 0.10, type: 'sine', delay: 0 });
    },

    /**
     * نغمة إغلاق
     */
    close() {
      this._tone(660, 45, { vol: 0.10, type: 'sine', delay: 0 });
    },

    /**
     * نغمة مفتاح
     */
    keypress() {
      this._tone(1800, 18, { vol: 0.04, type: 'sine', delay: 0 });
    },

    /**
     * تفعيل/تعطيل
     * @param {boolean} enabled
     */
    setEnabled(enabled) {
      this.enabled = Boolean(enabled);
      try {
        localStorage.setItem(GMS.LS_KEYS.SOUND, JSON.stringify(this.enabled));
      } catch (_) {}
    },

    /**
     * قراءة الحالة
     * @returns {boolean}
     */
    isEnabled() {
      return this.enabled;
    },

    /**
     * تبديل
     */
    toggle() {
      this.setEnabled(!this.enabled);
      if (this.enabled) {
        this.unlock().then(() => this.success());
      }
    },

    /**
     * تحميل الحالة من التخزين
     */
    load() {
      try {
        const stored = localStorage.getItem(GMS.LS_KEYS.SOUND);
        if (stored !== null) {
          this.enabled = JSON.parse(stored);
        }
      } catch (_) {}
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §4 · TOAST SYSTEM
     ═════════════════════════════════════════════════════════════════════ */
  const Toast = {

    /* قائمة الـ toasts النشطة */
    activeToasts: new Set(),

    /**
     * إظهار toast
     * @param {Object} opts
     * @param {string} opts.title
     * @param {string} [opts.desc='']
     * @param {'ok'|'err'|'warn'|'info'} [opts.type='info']
     * @param {string} [opts.icon] — أيقونة Lucide
     * @param {number} [opts.ms=3500] — مدة العرض
     * @param {boolean} [opts.closable=true]
     * @param {boolean} [opts.sound=true] — تشغيل نغمة
     * @param {Function} [opts.action] — callback للزر
     * @param {string} [opts.actionLabel] — نص زر الإجراء
     * @returns {Object} — { id, dismiss }
     */
    show(opts = {}) {
      const {
        title = '',
        desc = '',
        type = 'info',
        icon = null,
        ms = 3500,
        closable = true,
        sound = true,
        action = null,
        actionLabel = '',
      } = opts;

      const host = document.getElementById('toasts');
      if (!host) {
        console.warn('[Toast] No #toasts container');
        return { id: null, dismiss: () => {} };
      }

      const id = GMS.uid();

      /* أيقونة تلقائية */
      const autoIcon = {
        ok: 'check-circle-2',
        err: 'alert-circle',
        warn: 'alert-triangle',
        info: 'info',
      }[type] || 'info';

      /* نغمة */
      if (sound) {
        if (type === 'ok') Sound.success();
        else if (type === 'err') Sound.error();
        else if (type === 'warn') Sound.warning();
        else Sound.info();
      }

      /* عنصر Toast */
      const el = document.createElement('div');
      el.className = `toast ${type}`;
      el.dataset.toastId = id;

      el.innerHTML = `
        <i data-lucide="${icon || autoIcon}"></i>
        <div class="toast-body">
          <div class="toast-title">${GMS.esc(title)}</div>
          ${desc ? `<div class="toast-desc">${GMS.esc(desc)}</div>` : ''}
          ${action && actionLabel ? `
            <button class="btn btn-sm btn-primary" style="margin-top:8px" data-toast-action>
              ${GMS.esc(actionLabel)}
            </button>
          ` : ''}
        </div>
        ${closable ? `
          <button class="icon-btn" style="width:24px;height:24px;flex-shrink:0"
                  data-toast-close aria-label="Close">
            <i data-lucide="x"></i>
          </button>
        ` : ''}
      `;

      host.appendChild(el);
      window.lucide?.createIcons();

      /* حفظ مرجع */
      const toastRef = { id, el, dismiss };
      this.activeToasts.add(toastRef);

      /* أحداث */
      const closeBtn = el.querySelector('[data-toast-close]');
      if (closeBtn) {
        closeBtn.onclick = () => dismiss();
      }

      const actionBtn = el.querySelector('[data-toast-action]');
      if (actionBtn && action) {
        actionBtn.onclick = () => {
          try {
            action();
          } catch (e) {
            console.error('[Toast.action]', e);
          }
          dismiss();
        };
      }

      /* إغلاق تلقائي */
      let timer = null;
      if (ms > 0) {
        timer = setTimeout(() => dismiss(), ms);
      }

      /* إيقاف عند hover */
      el.addEventListener('mouseenter', () => {
        if (timer) clearTimeout(timer);
      });

      el.addEventListener('mouseleave', () => {
        if (ms > 0) {
          timer = setTimeout(() => dismiss(), Math.min(ms, 2000));
        }
      });

      /* إغلاق */
      function dismiss() {
        if (timer) clearTimeout(timer);

        el.style.opacity = '0';
        el.style.transform = 'translateX(-22px)';
        el.style.transition = 'all .22s';

        setTimeout(() => {
          el.remove();
          /* ✅ FIX: كان UIState.activeToasts (غير موجود) — الصحيح Toast.activeToasts */
          Toast.activeToasts.delete(toastRef);
        }, 240);
      }

      emit('toastShow', { id, type, title, desc });

      return toastRef;
    },

    /**
     * اختصارات
     */
    ok(title, desc, opts) {
      return this.show({ title, desc, type: 'ok', ...(opts || {}) });
    },

    err(title, desc, opts) {
      return this.show({ title, desc, type: 'err', ms: 5000, ...(opts || {}) });
    },

    warn(title, desc, opts) {
      return this.show({ title, desc, type: 'warn', ms: 4500, ...(opts || {}) });
    },

    info(title, desc, opts) {
      return this.show({ title, desc, type: 'info', ...(opts || {}) });
    },

    /**
     * إغلاق كل الـ toasts
     */
    clearAll() {
      Array.from(this.activeToasts).forEach(t => t.dismiss());
    },

    /**
     * عدد الـ toasts النشطة
     * @returns {number}
     */
    count() {
      return this.activeToasts.size;
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §5 · MODAL SYSTEM
     ═════════════════════════════════════════════════════════════════════ */
  const Modal = {

    /**
     * فتح modal
     * @param {Object} opts
     * @param {string} opts.title
     * @param {string} [opts.icon='circle']
     * @param {string} [opts.body=''] — HTML
     * @param {string} [opts.footer=''] — HTML
     * @param {'sm'|''|'lg'|'xl'} [opts.size='']
     * @param {boolean} [opts.closable=true]
     * @param {boolean} [opts.backdropClose=true] — الإغلاق عند النقر خارج النافذة
     * @param {boolean} [opts.escClose=true]
     * @param {Function} [opts.onMount] — (el, close) => {}
     * @param {Function} [opts.onClose] — () => {}
     * @param {Function} [opts.onBeforeClose] — () => boolean | Promise<boolean>
     * @returns {{ id, el, close, update }}
     */
    open(opts = {}) {
      const {
        title = '',
        icon = 'circle',
        body = '',
        footer = '',
        size = '',
        closable = true,
        backdropClose = true,
        escClose = true,
        onMount = null,
        onClose = null,
        onBeforeClose = null,
      } = opts;

      const id = GMS.uid();
      const host = document.getElementById('modal-root');
      if (!host) {
        console.warn('[Modal] No #modal-root container');
        return { id: null, el: null, close: () => {}, update: () => {} };
      }

      /* نغمة الفتح */
      Sound.open();

      /* منع التمرير */
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      /* عنصر Modal */
      const overlay = document.createElement('div');
      overlay.className = 'overlay';
      overlay.dataset.modalId = id;

      overlay.innerHTML = `
        <div class="modal ${size}" role="dialog" aria-modal="true">
          <div class="modal-head">
            <h3>
              <i data-lucide="${icon}"></i>
              <span>${GMS.esc(title)}</span>
            </h3>
            ${closable ? `
              <button class="icon-btn" data-modal-close
                      style="width:32px;height:32px" aria-label="Close">
                <i data-lucide="x"></i>
              </button>
            ` : ''}
          </div>
          <div class="modal-body">${body}</div>
          ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
        </div>
      `;

      host.appendChild(overlay);
      window.lucide?.createIcons();

      const modalEl = overlay.querySelector('.modal');

      /* مرجع */
      const modalRef = {
        id,
        el: modalEl,
        overlay,
        close: null,
        update: null,
      };

      UIState.activeModals.push(modalRef);
      UIState.modalStack.push(id);

      /* تنفيذ onMount */
      if (onMount) {
        try {
          onMount(modalEl, () => close(), modalRef);
        } catch (e) {
          console.error('[Modal.onMount]', e);
        }
      }

      /* الإغلاق */
      async function close(force = false) {
        /* onBeforeClose */
        if (!force && onBeforeClose) {
          try {
            const result = await onBeforeClose();
            if (result === false) return;
          } catch (e) {
            console.error('[Modal.onBeforeClose]', e);
            return;
          }
        }

        /* نغمة الإغلاق */
        Sound.close();

        /* إزالة من السجلات */
        const idx = UIState.activeModals.findIndex(m => m.id === id);
        if (idx >= 0) UIState.activeModals.splice(idx, 1);

        const stackIdx = UIState.modalStack.indexOf(id);
        if (stackIdx >= 0) UIState.modalStack.splice(stackIdx, 1);

        /* استعادة التمرير إذا لم توجد modals أخرى */
        if (UIState.activeModals.length === 0) {
          document.body.style.overflow = prevOverflow;
        }

        /* إغلاق مرئي */
        overlay.style.opacity = '0';
        setTimeout(() => {
          overlay.remove();
          if (onClose) {
            try {
              onClose();
            } catch (e) {
              console.error('[Modal.onClose]', e);
            }
          }
          emit('modalClose', { id });
        }, 160);
      }

      modalRef.close = close;

      /* تحديث المحتوى */
      modalRef.update = (newBody) => {
        const bodyEl = modalEl.querySelector('.modal-body');
        if (bodyEl) bodyEl.innerHTML = newBody;
        window.lucide?.createIcons();
      };

      /* زر الإغلاق */
       overlay.querySelectorAll('[data-close]').forEach(btn => {
        if (!btn.onclick) {
          btn.onclick = () => close();
        }
      });

      /* النقر على الخلفية */
      if (backdropClose) {
        overlay.addEventListener('mousedown', (e) => {
          if (e.target === overlay) close();
        });
      }

      /* Escape */
      if (escClose) {
        const escHandler = (e) => {
          if (e.key === 'Escape') {
            /* فقط إذا كان أعلى modal */
            if (UIState.modalStack[UIState.modalStack.length - 1] === id) {
              close();
              document.removeEventListener('keydown', escHandler);
            }
          }
        };
        document.addEventListener('keydown', escHandler);
      }

      emit('modalOpen', { id, title });

      return modalRef;
    },

    /**
     * إغلاق modal بالمعرف
     * @param {string} id
     */
    close(id) {
      const modal = UIState.activeModals.find(m => m.id === id);
      if (modal) modal.close();
    },

    /**
     * إغلاق آخر modal
     */
    closeTop() {
      const id = UIState.modalStack[UIState.modalStack.length - 1];
      if (id) this.close(id);
    },

    /**
     * إغلاق كل الـ modals
     */
    closeAll() {
      Array.from(UIState.activeModals).forEach(m => m.close(true));
    },

    /**
     * عدد الـ modals النشطة
     * @returns {number}
     */
    count() {
      return UIState.activeModals.length;
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §6 · CONFIRM DIALOG
     ═════════════════════════════════════════════════════════════════════ */
  const Confirm = {

    /**
     * نافذة تأكيد عامة
     * @param {string} message
     * @param {Object} [opts={}]
     * @param {string} [opts.title='تأكيد']
     * @param {string} [opts.okText='تأكيد']
     * @param {string} [opts.cancelText='إلغاء']
     * @param {boolean} [opts.danger=false]
     * @param {string} [opts.icon='alert-triangle']
     * @param {boolean} [opts.backdropClose=true]
     * @returns {Promise<boolean>}
     */
    ask(message, opts = {}) {
      const {
        title = GMS.t('modal.confirm.title'),
        okText = GMS.t('action.confirm'),
        cancelText = GMS.t('action.cancel'),
        danger = false,
        icon = 'alert-triangle',
        backdropClose = true,
      } = opts;

      return new Promise((resolve) => {
        const modal = Modal.open({
          title,
          icon,
          size: 'sm',
          backdropClose,
          escClose: true,
          body: `
            <p style="margin:0;font-size:13.5px;line-height:1.75;
                      color:var(--text-2);text-align:center">
              ${GMS.esc(message)}
            </p>
          `,
          footer: `
            <button class="btn" data-confirm-cancel>
              ${GMS.esc(cancelText)}
            </button>
            <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}"
                    data-confirm-ok>
              ${GMS.esc(okText)}
            </button>
          `,
          onMount: (el, close) => {
            el.querySelector('[data-confirm-cancel]').onclick = () => {
              close();
              resolve(false);
            };

            el.querySelector('[data-confirm-ok]').onclick = () => {
              close();
              resolve(true);
            };
          },
          onClose: () => {
            /* إذا أُغلق بدون اختيار */
            resolve(false);
          },
        });

        /* التركيز على زر التأكيد */
        setTimeout(() => {
          modal.el?.querySelector('[data-confirm-ok]')?.focus();
        }, 100);
      });
    },

    /**
     * تأكيد حذف
     * @param {string} [message]
     * @param {Object} [opts={}]
     * @returns {Promise<boolean>}
     */
    delete(message, opts = {}) {
      return this.ask(message || GMS.t('modal.delete.message'), {
        title: GMS.t('modal.delete.title'),
        okText: GMS.t('confirm.delete'),
        danger: true,
        icon: 'trash-2',
        ...opts,
      });
    },

    /**
     * تأكيد خطر
     * @param {string} message
     * @param {Object} [opts={}]
     * @returns {Promise<boolean>}
     */
    danger(message, opts = {}) {
      return this.ask(message, {
        title: GMS.t('toast.warning.title'),
        okText: GMS.t('action.continue'),
        danger: true,
        icon: 'alert-octagon',
        ...opts,
      });
    },

    /**
     * تأكيد رحيل بدون حفظ
     * @returns {Promise<boolean>}
     */
    unsavedChanges() {
      return this.ask(GMS.t('modal.unsaved.message'), {
        title: GMS.t('modal.unsaved.title'),
        okText: GMS.t('modal.discard'),
        cancelText: GMS.t('action.cancel'),
        danger: true,
        icon: 'alert-circle',
      });
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §7 · PROMPT DIALOG
     ═════════════════════════════════════════════════════════════════════ */
  const Prompt = {

    /**
     * نافذة إدخال نص
     * @param {Object} opts
     * @param {string} opts.title
     * @param {string} [opts.label]
     * @param {string} [opts.value='']
     * @param {string} [opts.placeholder='']
     * @param {string} [opts.type='text']
     * @param {number} [opts.maxLength=500]
     * @param {boolean} [opts.required=true]
     * @param {string} [opts.okText='حفظ']
     * @param {string} [opts.cancelText='إلغاء']
     * @param {string} [opts.icon='edit']
     * @returns {Promise<string|null>}
     */
    ask(opts = {}) {
      const {
        title = 'إدخال',
        label = '',
        value = '',
        placeholder = '',
        type = 'text',
        maxLength = 500,
        required = true,
        okText = GMS.t('action.save'),
        cancelText = GMS.t('action.cancel'),
        icon = 'edit',
      } = opts;

      return new Promise((resolve) => {
        Modal.open({
          title,
          icon,
          size: 'sm',
          body: `
            <div class="field">
              ${label ? `<label>${GMS.esc(label)}</label>` : ''}
              <input type="${type}" id="prompt-input"
                     value="${GMS.esc(value)}"
                     placeholder="${GMS.esc(placeholder)}"
                     maxlength="${maxLength}"
                     autocomplete="off">
            </div>
          `,
          footer: `
            <button class="btn" data-prompt-cancel>${GMS.esc(cancelText)}</button>
            <button class="btn btn-primary" data-prompt-ok>${GMS.esc(okText)}</button>
          `,
          onMount: (el, close) => {
            const input = el.querySelector('#prompt-input');

            setTimeout(() => {
              input.focus();
              input.select();
            }, 100);

            const submit = () => {
              const val = input.value.trim();

              if (required && !val) {
                GMS.Toast.warn(GMS.t('err.required'), label || '');
                input.focus();
                return;
              }

              close();
              resolve(val || null);
            };

            el.querySelector('[data-prompt-cancel]').onclick = () => {
              close();
              resolve(null);
            };

            el.querySelector('[data-prompt-ok]').onclick = submit;

            input.addEventListener('keydown', (e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            });
          },
          onClose: () => resolve(null),
        });
      });
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §8 · LOADING OVERLAY
     ═════════════════════════════════════════════════════════════════════ */
  const Loading = {

    _overlay: null,

    /**
     * إظهار loading overlay
     * @param {string} [message]
     * @returns {void}
     */
    show(message = '') {
      UIState.loadingCount++;

      if (this._overlay) {
        /* تحديث الرسالة فقط */
        const msgEl = this._overlay.querySelector('[data-loading-message]');
        if (msgEl && message) msgEl.textContent = message;
        return;
      }

      const overlay = document.createElement('div');
      overlay.className = 'overlay';
      overlay.id = 'global-loading-overlay';
      overlay.style.background = 'rgba(8,13,24,.72)';

      overlay.innerHTML = `
        <div style="text-align:center">
          <div class="spinner" style="margin:0 auto 16px"></div>
          <div data-loading-message style="
            color:#fff;font-weight:700;font-size:14px;
            text-shadow:0 2px 8px rgba(0,0,0,.5)">
            ${GMS.esc(message || GMS.t('status.loading'))}
          </div>
        </div>
      `;

      document.body.appendChild(overlay);
      this._overlay = overlay;
    },

    /**
     * إخفاء loading overlay
     */
    hide() {
      UIState.loadingCount = Math.max(0, UIState.loadingCount - 1);

      if (UIState.loadingCount > 0) return;

      if (this._overlay) {
        this._overlay.style.opacity = '0';
        setTimeout(() => {
          if (this._overlay) {
            this._overlay.remove();
            this._overlay = null;
          }
        }, 160);
      }
    },

    /**
     * تفعيل loading على عنصر (زر أو قسم)
     * @param {Element|string} el
     * @param {boolean} on
     * @param {string} [loadingText]
     */
    onElement(el, on = true, loadingText = '') {
      const target = typeof el === 'string' ? GMS.$(el) : el;
      if (!target) return;

      if (on) {
        /* حفظ المحتوى الأصلي */
        if (!target.dataset.originalHTML) {
          target.dataset.originalHTML = target.innerHTML;
        }

        target.disabled = true;
        target.classList.add('loading');
        target.innerHTML = `
          <i data-lucide="loader-circle"></i>
          ${loadingText ? GMS.esc(loadingText) : ''}
        `;
        window.lucide?.createIcons();

      } else {
        target.disabled = false;
        target.classList.remove('loading');

        if (target.dataset.originalHTML) {
          target.innerHTML = target.dataset.originalHTML;
          delete target.dataset.originalHTML;
        }
        window.lucide?.createIcons();
      }
    },

    /**
     * تفعيل loading على قسم
     * @param {Element|string} el
     * @param {boolean} on
     */
    onSection(el, on = true) {
      const target = typeof el === 'string' ? GMS.$(el) : el;
      if (!target) return;

      target.classList.toggle('loading', on);
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §9 · NOTIFICATION CENTER
     ═════════════════════════════════════════════════════════════════════ */
  const Notifications = {

    /**
     * إضافة إشعار إلى السجل
     * @param {Object} notification
     * @param {string} notification.title
     * @param {string} [notification.desc]
     * @param {'info'|'success'|'warning'|'error'} [notification.type='info']
     * @param {string} [notification.icon]
     * @param {string} [notification.link]
     * @param {Object} [notification.meta]
     * @param {boolean} [notification.unread=true]
     * @returns {Object}
     */
    add(notification) {
      const entry = {
        id: GMS.uid(),
        title: notification.title || '',
        desc: notification.desc || '',
        type: notification.type || 'info',
        icon: notification.icon || null,
        link: notification.link || null,
        meta: notification.meta || {},
        unread: notification.unread !== false,
        createdAt: new Date().toISOString(),
      };

      UIState.notifications.unshift(entry);

      if (UIState.notifications.length > UIState.maxNotifications) {
        UIState.notifications = UIState.notifications.slice(0, UIState.maxNotifications);
      }

      emit('notificationAdd', entry);

      return entry;
    },

    /**
     * قراءة كل الإشعارات
     * @param {Object} [filters={}]
     * @returns {Array}
     */
    getAll(filters = {}) {
      const { unreadOnly = false, type = '' } = filters;

      let rows = UIState.notifications.slice();

      if (unreadOnly) rows = rows.filter(n => n.unread);
      if (type) rows = rows.filter(n => n.type === type);

      return rows;
    },

    /**
     * عدد الإشعارات غير المقروءة
     * @returns {number}
     */
    unreadCount() {
      return UIState.notifications.filter(n => n.unread).length;
    },

    /**
     * تعليم إشعار كمقروء
     * @param {string} id
     */
    markRead(id) {
      const notif = UIState.notifications.find(n => n.id === id);
      if (notif) notif.unread = false;
    },

    /**
     * تعليم الكل كمقروء
     */
    markAllRead() {
      UIState.notifications.forEach(n => { n.unread = false; });
    },

    /**
     * حذف إشعار
     * @param {string} id
     */
    remove(id) {
      UIState.notifications = UIState.notifications.filter(n => n.id !== id);
    },

    /**
     * تفريغ كل الإشعارات
     */
    clear() {
      UIState.notifications = [];
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §10 · EMPTY STATE HELPER
     ═════════════════════════════════════════════════════════════════════ */
  const Empty = {

    /**
     * HTML لحالة فارغة
     * @param {Object} opts
     * @param {string} [opts.icon='inbox']
     * @param {string} [opts.title]
     * @param {string} [opts.desc]
     * @param {string} [opts.actionLabel]
     * @param {string} [opts.actionId]
     * @returns {string}
     */
    html(opts = {}) {
      const {
        icon = 'inbox',
        title = GMS.t('err.noData'),
        desc = '',
        actionLabel = '',
        actionId = '',
      } = opts;

      return `
        <div class="empty">
          <i data-lucide="${icon}"></i>
          <p>${GMS.esc(title)}</p>
          ${desc ? `<span>${GMS.esc(desc)}</span>` : ''}
          ${actionLabel && actionId ? `
            <div style="margin-top:16px">
              <button class="btn btn-primary btn-sm" id="${actionId}">
                ${GMS.esc(actionLabel)}
              </button>
            </div>
          ` : ''}
        </div>
      `;
    },

    /**
     * تطبيق حالة فارغة على عنصر
     * @param {Element|string} el
     * @param {Object} opts
     */
    render(el, opts) {
      const target = typeof el === 'string' ? GMS.$(el) : el;
      if (!target) return;

      target.innerHTML = this.html(opts);
      window.lucide?.createIcons();
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §11 · FORM HELPERS
     ═════════════════════════════════════════════════════════════════════ */
  const Form = {

    /**
     * قراءة قيمة حقل بأمان
     * @param {Element|string} el
     * @param {*} [fallback='']
     * @returns {*}
     */
    val(el, fallback = '') {
      const target = typeof el === 'string' ? GMS.$(el) : el;
      if (!target) return fallback;

      if (target.type === 'checkbox') return target.checked;
      if (target.type === 'number') {
        const n = parseFloat(target.value);
        return isFinite(n) ? n : fallback;
      }

      return target.value ?? fallback;
    },

    /**
     * كتابة قيمة حقل
     * @param {Element|string} el
     * @param {*} value
     */
    set(el, value) {
      const target = typeof el === 'string' ? GMS.$(el) : el;
      if (!target) return;

      if (target.type === 'checkbox') {
        target.checked = Boolean(value);
      } else {
        target.value = value ?? '';
      }
    },

    /**
     * قراءة كائن كامل من حقول بمعرفاتها
     * @param {Array<string>} fieldIds
     * @returns {Object}
     */
    readAll(fieldIds) {
      const out = {};
      fieldIds.forEach(id => {
        const el = GMS.$('#' + id);
        if (el) {
          const key = id.replace(/^f-/, '').replace(/-/g, '_');
          out[key] = this.val(el);
        }
      });
      return out;
    },

    /**
     * تفريغ حقل أو حقول
     * @param {Element|string|Array} targets
     */
    clear(targets) {
      const list = Array.isArray(targets) ? targets : [targets];
      list.forEach(t => {
        const el = typeof t === 'string' ? GMS.$(t) : t;
        if (!el) return;

        if (el.type === 'checkbox' || el.type === 'radio') {
          el.checked = false;
        } else {
          el.value = '';
        }
      });
    },

    /**
     * تفريغ كل الحقول داخل نموذج
     * @param {Element|string} formEl
     */
    clearForm(formEl) {
      const form = typeof formEl === 'string' ? GMS.$(formEl) : formEl;
      if (!form) return;

      form.querySelectorAll('input, select, textarea').forEach(el => {
        if (el.type === 'checkbox' || el.type === 'radio') {
          el.checked = false;
        } else if (el.tagName === 'SELECT') {
          el.selectedIndex = 0;
        } else {
          el.value = '';
        }
      });
    },

    /**
     * تعطيل كل الحقول داخل نموذج
     * @param {Element|string} formEl
     * @param {boolean} disabled
     */
    setDisabled(formEl, disabled = true) {
      const form = typeof formEl === 'string' ? GMS.$(formEl) : formEl;
      if (!form) return;

      form.querySelectorAll('input, select, textarea, button').forEach(el => {
        el.disabled = disabled;
      });
    },

    /**
     * عرض خطأ حقل
     * @param {Element|string} el
     * @param {string} message
     */
    showError(el, message) {
      const target = typeof el === 'string' ? GMS.$(el) : el;
      if (!target) return;

      target.classList.add('has-error');
      target.style.borderColor = 'var(--danger)';
      target.style.boxShadow = '0 0 0 3px color-mix(in srgb,var(--danger) 20%,transparent)';

      /* إزالة رسالة سابقة */
      const existing = target.parentNode?.querySelector('.field-error');
      if (existing) existing.remove();

      if (message) {
        const errorEl = document.createElement('span');
        errorEl.className = 'field-error';
        errorEl.style.cssText = 'color:var(--danger);font-size:10.5px;font-weight:700;margin-top:4px;display:block';
        errorEl.textContent = message;
        target.parentNode?.appendChild(errorEl);
      }
    },

    /**
     * إزالة خطأ حقل
     * @param {Element|string} el
     */
    clearError(el) {
      const target = typeof el === 'string' ? GMS.$(el) : el;
      if (!target) return;

      target.classList.remove('has-error');
      target.style.borderColor = '';
      target.style.boxShadow = '';

      const existing = target.parentNode?.querySelector('.field-error');
      if (existing) existing.remove();
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §12 · COPY & CLIPBOARD UI
     ═════════════════════════════════════════════════════════════════════ */
  const ClipboardUI = {

    /**
     * نسخ نص مع toast تلقائي
     * @param {string} text
     * @param {Object} [opts={}]
     * @param {string} [opts.label]
     * @param {boolean} [opts.silent=false]
     * @returns {Promise<boolean>}
     */
    async copy(text, opts = {}) {
      const { label = '', silent = false } = opts;

      const success = await GMS.copyToClipboard(text);

      if (!silent) {
        if (success) {
          GMS.Toast.ok(GMS.t('toast.copied'), label || '');
        } else {
          GMS.Toast.err(GMS.t('toast.error.title'), 'فشل النسخ');
        }
      }

      return success;
    },

    /**
     * تفويض زر النسخ: <button data-copy="TEXT">
     * @param {Element|Document} [root=document]
     */
    bind(root = document) {
      GMS.$$('[data-copy]', root).forEach(btn => {
        btn.onclick = () => {
          const text = btn.getAttribute('data-copy');
          const label = btn.getAttribute('data-copy-label') || '';
          this.copy(text, { label });
        };
      });
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §13 · GLOBAL KEYBOARD SHORTCUTS
     ═════════════════════════════════════════════════════════════════════ */
  const Shortcuts = {
    _bindings: new Map(),

    /**
     * ربط اختصار
     * @param {string} combo — مثل 'ctrl+s'
     * @param {Function} handler
     * @param {Object} [opts]
     * @param {string} [opts.description]
     * @param {boolean} [opts.global=true] — يعمل حتى داخل الحقول
     */
    bind(combo, handler, opts = {}) {
      const { description = '', global = true } = opts;

      const key = combo.toLowerCase().trim();

      this._bindings.set(key, {
        handler,
        description,
        global,
      });
    },

    /**
     * إلغاء ربط اختصار
     * @param {string} combo
     */
    unbind(combo) {
      this._bindings.delete(combo.toLowerCase().trim());
    },

    /**
     * تفعيل المستمع العام
     */
    init() {
      document.addEventListener('keydown', (e) => {
        /* بناء سلسلة الاختصار */
        const parts = [];
        if (e.ctrlKey || e.metaKey) parts.push('ctrl');
        if (e.altKey) parts.push('alt');
        if (e.shiftKey) parts.push('shift');

        const key = String(e.key).toLowerCase();
        if (!['control', 'alt', 'shift', 'meta'].includes(key)) {
          parts.push(key);
        }

        const combo = parts.join('+');
        const binding = this._bindings.get(combo);

        if (!binding) return;

        /* تجاهل داخل حقول الإدخال (إلا إذا global=true) */
        const inField = ['INPUT', 'TEXTAREA', 'SELECT'].includes(
          document.activeElement?.tagName
        );

        if (inField && !binding.global) return;

        e.preventDefault();

        try {
          binding.handler(e);
        } catch (err) {
          console.error(`[Shortcuts:${combo}]`, err);
        }
      });
    },

    /**
     * قراءة كل الاختصارات
     * @returns {Array}
     */
    getAll() {
      return Array.from(this._bindings.entries()).map(([combo, b]) => ({
        combo,
        description: b.description,
      }));
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §14 · INITIALIZATION
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * تهيئة نظام UI
   */
  function init() {
    /* تحميل حالة الصوت */
    Sound.load();
    UIState.soundEnabled = Sound.isEnabled();

    /* تفعيل الصوت عند أول تفاعل */
    const unlockAudio = async () => {
      await Sound.unlock();
      document.removeEventListener('pointerdown', unlockAudio);
      document.removeEventListener('keydown', unlockAudio);
    };

    document.addEventListener('pointerdown', unlockAudio, { once: true });
    document.addEventListener('keydown', unlockAudio, { once: true });

    /* تفويض أزرار النسخ */
    ClipboardUI.bind();

    /* تفعيل الاختصارات */
    Shortcuts.init();

    console.log('[UI] Initialized', {
      sound: Sound.isEnabled(),
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §15 · EXPORT
     ═════════════════════════════════════════════════════════════════════ */
  GMS.UI = {
    /* State */
    state: UIState,

    /* Systems */
    Toast,
    Modal,
    Confirm,
    Prompt,
    Loading,
    Notifications,
    Empty,
    Form,
    Sound,
    Clipboard: ClipboardUI,
    Shortcuts,

    /* Events */
    on,

    /* Init */
    init,
  };

  /* ─── Convenience shortcuts (على GMS مباشرة) ────────────────────── */
  GMS.Toast = Toast;
  GMS.Modal = Modal;
  GMS.Confirm = Confirm;
  GMS.Prompt = Prompt;
  GMS.Loading = Loading;
  GMS.Notifications = Notifications;
  GMS.Empty = Empty;
  GMS.Form = Form;
  GMS.Beep = Sound;

  /* ═════════════════════════════════════════════════════════════════════
     §16 · LOADED CONFIRMATION
     ═════════════════════════════════════════════════════════════════════ */
  console.log(
    '%c🎨 UI System loaded · Toast + Modal + Confirm + Sound',
    'color:#6b3fa0;font-weight:800;font-size:12px;padding:1px 5px;' +
    'background:#f0e9fa;border-radius:4px;'
  );

  console.log(
    `%c🔔 8 notification sounds · Modal stack · Form helpers · Shortcuts`,
    'color:#6b7a95;font-weight:700;font-size:11px;'
  );

  /* ═════════════════════════════════════════════════════════════════════
     ✅ js/07-ui.js — نهاية الملف
     ═════════════════════════════════════════════════════════════════════ */

})();
