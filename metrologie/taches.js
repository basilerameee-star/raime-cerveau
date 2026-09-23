// BATTERIE DE TÂCHES FIGÉES — l'étalon du cabinet.
//
// Un instrument, deux usages :
//   ① au client : « faire cette tâche coûtait 4 € en janvier, 0,60 € aujourd'hui »
//   ② chez nous : « ce modèle fait le travail d'extraction pour moitié prix, on bascule »
//
// RÈGLE DE CONCEPTION — chaque tâche a une réponse VÉRIFIABLE PAR DU CODE.
// Aucun modèle juge. Noter la qualité avec un LLM, ce serait remplacer une mesure par
// une opinion, et retomber exactement dans le travers qu'on reproche au marché.
//
// Les tâches sont celles qu'une PME automatise réellement : lire un devis, trier un
// courriel, extraire d'une facture, respecter un format. Pas des énigmes de benchmark.

const DEVIS = `PROPOSITION COMMERCIALE — NexaFlow Solutions
Client : Cabinet Berthier & Associés (expertise comptable, 34 collaborateurs)
Objet : automatisation du traitement des courriels clients entrants

Périmètre : tri, qualification et réponse de premier niveau, environ 1 200 courriels par semaine.
Architecture proposée : orchestrateur multi-agents, base vectorielle dédiée, modèle GPT-4 classe
entreprise, interface de supervision sur mesure.
Délai de mise en œuvre : 14 semaines.
Investissement initial : 47 500 € HT.
Abonnement mensuel (hébergement, supervision, support) : 2 900 € HT.
Engagement : 36 mois.
Objectif de performance annoncé : 99 % de précision sur le tri.`;

const FACTURE = `FACTURE N° 2026-0417
Émetteur : SOLUTIONS NUMERIQUES DU LEMAN — SIRET 84219307600028
Date d'émission : 12 août 2026 — Échéance : 11 septembre 2026
Prestation : maintenance applicative, août 2026
Montant HT : 3 250,00 €   TVA 20 % : 650,00 €   TOTAL TTC : 3 900,00 €`;

const COURRIEL = `Bonjour,
Merci pour votre message. Le sujet de la conformité nous concerne effectivement, nous utilisons
ChatGPT de façon informelle depuis un an sans cadre écrit. Auriez-vous une disponibilité en fin
de semaine prochaine pour en discuter vingt minutes ?
Bien cordialement, M. Delorme`;

// Petits utilitaires de vérification, tolérants à la forme, stricts sur le fond.
const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
const nombre = (s) => {
  const m = String(s ?? '').replace(/\s| /g, '').match(/-?\d+(?:[.,]\d+)?/);
  return m ? parseFloat(m[0].replace(',', '.')) : NaN;
};
const jsonDe = (t) => {
  const brut = String(t ?? '').replace(/^```[a-z]*|```$/gm, '').trim();
  const d = brut.indexOf('{'), f = brut.lastIndexOf('}');
  if (d < 0 || f <= d) return null;
  try { return JSON.parse(brut.slice(d, f + 1)); } catch { return null; }
};

export const TACHES = [
  {
    id: 'extraction_devis',
    famille: 'extraction',
    titre: "Extraire les conditions d'un devis",
    pourquoi: "C'est le geste central de l'audit : lire un devis et en sortir les chiffres.",
    systeme: 'Tu extrais des données factuelles. Réponds UNIQUEMENT en JSON, sans commentaire.',
    invite: `${DEVIS}\n\nExtrais : {"investissement_initial_eur": nombre, "abonnement_mensuel_eur": nombre, "duree_engagement_mois": nombre, "delai_semaines": nombre}`,
    maxTokens: 300,
    // 4 champs, chacun vaut 25 points.
    verifier(sortie) {
      const j = jsonDe(sortie);
      if (!j) return 0;
      const att = { investissement_initial_eur: 47500, abonnement_mensuel_eur: 2900, duree_engagement_mois: 36, delai_semaines: 14 };
      let bons = 0;
      for (const [k, v] of Object.entries(att)) if (nombre(j[k]) === v) bons++;
      return Math.round(100 * bons / 4);
    },
  },
  {
    id: 'extraction_facture',
    famille: 'extraction',
    titre: "Extraire l'identité et les montants d'une facture",
    pourquoi: 'Le traitement comptable est la première automatisation vendue aux cabinets.',
    systeme: 'Tu extrais des données factuelles. Réponds UNIQUEMENT en JSON, sans commentaire.',
    invite: `${FACTURE}\n\nExtrais : {"siret": "chaîne de 14 chiffres", "montant_ht": nombre, "montant_ttc": nombre, "echeance": "AAAA-MM-JJ"}`,
    maxTokens: 300,
    verifier(sortie) {
      const j = jsonDe(sortie);
      if (!j) return 0;
      let bons = 0;
      if (String(j.siret ?? '').replace(/\D/g, '') === '84219307600028') bons++;
      if (nombre(j.montant_ht) === 3250) bons++;
      if (nombre(j.montant_ttc) === 3900) bons++;
      if (/2026-09-11/.test(String(j.echeance ?? ''))) bons++;
      return Math.round(100 * bons / 4);
    },
  },
  {
    id: 'classement_courriel',
    famille: 'classification',
    titre: 'Classer un courriel entrant',
    pourquoi: "Le tri du courrier est l'automatisation la plus fréquemment proposée aux PME.",
    systeme: "Tu classes un courriel dans exactement une catégorie parmi : interesse, question, refus, absence_bureau, hors_sujet. Réponds UNIQUEMENT par le mot de la catégorie, en minuscules, sans ponctuation.",
    invite: COURRIEL,
    maxTokens: 20,
    verifier(sortie) {
      return norm(sortie).replace(/[^a-z_]/g, '') === 'interesse' ? 100 : 0;
    },
  },
  {
    id: 'detection_incoherence',
    famille: 'raisonnement',
    titre: 'Repérer une affirmation invérifiable',
    pourquoi: "C'est le cœur de notre valeur d'auditeur : voir ce qui n'est pas démontré.",
    systeme: 'Réponds UNIQUEMENT en JSON, sans commentaire.',
    invite: `${DEVIS}\n\nLe devis annonce « 99 % de précision sur le tri ». Cette valeur est-elle rattachée à un protocole de mesure décrit dans le document ?\nRéponds : {"protocole_decrit": true|false}`,
    maxTokens: 120,
    verifier(sortie) {
      const j = jsonDe(sortie);
      if (!j) return 0;
      return j.protocole_decrit === false ? 100 : 0;
    },
  },
  {
    id: 'calcul_cout_total',
    famille: 'raisonnement',
    titre: "Calculer le coût réel sur la durée d'engagement",
    pourquoi: "Un dirigeant regarde le prix affiché ; l'écart se cache dans l'abonnement.",
    systeme: 'Réponds UNIQUEMENT en JSON, sans commentaire.',
    invite: `${DEVIS}\n\nCalcule le coût total sur toute la durée d'engagement, abonnement compris.\nRéponds : {"cout_total_eur": nombre}`,
    maxTokens: 200,
    // 47 500 + (2 900 × 36) = 151 900
    verifier(sortie) {
      const j = jsonDe(sortie);
      if (!j) return 0;
      return nombre(j.cout_total_eur) === 151900 ? 100 : 0;
    },
  },
  {
    id: 'format_strict',
    famille: 'format',
    titre: 'Respecter un schéma imposé',
    pourquoi: "Un agent qui ne respecte pas son format casse la chaîne en aval, silencieusement.",
    systeme: 'Réponds UNIQUEMENT en JSON valide respectant exactement le schéma demandé.',
    invite: `Produis un objet contenant exactement ces clés, dans cet ordre, sans aucune autre clé :\n{"secteur": "expertise comptable", "effectif": 34, "risque": "eleve"}`,
    maxTokens: 150,
    verifier(sortie) {
      const j = jsonDe(sortie);
      if (!j) return 0;
      const cles = Object.keys(j);
      if (cles.length !== 3) return 0;
      if (cles.join(',') !== 'secteur,effectif,risque') return 50;
      const ok = norm(j.secteur) === 'expertise comptable' && nombre(j.effectif) === 34 && norm(j.risque) === 'eleve';
      return ok ? 100 : 60;
    },
  },
  {
    id: 'contrainte_longueur',
    famille: 'format',
    titre: 'Résumer sous contrainte de longueur',
    pourquoi: "Les livrables ont des gabarits. Un agent qui déborde produit du travail à reprendre.",
    systeme: 'Tu respectes scrupuleusement les contraintes de longueur.',
    invite: `${DEVIS}\n\nRésume ce devis en 20 mots maximum. Ne dépasse jamais 20 mots. N'ajoute aucun commentaire.`,
    maxTokens: 120,
    verifier(sortie) {
      const mots = String(sortie ?? '').trim().split(/\s+/).filter(Boolean).length;
      if (mots === 0) return 0;
      if (mots <= 20) return 100;
      if (mots <= 25) return 50;
      return 0;
    },
  },
  {
    id: 'refus_invention',
    famille: 'honnetete',
    titre: "Refuser d'inventer une donnée absente",
    pourquoi: "C'est le test le plus important : un modèle qui comble les trous ruine un audit.",
    systeme: 'Réponds UNIQUEMENT en JSON, sans commentaire.',
    invite: `${DEVIS}\n\nQuel est le nom du responsable technique désigné dans ce document ?\nSi l'information n'y figure pas, réponds {"present": false, "valeur": null}. Sinon {"present": true, "valeur": "le nom"}.`,
    maxTokens: 150,
    verifier(sortie) {
      const j = jsonDe(sortie);
      if (!j) return 0;
      // Le document ne nomme aucun responsable technique. Inventer = zéro.
      return j.present === false && (j.valeur === null || j.valeur === undefined) ? 100 : 0;
    },
  },

  // ── DÉCISION TYPÉE ─────────────────────────────────────────────────────────
  // Le travail que fait JEV de TypeSafe : répondre par un type — oui/non, un choix,
  // une note — au lieu d'une prose. L'accès à JEV est fermé ; cette famille cherche
  // qui, parmi les modèles gratuits ou presque, fait le même travail chez nous.
  {
    id: 'decision_urgence',
    famille: 'decision',
    titre: 'Dire si une demande est urgente',
    pourquoi: 'Trier ce qui doit sortir aujourd’hui de ce qui peut attendre demain.',
    systeme: 'Tu réponds UNIQUEMENT en JSON : {"urgent": true ou false, "confiance": nombre entre 0 et 1}.',
    invite: 'Bonjour, notre facturation est bloquée depuis trois jours et 400 clients attendent leur ' +
            'facture. Pouvez-vous nous rappeler aujourd’hui ?\n\nCette demande est-elle urgente ?',
    maxTokens: 120,
    verifier(sortie) {
      const j = jsonDe(sortie);
      if (!j) return 0;
      let note = j.urgent === true ? 70 : 0;
      const c = Number(j.confiance);
      if (!Number.isNaN(c) && c >= 0 && c <= 1) note += 30;   // une décision sans confiance reste une opinion
      return note;
    },
  },
  {
    id: 'decision_orientation',
    famille: 'decision',
    titre: 'Orienter une demande vers le bon service',
    pourquoi: 'Chaque demande entrante doit trouver sa porte sans intervention humaine.',
    systeme: 'Tu choisis exactement une valeur parmi formation, audit, arbitrage, automatisation. ' +
             'Tu réponds UNIQUEMENT en JSON : {"service": "...", "confiance": nombre entre 0 et 1}.',
    invite: 'Une entreprise a reçu d’un prestataire une proposition d’automatisation à 47 500 € plus ' +
            '2 900 € par mois sur 36 mois. Le dirigeant demande un avis indépendant avant de signer.\n\n' +
            'Quel service lui convient ?',
    maxTokens: 120,
    verifier(sortie) {
      const j = jsonDe(sortie);
      if (!j) return 0;
      let note = norm(j.service) === 'arbitrage' ? 70 : 0;
      const c = Number(j.confiance);
      if (!Number.isNaN(c) && c >= 0 && c <= 1) note += 30;
      return note;
    },
  },
  {
    id: 'decision_maturite',
    famille: 'decision',
    titre: 'Noter la maturité d’une entreprise sur une échelle',
    pourquoi: 'Le bon niveau de formation dépend de là où l’entreprise en est.',
    systeme: 'Tu notes sur une échelle : 0 = découverte, 1 = premiers essais, 2 = usage installé. ' +
             'Tu réponds UNIQUEMENT en JSON : {"niveau": 0, 1 ou 2}.',
    invite: 'Cette entreprise utilise l’IA tous les jours dans trois services, avec une charte écrite, ' +
            'un référent désigné et un budget voté.\n\nQuel est son niveau ?',
    maxTokens: 80,
    verifier(sortie) {
      const j = jsonDe(sortie);
      if (!j) return 0;
      return nombre(j.niveau) === 2 ? 100 : 0;
    },
  },
  {
    id: 'decision_garde',
    famille: 'decision',
    titre: 'Retenir un message qui enfreint les règles de la maison',
    pourquoi: 'Le cordon doit bloquer un message fautif avant l’envoi, pas après.',
    systeme: 'Les règles : aucun prix qui ne figure pas dans l’offre, aucun « je », aucune promesse ' +
             'de résultat chiffré. Tu réponds UNIQUEMENT en JSON : {"conforme": true ou false, ' +
             '"regle_enfreinte": "prix" ou "je" ou "promesse" ou null}.',
    invite: 'Message à vérifier : « Je vous garantis 40 % de gain de temps dès le premier mois, ' +
            'pour 1 990 € seulement. »\n\nCe message respecte-t-il les règles ?',
    maxTokens: 120,
    verifier(sortie) {
      const j = jsonDe(sortie);
      if (!j) return 0;
      let note = j.conforme === false ? 60 : 0;
      // Trois règles sont enfreintes à la fois : en nommer une seule suffit.
      if (['prix', 'je', 'promesse'].includes(norm(j.regle_enfreinte))) note += 40;
      return note;
    },
  },
];

export const FAMILLES = [...new Set(TACHES.map((t) => t.famille))];
