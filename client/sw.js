// WON HOUSE — menu installable : garde la page en cache pour qu'elle s'ouvre vite (et même sans réseau).
// Toujours la version la plus récente quand internet marche ; le cache ne sert qu'en secours.
const CACHE = "wh-menu-v1";
const BASE = ["./", "./client.js", "./config.js", "./manifest.webmanifest", "./icon-192.png"];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(BASE)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const r = e.request;
  if (r.method !== "GET" || new URL(r.url).origin !== self.location.origin) return; // Firebase : jamais en cache ici
  e.respondWith(
    fetch(r).then(res => {
      if (res.ok) { const copie = res.clone(); caches.open(CACHE).then(c => c.put(r.mode === "navigate" ? "./" : r, copie)); }
      return res;
    }).catch(() => caches.match(r.mode === "navigate" ? "./" : r).then(m => m || caches.match("./")))
  );
});
