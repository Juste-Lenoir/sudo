// Vérification de fin d'atelier : le formateur qui passe entre les postes.
// Séries illimitées, questions ratées qui reviennent reformulées, note sur 20, progression.
import { get, put, dbAll, uid, getProfile, logActivity } from '../store.js';
import { askJSON } from '../ai.js';
import { base, verifQuestions, verifCorrection } from '../prompts.js';
import { transcript } from '../chat.js';
import { $, esc, toast, icon, autoGrow, setupDictation, loading, paintIcons, fmtDate } from '../ui.js';

export function statusOf(at) {
  if (at.best == null) {
    const all = (at.steps || []).length && (at.steps || []).every(s => s.done);
    return all ? { label: 'À vérifier', cls: 'mid' } : { label: 'En cours', cls: '' };
  }
  if (at.best >= 20) return { label: 'Maîtrisé', cls: 'ok' };
  if (at.best >= 10) return { label: 'Moyenne atteinte', cls: 'ok' };
  return { label: 'À retravailler', cls: 'bad' };
}

const TYPES = { pourquoi: 'Pourquoi', notion: 'Notion', commande: 'Commande', preuve: 'Preuve', et_si: 'Et si…', panne: 'Panne', entreprise: 'En entreprise' };
const missedList = at => Object.entries(at.missed || {}).filter(([, m]) => !m.passed).sort((a, b) => b[1].count - a[1].count);

function chart(series) {
  if (!series.length) return '';
  const last = series.slice(-10);
  return `<div class="card">
    <div class="row"><strong>Progression</strong><span class="grow"></span><span class="small muted">objectif 10/20, puis 20/20</span></div>
    <div style="position:relative;margin-top:14px">
      <div style="position:absolute;left:0;right:0;bottom:50%;border-top:1px dashed #404040"></div>
      <div class="bars" style="height:120px">${last.map(s => `<span class="${s.note >= 10 ? 'b' : ''}" style="height:${Math.max(3, s.note * 5)}%;${s.note < 10 ? 'background:#5A2A2A' : ''}" title="${s.note}/20"></span>`).join('')}</div>
    </div>
    <div class="bars-x">${last.map(s => `<span>${s.note}<br>${s.format === 'qcm' ? 'QCM' : 'oral'}</span>`).join('')}</div>
  </div>`;
}

export async function verifView(v, id) {
  const at = await get('ateliers', id);
  if (!at) { v.innerHTML = '<div class="empty">Atelier introuvable.</div>'; return; }
  const prof = await getProfile();
  const series = (await dbAll('verifs')).filter(s => s.atelierId === id).sort((a, b) => a.ts - b.ts);
  let format = at.verifFormat || 'oral';

  function home() {
    const st = statusOf(at);
    const missed = missedList(at);
    const goal = at.best == null || at.best < 10 ? 'Objectif : atteindre la moyenne (10/20).' : at.best < 20 ? 'Moyenne atteinte. Prochain objectif : le score parfait.' : 'Atelier maîtrisé. Tu peux continuer à t\'entraîner.';
    v.innerHTML = `
      <div class="row" style="margin-bottom:6px"><a class="icon-btn" href="#/atelier/${at.id}" aria-label="Retour à l'atelier">${icon('back')}</a><div class="grow"><div class="label" style="margin:0">Vérification</div><h1 style="margin:0">${esc(at.title)}</h1></div></div>
      <div class="stack" style="max-width:820px;margin-top:14px">
        <div class="card row">
          <div class="score">${at.best ?? '–'}<span style="font-size:20px;color:var(--muted)">/20</span></div>
          <div class="grow"><span class="tag ${st.cls}">${st.label}</span><p class="small muted" style="margin:6px 0 0">${goal} ${series.length} série${series.length > 1 ? 's' : ''} faite${series.length > 1 ? 's' : ''}.</p></div>
        </div>
        <p class="muted" style="margin:0">Le formateur passe à ton poste et te pose des questions sur ce que tu as fait, pour vérifier que tu as compris. Chaque série est nouvelle ; les questions ratées reviennent, reformulées.</p>
        <div class="seg" role="group" aria-label="Format">
          <button data-f="oral" class="${format === 'oral' ? 'on' : ''}">Questions ouvertes</button>
          <button data-f="qcm" class="${format === 'qcm' ? 'on' : ''}">QCM rapide</button>
        </div>
        <p class="small muted" style="margin:0">${format === 'oral' ? '6 questions, tu réponds en texte ou en dictée, correction à la fin.' : '8 questions, correction juste après chaque réponse.'}</p>
        <button class="btn primary big block" data-start>${icon('play')}Nouvelle série</button>
        ${chart(series)}
        ${missed.length ? `<div class="card"><strong>Ratées le plus souvent</strong><div class="stack" style="margin-top:10px">${missed.slice(0, 6).map(([q, m]) => `<div class="row small"><span class="grow">${esc(q)}</span><span class="tag bad">×${m.count}</span></div>`).join('')}</div><p class="small muted" style="margin:10px 0 0">Elles reviendront dans tes prochaines séries jusqu'à ce que tu les réussisses.</p></div>` : ''}
        ${series.length ? `<div class="list">${series.slice().reverse().slice(0, 8).map(s => `<div class="item"><span class="grow">${fmtDate(s.ts)} · ${s.format === 'qcm' ? 'QCM' : 'Questions ouvertes'}</span><span class="tag ${s.note >= 10 ? 'ok' : 'bad'}">${s.note}/20</span></div>`).join('')}</div>` : ''}
      </div>`;
    paintIcons(v);
    v.querySelectorAll('[data-f]').forEach(b => b.onclick = async () => { format = b.dataset.f; at.verifFormat = format; await put('ateliers', at); home(); });
    $('[data-start]', v).onclick = start;
  }

  async function start() {
    loading(v, 'Le formateur prépare ses questions');
    const n = format === 'qcm' ? 8 : 6;
    try {
      const retry = missedList(at).slice(0, 4).map(([q]) => q);
      const r = await askJSON({ system: base(prof), prompt: verifQuestions(at, { format, n, retry, transcript: transcript(at.chat || [], 6000) }), task: format === 'qcm' ? 'fast' : 'best', onInfo: toast });
      const qs = (r.questions || []).filter(q => q.q).slice(0, n);
      if (!qs.length) throw new Error('aucune question reçue');
      if (format === 'qcm') qs.forEach(q => { q.bonne = Math.max(0, Math.min(3, +q.bonne || 0)); });
      run(qs);
    } catch (e) {
      v.innerHTML = `<div class="card"><p>Impossible de préparer la série : ${esc(e.message)}</p><button class="btn" data-back>Retour</button></div>`;
      $('[data-back]', v).onclick = home;
    }
  }

  function run(qs) {
    let i = 0;
    const draw = () => {
      const q = qs[i];
      const dots = qs.map((x, j) => `<span class="${j === i ? 'now' : x.verdict === 'juste' ? 'ok' : x.verdict === 'faux' ? 'ko' : x.verdict === 'partiel' ? 'mid' : x.reponse ? 'ok' : ''}"></span>`).join('');
      v.innerHTML = `
        <div class="stack" style="max-width:760px;margin:0 auto">
          <div class="row"><button class="icon-btn" data-quit aria-label="Arrêter la série">${icon('x')}</button><div class="grow"><div class="small muted">${esc(at.title)} · ${format === 'qcm' ? 'QCM' : 'questions ouvertes'}</div><strong>Question ${i + 1} sur ${qs.length}</strong></div></div>
          <div class="dots" style="grid-template-columns:repeat(${qs.length},1fr)">${dots}</div>
          <div class="qcard">
            <div class="row"><span class="tag">${esc(TYPES[q.type] || 'Question')}</span>${q.reprise ? '<span class="tag mid">déjà ratée, reformulée</span>' : ''}</div>
            <p class="q">${esc(q.q)}</p>
          </div>
          ${format === 'qcm' ? qcmPart(q) : oralPart(q)}
        </div>`;
      paintIcons(v);
      $('[data-quit]', v).onclick = () => { if (confirm('Arrêter cette série ? Elle ne sera pas comptée.')) home(); };
      if (format === 'qcm') bindQcm(q); else bindOral(q);
    };

    const oralPart = q => `
      <label class="field">Ta réponse<textarea class="input" rows="4" data-a placeholder="En 1 à 4 phrases, avec tes mots">${esc(q.reponse || '')}</textarea></label>
      <div data-hintbox>${q.usedHint ? `<div class="clarify">${esc(q.indice)}</div>` : ''}</div>
      <div class="row"><button class="btn ghost" data-mic hidden>${icon('mic')}Dicter</button><button class="btn hint" data-hint ${q.usedHint || !q.indice ? 'disabled' : ''}>${icon('bulb')}Petit indice</button><span class="grow"></span>
      ${i > 0 ? '<button class="btn ghost" data-prev>Précédente</button>' : ''}<button class="btn primary" data-next>${i === qs.length - 1 ? 'Terminer' : 'Suivante'}</button></div>`;

    function bindOral(q) {
      const ta = $('[data-a]', v);
      autoGrow(ta, 300);
      setupDictation($('[data-mic]', v), ta);
      ta.focus();
      ta.oninput = () => { q.reponse = ta.value; };
      $('[data-hint]', v).onclick = () => { q.usedHint = true; $('[data-hintbox]', v).innerHTML = `<div class="clarify">${esc(q.indice)}</div>`; $('[data-hint]', v).disabled = true; };
      const prev = $('[data-prev]', v);
      if (prev) prev.onclick = () => { i--; draw(); };
      $('[data-next]', v).onclick = () => {
        q.reponse = ta.value.trim();
        if (!q.reponse && !confirm('Pas de réponse : passer quand même ?')) return;
        if (i < qs.length - 1) { i++; draw(); } else correct(qs);
      };
    }

    const qcmPart = q => `<div class="choices">${q.choix.map((c, j) => `<button class="choice" data-c="${j}">${esc(c)}</button>`).join('')}</div><div data-fb></div>`;
    function bindQcm(q) {
      v.querySelectorAll('[data-c]').forEach(b => b.onclick = () => {
        const j = +b.dataset.c;
        q.reponse = q.choix[j];
        q.verdict = j === q.bonne ? 'juste' : 'faux';
        v.querySelectorAll('[data-c]').forEach(x => { x.disabled = true; const k = +x.dataset.c; if (k === q.bonne) x.classList.add('good'); else if (k === j) x.classList.add('bad'); });
        $('[data-fb]', v).innerHTML = `<div class="card stack celebrate"><span class="verdict ${q.verdict}">${q.verdict === 'juste' ? icon('check') + 'Juste' : icon('x') + 'Faux'}</span><div class="small">${esc(q.attendu || '')}</div><button class="btn primary" data-next>${i === qs.length - 1 ? 'Voir ma note' : 'Suivante'}</button></div>`;
        paintIcons(v);
        $('[data-next]', v).onclick = () => { if (i < qs.length - 1) { i++; draw(); } else finishQcm(qs); };
      });
    }
    draw();
  }

  async function correct(qs) {
    loading(v, 'Le formateur corrige');
    try {
      const r = await askJSON({ system: base(prof), prompt: verifCorrection(at, qs), task: 'best', onInfo: toast });
      (r.corrections || []).forEach((c, j) => { if (qs[j]) Object.assign(qs[j], { verdict: c.verdict, points: c.points, commentaire: c.commentaire, attendu: c.attendu || qs[j].attendu }); });
      const note = Math.round(Math.max(0, Math.min(20, +r.note || 0)) * 2) / 2;
      await finish(qs, note, r.bilan || '', r.a_revoir || []);
    } catch (e) {
      v.innerHTML = `<div class="card"><p>La correction n'a pas marché : ${esc(e.message)}</p><button class="btn primary" data-retry>Réessayer la correction</button></div>`;
      $('[data-retry]', v).onclick = () => correct(qs);
    }
  }

  async function finishQcm(qs) {
    const ok = qs.filter(q => q.verdict === 'juste').length;
    await finish(qs, Math.round((ok / qs.length) * 40) / 2, `${ok} bonne${ok > 1 ? 's' : ''} réponse${ok > 1 ? 's' : ''} sur ${qs.length}.`, qs.filter(q => q.verdict !== 'juste').map(q => q.q));
  }

  async function finish(qs, note, bilan, revoir) {
    at.missed ||= {};
    for (const q of qs) {
      const key = q.q.slice(0, 160);
      if (q.verdict === 'juste') {
        // Une question reprise et réussie sort de la liste des ratées.
        if (q.reprise) {
          const words = s => new Set(s.toLowerCase().normalize('NFD').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 3));
          const qw = words(q.q);
          let best = null, score = 0;
          for (const [k, m] of Object.entries(at.missed)) {
            if (m.passed) continue;
            const kw = words(k);
            const sc = [...qw].filter(w => kw.has(w)).length / Math.max(1, Math.min(qw.size, kw.size));
            if (sc > score) { score = sc; best = m; }
          }
          if (best && score >= 0.3) best.passed = true;
        }
        if (at.missed[key]) at.missed[key].passed = true;
      } else {
        const m = at.missed[key] || (at.missed[key] = { count: 0, passed: false });
        m.count++; m.passed = false;
      }
    }
    const prevBest = at.best;
    at.best = Math.max(at.best ?? 0, note);
    at.updatedAt = Date.now();
    await put('ateliers', at);
    await put('verifs', { id: uid(), atelierId: at.id, ts: Date.now(), format, note, items: qs.map(q => ({ q: q.q, type: q.type, reponse: q.reponse, verdict: q.verdict, commentaire: q.commentaire, attendu: q.attendu })) });
    series.push({ ts: Date.now(), format, note });
    logActivity();
    const milestone = note >= 20 && (prevBest ?? 0) < 20 ? 'Score parfait : atelier maîtrisé.' : note >= 10 && (prevBest ?? 0) < 10 ? 'Moyenne atteinte !' : '';
    v.innerHTML = `
      <div class="stack" style="max-width:760px;margin:0 auto">
        <div class="card stack celebrate" style="text-align:center;align-items:center">
          <div class="score">${note}<span style="font-size:22px;color:var(--muted)">/20</span></div>
          ${milestone ? `<strong style="color:var(--brand)">${milestone}<span class="caret">_</span></strong>` : ''}
          <p class="muted" style="margin:0">${esc(bilan)}</p>
        </div>
        ${qs.map((q, j) => `<div class="card stack">
          <div class="row"><span class="small muted">Q${j + 1} · ${esc(TYPES[q.type] || '')}</span><span class="grow"></span><span class="verdict ${q.verdict || 'faux'}">${q.verdict === 'juste' ? 'Juste' : q.verdict === 'partiel' ? 'Partiel' : 'Faux'}</span></div>
          <strong>${esc(q.q)}</strong>
          <div class="small"><span class="muted">Ta réponse :</span> ${esc(q.reponse || '(vide)')}</div>
          ${q.commentaire ? `<div class="small">${esc(q.commentaire)}</div>` : ''}
          ${q.verdict !== 'juste' ? `<div class="small" style="color:#BBF7D0"><span class="muted">Attendu :</span> ${esc(q.attendu || '')}</div>` : ''}
        </div>`).join('')}
        ${revoir.length ? `<div class="clarify"><strong>À revoir</strong><ul>${revoir.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
        <div class="row"><a class="btn ghost" href="#/atelier/${at.id}">Retour à l'atelier</a><span class="grow"></span><button class="btn primary" data-again>${icon('play')}Nouvelle série</button></div>
      </div>`;
    paintIcons(v);
    $('[data-again]', v).onclick = start;
    window.scrollTo(0, 0);
  }

  home();
}
