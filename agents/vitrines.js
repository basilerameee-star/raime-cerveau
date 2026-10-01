// LES VITRINES — les commerçants sans site, ou au site ancien : une maquette déjà prête, un e-mail, puis l'appel.
//
// Basile, 30/09/2026 : « un agent qui fouille constamment, partout en France, chez tous les commerçants
// enregistrés sur Google qui n'ont pas de site web… un email très simple… si ce n'est pas le cas, au bout d'une
// semaine, mon interface me dit d'appeler ce numéro-là ». Et : « s'il y en a un qui soit très vieux, plus du tout
// sexy » ; « prépare une maquette du site et mets-la dans l'e-mail » ; le site : 500 €, gratuit s'il ne plaît pas.
//
// Tout est du code, aucun modèle :
//   1. DÉCOUVRIR : Google Places (clé GOOGLE_PLACES_API_KEY, quota gratuit mensuel respecté) par métier × ville,
//      la Haute-Savoie d'abord puis toute la France ; sans clé, OpenStreetMap (plus pauvre en numéros).
//   2. QUALIFIER : aucun site, ou un site ancien (sans HTTPS, pas fait pour le téléphone, copyright ancien…).
//   3. E-MAIL : la fiche OSM, les pages du site, puis la recherche web du serveur ; l'adresse doit avoir un MX.
//   4. MAQUETTE : une page à son nom, servie par le Cockpit (/demo/<slug>), marquée « démonstration ».
//   5. BROUILLON : le texte de Basile ; RIEN ne part d'ici.
//   6. ENVOI : un brouillon que Basile valide passe dans la file du workflow n8n « Vitrines · Envoi »
//      (n8n/vitrines_envoi.json, la clé Resend reste dans n8n) ; synchroniser() en rapporte l'issue, les réponses et les « stop ».
//   7. APPEL : sans e-mail, tout de suite dans la liste d'appels ; avec, dès sa réponse ou sept jours après l'envoi (jarvis/appels.cjs).
// Conditions de Google : les données d'un lieu écarté sont effacées au bout de 30 jours (seul son identifiant reste).
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import { maquettePremium, maquetteComplete } from './maquette_premium.js';

export const PRIX = Number(process.env.VITRINE_PRIX || 500);
export const AGENDA = process.env.VITRINE_AGENDA || 'https://calendar.app.google/HdhqAt3BaQFWfx2g7'; // le lien de raime.fr
export const ADRESSE_DEMO = process.env.VITRINE_ADRESSE || 'https://cockpit.raime.fr';
const PLACES_MOIS = Number(process.env.VITRINES_PLACES_MOIS || 900); // recherches Google par mois, sous le quota gratuit
const RECHERCHE = process.env.RECHERCHE_URL || 'http://searxng:8080';
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; rAIme-vitrines/1.0; +https://raime.fr)' };

export const METIERS = ['boulangerie', 'boucherie', 'fleuriste', 'coiffeur', 'institut de beauté', 'garage automobile', 'plombier',
  'électricien', 'serrurier', 'menuisier', 'restaurant', 'pizzeria', 'pressing', 'cordonnier', 'fromagerie', 'caviste',
  'toiletteur', 'photographe', 'peintre en bâtiment', 'paysagiste'];
// La Haute-Savoie de Basile d'abord, puis les départements voisins dans cet ordre, puis la France par taille de ville.
const REGION = ['74', 'GE', '01', '73', '38'];
// Le canton de Genève (Basile, 01/10/2026 : « la Suisse, Genève et les environs, Carouge… et la frontière France »).
// Les communes y sont notées « Nom (GE) » : Bernex existe aussi en Haute-Savoie. En Suisse, la loi contre la concurrence
// déloyale (LCD, art. 3 al. 1 let. o) interdit la publicité de masse par e-mail sans accord : par téléphone seulement.
export const GENEVE = ['Genève', 'Vernier', 'Lancy', 'Meyrin', 'Carouge', 'Onex', 'Thônex', 'Versoix', 'Le Grand-Saconnex', 'Chêne-Bougeries',
  'Plan-les-Ouates', 'Bernex', 'Veyrier', 'Chêne-Bourg', 'Collonge-Bellerive', 'Bellevue', 'Pregny-Chambésy', 'Satigny', 'Cologny', 'Confignon',
  'Vandœuvres', 'Puplinge', 'Troinex', 'Bardonnex', 'Perly-Certoux', 'Genthod', 'Collex-Bossy', 'Meinier', 'Anières', 'Corsier', 'Hermance',
  'Choulex', 'Presinge', 'Jussy', 'Gy', 'Avully', 'Avusy', 'Cartigny', 'Chancy', 'Aire-la-Ville', 'Russin', 'Dardagny', 'Soral', 'Laconnex', 'Céligny'];
export const villeSansCanton = (v) => String(v || '').replace(/ \(GE\)$/, '');
// Une page de réseau social ou une fiche d'annuaire n'est pas un site à soi : ce commerçant-là est la cible.
const RESEAUX = /(^|\.)(facebook|fb|instagram|linktr|pagesjaunes|tripadvisor|yelp|justacote|mappy|123fleurs|interflora|aquarelle|leboncoin|planity|treatwell|doctolib|ubereats|deliveroo|lafourchette|thefork|google)\./i;
export function plateformeDe(site) {
  let h = ''; try { h = new URL(site).hostname.toLowerCase(); } catch { return null; }
  if (!RESEAUX.test(h) || /^sites\.google\./.test(h)) return null;
  return /facebook|fb\./.test(h) ? 'une page Facebook' : /instagram/.test(h) ? 'une page Instagram' : "une fiche d'annuaire";
}
const ANNUAIRES = /(pagesjaunes|facebook|instagram|google|tripadvisor|yelp|societe\.com|pappers|infogreffe|linkedin|mappy|justacote|118712|annuaire|kompass|verif\.com|manageo|youtube|tiktok|wikipedia|leboncoin|doctolib|planity|treatwell|ubereats|deliveroo|lafourchette|thefork)/i;

export async function preparer(brain) {
  await brain.query(`CREATE TABLE IF NOT EXISTS vitrines (
    id serial PRIMARY KEY, source text NOT NULL, source_id text UNIQUE NOT NULL, nom text, metier text, adresse text, ville text,
    telephone text, carte text, site text, site_etat text, site_signaux text[], email text, email_source text, slug text UNIQUE,
    demo_html text, sujet text, corps text, statut text NOT NULL DEFAULT 'nouveau', motif text, envoye_le timestamptz, note text,
    cree_le timestamptz NOT NULL DEFAULT now(), maj_le timestamptz NOT NULL DEFAULT now())`);
  await brain.query(`CREATE TABLE IF NOT EXISTS vitrines_recherches (metier text NOT NULL, ville text NOT NULL, source text NOT NULL,
    trouves int, fait_le timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (metier, ville, source))`);
  await brain.query(`CREATE TABLE IF NOT EXISTS vitrines_villes (nom text PRIMARY KEY, departement text, population int, rang int)`);
  // La maquette premium (point 16) : l'ordre confié à Hermes, et le jour où Basile l'a publiée à la place de la simple.
  await brain.query('ALTER TABLE vitrines ADD COLUMN IF NOT EXISTS premium_commande int, ADD COLUMN IF NOT EXISTS premium_le timestamptz, ADD COLUMN IF NOT EXISTS demo_simple text')
  await brain.query('ALTER TABLE vitrines ADD COLUMN IF NOT EXISTS lat double precision, ADD COLUMN IF NOT EXISTS lon double precision, ADD COLUMN IF NOT EXISTS maquette_v int, ADD COLUMN IF NOT EXISTS horaires text, ADD COLUMN IF NOT EXISTS pays text, ADD COLUMN IF NOT EXISTS departement text')
  // Les fiches d'avant le 01/10/2026 : leur département, retrouvé par leur ville (France).
  await brain.query(`UPDATE vitrines v SET departement = vv.departement, pays = coalesce(v.pays, 'FR') FROM vitrines_villes vv
    WHERE v.departement IS NULL AND vv.nom = v.ville`).catch(() => {});;
}

const lireJson = async (f, url, o = {}) => { const r = await f(url, { ...o, signal: AbortSignal.timeout(o.delai || 30000) }); if (!r.ok) throw new Error(`${url.split('?')[0]} : ${r.status}`); return r.json(); };
const texte = async (f, url, delai = 10000) => {
  const r = await f(url, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(delai) });
  return { ok: r.ok, statut: r.status, url: r.url || url, html: r.ok ? String(await r.text()).slice(0, 400_000) : '' };
};

// ── 1. DÉCOUVRIR ─────────────────────────────────────────────────────────────
// Les villes, une fois : la région de Basile d'abord, puis la France par population (API Géo de l'État, sans clé).
async function villes(brain, f) {
  const { rows: [ge] } = await brain.query("SELECT count(*)::int AS n FROM vitrines_villes WHERE departement = 'GE'");
  if (!ge.n) {
    const v = [], p = [];
    GENEVE.forEach((nom, i) => { v.push(`($${i * 2 + 1}, 'GE', NULL, $${i * 2 + 2})`); p.push(`${nom} (GE)`, i); });
    await brain.query(`INSERT INTO vitrines_villes (nom, departement, population, rang) VALUES ${v.join(',')} ON CONFLICT DO NOTHING`, p);
  }
  const { rows } = await brain.query("SELECT count(*)::int AS n FROM vitrines_villes WHERE departement <> 'GE'");
  if (rows[0].n) return;
  const toutes = await lireJson(f, 'https://geo.api.gouv.fr/communes?fields=nom,population,codeDepartement&format=json', { delai: 60000 });
  const retenues = toutes.filter((c) => (c.population || 0) >= 2000)
    .sort((a, b) => (REGION.includes(b.codeDepartement) - REGION.includes(a.codeDepartement)) || (b.population - a.population));
  for (let i = 0; i < retenues.length; i += 500) {
    const lot = retenues.slice(i, i + 500), v = [], p = [];
    lot.forEach((c, j) => { v.push(`($${j * 4 + 1},$${j * 4 + 2},$${j * 4 + 3},$${j * 4 + 4})`); p.push(c.nom, c.codeDepartement, c.population, i + j); });
    await brain.query(`INSERT INTO vitrines_villes (nom, departement, population, rang) VALUES ${v.join(',')} ON CONFLICT DO NOTHING`, p);
  }
}

// La prochaine recherche à faire : la ville la mieux classée où un métier n'a pas encore été cherché.
async function prochaine(brain, source) {
  const { rows } = await brain.query(`SELECT v.nom AS ville, v.departement, m.metier FROM vitrines_villes v CROSS JOIN unnest($1::text[]) WITH ORDINALITY m(metier, o)
    WHERE NOT EXISTS (SELECT 1 FROM vitrines_recherches r WHERE r.ville = v.nom AND r.metier = m.metier AND r.source = $2)
    ORDER BY array_position($3::text[], v.departement) NULLS LAST, v.population DESC NULLS LAST, v.rang, m.o LIMIT 1`, [METIERS, source, REGION]);
  return rows[0] || null;
}

export async function chercherPlaces({ cle, metier, ville, departement, fetch: f = globalThis.fetch }) {
  const suisse = departement === 'GE', nom = villeSansCanton(ville);
  const d = await lireJson(f, 'https://places.googleapis.com/v1/places:searchText', { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': cle,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.businessStatus,places.googleMapsUri,places.location' },
    body: JSON.stringify({ textQuery: `${metier} ${nom}`, languageCode: 'fr', regionCode: suisse ? 'CH' : 'FR', pageSize: 20 }) });
  return (d.places || []).filter((p) => !p.businessStatus || p.businessStatus === 'OPERATIONAL').map((p) => ({
    source: 'google', source_id: `google:${p.id}`, nom: p.displayName && p.displayName.text, metier, ville: nom, pays: suisse ? 'CH' : 'FR', departement: departement || null, adresse: p.formattedAddress || null,
    telephone: p.nationalPhoneNumber || null, site: p.websiteUri || null, carte: p.googleMapsUri || null, email: null,
    lat: p.location ? p.location.latitude : null, lon: p.location ? p.location.longitude : null }));
}

export async function chercherOsm({ metier, ville, departement, fetch: f = globalThis.fetch }) {
  const suisse = departement === 'GE', nom = villeSansCanton(ville);
  const tag = { boulangerie: 'shop=bakery', boucherie: 'shop=butcher', fleuriste: 'shop=florist', coiffeur: 'shop=hairdresser',
    'institut de beauté': 'shop=beauty', 'garage automobile': 'shop=car_repair', plombier: 'craft=plumber', électricien: 'craft=electrician',
    serrurier: 'craft=locksmith', menuisier: 'craft=carpenter', restaurant: 'amenity=restaurant', pizzeria: 'cuisine=pizza',
    pressing: 'shop=dry_cleaning', cordonnier: 'craft=shoemaker', fromagerie: 'shop=cheese', caviste: 'shop=wine', toiletteur: 'shop=pet_grooming',
    photographe: 'craft=photographer', 'peintre en bâtiment': 'craft=painter', paysagiste: 'craft=gardener' }[metier];
  if (!tag) return [];
  const [k, v] = tag.split('=');
  // L'identifiant officiel de la commune départage les homonymes (Bernex en France et à Genève).
  const officiel = suisse ? '["swisstopo:BFS_NUMMER"]' : '["ref:INSEE"]';
  const q = `[out:json][timeout:40];area["name"="${nom.replace(/"/g, '')}"]["admin_level"="8"]${officiel}->.a;nwr(area.a)["${k}"="${v}"]["name"];out tags center 60;`;
  const d = await lireJson(f, 'https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(q),
    // Overpass refuse (406) une signature de navigateur : il veut celle d'un programme (constaté le 30/09/2026).
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'raime-cerveau/1.0 (+https://raime.fr)' }, delai: 60000 });
  // Une enseigne (étiquette « brand » : Carrefour, Jean Louis David…) a son site national : ce n'est pas la cible.
  return (d.elements || []).filter((e) => !(e.tags || {}).brand && !(e.tags || {})['brand:wikidata']).map((e) => { const t = e.tags || {}; return {
    source: 'osm', source_id: `osm:${e.type}/${e.id}`, nom: t.name, metier, ville: nom, pays: suisse ? 'CH' : 'FR', departement: departement || null,
    adresse: [t['addr:housenumber'], t['addr:street'], t['addr:postcode'], t['addr:city']].filter(Boolean).join(' ') || null,
    telephone: t.phone || t['contact:phone'] || null, site: t.website || t['contact:website'] || null, carte: null,
    email: t.email || t['contact:email'] || null, lat: e.lat ?? (e.center && e.center.lat) ?? null, lon: e.lon ?? (e.center && e.center.lon) ?? null, horaires: t.opening_hours || null }; });
}

async function decouvrir(brain, { env, fetch: f }) {
  await villes(brain, f);
  const cle = env.GOOGLE_PLACES_API_KEY;
  let source = 'osm';
  if (cle) {
    const { rows } = await brain.query(`SELECT count(*)::int AS n FROM vitrines_recherches WHERE source = 'google' AND fait_le >= date_trunc('month', now())`);
    if (rows[0].n < PLACES_MOIS) source = 'google';
  }
  const p = await prochaine(brain, source);
  if (!p) return 0;
  const trouves = source === 'google' ? await chercherPlaces({ cle, ...p, fetch: f }) : await chercherOsm({ ...p, fetch: f });
  let neufs = 0;
  for (const c of trouves) {
    if (!c.nom || enseigne(c)) continue;
    const r = await brain.query(`INSERT INTO vitrines (source, source_id, nom, metier, adresse, ville, telephone, carte, site, email, email_source, lat, lon, horaires, pays, departement)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) ON CONFLICT (source_id) DO NOTHING RETURNING id`,
    [c.source, c.source_id, c.nom, c.metier, c.adresse, c.ville, c.telephone, c.carte, c.site, c.email, c.email ? 'fiche OSM' : null, c.lat ?? null, c.lon ?? null,
      c.horaires ?? null, c.pays || 'FR', c.departement || p.departement || null]);
    neufs += r.rowCount;
  }
  await brain.query(`INSERT INTO vitrines_recherches (metier, ville, source, trouves) VALUES ($1,$2,$3,$4)
    ON CONFLICT (metier, ville, source) DO UPDATE SET trouves = EXCLUDED.trouves, fait_le = now()`, [p.metier, p.ville, source, trouves.length]);
  return neufs;
}

// ── 2. QUALIFIER : un site ancien, « plus du tout sexy » ─────────────────────
// Un site se lit à l'adresse donnée, sinon à sa racine : une fiche peut pointer vers une page supprimée d'un site
// bien vivant (01/10/2026 : la fiche d'une boulangerie menait à une page 404 d'un site récent, lu comme « aucun site »).
export const normaliserSite = (s) => (s && !/^https?:\/\//i.test(String(s).trim()) ? `https://${String(s).trim().replace(/^\/+/, '')}` : s);
export async function lireSite(f, site) {
  site = normaliserSite(site);
  const essais = [site];
  try { const racine = `${new URL(site).origin}/`; if (racine !== site) essais.push(racine); } catch { return { ok: false, statut: 404, url: site }; }
  let dernier = null;
  for (const u of essais) {
    try { const p = await texte(f, u); if (p.ok) return p; dernier = p; } catch (e) {
      dernier = { ok: false, statut: 0, url: u, erreur: String(e?.cause?.code || e?.code || e?.name || e?.message || 'erreur') };
    }
  }
  return dernier;
}

// aucun : pas de site ; mort : introuvable (404, 410, domaine inexistant) ; illisible : il répond mal (blocage, panne,
// délai) : rien ne peut en être affirmé, la vitrine est écartée ; ancien ou récent : d'après ses signes.
export function jugerSite(page, anneeCourante = new Date().getFullYear()) {
  if (!page) return { etat: 'aucun', signaux: [] };
  if (!page.ok) {
    const mort = [404, 410].includes(page.statut) || /ENOTFOUND/.test(page.erreur || '');
    return mort ? { etat: 'mort', signaux: ['site hors ligne'] } : { etat: 'illisible', signaux: [`site illisible (${page.statut || page.erreur || 'sans réponse'})`] };
  }
  const h = page.html, signaux = [];
  if (/^http:\/\//i.test(page.url)) signaux.push('sans HTTPS');
  if (!/<meta[^>]+name=["']?viewport/i.test(h)) signaux.push('pas fait pour le téléphone');
  const annees = [...h.matchAll(/(?:©|&copy;|copyright)\s*(?:[^<\d]{0,20})?((?:19|20)\d{2})(?:\s*[-–]\s*((?:19|20)\d{2}))?/gi)]
    .map((m) => Number(m[2] || m[1]));
  if (annees.length && Math.max(...annees) <= anneeCourante - 3) signaux.push(`copyright ${Math.max(...annees)}`);
  if (/<frameset|<marquee|\.swf\b|<font\b|<table[^>]+(width|bgcolor)=/i.test(h)) signaux.push('technique ancienne');
  return { etat: signaux.length >= 2 ? 'ancien' : 'recent', signaux };
}

// Un site propre trouvé par la recherche web (pas un annuaire), quand la fiche n'en donne pas ou que le sien est mort.
// Le nom du commerce doit se lire dans l'adresse du site (mots d'au moins 3 lettres, hors métier, ville et petits mots) :
// le 01/10/2026, « RNP » (3 lettres) était ignoré et garage-rnp.fr, premier résultat, passait inaperçu.
export function motsDuNom(v) {
  const ville = new Set(sansAccents(v.ville).split(/[^a-z0-9]+/));
  return sansAccents(v.nom).split(/[^a-z0-9]+/).filter((m) => m.length >= 3 && !GENERIQUES.has(m) && !ville.has(m) && !LIEUX.has(m));
}
export function siteDuCommerce(resultats, v) {
  const mots = motsDuNom(v);
  if (!mots.length) return null;
  const r = (resultats || []).find((x) => {
    try {
      const h = new URL(x.url).hostname.toLowerCase();
      if (ANNUAIRES.test(h) || plateformeDe(x.url)) return false;
      const parts = h.replace(/^www\./, '').split(/[^a-z0-9]+/);
      // un mot court (moins de 5 lettres) doit être un morceau entier de l'adresse (garage-rnp) ; un long peut y être collé
      const entier = sansAccents(v.nom).replace(/[^a-z0-9]/g, ''); // « Garage du Lac » → garagedulac
      return mots.some((m) => (m.length >= 5 ? parts.some((p) => p.includes(m)) : parts.includes(m)))
        || (entier.length >= 6 && parts.some((p) => p.includes(entier)));
    } catch { return false; }
  });
  return r ? new URL(r.url).origin + '/' : null;
}
// Rend { site, fiable } : fiable est faux quand le moteur n'a rien pu chercher (moteurs suspendus, captcha, panne) :
// le 01/10/2026, des recherches vides par blocage ont fait écrire « aucun site » à un garage qui en avait un.
async function siteParRecherche(v, f) {
  let fiable = false;
  for (const q of [`"${v.nom}" ${v.metier || ''} ${v.ville}`, `"${v.nom}" ${v.ville}`]) {
    try {
      const d = await lireJson(f, `${RECHERCHE}/search?q=${encodeURIComponent(q.replace(/\s+/g, ' ').trim())}&format=json`, { delai: 20000 });
      if ((d.results || []).length || !(d.unresponsive_engines || []).length) fiable = true;
      const s = siteDuCommerce(d.results, v);
      if (s) return { site: s, fiable: true };
    } catch { /* la recherche suivante */ }
  }
  return { site: null, fiable };
}

// ── 3. E-MAIL ─────────────────────────────────────────────────────────────────
const RE_EMAIL = /[a-z0-9][a-z0-9._%+-]{0,63}@[a-z0-9.-]+\.[a-z]{2,}/gi;
const EXCLUS = /(example\.|sentry|wixpress|noreply|no-reply|pagesjaunes|solocal|\.png$|\.jpe?g$|\.gif$|\.webp$|domain\.|email\.com$|votre|yourname)/i;
export function emailsDans(texte, v) {
  const mots = String(v.nom || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter((m) => m.length >= 4);
  return [...new Set((String(texte).match(RE_EMAIL) || []).map((e) => e.toLowerCase().replace(/\.$/, '')))].filter((e) => !EXCLUS.test(e))
    .sort((a, b) => mots.some((m) => b.includes(m)) - mots.some((m) => a.includes(m)));
}
// Une adresse trouvée ailleurs que sur la fiche doit être celle du commerce : sur le web, elle porte son nom (hors mots
// du métier et de la ville) ou le domaine de son site ; sur son propre site, une messagerie grand public est admise aussi.
// (01/10/2026 : la recherche web avait donné à une boulangerie l'adresse d'une autre maison.)
const GENERIQUES = new Set(['boulangerie', 'patisserie', 'boucherie', 'charcuterie', 'fleuriste', 'fleurs', 'coiffeur', 'coiffure', 'institut',
  'beaute', 'garage', 'automobile', 'automobiles', 'plombier', 'plomberie', 'electricien', 'electricite', 'restaurant', 'pizzeria', 'pizza',
  'fromagerie', 'caviste', 'maison', 'salon', 'atelier', 'boutique', 'cafe', 'brasserie', 'hotel', 'cabinet', 'societe', 'entreprise',
  'france', 'saint', 'sainte', 'fils', 'freres', 'cave', 'traiteur', 'epicerie', 'pressing', 'cordonnerie', 'opticien', 'pharmacie']);
const MESSAGERIES = /@(gmail|googlemail|orange|wanadoo|free|sfr|neuf|laposte|hotmail|outlook|live|yahoo|icloud|aol|bbox)\./i;
const sansAccents = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
// ── Les enseignes nationales (point 18) : elles ont leur site national, ce ne sont pas des clients à 500 €.
// Un nom ambigu (Paul, Ange, Nicolas…) n'est une enseigne que s'il est seul (hors mots du métier et de la ville) :
// « Boulangerie Paul » l'est, « Boulangerie Paul Martin » non. Un nom distinctif l'est où qu'il apparaisse.
const ENSEIGNES_SEULES = ['paul', 'ange', 'louise', 'nicolas', 'quick', 'kfc', 'subway', 'midas', 'speedy', 'norauto', 'feu vert',
  'point s', 'carglass', 'dessange', 'tchip', 'sephora', 'nocibe', 'marionnaud', 'picard', 'leclerc', 'auchan', 'casino', 'spar', 'lidl',
  'aldi', 'cavavin', 'v and b', 'v b', '5 a sec', 'yves rocher', 'body minute', 'provost', 'feuillette', 'marie blachere'];
const ENSEIGNES_PARTOUT = ['brioche doree', 'marie blachere', 'boulangerie louise', 'boulangeries louise', 'boulangerie ange', 'boulangeries ange',
  'la mie caline', 'carrefour', 'intermarche', 'super u', 'hyper u', 'jean louis david', 'franck provost', 'jacques dessange', 'saint algue',
  'camille albane', 'coiff and co', 'coiff co', 'monceau fleurs', 'rapid flore', 'au nom de la rose', 'interflora', 'dominos pizza', 'domino s pizza',
  'pizza hut', 'speed rabbit', 'mcdonald', 'burger king', 'mister minit', 'tout chien', 'esthetic center', 'euromaster', 'eurorepar', 'five a sec',
  'grand frais', 'yves rocher', 'body minute', 'point s', 'feu vert'];
const LIEUX = new Set(['gare', 'centre', 'ville', 'aeroport', 'route', 'avenue', 'rue', 'place', 'zone', 'commercial', 'commerciale', 'galerie',
  'marche', 'cc', 'zi', 'za', 'le', 'la', 'les', 'de', 'du', 'des', 'd', 'l', 'et', 'au', 'aux', 'en', 'sur']);
export function enseigne(v) {
  const nom = ` ${sansAccents(v.nom).replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim()} `;
  const partout = ENSEIGNES_PARTOUT.find((e) => nom.includes(` ${e} `));
  if (partout) return partout;
  const ville = new Set(sansAccents(v.ville).split(/[^a-z0-9]+/));
  const reste = nom.trim().split(' ').filter((m) => m && !GENERIQUES.has(m) && !ville.has(m) && !LIEUX.has(m)).join(' ');
  return ENSEIGNES_SEULES.includes(reste) ? reste : null;
}

export function motsDistinctifs(v) {
  const ville = new Set(sansAccents(v.ville).split(/[^a-z0-9]+/));
  return sansAccents(v.nom).split(/[^a-z0-9]+/).filter((m) => m.length >= 4 && !GENERIQUES.has(m) && !ville.has(m));
}
export function emailPlausible(email, v, site, source) {
  const [local, domaine] = String(email).toLowerCase().split('@');
  if (!domaine) return false;
  try {
    const hote = new URL(site).hostname.replace(/^www\./, '');
    if (domaine === hote || domaine.endsWith(`.${hote}`) || hote.endsWith(`.${domaine}`)) return true;
  } catch { /* pas de site */ }
  const mots = motsDistinctifs(v);
  if (mots.some((m) => local.replace(/[^a-z0-9]/g, '').includes(m) || domaine.replace(/[^a-z0-9]/g, '').includes(m))) return true;
  return source === 'site' && MESSAGERIES.test(`@${domaine}`);
}

export async function adresseValide(email, { resoudre = dns.resolveMx } = {}) {
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email) || EXCLUS.test(email)) return false;
  try { return (await resoudre(email.split('@')[1])).length > 0; } catch { return false; }
}

async function chercherEmail(v, { fetch: f, resoudre }) {
  if (v.email && await adresseValide(v.email, { resoudre })) return { email: v.email, source: v.email_source || 'fiche' };
  const candidats = [];
  if (v.site) {
    for (const chemin of ['', '/contact', '/nous-contacter', '/contact.html']) {
      try { const p = await texte(f, new URL(chemin || '/', v.site).href, 8000); if (p.ok) candidats.push(...emailsDans(p.html.replace(/mailto:/gi, ' '), v).map((e) => [e, 'site'])); } catch {}
      if (candidats.length) break;
    }
  }
  if (!candidats.length) {
    try {
      const d = await lireJson(f, `${RECHERCHE}/search?q=${encodeURIComponent(`"${v.nom}" ${v.ville} email`)}&format=json`, { delai: 20000 });
      const mots = v.nom.toLowerCase().split(/\s+/).filter((m) => m.length >= 4);
      for (const r of d.results || []) {
        const bloc = `${r.title || ''} ${r.content || ''}`;
        if (mots.some((m) => bloc.toLowerCase().includes(m))) candidats.push(...emailsDans(bloc, v).map((e) => [e, 'recherche web']));
      }
    } catch {}
  }
  for (const [e, source] of candidats) if (emailPlausible(e, v, v.site, source) && await adresseValide(e, { resoudre })) return { email: e, source };
  return null;
}

// ── 4. MAQUETTE ───────────────────────────────────────────────────────────────
export const slugifier = (v) => `${String(v.nom).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)}-${crypto.createHash('sha1').update(v.source_id).digest('hex').slice(0, 6)}`;

// Les coordonnées du commerce, pour la carte : OpenStreetMap (le point lui-même) ou la Base Adresse Nationale (l'adresse).
export async function localiser(v, f) {
  if (v.lat !== null && v.lat !== undefined && Number.isFinite(Number(v.lat)) && (v.horaires || !/^osm:/.test(v.source_id || ''))) return { lat: Number(v.lat), lon: Number(v.lon), horaires: v.horaires || null };
  try {
    const m = /^osm:(node|way|relation)\/(\d+)$/.exec(v.source_id || '');
    if (m) {
      const d = await lireJson(f, 'https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(`[out:json][timeout:20];${m[1]}(${m[2]});out tags center;`),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'raime-cerveau/1.0 (+https://raime.fr)' }, delai: 30000 });
      const e = (d.elements || [])[0];
      const lat = e && (e.lat ?? (e.center && e.center.lat)), lon = e && (e.lon ?? (e.center && e.center.lon));
      if (Number.isFinite(lat)) return { lat, lon, horaires: v.horaires || (e.tags && e.tags.opening_hours) || null };
    }
    if (v.adresse) {
      const d = await lireJson(f, `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(`${v.adresse} ${v.ville || ''}`)}&limit=1`, { delai: 15000 });
      const p = (d.features || [])[0];
      if (p && p.properties.score >= 0.5) return { lat: p.geometry.coordinates[1], lon: p.geometry.coordinates[0], horaires: v.horaires || null };
    }
  } catch { /* pas de carte : le repère seul la remplace */ }
  return { lat: v.lat ?? null, lon: v.lon ?? null, horaires: v.horaires || null };
}

// La maquette (gabarit v2 du 01/10/2026, agents/maquette_premium.js) : photos d'exemple servies par le Cockpit, carte
// OpenStreetMap quand les coordonnées sont connues.
export const MAQUETTE_V = 4;
export function maquette(v) {
  return maquettePremium(v, { images: `${ADRESSE_DEMO}/demo/img` });
}

// ── 5. LE BROUILLON (texte de Basile, 30/09/2026) ─────────────────────────────
export function brouillon(v, url) {
  // Le constat dit seulement ce qui a été vérifié : « sur Google » quand la fiche vient de Google.
  const constat = v.site_etat === 'ancien' ? `votre site existe, mais il date un peu et s'affiche mal sur téléphone`
    : v.site_etat === 'mort' ? `votre site ne s'ouvre plus`
    : plateformeDe(v.site) ? (v.source === 'google' ? `sur Google, votre fiche renvoie vers ${plateformeDe(v.site)}, pas vers un site`
      : `je n'ai trouvé qu'${plateformeDe(v.site)}, et aucun site à votre nom`)
    : v.source === 'google' ? `sur Google, aucun site n'y est relié`
    : `je n'ai trouvé aucun site à votre nom`;
  return {
    sujet: `${v.nom} : j'ai préparé votre site`,
    corps: `Bonjour,\n\nEn cherchant ${/(ie|ia)$/.test(v.metier || '') ? 'une' : 'un'} ${v.metier || 'commerce'} à ${v.ville}, je suis tombé sur ${v.nom} : ${constat}.\n\n`
      + `Alors je vous en ai préparé un. Le voici :\n${url}\n\n`
      + `S'il vous plaît, il est à ${PRIX} €. C'est une démo : on prend un appel pour le terminer ensemble, avec vos photos et vos textes. `
      + `S'il ne vous plaît pas, vous ne payez rien.\n\nPour choisir votre créneau d'appel :\n${AGENDA}\n\n`
      + `Basile Ramé — rAIme · raime.fr\n\nVos coordonnées viennent de votre fiche publique. Pour ne plus recevoir de message, répondez « stop ».`,
  };
}

// ── LE PASSAGE ────────────────────────────────────────────────────────────────
async function qualifier(brain, v, deps) {
  const f = deps.fetch;
  const marque = enseigne(v);
  if (marque) {
    await brain.query(`UPDATE vitrines SET statut = 'ecarte', motif = $2, maj_le = now() WHERE id = $1`, [v.id, `enseigne nationale (${marque})`]);
    return 'ecarte';
  }
  let site = normaliserSite(v.site); // une fiche note parfois « www.exemple.fr » sans https://
  let juge = site && plateformeDe(site) ? { etat: 'aucun', signaux: [`${plateformeDe(site)} seulement`] } : jugerSite(site ? await lireSite(f, site) : null);
  // Avant d'écrire « aucun site » ou « votre site ne s'ouvre plus », chercher un site actuel sur le web.
  if (juge.etat === 'aucun' || juge.etat === 'mort') {
    const { site: trouve, fiable } = await siteParRecherche(v, f);
    if (!fiable) return 'reporte'; // la recherche est en panne : rien n'est affirmé, la fiche repassera
    if (trouve && trouve !== site) {
      const autre = jugerSite(await lireSite(f, trouve));
      if (autre.etat !== 'mort') { site = trouve; juge = autre; }
    }
  }
  if (juge.etat === 'recent' || juge.etat === 'illisible') {
    await brain.query(`UPDATE vitrines SET site = $2, site_etat = $3, site_signaux = $4, statut = 'ecarte', motif = $5, maj_le = now() WHERE id = $1`,
      [v.id, site, juge.etat, juge.signaux, juge.etat === 'recent' ? 'site récent' : `${juge.signaux[0]} : rien ne peut en être affirmé`]);
    return 'ecarte';
  }
  v = { ...v, ...(await localiser(v, f)) };
  const m = await chercherEmail({ ...v, site: plateformeDe(site) ? null : site }, deps);
  // Une adresse, un seul e-mail : deux fiches du même commerce (ou d'une même maison) ne reçoivent pas deux messages.
  if (m) {
    const { rows: deja } = await brain.query(`SELECT id FROM vitrines WHERE lower(email) = lower($1) AND id <> $2 AND statut NOT IN ('ecarte', 'nouveau') ORDER BY id LIMIT 1`, [m.email, v.id]);
    if (deja[0]) {
      await brain.query(`UPDATE vitrines SET site = $2, site_etat = $3, site_signaux = $4, statut = 'ecarte', motif = $5, maj_le = now() WHERE id = $1`,
        [v.id, site, juge.etat, juge.signaux, `même e-mail que la vitrine n°${deja[0].id}`]);
      return 'ecarte';
    }
  }
  const slug = slugifier(v), url = `${ADRESSE_DEMO}/demo/${slug}`;
  const w = { ...v, site, site_etat: juge.etat };
  const b = brouillon(w, url);
  const suisse = v.pays === 'CH';
  const statut = m && !suisse ? 'brouillon' : 'a_appeler';
  await brain.query(`UPDATE vitrines SET site = $2, site_etat = $3, site_signaux = $4, email = $5, email_source = $6, slug = $7,
    demo_html = $8, sujet = $9, corps = $10, statut = $11, motif = $12, lat = $13, lon = $14, maquette_v = $15, horaires = $16, maj_le = now() WHERE id = $1`,
  [v.id, site, juge.etat, juge.signaux, m ? m.email : null, m ? m.source : null, slug, maquette(w), b.sujet, b.corps, statut,
    suisse ? 'Suisse : par téléphone seulement (pas d’e-mail sans accord, loi suisse)' : m ? null : 'e-mail non trouvé', v.lat, v.lon, MAQUETTE_V, v.horaires || null]);
  return statut;
}

export async function passer({ brain, env = process.env, fetch = globalThis.fetch, resoudre = dns.resolveMx, combien = 8 } = {}) {
  await preparer(brain);
  const bilan = { neufs: 0, brouillons: 0, a_appeler: 0, ecartes: 0, reportes: 0, erreurs: 0 };
  try { bilan.neufs = await decouvrir(brain, { env, fetch }); } catch (e) { bilan.erreurs++; bilan.decouverte = e.message.slice(0, 120); }
  const { rows } = await brain.query(`SELECT * FROM vitrines WHERE statut = 'nouveau' AND (telephone IS NOT NULL OR email IS NOT NULL) ORDER BY id LIMIT $1`, [combien]);
  for (const v of rows) {
    try {
      const s = await qualifier(brain, v, { fetch, resoudre });
      if (s === 'reporte') { bilan.reportes++; break; } // la recherche est bloquée : on n'insiste pas, on repassera
      bilan[s === 'brouillon' ? 'brouillons' : s === 'a_appeler' ? 'a_appeler' : 'ecartes']++;
    } catch (e) {
      bilan.erreurs++;
      await brain.query(`UPDATE vitrines SET statut = 'ecarte', motif = $2, maj_le = now() WHERE id = $1`, [v.id, `erreur : ${e.message.slice(0, 150)}`]);
    }
  }
  // Les maquettes d'un ancien gabarit sont refaites (jamais une maquette premium publiée par Basile), 15 par passage.
  const { rows: anciennes } = await brain.query(`SELECT * FROM vitrines WHERE demo_html IS NOT NULL AND premium_le IS NULL
    AND coalesce(maquette_v, 0) < $1 AND statut IN ('brouillon', 'valide', 'envoye', 'repondu', 'a_appeler') ORDER BY id LIMIT 15`, [MAQUETTE_V]);
  for (const a of anciennes) {
    const w = { ...a, ...(await localiser(a, fetch)) };
    await brain.query('UPDATE vitrines SET demo_html = $2, lat = $3, lon = $4, maquette_v = $5, horaires = $6 WHERE id = $1', [a.id, maquette(w), w.lat, w.lon, MAQUETTE_V, w.horaires || null]);
    bilan.maquettes = (bilan.maquettes || 0) + 1;
  }
  // Une enseigne ajoutée à la liste écarte aussi les fiches déjà qualifiées (jamais une vitrine validée ou envoyée).
  const { rows: qualifiees } = await brain.query(`SELECT id, nom, ville FROM vitrines WHERE statut IN ('nouveau', 'brouillon', 'a_appeler') AND nom IS NOT NULL`);
  for (const q of qualifiees) {
    const marque = enseigne(q);
    if (marque) { await brain.query(`UPDATE vitrines SET statut = 'ecarte', motif = $2, maj_le = now() WHERE id = $1`, [q.id, `enseigne nationale (${marque})`]); bilan.ecartes++; }
  }
  // Conditions de Google : 30 jours au plus pour ce qu'on n'utilise pas ; l'identifiant du lieu seul reste.
  await brain.query(`UPDATE vitrines SET nom = NULL, adresse = NULL, telephone = NULL, carte = NULL, demo_html = NULL, corps = NULL
    WHERE source = 'google' AND statut IN ('ecarte', 'pas_interesse') AND maj_le < now() - interval '30 days' AND nom IS NOT NULL`);
  await brain.query(`INSERT INTO journal(acteur, changement, motif) VALUES ('vitrines', $1, $2)`,
    [`Vitrines : ${bilan.neufs} commerces repérés, ${bilan.brouillons} brouillons, ${bilan.a_appeler} à appeler (sans e-mail), ${bilan.ecartes} écartés`,
      bilan.decouverte || `erreurs : ${bilan.erreurs}${bilan.reportes ? ' ; recherche web bloquée : fiches reportées' : ''}`]);
  return bilan;
}

// ── L'ENVOI ───────────────────────────────────────────────────────────────────
// La file et le réglage vivent dans la base n8n, à côté de la liste de suppression et des réponses reçues.
// Mode « test » par défaut : un brouillon validé part d'abord vers l'adresse de test de Basile ; le passage
// en « live » (vers les commerçants) est sa décision : UPDATE vitrines_envoi_config SET mode = 'live',
// puis UPDATE vitrines_envoi SET statut = 'a_envoyer' WHERE statut = 'teste' pour envoyer ce qui a été essayé.
export async function preparerEnvoi(n8n) {
  await n8n.query(`CREATE TABLE IF NOT EXISTS vitrines_envoi (id int PRIMARY KEY, to_email text NOT NULL, sujet text NOT NULL,
    corps text NOT NULL, statut text NOT NULL DEFAULT 'a_envoyer', resend_id text, erreur text, envoye_le timestamptz,
    cree_le timestamptz NOT NULL DEFAULT now(), maj_le timestamptz NOT NULL DEFAULT now())`);
  await n8n.query(`CREATE TABLE IF NOT EXISTS vitrines_envoi_config (id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    mode text NOT NULL DEFAULT 'test' CHECK (mode IN ('pause', 'test', 'live')), plafond_jour int NOT NULL DEFAULT 10,
    from_email text NOT NULL DEFAULT 'contact@raime.fr', from_name text NOT NULL DEFAULT 'Basile Ramé · rAIme', test_to text)`);
  await n8n.query('INSERT INTO vitrines_envoi_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING');
  // L'adresse de test est celle de l'Expéditeur des prospects : aucune adresse écrite dans le code.
  await n8n.query(`UPDATE vitrines_envoi_config SET test_to = (SELECT test_to FROM send_config WHERE id = 1)
    WHERE id = 1 AND test_to IS NULL`).catch(() => {});
}

const jourMois = (d) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Paris' });

// Le Réceptionniste (n8n) range chaque e-mail reçu dans `replies`, précédé de sa catégorie : « [interesse] résumé || texte ».
export function lireReponse(corps) {
  const m = /^\[([a-z_]+)\]\s*([^|]*)/i.exec(String(corps || ''));
  const categorie = m ? m[1].toLowerCase() : 'autre';
  const resume = m ? m[2].trim().slice(0, 160) : '';
  if (categorie.startsWith('desab')) return { statut: 'pas_interesse', motif: 'a répondu « stop »', stop: true };
  if (categorie === 'pas_interesse') return { statut: 'pas_interesse', motif: `a répondu : pas intéressé${resume ? ` (${resume})` : ''}` };
  if (categorie === 'rebond_erreur') return { statut: 'a_appeler', motif: 'e-mail revenu en erreur : à appeler' };
  if (categorie === 'absence_bureau') return null; // un message d'absence n'est pas une réponse
  return { statut: 'repondu', motif: `a répondu${resume ? ` : ${resume}` : ''}` };
}

// ── LA MAQUETTE PREMIUM (point 16) ───────────────────────────────────────────
// Un commerçant qui répond mérite mieux que la maquette simple : Hermes (compétence site-premium) en fabrique une
// soignée, aux mêmes contraintes que la page publique (un seul fichier, rien de chargé dehors, rien d'inventé).
// Basile la regarde dans le tiroir VITRINES et la publie d'un clic ; rien ne remplace la maquette sans lui.
export function textePremium(v) {
  const infos = [v.adresse || v.ville, v.telephone ? `téléphone ${v.telephone}` : null].filter(Boolean).join(', ');
  return `Maquette premium d'une vitrine (n°${v.id}) : un commerçant a répondu à notre e-mail, Basile va l'appeler. `
    + `Avec la compétence site-premium, construis la page vitrine soignée de « ${v.nom} », ${v.metier || 'commerce'} à ${v.ville} (${infos}). `
    + `Point de départ : la maquette simple ${ADRESSE_DEMO}/demo/${v.slug}. `
    + 'CONTRAINTES, prioritaires sur la compétence : UN SEUL fichier, demande-N/app/index.html ; tout dedans (styles et scripts en ligne) ; '
    + 'AUCUN chargement extérieur (ni CDN, ni police distante, ni image distante : la page est servie sans réseau) ; images en SVG ou en data: ; '
    + "RIEN D'INVENTÉ : ni avis, ni prix, ni horaires, ni photo d'une vraie personne, ni chiffre ; les textes restent génériques et disent « à compléter avec vous » ; "
    + 'en haut, la bannière « Maquette de démonstration préparée par rAIme, à compléter ensemble avec vos photos et vos textes » ; '
    + 'un bouton Appeler (lien tel:) et un bouton Itinéraire ; parfaite sur téléphone ; poids total sous 1 Mo.';
}

export async function commanderPremium(brain, id) {
  await preparer(brain);
  const { rows: [v] } = await brain.query('SELECT * FROM vitrines WHERE id = $1', [id]);
  if (!v || !v.nom || !v.slug) return null;
  if (v.premium_commande) return v.premium_commande;
  // La table des ordres (migrations/021) : créée si elle manque, pour qu'un ordre ne se perde jamais.
  await brain.query(`CREATE TABLE IF NOT EXISTS commandes (id serial PRIMARY KEY, cree_le timestamptz NOT NULL DEFAULT now(), texte text NOT NULL,
    source text NOT NULL DEFAULT 'jarvis', pour text NOT NULL DEFAULT 'claude',
    etat text NOT NULL DEFAULT 'a_faire' CHECK (etat IN ('a_faire','en_cours','faite','refusee')), reponse text, traite_le timestamptz)`);
  const { rows: [c] } = await brain.query(`INSERT INTO commandes (texte, source, pour) VALUES ($1, 'vitrines', 'harness') RETURNING id`, [textePremium(v)]);
  await brain.query('UPDATE vitrines SET premium_commande = $2, maj_le = now() WHERE id = $1', [id, c.id]);
  return c.id;
}

export async function synchroniser({ brain, n8n }) {
  await preparer(brain); await preparerEnvoi(n8n);
  const bilan = { en_file: 0, annules: 0, envoyes: 0, essais: 0, erreurs: 0, reponses: 0, desinscrits: 0 };

  // ① Les brouillons validés par Basile entrent dans la file (une seule fois ; une vitrine re-validée y revient).
  // Une maquette ne part jamais sans ses photos d'exemple ni sans les informations du commerce (règle de Basile).
  const { rows: valides } = (await brain.query(`SELECT id, email, sujet, corps, nom, ville, telephone, adresse, demo_html FROM vitrines
    WHERE statut = 'valide' AND email IS NOT NULL AND sujet IS NOT NULL AND corps IS NOT NULL`));
  for (let i = valides.length - 1; i >= 0; i--) if (!maquetteComplete(valides[i], valides[i].demo_html)) valides.splice(i, 1);
  for (const v of valides) {
    // jamais deux e-mails à la même adresse, même depuis deux fiches
    const r = await n8n.query(`INSERT INTO vitrines_envoi (id, to_email, sujet, corps) SELECT $1::int, $2::text, $3::text, $4::text
      WHERE NOT EXISTS (SELECT 1 FROM vitrines_envoi WHERE lower(to_email) = lower($2::text) AND id <> $1::int AND statut NOT IN ('annule', 'erreur'))
      ON CONFLICT (id) DO UPDATE SET statut = 'a_envoyer', to_email = EXCLUDED.to_email, sujet = EXCLUDED.sujet,
        corps = EXCLUDED.corps, erreur = NULL, maj_le = now() WHERE vitrines_envoi.statut = 'annule'`, [v.id, v.email, v.sujet, v.corps]);
    bilan.en_file += r.rowCount;
  }
  // ② Une vitrine écartée après sa validation ne part plus. (Un numéro négatif est un essai de la chaîne, en mode
  //    test, vers l'adresse de Basile : il ne dépend d'aucune vitrine.)
  bilan.annules = (await n8n.query(`UPDATE vitrines_envoi SET statut = 'annule', maj_le = now()
    WHERE statut = 'a_envoyer' AND id > 0 AND NOT (id = ANY($1::int[]))`, [valides.map((v) => v.id)])).rowCount;

  // ③ L'issue de chaque envoi revient dans la fiche.
  const { rows: faits } = await n8n.query(`SELECT id, statut, envoye_le, erreur FROM vitrines_envoi WHERE statut IN ('envoye', 'teste', 'erreur')`);
  for (const f of faits) {
    if (f.statut === 'envoye') {
      bilan.envoyes += (await brain.query(`UPDATE vitrines SET statut = 'envoye', envoye_le = $2, motif = NULL, maj_le = now()
        WHERE id = $1 AND statut = 'valide'`, [f.id, f.envoye_le])).rowCount;
      continue;
    }
    const motif = f.statut === 'teste' ? `essai reçu par Basile le ${jourMois(f.envoye_le)}` : `envoi refusé : ${String(f.erreur || '').slice(0, 150)}`;
    const n = (await brain.query(`UPDATE vitrines SET motif = $2, maj_le = now() WHERE id = $1 AND statut = 'valide'
      AND motif IS DISTINCT FROM $2`, [f.id, motif])).rowCount;
    if (f.statut === 'teste') bilan.essais += n; else bilan.erreurs += n;
  }

  // ④ Les réponses (boîte de réception lue par le Réceptionniste) : la plus récente après l'envoi fait foi.
  let reponses = [];
  try {
    ({ rows: reponses } = await n8n.query(`SELECT DISTINCT ON (e.id) e.id, e.to_email, r.body, r.received_at FROM vitrines_envoi e
      JOIN replies r ON lower(r.from_email) = lower(e.to_email) AND r.received_at > e.envoye_le
      WHERE e.statut = 'envoye' ORDER BY e.id, r.received_at DESC`));
  } catch { /* boîte de réception absente : rien à lire */ }
  for (const r of reponses) {
    const suite = lireReponse(r.body);
    if (!suite) continue;
    const n = (await brain.query(`UPDATE vitrines SET statut = $2, motif = $3, maj_le = now() WHERE id = $1 AND statut = 'envoye'`,
      [r.id, suite.statut, `${suite.motif} (${jourMois(r.received_at)})`])).rowCount;
    bilan.reponses += n;
    if (n && suite.statut === 'repondu') await commanderPremium(brain, r.id);
    if (n && suite.stop) await n8n.query(`INSERT INTO suppression (email, reason) VALUES ($1, 'reply_stop') ON CONFLICT DO NOTHING`, [r.to_email]).catch(() => {});
  }

  // ⑤ Une adresse désinscrite (lien « se désinscrire » ou « stop ») n'est plus jamais proposée.
  let supprimees = [];
  try { ({ rows: supprimees } = await n8n.query('SELECT lower(email) AS email FROM suppression WHERE email IS NOT NULL')); } catch { /* liste absente */ }
  if (supprimees.length) {
    bilan.desinscrits = (await brain.query(`UPDATE vitrines SET statut = 'ecarte', motif = 'désinscrit', maj_le = now()
      WHERE statut IN ('brouillon', 'valide') AND lower(email) = ANY($1::text[])`, [supprimees.map((s) => s.email)])).rowCount;
  }

  const bouge = Object.values(bilan).some((n) => n > 0);
  if (bouge) {
    await brain.query(`INSERT INTO journal(acteur, changement, motif) VALUES ('vitrines', $1, $2)`,
      [`Vitrines, envoi : ${bilan.en_file} en file, ${bilan.envoyes} envoyés, ${bilan.essais} essais, ${bilan.reponses} réponses`,
        `annulés ${bilan.annules}, refusés ${bilan.erreurs}, désinscrits ${bilan.desinscrits}`]);
  }
  return bilan;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { db } = await import('./lib.js');
  const brain = db(); await brain.connect();
  try { console.log(await passer({ brain, combien: Number(process.argv[2] || 8) })); } finally { await brain.end(); }
}
