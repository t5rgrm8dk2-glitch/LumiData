// Incrementa VERSION cada vez que cambies index.html para forzar la actualización en los celulares.
const VERSION = 'v1';
const APP_CACHE = `lumidata-app-${VERSION}`;
const LIB_CACHE = 'lumidata-libs-v1';
const TILE_CACHE = 'lumidata-tiles-v1';
const MAX_TILES = 1500;

const APP_SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './icon-maskable-512.png'];

// Librerías externas que usa la app (se precargan al instalar para que funcione sin señal)
const LIBS = [
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/piexifjs/1.0.6/piexif.js',
  'https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  'https://unpkg.com/leaflet@1.9.4/dist/images/layers.png',
  'https://unpkg.com/leaflet@1.9.4/dist/images/layers-2x.png'
];

const TILE_HOSTS = ['server.arcgisonline.com', 'tile.openstreetmap.org', 'tile.opentopomap.org'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const app = await caches.open(APP_CACHE);
    await app.addAll(APP_SHELL);
    const libs = await caches.open(LIB_CACHE);
    // Un fallo individual no debe impedir la instalación
    await Promise.all(LIBS.map(async url => {
      try {
        const res = await fetch(url, { mode: 'cors' });
        if (res.ok) await libs.put(url, res);
      } catch (e) { /* se reintentará en tiempo de ejecución */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = [APP_CACHE, LIB_CACHE, TILE_CACHE];
    const names = await caches.keys();
    await Promise.all(names.filter(n => !keep.includes(n)).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length > max) await Promise.all(keys.slice(0, keys.length - max).map(k => cache.delete(k)));
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok || res.type === 'opaque') cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return; // los envíos POST al webhook de Power Automate pasan directo
  const url = new URL(req.url);

  // Teselas del mapa: las ya vistas quedan disponibles sin conexión
  if (TILE_HOSTS.includes(url.hostname)) {
    event.respondWith((async () => {
      try {
        const res = await cacheFirst(req, TILE_CACHE);
        trimCache(TILE_CACHE, MAX_TILES);
        return res;
      } catch (e) {
        return new Response('', { status: 504 });
      }
    })());
    return;
  }

  // Librerías externas
  if (url.hostname === 'cdnjs.cloudflare.com' || url.hostname === 'unpkg.com') {
    event.respondWith(cacheFirst(req, LIB_CACHE).catch(() => new Response('', { status: 504 })));
    return;
  }

  // Archivos de la app: red primero (para recibir actualizaciones) y caché si no hay señal
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(APP_CACHE);
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch (e) {
        const hit = await cache.match(req, { ignoreSearch: true });
        if (hit) return hit;
        if (req.mode === 'navigate') return cache.match('./index.html');
        return new Response('', { status: 504 });
      }
    })());
  }
});
