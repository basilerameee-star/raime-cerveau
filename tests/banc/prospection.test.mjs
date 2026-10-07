// La page de validation des e-mails de prospection (07/10/2026) : chaque secteur ouvre son pré-audit publié (ou le dit
// absent), un e-mail d'automatisation se valide ou se refuse avec un motif gardé au journal, la file rend l'e-mail exact.
import './outils.mjs';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

Object.assign(process.env, { PGDATABASE: process.env.BANC_BASE_N8N || 'n8n_test', PGDATABASE_CERVEAU: process.env.BANC_BASE_BRAIN || 'raime_brain_test',
  PGHOST: process.env.PGHOST || 'localhost', PGUSER: process.env.PGUSER || 'raime' });
const require = createRequire(import.meta.url);
const p = require('../../jarvis/prospection.cjs');
const { lire, lireN8n } = require('../../jarvis/bases.cjs');

let id = null;
after(async () => { if (id) await lireN8n('DELETE FROM outreach WHERE id = $1', [id]).catch(() => {}); });

test('chaque secteur ouvre son pré-audit publié ; un secteur sans pré-audit n’en reçoit pas d’inventé', () => {
  assert.equal(p.preaudit('Organismes de formation'), 'https://raime.fr/dossiers/rAIme-pre-audit-organismes-formation.pdf');
  assert.equal(p.preaudit('Cabinets comptables'), 'https://raime.fr/dossiers/rAIme-pre-audit-experts-comptables.pdf');
  assert.equal(p.preaudit('Cabinets d avocats'), 'https://raime.fr/dossiers/rAIme-pre-audit-avocats-notaires.pdf');
  assert.equal(p.preaudit('CCI'), 'https://raime.fr/dossiers/rAIme-pre-audit-federations-chambres.pdf');
  assert.equal(p.preaudit('Immobilier'), null);
});

test('un e-mail d’automatisation se valide avec son motif au journal ; la file le rend tel quel avec son pré-audit', async (t) => {
  const cols = (await lireN8n("SELECT column_name FROM information_schema.columns WHERE table_name = 'outreach'").catch(() => [])).map((c) => c.column_name);
  if (!cols.includes('status')) { t.skip('table outreach absente du banc'); return; }
  const [r] = await lireN8n(`INSERT INTO outreach (prospect_name, segment, to_email, subject, body, status)
    VALUES ('Banc Formation', 'Organismes de formation', 'banc@exemple.fr', 'Objet banc', 'Bonjour,\nCorps exact.', 'differe') RETURNING id`);
  id = r.id;
  const f = await p.file();
  const e = f.automatisation.find((x) => x.id === id);
  assert.equal(e.corps, 'Bonjour,\nCorps exact.');
  assert.match(e.voir, /organismes-formation\.pdf$/);
  assert.equal((await p.agir('automatisation', id, { action: 'valider', motif: 'bon secteur' })).ok, true);
  const [s] = await lireN8n('SELECT status FROM outreach WHERE id = $1', [id]);
  assert.equal(s.status, 'valide');
  const [j] = await lire("SELECT motif FROM journal WHERE changement = $1 LIMIT 1", [`E-mail de prospection n°${id} : valide`]);
  assert.equal(j && j.motif, 'bon secteur');
  assert.equal((await p.agir('automatisation', id, { action: 'envoyer' })).ok, false, 'seules valider et refuser existent');
});

test('Héraut : le pré-audit du secteur, seul lien permis, est posé par le code avant la signature ; sinon rien', () => {
  const { ajouterPreaudit } = require('../../jarvis/preaudits.cjs');
  const corps = 'Bonjour,\n\nTexte.\n\nBien cordialement,\nBasile Ramé\nraime.fr';
  const avec = ajouterPreaudit(corps, 'Cabinets comptables');
  assert.match(avec, /pré-audit propre à votre secteur : https:\/\/raime\.fr\/dossiers\/rAIme-pre-audit-experts-comptables\.pdf\n\nBien cordialement,/);
  assert.equal(ajouterPreaudit(avec, 'Cabinets comptables'), avec, 'jamais deux fois');
  assert.equal(ajouterPreaudit(corps, 'Immobilier'), corps, 'pas de pré-audit publié : rien d’inventé');
});
