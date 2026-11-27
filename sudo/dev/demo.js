// MODE DÉMO (tests) : réponses préparées à la place des vraies IA, pour vérifier l'interface
// sans clé API. Activé seulement avec ?demo dans l'adresse. Rien n'est envoyé sur Internet.
import { getAI } from '../js/ai.js';

const s = await getAI();
for (const id of ['gemini', 'groq', 'mistral']) Object.assign(s.providers[id], { enabled: true, key: 'demo' });
window.dispatchEvent(new Event('ai-changed'));

const ANALYSE = {
  titre: 'Atelier VMware : 3 VM et modes réseau', domaine: 'virtu', physique: false,
  reformulation: 'Créer 3 machines virtuelles dans VMware et comparer leur adresse IP et leur passerelle selon le mode réseau : Bridged, NAT et LAN Segment.',
  a_clarifier: [
    { point: '« Créez une deuxième machine virtuelle avec Manjaro » : c’est en fait la troisième VM', proposition: 'VM 3 = Manjaro Linux xfce' },
    { point: '« Faites un IPA » : il s’agit de la commande ip a', proposition: 'ip a (ou ip addr)' },
    { point: '« routeur perspectives » : nom propre au centre de formation', proposition: 'À demander au formateur ; en NAT, la passerelle est le routeur virtuel de VMware' },
    { point: 'Version de VMware et origine des ISO non précisées', proposition: 'VMware Workstation Pro, ISO officielles Microsoft et Manjaro' },
  ],
  prerequis: ['VMware Workstation', 'ISO Windows 10', 'ISO Manjaro xfce', '10 Go de RAM libres pour faire tourner les VM une par une'],
  etapes: [
    { titre: 'VM 1 · Windows 10, 4 GB, 40 GB', groupe: 'VM 1 · Windows 10', but: 'Créer la première VM avec les ressources demandées.', faire: ['Créer la VM avec l’assistant', 'Memory : 4 GB', 'Hard Disk : 40 GB', 'Installer Windows 10'], releves: [], validation: 'La VM démarre sur le bureau Windows.', commandes: [] },
    { titre: 'VM 1 · Network Adapter en Bridged', groupe: 'VM 1 · Windows 10', but: 'La VM doit être vue comme un vrai PC du réseau.', faire: ['Ouvrir Edit virtual machine settings', 'Network Adapter → Bridged'], releves: [], validation: 'La VM a accès à Internet.', commandes: [{ cmd: 'ping 8.8.8.8', os: 'cmd', role: 'tester l’accès à Internet' }] },
    { titre: 'ipconfig sur VM 1', groupe: 'VM 1 · Windows 10', but: 'Relever l’adresse et la passerelle en Bridged.', faire: ['Ouvrir l’invite de commandes', 'Lancer ipconfig'], releves: ['IPv4 Address', 'Default Gateway'], validation: 'Adresse dans le même réseau que la box.', commandes: [{ cmd: 'ipconfig', os: 'cmd', role: 'afficher IP, masque, passerelle' }] },
    { titre: 'VM 2 · Windows 10, 4 GB, 40 GB', groupe: 'VM 2 · Windows 10', but: 'Créer la deuxième VM.', faire: ['Créer la VM (ou cloner la VM 1)', 'Memory : 4 GB', 'Hard Disk : 40 GB'], releves: [], validation: 'La VM démarre.', commandes: [] },
    { titre: 'VM 2 · Network Adapter en NAT', groupe: 'VM 2 · Windows 10', but: 'Mettre la VM derrière le routeur virtuel de VMware.', faire: ['VM éteinte, ouvrir Edit virtual machine settings', 'Network Adapter → NAT', 'Démarrer la VM'], releves: [], validation: 'La VM a Internet mais une IP différente.', commandes: [{ cmd: 'ipconfig /release && ipconfig /renew', os: 'cmd', role: 'redemander une IP' }] },
    { titre: 'ipconfig sur VM 2', groupe: 'VM 2 · Windows 10', but: 'Relever l’adresse et la passerelle en NAT.', faire: ['Lancer ipconfig', 'Comparer avec la VM 1'], releves: ['IPv4 Address', 'Default Gateway'], validation: 'Réseau privé de VMware (ex. 192.168.x.128, passerelle .2).', commandes: [{ cmd: 'ipconfig', os: 'cmd', role: 'afficher IP, masque, passerelle' }] },
    { titre: 'VM 3 · Manjaro xfce, 2 GB, 20 GB', groupe: 'VM 3 · Manjaro', but: 'Créer la troisième VM sous Linux.', faire: ['Memory : 2 GB', 'Hard Disk : 20 GB', 'Installer Manjaro xfce'], releves: [], validation: 'Le bureau xfce s’affiche.', commandes: [] },
    { titre: 'VM 3 · Network Adapter en LAN Segment', groupe: 'VM 3 · Manjaro', but: 'Isoler la VM dans un réseau local virtuel.', faire: ['Créer un LAN Segment', 'Network Adapter → LAN Segment'], releves: [], validation: 'La VM n’a plus Internet.', commandes: [] },
    { titre: 'ip a sur VM 3', groupe: 'VM 3 · Manjaro', but: 'Relever l’adresse et expliquer le résultat.', faire: ['Ouvrir un terminal', 'Lancer ip a', 'Chercher la passerelle'], releves: ['inet (IPv4)', 'Default Gateway'], validation: 'Pas d’IPv4 : aucun serveur DHCP dans le LAN Segment.', commandes: [{ cmd: 'ip a && ip route', os: 'bash', role: 'IP puis passerelle, en une ligne' }] },
  ],
  schema: 'flowchart LR\n  box["Box 192.168.1.1"] --- vm1["VM 1 · Bridged"]\n  box --- pc["PC hôte"]\n  pc --- nat["Routeur NAT VMware .2"]\n  nat --- vm2["VM 2 · NAT"]\n  seg(["LAN Segment, pas de DHCP"]) --- vm3["VM 3 · Manjaro"]',
  recherche: { mots_cles: ['VMware network adapter bridged vs NAT', 'VMware LAN segment'], sources: [{ nom: 'Documentation VMware Workstation', url: 'https://docs.vmware.com/' }] },
  pieges: ['Changer le mode réseau sans renouveler l’IP'], securite: [],
};

const PHOTO = {
  resume: 'Carte mère ATX vue de dessus, sans composants installés.', reference: '',
  elements: [
    { nom: 'Socket CPU', detail: 'Le processeur se pose ici, triangle doré aligné.', box: [160, 330, 420, 560], sur: true },
    { nom: 'DIMM (RAM)', detail: 'Barrettes en A2 et B2 d’abord (voir manuel).', box: [120, 600, 560, 700], sur: true },
    { nom: 'ATX 24-pin', detail: 'Gros câble d’alimentation de la carte mère.', box: [300, 740, 560, 800], sur: true },
    { nom: 'EPS 8-pin', detail: 'Alimentation du processeur, en haut à gauche.', box: [40, 120, 110, 260], sur: false },
    { nom: 'PCIe x16', detail: 'Carte graphique.', box: [620, 120, 680, 640], sur: true },
  ],
  reponse: 'Le **câble 24 broches** de ta photo va dans le connecteur **ATX 24-pin** (étiquette 3), sur le bord droit de la carte mère. Il n’a qu’un sens grâce au clip.',
  etapes: ['Processeur', 'RAM', 'Ventirad', 'Carte mère dans le boîtier', 'Alimentation : ATX 24-pin puis EPS 8-pin'],
  securite: ['Alimentation débranchée', 'Bracelet antistatique'], autre_photo: 'Une photo plus proche du coin en haut à gauche pour confirmer le connecteur EPS.',
};

const QOPEN = { questions: [
  { type: 'notion', q: 'Avec tes mots : quelle différence entre le mode Bridged et le mode NAT ?', attendu: 'En Bridged la VM est sur le réseau physique comme un vrai PC (IP donnée par la box) ; en NAT elle est derrière un routeur virtuel de VMware, dans un réseau privé.', indice: 'Qui donne l’adresse IP dans chaque cas ?' },
  { type: 'pourquoi', q: 'Pourquoi ta VM 2 a-t-elle une adresse en 192.168.x.128 et pas en 192.168.1.x ?', attendu: 'Parce qu’en NAT, c’est le DHCP de VMware qui lui donne une adresse dans son réseau privé.', indice: 'Regarde la passerelle.' },
  { type: 'commande', q: 'Sous Manjaro, quelle commande unique te donne l’IP puis la passerelle ?', attendu: 'ip a && ip route (ou ip a puis ip route).', indice: 'Deux commandes ip enchaînées.' },
  { type: 'et_si', q: 'Et si tu passais la VM 3 en NAT, que verrais-tu avec ip a ?', attendu: 'Une IPv4 dans le réseau NAT de VMware, donnée par son DHCP.', indice: 'Le LAN Segment n’a pas de DHCP.' },
  { type: 'panne', q: 'Ta VM en Bridged n’a pas d’Internet mais ton PC si. Que vérifies-tu en premier ?', attendu: 'La carte physique choisie pour le pont (Wi-Fi ou Ethernet) et ipconfig dans la VM.', indice: 'Sur quelle carte le pont est-il fait ?' },
  { type: 'entreprise', q: 'En entreprise, quand utiliserais-tu un LAN Segment ?', attendu: 'Pour un labo isolé (tests, malware, maquette) sans risque pour le vrai réseau.', indice: 'Isolation.' },
] };
const QQCM = { questions: [
  { type: 'notion', q: 'En mode NAT, qui attribue l’adresse IP de la VM ?', choix: ['La box', 'Le DHCP de VMware', 'Windows tout seul', 'Le formateur'], bonne: 1, attendu: 'Le service DHCP du réseau NAT de VMware (VMnet8).', indice: '' },
  { type: 'commande', q: 'Quelle commande Linux affiche les adresses IP ?', choix: ['ipconfig', 'ip a', 'ifshow', 'netstat -ip'], bonne: 1, attendu: 'ip a (ip addr).', indice: '' },
  { type: 'preuve', q: 'Comment prouver que la VM en Bridged est vue comme un vrai PC ?', choix: ['Elle a une IP du même réseau que la box', 'Elle démarre vite', 'Elle a 4 GB de RAM', 'Elle a le même nom que le PC'], bonne: 0, attendu: 'Même réseau que la box, et visible depuis un autre PC.', indice: '' },
  { type: 'et_si', q: 'Une VM en LAN Segment sans serveur DHCP aura :', choix: ['Une IP de la box', 'Une IP NAT', 'Pas d’IPv4 configurée', 'L’IP de l’hôte'], bonne: 2, attendu: 'Pas d’IPv4 (seulement une IPv6 de lien local).', indice: '' },
] };

const reply = (text, extra = '') => text + extra;

// ---------- Phase 2 : quiz, flashcards, terminal ----------
const QUIZ = { titre: 'VLAN, DHCP et modes réseau', questions: [
  { q: 'Quelle commande Cisco affiche la liste des VLAN et de leurs ports ?', choix: ['show vlan brief', 'show ip route', 'show interfaces trunk', 'show running-config vlan'], bonne: 0, explication: '`show vlan brief` liste chaque VLAN avec ses ports en mode accès.', notion: 'Vérifier les VLAN', illustration: null },
  { q: 'Dans cette topologie, pourquoi PC2 ne joint-il pas PC1 ?', choix: ['Le câble est croisé', 'Ils sont dans deux VLAN différents sans routeur', 'Le switch est éteint', 'PC2 n’a pas d’adresse MAC'], bonne: 1, explication: 'Deux VLAN = deux réseaux séparés : il faut un routeur (ou un switch de niveau 3) pour passer de l’un à l’autre.', notion: 'Isolation des VLAN',
    illustration: { type: 'schema', contenu: 'flowchart LR\n  pc1["PC1 · VLAN 10\\n192.168.10.5"] --- sw["Switch 2960"]\n  pc2["PC2 · VLAN 20\\n192.168.20.5"] --- sw', legende: 'Où est le problème ?' } },
  { q: 'D’après cette sortie, quelle est la passerelle de la VM ?', choix: ['192.168.150.128', '255.255.255.0', '192.168.150.2', '192.168.150.255'], bonne: 2, explication: 'La ligne **Default Gateway** donne la passerelle : en NAT VMware, c’est l’adresse en .2.', notion: 'Lire ipconfig',
    illustration: { type: 'sortie', contenu: 'Carte Ethernet Ethernet0 :\n   Adresse IPv4. . . . . . . . . . . . . .: 192.168.150.128\n   Masque de sous-réseau. . . . . . . . . : 255.255.255.0\n   Passerelle par défaut. . . . . . . . . : 192.168.150.2', legende: 'ipconfig dans la VM 2' } },
  { q: 'Quel connecteur alimente la carte mère ?', choix: ['EPS 8-pin', 'ATX 24-pin', 'SATA power', 'PCIe 6+2'], bonne: 1, explication: 'Le gros connecteur **ATX 24-pin** alimente la carte mère ; l’EPS 8-pin alimente le processeur.', notion: 'Connecteurs d’alimentation',
    illustration: { type: 'photo', contenu: 'ATX 24-pin power connector', legende: 'Connecteur d’alimentation' } },
  { q: 'Un PC obtient l’adresse 169.254.12.7. Que s’est-il passé ?', choix: ['Il a une IP fixe', 'Le DHCP n’a pas répondu (APIPA)', 'Il est en NAT', 'Il est dans le VLAN 169'], bonne: 1, explication: 'Une adresse en 169.254.x.x (APIPA) signifie que le PC n’a pas trouvé de serveur DHCP.', notion: 'APIPA', illustration: null },
] };
const CARDS = { cartes: [
  { recto: 'Commande Cisco pour voir les VLAN et leurs ports ?', verso: '`show vlan brief`', domaine: 'reseau', illustration: null },
  { recto: 'Mode réseau VMware où la VM est vue comme un vrai PC du réseau ?', verso: '**Bridged** (pont) : IP donnée par la box.', domaine: 'virtu', illustration: null },
  { recto: 'Passerelle habituelle d’une VM en NAT dans VMware ?', verso: 'L’adresse en **.2** du réseau VMnet8 (ex. 192.168.150.2).', domaine: 'virtu', illustration: { type: 'schema', contenu: 'flowchart LR\n  vm["VM · NAT"] --- nat["Routeur NAT .2"] --- pc["PC hôte"] --- box["Box"]', legende: '' } },
  { recto: 'Commande Linux : IP puis passerelle en une ligne ?', verso: '`ip a && ip route`', domaine: 'linux', illustration: null },
  { recto: 'Que signifie une adresse 169.254.x.x ?', verso: 'APIPA : le DHCP n’a pas répondu.', domaine: 'reseau', illustration: null },
] };

function terminalAnswer(sys, msgs) {
  const cmd = (msgs[msgs.length - 1]?.text || '').trim();
  const start = (sys.match(/Invite de départ : (.+)$/m) || [, 'Router>'])[1].trim();
  const prev = [...msgs].reverse().find(m => m.role === 'assistant' && /[#>$%]\s*$/.test(m.text.trim()));
  const pr = prev ? prev.text.trim().split('\n').pop() : start;
  const host = (pr.match(/^([\w-]+)/) || [, 'Router'])[1];
  if (cmd.startsWith('@mission')) return `[MISSION]\n### Mission : VLAN pour deux services\nLa PME a deux services, **Compta** et **RH**.\n1. Crée le VLAN 10 « COMPTA » et le VLAN 20 « RH ».\n2. Place Fa0/1-5 dans le VLAN 10 et Fa0/6-10 dans le VLAN 20.\n3. Vérifie avec une seule commande.\n\n**Réussite** : chaque port est dans le bon VLAN.\n\n${pr}`;
  if (cmd.startsWith('@verifier')) return '[PROF]\n- ✅ Mode privilégié et configuration globale maîtrisés\n- ✅ Nom de l’équipement changé\n- ❌ Mot de passe chiffré (enable secret) absent\n- ❌ Configuration non enregistrée (copy run start)\n\nPlus simple : `wr` enregistre en 2 lettres.\n\nNOTE : 12/20';
  if (cmd.startsWith('@prof')) return '[PROF] Piste : sur Cisco, tout se configure depuis le mode **configuration globale**. Quelle commande y mène depuis `Router#` ? Indice : elle commence par `conf`.';
  if (start.includes('Router') || start.includes('Switch')) {
    if (/^en(able)?$/i.test(cmd)) return pr.replace(/>$/, '#');
    if (/^conf(igure)?( t(erminal)?)?$/i.test(cmd)) return 'Enter configuration commands, one per line.  End with CNTL/Z.\n' + host + '(config)#';
    const h = cmd.match(/^hostname\s+(\S+)/i);
    if (h) return h[1] + '(config)#';
    if (/^(end|exit)$/i.test(cmd)) return host + '#';
    if (/^(sh(ow)? ip int(erface)? br(ief)?)$/i.test(cmd)) return 'Interface              IP-Address      OK? Method Status                Protocol\nGigabitEthernet0/0/0   unassigned      YES unset  administratively down down\nGigabitEthernet0/0/1   unassigned      YES unset  administratively down down\n' + pr;
    if (cmd === '?') return 'Exec commands:\n  configure  Enter configuration mode\n  enable     Turn on privileged commands\n  ping       Send echo messages\n  show       Show running system information\n' + pr;
    return `${' '.repeat(pr.length + 1)}^\n% Invalid input detected at '^' marker.\n\n${pr}`;
  }
  if (/^ip a/.test(cmd)) return '1: lo: <LOOPBACK,UP> mtu 65536\n    inet 127.0.0.1/8 scope host lo\n2: ens33: <BROADCAST,MULTICAST,UP> mtu 1500\n    inet 192.168.1.50/24 brd 192.168.1.255 scope global dynamic ens33\n' + pr;
  if (/^ipconfig/i.test(cmd)) return 'Carte Ethernet Ethernet :\n   Adresse IPv4. . . . . . . . . . . . . .: 192.168.1.47\n   Masque de sous-réseau. . . . . . . . . : 255.255.255.0\n   Passerelle par défaut. . . . . . . . . : 192.168.1.1\n\n' + pr;
  return `${cmd.split(' ')[0]}: command not found\n${pr}`;
}

function answer(sys, msgs) {
  const last = msgs[msgs.length - 1]?.text || '';
  if (sys.includes('Tu simules de façon réaliste')) return terminalAnswer(sys, msgs);
  if (last.includes('Crée un quiz QCM')) return JSON.stringify(QUIZ);
  if (last.includes('Crée des flashcards')) return JSON.stringify(CARDS);
  if (last.includes('Transforme cette consigne')) return JSON.stringify(ANALYSE);
  if (last.includes('PREMIÈRE image')) return JSON.stringify(PHOTO);
  if (last.includes('Crée ') && last.includes('questions')) return JSON.stringify(last.includes('choix multiples') ? QQCM : QOPEN);
  if (last.includes('Corrige les réponses')) return JSON.stringify({ corrections: QOPEN.questions.map((q, i) => ({ verdict: ['juste', 'partiel', 'juste', 'faux', 'juste', 'partiel'][i], points: [2, 1, 2, 0, 2, 1][i], commentaire: 'Démo : commentaire du formateur.', attendu: q.attendu })), note: 13, bilan: 'Bonne compréhension des modes réseau. Revois le rôle du DHCP.', a_revoir: ['DHCP dans un LAN Segment'] });
  if (last.includes('COMPTE RENDU')) return '# Compte rendu – Atelier VMware\n## Contexte et objectifs\nComparer les modes réseau de VMware.\n## Résultats\n| VM | Mode | IPv4 Address | Default Gateway |\n|---|---|---|---|\n| VM 1 | Bridged | 192.168.1.47 | 192.168.1.1 |\n| VM 2 | NAT | [à compléter] | [à compléter] |\n';
  if (last.includes('Dessine UN schéma')) return '```mermaid\n' + ANALYSE.schema + '\n```';
  if (last.includes('Plusieurs IA ont répondu')) return '## D\'accord sur\nLe NAT cache la VM derrière l\'hôte.\n## Désaccords\nAucun important.\n## Meilleure réponse\nGemini : plus précise sur la passerelle.\n## Réponse finale\nEn NAT, la passerelle .2 est le routeur virtuel de VMware.';
  if (/Réponds simplement : OK/.test(last)) return 'OK';
  if (/192\.168\.\d+\.\d+/.test(last)) {
    const ips = last.match(/192\.168\.\d+\.\d+/g);
    return reply(`Bien vu : **${ips[0]}** avec la passerelle **${ips[1] || '?'}**. Ta VM est dans le réseau privé que VMware crée sur ton PC : c'est le principe du **NAT**.\n\n\`\`\`mermaid\nflowchart LR\n  pc["PC hôte"] --- nat["Routeur NAT .2"] --- vm["VM 2"]\n\`\`\`\n\nÀ ton avis, un autre PC de la salle peut-il joindre ta VM 2 ?`,
      `\n\`\`\`sudo\n{"valider":[5,6],"releves":[{"etape":6,"champ":"IPv4 Address","valeur":"${ips[0]}"},{"etape":6,"champ":"Default Gateway","valeur":"${ips[1] || ''}"}]}\n\`\`\``);
  }
  if (last.includes('Indice')) return 'Piste : le réglage du réseau ne se fait pas dans Windows, mais dans les **paramètres de la VM côté VMware**. Quel menu ouvre ces paramètres quand la VM est éteinte ?';
  return 'Réponse de démonstration : en mode démo, sudo n\'appelle aucune IA. Ajoute une vraie clé dans Réglages pour des réponses réelles.';
}

window.__sudoDemo = async (p, cfg, system, msgs, onDelta, signal) => {
  const text = answer(system, msgs);
  const isJSON = text.startsWith('{');
  if (isJSON) { await new Promise(r => setTimeout(r, 400)); onDelta(text); return null; }
  for (let i = 0; i < text.length; i += 24) {
    if (signal?.aborted) throw Object.assign(new Error('arrêté'), { name: 'AbortError' });
    onDelta(text.slice(i, i + 24));
    await new Promise(r => setTimeout(r, 12));
  }
  return { remaining: p.id === 'groq' ? 812 : 0, limit: p.id === 'groq' ? 1000 : 0 } && (p.id === 'groq' ? { remaining: 812, limit: 1000 } : null);
};
console.info('sudo : mode démo actif (réponses préparées, aucune IA appelée)');
