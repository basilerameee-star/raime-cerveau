// LE SLUG — le nom réseau d'un service, d'une phrase brute.
//
// L'usine à services de rAIme donne à chaque service un sous-domaine court .raime.fr.
// Ce fichier contient LA seule façon de le dériver d'un nom : minuscules, sans accents,
// sans espace ni ponctuation, coupé à 30 caractères, et jamais un mot réservé.
//
// Sortie : "Audit IA PME" → "audit-ia-pme" ; "École de ski Chamonix" → "ecole-de-ski-chamonix".
// Un mot réservé devient "<mot>-boutique". Un nom trop court ou vide devient "service".

// Les sous-domaines déjà pris (infrastructure, marque, outils) : on ne les ré-attribue pas.
export const RESERVES = new Set(['www', 'raime', 'n8n', 'cockpit', 'voyage', 'metabase', 'docuseal',
  'postgres', 'caddy', 'boucle', 'porte', 'api', 'mail']);

// Le CANON : normalise un nom libre en sous-domaine valide.
//  - minuscules, accents enlevés (NFD puis suppression des signes diacritiques) ;
//  - tout ce qui n'est pas a-z0-9 devient un tiret unique ;
//  - pas de tiret en tête ni en queue, 30 caractères au plus ;
//  - garde un motif valide et au moins 2 caractères, sinon la valeur de secours.
export function slugifier(nom, secours = 'service') {
  const n = String(nom ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')               // enlève les accents (diacritiques)
    .replace(/[^a-z0-9]+/g, '-')                   // tout le reste devient un tiret
    .replace(/^-+|-+$/g, '')                       // ni début ni fin par un tiret
    .slice(0, 30)
    .replace(/-+$/g, '');                          // une coupure ne doit pas laisser un tiret
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(n) || n.length < 2) return secours;
  return n;
}

// Le sous-domaine d'un service : un slug réservé est renvoyé vers « -boutique ».
// « service » n'a pas de sens comme boutique si le secours est retombé dessus.
export function sousDomaine(nom) {
  const s = slugifier(nom);
  return RESERVES.has(s) ? `${s}-boutique` : s;
}