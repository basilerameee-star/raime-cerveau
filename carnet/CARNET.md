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

## 2026-09-26 — session cloud — La compétence vidéo d'Hermes (WanGP, sur le PC)
- Action : Basile a installé Wan2GP (RTX 3060). WanGP sert lui-même un serveur MCP (`--mcp`, documenté dans son dépôt) : la compétence `hermes/competences/video-wangp/` apprend à Hermes à le piloter, un lanceur `.bat` le démarre sur ce PC seulement (127.0.0.1), un petit script l'ajoute à la configuration d'Hermes.
- Résultat : 4 tests (forme, licences, lanceur Windows, ajout unique à la configuration) ; mutation « H3 parmi les autorisés » attrapée.
- Évaluation : MiniMax H3 figure dans WanGP, mais sa licence exclut l'Union européenne : interdit dans la compétence. Tout autre modèle : licence lue et notée avant le premier usage.
- Leçon : avant d'écrire un pont, chercher si l'outil en sert déjà un (WanGP avait son MCP) ; lire le script qu'on enveloppe (`run.bat` change de dossier : chemins absolus).

## 2026-09-26 — session cloud — Preuve de bout en bout, et une erreur trouvée par la preuve
- Action : Basile exige « testé, garanti, prouvé ». Répétition complète sur la machine de la session : le vrai Hermes (commit d0288be5, Python 3.14.7, mêmes extras que l'image), la configuration et l'âme du serveur, le vrai serveur MCP du cerveau, le relais, et le Cockpit tel quel (copie conforme de son conteneur) ; seul OpenRouter est remplacé par un modèle de substitution. Script rejouable : `tests/repetition/hermes_bout_en_bout.sh`.
- Résultat : PREUVE OK — la demande notée comme Jarvis la note passe « faite », sa réponse vient de la base, le journal porte l'appel d'Hermes et la demande. Mutation (mauvaise clé dans le relais) : ÉCHEC détecté. `brancher.sh` / `revenir.sh` joués avec un docker simulé, compose lu par le vrai `docker compose` (4 tests, mutation attrapée par deux tests après correction d'un test trop faible).
- Évaluation : ERREUR TROUVÉE dans mon propre travail du jour : sous Windows, Hermes range ses compétences dans `%LOCALAPPDATA%\hermes`, pas `~\.hermes`. Les commandes de l'étape 6 auraient posé la compétence vidéo au mauvais endroit, sans message d'erreur. Deux constats : les outils MCP d'Hermes passent par son catalogue (`tool_search` / `tool_call`), ce qui économise des jetons ; le régime « arrêt » du Cockpit coupe aussi les ordres, pas seulement les réponses.
- Correction : `ajouter_wangp.py` calcule le dossier comme Hermes (vérifié contre le code d'Hermes, Windows simulé) et copie lui-même la compétence ; une seule commande à l'étape 6.
- Leçon : une notice n'est pas prouvée tant qu'on n'a pas lu le code de l'outil sur la plateforme de Basile ; le dossier par défaut change selon le système.

## 2026-09-26 — session cloud — La parole et les ordres ne s'arrêtent plus avec le crédit
- Action : Basile, le 25/09, trouve Jarvis coupé (« crédit OpenRouter dépassé »). Demande : toujours disponible, sans frais. Cortex passe par une chaîne GRATUITE seulement (`cockpit/parole.js` : Gemini, Groq/Mistral/Cerebras si leur clé est au coffre, modèles OpenRouter à prix zéro relus en direct, puis le modèle local Ollama + Qwen3 4B, Apache 2.0). Le régime « arrêt » ne bloque plus ni la parole ni les ordres (en arrêt : gratuit seulement). Hermes reçoit une chaîne de repli (Gemini puis le local, nommé `local`).
- Résultat : répétition avec le vrai Hermes, 9 étapes, PREUVE OK : budget en arrêt + OpenRouter en 402 + aucune clé Gemini → Jarvis répond (modèle local), un ordre est exécuté ; budget normal + 402 → Hermes passe seul au local (« refused for billing/credits — using fallback qwen3:4b via local »). Tests : 7 (parole) + 3 (relais), mutations attrapées.
- Évaluation : DEUX FAUTES TROUVÉES par la répétition. ① Hermes rend certains échecs comme une réponse ordinaire (« ⚠️ Provider authentication failed », statut 200, zéro jeton) : le relais les annonçait « faits » au Cockpit. ② Demander Gemini sans clé Gemini fait échouer Hermes d'emblée, sans repli. Et une limite de mon essai : `api_max_retries: 0` coupait la chaîne de repli ; la valeur par défaut (3) la laisse aller au bout.
- Correction : le relais reconnaît tous les signes d'échec (finish_reason error, hermes.failed, X-Hermes-Completed, ⚠️ à zéro jeton) ; sur un refus d'accès au modèle (crédit, quota, clé), il redemande au modèle local ; un vrai échec de la tâche n'est jamais refait.
- Reste (côté serveur, refusé à la session par les règles de sécurité de l'environnement : « déploiement en production ») : installer Ollama + Qwen3 4B, donner la clé Gemini à Hermes, reconstruire le Cockpit. À décider avec Basile.
- Leçon : un échec peut se déguiser en succès ; la preuve doit vérifier la réponse, pas seulement le statut.
## 2026-09-26 — session cloud — Scan de sécurité complet (ECC / AgentShield)
- Action : AgentShield 1.6.0 (projet ECC, paquet officiel) sur tout le dépôt avec analyse de flux ; `npm audit` ; recherche de clés dans les 128 commits de l'historique ; relecture du chemin Jarvis → exécutant.
- Résultat : aucun défaut exploitable. 14 « critiques » = empreintes sha512 de package-lock.json (faux positifs vérifiés) ; 12 constats sur `site/CLAUDE.md` (notes de la session locale, à compléter sur le PC) ; 0 vulnérabilité npm ; aucune clé dans l'historique (contre-épreuve réussie). Rapport : `securite/SCAN-2026-09-26.md`.
- Leçon : un outil de scan donne des alertes, pas des verdicts ; chaque « critique » se vérifie à la ligne avant d'être annoncé.

## 2026-09-26 — session cloud — Installation en une commande, Gemma 4, WhatsApp, influenceur
- Action : Basile autorise les scripts d'installation du serveur et valide les PR #17 et #18. `hermes/installer.sh` fait tout (clé Gemini du coffre → Hermes, bascule, Ollama avec Qwen3 4B en service et Gemma 4 E4B essayé à côté, Cockpit reconstruit) ; `cockpit/mettre_a_jour.sh` reconstruit le Cockpit et remet l'ancienne version s'il ne répond pas. WhatsApp : mode « self-chat » d'Hermes (numéro personnel, sans Meta). Compétence vidéo : modèles d'avatar parlant et marche à suivre de l'influenceur IA.
- Vérifié à la source : Gemma 4 existe (google-deepmind/gemma : E2B, E4B, 26B-A4B, 31B) et Ollama 0.34.4 le prend en charge (`gemma4:e4b`) ; la licence des poids n'a pas pu être lue d'ici (site de Google bloqué) : le script l'affiche sur le serveur. Licences des modèles vidéo lues dans leurs dépôts : InfiniteTalk, MultiTalk, Wan 2.2 (Apache 2.0), LongCat (MIT), LTX-2.x (gratuite sous 10 M$ de chiffre d'affaires). WhatsApp : l'API officielle exigerait de retirer le compte personnel du numéro ; le pont d'Hermes (Baileys) garde le compte, avec un petit risque de restriction.
- Résultat : 4 tests d'installation (docker simulé : ordre des gestes, clé jamais affichée, relance sans doublon, sans Gemini ni Gemma, retour arrière du Cockpit, refus sans nouveau code) ; contre-épreuve : sans la remise de l'ancienne image, le test échoue.
- Leçon : un faux docker doit aussi jouer le retour arrière, sinon le test accuse le script à tort.

## 2026-09-26 — session cloud — Premier passage d'installer.sh sur le serveur
- Résultat réel : clé Gemini transmise ; bascule faite (Hermes et le relais démarrés) ; Qwen3 4B et Gemma 4 E4B téléchargés ; Gemma 4 répond en 22 s, **licence Apache 2.0** (lue sur le serveur). Étape 4 arrêtée proprement : « /opt/raime/cockpit/server.js n'a pas encore la nouvelle version ; rien n'est touché ».
- Évaluation : le Cockpit en service se construit depuis une copie à part (`/opt/raime/cockpit`), pas depuis le dépôt livré (`raime-brain/cockpit`). Le garde-fou a joué son rôle.
- Correction : `mettre_a_jour.sh` verse le code du dépôt dans la copie à part, seulement si chaque fichier en service a l'empreinte d'une version connue du dépôt (`cockpit/empreintes_connues.txt`, 42 empreintes) ; sinon il s'arrête sans rien toucher ; ancien dossier gardé, remis avec l'image si la nouvelle version ne répond pas. 3 tests de plus.
- Leçon : vérifier d'où un conteneur est construit avant d'écrire sa mise à jour.

## 2026-09-26 — session cloud — Le modèle local devient Gemma 4 E4B
- Mesure sur le serveur : Gemma 4 E4B répond en 22 s (licence Apache 2.0 affichée par `ollama show`) ; Qwen3 4B occupe 4 cœurs à 100 % plusieurs minutes (il « réfléchit » malgré `think: false`) ; contexte d'Ollama à 4 096 jetons, trop court pour les consignes d'Hermes.
- Correction : Gemma 4 E4B partout (Cockpit, relais, repli d'Hermes, installation) ; `OLLAMA_CONTEXT_LENGTH=16384` ; essai limité à 3 minutes ; si le modèle local ne répond pas, l'installation s'arrête avant le Cockpit (test ajouté).
- Leçon : choisir le modèle local sur la mesure faite sur la vraie machine, pas sur sa réputation.

## 2026-09-26 — session cloud — Jarvis : un visage en particules, un ton humain, plus d'alerte de crédit à l'accueil
- Action : Basile veut un visage « style similaire en particules » à la place de la boule, un ton moins haché, et ne plus entendre l'alerte de crédit à chaque accueil.
- Résultat : deux essais de tête calculée par formules, regardés dans un vrai navigateur : un « œuf » à deux yeux, jugé insuffisant. Troisième essai : le maillage facial canonique de MediaPipe (Apache 2.0), tiré en 6 500 particules avec l'orientation de chaque facette (`tools/visage_particules.py`) : front, yeux roses qui clignent, nez, lèvres (la bouche s'ouvre avec la voix), menton ; reflets roses du côté de la lumière ; léger mouvement de tête. Consigne orale : phrases naturelles et liées, fin du « deux à quatre phrases courtes ». L'accueil ne dit plus les crédits (toujours affichés dans le panneau).
- Évaluation : la liste des empreintes du Cockpit ne contenait pas la version de parole.js en service (Gemma 4) : la mise à jour suivante se serait bloquée.
- Correction : `tools/empreintes_cockpit.sh` régénère la liste ; un test exige la version de travail de chaque fichier.
- Leçon : juger un rendu en le regardant, pas en le supposant ; un garde-fou doit être tenu à jour par le code, pas par la mémoire.
- Suite, même jour : premier ordre réel de Basile (« ok top, fais moi un site pour mercedes en mode cyberpunk… ») : Jarvis répond « je m'en occupe… dès que nous aurons de nouveaux crédits » SANS rien confier à Hermes. Causes : la reconnaissance des ordres ignorait « fais-moi » et une phrase ouverte par « ok top, » ; la consigne décrivait encore l'ancien exécutant payant. Corrigé (formules d'ouverture, « fais / écris / dépose / pousse… », exception « fais le point ») ; Jarvis sait que l'exécutant est Hermes, qu'aucun crédit ne le bloque, et qu'il n'a pas accès au PC de Basile. Test `jarvis_intention` (11 cas).

## 2026-09-26 — session cloud — Ménage du dépôt
- Action : Basile demande de supprimer les doublons et tout ce qui est en trop. Inventaire des 338 fichiers, doublons exacts par empreinte, références recherchées, en-tête de chaque candidat lu.
- Supprimés (20) : la sauvegarde du Score v1 (`agents/score_v1_sauvegarde.js.txt`) ; 11 scripts à usage unique déjà joués (diagnostics du Héraut, réparations ponctuelles de brouillons, retrait du CPF, purge du financement, sondes de modèles) ; `kb_cadre.sql`, `kb_load.sql`, `kb_marche.sql` (mot pour mot les documents de `knowledge/`) ; les 4 migrations de la racine et `deploy_v1.sql` (toutes leurs tables sont dans `db/schema_raime_brain.sql`). L'historique Git les garde.
- Gardés, à dessein : `site/` (copie fidèle du site, recopiée depuis le PC : toute suppression serait annulée) ; les doublons `briques/` ↔ `site/` (bibliothèque de l'atelier) ; `raime-audit.sh`, `raime-arbitrage.sh` (commandes lancées à la main, donc citées nulle part) ; `verif_gardes`, `relire_audit` (contrôles réutilisables) ; `migrations/` (historique appliqué).
- Résultat : 183 tests sur 183 ; chaque agent se charge.
- Leçon : « cité nulle part » ne veut pas dire « inutile » : une commande qu'on lance à la main n'est citée par personne.

## 2026-09-26 — session cloud — Le Cockpit reconstruit à neuf : Jarvis, et plus aucun OpenRouter
- Constat de Basile : « quasiment rien d'opérationnel », le Cockpit « reste sur OpenRouter », les livraisons GitHub « ne sont pas prises en compte », et Jarvis dit encore « tant que le budget n'est pas rechargé ».
- Causes, vérifiées : (1) l'ancien Cockpit était une image construite une fois, depuis une copie à part (`/opt/raime/cockpit`) : les livraisons (toutes réussies) arrivaient sur le disque sans jamais entrer dans le conteneur ; (2) l'état « Arrêt des dépenses… jusqu'à une recharge » de l'économe entrait dans la conversation de Jarvis, et ses anciennes réponses le répétaient ; (3) les agents du cerveau et Hermes passaient d'abord par OpenRouter ; (4) un ordre tombé faute de crédit restait « pour Claude » sans que personne ne le reprenne.
- Correction : nouveau Cockpit `jarvis/` (l'ancien `cockpit/` supprimé, ainsi que l'ancien exécutant `briques/harness/`). Son code est lu directement dans le dépôt livré, en lecture seule ; un lanceur le recharge seul dans les 10 secondes qui suivent chaque livraison (prouvé). Interface façon Iron Man : visage en particules dans des anneaux holographiques, conversation orale continue, texte, dictée ; ordres suivis en direct (lien du résultat, bouton « relancer ») ; objectif 2 000 € par mois avec les encaissements notés ; prospection à valider ; coffre ; livrables. Parole et agents : Gemini gratuit puis le modèle local, OpenRouter jamais (sauf si Basile le rallume, `OPENROUTER_PAYANT=1`) ; la boucle ne met plus d'agent en pause pour le budget. Hermes : Gemini d'abord (le local si pas de clé). Les ordres tombés faute de crédit reviennent une fois à Hermes. Installation : une commande (`hermes/installer.sh`), retour automatique à l'ancien s'il ne répond pas, retour volontaire `jarvis/revenir.sh`.
- Vérifié : banc complet ; 9 tests du nouveau Cockpit sur les bases du banc ; 7 tests de l'installation ; répétition avec le vrai Hermes derrière le nouveau Cockpit (« PREUVE OK » deux fois, dont la panne du 25/09) ; interface regardée à 1440 px et 390 px, zéro erreur ; scan AgentShield identique au précédent (faux positifs connus) ; `npm audit` : 0 vulnérabilité.
- Leçon : une livraison n'est « prise en compte » que si le programme en service relit le code livré ; le vérifier au lieu de le supposer.

## 2026-09-26 — session cloud — Installation de Jarvis arrêtée par un garde-fou
- Résultat réel sur le serveur : étapes 1 à 3 faites (Hermes branché, Gemma 4 répond en 61 s) ; étape 4 arrêtée proprement : « /opt/raime/docker-compose.override.yml existe deja et n'est pas le notre ; rien n'est touche ».
- Correction : Jarvis pose son propre fichier `docker-compose.jarvis.yml`, lu après ceux du serveur (jamais modifiés), et l'inscrit au `.env` du dossier (`COMPOSE_FILE`) seulement après la réussite ; l'ancienne ligne est gardée et remise par `revenir.sh`. Le banc simule désormais un serveur qui a déjà sa surcharge.
- Leçon : un banc d'essai doit ressembler au vrai serveur, surcharges comprises.

## 2026-09-26 — session cloud — Cinq paquets de compétences pour Hermes (demande de Basile)
- Importés de GitHub, licence lue et contenu inspecté (aucune instruction piégée, aucun envoi de données ; les programmes inclus sont des tests ou des exemples) : marketing de Corey Haines (50, MIT), stop-slop (MIT), UI UX Pro Max (base de styles et script de recherche, MIT, essayé : « cyberpunk » trouvé), Remotion (12, licence Remotion gratuite jusqu'à 3 personnes), context engineering (17, MIT).
- Évaluation : Hermes joint la description de chaque compétence à chaque demande ; celles d'origine pesaient ~11 000 jetons, assez pour faire déborder le modèle local (16 384).
- Correction : `tools/importer_competences.py` ramène chaque description à une phrase (~2 700 jetons pour les 84), traduit les chemins de Claude Code vers ceux d'Hermes, écarte les tests, écrit SOURCE.md (dépôt, commit, licence). Jarvis applique les règles de stop-slop dans sa propre parole ; Hermes sait quelle compétence prendre. Test `competences` (budget, sources, aucun secret).
- Leçon : une compétence coûte à chaque demande, même inutilisée ; mesurer ce qu'elle ajoute avant de l'installer.

## 2026-09-26 — session cloud — Jarvis en service ; sphère, e-mails, éclaireur, capacités
- Résultat réel : Jarvis tourne sur le serveur (version bc6586beecf5, mains prêtes, parole sans frais). Deux anciens ordres (n°16, n°17) affichent « Hermes 401 » : échecs d'avant la réinstallation ; à relancer d'un geste.
- Demandes de Basile : une sphère de particules réactive à la voix à la place du visage ; le tri de ses e-mails ; que le cerveau voie et adopte les nouveaux modèles ; la liste de tout ce qu'il sait faire.
- Fait : sphère WebGL (9 000 particules, deux coques, volume, graves, aigus et hauteur de la voix ; parallaxe souris et gyroscope ; 44 images/s en rendu logiciel). Courrier : Gmail en lecture seule (imapflow, MIT), classement sans frais toutes les 15 minutes, un e-mail ne peut donner aucun ordre (testé). Éclaireur : liste les modèles gratuits (Gemini, Groq, Mistral, Cerebras, serveur), les mesure avec la batterie de métrologie, et la parole adopte les meilleurs ; il remplace le chasseur payant. Capacités : `jarvis/capacites.json`, tiroir dans Jarvis, connue de sa consigne ; chaque « à brancher » dit ce qu'il faut.
- Refusé : installer « Claude Fable 5.1 en local » depuis un dépôt de consignes divulguées : ce dépôt ne contient que du texte, pas le modèle ; il ne peut pas tourner en local.
- Vérifié : 204 tests sur 204 ; écrans à 1440 px et 390 px, zéro erreur.
- Suite, même soir : capture de Basile : colonne de droite coupée, longue réponse sur la barre de saisie, et Jarvis affirmant « j'ai maintenant le contrôle total sur ces fichiers ». Causes : grille sans limite (`1fr` poussé par un long mot) ; et surtout, le modèle local ne lisait que les 6 000 premiers caractères de la consigne, où l'état réel du cerveau n'entrait plus : Jarvis parlait sans le voir. Corrigé : état réel juste après l'essentiel, fenêtre du local à 12 000 caractères, règle « toi, tu parles ; tes mains agissent » et réponses de cinq phrases au plus, fausses affirmations retirées de la mémoire ; zone de réponse qui défile, sphère réduite pendant une longue réponse, mise en page à une colonne sous 1 200 px. Tests ajoutés.

## 2026-09-26 — session cloud — Ordres bloqués (401), objectif précisé, utilitaires, voix Gemini
- Constat : les ordres n°16 et n°17 échouaient avec « Hermes 401 Invalid gateway API key ». Cause, lue dans le code d'Hermes : il charge son propre fichier `/opt/data/.env` en priorité sur son environnement (`override=True`) ; une autre clé écrite là faisait refuser chaque ordre. Correction : `brancher.sh` y écrit la même clé que le relais (les autres lignes restent), puis TESTE le lien (le relais présente sa clé, Hermes doit répondre 200) ; sinon l'installation s'arrête et le dit. Deux tests ajoutés.
- Précision de Basile : les 2 000 €/mois sont la MONÉTISATION de ses contenus (Instagram, Facebook, TikTok, YouTube), pas les ventes de rAIme. Corrigé : revenus par plateforme, ventes rAIme comptées à part, consigne et jauge mises à jour.
- Construit : météo (Open-Meteo, sans clé), heure, minuteries et rappels dits à voix haute, mémoire longue (« retiens que… » et relecture horaire des échanges), agenda en lecture seule (adresse iCal), voix de Gemini (modèle vocal lu chez Google, repli Piper), idées de la nuit confiables à Hermes d'un geste.
- Vérifié : 218 tests ; écran regardé ; une faiblesse vue à l'écran (table absente → « je n'ai pas pu noter ») corrigée par recréation et nouvel essai.

## 2026-09-28 — reprise Codex — liaison réelle Jarvis → Hermes
- Action : lecture des documents de reprise et du chemin d'exécution, puis diagnostic SSH en lecture seule. Le 27/09 : sept commandes bloquées en 401 et un relais qui se dit libre. Le 28/09 : accord explicite de Basile pour réparer ou reconstruire selon le besoin.
- Résultat : seule la clé de passerelle dans hermes-data/.env différait. Sauvegarde privée, alignement sur la clé existante du relais, redémarrage ciblé d'Hermes ; GET authentifié /v1/models : 401 → 200. Ordre 22 soumis par Jarvis : état faite, fichier verification.txt et contenu exact vérifiés sur le disque.
- Évaluation : la livraison GitHub était verte, mais le script qui corrige cette configuration n'avait pas été appliqué. /sante vérifiait seulement que le relais tournait. Les cinq nouveaux tests reproduisent ce faux positif.
- Correction : /sante vérifie maintenant la passerelle ; refus et panne deviennent indisponibles. La raison remonte dans le tableau ; un ordre enregistré est annoncé comme mis en file. 16 tests ciblés passent après correction, contre 11 sur 16 avant. La CI avec Postgres couvre aussi le tableau.
- Leçon : une liaison se vérifie de bout en bout avec les identifiants du vrai appelant ; un accusé de réception reste distinct d'une exécution. Voir REPRISE_CODEX.md pour le périmètre de revue et la suite, dont l'environnement Gemini manquant dans la boucle.

## 2026-09-30 — reprise Claude après Codex — les mains et les agents réparés
- Action : relevé de l'état réel (dépôt, CI, serveur en lecture) face à `docs/MASTER_ARCHITECTURE.md` ; recherche sur les plateformes d'agents (Anthropic, OpenAI, Meta, Google). Résultat écrit dans `docs/ARCHITECTURE_CURRENT.md`.
- Constats : 10 ordres en échec depuis le 25/09 (n° 14 à 21, 23, 24). Quand Gemini saturait, Hermes demandait gemma4:e4b à Google (404), faute d'adresse sur le repli. Quatre agents (architecte, superviseur, penseur, réflexif) en échec depuis le 26/09 : la boucle n'avait pas la clé Gemini, et le modèle local était coupé à 3 minutes (8 coupures le 30/09).
- Corrections : repli d'Hermes avec son adresse, précédé de Gemini 3.7 Flash et 3.1 Flash Lite (chacun son quota). Essai sur une copie isolée : 404 avant, réponse en 35 s après ; configuration posée sur le serveur, sauvegarde gardée, lien relais → Hermes : 200. La boucle lit les seules clés gratuites absentes de son environnement dans le `.env` du cerveau (test ajouté). Correctif `/sante` de Codex relu et fusionné. Tri des e-mails noté « en place » (402 e-mails classés).
- Leçon : une capacité « en place » se prouve par son dernier passage réussi, pas par la présence du code.
- Suite, même jour : la clé chargée, les agents tombaient encore sur le local. Mesure sur la clé gratuite : 3.1 Pro refusé (429), 3.8 Flash saturé (503), 3.7 Flash muet ; 3.5 Flash et 3.1 Flash Lite répondent. La réflexion profonde les essaie désormais avant le local (test ajouté). Preuves : appel de la boucle servi par Gemini 3.5 Flash en 9 s ; superviseur en 26 s et architecte en 70 s, 0 $ ; ordre 25 soumis par Jarvis : Gemini 3.8 en limite, Hermes passe seul à 3.7 Flash, ordre fait en 2 min, fichier relu sur le disque. La CI a bloqué un commit intermédiaire dont un test échouait : la porte a joué son rôle.

## 2026-09-30 (soir) — contrôle de la structure, le cap, le goût (JEV), les API publiques
- Demande de Basile : avant les routines Claude, un contrôle complet de la structure et de sa pertinence ; un « teacher » qui donne au gouverneur un cap constant (passé, futur, objectif, bonne réponse) sur tous les agents ; un contrôle du goût des décisions ; ses règles commerciales (20 % les mots, 80 % la confiance ; rêve, sécurité, temps ; alpha, bêta ; concision) ; la clé JEV de TypeSafe ; le dépôt public-apis.
- Contrôle : objectif n° 1 absent des buts (ajouté) ; but 13 en publicité payante (organique) ; six agents de réflexion pour peu d'agents qui produisent ; doublons listés dans `docs/ARCHITECTURE_CURRENT.md` (chasseur, métrologue payant, n8n Cortex et Vigie, crons hérités, trois documents périmés), à retirer avec son accord ; rien ne travaille encore l'objectif n° 1.
- Construit : le cap (`jarvis/cap.cjs` fixe, `agents/cap.js` vivant et versionné) en tête de chaque consigne d'agent, dans Jarvis sans doublon et dans les ordres d'Hermes ; le goût (`agents/gout.js`) : règles puis JEV (questions en anglais, mesuré : 0,22 → 0,67 et 0,59 → 0,84 avec la boussole), états AUTO / REVUE / BASILE / BLOQUE, jugements gardés, 500 appels JEV par jour au plus ; les API publiques (1 848, MIT) en base, outil MCP pour Hermes.
- Évaluation honnête : JEV seul jugeait « utiles » 14 questions sur 14. Deux règles écrites (interne ou trouvable) et la liste de ce que la maison possède corrigent : 13 questions sur 16 retenues, 3 restent pour Basile.
- Vérifié : banc complet (Postgres, conteneurs jetables sur le serveur) avant chaque livraison, 242/242 ; en production : cap compilé, jugements JEV réels, architecte en 78 s à 0 $ avec une question retenue.
- Leçon : un juge ne tranche bien que ce qu'on lui a montré ; lui dire ce que la maison possède vaut mieux qu'abaisser un seuil.

## 2026-09-30 (nuit) — ménage de l'ancien modèle, API automatiques, routines Claude, appels à J+7
- Accord de Basile : retirer les doublons et tout l'ancien modèle ; créer les deux routines ; les usage credits sont coupés.
- Retirés : chasseur, métrologue, synchronisation OpenRouter, balayage du sas, cron.raime, applicateur/déposeur/installeur (crons serveur sauvegardés, scripts dans `/opt/raime/scripts/retires-20260930/`), trois documents périmés ; n8n « Cortex · Chat » et « Vigie » désactivés (9 flux actifs). La boucle tourne avec 17 agents.
- Construit : chaque ordre d'Hermes et chaque chantier part avec les API publiques utiles (`jarvis/apis_utiles.cjs`, vérifié en réel : validation d'e-mail → 3 API ; une faute de frappe → aucune) ; appels de relance à J+7 (`jarvis/appels.cjs`, 43 prospects à appeler le soir même, dans /api/etat pour l'interface 3D et à l'oral) ; publicité : petit budget fixé par Basile, chaque campagne avec son accord (cap, but 13).
- Routines Claude (abonnement, Sonnet 5.5, sans connecteur) : « Ingénierie » deux fois par jour (chantiers GitHub, pull request sans fusion) ; « Moteur de contenu » chaque lundi (première livraison : l'étude de positionnement, lancée le soir même).
- Constat : le jeton GitHub du coffre ne voit pas raime-cerveau (404) ; le cerveau ne peut pas encore ouvrir de chantier. Prospection réelle : 212 e-mails depuis le 15/08, 2 réponses ; 94 envois vers des organismes de formation contre 31 vers les cabinets comptables, pourtant cible n° 1.
- Leçon : une routine autonome reçoit par défaut TOUS les connecteurs du compte (Gmail en écriture compris) ; les retirer à la création.

## 2026-09-30 (nuit, suite) — l'agent des vitrines, le budget publicitaire, les réponses de Basile
- Basile : le site 500 € (gratuit s'il ne plaît pas ; « 100 € » dit ensuite, à confirmer) ; maquette dans l'e-mail ; lien d'agenda ; publicité 300 €/mois, chaque campagne avec son accord ; Higgsfield : décision à Claude (API à l'usage) ; pas de pixel de suivi ; registrar trouvé seul : OVH (RDAP), DNS chez Cloudflare.
- Construit : `agents/vitrines.js` (toutes les 2 h, code pur) : Google Places (clé à venir) ou OpenStreetMap ; la Haute-Savoie d'abord ; site ancien reconnu ; e-mail cherché et vérifié ; maquette publique `/demo/<slug>` (seul chemin du Cockpit hors mot de passe, avec /unsub et /porte) ; brouillon au texte de Basile ; sans e-mail → liste d'appels (« e-mail non trouvé »). Fiche pour l'interface : `/api/vitrines/<id>`. Rien n'est envoyé.
- Évaluation : premier passage réel en échec (Overpass 406 : signature de navigateur refusée) et mauvais ordre (Grenoble avant Annecy) ; corrigés, essai réel : 55 boulangeries d'Annecy, 1 brouillon, 1 à appeler, 3 écartées (site récent), maquette servie (200).
- Piège évité : `sed -i` sur un fichier monté dans un conteneur (Caddyfile) change son inode ; le conteneur garde l'ancien. Vérifier depuis l'extérieur (401 → 404 attendu) avant de conclure.
- Mesures : Jarvis répond à une question en 3,8 s (Gemini 3.1 Flash Lite), à l'heure en 0,09 s (code).

## 2026-09-30 (nuit, fin) — la feuille de route, source unique
- Demande de Basile : tout ce qui reste (avec et sans son intervention) dans une feuille de route reprise jusqu'à la fin du projet, facile d'accès pour le gouverneur ; l'argent pour le contenu en tout dernier, après vérification ; WanGP retiré (API Higgsfield) ; comptes Meta, TikTok, YouTube à brancher ensemble, étape par étape.
- Fait : `jarvis/feuille_de_route.json` (41 points, rang, groupe « seul » ou « basile », « il faut », « fini quand », état) ; copies `docs/FEUILLE_DE_ROUTE.md` et note Obsidian 14 (générées par `tools/feuille_vers_markdown.mjs`, un test garde la copie à jour) ; lue par Jarvis (état, `/api/feuille`, `/api/etat`), par le cap des agents (prochains points) et par Hermes (`feuille_de_route_lire`). La routine « Ingénierie » prend aussi les points marqués « routine ». Jarvis : « Parfait. » n'est plus un ordre (vérifié en production).
- Règle : un point passe « fait » par une livraison qui cite sa preuve.

## 2026-09-30 (nuit) — trois changements approuvés, objectif précisé
- Basile approuve : un moteur à la fois (sites à 500 €, puis la niche, puis rAIme avec preuve) ; une niche unique pour la marque média et les produits ; la preuve avant le prix. Puis précise : l'objectif n° 1 est la MONÉTISATION seule, 2 000 € par mois sur chacune de TikTok, YouTube et Instagram (6 000 €), les ventes de produits à part.
- Fait : cap, consigne et calcul de Jarvis (objectif par plateforme, « boutique » comptée à part), but 14 en base, feuille de route réordonnée (41 points, trois moteurs, règles), étude de positionnement v2 (`contenus/POSITIONNEMENT.md` : « les objets et astuces qui suppriment une petite galère du quotidien », en attente du choix de Basile), consignes des deux routines mises à jour.
- Constat : la pull request de la routine (étude v1) a fait échouer le contrôle « Résumé pour Basile » (section « ## Pour Basile » absente) : les consignes des routines l'exigent désormais.
- Clip farming : des sous-titres ne donnent pas le droit de republier la vidéo d'un autre en France ; sources retenues : vidéos de Basile, campagnes de clipping autorisées, licences libres commerciales.

## 2026-10-01 — le personnage de la marque média
- Basile refuse la niche « petites galères du quotidien » (péjorative, réductrice). Direction : un personnage influenceur qui fait lui-même les pubs des produits ; homme au style street, cagoule blanche, sweat noir, visage jamais montré, train de vie fastueux, montres ; 3D sous Blender ; nom commun à choisir, le même partout. Organisation TikTok for Developers créée au nom de rAIme.
- Garde-fous notés : « Image virtuelle », aucune marque de montre réelle sans accord, aucune promesse de gains. `contenus/POSITIONNEMENT.md` et la feuille de route (n° 30, n° 6) mis à jour ; la routine de contenu reste en attente.

## 2026-10-01 (nuit) — Expéditeur corrigé, nom « Obito AF »
- Constat : en mode « pause », l'Expéditeur n8n envoyait quand même vers l'adresse de test et marquait les lignes « envoye ». 47 faux envois du 27 au 30/09 ; aucun n'est parti vers un prospect.
- Correction appliquée le 30/09 à 22 h 36 UTC, avec sauvegarde (`/opt/raime/backups/expediteur-avant-correction-*.json`) :
  - pause : rien ne part ;
  - test : les lignes passent en « teste », jamais « envoye » ;
  - seuls les « valide » partent (les brouillons « x IA » ne partent plus) ;
  - les 47 lignes sont revenues à « valide » (sent_at vide) ;
  - n8n redémarré, entrée au journal.
- Vérifié le 01/10 : la version en service contient les trois corrections ; état des lignes : envoye 167 (les vrais envois d'août et septembre), valide 61.
- Reste à décider par Basile : la signature HTML dit « Amy · rAIme », alors que l'expéditeur est « Basile Rame - rAIme ».
- Marque média : nom retenu « Obito AF », masque d'Obito. Risque de droits signalé (manga *Naruto*), gardé par Basile.
- Images des comptes préparées : Bureau, dossier « A TELEVERSER - comptes ». Guide dans le coffre, note 15.
- Les comptes (Gmail, YouTube, Instagram, Page, TikTok) sont créés par Basile : aucune création de compte ni saisie de mot de passe par Claude.

## 2026-10-01 (nuit) — point 12 fait : le canal d'envoi des vitrines
- Workflow n8n « Vitrines · Envoi des maquettes (gated) » :
  - versionné dans `n8n/vitrines_envoi.json`, importé par `n8n import:workflow`, actif ;
  - la file `vitrines_envoi` et le réglage `vitrines_envoi_config` sont dans la base n8n ;
  - pause : rien ne part ; test : tout part vers la boîte de Basile ; live : en semaine à 9 h, 10 par jour au plus ;
  - chaque e-mail est marqué selon sa propre réponse de Resend ; la clé reste dans n8n.
- Agent de boucle `vitrines_envoi` (toutes les heures) :
  - un brouillon validé entre dans la file ;
  - l'issue revient dans la fiche ;
  - une réponse passe la vitrine à « répondu » et en tête des appels ; un « stop » ou une désinscription l'écarte.
- Preuve : le vrai brouillon n°106 (Techni Nails) est parti en essai de contact@raime.fr et est arrivé dans la boîte de réception de Basile.
- Cockpit :
  - tiroir VITRINES : valider ou écarter d'un clic, voir la maquette, choisir Pause, Essai ou Réel ;
  - `/api/vitrines/envoi` ; Jarvis dit combien sont partis.
- Qualité de l'agent (constats sur de vraies fiches) :
  - une page supprimée d'un site vivant passait pour « aucun site » : la racine est désormais lue ;
  - un site qui répond mal est écarté ;
  - « sur Google » n'est plus dit pour une fiche OpenStreetMap ;
  - l'adresse d'une autre maison est refusée ;
  - une adresse ne reçoit qu'un e-mail ;
  - « une boulangerie » ;
  - une page Facebook ou une fiche d'annuaire n'est pas un site (c'est la cible) ;
  - une adresse sans https:// se lit ;
  - les enseignes ne sont pas démarchées.
- Panneau Monétisation corrigé : 2 000 € sur chacune de TikTok, YouTube et Instagram, « pour les 6 000 € » ; Facebook et produits hors objectif.

## 2026-10-01 — point 17 (n°29) : stratégie de campagne, en cours
- Action : `agents/campagne.js` (code seul, sans modèle) : pour un produit ou une offre, publics, questions de ciblage, deux variantes A/B (seule l'accroche change), règle d'arrêt des perdants, modèle de rapport ; budget borné par les 300 € du cap. Rien n'est lancé ni dépensé. Test : `tests/banc/campagne.test.mjs`.
- Résultat : 5 tests passent en local ; pull request ouverte, point passé « en_cours » (pas « fait » : la preuve se fait en production).
- Évaluation : le point 10 (rentabilité) avait déjà sa pull request n°31, pris le suivant. Les seuils d'arrêt sont des réglages de méthode, à confirmer par Basile avant tout lancement.
- Leçon : brancher plus tard la marge nette du point 10 sur `marge_nette_eur` ; sans marge, le plan n'invente aucun seuil.
