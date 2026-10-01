// LE PRESTATAIRE — Jarvis confie à Claude ce que Basile lui demande nommément (« demande à Claude de… »,
// « confie l'ordre 12 à Claude »). Voie retenue le 01/10/2026 avec l'accord de Basile : un ticket « chantier » sur
// GitHub (jeton GITHUB_CHANTIER_TOKEN du coffre, qui voit le dépôt), que la routine Claude « rAIme · Ingénierie »
// prend à son passage suivant, sur l'abonnement de Basile. Jamais de clé API Anthropic, jamais de facturation à l'usage.
//
// Le moins de tokens possible (règle de Basile du 01/10/2026) : seuls les ordres adressés à Claude partent (Hermes,
// gratuit, garde les autres) ; cinq par 24 heures au plus. Un échec de GitHub laisse l'ordre en attente : il repart
// au tour suivant, sans se perdre.
//
// Le compte rendu revient par le dépôt : la routine écrit jarvis/ordres/<n°>.md dans sa pull request ; une fois
// fusionnée et livrée, le Cockpit le lit et l'ordre passe à « faite ».
'use strict';

const fs = require('fs');
const path = require('path');
const { lire, lireCoffre } = require('./bases.cjs');

const MAX_JOUR = Number(process.env.PRESTATAIRE_MAX_JOUR || 5);
const COMPTES_RENDUS = process.env.ORDRES_DIR || path.join(__dirname, 'ordres');
const DEPOT = process.env.GITHUB_DEPOT || 'basilerameee-star/raime-cerveau';
const PASSAGES = '7 h 07 et 19 h 07';

// « demande à Claude… », « fais faire ça par Claude », « Claude, construis… » : adressé à Claude.
// (« à » n'est pas une lettre pour \b en JavaScript : le mot qui précède se repère par l'espace.)
const POUR_CLAUDE = /(?:^\s*(?:(?:ok|bon|alors|jarvis)[\s,]+)*claude\b|(?:^|\s)(?:à|a|par|pour)\s+claude\b|\bclaude\s+(?:doit|peut|va)\b)/i;
// « confie l'ordre 12 à Claude », « passe la demande 7 à Claude »
const CONFIER_ORDRE = /\b(?:confi|pass|donn|transf[eè]r)\w*\s+(?:l['’]|la\s+|les?\s+)?(?:ordres?|demandes?|n°)\s*(\d+)\b[\s\S]*\bclaude\b/i;

const SECRETS = [/\bsk-[A-Za-z0-9_-]{16,}/, /\b(rk|sk)_(live|test)_[A-Za-z0-9]{8,}/, /\bgh[pousr]_[A-Za-z0-9]{20,}/, /\bgithub_pat_[A-Za-z0-9_]{20,}/];

async function preparer() {
  await lire('ALTER TABLE commandes ADD COLUMN IF NOT EXISTS confie_le timestamptz, ADD COLUMN IF NOT EXISTS ticket int');
}

// Un nouvel ordre pour Claude, noté puis confié.
async function noter(message, deps = {}) {
  await preparer();
  const r = await lire("INSERT INTO commandes (texte, pour) VALUES ($1, 'routine') RETURNING id", [message]);
  const id = r[0].id;
  const c = await confier(deps);
  const ok = c.parti && c.id === id;
  return { id, reply: ok
    ? `C'est noté pour Claude, ordre numéro ${id}. Il le prendra à son prochain passage (${PASSAGES}) et te préparera le travail à valider.`
    : `C'est noté pour Claude, ordre numéro ${id}. ${c.raison === 'plafond' ? `Cinq ordres lui sont déjà partis aujourd'hui : celui-ci part demain.` : 'Il partira dès que GitHub répondra.'}` };
}

async function confierOrdreExistant(id) {
  await preparer();
  const r = await lire(`UPDATE commandes SET pour = 'routine', etat = 'a_faire', reponse = coalesce(reponse, '') || ' [confié à Claude par Basile]'
    WHERE id = $1 AND etat = 'a_faire' RETURNING id`, [id]);
  return r.length > 0;
}

// Le plus ancien ordre pour Claude devient un ticket « chantier », si le jeton est au coffre et le plafond du jour non atteint.
async function confier({ fetch = globalThis.fetch, coffre = lireCoffre() || {} } = {}) {
  const c = (await lire(`SELECT id, texte FROM commandes WHERE etat = 'a_faire' AND pour = 'routine' ORDER BY cree_le LIMIT 1`))[0];
  if (!c) return { parti: false, raison: 'rien' };
  const jeton = coffre.GITHUB_CHANTIER_TOKEN;
  if (!jeton) return { parti: false, raison: 'jeton' };
  const { n } = (await lire(`SELECT count(*)::int AS n FROM commandes WHERE pour = 'routine' AND confie_le > now() - interval '24 hours'`))[0];
  if (n >= MAX_JOUR) return { parti: false, raison: 'plafond' };
  if (SECRETS.some((re) => re.test(c.texte))) {
    await lire(`UPDATE commandes SET pour = 'claude', reponse = 'Refusé : le texte porte un secret, il ne part pas sur GitHub.' WHERE id = $1`, [c.id]);
    return { parti: false, raison: 'secret' };
  }
  const corps = `## Ordre de Basile (n°${c.id}, transmis par Jarvis)\n\n${c.texte}\n\n`
    + `## À faire\nTraite cet ordre comme un chantier. Ta pull request ajoute **jarvis/ordres/${c.id}.md** : trois phrases au plus, `
    + `en français simple (ce qui est fait, où le voir, ce qui reste). C'est ce fichier que Jarvis lit pour dire à Basile que c'est fini.\n\n`
    + `---\n_Ouvert par Jarvis (jarvis/prestataire.cjs)._`;
  let r;
  try {
    r = await fetch(`https://api.github.com/repos/${DEPOT}/issues`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jeton}`, Accept: 'application/vnd.github+json', 'User-Agent': 'rAIme-jarvis/1.0', 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: `Ordre n°${c.id} : ${c.texte.replace(/\s+/g, ' ').slice(0, 90)}`, body: corps, labels: ['chantier'] }),
      signal: AbortSignal.timeout(20000),
    });
  } catch { r = null; }
  if (!r || !r.ok) return { parti: false, raison: `github ${r ? r.status : 'réseau'}` };
  const d = await r.json();
  await lire(`UPDATE commandes SET etat = 'en_cours', confie_le = now(), ticket = $2, reponse = $3 WHERE id = $1`,
    [c.id, d.number, `Confié à Claude (ticket n°${d.number}, prochain passage ${PASSAGES}) : ${d.html_url}`]);
  await lire(`INSERT INTO journal(acteur, changement, motif) VALUES ('prestataire', $1, $2)`, [`Ordre n°${c.id} confié à Claude (ticket ${d.number})`, String(c.texte).slice(0, 300)]);
  return { parti: true, id: c.id, ticket: d.number };
}

// Le compte rendu livré (jarvis/ordres/<n°>.md) clôt l'ordre ; sans nouvelles en 4 jours, il revient à Basile.
async function suivre() {
  for (const c of await lire(`SELECT id, confie_le FROM commandes WHERE etat = 'en_cours' AND pour = 'routine'`)) {
    const f = path.join(COMPTES_RENDUS, `${c.id}.md`);
    if (fs.existsSync(f)) {
      await lire(`UPDATE commandes SET etat = 'faite', traite_le = now(), reponse = $2 WHERE id = $1`, [c.id, fs.readFileSync(f, 'utf8').slice(0, 4000)]);
    } else if (c.confie_le && Date.now() - new Date(c.confie_le).getTime() > 4 * 86400e3) {
      await lire(`UPDATE commandes SET etat = 'a_faire', pour = 'claude', reponse = coalesce(reponse, '') || ' [aucun compte rendu livré en 4 jours]' WHERE id = $1`, [c.id]);
    }
  }
}

function demarrer() {
  let file = preparer().catch(() => {});
  setInterval(() => { file = file.then(() => confier()).then(() => suivre()).catch(() => {}); }, 5 * 60_000);
}

module.exports = { POUR_CLAUDE, CONFIER_ORDRE, noter, confier, suivre, preparer, confierOrdreExistant, demarrer, MAX_JOUR, COMPTES_RENDUS, PASSAGES };
