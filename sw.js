const CACHE_NAME = 'vasilina-portfolio-v31';

// Core files to cache instantly when the site first loads
const CORE_ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/main.js',
    '/nav.js',
    '/footer.js'
];

// 1. Install Event: Save core files
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(CORE_ASSETS))
            .then(() => self.skipWaiting())
    );
});

// 2. Activate Event: Clean up old versions if you update the CACHE_NAME
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) return caches.delete(cacheName);
                })
            );
        }).then(() => self.clients.claim())
    );
});

// 3. Fetch Event: Stale-While-Revalidate Strategy
self.addEventListener('fetch', (event) => {
    // Only cache simple HTTP GET requests (ignore extensions, POSTs, etc)
    if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) return;

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            const fetchPromise = fetch(event.request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
                }
                return networkResponse;
            }).catch(() => {}); // Fails silently if offline, relies on cache

            return cachedResponse || fetchPromise;
        })
    );
});