// Synchronisation entre mes appareils (Supabase).
// Hors ligne d'abord : tout s'écrit sur l'appareil, chaque modification est notée,
// puis envoyée dès que le réseau est là. En cas de conflit, la modification la plus récente gagne.
// Les photos voyagent à part (fichiers), une seule fois chacune.
import { onWrite, get, putQuiet, delQuiet, dbAll, getKV, setKV, uid } from './store.js';
import { connection, cleanUrl, externalize, internalize, dataToBlob, blobToData } from './cloud.js';

const STORES = ['ateliers', 'carnet', 'verifs', 'photos', 'chats', 'cards', 'quizzes'];
// Réglages et progression partagés. Jamais : clés des IA (« ai »), sessions, compteurs propres à l'appareil.
const KV = ['profile', 'activity', 'daily', 'perf', 'weak', 'goals', 'badges', 'exams', 'plan-done', 'reminders', 'subnet', 'subnet-opt', 'terminal-stats', 'terminal2', 'assistant'];
export const syncable = (s, id) => STORES.includes(s) || (s === 'kv' && KV.includes(id));

const state = { status: 'off', last: 0, error: '', pending: 0 };
export const status = () => ({ ...state });
const emit = () => window.dispatchEvent(new CustomEvent('sync-status', { detail: status() }));
function set(p) { Object.assign(state, p); emit(); }

// ---- Configuration (adresse du projet + clé publique) ----
let cfg;
export async function config() { if (cfg === undefined) cfg = await getKV('cloud', null); return cfg; }
export async function saveConfig(url, key) {
  cfg = url && key ? { url: cleanUrl(url), key: key.trim() } : null;
  await setKV('cloud', cfg);
}
export async function conn() {
  const c = await config();
  if (!c?.url || !c?.key) return null;
  const k = connection(c.url, c.key);
  await k.load();
  return k;
}
export async function account() { const c = await conn(); return c?.user && !c.user.anon ? c.user : null; }

// Identité de cet appareil (non synchronisée).
export async function device() {
  let d = await getKV('device', null);
  if (!d) {
    const ua = navigator.userAgent;
    const name = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'PC Windows' : 'Ordinateur';
    d = { id: uid(), name };
    await setKV('device', d);
  }
  return d;
}

// ---- Noter les modifications locales ----
onWrite((s, id, deleted) => { if (syncable(s, id)) mark(s, id, deleted); });
async function mark(s, rid, deleted) {
  await putQuiet('sync', { id: `r:${s}:${rid}`, s, rid, mtime: Date.now(), dirty: true, del: !!deleted });
  if (state.status !== 'off') { state.pending++; emit(); schedule(); }
}

// Première connexion de cet appareil : tout ce qui existe déjà part en ligne (sans écraser du plus récent).
async function markExisting() {
  if (await get('sync', 'init')) return;
  for (const s of STORES) {
    for (const r of await dbAll(s)) {
      if (await get('sync', `r:${s}:${r.id}`)) continue;
      await putQuiet('sync', { id: `r:${s}:${r.id}`, s, rid: r.id, mtime: r.updatedAt || r.ts || r.createdAt || 1, dirty: true });
    }
  }
  for (const k of KV) {
    if ((await get('kv', k)) && !(await get('sync', `r:kv:${k}`))) await putQuiet('sync', { id: `r:kv:${k}`, s: 'kv', rid: k, mtime: 1, dirty: true });
  }
  await putQuiet('sync', { id: 'init', ts: Date.now() });
}

const uploaded = {
  has: async p => !!(await get('sync', 'up:' + p)),
  add: p => putQuiet('sync', { id: 'up:' + p }),
};

// ---- Recevoir ce qui a changé ailleurs ----
async function pull(c) {
  let cursor = (await get('sync', 'cursor'))?.seq || 0;
  const changed = [];
  for (;;) {
    const rows = await c.select('records', `select=store,rid,data,mtime,deleted,seq&user_id=eq.${c.user.id}&seq=gt.${cursor}&order=seq.asc&limit=50`);
    for (const row of rows) {
      if (!syncable(row.store, row.rid)) continue;
      const id = `r:${row.store}:${row.rid}`;
      const e = await get('sync', id);
      if (e && e.mtime >= row.mtime) continue; // déjà à jour, ou version de cet appareil plus récente
      if (row.deleted) await delQuiet(row.store, row.rid);
      else {
        const local = await get(row.store, row.rid);
        const data = await internalize(c, row.data, local);
        // La série de jours se cumule (aucun appareil ne fait perdre un jour).
        if (row.store === 'kv' && row.rid === 'activity' && local?.value) {
          const all = [...new Set([...(local.value || []), ...(data.value || [])])].sort();
          if (all.length > (data.value || []).length) { data.value = all; await putQuiet(row.store, data); await mark('kv', 'activity'); changed.push(row); continue; }
        }
        await putQuiet(row.store, data);
      }
      await putQuiet('sync', { id, s: row.store, rid: row.rid, mtime: row.mtime, dirty: false });
      changed.push(row);
    }
    if (rows.length) { cursor = rows[rows.length - 1].seq; await putQuiet('sync', { id: 'cursor', seq: cursor }); }
    if (rows.length < 50) break;
  }
  if (changed.length) window.dispatchEvent(new CustomEvent('sudo:changed', { detail: changed.map(r => ({ store: r.store, id: r.rid })) }));
  return changed.length;
}

// ---- Envoyer les modifications de cet appareil ----
async function push(c) {
  const dirty = (await dbAll('sync')).filter(e => e.dirty);
  state.pending = dirty.length; emit();
  for (let i = 0; i < dirty.length; i += 10) {
    const batch = dirty.slice(i, i + 10);
    const rows = [];
    for (const e of batch) {
      const rec = e.del ? null : await get(e.s, e.rid);
      rows.push({ user_id: c.user.id, store: e.s, rid: e.rid, mtime: e.mtime, deleted: !rec, data: rec ? await externalize(c, rec, `u/${c.user.id}`, uploaded) : null });
    }
    await c.upsert('records', rows, 'user_id,store,rid');
    for (const e of batch) {
      const cur = await get('sync', e.id);
      if (cur && cur.mtime === e.mtime) await putQuiet('sync', { ...cur, dirty: false });
    }
    state.pending = Math.max(0, dirty.length - i - batch.length); emit();
  }
}

let running = null, again = false;
export function syncNow() {
  if (running) { again = true; return running; }
  running = (async () => {
    const c = await conn();
    if (!c?.user || c.user.anon) { set({ status: 'off' }); return; }
    if (!navigator.onLine) { set({ status: 'offline' }); return; }
    set({ status: 'syncing', error: '' });
    try {
      await markExisting();
      await pull(c);
      await push(c);
      set({ status: 'ok', last: Date.now() });
    } catch (e) {
      set(e.offline ? { status: 'offline' } : { status: 'error', error: e.message });
      if (e.status === 401 || e.status === 400) { /* session expirée : il faudra se reconnecter */ }
    }
  })().finally(() => { running = null; if (again) { again = false; schedule(); } });
  return running;
}
let timer;
function schedule(ms = 2500) { clearTimeout(timer); timer = setTimeout(syncNow, ms); }

// ---- Photos du téléphone vers l'ordinateur ----
export async function sendPhotos(images) {
  const c = await conn();
  if (!c?.user || c.user.anon) throw new Error('Connecte d’abord cet appareil (Réglages → Synchronisation)');
  const d = await device();
  for (const src of images) {
    const path = `u/${c.user.id}/t/${uid()}.jpg`;
    await c.upload(path, await dataToBlob(src));
    await c.insert('transfers', { user_id: c.user.id, path, note: `${d.id}|${d.name}` });
  }
}
async function receive() {
  const c = await conn();
  if (!c?.user || c.user.anon || document.hidden || !navigator.onLine) return;
  const d = await device();
  let rows;
  try { rows = await c.select('transfers', 'select=id,path,note,created_at&order=created_at.asc&limit=10'); } catch { return; }
  for (const r of rows) {
    const [from, name] = String(r.note).split('|');
    if (from === d.id) continue;
    try {
      const src = await blobToData(await c.download(r.path));
      await c.remove('transfers', `id=eq.${r.id}`);
      c.removeFile(r.path).catch(() => {});
      window.dispatchEvent(new CustomEvent('sudo:photo', { detail: { src, from: name || 'téléphone' } }));
    } catch { /* on réessaiera */ }
  }
}

// ---- Démarrage ----
// Retour du lien de connexion reçu par e-mail : #access_token=… (ou #error_description=… s'il a expiré).
export async function handleAuthHash() {
  if (/error_description=/.test(location.hash)) {
    const p = new URLSearchParams(location.hash.slice(1));
    history.replaceState(null, '', location.pathname + location.search + '#/compte');
    setTimeout(() => window.dispatchEvent(new CustomEvent('ai-info', { detail: /expired|invalid/i.test(p.get('error_description')) ? 'Lien de connexion expiré ou déjà utilisé : redemande un e-mail.' : p.get('error_description') })), 800);
  }
  const q = new URLSearchParams(location.search);
  if (q.has('sb')) {
    if (/access_token=/.test(location.hash)) {
      try { const j = JSON.parse(atob(q.get('sb').replace(/-/g, '+').replace(/_/g, '/'))); if (j.u && j.k) await saveConfig(j.u, j.k); } catch { /* lien abîmé */ }
    }
    q.delete('sb');
    const rest = q.toString();
    history.replaceState(null, '', location.pathname + (rest ? '?' + rest : '') + location.hash);
  }
  if (/access_token=/.test(location.hash)) {
    const p = new URLSearchParams(location.hash.slice(1));
    const c = await conn();
    if (c) { try { await c.fromLink(p); } catch { /* lien périmé */ } }
    history.replaceState(null, '', location.pathname + location.search + '#/compte');
  }
}

export async function startSync() {
  await handleAuthHash();
  const c = await conn();
  if (c?.user && !c.user.anon) set({ status: 'idle' });
  window.addEventListener('online', () => schedule(500));
  window.addEventListener('offline', () => state.status !== 'off' && set({ status: 'offline' }));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(500); else if (state.pending) syncNow(); });
  window.addEventListener('cloud-auth', () => schedule(300));
  setInterval(() => { if (!document.hidden && state.status !== 'off') syncNow(); }, 30000);
  setInterval(receive, 6000);
  schedule(800);
}

// Se déconnecter : les données restent sur l'appareil ; l'état de synchro repart de zéro.
export async function disconnect() {
  const c = await conn();
  await c?.signOut();
  for (const e of await dbAll('sync')) await delQuiet('sync', e.id);
  set({ status: 'off', pending: 0, last: 0 });
}
