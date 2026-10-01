// LA MAQUETTE D'UNE VITRINE — ce que le commerçant découvre en cliquant sur le lien de l'e-mail (01/10/2026, v2).
//
// Basile : « balancer 500 euros pour la maquette qu'on envoie, c'est se tirer une balle dans le pied » ; il retient le
// gabarit « boulangerie » (sombre, chaleureux), avec de vraies photos du métier, la carte dès que l'adresse est connue,
// un bouton d'action propre au métier, quelque chose de plus net et de plus dessiné.
// Règles : rien d'inventé sur le commerce (ni avis, ni prix, ni horaires) ; les photos sont des exemples libres de droits
// (Pixabay), servies par le Cockpit ; la carte vient d'OpenStreetMap (crédit affiché) ; aucun script.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const sansAccents = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export const cleMetier = (m) => sansAccents(m || 'commerce').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Par métier : couleurs [accent, accent clair, nuit], le bouton d'action, une phrase d'accroche (vraie pour tout commerce
// du métier), trois rubriques type, et la recherche de photos (en anglais : bien plus de résultats).
export const METIERS = {
  boulangerie: { c: ['#d9a35b', '#f3d9a4', '#14100b'], action: 'Commander', accroche: 'Le pain, les viennoiseries et les douceurs du quartier, à deux pas de chez vous.',
    rubriques: [['Pains', 'Le pain de chaque jour et vos spécialités.'], ['Viennoiseries', 'Croissants, pains au chocolat et gourmandises du matin.'], ['Pâtisseries & commandes', 'Gâteaux et commandes pour vos occasions.']],
    photos: 'bakery bread croissant' },
  boucherie: { c: ['#c4473a', '#f2b8a8', '#140c0b'], action: 'Commander', accroche: 'Des viandes choisies et le conseil d’un artisan, près de chez vous.',
    rubriques: [['Viandes', 'Bœuf, veau, agneau, volaille : les pièces de la vitrine.'], ['Charcuterie & traiteur', 'Préparations maison et plats à emporter.'], ['Commandes', 'Pièces à préparer pour vos repas et vos fêtes.']],
    photos: 'butcher meat steak' },
  fleuriste: { c: ['#e06b9a', '#f7c6d9', '#130c11'], action: 'Commander un bouquet', accroche: 'Des fleurs pour chaque moment, composées avec soin.',
    rubriques: [['Bouquets', 'Compositions de saison, du simple au généreux.'], ['Événements', 'Mariages, anniversaires, cérémonies.'], ['Plantes', 'Plantes vertes et fleuries pour la maison.']],
    photos: 'florist flower bouquet' },
  coiffeur: { c: ['#a593f2', '#dcd5fd', '#0f0d17'], action: 'Prendre rendez-vous', accroche: 'Coupe, couleur, soin : un salon qui prend le temps de vous écouter.',
    rubriques: [['Coupes', 'Femme, homme, enfant.'], ['Couleur', 'Couleur, mèches, balayage.'], ['Soins', 'Soins du cheveu et conseils.']],
    photos: 'hair salon hairdresser' },
  'institut de beauté': { c: ['#d98aa8', '#f6d3e0', '#150d11'], action: 'Prendre rendez-vous', accroche: 'Un moment pour vous, entre de bonnes mains.',
    rubriques: [['Soins du visage', 'Soins adaptés à votre peau.'], ['Mains & ongles', 'Manucure, pose, entretien.'], ['Bien-être', 'Massages et soins du corps.']],
    photos: 'manicure nails beauty salon' },
  'garage automobile': { c: ['#4c8dff', '#bcd4ff', '#0a0e16'], action: 'Demander un devis', accroche: 'L’entretien et la réparation de votre véhicule, par des mains expertes.',
    rubriques: [['Entretien', 'Vidange, filtres, révision.'], ['Réparations', 'Freinage, distribution, embrayage.'], ['Pneus', 'Montage, équilibrage, parallélisme.']],
    photos: 'car mechanic garage repair' },
  plombier: { c: ['#38a3d1', '#bfe6f5', '#09111a'], action: 'Demander une intervention', accroche: 'Fuites, installations, dépannages : un plombier joignable et réactif.',
    rubriques: [['Dépannage', 'Fuites, engorgements, urgences.'], ['Installation', 'Salle de bain, cuisine, chauffe-eau.'], ['Entretien', 'Contrôles et remises en état.']],
    photos: 'plumber plumbing pipes' },
  électricien: { c: ['#f2b233', '#fbe2a6', '#13100a'], action: 'Demander une intervention', accroche: 'Installations électriques sûres et dépannages, du neuf à la rénovation.',
    rubriques: [['Dépannage', 'Pannes, disjonctions, remises en service.'], ['Installation', 'Tableaux, prises, éclairage.'], ['Rénovation', 'Mise aux normes de votre logement.']],
    photos: 'electrician electrical work' },
  serrurier: { c: ['#c9a54b', '#efdca9', '#11100b'], action: 'Appeler', accroche: 'Ouverture de porte, serrures, sécurité : un serrurier près de chez vous.',
    rubriques: [['Dépannage', 'Ouverture de porte, clés perdues.'], ['Serrures', 'Remplacement et renforcement.'], ['Sécurité', 'Portes blindées et conseils.']],
    photos: 'locksmith keys lock' },
  menuisier: { c: ['#c08f62', '#ead2bb', '#13100c'], action: 'Demander un devis', accroche: 'Le bois travaillé sur mesure, de l’agencement aux finitions.',
    rubriques: [['Sur mesure', 'Meubles et agencements.'], ['Menuiseries', 'Portes, fenêtres, escaliers.'], ['Rénovation', 'Réparations et finitions.']],
    photos: 'carpenter woodworking workshop' },
  restaurant: { c: ['#e5753a', '#f8c9ad', '#150f0b'], action: 'Réserver une table', accroche: 'Une table où l’on revient, une cuisine qui donne envie.',
    rubriques: [['La carte', 'Entrées, plats, desserts.'], ['Le midi', 'Formules et plats du jour.'], ['Réservations', 'Tables pour vos repas et vos groupes.']],
    photos: 'restaurant food dish' },
  pizzeria: { c: ['#e4572e', '#f6c1ae', '#160d0a'], action: 'Commander', accroche: 'Des pizzas généreuses, à déguster sur place ou à emporter.',
    rubriques: [['Pizzas', 'Les classiques et les spécialités de la maison.'], ['À emporter', 'Commandez, passez la chercher.'], ['Sur place', 'Une table pour en profiter chaud.']],
    photos: 'pizza wood oven' },
  pressing: { c: ['#5cb8b2', '#c7ebe8', '#0a1313'], action: 'Appeler', accroche: 'Vos vêtements entre de bonnes mains, nettoyés et repassés avec soin.',
    rubriques: [['Nettoyage', 'Vêtements, textiles délicats.'], ['Repassage', 'Chemises et tenues prêtes à porter.'], ['Retouches', 'Ourlets et ajustements.']],
    photos: 'dry cleaning laundry shirts' },
  cordonnier: { c: ['#b5845a', '#e3c8b0', '#120e0b'], action: 'Appeler', accroche: 'Chaussures, cuir et clés : le savoir-faire qui fait durer.',
    rubriques: [['Ressemelage', 'Talons, semelles, patins.'], ['Cuir', 'Sacs, ceintures, entretien.'], ['Clés', 'Reproduction de clés.']],
    photos: 'shoemaker leather shoes repair' },
  fromagerie: { c: ['#e8c14d', '#f7e6ad', '#14110a'], action: 'Commander', accroche: 'Des fromages choisis et affinés, et le conseil pour bien les servir.',
    rubriques: [['Fromages', 'La sélection du moment.'], ['Plateaux', 'Plateaux pour vos repas et vos fêtes.'], ['Épicerie fine', 'Les accompagnements.']],
    photos: 'cheese shop cheeses' },
  caviste: { c: ['#c25a74', '#e9b4c1', '#140a0e'], action: 'Nous contacter', accroche: 'Des vins choisis avec soin, et le bon conseil pour chaque occasion.',
    rubriques: [['Vins', 'La sélection de la cave.'], ['Spiritueux', 'Whiskies, rhums, liqueurs.'], ['Conseil', 'L’accord parfait pour votre repas.']],
    photos: 'wine cellar bottles' },
  toiletteur: { c: ['#58b67f', '#c5ead5', '#0b130e'], action: 'Prendre rendez-vous', accroche: 'Le soin de votre compagnon, avec douceur et patience.',
    rubriques: [['Toilettage', 'Bain, coupe, brushing.'], ['Soins', 'Griffes, oreilles, pelage.'], ['Conseils', 'L’entretien entre deux visites.']],
    photos: 'dog grooming' },
  photographe: { c: ['#d4d4d4', '#f0f0f0', '#0e0e0e'], action: 'Réserver une séance', accroche: 'Des images qui vous ressemblent, pour vos moments qui comptent.',
    rubriques: [['Portraits', 'Seul, en couple, en famille.'], ['Événements', 'Mariages et célébrations.'], ['Professionnels', 'Images pour les entreprises.']],
    photos: 'photographer camera studio' },
  'peintre en bâtiment': { c: ['#4fa3e0', '#c4e1f6', '#0a1017'], action: 'Demander un devis', accroche: 'Murs, plafonds, façades : des finitions nettes et durables.',
    rubriques: [['Intérieur', 'Peinture et papiers peints.'], ['Extérieur', 'Façades et boiseries.'], ['Rénovation', 'Préparation et remise à neuf.']],
    photos: 'painter painting wall roller' },
  paysagiste: { c: ['#6dbb61', '#cae8c4', '#0b120a'], action: 'Demander un devis', accroche: 'Des jardins pensés pour vous, créés et entretenus avec soin.',
    rubriques: [['Création', 'Aménagement de jardins et terrasses.'], ['Entretien', 'Taille, tonte, saisons.'], ['Plantations', 'Haies, massifs, arbres.']],
    photos: 'garden landscaping' },
};
const DEFAUT = { c: ['#9aa4ff', '#dfe2ff', '#0f1016'], action: 'Nous contacter', accroche: 'Votre commerce, présenté comme il le mérite.',
  rubriques: [['Nos services', 'Ce que nous proposons.'], ['Nos réalisations', 'Notre savoir-faire en images.'], ['Nous contacter', 'Une question, un projet.']], photos: 'small shop' };
export const fiche = (metier) => METIERS[metier] || DEFAUT;

const ICONES = {
  tel: '<path d="M5 3h3l2 5-2.5 1.5a11 11 0 0 0 5 5L14 12l5 2v3a2 2 0 0 1-2 2A15 15 0 0 1 3 5a2 2 0 0 1 2-2z"/>',
  repere: '<path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
  horloge: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  fleche: '<path d="M5 12h14M13 6l6 6-6 6"/>',
};
const svg = (t) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${t}</svg>`;

// La carte : des tuiles OpenStreetMap posées autour du point (aucun script), assombries pour le thème, un repère au centre.
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

// v : la fiche du commerce ; o.images : adresse des photos (« https://cockpit.raime.fr/demo/img ») ; o.photos : nombre disponible.
export function maquettePremium(v, o = {}) {
  const f = fiche(v.metier), [a, a2, nuit] = f.c;
  const tel = v.telephone ? String(v.telephone).replace(/[^\d+]/g, '') : '';
  const metier = v.metier ? v.metier.charAt(0).toUpperCase() + v.metier.slice(1) : 'Commerce';
  const lieu = v.adresse || v.ville;
  const itineraire = v.carte || `https://www.google.com/maps/search/${encodeURIComponent(`${v.nom} ${lieu}`)}`;
  const base = o.images ? `${o.images}/${cleMetier(v.metier)}` : null;
  const photo = (i) => (base ? `${base}/${i}.jpg` : null);
  const action = tel ? `<a class="btn p" href="tel:${esc(tel)}">${svg(ICONES.tel)}${esc(f.action)}</a>` : `<a class="btn p" href="#venir">${esc(f.action)}</a>`;
  const plan = carte(Number(v.lat), Number(v.lon));
  const fond = photo(1) ? `<div class="fond" style="background-image:url('${photo(1)}')"></div>` : '';
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(v.nom)} · ${esc(metier)} à ${esc(v.ville)}</title><style>
:root{--a:${a};--a2:${a2};--n:${nuit};--t:#f5f1ea;--d:#b9b1a6;--l:rgba(255,255,255,.1)}
*{box-sizing:border-box;margin:0}html{scroll-behavior:smooth}
body{font:17px/1.65 Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--t);background:var(--n);-webkit-font-smoothing:antialiased;overflow-x:hidden}
.serif{font-family:"Iowan Old Style","Palatino Linotype",Palatino,"Book Antiqua",Georgia,serif;font-weight:500;letter-spacing:-.01em}
a{color:inherit}.w{max-width:1120px;margin:0 auto;padding:0 22px}
.demo{background:#000;color:#cfc8bd;font-size:12.5px;text-align:center;padding:8px 14px;border-bottom:1px solid var(--l)}
.demo b{color:var(--a2);font-weight:600}
.barre{position:sticky;top:0;z-index:20;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);background:color-mix(in srgb,var(--n) 72%,transparent);border-bottom:1px solid var(--l)}
.barre .w{display:flex;align-items:center;justify-content:space-between;height:64px}
.marque{display:flex;align-items:center;gap:12px;font-weight:600;letter-spacing:.02em}
.mono{width:36px;height:36px;border-radius:10px;display:grid;place-items:center;border:1px solid var(--a);color:var(--a2);font-size:15px}
.barre nav{display:flex;gap:26px;font-size:14.5px;color:var(--d)}.barre nav a{text-decoration:none}.barre nav a:hover{color:var(--t)}
.btn{display:inline-flex;align-items:center;gap:10px;padding:14px 24px;border-radius:999px;text-decoration:none;font-weight:600;font-size:15.5px;transition:transform .25s,background .25s,box-shadow .25s}
.btn svg{width:18px;height:18px}.p{background:var(--a);color:#120f0b;box-shadow:0 14px 34px -14px var(--a)}.p:hover{transform:translateY(-2px)}
.s{border:1px solid rgba(255,255,255,.32);color:#fff;backdrop-filter:blur(6px)}.s:hover{background:rgba(255,255,255,.08)}
.petit{padding:10px 18px;font-size:14px}
.hero{position:relative;min-height:min(88vh,860px);display:flex;align-items:flex-end;padding:120px 0 72px;overflow:hidden;isolation:isolate}
.fond{position:absolute;inset:0;z-index:-2;background-size:cover;background-position:center;transform:scale(1.06);animation:respire 18s ease-in-out infinite alternate}
@keyframes respire{to{transform:scale(1.13)}}
.hero::before{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(90deg,rgba(0,0,0,.82) 0%,rgba(0,0,0,.55) 45%,rgba(0,0,0,.18) 100%),linear-gradient(180deg,rgba(0,0,0,.2) 0%,transparent 45%,var(--n) 100%)}
h1,.l{text-shadow:0 2px 24px rgba(0,0,0,.45)}
.k{display:inline-flex;align-items:center;gap:10px;color:var(--a2);font-weight:600;letter-spacing:.18em;text-transform:uppercase;font-size:12.5px;animation:monte .9s both}
.k::before{content:"";width:28px;height:1px;background:var(--a2)}
h1{font-size:clamp(48px,9vw,120px);line-height:.95;margin:18px 0 22px;overflow-wrap:anywhere;animation:monte 1s .1s both}
.l{font-size:clamp(18px,2.2vw,22px);max-width:600px;color:#e6dfd5;animation:monte 1s .2s both}
.b{display:flex;gap:12px;flex-wrap:wrap;margin-top:32px;animation:monte 1s .3s both}
.puces{display:flex;gap:10px;flex-wrap:wrap;margin-top:34px;animation:monte 1s .4s both}
.puce{display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border-radius:999px;background:rgba(0,0,0,.35);border:1px solid var(--l);font-size:14px;color:#e6dfd5;backdrop-filter:blur(8px)}
.puce svg{width:15px;height:15px;color:var(--a2)}
@keyframes monte{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
section{padding:110px 0}.et{display:flex;align-items:baseline;gap:14px;margin-bottom:14px;color:var(--a2);font-size:13px;letter-spacing:.16em;text-transform:uppercase;font-weight:600}
.et i{font-style:normal;color:var(--d)}.t{font-size:clamp(32px,4.8vw,56px);line-height:1.05;max-width:760px}
.st{color:var(--d);margin-top:16px;max-width:620px}
.trio{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:52px}
.carte{border-radius:22px;overflow:hidden;background:rgba(255,255,255,.035);border:1px solid var(--l);transition:transform .35s,border-color .35s}
.carte:hover{transform:translateY(-6px);border-color:color-mix(in srgb,var(--a) 55%,transparent)}
.carte .img{aspect-ratio:4/3;background-size:cover;background-position:center;background-color:rgba(255,255,255,.04)}
.carte .txt{padding:22px 22px 26px}.carte h3{font-size:24px;margin-bottom:6px}.carte p{color:var(--d);font-size:15.5px}
.ac{display:inline-block;margin-top:14px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--a2);border:1px dashed rgba(255,255,255,.25);border-radius:999px;padding:4px 10px}
.bande{border-top:1px solid var(--l);border-bottom:1px solid var(--l);padding:26px 0;overflow:hidden;white-space:nowrap}
.bande span{display:inline-block;padding-right:56px;font-size:clamp(22px,3vw,34px);color:color-mix(in srgb,var(--t) 82%,transparent);animation:defile 32s linear infinite}
.bande span em{font-style:normal;color:var(--a)}
@keyframes defile{to{transform:translateX(-100%)}}
.galerie{display:grid;grid-template-columns:2fr 1fr 1fr;grid-template-rows:240px 240px;gap:16px;margin-top:48px}
.galerie div{border-radius:20px;background-size:cover;background-position:center;position:relative;overflow:hidden;background-color:rgba(255,255,255,.04)}
.galerie div:first-child{grid-row:span 2}
.galerie div::after{content:"Photo d’exemple";position:absolute;left:14px;bottom:12px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#fff;background:rgba(0,0,0,.45);padding:4px 9px;border-radius:999px}
.etapes{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:48px;counter-reset:e}
.etape{padding:26px;border-radius:20px;border:1px solid var(--l);counter-increment:e}
.etape::before{content:"0" counter(e);display:block;font-family:"Iowan Old Style",Georgia,serif;font-size:42px;color:var(--a);margin-bottom:8px}
.etape h3{font-size:19px;margin-bottom:4px}.etape p{color:var(--d);font-size:15px}
.venir{display:grid;grid-template-columns:1.25fr 1fr;gap:28px;align-items:stretch;margin-top:48px}
.plan{position:relative;border-radius:24px;overflow:hidden;border:1px solid var(--l);min-height:380px;background:#1a1d22}
.tuiles{position:absolute;width:1280px;height:768px;filter:grayscale(1) invert(1) contrast(.85) brightness(.85)}
.tuiles img{position:absolute;width:256px;height:256px}
.repere{position:absolute;left:50%;top:50%;transform:translate(-50%,-100%);color:var(--a);filter:drop-shadow(0 6px 14px rgba(0,0,0,.6))}
.repere svg{width:46px;height:46px}.repere svg path{fill:var(--a);stroke:#000}.repere svg circle{fill:var(--n);stroke:none}
.halo{position:absolute;left:50%;top:50%;width:90px;height:90px;margin:-45px 0 0 -45px;border-radius:50%;background:color-mix(in srgb,var(--a) 30%,transparent);animation:pulse 2.4s ease-out infinite}
@keyframes pulse{from{transform:scale(.3);opacity:.9}to{transform:scale(1.6);opacity:0}}
.osm{position:absolute;right:10px;bottom:8px;font-size:11px;color:#ddd;background:rgba(0,0,0,.55);padding:2px 8px;border-radius:6px}
.coord{border-radius:24px;border:1px solid var(--l);padding:30px;display:flex;flex-direction:column;gap:20px;background:rgba(255,255,255,.03)}
.ligne{display:flex;gap:14px;align-items:flex-start}.ligne .ic{width:42px;height:42px;flex:none;border-radius:12px;display:grid;place-items:center;background:rgba(255,255,255,.06);color:var(--a2)}
.ligne .ic svg{width:20px;height:20px}.ligne b{display:block;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--d);font-weight:600}
.fin{text-align:center;padding:120px 0;background:radial-gradient(60% 80% at 50% 100%,color-mix(in srgb,var(--a) 22%,transparent),transparent 70%)}
.fin .b{justify-content:center;animation:none}
footer{padding:36px 0 40px;border-top:1px solid var(--l);font-size:13.5px;color:#8c857b}
.appel{position:fixed;left:12px;right:12px;bottom:12px;z-index:30;display:none}.appel .btn{width:100%;justify-content:center}
@supports (animation-timeline:view()){.rv{animation:monte linear both;animation-timeline:view();animation-range:entry 0% cover 25%}}
@media (max-width:860px){.barre nav{display:none}.trio,.etapes{grid-template-columns:1fr}.galerie{grid-template-columns:1fr 1fr;grid-template-rows:200px 160px 160px}
.galerie div:first-child{grid-column:span 2;grid-row:auto}.venir{grid-template-columns:1fr}.appel{display:block}footer{padding-bottom:100px}section{padding:84px 0}.hero{min-height:min(82vh,760px)}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style></head><body>
<div class="demo"><b>Maquette de démonstration</b> préparée par rAIme pour ${esc(v.nom)} · textes et photos à finaliser ensemble.</div>
<header class="barre"><div class="w"><div class="marque"><span class="mono serif">${esc(String(v.nom).trim().charAt(0).toUpperCase())}</span>${esc(v.nom)}</div>
<nav><a href="#offre">${esc(f.rubriques[0][0])}</a><a href="#images">En images</a><a href="#venir">Nous trouver</a></nav>
${tel ? `<a class="btn p petit" href="tel:${esc(tel)}">${svg(ICONES.tel)}Appeler</a>` : ''}</div></header>
<section class="hero">${fond}<div class="w"><div class="k">${esc(metier)} · ${esc(v.ville)}</div>
<h1 class="serif">${esc(v.nom)}</h1><p class="l">${esc(f.accroche)}</p>
<div class="b">${action}<a class="btn s" href="${esc(itineraire)}" target="_blank" rel="noopener">${svg(ICONES.repere)}Itinéraire</a></div>
<div class="puces"><span class="puce">${svg(ICONES.repere)}${esc(lieu)}</span>${v.telephone ? `<span class="puce">${svg(ICONES.tel)}${esc(v.telephone)}</span>` : ''}<span class="puce">${svg(ICONES.horloge)}Horaires à compléter</span></div></div></section>
<section id="offre"><div class="w"><div class="et">01 <i>·</i> Ce que nous proposons</div><h2 class="t serif rv">${esc(f.rubriques.map((r, i) => (i ? r[0].charAt(0).toLowerCase() + r[0].slice(1) : r[0])).join(', ').replace(/, ([^,]*)$/, ' et $1'))}.</h2>
<p class="st rv">Chaque rubrique se complète avec vos produits, vos prestations et vos prix.</p><div class="trio">
${f.rubriques.map((r, i) => `<div class="carte rv"><div class="img"${photo(i + 2) ? ` style="background-image:url('${photo(i + 2)}')"` : ''}></div><div class="txt"><h3 class="serif">${esc(r[0])}</h3><p>${esc(r[1])}</p><span class="ac">À compléter avec vous</span></div></div>`).join('')}
</div></div></section>
<div class="bande" aria-hidden="true"><span>${f.rubriques.map((r) => `${esc(r[0])} <em>·</em> `).join('')}${esc(v.ville)} <em>·</em> </span><span>${f.rubriques.map((r) => `${esc(r[0])} <em>·</em> `).join('')}${esc(v.ville)} <em>·</em> </span></div>
<section id="images"><div class="w"><div class="et">02 <i>·</i> En images</div><h2 class="t serif rv">Vos photos, mises en valeur.</h2>
<p class="st rv">Ici, la boutique, l’équipe, le savoir-faire. Les photos ci-dessous sont des exemples : elles seront remplacées par les vôtres.</p>
<div class="galerie rv">${[5, 6, 7].map((i) => `<div${photo(i) ? ` style="background-image:url('${photo(i)}')"` : ''}></div>`).join('')}${[8, 9].map((i) => `<div${photo(i) ? ` style="background-image:url('${photo(i)}')"` : ''}></div>`).join('')}</div></div></section>
<section><div class="w"><div class="et">03 <i>·</i> Simple et rapide</div><h2 class="t serif rv">${esc(f.action)} en un geste.</h2><div class="etapes">
<div class="etape rv"><h3>Vous nous trouvez</h3><p>Sur Google ou sur votre téléphone, cette page s’ouvre en un instant.</p></div>
<div class="etape rv"><h3>Vous appelez</h3><p>Un bouton, et vous êtes en ligne avec nous.</p></div>
<div class="etape rv"><h3>Vous venez</h3><p>L’itinéraire s’ouvre directement dans votre application de cartes.</p></div></div></div></section>
<section id="venir"><div class="w"><div class="et">04 <i>·</i> Nous trouver</div><h2 class="t serif rv">${esc(v.ville)}, à deux pas.</h2><div class="venir">
<div class="plan rv">${plan ? `${plan}<div class="halo"></div><div class="repere">${svg(ICONES.repere)}</div><span class="osm">© OpenStreetMap</span>` : `<div class="halo"></div><div class="repere">${svg(ICONES.repere)}</div>`}</div>
<div class="coord rv"><div class="ligne"><div class="ic">${svg(ICONES.repere)}</div><div><b>Adresse</b>${esc(lieu)}</div></div>
${v.telephone ? `<div class="ligne"><div class="ic">${svg(ICONES.tel)}</div><div><b>Téléphone</b>${esc(v.telephone)}</div></div>` : ''}
<div class="ligne"><div class="ic">${svg(ICONES.horloge)}</div><div><b>Horaires</b>À compléter avec vous</div></div>
<div class="b" style="animation:none;margin-top:4px">${action}<a class="btn s" href="${esc(itineraire)}" target="_blank" rel="noopener">${svg(ICONES.fleche)}Itinéraire</a></div></div></div></div></section>
<section class="fin"><div class="w"><h2 class="t serif rv" style="margin:0 auto">${esc(v.nom)}</h2><p class="st rv" style="margin:16px auto 28px">${esc(f.accroche)}</p><div class="b">${action}</div></div></section>
<footer><div class="w">${esc(v.nom)} · ${esc(lieu)}. Maquette de démonstration préparée par rAIme (raime.fr). Photos d’exemple libres de droits (Pixabay)${plan ? ', carte © OpenStreetMap' : ''}.</div></footer>
${tel ? `<div class="appel"><a class="btn p" href="tel:${esc(tel)}">${svg(ICONES.tel)}${esc(f.action)}</a></div>` : ''}
</body></html>`;
}
