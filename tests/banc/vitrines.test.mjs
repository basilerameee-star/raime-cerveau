// Les vitrines : un commerçant sans site (ou au site ancien) reçoit une maquette et un brouillon ; sans e-mail,
// il part tout de suite dans la liste d'appels ; un site récent est écarté ; rien n'est jamais envoyé.
import './outils.mjs';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../../agents/lib.js';
import { passer, jugerSite, emailsDans, adresseValide, emailPlausible, maquette, brouillon, chercherOsm, enseigne, PRIX, AGENDA,
  overpass, metierDe, localiser, chercherOsmVille, villes, preparer, villeSansCanton, METIERS } from '../../agents/vitrines.js';

const brain = db(); await brain.connect();
after(async () => { for (const t of ['vitrines', 'vitrines_recherches', 'vitrines_villes']) await brain.query(`DROP TABLE IF EXISTS ${t}`); await brain.end(); });

const rep = (corps, statut = 200, url) => ({ ok: statut < 400, status: statut, url, json: async () => corps, text: async () => corps });
const VIEUX = '<html><body><table width="700"><font>Bienvenue chez nous</font> contact : garage.dupont74@gmail.com © 2013</table></body></html>';
const NEUF = '<meta name="viewport" content="width=device-width"><footer>© 2026 Fleurs</footer>';
// L'API Géo : la liste des communes (avec leur code), ou une commune et son contour.
const CONTOUR = { type: 'Polygon', coordinates: [[[6.10, 45.88], [6.16, 45.88], [6.16, 45.93], [6.10, 45.93], [6.10, 45.88]]] };
const geo = (u) => (u.includes('nom=') ? rep([{ nom: 'Annecy', code: '74010', population: 130000, contour: CONTOUR }, { nom: 'Annecy-le-Vieux', code: '74011', population: 20000, contour: CONTOUR }])
  : rep([{ nom: 'Annecy', code: '74010', population: 130000, codeDepartement: '74' }, { nom: 'Lyon', code: '69123', population: 520000, codeDepartement: '69' }]));
// La question témoin du moteur de recherche (« mairie annecy ») : des résultats quand le moteur répond.
const temoin = (u) => decodeURIComponent(u).includes('mairie annecy');
const DNS_MORT = async () => { const e = new Error('getaddrinfo EAI_AGAIN'); e.code = 'EAI_AGAIN'; throw e; };
function internet() {
  const appels = [];
  const fetch = async (url, o = {}) => {
    const u = String(url); appels.push({ url: u, body: o.body, headers: o.headers });
    if (u.startsWith('https://geo.api.gouv.fr/communes')) return geo(u);
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

test('sans clé Google : OpenStreetMap, une requête pour toute la ville, par son contour, et la même recherche n’est jamais refaite', async () => {
  const { appels } = internet();
  const osm = async (url, o) => (String(url).includes('overpass') ? rep({ elements: [] }) : internet().fetch(url, o));
  await passer({ brain, env: {}, fetch: async (u, o) => { appels.push({ url: String(u), body: o && o.body }); return osm(u, o); }, resoudre });
  const requetes = appels.filter((a) => a.url.includes('overpass'));
  assert.equal(requetes.length, 1, 'une seule requête pour tous les métiers');
  const q = decodeURIComponent(String(requetes[0].body));
  assert.match(q, /poly:"45\.88000 6\.10000 45\.88000 6\.16000/, 'le contour officiel de la commune (lat lon)');
  assert.ok(!/area/.test(q), 'jamais par zone en France : le premier serveur n’a pas l’index des zones');
  assert.match(q, /"shop"~"\^\(bakery\|butcher/); assert.match(q, /"cuisine"~"pizza"/);
  assert.ok(appels.some((a) => /geo\.api\.gouv\.fr\/communes\?nom=Annecy&codeDepartement=74/.test(a.url)));
  const { rows } = await brain.query("SELECT count(*)::int AS n FROM vitrines_recherches WHERE metier = 'boulangerie' AND ville = 'Annecy'");
  assert.equal(rows[0].n, 2, 'une trace par source');
  const { rows: [tous] } = await brain.query("SELECT count(*)::int AS n FROM vitrines_recherches WHERE ville = 'Annecy' AND source = 'osm'");
  assert.equal(tous.n, METIERS.length, 'tous les métiers de la ville notés d’un coup');
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
    if (u.includes('searxng') && temoin(u)) return rep({ results: [{ url: 'https://www.annecy.fr/' }] }); // le moteur répond
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

test('OpenStreetMap : une enseigne (étiquette « brand ») n’est pas un commerçant à démarcher ; chaque fiche reçoit son métier', async () => {
  const f = async (u) => (String(u).includes('geo.api.gouv.fr') ? geo(String(u)) : rep({ elements: [
    { type: 'node', id: 1, tags: { name: 'Carrefour fleurs', shop: 'florist', brand: 'Carrefour' } },
    { type: 'node', id: 2, tags: { name: 'Monceau Fleurs', shop: 'florist', 'brand:wikidata': 'Q1' } },
    { type: 'node', id: 3, tags: { name: 'Les Fleurs de Léa', shop: 'florist', phone: '04 50 00 00 03' } },
    { type: 'node', id: 4, tags: { name: 'Da Marco', amenity: 'restaurant', cuisine: 'italian;pizza' } },
    { type: 'way', id: 5, center: { lat: 45.9, lon: 6.12 }, tags: { name: 'Le Bistrot', amenity: 'restaurant' } },
    { type: 'node', id: 6, tags: { name: 'Banque X', amenity: 'bank' } }] }));
  const r = await chercherOsm({ metier: 'fleuriste', ville: 'Annecy', departement: '74', fetch: f });
  assert.deepEqual(r.map((x) => x.nom), ['Les Fleurs de Léa']);
  const tous = await chercherOsmVille({ ville: 'Annecy', departement: '74', fetch: f });
  assert.deepEqual(tous.map((x) => [x.nom, x.metier]), [['Les Fleurs de Léa', 'fleuriste'], ['Da Marco', 'pizzeria'], ['Le Bistrot', 'restaurant']]);
  assert.deepEqual([tous[2].lat, tous[2].lon], [45.9, 6.12], 'le centre d’un bâtiment');
  assert.equal(metierDe({ amenity: 'restaurant', cuisine: 'italian;pizza' }), 'pizzeria');
  assert.equal(metierDe({ amenity: 'fast_food', cuisine: 'pizza' }), 'pizzeria');
  assert.equal(metierDe({ shop: 'bakery' }), 'boulangerie');
  assert.equal(metierDe({ craft: 'gardener' }), 'paysagiste');
  assert.equal(metierDe({ amenity: 'bank' }), null);
});

test('08/10/2026 : Overpass saturé, le serveur suivant ; tous en échec, une erreur (jamais une liste vide)', async () => {
  const appels = [], attentes = [];
  const serveurs = ['https://premier.test/api/interpreter', 'https://second.test/api/interpreter'];
  const f = async (u, o) => { appels.push(String(u)); assert.match(o.headers['User-Agent'], /^raime-cerveau\/1\.0 \(\+https:\/\/raime\.fr; contact@raime\.fr\)$/);
    return String(u).includes('premier') ? rep('trop occupé', 504) : rep({ elements: [{ type: 'node', id: 1 }] }); };
  const d = await overpass('[out:json];node(1);out;', { fetch: f, serveurs, attendre: async (ms) => attentes.push(ms) });
  assert.deepEqual(appels, [serveurs[0], serveurs[0], serveurs[1]], 'un seul nouvel essai, puis le serveur suivant');
  assert.deepEqual(attentes, [15000]);
  assert.equal(d.elements.length, 1);
  // une réponse 200 qui porte une erreur d’exécution n’est pas un résultat vide
  const lent = async (u) => (String(u).includes('premier') ? rep({ elements: [], remark: 'runtime error: Query timed out in "query" at line 1 after 26 seconds.' }) : rep({ elements: [{ type: 'node', id: 2 }] }));
  assert.equal((await overpass('x', { fetch: lent, serveurs, attendre: async () => {} })).elements[0].id, 2);
  const tous = async () => rep('', 429);
  await assert.rejects(overpass('x', { fetch: tous, serveurs, attendre: async () => {} }), /second\.test.*429/);
  // par défaut : le serveur français d’abord (frais, rapide), osm.ch d’abord pour la Suisse
  const { serveurs: liste, SERVEURS_SUISSE } = await import('../../agents/overpass.js');
  assert.match(liste({ env: {} })[0], /overpass\.openstreetmap\.fr/);
  assert.match(SERVEURS_SUISSE[0], /overpass\.osm\.ch/);
  assert.deepEqual(liste({ env: { OVERPASS_URLS: 'https://a.test/api/interpreter, https://b.test/api/interpreter' } }), ['https://a.test/api/interpreter', 'https://b.test/api/interpreter']);
});

test('08/10/2026 : Genève par la zone de la commune ; un serveur sans zones ne peut pas rendre « rien » en silence', async () => {
  const appels = [];
  const sansZone = async (u) => { appels.push(String(u)); return rep({ elements: [] }); };
  await assert.rejects(chercherOsmVille({ ville: 'Carouge (GE)', departement: 'GE', fetch: sansZone }), /zone de Carouge introuvable/);
  assert.equal(appels.length, 3, 'chaque serveur suisse essayé'); assert.match(appels[0], /overpass\.osm\.ch/);
  const avecZone = async () => rep({ elements: [{ type: 'area', id: 3601685459 }, { type: 'node', id: 9, lat: 46.18, lon: 6.14, tags: { name: 'Fromagerie de Carouge', shop: 'cheese' } }] });
  const r = await chercherOsmVille({ ville: 'Carouge (GE)', departement: 'GE', fetch: avecZone });
  assert.deepEqual(r.map((c) => [c.nom, c.metier, c.ville, c.pays]), [['Fromagerie de Carouge', 'fromagerie', 'Carouge', 'CH']]);
});

test('08/10/2026 : tous les serveurs Overpass en échec : rien n’est noté, la ville est reprise au passage suivant', async () => {
  await brain.query('UPDATE vitrines_villes SET echecs = 0, echec_le = NULL');
  const { rows: [avant] } = await brain.query('SELECT count(*)::int AS n FROM vitrines_recherches');
  const attentes = [];
  const panne = async (u) => (String(u).includes('geo.api.gouv.fr') ? geo(String(u)) : String(u).includes('overpass') ? rep('trop occupé', 504) : rep({ results: [] }));
  const b = await passer({ brain, env: {}, fetch: panne, resoudre, attendre: async (ms) => attentes.push(ms), combien: 0 });
  assert.match(b.decouverte, /504/);
  assert.equal(attentes.length, 3, 'un nouvel essai par serveur, attente simulée');
  const { rows: [apres] } = await brain.query('SELECT count(*)::int AS n FROM vitrines_recherches');
  assert.equal(apres.n, avant.n, 'aucune recherche notée');
  const { rows: [ville] } = await brain.query('SELECT nom, echecs FROM vitrines_villes WHERE echecs > 0 ORDER BY echec_le DESC LIMIT 1');
  assert.equal(ville.echecs, 1, 'l’échec est compté : trois d’affilée et la ville passe après les autres pour un jour');
  await brain.query('UPDATE vitrines_villes SET echecs = 0, echec_le = NULL');
});

test('08/10/2026 : des coordonnées connues suffisent, Overpass n’est pas redemandé', async () => {
  const appels = [];
  const f = async (u) => { appels.push(String(u)); return rep({ elements: [] }); };
  const r = await localiser({ source_id: 'osm:node/42', lat: 45.9, lon: 6.12, horaires: null }, f);
  assert.deepEqual(r, { lat: 45.9, lon: 6.12, horaires: null });
  assert.equal(appels.length, 0);
  await localiser({ source_id: 'osm:node/42', lat: null, lon: null }, f);
  assert.match(appels[0], /overpass\.openstreetmap\.fr/, 'sans coordonnées : par la liste des serveurs');
});

test('point 18, revu le 01/10/2026 : une enseigne va aux appels avec sa fiche, jamais en brouillon ni par e-mail ; un artisan qui porte un prénom est un commerçant', async () => {
  const oui = ['Paul', "PAUL - Gare d'Annecy", 'Boulangerie Paul', 'Brioche Dorée', 'Marie Blachère', 'Jean Louis David', 'Carrefour fleurs',
    'Coiff&Co', 'Monceau Fleurs', 'Speedy Annecy', 'La Mie Câline', 'Ange Annecy Centre'];
  const non = ['Boulangerie Paul Martin', 'Le Fournil de Paul', 'Chez Nicolas', 'Aux Délices de Louise', 'Techni Nails', 'Au Puits Savoyard'];
  for (const nom of oui) assert.ok(enseigne({ nom, ville: 'Annecy' }), `${nom} est une enseigne`);
  for (const nom of non) assert.equal(enseigne({ nom, ville: 'Annecy' }), null, `${nom} n’est pas une enseigne`);
  await brain.query("UPDATE vitrines SET statut = 'ecarte' WHERE statut = 'nouveau'");
  await brain.query(`INSERT INTO vitrines (id, source, source_id, nom, metier, ville, telephone, email, email_source, statut)
    VALUES (950, 'osm', 'osm:node/test950', 'Brioche Dorée', 'boulangerie', 'Annecy', '04 50 00 00 50', 'annecy@exemple-chaine.fr', 'fiche OSM', 'nouveau')`);
  // la ville suivante est genevoise : la réponse porte l’identifiant de sa zone
  await passer({ brain, env: {}, fetch: async (u) => (String(u).includes('overpass') ? rep({ elements: [{ type: 'area', id: 3600000001 }, { type: 'node', id: 7, tags: { name: 'Paul', shop: 'bakery' } }] }) : rep({ results: [] })),
    resoudre: async () => [{ exchange: 'mx' }], combien: 5 });
  const { rows } = await brain.query("SELECT statut, motif FROM vitrines WHERE id = 950");
  await brain.query(`INSERT INTO vitrines (id, source, source_id, nom, metier, ville, telephone, statut) VALUES (951, 'osm', 'osm:node/test951', 'Ange', 'boulangerie', 'Annecy', '04', 'a_appeler')`);
  await passer({ brain, env: {}, fetch: async (u) => rep(String(u).includes('overpass') ? { elements: [] } : { results: [] }), resoudre: async () => [], combien: 1 });
  assert.equal((await brain.query('SELECT statut FROM vitrines WHERE id = 951')).rows[0].statut, 'a_appeler', 'déjà dans les appels : elle y reste');
  assert.deepEqual(rows[0], { statut: 'a_appeler', motif: 'enseigne (brioche doree) : par téléphone seulement, jamais d’e-mail' });
  assert.equal((await brain.query("SELECT count(*)::int AS n FROM vitrines WHERE nom = 'Paul' AND source_id = 'osm:node/7'")).rows[0].n, 1, 'une enseigne découverte entre, pour les appels');
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
    : rep({ results: [], unresponsive_engines: [['bing', 'Suspended: too many requests'], ['yahoo', 'CAPTCHA'], ['mojeek', 'Suspended: access denied']] }));
  // moteur bloqué ET DNS en panne : aucun des deux contrôles ne peut se faire
  const b = await passer({ brain, env: {}, fetch, resoudre: async () => [{ exchange: 'mx' }], lookup: DNS_MORT, combien: 5 });
  assert.equal(b.reportes, 1);
  const f970 = (await brain.query('SELECT statut, motif, corps FROM vitrines WHERE id = 970')).rows[0];
  assert.equal(f970.statut, 'nouveau', 'rien d’affirmé : pas de brouillon « aucun site »');
  assert.match(f970.motif, /^reporté : moteur de recherche muet/); assert.equal(f970.corps, null);
  // 08/10/2026 : le moteur compte quand la question témoin rend des résultats (une source secondaire muette n’y change rien).
  const secondaire = async (url) => (String(url).includes('overpass') ? rep({ elements: [] }) : temoin(String(url)) ? rep({ results: [{ url: 'https://www.annecy.fr/' }] })
    : rep({ results: [], unresponsive_engines: [['mojeek', 'Suspended: access denied'], ['wikidata', 'Suspended: too many requests']] }));
  const b2 = await passer({ brain, env: {}, fetch: secondaire, resoudre: async () => [{ exchange: 'mx' }], lookup: DNS_MORT, combien: 5 });
  assert.equal(b2.reportes, 0);
  assert.notEqual((await brain.query('SELECT statut FROM vitrines WHERE id = 970')).rows[0].statut, 'nouveau');
});

test('08/10/2026 : moteur muet : le second contrôle (adresses tirées du nom) ; sans lui, la fiche est reportée, jamais déclarée sans site', async () => {
  const { domainesDuNom, preuveCommerce } = await import('../../agents/vitrines.js');
  assert.deepEqual(domainesDuNom({ nom: 'Boulangerie de la Gare', ville: 'Cluses' }).slice(0, 4),
    ['boulangeriedelagare.fr', 'boulangeriedelagare.com', 'boulangerie-gare.fr', 'boulangerie-gare.com']);
  assert.equal(preuveCommerce('<h1>Le Fournil Tardy</h1><p>12 rue X, 74300 Cluses</p>', { nom: 'Le Fournil Tardy', ville: 'Cluses' }), true);
  assert.equal(preuveCommerce('<h1>Fournil Tardy</h1><p>Lyon</p>', { nom: 'Le Fournil Tardy', ville: 'Cluses' }), false, 'la ville manque : un homonyme');
  await brain.query("UPDATE vitrines SET statut = 'ecarte' WHERE statut = 'nouveau'");
  await brain.query(`INSERT INTO vitrines (id, source, source_id, nom, metier, ville, telephone, email, email_source, statut, lat, lon) VALUES
    (1001, 'osm', 'osm:node/t1001', 'Le Fournil Tardy', 'boulangerie', 'Cluses', '04 50 00 10 01', 'fournil.tardy@gmail.com', 'fiche OSM', 'nouveau', 46.06, 6.58),
    (1002, 'osm', 'osm:node/t1002', 'Boucherie Gavard', 'boucherie', 'Cluses', '04 50 00 10 02', 'boucherie.gavard@gmail.com', 'fiche OSM', 'nouveau', 46.06, 6.58),
    (1003, 'osm', 'osm:node/t1003', 'Fleurs Mouchet', 'fleuriste', 'Cluses', '04 50 00 10 03', 'fleurs.mouchet@gmail.com', 'fiche OSM', 'nouveau', 46.06, 6.58)`);
  const muet = { results: [] }; // le moteur rend zéro résultat à tout, témoin compris
  const fetch = async (url) => {
    const u = String(url);
    if (u.includes('overpass')) return rep({ elements: [] });
    if (u.includes('searxng')) return rep(muet);
    if (u.startsWith('https://fournil-tardy.fr')) return rep(`<html><body><table width="600"><font>Le Fournil Tardy</font>, Cluses © 2014</table></body></html>`, 200, 'https://fournil-tardy.fr/');
    if (u.startsWith('https://fleursmouchet.fr') || u.startsWith('http://fleursmouchet.fr')) return rep('', 403, u);
    throw new Error('réseau coupé : ' + u);
  };
  const existe = new Set(['raime.fr', 'fournil-tardy.fr', 'fleursmouchet.fr']);
  const lookup = async (d) => { if (existe.has(d)) return { address: '192.0.2.1' }; const e = new Error('getaddrinfo ENOTFOUND'); e.code = 'ENOTFOUND'; throw e; };
  const b = await passer({ brain, env: {}, fetch, resoudre: async () => [{ exchange: 'mx' }], lookup, combien: 5 });
  const fiche = async (id) => (await brain.query('SELECT statut, site, site_etat, site_signaux, motif, corps FROM vitrines WHERE id = $1', [id])).rows[0];
  const tardy = await fiche(1001);
  assert.equal(tardy.site, 'https://fournil-tardy.fr/', 'son site, trouvé par son nom et prouvé par sa page');
  assert.equal(tardy.site_etat, 'ancien'); assert.match(tardy.corps, /votre site existe, mais il date un peu/);
  const gavard = await fiche(1002);
  assert.equal(gavard.statut, 'brouillon'); assert.equal(gavard.site_etat, 'aucun');
  assert.match(gavard.corps, /je n'ai pas trouvé de site à votre nom/, 'la phrase ne dit que ce qui a été vérifié');
  assert.ok(gavard.site_signaux.some((s) => /moteur de recherche muet/.test(s)));
  const mouchet = await fiche(1003);
  assert.equal(mouchet.statut, 'nouveau', 'une adresse à son nom existe mais ne se lit pas : rien n’est conclu');
  assert.match(mouchet.motif, /^reporté/); assert.equal(mouchet.corps, null);
  assert.equal(b.reportes, 1);
  // sans DNS ni moteur : reportée, pas écartée
  await brain.query("UPDATE vitrines SET statut = 'ecarte' WHERE statut = 'nouveau'");
  await brain.query(`INSERT INTO vitrines (id, source, source_id, nom, metier, ville, telephone, statut, lat, lon) VALUES
    (1004, 'osm', 'osm:node/t1004', 'Salon Bertholle', 'coiffeur', 'Cluses', '04 50 00 10 04', 'nouveau', 46.06, 6.58)`);
  const b2 = await passer({ brain, env: {}, fetch, resoudre: async () => [], lookup: DNS_MORT, combien: 5 });
  assert.equal(b2.reportes, 1); assert.equal(b2.ecartes, 0);
  assert.equal((await fiche(1004)).statut, 'nouveau');
});

test('la maquette v2 : la carte OpenStreetMap quand les coordonnées sont connues, crédit compris ; sinon le repère seul', async () => {
  const { maquettePremium, carte } = await import('../../agents/maquette_premium.js');
  const avec = maquettePremium({ nom: 'Le Fournil', metier: 'boulangerie', ville: 'Annecy', telephone: '04 50 00 00 01', lat: 45.8992, lon: 6.1294 }, { images: 'https://cockpit.raime.fr/demo/img' });
  assert.match(avec, /https:\/\/cockpit\.raime\.fr\/demo\/tuile\/16\/\d+\/\d+\.png/);
  assert.match(avec, /© OpenStreetMap/);
  assert.match(avec, /Commander/, 'le bouton d’action du métier');
  const sans = maquettePremium({ nom: 'Le Fournil', metier: 'boulangerie', ville: 'Annecy' }, {});
  assert.ok(!/demo\/tuile/.test(sans));
  const nulles = maquettePremium({ nom: 'Le Fournil', metier: 'boulangerie', ville: 'Annecy', lat: null, lon: null }, {});
  assert.ok(!/demo\/tuile/.test(nulles), 'coordonnées absentes : pas de carte du point 0,0');
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
    fetch: async (u, o) => { corps = decodeURIComponent(String(o.body)); return rep({ elements: [{ type: 'area', id: 3600000002 }, { type: 'node', id: 9, lat: 46.17, lon: 6.07, tags: { name: 'Boulangerie de Bernex', shop: 'bakery' } }] }); } });
  assert.match(corps, /"name"="Bernex"\]\["admin_level"="8"\]\["swisstopo:BFS_NUMMER"\]/);
  assert.match(corps, /"name"="Bernex \(GE\)"\]/, 'le nom que porte la commune dans OSM quand un homonyme suisse existe (Corsier)');
  assert.match(corps, /\.a out ids;/, 'la zone est rendue : sans elle, la réponse est refusée');
  assert.deepEqual([r[0].ville, r[0].pays, r[0].departement], ['Bernex', 'CH', 'GE']);
  await brain.query("UPDATE vitrines SET statut = 'ecarte' WHERE statut = 'nouveau'");
  await brain.query(`INSERT INTO vitrines (id, source, source_id, nom, metier, ville, telephone, email, email_source, statut, pays, departement)
    VALUES (980, 'osm', 'osm:node/t980', 'Boulangerie de Carouge', 'boulangerie', 'Carouge', '+41 22 000 00 00', 'carouge.boulangerie@gmail.com', 'fiche OSM', 'nouveau', 'CH', 'GE')`);
  const fetch = async (url) => (String(url).includes('overpass') ? rep({ elements: [] }) : rep({ results: temoin(String(url)) ? [{ url: 'https://www.annecy.fr/' }] : [] }));
  await passer({ brain, env: {}, fetch, resoudre: async () => [{ exchange: 'mx' }], combien: 3 });
  const { rows: [f] } = await brain.query('SELECT statut, motif FROM vitrines WHERE id = 980');
  assert.equal(f.statut, 'a_appeler'); assert.match(f.motif, /Suisse : par téléphone seulement/);
});

test('01/10/2026 : un annuaire ou la page d’un réseau n’est pas le site du commerce ; le brouillon le dit, sans rien inventer', async () => {
  const { siteASonNom } = await import('../../agents/vitrines.js');
  const v = (nom) => ({ nom, ville: 'Annecy', metier: 'garage automobile' });
  assert.equal(siteASonNom('https://www.idgarages.com', v('Garage C.L. AUTO')), false);
  assert.equal(siteASonNom('https://reseau.citroen.fr/reparateur-annecy-1', v('Garage Perret - Citroën')), false);
  assert.equal(siteASonNom('https://boulangeries.nosavis.com', v('Boulangerie des Haras')), false);
  assert.equal(siteASonNom('https://tif.hair/', v("Nouvel'hair")), false);
  assert.equal(siteASonNom('https://www.garagemouthon.com/', v('Garage Mouthon - Peugeot')), true);
  assert.equal(siteASonNom('https://garage-rnp.fr/', v('RNP')), true);
  assert.equal(siteASonNom('https://mobilite.jeanlain.com/concessions/x/', v('Jean Lain Carrosserie')), true, 'les mots collés');
  const { pageDeReseau } = await import('../../agents/vitrines.js');
  assert.equal(pageDeReseau('https://www.franckprovost.com/salons/18-boulevard', v('Adapt Hair Concept')), true);
  assert.equal(pageDeReseau('https://www.idgarages.com/', v('Garage C.L. AUTO')), false, 'un annuaire n’est pas un réseau');
  assert.equal(siteASonNom('https://www.maison-chevallier.fr/', v('Boulangerie Chevallier')), true);
  assert.equal(siteASonNom('https://www.boulangeriedelagare.fr/', v('Boulangerie de la Gare')), true, 'que des mots du métier : rien n’est affirmé');
  const b = brouillon({ nom: 'Garage C.L. AUTO', metier: 'garage automobile', ville: 'Annecy', source: 'google', site: 'https://www.idgarages.com/', site_etat: 'aucun' }, 'https://x/demo/y');
  assert.match(b.corps, /sur Google, votre fiche renvoie vers idgarages\.com, pas vers un site à votre nom/);
});

test('01/10/2026 : une fiche sans téléphone ni e-mail cherche son numéro sur le web ; sans rien, elle sort de la file', async () => {
  const { telephonesDans } = await import('../../agents/vitrines.js');
  assert.deepEqual(telephonesDans('Tél. : 04.50.45.12.34 ou +33 6 12 34 56 78 ; annuaire 0892 68 01 02'), ['04 50 45 12 34', '06 12 34 56 78']);
  await brain.query("UPDATE vitrines SET statut = 'ecarte' WHERE statut = 'nouveau'");
  await brain.query(`INSERT INTO vitrines (id, source, source_id, nom, metier, ville, statut) VALUES
    (990, 'osm', 'osm:node/t990', 'Le Fournil de Marcelin', 'boulangerie', 'Annecy', 'nouveau'),
    (991, 'osm', 'osm:node/t991', 'Salon Introuvable', 'coiffeur', 'Annecy', 'nouveau')`);
  const fetch = async (url) => {
    const u = decodeURIComponent(String(url));
    if (u.includes('overpass')) return rep({ elements: [] });
    if (u.includes('Marcelin') && u.includes('téléphone')) return rep({ results: [
      { url: 'https://annuaire.test/a', title: 'Le Fournil de Marcelin - Annecy', content: 'Boulangerie. Tél 04 50 11 22 33' },
      { url: 'https://autre.test/b', title: 'Fournil de Marcelin', content: 'Appelez le 04.50.11.22.33' },
      { url: 'https://hors-sujet.test/c', title: 'Une autre boulangerie', content: '04 50 99 99 99' }] });
    return rep({ results: [{ url: 'https://x.test', title: 'rien', content: 'rien' }] });
  };
  await passer({ brain, env: {}, fetch, resoudre: async () => [], combien: 5 });
  const { rows } = await brain.query('SELECT id, statut, telephone, motif FROM vitrines WHERE id IN (990, 991) ORDER BY id');
  assert.deepEqual([rows[0].statut, rows[0].telephone], ['a_appeler', '04 50 11 22 33']);
  assert.deepEqual([rows[1].statut, rows[1].motif], ['ecarte', 'ni téléphone ni e-mail trouvés']);
});

test('héros v3 (07/10/2026) : plein écran, nom en serif, polices hébergées par le Cockpit, rien d’inventé ; v2 inchangée', async () => {
  const { maquettePremium } = await import('../../agents/maquette_premium.js');
  const v = { nom: 'Bulle de beauté', metier: 'institut de beauté', ville: 'Annecy', adresse: '3 rue X, Annecy', telephone: '04 50 00 00 00' };
  const h = maquettePremium({ ...v, horaires: ['Lun. au ven. : 9 h–19 h'] }, { images: 'https://cockpit.raime.fr/demo/img', v3: true });
  assert.match(h, /<header class="hero">/);
  assert.match(h, /https:\/\/cockpit\.raime\.fr\/demo\/police\/InstrumentSerif-Regular\.woff2/);
  assert.ok(!/fonts\.googleapis|gstatic/.test(h), 'aucun appel à Google');
  assert.match(h, /<dt>Horaires<\/dt>/);
  assert.match(h, /Prendre rendez-vous/);
  const sansHoraires = maquettePremium(v, { images: 'https://cockpit.raime.fr/demo/img', v3: true });
  const heros = sansHoraires.slice(sansHoraires.indexOf('<header class="hero">'), sansHoraires.indexOf('</header>'));
  assert.ok(heros.length > 100 && !/<dt>Horaires<\/dt>/.test(heros), 'horaires inconnus : pas d’horaires inventés dans le héros');
  const v2 = maquettePremium(v, { images: 'https://cockpit.raime.fr/demo/img' });
  assert.ok(!/class="hero"/.test(v2) && /class="w intro"/.test(v2), 'la maquette en ligne ne change pas avant validation');
});

test('les polices des maquettes : servies avec CORS ouvert ; un nom inattendu est refusé', async () => {
  const { createRequire } = await import('node:module');
  const vitrines = createRequire(import.meta.url)('../../jarvis/vitrines.cjs');
  const { PassThrough } = await import('node:stream');
  const reponse = () => { const r = new PassThrough(); r.resume(); r.writeHead = (c, e) => { r.code = c; r.entetes = e; }; return r; };
  const ok = reponse(); vitrines.servirPolice('InstrumentSerif-Regular.woff2', ok);
  assert.equal(ok.code, 200); assert.equal(ok.entetes['Access-Control-Allow-Origin'], '*'); assert.equal(ok.entetes['Content-Type'], 'font/woff2');
  const ko = reponse(); vitrines.servirPolice('../../coffre.woff2', ko);
  assert.equal(ko.code, 404);
});

test('08/10/2026 : les communes homonymes ne sont plus perdues ; la reprise d’une ancienne liste se fait une fois', async () => {
  // l’ancienne table : le nom pour clé, sans code (les homonymes y avaient été écartés)
  await brain.query('DROP TABLE IF EXISTS vitrines_villes');
  await brain.query('CREATE TABLE vitrines_villes (nom text PRIMARY KEY, departement text, population int, rang int)');
  await brain.query(`INSERT INTO vitrines_villes VALUES ('Annecy', '74', 130000, 0), ('Valence', '26', 64000, 1), ('Ancienne-Commune', '74', 3000, 2), ('Bernex (GE)', 'GE', NULL, 0)`);
  await preparer(brain);
  await preparer(brain); // rejouable
  const appels = [];
  const f = async (u) => { appels.push(String(u)); return rep([
    { nom: 'Annecy', code: '74010', population: 130000, codeDepartement: '74' },
    { nom: 'Valence', code: '26362', population: 64000, codeDepartement: '26' },
    { nom: 'Valence', code: '82186', population: 5000, codeDepartement: '82' },
    { nom: 'Bernex', code: '74033', population: 1500, codeDepartement: '74' }]); };
  await villes(brain, f);
  const { rows } = await brain.query('SELECT nom, departement, code FROM vitrines_villes ORDER BY nom');
  assert.deepEqual(rows.map((r) => [r.nom, r.departement, r.code]), [['Ancienne-Commune', '74', ''], ['Annecy', '74', '74010'],
    ['Bernex (GE)', 'GE', null], ['Valence', '26', '26362'], ['Valence (82)', '82', '82186']]);
  await villes(brain, f);
  assert.equal(appels.length, 1, 'une seule reprise de la liste officielle');
  assert.equal(villeSansCanton('Valence (82)'), 'Valence'); assert.equal(villeSansCanton('Bernex (GE)'), 'Bernex'); assert.equal(villeSansCanton('Annecy'), 'Annecy');
  // la recherche de « Valence (82) » vise la commune exacte, par son code
  const vus = [];
  const g = async (u, o) => { vus.push([String(u), o && o.body]); return String(u).includes('geo.api') ? rep([
    { nom: 'Valence', code: '26362', population: 64000, contour: CONTOUR },
    { nom: 'Valence', code: '82186', population: 5000, contour: { type: 'MultiPolygon', coordinates: [[[[0.89, 44.1], [0.9, 44.1], [0.9, 44.11], [0.89, 44.1]]], [[[0.95, 44.2], [0.96, 44.2], [0.96, 44.21], [0.95, 44.2]]]] } }]) : rep({ elements: [] }); };
  await chercherOsmVille({ ville: 'Valence (82)', departement: '82', code: '82186', fetch: g });
  assert.match(vus[0][0], /nom=Valence&codeDepartement=82/);
  const q = decodeURIComponent(String(vus[1][1]));
  assert.match(q, /poly:"44\.10000 0\.89000/); assert.match(q, /poly:"44\.20000 0\.95000/, 'chaque morceau de la commune'); assert.ok(!/45\.88/.test(q));
});
