const CACHE_NAME = 'flood-safety-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/status.html',
  '/styles.css',
  '/script.js',
  '/floodpronemap.png',
  '/icon.png',
  '/manifest.json'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
  clients.claim();
});

self.addEventListener('sync', event => {
  if (event.tag === 'flood-sync') {
    event.waitUntil(
      fetch('https://floodline-capstone-default-rtdb.asia-southeast1.firebasedatabase.app/flood_status.json')
        .then(response => {
          if (!response.ok) throw new Error('Network response not ok: ' + response.status);
          return response.json();
        })
        .then(data => {
          if (data && data.current_level >= 1) {
            const level = data.current_level;
            const descriptions = {
              1: 'Water is rising',
              2: 'EVACUATE WHILE YOU STILL CAN',
              3: 'EXTREME DANGER: SEEK HIGHER GROUND IMMEDIATELY'
            };
            const body = descriptions[level] || 'Flood alert';
            self.registration.showNotification('Flood Alert: Level ' + level, {
              body: body,
              icon: '/icon.png',
              vibrate: [200, 100, 200],
              tag: 'flood-alert-level-' + level,
              requireInteraction: true,
              urgency: 'high'
            });
          }
        })
        .catch(error => {
          console.error('Background sync fetch failed:', error);
        })
    );
  }
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});