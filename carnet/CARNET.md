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

## 2026-09-24 — chantier 1 — fusion
- Action : pull request n° 1 fusionnée après la CI verte (46 tests sur 46) et le « ok » de Basile.
- Résultat : le banc d'essai est sur `main`.
- Évaluation : conforme.
- Correction : aucune.
- Leçon : le « ok » arrive vite quand le résumé tient en cinq lignes.

## 2026-09-24 — chantier 2 — la porte de déploiement, essayée à blanc
- Action : écrire `porte/porte.sh` (le seul script que la clé de GitHub pourra lancer), l'action « Livraison », le contrôle du résumé pour Basile, et 14 tests à blanc (faux Docker, faux Caddy, vraies archives).
- Résultat : 14 sur 14 ; `npm test` passe de 46 à 65 tests.
- Évaluation : trois défauts trouvés avant tout serveur. ① Dans un `if`, bash ignore `set -e` à l'intérieur des fonctions : un `docker build` raté serait passé sans bruit. ② Au premier déploiement, aucune version précédente : un échec aurait écrasé le cerveau sans copie. ③ `rsync` n'est pas sûr d'être présent sur le serveur.
- Correction : ① chaque étape rend son échec explicite ; ② la porte photographie le cerveau en service (« initiale ») avant d'y toucher ; ③ `tar` à la place de `rsync`. Vérifié par mutation : le retour en arrière coupé, deux tests tombent.
- Leçon : un test qui passe du premier coup se vérifie en cassant exprès ce qu'il protège.

## 2026-09-24 — chantier 2 — fusion
- Action : pull request n° 2 fusionnée (CI verte, résumé conforme, « ok » de Basile).
- Résultat : la « Livraison » a tourné sur `main` : banc vert, envoi sauté avec un avertissement (porte pas encore installée).
- Évaluation : conforme au comportement voulu ; le critère « en ligne toute seule » attend l'installation de `porte/INSTALLER.md`.
- Correction : aucune.
- Leçon : une étape qui dépend d'une clé absente doit s'arrêter en vert avec un avertissement, sinon chaque fusion rougit pour rien.

## 2026-09-24 — chantier 3 — l'atelier, hors ligne
- Action : `atelier/` (brief, contenu, site, Stripe, contrôles) et 19 tests sur trois phrases fictives, modèle et Stripe factices.
- Résultat : trois services qui passent les huit contrôles ; 84 tests sur 84 pour tout le banc.
- Évaluation : les captures d'écran ont montré deux défauts que les tests ne voyaient pas : un fond qui s'arrête au premier écran, un prix éloigné de son bouton. Et le texte vérifié par la porte aurait échoué sur une apostrophe (le HTML la transforme).
- Correction : fond sans `fixed`, prix collé au bouton, menu allégé sur téléphone ; le texte vérifié s'arrête avant tout caractère transformé.
- Leçon : un contrôle par code juge le fond, une capture juge la forme ; il faut les deux avant de dire « prêt ».
- Règle posée : le compte Stripe de rAIme n'encaisse que pour rAIme, ou en mode test pour une démonstration. Pour un client, le paiement attend son propre compte.

## 2026-09-24 — chantier 3 — fusion de l'atelier
- Action : pull request n° 3 fusionnée (CI verte ; Basile a donné son accord pour la suite de la nuit).
- Résultat : l'atelier est sur `main` ; aucun service en ligne tant que la porte n'est pas installée.
- Évaluation : conforme ; le critère du chantier 3 (trois services en ligne, un paiement de test) attend la porte et la clé Stripe de test.
- Correction : aucune.
- Leçon : un accord donné d'avance couvre la fusion au vert, jamais ce que la mission interdit.

## 2026-09-24 — chantier 4 — l'action ouvrir_chantier
- Action : `agents/chantiers.js` et l'action `ouvrir_chantier` de l'architecte ; 7 tests contre un GitHub factice.
- Résultat : 91 tests sur 91.
- Évaluation : premier jet trop permissif : une « mesure » sans aucun chiffre passait.
- Correction : la mesure doit porter un chiffre, sinon refus. Trois chantiers ouverts au plus, jamais deux fois le même, aucun secret.
- Leçon : la règle « mesurer avant de changer » vaut aussi pour ce que le cerveau demande.

## 2026-09-24 — chantier 4 — fusion
- Action : pull request n° 4 fusionnée (CI verte, accord de Basile pour la nuit).
- Résultat : l'architecte a sept actions ; `ouvrir_chantier` attend son jeton (`porte/INSTALLER.md`, étape 7).
- Évaluation : le critère du chantier 4 (une issue ouverte par l'architecte en production, traitée et fermée) attend la porte et le jeton.
- Correction : aucune.
- Leçon : aucune issue « chantier » ouverte à ce jour ; relu en début de travail, comme le veut la règle de session.

## 2026-09-24 — chantier 5 — le publiciste
- Action : `agents/publiciste.js`, `publicite/offres.json` (phrases déjà publiées sur raime.fr), migration `019`, 17 tests.
- Résultat : neuf brouillons par semaine sur quatre réseaux, un visuel fixe chacun, et la vue `publications_mesure` prête pour les résultats ; 108 tests sur 108.
- Évaluation : `knowledge/commerce/strategie-commerciale.md` cite le CPF et des prix de services : une source à ne pas donner au rédacteur.
- Correction : le rédacteur ne reçoit que les phrases publiques du site, sans tarif ; le code refuse tout prix sauf les 19 € du livre, tout chiffre absent des offres, le CPF et le nom de Basile.
- Leçon : choisir la source d'un texte public, c'est déjà une garde.
