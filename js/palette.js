// Recherche partout (⌘K) : pages, ateliers, fiches, quiz, appareils, commandes de l'aide-mémoire,
// ou poser la question à l'assistant. Tout se fait sur l'appareil, sans IA.
import { dbAll } from './store.js';
import { MEMO } from './memo-data.js';
import { $, esc, icon, sheet } from './ui.js';

const PAGES = [
  ['Aujourd’hui', '#/', 'home'], ['Ateliers', '#/ateliers', 'wrench'], ['Nouvel atelier', '#/atelier/nouveau', 'plus'],
  ['Photo', '#/photo', 'camera'], ['Assistant', '#/assistant', 'chat'], ['Flashcards', '#/flashcards', 'copy'],
  ['Réviser mes flashcards', '#/flashcards/revue', 'copy'], ['Quiz', '#/quiz', 'play'], ['Planning', '#/planning', 'list'],
  ['Sous-réseaux', '#/sous-reseaux', 'table'], ['Calculatrice IPv4', '#/sous-reseaux?tab=calc', 'table'],
  ['Progression', '#/progression', 'diagram'], ['Réparer', '#/reparer', 'wrench'], ['Nouvel appareil à réparer', '#/reparer/nouveau', 'plus'],
  ['Terminal simulé', '#/terminal', 'terminal'], ['Aide-mémoire', '#/aide-memoire', 'file'], ['Carnet', '#/carnet', 'list'],
  ['Synchronisation', '#/compte', 'cloud'], ['Réglages', '#/reglages', 'gear'],
];
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

let open = null;
export async function openPalette() {
  if (open) { open.el.querySelector('input').focus(); return; }
  const [ats, fiches, quizzes, repairs] = await Promise.all([dbAll('ateliers'), dbAll('carnet'), dbAll('quizzes'), dbAll('repairs')]);
  const items = [
    ...PAGES.map(([t, href, ic]) => ({ t, href, ic, kind: 'Page' })),
    ...ats.map(a => ({ t: a.title, href: '#/atelier/' + a.id, ic: 'wrench', kind: 'Atelier' })),
    ...fiches.map(f => ({ t: f.titre, href: '#/fiche/' + f.id, ic: 'file', kind: 'Fiche', extra: f.contenu })),
    ...[...new Set(quizzes.map(q => q.titre))].map(t => ({ t, href: '#/quiz', ic: 'play', kind: 'Quiz' })),
    ...repairs.map(r => ({ t: [r.marque, r.modele].filter(Boolean).join(' ') || 'Appareil', href: '#/reparation/' + r.id, ic: 'wrench', kind: 'Réparation', extra: r.panne })),
    ...MEMO.flatMap(m => m.groups.flatMap(g => g.items.map(([cmd, d]) => ({ t: cmd, sub: d, href: '#/aide-memoire?q=' + encodeURIComponent(cmd.split(' ')[0]), ic: 'terminal', kind: m.name, mono: true })))),
  ];
  const sh = sheet(`
    <div class="pal">
      <div class="pal-in"><span class="mono" style="color:var(--brand)">&gt;</span><input class="mono" placeholder="Aller à, chercher, ou demander à l’assistant…" aria-label="Rechercher" autocomplete="off" spellcheck="false" autocapitalize="off"><kbd>esc</kbd></div>
      <div class="pal-list" role="listbox"></div>
    </div>`, { onClose: () => { open = null; } });
  open = sh;
  sh.el.classList.add('pal-sheet');
  const inp = $('input', sh.el), list = $('.pal-list', sh.el);
  let sel = 0, shown = [];
  const draw = () => {
    const q = norm(inp.value.trim());
    if (!q) shown = items.filter(x => x.kind === 'Page').slice(0, 8);
    else {
      const words = q.split(/\s+/);
      shown = items.map(x => {
        const hay = norm(x.t + ' ' + (x.sub || '') + ' ' + x.kind + ' ' + (x.extra || '').slice(0, 400));
        if (!words.every(w => hay.includes(w))) return null;
        const title = norm(x.t);
        return { x, score: (title.startsWith(q) ? 0 : title.includes(q) ? 1 : 2) + (x.kind === 'Page' ? -0.5 : 0) };
      }).filter(Boolean).sort((a, b) => a.score - b.score).slice(0, 12).map(r => r.x);
      shown.push({ t: `Demander à l’assistant : « ${inp.value.trim()} »`, ask: inp.value.trim(), ic: 'chat', kind: 'IA' });
    }
    sel = Math.min(sel, shown.length - 1);
    list.innerHTML = shown.map((x, i) => `<button class="pal-item ${i === sel ? 'on' : ''}" data-i="${i}" role="option">${icon(x.ic)}<span class="grow" style="min-width:0"><span class="${x.mono ? 'mono' : ''}" style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(x.t)}</span>${x.sub ? `<span class="small muted" style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(x.sub)}</span>` : ''}</span><span class="small muted" style="white-space:nowrap">${esc(x.kind)}</span></button>`).join('') || '<div class="small muted" style="padding:14px">Rien trouvé.</div>';
  };
  const go = i => {
    const x = shown[i];
    if (!x) return;
    sh.close();
    if (x.ask) { sessionStorage.setItem('sudo-ask', x.ask); location.hash = '#/assistant'; if (location.hash === '#/assistant') window.dispatchEvent(new HashChangeEvent('hashchange')); return; }
    location.hash = x.href;
  };
  inp.addEventListener('input', () => { sel = 0; draw(); });
  inp.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(shown.length - 1, sel + 1); draw(); list.children[sel]?.scrollIntoView({ block: 'nearest' }); }
    if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); draw(); list.children[sel]?.scrollIntoView({ block: 'nearest' }); }
    if (e.key === 'Enter') { e.preventDefault(); go(sel); }
  });
  list.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) go(+b.dataset.i); });
  draw();
  setTimeout(() => inp.focus(), 30);
}
