// LES AGENTS DE TRADING (08/10/2026, feuille de route point 56) — sept échelles de temps, en SIMULATION, toute la donnée gardée.
//
// Basile, 08/10/2026 (message vocal) : « un agent qui trade à la seconde, à la minute, à l'heure, à la journée, à la semaine,
// au mois, au trimestre ; ça fait plusieurs profils, ça récupère plusieurs data. On s'entraîne d'abord, il enregistre toute la
// data du training ; à un moment donné, on passe en réel, parce que le but c'est qu'il rapporte. »
// Ici : l'ENTRAÎNEMENT. Aucun ordre réel, aucun compte de courtage, aucune clé : le passage au réel reste à Basile (son compte,
// sa décision, son activation), après des semaines de mesure.
//
// Chaque agent : 1 000 € fictifs, moitié bitcoin (BTCEUR), moitié ether (ETHEUR), cours de Binance en direct (flux public,
// sans clé), frais comptés (0,1 % de commission + 0,02 % d'écart de prix par opération). Règles écrites ici :
//   · seconde, minute, heure, jour : retour à la moyenne dans une tendance haussière (RSI à 2 bougies sous 10 et cours
//     au-dessus de sa moyenne des 200 bougies → achat ; revente dès que le cours repasse au-dessus de sa moyenne des 5) ;
//   · semaine, mois, trimestre : suivi de tendance (investi tant que le cours est au-dessus de sa moyenne des 20 semaines,
//     10 mois ou 4 trimestres ; sinon en liquidités).
// Gardé en base : chaque bougie (la seconde 14 jours, le reste toujours), chaque décision et opération, la valeur des
// portefeuilles. Le service tourne en continu (conteneur raime-trading) et redémarre seul quand ce fichier change.
import fs from 'node:fs';
import pg from 'pg';
import { moyenne, rsi } from './bourse.js';

export const CAPITAL = 1000;
export const SYMBOLES = ['BTCEUR', 'ETHEUR'];
export const FRAIS = 0.001 + 0.0002;
// échelle → intervalle Binance, règle, nom
export const ECHELLES = {
  seconde: { binance: '1s', regle: 'retour', libelle: 'à la seconde' },
  minute: { binance: '1m', regle: 'retour', libelle: 'à la minute' },
  heure: { binance: '1h', regle: 'retour', libelle: 'à l’heure' },
  jour: { binance: '1d', regle: 'retour', libelle: 'à la journée' },
  semaine: { binance: '1w', regle: 'tendance', n: 20, libelle: 'à la semaine' },
  mois: { binance: '1M', regle: 'tendance', n: 10, libelle: 'au mois' },
  trimestre: { binance: null, regle: 'tendance', n: 4, libelle: 'au trimestre' },   // fait des bougies mensuelles
};
const GARDER_SECONDES_JOURS = 14;

// ── Les règles (pures, testées au banc) ───────────────────────────────────────────────────────
// Rend 'acheter', 'vendre' ou null, d'après les cours de clôture (le dernier = la bougie qui vient de se fermer).
export function decision(regle, closes, investi, n = 20) {
  const i = closes.length - 1;
  if (i < 0) return null;
  if (regle === 'retour') {
    if (investi) { const m5 = moyenne(closes, i, 5); return m5 != null && closes[i] > m5 ? 'vendre' : null; }
    const r = rsi(closes, i, 2), m200 = moyenne(closes, i, 200);
    return r != null && r < 10 && m200 != null && closes[i] > m200 ? 'acheter' : null;
  }
  const m = moyenne(closes, i, n);
  if (m == null) return null;
  if (!investi && closes[i] > m) return 'acheter';
  if (investi && closes[i] < m) return 'vendre';
  return null;
}
// Une opération sur un portefeuille { liquidites, quantite } : tout acheter ou tout vendre, frais déduits.
export function executer(p, sens, prix) {
  if (sens === 'acheter' && p.liquidites > 1) {
    const montant = p.liquidites / (1 + FRAIS);
    return { p: { liquidites: 0, quantite: p.quantite + montant / prix }, op: { sens, prix, montant, frais: montant * FRAIS } };
  }
  if (sens === 'vendre' && p.quantite > 0) {
    const montant = p.quantite * prix;
    return { p: { liquidites: p.liquidites + montant * (1 - FRAIS), quantite: 0 }, op: { sens, prix, montant, frais: montant * FRAIS } };
  }
  return { p, op: null };
}
// Les trimestres, faits des bougies mensuelles : la clôture de mars, juin, septembre, décembre.
export function trimestres(mensuelles) {
  return mensuelles.filter((b) => [2, 5, 8, 11].includes(new Date(b.debut).getUTCMonth()));
}
// Une bougie du flux Binance → { symbole, echelle, debut, o, h, l, c, v, fermee }
export function lireBougie(msg) {
  const k = msg && msg.data && msg.data.k;
  if (!k) return null;
  const echelle = Object.keys(ECHELLES).find((e) => ECHELLES[e].binance === k.i);
  return echelle ? { symbole: k.s, echelle, debut: new Date(k.t).toISOString(), o: +k.o, h: +k.h, l: +k.l, c: +k.c, v: +k.v, fermee: !!k.x } : null;
}

// ── La base ───────────────────────────────────────────────────────────────────────────────────
export async function preparer(brain) {
  await brain.query(`CREATE TABLE IF NOT EXISTS trading_bougies (symbole text NOT NULL, echelle text NOT NULL, debut timestamptz NOT NULL,
    o numeric, h numeric, l numeric, c numeric NOT NULL, v numeric, PRIMARY KEY (symbole, echelle, debut))`);
  await brain.query(`CREATE TABLE IF NOT EXISTS trading_portefeuilles (agent text NOT NULL, symbole text NOT NULL, liquidites numeric NOT NULL,
    quantite numeric NOT NULL, depuis timestamptz NOT NULL DEFAULT now(), maj_le timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (agent, symbole))`);
  await brain.query(`CREATE TABLE IF NOT EXISTS trading_operations (id bigserial PRIMARY KEY, agent text NOT NULL, symbole text NOT NULL,
    le timestamptz NOT NULL DEFAULT now(), sens text NOT NULL, prix numeric NOT NULL, montant numeric NOT NULL, frais numeric NOT NULL)`);
  await brain.query(`CREATE TABLE IF NOT EXISTS trading_valeurs (agent text NOT NULL, le timestamptz NOT NULL, valeur numeric NOT NULL,
    PRIMARY KEY (agent, le))`);
  for (const a of Object.keys(ECHELLES)) for (const s of SYMBOLES) {
    await brain.query(`INSERT INTO trading_portefeuilles (agent, symbole, liquidites, quantite) VALUES ($1, $2, $3, 0) ON CONFLICT DO NOTHING`, [a, s, CAPITAL / SYMBOLES.length]);
  }
}

// L'historique d'une échelle (pour les moyennes dès le premier jour), lu une fois au démarrage par l'API publique.
async function historique(f, symbole, intervalle, limite = 1000) {
  const r = await f(`https://api.binance.com/api/v3/klines?symbol=${symbole}&interval=${intervalle}&limit=${limite}`, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`historique ${symbole} ${intervalle} : ${r.status}`);
  return (await r.json()).map((k) => ({ debut: new Date(k[0]).toISOString(), o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] }));
}

// ── Le service ────────────────────────────────────────────────────────────────────────────────
export async function service({ brain, f = globalThis.fetch, journal = (t) => console.log(`[trading] ${new Date().toISOString()} ${t}`) } = {}) {
  await preparer(brain);
  const series = {};                                // `${symbole}:${echelle}` → closes (1 000 au plus)
  const portefeuilles = {};                         // `${agent}:${symbole}` → { liquidites, quantite }
  for (const r of (await brain.query('SELECT agent, symbole, liquidites::float AS liquidites, quantite::float AS quantite FROM trading_portefeuilles')).rows) {
    portefeuilles[`${r.agent}:${r.symbole}`] = { liquidites: r.liquidites, quantite: r.quantite };
  }
  let mensuelles = {};
  for (const s of SYMBOLES) for (const [e, d] of Object.entries(ECHELLES)) {
    if (!d.binance) continue;
    try {
      const h = await historique(f, s, d.binance);
      const fermees = h.slice(0, -1);              // la dernière bougie n'est pas encore fermée
      series[`${s}:${e}`] = fermees.map((b) => b.c);
      if (e === 'mois') mensuelles[s] = fermees;
      if (e !== 'seconde') await garder(brain, s, e, fermees.slice(-300));
    } catch (err) { journal(`historique ${s} ${e} illisible : ${err.message}`); series[`${s}:${e}`] = []; }
  }
  for (const s of SYMBOLES) series[`${s}:trimestre`] = trimestres(mensuelles[s] || []).map((b) => b.c);
  journal(`démarré : ${Object.keys(ECHELLES).length} agents × ${SYMBOLES.length} actifs, historique chargé`);

  const pas = async (agent, symbole, prix, le) => {
    const cle = `${agent}:${symbole}`, p = portefeuilles[cle];
    const d = decision(ECHELLES[agent].regle, series[`${symbole}:${agent}`], p.quantite > 0, ECHELLES[agent].n);
    if (!d) return;
    const { p: q, op } = executer(p, d, prix);
    if (!op) return;
    portefeuilles[cle] = q;
    await brain.query('UPDATE trading_portefeuilles SET liquidites = $3, quantite = $4, maj_le = now() WHERE agent = $1 AND symbole = $2', [agent, symbole, q.liquidites, q.quantite]);
    await brain.query('INSERT INTO trading_operations (agent, symbole, le, sens, prix, montant, frais) VALUES ($1,$2,$3,$4,$5,$6,$7)', [agent, symbole, le, op.sens, prix, op.montant, op.frais]);
  };
  const dernierPrix = {};
  const valoriser = async (agent, le) => {
    const v = SYMBOLES.reduce((t, s) => { const p = portefeuilles[`${agent}:${s}`]; return t + p.liquidites + p.quantite * (dernierPrix[s] || 0); }, 0);
    if (SYMBOLES.every((s) => dernierPrix[s])) await brain.query('INSERT INTO trading_valeurs (agent, le, valeur) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [agent, le, v]);
  };

  const recevoir = async (b) => {
    if (!b || !b.fermee) return;
    dernierPrix[b.symbole] = b.c;
    const k = `${b.symbole}:${b.echelle}`;
    (series[k] = series[k] || []).push(b.c);
    if (series[k].length > 1000) series[k].shift();
    await garder(brain, b.symbole, b.echelle, [b]);
    await pas(b.echelle, b.symbole, b.c, b.debut);
    if (b.echelle === 'mois' && [2, 5, 8, 11].includes(new Date(b.debut).getUTCMonth())) {
      series[`${b.symbole}:trimestre`].push(b.c);
      await pas('trimestre', b.symbole, b.c, b.debut);
    }
    // la valeur : chaque minute pour les agents rapides, à chaque bougie pour les autres
    if (b.echelle === 'minute') for (const a of ['seconde', 'minute']) await valoriser(a, b.debut);
    else if (b.echelle !== 'seconde') await valoriser(b.echelle, b.debut);
  };

  // Le flux public de Binance (bougies 1s à 1M), reconnecté seul ; la seconde est purgée au-delà de 14 jours.
  const flux = SYMBOLES.flatMap((s) => Object.values(ECHELLES).filter((d) => d.binance).map((d) => `${s.toLowerCase()}@kline_${d.binance}`)).join('/');
  let attente = 1000;
  const ouvrir = () => {
    const ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${flux}`);
    let file = Promise.resolve();
    ws.onopen = () => { attente = 1000; journal('flux ouvert'); };
    ws.onmessage = (m) => { let b = null; try { b = lireBougie(JSON.parse(m.data)); } catch { /* message illisible */ } file = file.then(() => recevoir(b)).catch((e) => journal(`erreur : ${e.message}`)); };
    ws.onclose = () => { journal(`flux fermé, reprise dans ${attente / 1000} s`); setTimeout(ouvrir, attente); attente = Math.min(60000, attente * 2); };
    ws.onerror = () => {};
  };
  ouvrir();
  setInterval(() => { brain.query(`DELETE FROM trading_bougies WHERE echelle = 'seconde' AND debut < now() - interval '${GARDER_SECONDES_JOURS} days'`).catch(() => {}); }, 3600e3);
}

async function garder(brain, symbole, echelle, bougies) {
  for (const b of bougies) {
    await brain.query(`INSERT INTO trading_bougies (symbole, echelle, debut, o, h, l, c, v) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
      [symbole, echelle, b.debut, b.o, b.h, b.l, b.c, b.v]);
  }
}

// Pour Jarvis, le Directeur et l'e-mail : chaque agent, sa valeur, son résultat, ses opérations.
export async function resume(brain) {
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

// CLI : node agents/trading.js service   (le service continu ; il s'arrête quand ce fichier change, et le conteneur le relance)
if (import.meta.url === `file://${process.argv[1]}`) {
  const { db } = await import('./lib.js');
  const brain = db(); await brain.connect();
  if (process.argv[2] === 'service') {
    const moi = new URL(import.meta.url).pathname, depart = fs.statSync(moi).mtimeMs;
    setInterval(() => { try { if (fs.statSync(moi).mtimeMs !== depart) { console.log('[trading] code changé : redémarrage'); process.exit(0); } } catch { /* fichier en cours d'écriture */ } }, 60e3);
    await service({ brain });
  } else {
    for (const r of await resume(brain)) console.log(r.agent.padEnd(10), r.valeur == null ? '—' : `${r.valeur} € (${r.perf} %), ${r.operations} opérations, ${r.frais} € de frais`);
    await brain.end();
  }
}
