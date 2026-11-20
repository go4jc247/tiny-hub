// Half-Sour Pickles service worker
// Everything is cached on the phone and kept. Nothing is re-downloaded
// unless the user taps "Check for updates" on the splash screen.

const CACHE = 'half-sour-pickles';   // fixed name: never deleted or rotated
const ASSETS = [
  './half-sour-pickles.html',
  './half-sour-pickles.webmanifest',
  './half-sour-pickles-sw.js'
];

// Install: only download files that are NOT already cached.
// So even if the browser installs a new copy of this worker, it won't refresh content.
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    for (const url of ASSETS) {
      if (!(await cache.match(url))) {
        try { await cache.add(new Request(url, { cache: 'reload' })); } catch (e) {}
      }
    }
    self.skipWaiting();
  })());
});

// Activate: take control. Never delete caches.
self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

// Fetch: cache first, always. Network is only used for files not cached yet.
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const isPage = req.mode === 'navigate';
    const hit = await cache.match(req, { ignoreSearch: true })
             || (isPage && await cache.match('./half-sour-pickles.html'));
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch (e) {
      return new Response('Offline', { status: 503, statusText: 'Offline' });
    }
  })());
});

// Manual update: only runs when the page asks (Check for updates button).
self.addEventListener('message', event => {
  if (!event.data || event.data.type !== 'check-updates') return;
  const port = event.ports[0];
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    let changed = 0, failed = 0;
    for (const url of ASSETS) {
      try {
        const fresh = await fetch(new Request(url, { cache: 'no-store' }));
        if (!fresh.ok) { failed++; continue; }
        const old = await cache.match(url);
        const [a, b] = await Promise.all([
          fresh.clone().arrayBuffer(),
          old ? old.arrayBuffer() : Promise.resolve(null)
        ]);
        if (!b || !same(a, b)) { await cache.put(url, fresh); changed++; }
      } catch (e) { failed++; }
    }
    port && port.postMessage({ changed, failed, total: ASSETS.length });
  })());
});

function same(a, b) {
  if (a.byteLength !== b.byteLength) return false;
  const x = new Uint8Array(a), y = new Uint8Array(b);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
}
