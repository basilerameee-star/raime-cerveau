// Le répertoire public-apis : lu par du code, versé une fois par commit, cherché par besoin (Hermes compris).
import { prevoir, requetes } from './outils.mjs';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../../agents/lib.js';
import { analyser, actualiser, chercher } from '../../agents/apis_publiques.js';
import { OUTILS } from '../../agents/raime_mcp.js';
import { createRequire } from 'node:module';

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

// Les requêtes automatiques : une tâche → des mots-clés anglais (modèle gratuit) → les API du répertoire.
const { motsCles, blocApis } = createRequire(import.meta.url)('../../jarvis/apis_utiles.cjs');
const lire = async (sql, v) => (await brain.query(sql, v)).rows;
const repondant = (texte) => async () => ({ texte });

test('une tâche devient des mots-clés anglais ; « AUCUN » ou un modèle muet : rien', async () => {
  assert.deepEqual(await motsCles('Fais une appli météo', { repondre: repondant('Weather, forecast ,  weather') }), ['weather', 'forecast']);
  assert.deepEqual(await motsCles('Corrige une faute', { repondre: repondant('AUCUN') }), []);
  assert.deepEqual(await motsCles('x', { repondre: repondant('') }), []);
});

test('les API utiles sont jointes d’office à la consigne d’une tâche', async () => {
  const bloc = await blocApis('Crée une page météo pour la boutique', { lire, repondre: repondant('weather forecast') });
  assert.match(bloc, /^API PUBLIQUES PEUT-ÊTRE UTILES \(trouvées pour « weather forecast »/);
  assert.match(bloc, /- Open-Meteo \(Weather\) : Global weather forecast API for non-commercial use · clé : aucune · https:\/\/open-meteo\.com\//);
  assert.equal(await blocApis('Corrige une faute', { lire, repondre: repondant('AUCUN') }), '');
  assert.equal(await blocApis('x', { lire: async () => { throw new Error('table absente'); }, repondre: repondant('weather') }), '', 'jamais bloquant');
});

test('un chantier d’ingénierie part avec les API qui rendent déjà le service', async () => {
  const { ouvrirChantier } = await import('../../agents/chantiers.js');
  const corps = [];
  prevoir(/api\.github\.com\/repos\/basilerameee-star\/raime-cerveau\/issues\?state=open/, () => []);
  prevoir(/api\.github\.com\/repos\/basilerameee-star\/raime-cerveau\/issues$/, (u, o) => { corps.push(JSON.parse(o.body).body); return { number: 7, html_url: 'https://github.com/x/7' }; });
  process.env.GITHUB_CHANTIER_TOKEN = 'jeton-fictif';
  try {
    const r = await ouvrirChantier({ titre: 'Prévisions météo sur la page produit', constat: 'La page produit ne montre aucune météo locale.',
      mesure: '0 page sur 3 affiche la météo.', attendu: 'Les 3 pages affichent la météo du jour.' },
    { brain, blocApis: (t, o) => blocApis(t, { ...o, repondre: repondant('weather') }) });
    assert.equal(r.ouvert, true);
    assert.match(corps[0], /## API publiques PEUT-ÊTRE UTILES[\s\S]*Open-Meteo[\s\S]*\n---\n_Ouvert par/);
  } finally { delete process.env.GITHUB_CHANTIER_TOKEN; }
});

test('Hermes y accède par son outil MCP', async () => {
  const t = await OUTILS.api_publique_chercher.faire({ brain, a: { besoin: 'cats pictures' } });
  assert.match(t, /^Cats \(Animals\) — Pictures of cats from Tumblr · clé : apiKey/);
  assert.equal(OUTILS.api_publique_chercher.action({ besoin: 'x' }).type, 'lire');
  assert.match(await OUTILS.cap_lire.faire({ brain }), /^LE CAP/);
});
