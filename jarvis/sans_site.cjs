// LES ENTREPRISES SANS SITE, CÔTÉ COCKPIT (08/10/2026) — ce que le Cockpit et l'agent agents/sans_site.js partagent :
// les codes d'activité de Sherlock, les annuaires officiels où Basile lit lui-même un numéro, et le compte par verdict.
// Rangé dans jarvis/ : le Cockpit ne voit que ce dossier ; l'agent le reprend d'ici, sans copie. Aucun annuaire n'est lu
// par un programme : ce ne sont que des liens que Basile ouvre.
'use strict';

// Les codes d'activité que Sherlock (n8n) va chercher, 10 salariés et plus, dans les départements 74, 01, 73, 38, 69.
const NAF_SANS_SITE = ['69.10Z', '69.20Z', '68.31Z', '68.32A', '66.22Z', '78.10Z', '70.22Z', '71.11Z'];
// La région de Basile : le siège doit y être.
const REGION = ['74', '01', '73', '38', '69'];

// Les annuaires officiels de chaque profession, vérifiés le 08/10/2026 depuis le PC de Basile (réponse 200). Celui des
// notaires (notaires.fr/fr/annuaire-notaires) a répondu 403 (protection contre les robots) à ces vérifications : il n'est
// pas mis tant qu'il n'a pas répondu 200 ; pour une étude, la recherche Pages Jaunes reste.
const ANNUAIRES = {
  avocat: { nom: 'Annuaire des avocats de France (Conseil national des barreaux)', url: 'https://www.avocat.fr/annuaire-des-avocats-de-france' },
  'expert-comptable': { nom: 'Annuaire des experts-comptables (Ordre)', url: 'https://annuaire.experts-comptables.org/' },
  'commissaire de justice': { nom: 'Annuaire des commissaires de justice (Chambre nationale)', url: 'https://commissaire-justice.fr/annuaire/' },
  architecte: { nom: 'Trouver un architecte (Ordre des architectes)', url: 'https://www.architectes.org/trouver-un-architecte-1114' },
};

// Les liens à ouvrir pour trouver le numéro : l'annuaire de la profession, puis la recherche Pages Jaunes sur le nom et la
// ville (adresse de recherche vérifiée le 08/10/2026 : /annuaire/chercherlespros ; /recherche répond « page introuvable »).
function annuaires(v) {
  const liens = [];
  if (ANNUAIRES[v.metier]) liens.push(ANNUAIRES[v.metier]);
  if (v.nom) {
    const q = new URLSearchParams({ quoiqui: String(v.nom), ou: String(v.ville || '') });
    liens.push({ nom: 'Pages Jaunes', url: `https://www.pagesjaunes.fr/annuaire/chercherlespros?${q}` });
  }
  return liens;
}

// Le compte pour la page Prospection : par verdict du Fureteur (prospects.site_statut) et par secteur, sur les entreprises
// de Sherlock encore à prospecter. lire(sql, params) rend des lignes ; une colonne absente rend un bilan vide.
const VERDICTS = ['prouve', 'absent', 'portail', 'inconnu', 'a_voir'];
async function bilan(lire) {
  let rows = [];
  try {
    rows = await lire(`SELECT coalesce(to_jsonb(p) ->> 'site_statut', 'a_voir') AS verdict, coalesce(p.sector, 'Sans secteur') AS secteur, count(*)::int AS n
      FROM prospects p WHERE p.status = 'nouveau' AND p.naf = ANY($1::text[]) GROUP BY 1, 2`, [NAF_SANS_SITE]);
  } catch { rows = []; }
  const vide = () => Object.fromEntries(VERDICTS.map((x) => [x, 0]));
  const total = vide(), secteurs = {};
  for (const r of rows || []) {
    const k = VERDICTS.includes(r.verdict) ? r.verdict : 'a_voir';
    total[k] += r.n;
    (secteurs[r.secteur] = secteurs[r.secteur] || vide())[k] += r.n;
  }
  return { total, secteurs, sans_site: total.absent + total.portail };
}

module.exports = { NAF_SANS_SITE, REGION, ANNUAIRES, annuaires, bilan, VERDICTS };
