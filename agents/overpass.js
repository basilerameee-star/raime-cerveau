// OVERPASS — les données OpenStreetMap, par plusieurs serveurs publics (08/10/2026).
//
// Mesuré les 07 et 08/10/2026 : overpass-api.de répondait 504 « trop occupé » un passage sur deux, parfois 429 ;
// l'adresse du serveur n'était pas bloquée. Désormais : plusieurs serveurs dans l'ordre, un seul nouvel essai après
// 15 secondes sur un 429 ou un 504, et la dernière erreur levée si tous échouent : jamais une liste vide faute de réponse.
//   · overpass.openstreetmap.fr : données fraîches, rapide, mais SANS index des zones (une requête « area » y rend
//     une liste vide sans le dire) : on l'interroge par contour (poly) ou par cadre (bbox), jamais par zone ;
//   · overpass.osm.ch : les données suisses, avec les zones (les communes de Genève) ;
//   · maps.mail.ru : lent, en dernier recours.
// OVERPASS_URLS (et OVERPASS_URLS_CH pour la Suisse), adresses séparées par des virgules, remplacent ces listes.
export const SERVEURS = ['https://overpass.openstreetmap.fr/api/interpreter', 'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
export const SERVEURS_SUISSE = ['https://overpass.osm.ch/api/interpreter', 'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
// Overpass refuse (406) une signature de navigateur : il veut celle d'un programme, avec de quoi joindre son auteur.
export const AGENT = 'raime-cerveau/1.0 (+https://raime.fr; contact@raime.fr)';

const dort = (ms) => new Promise((r) => setTimeout(r, ms));
const liste = (s) => String(s || '').split(/[\s,]+/).filter((u) => /^https?:\/\//.test(u));

export function serveurs({ suisse = false, env = process.env } = {}) {
  const choisis = liste(suisse ? env.OVERPASS_URLS_CH : env.OVERPASS_URLS);
  return choisis.length ? choisis : suisse ? SERVEURS_SUISSE : SERVEURS;
}

// Une requête Overpass QL. `verifier(d)` peut refuser une réponse (elle lève une erreur) : le serveur suivant est
// alors essayé. Une réponse 200 qui porte « runtime error » (délai dépassé, mémoire) est un échec, pas un résultat.
export async function overpass(q, { fetch: f = globalThis.fetch, serveurs: choisis, suisse = false, delai = 90000, attendre = dort, verifier } = {}) {
  let derniere = null;
  for (const url of choisis || serveurs({ suisse })) {
    for (let essai = 0; essai < 2; essai++) {
      try {
        const r = await f(url, { method: 'POST', body: 'data=' + encodeURIComponent(q), signal: AbortSignal.timeout(delai),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': AGENT } });
        if (!r.ok) { const e = new Error(`${url} : ${r.status}`); e.statut = r.status; throw e; }
        const d = await r.json();
        if (/error/i.test(d && d.remark || '')) throw new Error(`${url} : ${String(d.remark).slice(0, 100)}`);
        if (verifier) verifier(d);
        return d;
      } catch (e) {
        derniere = e;
        if (essai === 0 && [429, 504].includes(e.statut)) { await attendre(15000); continue; } // saturé : un seul nouvel essai
        break;
      }
    }
  }
  throw derniere || new Error('aucun serveur Overpass');
}
