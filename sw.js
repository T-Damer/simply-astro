const CACHE_NAME = 'astro-julia-shell-v9';
const CARD_CACHE_NAME = 'astro-julia-cards-v1';
const precache = [
  './',
  './index.html',
  './styles.css',
  './script.js',
  './cards/assets/img/manifest.js',
  './assets/favicon-light.png',
  './assets/favicon-dark.png',
  './assets/favicon.png',
  './assets/apple-touch-icon.png',
  './assets/logo-circle-light.png',
  './assets/logo-circle-dark.png',
  './assets/og-image.png',
  './assets/images/IMG_7419.webp',
  './assets/images/IMGL6008.webp'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(precache)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith('astro-julia-shell-') && key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

async function cacheResponse(request, response, cacheName = CACHE_NAME) {
  if (response.ok) {
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request) {
  try {
    return await cacheResponse(request, await fetch(request, { cache: 'no-store' }));
  } catch {
    return caches.match(request).then((cached) => cached || caches.match('./index.html'));
  }
}

async function cacheFirst(request, cacheName = CACHE_NAME) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    return await cacheResponse(request, await fetch(request), cacheName);
  } catch {
    return Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  const url = new URL(request.url);
  const updateBeforeRender = request.mode === 'navigate' || ['script', 'style'].includes(request.destination);
  const cacheName = url.pathname.includes('/cards/assets/img/') ? CARD_CACHE_NAME : CACHE_NAME;
  event.respondWith(updateBeforeRender ? networkFirst(request) : cacheFirst(request, cacheName));
});
