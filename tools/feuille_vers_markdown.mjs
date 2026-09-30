// La feuille de route en Markdown, depuis sa source unique (jarvis/feuille_de_route.json) : pour le dépôt
// (docs/FEUILLE_DE_ROUTE.md) et pour le coffre Obsidian de Basile.
//   node tools/feuille_vers_markdown.mjs [chemin-supplementaire.md]
import fs from 'node:fs';
import { createRequire } from 'node:module';
const F = createRequire(import.meta.url)('../jarvis/feuille_de_route.json');

const ETATS = { a_faire: 'à faire', en_cours: 'en cours', fait: 'FAIT', attend_basile: 'attend Basile' };

export function versMarkdown(f = F) {
  const pts = [...f.points].sort((a, b) => a.rang - b.rang);
  const ligne = (p) => `| ${p.rang} | ${p.n} | ${p.moteur} | ${p.titre}${p.depend_de ? ` (après ${p.depend_de.map((d) => `n°${d}`).join(', ')})` : ''} | ${p.groupe === 'basile' ? p.il_faut : '—'} | ${p.fini_quand} | ${ETATS[p.etat] || p.etat} |`;
  const tableau = (g) => ['| Rang | N° | Moteur | Point | Il faut de Basile | Fini quand | État |', '|---|---|---|---|---|---|---|',
    ...pts.filter((p) => p.groupe === g).map(ligne)].join('\n');
  const faits = pts.filter((p) => p.etat === 'fait').length;
  return `# ${f.titre}\n\n*Mise à jour : ${f.mise_a_jour}. Fichier produit depuis \`jarvis/feuille_de_route.json\` (la source) : ne pas le modifier à la main.*\n\n`
    + `${f.source}\n\n**Avancement : ${faits} point(s) fait(s) sur ${pts.length}.**\n\n## Règles\n\n${f.regles.map((r) => `- ${r}`).join('\n')}\n\n`
    + `## Groupe 1 : sans intervention de Basile\n\n${tableau('seul')}\n\n## Groupe 2 : avec Basile (clé, compte ou accord)\n\n${tableau('basile')}\n\n`
    + `## Déjà fait le 30/09/2026\n\n${f.deja_fait_le_30_09.map((d) => `- ${d}`).join('\n')}\n`;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('feuille_vers_markdown.mjs')) {
  const md = versMarkdown();
  fs.writeFileSync(new URL('../docs/FEUILLE_DE_ROUTE.md', import.meta.url), md);
  if (process.argv[2]) fs.writeFileSync(process.argv[2], md);
  console.log('feuille de route écrite');
}
