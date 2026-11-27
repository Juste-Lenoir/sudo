// Réparer : types d'appareils, sécurité avant d'ouvrir et parcours de diagnostic hors ligne
// (sans IA ni réseau). Chaque parcours : des questions oui/non jusqu'à une piste de réparation.

export const TYPES = [
  { id: 'telephone', label: 'Téléphone', icon: 'phone' },
  { id: 'tablette', label: 'Tablette', icon: 'tablet' },
  { id: 'portable', label: 'PC portable', icon: 'laptop' },
  { id: 'fixe', label: 'PC fixe', icon: 'monitor' },
  { id: 'autre', label: 'Autre', icon: 'wrench' },
];
export const type = id => TYPES.find(t => t.id === id) || TYPES[TYPES.length - 1];
const mobile = t => ['telephone', 'tablette', 'portable'].includes(t);

export const RESULTS = [
  { id: 'en_cours', label: 'En cours', cls: '' },
  { id: 'repare', label: 'Réparé', cls: 'ok' },
  { id: 'piece', label: 'Pièce à commander', cls: 'mid' },
  { id: 'revenir', label: 'À revenir', cls: 'mid' },
  { id: 'pas_repare', label: 'Pas réparable', cls: 'bad' },
];
export const result = id => RESULTS.find(r => r.id === id) || RESULTS[0];

// ---- Sécurité avant d'ouvrir ----
export function safety(t) {
  const list = [
    { id: 'donnees', t: 'Données sauvegardées par le propriétaire', d: 'Ou il accepte par écrit le risque de les perdre. Une réparation peut effacer l’appareil.' },
    { id: 'verrou', t: 'Le propriétaire déverrouille lui-même', d: 'On ne contourne jamais un code, un compte (Apple, Google, Microsoft) ni un mot de passe BIOS.' },
    { id: 'eteint', t: 'Éteint et débranché', d: 'Chargeur, câble secteur et périphériques retirés avant d’ouvrir.' },
    { id: 'esd', t: 'Électricité statique', d: 'Bracelet antistatique relié à la masse, ou touche une partie métallique non peinte avant de manipuler les cartes.' },
  ];
  if (mobile(t)) list.push(
    { id: 'batterie', t: 'Batterie inspectée', d: 'Gonflée, percée ou chaude : ne pas la charger, ne pas la percer, la poser dans un bac métallique ou ininflammable, loin de tout.' },
    { id: 'deconnecte', t: 'Batterie déconnectée en premier', d: 'Débrancher le connecteur de batterie avant toute autre nappe, avec un outil en plastique (spudger).' },
    { id: 'outils', t: 'Pas d’outil métallique près de la batterie', d: 'Risque de court-circuit et d’incendie. Pour décoller : chaleur douce (iOpener, pistolet à air chaud bas), jamais sur la batterie.' },
  );
  if (t === 'fixe') list.push(
    { id: 'condo', t: 'Câble secteur retiré, 30 s d’attente', d: 'Appuie sur le bouton power pour vider les condensateurs. N’ouvre jamais le bloc d’alimentation : tension dangereuse même débranché.' },
  );
  list.push(
    { id: 'vis', t: 'Vis rangées dans l’ordre', d: 'Tapis magnétique ou bac à compartiments : les vis n’ont pas toutes la même longueur.' },
    { id: 'photos', t: 'Photos à chaque étape du démontage', d: 'Pour remonter les nappes et les vis au bon endroit.' },
  );
  return list;
}

// ---- Parcours de diagnostic ----
// Nœud : { q, d?, oui, non } ou { fin, d, go? } (go : propose d'enchaîner sur un autre parcours).
export const TREES = {
  allume: {
    label: 'Ne s’allume plus', start: 'a1',
    n: {
      a1: { q: 'Branché 15 min sur un chargeur et un câble connus bons, y a-t-il un signe de vie ?', d: 'Voyant de charge, vibration, son, logo, écran qui s’éclaire faiblement. Un testeur USB (ampèremètre) aide beaucoup.', oui: 'a2', non: 'a4' },
      a2: { q: 'L’écran reste noir, mais l’appareil vit (son, vibration, ventilateur, voyants) ?', oui: 'f_ecran', non: 'a3' },
      a3: { q: 'Il démarre puis s’éteint ou redémarre en boucle ?', oui: 'f_boucle', non: 'f_demarre' },
      a4: { q: 'Le connecteur de charge est-il propre, sans jeu ni broche tordue ?', d: 'Regarde à la lampe : peluches, poussière, oxydation verte ou blanche.', oui: 'a5', non: 'f_port' },
      a5: { q: 'Est-ce un PC fixe ?', oui: 'f_alim', non: 'f_batt' },
      f_ecran: { fin: 'Panne d’affichage probable', d: 'Écran, nappe ou rétroéclairage. Teste une sortie vidéo externe (HDMI sur PC) et éclaire l’écran avec une lampe : une image très sombre = rétroéclairage. Reconnecte la nappe (batterie débranchée) avant de commander un écran.', go: 'ecran' },
      f_boucle: { fin: 'Batterie à bout ou système abîmé', d: 'Laisse charger 30 min puis réessaie. Téléphone ou tablette : mode recovery (combinaison de boutons du fabricant). PC : démarre avec le minimum (une barrette de RAM, sans périphériques) et regarde les bips ou voyants de la carte mère. Batterie gonflée : la remplacer.' },
      f_demarre: { fin: 'Il charge mais ne démarre pas', d: 'Redémarrage forcé (combinaison de boutons du fabricant), bouton power encrassé ou cassé. PC portable : retire la batterie si possible et teste sur secteur seul. PC : réinstalle la RAM, réinitialise le BIOS (pile CMOS retirée 1 min).' },
      f_port: { fin: 'Connecteur de charge', d: 'Appareil éteint : nettoie à sec avec un cure-dent en bois ou une brosse antistatique, jamais de métal. Oxydé ou broche cassée : remplacer le connecteur (souvent une petite carte fille ou une nappe).' },
      f_alim: { fin: 'Alimentation ou bouton du boîtier', d: 'Interrupteur à l’arrière de l’alimentation, prise, câble secteur. Teste l’alimentation avec un testeur ATX. Bouton du boîtier : vérifie le câble PWR_SW sur le front panel header de la carte mère.' },
      f_batt: { fin: 'Batterie vide ou circuit de charge', d: 'Laisse 30 min sur le chargeur d’origine. Au testeur USB : 0,00 A = l’appareil ne tire rien (connecteur ou circuit de charge) ; un peu de courant = batterie qui se recharge ou morte. PC portable : retire la batterie et teste sur secteur seul.' },
    },
  },
  charge: {
    label: 'Ne charge pas, batterie faible', start: 'c1',
    n: {
      c1: { q: 'Avec un autre câble et un autre chargeur connus bons, ça charge ?', oui: 'f_cable', non: 'c2' },
      c2: { q: 'Le câble tient-il bien dans le connecteur, sans jeu ni faux contact ?', oui: 'c3', non: 'f_port' },
      c3: { q: 'Ça charge, mais la batterie se vide très vite ou l’appareil s’éteint vers 20 ou 30 % ?', oui: 'f_usee', non: 'f_carte' },
      f_cable: { fin: 'Câble ou chargeur en cause', d: 'Le remplacer par un modèle certifié, à la bonne puissance (PC portable : même tension que celle inscrite sous l’appareil).' },
      f_port: { fin: 'Connecteur de charge encrassé ou usé', d: 'Nettoyage à sec (cure-dent en bois, brosse antistatique), appareil éteint. S’il reste du jeu : remplacer le connecteur.' },
      f_usee: { fin: 'Batterie usée', d: 'Vérifie son état. iPhone : Réglages → Batterie → État de la batterie. Windows : `powercfg /batteryreport` dans un terminal. macOS : Informations système → Alimentation (nombre de cycles). Android : application ou code du fabricant. Sous 80 % de capacité : la remplacer.' },
      f_carte: { fin: 'Aucune charge détectée', d: 'Connecteur de charge (souvent sur une carte fille) ou circuit de charge de la carte mère. Mesure au testeur USB. PC portable : vérifie la prise d’alimentation (DC jack) et la tension du chargeur.' },
    },
  },
  ecran: {
    label: 'Écran cassé ou image anormale', start: 'e1',
    n: {
      e1: { q: 'La vitre est fissurée, mais l’image et le tactile marchent ?', oui: 'f_vitre', non: 'e2' },
      e2: { q: 'Lignes, taches, couleurs bizarres ou tactile qui touche tout seul ?', oui: 'e3', non: 'e4' },
      e3: { q: 'Ça change quand on appuie doucement près de la nappe ou qu’on bouge la charnière (PC portable) ?', oui: 'f_nappe', non: 'f_dalle' },
      e4: { q: 'Avec une lampe torche contre l’écran, on devine une image très sombre ?', oui: 'f_retro', non: 'f_noir' },
      f_vitre: { fin: 'Vitre cassée', d: 'Sur la plupart des téléphones récents, vitre et dalle sont collées : on remplace le bloc écran complet. Mets du ruban adhésif sur les fissures avant d’ouvrir, et protège tes doigts.' },
      f_nappe: { fin: 'Faux contact de nappe', d: 'Batterie débranchée, reconnecte la nappe d’écran (et celle du tactile). PC portable : la nappe passe dans la charnière, elle s’use à force d’ouvrir.' },
      f_dalle: { fin: 'Dalle abîmée', d: 'Choc, pression ou liquide : remplacer l’écran. Relève la référence au dos de la dalle pour commander la bonne.' },
      f_retro: { fin: 'Rétroéclairage', d: 'L’image est là mais sans lumière : nappe, fusible ou circuit de rétroéclairage, ou lampe de l’écran. Commence par reconnecter la nappe.' },
      f_noir: { fin: 'Aucune image', d: 'Vérifie que l’appareil démarre vraiment (son, voyants). Sinon, suis le parcours « Ne s’allume plus ».', go: 'allume' },
    },
  },
  lent: {
    label: 'PC lent ou qui plante', start: 'l1',
    n: {
      l1: { q: 'Le système est-il sur un disque dur mécanique (HDD) ?', d: 'Windows : Gestionnaire des tâches → Performance → type de disque. Un HDD fait du bruit et tourne.', oui: 'f_ssd', non: 'l2' },
      l2: { q: 'Au repos, le processeur ou la mémoire sont-ils presque à 100 % ?', d: 'Gestionnaire des tâches (Windows), Moniteur d’activité (macOS), `top` (Linux).', oui: 'l3', non: 'l4' },
      l3: { q: 'Un programme précis prend toute la place ?', oui: 'f_prog', non: 'f_ram' },
      l4: { q: 'Le PC chauffe ou le ventilateur souffle fort ?', oui: 'f_chauffe', non: 'f_systeme' },
      f_ssd: { fin: 'Passer à un SSD', d: 'C’est la réparation la plus efficace. Vérifie d’abord la santé du disque (CrystalDiskInfo, ou `smartctl -a` sous Linux), puis clone-le sur un SSD (Clonezilla) ou réinstalle le système.' },
      f_prog: { fin: 'Programme ou logiciel malveillant', d: 'Désinstalle-le ou retire-le du démarrage (Gestionnaire des tâches → Démarrage). Analyse antivirus : Microsoft Defender en analyse hors ligne.' },
      f_ram: { fin: 'Pas assez de mémoire', d: '8 GB minimum conseillés pour Windows 10 ou 11. Ajoute une barrette compatible : même type (DDR4, DDR5…), format (DIMM ou SO-DIMM) et slots libres.' },
      f_chauffe: { fin: 'Surchauffe', d: 'Suis le parcours « Chauffe, ventilateur bruyant ».', go: 'chauffe' },
      f_systeme: { fin: 'Système à remettre en ordre', d: 'Mises à jour, 15 % d’espace libre sur le disque, test de la mémoire (Windows Memory Diagnostic), puis `sfc /scannow` et `DISM /Online /Cleanup-Image /RestoreHealth` en administrateur. En dernier recours : sauvegarde puis réinstallation.' },
    },
  },
  chauffe: {
    label: 'Chauffe, ventilateur bruyant, s’éteint seul', start: 'h1',
    n: {
      h1: { q: 'Les grilles d’aération ou le radiateur sont-ils pleins de poussière ?', oui: 'f_poussiere', non: 'h2' },
      h2: { q: 'Le ventilateur tourne-t-il ?', oui: 'f_pate', non: 'f_ventilo' },
      f_poussiere: { fin: 'Nettoyage', d: 'Éteint, débranché, batterie déconnectée si possible. Bombe d’air sec en bloquant les pales du ventilateur (sinon il tourne trop vite et s’abîme). Après 3 ou 4 ans, refais aussi la pâte thermique.' },
      f_ventilo: { fin: 'Ventilateur bloqué ou mort', d: 'Nettoie-le. S’il ne repart pas, remplace-le : la référence est sur son étiquette.' },
      f_pate: { fin: 'Pâte thermique ou batterie', d: 'Vérifie les températures (HWMonitor sous Windows, `sensors` sous Linux). Pâte thermique sèche ou radiateur mal serré : refaire la pâte. Téléphone ou tablette qui chauffe : vérifie que la batterie ne gonfle pas.' },
    },
  },
  eau: {
    label: 'Tombé dans l’eau ou liquide renversé', start: 'w1',
    n: {
      w1: { q: 'L’appareil est-il encore allumé ou en charge ?', oui: 'f_couper', non: 'f_eau' },
      f_couper: { fin: 'Couper tout de suite', d: 'Débranche-le et éteins-le maintenant, sans tester s’il marche. Ensuite : retire coque, carte SIM et carte SD, ouvre et débranche la batterie au plus vite. Pas de riz ni de sèche-cheveux chaud. Nettoie la carte à l’alcool isopropylique (90 % ou plus) avec une brosse douce, laisse sécher à l’air, puis cherche la corrosion (dépôts verts ou blancs).' },
      f_eau: { fin: 'Procédure dégât des eaux', d: 'Ne pas allumer ni charger. Retire coque, carte SIM et carte SD. Ouvre et débranche la batterie au plus vite. Pas de riz ni de sèche-cheveux chaud. Nettoie la carte à l’alcool isopropylique (90 % ou plus) avec une brosse douce, laisse sécher à l’air. Cherche la corrosion (dépôts verts ou blancs) près des connecteurs. Eau salée ou boisson sucrée : le nettoyage est prioritaire.' },
    },
  },
};
