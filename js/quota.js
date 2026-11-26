// Indicateur de quota visible partout + détail de la consommation.
import { getAI, getUsage, readyProviders, remaining, topLastWeek, todayOf, monthCost, dayKey, P } from './ai.js';
import { $, esc, sheet } from './ui.js';

const level = r => (r > 0.5 ? '' : r > 0.2 ? 'mid' : 'low');
const pct = r => Math.round(r * 100) + ' %';

async function current() {
  const s = await getAI();
  const u = await getUsage();
  const ready = readyProviders(s);
  const id = ready.find(p => p.id === u.last)?.id || ready.find(p => p.id === s.primary)?.id || ready[0]?.id;
  return { s, u, ready, id };
}

export async function paintQuota() {
  const el = $('#quota');
  const { s, u, ready, id } = await current();
  if (!ready.length) {
    el.className = 'quota none';
    el.innerHTML = '<span class="dot"></span>Aucune IA';
    el.title = 'Ajoute une clé dans les réglages';
    return;
  }
  const p = P(id);
  const r = remaining(s, u, id);
  el.className = 'quota ' + level(r.ratio);
  el.innerHTML = `<span class="dot"></span>${esc(p.name)}${p.paid || id === 'ollama' ? '' : ' · ' + (r.exact ? '' : '~') + pct(r.ratio)}`;
  el.title = `IA en cours : ${p.full}. Clique pour voir la consommation.`;
}

function weekBars(u, id) {
  const days = [];
  for (let i = 7; i >= 1; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(d); }
  const vals = days.map(d => u.days[dayKey(d)]?.[id]?.req || 0);
  const max = Math.max(1, ...vals);
  if (!vals.some(Boolean)) return '<div class="small muted">Pas encore utilisée la semaine dernière.</div>';
  return `<div class="bars" aria-label="Requêtes par jour, semaine précédente">${vals.map(v => `<span class="b" style="height:${Math.max(2, (v / max) * 100)}%" title="${v} requêtes"></span>`).join('')}</div>
    <div class="bars-x">${days.map((d, i) => `<span>${d.toLocaleDateString('fr-FR', { weekday: 'narrow' })}<br>${vals[i]}</span>`).join('')}</div>`;
}

export async function openQuota() {
  const { s, u, ready, id } = await current();
  if (!ready.length) { location.hash = '#/reglages'; return; }
  // Les 3 plus utilisées la semaine précédente ; complétées par les IA actives si l'historique est court.
  const top = topLastWeek(u, 3);
  for (const p of [P(id), ...ready]) if (top.length < 3 && p && !top.includes(p.id)) top.push(p.id);
  const cards = top.map(pid => {
    const p = P(pid), c = s.providers[pid];
    if (!p) return '';
    const r = remaining(s, u, pid), t = todayOf(u, pid);
    const limit = c.rpd ? `${c.rpd} requêtes/jour` : p.paid ? 'payante' : pid === 'ollama' ? 'illimité' : 'limite inconnue';
    return `<div class="card stack">
      <div class="row"><strong>${esc(p.full)}</strong><span class="grow"></span>${p.paid || pid === 'ollama' ? '' : `<span class="tag ${level(r.ratio) === 'low' ? 'bad' : level(r.ratio) === 'mid' ? 'mid' : 'ok'}">${r.exact ? '' : '~'}${pct(r.ratio)} restant</span>`}</div>
      ${p.paid || pid === 'ollama' ? '' : `<div class="meter ${level(r.ratio)}"><i style="width:${pct(r.ratio)}"></i></div>`}
      <div class="small muted">Aujourd'hui : ${t.req} requête${t.req > 1 ? 's' : ''} · ~${Math.round((t.inT + t.outT) / 1000)} k tokens · ${r.blocked ? 'limite atteinte' : `limite ${esc(limit)}${r.exact ? ' (donnée par le fournisseur)' : ' (estimation)'}`}</div>
      ${r.blocked ? `<div class="small" style="color:var(--err)">${r.blocked.daily ? 'Quota du jour épuisé selon ' + esc(p.name) : 'Trop de demandes à la minute'} : en pause jusqu'à ${new Date(r.blocked.until).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}. sudo utilise une autre IA en attendant.</div>` : ''}
      <div class="small muted">Remise à zéro : ${esc(p.reset || '?')}</div>
      <div class="label" style="margin:6px 0 0">Semaine précédente</div>
      ${weekBars(u, pid)}
    </div>`;
  }).join('');
  const paid = readyProviders(s).some(p => p.paid)
    ? `<p class="small muted">IA payantes ce mois-ci : ${monthCost(s, u).toFixed(2)} $ sur ${s.budget} $ de budget (estimation).</p>` : '';
  sheet(`<h2>Consommation des IA</h2>
    <p class="sub small">Les 3 IA que tu as le plus utilisées la semaine dernière. Quand une IA n'a plus de quota, sudo passe automatiquement à la suivante.</p>
    <div class="stack">${cards}</div>${paid}
    <p class="small muted">Les limites gratuites changent souvent : tu peux les corriger dans Réglages.</p>
    <div class="row" style="margin-top:12px"><a class="btn ghost" href="#/reglages" data-close>Réglages des IA</a><span class="grow"></span><button class="btn" data-close>Fermer</button></div>`);
}

export function setupQuota() {
  $('#quota').addEventListener('click', openQuota);
  ['usage-changed', 'ai-changed'].forEach(e => window.addEventListener(e, paintQuota));
  window.addEventListener('ai-fallback', paintQuota);
  paintQuota();
}
