// La prospection reprend le 25/09/2026 sur le message dicté par Basile, en BROUILLONS seulement :
// le cron ne lance jamais le héraut, et le héraut ne valide ni n'envoie rien lui-même.
import './outils.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const lire = (f) => fs.readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
const actives = (texte) => texte.split('\n').filter((l) => !/^\s*(#|\/\/)/.test(l));

// cron.raime (jamais installé) est retiré le 30/09/2026 : le héraut n'a plus qu'un lanceur, la boucle.
// 07/10/2026 : la boucle lance désormais prospection_auto (l'e-mail des vitrines avec le pré-audit) à la place du héraut.
test('aucun cron ne lance la prospection : seule la boucle le fait, et elle ne rédige que des brouillons', () => {
  assert.ok(!fs.existsSync(new URL('../../cron.raime', import.meta.url)));
  assert.match(lire('agents/rythmes.js'), /nom: 'prospection'/);   // 08/10/2026 : les rythmes sont sortis de la boucle
  const p = actives(lire('agents/prospection_auto.js')).join('\n');
  assert.match(p, /'brouillon'/);
  assert.ok(!/status = 'valide'|'envoye'/.test(p), 'elle ne valide ni n’envoie jamais elle-même');
});

test('le héraut ne rédige que des brouillons : il ne valide ni n’envoie jamais lui-même', () => {
  const h = actives(lire('agents/heraut.js')).join('\n');
  assert.ok(/'brouillon'/.test(h), 'le héraut doit écrire des brouillons');
  assert.ok(!/status\s*=\s*'(valide|envoye)'|'(valide|envoye)'\s*:/.test(h), 'le héraut ne doit jamais valider ni marquer envoyé');
  assert.ok(!/sendMail|smtp|resend\.com|\/emails/i.test(h), 'le héraut ne doit contenir aucun envoi');
});
