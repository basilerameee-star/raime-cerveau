// LE DIRECTEUR (08/10/2026) : l'état réel de chaque agent (à jour, en retard, en échec), ce que la maison a produit,
// des alertes écrites en règles, les idées jugées par le goût, un seul diagnostic confié à Hermes par jour, un bilan gardé.
import './outils.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { createRequire } from 'node:module';
import { etatAgent, alertes, rediger, ordreDiagnostic, diriger } from '../../agents/directeur.js';

const require = createRequire(import.meta.url);
Object.assign(process.env, { PGDATABASE: process.env.BANC_BASE_N8N || 'n8n_test', PGDATABASE_CERVEAU: process.env.BANC_BASE_BRAIN || 'raime_brain_test',
  PGHOST: process.env.PGHOST || 'localhost', PGUSER: process.env.PGUSER || 'raime' });
const H = 3600e3, MAINTENANT = Date.parse('2026-10-08T08:00:00Z');
test('l’état d’un agent : ses échecs d’affilée, son retard sur son rythme, jamais « en retard » la nuit pour un agent nocturne', () => {
  const p = (agent, statut, il_y_a) => ({ agent, statut, fin_le: new Date(MAINTENANT - il_y_a).toISOString() });
  const passages = [p('a', 'echec', 1 * H), p('a', 'echec', 3 * H), p('a', 'ok', 5 * H), p('b', 'ok', 10 * H), p('c', 'ok', 0.5 * H), p('n', 'ok', 20 * H)];
  assert.deepEqual([etatAgent({ nom: 'a', toutes: 2 * H }, passages, MAINTENANT).etat, etatAgent({ nom: 'a', toutes: 2 * H }, passages, MAINTENANT).echecs], ['echec', 2]);
  assert.equal(etatAgent({ nom: 'b', toutes: 2 * H }, passages, MAINTENANT).etat, 'en_retard');
  assert.equal(etatAgent({ nom: 'c', toutes: 1 * H }, passages, MAINTENANT).etat, 'a_jour');
  assert.equal(etatAgent({ nom: 'n', toutes: 12 * H, heures: [2, 5] }, passages, MAINTENANT).etat, 'a_jour', 'nocturne : un jour de marge');
  assert.equal(etatAgent({ nom: 'z', toutes: H }, passages, MAINTENANT).etat, 'jamais');
});

test('les alertes : panne répétée pour la maison, réponses et offres « à toi » pour Basile, en tête du bilan', () => {
  const agents = [{ nom: 'vitrines', etat: 'echec', echecs: 2 }, { nom: 'fureteur', etat: 'a_jour', echecs: 0 }];
  const prod = { candidatures: { validees_vieilles: 3, a_toi: 5, envoyees: 2, a_valider: 1 }, vitrines: { trouves: 0, reponses: 1, envoyes: 0, brouillons: 0 },
    prospection: { reponses: 2, envoyes: 4, brouillons: 14 }, fureteur: { adresses: 7 }, appels: { notes: 3 }, agenda: { dues: 2 }, revenus_mois: 0, decisions: 5 };
  const l = alertes(agents, prod, { vitrines: 'overpass : 504' });
  assert.ok(l.some((a) => a.cle === 'echec:vitrines' && /overpass : 504/.test(a.texte)));
  assert.ok(l.some((a) => a.cle === 'candidatures:file'));
  assert.ok(l.filter((a) => a.qui === 'basile').length >= 3);
  assert.ok(!l.some((a) => a.cle === 'vitrines:zero'), 'un agent en échec n’est pas, en plus, « à zéro »');
  const t = rediger({ jour: '2026-10-08', agents, production: prod, alertes: l, idees: [{ titre: 'Idée', proposition: 'faire X', verdict: 'BASILE' }], ordre: null, retours: [] });
  assert.match(t.split('\n')[0], /^Pour toi : /);
  assert.match(t, /2 candidature\(s\) envoyée\(s\)/);
  assert.match(t, /Idée \(ton accord\) : Idée — faire X/);
  assert.ok(!/undefined|NaN/.test(t));
});

test('l’ordre de diagnostic confié à Hermes : lecture seule, et le goût le laisse passer', async () => {
  const gout = await import('../../agents/gout.js');
  const o = ordreDiagnostic({ agent: 'vitrines', texte: 'vitrines : 2 échecs d’affilée (overpass : 504).' }, 'agents/vitrines.js');
  assert.match(o, /Ne modifie aucun fichier ; aucune action extérieure\./);
  assert.equal(gout.regles(o), null, 'aucune règle ne le retient (ni argent, ni envoi)');
});

test('un passage : le bilan est gardé, un seul diagnostic par jour part à Hermes, les idées jugées (BLOQUE retirée)', async () => {
  const brain = new pg.Client({ connectionString: process.env.DATABASE_URL }); await brain.connect();
  await require('../../jarvis/bases.cjs').preparer();
  await brain.query(`CREATE TABLE IF NOT EXISTS boucle_passages (agent text NOT NULL, fin_le timestamptz NOT NULL DEFAULT now(), statut text NOT NULL, duree_ms int)`);
  try {
  await brain.query(`INSERT INTO boucle_passages (agent, statut, fin_le) VALUES ('banc_vitrines', 'echec', now() - interval '1 hour'),
    ('banc_vitrines', 'echec', now() - interval '3 hours'), ('banc_fureteur', 'ok', now() - interval '20 minutes')`);
  await brain.query(`INSERT INTO journal (acteur, changement, motif) VALUES ('boucle', 'Échec de l''agent banc_vitrines', 'overpass : 504')`);
  const rythmes = [{ nom: 'banc_vitrines', module: './vitrines.js', toutes: 2 * H }, { nom: 'banc_fureteur', module: './fureteur.js', toutes: H }];
  const penser = async () => ({ gardees: [{ titre: 'Relancer les fleuristes', proposition: 'tester un autre objet', conclusion: 'c' },
    { titre: 'Placer', proposition: 'acheter des actions', conclusion: 'c' }] });
  const juger = async ({ action }) => (/acheter/.test(action) ? { verdict: 'BLOQUE', motif: 'argent' } : { verdict: 'AUTO', motif: 'ok' });
  const b1 = await diriger({ brain, rythmes, penser, juger, maintenant: new Date() });
  assert.equal(b1.agents.find((a) => a.nom === 'banc_vitrines').etat, 'echec');
  assert.equal(b1.agents.find((a) => a.nom === 'banc_fureteur').etat, 'a_jour');
  assert.ok(b1.ordre && b1.ordre.ordre, 'un diagnostic confié');
  assert.deepEqual(b1.idees.map((i) => i.titre), ['Relancer les fleuristes'], 'l’idée d’argent est bloquée par le goût');
  const [c] = (await brain.query(`SELECT pour, texte FROM commandes WHERE id = $1`, [b1.ordre.ordre])).rows;
  assert.equal(c.pour, 'harness');
  assert.match(c.texte, /l'agent « banc_vitrines »/);
  const b2 = await diriger({ brain, rythmes, penser: false, juger, maintenant: new Date() });
  assert.equal(b2.ordre.ordre, null, 'pas deux ordres le même jour');
  const n = (await brain.query(`SELECT count(*)::int AS n FROM direction`)).rows[0].n;
  assert.equal(n, 2);
  assert.match(b2.texte, /Agents : 1 à jour sur 2/);
  } finally {
    await brain.query(`DELETE FROM boucle_passages WHERE agent LIKE 'banc_%'`);
    await brain.query(`DELETE FROM commandes WHERE source = 'directeur'`);
    await brain.query('DROP TABLE IF EXISTS direction');
    await brain.end();
    const b = require('../../jarvis/bases.cjs'); await b.cerveau.end(); await b.n8n.end();
  }
});
