// LE VEILLEUR DES ORDRES (08/10/2026). Le 03/10, Basile a dicté l'ordre n°40 (la campagne Michael Sartain) ; il est
// resté « à faire » des jours sans que rien ne le dise, et Basile a cru les clips publiés. Désormais, tout ordre à faire
// ou en cours depuis plus de 24 h remonte EN ROUGE : dans l'e-mail de 7 h 30 (une partie « rouge » de /api/rapport,
// rendue par le nœud « Format email » du Héraut) et en tête du cockpit (/api/etat → ordres_en_retard).
// Du code seul, lu en direct dans la table commandes : la liste ne peut pas être en retard sur la base.
// L'agent de boucle agents/veilleur_ordres.js écrit en plus, une fois par ordre, la ligne « en retard » au journal.
'use strict';

const SEUIL_HEURES = 24;
const DESTINATAIRES = { claude: 'attend Claude', harness: 'confié à Hermes', verification: 'en vérification', outil: 'attend un outil' };

// lire(sql, params) → lignes : celui de jarvis/bases.cjs, ou un client pg de la boucle.
async function enRetard(lire) {
  return lire(`SELECT id, texte, etat, pour, cree_le, floor(extract(epoch FROM now() - cree_le) / 3600)::int AS heures
    FROM commandes WHERE etat IN ('a_faire', 'en_cours') AND cree_le < now() - make_interval(hours => $1)
    ORDER BY cree_le, id`, [SEUIL_HEURES]);
}

const court = (x, n) => { const t = String(x || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
function depuis(heures) {
  const h = Number(heures) || 0;
  return h < 48 ? `depuis ${h} h` : `depuis ${Math.floor(h / 24)} jours`;
}
const jour = (d) => new Date(d).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit' });

// « n°40 — je viens de voir l'email… · à faire depuis 11 jours (donné le 03/10) · attend Claude »
function ligne(o) {
  return `n°${o.id} — ${court(o.texte, 110)} · ${o.etat === 'en_cours' ? 'en cours' : 'à faire'} ${depuis(o.heures)}`
    + ` (donné le ${jour(o.cree_le)})${DESTINATAIRES[o.pour] ? ' · ' + DESTINATAIRES[o.pour] : ''}`;
}

// La partie de l'e-mail du matin ; vide s'il n'y a rien en retard (l'e-mail n'affiche pas de partie rouge pour rien).
function section(liste) {
  if (!liste.length) return null;
  return { titre: `Ordres en retard : ${liste.length} (à faire ou en cours depuis plus de ${SEUIL_HEURES} h)`, rouge: true, lignes: liste.map(ligne) };
}

// Ce que le cockpit affiche : le nombre, et chaque ordre avec sa ligne déjà rédigée.
function pourCockpit(liste) {
  return liste.map((o) => ({ id: Number(o.id), etat: o.etat, pour: o.pour, heures: Number(o.heures), ligne: ligne(o) }));
}

module.exports = { SEUIL_HEURES, enRetard, ligne, section, pourCockpit, depuis };
