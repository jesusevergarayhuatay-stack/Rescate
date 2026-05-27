const CACHE_NAME = 'rescate-animal-v2';
const ASSETS = [
  './',
  './index.html',
  './index.css',
  './app.js',
  './sheetsAPI.js',
  './manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      try {
        return cache.addAll(ASSETS);
      } catch (err) {
        console.warn("Error caching resources on install: ", err);
      }
    })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', (e) => {
  // Solo interceptar peticiones HTTP o HTTPS (ignorar esquemas chrome-extension, data, etc.)
  if (!e.request.url.startsWith('http')) return;

  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(e.request).then((networkResponse) => {
        // Guardar en caché si es una petición GET exitosa de recursos estáticos propios
        if (e.request.method === 'GET' && networkResponse.status === 200 && e.request.url.includes(location.origin)) {
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, networkResponse.clone());
            return networkResponse;
          });
        }
        return networkResponse;
      }).catch(() => {
        // Fallback básico sin conexión para imágenes u otros recursos
        return new Response("Sin conexión a Internet", { status: 503, statusText: "Offline" });
      });
    })
  );
});
