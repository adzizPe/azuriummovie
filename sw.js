const SHELL_CACHE = "azuriummovie-shell-v12";
const APP_SHELL = [
  "/",
  "/index.html",
  "/watch.html",
  "/privacy.html",
  "/styles.css?v=12",
  "/access.js?v=8",
  "/storage.js?v=4",
  "/app.js?v=10",
  "/watch.js?v=8",
  "/pwa.js?v=3",
  "/manifest.webmanifest",
  "/icons/launchericon-48x48.png",
  "/icons/launchericon-96x96.png",
  "/icons/launchericon-192x192.png",
  "/icons/launchericon-512x512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(SHELL_CACHE).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== SHELL_CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Katalog, stream, dan subtitle harus selalu berasal dari jaringan terbaru.
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match(url.pathname.endsWith("watch.html") ? "/watch.html" : "/index.html")),
    );
    return;
  }

  if (["script", "style", "image", "font"].includes(request.destination) || url.pathname.endsWith(".webmanifest")) {
    event.respondWith(
      caches.match(request).then(cached => {
        const network = fetch(request).then(response => {
          if (response.ok) caches.open(SHELL_CACHE).then(cache => cache.put(request, response.clone()));
          return response;
        });
        return cached || network;
      }),
    );
  }
});
