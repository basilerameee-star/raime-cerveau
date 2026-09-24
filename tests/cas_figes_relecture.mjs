// CAS FIGÉS — Relecture des critères jugés absents (citation exacte, vérifiée par le code).
// La relecture ne doit JAMAIS faire entrer ce qui n'est pas écrit : une citation reformulée,
// trop courte ou inventée est rejetée ; un nombre absent de sa citation aussi.
import { normaliser, citationTrouvee, nombreDansCitation, appliquerRelecture } from '../agents/relecture.js';

let ok = 0, ko = 0;
const verifie = (nom, cond, info = '') => { if (cond) ok++; else { ko++; console.log('  ÉCHEC :', nom, info); } };

const TEXTE = `5. DONNÉES, PROPRIÉTÉ, SORTIE
Vos données restent votre propriété ; export complet en CSV et fichiers d'origine
sous 10 jours, sans frais. Les règles de tri et modèles créés vous appartiennent.
Licences tierces : aucune (modèle hébergé en France chez notre hébergeur, compris).
Abonnement : 390 € HT par mois, sans hausse pendant 24 mois.
Mise en route totale : 6 000 € HT (pilote compris).
Le temps libéré sera réaffecté aux relances, à hauteur de 60 %.`;

// 1. normalisation : accents, apostrophes, espaces, casse
verifie('normaliser', normaliser('Vos  DONNÉES’s\n restent') === "vos donnees's restent");

// 2. citation exacte, même mise en page différente
verifie('citation exacte', citationTrouvee('Vos données restent votre propriété', TEXTE));
verifie('citation sur deux lignes', citationTrouvee("export complet en CSV et fichiers d'origine sous 10 jours", TEXTE));
verifie('apostrophe typographique', citationTrouvee('export complet en CSV et fichiers d’origine', TEXTE));
verifie('citation coupee par …', citationTrouvee('Les règles de tri … vous appartiennent', TEXTE));

// 3. ce qui n'est pas écrit est rejeté
verifie('reformulation rejetee', !citationTrouvee('Le client est propriétaire de ses données', TEXTE));
verifie('citation trop courte rejetee', !citationTrouvee('propriété', TEXTE));
verifie('morceaux dans le desordre rejetes', !citationTrouvee('vous appartiennent … Les règles de tri', TEXTE));
verifie('citation vide rejetee', !citationTrouvee(null, TEXTE));

// 4. le nombre doit être dans sa citation
verifie('1 450 lu', nombreDansCitation(1450, 'Abonnement : 1 450 € HT par mois'));
verifie('6 000 lu', nombreDansCitation(6000, 'Mise en route totale : 6 000 € HT (pilote compris).'));
verifie('60 % = 0,6', nombreDansCitation(0.6, 'à hauteur de 60 %'));
verifie('aucune = 0', nombreDansCitation(0, 'Licences tierces : aucune (modèle hébergé en France)'));
verifie('nombre absent rejete', !nombreDansCitation(500, 'Abonnement : 390 € HT par mois'));

// 5. application : n'ajoute que le vérifié, ne remplace jamais une valeur déjà relevée
const entrees = { criteres_satisfaits: ['A1', 'C4'], justifications: { A1: 'x' },
                  economie: { abonnementMensuel: 390, miseEnRoute: null } };
const reponse = {
  criteres: {
    C2: 'Vos données restent votre propriété ; export complet en CSV',   // écrit : ajouté
    C3: 'Les règles de tri et modèles créés vous appartiennent',          // écrit : ajouté
    D1: 'Référence : le cabinet Martin, à Lyon',                          // inventé : rejeté
    C4: 'citation quelconque pour un critère déjà présent',               // déjà présent : ignoré
    M1: 'Vos données restent votre propriété',                            // maturité : jamais par le modèle
    Z9: 'Vos données restent votre propriété',                            // code inconnu : ignoré
    B5: null,
  },
  economie: {
    miseEnRoute: { valeur: 6000, citation: 'Mise en route totale : 6 000 € HT (pilote compris).' },   // ajouté
    licencesMensuelles: { valeur: 0, citation: 'Licences tierces : aucune (modèle hébergé en France chez notre hébergeur, compris).' },
    abonnementMensuel: { valeur: 999, citation: 'Abonnement : 390 € HT par mois' },                   // déjà relevé : intact
    maintenanceAnnuelle: { valeur: 900, citation: 'Maintenance : 900 € HT par an' },                  // introuvable : rejeté
    partReaffectee: { valeur: 0.6, citation: 'Le temps libéré sera réaffecté aux relances, à hauteur de 60 %.' },
    coutHoraire: { valeur: 90, citation: 'Vos données restent votre propriété' },                      // fait du client : ignoré
  },
};
const { entrees: e, journal: j } = appliquerRelecture(entrees, reponse, TEXTE);
verifie('C2 et C3 ajoutes', e.criteres_satisfaits.includes('C2') && e.criteres_satisfaits.includes('C3'));
verifie('D1 invente rejete', !e.criteres_satisfaits.includes('D1') && j.rejetes.includes('D1'));
verifie('M1 et Z9 ignores', !e.criteres_satisfaits.includes('M1') && !e.criteres_satisfaits.includes('Z9'));
verifie('justification gardee', /propriété/.test(e.justifications.C2));
verifie('mise en route ajoutee', e.economie.miseEnRoute === 6000);
verifie('licences aucune = 0', e.economie.licencesMensuelles === 0);
verifie('abonnement deja releve intact', e.economie.abonnementMensuel === 390);
verifie('maintenance introuvable rejetee', e.economie.maintenanceAnnuelle === undefined && j.grandeursRejetees.includes('maintenanceAnnuelle'));
verifie('reaffectation 60 %', e.economie.partReaffectee === 0.6);
verifie('cout horaire jamais par le prestataire', e.economie.coutHoraire === undefined);
verifie('entree non modifiee', entrees.criteres_satisfaits.length === 2);

// 6. réponse vide ou cassée : relevé intact
const vide = appliquerRelecture(entrees, null, TEXTE);
verifie('reponse nulle = releve intact', vide.entrees.criteres_satisfaits.join() === 'A1,C4');

console.log(`cas figes relecture : ${ok}/${ok + ko} ${ko ? 'KO' : 'OK'}`);
process.exit(ko ? 1 : 0);
