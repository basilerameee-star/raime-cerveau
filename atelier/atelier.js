// L'ATELIER — une phrase de Basile devient un service en ligne, vendable, achetable.
//
//   ① le brief       ce que la phrase dit (brief.js), et les questions pour ce qu'elle tait
//   ② les briques    palette, police, logos, identité légale, hébergement (site.js, briques/)
//   ③ le contenu     rédigé dans la voix de la maison, relu par le code (contenu.js)
//   ④ le paiement    un prix connu → produit, prix et lien Stripe en mode test ; sinon un devis
//   ⑤ les contrôles  pages, liens, légal, paiement, inventions, voix, poids (controles.js)
//   ⑥ la livraison   services/<nom>/ fusionné sur main part en ligne par la porte (chantier 2)
//
//   node atelier/atelier.js "fais-moi un site pour vendre…" [--demonstration]
//        [--brief brief.json] [--contenu contenu.json]
// --brief / --contenu : un brief ou un contenu déjà rédigé (relu par le même code que celui du modèle).
import fs from 'node:fs';
import path from 'node:path';
import { assainir, extraireBrief } from './brief.js';
import { redigerContenu, relireContenu } from './contenu.js';
import { creerPaiement } from './stripe.js';
import { ecrireService } from './site.js';
import { controlerService } from './controles.js';

const RACINE = new URL('..', import.meta.url).pathname;

export async function fabriquer({ phrase, demonstration = false, brief: briefDonne = null, contenu: contenuDonne = null,
  dossierServices = path.join(RACINE, 'services') }) {
  let cout = 0;
  const etapes = [];

  // ① Le brief : un brief fourni repasse par le même assainissement que celui du modèle.
  let brief;
  if (briefDonne) brief = assainir(briefDonne, phrase);
  else { const r = await extraireBrief(phrase); brief = r.brief; cout += r.cout; }
  etapes.push(`brief : ${brief.produit} (${brief.maison}), prix ${brief.prix ? `${brief.prix.montant} €` : 'inconnu'}`);

  // ③ Le contenu.
  let contenu;
  if (contenuDonne) {
    const fautes = relireContenu(contenuDonne, brief);
    if (fautes.length) throw Object.assign(new Error(`contenu refusé : ${fautes.join(' · ')}`), { fautes });
    contenu = contenuDonne;
  } else { const r = await redigerContenu(brief); contenu = r.contenu; cout += r.cout; }
  etapes.push('contenu : relu, conforme à la voix de la maison');

  // ④ Le paiement : le compte Stripe est celui de rAIme. Il encaisse pour rAIme, ou en test pour une démonstration.
  let paiement = null;
  const questions = [...brief.questions];
  if (brief.prix && (brief.maison === 'raime' || demonstration)) {
    try {
      paiement = await creerPaiement({ produit: brief.produit, montant: brief.prix.montant, nom: brief.nom, mode: 'test' });
      etapes.push(`paiement : lien Stripe de test créé (${paiement.lien})`);
    } catch (e) {
      etapes.push(`paiement : ${e.message} → bouton « Demander un devis »`);
      questions.push(`Le paiement de « ${brief.produit} » attend la clé Stripe restreinte de test (${e.message}).`);
    }
  } else if (brief.prix) {
    questions.push(`« ${brief.produit} » se vend pour un client : le paiement passera par son propre compte Stripe. Lequel ?`);
  }

  // ② et ⑤ Le site, puis les contrôles. Un service qui échoue est retiré : il ne partira pas.
  const dossier = path.join(dossierServices, brief.nom);
  const reglages = ecrireService(dossier, brief, contenu, { paiement, demonstration });
  const controle = controlerService(dossier, brief);
  if (!controle.ok) fs.rmSync(dossier, { recursive: true, force: true });

  return { brief, contenu, paiement, reglages, controle, questions, etapes, dossier, cout,
    adresse: `https://${brief.nom}.raime.fr` };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const option = (n) => { const i = args.indexOf(n); return i >= 0 ? args.splice(i, 2)[1] : null; };
  const lireJson = (f) => (f ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);
  const demonstration = args.includes('--demonstration');
  const brief = lireJson(option('--brief'));
  const contenu = lireJson(option('--contenu'));
  const phrase = args.filter((a) => a !== '--demonstration').join(' ');
  if (!phrase) { console.error('usage : node atelier/atelier.js "phrase" [--demonstration] [--brief f] [--contenu f]'); process.exit(2); }

  const r = await fabriquer({ phrase, demonstration, brief, contenu });
  console.log(`\n╔══ ATELIER : ${r.adresse} ══╗`);
  r.etapes.forEach((e) => console.log(`  · ${e}`));
  for (const c of r.controle.resultats) console.log(`  ${c.ok ? '✓' : '✗'} ${c.controle}${c.ok ? '' : ` — ${c.erreurs.join(' | ')}`}`);
  console.log(`  poids du site : ${r.controle.octets} octets · coût des modèles : ${r.cout.toFixed(4)} $`);
  if (r.questions.length) { console.log('\n  QUESTIONS POUR BASILE'); r.questions.forEach((q) => console.log(`  - ${q}`)); }
  console.log(r.controle.ok ? `\n  prêt : ${path.relative(RACINE, r.dossier)}/ — en ligne après fusion sur main` : '\n  REFUSÉ : rien ne part en ligne');
  process.exit(r.controle.ok ? 0 : 1);
}
