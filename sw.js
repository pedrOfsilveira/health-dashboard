const CACHE_NAME = 'bio-tracker-v5';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/public/icon-192.png',
  '/public/icon-512.png',
  '/public/icon-maskable-512.png',
  '/public/apple-touch-icon.png'
];

// CDN assets to precache for offline
const CDN_ASSETS = [
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/daisyui@4.7.2/dist/full.min.css',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.2.0',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Cache static assets first (critical)
      return cache.addAll(STATIC_ASSETS).then(() => {
        // Try to cache CDN assets but don't fail install if they error
        return Promise.allSettled(
          CDN_ASSETS.map(url => cache.add(url).catch(() => console.log('CDN cache skip:', url)))
        );
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // CRITICAL: Never cache Supabase auth/API calls - always go to network
  if (url.hostname.includes('supabase') || 
      url.pathname.includes('/auth/') ||
      url.pathname.startsWith('/rest/') || 
      url.pathname.startsWith('/functions/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Navigation requests: always network-first to avoid stale HTML/JS
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // JS/CSS bundles with hashes: network-first to pick up new deploys
  if (url.pathname.match(/\.(js|css)$/)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for other static assets (images, fonts, icons)
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    }).catch(() => {
      // no fallback for non-navigate requests
    })
  );
});

self.addEventListener('push', (event) => {
  const data = event.data.json();
  console.log('Push received:', data);

  const title = data.title || 'Health Dashboard';
  const options = {
    body: data.body,
    icon: data.icon || '/public/icon-192.png',
    badge: data.badge || '/public/icon-192.png',
    data: data.data || {}, // Custom data to be used on notificationclick
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close(); // Close the notification

  const clickData = event.notification.data;
  console.log('Notification clicked:', clickData);

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If there's an existing client, focus it
      for (const client of clientList) {
        if (client.url === '/' && 'focus' in client) { // Assuming '/' is the main app URL
          return client.focus();
        }
      }
      // Otherwise, open a new window
      if (clients.openWindow) {
        return clients.openWindow(clickData.url || '/'); // Open the URL specified in data, or '/'
      }
      return null;
    })
  );
});

