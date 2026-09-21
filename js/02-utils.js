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

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function $$(selector, root) {
    return Array.from((root || document).querySelectorAll(selector));
  }

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

  function removeEl(el) {
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function clearEl(el) {
    const target = typeof el === 'string' ? $(el) : el;
    if (target) target.innerHTML = '';
  }

  /* ═════════════════════════════════════════════════════════════════════
     §2 · ESCAPE & SANITIZE (XSS / SQL Injection)
     ═════════════════════════════════════════════════════════════════════ */

  function escapeHTML(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function stripTags(value) {
    return String(value ?? '').replace(/<[^>]*>/g, '');
  }

  function stripControl(value) {
    return String(value ?? '').replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
  }

  function detectAttack(value) {
    const s = String(value ?? '');
    return {
      xss: /<script|javascript:|onerror\s*=|onload\s*=|onclick\s*=|onfocus\s*=|onblur\s*=|onchange\s*=|onsubmit\s*=|onkeydown\s*=|onkeyup\s*=|onmouseover\s*=|onmouseout\s*=|onmousedown\s*=|onmouseup\s*=|onmousemove\s*=|onmouseenter\s*=|onmouseleave\s*=|ondblclick\s*=|oninput\s*=|onscroll\s*=|onwheel\s*=|ondrag\s*=|ondrop\s*=|onpaste\s*=|oncopy\s*=|oncut\s*=|oncontextmenu\s*=|onplay\s*=|onpause\s*=|onended\s*=|onabort\s*=|oncanplay\s*=|oncanplaythrough\s*=|ondurationchange\s*=|onemptied\s*=|onerror\s*=|onloadeddata\s*=|onloadedmetadata\s*=|onloadstart\s*=|onpause\s*=|onplay\s*=|onplaying\s*=|onprogress\s*=|onratechange\s*=|onseeked\s*=|onseeking\s*=|onstalled\s*=|onsuspend\s*=|ontimeupdate\s*=|onvolumechange\s*=|onwaiting\s*=|onloadstart\s*=|onanimationstart\s*=|onanimationend\s*=|onanimationiteration\s*=|ontransitionend\s*=|onbeforeunload\s*=|onunload\s*=|onhashchange\s*=|onpopstate\s*=|onstorage\s*=|onmessage\s*=|ononline\s*=|onoffline\s*=|onresize\s*=|ondeviceorientation\s*=|ondevicemotion\s*=|onbeforeinstallprompt\s*=|onappinstalled\s*=|onpointerdown\s*=|onpointerup\s*=|onpointermove\s*=|onpointerover\s*=|onpointerout\s*=|onpointerenter\s*=|onpointerleave\s*=|onpointercancel\s*=|onpointerlockchange\s*=|onpointerlockerror\s*=|onselectionchange\s*=|onselectstart\s*=|ontouchstart\s*=|ontouchend\s*=|ontouchmove\s*=|ontouchcancel\s*=|onfocusin\s*=|onfocusout\s*=|onauxclick\s*=|ongotpointercapture\s*=|onlostpointercapture\s*=|onbeforematch\s*=|onformdata\s*=|oninvalid\s*=|onreset\s*=|onsearch\s*=|onslotchange\s*=|ontoggle\s*=|onbeforeinput\s*=|oncompositionstart\s*=|oncompositionupdate\s*=|oncompositionend\s*=|onload\s*=|onerror\s*=|onmessage\s*=|onmessageerror\s*=|onreadystatechange\s*=|onrejectionhandled\s*=|onunhandledrejection\s*=|ontouchstart\s*=|ontouchend\s*=|ontouchmove\s*=|ontouchcancel\s*=|onwheel\s*=|onmousewheel\s*=|onunload\s*=|onerror\s*=|onselect\s*=|onselectstart\s*=|onstart\s*=|onbounce\s*=|onfinish\s*=|onrepeat\s*=|onshow\s*=|onbeforeprint\s*=|onafterprint\s*=|onbeforecopy\s*=|onbeforecut\s*=|onbeforepaste\s*=|oncopy\s*=|oncut\s*=|onpaste\s*=|javascript:|data:text\/html|data:application\/xhtml|vbscript:|livescript:|mocha:|vbs:|jar:|<iframe|<object|<embed|<applet|<meta|<link|<style|<base|<form|<frame|<frameset|<script|<svg|<math|<template|<noscript|<base64/i.test(s),
      sqlInjection: /('\s*(or|and)\s*'?\d)|(\bunion\b\s+\bselect\b)|(\bdrop\b\s+\btable\b)|(--\s)|(;--)|xp_cmdshell|information_schema|sys\.tables|sp_executesql|execute\s*\(|bulk\s+insert|waitfor\s+delay|benchmark\s*\(|sleep\s*\(|load_file\s*\(|into\s+outfile|into\s+dumpfile/i.test(s),
      pathTraversal: /\.\.\/|\.\.\\/i.test(s),
      nullByte: /\x00/.test(s),
    };
  }

  function sanitizeText(input, opts = {}) {
    const {
      maxLength = 1000,
      allowNewlines = false,
      trim = true,
    } = opts;

    let s = String(input ?? '');

    s = stripControl(s);

    if (!allowNewlines) {
      s = s.replace(/[\r\n]+/g, ' ');
    }
    s = s.replace(/[ \t]+/g, ' ');

    s = escapeHTML(s);

    if (trim) s = s.trim();
    if (s.length > maxLength) s = s.slice(0, maxLength);

    return s;
  }

  function sanitizePayload(obj, opts = {}) {
    if (obj === null || obj === undefined) return obj;

    if (typeof obj === 'string') return sanitizeText(obj, opts);
    if (typeof obj === 'number' || typeof obj === 'boolean') return obj;
    if (obj instanceof Date) return obj.toISOString();

    if (Array.isArray(obj)) {
      return obj.map((v) => sanitizePayload(v, opts));
    }

    if (typeof obj === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(obj)) {
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

  function numFmt(value, decimals = 2) {
    const n = Number(value);
    if (!isFinite(n)) return '0.' + '0'.repeat(decimals);
    return n.toLocaleString('en-EG', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  function moneyFmt(value, decimals = 2) {
    return numFmt(value, decimals);
  }

  function gramFmt(value) {
    return numFmt(value, 3);
  }

  function intFmt(value) {
    const n = Math.round(Number(value) || 0);
    return n.toLocaleString('en-EG', { maximumFractionDigits: 0 });
  }

  function pctFmt(value, decimals = 3) {
    return numFmt(value, decimals) + '%';
  }

  function shortMoney(value) {
    const n = Math.abs(Number(value) || 0);
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return n.toFixed(0);
  }

  function signedFmt(value, decimals = 2) {
    const n = Number(value) || 0;
    if (Math.abs(n) < 1e-9) return '0.' + '0'.repeat(decimals);
    return (n > 0 ? '+' : '−') + numFmt(Math.abs(n), decimals);
  }

  function round(value, decimals = 2) {
    const p = Math.pow(10, decimals);
    return Math.round((Number(value) + Number.EPSILON) * p) / p;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(Number(value), min), max);
  }

  function toNumber(value, fallback = 0) {
    const n = Number(value);
    return isFinite(n) ? n : fallback;
  }

  function toInt(value, fallback = 0) {
    const n = parseInt(value, 10);
    return isFinite(n) ? n : fallback;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §4 · DATE & TIME FORMATTING
     ═════════════════════════════════════════════════════════════════════ */

  function dateAr(date) {
    if (!date) return '—';
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('ar-EG', {
      year: '2-digit', month: '2-digit', day: '2-digit',
    });
  }

  function dateTimeAr(date) {
    if (!date) return '—';
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('ar-EG', {
      year: '2-digit', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  }

  function clockTime(date) {
    if (!date) return '—';
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString('ar-EG', {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  }

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

  function daysBetween(a, b) {
    const d1 = a instanceof Date ? a : new Date(a);
    const d2 = b instanceof Date ? b : new Date(b);
    return Math.floor((d2.getTime() - d1.getTime()) / 86400000);
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function daysAgoISO(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  }

  function monthStartISO() {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
  }

  function monthEndISO() {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
  }

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

    netWeight(gross, stones = 0) {
      return Math.max(0, round(toNumber(gross) - toNumber(stones), 3));
    },

    pureWeight(netWeight, purityRatio) {
      return round(toNumber(netWeight) * toNumber(purityRatio), 4);
    },

    goldValue(pureWeight, price24) {
      return round(toNumber(pureWeight) * toNumber(price24), 2);
    },

    workmanship(netWeight, perGram) {
      return round(toNumber(netWeight) * toNumber(perGram), 2);
    },

    priceForKarat(price24, karat) {
      return round(toNumber(price24) * GMS.karatRatio(karat), 2);
    },

    lossPct(lossGrams, baseWeight) {
      const base = toNumber(baseWeight);
      if (base <= 0) return 0;
      return round(toNumber(lossGrams) / base * 100, 4);
    },

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

    email(email) {
      return GMS.PATTERNS.EMAIL.test(String(email || '').trim());
    },

    phoneEG(phone) {
      return GMS.PATTERNS.PHONE_EG.test(String(phone || '').replace(/\s|-/g, ''));
    },

    sku(sku) {
      return GMS.PATTERNS.SKU.test(String(sku || '').trim());
    },

    invoiceNo(invoiceNo) {
      return GMS.PATTERNS.INVOICE_NO.test(String(invoiceNo || '').trim());
    },

    batchNo(batchNo) {
      return GMS.PATTERNS.BATCH_NO.test(String(batchNo || '').trim());
    },

    uuid(uuid) {
      return GMS.PATTERNS.UUID.test(String(uuid || '').trim());
    },

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

    weight(weight) {
      const w = Number(weight);
      return isFinite(w) && w > 0 && w <= GMS.LIMITS.MAX_WEIGHT_GRAMS;
    },

    purity(purity) {
      const p = Number(purity);
      return isFinite(p) && p >= GMS.LIMITS.MIN_PURITY_RATIO && p <= GMS.LIMITS.MAX_PURITY_RATIO;
    },

    price24(price) {
      const p = Number(price);
      return isFinite(p) && p >= GMS.LIMITS.MIN_PRICE_24 && p <= GMS.LIMITS.MAX_PRICE_24;
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §8 · TIMING HELPERS
     ═════════════════════════════════════════════════════════════════════ */

  function debounce(fn, ms = 300) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

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

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function nextFrame(fn) {
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        if (fn) fn();
        resolve();
      });
    });
  }

  function yieldToUI() {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  /* ═════════════════════════════════════════════════════════════════════
     §9 · ID GENERATION
     ═════════════════════════════════════════════════════════════════════ */

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

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

  function groupBy(arr, keyFn) {
    const fn = typeof keyFn === 'function' ? keyFn : (x) => x[keyFn];
    return (arr || []).reduce((acc, item) => {
      const key = fn(item);
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});
  }

  function sumBy(arr, keyFn) {
    const fn = typeof keyFn === 'function' ? keyFn : (x) => x[keyFn];
    return (arr || []).reduce((sum, item) => sum + toNumber(fn(item)), 0);
  }

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

  function chunk(arr, size) {
    const out = [];
    for (let i = 0; i < (arr || []).length; i += size) {
      out.push(arr.slice(i, i + size));
    }
    return out;
  }

  function pick(obj, keys) {
    const out = {};
    (keys || []).forEach((k) => {
      if (obj && Object.prototype.hasOwnProperty.call(obj, k)) {
        out[k] = obj[k];
      }
    });
    return out;
  }

  function omit(obj, keys) {
    const out = { ...(obj || {}) };
    (keys || []).forEach((k) => delete out[k]);
    return out;
  }

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

  function capitalize(s) {
    const str = String(s || '');
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function initials(name) {
    if (!name) return '?';
    const parts = String(name).trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function truncate(s, max, suffix = '…') {
    const str = String(s || '');
    if (str.length <= max) return str;
    return str.slice(0, max - suffix.length) + suffix;
  }

  function normalizeSpaces(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
  }

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

    get(key, fallback = null) {
      try {
        const raw = localStorage.getItem(key);
        if (raw === null) return fallback;
        return JSON.parse(raw);
      } catch (_) {
        return fallback;
      }
    },

    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (e) {
        console.warn('[LS.set] quota exceeded or unavailable', e.message);
        return false;
      }
    },

    remove(key) {
      try {
        localStorage.removeItem(key);
      } catch (_) {}
    },

    has(key) {
      try {
        return localStorage.getItem(key) !== null;
      } catch (_) {
        return false;
      }
    },

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

  async function copyToClipboard(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(String(text));
        return true;
      }
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

  function downloadText(filename, text, mime = 'text/plain;charset=utf-8') {
    const blob = new Blob(['\uFEFF' + text], { type: mime });
    downloadBlob(filename, blob);
  }

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

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file, 'utf-8');
    });
  }

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

  function cssVar(name) {
    return getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();
  }

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

  function measure(fn, label) {
    const t0 = performance.now();
    const result = fn();
    const elapsed = round(performance.now() - t0, 2);
    if (label) {
      console.log(`⏱️ ${label}: ${elapsed}ms`);
    }
    return result;
  }

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

  function on(el, event, handler, opts) {
    if (!el) return () => {};
    el.addEventListener(event, handler, opts);
    return () => el.removeEventListener(event, handler, opts);
  }

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

  function getQueryParam(key) {
    const params = new URLSearchParams(location.search);
    return params.get(key);
  }

  function getHash() {
    return location.hash.replace(/^#\/?/, '');
  }

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

  /* ✅ Aliases مباشرة لدوال حسابات الذهب (للتوافق مع كل الموديولات) */
  GMS.lossPct = Gold.lossPct.bind(Gold);
  GMS.netWeight = Gold.netWeight.bind(Gold);
  GMS.pureWeight = Gold.pureWeight.bind(Gold);
  GMS.goldValue = Gold.goldValue.bind(Gold);
  GMS.workmanship = Gold.workmanship.bind(Gold);
  GMS.priceForKarat = Gold.priceForKarat.bind(Gold);

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

  console.log(
    `%c✅ Gold aliases exposed: lossPct, netWeight, pureWeight, goldValue, workmanship, priceForKarat`,
    'color:#0f7a43;font-weight:700;font-size:11px;'
  );

  /* ═════════════════════════════════════════════════════════════════════
     ✅ js/02-utils.js — نهاية الملف
     ═════════════════════════════════════════════════════════════════════ */

})();
