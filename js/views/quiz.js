// Quiz : générés par l'IA sur un sujet ou depuis le carnet, questions illustrées,
// mode entraînement (correction immédiate) ou examen chronométré. Les quiz sont gardés
// pour être refaits sans consommer de quota.
import { dbAll, get, put, del, uid, getProfile, getKV, setKV } from '../store.js';
import { askJSON } from '../ai.js';
import { base, quizPrompt } from '../prompts.js';
import { record, weakPoints } from '../progress.js';
import { addCards } from '../srs.js';
import { illusHTML, loadPhotos } from '../illus.js';
import { DOMAINS, domain } from '../domains.js';
import { BANK } from '../quiz-bank.js';
import { md } from '../md.js';
import { $, $$, esc, icon, paintIcons, toast, loading, domainOptions, domainTag, fmtDate, params } from '../ui.js';

const SEC_PER_Q = 45;
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const inl = s => md(String(s || '')).replace(/^<p>|<\/p>$/g, '');

export async function quizView(v) {
  const p = params();
  const [fiches, past] = await Promise.all([dbAll('carnet'), dbAll('quizzes')]);
  past.sort((a, b) => b.createdAt - a.createdAt);
  const opt = {
    src: p.fiche ? 'carnet' : 'sujet', sujet: p.sujet || '', dom: p.d || (p.fiche ? fiches.find(f => f.id === p.fiche)?.domaine : null) || 'reseau',
    n: 10, niveau: 'moyen', exam: !!p.examen, weak: true, fiches: new Set(p.fiche ? [p.fiche] : []),
  };

  // Quiz en cours : gardé sur l'appareil pour le retrouver après être allé sur une autre page.
  const RUN = 'quiz-run';
  const saved = await getKV(RUN, null);
  const runQuiz = st => st && (st.quiz || past.find(q => q.id === st.quizId));
  const pending = runQuiz(saved) ? saved : null;

  function setup() {
    const domFiches = fiches.filter(f => f.domaine === opt.dom);
    v.innerHTML = `
      <div class="row" style="margin-bottom:12px"><a class="icon-btn" href="#/reviser" aria-label="Retour">${icon('back')}</a><h1 style="margin:0">Quiz</h1></div>
      <div class="stack" style="max-width:760px">
        ${pending ? `<div class="card row"><div class="grow" style="min-width:0"><strong>Quiz en cours</strong><div class="small muted">${esc(runQuiz(pending).titre)} · question ${pending.i + 1}/${pending.qs.length}</div></div><button class="btn primary" data-resume>${icon('play')}Reprendre</button></div>` : ''}
        <div class="seg"><button data-src="sujet" class="${opt.src === 'sujet' ? 'on' : ''}">Sur un sujet</button><button data-src="carnet" class="${opt.src === 'carnet' ? 'on' : ''}">Depuis mon carnet</button></div>
        <div class="card stack">
          <label class="field">Domaine<select class="input" data-dom>${domainOptions(opt.dom)}</select></label>
          ${opt.src === 'sujet'
            ? `<label class="field">Sujet (facultatif)<input class="input" data-sujet value="${esc(opt.sujet)}" placeholder="Ex. : VLAN et trunk, DHCP, droits Linux, RAID…"></label>`
            : domFiches.length
              ? `<div class="field">Fiches à réviser<div class="list" style="max-height:240px;overflow:auto">${domFiches.map(f => `<label class="check item" style="padding:10px 12px"><input type="checkbox" data-fiche="${f.id}" ${opt.fiches.has(f.id) || !opt.fiches.size ? 'checked' : ''}><span>${esc(f.titre)}</span></label>`).join('')}</div></div>`
              : `<p class="small muted" style="margin:0">Aucune fiche ${esc(domain(opt.dom).name)} dans ton carnet. Choisis un autre domaine ou un quiz sur un sujet.</p>`}
          <div class="grid2">
            <div class="field">Questions<div class="seg">${[5, 10, 20].map(n => `<button data-n="${n}" class="${opt.n === n ? 'on' : ''}">${n}</button>`).join('')}</div></div>
            <div class="field">Niveau<div class="seg">${['facile', 'moyen', 'difficile'].map(n => `<button data-niv="${n}" class="${opt.niveau === n ? 'on' : ''}">${n}</button>`).join('')}</div></div>
          </div>
          <label class="check" style="padding:0"><input type="checkbox" data-exam ${opt.exam ? 'checked' : ''}><span><strong>Mode examen chronométré</strong><br><span class="small muted">${SEC_PER_Q} s par question en moyenne, correction à la fin seulement.</span></span></label>
          <label class="check" style="padding:0"><input type="checkbox" data-weak ${opt.weak ? 'checked' : ''}><span>Insister sur mes points faibles</span></label>
        </div>
        <button class="btn primary big block" data-go>${icon('play')}Générer le quiz</button>
        <button class="btn big block" data-bank>${icon('rotate')}Quiz sans IA (${bankFor(opt.dom).length} questions ${esc(domain(opt.dom).name)})</button>
        <p class="small muted" style="margin:0">Générer : une seule requête à l'IA rapide, et le quiz est gardé. Sans IA : questions mélangées de la banque intégrée et de tes quiz déjà faits. Marche hors ligne et ne consomme aucun quota.</p>
        ${past.length ? `<div><div class="label">Mes quiz</div><div class="list">${past.slice(0, 12).map(q => {
          const best = Math.max(...(q.runs || []).map(r => r.note), -1);
          return `<div class="item"><span class="dotc" style="--c:${domain(q.domain).color}"></span><a class="grow" href="#/quiz" data-replay="${q.id}" style="color:var(--text);min-width:0"><span class="t">${esc(q.titre)}</span><span class="s" style="display:block">${fmtDate(q.createdAt)} · ${q.questions.length} questions${(q.runs || []).length ? ` · ${q.runs.length} essai${q.runs.length > 1 ? 's' : ''}` : ''}</span></a>
            ${best >= 0 ? `<span class="tag ${best >= 10 ? 'ok' : 'bad'}">${best}/20</span>` : ''}<button class="icon-btn" data-delq="${q.id}" aria-label="Supprimer">${icon('trash')}</button></div>`;
        }).join('')}</div></div>` : ''}
      </div>`;
    $$('[data-src]', v).forEach(b => b.onclick = () => { opt.src = b.dataset.src; setup(); });
    $('[data-dom]', v).onchange = e => { opt.dom = e.target.value; opt.fiches.clear(); setup(); };
    $('[data-sujet]', v)?.addEventListener('input', e => { opt.sujet = e.target.value; });
    $$('[data-n]', v).forEach(b => b.onclick = () => { opt.n = +b.dataset.n; $$('[data-n]', v).forEach(x => x.classList.toggle('on', x === b)); });
    $$('[data-niv]', v).forEach(b => b.onclick = () => { opt.niveau = b.dataset.niv; $$('[data-niv]', v).forEach(x => x.classList.toggle('on', x === b)); });
    $('[data-exam]', v).onchange = e => { opt.exam = e.target.checked; };
    $('[data-weak]', v).onchange = e => { opt.weak = e.target.checked; };
    $('[data-go]', v).onclick = generate;
    $('[data-bank]', v).onclick = bankQuiz;
    $('[data-resume]', v)?.addEventListener('click', () => run(runQuiz(pending), false, pending));
    v.querySelectorAll('[data-replay]').forEach(a => a.onclick = async e => { e.preventDefault(); const q = await get('quizzes', a.dataset.replay); run(q, true); });
    v.querySelectorAll('[data-delq]').forEach(b => b.onclick = async () => { if (confirm('Supprimer ce quiz ?')) { await del('quizzes', b.dataset.delq); const i = past.findIndex(x => x.id === b.dataset.delq); past.splice(i, 1); setup(); } });
    paintIcons(v);
  }

  async function generate() {
    let ficheText = '';
    let chosen = [];
    if (opt.src === 'carnet') {
      chosen = $$('[data-fiche]', v).filter(c => c.checked).map(c => fiches.find(f => f.id === c.dataset.fiche));
      if (!chosen.length) { toast('Choisis au moins une fiche'); return; }
      ficheText = chosen.map(f => `## ${f.titre}\n${f.contenu}`).join('\n\n');
    }
    const weak = opt.weak ? (await weakPoints(20)).filter(w => w.domain === opt.dom).slice(0, 5).map(w => w.label) : [];
    loading(v, 'Préparation du quiz');
    try {
      const prof = await getProfile();
      const r = await askJSON({ system: base(prof), prompt: quizPrompt({ sujet: opt.sujet, dom: opt.dom, fiches: ficheText, n: opt.n, niveau: opt.niveau, weak }), task: 'fast', onInfo: toast });
      const questions = (r.questions || []).filter(q => q.q && Array.isArray(q.choix) && q.choix.length >= 2).slice(0, opt.n)
        .map(q => ({ ...q, bonne: Math.max(0, Math.min(q.choix.length - 1, +q.bonne || 0)) }));
      if (!questions.length) throw new Error('aucune question reçue');
      const quiz = { id: uid(), createdAt: Date.now(), titre: r.titre || opt.sujet || chosen[0]?.titre || 'Quiz ' + domain(opt.dom).name, domain: opt.dom, sujet: opt.sujet, source: chosen.map(f => f.id), questions, runs: [] };
      await put('quizzes', quiz);
      run(quiz, false);
    } catch (e) {
      v.innerHTML = `<div class="card stack" style="max-width:640px"><p style="margin:0">Le quiz n'a pas pu être préparé : ${esc(e.message)}</p>
        <div class="row"><button class="btn primary" data-bank>${icon('rotate')}Faire un quiz sans IA</button><button class="btn" data-back>Retour</button></div></div>`;
      paintIcons(v);
      $('[data-back]', v).onclick = setup;
      $('[data-bank]', v).onclick = bankQuiz;
    }
  }

  // ----- Quiz sans IA : banque intégrée + questions des quiz déjà générés -----
  function bankFor(dom) {
    const seen = new Set();
    const mine = past.filter(q => q.domain === dom).flatMap(q => q.questions.map(x => ({ ...x, domain: q.domain })));
    return [...mine, ...BANK.filter(x => x.domain === dom)].filter(x => { const k = x.q.trim().toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  }
  async function bankQuiz() {
    const pool = bankFor(opt.dom);
    if (!pool.length) { toast('Aucune question pour ce domaine : choisis-en un autre'); return; }
    const weak = new Set((await weakPoints(30)).filter(w => w.domain === opt.dom).map(w => w.label.toLowerCase()));
    // Points faibles d'abord (si demandé), puis le reste au hasard.
    const sorted = opt.weak ? [...shuffle(pool.filter(x => weak.has((x.notion || x.q).toLowerCase()))), ...shuffle(pool.filter(x => !weak.has((x.notion || x.q).toLowerCase())))] : shuffle(pool);
    const quiz = { id: 'bank-' + uid(), temp: true, createdAt: Date.now(), titre: 'Quiz sans IA · ' + domain(opt.dom).name, domain: opt.dom, questions: sorted.slice(0, opt.n), runs: [] };
    run(quiz, true);
  }

  // ----- Passage du quiz -----
  function run(quiz, replay, resume) {
    // Un quiz refait : questions et choix mélangés.
    const qs = resume ? resume.qs : (replay ? shuffle(quiz.questions) : quiz.questions).map(q => {
      const order = replay ? shuffle(q.choix.map((_, i) => i)) : q.choix.map((_, i) => i);
      return { ...q, choix: order.map(i => q.choix[i]), bonne: order.indexOf(q.bonne), rep: null };
    });
    const exam = resume ? resume.exam : opt.exam;
    let i = resume ? Math.min(resume.i, qs.length - 1) : 0, deadline = resume ? resume.deadline : exam ? Date.now() + qs.length * SEC_PER_Q * 1000 : 0, timer = 0;
    const keep = () => setKV(RUN, { quizId: quiz.id, quiz: quiz.temp ? quiz : undefined, qs, i, exam, deadline });
    const forget = () => setKV(RUN, null);

    const draw = () => {
      keep();
      const q = qs[i];
      const answered = q.rep != null;
      v.innerHTML = `
        <div class="quiz" style="max-width:720px;margin:0 auto">
          <div class="row" style="margin-bottom:10px"><button class="icon-btn" data-quit aria-label="Quitter">${icon('x')}</button>
            <div class="grow"><div class="dots" style="grid-template-columns:repeat(${qs.length},1fr)">${qs.map((x, k) => `<span class="${k === i ? 'now' : x.rep == null ? '' : exam ? 'mid' : x.rep === x.bonne ? 'ok' : 'ko'}"></span>`).join('')}</div></div>
            ${exam ? '<span class="timer mono" data-timer></span>' : `<span class="small muted mono">${i + 1}/${qs.length}</span>`}</div>
          <div class="qcard stack">
            <div class="row small muted"><span>Question ${i + 1}</span>${q.notion ? `<span class="tag">${esc(q.notion)}</span>` : ''}</div>
            <p class="q" style="margin:0">${inl(q.q)}</p>
            ${illusHTML(q.illustration)}
            <div class="choices">${q.choix.map((c, k) => {
              const cls = answered && !exam ? (k === q.bonne ? 'good' : k === q.rep ? 'bad' : '') : answered && k === q.rep ? 'picked' : '';
              return `<button class="choice ${cls}" data-c="${k}" ${answered && !exam ? 'disabled' : ''}><span class="mono muted" style="margin-right:8px">${k + 1}</span>${inl(c)}</button>`;
            }).join('')}</div>
            ${answered && !exam ? `<div class="explain ${q.rep === q.bonne ? 'ok' : 'ko'}"><div class="verdict ${q.rep === q.bonne ? 'juste' : 'faux'}">${icon(q.rep === q.bonne ? 'check' : 'x')}${q.rep === q.bonne ? 'Juste' : 'Faux'}</div><div class="md small">${md(q.explication || '')}</div></div>` : ''}
          </div>
          <div class="row" style="margin-top:14px">
            ${i > 0 && exam ? '<button class="btn ghost" data-prev>Précédente</button>' : ''}<span class="grow"></span>
            ${(answered || exam) ? `<button class="btn primary" data-next>${i === qs.length - 1 ? 'Terminer' : 'Suivante'}</button>` : ''}
          </div>
        </div>`;
      paintIcons(v);
      loadPhotos(v);
      $$('[data-c]', v).forEach(b => b.onclick = () => { if (answered && !exam) return; q.rep = +b.dataset.c; if (exam) { draw(); } else draw(); });
      $('[data-next]', v)?.addEventListener('click', next);
      $('[data-prev]', v)?.addEventListener('click', () => { i--; draw(); });
      $('[data-quit]', v).onclick = () => { if (qs.some(x => x.rep != null) && !confirm('Quitter ce quiz ? Il reste dans « Mes quiz ».')) return; stop(); forget().then(() => quizView(v)); };
      tick();
    };
    const next = () => { if (i < qs.length - 1) { i++; draw(); window.scrollTo(0, 0); } else finish(); };
    const tick = () => {
      const el = $('[data-timer]', v);
      if (!el) return;
      const left = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      el.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
      el.classList.toggle('low', left <= 30);
      if (left <= 0) { toast('Temps écoulé'); finish(); }
    };
    const stop = () => { clearInterval(timer); document.removeEventListener('keydown', onKey); };
    if (exam) timer = setInterval(tick, 1000);
    const onKey = e => {
      if (!document.body.contains(v)) return stop();
      if (e.target.closest('input, textarea, select')) return;
      const k = +e.key;
      if (k >= 1 && k <= 4) $$('[data-c]', v)[k - 1]?.click();
      if (e.key === 'Enter') $('[data-next]', v)?.click();
    };
    document.addEventListener('keydown', onKey);
    window.addEventListener('hashchange', stop, { once: true });

    async function finish() {
      stop();
      await forget();
      const good = qs.filter(q => q.rep === q.bonne).length;
      const note = Math.round(good / qs.length * 20 * 2) / 2;
      quiz.runs = [...(quiz.runs || []), { ts: Date.now(), note, exam, good, n: qs.length }];
      if (!quiz.temp) await put('quizzes', quiz);
      await record(quiz.domain, qs.map(q => ({ label: q.notion || q.q, ok: q.rep === q.bonne })));
      const wrong = qs.filter(q => q.rep !== q.bonne);
      v.innerHTML = `
        <div class="stack" style="max-width:720px;margin:0 auto">
          <div class="card row ${note >= 10 ? 'celebrate' : ''}">
            <div class="score">${String(note).replace('.', ',')}<span style="font-size:20px;color:var(--muted)">/20</span></div>
            <div class="grow"><strong>${esc(quiz.titre)}</strong><div class="small muted">${good} bonne${good > 1 ? 's' : ''} réponse${good > 1 ? 's' : ''} sur ${qs.length}${exam ? ' · mode examen' : ''}</div>
              <div class="row" style="margin-top:6px">${domainTag(quiz.domain)}${note >= 20 ? '<span class="tag ok">Parfait<span class="caret">_</span></span>' : note >= 10 ? '<span class="tag ok">Moyenne atteinte</span>' : '<span class="tag bad">À retravailler</span>'}</div></div>
          </div>
          <div class="row">
            ${wrong.length ? `<button class="btn primary" data-tocards>${icon('copy')}${wrong.length > 1 ? `Mes ${wrong.length} erreurs en flashcards` : 'Mon erreur en flashcard'}</button>` : ''}
            <button class="btn" data-again>${icon('rotate')}Refaire (mélangé)</button><button class="btn ghost" data-new>Nouveau quiz</button></div>
          <div class="label" style="margin:6px 0 0">Correction</div>
          ${qs.map((q, k) => `<div class="card stack">
            <div class="row" style="flex-wrap:nowrap;align-items:flex-start"><span class="verdict ${q.rep === q.bonne ? 'juste' : 'faux'}">${icon(q.rep === q.bonne ? 'check' : 'x')}</span><div class="grow" style="min-width:0"><strong>${k + 1}. ${inl(q.q)}</strong></div></div>
            ${illusHTML(q.illustration)}
            <div class="small">${q.rep != null && q.rep !== q.bonne ? `<div style="color:var(--err)">Ta réponse : ${inl(q.choix[q.rep])}</div>` : q.rep == null ? '<div style="color:var(--err)">Pas de réponse</div>' : ''}
              <div style="color:var(--brand)">Bonne réponse : ${inl(q.choix[q.bonne])}</div></div>
            ${q.explication ? `<div class="md small muted">${md(q.explication)}</div>` : ''}</div>`).join('')}
        </div>`;
      paintIcons(v);
      loadPhotos(v);
      $('[data-again]', v).onclick = () => (quiz.temp ? bankQuiz() : run(quiz, true));
      $('[data-new]', v).onclick = setup;
      $('[data-tocards]', v)?.addEventListener('click', async e => {
        const btn = e.currentTarget;
        btn.disabled = true;
        const n = await addCards(wrong.map(q => ({ front: q.q, back: `**${q.choix[q.bonne]}**${q.explication ? '\n\n' + q.explication : ''}`, domain: quiz.domain, illus: q.illustration || null, source: { type: 'quiz', id: quiz.id } })));
        toast(n ? `${n} carte${n > 1 ? 's' : ''} ajoutée${n > 1 ? 's' : ''}` : 'Déjà dans tes flashcards');
      });
    }
    draw();
  }

  // Retour sur la page Quiz sans demande précise : on reprend le quiz là où il en était.
  if (pending && !p.fiche && !p.sujet && !p.examen) run(runQuiz(pending), false, pending);
  else setup();
}
