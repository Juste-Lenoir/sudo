// Répétition espacée (méthode SM-2 simplifiée) pour les flashcards.
// Une carte bien sue revient de plus en plus tard ; une carte ratée revient tout de suite.
import { dbAll, put, uid } from './store.js';

const DAY = 864e5;
export const NEW_PER_DAY = 20;
const endOfToday = () => { const d = new Date(); d.setHours(23, 59, 59, 999); return d.getTime(); };

export function newCard({ front, back, domain = 'autre', illus = null, source = null, tags = [] }) {
  return { id: uid(), createdAt: Date.now(), front, back, domain, illus, source, tags, due: Date.now(), interval: 0, ease: 2.5, reps: 0, lapses: 0, seen: false };
}

export async function addCards(list) {
  const all = await dbAll('cards');
  const known = new Set(all.map(c => norm(c.front)));
  let n = 0;
  for (const c of list) {
    if (!c.front || !c.back || known.has(norm(c.front))) continue;
    known.add(norm(c.front));
    await put('cards', newCard(c));
    n++;
  }
  return n;
}
const norm = s => String(s).toLowerCase().replace(/\s+/g, ' ').trim();

// grade : 0 = à revoir, 1 = difficile, 2 = bien, 3 = facile
export function schedule(c, grade) {
  const now = Date.now();
  c.seen = true;
  if (grade === 0) {
    c.lapses++; c.reps = 0; c.interval = 0;
    c.ease = Math.max(1.3, c.ease - 0.2);
    c.due = now + 60e3; // revient dans la même séance
  } else {
    if (grade === 1) { c.interval = Math.max(1, Math.round((c.interval || 1) * 1.2)); c.ease = Math.max(1.3, c.ease - 0.15); }
    if (grade === 2) c.interval = c.reps === 0 ? 1 : c.reps === 1 ? 3 : Math.round(c.interval * c.ease);
    if (grade === 3) { c.interval = c.reps === 0 ? 4 : Math.round(Math.max(1, c.interval) * c.ease * 1.3); c.ease += 0.15; }
    c.reps++;
    const d = new Date(now + c.interval * DAY); d.setHours(4, 0, 0, 0);
    c.due = d.getTime();
  }
  c.last = now;
  return c;
}

// Libellé de l'intervalle suivant, affiché sous chaque bouton.
export function preview(c, grade) {
  if (grade === 0) return '1 min';
  const x = schedule({ ...c }, grade);
  return x.interval <= 1 ? '1 j' : x.interval < 30 ? x.interval + ' j' : Math.round(x.interval / 30) + ' mois';
}

// Cartes à revoir maintenant : les cartes déjà vues arrivées à échéance + des nouvelles (limite par jour).
export function dueToday(cards, newSeenToday = 0, domain = null) {
  const end = endOfToday();
  const list = domain ? cards.filter(c => c.domain === domain) : cards;
  const review = list.filter(c => c.seen && c.due <= end).sort((a, b) => a.due - b.due);
  const fresh = list.filter(c => !c.seen).sort((a, b) => a.createdAt - b.createdAt).slice(0, Math.max(0, NEW_PER_DAY - newSeenToday));
  return { review, fresh, all: [...review, ...fresh] };
}

export function forecast(cards, days = 7) {
  const out = [];
  const start = new Date(); start.setHours(0, 0, 0, 0);
  for (let i = 0; i < days; i++) {
    const a = start.getTime() + i * DAY, b = a + DAY;
    out.push(cards.filter(c => c.seen && (i === 0 ? c.due < b : c.due >= a && c.due < b)).length);
  }
  return out;
}
