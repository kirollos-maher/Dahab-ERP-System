/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ENTERPRISE — service-worker.js
   Service Worker للتشغيل بدون إنترنت (Offline-First)

   الاستراتيجيات:
     • Static Assets → Stale-While-Revalidate
     • CDN Libraries → Cache-First مع TTL طويل
     • Navigation HTML → Network-First with Cache Fallback
     • Supabase API → Network-First (بدون Cache — البيانات مُدارة بالـ IndexedDB)
     • POST/PUT/DELETE → تُمرَّر مباشرة للسيرفر (لا تُخزَّن)
     • Background Sync → للمزامنة التلقائية عند عودة الشبكة

   Version: 1.0.9
   ═══════════════════════════════════════════════════════════════════════ */

'use strict';

/* ─────────────────────────────────────────────────────────────────────
   §1 · CACHE VERSIONING
   ─────────────────────────────────────────────────────────────────────
   ⚠️ مهم جداً: كل ما تُحدِّث الكود، ارفع رقم SW_VERSION.
   عند تغييره:
     - الكاش القديم يُحذَف تلقائياً في activate
     - يُشعر المستخدم بوجود تحديث جديد
   ───────────────────────────────────────────────────────────────────── */
const SW_VERSION = 'v1.0.9';        // ✅ NEW: مُحدَّث لدعم Accounting View
const BUILD_DATE = '2026-09-23';    // ✅ NEW: تاريخ البناء

const CACHE_STATIC = `gold-erp-static-${SW_VERSION}`;
const CACHE_CDN    = `gold-erp-cdn-${SW_VERSION}`;
const CACHE_IMAGES = `gold-erp-images-${SW_VERSION}`;
const CACHE_PAGES  = `gold-erp-pages-${SW_VERSION}`;

const CACHE_MAX_AGE_CDN_MS    = 30 * 24 * 60 * 60 * 1000; // 30 يوم
const CACHE_MAX_AGE_PAGES_MS  = 7 * 24 * 60 * 60 * 1000;  // 7 أيام

/* ─────────────────────────────────────────────────────────────────────
   §2 · PRECACHE MANIFEST
   ─────────────────────────────────────────────────────────────────────
   الملفات التي تُحمَّل عند أول تثبيت — متاحة فوراً بدون شبكة
   ───────────────────────────────────────────────────────────────────── */
const PRECACHE_URLS = [
  /* Core HTML */
  './',
  './index.html',

  /* Styles */
  './style.css',

  /* Core JS Modules (بالترتيب) */
  './js/01-config.js',
  './js/02-utils.js',
  './js/03-i18n.js',
  './js/04-cache.js',
  './js/05-sync.js',
  './js/06-auth.js',
  './js/07-ui.js',
  './js/08-demo.js',
  './js/09-qr.js',
  './js/10-excel.js',
  './js/11-realtime.js',

  /* Views */
  './js/12-views-dashboard.js',
  './js/13-views-pos.js',
  './js/14-views-inventory.js',
  './js/15-views-suppliers.js',
  './js/16-views-returns.js',
  './js/17-views-analytics.js',
  './js/18-views-loss.js',
  './js/19-views-audit.js',
  './js/20-views-queue.js',
  './js/21-views-settings.js',
  './js/22-router.js',
  './js/23-boot.js',
  './js/24-views-repair.js',
  './js/25-pwa.js',

  /* ✅ NEW: Accounting View */
  './js/26-views-accounting.js',

  /* Manifest */
  './manifest.json',

  /* Icons */
  './icons/icon.svg',
  './icons/icon-maskable.svg',

  /* Offline fallback */
  './offline.html'
];

/* ─────────────────────────────────────────────────────────────────────
   §3 · CDN PRECACHE (اختياري — يعمل بالشبكة أول مرة ثم يُخزَّن)
   ─────────────────────────────────────────────────────────────────────
   لا نُجهِز هذا في install لأن الروابط كبيرة — يُخزَّن عند أول استخدام
   ───────────────────────────────────────────────────────────────────── */
const CDN_HOSTS = [
  'cdn.jsdelivr.net',
  'unpkg.com',
  'cdnjs.cloudflare.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

/* ─────────────────────────────────────────────────────────────────────
   §4 · INSTALL EVENT
   ─────────────────────────────────────────────────────────────────────
   - يُخزِّن كل ملفات PRECACHE_URLS
   - skipWaiting() لتفعيل SW الجديد فوراً
   ───────────────────────────────────────────────────────────────────── */
self.addEventListener('install', (event) => {
  console.log(`[SW] 📦 Installing ${SW_VERSION} (${BUILD_DATE})`);

  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_STATIC);

      /* تحميل كل ملف على حدة — لا يفشل الكل لو واحد فشل */
      const results = await Promise.allSettled(
        PRECACHE_URLS.map(async (url) => {
          try {
            const req = new Request(url, { cache: 'reload' });
            const resp = await fetch(req);
            if (!resp.ok) {
              console.warn(`[SW] ⚠️ Failed to cache ${url}: ${resp.status}`);
              return;
            }
            await cache.put(url, resp);
          } catch (e) {
            console.warn(`[SW] ⚠️ Network error for ${url}:`, e.message);
          }
        })
      );

      const ok = results.filter(r => r.status === 'fulfilled').length;
      console.log(`[SW] ✅ Precached ${ok}/${PRECACHE_URLS.length} files`);

      /* تفعيل SW الجديد فوراً */
      await self.skipWaiting();
    })()
  );
});

/* ─────────────────────────────────────────────────────────────────────
   §5 · ACTIVATE EVENT
   ─────────────────────────────────────────────────────────────────────
   - يحذف كل الكاشات القديمة (النسخ السابقة)
   - clients.claim() للسيطرة على كل التبويبات المفتوحة
   ───────────────────────────────────────────────────────────────────── */
self.addEventListener('activate', (event) => {
  console.log(`[SW] 🚀 Activating ${SW_VERSION}`);

  event.waitUntil(
    (async () => {
      /* احذف كل كاش بأسماء النسخ القديمة */
      const cacheNames = await caches.keys();
      const validNames = new Set([
        CACHE_STATIC,
        CACHE_CDN,
        CACHE_IMAGES,
        CACHE_PAGES
      ]);

      await Promise.all(
        cacheNames
          .filter(name => name.startsWith('gold-erp-') && !validNames.has(name))
          .map(name => {
            console.log(`[SW] 🗑️ Deleting old cache: ${name}`);
            return caches.delete(name);
          })
      );

      /* سيطر على كل التبويبات المفتوحة */
      await self.clients.claim();

      /* أخبر التطبيق أن SW الجديد جاهز */
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach(client => {
        client.postMessage({
          type: 'SW_ACTIVATED',
          version: SW_VERSION
        });
      });

      console.log(`[SW] ✅ Activated ${SW_VERSION}`);
    })()
  );
});

/* ─────────────────────────────────────────────────────────────────────
   §6 · FETCH STRATEGIES
   ───────────────────────────────────────────────────────────────────── */

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  /* ─────────────────────────────────────────────────────── */
  /* تجاهل:                                                    */
  /*  • POST/PUT/DELETE → تُمرَّر للسيرفر                       */
  /*  • chrome-extension:// و devtools                         */
  /*  • طلبات Supabase Auth (تتطلب تحديث فوري)                 */
  /* ─────────────────────────────────────────────────────── */
  if (request.method !== 'GET') return;

  if (url.protocol === 'chrome-extension:' || url.protocol === 'moz-extension:') {
    return;
  }

  if (url.hostname.includes('supabase.co') && url.pathname.includes('/auth/')) {
    return; // لا نُخزِّن Auth
  }

  /* ─────────────────────────────────────────────────────── */
  /* Routing                                                   */
  /* ─────────────────────────────────────────────────────── */

  /* 1 · CDN libraries → Cache-First مع TTL طويل */
  if (CDN_HOSTS.some(h => url.hostname.includes(h))) {
    event.respondWith(handleCDNRequest(request));
    return;
  }

  /* 2 · Supabase API → Network-First (البيانات في IndexedDB) */
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(handleAPIRequest(request));
    return;
  }

  /* 3 · Icons & Images → Cache-First */
  if (
    request.destination === 'image' ||
    url.pathname.startsWith('/icons/')
  ) {
    event.respondWith(handleImageRequest(request));
    return;
  }

  /* 4 · Navigation (HTML) → Network-First with Offline Fallback */
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(handleNavigationRequest(request));
    return;
  }

  /* 5 · Static assets (JS/CSS/Fonts) → Stale-While-Revalidate */
  if (
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'font' ||
    url.pathname.match(/\.(js|css|woff2?|ttf|eot)$/i)
  ) {
    event.respondWith(handleStaticRequest(request));
    return;
  }

  /* 6 · افتراضي → Stale-While-Revalidate */
  event.respondWith(handleStaticRequest(request));
});

/* ─────────────────────────────────────────────────────────────────────
   §6.1 · Stale-While-Revalidate (Static Assets)
   ─────────────────────────────────────────────────────────────────────
   1. يرجّع من الكاش فوراً (سريع)
   2. في نفس الوقت يجلب من الشبكة ويحدّث الكاش للزيارة القادمة
   ───────────────────────────────────────────────────────────────────── */
async function handleStaticRequest(request) {
  const cache = await caches.open(CACHE_STATIC);
  const cached = await cache.match(request);

  /* Network fetch بالخلفية */
  const networkPromise = fetch(request)
    .then(response => {
      if (response && response.ok && response.type === 'basic') {
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    })
    .catch(() => null);

  /* لو عندنا كاش → رجّعه فوراً */
  if (cached) {
    networkPromise.catch(() => {});
    return cached;
  }

  /* مفيش كاش → انتظر الشبكة */
  const network = await networkPromise;
  if (network) return network;

  /* فشل كل شيء */
  return new Response(
    '/* Offline — Asset unavailable */',
    { status: 503, headers: { 'Content-Type': 'text/plain;charset=utf-8' } }
  );
}

/* ─────────────────────────────────────────────────────────────────────
   §6.2 · Cache-First مع TTL (CDN Libraries)
   ─────────────────────────────────────────────────────────────────────
   مكتبات ثابتة (lucide, chart.js, xlsx) — لا تتغير كثيراً
   ───────────────────────────────────────────────────────────────────── */
async function handleCDNRequest(request) {
  const cache = await caches.open(CACHE_CDN);
  const cached = await cache.match(request);

  if (cached) {
    const cachedAt = cached.headers.get('x-sw-cached-at');
    if (cachedAt) {
      const age = Date.now() - Number(cachedAt);
      if (age < CACHE_MAX_AGE_CDN_MS) {
        fetch(request)
          .then(resp => {
            if (resp && resp.ok) {
              const copy = resp.clone();
              const headers = new Headers(copy.headers);
              headers.set('x-sw-cached-at', String(Date.now()));
              const tagged = new Response(copy.body, {
                status: copy.status,
                statusText: copy.statusText,
                headers
              });
              cache.put(request, tagged).catch(() => {});
            }
          })
          .catch(() => {});
        return cached;
      }
    } else {
      return cached;
    }
  }

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const copy = response.clone();
      const headers = new Headers(copy.headers);
      headers.set('x-sw-cached-at', String(Date.now()));
      const tagged = new Response(copy.body, {
        status: copy.status,
        statusText: copy.statusText,
        headers
      });
      cache.put(request, tagged).catch(() => {});
    }
    return response;
  } catch (e) {
    if (cached) return cached;
    return new Response(
      '/* CDN Unavailable */',
      { status: 503, headers: { 'Content-Type': 'text/plain;charset=utf-8' } }
    );
  }
}

/* ─────────────────────────────────────────────────────────────────────
   §6.3 · Network-First (Supabase API)
   ─────────────────────────────────────────────────────────────────────
   البيانات الحساسة — نُفضّل الشبكة، وإذا فشلت نرجّع من IndexedDB
   (IndexedDB يُدار من 04-cache.js في الـ main thread، ليس هنا)
   ───────────────────────────────────────────────────────────────────── */
async function handleAPIRequest(request) {
  try {
    const response = await fetch(request);
    return response;
  } catch (e) {
    /* الشبكة فشلت — رجّع استجابة 503 تحمل علامة خاصة */
    return new Response(
      JSON.stringify({
        error: 'OFFLINE',
        message: 'لا يوجد اتصال بالإنترنت — سيتم استخدام البيانات المحلية'
      }),
      {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'application/json;charset=utf-8' }
      }
    );
  }
}

/* ─────────────────────────────────────────────────────────────────────
   §6.4 · Cache-First (Images)
   ───────────────────────────────────────────────────────────────────── */
async function handleImageRequest(request) {
  const cache = await caches.open(CACHE_IMAGES);
  const cached = await cache.match(request);

  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (e) {
    /* صورة افتراضية أو خطأ صامت */
    return new Response('', { status: 404 });
  }
}

/* ─────────────────────────────────────────────────────────────────────
   §6.5 · Network-First (Navigation)
   ─────────────────────────────────────────────────────────────────────
   SPA: كل الصفحات تُوجَّه إلى index.html
   ───────────────────────────────────────────────────────────────────── */
async function handleNavigationRequest(request) {
  const cache = await caches.open(CACHE_PAGES);

  try {
    const response = await fetch(request);

    if (response && response.ok) {
      /* ✅ ناخد clone قبل استخدام body */
      const copy = response.clone();
      const headers = new Headers(copy.headers);
      headers.set('x-sw-cached-at', String(Date.now()));

      const tagged = new Response(copy.body, {
        status: copy.status,
        statusText: copy.statusText,
        headers
      });
      cache.put(request, tagged).catch(() => {});
    }

    return response;

  } catch (e) {
    const cachedPage = await cache.match(request);
    if (cachedPage) return cachedPage;

    const fallback = await caches.match('./index.html');
    if (fallback) return fallback;

    const offline = await caches.match('./offline.html');
    if (offline) return offline;

    return new Response(
      '<h1>لا يوجد اتصال</h1><p>يرجى التحقق من الإنترنت وإعادة المحاولة.</p>',
      {
        status: 503,
        headers: { 'Content-Type': 'text/html;charset=utf-8' }
      }
    );
  }
}

/* ─────────────────────────────────────────────────────────────────────
   §7 · MESSAGE HANDLER
   ─────────────────────────────────────────────────────────────────────
   التواصل بين main thread والـ SW
   ───────────────────────────────────────────────────────────────────── */
self.addEventListener('message', (event) => {
  const data = event.data || {};

  switch (data.type) {
    case 'SKIP_WAITING':
      console.log('[SW] 📨 Skip waiting requested');
      self.skipWaiting();
      break;

    case 'GET_VERSION':
      event.ports?.[0]?.postMessage({ version: SW_VERSION, build: BUILD_DATE });
      break;

    case 'CLEAR_CACHE':
      event.waitUntil(
        (async () => {
          const names = await caches.keys();
          await Promise.all(
            names
              .filter(n => n.startsWith('gold-erp-'))
              .map(n => caches.delete(n))
          );
          event.ports?.[0]?.postMessage({ cleared: true });
        })()
      );
      break;

    case 'PING':
      event.ports?.[0]?.postMessage({ type: 'PONG', version: SW_VERSION });
      break;

    default:
      /* console.warn('[SW] Unknown message:', data.type); */
      break;
  }
});

/* ─────────────────────────────────────────────────────────────────────
   §8 · BACKGROUND SYNC
   ─────────────────────────────────────────────────────────────────────
   يعمل عندما يكتشف المتصفح عودة الشبكة حتى لو كان التطبيق مغلقاً.
   ⚠️ مدعوم في: Chrome/Edge (Android + Desktop). غير مدعوم في iOS Safari.
   ───────────────────────────────────────────────────────────────────── */
self.addEventListener('sync', (event) => {
  console.log('[SW] 🔄 Background Sync triggered:', event.tag);

  if (event.tag === 'gold-sync-queue' || event.tag === 'gold-erp-queue') {
    event.waitUntil(processBackgroundSync());
  }
});

async function processBackgroundSync() {
  try {
    /* أخبر كل التبويبات المفتوحة أن تُشغِّل مزامنتها */
    const clients = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    });

    if (clients.length > 0) {
      /* التطبيق مفتوح — أرسل رسالة لتشغيل SyncEngine.pushQueue() */
      clients.forEach(client => {
        client.postMessage({
          type: 'TRIGGER_QUEUE_SYNC',
          reason: 'background-sync'
        });
      });
      console.log(`[SW] 📤 Notified ${clients.length} client(s) to sync`);
      return;
    }

    /* التطبيق مغلق — لا يمكن الوصول إلى IndexedDB بسهولة من هنا */
    /* الحل: نُظهر إشعار للمستخدم ليفتح التطبيق */
    console.log('[SW] 💤 No active clients — background sync deferred');

    /* يمكن لاحقاً إضافة قراءة IndexedDB مباشرة هنا عبر idb library */

  } catch (e) {
    console.error('[SW] Background sync failed:', e);
    throw e;
  }
}

/* ─────────────────────────────────────────────────────────────────────
   §9 · NOTIFICATION CLICK
   ─────────────────────────────────────────────────────────────────────
   عند النقر على أي إشعار → افتح التطبيق أو ركّز على التبويب المفتوح
   ───────────────────────────────────────────────────────────────────── */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true
      });

      /* ركّز على تبويب مفتوح إن وُجد */
      for (const client of clients) {
        if (client.url.includes(self.registration.scope)) {
          await client.focus();
          if ('navigate' in client) {
            await client.navigate(targetUrl);
          }
          return;
        }
      }

      /* افتح تبويب جديد */
      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })()
  );
});

/* ─────────────────────────────────────────────────────────────────────
   §10 · PUSH NOTIFICATIONS (اختياري — للمستقبل)
   ───────────────────────────────────────────────────────────────────── */
self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const payload = event.data.json();
    const title = payload.title || 'Gold ERP Pro';
    const options = {
      body: payload.body || '',
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      dir: 'rtl',
      lang: 'ar',
      data: payload.data || {}
    };

    event.waitUntil(
      self.registration.showNotification(title, options)
    );
  } catch (e) {
    console.warn('[SW] Push parse error:', e);
  }
});

/* ─────────────────────────────────────────────────────────────────────
   §11 · LOADED CONFIRMATION
   ───────────────────────────────────────────────────────────────────── */
console.log(
  `%c[SW] ✅ Service Worker ${SW_VERSION} loaded · Build ${BUILD_DATE}`,
  'color:#D4A017;font-weight:900;font-size:12px;' +
  'padding:2px 6px;background:#121212;border-radius:4px;'
);
