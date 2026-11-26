// Planning de révisions : dates d'examen, quoi réviser chaque jour selon les points faibles, rappels.
import { uid } from '../store.js';
import { getExams, saveExams, context, planFor, getDone, setDone, dstr, daysBetween } from '../plan.js';
import { getReminders, saveReminders, TYPES, supported, permission, askPermission, test as testNotif, setup as setupNotif } from '../notify.js';
import { DOMAINS, domain } from '../domains.js';
import { $, $$, esc, icon, paintIcons, toast } from '../ui.js';

export async function planningView(v) {
  const ctx = await context();
  const exams = ctx.exams;
  const rem = await getReminders();
  const t0 = dstr(Date.now());
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return dstr(d); });
  const doneToday = new Set(await getDone(t0));
  const next = exams.find(e => e.date >= t0);
  const plans = days.map(d => ({ d, ...planFor(d, ctx) }));
  const fmt = d => new Date(d + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' });
  const perm = permission();

  v.innerHTML = `
    <div class="row" style="margin-bottom:12px"><a class="icon-btn" href="#/reviser" aria-label="Retour">${icon('back')}</a><h1 style="margin:0">Planning</h1></div>
    <div class="plan-grid">
      <div class="stack">
        ${next ? (() => { const left = daysBetween(t0, next.date); return `<div class="card row">
          <div class="score" style="font-size:44px">${left}</div>
          <div class="grow"><div class="small muted">jour${left > 1 ? 's' : ''} avant</div><strong>${esc(next.name)}</strong><div class="small muted">${fmt(next.date)}</div>
          <div class="row" style="margin-top:6px">${(next.domains || []).map(d => `<span class="tag"><span class="dotc" style="--c:${domain(d).color}"></span>${esc(domain(d).name)}</span>`).join('')}</div></div></div>`; })() : ''}
        ${plans.map((p, i) => `
          <div class="card stack ${i ? 'plan-day' : ''}">
            <div class="row"><strong class="cap">${i === 0 ? 'Aujourd’hui' : fmt(p.d)}</strong><span class="grow"></span>${p.tasks.length ? `<span class="small muted">≈ ${p.tasks.reduce((a, t) => a + t.mins, 0)} min</span>` : ''}</div>
            ${p.tasks.length ? `<div class="plan-tasks">${p.tasks.map(t => i === 0
              ? `<div class="plan-t ${doneToday.has(t.id) ? 'done' : ''}"><input type="checkbox" data-t="${esc(t.id)}" ${doneToday.has(t.id) ? 'checked' : ''} aria-label="Fait"><a href="${t.href}" class="grow"><span class="small muted">${esc(t.kind)}${t.domain ? ` · <span class="dotc" style="--c:${domain(t.domain).color}"></span>` : ''}</span><span class="t">${esc(t.title)}</span></a><span class="small muted mono">${t.mins} min</span></div>`
              : `<div class="plan-t small"><span class="muted" style="min-width:84px">${esc(t.kind)}</span><span class="grow">${esc(t.title)}</span></div>`).join('')}</div>`
              : '<p class="small muted" style="margin:0">Rien de prévu. Ajoute une date d’examen pour un planning ciblé.</p>'}
          </div>`).join('')}
      </div>
      <div class="stack">
        <div class="card stack">
          <h2 style="margin:0">Mes examens</h2>
          ${exams.length ? `<div class="list" style="background:var(--raised)">${exams.map(e => `<div class="item"><span class="grow" style="min-width:0"><span class="t">${esc(e.name)}</span><span class="s" style="display:block">${fmt(e.date)}${e.date < t0 ? ' · passé' : ''}${(e.domains || []).length ? ' · ' + e.domains.map(d => domain(d).name).join(', ') : ''}</span></span><button class="icon-btn" data-delx="${e.id}" aria-label="Supprimer">${icon('trash')}</button></div>`).join('')}</div>` : ''}
          <form class="stack" data-exam>
            <div class="grid2" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">
              <label class="field">Nom<input class="input" name="name" required placeholder="Ex. : CCP 1, Partiel réseau"></label>
              <label class="field">Date<input class="input" type="date" name="date" required min="${t0}"></label>
            </div>
            <div class="field">Domaines (facultatif)<div class="row" style="gap:6px">${DOMAINS.filter(d => d.id !== 'autre').map(d => `<label class="chip chk"><input type="checkbox" name="dom" value="${d.id}"><span class="dotc" style="--c:${d.color}"></span>${esc(d.name)}</label>`).join('')}</div></div>
            <button class="btn" type="submit">${icon('plus')}Ajouter l'examen</button>
          </form>
        </div>
        <div class="card stack">
          <div class="row"><h2 style="margin:0" class="grow">Rappels</h2><label class="switch"><input type="checkbox" data-on ${rem.on ? 'checked' : ''} aria-label="Activer les rappels"><span></span></label></div>
          ${!supported() ? '<p class="small" style="color:var(--hint);margin:0">Ce navigateur ne gère pas les notifications. Sur iPhone : ajoute sudo à l’écran d’accueil (Partager → Sur l’écran d’accueil), puis ouvre-le depuis l’icône.</p>'
            : perm === 'denied' && rem.on ? '<p class="small" style="color:var(--err);margin:0">Notifications bloquées pour sudo. Réautorise-les dans les réglages du navigateur ou du téléphone.</p>'
            : perm !== 'granted' && rem.on ? '<button class="btn primary" data-perm>Autoriser les notifications</button>' : ''}
          <div class="stack" ${rem.on ? '' : 'hidden'} data-opts>
            <label class="field">Heure du rappel<input class="input mono" type="time" data-time value="${rem.time}" style="max-width:140px"></label>
            ${Object.entries(TYPES).map(([k, l]) => `<label class="check" style="padding:0"><input type="checkbox" data-type="${k}" ${rem.types[k] ? 'checked' : ''}><span>${esc(l)}</span></label>`).join('')}
            <label class="field">Prévenir d'un examen<select class="input" data-exd style="max-width:200px">${[3, 7, 14].map(n => `<option value="${n}" ${rem.examDays === n ? 'selected' : ''}>${n} jours avant</option>`).join('')}</select></label>
            ${perm === 'granted' ? '<button class="btn ghost sm" data-test style="align-self:flex-start">Envoyer un rappel de test</button>' : ''}
          </div>
          <p class="small muted" style="margin:0">Sans serveur, le rappel s’affiche quand sudo est ouvert ou en arrière-plan après l’heure choisie (une fois par jour et par type). Sur Android avec l’app installée, Chrome peut aussi le vérifier de temps en temps app fermée. Sur iPhone, installe l’app sur l’écran d’accueil.</p>
        </div>
      </div>
    </div>`;

  $$('[data-t]', v).forEach(c => c.onchange = async () => { await setDone(t0, c.dataset.t, c.checked); c.closest('.plan-t').classList.toggle('done', c.checked); if (c.checked && [...$$('[data-t]', v)].every(x => x.checked)) toast('Révisions du jour terminées. Bravo !'); });
  $('[data-exam]', v).onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    exams.push({ id: uid(), name: fd.get('name').trim(), date: fd.get('date'), domains: fd.getAll('dom') });
    await saveExams(exams);
    toast('Examen ajouté : le planning est recalculé');
    planningView(v);
  };
  $$('[data-delx]', v).forEach(b => b.onclick = async () => { if (!confirm('Supprimer cet examen ?')) return; await saveExams(exams.filter(x => x.id !== b.dataset.delx)); planningView(v); });
  const saveRem = async () => { await saveReminders(rem); };
  $('[data-on]', v).onchange = async e => {
    rem.on = e.target.checked;
    if (rem.on && supported() && permission() === 'default') await askPermission();
    await saveRem();
    if (rem.on) setupNotif();
    planningView(v);
  };
  $('[data-perm]', v)?.addEventListener('click', async () => { await askPermission(); planningView(v); });
  $('[data-time]', v)?.addEventListener('change', async e => { rem.time = e.target.value || '18:00'; await saveRem(); toast('Heure enregistrée'); });
  $$('[data-type]', v).forEach(c => c.onchange = async () => { rem.types[c.dataset.type] = c.checked; await saveRem(); });
  $('[data-exd]', v)?.addEventListener('change', async e => { rem.examDays = +e.target.value; await saveRem(); });
  $('[data-test]', v)?.addEventListener('click', async () => { try { await testNotif(); toast('Rappel envoyé'); } catch (e) { toast(e.message); } });
  paintIcons(v);
}
