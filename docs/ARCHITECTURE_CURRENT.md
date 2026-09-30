# rAIme — état réel face à la cible (MASTER_ARCHITECTURE.md)

Mis à jour le 30/09/2026 par Claude (reprise après Codex). `MASTER_ARCHITECTURE.md` décrit la CIBLE ;
ce fichier dit ce qui tourne VRAIMENT, vérifié sur le serveur et par les tests. À relire et corriger à
chaque reprise, avant tout nouveau chantier. Le journal détaillé reste `carnet/CARNET.md` ; la reprise de
Codex du 28/09 : `REPRISE_CODEX.md`.

## Comment vérifier (sans rien casser)

- Code : `git log --oneline -20` ; la CI « Livraison » passe le banc complet (Postgres) avant tout
  déploiement ; en local, seuls les tests sans base passent (les autres demandent Postgres).
- Serveur : `/opt/raime/porte/journal.log` (version en service) ; tables `commandes` (ordres),
  `boucle_passages` (agents : `statut` ok/echec), `regime_budget`, `journal` ; journaux des conteneurs
  `raime-boucle`, `raime-hermes`, `raime-executant`, `raime-ollama`.
- Une livraison verte ne prouve pas que les services sont bien configurés : la configuration d'Hermes
  (`/opt/raime/hermes-data/config.yaml`) n'est posée que par `hermes/brancher.sh`, pas par la porte.

## Les trois mains (architecture retenue le 30/09/2026)

1. **Code déterministe** d'abord (heure, météo, rappels, budget, tri, contrôles) : sans modèle.
2. **Hermes** (Hermes Agent, conteneur `raime-hermes`, relais `raime-executant`) : les ordres courants,
   sur les modèles gratuits (Gemini 3.8 Flash, puis 3.7 Flash, 3.1 Flash Lite, puis Gemma 4 local).
3. **Claude Code, par l'abonnement de Basile** : l'ingénierie. Jamais de clé API Anthropic, jamais de
   facturation à l'usage ; quota épuisé = l'ordre attend. Voie prévue : une routine Claude Code
   (déclencheur API) lancée par le cerveau pour chaque demande d'outil ; elle code sur une branche
   `claude/…`, le banc teste, la porte déploie après fusion. Codex / Astra : escalade lancée par Basile.

## Composants (ACTIF / PARTIEL / PLANIFIÉ / HÉRITAGE / CASSÉ / NON IMPLÉMENTÉ)

| Composant | État | Preuve ou manque |
|---|---|---|
| Directeur (Jarvis, `jarvis/`) | PARTIEL | comprend, répond, confie à Hermes ; pas de délégation par département |
| Routeur de tâches | PARTIEL | ordre ou question, par règles (`jarvis/esprit.cjs`) |
| Gouverneur de jetons / budgétaire | PARTIEL | `agents/econome.js` (16 €/mois modèles) ; le cap fixe les deux niveaux (modèles ≤ 16 €, total ≤ 150 €) |
| Compilateur de contexte | PARTIEL | le cap (`jarvis/cap.cjs` + `agents/cap.js`, 30/09) en tête de chaque consigne ; pas encore de contexte par tâche |
| Routeur de modèles | PARTIEL | chaîne gratuite (`jarvis/parole.cjs`) ; réparée le 30/09 : agents sur Gemini 3.5 Flash (9 s, 0 $), Hermes passe seul de 3.8 à 3.7 Flash (ordre 25 fait en 2 min) |
| Routeur d'approbation / politiques | PARTIEL | le goût (`agents/gout.js`, 30/09) : AUTO / REVUE / BASILE / BLOQUE par règles puis JEV ; branché sur les questions de l'architecte ; gardien, cordon, sas à côté |
| Gestionnaire d'état | PARTIEL | le cap vivant (passé, futur, leçons, versions gardées dans `cap`) ; tables buts, états, journal, commandes |
| Watchdog | PARTIEL | crons watchdog, gardien, réparateur ; `/sante` du relais vérifie Hermes depuis le 30/09 |
| Données et intelligence | ACTIF | veilleur, radar, portes CCI, chiffres officiels, répertoire public-apis (1 848 API, `apis_publiques`, outil MCP) |
| PostgreSQL | ACTIF | |
| RAG | PARTIEL | 10 708 extraits, recherche par mots (tsvector), pas de recherche sémantique |
| Obsidian | PARTIEL | les notes entrent par le dossier `bibliotheque/` que range le bibliothécaire ; leur synchronisation depuis le PC reste à vérifier (l'agent `sync` était celui du catalogue OpenRouter, retiré) |
| Stockage objet | PARTIEL | Cloudflare R2 pour les sauvegardes |
| Bus d'événements | NON IMPLÉMENTÉ | des tables servent de files |
| n8n | ACTIF | 9 flux actifs sur 20 (« Cortex · Chat » et « Vigie » désactivés le 30/09) |
| Moteur de contenu | PARTIEL | images, brouillons ; aucune publication en service |
| Influenceur IA / clip farming | PLANIFIÉ / NON IMPLÉMENTÉ | |
| Croissance et distribution | PARTIEL | clé Meta rangée ; module de publication à livrer |
| Analyse et apprentissage | PARTIEL | métrologue ; architecte (70 s) et superviseur (26 s) repassés avec succès le 30/09, réflexif et penseur sur la même chaîne |
| Ventes et administration | PARTIEL | prospection n8n (212 envois, 2 réponses au 30/09), brouillons, tri des e-mails, DocuSeal, appels de relance à J+7 (`jarvis/appels.cjs`) |
| Vitrines (commerçants sans site) | PARTIEL | `agents/vitrines.js` en service (OpenStreetMap ; Google Places dès la clé) ; maquettes publiques `/demo/<slug>` ; brouillons ; liste d'appels ; l'envoi attend la validation du texte et son canal |
| Livraison client | PARTIEL | scripts d'audit, d'arbitrage, Score |
| Finance / CFO | PARTIEL | dépense des modèles seulement ; table `revenus` vide |
| Ingénierie / DevOps | ACTIF | porte GitHub → serveur (banc, OIDC) |
| Crons applicateur, déposeur, installeur de compétences | RETIRÉS le 30/09 | crontab sauvegardée ; scripts rangés dans `/opt/raime/scripts/retires-20260930/` |
| Passerelle du Trésor | NON IMPLÉMENTÉ | voulu |
| Studio, factories | NON IMPLÉMENTÉ | App Factory partielle via Hermes |
| Interface vocale | ACTIF | Jarvis (Whisper, voix Gemini, repli Piper) |
| Cockpit | PARTIEL | réel ; pas encore la carte des départements |
| Sécurité, secrets | ACTIF | coffre (fichier 600), moindre privilège, scan |
| Sauvegarde / restauration | ACTIF | R2 chaque nuit (OK du 27 au 30/09) ; restauration non retestée le 30/09 |
| Observabilité | PARTIEL | agent_runs, boucle_passages, journal ; pas de trace_id de bout en bout |

## Contrôle de la structure du 30/09/2026 (demande de Basile, avant les routines Claude)

- **Contradictions corrigées** : l'objectif n° 1 (2 000 €/mois de monétisation des contenus) manquait aux buts
  de l'architecte (ajouté, but 14) ; le but 13 parlait de publicités payantes (organique, zéro budget) ;
  16 € (modèles, Constitution) et 150 € (fonctionnement total, MASTER) sont deux niveaux, écrits dans le cap.
- **Une seule boussole** : le cap (objectifs, règles, goût, bonne réponse, règles commerciales, passé, futur)
  part avec chaque consigne d'agent, dans Jarvis (sans doublon) et dans les ordres d'Hermes.
- **Bruit retiré** : sur 16 questions en attente pour Basile, 13 étaient internes ou trouvables (closes par le
  goût, motif gardé) ; restent 3 : suivi des ouvertures (n° 11), taux de réponse de 1,2 % (n° 14),
  prestataires réels (n° 27).
- **Doublons RETIRÉS le 30/09 avec l'accord de Basile** : `chasseur` et la partie payante du `metrologue`
  (modèles OpenRouter, coupé depuis le 26/09 ; l'éclaireur couvre le gratuit) ; flux n8n « Cortex · Chat »
  (l'ancien chat, remplacé par Jarvis) et « Vigie — Veille IA (RAG) » (sources mortes, remplacée par veilleur
  et radar) ; crons applicateur, déposeur, installeur ; documents périmés `ARCHITECTURE.md`,
  `FEUILLE_DE_ROUTE.md`, `MISSION_CLOUD.md` (ils décrivent encore l'ancien exécutant).
- **Six agents de réflexion** (architecte, réflexif, penseur, superviseur, prospective, priorité) pour peu
  d'agents qui produisent : le cap et le goût les alignent ; à regrouper en un seul flux d'idées jugées.
- **Écart principal avec l'objectif** : rien ne travaille encore l'objectif n° 1. Aucune publication en
  service, revenus des plateformes à 0, aucun compte relié (seule la clé Meta existe ; Page RAIME non
  assignée, Instagram personnel). La première routine Claude doit servir ce moteur de contenu.

## Plateformes externes (recherche du 30/09/2026, sources officielles)

| Plateforme | Décision | Pourquoi |
|---|---|---|
| Claude Code routines (cloud, planifiées, API, GitHub) | UTILISER | abonnement, pas l'API ; refusées quand le quota est vide si les « usage credits » restent coupés — https://code.claude.com/docs/en/routines |
| `claude setup-token` sur le serveur | PLUS TARD | possible, mais Claude aurait la main sur la production ; les routines suffisent |
| Crédit « Agent SDK » des abonnements | IGNORER | annoncé pour le 15/06/2026, suspendu (« nothing has changed ») |
| OpenAI Codex | ESCALADE, à la main | automatisation serveur = clé API payante ou jeton Enterprise ; « dots » : Pro 500 $, hors UE |
| Voix temps réel OpenAI | IGNORER | API payante |
| Meta Muse / Muse for Small Business | REGARDER | États-Unis et Canada seulement ; en France, l'API Graph de Meta reste la voie |
| Connecteur claude.ai vers le serveur MCP du cerveau | PLUS TARD | exposer le cerveau sur Internet avec OAuth : sécurité d'abord |

## Prochaines tâches

Elles vivent dans la feuille de route : `jarvis/feuille_de_route.json` (source), copie lisible `docs/FEUILLE_DE_ROUTE.md`,
et dans le coffre Obsidian (note 14). Jarvis, le cap des agents et Hermes (outil `feuille_de_route_lire`) la lisent.
