const CACHE_NAME = 'hints-trainer-v1-preview-1';
const CACHE_PREFIX = 'hints-trainer-v1-';
const APP_SHELL = [
  './index.html',
  './manifest.webmanifest',
  './src/rules-v1.js', './src/search-v1.js', './src/zones-v1.js',
  './src/hints-ui.js', './src/hints-ui.css'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME && key.startsWith(CACHE_PREFIX))
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response && response.status === 200) {
      cache.put(request, response.clone()).catch(() => {});
      if (request.mode === 'navigate') {
        cache.put('./index.html', response.clone()).catch(() => {});
      }
    }
    return response;
  } catch (err) {
    return (await cache.match(request)) ||
           (request.mode === 'navigate' ? await cache.match('./index.html') : null) ||
           Response.error();
  }
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const isInstallerAsset = /\/install\//i.test(url.pathname) &&
    (/\.(?:html|css|js|webmanifest)$/i.test(url.pathname) || event.request.mode === 'navigate');

  // Always prefer the network for HTML and installer UI assets so a normal
  // mobile reload picks up the newest installer without a hard-refresh keyboard shortcut.
  if (event.request.mode === 'navigate' || /\/index\.html$/i.test(url.pathname) || isInstallerAsset) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Other assets/models can load from cache immediately and refresh in the background.
  event.respondWith(
    caches.open(CACHE_NAME).then(async cache => {
      const cached = await cache.match(event.request);
      const refresh = fetch(event.request).then(response => {
        if (response && response.status === 200) {
          cache.put(event.request, response.clone()).catch(() => {});
        }
        return response;
      }).catch(() => null);
      return cached || (await refresh) || Response.error();
    })
  );
});
