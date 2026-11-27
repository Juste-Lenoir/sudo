// Assistant : discussion libre, formateur (4 modes) et accès au mode côte à côte.
import { getKV, setKV, getProfile } from '../store.js';
import { formateurSystem, MODES, base } from '../prompts.js';
import { mountChat } from '../chat.js';
import { openCompare } from '../compare.js';
import { DOMAINS } from '../domains.js';
import { $, esc, icon, paintIcons, params, domainOptions } from '../ui.js';

const ALL = { libre: { label: 'Question libre', desc: 'Pose ta question, envoie une photo.' }, ...MODES };

export async function assistantView(v) {
  const prof = await getProfile();
  const st = await getKV('assistant', { mode: 'libre', dom: 'reseau', chats: {} });
  st.chats ||= {};
  const key = () => st.mode + ':' + st.dom;

  function draw() {
    v.innerHTML = `
      <div class="row" style="margin-bottom:12px"><h1 style="margin:0">Assistant</h1><span class="grow"></span>
        <button class="btn ghost" data-compare>${icon('columns')}Côte à côte</button></div>
      <div class="row" style="margin-bottom:10px">${Object.entries(ALL).map(([k, m]) => `<button class="chip ${st.mode === k ? 'on' : ''}" data-mode="${k}" title="${esc(m.desc)}">${esc(m.label)}</button>`).join('')}</div>
      <div class="row" style="margin-bottom:12px">
        ${st.mode !== 'libre' ? `<label class="small muted">Domaine <select class="input" data-dom style="width:auto;min-height:36px;padding:4px 10px">${domainOptions(st.dom)}</select></label>` : `<span class="small muted">${esc(ALL[st.mode].desc)}</span>`}
        <span class="grow"></span><button class="link" data-new>Nouvelle discussion</button></div>
      <div class="card" style="padding:0;height:calc(100vh - 300px);min-height:440px;display:flex;flex-direction:column" data-chat></div>`;
    const messages = st.chats[key()] ||= [];
    const starter = { panne: 'Lance un scénario de panne.', oral: 'Commence l’examen oral.' }[st.mode];
    const api = mountChat($('[data-chat]', v), {
      messages,
      system: async () => (st.mode === 'libre' ? base(prof) : formateurSystem(prof, st.mode, st.dom)),
      save: () => setKV('assistant', st),
      empty: st.mode === 'libre' ? 'Une question, une photo d\'écran ou d\'erreur, une commande à comprendre…' : esc(ALL[st.mode].desc),
      quick: starter && !messages.length ? [{ label: starter, text: starter }] : [],
    });
    v.querySelectorAll('[data-mode]').forEach(b => b.onclick = async () => { st.mode = b.dataset.mode; await setKV('assistant', st); draw(); });
    $('[data-dom]', v)?.addEventListener('change', async e => { st.dom = e.target.value; await setKV('assistant', st); draw(); });
    $('[data-new]', v).onclick = async () => { if (!messages.length || confirm('Effacer cette discussion ?')) { st.chats[key()] = []; await setKV('assistant', st); draw(); } };
    $('[data-compare]', v).onclick = () => openCompare({ system: base(prof), onKeep: text => { messages.push({ role: 'assistant', text, providerName: 'Réponse gardée (côte à côte)', ts: Date.now() }); setKV('assistant', st); api.render(); } });
    paintIcons(v);
  }
  draw();
  if (params().mode === 'compare') openCompare({ system: base(prof) });
}
