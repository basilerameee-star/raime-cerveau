// La prospection est en pause : ni la boucle ni le cron ne lancent le héraut.
import './outils.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const lire = (f) => fs.readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
const actives = (texte) => texte.split('\n').filter((l) => !/^\s*(#|\/\/)/.test(l));

test('le cron ne lance pas le héraut', () => {
  assert.ok(!actives(lire('cron.raime')).some((l) => /heraut\.js/.test(l)));
});

test('la boucle ne lance pas le héraut', () => {
  assert.ok(!actives(lire('agents/boucle.js')).some((l) => /nom:\s*'heraut'/.test(l)));
});
