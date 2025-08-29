const CACHE_NAME = 'AVN-Cache-V6-RESULTS-FIX'; // bump when you replace data.csv or code
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './manifest.webmanifest',
  './logo.png',
  './data.csv'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => k === CACHE_NAME ? null : caches.delete(k)))));
});
self.addEventListener('fetch', e => {
  e.respondWith(caches.match(e.request).then(res => res || fetch(e.request).catch(() => caches.match('./'))));
});