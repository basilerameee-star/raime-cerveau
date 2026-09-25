// CHIFFRES IA — le répertoire des chiffres officiels, vérifiés et sourcés,
// sur l'usage de l'intelligence artificielle par les entreprises en France.
//
// Règle du cerveau : « un fait s'applique seul ». Ici, aucun agent n'a le droit
// de citer un pourcentage d'adoption de l'IA sans le tirer de ce répertoire.
// Chaque entrée est figée : phrase exacte, année des données, source officielle,
// collection, date de parution du document, lien vers la publication et le champ
// statistique. Aucune valeur n'est écrite de mémoire : tout vient d'une
// publication de l'Insee ou d'Eurostat, lue et recopiée.
//
// Sources retenues (les plus récentes au 26 septembre 2026) :
//   • Insee Première n° 2120, « Les technologies de l'information et de la
//     communication dans les entreprises en 2025 », paru le 21/07/2026.
//   • Insee Première n° 2061, « Les ... dans les entreprises en 2024 », juil. 2025.
// Le chiffre le plus récent porte sur les données 2025. Aucune publication
// postérieure (données 2026) n'existait à la date de rédaction : si l'on doute
// d'une phrase, on la retire plutôt que de l'approcher.
//
//   node agents/chiffres_ia.js          # récapitulatif + contrôle d'intégrité
//   node --test tests/cas_figes_chiffres_ia.mjs   # les cas figés

// ── Le répertoire ───────────────────────────────────────────────────────────
// `part` est le chiffre principal de l'entrée (part d'entreprises utilisant l'IA).
// `detail` porte les déclinaisons publiées dans la même figure synthétique.
export const CHIFFRES_IA = [
  {
    id: 'insee-2023',
    anneeDonnees: 2023,
    source: 'Insee',
    collection: 'Insee Première n° 2061',
    paruLe: '01/07/2025',
    lien: 'https://www.insee.fr/fr/statistiques/8604126',
    champ: 'France, entreprises de 10 salariés ou plus des secteurs principalement marchands, hors secteurs agricole, financier et d’assurance',
    phrase: 'En 2023, 6 % des entreprises françaises de 10 salariés ou plus déclarent utiliser au moins une technologie d’intelligence artificielle (IA).',
    part: 6,
    detail: {
      'De 10 à 49 salariés': 5,
      'De 50 à 249 salariés': 10,
      '250 salariés ou plus': 21,
      'Information-communication': 30,
      'Activités spécialisées, scientifiques et techniques': 14,
      'Construction': 2,
      'Commerce': 4,
      'Transport et entreposage': 2,
    },
  },
  {
    id: 'insee-2024',
    anneeDonnees: 2024,
    source: 'Insee',
    collection: 'Insee Première n° 2061',
    paruLe: '01/07/2025',
    lien: 'https://www.insee.fr/fr/statistiques/8604126',
    champ: 'France, entreprises de 10 salariés ou plus des secteurs principalement marchands, hors secteurs agricole, financier et d’assurance',
    phrase: 'En 2024, 10 % des entreprises françaises de 10 salariés ou plus déclarent utiliser au moins une technologie d’intelligence artificielle (IA), quatre points de plus qu’en 2023.',
    part: 10,
    detail: {
      'De 10 à 49 salariés': 9,
      'De 50 à 249 salariés': 15,
      '250 salariés ou plus': 33,
      'Information-communication': 42,
      'Activités spécialisées, scientifiques et techniques': 17,
      'Construction': 3,
      'Commerce': 10,
      'Transport et entreposage': 5,
    },
  },
  {
    id: 'insee-2025',
    anneeDonnees: 2025,
    source: 'Insee',
    collection: 'Insee Première n° 2120',
    paruLe: '21/07/2026',
    lien: 'https://www.insee.fr/fr/statistiques/9025878',
    champ: 'France, entreprises de 10 salariés ou plus des secteurs principalement marchands, hors secteurs agricole, financier et d’assurance',
    phrase: 'En 2025, 18 % des entreprises françaises de 10 salariés ou plus déclarent utiliser au moins une technologie d’intelligence artificielle (IA), 8 points de plus qu’en 2024 et 12 points de plus qu’en 2023. Ce taux d’usage a ainsi été multiplié par trois depuis 2023.',
    part: 18,
    detail: {
      'De 10 à 49 salariés': 15,
      'De 50 à 249 salariés': 31,
      '250 salariés ou plus': 58,
      'Information-communication': 59,
      'Activités spécialisées, scientifiques et techniques': 33,
      'Activités immobilières': 26,
      'Construction': 10,
      'Commerce': 13,
      'Transport et entreposage': 9,
      'Hébergement et restauration': 12,
      'Industrie manufacturière': 17,
      'Énergie, eau, gestion des déchets, dépollution': 19,
      'Services administratifs et de soutien': 19,
    },
  },
  {
    id: 'eurostat-2025',
    anneeDonnees: 2025,
    source: 'Eurostat',
    collection: 'Eurostat – TIC des entreprises',
    paruLe: '2026',
    lien: 'https://ec.europa.eu/eurostat/databrowser/view/isoc_eb_ai/view/table1?lang=fr',
    champ: 'Union européenne, entreprises de 10 salariés ou plus des secteurs principalement marchands, hors secteurs agricole, financier et d’assurance',
    phrase: 'En 2025, 20 % des entreprises de l’Union européenne déclarent utiliser au moins une technologie d’intelligence artificielle.',
    part: 20,
    detail: {
      'Entreprises françaises (rappel Insee)': 18,
    },
  },
];

// ── Intégrité ───────────────────────────────────────────────────────────────
// L'argument du cerveau : un chiffre sans source officielle ne se cite pas.
// Cette fonction vérifie chaque entrée et renvoie la liste des défauts.
export function verifierIntegrite() {
  const defauts = [];
  const obligatoires = ['id', 'anneeDonnees', 'source', 'collection', 'paruLe', 'lien', 'champ', 'phrase', 'part'];
  const officiels = [/^https:\/\/www\.insee\.fr\//, /^https:\/\/ec\.europa\.eu\/eurostat\//];
  for (const entree of CHIFFRES_IA) {
    for (const cle of obligatoires) {
      if (entree[cle] === undefined || entree[cle] === null || String(entree[cle]).trim() === '') {
        defauts.push(`${entree.id || '?'} : champ « ${cle} » vide`);
      }
    }
    if (!Number.isFinite(entree.part) || entree.part < 0 || entree.part > 100) {
      defauts.push(`${entree.id} : part hors bornes 0-100`);
    }
    if (!officiels.some((re) => re.test(entree.lien || ''))) {
      defauts.push(`${entree.id} : lien non officiel (Insee ou Eurostat attendus)`);
    }
    if (!(entree.detail && Object.keys(entree.detail).length > 0)) {
      defauts.push(`${entree.id} : aucune déclinaison de détail`);
    }
  }
  return defauts;
}

// ── Questionnement ──────────────────────────────────────────────────────────
// Le chiffre le plus récent du répertoire (millésime de données le plus haut).
export function lePlusRecent() {
  const max = CHIFFRES_IA.reduce((a, b) => (b.anneeDonnees > a.anneeDonnees ? b : a), CHIFFRES_IA[0]);
  return max;
}

// Une phrase prête à citer, avec son lien et son millésime, pour un agent
// rédactionnel : jamais de pourcentage nu.
export function citer(entree) {
  return `${entree.phrase} Source : ${entree.source}, ${entree.collection}, ${entree.paruLe}. ${entree.lien}`;
}

// ── Exécutable ──────────────────────────────────────────────────────────────
// Seul le script lancé directement (`node agents/chiffres_ia.js`) imprime un
// récapitulatif. Importé par un test, le module ne s'annonce pas.
const estScriptPrincipal = typeof process.argv[1] === 'string'
  && /chiffres_ia\.js$/.test(process.argv[1].replace(/\\/g, '/'));
if (estScriptPrincipal) {
  const plusRecent = lePlusRecent();
  console.log(`Chiffre le plus récent : ${plusRecent.part} % des entreprises (données ${plusRecent.anneeDonnees}).`);
  console.log(citer(plusRecent));
  const defauts = verifierIntegrite();
  console.log(defauts.length === 0 ? `Intégrité : ${CHIFFRES_IA.length} entrées, aucune malformation.` : `Défauts : ${defauts.join(' | ')}`);
}