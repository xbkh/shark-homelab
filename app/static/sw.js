const CACHE = "shark-shell-v2";
const SHELL = ["/", "/static/style.css?v=2", "/static/app.js?v=2", "/static/icons.js?v=2", "/static/fonts/fonts.css", "/static/fonts/saira.woff2", "/static/fonts/hanken-grotesk.woff2", "/static/icon.svg"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (u.pathname.startsWith("/api/") || e.request.method !== "GET") return;   // jamais de cache pour les donnees
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
});
