// L'ÉCONOME — le cerveau règle lui-même sa dépense pour ne jamais finir le mois au-dessus du
// plafond (voulu par Basile le 25/09/2026 : « que le cerveau adapte la consommation et le
// rythme des requêtes, pour qu'il n'y ait pas de surdépense à la fin du mois »).
//
// Toutes les 30 minutes, il compare le rythme réel (7 derniers jours) à ce qui reste permis
// jusqu'à la fin du mois, et aux crédits de modèles encore disponibles. Il choisit un régime :
//   normal  : rien ne change ;
//   econome : les agents payants passent deux fois moins souvent, Cortex prend un modèle léger ;
//   reserve : quatre fois moins souvent, les agents payants non essentiels attendent le 1er ;
//   arret   : plus aucun appel payant ; les agents gratuits continuent.
// Le code décide, pas un modèle : l'économe ne dépense rien.
export const PLAFOND_EUR = 16; // Constitution, principe 5 : le prix du serveur

// Les agents de la boucle qui appellent un modèle payant (relevé du 25/09/2026).
export const PAYANTS = new Set(['heraut', 'superviseur', 'architecte', 'reflexif', 'chasseur', 'metrologue', 'prospective', 'publiciste', 'penseur']);
// Ceux qu'on ralentit sans jamais les arrêter avant l'arrêt complet : la surveillance et le cap.
export const ESSENTIELS = new Set(['superviseur', 'architecte']);

const euros = (n) => n.toFixed(2).replace('.', ',') + ' €';

// Le cœur, pur et testé : des chiffres en entrée, un régime et des phrases claires en sortie.
// rythmeCreditsEur : la baisse réelle des crédits du COMPTE (Clio et les autres clés comprises) ;
// à défaut, le rythme du cerveau seul.
export function regime({ plafondEur = PLAFOND_EUR, depenseMoisEur, rythmeJourEur, creditsRestantsEur = null, joursRestants, rythmeCreditsEur = null }) {
  const reste = plafondEur - depenseMoisEur;
  const jours = Math.max(joursRestants, 0.5);
  const permis = Math.max(reste, 0) / jours;
  const ratio = permis > 0 ? rythmeJourEur / permis : Infinity;
  const rc = Math.max(rythmeJourEur, rythmeCreditsEur || 0);
  const joursCredits = creditsRestantsEur == null ? null : (rc > 0 ? creditsRestantsEur / rc : Infinity);
  const finMois = depenseMoisEur + rythmeJourEur * joursRestants;
  const chiffres = { plafond_eur: plafondEur, depense_mois_eur: +depenseMoisEur.toFixed(2), reste_eur: +reste.toFixed(2),
    rythme_jour_eur: +rythmeJourEur.toFixed(3), permis_jour_eur: +permis.toFixed(3), fin_mois_eur: +finMois.toFixed(2),
    jours_credits: joursCredits == null || !isFinite(joursCredits) ? null : Math.floor(joursCredits) };
  const payants = [...PAYANTS];

  let mode = 'normal', facteur = 1, pauses = [], raison;
  if (reste <= 0 || (creditsRestantsEur != null && creditsRestantsEur <= 0.2)) {
    mode = 'arret'; facteur = Infinity; pauses = payants;
    raison = reste <= 0 ? `plafond du mois atteint (${euros(depenseMoisEur)} sur ${plafondEur} €)` : 'crédits de modèles épuisés';
  } else if (reste < 0.1 * plafondEur || ratio > 1.5) {
    mode = 'reserve'; facteur = 4; pauses = payants.filter((a) => !ESSENTIELS.has(a));
    raison = reste < 0.1 * plafondEur ? `moins de 10 % du plafond restent (${euros(reste)})` : `au rythme actuel, le mois finirait à ${euros(finMois)}, au-dessus des ${plafondEur} €`;
  } else if (ratio > 1 || (joursCredits != null && joursCredits < 7)) {
    mode = 'econome'; facteur = 2;
    raison = ratio > 1 ? `au rythme actuel, le mois finirait à ${euros(finMois)}, juste au-dessus des ${plafondEur} €`
      : `les crédits de modèles ne tiennent plus que ${Math.floor(joursCredits)} jours`;
  } else {
    raison = `au rythme des 7 derniers jours (${euros(rythmeJourEur)} par jour), le mois finit à ${euros(finMois)} sur ${plafondEur} €`;
  }

  const mesures = {
    normal: [`Rythme normal : ${raison}.`],
    econome: [`Rythme économe : ${raison}.`, 'Les agents payants passent deux fois moins souvent.', 'Cortex répond avec un modèle léger, environ trente fois moins cher.'],
    reserve: [`Réserve : ${raison}.`, 'Seules la surveillance et l’architecte tournent, quatre fois moins souvent ; les autres agents payants attendent le 1er du mois.', 'Cortex répond avec un modèle léger.'],
    arret: [`Arrêt des dépenses : ${raison}.`, 'Plus aucun appel payant jusqu’au 1er du mois ou jusqu’à une recharge ; les agents gratuits continuent.', 'Jarvis répond encore au budget et note tes demandes pour Claude.'],
  }[mode];
  if (chiffres.jours_credits != null) {
    mesures.push(chiffres.jours_credits < 7
      ? `Les crédits de modèles ne tiennent plus que ${chiffres.jours_credits} jours : une recharge est à prévoir.`
      : `Les crédits de modèles tiennent environ ${chiffres.jours_credits} jours à ce rythme ; alerte prévue à 7 jours.`);
  }
  return { mode, facteur, pauses, chiffres, mesures };
}

// Jours restants dans le mois, à l'heure de Paris (fraction du jour en cours comprise).
export function joursRestantsDuMois(maintenant = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' })
    .formatToParts(maintenant).map((x) => [x.type, +x.value]));
  const jm = new Date(Date.UTC(p.year, p.month, 0)).getUTCDate();
  return jm - p.day + 1 - (p.hour + p.minute / 60) / 24;
}

// La lecture des faits (crédits, dépense du mois et de la semaine, taux BCE), puis la décision,
// notée dans regime_budget et, quand le régime change, dans le journal.
let dernier = null, derniereLecture = 0;
export async function evaluer({ brain, maintenant = new Date() }) {
  if (dernier && Date.now() - derniereLecture < 30 * 60_000) return dernier;
  const cle = process.env.OPENROUTER_API_KEY;
  let moisUsd = null, semaineUsd = null, creditsUsd = null;
  const lire = async (url) => ((await (await fetch(url, { headers: { Authorization: 'Bearer ' + cle }, signal: AbortSignal.timeout(8000) })).json()) || {}).data || {};
  if (cle) {
    try { const k = await lire('https://openrouter.ai/api/v1/key'); moisUsd = k.usage_monthly ?? null; semaineUsd = k.usage_weekly ?? null; } catch {}
    try { const c = await lire('https://openrouter.ai/api/v1/credits'); if (c.total_credits != null) creditsUsd = c.total_credits - c.total_usage; } catch {}
  }
  if (moisUsd == null || semaineUsd == null) { // repli : ce que les agents ont noté eux-mêmes
    const { rows } = await brain.query(`SELECT
      coalesce(sum(cost_usd) FILTER (WHERE created_at >= date_trunc('month', now())), 0) AS mois,
      coalesce(sum(cost_usd) FILTER (WHERE created_at > now() - interval '7 days'), 0) AS semaine FROM agent_runs`);
    moisUsd ??= +rows[0].mois; semaineUsd ??= +rows[0].semaine;
  }
  let taux = 1, tauxNote = 'taux indisponible : 1 $ compté pour 1 €, par prudence';
  try {
    const d = await (await fetch('https://api.frankfurter.app/latest?from=USD&to=EUR', { signal: AbortSignal.timeout(5000) })).json();
    if (d?.rates?.EUR) { taux = d.rates.EUR; tauxNote = `taux BCE du ${d.date}`; }
  } catch {}
  // La baisse des crédits du compte entier sur 24 h au moins (d'après nos propres relevés).
  let rythmeCreditsUsd = null;
  try {
    const { rows: h } = await brain.query(`SELECT (chiffres->>'credits_restants_usd')::float AS c, le FROM regime_budget
      WHERE chiffres ? 'credits_restants_usd' AND le < now() - interval '24 hours' ORDER BY le DESC LIMIT 1`);
    if (h[0] && h[0].c != null && creditsUsd != null) {
      const jours = (Date.now() - new Date(h[0].le).getTime()) / 86400e3;
      rythmeCreditsUsd = Math.max(0, (h[0].c - creditsUsd) / jours);
    }
  } catch {}
  const r = regime({ depenseMoisEur: moisUsd * taux, rythmeJourEur: (semaineUsd / 7) * taux,
    creditsRestantsEur: creditsUsd == null ? null : creditsUsd * taux, joursRestants: joursRestantsDuMois(maintenant),
    rythmeCreditsEur: rythmeCreditsUsd == null ? null : rythmeCreditsUsd * taux });
  r.chiffres.credits_restants_usd = creditsUsd == null ? null : +creditsUsd.toFixed(2);
  r.chiffres.taux = tauxNote;

  await brain.query(`CREATE TABLE IF NOT EXISTS regime_budget (
    id serial PRIMARY KEY, le timestamptz NOT NULL DEFAULT now(), mode text NOT NULL,
    facteur real, pauses text[], chiffres jsonb, mesures text[])`);
  const { rows: av } = await brain.query('SELECT mode, le FROM regime_budget ORDER BY le DESC LIMIT 1');
  const change = !av[0] || av[0].mode !== r.mode;
  if (change || Date.now() - new Date(av[0].le).getTime() > 55 * 60_000) {
    await brain.query('INSERT INTO regime_budget (mode, facteur, pauses, chiffres, mesures) VALUES ($1,$2,$3,$4,$5)',
      [r.mode, isFinite(r.facteur) ? r.facteur : null, r.pauses, JSON.stringify(r.chiffres), r.mesures]);
  }
  if (change && av[0]) {
    await brain.query('INSERT INTO journal(acteur, changement, motif) VALUES($1,$2,$3)',
      ['econome', `Régime ${av[0].mode} → ${r.mode}`, r.mesures.join(' ').slice(0, 500)]);
  }
  dernier = r; derniereLecture = Date.now();
  return r;
}
