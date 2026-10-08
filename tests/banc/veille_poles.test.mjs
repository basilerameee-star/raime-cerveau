// LE PÔLE DE RECHERCHE PAR AGENT (08/10/2026) : chaque agent a sa veille (GitHub, Hacker News, arXiv), rangée à son nom,
// sans doublon ; une source muette n'arrête pas les autres. Sources simulées : aucun réseau.
import './outils.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { POLES, veillerPoles, pourPole } from '../../agents/veilleur.js';

test('un pôle par agent : trading, bourse, prospection, vitrines, clipping, dropshipping, revenus, agents IA', () => {
  assert.deepEqual(Object.keys(POLES), ['trading', 'bourse', 'prospection', 'vitrines', 'clipping', 'dropshipping', 'revenus', 'agents']);
  for (const p of Object.values(POLES)) assert.ok(p.github && p.hn, 'GitHub et Hacker News pour chacun');
});

test('les trouvailles sont rangées au nom du pôle, sans doublon ; une source en panne est notée, les autres continuent', async () => {
  const brain = new pg.Client({ connectionString: process.env.DATABASE_URL }); await brain.connect();
  try {
    await brain.query('DROP TABLE IF EXISTS veille_poles');
    const sources = {
      github: async (q) => [{ source: 'github', titre: `depot ${q}`, lien: `https://github.com/x/${encodeURIComponent(q)}`, score: 7, detail: 'MIT' }],
      hackernews: async () => { throw new Error('503'); },
      arxiv: async (q) => [{ source: 'arxiv', titre: 'article', lien: `http://arxiv.org/abs/${encodeURIComponent(q)}`, score: 5 }],
    };
    const r1 = await veillerPoles({ brain, poles: ['trading', 'prospection'], attente: 0, sources });
    assert.deepEqual(r1.neuves, { trading: 2, prospection: 1 }, 'prospection n’a pas d’arXiv');
    assert.ok(r1.pannes.some((p) => /trading\/hackernews : 503/.test(p)));
    const r2 = await veillerPoles({ brain, poles: ['trading'], attente: 0, sources });
    assert.equal(r2.neuves.trading, 0, 'rien de neuf le lendemain : aucun doublon');
    const l = await pourPole(brain, 'trading');
    assert.equal(l[0].source, 'github', 'la mieux notée d’abord');
  } finally { await brain.query('DROP TABLE IF EXISTS veille_poles'); await brain.end(); }
});
