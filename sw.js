// Tiny Hub service worker: keeps the hub (and other pages in this folder) available offline.
// The folder is shared with other apps that have service workers of their own, so this one only
// ever touches its own cache and never deletes anything it did not create.
const CACHE = 'tiny-hub-v1';
const PAGE = new URL('./', self.location).href;              // .../tiny-hub/
const INDEX = new URL('./index.html', self.location).href;   // .../tiny-hub/index.html

self.addEventListener('install', e => {
  e.waitUntil(
    fetch(PAGE, { cache: 'reload' })
      .then(res => { if (!res.ok) throw new Error('hub page not available'); return caches.open(CACHE).then(c => c.put(PAGE, res)); })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      // only older caches of the hub itself; other apps on this site keep theirs (downloads, AI models, ...)
      .then(keys => Promise.all(keys.filter(k => k.startsWith('tiny-hub-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const keep = (key, res) => {
  // only complete, successful, same-site answers are worth keeping
  if (res && res.status === 200 && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(key, copy)).catch(() => {}); }
  return res;
};

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;           // other sites: not our business
  const plain = url.origin + url.pathname;

  if (plain === PAGE || plain === INDEX) {
    // The hub page: always ask the server first (so an updated file shows up at once), saved copy when offline.
    e.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then(res => keep(PAGE, res))
        .catch(() => caches.open(CACHE).then(c => c.match(PAGE)).then(r => r || caches.match(INDEX)).then(r => r || Response.error()))
    );
    return;
  }

  if (req.headers.has('range')) return;                      // partial downloads (audio, video): leave them to the browser
  // Anything else in this folder: network first, any saved copy when offline.
  e.respondWith(
    fetch(req)
      .then(res => keep(req, res))
      .catch(() => caches.match(req).then(r => r || Response.error()))
  );
});
