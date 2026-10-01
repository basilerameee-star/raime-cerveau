// Les vitrines : un commerçant sans site (ou au site ancien) reçoit une maquette et un brouillon ; sans e-mail,
// il part tout de suite dans la liste d'appels ; un site récent est écarté ; rien n'est jamais envoyé.
import './outils.mjs';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../../agents/lib.js';
import { passer, jugerSite, emailsDans, adresseValide, emailPlausible, maquette, brouillon, chercherOsm, enseigne, PRIX, AGENDA } from '../../agents/vitrines.js';

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

test('un site ancien se reconnaît à ses signes ; un site récent, non ; introuvable = mort ; qui répond mal = illisible', () => {
  assert.equal(jugerSite({ ok: true, url: 'http://x.fr/', html: VIEUX }, 2026).etat, 'ancien');
  assert.equal(jugerSite({ ok: true, url: 'https://x.fr/', html: NEUF }, 2026).etat, 'recent');
  assert.equal(jugerSite(null).etat, 'aucun');
  assert.equal(jugerSite({ ok: false, statut: 404 }).etat, 'mort');
  assert.equal(jugerSite({ ok: false, statut: 0, erreur: 'ENOTFOUND' }).etat, 'mort');
  assert.equal(jugerSite({ ok: false, statut: 403 }).etat, 'illisible', 'un blocage ne prouve pas l’absence de site');
  assert.equal(jugerSite({ ok: false, statut: 0, erreur: 'TimeoutError' }).etat, 'illisible');
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
  assert.ok(!/border-radius:[1-9]/.test(h) && !/box-shadow/.test(h), 'ni arrondi ni relief');
  assert.match(h, /https:\/\/cockpit\.raime\.fr\/demo\/img\/restaurant\/1\.jpg/, 'les photos d’exemple du métier, servies par le Cockpit');
  assert.ok(!/<script/i.test(h), 'aucun script');
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

test('01/10/2026 : une page supprimée d’un site vivant n’est pas « aucun site » ; l’adresse d’une autre maison est refusée ; une adresse, un seul e-mail', async () => {
  const ajouter = (id, nom, plus = {}) => brain.query(`INSERT INTO vitrines (id, source, source_id, nom, metier, ville, telephone, site, email, email_source, statut)
    VALUES ($1, 'osm', $2, $3, 'boulangerie', 'Annecy', '04 50 00 00 00', $4, $5, $6, 'nouveau')`,
  [id, `osm:node/test${id}`, nom, plus.site || null, plus.email || null, plus.email ? 'fiche OSM' : null]);
  await brain.query("UPDATE vitrines SET statut = 'ecarte' WHERE statut = 'nouveau'");
  await ajouter(901, 'Boulangerie Chevallier', { site: 'https://www.chevallier-test.fr/boutique-plaine/' });
  await ajouter(902, 'Boulangerie Martin');
  await ajouter(903, 'Le Fournil Dupuis', { email: 'contact@fournil-dupuis.fr' });
  await ajouter(904, 'Fournil Dupuis (boutique 2)', { email: 'contact@fournil-dupuis.fr' });
  await ajouter(906, 'Onglerie Sans Schéma', { site: 'www.onglerie-test.fr/' });
  await ajouter(905, 'Fleurs Évasion', { site: 'https://www.facebook.com/fleursevasion/', email: 'fleurs.evasion@gmail.com' });
  const fetch = async (url) => {
    const u = String(url);
    if (u.includes('overpass')) return rep({ elements: [] });
    if (u === 'https://www.chevallier-test.fr/boutique-plaine/') return rep('', 404, u);
    if (u === 'https://www.chevallier-test.fr/') return rep(NEUF, 200, u);
    if (u === 'https://www.onglerie-test.fr/') return rep(NEUF, 200, u);
    if (u.includes('searxng') && u.includes('email')) return rep({ results: [{ url: 'https://annuaire-x.fr/a', title: 'Boulangerie Martin Annecy', content: 'Contact : autremaison74@gmail.com' }] });
    if (u.includes('searxng')) return rep({ results: [] });
    throw new Error('réseau coupé : ' + u);
  };
  const mx = async (d) => (['gmail.com', 'fournil-dupuis.fr'].includes(d) ? [{ exchange: 'mx' }] : []);
  await passer({ brain, env: {}, fetch, resoudre: mx, combien: 10 });
  const fiche = async (id) => (await brain.query('SELECT statut, site_etat, motif, email, corps FROM vitrines WHERE id = $1', [id])).rows[0];
  const a = await fiche(901);
  assert.equal(a.statut, 'ecarte'); assert.equal(a.site_etat, 'recent', 'la racine du site a été lue');
  const b = await fiche(902);
  assert.equal(b.statut, 'a_appeler'); assert.equal(b.email, null, 'l’adresse d’une autre maison est refusée');
  const c = await fiche(903);
  assert.equal(c.statut, 'brouillon');
  assert.match(c.corps, /En cherchant une boulangerie à Annecy/);
  assert.match(c.corps, /je n'ai trouvé aucun site à votre nom/, 'une fiche OSM ne parle pas de Google');
  assert.ok(!/Google/.test(c.corps));
  const d = await fiche(904);
  assert.equal(d.statut, 'ecarte'); assert.equal(d.motif, 'même e-mail que la vitrine n°903');
  const e = await fiche(905);
  assert.equal(e.statut, 'brouillon', 'une page Facebook n’est pas un site : c’est la cible');
  assert.match(e.corps, /je n'ai trouvé qu'une page Facebook, et aucun site à votre nom/);
  assert.equal((await fiche(906)).site_etat, 'recent', 'une adresse sans https:// se lit quand même');
  assert.equal(emailPlausible('boulangerie@gmail.com', { nom: 'Boulangerie du Lac', ville: 'Annecy' }, null, 'recherche web'), false, 'un mot du métier ne suffit pas');
});

test('OpenStreetMap : une enseigne (étiquette « brand ») n’est pas un commerçant à démarcher', async () => {
  const f = async () => rep({ elements: [
    { type: 'node', id: 1, tags: { name: 'Carrefour fleurs', shop: 'florist', brand: 'Carrefour' } },
    { type: 'node', id: 2, tags: { name: 'Monceau Fleurs', shop: 'florist', 'brand:wikidata': 'Q1' } },
    { type: 'node', id: 3, tags: { name: 'Les Fleurs de Léa', shop: 'florist', phone: '04 50 00 00 03' } }] });
  const r = await chercherOsm({ metier: 'fleuriste', ville: 'Annecy', fetch: f });
  assert.deepEqual(r.map((x) => x.nom), ['Les Fleurs de Léa']);
});

test('point 18 : aucune enseigne nationale n’arrive en brouillon ni dans les appels ; un artisan qui porte un prénom, si', async () => {
  const oui = ['Paul', "PAUL - Gare d'Annecy", 'Boulangerie Paul', 'Brioche Dorée', 'Marie Blachère', 'Jean Louis David', 'Carrefour fleurs',
    'Coiff&Co', 'Monceau Fleurs', 'Speedy Annecy', 'La Mie Câline', 'Ange Annecy Centre'];
  const non = ['Boulangerie Paul Martin', 'Le Fournil de Paul', 'Chez Nicolas', 'Aux Délices de Louise', 'Techni Nails', 'Au Puits Savoyard'];
  for (const nom of oui) assert.ok(enseigne({ nom, ville: 'Annecy' }), `${nom} est une enseigne`);
  for (const nom of non) assert.equal(enseigne({ nom, ville: 'Annecy' }), null, `${nom} n’est pas une enseigne`);
  await brain.query("UPDATE vitrines SET statut = 'ecarte' WHERE statut = 'nouveau'");
  await brain.query(`INSERT INTO vitrines (id, source, source_id, nom, metier, ville, telephone, email, email_source, statut)
    VALUES (950, 'osm', 'osm:node/test950', 'Brioche Dorée', 'boulangerie', 'Annecy', '04 50 00 00 50', 'annecy@exemple-chaine.fr', 'fiche OSM', 'nouveau')`);
  await passer({ brain, env: {}, fetch: async (u) => (String(u).includes('overpass') ? rep({ elements: [{ type: 'node', id: 7, tags: { name: 'Paul', shop: 'bakery' } }] }) : rep({ results: [] })),
    resoudre: async () => [{ exchange: 'mx' }], combien: 5 });
  const { rows } = await brain.query("SELECT statut, motif FROM vitrines WHERE id = 950");
  await brain.query(`INSERT INTO vitrines (id, source, source_id, nom, metier, ville, telephone, statut) VALUES (951, 'osm', 'osm:node/test951', 'Ange', 'boulangerie', 'Annecy', '04', 'a_appeler')`);
  await passer({ brain, env: {}, fetch: async (u) => rep(String(u).includes('overpass') ? { elements: [] } : { results: [] }), resoudre: async () => [], combien: 1 });
  assert.equal((await brain.query('SELECT statut FROM vitrines WHERE id = 951')).rows[0].statut, 'ecarte', 'déjà dans les appels : écartée quand même');
  assert.deepEqual(rows[0], { statut: 'ecarte', motif: 'enseigne nationale (brioche doree)' });
  assert.equal((await brain.query("SELECT count(*)::int AS n FROM vitrines WHERE nom = 'Paul' AND source_id = 'osm:node/7'")).rows[0].n, 0, 'une enseigne découverte n’entre même pas');
});


test('01/10/2026 : un nom court (« RNP ») retrouve son site par la recherche ; un site mort fait chercher un site actuel', async () => {
  const { siteDuCommerce } = await import('../../agents/vitrines.js');
  assert.equal(siteDuCommerce([{ url: 'https://fr.mappy.com/poi/1' }, { url: 'https://www.garage-rnp.fr/' }], { nom: 'RNP', ville: 'Annecy' }), 'https://www.garage-rnp.fr/');
  assert.equal(siteDuCommerce([{ url: 'https://placeauto.fr/' }], { nom: 'Garage du Lac', ville: 'Annecy' }), null, 'un mot court ne se lit pas au milieu d’un autre');
  await brain.query("UPDATE vitrines SET statut = 'ecarte' WHERE statut = 'nouveau'");
  await brain.query(`INSERT INTO vitrines (id, source, source_id, nom, metier, ville, telephone, site, email, email_source, statut) VALUES
    (960, 'osm', 'osm:node/t960', 'RNP', 'garage automobile', 'Annecy', '06 00 00 00 60', NULL, 'contact@garage-rnp.fr', 'fiche OSM', 'nouveau'),
    (961, 'osm', 'osm:node/t961', 'Auto Form', 'garage automobile', 'Annecy', '06 00 00 00 61', 'https://www.ancien-autoform.fr/', 'autoform@gmail.com', 'fiche OSM', 'nouveau')`);
  const fetch = async (url) => {
    const u = String(url);
    if (u.includes('overpass')) return rep({ elements: [] });
    if (u.includes('searxng') && u.includes('RNP')) return rep({ results: [{ url: 'https://www.pagesjaunes.fr/x' }, { url: 'https://www.garage-rnp.fr/' }] });
    if (u.includes('searxng') && u.includes('Auto%20Form')) return rep({ results: [{ url: 'https://www.auto-form-annecy.fr/' }] });
    if (u.includes('searxng')) return rep({ results: [] });
    if (u.startsWith('https://www.garage-rnp.fr')) return rep(VIEUX, 200, 'https://www.garage-rnp.fr/');
    if (u.startsWith('https://www.ancien-autoform.fr')) return rep('', 404, u);
    if (u.startsWith('https://www.auto-form-annecy.fr')) return rep(NEUF, 200, u);
    throw new Error('réseau coupé : ' + u);
  };
  await passer({ brain, env: {}, fetch, resoudre: async () => [{ exchange: 'mx' }], combien: 5 });
  const f = async (id) => (await brain.query('SELECT statut, site, site_etat, corps FROM vitrines WHERE id = $1', [id])).rows[0];
  const rnp = await f(960);
  assert.equal(rnp.site, 'https://www.garage-rnp.fr/'); assert.equal(rnp.site_etat, 'ancien');
  assert.match(rnp.corps, /votre site existe, mais il date un peu/); assert.ok(!/aucun site/.test(rnp.corps));
  const af = await f(961);
  assert.equal(af.statut, 'ecarte', 'l’ancien site est mort, mais le nouveau est récent : rien à vendre'); assert.equal(af.site, 'https://www.auto-form-annecy.fr/');
});

test('01/10/2026 : une recherche web bloquée ne prouve rien ; la fiche reste à traiter', async () => {
  await brain.query("UPDATE vitrines SET statut = 'ecarte' WHERE statut = 'nouveau'");
  await brain.query(`INSERT INTO vitrines (id, source, source_id, nom, metier, ville, telephone, email, email_source, statut) VALUES
    (970, 'osm', 'osm:node/t970', 'Garage Bloqué', 'garage automobile', 'Annecy', '06 00 00 00 70', 'garage.bloque@gmail.com', 'fiche OSM', 'nouveau')`);
  const fetch = async (url) => (String(url).includes('overpass') ? rep({ elements: [] })
    : rep({ results: [], unresponsive_engines: [['brave', 'Suspended: too many requests'], ['duckduckgo', 'CAPTCHA']] }));
  const b = await passer({ brain, env: {}, fetch, resoudre: async () => [{ exchange: 'mx' }], combien: 5 });
  assert.equal(b.reportes, 1);
  assert.equal((await brain.query('SELECT statut FROM vitrines WHERE id = 970')).rows[0].statut, 'nouveau', 'rien d’affirmé : pas de brouillon « aucun site »');
});

test('la maquette v2 : la carte OpenStreetMap quand les coordonnées sont connues, crédit compris ; sinon le repère seul', async () => {
  const { maquettePremium, carte } = await import('../../agents/maquette_premium.js');
  const avec = maquettePremium({ nom: 'Le Fournil', metier: 'boulangerie', ville: 'Annecy', telephone: '04 50 00 00 01', lat: 45.8992, lon: 6.1294 }, { images: 'https://cockpit.raime.fr/demo/img' });
  assert.match(avec, /https:\/\/tile\.openstreetmap\.org\/16\/\d+\/\d+\.png/);
  assert.match(avec, /© OpenStreetMap/);
  assert.match(avec, /Commander/, 'le bouton d’action du métier');
  const sans = maquettePremium({ nom: 'Le Fournil', metier: 'boulangerie', ville: 'Annecy' }, {});
  assert.ok(!/tile\.openstreetmap/.test(sans));
  assert.equal(carte(NaN, 1), null);
});

test('v3 : les vrais horaires d’OpenStreetMap en français ; illisibles, ils ne sont pas inventés', async () => {
  const { horairesLisibles, maquetteComplete } = await import('../../agents/maquette_premium.js');
  assert.deepEqual(horairesLisibles('Mo-Fr 08:00-12:00,14:00-18:30; Sa 08:00-12:00; Su off'), ['Lun. au ven. : 8 h–12 h, 14 h–18 h 30', 'Sam. : 8 h–12 h', 'Dim. : fermé']);
  assert.equal(horairesLisibles('sunrise-sunset'), null);
  assert.equal(maquetteComplete({ nom: 'X', ville: 'Annecy', telephone: '04' }, '<div style="background-image:url(https://cockpit.raime.fr/demo/img/boulangerie/1.jpg)">'), true);
  assert.equal(maquetteComplete({ nom: 'X', ville: 'Annecy', telephone: '04' }, '<p>sans photo</p>'), false, 'jamais sans photos d’exemple');
  assert.equal(maquetteComplete({ nom: 'X', ville: 'Annecy' }, '/demo/img/'), false, 'jamais sans téléphone ni adresse');
});


test('Genève : la recherche passe par l’identifiant officiel suisse ; un commerçant genevois n’est jamais démarché par e-mail', async () => {
  const { GENEVE, villeSansCanton } = await import('../../agents/vitrines.js');
  assert.ok(GENEVE.includes('Carouge') && GENEVE.includes('Bernex'));
  assert.equal(villeSansCanton('Bernex (GE)'), 'Bernex');
  let corps = '';
  const r = await chercherOsm({ metier: 'boulangerie', ville: 'Bernex (GE)', departement: 'GE',
    fetch: async (u, o) => { corps = decodeURIComponent(String(o.body)); return rep({ elements: [{ type: 'node', id: 9, lat: 46.17, lon: 6.07, tags: { name: 'Boulangerie de Bernex', shop: 'bakery' } }] }); } });
  assert.match(corps, /"name"="Bernex"\]\["admin_level"="8"\]\["swisstopo:BFS_NUMMER"\]/);
  assert.deepEqual([r[0].ville, r[0].pays, r[0].departement], ['Bernex', 'CH', 'GE']);
  await brain.query("UPDATE vitrines SET statut = 'ecarte' WHERE statut = 'nouveau'");
  await brain.query(`INSERT INTO vitrines (id, source, source_id, nom, metier, ville, telephone, email, email_source, statut, pays, departement)
    VALUES (980, 'osm', 'osm:node/t980', 'Boulangerie de Carouge', 'boulangerie', 'Carouge', '+41 22 000 00 00', 'carouge.boulangerie@gmail.com', 'fiche OSM', 'nouveau', 'CH', 'GE')`);
  const fetch = async (url) => (String(url).includes('overpass') ? rep({ elements: [] }) : rep({ results: [] }));
  await passer({ brain, env: {}, fetch, resoudre: async () => [{ exchange: 'mx' }], combien: 3 });
  const { rows: [f] } = await brain.query('SELECT statut, motif FROM vitrines WHERE id = 980');
  assert.equal(f.statut, 'a_appeler'); assert.match(f.motif, /Suisse : par téléphone seulement/);
});
