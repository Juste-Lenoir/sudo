// Photos : capture rapide, identification, « je le branche où ? », « par où commencer ? »,
// photo annotée (étiquettes déplaçables pour corriger l'IA).
import { askJSON } from '../ai.js';
import { base, photoPrompt, PHOTO_MODES } from '../prompts.js';
import { dbAll, put, del, uid, getProfile, getKV, setKV } from '../store.js';
import { md } from '../md.js';
import { $, esc, toast, icon, pickImages, loadImage, download, paintIcons, loading, compressImage, fmtDate, sheet } from '../ui.js';
import { account, sendPhotos } from '../sync.js';

// ---------- Photo reçue d'un autre appareil (téléphone → ordinateur) ----------
let inbox = [];
const queue = [];
export function receivedPhoto({ src, from }) {
  queue.push({ src, from });
  if (queue.length === 1) showReceived();
}
async function showReceived() {
  const p = queue[0];
  if (!p) return;
  const m = location.hash.match(/^#\/atelier\/([\w-]+)/);
  const at = m ? (await dbAll('ateliers')).find(a => a.id === m[1]) : null;
  const sh = sheet(`<div class="row"><h2 style="margin:0">Photo reçue</h2><span class="grow"></span><button class="icon-btn" data-close aria-label="Fermer">${icon('x')}</button></div>
    <p class="small muted">Depuis ${esc(p.from)}${queue.length > 1 ? ` · encore ${queue.length - 1} après celle-ci` : ''}</p>
    <img src="${esc(p.src)}" alt="Photo reçue" style="width:100%;max-height:52vh;object-fit:contain;border-radius:12px;background:#111">
    <div class="row" style="margin-top:12px">
      ${at ? `<button class="btn primary" data-r="at">${icon('wrench')}Ajouter à « ${esc(at.title)} »</button>` : ''}
      <button class="btn ${at ? '' : 'primary'}" data-r="ana">${icon('camera')}Analyser</button>
      <button class="btn ghost" data-r="dl">${icon('file')}Télécharger</button>
    </div>`, { onClose: () => { queue.shift(); setTimeout(showReceived, 200); } });
  sh.el.addEventListener('click', async e => {
    const r = e.target.closest('[data-r]')?.dataset.r;
    if (!r) return;
    if (r === 'at') {
      at.photos ||= [];
      at.photos.push({ src: p.src, ts: Date.now(), resume: 'Photo envoyée depuis ' + p.from });
      at.updatedAt = Date.now();
      await put('ateliers', at);
      window.dispatchEvent(new CustomEvent('sudo:changed', { detail: [{ store: 'ateliers', id: at.id }] }));
      toast('Photo ajoutée à l’atelier (onglet Photos)');
    }
    if (r === 'ana') { inbox.push(p.src); if (location.hash === '#/photo') window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = '#/photo'; }
    if (r === 'dl') download(`photo-${Date.now()}.jpg`, p.src);
    sh.close();
  });
}

// ---------- Rotation (photo prise de travers) ----------
async function rotate(src) {
  const img = await loadImage(src);
  const c = document.createElement('canvas');
  c.width = img.naturalHeight; c.height = img.naturalWidth;
  const g = c.getContext('2d');
  g.translate(c.width / 2, c.height / 2);
  g.rotate(Math.PI / 2);
  g.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  return c.toDataURL('image/jpeg', 0.88);
}

// ---------- Photo annotée ----------
const clamp = (x, a = 0, b = 1000) => Math.max(a, Math.min(b, x));
function normBox(b) {
  if (!Array.isArray(b) || b.length !== 4) return null;
  let [y1, x1, y2, x2] = b.map(Number);
  if ([y1, x1, y2, x2].some(n => !isFinite(n))) return null;
  if (Math.max(y1, x1, y2, x2) <= 1.001) { y1 *= 1000; x1 *= 1000; y2 *= 1000; x2 *= 1000; }
  return [clamp(Math.min(y1, y2)), clamp(Math.min(x1, x2)), clamp(Math.max(y1, y2)), clamp(Math.max(x1, x2))];
}

export function annotated(src, elements) {
  const els = elements.map((e, i) => {
    const b = normBox(e.box);
    if (!b) return null;
    // Étiquette au-dessus de la boîte, ou en dessous si la boîte touche le haut ; jamais coupée sur les côtés.
    const lx = e.lx ?? clamp((b[1] + b[3]) / 2, 90, 910);
    const ly = e.ly ?? (b[0] < 70 ? Math.min(1000, b[2] + 60) : b[0]);
    return { ...e, n: i + 1, b, lx, ly };
  }).filter(Boolean);
  const html = `<div class="annot" data-annot>
    <img src="${esc(src)}" alt="Photo annotée">
    <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">${els.map(e => `<rect class="box ${e.sur === false ? 'unsure' : ''}" x="${e.b[1]}" y="${e.b[0]}" width="${e.b[3] - e.b[1]}" height="${e.b[2] - e.b[0]}" rx="6"/>`).join('')}</svg>
    ${els.map(e => `<div class="lab ${e.sur === false ? 'unsure' : ''}" data-lab="${e.n - 1}" style="left:${e.lx / 10}%;top:${e.ly / 10}%" title="${esc(e.detail || '')}"><b>${e.n}</b>${esc(e.nom)}</div>`).join('')}
  </div>`;
  return { html, els };
}

// Déplacer une étiquette au doigt ou à la souris pour corriger l'IA.
function dragLabels(root, elements, onMove) {
  root.querySelectorAll('[data-lab]').forEach(lab => {
    lab.addEventListener('pointerdown', e => {
      e.preventDefault();
      lab.setPointerCapture(e.pointerId);
      const box = root.getBoundingClientRect();
      const move = ev => {
        const x = clamp(((ev.clientX - box.left) / box.width) * 1000);
        const y = clamp(((ev.clientY - box.top) / box.height) * 1000 + 20);
        lab.style.left = x / 10 + '%'; lab.style.top = y / 10 + '%';
        const el = elements[+lab.dataset.lab];
        if (el) { el.lx = x; el.ly = y; }
      };
      const up = () => { lab.removeEventListener('pointermove', move); lab.removeEventListener('pointerup', up); onMove?.(); };
      lab.addEventListener('pointermove', move);
      lab.addEventListener('pointerup', up);
    });
  });
}

// Image annotée en PNG (pour le compte rendu ou le carnet).
async function exportPNG(src, elements) {
  const img = await loadImage(src);
  const W = img.naturalWidth, H = img.naturalHeight;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const s = Math.max(1, W / 900);
  g.font = `600 ${Math.round(15 * s)}px -apple-system, Inter, sans-serif`;
  elements.forEach((e, i) => {
    const b = normBox(e.box);
    if (!b) return;
    const col = e.sur === false ? '#FACC15' : '#4ADE80';
    g.strokeStyle = col; g.lineWidth = 3 * s;
    if (e.sur === false) g.setLineDash([10 * s, 6 * s]); else g.setLineDash([]);
    g.strokeRect(b[1] / 1000 * W, b[0] / 1000 * H, (b[3] - b[1]) / 1000 * W, (b[2] - b[0]) / 1000 * H);
    const t = `${i + 1} ${e.nom}`;
    const x = (e.lx ?? (b[1] + b[3]) / 2) / 1000 * W, y = (e.ly ?? b[0]) / 1000 * H;
    const w = g.measureText(t).width + 16 * s, h = 26 * s;
    g.setLineDash([]);
    g.fillStyle = '#000'; g.fillRect(x - w / 2, y - h, w, h);
    g.strokeRect(x - w / 2, y - h, w, h);
    g.fillStyle = '#F5F5F5'; g.fillText(t, x - w / 2 + 8 * s, y - 8 * s);
  });
  return c.toDataURL('image/png');
}

function resultHTML(r, src) {
  const { html } = annotated(src, r.elements || []);
  return `<div class="stack">
    ${r.resume ? `<p style="margin:0"><strong>${esc(r.resume)}</strong></p>` : ''}
    ${r.reference ? `<span class="tag ok">Référence lue : ${esc(r.reference)}</span>` : ''}
    ${html}
    <p class="small muted" style="margin:0">Une étiquette mal placée ? Fais-la glisser au bon endroit. En jaune : l'IA n'est pas sûre.</p>
    ${(r.elements || []).length ? `<div class="card legend">${r.elements.map((e, i) => `<div class="li"><span class="n">${i + 1}</span><div><strong>${esc(e.nom)}</strong>${e.sur === false ? ' <span class="tag mid">à vérifier</span>' : ''}<div class="small muted">${esc(e.detail || '')}</div></div></div>`).join('')}</div>` : ''}
    ${r.reponse ? `<div class="card md">${md(r.reponse)}</div>` : ''}
    ${(r.etapes || []).length ? `<div class="card"><h3>Dans l'ordre</h3><ol class="md" style="margin:0;padding-left:20px">${r.etapes.map(x => `<li>${esc(x)}</li>`).join('')}</ol></div>` : ''}
    ${(r.securite || []).length ? `<div class="clarify"><strong>Sécurité</strong><ul>${r.securite.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
    ${r.autre_photo ? `<div class="clarify"><strong>Pour être sûr</strong><ul><li>${esc(r.autre_photo)}</li></ul></div>` : ''}
    <div class="small muted">Analyse par ${esc(r._by || 'IA')}</div>
  </div>`;
}

// Analyse dans une feuille (depuis un atelier).
export async function analysePhoto({ images, context = '', mode = 'identifier', question = '', onResult }) {
  const { sheet } = await import('../ui.js');
  const sh = sheet(`<div class="row"><h2 style="margin:0">Analyse de la photo</h2><span class="grow"></span><button class="icon-btn" data-close aria-label="Fermer">${icon('x')}</button></div><div data-out style="margin-top:12px"></div>`);
  const out = $('[data-out]', sh.el);
  await runAnalysis(out, { images, context, mode, question, onResult });
}

async function runAnalysis(out, { images, context, mode, question, onResult }) {
  loading(out, 'Analyse de la photo');
  try {
    const prof = await getProfile();
    const r = await askJSON({ system: base(prof), prompt: photoPrompt(mode, question, context), images, task: 'best', needBoxes: true, onInfo: toast });
    r.elements = (r.elements || []).filter(e => e && e.nom);
    out.innerHTML = resultHTML(r, images[0]) + `<div class="row" style="margin-top:12px"><button class="btn" data-png>${icon('image')}Image annotée (.png)</button></div>`;
    const annot = $('[data-annot]', out);
    dragLabels(annot, r.elements, () => onResult?.(r));
    $('[data-png]', out).onclick = async () => download('photo-annotee.png', await exportPNG(images[0], r.elements));
    paintIcons(out);
    await onResult?.(r);
    return r;
  } catch (e) {
    out.innerHTML = `<div class="card"><p>L'analyse n'a pas marché : ${esc(e.message)}</p><p class="small muted">Il faut une IA qui lit les photos (Gemini, OpenRouter ou une IA payante).</p></div>`;
    return null;
  }
}

// ---------- Page « Photo » ----------
export async function photoView(v) {
  let images = inbox; inbox = [];
  let mode = 'identifier';
  const acc = await account();
  const history = [...await getKV('photo-queue', []), ...(await dbAll('photos')).sort((a, b) => b.ts - a.ts).slice(0, 12)];
  const ateliers = (await dbAll('ateliers')).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 15);
  v.innerHTML = `
    <h1>Photo</h1>
    <p class="sub">Composants, câbles, ports, écran, tableau du formateur : prends la photo, sudo t'explique.</p>
    <div class="stack" style="max-width:820px">
      <div class="dropzone" data-drop>
        <div data-imgs class="row" style="justify-content:center"></div>
        <div class="row" style="justify-content:center">
          <button class="btn primary big" data-cam>${icon('camera')}Prendre une photo</button>
          <button class="btn ghost" data-files>${icon('image')}Choisir</button>
        </div>
        <div class="small">Sur ordinateur : glisse une image ici ou colle une capture (Ctrl+V / ⌘V). Ajoute plusieurs photos pour « je le branche où ? » (l'élément puis la carte mère).</div>
      </div>
      <div class="row" data-modes>${Object.entries(PHOTO_MODES).map(([k, m]) => `<button class="chip ${k === mode ? 'on' : ''}" data-mode="${k}" title="${esc(m.desc)}">${esc(m.label)}</button>`).join('')}</div>
      <label class="field" data-qwrap hidden>Ta question<input class="input" data-q placeholder="Ex. : j'ai ce câble, je le branche où sur la carte mère ?"></label>
      <label class="field">Pour quel atelier ? (facultatif, aide l'IA)
        <select class="input" data-at><option value="">Aucun</option>${ateliers.map(a => `<option value="${a.id}">${esc(a.title)}</option>`).join('')}</select></label>
      <button class="btn primary big block" data-go disabled>Analyser</button>
      ${acc ? `<button class="btn block" data-send disabled>${icon('share')}Envoyer à l’ordinateur</button>` : ''}
      <div data-out></div>
      ${history.length ? `<div><div class="label" style="margin-top:18px">Dernières analyses</div><div class="list">${history.map(h => `<button class="item" data-hist="${h.id}"><img src="${esc(h.src)}" alt="" style="width:48px;height:48px;object-fit:cover;border-radius:8px"><div class="grow"><div class="t">${h.pending ? 'En attente du réseau' : esc(h.r?.resume || 'Photo')}</div><div class="s">${fmtDate(h.ts)} · ${esc(PHOTO_MODES[h.mode]?.label || '')}</div></div></button>`).join('')}</div></div>` : ''}
    </div>`;
  const drop = $('[data-drop]', v), go = $('[data-go]', v);
  const drawImgs = () => {
    $('[data-imgs]', v).innerHTML = images.map((u, i) => `<div class="thumb" style="position:relative"><img src="${esc(u)}" alt="" style="width:96px;height:96px"><button data-rm="${i}" aria-label="Retirer">✕</button><button data-rot="${i}" aria-label="Tourner" style="position:absolute;left:4px;bottom:4px;width:28px;height:28px;border-radius:14px;border:0;background:#000c;color:#fff">${icon('rotate')}</button></div>`).join('');
    go.disabled = !images.length;
    const sb = $('[data-send]', v); if (sb) sb.disabled = !images.length;
  };
  $('[data-send]', v)?.addEventListener('click', async e => {
    const b = e.currentTarget;
    b.disabled = true; b.textContent = 'Envoi…';
    try { await sendPhotos(images); toast(`${images.length > 1 ? images.length + ' photos envoyées' : 'Photo envoyée'} : ouvre sudo sur l’ordinateur`); images = []; drawImgs(); }
    catch (x) { toast(x.message, 5000); }
    b.innerHTML = `${icon('share')}Envoyer à l’ordinateur`;
    b.disabled = !images.length;
  });
  const add = imgs => { images.push(...imgs); drawImgs(); };
  $('[data-cam]', v).onclick = async () => add(await pickImages({ camera: true }));
  $('[data-files]', v).onclick = async () => add(await pickImages());
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', async e => {
    e.preventDefault(); drop.classList.remove('over');
    const files = [...e.dataTransfer.files].filter(f => f.type.startsWith('image/'));
    add(await Promise.all(files.map(f => compressImage(f))));
  });
  const onPaste = async e => {
    if (!v.isConnected) { document.removeEventListener('paste', onPaste); return; }
    const files = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith('image/'));
    if (files.length) add(await Promise.all(files.map(f => compressImage(f))));
  };
  document.addEventListener('paste', onPaste);
  $('[data-imgs]', v).addEventListener('click', async e => {
    const rm = e.target.closest('[data-rm]'), rot = e.target.closest('[data-rot]');
    if (rm) { images.splice(+rm.dataset.rm, 1); drawImgs(); }
    if (rot) { images[+rot.dataset.rot] = await rotate(images[+rot.dataset.rot]); drawImgs(); }
  });
  $('[data-modes]', v).addEventListener('click', e => {
    const b = e.target.closest('[data-mode]');
    if (!b) return;
    mode = b.dataset.mode;
    v.querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('on', x === b));
    $('[data-qwrap]', v).hidden = mode === 'identifier';
    $('[data-q]', v).placeholder = { brancher: "Ex. : j'ai ce câble, je le branche où ?", ordre: 'Ex. : atelier de montage de PC, par où commencer ?', question: 'Ta question sur la photo' }[mode] || '';
  });
  go.onclick = async () => {
    const q = $('[data-q]', v).value.trim();
    if (mode === 'question' && !q) { toast('Écris ta question'); return; }
    const atId = $('[data-at]', v).value;
    const at = ateliers.find(a => a.id === atId);
    const context = at ? `${at.title} — ${at.analysis?.reformulation || at.consigne?.text?.slice(0, 400) || ''}` : '';
    go.disabled = true;
    const shots = images.slice();
    const out = $('[data-out]', v);
    // Hors ligne : la photo est gardée et analysée au retour du réseau.
    if (!navigator.onLine) {
      // File d'attente propre à cet appareil (pas synchronisée : un seul appareil l'analyse).
      const queue = await getKV('photo-queue', []);
      queue.push({ id: uid(), ts: Date.now(), src: shots[0], images: shots, mode, q, context, pending: true });
      await setKV('photo-queue', queue);
      toast('Pas de réseau : photo gardée, elle sera analysée au retour de la connexion', 5000);
      images = []; photoView(v);
      return;
    }
    const r = await runAnalysis(out, { images: shots, context, mode, question: q });
    go.disabled = false;
    if (!r) return;
    const rec = { id: uid(), ts: Date.now(), src: shots[0], mode, q, r };
    await put('photos', rec);
    if (at) {
      out.insertAdjacentHTML('beforeend', `<div class="row" style="margin-top:10px"><button class="btn" data-toat>${icon('wrench')}Ajouter à « ${esc(at.title)} »</button></div>`);
      $('[data-toat]', out).onclick = async () => {
        const full = (await dbAll('ateliers')).find(a => a.id === at.id);
        full.photos ||= [];
        full.photos.push({ src: shots[0], ts: Date.now(), resume: r.resume, analyse: r });
        full.updatedAt = Date.now();
        await put('ateliers', full);
        toast('Photo ajoutée à l\'atelier');
      };
      paintIcons(out);
    }
    out.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  v.addEventListener('click', async e => {
    const h = e.target.closest('[data-hist]');
    if (!h) return;
    const rec = history.find(x => x.id === h.dataset.hist);
    const { sheet } = await import('../ui.js');
    if (rec.pending) {
      const sh = sheet(`<div class="row"><h2 style="margin:0">Photo en attente</h2><span class="grow"></span><button class="icon-btn" data-close aria-label="Fermer">${icon('x')}</button></div><img src="${esc(rec.src)}" alt="" style="max-width:100%;border-radius:12px;margin-top:12px"><p class="small muted">Elle sera analysée dès que le réseau revient (sudo ouvert).</p><div class="row"><button class="btn danger" data-delh>${icon('trash')}Supprimer</button></div>`);
      $('[data-delh]', sh.el).onclick = async () => { await setKV('photo-queue', (await getKV('photo-queue', [])).filter(x => x.id !== rec.id)); sh.close(); photoView(v); };
      return;
    }
    const sh = sheet(`<div class="row"><h2 style="margin:0">Analyse du ${fmtDate(rec.ts)}</h2><span class="grow"></span><button class="icon-btn" data-close aria-label="Fermer">${icon('x')}</button></div><div style="margin-top:12px">${resultHTML(rec.r, rec.src)}</div><div class="row" style="margin-top:12px"><button class="btn danger" data-delh>${icon('trash')}Supprimer</button></div>`);
    dragLabels($('[data-annot]', sh.el), rec.r.elements || [], () => put('photos', rec));
    $('[data-delh]', sh.el).onclick = async () => { await del('photos', rec.id); sh.close(); photoView(v); };
  });
  if (images.length) drawImgs();
  paintIcons(v);
}

// Photos gardées hors ligne : analysées dès que le réseau revient.
let flushing = false;
export async function processPendingPhotos() {
  if (flushing || !navigator.onLine) return;
  flushing = true;
  try {
    const list = await getKV('photo-queue', []);
    for (const rec of list) {
      try {
        const prof = await getProfile();
        const r = await askJSON({ system: base(prof), prompt: photoPrompt(rec.mode, rec.q, rec.context || ''), images: rec.images || [rec.src], task: 'best', needBoxes: true });
        r.elements = (r.elements || []).filter(e => e && e.nom);
        const done = { id: rec.id, ts: rec.ts, src: rec.src, mode: rec.mode, q: rec.q, r };
        await put('photos', done);
        await setKV('photo-queue', (await getKV('photo-queue', [])).filter(x => x.id !== rec.id));
        toast('Photo en attente analysée : voir Photo → Dernières analyses', 5000);
      } catch (e) { if (!navigator.onLine) break; toast('Photo en attente : ' + e.message, 5000); break; }
    }
  } finally { flushing = false; }
}
