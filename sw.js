const CACHE_NAME = 'bio-tracker-v1';
const ASSETS = [
  './index.html',
  './manifest.json',
  './sleep_nutrition_log.md'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
