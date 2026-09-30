// LES API UTILES À UNE TÂCHE — demande de Basile (30/09/2026) : « que des requêtes automatiques soient faites
// en fonction du besoin vers ces API quand une tâche est demandée ». Avant qu'Hermes exécute un ordre, et
// avant qu'un chantier parte en ingénierie, le cerveau cherche seul, dans le répertoire public-apis (table
// apis_publiques), les API qui rendent déjà le service ; il les joint à la consigne. L'existant avant le neuf.
//
// Deux temps : un modèle gratuit traduit la tâche en mots-clés anglais (le répertoire est en anglais), puis
// du SQL cherche. Rien trouvé, modèle muet, table absente : la consigne part telle quelle, jamais bloquée.
'use strict';

const { repondreSansFrais } = require('./parole.cjs');

const CONSIGNE = 'Tu reçois une tâche. Si elle aurait besoin de données ou d\'un service externe accessible par une API '
  + '(météo, géocodage, validation d\'e-mail, tendances, produits, paiement, traduction, images…), réponds UNIQUEMENT par '
  + '2 à 5 mots-clés en anglais, séparés par des virgules, qui nomment ce service. Sinon, réponds exactement : AUCUN.';

// Les mots-clés anglais d'une tâche, ou [] (modèle gratuit, court ; le local, trop lent ici, n'est pas attendu).
async function motsCles(tache, { repondre = repondreSansFrais, env = process.env } = {}) {
  const r = await repondre({ messages: [{ role: 'system', content: CONSIGNE }, { role: 'user', content: String(tache).slice(0, 1500) }],
    maxTokens: 60, temperature: 0, delai: 20000, delaiLocal: 45000, env });
  const t = String(r && r.texte || '').trim();
  if (!t || /^aucun/i.test(t)) return [];
  return [...new Set(t.split(/[,;\n]/).map((m) => m.toLowerCase().replace(/[^a-z0-9 -]/g, '').trim()).filter((m) => m.length >= 3 && m.length <= 40))].slice(0, 5);
}

// Les API du répertoire pour ces mots-clés, les plus pertinentes d'abord (une requête par mot-clé, fusionnées).
async function chercher(lire, mots, combien = 6) {
  const vus = new Map();
  for (const m of mots) {
    let rows = [];
    try {
      rows = await lire(`SELECT nom, lien, description, categorie, auth, https,
          ts_rank(to_tsvector('english', nom || ' ' || coalesce(description, '') || ' ' || coalesce(categorie, '')), websearch_to_tsquery('english', $1)) AS r
        FROM apis_publiques WHERE to_tsvector('english', nom || ' ' || coalesce(description, '') || ' ' || coalesce(categorie, ''))
          @@ websearch_to_tsquery('english', $1) ORDER BY r DESC, https DESC, nom LIMIT 4`, [m]);
    } catch { return []; }
    for (const a of rows) if (!vus.has(a.lien)) vus.set(a.lien, a);
  }
  return [...vus.values()].sort((a, b) => b.r - a.r).slice(0, combien);
}

// Le bloc à joindre à une consigne ('' si rien d'utile).
async function blocApis(tache, { lire, repondre, env } = {}) {
  try {
    const mots = await motsCles(tache, { repondre, env });
    if (!mots.length) return '';
    const apis = await chercher(lire, mots);
    if (!apis.length) return '';
    return `API PUBLIQUES PEUT-ÊTRE UTILES (trouvées pour « ${mots.join(', ')} » dans le répertoire public-apis ; vérifie leurs conditions `
      + `et leur prix avant usage ; une clé éventuelle se range au coffre, jamais dans un fichier) :\n`
      + apis.map((a) => `- ${a.nom} (${a.categorie}) : ${a.description} · clé : ${a.auth || 'aucune'} · ${a.lien}`).join('\n');
  } catch { return ''; }
}

module.exports = { motsCles, chercher, blocApis };
