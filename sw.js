/* ============================================================
   sw.js — Fillbook service worker (PWA: installable + offline)
   ------------------------------------------------------------
   Strategy:
   • Same-origin HTML/JS/CSS  → network-first (always get the
     latest code when online; fall back to cache offline).
   • Cross-origin CDN libs    → cache-first (versioned URLs,
     immutable — React/Babel/Supabase/html2canvas/fonts).
   • Supabase API (auth/rest/functions/realtime) → never touched,
     always straight to network.
   Bump CACHE_VERSION on any change to force a clean refresh.
   ============================================================ */
const CACHE_VERSION = 'fillbook-v27';
const CORE = [
  './',
  'app.html',
  'styles.css',
  'manifest.json',
  'icon.svg',
  'icon-192.png',
  'icon-512.png',
  'data/seed.js',
  'js/calc.js',
  'js/quote.js',
  'js/i18n-en.js',
  'js/i18n-en-pages.js',
  'js/i18n.js',
  'js/supabase-config.js',
  'js/supabase.js',
  'js/tweaks-panel.jsx',
  'js/store.jsx',
  'js/charts.jsx',
  'js/components.jsx',
  'js/tickerchart.jsx',
  'js/payoff.jsx',
  'js/holdings.jsx',
  'js/positions.jsx',
  'js/dashboard.jsx',
  'js/trades.jsx',
  'js/daily.jsx',
  'js/summary.jsx',
  'js/weekly.jsx',
  'js/watchlist.jsx',
  'js/sharecard.jsx',
  'js/app.jsx',
];
const CDN = [
  'https://unpkg.com/react@18.3.1/umd/react.development.js',
  'https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js',
  'https://unpkg.com/@babel/standalone@7.29.0/babel.min.js',
  'https://html2canvas.hertzen.com/dist/html2canvas.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    // add each individually so one failure can't abort the whole install
    await Promise.all([...CORE, ...CDN].map(u =>
      cache.add(new Request(u, { cache: 'reload' })).catch(() => {})
    ));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

function isSupabase(url) {
  return /supabase\.co/.test(url) || /\/(auth|rest|functions|realtime)\/v\d/.test(url);
}
// Only these immutable, versioned CDN libs are safe to cache-first.
// Anything else cross-origin (price APIs like Twelve Data / Finnhub) must
// always hit the network so quotes are never served stale from cache.
function isCacheableCDN(url) {
  return /(^|\/\/)(unpkg\.com|cdn\.jsdelivr\.net|html2canvas\.hertzen\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//.test(url);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                  // never cache writes
  const url = new URL(req.url);

  // Supabase + any API: always network, untouched (auth, sync, quotes)
  if (isSupabase(req.url)) return;

  const sameOrigin = url.origin === self.location.origin;

  // Cross-origin: cache-first ONLY for the known immutable CDN libs.
  // All other cross-origin requests (e.g. stock-price APIs) go straight to
  // the network so they always return fresh data.
  if (!sameOrigin) {
    if (!isCacheableCDN(req.url)) return;            // price APIs etc → network, untouched
    e.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res && (res.ok || res.type === 'opaque')) {
          const cache = await caches.open(CACHE_VERSION);
          cache.put(req, res.clone());
        }
        return res;
      } catch (err) {
        return cached || Response.error();
      }
    })());
    return;
  }

  // Same-origin app shell (html / js / jsx / css / navigation): network-first
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res && res.ok) {
        const cache = await caches.open(CACHE_VERSION);
        cache.put(req, res.clone());
      }
      return res;
    } catch (err) {
      const cached = await caches.match(req);
      if (cached) return cached;
      // navigation fallback → cached app shell
      if (req.mode === 'navigate') {
        const shell = await caches.match('app.html');
        if (shell) return shell;
      }
      return Response.error();
    }
  })());
});
