// Sous-réseaux IPv4 : exercices illimités et calculatrice avec découpage binaire.
// 100 % hors ligne, sans IA.
import { getKV, setKV } from '../store.js';
import { record, bump } from '../progress.js';
import { $, $$, esc, icon, paintIcons, copy, params } from '../ui.js';

// ---------- Calculs ----------
const toInt = ip => ip.split('.').reduce((a, o) => ((a << 8) + +o) >>> 0, 0);
export const toIp = n => [24, 16, 8, 0].map(s => (n >>> s) & 255).join('.');
const maskOf = p => (p === 0 ? 0 : (0xFFFFFFFF << (32 - p)) >>> 0);
export const validIp = s => /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(s) && s.split('.').every(o => +o <= 255);
const prefixOfMask = m => { if (!validIp(m)) return null; const n = toInt(m); for (let p = 0; p <= 32; p++) if (maskOf(p) === n) return p; return null; };

export function calc(ip, p) {
  const n = toInt(ip), m = maskOf(p);
  const net = (n & m) >>> 0, bc = (net | (~m >>> 0)) >>> 0;
  const hosts = p >= 31 ? (p === 31 ? 2 : 1) : 2 ** (32 - p) - 2;
  const o1 = n >>> 24;
  return {
    ip, p, mask: toIp(m), wildcard: toIp(~m >>> 0), net: toIp(net), bc: toIp(bc), netInt: net,
    first: p >= 31 ? toIp(net) : toIp(net + 1), last: p >= 31 ? toIp(bc) : toIp(bc - 1), hosts,
    cls: o1 < 128 ? 'A' : o1 < 192 ? 'B' : o1 < 224 ? 'C' : o1 < 240 ? 'D (multicast)' : 'E',
    priv: /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip), loop: o1 === 127, apipa: /^169\.254\./.test(ip),
  };
}

// Découpage binaire : bits réseau en vert, bits hôte en gris, séparation au préfixe.
export function binView(ip, p, rows = ['ip', 'mask', 'net']) {
  const c = calc(ip, p);
  const lines = { ip: ['Adresse', ip, toInt(ip)], mask: ['Subnet Mask', c.mask, maskOf(p)], net: ['Network', c.net, c.netInt], bc: ['Broadcast', c.bc, toInt(c.bc)] };
  return `<div class="bin" role="img" aria-label="Découpage binaire de ${esc(ip)}/${p}">${rows.map(r => {
    const [label, dotted, n] = lines[r];
    const bits = n.toString(2).padStart(32, '0');
    let h = '';
    for (let i = 0; i < 32; i++) {
      if (i && i % 8 === 0) h += '<i class="dot">.</i>';
      h += `<b class="${i < p ? 'n' : 'h'}${i === p - 1 ? ' cut' : ''}">${bits[i]}</b>`;
    }
    return `<div class="bin-row"><div class="bin-l"><span>${label}</span><code>${dotted}</code></div><div class="bin-b">${h}</div></div>`;
  }).join('')}<div class="bin-key small muted"><span><b class="n">1</b> partie réseau (${p} bits)</span><span><b class="h">0</b> partie hôte (${32 - p} bits)</span></div></div>`;
}

// ---------- Exercices ----------
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const randIp = () => [() => `10.${rnd(0, 255)}.${rnd(0, 255)}.${rnd(1, 254)}`, () => `172.${rnd(16, 31)}.${rnd(0, 255)}.${rnd(1, 254)}`, () => `192.168.${rnd(0, 255)}.${rnd(1, 254)}`][rnd(0, 2)]();
const prefixFor = level => (level === 'facile' ? [8, 16, 24][rnd(0, 2)] : level === 'moyen' ? rnd(24, 30) : rnd(17, 30));

const KINDS = {
  calc: 'Calculer un sous-réseau',
  hosts: 'Masque pour N hôtes',
  same: 'Même réseau ?',
};
function newEx(level, kind) {
  const k = kind === 'mix' ? ['calc', 'calc', 'hosts', 'same'][rnd(0, 3)] : kind;
  if (k === 'hosts') {
    const p = level === 'facile' ? rnd(24, 28) : rnd(20, 29);
    const max = 2 ** (32 - p) - 2, min = 2 ** (32 - p - 1) - 1;
    const need = rnd(min, max);
    return { k, need, ans: { p: String(p), mask: toIp(maskOf(p)) }, p };
  }
  if (k === 'same') {
    const p = prefixFor(level === 'facile' ? 'moyen' : level);
    const a = randIp();
    const c = calc(a, p);
    const size = 2 ** (32 - p);
    const sameNet = Math.random() < 0.5;
    const off = sameNet ? rnd(1, Math.max(1, size - 2)) : (Math.random() < .5 ? size : -size) + rnd(1, Math.max(1, size - 2));
    const b = toIp((c.netInt + off) >>> 0);
    const same = calc(b, p).net === c.net;
    return { k, a, b, p, ans: { same: same ? 'oui' : 'non' } };
  }
  const ip = randIp(), p = prefixFor(level);
  const c = calc(ip, p);
  return { k: 'calc', ip, p, c, ans: { mask: c.mask, net: c.net, bc: c.bc, first: c.first, last: c.last, hosts: String(c.hosts) } };
}

const FIELDS = { mask: 'Subnet Mask', net: 'Adresse réseau (Network)', bc: 'Broadcast', first: 'Première adresse utilisable', last: 'Dernière adresse utilisable', hosts: "Nombre d'hôtes utilisables" };

export async function subnetView(v) {
  const stats = await getKV('subnet', { done: 0, ok: 0, streak: 0, best: 0 });
  const opt = await getKV('subnet-opt', { level: 'moyen', kind: 'mix' });
  let tab = params().tab === 'calc' ? 'calc' : 'train';
  let ex = newEx(opt.level, opt.kind);
  let checked = false;

  function shell() {
    v.innerHTML = `
      <div class="row" style="margin-bottom:12px"><a class="icon-btn" href="#/reviser" aria-label="Retour">${icon('back')}</a><h1 style="margin:0">Sous-réseaux</h1><span class="grow"></span><span class="tag">hors ligne</span></div>
      <div class="seg" role="tablist" style="margin-bottom:14px"><button data-t="train" class="${tab === 'train' ? 'on' : ''}">Exercices</button><button data-t="calc" class="${tab === 'calc' ? 'on' : ''}">Calculatrice IPv4</button></div>
      <div data-panel style="max-width:820px"></div>`;
    $$('[data-t]', v).forEach(b => b.onclick = () => { tab = b.dataset.t; shell(); });
    tab === 'train' ? train() : calculator();
  }

  // ----- Entraînement -----
  const statsHTML = () => `<span><b class="mono">${stats.ok}</b>/<span class="mono">${stats.done}</span> justes</span><span>Série <b class="mono">${stats.streak}</b></span><span class="muted">record ${stats.best}</span>`;
  function train() {
    const p = $('[data-panel]', v);
    const sel = (k, vals, cur) => `<select class="input" data-o="${k}" style="width:auto;min-height:38px;padding:4px 10px">${vals.map(([x, l]) => `<option value="${x}" ${x === cur ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    p.innerHTML = `
      <div class="card row small" style="gap:14px">
        <span class="row small" style="gap:14px" data-st>${statsHTML()}</span><span class="grow"></span>
        ${sel('level', [['facile', 'Facile (/8 /16 /24)'], ['moyen', 'Moyen'], ['difficile', 'Difficile']], opt.level)}
        ${sel('kind', [['mix', 'Tout mélanger'], ...Object.entries(KINDS)], opt.kind)}
      </div>
      <div class="qcard stack" style="margin-top:12px" data-ex></div>`;
    $$('[data-o]', p).forEach(s => s.onchange = async () => { opt[s.dataset.o] = s.value; await setKV('subnet-opt', opt); ex = newEx(opt.level, opt.kind); checked = false; drawEx(); });
    drawEx();
  }

  function drawEx() {
    const box = $('[data-ex]', v);
    let q, fields;
    if (ex.k === 'calc') {
      q = `Pour l'adresse <code class="big-ip">${ex.ip}/${ex.p}</code>, trouve :`;
      fields = Object.keys(FIELDS);
    } else if (ex.k === 'hosts') {
      q = `Il te faut <b class="mono">${ex.need}</b> adresses utilisables pour les hôtes dans un même sous-réseau. Quel est le plus petit sous-réseau possible (le préfixe le plus grand) ?`;
      fields = ['p', 'mask'];
    } else {
      q = `<code class="big-ip">${ex.a}/${ex.p}</code> et <code class="big-ip">${ex.b}/${ex.p}</code> sont-elles dans le même réseau ?`;
      fields = ['same'];
    }
    const lab = { ...FIELDS, p: 'Préfixe (CIDR), ex. 26', same: 'Réponse' };
    box.innerHTML = `
      <div class="label" style="margin:0">${KINDS[ex.k]}</div>
      <p class="q" style="margin:0">${q}</p>
      <form class="grid2 sn-form" data-f autocomplete="off">
        ${fields.map(f => f === 'same'
          ? `<div class="row" style="grid-column:1/-1"><button type="button" class="btn ghost" data-same="oui">Oui, même réseau</button><button type="button" class="btn ghost" data-same="non">Non</button></div>`
          : `<label class="field">${lab[f]}<input class="input mono" name="${f}" inputmode="${f === 'hosts' || f === 'p' ? 'numeric' : 'decimal'}" spellcheck="false" autocapitalize="off"></label>`).join('')}
        <div class="row" style="grid-column:1/-1"><button class="btn primary" type="submit" ${ex.k === 'same' ? 'hidden' : ''}>${icon('check')}Vérifier</button><button class="btn ghost" type="button" data-show>Voir la solution</button><span class="grow"></span><button class="btn ghost" type="button" data-next>Suivant</button></div>
      </form>
      <div data-res></div>`;
    const f = $('[data-f]', box);
    f.onsubmit = e => { e.preventDefault(); check(false); };
    $$('[data-same]', box).forEach(b => b.onclick = () => { f.dataset.same = b.dataset.same; $$('[data-same]', box).forEach(x => x.classList.toggle('chip-on', x === b)); check(false); });
    $('[data-show]', box).onclick = () => check(true);
    $('[data-next]', box).onclick = () => { ex = newEx(opt.level, opt.kind); checked = false; drawEx(); box.querySelector('input')?.focus(); };
    paintIcons(box);
  }

  async function check(reveal) {
    const box = $('[data-ex]', v), f = $('[data-f]', box);
    const norm = s => String(s || '').trim().replace(/^\//, '').replace(/\s/g, '');
    let allOk = true;
    for (const [k, want] of Object.entries(ex.ans)) {
      if (k === 'same') { allOk = f.dataset.same === want; continue; }
      const inp = f.elements[k];
      let ok = norm(inp.value) === want;
      if (k === 'p' && !ok && ex.k === 'hosts') ok = norm(inp.value) === want;
      if (k === 'mask' && ex.k === 'hosts' && !ok) ok = prefixOfMask(norm(inp.value) || '0.0.0.0') === +want && validIp(norm(inp.value));
      inp.classList.toggle('ok', ok);
      inp.classList.toggle('ko', !ok && !!inp.value);
      if (reveal && !ok) { inp.value = want; inp.classList.add('shown'); }
      allOk &&= ok;
    }
    if (reveal) allOk = false;
    if (!checked) {
      checked = true;
      stats.done++;
      if (allOk) { stats.ok++; stats.streak++; stats.best = Math.max(stats.best, stats.streak); } else stats.streak = 0;
      await setKV('subnet', stats);
      const stEl = $('[data-st]', v);
      if (stEl) stEl.innerHTML = statsHTML();
      await record('reseau', [{ label: 'Sous-réseaux : ' + KINDS[ex.k].toLowerCase(), ok: allOk }], { questions: false });
      await bump('practice');
    }
    const ip = ex.k === 'calc' ? ex.ip : ex.k === 'same' ? ex.a : '192.168.1.0';
    const explain = ex.k === 'hosts'
      ? `<p class="small">Il faut <b class="mono">2ⁿ − 2 ≥ ${ex.need}</b> (on retire l'adresse réseau et le broadcast). Avec n = <b class="mono">${32 - ex.p}</b> bits d'hôte : 2^${32 - ex.p} − 2 = <b class="mono">${2 ** (32 - ex.p) - 2}</b>. Préfixe = 32 − ${32 - ex.p} = <b class="mono">/${ex.p}</b>.</p>`
      : ex.k === 'same'
        ? `<p class="small">On applique le masque aux deux adresses : <code>${calc(ex.a, ex.p).net}</code> et <code>${calc(ex.b, ex.p).net}</code>. ${ex.ans.same === 'oui' ? 'Même adresse réseau : même réseau.' : 'Adresses réseau différentes : il faut un routeur pour passer de l\'une à l\'autre.'}</p>`
        : `<p class="small">Taille du bloc : 2^${32 - ex.p} = <b class="mono">${2 ** (32 - ex.p)}</b> adresses. L'adresse réseau a tous les bits d'hôte à 0, le broadcast tous à 1.</p>`;
    $('[data-res]', box).innerHTML = `<div class="stack" style="margin-top:6px">
      <div class="verdict ${allOk ? 'juste' : 'faux'} ${allOk ? 'celebrate' : ''}">${icon(allOk ? 'check' : 'x')}${allOk ? 'Juste' : reveal ? 'Solution' : 'Pas tout à fait'}${allOk && stats.streak > 2 ? ` · série de ${stats.streak}` : ''}</div>
      ${explain}${binView(ip, ex.p, ex.k === 'calc' ? ['ip', 'mask', 'net', 'bc'] : ['ip', 'mask', 'net'])}</div>`;
    paintIcons(box);
  }

  // ----- Calculatrice -----
  function calculator() {
    const p = $('[data-panel]', v);
    const last = sessionStorage.getItem('sudo-calc') || '192.168.10.77/26';
    p.innerHTML = `
      <div class="card stack">
        <label class="field">Adresse IPv4 avec préfixe ou masque<input class="input mono" data-in value="${esc(last)}" placeholder="192.168.1.10/24 ou 192.168.1.10 255.255.255.0" spellcheck="false" autocapitalize="off" inputmode="decimal"></label>
        <div class="row"><input type="range" min="0" max="32" data-range style="flex:1;accent-color:var(--brand)" aria-label="Préfixe"><code data-plab class="mono" style="min-width:36px"></code></div>
      </div>
      <div data-out style="margin-top:12px"></div>
      <div class="card stack" style="margin-top:12px">
        <h2 style="margin:0">Découper ce réseau</h2>
        <div class="row"><div class="seg" data-by><button data-b="n" class="on">N sous-réseaux</button><button data-b="h">N hôtes chacun</button></div>
          <input class="input mono" data-n type="number" min="1" value="4" style="width:110px"></div>
        <div data-split></div>
      </div>`;
    let by = 'n';
    const inp = $('[data-in]', p), range = $('[data-range]', p);
    const parse = () => {
      const s = inp.value.trim().replace(/\s+/g, ' ');
      const m = s.match(/^(\d+\.\d+\.\d+\.\d+)\s*(?:\/\s*(\d{1,2})|\s(\d+\.\d+\.\d+\.\d+))?$/);
      if (!m || !validIp(m[1])) return null;
      let pre = m[2] != null ? +m[2] : m[3] ? prefixOfMask(m[3]) : 24;
      if (pre == null || pre > 32) return null;
      return { ip: m[1], p: pre };
    };
    const draw = () => {
      const x = parse();
      const out = $('[data-out]', p);
      if (!x) { out.innerHTML = '<div class="card small muted">Format attendu : <code>192.168.1.10/24</code> ou <code>192.168.1.10 255.255.255.0</code></div>'; $('[data-split]', p).innerHTML = ''; return; }
      sessionStorage.setItem('sudo-calc', inp.value.trim());
      range.value = x.p; $('[data-plab]', p).textContent = '/' + x.p;
      const c = calc(x.ip, x.p);
      const rows = [['Subnet Mask', c.mask], ['Préfixe (CIDR)', '/' + c.p], ['Wildcard (ACL, OSPF)', c.wildcard], ['Network', c.net], ['Broadcast', c.bc], ['Première utilisable', c.first], ['Dernière utilisable', c.last], ['Hôtes utilisables', c.hosts.toLocaleString('fr-FR')], ['Classe', c.cls + (c.priv ? ' · privée (RFC 1918)' : c.loop ? ' · loopback' : c.apipa ? ' · APIPA (pas de DHCP)' : ' · publique')]];
      out.innerHTML = `<div class="card stack">
        <div class="calc-grid">${rows.map(([k, val]) => `<div class="k">${k}</div><button class="v mono" data-copy="${esc(String(val).split(' ')[0])}" title="Copier">${esc(String(val))}</button>`).join('')}</div>
        ${binView(c.ip, c.p, ['ip', 'mask', 'net', 'bc'])}</div>`;
      split(c);
    };
    const split = c => {
      const n = Math.max(1, +$('[data-n]', p).value || 1);
      const box = $('[data-split]', p);
      let np;
      if (by === 'n') np = c.p + Math.ceil(Math.log2(n));
      else { np = 32 - Math.ceil(Math.log2(n + 2)); }
      if (np > 32 || np < c.p) { box.innerHTML = `<p class="small" style="color:var(--err)">Impossible : le réseau /${c.p} est trop petit.</p>`; return; }
      const count = 2 ** (np - c.p), size = 2 ** (32 - np);
      const list = [];
      for (let i = 0; i < Math.min(count, 64); i++) { const s = calc(toIp((c.netInt + i * size) >>> 0), np); list.push(s); }
      box.innerHTML = `<p class="small muted" style="margin:0">Nouveau préfixe <b class="mono" style="color:var(--text)">/${np}</b> (${toIp(maskOf(np))}) · ${count} sous-réseau${count > 1 ? 'x' : ''} de ${calc('10.0.0.0', np).hosts} hôtes · on emprunte ${np - c.p} bit${np - c.p > 1 ? 's' : ''} à la partie hôte.</p>
        <div class="table-wrap"><table class="releves"><thead><tr><th>#</th><th>Network</th><th>Plage utilisable</th><th>Broadcast</th></tr></thead><tbody>
        ${list.map((s, i) => `<tr><td>${i + 1}</td><td>${s.net}/${np}</td><td>${s.first} – ${s.last}</td><td>${s.bc}</td></tr>`).join('')}</tbody></table></div>
        ${count > 64 ? `<p class="small muted">… et ${count - 64} autres.</p>` : ''}`;
    };
    inp.oninput = draw;
    range.oninput = () => { const x = parse(); if (x) { inp.value = `${x.ip}/${range.value}`; draw(); } };
    $('[data-n]', p).oninput = () => { const x = parse(); if (x) split(calc(x.ip, x.p)); };
    $$('[data-b]', p).forEach(b => b.onclick = () => { by = b.dataset.b; $$('[data-b]', p).forEach(y => y.classList.toggle('on', y === b)); $('[data-n]', p).value = by === 'n' ? 4 : 50; draw(); });
    p.addEventListener('click', e => { const b = e.target.closest('[data-copy]'); if (b) copy(b.dataset.copy); });
    draw();
  }

  shell();
  paintIcons(v);
}
