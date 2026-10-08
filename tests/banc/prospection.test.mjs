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
  assert.equal(p.preaudit('Immobilier'), 'https://raime.fr/dossiers/rAIme-pre-audit-immobilier.pdf');
  assert.equal(p.preaudit('Santé privée'), null);
  assert.equal(p.preaudit('RH / recrutement'), 'https://raime.fr/dossiers/rAIme-pre-audit-recrutement.pdf');
  assert.equal(p.preaudit('Courtiers en assurance'), 'https://raime.fr/dossiers/rAIme-pre-audit-assurance.pdf');
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
  assert.equal(ajouterPreaudit(corps, 'Santé privée'), corps, 'pas de pré-audit publié : rien d’inventé');
});

test('e-mail d’automatisation (07/10/2026) : le même que celui des vitrines, avec le pré-audit du métier ; rien d’inventé', async () => {
  const { brouillon, joliNom, metierDe } = await import('../../agents/prospection_auto.js');
  const b = brouillon({ name: 'SCP DUPONT ET ASSOCIES', sector: 'Cabinets comptables', city: 'ANNECY' });
  assert.equal(b.sujet, 'Dupont et Associés : j\'ai préparé votre pré-audit');
  assert.match(b.corps, /cabinets comptables à Annecy/);
  assert.match(b.corps, /https:\/\/raime\.fr\/dossiers\/rAIme-pre-audit-experts-comptables\.pdf/);
  assert.match(b.corps, /calendar\.app\.google/);
  assert.match(b.corps, /répondez « stop »/);
  assert.ok(!/\d+\s*%|€/.test(b.corps), 'aucun chiffre ni prix hors du pré-audit');
  assert.equal(metierDe({ name: 'SELARL ETUDE MARTIN NOTAIRES', sector: 'Cabinets d avocats' }), 'Notaires');
  assert.equal(brouillon({ name: 'X', sector: 'Organismes de formation' }), null, 'les organismes de formation ne sont plus prospectés');
  assert.equal(brouillon({ name: 'X', sector: 'Santé privée' }), null, 'pas de pré-audit publié : pas d’e-mail');
  const im = brouillon({ name: 'AGENCE DU LAC', sector: 'Immobilier', city: 'ANNECY' });
  assert.match(brouillon({ name: 'ARCHI SAS', sector: 'Architectes', city: 'LYON' }).corps, /agences d’architecture à Lyon[\s\S]*Dans une agence[\s\S]*batiment-architecture\.pdf/);
  assert.match(brouillon({ name: 'COURTIER SA', sector: 'Courtiers en assurance', city: 'ANNECY' }).corps, /cabinets de courtage à Annecy[\s\S]*Dans un cabinet[\s\S]*pre-audit-assurance\.pdf/);
  assert.match(im.corps, /agences immobilières à Annecy[\s\S]*Dans une agence[\s\S]*rAIme-pre-audit-immobilier\.pdf/);
  assert.equal(joliNom('Agence du Lac'), 'Agence du Lac', 'un nom déjà bien écrit reste tel quel');
});

test('l’adresse doit être celle de l’entreprise : jamais une plateforme, un « no-reply », ni un domaine étranger à son nom', async () => {
  const { adresseFiable } = await import('../../agents/prospection_auto.js');
  assert.equal(adresseFiable({ name: 'BBM ET ASSOCIES', contact_email: 'contact@buttondown.email' }), false);
  assert.equal(adresseFiable({ name: 'SOCIETE NOUVELLE CATALYS', contact_email: 'no-reply@infomaniak.com' }), false);
  assert.equal(adresseFiable({ name: 'ALCOPA AUCTION', contact_email: 'contact@encheres-publiques.com' }), false);
  assert.equal(adresseFiable({ name: 'FIMECO (FIMECO)', contact_email: 'emmanuel.labrousse@fimeco.fr' }), true);
  assert.equal(adresseFiable({ name: 'CABINET X', contact_email: 'contact@cabinet-y.fr', website: 'https://www.cabinet-y.fr/contact' }), true, 'le domaine du site fait foi');
});

test('noms d’usage des études et annuaires refusés (07/10/2026)', async () => {
  const { joliNom, adresseFiable } = await import('../../agents/prospection_auto.js');
  assert.equal(joliNom('Xavier Brunet, Vincent Morati, Aude Martin-Bouvier, Florent Billet et Damien Brecville, Notaires Associés (la Manufacture, Notaires)'), 'La Manufacture');
  assert.equal(joliNom("Société Civile Professionnelle Naz & Associes, Notaires, Associés D'Une Société Civile Professionnelle Titulaire D'Un Office"), 'Naz & Associés');
  assert.equal(adresseFiable({ name: 'SKILLSDAY', contact_email: 'contact@lesentreprises.com', website: 'lesentreprises.com' }), false, 'un annuaire n’est pas l’entreprise');
  assert.equal(adresseFiable({ name: 'LA MANUFACTURE', contact_email: 'webmestre.csn@notaires.fr' }), false, 'le site national des notaires');
  assert.equal(adresseFiable({ name: 'SCP NAZ & ASSOCIES, NOTAIRES', contact_email: 'accueil@naz-associes.notaires.fr' }), true, 'le domaine de l’étude');
  assert.equal(adresseFiable({ name: 'CABINET X', contact_email: 'contact@cabinet-y.fr' }), false, 'un mot du métier ne prouve rien');
});

// 08/10/2026 (audit) : la REQUÊTE qui choisit à qui écrire, sur une vraie base. Les fonctions seules (adresseFiable, joliNom)
// étaient testées, pas leur assemblage : retirer une exclusion du SQL laissait tout le banc au vert.
test('les brouillons : seulement une entreprise à but lucratif, site prouvé, adresse lue sur ce site, code NAF permis', async () => {
  const { bases } = await import('./outils.mjs');
  const { preparer } = await import('../../agents/prospection_auto.js');
  const db = await bases();
  const S = ['934000001', '934000002', '934000003', '934000004', '934000005', '934000006'];
  const avant = (await db.n8n.query('SELECT coalesce(max(id), 0) AS m FROM outreach')).rows[0].m;
  try {
    await db.n8n.query('ALTER TABLE prospects ADD COLUMN IF NOT EXISTS site_preuve text, ADD COLUMN IF NOT EXISTS furete_note text');
    const fiche = (siren, name, email, { naf = '69.20Z', preuve = 'siren', note = 'adresse sur le site (banc)' } = {}) => db.n8n.query(
      `INSERT INTO prospects (siren, name, naf, sector, city, status, contact_email, website, site_preuve, furete_note, score, found_at)
       VALUES ($1, $2, $3, 'Cabinets comptables', 'ANNECY', 'nouveau', $4, $5, $6, $7, 100000, now())`,
      [siren, name, naf, email, 'https://' + email.split('@')[1], preuve, note]);
    await fiche(S[0], 'CABINET DUPRAZBANC', 'contact@duprazbanc.fr');                                    // la seule qui part
    await fiche(S[1], 'CABINET MOLLARBANC', 'contact@mollarbanc.fr', { preuve: null });                  // site jamais prouvé
    await fiche(S[2], 'ASSOCIATION DE GESTION SAVOBANC', 'contact@savobanc.fr');                       // but non lucratif
    await fiche(S[3], 'CABINET FAVREBANC', 'contact@favrebanc.fr', { naf: '85.59A' });                 // code NAF exclu (formation)
    await fiche(S[4], 'CABINET GIRODBANC', 'contact@buttondown.email');                                // adresse d'une plateforme
    await fiche(S[5], 'CABINET PERRBANC', 'contact@perrbanc.fr', { note: 'adresse devinee' });         // adresse pas lue sur le site
    await preparer({ n8n: db.n8n, brain: db.brain, combien: 50 });
    const { rows } = await db.n8n.query(`SELECT siren, status, to_email FROM outreach WHERE siren = ANY($1::text[]) ORDER BY siren`, [S]);
    assert.deepEqual(rows.map((r) => [r.siren, r.status, r.to_email]), [[S[0], 'brouillon', 'contact@duprazbanc.fr']]);
  } finally {
    await db.n8n.query('DELETE FROM outreach WHERE siren = ANY($1::text[]) OR id > $2', [S, avant]).catch(() => {});
    await db.n8n.query('DELETE FROM prospects WHERE siren = ANY($1::text[])', [S]).catch(() => {});
    await db.fermer();
  }
});
