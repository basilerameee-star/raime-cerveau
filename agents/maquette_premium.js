// LA MAQUETTE PREMIUM D'UNE VITRINE (point 16 de la feuille de route) — pour le commerçant qui a répondu.
//
// Écrite par du code, pas par un modèle : le 01/10/2026, Hermes (modèles gratuits) a rendu en 24 secondes une page
// de 2,5 Ko sans visuel ; un gabarit soigné rend chaque fois le même niveau, sans frais.
// Mêmes règles que la maquette simple : un seul fichier, rien de chargé dehors (la page est servie sans réseau),
// rien d'inventé (ni avis, ni prix, ni horaires) : ce qui manque est marqué « à compléter avec vous ».
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// [accent, accent clair, nuit] par métier.
const PALETTES = {
  boulangerie: ['#d9a35b', '#f3d9a4', '#17120d'], boucherie: ['#c4473a', '#f2b8a8', '#170e0d'], fleuriste: ['#e06b9a', '#f7c6d9', '#140e13'],
  coiffeur: ['#8f7cf0', '#d6cffd', '#0f0e18'], 'institut de beauté': ['#d98aa8', '#f6d3e0', '#161013'], 'garage automobile': ['#4c8dff', '#bcd4ff', '#0b0f17'],
  plombier: ['#38a3d1', '#bfe6f5', '#0a1116'], électricien: ['#f2b233', '#fbe2a6', '#14110a'], serrurier: ['#c9a54b', '#efdca9', '#12100b'],
  menuisier: ['#b9865a', '#e8cfb6', '#14100c'], restaurant: ['#e5753a', '#f8c9ad', '#16100c'], pizzeria: ['#e4572e', '#f6c1ae', '#170e0b'],
  pressing: ['#5cb8b2', '#c7ebe8', '#0b1414'], cordonnier: ['#a7774f', '#e3c8b0', '#130f0c'], fromagerie: ['#e8c14d', '#f7e6ad', '#15120a'],
  caviste: ['#b8475f', '#e9b4c1', '#140b0e'], toiletteur: ['#58b67f', '#c5ead5', '#0c140f'], photographe: ['#c9c9c9', '#ededed', '#0e0e0e'],
  'peintre en bâtiment': ['#4fa3e0', '#c4e1f6', '#0b1117'], paysagiste: ['#5fae54', '#cae8c4', '#0c130b'],
};
const DEFAUT = ['#9aa4ff', '#dfe2ff', '#0f1016'];

// Les emblèmes, dessinés au trait (24 × 24).
const EMBLEMES = {
  boulangerie: '<path d="M12 22V9"/><path d="M12 9c-2-1-3-3-3-5.5 2 0 3 1.6 3 3.6 0-2 1-3.6 3-3.6 0 2.5-1 4.5-3 5.5z"/><path d="M12 14c-2.5 0-4-1.5-4.5-3.6 2 0 3.5.8 4.5 2.3 1-1.5 2.5-2.3 4.5-2.3-.5 2.1-2 3.6-4.5 3.6z"/><path d="M12 19c-2.5 0-4-1.5-4.5-3.6 2 0 3.5.8 4.5 2.3 1-1.5 2.5-2.3 4.5-2.3-.5 2.1-2 3.6-4.5 3.6z"/>',
  boucherie: '<path d="M3 21l8.5-8.5"/><path d="M11.5 12.5l7.6-7.6a2.2 2.2 0 0 1 3.1 3.1L14.6 15.6z"/>',
  fleuriste: '<circle cx="12" cy="5" r="2.6"/><circle cx="15.6" cy="8.6" r="2.6"/><circle cx="12" cy="12.2" r="2.6"/><circle cx="8.4" cy="8.6" r="2.6"/><circle cx="12" cy="8.6" r="1.1"/><path d="M12 14.8V22M12 18.5c1.8-1.8 3.6-2 5-1.4M12 19.5c-1.8-1.8-3.6-2-5-1.4"/>',
  coiffeur: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12"/>',
  'institut de beauté': '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  'garage automobile': '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
  plombier: '<path d="M12 2.7C8 7.5 6 11 6 14a6 6 0 0 0 12 0c0-3-2-6.5-6-11.3z"/><path d="M9.5 15a2.5 2.5 0 0 0 2.5 2.5"/>',
  électricien: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  serrurier: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.7 12.3L21 2M17 6l3 3M14.5 8.5l2.5 2.5"/>',
  menuisier: '<path d="M15 12l-8.5 8.5a2.1 2.1 0 0 1-3-3L12 9"/><path d="M17.6 15L22 10.6 13.4 2 9 6.4z"/>',
  restaurant: '<path d="M7 2v20M4 2v6a3 3 0 0 0 6 0V2M17 22V2c-2.5 1.5-4 4.5-4 8h4"/>',
  pizzeria: '<path d="M12 22L2.5 6a15 15 0 0 1 19 0z"/><circle cx="10" cy="9" r="1.2"/><circle cx="14" cy="11.5" r="1.2"/><circle cx="12" cy="15.5" r="1"/>',
  pressing: '<path d="M8 3L3 6l2 5 3-1v11h8V10l3 1 2-5-5-3a4 4 0 0 1-8 0z"/>',
  cordonnier: '<path d="M4 4h6v8l7 3a3 3 0 0 1 3 3v2H4z"/><path d="M4 16h16"/>',
  fromagerie: '<path d="M3 18L13 4l8 5.5z"/><path d="M3 18h18V9.5"/><circle cx="10" cy="14" r="1.3"/><circle cx="16" cy="15" r="1.1"/>',
  caviste: '<path d="M8 2h8l-.5 6a3.5 3.5 0 0 1-7 0z"/><path d="M12 11.5V20M8 22h8"/>',
  toiletteur: '<circle cx="7" cy="9" r="1.8"/><circle cx="11" cy="6" r="1.8"/><circle cx="15" cy="6.5" r="1.8"/><circle cx="18" cy="10" r="1.8"/><path d="M12 12c-3 0-6 4-6 6.5 0 2 2 2.5 3.5 2 1-.3 1.8-.8 2.5-.8s1.5.5 2.5.8c1.5.5 3.5 0 3.5-2C18 16 15 12 12 12z"/>',
  photographe: '<path d="M3 8a2 2 0 0 1 2-2h2.5L9 4h6l1.5 2H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="4"/>',
  'peintre en bâtiment': '<rect x="3" y="3" width="15" height="6" rx="1.5"/><path d="M18 6h2.5v5H11v3"/><rect x="9.5" y="14" width="3" height="7" rx="1"/>',
  paysagiste: '<path d="M5 21c0-9 5-15 15-16-1 10-7 15-16 15"/><path d="M5 21l8-8"/>',
};
const BOUTIQUE = '<path d="M3 9l1.5-5h15L21 9"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/><path d="M5 12v9h14v-9"/><path d="M10 21v-5h4v5"/>';
const ICONES = {
  liste: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
  horloge: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  repere: '<path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
  tel: '<path d="M5 3h3l2 5-2.5 1.5a11 11 0 0 0 5 5L14 12l5 2v3a2 2 0 0 1-2 2A15 15 0 0 1 3 5a2 2 0 0 1 2-2z"/>',
  fleche: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
};
const svg = (trace, cls = '') => `<svg${cls ? ` class="${cls}"` : ''} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${trace}</svg>`;

// Un plan stylisé (aucune carte chargée) : des rues, une rivière, le repère du commerce.
const PLAN = `<svg viewBox="0 0 400 275" aria-hidden="true" preserveAspectRatio="xMidYMid slice"><rect width="400" height="275" fill="rgba(255,255,255,.03)"/>
<path d="M-10 190 C 80 160, 140 230, 230 190 S 360 150, 420 175" fill="none" stroke="var(--a2)" stroke-opacity=".16" stroke-width="16"/>
<g fill="none" stroke="rgba(255,255,255,.09)" stroke-linecap="round"><path stroke-width="10" d="M-10 70 L 420 110"/><path stroke-width="10" d="M150 -10 L 210 290"/>
<path stroke-width="6" d="M40 -10 L 90 290"/><path stroke-width="6" d="M300 -10 L 330 290"/><path stroke-width="5" d="M-10 140 L 420 120"/><path stroke-width="4" d="M-10 245 L 420 230"/></g>
<g transform="translate(184 92)"><circle cx="16" cy="44" r="16" fill="var(--a)" fill-opacity=".18"><animate attributeName="r" values="10;22;10" dur="2.6s" repeatCount="indefinite"/></circle>
<path d="M16 46s14-12.4 14-24a14 14 0 0 0-28 0c0 11.6 14 24 14 24z" fill="var(--a)"/><circle cx="16" cy="22" r="5" fill="var(--n)"/></g></svg>`;

export function maquettePremium(v) {
  const [a, a2, n] = PALETTES[v.metier] || DEFAUT;
  const embleme = EMBLEMES[v.metier] || BOUTIQUE;
  const tel = v.telephone ? String(v.telephone).replace(/[^\d+]/g, '') : '';
  const metier = v.metier ? v.metier.charAt(0).toUpperCase() + v.metier.slice(1) : 'Commerce';
  const lieu = v.adresse || v.ville;
  const itineraire = v.carte || `https://www.google.com/maps/search/${encodeURIComponent(`${v.nom} ${lieu}`)}`;
  const appeler = (cls) => (tel ? `<a class="btn p${cls}" href="tel:${esc(tel)}">${svg(ICONES.tel)}Appeler</a>` : '');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(v.nom)} · ${esc(metier)} à ${esc(v.ville)}</title><style>
:root{--a:${a};--a2:${a2};--n:${n}}*{box-sizing:border-box;margin:0}html{scroll-behavior:smooth}
body{font:17px/1.65 Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#f4f1ec;background:var(--n);-webkit-font-smoothing:antialiased;overflow-x:hidden}
.demo{position:relative;z-index:3;background:rgba(255,255,255,.06);border-bottom:1px solid rgba(255,255,255,.08);color:#d9d4cc;font-size:12.5px;text-align:center;padding:9px 14px}
.hero{position:relative;min-height:92vh;display:flex;align-items:center;padding:72px 22px 96px;overflow:hidden;isolation:isolate}
.halo{position:absolute;border-radius:50%;filter:blur(72px);z-index:-1;animation:flotte 18s ease-in-out infinite alternate}
.h1{width:52vmax;height:52vmax;background:var(--a);opacity:.42;top:-24vmax;right:-16vmax}.h2{width:38vmax;height:38vmax;background:var(--a2);opacity:.16;bottom:-20vmax;left:-12vmax;animation-duration:26s}
@keyframes flotte{to{transform:translate(-4vmax,5vmax) scale(1.08)}}
.grain{position:absolute;inset:0;z-index:-1;background-image:radial-gradient(rgba(255,255,255,.06) 1px,transparent 1px);background-size:3px 3px;-webkit-mask-image:linear-gradient(#000,transparent 85%);mask-image:linear-gradient(#000,transparent 85%)}
.w{max-width:1080px;margin:0 auto;width:100%}
.emb{width:78px;height:78px;border-radius:24px;display:grid;place-items:center;background:linear-gradient(145deg,rgba(255,255,255,.15),rgba(255,255,255,.03));border:1px solid rgba(255,255,255,.14);color:var(--a2);box-shadow:0 22px 50px -22px var(--a);animation:monte .9s cubic-bezier(.2,.7,.2,1) both}
.emb svg{width:40px;height:40px}
.k{margin-top:26px;color:var(--a2);font-weight:600;letter-spacing:.16em;text-transform:uppercase;font-size:12.5px;animation:monte .9s .08s both}
h1{font-size:clamp(44px,9.5vw,112px);line-height:.98;letter-spacing:-.035em;margin:14px 0 22px;font-weight:700;overflow-wrap:anywhere;background:linear-gradient(180deg,#fff 35%,rgba(255,255,255,.6));-webkit-background-clip:text;background-clip:text;color:transparent;animation:monte 1s .14s both}
.l{font-size:clamp(18px,2.3vw,22px);max-width:580px;color:#cfc8bf;animation:monte 1s .22s both}
.b{display:flex;gap:12px;flex-wrap:wrap;margin-top:34px;animation:monte 1s .3s both}
.btn{display:inline-flex;align-items:center;gap:10px;padding:15px 24px;border-radius:999px;text-decoration:none;font-weight:600;transition:transform .25s,background .25s}
.btn svg{width:18px;height:18px}.p{background:var(--a);color:#14110d;box-shadow:0 14px 34px -14px var(--a)}.p:hover{transform:translateY(-2px)}
.s{border:1px solid rgba(255,255,255,.28);color:#fff}.s:hover{background:rgba(255,255,255,.08)}
@keyframes monte{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
section{padding:96px 22px}.t{font-size:clamp(30px,4.6vw,52px);letter-spacing:-.02em;line-height:1.06;max-width:740px}.st{color:#a9a29a;margin-top:14px;max-width:620px}
.cartes{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:18px;margin-top:42px}
.carte{padding:26px;border-radius:22px;background:linear-gradient(160deg,rgba(255,255,255,.07),rgba(255,255,255,.02));border:1px solid rgba(255,255,255,.09);transition:transform .3s,border-color .3s}
.carte:hover{transform:translateY(-4px);border-color:rgba(255,255,255,.2)}
.ic{width:46px;height:46px;border-radius:14px;display:grid;place-items:center;background:rgba(255,255,255,.06);color:var(--a2);margin-bottom:18px}.ic svg{width:22px;height:22px}
.carte h3{font-size:19px;margin-bottom:6px}.carte p{color:#a9a29a;font-size:15.5px}
.ac{display:inline-block;margin-top:14px;font-size:11.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--a2);border:1px dashed rgba(255,255,255,.22);border-radius:999px;padding:4px 10px}
.galerie{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:42px}
.photo{aspect-ratio:4/5;border-radius:22px;position:relative;overflow:hidden;background:linear-gradient(150deg,var(--a) -50%,rgba(255,255,255,.04) 72%);border:1px solid rgba(255,255,255,.08);display:grid;place-items:center;color:rgba(255,255,255,.5)}
.photo:nth-child(2){background:linear-gradient(210deg,var(--a2) -70%,rgba(255,255,255,.03) 72%)}
.photo svg{width:54px;height:54px;opacity:.55}.photo span{position:absolute;bottom:14px;left:16px;font-size:11.5px;letter-spacing:.12em;text-transform:uppercase}
.trouver{display:grid;grid-template-columns:1.1fr 1fr;gap:30px;align-items:center;margin-top:42px}
.plan{border-radius:24px;overflow:hidden;border:1px solid rgba(255,255,255,.09);aspect-ratio:16/11}.plan svg{width:100%;height:100%;display:block}
.coord{display:grid;gap:14px}.ligne{display:flex;gap:14px;align-items:flex-start}.ligne .ic{margin:0;flex:none}.ligne b{display:block;font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:#a9a29a;font-weight:600}
footer{padding:40px 22px;border-top:1px solid rgba(255,255,255,.08);font-size:14px;color:#8d867e}
.appel{position:fixed;left:14px;right:14px;bottom:14px;z-index:5;display:none}.appel .btn{width:100%;justify-content:center}
@supports (animation-timeline:view()){.rv{animation:monte linear both;animation-timeline:view();animation-range:entry 0% cover 28%}}
@media (max-width:760px){.galerie{grid-template-columns:1fr 1fr}.photo:nth-child(3){display:none}.trouver{grid-template-columns:1fr}.appel{display:block}footer{padding-bottom:104px}section{padding:72px 20px}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style></head><body>
<div class="demo">Maquette de démonstration préparée par rAIme pour ${esc(v.nom)}, à compléter ensemble avec vos photos et vos textes.</div>
<header class="hero"><div class="halo h1"></div><div class="halo h2"></div><div class="grain"></div><div class="w">
<div class="emb">${svg(embleme)}</div><div class="k">${esc(metier)} · ${esc(v.ville)}</div><h1>${esc(v.nom)}</h1>
<p class="l">Votre ${esc(v.metier || 'commerce')} à ${esc(v.ville)}, ${/(ie|ia)$/.test(v.metier || '') ? 'présentée comme elle' : 'présenté comme il'} le mérite. Les textes et les photos se finalisent ensemble.</p>
<div class="b">${appeler('')}<a class="btn s" href="${esc(itineraire)}" target="_blank" rel="noopener">${svg(ICONES.repere)}Itinéraire</a></div></div></header>
<section><div class="w"><h2 class="t rv">Tout ce qu'un client cherche, en un coup d'œil.</h2>
<p class="st rv">Pensé d'abord pour le téléphone : ce que vous proposez, quand vous êtes ouvert, comment venir.</p><div class="cartes">
<div class="carte rv"><div class="ic">${svg(ICONES.liste)}</div><h3>Vos prestations</h3><p>Ce que vous proposez, avec vos prix si vous le souhaitez.</p><span class="ac">À compléter avec vous</span></div>
<div class="carte rv"><div class="ic">${svg(ICONES.horloge)}</div><h3>Vos horaires</h3><p>Les jours et les heures d'ouverture, toujours à jour.</p><span class="ac">À compléter avec vous</span></div>
<div class="carte rv"><div class="ic">${svg(ICONES.repere)}</div><h3>Votre adresse</h3><p>${esc(lieu)}${v.telephone ? `<br>${esc(v.telephone)}` : ''}</p></div>
</div></div></section>
<section><div class="w"><h2 class="t rv">Vos photos, en grand.</h2><p class="st rv">La boutique, le savoir-faire, les réalisations : ici, vos images.</p>
<div class="galerie"><div class="photo rv">${svg(ICONES.image)}<span>Votre photo</span></div><div class="photo rv">${svg(embleme)}<span>Votre photo</span></div><div class="photo rv">${svg(ICONES.image)}<span>Votre photo</span></div></div></div></section>
<section><div class="w"><h2 class="t rv">Venir nous voir.</h2><div class="trouver"><div class="plan rv">${PLAN}</div><div class="coord rv">
<div class="ligne"><div class="ic">${svg(ICONES.repere)}</div><div><b>Adresse</b>${esc(lieu)}</div></div>
${v.telephone ? `<div class="ligne"><div class="ic">${svg(ICONES.tel)}</div><div><b>Téléphone</b>${esc(v.telephone)}</div></div>` : ''}
<div class="b" style="animation:none">${appeler('')}<a class="btn s" href="${esc(itineraire)}" target="_blank" rel="noopener">${svg(ICONES.fleche)}Itinéraire</a></div></div></div></div></section>
<footer><div class="w">${esc(v.nom)} · ${esc(lieu)}. Maquette de démonstration préparée par rAIme (raime.fr), à compléter ensemble.</div></footer>
${tel ? `<div class="appel">${appeler('')}</div>` : ''}
</body></html>`;
}
