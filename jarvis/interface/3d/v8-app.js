// Le cockpit v8 (22/10/2026) : tout le cockpit v6 rassemblé autour de l'agence en 3D, dans le style des captures de Basile.
// Reprend la logique éprouvée de la v6 (jarvis/interface/v6.html : liste d'appels, rappels, e-mails après l'appel,
// candidatures, agenda, fiches, demandes, voix) ; ajoute les chiffres toujours visibles (cartes du haut), la colonne de
// l'agence (à faire maintenant, objectifs d'hier, semaine, fil en direct), Jarvis en discussion écrite et les bilans des
// analystes (/api/v7/analyses). Écrire passe par l'en-tête maison X-Jarvis (jarvis/serveur.cjs). Rien n'est inventé :
// un chiffre absent s'affiche « non relevé ».
import { creerAgence, COULEUR_ZONE } from '/3d/v8-agence.js';

// ══ LES DONNÉES ET LES DATES (comme la v6) ══
let D = null, A = null, NOW, AUJ, DEMAIN, HEURE_P;
function dates() {
  NOW = new Date(D.NOW); AUJ = NOW.toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
  DEMAIN = plus(AUJ, 1);
  HEURE_P = Number(NOW.toLocaleTimeString('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hour12: false }));
}
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TZ = { timeZone: 'Europe/Paris' };
const isoDe = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const plus = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return isoDe(d); };
const dateFr = (iso, o) => new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', o);
const jourP = (iso) => iso.length === 10 ? iso : new Date(iso).toLocaleDateString('sv-SE', TZ);
const heureP = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { ...TZ, hour: '2-digit', minute: '2-digit' }).replace(':', ' h ');
const nomJour = (j) => j === AUJ ? 'aujourd’hui' : j === plus(AUJ, -1) ? 'hier' : j === DEMAIN ? 'demain' : 'le ' + j.slice(8, 10) + '/' + j.slice(5, 7);
const quandDT = (iso) => !iso ? '—' : iso.length === 10 ? nomJour(iso) : nomJour(jourP(iso)) + ' à ' + heureP(iso);
const quand = (j) => j === AUJ ? 'aujourd’hui' : j === DEMAIN ? 'demain' : dateFr(j, { weekday: 'long', day: 'numeric', month: 'long' });
const ecart = (iso) => {
  if (!iso) return '';
  if (iso.length === 10) { const j = Math.round((new Date(AUJ + 'T12:00:00') - new Date(iso + 'T12:00:00')) / 864e5); return j <= 0 ? 'aujourd’hui' : j < 14 ? j + ' j' : Math.round(j / 7) + ' sem.'; }
  const m = Math.max(0, Math.round((NOW - new Date(iso)) / 60000)); if (m < 60) return m + ' min';
  const h = Math.floor(m / 60); if (h < 24) return h + ' h' + (h < 10 && m % 60 ? ' ' + String(m % 60).padStart(2, '0') : '');
  const j = Math.floor(h / 24); return j < 14 ? j + ' j' + (j < 3 && h % 24 ? ' ' + (h % 24) + ' h' : '') : Math.round(j / 7) + ' sem.';
};
const jj = (iso) => iso ? String(iso).slice(8, 10) + '/' + String(iso).slice(5, 7) : '';
const euros = (n) => Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const duree = (s) => s == null ? '—' : s < 60 ? s + ' s' : s < 3600 ? Math.floor(s / 60) + ' min ' + String(s % 60).padStart(2, '0') + ' s' : Math.floor(s / 3600) + ' h ' + String(Math.floor(s % 3600 / 60)).padStart(2, '0');
const kJ = (n) => !n ? '0' : n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 1 : 2).replace('.', ',') + ' M' : n >= 1000 ? Math.round(n / 1000) + ' k' : String(n);
const nombre = (n) => n == null ? '—' : Number(n).toLocaleString('fr-FR');

const P = {
  etat: '<path d="M3 12h4l2.5-6 5 12 2.5-6H21"/>',
  vue3d: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>',
  commerce: '<path d="M4 9.5 5.5 4h13L20 9.5"/><path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0"/><path d="M5.5 12v8h13v-8M10 20v-4.5h4V20"/>',
  poles: '<path d="M12 3.5 14.3 9l5.7.5-4.3 3.8 1.3 5.7L12 16l-5 3 1.3-5.7L4 9.5 9.7 9z"/>',
  majs: '<path d="M20 11a8 8 0 0 0-14.6-4.5M4 4.5V8h3.5M4 13a8 8 0 0 0 14.6 4.5M20 19.5V16h-3.5"/>',
  factures: '<path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2z"/><path d="M9 8.5h6M9 12h6"/>',
  clipping: '<circle cx="6.5" cy="6.5" r="2.5"/><circle cx="6.5" cy="17.5" r="2.5"/><path d="M8.6 8l11 9M8.6 16l11-9"/>',
  trading: '<path d="M4 19.5h16M6 15l4-4 3 3 5-6"/><path d="M15 8h3v3"/>',
  dropshipping: '<path d="M5.5 8h13l-1 12h-11z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
  libre: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18"/>',
  candidatures: '<rect x="3.5" y="7.5" width="17" height="12" rx="2.5"/><path d="M9 7.5V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v1.5M3.5 12.5h17"/>',
  siteweb: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M3.5 9h17M7 6.8h.01M9.5 6.8h.01"/>',
  integration: '<rect x="7" y="7" width="10" height="10" rx="2"/><path d="M10 3.5V7M14 3.5V7M10 17v3.5M14 17v3.5M3.5 10H7M3.5 14H7M17 10h3.5M17 14h3.5"/>',
  agenda: '<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  clients: '<circle cx="9" cy="8.5" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>',
  appel: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1.5 1.5 0 0 1-1.6 1.5A16 16 0 0 1 3.5 5.6 1.5 1.5 0 0 1 5 4z"/>',
  mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="M4 7l8 6 8-6"/>',
  agents: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  alerte: '<path d="M12 4 2.5 20h19z"/><path d="M12 10v4.5M12 17.5h.01"/>',
  copier: '<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M5 15V6.5A1.5 1.5 0 0 1 6.5 5H15"/>',
  ext: '<path d="M14 5h5v5M19 5l-8 8M17 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 4 18.5v-10A1.5 1.5 0 0 1 5.5 7H10"/>',
  drapeau: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  fermer: '<path d="M6 6l12 12M18 6L6 18"/>',
  campus: '<path d="M3 20h18M5 20V9l5-3v14M10 20V4l9 4v12"/>',
  batiment: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 12h16M12 4v16"/>',
  visite: '<circle cx="12" cy="5" r="2"/><path d="M12 7.5v6l-3 6.5M12 13.5l3 6.5M8 11l4-2 4 2"/>',
  envoyer: '<path d="M4 12 20 4l-6 16-3-7z"/>',
};
const ic = (k) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${P[k] || ''}</svg>`;

let minut;
function toast(texte, annuler) {
  const t = $('#toast'); t.className = 'toast' + (annuler ? '' : ' simple'); t.innerHTML = `<span>${esc(texte)}</span>${annuler ? '<button type="button" id="t-annuler">Annuler</button>' : ''}`;
  requestAnimationFrame(() => t.classList.add('vu')); clearTimeout(minut);
  if (annuler) $('#t-annuler').onclick = () => { annuler(); t.classList.remove('vu'); rendre(); };
  minut = setTimeout(() => t.classList.remove('vu'), annuler ? 10000 : 3200);
}

// ══ LES AGENTS (comme la v6) ══
let AG = [], SECT = {};
const ETATS = { inconnu: ['gris', 'Non relevé'], ok: ['ok', 'Fonctionne'], vide: ['alerte', 'Tourne à vide'], panne: ['panne', 'En panne'], arret: ['gris', 'Arrêté'], attente: ['info', 'Pas encore prouvé'], construction: ['info', 'En construction'], afaire: ['gris', 'À construire'], alerte: ['alerte', 'À surveiller'], gris: ['gris', 'N’existe pas encore'] };
const COULEUR_ETAT = { ok: '#3ddc97', vide: '#fbbf24', panne: '#ff5d5d', attente: '#60a5fa', construction: '#60a5fa', afaire: '#94a3b8', arret: '#64748b', inconnu: '#8b91a0', alerte: '#fbbf24', gris: '#64748b' };
const etatOk = (e) => ETATS[e] ? e : 'inconnu';
const puceEtat = (e) => `<span class="puce ${ETATS[etatOk(e)][0]}"><span class="point ${ETATS[etatOk(e)][0]}"></span>${ETATS[etatOk(e)][1]}</span>`;
const COLONNE = (a) => a.etat === 'ok' ? 'bien' : ['vide', 'panne', 'arret'].includes(a.etat) ? 'mal' : 'afaire';
const outilsHTML = (l) => l && l.length ? `<div class="outils">${l.map(([n, j, t]) => `<span class="outil ${t || ''}" title="${esc(n)} : ${esc(j)}">${esc(n)}<i>${esc(j)}</i></span>`).join('')}</div>` : '';
function sante(a) {
  const c = COLONNE(a);
  if (a.etat === 'inconnu') return `État non relevé : ${a.derniere_panne ? a.derniere_panne.texte : 'sa source n’a pas pu être lue'}.`;
  if (a.etat === 'alerte') return `À surveiller${a.constat_le ? ' (constat du ' + jj(a.constat_le) + ')' : ''}.${a.dernier ? ' Dernier passage ' + quandDT(a.dernier) + '.' : ''}`;
  if (c === 'mal' && !a.fige) {
    const dep = a.depuis ? ` depuis ${quandDT(a.depuis)} (${ecart(a.depuis)})` : a.constat_le ? ` (constat du ${jj(a.constat_le)})` : a.etat === 'vide' ? ' (mesuré sur les dernières 24 h)' : '';
    return `${ETATS[a.etat][1]}${dep}.${a.derniere_panne && a.derniere_panne.texte ? ' Cause : ' + a.derniere_panne.texte + '.' : ''}${a.dernier ? ' Dernier passage ' + quandDT(a.dernier) + '.' : ''}`;
  }
  if (c === 'afaire') return a.etat === 'attente' ? `Pas encore prouvé${a.depuis ? ' depuis ' + quandDT(a.depuis) : ''}.` : `Demandé ${quandDT(a.depuis)}${a.depuis && ecart(a.depuis) !== 'aujourd’hui' && a.depuis !== D.NOW ? ', il y a ' + ecart(a.depuis) : ''}.`;
  if (c === 'mal') return `${ETATS[a.etat][1]} depuis ${quandDT(a.depuis) || '—'}${a.depuis ? ' (' + ecart(a.depuis) + ')' : ''}.${a.derniere_panne ? ' Cause : ' + a.derniere_panne.texte + '.' : ''}`;
  const s = a.sante;
  if (a.derniere_panne && a.derniere_panne.le) return `Dernière panne ${quandDT(a.derniere_panne.le)} : ${a.derniere_panne.texte}. Sain depuis ${quandDT(s ? s.depuis : a.derniere_panne.le)} (${ecart(s ? s.depuis : a.derniere_panne.le)}).`;
  if (s && s.type === 'jamais' && s.debut_releve) return `Aucune panne enregistrée depuis le ${jj(jourP(s.depuis))} (${s.debut_releve}).`;
  if (s && s.type === 'jamais') return `Jamais en panne depuis sa mise en service, ${quandDT(s.depuis)} (${ecart(s.depuis)}).`;
  if (s && s.type === 'sain') return `Dernière panne ${quandDT(s.panne)}. Sain depuis ${quandDT(s.depuis)} (${ecart(s.depuis)}).`;
  return a.dernier ? `Dernier passage ${quandDT(a.dernier)}. Ses pannes ne sont pas enregistrées.` : 'Aucun passage enregistré.';
}
function vivant(a) {
  return `<dl class="vivant">${a.mesure ? `<dt>En direct</dt><dd>${esc(a.mesure)}</dd>` : ''}<dt>Maintenant</dt><dd>${esc(a.maintenant)}</dd><dt>Bloque sur</dt><dd${/^Rien ne |^—/.test(a.bloque || '') ? '' : ' class="rouge"'}>${esc(a.bloque)}</dd>
    <dt>Ensuite</dt><dd>${esc(a.ensuite)}${a.duree ? ` <span style="color:var(--doux)">· ${esc(a.duree)}</span>` : ''}</dd><dt>Santé</dt><dd>${esc(sante(a))}</dd></dl><p class="date-txt" style="margin:0">${a.fige ? 'État écrit' : 'État lu en direct'} ; textes écrits le ${jj(a.texte_le)}.</p>`;
}
function teteAgent(a, fermer) {
  return `<div class="tete-ag"><div style="min-width:0"><span class="etiq">${esc(SECT[a.secteur] || '')}</span><h3>${esc(a.nom)}</h3><div class="sous">${puceEtat(a.etat)}${a.rythme ? `<span>${esc(a.rythme)}</span>` : ''}</div></div>
    ${fermer ? `<button class="fermer" type="button" data-tout="1" aria-label="Fermer">${ic('fermer')}</button>` : ''}</div>${outilsHTML(a.outils)}`;
}
function ficheAgent(a) {
  tiroir(SECT[a.secteur] || 'Agent', a.nom, (a.rythme || '') + (a.dernier ? ' · dernier passage ' + quandDT(a.dernier) : ''),
    `<div>${puceEtat(a.etat)}</div>${(a.outils || []).length ? `<div><span class="etiq">Outils et jetons</span><div style="margin-top:8px">${outilsHTML(a.outils).replace('class="outils"', 'class="outils" style="justify-content:flex-start"')}</div></div>` : ''}
    ${vivant(a)}<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn petit" type="button" data-voir3d="${esc(a.id)}">${ic('vue3d')}Le voir dans l’agence</button><button class="btn petit" type="button" data-nouvelle="${esc(SECT[a.secteur])} › ${esc(a.nom)}">${ic('drapeau')}Signaler sur cet agent</button></div>`);
}
const MOTS_VIDES = new Set(['de', 'des', 'du', 'la', 'le', 'les', 'à', 'au', 'aux', 'et', 'en', 'd’', 'l’', 'pour', 'sur', 'un', 'une']);
const initiales = (n) => String(n || '?').replace(/[’']/g, ' ').split(/\s+/).filter((w) => w && !MOTS_VIDES.has(w.toLowerCase())).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
let ZONE_DU_SECTEUR = new Map();
const zoneDe = (a) => ZONE_DU_SECTEUR.get(a.secteur);
const ligneAgentL = (a) => `<button class="agent-l" type="button" data-agent3d="${esc(a.id)}" style="--z:${COULEUR_ZONE[zoneDe(a)] || '#8b91a0'};--e:${COULEUR_ETAT[etatOk(a.etat)]}"><span class="av">${esc(initiales(a.nom))}</span><span>${esc(a.nom)}</span><small style="color:${COULEUR_ETAT[etatOk(a.etat)]}">${esc(ETATS[etatOk(a.etat)][1])}</small></button>`;

// ══ LA NAVIGATION : un rail de quatre entrées, des pilules pour leurs pages ══
let C = [], RAPPELS = [], OFFRES = [];
const GROUPES = [
  { cle: 'agence', nom: 'L’agence', icone: 'vue3d', pages: [['agence', 'L’agence']] },
  { cle: 'commerce', nom: 'Commerce', icone: 'commerce', pages: [['siteweb', 'Site web'], ['integration', 'Intégration IA'], ['agenda', 'Agenda'], ['clients', 'Clients'], ['fiches', 'Toutes les fiches']] },
  { cle: 'poles', nom: 'Pôles', icone: 'poles', pages: [['clipping', 'Clipping'], ['candidatures', 'Candidatures'], ['trading', 'Trading'], ['dropshipping', 'Dropshipping'], ['libre', 'Agent libre']] },
  { cle: 'machine', nom: 'Machine', icone: 'etat', pages: [['etat', 'État des agents'], ['majs', 'Mises à jour'], ['factures', 'Coûts et factures']] },
];
const groupeDe = (v) => GROUPES.find((g) => g.pages.some(([k]) => k === v)) || GROUPES[0];
const derniere = { agence: 'agence', commerce: 'siteweb', poles: 'clipping', machine: 'etat' };
const COMPTES = {
  siteweb: [() => listeDuJour('site', jourListe).filter((x) => x.type !== 'nouveau').length],
  integration: [() => D.brouillons.filter((k) => !envoyes.has(k)).length],
  agenda: [() => RAPPELS.filter((r) => r.note && r.jour <= DEMAIN).length],
  clients: [() => interesses().length],
  candidatures: [() => OFFRES.filter((o) => o.etat === 'clic').length],
  etat: [() => AG.filter((a) => COLONNE(a) === 'mal').length, true],
  majs: [() => D.majs.attente.length, true],
  factures: [() => D.factures.filter((f) => f.etat === 'panne').length, true],
};
let RELEVE = '';
const titres = () => ({
  agence: ['L’agence', 'Clique une pièce ou un agent ; « Visite » pour marcher dedans · ' + RELEVE],
  etat: ['État des agents', 'Ce qui tourne, ce qui ne tourne pas, ce qui reste à faire · ' + RELEVE],
  majs: ['Mises à jour', 'En cours, en attente, livré, avec les vraies durées'],
  factures: ['Coûts et factures', 'Serveur, Workspace, Claude, modèles d’IA · relevé du ' + jj(D.factures[0] && D.factures[0].date) + ' et e-mails reçus depuis'],
  clipping: ['Clipping', 'KinGKlip : découper, publier, déclarer à Content Rewards'], trading: ['Trading', 'Les agents en simulation, et la bourse'],
  dropshipping: ['Dropshipping', 'Trouver un produit, vérifier le fournisseur, puis seulement tester'], libre: ['Agent libre', 'Gagner chaque jour, ou mourir et renaître plus sage'],
  candidatures: ['Candidatures', 'En un clic quand c’est possible ; sinon l’annonce s’ouvre, la lettre est prête'],
  siteweb: ['Site web', 'Sites vitrines à 500 € · ta liste d’appels (sans e-mail)'], integration: ['Intégration IA', 'Entreprises et pré-audits · ta liste d’appels et tes e-mails'],
  agenda: ['Agenda', 'Seulement les rappels importants : ceux qui ont une note'], clients: ['Clients', 'Seulement ceux qui sont intéressés, séparés par activité'],
  fiches: ['Toutes les fiches', 'Chaque commerce et chaque entreprise, avec où on en est'],
});
let TITRES = {};
function installer(d) {
  D = d; dates();
  AG = D.agents; SECT = Object.fromEntries(D.plan.secteurs.map((s) => [s.cle, s.nom]));
  ZONE_DU_SECTEUR = new Map(D.plan.quartiers.flatMap((q) => q.secteurs.map((s) => [s, q.cle])));
  C = D.clients; RAPPELS = D.rappels; OFFRES = D.offres;
  RELEVE = 'lu en direct à ' + heureP(D.NOW);
  TITRES = titres();
  if (!jourListe || jourListe < AUJ) jourListe = HEURE_P >= 19 ? DEMAIN : AUJ;
  if (!curseur) curseur = AUJ;
  evenements();
}

// ══ LES CHIFFRES DU MOMENT : toujours en haut, sur la période choisie, comparés à la période d'avant ══
let periode = '7';
const PERIODES = [['jour', 'Aujourd’hui'], ['7', '7 jours'], ['30', '30 jours']];
const LIB_PERIODE = { jour: 'aujourd’hui', 7: 'sur 7 jours', 30: 'sur 30 jours' };
let EV = { envois: [], appels: [] };
function dateHisto(dm) {
  const m = /^(\d{1,2})\/(\d{1,2})/.exec(dm || ''); if (!m) return null;
  const y = Number(AUJ.slice(0, 4)), iso = (an) => `${an}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  return iso(y) > plus(AUJ, 1) ? iso(y - 1) : iso(y);
}
function evenements() {
  EV.envois = C.filter((c) => c.envoye).map((c) => String(c.envoye).slice(0, 10));
  EV.appels = C.flatMap((c) => (c.histo || []).filter(([, x]) => /^Appel noté/.test(x)).map(([t]) => dateHisto(t))).filter(Boolean);
}
const nJours = () => periode === 'jour' ? 1 : Number(periode);
function compter(liste, decal = 0) { const n = nJours(), fin = plus(AUJ, -decal * n), debut = plus(fin, -(n - 1)); return liste.filter((j) => j >= debut && j <= fin).length; }
function variation(liste) {
  const n = compter(liste), avant = compter(liste, 1);
  if (!avant) return n ? '<span class="var">nouveau</span>' : '<span class="var neutre">= 0</span>';
  const p = Math.round((n - avant) / avant * 100);
  return p === 0 ? '<span class="var neutre">= stable</span>' : `<span class="var${p < 0 ? ' bas' : ''}">${p > 0 ? '↑' : '↓'} ${Math.abs(p)} %</span>`;
}
function courbe(liste, jours, couleur) {
  const s = []; for (let i = jours - 1; i >= 0; i--) { const j = plus(AUJ, -i); s.push(liste.filter((x) => x === j).length); }
  const max = Math.max(1, ...s), pts = s.map((v, i) => [i / (s.length - 1) * 70, 24 - v / max * 22]);
  const d = pts.map(([x, y], i) => (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1)).join(' ');
  return `<svg class="spark" viewBox="0 0 70 26" aria-hidden="true"><path d="${d} L70 26 L0 26 Z" fill="${couleur}" opacity=".14"/><path d="${d}" fill="none" stroke="${couleur}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
function kpis() {
  const appels = [...listeDuJour('site', jourListe), ...listeDuJour('ia', jourListe)];
  const aPasser = appels.filter((x) => x.type !== 'nouveau'), rdv = appels.filter((x) => x.type === 'rdv').length, nouveaux = appels.filter((x) => x.type === 'nouveau').length;
  const m = A?.matin, f = m?.faits, ig = A?.clips?.par_plateforme?.find((g) => g.valeur === 'instagram');
  const objClips = (m?.jugement || []).filter((o) => /clips sur/.test(o.objectif));
  const clipsOk = objClips.length ? objClips.every((o) => o.tenu) : null;
  const env = OFFRES.filter((o) => o.etat === 'envoye').length, clic = OFFRES.filter((o) => o.etat === 'clic').length, ouv = OFFRES.filter((o) => o.etat === 'ouvrir').length;
  const n = {}; for (const a of AG) n[etatOk(a.etat)] = (n[etatOk(a.etat)] || 0) + 1;
  const ordre = ['ok', 'vide', 'panne', 'attente', 'construction', 'afaire', 'arret', 'inconnu'];
  const abo = D.factures.reduce((s, x) => s + (x.montant_eur || 0), 0), ia = D.budget?.depense || 0, aRegler = D.factures.filter((x) => x.etat === 'panne');
  const pros = A?.prospection?.preaudits || [], rep = pros.reduce((s, x) => s + (x.reponses || 0), 0), reb = pros.reduce((s, x) => s + (x.rebonds || 0), 0);
  const cartes = [
    `<button class="kpi heros" type="button" data-aller="siteweb"><span class="etq">${ic('appel')}Appels à passer, ${jourListe === AUJ ? 'aujourd’hui' : 'demain'}</span>
      <span class="ligne"><b class="num">${aPasser.length}</b>${rdv ? `<span class="var">${rdv} rendez-vous</span>` : ''}</span>
      <small>${compter(EV.appels)} appels notés ${LIB_PERIODE[periode]} ${variation(EV.appels).replace('class="var', 'style="height:18px;padding:0 6px;font-size:10.5px" class="var')} · ${nouveaux} sans e-mail</small></button>`,
    `<button class="kpi" type="button" data-aller="integration"><span class="etq">${ic('mail')}E-mails envoyés</span>${courbe(EV.envois, periode === '30' ? 30 : 14, '#8b7cf6')}
      <span class="ligne"><b class="num">${compter(EV.envois)}</b>${variation(EV.envois)}</span>
      <small>${LIB_PERIODE[periode]}${pros.length ? ` · ${rep} réponse${rep > 1 ? 's' : ''}, ${reb} rebonds (pré-audits)` : ''}</small></button>`,
    `<button class="kpi" type="button" data-aller="clipping"><span class="etq">${ic('clipping')}Clips publiés hier</span>
      <span class="ligne"><b class="num">${f ? f.publies_total : '—'}</b>${clipsOk == null ? '' : `<span class="var${clipsOk ? '' : ' bas'}">${clipsOk ? 'objectif tenu' : 'objectif manqué'}</span>`}</span>
      <small>${ig ? `Instagram : médiane ${nombre(ig.vues_mediane)} vues · record ${nombre(ig.meilleur)}` : 'Bilan des clips non relevé'}</small></button>`,
    `<button class="kpi" type="button" data-aller="candidatures"><span class="etq">${ic('candidatures')}Candidatures envoyées</span>
      <span class="ligne"><b class="num">${env}</b>${clic ? `<span class="var alerte">${clic} à valider</span>` : ''}</span>
      <small>${clic} en un clic · ${ouv} à ouvrir toi-même</small></button>`,
    `<button class="kpi" type="button" data-aller="etat"><span class="etq">${ic('agents')}Agents en service</span>
      <span class="ligne"><b class="num">${n.ok || 0}<small> / ${AG.length}</small></b>${n.panne ? `<span class="var bas">${n.panne} en panne</span>` : '<span class="var">aucune panne</span>'}</span>
      <div class="barres-etats">${ordre.filter((k) => n[k]).map((k) => `<span style="width:${100 * n[k] / AG.length}%;background:${COULEUR_ETAT[k]}"></span>`).join('')}</div></button>`,
    `<button class="kpi" type="button" data-aller="factures"><span class="etq">${ic('factures')}Coûts du mois</span>
      <span class="ligne"><b class="num">≈ ${Math.round(abo + ia)} €</b>${aRegler.length ? `<span class="var bas">${euros(aRegler.reduce((s, x) => s + (x.montant_eur || 0), 0))} à régler</span>` : '<span class="var">à jour</span>'}</span>
      <small>${f ? `${kJ(f.jetons)} jetons hier (objectif 3 M)` : `IA ${euros(ia)} sur ${euros(D.budget?.plafond)}`}</small></button>`,
  ];
  $('#kpis').innerHTML = cartes.join('');
  $('#periode').innerHTML = PERIODES.map(([k, l]) => `<button type="button" data-periode="${k}" aria-pressed="${periode === k}">${l}</button>`).join('');
}

// ══ L'AGENCE : la 3D au centre, la colonne de droite suit le clic ══
let agence = null, SEL = { type: 'tout' };
const ZONE_PAGE = { commerce: 'siteweb', emploi: 'candidatures', medias: 'clipping', finance: 'trading', cerveau: 'majs', infra: 'etat' };
const SECTEUR_PAGE = { siteweb: 'siteweb', integration: 'integration', appels: 'siteweb', candidatures: 'candidatures', clipping: 'clipping', trading: 'trading', bourse: 'trading', dropshipping: 'dropshipping', libre: 'libre', gouvernance: 'majs', direction: 'majs', jarvis: 'etat', serveur: 'etat' };
function monterAgence() {
  if (agence) return;
  try {
    agence = creerAgence({ hote: $('#scene'), calque: $('#calque'), bulle: $('#bulle3d'), mobile: matchMedia('(max-width: 760px), (pointer: coarse)').matches,
      auChoix: (s) => { SEL = s; pilules(); colonne(); },
      auMode: (m) => { $('#scene').classList.toggle('visite', m === 'visite'); modes(); } });
  } catch (e) { $('#attente3d').innerHTML = 'La 3D ne peut pas s’afficher sur cet appareil (WebGL).<br>Tout reste lisible dans « Machine › État des agents ».'; agence = null; return; }
  $('#attente3d').style.display = 'none';
  if (D) agence.donnees(D);
  modes(); couchesHTML();
  $('#z-plus').onclick = () => agence.zoom(0.7); $('#z-moins').onclick = () => agence.zoom(1.4);
  $('#z-tout').onclick = () => agence.recentrer();
  $('#z-plein').onclick = () => { const s = $('#scene'); document.fullscreenElement ? document.exitFullscreen() : s.requestFullscreen?.(); };
}
function modes() {
  if (!agence) return;
  const m = agence.modeActuel;
  $('#modes').innerHTML = [['campus', 'Campus'], ['batiment', 'Bâtiment'], ['visite', 'Visite']].map(([k, l]) => `<button type="button" data-mode="${k}" aria-pressed="${m === k}">${ic(k)}<span>${l}</span></button>`).join('');
  $$('[data-mode]', $('#modes')).forEach((b) => b.onclick = () => agence.mode(b.dataset.mode));
}
function couchesHTML() {
  const c = agence.couches;
  $('#couches').innerHTML = [['etats', 'États'], ['flux', 'Flux'], ['noms', 'Noms'], ['murs', 'Murs']].map(([k, l]) => `<button type="button" data-couche="${k}" aria-pressed="${c[k]}">${l}</button>`).join('');
  $$('[data-couche]', $('#couches')).forEach((b) => b.onclick = () => { agence.couche(b.dataset.couche, !agence.couches[b.dataset.couche]); couchesHTML(); });
}
function legende3d() {
  const n = {}; for (const a of AG) n[etatOk(a.etat)] = (n[etatOk(a.etat)] || 0) + 1;
  $('#legende3d').innerHTML = ['ok', 'vide', 'panne', 'attente', 'construction', 'afaire', 'arret', 'inconnu'].filter((k) => n[k]).map((k) => `<span><i style="background:${COULEUR_ETAT[k]}"></i>${ETATS[k][1]} <b>${n[k]}</b></span>`).join('');
  const rh = D.direct?.releve_hote, frais = rh?.frais;
  $('#direct').className = 'direct vitre' + (frais ? '' : ' retard');
  $('#direct span').textContent = frais ? `En direct · lu à ${heureP(D.NOW)}` : 'Relevé du serveur en retard';
}
function selectionner(s, voler = true) { SEL = s; if (agence) agence.choisir(s, { voler }); pilules(); colonne(); }
function barreEtats(ag) {
  const n = {}; for (const a of ag) n[etatOk(a.etat)] = (n[etatOk(a.etat)] || 0) + 1;
  const ordre = ['ok', 'vide', 'panne', 'attente', 'construction', 'afaire', 'arret', 'inconnu'];
  return `<div class="barre-etats">${ordre.filter((k) => n[k]).map((k) => `<span style="width:${100 * n[k] / (ag.length || 1)}%;background:${COULEUR_ETAT[k]}"></span>`).join('')}</div>
    <div class="legende-etats">${ordre.filter((k) => n[k]).map((k) => `<span><i style="background:${COULEUR_ETAT[k]}"></i>${ETATS[k][1]} <b class="num">${n[k]}</b></span>`).join('')}</div>`;
}
function aFaire() {
  const l = [];
  const rdvAuj = RAPPELS.filter((r) => r.note && r.jour <= AUJ), rap = RAPPELS.filter((r) => !r.note && r.jour <= AUJ);
  const appels = [...listeDuJour('site', jourListe), ...listeDuJour('ia', jourListe)].filter((x) => x.type !== 'nouveau');
  if (rdvAuj.length) l.push(['agenda', 'agenda', '#ff7a1a', rdvAuj.length, 'Rendez-vous de l’agenda', rdvAuj.slice(0, 2).map((r) => r.nom).join(', ')]);
  if (appels.length) l.push(['siteweb', 'appel', '#ff7a1a', appels.length, `Appels à passer ${jourListe === AUJ ? 'aujourd’hui' : 'demain'}`, `${rap.length} à rappeler, en retard compris`]);
  const fa = D.factures.filter((f) => f.etat === 'panne'); if (fa.length) l.push(['factures', 'factures', '#ff5d5d', fa.length, 'Facture à régler', fa.map((f) => f.nom + ' · ' + f.montant).join(', ')]);
  const ret = D.majs.attente.filter((o) => o.retard); if (ret.length) l.push(['majs', 'majs', '#ff5d5d', ret.length, 'Ordres en retard (plus de 24 h)', ret[0].titre]);
  const clic = OFFRES.filter((o) => o.etat === 'clic'); if (clic.length) l.push(['candidatures', 'candidatures', '#fbbf24', clic.length, 'Candidatures en un clic', clic[0].titre]);
  const br = D.brouillons.filter((k) => !envoyes.has(k)); if (br.length) l.push(['integration', 'mail', '#8b7cf6', br.length, 'E-mails prêts à valider', 'Ils partent à 8 h une fois validés']);
  const pannes = AG.filter((a) => a.etat === 'panne'); if (pannes.length) l.push(['etat', 'alerte', '#ff5d5d', pannes.length, 'Agents en panne', pannes.slice(0, 3).map((a) => a.nom).join(', ')]);
  return `<div class="carte"><div class="carte-tete"><h2>À faire maintenant</h2><span class="puce plus">${l.length}</span></div>
    <div class="faire">${l.map(([v, i, c, n, t, s]) => `<button type="button" data-aller="${v}" style="--c:${c}"><span class="ico">${ic(i)}</span><span style="min-width:0"><b>${esc(t)}</b><small>${esc(s)}</small></span><span class="n num" style="color:${c}">${n}</span></button>`).join('') || '<div class="vide">Rien d’urgent.</div>'}</div></div>`;
}
function objectifsHier() {
  const m = A?.matin;
  return `<div class="carte"><div class="carte-tete"><h2>Objectifs d’hier</h2>${m ? `<span class="puce plus ${m.jugement.every((o) => o.tenu) ? 'ok' : 'alerte'}">${m.jugement.filter((o) => o.tenu).length} sur ${m.jugement.length}</span>` : ''}</div>
    ${m ? `<div class="objectifs">${m.jugement.map((o) => `<div><i style="background:${o.tenu ? 'rgba(61,220,151,.15)' : 'rgba(255,93,93,.15)'};color:${o.tenu ? '#3ddc97' : '#ff8080'}">${o.tenu ? '✓' : '✕'}</i><span>${esc(o.objectif)}</span><small>${esc(o.detail)}</small></div>`).join('')}</div>`
    : '<p class="note" style="padding:0 18px 16px">Non relevé : le gouverneur du matin passe à 6 h 30 UTC.</p>'}</div>`;
}
function semaine() {
  const jours = [...Array(7)].map((_, i) => plus(AUJ, i));
  return `<div class="carte"><div class="carte-tete"><h2>Cette semaine</h2><span class="note plus">rappels · relances</span></div><div class="semaine">${jours.map((j) => {
    const r = RAPPELS.filter((x) => x.jour === j), avecNote = r.filter((x) => x.note).length, rel = (D.relances?.[j] || 0) + (D.relancesIa?.[j] || 0);
    return `<button type="button" data-aller="agenda" class="${j === AUJ ? 'auj' : ''}" title="${r.length} rappel(s), dont ${avecNote} avec note ; ${rel} relance(s) prévue(s)"><small>${dateFr(j, { weekday: 'short' }).replace('.', '')}</small><b class="num">${new Date(j + 'T12:00:00').getDate()}</b>
      <span class="pts">${[...Array(Math.min(3, avecNote))].map(() => '<i style="background:#ff7a1a"></i>').join('')}${r.length - avecNote > 0 ? '<i style="background:#60a5fa"></i>' : ''}${rel ? '<i style="background:#8b7cf6"></i>' : ''}</span></button>`; }).join('')}</div></div>`;
}
function filDirect() {
  const cle = (iso) => jourP(iso) + 'T' + new Date(iso).toLocaleTimeString('fr-FR', { ...TZ, hour: '2-digit', minute: '2-digit' });
  const l = (D.majs.livrees || []).slice(0, 6).map((x) => [cle(x.le), x.ok ? 'ok' : 'panne', x.ok ? `Mise en service ${x.sujet ? '· ' + x.sujet : x.sha}` : 'Version refusée, retour arrière', quandDT(x.le)]);
  for (const e of (D.apresAppel || []).slice(0, 6)) {
    const m = /(\d\d)\/(\d\d) à (\d+) h (\d\d)/.exec(e.quand || ''), j = m ? dateHisto(m[1] + '/' + m[2]) : null;
    l.push([j ? j + 'T' + m[3].padStart(2, '0') + ':' + m[4] : '', e.statut === 'envoye' ? 'ok' : e.statut === 'erreur' ? 'panne' : 'info', `${e.statut === 'envoye' ? 'E-mail parti' : e.statut === 'erreur' ? 'E-mail refusé' : 'E-mail en cours'} : ${e.a}`, e.quand]);
  }
  l.sort((a, b) => b[0].localeCompare(a[0]));
  return `<div class="carte"><div class="carte-tete"><h2>En direct</h2><span class="note plus">${esc(RELEVE)}</span></div><ul class="fil">${l.slice(0, 8).map(([, p, t, q]) => `<li><span class="point ${p}"></span><span>${esc(t)}</span><time>${esc(q)}</time></li>`).join('') || '<li class="vide">Rien de relevé.</li>'}</ul></div>`;
}
function panneauZone(cle) {
  const q = D.plan.quartiers.find((x) => x.cle === cle); if (!q) return '';
  const ag = AG.filter((a) => q.secteurs.includes(a.secteur)), coul = COULEUR_ZONE[cle] || '#8b91a0';
  let chiffres = '';
  if (cle === 'commerce') {
    const appels = [...listeDuJour('site', jourListe), ...listeDuJour('ia', jourListe)];
    chiffres = `<div class="kv"><div><span>Appels à passer</span><b>${appels.filter((x) => x.type !== 'nouveau').length}</b></div><div><span>Sans e-mail, à appeler</span><b>${appels.filter((x) => x.type === 'nouveau').length}</b></div>
      <div><span>E-mails envoyés ${LIB_PERIODE[periode]}</span><b>${compter(EV.envois)}</b></div><div><span>Clients intéressés</span><b>${interesses().length}</b></div></div>`;
  } else if (cle === 'emploi') {
    const g = (e) => OFFRES.filter((o) => o.etat === e).length;
    chiffres = `<div class="kv"><div><span>En un clic</span><b>${g('clic')}</b></div><div><span>À ouvrir toi-même</span><b>${g('ouvrir')}</b></div><div><span>Dans la file de l’Envoyeur</span><b>${g('file')}</b></div><div><span>Déjà envoyées</span><b>${g('envoye')}</b></div></div>`;
  } else if (cle === 'medias') {
    const c = A?.clips, ig = c?.par_plateforme?.find((g) => g.valeur === 'instagram'), yt = c?.par_plateforme?.find((g) => g.valeur === 'youtube');
    chiffres = c ? `<div class="kv"><div><span>Clips suivis</span><b>${c.clips_suivis}</b></div><div><span>Instagram, vues médianes</span><b>${nombre(ig?.vues_mediane)}</b></div><div><span>Record</span><b>${nombre(ig?.meilleur)}</b></div><div><span>YouTube, vues médianes</span><b>${nombre(yt?.vues_mediane)}</b></div><div><span>Seuil de paiement</span><b>3 000 à 4 000 vues</b></div></div>` : '<p class="note">Bilan des clips non relevé.</p>';
  } else if (cle === 'finance') {
    const t = D.vies?.trading?.tableau || [];
    chiffres = t.length ? `<div class="kv">${t.slice(0, 5).map(([n, , v]) => { const p = (v - 1000) / 10; return `<div><span>${esc(n)}</span><b style="color:${p < 0 ? '#ff8080' : '#3ddc97'}">${(p > 0 ? '+' : p < 0 ? '−' : '') + Math.abs(p).toFixed(1).replace('.', ',')} %</b></div>`; }).join('')}</div><p class="date-txt" style="margin:8px 0 0">1 000 € fictifs chacun</p>` : '';
  } else if (cle === 'cerveau') {
    chiffres = `<div class="kv"><div><span>Ordres en cours</span><b>${D.majs.encours.length}</b></div><div><span>Ordres en attente</span><b>${D.majs.attente.length}</b></div><div><span>dont en retard</span><b style="color:#ff8080">${D.majs.attente.filter((o) => o.retard).length}</b></div><div><span>Livraisons depuis le ${jj(jourP(D.majs.stats.depuis))}</span><b>${D.majs.stats.n}</b></div></div>`;
  } else if (cle === 'infra') {
    const rh = D.direct?.releve_hote;
    chiffres = `<div class="kv"><div><span>Relevé du serveur</span><b>${rh ? 'il y a ' + rh.age_min + ' min' : 'absent'}</b></div><div><span>Dernière livraison</span><b>${D.majs.livrees[0] ? quandDT(D.majs.livrees[0].le) : '—'}</b></div><div><span>Mise en service (médiane)</span><b>${duree(D.majs.stats.porte_med)}</b></div><div><span>Budget IA ce mois</span><b>${euros(D.budget?.depense)} / ${euros(D.budget?.plafond)}</b></div></div>`;
  }
  const vie = D.vies?.[{ medias: 'clipping', emploi: 'candidatures' }[cle] || ''];
  return `<div class="carte pad"><div class="tete-ag"><div style="min-width:0"><span class="etiq" style="color:${coul}">Zone</span><h3>${esc(q.nom)}</h3><div class="sous">${ag.length} agents · ${q.secteurs.map((s) => esc(SECT[s] || s)).join(', ')}</div></div>
      <button class="fermer" type="button" data-tout="1" aria-label="Fermer">${ic('fermer')}</button></div>${barreEtats(ag)}
      ${vie?.resume ? `<p class="note" style="margin-top:10px">${esc(vie.resume)}</p>` : ''}
      ${chiffres ? `<div style="margin-top:12px">${chiffres}</div>` : ''}
      <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap"><button class="btn noir petit" type="button" data-aller="${ZONE_PAGE[cle] || 'etat'}">Ouvrir la page</button><button class="btn petit" type="button" data-visite="1">${ic('visite')}Visiter</button></div></div>
    <div class="carte"><div class="carte-tete"><h2>Les agents</h2><span class="puce plus">${ag.length}</span></div><div style="padding:0 8px 10px">${ag.map(ligneAgentL).join('')}</div></div>`;
}
function panneauAgent(id) {
  const a = AG.find((x) => x.id === id); if (!a) return '';
  const page = SECTEUR_PAGE[a.secteur];
  return `<div class="carte pad" style="display:flex;flex-direction:column;gap:14px">${teteAgent(a, true)}${vivant(a)}
    <div style="display:flex;gap:8px;flex-wrap:wrap">${page ? `<button class="btn noir petit" type="button" data-aller="${page}">Voir sa page</button>` : ''}<button class="btn petit" type="button" data-agent="${esc(a.id)}">Fiche complète</button><button class="btn petit discret" type="button" data-nouvelle="${esc(SECT[a.secteur])} › ${esc(a.nom)}">${ic('drapeau')}Signaler</button></div></div>`;
}
function colonne() {
  if (!D) return;
  let h = '';
  if (SEL.type === 'agent') h = panneauAgent(SEL.id);
  else if (SEL.type === 'zone') h = panneauZone(SEL.cle);
  if (!h) {
    const actifs = AG.filter((a) => ['ok', 'vide', 'panne', 'attente'].includes(a.etat)).length, ok = AG.filter((a) => a.etat === 'ok').length;
    h = `<div class="carte pad"><span class="etiq">L’agence</span><div class="grand num" style="margin-top:6px">${Math.round(100 * ok / (actifs || 1))} %<small> en service · ${AG.length} agents</small></div>${barreEtats(AG)}</div>`;
    const g = A?.agents?.suivis || [];
    h += aFaire() + objectifsHier();
    if (g.length) h += `<div class="carte"><div class="carte-tete"><h2>Le gouverneur des agents propose</h2></div><div style="padding:0 8px 10px">${g.slice(0, 4).map((x) => `<button class="agent-l" type="button" data-agent3d="${esc(x.id)}" style="--z:${COULEUR_ZONE[ZONE_DU_SECTEUR.get(x.secteur)] || '#8b91a0'};--e:${COULEUR_ETAT[etatOk(x.etat)]};grid-template-columns:30px minmax(0,1fr)"><span class="av">${esc(initiales(x.nom))}</span><span style="white-space:normal"><b style="display:block;font-size:13px">${esc(x.nom)}</b><small style="white-space:normal">${esc(x.proposition)}</small></span></button>`).join('')}</div></div>`;
    h += semaine() + filDirect();
  } else h += aFaire();
  $('#colonne').innerHTML = h;
}

// ══ MACHINE · ÉTAT DES AGENTS (v6) + le gouverneur ══
function etat() {
  const col = (k) => AG.filter((a) => COLONNE(a) === k);
  const bien = col('bien').sort((a, b) => (a.sante ? 0 : 1) - (b.sante ? 0 : 1)), mal = col('mal').sort((a, b) => ['panne', 'vide', 'arret'].indexOf(a.etat) - ['panne', 'vide', 'arret'].indexOf(b.etat)), af = col('afaire');
  const ligne = (a, droite, rouge, detail) => `<button class="ligne-a" type="button" data-agent="${a.id}"><span class="point ${ETATS[etatOk(a.etat)][0]}"></span><b>${esc(a.nom)}</b>
    <span class="quand${rouge ? ' rouge' : ''}">${esc(droite)}</span><small><em>${esc(SECT[a.secteur])} ·</em> ${esc(detail)}</small></button>`;
  const lecture = D.direct || {}, rh = lecture.releve_hote;
  const alertes = [...(lecture.erreurs || []).map((e) => 'Lecture en échec : ' + e),
    ...(!rh ? ['Le relevé du serveur (journaux des tâches, porte, conteneurs) n’est pas encore arrivé.'] : !rh.frais ? ['Le relevé du serveur date de ' + quandDT(rh.le) + ' : les agents qui en dépendent sont « non relevés ».'] : [])];
  const depuisBien = (a) => a.sante ? 'sain depuis ' + ecart(a.sante.depuis) : a.dernier ? 'passé il y a ' + ecart(a.dernier) : '';
  const g = A?.agents?.suivis || [];
  return `<div class="chiffres">
      <div class="carte chiffre"><span class="etiq">Tournent bien</span><b class="num" style="color:var(--ok)">${bien.length}</b><small>Le plus ancien sans panne : ${esc(bien.filter((a) => a.sante && a.sante.type === 'jamais').sort((a, b) => a.sante.depuis.localeCompare(b.sante.depuis))[0]?.nom || '—')}</small></div>
      <div class="carte chiffre"><span class="etiq">Ne tournent pas</span><b class="num" style="color:var(--panne)">${mal.length}</b><small>${mal.filter((a) => a.etat === 'panne').length} en panne · ${mal.filter((a) => a.etat === 'vide').length} à vide · ${mal.filter((a) => a.etat === 'arret').length} arrêtés</small></div>
      <div class="carte chiffre noir"><span class="etiq">À mettre en place ou réparer</span><b class="num">${af.length + mal.filter((a) => a.etat === 'panne').length}</b><small>Les durées sont des estimations, marquées comme telles</small></div></div>
    ${alertes.length ? `<div class="carte alerte-lecture">${alertes.map(esc).join('<br>')}</div>` : ''}
    ${g.length ? `<div class="carte"><div class="carte-tete"><span class="point alerte"></span><h2>Le gouverneur des agents propose</h2><span class="note plus">${esc(A.agents.le)}</span></div><ul class="listes">${g.map((x) => `<li><span class="point ${ETATS[etatOk(x.etat)][0]}"></span><span><b>${esc(x.nom)}</b> : ${esc(x.raison)} → ${esc(x.proposition)}</span></li>`).join('')}</ul></div>` : ''}
    ${depuisHTML()}
    <div class="trois">
      <div class="carte colonne-a"><header><span class="point ok"></span><h2>Tourne bien</h2><span class="num">${bien.length}</span></header>${bien.map((a) => ligne(a, depuisBien(a), false, a.mesure || a.maintenant)).join('')}</div>
      <div class="carte colonne-a"><header><span class="point panne"></span><h2>Ne tourne pas</h2><span class="num">${mal.length}</span></header>${mal.map((a) => ligne(a, a.depuis ? 'depuis ' + ecart(a.depuis) : '—', a.etat === 'panne', a.bloque)).join('')}</div>
      <div class="carte colonne-a"><header><span class="point info"></span><h2>À mettre en place ou réparer</h2><span class="num">${af.length + mal.filter((a) => a.etat === 'panne').length}</span></header>${af.map((a) => ligne(a, a.duree || '', false, a.ensuite)).join('')}
        ${mal.filter((a) => a.etat === 'panne').map((a) => ligne(a, 'réparer', true, a.ensuite)).join('')}</div></div>`;
}
function depuisHTML() {
  if (!D.depuis || !D.depuis.lignes.length) return '';
  return `<div class="carte"><div class="carte-tete"><span class="point info"></span><h2>Vérifié à la main</h2><span class="note plus">${esc(D.depuis.quand)}</span></div><ul class="listes">${D.depuis.lignes.map(([e, t]) => `<li><span class="point ${e}"></span><span>${esc(t)}</span></li>`).join('')}</ul></div>`;
}

// ══ MACHINE · MISES À JOUR (v6) ══
function majs() {
  const M = D.majs, s = M.stats;
  return `<div class="chiffres">
      <div class="carte chiffre"><span class="etiq">Livraisons depuis le ${jj(jourP(s.depuis))}</span><b class="num">${s.n}</b><small>${s.echecs} refusée${s.echecs > 1 ? 's' : ''} par la vérification, chaque fois remplacée${s.echecs > 1 ? 's' : ''} par la précédente${s.fige ? ' · relevé du ' + jj(s.date) : ''}</small></div>
      <div class="carte chiffre"><span class="etiq">Du changement à la mise en service</span><b class="num">${duree(s.total_med)}</b><small>Médiane relevée le ${jj(s.total_date || s.date)} : banc d’essai GitHub compris</small></div>
      <div class="carte chiffre"><span class="etiq">Mise en service seule</span><b class="num">${duree(s.porte_med)}</b><small>${s.fige ? 'Médiane relevée le ' + jj(s.date) : 'Médiane des ' + s.porte_sur + ' dernières'} : de l’arrivée sur le serveur au redémarrage</small></div></div>
    <div class="deux" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr)">
      <div class="carte"><div class="carte-tete"><span class="point info"></span><h2>En cours</h2></div><ul class="listes">${M.encours.map((e) => `<li><span class="point info"></span><div><b>${esc(e.titre)}</b> <span style="color:var(--doux)">· ${esc(e.pour)} · commencé ${quandDT(e.depuis)}</span><div style="color:var(--doux)">${esc(e.detail)}</div></div></li>`).join('')}</ul></div>
      <div class="carte"><div class="carte-tete"><span class="point panne"></span><h2>En attente</h2><span class="note plus">En rouge : plus de 24 h</span></div><ul class="listes">${M.attente.slice().sort((a, b) => a.depuis.localeCompare(b.depuis)).map((e) => `<li><span class="point ${e.retard ? 'panne' : 'info'}"></span><div><b>${esc(e.titre)}</b> <span style="color:${e.retard ? '#ff8080' : 'var(--doux)'};font-weight:700">· depuis ${ecart(e.depuis)}</span><div style="color:var(--doux)">Ordre n° ${e.id} du ${quandDT(e.depuis).replace(/^le /, '')} · pour ${esc(e.pour)}</div></div></li>`).join('') || '<li class="vide">Aucun ordre en attente.</li>'}</ul></div></div>
    <div class="carte"><div class="carte-tete"><span class="point ok"></span><h2>Livré</h2><span class="note plus">Les dernières · journal de la porte${D.direct && D.direct.releve_hote ? ', relevé ' + quandDT(D.direct.releve_hote.le) : ''}</span></div><div class="defile"><table class="tableau"><thead><tr><th>Mis en service</th><th>Changement</th><th class="droite">Version</th><th class="droite">Mise en service</th></tr></thead><tbody>
      ${M.livrees.map((l) => `<tr><td class="num" style="white-space:nowrap;color:${l.ok ? 'var(--doux)' : '#ff8080'}">${quandDT(l.le)}</td><td>${esc(l.sujet || (l.ok ? 'Sujet à lire sur GitHub' : 'Version refusée, retour arrière'))}</td><td class="droite num">${l.lien ? `<a href="${esc(l.lien)}" target="_blank" rel="noopener">${esc(l.sha)}</a>` : '—'}</td><td class="droite num">${duree(l.porte)}</td></tr>`).join('') || '<tr><td colspan="4" class="vide">Le journal de la porte arrive avec le relevé du serveur.</td></tr>'}</tbody></table></div></div>`;
}

// ══ MACHINE · COÛTS ET FACTURES (v6) ══
function factures() {
  const F = D.factures, total = F.reduce((s, f) => s + (f.montant_eur || 0), 0), aRegler = F.filter((f) => f.etat === 'panne');
  const proch = F.filter((f) => f.prochaine && f.prochaine >= AUJ).sort((a, b) => a.prochaine.localeCompare(b.prochaine))[0];
  const f = A?.matin?.faits;
  return `<div class="chiffres">
      <div class="carte chiffre noir"><span class="etiq">À régler maintenant</span><b class="num">${aRegler.length ? euros(aRegler.reduce((s, f) => s + (f.montant_eur || 0), 0)) : 'Rien'}</b><small>${aRegler.map((f) => esc(f.nom + ' : ' + f.etatTxt + (f.dernierMail ? ', dernier e-mail ' + quandDT(f.dernierMail.le) : ''))).join(' · ') || 'Aucune facture en retard connue'}</small></div>
      <div class="carte chiffre"><span class="etiq">Prochain prélèvement connu</span><b class="num">${proch ? jj(proch.prochaine) : '—'}</b><small>${proch ? esc(proch.nom + ' : ' + proch.montant) : 'Aucun connu'}</small></div>
      <div class="carte chiffre"><span class="etiq">Abonnements par mois</span><b class="num">≈ ${total.toFixed(0)} €</b><small>${F.map((f) => (f.approx ? '≈ ' : '') + (f.approx ? String(f.montant_eur) : euros(f.montant_eur).replace(' €', ''))).join(' + ')} (montants relevés le ${jj(F[0] && F[0].date)})</small></div></div>
    ${f ? `<div class="carte"><div class="carte-tete"><h2>Jetons d’hier</h2><span class="note plus">Gouverneur du matin · ${esc(A.matin.le)}</span></div><div class="chiffres" style="padding:4px 18px 18px">
      <div class="bloc"><span class="etiq">Tous les jetons</span><b style="font-size:24px;font-weight:650" class="num">${kJ(f.jetons)}</b><span class="note">Objectif d’Hermes : sous 3 M</span></div>
      <div class="bloc"><span class="etiq">Jetons des ordres</span><b style="font-size:24px;font-weight:650" class="num">${kJ(f.jetons_ordres)}</b><span class="note">Objectif : sous 1,5 M</span></div>
      <div class="bloc"><span class="etiq">E-mails envoyés hier</span><b style="font-size:24px;font-weight:650" class="num">${nombre(f.envois)}</b><span class="note">${nombre(f.rebonds)} rebond${f.rebonds > 1 ? 's' : ''}</span></div></div></div>` : ''}
    <div class="trois">${F.map((f) => `<div class="carte" style="padding:16px 18px;display:flex;flex-direction:column;gap:12px">
      <div style="display:flex;align-items:flex-start;gap:10px"><div style="min-width:0;flex:1"><span class="etiq">${esc(f.rythme)}</span><h2 style="margin:2px 0 0;font-size:17px;font-weight:650">${esc(f.nom)}</h2><div class="note">${esc(f.quoi)}</div></div><b style="font-size:21px;font-weight:650;letter-spacing:-.03em" class="num">${esc(f.montant)}</b></div>
      <div>${puceEtat(f.etat === 'panne' ? 'panne' : f.etat === 'ok' ? 'ok' : 'alerte').replace(/>[^<]*<\/span>$/, '>' + esc(f.etatTxt) + '</span>')}</div>
      <ul class="histo">${f.lignes.map(([d, t]) => `<li><time>${esc(d)}</time><span>${esc(t)}</span></li>`).join('')}</ul>
      <div class="bloc"><span class="etiq">Prochaine échéance</span><div style="font-weight:650">${esc(f.prochaineTxt)}</div></div>
      <p class="date-txt" style="margin:0">Relevé du ${jj(f.date)}${f.dernierMail ? ' ; e-mails reçus depuis : lus en direct' : ''}.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">${f.lien && f.etat !== 'ok' ? `<a class="btn noir petit" href="${esc(f.lien.url)}" target="_blank" rel="noopener">${esc(f.lien.texte)}</a>` : ''}
        ${f.etat !== 'ok' ? `<button class="btn petit" type="button" data-reglee="${esc(f.cle)}">C’est réglé</button>` : ''}</div></div>`).join('')}</div>
    ${creditsHTML()}
    <div class="carte"><div class="carte-tete"><h2>Les modèles d’IA et ce qu’ils coûtent</h2><span class="note plus">${esc(D.modelesSource)}</span></div><div class="defile"><table class="tableau"><thead><tr><th>Modèle</th><th>Chez</th><th>Prix</th><th class="droite">Jetons 7 j</th><th class="droite">Jetons 30 j</th><th class="droite">Coût 30 j</th><th>Qui l’utilise</th></tr></thead><tbody>
      ${D.modelesIA.map((m) => `<tr><td><b>${esc(m.nom)}</b></td><td style="color:var(--doux)">${esc(m.fournisseur)}</td><td><span class="puce${/^Gratuit/.test(m.prix) ? ' ok' : /coupé/.test(m.prix) ? '' : ' alerte'}">${esc(m.prix)}</span></td><td class="droite num">${m.j7 == null ? '—' : kJ(m.j7)}</td><td class="droite num">${m.j30 == null ? '—' : kJ(m.j30)}</td><td class="droite num">${esc(m.cout)}</td><td style="color:var(--doux);font-size:12.5px">${esc(m.agents)}</td></tr>`).join('')}</tbody></table></div>
      <p class="note" style="padding:12px 18px 16px">${esc(D.modelesNote)}</p></div>`;
}
function creditsHTML() {
  const c = D.credits || {}, b = D.budget || {}, g = b.gardien, abo = D.factures.reduce((s, f) => s + (f.montant_eur || 0), 0);
  const cases = b.plafond != null ? [['Budget des modèles payants', euros(b.plafond), 'Plafond de l’Économe, ce mois'], ['Dépensé ce mois', euros(b.depense), 'Économe, lu ' + quandDT(b.le)], ['Reste ce mois', euros(b.reste), 'Avant le plafond']]
    : [['Budget des modèles payants', '—', 'Lecture de l’Économe en échec']];
  if (c.openrouter) cases.push(['Crédit OpenRouter', c.openrouter, (c.openrouter_detail || '') + ' (relevé du ' + jj(c.date) + ')']);
  return `<div class="carte"><div class="carte-tete"><h2>Crédits du mois</h2><span class="note plus">Abonnements ≈ ${abo.toFixed(0)} € + IA ${euros(b.depense || 0)} ce mois</span></div>
    ${g ? `<p class="note" style="padding:0 18px 8px">Gardien, ${quandDT(g.le)} : ${euros(g.estime)} estimés sur ${euros(g.budget)} de budget ce mois.</p>` : ''}
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;padding:4px 18px 18px">${cases.map(([e, v, s]) => `<div class="bloc"><span class="etiq">${esc(e)}</span><b style="font-size:23px;font-weight:650;letter-spacing:-.03em" class="num">${esc(v)}</b><span class="note">${esc(s)}</span></div>`).join('')}</div>
    ${c.gemini ? `<p class="note" style="padding:0 18px 16px">${esc(c.gemini)}</p>` : ''}</div>`;
}

// ══ PÔLES : la page de chaque agent (v6), avec le bilan de l'analyste pour le clipping ══
function clipsAnalyseHTML() {
  const c = A?.clips; if (!c) return '<div class="carte alerte-lecture">Bilan de l’analyste des clips non relevé (il passe chaque matin à 6 h 10 UTC).</div>';
  const tab = (titre, l) => l && l.length ? `<div class="carte"><div class="carte-tete"><h2>${titre}</h2></div><div class="defile"><table class="tableau"><thead><tr><th></th><th class="droite">Clips</th><th class="droite">Vues médianes</th><th class="droite">Regardé (médiane)</th><th class="droite">Record</th></tr></thead><tbody>
    ${l.map((g) => `<tr><td><b>${esc(g.valeur)}</b></td><td class="droite num">${g.clips}</td><td class="droite num">${nombre(g.vues_mediane)}</td><td class="droite num">${g.regarde_mediane == null ? '—' : Math.round(g.regarde_mediane * 100) + ' %'}</td><td class="droite num">${nombre(g.meilleur)}</td></tr>`).join('')}</tbody></table></div></div>` : '';
  const rep = Object.entries(c.repartition || {});
  return `<div class="deux" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr)">${tab('Par plateforme', c.par_plateforme)}${tab('Par niche', c.par_niche)}</div>
    ${rep.length ? `<div class="carte pad"><span class="etiq">Répartition des prochains clips (70 % au meilleur, le reste à l’essai)</span><div class="legende-etats" style="margin-top:10px">${rep.map(([k, v]) => `<span><i style="background:#ff8a3d"></i>${esc(k)} <b class="num">${Math.round(v * 100)} %</b></span>`).join('')}</div><p class="date-txt" style="margin:10px 0 0">Analyste des clips · ${esc(c.le)} · ${c.clips_suivis} clips suivis</p></div>` : ''}`;
}
function pageAgent(k) {
  const v = D.vies[k]; if (!v) return '<div class="carte vide">Pas de page pour ce pôle.</div>';
  const e = v.etat;
  const liste = (l, cls) => l && l.length ? `<ol class="temps${cls ? ' ' + cls : ''}">${l.map(([t, x]) => `<li><time>${esc(t)}</time><span>${esc(x)}</span></li>`).join('')}</ol>` : '<p class="vide" style="padding:16px 20px">Rien.</p>';
  const puces = (l, c) => l && l.length ? `<ul class="listes">${l.map((x) => `<li><span class="point ${c}"></span><span>${esc(x)}</span></li>`).join('')}</ul>` : '<p class="vide" style="padding:16px 20px">Rien pour l’instant.</p>';
  let extra = '', avant = '';
  if (v.explication) avant = `<div class="carte explication"><b style="font-size:15px">${esc(v.explication.titre)}</b>${v.explication.date ? ` <span class="date-txt">· écrit le ${jj(v.explication.date)}</span>` : ''}<ol>${v.explication.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ol></div>`;
  if (v.verification) extra += `<div class="carte"><div class="carte-tete"><h2>Les ${v.verification.reduce((s, x) => s + x[2], 0)} publications, vérifiées une par une</h2><span class="note plus">${v.verification_le ? 'Liens testés ' + quandDT(v.verification_le) : 'Pas encore vérifiées'}</span></div><div class="defile"><table class="tableau"><thead><tr><th>Plateforme</th><th>Compte</th><th class="droite">Publiés</th><th class="droite">En ligne</th><th class="droite">Introuvables</th></tr></thead><tbody>
    ${v.verification.map(([p, c, n, ok, ko]) => `<tr><td><b>${esc(p)}</b></td><td style="color:var(--doux)">${esc(c)}</td><td class="droite num">${n}</td><td class="droite num" style="color:var(--ok);font-weight:700">${ok}</td><td class="droite num" style="color:${ko ? '#ff8080' : 'var(--doux)'};font-weight:700">${ko}</td></tr>`).join('')}</tbody></table></div></div>`;
  if (v.tableau) extra += `<div class="deux" style="grid-template-columns:minmax(0,1.4fr) minmax(0,1fr)"><div class="carte"><div class="carte-tete"><h2>Les agents de trading</h2><span class="note plus">1 000 € fictifs chacun · ${esc(RELEVE)}</span></div><div class="defile"><table class="tableau"><thead><tr><th>Agent</th><th>Règle de départ</th><th class="droite">Valeur</th><th class="droite">Résultat</th><th class="droite">Opérations</th><th class="droite">Frais</th></tr></thead><tbody>
    ${v.tableau.map(([n, r, val, op, fr]) => { const p = (val - 1000) / 10; return `<tr><td><b>${esc(n)}</b></td><td style="color:var(--doux)">${esc(r)}</td><td class="droite num">${val.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €</td><td class="droite num" style="font-weight:700;color:${p < -10 ? '#ff8080' : p < 0 ? 'var(--alerte)' : 'var(--ok)'}">${(p > 0 ? '+' : p < 0 ? '−' : '') + Math.abs(p).toFixed(1).replace('.', ',')} %</td><td class="droite num">${op.toLocaleString('fr-FR')}</td><td class="droite num">${fr.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €</td></tr>`; }).join('')}</tbody></table></div></div>
    <div class="carte"><div class="carte-tete"><h2>Bourse</h2><span class="note plus">Rétro-test 12 mois · réel au ${jj(v.bourse_le)}</span></div><div class="defile"><table class="tableau"><thead><tr><th>Stratégie</th><th class="droite">12 mois</th><th class="droite">En réel</th></tr></thead><tbody>
    ${(v.bourse || []).map(([n, r, a]) => `<tr><td><b>${esc(n)}</b></td><td class="droite num" style="font-weight:700;color:${r.startsWith('−') ? '#ff8080' : 'var(--ok)'}">${esc(r)}</td><td class="droite num">${esc(a)}</td></tr>`).join('')}</tbody></table></div></div></div>`;
  if (v.schema) extra += `<div class="carte"><div class="carte-tete"><h2>Comment il vivra</h2><span class="note plus">Ton schéma du 08/10</span></div><div class="schema">${v.schema.map(([t, x], i) => `${i ? '<div class="fleche">→</div>' : ''}<div class="etape-s${i === 0 ? ' noire' : ''}"><b>${esc(t)}</b>${esc(x)}</div>`).join('')}</div></div>
    <div class="carte"><div class="carte-tete"><h2>Ses garde-fous</h2></div>${puces(v.garde_fous, 'gris')}</div>`;
  const sous = v.sous && v.sous.length ? `<div class="carte"><div class="carte-tete"><h2>Sous-agents : qui fait quoi, quand, pourquoi</h2></div><div class="defile"><table class="tableau"><thead><tr><th>Sous-agent</th><th>Ce qu’il fait</th><th>Quand</th><th>Pourquoi ce choix</th><th>Outils · jetons</th><th class="droite">État</th></tr></thead><tbody>
    ${v.sous.map((s) => `<tr class="${s.n === 2 ? 'niveau2' : ''}"><td style="min-width:150px"><b>${esc(s.nom)}</b></td><td>${esc(s.fait)}</td><td style="color:var(--doux);min-width:110px">${esc(s.quand)}</td><td style="color:var(--doux)">${esc(s.pourquoi)}</td><td>${outilsHTML(s.outils)}</td><td class="droite">${puceEtat(s.etat)}</td></tr>`).join('')}</tbody></table></div></div>` : '';
  return `<div class="carte bandeau-ag"><div>${puceEtat(e)}<p>${esc(v.resume)}</p></div>${outilsHTML(v.outils) || '<div class="outils"><span class="outil">Aucun outil<i>0 jeton</i></span></div>'}</div>
    ${k === 'candidatures' ? offresHTML() : ''}${k === 'clipping' ? clipsAnalyseHTML() : ''}${avant}
    <div class="trois"><div class="carte"><div class="carte-tete"><span class="etiq">Passé</span></div>${liste(v.passe)}</div><div class="carte"><div class="carte-tete"><span class="etiq" style="color:var(--orange-2)">Présent</span></div>${liste(v.present, 'present')}</div><div class="carte"><div class="carte-tete"><span class="etiq">Avenir</span></div>${liste(v.avenir)}</div></div>
    ${extra}${sous}
    <p class="date-txt" style="margin:0">Textes écrits le ${jj(D.direct && D.direct.textes_le)} ; résumé, chiffres et tableaux ${esc(RELEVE)}.</p>
    <div class="trois"><div class="carte"><div class="carte-tete"><span class="point panne"></span><h2>Problèmes</h2></div>${puces(v.problemes, 'panne')}</div><div class="carte"><div class="carte-tete"><span class="point ok"></span><h2>Réussites</h2></div>${puces(v.reussites, 'ok')}</div><div class="carte"><div class="carte-tete"><span class="point info"></span><h2>Solutions en cours</h2></div>${puces(v.solutions, 'info')}</div></div>`;
}

// ══ CANDIDATURES (v6) ══
let voirToutesOffres = false;
function offresHTML() {
  const g = (e) => OFFRES.filter((o) => o.etat === e);
  const ligne = (o, boutons) => `<div class="coche offre"><span style="min-width:0"><b>${esc(o.titre)}</b><small>${esc(o.entreprise)}${o.lieu ? ' · ' + esc(o.lieu) : ''} · ${esc(o.source)}${o.lettre ? ' · lettre prête' : ''}${o.raison ? ' · ' + esc(o.raison) : ''}</small></span><span style="display:flex;gap:6px">${boutons}</span></div>`;
  const clic = g('clic'), file = g('file'), mp = g('mpage'), ouv = g('ouvrir').sort((a, b) => (b.lettre - a.lettre) || ((b.score || 0) - (a.score || 0))), env = g('envoye');
  const vus = voirToutesOffres ? ouv : ouv.slice(0, 10);
  return `<div class="deux" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr)">
    <div class="carte"><div class="carte-tete"><h2>En un clic</h2><span class="puce plus">${clic.length}</span></div><p class="note" style="padding:0 18px 10px">« Postuler » la valide : l’Envoyeur la prend à son prochain passage, avec ta lettre et ton CV suisse.</p>
      <div class="coches">${clic.map((o) => ligne(o, `<button class="btn noir petit" type="button" data-postuler="${esc(o.cle)}">Postuler</button>`)).join('') || '<div class="vide">Aucune offre à canal automatique en attente.</div>'}
      ${file.length ? `<div class="section-appels" style="padding:12px 18px 0"><h3>Dans la file de l’Envoyeur <span class="num">${file.length}</span></h3></div>${file.map((o) => ligne({ ...o, raison: 'validée ' + quandDT(o.depuis) + (o.detail ? ' · ' + o.detail : '') }, '')).join('')}` : ''}
      ${mp.length ? `<div class="section-appels" style="padding:12px 18px 0"><h3>Michael Page <span class="num">${mp.length}</span><small>· l’envoi automatique attend ton accord</small></h3></div>${mp.slice(0, 4).map((o) => ligne(o, `<a class="btn petit" href="${esc(o.lien)}" target="_blank" rel="noopener">${ic('ext')}Annonce</a><button class="btn noir petit" type="button" data-postule="${esc(o.cle)}">J’ai postulé</button>`)).join('')}` : ''}</div></div>
    <div class="carte"><div class="carte-tete"><h2>À ouvrir toi-même</h2><span class="puce plus">${ouv.length}</span></div><p class="note" style="padding:0 18px 10px">Pas de canal automatique (LinkedIn, sites d’entreprise…) : l’annonce s’ouvre, tu postules, puis « J’ai postulé ».</p>
      <div class="coches">${vus.map((o) => ligne(o, `${o.lien ? `<a class="btn petit" href="${esc(o.lien)}" target="_blank" rel="noopener">${ic('ext')}Annonce</a>` : ''}<button class="btn noir petit" type="button" data-postule="${esc(o.cle)}">J’ai postulé</button>`)).join('')}</div>
      ${ouv.length > vus.length ? `<div style="padding:12px 18px 16px"><button class="btn petit" type="button" id="voir-offres">Voir les ${ouv.length - vus.length} autres</button></div>` : ''}</div></div>
    <p class="note">${env.length} candidatures déjà envoyées (lu en direct ; les offres françaises ne sont jamais proposées).</p>`;
}
async function postuler(cle, moi, bouton) {
  const o = OFFRES.find((x) => x.cle === cle); if (!o) return;
  try {
    await poster('/api/candidatures/' + encodeURIComponent(cle), { statut: moi ? 'postule_main' : 'valide' }, bouton);
    toast(moi ? `${o.titre} : noté « postulé »` : `${o.titre} : validée, l’Envoyeur la prend à son prochain passage`);
    await charger(false);
  } catch (e) { toast(`${o.titre} : ${e.message}`); }
}

// ══ COMMERCE (v6) : la liste d'un jour = rendez-vous, puis « à rappeler », puis les nouveaux SANS e-mail ══
let jourListe = null, ouvertRappel = null, curseur = null;
function corpsCategorie(k) { return D.modeles.site.corps.replace('Ce que je propose', k.phrase + '\n\nCe que je propose'); }
function ouvrirCategorie(nom) {
  const k = D.categories.find((x) => x.nom === nom), m = D.modeles.site;
  tiroir('Site web · e-mail par catégorie', k.nom, `${k.metiers.join(', ')} · ${k.n} commerces dans ta base`,
    `<div class="note">Objet : <b style="color:var(--encre)">${esc(m.objet)}</b></div><div class="lettre">${esc(corpsCategorie(k))}</div>
    <div class="bloc"><span class="etiq">Ce qui change selon la catégorie</span><div>${esc(k.phrase)}</div></div>
    <div class="bloc"><span class="etiq">Source du chiffre, vérifiée le 08/10</span>${m.sources.map(([c, s, u]) => `<div class="source"><b style="color:var(--encre)">${esc(c)}</b><br>${esc(s)} · <a href="${esc(u)}" target="_blank" rel="noopener">la source</a></div>`).join('')}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><button class="btn" type="button" data-nouvelle="E-mail par catégorie · ${esc(k.nom)}">Demander une retouche</button><span class="raison">Pour valider la phrase, demande-le : elle sera posée par Claude.</span></div>`);
}
function carteCategories() {
  return `<div class="carte"><div class="carte-tete"><h2>L’e-mail par catégorie</h2><span class="puce alerte plus">À valider</span></div><p class="note" style="padding:0 18px 10px">Le même e-mail, avec une phrase propre au métier (proposition du 14/10, pas encore en service).</p>
    <div class="coches">${D.categories.map((k) => `<button class="coche" type="button" data-categorie="${esc(k.nom)}" style="border-left:0;border-right:0;border-bottom:0;background:none;text-align:left;grid-template-columns:minmax(0,1fr) auto"><span style="min-width:0"><b>${esc(k.nom)}</b><small>${esc(k.metiers.join(', '))}</small></span><span class="note num">${k.n}</span></button>`).join('')}</div></div>`;
}
const notes = new Map();
const envoyes = new Set();
function listeDuJour(seg, jour) {
  const dejaNote = (c) => notes.has(c.cle);
  const r = RAPPELS.filter((x) => x.jour <= jour).map((x) => ({ x, c: C.find((c) => c.cle === x.cle) })).filter(({ c }) => c && c.seg === seg && !dejaNote(c) && c.tel && c.etape !== 'non');
  const rdv = r.filter(({ x }) => x.note).map(({ c, x }) => ({ c, type: 'rdv', note: x.note, jour: x.jour }));
  const arap = r.filter(({ x }) => !x.note).map(({ c, x }) => ({ c, type: 'rappel', jour: x.jour, motif: x.motif }));
  const avecRappel = new Set(RAPPELS.map((x) => x.cle));
  const nouv = C.filter((c) => c.seg === seg && c.etape === 'aappeler' && c.tel && !c.email && !avecRappel.has(c.cle) && !dejaNote(c)).map((c) => ({ c, type: 'nouveau' }));
  return [...rdv, ...arap, ...nouv];
}
let voirTousNouveaux = false;
function carteAppel({ c, type, note, jour, motif }) {
  const ctx = type === 'rdv' ? `<div class="note-rdv"><b>Ta note :</b> ${esc(note)}</div>` : '';
  const quoi = { rdv: `Rendez-vous de l’agenda · ${quand(jour)}`, rappel: `${motif ? motif.charAt(0).toUpperCase() + motif.slice(1) : 'À rappeler, sans note'}${jour < AUJ ? ' · en retard depuis le ' + jj(jour) : ''}`, nouveau: c.dernier || 'Jamais appelé' }[type];
  return `<div class="carte appel" data-cle="${c.cle}">
    <div class="qui"><b>${esc(c.nom)}</b><small>${esc(c.metier)} · ${esc(c.ville)}</small></div>
    <div class="numero"><span class="num">${esc(c.tel)}</span><button type="button" data-copier="${esc(c.tel)}" aria-label="Copier le numéro">${ic('copier')}</button></div>
    <div class="resultat"><button class="btn noir" type="button" data-res="interesse">Intéressé</button><button class="btn" type="button" data-res="non">Pas intéressé</button><button class="btn" type="button" data-res="pasjoint">Pas joint</button><button class="btn" type="button" data-res="rappeler" aria-expanded="${ouvertRappel === c.cle}">À rappeler</button></div>
    <div class="contexte">${ctx}<span>${esc(quoi)}</span>${c.slug ? `<a href="https://cockpit.raime.fr/demo/${esc(c.slug)}" target="_blank" rel="noopener">Voir sa maquette</a>` : ''}<a href="#" data-fiche="${c.cle}">Fiche</a>${c.seg === 'site' && c.slug ? `<button class="btn noir petit" type="button" data-envoi="${c.cle}">Envoyer la maquette</button>` : ''}${c.seg === 'ia' && c.audit ? `<a href="${esc(c.audit)}" target="_blank" rel="noopener">Voir le pré-audit</a><button class="btn noir petit" type="button" data-envoi="${c.cle}">Envoyer le pré-audit</button>` : ''}</div>
    ${ouvertRappel === c.cle ? `<div class="form-rappel"><input type="date" id="r-date" value="${DEMAIN}" min="${DEMAIN}" aria-label="Date du rappel"><input type="text" id="r-note" placeholder="Une note ? (ex. : rappeler après 14 h, veut un devis)" aria-label="Note"><button class="btn noir petit" type="button" data-noter="${c.cle}">Noter</button>
      <p>Sans note, il revient dans ta liste d’appels le jour choisi. Avec une note, il part à l’agenda à cette date, ta note visible.</p></div>` : ''}</div>`;
}
function sectionsAppels(seg) {
  const l = listeDuJour(seg, jourListe), g = (t) => l.filter((x) => x.type === t);
  const S = [['rdv', 'Rendez-vous de l’agenda', 'avec ta note'], ['rappel', 'À rappeler', 'notés sans note : ils reviennent ici'], ['nouveau', 'À appeler : sans e-mail', 'ils ne reçoivent rien par e-mail, seul un appel les touche']];
  return S.map(([t, n, s]) => { let x = g(t); if (!x.length) return ''; const tout = x.length; if (t === 'nouveau' && !voirTousNouveaux) x = x.slice(0, 12);
    return `<div class="section-appels"><h3>${n} <span class="num">${tout}</span>${s ? `<small>· ${s}</small>` : ''}</h3><div class="appels">${x.map(carteAppel).join('')}</div>
      ${t === 'nouveau' && tout > x.length ? `<button class="btn" style="margin-top:10px" type="button" id="voir-nouveaux">Voir les ${tout - x.length} autres</button>` : ''}</div>`; }).join('') || '<div class="carte vide">Personne à appeler ce jour-là.</div>';
}
function bandeauJour(seg) {
  return `<div class="bandeau"><div class="filtres" role="group" aria-label="Jour">${[[AUJ, 'Aujourd’hui'], [DEMAIN, 'Demain, ' + dateFr(DEMAIN, { weekday: 'long', day: 'numeric' })]].map(([j, n]) => `<button class="filtre" type="button" data-jourl="${j}" aria-pressed="${jourListe === j}">${n}<b class="num">${listeDuJour(seg, j).filter((x) => x.type !== 'nouveau').length}</b></button>`).join('')}</div>
    <p class="note" style="margin-left:auto">Tu appelles avec ton téléphone, puis un clic sur le résultat : la liste et l’agenda suivent.</p></div>`;
}
function carteModele(k) {
  const m = D.modeles[k];
  return `<div class="carte"><div class="carte-tete"><h2>Le modèle d’e-mail</h2><span class="puce alerte plus">À valider</span></div>
    <div style="padding:0 18px 16px;display:flex;flex-direction:column;gap:10px"><div class="note">Objet : <b style="color:var(--encre)">${esc(m.objet)}</b></div>
    <p class="note">Ce que fait rAIme, le risque de ne rien faire, un chiffre sourcé, puis l’offre et l’accompagnement.</p>
    <button class="btn noir petit" style="align-self:flex-start" type="button" data-modele="${k}">Lire le modèle et ses sources</button></div></div>`;
}
function ouvrirModele(k) {
  const m = D.modeles[k];
  tiroir(k === 'site' ? 'Site web · commerces' : 'Intégration IA · entreprises', 'Le modèle d’e-mail', 'Objet : ' + m.objet,
    `<div class="lettre">${esc(m.corps)}</div>${m.exemple ? `<div class="bloc"><span class="etiq">Exemple de chiffre du pré-audit</span><div>${esc(m.exemple)}</div></div>` : ''}
    <div class="bloc"><span class="etiq">Sources vérifiées le 08/10</span>${m.sources.map(([c, s, u]) => `<div class="source"><b style="color:var(--encre)">${esc(c)}</b><br>${esc(s)} · <a href="${esc(u)}" target="_blank" rel="noopener">la source</a></div>`).join('')}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><button class="btn" type="button" data-nouvelle="Modèle d’e-mail · ${k === 'site' ? 'site web' : 'intégration IA'}">Demander une retouche</button><span class="raison">Modèle relevé le 08/10.</span></div>`);
}
function carteEnvoyes(seg) {
  const l = (D.apresAppel || []).filter((e) => e.seg === seg);
  const etat = (e) => e.statut === 'envoye' ? 'Parti' : e.statut === 'erreur' ? 'Refusé' : 'En cours';
  return `<div class="carte"><div class="carte-tete"><h2>Envoyés après l’appel</h2><span class="puce plus">${l.length}</span></div>
    <p class="note" style="padding:0 18px 8px">« Parti » : le service d’envoi l’a accepté et lui a donné un numéro de suivi. Une copie arrive aussi dans la boîte de contact@raime.fr.</p>
    <ul class="mini-liste">${l.slice(0, 12).map((e) => `<li style="align-items:flex-start"><span style="min-width:0"><b style="font-weight:600;color:var(--encre)">${esc(e.a)}</b><br><small class="note">${esc(e.quand)} · ${esc(e.sujet)}</small>${e.erreur ? `<br><small style="color:#ff8080">${esc(e.erreur)}</small>` : ''}</span><span class="${e.statut === 'envoye' ? '' : 'raison'}">${etat(e)}</span></li>`).join('') || '<li><span>Aucun pour l’instant</span><span></span></li>'}</ul></div>`;
}
function prospectionHTML() {
  const p = A?.prospection?.preaudits; if (!p || !p.length) return '';
  return `<div class="carte"><div class="carte-tete"><h2>Pré-audits par métier</h2><span class="note plus">Analyste de la prospection · ${esc(A.prospection.le)}</span></div><div class="defile"><table class="tableau"><thead><tr><th>Métier</th><th class="droite">Envoyés</th><th class="droite">Livrés</th><th class="droite">Rebonds</th><th class="droite">Réponses</th><th class="droite">Appelés</th><th class="droite">Intéressés</th></tr></thead><tbody>
    ${p.map((x) => `<tr><td><b>${esc(x.metier)}</b></td><td class="droite num">${x.envoyes}</td><td class="droite num">${x.livres}</td><td class="droite num" style="color:${x.taux_rebond > 0.1 ? '#ff8080' : 'inherit'}">${x.rebonds}</td><td class="droite num">${x.reponses}</td><td class="droite num">${x.appeles}</td><td class="droite num">${x.interesses}</td></tr>`).join('')}</tbody></table></div></div>`;
}
function siteweb() {
  const bloq = C.filter((c) => c.seg === 'site' && c.etape === 'completer');
  return `${bandeauJour('site')}<div class="deux"><div style="display:flex;flex-direction:column;gap:16px;min-width:0">${sectionsAppels('site')}</div>
    <aside class="cote">
      <div class="carte"><div class="carte-tete"><h2>Bloquées</h2><span class="puce panne plus">${bloq.length}</span></div><p class="note" style="padding:0 18px 10px">Sans numéro de téléphone : validées sans pouvoir partir, ou numéro à lire dans un annuaire.</p>
        <div class="coches">${bloq.map((c) => `<button class="coche" type="button" data-fiche="${c.cle}" style="border-left:0;border-right:0;border-bottom:0;background:none;text-align:left;grid-template-columns:minmax(0,1fr) auto"><span style="min-width:0"><b>${esc(c.nom)}</b><small>${esc(c.metier)} · ${esc(c.ville)}</small></span><span class="note">Compléter</span></button>`).join('') || '<div class="vide">Aucune.</div>'}</div></div>
      ${carteEnvoyes('site')}${carteCategories()}</aside></div>`;
}
const choisis = new Set();
function integration() {
  const b = D.brouillons.filter((k) => !envoyes.has(k)).map((k) => C.find((c) => c.cle === k)).filter(Boolean);
  return `${bandeauJour('ia')}<div class="deux"><div style="display:flex;flex-direction:column;gap:16px;min-width:0">${sectionsAppels('ia')}
      <div class="carte"><div class="carte-tete"><h2>E-mails prêts à valider</h2><span class="puce plus">${b.length}</span></div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:0 18px 12px"><button class="btn petit" type="button" id="tout-choisir">${choisis.size === b.length && b.length ? 'Tout désélectionner' : 'Tout sélectionner'}</button>
          <button class="btn noir petit" type="button" id="envoyer-choix"${choisis.size ? '' : ' disabled'}>Valider la sélection (${choisis.size})</button><span class="note" style="margin-left:auto">L’Expéditeur les envoie chaque matin à 8 h, chacun avec le pré-audit de son métier</span></div>
        <div class="coches">${b.map((c) => `<label class="coche"><input type="checkbox" data-choix="${c.cle}"${choisis.has(c.cle) ? ' checked' : ''}><span style="min-width:0"><b>${esc(c.nom)}</b><small>${esc(c.metier)} · ${esc(c.ville)} · ${esc(c.email || '')}</small></span><button class="btn petit discret" type="button" data-fiche="${c.cle}">Lire</button></label>`).join('') || '<div class="vide">Tout est parti.</div>'}</div></div>
      ${prospectionHTML()}</div>
    <aside class="cote">${carteEnvoyes('ia')}${carteModele('ia')}</aside></div>`;
}
function agenda() {
  const o = RAPPELS.filter((r) => r.note).sort((a, b) => a.jour.localeCompare(b.jour));
  const gr = [['En retard', (r) => r.jour < AUJ], ['Aujourd’hui', (r) => r.jour === AUJ], ['Demain', (r) => r.jour === DEMAIN], ['Plus tard', (r) => r.jour > DEMAIN]];
  const d = new Date(curseur + 'T12:00:00'), titre = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const sansNote = RAPPELS.filter((r) => !r.note).length;
  return `<div class="boite"><div class="carte liste">${gr.map(([t, f]) => { const l = o.filter(f); return l.length ? `<h3><span>${t}</span><span class="num">${l.length}</span></h3>` + l.map((r) => `<button class="element" type="button" data-rappel="${r.id}"><b>${esc(r.nom)} · ${quand(r.jour)}</b><small>${esc(r.note)}</small></button>`).join('') : ''; }).join('')}
      <p class="note" style="padding:12px 12px 6px">${sansNote} rappels sans note ne sont pas ici : ils reviennent dans ta liste d’appels, le jour dit. Glisse un rappel sur un autre jour pour le reporter. <a href="/agenda" style="font-weight:700;text-decoration:none">L’agenda complet</a></p></div>
    <div class="carte" style="padding:16px 18px 18px"><div style="display:flex;align-items:center;gap:8px;margin-bottom:14px"><h2 style="margin:0 auto 0 0;font-size:21px;font-weight:650;letter-spacing:-.02em">${titre.charAt(0).toUpperCase() + titre.slice(1)}</h2>
      <button class="rond" type="button" id="prec" aria-label="Mois précédent">‹</button><button class="rond" type="button" id="suiv" aria-label="Mois suivant">›</button></div>${mois(o)}</div></div>`;
}
function mois(o) {
  const d = new Date(curseur + 'T12:00:00'), p = new Date(d.getFullYear(), d.getMonth(), 1, 12), s = new Date(p); s.setDate(1 - ((p.getDay() + 6) % 7));
  let h = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'].map((j) => `<div class="etiq" style="padding:0 6px 6px">${j}</div>`).join('');
  for (let i = 0; i < 42; i++) { const c = new Date(s); c.setDate(s.getDate() + i); const j = isoDe(c), l = o.filter((r) => r.jour === j), hors = c.getMonth() !== d.getMonth();
    h += `<div data-jour="${j}" style="min-height:92px;padding:6px;border-radius:14px;background:var(--surface-2);display:flex;flex-direction:column;gap:4px;min-width:0;${hors ? 'opacity:.35' : ''}">
      <span class="num" style="width:24px;height:24px;display:grid;place-items:center;border-radius:50%;font-size:12px;font-weight:700;${j === AUJ ? 'background:var(--orange);color:#fff' : 'color:var(--doux)'}">${c.getDate()}</span>
      ${l.map((r) => `<div draggable="true" data-id="${r.id}" data-rappel="${r.id}" title="${esc(r.nom)} : ${esc(r.note)}" style="font-size:11.5px;padding:4px 8px;border-radius:8px;background:rgba(139,124,246,.22);border-left:3px solid var(--violet);color:var(--encre);cursor:grab;line-height:1.3"><b>${esc(r.nom)}</b><div style="opacity:.75;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.note)}</div></div>`).join('')}</div>`; }
  return `<div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px">${h}</div>`;
}
const interesses = () => C.filter((c) => c.etape === 'interesse' || c.etape === 'gagne');
function clients() {
  const bloc = (seg, titre, sous) => { const l = interesses().filter((c) => c.seg === seg);
    return `<div class="carte"><div class="carte-tete"><h2>${titre}</h2><span class="puce ok plus">${l.length}</span></div><p class="note" style="padding:0 18px 12px">${sous}</p>
      ${l.length ? `<div class="coches">${l.map((c) => { const r = RAPPELS.find((x) => x.cle === c.cle);
        return `<div class="coche" style="grid-template-columns:minmax(0,1fr) auto auto"><span style="min-width:0"><b>${esc(c.nom)}</b><small>${esc(c.metier)} · ${esc(c.ville)} · ${esc(c.tel || '')}</small><small>${esc(c.dernier || '')}${r ? ' · ' + (r.note ? 'à l’agenda ' : 'à rappeler ') + quand(r.jour) : ''}</small></span>
          ${seg === 'site' && c.slug ? `<a class="btn petit" href="https://cockpit.raime.fr/demo/${esc(c.slug)}" target="_blank" rel="noopener">Sa maquette</a>` : '<span></span>'}<button class="btn noir petit" type="button" data-fiche="${c.cle}">Fiche</button></div>`; }).join('')}</div>`
        : '<div class="vide">Personne pour l’instant. Un clic sur « Intéressé » dans une liste d’appels l’ajoute ici.</div>'}</div>`; };
  return `<div class="deux" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr)">${bloc('site', 'Site web', 'Intéressés par un site à 500 €.')}${bloc('ia', 'Intégration IA', 'Intéressés par l’IA dans leur entreprise.')}</div>
    <p class="note">Les autres fiches sont dans « Toutes les fiches » ; « Pas intéressé » sort de toutes les listes.</p>`;
}
let segC = 'tous', statC = 'tous', chercheC = '';
const contacte = (c) => ['attente', 'rappel', 'interesse', 'non', 'appele', 'repondu', 'gagne'].includes(c.etape);
const STATS_C = [['tous', 'Tous', () => true], ['contactes', 'Déjà contactés', contacte], ['recontacter', 'À recontacter', (c) => !!c.rappel], ['repondu', 'Ont répondu', (c) => ['interesse', 'non', 'repondu', 'gagne'].includes(c.etape)]];
const ETAPE_TXT = { non: 'Pas intéressé', appele: 'Appelé', aenvoyer: 'E-mail prêt à valider', rappel: 'À rappeler', interesse: 'Intéressé', aappeler: 'À appeler', attente: 'Contacté, sans réponse', completer: 'Fiche à compléter',
  repondu: 'A répondu à l’e-mail', valide: 'Validé, pas encore parti', gagne: 'Client', nonrecu: 'E-mail non reçu' };
function clientsTous() {
  const q = chercheC.toLowerCase(), f = STATS_C.find((s) => s[0] === statC)[2];
  const base = C.filter((c) => segC === 'tous' || c.seg === segC);
  const l = base.filter(f).filter((c) => !q || (c.nom + ' ' + c.ville + ' ' + c.metier + ' ' + (c.tel || '')).toLowerCase().includes(q)).sort((a, b) => a.nom.localeCompare(b.nom));
  return `<div class="bandeau"><div class="filtres" role="group" aria-label="Activité">${[['tous', 'Tout'], ['site', 'Site web'], ['ia', 'Intégration IA']].map(([k, n]) => `<button class="filtre" type="button" data-segc="${k}" aria-pressed="${segC === k}">${n}</button>`).join('')}</div>
      <span style="width:1px;height:24px;background:var(--bord-2);margin:0 4px"></span>
      <div class="filtres" role="group" aria-label="Statut">${STATS_C.map(([k, n, g]) => `<button class="filtre" type="button" data-statc="${k}" aria-pressed="${statC === k}">${n}<b class="num">${base.filter(g).length}</b></button>`).join('')}</div>
      <label class="cherche"><svg class="i" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/></svg><input id="cherche-c" value="${esc(chercheC)}" placeholder="Nom, ville, métier, numéro…" aria-label="Chercher une fiche"></label></div>
    <div class="carte defile"><table class="tableau"><thead><tr><th>Fiche</th><th>Ville</th><th>Où en est-on</th><th>Dernier contact</th><th>Téléphone</th></tr></thead><tbody>
      ${l.slice(0, 200).map((c) => `<tr class="cliquable" data-fiche="${c.cle}"><td class="qui"><b>${esc(c.nom)}</b><small>${c.seg === 'site' ? 'Site web' : 'Intégration IA'} · ${esc(c.metier)}</small></td><td>${esc(c.ville)}</td>
        <td><span class="puce${c.etape === 'interesse' ? ' ok' : ''}">${notes.has(c.cle) ? esc(notes.get(c.cle)) : ETAPE_TXT[c.etape] || ''}${c.rappel ? ' · ' + nomJour(c.rappel) : ''}</span></td><td style="color:var(--doux)">${esc(c.dernier || '—')}</td><td class="num" style="white-space:nowrap">${esc(c.tel || '—')}</td></tr>`).join('') || '<tr><td colspan="5" class="vide">Aucune fiche.</td></tr>'}</tbody></table></div>
    ${l.length > 200 ? `<p class="note">${l.length - 200} autres : précise ta recherche.</p>` : ''}`;
}
async function noterAppel(cle, res, jour, note) {
  const c = C.find((x) => x.cle === cle); if (!c) return;
  const boutons = $$(`[data-cle="${cle}"] button`); boutons.forEach((b) => { b.disabled = true; });
  const resultat = { interesse: 'interesse', non: 'pas_interesse', pasjoint: 'pas_joint', rappeler: 'rappeler' }[res];
  try {
    const d = await poster('/api/v6/appel/' + cle, resultat === 'rappeler' ? { resultat, echeance: jour, note: note || null } : { resultat });
    const suite = d.suivant ? quand(d.suivant.jour) : null;
    const msg = resultat === 'rappeler' ? (note ? `${c.nom} : à l’agenda ${quand(jour)}, avec ta note` : `${c.nom} : revient dans ta liste d’appels ${quand(jour)}`)
      : resultat === 'interesse' ? `${c.nom} : intéressé, noté${suite ? ' ; relance ' + suite : ''}` : resultat === 'pas_joint' ? `${c.nom} : pas joint${suite ? ', il revient dans ta liste ' + suite : ''}`
      : `${c.nom} : pas intéressé, noté`;
    ouvertRappel = null; toast(msg); await charger(false);
  } catch (e) { boutons.forEach((b) => { if (b.isConnected) b.disabled = false; }); toast(`${c.nom} : ${e.message}`); }
}

// ══ TIROIR, FICHE, DEMANDE, RECHERCHE (v6) ══
let dernierFocus = null;
function tiroir(sur, titre, sous, html, pied = '') { dernierFocus = document.activeElement; $('#t-sur').textContent = sur; $('#t-titre').textContent = titre; $('#t-sous').textContent = sous; $('#t-corps').innerHTML = html; $('#t-pied').innerHTML = pied;
  $('#tiroir').classList.add('ouvert'); $('#tiroir').setAttribute('aria-hidden', 'false'); $('#voile').classList.add('ouvert'); $('#t-fermer').focus(); brancherTiroir(); }
function fermerTiroir() { if (!$('#tiroir').classList.contains('ouvert')) return; $('#tiroir').classList.remove('ouvert'); $('#tiroir').setAttribute('aria-hidden', 'true'); $('#voile').classList.remove('ouvert'); $('#t-pied').innerHTML = ''; if (dernierFocus && dernierFocus.focus) dernierFocus.focus(); }
$('#t-fermer').onclick = fermerTiroir; $('#voile').onclick = fermerTiroir;
function brancherTiroir() {
  const t = $('#t-corps');
  $$('[data-fiche]', t).forEach((b) => b.onclick = (e) => { e.preventDefault(); fiche(C.find((c) => c.cle === b.dataset.fiche)); });
  $$('[data-voir3d]', t).forEach((b) => b.onclick = () => { fermerTiroir(); aller('agence'); selectionner({ type: 'agent', id: b.dataset.voir3d }); });
}
function fiche(c) {
  if (!c) return;
  const r = RAPPELS.find((x) => x.cle === c.cle);
  tiroir(c.seg === 'site' ? 'Site web · commerce' : 'Intégration IA · entreprise', c.nom, `${c.metier} · ${c.ville}`,
    `<div class="bloc"><span class="etiq">Où en est-on</span><div style="font-weight:650">${esc(notes.get(c.cle) || ETAPE_TXT[c.etape] || '')}${r ? ' · ' + (r.note ? 'à l’agenda ' : 'dans ta liste ') + quand(r.jour) : ''}</div>${r && r.note ? `<div>${esc(r.note)}</div>` : ''}${c.raison ? `<div style="color:#ff8080">${esc(c.raison)}</div>` : ''}</div>
    <dl class="meta"><dt>Téléphone</dt><dd class="num" style="font-size:18px;font-weight:600">${esc(c.tel || '—')}</dd><dt>E-mail</dt><dd>${esc(c.email || '—')}</dd></dl>
    ${c.corps ? `<details class="bloc"><summary style="cursor:pointer;font-weight:650">L’e-mail ${c.etape === 'aenvoyer' ? 'prêt' : 'envoyé'} · ${esc(c.sujet || '')}</summary><div class="lettre" style="margin-top:10px;background:var(--surface)">${esc(c.corps)}</div></details>` : ''}
    <div><span class="etiq">Historique</span><ul class="histo" style="margin-top:10px">${(c.histo && c.histo.length ? c.histo : [['—', 'Rien encore']]).map(([t, x]) => `<li><time>${esc(t)}</time><span>${esc(x)}</span></li>`).join('')}</ul></div>
    ${c.seg === 'site' && c.statut === 'a_completer' ? `<div class="bloc"><span class="etiq">Compléter la fiche</span><div style="display:flex;gap:8px;flex-wrap:wrap"><input id="f-numero" type="tel" placeholder="04 50 12 34 56" aria-label="Son numéro, lu dans un annuaire" style="height:34px;border:1px solid var(--bord-2);border-radius:10px;padding:0 10px;background:var(--surface)"><button class="btn noir petit" type="button" id="f-numero-ok" data-vid="${c.vid}">Enregistrer le numéro</button></div><span class="raison">Le commerce passe ensuite dans ta liste d’appels.</span></div>` : ''}
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">${c.slug ? `<a class="btn petit" href="https://cockpit.raime.fr/demo/${esc(c.slug)}" target="_blank" rel="noopener">${ic('ext')}Voir la maquette</a><button class="btn noir petit" type="button" data-envoi="${c.cle}">Envoyer la maquette</button>` : ''}${c.seg === 'ia' && c.audit ? `<a class="btn petit" href="${esc(c.audit)}" target="_blank" rel="noopener">${ic('ext')}Voir le pré-audit</a><button class="btn noir petit" type="button" data-envoi="${c.cle}">Envoyer le pré-audit</button>` : ''}
      <button class="btn petit" type="button" data-nouvelle="Client › ${esc(c.nom)}">${ic('drapeau')}Signaler</button></div>`);
  $$('[data-envoi]', $('#t-corps')).forEach((b) => b.onclick = () => envoiMaquette(c));
  const ok = $('#f-numero-ok'); if (ok) ok.onclick = async () => { try { await poster('/api/vitrines/' + ok.dataset.vid, { action: 'telephone', numero: $('#f-numero').value }, ok); toast(c.nom + ' : numéro enregistré, il passe dans ta liste d’appels'); fermerTiroir(); await charger(false); } catch (e) { toast(e.message); } };
}
function chercherPartout(q) {
  q = q.toLowerCase().trim(); if (!q) return;
  const ag = AG.filter((a) => (a.nom + ' ' + (SECT[a.secteur] || '')).toLowerCase().includes(q)).slice(0, 8);
  const l = C.filter((c) => (c.nom + ' ' + c.ville + ' ' + c.metier + ' ' + (c.tel || '')).toLowerCase().includes(q)).slice(0, 30);
  if (l.length === 1 && !ag.length) return fiche(l[0]);
  tiroir('Recherche', `« ${q} »`, `${ag.length} agent${ag.length > 1 ? 's' : ''} · ${l.length} fiche${l.length > 1 ? 's' : ''}`,
    `${ag.length ? `<div><span class="etiq">Agents</span><div style="margin-top:6px">${ag.map(ligneAgentL).join('')}</div></div>` : ''}
    ${l.length ? `<div><span class="etiq">Fiches</span><div class="coches" style="margin-top:6px">${l.map((c) => `<button class="coche" type="button" data-fiche="${c.cle}" style="border-left:0;border-right:0;border-bottom:0;background:none;text-align:left;grid-template-columns:minmax(0,1fr) auto"><span style="min-width:0"><b>${esc(c.nom)}</b><small>${c.seg === 'site' ? 'Site web' : 'Intégration IA'} · ${esc(c.metier)} · ${esc(c.ville)}</small></span><span class="note">${esc(notes.get(c.cle) || ETAPE_TXT[c.etape] || '')}</span></button>`).join('')}</div></div>` : ''}
    ${!ag.length && !l.length ? '<div class="vide">Rien trouvé.</div>' : ''}`);
  $$('[data-agent3d]', $('#t-corps')).forEach((b) => b.onclick = () => { fermerTiroir(); aller('agence'); selectionner({ type: 'agent', id: b.dataset.agent3d }); });
}
function ouvrirDemande(sujet) {
  const opts = ['Le cockpit en général', ...GROUPES.flatMap((g) => g.pages.map(([, n]) => g.nom + ' › ' + n))]; if (sujet && !opts.includes(sujet)) opts.unshift(sujet);
  $('#f-sujet').innerHTML = opts.map((o) => `<option${o === sujet ? ' selected' : ''}>${esc(o)}</option>`).join(''); $('#f-texte').value = '';
  $('#fenetre').classList.add('ouverte'); setTimeout(() => $('#f-texte').focus(), 30);
}
const fermerDemande = () => $('#fenetre').classList.remove('ouverte');
$('#f-annuler').onclick = fermerDemande; $('#fenetre').addEventListener('click', (e) => { if (e.target.id === 'fenetre') fermerDemande(); });
$('#f-demande').addEventListener('submit', async (e) => { e.preventDefault(); const t = $('#f-texte').value.trim(); if (!t) { $('#f-texte').focus(); return; }
  try { const d = await poster('/api/v6/demande', { sujet: $('#f-sujet').value, texte: t }, $('#f-demande button[type="submit"]')); fermerDemande(); toast(`Demande n° ${d.id} notée pour Claude : tu la suis dans « Mises à jour »`); await charger(false); }
  catch (err) { toast('Demande non envoyée : ' + err.message); } });
$('#nouvelle-demande').onclick = () => ouvrirDemande(null);

// ══ JARVIS : la communication avec l'agence, par écrit ou à la voix (/api/dire, comme le micro de la v6) ══
// l'historique vient du serveur (/api/conversation, les 40 derniers messages) ; la discussion écrite demande une réponse écrite
const DISCUSSION = [];
let historiqueLu = false;
const garderDiscussion = () => { if (DISCUSSION.length > 60) DISCUSSION.splice(0, DISCUSSION.length - 60); };
async function ouvrirJarvis() {
  if (!historiqueLu) {
    historiqueLu = true;
    try { const r = await fetch('/api/conversation', { cache: 'no-store', credentials: 'same-origin' }); if (r.ok) { const j = await r.json(); DISCUSSION.unshift(...(j.messages || []).filter((m) => m.content).map((m) => ({ moi: m.role === 'user', texte: String(m.content) }))); } } catch (e) {}
  }
  const corps = () => `<div class="chat">${DISCUSSION.map((m) => `<div class="msg ${m.moi ? 'moi' : 'lui'}">${esc(m.texte)}</div>`).join('') || '<p class="note">Demande où en est un agent, ce qui bloque, ou donne un ordre : Jarvis répond, Hermes exécute ce qui doit l’être.</p>'}</div>`;
  tiroir('Jarvis', 'Parler à l’agence', 'Les réponses viennent du serveur, en direct', corps(),
    `<form class="chat-saisie" id="chat-f"><input id="chat-t" placeholder="Écris à Jarvis…" aria-label="Message à Jarvis" autocomplete="off"><button class="rond" type="button" id="chat-micro" aria-label="Parler">${'<svg class="i" viewBox="0 0 24 24"><rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5"/></svg>'}</button><button class="btn noir" type="submit">${ic('envoyer')}Envoyer</button></form>`);
  const defiler = () => { const t = $('#t-corps'); t.scrollTop = t.scrollHeight; };
  defiler(); setTimeout(() => $('#chat-t')?.focus(), 40);
  $('#chat-micro').onclick = () => $('#micro').click();
  $('#chat-f').onsubmit = async (e) => {
    e.preventDefault(); const t = $('#chat-t').value.trim(); if (!t) return;
    $('#chat-t').value = ''; await dire(t, false);
  };
}
async function dire(texte, oral) {
  DISCUSSION.push({ moi: true, texte }); garderDiscussion();
  if ($('#t-titre').textContent === 'Parler à l’agence') { $('#t-corps').innerHTML = `<div class="chat">${DISCUSSION.map((m) => `<div class="msg ${m.moi ? 'moi' : 'lui'}">${esc(m.texte)}</div>`).join('')}<div class="msg lui">…</div></div>`; $('#t-corps').scrollTop = 1e6; }
  try {
    const d = await poster('/api/dire', { message: texte, oral: !!oral });
    DISCUSSION.push({ moi: false, texte: d.reply || '(pas de réponse)' }); garderDiscussion();
    if (oral) parler(d.reply);
    if (d.commande) await charger(false);
  } catch (e) { DISCUSSION.push({ moi: false, texte: 'Jarvis ne répond pas : ' + e.message }); }
  ouvrirJarvis();
}
$('#ouvrir-jarvis').onclick = ouvrirJarvis;
let ecoute = null;
function parler(texte) {
  const t = String(texte || '').replace(/https?:\/\/\S+/g, '').slice(0, 1600); if (!t) return;
  fetch('/api/voix/parler', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texte: t }) })
    .then((r) => { if (!r.ok) throw new Error('voix'); return r.blob(); })
    .then((b) => { const u = URL.createObjectURL(b), a = new Audio(u); a.onended = () => URL.revokeObjectURL(u); return a.play(); })
    .catch(() => { if ('speechSynthesis' in window) { const u = new SpeechSynthesisUtterance(t); u.lang = 'fr-FR'; speechSynthesis.cancel(); speechSynthesis.speak(u); } });
}
$('#micro').onclick = async () => {
  if (ecoute) { ecoute.stop(); return; }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) { toast('Pas de micro sur ce navigateur'); return; }
  let flux; try { flux = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); } catch (e) { toast('Micro refusé'); return; }
  const rec = new MediaRecorder(flux), morceaux = [], b = $('#micro'); ecoute = rec;
  b.classList.add('actif'); b.setAttribute('aria-label', 'Arrêter et envoyer à Jarvis'); toast('Je t’écoute : touche le micro quand tu as fini');
  rec.ondataavailable = (e) => { if (e.data.size) morceaux.push(e.data); };
  rec.onstop = async () => {
    flux.getTracks().forEach((t) => t.stop()); ecoute = null; b.classList.remove('actif'); b.setAttribute('aria-label', 'Parler à Jarvis à la voix');
    try {
      const t = await fetch('/api/voix/transcrire', { method: 'POST', body: new Blob(morceaux, { type: rec.mimeType || 'audio/webm' }) }).then((r) => r.json());
      const dit = String(t.texte || '').trim(); if (!dit) { toast('Je n’ai rien entendu'); return; }
      toast('Jarvis réfléchit…'); await dire(dit, true);
    } catch (e) { toast('La voix du serveur ne répond pas'); }
  };
  rec.start(250); setTimeout(() => { if (ecoute === rec) rec.stop(); }, 60000);
};

// ══ RENDU ET NAVIGATION ══
let vue = (() => { const h = location.hash.slice(1); return h && (h === 'agence' || GROUPES.some((g) => g.pages.some(([k]) => k === h))) ? h : 'agence'; })();
const PAGES = { etat, majs, factures, siteweb, integration, agenda, clients, fiches: clientsTous, clipping: () => pageAgent('clipping'), trading: () => pageAgent('trading'), dropshipping: () => pageAgent('dropshipping'), libre: () => pageAgent('libre'), candidatures: () => pageAgent('candidatures') };
function rail() {
  const somme = (g, rouge) => g.pages.reduce((s, [k]) => { const c = COMPTES[k]; return s + (c && !!c[1] === rouge ? c[0]() : 0); }, 0);
  $('#rail').innerHTML = GROUPES.map((g) => {
    const r = somme(g, true), o = g.cle === 'commerce' ? COMPTES.siteweb[0]() + COMPTES.integration[0]() : g.cle === 'poles' ? COMPTES.candidatures[0]() : 0;
    return `<button class="ent" type="button" data-groupe="${g.cle}" data-nom="${esc(g.nom)}" aria-label="${esc(g.nom)}"${groupeDe(vue) === g ? ' aria-current="page"' : ''}>${ic(g.icone)}${r ? `<span class="badge">${r}</span>` : o ? `<span class="badge orange">${o}</span>` : ''}</button>`;
  }).join('');
}
function pilules() {
  const g = groupeDe(vue);
  if (g.cle === 'agence') {
    const zone = SEL.type === 'zone' ? SEL.cle : SEL.type === 'agent' ? ZONE_DU_SECTEUR.get(AG.find((a) => a.id === SEL.id)?.secteur) : null;
    $('#pilules').innerHTML = `<button type="button" data-zone3d="" aria-pressed="${!zone}">Vue d’ensemble</button>` + D.plan.quartiers.map((q) => {
      const ag = AG.filter((a) => q.secteurs.includes(a.secteur)), p = ag.filter((a) => a.etat === 'panne').length;
      return `<button type="button" data-zone3d="${q.cle}" aria-pressed="${zone === q.cle}" style="--z:${COULEUR_ZONE[q.cle]}"><i></i>${esc(q.nom)}<span class="n${p ? ' rouge' : ''}">${p || ag.length}</span></button>`;
    }).join('');
  } else {
    $('#pilules').innerHTML = g.pages.map(([k, n]) => { const c = COMPTES[k], v = c ? c[0]() : 0; return `<button type="button" data-aller="${k}" aria-pressed="${k === vue}">${n}${v ? `<span class="n${c[1] ? ' rouge' : ''}">${v}</span>` : ''}</button>`; }).join('');
  }
}
function rendre() {
  if (!D) return;
  const t = TITRES[vue] || TITRES.agence; $('#titre').textContent = t[0]; $('#sous-titre').textContent = t[1];
  rail(); pilules(); kpis();
  const enAgence = vue === 'agence';
  document.body.classList.toggle('plein', enAgence);
  $('#agence').hidden = !enAgence; $('#vue').hidden = enAgence;
  if (enAgence) { monterAgence(); if (agence) { agence.actif(true); legende3d(); } colonne(); return; }
  if (agence) agence.actif(false);
  $('#vue').innerHTML = `<div style="display:flex;flex-direction:column;gap:16px">${PAGES[vue]()}</div>`;
  brancher();
}
function aller(v) {
  fermerTiroir();
  if (v !== vue) { vue = v; ouvertRappel = null; derniere[groupeDe(v).cle] = v; try { history.replaceState(null, '', '#' + v); } catch (e) {} window.scrollTo(0, 0); }
  rendre();
}
function brancher() {
  const v = $('#vue');
  $$('.ligne-a[data-agent]', v).forEach((b) => b.onclick = () => ficheAgent(AG.find((a) => a.id === b.dataset.agent)));
  $$('[data-jourl]', v).forEach((b) => b.onclick = () => { jourListe = b.dataset.jourl; ouvertRappel = null; rendre(); });
  $$('[data-res]', v).forEach((b) => b.onclick = () => { const cle = b.closest('[data-cle]').dataset.cle; if (b.dataset.res === 'rappeler') { ouvertRappel = ouvertRappel === cle ? null : cle; rendre(); const n = $('#r-note'); if (n) n.focus(); } else noterAppel(cle, b.dataset.res); });
  $$('[data-noter]', v).forEach((b) => b.onclick = () => noterAppel(b.dataset.noter, 'rappeler', $('#r-date').value || DEMAIN, $('#r-note').value.trim()));
  const rn = $('#r-note'); if (rn) rn.onkeydown = (e) => { if (e.key === 'Enter') $('[data-noter]').click(); };
  const vn = $('#voir-nouveaux'); if (vn) vn.onclick = () => { voirTousNouveaux = true; rendre(); };
  const vo = $('#voir-offres'); if (vo) vo.onclick = () => { voirToutesOffres = true; rendre(); };
  $$('[data-postuler]', v).forEach((b) => b.onclick = () => postuler(b.dataset.postuler, false, b));
  $$('[data-postule]', v).forEach((b) => b.onclick = () => postuler(b.dataset.postule, true, b));
  $$('[data-categorie]', v).forEach((b) => b.onclick = () => ouvrirCategorie(b.dataset.categorie));
  $$('[data-copier]', v).forEach((b) => b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.copier); toast('Numéro copié'); } catch (e) { toast('Sélectionne le numéro pour le copier'); } });
  $$('[data-fiche]', v).forEach((r) => r.onclick = (e) => { e.preventDefault(); e.stopPropagation(); fiche(C.find((c) => c.cle === r.dataset.fiche)); });
  $$('[data-envoi]', v).forEach((b) => b.onclick = (e) => { e.stopPropagation(); envoiMaquette(C.find((c) => c.cle === b.dataset.envoi)); });
  $$('[data-modele]', v).forEach((b) => b.onclick = () => ouvrirModele(b.dataset.modele));
  $$('[data-choix]', v).forEach((b) => b.onchange = () => { b.checked ? choisis.add(b.dataset.choix) : choisis.delete(b.dataset.choix); rendre(); });
  const tc = $('#tout-choisir'); if (tc) tc.onclick = () => { const l = D.brouillons.filter((k) => !envoyes.has(k)); if (choisis.size === l.length) choisis.clear(); else l.forEach((k) => choisis.add(k)); rendre(); };
  const ec = $('#envoyer-choix'); if (ec) ec.onclick = async () => {
    ec.disabled = true; let ok = 0; const refus = [];
    for (const k of [...choisis]) { const c = C.find((x) => x.cle === k); if (!c || !c.outreach) continue; try { await poster('/api/prospection/' + c.outreach, { action: 'valide' }); ok++; choisis.delete(k); } catch (e) { refus.push(c.nom); } }
    toast(`${ok} e-mail${ok > 1 ? 's' : ''} validé${ok > 1 ? 's' : ''} : l’Expéditeur les envoie à son prochain passage, à 8 h${refus.length ? ' ; refusé : ' + refus.join(', ') : ''}`); await charger(false); };
  const pr = $('#prec'), su = $('#suiv'); const dec = (s) => { const d = new Date(curseur + 'T12:00:00'); d.setMonth(d.getMonth() + s, 1); curseur = isoDe(d); rendre(); };
  if (pr) { pr.onclick = () => dec(-1); su.onclick = () => dec(1); }
  $$('[data-rappel]', v).forEach((b) => b.onclick = () => { const r = RAPPELS.find((x) => x.id === Number(b.dataset.rappel)); const c = r && C.find((x) => x.cle === r.cle); if (c) fiche(c); });
  $$('[draggable="true"]', v).forEach((p) => p.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', p.dataset.id)));
  $$('[data-jour]', v).forEach((c) => { c.addEventListener('dragover', (e) => { e.preventDefault(); c.style.outline = '2px dashed var(--orange)'; }); c.addEventListener('dragleave', () => { c.style.outline = ''; });
    c.addEventListener('drop', async (e) => { e.preventDefault(); c.style.outline = ''; const r = RAPPELS.find((x) => x.id === Number(e.dataTransfer.getData('text/plain'))); if (!r || r.jour === c.dataset.jour) return;
      try { await poster('/api/agenda/' + r.id, { action: 'reporter', echeance: c.dataset.jour }); toast(`${r.nom} reporté ${quand(c.dataset.jour)}`); await charger(false); } catch (err) { toast(`${r.nom} : ${err.message}`); } }); });
  // « C'est réglé » : ta parole, datée, quand aucun e-mail ne confirme le paiement (Hetzner n'en envoie pas)
  $$('[data-reglee]', v).forEach((b) => b.onclick = async () => {
    const f = D.factures.find((x) => x.cle === b.dataset.reglee);
    try { await poster('/api/v6/facture/' + b.dataset.reglee, {}, b); toast(`${f ? f.nom : 'Facture'} : notée réglée`); await charger(false); } catch (e) { toast(e.message); }
  });
  $$('[data-segc]', v).forEach((b) => b.onclick = () => { segC = b.dataset.segc; rendre(); });
  $$('[data-statc]', v).forEach((b) => b.onclick = () => { statC = b.dataset.statc; rendre(); });
  const cc = $('#cherche-c'); if (cc) cc.oninput = () => { chercheC = cc.value; const p = cc.selectionStart; rendre(); const n = $('#cherche-c'); n.focus(); n.setSelectionRange(p, p); };
}
// les gestes communs à toute la page (rail, pilules, cartes du haut, colonne de l'agence)
document.addEventListener('click', (e) => {
  const n = e.target.closest('[data-nouvelle]'); if (n) return ouvrirDemande(n.dataset.nouvelle || null);
  const g = e.target.closest('[data-groupe]'); if (g) return aller(derniere[g.dataset.groupe]);
  const a = e.target.closest('[data-aller]'); if (a) return aller(a.dataset.aller);
  const p = e.target.closest('[data-periode]'); if (p) { periode = p.dataset.periode; kpis(); if (vue === 'agence') colonne(); return; }
  const z = e.target.closest('[data-zone3d]'); if (z) return selectionner(z.dataset.zone3d ? { type: 'zone', cle: z.dataset.zone3d } : { type: 'tout' });
  const a3 = e.target.closest('[data-agent3d]'); if (a3 && !e.target.closest('#tiroir')) return selectionner({ type: 'agent', id: a3.dataset.agent3d });
  const ag = e.target.closest('#colonne [data-agent]'); if (ag) return ficheAgent(AG.find((x) => x.id === ag.dataset.agent));
  const t = e.target.closest('#colonne [data-tout]'); if (t) return selectionner({ type: 'tout' });
  const vi = e.target.closest('[data-visite]'); if (vi && agence) return agence.mode('visite', SEL.type === 'zone' ? SEL.cle : null);
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { fermerTiroir(); fermerDemande(); if (ouvertRappel) { ouvertRappel = null; rendre(); } } });
$('#cherche-global').addEventListener('keydown', (e) => { if (e.key === 'Enter') chercherPartout(e.target.value); });
addEventListener('hashchange', () => { const h = location.hash.slice(1); if (h && h !== vue && (h === 'agence' || PAGES[h])) aller(h); });

// ══ L'E-MAIL APRÈS L'APPEL (v6) : Basile voit l'e-mail et la maquette, corrige s'il veut, clique « Envoyer » ══
async function envoiMaquette(c) {
  if (!c) return;
  const id = c.cle.slice(1), audit = c.seg === 'ia', route = (audit ? '/api/v6/preaudit/' : '/api/v6/maquette/') + id;
  tiroir(audit ? 'Intégration IA · après l’appel' : 'Site web · après l’appel', c.nom, `${c.metier} · ${c.ville}`, '<p class="note">Préparation de l’e-mail…</p>');
  let m; try { m = await poster(route, { etape: 'apercu' }); } catch (e) { $('#t-corps').innerHTML = `<p class="raison">${esc(e.message)}</p>`; return; }
  const champ = 'width:100%;height:38px;border:1px solid var(--bord-2);border-radius:10px;padding:0 12px;background:var(--surface)';
  $('#t-corps').innerHTML = `<div class="bloc"><span class="etiq">À</span><input id="e-a" type="email" value="${esc(m.a)}" placeholder="adresse@commerce.fr" aria-label="Adresse du commerçant" style="${champ}"></div>
    <div class="bloc"><span class="etiq">Objet</span><input id="e-sujet" type="text" value="${esc(m.sujet)}" aria-label="Objet" style="${champ}"></div>
    <div class="bloc"><span class="etiq">Le texte</span><textarea id="e-corps" rows="13" aria-label="Le texte de l’e-mail" style="width:100%;border:1px solid var(--bord-2);border-radius:10px;padding:10px 12px;background:var(--surface);font:inherit;line-height:1.5">${esc(m.corps)}</textarea></div>
    <div class="bloc"><span class="etiq">${audit ? 'Le pré-audit joint par le lien' : 'La maquette jointe par le lien'}</span>${audit ? '' : `<iframe src="${esc(m.lien)}" title="La maquette" loading="lazy" style="width:100%;height:340px;border:1px solid var(--bord-2);border-radius:10px;background:#000"></iframe>`}
      <a class="btn petit" style="margin-top:8px;align-self:flex-start" href="${esc(m.lien)}" target="_blank" rel="noopener">${ic('ext')}${audit ? 'Ouvrir le pré-audit' : 'Ouvrir la maquette en grand'}</a></div>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn noir" type="button" id="e-envoyer">Envoyer</button><span class="raison" id="e-etat">L’e-mail part dès le clic.</span></div>`;
  const b = $('#e-envoyer');
  b.onclick = async () => {
    $('#e-etat').textContent = 'Envoi…';
    try {
      const r = await poster(route, { etape: 'envoyer', a: $('#e-a').value, sujet: $('#e-sujet').value, corps: $('#e-corps').value }, b);
      $('#e-etat').textContent = r.message; toast(c.nom + ' : ' + r.message); b.disabled = true; b.textContent = 'Envoyé'; setTimeout(async () => { fermerTiroir(); await charger(false); }, 1800);
    } catch (e) { $('#e-etat').textContent = e.message; }
  };
}
const ECRIRE = { 'Content-Type': 'application/json', 'X-Jarvis': '1' };
async function poster(url, data, bouton) {
  if (bouton) bouton.disabled = true;
  try {
    const r = await fetch(url, { method: 'POST', headers: ECRIRE, body: JSON.stringify(data) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) throw new Error(j.erreur || (r.status === 403 ? 'refusé par le cockpit' : 'le cockpit ne répond pas (' + r.status + ')'));
    return j;
  } finally { if (bouton && bouton.isConnected) bouton.disabled = false; }
}

// ══ LA LECTURE : /api/v6 chaque minute (jamais pendant un geste), les analystes toutes les cinq minutes ══
let enLecture = false;
async function charger(premier) {
  if (enLecture) return; enLecture = true;
  try {
    const r = await fetch('/api/v6', { cache: 'no-store', credentials: 'same-origin' });
    if (!r.ok) throw new Error('le cockpit répond ' + r.status);
    installer(await r.json());
    if (agence) agence.donnees(D);
    rendre();
  } catch (e) {
    if (premier) { $('#agence').hidden = true; $('#vue').hidden = false; $('#vue').innerHTML = `<div class="carte vide">Les données n’ont pas pu être lues : ${esc(e.message)}.<br><br><button class="btn petit" type="button" id="relire">Réessayer</button></div>`; $('#relire').onclick = () => charger(true); }
    else toast('Données non relues : ' + e.message);
  } finally { enLecture = false; }
}
async function lireAnalyses() {
  try { const r = await fetch('/api/v7/analyses', { cache: 'no-store', credentials: 'same-origin' }); A = r.ok ? await r.json() : null; } catch (e) { A = null; }
  if (D && !occupe()) rendre();
}
const occupe = () => $('#tiroir').classList.contains('ouvert') || $('#fenetre').classList.contains('ouverte') || ouvertRappel || ecoute
  || ['INPUT', 'TEXTAREA', 'SELECT'].includes((document.activeElement || {}).tagName);
setInterval(() => { if (document.visibilityState === 'visible' && D && !occupe()) charger(false); }, 60000);
setInterval(lireAnalyses, 5 * 60000);
lireAnalyses().then(() => charger(true));
