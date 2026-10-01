// LA MAQUETTE D'UNE VITRINE — ce que le commerçant découvre en cliquant sur le lien de l'e-mail (v3, 01/10/2026).
//
// Basile : le gabarit sombre « boulangerie », mais plus moderne, avec les principes « Sam Crawford » de raime.fr :
// restriction volontaire. Une seule police ; titres en trois tailles (84, 48, 24), texte 18 et 14, une étiquette 12 en
// capitales ; trois couleurs et l'accent réservé au mot-clé et au bouton ; aucun bord arrondi, aucune ombre, aucun
// bandeau ; chaque information une seule fois ; des phrases simples. Jamais sans photos d'exemple ni sans les
// informations trouvées sur le commerce. Rien d'inventé (ni avis, ni prix) ; les horaires seulement s'ils sont connus.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const sansAccents = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export const cleMetier = (m) => sansAccents(m || 'commerce').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Par métier : [accent, nuit], le bouton d'action, la phrase d'accueil (vraie pour tout commerce du métier), le mot-clé
// (en italique, sur la première ligne du titre des prestations), et trois prestations type.
export const METIERS = {
  boulangerie: { c: ['#d9a35b', '#13100c'], action: 'Commander', accroche: 'Pains, viennoiseries et pâtisseries, faits pour le quartier.', cle: 'du jour',
    rubriques: [['Pains', 'Le pain de tous les jours et les spécialités de la maison.'], ['Viennoiseries', 'Croissants et pains au chocolat, chaque matin.'], ['Commandes', 'Gâteaux et grandes quantités, sur commande.']] },
  boucherie: { c: ['#d0614f', '#130c0b'], action: 'Commander', accroche: 'Viandes choisies, découpées à la demande.', cle: 'choisies',
    rubriques: [['Viandes', 'Bœuf, veau, agneau et volaille.'], ['Traiteur', 'Charcuterie et plats préparés.'], ['Commandes', 'Pièces préparées pour vos repas et vos fêtes.']] },
  fleuriste: { c: ['#e07ba3', '#120c10'], action: 'Commander un bouquet', accroche: 'Bouquets et compositions, pour chaque occasion.', cle: 'de saison',
    rubriques: [['Bouquets', 'Compositions de saison, à emporter ou à livrer.'], ['Événements', 'Mariages, anniversaires et cérémonies.'], ['Plantes', 'Plantes vertes et fleuries.']] },
  coiffeur: { c: ['#a593f2', '#0f0d16'], action: 'Prendre rendez-vous', accroche: 'Coupe, couleur et soin, sur rendez-vous.', cle: 'sur mesure',
    rubriques: [['Coupe', 'Femme, homme et enfant.'], ['Couleur', 'Couleur, mèches et balayage.'], ['Soin', 'Soins du cheveu et conseils.']] },
  'institut de beauté': { c: ['#dc93ae', '#140d10'], action: 'Prendre rendez-vous', accroche: 'Soins du visage, du corps et des mains.', cle: 'pour vous',
    rubriques: [['Visage', 'Soins adaptés à chaque peau.'], ['Mains et ongles', 'Manucure, pose et entretien.'], ['Corps', 'Massages et soins du corps.']] },
  'garage automobile': { c: ['#5b97ff', '#0a0d14'], action: 'Demander un devis', accroche: 'Entretien et réparation de votre véhicule.', cle: 'complet',
    rubriques: [['Entretien', 'Vidange, filtres et révision.'], ['Réparation', 'Freinage, distribution et embrayage.'], ['Pneus', 'Montage, équilibrage et parallélisme.']] },
  plombier: { c: ['#4fb0db', '#091018'], action: 'Demander une intervention', accroche: 'Dépannage, installation et entretien.', cle: 'rapide',
    rubriques: [['Dépannage', 'Fuites, engorgements et urgences.'], ['Installation', 'Salle de bain, cuisine et chauffe-eau.'], ['Entretien', 'Contrôles et remises en état.']] },
  électricien: { c: ['#f2b84b', '#12100a'], action: 'Demander une intervention', accroche: 'Installation, mise aux normes et dépannage.', cle: 'sûr',
    rubriques: [['Dépannage', 'Pannes et remises en service.'], ['Installation', 'Tableaux, prises et éclairage.'], ['Rénovation', 'Mise aux normes du logement.']] },
  serrurier: { c: ['#cdae5c', '#11100b'], action: 'Appeler', accroche: 'Ouverture de porte, serrures et sécurité.', cle: 'sécurisé',
    rubriques: [['Dépannage', 'Ouverture de porte et clés perdues.'], ['Serrures', 'Remplacement et renforcement.'], ['Sécurité', 'Portes blindées et conseil.']] },
  menuisier: { c: ['#c79a6e', '#12100c'], action: 'Demander un devis', accroche: 'Menuiserie et agencement sur mesure.', cle: 'sur mesure',
    rubriques: [['Agencement', 'Meubles et rangements.'], ['Menuiseries', 'Portes, fenêtres et escaliers.'], ['Rénovation', 'Réparations et finitions.']] },
  restaurant: { c: ['#e8834b', '#140f0b'], action: 'Réserver une table', accroche: 'Une cuisine à partager, midi et soir.', cle: 'à table',
    rubriques: [['La carte', 'Entrées, plats et desserts.'], ['Le midi', 'Formules et plat du jour.'], ['Groupes', 'Tables pour vos repas et événements.']] },
  pizzeria: { c: ['#e8653c', '#150d0a'], action: 'Commander', accroche: 'Pizzas sur place ou à emporter.', cle: 'au four',
    rubriques: [['Pizzas', 'Les classiques et les spécialités.'], ['À emporter', 'Commandez, passez la chercher.'], ['Sur place', 'Une table pour la manger chaude.']] },
  pressing: { c: ['#64c1bb', '#0a1313'], action: 'Appeler', accroche: 'Nettoyage, repassage et retouches.', cle: 'impeccable',
    rubriques: [['Nettoyage', 'Vêtements et textiles délicats.'], ['Repassage', 'Chemises et tenues prêtes à porter.'], ['Retouches', 'Ourlets et ajustements.']] },
  cordonnier: { c: ['#c0916a', '#120e0b'], action: 'Appeler', accroche: 'Chaussures, cuir et clés.', cle: 'qui dure',
    rubriques: [['Ressemelage', 'Talons, semelles et patins.'], ['Cuir', 'Sacs, ceintures et entretien.'], ['Clés', 'Reproduction de clés.']] },
  fromagerie: { c: ['#e8c45a', '#13110a'], action: 'Commander', accroche: 'Fromages choisis et affinés.', cle: 'affiné',
    rubriques: [['Fromages', 'La sélection du moment.'], ['Plateaux', 'Plateaux pour vos repas et vos fêtes.'], ['Épicerie fine', 'Les accompagnements.']] },
  caviste: { c: ['#c96883', '#130a0d'], action: 'Nous contacter', accroche: 'Vins et spiritueux, et le conseil qui va avec.', cle: 'choisi',
    rubriques: [['Vins', 'La sélection de la cave.'], ['Spiritueux', 'Whiskies, rhums et liqueurs.'], ['Conseil', 'L’accord pour chaque repas.']] },
  toiletteur: { c: ['#63bf88', '#0b120e'], action: 'Prendre rendez-vous', accroche: 'Toilettage pour chiens et chats.', cle: 'en douceur',
    rubriques: [['Toilettage', 'Bain, coupe et brushing.'], ['Soins', 'Griffes, oreilles et pelage.'], ['Conseil', 'L’entretien entre deux visites.']] },
  photographe: { c: ['#d8d8d8', '#0e0e0e'], action: 'Réserver une séance', accroche: 'Portraits, événements et photos professionnelles.', cle: 'qui reste',
    rubriques: [['Portraits', 'Seul, en couple ou en famille.'], ['Événements', 'Mariages et célébrations.'], ['Professionnels', 'Images pour les entreprises.']] },
  'peintre en bâtiment': { c: ['#5aa9e2', '#0a1017'], action: 'Demander un devis', accroche: 'Peinture intérieure et extérieure.', cle: 'soigné',
    rubriques: [['Intérieur', 'Peinture et papiers peints.'], ['Extérieur', 'Façades et boiseries.'], ['Rénovation', 'Préparation et remise à neuf.']] },
  paysagiste: { c: ['#74c068', '#0b120a'], action: 'Demander un devis', accroche: 'Création et entretien de jardins.', cle: 'vivant',
    rubriques: [['Création', 'Jardins et terrasses.'], ['Entretien', 'Taille, tonte et saisons.'], ['Plantations', 'Haies, massifs et arbres.']] },
};
const DEFAUT = { c: ['#9aa4ff', '#0f1016'], action: 'Nous contacter', accroche: 'Votre commerce, en ligne.', cle: 'reconnu',
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
export function carte(lat, lon, z = 16) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const n = 2 ** z, xf = ((lon + 180) / 360) * n, r = (lat * Math.PI) / 180;
  const yf = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
  const x0 = Math.floor(xf), y0 = Math.floor(yf), px = Math.round((xf - x0) * 256), py = Math.round((yf - y0) * 256);
  let tuiles = '';
  for (let dy = -1; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) {
    tuiles += `<img src="https://tile.openstreetmap.org/${z}/${x0 + dx}/${y0 + dy}.png" alt="" width="256" height="256" style="left:${(dx + 2) * 256}px;top:${(dy + 1) * 256}px">`;
  }
  return `<div class="tuiles" style="left:calc(50% - ${512 + px}px);top:calc(50% - ${256 + py}px)">${tuiles}</div>`;
}

// v : la fiche du commerce ; o.images : adresse des photos d'exemple (« https://cockpit.raime.fr/demo/img »).
export function maquettePremium(v, o = {}) {
  const f = fiche(v.metier), [a, nuit] = f.c;
  const tel = v.telephone ? String(v.telephone).replace(/[^\d+]/g, '') : '';
  const metier = v.metier ? v.metier.charAt(0).toUpperCase() + v.metier.slice(1) : 'Commerce';
  const lieu = v.adresse || v.ville;
  const itineraire = v.carte || `https://www.google.com/maps/search/${encodeURIComponent(`${v.nom} ${lieu}`)}`;
  const base = o.images ? `${o.images}/${cleMetier(v.metier)}` : null;
  const photo = (i) => (base ? ` style="background-image:url('${base}/${i}.jpg')"` : '');
  const plan = carte(Number(v.lat), Number(v.lon));
  const horaires = Array.isArray(v.horaires) ? v.horaires : horairesLisibles(v.horaires);
  const appel = tel ? `<a class="btn" href="tel:${esc(tel)}">${esc(f.action)}</a>` : '';
  const route = `<a class="lien" href="${esc(itineraire)}" target="_blank" rel="noopener">Itinéraire</a>`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(v.nom)} · ${esc(metier)} à ${esc(v.ville)}</title><style>
:root{--a:${a};--n:${nuit};--encre:#f3efe8;--texte:#c4beb4;--gris:#8c867d;--trait:rgba(255,255,255,.12)}
*{box-sizing:border-box;margin:0;border-radius:0}html{scroll-behavior:smooth}
body{font:400 18px/1.6 Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--texte);background:var(--n);-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}.w{max-width:1160px;margin:0 auto;padding:0 24px}
.demo{font-size:14px;color:var(--gris);text-align:center;padding:8px 16px;border-bottom:1px solid var(--trait)}
header{display:flex;align-items:center;justify-content:space-between;height:72px}
.nom{color:var(--encre);font-weight:600;font-size:18px}
nav{display:flex;gap:32px;font-size:14px}nav a:hover{color:var(--encre)}
.btn,.lien{display:inline-block;padding:16px 28px;font-weight:600;font-size:14px;letter-spacing:.06em;text-transform:uppercase;transition:opacity .2s,border-color .2s}
.btn{background:var(--a);color:#0d0c0a}.btn:hover{opacity:.85}
.lien{padding:15px 27px;border:1px solid var(--trait);color:var(--encre)}.lien:hover{border-color:var(--encre)}
.hero{position:relative;min-height:min(86vh,820px);display:flex;align-items:flex-end;padding:96px 0 80px;background-size:cover;background-position:center;background-color:#222;isolation:isolate}
.hero::before{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(90deg,rgba(0,0,0,.86) 0%,rgba(0,0,0,.6) 50%,rgba(0,0,0,.25) 100%),linear-gradient(180deg,transparent 55%,var(--n) 100%)}
.et{font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:var(--gris);margin-bottom:24px}
h1{font-size:84px;line-height:1;font-weight:600;letter-spacing:-.03em;color:var(--encre);max-width:900px;overflow-wrap:anywhere}
h2{font-size:48px;line-height:1.08;font-weight:600;letter-spacing:-.02em;color:var(--encre);max-width:760px}
h3{font-size:24px;line-height:1.2;font-weight:600;color:var(--encre)}
em{font-style:italic;font-weight:400;color:var(--a)}
.hero p{max-width:560px;margin-top:24px;color:var(--encre)}.actions{display:flex;gap:16px;flex-wrap:wrap;margin-top:40px}
section{padding:120px 0;border-top:1px solid var(--trait)}
.tete{display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:end;margin-bottom:56px}
.trio{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--trait);border:1px solid var(--trait)}
.trio>div{background:var(--n)}.trio .img{aspect-ratio:4/3;background-size:cover;background-position:center;background-color:#222}
.trio .txt{padding:28px}.trio p{margin-top:8px;font-size:14px;color:var(--gris)}
.galerie{display:grid;grid-template-columns:2fr 1fr 1fr;grid-template-rows:280px 280px;gap:8px}
.galerie div{background-size:cover;background-position:center;background-color:#222}
.galerie div:first-child{grid-row:span 2}
.legende{margin-top:16px;font-size:14px;color:var(--gris)}
.venir{display:grid;grid-template-columns:1.3fr 1fr;border:1px solid var(--trait)}
.plan{position:relative;overflow:hidden;min-height:420px;background:#1b1d21}
.tuiles{position:absolute;width:1280px;height:768px;filter:grayscale(1) invert(1) contrast(.8) brightness(.8)}
.tuiles img{position:absolute;width:256px;height:256px}
.repere{position:absolute;left:50%;top:50%;width:14px;height:14px;margin:-7px 0 0 -7px;background:var(--a);outline:6px solid color-mix(in srgb,var(--a) 30%,transparent)}
.osm{position:absolute;right:0;bottom:0;font-size:12px;color:#ddd;background:rgba(0,0,0,.6);padding:2px 8px}
.infos{padding:40px;display:flex;flex-direction:column;gap:28px}
.infos dt{font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:var(--gris)}
.infos dd{margin-top:6px;color:var(--encre)}.infos dd span{display:block}
footer{padding:32px 0;border-top:1px solid var(--trait);font-size:14px;color:var(--gris)}
.mobile{display:none}
@media (max-width:860px){h1{font-size:48px}h2{font-size:32px}nav{display:none}.tete,.venir{grid-template-columns:1fr}.trio{grid-template-columns:1fr}
.galerie{grid-template-columns:1fr 1fr;grid-template-rows:220px 160px 160px}.galerie div:first-child{grid-column:span 2;grid-row:auto}
section{padding:80px 0}.hero{min-height:min(80vh,700px)}.plan{min-height:300px}.infos{padding:28px}
.mobile{display:block;position:fixed;left:0;right:0;bottom:0;z-index:10}.mobile .btn{display:block;text-align:center;padding:18px}footer{padding-bottom:88px}}
</style></head><body>
<div class="demo">Maquette de démonstration préparée par rAIme pour ${esc(v.nom)}. Les textes et les photos se finalisent ensemble.</div>
<div class="w"><header><span class="nom">${esc(v.nom)}</span><nav><a href="#prestations">Prestations</a><a href="#images">En images</a><a href="#venir">Nous trouver</a></nav></header></div>
<div class="hero"${photo(1)}><div class="w"><div class="et">${esc(metier)} · ${esc(v.ville)}</div><h1>${esc(v.nom)}</h1><p>${esc(f.accroche)}</p>
${appel ? `<div class="actions">${appel}</div>` : ''}</div></div>
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

// Une maquette ne part jamais sans ses photos d'exemple ni sans les informations du commerce (règle de Basile, 01/10/2026).
export function maquetteComplete(v, html) {
  return !!(html && /\/demo\/img\//.test(html) && v.nom && v.ville && (v.telephone || v.adresse));
}
