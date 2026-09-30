// LE CAP VIVANT — ce que chaque décision doit avoir sous les yeux : l'objectif et la bonne réponse
// (jarvis/cap.cjs, fixes), le passé, le futur et l'état (ici, lus dans la base, sans modèle).
//
// La couche évolue seule, sans rien réécrire en silence : les leçons que l'architecte et le réflexif
// tiennent pour sûres (table croyances) et les jugements du goût (table jugements) y entrent dès qu'ils
// changent ; chaque version distincte du cap est gardée (table cap), pour relire comment il a évolué.
// Les principes, eux, ne changent que par une livraison relue (jarvis/cap.cjs) et l'accord de Basile.
//
//   node agents/cap.js        affiche le cap du moment
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const FIXE = createRequire(import.meta.url)('../jarvis/cap.cjs');

export const TAILLE_MAX = 2600; // caractères : le cap part avec chaque consigne, il reste court
const RAFRAICHIR_MS = 30 * 60_000;

async function lignes(brain, sql, params = []) {
  try { return (await brain.query(sql, params)).rows; } catch { return []; } // une table absente n'empêche rien
}

// Les faits du moment, lus par du code.
export async function faitsDuMoment({ brain }) {
  const [ordres] = await lignes(brain, `SELECT count(*) FILTER (WHERE etat = 'faite')::int AS faits,
      count(*) FILTER (WHERE etat IN ('a_faire', 'refusee') AND reponse IS NOT NULL AND pour = 'claude')::int AS echoues,
      count(*) FILTER (WHERE etat IN ('a_faire', 'en_cours') AND pour = 'harness')::int AS en_file
    FROM commandes WHERE cree_le > now() - interval '7 days'`);
  const enEchec = await lignes(brain, `SELECT agent FROM boucle_passages WHERE fin_le > now() - interval '24 hours'
    GROUP BY agent HAVING bool_and(statut <> 'ok') ORDER BY agent`);
  const [revenus] = await lignes(brain, `SELECT coalesce(sum(montant_eur), 0)::float AS contenus FROM revenus
    WHERE le >= date_trunc('month', now()) AND coalesce(plateforme, '') <> ''`);
  const buts = await lignes(brain, `SELECT id, horizon, enonce FROM buts WHERE etat = 'ouvert'
    ORDER BY CASE horizon WHEN 'court' THEN 0 WHEN 'moyen' THEN 1 ELSE 2 END, id LIMIT 6`);
  const lecons = await lignes(brain, `SELECT enonce FROM croyances WHERE confiance >= 0.9
    AND coalesce(maj_le, now()) > now() - interval '30 days' ORDER BY confiance DESC, maj_le DESC NULLS LAST LIMIT 3`);
  const [regime] = await lignes(brain, 'SELECT mode FROM regime_budget ORDER BY le DESC LIMIT 1');
  const jugements = await lignes(brain, `SELECT verdict, count(*)::int AS n FROM jugements
    WHERE le > now() - interval '7 days' GROUP BY verdict ORDER BY verdict`);
  return { ordres: ordres || null, enEchec: enEchec.map((r) => r.agent), revenus: revenus ? revenus.contenus : null,
    buts, lecons: lecons.map((r) => r.enonce), regime: regime ? regime.mode : null, jugements };
}

const court = (t, n) => (String(t).length > n ? String(t).slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : String(t));

// Le texte du cap : le fixe, puis le vivant, borné.
export function rediger(f) {
  const passe = [];
  if (f.ordres) passe.push(`${f.ordres.faits} ordre(s) fait(s) en 7 jours, ${f.ordres.echoues} en échec, ${f.ordres.en_file} en file`);
  passe.push(f.enEchec.length ? `agents en échec depuis 24 h : ${f.enEchec.join(', ')}` : 'aucun agent en échec depuis 24 h');
  if (f.revenus != null) passe.push(`monétisation des contenus ce mois : ${Math.round(f.revenus)} € sur 2 000 €`);
  if (f.jugements.length) passe.push('jugements du goût en 7 jours : ' + f.jugements.map((j) => `${j.verdict} ${j.n}`).join(', '));
  const futur = f.buts.map((b) => `[${b.horizon}] ${court(b.enonce, 110)}`);
  const vivant = [
    'LE PASSÉ : ' + passe.join(' ; ') + '.',
    futur.length ? 'LE FUTUR (buts ouverts, le plus proche d\'abord) : ' + futur.join(' ; ') + '.' : '',
    f.lecons.length ? 'CE QUE LA MAISON A APPRIS : ' + f.lecons.map((l) => court(l, 140)).join(' ; ') + '.' : '',
    f.regime ? `ÉTAT : régime de dépense « ${f.regime} ».` : '',
  ].filter(Boolean).join('\n');
  return court(`LE CAP (${FIXE.VERSION})\n${FIXE.fixe()}\n${vivant}`, TAILLE_MAX);
}

// Compile, garde la version si elle est nouvelle, et la rend.
export async function compiler({ brain }) {
  const faits = await faitsDuMoment({ brain });
  const texte = rediger(faits);
  const empreinte = crypto.createHash('sha256').update(texte).digest('hex').slice(0, 16);
  try {
    await brain.query(`CREATE TABLE IF NOT EXISTS cap (id serial PRIMARY KEY, le timestamptz NOT NULL DEFAULT now(),
      version text NOT NULL, empreinte text UNIQUE NOT NULL, texte text NOT NULL, faits jsonb)`);
    await brain.query(`INSERT INTO cap (version, empreinte, texte, faits) VALUES ($1, $2, $3, $4)
      ON CONFLICT (empreinte) DO NOTHING`, [FIXE.VERSION, empreinte, texte, JSON.stringify(faits)]);
  } catch { /* la trace manque, le cap sert quand même */ }
  return { texte, empreinte, faits, boussole: FIXE.BOUSSOLE };
}

// Le cap du moment, gardé 30 minutes : il part avec chaque consigne d'agent (agents/lib.js).
let memoire = null, memoireLe = 0;
export async function capActuel({ brain, maintenant = Date.now() }) {
  if (memoire && maintenant - memoireLe < RAFRAICHIR_MS) return memoire;
  memoire = await compiler({ brain }); memoireLe = maintenant;
  return memoire;
}
export function oublier() { memoire = null; memoireLe = 0; }
export const enMemoire = (maintenant = Date.now()) => (memoire && maintenant - memoireLe < RAFRAICHIR_MS ? memoire : null);

if (import.meta.url === `file://${process.argv[1]}`) {
  const { db } = await import('./lib.js');
  const brain = db(); await brain.connect();
  try { console.log((await compiler({ brain })).texte); } finally { await brain.end(); }
}
