// Ateliers en groupe : consigne, plan, répartition des tâches et notes partagés entre élèves.
// Chaque élément (le plan, chaque étape, chaque note) se synchronise séparément :
// deux élèves qui cochent deux étapes différentes ne s'écrasent jamais.
// Restent personnels : la conversation avec l'assistant, les indices, la vérification de fin d'atelier.
import { get, put, uid, dbAll, putQuiet, getProfile } from './store.js';
import { connection, externalize, internalize } from './cloud.js';
import { conn as myConn } from './sync.js';

const META = ['title', 'env', 'domain', 'consigne', 'analysis', 'clarifs', 'schema', 'createdAt'];
const uploaded = { has: async p => !!(await get('sync', 'up:' + p)), add: p => putQuiet('sync', { id: 'up:' + p }) };

export const groupConn = at => connection(at.group.url, at.group.key);
// Mon nom dans le groupe (celui donné en rejoignant), sinon le prénom du profil.
export const myName = async at => (at?.group && memberName(at, at.group.me)) || (await getProfile()).prenom || 'Moi';

function itemsOf(at) {
  const it = { meta: Object.fromEntries(META.map(k => [k, at[k] ?? null])) };
  (at.steps || []).forEach((s, i) => { const { hint, showCmd, ...rest } = s; it['step:' + i] = rest; });
  for (const n of at.gnotes || []) it['note:' + n.id] = n;
  if (at.grapport) it.rapport = at.grapport;
  return it;
}

// Envoie ce qui a changé ici depuis la dernière synchro du groupe.
async function pushGroup(at, c) {
  const items = itemsOf(at);
  at.gsnap ||= {};
  const me = await myName(at);
  const rows = [];
  for (const [k, v] of Object.entries(items)) {
    const str = JSON.stringify(v);
    if (at.gsnap[k] === str) continue;
    rows.push({ k, str, row: { group_id: at.group.id, id: k, data: await externalize(c, v, `g/${at.group.id}`, uploaded), deleted: false, mtime: Date.now(), author: me } });
  }
  for (const k of Object.keys(at.gsnap)) {
    if (!(k in items) && at.gsnap[k] !== null) rows.push({ k, str: null, row: { group_id: at.group.id, id: k, data: null, deleted: true, mtime: Date.now(), author: me } });
  }
  if (!rows.length) return false;
  await c.upsert('group_items', rows.map(r => r.row), 'group_id,id');
  for (const r of rows) at.gsnap[r.k] = r.str;
  return true;
}

// Récupère ce que les autres ont changé.
async function pullGroup(at, c) {
  let changed = false;
  for (;;) {
    const rows = await c.select('group_items', `select=id,data,deleted,author,seq,mtime&group_id=eq.${at.group.id}&seq=gt.${at.gseq || 0}&order=seq.asc&limit=100`);
    for (const r of rows) {
      const k = r.id;
      if (r.deleted) {
        if (k.startsWith('note:')) at.gnotes = (at.gnotes || []).filter(n => 'note:' + n.id !== k);
        if (k === 'rapport') delete at.grapport;
      } else if (k === 'meta') {
        const m = await internalize(c, r.data, Object.fromEntries(META.map(x => [x, at[x]])));
        for (const x of META) if (m[x] != null) at[x] = m[x];
      } else if (k.startsWith('step:')) {
        const i = +k.slice(5), old = at.steps[i] || {};
        at.steps[i] = { ...r.data, hint: old.hint, showCmd: old.showCmd };
      } else if (k.startsWith('note:')) {
        at.gnotes ||= [];
        const j = at.gnotes.findIndex(n => n.id === r.data.id);
        if (j < 0) at.gnotes.push(r.data); else at.gnotes[j] = r.data;
        at.gnotes.sort((a, b) => a.ts - b.ts);
      } else if (k === 'rapport') at.grapport = r.data;
      const now = itemsOf(at)[k];
      at.gsnap[k] = now === undefined ? null : JSON.stringify(now);
      at.gseq = r.seq;
      changed = true;
    }
    if (rows.length < 100) break;
  }
  at.steps = (at.steps || []).filter(Boolean);
  return changed;
}

async function pullMembers(at, c) {
  const m = await c.select('group_members', `select=user_id,name,role&group_id=eq.${at.group.id}&order=joined_at.asc`);
  const str = JSON.stringify(m);
  if (str === JSON.stringify(at.gmembers || [])) return false;
  at.gmembers = m;
  return true;
}

// Synchro complète d'un atelier de groupe. Renvoie true si quelque chose a changé ici.
// Normalement on envoie d'abord (mes modifications gagnent si elles sont plus récentes) ;
// un appareil qui vient de rejoindre reçoit d'abord, sinon son atelier vide écraserait celui du groupe.
export async function syncGroup(at, { members = true, pullFirst = false } = {}) {
  const c = groupConn(at);
  await c.load();
  if (!c.user) throw new Error('Rejoins à nouveau le groupe avec son code');
  let changed = pullFirst ? await pullGroup(at, c) : false;
  const pushed = await pushGroup(at, c);
  if (!pullFirst) changed = await pullGroup(at, c);
  if (members) changed = (await pullMembers(at, c)) || changed;
  if (changed) at.updatedAt = Date.now();
  if (changed || pushed) await put('ateliers', at);
  return changed;
}

// Transformer un atelier en atelier de groupe (compte e-mail obligatoire).
export async function createGroup(at) {
  const c = await myConn();
  if (!c?.user || c.user.anon) throw new Error('Connecte d’abord sudo à ton compte (Réglages → Synchronisation)');
  const r = await c.rpc('create_group', { p_name: at.title, p_member: await myName() });
  at.group = { id: r.id, code: r.code, url: c.url, key: c.key, me: c.user.id, owner: true };
  at.gsnap = {}; at.gseq = 0; at.gnotes ||= [];
  await syncGroup(at);
  return at;
}

export function inviteLink(at) {
  const s = btoa(JSON.stringify({ u: at.group.url, k: at.group.key })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${location.origin}${location.pathname}#/rejoindre?c=${at.group.code}&s=${s}`;
}
export function parseInvite(s) {
  try { const j = JSON.parse(atob(s.replace(/-/g, '+').replace(/_/g, '/'))); return { url: j.u, key: j.k }; } catch { return null; }
}

// Rejoindre avec un code : sans e-mail, un compte invité est créé sur le projet du groupe.
export async function joinGroup({ code, url, key, name }) {
  const c = connection(url, key);
  await c.load();
  if (!c.user) await c.signInGuest();
  const r = await c.rpc('join_group', { p_code: code, p_member: name });
  const prof = await getProfile();
  if (!prof.prenom && name) { const { saveProfile } = await import('./store.js'); await saveProfile({ ...prof, prenom: name }); }
  const existing = (await dbAll('ateliers')).find(a => a.group?.id === r.id);
  const at = existing || { id: uid(), createdAt: Date.now(), updatedAt: Date.now(), title: r.name || 'Atelier de groupe', domain: 'autre', consigne: { text: '', images: [] }, chat: [], notes: '', view: 'etabli', steps: [], clarifs: [], photos: [], gnotes: [] };
  at.group = { id: r.id, code: r.code, url: c.url, key: c.key, me: c.user.id, owner: false };
  at.gsnap ||= {}; at.gseq ||= 0;
  await syncGroup(at, { pullFirst: !existing });
  if (!at.steps.length && !at.consigne?.text) throw new Error('Ce groupe n’a pas encore de plan : demande à son créateur d’ouvrir l’atelier une fois.');
  return at;
}

export async function setMyRole(at, { name, role }) {
  const c = groupConn(at);
  const patch = {};
  if (name != null) patch.name = name;
  if (role != null) patch.role = role;
  await c.update('group_members', `group_id=eq.${at.group.id}&user_id=eq.${c.user.id}`, patch);
}
export async function setRoleOf(at, userId, role) {
  await groupConn(at).update('group_members', `group_id=eq.${at.group.id}&user_id=eq.${userId}`, { role });
}

export async function leaveGroup(at) {
  const c = groupConn(at);
  try { await c.remove('group_members', `group_id=eq.${at.group.id}&user_id=eq.${c.user.id}`); } catch { /* hors ligne */ }
  delete at.group; delete at.gsnap; delete at.gseq; delete at.gmembers;
  await put('ateliers', at);
}

export const memberName = (at, id) => (at.gmembers || []).find(m => m.user_id === id)?.name || '';

// Qui a fait quoi : étapes faites et notes, dans l'ordre.
export function timeline(at) {
  const ev = [];
  (at.steps || []).forEach((s, i) => { if (s.done && s.doneBy) ev.push({ ts: s.doneAt || 0, who: s.doneBy, what: `a terminé l’étape ${i + 1} · ${s.titre}` }); });
  for (const n of at.gnotes || []) ev.push({ ts: n.ts, who: n.author, what: 'a ajouté une note' });
  return ev.sort((a, b) => b.ts - a.ts);
}

export function groupRapportPrompt(at) {
  const who = id => memberName(at, id) || '?';
  const members = (at.gmembers || []).map(m => `- ${m.name || '?'}${m.role ? ' (' + m.role + ')' : ''}`).join('\n');
  const steps = at.steps.map((s, i) => `${i + 1}. [${s.done ? 'fait' : 'non fait'}] ${s.titre}${s.assignee ? ' — chargé : ' + who(s.assignee) : ''}${s.doneBy ? ' — fait par ' + s.doneBy : ''}${(s.releves || []).length ? ' — ' + s.releves.map(r => `${r.champ} : ${r.valeur || '[à compléter]'}`).join(', ') : ''}`).join('\n');
  const notes = (at.gnotes || []).map(n => `- ${n.author} : ${n.text}`).join('\n');
  return `Rédige le COMPTE RENDU DE TP DE GROUPE de cet atelier (clair, professionnel, niveau technicien, à la première personne du pluriel). Termes techniques en anglais comme dans les logiciels.
N'invente AUCUN résultat absent des éléments ci-dessous : écris [à compléter] quand une information manque.

Atelier : ${at.title}
Date : ${new Date(at.createdAt).toLocaleDateString('fr-FR')}
Consigne :
"""
${at.consigne?.text || '(consigne en photo)'}
"""
${at.analysis?.reformulation ? 'Objectif : ' + at.analysis.reformulation + '\n' : ''}Membres du groupe et rôles :
${members || '(non renseigné)'}
Étapes, répartition et relevés :
${steps || '(aucune)'}
Notes partagées :
${notes || '(aucune)'}

Structure en Markdown :
# Compte rendu de groupe – titre
## Contexte et objectifs
## Organisation du groupe (tableau : membre, rôle, tâches réalisées)
## Déroulement (étapes, commandes dans des blocs de code, résultats obtenus)
## Résultats (tableau des relevés)
## Analyse des résultats
## Difficultés rencontrées et solutions
## Conclusion`;
}
