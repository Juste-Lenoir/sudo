import { $, $$, copy, paintIcons, toast } from './ui.js';
import { setupQuota } from './quota.js';
import { watchDiagrams } from './diagram.js';
import { homeView } from './views/home.js';
import { ateliersList, atelierNew } from './views/ateliers.js';
import { atelierView } from './views/atelier.js';
import { verifView } from './views/verif.js';
import { photoView } from './views/photo.js';
import { assistantView } from './views/assistant.js';
import { settingsView } from './views/settings.js';
import { quizView } from './views/quiz.js';
import { flashcardsView, reviewView } from './views/flashcards.js';
import { planningView } from './views/planning.js';
import { terminalView } from './views/terminal.js';
import { subnetView } from './views/subnet.js';
import { carnetView, ficheView } from './views/carnet.js';
import { memoView } from './views/memo.js';
import { dashboardView, hubView } from './views/dashboard.js';
import { setup as setupReminders } from './notify.js';
import { compteView } from './views/compte.js';
import { rejoindreView } from './views/groupe.js';
import { startSync, handleAuthHash, status as syncStatus } from './sync.js';
import { receivedPhoto, processPendingPhotos } from './views/photo.js';
import { reparerList, reparerNew, reparationView } from './views/reparer.js';
import { openPalette } from './palette.js';
import { dbAll, getKV } from './store.js';
import { dueToday } from './srs.js';
import { today } from './progress.js';

// Grand écran : la liste reste à gauche, l'élément ouvert s'affiche à droite (comme Mail ou Notes).
const split = (listFn, detailFn, base) => async (v, id) => {
  if (!matchMedia('(min-width: 1100px)').matches) return detailFn(v, id);
  v.classList.add('split');
  v.innerHTML = '<div class="split-list"></div><div class="split-detail"></div>';
  const [l, d] = [v.firstElementChild, v.lastElementChild];
  await listFn(l);
  l.querySelectorAll(`a[href="${base}${id}"]`).forEach(a => a.classList.add('on'));
  await detailFn(d, id);
};

const ROUTES = [
  [/^$/, homeView, 'accueil'],
  [/^ateliers$/, ateliersList, 'ateliers'],
  [/^atelier\/nouveau$/, atelierNew, 'ateliers'],
  [/^atelier\/([\w-]+)$/, atelierView, 'ateliers'],
  [/^verif\/([\w-]+)$/, verifView, 'ateliers'],
  [/^photo$/, photoView, 'photo'],
  [/^assistant$/, assistantView, 'assistant'],
  [/^reglages$/, settingsView, 'reglages'],
  [/^reviser$/, v => hubView(v, 'reviser'), 'reviser'],
  [/^outils$/, v => hubView(v, 'outils'), 'outils'],
  [/^quiz$/, quizView, 'reviser'],
  [/^flashcards$/, flashcardsView, 'reviser'],
  [/^flashcards\/revue$/, reviewView, 'reviser'],
  [/^planning$/, planningView, 'reviser'],
  [/^sous-reseaux$/, subnetView, 'reviser'],
  [/^progression$/, dashboardView, 'reviser'],
  [/^terminal$/, terminalView, 'outils'],
  [/^carnet$/, carnetView, 'outils'],
  [/^fiche\/([\w-]+)$/, split(carnetView, ficheView, '#/fiche/'), 'outils'],
  [/^aide-memoire$/, memoView, 'outils'],
  [/^compte$/, compteView, 'reglages'],
  [/^rejoindre$/, rejoindreView, 'ateliers'],
  [/^reparer$/, reparerList, 'outils'],
  [/^reparer\/nouveau$/, reparerNew, 'outils'],
  [/^reparation\/([\w-]+)$/, split(reparerList, reparationView, '#/reparation/'), 'outils'],
];

let renderId = 0;
async function render() {
  const id = ++renderId;
  if (/(access_token|error_description)=/.test(location.hash)) await handleAuthHash();
  const path = location.hash.replace(/^#\/?/, '').split('?')[0];
  for (const [re, fn, nav] of ROUTES) {
    const m = path.match(re);
    if (!m) continue;
    $$('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav.split(' ').includes(nav)));
    const first = path.split('/')[0];
    $$('[data-path]').forEach(a => a.classList.toggle('active', a.dataset.path === '' ? path === '' : a.dataset.path.split(' ').includes(first)));
    // Nouvel élément à chaque page : aucun écouteur ne traîne d'une page à l'autre.
    const old = $('#view');
    const v = document.createElement('main');
    v.id = 'view';
    v.className = 'view view-' + nav;
    old.replaceWith(v);
    $('#sheet-root').innerHTML = '';
    document.querySelector('.overlay')?.remove();
    document.body.style.overflow = '';
    window.scrollTo(0, 0);
    try { await fn(v, m[1]); }
    catch (e) {
      console.error(e);
      if (id === renderId) v.innerHTML = `<div class="card">Erreur : ${e.message}</div>`;
    }
    return;
  }
  location.hash = '#/';
}

// Bouton « Copier » des blocs de code
document.addEventListener('click', e => {
  const b = e.target.closest('.copy-code');
  if (b) copy(b.closest('.code').querySelector('code').textContent);
});

// Recherche partout (⌘K), même pendant une saisie.
document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); }
});
$('#search-btn').addEventListener('click', openPalette);

// Barre latérale : masquable (mémorisé sur l'appareil).
const SIDE = 'sudo-side-hidden';
const applySide = hidden => {
  document.body.classList.toggle('side-hidden', hidden);
  $('#side-toggle').setAttribute('aria-label', hidden ? 'Afficher la barre latérale' : 'Masquer la barre latérale');
};
function toggleSide() {
  const hidden = !document.body.classList.contains('side-hidden');
  try { localStorage.setItem(SIDE, hidden ? '1' : ''); } catch { /* sans stockage */ }
  applySide(hidden);
}
try { applySide(localStorage.getItem(SIDE) === '1'); } catch { applySide(false); }
$('#side-toggle').addEventListener('click', toggleSide);

// Compteurs de la barre latérale.
async function paintBadges() {
  const [cards, ats, reps, daily] = await Promise.all([dbAll('cards'), dbAll('ateliers'), dbAll('repairs'), getKV('daily', {})]);
  const n = {
    cards: dueToday(cards, daily[today()]?.newCards || 0).all.length,
    ateliers: ats.filter(a => (a.steps || []).some(x => !x.done)).length,
    repairs: reps.filter(r => !['repare', 'pas_repare'].includes(r.resultat)).length,
  };
  $$('[data-badge]').forEach(b => { const v = n[b.dataset.badge]; b.textContent = v ? (v > 99 ? '99+' : v) : ''; });
}
window.addEventListener('hashchange', () => setTimeout(paintBadges, 400));
window.addEventListener('sudo:changed', paintBadges);
paintBadges();

// Raccourcis clavier (ordinateur)
document.addEventListener('keydown', e => {
  if (e.target.closest('input, textarea, select')) return;
  if (/^#\/(flashcards\/revue|quiz)/.test(location.hash) && !e.metaKey && !e.ctrlKey) return; // touches utilisées par ces écrans
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key === '\\') { e.preventDefault(); toggleSide(); }
  if (!mod && !e.altKey && e.key === 'n') location.hash = '#/atelier/nouveau';
  if (!mod && !e.altKey && e.key === 'p') location.hash = '#/photo';
  if (!mod && !e.altKey && e.key === 'f') location.hash = '#/flashcards/revue';
  if (!mod && !e.altKey && e.key === 'm') location.hash = '#/aide-memoire';
  if (!mod && !e.altKey && e.key === 't') location.hash = '#/terminal';
});

window.addEventListener('hashchange', render);
window.addEventListener('ai-info', e => toast(e.detail, 4500));
paintIcons();
setupQuota();
watchDiagrams();

// Mode démo pour tester l'app sans clé (réponses préparées) : ajouter ?demo à l'adresse.
if (new URLSearchParams(location.search).has('demo')) await import('../dev/demo.js');
await startSync();
render();
setupReminders();

// Données arrivées d'un autre appareil : on rafraîchit les pages de liste (jamais pendant une saisie).
const LIVE = /^#?\/?(|ateliers|carnet|flashcards|reviser|outils|progression|planning|reparer)$/;
window.addEventListener('sudo:changed', () => {
  if (!LIVE.test(location.hash.split('?')[0])) return;
  if (document.activeElement?.closest('input, textarea, select') || $('#sheet-root').children.length) return;
  const y = window.scrollY;
  render().then(() => window.scrollTo(0, y));
});
// Photo envoyée depuis le téléphone
window.addEventListener('sudo:photo', e => receivedPhoto(e.detail));
// Retour du réseau : on envoie ce qui attendait (photos à analyser).
window.addEventListener('online', () => { processPendingPhotos(); });
setTimeout(processPendingPhotos, 3000);
// Témoin de synchro dans la barre du haut
const syncBtn = $('#sync');
const paintSync = st => { if (!syncBtn) return; syncBtn.hidden = st.status === 'off'; syncBtn.dataset.s = st.status; syncBtn.title = { ok: 'Synchronisé', idle: 'Synchronisé', syncing: 'Synchronisation…', offline: 'Hors ligne : en attente', error: 'Erreur de synchronisation' }[st.status] || ''; syncBtn.setAttribute('aria-label', syncBtn.title); };
window.addEventListener('sync-status', e => paintSync(e.detail));
paintSync(syncStatus());

// Application installable + hors ligne
if ('serviceWorker' in navigator && location.protocol !== 'file:' && !location.search.includes('demo')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
