// FUN.RICH legacy Service Worker kill-switch.
// Kept for one release cycle in case older builds registered /service-worker.js.
// NOTE: Không gọi client.navigate() ở activate — sẽ gây reload thừa trên iOS/PWA.

function isLikelyAppShellCache(name) {
  return /(^|-)precache-v\d+-|(^|-)runtime-|(^|-)workbox-|fun-profile|fun-rich|vite-pwa/i.test(name);
}

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const cacheNames = await caches.keys();
      await Promise.allSettled(
        cacheNames
          .filter(isLikelyAppShellCache)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    } finally {
      await self.registration.unregister();
    }
  })());
});
