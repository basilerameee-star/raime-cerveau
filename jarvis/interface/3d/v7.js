// Le cockpit v7 (22/10/2026) : l'agence en 3D, vivante, au centre ; les panneaux suivent le clic.
// Données : /api/v6 (agents, plan des zones, flux, livraisons) toutes les 30 s ; /api/v7/analyses (objectifs d'hier,
// gouverneur des agents, clips, prospection) toutes les 5 min. Rien n'est inventé : ce qui manque est « non relevé ».
import * as THREE from 'three';
import { OrbitControls } from '/3d/vendor/OrbitControls.js';

const COULEUR_ZONE = { commerce: '#3b82f6', emploi: '#a78bfa', medias: '#f59e0b', finance: '#22c55e', cerveau: '#ec4899', infra: '#38bdf8' };
const ETATS = {
  ok: ['#22c55e', 'En service'], vide: ['#f59e0b', 'À vide'], panne: ['#ef4444', 'En panne'], construction: ['#64748b', 'En construction'],
  afaire: ['#94a3b8', 'À faire'], attente: ['#38bdf8', 'En attente'], arret: ['#475569', 'Arrêté'], inconnu: ['#7c8597', 'Non relevé'],
};
const etat = (e) => ETATS[e] || ETATS.inconnu;
const CASE = 3.1;                         // place d'un agent dans sa pièce (unités de la scène)
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nombre = (n) => (n == null ? '—' : Number(n).toLocaleString('fr-FR'));
function ilYa(iso) {
  if (!iso) return 'jamais relevé';
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  if (m < 48 * 60) return `il y a ${Math.round(m / 60)} h`;
  return `il y a ${Math.round(m / 1440)} j`;
}

let D = null, A = null, choix = { type: 'tout' }, zoneActive = null;
const couches = { etats: true, flux: true, noms: true };

// ── la scène ──────────────────────────────────────────────────────────────────────────────────────────────────────
const boite = $('scene');
const rendu = new THREE.WebGLRenderer({ antialias: true, alpha: true });
rendu.setPixelRatio(Math.min(devicePixelRatio, 2));
boite.prepend(rendu.domElement);
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 500);
camera.position.set(34, 34, 34);
const controles = new OrbitControls(camera, rendu.domElement);
Object.assign(controles, { enableDamping: true, dampingFactor: 0.08, minPolarAngle: 0.35, maxPolarAngle: 1.15, minZoom: 0.5, maxZoom: 2.6, screenSpacePanning: true });
scene.add(new THREE.AmbientLight(0xffffff, 0.55));
const soleil = new THREE.DirectionalLight(0xffffff, 1.1);
soleil.position.set(20, 40, 12);
scene.add(soleil);
const lumiereBleue = new THREE.PointLight(0x3b82f6, 30, 80);
lumiereBleue.position.set(0, 12, 0);
scene.add(lumiereBleue);

let monde = null;                          // le groupe reconstruit quand la liste des agents change
const epingles = new Map();                // id d'agent → { groupe, tete, anneau, zone, agent, pos }
const pieces = new Map();                  // clé de zone → { sol, centre, taille, nom }
let fluxObjets = [], points = [], signature = '';

// Le cadrage suit la taille réelle de l'agence : ses coins vus par la caméra, plus une marge (sinon des zones sortaient)
function cadrer() {
  const l = boite.clientWidth, h = boite.clientHeight;
  rendu.setSize(l, h, false);
  const r = l / h;
  let lx = 22 * r, ly = 22;
  if (monde) {
    camera.updateMatrixWorld();
    const b = new THREE.Box3(), v = new THREE.Vector3();    // les pièces et les épingles, pas la grille du fond
    for (const p of pieces.values()) b.expandByObject(p.sol);
    for (const e of epingles.values()) b.expandByObject(e.groupe);
    b.max.y += 1.5;
    let mx = 0, my = 0;
    for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
      v.set(x, y, z).sub(controles.target).applyMatrix4(camera.matrixWorldInverse.clone().setPosition(0, 0, 0));
      mx = Math.max(mx, Math.abs(v.x)); my = Math.max(my, Math.abs(v.y));
    }
    const demi = Math.max(my, mx / r) * 0.96;
    lx = demi * r; ly = demi;
  }
  Object.assign(camera, { left: -lx, right: lx, top: ly, bottom: -ly });
  camera.updateProjectionMatrix();
}
addEventListener('resize', cadrer);

function construire() {
  if (monde) { scene.remove(monde); monde.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); }); }
  monde = new THREE.Group();
  scene.add(monde);
  epingles.clear(); pieces.clear(); fluxObjets = []; points = [];
  const quartiers = D.plan.quartiers;
  const parZone = new Map(quartiers.map((q) => [q.cle, []]));
  const zoneDuSecteur = new Map(quartiers.flatMap((q) => q.secteurs.map((s) => [s, q.cle])));
  const ordreSecteur = new Map(quartiers.flatMap((q) => q.secteurs.map((s, i) => [s, i])));
  for (const a of D.agents) {
    const z = zoneDuSecteur.get(a.secteur);
    if (z) parZone.get(z).push(a);
  }
  for (const l of parZone.values()) l.sort((a, b) => (ordreSecteur.get(a.secteur) ?? 9) - (ordreSecteur.get(b.secteur) ?? 9));
  // deux rangées de pièces, chacune à sa taille (le nombre d'agents qu'elle loge)
  const taille = (n) => { const c = Math.max(2, Math.ceil(Math.sqrt(n * 1.5))); return [c, Math.max(2, Math.ceil(n / c))]; };
  const rangs = [quartiers.slice(0, 3), quartiers.slice(3)];
  const ECART = 2.2;
  const plan = rangs.map((r) => r.map((q) => { const [c, l] = taille(parZone.get(q.cle).length); return { q, c, l, L: c * CASE + 1.6, P: l * CASE + 1.6 }; }));
  const largeur = Math.max(...plan.map((r) => r.reduce((s, x) => s + x.L, 0) + ECART * (r.length - 1)));
  const profondeurs = plan.map((r) => Math.max(...r.map((x) => x.P)));
  const total = profondeurs.reduce((a, b) => a + b, 0) + ECART;
  // la dalle de l'agence
  const dalle = new THREE.Mesh(new THREE.BoxGeometry(largeur + 4, 0.6, total + 4), new THREE.MeshStandardMaterial({ color: 0x141b2b, roughness: 0.9 }));
  dalle.position.y = -0.4;
  monde.add(dalle);
  const grille = new THREE.GridHelper(Math.max(largeur, total) + 4, 40, 0x1f2a40, 0x182134);
  grille.position.y = -0.09;
  monde.add(grille);
  let z0 = -total / 2;
  plan.forEach((r, ri) => {
    let x0 = -largeur / 2 + (largeur - (r.reduce((s, x) => s + x.L, 0) + ECART * (r.length - 1))) / 2;
    for (const { q, c, L, P } of r) {
      const couleur = new THREE.Color(COULEUR_ZONE[q.cle] || '#8a96ab');
      const cx = x0 + L / 2, cz = z0 + P / 2;
      const sol = new THREE.Mesh(new THREE.BoxGeometry(L, 0.16, P), new THREE.MeshStandardMaterial({ color: couleur, transparent: true, opacity: 0.22, emissive: couleur, emissiveIntensity: 0.12 }));
      sol.position.set(cx, 0, cz);
      sol.userData = { zone: q.cle };
      monde.add(sol);
      // les murs : bas, translucides, l'arête haute à la couleur de la zone
      const mur = new THREE.MeshStandardMaterial({ color: 0xdfe7f5, transparent: true, opacity: 0.13 });
      for (const [w, d, x, z] of [[L, 0.12, cx, z0], [L, 0.12, cx, z0 + P], [0.12, P, x0, cz], [0.12, P, x0 + L, cz]]) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1.1, d), mur);
        m.position.set(x, 0.55, z);
        monde.add(m);
        const arete = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color: couleur, transparent: true, opacity: 0.55 }));
        arete.position.copy(m.position);
        monde.add(arete);
      }
      pieces.set(q.cle, { sol, centre: new THREE.Vector3(cx, 0, cz), taille: Math.max(L, P), nom: q.nom, couleur: COULEUR_ZONE[q.cle] });
      parZone.get(q.cle).forEach((a, i) => {
        const px = x0 + 0.8 + CASE / 2 + (i % c) * CASE, pz = z0 + 0.8 + CASE / 2 + Math.floor(i / c) * CASE;
        const groupe = new THREE.Group();
        groupe.position.set(px, 0, pz);
        const tige = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 8), new THREE.MeshStandardMaterial({ color: 0x9fb0cc, transparent: true, opacity: 0.6 }));
        tige.position.y = 0.65;
        const tete = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 16), new THREE.MeshStandardMaterial({ color: 0xffffff, emissiveIntensity: 0.9, roughness: 0.35 }));
        tete.position.y = 1.55;
        tete.userData = { agent: a.id };
        const socle = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.08, 28), new THREE.MeshStandardMaterial({ color: 0x1b2438 }));
        socle.position.y = 0.12;
        const anneau = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 40), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
        anneau.rotation.x = -Math.PI / 2;
        anneau.position.y = 0.18;
        groupe.add(tige, tete, socle, anneau);
        monde.add(groupe);
        epingles.set(a.id, { groupe, tete, anneau, zone: q.cle, agent: a, pos: new THREE.Vector3(px, 1.55, pz) });
      });
      x0 += L + ECART;
    }
    z0 += profondeurs[ri] + ECART;
  });
  // les flux de données : un arc d'un agent à l'autre, parcouru par des points
  for (const [de, vers] of D.plan.flux || []) {
    const a = epingles.get(de), b = epingles.get(vers);
    if (!a || !b) continue;
    const milieu = a.pos.clone().add(b.pos).multiplyScalar(0.5);
    milieu.y += 1.2 + a.pos.distanceTo(b.pos) * 0.18;
    const courbe = new THREE.QuadraticBezierCurve3(a.pos, milieu, b.pos);
    const couleur = new THREE.Color(COULEUR_ZONE[a.zone] || '#8a96ab');
    const ligne = new THREE.Line(new THREE.BufferGeometry().setFromPoints(courbe.getPoints(40)), new THREE.LineBasicMaterial({ color: couleur, transparent: true, opacity: 0.32 }));
    monde.add(ligne);
    fluxObjets.push(ligne);
    for (let k = 0; k < 2; k++) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), new THREE.MeshBasicMaterial({ color: couleur }));
      monde.add(p);
      points.push({ p, courbe, t: k / 2 + Math.random() * 0.2, de, vers });
    }
  }
  etiquettesZones();
  colorer();
  cadrer();
}

// ── les couleurs suivent l'état de chaque agent ──────────────────────────────────────────────────────────────────
function colorer() {
  for (const e of epingles.values()) {
    const a = D.agents.find((x) => x.id === e.agent.id) || e.agent;
    e.agent = a;
    const c = new THREE.Color(couches.etats ? etat(a.etat)[0] : (COULEUR_ZONE[e.zone] || '#8a96ab'));
    e.tete.material.color.copy(c);
    e.tete.material.emissive.copy(c);
    e.anneau.material.color.copy(c);
    const pale = zoneActive && e.zone !== zoneActive;
    e.groupe.traverse((o) => { if (o.material) { o.material.transparent = true; o.material.opacity = pale ? 0.18 : (o === e.anneau ? 0.7 : 1); } });
  }
  for (const [cle, p] of pieces) p.sol.material.opacity = zoneActive ? (cle === zoneActive ? 0.36 : 0.08) : 0.22;
  for (const l of fluxObjets) l.visible = couches.flux;
  for (const p of points) p.p.visible = couches.flux;
}

// ── les noms posés sur le plan ───────────────────────────────────────────────────────────────────────────────────
function etiquettesZones() {
  const c = $('etiquettes');
  c.innerHTML = '';
  for (const [cle, p] of pieces) {
    const d = document.createElement('div');
    d.className = 'etiquette';
    d.dataset.zone = cle;
    c.appendChild(d);
  }
  for (const [id, e] of epingles) {
    const d = document.createElement('div');
    d.className = 'etiquette';
    d.dataset.agent = id;
    d.style.cssText = 'font-size:10px;letter-spacing:0;text-transform:none;font-weight:600;color:#ffffffc8;white-space:normal;'
      + 'width:96px;text-align:center;line-height:1.15';
    d.textContent = e.agent.nom;
    c.appendChild(d);
  }
}
const vec = new THREE.Vector3();
function placerEtiquettes() {
  const l = boite.clientWidth, h = boite.clientHeight;
  for (const d of $('etiquettes').children) {
    let p, montrer = couches.noms;
    if (d.dataset.zone) {
      const z = pieces.get(d.dataset.zone);
      p = vec.copy(z.centre).add(new THREE.Vector3(0, 0.2, z.taille * 0.18));
      const ag = [...epingles.values()].filter((e) => e.zone === d.dataset.zone);
      const pannes = ag.filter((e) => e.agent.etat === 'panne').length;
      d.innerHTML = `${esc(z.nom)}<small>${ag.length} agents${pannes ? ` · <span style="color:#ff8a8a">${pannes} en panne</span>` : ''}</small>`;
    } else {
      const e = epingles.get(d.dataset.agent);
      p = vec.copy(e.pos).add(new THREE.Vector3(0, 0.75, 0));
      montrer = couches.noms && (zoneActive === e.zone || (choix.type === 'agent' && choix.id === d.dataset.agent));
    }
    p.project(camera);
    d.style.display = montrer && p.z < 1 ? 'block' : 'none';
    d.style.left = ((p.x + 1) / 2) * l + 'px';
    d.style.top = ((1 - p.y) / 2) * h + 'px';
  }
}

// ── survol et clic ───────────────────────────────────────────────────────────────────────────────────────────────
const rayon = new THREE.Raycaster(), souris = new THREE.Vector2();
function viser(ev) {
  const r = rendu.domElement.getBoundingClientRect();
  souris.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  rayon.setFromCamera(souris, camera);
  const tetes = [...epingles.values()].map((e) => e.tete);
  const t = rayon.intersectObjects(tetes)[0];
  if (t) return { type: 'agent', id: t.object.userData.agent };
  const s = rayon.intersectObjects([...pieces.values()].map((p) => p.sol))[0];
  return s ? { type: 'zone', cle: s.object.userData.zone } : null;
}
let survol = null;
rendu.domElement.addEventListener('pointermove', (ev) => {
  const v = viser(ev), b = $('bulle');
  survol = v?.type === 'agent' ? v.id : null;
  rendu.domElement.style.cursor = v ? 'pointer' : 'grab';
  if (v?.type === 'agent') {
    const a = epingles.get(v.id).agent, [c, n] = etat(a.etat);
    b.innerHTML = `<b>${esc(a.nom)}</b><span style="color:${c}">● ${n}</span><br><small>${esc((a.mesure || a.maintenant || '').slice(0, 140))}</small>`;
    const r = boite.getBoundingClientRect();
    b.style.left = ev.clientX - r.left + 'px';
    b.style.top = ev.clientY - r.top + 'px';
    b.style.display = 'block';
  } else b.style.display = 'none';
});
let appui = null;
rendu.domElement.addEventListener('pointerdown', (ev) => { appui = [ev.clientX, ev.clientY]; });
rendu.domElement.addEventListener('pointerup', (ev) => {
  if (!appui || Math.hypot(ev.clientX - appui[0], ev.clientY - appui[1]) > 6) return;   // un glisser n'est pas un clic
  const v = viser(ev);
  if (v?.type === 'agent') selectionner({ type: 'agent', id: v.id });
  else if (v?.type === 'zone') selectionner({ type: 'zone', cle: v.cle });
  else selectionner({ type: 'tout' });
});

let vol = null;                             // le déplacement doux de la caméra vers une zone
function viserZone(cle) {
  const p = cle ? pieces.get(cle) : null;
  vol = { de: controles.target.clone(), vers: p ? p.centre.clone() : new THREE.Vector3(), z0: camera.zoom, z1: p ? Math.min(2.1, 34 / p.taille) : 1, t: 0 };
}
function selectionner(s) {
  choix = s;
  const z = s.type === 'zone' ? s.cle : s.type === 'agent' ? epingles.get(s.id)?.zone : null;
  if (z !== zoneActive || s.type === 'tout') { zoneActive = z; viserZone(z); }
  for (const b of $('onglets').children) b.setAttribute('aria-pressed', String((b.dataset.zone || null) === zoneActive));
  colorer();
  droite();
}

// ── les panneaux ─────────────────────────────────────────────────────────────────────────────────────────────────
function compter(agents) {
  const n = {};
  for (const a of agents) n[a.etat] = (n[a.etat] || 0) + 1;
  return n;
}
function barreEtats(agents) {
  const n = compter(agents), t = agents.length || 1;
  const ordre = ['ok', 'vide', 'panne', 'attente', 'construction', 'afaire', 'arret', 'inconnu'];
  return `<div class="barre">${ordre.filter((k) => n[k]).map((k) => `<span style="width:${(100 * n[k]) / t}%;background:${etat(k)[0]}"></span>`).join('')}</div>
    <div class="legende">${ordre.filter((k) => n[k]).map((k) => `<span><i style="background:${etat(k)[0]}"></i>${etat(k)[1]} <b class="num">${n[k]}</b></span>`).join('')}</div>`;
}
function gauche() {
  const ag = D.agents, n = compter(ag);
  const actifs = ag.filter((a) => ['ok', 'vide', 'panne', 'attente'].includes(a.etat)).length;
  let h = `<div class="carte"><h2>L'agence <small>${ag.length} agents</small></h2>
    <div class="grand num">${Math.round((100 * (n.ok || 0)) / (actifs || 1))}<small> % en service</small></div>${barreEtats(ag)}</div>`;
  const m = A?.matin;
  h += `<div class="carte"><h2>Objectifs d'hier ${m ? `<small>${esc(m.le?.slice(11, 16) || '')}</small>` : ''}</h2>${m ? m.jugement.map((o) =>
    `<div class="objectif"><b style="background:${o.tenu ? '#22c55e22' : '#ef444422'};color:${o.tenu ? '#4ade80' : '#f87171'}">${o.tenu ? '✓' : '✕'}</b><span>${esc(o.objectif)}<small>${esc(o.detail)}</small></span></div>`).join('')
    : '<div class="vide-txt">Non relevé : le gouverneur du matin passe à 6 h 30 UTC.</div>'}</div>`;
  const c = A?.clips;
  const ig = c?.par_plateforme?.find((g) => g.valeur === 'instagram'), yt = c?.par_plateforme?.find((g) => g.valeur === 'youtube');
  h += `<div class="carte"><h2>Clips <small>${c ? c.clips_suivis + ' suivis' : ''}</small></h2>${c ? `<div class="lignes">
      <div><span>Instagram, vues médianes</span><b class="num">${nombre(ig?.vues_mediane)}</b></div>
      <div><span>Record</span><b class="num">${nombre(ig?.meilleur)}</b></div>
      <div><span>YouTube, vues médianes</span><b class="num">${nombre(yt?.vues_mediane)}</b></div>
      <div><span>Seuil de paiement</span><b class="num">3 000 à 4 000</b></div></div>
      <div class="legende" style="margin-top:12px">${Object.entries(c.repartition || {}).map(([k, v]) => `<span>${esc(k)} <b class="num">${Math.round(v * 100)} %</b></span>`).join('')}</div>`
    : '<div class="vide-txt">Non relevé.</div>'}</div>`;
  const p = A?.prospection;
  h += `<div class="carte"><h2>Prospection</h2>${p ? `<div class="lignes">
      <div><span>E-mails envoyés</span><b class="num">${nombre(p.email.envoyes)}</b></div>
      <div><span>Réponses</span><b class="num">${nombre(p.email.reponses)}</b></div>
      <div><span>Appels joints</span><b class="num">${nombre(p.appels.joints)}</b></div>
      <div><span>Intéressés</span><b class="num">${nombre(p.appels.interesses)}</b></div>
      <div><span>Gagnés</span><b class="num">${nombre(p.appels.gagnes)}</b></div></div>` : '<div class="vide-txt">Non relevé.</div>'}</div>`;
  $('gauche').innerHTML = h;
}
function ligneAgent(a) {
  const [c] = etat(a.etat);
  return `<button type="button" class="agent-ligne" data-agent="${esc(a.id)}"><i style="background:${c};box-shadow:0 0 6px ${c}"></i><span>${esc(a.nom)}</span><small>${esc(etat(a.etat)[1])}</small></button>`;
}
function droite() {
  const d = $('droite');
  let h = '';
  if (choix.type === 'agent') {
    const a = D.agents.find((x) => x.id === choix.id);
    if (!a) { choix = { type: 'tout' }; return droite(); }
    const [c, n] = etat(a.etat), z = epingles.get(a.id)?.zone, p = pieces.get(z);
    h = `<div class="carte"><button type="button" class="retour" data-zone="${esc(z)}">← ${esc(p?.nom || 'Retour')}</button>
      <div class="titre-panneau"><i style="background:${c};box-shadow:0 0 10px ${c}"></i><h3>${esc(a.nom)}</h3></div>
      <p class="texte"><span class="badge" style="background:${c}22;color:${c}">${esc(n)}</span> <span style="color:var(--gris)">${esc(a.rythme || '')}</span></p>
      ${a.maintenant ? `<span class="etiq">Ce qu'il fait</span><p class="texte">${esc(a.maintenant)}</p>` : ''}
      ${a.mesure ? `<span class="etiq">Mesuré</span><p class="texte"><b>${esc(a.mesure)}</b></p>` : ''}
      ${a.derniere_panne?.texte && a.etat !== 'ok' ? `<span class="etiq">Pourquoi</span><p class="texte">${esc(a.derniere_panne.texte)}</p>` : ''}
      ${a.bloque && a.bloque !== '—' ? `<span class="etiq">Ce qui bloque</span><p class="texte">${esc(a.bloque)}</p>` : ''}
      ${a.ensuite && a.ensuite !== 'Rien.' ? `<span class="etiq">Ensuite</span><p class="texte">${esc(a.ensuite)}</p>` : ''}
      <span class="etiq">Dernier passage</span><p class="texte">${esc(ilYa(a.dernier))}</p>
      ${(a.outils || []).length ? `<span class="etiq">Outils</span><div class="outils">${a.outils.map((o) => `<span>${esc(o[0])} · ${esc(o[1])}</span>`).join('')}</div>` : ''}</div>`;
  } else if (choix.type === 'zone') {
    const p = pieces.get(choix.cle), ag = [...epingles.values()].filter((e) => e.zone === choix.cle).map((e) => e.agent);
    h = `<div class="carte"><button type="button" class="retour" data-tout="1">← Toute l'agence</button>
      <div class="titre-panneau"><i style="background:${p.couleur}"></i><h3>${esc(p.nom)}</h3></div>${barreEtats(ag)}</div>
      <div class="carte"><h2>Agents <small>${ag.length}</small></h2>${ag.map(ligneAgent).join('')}</div>`;
    const vie = D.vies?.[{ medias: 'clipping', emploi: 'candidatures' }[choix.cle] || ''];
    if (vie?.resume) h += `<div class="carte"><h2>En bref</h2><p class="texte" style="margin:0">${esc(vie.resume)}</p></div>`;
  } else {
    const pannes = D.agents.filter((a) => a.etat === 'panne'), vides = D.agents.filter((a) => a.etat === 'vide');
    h = `<div class="carte"><h2>À traiter <small>${pannes.length + vides.length}</small></h2>${[...pannes, ...vides].map(ligneAgent).join('') || '<div class="vide-txt">Rien en panne ni à vide.</div>'}</div>`;
    const g = A?.agents?.suivis || [];
    if (g.length) h += `<div class="carte"><h2>Le gouverneur propose</h2>${g.slice(0, 6).map((x) => `<p class="texte" style="margin:0 0 8px"><b>${esc(x.nom)}</b> : ${esc(x.proposition)}</p>`).join('')}</div>`;
    h += `<div class="carte"><h2>Dernières livraisons <small>${nombre(D.majs?.stats?.n)} en tout</small></h2>${(D.majs?.livrees || []).slice(0, 5).map((l) =>
      `<div class="lignes" style="margin-bottom:6px"><div><span>${esc(ilYa(l.le))}</span><span style="color:${l.ok ? '#4ade80' : '#f87171'}">${l.ok ? 'en service' : 'refusée'}</span></div></div>`).join('') || '<div class="vide-txt">Non relevé.</div>'}</div>`;
  }
  d.innerHTML = h;
  d.querySelectorAll('[data-agent]').forEach((b) => b.addEventListener('click', () => selectionner({ type: 'agent', id: b.dataset.agent })));
  d.querySelectorAll('[data-zone]').forEach((b) => b.addEventListener('click', () => selectionner({ type: 'zone', cle: b.dataset.zone })));
  d.querySelectorAll('[data-tout]').forEach((b) => b.addEventListener('click', () => selectionner({ type: 'tout' })));
}
function onglets() {
  const nav = $('onglets');
  nav.innerHTML = `<button type="button" aria-pressed="${!zoneActive}">Vue d'ensemble</button>` + D.plan.quartiers.map((q) =>
    `<button type="button" data-zone="${esc(q.cle)}" aria-pressed="${zoneActive === q.cle}">${esc(q.nom)}</button>`).join('');
  for (const b of nav.children) b.addEventListener('click', () => selectionner(b.dataset.zone ? { type: 'zone', cle: b.dataset.zone } : { type: 'tout' }));
}
function bas() {
  const l = D.majs?.livrees?.[0], r = D.direct?.releve_hote;
  const morceaux = [];
  if (A?.matin?.ligne) morceaux.push(`<b>${esc(A.matin.ligne)}</b>`);
  if (l) morceaux.push(`dernière livraison ${esc(ilYa(l.le))}`);
  morceaux.push(`relevé du serveur ${r ? esc(ilYa(r.le)) : 'absent'}`);
  $('fil').innerHTML = morceaux.join(' · ');
  const frais = r?.frais, p = $('etat-direct');
  p.className = 'pastille' + (frais ? '' : ' alerte');
  p.querySelector('span').textContent = frais ? `En direct · ${ilYa(D.direct.lu_le)}` : 'Relevé en retard';
  $('coin').innerHTML = `<b>${D.agents.filter((a) => a.etat === 'ok').length}</b> agents en service · <b style="color:#f87171">${D.agents.filter((a) => a.etat === 'panne').length}</b> en panne`;
}

// ── les données en direct ────────────────────────────────────────────────────────────────────────────────────────
async function lire() {
  try {
    const r = await fetch('/api/v6', { credentials: 'same-origin', cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    D = await r.json();
  } catch (e) {
    $('attente').textContent = 'Le cockpit ne répond pas (' + e.message + '). Nouvel essai dans 30 s.';
    return;
  }
  $('attente').style.display = 'none';
  const sig = D.agents.map((a) => a.id + a.secteur).join('|') + (D.plan.flux || []).length;
  if (sig !== signature) { signature = sig; construire(); onglets(); }
  else colorer();
  gauche(); droite(); bas();
}
async function lireAnalyses() {
  try { const r = await fetch('/api/v7/analyses', { credentials: 'same-origin', cache: 'no-store' }); A = r.ok ? await r.json() : null; } catch { A = null; }
  if (D) { gauche(); droite(); bas(); }
}

// ── les couches et le zoom ───────────────────────────────────────────────────────────────────────────────────────
for (const b of $('couches').children) b.addEventListener('click', () => {
  couches[b.dataset.couche] = !couches[b.dataset.couche];
  b.setAttribute('aria-pressed', String(couches[b.dataset.couche]));
  colorer();
});
$('zoom').addEventListener('input', (e) => { camera.zoom = e.target.value / 100; camera.updateProjectionMatrix(); });
setInterval(() => { $('heure').textContent = new Date().toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }) + ' · Paris'; }, 1000);

// ── l'animation : pouls des pannes, flux qui coulent, caméra qui vole ────────────────────────────────────────────
const horloge = new THREE.Clock();
function animer() {
  requestAnimationFrame(animer);
  const dt = Math.min(horloge.getDelta(), 0.05), t = horloge.elapsedTime;
  for (const e of epingles.values()) {
    const a = e.agent, s = survol === a.id || (choix.type === 'agent' && choix.id === a.id) ? 1.35 : 1;
    if (a.etat === 'panne') {
      const k = (t * 0.9) % 1;
      e.anneau.scale.setScalar(1 + k * 1.6);
      e.anneau.material.opacity = (1 - k) * 0.8 * (zoneActive && e.zone !== zoneActive ? 0.25 : 1);
    } else {
      e.anneau.scale.setScalar(1 + Math.sin(t * 2 + e.pos.x) * 0.04);
    }
    e.tete.position.y = 1.55 + (a.etat === 'ok' ? Math.sin(t * 1.6 + e.pos.z) * 0.06 : 0);
    e.tete.scale.lerp(new THREE.Vector3(s, s, s), 0.2);
  }
  for (const p of points) {
    const vit = epingles.get(p.de)?.agent.etat === 'ok' ? 0.22 : 0.06;
    p.t = (p.t + dt * vit) % 1;
    p.p.position.copy(p.courbe.getPoint(p.t));
  }
  if (vol) {
    vol.t = Math.min(1, vol.t + dt * 1.8);
    const k = 1 - Math.pow(1 - vol.t, 3);
    controles.target.lerpVectors(vol.de, vol.vers, k);
    camera.zoom = vol.z0 + (vol.z1 - vol.z0) * k;
    camera.updateProjectionMatrix();
    $('zoom').value = Math.round(camera.zoom * 100);
    if (vol.t >= 1) vol = null;
  }
  lumiereBleue.intensity = 26 + Math.sin(t * 0.8) * 6;
  controles.update();
  rendu.render(scene, camera);
  if (D) placerEtiquettes();
}

cadrer();
animer();
lire().then(lireAnalyses);
setInterval(lire, 30_000);
setInterval(lireAnalyses, 5 * 60_000);
