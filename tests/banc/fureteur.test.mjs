// Le Fureteur réécrit (07/10/2026) : un site n'est retenu que s'il prouve être celui de l'entreprise (SIREN, ou nom ET
// ville) ; l'adresse doit y être écrite, à son domaine ; jamais devinée, jamais celle d'un moteur ou d'un annuaire.
import './outils.mjs';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { bases } from './outils.mjs';

const f = await import('../../agents/fureteur.js');
const NAZ = { siren: '123456789', name: 'SCP NAZ & ASSOCIES, NOTAIRES', city: 'ANNECY' };

test('la preuve : le SIREN sur la page, ou tous les mots propres du nom ET la ville ; un mot seul ne prouve rien', () => {
  assert.equal(f.preuve('Mentions légales — RCS Annecy 123 456 789', NAZ), 'siren');
  assert.equal(f.preuve('SIRET 12345678900012', NAZ), 'siren');
  assert.equal(f.preuve('Étude Naz & Associés, 3 rue Royale, 74000 Annecy', NAZ), 'nom et ville');
  assert.equal(f.preuve('Étude Naz à Lyon', NAZ), null, 'pas la bonne ville');
  assert.equal(f.preuve('Cabinet à Annecy, notaires associés', NAZ), null, 'les mots du métier ne prouvent rien');
  assert.equal(f.preuve('n° 9123456789', NAZ), null, 'un SIREN collé à d’autres chiffres n’en est pas un');
});

test('les adresses écrites sur le site, au domaine du site ; la boîte générale avant celle d’une personne', () => {
  const l = f.adressesDe('<a href="mailto:Jean.Naz@naz-associes.notaires.fr">x</a> accueil [at] naz-associes.notaires.fr logo@2x.png contact@buttondown.email');
  assert.deepEqual(l, ['jean.naz@naz-associes.notaires.fr', 'accueil@naz-associes.notaires.fr', 'contact@buttondown.email']);
  assert.equal(f.choisirAdresse(l, NAZ, 'https://naz-associes.notaires.fr'), 'accueil@naz-associes.notaires.fr');
  assert.equal(f.choisirAdresse(['webmaster@agence-web.fr', 'no-reply@naz-associes.notaires.fr'], NAZ, 'https://naz-associes.notaires.fr'), null);
});

test('les domaines tirés du nom, sans les mots du notariat ; .notaires.fr pour une étude', () => {
  const d = f.domainesDevines(NAZ);
  assert.equal(d[0], 'naz-associes.notaires.fr');
  assert.ok(d.includes('nazassocies.fr'));
  assert.deepEqual(f.domainesDevines({ name: 'FIDURALP' }), ['fiduralp.fr', 'fiduralp.com']);
  assert.deepEqual(f.domainesDevines({ name: 'CABINET CONSEIL' }), [], 'un nom fait de mots du métier ne donne aucun domaine');
});

test('visiter : un site sans preuve est rejeté ; un site prouvé rend son adresse et son téléphone', async () => {
  const pages = {
    'https://naz-associes.notaires.fr': '<a href="/mentions-legales">Mentions</a><a href="/contact">Contact</a><p>Bienvenue</p>',
    'https://naz-associes.notaires.fr/mentions-legales': '<p>SCP Naz, RCS Annecy 123 456 789</p>',
    'https://naz-associes.notaires.fr/contact': '<a href="tel:+33450000001">04 50 00 00 01</a> <a href="mailto:office@naz-associes.notaires.fr">écrire</a>',
    'https://autre.fr': '<p>Une autre étude, à Lyon</p><a href="mailto:contact@autre.fr">x</a>',
  };
  const lire = async (u) => (pages[u.replace(/\/$/, '')] ? { url: u.replace(/\/$/, ''), html: pages[u.replace(/\/$/, '')] } : null);
  const v = await f.visiter('https://naz-associes.notaires.fr', NAZ, lire);
  assert.deepEqual([v.preuve, v.email, v.telephone], ['siren', 'office@naz-associes.notaires.fr', '0450000001']);
  const x = await f.visiter('https://autre.fr', NAZ, lire);
  assert.equal(x.preuve, null);
  assert.equal(x.email, undefined, 'aucune adresse prise sur un site non prouvé');
});

test('le nom : la parenthèse qui répète le nom disparaît ; une messagerie grand public seulement si l’adresse porte le nom', async () => {
  const { joliNom, adresseFiable } = await import('../../agents/prospection_auto.js');
  assert.equal(joliNom('SURPERFORMANCE (ZONEBOURSE - SURPERFORMANCE)'), 'Surperformance');
  assert.equal(joliNom('FIDUCIAIRE ET CONSEIL RHONE-ALPES (FIDURALP)'), 'Fiduralp', 'le nom d’usage quand le nom officiel est long');
  assert.equal(joliNom('CAB WIRION STE FIDUC RHONE ALPES JURA'), 'Cabinet Wirion Société Fiduciaire Rhône Alpes Jura');
  assert.equal(joliNom('DUPONT (DUPONT CONSEIL)'), 'Dupont', 'un nom court garde sa forme');
  assert.equal(adresseFiable({ name: 'CABINET DUPONT', contact_email: 'cabinet.dupont@wanadoo.fr' }), true);
  assert.equal(adresseFiable({ name: 'CABINET DUPONT', contact_email: 'jean74@orange.fr' }), false);
});

// 08/10/2026 : trois verdicts gardés dans prospects.site_statut ; un moteur fermé ne bloque plus une fiche 30 jours.
const FICHES = ['931000001', '931000002', '931000003', '931000004', '931000005', '931000006'];
const db = await bases().catch(() => null);
after(async () => {
  if (!db) return;
  await db.n8n.query('DELETE FROM prospects WHERE siren = ANY($1::text[])', [FICHES]).catch(() => {});
  await db.fermer();
});

test('passer : prouvé, absent, portail ; moteur fermé → inconnu, revu le lendemain ; l’ancienne note « moteur fermé » rendue tout de suite', async (t) => {
  if (!db) { t.skip('bases du banc absentes'); return; }
  const { n8n } = db;
  await n8n.query('ALTER TABLE prospects ADD COLUMN IF NOT EXISTS furete_le timestamptz, ADD COLUMN IF NOT EXISTS furete_note text');
  const noms = ['CABINET ALPHA BANC', 'CABINET BETA BANC', 'CABINET GAMMA BANC', 'CABINET DELTA BANC', 'CABINET EPSILON BANC', 'CABINET ZETA BANC'];
  for (let i = 0; i < FICHES.length; i++) {
    await n8n.query(`INSERT INTO prospects (siren, name, naf, sector, city, departement, status, effectif_est, furete_le, furete_note)
      VALUES ($1, $2, '69.20Z', 'Cabinets comptables', 'ANNECY', '74', 'nouveau', $3, $4, $5)`,
    [FICHES[i], noms[i], 60 - i * 10, i === 5 ? new Date() : null, i === 5 ? 'aucun site prouvé (moteur fermé)' : null]);
  }
  const pages = {
    'https://gamma-banc.fr': '<p>Cabinet Gamma Banc, SIREN 931 000 003</p><a href="tel:0559422655">siège</a> 04 50 11 22 33 <a href="mailto:contact@gamma-banc.fr">écrire</a>',
    'https://autre-beta.fr': '<p>Un autre cabinet, à Lyon</p>',
  };
  const lire = async (u) => (pages[u.replace(/\/$/, '')] ? { url: u.replace(/\/$/, ''), html: pages[u.replace(/\/$/, '')] } : null);
  const questions = [];
  const chercher = async (q) => {
    questions.push(q);
    const r = { ferme: false, sites: [], portails: [], vide: false };
    if (/alpha/i.test(q)) return { ...r, portails: ['https://annuaire.experts-comptables.org/cabinet/alpha-banc'] };
    if (/beta/i.test(q)) return { ...r, sites: ['https://autre-beta.fr'] };
    if (/gamma/i.test(q)) return { ...r, sites: ['https://gamma-banc.fr'] };
    return { ...r, ferme: true, vide: true };   // DELTA : le moteur se ferme ; EPSILON et ZETA ne le sollicitent plus
  };
  const outils = { lire, chercher, existe: async () => false, attente: 0 };
  const f2 = await import('../../agents/fureteur.js');
  const b = await f2.passer({ n8n, combien: 25, outils });
  assert.deepEqual([b.prouves, b.absents, b.portails, b.inconnus], [1, 1, 1, 3]);
  assert.match(b.moteur, /^fermé/);
  assert.equal(questions.filter((q) => /epsilon|zeta/i.test(q)).length, 0, 'moteur fermé : on ne frappe plus');
  const { rows } = await n8n.query(`SELECT siren, site_statut, furete_note, website, telephone, contact_email,
      extract(epoch FROM now() - furete_le) / 86400 AS jours FROM prospects WHERE siren = ANY($1::text[]) ORDER BY siren`, [FICHES]);
  const p = Object.fromEntries(rows.map((r) => [r.siren, r]));
  assert.equal(p['931000001'].site_statut, 'portail');
  assert.match(p['931000001'].furete_note, /portail de sa profession : https:\/\/annuaire\.experts-comptables\.org\/cabinet\/alpha-banc/);
  assert.equal(p['931000002'].site_statut, 'absent');
  assert.deepEqual([p['931000003'].site_statut, p['931000003'].website, p['931000003'].telephone, p['931000003'].contact_email],
    ['prouve', 'https://gamma-banc.fr', '0450112233', 'contact@gamma-banc.fr'], 'le numéro du cabinet, pas le standard de son siège');
  for (const s of ['931000004', '931000005', '931000006']) {
    assert.equal(p[s].site_statut, 'inconnu', s);
    assert.ok(Number(p[s].jours) > 28.9 && Number(p[s].jours) < 29.1, `${s} : daté de 29 jours, revu le lendemain`);
    assert.match(p[s].furete_note, /nouvel essai demain/);
  }
  // le lendemain : les fiches « inconnu » reviennent, le moteur s'est rouvert
  await n8n.query(`UPDATE prospects SET furete_le = furete_le - interval '1 day 1 minute' WHERE siren = ANY($1::text[]) AND site_statut = 'inconnu'`, [FICHES]);
  const ouvert = async () => ({ ferme: false, sites: [], portails: [], vide: false });
  const b2 = await f2.passer({ n8n, combien: 25, outils: { ...outils, chercher: ouvert } });
  assert.ok(b2.absents >= 3);
  const { rows: r2 } = await n8n.query(`SELECT count(*)::int AS n FROM prospects WHERE siren = ANY($1::text[]) AND site_statut = 'absent'`, [FICHES]);
  assert.equal(r2[0].n, 4);
});
