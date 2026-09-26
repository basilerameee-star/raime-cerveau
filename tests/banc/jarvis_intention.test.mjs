// Ce que Jarvis prend pour un ordre (confié à Hermes) et ce qu'il prend pour une question.
// Le 26/09/2026, « ok top, fais moi un site… » n'était pas reconnu : Jarvis a promis sans rien confier.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../../cockpit/server.js', import.meta.url), 'utf8');
const INTENTION_ACTION = eval(src.match(/const INTENTION_ACTION = (\/.*\/[a-z]*);/)[1]);

test('les ordres sont reconnus, même précédés de « ok top, » ou dits avec « fais-moi »', () => {
  for (const t of ['ok top, fais moi un site pour mercedes en mode cyberpunk. Tu le dépose sur Github', 'fais-moi un site',
    'Crée une page qui liste 5 nouveautés', 'Alors, écris un article sur l’IA', 'Parfait, dépose le code sur GitHub', 'Jarvis, corrige la page d’accueil'])
    assert.ok(INTENTION_ACTION.test(t), t);
});

test('les questions et les points de situation ne sont pas des ordres', () => {
  for (const t of ['fais le point', 'fais-moi le point sur la veille', 'Bonjour, tu m’entends ?', 'qu’est-ce que tu penses du site ?', 'Combien de crédits reste-t-il ?'])
    assert.ok(!INTENTION_ACTION.test(t), t);
});
