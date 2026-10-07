// LA CARTE 3D EN DONNÉES RÉELLES (07/10/2026, note 20 « Plan de l'interface 3D », point 3) : GET /api/reseau.
// La hiérarchie vient du catalogue de Codex (interface/3d/catalogue.json) ; les traces, des passages de la boucle des
// agents (boucle_passages, 48 h : ok → COMPLETED, echec → ERROR) ; l'état d'Hermes, de /sante de l'exécutant
// (libre → IDLE, occupe → RUNNING, indisponible ou injoignable → OFFLINE). Rien d'inventé : un statut « Prévu » reste
// « Prévu », un état inconnu reste UNKNOWN, et une source qui tombe s'écrit dans erreurs[] — jamais une liste vide
// silencieuse : la carte passe alors seule en « Observations partielles ». Lecture seule : aucune écriture, nulle part.
'use strict';

const fs = require('fs');
const path = require('path');

const CATALOGUE = path.join(__dirname, 'interface', '3d', 'catalogue.json');
const TRADUCTION = { ok: 'COMPLETED', echec: 'ERROR' };
const SANTE = { libre: 'IDLE', occupe: 'RUNNING', indisponible: 'OFFLINE' };
// Les plus récents par agent : la fiche en montre six, le statut d'un module ne lit que le dernier. La page relit
// toutes les 15 s : sans plafond, un agent qui passe toutes les dix minutes pèserait 288 lignes par lecture.
const PAR_AGENT = 12;
const HISTORIQUE = 60;
const PASSAGES = `SELECT agent, statut, fin_le FROM (SELECT agent, statut, fin_le,
    row_number() OVER (PARTITION BY agent ORDER BY fin_le DESC) AS rang
  FROM boucle_passages WHERE fin_le > now() - interval '48 hours') p WHERE rang <= ${PAR_AGENT} ORDER BY fin_le DESC`;

// Les lectures par défaut : la base du cerveau SANS le filet de bases.cjs (qui rend [] quand la requête échoue :
// ici l'échec doit se voir), et la santé de l'exécutant. Le banc les remplace par une base et un exécutant simulés.
const requeteBase = (sql) => require('./bases.cjs').cerveau.query(sql).then((r) => r.rows);
const lireSante = () => fetch((process.env.EXECUTANT_URL || 'http://harness:8201') + '/sante', { signal: AbortSignal.timeout(3000) })
  .then((r) => r.json());   // indisponible répond 503 avec son JSON : il se lit comme les autres
const lireCatalogue = () => JSON.parse(fs.readFileSync(CATALOGUE, 'utf8'));

const iso = (d) => { const t = new Date(d); return Number.isFinite(t.getTime()) ? t.toISOString() : null; };

async function reseau({ requete = requeteBase, sante = lireSante, catalogue = lireCatalogue, maintenant = () => new Date() } = {}) {
  const erreurs = [];
  let noeuds = [];
  try {
    const c = catalogue();
    if (!c || !Array.isArray(c.noeuds)) throw new Error('format');
    // Le catalogue porte la hiérarchie ; ses traces, statuts d'aperçu et erreurs hors ligne ne sont pas repris.
    noeuds = c.noeuds.filter((n) => n && typeof n.id === 'string').map((n) => ({
      id: n.id, ...(n.parent ? { parent: n.parent } : {}), nom: n.nom, role: n.role, implementation: n.implementation,
      statut: n.statut === 'PLANNED' ? 'PLANNED' : 'UNKNOWN',
      modules: Array.isArray(n.modules) ? n.modules.filter((m) => typeof m === 'string') : [], traces: [] }));
  } catch (e) { erreurs.push('CATALOGUE_ILLISIBLE'); }

  const [passages, etatHermes] = await Promise.all([
    Promise.resolve().then(() => requete(PASSAGES)).catch(() => { erreurs.push('TRACES_INDISPONIBLES'); return []; }),
    Promise.resolve().then(() => sante()).catch(() => { erreurs.push('HERMES_INJOIGNABLE'); return null; }),
  ]);
  const traces = (Array.isArray(passages) ? passages : []).filter((p) => p && typeof p.agent === 'string')
    .map((p) => ({ agent: p.agent, statut: TRADUCTION[p.statut] || 'UNKNOWN', fin_le: iso(p.fin_le) }))
    .sort((a, b) => (b.fin_le || '').localeCompare(a.fin_le || ''));

  const places = new Set();
  for (const n of noeuds) {
    for (const m of n.modules) places.add(m);
    n.traces = traces.filter((t) => n.modules.includes(t.agent));
    // Hermes n'écrit aucun passage : son état est celui que l'exécutant déclare, ou OFFLINE s'il ne répond pas.
    if (n.modules.includes('hermes')) n.statut = etatHermes ? SANTE[etatHermes.etat] || 'UNKNOWN' : 'OFFLINE';
  }
  return {
    noeuds, erreurs, observe_le: iso(maintenant()),
    historique: traces.slice(0, HISTORIQUE),
    // Agents observés que le catalogue ne place pas encore (vitrines, prospective, apis… : placés après l'accord de Basile).
    hors_catalogue: [...new Set(traces.map((t) => t.agent))].filter((a) => !places.has(a)).sort(),
    sources: { hierarchie: 'catalogue.json (Codex, 04/10/2026)', traces: 'boucle_passages, 48 h', hermes: '/sante de l’exécutant' },
    precision: 'Passages des 48 dernières heures : ils ne prouvent pas une exécution en cours. Les éléments « Prévu » ne sont pas des services actifs.',
  };
}

module.exports = { reseau, PASSAGES, TRADUCTION, SANTE };
