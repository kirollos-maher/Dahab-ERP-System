/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ENTERPRISE — js/02-utils.js
   الأدوات المساعدة: DOM، التنسيق، الأمان، التحقق، حسابات الذهب
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const GMS = window.GMS = window.GMS || {};

  /* ═════════════════════════════════════════════════════════════════════
     §1 · DOM HELPERS
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * querySelector بسيط
   * @param {string} selector
   * @param {Element|Document} [root=document]
   * @returns {Element|null}
   */
  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  /**
   * querySelectorAll يعيد Array
   * @param {string} selector
   * @param {Element|Document} [root=document]
   * @returns {Array<Element>}
   */
  function $$(selector, root) {
    return Array.from((root || document).querySelectorAll(selector));
  }

  /**
   * إنشاء عنصر HTML
   * @param {string} tag
   * @param {Object} [attrs={}]
   * @param {string|Array} [children='']
   * @returns {Element}
   */
  function createEl(tag, attrs, children) {
    const el = document.createElement(tag);

    if (attrs && typeof attrs === 'object') {
      Object.entries(attrs).forEach(([key, val]) => {
        if (val === null || val === undefined || val === false) return;

        if (key === 'class' || key === 'className') {
          el.className = val;
        } else if (key === 'style' && typeof val === 'object') {
          Object.assign(el.style, val);
        } else if (key === 'dataset' && typeof val === 'object') {
          Object.entries(val).forEach(([dk, dv]) => {
            el.dataset[dk] = dv;
          });
        } else if (key === 'html') {
          el.innerHTML = val;
        } else if (key === 'text') {
          el.textContent = val;
        } else if (key.startsWith('on') && typeof val === 'function') {
          el.addEventListener(key.slice(2).toLowerCase(), val);
        } else {
          el.setAttribute(key, String(val));
        }
      });
    }

    if (children !== undefined && children !== null) {
      const list = Array.isArray(children) ? children : [children];
      list.forEach(child => {
        if (typeof child === 'string' || typeof child === 'number') {
          el.appendChild(document.createTextNode(String(child)));
        } else if (child instanceof Node) {
          el.appendChild(child);
        }
      });
    }

    return el;
  }

  /**
   * حذف عنصر بأمان
   * @param {Element} el
   */
  function removeEl(el) {
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  /**
   * تفريغ عنصر
   * @param {Element|string} el
   */
  function clearEl(el) {
    const target = typeof el === 'string' ? $(el) : el;
    if (target) target.innerHTML = '';
  }

  /* ═════════════════════════════════════════════════════════════════════
     §2 · ESCAPE & SANITIZE (XSS / SQL Injection)
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * تحويل الأحرف الخاصة إلى HTML entities
   * @param {*} value
   * @returns {string}
   */
  function escapeHTML(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[c]));
  }

  /**
   * إزالة كل وسوم HTML
   * @param {*} value
   * @returns {string}
   */
  function stripTags(value) {
    return String(value ?? '').replace(/<[^>]*>/g, '');
  }

  /**
   * إزالة الأحرف غير القابلة للطباعة
   * @param {*} value
   * @returns {string}
   */
  function stripControl(value) {
    return String(value ?? '').replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
  }

  /**
   * كشف محاولات الهجوم الشائعة
   * @param {*} value
   * @returns {{xss:boolean, sqlInjection:boolean, pathTraversal:boolean, nullByte:boolean}}
   */
  function detectAttack(value) {
    const s = String(value ?? '');
    return {
      xss: /<script|javascript:|onerror\s*=|onload\s*=|onclick\s*=|onfocus\s*=|<iframe|<object|<embed|data:text\/html|vbscript:/i.test(s),
      sqlInjection: /('\s*(or|and)\s*'?\d)|(\bunion\b\s+\bselect\b)|(\bdrop\b\s+\btable\b)|(--\s)|(;--)|xp_cmdshell|information_schema|sys\.tables/i.test(s),
      pathTraversal: /\.\.\/|\.\.\\/i.test(s),
      nullByte: /\x00/.test(s),
    };
  }

  /**
   * تنظيف نص من XSS والأحرف الضارة
   * @param {*} input
   * @param {Object} [opts={}]
   * @param {number} [opts.maxLength=1000]
   * @param {boolean} [opts.allowNewlines=false]
   * @param {boolean} [opts.trim=true]
   * @returns {string}
   */
  function sanitizeText(input, opts = {}) {
    const {
      maxLength = 1000,
      allowNewlines = false,
      trim = true,
    } = opts;

    let s = String(input ?? '');

    // 1 · إزالة null bytes وأحرف التحكم
    s = stripControl(s);

    // 2 · معالجة الأسطر
    if (!allowNewlines) {
      s = s.replace(/[\r\n]+/g, ' ');
    }
    s = s.replace(/[ \t]+/g, ' ');

    // 3 · تحويل HTML
    s = escapeHTML(s);

    // 4 · trim وحد أقصى
    if (trim) s = s.trim();
    if (s.length > maxLength) s = s.slice(0, maxLength);

    return s;
  }

  /**
   * تنظيف كائن كامل بشكل متكرر قبل إرساله للخادم
   * @param {*} obj
   * @param {Object} [opts={}]
   * @returns {*}
   */
  function sanitizePayload(obj, opts = {}) {
    if (obj === null || obj === undefined) return obj;

    if (typeof obj === 'string') {
      return sanitizeText(obj, opts);
    }

    if (typeof obj === 'number' || typeof obj === 'boolean') {
      return obj;
    }

    if (obj instanceof Date) {
      return obj.toISOString();
    }

    if (Array.isArray(obj)) {
      return obj.map((v) => sanitizePayload(v, opts));
    }

    if (typeof obj === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(obj)) {
        // مفتاح آمن
        const safeKey = String(k).replace(/[^\w.]/g, '_').slice(0, 64);
        out[safeKey] = sanitizePayload(v, opts);
      }
      return out;
    }

    return null;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §3 · NUMBER FORMATTING
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * تنسيق عام للأرقام
   * @param {*} value
   * @param {number} [decimals=2]
   * @returns {string}
   */
  function numFmt(value, decimals = 2) {
    const n = Number(value);
    if (!isFinite(n)) return '0.' + '0'.repeat(decimals);
    return n.toLocaleString('en-EG', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  /**
   * تنسيق مبلغ مالي
   * @param {*} value
   * @param {number} [decimals=2]
   * @returns {string}
   */
  function moneyFmt(value, decimals = 2) {
    return numFmt(value, decimals);
  }

  /**
   * تنسيق وزن بالجرام (3 منازل)
   * @param {*} value
   * @returns {string}
   */
  function gramFmt(value) {
    return numFmt(value, 3);
  }

  /**
   * تنسيق عدد صحيح
   * @param {*} value
   * @returns {string}
   */
  function intFmt(value) {
    const n = Math.round(Number(value) || 0);
    return n.toLocaleString('en-EG', { maximumFractionDigits: 0 });
  }

  /**
   * تنسيق نسبة مئوية
   * @param {*} value
   * @param {number} [decimals=3]
   * @returns {string}
   */
  function pctFmt(value, decimals = 3) {
    return numFmt(value, decimals) + '%';
  }

  /**
   * تنسيق مختصر للمبالغ الكبيرة (K / M)
   * @param {*} value
   * @returns {string}
   */
  function shortMoney(value) {
    const n = Math.abs(Number(value) || 0);
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return n.toFixed(0);
  }

  /**
   * تنسيق رقم بإشارة (+/−)
   * @param {*} value
   * @param {number} [decimals=2]
   * @returns {string}
   */
  function signedFmt(value, decimals = 2) {
    const n = Number(value) || 0;
    if (Math.abs(n) < 1e-9) return '0.' + '0'.repeat(decimals);
    return (n > 0 ? '+' : '−') + numFmt(Math.abs(n), decimals);
  }

  /**
   * تقريب رقم لعدد محدد من المنازل
   * @param {*} value
   * @param {number} [decimals=2]
   * @returns {number}
   */
  function round(value, decimals = 2) {
    const p = Math.pow(10, decimals);
    return Math.round((Number(value) + Number.EPSILON) * p) / p;
  }

  /**
   * حدود رقم بين قيمتين
   * @param {number} value
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  function clamp(value, min, max) {
    return Math.min(Math.max(Number(value), min), max);
  }

  /**
   * تحويل إلى رقم بأمان
   * @param {*} value
   * @param {number} [fallback=0]
   * @returns {number}
   */
  function toNumber(value, fallback = 0) {
    const n = Number(value);
    return isFinite(n) ? n : fallback;
  }

  /**
   * تحويل إلى عدد صحيح بأمان
   * @param {*} value
   * @param {number} [fallback=0]
   * @returns {number}
   */
  function toInt(value, fallback = 0) {
    const n = parseInt(value, 10);
    return isFinite(n) ? n : fallback;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §4 · DATE & TIME FORMATTING
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * تنسيق تاريخ قصير
   * @param {*} date
   * @returns {string}
   */
  function dateAr(date) {
    if (!date) return '—';
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('ar-EG', {
      year: '2-digit',
      month: '2-digit',
      day: '2-digit',
    });
  }

  /**
   * تنسيق تاريخ ووقت
   * @param {*} date
   * @returns {string}
   */
  function dateTimeAr(date) {
    if (!date) return '—';
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('ar-EG', {
      year: '2-digit',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /**
   * تنسيق وقت فقط
   * @param {*} date
   * @returns {string}
   */
  function clockTime(date) {
    if (!date) return '—';
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  /**
   * وقت نسبي (منذ 5 دقائق، منذ ساعتين...)
   * @param {*} date
   * @returns {string}
   */
  function timeAgo(date) {
    if (!date) return '—';
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '—';

    const diff = Date.now() - d.getTime();
    const sec = Math.floor(diff / 1000);

    if (sec < 5) return 'الآن';
    if (sec < 60) return `${sec} ث`;

    const min = Math.floor(sec / 60);
    if (min < 60) return `${min} د`;

    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr} س`;

    const day = Math.floor(hr / 24);
    if (day < 30) return `${day} ي`;

    const mon = Math.floor(day / 30);
    if (mon < 12) return `${mon} شهر`;

    return `${Math.floor(mon / 12)} سنة`;
  }

  /**
   * حساب عدد الأيام بين تاريخين
   * @param {*} a
   * @param {*} b
   * @returns {number}
   */
  function daysBetween(a, b) {
    const d1 = a instanceof Date ? a : new Date(a);
    const d2 = b instanceof Date ? b : new Date(b);
    return Math.floor((d2.getTime() - d1.getTime()) / 86400000);
  }

  /**
   * تاريخ اليوم ISO (YYYY-MM-DD)
   * @returns {string}
   */
  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  /**
   * تاريخ N يوم مضى ISO
   * @param {number} n
   * @returns {string}
   */
  function daysAgoISO(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  }

  /**
   * بداية الشهر الحالي ISO
   * @returns {string}
   */
  function monthStartISO() {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
  }

  /**
   * نهاية الشهر الحالي ISO
   * @returns {string}
   */
  function monthEndISO() {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
  }

  /**
   * تحويل ثواني إلى نص مقروء
   * @param {number} seconds
   * @returns {string}
   */
  function formatDuration(seconds) {
    const s = Math.floor(seconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;

    if (h > 0) return `${h}س ${m}د`;
    if (m > 0) return `${m}د ${sec}ث`;
    return `${sec}ث`;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §5 · BYTES & SIZE FORMATTING
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * تنسيق حجم بالبايت
   * @param {number} bytes
   * @returns {string}
   */
  function bytesFmt(bytes) {
    const b = Number(bytes) || 0;
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    if (b < 1073741824) return (b / 1048576).toFixed(2) + ' MB';
    return (b / 1073741824).toFixed(2) + ' GB';
  }

  /* ═════════════════════════════════════════════════════════════════════
     §6 · GOLD CALCULATIONS (Domain Math)
     ═════════════════════════════════════════════════════════════════════ */

  const Gold = {

    /**
     * الوزن الصافي = القائم - الأحجار
     * @param {number} gross
     * @param {number} [stones=0]
     * @returns {number}
     */
    netWeight(gross, stones = 0) {
      return Math.max(0, round(toNumber(gross) - toNumber(stones), 3));
    },

    /**
     * الوزن الصافي معادل 24K (البندق)
     * @param {number} netWeight
     * @param {number} purityRatio
     * @returns {number}
     */
    pureWeight(netWeight, purityRatio) {
      return round(toNumber(netWeight) * toNumber(purityRatio), 4);
    },

    /**
     * قيمة الذهب = البندق × سعر 24K
     * @param {number} pureWeight
     * @param {number} price24
     * @returns {number}
     */
    goldValue(pureWeight, price24) {
      return round(toNumber(pureWeight) * toNumber(price24), 2);
    },

    /**
     * قيمة المصنعية = الوزن الصافي × سعر الجرام
     * @param {number} netWeight
     * @param {number} perGram
     * @returns {number}
     */
    workmanship(netWeight, perGram) {
      return round(toNumber(netWeight) * toNumber(perGram), 2);
    },

    /**
     * سعر الجرام لعيار معين
     * @param {number} price24
     * @param {number} karat
     * @returns {number}
     */
    priceForKarat(price24, karat) {
      return round(toNumber(price24) * GMS.karatRatio(karat), 2);
    },

    /**
     * نسبة الخسس
     * @param {number} lossGrams
     * @param {number} baseWeight
     * @returns {number}
     */
    lossPct(lossGrams, baseWeight) {
      const base = toNumber(baseWeight);
      if (base <= 0) return 0;
      return round(toNumber(lossGrams) / base * 100, 4);
    },

    /**
     * تحليل شامل لسطر صنف
     * @param {Object} params
     * @returns {Object}
     */
    line(params) {
      const {
        gross = 0,
        stone = 0,
        karat = 21,
        workmanshipPerGram = 0,
        stoneValue = 0,
        price24 = 0,
        qty = 1,
      } = params || {};

      const purityRatio = GMS.karatRatio(karat);
      const net = Gold.netWeight(gross, stone);
      const pure = Gold.pureWeight(net, purityRatio);
      const gold = Gold.goldValue(pure, price24);
      const making = Gold.workmanship(net, workmanshipPerGram);
      const sv = toNumber(stoneValue);
      const unit = round(gold + making + sv, 2);
      const total = round(unit * toNumber(qty, 1), 2);

      return {
        net,
        pure,
        goldValue: gold,
        making,
        stoneValue: sv,
        unit,
        total,
      };
    },

    /**
     * إجماليات مجموعة أصناف
     * @param {Array} items
     * @param {number} price24
     * @returns {Object}
     */
    totals(items, price24) {
      let count = 0;
      let gross = 0;
      let net = 0;
      let pure = 0;
      let gold = 0;
      let making = 0;
      let total = 0;

      (items || []).forEach((it) => {
        const q = toNumber(it.qty, 1);
        const w = toNumber(it.weight_grams || it.gross);
        const n = toNumber(it.net_weight || it.net);
        const p = toNumber(it.pure_weight || it.pure);
        const mp = toNumber(it.workmanship_per_gram || it.workmanshipPerGram);

        count += q;
        gross += w * q;
        net += n * q;
        pure += p * q;
        gold += round(p * price24, 2) * q;
        making += round(n * mp, 2) * q;
      });

      total = round(gold + making, 2);

      return {
        count,
        gross: round(gross, 3),
        net: round(net, 3),
        pure: round(pure, 4),
        gold: round(gold, 2),
        making: round(making, 2),
        total,
      };
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §7 · VALIDATION
     ═════════════════════════════════════════════════════════════════════ */

  const Validate = {

    /**
     * التحقق من بريد إلكتروني
     * @param {string} email
     * @returns {boolean}
     */
    email(email) {
      return GMS.PATTERNS.EMAIL.test(String(email || '').trim());
    },

    /**
     * التحقق من رقم هاتف مصري
     * @param {string} phone
     * @returns {boolean}
     */
    phoneEG(phone) {
      return GMS.PATTERNS.PHONE_EG.test(String(phone || '').replace(/\s|-/g, ''));
    },

    /**
     * التحقق من كود SKU
     * @param {string} sku
     * @returns {boolean}
     */
    sku(sku) {
      return GMS.PATTERNS.SKU.test(String(sku || '').trim());
    },

    /**
     * التحقق من رقم فاتورة
     * @param {string} invoiceNo
     * @returns {boolean}
     */
    invoiceNo(invoiceNo) {
      return GMS.PATTERNS.INVOICE_NO.test(String(invoiceNo || '').trim());
    },

    /**
     * التحقق من رقم دفعة
     * @param {string} batchNo
     * @returns {boolean}
     */
    batchNo(batchNo) {
      return GMS.PATTERNS.BATCH_NO.test(String(batchNo || '').trim());
    },

    /**
     * التحقق من UUID
     * @param {string} uuid
     * @returns {boolean}
     */
    uuid(uuid) {
      return GMS.PATTERNS.UUID.test(String(uuid || '').trim());
    },

    /**
     * التحقق من قوة كلمة المرور
     * @param {string} password
     * @returns {{length:boolean,upper:boolean,lower:boolean,digit:boolean,symbol:boolean,valid:boolean}}
     */
    password(password) {
      const s = String(password || '');
      const result = {
        length: s.length >= GMS.SECURITY_CONFIG.MIN_PASSWORD_LENGTH,
        upper: /[A-Z]/.test(s),
        lower: /[a-z]/.test(s),
        digit: /\d/.test(s),
        symbol: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(s),
      };
      result.valid = result.length && result.upper && result.lower && result.digit && result.symbol;
      return result;
    },

    /**
     * التحقق من وزن
     * @param {number} weight
     * @returns {boolean}
     */
    weight(weight) {
      const w = Number(weight);
      return isFinite(w) && w > 0 && w <= GMS.LIMITS.MAX_WEIGHT_GRAMS;
    },

    /**
     * التحقق من نسبة نقاء
     * @param {number} purity
     * @returns {boolean}
     */
    purity(purity) {
      const p = Number(purity);
      return isFinite(p) && p >= GMS.LIMITS.MIN_PURITY_RATIO && p <= GMS.LIMITS.MAX_PURITY_RATIO;
    },

    /**
     * التحقق من سعر 24K
     * @param {number} price
     * @returns {boolean}
     */
    price24(price) {
      const p = Number(price);
      return isFinite(p) && p >= GMS.LIMITS.MIN_PRICE_24 && p <= GMS.LIMITS.MAX_PRICE_24;
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §8 · TIMING HELPERS
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * debounce — تأجيل التنفيذ حتى توقف الاستدعاءات
   * @param {Function} fn
   * @param {number} [ms=300]
   * @returns {Function}
   */
  function debounce(fn, ms = 300) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  /**
   * throttle — تنفيذ مرة واحدة كل فترة
   * @param {Function} fn
   * @param {number} [ms=300]
   * @returns {Function}
   */
  function throttle(fn, ms = 300) {
    let last = 0;
    let timer;
    return function (...args) {
      const now = Date.now();
      const remaining = ms - (now - last);
      if (remaining <= 0) {
        clearTimeout(timer);
        last = now;
        fn.apply(this, args);
      } else {
        clearTimeout(timer);
        timer = setTimeout(() => {
          last = Date.now();
          fn.apply(this, args);
        }, remaining);
      }
    };
  }

  /**
   * sleep — انتظار
   * @param {number} ms
   * @returns {Promise<void>}
   */
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * requestAnimationFrame wrapper
   * @param {Function} fn
   * @returns {Promise<void>}
   */
  function nextFrame(fn) {
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        if (fn) fn();
        resolve();
      });
    });
  }

  /**
   * تأجيل تنفيذ إلى microtask
   * @returns {Promise<void>}
   */
  function yieldToUI() {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  /* ═════════════════════════════════════════════════════════════════════
     §9 · ID GENERATION
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * توليد معرف فريد قصير
   * @returns {string}
   */
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /**
   * توليد UUID v4
   * @returns {string}
   */
  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * توليد رقم فاتورة
   * @param {string} [prefix='INV']
   * @returns {string}
   */
  function invoiceNo(prefix = 'INV') {
    const d = new Date();
    const stamp = String(d.getFullYear()).slice(2) +
      String(d.getMonth() + 1).padStart(2, '0') +
      String(d.getDate()).padStart(2, '0') + '-' +
      String(d.getHours()).padStart(2, '0') +
      String(d.getMinutes()).padStart(2, '0') +
      String(d.getSeconds()).padStart(2, '0');
    const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
    return `${prefix}-${stamp}-${rand}`;
  }

  /**
   * توليد رقم دفعة
   * @param {string} [prefix='MB']
   * @returns {string}
   */
  function batchNo(prefix = 'MB') {
    const d = new Date();
    const stamp = String(d.getFullYear()).slice(2) +
      String(d.getMonth() + 1).padStart(2, '0') +
      String(d.getDate()).padStart(2, '0') + '-' +
      String(d.getHours()).padStart(2, '0') +
      String(d.getMinutes()).padStart(2, '0');
    const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
    return `${prefix}-${stamp}-${rand}`;
  }

  /**
   * توليد كود SKU
   * @param {Object} params
   * @returns {string}
   */
  function generateSKU(params = {}) {
    const {
      manufacturerCode = 'X',
      karat = 21,
      letter = '',
      date = new Date(),
      seq = 1,
    } = params;

    const prefix = (letter || manufacturerCode || 'X').toUpperCase();
    const stamp = String(date.getFullYear()).slice(2) +
      String(date.getMonth() + 1).padStart(2, '0') +
      String(date.getDate()).padStart(2, '0');
    const seqStr = String(seq).padStart(5, '0');

    return `${prefix}${karat}-${stamp}-${seqStr}`;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §10 · OBJECT & ARRAY HELPERS
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * نسخ عميق بسيط
   * @param {*} obj
   * @returns {*}
   */
  function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (Array.isArray(obj)) return obj.map(deepClone);
    const out = {};
    Object.keys(obj).forEach((k) => {
      out[k] = deepClone(obj[k]);
    });
    return out;
  }

  /**
   * دمج عميق
   * @param {Object} target
   * @param {Object} source
   * @returns {Object}
   */
  function deepMerge(target, source) {
    const out = deepClone(target);
    Object.keys(source || {}).forEach((k) => {
      if (
        source[k] &&
        typeof source[k] === 'object' &&
        !Array.isArray(source[k]) &&
        out[k] &&
        typeof out[k] === 'object'
      ) {
        out[k] = deepMerge(out[k], source[k]);
      } else {
        out[k] = deepClone(source[k]);
      }
    });
    return out;
  }

  /**
   * تجميع مصفوفة حسب مفتاح
   * @param {Array} arr
   * @param {Function|string} keyFn
   * @returns {Object}
   */
  function groupBy(arr, keyFn) {
    const fn = typeof keyFn === 'function' ? keyFn : (x) => x[keyFn];
    return (arr || []).reduce((acc, item) => {
      const key = fn(item);
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});
  }

  /**
   * مجموع مصفوفة حسب حقل
   * @param {Array} arr
   * @param {Function|string} keyFn
   * @returns {number}
   */
  function sumBy(arr, keyFn) {
    const fn = typeof keyFn === 'function' ? keyFn : (x) => x[keyFn];
    return (arr || []).reduce((sum, item) => sum + toNumber(fn(item)), 0);
  }

  /**
   * فريد حسب حقل
   * @param {Array} arr
   * @param {Function|string} keyFn
   * @returns {Array}
   */
  function uniqueBy(arr, keyFn) {
    const fn = typeof keyFn === 'function' ? keyFn : (x) => x[keyFn];
    const seen = new Set();
    return (arr || []).filter((item) => {
      const key = fn(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * ترتيب مصفوفة حسب حقل
   * @param {Array} arr
   * @param {Function|string} keyFn
   * @param {string} [dir='asc']
   * @returns {Array}
   */
  function sortBy(arr, keyFn, dir = 'asc') {
    const fn = typeof keyFn === 'function' ? keyFn : (x) => x[keyFn];
    const mult = dir === 'desc' ? -1 : 1;
    return (arr || []).slice().sort((a, b) => {
      const av = fn(a);
      const bv = fn(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') {
        return (av - bv) * mult;
      }
      return String(av).localeCompare(String(bv), 'ar') * mult;
    });
  }

  /**
   * تقسيم مصفوفة إلى دفعات
   * @param {Array} arr
   * @param {number} size
   * @returns {Array<Array>}
   */
  function chunk(arr, size) {
    const out = [];
    for (let i = 0; i < (arr || []).length; i += size) {
      out.push(arr.slice(i, i + size));
    }
    return out;
  }

  /**
   * اختيار حقول محددة من كائن
   * @param {Object} obj
   * @param {Array<string>} keys
   * @returns {Object}
   */
  function pick(obj, keys) {
    const out = {};
    (keys || []).forEach((k) => {
      if (obj && Object.prototype.hasOwnProperty.call(obj, k)) {
        out[k] = obj[k];
      }
    });
    return out;
  }

  /**
   * حذف حقول محددة من كائن
   * @param {Object} obj
   * @param {Array<string>} keys
   * @returns {Object}
   */
  function omit(obj, keys) {
    const out = { ...(obj || {}) };
    (keys || []).forEach((k) => delete out[k]);
    return out;
  }

  /**
   * مقارنة كائنين (سطحية للقيم البسيطة)
   * @param {*} a
   * @param {*} b
   * @returns {boolean}
   */
  function isEqual(a, b) {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (a && b && typeof a === 'object') {
      return JSON.stringify(a) === JSON.stringify(b);
    }
    return false;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §11 · STRING HELPERS
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * تحويل أول حرف إلى كبير
   * @param {string} s
   * @returns {string}
   */
  function capitalize(s) {
    const str = String(s || '');
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * استخراج الأحرف الأولى من اسم
   * @param {string} name
   * @returns {string}
   */
  function initials(name) {
    if (!name) return '?';
    const parts = String(name).trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  /**
   * قطع نص طويل
   * @param {string} s
   * @param {number} max
   * @param {string} [suffix='…']
   * @returns {string}
   */
  function truncate(s, max, suffix = '…') {
    const str = String(s || '');
    if (str.length <= max) return str;
    return str.slice(0, max - suffix.length) + suffix;
  }

  /**
   * إزالة المسافات الزائدة
   * @param {string} s
   * @returns {string}
   */
  function normalizeSpaces(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
  }

  /**
   * تحويل slug
   * @param {string} s
   * @returns {string}
   */
  function slugify(s) {
    return String(s || '')
      .trim()
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }

  /* ═════════════════════════════════════════════════════════════════════
     §12 · LOCAL STORAGE HELPERS
     ═════════════════════════════════════════════════════════════════════ */

  const LS = {

    /**
     * قراءة قيمة من LocalStorage مع JSON parse
     * @param {string} key
     * @param {*} [fallback=null]
     * @returns {*}
     */
    get(key, fallback = null) {
      try {
        const raw = localStorage.getItem(key);
        if (raw === null) return fallback;
        return JSON.parse(raw);
      } catch (_) {
        return fallback;
      }
    },

    /**
     * حفظ قيمة في LocalStorage مع JSON stringify
     * @param {string} key
     * @param {*} value
     * @returns {boolean}
     */
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (e) {
        console.warn('[LS.set] quota exceeded or unavailable', e.message);
        return false;
      }
    },

    /**
     * حذف مفتاح
     * @param {string} key
     */
    remove(key) {
      try {
        localStorage.removeItem(key);
      } catch (_) {}
    },

    /**
     * التحقق من وجود مفتاح
     * @param {string} key
     * @returns {boolean}
     */
    has(key) {
      try {
        return localStorage.getItem(key) !== null;
      } catch (_) {
        return false;
      }
    },

    /**
     * حذف كل مفاتيح GMS
     */
    clearAll() {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('gms.')) keys.push(k);
      }
      keys.forEach((k) => {
        try {
          localStorage.removeItem(k);
        } catch (_) {}
      });
    },

    /**
     * حساب حجم GMS في LocalStorage
     * @returns {number}
     */
    size() {
      let total = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('gms.')) {
          total += (localStorage.getItem(k) || '').length * 2;
        }
      }
      return total;
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §13 · CLIPBOARD
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * نسخ نص إلى الحافظة
   * @param {string} text
   * @returns {Promise<boolean>}
   */
  async function copyToClipboard(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(String(text));
        return true;
      }
      // fallback قديم
      const ta = document.createElement('textarea');
      ta.value = String(text);
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      return true;
    } catch (_) {
      return false;
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §14 · DOWNLOAD & FILE HELPERS
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * تنزيل blob كملف
   * @param {string} filename
   * @param {Blob} blob
   */
  function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  /**
   * تنزيل نص كملف
   * @param {string} filename
   * @param {string} text
   * @param {string} [mime='text/plain']
   */
  function downloadText(filename, text, mime = 'text/plain;charset=utf-8') {
    const blob = new Blob(['\uFEFF' + text], { type: mime });
    downloadBlob(filename, blob);
  }

  /**
   * تنزيل CSV
   * @param {string} filename
   * @param {Array<Array>} rows
   * @param {Array<string>} [headers]
   */
  function downloadCSV(filename, rows, headers) {
    const escapeCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [];

    if (headers && headers.length) {
      lines.push(headers.map(escapeCell).join(','));
    }
    (rows || []).forEach((row) => {
      lines.push(row.map(escapeCell).join(','));
    });

    downloadText(filename, lines.join('\n'), 'text/csv;charset=utf-8');
  }

  /**
   * قراءة ملف كنص
   * @param {File} file
   * @returns {Promise<string>}
   */
  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file, 'utf-8');
    });
  }

  /**
   * قراءة ملف كـ ArrayBuffer
   * @param {File} file
   * @returns {Promise<ArrayBuffer>}
   */
  function readFileAsBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §15 · COLOR HELPERS
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * قراءة متغير CSS
   * @param {string} name
   * @returns {string}
   */
  function cssVar(name) {
    return getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();
  }

  /**
   * توليد لون من نص (hash)
   * @param {string} str
   * @returns {string}
   */
  function colorFromString(str) {
    let hash = 0;
    const s = String(str || '');
    for (let i = 0; i < s.length; i++) {
      hash = s.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash) % 360;
    return `hsl(${h}, 55%, 55%)`;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §16 · PERFORMANCE HELPERS
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * قياس زمن تنفيذ دالة (sync)
   * @param {Function} fn
   * @param {string} [label]
   * @returns {*}
   */
  function measure(fn, label) {
    const t0 = performance.now();
    const result = fn();
    const elapsed = round(performance.now() - t0, 2);
    if (label) {
      console.log(`⏱️ ${label}: ${elapsed}ms`);
    }
    return result;
  }

  /**
   * قياس زمن تنفيذ دالة (async)
   * @param {Function} fn
   * @param {string} [label]
   * @returns {Promise<*>}
   */
  async function measureAsync(fn, label) {
    const t0 = performance.now();
    const result = await fn();
    const elapsed = round(performance.now() - t0, 2);
    if (label) {
      console.log(`⏱️ ${label}: ${elapsed}ms`);
    }
    return result;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §17 · EVENT HELPERS
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * ربط حدث مع تفويض
   * @param {Element|string} root
   * @param {string} eventName
   * @param {string} selector
   * @param {Function} handler
   */
  function delegate(root, eventName, selector, handler) {
    const target = typeof root === 'string' ? $(root) : root;
    if (!target) return;

    target.addEventListener(eventName, function (e) {
      const matched = e.target.closest(selector);
      if (matched && target.contains(matched)) {
        handler.call(matched, e, matched);
      }
    });
  }

  /**
   * إضافة حدث مع تنظيف تلقائي
   * @param {Element} el
   * @param {string} event
   * @param {Function} handler
   * @param {Object} [opts]
   * @returns {Function} دالة لإزالة الحدث
   */
  function on(el, event, handler, opts) {
    if (!el) return () => {};
    el.addEventListener(event, handler, opts);
    return () => el.removeEventListener(event, handler, opts);
  }

  /**
   * انتظار حدث مرة واحدة
   * @param {Element} el
   * @param {string} event
   * @param {number} [timeout]
   * @returns {Promise<Event>}
   */
  function once(el, event, timeout) {
    return new Promise((resolve, reject) => {
      let timer;
      const handler = (e) => {
        clearTimeout(timer);
        resolve(e);
      };
      el.addEventListener(event, handler, { once: true });
      if (timeout) {
        timer = setTimeout(() => {
          el.removeEventListener(event, handler);
          reject(new Error('Event timeout'));
        }, timeout);
      }
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §18 · URL & QUERY HELPERS
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * قراءة query param من URL
   * @param {string} key
   * @returns {string|null}
   */
  function getQueryParam(key) {
    const params = new URLSearchParams(location.search);
    return params.get(key);
  }

  /**
   * قراءة hash parameter
   * @returns {string}
   */
  function getHash() {
    return location.hash.replace(/^#\/?/, '');
  }

  /**
   * تحديث hash بدون إعادة تحميل
   * @param {string} value
   */
  function setHash(value) {
    if (location.hash !== '#/' + value) {
      history.replaceState(null, '', '#/' + value);
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §19 · EXPORT
     ═════════════════════════════════════════════════════════════════════ */

  GMS.$ = $;
  GMS.$$ = $$;
  GMS.createEl = createEl;
  GMS.removeEl = removeEl;
  GMS.clearEl = clearEl;

  GMS.esc = escapeHTML;
  GMS.escapeHTML = escapeHTML;
  GMS.stripTags = stripTags;
  GMS.stripControl = stripControl;
  GMS.detectAttack = detectAttack;
  GMS.sanitizeText = sanitizeText;
  GMS.sanitizePayload = sanitizePayload;

  GMS.numFmt = numFmt;
  GMS.moneyFmt = moneyFmt;
  GMS.gramFmt = gramFmt;
  GMS.intFmt = intFmt;
  GMS.pctFmt = pctFmt;
  GMS.shortMoney = shortMoney;
  GMS.signedFmt = signedFmt;
  GMS.round = round;
  GMS.clamp = clamp;
  GMS.toNumber = toNumber;
  GMS.toInt = toInt;

  GMS.dateAr = dateAr;
  GMS.dateTimeAr = dateTimeAr;
  GMS.clockTime = clockTime;
  GMS.timeAgo = timeAgo;
  GMS.daysBetween = daysBetween;
  GMS.todayISO = todayISO;
  GMS.daysAgoISO = daysAgoISO;
  GMS.monthStartISO = monthStartISO;
  GMS.monthEndISO = monthEndISO;
  GMS.formatDuration = formatDuration;

  GMS.bytesFmt = bytesFmt;

  GMS.Gold = Gold;
  GMS.Validate = Validate;

  GMS.debounce = debounce;
  GMS.throttle = throttle;
  GMS.sleep = sleep;
  GMS.nextFrame = nextFrame;
  GMS.yieldToUI = yieldToUI;

  GMS.uid = uid;
  GMS.uuid = uuid;
  GMS.invoiceNo = invoiceNo;
  GMS.batchNo = batchNo;
  GMS.generateSKU = generateSKU;

  GMS.deepClone = deepClone;
  GMS.deepMerge = deepMerge;
  GMS.groupBy = groupBy;
  GMS.sumBy = sumBy;
  GMS.uniqueBy = uniqueBy;
  GMS.sortBy = sortBy;
  GMS.chunk = chunk;
  GMS.pick = pick;
  GMS.omit = omit;
  GMS.isEqual = isEqual;

  GMS.capitalize = capitalize;
  GMS.initials = initials;
  GMS.truncate = truncate;
  GMS.normalizeSpaces = normalizeSpaces;
  GMS.slugify = slugify;

  GMS.LS = LS;

  GMS.copyToClipboard = copyToClipboard;
  GMS.downloadBlob = downloadBlob;
  GMS.downloadText = downloadText;
  GMS.downloadCSV = downloadCSV;
  GMS.readFileAsText = readFileAsText;
  GMS.readFileAsBuffer = readFileAsBuffer;

  GMS.cssVar = cssVar;
  GMS.colorFromString = colorFromString;

  GMS.measure = measure;
  GMS.measureAsync = measureAsync;

  GMS.delegate = delegate;
  GMS.on = on;
  GMS.once = once;

  GMS.getQueryParam = getQueryParam;
  GMS.getHash = getHash;
  GMS.setHash = setHash;

  /* ═════════════════════════════════════════════════════════════════════
     §20 · LOADED CONFIRMATION
     ═════════════════════════════════════════════════════════════════════ */
  console.log(
    '%c🔧 Utils loaded · 19 modules exposed',
    'color:#1c4fd8;font-weight:800;font-size:12px;padding:1px 5px;' +
    'background:#e9efff;border-radius:4px;'
  );

  console.log(
    `%c⚙️  DOM · Format · Sanitize · Validate · Gold · Timers · Storage · Files · Events`,
    'color:#6b7a95;font-weight:700;font-size:11px;'
  );

  /* ═════════════════════════════════════════════════════════════════════
     ✅ js/02-utils.js — نهاية الملف
     ═════════════════════════════════════════════════════════════════════ */

})();