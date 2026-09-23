// LE CONTENU — le modèle rédige dans la voix de la maison, le code relit.
//
// Un texte qui porte un « je », une tournure négative, le CPF ou un chiffre absent du
// brief est renvoyé une fois au modèle avec ses fautes ; s'il échoue encore, l'atelier
// s'arrête : rien ne part en ligne sur un texte que la maison refuse.
import { askJson } from '../agents/lib.js';
import { controlerVoix } from './voix.js';

const SYSTEME = `Tu rédiges le site d'une offre, pour l'atelier de rAIme. Français courant, le client d'abord :
est-ce pour moi, qu'est-ce que je reçois, comment commencer. Interdits : le mot « je », toute tournure négative
(ne… pas, aucun, jamais…), le jargon, le CPF, tout chiffre, tout prix, toute date, tout nom de client ou de
personne qui ne figure pas dans le brief. Réponds en JSON :
{"accroche":"une phrase","sous_titre":"une phrase","pour_qui":["3 à 4 profils"],
"ce_que_vous_recevez":["3 à 5 éléments concrets"],"comment_commencer":["3 étapes courtes"],
"offre":{"titre":"...","description":"deux à quatre phrases"},
"questions":[{"q":"...","r":"..."}],"merci":{"titre":"...","texte":"..."}}
Entre 4 et 6 questions fréquentes.`;

const CHAMPS = ['accroche', 'sous_titre', 'pour_qui', 'ce_que_vous_recevez', 'comment_commencer', 'offre', 'questions', 'merci'];

// Les nombres écrits dans le contenu doivent tous venir du brief.
function nombresInventes(texte, brief) {
  const permis = new Set([...String(brief.phrase).matchAll(/\d+/g)].map((m) => m[0]));
  if (brief.prix) String(brief.prix.montant).split(/\D/).forEach((n) => n && permis.add(n));
  return [...String(texte).matchAll(/\d+/g)].map((m) => m[0]).filter((n) => !permis.has(n));
}

export function relireContenu(c, brief) {
  const fautes = [];
  for (const k of CHAMPS) if (c?.[k] == null) fautes.push(`champ « ${k} » absent`);
  if (fautes.length) return fautes;
  if (!Array.isArray(c.questions) || c.questions.length < 4 || c.questions.length > 6)
    fautes.push('entre 4 et 6 questions fréquentes');
  const tout = JSON.stringify(c);
  const textes = [c.accroche, c.sous_titre, ...c.pour_qui, ...c.ce_que_vous_recevez, ...c.comment_commencer,
    c.offre.titre, c.offre.description, ...c.questions.flatMap((x) => [x.q, x.r]), c.merci.titre, c.merci.texte];
  // Les questions fréquentes s'écrivent du point de vue du client : son « je » y est permis.
  const clients = new Set(c.questions.map((x) => x.q));
  for (const t of textes) {
    const f = controlerVoix(t).filter((x) => !(clients.has(t) && x.startsWith('« je »')));
    fautes.push(...f);
  }
  const inventes = nombresInventes(tout, brief);
  if (inventes.length) fautes.push(`chiffres absents du brief : ${[...new Set(inventes)].join(', ')}`);
  return fautes;
}

export async function redigerContenu(brief) {
  const demande = `BRIEF :\n${JSON.stringify({ produit: brief.produit, cible: brief.cible, nature: brief.nature,
    prix: brief.prix, maison: brief.maison, phrase: brief.phrase })}`;
  let cout = 0, fautes = [];
  for (let essai = 1; essai <= 2; essai++) {
    const r = await askJson({ task: 'redaction', system: SYSTEME, maxTokens: 2500,
      user: essai === 1 ? demande : `${demande}\n\nTA PREMIÈRE VERSION A ÉTÉ REFUSÉE :\n- ${fautes.join('\n- ')}\nRécris-la.` });
    cout += r.meta?.costUsd || 0;
    fautes = r.data ? relireContenu(r.data, brief) : ['réponse illisible'];
    if (!fautes.length) return { contenu: r.data, cout, essais: essai };
  }
  const e = new Error(`contenu refusé deux fois : ${fautes.join(' · ')}`);
  e.fautes = fautes;
  throw e;
}
