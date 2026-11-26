// Domaines de formation : une petite pastille de couleur, jamais de grands aplats.
export const DOMAINS = [
  { id: 'materiel', name: 'Matériel', color: '#FB923C' },
  { id: 'reseau', name: 'Réseau & Cisco', color: '#38BDF8' },
  { id: 'windows', name: 'Windows', color: '#60A5FA' },
  { id: 'winserver', name: 'Windows Server', color: '#818CF8' },
  { id: 'linux', name: 'Linux', color: '#4ADE80' },
  { id: 'macos', name: 'macOS', color: '#D4D4D4' },
  { id: 'virtu', name: 'Virtualisation', color: '#C084FC' },
  { id: 'securite', name: 'Sécurité', color: '#F87171' },
  { id: 'prog', name: 'Scripts & programmation', color: '#F472B6' },
  { id: 'autre', name: 'Autre', color: '#A3A3A3' },
];

export const domain = id => DOMAINS.find(d => d.id === id) || DOMAINS[DOMAINS.length - 1];
