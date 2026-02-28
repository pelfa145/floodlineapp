const CACHE_NAME = 'flood-safety-v2';
const urlsToCache = [
  '/',
  '/index.html',
  '/status.html',
  '/offline.html',
  '/styles.css',
  '/script.js',
  '/floodpronemap.png',
  '/icon.png',
  '/manifest.json',
  '/level1alert.mp3',
  '/level2alert.mp3',
  '/level3alert.mp3'
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
  const url = event.request.url;

  // Skip service worker for external API calls (Firebase, OpenWeather, etc.)
  if (url.includes('firebase') || 
      url.includes('firebasedatabase') || 
      url.includes('openweathermap') ||
      url.includes('googleapis') ||
      url.includes('gstatic.com/firebase')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // For navigation requests, try network first, then cache, then offline page
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          return caches.match(event.request)
            .then(response => response || caches.match('/offline.html'));
        })
    );
    return;
  }

  // For other requests, use cache first with network fallback
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request).catch(() => {
          // For non-navigation requests that fail, return a generic placeholder or nothing
          if (event.request.destination === 'image') {
            return caches.match('/icon.png'); // fallback image
          }
          return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
        });
      })
  );
});