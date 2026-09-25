// valider() du héraut : le code juge chaque message avant tout envoi. La prospection est
// en pause ; ce test ne rédige rien et n'écrit à personne, il vérifie seulement les règles
// sur des messages figés, adressés à des entreprises inventées.
import './outils.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { valider, APPEL, SIGNATURE } = await import('../../agents/heraut.js');

// L'étalon suit le message dicté par Basile le 25/09/2026 (héraut v3).
const OBJET = 'Vos tâches administratives chronophages';
const CORPS = `Madame, Monsieur,

Je me permets de vous contacter car j'accompagne les organisations dans l'identification et l'automatisation de leurs tâches grâce à l'IA.

De plus en plus d'entreprises utilisent l'intelligence artificielle au quotidien, et beaucoup perdent encore du temps sur des tâches qui ne sont pas le cœur de leur mission. Pour Transports Vallet, dans le transport routier, par exemple :
- la saisie des lettres de voiture
- le suivi des temps de conduite
- les relances des factures clients
- la préparation des tournées
- la gestion des documents des véhicules

Certaines de ces tâches peuvent aujourd'hui être automatisées presque intégralement grâce à des workflows, des agents IA et des connexions à vos outils existants. L'objectif : vous faire gagner du temps et de l'argent, en identifiant ce qui est réellement faisable.

Chez rAIme, j'interviens notamment sur l'analyse, l'identification, la conception, l'intégration, la mise en place et le suivi des gains.

${APPEL}

${SIGNATURE}`;

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
  ['le CPF', avec('Chez rAIme', 'Le CPF finance tout. Chez rAIme'), /CPF/],
  ['un prix', avec('Chez rAIme', 'Tarif : 900 € la journée. Chez rAIme'), /prix annoncé/],
  ['un lien', avec('raime.fr', 'raime.fr https://raime.fr'), /lien cliquable/],
  ['deux questions', avec('Si vous avez', 'Est-ce utile ? Et pour vous ? Si vous avez'), /plusieurs questions/],
  ['une civilité devinée', avec('Madame, Monsieur,', 'Monsieur,'), /civilité genrée/],
  ['l’audit gratuit', avec('Chez rAIme', 'Un audit gratuit vous attend. Chez rAIme'), /audit gratuit/],
  ['Qualiopi', avec('Chez rAIme', 'Organisme Qualiopi. Chez rAIme'), /Qualiopi/],
  ['l’OPCO', avec('Chez rAIme', 'Votre OPCO finance. Chez rAIme'), /OPCO/],
  ['la signature absente', avec('Basile Ramé\n', ''), /signature/],
  ['la phrase d’appel de Basile absente', avec(APPEL, 'Répondez-moi.'), /phrase d'appel/],
  ['moins de cinq tâches', avec('- la préparation des tournées\n- la gestion des documents des véhicules\n', ''), /cinq tâches/],
  ['un chiffre sans source', avec('De plus en plus d', '42 % d'), /chiffre/],
  ['un émoji', avec('Si vous avez', '🚀 Si vous avez'), /formulation interdite/],
  ['un message trop long', CORPS + '\n' + 'Détail supplémentaire. '.repeat(90), /trop long/],
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
