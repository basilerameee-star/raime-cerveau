// LE FURETEUR (réécrit le 07/10/2026) — il trouve l'adresse d'une entreprise sur SON site, et seulement là.
//
// L'ancien (workflow n8n « Fureteur · Enrichissement email ») avait trois défauts, mesurés le 07/10 :
//   ① il prenait le premier lien d'un moteur pour le site de l'entreprise — chez Mojeek, c'était le pied de page du
//     moteur (buttondown.email/Mojeek) : d'où contact@buttondown.email chez trois cabinets ;
//   ② sans adresse trouvée, il en inventait une (contact@domaine) ;
//   ③ DuckDuckGo le bloque depuis (réponse 202) et, n'écrivant rien quand il ne trouvait rien, il repassait chaque
//     heure sur les vingt mêmes fiches : 213 adresses sur 2 426 prospects.
// Désormais, dans l'ordre : le site déjà connu, les domaines tirés du nom (.fr, .com, .notaires.fr), puis quelques
// recherches espacées. Un site n'est retenu que s'il PROUVE être celui de l'entreprise : son SIREN sur ses pages
// (les mentions légales l'y obligent), ou son nom et sa ville. L'adresse doit être écrite sur ce site ; jamais devinée.
// Chaque fiche essayée est datée : on n'y revient pas avant 30 jours. Aucun modèle : rien d'inventé, aucun coût.
import pg from 'pg';
import dns from 'node:dns/promises';
import { joliNom, adresseFiable, motsDuNom, SANS_ACCENTS, METIERS } from './prospection_auto.js';
import { extraire as extraireTelephone } from './annuaire.js';

const UA = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept-Language': 'fr-FR,fr;q=0.9',
  Accept: 'text/html,application/xhtml+xml',
};
const TIMEOUT = 8000;
// Ni annuaires, ni réseaux, ni moteurs : un résultat de recherche de ce genre n'est jamais le site de l'entreprise.
const RACINES = /(^|\.)(linkedin|facebook|instagram|twitter|x|youtube|wikipedia|societe|pappers|verif|infogreffe|manageo|score3|bodacc|pagesjaunes|kompass|europages|cylex|118000|118712|mappy|google|yelp|trustpilot|indeed|glassdoor|hellowork|welcometothejungle|lefigaro|leparisien|journaldunet|b-reputation|businesscoot|corporama|societeinfo|bilansgratuits|brave|duckduckgo|mojeek|bing|ecosia|qwant|buttondown|mastodon|lesentreprises|rubypayeur|doctrine|justacote|hoodspot|tiktok|pinterest|apple|waze|tripadvisor|annuaire-entreprises|pappers|legalstart|legalplace|infonet|entreprises-lefigaro|dnb|bfmtv|ouest-france|ledauphine)\.[a-z]{2,6}(\.[a-z]{2})?$/;
const PORTAILS = new Set(['notaires.fr', 'immobilier.notaires.fr', 'avocat.fr', 'cnb.avocat.fr', 'experts-comptables.fr', 'experts-comptables.org']);
const PAS_UN_SITE = (h) => !h || RACINES.test(h) || PORTAILS.has(h) || /\.gouv\.fr$|annuaire/.test(h);
const PAGES_UTILES = /contact|mention|legal|l[eé]gales|propos|cabinet|equipe|[eé]quipe|qui-sommes|nous-trouver|office|etude/i;

const dort = (ms) => new Promise((r) => setTimeout(r, ms));
const hote = (url) => { try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; } };

async function lirePage(url) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), TIMEOUT);
  try {
    const r = await fetch(url, { headers: UA, signal: c.signal, redirect: 'follow' });
    if (!r.ok || !(r.headers.get('content-type') || '').includes('html')) return null;
    return { url: r.url || url, html: (await r.text()).slice(0, 600000) };
  } catch { return null; } finally { clearTimeout(t); }
}

// Le texte visible d'une page : sans scripts ni balises, entités courantes rendues.
export function texte(html) {
  return String(html || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/&#39;|&rsquo;/gi, "'")
    .replace(/&eacute;/gi, 'é').replace(/&egrave;/gi, 'è').replace(/\s+/g, ' ');
}

// La preuve qu'un site est celui de l'entreprise : son SIREN (« 123 456 789 », « RCS Annecy 123456789 », SIRET…),
// sinon TOUS les mots propres à son nom ET sa ville. Rien d'autre : un mot du nom seul désigne souvent un homonyme.
export function preuve(contenu, p) {
  const brut = SANS_ACCENTS(contenu);
  const s = String(p.siren || '').replace(/\D/g, '');
  if (s.length === 9 && new RegExp(`(^|\\D)${s.slice(0, 3)}[\\s.\\u00a0-]?${s.slice(3, 6)}[\\s.\\u00a0-]?${s.slice(6)}([\\s.\\u00a0-]?\\d{3}[\\s.\\u00a0-]?\\d{2})?(\\D|$)`).test(brut)) return 'siren';   // SIRET = SIREN + 5 chiffres
  const plat = ` ${brut.replace(/[^a-z0-9]+/g, ' ')} `;
  const mots = motsDuNom(p.name);
  const ville = SANS_ACCENTS(p.city).replace(/\s+\d+(e|er|eme)?\s+arrondissement$/, '').replace(/[^a-z0-9]+/g, ' ').trim();
  if (mots.length && ville.length >= 3 && mots.every((m) => plat.includes(` ${m} `)) && plat.includes(` ${ville} `)) return 'nom et ville';
  return null;
}

// Les adresses écrites dans une page (liens mailto et texte, « [at] » et « &#64; » compris).
export function adressesDe(html) {
  const h = String(html || '').replace(/&#64;|&#x40;|%40|\s?\[at\]\s?|\s?\(at\)\s?/gi, '@').replace(/\s?\[(dot|point)\]\s?/gi, '.');
  const vues = (h.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || []).map((e) => e.toLowerCase().replace(/^mailto:/, '').replace(/\.$/, ''));
  return [...new Set(vues)].filter((e) => !/\.(png|jpe?g|gif|webp|svg|css|js)$/.test(e) && !/@\d|@(sentry|wixpress|example)/.test(e));
}

// Parmi les adresses d'un site PROUVÉ : celles de son domaine (ou portant son nom), jamais une plateforme ni un « no-reply ».
// On préfère la boîte générale (contact, accueil, cabinet…) à celle d'une personne.
export function choisirAdresse(liste, p, site) {
  const ok = liste.filter((e) => adresseFiable({ name: p.name, contact_email: e, website: site }));
  return ok.find((e) => /^(contact|accueil|info|infos|bonjour|hello|cabinet|office|etude|secretariat|secr[eé]tariat|direction|commercial|agence)[@.]/.test(e)) || ok[0] || null;
}

// Les domaines à essayer d'après le nom : « Naz & Associés » → naz-associes.fr, nazassocies.fr, naz-associes.notaires.fr…
export function domainesDevines(p) {
  const mots = SANS_ACCENTS(joliNom(p.name)).replace(/&/g, ' ').split(/[^a-z0-9]+/).filter((m) => m && !['et', 'and', 'de', 'du', 'des', 'la', 'le', 'les', 'd', 'l', 'a'].includes(m) && !/^notai|^notar/.test(m));
  const propres = motsDuNom(p.name);
  if (!propres.length) return [];
  const notaire = /notaire|notarial/i.test(p.name || '');
  const slugs = [...new Set([mots.join('-'), mots.join(''), propres.join('-'), propres.join('')])].filter((s) => s.length >= 3 && s.length <= 40);
  const d = [];
  for (const s of slugs) { if (notaire) d.push(`${s}.notaires.fr`); d.push(`${s}.fr`, `${s}.com`); }
  return [...new Set(d)].slice(0, 9);
}

const existe = async (domaine) => { try { await dns.lookup(domaine); return true; } catch { return false; } };

// Visite un site : l'accueil, puis ses pages contact / mentions légales / cabinet. Rend la preuve, l'adresse, le téléphone.
export async function visiter(url, p, lire = lirePage) {
  const accueil = await lire(url);
  if (!accueil) return null;
  const base = new URL(accueil.url).origin;
  if (PAS_UN_SITE(hote(base))) return null;
  const liens = new Set();
  for (const m of accueil.html.matchAll(/href=["']([^"'#]+)["']/gi)) {
    try {
      const u = new URL(m[1], base);
      if (u.origin === base && PAGES_UTILES.test(u.pathname)) liens.add(u.href);
    } catch { /* lien illisible */ }
  }
  const pages = [accueil];
  for (const u of [...liens].slice(0, 4).concat(liens.size ? [] : [`${base}/contact`, `${base}/mentions-legales`])) {
    const pg2 = await lire(u);
    if (pg2) pages.push(pg2);
  }
  const tout = pages.map((x) => x.html).join('\n');
  const ok = preuve(texte(tout), p);
  if (!ok) return { site: base, preuve: null };
  const email = choisirAdresse(adressesDe(tout), p, base);
  let telephone = null;
  for (const x of pages) { const t = extraireTelephone(x.html); if (t) { telephone = t.numero; break; } }
  return { site: base, preuve: ok, email, telephone };
}

// Une recherche Brave, page publique, au plus quelques-unes par passage, espacées. Si le moteur répond autre chose
// qu'une page de résultats (blocage, vérification « êtes-vous humain »), on s'arrête : on ne contourne jamais.
let moteurFerme = false;
async function chercher(q) {
  if (moteurFerme) return [];
  const r = await lirePage(`https://search.brave.com/search?q=${encodeURIComponent(q)}&source=web`);
  if (!r || /captcha|are you a (human|robot)|unusual traffic/i.test(r.html.slice(0, 20000))) { moteurFerme = true; return []; }
  const vus = new Set(), sites = [];
  for (const m of r.html.matchAll(/href="(https?:\/\/[^"]+)"/gi)) {
    const h = hote(m[1]);
    if (vus.has(h) || PAS_UN_SITE(h) || /search\./.test(h)) continue;
    vus.add(h); sites.push(`https://${h}`);
    if (sites.length >= 4) break;
  }
  return sites;
}

// Une fiche : le site connu d'abord (il doit, lui aussi, prouver qu'il est le bon), puis les domaines du nom, puis la recherche.
export async function fureter(p, { recherche = true } = {}) {
  const essais = [];
  if (p.website) essais.push(/^https?:\/\//.test(p.website) ? p.website : `https://${p.website}`);
  for (const d of domainesDevines(p)) if (await existe(d)) essais.push(`https://${d}`);
  const faits = new Set();
  const tenter = async (url) => {
    const h = hote(url);
    if (!h || faits.has(h)) return null;
    faits.add(h);
    const v = await visiter(url, p).catch(() => null);
    return v && v.preuve ? v : null;
  };
  for (const u of essais) { const v = await tenter(u); if (v) return v; }
  if (recherche) {
    await dort(3000 + Math.random() * 3000);
    for (const u of await chercher(`${joliNom(p.name)} ${SANS_ACCENTS(p.city || '').toLowerCase()}`)) { const v = await tenter(u); if (v) return v; }
  }
  return null;
}

export async function passer({ n8n, brain, combien = 25, recherches = 15, dureeMax = 4 * 60_000 } = {}) {
  await n8n.query('ALTER TABLE prospects ADD COLUMN IF NOT EXISTS site_preuve text');
  await n8n.query('ALTER TABLE prospects ADD COLUMN IF NOT EXISTS furete_le timestamptz');
  await n8n.query('ALTER TABLE prospects ADD COLUMN IF NOT EXISTS furete_note text');
  moteurFerme = false;
  // D'abord les métiers qui ont un pré-audit (l'e-mail part), puis les autres entreprises à but lucratif ; les fiches
  // dont le site n'a jamais été prouvé (celles de l'ancien Fureteur) passent avant les autres.
  const { rows } = await n8n.query(`SELECT siren, name, city, website, contact_email, telephone FROM prospects
    WHERE status = 'nouveau' AND site_preuve IS NULL AND (furete_le IS NULL OR furete_le < now() - interval '30 days')
      AND coalesce(sector, '') NOT IN ('Organismes de formation', 'CCI')
    ORDER BY (sector = ANY($1::text[]) OR name ~* 'notaire|notarial') DESC, (website IS NOT NULL) DESC,
      (departement = '74') DESC, effectif_est DESC NULLS LAST, score DESC NULLS LAST LIMIT $2`, [Object.keys(METIERS), combien]);
  const bilan = { examinees: 0, prouves: 0, adresses: 0, retirees: 0, telephones: 0, moteur: 'ouvert' };
  const debut = Date.now();
  let cherchees = 0;
  for (const p of rows) {
    if (Date.now() - debut > dureeMax) break;
    bilan.examinees++;
    const recherche = cherchees < recherches;
    if (recherche) cherchees++;
    const v = await fureter(p, { recherche }).catch(() => null);
    if (v) {
      bilan.prouves++;
      // Un site prouvé : l'adresse vient de lui. L'ancienne adresse n'est gardée que si elle tient face à ce site.
      const garde = !v.email && p.contact_email && adresseFiable({ name: p.name, contact_email: p.contact_email, website: v.site }) ? p.contact_email : null;
      const email = v.email || garde;
      if (v.email && v.email !== p.contact_email) bilan.adresses++;
      if (p.contact_email && !email) bilan.retirees++;
      if (v.telephone && !p.telephone) bilan.telephones++;
      await n8n.query(`UPDATE prospects SET website = $2, site_preuve = $3, contact_email = $4, furete_le = now(), furete_note = $5,
          telephone = coalesce(telephone, $6), telephone_source = CASE WHEN telephone IS NULL AND $6::text IS NOT NULL THEN 'site (fureteur)' ELSE telephone_source END
        WHERE siren = $1`, [p.siren, v.site, v.preuve, email, email ? `adresse sur le site (${v.preuve})` : `site prouvé (${v.preuve}), aucune adresse écrite`, v.telephone]);
    } else if (!recherche) {
      // pas encore cherché sur le moteur : seule l'adresse sans preuve est réglée, la fiche revient en tête au passage suivant
      const garde = p.contact_email && adresseFiable({ name: p.name, contact_email: p.contact_email }) ? p.contact_email : null;
      if (p.contact_email && !garde) { bilan.retirees++; await n8n.query('UPDATE prospects SET contact_email = $2 WHERE siren = $1', [p.siren, garde]); }
    } else {
      // Aucun site prouvé : une adresse posée par l'ancien Fureteur sans preuve n'est gardée que si son domaine porte le nom.
      const garde = p.contact_email && adresseFiable({ name: p.name, contact_email: p.contact_email }) ? p.contact_email : null;
      if (p.contact_email && !garde) bilan.retirees++;
      await n8n.query(`UPDATE prospects SET contact_email = $2, furete_le = now(), furete_note = $3 WHERE siren = $1`,
        [p.siren, garde, moteurFerme ? 'aucun site prouvé (moteur fermé)' : 'aucun site prouvé']);
    }
  }
  if (moteurFerme) bilan.moteur = 'fermé (on ne contourne pas)';
  if (brain) {
    await brain.query('INSERT INTO journal(acteur, changement, motif) VALUES($1,$2,$3)', ['fureteur',
      `${bilan.examinees} fiches : ${bilan.prouves} sites prouvés, ${bilan.adresses} adresses trouvées, ${bilan.retirees} adresses sans preuve retirées, ${bilan.telephones} téléphones`,
      `Un site n'est retenu que s'il porte le SIREN, ou le nom et la ville, de l'entreprise ; l'adresse doit y être écrite. Moteur : ${bilan.moteur}.`]).catch(() => {});
  }
  return bilan;
}

// CLI : node agents/fureteur.js [nombre]
if (import.meta.url === `file://${process.argv[1]}`) {
  const { db } = await import('./lib.js');
  const n8n = new pg.Client({ connectionString: process.env.DATABASE_URL_N8N }); const brain = db();
  await n8n.connect(); await brain.connect();
  try { console.log('fureteur :', JSON.stringify(await passer({ n8n, brain, combien: Number(process.argv[2]) || 25, dureeMax: 20 * 60_000 }))); }
  finally { await n8n.end(); await brain.end(); }
}
