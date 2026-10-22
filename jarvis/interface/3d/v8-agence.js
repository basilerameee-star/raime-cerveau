// Le cockpit v8 (22/10/2026) : l'agence en 3D comme un vrai plateau de bureaux, qu'on visite.
// Demande de Basile : « que ça ressemble vraiment à une entreprise dans laquelle je puisse me balader, voir les agents,
// les zones, des murs, des bureaux… quelque chose de professionnel » (références : Smart City Platform, parcs d'activités
// blancs et bleus). Une pièce par zone, à la taille de ses agents ; un poste par agent : bureau, écran, chaise et une
// personne assise. L'écran, le halo au sol et l'épingle disent l'état réel de l'agent (/api/v6, rien d'inventé) ; les
// flux de données courent au sol, de porte en porte. Le décor fixe est fusionné en quelques maillages (couleur par sommet) :
// peu d'appels de dessin, même sur un portable. Trois vues : le campus, le bâtiment (et ses pièces), la visite à pied.
import * as THREE from 'three';
import { OrbitControls } from '/3d/vendor/OrbitControls.js';

export const COULEUR_ZONE = { commerce: '#4f8cff', emploi: '#9b7bff', medias: '#ff8a3d', finance: '#34d399', cerveau: '#f472b6', infra: '#38bdf8', accueil: '#c7cdd8' };
export const ETATS = {
  ok: ['#34d399', 'Fonctionne'], vide: ['#fbbf24', 'Tourne à vide'], panne: ['#ff5d5d', 'En panne'], attente: ['#60a5fa', 'Pas encore prouvé'],
  construction: ['#60a5fa', 'En construction'], afaire: ['#94a3b8', 'À construire'], arret: ['#64748b', 'Arrêté'], inconnu: ['#8b91a0', 'Non relevé'],
  alerte: ['#fbbf24', 'À surveiller'], gris: ['#64748b', 'N’existe pas encore'],
};
export const etatDe = (e) => ETATS[e] || ETATS.inconnu;
const TYPE = { commerce: 'open', emploi: 'bureau', medias: 'studio', finance: 'trading', cerveau: 'direction', infra: 'serveurs' };
const NORD = ['commerce', 'medias', 'emploi'], SUD = ['cerveau', 'accueil', 'finance', 'infra'];
const ESPACE = { open: 5.4, studio: 5.6, bureau: 3.6, trading: 3.8, direction: 6.8, serveurs: 5.0, accueil: 0 };
const ECRANS = { studio: 2, trading: 3 };
const PAS = 1.6, PROF = 10, COULOIR = 3.2, H_MUR = 2.9, H_FACADE = 3.4, COUPE = 1.15, OEIL = 1.62;

// ── les briques : géométries de base, couleurs, lots fusionnés ────────────────────────────────────────────────────
const G = {
  box: new THREE.BoxGeometry(1, 1, 1), cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 20), cyl8: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
  sph: new THREE.SphereGeometry(0.5, 18, 12), ico: new THREE.IcosahedronGeometry(0.5, 1), tore: new THREE.TorusGeometry(0.5, 0.07, 10, 40),
  plan: new THREE.PlaneGeometry(1, 1),
};
const capsules = new Map();
const capsule = (r, l) => { const k = r.toFixed(3) + ':' + l.toFixed(3); if (!capsules.has(k)) capsules.set(k, new THREE.CapsuleGeometry(r, l, 4, 10)); return capsules.get(k); };
const teintes = new Map();
const C = (hex) => { let c = teintes.get(hex); if (!c) { c = new THREE.Color(hex); teintes.set(hex, c); } return c; };
const UP = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
let REPERE = new THREE.Matrix4();
function repere(x = 0, z = 0, ry = 0) { REPERE = new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(1, 1, 1)); }
function poser(lot, geo, c, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
  _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
  lot.push({ g: geo, m: REPERE.clone().multiply(_m), c });
}
// une boîte posée par le bas (y = sa base) ; un cylindre de même
const boite = (lot, c, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) => poser(lot, G.box, c, x, y + h / 2, z, w, h, d, rx, ry, rz);
const cyl = (lot, c, r, h, x, y, z, geo = G.cyl) => poser(lot, geo, c, x, y + h / 2, z, r * 2, h, r * 2);
function membre(lot, c, ax, ay, az, bx, by, bz, r) {
  const a = new THREE.Vector3(ax, ay, az), b = new THREE.Vector3(bx, by, bz), d = b.clone().sub(a), l = d.length();
  const m = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()), new THREE.Vector3(1, 1, 1));
  lot.push({ g: capsule(r, Math.max(0.01, l)), m: REPERE.clone().multiply(m), c });
}
// fusionne des pièces (géométrie, matrice, couleur) en une seule géométrie, la couleur portée par chaque sommet
function fusion(parts) {
  if (!parts.length) return null;
  const prets = []; let n = 0;
  for (const p of parts) { const g = (p.g.index ? p.g.toNonIndexed() : p.g.clone()).applyMatrix4(p.m); prets.push([g, p.c]); n += g.attributes.position.count; }
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  for (const [g, c] of prets) {
    const k = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    for (let i = 0; i < k; i++) { col[(o + i) * 3] = c.r; col[(o + i) * 3 + 1] = c.g; col[(o + i) * 3 + 2] = c.b; }
    o += k; g.dispose();
  }
  const r = new THREE.BufferGeometry();
  r.setAttribute('position', new THREE.BufferAttribute(pos, 3)); r.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  r.setAttribute('color', new THREE.BufferAttribute(col, 3)); r.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  r.computeBoundingSphere(); r.computeBoundingBox();
  return r;
}

// ── les textures dessinées (aucune image à télécharger) ─────────────────────────────────────────────────────────
function toile(w, h, dessin, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; dessin(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const alea = (s) => { let x = s >>> 0 || 1; return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296); };
const SOLS = {};
function texSol(type) {
  if (SOLS[type]) return SOLS[type];
  const r = alea(type.length * 977);
  const t = toile(512, 512, (x, w, h) => {
    const fond = { bois: '#d6ccbd', beton: '#c4c9d0', moquette: '#3a4357', moquette2: '#4a4f5c', tech: '#232a37', marbre: '#e6e8ec', bois2: '#9c7a5c' }[type] || '#cccccc';
    x.fillStyle = fond; x.fillRect(0, 0, w, h);
    if (type === 'bois' || type === 'bois2') {
      for (let j = 0; j < 8; j++) for (let i = 0; i < 3; i++) {
        const dec = (j % 2) * 85, l = 0.92 + r() * 0.12;
        x.fillStyle = `rgba(${type === 'bois' ? '120,95,70' : '60,40,25'},${(l - 0.92) * 0.9})`;
        x.fillRect(i * 170 + dec, j * 64, 170, 64);
        x.fillStyle = 'rgba(70,55,40,.18)'; x.fillRect(i * 170 + dec, j * 64, 1.5, 64);
      }
      x.fillStyle = 'rgba(70,55,40,.22)'; for (let j = 0; j <= 8; j++) x.fillRect(0, j * 64, w, 1.2);
    } else if (type === 'tech') {
      x.strokeStyle = '#323c4e'; x.lineWidth = 3; for (let i = 0; i <= 4; i++) { x.beginPath(); x.moveTo(i * 128, 0); x.lineTo(i * 128, h); x.moveTo(0, i * 128); x.lineTo(w, i * 128); x.stroke(); }
      x.fillStyle = '#2b3443'; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) x.fillRect(i * 128 + 22 + a * 16, j * 128 + 22 + b * 16, 5, 5);
    } else if (type === 'marbre') {
      x.strokeStyle = 'rgba(150,158,172,.25)'; x.lineWidth = 1.5;
      for (let k = 0; k < 14; k++) { x.beginPath(); let px = r() * w, py = r() * h; x.moveTo(px, py); for (let s = 0; s < 8; s++) { px += (r() - 0.3) * 90; py += (r() - 0.5) * 60; x.lineTo(px, py); } x.stroke(); }
      x.strokeStyle = 'rgba(255,255,255,.5)'; x.lineWidth = 1; for (let i = 0; i <= 2; i++) { x.beginPath(); x.moveTo(i * 256, 0); x.lineTo(i * 256, h); x.moveTo(0, i * 256); x.lineTo(w, i * 256); x.stroke(); }
    } else {
      for (let k = 0; k < 9000; k++) { const v = r(); x.fillStyle = v > 0.5 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.05)'; x.fillRect(r() * w, r() * h, 2, 2); }
      if (type === 'beton') { x.fillStyle = 'rgba(0,0,0,.06)'; for (let i = 0; i <= 2; i++) x.fillRect(i * 256, 0, 1.5, h); }
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return (SOLS[type] = t);
}
const ECR = new Map();
function texEcran(couleur) {
  if (ECR.has(couleur)) return ECR.get(couleur);
  const r = alea(parseInt(couleur.slice(1), 16));
  const t = toile(256, 144, (x, w, h) => {
    x.fillStyle = '#0a0f1a'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#151d2d'; x.fillRect(0, 0, w, 16); x.fillRect(0, 16, 46, h);
    x.fillStyle = couleur; x.fillRect(8, 5, 26, 6);
    for (let i = 0; i < 6; i++) { x.fillStyle = i === 1 ? couleur : '#2a3650'; x.fillRect(8, 26 + i * 16, 30, 6); }
    x.fillStyle = '#1a2335'; x.fillRect(56, 24, 92, 52); x.fillRect(156, 24, 92, 52);
    x.fillStyle = couleur; for (let i = 0; i < 8; i++) { const v = 8 + r() * 36; x.fillRect(62 + i * 10, 70 - v, 6, v); }
    x.strokeStyle = couleur; x.lineWidth = 2; x.beginPath(); for (let i = 0; i < 9; i++) x.lineTo(162 + i * 10, 64 - r() * 30); x.stroke();
    x.fillStyle = '#2a3650'; for (let i = 0; i < 4; i++) x.fillRect(56, 86 + i * 13, 120 + r() * 70, 5);
  });
  ECR.set(couleur, t);
  return t;
}
let HALO = null, TRAIT = null;
const texHalo = () => HALO || (HALO = toile(128, 128, (x, w) => { const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, w, w); }));
const texTrait = () => { if (TRAIT) return TRAIT; TRAIT = toile(64, 8, (x) => { x.fillStyle = '#fff'; x.fillRect(0, 0, 30, 8); }); TRAIT.wrapS = THREE.RepeatWrapping; return TRAIT; };

// ── l'agence ─────────────────────────────────────────────────────────────────────────────────────────────────────
export function creerAgence({ hote, calque, bulle, auChoix = () => {}, auMode = () => {}, mobile = false }) {
  const rendu = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  rendu.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 1.75));
  rendu.shadowMap.enabled = true; rendu.shadowMap.type = THREE.PCFSoftShadowMap;
  rendu.toneMapping = THREE.ACESFilmicToneMapping; rendu.toneMappingExposure = 1.02;
  rendu.domElement.tabIndex = 0;
  hote.prepend(rendu.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0e17);
  scene.fog = new THREE.Fog(0x0a0e17, 95, 240);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 700);
  camera.position.set(40, 45, 50);
  const orbite = new OrbitControls(camera, rendu.domElement);
  Object.assign(orbite, { enableDamping: true, dampingFactor: 0.08, maxPolarAngle: 1.38, minDistance: 2.2, maxDistance: 230, screenSpacePanning: false, rotateSpeed: 0.55, zoomSpeed: 0.9 });

  // un environnement de studio, fait sur place : le verre et le métal ont des reflets lisibles
  {
    const studio = new THREE.Scene(), boiteS = new THREE.BoxGeometry(100, 80, 100);
    studio.add(new THREE.Mesh(boiteS, new THREE.MeshBasicMaterial({ color: 0x4a566c, side: THREE.BackSide })));
    const lum = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 3) });
    for (const [p, s] of [[[0, 36, 0], [70, 0.1, 50]], [[-46, 12, 6], [0.1, 26, 60]], [[38, 18, -35], [16, 22, 0.1]]]) {
      const m = new THREE.Mesh(G.box, lum); m.position.set(...p); m.scale.set(...s); studio.add(m);
    }
    const pm = new THREE.PMREMGenerator(rendu);
    scene.environment = pm.fromScene(studio, 0.04).texture; scene.environmentIntensity = 0.55;
    pm.dispose(); boiteS.dispose();
  }
  scene.add(new THREE.HemisphereLight(0xe2eaff, 0x1b2232, 1.05));
  const soleil = new THREE.DirectionalLight(0xfff2e2, 2.5);
  soleil.position.set(-24, 46, 30); soleil.castShadow = true;
  soleil.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
  Object.assign(soleil.shadow.camera, { left: -38, right: 38, top: 30, bottom: -30, near: 1, far: 130 });
  soleil.shadow.bias = -0.0004; soleil.shadow.normalBias = 0.045; soleil.shadow.radius = 3;
  scene.add(soleil, soleil.target);
  const contre = new THREE.DirectionalLight(0xa9c0ff, 0.75); contre.position.set(30, 22, -34); scene.add(contre);

  // l'occlusion de contact (GTAO, déjà utilisée par la 3D de Codex), hors téléphone ; le verre n'y participe pas
  let studio = null;
  if (!mobile) import('/3d/ontologie-studio.js').then(({ RenduStudio }) => {
    studio = new RenduStudio({ renderer: rendu, scene, camera });
    const o = studio.occlusion, avant = o._overrideVisibility.bind(o);
    o._overrideVisibility = function () { avant(); scene.traverse((x) => { if (x.userData.sansAO && x.visible) { x.visible = false; o._visibilityCache.push(x); } }); };
    o.blendIntensity = 0.6;
    redim();
  }).catch(() => { studio = null; });

  // matériaux du décor fusionné (couleur par sommet)
  const MAT = {
    mat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0 }),
    satin: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.05 }),
    metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.75 }),
    verre: new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.2, roughness: 0.05, metalness: 0.25, depthWrite: false, side: THREE.DoubleSide }),
    lum: new THREE.MeshBasicMaterial({ vertexColors: true }),
  };
  const matFantome = new THREE.MeshBasicMaterial({ color: 0x7fb4ff, transparent: true, opacity: 0.28, depthWrite: false });
  const matPick = new THREE.MeshBasicMaterial({ visible: false });
  const matEcran = {}; for (const k of Object.keys(ETATS)) matEcran[k] = new THREE.MeshBasicMaterial({ map: texEcran(ETATS[k][0]) });
  matEcran.eteint = new THREE.MeshBasicMaterial({ color: 0x06080c });
  matEcran.neutre = new THREE.MeshBasicMaterial({ map: texEcran('#7c8db0') });
  const matHalo = {};
  for (const k of Object.keys(ETATS)) matHalo[k] = new THREE.MeshBasicMaterial({ map: texHalo(), color: C(ETATS[k][0]), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
  const matRackLed = new THREE.MeshBasicMaterial({ map: null, color: 0xffffff, transparent: true });

  // état de la vue
  let D = null, monde = null, signature = '', actif = false, raf = 0;
  const salles = [], postes = new Map(), obstacles = [], sols = [], picks = [], jetables = [];
  let fluxInfo = [], paquets = null, rubans = null, rackLeds = null, alertes = [], batiment = { W: 40, D: 23, ZN: -11.6, ZS: 11.6 };
  let couches = { etats: true, flux: true, noms: true, murs: true }, choix = { type: 'tout' }, survol = null, mode = 'batiment';
  let hautsMurs = [], anneau = null;
  const calme = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── le plan : les pièces, leur taille, leur place ─────────────────────────────────────────────────────────────
  function dispo(s) {
    const tous = s.agents, banc = s.type === 'direction' ? tous.filter((a) => a.secteur !== 'gouvernance') : tous;
    const n = banc.length, bancs = n > 8 ? 2 : 1, k = Math.max(s.type === 'accueil' ? 0 : 2, Math.ceil(n / (2 * bancs)));
    return { banc, table: s.type === 'direction' ? tous.filter((a) => a.secteur === 'gouvernance') : [], n, bancs, k, l: k * PAS };
  }
  function largeur(s) { return s.type === 'accueil' ? 9 : 0.9 + s.d.l + 1.3 + ESPACE[s.type] + 0.7; }
  function plan() {
    const quartiers = D.plan.quartiers || [];
    const zoneDuSecteur = new Map(), ordre = new Map();
    for (const q of quartiers) q.secteurs.forEach((s, i) => { zoneDuSecteur.set(s, q.cle); ordre.set(s, i); });
    const parZone = new Map(quartiers.map((q) => [q.cle, []]));
    for (const a of D.agents) { const z = zoneDuSecteur.get(a.secteur); if (z) parZone.get(z).push(a); }
    for (const l of parZone.values()) l.sort((a, b) => (ordre.get(a.secteur) ?? 9) - (ordre.get(b.secteur) ?? 9));
    const liste = quartiers.map((q) => ({ cle: q.cle, nom: q.nom, couleur: COULEUR_ZONE[q.cle] || '#8b91a0', type: TYPE[q.cle] || 'bureau', agents: parZone.get(q.cle) }));
    liste.push({ cle: 'accueil', nom: 'Accueil', couleur: COULEUR_ZONE.accueil, type: 'accueil', agents: [] });
    for (const s of liste) { s.d = dispo(s); s.base = largeur(s); }
    const nord = NORD.map((k) => liste.find((s) => s.cle === k)).filter(Boolean), sud = SUD.map((k) => liste.find((s) => s.cle === k)).filter(Boolean);
    const somme = (r) => r.reduce((t, s) => t + s.base, 0);
    for (const s of liste) if (!nord.includes(s) && !sud.includes(s)) (somme(nord) <= somme(sud) ? nord : sud).push(s);
    const W = Math.max(somme(nord), somme(sud), 24);
    for (const [r, n] of [[nord, true], [sud, false]]) {
      const extra = W - somme(r), poids = r.reduce((t, s) => t + (ESPACE[s.type] || 2) + 1, 0);
      let x = -W / 2;
      for (const s of r) {
        const w = s.base + extra * ((ESPACE[s.type] || 2) + 1) / poids;
        Object.assign(s, { nord: n, x0: x, x1: x + w, z0: n ? -COULOIR / 2 - PROF : COULOIR / 2, z1: n ? -COULOIR / 2 : COULOIR / 2 + PROF });
        s.cx = (s.x0 + s.x1) / 2; s.cz = (s.z0 + s.z1) / 2; s.w = w;
        s.porte = s.type === 'accueil' ? s.cx : s.x0 + 0.9 + s.d.l + 0.65;
        s.zCouloir = n ? s.z1 : s.z0; s.zFacade = n ? s.z0 : s.z1; s.vers = n ? 1 : -1;   // « vers » : de la façade vers le couloir
        x += w;
      }
    }
    salles.length = 0; salles.push(...nord, ...sud);
    batiment = { W, D: 2 * PROF + COULOIR, ZN: -COULOIR / 2 - PROF, ZS: COULOIR / 2 + PROF };
  }
  const zF = (s, d) => s.zFacade + s.vers * d;         // à d mètres de la façade, vers l'intérieur
  const zC = (s, d) => s.zCouloir - s.vers * d;        // à d mètres du couloir, vers l'intérieur

  // ── les murs : pleins, vitrés, façades ; la partie haute peut être coupée (couche « murs ») ────────────────────
  function obstacle(x0, z0, x1, z1) { obstacles.push([Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)]); }
  function pieceVerticale(L, Lh, c, ep, long, y0, y1, enX, a, b, fixe) {
    // une tranche de mur entre y0 et y1, coupée à COUPE : le bas dans L, le haut dans Lh
    const m = (a + b) / 2, l = b - a;
    const ajoute = (lot, ya, yb) => { if (yb - ya < 0.005) return; enX ? boite(lot, c, l, yb - ya, ep, m, ya, fixe) : boite(lot, c, ep, yb - ya, l, fixe, ya, m); };
    if (y1 <= COUPE) ajoute(L, y0, y1); else if (y0 >= COUPE) ajoute(Lh, y0, y1); else { ajoute(L, y0, COUPE); ajoute(Lh, COUPE, y1); }
  }
  function mur(type, x1, z1, x2, z2, portes = [], h = H_MUR) {
    const enX = Math.abs(z2 - z1) < 1e-6, fixe = enX ? z1 : x1, a0 = enX ? Math.min(x1, x2) : Math.min(z1, z2), b0 = enX ? Math.max(x1, x2) : Math.max(z1, z2);
    const trous = portes.map((p) => [p.c - p.l / 2, p.c + p.l / 2]).sort((u, v) => u[0] - v[0]);
    const pleins = []; let cur = a0;
    for (const [u, v] of trous) { if (u > cur) pleins.push([cur, u]); cur = Math.max(cur, v); }
    if (cur < b0) pleins.push([cur, b0]);
    const blanc = C(type === 'facade' ? '#eef1f5' : '#f3f4f7'), plinthe = C('#5d6573'), cadre = C('#aeb8c6'), verre = C('#a9ccff');
    const ep = type === 'facade' ? 0.3 : type === 'verre' ? 0.08 : 0.14;
    for (const [a, b] of pleins) {
      if (b - a < 0.02) continue;
      enX ? obstacle(a, fixe - ep / 2 - 0.05, b, fixe + ep / 2 + 0.05) : obstacle(fixe - ep / 2 - 0.05, a, fixe + ep / 2 + 0.05, b);
      if (type === 'plein') {
        pieceVerticale(lots.mat, lots.matH, blanc, ep, b - a, 0, h, enX, a, b, fixe);
        pieceVerticale(lots.mat, lots.matH, plinthe, ep + 0.03, b - a, 0, 0.09, enX, a, b, fixe);
      } else if (type === 'verre') {
        pieceVerticale(lots.metal, lots.metalH, cadre, ep, b - a, 0, 0.07, enX, a, b, fixe);
        pieceVerticale(lots.verre, lots.verreH, verre, 0.025, b - a, 0.07, h - 0.12, enX, a, b, fixe);
        pieceVerticale(lots.metal, lots.metalH, cadre, ep, b - a, h - 0.12, h, enX, a, b, fixe);
        const n = Math.max(1, Math.round((b - a) / 1.25));
        for (let i = 0; i <= n; i++) { const p = a + (b - a) * i / n; pieceVerticale(lots.metal, lots.metalH, cadre, 0.06, 0.05, 0, h, enX, p - 0.025, p + 0.025, fixe); }
      } else {
        pieceVerticale(lots.mat, lots.matH, blanc, ep, b - a, 0, 0.95, enX, a, b, fixe);
        pieceVerticale(lots.verre, lots.verreH, verre, 0.04, b - a, 0.95, h - 0.62, enX, a, b, fixe);
        pieceVerticale(lots.mat, lots.matH, blanc, ep, b - a, h - 0.62, h, enX, a, b, fixe);
        const n = Math.max(1, Math.round((b - a) / 1.5));
        for (let i = 0; i <= n; i++) { const p = a + (b - a) * i / n; pieceVerticale(lots.metal, lots.metalH, C('#c3ccd8'), ep * 0.7, 0.06, 0.95, h - 0.62, enX, p - 0.03, p + 0.03, fixe); }
      }
    }
    // au-dessus des portes : le linteau (plein) ou la traverse (vitrée)
    for (const [u, v] of trous) {
      if (type === 'plein') pieceVerticale(lots.mat, lots.matH, blanc, ep, v - u, 2.15, h, enX, u, v, fixe);
      else if (type === 'verre') { pieceVerticale(lots.metal, lots.metalH, cadre, ep, v - u, 2.12, 2.18, enX, u, v, fixe); pieceVerticale(lots.verre, lots.verreH, verre, 0.025, v - u, 2.18, h - 0.12, enX, u, v, fixe); pieceVerticale(lots.metal, lots.metalH, cadre, ep, v - u, h - 0.12, h, enX, u, v, fixe); }
      else pieceVerticale(lots.mat, lots.matH, blanc, ep, v - u, h - 0.62, h, enX, u, v, fixe);
      for (const p of [u, v]) pieceVerticale(lots.metal, lots.metalH, cadre, ep + 0.02, 0.06, 0, type === 'facade' ? h - 0.62 : 2.15, enX, p - 0.03, p + 0.03, fixe);
    }
  }

  // ── le mobilier ──────────────────────────────────────────────────────────────────────────────────────────────
  const BUREAU = C('#f7f8fa'), PIED = C('#8e97a4'), TISSU = C('#2a303c'), PLASTIQUE = C('#59626f'), NOIR = C('#161a22'), CLAVIER = C('#2c323c');
  function chaise(L, x, z, ry, tissu = TISSU) {
    const avant = REPERE; repere(x, z, ry);
    REPERE = avant.clone().multiply(REPERE);
    boite(L.satin, tissu, 0.48, 0.07, 0.46, 0, 0.39, -0.02);
    boite(L.satin, tissu, 0.46, 0.52, 0.06, 0, 0.5, -0.27, -0.1);
    cyl(L.metal, PLASTIQUE, 0.03, 0.34, 0, 0.06, -0.02);
    for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5; boite(L.metal, PLASTIQUE, 0.05, 0.04, 0.3, Math.sin(a) * 0.14, 0.03, -0.02 + Math.cos(a) * 0.14, 0, a); }
    REPERE = avant;
  }
  // un poste : l'agent est assis à l'origine, face à +z ; le bureau devant lui, l'écran au fond
  function poste(L, x, z, ry, nEcrans = 1, accent = null) {
    const avant = REPERE; repere(x, z, ry); const R = REPERE;
    boite(L.satin, BUREAU, 1.5, 0.035, 0.75, 0, 0.72, 0.695);
    for (const s of [-1, 1]) boite(L.metal, PIED, 0.04, 0.72, 0.68, s * 0.71, 0, 0.695);
    boite(L.mat, C('#dfe3e8'), 1.38, 0.38, 0.02, 0, 0.32, 1.04);
    boite(L.satin, CLAVIER, 0.44, 0.018, 0.14, 0, 0.755, 0.5);
    boite(L.satin, CLAVIER, 0.05, 0.02, 0.08, 0.32, 0.755, 0.53);
    const ecrans = [];
    const xs = nEcrans === 3 ? [-0.62, 0, 0.62] : nEcrans === 2 ? [-0.33, 0.33] : [0];
    for (const ex of xs) {
      const a = nEcrans > 1 ? -ex * 0.55 : 0, ez = 0.9 + Math.abs(ex) * 0.12 * (nEcrans === 3 ? 1 : 0.3);
      boite(L.satin, NOIR, 0.64, 0.4, 0.03, ex, 0.88, ez + 0.015, 0, a);
      boite(L.metal, PIED, 0.04, 0.16, 0.04, ex, 0.755, ez + 0.06);
      boite(L.metal, PIED, 0.2, 0.012, 0.15, ex, 0.755, ez + 0.06);
      ecrans.push({ x: ex, y: 1.08, z: ez - 0.002, a, w: 0.6, h: 0.35 });
    }
    if (accent) boite(L.mat, accent, 1.5, 0.34, 0.03, 0, 0.755, 1.085);
    REPERE = avant;
    chaise(L, x + Math.sin(ry) * -0.02, z + Math.cos(ry) * -0.02, ry);
    return { R, ecrans };
  }
  function plante(L, x, z, t = 1) {
    cyl(L.satin, C('#e9e4dc'), 0.22 * t, 0.42 * t, x, 0, z);
    cyl(L.mat, C('#3b2f25'), 0.2 * t, 0.02, x, 0.4 * t, z);
    const f = [C('#3f8f5a'), C('#357a4c'), C('#4c9c64')];
    for (let i = 0; i < 4; i++) poser(L.mat, G.ico, f[i % 3], x + Math.sin(i * 2.1) * 0.14 * t, (0.75 + i * 0.22) * t, z + Math.cos(i * 2.1) * 0.14 * t, 0.42 * t, 0.5 * t, 0.42 * t, 0, i);
  }
  function canape(L, x, z, ry, c = C('#4a5468')) {
    const avant = REPERE; repere(x, z, ry); REPERE = avant.clone().multiply(REPERE);
    boite(L.mat, c, 1.9, 0.42, 0.85, 0, 0.04, 0);
    boite(L.mat, c, 1.9, 0.45, 0.2, 0, 0.42, -0.33);
    for (const s of [-1, 1]) boite(L.mat, c, 0.18, 0.28, 0.85, s * 0.86, 0.42, 0);
    for (const s of [-1, 1]) boite(L.mat, C('#5a6680'), 0.8, 0.1, 0.6, s * 0.42, 0.46, 0.06);
    boite(L.metal, PIED, 1.8, 0.04, 0.7, 0, 0, 0);
    REPERE = avant;
  }
  function tableRonde(L, x, z, r = 0.65) {
    cyl(L.satin, BUREAU, r, 0.04, x, 0.72, z); cyl(L.metal, PIED, 0.05, 0.72, x, 0, z); cyl(L.metal, PIED, 0.3, 0.03, x, 0, z);
  }

  // ── les gens : une personne assise, couleurs tirées de son identifiant (toujours les mêmes) ──────────────────────
  const PEAUX = ['#f1d1b8', '#e2b896', '#c08f6c', '#8a5b3d', '#f3dccb'], CHEVEUX = ['#2a211b', '#4b3426', '#151515', '#7a5a3a', '#b9b2a8'], BAS = ['#2b3340', '#1f2530', '#3a3f4a'];
  function hachage(s) { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
  function personne(id, zone) {
    const h = hachage(id), peau = C(PEAUX[h % 5]), cheveux = C(CHEVEUX[(h >> 3) % 5]), bas = C(BAS[(h >> 6) % 3]);
    const haut = new THREE.Color(COULEUR_ZONE[zone] || '#8b91a0').lerp(new THREE.Color('#ffffff'), 0.18 + ((h >> 8) % 4) * 0.08);
    const avant = REPERE; REPERE = new THREE.Matrix4();
    const corps = [], bras = [];
    boite(corps, bas, 0.34, 0.15, 0.32, 0, 0.43, -0.04);
    for (const s of [-1, 1]) {
      membre(corps, bas, s * 0.09, 0.52, -0.02, s * 0.09, 0.52, 0.34, 0.072);
      membre(corps, bas, s * 0.09, 0.5, 0.36, s * 0.09, 0.08, 0.39, 0.06);
      boite(corps, C('#161a21'), 0.11, 0.07, 0.22, s * 0.09, 0, 0.43);
    }
    poser(corps, capsule(0.15, 0.26), haut, 0, 0.86, -0.06, 1.15, 1, 0.8);
    cyl(corps, peau, 0.05, 0.1, 0, 1.1, -0.04);
    poser(corps, G.sph, peau, 0, 1.255, -0.03, 0.215, 0.25, 0.23);
    poser(corps, G.sph, cheveux, 0, 1.315, -0.055, 0.228, (h >> 11) % 3 === 0 ? 0.2 : 0.15, 0.245);
    for (const s of [-1, 1]) {
      membre(bras, haut, s * 0.2, 1.04, -0.07, s * 0.23, 0.84, 0.1, 0.055);
      membre(bras, haut, s * 0.23, 0.84, 0.1, s * 0.15, 0.78, 0.36, 0.048);
      poser(bras, G.sph, peau, s * 0.145, 0.775, 0.41, 0.085, 0.07, 0.11);
    }
    REPERE = avant;
    return { corps: fusion(corps), bras: fusion(bras) };
  }

  let lots = null;
  // ── construire tout le bâtiment ───────────────────────────────────────────────────────────────────────────────
  function construire() {
    if (monde) { scene.remove(monde); monde.traverse((o) => { if (o.geometry && !Object.values(G).includes(o.geometry)) o.geometry.dispose(); if (o.material && o.material.userData?.jetable) o.material.dispose(); }); }
    for (const t of jetables) t.dispose(); jetables.length = 0;
    monde = new THREE.Group(); scene.add(monde);
    postes.clear(); obstacles.length = 0; sols.length = 0; picks.length = 0; alertes = []; hautsMurs = [];
    lots = { mat: [], satin: [], metal: [], verre: [], lum: [], matH: [], metalH: [], verreH: [], leds: [] };
    REPERE = new THREE.Matrix4();
    plan();
    const { W, ZN, ZS } = batiment;

    // la dalle, le couloir, les sols des pièces
    boite(lots.mat, C('#cfd5de'), W + 0.6, 0.16, ZS - ZN + 0.6, 0, -0.16, 0);
    const sol = (type, w, d, x, z, rep = 4, zone = null) => {
      const t = texSol(type).clone(); t.needsUpdate = true; t.repeat.set(w / rep, d / rep); jetables.push(t);
      const m = new THREE.Mesh(G.plan, new THREE.MeshStandardMaterial({ map: t, roughness: type === 'beton' || type === 'marbre' ? 0.32 : 0.85, metalness: 0 }));
      m.material.userData.jetable = true;
      m.scale.set(w, d, 1); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.004, z); m.receiveShadow = true;
      m.userData = { zone, sol: true }; monde.add(m); sols.push(m); return m;
    };
    sol('beton', W, COULOIR, 0, 0, 6, 'couloir');
    const TYPE_SOL = { open: 'bois', studio: 'moquette2', bureau: 'moquette', trading: 'moquette2', direction: 'bois2', serveurs: 'tech', accueil: 'marbre' };
    for (const s of salles) sol(TYPE_SOL[s.type] || 'bois', s.w, PROF, s.cx, s.cz, s.type === 'serveurs' ? 2.4 : 4, s.cle);

    // les façades, l'entrée au milieu de l'accueil, les cloisons
    const accueil = salles.find((s) => s.type === 'accueil');
    mur('facade', -W / 2, ZN, W / 2, ZN, [], H_FACADE);
    mur('facade', -W / 2, ZS, W / 2, ZS, accueil ? [{ c: accueil.cx, l: 2.8 }] : [], H_FACADE);
    mur('facade', -W / 2, ZN, -W / 2, ZS, [{ c: 0, l: 2.2 }], H_FACADE);
    mur('facade', W / 2, ZN, W / 2, ZS, [{ c: 0, l: 2.2 }], H_FACADE);
    for (const r of [salles.filter((s) => s.nord), salles.filter((s) => !s.nord)]) {
      r.forEach((s, i) => { if (i) mur('plein', s.x0, s.z0, s.x0, s.z1); });
      for (const s of r) if (s.type !== 'accueil') mur(s.type === 'serveurs' ? 'plein' : 'verre', s.x0, s.zCouloir, s.x1, s.zCouloir, [{ c: s.porte, l: 1.3 }]);
    }
    // les piliers de façade, tous les six mètres environ
    for (const z of [ZN, ZS]) { const n = Math.round(W / 6); for (let i = 0; i <= n; i++) { const x = -W / 2 + W * i / n; if (accueil && z === ZS && Math.abs(x - accueil.cx) < 1.8) continue; pieceVerticale(lots.mat, lots.matH, C('#e6eaf0'), 0.5, 0.5, 0, H_FACADE + 0.05, true, x - 0.25, x + 0.25, z); } }

    // le mobilier et les agents, pièce par pièce
    for (const s of salles) meubler(s);
    // le couloir : des plantes entre les portes, une bande de guidage
    for (let x = -W / 2 + 2.5; x < W / 2 - 1; x += 7.5) { plante(lots, x, -COULOIR / 2 + 0.45, 0.9); plante(lots, x + 3.7, COULOIR / 2 - 0.45, 0.9); }
    boite(lots.lum, C('#24344f'), W - 1, 0.006, 0.06, 0, 0.006, 0);
    exterieur();

    // fusion : quelques maillages pour tout le décor
    const ajoute = (lot, mat, haut, ombre = true) => {
      const g = fusion(lot); if (!g) return;
      const m = new THREE.Mesh(g, mat); m.castShadow = ombre; m.receiveShadow = true;
      if (mat === MAT.verre || mat === MAT.lum) m.userData.sansAO = mat === MAT.verre;
      monde.add(m); if (haut) hautsMurs.push(m);
      return m;
    };
    ajoute(lots.mat, MAT.mat); ajoute(lots.satin, MAT.satin); ajoute(lots.metal, MAT.metal); ajoute(lots.verre, MAT.verre, false, false); ajoute(lots.lum, MAT.lum, false, false);
    ajoute(lots.matH, MAT.mat, true); ajoute(lots.metalH, MAT.metal, true); ajoute(lots.verreH, MAT.verre, true, false);
    if (lots.leds.length) { const g = fusion(lots.leds); rackLeds = new THREE.Mesh(g, matRackLed); monde.add(rackLeds); }

    construireFlux();
    contours();
    etiquettes();
    colorer();
    for (const m of hautsMurs) m.visible = couches.murs;
  }

  // ── chaque pièce selon son métier ────────────────────────────────────────────────────────────────────────────
  function postesEnBanc(s, liste, xg, zc, k, nEcrans) {
    const accent = new THREE.Color(s.couleur).lerp(new THREE.Color('#2a3140'), 0.35);
    const rangA = liste.slice(0, k), rangB = liste.slice(k, 2 * k);
    for (let i = 0; i < k; i++) {
      const x = xg + PAS / 2 + i * PAS;
      for (const [a, z, ry] of [[rangA[i], zc - 1.12, 0], [rangB[i], zc + 1.12, Math.PI]]) {
        const p = poste(lots, x, z, ry, nEcrans, z < zc ? accent : null);
        installerAgent(s, a, x, z, ry, p.ecrans);
      }
    }
    obstacle(xg, zc - 0.82, xg + k * PAS, zc + 0.82);
  }
  function installerAgent(s, a, x, z, ry, ecrans, portable = false) {
    const groupe = new THREE.Group(); groupe.position.set(x, 0, z); groupe.rotation.y = ry; monde.add(groupe);
    const mesEcrans = ecrans.map((e) => {
      const m = new THREE.Mesh(G.plan, matEcran.eteint); m.scale.set(e.w, e.h, 1);
      m.position.set(e.x, e.y, e.z); m.rotation.set(e.rx || 0, Math.PI + (e.a || 0), 0); groupe.add(m); return m;
    });
    if (!a) return;
    const geo = personne(a.id, s.cle);
    const matCorps = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0 }); matCorps.userData.jetable = true;
    const corps = new THREE.Mesh(geo.corps, matCorps), bras = new THREE.Mesh(geo.bras, matCorps);
    corps.castShadow = bras.castShadow = true; corps.receiveShadow = true;
    if (portable) { corps.position.z = 0; }
    groupe.add(corps, bras);
    const halo = new THREE.Mesh(G.plan, matHalo.ok); halo.rotation.x = -Math.PI / 2; halo.position.set(0, 0.02, 0.25); halo.scale.set(2.6, 2.6, 1); halo.visible = false; halo.userData.sansAO = true; halo.renderOrder = 2;
    groupe.add(halo);
    const pick = new THREE.Mesh(G.box, matPick); pick.scale.set(0.9, 1.45, 1.5); pick.position.set(0, 0.72, 0.3); pick.userData.agent = a.id; groupe.add(pick); picks.push(pick);
    const pos = new THREE.Vector3(x, 0, z);
    postes.set(a.id, { agent: a, zone: s.cle, salle: s, groupe, corps, bras, matCorps, halo, ecrans: mesEcrans, pos, ry, tete: new THREE.Vector3(x, 1.68, z), phase: hachage(a.id) % 100 / 15 });
  }
  function meubler(s) {
    const d = s.d, xg = s.x0 + 0.9, fx0 = xg + d.l + 1.3, fx1 = s.x1 - 0.7, mz = s.cz;
    const zb = d.bancs === 2 ? [mz - 2.3, mz + 2.3] : [mz];
    if (s.type !== 'accueil') zb.forEach((zc, i) => postesEnBanc(s, d.banc.slice(i * 2 * d.k, (i + 1) * 2 * d.k), xg, zc, d.k, ECRANS[s.type] || 1));
    // le paillasson de la porte, à la couleur de la zone
    if (s.type !== 'accueil') boite(lots.lum, new THREE.Color(s.couleur).multiplyScalar(0.55), 1.2, 0.008, 0.5, s.porte, 0.006, zC(s, 0.45));
    const fm = (fx0 + fx1) / 2, L = lots;
    if (s.type === 'open') {
      for (const [i, bx] of [[0, fx0 + 0.9], [1, fx0 + 2.3]]) {
        if (bx + 0.7 > fx1) continue;
        const z = zF(s, 0.95), dz = 0.6 * s.vers;
        for (const sx of [-0.6, 0.6]) for (const sz of [-0.6, 0.6]) boite(L.metal, C('#3a4250'), 0.05, 2.3, 0.05, bx + sx, 0, z + sz);
        boite(L.metal, C('#2b313b'), 1.25, 0.1, 1.25, bx, 2.3, z);
        boite(L.lum, C('#cfe0ff'), 0.9, 0.01, 0.06, bx, 2.29, z);
        boite(L.mat, new THREE.Color(s.couleur).lerp(new THREE.Color('#1f2633'), 0.4), 1.2, 2.3, 0.04, bx, 0, z - dz);
        for (const sx of [-0.6, 0.6]) boite(L.verre, C('#a9ccff'), 0.02, 2.2, 1.2, bx + sx, 0.05, z);
        boite(L.verre, C('#a9ccff'), 1.2, 2.2, 0.02, bx, 0.05, z + dz);
        cyl(L.satin, C('#e9edf2'), 0.2, 0.62, bx, 0, z - dz * 0.4);
        boite(L.satin, BUREAU, 0.7, 0.03, 0.3, bx, 1.0, z - dz * 0.8);
        obstacle(bx - 0.65, z - 0.65, bx + 0.65, z + 0.65);
      }
      const tz = zC(s, 3.2);
      tableRonde(L, fm, tz, 0.7); obstacle(fm - 0.75, tz - 0.75, fm + 0.75, tz + 0.75);
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; chaise(L, fm + Math.sin(a) * 1.05, tz + Math.cos(a) * 1.05, a + Math.PI); }
      boite(L.satin, C('#fbfcfd'), 0.03, 1.1, 2.2, s.x1 - 0.12, 1.0, s.cz); boite(L.metal, PIED, 0.04, 1.16, 2.26, s.x1 - 0.1, 0.97, s.cz);
      plante(L, fx1 - 0.2, zF(s, 0.5), 1.25); plante(L, xg - 0.35, zF(s, 0.5), 1.1);
    } else if (s.type === 'studio') {
      boite(L.satin, NOIR, 0.1, 2.0, 4.2, s.x1 - 0.17, 0.8, s.cz);
      const t = toile(768, 360, (x, w, h) => {
        x.fillStyle = '#05070b'; x.fillRect(0, 0, w, h);
        const fonds = [['#ff8a3d', '#7c3aed'], ['#4f8cff', '#0f172a'], ['#f472b6', '#ff8a3d'], ['#7c3aed', '#0ea5e9'], ['#ff5d5d', '#1e1b4b'], ['#34d399', '#0f172a']];
        for (let i = 0; i < 6; i++) {
          const cx = (i % 3) * 256, cy = Math.floor(i / 3) * 180, g = x.createLinearGradient(cx, cy, cx + 256, cy + 180);
          g.addColorStop(0, fonds[i][0]); g.addColorStop(1, fonds[i][1]); x.fillStyle = g; x.fillRect(cx + 4, cy + 4, 248, 172);
          x.fillStyle = 'rgba(255,255,255,.85)'; x.beginPath(); x.moveTo(cx + 116, cy + 70); x.lineTo(cx + 146, cy + 90); x.lineTo(cx + 116, cy + 110); x.fill();
          x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(cx + 4, cy + 150, 248, 26); x.fillStyle = 'rgba(255,255,255,.7)'; x.fillRect(cx + 14, cy + 160, 70 + i * 17, 6);
        }
      });
      jetables.push(t);
      const images = new THREE.Mesh(G.plan, new THREE.MeshBasicMaterial({ map: t })); images.material.userData.jetable = true;
      images.scale.set(4.0, 1.88, 1); images.rotation.y = -Math.PI / 2; images.position.set(s.x1 - 0.225, 1.74, s.cz); monde.add(images);
      const bz = zF(s, 0.55), cx = fx0 + 1.4;
      boite(L.mat, C('#2b2140'), 2.6, 2.3, 0.05, cx, 0, bz);
      cyl(L.satin, C('#e9edf2'), 0.2, 0.62, cx, 0, zF(s, 1.4));
      const rz = zF(s, 2.9);
      for (let i = 0; i < 3; i++) { const a = i * 2.1; membre(L.metal, C('#20252e'), cx + Math.sin(a) * 0.3, 0, rz + Math.cos(a) * 0.3, cx, 1.3, rz, 0.015); }
      poser(L.lum, G.tore, C('#fff4dd'), cx, 1.55, rz, 0.7, 0.7, 0.7);
      boite(L.satin, NOIR, 0.18, 0.12, 0.22, cx, 1.5, rz);
      canape(L, fm + 0.6, zC(s, 1.4), s.nord ? Math.PI : 0, C('#4b3f6b'));
      plante(L, fx1 - 0.1, zF(s, 0.5), 1.2);
      obstacle(cx - 1.3, bz - 0.2, cx + 1.3, bz + 0.2);
    } else if (s.type === 'bureau') {
      const couleursClasseurs = ['#4f8cff', '#9b7bff', '#f5d04b', '#34d399', '#ff8a3d', '#e2e8f0'];
      for (let i = 0; i < 3; i++) {
        const z = zF(s, 1.1 + i * 1.0); if (Math.abs(z - s.zCouloir) < 1.2) continue;
        const x = s.x1 - 0.36;
        boite(L.satin, C('#e8ebef'), 0.42, 1.95, 0.92, x, 0, z);
        for (let e = 0; e < 4; e++) {
          boite(L.satin, C('#d5dae1'), 0.4, 0.025, 0.88, x - 0.02, 0.25 + e * 0.45, z);
          for (let b = 0; b < 7; b++) boite(L.mat, C(couleursClasseurs[(i * 3 + e + b) % 6]), 0.3, 0.32, 0.075, x - 0.05, 0.28 + e * 0.45, z - 0.36 + b * 0.115);
        }
        obstacle(x - 0.25, z - 0.48, x + 0.25, z + 0.48);
      }
      const tz = zF(s, 2.2);
      tableRonde(L, fm - 0.3, tz, 0.55); chaise(L, fm - 1.1, tz, Math.PI / 2); chaise(L, fm + 0.5, tz, -Math.PI / 2);
      boite(L.satin, C('#cfd5dd'), 0.6, 0.75, 0.5, fm, 0, zC(s, 0.7)); boite(L.satin, C('#3a414c'), 0.5, 0.25, 0.42, fm, 0.75, zC(s, 0.7));
      plante(L, xg - 0.35, zF(s, 0.5), 1.15); plante(L, fx1 - 0.6, zC(s, 0.6), 0.9);
    } else if (s.type === 'trading') {
      boite(L.satin, NOIR, 0.08, 0.62, 5.8, s.x1 - 0.15, 1.95, s.cz);
      const tab = D.vies?.trading?.tableau || [];
      const t = toile(1536, 96, (x, w, h) => {
        x.fillStyle = '#04070c'; x.fillRect(0, 0, w, h);
        x.font = '600 40px Inter, system-ui, sans-serif'; x.textBaseline = 'middle'; let px = 24;
        const morceaux = tab.length ? tab.map(([n, , val]) => { const p = (val - 1000) / 10; return [n + '  ' + val.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' €', (p >= 0 ? '+' : '−') + Math.abs(p).toFixed(1).replace('.', ',') + ' %', p >= 0]; })
          : [['Trading · simulation', '', true]];
        for (const [a, b, ok] of morceaux) { x.fillStyle = '#c9d4e6'; x.fillText(a, px, h / 2); px += x.measureText(a).width + 14; x.fillStyle = ok ? '#34d399' : '#ff5d5d'; x.fillText(b, px, h / 2); px += x.measureText(b).width + 50; if (px > w) break; }
      });
      jetables.push(t); t.wrapS = THREE.RepeatWrapping;
      const bande = new THREE.Mesh(G.plan, new THREE.MeshBasicMaterial({ map: t })); bande.material.userData.jetable = true;
      bande.scale.set(5.6, 0.5, 1); bande.rotation.y = -Math.PI / 2; bande.position.set(s.x1 - 0.2, 2.26, s.cz); monde.add(bande);
      ticker = t;
      boite(L.satin, NOIR, 0.08, 1.4, 2.7, s.x1 - 0.15, 0.75, s.cz);
      const tc = toile(512, 256, (x, w, h) => {
        x.fillStyle = '#060a12'; x.fillRect(0, 0, w, h); x.strokeStyle = '#141d2c'; x.lineWidth = 1;
        for (let i = 0; i < 8; i++) { x.beginPath(); x.moveTo(0, i * 32); x.lineTo(w, i * 32); x.stroke(); }
        const r = alea(7); for (const [c, b] of [['#34d399', 150], ['#ff8a3d', 110]]) { x.strokeStyle = c; x.lineWidth = 3; x.beginPath(); let y = b; for (let i = 0; i <= 32; i++) { y += (r() - 0.48) * 18; x.lineTo(i * 16, y); } x.stroke(); }
      });
      jetables.push(tc);
      const ecranM = new THREE.Mesh(G.plan, new THREE.MeshBasicMaterial({ map: tc })); ecranM.material.userData.jetable = true;
      ecranM.scale.set(2.6, 1.3, 1); ecranM.rotation.y = -Math.PI / 2; ecranM.position.set(s.x1 - 0.2, 1.45, s.cz); monde.add(ecranM);
      const lz = zF(s, 1.6);
      for (const dx of [-0.75, 0.75]) { const ax = fm + dx; boite(L.mat, C('#39414f'), 0.75, 0.42, 0.75, ax, 0.02, lz); boite(L.mat, C('#39414f'), 0.75, 0.4, 0.16, ax, 0.42, lz - s.vers * 0.3); }
      tableRonde(L, fm, lz + s.vers * 0.95, 0.35);
      const cz = zC(s, 0.55);
      boite(L.satin, C('#e9edf2'), 1.8, 0.9, 0.6, fm, 0, cz); boite(L.satin, C('#2c323c'), 1.84, 0.04, 0.64, fm, 0.9, cz); boite(L.satin, NOIR, 0.35, 0.42, 0.32, fm - 0.5, 0.94, cz);
      obstacle(fm - 0.95, cz - 0.35, fm + 0.95, cz + 0.35);
      plante(L, fx1 - 0.2, zF(s, 0.5), 1.2);
    } else if (s.type === 'direction') {
      const bx0 = fx0 + 0.1, bx1 = s.x1 - 0.07, prof = Math.min(6.2, PROF - 2.6), bzInt = zF(s, prof);
      mur('verre', bx0, s.zFacade, bx0, bzInt, [{ c: zF(s, prof - 0.9), l: 1.1 }]);
      mur('verre', bx0, bzInt, bx1, bzInt, []);
      boite(L.mat, C('#2f3747'), bx1 - bx0 - 0.2, 0.01, prof - 0.4, (bx0 + bx1) / 2, 0.008, zF(s, prof / 2));
      const tx = (bx0 + bx1) / 2, tz = zF(s, prof / 2), lt = Math.min(3.8, bx1 - bx0 - 2.2);
      boite(L.satin, C('#f4f5f7'), lt, 0.05, 1.25, tx, 0.7, tz);
      for (const dx of [-lt / 3, lt / 3]) boite(L.metal, C('#3b4250'), 0.12, 0.7, 0.7, tx + dx, 0, tz);
      obstacle(tx - lt / 2, tz - 0.65, tx + lt / 2, tz + 0.65);
      const places = [];
      for (let i = 0; i < 4; i++) { const px = tx - lt / 2 + lt * (i + 0.5) / 4; places.push([px, tz - 0.62 - 0.3, 0], [px, tz + 0.62 + 0.3, Math.PI]); }
      places.sort((a, b) => Math.abs(a[0] - tx) - Math.abs(b[0] - tx));
      d.table.forEach((a, i) => {
        const [px, pz, ry] = places[i % places.length]; const avant = REPERE; repere(px, pz, ry);
        boite(L.satin, C('#c9ced6'), 0.34, 0.015, 0.24, 0, 0.75, 0.42);
        boite(L.satin, NOIR, 0.34, 0.22, 0.012, 0, 0.77, 0.55, 0.32);
        REPERE = avant;
        chaise(L, px, pz, ry, C('#1f2430'));
        installerAgent(s, a, px, pz, ry, [{ x: 0, y: 0.88, z: 0.541, w: 0.3, h: 0.19, rx: 0.32 }]);
      });
      for (let i = d.table.length; i < places.length; i++) chaise(L, places[i][0], places[i][2] ? places[i][1] - 0.05 : places[i][1] + 0.05, places[i][2], C('#1f2430'));
      boite(L.satin, NOIR, 0.08, 1.15, 2.0, bx1 - 0.08, 1.1, tz);
      const tv = toile(512, 288, (x, w, h) => {
        x.fillStyle = '#07090f'; x.fillRect(0, 0, w, h); const r = alea(3);
        x.fillStyle = '#f472b6'; x.fillRect(28, 26, 90, 10); x.fillStyle = '#2a3650'; x.fillRect(28, 46, 160, 7);
        for (let i = 0; i < 9; i++) { const v = 30 + r() * 130; x.fillStyle = i % 3 ? '#3b4a6b' : '#f472b6'; x.fillRect(40 + i * 48, 250 - v, 28, v); }
      });
      jetables.push(tv);
      const tvm = new THREE.Mesh(G.plan, new THREE.MeshBasicMaterial({ map: tv })); tvm.material.userData.jetable = true;
      tvm.scale.set(1.92, 1.08, 1); tvm.rotation.y = -Math.PI / 2; tvm.position.set(bx1 - 0.13, 1.68, tz); monde.add(tvm);
      plante(L, bx0 + 0.45, zF(s, 0.45), 1.2);
      boite(L.satin, C('#3a2f28'), 1.6, 0.7, 0.45, tx, 0, zF(s, 0.35));
    } else if (s.type === 'serveurs') {
      const n = Math.max(2, Math.floor((fx1 - fx0) / 0.64));
      const led = toile(64, 256, (x, w, h) => {
        x.fillStyle = 'rgba(0,0,0,0)'; x.clearRect(0, 0, w, h); const r = alea(11);
        for (let j = 0; j < 30; j++) { x.fillStyle = 'rgba(255,255,255,.08)'; x.fillRect(4, 6 + j * 8.2, 56, 6); for (let i = 0; i < 5; i++) if (r() > 0.35) { x.fillStyle = r() > 0.85 ? '#ffffff' : 'rgba(255,255,255,.85)'; x.fillRect(8 + i * 9, 8 + j * 8.2, 4, 2.5); } }
      });
      jetables.push(led); matRackLed.map = led; matRackLed.needsUpdate = true;
      for (const [rang, dz] of [[0, 1.1], [1, 3.5]]) {
        const z = zF(s, dz), face = rang === 0 ? s.vers : -s.vers;
        for (let i = 0; i < n; i++) {
          const x = fx0 + 0.32 + i * 0.64;
          boite(L.satin, C('#1b212b'), 0.6, 2.1, 1.0, x, 0, z);
          boite(L.metal, C('#2b3340'), 0.62, 0.05, 1.02, x, 2.1, z);
          const ledZ = z + face * 0.505, avant = REPERE; REPERE = new THREE.Matrix4();
          poser(lots.leds, G.plan, C('#ffffff'), x, 1.05, ledZ, 0.5, 1.85, 1, 0, face > 0 ? 0 : Math.PI, 0);
          REPERE = avant;
        }
        boite(L.metal, C('#7d8796'), n * 0.64, 0.05, 0.4, fx0 + n * 0.32, 2.45, z);
        obstacle(fx0, z - 0.52, fx0 + n * 0.64, z + 0.52);
      }
      for (const dz of [1.1, 3.5]) { const z = zF(s, dz); boite(L.satin, C('#dfe4ea'), 0.9, 1.9, 1.0, fx1 - 0.15, 0, z); for (let v = 0; v < 6; v++) boite(L.mat, C('#9aa3af'), 0.92, 0.03, 0.9, fx1 - 0.15, 0.4 + v * 0.22, z); }
      boite(L.lum, C('#1d4f6e'), fx1 - fx0, 0.006, 1.0, (fx0 + fx1) / 2, 0.007, zF(s, 2.3));
    } else if (s.type === 'accueil') {
      // la banque d'accueil : un arc tourné vers l'entrée, son filet lumineux côté visiteurs
      const cx = s.cx, zr = zF(s, 3.3), rr = 1.7, centre = zr + s.vers * rr;
      for (let i = 0; i < 7; i++) {
        const a = -1.05 + i * 0.35, px = cx + Math.sin(a) * rr, pz = centre - s.vers * Math.cos(a) * rr, ry = -s.vers * a;
        const nx = Math.sin(a) * 0.215, nz = -s.vers * Math.cos(a) * 0.215;
        boite(L.satin, C('#f5f6f8'), 0.64, 1.02, 0.42, px, 0, pz, 0, ry);
        boite(L.satin, C('#2c323c'), 0.68, 0.04, 0.5, px, 1.02, pz, 0, ry);
        boite(L.lum, C('#ff8a3d'), 0.6, 0.025, 0.02, px + nx, 0.12, pz + nz, 0, ry);
      }
      obstacle(cx - rr - 0.3, Math.min(zr, centre) - 0.3, cx + rr + 0.3, Math.max(zr, zr + s.vers * 0.9) + 0.3);
      const lw = zF(s, 5.4);
      boite(L.mat, C('#8a6a4e'), 4.4, 2.7, 0.25, cx, 0, lw);
      obstacle(cx - 2.2, lw - 0.15, cx + 2.2, lw + 0.15);
      const logo = toile(1024, 300, (x, w, h) => {
        x.clearRect(0, 0, w, h); x.font = '800 210px Inter, system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
        const t1 = 'r', t2 = 'AI', t3 = 'me', l1 = x.measureText(t1).width, l2 = x.measureText(t2).width, l3 = x.measureText(t3).width; let px = w / 2 - (l1 + l2 + l3) / 2;
        x.textAlign = 'left'; x.fillStyle = '#ffffff'; x.fillText(t1, px, h / 2); px += l1;
        const g = x.createLinearGradient(px, 0, px + l2, 0); g.addColorStop(0, '#ff8a3d'); g.addColorStop(1, '#ffb36b'); x.fillStyle = g; x.fillText(t2, px, h / 2); px += l2;
        x.fillStyle = '#ffffff'; x.fillText(t3, px, h / 2);
      });
      jetables.push(logo);
      const lm = new THREE.Mesh(G.plan, new THREE.MeshBasicMaterial({ map: logo, transparent: true })); lm.material.userData.jetable = true;
      lm.scale.set(2.6, 0.76, 1); lm.rotation.y = s.vers > 0 ? Math.PI : 0; lm.position.set(cx, 1.75, lw + (s.vers > 0 ? -0.13 : 0.13)); monde.add(lm);
      canape(L, cx - 2.9, zF(s, 1.6), Math.PI / 2, C('#3f4a5f'));
      canape(L, cx + 2.9, zF(s, 1.6), -Math.PI / 2, C('#3f4a5f'));
      for (const dx of [-1.9, 1.9]) plante(L, cx + dx, zF(s, 0.55), 1.35);
      boite(L.mat, C('#1d222b'), 2.6, 0.01, 1.6, cx, 0.006, zF(s, 0.9));
      // l'auvent et les deux poteaux de l'entrée, dehors
      const ze = s.zFacade - s.vers * 1.2;
      boite(L.mat, C('#f2f4f7'), 4.6, 0.2, 2.6, cx, 3.05, ze);
      for (const dx of [-2.1, 2.1]) cyl(L.metal, C('#c3ccd8'), 0.06, 3.05, cx + dx, 0, ze - s.vers * 1.1);
      boite(L.mat, C('#d9dee5'), 3.6, 0.08, 1.4, cx, -0.08, s.zFacade - s.vers * 0.7);
    }
  }
  let ticker = null;

  // ── dehors : le campus (rues, parking, pelouses, arbres, voisins du parc d'activités) ─────────────────────────
  function exterieur() {
    const { W, ZN, ZS } = batiment, L = lots;
    const solExt = new THREE.Mesh(new THREE.PlaneGeometry(520, 520), new THREE.MeshStandardMaterial({ color: 0x0e1422, roughness: 1 }));
    solExt.material.userData.jetable = true; solExt.rotation.x = -Math.PI / 2; solExt.position.y = -0.17; solExt.receiveShadow = true; monde.add(solExt);
    const herbe = C('#15302b'), route = C('#151b27'), trottoir = C('#252e3d'), marque = C('#4a5a78');
    boite(L.mat, herbe, W + 26, 0.02, 14, 0, -0.16, ZN - 9);
    boite(L.mat, herbe, 12, 0.02, ZS - ZN + 4, -W / 2 - 8, -0.16, 0);
    const zr = ZS + 9, xr = W / 2 + 15;
    boite(L.mat, trottoir, W + 60, 0.05, 3, 0, -0.17, zr - 5); boite(L.mat, route, W + 60, 0.02, 7, 0, -0.17, zr); boite(L.mat, trottoir, W + 60, 0.05, 3, 0, -0.17, zr + 5);
    for (let x = -W / 2 - 28; x < W / 2 + 30; x += 4) boite(L.lum, marque, 2, 0.01, 0.14, x, -0.15, zr);
    boite(L.mat, trottoir, 3, 0.05, ZS - ZN + 60, xr - 5, -0.17, 0); boite(L.mat, route, 7, 0.02, ZS - ZN + 60, xr, -0.17, 0); boite(L.mat, trottoir, 3, 0.05, ZS - ZN + 60, xr + 5, -0.17, 0);
    for (let z = ZN - 26; z < ZS + 28; z += 4) boite(L.lum, marque, 0.14, 0.01, 2, xr, -0.15, z);
    for (let i = 0; i < 6; i++) boite(L.lum, C('#7b8aa6'), 0.5, 0.012, 3.4, -1.5 + i * 0.6 + (salles.find((s) => s.type === 'accueil')?.cx || 0) - 0, -0.14, zr - 1.2);
    // le parking, entre la façade est et la rue
    const px0 = W / 2 + 2.5, px1 = xr - 6.6;
    boite(L.mat, C('#121824'), px1 - px0, 0.02, ZS - ZN - 2, (px0 + px1) / 2, -0.165, 0);
    const teintesAuto = ['#e8ecf1', '#9aa4b2', '#1f3b6e', '#121418', '#7a2f35', '#c9ced6'];
    for (let i = 0; i < 8; i++) {
      const z = ZN + 2.5 + i * 2.6, x = px0 + (px1 - px0) / 2;
      boite(L.lum, marque, px1 - px0 - 1, 0.01, 0.08, x, -0.14, z - 1.3);
      if (hachage('auto' + i) % 3 === 0) continue;
      const c = C(teintesAuto[i % 6]);
      boite(L.satin, c, 4.1, 0.55, 1.75, x, 0.12, z); boite(L.satin, c, 2.2, 0.45, 1.55, x - 0.2, 0.67, z);
      boite(L.satin, C('#1a2333'), 2.0, 0.36, 1.58, x - 0.2, 0.7, z);
      for (const dx of [-1.3, 1.3]) for (const dz of [-0.82, 0.82]) poser(L.mat, G.cyl, C('#0c0e12'), x + dx, 0.17, z + dz, 0.62, 0.22, 0.62, Math.PI / 2);
    }
    // les arbres (bosquets bas, feuillage en facettes)
    const verts = [C('#2f6b57'), C('#3b7a5f'), C('#28594a'), C('#457f63')];
    const arbre = (x, z, t) => { cyl(L.mat, C('#4a3a2c'), 0.12 * t, 1.6 * t, x, -0.16, z, G.cyl8); for (let i = 0; i < 3; i++) poser(L.mat, G.ico, verts[(((i + Math.round(x)) % 4) + 4) % 4], x + (i - 1) * 0.35 * t, (1.9 + (i % 2) * 0.5) * t, z + ((i * 7) % 3 - 1) * 0.3 * t, 1.6 * t, 1.5 * t, 1.6 * t, 0, i); };
    const r = alea(42);
    for (let i = 0; i < 18; i++) arbre(-W / 2 - 10 + r() * (W + 22), ZN - 3.5 - r() * 11, 0.85 + r() * 0.5);
    for (let i = 0; i < 8; i++) arbre(-W / 2 - 3.5 - r() * 9, ZN + r() * (ZS - ZN), 0.8 + r() * 0.5);
    for (let x = -W / 2 - 20; x < W / 2 + 25; x += 9) { arbre(x, zr - 7.2, 0.75); }
    // les lampadaires
    for (let x = -W / 2 - 18; x < W / 2 + 20; x += 12) { cyl(L.metal, C('#6b7586'), 0.06, 5, x, -0.16, zr - 4.2); boite(L.metal, C('#6b7586'), 0.9, 0.08, 0.2, x, 4.8, zr - 3.9); boite(L.lum, C('#ffe7c2'), 0.5, 0.03, 0.14, x, 4.77, zr - 3.6); }
    // les voisins du parc d'activités : halles blanches et bleues, toits à panneaux solaires, silos
    // un bâtiment voisin : bandeaux vitrés sombres à chaque étage, un liseré bleu, des équipements sur le toit
    const halle = (x, z, w, d, h, bleu) => {
      boite(L.satin, C(bleu ? '#cdd6e3' : '#dde2e9'), w, h, d, x, -0.16, z);
      for (let y = 1.0; y < h - 1.2; y += 3) boite(L.satin, C('#1b2a42'), w + 0.04, 1.5, d + 0.04, x, y, z);
      boite(L.satin, C(bleu ? '#2f6fd6' : '#3b82f6'), w + 0.06, 0.22, d + 0.06, x, h - 0.75, z);
      boite(L.mat, C('#e9edf2'), w + 0.25, 0.22, d + 0.25, x, h - 0.2, z);
      const r = alea(Math.round(x * 7 + z));
      for (let i = 0; i < 4; i++) boite(L.mat, C('#aab3bf'), 1.6 + r() * 1.4, 0.9, 1.2 + r(), x - w / 3 + r() * w * 0.6, h, z - d / 3 + r() * d * 0.6);
    };
    const solaire = (x, z, w, d, y) => { for (let i = 0; i < Math.floor(d / 1.6); i++) boite(L.satin, C('#1e3a6b'), w * 0.9, 0.05, 1.1, x, y + 0.35, z - d / 2 + 0.9 + i * 1.6, -0.35); };
    halle(-W / 2 - 22, ZN - 30, 26, 16, 9, true); solaire(-W / 2 - 22, ZN - 30, 26, 16, 8.85);
    halle(W / 2 + 10, ZN - 34, 22, 14, 12, false);
    halle(-6, ZN - 40, 18, 12, 7, true); solaire(-6, ZN - 40, 18, 12, 6.85);
    halle(-W / 2 - 34, ZS + 22, 18, 20, 8, false); solaire(-W / 2 - 34, ZS + 22, 18, 20, 7.85);
    halle(W / 2 + 40, ZS + 6, 16, 26, 10, true);
    for (const [x, z] of [[W / 2 + 33, ZN - 22], [W / 2 + 37, ZN - 22]]) { cyl(L.satin, C('#e7ebf0'), 1.6, 9, x, -0.16, z); poser(L.satin, G.sph, C('#d6dce4'), x, 8.84, z, 3.2, 1.4, 3.2); }
  }

  // ── les flux : des traits lumineux au sol, de porte en porte, et un paquet qui court ────────────────────────────
  function construireFlux() {
    fluxInfo = [];
    const flux = D.plan.flux || [], voies = new Map();
    for (const [de, vers] of flux) {
      const a = postes.get(de), b = postes.get(vers); if (!a || !b) continue;
      const k = voies.get(a.zone + b.zone) || 0; voies.set(a.zone + b.zone, k + 1);
      const voie = ((fluxInfo.length % 7) - 3) * 0.28, y = 0.03;
      const sa = a.salle, sb = b.salle, P = [];
      const pied = (p) => new THREE.Vector3(p.pos.x - Math.sin(p.ry) * 0.55, y, p.pos.z - Math.cos(p.ry) * 0.55);
      const A = pied(a), B = pied(b);
      P.push(A);
      if (sa === sb) { P.push(new THREE.Vector3(sa.porte, y, A.z), new THREE.Vector3(sa.porte, y, B.z)); }
      else {
        P.push(new THREE.Vector3(sa.porte + voie * 0.3, y, A.z), new THREE.Vector3(sa.porte + voie * 0.3, y, voie), new THREE.Vector3(sb.porte - voie * 0.3, y, voie), new THREE.Vector3(sb.porte - voie * 0.3, y, B.z));
      }
      P.push(B);
      const longueurs = [0]; for (let i = 1; i < P.length; i++) longueurs.push(longueurs[i - 1] + P[i].distanceTo(P[i - 1]));
      fluxInfo.push({ de, vers, P, longueurs, L: longueurs[longueurs.length - 1], t: Math.random(), couleur: new THREE.Color(COULEUR_ZONE[a.zone] || '#8b91a0') });
    }
    // un seul maillage pour tous les traits (couleur et opacité par sommet), une texture en tirets qui défile
    const pos = [], uv = [], col = [], idx = [];
    for (const f of fluxInfo) {
      f.debut = col.length / 4;
      for (let i = 1; i < f.P.length; i++) {
        const a = f.P[i - 1], b = f.P[i], d = b.clone().sub(a); if (d.length() < 1e-4) continue;
        const n = new THREE.Vector3(-d.z, 0, d.x).normalize().multiplyScalar(0.045), o = pos.length / 3;
        for (const [p, l] of [[a.clone().add(n), f.longueurs[i - 1]], [a.clone().sub(n), f.longueurs[i - 1]], [b.clone().add(n), f.longueurs[i]], [b.clone().sub(n), f.longueurs[i]]]) {
          pos.push(p.x, p.y, p.z); uv.push(l / 0.55, 0); col.push(f.couleur.r, f.couleur.g, f.couleur.b, 0.9);
        }
        idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
      }
      f.fin = col.length / 4;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4)); g.setIndex(idx);
    const m = new THREE.MeshBasicMaterial({ map: texTrait(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide });
    m.userData.jetable = true;
    rubans = new THREE.Mesh(g, m); rubans.userData.sansAO = true; rubans.renderOrder = 3; monde.add(rubans);
    paquets = new THREE.InstancedMesh(new THREE.SphereGeometry(0.075, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }), Math.max(1, fluxInfo.length));
    paquets.material.userData.jetable = true; paquets.userData.sansAO = true; paquets.count = fluxInfo.length;
    fluxInfo.forEach((f, i) => paquets.setColorAt(i, f.couleur.clone().lerp(new THREE.Color('#ffffff'), 0.35)));
    monde.add(paquets);
  }
  const _v = new THREE.Vector3(), _o = new THREE.Object3D();
  function pointSur(f, t) {
    const d = t * f.L; let i = 1; while (i < f.longueurs.length - 1 && f.longueurs[i] < d) i++;
    const a = f.P[i - 1], b = f.P[i], seg = f.longueurs[i] - f.longueurs[i - 1] || 1;
    return _v.copy(a).lerp(b, (d - f.longueurs[i - 1]) / seg);
  }

  // ── contour et voile de chaque pièce (choix, survol, alerte) ──────────────────────────────────────────────────
  function contours() {
    for (const s of salles) {
      const g = new THREE.Group(), m = new THREE.MeshBasicMaterial({ color: C(s.couleur), transparent: true, opacity: 0.95 }); m.userData.jetable = true;
      for (const [w, d, x, z] of [[s.w, 0.07, s.cx, s.z0 + 0.04], [s.w, 0.07, s.cx, s.z1 - 0.04], [0.07, PROF, s.x0 + 0.04, s.cz], [0.07, PROF, s.x1 - 0.04, s.cz]]) {
        const b = new THREE.Mesh(G.box, m); b.scale.set(w, 0.02, d); b.position.set(x, 0.02, z); g.add(b);
      }
      g.visible = false; g.userData.sansAO = true; monde.add(g); s.contour = g;
      const vm = new THREE.MeshBasicMaterial({ map: texHalo(), color: C('#ff5d5d'), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }); vm.userData.jetable = true;
      const v = new THREE.Mesh(G.plan, vm); v.rotation.x = -Math.PI / 2; v.scale.set(s.w * 1.1, PROF * 1.1, 1); v.position.set(s.cx, 0.025, s.cz); v.userData.sansAO = true; v.renderOrder = 1; monde.add(v); s.voile = v;
    }
    anneau = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.72, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    anneau.geometry.userData = {}; anneau.material.userData.jetable = true; anneau.rotation.x = -Math.PI / 2; anneau.visible = false; anneau.userData.sansAO = true; monde.add(anneau);
  }

  // ── les épingles (agents) et les étiquettes (pièces), en HTML par-dessus la 3D ───────────────────────────────
  const MOTS_VIDES = new Set(['de', 'des', 'du', 'la', 'le', 'les', 'à', 'au', 'aux', 'et', 'en', 'd’', 'l’', 'pour', 'sur', 'un', 'une']);
  const initiales = (n) => String(n || '?').replace(/[’']/g, ' ').split(/\s+/).filter((w) => w && !MOTS_VIDES.has(w.toLowerCase())).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function etiquettes() {
    calque.innerHTML = '';
    for (const s of salles) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'salle3d'; b.dataset.zone = s.cle; b.style.setProperty('--z', s.couleur);
      b.addEventListener('click', (e) => { e.stopPropagation(); if (s.type === 'accueil') return; choisir({ type: 'zone', cle: s.cle }); auChoix(choix); });
      b.addEventListener('pointerenter', () => { survolSalle = s.cle; }); b.addEventListener('pointerleave', () => { survolSalle = null; });
      calque.appendChild(b); s.el = b;
    }
    for (const [id, p] of postes) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'pin3d'; b.dataset.agent = id; b.style.setProperty('--z', COULEUR_ZONE[p.zone] || '#8b91a0');
      b.innerHTML = `<span>${esc(initiales(p.agent.nom))}</span><em>${esc(p.agent.nom)}</em>`;
      b.setAttribute('aria-label', p.agent.nom);
      b.addEventListener('click', (e) => { e.stopPropagation(); choisir({ type: 'agent', id }); auChoix(choix); });
      b.addEventListener('pointerenter', (e) => { survol = id; montrerBulle(id, e); }); b.addEventListener('pointerleave', () => { survol = null; bulle.style.display = 'none'; });
      calque.appendChild(b); p.el = b;
    }
  }
  let survolSalle = null;
  function montrerBulle(id, ev) {
    const p = postes.get(id); if (!p) return;
    const [c, n] = etatDe(p.agent.etat), r = hote.getBoundingClientRect();
    bulle.innerHTML = `<b>${esc(p.agent.nom)}</b><span style="color:${c}">● ${esc(n)}</span>${p.agent.rythme ? ` · <small>${esc(p.agent.rythme)}</small>` : ''}<br><small>${esc(String(p.agent.mesure || p.agent.maintenant || '').slice(0, 150))}</small>`;
    bulle.style.left = Math.min(r.width - 140, Math.max(140, ev.clientX - r.left)) + 'px'; bulle.style.top = ev.clientY - r.top + 'px'; bulle.style.display = 'block';
  }
  const ecranVisible = new THREE.Vector3();
  function placerEtiquettes() {
    const w = hote.clientWidth, h = hote.clientHeight, dist = camera.position.distanceTo(orbite.target), places = [];
    const proche = mode === 'visite' || dist < 24;
    const zoneActive = choix.type === 'zone' ? choix.cle : choix.type === 'agent' ? postes.get(choix.id)?.zone : null;
    const projeter = (v) => { ecranVisible.copy(v).project(camera); return ecranVisible.z < 1 && Math.abs(ecranVisible.x) < 1.05 && Math.abs(ecranVisible.y) < 1.05 ? [(ecranVisible.x + 1) / 2 * w, (1 - ecranVisible.y) / 2 * h] : null; };
    // les pièces d'abord (pas en visite rapprochée), puis les épingles par priorité
    for (const s of salles) {
      let xy = couches.noms && !(mode === 'visite' && camera.position.distanceTo(_v.set(s.cx, 1.6, s.cz)) > 22) ? projeter(_v.set(s.type === 'accueil' ? s.cx : (s.porte + s.cx) / 2, H_MUR + 0.55, zF(s, 2.4))) : null;   // l'étiquette du côté façade : celles des deux rangées ne se croisent jamais
      if (mode === 'campus') xy = null;
      s.el.style.display = xy ? '' : 'none';
      if (xy) {
        // deux plaques qui se chevauchent : la seconde monte d'un cran (jamais l'une sur l'autre)
        const l = (s.el.offsetWidth || 120) / 2 + 4;
        for (let k = 1; k < 5 && places.some((q) => xy[0] - l < q[2] && xy[0] + l > q[0] && xy[1] - 15 < q[3] && xy[1] + 15 > q[1]); k++) xy[1] += (k % 2 ? 1 : -1) * k * 16;
        s.el.style.transform = `translate(${xy[0]}px,${xy[1]}px) translate(-50%,-50%)`; s.el.classList.toggle('actif', zoneActive === s.cle || survolSalle === s.cle); places.push([xy[0] - l, xy[1] - 15, xy[0] + l, xy[1] + 15]);
      }
    }
    const liste = [...postes.values()].map((p) => {
      const e = p.agent.etat, choisi = choix.type === 'agent' && choix.id === p.agent.id;
      const prio = choisi ? 0 : survol === p.agent.id ? 1 : e === 'panne' ? 2 : e === 'vide' ? 3 : 4;
      const voulu = choisi || survol === p.agent.id || ((e === 'panne' || e === 'vide') && mode !== 'campus') || (couches.noms && (zoneActive ? p.zone === zoneActive : proche));
      return { p, prio, voulu, choisi };
    }).sort((a, b) => a.prio - b.prio);
    for (const { p, voulu, choisi, prio } of liste) {
      let xy = voulu ? projeter(p.tete) : null;
      if (xy && mode === 'visite' && camera.position.distanceTo(p.tete) > 16 && prio > 3) xy = null;
      if (xy && prio > 1) { const r = [xy[0] - 17, xy[1] - 17, xy[0] + 17, xy[1] + 17]; if (places.some((q) => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1])) xy = null; else places.push(r); }
      p.el.style.display = xy ? '' : 'none';
      if (xy) { p.el.style.transform = `translate(${xy[0]}px,${xy[1]}px) translate(-50%,-100%)`; p.el.classList.toggle('choisi', choisi || survol === p.agent.id); }
    }
  }

  // ── les couleurs et les poses suivent l'état réel de chaque agent ─────────────────────────────────────────────
  function colorer() {
    for (const p of postes.values()) {
      const a = D.agents.find((x) => x.id === p.agent.id) || p.agent; p.agent = a;
      const e = ETATS[a.etat] ? a.etat : 'inconnu', fantome = e === 'construction' || e === 'afaire', absent = e === 'arret';
      const ecr = !couches.etats ? matEcran.neutre : (e === 'afaire' || e === 'arret') ? matEcran.eteint : matEcran[e];
      for (const m of p.ecrans) m.material = ecr;
      p.corps.visible = p.bras.visible = !absent;
      p.corps.material = p.bras.material = fantome ? matFantome : p.matCorps;
      p.corps.rotation.x = e === 'vide' ? -0.07 : e === 'panne' ? 0.06 : 0;
      p.halo.visible = couches.etats && (e === 'panne' || e === 'vide');
      p.halo.material = matHalo[e] || matHalo.inconnu; p.halo.scale.setScalar(e === 'panne' ? 3.2 : 2.2);
      if (p.el) { p.el.style.setProperty('--e', etatDe(e)[0]); p.el.classList.toggle('e-panne', e === 'panne'); p.el.classList.toggle('e-vide', e === 'vide'); p.el.classList.toggle('e-fantome', fantome || absent); }
    }
    for (const s of salles) {
      const ag = [...postes.values()].filter((p) => p.zone === s.cle), pannes = ag.filter((p) => p.agent.etat === 'panne').length;
      s.pannes = pannes; s.n = ag.length;
      if (s.el) s.el.innerHTML = `<i></i><b>${esc(s.nom)}</b>${s.type === 'accueil' ? '' : `<small>${ag.length}</small>`}${pannes ? `<span>${pannes} en panne</span>` : ''}`;
    }
    const infra = [...postes.values()].filter((p) => p.zone === 'infra').map((p) => p.agent.etat);
    matRackLed.color.set(infra.includes('panne') ? '#ff6b6b' : infra.includes('vide') ? '#fbbf24' : '#7dd3fc');
    if (rubans) {
      const col = rubans.geometry.attributes.color;
      for (const f of fluxInfo) { const ok = postes.get(f.de)?.agent.etat === 'ok'; f.actif = ok; for (let i = f.debut; i < f.fin; i++) col.setW(i, ok ? 0.95 : 0.22); }
      col.needsUpdate = true; rubans.visible = couches.flux; paquets.visible = couches.flux;
    }
    marquerChoix();
  }
  function marquerChoix() {
    const zoneActive = choix.type === 'zone' ? choix.cle : choix.type === 'agent' ? postes.get(choix.id)?.zone : null;
    for (const s of salles) if (s.contour) s.contour.visible = zoneActive === s.cle;
    for (const p of postes.values()) p.matCorps.emissive.set(choix.type === 'agent' && choix.id === p.agent.id ? 0x333333 : survol === p.agent.id ? 0x1c1c1c : 0x000000);
    const p = choix.type === 'agent' ? postes.get(choix.id) : null;
    if (anneau) { anneau.visible = !!p; if (p) { anneau.position.set(p.pos.x, 0.03, p.pos.z); anneau.material.color.set(etatDe(p.agent.etat)[0]); } }
  }

  // ── la caméra : vues d'ensemble, pièce, agent, et la visite à hauteur d'yeux ──────────────────────────────────
  let vol = null, fovVoulu = 38;
  const recul = (rayon) => { const vf = THREE.MathUtils.degToRad(camera.fov) / 2, hf = Math.atan(Math.tan(vf) * camera.aspect); return rayon / Math.sin(Math.min(vf, hf)); };
  function pose(nom, s) {
    const { W, D: P } = batiment;
    if (nom === 'campus') { const c = new THREE.Vector3(4, 0, 4); return { cible: c, pos: c.clone().add(new THREE.Vector3(0.9, 0.7, 1).normalize().multiplyScalar(recul(Math.hypot(W, P) / 2) * 1.55)) }; }
    if (nom === 'zone') { const c = new THREE.Vector3(s.cx, 0, s.cz); return { cible: c, pos: c.clone().add(new THREE.Vector3(0.28, 1, s.nord ? 0.7 : 0.62).normalize().multiplyScalar(recul(Math.hypot(s.w, PROF) / 2) * 1.02)) }; }
    if (nom === 'agent') { const c = s.pos.clone().setY(0.85).add(new THREE.Vector3(Math.sin(s.ry), 0, Math.cos(s.ry)).multiplyScalar(0.35)), d = new THREE.Vector3(0.45, 1.7, -0.85).applyAxisAngle(UP, s.ry).normalize(); return { cible: c, pos: c.clone().add(d.multiplyScalar(4.4)) }; }
    const c = new THREE.Vector3(0, 0, 0.6);
    return { cible: c, pos: c.clone().add(new THREE.Vector3(0.38, 1, 0.74).normalize().multiplyScalar(recul(Math.hypot(W, P) / 2) * 0.86)) };
  }
  function voler(p, ms = 950) { vol = { de: camera.position.clone(), deC: orbite.target.clone(), vers: p.pos, versC: p.cible, t0: performance.now(), ms }; }
  // la visite : marcher (ZQSD, WASD ou flèches), regarder (glisser), aller (clic au sol) ; les murs et les meubles arrêtent
  const visite = { lacet: 0, tangage: -0.08, pos: new THREE.Vector3(), touches: new Set(), but: null };
  function bloque(x, z) {
    const r = 0.28;
    return Math.abs(x) > batiment.W / 2 - 0.3 || z < batiment.ZN + 0.3 || z > batiment.ZS - 0.3
      || obstacles.some(([a, b, c, d]) => x > a - r && x < c + r && z > b - r && z < d + r);
  }
  function marcher(dx, dz) { const p = visite.pos; if (!bloque(p.x + dx, p.z)) p.x += dx; if (!bloque(p.x, p.z + dz)) p.z += dz; }
  function regarderVisite() { const d = new THREE.Vector3(-Math.sin(visite.lacet) * Math.cos(visite.tangage), Math.sin(visite.tangage), -Math.cos(visite.lacet) * Math.cos(visite.tangage)); camera.position.copy(visite.pos); camera.lookAt(visite.pos.clone().add(d)); }
  function changerMode(m, cle = null) {
    if (m === mode && m !== 'batiment' && !cle) return;
    const avant = mode; mode = m;
    fovVoulu = m === 'visite' ? 62 : 38;
    if (m === 'visite') {
      // on entre par le bout du couloir, ou par la porte de la pièce demandée, en regardant vers l'intérieur
      const piece = cle && salles.find((s) => s.cle === cle && s.type !== 'accueil');
      if (piece) { visite.pos.set(piece.porte, OEIL, zC(piece, 0.9)); visite.lacet = piece.vers > 0 ? 0 : Math.PI; }
      else { visite.pos.set(-batiment.W / 2 + 1.4, OEIL, 0.3); visite.lacet = -Math.PI / 2; }   // le bout du couloir, regard vers l'est
      visite.tangage = -0.12; visite.but = null;
      const d = new THREE.Vector3(-Math.sin(visite.lacet), -0.1, -Math.cos(visite.lacet));
      voler({ pos: visite.pos.clone(), cible: visite.pos.clone().add(d) }, 1300);
      orbite.enabled = false; rendu.domElement.focus();
    } else {
      orbite.enabled = true;
      if (avant === 'visite') { orbite.target.copy(camera.position.clone().add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(6)).setY(0)); }
      voler(m === 'campus' ? pose('campus') : choix.type === 'zone' ? pose('zone', salles.find((s) => s.cle === choix.cle)) : pose('ensemble'));
    }
    auMode(mode);
  }

  // ── viser, survoler, cliquer ─────────────────────────────────────────────────────────────────────────────────
  const rayon = new THREE.Raycaster(), souris = new THREE.Vector2();
  function viser(ev) {
    const r = rendu.domElement.getBoundingClientRect();
    souris.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    rayon.setFromCamera(souris, camera);
    const a = rayon.intersectObjects(picks, false)[0], s = rayon.intersectObjects(sols, false)[0];
    if (a && (!s || a.distance < s.distance + 0.5)) return { type: 'agent', id: a.object.userData.agent, point: a.point };
    return s ? { type: 'sol', zone: s.object.userData.zone, point: s.point } : null;
  }
  let appui = null, glisse = null;
  rendu.domElement.addEventListener('pointerdown', (ev) => { appui = [ev.clientX, ev.clientY]; if (mode === 'visite') { glisse = [ev.clientX, ev.clientY]; rendu.domElement.setPointerCapture(ev.pointerId); } });
  rendu.domElement.addEventListener('pointermove', (ev) => {
    if (mode === 'visite' && glisse && !vol) {
      visite.lacet -= (ev.clientX - glisse[0]) * 0.0042; visite.tangage = Math.max(-1.1, Math.min(0.9, visite.tangage - (ev.clientY - glisse[1]) * 0.0034)); glisse = [ev.clientX, ev.clientY]; visite.but = null; return;
    }
    const v = viser(ev);
    const id = v?.type === 'agent' ? v.id : null;
    if (id !== survol) { survol = id; marquerChoix(); }
    survolSalle = v?.type === 'sol' && v.zone !== 'couloir' ? v.zone : null;
    rendu.domElement.style.cursor = v?.type === 'agent' ? 'pointer' : mode === 'visite' ? 'crosshair' : v?.type === 'sol' && v.zone !== 'couloir' ? 'pointer' : 'grab';
    if (id) montrerBulle(id, ev); else bulle.style.display = 'none';
  });
  rendu.domElement.addEventListener('pointerleave', () => { survol = null; survolSalle = null; bulle.style.display = 'none'; });
  rendu.domElement.addEventListener('pointerup', (ev) => {
    glisse = null;
    if (!appui || Math.hypot(ev.clientX - appui[0], ev.clientY - appui[1]) > 6) return;
    const v = viser(ev);
    if (v?.type === 'agent') { choisir({ type: 'agent', id: v.id }, { voler: mode !== 'visite' }); auChoix(choix); }
    else if (mode === 'visite' && v?.type === 'sol') { visite.but = new THREE.Vector3(v.point.x, OEIL, v.point.z); }
    else if (v?.type === 'sol' && v.zone && v.zone !== 'couloir' && v.zone !== 'accueil') { choisir({ type: 'zone', cle: v.zone }); auChoix(choix); }
    else if (!v || v.zone === 'couloir') { if (mode !== 'campus') { choisir({ type: 'tout' }); auChoix(choix); } }
  });
  rendu.domElement.addEventListener('dblclick', () => { if (mode === 'batiment' && choix.type === 'zone') changerMode('visite', choix.cle); });
  const TOUCHES = { KeyW: 'av', KeyZ: 'av', ArrowUp: 'av', KeyS: 'ar', ArrowDown: 'ar', KeyA: 'g', KeyQ: 'g', ArrowLeft: 'g', KeyD: 'd', ArrowRight: 'd', ShiftLeft: 'vite', ShiftRight: 'vite' };
  addEventListener('keydown', (e) => {
    if (mode !== 'visite' || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) return;
    if (e.key === 'Escape') { changerMode('batiment'); return; }
    if (TOUCHES[e.code]) { visite.touches.add(TOUCHES[e.code]); visite.but = null; e.preventDefault(); }
  });
  addEventListener('keyup', (e) => { if (TOUCHES[e.code]) visite.touches.delete(TOUCHES[e.code]); });
  addEventListener('blur', () => visite.touches.clear());

  // ── choisir (depuis la 3D ou depuis les panneaux) ────────────────────────────────────────────────────────────
  function choisir(sel, { voler: bouger = true } = {}) {
    choix = sel || { type: 'tout' };
    marquerChoix();
    if (!bouger || mode === 'visite') return;
    if (mode === 'campus' && choix.type !== 'tout') mode = 'batiment', auMode(mode);
    if (choix.type === 'agent') { const p = postes.get(choix.id); if (p) voler(pose('agent', p)); }
    else if (choix.type === 'zone') { const s = salles.find((x) => x.cle === choix.cle); if (s) voler(pose('zone', s)); }
    else if (mode === 'batiment') voler(pose('ensemble'));
  }

  // ── la boucle : animations, vol, visite, rendu ───────────────────────────────────────────────────────────────
  const horloge = new THREE.Clock(); let lent = 0;
  function boucle() {
    raf = requestAnimationFrame(boucle);
    const dt = Math.min(horloge.getDelta(), 0.05), t = horloge.elapsedTime;
    if (vol) {
      const k0 = Math.min(1, (performance.now() - vol.t0) / vol.ms), k = k0 < 0.5 ? 4 * k0 * k0 * k0 : 1 - Math.pow(-2 * k0 + 2, 3) / 2;
      camera.position.lerpVectors(vol.de, vol.vers, k);
      if (mode === 'visite') { camera.lookAt(_v.lerpVectors(vol.deC, vol.versC, k)); }
      else { orbite.target.lerpVectors(vol.deC, vol.versC, k); camera.lookAt(orbite.target); }
      if (k0 >= 1) vol = null;
    } else if (mode === 'visite') {
      const vit = (visite.touches.has('vite') ? 5 : 2.4) * dt, f = new THREE.Vector3(-Math.sin(visite.lacet), 0, -Math.cos(visite.lacet)), dr = new THREE.Vector3(-f.z, 0, f.x);
      const m = new THREE.Vector3();
      if (visite.touches.has('av')) m.add(f); if (visite.touches.has('ar')) m.sub(f); if (visite.touches.has('d')) m.add(dr); if (visite.touches.has('g')) m.sub(dr);
      if (m.lengthSq()) { m.normalize().multiplyScalar(vit); marcher(m.x, m.z); }
      else if (visite.but) {
        const d = visite.but.clone().sub(visite.pos).setY(0), l = d.length();
        if (l < 0.15) visite.but = null;
        else { const avant = visite.pos.clone(); d.normalize().multiplyScalar(Math.min(l, 2.6 * dt)); marcher(d.x, d.z); if (avant.distanceTo(visite.pos) < 1e-4) visite.but = null; const cible = Math.atan2(-(visite.but?.x - visite.pos.x || 0), -(visite.but?.z - visite.pos.z || 0)); if (visite.but) visite.lacet += Math.atan2(Math.sin(cible - visite.lacet), Math.cos(cible - visite.lacet)) * Math.min(1, dt * 3); }
      }
      regarderVisite();
    } else orbite.update();
    if (Math.abs(camera.fov - fovVoulu) > 0.05) { camera.fov += (fovVoulu - camera.fov) * Math.min(1, dt * 3.5); camera.updateProjectionMatrix(); }
    if (!calme) {
      for (const p of postes.values()) {
        const e = p.agent.etat;
        if (e === 'ok' || e === 'attente') { p.bras.position.y = Math.sin(t * 11 + p.phase) * 0.006; p.corps.position.y = Math.sin(t * 1.7 + p.phase) * 0.004; }
      }
      const k = (Math.sin(t * 3.2) + 1) / 2;
      matHalo.panne.opacity = 0.35 + k * 0.55; matHalo.vide.opacity = 0.32;
      for (const s of salles) if (s.voile) s.voile.material.opacity = couches.etats && s.pannes ? 0.06 + k * 0.1 : 0;
      if (anneau?.visible) anneau.scale.setScalar(1 + ((t * 0.8) % 1) * 0.5), anneau.material.opacity = 0.9 - ((t * 0.8) % 1) * 0.7;
      if (texTrait()) texTrait().offset.x -= dt * 1.4;
      if (ticker) ticker.offset.x += dt * 0.025;
      if (paquets && couches.flux) {
        fluxInfo.forEach((f, i) => {
          f.t = (f.t + dt * (f.actif ? 2.2 : 0.5) / Math.max(4, f.L)) % 1;
          _o.position.copy(pointSur(f, f.t)); _o.position.y = 0.09; _o.scale.setScalar(f.actif ? 1 : 0.6); _o.updateMatrix(); paquets.setMatrixAt(i, _o.matrix);
        });
        paquets.instanceMatrix.needsUpdate = true;
      }
    }
    // la qualité s'adapte : une machine trop lente perd d'abord l'occlusion, puis la finesse de l'image
    lent = dt > 0.045 ? lent + 1 : Math.max(0, lent - 2);
    if (lent > 120) { lent = 0; if (studio?.enabled) studio.enabled = false; else if (rendu.getPixelRatio() > 1) { rendu.setPixelRatio(1); redim(); } }
    if (studio && studio.enabled) studio.render(); else rendu.render(scene, camera);
    if (D) placerEtiquettes();
  }
  function redim() {
    const w = hote.clientWidth, h = hote.clientHeight; if (!w || !h) return;
    rendu.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); studio?.resize(w, h);
  }
  new ResizeObserver(redim).observe(hote);

  // ── ce que la page appelle ───────────────────────────────────────────────────────────────────────────────────
  let premiere = true;
  return {
    donnees(d) {
      D = d;
      const sig = D.agents.map((a) => a.id + ':' + a.secteur).join('|') + '#' + (D.plan.quartiers || []).map((q) => q.cle + q.secteurs.join(',')).join(';') + '#' + (D.plan.flux || []).length;
      if (sig !== signature) { signature = sig; construire(); if (premiere) { premiere = false; redim(); const p = pose('ensemble'); camera.position.copy(p.pos.clone().multiplyScalar(1.35)); orbite.target.copy(p.cible); voler(p, 1600); } }
      else colorer();
    },
    choisir(sel, o) { choisir(sel, o); },
    mode: changerMode,
    get modeActuel() { return mode; },
    couche(nom, v) { couches[nom] = v; if (nom === 'murs') for (const m of hautsMurs) m.visible = v; if (D) colorer(); },
    get couches() { return { ...couches }; },
    zoom(f) { if (mode === 'visite') { visite.pos.add(new THREE.Vector3(-Math.sin(visite.lacet), 0, -Math.cos(visite.lacet)).multiplyScalar(f > 1 ? -1.5 : 1.5)); return; } const d = camera.position.clone().sub(orbite.target); voler({ pos: orbite.target.clone().add(d.multiplyScalar(f)), cible: orbite.target.clone() }, 450); },
    recentrer() { if (mode === 'visite') changerMode('batiment'); else { choix = { type: 'tout' }; marquerChoix(); voler(mode === 'campus' ? pose('campus') : pose('ensemble')); auChoix(choix); } },
    actif(v) { if (v === actif) return; actif = v; if (v) { horloge.getDelta(); redim(); boucle(); } else cancelAnimationFrame(raf); },
    salles: () => salles.map((s) => ({ cle: s.cle, nom: s.nom, couleur: s.couleur, n: s.n, pannes: s.pannes })),
    redim,
  };
}
