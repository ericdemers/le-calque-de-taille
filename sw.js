// sw.js — service worker for the offline PWA.
//
// Strategy:
//   install   → precache the same-origin app shell + samples
//   fetch     → cache-first; on miss, fetch from network and store the
//               response (covers CDN imports of three.js + exifr as they
//               happen)
//   navigate  → offline fallback to cached index.html so the SPA still
//               opens with no network
//
// Bump CACHE_VERSION whenever any precached file changes so old caches get
// evicted on the next activate.

const CACHE_VERSION = 'v30';
const CACHE_NAME = `lct-${CACHE_VERSION}`;

const APP_SHELL = [
  './',
  './index.html',
  './app.js',
  './styles.css',
  './manifest.webmanifest',
  './src/viewer.js',
  './src/mirror.js',
  './src/gestures.js',
  './src/view.js',
  './src/undo.js',
  './src/exif.js',
  './src/i18n.js',
  './i18n/fr.json',
  './i18n/en.json',
  './samples/manifest.json',
  './samples/front-anterior.jpeg',
  './samples/maxilla_lps.stl',
  './samples/mandible_lps.stl',
  './icons/icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((hit) => {
      if (hit) return hit;
      return fetch(event.request)
        .then((res) => {
          // Cache successful responses for next time. This is what lets the
          // CDN-hosted three.js + exifr modules (loaded via the importmap
          // on first online use) survive subsequent offline launches.
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return res;
        })
        .catch(() => {
          // Offline + cache miss: keep top-level navigations alive by
          // serving the shell so the SPA can still render the welcome
          // screen with cached assets.
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          throw new Error('Offline and resource not in cache: ' + event.request.url);
        });
    })
  );
});
