// LES RÉSUMÉS DES SIMULATIONS (08/10/2026) : trading (sept échelles) et bourse (portefeuilles fictifs), lus par le Cockpit.
// Rangés dans jarvis/ : le conteneur du Cockpit ne voit QUE ce dossier. Avant, le rapport du matin importait
// ../agents/trading.js, l'import échouait en production, l'erreur était avalée, et l'e-mail disait « pas encore de
// données » alors que 354 opérations étaient en base (audit du 08/10/2026). Les agents reprennent ces définitions d'ici.
export const CAPITAL = 1000;
export const SYMBOLES = ['BTCEUR', 'ETHEUR'];
// échelle → intervalle Binance, règle, nom
export const ECHELLES = {
  // 22/10/2026 : la seconde et la minute supprimées par Basile (les frais mangeaient tout : −99,8 % et −94 %)
  heure: { binance: '1h', regle: 'retour', libelle: 'à l’heure' },
  jour: { binance: '1d', regle: 'retour', libelle: 'à la journée' },
  semaine: { binance: '1w', regle: 'tendance', n: 20, libelle: 'à la semaine' },
  mois: { binance: '1M', regle: 'tendance', n: 10, libelle: 'au mois' },
  trimestre: { binance: null, regle: 'tendance', n: 4, libelle: 'au trimestre' },   // fait des bougies mensuelles
};

export async function resumeTrading(brain) {
  const { rows } = await brain.query(`SELECT p.agent, min(p.depuis) AS depuis, sum(p.liquidites)::float AS liquidites,
      json_object_agg(p.symbole, p.quantite) AS quantites,
      (SELECT count(*)::int FROM trading_operations o WHERE o.agent = p.agent) AS operations,
      (SELECT coalesce(sum(frais), 0)::float FROM trading_operations o WHERE o.agent = p.agent) AS frais
    FROM trading_portefeuilles p GROUP BY p.agent`);
  const prix = {};
  for (const s of SYMBOLES) {
    const [r] = (await brain.query(`SELECT c::float AS c FROM trading_bougies WHERE symbole = $1 ORDER BY debut DESC LIMIT 1`, [s])).rows;
    prix[s] = r ? r.c : null;
  }
  return Object.keys(ECHELLES).map((agent) => {
    const r = rows.find((x) => x.agent === agent);
    if (!r) return { agent, libelle: ECHELLES[agent].libelle, valeur: null };
    const valeur = r.liquidites + SYMBOLES.reduce((t, s) => t + Number(r.quantites[s] || 0) * (prix[s] || 0), 0);
    return { agent, libelle: ECHELLES[agent].libelle, depuis: r.depuis, valeur: Math.round(valeur * 100) / 100,
      perf: Math.round((valeur / CAPITAL - 1) * 10000) / 100, operations: r.operations, frais: Math.round(r.frais * 100) / 100 };
  });
}

export async function resumeBourse(brain, capital = CAPITAL) {
  const { rows } = await brain.query(`SELECT s.nom, s.libelle, s.regles, to_char(s.debut, 'YYYY-MM-DD') AS debut, v.mode, v.valeur::float AS valeur,
      to_char(v.jour, 'YYYY-MM-DD') AS jour,
      (SELECT min(x.valeur / x.haut) FROM (SELECT valeur, max(valeur) OVER (ORDER BY jour) AS haut FROM bourse_valeurs
        WHERE strategie = s.nom AND mode = v.mode) x)::float - 1 AS pire
    FROM bourse_strategies s JOIN LATERAL (SELECT DISTINCT ON (mode) mode, valeur, jour FROM bourse_valeurs WHERE strategie = s.nom ORDER BY mode, jour DESC) v ON true
    ORDER BY s.nom, v.mode`);
  return rows.map((r) => ({ ...r, perf: Math.round((r.valeur / capital - 1) * 1000) / 10, pire: Math.round(r.pire * 1000) / 10 }));
}
