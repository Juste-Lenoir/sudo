// Connexion à un projet Supabase (sans bibliothèque : de simples requêtes HTTP).
// La clé « publishable / anon » est publique par conception : la sécurité vient des règles RLS
// (chacun ne voit que ses données ou celles de ses groupes). Les clés des IA ne passent jamais ici.
import { getKV, setKV } from './store.js';

const conns = new Map();
export const hostOf = url => { try { return new URL(url).host; } catch { return ''; } };

export function cleanUrl(u) {
  u = String(u || '').trim().replace(/\/+$/, '');
  if (u && !/^https?:\/\//.test(u)) u = 'https://' + u;
  return u.replace(/\/(rest|auth)\/v1.*$/, '');
}

export function connection(url, key) {
  url = cleanUrl(url);
  const id = hostOf(url);
  let c = conns.get(id);
  if (c && c.key === key) return c;
  c = new Conn(url, key);
  conns.set(id, c);
  return c;
}

class Conn {
  constructor(url, key) { this.url = url; this.key = key; this.kvKey = 'conn:' + hostOf(url); this.session = null; this.loaded = null; }

  async load() {
    if (!this.loaded) this.loaded = getKV(this.kvKey, null).then(s => { this.session = s; });
    await this.loaded;
    return this.session;
  }
  async setSession(s) {
    this.session = s ? { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at || Math.floor(Date.now() / 1000) + (s.expires_in || 3600), user: { id: s.user?.id, email: s.user?.email || '', anon: !!s.user?.is_anonymous } } : null;
    this.loaded = Promise.resolve();
    await setKV(this.kvKey, this.session);
    window.dispatchEvent(new CustomEvent('cloud-auth', { detail: this.url }));
  }
  get user() { return this.session?.user || null; }

  async raw(path, { method = 'GET', body, headers = {}, auth = true, type = 'json' } = {}) {
    const h = { apikey: this.key, ...headers };
    if (auth && this.session) h.Authorization = 'Bearer ' + this.session.access_token;
    if (body !== undefined && !(body instanceof Blob)) { h['Content-Type'] = 'application/json'; body = JSON.stringify(body); }
    let r;
    try { r = await fetch(this.url + path, { method, headers: h, body }); }
    catch { throw Object.assign(new Error('Pas de connexion au serveur de synchronisation'), { offline: true }); }
    if (!r.ok) {
      let msg = '';
      try { const j = await r.json(); msg = j.msg || j.message || j.error_description || j.error || ''; } catch { /* rien */ }
      throw Object.assign(new Error(frMsg(msg, r.status)), { status: r.status });
    }
    if (type === 'blob') return r.blob();
    const t = await r.text();
    return t ? JSON.parse(t) : null;
  }

  // Jeton valide (renouvelé une minute avant son expiration).
  async ensure() {
    await this.load();
    if (!this.session) throw Object.assign(new Error('Non connecté'), { status: 401 });
    if (this.session.expires_at - 60 > Date.now() / 1000) return;
    if (!this._refreshing) {
      this._refreshing = this.raw('/auth/v1/token?grant_type=refresh_token', { method: 'POST', auth: false, body: { refresh_token: this.session.refresh_token } })
        .then(s => this.setSession(s))
        .catch(async e => { if (e.status && e.status < 500) await this.setSession(null); throw e; })
        .finally(() => { this._refreshing = null; });
    }
    await this._refreshing;
  }

  async req(path, opts = {}) {
    await this.ensure();
    try { return await this.raw(path, opts); }
    catch (e) {
      if (e.status !== 401) throw e;
      this.session.expires_at = 0; // jeton refusé : on le renouvelle une fois
      await this.ensure();
      return this.raw(path, opts);
    }
  }

  // ---- Connexion ----
  // L'e-mail contient un lien (et un code si le modèle d'e-mail le prévoit). Le lien ramène dans sudo.
  sendCode(email) {
    const back = encodeURIComponent(location.origin + location.pathname);
    return this.raw('/auth/v1/otp?redirect_to=' + back, { method: 'POST', auth: false, body: { email, create_user: true } });
  }
  // Lien de l'e-mail collé dans sudo (utile sur iPhone : le lien s'ouvrirait dans Safari, pas dans l'app installée).
  async verifyLink(link) {
    let u;
    try { u = new URL(String(link).trim()); } catch { throw new Error('Ce n’est pas un lien : appui long sur le lien de l’e-mail → Copier, puis colle-le ici.'); }
    const token = u.searchParams.get('token') || u.searchParams.get('token_hash');
    if (!token) throw new Error('Ce lien ne contient pas de jeton de connexion.');
    const types = [u.searchParams.get('type'), 'magiclink', 'signup', 'email'].filter((t, i, a) => t && a.indexOf(t) === i);
    let s, last;
    for (const type of types) {
      try { s = await this.raw('/auth/v1/verify', { method: 'POST', auth: false, body: { type, token_hash: token } }); break; } catch (e) { last = e; }
    }
    if (!s) throw last;
    await this.setSession(s);
    return this.user;
  }
  async verifyCode(email, token) {
    let s;
    try { s = await this.raw('/auth/v1/verify', { method: 'POST', auth: false, body: { type: 'email', email, token } }); }
    catch { s = await this.raw('/auth/v1/verify', { method: 'POST', auth: false, body: { type: 'signup', email, token } }); }
    await this.setSession(s);
    return this.user;
  }
  async signInGuest() {
    const s = await this.raw('/auth/v1/signup', { method: 'POST', auth: false, body: {} });
    await this.setSession(s);
    return this.user;
  }
  async signOut() {
    try { await this.req('/auth/v1/logout', { method: 'POST' }); } catch { /* hors ligne : on oublie quand même */ }
    await this.setSession(null);
  }
  async fromLink(params) {
    await this.setSession({ access_token: params.get('access_token'), refresh_token: params.get('refresh_token'), expires_in: +params.get('expires_in') || 3600 });
    const u = await this.req('/auth/v1/user');
    await this.setSession({ ...this.session, expires_in: this.session.expires_at - Math.floor(Date.now() / 1000), user: u });
  }

  // ---- Données ----
  select(table, query) { return this.req(`/rest/v1/${table}?${query}`); }
  upsert(table, rows, onConflict) {
    return this.req(`/rest/v1/${table}${onConflict ? '?on_conflict=' + onConflict : ''}`, { method: 'POST', body: rows, headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } });
  }
  insert(table, row) { return this.req(`/rest/v1/${table}`, { method: 'POST', body: row, headers: { Prefer: 'return=representation' } }).then(r => r?.[0]); }
  update(table, query, patch) { return this.req(`/rest/v1/${table}?${query}`, { method: 'PATCH', body: patch, headers: { Prefer: 'return=minimal' } }); }
  remove(table, query) { return this.req(`/rest/v1/${table}?${query}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }); }
  rpc(fn, args) { return this.req(`/rest/v1/rpc/${fn}`, { method: 'POST', body: args }); }

  // ---- Fichiers (photos) ----
  upload(path, blob) { return this.req(`/storage/v1/object/sudo/${path}`, { method: 'POST', body: blob, headers: { 'Content-Type': blob.type || 'image/jpeg', 'x-upsert': 'true' } }); }
  download(path) { return this.req(`/storage/v1/object/authenticated/sudo/${path}`, { type: 'blob' }); }
  removeFile(path) { return this.req(`/storage/v1/object/sudo`, { method: 'DELETE', body: { prefixes: [path] } }); }
}

function frMsg(m, status) {
  const s = String(m || '');
  if (/rate limit|too many|security purposes/i.test(s)) return 'Trop de demandes : attends quelques minutes (limite d’envoi d’e-mails de Supabase).';
  if (/expired|invalid/i.test(s) && /token|otp/i.test(s)) return 'Code incorrect ou expiré : redemande un code.';
  if (/anonymous sign-ins are disabled/i.test(s)) return 'Les comptes invités ne sont pas activés sur ce projet (Authentication → Sign In / Providers → Allow anonymous sign-ins).';
  if (/relation .* does not exist|Could not find the table|schema cache/i.test(s)) return 'Les tables n’existent pas : lance le script supabase.sql dans le SQL Editor.';
  if (/Invalid API key|No API key/i.test(s)) return 'Clé Supabase refusée : recopie la clé « publishable » (ou « anon »).';
  if (status === 404 && !s) return 'Adresse du projet introuvable : vérifie le Project URL.';
  return s || `Erreur du serveur (${status})`;
}

// ---- Images : les photos voyagent en fichiers, pas dans les données ----
const MARK = 'sudo-img:';
export async function hashOf(str) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(b)].slice(0, 16).map(x => x.toString(16).padStart(2, '0')).join('');
}
const isImg = s => typeof s === 'string' && s.startsWith('data:image/') && s.length > 3000;
export const dataToBlob = d => fetch(d).then(r => r.blob());
export const blobToData = b => new Promise((res, rej) => { const f = new FileReader(); f.onload = () => res(f.result); f.onerror = () => rej(f.error); f.readAsDataURL(b); });

function walk(o, fn) {
  if (Array.isArray(o)) return Promise.all(o.map((x, i) => (typeof x === 'string' ? fn(x).then(v => { o[i] = v; }) : x && typeof x === 'object' ? walk(x, fn) : null)));
  return Promise.all(Object.keys(o).map(k => { const x = o[k]; return typeof x === 'string' ? fn(x).then(v => { o[k] = v; }) : x && typeof x === 'object' ? walk(x, fn) : null; }));
}

// Remplace chaque image par une référence ; envoie les fichiers qui manquent (une seule fois par image).
export async function externalize(conn, obj, prefix, uploaded) {
  const copy = JSON.parse(JSON.stringify(obj));
  await walk(copy, async s => {
    if (!isImg(s)) return s;
    const h = await hashOf(s);
    const path = `${prefix}/${h}`;
    if (!(await uploaded.has(path))) { await conn.upload(path, await dataToBlob(s)); await uploaded.add(path); }
    return MARK + path;
  });
  return copy;
}

// Remet les images dans l'objet : reprises de la version locale si possible, sinon téléchargées.
export async function internalize(conn, obj, local) {
  const known = new Map();
  if (local) await walk(JSON.parse(JSON.stringify(local)), async s => { if (isImg(s)) known.set(await hashOf(s), s); return s; });
  const copy = JSON.parse(JSON.stringify(obj));
  await walk(copy, async s => {
    if (typeof s !== 'string' || !s.startsWith(MARK)) return s;
    const path = s.slice(MARK.length);
    const h = path.split('/').pop();
    if (known.has(h)) return known.get(h);
    try { const d = await blobToData(await conn.download(path)); known.set(h, d); return d; }
    catch { return ''; }
  });
  return copy;
}
