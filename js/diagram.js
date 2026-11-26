// Schémas (topologies, organigrammes, principes) : dessinés par l'IA en Mermaid,
// affichés dans le style sombre de sudo. La bibliothèque n'est chargée qu'au premier schéma.
import { esc } from './ui.js';

let loader = null;
function loadMermaid() {
  if (window.mermaid) return Promise.resolve(window.mermaid);
  if (!loader) {
    loader = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'vendor/mermaid.min.js';
      s.onload = () => {
        window.mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: 'base',
          fontFamily: 'ui-monospace, SF Mono, Menlo, Consolas, monospace',
          themeVariables: {
            darkMode: true,
            background: '#050505',
            primaryColor: '#111111',
            primaryBorderColor: '#4ADE80',
            primaryTextColor: '#F5F5F5',
            secondaryColor: '#1A1A1A',
            secondaryBorderColor: '#404040',
            secondaryTextColor: '#F5F5F5',
            tertiaryColor: '#0A0A0A',
            tertiaryBorderColor: '#262626',
            tertiaryTextColor: '#F5F5F5',
            lineColor: '#737373',
            textColor: '#F5F5F5',
            mainBkg: '#111111',
            nodeBorder: '#4ADE80',
            clusterBkg: '#0A0A0A',
            clusterBorder: '#333333',
            edgeLabelBackground: '#000000',
            titleColor: '#F5F5F5',
            noteBkgColor: '#1A1708',
            noteTextColor: '#FACC15',
            noteBorderColor: '#3F3510',
            fontSize: '14px',
          },
        });
        res(window.mermaid);
      };
      s.onerror = () => { loader = null; rej(new Error('Bibliothèque de schémas indisponible')); };
      document.head.appendChild(s);
    });
  }
  return loader;
}

let n = 0;
export async function renderDiagrams(root) {
  const els = [...root.querySelectorAll('.diagram[data-mermaid]:not([data-done])')];
  if (!els.length) return;
  let m;
  try { m = await loadMermaid(); }
  catch (e) { els.forEach(el => { el.classList.add('err'); el.textContent = e.message; }); return; }
  for (const el of els) {
    el.dataset.done = '1';
    const src = el.dataset.mermaid;
    try {
      const { svg } = await m.render('sudo-d' + (++n), src);
      el.innerHTML = svg;
    } catch {
      el.classList.add('err');
      el.innerHTML = `Schéma illisible, voici sa description :<pre class="mono">${esc(src)}</pre>`;
      document.querySelectorAll('[id^="dsudo-d"]').forEach(x => x.remove());
    }
  }
}

// Observe tout le document : chaque nouveau schéma est dessiné automatiquement.
export function watchDiagrams() {
  let t = 0;
  new MutationObserver(() => { clearTimeout(t); t = setTimeout(() => renderDiagrams(document.body), 120); })
    .observe(document.body, { childList: true, subtree: true });
}
