// Terminal simulé : routeur et switch Cisco, Linux, PowerShell, CMD, macOS.
// L'IA joue l'équipement ; missions prêtes (sans quota) ou générées, vérification notée, @prof.
import { getKV, setKV } from '../store.js';
import { chat } from '../ai.js';
import { DEVICES, terminalSystem } from '../prompts.js';
import { record, bump } from '../progress.js';
import { colorOutput } from '../illus.js';
import { md } from '../md.js';
import { $, $$, esc, icon, paintIcons, toast, sheet } from '../ui.js';

const PROMPT_RE = /[#>$%]\s?$/;

// Missions prêtes : pas besoin d'IA pour les proposer.
export const MISSIONS = {
  'cisco-routeur': [
    ['Configuration de base sécurisée', '1. Nommer le routeur R1.\n2. Protéger le mode privilégié par un mot de passe chiffré.\n3. Protéger l’accès console.\n4. Afficher une bannière d’avertissement.\n5. Chiffrer les mots de passe en clair et enregistrer la configuration.'],
    ['Adresser les interfaces', '1. GigabitEthernet0/0/0 : 192.168.10.1/24, allumée, description « LAN ».\n2. GigabitEthernet0/0/1 : 10.0.0.1/30, allumée, description « Vers FAI ».\n3. Route par défaut vers 10.0.0.2.\n4. Prouver que tout est en place avec une seule commande de vérification.'],
    ['Serveur DHCP', '1. Exclure 192.168.10.1 à 192.168.10.10.\n2. Créer un pool « LAN » pour 192.168.10.0/24.\n3. Passerelle 192.168.10.1, DNS 8.8.8.8.\n4. Vérifier la configuration du pool.'],
    ['Accès SSH', '1. Nom de domaine lab.local.\n2. Clés RSA 2048 bits.\n3. Un compte local admin.\n4. Lignes VTY en SSH uniquement, avec les comptes locaux, SSH version 2.'],
  ],
  'cisco-switch': [
    ['VLAN et trunk', '1. Créer le VLAN 10 « COMPTA » et le VLAN 20 « RH ».\n2. Ports Fa0/1 à Fa0/5 en accès dans le VLAN 10, Fa0/6 à Fa0/10 dans le VLAN 20 (en le moins de commandes possible).\n3. Gi0/1 en trunk.\n4. Vérifier VLAN et trunk.'],
    ['Administration à distance', '1. Nommer le switch SW1.\n2. Adresse d’administration 192.168.1.2/24 sur le VLAN 1.\n3. Passerelle 192.168.1.1.\n4. Enregistrer la configuration.'],
    ['Port security', '1. Fa0/1 en mode accès.\n2. Une seule adresse MAC autorisée, apprise automatiquement (sticky).\n3. En cas de violation : port désactivé.\n4. Vérifier l’état du port security.'],
  ],
  linux: [
    ['Utilisateurs et groupe', '1. Créer le groupe compta.\n2. Créer alice, bob et carol en une seule ligne.\n3. Les ajouter au groupe compta.\n4. Prouver qu’ils sont dans le groupe.'],
    ['Diagnostic réseau', '1. Trouver l’adresse IP et le masque de ens33.\n2. Trouver la passerelle et les serveurs DNS.\n3. Tester la passerelle puis Internet.\n4. Tester la résolution DNS.'],
    ['Serveur SSH', '1. Mettre à jour la liste des paquets et installer le serveur SSH.\n2. Le démarrer et l’activer au démarrage en une commande.\n3. Prouver qu’il écoute sur le port 22.'],
    ['Dossier partagé', '1. Créer /srv/compta.\n2. Propriétaire root, groupe compta.\n3. Droits : tout pour le groupe, rien pour les autres, et les nouveaux fichiers héritent du groupe.\n4. Vérifier les droits.'],
  ],
  powershell: [
    ['Préparer un contrôleur de domaine', '1. Renommer le serveur SRV-AD01 (redémarrage plus tard).\n2. IP fixe 192.168.1.10/24, passerelle 192.168.1.1.\n3. DNS 127.0.0.1.\n4. Vérifier la configuration IP.'],
    ['OU et utilisateurs AD', '(Le domaine lab.local existe.)\n1. Créer l’OU Compta.\n2. Créer alice, bob et carol dans cette OU en une seule ligne, sans mot de passe en clair.\n3. Créer le groupe G_Compta et y ajouter les trois.\n4. Lister les membres du groupe.'],
    ['Rôle DHCP', '1. Installer le rôle DHCP avec les outils.\n2. Créer l’étendue 192.168.1.100 à 192.168.1.200 /24.\n3. Option routeur 192.168.1.1.\n4. Vérifier l’étendue.'],
  ],
  cmd: [
    ['Diagnostic réseau', '1. Trouver IPv4 Address, Subnet Mask, Default Gateway et serveurs DNS.\n2. Tester la passerelle, puis Internet par IP.\n3. Tester la résolution DNS.\n4. Vider le cache DNS et redemander une adresse au DHCP.'],
    ['Compte local', '1. Créer le compte stagiaire sans écrire le mot de passe dans la commande.\n2. L’ajouter au groupe Utilisateurs.\n3. Vérifier le compte et ses groupes.'],
  ],
  macos: [
    ['Infos réseau', '1. Trouver l’IP du Wi-Fi (en0).\n2. Trouver la passerelle.\n3. Trouver les serveurs DNS.\n4. Tester Internet.'],
    ['Infos système', '1. Version de macOS.\n2. Modèle, puce et mémoire.\n3. Espace disque disponible.\n4. Mises à jour disponibles.'],
  ],
};

export async function terminalView(v) {
  const saved = await getKV('terminal2', { dev: 'cisco-routeur', sessions: {} });
  const fresh = dev => ({ prompt: DEVICES[dev].prompt, lines: [], messages: [], mission: null });
  let dev = DEVICES[saved.dev] ? saved.dev : 'cisco-routeur';
  const S = () => (saved.sessions[dev] ||= fresh(dev));
  const save = () => setKV('terminal2', { ...saved, dev });
  let busy = null;
  const hist = [];
  let hIdx = -1;

  function shell() {
    const st = S();
    const wide = matchMedia('(min-width: 1000px)').matches;
    v.innerHTML = `
      <div class="row" style="margin-bottom:10px"><a class="icon-btn" href="#/outils" aria-label="Retour">${icon('back')}</a><h1 style="margin:0">Terminal</h1><span class="grow"></span>
        <button class="btn ghost sm" data-reset title="Remettre l’équipement en configuration d’usine">${icon('rotate')}<span class="hide-xs">Réinitialiser</span></button></div>
      <div class="chips-scroll" style="margin-bottom:10px">${Object.entries(DEVICES).map(([k, d]) => `<button class="chip ${k === dev ? 'on' : ''}" data-dev="${k}">${esc(d.label)}</button>`).join('')}</div>
      <div class="term-wrap">
        <div class="term-side">
          ${st.mission ? `<details class="card mission" ${wide || st.lines.length < 3 ? 'open' : ''}><summary class="row" style="flex-wrap:nowrap"><span class="grow" style="min-width:0"><span class="label" style="margin:0;display:block">Mission</span><strong>${esc(st.mission.titre)}</strong></span>${st.mission.note != null ? `<span class="tag ${st.mission.note >= 10 ? 'ok' : 'bad'}">${st.mission.note}/20</span>` : ''}</summary><div class="md small">${md(st.mission.texte)}</div>
            <div class="row"><button class="btn primary sm" data-verif>${icon('check')}Vérifier</button><button class="btn ghost sm" data-mission>Changer</button></div></details>`
            : `<div class="card stack"><strong>Choisis une mission</strong><p class="small muted" style="margin:0">Un exercice réaliste, puis « Vérifier » : le formateur contrôle l’état de l’équipement et te note sur 20.</p><button class="btn primary sm" data-mission style="align-self:flex-start">${icon('play')}Missions</button></div>`}
          <p class="small muted" style="margin:0" ${!wide && st.lines.length > 2 ? 'hidden' : ''}>Tape de vraies commandes. Pour parler au formateur, commence par <code>@prof</code>. L’IA simule l’équipement : vérifie toujours sur du vrai matériel ou dans Packet Tracer.</p>
        </div>
        <div class="term" data-term>
          <div class="term-out" data-out aria-live="polite"></div>
          <form class="term-line" data-f><span class="term-prompt" data-pr></span><input data-in autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="send" aria-label="Commande"></form>
        </div>
      </div>
      <div class="term-keys">${st.mission && !wide ? '<button class="chip" data-verif2>Vérifier la mission</button>' : ''}<button class="chip" data-k="@prof ">@prof</button><button class="chip" data-k="?">?</button><button class="chip" data-hist>↑ Historique</button><button class="chip" data-k="clear">clear</button></div>`;
    $$('[data-dev]', v).forEach(b => b.onclick = async () => { if (busy) return; dev = b.dataset.dev; await save(); shell(); });
    $('[data-reset]', v).onclick = async () => { if (!S().lines.length || confirm('Remettre l’équipement en configuration d’usine ? La session est effacée.')) { saved.sessions[dev] = fresh(dev); await save(); shell(); } };
    $$('[data-mission]', v).forEach(b => b.onclick = missions);
    $$('[data-verif], [data-verif2]', v).forEach(b => b.onclick = () => run('@verifier Vérifie où j’en suis dans la mission.'));
    const inp = $('[data-in]', v);
    $('[data-f]', v).onsubmit = e => {
      e.preventDefault();
      const cmd = inp.value;
      inp.value = '';
      if (!cmd.trim()) { S().lines.push({ k: 'in', p: S().prompt, t: '' }); draw(); return; }
      hist.unshift(cmd); hIdx = -1;
      run(cmd);
    };
    inp.onkeydown = e => {
      if (e.key === 'ArrowUp' && hist.length) { hIdx = Math.min(hIdx + 1, hist.length - 1); inp.value = hist[hIdx]; e.preventDefault(); }
      if (e.key === 'ArrowDown') { hIdx = Math.max(hIdx - 1, -1); inp.value = hIdx >= 0 ? hist[hIdx] : ''; e.preventDefault(); }
    };
    $$('[data-k]', v).forEach(b => b.onclick = () => { const k = b.dataset.k; if (k === 'clear' || k === '?') { run(k); } else { inp.value = k; inp.focus(); } });
    $('[data-hist]', v).onclick = () => { if (hist.length) { hIdx = Math.min(hIdx + 1, hist.length - 1); inp.value = hist[hIdx]; inp.focus(); } };
    $('[data-term]', v).onclick = e => { if (!e.target.closest('a,button,.t-prof') && !getSelection().toString()) inp.focus(); };
    draw();
    paintIcons(v);
  }

  function draw() {
    const st = S();
    const out = $('[data-out]', v);
    out.innerHTML = st.lines.length ? st.lines.map(l => {
      if (l.k === 'in') return `<div class="t-in"><span class="term-prompt">${esc(l.p)}</span> ${esc(l.t)}</div>`;
      if (l.k === 'out') return `<pre class="t-out">${colorOutput(l.t)}</pre>`;
      return `<div class="t-prof md ${l.k === 'mission' ? 'mission' : ''}">${md(l.t)}</div>`;
    }).join('') : `<div class="t-sys">${esc(DEVICES[dev].label)} · configuration d’usine. Tape une commande${dev.startsWith('cisco') ? ' (ex. enable)' : ''}.</div>`;
    $('[data-pr]', v).textContent = st.prompt;
    const term = $('[data-term]', v);
    term.scrollTop = term.scrollHeight;
  }

  function missions() {
    const list = MISSIONS[dev] || [];
    const sh = sheet(`<h2>Missions · ${esc(DEVICES[dev].label)}</h2>
      <div class="list">${list.map(([t, txt], i) => `<button class="item" data-m="${i}"><span class="grow" style="min-width:0"><span class="t">${esc(t)}</span><span class="s" style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(txt.split('\n')[0])}</span></span></button>`).join('')}
      <button class="item" data-m="ai">${icon('bulb')}<span class="grow"><span class="t">Mission surprise (IA)</span><span class="s" style="display:block">Générée par l’IA, adaptée à ce que tu as déjà fait</span></span></button></div>
      <p class="small muted">Choisir une mission ne réinitialise pas l’équipement : utilise « Réinitialiser » pour repartir de zéro.</p>`);
    sh.el.addEventListener('click', async e => {
      const b = e.target.closest('[data-m]');
      if (!b) return;
      sh.close();
      const st = S();
      if (b.dataset.m === 'ai') { await run('@mission Donne-moi une mission adaptée à cet équipement.'); return; }
      const [titre, texte] = list[+b.dataset.m];
      st.mission = { titre, texte, note: null };
      st.lines.push({ k: 'mission', t: `**Mission : ${titre}**\n\n${texte}` });
      await save();
      shell();
    });
  }

  async function run(cmd) {
    if (busy) return;
    const st = S();
    const c = cmd.trim();
    // Commandes traitées sur l'appareil, sans IA.
    if (/^(clear|cls)$/i.test(c)) { st.lines = []; await save(); draw(); return; }
    const tag = c.startsWith('@') ? c.split(/\s/)[0].toLowerCase() : '';
    if (tag === '@verifier' && !st.mission) { toast('Choisis d’abord une mission'); return; }
    st.lines.push(tag === '@prof' ? { k: 'in', p: 'toi →', t: c } : tag ? { k: 'in', p: '', t: tag === '@mission' ? 'Nouvelle mission…' : 'Vérification de la mission…' } : { k: 'in', p: st.prompt, t: cmd });
    st.messages.push({ role: 'user', text: cmd });
    draw();
    const out = $('[data-out]', v);
    const live = document.createElement('pre');
    live.className = 't-out';
    live.innerHTML = '<span class="typing"></span>';
    out.appendChild(live);
    busy = new AbortController();
    const inp = $('[data-in]', v);
    inp.disabled = true;
    try {
      let txt = '';
      const r = await chat({
        system: terminalSystem(dev, st.mission && `${st.mission.titre}\n${st.mission.texte}`),
        messages: st.messages.slice(-40).map(m => ({ ...m, images: [] })),
        signal: busy.signal, onInfo: toast, task: 'fast',
        onDelta: d => { txt += d; live.textContent = txt.replace(/^\s*\[(PROF|MISSION)\]\s*/, ''); $('[data-term]', v).scrollTop = 1e9; },
      });
      st.messages.push({ role: 'assistant', text: r.text });
      await handle(r.text, tag);
    } catch (e) {
      if (e.name !== 'AbortError') st.lines.push({ k: 'prof', t: e.message });
      st.messages.pop();
    }
    busy = null;
    if (!tag) await bump('practice', 0);
    await save();
    if (tag === '@mission' || tag === '@verifier') shell(); else { draw(); }
    const i2 = $('[data-in]', v); i2.disabled = false;
    if (matchMedia('(pointer: fine)').matches) i2.focus();
  }

  async function handle(text, cmdTag) {
    const st = S();
    let t = text.replace(/```[a-z]*\n?/gi, '').replace(/\s+$/, '');
    const tag = (t.match(/^\s*\[(PROF|MISSION)\]/) || [])[1];
    if (tag) t = t.replace(/^\s*\[(PROF|MISSION)\]\s*/, '');
    const lines = t.split('\n');
    const last = lines[lines.length - 1].trim();
    if (last && last.length < 70 && PROMPT_RE.test(last) && !/^[-*#]/.test(last)) { st.prompt = last; lines.pop(); }
    const body = lines.join('\n').replace(/\s+$/, '');
    if (tag === 'MISSION' || cmdTag === '@mission') {
      const titre = (body.match(/^#+\s*(.+)$/m) || body.match(/\*\*(.+?)\*\*/) || [, 'Mission surprise'])[1].replace(/^Mission\s*:\s*/i, '').slice(0, 70);
      st.mission = { titre, texte: body.replace(/^#+\s*.+\n/, ''), note: null, ai: true };
      st.lines.push({ k: 'mission', t: body });
    } else if (tag === 'PROF' || cmdTag) {
      st.lines.push({ k: 'prof', t: body });
      const m = body.match(/NOTE\s*:\s*(\d+(?:[.,]\d+)?)\s*\/\s*20/i);
      if (cmdTag === '@verifier' && m && st.mission) {
        const note = +m[1].replace(',', '.');
        const first = st.mission.note == null || st.mission.note < 10;
        st.mission.note = Math.max(st.mission.note ?? 0, note);
        await record(DEVICES[dev].dom, [{ label: 'Terminal : ' + st.mission.titre, ok: note >= 10 }], { questions: false });
        await bump('practice');
        if (note >= 10 && first) {
          const ts = await getKV('terminal-stats', { missions: 0 });
          ts.missions++;
          await setKV('terminal-stats', ts);
          toast(note >= 20 ? 'Mission parfaite !' : 'Mission réussie');
        }
      }
    } else if (body) st.lines.push({ k: 'out', t: body });
  }

  shell();
}
