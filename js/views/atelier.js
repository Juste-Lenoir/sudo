// Écran d'atelier : 3 vues sur les mêmes données.
// Établi (plan + outils), Focus (une seule étape), Conversation (tout passe par l'assistant).
import { get, put, del, uid, getProfile, logActivity } from '../store.js';
import { chat } from '../ai.js';
import { atelierSystem, hint, rapport, fiches } from '../prompts.js';
import { mountChat, transcript, stripData } from '../chat.js';
import { md } from '../md.js';
import { askJSON } from '../ai.js';
import { $, $$, esc, toast, icon, copy, download, slug, domainTag, sheet, pickImages, paintIcons, loading } from '../ui.js';
import { statusOf } from './verif.js';
import { analysePhoto } from './photo.js';

const VIEWS = [['etabli', 'Établi', 'columns'], ['focus', 'Focus', 'focus'], ['chat', 'Conversation', 'chat']];

export async function atelierView(v, id) {
  const at = await get('ateliers', id);
  if (!at) { v.innerHTML = '<div class="empty">Atelier introuvable.</div>'; return; }
  at.chat ||= []; at.steps ||= []; at.clarifs ||= []; at.photos ||= [];
  const prof = await getProfile();
  let tab = 'assistant';
  let chatApi = null;

  const save = async () => { at.updatedAt = Date.now(); await put('ateliers', at); };
  const system = async () => atelierSystem(prof, at);
  const curIdx = () => { const i = at.steps.findIndex(s => !s.done); return i < 0 ? at.steps.length - 1 : i; };
  const doneCount = () => at.steps.filter(s => s.done).length;

  // Données renvoyées par l'IA (bloc ```sudo```) : étapes validées et relevés.
  async function onData(d) {
    let changed = false;
    for (const n of d.valider || []) {
      const s = at.steps[n - 1];
      if (s && !s.done) { s.done = true; s.faire.forEach(f => { f.done = true; }); changed = true; }
    }
    for (const r of d.releves || []) {
      const s = at.steps[(r.etape || 0) - 1];
      if (!s || !r.champ) continue;
      let f = s.releves.find(x => x.champ.toLowerCase() === String(r.champ).toLowerCase());
      if (!f) s.releves.push(f = { champ: r.champ, valeur: '' });
      if (r.valeur) { f.valeur = String(r.valeur); changed = true; }
    }
    if (changed) { await save(); celebrate(); refreshSide(); }
  }

  function chatOpts() {
    return {
      messages: at.chat, system, save, onData,
      placeholder: 'Ton résultat, ta question ou une photo…',
      empty: 'Colle une sortie de commande, envoie une photo de ton écran ou pose ta question. L\'assistant valide les étapes et remplit tes relevés.',
      quick: [
        { label: 'Indice', text: () => nextHint() },
        { label: 'Explique-moi le but', text: () => `Explique-moi simplement le but de l'étape « ${at.steps[curIdx()]?.titre || ''} », avec un schéma si ça aide.` },
        { label: 'Méthode la plus rapide ?', text: () => `Pour l'étape « ${at.steps[curIdx()]?.titre || ''} », quelle est la méthode la plus simple, avec le moins de commandes possible ? Donne-moi juste la piste, pas la solution complète.` },
      ],
    };
  }
  function nextHint(i = curIdx()) {
    const s = at.steps[i];
    if (!s) return 'Donne-moi un indice.';
    s.hint = Math.min(3, (s.hint || 0) + 1);
    save();
    return hint(s.hint, s);
  }

  function celebrate() {
    const el = $('.at-progress', v);
    if (el) { el.classList.remove('celebrate'); void el.offsetWidth; el.classList.add('celebrate'); }
    if (doneCount() === at.steps.length && at.steps.length) toast('Toutes les étapes sont faites : passe à la vérification');
  }

  // ---------- En-tête commun ----------
  function header() {
    const st = statusOf(at);
    return `<div class="at-head">
      <a class="icon-btn" href="#/ateliers" aria-label="Retour aux ateliers">${icon('back')}</a>
      <div style="flex:1 1 260px;min-width:0">
        <h1>${esc(at.title)}</h1>
        <div class="row small">${domainTag(at.domain)}<span class="tag ${st.cls}">${st.label}${at.best != null ? ' · meilleure note ' + at.best + '/20' : ''}</span><span class="muted at-progress">${doneCount()}/${at.steps.length} étapes</span></div>
      </div>
      <div class="row">
        <div class="seg" role="group" aria-label="Vue">${VIEWS.map(([k, l]) => `<button data-view="${k}" class="${at.view === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <button class="icon-btn" data-menu aria-label="Plus d'actions">${icon('list')}</button>
      </div>
    </div>`;
  }

  function clarifyBox() {
    if (!at.clarifs.length) return '';
    return `<div class="clarify"><strong>À clarifier</strong><ul>${at.clarifs.map((c, i) => `<li>${esc(c.point)}${c.proposition ? ` <span class="muted">→ ${esc(c.reponse || c.proposition)}</span>` : ''} <button class="link" data-clar="${i}">${c.reponse ? 'modifier' : 'répondre'}</button></li>`).join('')}</ul></div>`;
  }

  function stepCard(s, i, open) {
    const res = s.releves.filter(r => r.valeur).map(r => r.valeur).join(' · ');
    return `<div class="step ${s.done ? 'done' : ''} ${i === curIdx() && !s.done ? 'cur' : ''}" data-step="${i}">
      <button class="step-row" data-toggle="${i}" aria-expanded="${open}">
        <span class="num">${s.done ? icon('check') : i + 1}</span>
        <span class="step-title">${esc(s.titre)}${s.groupe ? `<span class="small muted" style="display:block;font-weight:400">${esc(s.groupe)}</span>` : ''}</span>
        ${res ? `<span class="step-res">${esc(res)}</span>` : ''}
      </button>
      ${open ? `<div class="step-body">
        ${s.but ? `<div class="small muted">${esc(s.but)}</div>` : ''}
        ${s.faire.length ? `<div class="list">${s.faire.map((f, j) => `<label class="check"><input type="checkbox" data-faire="${i}:${j}" ${f.done ? 'checked' : ''}><span>${esc(f.t)}</span></label>`).join('')}</div>` : ''}
        ${s.releves.length ? `<div class="grid2">${s.releves.map((r, j) => `<label class="field">${esc(r.champ)}<input class="input mono" data-rel="${i}:${j}" value="${esc(r.valeur)}" placeholder="à relever" autocomplete="off" spellcheck="false"></label>`).join('')}</div>` : ''}
        ${s.validation ? `<div class="small muted">Pour valider : ${esc(s.validation)}</div>` : ''}
        <div class="row">
          <button class="btn ${s.done ? 'ghost' : 'primary'}" data-done="${i}">${s.done ? 'Rouvrir' : 'Étape terminée'}</button>
          <button class="btn hint" data-hint="${i}">${icon('bulb')}Indice${s.hint ? ' ' + Math.min(3, s.hint + 1) + '/3' : ''}</button>
          <button class="btn" data-shot="${i}">${icon('camera')}Photo</button>
        </div>
      </div>` : ''}
    </div>`;
  }

  // ---------- Établi ----------
  let openStep = null;
  function etabli() {
    const c = curIdx();
    if (openStep == null) openStep = c;
    return `${header()}
    <div class="workbench">
      <div class="stack">
        ${at.analysis?.reformulation ? `<div class="card small">${esc(at.analysis.reformulation)}</div>` : ''}
        ${clarifyBox()}
        <div class="steps" data-steps>${at.steps.map((s, i) => stepCard(s, i, i === openStep)).join('')}</div>
        ${doneCount() === at.steps.length && at.steps.length ? `<a class="btn primary big block" href="#/verif/${at.id}">${icon('play')}Vérification par le formateur</a>` : `<a class="btn ghost block" href="#/verif/${at.id}">Vérification par le formateur</a>`}
      </div>
      <div class="tools">
        <div class="tools-tabs" role="tablist">${[['assistant', 'Assistant'], ['commandes', 'Commandes'], ['schema', 'Schéma'], ['releves', 'Relevés'], ['photos', 'Photos']].map(([k, l]) => `<button role="tab" data-tab="${k}" class="${tab === k ? 'on' : ''}" aria-selected="${tab === k}">${l}</button>`).join('')}</div>
        <div class="tools-body" data-tools></div>
      </div>
    </div>`;
  }

  function relevesTable() {
    const rows = at.steps.flatMap((s, i) => s.releves.map(r => ({ s, i, r })));
    if (!rows.length) return '<p class="muted small">Pas de valeur à relever dans cet atelier.</p>';
    return `<div class="table-wrap"><table class="releves"><thead><tr><th>Étape</th><th>Champ</th><th>Valeur</th></tr></thead><tbody>${rows.map(({ s, i, r }) => `<tr><td style="font-family:var(--sans)">${i + 1}. ${esc(s.groupe || s.titre)}</td><td style="font-family:var(--sans)">${esc(r.champ)}</td><td>${esc(r.valeur) || '<span class="muted">—</span>'}</td></tr>`).join('')}</tbody></table></div><p class="small muted">Repris tel quel dans ton compte rendu.</p>`;
  }

  function commandesPane() {
    const i = openStep ?? curIdx();
    const s = at.steps[i];
    if (!s) return '<p class="muted">Pas d\'étape.</p>';
    if (!s.commandes?.length) return `<p class="muted small">Pas de commande pour l'étape ${i + 1}.</p>`;
    if (!s.showCmd) return `<div class="stack"><p class="small muted">Étape ${i + 1} · ${esc(s.titre)}</p><p class="small">Les commandes de cette étape sont prêtes. Essaie d'abord de chercher : les afficher compte comme un indice.</p><button class="btn hint" data-showcmd="${i}">Afficher les commandes</button></div>`;
    return `<div class="stack"><p class="small muted">Étape ${i + 1} · ${esc(s.titre)}</p>${s.commandes.map(c => `<div class="cmd"><div class="grow"><code>${esc(c.cmd)}</code><div class="s">${esc(c.os || '')}${c.role ? ' · ' + esc(c.role) : ''}</div></div><button class="round" data-copy="${esc(c.cmd)}" aria-label="Copier">${icon('copy')}</button></div>`).join('')}</div>`;
  }

  function schemaPane() {
    const src = at.schema || at.analysis?.schema;
    return `<div class="stack">${src ? `<div class="diagram" data-mermaid="${esc(src)}"></div>` : '<p class="muted small">Pas encore de schéma.</p>'}
      <button class="btn ghost" data-genschema>${icon('diagram')}${src ? 'Refaire le schéma' : 'Dessiner un schéma'}</button>
      <div data-schema-out></div></div>`;
  }

  function photosPane() {
    return `<div class="stack">
      <div class="row"><button class="btn" data-addphoto>${icon('camera')}Ajouter une photo</button><span class="small muted">tableau, matériel, écran…</span></div>
      ${at.photos.length ? `<div class="grid2">${at.photos.map((p, i) => `<div class="card stack"><img src="${esc(p.src)}" alt="" style="width:100%;border-radius:10px"><div class="row"><span class="small muted grow">${esc(p.resume || 'Photo de l\'atelier')}</span><button class="btn sm" data-anaphoto="${i}">Analyser</button><button class="icon-btn" data-rmphoto="${i}" aria-label="Supprimer">${icon('trash')}</button></div></div>`).join('')}</div>` : '<p class="muted small">Tes photos servent à l\'assistant et aux questions de vérification.</p>'}
    </div>`;
  }

  function paintTools() {
    const box = $('[data-tools]', v);
    if (!box) return;
    if (tab === 'assistant') {
      box.innerHTML = '<div data-chat style="display:flex;flex-direction:column;flex:1;min-height:0"></div>';
      chatApi = mountChat($('[data-chat]', box), chatOpts());
    } else {
      chatApi = null;
      box.innerHTML = `<div class="pad">${{ commandes: commandesPane, schema: schemaPane, releves: relevesTable, photos: photosPane }[tab]()}</div>`;
    }
    paintIcons(box);
  }

  function refreshSide() {
    if (at.view === 'etabli') {
      const st = $('[data-steps]', v);
      if (st) st.innerHTML = at.steps.map((s, i) => stepCard(s, i, i === openStep)).join('');
      const pr = $('.at-progress', v); if (pr) pr.textContent = `${doneCount()}/${at.steps.length} étapes`;
      if (tab !== 'assistant') paintTools();
    } else if (at.view === 'focus') render();
  }

  // ---------- Focus ----------
  function focus() {
    const i = curIdx();
    const s = at.steps[i];
    if (!s) return `${header()}<div class="empty">Pas d'étape.</div>`;
    const all = doneCount() === at.steps.length;
    return `<div class="focus">
      <div class="row"><button class="icon-btn" data-view="etabli" aria-label="Quitter le mode Focus">${icon('x')}</button>
        <div class="grow"><div class="small muted at-progress">${esc(at.title)} · étape ${i + 1} sur ${at.steps.length}</div>
        <div class="progress" style="margin-top:6px">${at.steps.map((x, j) => `<span class="${x.done ? 'd' : j === i ? 'c' : ''}"></span>`).join('')}</div></div></div>
      ${all ? `<div class="card stack celebrate"><h2>Toutes les étapes sont faites</h2><p class="muted">Le formateur va passer : vérifie que tu as compris.</p><a class="btn primary big" href="#/verif/${at.id}">Vérification</a></div>` : ''}
      <div>
        ${s.groupe ? `<div class="kicker">${esc(s.groupe)}</div>` : ''}
        <h1>${esc(s.titre)}</h1>
        ${s.but ? `<p class="muted" style="margin:6px 0 0">${esc(s.but)}</p>` : ''}
      </div>
      ${s.faire.length ? `<div class="list">${s.faire.map((f, j) => `<label class="check"><input type="checkbox" data-faire="${i}:${j}" ${f.done ? 'checked' : ''}><span>${esc(f.t)}</span></label>`).join('')}</div>` : ''}
      ${s.releves.length ? `<div><div style="font-weight:600;margin-bottom:10px">Note ce que tu obtiens</div><div class="grid2">${s.releves.map((r, j) => `<label class="field">${esc(r.champ)}<input class="input mono" data-rel="${i}:${j}" value="${esc(r.valeur)}" placeholder="à relever" autocomplete="off" spellcheck="false"></label>`).join('')}</div><div class="small muted" style="margin-top:8px">ou envoie une photo de l'écran : l'assistant lit les valeurs pour toi.</div></div>` : ''}
      ${s.validation ? `<div class="small muted">Pour valider : ${esc(s.validation)}</div>` : ''}
    </div>
    <div class="focus-bar"><div class="in">
      <div class="row3"><button class="btn hint" data-hint="${i}">${icon('bulb')}Indice</button><button class="btn" data-shot="${i}">${icon('camera')}Photo</button><button class="btn" data-stuck="${i}">Bloqué</button></div>
      <button class="btn primary big block" data-done="${i}">${s.done ? 'Étape suivante' : 'Étape terminée'}</button>
    </div></div>`;
  }

  // Dans Focus, l'assistant s'ouvre dans une feuille.
  function chatSheet(then) {
    const sh = sheet(`<div class="row" style="margin-bottom:8px"><strong>Assistant</strong><span class="grow"></span><button class="icon-btn" data-close aria-label="Fermer">${icon('x')}</button></div><div data-chat style="height:62vh;display:flex;flex-direction:column;background:var(--card);border-radius:14px"></div>`, { onClose: () => { if (at.view === 'focus') render(); } });
    const api = mountChat($('[data-chat]', sh.el), chatOpts());
    then?.(api);
  }

  // ---------- Conversation ----------
  function convo() {
    return `${header()}
      <div class="row" style="margin-bottom:10px"><button class="chip" data-plan>${icon('list')} Plan ${doneCount()}/${at.steps.length}</button>${clarifs() }<span class="grow"></span><button class="chip" data-tabgo="releves">Relevés</button></div>
      <div class="card" style="padding:0;height:calc(100vh - 290px);min-height:420px;display:flex;flex-direction:column" data-chat></div>`;
  }
  const clarifs = () => (at.clarifs.length ? `<button class="chip" data-showclar style="color:var(--hint);border-color:var(--hint-line)">${at.clarifs.length} à clarifier</button>` : '');

  // ---------- Rendu ----------
  function render() {
    v.innerHTML = at.view === 'focus' ? focus() : at.view === 'chat' ? convo() : etabli();
    if (at.view === 'etabli') paintTools();
    if (at.view === 'chat') chatApi = mountChat($('[data-chat]', v), chatOpts());
    paintIcons(v);
  }

  async function markDone(i) {
    const s = at.steps[i];
    if (!s) return;
    if (at.view === 'focus' && s.done) { render(); return; }
    s.done = !s.done;
    if (s.done) s.faire.forEach(f => { f.done = true; });
    openStep = s.done ? curIdx() : i;
    await save();
    logActivity();
    if (s.done) celebrate();
    at.view === 'focus' ? render() : refreshSide();
  }

  function askHint(i) {
    const text = nextHint(i);
    if (at.view === 'focus') { chatSheet(api => api.send(text)); return; }
    if (at.view === 'chat') { chatApi?.send(text); return; }
    tab = 'assistant';
    $$('[data-tab]', v).forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    paintTools();
    chatApi.send(text);
    $('.tools', v).scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function shot(i) {
    const imgs = await pickImages({ camera: true });
    if (!imgs.length) return;
    const text = `Voici une photo pour l'étape ${i + 1} (« ${at.steps[i]?.titre} »). Lis ce qu'elle montre et dis-moi si c'est bon.`;
    if (at.view === 'focus') { chatSheet(api => api.send(text, imgs)); return; }
    if (at.view === 'chat') { chatApi?.send(text, imgs); return; }
    tab = 'assistant';
    paintTools();
    $$('[data-tab]', v).forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    chatApi.send(text, imgs);
    $('.tools', v).scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function genSchema(out) {
    loading(out, 'Dessin du schéma');
    let acc = '';
    try {
      const r = await chat({ system: atelierSystem(prof, at), task: 'best', onInfo: toast, messages: [{ role: 'user', text: 'Dessine UN schéma mermaid (flowchart) qui aide à comprendre cet atelier (par exemple un schéma par mode réseau, ou la topologie). Libellés courts, termes en anglais, adresses IP relevées si connues. Réponds uniquement avec le bloc mermaid.' }], onDelta: d => { acc += d; } });
      const m = r.text.match(/```mermaid\s*([\s\S]*?)```/);
      if (!m) throw new Error('pas de schéma dans la réponse');
      at.schema = m[1].trim();
      await save();
      paintTools();
    } catch (e) { out.innerHTML = `<p class="muted small">${esc(e.message)}</p>`; }
  }

  async function genRapport() {
    const sh = sheet(`<div class="row"><h2 style="margin:0">Compte rendu de TP</h2><span class="grow"></span><button class="icon-btn" data-close aria-label="Fermer">${icon('x')}</button></div><div data-out class="md" style="margin-top:10px"></div>`);
    const out = $('[data-out]', sh.el);
    if (at.rapport && !confirm('Refaire le compte rendu ? (sinon, l\'ancien s\'affiche)')) { showRapport(out); return; }
    loading(out, 'Rédaction du compte rendu');
    let acc = '';
    try {
      const r = await chat({ system: atelierSystem(prof, at), task: 'best', onInfo: toast, messages: [{ role: 'user', text: rapport(at, transcript(at.chat)) }], onDelta: d => { acc += d; out.innerHTML = md(acc, { streaming: true }); } });
      at.rapport = stripData(r.text);
      await save();
      showRapport(out);
    } catch (e) { out.innerHTML = `<p class="muted">${esc(e.message)}</p>`; }
  }
  function showRapport(out) {
    out.innerHTML = md(at.rapport) + `<div class="row" style="margin-top:14px"><button class="btn" data-cprap>${icon('copy')}Copier</button><button class="btn" data-dlrap>${icon('file')}Télécharger (.md)</button></div>`;
    $('[data-cprap]', out).onclick = () => copy(at.rapport);
    $('[data-dlrap]', out).onclick = () => download(slug(at.title) + '-compte-rendu.md', at.rapport);
    paintIcons(out);
  }

  async function genFiches() {
    toast('Création des fiches pour ton carnet…');
    try {
      const r = await askJSON({ system: atelierSystem(prof, at), prompt: fiches(at, transcript(at.chat)), task: 'best', onInfo: toast });
      const list = r.fiches || [];
      for (const f of list) await put('carnet', { id: uid(), createdAt: Date.now(), titre: f.titre, domaine: f.domaine || at.domain, tags: f.tags || [], contenu: f.contenu, source: at.id });
      toast(`${list.length} fiche${list.length > 1 ? 's' : ''} ajoutée${list.length > 1 ? 's' : ''} au carnet`);
    } catch (e) { toast(e.message, 5000); }
  }

  function menu() {
    const sh = sheet(`<h2>${esc(at.title)}</h2><div class="list">
      <button class="item" data-a="verif">${icon('play')}<span class="grow">Vérification par le formateur</span></button>
      <button class="item" data-a="rapport">${icon('file')}<span class="grow">Compte rendu de TP</span></button>
      <button class="item" data-a="fiches">${icon('list')}<span class="grow">Créer des fiches pour le carnet</span></button>
      <button class="item" data-a="consigne">${icon('image')}<span class="grow">Revoir la consigne d'origine</span></button>
      <button class="item" data-a="rename">${icon('wrench')}<span class="grow">Renommer</span></button>
      <button class="item" data-a="delete" style="color:var(--err)">${icon('trash')}<span class="grow">Supprimer l'atelier</span></button>
    </div>`);
    sh.el.addEventListener('click', async e => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (!a) return;
      sh.close();
      if (a === 'verif') location.hash = '#/verif/' + at.id;
      if (a === 'rapport') genRapport();
      if (a === 'fiches') genFiches();
      if (a === 'consigne') sheet(`<h2>Consigne d'origine</h2>${at.consigne.images?.map(u => `<img src="${esc(u)}" alt="" style="width:100%;border-radius:12px;margin-bottom:10px">`).join('') || ''}<pre class="mono small" style="white-space:pre-wrap">${esc(at.consigne.text || '')}</pre>`);
      if (a === 'rename') { const t = prompt('Nouveau nom', at.title); if (t) { at.title = t.trim(); await save(); render(); } }
      if (a === 'delete' && confirm('Supprimer définitivement cet atelier, son plan et ses échanges ?')) { await del('ateliers', at.id); location.hash = '#/ateliers'; }
    });
  }

  function planSheet() {
    const sh = sheet(`<h2>Plan · ${doneCount()}/${at.steps.length}</h2><div class="steps">${at.steps.map((s, i) => stepCard(s, i, false)).join('')}</div>`);
    sh.el.addEventListener('click', async e => {
      const t = e.target.closest('[data-toggle]');
      if (t) { sh.close(); openStep = +t.dataset.toggle; at.view = 'etabli'; await save(); render(); }
    });
  }

  function clarSheet(i) {
    const c = at.clarifs[i];
    const sh = sheet(`<h2>À clarifier</h2><p>${esc(c.point)}</p>${c.proposition ? `<p class="small muted">Proposition : ${esc(c.proposition)}</p>` : ''}
      <label class="field">Ce que tu as appris (réponse du formateur, choix fait)<input class="input" data-r value="${esc(c.reponse || '')}"></label>
      <div class="row" style="margin-top:12px"><button class="btn ghost" data-close>Annuler</button><span class="grow"></span><button class="btn primary" data-ok>Enregistrer</button></div>`);
    $('[data-ok]', sh.el).onclick = async () => { c.reponse = $('[data-r]', sh.el).value.trim(); await save(); sh.close(); render(); };
  }

  // ---------- Événements ----------
  v.onclick = async e => {
    const t = e.target.closest('button, a, input');
    if (!t) return;
    const d = t.dataset;
    if (d.view) { at.view = d.view; await save(); render(); window.scrollTo(0, 0); return; }
    if (d.menu !== undefined) return menu();
    if (d.toggle) { const i = +d.toggle; openStep = openStep === i ? -1 : i; refreshSide(); if (tab === 'commandes') paintTools(); return; }
    if (d.done) return markDone(+d.done);
    if (d.hint) return askHint(+d.hint);
    if (d.shot) return shot(+d.shot);
    if (d.stuck) { const i = +d.stuck; chatSheet(api => api.setText(`Je bloque sur l'étape ${i + 1} (« ${at.steps[i].titre} ») : `)); return; }
    if (d.tab) { tab = d.tab; $$('[data-tab]', v).forEach(b => { b.classList.toggle('on', b.dataset.tab === tab); b.setAttribute('aria-selected', b.dataset.tab === tab); }); paintTools(); return; }
    if (d.showcmd) { const s = at.steps[+d.showcmd]; s.showCmd = true; s.hint = Math.max(s.hint || 0, 2); await save(); paintTools(); return; }
    if (d.copy) return copy(d.copy);
    if (d.genschema !== undefined) return genSchema($('[data-schema-out]', v));
    if (d.clar) return clarSheet(+d.clar);
    if (d.showclar !== undefined) return clarSheet(0);
    if (d.plan !== undefined) return planSheet();
    if (d.tabgo) { tab = d.tabgo; at.view = 'etabli'; await save(); render(); return; }
    if (d.addphoto !== undefined) {
      const imgs = await pickImages({ camera: true });
      for (const src of imgs) at.photos.push({ src, ts: Date.now() });
      await save(); paintTools(); return;
    }
    if (d.rmphoto) { if (confirm('Supprimer cette photo ?')) { at.photos.splice(+d.rmphoto, 1); await save(); paintTools(); } return; }
    if (d.anaphoto) {
      const p = at.photos[+d.anaphoto];
      analysePhoto({ images: [p.src], context: `${at.title} — ${at.analysis?.reformulation || ''}`, onResult: async r => { p.resume = r.resume; p.analyse = r; await save(); } });
      return;
    }
  };
  v.onchange = async e => {
    const t = e.target;
    if (t.dataset.faire) {
      const [i, j] = t.dataset.faire.split(':').map(Number);
      at.steps[i].faire[j].done = t.checked;
      await save();
    }
  };
  v.oninput = e => {
    const t = e.target;
    if (t.dataset.rel) {
      const [i, j] = t.dataset.rel.split(':').map(Number);
      at.steps[i].releves[j].valeur = t.value.trim();
      clearTimeout(v._t);
      v._t = setTimeout(save, 400);
    }
  };

  render();
}
