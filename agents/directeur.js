// LE DIRECTEUR (08/10/2026) — la direction unique du système agentique rAIme (feuille de route, points 41 et 58).
//
// Basile, 07/10/2026 : « tous ces agents représentent une seule entité, le système agentique rAIme, et ça, c'est la
// direction ». Jusqu'ici, quatre agents réfléchissaient chacun de son côté : l'architecte (buts et questions, souvent sur
// des choses qui n'existaient pas), le superviseur (39 bilans « critique » sur 41, faits faux), le réflexif (des versions
// de prompt jamais activées) et la prospective. Ils sont retirés de la boucle ; le Directeur fait, une fois par jour :
//   1. l'ÉTAT de chaque agent, lu dans ses passages réels (boucle_passages) et son rythme : à jour, en retard, en échec ;
//   2. ce que la maison a PRODUIT en 24 h, compté en base (candidatures, e-mails, réponses, vitrines, adresses, appels…) ;
//   3. les ALERTES, par des règles écrites ici (un agent en échec deux fois de suite, une file validée qui ne part pas…) ;
//   4. les IDÉES de la nuit : le penseur (au plus trois idées sourcées), chacune JUGÉE par le goût (agents/gout.js) ;
//   5. le TRAVAIL réparti : au plus un ordre de diagnostic par jour confié à Hermes (sous-agent), sur la panne la plus
//      sérieuse, en lecture seule ; il revient dans le bilan suivant ;
//   6. UN bilan, gardé (table direction), lu par le Cockpit, par Jarvis et par l'e-mail de 7 h 30.
// Les faits sont du code (SQL), jamais inventés ; aucun envoi, aucune dépense. Basile ne reçoit que ce qui lui revient.
import pg from 'pg';
import * as gout from './gout.js';

const H = 3600e3;
const ZONE = 'Europe/Paris';
// Les agents dont le silence n'est pas une panne (hebdomadaires, nocturnes, retirés) : jamais « en retard » pour eux.
const SANS_RETARD = new Set(['prospective', 'publiciste', 'apis', 'penseur', 'directeur']);
// en-GB : l'heure seule s'écrit « 5 » (en fr-FR, « 05 h », illisible comme nombre : erreur de la boucle du 25/09)
const heureParis = (d = new Date()) => +new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, hour: 'numeric', hourCycle: 'h23' }).format(d);
const jourParis = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const sur = async (p, defaut = null) => { try { return await p; } catch { return defaut; } };
const un = async (client, sql, params = []) => sur(client.query(sql, params).then((r) => r.rows[0] || null));

export async function preparer(brain) {
  await brain.query(`CREATE TABLE IF NOT EXISTS direction (id serial PRIMARY KEY, le timestamptz NOT NULL DEFAULT now(), jour date NOT NULL,
    bilan jsonb NOT NULL, texte text NOT NULL)`);
  await brain.query('CREATE INDEX IF NOT EXISTS direction_le ON direction (le DESC)');
}

// 1. L'état de chaque agent sous rythme : son dernier passage, ses échecs d'affilée, et le dernier motif d'échec au journal.
export function etatAgent({ nom, toutes, heures }, passages, maintenant = Date.now()) {
  const p = passages.filter((x) => x.agent === nom).sort((a, b) => new Date(b.fin_le) - new Date(a.fin_le));
  if (!p.length) return { nom, etat: 'jamais', echecs: 0, dernier: null };
  let echecs = 0;
  for (const x of p) { if (x.statut === 'echec') echecs++; else break; }
  const dernier = new Date(p[0].fin_le).getTime();
  // un agent borné à des heures (la nuit) a jusqu'à un jour de marge ; les autres, une fois et demie leur rythme
  const marge = heures ? 24 * H + 2 * H : toutes * 1.5 + 15 * 60e3;
  const etat = echecs ? 'echec' : (!SANS_RETARD.has(nom) && maintenant - dernier > marge ? 'en_retard' : 'a_jour');
  return { nom, etat, echecs, dernier: new Date(dernier).toISOString() };
}

// 2. Ce que la maison a produit en 24 h (et ce qui attend). Chaque compte est lu en base ; illisible = null, jamais 0 inventé.
export async function production({ brain, n8n }) {
  // candidatures : la date d'envoi est envoi.recu_le (l'Envoyeur la rend) ; la dernière modification, la colonne maj
  const c = await un(brain, `SELECT count(*) FILTER (WHERE statut = 'envoye' AND (envoi->>'recu_le') IS NOT NULL
        AND (envoi->>'recu_le')::timestamptz > now() - interval '24 hours')::int AS envoyees,
      count(*) FILTER (WHERE statut = 'a_valider')::int AS a_valider, count(*) FILTER (WHERE statut = 'valide')::int AS validees,
      count(*) FILTER (WHERE statut = 'valide' AND maj < now() - interval '24 hours')::int AS validees_vieilles,
      count(*) FILTER (WHERE statut = 'a_toi')::int AS a_toi FROM candidatures`);
  const o = n8n ? await un(n8n, `SELECT count(*) FILTER (WHERE status = 'brouillon')::int AS brouillons, count(*) FILTER (WHERE status = 'valide')::int AS validees,
      count(*) FILTER (WHERE sent_at > now() - interval '24 hours')::int AS envoyes, count(*) FILTER (WHERE reply_at > now() - interval '24 hours')::int AS reponses
    FROM outreach`) : null;
  const f = n8n ? await un(n8n, `SELECT count(*) FILTER (WHERE furete_le > now() - interval '24 hours')::int AS examinees,
      count(*) FILTER (WHERE furete_le > now() - interval '24 hours' AND furete_note LIKE 'adresse sur le site%')::int AS adresses,
      count(*) FILTER (WHERE furete_note LIKE 'adresse sur le site%')::int AS adresses_total FROM prospects`) : null;
  const v = await un(brain, `SELECT count(*) FILTER (WHERE cree_le > now() - interval '24 hours')::int AS trouves,
      count(*) FILTER (WHERE statut = 'brouillon')::int AS brouillons, count(*) FILTER (WHERE statut = 'a_appeler')::int AS a_appeler,
      count(*) FILTER (WHERE envoye_le > now() - interval '24 hours')::int AS envoyes, count(*) FILTER (WHERE statut = 'repondu')::int AS reponses
    FROM vitrines`);
  const a = await un(brain, `SELECT count(*)::int AS notes FROM appels WHERE maj_le > now() - interval '24 hours'`);
  const r = await un(brain, `SELECT count(*) FILTER (WHERE statut = 'a_faire' AND cible_type <> 'libre' AND (echeance AT TIME ZONE '${ZONE}')::date <= (now() AT TIME ZONE '${ZONE}')::date)::int AS dues,
      count(*) FILTER (WHERE statut = 'a_faire' AND cible_type <> 'libre')::int AS ouvertes FROM rappels`);
  const e = await un(brain, `SELECT coalesce(sum(montant_eur), 0)::float AS eur FROM revenus
    WHERE le >= date_trunc('month', now() AT TIME ZONE '${ZONE}') AT TIME ZONE '${ZONE}'`);
  const d = await un(brain, `SELECT count(*)::int AS n FROM demandes WHERE etat = 'ouverte' AND pour_basile`);
  // le pôle de recherche (agents/veilleur.js, veillerPoles) et les agents de trading simulés (agents/trading.js)
  const veille = await un(brain, `SELECT count(*)::int AS n FROM veille_poles WHERE vu_le > now() - interval '24 hours'`);
  const trading = await un(brain, `SELECT count(*)::int AS n FROM trading_operations WHERE le > now() - interval '24 hours'`);
  return { candidatures: c, prospection: o, fureteur: f, vitrines: v, appels: a, agenda: r, revenus_mois: e ? e.eur : null, decisions: d ? d.n : null, veille: veille ? veille.n : null, trading: trading ? trading.n : null };
}

// 3. Les alertes : des règles, écrites ici. Chacune dit le fait et ce qu'il faut faire ; « qui » dit si c'est pour Basile.
export function alertes(agents, prod, motifs = {}) {
  const out = [];
  for (const a of agents) {
    if (a.etat === 'echec' && a.echecs >= 2) out.push({ gravite: 2, qui: 'maison', cle: `echec:${a.nom}`, agent: a.nom,
      texte: `${a.nom} : ${a.echecs} échecs d'affilée${motifs[a.nom] ? ` (${motifs[a.nom]})` : ''}.` });
    // un échec isolé se dit aussi (jamais « aucune panne » quand un agent n'est pas à jour) ; le passage suivant tranchera
    else if (a.etat === 'echec') out.push({ gravite: 1, qui: 'maison', cle: `echec1:${a.nom}`, agent: a.nom,
      texte: `${a.nom} : échec au dernier passage${motifs[a.nom] ? ` (${motifs[a.nom]})` : ''} ; le prochain dira s'il était passager.` });
    else if (a.etat === 'en_retard') out.push({ gravite: 1, qui: 'maison', cle: `retard:${a.nom}`, agent: a.nom,
      texte: `${a.nom} : en retard, dernier passage le ${a.dernier ? a.dernier.slice(0, 16).replace('T', ' ') : '?'} (UTC).` });
  }
  const c = prod.candidatures;
  if (c && c.validees_vieilles > 0) out.push({ gravite: 2, qui: 'maison', cle: 'candidatures:file', agent: 'envoyeur',
    texte: `${c.validees_vieilles} candidature(s) validée(s) depuis plus de 24 h ne sont pas parties : l'Envoyeur bute (connexion, formulaire, file).` });
  if (c && c.a_toi > 0) out.push({ gravite: 0, qui: 'basile', cle: 'candidatures:a_toi',
    texte: `${c.a_toi} offre(s) « à toi » dans le Bureau : postule depuis l'annonce, la lettre est prête.` });
  const v = prod.vitrines;
  const vit = agents.find((x) => x.nom === 'vitrines');
  if (v && v.trouves === 0 && vit && vit.etat === 'a_jour') out.push({ gravite: 1, qui: 'maison', cle: 'vitrines:zero', agent: 'vitrines',
    texte: 'Vitrines : aucun commerce trouvé en 24 h alors que l\'agent tourne : la découverte est à vérifier.' });
  if (v && v.reponses > 0) out.push({ gravite: 2, qui: 'basile', cle: 'vitrines:reponses', texte: `${v.reponses} commerçant(s) ont répondu : à rappeler en premier (agenda).` });
  if (prod.prospection && prod.prospection.reponses > 0) out.push({ gravite: 2, qui: 'basile', cle: 'prospection:reponses',
    texte: `${prod.prospection.reponses} réponse(s) à la prospection en 24 h : dans l'agenda, en tête.` });
  return out.sort((a, b) => b.gravite - a.gravite);
}

// 5. Le travail réparti : la panne la plus sérieuse (échecs d'affilée) est confiée à Hermes pour un diagnostic, une fois
// par 72 h et par agent, un ordre par jour au plus. Le goût pèse l'ordre avant qu'il parte (règles du code, sans dépense).
export function ordreDiagnostic(alerte, module) {
  return `Diagnostic demandé par le Directeur (${jourParis()}) : l'agent « ${alerte.agent} » ${alerte.texte.replace(/^[^:]+ : /, '')} `
    + `Lis son code (${module || `agents/${alerte.agent}.js`}) et les lignes du journal à son nom, explique la cause en cinq lignes au plus `
    + `et propose le correctif (le fichier, la fonction, le changement). Ne modifie aucun fichier ; aucune action extérieure.`;
}
async function repartir({ brain, alertes: liste, rythmes }) {
  const panne = liste.find((a) => a.cle.startsWith('echec:'));
  if (!panne) return null;
  const deja = await un(brain, `SELECT id FROM commandes WHERE source = 'directeur' AND (cree_le > now() - interval '24 hours'
    OR (texte LIKE $1 AND cree_le > now() - interval '72 hours'))`, [`%l'agent « ${panne.agent} »%`]);
  if (deja) return { ordre: null, motif: 'un diagnostic est déjà demandé' };
  const module = (rythmes.find((r) => r.nom === panne.agent) || {}).module;
  const texte = ordreDiagnostic(panne, module && module.replace(/^\.\//, 'agents/'));
  const j = gout.regles(texte);
  if (j && j.verdict !== 'AUTO') return { ordre: null, motif: `retenu par le goût : ${j.motif}` };
  const { rows: [r] } = await brain.query(`INSERT INTO commandes (texte, source, pour) VALUES ($1, 'directeur', 'harness') RETURNING id`, [texte]);
  return { ordre: r.id, agent: panne.agent };
}

// Les diagnostics rendus par Hermes depuis le dernier bilan : ils reviennent ici, une ligne chacun.
async function retours(brain) {
  const { rows } = await sur(brain.query(`SELECT id, etat, left(coalesce(reponse, ''), 400) AS reponse FROM commandes
    WHERE source = 'directeur' AND traite_le > now() - interval '26 hours' ORDER BY id`), { rows: [] });
  return rows;
}

// 4. Les idées de la nuit, jugées par le goût : AUTO et REVUE restent, BASILE est signalée, BLOQUE est retirée.
async function idees({ brain, penser, juger }) {
  if (!penser) return [];
  const r = await sur(penser({ brain, garder: true }), null);
  if (!r || !r.gardees) return [];
  const out = [];
  for (const p of r.gardees) {
    const j = await sur(juger({ brain, source: 'directeur', action: `${p.titre} : ${p.proposition}`, contexte: p.conclusion || '' }), null);
    out.push({ titre: p.titre, proposition: p.proposition, confiance: p.confiance, verdict: j ? j.verdict : 'REVUE', motif: j ? j.motif : 'goût indisponible' });
  }
  return out.filter((x) => x.verdict !== 'BLOQUE');
}

// Le texte du bilan : court, des faits, ce qui demande Basile en premier.
export function rediger(b) {
  const p = b.production || {};
  const lignes = [];
  const pour = b.alertes.filter((a) => a.qui === 'basile');
  const maison = b.alertes.filter((a) => a.qui !== 'basile');
  if (pour.length) lignes.push('Pour toi : ' + pour.map((a) => a.texte).join(' '));
  const n = (x) => (x === null || x === undefined ? '?' : x);
  const c = p.candidatures, o = p.prospection, f = p.fureteur, v = p.vitrines;
  lignes.push(`En 24 h : ${n(c && c.envoyees)} candidature(s) envoyée(s) ; ${n(o && o.envoyes)} e-mail(s) de prospection, ${n(o && o.reponses)} réponse(s) ; `
    + `${n(v && v.trouves)} commerce(s) trouvé(s), ${n(v && v.envoyes)} vitrine(s) envoyée(s) ; ${n(f && f.adresses)} adresse(s) prouvée(s) ; ${n(p.appels && p.appels.notes)} appel(s) noté(s).`);
  lignes.push(`En attente : ${n(c && c.a_valider)} offre(s) à valider, ${n(o && o.brouillons)} brouillon(s) de prospection, ${n(v && v.brouillons)} vitrine(s) à valider, `
    + `${n(p.agenda && p.agenda.dues)} relance(s) du jour, ${n(p.decisions)} décision(s). Revenus du mois : ${n(p.revenus_mois)} €.`);
  if (p.veille != null || p.trading != null) lignes.push(`Recherche : ${n(p.veille)} trouvaille(s) neuve(s) pour les agents ; trading simulé : ${n(p.trading)} opération(s) en 24 h.`);
  const ok = b.agents.filter((a) => a.etat === 'a_jour').length;
  lignes.push(`Agents : ${ok} à jour sur ${b.agents.length}${maison.length ? ` ; ${maison.map((a) => a.texte).join(' ')}` : ' ; aucune panne.'}`);
  if (b.ordre && b.ordre.ordre) lignes.push(`Diagnostic confié à Hermes (ordre n°${b.ordre.ordre}) : ${b.ordre.agent}.`);
  for (const r of b.retours || []) lignes.push(`Retour d'Hermes (ordre n°${r.id}, ${r.etat}) : ${r.reponse || '—'}`);
  for (const i of b.idees || []) lignes.push(`Idée (${i.verdict === 'BASILE' ? 'ton accord' : i.verdict === 'AUTO' ? 'retenue' : 'à revoir'}) : ${i.titre} — ${i.proposition}`);
  return lignes.join('\n');
}

export async function diriger({ brain, n8n = null, rythmes = [], maintenant = new Date(), penser = null, juger = gout.juger, ordonner = true } = {}) {
  await preparer(brain);
  const { rows: passages } = await brain.query(`SELECT agent, statut, fin_le FROM (SELECT agent, statut, fin_le,
      row_number() OVER (PARTITION BY agent ORDER BY fin_le DESC) AS rang FROM boucle_passages WHERE fin_le > now() - interval '8 days') x WHERE rang <= 6`);
  const suivis = rythmes.filter((r) => r.nom !== 'directeur');
  const agents = suivis.map((r) => etatAgent(r, passages, maintenant.getTime()));
  const motifs = {};
  for (const a of agents.filter((x) => x.etat === 'echec')) {
    const m = await un(brain, `SELECT left(motif, 160) AS motif FROM journal WHERE acteur = 'boucle' AND changement = $1 ORDER BY created_at DESC LIMIT 1`, [`Échec de l'agent ${a.nom}`]);
    if (m) motifs[a.nom] = m.motif;
  }
  const prod = await production({ brain, n8n });
  const liste = alertes(agents, prod, motifs);
  // la nuit seulement (de 2 h à 7 h à Paris), les idées : le penseur n'est plus un agent à part
  const nuit = heureParis(maintenant) >= 2 && heureParis(maintenant) < 7;
  const pense = penser === false ? null : penser || (nuit ? (await import('./penseur.js')).penser : null);   // false : jamais (le banc)
  const lesIdees = await idees({ brain, penser: pense, juger });
  const ordre = ordonner ? await sur(repartir({ brain, alertes: liste, rythmes }), null) : null;
  const bilan = { jour: jourParis(maintenant), agents, production: prod, alertes: liste, idees: lesIdees, ordre, retours: await retours(brain) };
  const texte = rediger(bilan);
  await brain.query('INSERT INTO direction (jour, bilan, texte) VALUES ($1, $2, $3)', [bilan.jour, JSON.stringify(bilan), texte]);
  await sur(brain.query('INSERT INTO journal(acteur, changement, motif) VALUES ($1, $2, $3)', ['directeur',
    `Bilan du ${bilan.jour} : ${agents.filter((a) => a.etat === 'a_jour').length}/${agents.length} agents à jour, ${liste.length} alerte(s)`, texte.slice(0, 900)]));
  return { ...bilan, texte };
}

// CLI : node agents/directeur.js   (un bilan, écrit en base, affiché)
if (import.meta.url === `file://${process.argv[1]}`) {
  const { db } = await import('./lib.js');
  const brain = db(); await brain.connect();
  const n8n = new pg.Client({ connectionString: process.env.DATABASE_URL_N8N }); await n8n.connect();
  const { RYTHMES } = await import('./rythmes.js');
  try { console.log((await diriger({ brain, n8n, rythmes: RYTHMES, penser: false, ordonner: process.argv.includes('--ordonner') })).texte); }
  finally { await brain.end(); await n8n.end(); }
}
