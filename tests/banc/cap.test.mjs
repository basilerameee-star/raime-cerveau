// Le cap : une boussole commune, compilée sans modèle, versionnée, en tête de chaque consigne d'agent,
// et dans celles de Jarvis et d'Hermes, sans rien dire deux fois.
import './outils.mjs';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { db, avecCap } from '../../agents/lib.js';
import { compiler, rediger, oublier, TAILLE_MAX } from '../../agents/cap.js';

const require = createRequire(import.meta.url);
const FIXE = require('../../jarvis/cap.cjs');
const brain = db(); await brain.connect();
after(async () => { await brain.query('DROP TABLE IF EXISTS cap'); await brain.end(); oublier(); });

test('le cap fixe porte les objectifs, les règles, le goût, la bonne réponse et les règles commerciales de Basile', () => {
  const t = FIXE.fixe();
  assert.match(t, /N°1 : la monétisation de la marque MÉDIA, 2 000 € par mois sur CHACUNE de TikTok, YouTube et Instagram, soit 6 000 €/);
  assert.match(t, /UN MOTEUR À LA FOIS : les sites à 500 € d'abord/);
  assert.match(t, /la preuve avant le prix/);
  assert.match(t, /N°2 : rAIme/);
  assert.match(t, /LA BONNE RÉPONSE/);
  assert.match(t, /20 % de l'impact passe par les mots, 80 % par la confiance/);
  assert.match(t, /jeunes achètent du rêve.*sécurité.*dirigeants, du temps/);
  assert.match(t, /alpha.*vient de lui/);
  assert.match(t, /bêta.*direction claire/);
  assert.match(FIXE.BOUSSOLE, /^COMPASS/, 'la boussole de JEV est en anglais');
});

test('Jarvis reçoit seulement ce que sa consigne n’avait pas : aucune phrase en double', () => {
  const { SYSTEME } = require('../../jarvis/esprit.cjs');
  assert.match(SYSTEME, /OBJECTIF N°2/);
  assert.match(SYSTEME, /80 % par la confiance/);
  assert.equal((SYSTEME.match(/2 000 €/g) || []).length, 1, 'l’objectif n° 1 n’est dit qu’une fois');
});

test('le passé et le futur se lisent dans la base, sans modèle ; le texte reste court', async () => {
  const c = await compiler({ brain });
  assert.match(c.texte, /^LE CAP \(cap-1/);
  assert.match(c.texte, /LE PASSÉ : /);
  assert.ok(c.texte.length <= TAILLE_MAX);
  const { rows: buts } = await brain.query("SELECT enonce FROM buts WHERE etat = 'ouvert' ORDER BY id LIMIT 1");
  if (buts[0]) assert.match(c.texte, /LE FUTUR/);
});

test('une version distincte du cap n’est gardée qu’une fois', async () => {
  await compiler({ brain }); await compiler({ brain });
  const { rows } = await brain.query('SELECT count(*)::int AS n, count(DISTINCT empreinte)::int AS d FROM cap');
  assert.equal(rows[0].n, rows[0].d);
});

test('rédaction : un agent en échec, des revenus et des jugements entrent dans le passé', () => {
  const t = rediger({ ordres: { faits: 2, echoues: 1, en_file: 0 }, enEchec: ['architecte'], revenus: 120,
    buts: [{ horizon: 'court', enonce: 'Premier client' }], lecons: ['Chercher avant de créer'], regime: 'normal',
    jugements: [{ verdict: 'AUTO', n: 3 }] });
  assert.match(t, /agents en échec depuis 24 h : architecte/);
  assert.match(t, /120 € sur 6 000 €/);
  assert.match(t, /jugements du goût en 7 jours : AUTO 3/);
  assert.match(t, /CE QUE LA MAISON A APPRIS : Chercher avant de créer/);
});

test('chaque consigne d’agent commence par le cap ; CAP_DANS_CONSIGNES=0 le retire', async () => {
  oublier();
  assert.match(await avecCap('Tu es le radar.'), /^LE CAP[\s\S]*---\n\nTu es le radar\.$/);
  process.env.CAP_DANS_CONSIGNES = '0';
  try { assert.equal(await avecCap('Tu es le radar.'), 'Tu es le radar.'); } finally { delete process.env.CAP_DANS_CONSIGNES; }
});
