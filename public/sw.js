const CACHE_NAME = 'veridraw-cache-v1';

const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/favicon.svg',
  '/favicon.ico',
  '/favicon-96x96.png',
  '/apple-touch-icon.png',
  '/site.webmanifest',
  '/web-app-manifest-192x192.png',
  '/web-app-manifest-512x512.png'
];

// Install Event: cache the critical App Shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching App Shell');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate Event: clean up legacy caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting legacy cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event: intercept network requests and handle offline / caching strategy
self.addEventListener('fetch', (event) => {
  // Only cache GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // EXCLUDE Supabase backend and CDC sockets/API calls from being cached
  if (url.hostname.includes('supabase.co')) {
    return;
  }

  // SPA navigation fallback: serve index.html from cache if offline (Network-First)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          // If successful, update the cached App Shell so it's always up-to-date
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put('/index.html', responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          console.log('[SW] Serving index.html App Shell for offline navigation to:', url.pathname);
          return caches.match('/index.html');
        })
    );
    return;
  }

  // Caching strategy: Stale-While-Revalidate for local assets and external fonts/libraries
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Serve cached resource immediately, and update the cache in background
        fetch(event.request)
          .then((networkResponse) => {
            if (
              networkResponse &&
              networkResponse.status === 200 &&
              (networkResponse.type === 'basic' || networkResponse.type === 'cors')
            ) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, networkResponse);
              });
            }
          })
          .catch(() => {
            // Silence network exceptions for background fetch updates when offline
          });
        return cachedResponse;
      }

      // Serve from network and cache for subsequent requests
      return fetch(event.request).then((networkResponse) => {
        // Cache only successful and basic/CORS responses (avoid opaque storage bloating)
        if (
          !networkResponse ||
          networkResponse.status !== 200 ||
          (networkResponse.type !== 'basic' && networkResponse.type !== 'cors')
        ) {
          return networkResponse;
        }

        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      }).catch((err) => {
        // Fail gracefully if request fails and is not cached
        console.warn('[SW] Fetch failed for:', event.request.url, err);
      });
    })
  );
});
