// Point 24 : la recommandation boutique est écrite, sourcée, et dit ce qui n'est pas vérifié.
import './outils.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const doc = fs.readFileSync(new URL('../../docs/DECISION_BOUTIQUE.md', import.meta.url), 'utf8');

test('la décision boutique donne l’ordre, les délais de TikTok Shop et des sources', () => {
  assert.match(doc, /## Recommandation/);
  assert.match(doc, /3 jours ouvrés/);
  assert.match(doc, /15 jours/);
  assert.ok((doc.match(/https:\/\//g) || []).length >= 5, 'au moins cinq sources');
  assert.match(doc, /## Ce qui n'est pas vérifié/);
});
