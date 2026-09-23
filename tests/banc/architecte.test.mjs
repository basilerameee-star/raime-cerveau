// Un cycle complet de l'architecte, sur le modèle factice : les sept événements, et les
// trois gardes écrites dans le code (faisabilité, souveraineté, limites intouchables).
import { BIBLIO, bases, copierBibliotheque, compter } from './outils.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const { cycle } = await import('../../agents/architecte.js');
const { ranger } = await import('../../agents/bibliothecaire.js');
let b, f;
before(async () => {
  b = await bases();
  await b.brain.query('TRUNCATE etats, demandes, journal, agent_runs, kb_chunks');
  copierBibliotheque();
  await ranger({ brain: b.brain, racine: BIBLIO });
  f = await cycle({ brain: b.brain, n8n: b.n8n });
});
after(async () => b.fermer());

test('le cycle choisit un but ouvert et ne coûte rien', () => {
  assert.equal(f.but, "Rendre l'offre de formation lisible pour un dirigeant");
  assert.equal(f.cout, '0.0000 $');
});

test('garde de faisabilité : une action hors catalogue est refusée', () => {
  assert.ok(f.refusees.includes('envoyer_email (hors catalogue)'));
});

test('garde de souveraineté : une sous-tâche qui porte un secret est refusée', () => {
  assert.ok(f.refusees.includes('ecrire_note (porte un secret)'));
  assert.deepEqual(f.bilans.map((x) => x.action), ['mesurer', 'chercher']);
});

test('mesurer lit la machine et le commerce (base n8n fictive)', () => {
  const m = f.bilans[0].resultat;
  assert.match(m, /2 envois, 1 réponses \(50\.0 %\), 1 messages en attente, 1 client/);
});

test('chercher trouve la note fictive sur la formation des dirigeants', () => {
  assert.match(f.bilans[1].resultat, /Formation des dirigeants/);
});

test('le carnet porte les sept événements du cycle, dans l’ordre', async () => {
  const { rows } = await b.brain.query('SELECT type FROM etats WHERE cycle_id = $1 ORDER BY rang', [f.cycleId]);
  const types = rows.map((r) => r.type);
  for (const t of ['PROPOSER', 'EXECUTER', 'EVALUER', 'CORRIGER', 'MEMORISER', 'METAFLECHIR', 'DEMANDER_INFOS'])
    assert.ok(types.includes(t), `événement ${t} absent`);
  assert.equal(types[0], 'PROPOSER');
});

test('une question ne se pose qu’une fois, même reformulée ou reposée', async () => {
  const { rows } = await b.brain.query('SELECT question, bloquant FROM demandes ORDER BY id');
  assert.deepEqual(rows.map((r) => r.question), [
    'Quelle offre mettre en avant en premier auprès des dirigeants ?',
    "Quel prix fixer pour l'audit des postes ?",
  ]);
  assert.equal(rows[1].bloquant, true);
});

test('les limites de la Constitution ne se révisent pas ; les autres croyances si', async () => {
  const { rows } = await b.brain.query("SELECT sujet, enonce, confiance FROM croyances ORDER BY sujet");
  const argent = rows.find((r) => r.sujet === 'argent');
  assert.equal(argent.enonce, "L'argent reste à Basile : aucun mouvement de fonds.");
  assert.deepEqual(f.revisees, ['bibliotheque (0.7)']);
  assert.equal(Number(rows.find((r) => r.sujet === 'bibliotheque').confiance), 0.7);
});

test('le cycle est tracé au journal et dans agent_runs', async () => {
  assert.equal(await compter(b.brain, "SELECT count(*) n FROM journal WHERE acteur = 'architecte' AND changement LIKE 'Cycle %'"), 1);
  assert.equal(await compter(b.brain, "SELECT count(*) n FROM agent_runs WHERE agent = 'architecte' AND cost_usd = 0"), 1);
});
