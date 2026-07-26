// PayCross Pro - Robust Production Service Worker
const CACHE_PREFIX = 'paycross-v2-cache-';
const CACHE_NAME = `${CACHE_PREFIX}static-v3`;
const DATA_CACHE_NAME = `${CACHE_PREFIX}data-v1`;

const STATIC_ASSETS = [
    './',
    './index.html',
    './styles.css',
    './app.js',
    './manifest.json',
    './icons/icon-192.png',
    './icons/icon-512.png'
];

// Service Worker Installation
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            console.log('[SW] Caching core static assets');
            // Cache local assets gracefully without breaking if 1 asset fails
            for (const asset of STATIC_ASSETS) {
                try {
                    await cache.add(asset);
                } catch (e) {
                    console.warn('[SW] Caching failed for asset:', asset, e);
                }
            }
        })
    );
    self.skipWaiting();
});

// Service Worker Activation & Old Cache Cleanup
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName.startsWith(CACHE_PREFIX) && cacheName !== CACHE_NAME && cacheName !== DATA_CACHE_NAME) {
                        console.log('[SW] Deleting old app cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Service Worker Fetch Event Handler with Request Type Partitioning
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // 1. Only process GET requests over HTTP(S)
    if (request.method !== 'GET' || !url.protocol.startsWith('http')) {
        return;
    }

    // 2. Network Only for external IP API or third party telemetry
    if (url.hostname.includes('ipapi.co')) {
        return;
    }

    // 3. Network First for Navigation / HTML requests
    if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
        event.respondWith(
            fetch(request).then((response) => {
                const copy = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                return response;
            }).catch(() => {
                return caches.match(request).then((res) => res || caches.match('./index.html'));
            })
        );
        return;
    }

    // 4. Stale-While-Revalidate / Network First for production_live_data.json
    if (url.pathname.includes('production_live_data.json')) {
        event.respondWith(
            fetch(request).then((response) => {
                if (response.ok) {
                    const copy = response.clone();
                    caches.open(DATA_CACHE_NAME).then((cache) => cache.put(request, copy));
                }
                return response;
            }).catch(() => caches.match(request))
        );
        return;
    }

    // 5. Cache First for static local assets (JS, CSS, Icons)
    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse;
            }
            return fetch(request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, responseToCache);
                    });
                }
                return networkResponse;
            });
        })
    );
});
