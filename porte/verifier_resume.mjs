// Le résumé pour Basile, jugé par le code : chaque pull request porte en tête une section
// « ## Pour Basile » de cinq lignes au plus, qui dit ce qui change en ligne, ce qu'il
// pourra vendre de nouveau, et comment revenir en arrière. Sans elle, la CI est rouge :
// Basile confirme sur ce résumé, il doit donc exister et rester court.
//
//   PR_CORPS="…" node porte/verifier_resume.mjs
const EXIGES = [
  [/en ligne/i, 'ce qui change en ligne'],
  [/vendre|vendable|achet/i, 'ce qu’il pourra vendre de nouveau'],
  [/revenir en arri[eè]re|retour arri[eè]re/i, 'comment revenir en arrière'],
];

export function verifierResume(corps) {
  const lignes = String(corps || '').replace(/\r/g, '').split('\n');
  const titres = lignes.map((l, i) => [l, i]).filter(([l]) => /^#{1,6}\s/.test(l));
  if (!titres.length || !/^##\s+Pour Basile\b/i.test(titres[0][0]))
    return ['la section « ## Pour Basile » doit être la première de la description'];
  const debut = titres[0][1] + 1;
  const fin = titres[1] ? titres[1][1] : lignes.length;
  const section = lignes.slice(debut, fin).filter((l) => l.trim() && !/^---+$/.test(l.trim()));
  const erreurs = [];
  if (section.length === 0) erreurs.push('la section « Pour Basile » est vide');
  if (section.length > 5) erreurs.push(`la section « Pour Basile » fait ${section.length} lignes, cinq au plus`);
  const texte = section.join('\n');
  for (const [motif, quoi] of EXIGES) if (!motif.test(texte)) erreurs.push(`il manque ${quoi}`);
  return erreurs;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const erreurs = verifierResume(process.env.PR_CORPS);
  if (erreurs.length) {
    for (const e of erreurs) console.error(`✗ ${e}`);
    process.exit(1);
  }
  console.log('✓ résumé pour Basile conforme');
}
