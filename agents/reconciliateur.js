// AGENT RÉCONCILIATEUR — le chaînon manquant entre « détecter » et « savoir ».
//
// Le Réceptionniste enregistre les courriels entrants dans `replies`, mais n'a jamais
// marqué l'envoi correspondant : tout le système lisait 0 réponse alors qu'il y en avait 8.
// Détecter sans inscrire le résultat là où les autres regardent, c'est ne rien détecter.
//
// Il fait trois choses, toutes déterministes — aucun modèle, aucun jugement :
//   ① réconcilie replies → outreach.reply_at
//   ② défait les suppressions abusives (un classement peut blacklister un vrai prospect)
//   ③ prend le pouls du tuyau IMAP
//
// ③ mérite une explication. On ne peut pas distinguer « aucun courriel n'arrive » de
// « la connexion est tombée » — sauf que la boîte reçoit en permanence des notifications
// Google et LinkedIn. Ce bruit, qu'on serait tenté de filtrer, est précisément la preuve
// que le tuyau est vivant. Le bruit EST le battement de cœur.
import pg from 'pg';

// Un désabonnement est un acte explicite. On ne le déduit jamais d'un classement.
const MOTS_DESABONNEMENT = [
  'desabonn', 'désabonn', 'unsubscribe', 'ne plus recevoir', 'ne plus me contacter',
  'retirez-moi', 'retirer de votre liste', 'stop', 'opt-out', 'opt out',
];

// Expéditeurs automatiques : ils ne répondent jamais, mais leur présence prouve la liaison.
const EXPEDITEURS_BRUIT = [
  'noreply', 'no-reply', 'donotreply', 'notifications', 'notification',
  '@google.com', '@linkedin.com', '@accounts.google.com', 'mailer-daemon', 'postmaster',
];

const SEUIL_SILENCE_JOURS = 5;   // au-delà, le tuyau est suspect

const estBruit = (email) => {
  const e = String(email || '').toLowerCase();
  return EXPEDITEURS_BRUIT.some((m) => e.includes(m));
};

const contientDesabonnement = (texte) => {
  const t = String(texte || '').toLowerCase();
  return MOTS_DESABONNEMENT.some((m) => t.includes(m));
};

export async function reconcilier({ n8n, brain }) {
  const r = { marques: 0, par_domaine: 0, suppressions_annulees: 0, bruit: 0, vraies: 0 };

  // ── ① Réconciliation : une réponse reçue doit se voir dans outreach ──────────
  const { rows: reponses } = await n8n.query(
    `SELECT id, from_email, subject, body, received_at FROM replies ORDER BY received_at`);

  for (const rep of reponses) {
    if (estBruit(rep.from_email)) { r.bruit++; continue; }
    r.vraies++;
    // Correspondance exacte d'abord.
    let { rowCount } = await n8n.query(
      `UPDATE outreach SET reply_at = $2
       WHERE lower(to_email) = lower($1) AND sent_at IS NOT NULL AND reply_at IS NULL`,
      [rep.from_email, rep.received_at]);

    // Rattrapage par domaine : on écrit à contact@cabinet.fr, le dirigeant répond depuis
    // p.martin@cabinet.fr. Sans ce rattrapage, une vraie réponse reste invisible.
    if (rowCount === 0) {
      const domaine = String(rep.from_email).split('@')[1];
      if (domaine && domaine.length > 3) {
        const res = await n8n.query(
          `UPDATE outreach SET reply_at = $2
           WHERE lower(to_email) LIKE '%@' || lower($1)
             AND sent_at IS NOT NULL AND reply_at IS NULL`,
          [domaine, rep.received_at]);
        rowCount = res.rowCount;
        if (rowCount) r.par_domaine = (r.par_domaine || 0) + rowCount;
      }
    }
    r.marques += rowCount;
  }

  // ── ② Suppressions abusives ──────────────────────────────────────────────────
  // Le Réceptionniste ajoute à la liste de suppression sur la seule foi du classement
  // du modèle. Une notification Google y est déjà entrée. Un vrai prospect mal classé
  // serait blacklisté sans recours : on n'accepte une suppression que si le texte
  // contient une demande explicite.
  let suppressions = [];
  try {
    const { rows } = await n8n.query(
      `SELECT s.email, s.reason FROM suppression s WHERE s.reason = 'reply_stop'`);
    suppressions = rows;
  } catch { /* table absente : rien à vérifier */ }

  for (const s of suppressions) {
    const { rows: src } = await n8n.query(
      `SELECT body, subject FROM replies WHERE lower(from_email) = lower($1)
       ORDER BY received_at DESC LIMIT 1`, [s.email]);
    const texte = src.length ? `${src[0].subject} ${src[0].body}` : '';
    const legitime = contientDesabonnement(texte);
    if (!legitime) {
      await n8n.query(`DELETE FROM suppression WHERE email = $1 AND reason = 'reply_stop'`, [s.email]);
      r.suppressions_annulees++;
      await brain.query(
        `INSERT INTO journal(acteur, changement, motif) VALUES($1,$2,$3)`,
        ['reconciliateur', `Suppression annulée pour ${s.email}`,
         'Classée « désabonnement » par le modèle sans aucune demande explicite dans le texte.']);
    }
  }

  // ── ③ Pouls du tuyau IMAP ────────────────────────────────────────────────────
  const { rows: dernier } = await n8n.query(
    `SELECT max(received_at) AS le, (now()::date - max(received_at)::date) AS silence FROM replies`);
  r.dernier_courriel = dernier[0].le;
  r.silence_jours = dernier[0].silence;
  r.tuyau = r.silence_jours === null ? 'inconnu'
    : r.silence_jours <= SEUIL_SILENCE_JOURS ? 'vivant' : 'suspect';

  if (r.tuyau === 'suspect') {
    await brain.query(
      `INSERT INTO journal(acteur, changement, motif) VALUES($1,$2,$3)`,
      ['reconciliateur', `Tuyau IMAP suspect : aucun courriel entrant depuis ${r.silence_jours} jours`,
       'Même les notifications automatiques ont cessé. Une boîte qui ne reçoit plus rien du tout, pas même du bruit, indique une connexion tombée plutôt qu un calme réel.']);
  }

  return r;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { db } = await import('./lib.js');
  const brain = db(); await brain.connect();
  const n8n = new pg.Client({ connectionString: process.env.DATABASE_URL_N8N }); await n8n.connect();
  try {
    const r = await reconcilier({ n8n, brain });
    console.log(`\n╔══ RÉCONCILIATION ══╗\n`);
    console.log(`  courriels entrants     : ${r.vraies} réels · ${r.bruit} notifications automatiques`);
    console.log(`  envois marqués répondus: ${r.marques}${r.par_domaine ? ` (dont ${r.par_domaine} rattrapés par domaine)` : ''}`);
    console.log(`  suppressions annulées  : ${r.suppressions_annulees}`);
    console.log(`\n  POULS DU TUYAU IMAP : ${r.tuyau.toUpperCase()}`);
    console.log(`  dernier courriel reçu : ${r.dernier_courriel ? new Date(r.dernier_courriel).toISOString().slice(0,16).replace('T',' ') : '—'} (il y a ${r.silence_jours} jour(s))`);
    console.log(`  seuil d'alerte        : ${SEUIL_SILENCE_JOURS} jours sans le moindre courriel, bruit compris\n`);
  } finally { await brain.end(); await n8n.end(); }
}
