// Service worker : l'app s'ouvre même sans réseau (les IA, elles, ont besoin d'Internet).
// Pour publier une mise à jour, change le numéro de VERSION.
const VERSION = 'sudo-v2';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/sudo.css',
  'js/app.js', 'js/ai.js', 'js/chat.js', 'js/compare.js', 'js/diagram.js', 'js/domains.js', 'js/md.js',
  'js/prompts.js', 'js/quota.js', 'js/store.js', 'js/ui.js',
  'js/views/home.js', 'js/views/ateliers.js', 'js/views/atelier.js', 'js/views/verif.js',
  'js/views/photo.js', 'js/views/assistant.js', 'js/views/settings.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// Réseau d'abord (toujours la dernière version), cache si hors ligne.
// La bibliothèque de schémas (lourde) est mise en cache au premier usage.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});
