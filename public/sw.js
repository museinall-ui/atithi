// Atithi service worker — minimal cache-and-update.
//
// Goal: make the app installable as a PWA (icon on home screen,
// standalone display, fast repeat loads). Not aiming for a true
// offline experience — most operations need the cloud, and demo mode
// trusts localStorage anyway. We cache the app shell + hashed assets
// on first request, then update when fresh ones come in.
//
// Versioning strategy: bump CACHE_NAME whenever you want old clients
// to drop their cache. Vite already content-hashes JS/CSS asset URLs,
// so the cache key effectively self-versions for those. The HTML
// shell is small and we always go network-first for it so a deploy
// is picked up on the next visit without waiting for SW activation.

const CACHE_NAME = 'atithi-v1';

self.addEventListener('install', (event) => {
  // Activate immediately — no waiting for old tabs to close. We
  // don't pre-cache anything; cache-on-fetch builds the cache
  // organically as the user navigates.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Drop any caches that don't match the current version. Keeps
  // storage bounded across deploys.
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Only same-origin GETs go through the cache. Cross-origin
  // (Supabase, Google Fonts, etc) passes through untouched.
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Network-first for HTML (the app shell): always try fresh first,
  // fall back to cache if offline. Means a new deploy lands on the
  // very next visit.
  if (req.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((m) => m || caches.match('./')))
    );
    return;
  }

  // Cache-first for hashed assets (JS / CSS / SVG / fonts the bundler
  // emits). They're versioned in their filename so it's safe to keep
  // them forever within this CACHE_NAME.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        // Only cache successful basic responses
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        }
        return res;
      });
    })
  );
});
