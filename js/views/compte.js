// Synchronisation : guide pas à pas pour créer le projet Supabase gratuit, connexion par code e-mail, état.
import { config, saveConfig, conn, status, syncNow, disconnect } from '../sync.js';

// Lien de connexion collé sur un appareil pas encore configuré : il contient l'adresse du projet et sa clé publique.
async function loginWithLink(link) {
  let u;
  try { u = new URL(String(link).trim()); } catch { throw new Error('Ce n’est pas un lien : appui long sur le lien de l’e-mail → Copier, puis colle-le ici.'); }
  let sb = null;
  try { sb = new URL(u.searchParams.get('redirect_to') || '').searchParams.get('sb'); } catch { /* pas de retour */ }
  if (sb) {
    const j = JSON.parse(atob(sb.replace(/-/g, '+').replace(/_/g, '/')));
    await saveConfig(j.u, j.k);
  } else if (!(await config())) throw new Error('Ce lien vient d’une ancienne version : redemande un e-mail de connexion.');
  const c = await conn();
  return c.verifyLink(link);
}
import { dbAll } from '../store.js';
import { $, esc, icon, toast, copy, paintIcons } from '../ui.js';

const SITE = location.origin + location.pathname;

// Refuse les clés secrètes : elles donnent tous les droits sur la base.
function checkKey(k) {
  if (/^sb_secret_/.test(k)) return 'C’est la clé secrète : ne la colle jamais dans une app. Prends la clé « publishable ».';
  if (/^eyJ/.test(k)) {
    try { if (JSON.parse(atob(k.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'service_role') return 'C’est la clé service_role (secrète) : prends la clé « anon ».'; } catch { /* clé illisible */ }
  }
  if (!/^(sb_publishable_|eyJ)/.test(k)) return 'Cette clé ne ressemble pas à une clé Supabase (elle commence par sb_publishable_ ou eyJ).';
  return '';
}

const fmtAgo = ts => {
  if (!ts) return 'jamais';
  const s = Math.round((Date.now() - ts) / 1000);
  return s < 60 ? 'à l’instant' : s < 3600 ? `il y a ${Math.round(s / 60)} min` : new Date(ts).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

export async function compteView(v) {
  const cfg = await config();
  const c = await conn();
  const user = c?.user && !c.user.anon ? c.user : null;
  const st = status();
  const counts = {};
  for (const s of ['ateliers', 'carnet', 'cards', 'photos']) counts[s] = (await dbAll(s)).length;

  const steps = [
    ['Crée ton compte gratuit', `Va sur <a href="https://supabase.com/dashboard" target="_blank" rel="noopener">supabase.com</a> → <b>Start your project</b>. Inscris-toi avec GitHub ou ton e-mail. C’est gratuit, sans carte bancaire.`],
    ['Crée le projet', `<b>New project</b> → nom : <code>sudo</code> · <b>Database Password</b> : clique <b>Generate</b> et garde-le dans ton gestionnaire de mots de passe (sudo n’en a pas besoin) · <b>Region</b> : Europe (Paris ou Frankfurt). Patiente 1 à 2 minutes.`],
    ['Installe les tables', `Menu de gauche → <b>SQL Editor</b> → <b>New query</b>. Colle le script ci-dessous puis <b>Run</b>. Résultat attendu : <i>Success. No rows returned</i>.<div class="row" style="margin-top:8px"><button class="btn sm" data-sql>${icon('copy')}Copier le script</button><a class="btn sm ghost" href="supabase.sql" target="_blank">Voir le script</a></div>`],
    ['Autorise les invités (ateliers en groupe)', `<b>Authentication</b> → <b>Sign In / Providers</b> → active <b>Allow anonymous sign-ins</b> → <b>Save</b>. Tes camarades pourront rejoindre ton groupe avec le code, sans créer de compte.`],
    ['Adresse de sudo', `<b>Authentication</b> → <b>URL Configuration</b> → <b>Site URL</b> : colle l’adresse de sudo, puis <b>Save changes</b>. C’est là que le lien de connexion reçu par e-mail te ramènera.<div class="cmd" style="margin-top:8px"><code class="grow">${esc(SITE)}</code><button class="round" data-cp="${esc(SITE)}" aria-label="Copier">${icon('copy')}</button></div>`],
    ['Copie l’adresse et la clé publique', `Bouton <b>Connect</b> en haut du projet (ou <b>Project Settings</b> → <b>API Keys</b>) : copie le <b>Project URL</b> et la clé <b>publishable</b> (<code>sb_publishable_…</code>, ou l’ancienne <b>anon</b>). <span style="color:var(--err)">Jamais la clé secret ni service_role.</span>`],
  ];

  v.innerHTML = `
    <div class="row" style="margin-bottom:12px"><a class="icon-btn" href="#/reglages" aria-label="Retour">${icon('back')}</a><h1 style="margin:0">Synchronisation</h1></div>
    <div class="stack" style="max-width:760px">
      ${user ? `
      <div class="card stack">
        <div class="row"><span class="sync-dot ${st.status}"></span><div class="grow"><strong>Connecté</strong><div class="small muted">${esc(user.email)}</div></div><button class="btn sm" data-now>${icon('rotate')}Synchroniser</button></div>
        <div class="small muted" data-st>${stText(st)}</div>
        <div class="small muted">Sur cet appareil : ${counts.ateliers} ateliers · ${counts.carnet} fiches · ${counts.cards} cartes · ${counts.photos} photos analysées.</div>
      </div>
      <div class="card stack">
        <h2 style="margin:0">Ce qui se synchronise</h2>
        <p class="small" style="margin:0">Ateliers, carnet, flashcards, quiz, vérifications, photos, progression, examens et planning.</p>
        <p class="small muted" style="margin:0">Restent sur chaque appareil : tes <b>clés d’IA</b> (jamais envoyées), les compteurs de quota et les rappels déjà envoyés. Sans réseau, tout continue de marcher : les changements partent au retour de la connexion. Si le même élément est modifié sur deux appareils, la version la plus récente gagne.</p>
      </div>
      <div class="card stack">
        <h2 style="margin:0">Photos du téléphone vers l’ordinateur</h2>
        <p class="small muted" style="margin:0">Sur le téléphone : <b>Photo</b> → prends la photo → <b>Envoyer à l’ordinateur</b>. Elle s’affiche en quelques secondes sur l’ordinateur où sudo est ouvert (même compte), prête à être analysée ou ajoutée à l’atelier.</p>
      </div>
      <div class="card stack">
        <h2 style="margin:0">Autre appareil</h2>
        <p class="small muted" style="margin:0">Ouvre sudo sur l’autre appareil → Réglages → Synchronisation, colle la même adresse et la même clé, puis connecte-toi avec ${esc(user.email)}.</p>
        <div class="row"><button class="btn sm" data-cp="${esc(cfg.url)}">${icon('copy')}Copier l’adresse</button><button class="btn sm" data-cp="${esc(cfg.key)}">${icon('copy')}Copier la clé publique</button></div>
      </div>
      <button class="btn danger" data-out style="align-self:flex-start">Se déconnecter de cet appareil</button>`
      : cfg ? `
      <div class="card stack" data-login>
        <h2 style="margin:0">Connexion</h2>
        <p class="small muted" style="margin:0">Pas de mot de passe : tu reçois un lien de connexion par e-mail.</p>
        <label class="field">Ton e-mail<input class="input" type="email" data-email autocomplete="email" placeholder="toi@exemple.fr"></label>
        <button class="btn primary" data-send>Recevoir l’e-mail de connexion</button>
        <div class="stack" data-codebox hidden>
          <ol class="small" style="margin:0;padding-left:20px;display:flex;flex-direction:column;gap:6px">
            <li>Ouvre l’e-mail de <b>Supabase Auth</b> (« Your sign-in link », ou « Confirm your signup » la première fois). Regarde aussi les spams.</li>
            <li><b>Sur ordinateur, ou sudo ouvert dans le navigateur</b> : clique sur le lien. sudo s’ouvre déjà connecté.</li>
            <li><b>Dans l’app installée sur le téléphone</b> : n’ouvre pas le lien (il s’ouvrirait dans le navigateur). Fais un <b>appui long</b> dessus → <b>Copier le lien</b>, puis colle-le ici.</li>
          </ol>
          <label class="field">Lien reçu par e-mail<input class="input mono" data-link placeholder="https://….supabase.co/auth/v1/verify?token=…" autocomplete="off" spellcheck="false"></label>
          <button class="btn primary" data-vlink>Se connecter avec ce lien</button>
          <details class="small"><summary style="cursor:pointer" class="muted">J’ai reçu un code à chiffres</summary>
            <div class="row" style="margin-top:8px;align-items:flex-end"><label class="field">Code<input class="input mono" data-code inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="123456" style="letter-spacing:3px;max-width:180px"></label><button class="btn" data-verify>Valider</button></div>
          </details>
          <p class="small muted" style="margin:0">Le lien ne sert qu’une fois et expire au bout d’une heure. Le service d’e-mail gratuit de Supabase envoie peu d’e-mails par heure : attends quelques minutes entre deux demandes.</p>
        </div>
        <div class="small" data-err style="color:var(--err)"></div>
      </div>
      <details class="card"><summary style="cursor:pointer">Projet : <span class="mono small">${esc(cfg.url.replace(/^https:\/\//, ''))}</span></summary><div class="row" style="margin-top:10px"><button class="btn sm ghost" data-reset>Changer de projet</button></div></details>`
      : `
      <div class="card stack">
        <h2 style="margin:0">Déjà configuré sur un autre appareil ?</h2>
        <p class="small muted" style="margin:0">Demande un e-mail de connexion depuis cet autre appareil (Réglages → Synchronisation). Ici, fais un <b>appui long</b> sur le lien de l’e-mail → <b>Copier le lien</b>, puis colle-le : c’est tout.</p>
        <label class="field">Lien reçu par e-mail<input class="input mono" data-link placeholder="https://….supabase.co/auth/v1/verify?token=…" autocomplete="off" spellcheck="false"></label>
        <button class="btn primary" data-vlink>Se connecter avec ce lien</button>
        <div class="small" data-err style="color:var(--err)"></div>
      </div>
      <h2 style="margin:8px 0 0">Première fois : créer ton projet</h2>
      <div class="card stack">
        <p style="margin:0">Pour retrouver tes ateliers, ton carnet et ta progression sur tous tes appareils, sudo utilise <b>Supabase</b>, un service gratuit. Compte une dizaine de minutes, une seule fois.</p>
        <p class="small muted" style="margin:0">Formule gratuite : 500 MB de données et 1 GB de photos, largement assez. Le projet se met en pause après une semaine sans aucune utilisation : il se réveille d’un clic dans le tableau de bord Supabase.</p>
      </div>
      <ol class="guide">${steps.map(([t, d]) => `<li class="card"><strong>${t}</strong><div class="small" style="margin-top:6px">${d}</div></li>`).join('')}</ol>
      <form class="card stack" data-cfg>
        <h2 style="margin:0">Colle tes deux valeurs</h2>
        <label class="field">Project URL<input class="input mono" name="url" required placeholder="https://abcdefgh.supabase.co" autocomplete="off" spellcheck="false"></label>
        <label class="field">Clé publishable (ou anon)<input class="input mono" name="key" required placeholder="sb_publishable_…" autocomplete="off" spellcheck="false"></label>
        <div class="small" data-cerr style="color:var(--err)"></div>
        <button class="btn primary" type="submit">Enregistrer et tester</button>
      </form>`}
    </div>`;
  paintIcons(v);

  v.addEventListener('click', e => {
    const b = e.target.closest('[data-cp]');
    if (b) copy(b.dataset.cp);
  });
  $('[data-sql]', v)?.addEventListener('click', async () => {
    try { copy(await (await fetch('supabase.sql')).text()); } catch { toast('Ouvre « Voir le script » et copie-le'); }
  });

  $('[data-cfg]', v)?.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target), err = $('[data-cerr]', v);
    const url = String(fd.get('url')).trim(), key = String(fd.get('key')).trim();
    const bad = checkKey(key);
    if (bad) { err.textContent = bad; return; }
    if (!/supabase\.(co|in)|localhost|127\.0\.0\.1/.test(url)) { err.textContent = 'L’adresse ressemble à https://xxxx.supabase.co'; return; }
    err.textContent = 'Test de la connexion…';
    await saveConfig(url, key);
    const c2 = await conn();
    try { await c2.raw('/auth/v1/settings', { auth: false }); }
    catch (x) { await saveConfig(null); err.textContent = x.message; return; }
    toast('Projet enregistré');
    compteView(v);
  });

  let email = '';
  $('[data-send]', v)?.addEventListener('click', async e => {
    const btn = e.currentTarget, err = $('[data-err]', v);
    email = $('[data-email]', v).value.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) { err.textContent = 'E-mail invalide'; return; }
    btn.disabled = true; err.textContent = '';
    try { await c.sendCode(email); $('[data-codebox]', v).hidden = false; btn.textContent = 'Renvoyer l’e-mail'; toast('E-mail envoyé : regarde ta boîte mail (et les spams)'); }
    catch (x) { err.textContent = x.message; }
    btn.disabled = false;
  });
  $('[data-verify]', v)?.addEventListener('click', async e => {
    const btn = e.currentTarget, err = $('[data-err]', v);
    const code = $('[data-code]', v).value.replace(/\D/g, '');
    if (code.length < 6) { err.textContent = 'Le code fait au moins 6 chiffres'; return; }
    btn.disabled = true; err.textContent = '';
    try { await c.verifyCode(email, code); toast('Connecté : synchronisation en cours'); await syncNow(); compteView(v); }
    catch (x) { err.textContent = x.message; btn.disabled = false; }
  });
  $('[data-vlink]', v)?.addEventListener('click', async e => {
    const btn = e.currentTarget, err = $('[data-err]', v);
    btn.disabled = true; err.textContent = '';
    try { await loginWithLink($('[data-link]', v).value); toast('Connecté : synchronisation en cours'); await syncNow(); compteView(v); }
    catch (x) { err.textContent = /expired|invalid|403/i.test(x.message) ? 'Lien expiré ou déjà utilisé : redemande un e-mail.' : x.message; btn.disabled = false; }
  });
  $('[data-reset]', v)?.addEventListener('click', async () => { if (!confirm('Oublier ce projet sur cet appareil ?')) return; await saveConfig(null); compteView(v); });
  $('[data-now]', v)?.addEventListener('click', () => syncNow());
  $('[data-out]', v)?.addEventListener('click', async () => {
    const st2 = status();
    if (!confirm(`Se déconnecter ? Tes données restent sur cet appareil${st2.pending ? `, mais ${st2.pending} modification(s) pas encore envoyée(s) ne partiront pas` : ''}.`)) return;
    await disconnect();
    compteView(v);
  });
  const onSt = e => { if (!v.isConnected) return window.removeEventListener('sync-status', onSt); const el = $('[data-st]', v); if (el) el.textContent = stText(e.detail); const d = $('.sync-dot', v); if (d) d.className = 'sync-dot ' + e.detail.status; };
  window.addEventListener('sync-status', onSt);
}

export function stText(st) {
  if (st.status === 'syncing') return 'Synchronisation en cours…';
  if (st.status === 'offline') return `Hors ligne : ${st.pending || 0} modification(s) en attente, envoyées au retour du réseau.`;
  if (st.status === 'error') return 'Erreur : ' + st.error;
  return `À jour · dernière synchro ${fmtAgo(st.last)}${st.pending ? ` · ${st.pending} en attente` : ''}`;
}
