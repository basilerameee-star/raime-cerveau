import { readFileSync } from 'fs';

// Extraction du bloc <script> et vérification de sa syntaxe via new Function
const html = readFileSync('/travail/demande-15/app/index.html', 'utf8');

// Vérifie la présence d'éléments attendus
const attendus = [
  'AGENDA_LIEN',
  'raime.fr/confidentialite/',
  'data-question="profil"',
  'data-question="besoin"',
  'data-question="echeance"',
  'Mode jour',
  '#ff7eb0',
  '#db4f8b',
  '#ededed',
];

for (const a of attendus) {
  if (!html.includes(a)) {
    console.error('MANQUE : ' + a);
    process.exit(1);
  }
}

// Extraire le script et vérifier sa syntaxe
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('Aucun <script> trouvé'); process.exit(1); }
try {
  new Function(m[1]);
} catch (e) {
  console.error('ERREUR DE SYNTAXE JS : ' + e.message);
  process.exit(1);
}

// Compter les balises ouvrantes/fermantes principales
const tags = ['html','head','body','main','section','form','ul','li','button','a','h1','h2','p','aside'];
let ok = true;
for (const t of tags) {
  const open = (html.match(new RegExp('<' + t + '(\\s|>|/\\s*>)', 'g')) || []).length;
  const close = (html.match(new RegExp('</' + t + '>', 'g')) || []).length;
  const selfCloseLien = t === 'a' ? 0 : 0;
  if (open !== close + selfCloseLien) {
    console.error('DÉSÉQUILIBRE <' + t + '> : ' + open + ' ouverts, ' + close + ' fermés');
    ok = false;
  }
}
if (!ok) process.exit(1);

console.log('VÉRIFICATIONS PASSÉES (structure, syntaxe JS, éléments attendus).');