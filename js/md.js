// Petit moteur Markdown sûr (tout le texte est échappé avant mise en forme).
import { esc } from './ui.js';

function inline(s) {
  s = esc(s);
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, n) => `<code>${codes[n]}</code>`);
}

const LIST = /^\s*([-*+]|\d+[.)])\s+/;

export function md(src, opts = {}) {
  const lines = String(src || '').replace(/\r/g, '').split('\n');
  let out = '', i = 0;
  while (i < lines.length) {
    const l = lines[i];
    const fence = l.match(/^\s*```\s*([\w#+.-]*)/);
    if (fence) {
      const buf = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++;
      const lang = (fence[1] || '').toLowerCase();
      if (lang === 'mermaid') { out += opts.streaming ? '<div class="diagram err">Schéma en cours de dessin…</div>' : `<div class="diagram" data-mermaid="${esc(buf.join('\n'))}"></div>`; continue; }
      if (lang === 'sudo') continue; // données techniques pour l'app, pas pour l'affichage
      out += `<div class="code"><div class="code-head"><span>${esc(fence[1] || 'code')}</span><button class="copy-code" type="button">Copier</button></div><pre><code>${esc(buf.join('\n'))}</code></pre></div>`;
      continue;
    }
    if (/^\s*$/.test(l)) { i++; continue; }
    const h = l.match(/^(#{1,4})\s+(.*)/);
    if (h) { const n = Math.min(h[1].length + 1, 5); out += `<h${n}>${inline(h[2])}</h${n}>`; i++; continue; }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l)) { out += '<hr>'; i++; continue; }
    if (/^\s*\|.*\|\s*$/.test(l) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const row = r => r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const head = row(l);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { rows.push(row(lines[i])); i++; }
      out += `<div class="table-wrap"><table><thead><tr>${head.map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
      continue;
    }
    if (/^\s*>/.test(l)) {
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
      out += `<blockquote>${md(buf.join('\n'), opts)}</blockquote>`;
      continue;
    }
    if (LIST.test(l)) {
      const ordered = /^\s*\d+[.)]/.test(l);
      const items = [];
      while (i < lines.length && LIST.test(lines[i])) {
        let t = lines[i].replace(LIST, '');
        i++;
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !LIST.test(lines[i]) && !/^\s*```/.test(lines[i])) { t += ' ' + lines[i].trim(); i++; }
        items.push(t);
      }
      const tag = ordered ? 'ol' : 'ul';
      out += `<${tag}>${items.map(t => `<li>${inline(t)}</li>`).join('')}</${tag}>`;
      continue;
    }
    const buf = [l];
    i++;
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^\s*(```|#{1,4}\s|>|[-*+]\s|\d+[.)]\s|\|)/.test(lines[i])) { buf.push(lines[i]); i++; }
    out += `<p>${buf.map(inline).join('<br>')}</p>`;
  }
  return out;
}
