// Connexion aux IA (gratuites et payantes) : bascule automatique, choix de l'IA selon la tâche,
// suivi des quotas par jour. Les clés restent sur l'appareil.
import { getKV, setKV } from './store.js';

// Limites gratuites indicatives (elles changent souvent) : modifiables dans les réglages.
export const PROVIDERS = [
  { id: 'gemini', name: 'Gemini', full: 'Google Gemini', type: 'gemini', free: true, vision: true, boxes: true,
    base: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-3.8-flash', alt: ['gemini-flash-latest', 'gemini-3.5-flash', 'gemini-3.1-flash-lite'],
    limits: { rpd: 250 }, reset: 'minuit heure du Pacifique (9 h en France)',
    keyUrl: 'https://aistudio.google.com/apikey', help: 'La meilleure gratuite pour les photos et les consignes. À activer en premier.' },
  { id: 'groq', name: 'Groq', full: 'Groq', type: 'openai', free: true, vision: false,
    base: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-120b', alt: ['openai/gpt-oss-20b', 'qwen/qwen3.8-27b'],
    limits: { rpd: 1000, tpd: 100000 }, reset: 'sur 24 h glissantes',
    keyUrl: 'https://console.groq.com/keys', help: 'Ultra-rapide : parfaite pour les petites tâches et le 2e avis. Ne lit pas les photos.' },
  { id: 'openrouter', name: 'OpenRouter', full: 'OpenRouter', type: 'openai', free: true, vision: true,
    base: 'https://openrouter.ai/api/v1', model: 'google/gemma-4-31b-it:free', alt: ['google/gemma-4-26b-a4b-it:free', 'nvidia/nemotron-3.5-super-vl:free', 'nvidia/nemotron-3-ultra-550b-a55b:free'],
    limits: { rpd: 50 }, reset: 'minuit UTC (1 h en France)',
    keyUrl: 'https://openrouter.ai/keys', help: 'Une clé pour beaucoup de modèles. Les modèles « :free » sont gratuits, mais le quota est petit.' },
  { id: 'mistral', name: 'Mistral', full: 'Mistral AI', type: 'openai', paid: true, vision: true,
    base: 'https://api.mistral.ai/v1', model: 'mistral-small-latest', priceIn: 0.1, priceOut: 0.3,
    limits: {}, reset: 'crédits achetés',
    keyUrl: 'https://console.mistral.ai/api-keys', help: 'IA française, lit les photos. Son API n’est plus gratuite : il faut acheter des crédits (Pay-as-you-go). Prix indicatifs, vérifie-les sur le site.' },
  { id: 'cohere', name: 'Cohere', full: 'Cohere', type: 'openai', free: true, vision: false,
    base: 'https://api.cohere.ai/compatibility/v1', model: 'command-a-plus-05-2026', alt: ['command-a-03-2025'],
    limits: { rpd: 33 }, reset: '1 000 demandes par mois (clé d’essai)',
    keyUrl: 'https://dashboard.cohere.com/api-keys', help: 'Clé d’essai gratuite (1 000 demandes par mois, usage personnel). Une IA de secours de plus. Ne lit pas les photos.' },
  { id: 'ollama', name: 'Ollama', full: 'Ollama (IA locale sur ton Mac)', type: 'openai', free: true, vision: true, noKey: true, local: true,
    base: 'http://localhost:11434/v1', model: 'gemma4:12b', limits: {}, reset: 'illimité',
    keyUrl: 'https://ollama.com/download', help: "Gratuite, illimitée et hors ligne, mais seulement sur le Mac où Ollama tourne (pas sur l'iPhone). « Lister » montre tes modèles installés." },
  { id: 'anthropic', name: 'Claude', full: 'Claude (Anthropic)', type: 'anthropic', paid: true, vision: true, boxes: true,
    base: 'https://api.anthropic.com/v1', model: 'claude-opus-5-5', priceIn: 4, priceOut: 20, limits: {},
    keyUrl: 'https://console.anthropic.com/settings/keys', help: "Payée à l'usage (séparée de l'abonnement claude.ai). Moins cher : claude-haiku-5-5." },
  { id: 'openai', name: 'ChatGPT', full: 'ChatGPT (OpenAI)', type: 'openai', paid: true, vision: true,
    base: 'https://api.openai.com/v1', model: 'gpt-4o-mini', priceIn: 0.15, priceOut: 0.6, limits: {},
    keyUrl: 'https://platform.openai.com/api-keys', help: "Payée à l'usage (séparée de ChatGPT Plus). Vérifie le modèle avec « Lister »." },
];
const FIRST_TOKEN_MS = 35000;
const readSlow = () => { try { return JSON.parse(sessionStorage.getItem('sudo-slow') || '{}'); } catch { return {}; } };
const markSlow = m => { try { const x = readSlow(); x[m] = Date.now() + 15 * 60e3; sessionStorage.setItem('sudo-slow', JSON.stringify(x)); } catch {} };
// Modèle Gemini dont le quota du jour est épuisé : mis de côté jusqu'à la remise à zéro (gardé même si l'app se ferme).
const readCapped = () => { try { const x = JSON.parse(localStorage.getItem('sudo-mquota') || '{}'); for (const k in x) if (x[k] <= Date.now()) delete x[k]; return x; } catch { return {}; } };
const markCapped = (m, until) => { try { const x = readCapped(); x[m] = until; localStorage.setItem('sudo-mquota', JSON.stringify(x)); } catch {} };
// Le modèle principal de cette IA est à sa limite du jour (sudo passe par un autre modèle) : jusqu'à quand.
export const cappedUntil = (id, s) => { const m = s?.providers?.[id]?.model; return (m && readCapped()[m]) || 0; };
const RETIRED = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'meta-llama/llama-3.3-70b-instruct:free'];
export const P = id => PROVIDERS.find(p => p.id === id);

// Quelle IA pour quelle tâche (ménage les quotas) : « rapide » pour les petites tâches,
// « meilleure » pour l'analyse des consignes, les photos et les corrections.
export const TASKS = { fast: 'Petites tâches (indices, QCM, reformulations)', best: 'Analyses, photos et corrections' };

// ---------- Réglages ----------
let cache = null;
export async function getAI() {
  if (cache) return cache;
  const saved = await getKV('ai', {});
  const s = {
    primary: saved.primary || 'gemini',
    routes: Object.assign({ fast: 'groq', best: 'gemini' }, saved.routes),
    budget: saved.budget ?? 5,
    providers: {},
  };
  for (const p of PROVIDERS) {
    const sp = saved.providers?.[p.id] || {};
    // Modèles retirés par les fournisseurs : on passe au modèle par défaut actuel.
    if (RETIRED.includes(sp.model)) delete sp.model;
    if (p.id === 'ollama' && sp.model === 'llama3.2') delete sp.model; // ancien défaut, pas installé
    s.providers[p.id] = {
      enabled: !!sp.enabled, key: sp.key || '', model: sp.model || p.model, base: sp.base || p.base,
      priceIn: sp.priceIn ?? p.priceIn ?? 0, priceOut: sp.priceOut ?? p.priceOut ?? 0,
      rpd: sp.rpd ?? p.limits.rpd ?? null, tpd: sp.tpd ?? p.limits.tpd ?? null,
    };
  }
  cache = s;
  return s;
}
export async function saveAI(s) {
  cache = s;
  await setKV('ai', s);
  window.dispatchEvent(new Event('ai-changed'));
}
// Clés reçues d'un autre de mes appareils (synchronisation) : on relit les réglages.
window.addEventListener('sudo:changed', e => {
  if (e.detail.some(x => x.store === 'kv' && x.id === 'ai')) { cache = null; window.dispatchEvent(new Event('ai-changed')); }
});
export const readyProviders = s => PROVIDERS.filter(p => { const c = s.providers[p.id]; return c.enabled && (p.noKey || c.key); });

// ---------- Suivi de consommation (par jour, 35 jours gardés) ----------
export const dayKey = (d = new Date()) => d.toLocaleDateString('sv-SE');
export async function getUsage() {
  const u = await getKV('usage2', null);
  return u && u.days ? u : { days: {}, last: null, rl: {} };
}
async function addUsage(id, inT, outT, rl) {
  const u = await getUsage();
  const k = dayKey();
  const d = u.days[k] || (u.days[k] = {});
  const x = d[id] || (d[id] = { req: 0, inT: 0, outT: 0 });
  x.req++; x.inT += inT; x.outT += outT;
  u.last = id;
  if (rl) u.rl[id] = { ...rl, at: Date.now() };
  const keep = Object.keys(u.days).sort().slice(-35);
  u.days = Object.fromEntries(keep.map(k2 => [k2, u.days[k2]]));
  await setKV('usage2', u);
  window.dispatchEvent(new Event('usage-changed'));
}
export function todayOf(u, id) {
  return u.days[dayKey()]?.[id] || { req: 0, inT: 0, outT: 0 };
}
// Quota refusé par le fournisseur (429) : le compteur passe à 0 jusqu'à la remise à zéro (par jour)
// ou pendant une minute (limite par minute). Nos estimations ne valent pas la réponse du fournisseur.
const nextReset = id => {
  const d = new Date();
  if (id === 'gemini') { d.setHours(9, 0, 0, 0); if (d <= new Date()) d.setDate(d.getDate() + 1); return +d; } // minuit Pacifique ≈ 9 h
  d.setHours(24, 0, 0, 0); return +d;
};
export async function markQuota(id, msg) {
  const daily = /per ?day|daily|PerDay|quota.*exceeded.*day|RPD/i.test(msg || '');
  const u = await getUsage();
  u.blocked ||= {};
  u.blocked[id] = { until: daily ? nextReset(id) : Date.now() + 65e3, daily };
  await setKV('usage2', u);
  window.dispatchEvent(new Event('usage-changed'));
  return daily;
}
const blockedOf = (u, id) => { const b = u.blocked?.[id]; return b && b.until > Date.now() ? b : null; };

// Part restante aujourd'hui (0 à 1), d'après le fournisseur s'il le dit, sinon nos compteurs.
export function remaining(s, u, id) {
  const p = P(id), c = s.providers[id];
  if (!p || p.paid || id === 'ollama') return { ratio: 1, exact: true, label: id === 'ollama' ? 'illimité' : 'payant' };
  const b = blockedOf(u, id);
  if (b) return { ratio: 0, exact: true, left: 0, limit: c.rpd, blocked: b };
  const rl = u.rl[id];
  if (rl && rl.limit && Date.now() - rl.at < 6 * 3600e3 && dayKey(new Date(rl.at)) === dayKey()) {
    return { ratio: Math.max(0, rl.remaining / rl.limit), exact: true, left: rl.remaining, limit: rl.limit };
  }
  const t = todayOf(u, id);
  const parts = [];
  if (c.rpd) parts.push(1 - t.req / c.rpd);
  if (c.tpd) parts.push(1 - (t.inT + t.outT) / c.tpd);
  if (!parts.length) return { ratio: 1, exact: false };
  const ratio = Math.max(0, Math.min(...parts));
  return { ratio, exact: false, left: c.rpd ? Math.max(0, c.rpd - t.req) : null, limit: c.rpd };
}
export function monthCost(s, u) {
  const m = dayKey().slice(0, 7);
  let total = 0;
  for (const [k, d] of Object.entries(u.days)) {
    if (!k.startsWith(m)) continue;
    for (const [id, x] of Object.entries(d)) {
      const c = s.providers[id];
      if (c && P(id)?.paid) total += (x.inT * (c.priceIn || 0) + x.outT * (c.priceOut || 0)) / 1e6;
    }
  }
  return total;
}
// Les IA les plus utilisées sur les 7 jours précédant aujourd'hui.
export function topLastWeek(u, n = 3) {
  const tot = {};
  for (let i = 1; i <= 7; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    for (const [id, x] of Object.entries(u.days[dayKey(d)] || {})) tot[id] = (tot[id] || 0) + x.req;
  }
  return Object.entries(tot).sort((a, b) => b[1] - a[1]).slice(0, n).map(([id]) => id);
}

// ---------- Utilitaires ----------
async function check(res) {
  if (res.ok) return;
  let msg = res.statusText || 'erreur';
  try {
    const t = await res.text();
    try {
      const j = JSON.parse(t);
      const e = Array.isArray(j) ? j[0]?.error : j.error;
      msg = (typeof e === 'string' ? e : e?.message) || j.message || t.slice(0, 200);
    } catch { msg = t.slice(0, 200) || msg; }
  } catch {}
  const hints = { 401: 'clé API invalide', 403: 'accès refusé', 404: 'modèle introuvable', 429: 'quota atteint' };
  throw Object.assign(new Error(`${res.status}${hints[res.status] ? ' – ' + hints[res.status] : ''} : ${msg}`), { status: res.status });
}
function readRL(res) {
  const h = k => res.headers.get(k);
  const rem = h('x-ratelimit-remaining-requests'), lim = h('x-ratelimit-limit-requests');
  if (rem == null || lim == null) return null;
  return { remaining: +rem, limit: +lim };
}

async function readSSE(res, onData) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).replace(/\r$/, '');
      buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const d = line.slice(5).trim();
      if (!d || d === '[DONE]') continue;
      let j;
      try { j = JSON.parse(d); } catch { continue; }
      onData(j);
    }
  }
}

const splitDataUrl = u => {
  const m = /^data:([^;]+);base64,(.*)$/.exec(u) || [];
  return { mime: m[1] || 'image/jpeg', data: m[2] || '' };
};

// Fusionne les messages consécutifs du même rôle et commence toujours par l'utilisateur.
function normalize(messages, vision) {
  const out = [];
  for (const m of messages) {
    let text = m.text || '';
    let images = m.images || [];
    if (images.length && !vision) { text += '\n[Photo jointe : cette IA ne lit pas les images]'; images = []; }
    const last = out[out.length - 1];
    if (last && last.role === m.role) { last.text += '\n\n' + text; last.images = last.images.concat(images); }
    else out.push({ role: m.role === 'assistant' ? 'assistant' : 'user', text, images: [...images] });
  }
  if (out.length && out[0].role !== 'user') out.unshift({ role: 'user', text: '(début de la conversation)', images: [] });
  return out;
}

// ---------- Appels par type d'API ----------
const CALL = {
  async openai(p, cfg, system, msgs, onDelta, signal) {
    const headers = { 'Content-Type': 'application/json' };
    if (cfg.key) headers.Authorization = `Bearer ${cfg.key}`;
    if (p.id === 'openrouter') { headers['HTTP-Referer'] = location.origin; headers['X-Title'] = 'sudo'; }
    const body = {
      model: cfg.model, stream: true,
      messages: [{ role: 'system', content: system }, ...msgs.map(m => ({
        role: m.role,
        content: m.images.length
          ? [{ type: 'text', text: m.text || ' ' }, ...m.images.map(u => ({ type: 'image_url', image_url: { url: u } }))]
          : m.text,
      }))],
    };
    const res = await fetch(cfg.base.replace(/\/$/, '') + '/chat/completions', { method: 'POST', headers, body: JSON.stringify(body), signal });
    await check(res);
    await readSSE(res, j => {
      if (j.error) throw new Error(j.error.message || 'erreur');
      const t = j.choices?.[0]?.delta?.content;
      if (t) onDelta(t);
    });
    return readRL(res);
  },

  async gemini(p, cfg, system, msgs, onDelta, signal) {
    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: msgs.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [
          ...m.images.map(u => { const { mime, data } = splitDataUrl(u); return { inline_data: { mime_type: mime, data } }; }),
          { text: m.text || ' ' },
        ],
      })),
    };
    const url = `${cfg.base.replace(/\/$/, '')}/models/${encodeURIComponent(cfg.model)}:streamGenerateContent?alt=sse`;
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.key }, body: JSON.stringify(body), signal });
    await check(res);
    await readSSE(res, j => {
      if (j.error) throw new Error(j.error.message || 'erreur');
      const t = (j.candidates?.[0]?.content?.parts || []).filter(x => !x.thought).map(x => x.text || '').join('');
      if (t) onDelta(t);
    });
    return null;
  },

  async anthropic(p, cfg, system, msgs, onDelta, signal) {
    const body = {
      model: cfg.model, max_tokens: 16000, stream: true, system,
      messages: msgs.map(m => ({
        role: m.role,
        content: [
          ...m.images.map(u => { const { mime, data } = splitDataUrl(u); return { type: 'image', source: { type: 'base64', media_type: mime, data } }; }),
          { type: 'text', text: m.text || ' ' },
        ],
      })),
    };
    const res = await fetch(cfg.base.replace(/\/$/, '') + '/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': cfg.key,
        'anthropic-version': '2026-10-21',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body), signal,
    });
    await check(res);
    await readSSE(res, j => {
      if (j.type === 'error') throw new Error(j.error?.message || 'erreur');
      if (j.type === 'content_block_delta' && j.delta?.type === 'text_delta') onDelta(j.delta.text);
      if (j.type === 'message_delta' && j.delta?.stop_reason === 'refusal') onDelta('\n\n_(Claude a refusé de répondre à cette demande.)_');
    });
    return null;
  },
};

// Un appel à UNE IA précise (utilisé par la bascule et par le mode côte à côte).
export async function callOne(id, { system, messages, onDelta = () => {}, signal }) {
  const s = await getAI();
  const p = P(id), cfg = s.providers[id];
  const msgs = normalize(messages, p.vision);
  let got = '';
  const caller = window.__sudoDemo || CALL[p.type];
  // Modèle surchargé (503) ou retiré (404) : on essaie les autres modèles du même fournisseur.
  // Les modèles trop lents récemment passent en dernier pendant 15 minutes.
  const slowMap = readSlow(), capped = readCapped();
  const off = m => (capped[m] ? 2 : slowMap[m] > Date.now() ? 1 : 0);
  const models = [cfg.model, ...(p.alt || []).filter(m => m !== cfg.model)]
    .sort((a, b) => off(a) - off(b));
  let rl = null, used = cfg.model;
  for (const [k, model] of models.entries()) {
    // Si le modèle ne commence pas à répondre en 45 s, on passe au suivant.
    const ac = new AbortController();
    const onAbort = () => ac.abort();
    signal?.addEventListener('abort', onAbort);
    let slow = false;
    const timer = setTimeout(() => { if (!got) { slow = true; ac.abort(); } }, FIRST_TOKEN_MS);
    try {
      rl = await caller(p, { ...cfg, model }, system, msgs, t => { got += t; onDelta(t); }, ac.signal);
      used = model;
      break;
    } catch (e) {
      if (slow && !signal?.aborted) { e = Object.assign(new Error(`${model} ne répond pas (surchargé ?)`), { status: 504 }); }
      if ([503, 504].includes(e.status)) markSlow(model);
      if (e.status === 429 && p.type === 'gemini') { markCapped(model, nextReset(id)); window.dispatchEvent(new Event('usage-changed')); }
      // OpenRouter : un modèle gratuit saturé chez son hébergeur (« Provider returned error ») n'empêche pas les autres.
      if (e.status === 429 && p.id === 'openrouter') markSlow(model);
      // Chaque modèle Gemini a son propre quota : un 429 sur l'un n'empêche pas l'autre.
      const retry = [404, 500, 502, 503, 504].includes(e.status) || (e.status === 429 && (p.type === 'gemini' || p.id === 'openrouter'));
      if (got || k === models.length - 1 || !retry) throw e;
      window.dispatchEvent(new CustomEvent('ai-info', { detail: e.status === 429 ? (p.id === 'openrouter' ? `${p.name} : ${model} saturé, j'essaie ${models[k + 1]}` : `${p.name} : ${model} a fini son quota du jour, je passe à ${models[k + 1]} (rien à faire)`) : `${p.name} : ${model} ${e.status === 404 ? 'indisponible' : 'surchargé'}, j'essaie ${models[k + 1]}` }));
      if (e.status === 503) await new Promise(r => setTimeout(r, 800));
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }
  if (!got.trim()) throw new Error('réponse vide');
  const inChars = system.length + msgs.reduce((a, m) => a + (m.text || '').length, 0);
  const imgs = msgs.reduce((a, m) => a + m.images.length, 0);
  await addUsage(id, Math.round(inChars / 3.5) + imgs * 1300, Math.round(got.length / 3.5), rl);
  return { text: got, provider: id, providerName: p.name, model: used };
}

// ---------- Discussion avec bascule automatique ----------
export async function chat({ system, messages, onDelta = () => {}, onInfo = () => {}, prefer, task, exclude = [], needBoxes = false, signal }) {
  const s = await getAI();
  const u = await getUsage();
  let list = readyProviders(s).filter(p => !exclude.includes(p.id));
  if (!list.length) {
    throw new Error(exclude.length
      ? 'Aucune autre IA configurée. Active une 2e IA dans Réglages.'
      : 'Aucune IA configurée. Va dans Réglages pour ajouter une clé gratuite (Gemini : 2 minutes).');
  }
  const first = prefer || (task && s.routes[task]) || s.primary;
  // Ordre : l'IA demandée, puis celles à qui il reste le plus de quota.
  list.sort((a, b) => (b.id === first) - (a.id === first) || remaining(s, u, b.id).ratio - remaining(s, u, a.id).ratio);
  const hasImg = messages.some(m => m.images?.length);
  if (hasImg) list = [...list.filter(p => p.vision), ...list.filter(p => !p.vision)];
  if (needBoxes) list = [...list.filter(p => p.boxes), ...list.filter(p => !p.boxes)];
  const overBudget = monthCost(s, u) >= (s.budget || 0);
  const errors = [];
  for (const p of list) {
    if (p.paid && overBudget) { errors.push(`${p.name} : budget mensuel atteint`); continue; }
    if (!p.paid && remaining(s, u, p.id).ratio <= 0 && list.length > 1 && p !== list[list.length - 1]) { errors.push(`${p.name} : ${remaining(s, u, p.id).blocked?.daily === false ? "trop de demandes à la minute" : "quota du jour épuisé"}`); continue; }
    let got = '';
    try {
      const r = await callOne(p.id, { system, messages, signal, onDelta: t => { got += t; onDelta(t); } });
      return r;
    } catch (e) {
      if (e.name === 'AbortError') {
        if (got) return { text: got, provider: p.id, providerName: p.name, aborted: true };
        throw e;
      }
      if (got) return { text: got + '\n\n_Réponse interrompue (' + e.message + ')_', provider: p.id, providerName: p.name };
      let msg = e instanceof TypeError ? (p.local ? 'Ollama injoignable (pas lancé, ou pas sur cet appareil)' : 'connexion impossible (réseau)') : e.message;
      if (e.status === 429) msg = (await markQuota(p.id, e.message)) ? 'quota du jour épuisé' : 'trop de demandes à la minute';
      errors.push(`${p.name} : ${msg}`);
      if (list.indexOf(p) < list.length - 1) {
        onInfo(`${p.name} ne répond pas, je passe à une autre IA`);
        window.dispatchEvent(new CustomEvent('ai-fallback', { detail: { from: p.id } }));
      }
    }
  }
  throw new Error('Aucune IA n’a pu répondre.\n' + errors.join('\n'));
}

// ---------- Réponses JSON (analyse de consigne, questions, corrections, photos) ----------
export function extractJSON(t) {
  let s = String(t).replace(/```(?:json)?/gi, '').trim();
  const start = s.search(/[[{]/);
  if (start < 0) throw new Error('Pas de JSON');
  const open = s[start], close = open === '{' ? '}' : ']';
  const end = s.lastIndexOf(close);
  return JSON.parse(s.slice(start, end + 1));
}

export async function askJSON({ system, prompt, images = [], onInfo, signal, exclude, task = 'best', prefer, needBoxes }) {
  const messages = [{ role: 'user', text: prompt, images }];
  const r = await chat({ system, messages, onInfo, signal, exclude, task, prefer, needBoxes });
  try { return Object.assign(extractJSON(r.text), { _by: r.providerName }); }
  catch {
    const r2 = await chat({
      system, signal, onInfo, exclude, task, prefer: r.provider,
      messages: [...messages, { role: 'assistant', text: r.text }, { role: 'user', text: 'Ta réponse n’était pas du JSON valide. Renvoie UNIQUEMENT le JSON demandé, sans texte autour.' }],
    });
    return Object.assign(extractJSON(r2.text), { _by: r2.providerName });
  }
}

// ---------- Tests et liste des modèles ----------
export async function testProvider(id) {
  const r = await callOne(id, { system: 'Tu réponds en un mot.', messages: [{ role: 'user', text: 'Réponds simplement : OK' }] });
  return r.text.trim();
}

export async function listModels(id) {
  const s = await getAI();
  const p = P(id), cfg = s.providers[id];
  const base = cfg.base.replace(/\/$/, '');
  if (p.type === 'gemini') {
    const res = await fetch(`${base}/models?pageSize=200`, { headers: { 'x-goog-api-key': cfg.key } });
    await check(res);
    const j = await res.json();
    return (j.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent')).map(m => m.name.replace(/^models\//, ''));
  }
  const headers = p.type === 'anthropic'
    ? { 'x-api-key': cfg.key, 'anthropic-version': '2026-10-21', 'anthropic-dangerous-direct-browser-access': 'true' }
    : (cfg.key ? { Authorization: `Bearer ${cfg.key}` } : {});
  const res = await fetch(`${base}/models`, { headers });
  await check(res);
  const j = await res.json();
  let ids = (j.data || j.models || []).map(m => m.id || m.name);
  if (p.id === 'openrouter') ids.sort((a, b) => b.endsWith(':free') - a.endsWith(':free'));
  return ids;
}
