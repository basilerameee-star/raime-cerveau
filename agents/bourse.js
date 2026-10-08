// L'AGENT BOURSE (08/10/2026, feuille de route point 55) — trois portefeuilles SIMULÉS, tenus chaque jour.
//
// Basile, 08/10/2026 : tous les univers (ETF mondiaux, grandes actions US, Europe et Suisse, cryptomonnaies), plusieurs
// stratégies en parallèle, 1 000 € fictifs chacune. RIEN n'est acheté ni vendu : aucun courtier, aucun ordre, aucune
// recommandation de placement (Constitution, limite 2). Le compte, l'argent et une éventuelle activation réelle restent à
// Basile, après des semaines de mesure.
//
// Règles écrites ici, appliquées par le code (aucun modèle) :
//   · long terme  : 40 % Monde, 15 % S&P 500, 15 % Europe, 10 % Suisse, 10 % émergents, 7 % bitcoin, 3 % ether ;
//                   rééquilibré le premier jour de bourse du mois quand une ligne s'écarte de plus de 5 points ;
//   · tendance    : chaque lundi, à parts égales, les actifs (ETF et cryptos) au-dessus de leur moyenne des 200 jours ;
//                   les autres en liquidités ;
//   · momentum    : le premier jour de bourse du mois, les 5 grandes actions (US, Europe, Suisse) qui ont le plus monté
//                   sur six mois, à parts égales, si leur hausse est positive ; sinon des liquidités ;
//   · indice      : 100 % Monde acheté le premier jour, jamais touché : la référence.
// Frais : 0,1 % par opération (ETF, actions), 0,2 % (crypto), plus 0,25 % de change pour un titre hors euro. Fractions
// d'actions permises (comme chez certains courtiers en ligne). Les ETF sont des UCITS cotés en Europe : un particulier
// résidant en France ne peut pas acheter les ETF américains (règlement PRIIPs).
// Deux lectures : la simulation « réelle » depuis son premier jour, et un rétro-test sur les 12 mois passés (il dit ce
// que ces règles auraient donné, il ne prédit rien). Tout est recalculé à chaque passage, depuis les cours : reproductible.
import pg from 'pg';

export const CAPITAL = 1000;
const UA = { 'User-Agent': 'raime-cerveau/1.0 (+https://raime.fr; contact@raime.fr)', Accept: 'application/json' };
// symbole → { nom, classe, devise, source }
export const UNIVERS = {
  'EUNL.DE': { nom: 'iShares Core MSCI World', classe: 'etf', devise: 'EUR' },
  'SXR8.DE': { nom: 'iShares Core S&P 500', classe: 'etf', devise: 'EUR' },
  'EXSA.DE': { nom: 'iShares STOXX Europe 600', classe: 'etf', devise: 'EUR' },
  'CSSMI.SW': { nom: 'iShares SMI (Suisse)', classe: 'etf', devise: 'CHF' },
  'IS3N.DE': { nom: 'iShares Core MSCI EM IMI', classe: 'etf', devise: 'EUR' },
  AAPL: { nom: 'Apple', classe: 'action', devise: 'USD' }, MSFT: { nom: 'Microsoft', classe: 'action', devise: 'USD' },
  NVDA: { nom: 'NVIDIA', classe: 'action', devise: 'USD' }, AMZN: { nom: 'Amazon', classe: 'action', devise: 'USD' },
  GOOGL: { nom: 'Alphabet', classe: 'action', devise: 'USD' }, META: { nom: 'Meta', classe: 'action', devise: 'USD' },
  JPM: { nom: 'JPMorgan', classe: 'action', devise: 'USD' }, 'BRK-B': { nom: 'Berkshire Hathaway', classe: 'action', devise: 'USD' },
  LLY: { nom: 'Eli Lilly', classe: 'action', devise: 'USD' }, AVGO: { nom: 'Broadcom', classe: 'action', devise: 'USD' },
  'NESN.SW': { nom: 'Nestlé', classe: 'action', devise: 'CHF' }, 'NOVN.SW': { nom: 'Novartis', classe: 'action', devise: 'CHF' },
  'UBSG.SW': { nom: 'UBS', classe: 'action', devise: 'CHF' }, 'ZURN.SW': { nom: 'Zurich Insurance', classe: 'action', devise: 'CHF' },
  'ASML.AS': { nom: 'ASML', classe: 'action', devise: 'EUR' }, 'MC.PA': { nom: 'LVMH', classe: 'action', devise: 'EUR' },
  'SAP.DE': { nom: 'SAP', classe: 'action', devise: 'EUR' }, 'TTE.PA': { nom: 'TotalEnergies', classe: 'action', devise: 'EUR' },
  'SIE.DE': { nom: 'Siemens', classe: 'action', devise: 'EUR' }, 'OR.PA': { nom: "L'Oréal", classe: 'action', devise: 'EUR' },
  'AIR.PA': { nom: 'Airbus', classe: 'action', devise: 'EUR' },
  BTC: { nom: 'Bitcoin', classe: 'crypto', devise: 'EUR', binance: 'BTCEUR' },
  ETH: { nom: 'Ether', classe: 'crypto', devise: 'EUR', binance: 'ETHEUR' },
};
const ETF = Object.keys(UNIVERS).filter((s) => UNIVERS[s].classe === 'etf');
const ACTIONS = Object.keys(UNIVERS).filter((s) => UNIVERS[s].classe === 'action');
const CRYPTOS = Object.keys(UNIVERS).filter((s) => UNIVERS[s].classe === 'crypto');
export const REFERENCE = 'EUNL.DE';

export const STRATEGIES = {
  long_terme: { libelle: 'Long terme diversifié', regles: '40 % Monde, 15 % S&P 500, 15 % Europe, 10 % Suisse, 10 % émergents, 7 % bitcoin, 3 % ether ; rééquilibré le 1er jour de bourse du mois si une ligne s’écarte de plus de 5 points.' },
  tendance: { libelle: 'Tendance (moyenne 200 jours)', regles: 'Chaque lundi, à parts égales, les ETF et cryptos au-dessus de leur moyenne des 200 jours ; le reste en liquidités.' },
  momentum: { libelle: 'Momentum grandes actions', regles: 'Le 1er jour de bourse du mois, les 5 grandes actions (US, Europe, Suisse) les plus en hausse sur 6 mois, à parts égales, si la hausse est positive ; sinon des liquidités.' },
  // 08/10/2026 (point 56) : le trading, simulé sur le même moteur, avec la même règle (aucun ordre réel)
  court_terme: { libelle: 'Court terme (trading)', regles: 'Chaque jour : achète à parts égales les actifs (S&P 500, Monde, bitcoin, ether) dont le RSI à 2 jours est sous 10 et qui restent au-dessus de leur moyenne des 200 jours ; revend dès que le cours repasse au-dessus de sa moyenne des 5 jours.' },
  indice: { libelle: 'Indice de référence (Monde)', regles: '100 % iShares Core MSCI World acheté le premier jour, jamais touché.' },
};
const CIBLES_LONG = { 'EUNL.DE': 0.40, 'SXR8.DE': 0.15, 'EXSA.DE': 0.15, 'CSSMI.SW': 0.10, 'IS3N.DE': 0.10, BTC: 0.07, ETH: 0.03 };

// ── Les calculs (purs, testés au banc) ────────────────────────────────────────────────────────
export const frais = (symbole) => {
  const u = UNIVERS[symbole] || {};
  return (u.classe === 'crypto' ? 0.002 : 0.001) + (u.devise && u.devise !== 'EUR' ? 0.0025 : 0);
};
export function moyenne(serie, i, n) {          // moyenne des n derniers cours connus jusqu'au jour i inclus
  if (i + 1 < n) return null;
  let s = 0;
  for (let k = i - n + 1; k <= i; k++) { if (serie[k] == null) return null; s += serie[k]; }
  return s / n;
}
// Le RSI sur n jours (0 à 100) : la part des hausses dans les variations des n derniers jours ; sous 10, une baisse rare.
export function rsi(serie, i, n = 2) {
  if (i < n) return null;
  let gains = 0, pertes = 0;
  for (let k = i - n + 1; k <= i; k++) {
    if (serie[k] == null || serie[k - 1] == null) return null;
    const d = serie[k] - serie[k - 1];
    if (d > 0) gains += d; else pertes -= d;
  }
  if (!pertes) return 100;
  return 100 - 100 / (1 + gains / pertes);
}
const COURT_TERME = ['SXR8.DE', 'EUNL.DE', 'BTC', 'ETH'];
export function hausse(serie, i, n) {           // la hausse sur n jours, en fraction (0,12 = +12 %)
  if (i < n || serie[i] == null || serie[i - n] == null || serie[i - n] <= 0) return null;
  return serie[i] / serie[i - n] - 1;
}
// Les poids visés par une stratégie le jour i, ou null s'il ne faut pas toucher au portefeuille ce jour-là.
export function cibles(strategie, { jours, prix, i, poidsActuels, premier }) {
  const d = new Date(jours[i] + 'T12:00:00Z');
  const debutMois = premier || jours[i].slice(0, 7) !== jours[i - 1].slice(0, 7);
  const lundi = premier || d.getUTCDay() === 1 || (jours[i - 1] && (new Date(jours[i - 1] + 'T12:00:00Z').getUTCDay() >= d.getUTCDay()));
  if (strategie === 'indice') return premier ? { [REFERENCE]: 1 } : null;
  if (strategie === 'long_terme') {
    if (!debutMois) return null;
    const ecart = Object.keys(CIBLES_LONG).some((s) => Math.abs((poidsActuels[s] || 0) - CIBLES_LONG[s]) > 0.05);
    return premier || ecart ? { ...CIBLES_LONG } : null;
  }
  if (strategie === 'tendance') {
    if (!lundi) return null;
    const choisis = [...ETF, ...CRYPTOS].filter((s) => { const m = moyenne(prix[s], i, 200); return m != null && prix[s][i] > m; });
    return Object.fromEntries(choisis.map((s) => [s, 1 / choisis.length]));
  }
  if (strategie === 'court_terme') {
    // garde ce qui n'a pas encore rebondi au-dessus de sa moyenne des 5 jours ; entre sur une forte baisse dans une tendance haussière
    const garde = COURT_TERME.filter((s) => (poidsActuels[s] || 0) > 0 && prix[s][i] != null && !(prix[s][i] > (moyenne(prix[s], i, 5) ?? Infinity)));
    const entre = COURT_TERME.filter((s) => !garde.includes(s) && !((poidsActuels[s] || 0) > 0)).filter((s) => {
      const r = rsi(prix[s], i, 2), m200 = moyenne(prix[s], i, 200);
      return r != null && r < 10 && m200 != null && prix[s][i] > m200;
    });
    const tous = [...garde, ...entre];
    return Object.fromEntries(tous.map((s) => [s, 1 / tous.length]));
  }
  if (strategie === 'momentum') {
    if (!debutMois) return null;
    const classes = ACTIONS.map((s) => [s, hausse(prix[s], i, 126)]).filter(([, h]) => h != null && h > 0).sort((a, b) => b[1] - a[1]).slice(0, 5);
    return Object.fromEntries(classes.map(([s]) => [s, 1 / classes.length]));
  }
  return null;
}

// Une simulation, jour après jour : rend les valeurs quotidiennes et les opérations (frais compris).
export function simuler(strategie, { jours, prix }, debut, capital = CAPITAL) {
  let liquidites = capital;
  const quantites = {}, valeurs = [], operations = [];
  const i0 = jours.findIndex((j) => j >= debut);
  if (i0 < 0) return { valeurs, operations };
  for (let i = i0; i < jours.length; i++) {
    const valeurTitres = (s) => (quantites[s] || 0) * (prix[s][i] ?? 0);
    const total = liquidites + Object.keys(quantites).reduce((t, s) => t + valeurTitres(s), 0);
    const poidsActuels = Object.fromEntries(Object.keys(quantites).map((s) => [s, total ? valeurTitres(s) / total : 0]));
    const c = cibles(strategie, { jours, prix, i, poidsActuels, premier: i === i0 });
    if (c) {
      // ventes d'abord (libèrent des liquidités), puis achats ; un titre sans cours ce jour-là n'est pas échangé
      const vise = (s) => (c[s] || 0) * total;
      const ordres = [...new Set([...Object.keys(quantites), ...Object.keys(c)])].filter((s) => prix[s][i] != null)
        .map((s) => ({ s, delta: vise(s) - valeurTitres(s) })).filter((o) => Math.abs(o.delta) >= Math.max(5, total * 0.005))
        .sort((a, b) => a.delta - b.delta);
      for (const o of ordres) {
        const f = frais(o.s);
        if (o.delta < 0) {
          const montant = -o.delta;
          quantites[o.s] = (quantites[o.s] || 0) - montant / prix[o.s][i];
          if (quantites[o.s] < 1e-9) delete quantites[o.s];
          liquidites += montant * (1 - f);
          operations.push({ jour: jours[i], symbole: o.s, sens: 'vente', montant: arrondi(montant), frais: arrondi(montant * f) });
        } else {
          const montant = Math.min(o.delta, liquidites / (1 + f));
          if (montant < 5) continue;
          quantites[o.s] = (quantites[o.s] || 0) + montant / prix[o.s][i];
          liquidites -= montant * (1 + f);
          operations.push({ jour: jours[i], symbole: o.s, sens: 'achat', montant: arrondi(montant), frais: arrondi(montant * f) });
        }
      }
    }
    const fin = liquidites + Object.keys(quantites).reduce((t, s) => t + (quantites[s] || 0) * (prix[s][i] ?? 0), 0);
    valeurs.push({ jour: jours[i], valeur: arrondi(fin), liquidites: arrondi(liquidites), positions: Object.fromEntries(Object.entries(quantites).map(([s, q]) => [s, arrondi(q * (prix[s][i] ?? 0))])) });
  }
  return { valeurs, operations };
}
const arrondi = (x) => Math.round(x * 100) / 100;

// La plus forte baisse depuis un sommet (en fraction négative), sur des valeurs quotidiennes.
export function pireBaisse(valeurs) {
  let haut = -Infinity, pire = 0;
  for (const v of valeurs) { haut = Math.max(haut, v.valeur); pire = Math.min(pire, v.valeur / haut - 1); }
  return pire;
}

// Le calendrier : les jours de bourse de la référence ; chaque cours manquant (jour férié d'une place) reprend le dernier connu.
export function aligner(series, reference = REFERENCE) {
  const jours = (series[reference] || []).map((x) => x.jour);
  const prix = {};
  for (const [s, l] of Object.entries(series)) {
    const m = new Map(l.map((x) => [x.jour, x.eur]));
    let dernier = null;
    const tous = [...new Set([...m.keys(), ...jours])].sort();
    const parJour = new Map();
    for (const j of tous) { if (m.has(j)) dernier = m.get(j); parJour.set(j, dernier); }
    prix[s] = jours.map((j) => parJour.get(j) ?? null);
  }
  return { jours, prix };
}

// ── Les cours ─────────────────────────────────────────────────────────────────────────────────
async function json(f, url) {
  const r = await f(url, { headers: UA, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`${url.split('?')[0]} : ${r.status}`);
  return r.json();
}
// Le taux de change BCE (devise pour 1 euro), par jour.
export async function changes(f, devise) {
  const r = await f(`https://data-api.ecb.europa.eu/service/data/EXR/D.${devise}.EUR.SP00.A?startPeriod=${new Date(Date.now() - 800 * 86400e3).toISOString().slice(0, 10)}&format=csvdata`,
    { headers: { ...UA, Accept: 'text/csv' }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`BCE ${devise} : ${r.status}`);
  const lignes = (await r.text()).trim().split('\n');
  const tete = lignes.shift().split(',');
  const ij = tete.indexOf('TIME_PERIOD'), iv = tete.indexOf('OBS_VALUE');
  return new Map(lignes.map((l) => l.split(',')).filter((c) => c[iv]).map((c) => [c[ij], Number(c[iv])]));
}
export async function cours(f, symbole, taux) {
  const u = UNIVERS[symbole];
  if (u.binance) {
    const d = await json(f, `https://api.binance.com/api/v3/klines?symbol=${u.binance}&interval=1d&limit=800`);
    return d.map((k) => ({ jour: new Date(k[0]).toISOString().slice(0, 10), prix: Number(k[4]), eur: Number(k[4]) }));
  }
  const d = await json(f, `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbole)}?range=2y&interval=1d`);
  const r = d && d.chart && d.chart.result && d.chart.result[0];
  if (!r) throw new Error(`${symbole} : aucune donnée`);
  const ts = r.timestamp || [], cl = (r.indicators.quote[0] || {}).close || [];
  const out = [];
  let dernierTaux = null;
  const t = taux && [...taux.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  let k = 0;
  for (let i = 0; i < ts.length; i++) {
    if (cl[i] == null) continue;
    const jour = new Date(ts[i] * 1000).toISOString().slice(0, 10);
    if (t) { while (k < t.length && t[k][0] <= jour) { dernierTaux = t[k][1]; k++; } if (!dernierTaux) continue; }
    out.push({ jour, prix: cl[i], eur: t ? cl[i] / dernierTaux : cl[i] });
  }
  return out;
}

export async function preparer(brain) {
  await brain.query(`CREATE TABLE IF NOT EXISTS bourse_cours (symbole text NOT NULL, jour date NOT NULL, prix numeric NOT NULL, eur numeric NOT NULL,
    PRIMARY KEY (symbole, jour))`);
  await brain.query(`CREATE TABLE IF NOT EXISTS bourse_strategies (nom text PRIMARY KEY, libelle text NOT NULL, regles text NOT NULL,
    debut date NOT NULL, capital numeric NOT NULL)`);
  await brain.query(`CREATE TABLE IF NOT EXISTS bourse_valeurs (strategie text NOT NULL, mode text NOT NULL, jour date NOT NULL,
    valeur numeric NOT NULL, liquidites numeric NOT NULL, positions jsonb, PRIMARY KEY (strategie, mode, jour))`);
  await brain.query(`CREATE TABLE IF NOT EXISTS bourse_operations (id serial PRIMARY KEY, strategie text NOT NULL, mode text NOT NULL,
    jour date NOT NULL, symbole text NOT NULL, sens text NOT NULL, montant numeric NOT NULL, frais numeric NOT NULL)`);
}

// Un passage : les cours du jour, puis les quatre stratégies recalculées (simulation réelle et rétro-test 12 mois).
export async function passer({ brain, fetch: f = globalThis.fetch, aujourdhui = new Date().toISOString().slice(0, 10) } = {}) {
  await preparer(brain);
  const taux = {};
  for (const dev of ['USD', 'CHF']) taux[dev] = await changes(f, dev);
  const manquants = [];
  for (const s of Object.keys(UNIVERS)) {
    try {
      const l = await cours(f, s, UNIVERS[s].devise === 'EUR' ? null : taux[UNIVERS[s].devise]);
      for (let i = 0; i < l.length; i += 300) {
        const lot = l.slice(i, i + 300);
        await brain.query(`INSERT INTO bourse_cours (symbole, jour, prix, eur) SELECT $1, x.j::date, x.p, x.e FROM unnest($2::text[], $3::numeric[], $4::numeric[]) AS x(j, p, e)
          ON CONFLICT (symbole, jour) DO UPDATE SET prix = EXCLUDED.prix, eur = EXCLUDED.eur`, [s, lot.map((x) => x.jour), lot.map((x) => x.prix), lot.map((x) => x.eur)]);
      }
    } catch (e) { manquants.push(`${s} (${String(e.message).slice(0, 60)})`); }
    await new Promise((r) => setTimeout(r, 400));   // une demande à la fois, espacées
  }
  const { rows } = await brain.query(`SELECT symbole, to_char(jour, 'YYYY-MM-DD') AS jour, eur::float AS eur FROM bourse_cours ORDER BY symbole, jour`);
  const series = {};
  for (const r of rows) (series[r.symbole] = series[r.symbole] || []).push({ jour: r.jour, eur: r.eur });
  for (const s of Object.keys(UNIVERS)) if (!series[s]) series[s] = [];
  const donnees = aligner(series);
  // le premier jour de la simulation réelle : celui du premier passage, gardé
  for (const [nom, st] of Object.entries(STRATEGIES)) {
    await brain.query(`INSERT INTO bourse_strategies (nom, libelle, regles, debut, capital) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (nom) DO UPDATE SET libelle = EXCLUDED.libelle, regles = EXCLUDED.regles`, [nom, st.libelle, st.regles, aujourdhui, CAPITAL]);
  }
  const debuts = Object.fromEntries((await brain.query(`SELECT nom, to_char(debut, 'YYYY-MM-DD') AS debut FROM bourse_strategies`)).rows.map((r) => [r.nom, r.debut]));
  const retro = new Date(Date.parse(aujourdhui) - 365 * 86400e3).toISOString().slice(0, 10);
  const bilan = {};
  for (const nom of Object.keys(STRATEGIES)) {
    for (const [mode, debut] of [['reel', debuts[nom]], ['retro', retro]]) {
      const { valeurs, operations } = simuler(nom, donnees, debut);
      await brain.query('DELETE FROM bourse_valeurs WHERE strategie = $1 AND mode = $2', [nom, mode]);
      await brain.query('DELETE FROM bourse_operations WHERE strategie = $1 AND mode = $2', [nom, mode]);
      for (const v of valeurs) await brain.query(`INSERT INTO bourse_valeurs (strategie, mode, jour, valeur, liquidites, positions) VALUES ($1,$2,$3,$4,$5,$6)`,
        [nom, mode, v.jour, v.valeur, v.liquidites, JSON.stringify(v.positions)]);
      for (const o of operations) await brain.query(`INSERT INTO bourse_operations (strategie, mode, jour, symbole, sens, montant, frais) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [nom, mode, o.jour, o.symbole, o.sens, o.montant, o.frais]);
      const der = valeurs[valeurs.length - 1];
      bilan[`${nom}:${mode}`] = der ? { valeur: der.valeur, perf: arrondi((der.valeur / CAPITAL - 1) * 100), pire_baisse: arrondi(pireBaisse(valeurs) * 100), operations: operations.length, depuis: debut } : null;
    }
  }
  await brain.query('INSERT INTO journal(acteur, changement, motif) VALUES ($1, $2, $3)', ['bourse',
    `Bourse (simulation, 1 000 € fictifs par stratégie) : ` + Object.keys(STRATEGIES).map((n) => `${STRATEGIES[n].libelle} ${bilan[`${n}:retro`] ? `${bilan[`${n}:retro`].perf} % sur 12 mois (rétro-test)` : '—'}`).join(' ; '),
    manquants.length ? `Cours manquants : ${manquants.join(', ')}` : 'Tous les cours lus (Yahoo, Binance, BCE). Aucun ordre réel : simulation.']).catch(() => {});
  return { bilan, manquants };
}

// Pour Jarvis et l'e-mail : les quatre stratégies, simulation réelle et rétro-test, en une ligne chacune.
export async function resume(brain) {
  const { rows } = await brain.query(`SELECT s.nom, s.libelle, s.regles, to_char(s.debut, 'YYYY-MM-DD') AS debut, v.mode, v.valeur::float AS valeur,
      to_char(v.jour, 'YYYY-MM-DD') AS jour,
      (SELECT min(x.valeur / x.haut) FROM (SELECT valeur, max(valeur) OVER (ORDER BY jour) AS haut FROM bourse_valeurs
        WHERE strategie = s.nom AND mode = v.mode) x)::float - 1 AS pire
    FROM bourse_strategies s JOIN LATERAL (SELECT DISTINCT ON (mode) mode, valeur, jour FROM bourse_valeurs WHERE strategie = s.nom ORDER BY mode, jour DESC) v ON true
    ORDER BY s.nom, v.mode`);
  return rows.map((r) => ({ ...r, perf: Math.round((r.valeur / CAPITAL - 1) * 1000) / 10, pire: Math.round(r.pire * 1000) / 10 }));
}

// CLI : node agents/bourse.js   (un passage, écrit en base, affiché)
if (import.meta.url === `file://${process.argv[1]}`) {
  const { db } = await import('./lib.js');
  const brain = db(); await brain.connect();
  try {
    const r = await passer({ brain });
    for (const [k, v] of Object.entries(r.bilan)) console.log(k.padEnd(22), v ? `${v.valeur} € (${v.perf} %, pire baisse ${v.pire_baisse} %, ${v.operations} opérations, depuis ${v.depuis})` : '—');
    if (r.manquants.length) console.log('manquants :', r.manquants.join(', '));
  } finally { await brain.end(); }
}
