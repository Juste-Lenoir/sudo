// Progression : objectifs du jour (anneaux), réussite par domaine, points faibles, badges.
// Tout est calculé sur l'appareil, sans IA.
import { getKV, setKV, dbAll, logActivity, getStreak } from './store.js';
import { DOMAINS } from './domains.js';

export const today = () => new Date().toLocaleDateString('sv-SE');
export const GOALS = { cards: 20, questions: 10, practice: 3 };
export const RINGS = [
  { id: 'cards', label: 'Cartes', unit: 'cartes revues' },
  { id: 'questions', label: 'Questions', unit: 'questions répondues' },
  { id: 'practice', label: 'Pratique', unit: 'exercices (terminal, sous-réseaux, ateliers)' },
];

export async function getGoals() { return Object.assign({}, GOALS, await getKV('goals', {})); }

export async function getDaily() {
  const d = await getKV('daily', {});
  return d[today()] || { cards: 0, questions: 0, practice: 0 };
}

// Ajoute au compteur du jour (et marque le jour comme actif pour la série).
export async function bump(field, k = 1) {
  const d = await getKV('daily', {});
  const t = today();
  const x = d[t] || (d[t] = { cards: 0, questions: 0, practice: 0 });
  x[field] = (x[field] || 0) + k;
  const keep = Object.keys(d).sort().slice(-120);
  await setKV('daily', Object.fromEntries(keep.map(k2 => [k2, d[k2]])));
  await logActivity();
  window.dispatchEvent(new Event('progress-changed'));
}

// Résultats d'un quiz, d'une série de cartes, d'un exercice : réussite par domaine + points faibles.
// items : [{ label, ok }]  (label = la notion ou la question)
export async function record(domain, items, { questions = true } = {}) {
  if (!items.length) return;
  const perf = await getKV('perf', {});
  const p = perf[domain] || (perf[domain] = { ok: 0, n: 0, hist: [] });
  const ok = items.filter(i => i.ok).length;
  p.ok += ok; p.n += items.length;
  const t = today();
  const h = p.hist.find(x => x.d === t) || (p.hist.push({ d: t, ok: 0, n: 0 }), p.hist[p.hist.length - 1]);
  h.ok += ok; h.n += items.length;
  p.hist = p.hist.slice(-60);
  await setKV('perf', perf);

  const weak = await getKV('weak', {});
  for (const it of items) {
    const key = String(it.label || '').trim().slice(0, 140);
    if (!key) continue;
    const w = weak[key] || (weak[key] = { domain, miss: 0, ok: 0, ts: 0 });
    if (it.ok) w.ok++; else w.miss++;
    w.ts = Date.now();
    w.domain = domain;
  }
  // On garde les 300 plus récents.
  const ent = Object.entries(weak).sort((a, b) => b[1].ts - a[1].ts).slice(0, 300);
  await setKV('weak', Object.fromEntries(ent));
  if (questions) await bump('questions', items.length);
}

// Réussite récente d'un domaine (les 30 derniers jours comptent plus).
function accuracy(p) {
  if (!p || !p.n) return null;
  const recent = p.hist.slice(-30).reduce((a, h) => ({ ok: a.ok + h.ok, n: a.n + h.n }), { ok: 0, n: 0 });
  return recent.n >= 3 ? recent.ok / recent.n : p.ok / p.n;
}

// Maîtrise par domaine : moyenne des signaux disponibles (quiz, vérifications d'atelier, flashcards).
export async function domainStats() {
  const [perf, ats, cards] = await Promise.all([getKV('perf', {}), dbAll('ateliers'), dbAll('cards')]);
  return DOMAINS.map(d => {
    const parts = [];
    const acc = accuracy(perf[d.id]);
    if (acc != null) parts.push(acc);
    const dAts = ats.filter(a => a.domain === d.id && a.best != null);
    if (dAts.length) parts.push(dAts.reduce((s, a) => s + a.best, 0) / dAts.length / 20);
    const dCards = cards.filter(c => c.domain === d.id && c.reps > 0);
    if (dCards.length >= 3) parts.push(dCards.filter(c => c.interval >= 7).length / dCards.length * 0.6 + 0.4 * dCards.filter(c => c.lapses === 0).length / dCards.length);
    const mastery = parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : null;
    return { ...d, mastery, n: (perf[d.id]?.n || 0) + dAts.length + dCards.length, acc, ateliers: ats.filter(a => a.domain === d.id).length, cards: cards.filter(c => c.domain === d.id).length };
  });
}

// Points faibles : notions ratées plus souvent que réussies + questions de vérification ratées.
export async function weakPoints(n = 8) {
  const [weak, ats] = await Promise.all([getKV('weak', {}), dbAll('ateliers')]);
  const out = Object.entries(weak)
    .filter(([, w]) => w.miss > w.ok)
    .map(([label, w]) => ({ label, domain: w.domain, score: w.miss - w.ok + w.miss * 0.2, src: 'quiz' }));
  for (const a of ats) {
    for (const [q, m] of Object.entries(a.missed || {})) {
      if (!m.passed) out.push({ label: q, domain: a.domain, score: m.count + 0.5, src: 'verif', atelier: a.id });
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, n);
}

// Badges sobres : gagnés une fois, jamais perdus.
export const BADGES = [
  { id: 'first', label: 'Premier pas', desc: 'Une première activité', test: s => s.days >= 1 },
  { id: 'streak3', label: '3 jours', desc: '3 jours d’affilée', test: s => s.streak >= 3 },
  { id: 'streak7', label: 'Semaine', desc: '7 jours d’affilée', test: s => s.streak >= 7 },
  { id: 'streak30', label: 'Mois', desc: '30 jours d’affilée', test: s => s.streak >= 30 },
  { id: 'rings', label: 'Anneaux', desc: 'Les 3 objectifs du jour remplis', test: s => s.ringsToday },
  { id: 'cards100', label: '100 cartes', desc: '100 révisions de flashcards', test: s => s.totalCards >= 100 },
  { id: 'subnet25', label: 'Binaire', desc: '25 sous-réseaux justes', test: s => s.subnetOk >= 25 },
  { id: 'quiz20', label: '20/20', desc: 'Un quiz parfait', test: s => s.perfectQuiz },
  { id: 'moyenne', label: 'Moyenne', desc: 'Un atelier à 10/20 ou plus', test: s => s.ateliersAvg >= 1 },
  { id: 'maitrise', label: 'Maîtrisé', desc: 'Un atelier à 20/20', test: s => s.ateliersMax >= 1 },
  { id: 'mission', label: 'Mission', desc: 'Une mission du terminal réussie', test: s => s.missions >= 1 },
  { id: 'carnet10', label: 'Carnet', desc: '10 fiches dans le carnet', test: s => s.fiches >= 10 },
];

export async function summary() {
  const [st, daily, goals, all, ats, quizzes, sub, fiches, term, won] = await Promise.all([
    getStreak(), getDaily(), getGoals(), getKV('daily', {}), dbAll('ateliers'), dbAll('quizzes'),
    getKV('subnet', { ok: 0 }), dbAll('carnet'), getKV('terminal-stats', { missions: 0 }), getKV('badges', {}),
  ]);
  const s = {
    ...st, daily, goals,
    ringsToday: RINGS.every(r => (daily[r.id] || 0) >= goals[r.id]),
    totalCards: Object.values(all).reduce((a, d) => a + (d.cards || 0), 0),
    subnetOk: sub.ok || 0,
    perfectQuiz: quizzes.some(q => (q.runs || []).some(r => r.note >= 20)),
    ateliersAvg: ats.filter(a => a.best >= 10).length,
    ateliersMax: ats.filter(a => a.best >= 20).length,
    missions: term.missions || 0,
    fiches: fiches.length,
  };
  let changed = false;
  for (const b of BADGES) if (!won[b.id] && b.test(s)) { won[b.id] = Date.now(); changed = true; }
  if (changed) await setKV('badges', won);
  s.badges = won;
  return s;
}

// Anneaux façon « objectifs du jour » : discrets, en SVG.
export function ringsSVG(daily, goals, size = 96) {
  const r0 = size / 2 - 6, w = 8, gap = 3;
  const colors = ['#4ADE80', '#A3A3A3', '#F5F5F5'];
  const arcs = RINGS.map((ring, i) => {
    const r = r0 - i * (w + gap);
    const c = 2 * Math.PI * r;
    const v = Math.min(1, (daily[ring.id] || 0) / goals[ring.id]);
    return `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#1A1A1A" stroke-width="${w}"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${colors[i]}" stroke-width="${w}" stroke-linecap="round"
        stroke-dasharray="${(v * c).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})" ${v === 0 ? 'opacity="0"' : ''}/>`;
  }).join('');
  return `<svg class="rings" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="Objectifs du jour">${arcs}</svg>`;
}
export const RING_COLORS = ['#4ADE80', '#A3A3A3', '#F5F5F5'];

// Où s'entraîner sur un point faible.
export function weakHref(w) {
  if (w.src === 'verif') return '#/verif/' + w.atelier;
  if (/^Sous-réseaux/.test(w.label)) return '#/sous-reseaux';
  if (/^Terminal/.test(w.label)) return '#/terminal';
  return `#/quiz?sujet=${encodeURIComponent(w.label.slice(0, 120))}&d=${w.domain}`;
}
