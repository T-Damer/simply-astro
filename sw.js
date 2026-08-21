const CACHE_NAME = 'astro-julia-shell-v6';
const precache = [
  './',
  './index.html',
  './styles.css',
  './script.js',
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
        .filter((key) => key.startsWith('astro-julia-') && key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

async function cacheResponse(request, response) {
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
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

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    return await cacheResponse(request, await fetch(request));
  } catch {
    return Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  const updateBeforeRender = request.mode === 'navigate' || ['script', 'style'].includes(request.destination);
  event.respondWith(updateBeforeRender ? networkFirst(request) : cacheFirst(request));
});
