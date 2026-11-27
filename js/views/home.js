// Aujourd'hui : reprendre l'atelier en cours, vérifications à faire, accès rapides.
import { dbAll, getProfile, getStreak } from '../store.js';
import { getAI, readyProviders } from '../ai.js';
import { esc, icon, domainTag, paintIcons } from '../ui.js';
import { statusOf } from './verif.js';
import { summary, ringsSVG, RINGS, RING_COLORS } from '../progress.js';
import { context, planFor, getDone, dstr, daysBetween } from '../plan.js';

export async function homeView(v) {
  const [prof, ats, s, st, fiches, repairs] = await Promise.all([getProfile(), dbAll('ateliers'), getAI(), getStreak(), dbAll('carnet'), dbAll('repairs')]);
  const openRepairs = repairs.filter(r => !['repare', 'pas_repare'].includes(r.resultat)).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const ready = readyProviders(s);
  const [sum, ctx] = await Promise.all([summary(), context()]);
  const day = dstr(Date.now());
  const plan = planFor(day, ctx);
  const doneT = new Set(await getDone(day));
  const todo = plan.tasks.filter(t => !doneT.has(t.id));
  const nextExam = ctx.exams.find(e => e.date >= day);
  ats.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const inProgress = ats.filter(a => (a.steps || []).some(x => !x.done));
  const toCheck = ats.filter(a => { const x = statusOf(a); return x.label === 'À vérifier' || x.label === 'À retravailler' || x.label === 'Moyenne atteinte'; });
  const cur = inProgress[0];
  const h = new Date().getHours();
  const hello = h < 18 ? 'Bonjour' : 'Bonsoir';
  v.innerHTML = `
    <div class="small muted" style="text-transform:uppercase;letter-spacing:.4px">${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
    <div class="row" style="margin-bottom:18px"><h1 style="margin:0">${hello}${prof.prenom ? ' ' + esc(prof.prenom) : ''}</h1><span class="grow"></span>
      ${st.streak ? `<span class="tag ok" title="Jours d'activité d'affilée">${st.streak} jour${st.streak > 1 ? 's' : ''} d'affilée</span>` : ''}</div>
    <div class="home-grid"><div class="stack">
      ${!ready.length ? `<div class="card stack" style="border:1px solid var(--brand)">
        <h2 style="margin:0">Connecte une IA gratuite</h2>
        <p class="muted" style="margin:0">Il faut une clé Gemini (gratuite, 2 minutes) pour que sudo lise tes consignes et tes photos.</p>
        <a class="btn primary" href="#/reglages">${icon('key')}Ajouter une clé</a></div>` : ''}
      ${cur ? (() => {
        const done = cur.steps.filter(x => x.done).length;
        const next = cur.steps.find(x => !x.done);
        return `<div class="card stack">
          <div class="label" style="margin:0">Reprendre</div>
          <div class="row"><strong style="font-size:18px">${esc(cur.title)}</strong>${domainTag(cur.domain)}</div>
          <div class="progress" style="grid-template-columns:repeat(${cur.steps.length},1fr)">${cur.steps.map(x => `<span class="${x.done ? 'd' : x === next ? 'c' : ''}"></span>`).join('')}</div>
          <div class="small muted">Étape ${done + 1} sur ${cur.steps.length} : ${esc(next?.titre || '')}</div>
          <div class="row"><a class="btn primary" href="#/atelier/${cur.id}">Continuer</a><a class="btn ghost" href="#/atelier/${cur.id}?vue=focus" data-focus="${cur.id}">${icon('focus')}Mode Focus</a></div>
        </div>`;
      })() : ''}
      <div class="card stack">
        <div class="row" style="flex-wrap:nowrap;gap:16px"><a href="#/progression" aria-label="Progression">${ringsSVG(sum.daily, sum.goals, 76)}</a>
          <div class="grow" style="min-width:0"><div class="label" style="margin:0 0 4px">À réviser aujourd'hui</div>
            <div class="small muted">${RINGS.map((r, i) => `<span style="white-space:nowrap;margin-right:10px"><span class="dotc" style="--c:${RING_COLORS[i]}"></span> ${r.label} <b class="mono" style="color:var(--text)">${sum.daily[r.id] || 0}/${sum.goals[r.id]}</b></span>`).join('')}</div>
            ${nextExam ? `<div class="small" style="margin-top:4px">${esc(nextExam.name)} dans <b class="mono">${daysBetween(day, nextExam.date)}</b> j</div>` : ''}</div></div>
        ${todo.length ? `<div class="list" style="background:var(--raised)">${todo.slice(0, 4).map(t => `<a class="item" href="${t.href}"><span class="grow" style="min-width:0"><span class="small muted">${esc(t.kind)}</span><span class="t" style="display:block">${esc(t.title)}</span></span><span class="small muted mono">${t.mins} min</span></a>`).join('')}</div>`
          : `<p class="small muted" style="margin:0">${plan.tasks.length ? 'Révisions du jour terminées.' : 'Rien de prévu : fais un quiz ou ajoute une date d’examen.'}</p>`}
        <div class="row"><a class="btn sm" href="#/planning">Planning</a><a class="btn sm ghost" href="#/reviser">Tout réviser</a>${fiches.length ? `<a class="btn sm ghost" href="#/carnet">Carnet (${fiches.length})</a>` : ''}</div>
      </div>
      ${toCheck.length ? `<div><div class="label">Vérifications</div><div class="list">${toCheck.slice(0, 6).map(a => { const x = statusOf(a); return `<a class="item" href="#/verif/${a.id}"><span class="grow"><span class="t">${esc(a.title)}</span></span><span class="tag ${x.cls}">${x.label}${a.best != null ? ' · ' + a.best + '/20' : ''}</span></a>`; }).join('')}</div></div>` : ''}
    </div><div class="stack">
      <div class="quick">
        <a class="card row" style="flex-wrap:nowrap;color:var(--text)" href="#/atelier/nouveau">${icon('plus')}<div class="grow"><strong>Nouvel atelier</strong><div class="small muted">Consigne en photo, dictée ou texte</div></div></a>
        <a class="card row" style="flex-wrap:nowrap;color:var(--text)" href="#/photo">${icon('camera')}<div class="grow"><strong>Analyser une photo</strong><div class="small muted">Composant, câble, port, écran</div></div></a>
        <a class="card row" style="flex-wrap:nowrap;color:var(--text)" href="#/assistant">${icon('chat')}<div class="grow"><strong>Assistant</strong><div class="small muted">Question, panne simulée, oral blanc</div></div></a>
        <a class="card row" style="flex-wrap:nowrap;color:var(--text)" href="#/assistant?mode=compare">${icon('columns')}<div class="grow"><strong>Côte à côte</strong><div class="small muted">Comparer les réponses de 2 ou 3 IA</div></div></a>
        <a class="card row" style="flex-wrap:nowrap;color:var(--text)" href="#/reparer/nouveau">${icon('wrench')}<div class="grow"><strong>Réparer un appareil</strong><div class="small muted">Sécurité, diagnostic, résumé</div></div></a>
      </div>
      ${ats.length ? `<div><div class="label">Derniers ateliers</div><div class="list">${ats.slice(0, 4).map(a => `<a class="item" href="#/atelier/${a.id}"><span class="grow" style="min-width:0"><span class="t">${esc(a.title)}</span></span>${domainTag(a.domain)}</a>`).join('')}</div></div>` : ''}
      ${openRepairs.length ? `<div><div class="label">Réparations en cours</div><div class="list">${openRepairs.slice(0, 3).map(r => `<a class="item" href="#/reparation/${r.id}"><span class="grow t">${esc([r.marque, r.modele].filter(Boolean).join(' ') || 'Appareil')}</span><span class="small muted">${esc(r.proprio || '')}</span></a>`).join('')}</div></div>` : ''}
    </div></div>`;
  v.querySelector('[data-focus]')?.addEventListener('click', async e => {
    e.preventDefault();
    const { get, put } = await import('../store.js');
    const at = await get('ateliers', e.currentTarget.dataset.focus);
    at.view = 'focus';
    await put('ateliers', at);
    location.hash = '#/atelier/' + at.id;
  });
  paintIcons(v);
}
