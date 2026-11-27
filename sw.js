// Service worker : l'app s'ouvre même sans réseau (les IA, elles, ont besoin d'Internet).
// Pour publier une mise à jour, change le numéro de VERSION.
const VERSION = 'sudo-v19';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/sudo.css',
  'js/app.js', 'js/ai.js', 'js/chat.js', 'js/compare.js', 'js/diagram.js', 'js/domains.js', 'js/md.js',
  'js/prompts.js', 'js/quota.js', 'js/store.js', 'js/ui.js',
  'js/views/home.js', 'js/views/ateliers.js', 'js/views/atelier.js', 'js/views/verif.js',
  'js/views/photo.js', 'js/views/assistant.js', 'js/views/settings.js',
  'js/progress.js', 'js/srs.js', 'js/plan.js', 'js/notify.js', 'js/illus.js', 'js/memo-data.js',
  'js/views/quiz.js', 'js/views/flashcards.js', 'js/views/planning.js', 'js/views/terminal.js',
  'js/views/subnet.js', 'js/views/carnet.js', 'js/views/memo.js', 'js/views/dashboard.js',
  'js/cloud.js', 'js/sync.js', 'js/group.js', 'js/views/compte.js', 'js/views/groupe.js', 'supabase.sql',
  'js/repair-data.js', 'js/views/reparer.js', 'js/quiz-bank.js', 'js/palette.js',
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

// Clic sur un rappel : ouvrir sudo sur le bon écran.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = './' + (e.notification.data?.url || '#/');
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const c = list[0];
    if (c) { c.focus(); return c.navigate ? c.navigate(url) : null; }
    return self.clients.openWindow(url);
  }));
});

// Rappels app fermée (Chrome Android, app installée) : lit le plan du jour préparé par l'app.
function readKV(key) {
  return new Promise(res => {
    const r = indexedDB.open('sudo');
    r.onerror = () => res(null);
    r.onsuccess = () => {
      try {
        const g = r.result.transaction('kv').objectStore('kv').get(key);
        g.onsuccess = () => res(g.result ? g.result.value : null);
        g.onerror = () => res(null);
      } catch { res(null); }
    };
  });
}
function writeKV(key, value) {
  return new Promise(res => {
    const r = indexedDB.open('sudo');
    r.onerror = () => res();
    r.onsuccess = () => { try { const t = r.result.transaction('kv', 'readwrite'); t.objectStore('kv').put({ id: key, value }); t.oncomplete = () => res(); t.onerror = () => res(); } catch { res(); } };
  });
}
self.addEventListener('periodicsync', e => {
  if (e.tag !== 'sudo-rappels') return;
  e.waitUntil((async () => {
    const plan = await readKV('notif-plan');
    const now = new Date();
    const day = now.toLocaleDateString('sv-SE');
    if (!plan || !plan.on || plan.day !== day) return;
    const [h, m] = plan.time.split(':').map(Number);
    if (now.getHours() * 60 + now.getMinutes() < h * 60 + m) return;
    const sent = (await readKV('reminders-sent')) || {};
    const done = new Set(sent[day] || []);
    for (const n of plan.items) {
      if (done.has(n.type)) continue;
      await self.registration.showNotification(n.title, { body: n.body, icon: 'icons/icon-192.png', tag: 'sudo-' + n.type, data: { url: n.url } });
      done.add(n.type);
    }
    await writeKV('reminders-sent', { [day]: [...done] });
  })());
});
