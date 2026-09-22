/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ENTERPRISE — js/09-qr.js
   نظام رموز QR وطباعة التاجات:
     - توليد رمز QR لأي صنف
     - معاينة حية للتاج
     - طباعة حرارية (58mm / 80mm)
     - طباعة جماعية (Queue + Batch)
     - مسح ضوئي (Scanner Input)
     - توليد payload بأشكال متعددة (compact / json / url)
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const GMS = window.GMS = window.GMS || {};

  /* ═════════════════════════════════════════════════════════════════════
     §1 · QR STATE
     ═════════════════════════════════════════════════════════════════════ */
  const QRState = {
    /* آخر رمز تم توليده */
    lastPayload: '',
    lastDataURL: '',

    /* طابور الطباعة */
    printQueue: [],

    /* الحجم الحالي */
    labelWidth: 58,

    /* وضع Payload */
    payloadMode: 'compact',

    /* العناصر المرئية في التاج */
    showFields: {
      price: true,
      workmanship: true,
      manufacturer: true,
      date: false,
      weight: true,
      pureWeight: true,
      category: true,
    },

    /* مستمعو الأحداث */
    listeners: {
      qrGenerated: new Set(),
      queueUpdated: new Set(),
      tagPrinted: new Set(),
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §2 · EVENT EMITTER
     ═════════════════════════════════════════════════════════════════════ */
  function emit(event, data) {
    const set = QRState.listeners[event];
    if (!set) return;
    set.forEach(fn => {
      try { fn(data); } catch (e) { console.error(`[QR.emit:${event}]`, e); }
    });
  }

  function on(event, fn) {
    const set = QRState.listeners[event];
    if (!set || typeof fn !== 'function') return () => {};
    set.add(fn);
    return () => set.delete(fn);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §3 · PAYLOAD BUILDER
     ─────────────────────────────────────────────────────────────────────
     يبني نص QR من بيانات الصنف بحسب الوضع المطلوب
     ═════════════════════════════════════════════════════════════════════ */
  const Payload = {

    /**
     * بناء payload للرمز
     * @param {Object} item
     * @param {'compact'|'json'|'url'} [mode]
     * @returns {string}
     */
    build(item, mode) {
      if (!item) return '';

      mode = mode || QRState.payloadMode;

      const sku = String(item.sku || '').trim();
      const karat = Number(item.karat) || 21;
      const net = Number(item.net_weight || 0);
      const pure = Number(item.pure_weight || 0);

      switch (mode) {
        case 'json':
          return this.json(item);

        case 'url':
          return this.url(item);

        case 'compact':
        default:
          /* نص مختصر بمحددات "/" — يحافظ على Alphanumeric Mode في QRCode.js */
          return [
            sku || 'NA',
            karat,
            GMS.round(net, 3).toFixed(3),
            GMS.round(pure, 3).toFixed(3),
          ].join('/');
      }
    },

    /**
     * JSON كامل
     * @param {Object} item
     * @returns {string}
     */
    json(item) {
      return JSON.stringify({
        v: 1,
        s: item.sku,
        k: item.karat,
        w: GMS.round(item.net_weight, 3),
        p: GMS.round(item.pure_weight, 3),
        c: item.category || null,
        m: item.manufacturer_code || null,
        d: new Date().toISOString().slice(0, 10),
      });
    },

    /**
     * رابط عميق للتطبيق
     * @param {Object} item
     * @returns {string}
     */
    url(item) {
      const base = location.origin + location.pathname;
      return `${base}#/item/${encodeURIComponent(item.sku || 'NA')}`;
    },

    /**
     * تحليل payload وإرجاع البيانات
     * @param {string} payload
     * @returns {Object|null}
     */
    parse(payload) {
      if (!payload) return null;

      try {
        /* JSON */
        if (payload.trim().startsWith('{')) {
          const data = JSON.parse(payload);
          return {
            sku: data.s,
            karat: data.k,
            net: data.w,
            pure: data.p,
            category: data.c,
            manufacturer: data.m,
            date: data.d,
            format: 'json',
          };
        }

        /* URL */
        if (payload.startsWith('http')) {
          const match = payload.match(/#\/item\/(.+)$/);
          return match ? { sku: decodeURIComponent(match[1]), format: 'url' } : null;
        }

        /* Compact: SKU/KARAT/NET/PURE */
        const parts = String(payload).split('/');
        if (parts.length >= 4) {
          return {
            sku: parts[0],
            karat: Number(parts[1]),
            net: Number(parts[2]),
            pure: Number(parts[3]),
            format: 'compact',
          };
        }
      } catch (_) {}

      return null;
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §4 · QR RENDERER
     ─────────────────────────────────────────────────────────────────────
     يُستخدم QRCode.js CDN — الموجود في index.html
     ═════════════════════════════════════════════════════════════════════ */
  const QR = {

    /**
     * توليد رمز QR في عنصر
     * @param {Element|string} host
     * @param {string} payload
     * @param {Object} [opts]
     * @param {number} [opts.size=320]
     * @param {'L'|'M'|'Q'|'H'} [opts.correction='M']
     * @param {string} [opts.color='#000']
     * @param {string} [opts.background='#fff']
     * @returns {Promise<string>} data URL
     */
    async generate(host, payload, opts = {}) {
      const target = typeof host === 'string' ? GMS.$(host) : host;
      if (!target) {
        console.warn('[QR] Host element not found');
        return '';
      }

      if (typeof window.QRCode === 'undefined') {
        console.warn('[QR] QRCode.js not loaded');
        return '';
      }

      const {
        size = 320,
        correction = 'M',
        color = '#000000',
        background = '#ffffff',
      } = opts;

      /* مسح المحتوى القديم */
      target.innerHTML = '';

      return new Promise((resolve) => {
        try {
          const qr = new window.QRCode(target, {
            text: payload || 'EMPTY',
            width: size,
            height: size,
            colorDark: color,
            colorLight: background,
            correctLevel: (window.QRCode.CorrectLevel && window.QRCode.CorrectLevel[correction])
              || window.QRCode.CorrectLevel.M,
          });

          /* QRCode.js يرسم canvas ثم يحوّله إلى <img> */
          setTimeout(() => {
            /* محاولة من canvas */
            const canvas = target.querySelector('canvas');
            if (canvas) {
              try {
                const url = canvas.toDataURL('image/png');
                QRState.lastDataURL = url;
                QRState.lastPayload = payload;
                emit('qrGenerated', { payload, dataURL: url });
                return resolve(url);
              } catch (_) {}
            }

            /* fallback: من img */
            const img = target.querySelector('img');
            if (img && img.src) {
              QRState.lastDataURL = img.src;
              QRState.lastPayload = payload;
              emit('qrGenerated', { payload, dataURL: img.src });
              return resolve(img.src);
            }

            resolve('');
          }, 60);

          void qr; /* استخدم المتغير */

        } catch (e) {
          console.error('[QR.generate]', e);
          resolve('');
        }
      });
    },

    /**
     * توليد رمز بصمت (بدون عرض مرئي)
     * @param {string} payload
     * @param {number} [size=320]
     * @returns {Promise<string>}
     */
    async generateSilent(payload, size = 320) {
      /* استخدام host مخفي */
      let host = document.getElementById('qr-host');

      if (!host) {
        host = document.createElement('div');
        host.id = 'qr-host';
        host.style.cssText =
          'position:absolute;left:-99999px;top:0;width:320px;height:320px;overflow:hidden;pointer-events:none';
        document.body.appendChild(host);
      }

      return this.generate(host, payload, { size });
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §5 · TAG BUILDER
     ─────────────────────────────────────────────────────────────────────
     بناء HTML للتاج (يُستخدم في المعاينة والطباعة)
     ═════════════════════════════════════════════════════════════════════ */
  const Tag = {

    /**
     * بناء HTML لتاج واحد
     * @param {Object} item
     * @param {Object} [opts]
     * @param {string} [opts.qrDataURL]
     * @param {number} [opts.labelWidth=58]
     * @param {Object} [opts.fields]
     * @returns {string}
     */
    html(item, opts = {}) {
      if (!item) return '';

      const {
        qrDataURL = QRState.lastDataURL,
        labelWidth = QRState.labelWidth,
        fields = QRState.showFields,
      } = opts;

      const price = Number(item.total_cost || 0);
      const netWeight = Number(item.net_weight || 0);
      const pureWeight = Number(item.pure_weight || 0);
      const making = Number(item.workmanship_value || 0);
      const karat = Number(item.karat) || 21;

      return `
        <div class="tag" data-size="${labelWidth}">
          <div class="tag-qr">
            ${qrDataURL ? `<img src="${qrDataURL}" alt="QR" loading="eager">` : ''}
          </div>
          <div class="tag-body">
            <div class="tag-sku">${GMS.esc(item.sku || '—')}</div>

            ${fields.weight !== false ? `
              <div class="tag-line">
                <b>${karat}K</b> · ${GMS.gramFmt(netWeight)} جم صافي
              </div>
            ` : ''}

            ${fields.pureWeight !== false ? `
              <div class="tag-line">
                بندق: <b>${GMS.gramFmt(pureWeight)}</b> جم
              </div>
            ` : ''}

            ${fields.workmanship && making > 0 ? `
              <div class="tag-line">
                مصنعية: <b>${GMS.moneyFmt(making)}</b> ج.م
              </div>
            ` : ''}

            ${fields.manufacturer !== false && (item.manufacturer_name || item.manufacturer_code) ? `
              <div class="tag-line" style="opacity:.75;font-size:10px">
                ${GMS.esc(item.manufacturer_code || '')} — ${GMS.esc(item.manufacturer_name || '')}
              </div>
            ` : ''}

            ${fields.date ? `
              <div class="tag-line" style="opacity:.7;font-size:10px">
                ${GMS.dateAr(new Date())}
              </div>
            ` : ''}

            ${fields.price !== false && price > 0 ? `
              <div class="tag-price">${GMS.moneyFmt(price)} ج.م</div>
            ` : ''}
          </div>
        </div>
      `;
    },

    /**
     * بناء تاجات متعددة
     * @param {Array<Object>} items
     * @param {Object} [opts]
     * @returns {string}
     */
    htmlBatch(items, opts = {}) {
      if (!Array.isArray(items)) return '';

      return items.map(item => this.html(item, {
        ...opts,
        qrDataURL: item.qrDataURL || opts.qrDataURL || QRState.lastDataURL,
      })).join('');
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §6 · PRINTING ENGINE
     ─────────────────────────────────────────────────────────────────────
     طباعة حرارية 58mm / 80mm مع @page ديناميكي
     ═════════════════════════════════════════════════════════════════════ */
  const Printer = {

    /* عنصر <style> ديناميكي لحجم الصفحة */
    _pageStyleEl: null,

    /**
     * تهيئة عنصر @page
     * @private
     */
    _ensurePageStyle() {
      if (this._pageStyleEl) return;

      let el = document.getElementById('gms-page-size-style');
      if (!el) {
        el = document.createElement('style');
        el.id = 'gms-page-size-style';
        document.head.appendChild(el);
      }
      this._pageStyleEl = el;
    },

    /**
     * تطبيق عرض التاج
     * @param {58|80} width
     */
    setLabelWidth(width) {
      const w = Number(width) === 80 ? 80 : 58;
      QRState.labelWidth = w;

      try {
        localStorage.setItem('gms.qr.labelWidth', String(w));
      } catch (_) {}

      /* تحديث CSS variable */
      document.documentElement.style.setProperty('--label-w', w + 'mm');

      /* تحديث @page ديناميكي */
      this._ensurePageStyle();
      this._pageStyleEl.textContent = `
        @media print {
          @page {
            size: ${w}mm auto;
            margin: 0;
          }
        }
      `;

      return w;
    },

    /**
     * قراءة عرض التاج من التخزين
     * @returns {number}
     */
    loadLabelWidth() {
      try {
        const saved = Number(localStorage.getItem('gms.qr.labelWidth'));
        if (saved === 58 || saved === 80) {
          QRState.labelWidth = saved;
          return saved;
        }
      } catch (_) {}
      return 58;
    },

    /**
     * انتظار تحميل كل الصور
     * @param {Element} root
     * @returns {Promise<void>}
     * @private
     */
    async _waitForImages(root) {
      const imgs = Array.from(root.querySelectorAll('img'));
      if (!imgs.length) return;

      await Promise.all(imgs.map(img => {
        if (img.complete && img.naturalWidth) return Promise.resolve();

        return new Promise(resolve => {
          img.onload = resolve;
          img.onerror = resolve;
          setTimeout(resolve, 900); /* حماية قصوى */
        });
      }));
    },

    /**
     * طباعة تاجات (نواة الطباعة)
     * @param {Array<Object>} items
     * @param {Object} [opts]
     * @param {number} [opts.labelWidth]
     * @returns {Promise<boolean>}
     */
    async print(items, opts = {}) {
      if (!items || !items.length) {
        GMS.Toast.warn('لا توجد ملصقات للطباعة');
        return false;
      }

      const { labelWidth = QRState.labelWidth } = opts;

      /* 1 · جهّز كل تاج مع QR */
      const enriched = [];

      for (const item of items) {
        let qrDataURL = item.qrDataURL || '';

        if (!qrDataURL) {
          try {
            const payload = Payload.build(item);
            qrDataURL = await QR.generateSilent(payload);
          } catch (e) {
            console.warn('[Printer] QR generation failed for', item.sku, e);
          }
        }

        enriched.push({ ...item, qrDataURL });
      }

      /* 2 · بناء HTML */
      const root = document.getElementById('print-root');
      if (!root) {
        GMS.Toast.err('خطأ في الطباعة', 'لا يوجد #print-root');
        return false;
      }

      root.innerHTML = Tag.htmlBatch(enriched, { labelWidth });

      /* 3 · انتظار الصور */
      await this._waitForImages(root);

      /* 4 · تأكد من حجم الصفحة */
      this.setLabelWidth(labelWidth);

      /* 5 · اطلب الطباعة */
      return new Promise(resolve => {
        requestAnimationFrame(() => {
          setTimeout(() => {
            try {
              window.print();
              emit('tagPrinted', { count: items.length });
              resolve(true);
            } catch (e) {
              console.error('[Printer.print]', e);
              resolve(false);
            }
          }, 80);
        });
      });
    },

    /**
     * طباعة تاج واحد
     * @param {Object} item
     * @returns {Promise<boolean>}
     */
    printOne(item) {
      return this.print([item]);
    },

    /**
     * طباعة طابور كامل
     * @returns {Promise<boolean>}
     */
    printQueue() {
      if (!QRState.printQueue.length) {
        GMS.Toast.warn('الطابور فارغ');
        return Promise.resolve(false);
      }
      return this.print(QRState.printQueue.slice());
    },

    /**
     * معاينة تاج في modal
     * @param {Object} item
     * @param {Object} [opts]
     */
    async preview(item, opts = {}) {
      if (!item) return;

      /* ولّد QR أولاً */
      const payload = Payload.build(item);
      const qrDataURL = await QR.generateSilent(payload);

      const html = Tag.html(item, { ...opts, qrDataURL });

      GMS.Modal.open({
        title: `معاينة التاج — ${item.sku}`,
        icon: 'tag',
        size: 'sm',
        body: `
          <div style="display:flex;justify-content:center;padding:12px 0">
            <div style="background:#fff;border-radius:10px;overflow:hidden;
                        box-shadow:0 8px 24px -8px rgba(0,0,0,.3);
                        border:1px solid var(--border);width:100%;max-width:340px">
              ${html}
            </div>
          </div>
          <div class="field" style="margin-top:14px">
            <label>نص رمز QR</label>
            <input readonly value="${GMS.esc(payload)}"
                   class="mono" dir="ltr"
                   style="font-size:11px;padding:8px 11px">
          </div>
        `,
        footer: `
          <button class="btn" data-close>إغلاق</button>
          <button class="btn btn-ghost" data-copy-qr>
            <i data-lucide="copy"></i> نسخ النص
          </button>
          <button class="btn btn-primary" data-print-one>
            <i data-lucide="printer"></i> طباعة
          </button>
        `,
        onMount(el, close) {
          el.querySelector('[data-copy-qr]').onclick = () => {
            GMS.copyToClipboard(payload).then(ok => {
              if (ok) GMS.Toast.ok('تم النسخ');
            });
          };

          el.querySelector('[data-print-one]').onclick = () => {
            close();
            Printer.printOne(item);
          };
        },
      });
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §7 · PRINT QUEUE
     ═════════════════════════════════════════════════════════════════════ */
  const Queue = {

    /**
     * إضافة تاج إلى الطابور
     * @param {Object} item
     * @returns {Object}
     */
    add(item) {
      if (!item || !item.sku) {
        GMS.Toast.warn('لا يمكن إضافة الصنف');
        return null;
      }

      /* تجاهل التكرار */
      if (QRState.printQueue.find(q => q.sku === item.sku)) {
        GMS.Toast.warn('الصنف موجود في الطابور');
        return null;
      }

      const entry = {
        ...item,
        _queueId: GMS.uid(),
        _addedAt: Date.now(),
      };

      QRState.printQueue.push(entry);
      emit('queueUpdated', { count: QRState.printQueue.length });
      return entry;
    },

    /**
     * إضافة مجموعة
     * @param {Array<Object>} items
     * @returns {number}
     */
    addBatch(items) {
      if (!Array.isArray(items)) return 0;

      let added = 0;
      items.forEach(item => {
        if (this.add(item)) added++;
      });
      return added;
    },

    /**
     * إزالة تاج
     * @param {string} sku
     * @returns {boolean}
     */
    remove(sku) {
      const idx = QRState.printQueue.findIndex(q => q.sku === sku);
      if (idx < 0) return false;

      QRState.printQueue.splice(idx, 1);
      emit('queueUpdated', { count: QRState.printQueue.length });
      return true;
    },

    /**
     * تفريغ الطابور
     */
    clear() {
      QRState.printQueue = [];
      emit('queueUpdated', { count: 0 });
    },

    /**
     * قراءة الطابور
     * @returns {Array}
     */
    getAll() {
      return QRState.printQueue.slice();
    },

    /**
     * عدد العناصر
     * @returns {number}
     */
    count() {
      return QRState.printQueue.length;
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §8 · SCANNER INPUT
     ─────────────────────────────────────────────────────────────────────
     مستمع keydown عام لاستقبال مدخلات قارئ الباركود
     ✅ مُصلَح: 
       - يتخطى أي keydown جاي من حقل إدخال
       - يتخطى لو في Modal مفتوح
       - يتخطى لو مش في صفحة POS
       - لا يعمل preventDefault إلا على scan input الفعلي
     ═════════════════════════════════════════════════════════════════════ */
  const Scanner = {

    _buffer: '',
    _gaps: [],
    _lastKeyAt: 0,
    _resetTimer: null,
    _bound: false,
    _handler: null,
    _boundHandler: null,

    /* إعدادات */
    TIMEOUT_MS: 180,
    MAX_GAP_MS: 70,
    MIN_LENGTH: 3,

    /**
     * تفعيل المستمع العام
     * @param {Function} onScan — (code, meta) => {}
     */
    bind(onScan) {
      if (this._bound) this.unbind();

      this._handler = onScan;
      this._bound = true;

      this._boundHandler = this._onKey.bind(this);
      document.addEventListener('keydown', this._boundHandler, true);

      console.log('[Scanner] Global listener bound');
    },

    unbind() {
      if (this._boundHandler) {
        document.removeEventListener('keydown', this._boundHandler, true);
        this._boundHandler = null;
      }
      this._bound = false;
      this._handler = null;
      this._reset();
    },

    _scannerSpeed() {
      if (this._gaps.length < 3) return false;
      const avg = this._gaps.reduce((a, b) => a + b, 0) / this._gaps.length;
      return avg < this.MAX_GAP_MS;
    },

    _reset() {
      this._buffer = '';
      this._gaps = [];
      clearTimeout(this._resetTimer);
    },

    _scheduleReset() {
      clearTimeout(this._resetTimer);
      this._resetTimer = setTimeout(() => this._reset(), this.TIMEOUT_MS);
    },

    /**
     * ✅ معالج المفتاح — مُصلَح بالكامل
     */
    _onKey(e) {
      /* ─── تجاهل المفاتيح المعدِّلة ─── */
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      const t = e.target;

      /* ✅ فحص 1: تجاهل تمامًا لو داخل أي حقل إدخال
         (input / select / textarea / contentEditable)
         هذا مهم جدًا — كان بيعمل preventDefault على Enter في الـ dropdowns */
      if (t && (
        t.tagName === 'INPUT' ||
        t.tagName === 'TEXTAREA' ||
        t.tagName === 'SELECT' ||
        t.isContentEditable === true
      )) {
        /* اصفّر الـ buffer عشان مانخلطش */
        this._reset();
        return;
      }

      /* ✅ فحص 2: تجاهل لو في Modal مفتوح */
      if (GMS.Modal && typeof GMS.Modal.count === 'function') {
        if (GMS.Modal.count() > 0) return;
      }

      /* ✅ فحص 3: تجاهل لو مش في صفحة POS
         (الـ Scanner مسؤول عن POS فقط الآن) */
      if (GMS.Router && typeof GMS.Router.currentId === 'function') {
        const currentRoute = GMS.Router.currentId();
        if (currentRoute && currentRoute !== 'pos') {
          return;
        }
      }

      /* ✅ فحص 4: تجاهل لو في dropdown مفتوح
         (بعض المتصفحات مش بتظهر select في activeElement) */
      const active = document.activeElement;
      if (active && active.tagName === 'SELECT') {
        return;
      }

      /* ─── معالجة المفاتيح ─── */
      const now = performance.now();
      const gap = now - this._lastKeyAt;
      this._lastKeyAt = now;

      /* Enter / Tab = إتمام المسح */
      if (e.key === 'Enter' || e.key === 'Tab') {
        const code = this._buffer.trim();
        const wasScanner = this._scannerSpeed();
        this._reset();

        if (code.length >= this.MIN_LENGTH && typeof this._handler === 'function') {
          e.preventDefault();
          e.stopPropagation();
          this._handler(code, { wasScanner });
        }
        return;
      }

      /* Backspace */
      if (e.key === 'Backspace') {
        this._buffer = this._buffer.slice(0, -1);
        this._scheduleReset();
        return;
      }

      /* حرف قابل للطباعة */
      if (e.key.length === 1) {
        this._gaps.push(gap);
        if (this._gaps.length > 25) this._gaps.shift();

        this._buffer += e.key;

        /* ✅ preventDefault فقط للمفاتيح القادمة من scanner حقيقي
           (سرعات عالية) — مانأثرش على المستخدم العادي */
        const isScannerSpeed = this._scannerSpeed();
        if (isScannerSpeed) {
          e.preventDefault();
        }

        this._scheduleReset();
      }
    },

    /**
     * محاكاة مسح (للاختبار)
     */
    simulate(code) {
      if (typeof this._handler === 'function') {
        this._handler(code, { wasScanner: true });
      }
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §9 · FIND ITEM BY SKU
     ─────────────────────────────────────────────────────────────────────
     يبحث في IndexedDB عن الصنف ويعيده
     ═════════════════════════════════════════════════════════════════════ */
  async function findItemBySku(sku) {
    const key = String(sku || '').trim().toUpperCase();
    if (!key) return null;

    /* 1 · IndexedDB */
    try {
      if (GMS.IDB) {
        const item = await GMS.IDB.getBySku(key);
        if (item) return item;
      }
    } catch (e) {
      console.warn('[findItemBySku] IDB failed:', e);
    }

    /* 2 · Demo data */
    try {
      if (GMS.Demo) {
        const found = GMS.Demo.getInventory().find(
          i => i.sku.toUpperCase() === key
        );
        if (found) return found;
      }
    } catch (e) {
      console.warn('[findItemBySku] Demo failed:', e);
    }

    return null;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §10 · BATCH TAG PRINTING
     ─────────────────────────────────────────────────────────────────────
     توليد تاجات لعدد من الأصناف دفعة واحدة
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * طباعة تاجات لعدة أصناف
   * @param {Object} opts
   * @param {number} [opts.count=24]
   * @param {string} [opts.branchId]
   * @param {string} [opts.status='IN_STOCK']
   * @param {number} [opts.labelWidth]
   * @returns {Promise<number>}
   */
  async function printBatch(opts = {}) {
    const {
      count = 24,
      branchId = null,
      status = 'IN_STOCK',
      labelWidth = QRState.labelWidth,
    } = opts;

    try {
      let items = [];

      /* جرّب IndexedDB */
      if (GMS.IDB && GMS.IDB.isOpen) {
        const filters = {};
        if (branchId) filters.branch_id = branchId;
        if (status) filters.status = status;

        items = await GMS.IDB.search('', { ...filters, limit: count });
      }

      /* fallback على Demo */
      if (!items.length && GMS.Demo) {
        items = GMS.Demo.getInventory().filter(i => {
          if (branchId && i.branch_id !== branchId) return false;
          if (status && i.status !== status) return false;
          return true;
        }).slice(0, count);
      }

      if (!items.length) {
        GMS.Toast.warn('لا توجد أصناف للطباعة');
        return 0;
      }

      await Printer.print(items, { labelWidth });
      GMS.Toast.ok(`تمت طباعة ${items.length} تاج`);
      return items.length;

    } catch (e) {
      console.error('[printBatch]', e);
      GMS.Toast.err('فشل الطباعة', e.message);
      return 0;
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §11 · INITIALIZATION
     ═════════════════════════════════════════════════════════════════════ */
  function init() {
    /* قراءة عرض التاج */
    const savedWidth = Printer.loadLabelWidth();
    Printer.setLabelWidth(savedWidth);

    /* انتظر حتى ينتهي تحميل QRCode.js */
    if (typeof window.QRCode === 'undefined') {
      console.warn('[QR] QRCode.js not yet loaded');
    }

    console.log('[QR] Initialized', {
      labelWidth: savedWidth,
      mode: QRState.payloadMode,
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §12 · EXPORT
     ═════════════════════════════════════════════════════════════════════ */
  GMS.QR = {
    /* State */
    state: QRState,

    /* Core */
    Payload,
    QR,
    Tag,
    Printer,
    Queue,
    Scanner,

    /* Helpers */
    findItemBySku,
    printBatch,

    /* Events */
    on,

    /* Init */
    init,
  };

  /* ─── Convenience aliases ─────────────────────────────────────── */
  GMS.QRPayload = Payload;
  GMS.QRCodeGen = QR;
  GMS.QRTag = Tag;
  GMS.QRPrinter = Printer;
  GMS.QRQueue = Queue;
  GMS.QRScanner = Scanner;

  /* ═════════════════════════════════════════════════════════════════════
     §13 · LOADED CONFIRMATION
     ═════════════════════════════════════════════════════════════════════ */
  console.log(
    '%c📱 QR Engine loaded · Generate + Print + Scan',
    'color:#0e7490;font-weight:800;font-size:12px;padding:1px 5px;' +
    'background:#e0f2f7;border-radius:4px;'
  );

  console.log(
    `%c🎫 58mm / 80mm labels · 3 payload modes · Batch printing · Scanner buffer`,
    'color:#6b7a95;font-weight:700;font-size:11px;'
  );

  /* ═════════════════════════════════════════════════════════════════════
     ✅ js/09-qr.js — نهاية الملف
     ═════════════════════════════════════════════════════════════════════ */

})();
