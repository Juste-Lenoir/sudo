// Flashcards à répétition espacée : créées depuis le carnet, les ateliers, les erreurs de quiz ou à la main.
import { dbAll, get, put, del, getProfile, getKV } from '../store.js';
import { askJSON } from '../ai.js';
import { base, flashcardsPrompt } from '../prompts.js';
import { schedule, preview, dueToday, forecast, addCards } from '../srs.js';
import { bump, record, today } from '../progress.js';
import { cardsFrom } from './carnet.js';
import { illusHTML, loadPhotos } from '../illus.js';
import { DOMAINS, domain } from '../domains.js';
import { md } from '../md.js';
import { $, $$, esc, icon, paintIcons, toast, sheet, domainOptions, params } from '../ui.js';

const GRADES = [['À revoir', 'ko'], ['Difficile', 'mid'], ['Bien', ''], ['Facile', 'ok']];

async function newSeenToday() { return (await getKV('daily', {}))[today()]?.newCards || 0; }

export async function flashcardsView(v) {
  const [cards, fiches, ats] = await Promise.all([dbAll('cards'), dbAll('carnet'), dbAll('ateliers')]);
  const due = dueToday(cards, await newSeenToday());
  const fc = forecast(cards, 7);
  const max = Math.max(1, ...fc);
  const byDom = DOMAINS.map(d => ({ ...d, total: cards.filter(c => c.domain === d.id).length, due: due.all.filter(c => c.domain === d.id).length })).filter(d => d.total);
  const days = ['auj.', ...Array.from({ length: 6 }, (_, i) => { const x = new Date(); x.setDate(x.getDate() + i + 1); return x.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', ''); })];

  v.innerHTML = `
    <div class="row" style="margin-bottom:12px"><a class="icon-btn" href="#/reviser" aria-label="Retour">${icon('back')}</a><h1 style="margin:0">Flashcards</h1><span class="grow"></span>
      <button class="btn primary sm" data-add>${icon('plus')}Créer</button></div>
    <div class="stack" style="max-width:820px">
      ${cards.length ? `
      <div class="card stack">
        <div class="row"><div class="grow"><div class="score" style="font-size:44px">${due.all.length}</div><div class="small muted">carte${due.all.length > 1 ? 's' : ''} à revoir aujourd'hui${due.fresh.length ? ` dont ${due.fresh.length} nouvelle${due.fresh.length > 1 ? 's' : ''}` : ''}</div></div>
          <div style="width:min(220px,45%)"><div class="bars" style="height:54px">${fc.map((n, i) => `<span class="${i === 0 ? 'b' : ''}" style="height:${Math.max(4, n / max * 100)}%" title="${n} cartes"></span>`).join('')}</div><div class="bars-x">${days.map(d => `<span>${d}</span>`).join('')}</div></div></div>
        <a class="btn primary big block ${due.all.length ? '' : 'disabled'}" href="#/flashcards/revue" ${due.all.length ? '' : 'aria-disabled="true"'}>${icon('play')}${due.all.length ? 'Réviser maintenant' : 'Tout est à jour pour aujourd’hui'}</a>
      </div>
      <div class="list">${byDom.map(d => `<a class="item" href="#/flashcards/revue?d=${d.id}"><span class="dotc" style="--c:${d.color}"></span><span class="grow">${esc(d.name)}</span><span class="small muted">${d.total} carte${d.total > 1 ? 's' : ''}</span>${d.due ? `<span class="tag ok">${d.due} à revoir</span>` : ''}</a>`).join('')}</div>
      <button class="link" data-manage style="align-self:flex-start">Gérer mes ${cards.length} cartes</button>`
      : `<div class="card empty"><p>Pas encore de flashcards.</p><p class="small">Crée-les depuis ton carnet ou un atelier : l'IA en fait des cartes courtes, que sudo te représente juste avant que tu les oublies.</p><button class="btn primary" data-add2>Créer mes premières cartes</button></div>`}
      <p class="small muted">Répétition espacée : une carte bien sue revient de plus en plus tard (1 j, 3 j, 1 semaine…), une carte ratée revient tout de suite. ${'20'} nouvelles cartes au plus par jour.</p>
    </div>`;
  const openAdd = () => addSheet(fiches, ats, () => flashcardsView(v));
  $('[data-add]', v).onclick = openAdd;
  $('[data-add2]', v)?.addEventListener('click', openAdd);
  $('[data-manage]', v)?.addEventListener('click', () => manage(v, cards));
  $('a.disabled', v)?.addEventListener('click', e => e.preventDefault());
  paintIcons(v);
}

function addSheet(fiches, ats, done) {
  const doms = DOMAINS.filter(d => fiches.some(f => f.domaine === d.id));
  const withContent = ats.filter(a => (a.steps || []).length);
  const sh = sheet(`
    <h2>Créer des flashcards</h2>
    <div class="stack">
      <div class="card stack" style="background:var(--raised)">
        <strong>Depuis mon carnet</strong>
        ${doms.length ? `<div class="row"><select class="input" data-cd style="flex:1">${doms.map(d => `<option value="${d.id}">${esc(d.name)} (${fiches.filter(f => f.domaine === d.id).length} fiches)</option>`).join('')}</select><button class="btn primary" data-from-carnet>Créer</button></div>`
          : '<p class="small muted" style="margin:0">Ton carnet est vide pour l\'instant.</p>'}
      </div>
      <div class="card stack" style="background:var(--raised)">
        <strong>Depuis un atelier</strong>
        ${withContent.length ? `<div class="row"><select class="input" data-ca style="flex:1">${withContent.map(a => `<option value="${a.id}">${esc(a.title)}</option>`).join('')}</select><button class="btn primary" data-from-at>Créer</button></div>`
          : '<p class="small muted" style="margin:0">Aucun atelier pour l\'instant.</p>'}
      </div>
      <form class="card stack" style="background:var(--raised)" data-manual>
        <strong>À la main</strong>
        <label class="field">Recto (question)<input class="input" name="front" required placeholder="Ex. : Commande Cisco pour voir les VLAN ?"></label>
        <label class="field">Verso (réponse)<textarea class="input" name="back" rows="2" required placeholder="Ex. : \`show vlan brief\`"></textarea></label>
        <label class="field">Domaine<select class="input" name="dom">${domainOptions('reseau')}</select></label>
        <button class="btn" type="submit">${icon('plus')}Ajouter la carte</button>
      </form>
      <p class="small muted" style="margin:0">Depuis le carnet ou un atelier : une seule requête à l'IA rapide. Les cartes déjà présentes ne sont pas recréées.</p>
    </div>`);
  const busy = (b, t) => { b.disabled = true; b.textContent = t; };
  $('[data-from-carnet]', sh.el)?.addEventListener('click', async e => {
    const btn = e.currentTarget;
    const d = $('[data-cd]', sh.el).value;
    busy(btn, 'Création…');
    try { const n = await cardsFrom(fiches.filter(f => f.domaine === d).slice(0, 12), d); toast(n ? `${n} carte${n > 1 ? 's' : ''} créée${n > 1 ? 's' : ''}` : 'Ces cartes existent déjà'); sh.close(); done(); }
    catch (err) { toast(err.message, 5000); btn.disabled = false; btn.textContent = 'Créer'; }
  });
  $('[data-from-at]', sh.el)?.addEventListener('click', async e => {
    const btn = e.currentTarget;
    const at = await get('ateliers', $('[data-ca]', sh.el).value);
    busy(btn, 'Création…');
    try { const n = await cardsFromAtelier(at); toast(n ? `${n} carte${n > 1 ? 's' : ''} créée${n > 1 ? 's' : ''}` : 'Ces cartes existent déjà'); sh.close(); done(); }
    catch (err) { toast(err.message, 5000); btn.disabled = false; btn.textContent = 'Créer'; }
  });
  $('[data-manual]', sh.el).onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const n = await addCards([{ front: fd.get('front').trim(), back: fd.get('back').trim(), domain: fd.get('dom'), source: { type: 'manuel' } }]);
    toast(n ? 'Carte ajoutée' : 'Cette carte existe déjà');
    e.target.reset();
    if (n) done();
  };
}

export async function cardsFromAtelier(at) {
  const prof = await getProfile();
  const source = `Atelier : ${at.title}
Consigne : ${at.consigne?.text || ''}
Objectif : ${at.analysis?.reformulation || ''}
Étapes : ${(at.steps || []).map(s => `${s.titre} (${s.but})${(s.releves || []).map(r => ` ${r.champ}=${r.valeur || '?'}`).join(',')}${(s.commandes || []).map(c => ` [${c.cmd} : ${c.role}]`).join('')}`).join('\n')}
Pièges : ${(at.analysis?.pieges || []).join(' ; ')}
${at.rapport ? 'Compte rendu :\n' + at.rapport.slice(0, 5000) : ''}`;
  const r = await askJSON({ system: base(prof), prompt: flashcardsPrompt({ source, dom: at.domain, n: 12 }), task: 'fast', onInfo: toast });
  return addCards((r.cartes || []).map(c => ({ front: c.recto, back: c.verso, domain: DOMAINS.some(x => x.id === c.domaine) ? c.domaine : at.domain, illus: c.illustration || null, source: { type: 'atelier', id: at.id } })));
}

function manage(v, cards) {
  let q = '';
  v.innerHTML = `
    <div class="row" style="margin-bottom:12px"><a class="icon-btn" href="#/flashcards" aria-label="Retour">${icon('back')}</a><h1 style="margin:0">Mes cartes</h1></div>
    <input class="input" type="search" data-q placeholder="Chercher une carte" style="max-width:820px">
    <div data-list style="max-width:820px;margin-top:12px"></div>`;
  const draw = () => {
    const l = cards.filter(c => (c.front + ' ' + c.back).toLowerCase().includes(q.toLowerCase())).slice(0, 80);
    $('[data-list]', v).innerHTML = `<div class="list">${l.map(c => `<div class="item"><span class="dotc" style="--c:${domain(c.domain).color}"></span><span class="grow" style="min-width:0"><span class="t">${esc(c.front)}</span><span class="s" style="display:block">${c.seen ? `revient le ${new Date(c.due).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} · ${c.lapses} oubli${c.lapses > 1 ? 's' : ''}` : 'nouvelle'}</span></span><button class="icon-btn" data-del="${c.id}" aria-label="Supprimer">${icon('trash')}</button></div>`).join('') || '<div class="item muted">Aucune carte.</div>'}</div>`;
  };
  $('[data-q]', v).oninput = e => { q = e.target.value; draw(); };
  $('[data-list]', v).addEventListener('click', async e => {
    const b = e.target.closest('[data-del]');
    if (!b || !confirm('Supprimer cette carte ?')) return;
    await del('cards', b.dataset.del);
    cards.splice(cards.findIndex(c => c.id === b.dataset.del), 1);
    draw();
  });
  draw();
  paintIcons(v);
}

// ---------- Séance de révision ----------
export async function reviewView(v) {
  const d = params().d || null;
  const cards = await dbAll('cards');
  const queue = dueToday(cards, await newSeenToday(), d).all;
  const total = queue.length;
  let done = 0, okCount = 0, flipped = false;
  if (!total) { v.innerHTML = `<div class="card empty" style="max-width:600px;margin:0 auto"><p>Rien à revoir${d ? ' dans ce domaine' : ''} pour aujourd'hui.</p><a class="btn" href="#/flashcards">Retour</a></div>`; return; }

  const draw = () => {
    const c = queue[0];
    if (!c) return end();
    v.innerHTML = `
      <div style="max-width:640px;margin:0 auto">
        <div class="row" style="margin-bottom:12px"><a class="icon-btn" href="#/flashcards" aria-label="Arrêter">${icon('x')}</a>
          <div class="grow"><div class="meter"><i style="width:${done / (done + queue.length) * 100}%"></i></div></div><span class="small muted mono">${queue.length}</span></div>
        <div class="flash ${flipped ? 'flipped' : ''}">
          <div class="row small muted"><span class="dotc" style="--c:${domain(c.domain).color}"></span>${esc(domain(c.domain).name)}${!c.seen ? '<span class="tag ok">nouvelle</span>' : ''}</div>
          <div class="flash-front md">${md(c.front)}</div>
          ${illusHTML(c.illus)}
          ${flipped ? `<hr class="sep"><div class="flash-back md">${md(c.back)}</div>` : ''}
        </div>
        <div class="flash-bar">
          ${flipped
            ? `<div class="grades">${GRADES.map(([l, cls], g) => `<button class="btn grade ${cls}" data-g="${g}"><span>${l}</span><small>${preview(c, g)}</small></button>`).join('')}</div>`
            : '<button class="btn primary big block" data-flip>Afficher la réponse</button>'}
          <p class="small muted only-desktop" style="justify-content:center;margin:8px 0 0">Espace : retourner · 1 à 4 : noter</p>
        </div>
      </div>`;
    paintIcons(v);
    loadPhotos(v);
    $('[data-flip]', v)?.addEventListener('click', () => { flipped = true; draw(); });
    $$('[data-g]', v).forEach(b => b.onclick = () => grade(+b.dataset.g));
  };

  async function grade(g) {
    const c = queue.shift();
    const wasNew = !c.seen;
    schedule(c, g);
    await put('cards', c);
    flipped = false;
    if (g === 0) queue.splice(Math.min(queue.length, 3), 0, c); // revient un peu plus loin
    else { done++; if (g >= 2) okCount++; }
    await bump('cards');
    if (wasNew) await bump('newCards');
    await record(c.domain, [{ label: c.front, ok: g >= 2 }], { questions: false });
    draw();
  }

  const onKey = e => {
    if (!document.body.contains(v)) { document.removeEventListener('keydown', onKey); return; }
    if (e.target.closest('input, textarea, select')) return;
    if (e.key === ' ' && !flipped) { e.preventDefault(); flipped = true; draw(); }
    else if (flipped && ['1', '2', '3', '4'].includes(e.key)) grade(+e.key - 1);
  };
  document.addEventListener('keydown', onKey);

  function end() {
    document.removeEventListener('keydown', onKey);
    v.innerHTML = `<div class="card empty celebrate" style="max-width:560px;margin:0 auto">
      <div class="loading" style="padding:10px 0"><div class="big">&gt;<span class="caret">_</span></div></div>
      <h2>Séance terminée</h2><p>${done} carte${done > 1 ? 's' : ''} revue${done > 1 ? 's' : ''}, ${okCount} bien sue${okCount > 1 ? 's' : ''}.</p>
      <div class="row" style="justify-content:center"><a class="btn primary" href="#/">Aujourd'hui</a><a class="btn" href="#/flashcards">Flashcards</a></div></div>`;
  }
  draw();
}
