// LA VALIDATION DES E-MAILS DE PROSPECTION (07/10/2026) — une seule page pour les deux offres :
//   · les sites vitrines (commerçants sans site) : l'e-mail tel qu'il partira, et « Voir » ouvre la maquette du commerce ;
//   · l'automatisation (entreprises) : l'e-mail tel qu'il partira, et « Voir » ouvre le pré-audit de son secteur.
// Basile valide ou refuse (avec un motif, gardé au journal). En tête : l'état des deux envois (pause, essai, réel), réglable
// d'ici. Rien ne part de ce module : les envois restent aux workflows n8n « Vitrines · Envoi » et « Expéditeur ».
'use strict';

const { lire, lireN8n } = require('./bases.cjs');
const vitrines = require('./vitrines.cjs');

const ADRESSE = process.env.COCKPIT_ADRESSE || 'https://cockpit.raime.fr';
const { preaudit } = require('./preaudits.cjs');   // le pré-audit publié du secteur, ou rien

async function etat() {
  const v = await vitrines.envoi().catch(() => ({ mode: 'absent' }));
  const [c] = await lireN8n('SELECT mode, daily_cap, from_email, from_name FROM send_config WHERE id = 1').catch(() => []);
  const [n] = await lireN8n(`SELECT count(*) FILTER (WHERE status = 'brouillon')::int AS brouillons,
    count(*) FILTER (WHERE status = 'differe')::int AS differes, count(*) FILTER (WHERE status = 'valide')::int AS en_file,
    count(*) FILTER (WHERE status = 'envoye' AND sent_at >= date_trunc('day', now()))::int AS envoyes_aujourdhui,
    count(*) FILTER (WHERE status = 'envoye')::int AS envoyes FROM outreach`).catch(() => []);
  return { vitrines: v, automatisation: c ? { mode: c.mode, plafond_jour: c.daily_cap, de: `${c.from_name} <${c.from_email}>`, ...(n || {}) } : { mode: 'absent' } };
}

async function file() {
  const sites = await lire(`SELECT id, nom, metier, ville, email, sujet, corps, slug, statut, motif, note FROM vitrines
    WHERE statut IN ('brouillon', 'valide') AND corps IS NOT NULL ORDER BY statut, maj_le DESC LIMIT 200`).catch(() => []);
  const autos = await lireN8n(`SELECT id, prospect_name, segment, to_email, subject, body, status FROM outreach
    WHERE status IN ('brouillon', 'differe', 'valide') ORDER BY array_position(ARRAY['brouillon','differe','valide'], status), created_at DESC LIMIT 300`).catch(() => []);
  return {
    sites: sites.map((s) => ({ id: s.id, type: 'site', statut: s.statut, nom: s.nom, metier: s.metier, ville: s.ville, a: s.email,
      sujet: s.sujet, corps: s.corps, voir: s.slug ? `${ADRESSE}/demo/${s.slug}` : null, voir_label: 'Voir la maquette',
      apercu_v3: s.slug ? `${ADRESSE}/demo/v3/${s.slug}` : null, note: s.note || '' })),
    automatisation: autos.map((a) => ({ id: a.id, type: 'automatisation', statut: a.status, nom: a.prospect_name, metier: a.segment,
      a: a.to_email, sujet: a.subject, corps: a.body, voir: preaudit(a.segment), voir_label: 'Voir le pré-audit' })),
  };
}

// Les gestes de Basile. Site : valider met le brouillon dans la file d'envoi (vitrines.agir) ; refuser l'écarte.
// Automatisation : un brouillon ou un différé se valide ou se refuse ; un validé peut être retiré (refusé).
async function agir(type, id, { action, motif = '' } = {}) {
  const raison = String(motif || '').slice(0, 300) || null;
  if (type === 'site') {
    if (!['valider', 'refuser'].includes(action)) return { ok: false, erreur: 'action attendue : valider, refuser' };
    return vitrines.agir(Number(id), { action: action === 'valider' ? 'valider' : 'ecarter', note: raison });
  }
  if (type !== 'automatisation') return { ok: false, erreur: 'type inconnu' };
  const cible = { valider: 'valide', refuser: 'refuse' }[action];
  if (!cible) return { ok: false, erreur: 'action attendue : valider, refuser' };
  const r = await lireN8n(`UPDATE outreach SET status = $2, validated_at = CASE WHEN $2 = 'valide' THEN now() ELSE validated_at END
    WHERE id = $1 AND status IN ('brouillon', 'differe', 'valide') RETURNING id`, [Number(id), cible]);
  if (!r.length) return { ok: false, erreur: 'e-mail introuvable ou déjà parti' };
  await lire(`INSERT INTO journal(acteur, changement, motif) VALUES('basile', $1, $2)`, [`E-mail de prospection n°${id} : ${cible}`, raison]);
  return { ok: true };
}

const MODES = ['pause', 'test', 'live'];
async function changerMode(type, mode) {
  if (!MODES.includes(mode)) return { ok: false, erreur: `mode attendu : ${MODES.join(', ')}` };
  if (type === 'site') return vitrines.changerMode(mode);
  const r = await lireN8n('UPDATE send_config SET mode = $1 WHERE id = 1 RETURNING mode', [mode]);
  if (!r.length) return { ok: false, erreur: 'réglage d’envoi absent' };
  await lire(`INSERT INTO journal(acteur, changement, motif) VALUES('basile', $1, $2)`, [`Envoi des e-mails d'automatisation : mode ${mode}`, 'choisi dans la page Prospection']);
  return { ok: true, ...(await etat()) };
}

async function router(req, res, { url, m, envoyer, json, autorise, fichierInterface }) {
  if (m === 'GET' && url === '/prospection') { fichierInterface(res, 'prospection.html'); return true; }
  if (m === 'GET' && url === '/api/prospection/etat') { envoyer(res, 200, await etat()); return true; }
  if (m === 'GET' && url === '/api/prospection/file') { envoyer(res, 200, await file()); return true; }
  let r;
  if (m === 'POST' && (r = url.match(/^\/api\/prospection\/(site|automatisation)\/(\d+)$/))) {
    if (!autorise(req)) { envoyer(res, 403, { ok: false }); return true; }
    envoyer(res, 200, await agir(r[1], r[2], await json(req, 2000))); return true;
  }
  if (m === 'POST' && (r = url.match(/^\/api\/prospection\/(site|automatisation)\/mode$/))) {
    if (!autorise(req)) { envoyer(res, 403, { ok: false }); return true; }
    envoyer(res, 200, await changerMode(r[1], String((await json(req, 500)).mode || ''))); return true;
  }
  return false;
}

module.exports = { router, etat, file, agir, changerMode, preaudit };
