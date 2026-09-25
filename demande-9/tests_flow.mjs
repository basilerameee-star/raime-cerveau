// BANC DE FLUX — l'app (demande-9) de bout en bout, sans navigateur.
// Stubs DOM local : on simule « analyser une phrase », choisir un type, « enregistrer »,
// puis on vérifie que la course apparaît dans le dossier et que l'export localStock est cohérent.
import fs from 'node:fs';

const html = fs.readFileSync('app/index.html', 'utf8');
const src = html.match(/<script>([\s\S]*?)<\/script>/)[1];

// ---- mini-DOM in-memory ----
const els = new Map();
function makeEl(id){
  const e = {
    id, _value: '', textContent: '', innerHTML: '', hidden: false, dataset: {}, _oc: null,
    classList: { add(){}, remove(){}, toggle(){}, contains: () => false },
    addEventListener(){}, focus(){},
    get value(){ return this._value; }, set value(v){ this._value = String(v); },
    get valueAsNumber(){ const x = parseFloat(this._value); return Number.isNaN(x) ? 0 : x; },
    set onclick(v){ this._oc = v; }, get onclick(){ return this._oc; },
  };
  els.set(id, e); return e;
}
const jq = els.has('jq0') ? null : null;
function getEl(id){ return els.has(id) ? els.get(id) : makeEl(id); }

// tuiles de type (simulées depuis le HTML)
const TUILE_TYPES = [['course a pied'], ['velo'], ['natation'], ['marche']].map(([t]) => makeEl('pille-' + t));
TUILE_TYPES.forEach(e => e.dataset.t = e.id.replace('pille-', ''));

globalThis.document = {
  getElementById: getEl,
  querySelectorAll(sel){
    if (sel.includes('pille')) return { forEach(fn){ TUILE_TYPES.forEach(fn); } };
    return { forEach(){} };
  },
  createElement: () => ({ href:'', download:'', click(){} }),
};
const mem = new Map();
globalThis.localStorage = { getItem: k => mem.get(k), setItem: (k, v) => mem.set(k, v) };
globalThis.window = {};
globalThis.location = { search: '' };
globalThis.confirm = () => true;
globalThis.Blob = class {};
globalThis.URL = { createObjectURL: () => '', revokeObjectURL(){} };
class US { constructor(x){ this.q = new Map(); const s = String(x||'').replace(/^\?/,''); for (const kv of s.split('&')){ const [k,v]=kv.split('='); if(k) this.q.set(k, decodeURIComponent(v||'')); } } get(k){ return this.q.get(k)||null; } }
globalThis.URLSearchParams = US;

// charger le script
new Function(src)();

let ko = 0; const ok = (cond, msg) => { console.log((cond?'  ✓ ':'  ✗ ') + msg); if(!cond) ko++; };
const g = getEl, sync = () => {};
const set = (id, v) => { const e = getEl(id); e.value = v; return e; };

// --- flux 1 : analyse + enregistrement ---
set('dict', "j'ai couru 10 km en 54 minutes ce matin, super ressenti, note 8");
g('analyser').onclick();
ok(g('apercu').hidden === false, 'analyse : formulaire rendu visible');
ok(g('dist').value === '10' && g('unite').value === 'km', 'analyse : distance 10 km');
ok(g('duree').value === '54', 'analyse : durée 54 min');
ok(g('ressenti').value === 'super', 'analyse : ressenti super');
ok(g('allure').value === '5:24 min/km', 'analyse : allure 5:24 min/km (54/10)');
// choisir le type (la 1re tuile « course a pied »)
TUILE_TYPES[0].onclick();
// enregistrer
g('enregistrer').onclick();
const data = JSON.parse(mem.get('raime_courses_v1'));
ok(data.length === 1, 'stock : 1 course enregistrée');
ok(data[0].type === 'course a pied', 'stock : type course a pied');
ok(data[0].distanceKm === 10 && data[0].dureeMin === 54, 'stock : 10 km / 54 min');
ok(Math.abs(data[0].allureMinKm - 5.4) < 1e-6, 'stock : allure 5.4 min/km');
ok(data[0].note === 8, 'stock : note 8');

// --- flux 2 : deuxième course en vélo (durée de minutes seules + note via /10) ---
set('dict', 'vélo 45 km en 1 h 30 hier soir, 9/10');
g('analyser').onclick();
TUILE_TYPES.forEach(e => e.dataset.t === 'velo' && e.onclick());
g('enregistrer').onclick();
const data2 = JSON.parse(mem.get('raime_courses_v1'));
ok(data2.length === 2, 'stock : 2 courses');
const v = data2[1];
ok(v.type === 'velo', 'flux2 : type vélo');
ok(v.dureeMin === 90 && v.distanceKm === 45, 'flux2 : 45 km / 1 h 30 (=90 min)');
ok(v.note === 9, 'flux2 : note 9/10 reconnue');

console.log(ko === 0 ? "banc de flux app : OK — l'app fonctionne de bout en bout" : `banc de flux app : ${ko} ECHEC(S)`);
process.exit(ko === 0 ? 0 : 1);
