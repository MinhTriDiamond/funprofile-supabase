// FUN.RICH app-shell Service Worker kill-switch.
// Purpose: evict old Workbox/Vite PWA workers that may keep returning stale HTML/chunks.
// This file intentionally does not cache anything and unregisters itself after activation.
// NOTE: Không gọi client.navigate() ở activate — sẽ gây reload thừa trên iOS/PWA.
// Boot guard ở index.html chịu trách nhiệm điều phối reload nếu cần.

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
