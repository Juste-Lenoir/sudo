// Rappels par notification : flashcards du jour, révisions prévues, examen qui approche,
// vérification d'atelier pas encore réussie. Réglables et désactivables.
// Sans serveur, le navigateur ne peut afficher un rappel que quand l'app tourne
// (ou, sur Android/Chrome avec l'app installée, lors d'une synchronisation périodique).
import { getKV, setKV } from './store.js';
import { context, planFor, dstr, daysBetween } from './plan.js';
import { dueToday } from './srs.js';
import { statusOf } from './views/verif.js';

export const TYPES = {
  cards: 'Flashcards du jour',
  plan: 'Révisions prévues',
  exam: 'Examen qui approche',
  verif: 'Vérification d’atelier pas encore réussie',
};
export async function getReminders() {
  return Object.assign({ on: false, time: '18:00', examDays: 7, types: { cards: true, plan: true, exam: true, verif: true } }, await getKV('reminders', {}));
}
export const saveReminders = r => setKV('reminders', r).then(refreshPlan);

export const supported = () => 'Notification' in window;
export const permission = () => (supported() ? Notification.permission : 'unsupported');

export async function askPermission() {
  if (!supported()) return 'unsupported';
  return Notification.requestPermission();
}

// Messages à envoyer aujourd'hui.
export async function compute() {
  const r = await getReminders();
  const ctx = await context();
  const day = dstr(Date.now());
  const out = [];
  const n = dueToday(ctx.cards, ctx.newSeen).all.length;
  if (r.types.cards && n) out.push({ type: 'cards', title: `${n} flashcard${n > 1 ? 's' : ''} à réviser`, body: 'Quelques minutes suffisent. Ta série de jours continue.', url: '#/flashcards/revue' });
  if (r.types.plan) {
    const p = planFor(day, ctx).tasks.filter(t => t.id !== 'cards');
    if (p.length) out.push({ type: 'plan', title: 'Révisions du jour', body: p.slice(0, 3).map(t => t.title).join(' · '), url: '#/planning' });
  }
  if (r.types.exam) {
    const e = ctx.exams.find(x => x.date >= day);
    const left = e ? daysBetween(day, e.date) : null;
    if (e && left <= r.examDays) out.push({ type: 'exam', title: left === 0 ? `Examen aujourd'hui : ${e.name}` : `${e.name} dans ${left} jour${left > 1 ? 's' : ''}`, body: 'Ton planning est prêt.', url: '#/planning' });
  }
  if (r.types.verif) {
    const a = ctx.ats.find(x => ['À vérifier', 'À retravailler'].includes(statusOf(x).label));
    if (a) out.push({ type: 'verif', title: 'Vérification à réussir', body: `${a.title} : vise la moyenne, puis 20/20.`, url: '#/verif/' + a.id });
  }
  return out;
}

async function show(n) {
  const opts = { body: n.body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'sudo-' + n.type, data: { url: n.url } };
  const reg = await navigator.serviceWorker?.getRegistration?.().catch(() => null);
  if (reg) return reg.showNotification(n.title, opts);
  const x = new Notification(n.title, opts);
  x.onclick = () => { window.focus(); location.hash = n.url; x.close(); };
}

export async function test() {
  if (permission() !== 'granted') throw new Error('Autorise d’abord les notifications.');
  await show({ type: 'test', title: 'sudo_ : rappel de test', body: 'Les rappels fonctionnent sur cet appareil.', url: '#/planning' });
}

// Appelée à l'ouverture puis toutes les 10 minutes : un rappel par type et par jour, après l'heure choisie.
export async function check() {
  const r = await getReminders();
  if (!r.on || permission() !== 'granted') return;
  const now = new Date();
  const [h, m] = r.time.split(':').map(Number);
  if (now.getHours() * 60 + now.getMinutes() < h * 60 + m) return;
  const day = dstr(now);
  const sent = await getKV('reminders-sent', {});
  const done = new Set(sent[day] || []);
  for (const n of await compute()) {
    if (done.has(n.type)) continue;
    try { await show(n); done.add(n.type); } catch { /* notification refusée */ }
  }
  await setKV('reminders-sent', { [day]: [...done] });
}

// Plan du jour lu par le service worker (synchronisation périodique, Android).
export async function refreshPlan() {
  try {
    const r = await getReminders();
    await setKV('notif-plan', { day: dstr(Date.now()), on: r.on, time: r.time, items: r.on ? await compute() : [] });
  } catch { /* rien */ }
}

export async function setup() {
  await refreshPlan();
  check();
  setInterval(check, 10 * 60e3);
  try {
    const reg = await navigator.serviceWorker?.getRegistration?.();
    const r = await getReminders();
    if (r.on && reg?.periodicSync) await reg.periodicSync.register('sudo-rappels', { minInterval: 3 * 3600e3 });
  } catch { /* non disponible : rappels à l'ouverture seulement */ }
}
