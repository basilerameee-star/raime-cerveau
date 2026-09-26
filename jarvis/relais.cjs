// LES MAINS — le relais Jarvis → Hermes. Un ordre à la fois, sur les modèles gratuits d'Hermes (Gemini, puis le local), résistant aux
// redémarrages : un ordre en cours se conclut par son fichier de résultat, ou par ce qu'il a produit.
// Un ordre qui échoue reste visible avec sa raison ; Basile le relance d'un geste dans le Cockpit.
'use strict';

const fs = require('fs');
const path = require('path');
const { lire } = require('./bases.cjs');

const EXECUTANT = process.env.EXECUTANT_URL || 'http://harness:8201';
const LIVRABLES = process.env.LIVRABLES_DIR || '/travail';
const ADRESSE = process.env.COCKPIT_ADRESSE || 'https://cockpit.raime.fr';
let occupe = false;

// Conclure : réussite = faite ; échec = bloqué avec la raison (pour = 'claude') ; rien (null) = à refaire une fois.
async function conclure(id, d) {
  if (!d) {
    await lire(`UPDATE commandes SET etat = 'a_faire', pour = CASE WHEN coalesce(reponse, '') LIKE '%[relance]%' THEN 'claude' ELSE 'harness' END,
      reponse = coalesce(reponse, '') || ' [relance]' WHERE id = $1 AND etat = 'en_cours'`, [id]);
    return;
  }
  const ok = d.code === 0 && !!d.sortie;
  const r = await lire(`UPDATE commandes SET etat = $2, pour = $3, reponse = $4, traite_le = now() WHERE id = $1 AND etat = 'en_cours' RETURNING id`,
    [id, ok ? 'faite' : 'a_faire', ok ? 'harness' : 'claude',
     ok ? String(d.sortie).slice(-4000) : `Hermes n'a pas abouti (code ${d.code}). ${String(d.trace || d.erreur || '').slice(-400)}`]);
  if (r.length) await lire(`INSERT INTO journal(acteur, changement, motif) VALUES('executant', $1, $2)`,
    [`Ordre n°${id} ${ok ? `fait${d.duree_s ? ` en ${d.duree_s} s` : ''}` : 'bloqué'}`, String(ok ? d.sortie : d.trace || '').slice(-400)]);
}

// Relancer un ordre bloqué (bouton du Cockpit).
async function relancer(id) {
  const r = await lire(`UPDATE commandes SET etat = 'a_faire', pour = 'harness', reponse = coalesce(reponse, '') || ' [relancé par Basile]'
    WHERE id = $1 AND etat = 'a_faire' AND pour = 'claude' RETURNING id`, [id]);
  return r.length > 0;
}

function consigne(c) {
  return `Tu es les mains du cerveau rAIme (le cabinet de conseil en IA de Basile Ramé). Tu as Internet, GitHub, git, npm, pnpm, pip, Python 3 et Node 22 : `
    + `cherche, clone, installe, construis, teste et fais tourner ce qu'il faut, dans le dossier courant. Crée le sous-dossier demande-${c.id} et mets-y tout ton travail. `
    + `Une application web se livre construite et prête à ouvrir : demande-${c.id}/app/index.html (fichiers statiques, chemins relatifs) ; elle sera visible à ${ADRESSE}/livrables/demande-${c.id}/app/index.html. `
    + `Le code du cerveau est en lecture seule dans /cerveau. Pour l'améliorer : copie-le dans demande-${c.id}/cerveau (sans node_modules), git init, git add -A, git commit AVANT toute modification ; modifie ; ajoute un test tests/cas_figes_<sujet>.mjs ; lance les tests ; puis git diff > ../changement.diff et écris ../changement.md (première ligne : un titre court). `
    + `EXIGENCE PREMIUM : un travail fini, pas une ébauche. Tes compétences font foi : pour un site, une page ou une application, suis « site-premium » (3D temps réel, parallaxe, animations, captures sur ordinateur et téléphone, note sur 10, rien sous 8) ; pour la marque rAIme, « charte-raime » ; pour le style d'une interface, « ui-ux-pro-max » (sa base de styles, avec scripts/search.py) ; `
    + `pour tout ce qui touche au marketing (textes de vente, SEO, publicité, e-mails, lancement, prix, réseaux sociaux), les compétences « marketing » ; `
    + `pour une vidéo générée par le code, « remotion » ; pour tout texte destiné à des humains, relis-le avec « stop-slop » (aucun tic d'IA) ; `
    + `pour garder tes échanges courts et économes, « context-engineering ». `
    + `Si une compétence manque, cherche la meilleure méthode (dépôts reconnus, documentation officielle), fais-la, puis écris la compétence (du texte seulement, jamais de secret). `
    + `Avant de répondre, vérifie pour de vrai : le code s'exécute sans erreur, les tests passent, l'affichage tient sur ordinateur et téléphone, aucune donnée ni aucun prix inventé. `
    + `N'écris jamais une clé ou un mot de passe dans un fichier ni dans ta réponse. Ce que tu ne peux pas faire : publier, envoyer à des personnes, payer. `
    + `Ta réponse finale ne contient QUE le compte rendu, en français : trois phrases au plus, ce que tu as fait, où est le résultat (avec l'adresse), ce qui reste.\n\nDemande de Basile : ${c.texte}`;
}

async function relayer({ fetch = globalThis.fetch } = {}) {
  if (occupe) return;
  occupe = true;
  try {
    if (fs.existsSync(path.join(LIVRABLES, '.maintenance'))) return;
    const sante = await fetch(EXECUTANT + '/sante', { signal: AbortSignal.timeout(5000) }).then((r) => r.json()).catch(() => null);
    if (!sante) return;
    for (const e of await lire(`SELECT id FROM commandes WHERE etat = 'en_cours' AND pour = 'harness'`)) {
      const dossier = path.join(LIVRABLES, `demande-${e.id}`), fichier = path.join(dossier, '.resultat.json');
      if (fs.existsSync(fichier)) { await conclure(e.id, JSON.parse(fs.readFileSync(fichier, 'utf8'))); continue; }
      if (sante.etat === 'libre') {
        const plein = fs.existsSync(dossier) && fs.readdirSync(dossier).length > 0;
        await conclure(e.id, plein ? { code: 0, sortie: `Travail terminé ; son compte rendu s'est perdu pendant un redémarrage. Les résultats sont ici : ${ADRESSE}/livrables/demande-${e.id}/` } : null);
      }
    }
    if (sante.etat !== 'libre' || (await lire(`SELECT 1 FROM commandes WHERE etat = 'en_cours' AND pour = 'harness'`)).length) return;
    // Les ordres tombés faute de crédit avant le passage au sans-frais (26/09) reviennent à Hermes, une fois.
    await lire(`UPDATE commandes SET pour = 'harness', reponse = reponse || ' [redonnée sans frais]'
      WHERE etat = 'a_faire' AND pour = 'claude' AND reponse ~* '(crédit|credit|402|budget|quota|billing|openrouter)'
      AND traite_le < timestamptz '2026-09-27 00:00+02' AND reponse NOT LIKE '%[redonnée sans frais]%'`);
    const c = (await lire(`UPDATE commandes SET etat = 'en_cours' WHERE id = (SELECT id FROM commandes
      WHERE etat = 'a_faire' AND pour = 'harness' ORDER BY cree_le LIMIT 1) RETURNING id, texte`))[0];
    if (!c) return;
    try {
      const r = await fetch(EXECUTANT + '/tache', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tache: consigne(c), id: c.id }), signal: AbortSignal.timeout(46 * 60_000) });
      if (r.status === 409) { await conclure(c.id, null); return; } // occupé : on attend, on n'abandonne pas
      await conclure(c.id, await r.json());
    } catch (e) { /* fil coupé : l'ordre reste en cours et se conclura au tour suivant */ }
  } catch (e) {
  } finally { occupe = false; }
}

// L'APPRENTISSAGE (voulu par Basile le 25/09/2026) : la nuit (1 h-6 h, Paris), une séance par jour au plus,
// quand la file est vide. Hermes améliore ses compétences à partir de ses échecs et des meilleures sources.
const APPRENTISSAGE = "Apprentissage (séance automatique de la nuit) : 1) relis tes compétences et le journal des ordres des derniers jours (ce qui a échoué, ce qui a été lent, ce qui a déplu) ; "
  + "2) cherche sur GitHub et dans les documentations officielles les meilleures méthodes pour ce que rAIme livre : sites et applications premium, vidéo courte, réseaux sociaux, rédaction en français, et ce qui rapproche de 2 000 € par mois ; "
  + "dépôts reconnus seulement (licence libre, mis à jour récemment) ; 3) améliore au plus trois de tes compétences, ou crée celle qui manque, en y écrivant la source ; du texte seulement, jamais de script ni de secret ; "
  + "4) écris apprentissage.md : ce que tu as appris, ce que tu as changé, pourquoi";
async function apprendre() {
  const h = +new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: 'numeric', hourCycle: 'h23' }).format(new Date());
  if (h < 1 || h >= 6) return;
  const r = (await lire(`SELECT (SELECT count(*) FROM commandes WHERE etat IN ('a_faire', 'en_cours') AND pour = 'harness')::int AS file,
    (SELECT count(*) FROM commandes WHERE texte LIKE 'Apprentissage (séance%' AND cree_le > now() - interval '20 hours')::int AS recente`))[0];
  if (!r || r.file || r.recente) return;
  await lire(`INSERT INTO commandes (texte, pour) VALUES ($1, 'harness')`, [APPRENTISSAGE]);
}

function demarrer() {
  setInterval(() => { relayer().catch(() => {}); }, 30_000);
  setInterval(() => { apprendre().catch(() => {}); }, 10 * 60_000);
}

module.exports = { demarrer, relayer, relancer, conclure, consigne, LIVRABLES };
