// COHÉRENCE app ⇄ cerveau — demande 9.
//
// L'app (demande-9/app/index.html) embarque parseCourse : même règle que
// atelier/course.js du cerveau, qui est verrouillée par cas_figes_course.mjs.
// Ce banc rejoue ces cas figés DANS le parseCourse du navigateur (extrait du HTML)
// pour garantir que l'app et le cerveau disent la même chose sur une même phrase.
// Préparé pour fonctionner avec des stubs navigateur, sans clé ni réseau.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(RACINE, 'app/index.html'), 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('script introuvable'); process.exit(2); }
const src = m[1];

// ---- stubs navigateur minimaux pour faire tourner l'initialisation et parseCourse ----
const elements = {};
function el(id){
  if (!elements[id]){
    elements[id] = {
      id, value: '', textContent: '', innerHTML: '', hidden: false,
      valueAsNumber: NaN, dataset: {}, classList: { add(){}, remove(){}, toggle(){} },
      addEventListener(){}, focus(){}, set onclick(f){ this._onclick = f; }, get onclick(){ return this._onclick; },
    };
  }
  return elements[id];
}
globalThis.document = {
  getElementById: el,
  querySelectorAll: () => ({ forEach(){} }),
  createElement: () => ({ href:'', download:'', click(){} }),
};
globalThis.localStorage = { getItem: () => null, setItem(){} };
globalThis.window = {};
globalThis.location = { search: '' };
globalThis.confirm = () => true;
globalThis.Blob = class { constructor(){ return { size: 0 }; } };
globalThis.URL = { createObjectURL: () => '', revokeObjectURL(){} };
globalThis.URLSearchParams = class { constructor(s){ this._s = s; } get(k){ return new URLSearchParams(this._s.split('?')[1]||'')._get(k); } _get(k){ return null; } };
globalThis.setTimeout = () => 0; globalThis.clearTimeout = () => {};
globalThis.Date = Date;

// charger le script (l'initialisation s'appuie sur les stubs)
const fn = new Function(src + '\n;return { parseCourse, fmtDuree, num };');
const { parseCourse, fmtDuree, num } = fn();

// mêmes cas figés que tests/cas_figes_course.mjs du cerveau
const MAINTENANT = new Date(2026, 0, 10, 12, 0, 0);
const ISO = d => d.toISOString().slice(0, 10);
const CAS = [
  ['distance', 'j\'ai couru 10 km en 54 minutes ce matin', 'km', 10],
  ['distance', 'vélo 45 km en 1 h 12 hier soir', 'km', 45],
  ['distance', '8,5 km en 40 min', 'km', 8.5],
  ['distance', 'natation 1500 m en 40 minutes', 'km', 1.5],
  ['duree', 'course à pied 5 km en 30 min', 'min', 30],
  ['duree', 'vélo 45 km en 1 h 12', 'min', 72],
  ['duree', '90 km en 2 heures 30', 'min', 150],
  ['allure', 'course à pied 5 km en 30 min', 'minKm', 6.0],
  ['allure', 'course à pied 10 km ce matin', 'minKm', null],
  ['type', 'j\'ai couru 10 km en 54 minutes', 'type', 'course a pied'],
  ['type', 'vélo 45 km en 1 h 12', 'type', 'velo'],
  ['date', 'j\'ai couru 10 km ce matin', 'jour', '2026-01-10'],
  ['date', 'vélo 45 km hier soir', 'jour', '2026-01-09'],
  ['date', 'le 12 juin, 8 km en 50 min', 'jour', '2025-06-12'],
  ['sort', 'j\'ai couru 10 km ce matin', 'moment', 'matin'],
  ['note', 'j\'ai couru 10 km en 54 minutes, note 8', 'note', 8],
  ['note', 'j\'ai couru 10 km ce matin', 'note', null],
  ['ressenti', 'j\'ai couru 10 km ce matin, super ressenti', 'ressenti', 'super'],
  ['ressenti', 'marche 3 km, fatigué', 'ressenti', 'epuise'],
  ['format', 54, 'dureeT', '54 min'],
  ['format', 74, 'dureeT', '1 h 14'],
];
const eq = (a, b) => (typeof a === 'string' || typeof b === 'string') ? a === b : (a === null || b === null) ? a === b : Math.abs(Number(a) - Number(b)) < 1e-9;

let ko = 0;
for (const [type, phrase, champ, attendu] of CAS){
  let obtenu, ok;
  if (type === 'format'){ obtenu = fmtDuree(phrase); ok = obtenu === attendu; }
  else {
    const r = parseCourse(phrase, MAINTENANT);
    if (champ === 'jour'){ obtenu = ISO(r.jour); ok = obtenu === attendu; }
    else {
      const MAP = { km: 'distanceKm', min: 'dureeMin', minKm: 'allureMinKm', type: 'type', note: 'note', ressenti: 'ressenti', moment: 'moment' };
      obtenu = r[MAP[champ] || champ]; ok = eq(obtenu, attendu);
    }
  }
  if (!ok){ ko++; console.log(`  ECHEC ${JSON.stringify({ phrase, champ, obtenu, attendu })}`); }
}
console.log(ko === 0
  ? `coherence app<->cerveau : ${CAS.length}/${CAS.length} OK — parseCourse du navigateur == extraireCourse du cerveau`
  : `coherence app<->cerveau : ${ko} ECHEC(S) sur ${CAS.length}`);
process.exit(ko === 0 ? 0 : 1);