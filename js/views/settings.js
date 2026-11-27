// Réglages : profil, IA (clés, modèles, limites gratuites, IA par tâche), budget, sauvegarde.
import { getLang, setLang } from '../i18n.js';
import { getProfile, saveProfile, exportAll, importAll, clearAll } from '../store.js';
import { PROVIDERS, TASKS, getAI, saveAI, readyProviders, testProvider, listModels } from '../ai.js';
import { $, esc, toast, icon, download, paintIcons } from '../ui.js';
import { account, status } from '../sync.js';
import { stText } from './compte.js';

export async function settingsView(v) {
  const prof = await getProfile();
  const s = await getAI();
  const acc = await account();

  const provCard = p => {
    const c = s.providers[p.id];
    return `<details class="card" ${c.enabled ? 'open' : ''} data-p="${p.id}">
      <summary class="row" style="cursor:pointer;list-style:none">
        <span class="dotc" style="--c:${c.enabled && (c.key || p.noKey) ? 'var(--brand)' : '#404040'}"></span>
        <strong class="grow">${esc(p.full)}</strong>
        <span class="tag ${p.free ? 'ok' : ''}">${p.free ? 'gratuite' : 'payante'}</span>
      </summary>
      <div class="stack" style="margin-top:12px">
        <p class="small muted" style="margin:0">${esc(p.help)} <a href="${p.keyUrl}" target="_blank" rel="noopener">${p.noKey ? 'Télécharger' : 'Obtenir une clé'}</a></p>
        <label class="check" style="padding:0"><input type="checkbox" data-k="enabled" ${c.enabled ? 'checked' : ''}><span>Activer</span></label>
        ${p.noKey ? '' : `<label class="field">Clé API<input class="input mono" type="password" data-k="key" value="${esc(c.key)}" autocomplete="off" spellcheck="false" placeholder="colle ta clé ici"></label>`}
        <div class="row" style="align-items:flex-end">
          <label class="field grow">Modèle<input class="input mono" data-k="model" value="${esc(c.model)}" list="ml-${p.id}" spellcheck="false"><datalist id="ml-${p.id}"></datalist></label>
          <button class="btn sm ghost" data-list>Lister</button><button class="btn sm" data-test>Tester</button>
        </div>
        ${p.free && !p.noKey ? `<div class="grid2">
          <label class="field">Limite gratuite : requêtes par jour<input class="input mono" type="number" min="0" data-k="rpd" value="${c.rpd ?? ''}" placeholder="inconnue"></label>
          <label class="field">Tokens par jour (si connu)<input class="input mono" type="number" min="0" data-k="tpd" value="${c.tpd ?? ''}" placeholder="inconnu"></label>
        </div>` : ''}
        ${p.paid ? `<div class="grid2">
          <label class="field">Prix entrée ($ / million de tokens)<input class="input mono" type="number" step="0.01" data-k="priceIn" value="${c.priceIn}"></label>
          <label class="field">Prix sortie ($ / million de tokens)<input class="input mono" type="number" step="0.01" data-k="priceOut" value="${c.priceOut}"></label>
        </div>` : ''}
        <div class="small muted" data-res></div>
      </div>
    </details>`;
  };

  const opts = sel => PROVIDERS.map(p => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.name)}</option>`).join('');

  v.innerHTML = `
    <h1>Réglages</h1>
    <div class="stack" style="max-width:760px">
      <div class="card stack">
        <h2 style="margin:0">Langue · Language</h2>
        <div class="seg" style="align-self:flex-start"><button data-lang="fr" class="${getLang() === 'fr' ? 'on' : ''}">Français</button><button data-lang="en" class="${getLang() === 'en' ? 'on' : ''}">English</button></div>
        <p class="small muted" style="margin:0" data-noi18n>${getLang() === 'en' ? 'Screens and AI answers in English. Your own content (workshops, notes) stays as you wrote it.' : 'Écrans et réponses des IA en français. Tes contenus (ateliers, fiches) restent tels que tu les as écrits.'}</p>
      </div>
      <div class="card stack">
        <h2 style="margin:0">Toi</h2>
        <label class="field">Prénom (pour que l'assistant te tutoie par ton prénom)<input class="input" data-prenom value="${esc(prof.prenom)}"></label>
      </div>

      <div>
        <h2>Intelligences artificielles</h2>
        <p class="small muted">Commence par <strong>Gemini</strong> (gratuite, lit les photos), puis ajoute <strong>Groq</strong> pour les petites tâches et le 2ᵉ avis. Tes clés restent sur cet appareil.</p>
        <div class="row" style="margin-bottom:10px"><button class="btn ghost" data-allon>${icon('check')}Tout activer</button><button class="btn ghost" data-alloff>${icon('x')}Tout désactiver</button><span class="small muted">Tout activer : seulement les IA qui ont une clé.</span></div>
        <div class="stack" data-provs>${PROVIDERS.map(provCard).join('')}</div>
      </div>

      <div class="card stack">
        <h2 style="margin:0">Quelle IA pour quoi</h2>
        <p class="small muted" style="margin:0">Pour ménager les quotas gratuits : une IA rapide pour les petites tâches, la meilleure pour les analyses. Si elle ne répond pas, sudo passe à la suivante.</p>
        <label class="field">IA principale<select class="input" data-primary>${opts(s.primary)}</select></label>
        ${Object.entries(TASKS).map(([k, l]) => `<label class="field">${esc(l)}<select class="input" data-route="${k}">${opts(s.routes[k])}</select></label>`).join('')}
        <label class="field">Budget mensuel pour les IA payantes ($)<input class="input mono" type="number" min="0" step="1" data-budget value="${s.budget}"></label>
      </div>

      <a class="card row" href="#/compte" style="text-decoration:none;color:inherit">
        ${icon('cloud')}<div class="grow"><strong>Synchronisation</strong><div class="small muted">${acc ? esc(acc.email) + ' · ' + esc(stText(status())) : 'Retrouve tout sur ton iPhone, ton Android et tes ordinateurs (gratuit)'}</div></div><span class="muted">›</span>
      </a>

      <div class="card stack">
        <h2 style="margin:0">Sauvegarde</h2>
        <p class="small muted" style="margin:0">Une copie de tes données dans un fichier, en plus de la synchronisation.</p>
        <label class="check" style="padding:0"><input type="checkbox" data-withkeys><span>Inclure mes clés API (garde alors ce fichier pour toi)</span></label>
        <div class="row"><button class="btn" data-export>${icon('share')}Exporter</button><label class="btn ghost">${icon('file')}Importer<input type="file" accept="application/json" data-import hidden></label></div>
        <hr class="sep">
        <button class="btn danger" data-clear>${icon('trash')}Tout effacer sur cet appareil</button>
      </div>
      <p class="small muted">sudo_ · Phase 3</p>
    </div>`;
  paintIcons(v);

  const persist = async () => { await saveAI(s); };
  v.querySelectorAll('[data-lang]').forEach(b => b.onclick = () => { if (b.dataset.lang !== getLang()) setLang(b.dataset.lang); });
  $('[data-prenom]', v).onchange = async e => { prof.prenom = e.target.value.trim(); await saveProfile(prof); toast('Enregistré'); };
  $('[data-primary]', v).onchange = async e => { s.primary = e.target.value; await persist(); };
  v.querySelectorAll('[data-route]').forEach(sel => sel.onchange = async () => { s.routes[sel.dataset.route] = sel.value; await persist(); });
  $('[data-budget]', v).onchange = async e => { s.budget = Math.max(0, +e.target.value || 0); await persist(); };

  const setAll = async on => {
    for (const p of PROVIDERS) { const c = s.providers[p.id]; c.enabled = on && !!c.key && !p.noKey; }
    await persist();
    settingsView(v);
    toast(on ? 'IA avec une clé activées' : 'Toutes les IA désactivées');
  };
  $('[data-allon]', v).onclick = () => setAll(true);
  $('[data-alloff]', v).onclick = () => setAll(false);

  $('[data-provs]', v).addEventListener('change', async e => {
    const card = e.target.closest('[data-p]');
    const k = e.target.dataset.k;
    if (!card || !k) return;
    const c = s.providers[card.dataset.p];
    if (k === 'enabled') c.enabled = e.target.checked;
    else if (['rpd', 'tpd', 'priceIn', 'priceOut'].includes(k)) c[k] = e.target.value === '' ? null : +e.target.value;
    else c[k] = e.target.value.trim();
    if (k === 'key' && c.key) c.enabled = true;
    await persist();
    card.querySelector('[data-k="enabled"]').checked = c.enabled;
    card.querySelector('.dotc').style.setProperty('--c', c.enabled && (c.key || card.dataset.p === 'ollama') ? 'var(--brand)' : '#404040');
  });
  $('[data-provs]', v).addEventListener('click', async e => {
    const card = e.target.closest('[data-p]');
    if (!card) return;
    const id = card.dataset.p, res = $('[data-res]', card);
    if (e.target.closest('[data-test]')) {
      res.textContent = 'Test en cours…';
      try { const r = await testProvider(id); res.innerHTML = `<span style="color:var(--brand)">Ça marche : « ${esc(r.slice(0, 40))} »</span>`; }
      catch (err) { res.innerHTML = `<span style="color:var(--err)">${esc(err.message)}</span>`; }
    }
    if (e.target.closest('[data-list]')) {
      res.textContent = 'Recherche des modèles…';
      try {
        const ids = await listModels(id);
        $(`#ml-${id}`, card).innerHTML = ids.map(m => `<option value="${esc(m)}">`).join('');
        res.textContent = `${ids.length} modèles trouvés : clique dans le champ Modèle pour choisir.`;
      } catch (err) { res.innerHTML = `<span style="color:var(--err)">${esc(err.message)}</span>`; }
    }
  });

  $('[data-export]', v).onclick = async () => {
    const data = await exportAll($('[data-withkeys]', v).checked);
    download(`sudo-sauvegarde-${new Date().toLocaleDateString('sv-SE')}.json`, JSON.stringify(data), 'application/json');
  };
  $('[data-import]', v).onchange = async e => {
    const f = e.target.files[0];
    if (!f) return;
    if (!confirm('Remplacer les données de cet appareil par celles de la sauvegarde ?')) return;
    try { await importAll(JSON.parse(await f.text())); toast('Sauvegarde importée'); location.reload(); }
    catch (err) { toast(err.message, 5000); }
  };
  $('[data-clear]', v).onclick = async () => {
    if (!confirm(acc ? 'Effacer ateliers, photos, vérifications, clés et réglages de cet appareil ? Tes données en ligne restent : elles reviendront si tu reconnectes cet appareil.' : 'Effacer définitivement ateliers, photos, vérifications, clés et réglages de cet appareil ?')) return;
    await clearAll();
    location.reload();
  };
  if (!readyProviders(s).length) v.querySelector('[data-p="gemini"]').open = true;
}
