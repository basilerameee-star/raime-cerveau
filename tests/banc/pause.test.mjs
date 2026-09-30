// La prospection reprend le 25/09/2026 sur le message dicté par Basile, en BROUILLONS seulement :
// le cron ne lance jamais le héraut, et le héraut ne valide ni n'envoie rien lui-même.
import './outils.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const lire = (f) => fs.readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
const actives = (texte) => texte.split('\n').filter((l) => !/^\s*(#|\/\/)/.test(l));

// cron.raime (jamais installé) est retiré le 30/09/2026 : le héraut n'a plus qu'un lanceur, la boucle.
test('aucun cron ne lance le héraut : seule la boucle le fait', () => {
  assert.ok(!fs.existsSync(new URL('../../cron.raime', import.meta.url)));
  assert.match(lire('agents/boucle.js'), /nom: 'heraut'/);
});

test('le héraut ne rédige que des brouillons : il ne valide ni n’envoie jamais lui-même', () => {
  const h = actives(lire('agents/heraut.js')).join('\n');
  assert.ok(/'brouillon'/.test(h), 'le héraut doit écrire des brouillons');
  assert.ok(!/status\s*=\s*'(valide|envoye)'|'(valide|envoye)'\s*:/.test(h), 'le héraut ne doit jamais valider ni marquer envoyé');
  assert.ok(!/sendMail|smtp|resend\.com|\/emails/i.test(h), 'le héraut ne doit contenir aucun envoi');
});
