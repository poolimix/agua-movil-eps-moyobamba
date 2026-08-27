const CACHE_NAME = 'aguamovil-cache-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
];

// 1. Install Event: Pre-cache core app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching offline shell');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// 2. Activate Event: Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            console.log('[Service Worker] Removing old cache:', name);
            return caches.delete(name);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 3. Fetch Event: Network-first with Cache fallback for navigation and static caching
self.addEventListener('fetch', (event) => {
  // Ignore non-GET requests or chrome-extension/external analytics
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // For API calls or Backend sync, use network only or stale-while-revalidate
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // If valid network response, clone to cache
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(async () => {
        // Fallback to cache if network fails (offline)
        const cached = await caches.match(event.request);
        if (cached) return cached;

        // If navigation request fails, return index.html (SPA offline fallback)
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      })
  );
});
