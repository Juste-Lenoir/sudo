// Discussion réutilisable (atelier, assistant) : photos, dictée, 2e avis, côte à côte.
import { chat } from './ai.js';
import { md } from './md.js';
import { $, esc, toast, autoGrow, setupDictation, copy, icon, pickImages } from './ui.js';
import { logActivity } from './store.js';
import { openCompare } from './compare.js';

// Historique envoyé à l'IA : 30 derniers messages, photos seulement sur les 4 derniers.
export function context(list) {
  const l = list.filter(m => !m.error && (m.text || m.images?.length)).slice(-30);
  return l.map((m, i) => {
    const keepImg = i >= l.length - 4;
    return {
      role: m.role,
      text: (m.text || '') + (!keepImg && m.images?.length ? '\n[photo envoyée plus tôt]' : ''),
      images: keepImg ? (m.images || []) : [],
    };
  });
}

export function transcript(list, max = 14000) {
  const t = list.filter(m => !m.error).map(m => `${m.role === 'user' ? 'Apprenant' : 'Assistant'} : ${stripData(m.text || '').slice(0, 1500)}${m.images?.length ? ' [photo]' : ''}`).join('\n\n');
  return t.length > max ? '…' + t.slice(-max) : t;
}

// Bloc ```sudo {...}``` : données que l'IA renvoie à l'application (étapes validées, relevés).
export function readData(text) {
  const m = String(text).match(/```sudo\s*([\s\S]*?)```/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}
export const stripData = t => String(t).replace(/```sudo[\s\S]*?(```|$)/g, '').trim();

export function mountChat(root, { messages, system, save, quick = [], placeholder = 'Écris, dicte ou envoie une photo…', empty = '', onData, task = 'best' }) {
  root.classList.add('chat');
  root.innerHTML = `
    <div class="chat-log" aria-live="polite"></div>
    ${quick.length ? `<div class="chat-quick">${quick.map((q, i) => `<button type="button" class="chip" data-q="${i}">${esc(q.label)}</button>`).join('')}</div>` : ''}
    <form class="chat-form">
      <div class="chat-thumbs"></div>
      <div class="chat-row">
        <button type="button" class="round add-photo" aria-label="Ajouter une photo">${icon('camera')}</button>
        <textarea rows="1" placeholder="${esc(placeholder)}" aria-label="Message"></textarea>
        <button type="button" class="round mic" aria-label="Dicter" hidden>${icon('mic')}</button>
        <button type="submit" class="round go send" aria-label="Envoyer">${icon('send')}</button>
      </div>
    </form>`;
  const log = $('.chat-log', root), ta = $('textarea', root), form = $('form', root);
  const thumbs = $('.chat-thumbs', root), sendBtn = $('.send', root);
  let pending = [];
  let busy = null;
  let streamingIdx = -1;
  autoGrow(ta);
  setupDictation($('.mic', root), ta);

  const bubble = (m, i) => {
    if (m.role === 'user') {
      return `<div class="msg user">${m.images?.length ? `<div class="msg-imgs">${m.images.map(u => `<img src="${esc(u)}" alt="photo jointe">`).join('')}</div>` : ''}${m.text ? `<div>${esc(m.text).replace(/\n/g, '<br>')}</div>` : ''}</div>`;
    }
    if (m.queued) return `<div class="msg ai queued"><div class="msg-body small muted">${icon('cloud')} Pas de réseau : ta demande est gardée et partira toute seule au retour de la connexion.</div></div>`;
    const live = busy && i === streamingIdx;
    const data = !live && readData(m.text);
    const ok = data?.valider?.length ? `<div class="msg-ok">${icon('check')}Étape${data.valider.length > 1 ? 's' : ''} ${data.valider.join(', ')} validée${data.valider.length > 1 ? 's' : ''}</div>` : '';
    const actions = m.text && !m.error && !live
      ? `<button type="button" class="link" data-act="copy" data-i="${i}">Copier</button>${m.second ? '' : `<button type="button" class="link" data-act="second" data-i="${i}">2ᵉ avis</button><button type="button" class="link" data-act="compare" data-i="${i}">Côte à côte</button>`}`
      : '';
    const body = m.text ? md(stripData(m.text), { streaming: live }) : '<span class="typing"></span>';
    return `<div class="msg ai${m.error ? ' err' : ''}">${m.second ? '<div class="label">Deuxième avis</div>' : ''}${ok}<div class="msg-body md">${body}</div><div class="msg-meta">${esc(m.providerName || '')}${actions}</div></div>`;
  };

  function renderAll() {
    log.innerHTML = messages.length ? messages.map(bubble).join('') : `<div class="chat-empty">${empty}</div>`;
    scroll();
  }
  const scroll = () => { log.scrollTop = log.scrollHeight; };

  function setBusy(b) {
    sendBtn.innerHTML = icon(b ? 'stop' : 'send');
    sendBtn.setAttribute('aria-label', b ? 'Arrêter' : 'Envoyer');
    root.querySelectorAll('.chat-quick .chip').forEach(c => { c.disabled = b; });
  }

  async function runAI(ai, ctx, sys, opts = {}) {
    delete ai.queued;
    streamingIdx = messages.indexOf(ai);
    busy = new AbortController();
    setBusy(true);
    renderAll();
    const el = log.children[streamingIdx]?.querySelector('.msg-body');
    let raf = 0;
    const paint = () => { raf = 0; if (el) el.innerHTML = md(stripData(ai.text), { streaming: true }); scroll(); };
    try {
      const r = await chat({ system: sys, messages: ctx, signal: busy.signal, onInfo: toast, task, onDelta: t => { ai.text += t; if (!raf) raf = requestAnimationFrame(paint); }, ...opts });
      ai.text = r.text;
      ai.provider = r.provider;
      ai.providerName = r.providerName;
    } catch (e) {
      if (e.name === 'AbortError') ai.text = ai.text || '_(arrêté)_';
      else { ai.error = true; ai.text = e.message; }
    }
    busy = null;
    setBusy(false);
    const data = !ai.error && readData(ai.text);
    if (data && onData) await onData(data);
    renderAll();
    logActivity();
    await save?.();
  }

  async function send(text, images = []) {
    if (busy) return;
    text = (text || '').trim();
    if (!text && !images.length) return;
    messages.push({ role: 'user', text, images, ts: Date.now() });
    const ai = { role: 'assistant', text: '', ts: Date.now() };
    messages.push(ai);
    // Hors ligne : la demande attend le retour du réseau (rien n'est perdu).
    if (!navigator.onLine) { ai.queued = true; renderAll(); await save?.(); return; }
    await runAI(ai, context(messages.slice(0, -1)), await system());
  }

  // Demandes en attente : envoyées dès que le réseau revient (si la page est toujours affichée).
  async function flushQueued() {
    if (busy || !navigator.onLine || !document.body.contains(root)) return;
    const i = messages.findIndex(m => m.queued);
    if (i < 0) return;
    toast('Réseau revenu : envoi de ta demande en attente');
    await runAI(messages[i], context(messages.slice(0, i)), await system());
    flushQueued();
  }
  const onOnline = () => { if (!document.body.contains(root)) return window.removeEventListener('online', onOnline); flushQueued(); };
  window.addEventListener('online', onOnline);
  setTimeout(flushQueued, 600);

  async function secondOpinion(i) {
    if (busy) return;
    const orig = messages[i];
    const before = context(messages.slice(0, i));
    const sys = (await system()) + `\n\nMISSION SPÉCIALE : une autre IA (${orig.providerName || 'inconnue'}) a donné la réponse ci-dessous. Vérifie-la de façon critique : erreurs (commandes, syntaxe, versions, notions), ce qui est juste, ce qui manque, et s'il existait une méthode plus simple. Très court, en trois parties : Correct / À corriger / À compléter. N'ajoute pas de bloc sudo.\n\n--- Réponse à vérifier ---\n${stripData(orig.text)}`;
    const ai = { role: 'assistant', text: '', second: true, ts: Date.now() };
    messages.splice(i + 1, 0, ai);
    await runAI(ai, before, sys, { exclude: orig.provider ? [orig.provider] : [] });
  }

  async function compare(i) {
    const before = messages.slice(0, i);
    const lastUser = [...before].reverse().find(m => m.role === 'user');
    openCompare({
      question: lastUser?.text || '(photo)',
      images: lastUser?.images || [],
      messages: context(before),
      system: await system(),
      onKeep: async text => {
        messages.splice(i + 1, 0, { role: 'assistant', text, providerName: 'Réponse gardée (côte à côte)', second: false, ts: Date.now() });
        renderAll();
        await save?.();
      },
    });
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    if (busy) { busy.abort(); return; }
    const t = ta.value, imgs = pending;
    ta.value = ''; ta.dispatchEvent(new Event('input'));
    pending = []; drawThumbs();
    send(t, imgs);
  });
  ta.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(pointer: coarse)').matches) { e.preventDefault(); form.requestSubmit(); }
  });
  // Coller une capture d'écran directement (ordinateur).
  ta.addEventListener('paste', async e => {
    const files = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith('image/'));
    if (!files.length) return;
    e.preventDefault();
    const { compressImage } = await import('./ui.js');
    for (const f of files) pending.push(await compressImage(f));
    drawThumbs();
  });
  $('.add-photo', root).addEventListener('click', async () => {
    pending.push(...await pickImages());
    drawThumbs();
  });
  function drawThumbs() {
    thumbs.innerHTML = pending.map((u, i) => `<div class="thumb"><img src="${esc(u)}" alt=""><button type="button" data-rm="${i}" aria-label="Retirer">✕</button></div>`).join('');
  }
  thumbs.addEventListener('click', e => {
    const b = e.target.closest('[data-rm]');
    if (b) { pending.splice(+b.dataset.rm, 1); drawThumbs(); }
  });
  log.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const i = +b.dataset.i;
    if (b.dataset.act === 'copy') copy(stripData(messages[i].text));
    if (b.dataset.act === 'second') secondOpinion(i);
    if (b.dataset.act === 'compare') compare(i);
  });
  root.querySelector('.chat-quick')?.addEventListener('click', e => {
    const b = e.target.closest('[data-q]');
    if (!b) return;
    const q = quick[+b.dataset.q];
    const t = typeof q.text === 'function' ? q.text() : q.text;
    if (t) send(t);
  });

  renderAll();
  return {
    send, render: renderAll, isBusy: () => !!busy, focus: () => ta.focus(),
    attach: imgs => { pending.push(...imgs); drawThumbs(); ta.focus(); },
    setText: t => { ta.value = t; ta.dispatchEvent(new Event('input')); ta.focus(); },
  };
}
