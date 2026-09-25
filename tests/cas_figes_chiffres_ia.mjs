// CAS FIGÉS — le répertoire des chiffres officiels sur l'usage de l'IA
// (`agents/chiffres_ia.js`). Une règle du cerveau : un pourcentage d'adoption
// de l'IA en France ne se cite jamais de mémoire ; il se tire d'ici, où chaque
// entrée est verrouillée avec phrase exacte, millésime, source officielle,
// collection, date de parution et lien Insee/Eurostat.
//
// Trois protections figées :
//   1. le chiffre le plus récent existe et sa phrase est exacte ;
//   2. chaque entrée est complète, bornée, liée à une source officielle ;
//   3. la série Insee (2023 → 2025) progresse, aucune régression possible.
import { CHIFFRES_IA, verifierIntegrite, lePlusRecent, citer } from '../agents/chiffres_ia.js';

let ok = 0, ko = 0;
const verifie = (nom, cond, info = '') => { if (cond) ok++; else { ko++; console.log('  ÉCHEC :', nom, info); } };

// 1. Le chiffre le plus récent demandé : données 2025, Insee, 18 %.
const rec = lePlusRecent();
verifie('le plus récent porte sur 2025', rec.anneeDonnees === 2025, `année=${rec.anneeDonnees}`);
verifie('le plus récent est l’Insee, 18 %', rec.source === 'Insee' && rec.part === 18, `part=${rec.part}`);
verifie('phrase exacte du chiffre 2025', rec.phrase.includes('En 2025, 18 % des entreprises françaises de 10 salariés ou plus')
  && rec.phrase.includes('multiplié par trois depuis 2023'), rec.phrase);
verifie('lien officiel de la source 2025', rec.lien === 'https://www.insee.fr/fr/statistiques/9025878', rec.lien);
verifie('collection et date figées', rec.collection === 'Insee Première n° 2120' && rec.paruLe === '21/07/2026');

// 2. Intégrité de tout le répertoire : rien de vide, rien d'inventé.
const defauts = verifierIntegrite();
verifie('aucune malformation sur le répertoire', defauts.length === 0, defauts.join(' | '));

// 3. La série Insee est complète et ne régresse pas (6 → 10 → 18).
const insee = CHIFFRES_IA.filter((e) => e.source === 'Insee').sort((a, b) => a.anneeDonnees - b.anneeDonnees);
verifie('série Insee complète 2023-2024-2025',
  insee.length === 3 && insee.map((e) => e.anneeDonnees).join(',') === '2023,2024,2025');
const parts = insee.map((e) => e.part);
verifie('progression stricte de l’adoption', parts[0] < parts[1] && parts[1] < parts[2], parts.join(' → '));
verifie('les valeurs 6 / 10 / 18 sont en place', parts[0] === 6 && parts[1] === 10 && parts[2] === 18, parts.join(','));

// 4. Les déclinaisons par taille du chiffre le plus récent sont présentes
//    (utile pour citer « par taille d'entreprise » sans inventer).
const d = rec.detail;
verifie('par taille : 15 / 31 / 58 (2025)',
  d['De 10 à 49 salariés'] === 15 && d['De 50 à 249 salariés'] === 31 && d['250 salariés ou plus'] === 58,
  JSON.stringify(d));
verifie('par secteur : information-communication 59 (2025)', d['Information-communication'] === 59);

// 5. citer() fournit la phrase + la source au même endroit : preuve à citer.
verifie('citer() joint phrase et source', /Source : Insee/.test(citer(rec)) && rec.lien.includes('insee.fr'));

console.log(`cas figes chiffres_ia : ${ok}/${ok + ko} ${ko ? 'KO' : 'OK'}`);
process.exit(ko ? 1 : 0);