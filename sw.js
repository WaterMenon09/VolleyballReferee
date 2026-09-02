const VERSION = 'v4.2.7';
const CACHE = `vbref-${VERSION}`;
// Add every new app-shell asset here or it will not be available offline.
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icons/volleyball.png',
  // Precached, reversing this plan's original reasoning. §6.3 argued the homepage's images
  // need no APP_SHELL entry because "installed/offline users skip home" — that stopped being
  // true when the owner changed the rule (31-Aug-2026) to show the homepage whenever no match
  // is in progress. An installed user opening the app offline between matches now DOES land on
  // home, and without this they get a broken image. 23 KB WebP; cheap insurance.
  //
  // icons/social-card.png is deliberately NOT here: it is fetched only by crawlers and link
  // unfurlers, never by the page, so precaching it would add 180 KB to every install for
  // nothing.
  './icons/result-screen.webp',
  './fonts/display-600.woff2',
  './fonts/display-800.woff2',
  './fonts/body-400.woff2',
  './fonts/body-500.woff2',
  './fonts/body-600.woff2',
  './fonts/body-700.woff2'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Skip cross-origin requests (Google Fonts, Analytics) — let the network handle them.
  if (url.origin !== self.location.origin) return;

  // Network-first for HTML navigations so updates ship immediately when online.
  if (req.mode === 'navigate' || req.headers.get('accept')?.includes('text/html')) {
    e.respondWith(
      fetch(req).then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // Cache-first for everything else (CSS, JS, icons).
  e.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(res => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    }))
  );
});
