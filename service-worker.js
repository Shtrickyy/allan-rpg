/* ═══════════════════════════════════════════════════
   Allan RPG — Service Worker  v1.3.0
   
   STRATEGY: network-first for navigation (always fresh HTML),
             cache-first for assets (fonts, icons, manifest).
   
   VERSIONING: CACHE_NAME must be updated on every deploy.
   The activate handler deletes all other caches automatically.
   localStorage and Supabase data are NEVER touched.
═══════════════════════════════════════════════════ */

const APP_VERSION = '1.3.0';
const CACHE_NAME  = 'allan-rpg-' + APP_VERSION;

// Assets that are safe to cache aggressively (change rarely)
const PRECACHE_ASSETS = [
  '/allan-rpg/manifest.json',
  '/allan-rpg/icon-192.png',
  '/allan-rpg/icon-512.png',
  '/allan-rpg/icon-maskable-512.png',
];

// External hosts that must NEVER be intercepted
const PASSTHROUGH_HOSTS = [
  'supabase.co',
  'googleapis.com',
  'jsdelivr.net',
  'fonts.gstatic.com',
];

/* ─────────────────────────────────────────────────
   INSTALL
   Pre-cache static assets. Do NOT call skipWaiting()
   here — we wait for the user to click "Mettre à jour"
   so the active page is never disrupted mid-session.
───────────────────────────────────────────────── */
self.addEventListener('install', event => {
  console.log('[SW] Installing', CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_ASSETS))
      .then(() => {
        console.log('[SW] Pre-cache complete. Waiting for activation signal.');
        // DO NOT call self.skipWaiting() here.
        // The new SW sits in "waiting" state until applyUpdate() triggers SKIP_WAITING.
      })
  );
});

/* ─────────────────────────────────────────────────
   ACTIVATE
   Delete every cache that is not the current version.
   Then claim all clients so the new SW takes effect.
   localStorage and Supabase data are untouched.
───────────────────────────────────────────────── */
self.addEventListener('activate', event => {
  console.log('[SW] Activating', CACHE_NAME);
  event.waitUntil(
    caches.keys()
      .then(keys => {
        const toDelete = keys.filter(k => k !== CACHE_NAME);
        if (toDelete.length) {
          console.log('[SW] Deleting old caches:', toDelete);
        }
        return Promise.all(toDelete.map(k => caches.delete(k)));
      })
      .then(() => {
        console.log('[SW] Old caches cleared. Claiming clients.');
        return self.clients.claim();
      })
  );
});

/* ─────────────────────────────────────────────────
   MESSAGE — SKIP_WAITING
   Sent by applyUpdate() in the page when the user
   clicks "Mettre à jour". Immediately activates
   this SW; controllerchange fires → page reloads.
───────────────────────────────────────────────── */
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] SKIP_WAITING received — activating now.');
    self.skipWaiting();
  }
});

/* ─────────────────────────────────────────────────
   FETCH
   
   Navigation requests (index.html):
     → Network-first, fall back to cache.
     → Ensures users always get the latest HTML on load.
   
   Static assets (icons, manifest):
     → Cache-first, update cache in background.
   
   External (Supabase, CDNs, fonts):
     → Always pass through — never intercept.
───────────────────────────────────────────────── */
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Never intercept external / API requests
  if (PASSTHROUGH_HOSTS.some(h => url.hostname.includes(h))) return;

  // Navigation (HTML pages) — network first so updates are always visible
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Cache the fresh HTML response
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          // Offline: serve the cached index
          return caches.match('/allan-rpg/index.html')
            || caches.match('/allan-rpg/');
        })
    );
    return;
  }

  // Static assets — cache first, background refresh
  event.respondWith(
    caches.match(event.request).then(cached => {
      const networkFetch = fetch(event.request).then(response => {
        if (response && response.status === 200 && response.type !== 'error') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => null);

      // Return cache immediately if available, but refresh in background
      return cached || networkFetch;
    })
  );
});
