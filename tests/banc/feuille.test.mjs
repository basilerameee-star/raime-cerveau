// La feuille de route : une seule source (jarvis/feuille_de_route.json), lue par Jarvis, le cap des agents et
// Hermes ; sa copie Markdown (docs/FEUILLE_DE_ROUTE.md) ne diverge jamais d'elle.
import './outils.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { versMarkdown } from '../../tools/feuille_vers_markdown.mjs';
import { rediger } from '../../agents/cap.js';
import { OUTILS } from '../../agents/raime_mcp.js';

const require = createRequire(import.meta.url);
const { F, resume, phrase } = require('../../jarvis/feuille.cjs');

test('58 points, numéros et rangs uniques ; chaque point dit quand il est fini ; le groupe « basile » dit ce qu’il faut', () => {
  assert.equal(F.points.length, 58);
  assert.deepEqual(F.points.map((p) => p.n).sort((a, b) => a - b), Array.from({ length: 58 }, (_, i) => i + 1));
  assert.equal(new Set(F.points.map((p) => p.rang)).size, 58);
  for (const p of F.points) {
    assert.ok(['seul', 'basile'].includes(p.groupe), `n°${p.n}`);
    assert.ok(['a_faire', 'en_cours', 'fait', 'attend_basile'].includes(p.etat), `n°${p.n}`);
    assert.ok(p.fini_quand && p.fini_quand.length > 20, `n°${p.n} : fini quand ?`);
    if (p.groupe === 'basile') assert.ok(p.il_faut, `n°${p.n} : il faut quoi de Basile ?`);
    if (p.etat === 'fait') assert.ok(p.preuve && p.preuve.length > 30, `n°${p.n} : fait, mais la preuve n’est pas écrite`);
    for (const d of p.depend_de || []) assert.ok(F.points.some((q) => q.n === d), `n°${p.n} dépend d’un point inconnu`);
  }
});

test('la copie Markdown du dépôt est à jour (sinon : node tools/feuille_vers_markdown.mjs)', () => {
  const fichier = fs.readFileSync(new URL('../../docs/FEUILLE_DE_ROUTE.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(fichier, versMarkdown());
});

test('Jarvis, les agents et Hermes la lisent', async () => {
  const r = resume();
  assert.equal(r.total, 58);
  assert.equal(r.prochains[0].n, [...F.points].filter((p) => p.groupe === 'seul' && p.etat === 'a_faire').sort((a, b) => a.rang - b.rang)[0].n);
  assert.match(phrase(), /Feuille de route : \d+ point\(s\) fait\(s\) sur 58/);
  const cap = rediger({ ordres: null, enEchec: [], revenus: null, buts: [], lecons: [], regime: null, jugements: [] });
  assert.match(cap, /LA FEUILLE DE ROUTE \(\d+\/58 faits\) : prochains points : n°\d+/);
  assert.match(await OUTILS.feuille_de_route_lire.faire({}), /^# Feuille de route du cerveau rAIme/);
});
