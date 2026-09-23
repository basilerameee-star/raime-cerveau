# Carnet du cerveau rAIme

*La mémoire des sessions de travail sur ce dépôt. Une entrée par sous-tâche, la plus récente en bas. On lit tout au démarrage, on ajoute à la fin, on ne réécrit jamais une entrée passée.*

Format d'une entrée :

```
## AAAA-MM-JJ — <chantier> — <sous-tâche>
- Action :
- Résultat :
- Évaluation : (écart entre l'attendu et l'obtenu)
- Correction :
- Leçon :
```

---

## Leçons déjà apprises (sessions locales, 23 septembre 2026)

- **Mesurer d'abord.** Le héraut échouait trois fois sur quatre : on accusait sa consigne, la mesure a trouvé trois autres causes. Réparé, il est passé de 0 message conforme sur 3 à 3 sur 3, pour cinq fois moins cher.
- **Un modèle qui raisonne peut rendre une réponse vide.** `deepseek-v4-flash` dépensait tout son budget à réfléchir et renvoyait zéro caractère (`finish_reason: length`). `lib.js` coupe désormais le raisonnement pour la rédaction et rejoue toute réponse vide.
- **Une consigne et un contrôle peuvent se contredire.** La consigne interdisait la question de clôture pendant que le code en exigeait une : trois messages sur quatre refusés à tort.
- **Un garde-fou peut refuser le juste.** « Madame, Monsieur, » était pris pour une civilité devinée ; « transport routier » pour une faute sur « Transports Vallet ».
- **Les modèles « gratuits » du catalogue sont peu fiables** : 404 (plus gratuits), 429 (bridés), ou hors format. Mesurer avant d'y croire.
- **Chercher l'existant avant de créer.** Un ménage a retiré 14 flux en double sur 34 ; une collecte déjà faite a failli être refaite.
- **La recherche doit lire les titres.** L'architecte cherchait « Carte commerciale » et recevait de la documentation technique : le titre n'était pas indexé. Corrigé (migration `018`).
- **Une donnée technique en masse noie la maison.** 1 564 morceaux de documentation anglaise écrasaient les notes commerciales ; la recherche passe désormais d'abord par les domaines de la maison.
- **Ce qui manque vraiment** (constat de l'architecte, rejoint par Basile) : rien ne décrit encore **qui viser, quel message, quelle promesse** pour la prospection. Question posée à Basile, en attente.

## 2026-09-24 — chantier 1 — état des lieux
- Action : lire la mission, le registre des briques, la Constitution, la compétence architecte, le carnet ; lancer `npm test`.
- Résultat : aucun script de test, aucune CI ; les examens `tests/cas_figes_*.mjs` exigent une clé et le réseau.
- Évaluation : 0 test lançable hors ligne. Aucune parole ne repose encore sur une preuve.
- Correction : construire le banc (bases de test, modèle factice, `npm test`, CI).
- Leçon : le premier chiffre, c'est souvent zéro ; il faut quand même l'écrire.

## 2026-09-24 — chantier 1 — bases de test
- Action : charger `db/schema_raime_brain.sql` et `db/schema_n8n_extrait.sql` dans deux bases `_test`, verser des données fictives (`tests/banc/`).
- Résultat : 29 tables pour le cerveau, 5 pour n8n, chargées en moins d'une seconde.
- Évaluation : un premier jeu de données violait l'unicité de `outreach.siren` (un prospect, un seul message).
- Correction : un siren par message fictif. Les méta-commandes `\restrict` des psql récents sont retirées au chargement.
- Leçon : la structure de production porte des règles que les données fictives doivent respecter ; le schéma les rappelle tout seul.

## 2026-09-24 — chantier 1 — le banc trouve un défaut en production
- Action : tester `valider()` du héraut sur des messages figés.
- Résultat : un message qui cite le « CPF » ou l'« OPCO » passait sans erreur.
- Évaluation : le `\b` des deux expressions avait été remplacé par un caractère invisible (retour arrière, 0x08). Seules les formes longues (« compte personnel de formation », « Qualiopi ») étaient arrêtées.
- Correction : `\b` rétabli dans `agents/heraut.js`. Avant : 14 tests sur 16 ; après : 16 sur 16.
- Leçon : un contrôle qui n'a jamais été testé peut être mort sans que rien ne le montre. Chaque règle écrite mérite son cas de refus.

## 2026-09-24 — chantier 1 — npm test
- Action : modèle factice (`MODELE_FACTICE=1`), 46 tests sur six fichiers, CI GitHub.
- Résultat : 46 sur 46, en une seconde environ, 0 $ dépensé, aucune requête réseau, aucune clé.
- Évaluation : conforme à l'attendu.
- Correction : aucune.
- Leçon : un fournisseur factice qui échoue quand aucune fixture ne correspond vaut mieux qu'un fournisseur qui invente : un appel imprévu se voit tout de suite.
