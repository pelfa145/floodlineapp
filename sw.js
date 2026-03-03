const CACHE_NAME = 'flood-safety-v3';
const urlsToCache = [
  './',
  './index.html',
  './status.html',
  './styles.css',
  './script.js',
  './floodpronemap.png',
  './icon.png',
  './manifest.json',
  './level1alert.mp3',
  './level2alert.mp3',
  './level3alert.mp3'
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
              icon: './icon.png',
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

  // Bypass external APIs - let them fail gracefully when offline
  if (url.includes('firebase') || 
      url.includes('firebasedatabase') || 
      url.includes('openweathermap') ||
      url.includes('googleapis') ||
      url.includes('gstatic.com/firebase')) {
    event.respondWith(fetch(event.request).catch(() => new Response(JSON.stringify({error: 'offline'}), {
      headers: { 'Content-Type': 'application/json' }
    })));
    return;
  }

  // For navigation requests, try network first (to get live data), fallback to cache
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Cache the successful navigation for offline use
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // For JavaScript modules, use network-first with cache fallback
  if (event.request.destination === 'script' || event.request.url.endsWith('.js')) {
    event.respondWith(
      fetch(event.request, { cache: 'no-cache' })
        .then(response => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // For assets: cache-first (fastest)
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});