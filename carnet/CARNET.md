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

## 2026-09-24 — lecture de la mission mise à jour par la session locale
- Action : relire le commit « Le savoir entre dans le cerveau… » (session locale) : mission, Constitution, catalogue.
- Résultat : trois changements pour la session cloud : l'action `rechercher_solution`, une piste retenue dans chaque chantier, le chantier 4 bis (CCI et organismes de formation), et la balance bénéfice / risque en trois zones.
- Évaluation : le chantier 4 livré cette nuit était incomplet au regard de la mission à jour.
- Correction : `rechercher_solution` construit dans la foulée.
- Leçon : relire `main` avant chaque chantier ; la mission bouge pendant la nuit.

## 2026-09-24 — chantier 5 — fusion
- Action : pull request n° 5 fusionnée (CI verte).
- Résultat : le publiciste passera une fois par semaine ; brouillons seulement.
- Évaluation : conforme.
- Correction : aucune.
- Leçon : —

## 2026-09-24 — chantier 4 — rechercher_solution
- Action : `agents/rechercheur.js`, l'action de l'architecte, la piste dans le chantier, 9 tests.
- Résultat : cinq sources, six critères notés par le code, la meilleure piste en quarantaine ; 117 tests sur 117.
- Évaluation : le piège prévu (un dépôt très suivi qui fait « curl … | sh ») est refusé par les règles de l'installeur, reprises telles quelles.
- Correction : aucune.
- Leçon : réutiliser une garde existante vaut mieux qu'en écrire une seconde qui divergera.

## 2026-09-24 — chantier 4 — fusion de rechercher_solution
- Action : pull request n° 6 fusionnée (CI verte).
- Résultat : l'architecte a huit actions ; SearXNG attend la session locale (`porte/INSTALLER.md`, étape 8).
- Évaluation : conforme.
- Correction : aucune.
- Leçon : —

## 2026-09-24 — chantier 4 bis — les portes d'entrée, jusqu'au lot
- Action : `agents/portes.js` (importer, cartographier, peser, préparer, présenter un lot), 10 tests, passage quotidien dans la boucle.
- Résultat : 127 tests sur 127. Un lot se présente dès que 30 portes sont prêtes, un seul à la fois.
- Évaluation : l'adresse postale de rAIme est « communiquée sur demande » dans les mentions légales : elle manque aux dossiers qui l'exigent ; de même le téléphone, le CV, le tarif journalier, l'attestation d'assurance.
- Correction : ces champs sont listés comme manquants dans chaque dossier et en tête du lot, jamais remplis au hasard.
- Leçon : l'exécution d'un lot (formulaires, e-mails) demande le « ok » de CE lot, présenté avec sa balance : l'accord général de la nuit ne le remplace pas.

## 2026-09-24 — chantier 4 bis — fusion
- Action : pull request n° 7 fusionnée (CI verte).
- Résultat : la boucle cartographiera 40 portes par jour dès le prochain déploiement.
- Évaluation : conforme ; le critère (un lot préparé, présenté, confirmé, exécuté) attend la production et le « ok » du premier lot.
- Correction : aucune.
- Leçon : —

## 2026-09-24 — chantier 6 — documenter
- Action : `ARCHITECTURE.md`, `RUNBOOK.md` ; mises à jour de `README.md`, `briques/README.md`, des compétences `agent` et `evolution`.
- Résultat : la compétence `agent` décrivait encore un déploiement par `scp` et une fonction `appeler()` qui n'existe pas dans `lib.js` ; la requête de vérification lisait `started_at`, colonne absente d'`agent_runs` (c'est `created_at`).
- Évaluation : trois erreurs de documentation antérieures à cette nuit, trouvées en relisant le code.
- Correction : exemples alignés sur `askJson` et `created_at` ; déploiement par pull request, banc et porte ; `reflexif` retiré des agents « endormis » (il a son rythme).
- Leçon : une documentation se relit contre le code, jamais contre la mémoire.

## 2026-09-24 — session locale — la porte sans secret
- Action : réécrire la réception de la porte. GitHub signe chaque livraison (jeton OIDC) ; `porte/porte_http.py`, sur le serveur, vérifie la signature avec la clé publique de GitHub, puis le dépôt, la branche `main`, l'action `deployer.yml`, l'audience `raime-porte`, la version, la date, et qu'un jeton ne sert qu'une fois. `deployer.yml` envoie l'archive à `https://cockpit.raime.fr/porte/livrer`.
- Résultat : 12 tests (`tests/banc/porte_http_test.py`, clé d'essai fabriquée par openssl) ; une signature toujours acceptée fait tomber un test.
- Évaluation : plus aucune clé privée à copier dans GitHub, plus d'accès SSH entrant pour GitHub. Basile n'a rien à manipuler.
- Correction : `porte.sh` redémarre aussi la boucle après la recopie et vérifie qu'elle repart (`[boucle] démarrée`, pas d'`arrêt fatal`) ; sinon retour en arrière. Sans cela, le code livré dormait sur le disque : la boucle garde ses modules en mémoire. Le banc la déclare absente (`PORTE_BOUCLE=''`).
- Leçon : un secret qu'on n'a pas à garder est un secret qui ne fuit pas.

## 2026-09-24 — session locale — la boucle ne rejoue plus tout à chaque redémarrage
- Action : lire `derniereExecution()` de la boucle.
- Résultat : elle ne regardait qu'`agent_runs`. Le chasseur, le veilleur, le sas, le bibliothécaire, l'encyclopédiste n'y écrivent pas : ils repartaient à CHAQUE redémarrage.
- Évaluation : avec une livraison par fusion, la facture du chasseur aurait suivi le nombre de fusions.
- Correction : la boucle note elle-même chaque passage (`boucle_passages`) et prend le plus récent des deux.
- Leçon : un rythme qui dépend de la bonne volonté de chaque agent n'est pas un rythme.

## 2026-09-24 — session locale — le savoir vivant
- Action : quand la bibliothèque rend moins de trois passages, Cortex interroge Wikipédia en direct ; le titre qui a répondu est noté (`savoir_demandes`) et l'agent `curieux` (toutes les heures) range l'article entier. L'encyclopédiste passe à 60 articles par domaine et par jour (23 domaines).
- Résultat : essai sur « intrication quantique », « kabbale et arbre de vie », « microbiote intestinal » : l'article juste arrive en tête à chaque fois.
- Évaluation : conforme ; en attente de mise en service.
- Leçon : la bibliothèque grandit d'abord de ce qu'on lui demande vraiment.

## 2026-09-24 — session locale — ce qui attend Basile
- La mise en service sur le serveur (porte, Caddy, cerveau, Cockpit) est **arrêtée par le garde-fou de la session locale** tant que Basile dort : toute mise en production attend sa parole. Tout est prêt, la notice est `porte/INSTALLER.md`.
- Le DNS `*.raime.fr` (Cloudflare) : ni la session locale ni la session cloud n'y ont accès.
- La clé Stripe restreinte de test : c'est la clé du compte d'argent de Basile ; aucune session ne la crée ni ne la manipule. Basile la crée ; la session locale la pose dans le `.env` du serveur.

### Message de la session locale à la session cloud
Bonjour. Trois choses, pour ta prochaine reprise :
1. **Ta porte a changé de serrure, pas de rôle.** Plus de `PORTE_CLE` / `PORTE_HOTE` / `PORTE_HOTE_CONNU` : GitHub signe, le serveur vérifie (`porte/porte_http.py`, `deployer.yml` avec `id-token: write`). `porte.sh` reste le tien ; j'y ai seulement ajouté le redémarrage vérifié de la boucle. Si tu modifies `deployer.yml`, garde le nom du fichier, la branche `main` et l'audience `raime-porte` : la porte les exige.
2. **La porte n'est pas encore posée** sur le serveur : elle attend le « ok » de Basile au réveil. Jusque-là, la « Livraison » s'arrête sur un avertissement, sans échec. Tes agents fusionnés (portes, publiciste, rechercheur, chantiers, atelier) partiront avec le premier envoi.
3. **Les questions que tu as posées à Basile** (les trois sites d'essai, les e-mails de 7 h 15) restent les siennes : je n'y réponds pas à sa place. La clé Stripe de test et le DNS aussi.
Merci pour le travail de cette nuit : le banc a déjà trouvé un vrai défaut en production (le `\b` du héraut), c'est exactement ce qu'il fallait.

## 2026-09-25 — session locale — la porte est posée, pas encore ouverte
- Action : pose de `porte.sh`, `porte_http.py` et du service `raime-porte` sur le serveur, sur le « ok » de Basile.
- Résultat : service actif, écoute sur 172.18.0.1:8765, `porte.sh etat` répond (aucune version encore). Caddy joint la porte (`porte prête`).
- Évaluation : deux défauts à la pose — fins de ligne Windows sur `porte.sh` (« env: bash\r »), pare-feu qui refusait Caddy.
- Correction : fins de ligne converties ; une règle de pare-feu étroite (réseau Docker vers le port 8765 seulement). Notice mise à jour.
- Reste : l'entrée publique dans Caddy (`cockpit.raime.fr/porte/`), puis le premier envoi. Arrêté par le garde-fou de la session locale : attend Basile.
- Leçon : un script copié depuis Windows se copie depuis Git, jamais depuis le dossier de travail.

## 2026-09-24 — livraison — échec, retour automatique
- Action : déploiement de b1b3a02088ce par la porte.
- Résultat : code 3 (3 = version précédente remise, 4 = aucune version précédente).
- Évaluation : ÉCHEC de b1b3a02088ce1b89a23472488d1508a39c37ee45 : installation des dépendances échouée — retour à initiale RETOUR ARRIÈRE réussi : initiale en service 
- Correction : aucune version cassée ne reste en ligne ; la cause est à traiter dans une nouvelle pull request.
- Leçon : à tirer par la session suivante.
## 2026-09-25 — session locale — premier envoi : la chaîne entière a marché, et la porte est revenue en arrière
- Action : premier envoi par la Livraison (b1b3a02) : banc vert sur GitHub, jeton signé accepté par la porte, cerveau photographié (« initiale »).
- Résultat : échec à l'installation des dépendances ; retour arrière réussi en 34 secondes ; boucle repartie (15 agents).
- Évaluation : `run.sh` était enregistré dans Git sans droit d'exécution (dépôt créé sous Windows, où Git ne garde pas ce droit) ; recopié tel quel, le lanceur ne pouvait plus démarrer. `raime-audit.sh` et `deploy.sh` avaient le même défaut.
- Correction : droit d'exécution rendu aux trois scripts dans Git (`git update-index --chmod=+x`).
- Leçon : le retour arrière automatique a été éprouvé en production dès le premier jour, et il tient. Tout script ajouté depuis Windows doit recevoir son droit d'exécution dans Git.

## 2026-09-25 — session cloud — la pause du héraut, jusque dans le cron
- Action : Basile m'a laissé choisir l'option recommandée pour mes questions en attente. Question des e-mails de 7 h 15 : `cron.raime` lançait encore `agents/heraut.js 14` chaque matin, alors que la boucle l'a mis en pause le 23/09.
- Résultat : ligne mise en commentaire ; un test (`tests/banc/pause.test.mjs`) vérifie que ni le cron ni la boucle ne lancent le héraut. Avant : 1 test sur 2 ; après : 2 sur 2.
- Évaluation : la copie installée sur le serveur (`/etc/cron.d/raime-brain`) ne change pas avec le dépôt : la porte recopie `cron.raime`, pas `/etc/cron.d`.
- Correction : à réinstaller par la session locale (commande en tête de `cron.raime`).
- Leçon : une pause se pose partout où l'agent peut être réveillé, et un test la garde.

## 2026-09-25 — session cloud — trois sites de démonstration : préparés, pas fusionnés
- Choix recommandé : trois commerces fictifs en mode démonstration (bandeau, non indexés, paiement de test seulement), plutôt qu'une fausse offre de rAIme.
- Évaluation : `*.raime.fr` n'existe pas encore dans le DNS (`essai.raime.fr` ne répond pas). Fusionner `services/` maintenant ferait échouer la vérification de la porte (Caddy sans certificat) et revenir en arrière TOUT le déploiement, cerveau compris.
- Correction : les sites attendent sur leur branche ; ils partiront après l'enregistrement DNS générique.
- Leçon : un service ne se fusionne qu'une fois son adresse joignable, sinon il emporte le cerveau dans son retour arrière.

## 2026-09-25 (nuit) — session locale — le cron du héraut n'était pas installé
- Action : vérifié sur le serveur avant de réinstaller `cron.raime` (demande n° 9 de la session cloud).
- Résultat : `/etc/cron.d/raime-brain` n'existe pas ; la crontab de root ne cite pas le héraut ; `out/heraut.log` n'a pas bougé depuis le 03/09. Rien ne préparait d'e-mails à 7 h 15.
- Évaluation : le constat de la session cloud venait du fichier du dépôt, pas du serveur. Installer `cron.raime` aurait lancé en double la supervision et la mise à jour du catalogue, que la boucle fait déjà.
- Correction : `cron.raime` n'est PAS installé ; son en-tête le dit désormais. La modification de la demande n° 9 reste juste (cohérence du dépôt), elle n'a rien à déclencher.
- Leçon : un constat sur le serveur se vérifie sur le serveur (fichiers installés, journaux), pas dans le dépôt.
- Pour la session cloud : la session locale construit cette nuit, sur la branche `nuit-2026-09-25`, l'essayeur (fait), le kit serveur client (fait), le Gardien version sas (fait, 16 cas figés), la Constitution v2 en proposition (faite), puis le penseur, la priorité de l'architecte, Jarvis et les sources légales. Merci de ne pas les construire en double.

## 2026-09-26 — session cloud — Hermes maison, branché sur le cerveau
- Demande de Basile : un « Hermes maison 100 % avec tous ses outils », en utilisant les modules de free-claude-code (FCC).
- Action : lecture des deux dépôts. FCC : 63 000 lignes de Python, AGPL-3.0, Python 3.14.7 imposé, un proxy vers 55 fournisseurs. Hermes Agent (NousResearch) : MIT, 300 Mo, des centaines d'outils (terminal, navigateur, mémoire, compétences, tâches planifiées, messageries, MCP).
- Choix (option recommandée, Basile m'ayant laissé choisir) : faire tourner le vrai Hermes chez rAIme plutôt que le réécrire ; la « maison » passe par un serveur MCP du cerveau (`agents/raime_mcp.js`, cinq outils, le Gardien en travers de chaque appel, le journal à chaque appel). FCC en phase 2, dans son propre conteneur, jamais copié dans ce dépôt (AGPL).
- Résultat : 14 tests ; essai supplémentaire avec le client MCP officiel (@modelcontextprotocol/sdk) : connexion, liste des outils, appel réussis. 145 tests sur 145.
- Évaluation : deux assertions de mes propres tests étaient fausses (elles lisaient les commentaires qui décrivent justement ce qui est interdit).
- Correction : les lignes de commentaire sont ignorées ; une mutation (`network_mode: host` actif) fait bien échouer le test.
- Leçon : un test de configuration se vérifie en y glissant la faute qu'il doit voir.
- Question ouverte : Jarvis (session locale) et Hermes se recouvrent (voix, messageries, conversation). Hermes peut être le moteur de Jarvis ; à trancher avant de doubler le travail.

## 2026-09-26 — session cloud — Hermes posé sur le serveur, redémarrait en boucle
- Action : Basile a lancé les étapes 1 à 3 depuis PowerShell : jetons posés, image construite, `raime-mcp` à l'écoute (5 outils).
- Résultat : `raime-hermes` « Up 6 seconds » une heure après sa création ; `docker exec … hermes` se ferme aussitôt.
- Évaluation : sans commande, l'image lance la conversation interactive ; sans terminal, elle s'arrête et Docker la relance. Le compose d'origine d'Hermes passe `command: ["gateway", "run"]` : je l'avais omis.
- Correction : la commande ajoutée, gardée par un test ; la notice interdit `--remove-orphans` (le compose partage `/opt/raime` avec le compose principal).
- Leçon : en reprenant la configuration d'un projet, recopier aussi sa commande de démarrage, pas seulement ses volumes et son réseau.

## 2026-09-26 — session cloud — Hermes répond avec la mémoire de la maison
- Action : après la correction « gateway run », Basile relance ; puis une question en une ligne : « Quelles questions le cerveau attend-il de Basile ? Utilise le serveur raime. »
- Résultat : `raime-hermes` « Up 20 seconds » (plus de boucle) ; Hermes répond avec les vraies demandes ouvertes du cerveau (n° 13, 14, 21 bloquantes ; 7, 9, 10, 11…), lues par le serveur MCP. Premier appel réel de bout en bout : Hermes → raime-mcp → Gardien → base → journal.
- Évaluation : deux accrocs sans gravité : les avertissements « Nous Portal » (Hermes essaie son propre service avant OpenRouter), et PowerShell qui retire les guillemets des arguments (« 'questions' is not a hermes command »).
- Correction : apostrophes doublées dans les commandes PowerShell ; notée dans la notice avec l'étape Telegram.
- Leçon : une commande donnée à Basile se donne dans la syntaxe exacte de SON terminal (PowerShell), pas dans celle du serveur.

## 2026-09-26 — session cloud — Hermes prend la place de l'exécutant du Cockpit
- Action : un relais (`hermes/executant.js`) parle le langage de l'exécutant attendu par le Cockpit (`/sante`, `/tache`, `.resultat.json`) et prend son nom réseau `harness` ; Hermes reçoit `/travail` et le cerveau en lecture seule. `brancher.sh` bascule en une commande, `revenir.sh` rallume l'ancien.
- Résultat : 7 tests du relais ; 152 tests sur 152.
- Évaluation : le Cockpit reste identique ; l'ancien exécutant est arrêté, pas supprimé (sa politique de redémarrage est gardée pour le retour).
- Leçon : remplacer un moteur derrière un contrat existant plutôt que modifier l'interface ; le retour arrière tient en une commande.
