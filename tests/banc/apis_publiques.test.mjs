// Le répertoire public-apis : lu par du code, versé une fois par commit, cherché par besoin (Hermes compris).
import { prevoir, requetes } from './outils.mjs';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../../agents/lib.js';
import { analyser, actualiser, chercher } from '../../agents/apis_publiques.js';
import { OUTILS } from '../../agents/raime_mcp.js';

const brain = db(); await brain.connect();
after(async () => { await brain.query('DROP TABLE IF EXISTS apis_publiques'); await brain.end(); });

const EXTRAIT = `# Public APIs
### APIs Covered Under APILayer Suite!
| [IPstack](https://ipstack.com/?utm_source=Github) | Locate visitors | [Run](https://postman) |
### Animals
API | Description | Auth | HTTPS | CORS |
|:---|:---|:---|:---|:---|
| [Axolotl](https://theaxolotlapi.netlify.app/) | Collection of axolotl pictures and facts | No | Yes | No |
| [Cats](https://docs.thecatapi.com/) | Pictures of cats from Tumblr | \`apiKey\` | Yes | No |
### Weather
API | Description | Auth | HTTPS | CORS |
|:---|:---|:---|:---|:---|
| [Open-Meteo](https://open-meteo.com/) | Global weather forecast API for non-commercial use | No | Yes | Yes |
| [Weatherbit](https://www.weatherbit.io/api) | Weather | \`apiKey\` | Yes | Unknown |
`;

test('le README devient des lignes d’API ; la section sponsorisée est écartée', () => {
  const a = analyser(EXTRAIT);
  assert.equal(a.length, 4);
  assert.ok(!a.some((x) => x.nom === 'IPstack'));
  assert.deepEqual(a[1], { nom: 'Cats', lien: 'https://docs.thecatapi.com/', description: 'Pictures of cats from Tumblr',
    categorie: 'Animals', auth: 'apiKey', https: true, cors: 'no' });
  assert.equal(a[0].auth, '', '« No » veut dire : sans clé');
});

// Un faux GitHub : le dernier commit, et un README de plus de 500 API (en dessous, rien n'est remplacé).
const SHA = 'a'.repeat(40);
const lignes = Array.from({ length: 520 }, (_, i) => `| [Api${i}](https://exemple.org/${i}) | Filler service ${i} | No | Yes | No |`).join('\n');
prevoir(/api\.github\.com\/repos\/public-apis\/public-apis\/commits\/master$/, { sha: SHA });
prevoir(new RegExp(`raw\\.githubusercontent\\.com/public-apis/public-apis/${SHA}/README\\.md$`), `${EXTRAIT}\n### Divers\n${lignes}\n`);

test('versé une fois par commit, tracé au journal avec la licence', async () => {
  const r1 = await actualiser({ brain });
  assert.deepEqual(r1, { commit: SHA, apis: 524, nouveau: true });
  const avant = requetes.length;
  const r2 = await actualiser({ brain });
  assert.equal(r2.nouveau, false);
  assert.ok(!requetes.slice(avant).some((u) => /raw\.githubusercontent/.test(u)), 'le README n’est pas relu');
  const { rows } = await brain.query("SELECT motif FROM journal WHERE acteur = 'apis_publiques' ORDER BY created_at DESC LIMIT 1");
  assert.match(rows[0].motif, /licence MIT/);
});

test('chercher par besoin : sans clé si demandé ; un mot isolé en dernier recours', async () => {
  const meteo = await chercher({ brain, besoin: 'weather forecast' });
  assert.equal(meteo[0].nom, 'Open-Meteo');
  assert.deepEqual((await chercher({ brain, besoin: 'weather', sansCle: true })).map((a) => a.nom), ['Open-Meteo']);
  assert.equal((await chercher({ brain, besoin: 'zzzz axolotl' }))[0].nom, 'Axolotl');
});

test('Hermes y accède par son outil MCP', async () => {
  const t = await OUTILS.api_publique_chercher.faire({ brain, a: { besoin: 'cats pictures' } });
  assert.match(t, /^Cats \(Animals\) — Pictures of cats from Tumblr · clé : apiKey/);
  assert.equal(OUTILS.api_publique_chercher.action({ besoin: 'x' }).type, 'lire');
  assert.match(await OUTILS.cap_lire.faire({ brain }), /^LE CAP/);
});
