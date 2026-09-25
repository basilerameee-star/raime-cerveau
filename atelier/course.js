// LA COURSE — d'une note vocale, ce qu'on sait vraiment.
//
// Basile enregistre ses séances de sport en dictant une phrase, sans ouvrir d'application.
// Ce module transforme la phrase dite en une course structurée : LE code juge, jamais le
// modèle. Rien ne s'invente (Règle 4) : une durée dont la phrase ne porte pas le motif ne
// s'infère pas, une allure (min/km) ne se calcule que si la distance ET la durée sont dites.
//
// Règle : une quantité ne vaut que si la phrase porte une unité juste à côté. La date
// s'écrit telle que dite (« ce matin », « hier », « le 12 juin »), jamais inventée ;
// « maintenant » par défaut quand rien n'est dit. Toutes les listes vivent à un seul endroit
// et sont verrouillées par cas figés.

const KILOMETRES = /(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:km|kms|kilometres?|kilomètres?)\b/i;
const METRES = /(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:m|mètres?|metres?)\b/i;
const MINUTES = /(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:min|minutes?|mins?)\b/i;
// « 1 h 12 », « 1h12 », « 1 heure 12 minutes », « 1h », « 2 heures 30 »
// L'alternative « heures » vient d'abord : sinon « h » avalerait l'h initial de « heures ».
const DUREE = /(\d{1,2})\s*(?:heures?\s*|h\s*)(?:(\d{1,2})\s*(?:min|minutes?)?)?/i;

const TYPES = [
  [/course\s*à\s*pied|footing|jogging|jog|\bcour[u]?[rs]?\b|\brun\b/i, 'course a pied'],
  [/vélo|velo|bicyclette/i, 'velo'],
  [/natation|nage|bain/i, 'natation'],
  [/marche\b|randonnée|randomnée/i, 'marche'],
];
const RESSENTIS = [
  [/super|excellent|génial|genial|facile|top\b/i, 'super'],
  [/\bbien\b|bonne\b|agréable|agreable/i, 'bien'],
  [/dur\b|difficile|pénible|penible|hard/i, 'dur'],
  [/fatigué|fatigue|epuisé|épuisé|crevé|creve/i, 'epuise'],
];
// « note 8 », « note : 8 », « 8/10 », « 8 sur 10 »
const NOTE = /(?:note|niveau)\s*[: ]*(\d{1,2})(?:\s*[/][\s]*10)?|\b(\d{1,2})\s*[/]\s*10\b/i;

// Une seule forme par mois (les variantes accentuées mappent dessus) : index = numéro de mois − 1.
const NOMS_MOIS = { 'janvier':0, 'février':1, 'fevrier':1, 'mars':2, 'avril':3, 'mai':4, 'juin':5,
  'juillet':6, 'août':7, 'aout':7, 'septembre':8, 'octobre':9, 'novembre':10, 'décembre':11, 'decembre':11 };
const DATE_LE = /(?:\ble\s+)?(\d{1,2})\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)/i;
const LIEU_AVANT_HIER = /\bavant[- ]hier\b/i;
const LIEU_HIER = /\bhier\b|\bla veille\b/i;
const LIEU_MATIN = /\b(?:ce\s+matin|au\s+matin|ce\s+midi|ce\s+mardi\b)/i;
const LIEU_SOIR = /\b(?:ce\s+soir|ce\s+we\s*[- ]?end|ce\s+weekend|hier\s+soir|ce\s+soir\b)/i;

export function extraireCourse(phrase, { maintenant = new Date() } = {}) {
  const p = String(phrase || '').trim();
  const out = { phrase: p };

  // — Distance : km si porté ; sinon des mètres (converti en km), seulement si km absent.
  let distanceKm = null, unitDistance = null;
  const mKm = p.match(KILOMETRES);
  const mMeters = p.match(METRES);
  if (mKm)        { distanceKm = Number(mKm[1].replace(',', '.')); unitDistance = 'km'; }
  else if (mMeters){ distanceKm = Number(mMeters[1].replace(',', '.')) / 1000; unitDistance = 'm'; }
  out.distanceKm = distanceKm;
  out.distanceTexte = unitDistance ? (unitDistance === 'm' ? `${p.match(METRES)[1]} m` : `${distanceKm} km`) : null;

  // — Durée : « 1 h 12 » prime sur « 54 min » (la plus longue est la plus précise).
  let dureeMin = null;
  const h = p.match(DUREE);
  if (h && h[1]) {
    dureeMin = Number(h[1]) * 60 + (h[2] ? Number(h[2]) : 0);
  } else { const mi = p.match(MINUTES); if (mi) dureeMin = Number(mi[1].replace(',', '.')); }
  out.dureeMin = dureeMin && dureeMin > 0 ? dureeMin : null;
  out.dureeTexte = out.dureeMin ? formaterDuree(out.dureeMin) : null;

  // — Allure min/km : seulement si distance ET durée sont portées.
  out.allureMinKm = out.distanceKm && out.dureeMin ? out.dureeMin / out.distanceKm : null;

  // — Type : porté par la phrase, sinon la règle la plus sûre.
  let type = null;
  for (const [motif, val] of TYPES) if (p.match(motif)) { type = val; break; }
  out.type = type;

  // — Date : dite, sinon maintenant. On s'appuie sur le jour réel fourni en argument (testable).
  let jour = new Date(maintenant);
  let moment = null;
  const dl = p.match(DATE_LE);
  if (dl) {
    const num = Number(dl[1]);
    const moisIdx = NOMS_MOIS[dl[2].toLowerCase()];
    jour = new Date(maintenant.getFullYear(), moisIdx, num, 10, 0, 0);
    // une date au passé rollbacke (ex. 15 décembre dicté en juin = même année écoulée)
    if (jour > maintenant) jour = new Date(maintenant.getFullYear() - 1, moisIdx, num, 10, 0, 0);
  } else if (LIEU_AVANT_HIER.test(p)) {
    jour.setDate(jour.getDate() - 2);
  } else if (LIEU_HIER.test(p)) {
    jour.setDate(jour.getDate() - 1);
  }
  if (LIEU_SOIR.test(p)) moment = 'soir';
  else if (LIEU_MATIN.test(p)) moment = 'matin';
  if (moment) jour.setHours(moment === 'matin' ? 9 : 18, 0, 0, 0);
  out.jour = jour;
  out.moment = moment;

  // — Note sur 10 : seulement si la phrase la porte.
  let note = null;
  const n = p.match(NOTE);
  if (n) {
    note = Number(n[1] || n[2]);
    if (note < 1 || note > 10) note = null;
  }
  out.note = note;

  // — Ressenti : premier adjectif dit.
  let ressenti = null;
  for (const [motif, val] of RESSENTIS) if (p.match(motif)) { ressenti = val; break; }
  out.ressenti = ressenti;

  // — Commentaire : la phrase telle que dite (archive lisible).
  out.commentaire = p;

  return out;
}

export function formaterDuree(min) {
  const m = Math.round(min);
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return h > 0 ? (rest ? `${h} h ${rest}` : `${h} h`) : `${rest} min`;
}

// Interface en ligne de commande : `node atelier/course.js "j'ai couru 10 km en 54 minutes"`
// affiche la course structurée — utile à la porte pour consigner une note vocale telle quelle.
if (import.meta.url === `file://${process.argv[1]}`) {
  const phrase = process.argv.slice(2).join(' ');
  if (!phrase) { console.error('usage : node atelier/course.js "note vocale"'); process.exit(2); }
  const c = extraireCourse(phrase);
  console.log(`  type      : ${c.type || 'non précisé (règle par défaut)'}`);
  console.log(`  distance  : ${c.distanceTexte || '—'}`);
  console.log(`  durée     : ${c.dureeTexte || '—'}`);
  console.log(`  allure    : ${c.allureMinKm ? (Math.round(c.allureMinKm * 100) / 100) + ' min/km' : '—'}`);
  console.log(`  date      : ${c.jour.toLocaleDateString('fr-FR') + (c.moment ? ' (' + c.moment + ')' : '')}`);
  console.log(`  ressenti  : ${c.ressenti || '—'} · note : ${c.note ? c.note + '/10' : '—'}`);
  console.log(`  phrase    : ${c.phrase}`);
}