# Reprise du cerveau rAIme — 28 septembre 2026

## Direction retenue

Conserver les briques existantes et fiabiliser leur fonctionnement avant d'étendre les capacités. Le produit visé est un assistant personnel qui comprend une demande, choisit ses outils, exécute, vérifie son résultat et garde une mémoire exploitable. Une AGI générale reste une ambition de recherche ; le dépôt actuel est un système d'agents et d'outils autour de modèles existants.

La monétisation des contenus (objectif de 2 000 €/mois) se suit séparément des ventes de rAIme. Les résultats financiers sont des objectifs, pas des résultats garantis.

## Périmètre examiné à cette reprise

- Dépôt complet et historique récupérés ; inventaire de 996 fichiers suivis.
- Lecture de la mission, de la Constitution, du carnet, de l'architecture, du runbook, de la feuille de route, de JEPA et du registre des briques.
- Examen détaillé de la chaîne Jarvis → file Postgres → relais → Hermes, de la configuration d'installation, du routage des modèles et de la boucle des agents.
- Lecture des derniers résultats GitHub et diagnostic du serveur en service.
- Les compétences tierces importées, les archives du site et chaque module métier restent à relire individuellement. L'inventaire complet ne vaut pas revue ligne par ligne.

## Constats vérifiés

| Observation | Preuve | Conséquence |
|---|---|---|
| Hermes refusait le relais | GET authentifié `/v1/models` : 401 ; clé de `hermes-data/.env` différente de celle du relais | Les ordres étaient enregistrés puis bloqués |
| Le relais se déclarait disponible à tort | `/sante` : `libre` pendant ce même refus 401 | L'interface affichait des mains prêtes |
| La configuration est réparée | Sauvegarde privée du fichier ; seule la clé de passerelle alignée ; redémarrage ciblé ; GET authentifié : 200 | Liaison rétablie |
| Une demande s'exécute réellement | Ordre 22 soumis par `/api/dire`, état `faite`, fichier `/travail/demande-22/verification.txt` relu sur le serveur, contenu exact `RAIME_EXECUTION_OK_20260928` | Preuve de création de fichier ; les tâches complexes demandent leurs propres vérifications |
| Quatre agents de fond échouent régulièrement | `boucle_passages` : architecte, superviseur, penseur et réflexif en échec ; journal : modèle gratuit indisponible | L'autonomie reste partielle |
| La boucle n'a pas la clé Gemini dans son environnement | Inspection des noms de variables du conteneur, valeurs gardées privées | Une clé ajoutée au fichier `.env` nécessite une recréation du conteneur ou un chargement explicite |
| Une livraison réussie ne prouve pas la configuration des services | Dernière livraison GitHub verte alors que Hermes refusait encore le relais | Ajouter des contrôles de liaison et une procédure de configuration vérifiée |

## Correctif du relais

`/sante` vérifie désormais la passerelle par une lecture authentifiée de `/v1/models`, avec délai maximal. Un refus ou une panne produit `indisponible` et HTTP 503, avec une raison courte qui conserve les secrets côté serveur. L'interface transmet cette raison. L'accusé de réception d'un ordre annonce sa mise en file ; il cesse de promettre un démarrage dans la minute.

Mesure locale : 11 anciens tests passent ; les 5 nouveaux tests échouent avant correction. Après correction : 16 tests ciblés passent. Un cas supplémentaire couvre la remontée du refus dans le tableau de bord et sera exécuté avec Postgres dans la CI.

Le code du relais est chargé au démarrage de `raime-executant`. Après livraison, un redémarrage ciblé, quand le relais est libre, reste nécessaire pour charger cette modification. Jarvis, lui, recharge les fichiers livrés automatiquement.

## Ordre de travail

1. Fiabilité : configuration des moteurs, statut réel, conservation des erreurs, reprise explicite des demandes, vérification des livrables.
2. Autonomie mesurable : rétablir les agents de fond ; évaluer une tâche complète et une panne contrôlée ; distinguer mémoire d'expérience, modification de consignes et apprentissage d'un modèle.
3. Outillage : choisir le moteur de code selon les accès disponibles ; garder le serveur disponible quand le PC est éteint ; connecter les outils du PC tels que Blender par des tâches explicites et isolées.
4. Voix : conserver la chaîne actuelle pendant la vérification des accès OpenAI. Les appels d'une application à l'API vocale ont une facturation propre ; l'abonnement de conversation ne constitue pas à lui seul une clé API.

Références officielles pour les accès : [authentification Codex](https://learn.chatgpt.com/docs/auth), [API audio](https://developers.openai.com/api/docs/guides/audio), [coûts de la voix](https://developers.openai.com/api/docs/guides/voice-latency-cost).

## Points à garder visibles

Les anciens ordres bloqués gardent leur numéro et leur état ; leur reprise doit tenir compte des doublons et de la pertinence actuelle. Un dossier contenant quelques fichiers ne suffit pas à prouver qu'une tâche a réussi. Les erreurs de base silencieusement transformées en listes vides rendent certains diagnostics trompeurs. Les fichiers d'architecture antérieurs à Jarvis doivent être réalignés progressivement sur le code et les observations du serveur.
