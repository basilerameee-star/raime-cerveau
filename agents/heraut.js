// AGENT HÉRAUT — rédaction des e-mails de prospection.
// Angle : obligation AI Act art.4 (formation IA documentée), sanctions applicables depuis le 2 août 2026.
//
// PRINCIPE : le modèle rédige, mais c'est le CODE qui juge. Les fautes qui ont tué
// les 152 premiers e-mails sont rendues structurellement impossibles.
import { ask, db, logRun, money, instructionActive } from './lib.js';
import pg from 'pg';

const PROMPT_VERSION = 'heraut-v2-aiact';

// ————— GARDE-FOUS DÉTERMINISTES —————
const INTERDITS = [
  /intelligence artificielle qui (écrit|rédige)/i,
  /je suis une (ia|intelligence artificielle)/i,
  /\bagent (ia|déployé)/i,
  /écrit par une ia/i,
  /\bamy\b/i,
  /automatis(er|ation) vos/i,      // on ne vend plus d'automatisation
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u,  // emoji
];

function distance(a, b) {           // Levenshtein compact
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++)
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
// Refuse toute variante mal orthographiee du nom de l'organisation (ex: NOVANCES -> "Nouances")
function nomMalmene(corps, nomOrga) {
  const mots = String(nomOrga || '').split(/[^A-Za-zÀ-ÿ]+/).filter(w => w.length > 4).map(w => w.toLowerCase());
  const tokens = corps.split(/[^A-Za-zÀ-ÿ]+/).filter(w => w.length > 4).map(w => w.toLowerCase());
  for (const m of mots) for (const t of tokens) {
    const d = distance(m, t);
    // Le pluriel et le singulier d'un même mot ne sont pas une faute : « transport routier »
    // dans un message adressé aux « Transports Vallet » faisait refuser un message juste.
    if (d === 1 && (m === `${t}s` || t === `${m}s`)) continue;
    if (d > 0 && d <= 2) return `nom de l'organisation mal orthographié ("${t}" au lieu de "${m}")`;
  }
  return null;
}

export function valider(objet, corps, nomOrga) {
  const erreurs = [];
  const t = `${objet}\n${corps}`;
  for (const re of INTERDITS) if (re.test(t)) erreurs.push(`formulation interdite : ${re}`);
  if (!/Basile Ramé/.test(corps)) erreurs.push('signature « Basile Ramé » absente');
  // CONTRADICTION LEVÉE LE 2026-09-23 : la consigne interdit toute question de clôture
  // (« deux demandes successives diluent ») et le code en exigeait une. Résultat : trois
  // messages sur quatre refusés pour « aucune question posée », alors qu'ils portaient
  // la bonne demande. Une demande claire suffit : une question, ou l'offre du premier regard.
  if (!/\?/.test(corps) && !/premier regard sous 48 heures/.test(corps))
    erreurs.push('aucune demande claire : ni question, ni offre du premier regard');
  if ((corps.match(/\?/g) || []).length > 1) erreurs.push('plusieurs questions : une seule demande par message');
  if (corps.length > 1300) erreurs.push(`trop long (${corps.length} caractères, max 1300)`);
  if (corps.length < 250) erreurs.push('trop court');
  if (!objet || objet.length > 80) erreurs.push('objet absent ou trop long');
  const mn = nomMalmene(corps, nomOrga); if (mn) erreurs.push(mn);
  if (/https?:\/\//.test(corps)) erreurs.push('lien cliquable présent (nuit à la délivrabilité du 1er contact)');
  if (!/raime\.fr/.test(corps)) erreurs.push('site raime.fr absent de la signature');
  if (!/premier regard sous 48 heures/.test(corps)) erreurs.push('offre du premier regard absente : le message doit demander un devis, pas seulement un rendez-vous');
  if (/audit gratuit|audit offert/i.test(corps)) erreurs.push('« audit gratuit » promet le produit complet : ce qui est offert est un premier regard');
  if (/OPCO|Qualiopi/i.test(corps)) erreurs.push('mention OPCO/Qualiopi interdite (certification non obtenue)');
  if (/CPF|compte personnel de formation/i.test(corps)) erreurs.push('mention du CPF interdite en prospection à froid (loi du 19 décembre 2022)');
  if (/\d\s?(€|euros)/i.test(corps)) erreurs.push('prix annoncé dans un premier contact : à réserver à la réponse');
  // « Madame, Monsieur, » est justement la formule neutre attendue : seule une civilité
  // SEULE trahit un genre deviné. L'ancienne règle refusait la bonne formulation.
  if (/^\s*(Madame|Monsieur|Cher|Chère)\s*,(?!\s*(Madame|Monsieur))/i.test(corps))
    erreurs.push('civilité genrée devinée sur un destinataire inconnu : écrire « Madame, Monsieur, »');
  return erreurs;
}

export const SYSTEM = `Tu rédiges un e-mail de premier contact B2B pour Basile Ramé, fondateur de rAIme,
cabinet de conseil et d'audit IA indépendant.

ANGLE UNIQUE — la conformité :
L'article 4 de l'AI Act ("maîtrise de l'IA") s'applique depuis le 2 février 2025 à toute organisation
qui déploie un système d'IA — utiliser ChatGPT ou Copilot suffit à être concerné. Elle doit assurer ET
DOCUMENTER la formation de son personnel aux usages, limites et risques. Depuis le 2 août 2026, les
sanctions nationales sont applicables.
rAIme est un CABINET DE CONSEIL EN INTÉGRATION D'IA : nous n'installons rien et ne vendons aucune
technologie — nous aidons à choisir la bonne IA, et à le prouver. Nous formons les équipes et remettons
le dossier de preuve. INTERDICTION ABSOLUE — ne mentionne JAMAIS le CPF, ni aucun dispositif de financement,
ni le prix, dans un premier contact. La loi du 19 décembre 2022 interdit la prospection
commerciale promouvant des formations éligibles au CPF. Le financement ne se dit qu'en
RÉPONSE à une question du prospect. Ton message parle de l'obligation et du risque,
jamais de l'argent.

RÈGLES ABSOLUES :
- Tu écris À LA PLACE de Basile, à la première personne. Signature : "Basile Ramé — rAIme".
- Tu ne mentionnes JAMAIS qu'une IA a rédigé ce message.
- Tu ne vends PAS d'automatisation : rAIme conseille et audite, il ne construit pas.
- Tu formules UNE SEULE demande, et c'est l'offre du premier regard ci-dessous. Aucune
  question de clôture ne s'y ajoute : la consigne se contredisait, et le code refusait.
- Aucun lien, aucun emoji, aucun superlatif, aucune flatterie.
- 6 à 10 lignes maximum. Ton sobre, professionnel, direct.
- AVANT la signature, tu places TOUJOURS cette offre, mot pour mot :
Si une proposition d'un prestataire est actuellement sur votre bureau, vous pouvez me l'envoyer : je vous rends un premier regard sous 48 heures, sans frais. C'est la façon la plus simple de juger notre travail avant d'en parler.
  C'est le coeur du message : on ne demande pas un rendez-vous, on demande UN DOCUMENT.
  UNE SEULE demande par courriel. Cette offre EST l'appel a l'action : tu n'ajoutes donc
  AUCUNE autre question de cloture, ni « souhaitez-vous une proposition », ni « seriez-vous
  disponible ». Deux demandes successives diluent, et le prospect ne repond ni a l'une ni
  a l'autre.
  Un devis recu ouvre la conversation ET nourrit notre chaine d'audit. N'ecris jamais
  « audit gratuit » : ce qui est offert est un PREMIER REGARD, pas un audit complet.
- Tu termines par la signature exacte :
Basile Ramé — rAIme

rAIme — cabinet de conseil en intégration d'IA.
Nous n'installons rien : nous aidons à choisir la bonne, et à le prouver.
raime.fr
- Une phrase doit ancrer le message dans le métier précis du destinataire.
- Registre factuel : tu informes d'une obligation et proposes d'y répondre. Tu ne fais pas peur.

Tu n'écris QUE LE CORPS de l'e-mail, en texte brut, sans objet, sans balise, sans guillemets.
Tu n'écris JAMAIS le nom de l'organisation destinataire (risque d'orthographe erronée) :
désigne-la par "votre cabinet", "votre organisme", "votre structure".`;


// ── ROUTAGE DU DESTINATAIRE ─────────────────────────────────────────────────
// Le registre legal renseigne souvent une PERSONNE MORALE comme dirigeant (le cabinet
// comptable, le commissaire aux comptes). Ecrire "Bonjour Cogera Expertise" detruit la
// credibilite des la premiere ligne. On tranche donc en CODE, sans expression reguliere :
// une liste de mots est lisible, verifiable, et ne casse pas a l'echappement.
const MOTS_SOCIETE = [
  'SAS','SARL','SASU','EURL','SCP','SELARL','SELAS','SCI','GIE','SNC','SA',
  'EXPERTISE','EXPERT','CONSEIL','AUDIT','GROUPE','CABINET','ASSOCIES','ASSOCIÉS',
  'COMPTA','COMPTABLE','FIDUCIAIRE','HOLDING','FINANCE','GESTION','PARTNERS','PARTICIPATIONS',
  'CONSULTING','TILLY','MAZARS','KPMG','DELOITTE','SOFRACO','COGERA','EUREX',
  'UNIVERSE','FORMATION','SOLUTIONS','SERVICES','DEVELOPPEMENT','DÉVELOPPEMENT','INVEST',
  'IMMO','TECH','DIGITAL','ACADEMY','ACADEMIE','ACADÉMIE','INSTITUT','CENTRE','ECOLE','ÉCOLE',
  'SANTE','SANTÉ','FRANCE','INTERNATIONAL','PRESTATIONS','ENTREPRISE','SOCIETE','SOCIÉTÉ',
];

const decouper = (s) => String(s || '').toUpperCase().split(/[^A-ZÀ-Ÿ]+/).filter(Boolean);

export function nomExploitable(brut, raisonSociale) {
  const n = String(brut || '').trim();
  if (!n) return null;

  // Deux decoupages distincts : les tirets separent des MOTS pour la comparaison,
  // mais pas des NOMS pour l'affichage (Jean-Marc Dussolliet-Berthod est un seul prenom
  // et un seul nom). Confondre les deux produisait "Jean Berthod".
  const mots = decouper(n);                                  // pour comparer
  const noms = n.trim().split(/\s+/);                        // pour afficher
  if (noms.length < 2 || noms.length > 4) return null;       // ni mono-mot ni raison sociale
  if (mots.some((m) => MOTS_SOCIETE.includes(m))) return null;
  if (/[0-9&]/.test(n)) return null;

  // Test decisif : si le pretendu dirigeant partage un mot significatif avec la raison
  // sociale, c'est la societe elle-meme. Renoncer a nommer coute moins cher que se tromper.
  const motsSociete = new Set(decouper(raisonSociale).filter((m) => m.length > 3));
  if (mots.some((m) => motsSociete.has(m))) return null;

  // Le registre liste tous les prenoms : on garde prenom + nom, comme on s'adresse a quelqu'un.
  const garde = noms.length > 2 ? [noms[0], noms[noms.length - 1]] : noms;
  const cap = (m) => m.split('-').map((x) => x[0].toUpperCase() + x.slice(1).toLowerCase()).join('-');
  return garde.map(cap).join(' ');
}

// Une boite d'accueil n'a aucune raison de faire suivre un message : il faut le lui DEMANDER.
const PREFIXES_GENERIQUES = ['contact','info','infos','accueil','secretariat','bonjour','hello',
  'mail','courrier','admin','office','cabinet','agence','direction','siege','etude','scp',
  'assistance','administration','commercial','service'];

export function estBoiteGenerique(email) {
  const local = String(email || '').split('@')[0].toLowerCase();
  return PREFIXES_GENERIQUES.some((p) => local.startsWith(p));
}

// L'en-tete de routage : compose par le code, jamais par le modele.
export function enteteRoutage(email, dirigeantBrut, raisonSociale) {
  if (!estBoiteGenerique(email)) return null;   // on parle deja a la bonne personne
  const nom = nomExploitable(dirigeantBrut, raisonSociale);
  return nom
    ? `À l'attention de ${nom}, direction — merci de lui transmettre ce message.`
    : `À l'attention de la direction — merci de transmettre : il s'agit d'une obligation de formation qui engage personnellement le dirigeant.`;
}

export async function rediger({ prospect, playbook, brain, n8n }) {
  // Le prompt vit en base : si le Reflexif a fait valider une amelioration, elle s'applique
  // immediatement, sans redeploiement. Sinon on tourne sur le prompt d'origine.
  const amelioration = await instructionActive(brain, 'heraut');
  const systemeActif = amelioration
    ? `${SYSTEM}

## AMÉLIORATION EN VIGUEUR (v${amelioration.version})
${amelioration.instruction}`
    : SYSTEM;

  const contexteSecteur = playbook
    ? `Secteur : ${playbook.secteur}. Contexte : ${playbook.contexte} Contraintes réglementaires : ${(playbook.reglementation || []).join(', ')}.`
    : `Secteur : ${prospect.sector || 'non précisé'}.`;

  const user = `Destinataire :
- Organisation : ${prospect.name}
- Secteur : ${prospect.sector || '—'}
- Ville : ${prospect.city || '—'}
- Dirigeant : ${prospect.dirigeant || '(inconnu — ne pas inventer de prénom, écrire "Bonjour,")'}

${contexteSecteur}

Rédige l'e-mail.`;

  // L'OBJET est composé par le CODE : aucune orthographe inventée possible.
  const objet = 'Formation IA : obligation applicable depuis le 2 août';
  let corps = '', erreurs = [], meta = null, meilleur = null;
  for (let essai = 1; essai <= 2; essai++) {
    const consigne = essai === 1 ? user
      : `${user}\n\nTON BROUILLON PRÉCÉDENT A ÉTÉ REFUSÉ pour : ${erreurs.join(' ; ')}. Corrige-le.`;
    const r = await ask({ task: 'redaction', system: systemeActif, user: consigne, json: false, maxTokens: 1500, temperature: 0.4 });
    meta = r;
    corps = String(r.text || '').replace(/^```[a-z]*|```$/gm, '').trim();
    erreurs = valider(objet, corps, prospect.name);
    // On garde le MEILLEUR brouillon, pas le dernier. Mesure du 2026-09-23 : la reprise
    // après refus rend souvent un texte plus fautif que le premier jet, et la maison
    // jetait alors un message presque bon. Un essai qui empire ne remplace plus rien.
    if (!meilleur || erreurs.length < meilleur.erreurs.length) meilleur = { corps, erreurs };
    if (!erreurs.length) break;
  }
  if (meilleur && meilleur.erreurs.length < erreurs.length) ({ corps, erreurs } = meilleur);

  // L'en-tete de routage est ajoute par le CODE, apres validation : le modele n'a pas son
  // mot a dire sur le destinataire. 8 messages sur 10 arrivent sur une boite d'accueil qui
  // n'a aucune raison de les transmettre — sauf si on le lui demande explicitement.
  const entete = enteteRoutage(prospect.contact_email, prospect.dirigeant, prospect.name);
  if (entete && !erreurs.length) corps = entete + '\n\n' + corps;

  const status = erreurs.length ? 'refuse' : 'brouillon';
  if (!erreurs.length) {
    await n8n.query(
      `INSERT INTO outreach(siren, prospect_name, segment, to_email, subject, body, status, created_at)
       VALUES($1,$2,$3,$4,$5,$6,'brouillon',now())`,
      [prospect.siren, prospect.name, prospect.sector, prospect.contact_email, objet, corps]);
  }
  await logRun(brain, { agent: 'heraut', task: 'redaction', model: meta.model, tokensIn: meta.tokensIn,
    tokensOut: meta.tokensOut, costUsd: meta.costUsd, ms: meta.ms, status, promptVersion: PROMPT_VERSION });

  return { objet, corps, erreurs, cout: money(meta.costUsd), status };
}

// CLI : node agents/heraut.js [nombre] [secteur]
if (import.meta.url === `file://${process.argv[1]}`) {
  const n = parseInt(process.argv[2] || '5', 10);
  const secteur = process.argv[3] || null;
  const brain = db(); await brain.connect();
  const n8n = new pg.Client({ connectionString: process.env.DATABASE_URL_N8N }); await n8n.connect();
  try {
    const { rows: prospects } = await n8n.query(
      `SELECT siren, name, sector, city, dirigeant, contact_email FROM prospects
       WHERE contact_email IS NOT NULL AND contact_email <> ''
         AND NOT EXISTS (SELECT 1 FROM outreach o WHERE o.siren = prospects.siren)
         ${secteur ? 'AND sector = $2' : ''}
       ORDER BY score DESC NULLS LAST LIMIT $1`,
      secteur ? [n, secteur] : [n]);
    console.log(`${prospects.length} prospect(s) sélectionné(s)\n`);
    let total = 0, ok = 0;
    for (const p of prospects) {
      const { rows: pb } = await brain.query(
        `SELECT secteur, contexte, reglementation FROM sector_playbooks
         WHERE secteur ILIKE '%'||$1||'%' OR $1 ILIKE '%'||split_part(secteur,' ',1)||'%' LIMIT 1`,
        [p.sector || '']);
      const r = await rediger({ prospect: p, playbook: pb[0], brain, n8n });
      total += parseFloat(r.cout);
      if (r.status === 'brouillon') { ok++;
        console.log(`✓ ${p.name} (${p.sector})\n  OBJET : ${r.objet}\n  ${r.corps.split('\n').filter(Boolean).slice(0,3).join('\n  ')}\n`);
      } else {
        console.log(`✗ ${p.name} — REFUSÉ : ${r.erreurs.join(' ; ')}\n`);
      }
    }
    console.log(`${'═'.repeat(56)}\n${ok}/${prospects.length} brouillons validés · coût ${total.toFixed(4)} $`);
  } finally { await brain.end(); await n8n.end(); }
}
