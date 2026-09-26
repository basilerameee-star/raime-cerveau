// Les utilitaires de Jarvis : heure, météo, minuteries et rappels, mémoire longue, agenda. Répondus par du code.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'banc-outils-'));
Object.assign(process.env, {
  PGDATABASE: process.env.BANC_BASE_N8N || 'n8n_test', PGDATABASE_CERVEAU: process.env.BANC_BASE_BRAIN || 'raime_brain_test',
  PGHOST: process.env.PGHOST || 'localhost', PGUSER: process.env.PGUSER || 'raime', COFFRE_FICHIER: path.join(T, 'coffre.env'),
});
const outils = require('../../jarvis/outils.cjs');
const bases = require('../../jarvis/bases.cjs');
before(async () => { for (const t of ['rappels', 'souvenirs', 'memoire_curseur']) await bases.lire(`DROP TABLE IF EXISTS ${t}`); await outils.preparer(); });
after(async () => { for (const t of ['rappels', 'souvenirs', 'memoire_curseur']) await bases.lire(`DROP TABLE IF EXISTS ${t}`); await bases.cerveau.end(); await bases.n8n.end(); });

test('minuteries et rappels : durées, heures, demain', () => {
  const t0 = new Date('2026-09-26T19:00:00Z');   // 21 h à Paris
  assert.equal(outils.comprendreRappel('lance une minuterie de 5 minutes', t0).echeance.toISOString(), '2026-09-26T19:05:00.000Z');
  const r = outils.comprendreRappel("rappelle-moi dans deux heures d'appeler Claire", t0);
  assert.equal(r.echeance.toISOString(), '2026-09-26T21:00:00.000Z');
  assert.equal(r.texte, 'appeler Claire');
  assert.equal(outils.comprendreRappel('rappelle-moi à 22h30 de sortir le chien', t0).echeance.toISOString(), '2026-09-26T20:30:00.000Z');
  assert.equal(outils.comprendreRappel('rappelle-moi demain à 9h de relancer Morel', t0).echeance.toISOString(), '2026-09-27T07:00:00.000Z');
  assert.equal(outils.comprendreRappel('rappelle-moi à 8h de courir', t0).echeance.toISOString(), '2026-09-27T06:00:00.000Z', 'une heure passée : le lendemain');
  assert.equal(outils.comprendreRappel('crée un site pour Mercedes', t0), null);
});

test('un rappel noté est annoncé une seule fois à échéance', async () => {
  const rep = await outils.repondre('lance une minuterie de 1 seconde');
  assert.match(rep, /C'est noté : Minuterie de 1 seconde terminée/);
  await new Promise((r) => setTimeout(r, 1200));
  const echus = await outils.rappelsEchus();
  assert.equal(echus.length, 1);
  assert.equal((await outils.rappelsEchus()).length, 0);
});

test('mémoire longue : « retiens que… » est rangé et retrouvé par ses mots', async () => {
  assert.match(await outils.repondre('Retiens que mon objectif est la monétisation TikTok avant Instagram'), /^Retenu : /);
  const s = await outils.souvenirsPour('Où en est la monétisation TikTok ?');
  assert.ok(s.some((x) => /TikTok avant Instagram/.test(x.texte)));
});

test('la mémoire se nourrit seule des échanges, sans garder de secret', async () => {
  await bases.lireN8n("CREATE TABLE IF NOT EXISTS cortex_chat (id serial PRIMARY KEY, role text, content text, created_at timestamptz DEFAULT now())");
  for (let i = 0; i < 6; i++) await bases.lireN8n("INSERT INTO cortex_chat (role, content) VALUES ('user', $1)", [`message ${i}`]);
  const faux = async () => ({ texte: JSON.stringify({ faits: ['Basile veut 2 000 € par mois sur TikTok.', 'Son mot de passe est abc.'] }) });
  const n = await outils.memoriser({ repondreSansFrais: faux });
  assert.equal(n, 1, 'le fait qui contient un mot de passe est écarté');
  assert.equal(await outils.memoriser({ repondreSansFrais: faux }), 0, 'déjà lu : rien de relu');
});

test('heure et météo par du code (Open-Meteo, sans clé)', async () => {
  assert.match(await outils.repondre('Quelle heure est-il ?'), /^Il est \d{2}:\d{2}, nous sommes /);
  const fetch = async (url) => ({ ok: true, json: async () => (/geocoding/.test(url)
    ? { results: [{ name: 'Lyon', latitude: 45.7, longitude: 4.8 }] }
    : { current: { temperature_2m: 18.4, weather_code: 3 }, daily: { weather_code: [3, 61], temperature_2m_min: [12, 11], temperature_2m_max: [21, 17], precipitation_probability_max: [10, 80] } }) });
  assert.equal(await outils.meteo('quelle météo à Lyon ?', { fetch, coffre: {} }), "À Lyon, il fait 18 degrés, couvert. Aujourd'hui : de 12 à 21 degrés, 10 % de risque de pluie.");
  assert.match(await outils.meteo('météo demain à Lyon', { fetch, coffre: {} }), /^Demain à Lyon : pluie faible, de 11 à 17 degrés, 80 %/);
});

test('agenda : lecture d’une adresse iCal (lecture seule), sans adresse il dit quoi faire', async () => {
  const ics = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART:20260928T080000Z\r\nSUMMARY:Rendez-vous garage Morel\r\nLOCATION:Lyon\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20261201\r\nSUMMARY:Trop loin\r\nEND:VEVENT\r\nEND:VCALENDAR';
  const fetch = async () => ({ ok: true, text: async () => ics });
  const e = await outils.agenda({ fetch, coffre: { AGENDA_ICAL: 'https://calendar.google.com/x/basic.ics' }, maintenant: new Date('2026-09-26T19:00:00Z') });
  assert.equal(e.length, 1);
  assert.match(outils.phraseAgenda(e), /lundi 28 septembre à 10:00 : Rendez-vous garage Morel, Lyon\./);
  assert.match(outils.phraseAgenda(null), /adresse iCal secrète dans le coffre/);
});
