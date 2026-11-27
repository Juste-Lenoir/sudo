// Réparer : fiches des appareils apportés en atelier de réparation, sécurité avant d'ouvrir,
// diagnostic hors ligne (parcours oui/non) ou avec l'IA, résumé pour le propriétaire.
import { dbAll, get, put, del, uid, getProfile } from '../store.js';
import { askJSON, chat } from '../ai.js';
import { repairSystem, repairSummary, repairIdentify } from '../prompts.js';
import { mountChat, transcript, stripData } from '../chat.js';
import { md } from '../md.js';
import { TYPES, type, RESULTS, result, safety, TREES } from '../repair-data.js';
import { $, $$, esc, icon, paintIcons, toast, fmtDate, pickImages, copy, autoGrow } from '../ui.js';

const save = r => { r.updatedAt = Date.now(); return put('repairs', r); };
const title = r => [r.marque, r.modele].filter(Boolean).join(' ') || type(r.type).label;

// ---------- Liste ----------
export async function reparerList(v) {
  const all = (await dbAll('repairs')).sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
  const done = all.filter(r => r.resultat === 'repare').length;
  v.innerHTML = `
    <div class="row" style="margin-bottom:12px"><h1 style="margin:0">Réparer</h1><span class="grow"></span>
      <a class="btn primary" href="#/reparer/nouveau">${icon('plus')}Nouvel appareil</a></div>
    <div class="stack" style="max-width:760px">
      <p class="small muted" style="margin:0">Pour les appareils qu’on t’apporte : une fiche par appareil, la sécurité avant d’ouvrir, un diagnostic pas à pas (même sans réseau) et un résumé à donner au propriétaire.</p>
      ${all.length ? `<div class="small muted">${all.length} appareil${all.length > 1 ? 's' : ''} · ${done} réparé${done > 1 ? 's' : ''}</div>
      <div class="list">${all.map(r => `<a class="item" href="#/reparation/${r.id}">${icon(type(r.type).icon)}<div class="grow" style="min-width:0"><div class="t">${esc(title(r))}</div><div class="s">${fmtDate(r.createdAt)}${r.proprio ? ' · ' + esc(r.proprio) : ''}${r.panne ? ' · ' + esc(r.panne.slice(0, 60)) : ''}</div></div><span class="tag ${result(r.resultat).cls}">${result(r.resultat).label}</span></a>`).join('')}</div>`
        : `<div class="card stack"><strong>Aucun appareil pour l’instant</strong><span class="small muted">Quand quelqu’un t’apporte un appareil, crée sa fiche : type, modèle, panne décrite.</span></div>`}
    </div>`;
  paintIcons(v);
}

// ---------- Nouvel appareil ----------
export async function reparerNew(v) {
  const r = { id: uid(), createdAt: Date.now(), type: 'telephone', marque: '', modele: '', proprio: '', panne: '', photos: [], securite: [], parcours: [], messages: [], resultat: 'en_cours', piece: '', notes: '', resume: '' };
  const draw = () => {
    v.innerHTML = `
      <div class="row" style="margin-bottom:12px"><a class="icon-btn" href="#/reparer" aria-label="Retour">${icon('back')}</a><h1 style="margin:0">Nouvel appareil</h1></div>
      <form class="stack" style="max-width:640px" data-form>
        <div class="field">Type<div class="chips-scroll">${TYPES.map(t => `<button type="button" class="chip ${r.type === t.id ? 'on' : ''}" data-type="${t.id}">${esc(t.label)}</button>`).join('')}</div></div>
        <div class="card stack">
          <button type="button" class="btn" data-ident>${icon('camera')}Reconnaître avec une photo de l’étiquette</button>
          <div class="grid2"><label class="field">Marque<input class="input" name="marque" value="${esc(r.marque)}" placeholder="Samsung, Apple, HP…"></label>
          <label class="field">Modèle<input class="input" name="modele" value="${esc(r.modele)}" placeholder="Galaxy S21 (SM-G991B)…"></label></div>
          <label class="field">Prénom du propriétaire (facultatif)<input class="input" name="proprio" value="${esc(r.proprio)}" autocomplete="off"></label>
          <label class="field">La panne, avec ses mots<textarea class="input" name="panne" rows="3" placeholder="Depuis quand, ce qui s’est passé (chute, liquide, mise à jour…), ce qu’il a déjà essayé">${esc(r.panne)}</textarea></label>
        </div>
        <button class="btn primary big block" type="submit">Créer la fiche</button>
      </form>`;
    paintIcons(v);
    autoGrow($('textarea', v));
    const read = () => { const f = $('[data-form]', v); for (const k of ['marque', 'modele', 'proprio', 'panne']) r[k] = f[k].value.trim(); };
    $$('[data-type]', v).forEach(b => b.onclick = () => { read(); r.type = b.dataset.type; draw(); });
    $('[data-ident]', v).onclick = async e => {
      read();
      const imgs = await pickImages({ multiple: false, camera: true });
      if (!imgs.length) return;
      const btn = e.target.closest('button');
      btn.disabled = true; btn.textContent = 'Lecture de l’étiquette…';
      try {
        const j = await identify(imgs);
        r.photos.push(imgs[0]);
        if (j) { if (TYPES.some(t => t.id === j.type)) r.type = j.type; r.marque = j.marque || r.marque; r.modele = j.modele || r.modele; if (j.remarques) r.notes = j.remarques; }
        toast(j?.modele || j?.marque ? 'Appareil reconnu : vérifie les champs' : (j?.autre_photo || 'Pas lisible : remplis à la main'), 4000);
      } catch (err) { toast(err.message, 4000); r.photos.push(imgs[0]); }
      draw();
    };
    $('[data-form]', v).onsubmit = async e => {
      e.preventDefault(); read();
      await save(r);
      location.hash = '#/reparation/' + r.id;
    };
  };
  draw();
}

async function identify(images) {
  return askJSON({ system: 'Tu aides un réparateur bénévole à identifier un appareil. Réponds en français.', prompt: repairIdentify(), images, task: 'best', onInfo: toast });
}

// ---------- Fiche d'un appareil ----------
const TABS = [['fiche', 'Fiche'], ['securite', 'Sécurité'], ['diagnostic', 'Diagnostic'], ['resume', 'Résumé']];

export async function reparationView(v, id) {
  const r = await get('repairs', id);
  if (!r) { v.innerHTML = '<div class="card">Fiche introuvable. <a href="#/reparer">Retour</a></div>'; return; }
  r.photos ||= []; r.securite ||= []; r.parcours ||= []; r.messages ||= [];
  const prof = await getProfile();
  let tab = sessionStorage.getItem('rep-tab:' + id) || (r.securite.length ? 'diagnostic' : 'securite');

  function frame() {
    v.innerHTML = `
      <div class="row" style="margin-bottom:10px;flex-wrap:nowrap"><a class="icon-btn" href="#/reparer" aria-label="Retour">${icon('back')}</a>
        <div class="grow" style="min-width:0"><h1 style="margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(title(r))}</h1><div class="small muted">${esc(type(r.type).label)}${r.proprio ? ' · ' + esc(r.proprio) : ''}</div></div>
        <span class="tag ${result(r.resultat).cls}">${result(r.resultat).label}</span></div>
      <div class="seg rep-tabs" role="tablist" style="margin-bottom:14px;width:100%;max-width:640px">${TABS.map(([k, l]) => `<button role="tab" data-tab="${k}" class="${tab === k ? 'on' : ''}">${l}${k === 'securite' && safety(r.type).every(x => r.securite.includes(x.id)) ? ' ✓' : ''}</button>`).join('')}</div>
      <div data-body style="max-width:760px"></div>`;
    $$('[data-tab]', v).forEach(b => b.onclick = () => { tab = b.dataset.tab; sessionStorage.setItem('rep-tab:' + id, tab); frame(); });
    paintIcons(v);
    ({ fiche, securite, diagnostic, resume })[tab]($('[data-body]', v));
  }

  // --- Fiche ---
  function fiche(b) {
    b.innerHTML = `
      <form class="stack" data-f>
        <div class="card stack">
          <div class="field">Type<div class="chips-scroll">${TYPES.map(t => `<button type="button" class="chip ${r.type === t.id ? 'on' : ''}" data-type="${t.id}">${esc(t.label)}</button>`).join('')}</div></div>
          <div class="grid2"><label class="field">Marque<input class="input" name="marque" value="${esc(r.marque)}"></label>
          <label class="field">Modèle<input class="input" name="modele" value="${esc(r.modele)}"></label></div>
          <label class="field">Prénom du propriétaire<input class="input" name="proprio" value="${esc(r.proprio)}" autocomplete="off"></label>
          <label class="field">La panne<textarea class="input" name="panne" rows="3">${esc(r.panne)}</textarea></label>
        </div>
        <div class="card stack">
          <div class="row"><strong>Photos</strong><span class="grow"></span><button type="button" class="btn ghost" data-addph>${icon('camera')}Ajouter</button></div>
          ${r.photos.length ? `<div class="row" style="gap:8px">${r.photos.map((p, i) => `<div class="thumb" style="width:84px;height:84px"><img src="${esc(p)}" alt="photo ${i + 1}" style="width:100%;height:100%;object-fit:cover;border-radius:10px"><button type="button" data-rmph="${i}" aria-label="Retirer">✕</button></div>`).join('')}</div>` : '<span class="small muted">Étiquette, dégâts, étapes du démontage.</span>'}
        </div>
        <div class="card stack">
          <div class="field">Résultat<div class="chips-scroll">${RESULTS.map(x => `<button type="button" class="chip ${r.resultat === x.id ? 'on' : ''}" data-res="${x.id}">${esc(x.label)}</button>`).join('')}</div></div>
          <label class="field">Pièce à commander (référence)<input class="input" name="piece" value="${esc(r.piece)}" placeholder="Ex. : écran OLED Galaxy S21 SM-G991B"></label>
          <label class="field">Notes<textarea class="input" name="notes" rows="3" placeholder="Ce que tu as testé, mesuré, démonté">${esc(r.notes)}</textarea></label>
        </div>
        <div class="row"><button type="button" class="btn ghost" data-del style="color:var(--err)">${icon('trash')}Supprimer la fiche</button></div>
      </form>`;
    paintIcons(b);
    $$('textarea', b).forEach(t => autoGrow(t));
    const f = $('[data-f]', b);
    const read = () => { for (const k of ['marque', 'modele', 'proprio', 'panne', 'piece', 'notes']) r[k] = f[k].value.trim(); };
    f.addEventListener('input', () => { read(); clearTimeout(f._t); f._t = setTimeout(() => save(r), 500); });
    f.addEventListener('submit', e => e.preventDefault());
    $$('[data-type]', b).forEach(x => x.onclick = async () => { read(); r.type = x.dataset.type; await save(r); frame(); });
    $$('[data-res]', b).forEach(x => x.onclick = async () => { read(); r.resultat = x.dataset.res; await save(r); frame(); });
    $('[data-addph]', b).onclick = async () => { read(); const imgs = await pickImages({ camera: true }); if (!imgs.length) return; r.photos.push(...imgs); await save(r); frame(); };
    $$('[data-rmph]', b).forEach(x => x.onclick = async () => { read(); r.photos.splice(+x.dataset.rmph, 1); await save(r); frame(); });
    $('[data-del]', b).onclick = async () => { if (!confirm('Supprimer cette fiche ?')) return; await del('repairs', r.id); location.hash = '#/reparer'; };
  }

  // --- Sécurité ---
  function securite(b) {
    const list = safety(r.type);
    const ok = list.every(x => r.securite.includes(x.id));
    b.innerHTML = `
      <div class="stack">
        <p class="small muted" style="margin:0">À cocher avant d’ouvrir l’appareil.</p>
        <div class="list">${list.map(x => `<label class="check item"><input type="checkbox" data-safe="${x.id}" ${r.securite.includes(x.id) ? 'checked' : ''}><span><strong>${esc(x.t)}</strong><br><span class="small muted">${esc(x.d)}</span></span></label>`).join('')}</div>
        ${ok ? `<div class="card row" style="color:var(--brand)">${icon('check')}<span class="grow">Tout est vérifié, tu peux ouvrir.</span><button class="btn primary" data-go>Diagnostic</button></div>` : ''}
      </div>`;
    paintIcons(b);
    $$('[data-safe]', b).forEach(c => c.onchange = async () => {
      r.securite = c.checked ? [...new Set([...r.securite, c.dataset.safe])] : r.securite.filter(x => x !== c.dataset.safe);
      await save(r); frame();
    });
    $('[data-go]', b)?.addEventListener('click', () => { tab = 'diagnostic'; sessionStorage.setItem('rep-tab:' + id, tab); frame(); });
  }

  // --- Diagnostic : parcours hors ligne puis IA ---
  let mode = r.messages.length ? 'ia' : 'parcours';
  function diagnostic(b) {
    b.innerHTML = `
      <div class="seg" style="margin-bottom:12px"><button data-m="parcours" class="${mode === 'parcours' ? 'on' : ''}">Pas à pas</button><button data-m="ia" class="${mode === 'ia' ? 'on' : ''}">Avec l’IA</button></div>
      <div data-d></div>`;
    $$('[data-m]', b).forEach(x => x.onclick = () => { mode = x.dataset.m; diagnostic(b); });
    (mode === 'parcours' ? parcours : ia)($('[data-d]', b));
  }

  function parcours(d) {
    const cur = r.tree && TREES[r.tree];
    if (!cur) {
      d.innerHTML = `
        <div class="stack">
          <p class="small muted" style="margin:0">Choisis le symptôme. Des questions oui/non mènent à une piste, sans IA ni réseau.</p>
          <div class="list">${Object.entries(TREES).map(([k, t]) => `<button class="item" data-tree="${k}"><span class="grow t">${esc(t.label)}</span>${icon('play')}</button>`).join('')}</div>
          ${r.parcours.length ? `<div class="card stack"><strong>Parcours précédent</strong>${steps()}</div>` : ''}
        </div>`;
      paintIcons(d);
      $$('[data-tree]', d).forEach(x => x.onclick = async () => { r.tree = x.dataset.tree; r.node = TREES[r.tree].start; r.parcours = []; await save(r); parcours(d); });
      return;
    }
    const n = cur.n[r.node];
    d.innerHTML = `
      <div class="stack">
        <div class="row"><span class="tag">${esc(cur.label)}</span><span class="grow"></span><button class="link" data-restart>Changer de symptôme</button></div>
        ${r.parcours.length ? steps() : ''}
        ${n.fin
          ? `<div class="card stack" style="border:1px solid var(--brand)"><div class="label" style="margin:0;color:var(--brand)">Piste</div><strong>${esc(n.fin)}</strong><div class="md small">${md(n.d)}</div>
              <div class="row">${n.go ? `<button class="btn" data-go="${n.go}">Parcours « ${esc(TREES[n.go].label)} »</button>` : ''}<button class="btn primary" data-toia>${icon('chat')}Continuer avec l’IA</button></div></div>`
          : `<div class="card stack"><strong>${esc(n.q)}</strong>${n.d ? `<span class="small muted">${esc(n.d)}</span>` : ''}
              <div class="grid2" style="grid-template-columns:1fr 1fr"><button class="btn primary big" data-a="oui">Oui</button><button class="btn big" data-a="non">Non</button></div></div>`}
        ${r.parcours.length && !n.fin ? '<button class="link" data-back>Revenir à la question précédente</button>' : ''}
      </div>`;
    paintIcons(d);
    $$('[data-a]', d).forEach(x => x.onclick = async () => {
      r.parcours.push({ node: r.node, q: n.q, rep: x.dataset.a === 'oui' ? 'Oui' : 'Non' });
      r.node = n[x.dataset.a];
      const end = cur.n[r.node];
      if (end?.fin) r.piste = end.fin;
      await save(r); parcours(d);
    });
    $('[data-back]', d)?.addEventListener('click', async () => { const last = r.parcours.pop(); r.node = last.node; await save(r); parcours(d); });
    $('[data-restart]', d).onclick = async () => { r.tree = null; await save(r); parcours(d); };
    $('[data-go]', d)?.addEventListener('click', async e => { r.tree = e.target.dataset.go; r.node = TREES[r.tree].start; await save(r); parcours(d); });
    $('[data-toia]', d)?.addEventListener('click', () => { mode = 'ia'; frame(); });
  }
  const steps = () => `<ol class="small" style="margin:0;padding-left:20px;color:var(--muted)">${r.parcours.map(x => `<li>${esc(x.q)} <strong style="color:var(--text)">${esc(x.rep)}</strong></li>`).join('')}</ol>`;

  function ia(d) {
    d.innerHTML = `<div class="card" style="padding:0;height:calc(100vh - 330px);min-height:420px;display:flex;flex-direction:column" data-chat></div>`;
    mountChat($('[data-chat]', d), {
      messages: r.messages,
      system: async () => repairSystem(prof, { ...r, parcours: r.parcours.map(x => ({ q: x.q, rep: x.rep })) }, type(r.type).label),
      save: () => save(r),
      task: 'best',
      placeholder: 'Ce que tu observes, une mesure, une photo…',
      empty: `Décris ce que tu vois ou envoie une photo (étiquette, carte, dégâts). L’IA te guide un test à la fois.${r.piste ? `<br><br>Piste du parcours : <strong>${esc(r.piste)}</strong>` : ''}`,
      quick: [
        { label: 'Par où commencer ?', text: 'Par où je commence ? Donne-moi le premier test, le plus simple.' },
        { label: 'Quelle pièce ?', text: 'Quelle pièce exacte faut-il commander pour ce modèle, et comment vérifier que c’est la bonne ?' },
        { label: 'Guide de démontage', text: 'Comment ouvrir cet appareil en sécurité ? Étapes principales et où trouver un guide fiable.' },
        { label: 'Ça vaut le coup ?', text: 'Est-ce réparable sur place, et est-ce que ça vaut le coup par rapport au prix de l’appareil ?' },
      ],
    });
  }

  // --- Résumé pour le propriétaire ---
  function resume(b) {
    b.innerHTML = `
      <div class="stack">
        <p class="small muted" style="margin:0">À montrer ou envoyer au propriétaire : ce qui a été fait, le résultat, la pièce à commander et des conseils.</p>
        <div class="row"><button class="btn primary" data-gen>${icon('file')}${r.resume ? 'Refaire avec l’IA' : 'Préparer avec l’IA'}</button><button class="btn ghost" data-plain>Sans IA</button></div>
        ${r.resume ? `<div class="card md" data-out>${md(r.resume)}</div>
          <div class="row"><button class="btn" data-copy>${icon('copy')}Copier</button>${navigator.share ? `<button class="btn" data-share>${icon('share')}Partager</button>` : ''}</div>` : ''}
      </div>`;
    paintIcons(b);
    $('[data-plain]', b).onclick = async () => { r.resume = plainSummary(r); await save(r); resume(b); };
    $('[data-gen]', b).onclick = async e => {
      const btn = e.target.closest('button');
      btn.disabled = true; btn.textContent = 'Rédaction…';
      try {
        const res = await chat({
          system: 'Tu rédiges pour un atelier de réparation bénévole. Français simple.',
          messages: [{ role: 'user', text: repairSummary({ ...r, transcript: r.messages.length ? transcript(r.messages, 6000) : '' }, type(r.type).label, result(r.resultat).label), images: [] }],
          task: 'fast', onInfo: toast,
        });
        r.resume = stripData(res.text);
        await save(r);
      } catch (err) { toast('IA indisponible : ' + err.message + '. Résumé sans IA.', 5000); r.resume = plainSummary(r); await save(r); }
      resume(b);
    };
    const text = () => $('[data-out]', b).innerText;
    $('[data-copy]', b)?.addEventListener('click', () => copy(text()));
    $('[data-share]', b)?.addEventListener('click', () => navigator.share({ title: 'Réparation : ' + title(r), text: text() }).catch(() => {}));
  }

  frame();
}

function plainSummary(r) {
  const lines = [`**Votre appareil** : ${title(r)} (${type(r.type).label.toLowerCase()})`];
  if (r.panne) lines.push(`**Le problème** : ${r.panne}`);
  const done = [...r.parcours.map(x => `${x.q} ${x.rep}`), ...(r.notes ? [r.notes] : [])];
  if (done.length) lines.push(`**Ce que nous avons fait** :\n${done.map(x => `- ${x}`).join('\n')}`);
  lines.push(`**Résultat** : ${result(r.resultat).label}${r.piste ? ` (piste : ${r.piste})` : ''}`);
  if (r.piece) lines.push(`**Pièce à commander** : ${r.piece}`);
  return lines.join('\n\n');
}
