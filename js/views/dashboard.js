// Tableau de bord (progression par domaine, points faibles, séries, badges) et pages « Réviser » / « Outils ».
import { getKV, setKV, dbAll } from '../store.js';
import { summary, domainStats, weakPoints, weakHref, ringsSVG, RINGS, RING_COLORS, BADGES, getGoals, today } from '../progress.js';
import { dueToday } from '../srs.js';
import { getExams, daysBetween, dstr } from '../plan.js';
import { domain } from '../domains.js';
import { $, $$, esc, icon, paintIcons, sheet, toast } from '../ui.js';

const ringLegend = s => `<div class="ring-legend">${RINGS.map((r, i) => `<div><span class="dotc" style="--c:${RING_COLORS[i]}"></span><span class="grow">${r.label}</span><b class="mono">${s.daily[r.id] || 0}</b><span class="muted mono">/${s.goals[r.id]}</span></div>`).join('')}</div>`;

export async function dashboardView(v) {
  const [s, stats, weak, act, quizzes, cards] = await Promise.all([summary(), domainStats(), weakPoints(8), getKV('activity', []), dbAll('quizzes'), dbAll('cards')]);
  const actSet = new Set(act);
  // 12 semaines, colonnes = semaines (lundi en haut)
  const start = new Date(); start.setDate(start.getDate() - 83 - ((start.getDay() + 6) % 7)); start.setHours(12);
  const cells = [];
  for (let d = new Date(start); dstr(d) <= today(); d.setDate(d.getDate() + 1)) cells.push({ d: dstr(d), on: actSet.has(dstr(d)) });
  const daily = await getKV('daily', {});
  const level = c => { const x = daily[c.d]; if (!c.on) return 0; const n = x ? (x.cards || 0) + (x.questions || 0) * 2 + (x.practice || 0) * 3 : 1; return n >= 40 ? 3 : n >= 12 ? 2 : 1; };
  const withData = stats.filter(d => d.mastery != null).sort((a, b) => a.mastery - b.mastery);
  const noData = stats.filter(d => d.mastery == null && d.id !== 'autre');

  v.innerHTML = `
    <div class="row" style="margin-bottom:14px"><a class="icon-btn" href="#/reviser" aria-label="Retour">${icon('back')}</a><h1 style="margin:0">Progression</h1></div>
    <div class="dash">
      <div class="card row" style="flex-wrap:nowrap;gap:18px">${ringsSVG(s.daily, s.goals, 112)}<div class="grow" style="min-width:0"><div class="label" style="margin-bottom:6px">Aujourd'hui</div>${ringLegend(s)}<button class="link" data-goals style="margin-top:6px">Changer mes objectifs</button></div></div>
      <div class="card stack">
        <div class="row"><div><div class="score" style="font-size:40px">${s.streak}</div><div class="small muted">jour${s.streak > 1 ? 's' : ''} d'affilée · ${s.days} jour${s.days > 1 ? 's' : ''} actif${s.days > 1 ? 's' : ''} en tout</div></div></div>
        <div class="heat" style="grid-template-columns:repeat(${Math.ceil(cells.length / 7)},1fr)">${cells.map(c => `<span class="l${level(c)}" title="${c.d}"></span>`).join('')}</div>
      </div>
      <div class="card stack dash-wide">
        <h2 style="margin:0">Par domaine</h2>
        ${withData.length ? withData.map(d => { const p = Math.round(d.mastery * 100); return `<div class="dom-row"><span class="dotc" style="--c:${d.color}"></span><span class="dom-n">${esc(d.name)}</span><div class="meter grow ${p < 50 ? 'low' : p < 70 ? 'mid' : ''}"><i style="width:${p}%"></i></div><b class="mono" style="min-width:44px;text-align:right">${p} %</b></div>`; }).join('')
          : '<p class="small muted" style="margin:0">Fais un quiz, une vérification d’atelier ou des flashcards : ta maîtrise par domaine apparaîtra ici.</p>'}
        ${noData.length && withData.length ? `<p class="small muted" style="margin:0">Pas encore de données : ${noData.map(d => esc(d.name)).join(', ')}.</p>` : ''}
        <p class="small muted" style="margin:0">Calcul : réussite aux quiz et cartes des 30 derniers jours, meilleures notes des ateliers, cartes bien retenues.</p>
      </div>
      <div class="card stack">
        <h2 style="margin:0">Points faibles</h2>
        ${weak.length ? `<div class="list" style="background:var(--raised)">${weak.map(w => `<a class="item" href="${weakHref(w)}"><span class="dotc" style="--c:${domain(w.domain).color}"></span><span class="grow small">${esc(w.label)}</span><span class="small muted">${w.src === 'verif' ? 'atelier' : /^(Sous-réseaux|Terminal)/.test(w.label) ? 'exercice' : 'quiz'}</span></a>`).join('')}</div>
          <p class="small muted" style="margin:0">Touche un point faible pour t’entraîner dessus.</p>` : '<p class="small muted" style="margin:0">Rien à signaler pour l’instant.</p>'}
      </div>
      <div class="card stack">
        <h2 style="margin:0">Badges</h2>
        <div class="badges">${BADGES.map(b => `<div class="badge ${s.badges[b.id] ? 'on' : ''}" title="${esc(b.desc)}"><span class="b-ico mono">${s.badges[b.id] ? '&gt;_' : '·'}</span><span class="b-l">${esc(b.label)}</span><span class="b-d">${esc(b.desc)}</span></div>`).join('')}</div>
      </div>
      <div class="card dash-wide"><div class="stats4">
        <div><b class="mono">${quizzes.reduce((a, q) => a + (q.runs || []).length, 0)}</b><span>quiz faits</span></div>
        <div><b class="mono">${cards.length}</b><span>flashcards</span></div>
        <div><b class="mono">${s.subnetOk}</b><span>sous-réseaux justes</span></div>
        <div><b class="mono">${s.missions}</b><span>missions réussies</span></div>
      </div></div>
    </div>`;
  $('[data-goals]', v).onclick = async () => {
    const g = await getGoals();
    const sh = sheet(`<h2>Objectifs du jour</h2><form class="stack" data-g>${RINGS.map(r => `<label class="field">${r.label} : ${r.unit}<input class="input mono" type="number" min="1" max="200" name="${r.id}" value="${g[r.id]}"></label>`).join('')}<button class="btn primary" type="submit">Enregistrer</button></form>`);
    $('[data-g]', sh.el).onsubmit = async e => { e.preventDefault(); const fd = new FormData(e.target); await setKV('goals', Object.fromEntries(RINGS.map(r => [r.id, Math.max(1, +fd.get(r.id) || 1)]))); sh.close(); toast('Objectifs enregistrés'); dashboardView(v); };
  };
  paintIcons(v);
}

// ---------- Pages « Réviser » et « Outils » (au téléphone : un seul onglet) ----------
export async function hubView(v, which = 'reviser') {
  const [s, cards, exams, fiches] = await Promise.all([summary(), dbAll('cards'), getExams(), dbAll('carnet')]);
  const daily = await getKV('daily', {});
  const due = dueToday(cards, daily[today()]?.newCards || 0).all.length;
  const t0 = today();
  const next = exams.find(e => e.date >= t0);
  const tile = (href, ico, t, sub, badge = '') => `<a class="card tile" href="${href}">${icon(ico)}<div class="grow" style="min-width:0"><strong>${t}</strong><div class="small muted">${sub}</div></div>${badge}</a>`;
  const rev = `
    <div class="grid2">
      ${tile('#/flashcards', 'copy', 'Flashcards', 'Répétition espacée', due ? `<span class="tag ok">${due}</span>` : '')}
      ${tile('#/quiz', 'play', 'Quiz', 'Sur un sujet ou ton carnet, mode examen')}
      ${tile('#/planning', 'list', 'Planning', next ? `${esc(next.name)} dans ${daysBetween(t0, next.date)} j` : 'Dates d’examen et rappels')}
      ${tile('#/sous-reseaux', 'table', 'Sous-réseaux', 'Exercices illimités, hors ligne')}
      ${tile('#/progression', 'diagram', 'Progression', `${s.streak} jour${s.streak > 1 ? 's' : ''} d'affilée · badges`)}
    </div>`;
  const tools = `
    <div class="grid2">
      ${tile('#/reparer', 'wrench', 'Réparer', 'Appareils apportés : sécurité, diagnostic, résumé')}
      ${tile('#/terminal', 'terminal', 'Terminal simulé', 'Cisco, Linux, PowerShell, CMD, macOS')}
      ${tile('#/aide-memoire', 'file', 'Aide-mémoire', 'Commandes par domaine, copie en un geste')}
      ${tile('#/carnet', 'list', 'Carnet', `${fiches.length} fiche${fiches.length > 1 ? 's' : ''} technique${fiches.length > 1 ? 's' : ''}`)}
      ${tile('#/sous-reseaux?tab=calc', 'table', 'Calculatrice IPv4', 'Découpage binaire, hors ligne')}
    </div>`;
  const desktop = matchMedia('(min-width: 760px)').matches;
  v.innerHTML = `
    <div class="row" style="margin-bottom:14px"><h1 style="margin:0">${which === 'outils' && desktop ? 'Outils' : 'Réviser'}</h1><span class="grow"></span></div>
    <div class="stack" style="max-width:900px">
      ${which === 'reviser' || !desktop ? `<a class="card row" href="#/progression" style="flex-wrap:nowrap;color:var(--text)">${ringsSVG(s.daily, s.goals, 84)}<div class="grow" style="min-width:0">${ringLegend(s)}</div></a>${rev}` : ''}
      ${!desktop ? '<div class="label" style="margin:10px 0 0">Outils</div>' : ''}
      ${which === 'outils' || !desktop ? tools : ''}
    </div>`;
  paintIcons(v);
}
