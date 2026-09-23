// GARDE-FOUS DE LA CHAÎNE D'AUDIT — le rapport porte la signature de Basile.
//
// Le Héraut a treize contrôles déterministes ; l'Auditeur n'en avait qu'un, sur la preuve.
// Un courriel maladroit coûte un prospect ; un rapport faux engage une responsabilité
// professionnelle devant un client qui a payé pour de la rigueur.
//
// Aucune de ces règles n'est dans un prompt : un modèle peut ignorer une consigne,
// du code ne le peut pas.
//
// LEÇON PAYÉE — la première version bannissait le mot « garanti » et bloquait 4 de nos
// 6 audits réels, dont leurs meilleurs constats : « l'export des données n'est pas
// garanti », « exiger des garanties de réversibilité ». Un garde-fou qui supprime le
// produit est pire que pas de garde-fou. On interdit donc l'ACTE de promettre, jamais
// le vocabulaire — et les phrases réelles bloquées à tort sont devenues des cas figés.

// Le règlement européen laisse les pénalités de l'article 4 aux États membres. Nous n'avons
// pas vérifié le cadre français : nous n'avançons donc AUCUN montant.
const MONTANT_SANCTION =
  /(amende|sanction|p[ée]nalit[ée])[^.]{0,80}?\d[\d\s.,]*\s?[kmM]?\s?(€|EUR|euros|millions)|\d[\d\s.,]*\s?%[^.]{0,40}chiffre\s*d.{0,2}affaires/i;

// Financements indisponibles tant que Qualiopi n'est pas obtenue.
const FINANCEMENT =
  /\bCPF\b|compte personnel de formation|\bOPCO\b|Qualiopi|France Travail|prise en charge (?:à|a) 100/i;

// Nous vendons un jugement probabiliste. La promesse de résultat est invendable et fausse.
// Noter la précision : « n'est pas garanti » décrit le devis du prestataire et doit passer ;
// « le gain est garanti » est notre promesse et doit être bloqué.
const CERTITUDE =
  /(?:nous|je|rAIme)\s+(?:vous\s+)?garanti(?:s|t|ssons)|(?:r[ée]sultat|gain|[ée]conomies?|succ[èe]s|retour sur investissement|ROI)\s+(?:est|sont|seront)?\s*garanti[es]?|vous\s+(?:allez\s+)?[ée]conomiser(?:ez)?|sans\s+(?:aucun\s+)?risque|(?:c'est|il est)\s+(?:absolument\s+)?certain\b|assur[ée]ment/i;

// On attaque la proposition, jamais la personne. Le reste est diffamatoire.
const DIFFAMATION =
  /\b(escroquerie|arnaque|malhonn[êe]te|incomp[ée]tent|charlatan|abus de confiance|tromperie d[ée]lib[ée]r[ée]e)\b/i;

// rAIme n'a aucun client à ce jour : toute référence serait fabriquée.
const REFERENCE_INVENTEE =
  /\b(nos clients|nos r[ée]f[ée]rences|un (?:de nos )?clients? (?:similaire|comparable)|un cabinet (?:similaire|comparable) (?:que nous|dont nous)|nous avons d[ée]j[àa] accompagn[ée])\b/i;

// Gravité : « bloquant » empêche la livraison, « signalé » accompagne le rapport.
const REGLES = [
  { code: 'sanction_chiffree', bloquant: true, test: MONTANT_SANCTION,
    message: "montant de sanction avancé alors que les pénalités de l'article 4 relèvent des États membres et n'ont pas été vérifiées" },
  { code: 'financement', bloquant: true, test: FINANCEMENT,
    message: "dispositif de financement mentionné alors qu'il exige Qualiopi, non obtenue" },
  { code: 'certitude', bloquant: true, test: CERTITUDE,
    message: 'promesse de résultat formulée comme certaine : un audit produit un jugement, pas une garantie' },
  { code: 'diffamation', bloquant: true, test: DIFFAMATION,
    message: 'jugement porté sur le prestataire et non sur sa proposition' },
  { code: 'reference_inventee', bloquant: true, test: REFERENCE_INVENTEE,
    message: "référence client invoquée alors que rAIme n'en a aucune à ce jour" },
];

// Un constat sans source ni niveau de preuve n'est pas un constat : c'est une affirmation.
function constatsIncomplets(constats) {
  if (!Array.isArray(constats)) return [];
  return constats
    .map((c, i) => {
      const manque = [];
      if (!c.source || String(c.source).trim().length < 3) manque.push('source');
      if (!/^[ABC]$/i.test(String(c.preuve || '').trim())) manque.push('niveau de preuve');
      return manque.length
        ? `constat ${i + 1} (« ${String(c.titre || '').slice(0, 48)} ») sans ${manque.join(' ni ')}`
        : null;
    })
    .filter(Boolean);
}

/** Contrôle un audit avant livraison. */
export function validerAudit(audit) {
  const a = audit || {};
  // On contrôle tout ce que le client lira : constats, recommandation, questions.
  const texte = [
    a.recommandation,
    a.synthese,
    ...(Array.isArray(a.constats) ? a.constats.flatMap((c) => [c.titre, c.constat, c.risque]) : []),
    ...(Array.isArray(a.questions_au_prestataire) ? a.questions_au_prestataire : []),
  ].filter(Boolean).join('\n');

  const violations = [];
  for (const r of REGLES) {
    const m = texte.match(r.test);
    if (m) violations.push({ code: r.code, bloquant: r.bloquant, message: r.message, extrait: String(m[0]).slice(0, 120) });
  }
  for (const inc of constatsIncomplets(a.constats)) {
    violations.push({ code: 'constat_incomplet', bloquant: false, message: inc, extrait: null });
  }

  return { violations, bloquant: violations.some((v) => v.bloquant), texteControle: texte };
}

/** Applique le verdict : un rapport bloqué ne part pas chez le client. */
export function appliquerGardeFous(audit) {
  const v = validerAudit(audit);
  if (!v.violations.length) return { audit, ...v };

  if (v.bloquant) {
    audit.livrable = false;
    audit.motif_blocage = v.violations.filter((x) => x.bloquant).map((x) => x.message).join(' ; ');
    audit.recommandation = `[NON LIVRABLE — GARDE-FOU] ${audit.motif_blocage}. `
      + `Contenu retenu : ${audit.recommandation || '(néant)'}`;
  }
  audit.avertissements = v.violations.filter((x) => !x.bloquant).map((x) => x.message);
  return { audit, ...v };
}
