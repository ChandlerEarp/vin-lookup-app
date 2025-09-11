const CACHE_NAME = 'VIN-APP-V33-RESULT-FIX'; // bump when you change code or data
// Force update: V33 - result style and navigation fix
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './manifest.webmanifest',
  './logo.png',
  './data.csv',
  './data2.csv' // cache data2.csv for Unit/Plate lookup
];

// Install immediately and take control
self.addEventListener('install', e => {
  console.log('[SW] Installing...');
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

// Clean up old caches and claim all clients immediately
self.addEventListener('activate', e => {
  console.log('[SW] Activating...');
  e.waitUntil(
    caches.keys().then(keys => 
      Promise.all(keys.map(k => k === CACHE_NAME ? null : caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Network-first strategy for core files, cache-first for static assets
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  
  // For core app files (JS, HTML), try network first, fall back to cache
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.html') || url.pathname === '/') {
    e.respondWith(
      fetch(e.request)
        .then(response => {
          // If we got a fresh copy, update the cache
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, responseClone));
          }
          return response;
        })
        .catch(() => caches.match(e.request))
    );
  } 
  // For other files, use cache-first
  else {
    e.respondWith(
      caches.match(e.request).then(res => 
        res || fetch(e.request).catch(() => caches.match('./'))
      )
    );
  }
});