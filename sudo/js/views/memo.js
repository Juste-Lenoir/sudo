// Aide-mémoire de commandes par domaine : recherche, copie en un geste, hors ligne.
import { MEMO } from '../memo-data.js';
import { $, $$, esc, icon, paintIcons, copy, params } from '../ui.js';

const fold = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Coloration : 1er mot en vert, parties à remplacer <...> soulignées.
function colorCmd(c) {
  return c.split('\n').map(line => {
    const m = line.match(/^(\s*)(\S+)(.*)$/);
    if (!m) return esc(line);
    const rest = esc(m[3]).replace(/&lt;([^&]*?)&gt;/g, '<span class="ph">$1</span>').replace(/(\s)(-{1,2}[\w-]+|\/[a-z]+\b)/gi, '$1<span class="op">$2</span>');
    const head = esc(m[2]).replace(/&lt;([^&]*?)&gt;/g, '<span class="ph">$1</span>');
    return `${m[1]}<span class="k">${head}</span>${rest}`;
  }).join('\n');
}

export async function memoView(v) {
  const p = params();
  let cur = p.d && MEMO.some(m => m.id === p.d) ? p.d : (sessionStorage.getItem('sudo-memo') || 'all');
  let q = p.q || '';

  v.innerHTML = `
    <div class="row" style="margin-bottom:12px"><a class="icon-btn" href="#/outils" aria-label="Retour">${icon('back')}</a><h1 style="margin:0">Aide-mémoire</h1><span class="grow"></span><span class="tag">hors ligne</span></div>
    <div class="memo-top">
      <input class="input" type="search" data-q placeholder="Chercher : ip, vlan, dhcp, utilisateur…" value="${esc(q)}" aria-label="Chercher une commande" autocapitalize="off" spellcheck="false">
      <div class="chips-scroll" data-chips>
        <button class="chip ${cur === 'all' ? 'on' : ''}" data-d="all">Tout</button>
        ${MEMO.map(m => `<button class="chip ${cur === m.id ? 'on' : ''}" data-d="${m.id}">${esc(m.name)}</button>`).join('')}
      </div>
    </div>
    <p class="small muted" style="margin:4px 0 12px">Touche une commande pour la copier. Remplace les parties <span class="ph">soulignées</span> par tes valeurs.</p>
    <div data-list style="max-width:900px"></div>`;

  const draw = () => {
    const words = fold(q).split(/\s+/).filter(Boolean);
    const out = [];
    let count = 0;
    for (const m of MEMO) {
      if (cur !== 'all' && m.id !== cur) continue;
      for (const g of m.groups) {
        const items = g.items.filter(([c, d]) => { const hay = fold(c + ' ' + d + ' ' + g.t + ' ' + m.name); return words.every(w => hay.includes(w)); });
        if (!items.length) continue;
        count += items.length;
        out.push(`<section class="memo-g"><div class="label">${cur === 'all' ? esc(m.name) + ' · ' : ''}${esc(g.t)}</div><div class="list">${items.map(([c, d]) => `
          <button class="item memo-i" data-c="${esc(c.replace(/<([^>]*)>/g, '$1'))}">
            <span class="grow" style="min-width:0"><pre class="memo-c">${colorCmd(c)}</pre><span class="s">${esc(d)}</span></span>
            <span class="memo-copy" aria-hidden="true">${icon('copy')}</span></button>`).join('')}</div></section>`);
      }
    }
    $('[data-list]', v).innerHTML = out.length ? out.join('') : `<div class="card empty">Rien trouvé pour « ${esc(q)} ».<br><a href="#/assistant">Demander à l'assistant</a></div>`;
    $('[data-list]', v).dataset.count = count;
  };
  $('[data-q]', v).oninput = e => { q = e.target.value; draw(); };
  $$('[data-d]', v).forEach(b => b.onclick = () => { cur = b.dataset.d; sessionStorage.setItem('sudo-memo', cur); $$('[data-d]', v).forEach(x => x.classList.toggle('on', x === b)); draw(); });
  $('[data-list]', v).addEventListener('click', e => {
    const b = e.target.closest('[data-c]');
    if (!b) return;
    copy(b.dataset.c);
    b.classList.add('copied');
    setTimeout(() => b.classList.remove('copied'), 900);
  });
  draw();
  paintIcons(v);
  if (matchMedia('(pointer: fine)').matches) $('[data-q]', v).focus();
}
