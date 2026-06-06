/* ═══════════════════════════════════════════════
   Allan RPG — Service Worker
   Cache-first strategy for offline play
═══════════════════════════════════════════════ */

const CACHE_NAME = 'allan-rpg-v1.2.0';

// Files to pre-cache on install
const PRECACHE_URLS = [
  '/allan-rpg/',
  '/allan-rpg/index.html',
  '/allan-rpg/manifest.json',
  '/allan-rpg/icon-192.png',
  '/allan-rpg/icon-512.png',
  '/allan-rpg/icon-maskable-512.png',
];


// ── SKIP_WAITING: called by applyUpdate() in the page ──
// Activates this SW immediately without waiting for old tabs to close.
// Does NOT touch localStorage or any cached data.
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
// ── Install: pre-cache shell ──────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_URLS);
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: clean old caches ────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: cache-first, fallback to network ───
self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  // Pass through Supabase API calls — always network
  const url = new URL(event.request.url);
  if (url.hostname.includes('supabase.co') ||
      url.hostname.includes('googleapis.com') ||
      url.hostname.includes('jsdelivr.net')) {
    return; // let browser handle normally
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        // Only cache valid same-origin or CORS-safe responses
        if (!response || response.status !== 200 || response.type === 'error') {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      }).catch(() => {
        // Offline fallback: serve index for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match('/allan-rpg/index.html');
        }
      });
    })
  );
});
