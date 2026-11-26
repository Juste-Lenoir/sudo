// Planning de révisions : calculé sur l'appareil (sans IA, donc sans quota) à partir
// des dates d'examen, des points faibles par domaine, des flashcards et des vérifications à refaire.
import { getKV, setKV, dbAll } from './store.js';
import { domainStats, weakPoints, weakHref } from './progress.js';
import { dueToday, forecast } from './srs.js';
import { domain } from './domains.js';
import { statusOf } from './views/verif.js';

const DAY = 864e5;
export const dstr = d => new Date(d).toLocaleDateString('sv-SE');
export const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00') - new Date(a + 'T12:00')) / DAY);

export async function getExams() { return (await getKV('exams', [])).sort((a, b) => a.date.localeCompare(b.date)); }
export const saveExams = l => setKV('exams', l);

export async function context() {
  const [cards, stats, weak, exams, ats, fiches, daily] = await Promise.all([
    dbAll('cards'), domainStats(), weakPoints(12), getExams(), dbAll('ateliers'), dbAll('carnet'), getKV('daily', {}),
  ]);
  const newSeen = daily[dstr(Date.now())]?.newCards || 0;
  return { cards, stats, weak, exams, ats, fiches, newSeen };
}

// Tâches proposées pour un jour donné (AAAA-MM-JJ).
export function planFor(day, ctx) {
  const t0 = dstr(Date.now());
  const offset = daysBetween(t0, day);
  const tasks = [];
  // 1. Flashcards
  const nCards = offset === 0 ? dueToday(ctx.cards, ctx.newSeen).all.length : (forecast(ctx.cards, offset + 1)[offset] || 0);
  if (nCards) tasks.push({ id: 'cards', kind: 'Flashcards', title: `Réviser ${nCards} flashcard${nCards > 1 ? 's' : ''}`, mins: Math.ceil(nCards / 4), href: '#/flashcards/revue' });

  // 2. Examen à venir : domaines de l'examen, les plus faibles d'abord
  const exam = ctx.exams.find(e => e.date >= day);
  const left = exam ? daysBetween(day, exam.date) : null;
  const weakness = d => { const s = ctx.stats.find(x => x.id === d); return s?.mastery == null ? 0.55 : 1 - s.mastery; };
  let doms;
  if (exam) doms = (exam.domains?.length ? exam.domains : ctx.stats.filter(s => s.n > 0).map(s => s.id));
  if (!doms?.length) doms = ctx.stats.filter(s => s.n > 0).map(s => s.id);
  if (!doms.length) doms = ['reseau', 'linux', 'windows'];
  doms = [...doms].sort((a, b) => weakness(b) - weakness(a));
  const per = left == null ? 1 : left <= 3 ? 3 : left <= 14 ? 2 : 1;
  const k = Math.min(doms.length, Math.max(per, 2));
  const pick = [];
  for (let i = 0; i < per; i++) pick.push(doms[(offset + i) % k]);
  if (exam && left === 0) {
    tasks.push({ id: 'exam:' + exam.id, kind: 'Examen', title: `Jour J : ${exam.name}. Relis tes fiches, pas de nouveauté.`, mins: 15, href: '#/carnet' + (exam.domains?.[0] ? '?d=' + exam.domains[0] : '') });
  } else if (exam && left === 1) {
    tasks.push({ id: 'blanc:' + exam.id, kind: 'Examen blanc', title: `Examen blanc chronométré : ${exam.name}`, mins: 20, href: `#/quiz?examen=1&sujet=${encodeURIComponent(exam.name)}${exam.domains?.[0] ? '&d=' + exam.domains[0] : ''}` });
  }
  for (const d of [...new Set(pick)]) {
    const name = domain(d).name;
    const hasFiches = ctx.fiches.some(f => f.domaine === d);
    tasks.push({ id: 'quiz:' + d, kind: 'Quiz', domain: d, title: `Quiz ${name} (10 questions)`, mins: 10, href: `#/quiz?d=${d}` });
    if (hasFiches && per > 1) tasks.push({ id: 'fiches:' + d, kind: 'Carnet', domain: d, title: `Relire tes fiches ${name}`, mins: 10, href: `#/carnet?d=${d}` });
    if (d === 'reseau') tasks.push({ id: 'subnet', kind: 'Sous-réseaux', domain: d, title: '5 exercices de sous-réseaux', mins: 10, href: '#/sous-reseaux' });
  }
  // 3. Point faible du jour (rotation)
  if (ctx.weak.length) {
    const w = ctx.weak[Math.abs(offset) % ctx.weak.length];
    if (w.src === 'verif') tasks.push({ id: 'verif:' + w.atelier, kind: 'Vérification', domain: w.domain, title: `Retravailler : « ${w.label.slice(0, 80)} »`, mins: 10, href: '#/verif/' + w.atelier });
    else tasks.push({ id: 'weak:' + w.label.slice(0, 30), kind: 'Point faible', domain: w.domain, title: `Point faible : ${w.label.slice(0, 80)}`, mins: 5, href: weakHref(w) });
  }
  // 4. Vérification d'atelier pas encore réussie (une par jour)
  const toVerif = ctx.ats.filter(a => ['À vérifier', 'À retravailler'].includes(statusOf(a).label));
  if (toVerif.length) {
    const a = toVerif[Math.abs(offset) % toVerif.length];
    if (!tasks.some(t => t.id === 'verif:' + a.id)) tasks.push({ id: 'verif:' + a.id, kind: 'Vérification', domain: a.domain, title: `Vérification : ${a.title}`, mins: 10, href: '#/verif/' + a.id });
  }
  return { tasks, exam, left };
}

export async function getDone(day) { return (await getKV('plan-done', {}))[day] || []; }
export async function setDone(day, id, on) {
  const all = await getKV('plan-done', {});
  const l = new Set(all[day] || []);
  on ? l.add(id) : l.delete(id);
  all[day] = [...l];
  const keep = Object.keys(all).sort().slice(-30);
  await setKV('plan-done', Object.fromEntries(keep.map(k => [k, all[k]])));
}
