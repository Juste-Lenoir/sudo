// Carnet technique : fiches par domaine (créées par les ateliers ou à la main), recherche,
// photos, export ; chaque fiche peut devenir des flashcards ou un quiz.
import { dbAll, get, put, del, uid, getProfile } from '../store.js';
import { askJSON } from '../ai.js';
import { base, flashcardsPrompt } from '../prompts.js';
import { addCards } from '../srs.js';
import { md } from '../md.js';
import { DOMAINS, domain } from '../domains.js';
import { $, $$, esc, icon, paintIcons, toast, domainTag, domainOptions, fmtDate, params, download, slug, sheet, pickImages, autoGrow } from '../ui.js';

const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const ficheMd = f => `# ${f.titre}\n\n_${domain(f.domaine).name}${(f.tags || []).length ? ' · ' + f.tags.join(', ') : ''} · ${new Date(f.updatedAt || f.createdAt).toLocaleDateString('fr-FR')}_\n\n${f.contenu || ''}\n`;

export async function carnetView(v) {
  const all = (await dbAll('carnet')).sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
  const p = params();
  let d = p.d || 'all', q = p.q || '';
  const used = DOMAINS.filter(x => all.some(f => f.domaine === x.id));
  v.innerHTML = `
    <div class="row" style="margin-bottom:12px"><a class="icon-btn" href="#/outils" aria-label="Retour">${icon('back')}</a><h1 style="margin:0">Carnet</h1><span class="grow"></span>
      ${all.length ? `<button class="btn ghost sm" data-export>${icon('share')}Exporter</button>` : ''}
      <a class="btn primary sm" href="#/fiche/nouvelle">${icon('plus')}Fiche</a></div>
    ${all.length ? `
    <div class="memo-top">
      <input class="input" type="search" data-q placeholder="Chercher dans ${all.length} fiche${all.length > 1 ? 's' : ''}…" value="${esc(q)}" aria-label="Chercher une fiche">
      <div class="chips-scroll"><button class="chip ${d === 'all' ? 'on' : ''}" data-d="all">Tout</button>${used.map(x => `<button class="chip ${d === x.id ? 'on' : ''}" data-d="${x.id}"><span class="dotc" style="--c:${x.color};margin-right:6px"></span>${esc(x.name)}</button>`).join('')}</div>
    </div>
    <div data-list style="max-width:900px;margin-top:12px"></div>`
    : `<div class="card empty" style="max-width:640px"><p>Ton carnet est vide.</p><p class="small">Les fiches se créent à la fin d'un atelier (menu ⋯ → « Créer des fiches pour le carnet »), ou à la main.</p><a class="btn primary" href="#/fiche/nouvelle">Écrire une fiche</a></div>`}`;
  if (!all.length) { paintIcons(v); return; }
  const draw = () => {
    const words = fold(q).split(/\s+/).filter(Boolean);
    const list = all.filter(f => (d === 'all' || f.domaine === d) && words.every(w => fold(f.titre + ' ' + (f.tags || []).join(' ') + ' ' + f.contenu).includes(w)));
    $('[data-list]', v).innerHTML = list.length ? `<div class="list">${list.map(f => {
      const snip = String(f.contenu || '').replace(/```[\s\S]*?```/g, ' ').replace(/[#*_`>|-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 110);
      return `<a class="item" href="#/fiche/${f.id}"><span class="dotc" style="--c:${domain(f.domaine).color}"></span><span class="grow" style="min-width:0"><span class="t">${esc(f.titre)}</span><span class="s" style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(snip)}</span></span>${f.images?.length ? icon('image') : ''}<span class="small muted">${fmtDate(f.updatedAt || f.createdAt)}</span></a>`;
    }).join('')}</div>` : '<div class="card empty">Aucune fiche ne correspond.</div>';
  };
  $('[data-q]', v).oninput = e => { q = e.target.value; draw(); };
  $$('[data-d]', v).forEach(b => b.onclick = () => { d = b.dataset.d; $$('[data-d]', v).forEach(x => x.classList.toggle('on', x === b)); draw(); });
  $('[data-export]', v).onclick = () => {
    const sh = sheet(`<h2>Exporter le carnet</h2><p class="small muted">${all.length} fiche${all.length > 1 ? 's' : ''}.</p>
      <div class="list"><button class="item" data-x="md">${icon('file')}<span class="grow"><span class="t">Markdown (.md)</span><span class="s" style="display:block">Un seul fichier lisible partout (Obsidian, Notion, Word…)</span></span></button>
      <button class="item" data-x="json">${icon('file')}<span class="grow"><span class="t">JSON</span><span class="s" style="display:block">Pour réimporter ou sauvegarder</span></span></button>
      <button class="item" data-x="print">${icon('file')}<span class="grow"><span class="t">Imprimer / PDF</span><span class="s" style="display:block">Via l'impression du navigateur</span></span></button></div>`);
    sh.el.addEventListener('click', e => {
      const b = e.target.closest('[data-x]');
      if (!b) return;
      const date = new Date().toLocaleDateString('sv-SE');
      if (b.dataset.x === 'md') download(`carnet-sudo-${date}.md`, `# Carnet technique sudo_\n\n` + all.map(ficheMd).join('\n---\n\n'));
      if (b.dataset.x === 'json') download(`carnet-sudo-${date}.json`, JSON.stringify(all.map(({ images, ...f }) => f), null, 1), 'application/json');
      if (b.dataset.x === 'print') printFiches(all);
      sh.close();
    });
  };
  draw();
  paintIcons(v);
}

function printFiches(list) {
  const w = window.open('', '_blank');
  if (!w) { toast('Autorise les fenêtres pour imprimer'); return; }
  w.document.write(`<!doctype html><meta charset="utf-8"><title>Carnet sudo_</title><style>body{font:14px/1.5 -apple-system,system-ui,sans-serif;max-width:760px;margin:30px auto;padding:0 20px;color:#111}h1{font-size:22px;margin-top:36px}pre,code{font-family:ui-monospace,Menlo,monospace;background:#f3f3f3;border-radius:4px}pre{padding:10px;white-space:pre-wrap}.code-head{display:none}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px}img{max-width:100%}</style>${list.map(f => `<h1>${esc(f.titre)}</h1><p><em>${esc(domain(f.domaine).name)}</em></p>${md(f.contenu)}`).join('<hr>')}`);
  w.document.close();
  setTimeout(() => w.print(), 300);
}

// ---------- Une fiche ----------
export async function ficheView(v, id) {
  if (id === 'nouvelle') return editFiche(v, { id: uid(), createdAt: Date.now(), titre: '', domaine: params().d || 'reseau', tags: [], contenu: '', images: [], isNew: true });
  const f = await get('carnet', id);
  if (!f) { v.innerHTML = '<div class="empty">Fiche introuvable. <a href="#/carnet">Retour au carnet</a></div>'; return; }
  if (params().edit) return editFiche(v, f);
  const at = f.source ? await get('ateliers', f.source) : null;
  v.innerHTML = `
    <div class="row" style="margin-bottom:8px"><a class="icon-btn" href="#/carnet" aria-label="Retour au carnet">${icon('back')}</a><span class="grow"></span>
      <a class="btn ghost sm" href="#/fiche/${f.id}?edit=1">Modifier</a><button class="icon-btn" data-more aria-label="Plus d'actions">⋯</button></div>
    <article style="max-width:760px">
      <h1>${esc(f.titre)}</h1>
      <div class="row" style="margin-bottom:16px">${domainTag(f.domaine)}${(f.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}
        ${at ? `<a class="small" href="#/atelier/${at.id}">Atelier : ${esc(at.title)}</a>` : ''}</div>
      <div class="card md">${md(f.contenu || '_Fiche vide._')}</div>
      ${f.images?.length ? `<div class="fiche-imgs">${f.images.map(u => `<img src="${esc(u)}" alt="photo de la fiche">`).join('')}</div>` : ''}
      <div class="row" style="margin-top:14px">
        <button class="btn" data-cards>${icon('copy')}Créer des flashcards</button>
        <a class="btn" href="#/quiz?fiche=${f.id}">${icon('play')}Quiz sur cette fiche</a>
        <button class="btn ghost" data-photo>${icon('camera')}Ajouter une photo</button>
      </div>
    </article>`;
  $('[data-cards]', v).onclick = async e => {
    const b = e.currentTarget;
    b.disabled = true; b.textContent = 'Création des cartes…';
    try {
      const n = await cardsFrom([f], f.domaine);
      toast(n ? `${n} carte${n > 1 ? 's' : ''} ajoutée${n > 1 ? 's' : ''} aux flashcards` : 'Ces cartes existent déjà');
    } catch (err) { toast(err.message, 5000); }
    b.disabled = false; b.innerHTML = icon('copy') + 'Créer des flashcards';
  };
  $('[data-photo]', v).onclick = async () => { const imgs = await pickImages(); if (!imgs.length) return; f.images = [...(f.images || []), ...imgs]; f.updatedAt = Date.now(); await put('carnet', f); ficheView(v, id); };
  $('[data-more]', v).onclick = () => {
    const sh = sheet(`<div class="list">
      <button class="item" data-a="md">${icon('file')}<span class="grow">Exporter en Markdown</span></button>
      <button class="item" data-a="copy">${icon('copy')}<span class="grow">Copier le texte</span></button>
      ${f.images?.length ? `<button class="item" data-a="noimg">${icon('image')}<span class="grow">Retirer les photos</span></button>` : ''}
      <button class="item" data-a="del" style="color:var(--err)">${icon('trash')}<span class="grow">Supprimer la fiche</span></button></div>`);
    sh.el.addEventListener('click', async e => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (!a) return;
      if (a === 'md') download(slug(f.titre) + '.md', ficheMd(f));
      if (a === 'copy') { const { copy } = await import('../ui.js'); copy(ficheMd(f)); }
      if (a === 'noimg') { f.images = []; await put('carnet', f); sh.close(); ficheView(v, id); return; }
      if (a === 'del') { if (!confirm(`Supprimer « ${f.titre} » ?`)) return; await del('carnet', f.id); sh.close(); location.hash = '#/carnet'; return; }
      sh.close();
    });
  };
  paintIcons(v);
}

function editFiche(v, f) {
  v.innerHTML = `
    <div class="row" style="margin-bottom:10px"><a class="icon-btn" href="${f.isNew ? '#/carnet' : '#/fiche/' + f.id}" aria-label="Annuler">${icon('back')}</a><h1 style="margin:0">${f.isNew ? 'Nouvelle fiche' : 'Modifier'}</h1></div>
    <form class="stack" style="max-width:760px" data-f>
      <label class="field">Titre<input class="input" name="titre" value="${esc(f.titre)}" required placeholder="Ex. : VLAN et trunk sur un 2960"></label>
      <div class="grid2">
        <label class="field">Domaine<select class="input" name="domaine">${domainOptions(f.domaine)}</select></label>
        <label class="field">Mots-clés (séparés par des virgules)<input class="input" name="tags" value="${esc((f.tags || []).join(', '))}" placeholder="vlan, trunk, 802.1Q"></label>
      </div>
      <label class="field">Contenu (Markdown : **gras**, listes, \`commande\`, blocs \`\`\`bash, schémas \`\`\`mermaid)<textarea class="input mono" name="contenu" rows="14" style="font-size:14px">${esc(f.contenu)}</textarea></label>
      <div class="row"><button class="btn primary" type="submit">${icon('check')}Enregistrer</button><a class="btn ghost" href="${f.isNew ? '#/carnet' : '#/fiche/' + f.id}">Annuler</a></div>
    </form>`;
  autoGrow($('textarea', v), 640);
  $('[data-f]', v).onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const { isNew, ...rest } = f;
    Object.assign(rest, { titre: fd.get('titre').trim(), domaine: fd.get('domaine'), tags: fd.get('tags').split(',').map(s => s.trim()).filter(Boolean), contenu: fd.get('contenu'), updatedAt: Date.now() });
    await put('carnet', rest);
    toast('Fiche enregistrée');
    location.hash = '#/fiche/' + rest.id;
  };
  paintIcons(v);
}

// Fiches → flashcards (IA rapide, une seule requête).
export async function cardsFrom(fiches, dom) {
  const prof = await getProfile();
  const source = fiches.map(f => `## ${f.titre}\n${f.contenu}`).join('\n\n');
  const n = Math.min(30, Math.max(6, Math.round(source.length / 260)));
  const r = await askJSON({ system: base(prof), prompt: flashcardsPrompt({ source, dom, n }), task: 'fast', onInfo: toast });
  const src = fiches.length === 1 ? { type: 'carnet', id: fiches[0].id } : { type: 'carnet' };
  return addCards((r.cartes || []).map(c => ({ front: c.recto, back: c.verso, domain: DOMAINS.some(x => x.id === c.domaine) ? c.domaine : dom, illus: c.illustration || null, source: src })));
}
