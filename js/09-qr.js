/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ENTERPRISE — js/09-qr.js
   نظام رموز QR وطباعة التاجات:
     - توليد رمز QR لأي صنف
     - معاينة حية للتاج
     - طباعة حرارية (58mm / 80mm)
     - طباعة جماعية (Queue + Batch)
     - مسح ضوئي (Scanner Input)
     - توليد payload بأشكال متعددة (compact / json / url)

   ✅ v2: دعم كامل للعيارات المخصصة (سبائك 888، 900، 916، إلخ)
     - payload بيشفر purity_ratio للعيارات المخصصة
     - Tag بيعرض العيار المخصص (888 أو 0.8880)
     - Parser بيفهم النقاء من QR
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const GMS = window.GMS = window.GMS || {};

  /* ═════════════════════════════════════════════════════════════════════
     §1 · QR STATE
     ═════════════════════════════════════════════════════════════════════ */
  const QRState = {
    lastPayload: '',
    lastDataURL: '',

    printQueue: [],

    labelWidth: 58,

    payloadMode: 'compact',

    /* ✅ v2: خيارات عرض العيار */
    karatDisplay: 'auto',   /* 'auto' | 'standard' | 'custom' | 'purity' */

    showFields: {
      price: true,
      workmanship: true,
      manufacturer: true,
      date: false,
      weight: true,
      pureWeight: true,
      category: true,
      purity: true,        /* ✅ v2: عرض النقاء للعيار المخصص */
    },

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
     §3 · HELPERS — قراءة معلومات العيار
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * ✅ v2: قراءة معلومات العيار لأي عنصر (قياسي أو مخصص)
   * @param {Object} item
   * @returns {{karat, custom_karat, purity_ratio, is_custom, display}}
   */
  function getItemKaratInfo(item) {
    if (!item) return GMS.resolveKarat(21);

    /* استخدم GMS.getItemKarat لو موجودة */
    if (typeof GMS.getItemKarat === 'function') {
      try {
        return GMS.getItemKarat(item);
      } catch (_) {}
    }

    /* fallback: الحساب اليدوي */
    if (item.is_custom_karat === true || item.custom_karat != null) {
      return GMS.resolveKarat({
        custom_karat: item.custom_karat,
        purity_ratio: item.purity_ratio,
        is_custom: true,
      });
    }

    if (item.karat != null) {
      return GMS.resolveKarat(item.karat);
    }

    if (item.purity_ratio != null) {
      return GMS.karatFromPurity(item.purity_ratio);
    }

    return GMS.resolveKarat(21);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §4 · PAYLOAD BUILDER — ✅ v2 مع النقاء
     ═════════════════════════════════════════════════════════════════════ */
  const Payload = {

    /**
     * بناء payload للرمز
     * @param {Object} item
     * @param {'compact'|'json'|'url'|'purity'} [mode]
     * @returns {string}
     */
    build(item, mode) {
      if (!item) return '';

      mode = mode || QRState.payloadMode;

      const sku = String(item.sku || '').trim();
      const karatInfo = getItemKaratInfo(item);

      switch (mode) {
        case 'json':
          return this.json(item);

        case 'url':
          return this.url(item);

        case 'purity':
          /* ✅ v2: payload مختصر مع النقاء */
          return [
            sku || 'NA',
            Number(karatInfo.purity_ratio || 0).toFixed(4),
            GMS.round(item.net_weight || 0, 3).toFixed(3),
            GMS.round(item.pure_weight || 0, 3).toFixed(3),
          ].join('/');

        case 'compact':
        default:
          /* ✅ v2: Compact بيدعم القياسي والمخصص */
          if (karatInfo.is_custom) {
            /* عيار مخصص: SKU/C888/NET/PURE */
            return [
              sku || 'NA',
              `C${karatInfo.custom_karat}`,
              GMS.round(item.net_weight || 0, 3).toFixed(3),
              GMS.round(item.pure_weight || 0, 3).toFixed(3),
            ].join('/');
          }

          /* قياسي: SKU/21/NET/PURE */
          return [
            sku || 'NA',
            karatInfo.karat,
            GMS.round(item.net_weight || 0, 3).toFixed(3),
            GMS.round(item.pure_weight || 0, 3).toFixed(3),
          ].join('/');
      }
    },

    /**
     * JSON كامل — ✅ v2 يدعم العيار المخصص
     * @param {Object} item
     * @returns {string}
     */
    json(item) {
      const karatInfo = getItemKaratInfo(item);

      return JSON.stringify({
        v: 2,
        s: item.sku,
        k: karatInfo.karat,
        ck: karatInfo.custom_karat,
        ic: karatInfo.is_custom,
        pr: Number(karatInfo.purity_ratio || 0).toFixed(4),
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
     * ✅ v2: تحليل payload — يدعم كل الأوضاع
     * @param {string} payload
     * @returns {Object|null}
     */
    parse(payload) {
      if (!payload) return null;

      try {
        /* JSON */
        if (payload.trim().startsWith('{')) {
          const data = JSON.parse(payload);

          /* v2 */
          if (data.v === 2 || data.ck != null || data.ic != null) {
            return {
              sku: data.s,
              karat: data.k,
              custom_karat: data.ck,
              is_custom: Boolean(data.ic) || data.ck != null,
              purity_ratio: Number(data.pr),
              net: data.w,
              pure: data.p,
              category: data.c,
              manufacturer: data.m,
              date: data.d,
              format: 'json-v2',
            };
          }

          /* v1 */
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
          const karatPart = String(parts[1] || '').trim();

          /* ✅ v2: كشف العيار المخصص بـ C prefix */
          if (karatPart.toUpperCase().startsWith('C')) {
            const customNum = parseInt(karatPart.slice(1), 10);
            return {
              sku: parts[0],
              custom_karat: customNum,
              is_custom: true,
              purity_ratio: customNum / 1000,
              net: Number(parts[2]),
              pure: Number(parts[3]),
              format: 'compact-custom',
            };
          }

          /* ✅ v2: نقاء مباشر (0.8880) */
          if (karatPart.includes('.')) {
            const purity = Number(karatPart);
            const karatFromPurity = GMS.karatFromPurity(purity);
            return {
              sku: parts[0],
              karat: karatFromPurity.karat,
              custom_karat: karatFromPurity.custom_karat,
              is_custom: karatFromPurity.is_custom,
              purity_ratio: purity,
              net: Number(parts[2]),
              pure: Number(parts[3]),
              format: 'compact-purity',
            };
          }

          /* قياسي */
          return {
            sku: parts[0],
            karat: Number(karatPart),
            is_custom: false,
            purity_ratio: GMS.karatRatio(Number(karatPart)),
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
     §5 · QR RENDERER
     ═════════════════════════════════════════════════════════════════════ */
  const QR = {

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

          setTimeout(() => {
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

            const img = target.querySelector('img');
            if (img && img.src) {
              QRState.lastDataURL = img.src;
              QRState.lastPayload = payload;
              emit('qrGenerated', { payload, dataURL: img.src });
              return resolve(img.src);
            }

            resolve('');
          }, 60);

          void qr;

        } catch (e) {
          console.error('[QR.generate]', e);
          resolve('');
        }
      });
    },

    async generateSilent(payload, size = 320) {
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
     §6 · TAG BUILDER — ✅ v2 مع عرض العيار المخصص
     ═════════════════════════════════════════════════════════════════════ */
  const Tag = {

    /**
     * ✅ v2: عرض العيار كـ نص — قياسي أو مخصص
     * @param {Object} item
     * @param {Object} [opts]
     * @returns {string}
     */
    formatKaratDisplay(item, opts = {}) {
      const karatInfo = getItemKaratInfo(item);
      const display = opts.karatDisplay || QRState.karatDisplay;

      if (display === 'purity') {
        return Number(karatInfo.purity_ratio || 0).toFixed(4);
      }

      if (display === 'custom' && karatInfo.is_custom) {
        return `${karatInfo.custom_karat}`;
      }

      if (display === 'standard' && !karatInfo.is_custom) {
        return `${karatInfo.karat}K`;
      }

      /* auto */
      if (karatInfo.is_custom) {
        return `${karatInfo.custom_karat}`;
      }

      return `${karatInfo.karat}K`;
    },

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
      const karatInfo = getItemKaratInfo(item);

      const karatText = Tag.formatKaratDisplay(item, opts);

      /* ✅ v2: عرض العيار بشارة ملونة */
      const karatBadge = karatInfo.is_custom
        ? `<span style="display:inline-block;padding:1px 6px;
                       background:#fdf3e3;color:#a55a00;
                       border:1px dashed #a55a00;border-radius:4px;
                       font-weight:900;font-size:11px">
             ${karatText}
           </span>`
        : `<b>${karatText}</b>`;

      return `
        <div class="tag" data-size="${labelWidth}">
          <div class="tag-qr">
            ${qrDataURL ? `<img src="${qrDataURL}" alt="QR" loading="eager">` : ''}
          </div>
          <div class="tag-body">
            <div class="tag-sku">${GMS.esc(item.sku || '—')}</div>

            ${fields.weight !== false ? `
              <div class="tag-line">
                ${karatBadge} · ${GMS.gramFmt(netWeight)} جم صافي
              </div>
            ` : ''}

            ${fields.pureWeight !== false ? `
              <div class="tag-line">
                بندق: <b>${GMS.gramFmt(pureWeight)}</b> جم
              </div>
            ` : ''}

            ${fields.purity !== false && karatInfo.is_custom ? `
              <div class="tag-line" style="font-size:9.5px;opacity:.8">
                نقاء: <b>${Number(karatInfo.purity_ratio).toFixed(4)}</b>
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

    htmlBatch(items, opts = {}) {
      if (!Array.isArray(items)) return '';

      return items.map(item => this.html(item, {
        ...opts,
        qrDataURL: item.qrDataURL || opts.qrDataURL || QRState.lastDataURL,
      })).join('');
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §7 · PRINTING ENGINE
     ═════════════════════════════════════════════════════════════════════ */
  const Printer = {

    _pageStyleEl: null,

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

    setLabelWidth(width) {
      const w = Number(width) === 80 ? 80 : 58;
      QRState.labelWidth = w;

      try {
        localStorage.setItem('gms.qr.labelWidth', String(w));
      } catch (_) {}

      document.documentElement.style.setProperty('--label-w', w + 'mm');

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

    async _waitForImages(root) {
      const imgs = Array.from(root.querySelectorAll('img'));
      if (!imgs.length) return;

      await Promise.all(imgs.map(img => {
        if (img.complete && img.naturalWidth) return Promise.resolve();

        return new Promise(resolve => {
          img.onload = resolve;
          img.onerror = resolve;
          setTimeout(resolve, 900);
        });
      }));
    },

    async print(items, opts = {}) {
      if (!items || !items.length) {
        GMS.Toast.warn('لا توجد ملصقات للطباعة');
        return false;
      }

      const { labelWidth = QRState.labelWidth } = opts;

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

      const root = document.getElementById('print-root');
      if (!root) {
        GMS.Toast.err('خطأ في الطباعة', 'لا يوجد #print-root');
        return false;
      }

      root.innerHTML = Tag.htmlBatch(enriched, { labelWidth });

      await this._waitForImages(root);

      this.setLabelWidth(labelWidth);

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

    printOne(item) {
      return this.print([item]);
    },

    printQueue() {
      if (!QRState.printQueue.length) {
        GMS.Toast.warn('الطابور فارغ');
        return Promise.resolve(false);
      }
      return this.print(QRState.printQueue.slice());
    },

    async preview(item, opts = {}) {
      if (!item) return;

      const payload = Payload.build(item);
      const qrDataURL = await QR.generateSilent(payload);

      const html = Tag.html(item, { ...opts, qrDataURL });

      /* ✅ v2: عرض بيانات العيار المخصص */
      const karatInfo = getItemKaratInfo(item);
      const karatExtraInfo = karatInfo.is_custom
        ? `
          <div class="field" style="margin-top:10px">
            <label>النقاء (للعيار المخصص)</label>
            <input readonly value="${Number(karatInfo.purity_ratio).toFixed(4)}"
                   class="mono" dir="ltr"
                   style="font-size:12px;padding:8px 11px;
                          color:var(--warn);font-weight:900">
          </div>
        `
        : '';

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

          ${karatExtraInfo}
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
     §8 · PRINT QUEUE
     ═════════════════════════════════════════════════════════════════════ */
  const Queue = {

    add(item) {
      if (!item || !item.sku) {
        GMS.Toast.warn('لا يمكن إضافة الصنف');
        return null;
      }

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

    addBatch(items) {
      if (!Array.isArray(items)) return 0;

      let added = 0;
      items.forEach(item => {
        if (this.add(item)) added++;
      });
      return added;
    },

    remove(sku) {
      const idx = QRState.printQueue.findIndex(q => q.sku === sku);
      if (idx < 0) return false;

      QRState.printQueue.splice(idx, 1);
      emit('queueUpdated', { count: QRState.printQueue.length });
      return true;
    },

    clear() {
      QRState.printQueue = [];
      emit('queueUpdated', { count: 0 });
    },

    getAll() {
      return QRState.printQueue.slice();
    },

    count() {
      return QRState.printQueue.length;
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §9 · SCANNER INPUT
     ═════════════════════════════════════════════════════════════════════ */
  const Scanner = {

    _buffer: '',
    _gaps: [],
    _lastKeyAt: 0,
    _resetTimer: null,
    _bound: false,
    _handler: null,
    _boundHandler: null,

    TIMEOUT_MS: 180,
    MAX_GAP_MS: 70,
    MIN_LENGTH: 3,

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

    _onKey(e) {
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      const t = e.target;

      if (t && (
        t.tagName === 'INPUT' ||
        t.tagName === 'TEXTAREA' ||
        t.tagName === 'SELECT' ||
        t.isContentEditable === true
      )) {
        this._reset();
        return;
      }

      if (GMS.Modal && typeof GMS.Modal.count === 'function') {
        if (GMS.Modal.count() > 0) return;
      }

      if (GMS.Router && typeof GMS.Router.currentId === 'function') {
        const currentRoute = GMS.Router.currentId();
        if (currentRoute && currentRoute !== 'pos') {
          return;
        }
      }

      const active = document.activeElement;
      if (active && active.tagName === 'SELECT') {
        return;
      }

      const now = performance.now();
      const gap = now - this._lastKeyAt;
      this._lastKeyAt = now;

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

      if (e.key === 'Backspace') {
        this._buffer = this._buffer.slice(0, -1);
        this._scheduleReset();
        return;
      }

      if (e.key.length === 1) {
        this._gaps.push(gap);
        if (this._gaps.length > 25) this._gaps.shift();

        this._buffer += e.key;

        const isScannerSpeed = this._scannerSpeed();
        if (isScannerSpeed) {
          e.preventDefault();
        }

        this._scheduleReset();
      }
    },

    simulate(code) {
      if (typeof this._handler === 'function') {
        this._handler(code, { wasScanner: true });
      }
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §10 · FIND ITEM BY SKU
     ═════════════════════════════════════════════════════════════════════ */
  async function findItemBySku(sku) {
    const key = String(sku || '').trim().toUpperCase();
    if (!key) return null;

    try {
      if (GMS.IDB) {
        const item = await GMS.IDB.getBySku(key);
        if (item) return item;
      }
    } catch (e) {
      console.warn('[findItemBySku] IDB failed:', e);
    }

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
     §11 · BATCH TAG PRINTING
     ═════════════════════════════════════════════════════════════════════ */

  async function printBatch(opts = {}) {
    const {
      count = 24,
      branchId = null,
      status = 'IN_STOCK',
      labelWidth = QRState.labelWidth,
    } = opts;

    try {
      let items = [];

      if (GMS.IDB && GMS.IDB.isOpen) {
        const filters = {};
        if (branchId) filters.branch_id = branchId;
        if (status) filters.status = status;

        items = await GMS.IDB.search('', { ...filters, limit: count });
      }

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
     §12 · KARAT DISPLAY MODE
     ═════════════════════════════════════════════════════════════════════
     ✅ v2: تغيير طريقة عرض العيار في التاجات
     ═════════════════════════════════════════════════════════════════════ */

  function setKaratDisplay(mode) {
    const valid = ['auto', 'standard', 'custom', 'purity'];
    if (!valid.includes(mode)) return false;

    QRState.karatDisplay = mode;

    try {
      localStorage.setItem('gms.qr.karatDisplay', mode);
    } catch (_) {}

    return true;
  }

  function loadKaratDisplay() {
    try {
      const saved = localStorage.getItem('gms.qr.karatDisplay');
      if (saved && ['auto', 'standard', 'custom', 'purity'].includes(saved)) {
        QRState.karatDisplay = saved;
      }
    } catch (_) {}
    return QRState.karatDisplay;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §13 · INITIALIZATION
     ═════════════════════════════════════════════════════════════════════ */
  function init() {
    const savedWidth = Printer.loadLabelWidth();
    Printer.setLabelWidth(savedWidth);

    loadKaratDisplay();

    if (typeof window.QRCode === 'undefined') {
      console.warn('[QR] QRCode.js not yet loaded');
    }

    console.log('[QR] v2 Initialized', {
      labelWidth: savedWidth,
      mode: QRState.payloadMode,
      karatDisplay: QRState.karatDisplay,
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §14 · EXPORT
     ═════════════════════════════════════════════════════════════════════ */
  GMS.QR = {
    state: QRState,

    Payload,
    QR,
    Tag,
    Printer,
    Queue,
    Scanner,

    findItemBySku,
    printBatch,

    /* ✅ v2 */
    getItemKaratInfo,
    setKaratDisplay,
    loadKaratDisplay,

    on,
    init,
  };

  GMS.QRPayload = Payload;
  GMS.QRCodeGen = QR;
  GMS.QRTag = Tag;
  GMS.QRPrinter = Printer;
  GMS.QRQueue = Queue;
  GMS.QRScanner = Scanner;

  /* ═════════════════════════════════════════════════════════════════════
     §15 · LOADED CONFIRMATION
     ═════════════════════════════════════════════════════════════════════ */
  console.log(
    '%c📱 QR Engine v2 loaded · Generate + Print + Scan',
    'color:#0e7490;font-weight:800;font-size:12px;padding:1px 5px;' +
    'background:#e0f2f7;border-radius:4px;'
  );

  console.log(
    `%c🎫 58mm / 80mm · 4 payload modes (incl. purity) · Custom karat support`,
    'color:#6b7a95;font-weight:700;font-size:11px;'
  );

  console.log(
    `%c🆕 v2: Custom Karat encoded as C888 · Purity display mode · Auto-detect in parser`,
    'color:#a55a00;font-weight:900;font-size:11px;'
  );

  /* ═════════════════════════════════════════════════════════════════════
     ✅ js/09-qr.js — نهاية الملف
     ═════════════════════════════════════════════════════════════════════ */

})();
