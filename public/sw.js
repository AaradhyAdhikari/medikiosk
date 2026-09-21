/* MediKiosk service worker.
 *
 * A kiosk in an OPD corridor loses Wi-Fi. This keeps the app SHELL — the
 * pages, scripts, styles and language packs — available from cache so the
 * screen never goes blank, while everything under /api/ always goes to the
 * network: a cached queue or a cached OTP is worse than an honest error.
 *
 * Network first for the shell too, so a deploy reaches an open kiosk on its
 * next load; the cache is the fallback, not the source of truth. */
const VERSION = "mk-shell-v2";
const SHELL = [
  "/", "/index.html", "/kiosk", "/kiosk.html", "/about", "/about.html",
  "/styles.css", "/kiosk.js", "/i18n.js", "/icons.js", "/qr.js", "/questions.js", "/bodymap.js",
  "/lang/mr.js", "/lang/gu.js", "/lang/pa.js", "/lang/ta.js", "/lang/te.js",
  "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/icon.svg",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(VERSION)
      // One missing file must not fail the whole install.
      .then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;         // fonts, model APIs: not ours to cache
  if (url.pathname.startsWith("/api/")) return;             // live data, always
  if (url.pathname.startsWith("/c/")) return;               // check-in redirects

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => null);
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match(url.pathname.replace(/\/$/, "") || "/")))
  );
});
