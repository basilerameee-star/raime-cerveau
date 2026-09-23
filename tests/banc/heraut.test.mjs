// valider() du héraut : le code juge chaque message avant tout envoi. La prospection est
// en pause ; ce test ne rédige rien et n'écrit à personne, il vérifie seulement les règles
// sur des messages figés, adressés à des entreprises inventées.
import './outils.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { valider } = await import('../../agents/heraut.js');

const OBJET = 'Formation IA des équipes : ce que demande l’AI Act';
const CORPS = `Madame, Monsieur,

Depuis le 2 août, l’article 4 de l’AI Act demande aux entreprises de former les personnes qui utilisent l’intelligence artificielle, et de pouvoir le montrer.

Pour Transports Vallet, cela touche surtout le transport routier et la planification des tournées : là où les outils arrivent déjà dans les équipes.

Un premier regard sous 48 heures permet de situer vos usages et de chiffrer une formation adaptée. Souhaitez-vous le recevoir ?

Basile Ramé
rAIme — raime.fr`;

const ORGA = 'Transports Vallet';
const avec = (motif, remplacement) => CORPS.replace(motif, remplacement);

test('un message conforme passe sans aucune erreur', () => {
  assert.deepEqual(valider(OBJET, CORPS, ORGA), []);
});

test('« transport routier » face à « Transports Vallet » n’est pas une faute (leçon du 23/09)', () => {
  assert.ok(!valider(OBJET, CORPS, ORGA).some((e) => /mal orthographié/.test(e)));
});

test('un nom d’organisation malmené est refusé', () => {
  assert.ok(valider(OBJET, avec('Pour Transports Vallet', 'Pour Transports Valet'), 'Transports Vallet')
    .some((e) => /mal orthographié/.test(e)));
});

const REFUS = [
  ['le CPF', avec('Un premier regard', 'Le CPF finance tout. Un premier regard'), /CPF/],
  ['un prix', avec('Un premier regard', 'Tarif : 900 € la journée. Un premier regard'), /prix annoncé/],
  ['un lien', avec('raime.fr', 'raime.fr https://raime.fr'), /lien cliquable/],
  ['deux questions', avec('Souhaitez-vous', 'Est-ce utile ? Souhaitez-vous'), /plusieurs questions/],
  ['une civilité devinée', avec('Madame, Monsieur,', 'Monsieur,'), /civilité genrée/],
  ['l’audit gratuit', avec('Un premier regard sous 48 heures', 'Un audit gratuit puis un premier regard sous 48 heures'), /audit gratuit/],
  ['Qualiopi', avec('Un premier regard', 'Organisme Qualiopi. Un premier regard'), /Qualiopi/],
  ['l’OPCO', avec('Un premier regard', 'Votre OPCO finance. Un premier regard'), /OPCO/],
  ['la signature absente', avec('Basile Ramé\n', ''), /signature/],
  ['l’offre du premier regard absente', avec('Un premier regard sous 48 heures permet', 'Un échange permet'), /premier regard absente/],
  ['un émoji', avec('Souhaitez-vous', '🚀 Souhaitez-vous'), /formulation interdite/],
  ['un message trop long', CORPS + '\n' + 'Détail supplémentaire. '.repeat(60), /trop long/],
];
for (const [nom, corps, attendu] of REFUS) {
  // Le CPF et l'OPCO échappaient au contrôle : un caractère invisible (retour arrière,
  // 0x08) remplaçait le \b de l'expression. Ces deux cas gardent la réparation.
  test(`refusé : ${nom}`, () => {
    const erreurs = valider(OBJET, corps, ORGA);
    assert.ok(erreurs.some((e) => attendu.test(e)), `attendu ${attendu}, obtenu ${JSON.stringify(erreurs)}`);
  });
}

test('un objet absent ou trop long est refusé', () => {
  assert.ok(valider('', CORPS, ORGA).some((e) => /objet/.test(e)));
  assert.ok(valider('x'.repeat(81), CORPS, ORGA).some((e) => /objet/.test(e)));
});
