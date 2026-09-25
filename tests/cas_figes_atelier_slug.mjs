// CAS FIGÉS — LE SLUG DE L'ATELIER (le sous-domaine .raime.fr d'un service).
//
// L'usine à services donne à chaque service un nom de sous-domaine court. Ce fichier
// verrouille la seule règle possible : minuscules, sans accents, sans espace ni
// ponctuation, 30 caractères, jamais un mot réservé. Tout réglage doit re-tomber ici.
import { slugifier, sousDomaine, RESERVES } from '../atelier/slug.js';

const CAS = [
  // — Les accents et le casse disparaissent, les espaces deviennent des tirets
  ['slugifier', 'École de ski Chamonix', 'ecole-de-ski-chamonix'],
  ['slugifier', 'Audit IA PME', 'audit-ia-pme'],
  ['slugifier', 'Déjà-vu café', 'deja-vu-cafe'],
  ['slugifier', '   accueiL & Co   ', 'accueil-co'],
  // — Ponctuation et symboles : tout sauf a-z0-9 devient un tiret unique
  ['slugifier', 'Café & Thé !', 'cafe-the'],
  ['slugifier', "l'Atelier—à la loupe,", 'l-atelier-a-la-loupe'],
  // — Trop long : coupé à 30, sans laisser un tiret en queue
  ['slugifier', 'un superbe service de conseil en stratégie digitale longue durée', 'un-superbe-service-de-conseil'],
  // — Trop court ou vide : la valeur de secours
  ['slugifier', 'a', 'service'],
  ['slugifier', '', 'service'],
  ['slugifier', '---', 'service'],
  ['slugifier', null, 'service'],
  // — Un mot réservé devient « -boutique »
  ['sousDomaine', 'www', 'www-boutique'],
  ['sousDomaine', 'raime', 'raime-boutique'],
  ['sousDomaine', 'n8n', 'n8n-boutique'],
  ['sousDomaine', 'cockpit', 'cockpit-boutique'],
  ['sousDomaine', 'service', 'service'],        // « service » n'est pas réservé
  ['sousDomaine', 'Audit IA PME', 'audit-ia-pme'],
  // — L'ensemble réservé est bien le même que celui de l'ancien brief
  ['reserves', null, null],
];

let ko = 0;
for (const [type, entree, attendu] of CAS) {
  let obtenu, ok;
  if (type === 'slugifier')    { obtenu = slugifier(entree);   ok = obtenu === attendu; }
  else if (type === 'sousDomaine') { obtenu = sousDomaine(entree); ok = obtenu === attendu; }
  else { // réserves : cohérence, on compare au jeu figé de la maison
    const attendus = ['www', 'raime', 'n8n', 'cockpit', 'voyage', 'metabase', 'docuseal',
      'postgres', 'caddy', 'boucle', 'porte', 'api', 'mail'];
    ok = attendus.every((x) => RESERVES.has(x)) && attendus.length === RESERVES.size;
    obtenu = [...RESERVES].sort().join(',');
  }
  if (!ok) { ko++; console.log(`  ECHEC [${type}] ${JSON.stringify(entree)} -> ${JSON.stringify(obtenu)} (attendu ${JSON.stringify(attendu)})`); }
}
console.log(ko === 0 ? `cas figes atelier slug : ${CAS.length}/${CAS.length} OK` : `cas figes atelier slug : ${ko} ECHEC(S) sur ${CAS.length}`);
process.exit(ko === 0 ? 0 : 1);