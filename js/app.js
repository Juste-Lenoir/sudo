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

const ROUTES = [
  [/^$/, homeView, 'accueil'],
  [/^ateliers$/, ateliersList, 'ateliers'],
  [/^atelier\/nouveau$/, atelierNew, 'ateliers'],
  [/^atelier\/([\w-]+)$/, atelierView, 'ateliers'],
  [/^verif\/([\w-]+)$/, verifView, 'ateliers'],
  [/^photo$/, photoView, 'photo'],
  [/^assistant$/, assistantView, 'assistant'],
  [/^reglages$/, settingsView, 'reglages'],
];

let renderId = 0;
async function render() {
  const id = ++renderId;
  const path = location.hash.replace(/^#\/?/, '').split('?')[0];
  for (const [re, fn, nav] of ROUTES) {
    const m = path.match(re);
    if (!m) continue;
    $$('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === nav));
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

// Raccourcis clavier (ordinateur)
document.addEventListener('keydown', e => {
  if (e.target.closest('input, textarea, select')) return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); location.hash = '#/assistant'; }
  if (!mod && !e.altKey && e.key === 'n') location.hash = '#/atelier/nouveau';
  if (!mod && !e.altKey && e.key === 'p') location.hash = '#/photo';
});

window.addEventListener('hashchange', render);
window.addEventListener('ai-info', e => toast(e.detail, 4500));
paintIcons();
setupQuota();
watchDiagrams();

// Mode démo pour tester l'app sans clé (réponses préparées) : ajouter ?demo à l'adresse.
if (new URLSearchParams(location.search).has('demo')) await import('../dev/demo.js');
render();

// Application installable + hors ligne
if ('serviceWorker' in navigator && location.protocol !== 'file:' && !location.search.includes('demo')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
