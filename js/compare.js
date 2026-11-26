// Mode « côte à côte » : la même question à 2 ou 3 IA, réponses en colonnes, puis synthèse.
import { getAI, getUsage, readyProviders, remaining, callOne, chat, P } from './ai.js';
import { md } from './md.js';
import { base, synthese } from './prompts.js';
import { esc, icon, toast, copy, autoGrow, pickImages, paintIcons } from './ui.js';
import { stripData } from './chat.js';

export async function openCompare({ question = '', images = [], messages = null, system = null, onKeep = null } = {}) {
  const s = await getAI();
  const u = await getUsage();
  const ready = readyProviders(s);
  if (ready.length < 2) { toast('Active au moins 2 IA dans Réglages pour comparer'); return; }
  const needVision = images.length > 0;
  let picked = ready.filter(p => !needVision || p.vision)
    .sort((a, b) => remaining(s, u, b.id).ratio - remaining(s, u, a.id).ratio).slice(0, 3).map(p => p.id);
  if (picked.length < 2) picked = ready.slice(0, 3).map(p => p.id);

  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `
    <div class="ov-head"><strong>Côte à côte</strong><span class="grow"></span><button class="icon-btn" data-x aria-label="Fermer">${icon('x')}</button></div>
    <div class="ov-body">
      <div class="stack" style="max-width:900px">
        <label class="field">Question
          <textarea class="input" rows="2" data-q>${esc(question)}</textarea></label>
        <div class="row" data-imgs></div>
        <div class="row" data-ids></div>
        <div class="small muted" data-cost></div>
        <div class="row"><button class="btn ghost" data-photo>${icon('camera')}Photo</button><span class="grow"></span><button class="btn primary" data-go>Envoyer aux IA</button></div>
      </div>
      <div class="compare" data-cols style="margin-top:18px"></div>
      <div data-syn style="margin-top:14px"></div>
    </div>`;
  document.body.appendChild(ov);
  document.body.style.overflow = 'hidden';
  const q = ov.querySelector('[data-q]');
  autoGrow(q);
  const close = () => { ov.remove(); document.body.style.overflow = ''; };
  ov.querySelector('[data-x]').onclick = close;

  const drawImgs = () => { ov.querySelector('[data-imgs]').innerHTML = images.map(src => `<img src="${esc(src)}" alt="" style="height:64px;border-radius:10px">`).join(''); };
  const drawIds = () => {
    ov.querySelector('[data-ids]').innerHTML = ready.map(p => {
      const r = remaining(s, u, p.id);
      return `<button class="chip ${picked.includes(p.id) ? 'on' : ''}" data-id="${p.id}">${esc(p.name)}${p.paid || p.id === 'ollama' ? '' : ` · ${r.exact ? '' : '~'}${Math.round(r.ratio * 100)} %`}${images.length && !p.vision ? ' · sans photo' : ''}</button>`;
    }).join('');
    ov.querySelector('[data-cost]').textContent = `Coût : 1 requête sur chacune des ${picked.length} IA choisies (2 ou 3 maximum).`;
  };
  drawImgs(); drawIds();
  ov.querySelector('[data-ids]').addEventListener('click', e => {
    const b = e.target.closest('[data-id]');
    if (!b) return;
    const id = b.dataset.id;
    if (picked.includes(id)) { if (picked.length > 2) picked = picked.filter(x => x !== id); else toast('Au moins 2 IA'); }
    else if (picked.length < 3) picked.push(id); else toast('3 IA maximum');
    drawIds();
  });
  ov.querySelector('[data-photo]').onclick = async () => { images.push(...await pickImages()); drawImgs(); drawIds(); };

  ov.querySelector('[data-go]').onclick = async () => {
    const question2 = q.value.trim();
    if (!question2 && !images.length) { toast('Écris une question'); return; }
    const sys = system || base();
    const msgs = messages && question2 === question ? messages : [...(messages || []), { role: 'user', text: question2, images }];
    const cols = ov.querySelector('[data-cols]');
    cols.className = 'compare n' + picked.length;
    const res = {};
    cols.innerHTML = picked.map(id => `<div class="col" data-col="${id}"><div class="row"><strong>${esc(P(id).name)}</strong><span class="grow"></span><span class="small muted" data-st>…</span></div><div class="md" data-txt><span class="typing"></span></div><div class="row" data-act hidden><button class="btn sm" data-keep="${id}">Garder</button><button class="btn sm ghost" data-cp="${id}">Copier</button></div></div>`).join('');
    const go = ov.querySelector('[data-go]');
    go.disabled = true;
    await Promise.all(picked.map(async id => {
      const col = cols.querySelector(`[data-col="${id}"]`);
      const txt = col.querySelector('[data-txt]');
      let acc = '', raf = 0;
      const t0 = Date.now();
      try {
        const r = await callOne(id, { system: sys, messages: msgs, onDelta: d => { acc += d; if (!raf) raf = requestAnimationFrame(() => { raf = 0; txt.innerHTML = md(stripData(acc), { streaming: true }); }); } });
        res[id] = stripData(r.text);
        txt.innerHTML = md(res[id]);
        col.querySelector('[data-st]').textContent = ((Date.now() - t0) / 1000).toFixed(1) + ' s';
        col.querySelector('[data-act]').hidden = false;
      } catch (e) {
        txt.innerHTML = `<p class="muted">${esc(e.message)}</p>`;
        col.querySelector('[data-st]').textContent = 'échec';
      }
    }));
    go.disabled = false;
    const ok = Object.keys(res);
    const syn = ov.querySelector('[data-syn]');
    if (ok.length >= 2) {
      syn.innerHTML = `<button class="btn" data-syn-go>${icon('columns')}Comparer et faire la synthèse</button>`;
      syn.querySelector('[data-syn-go]').onclick = async () => {
        syn.innerHTML = '<div class="card md"><span class="typing"></span></div>';
        const box = syn.firstElementChild;
        let acc = '';
        try {
          const r = await chat({ system: base(), task: 'best', messages: [{ role: 'user', text: synthese(question2, ok.map(id => ({ name: P(id).name, text: res[id] }))) }], onDelta: d => { acc += d; box.innerHTML = md(acc, { streaming: true }); } });
          res.synthese = r.text;
          box.innerHTML = md(r.text) + `<div class="row" style="margin-top:10px"><span class="small muted">Synthèse par ${esc(r.providerName)}</span><span class="grow"></span><button class="btn sm primary" data-keep="synthese">Garder la synthèse</button></div>`;
          const best = ok.find(id => new RegExp('Meilleure réponse[\\s\\S]{0,80}' + P(id).name, 'i').test(r.text));
          if (best) cols.querySelector(`[data-col="${best}"]`)?.classList.add('best');
        } catch (e) { box.innerHTML = `<p class="muted">${esc(e.message)}</p>`; }
      };
    }
    ov.onclick = e => {
      const k = e.target.closest('[data-keep]'), c = e.target.closest('[data-cp]');
      if (c) copy(res[c.dataset.cp]);
      if (k) {
        const text = res[k.dataset.keep];
        if (onKeep) { onKeep(text); toast('Réponse gardée'); close(); }
        else copy(text);
      }
    };
  };
  paintIcons(ov);
  if (question && (messages || images.length)) ov.querySelector('[data-go]').click();
}
