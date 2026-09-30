// Les vitrines : un commerçant sans site (ou au site ancien) reçoit une maquette et un brouillon ; sans e-mail,
// il part tout de suite dans la liste d'appels ; un site récent est écarté ; rien n'est jamais envoyé.
import './outils.mjs';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../../agents/lib.js';
import { passer, jugerSite, emailsDans, adresseValide, maquette, brouillon, PRIX, AGENDA } from '../../agents/vitrines.js';

const brain = db(); await brain.connect();
after(async () => { for (const t of ['vitrines', 'vitrines_recherches', 'vitrines_villes']) await brain.query(`DROP TABLE IF EXISTS ${t}`); await brain.end(); });

const rep = (corps, statut = 200, url) => ({ ok: statut < 400, status: statut, url, json: async () => corps, text: async () => corps });
const VIEUX = '<html><body><table width="700"><font>Bienvenue chez nous</font> contact : garage.dupont74@gmail.com © 2013</table></body></html>';
const NEUF = '<meta name="viewport" content="width=device-width"><footer>© 2026 Fleurs</footer>';
function internet() {
  const appels = [];
  const fetch = async (url, o = {}) => {
    const u = String(url); appels.push({ url: u, body: o.body, headers: o.headers });
    if (u.startsWith('https://geo.api.gouv.fr/communes')) return rep([{ nom: 'Annecy', population: 130000, codeDepartement: '74' }, { nom: 'Lyon', population: 520000, codeDepartement: '69' }]);
    if (u === 'https://places.googleapis.com/v1/places:searchText') return rep({ places: [
      { id: 'p1', displayName: { text: 'Boulangerie Sans Site' }, formattedAddress: '1 rue A, 74000 Annecy', nationalPhoneNumber: '04 50 11 11 11', businessStatus: 'OPERATIONAL' },
      { id: 'p2', displayName: { text: 'Garage Dupont' }, formattedAddress: '2 rue B, 74000 Annecy', nationalPhoneNumber: '04 50 22 22 22', websiteUri: 'http://garage-dupont.fr/', businessStatus: 'OPERATIONAL' },
      { id: 'p3', displayName: { text: 'Fleurs Modernes' }, formattedAddress: '3 rue C, 74000 Annecy', nationalPhoneNumber: '04 50 33 33 33', websiteUri: 'https://fleurs-modernes.fr/', businessStatus: 'OPERATIONAL' },
      { id: 'p4', displayName: { text: 'Fermé Définitivement' }, businessStatus: 'CLOSED_PERMANENTLY' }] });
    if (u.startsWith('http://garage-dupont.fr')) return rep(VIEUX, 200, 'http://garage-dupont.fr/');
    if (u.startsWith('https://fleurs-modernes.fr')) return rep(NEUF, 200, 'https://fleurs-modernes.fr/');
    if (u.includes('searxng')) return rep({ results: [{ url: 'https://www.pagesjaunes.fr/x', title: 'Boulangerie Sans Site Annecy', content: 'Annuaire : info@pagesjaunes.fr' }] });
    throw new Error('réseau coupé : ' + u);
  };
  return { fetch, appels };
}
const resoudre = async (domaine) => (['gmail.com'].includes(domaine) ? [{ exchange: 'mx' }] : []);

test('un site ancien se reconnaît à ses signes ; un site récent, non ; un site mort compte comme aucun', () => {
  assert.equal(jugerSite({ ok: true, url: 'http://x.fr/', html: VIEUX }, 2026).etat, 'ancien');
  assert.equal(jugerSite({ ok: true, url: 'https://x.fr/', html: NEUF }, 2026).etat, 'recent');
  assert.equal(jugerSite(null).etat, 'aucun');
});

test('les e-mails : les annuaires et les « noreply » écartés ; il faut un serveur de messagerie', async () => {
  assert.deepEqual(emailsDans('a@pagesjaunes.fr noreply@x.fr garage.dupont74@gmail.com', { nom: 'Garage Dupont' }), ['garage.dupont74@gmail.com']);
  assert.equal(await adresseValide('garage.dupont74@gmail.com', { resoudre }), true);
  assert.equal(await adresseValide('contact@domaine-sans-mx.fr', { resoudre }), false);
});

test('la maquette neutralise le nom (aucune injection) et porte l’appel en un geste ; le brouillon suit le texte de Basile', () => {
  const v = { nom: '<script>x</script> Chez Lulu', metier: 'restaurant', ville: 'Annecy', telephone: '04 50 00 00 00', source_id: 'google:z' };
  const h = maquette(v);
  assert.ok(!h.includes('<script>x'));
  assert.match(h, /href="tel:0450000000"/);
  assert.match(h, /Maquette de démonstration préparée par rAIme/);
  const b = brouillon({ ...v, nom: 'Chez Lulu', site_etat: 'aucun' }, 'https://cockpit.raime.fr/demo/chez-lulu-abc');
  assert.match(b.corps, /Le voici :\nhttps:\/\/cockpit\.raime\.fr\/demo\/chez-lulu-abc/);
  assert.match(b.corps, new RegExp(`il est à ${PRIX} €`));
  assert.match(b.corps, /S'il ne vous plaît pas, vous ne payez rien/);
  assert.ok(b.corps.includes(AGENDA));
  assert.match(b.corps, /répondez « stop »/);
});

test('un passage : Google Places trouve, le code trie, rien n’est envoyé', async () => {
  const { fetch, appels } = internet();
  const bilan = await passer({ brain, env: { GOOGLE_PLACES_API_KEY: 'cle-de-test' }, fetch, resoudre, combien: 10 });
  assert.equal(bilan.neufs, 3, 'le commerce fermé n’entre pas');
  const { rows } = await brain.query('SELECT nom, statut, site_etat, email, motif, slug, demo_html IS NOT NULL AS demo FROM vitrines ORDER BY source_id');
  const par = Object.fromEntries(rows.map((r) => [r.nom, r]));
  assert.equal(par['Boulangerie Sans Site'].statut, 'a_appeler');
  assert.equal(par['Boulangerie Sans Site'].motif, 'e-mail non trouvé');
  assert.equal(par['Boulangerie Sans Site'].demo, true);
  assert.equal(par['Garage Dupont'].statut, 'brouillon');
  assert.equal(par['Garage Dupont'].site_etat, 'ancien');
  assert.equal(par['Garage Dupont'].email, 'garage.dupont74@gmail.com');
  assert.equal(par['Fleurs Modernes'].statut, 'ecarte');
  const places = appels.find((a) => a.url.includes('places.googleapis.com'));
  assert.equal(places.headers['X-Goog-Api-Key'], 'cle-de-test');
  assert.match(places.headers['X-Goog-FieldMask'], /nationalPhoneNumber.*websiteUri/);
  assert.match(JSON.parse(places.body).textQuery, /^boulangerie Annecy$/, 'la région de Basile d’abord');
  assert.ok(!appels.some((a) => /resend|smtp|mail\.google|outreach/i.test(a.url)), 'aucun envoi');
  const j = await brain.query("SELECT changement FROM journal WHERE acteur = 'vitrines' ORDER BY created_at DESC LIMIT 1");
  assert.match(j.rows[0].changement, /3 commerces repérés, 1 brouillons, 1 à appeler/);
});

test('sans clé Google : OpenStreetMap, et la même recherche n’est jamais refaite', async () => {
  const { appels } = internet();
  const osm = async (url, o) => (String(url).includes('overpass') ? rep({ elements: [] }) : internet().fetch(url, o));
  await passer({ brain, env: {}, fetch: async (u, o) => { appels.push({ url: String(u) }); return osm(u, o); }, resoudre });
  assert.ok(appels.some((a) => a.url.includes('overpass-api.de')));
  const { rows } = await brain.query("SELECT count(*)::int AS n FROM vitrines_recherches WHERE metier = 'boulangerie' AND ville = 'Annecy'");
  assert.equal(rows[0].n, 2, 'une trace par source');
});
