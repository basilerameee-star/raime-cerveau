// Diagnostic : que rend le Héraut au premier essai, puis au second ?
// Soupçon à vérifier : la reprise après refus remplace parfois un brouillon presque bon
// par un texte plus court, voire vide. Si c'est le cas, la maison perd des messages
// valides et le taux de refus monte sans que personne ne sache pourquoi.
import { ask, db } from '../agents/lib.js';
import { SYSTEM, valider } from '../agents/heraut.js';

const p = { name: 'Cabinet Berthier & Associés', sector: 'expertise comptable', city: 'Annecy', dirigeant: null };
const objet = 'Formation IA : obligation applicable depuis le 2 août';
const user = `Destinataire :
- Organisation : ${p.name}
- Secteur : ${p.sector}
- Ville : ${p.city}
- Dirigeant : (inconnu — ne pas inventer de prénom, écrire "Bonjour,")

Secteur : ${p.sector}.

Rédige l'e-mail.`;

const brain = db(); await brain.connect();

const r1 = await ask({ task: 'redaction', system: SYSTEM, user, json: false, maxTokens: 1500, temperature: 0.4 });
const c1 = String(r1.text || '').replace(/^```[a-z]*|```$/gm, '').trim();
const f1 = valider(objet, c1, p.name);
console.log(`\n=== ESSAI 1 — ${c1.length} caractères, ${f1.length} faute(s) ===`);
console.log(c1.slice(0, 700));
console.log('fautes :', f1.join(' ; ') || 'aucune');

if (f1.length) {
  const r2 = await ask({ task: 'redaction', system: SYSTEM,
    user: `${user}\n\nTON BROUILLON PRÉCÉDENT A ÉTÉ REFUSÉ pour : ${f1.join(' ; ')}. Corrige-le.`,
    json: false, maxTokens: 1500, temperature: 0.4 });
  const c2 = String(r2.text || '').replace(/^```[a-z]*|```$/gm, '').trim();
  const f2 = valider(objet, c2, p.name);
  console.log(`\n=== ESSAI 2 — ${c2.length} caractères, ${f2.length} faute(s) ===`);
  console.log(c2.slice(0, 700));
  console.log('fautes :', f2.join(' ; ') || 'aucune');
  console.log(`\n=> le second essai est ${f2.length < f1.length ? 'MEILLEUR' : f2.length > f1.length ? 'PIRE' : 'équivalent'} (${f1.length} → ${f2.length} fautes, ${c1.length} → ${c2.length} caractères)`);
}
await brain.end();
