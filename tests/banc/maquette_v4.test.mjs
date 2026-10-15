// LE HÉROS v4 des maquettes (15/10/2026) : le premier écran tient en quatre éléments (le nom, un titre, un bouton, une
// photo choisie), chaque information une seule fois, rien d'inventé, un seul geste animé, et la photo est servie par
// le Cockpit depuis le dépôt. Le constat du 09/10 sur la v3 sert de liste : nom 3 fois, téléphone 3 fois, « Commander »
// qui lance un appel, 10 tailles de texte et 11 couleurs, 3 animations, des photos à marque.
import './outils.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { maquetteV4, HEROS, maquettePremium } from '../../agents/maquette_premium.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const DOSSIER = path.join(ICI, '..', '..', 'jarvis', 'interface', 'heros');
const TAD = { nom: 'TAD MARKET', metier: 'boucherie', ville: 'Annecy', adresse: "8 Avenue d'Aix les Bains 74600", telephone: '+33 450644817',
  horaires: 'Mo-Sa 08:00-19:00', lat: 45.9, lon: 6.12 };
const corps = (h) => h.slice(h.indexOf('<body>'), h.indexOf('</body>'));
const style = (h) => h.slice(h.indexOf('<style>'), h.indexOf('</style>'));
const compte = (h, motif) => (h.match(motif) || []).length;

test('quatre éléments : le nom une fois, un titre, un bouton, une photo ; rien d’autre au premier écran', () => {
  const b = corps(maquetteV4(TAD));
  assert.equal(compte(b, /TAD MARKET/g), 1, 'le nom une seule fois');
  assert.equal(compte(b, /<h1>/g), 1); assert.equal(compte(b, /<img /g), 1); assert.equal(compte(b, /<a /g), 1);
  assert.equal(compte(b, /class="logo"/g), 1);
  const texte = b.replace(/<[^>]+>/g, ' ');
  assert.ok(!/maquette|démonstration|rAIme/i.test(texte), 'la mention « maquette » viendra une fois, en bas de page, pas au premier écran');
  assert.ok(!/<nav|<dl|<p[ >]|<script/i.test(b), 'ni menu, ni encart, ni texte, ni script');
});

test('le bouton dit ce qu’il fait : le numéro lisible (un appel), « Appeler » sur téléphone ; sans numéro, l’itinéraire', () => {
  const b = corps(maquetteV4(TAD));
  assert.equal(compte(b, /04 50 64 48 17/g), 1, 'le téléphone une seule fois');
  assert.match(b, /href="tel:0450644817"/); assert.ok(!b.includes('+33'), 'jamais le numéro brut');
  assert.match(b, />Appeler</);
  assert.ok(!/Commander|Réserver|Prendre rendez-vous/.test(b), 'aucun verbe qui promet autre chose qu’un appel');
  const sans = corps(maquetteV4({ ...TAD, telephone: null }));
  assert.ok(!/tel:/.test(sans)); assert.match(sans, />Itinéraire</);
  assert.match(sans, /google\.com\/maps\/search\/TAD%20MARKET%208%20Avenue%20d&#39;Aix%20les%20Bains%2C%2074600%20Annecy/);
});

test('rien d’inventé : ni avis, ni prix, ni horaires (même connus) au premier écran ; le titre vaut pour tout le métier', () => {
  const b = corps(maquetteV4(TAD));
  assert.ok(!/avis|étoile|€|prix|tarif|lun\.|sam\.|h–|Horaires/i.test(b));
  for (const [metier, h] of Object.entries(HEROS)) {
    const autre = corps(maquetteV4({ nom: 'Un autre', metier, ville: 'Thônes', telephone: '04 50 00 00 01' }));
    assert.ok(autre.includes(h.titre[2]), `${metier} : le même titre pour tout commerce du métier`);
    assert.ok(!autre.includes('Thônes'), `${metier} : la ville n’entre pas dans le titre`);
  }
});

test('typographie : l’italique seulement sur le mot-clé, au début de la première ligne ; texte 18/14 ; trois couleurs', () => {
  for (const metier of Object.keys(HEROS)) {
    const h = maquetteV4({ ...TAD, metier });
    assert.equal(compte(corps(h), /<em>/g), 1, `${metier} : un seul mot-clé en italique`);
    assert.match(corps(h), /<h1><span><em>[^<]+<\/em>[^<]*<\/span><span>[^<]+<\/span><\/h1>/, `${metier} : deux lignes, l’italique en tête de la première`);
    const tailles = new Set([...style(h).matchAll(/font-size:(\d+)px|font:400 (\d+)px/g)].map((m) => m[1] || m[2]));
    assert.deepEqual([...tailles].sort(), ['14', '18'], `${metier} : texte 18 et 14, le titre seul a sa taille`);
    // #000 n'est pas une couleur de la page : c'est l'opacité des masques qui fondent la photo dans le fond
    const couleurs = new Set(style(h).match(/#[0-9a-f]{3,6}\b/gi).map((c) => c.toLowerCase()).filter((c) => c !== '#000'));
    assert.ok(couleurs.size <= 3, `${metier} : trois couleurs au plus (${[...couleurs]})`);
  }
});

test('un seul geste animé, coupé si le visiteur préfère moins de mouvement ; aucun script ; tout vient du Cockpit', () => {
  const h = maquetteV4(TAD);
  assert.equal(compte(style(h), /@keyframes/g), 1);
  assert.equal(compte(style(h), /animation:/g), 2, 'le geste, et son arrêt');
  assert.match(style(h), /@media \(prefers-reduced-motion:reduce\)\{\.objet\{animation:none\}\}/);
  assert.ok(!/<script/i.test(h));
  const adresses = [...h.matchAll(/(?:src|href)="(https?:[^"]+)"|url\('(https?:[^']+)'\)/g)].map((m) => m[1] || m[2]);
  assert.ok(adresses.length >= 4);
  for (const u of adresses) assert.ok(u.startsWith('https://cockpit.raime.fr/demo/'), `seul le Cockpit sert la page : ${u}`);
});

test('les photos choisies : une par métier, présentes dans le dépôt, notées dans SOURCES.md ; v3 inchangée', () => {
  const sources = fs.readFileSync(path.join(DOSSIER, 'SOURCES.md'), 'utf8');
  for (const [metier, h] of Object.entries(HEROS)) {
    const f = path.join(DOSSIER, `${h.photo}.jpg`);
    assert.ok(fs.statSync(f).size > 10e3 && fs.statSync(f).size < 400e3, `${metier} : photo présente et légère`);
    assert.equal(fs.readFileSync(f).subarray(0, 3).toString('hex'), 'ffd8ff', `${metier} : un vrai JPEG`);
    assert.ok(sources.includes(`\`${h.photo}.jpg\``), `${metier} : provenance notée`);
    assert.match(maquetteV4({ ...TAD, metier }), new RegExp(`src="https://cockpit\\.raime\\.fr/demo/heros/${h.photo}\\.jpg"`));
  }
  // un métier sans photo choisie garde l'en-tête d'exemple, et son nom en titre (jamais une promesse inventée)
  const autre = maquetteV4({ ...TAD, metier: 'fleuriste' });
  assert.match(autre, /\/demo\/img\/fleuriste\/1\.jpg/); assert.match(corps(autre), /<em>Fleuriste<\/em>/);
  const v3 = maquettePremium(TAD, { images: 'https://cockpit.raime.fr/demo/img', v3: true });
  assert.match(v3, /<header class="hero">/);
  assert.ok(!/class="h4"/.test(v3), 'le gabarit en ligne ne change pas avant l’accord de Basile');
});

test('le Cockpit sert les photos des héros : une image connue, rien d’autre (ni chemin détourné, ni nom inattendu)', async () => {
  const vitrines = createRequire(import.meta.url)('../../jarvis/vitrines.cjs');
  const { PassThrough } = await import('node:stream');
  const servir = (nom) => new Promise((ok) => {
    const r = new PassThrough(); const morceaux = [];
    r.on('data', (d) => morceaux.push(d)).on('end', () => ok({ code: r.code, entetes: r.entetes, taille: Buffer.concat(morceaux).length }));
    r.writeHead = (c, e) => { r.code = c; r.entetes = e; };
    vitrines.servirHeros(nom, r);
  });
  const ok = await servir('boucherie.jpg');
  assert.equal(ok.code, 200); assert.equal(ok.entetes['Content-Type'], 'image/jpeg');
  assert.equal(ok.taille, fs.statSync(path.join(DOSSIER, 'boucherie.jpg')).size, 'l’image entière, relue');
  for (const nom of ['../serveur.cjs', '..%2Fserveur.cjs', 'SOURCES.md', 'Boucherie.jpg', 'inconnu.jpg']) assert.equal((await servir(nom)).code, 404, nom);
});
