const CACHE_NAME = 'hidrate-plus-cache-v1';
const BASE_PATH = self.location.pathname.replace(/service-worker\.js$/, '');
const OFFLINE_URLS = [
  `${BASE_PATH}`,
  `${BASE_PATH}index.html`,
  `${BASE_PATH}manifest.json`,
  `${BASE_PATH}assets/css/style.css`,
  `${BASE_PATH}assets/js/app.js`,
  `${BASE_PATH}assets/js/utils.js`,
  `${BASE_PATH}assets/js/storage.js`,
  `${BASE_PATH}assets/js/calculations.js`,
  `${BASE_PATH}assets/js/notifications.js`,
  `${BASE_PATH}assets/js/chart.js`,
  `${BASE_PATH}assets/img/icons/icon-192.svg`,
  `${BASE_PATH}assets/img/icons/icon-512.svg`
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(OFFLINE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') {
    return;
  }
  event.respondWith(
    caches.match(request).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(request)
        .then(networkResponse => {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return networkResponse;
        })
        .catch(() => caches.match(`${BASE_PATH}index.html`));
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      if (clientList.length > 0) {
        return clientList[0].focus();
      }
      return self.clients.openWindow('/');
    })
  );
});
