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
| Gouverneur de jetons / budgétaire | PARTIEL | `agents/econome.js` (16 €/mois modèles) ; budget global de 150 € non encodé |
| Compilateur de contexte | PARTIEL | rudimentaire (consigne resserrée pour le local) |
| Routeur de modèles | PARTIEL | chaîne gratuite (`jarvis/parole.cjs`) ; réparée le 30/09 pour Hermes et la boucle |
| Routeur d'approbation / politiques | PARTIEL | gardien, cordon, sas, brouillons seulement ; pas d'états unifiés |
| Gestionnaire d'état | PARTIEL | tables buts, états, journal, commandes ; pas d'objet d'état unique |
| Watchdog | PARTIEL | crons watchdog, gardien, réparateur ; `/sante` du relais vérifie Hermes depuis le 30/09 |
| Données et intelligence | ACTIF | veilleur, radar, portes CCI, chiffres officiels |
| PostgreSQL | ACTIF | |
| RAG | PARTIEL | 10 708 extraits, recherche par mots (tsvector), pas de recherche sémantique |
| Obsidian | ACTIF | agent `sync` |
| Stockage objet | PARTIEL | Cloudflare R2 pour les sauvegardes |
| Bus d'événements | NON IMPLÉMENTÉ | des tables servent de files |
| n8n | ACTIF | 11 flux actifs sur 20 |
| Moteur de contenu | PARTIEL | images, brouillons ; aucune publication en service |
| Influenceur IA / clip farming | PLANIFIÉ / NON IMPLÉMENTÉ | |
| Croissance et distribution | PARTIEL | clé Meta rangée ; module de publication à livrer |
| Analyse et apprentissage | PARTIEL | métrologue ; réflexif réparé le 30/09 (à confirmer) |
| Ventes et administration | PARTIEL | prospection n8n, brouillons, tri des e-mails, DocuSeal |
| Livraison client | PARTIEL | scripts d'audit, d'arbitrage, Score |
| Finance / CFO | PARTIEL | dépense des modèles seulement ; table `revenus` vide |
| Ingénierie / DevOps | ACTIF | porte GitHub → serveur (banc, OIDC) |
| Crons applicateur, déposeur, installeur de compétences | HÉRITAGE | servaient l'ancien exécutant (retiré le 26/09) ; plus rien depuis le 28/09 |
| Passerelle du Trésor | NON IMPLÉMENTÉ | voulu |
| Studio, factories | NON IMPLÉMENTÉ | App Factory partielle via Hermes |
| Interface vocale | ACTIF | Jarvis (Whisper, voix Gemini, repli Piper) |
| Cockpit | PARTIEL | réel ; pas encore la carte des départements |
| Sécurité, secrets | ACTIF | coffre (fichier 600), moindre privilège, scan |
| Sauvegarde / restauration | ACTIF | R2 chaque nuit (OK du 27 au 30/09) ; restauration non retestée le 30/09 |
| Observabilité | PARTIEL | agent_runs, boucle_passages, journal ; pas de trace_id de bout en bout |

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

## Prochaines tâches, dans l'ordre

1. Prouver par un vrai ordre et un vrai passage des quatre agents que les réparations du 30/09 tiennent.
2. Pont vers les routines Claude Code (demande d'outil → routine → branche → banc → porte) : il faut que
   Basile crée la routine et range son jeton d'appel dans le coffre.
3. Faire poser la configuration d'Hermes par la porte à chaque livraison (aujourd'hui : à la main).
4. Retirer les crons hérités après accord ; relancer ou clore les anciens ordres échoués (14 à 21).
