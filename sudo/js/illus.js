// Illustrations des quiz et des flashcards : schéma (Mermaid), sortie de commande simulée,
// ou photo réelle libre de droits trouvée sur Wikimedia Commons (source et licence affichées).
import { esc } from './ui.js';
import { getKV, setKV } from './store.js';

// ill = { type: 'schema' | 'sortie' | 'photo', contenu, legende }
export function illusHTML(ill) {
  if (!ill || !ill.contenu) return '';
  const cap = ill.legende ? `<figcaption>${esc(ill.legende)}</figcaption>` : '';
  if (ill.type === 'schema') {
    const src = String(ill.contenu).replace(/^```mermaid\s*|```\s*$/g, '').trim();
    return `<figure class="illus"><div class="diagram" data-mermaid="${esc(src)}"></div>${cap}</figure>`;
  }
  if (ill.type === 'sortie') {
    return `<figure class="illus"><div class="code term-out"><div class="code-head"><span>sortie</span></div><pre>${colorOutput(ill.contenu)}</pre></div>${cap}</figure>`;
  }
  if (ill.type === 'photo') {
    return `<figure class="illus wm" data-wm="${esc(ill.contenu)}"><div class="wm-ph small muted">Recherche d'une photo libre de droits…</div>${cap}</figure>`;
  }
  return '';
}

// Coloration légère d'une sortie de terminal : invites, erreurs, adresses IP.
export function colorOutput(t) {
  return esc(t).split('\n').map(l => {
    if (/^\s*(%|Error|ERROR|bash: |zsh: |-bash:|.*command not found|.*n’est pas reconnu|.*n'est pas reconnu|.*CommandNotFound)/.test(l)) return `<span class="t-err">${l}</span>`;
    return l.replace(/\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(\/\d{1,2})?\b/g, '<span class="t-ip">$1$2</span>')
      .replace(/\b(up|connected|UP)\b/g, '<span class="t-ok">$1</span>')
      .replace(/\b(down|notconnect|administratively down|DOWN)\b/g, '<span class="t-warn">$1</span>');
  }).join('\n');
}

// Photos Wikimedia Commons (gratuit, sans clé) ; résultat gardé en mémoire pour ne pas rechercher deux fois.
export async function loadPhotos(root) {
  const figs = [...root.querySelectorAll('figure.wm[data-wm]:not([data-done])')];
  if (!figs.length) return;
  const cache = await getKV('wm-cache', {});
  for (const f of figs) {
    f.dataset.done = '1';
    const q = f.dataset.wm;
    const ph = f.querySelector('.wm-ph');
    try {
      let r = cache[q];
      if (!r) {
        const u = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=6&gsrlimit=6&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=640&gsrsearch='
          + encodeURIComponent(q + ' filetype:bitmap');
        const res = await fetch(u);
        const j = await res.json();
        const pages = Object.values(j.query?.pages || {}).sort((a, b) => a.index - b.index);
        const p = pages.find(x => x.imageinfo?.[0]?.thumburl);
        if (!p) throw new Error('aucune');
        const ii = p.imageinfo[0], m = ii.extmetadata || {};
        const strip = s => String(s || '').replace(/<[^>]+>/g, '').trim();
        r = { src: ii.thumburl, page: ii.descriptionurl, title: p.title.replace(/^File:|\.\w+$/g, ''), author: strip(m.Artist?.value).slice(0, 60), license: strip(m.LicenseShortName?.value) };
        cache[q] = r;
        await setKV('wm-cache', cache);
      }
      ph.outerHTML = `<img src="${esc(r.src)}" alt="${esc(r.title)}" loading="lazy"><div class="wm-src">Photo : <a href="${esc(r.page)}" target="_blank" rel="noopener">Wikimedia Commons</a>${r.author ? ' · ' + esc(r.author) : ''}${r.license ? ' · ' + esc(r.license) : ''}</div>`;
    } catch {
      ph.textContent = navigator.onLine ? `Pas de photo trouvée pour « ${q} ».` : 'Photo indisponible hors ligne.';
    }
  }
}
