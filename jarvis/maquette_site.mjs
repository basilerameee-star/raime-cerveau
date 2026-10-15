// LE SITE COMPLET D'UNE VITRINE (15/10/2026, à valider par Basile sur images avant toute mise en ligne).
//
// Basile, le 15/10 : les commerçants trouvent les maquettes « trop basiques, il manque quelque chose » ; deux fois, « un
// ami fait tout pour pas cher ». Le commerçant doit découvrir un site DÉJÀ prêt, nettement au-dessus de ce qu'un ami
// ferait. Ce gabarit garde ce qui marchait dans le héros v4 (une photo choisie par métier, un titre vrai pour tout le
// métier, le nom et le numéro une seule fois, le ton sourd du métier) et va plus loin : une page entière.
//   héros animé → spécialités en grandes images → le métier (savoir-faire) → galerie qui défile → nous trouver
//   (adresse, horaires, carte : seulement ce que dit la fiche ; une donnée absente replie sa ligne) → appel final → pied.
// Rien d'inventé : ni avis, ni prix, ni horaires inconnus ; chaque phrase vaut pour TOUT commerce du métier. Le bandeau
// de l'offre (500 €, en ligne sous 7 jours, hébergement inclus : les seuls faits confirmés) n'apparaît que sur la démo.
// Mouvement : CSS (entrées, défilement de la galerie, parallaxe au défilement là où le navigateur la connaît) et un petit
// script IntersectionObserver pour les apparitions ; sans script, tout est visible ; coupé si le visiteur préfère moins de
// mouvement. Restriction « Sam Crawford » : trois tailles de titres, texte 18/14, trois couleurs (le ton, le papier, et le
// ton adouci pour le texte secondaire), l'italique seulement pour le mot-clé, au début de la première ligne.
import { createRequire } from 'node:module';
import { adresseComplete, carte, horairesLisibles } from './maquette_premium.mjs';
const { lisible } = createRequire(import.meta.url)('./telephone.cjs');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Par métier : le ton, les textes (vrais pour tout commerce du métier), le cadrage de la photo du héros.
// Un titre s'écrit [mot-clé en italique, suite de la ligne, seconde ligne] ; une phrase, [mot-clé, suite].
export const SITES = {
  boucherie: {
    ton: '#3b2421', et: 'Boucherie', titre: ['Le bon morceau', ',', 'coupé à la demande.'],
    heros: { gauche: '30%', cadre: '78% 42%', cadreM: '76% 50%', centre: '56% 46%', filtre: 'sepia(.28) saturate(1.02)' },
    spe: { et: 'Spécialités', h2: ['Choisir', ', parer, couper.'], items: [
      ['Les viandes', 'Bœuf, veau, agneau et volaille, choisis pièce par pièce et présentés en vitrine. Vous voyez ce que vous achetez, vous demandez conseil, et vous repartez avec la quantité juste, à la pièce ou au poids.'],
      ['La découpe', 'Steaks, côtes, rôtis, escalopes ou morceaux à mijoter : chaque pièce est coupée et parée devant vous, à l’épaisseur que vous demandez. Le bon morceau pour la bonne cuisson, sans gaspillage.'],
      ['Pour vos tables', 'Un repas de famille, une fête, un barbecue entre amis : dites combien vous serez, votre boucher vous conseille la pièce, la quantité et la cuisson. Pour les grandes occasions, un appel suffit pour commander à l’avance.']] },
    savoir: { et: 'Le métier', phrase: ['Votre boucher', ' vous conseille : la pièce, la quantité, la cuisson.'] },
    fin: ['Venez', ' nous voir.'],
  },
  restaurant: {
    ton: '#2a2522', et: 'Restaurant', titre: ['À table', ',', 'une cuisine à partager.'],
    heros: { gauche: '38%', cadre: '72% 50%', cadreM: '70% 50%', centre: '52% 50%', halo: 'ellipse 60% 74%', filtre: 'saturate(.9) brightness(.82) contrast(1.12)' },
    spe: { et: 'La maison', h2: ['Le goût', ' des bons moments.'], items: [
      ['La cuisine', 'Des assiettes préparées en cuisine et servies à table : il ne vous reste qu’à vous installer, choisir et savourer. Une cuisine pensée pour se faire plaisir, sans se presser.'],
      ['La salle', 'Une table pour deux, en famille ou entre amis : un lieu pour prendre le temps de se retrouver. Un repas rapide ou un moment qui s’éternise, chacun y trouve sa place.'],
      ['Les occasions', 'Un anniversaire, un repas d’affaires, une soirée à fêter : un appel suffit pour réserver votre table. Dites combien vous serez, et votre table vous attend.']] },
    savoir: { et: 'La cuisine', phrase: ['Prendre le temps', ' : de cuisiner, de servir, de savourer.'] },
    fin: ['Une table', ' vous attend.'],
  },
  boulangerie: {
    ton: '#33281d', et: 'Boulangerie', titre: ['Chaque matin', ',', 'le pain du jour.'],
    heros: { gauche: '28%', cadre: '58% 50%', cadreM: '44% 50%', centre: '52% 52%', filtre: 'saturate(.92)' },
    spe: { et: 'Spécialités', h2: ['Du four', ' à votre table.'], items: [
      ['Les pains', 'Baguettes, pains de campagne et pains spéciaux : croustillants dehors, moelleux dedans. Le pain du petit-déjeuner, du déjeuner sur le pouce et du dîner en famille.'],
      ['Les viennoiseries', 'Croissants et pains au chocolat dorés au four, feuilletés et fondants. De quoi bien commencer la journée, ou s’offrir une pause gourmande l’après-midi.'],
      ['Les pâtisseries', 'Tartes, gâteaux et douceurs, pour le dessert du dimanche, un anniversaire ou simplement une envie. Pour une fête, un appel suffit pour commander à l’avance.']] },
    savoir: { et: 'Le fournil', phrase: ['La farine', ', l’eau, le sel, le temps : le reste est un savoir-faire.'] },
    fin: ['À demain', ' matin.'],
  },
  'coiffeur': {
    ton: '#2a2320', et: 'Coiffure', titre: ['Votre coupe', ',', 'faite pour vous.'],
    heros: { gauche: '22%', cadre: '50% 50%', cadreM: '50% 50%', centre: '55% 50%', filtre: 'none' },
    spe: { et: 'Le salon', h2: ['Couper', ', coiffer, conseiller.'], items: [
      ['La coupe', 'Une coupe pensée pour votre visage, vos cheveux et votre façon de vivre. On en parle avant, et l’on prend le temps de la faire juste.'],
      ['Le coiffage', 'Brushing et mise en forme : vous repartez coiffé, prêt pour la journée ou pour la soirée, avec les gestes pour garder le résultat chez vous.'],
      ['Le conseil', 'Le bon geste, le bon produit, la bonne fréquence : votre coiffeur vous dit ce qui convient à vos cheveux. Un appel suffit pour prendre rendez-vous.']] },
    savoir: { et: 'Le métier', phrase: ['Le geste juste', ' : écouter, couper, ajuster.'] },
    fin: ['Prenez', ' rendez-vous.'],
  },
  'garage automobile': {
    ton: '#22262b', et: 'Garage', titre: ['Votre voiture', ',', 'entre de bonnes mains.'],
    heros: { gauche: '22%', cadre: '50% 50%', cadreM: '50% 50%', centre: '55% 50%', filtre: 'none' },
    spe: { et: 'L’atelier', h2: ['Entretenir', ', réparer, rassurer.'], items: [
      ['L’entretien', 'Vidange, filtres, niveaux et contrôles : l’entretien régulier qui garde votre voiture fiable et vous évite les mauvaises surprises.'],
      ['Les réparations', 'Freins, pneus, embrayage, échappement : le problème est cherché, expliqué, puis réparé. Vous savez ce qui est fait, et pourquoi.'],
      ['Le diagnostic', 'Un voyant allumé, un bruit inhabituel : votre garagiste cherche la cause avant de changer quoi que ce soit. Un appel suffit pour prendre rendez-vous.']] },
    savoir: { et: 'Le métier', phrase: ['Écouter le moteur', ', trouver la panne, la réparer.'] },
    fin: ['Passez', ' au garage.'],
  },
  'pizzeria': {
    ton: '#2b1f1a', et: 'Pizzeria', titre: ['La pizza', ',', 'comme on l’aime.'],
    heros: { gauche: '22%', cadre: '50% 50%', cadreM: '50% 50%', centre: '55% 50%', filtre: 'none' },
    spe: { et: 'La carte', h2: ['La pâte', ', la sauce, le four.'], items: [
      ['Les pizzas', 'Des classiques aux recettes de la maison : une pâte étalée, garnie puis cuite au four, servie bien chaude.'],
      ['À emporter', 'Commandez par téléphone, passez la chercher : votre pizza vous attend, prête au bon moment.'],
      ['Pour tout le monde', 'Une soirée devant un match, un anniversaire, un repas improvisé : il y en a pour tous les goûts et pour toute la tablée.']] },
    savoir: { et: 'Le four', phrase: ['La bonne pâte', ' : du temps, du feu et du savoir-faire.'] },
    fin: ['À très', ' vite.'],
  },
  'fleuriste': {
    ton: '#24291f', et: 'Fleuriste', titre: ['Des fleurs', ',', 'pour chaque moment.'],
    heros: { gauche: '22%', cadre: '50% 50%', cadreM: '50% 50%', centre: '55% 50%', filtre: 'none' },
    spe: { et: 'L’atelier', h2: ['Choisir', ', composer, offrir.'], items: [
      ['Les bouquets', 'Des bouquets composés selon la saison, vos couleurs et votre budget. Pour dire merci, je t’aime, ou simplement faire plaisir.'],
      ['Les plantes', 'Plantes vertes et fleuries pour la maison ou le bureau, avec les conseils pour les garder belles longtemps.'],
      ['Les grands moments', 'Mariage, naissance, anniversaire ou deuil : des compositions pensées pour l’occasion. Un appel suffit pour commander à l’avance.']] },
    savoir: { et: 'Le métier', phrase: ['Chaque bouquet', ' raconte quelque chose.'] },
    fin: ['Offrez', ' des fleurs.'],
  },
  'fromagerie': {
    ton: '#2d261a', et: 'Fromagerie', titre: ['Le bon fromage', ',', 'à son point.'],
    heros: { gauche: '22%', cadre: '50% 50%', cadreM: '50% 50%', centre: '55% 50%', filtre: 'none' },
    spe: { et: 'La cave', h2: ['Choisir', ', goûter, partager.'], items: [
      ['Les fromages', 'Pâtes dures, pâtes molles, chèvres et bleus : une sélection à goûter, coupée à la demande, à la part ou au poids.'],
      ['Le conseil', 'Pour un apéritif, un dessert ou un vin donné : votre fromager vous aide à choisir, et vous dit comment les servir.'],
      ['Les plateaux', 'Une fête, un repas de famille, une soirée entre amis : dites combien vous serez, le plateau se prépare pour vous. Un appel suffit pour commander à l’avance.']] },
    savoir: { et: 'Le métier', phrase: ['Le temps', ' fait le goût, le fromager fait le reste.'] },
    fin: ['Venez', ' goûter.'],
  },
  'institut de beauté': {
    ton: '#2e2326', et: 'Institut de beauté', titre: ['Un moment', ',', 'rien que pour vous.'],
    heros: { gauche: '22%', cadre: '50% 50%', cadreM: '50% 50%', centre: '55% 50%', filtre: 'none' },
    spe: { et: 'Les soins', h2: ['Prendre soin', ' de soi.'], items: [
      ['Le visage', 'Des soins du visage adaptés à votre peau : nettoyer, apaiser, éclairer. Un moment de calme qui se voit et qui se sent.'],
      ['Le corps', 'Épilations, gommages ou modelages : des soins du corps pour se sentir bien, du bout des pieds aux épaules.'],
      ['Les mains', 'Manucure et beauté des pieds : des ongles soignés, une couleur au choix. Un appel suffit pour prendre rendez-vous.']] },
    savoir: { et: 'L’institut', phrase: ['Le calme', ', le soin, et le temps de souffler.'] },
    fin: ['Offrez-vous', ' une pause.'],
  },
  'caviste': {
    ton: '#2a1c22', et: 'Caviste', titre: ['La bonne bouteille', ',', 'pour chaque table.'],
    heros: { gauche: '22%', cadre: '50% 50%', cadreM: '50% 50%', centre: '55% 50%', filtre: 'none' },
    spe: { et: 'La cave', h2: ['Goûter', ', choisir, conseiller.'], items: [
      ['Les vins', 'Rouges, blancs, rosés et bulles, de petits domaines comme de grandes appellations, choisis bouteille par bouteille.'],
      ['Le conseil', 'Un plat, un budget, une occasion : votre caviste vous propose la bouteille qui va avec, et vous dit pourquoi.'],
      ['Pour offrir', 'Un anniversaire, un remerciement, une fête : la bouteille à offrir, avec le conseil pour la servir.']] },
    savoir: { et: 'Le métier', phrase: ['Derrière chaque bouteille', ', une histoire à raconter.'] },
    fin: ['Passez', ' à la cave.'],
  },
};

// Une phrase dont les mots apparaissent un à un (le mot-clé en italique, en tête).
const mots = ([cle, suite]) => {
  let i = 0;
  const m = (t) => t.split(/(\s+)/).map((x) => (/^\s+$/.test(x) || !x ? x : `<span class="m" style="--i:${i++}">${esc(x)}</span>`)).join('');
  return `<em>${m(cle)}</em>${m(suite)}`;
};

// v : la fiche du commerce (nom, métier, ville, adresse, téléphone, horaires, lat, lon, carte) ;
// o.site : l'adresse du Cockpit ; o.photos : celle des photos (par défaut <site>/demo/photos) ; o.demo : le bandeau de l'offre.
// Le dossier des photos d'un métier : « institut de beauté » → institut-de-beaute (jarvis/interface/photos/<dossier>/).
export const dossierPhotos = (m) => String(m || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function maquetteSite(v, o = {}) {
  const s = SITES[v.metier];
  if (!s) return null;   // un métier sans gabarit complet garde sa maquette actuelle
  const site = String(o.site || 'https://cockpit.raime.fr').replace(/\/$/, '');
  const photos = `${o.photos || `${site}/demo/photos`}/${dossierPhotos(v.metier)}`;
  // la galerie charge tout de suite : ses images entrent par le côté, là où le chargement différé ne les verrait pas
  const img = (n, cls = '') => `<img${cls ? ` class="${cls}"` : ''} src="${esc(`${photos}/${n}.webp`)}" alt="" loading="${n === 'heros' || n === 'savoir' || n[0] === 'g' ? 'eager' : 'lazy'}" decoding="async">`;
  const telLisible = v.telephone ? (lisible(v.telephone) || String(v.telephone).trim()) : '';
  const tel = telLisible.replace(/[^\d+]/g, '');
  const lieu = adresseComplete(v);
  const itineraire = v.carte || `https://www.google.com/maps/search/${encodeURIComponent(`${v.nom} ${lieu}`)}`;
  const horaires = Array.isArray(v.horaires) ? v.horaires : horairesLisibles(v.horaires);
  const coord = (x) => (x === null || x === undefined || x === '' ? NaN : Number(x));
  const plan = carte(coord(v.lat), coord(v.lon), 16, `${site}/demo/tuile`);
  // l'adresse en titre : la rue d'abord, puis le code postal et la ville
  const m = /^(.*?),\s*(\d{4,5}\s.*)$/.exec(lieu);
  const [rue, ville] = m ? [m[1], m[2]] : [lieu, ''];
  const h = s.heros;
  const nav = [['specialites', s.spe.et], ['savoir', s.savoir.et], ['venir', 'Nous trouver']];
  const appel = tel ? `<a class="appel" href="tel:${esc(tel)}"><span class="large">${esc(telLisible)}</span><span class="court">Appeler</span></a>` : '';
  const polices = `${site}/demo/police`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><meta name="theme-color" content="${s.ton}">
<title>${esc(v.nom)} · ${esc(s.et)} à ${esc(v.ville)}</title>
<link rel="preload" as="image" href="${esc(`${photos}/savoir.webp`)}" fetchpriority="high"><style>
@font-face{font-family:"Instrument Serif";src:url('${polices}/InstrumentSerif-Regular.woff2') format('woff2');font-weight:400;font-display:swap}
@font-face{font-family:"Instrument Serif";src:url('${polices}/InstrumentSerif-Italic.woff2') format('woff2');font-weight:400;font-style:italic;font-display:swap}
:root{--ton:${s.ton};--papier:#f4efe8;--doux:color-mix(in srgb,var(--ton) 68%,var(--papier));--ligne:color-mix(in srgb,var(--ton) 14%,var(--papier));
  --ecran:100svh;--marge:clamp(20px,4.4vw,64px);--sortie:cubic-bezier(.16,1,.3,1);
  --cadre:${h.cadre};--cadre-m:${h.cadreM};--gauche:${h.gauche};--centre:${h.centre};--halo:${h.halo || 'ellipse 62% 78%'};--filtre:${h.filtre}}
*{box-sizing:border-box;margin:0}html{scroll-behavior:smooth}
body{background:var(--papier);color:var(--ton);font:400 18px/1.6 Inter,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased;overflow-x:hidden}
a{color:inherit;text-decoration:none}img{display:block;max-width:100%}
.w{max-width:1320px;margin:0 auto;padding:0 var(--marge)}
h1,h2,.phrase{font-family:"Instrument Serif",Georgia,"Times New Roman",serif;font-weight:400;letter-spacing:-.012em}
h1{font-size:clamp(56px,min(8.6vw,16vh),148px);line-height:.94}
h2,.phrase{font-size:clamp(36px,4.4vw,64px);line-height:1.04}
h3{font-size:26px;line-height:1.2;font-weight:500;letter-spacing:-.01em}
em{font-style:italic}
.et{font-size:14px;font-weight:600;letter-spacing:.22em;text-transform:uppercase}
.offre{background:color-mix(in srgb,var(--ton) 82%,#000);color:color-mix(in srgb,var(--papier) 78%,var(--ton));font-size:14px;text-align:center;padding:9px var(--marge);line-height:1.4}
.barre{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:40px;height:76px;padding:0 var(--marge);background:color-mix(in srgb,var(--ton) 92%,transparent);
  -webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);color:var(--papier)}
.logo{font-size:14px;font-weight:600;letter-spacing:.26em;text-transform:uppercase;line-height:1.3;margin-right:auto}
.barre nav{display:flex;gap:32px;font-size:14px;color:color-mix(in srgb,var(--papier) 76%,var(--ton))}
.barre nav a{transition:color .3s}.barre nav a:hover{color:var(--papier)}
.appel,.bouton{flex:none;display:inline-block;font-size:14px;font-weight:600;letter-spacing:.06em;line-height:1;padding:15px 24px;border-radius:999px;
  background:var(--papier);color:var(--ton);transition:background .3s,color .3s}
.appel:hover,.bouton:hover{background:#fff}.appel .court{display:none}
a:focus-visible{outline:2px solid currentColor;outline-offset:4px}
/* le héros : la photo se fond dans le ton, la lumière monte sur l'objet, le titre se lève ligne à ligne */
.heros{position:relative;height:calc(var(--ecran) - 112px);min-height:560px;overflow:hidden;isolation:isolate;background:var(--ton);color:var(--papier)}
.scene{position:absolute;z-index:1;inset:0 0 0 var(--gauche);mix-blend-mode:lighten;
  -webkit-mask-image:linear-gradient(90deg,transparent 2%,#000 42%),radial-gradient(var(--halo) at var(--centre),#000 48%,transparent 100%);
  mask-image:linear-gradient(90deg,transparent 2%,#000 42%),radial-gradient(var(--halo) at var(--centre),#000 48%,transparent 100%);-webkit-mask-composite:source-in;mask-composite:intersect}
.objet{width:100%;height:100%;object-fit:cover;object-position:var(--cadre);filter:var(--filtre);transform-origin:60% 50%;animation:lumiere 2.8s var(--sortie) .15s both}
@keyframes lumiere{from{opacity:0;filter:var(--filtre) brightness(.2);transform:scale(1.16)}to{opacity:1;filter:var(--filtre) brightness(1);transform:none}}
.heros .texte{position:absolute;z-index:2;left:0;right:0;bottom:clamp(40px,9vh,96px)}
.heros .et{color:color-mix(in srgb,var(--papier) 72%,var(--ton));margin-bottom:22px;animation:paraitre 1s ease .2s both}
.l{display:block;overflow:hidden;padding:.14em 0 .06em;margin-top:-.14em}.l>span{display:block;animation:lever 1.2s var(--sortie) both}
.l:nth-child(1)>span{animation-delay:.35s}.l:nth-child(2)>span{animation-delay:.5s}
@keyframes lever{from{transform:translateY(108%)}to{transform:none}}
@keyframes paraitre{from{opacity:0}to{opacity:1}}
.defiler{position:absolute;z-index:2;right:var(--marge);bottom:clamp(40px,9vh,96px);font-size:14px;letter-spacing:.22em;text-transform:uppercase;
  color:color-mix(in srgb,var(--papier) 72%,var(--ton));writing-mode:vertical-rl;display:flex;align-items:center;gap:14px;animation:paraitre 1s ease 1.2s both}
.defiler::after{content:"";width:1px;height:64px;background:currentColor;transform-origin:top;animation:goutte 2.4s ease-in-out infinite}
@keyframes goutte{0%{transform:scaleY(0)}50%{transform:scaleY(1);transform-origin:top}51%{transform-origin:bottom}100%{transform:scaleY(0);transform-origin:bottom}}
/* les sections */
section{position:relative}
.bloc{padding:clamp(88px,11vw,168px) 0}
.tete{margin-bottom:clamp(48px,6vw,88px)}
.tete .et{color:var(--doux)}.tete h2{max-width:14ch;margin-top:22px}
.trio{display:flex;flex-direction:column;gap:clamp(72px,9vw,140px)}
.carte{display:grid;grid-template-columns:1.15fr 1fr;gap:clamp(40px,6vw,104px);align-items:center}
.carte:nth-child(even){grid-template-columns:1fr 1.15fr}.carte:nth-child(even) .cadre{order:2}
.cadre{position:relative;overflow:hidden;aspect-ratio:4/3;background:var(--ligne)}
.cadre img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.carte h3{margin-top:26px}.carte p{margin-top:14px;font-size:18px;line-height:1.6;color:var(--doux);max-width:34ch}
.carte .n{font-size:14px;color:var(--doux);font-variant-numeric:tabular-nums;display:block}
.carte .n+h3{margin-top:6px}
.sombre{background:var(--ton);color:var(--papier)}
.savoir{display:grid;grid-template-columns:1fr 1.08fr;gap:clamp(40px,6vw,104px);align-items:center}
.visuel{overflow:hidden;aspect-ratio:4/5}
.visuel img{width:100%;height:100%;object-fit:cover}
.savoir .et{color:color-mix(in srgb,var(--papier) 66%,var(--ton));margin-bottom:28px}
.galerie{padding:clamp(72px,8vw,120px) 0;overflow:hidden}
.galerie .et{color:var(--doux);margin-bottom:36px}
.piste{display:flex;gap:16px;width:max-content;animation:defile 70s linear infinite}
.piste img{height:clamp(240px,26vw,380px);width:auto;aspect-ratio:var(--r,3/2);object-fit:cover}
.galerie:hover .piste{animation-play-state:paused}
@keyframes defile{to{transform:translateX(calc(-50% - 8px))}}
.venir{display:grid;grid-template-columns:1fr 1.25fr;gap:clamp(40px,6vw,96px);align-items:center;padding-top:clamp(88px,10vw,152px);padding-bottom:clamp(88px,10vw,152px);border-top:1px solid var(--ligne)}
.venir .et{color:var(--doux);margin-bottom:28px}
.venir h2 span{display:block}.venir h2 .cp{color:var(--doux)}
.venir dl{margin-top:44px;display:grid;gap:24px}
.venir dt{font-size:14px;font-weight:600;letter-spacing:.22em;text-transform:uppercase;color:var(--doux)}
.venir dd{margin-top:8px;font-size:18px}.venir dd span{display:block}
.plan{position:relative;display:block;overflow:hidden;min-height:440px;background:var(--ligne)}
.tuiles{position:absolute;width:1280px;height:768px;filter:grayscale(1) contrast(.92) brightness(1.04)}
.tuiles img{position:absolute;width:256px;height:256px;max-width:none}
.plan::after{content:"";position:absolute;inset:0;background:var(--ton);mix-blend-mode:color;opacity:.18;pointer-events:none}
.repere{position:absolute;z-index:2;left:50%;top:50%;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;background:var(--ton)}
.repere::after{content:"";position:absolute;inset:-12px;border-radius:50%;border:1px solid var(--ton);animation:onde 2.6s var(--sortie) infinite}
@keyframes onde{from{transform:scale(.4);opacity:1}to{transform:scale(1.6);opacity:0}}
.osm{position:absolute;z-index:2;right:0;bottom:0;font-size:14px;background:color-mix(in srgb,var(--papier) 88%,transparent);padding:3px 10px}
.fin{position:relative;overflow:hidden;color:var(--papier);background:var(--ton);text-align:center}
.fin .fond{position:absolute;inset:-8% 0;width:100%;height:116%;object-fit:cover;opacity:.34;filter:saturate(.7)}
.fin .w{position:relative;padding-top:clamp(120px,14vw,200px);padding-bottom:clamp(120px,14vw,200px)}
.fin h2{font-size:clamp(56px,min(8.6vw,16vh),148px);line-height:.94}
.fin .bouton{margin-top:48px}
footer{background:var(--ton);color:color-mix(in srgb,var(--papier) 60%,var(--ton));font-size:14px;border-top:1px solid color-mix(in srgb,var(--papier) 12%,var(--ton))}
footer .w{display:flex;justify-content:space-between;gap:24px;padding-top:28px;padding-bottom:28px}
/* les apparitions : seulement si le script tourne (sinon tout est visible d'emblée) */
.js .r{opacity:0;transform:translateY(36px);transition:opacity 1s var(--sortie),transform 1.2s var(--sortie);transition-delay:calc(var(--i,0) * 140ms)}
.js .r.vu{opacity:1;transform:none}
.js .carte .cadre{clip-path:inset(100% 0 0 0);transition:clip-path 1.4s var(--sortie);transition-delay:calc(var(--i,0) * 140ms)}
.js .carte.vu .cadre{clip-path:inset(0)}
.js .carte .cadre img{scale:1.18;transition:scale 2s var(--sortie)}.js .carte.vu .cadre img{scale:1}
.js .visuel img{scale:1.14;transition:scale 2.6s var(--sortie)}.js .visuel.vu img{scale:1}
.js .mots .m{opacity:.14;transition:opacity .9s ease;transition-delay:calc(var(--i) * 55ms)}.js .mots.vu .m{opacity:1}
@supports (animation-timeline:view()){
  .cadre img,.fin .fond{animation:parallaxe linear both;animation-timeline:view();animation-range:cover}
  @keyframes parallaxe{from{translate:0 -5%}to{translate:0 5%}}
  .scene{animation:recul linear both;animation-timeline:scroll(root);animation-range:0 90vh}
  @keyframes recul{to{translate:0 14%;opacity:.4}}
}
@media (max-width:860px){
  .barre{height:64px;gap:16px}.barre nav{display:none}.logo{letter-spacing:.18em}.appel{padding:13px 20px}
  .appel .large{display:none}.appel .court{display:inline}
  .heros{height:calc(var(--ecran) - 100px)}
  .scene{left:0;top:0;bottom:30%;-webkit-mask-image:linear-gradient(180deg,transparent 0,#000 18%,#000 66%,transparent 100%);mask-image:linear-gradient(180deg,transparent 0,#000 18%,#000 66%,transparent 100%)}
  .objet{object-position:var(--cadre-m);transform-origin:50% 50%}
  h1,.fin h2{font-size:clamp(38px,12.4vw,56px)}
  .heros .texte{bottom:48px}.defiler{display:none}
    .trio{gap:64px}.carte,.carte:nth-child(even){grid-template-columns:1fr;gap:24px}.carte:nth-child(even) .cadre{order:0}.cadre{aspect-ratio:4/3}
  .savoir{grid-template-columns:1fr}.visuel{aspect-ratio:4/5}
  .venir{grid-template-columns:1fr}.plan{min-height:340px}
  footer .w{display:block}footer .w span{display:block}footer .w span+span{margin-top:6px}
}
@media (prefers-reduced-motion:reduce){
  *,*::before,*::after{animation:none!important;transition:none!important}
  .js .r,.js .mots .m{opacity:1;transform:none}.js .carte .cadre{clip-path:none}.js .carte .cadre img,.js .visuel img{scale:1}
  .galerie{overflow-x:auto}
}
/* 16/10 (Basile) : tout le site dans le ton du héros, écritures blanches, UNE seule typographie, et des photos
   qui se fondent dans le fond comme celle du héros : plus aucun cadre carré. */
:root{--doux:color-mix(in srgb,var(--papier) 64%,var(--ton));--ligne:color-mix(in srgb,var(--papier) 12%,var(--ton))}
body{background:var(--ton);color:var(--papier);font-family:"Instrument Serif",Georgia,"Times New Roman",serif;font-size:21px;line-height:1.5}
h3{font-family:inherit;font-weight:400;font-size:clamp(32px,3vw,44px);line-height:1.05;letter-spacing:-.01em}
.et,.logo,.barre nav,.appel,.bouton,.offre,footer,.osm,.venir dt{font-family:inherit}
.et{font-size:15px;font-weight:400;letter-spacing:.24em}.logo{font-size:17px;font-weight:400;letter-spacing:.2em}
.barre nav{font-size:17px}.appel,.bouton{font-size:17px;font-weight:400;letter-spacing:.04em}
.tete .et,.galerie .et,.venir .et,.venir dt{color:var(--doux)}
.carte p{font-size:21px;color:var(--doux)}.carte .n{font-size:15px;letter-spacing:.2em}
.cadre{background:none;aspect-ratio:4/3;margin:-6% -4%;
  -webkit-mask-image:radial-gradient(closest-side,#000 52%,transparent 100%);mask-image:radial-gradient(closest-side,#000 52%,transparent 100%)}
.cadre img{filter:saturate(.9) brightness(.92)}
.carte{grid-template-columns:1.4fr 1fr;gap:clamp(8px,2vw,32px)}.carte:nth-child(even){grid-template-columns:1fr 1.4fr}
.js .carte .cadre{clip-path:none;opacity:0;transition:opacity 1.6s var(--sortie)}.js .carte.vu .cadre{opacity:1}
.sombre{background:color-mix(in srgb,var(--ton) 80%,#000)}
.visuel{aspect-ratio:4/5;-webkit-mask-image:radial-gradient(closest-side,#000 50%,transparent 100%);mask-image:radial-gradient(closest-side,#000 50%,transparent 100%)}
.piste{gap:0}
.piste img{margin-right:-4vw;-webkit-mask-image:linear-gradient(90deg,transparent,#000 22%,#000 78%,transparent),linear-gradient(180deg,transparent,#000 18%,#000 82%,transparent);
  mask-image:linear-gradient(90deg,transparent,#000 22%,#000 78%,transparent),linear-gradient(180deg,transparent,#000 18%,#000 82%,transparent);-webkit-mask-composite:source-in;mask-composite:intersect}
.venir{border-top:0}
.plan{background:none;-webkit-mask-image:radial-gradient(closest-side,#000 55%,transparent 100%);mask-image:radial-gradient(closest-side,#000 55%,transparent 100%)}
.tuiles{filter:grayscale(1) invert(.9) contrast(.85) brightness(.9)}.plan::after{opacity:.5}
.repere{background:var(--papier)}.repere::after{border-color:var(--papier)}.osm{display:none}
footer{border-top:0}
@media (max-width:860px){.carte,.carte:nth-child(even){grid-template-columns:1fr;gap:0}.carte .txt{margin-top:-24px;position:relative}.piste img{margin-right:-10vw}}
@media (prefers-reduced-motion:reduce){.js .carte .cadre{opacity:1}}
/* 16/10, suite : moins d'images, plus de sens. Les spécialités deviennent une liste éditoriale (numéro, titre, phrase),
   le métier une grande photo qui se fond dans le fond comme le héros ; la galerie, qui remplissait, disparaît. */
.liste{border-top:1px solid var(--ligne)}
.ligne{display:grid;grid-template-columns:90px minmax(0,1fr) minmax(0,1.15fr);gap:clamp(24px,4vw,64px);align-items:baseline;padding:clamp(36px,4.4vw,60px) 0;border-bottom:1px solid var(--ligne)}
.ligne .n{font-size:15px;letter-spacing:.2em;color:var(--doux)}
.ligne h3{font-size:clamp(40px,4.4vw,64px);line-height:1}
.ligne p{font-size:22px;line-height:1.5;color:var(--doux);max-width:40ch}
.ligne h3,.ligne p{transition:transform .8s var(--sortie)}
.ligne:hover h3{transform:translateX(12px)}
.sombre{background:var(--ton)}
#savoir.bloc{padding:0}
.savoir{position:relative;display:block;min-height:min(92vh,880px);max-width:none;padding:0}
.visuel{position:absolute;inset:0 0 0 30%;aspect-ratio:auto;
  -webkit-mask-image:linear-gradient(90deg,transparent 0,#000 46%),linear-gradient(180deg,transparent 0,#000 22%,#000 72%,transparent 100%);
  mask-image:linear-gradient(90deg,transparent 0,#000 46%),linear-gradient(180deg,transparent 0,#000 22%,#000 72%,transparent 100%);-webkit-mask-composite:source-in;mask-composite:intersect}
.visuel img{filter:saturate(.95) brightness(.85)}
.savoir>div:last-child{position:relative;z-index:2;max-width:1320px;margin:0 auto;padding:clamp(140px,18vw,240px) var(--marge)}
.savoir .phrase{max-width:15ch;font-size:clamp(44px,5.4vw,84px)}
@media (max-width:860px){.ligne{grid-template-columns:1fr;gap:10px}.ligne p{font-size:20px}
  .savoir{min-height:0}.visuel{position:relative;inset:auto;height:min(62vh,520px);-webkit-mask-image:linear-gradient(180deg,transparent,#000 20%,#000 70%,transparent);mask-image:linear-gradient(180deg,transparent,#000 20%,#000 70%,transparent)}
  .savoir>div:last-child{padding:0 var(--marge) 96px;margin-top:-120px}}
.venir h2{font-size:clamp(44px,5.4vw,72px)}
/* 16/10, 3e retour : photo du métier en héros, couleurs vives ; trois parties colorées (héros, métier, fin)
   et deux blanches (spécialités en alternance gauche/droite, nous trouver avec la carte). */
.objet{filter:saturate(1.12) contrast(1.06)!important;animation-name:lumiere2}
@keyframes lumiere2{from{opacity:0;transform:scale(1.12)}to{opacity:1;transform:none}}
.scene{mix-blend-mode:normal;-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 38%);mask-image:linear-gradient(90deg,transparent 0,#000 38%);inset:0 0 0 22%}
.objet{object-position:50% 50%}
.heros h1,.heros .et{text-shadow:0 2px 30px color-mix(in srgb,var(--ton) 70%,transparent)}
#specialites,#venir{background:var(--papier);color:var(--ton);--doux:color-mix(in srgb,var(--ton) 66%,var(--papier));--ligne:color-mix(in srgb,var(--ton) 14%,var(--papier))}
.ligne{grid-template-columns:1fr 1fr;align-items:center}
.ligne .tt .n{display:block;margin-bottom:12px}
.ligne:nth-child(even) .tt{order:2;text-align:right}
.ligne p{color:var(--doux)}
.plan{-webkit-mask-image:radial-gradient(closest-side,#000 62%,transparent 100%);mask-image:radial-gradient(closest-side,#000 62%,transparent 100%)}
.tuiles{filter:grayscale(1) contrast(.92) brightness(1.04)}.plan::after{opacity:.18}
.repere{background:var(--ton)}.repere::after{border-color:var(--ton)}
@media (max-width:860px){.ligne{grid-template-columns:1fr}.ligne:nth-child(even) .tt{order:0;text-align:left}
  .scene{inset:0;-webkit-mask-image:linear-gradient(180deg,transparent 0,#000 14%,#000 62%,transparent 100%);mask-image:linear-gradient(180deg,transparent 0,#000 14%,#000 62%,transparent 100%)}}
</style></head><body>
${o.demo === false ? '' : '<div class="offre">Maquette préparée par rAIme · ce site : 500 €, en ligne sous 7 jours, hébergement inclus</div>\n'}<header class="barre"><a class="logo" href="#haut">${esc(v.nom)}</a>
<nav>${nav.map(([id, t]) => `<a href="#${id}">${esc(t)}</a>`).join('')}</nav>${appel}</header>
<section class="heros" id="haut">
<div class="scene">${img('savoir', 'objet')}</div>
<div class="w texte"><p class="et">${esc(s.et)}</p>
<h1><span class="l"><span><em>${esc(s.titre[0])}</em>${esc(s.titre[1])}</span></span><span class="l"><span>${esc(s.titre[2])}</span></span></h1></div>
<a class="defiler" href="#specialites">Découvrir</a>
</section>
<section class="bloc" id="specialites"><div class="w">
<div class="tete"><p class="et r">${esc(s.spe.et)}</p><h2 class="r" style="--i:1"><em>${esc(s.spe.h2[0])}</em>${esc(s.spe.h2[1])}</h2></div>
<div class="liste">${s.spe.items.map(([t, p], i) => `<article class="ligne r" style="--i:${i}"><div class="tt"><span class="n">0${i + 1}</span><h3>${esc(t)}</h3></div><p>${esc(p)}</p></article>`).join('')}</div>
</div></section>
<section class="sombre bloc" id="savoir"><div class="w savoir">
<div class="visuel r">${img('heros')}</div>
<div><p class="et">${esc(s.savoir.et)}</p><h2 class="phrase mots r">${mots(s.savoir.phrase)}</h2></div>
</div></section>
<section id="venir"><div class="w venir">
<div class="r"><p class="et">Nous trouver</p><h2><span>${esc(rue)}</span>${ville ? `<span class="cp">${esc(ville)}</span>` : ''}</h2>
${horaires && horaires.length ? `<dl><div><dt>Horaires</dt><dd>${horaires.map((l) => `<span>${esc(l)}</span>`).join('')}</dd></div></dl>` : ''}</div>
${plan ? `<a class="plan r" style="--i:1" href="${esc(itineraire)}" target="_blank" rel="noopener" aria-label="Ouvrir le plan">${plan}<span class="repere"></span><span class="osm">© OpenStreetMap</span></a>` : ''}
</div></section>
<section class="fin">${img('final', 'fond')}<div class="w"><h2 class="r"><em>${esc(s.fin[0])}</em>${esc(s.fin[1])}</h2>
<a class="bouton r" style="--i:1" href="${esc(itineraire)}" target="_blank" rel="noopener">Itinéraire</a></div></section>
<footer><div class="w"><span>Photos d’exemple : Pixabay${plan ? ' · Carte : © OpenStreetMap' : ''}</span></div></footer>
<script>document.documentElement.classList.add('js');if('IntersectionObserver' in window){const o=new IntersectionObserver((e)=>e.forEach((x)=>{if(x.isIntersecting){x.target.classList.add('vu');o.unobserve(x.target)}}),{rootMargin:'0px 0px -12% 0px'});document.querySelectorAll('.r').forEach((el)=>o.observe(el))}else document.querySelectorAll('.r').forEach((el)=>el.classList.add('vu'))</script>
</body></html>`;
}
