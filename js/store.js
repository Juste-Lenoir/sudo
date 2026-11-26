// Stockage local (IndexedDB) : tout reste sur l'appareil.
const DB_NAME = 'sudo';
const VERSION = 3;
export const STORES = ['kv', 'ateliers', 'carnet', 'verifs', 'photos', 'chats', 'cards', 'quizzes'];
const INTERNAL = ['sync']; // état de la synchronisation (jamais exporté)

let dbp = null;
function db() {
  if (!dbp) {
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, VERSION);
      r.onupgradeneeded = () => {
        const d = r.result;
        for (const s of [...STORES, ...INTERNAL]) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  return dbp;
}

function tx(store, mode, fn) {
  return db().then(d => new Promise((res, rej) => {
    const t = d.transaction(store, mode);
    const out = fn(t.objectStore(store));
    t.oncomplete = () => res(out instanceof IDBRequest ? out.result : out);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  }));
}

// La synchronisation s'abonne ici pour savoir ce qui a changé sur cet appareil.
const watchers = [];
export const onWrite = fn => watchers.push(fn);
const notify = (s, id, deleted) => { if (s !== 'sync') for (const f of watchers) f(s, id, deleted); };

export const get = (s, id) => tx(s, 'readonly', st => st.get(id));
export const put = (s, obj) => tx(s, 'readwrite', st => st.put(obj)).then(r => { notify(s, obj.id, false); return r; });
export const del = (s, id) => tx(s, 'readwrite', st => st.delete(id)).then(r => { notify(s, id, true); return r; });
// Écritures venues d'un autre appareil : pas de signalement (sinon elles repartiraient).
export const putQuiet = (s, obj) => tx(s, 'readwrite', st => st.put(obj));
export const delQuiet = (s, id) => tx(s, 'readwrite', st => st.delete(id));
export const dbAll = s => tx(s, 'readonly', st => st.getAll());
const clear = s => tx(s, 'readwrite', st => st.clear());

export async function getKV(key, def = null) {
  const r = await get('kv', key);
  return r ? r.value : def;
}
export const setKV = (key, value) => put('kv', { id: key, value });

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ---- Profil ----
export async function getProfile() {
  return Object.assign({ prenom: '', niveau: '', envs: '' }, await getKV('profile', {}));
}
export const saveProfile = p => setKV('profile', p);

// ---- Activité (série de jours) ----
const today = () => new Date().toLocaleDateString('sv-SE'); // AAAA-MM-JJ
export async function logActivity() {
  const a = await getKV('activity', []);
  const d = today();
  if (!a.includes(d)) { a.push(d); await setKV('activity', a.slice(-400)); }
}
export async function getStreak() {
  const a = new Set(await getKV('activity', []));
  let n = 0;
  const d = new Date();
  if (!a.has(d.toLocaleDateString('sv-SE'))) d.setDate(d.getDate() - 1);
  while (a.has(d.toLocaleDateString('sv-SE'))) { n++; d.setDate(d.getDate() - 1); }
  return { streak: n, days: a.size };
}

// ---- Sauvegarde / restauration ----
export async function exportAll(includeKeys) {
  const data = { app: 'sudo', version: 1, date: new Date().toISOString(), stores: {} };
  for (const s of STORES) data.stores[s] = await dbAll(s);
  // Jamais de session de connexion dans un fichier de sauvegarde.
  data.stores.kv = data.stores.kv.filter(r => !String(r.id).startsWith('conn:') && r.id !== 'device');
  if (!includeKeys) {
    const ai = data.stores.kv.find(r => r.id === 'ai');
    if (ai) {
      const copy = JSON.parse(JSON.stringify(ai));
      for (const p of Object.values(copy.value.providers || {})) p.key = '';
      data.stores.kv = data.stores.kv.map(r => (r.id === 'ai' ? copy : r));
    }
  }
  return data;
}

export async function importAll(data, keepKeys = true) {
  if (!data || data.app !== 'sudo') throw new Error("Ce fichier n'est pas une sauvegarde sudo.");
  const currentAI = await getKV('ai', null);
  for (const s of STORES) {
    await clear(s);
    for (const r of data.stores[s] || []) await put(s, r);
  }
  // Si la sauvegarde n'a pas de clés, on garde celles de cet appareil.
  if (keepKeys && currentAI) {
    const ai = await getKV('ai', null);
    if (ai) {
      for (const [id, p] of Object.entries(ai.providers || {})) {
        if (!p.key && currentAI.providers?.[id]?.key) p.key = currentAI.providers[id].key;
      }
      await setKV('ai', ai);
    }
  }
}

export async function clearAll() {
  for (const s of [...STORES, ...INTERNAL]) await clear(s);
}
