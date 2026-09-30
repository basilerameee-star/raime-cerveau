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
//   5. BROUILLON : le texte de Basile ; RIEN ne part d'ici (l'envoi, après sa validation, est une autre pièce).
//   6. APPEL : sans e-mail, tout de suite dans la liste d'appels ; avec, sept jours après l'envoi (jarvis/appels.cjs).
// Conditions de Google : les données d'un lieu écarté sont effacées au bout de 30 jours (seul son identifiant reste).
import crypto from 'node:crypto';
import dns from 'node:dns/promises';

export const PRIX = Number(process.env.VITRINE_PRIX || 500);
export const AGENDA = process.env.VITRINE_AGENDA || 'https://calendar.app.google/HdhqAt3BaQFWfx2g7'; // le lien de raime.fr
export const ADRESSE_DEMO = process.env.VITRINE_ADRESSE || 'https://cockpit.raime.fr';
const PLACES_MOIS = Number(process.env.VITRINES_PLACES_MOIS || 900); // recherches Google par mois, sous le quota gratuit
const RECHERCHE = process.env.RECHERCHE_URL || 'http://searxng:8080';
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; rAIme-vitrines/1.0; +https://raime.fr)' };

export const METIERS = ['boulangerie', 'boucherie', 'fleuriste', 'coiffeur', 'institut de beauté', 'garage automobile', 'plombier',
  'électricien', 'serrurier', 'menuisier', 'restaurant', 'pizzeria', 'pressing', 'cordonnier', 'fromagerie', 'caviste',
  'toiletteur', 'photographe', 'peintre en bâtiment', 'paysagiste'];
const REGION = ['74', '73', '01', '38']; // la région de Basile d'abord, puis la France par taille de ville
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
}

const lireJson = async (f, url, o = {}) => { const r = await f(url, { ...o, signal: AbortSignal.timeout(o.delai || 30000) }); if (!r.ok) throw new Error(`${url.split('?')[0]} : ${r.status}`); return r.json(); };
const texte = async (f, url, delai = 10000) => {
  const r = await f(url, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(delai) });
  return { ok: r.ok, statut: r.status, url: r.url || url, html: r.ok ? String(await r.text()).slice(0, 400_000) : '' };
};

// ── 1. DÉCOUVRIR ─────────────────────────────────────────────────────────────
// Les villes, une fois : la région de Basile d'abord, puis la France par population (API Géo de l'État, sans clé).
async function villes(brain, f) {
  const { rows } = await brain.query('SELECT count(*)::int AS n FROM vitrines_villes');
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
  const { rows } = await brain.query(`SELECT v.nom AS ville, m.metier FROM vitrines_villes v CROSS JOIN unnest($1::text[]) WITH ORDINALITY m(metier, o)
    WHERE NOT EXISTS (SELECT 1 FROM vitrines_recherches r WHERE r.ville = v.nom AND r.metier = m.metier AND r.source = $2)
    ORDER BY v.rang, m.o LIMIT 1`, [METIERS, source]);
  return rows[0] || null;
}

export async function chercherPlaces({ cle, metier, ville, fetch: f = globalThis.fetch }) {
  const d = await lireJson(f, 'https://places.googleapis.com/v1/places:searchText', { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': cle,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.businessStatus,places.googleMapsUri' },
    body: JSON.stringify({ textQuery: `${metier} ${ville}`, languageCode: 'fr', regionCode: 'FR', pageSize: 20 }) });
  return (d.places || []).filter((p) => !p.businessStatus || p.businessStatus === 'OPERATIONAL').map((p) => ({
    source: 'google', source_id: `google:${p.id}`, nom: p.displayName && p.displayName.text, metier, ville, adresse: p.formattedAddress || null,
    telephone: p.nationalPhoneNumber || null, site: p.websiteUri || null, carte: p.googleMapsUri || null, email: null }));
}

export async function chercherOsm({ metier, ville, fetch: f = globalThis.fetch }) {
  const tag = { boulangerie: 'shop=bakery', boucherie: 'shop=butcher', fleuriste: 'shop=florist', coiffeur: 'shop=hairdresser',
    'institut de beauté': 'shop=beauty', 'garage automobile': 'shop=car_repair', plombier: 'craft=plumber', électricien: 'craft=electrician',
    serrurier: 'craft=locksmith', menuisier: 'craft=carpenter', restaurant: 'amenity=restaurant', pizzeria: 'cuisine=pizza',
    pressing: 'shop=dry_cleaning', cordonnier: 'craft=shoemaker', fromagerie: 'shop=cheese', caviste: 'shop=wine', toiletteur: 'shop=pet_grooming',
    photographe: 'craft=photographer', 'peintre en bâtiment': 'craft=painter', paysagiste: 'craft=gardener' }[metier];
  if (!tag) return [];
  const [k, v] = tag.split('=');
  const q = `[out:json][timeout:40];area["name"="${ville.replace(/"/g, '')}"]["admin_level"="8"]->.a;nwr(area.a)["${k}"="${v}"]["name"];out tags center 60;`;
  const d = await lireJson(f, 'https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(q),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...UA }, delai: 60000 });
  return (d.elements || []).map((e) => { const t = e.tags || {}; return {
    source: 'osm', source_id: `osm:${e.type}/${e.id}`, nom: t.name, metier, ville,
    adresse: [t['addr:housenumber'], t['addr:street'], t['addr:postcode'], t['addr:city']].filter(Boolean).join(' ') || null,
    telephone: t.phone || t['contact:phone'] || null, site: t.website || t['contact:website'] || null, carte: null,
    email: t.email || t['contact:email'] || null }; });
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
    if (!c.nom) continue;
    const r = await brain.query(`INSERT INTO vitrines (source, source_id, nom, metier, adresse, ville, telephone, carte, site, email, email_source)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (source_id) DO NOTHING RETURNING id`,
    [c.source, c.source_id, c.nom, c.metier, c.adresse, c.ville, c.telephone, c.carte, c.site, c.email, c.email ? 'fiche OSM' : null]);
    neufs += r.rowCount;
  }
  await brain.query(`INSERT INTO vitrines_recherches (metier, ville, source, trouves) VALUES ($1,$2,$3,$4)
    ON CONFLICT (metier, ville, source) DO UPDATE SET trouves = EXCLUDED.trouves, fait_le = now()`, [p.metier, p.ville, source, trouves.length]);
  return neufs;
}

// ── 2. QUALIFIER : un site ancien, « plus du tout sexy » ─────────────────────
export function jugerSite(page, anneeCourante = new Date().getFullYear()) {
  if (!page || !page.ok) return { etat: 'aucun', signaux: ['site hors ligne'] };
  const h = page.html, signaux = [];
  if (/^http:\/\//i.test(page.url)) signaux.push('sans HTTPS');
  if (!/<meta[^>]+name=["']?viewport/i.test(h)) signaux.push('pas fait pour le téléphone');
  const annees = [...h.matchAll(/(?:©|&copy;|copyright)\s*(?:[^<\d]{0,20})?((?:19|20)\d{2})(?:\s*[-–]\s*((?:19|20)\d{2}))?/gi)]
    .map((m) => Number(m[2] || m[1]));
  if (annees.length && Math.max(...annees) <= anneeCourante - 3) signaux.push(`copyright ${Math.max(...annees)}`);
  if (/<frameset|<marquee|\.swf\b|<font\b|<table[^>]+(width|bgcolor)=/i.test(h)) signaux.push('technique ancienne');
  return { etat: signaux.length >= 2 ? 'ancien' : 'recent', signaux };
}

// Un site propre trouvé par la recherche web (pas un annuaire), quand la fiche n'en donne pas.
async function siteParRecherche(v, f) {
  try {
    const d = await lireJson(f, `${RECHERCHE}/search?q=${encodeURIComponent(`"${v.nom}" ${v.ville}`)}&format=json`, { delai: 20000 });
    const mots = v.nom.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter((m) => m.length >= 4);
    const r = (d.results || []).find((x) => { try { const h = new URL(x.url).hostname; return !ANNUAIRES.test(h) && mots.some((m) => h.includes(m)); } catch { return false; } });
    return r ? new URL(r.url).origin : null;
  } catch { return null; }
}

// ── 3. E-MAIL ─────────────────────────────────────────────────────────────────
const RE_EMAIL = /[a-z0-9][a-z0-9._%+-]{0,63}@[a-z0-9.-]+\.[a-z]{2,}/gi;
const EXCLUS = /(example\.|sentry|wixpress|noreply|no-reply|pagesjaunes|solocal|\.png$|\.jpe?g$|\.gif$|\.webp$|domain\.|email\.com$|votre|yourname)/i;
export function emailsDans(texte, v) {
  const mots = String(v.nom || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter((m) => m.length >= 4);
  return [...new Set((String(texte).match(RE_EMAIL) || []).map((e) => e.toLowerCase().replace(/\.$/, '')))].filter((e) => !EXCLUS.test(e))
    .sort((a, b) => mots.some((m) => b.includes(m)) - mots.some((m) => a.includes(m)));
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
  for (const [e, source] of candidats) if (await adresseValide(e, { resoudre })) return { email: e, source };
  return null;
}

// ── 4. MAQUETTE ───────────────────────────────────────────────────────────────
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TEINTES = { boulangerie: ['#c47a2c', '#f6e7d3'], boucherie: ['#9b2226', '#f5e1dc'], fleuriste: ['#d6336c', '#fbe4ec'], coiffeur: ['#5f3dc4', '#ece6fb'],
  'institut de beauté': ['#c2255c', '#fce4ee'], restaurant: ['#e8590c', '#fdebdc'], pizzeria: ['#d9480f', '#fdebdc'], fromagerie: ['#e0a800', '#fff6d6'],
  caviste: ['#7b1e3a', '#f6e1e7'], 'garage automobile': ['#1864ab', '#e1ecf7'], plombier: ['#1971c2', '#e1eefa'], électricien: ['#f08c00', '#fff1dc'] };
export const slugifier = (v) => `${String(v.nom).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)}-${crypto.createHash('sha1').update(v.source_id).digest('hex').slice(0, 6)}`;

export function maquette(v) {
  const [fort, doux] = TEINTES[v.metier] || ['#2b2d42', '#e9ecef'];
  const tel = v.telephone ? String(v.telephone).replace(/[^\d+]/g, '') : '';
  const metier = v.metier ? v.metier.charAt(0).toUpperCase() + v.metier.slice(1) : 'Commerce';
  const itineraire = v.carte || `https://www.google.com/maps/search/${encodeURIComponent(`${v.nom} ${v.adresse || v.ville}`)}`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(v.nom)} · ${esc(metier)} à ${esc(v.ville)}</title><style>
:root{--f:${fort};--d:${doux}}*{box-sizing:border-box;margin:0}body{font:17px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1d1d1f;background:#fff}
.demo{background:#111;color:#fff;font-size:13px;text-align:center;padding:8px 12px}
header{min-height:78vh;display:flex;align-items:center;background:radial-gradient(1200px 600px at 80% -10%,var(--d),transparent),linear-gradient(160deg,#fff 40%,var(--d));padding:48px 20px}
.w{max-width:1040px;margin:0 auto;width:100%}.k{color:var(--f);font-weight:600;letter-spacing:.08em;text-transform:uppercase;font-size:13px}
h1{font-size:clamp(40px,8vw,84px);line-height:1.02;margin:14px 0 18px;letter-spacing:-.02em}p.l{font-size:clamp(18px,2.4vw,22px);max-width:560px;color:#444}
.b{display:flex;gap:12px;flex-wrap:wrap;margin-top:28px}.b a{padding:14px 22px;border-radius:999px;text-decoration:none;font-weight:600}
.p{background:var(--f);color:#fff;box-shadow:0 10px 30px -10px var(--f)}.s{border:1.5px solid var(--f);color:var(--f)}
section{padding:64px 20px}.g{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:18px;margin-top:24px}
.c{background:var(--d);border-radius:18px;padding:22px;animation:m .8s ease both}.c:nth-child(2){animation-delay:.1s}.c:nth-child(3){animation-delay:.2s}
@keyframes m{from{opacity:0;transform:translateY(14px)}to{opacity:1}}h2{font-size:clamp(28px,4vw,40px);letter-spacing:-.01em}
footer{padding:36px 20px;border-top:1px solid #eee;font-size:14px;color:#666}</style></head><body>
<div class="demo">Maquette de démonstration préparée par rAIme pour ${esc(v.nom)}, à compléter ensemble avec vos photos et vos textes.</div>
<header><div class="w"><div class="k">${esc(metier)} · ${esc(v.ville)}</div><h1>${esc(v.nom)}</h1>
<p class="l">Votre ${esc(v.metier || 'commerce')} à ${esc(v.ville)}. Retrouvez nos horaires, notre adresse et appelez-nous en un geste.</p>
<div class="b">${tel ? `<a class="p" href="tel:${esc(tel)}">Appeler</a>` : ''}<a class="s" href="${esc(itineraire)}" rel="noopener">Itinéraire</a></div></div></header>
<section><div class="w"><h2>Ce que vous trouverez ici</h2><div class="g">
<div class="c"><strong>Nos services</strong><p>Les prestations et les produits de la maison, avec leurs prix.</p></div>
<div class="c"><strong>Nos photos</strong><p>La boutique, l'équipe, le savoir-faire.</p></div>
<div class="c"><strong>Nous trouver</strong><p>${esc(v.adresse || v.ville)}${v.telephone ? `<br>${esc(v.telephone)}` : ''}</p></div></div></div></section>
<footer><div class="w">${esc(v.nom)} · ${esc(v.adresse || v.ville)}. Démonstration réalisée par rAIme (raime.fr).</div></footer></body></html>`;
}

// ── 5. LE BROUILLON (texte de Basile, 30/09/2026) ─────────────────────────────
export function brouillon(v, url) {
  const constat = v.site_etat === 'ancien'
    ? `votre site existe, mais il date un peu et s'affiche mal sur téléphone`
    : `sur Google, aucun site n'y est relié`;
  return {
    sujet: `${v.nom} : j'ai préparé votre site`,
    corps: `Bonjour,\n\nEn cherchant un ${v.metier || 'commerce'} à ${v.ville}, je suis tombé sur ${v.nom} : ${constat}.\n\n`
      + `Alors je vous en ai préparé un. Le voici :\n${url}\n\n`
      + `S'il vous plaît, il est à ${PRIX} €. C'est une démo : on prend un appel pour le terminer ensemble, avec vos photos et vos textes. `
      + `S'il ne vous plaît pas, vous ne payez rien.\n\nPour choisir votre créneau d'appel :\n${AGENDA}\n\n`
      + `Basile Ramé — rAIme · raime.fr\n\nVos coordonnées viennent de votre fiche publique. Pour ne plus recevoir de message, répondez « stop ».`,
  };
}

// ── LE PASSAGE ────────────────────────────────────────────────────────────────
async function qualifier(brain, v, deps) {
  const f = deps.fetch;
  let site = v.site;
  if (!site && v.source === 'osm') site = await siteParRecherche(v, f);
  const juge = site ? jugerSite(await texte(f, site).catch(() => null)) : { etat: 'aucun', signaux: [] };
  if (juge.etat === 'recent') {
    await brain.query(`UPDATE vitrines SET site = $2, site_etat = 'recent', site_signaux = $3, statut = 'ecarte', motif = 'site récent', maj_le = now() WHERE id = $1`,
      [v.id, site, juge.signaux]);
    return 'ecarte';
  }
  const m = await chercherEmail({ ...v, site }, deps);
  const slug = slugifier(v), url = `${ADRESSE_DEMO}/demo/${slug}`;
  const w = { ...v, site, site_etat: juge.etat };
  const b = brouillon(w, url);
  const statut = m ? 'brouillon' : 'a_appeler';
  await brain.query(`UPDATE vitrines SET site = $2, site_etat = $3, site_signaux = $4, email = $5, email_source = $6, slug = $7,
    demo_html = $8, sujet = $9, corps = $10, statut = $11, motif = $12, maj_le = now() WHERE id = $1`,
  [v.id, site, juge.etat, juge.signaux, m ? m.email : null, m ? m.source : null, slug, maquette(w), b.sujet, b.corps, statut,
    m ? null : 'e-mail non trouvé']);
  return statut;
}

export async function passer({ brain, env = process.env, fetch = globalThis.fetch, resoudre = dns.resolveMx, combien = 8 } = {}) {
  await preparer(brain);
  const bilan = { neufs: 0, brouillons: 0, a_appeler: 0, ecartes: 0, erreurs: 0 };
  try { bilan.neufs = await decouvrir(brain, { env, fetch }); } catch (e) { bilan.erreurs++; bilan.decouverte = e.message.slice(0, 120); }
  const { rows } = await brain.query(`SELECT * FROM vitrines WHERE statut = 'nouveau' AND (telephone IS NOT NULL OR email IS NOT NULL) ORDER BY id LIMIT $1`, [combien]);
  for (const v of rows) {
    try {
      const s = await qualifier(brain, v, { fetch, resoudre });
      bilan[s === 'brouillon' ? 'brouillons' : s === 'a_appeler' ? 'a_appeler' : 'ecartes']++;
    } catch (e) {
      bilan.erreurs++;
      await brain.query(`UPDATE vitrines SET statut = 'ecarte', motif = $2, maj_le = now() WHERE id = $1`, [v.id, `erreur : ${e.message.slice(0, 150)}`]);
    }
  }
  // Conditions de Google : 30 jours au plus pour ce qu'on n'utilise pas ; l'identifiant du lieu seul reste.
  await brain.query(`UPDATE vitrines SET nom = NULL, adresse = NULL, telephone = NULL, carte = NULL, demo_html = NULL, corps = NULL
    WHERE source = 'google' AND statut IN ('ecarte', 'pas_interesse') AND maj_le < now() - interval '30 days' AND nom IS NOT NULL`);
  await brain.query(`INSERT INTO journal(acteur, changement, motif) VALUES ('vitrines', $1, $2)`,
    [`Vitrines : ${bilan.neufs} commerces repérés, ${bilan.brouillons} brouillons, ${bilan.a_appeler} à appeler (sans e-mail), ${bilan.ecartes} écartés`,
      bilan.decouverte || `erreurs : ${bilan.erreurs}`]);
  return bilan;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { db } = await import('./lib.js');
  const brain = db(); await brain.connect();
  try { console.log(await passer({ brain, combien: Number(process.argv[2] || 8) })); } finally { await brain.end(); }
}
