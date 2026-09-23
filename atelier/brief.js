// LE BRIEF — d'une phrase de Basile, ce qu'on sait vraiment.
//
// Le modèle lit la phrase ; le code garde seulement ce que la phrase contient. Un prix
// qui n'y figure pas en chiffres disparaît, une identité de vendeur qui n'y figure pas
// mot pour mot disparaît. Règle 4 : rien ne s'invente. Ce qui manque devient une question.
import { askJson } from '../agents/lib.js';

export const RESERVES = new Set(['www', 'raime', 'n8n', 'cockpit', 'voyage', 'metabase', 'docuseal',
  'postgres', 'caddy', 'boucle', 'porte', 'api', 'mail']);

const SYSTEME = `Tu es l'atelier de rAIme. On te donne UNE phrase qui demande un site pour vendre quelque chose.
Extrais seulement ce que la phrase dit, sans rien ajouter. Réponds en JSON :
{"nom":"sous-domaine court en minuscules et tirets","produit":"ce qui est vendu, en quelques mots",
"cible":"à qui, si la phrase le dit, sinon null","prix":{"montant":0,"devise":"EUR"} ou null,
"vendeur":{"raison_sociale":null,"siren":null,"adresse":null,"email":null} ou null,
"couleurs":["#rrggbb"] ou null,"nature":"numerique|physique|service","maison":"raime|client"}
"maison" vaut "raime" seulement si la phrase parle d'un service ou d'un produit de rAIme.`;

// Les montants écrits dans la phrase, suivis de € ou d'euros : « 19 € », « 1 200 euros », « 19,90€ ».
export function montantsEcrits(phrase) {
  return [...String(phrase).matchAll(/(\d{1,3}(?:[\s  .]\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(?:€|euros?\b|EUR\b)/gi)]
    .map((m) => Number(m[1].replace(/[\s  .](?=\d{3}\b)/g, '').replace(',', '.')));
}

// Le code juge : ne reste que ce que la phrase porte.
export function assainir(brut, phrase) {
  const p = String(phrase);
  const questions = [];
  const b = brut || {};

  let nom = String(b.nom || b.produit || 'service').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30).replace(/-+$/, '');
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(nom) || nom.length < 2) nom = 'service';
  if (RESERVES.has(nom)) nom = `${nom}-boutique`;

  let prix = null;
  const m = Number(b.prix?.montant);
  if (Number.isFinite(m) && m > 0 && montantsEcrits(p).includes(m)) {
    prix = { montant: m, devise: 'EUR' };
  } else {
    questions.push(`Quel est le prix de « ${b.produit || nom} » ? Sans prix, la page propose « demander un devis ».`);
  }

  // Une identité de vendeur ne vaut que si chacun de ses champs est écrit dans la phrase.
  let vendeur = null;
  if (b.vendeur && typeof b.vendeur === 'object') {
    const v = {};
    for (const k of ['raison_sociale', 'siren', 'adresse', 'email']) {
      const val = b.vendeur[k];
      if (val && p.toLowerCase().includes(String(val).toLowerCase())) v[k] = String(val);
    }
    if (Object.keys(v).length) vendeur = v;
  }
  const maison = b.maison === 'raime' && /raime/i.test(p) ? 'raime' : 'client';
  const complet = vendeur && vendeur.raison_sociale && vendeur.siren && vendeur.adresse && vendeur.email;
  if (maison === 'client' && !complet) {
    questions.push(`Qui vend « ${b.produit || nom} » ? Raison sociale, SIREN, adresse et e-mail du vendeur : `
      + 'sans eux, rAIme publie la page et reçoit les demandes de devis.');
  }

  const couleurs = (Array.isArray(b.couleurs) ? b.couleurs : [])
    .filter((c) => /^#[0-9a-f]{6}$/i.test(c) && p.toLowerCase().includes(c.toLowerCase()));

  return {
    phrase: p, nom, produit: String(b.produit || '').slice(0, 120) || nom,
    cible: b.cible ? String(b.cible).slice(0, 160) : null,
    prix, vendeur: complet ? vendeur : null, vendeur_partiel: complet ? null : vendeur,
    couleurs: couleurs.length ? couleurs : null,
    nature: ['numerique', 'physique', 'service'].includes(b.nature) ? b.nature : 'service',
    maison, questions,
  };
}

export async function extraireBrief(phrase) {
  const r = await askJson({ task: 'extraction', system: SYSTEME, user: phrase, maxTokens: 800 });
  if (!r.data) throw new Error(`brief illisible : ${r.raw || r.status}`);
  return { brief: assainir(r.data, phrase), cout: r.meta?.costUsd || 0 };
}
