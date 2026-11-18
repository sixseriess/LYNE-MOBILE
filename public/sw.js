const CACHE_NAME = "lyne-mobile-shell-v4";
const ART_CACHE_NAME = "lyne-mobile-art-v1";
const ART_CACHE_LIMIT = 120;
const SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(SHELL_FILES.map((path) => new URL(path, self.registration.scope).toString()));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE_NAME && key !== ART_CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  const scope = new URL(self.registration.scope);
  const artworkHosts = new Set([
    "i.scdn.co",
    "image-cdn-ak.spotifycdn.com",
    "mosaic.scdn.co",
    "i1.sndcdn.com",
    "i2.sndcdn.com",
    "i3.sndcdn.com",
    "i4.sndcdn.com",
    "i.ytimg.com",
    "img.youtube.com"
  ]);
  const isArtworkHost = artworkHosts.has(url.hostname) || url.hostname.endsWith(".mzstatic.com");
  if (url.protocol === "https:" && request.destination === "image" && isArtworkHost) {
    event.respondWith((async () => {
      const cache = await caches.open(ART_CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok || response.type === "opaque") {
          try {
            await cache.put(request, response.clone());
            const keys = await cache.keys();
            if (keys.length > ART_CACHE_LIMIT) {
              await Promise.all(keys.slice(0, keys.length - ART_CACHE_LIMIT).map((key) => cache.delete(key)));
            }
          } catch {}
        }
        return response;
      } catch {
        return (await cache.match(request)) || Response.error();
      }
    })());
    return;
  }

  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  if (url.pathname.includes("/v1/")) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(new URL("./index.html", scope), response.clone());
        }
        return response;
      } catch {
        return (await caches.match(new URL("./index.html", scope))) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok && response.type === "basic") {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    } catch {
      return Response.error();
    }
  })());
});
