// LES CONTRÔLES — ce qui ne les passe pas ne part pas en ligne. Le code juge (règle 6).
//
//   pages        toutes les pages attendues sont là
//   liens        chaque lien interne mène à un fichier ; les liens externes sont connus
//   legal        mentions, confidentialité (et conditions de vente si l'on vend) disent qui publie et où
//   paiement     un prix connu → un lien Stripe (en mode test pour une démonstration) ; sinon un devis
//   inventions   aucun chiffre visible qui ne vienne du brief
//   voix         aucun « je », aucune tournure négative, aucun CPF
//   poids        des pages légères : le temps de chargement se mesure en octets
//   verification le texte que la porte cherchera est bien sur la page d'accueil
import fs from 'node:fs';
import path from 'node:path';
import { controlerVoix, texteVisible } from './voix.js';

const PAGES = ['index.html', 'offre/index.html', 'questions/index.html', 'contact/index.html', 'merci/index.html',
  'mentions-legales/index.html', 'confidentialite/index.html'];
const LEGALES = ['mentions-legales/index.html', 'confidentialite/index.html', 'cgv/index.html'];
const EXTERNES = [/^https:\/\/buy\.stripe\.com\/[A-Za-z0-9_]+$/, /^mailto:[^\s"]+$/, /^https:\/\/raime\.fr\/?$/];
const PAGE_MAX = 50_000;       // octets d'une page HTML
const SITE_MAX = 400_000;      // octets de tout le site, police comprise

export function controlerService(dossier, brief) {
  const site = path.join(dossier, 'site');
  const resultats = [];
  const noter = (controle, erreurs) => resultats.push({ controle, ok: erreurs.length === 0, erreurs });
  const lire = (f) => fs.readFileSync(path.join(site, f), 'utf8');
  const existe = (f) => fs.existsSync(path.join(site, f));

  const vend = existe('cgv/index.html');
  const attendues = vend ? [...PAGES, 'cgv/index.html'] : PAGES;
  noter('pages', attendues.filter((f) => !existe(f)).map((f) => `page absente : /${f.replace(/index\.html$/, '')}`));
  const presentes = attendues.filter(existe);

  // Liens : internes résolus sur le disque, externes seulement connus.
  const liens = [];
  for (const f of presentes) {
    for (const m of lire(f).matchAll(/\b(?:href|src|action)="([^"]+)"/g)) {
      const l = m[1].replace(/&amp;/g, '&');
      if (l.startsWith('/')) {
        const cible = l.split(/[?#]/)[0];
        const ok = existe(cible.slice(1)) || existe(path.join(cible.slice(1), 'index.html'));
        if (!ok) liens.push(`/${f} → lien mort ${l}`);
      } else if (!EXTERNES.some((re) => re.test(l.split('?')[0]))) liens.push(`/${f} → lien externe inconnu ${l}`);
    }
  }
  noter('liens', liens);

  const legal = [];
  if (existe('mentions-legales/index.html')) {
    const t = texteVisible(lire('mentions-legales/index.html'));
    if (!/SIRE[NT]\s*:\s*\d{9}/.test(t)) legal.push('mentions légales : SIREN ou SIRET de l’éditeur absent');
    if (!/Hébergement/.test(t) || !/Hetzner/.test(t)) legal.push('mentions légales : hébergeur absent');
    if (!/Directeur de la publication/.test(t)) legal.push('mentions légales : directeur de la publication absent');
  }
  if (existe('confidentialite/index.html') && !/Responsable du traitement/.test(lire('confidentialite/index.html')))
    legal.push('confidentialité : responsable du traitement absent');
  noter('legal', legal);

  // Paiement : ce que dit le brief doit se retrouver sur la page, et rien d'autre.
  const paiement = [];
  const accueil = existe('index.html') ? lire('index.html') : '';
  const stripe = accueil.match(/href="(https:\/\/buy\.stripe\.com\/[^"]+)"/)?.[1];
  const demonstration = /Site de démonstration/.test(accueil);
  if (stripe) {
    if (!brief.prix) paiement.push('lien de paiement sans prix dans le brief');
    if (demonstration && !/\/test_/.test(stripe)) paiement.push('démonstration avec un lien de paiement réel');
    if (!vend) paiement.push('vente sans conditions de vente');
    if (!existe('merci/index.html')) paiement.push('vente sans page de remerciement');
  } else {
    if (!/href="\/contact\/"[^>]*>Demander un devis/.test(accueil)) paiement.push('ni paiement ni bouton « Demander un devis »');
    if (existe('contact/index.html') && !/action="mailto:/.test(lire('contact/index.html'))) paiement.push('formulaire de devis sans destinataire');
  }
  noter('paiement', paiement);

  // Inventions : chaque nombre visible hors pages légales vient de la phrase ou du prix.
  const permis = new Set([...String(brief.phrase).matchAll(/\d+/g)].map((m) => m[0]));
  if (brief.prix) String(brief.prix.montant).split(/\D/).forEach((n) => n && permis.add(n));
  const inventions = [];
  for (const f of presentes.filter((x) => !LEGALES.includes(x))) {
    for (const n of texteVisible(lire(f)).match(/\d+/g) || []) if (!permis.has(n)) inventions.push(`/${f} : « ${n} »`);
  }
  noter('inventions', [...new Set(inventions)]);

  // Voix : les questions fréquentes (<summary>) parlent au nom du client, elles gardent leur « je ».
  const voix = [];
  for (const f of presentes) {
    const html = lire(f).replace(/<summary>[\s\S]*?<\/summary>/g, ' ');
    for (const faute of controlerVoix(texteVisible(html), { legal: LEGALES.includes(f) })) voix.push(`/${f} : ${faute}`);
  }
  noter('voix', voix);

  let total = 0;
  const poids = [];
  const parcourir = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) return parcourir(p);
    const o = fs.statSync(p).size; total += o;
    if (e.name.endsWith('.html') && o > PAGE_MAX) poids.push(`${path.relative(site, p)} : ${o} octets (${PAGE_MAX} au plus)`);
  });
  if (fs.existsSync(site)) parcourir(site);
  if (total > SITE_MAX) poids.push(`site entier : ${total} octets (${SITE_MAX} au plus)`);
  noter('poids', poids);

  const conf = fs.existsSync(path.join(dossier, 'service.conf')) ? fs.readFileSync(path.join(dossier, 'service.conf'), 'utf8') : '';
  const contient = conf.match(/^contient=(.*)$/m)?.[1];
  noter('verification', !contient ? ['service.conf sans « contient= »']
    : accueil.includes(contient) ? [] : [`la page d’accueil ne contient pas « ${contient} »`]);

  return { ok: resultats.every((r) => r.ok), resultats, octets: total };
}
