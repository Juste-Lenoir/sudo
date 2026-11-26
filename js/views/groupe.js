// Interface des ateliers en groupe : rejoindre, inviter, membres et rôles, notes, qui a fait quoi, compte rendu.
import { getProfile, uid } from '../store.js';
import { chat } from '../ai.js';
import { md } from '../md.js';
import { config, account } from '../sync.js';
import { createGroup, joinGroup, inviteLink, parseInvite, setMyRole, setRoleOf, leaveGroup, timeline, groupRapportPrompt, myName } from '../group.js';
import { $, esc, icon, toast, copy, sheet, download, slug, paintIcons, loading, params } from '../ui.js';

const ago = ts => new Date(ts).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// ---------- #/rejoindre?c=CODE&s=… ----------
export async function rejoindreView(v) {
  const p = params();
  const inv = p.s ? parseInvite(p.s) : null;
  const own = await config();
  const prof = await getProfile();
  v.innerHTML = `
    <div class="row" style="margin-bottom:12px"><a class="icon-btn" href="#/ateliers" aria-label="Retour">${icon('back')}</a><h1 style="margin:0">Rejoindre un groupe</h1></div>
    <form class="card stack" style="max-width:520px" data-join>
      <p class="small muted" style="margin:0">Le créateur du groupe te donne un lien ou un code de 6 caractères. Tu gardes ta propre conversation avec l’assistant et ta propre vérification de fin d’atelier ; tes clés d’IA ne sont jamais partagées.</p>
      <label class="field">Code du groupe<input class="input mono" name="code" required maxlength="6" value="${esc(p.c || '')}" placeholder="ABC234" style="font-size:22px;letter-spacing:4px;text-transform:uppercase;max-width:200px" autocomplete="off"></label>
      <label class="field">Ton prénom (visible par le groupe)<input class="input" name="name" required value="${esc(prof.prenom)}"></label>
      ${!inv && !own ? '<p class="small" style="color:var(--hint);margin:0">Avec un code seul, il faut le lien d’invitation complet (il indique où se trouve le groupe). Demande au créateur de t’envoyer le lien.</p>' : ''}
      <div class="small" data-err style="color:var(--err)"></div>
      <button class="btn primary big" type="submit" ${!inv && !own ? 'disabled' : ''}>Rejoindre</button>
    </form>`;
  paintIcons(v);
  $('[data-join]', v).onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target), err = $('[data-err]', v), btn = e.target.querySelector('[type=submit]');
    const where = inv || own;
    btn.disabled = true; err.textContent = 'Connexion au groupe…';
    try {
      const at = await joinGroup({ code: String(fd.get('code')).trim().toUpperCase(), url: where.url, key: where.key, name: String(fd.get('name')).trim() });
      toast('Bienvenue dans le groupe');
      location.hash = '#/atelier/' + at.id;
    } catch (x) { err.textContent = x.message; btn.disabled = false; }
  };
}

// ---------- Feuille « Groupe » (depuis le menu de l'atelier) ----------
export async function groupSheet(at, onChange) {
  if (!at.group) {
    const acc = await account();
    const sh = sheet(`<div class="row"><h2 style="margin:0">Travailler en groupe</h2><span class="grow"></span><button class="icon-btn" data-close aria-label="Fermer">${icon('x')}</button></div>
      <p class="small">Tes camarades rejoignent avec un code : vous partagez la consigne, le plan, la répartition des étapes et des notes. Chacun garde sa conversation avec l’assistant et sa vérification de fin d’atelier.</p>
      ${acc ? `<button class="btn primary big block" data-create>Créer le groupe</button>` : `<p class="small" style="color:var(--hint)">Pour créer un groupe, connecte d’abord sudo à ton compte Supabase gratuit.</p><a class="btn primary block" href="#/compte">Configurer la synchronisation</a>`}
      <div class="small" data-err style="color:var(--err);margin-top:8px"></div>`);
    $('[data-create]', sh.el)?.addEventListener('click', async e => {
      const btn = e.currentTarget;
      btn.disabled = true; btn.textContent = 'Création…';
      try { await createGroup(at); sh.close(); onChange(); groupSheet(at, onChange); }
      catch (x) { $('[data-err]', sh.el).textContent = x.message; btn.disabled = false; btn.textContent = 'Créer le groupe'; }
    });
    return;
  }
  const link = inviteLink(at);
  const me = at.group.me;
  const members = at.gmembers || [];
  const sh = sheet(`<div class="row"><h2 style="margin:0">Groupe</h2><span class="grow"></span><button class="icon-btn" data-close aria-label="Fermer">${icon('x')}</button></div>
    <div class="card stack" style="background:var(--raised);margin-top:10px">
      <div class="small muted">Code d’invitation</div>
      <div class="mono" style="font-size:34px;letter-spacing:6px;color:var(--brand)">${esc(at.group.code)}</div>
      <div class="row"><button class="btn sm primary" data-share>${icon('share')}Envoyer le lien</button><button class="btn sm" data-cplink>${icon('copy')}Copier le lien</button></div>
      <p class="small muted" style="margin:0">Le lien contient l’adresse du groupe ; le code seul ne suffit pas à un camarade qui n’utilise pas ton projet.</p>
    </div>
    <h3 style="margin:16px 0 8px">Membres · ${members.length}</h3>
    <div class="list" style="background:var(--raised)">${members.map(m => `<div class="item"><div class="grow" style="min-width:0"><div class="t">${esc(m.name || '?')}${m.user_id === me ? ' <span class="muted small">(toi)</span>' : ''}</div>
      ${m.user_id === me || at.group.owner ? `<input class="input sm" data-role="${m.user_id}" value="${esc(m.role)}" placeholder="Rôle (ex. : câblage, config du switch)" style="margin-top:6px">` : `<div class="s">${esc(m.role || 'pas de rôle')}</div>`}</div></div>`).join('')}</div>
    <div class="row" style="margin-top:14px"><button class="btn ghost danger" data-leave>Quitter le groupe</button></div>`);
  $('[data-share]', sh.el).onclick = async () => {
    const text = `Rejoins mon atelier « ${at.title} » sur sudo (code ${at.group.code}) :`;
    if (navigator.share) { try { await navigator.share({ title: 'Atelier sudo', text, url: link }); } catch { /* annulé */ } }
    else copy(link);
  };
  $('[data-cplink]', sh.el).onclick = () => copy(link);
  sh.el.addEventListener('change', async e => {
    const r = e.target.dataset.role;
    if (!r) return;
    try {
      if (r === me) await setMyRole(at, { role: e.target.value.trim() }); else await setRoleOf(at, r, e.target.value.trim());
      const m = members.find(x => x.user_id === r); if (m) m.role = e.target.value.trim();
      toast('Rôle enregistré');
    } catch (x) { toast(x.message); }
  });
  $('[data-leave]', sh.el).onclick = async () => {
    if (!confirm('Quitter le groupe ? L’atelier reste sur ton appareil, mais ne se met plus à jour avec le groupe.')) return;
    await leaveGroup(at); sh.close(); onChange();
  };
}

// ---------- Onglet « Groupe » de l'atelier : notes partagées, qui a fait quoi, compte rendu ----------
export function groupPane(at) {
  const tl = timeline(at);
  return `<div class="stack">
    <div class="row"><span class="small muted grow">Code <span class="mono" style="color:var(--brand)">${esc(at.group.code)}</span> · ${(at.gmembers || []).length} membre(s)</span><button class="btn sm" data-grp>Membres et invitation</button></div>
    <div><div class="label">Notes partagées</div>
      <div class="stack" style="gap:8px">${(at.gnotes || []).map(n => `<div class="card" style="background:var(--raised);padding:10px 12px"><div class="small muted">${esc(n.author)} · ${ago(n.ts)}${n.by === at.group.me ? ` · <button class="link" data-delnote="${esc(n.id)}">supprimer</button>` : ''}</div><div class="md small">${md(n.text)}</div></div>`).join('') || '<p class="small muted" style="margin:0">Aucune note. Partage une adresse IP, un mot de passe de TP, un lien…</p>'}</div>
      <div class="row" style="margin-top:8px;align-items:flex-end"><textarea class="input grow" rows="2" data-note placeholder="Note pour le groupe"></textarea><button class="btn" data-addnote>Ajouter</button></div>
    </div>
    <div><div class="label">Qui a fait quoi</div>
      ${tl.length ? `<div class="list" style="background:var(--raised)">${tl.slice(0, 30).map(e => `<div class="item small"><span class="grow"><b>${esc(e.who)}</b> ${esc(e.what)}</span><span class="muted">${e.ts ? ago(e.ts) : ''}</span></div>`).join('')}</div>` : '<p class="small muted" style="margin:0">Rien pour l’instant.</p>'}
    </div>
    <div class="row"><button class="btn primary" data-grap>${icon('file')}Compte rendu de groupe</button>${at.grapport ? `<span class="small muted">par ${esc(at.grapport.author)} · ${ago(at.grapport.ts)}</span>` : ''}</div>
  </div>`;
}

export async function addNote(at, text) {
  at.gnotes ||= [];
  at.gnotes.push({ id: uid(), text, author: await myName(at), by: at.group.me, ts: Date.now() });
}

export async function groupRapport(at, save) {
  const sh = sheet(`<div class="row"><h2 style="margin:0">Compte rendu de groupe</h2><span class="grow"></span><button class="icon-btn" data-close aria-label="Fermer">${icon('x')}</button></div><div data-out class="md" style="margin-top:10px"></div>`);
  const out = $('[data-out]', sh.el);
  const show = () => {
    out.innerHTML = md(at.grapport.text) + `<div class="row" style="margin-top:14px"><button class="btn" data-cp>${icon('copy')}Copier</button><button class="btn" data-dl>${icon('file')}Télécharger (.md)</button><button class="btn ghost" data-redo>Refaire</button></div>`;
    $('[data-cp]', out).onclick = () => copy(at.grapport.text);
    $('[data-dl]', out).onclick = () => download(slug(at.title) + '-compte-rendu-groupe.md', at.grapport.text);
    $('[data-redo]', out).onclick = gen;
    paintIcons(out);
  };
  async function gen() {
    loading(out, 'Rédaction du compte rendu de groupe');
    let acc = '';
    try {
      const r = await chat({ task: 'best', onInfo: toast, system: 'Tu es formateur en maintenance informatique et réseaux. Tu écris en français clair.', messages: [{ role: 'user', text: groupRapportPrompt(at) }], onDelta: d => { acc += d; out.innerHTML = md(acc, { streaming: true }); } });
      at.grapport = { text: r.text, author: await myName(at), ts: Date.now() };
      await save();
      show();
    } catch (x) { out.innerHTML = `<p class="muted">${esc(x.message)}</p>`; }
  }
  if (at.grapport) show(); else gen();
}
