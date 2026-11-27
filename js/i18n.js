// Langue de l'app. Le français est écrit dans le code ; en anglais, chaque texte affiché est
// remplacé par sa traduction (dictionnaire i18n-en.js), y compris ce qui apparaît plus tard.
// Les réponses des IA, elles, sont demandées directement en anglais (voir ai.js).
let lang = 'fr';
try { lang = localStorage.getItem('sudo-lang') || 'fr'; } catch { /* sans stockage */ }
export const getLang = () => lang;
export function setLang(l) {
  try { localStorage.setItem('sudo-lang', l); } catch { /* sans stockage */ }
  location.reload();
}

// Zones jamais traduites : code, saisies, réponses des IA, terminal simulé.
const SKIP = 'script, style, code, pre, textarea, .msg-body, .term, [data-noi18n]';
const ATTRS = ['placeholder', 'aria-label', 'title'];
let dict = null, re = null;

const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pl = (n, one, many) => (+n > 1 ? many : one);
// Textes avec des nombres ou des noms : traduits par modèle.
const PATTERNS = [
  [/Étape (\d+) sur (\d+)/g, 'Step $1 of $2'],
  [/(\d+) jours? d['’]affilée/g, (m, n) => `${n} ${pl(n, 'day', 'days')} in a row`],
  [/(\d+) jours? actifs? en tout/g, (m, n) => `${n} active ${pl(n, 'day', 'days')} in total`],
  [/(\d+)\/(\d+) étapes/g, '$1/$2 steps'],
  [/(\d+) étapes?\b/g, (m, n) => `${n} ${pl(n, 'step', 'steps')}`],
  [/Gérer mes (\d+) cartes?/g, 'Manage my $1 cards'],
  [/cartes? à revoir aujourd['’]hui dont (\d+) nouvelles?/g, 'cards to review today, including $1 new'],
  [/(\d+) cartes?\b/g, (m, n) => `${n} ${pl(n, 'card', 'cards')}`],
  [/(\d+) à revoir/g, '$1 to review'],
  [/Réviser (\d+) flashcards?/g, 'Review $1 flashcards'],
  [/(\d+) questions? · (\d+) essais?/g, (m, a, b) => `${a} questions · ${b} ${pl(b, 'try', 'tries')}`],
  [/Quiz sans IA \((\d+) questions /g, 'Quiz without AI ($1 questions '],
  [/Chercher dans (\d+) fiches?…/g, (m, n) => `Search in ${n} ${pl(n, 'note', 'notes')}…`],
  [/(\d+) fiches? techniques?/g, (m, n) => `${n} tech ${pl(n, 'note', 'notes')}`],
  [/(\d+) fiches?\b/g, (m, n) => `${n} ${pl(n, 'note', 'notes')}`],
  [/(\d+) ateliers?\b/g, (m, n) => `${n} ${pl(n, 'workshop', 'workshops')}`],
  [/ dans (\d+) j\b/g, ' in $1 d'],
  [/ dans\s*$/, ' in '],
  [/^jours? d['’]affilée/, 'days in a row'],
  [/ · privée \(/g, ' · private ('],
  [/ · publique/g, ' · public'],
  [/^(Pas encore de données|No data yet) ?: (.+)$/, (m, a, list) => 'No data yet: ' + list.replace(/\.$/, '').split(', ').map(x => dict.get(x) || x).join(', ') + '.'],
  [/^j$/, 'd'],
  [/partie réseau \((\d+) bits\)/g, 'network part ($1 bits)'],
  [/partie hôte \((\d+) bits\)/g, 'host part ($1 bits)'],
  [/(\d+) sous-réseaux de (\d+) hôtes/g, '$1 subnets of $2 hosts'],
  [/on emprunte (\d+) bits? à la partie hôte/g, 'we borrow $1 bits from the host part'],
  [/(\d+) jours avant/g, '$1 days before'],
  [/il y a (\d+) min/g, '$1 min ago'],
  [/Pas encore de données : /g, 'No data yet: '],
];
function tr(s) {
  const t = s.trim();
  if (!t) return s;
  const hit = dict.get(t);
  if (hit) return s.replace(t, hit);
  let out = s;
  for (const [p, r] of PATTERNS) out = out.replace(p, r);
  // « Linux · Réseau », « Quiz · … » : chaque morceau traduit s'il est connu.
  out = out.replace(/^([^·]+?) ·(\s*)$/, (m, a, b) => (dict.get(a.trim()) || a) + ' ·' + b);
  if (out.includes(' · ')) out = out.split(' · ').map(x => { const k = x.trim(); return dict.get(k) ? x.replace(k, dict.get(k)) : x; }).join(' · ');
  if (re) out = out.replace(re, m => dict.get(m) ?? m);
  return out;
}
function textNode(n) {
  const p = n.parentElement;
  if (!p || p.closest(SKIP)) return;
  const v = tr(n.nodeValue);
  if (v !== n.nodeValue) n.nodeValue = v;
}
function element(el) {
  if (el.closest?.(SKIP) && !['INPUT', 'TEXTAREA'].includes(el.tagName)) return;
  for (const a of ATTRS) {
    const v = el.getAttribute?.(a);
    if (v) { const t = tr(v); if (t !== v) el.setAttribute(a, t); }
  }
}
function walk(root) {
  if (root.nodeType === 3) return textNode(root);
  if (root.nodeType !== 1) return;
  element(root);
  root.querySelectorAll('[placeholder], [aria-label], [title]').forEach(element);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) textNode(n);
}

export async function startI18n() {
  if (lang !== 'en') return;
  document.documentElement.lang = 'en';
  const { EN } = await import('./i18n-en.js');
  dict = new Map(Object.entries(EN));
  // Morceaux de phrases (texte + valeurs) : remplacés à l'intérieur des textes plus longs.
  // Seulement les expressions de plusieurs mots, entières (jamais un morceau de mot) :
  // un mot seul remplacé au milieu d'un texte écrit par toi ou par l'IA donnerait du charabia.
  const parts = [...dict.keys()].filter(k => k.length >= 6 && /\s/.test(k.trim())).sort((a, b) => b.length - a.length);
  re = parts.length ? new RegExp(`(?<![\\p{L}'’])(?:${parts.map(escRe).join('|')})(?![\\p{L}])`, 'gu') : null;
  document.title = 'sudo_';
  walk(document.body);
  new MutationObserver(muts => {
    for (const m of muts) {
      if (m.type === 'characterData') textNode(m.target);
      else if (m.type === 'attributes') element(m.target);
      else m.addedNodes.forEach(walk);
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  // Dates et heures en anglais (le code demande « fr-FR »).
  for (const fn of ['toLocaleDateString', 'toLocaleTimeString', 'toLocaleString']) {
    const orig = Date.prototype[fn];
    Date.prototype[fn] = function (loc, opts) { return orig.call(this, loc === 'fr-FR' ? 'en-GB' : loc, opts); };
  }
  // Boîtes de dialogue du navigateur.
  const c = window.confirm.bind(window), a = window.alert.bind(window);
  window.confirm = m => c(tr(String(m)));
  window.alert = m => a(tr(String(m)));
}
export const t = s => (dict ? tr(s) : s);
