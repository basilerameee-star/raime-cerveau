// LE SITE — le brief et le contenu deviennent des pages, avec les briques de la maison.
//
// Pris dans briques/, jamais redemandés : la palette rose de rAIme, la police Inter, les
// logos, l'identité légale de rAIme (lue dans briques/legal/mentions-legales.html) et son
// hébergeur, le modèle d'hébergement (un conteneur, un bloc Caddy).
//
// Ce qui ne vient pas du brief ne s'écrit pas : sans prix, sans vendeur complet ou sans
// lien de paiement, le bouton devient « Demander un devis ».
import fs from 'node:fs';
import path from 'node:path';

const BRIQUES = new URL('../briques/', import.meta.url);
const lireBrique = (p) => fs.readFileSync(new URL(p, BRIQUES), 'utf8');

// Palette rose : validée par Basile le 23/09/2026 (briques/README.md). Sobre : pour un client
// sans identité. Client : ses couleurs, écrites dans sa phrase.
const PALETTES = {
  raime: { fond: 'linear-gradient(118deg,#6e5569 0%,#8c7187 38%,#ab8fa4 70%,#cfa9ba 100%)', uni: '#6f5669',
    texte: '#f2e8ee', gris: '#e2d0da', titre: '#fff', italique: '#f6d3dc', bouton: '#f5d0d8', boutonTexte: '#3d2437',
    carte: 'rgba(42,24,38,.28)', trait: 'rgba(255,255,255,.18)' },
  sobre: { fond: '#f6f5f2', uni: '#f6f5f2', texte: '#2b2b2e', gris: '#5d5d63', titre: '#141416', italique: '#3b5b7a',
    bouton: '#141416', boutonTexte: '#ffffff', carte: '#ffffff', trait: 'rgba(20,20,22,.12)' },
};

function paletteClient([fond, accent = '#141416']) {
  const lum = (h) => { const n = parseInt(h.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
  const sombre = lum(fond) < 0.5;
  return { fond, uni: fond, texte: sombre ? '#f1f1f3' : '#2b2b2e', gris: sombre ? '#c9c9d0' : '#5d5d63',
    titre: sombre ? '#ffffff' : '#141416', italique: accent, bouton: accent, boutonTexte: lum(accent) < 0.5 ? '#fff' : '#141416',
    carte: sombre ? 'rgba(0,0,0,.18)' : '#ffffff', trait: sombre ? 'rgba(255,255,255,.18)' : 'rgba(20,20,22,.12)' };
}

export const echapper = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const euros = (m) => `${Number(m).toLocaleString('fr-FR', { minimumFractionDigits: Number.isInteger(m) ? 0 : 2 })} €`;

// L'identité légale de rAIme et son hébergeur, lus dans la brique validée.
export function identiteRaime() {
  const ml = lireBrique('legal/mentions-legales.html');
  const editeur = (ml.match(/<h2>1\. Éditeur du site<\/h2><p>([\s\S]*?)<\/p>/) || [])[1];
  const directeur = (ml.match(/<h2>2\. Directeur de la publication<\/h2><p>([\s\S]*?)<\/p>/) || [])[1];
  const hebergeur = (ml.match(/(Hetzner Online GmbH[^<]*)/) || [])[1];
  if (!editeur || !directeur || !hebergeur) throw new Error('brique légale illisible : briques/legal/mentions-legales.html a changé');
  return { editeurHtml: editeur, directeur, hebergeur, email: 'contact@raime.fr' };
}

// ── Les réglages de la page ────────────────────────────────────────────────
export function decider(brief, { paiement = null, demonstration = false } = {}) {
  const raime = identiteRaime();
  // Le compte Stripe est celui de rAIme : il encaisse pour rAIme, ou en mode test pour une démonstration.
  const payable = Boolean(brief.prix && paiement?.url && (brief.maison === 'raime' || demonstration));
  const v = brief.vendeur;
  return {
    palette: brief.maison === 'raime' ? PALETTES.raime : brief.couleurs ? paletteClient(brief.couleurs) : PALETTES.sobre,
    logo: brief.maison === 'raime',
    payable, paiement, demonstration,
    contact: v?.email || raime.email,
    editeurHtml: v ? `${echapper(v.raison_sociale)}<br>SIREN : ${echapper(v.siren)}<br>${echapper(v.adresse)}<br>`
      + `Email : <a href="mailto:${echapper(v.email)}">${echapper(v.email)}</a>` : raime.editeurHtml,
    directeur: v ? `Le représentant légal de ${echapper(v.raison_sociale)}` : raime.directeur,
    responsable: v ? echapper(v.raison_sociale) : 'rAIme',
    hebergeur: raime.hebergeur,
  };
}

// ── Le gabarit ─────────────────────────────────────────────────────────────
function css(p) {
  return `@font-face{font-family:Inter;font-style:normal;font-weight:100 900;font-display:swap;src:url(/fonts/InterVariable.woff2) format("woff2")}
*{box-sizing:border-box}html,body{margin:0}
body{min-height:100vh;font-family:Inter,system-ui,sans-serif;color:${p.texte};background:${p.fond};background-color:${p.uni};line-height:1.6}
a{color:${p.titre}}
.demo{background:#141416;color:#fff;text-align:center;font-size:14px;padding:8px 16px}
header,main,footer{max-width:960px;margin:0 auto;padding:0 clamp(16px,5vw,48px)}
header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-top:24px;padding-bottom:24px}
header a{text-decoration:none;font-weight:650;color:${p.titre}}
header img{height:34px;width:auto;display:block}
nav{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:15px}
nav a{font-weight:500;color:${p.texte}}
main{padding-bottom:64px}
.etiq{margin:32px 0 12px;font-size:12px;font-weight:500;letter-spacing:.18em;text-transform:uppercase;color:${p.gris}}
h1{margin:0;font-size:clamp(34px,6vw,60px);line-height:1.05;letter-spacing:-.035em;font-weight:650;color:${p.titre}}
h1 em{display:block;font-style:normal;font-weight:400;color:${p.italique}}
h2{margin:48px 0 12px;font-size:clamp(22px,3vw,28px);letter-spacing:-.02em;color:${p.titre}}
p,li{font-size:clamp(16px,1.4vw,18px);max-width:62ch}
.cartes{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;padding:0;list-style:none}
.cartes li{background:${p.carte};border:1px solid ${p.trait};border-radius:14px;padding:18px 20px}
.appel{display:flex;flex-wrap:wrap;align-items:center;gap:14px 22px;margin-top:28px}
.bouton{display:inline-flex;align-items:center;height:52px;padding:0 28px;border-radius:999px;background:${p.bouton};color:${p.boutonTexte};font-size:16px;font-weight:600;text-decoration:none;border:0;cursor:pointer}
form .bouton,main>.bouton{margin-top:24px;justify-self:start}
.prix{margin:0;font-size:22px;font-weight:650;color:${p.titre}}
details{border-top:1px solid ${p.trait};padding:14px 0}summary{cursor:pointer;font-weight:600;color:${p.titre}}
form{display:grid;gap:14px;max-width:560px}label{display:grid;gap:6px;font-weight:500}
input,textarea{font:inherit;padding:12px 14px;border-radius:10px;border:1px solid ${p.trait};background:${p.carte};color:${p.texte}}
footer{border-top:1px solid ${p.trait};padding-top:20px;padding-bottom:40px;font-size:14px;color:${p.gris};display:flex;flex-wrap:wrap;gap:8px 20px}
footer a{color:${p.gris}}`;
}

function page(r, brief, { titre, description, corps, chemin }) {
  const liens = [['/offre/', 'L’offre'], ['/questions/', 'Questions'], ['/contact/', r.payable ? 'Contact' : 'Demander un devis']];
  return `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${echapper(titre)} — ${echapper(brief.produit)}</title>
<meta name="description" content="${echapper(description)}">
${r.demonstration ? '<meta name="robots" content="noindex, nofollow">\n' : ''}<link rel="icon" href="/favicon.png">
<link rel="preload" as="font" type="font/woff2" href="/fonts/InterVariable.woff2" crossorigin>
<style>${css(r.palette)}</style>
</head>
<body>
${r.demonstration ? '<div class="demo">Site de démonstration réalisé par rAIme : les paiements y sont des essais, sans débit réel.</div>\n' : ''}<header>
<a href="/" aria-label="Accueil">${r.logo ? '<img src="/logo-mark-blanc.png" alt="rAIme">' : echapper(brief.produit)}</a>
<nav>${liens.map(([h, t]) => `<a href="${h}"${h === chemin ? ' aria-current="page"' : ''}>${t}</a>`).join('')}</nav>
</header>
<main>
${corps}
</main>
<footer><span>${echapper(brief.produit)}</span><a href="/mentions-legales/">Mentions légales</a><a href="/confidentialite/">Confidentialité</a>${r.payable ? '<a href="/cgv/">Conditions de vente</a>' : ''}<span>Site réalisé par rAIme</span></footer>
</body>
</html>
`;
}

function appel(r, brief) {
  return r.payable
    ? `<div class="appel"><a class="bouton" href="${echapper(r.paiement.url)}">Acheter</a><p class="prix">${euros(brief.prix.montant)}</p></div>`
    : `<div class="appel"><a class="bouton" href="/contact/">Demander un devis</a></div>`;
}

const liste = (xs) => `<ul class="cartes">${xs.map((x) => `<li>${echapper(x)}</li>`).join('')}</ul>`;

// ── Les pages ──────────────────────────────────────────────────────────────
export function genererSite(brief, c, options = {}) {
  const r = decider(brief, options);
  const P = (chemin, titre, description, corps) => [chemin, page(r, brief, { titre, description, corps, chemin })];
  const pages = [
    P('/', brief.produit, c.sous_titre, `<p class="etiq">${echapper(brief.produit)}</p>
<h1>${echapper(c.accroche)}<em>${echapper(c.sous_titre)}</em></h1>
${appel(r, brief)}
<h2>Pour qui</h2>${liste(c.pour_qui)}
<h2>Ce que vous recevez</h2>${liste(c.ce_que_vous_recevez)}
<h2>Comment commencer</h2><ol>${c.comment_commencer.map((x) => `<li>${echapper(x)}</li>`).join('')}</ol>
${appel(r, brief)}`),
    P('/offre/', c.offre.titre, c.offre.description, `<p class="etiq">L’offre</p><h1>${echapper(c.offre.titre)}</h1>
<p>${echapper(c.offre.description)}</p>
<h2>Ce que vous recevez</h2>${liste(c.ce_que_vous_recevez)}
${appel(r, brief)}`),
    P('/questions/', 'Questions fréquentes', `Les réponses sur ${brief.produit}`, `<p class="etiq">Questions fréquentes</p><h1>Vos questions<em>et nos réponses.</em></h1>
${c.questions.map((x) => `<details><summary>${echapper(x.q)}</summary><p>${echapper(x.r)}</p></details>`).join('\n')}
${appel(r, brief)}`),
    P('/contact/', r.payable ? 'Contact' : 'Demander un devis', 'Écrivez-nous : réponse par e-mail.', `<p class="etiq">${r.payable ? 'Contact' : 'Demander un devis'}</p>
<h1>Parlons de votre besoin.<em>Réponse par e-mail.</em></h1>
<form action="mailto:${echapper(r.contact)}?subject=${encodeURIComponent(`Demande : ${brief.produit}`)}" method="post" enctype="text/plain">
<label>Votre nom<input name="nom" autocomplete="name" required></label>
<label>Votre e-mail<input name="email" type="email" autocomplete="email" required></label>
<label>Votre besoin<textarea name="besoin" rows="6" required></textarea></label>
<button class="bouton" type="submit">Envoyer la demande</button>
</form>
<p>Ou directement : <a href="mailto:${echapper(r.contact)}">${echapper(r.contact)}</a></p>`),
    P('/merci/', c.merci.titre, c.merci.texte, `<p class="etiq">Merci</p><h1>${echapper(c.merci.titre)}</h1>
<p>${echapper(c.merci.texte)}</p><p>Une question ? <a href="mailto:${echapper(r.contact)}">${echapper(r.contact)}</a></p>
<a class="bouton" href="/">Revenir à l’accueil</a>`),
    P('/mentions-legales/', 'Mentions légales', 'Éditeur, hébergement et données personnelles.', `<p class="etiq">Informations légales</p><h1>Mentions légales</h1>
<h2>Éditeur du site</h2><p>${r.editeurHtml}</p>
<h2>Directeur de la publication</h2><p>${r.directeur}</p>
<h2>Réalisation</h2><p>Site réalisé et publié par rAIme.</p>
<h2>Hébergement</h2><p>${echapper(r.hebergeur)}. Serveurs situés dans l'Union européenne.</p>
<h2>Données personnelles</h2><p>Voir la <a href="/confidentialite/">politique de confidentialité</a>.</p>`),
    P('/confidentialite/', 'Confidentialité', 'Ce que deviennent vos données.', `<p class="etiq">Informations légales</p><h1>Confidentialité</h1>
<h2>Responsable du traitement</h2><p>${r.responsable}, joignable à <a href="mailto:${echapper(r.contact)}">${echapper(r.contact)}</a>.</p>
<h2>Données collectées</h2><p>Ce site enregistre seulement ce que vous écrivez vous-même : le formulaire de contact ouvre votre messagerie et nous parvient par e-mail. Ce site dépose zéro cookie de suivi.</p>
${r.payable ? '<h2>Paiement</h2><p>Le paiement se fait sur la page sécurisée de Stripe, qui reçoit vos coordonnées de paiement.</p>' : ''}
<h2>Vos droits</h2><p>Accès, rectification, effacement : écrivez à <a href="mailto:${echapper(r.contact)}">${echapper(r.contact)}</a>. Réclamation possible auprès de la CNIL.</p>`),
  ];
  if (r.payable) {
    pages.push(P('/cgv/', 'Conditions de vente', 'Les conditions de vente.', `<p class="etiq">Informations légales</p><h1>Conditions de vente</h1>
${r.demonstration ? '<p>Ce site est une démonstration : le paiement se fait en mode test de Stripe, sans débit réel ni livraison.</p>'
    : lireBrique('legal/cgv.html').match(/<main class="legal">([\s\S]*?)<\/main>/)?.[1] || ''}`));
  }
  const fichiers = new Map(pages.map(([chemin, html]) => [chemin === '/' ? 'index.html' : `${chemin.slice(1)}index.html`, html]));
  return { fichiers, reglages: r };
}

// Le texte que la porte cherchera dans la page d'accueil : le début de l'accroche, coupé
// avant tout caractère que le HTML transforme (&, <, >, guillemets, apostrophe droite).
export function texteAVerifier(accroche) {
  const t = String(accroche).replace(/[\r\n]+/g, ' ').split(/[&<>"']/)[0].trim().slice(0, 60).trim();
  if (t.length < 8) throw new Error(`accroche trop courte pour être vérifiée en ligne : « ${accroche} »`);
  return t;
}

// ── Écrire le service : site, Dockerfile, service.conf (lu par la porte) ─────
export function ecrireService(dossier, brief, contenu, options = {}) {
  const { fichiers, reglages } = genererSite(brief, contenu, options);
  fs.rmSync(dossier, { recursive: true, force: true });
  const site = path.join(dossier, 'site');
  for (const [f, html] of fichiers) {
    fs.mkdirSync(path.dirname(path.join(site, f)), { recursive: true });
    fs.writeFileSync(path.join(site, f), html);
  }
  fs.mkdirSync(path.join(site, 'fonts'), { recursive: true });
  fs.copyFileSync(new URL('charte/polices/InterVariable.woff2', BRIQUES), path.join(site, 'fonts/InterVariable.woff2'));
  fs.copyFileSync(new URL('charte/logos/favicon.png', BRIQUES), path.join(site, 'favicon.png'));
  if (reglages.logo) fs.copyFileSync(new URL('charte/logos/logo-mark-blanc.png', BRIQUES), path.join(site, 'logo-mark-blanc.png'));
  // Un conteneur Caddy qui sert les fichiers : le modèle d'hébergement de briques/hebergement/.
  fs.writeFileSync(path.join(dossier, 'Dockerfile'),
    'FROM caddy:2-alpine\nCOPY site/ /usr/share/caddy/\n');
  fs.writeFileSync(path.join(dossier, 'service.conf'),
    `port=80\nchemin=/\ncontient=${texteAVerifier(contenu.accroche)}\n`);
  return reglages;
}
