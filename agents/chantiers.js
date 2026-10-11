// LES CHANTIERS — ce que l'architecte ne peut pas corriger lui-même, il le demande.
//
// Une issue GitHub étiquetée « chantier », dans le dépôt raime-cerveau : le constat, la
// mesure, l'attendu. La session cloud les lit au début de chaque session, traite la plus
// utile, et la ferme avec la mesure avant/après. La boucle se ferme : il observe, il demande,
// la session construit, la CI juge, Basile confirme, la porte déploie, il mesure.
//
// GARDES, dans le code :
//   - le constat, la mesure et l'attendu sont obligatoires : un chantier sans chiffre reste une idée ;
//   - aucun secret dans le texte ;
//   - pas deux fois le même chantier ouvert ;
//   - trois chantiers ouverts par l'architecte au plus : il demande, il n'inonde pas ;
//   - le jeton (GITHUB_CHANTIER_TOKEN) n'ouvre que des issues sur ce dépôt ; absent, rien ne part.
import { createRequire } from 'node:module';
const API = 'https://api.github.com';
export const ETIQUETTE = 'chantier';
export const OUVERTS_MAX = 3;

const SECRETS = [/\bsk-[A-Za-z0-9_-]{16,}/, /\b(rk|sk)_(live|test)_[A-Za-z0-9]{8,}/, /\bgh[pousr]_[A-Za-z0-9]{20,}/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/, /BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY/, /postgres:\/\/[^\s:]+:[^\s@]+@/, /\bwhsec_[A-Za-z0-9]{16,}/];

const depot = () => process.env.GITHUB_DEPOT || 'basilerameee-star/raime-cerveau';

async function github(chemin, { methode = 'GET', corps } = {}) {
  const jeton = process.env.GITHUB_CHANTIER_TOKEN;
  const r = await fetch(`${API}/repos/${depot()}/${chemin}`, {
    method: methode,
    headers: { Authorization: `Bearer ${jeton}`, Accept: 'application/vnd.github+json',
      'User-Agent': 'rAIme-architecte/1.0', ...(corps ? { 'Content-Type': 'application/json' } : {}) },
    body: corps ? JSON.stringify(corps) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(`GitHub ${r.status} : ${d?.message || ''}`.trim());
  return d;
}

const normaliser = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

export function preparer({ titre, constat, mesure, attendu, piste = null, source = 'architecte' }) {
  const t = String(titre || '').trim().slice(0, 120);
  const champs = { constat, mesure, attendu };
  const manquants = Object.entries(champs).filter(([, v]) => String(v || '').trim().length < 10).map(([k]) => k);
  if (!t) return { refus: 'titre absent' };
  if (manquants.length) return { refus: `chantier refusé : ${manquants.join(', ')} absent(s) ou trop court(s)` };
  if (!/\d/.test(String(mesure))) return { refus: 'chantier refusé : la mesure ne porte aucun chiffre' };
  const corps = `## Constat\n${String(constat).trim()}\n\n## Mesure\n${String(mesure).trim()}\n\n`
    + `## Attendu\n${String(attendu).trim()}\n\n`
    + (piste ? `## Piste retenue\n${String(piste).trim()}\n\n` : '')
    + `---\n_Ouvert par l'${source} de production. Fermer avec la mesure avant / après._`;
  if (SECRETS.some((re) => re.test(`${t}\n${corps}`))) return { refus: 'chantier refusé : le texte porte un secret' };
  return { titre: t, corps };
}

// brain (facultatif) : les API publiques qui rendent déjà le service sont jointes au chantier (30/09/2026),
// pour que l'ingénierie intègre l'existant avant de construire.
export async function ouvrirChantier(demande, { brain = null, blocApis = null } = {}) {
  const p = preparer(demande);
  if (p.refus) return { ouvert: false, motif: p.refus };
  if (!process.env.GITHUB_CHANTIER_TOKEN) return { ouvert: false, motif: 'jeton GITHUB_CHANTIER_TOKEN absent : chantier gardé au journal' };
  if (brain) {
    const bloc = blocApis || createRequire(import.meta.url)('../jarvis/apis_utiles.cjs').blocApis;
    const apis = await bloc(`${p.titre}\n${demande.attendu || ''}`, { lire: async (sql, v) => (await brain.query(sql, v)).rows });
    if (apis) p.corps = p.corps.replace('\n---\n', `\n## ${apis.replace(/^API PUBLIQUES/, 'API publiques')}\n\n---\n`);
  }
  const ouverts = await github(`issues?state=open&labels=${ETIQUETTE}&per_page=100`);
  const memes = ouverts.find((i) => normaliser(i.title) === normaliser(p.titre));
  if (memes) return { ouvert: false, motif: `déjà ouvert : n° ${memes.number}`, numero: memes.number, url: memes.html_url };
  if (ouverts.length >= OUVERTS_MAX)
    return { ouvert: false, motif: `${ouverts.length} chantiers déjà ouverts (${OUVERTS_MAX} au plus) : attendre qu'ils soient traités` };
  const i = await github('issues', { methode: 'POST', corps: { title: p.titre, body: p.corps, labels: [ETIQUETTE] } });
  return { ouvert: true, numero: i.number, url: i.html_url };
}

