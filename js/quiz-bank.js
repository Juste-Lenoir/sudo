// Banque de questions intégrée : quiz sans IA (hors ligne, ou quand les quotas sont épuisés).
// Complétée par les questions de tous les quiz déjà générés.
const Q = (domain, q, choix, bonne, explication, notion) => ({ domain, q, choix, bonne, explication, notion, illustration: null });

export const BANK = [
  // Matériel
  Q('materiel', 'Quel connecteur alimente la carte mère en principal ?', ['ATX 24-pin', 'EPS 8-pin', 'PCIe 6+2', 'SATA power'], 0, 'Le 24-pin ATX alimente la carte mère ; l’EPS 8-pin alimente le processeur.', 'connecteurs alimentation'),
  Q('materiel', 'Où se branche le câble EPS 8-pin ?', ['Près du socket du processeur', 'Sur la carte graphique', 'Sur le SSD', 'Sur le front panel'], 0, 'L’EPS (CPU power) se trouve en haut de la carte mère, près du socket.', 'EPS CPU'),
  Q('materiel', 'Pourquoi porter un bracelet antistatique ?', ['Éviter qu’une décharge électrostatique abîme les composants', 'Se protéger du 230 V', 'Refroidir les composants', 'Améliorer le contact des barrettes'], 0, 'Une décharge électrostatique (ESD), même invisible, peut endommager une puce.', 'ESD'),
  Q('materiel', 'Un SSD M.2 NVMe utilise quel bus ?', ['PCIe', 'SATA', 'USB', 'IDE'], 0, 'NVMe passe par des lignes PCIe ; certains SSD M.2 sont SATA, d’où l’intérêt de vérifier.', 'M.2 NVMe'),
  Q('materiel', 'Un PC émet des bips au démarrage sans image. Quelle est la première chose à vérifier ?', ['La RAM, bien enfoncée', 'La version de Windows', 'Le câble réseau', 'Le clavier'], 0, 'Les bips du POST signalent souvent un problème de mémoire ; le code dépend du BIOS (voir le manuel de la carte mère).', 'POST'),
  Q('materiel', 'Sur une carte mère avec 4 slots et 2 barrettes, où les placer en dual channel ?', ['Dans les slots indiqués par le manuel (souvent A2 et B2)', 'Dans les deux premiers slots côte à côte', 'N’importe où', 'Dans A1 et A2'], 0, 'Le manuel indique les slots prioritaires, souvent A2 et B2.', 'dual channel'),

  // Réseau
  Q('reseau', 'Quel masque correspond à /26 ?', ['255.255.255.192', '255.255.255.128', '255.255.255.224', '255.255.255.240'], 0, '26 bits à 1 : 255.255.255.192, soit 64 adresses dont 62 utilisables.', 'masque CIDR'),
  Q('reseau', 'Combien d’hôtes utilisables dans un /24 ?', ['254', '256', '255', '252'], 0, '2⁸ = 256 adresses, moins l’adresse réseau et le broadcast.', 'hôtes utilisables'),
  Q('reseau', 'Sur un switch Cisco, quelle commande met un port en mode trunk ?', ['switchport mode trunk', 'switchport access vlan 10', 'trunk enable', 'ip trunk'], 0, 'switchport mode trunk ; le port transporte alors plusieurs VLAN étiquetés (802.1Q).', 'trunk'),
  Q('reseau', 'Quelle commande Cisco affiche un résumé des interfaces et de leurs adresses IP ?', ['show ip interface brief', 'show running-config vlan', 'show mac', 'ip route'], 0, 'show ip interface brief (sh ip int br) : interfaces, IP, état Status et Protocol.', 'show ip int br'),
  Q('reseau', 'Le DHCP fonctionne dans quel ordre ?', ['Discover, Offer, Request, Acknowledge', 'Request, Offer, Discover, Acknowledge', 'Offer, Discover, Acknowledge, Request', 'Discover, Request, Offer, Acknowledge'], 0, 'DORA : Discover, Offer, Request, Acknowledge.', 'DORA'),
  Q('reseau', 'Une adresse 169.254.x.x sur un poste signifie :', ['Il n’a pas obtenu de réponse du serveur DHCP (APIPA)', 'Il est sur Internet', 'C’est une adresse publique', 'Le DNS ne répond pas'], 0, 'APIPA : le poste s’est attribué une adresse faute de DHCP. Vérifier câble, VLAN et serveur DHCP.', 'APIPA'),
  Q('reseau', 'Quel protocole traduit un nom en adresse IP ?', ['DNS', 'DHCP', 'ARP', 'NAT'], 0, 'Le DNS résout les noms ; ARP associe une IP à une adresse MAC sur le réseau local.', 'DNS'),

  // Windows
  Q('windows', 'Quelle commande affiche la configuration IP complète sous Windows ?', ['ipconfig /all', 'ifconfig -a', 'ip a', 'netstat -r'], 0, 'ipconfig /all : IP, masque, passerelle, DNS, adresse MAC, DHCP.', 'ipconfig'),
  Q('windows', 'Quelle commande répare les fichiers système de Windows ?', ['sfc /scannow', 'chkdsk /r', 'gpupdate /force', 'diskpart'], 0, 'sfc /scannow vérifie et répare les fichiers système ; DISM répare l’image si sfc échoue.', 'sfc'),
  Q('windows', 'Où gérer les programmes qui se lancent au démarrage ?', ['Gestionnaire des tâches → Démarrage', 'Panneau de configuration → Son', 'Explorateur → Affichage', 'Paramètres → Heure'], 0, 'L’onglet Démarrage du Gestionnaire des tâches active ou désactive les programmes au démarrage.', 'démarrage'),
  Q('windows', 'Quelle commande vide le cache DNS du poste ?', ['ipconfig /flushdns', 'ipconfig /release', 'nslookup /clear', 'dns /flush'], 0, 'ipconfig /flushdns vide le cache du résolveur DNS.', 'cache DNS'),
  Q('windows', 'Quel outil génère un rapport sur l’usure de la batterie d’un PC portable ?', ['powercfg /batteryreport', 'msinfo32 /battery', 'chkdsk /battery', 'perfmon /report'], 0, 'powercfg /batteryreport crée un rapport HTML avec la capacité d’origine et actuelle.', 'batterie'),

  // Windows Server
  Q('winserver', 'Quel rôle permet de gérer utilisateurs et ordinateurs d’un domaine ?', ['AD DS', 'DHCP', 'IIS', 'WSUS'], 0, 'Active Directory Domain Services (AD DS) gère le domaine, les comptes et les GPO.', 'AD DS'),
  Q('winserver', 'Quelle commande force l’application des GPO sur un poste ?', ['gpupdate /force', 'gpresult /r', 'sfc /scannow', 'dcpromo'], 0, 'gpupdate /force ; gpresult /r affiche les GPO appliquées.', 'GPO'),
  Q('winserver', 'Pourquoi le DNS est-il indispensable à Active Directory ?', ['Les postes trouvent les contrôleurs de domaine grâce aux enregistrements SRV', 'Il distribue les adresses IP', 'Il chiffre les mots de passe', 'Il remplace le DHCP'], 0, 'Les clients localisent les DC par des enregistrements SRV dans le DNS.', 'DNS et AD'),
  Q('winserver', 'Une GPO liée à une OU s’applique à :', ['Les objets contenus dans cette OU (et ses sous-OU)', 'Tout le domaine', 'Uniquement les serveurs', 'Uniquement les administrateurs'], 0, 'Elle s’applique à l’OU et hérite vers les sous-OU, sauf blocage.', 'GPO et OU'),
  Q('winserver', 'Avec PowerShell, quelle commande crée un utilisateur AD ?', ['New-ADUser', 'Add-User', 'Set-ADUser', 'net group'], 0, 'New-ADUser (module ActiveDirectory) ; Set-ADUser modifie un compte existant.', 'New-ADUser'),

  // Linux
  Q('linux', 'Que fait chmod 755 sur un fichier ?', ['rwx pour le propriétaire, r-x pour le groupe et les autres', 'rwx pour tout le monde', 'Lecture seule pour tous', 'Supprime les droits'], 0, '7 = rwx, 5 = r-x.', 'chmod'),
  Q('linux', 'Quelle commande affiche les adresses IP sous Linux ?', ['ip a', 'ipconfig', 'show ip', 'netsh'], 0, 'ip a (ip address) ; ifconfig est l’ancienne commande.', 'ip a'),
  Q('linux', 'Comment redémarrer le service ssh avec systemd ?', ['sudo systemctl restart ssh', 'service ssh reboot', 'sudo reboot ssh', 'systemctl ssh restart'], 0, 'systemctl restart <service> ; status pour vérifier.', 'systemctl'),
  Q('linux', 'Quelle commande montre l’espace disque libre de façon lisible ?', ['df -h', 'du -s', 'free -h', 'ls -l'], 0, 'df -h : espace par système de fichiers ; du mesure la taille de dossiers.', 'df'),
  Q('linux', 'Où sont stockés les comptes utilisateurs ?', ['/etc/passwd', '/etc/hosts', '/var/log', '/home/users'], 0, '/etc/passwd liste les comptes ; les mots de passe hachés sont dans /etc/shadow.', 'passwd'),

  // macOS
  Q('macos', 'Quel raccourci ouvre la recherche Spotlight ?', ['⌘ + Espace', '⌃ + Alt + Suppr', '⌘ + Q', '⌥ + Tab'], 0, '⌘ + Espace ouvre Spotlight.', 'Spotlight'),
  Q('macos', 'Quel outil sauvegarde un Mac automatiquement ?', ['Time Machine', 'Utilitaire de disque', 'Moniteur d’activité', 'Console'], 0, 'Time Machine sauvegarde sur un disque externe ou un NAS.', 'Time Machine'),
  Q('macos', 'Où voir quel programme utilise le processeur ?', ['Moniteur d’activité', 'Préférences réseau', 'Trousseau d’accès', 'Finder'], 0, 'Le Moniteur d’activité est l’équivalent du Gestionnaire des tâches.', 'Moniteur d’activité'),

  // Virtualisation
  Q('virtu', 'En mode Bridged, une VM :', ['Obtient une IP sur le même réseau que l’hôte', 'Est isolée de tout réseau', 'Partage l’IP de l’hôte (NAT)', 'Ne voit que les autres VM'], 0, 'Bridged (pont) : la VM est un poste de plus sur le réseau physique.', 'Bridged'),
  Q('virtu', 'En mode NAT, une VM :', ['Sort sur Internet via l’IP de l’hôte, mais n’est pas joignable directement', 'A une IP publique', 'Est sur le réseau physique', 'N’a aucun accès réseau'], 0, 'NAT : la VM passe par l’hôte ; les autres machines du réseau ne la voient pas.', 'NAT'),
  Q('virtu', 'À quoi sert un snapshot ?', ['Revenir à l’état de la VM à un instant donné', 'Sauvegarder définitivement la VM ailleurs', 'Accélérer la VM', 'Cloner le matériel de l’hôte'], 0, 'Un snapshot permet un retour arrière ; ce n’est pas une vraie sauvegarde.', 'snapshot'),
  Q('virtu', 'Quel mode réseau VMware isole des VM entre elles, sans hôte ni Internet ?', ['LAN Segment', 'Bridged', 'NAT', 'Host-only avec DHCP'], 0, 'Un LAN Segment est un réseau privé entre VM uniquement.', 'LAN Segment'),

  // Sécurité
  Q('securite', 'Qu’est-ce que l’authentification à deux facteurs ?', ['Prouver son identité avec deux éléments de nature différente', 'Deux mots de passe', 'Un mot de passe très long', 'Changer de mot de passe deux fois par an'], 0, 'Par exemple quelque chose qu’on connaît (mot de passe) et qu’on possède (téléphone, clé).', '2FA'),
  Q('securite', 'Le principe du moindre privilège consiste à :', ['Donner uniquement les droits nécessaires', 'Donner les droits administrateur à tous', 'Supprimer tous les droits', 'Partager un compte commun'], 0, 'Chaque compte n’a que les droits dont il a besoin, ce qui limite les dégâts en cas de compromission.', 'moindre privilège'),
  Q('securite', 'Un e-mail urgent demande de cliquer pour « débloquer votre compte ». C’est probablement :', ['Du phishing (hameçonnage)', 'Une mise à jour normale', 'Un message du support officiel', 'Un spam sans danger'], 0, 'Urgence + lien + demande d’identifiants : signes classiques de phishing. Vérifier l’expéditeur et passer par le site officiel.', 'phishing'),
  Q('securite', 'La règle de sauvegarde 3-2-1, c’est :', ['3 copies, 2 supports différents, 1 hors site', '3 disques, 2 serveurs, 1 cloud', '3 sauvegardes par jour', '3 mots de passe, 2 comptes, 1 clé'], 0, '3 copies des données, sur 2 types de supports, dont 1 à l’extérieur.', '3-2-1'),

  // Scripts
  Q('prog', 'En PowerShell, quelle commande liste les services ?', ['Get-Service', 'List-Service', 'ls services', 'Show-Service'], 0, 'Get-Service ; filtrer avec Where-Object, par exemple Get-Service | Where-Object Status -eq Running.', 'Get-Service'),
  Q('prog', 'En Bash, comment rendre un script exécutable ?', ['chmod +x script.sh', 'exec script.sh', 'run script.sh', 'sudo script.sh'], 0, 'chmod +x puis ./script.sh.', 'chmod +x'),
  Q('prog', 'Que fait le pipe | ?', ['Envoie la sortie d’une commande à la suivante', 'Redirige vers un fichier', 'Lance deux commandes en parallèle', 'Commente la ligne'], 0, 'commande1 | commande2 : la sortie de la première devient l’entrée de la seconde. > redirige vers un fichier.', 'pipe'),
];
