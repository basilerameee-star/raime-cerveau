// LA MAQUETTE D'UNE VITRINE — ce que le commerçant découvre en cliquant sur le lien de l'e-mail (v4, 01/10/2026).
//
// Basile : « fais plus simple : un site blanc et noir avec des images ; on choisira les couleurs après ». Principes
// « Sam Crawford » de raime.fr :
// restriction volontaire. Une seule police ; titres en trois tailles (84, 48, 24), texte 18 et 14, une étiquette 12 en
// capitales ; trois couleurs et l'accent réservé au mot-clé et au bouton ; aucun bord arrondi, aucune ombre, aucun
// bandeau ; chaque information une seule fois ; des phrases simples. Jamais sans photos d'exemple ni sans les
// informations trouvées sur le commerce. Rien d'inventé (ni avis, ni prix) ; les horaires seulement s'ils sont connus.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const sansAccents = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export const cleMetier = (m) => sansAccents(m || 'commerce').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Par métier : [ton, fond] — un ton sourd pour les accents (boutons, mots-clés, repère) et un fond à peine teinté ; jamais de couleur vive (Basile, 01/10/2026). le bouton d'action, la phrase d'accueil (vraie pour tout commerce du métier), le mot-clé
// (en italique, sur la première ligne du titre des prestations), et trois prestations type.
export const METIERS = {
  boulangerie: { c: ['#7a5a3a', '#f6f1ea'], action: 'Commander', accroche: 'Pains, viennoiseries et pâtisseries, faits pour le quartier.', cle: 'du jour',
    rubriques: [['Pains', 'Le pain de tous les jours et les spécialités de la maison.'], ['Viennoiseries', 'Croissants et pains au chocolat, chaque matin.'], ['Commandes', 'Gâteaux et grandes quantités, sur commande.']] },
  boucherie: { c: ['#7a3b34', '#f6efed'], action: 'Commander', accroche: 'Viandes choisies, découpées à la demande.', cle: 'choisies',
    rubriques: [['Viandes', 'Bœuf, veau, agneau et volaille.'], ['Traiteur', 'Charcuterie et plats préparés.'], ['Commandes', 'Pièces préparées pour vos repas et vos fêtes.']] },
  fleuriste: { c: ['#56664a', '#f1f3ed'], action: 'Commander un bouquet', accroche: 'Bouquets et compositions, pour chaque occasion.', cle: 'de saison',
    rubriques: [['Bouquets', 'Compositions de saison, à emporter ou à livrer.'], ['Événements', 'Mariages, anniversaires et cérémonies.'], ['Plantes', 'Plantes vertes et fleuries.']] },
  coiffeur: { c: ['#4a4458', '#f2f1f4'], action: 'Prendre rendez-vous', accroche: 'Coupe, couleur et soin, sur rendez-vous.', cle: 'sur mesure',
    rubriques: [['Coupe', 'Femme, homme et enfant.'], ['Couleur', 'Couleur, mèches et balayage.'], ['Soin', 'Soins du cheveu et conseils.']] },
  'institut de beauté': { c: ['#7d5a63', '#f6f0f1'], action: 'Prendre rendez-vous', accroche: 'Soins du visage, du corps et des mains.', cle: 'pour vous',
    rubriques: [['Visage', 'Soins adaptés à chaque peau.'], ['Mains et ongles', 'Manucure, pose et entretien.'], ['Corps', 'Massages et soins du corps.']] },
  'garage automobile': { c: ['#2f4156', '#eff1f4'], action: 'Demander un devis', accroche: 'Entretien et réparation de votre véhicule.', cle: 'complet',
    rubriques: [['Entretien', 'Vidange, filtres et révision.'], ['Réparation', 'Freinage, distribution et embrayage.'], ['Pneus', 'Montage, équilibrage et parallélisme.']] },
  plombier: { c: ['#2e5266', '#eef3f5'], action: 'Demander une intervention', accroche: 'Dépannage, installation et entretien.', cle: 'rapide',
    rubriques: [['Dépannage', 'Fuites, engorgements et urgences.'], ['Installation', 'Salle de bain, cuisine et chauffe-eau.'], ['Entretien', 'Contrôles et remises en état.']] },
  électricien: { c: ['#6b5a2e', '#f5f2ea'], action: 'Demander une intervention', accroche: 'Installation, mise aux normes et dépannage.', cle: 'sûr',
    rubriques: [['Dépannage', 'Pannes et remises en service.'], ['Installation', 'Tableaux, prises et éclairage.'], ['Rénovation', 'Mise aux normes du logement.']] },
  serrurier: { c: ['#4b4a3f', '#f2f2ee'], action: 'Appeler', accroche: 'Ouverture de porte, serrures et sécurité.', cle: 'sécurisé',
    rubriques: [['Dépannage', 'Ouverture de porte et clés perdues.'], ['Serrures', 'Remplacement et renforcement.'], ['Sécurité', 'Portes blindées et conseil.']] },
  menuisier: { c: ['#6e5238', '#f5f0ea'], action: 'Demander un devis', accroche: 'Menuiserie et agencement sur mesure.', cle: 'sur mesure',
    rubriques: [['Agencement', 'Meubles et rangements.'], ['Menuiseries', 'Portes, fenêtres et escaliers.'], ['Rénovation', 'Réparations et finitions.']] },
  restaurant: { c: ['#6e3f2c', '#f6efea'], action: 'Réserver une table', accroche: 'Une cuisine à partager, midi et soir.', cle: 'à table',
    rubriques: [['La carte', 'Entrées, plats et desserts.'], ['Le midi', 'Formules et plat du jour.'], ['Groupes', 'Tables pour vos repas et événements.']] },
  pizzeria: { c: ['#7a3a2a', '#f6eeeb'], action: 'Commander', accroche: 'Pizzas sur place ou à emporter.', cle: 'au four',
    rubriques: [['Pizzas', 'Les classiques et les spécialités.'], ['À emporter', 'Commandez, passez la chercher.'], ['Sur place', 'Une table pour la manger chaude.']] },
  pressing: { c: ['#2f5a57', '#edf3f2'], action: 'Appeler', accroche: 'Nettoyage, repassage et retouches.', cle: 'impeccable',
    rubriques: [['Nettoyage', 'Vêtements et textiles délicats.'], ['Repassage', 'Chemises et tenues prêtes à porter.'], ['Retouches', 'Ourlets et ajustements.']] },
  cordonnier: { c: ['#5e4532', '#f4efea'], action: 'Appeler', accroche: 'Chaussures, cuir et clés.', cle: 'qui dure',
    rubriques: [['Ressemelage', 'Talons, semelles et patins.'], ['Cuir', 'Sacs, ceintures et entretien.'], ['Clés', 'Reproduction de clés.']] },
  fromagerie: { c: ['#6d5c2a', '#f6f3e8'], action: 'Commander', accroche: 'Fromages choisis et affinés.', cle: 'affiné',
    rubriques: [['Fromages', 'La sélection du moment.'], ['Plateaux', 'Plateaux pour vos repas et vos fêtes.'], ['Épicerie fine', 'Les accompagnements.']] },
  caviste: { c: ['#5c2a3a', '#f4ecef'], action: 'Nous contacter', accroche: 'Vins et spiritueux, et le conseil qui va avec.', cle: 'choisi',
    rubriques: [['Vins', 'La sélection de la cave.'], ['Spiritueux', 'Whiskies, rhums et liqueurs.'], ['Conseil', 'L’accord pour chaque repas.']] },
  toiletteur: { c: ['#3c5a45', '#eef3ef'], action: 'Prendre rendez-vous', accroche: 'Toilettage pour chiens et chats.', cle: 'en douceur',
    rubriques: [['Toilettage', 'Bain, coupe et brushing.'], ['Soins', 'Griffes, oreilles et pelage.'], ['Conseil', 'L’entretien entre deux visites.']] },
  photographe: { c: ['#2b2b2b', '#f2f2f2'], action: 'Réserver une séance', accroche: 'Portraits, événements et photos professionnelles.', cle: 'qui reste',
    rubriques: [['Portraits', 'Seul, en couple ou en famille.'], ['Événements', 'Mariages et célébrations.'], ['Professionnels', 'Images pour les entreprises.']] },
  'peintre en bâtiment': { c: ['#34506b', '#eef2f6'], action: 'Demander un devis', accroche: 'Peinture intérieure et extérieure.', cle: 'soigné',
    rubriques: [['Intérieur', 'Peinture et papiers peints.'], ['Extérieur', 'Façades et boiseries.'], ['Rénovation', 'Préparation et remise à neuf.']] },
  paysagiste: { c: ['#3f5a35', '#eff3ec'], action: 'Demander un devis', accroche: 'Création et entretien de jardins.', cle: 'vivant',
    rubriques: [['Création', 'Jardins et terrasses.'], ['Entretien', 'Taille, tonte et saisons.'], ['Plantations', 'Haies, massifs et arbres.']] },
};
const DEFAUT = { c: ['#2b2f3a', '#f1f2f4'], action: 'Nous contacter', accroche: 'Votre commerce, en ligne.', cle: 'reconnu',
  rubriques: [['Prestations', 'Ce que nous proposons.'], ['Réalisations', 'Notre travail en images.'], ['Contact', 'Une question, un projet.']] };
export const fiche = (metier) => METIERS[metier] || DEFAUT;

// Les horaires d'OpenStreetMap (« Mo-Fr 08:00-12:00,14:00-18:00; Sa 08:00-12:00 ») en français ; null si illisibles.
const JOURS = { Mo: 'lun.', Tu: 'mar.', We: 'mer.', Th: 'jeu.', Fr: 'ven.', Sa: 'sam.', Su: 'dim.' };
export function horairesLisibles(oh) {
  if (!oh || typeof oh !== 'string' || oh.length > 200) return null;
  const h = (t) => t.replace(/^0(\d)/, '$1').replace(/:00$/, ' h').replace(/:(\d\d)$/, ' h $1');
  const lignes = [];
  for (const regle of oh.split(';').map((r) => r.trim()).filter(Boolean)) {
    const m = /^((?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?(?:,(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)*)\s+(off|closed|\d{2}:\d{2}-\d{2}:\d{2}(?:,\s?\d{2}:\d{2}-\d{2}:\d{2})*)$/.exec(regle);
    if (!m) return null;
    const jours = m[1].split(',').map((p) => p.split('-').map((j) => JOURS[j]).join(' au ')).join(', ');
    const heures = /off|closed/.test(m[2]) ? 'fermé' : m[2].split(',').map((p) => p.trim().split('-').map(h).join('–')).join(', ');
    lignes.push(`${jours.charAt(0).toUpperCase() + jours.slice(1)} : ${heures}`);
  }
  return lignes.length ? lignes : null;
}

// La carte : tuiles OpenStreetMap posées autour du point, en niveaux de gris, un repère carré au centre ; aucun script.
// base : l'adresse des tuiles servies par le Cockpit (« https://cockpit.raime.fr/demo/tuile ») ; jamais les serveurs
// d'OpenStreetMap en direct, qui refusent une page sans Referer (01/10/2026).
export function carte(lat, lon, z = 16, base = '/demo/tuile') {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const n = 2 ** z, xf = ((lon + 180) / 360) * n, r = (lat * Math.PI) / 180;
  const yf = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
  const x0 = Math.floor(xf), y0 = Math.floor(yf), px = Math.round((xf - x0) * 256), py = Math.round((yf - y0) * 256);
  let tuiles = '';
  for (let dy = -1; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) {
    tuiles += `<img src="${base}/${z}/${x0 + dx}/${y0 + dy}.png" alt="" width="256" height="256" style="left:${(dx + 2) * 256}px;top:${(dy + 1) * 256}px">`;
  }
  return `<div class="tuiles" style="left:calc(50% - ${512 + px}px);top:calc(50% - ${256 + py}px)">${tuiles}</div>`;
}

// v : la fiche du commerce ; o.images : adresse des photos d'exemple (« https://cockpit.raime.fr/demo/img »).
export function maquettePremium(v, o = {}) {
  const f = fiche(v.metier), [ton, fond] = f.c;
  const tel = v.telephone ? String(v.telephone).replace(/[^\d+]/g, '') : '';
  const metier = v.metier ? v.metier.charAt(0).toUpperCase() + v.metier.slice(1) : 'Commerce';
  const lieu = v.adresse || v.ville;
  const itineraire = v.carte || `https://www.google.com/maps/search/${encodeURIComponent(`${v.nom} ${lieu}`)}`;
  const base = o.images ? `${o.images}/${cleMetier(v.metier)}` : null;
  const photo = (i) => (base ? ` style="background-image:url('${base}/${i}.jpg')"` : '');
  const coord = (x) => (x === null || x === undefined || x === '' ? NaN : Number(x)); // Number(null) vaudrait 0 : le golfe de Guinée
  const plan = carte(coord(v.lat), coord(v.lon), 16, String(o.images || '/demo/img').replace(/\/img$/, '/tuile'));
  const horaires = Array.isArray(v.horaires) ? v.horaires : horairesLisibles(v.horaires);
  const appel = tel ? `<a class="btn" href="tel:${esc(tel)}">${esc(f.action)}</a>` : '';
  const route = `<a class="lien" href="${esc(itineraire)}" target="_blank" rel="noopener">Itinéraire</a>`;
  const v3 = !!o.v3;
  const polices = String(o.images || '/demo/img').replace(/\/img$/, '/police');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(v.nom)} · ${esc(metier)} à ${esc(v.ville)}</title><style>
:root{--encre:#111318;--texte:#3c3f45;--gris:#5e6167;--trait:#e4e4e4;--ton:${ton};--fond:${fond}}
*{box-sizing:border-box;margin:0;border-radius:0}html{scroll-behavior:smooth}
body{font:400 18px/1.6 Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--texte);background:#fff;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}.w{max-width:1160px;margin:0 auto;padding:0 24px}
.demo{font-size:14px;color:var(--gris);text-align:center;padding:8px 16px;border-bottom:1px solid var(--trait)}
header{display:flex;align-items:center;justify-content:space-between;height:72px}
.nom{color:var(--encre);font-weight:600;font-size:18px}
nav{display:flex;gap:32px;font-size:14px}nav a:hover{color:var(--encre)}
.btn,.lien{display:inline-block;padding:16px 28px;font-weight:600;font-size:14px;letter-spacing:.06em;text-transform:uppercase;transition:opacity .2s,background .2s}
.btn{background:var(--ton);color:#fff}.btn:hover{opacity:.82}
.lien{padding:15px 27px;border:1px solid var(--ton);color:var(--ton)}.lien:hover{background:var(--ton);color:#fff}
.intro{padding-top:96px;padding-bottom:64px}
.et{font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:var(--gris);margin-bottom:24px}
h1{font-size:84px;line-height:1;font-weight:600;letter-spacing:-.03em;color:var(--encre);max-width:900px;overflow-wrap:anywhere}
h2{font-size:48px;line-height:1.08;font-weight:600;letter-spacing:-.02em;color:var(--encre);max-width:760px}
h3{font-size:24px;line-height:1.2;font-weight:600;color:var(--encre)}
em{font-style:italic;font-weight:400;color:var(--ton)}
.intro p{max-width:560px;margin-top:24px}.actions{display:flex;gap:16px;flex-wrap:wrap;margin-top:40px}
.grande{aspect-ratio:21/9;background-size:cover;background-position:center;background-color:#eee}
section{padding:120px 0;border-top:1px solid var(--trait)}
section:nth-of-type(2){background:var(--fond);border-top:0}
.tete{display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:end;margin-bottom:56px}
.trio{display:grid;grid-template-columns:repeat(3,1fr);gap:32px}
.trio .img{aspect-ratio:4/3;background-size:cover;background-position:center;background-color:#eee}
.trio .txt{padding-top:20px}.trio p{margin-top:8px;font-size:14px;color:var(--gris)}
.galerie{display:grid;grid-template-columns:2fr 1fr 1fr;grid-template-rows:280px 280px;gap:8px}
.galerie div{background-size:cover;background-position:center;background-color:#eee}
.galerie div:first-child{grid-row:span 2}
.legende{margin-top:16px;font-size:14px;color:var(--gris)}
.venir{display:grid;grid-template-columns:1.3fr 1fr;border:1px solid var(--trait)}
.plan{position:relative;overflow:hidden;min-height:420px;background:#f2f2f2}
.tuiles{position:absolute;width:1280px;height:768px;filter:grayscale(1) contrast(.95)}
.tuiles img{position:absolute;width:256px;height:256px}
.repere{position:absolute;left:50%;top:50%;width:14px;height:14px;margin:-7px 0 0 -7px;background:var(--ton);outline:6px solid rgba(17,19,24,.18)}
.osm{position:absolute;right:0;bottom:0;font-size:12px;color:var(--texte);background:rgba(255,255,255,.85);padding:2px 8px}
.infos{padding:40px;display:flex;flex-direction:column;gap:28px}
.infos dt{font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:var(--gris)}
.infos dd{margin-top:6px;color:var(--encre)}.infos dd span{display:block}
footer{padding:32px 0;border-top:1px solid var(--trait);font-size:14px;color:var(--gris)}
.mobile{display:none}
@media (max-width:860px){h1{font-size:48px}h2{font-size:32px}nav{display:none}.tete,.venir{grid-template-columns:1fr}.trio{grid-template-columns:1fr}
.intro{padding-top:56px;padding-bottom:40px}.grande{aspect-ratio:4/3}
.galerie{grid-template-columns:1fr 1fr;grid-template-rows:220px 160px 160px}.galerie div:first-child{grid-column:span 2;grid-row:auto}
section{padding:80px 0}.plan{min-height:300px}.infos{padding:28px}
.mobile{display:block;position:fixed;left:0;right:0;bottom:0;z-index:10}.mobile .btn{display:block;text-align:center;padding:18px}footer{padding-bottom:88px}}
${v3 ? V3_CSS(polices) : ''}</style></head><body>
<div class="demo">Maquette de démonstration préparée par rAIme pour ${esc(v.nom)}. Les textes et les photos se finalisent ensemble.</div>
${v3 ? heroV3({ v, f, metier, lieu, horaires, photo, appel, itineraire, tel }) : `<div class="w"><header><span class="nom">${esc(v.nom)}</span><nav><a href="#prestations">Prestations</a><a href="#images">En images</a><a href="#venir">Nous trouver</a></nav></header></div>
<div class="w intro"><div class="et">${esc(metier)} · ${esc(v.ville)}</div><h1>${esc(v.nom)}</h1><p>${esc(f.accroche)}</p>
${appel ? `<div class="actions">${appel}</div>` : ''}</div>
<div class="grande"${photo(1)}></div>`}
<section id="prestations"><div class="w"><div class="tete"><div><div class="et">01 · Prestations</div><h2>Un savoir-faire <em>${esc(f.cle)}</em></h2></div>
<p>Chaque prestation se présente avec vos produits, vos tarifs si vous le souhaitez, et vos photos.</p></div>
<div class="trio">${f.rubriques.map((r, i) => `<div><div class="img"${photo(i + 2)}></div><div class="txt"><h3>${esc(r[0])}</h3><p>${esc(r[1])}</p></div></div>`).join('')}</div></div></section>
<section id="images"><div class="w"><div class="tete"><div><div class="et">02 · En images</div><h2>Votre travail, <em>en grand</em></h2></div>
<p>La boutique, l’équipe, les réalisations : vos propres photos prennent ces places.</p></div>
<div class="galerie">${[5, 6, 7, 8, 9].map((i) => `<div${photo(i)}></div>`).join('')}</div><p class="legende">Photos d’exemple, libres de droits.</p></div></section>
<section id="venir"><div class="w"><div class="tete"><div><div class="et">03 · Nous trouver</div><h2>À <em>${esc(v.ville)}</em></h2></div></div>
<div class="venir"><div class="plan">${plan ? `${plan}<span class="osm">© OpenStreetMap</span>` : ''}<div class="repere"></div></div>
<dl class="infos"><div><dt>Adresse</dt><dd>${esc(lieu)}</dd></div>${v.telephone ? `<div><dt>Téléphone</dt><dd>${esc(v.telephone)}</dd></div>` : ''}
<div><dt>Horaires</dt><dd>${horaires ? horaires.map((l) => `<span>${esc(l)}</span>`).join('') : 'À préciser ensemble'}</dd></div>
<div class="actions" style="margin-top:0">${route}</div></dl></div></div></section>
<footer><div class="w">${esc(v.nom)}. Maquette réalisée par rAIme, raime.fr. Photos d’exemple Pixabay${plan ? ', carte © OpenStreetMap' : ''}.</div></footer>
${appel ? `<div class="mobile">${appel}</div>` : ''}
</body></html>`;
}

// ── LE HÉROS v3 (07/10/2026, à valider par Basile) ───────────────────────────────────────────────────────────────
// Basile : « le héros est beaucoup trop basique, pas beau ; et la typographie ». Plein écran sur la photo du métier, le
// nom du commerce en grand dans une serif d'affichage (Instrument Serif), le texte en Inter ; les vraies informations
// (adresse, téléphone, horaires) dans un encart ; deux actions claires. Polices hébergées par le Cockpit (aucun appel à
// Google pour les visiteurs). Trois tailles de titres, texte 18/14, l'italique réservé au mot-clé. Sans script (la page
// est servie sans JavaScript) ; animations en CSS, coupées si le visiteur préfère moins de mouvement.
function heroV3({ v, f, metier, lieu, horaires, photo, appel, itineraire, tel }) {
  const h = horaires && horaires.length ? horaires : null;
  return `<header class="hero">
<div class="fond"${photo(1)}></div><div class="voile"></div>
<div class="w barre"><span class="nom">${esc(v.nom)}</span><nav><a href="#prestations">Prestations</a><a href="#images">En images</a><a href="#venir">Nous trouver</a></nav>
${tel ? `<a class="appel" href="tel:${esc(tel)}">${esc(v.telephone)}</a>` : ''}</div>
<div class="w contenu"><div class="texte">
<div class="et">${esc(metier)} — ${esc(v.ville)}</div>
<h1>${esc(v.nom)}</h1>
<p class="accroche">${esc(f.accroche)}</p>
<div class="actions">${appel.replace('class="btn"', 'class="btn clair"')}<a class="lien clair" href="${esc(itineraire)}" target="_blank" rel="noopener">Itinéraire</a></div></div>
<dl class="encart"><div><dt>Adresse</dt><dd>${esc(lieu)}</dd></div>${v.telephone ? `<div><dt>Téléphone</dt><dd>${esc(v.telephone)}</dd></div>` : ''}
${h ? `<div><dt>Horaires</dt><dd>${h.slice(0, 3).map((l) => `<span>${esc(l)}</span>`).join('')}${h.length > 3 ? '<a href="#venir">Tous les horaires</a>' : ''}</dd></div>` : ''}</dl></div>
<a class="defiler" href="#prestations" aria-label="Découvrir">Découvrir</a>
</header>`;
}

const V3_CSS = (polices) => `
@font-face{font-family:"Inter";src:url('${polices}/InterVariable.woff2') format('woff2');font-weight:100 900;font-display:swap}
@font-face{font-family:"Instrument Serif";src:url('${polices}/InstrumentSerif-Regular.woff2') format('woff2');font-weight:400;font-style:normal;font-display:swap}
@font-face{font-family:"Instrument Serif";src:url('${polices}/InstrumentSerif-Italic.woff2') format('woff2');font-weight:400;font-style:italic;font-display:swap}
body{font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;font-feature-settings:"ss01","cv11"}
h1,h2{font-family:"Instrument Serif",Georgia,"Times New Roman",serif;font-weight:400;letter-spacing:-.01em}
h2{font-size:clamp(40px,5vw,68px);line-height:1.02}
h2 em,.hero em{font-family:"Instrument Serif",Georgia,serif;font-style:italic;font-weight:400}
h3{font-size:22px;letter-spacing:-.01em}
.demo{position:relative;z-index:3;background:#0d0e10;color:#b9bcc2;border:0;font-size:12px;letter-spacing:.02em}
.hero{position:relative;height:auto;min-height:calc(100svh - 33px);display:flex;flex-direction:column;justify-content:flex-start;align-items:stretch;color:#fff;overflow:hidden;background:#15171b}
.hero .fond{position:absolute;inset:0;background-size:cover;background-position:center;transform:scale(1.06);animation:respire 14s ease-out forwards}
.hero .voile{position:absolute;inset:0;background:linear-gradient(180deg,rgba(9,10,12,.55) 0%,rgba(9,10,12,.12) 30%,rgba(9,10,12,.2) 55%,rgba(9,10,12,.82) 100%)}
.hero .w{position:relative;z-index:2;width:100%}
.barre{display:flex;align-items:center;justify-content:space-between;gap:24px;height:88px}
.barre .nom{color:#fff;font-family:"Instrument Serif",Georgia,serif;font-size:26px;font-weight:400;letter-spacing:0}
.barre nav{color:rgba(255,255,255,.82)}.barre nav a:hover{color:#fff}
.appel{font-size:14px;font-weight:500;padding:10px 18px;border:1px solid rgba(255,255,255,.45);border-radius:999px;color:#fff;transition:background .2s}
.appel:hover{background:rgba(255,255,255,.14)}
.contenu{margin-top:auto;display:grid;grid-template-columns:1fr 340px;gap:48px;align-items:end;padding-bottom:72px}
.hero .et{color:rgba(255,255,255,.78);display:flex;align-items:center;gap:16px;margin-bottom:20px}
.hero .et::before{content:"";width:40px;height:1px;background:rgba(255,255,255,.7)}
.hero h1{color:#fff;font-size:clamp(64px,10.5vw,168px);line-height:.9;max-width:none;text-wrap:balance;text-shadow:0 2px 40px rgba(0,0,0,.25)}
.accroche{font-size:20px;line-height:1.5;color:rgba(255,255,255,.9);max-width:520px;margin-top:28px}
.hero .actions{margin-top:36px}
.btn.clair{background:#fff;color:#111318;border-radius:999px;padding:17px 30px;letter-spacing:.04em}
.btn.clair:hover{opacity:1;background:#ececec}
.lien.clair{border:1px solid rgba(255,255,255,.6);color:#fff;border-radius:999px;padding:16px 29px;letter-spacing:.04em}
.lien.clair:hover{background:#fff;color:#111318}
.encart{background:rgba(14,15,18,.42);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.16);
  padding:28px;display:flex;flex-direction:column;gap:20px}
.encart dt{font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:rgba(255,255,255,.6)}
.encart dd{margin-top:6px;font-size:15px;line-height:1.5;color:#fff}.encart dd span{display:block}.encart dd a{display:inline-block;margin-top:6px;font-size:13px;color:rgba(255,255,255,.7);text-decoration:underline;text-underline-offset:3px}
.defiler{position:absolute;z-index:2;left:50%;bottom:22px;transform:translateX(-50%);font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:rgba(255,255,255,.7)}
.defiler::after{content:"";display:block;width:1px;height:28px;margin:10px auto 0;background:linear-gradient(rgba(255,255,255,.8),transparent);animation:goutte 2.2s ease-in-out infinite}
.texte>*{opacity:0;transform:translateY(18px);animation:monte .9s cubic-bezier(.2,.7,.2,1) forwards}
.texte>.et{animation-delay:.1s}.texte>h1{animation-delay:.22s}.texte>.accroche{animation-delay:.4s}.texte>.actions{animation-delay:.55s}
.encart{opacity:0;animation:monte .9s cubic-bezier(.2,.7,.2,1) .7s forwards}
@keyframes monte{to{opacity:1;transform:none}}
@keyframes respire{to{transform:scale(1)}}
@keyframes goutte{0%,100%{opacity:.2;transform:scaleY(.6);transform-origin:top}50%{opacity:1;transform:scaleY(1)}}
@media (prefers-reduced-motion:reduce){.hero .fond,.texte>*,.encart,.defiler::after{animation:none;opacity:1;transform:none}}
@media (max-width:860px){.barre{height:68px}.barre .nom{font-size:22px}.contenu{grid-template-columns:1fr;gap:28px;padding-bottom:64px}
  .hero h1{font-size:clamp(52px,15vw,84px)}.accroche{font-size:18px}.encart{padding:20px}.defiler{display:none}
  .hero{min-height:auto}.contenu{padding-top:30vh}}`;

// Une maquette ne part jamais sans ses photos d'exemple ni sans les informations du commerce (règle de Basile, 01/10/2026).
export function maquetteComplete(v, html) {
  return !!(html && /\/demo\/img\//.test(html) && v.nom && v.ville && (v.telephone || v.adresse));
}
