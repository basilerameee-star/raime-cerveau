---
name: souverainete
description: Règles de souveraineté du cerveau rAIme — un cerveau qu'on débranche et rebranche ailleurs, sans dépendre d'un fournisseur ; choix et essai des modèles (OpenRouter, repli local), portabilité des données, secrets, sauvegardes. À utiliser avant d'ajouter un service, un modèle, un abonnement ou un hébergement.
---

# Souveraineté : débranchable, rebranchable

Le cerveau appartient à rAIme. Tout composant doit pouvoir partir ailleurs en une journée.

## Les quatre couches, et leur porte de sortie

| Couche | Aujourd'hui | Porte de sortie |
|---|---|---|
| Machine | Hetzner CX43, 16 €/mois | docker-compose + sauvegarde : remontable sur n'importe quel serveur Linux |
| Données | Postgres (`raime_brain`, `n8n`) + pgvector | sauvegarde quotidienne 3 h, copie chez Oracle 3 h 30 |
| Orchestration | n8n auto-hébergé | flux exportés en JSON chaque nuit (2 h 30), versionnés |
| Intelligence | OpenRouter (DeepSeek, Qwen, Solar…) | repli Ollama local ; le routage par tâche isole le choix du modèle |

## Le principe qui tient tout

**Le cerveau s'intègre aux processus ; les processus ne le possèdent jamais.** Chaque service extérieur reste remplaçable :

- une seule variable d'environnement le désigne ;
- ses données vivent dans notre base, jamais seulement chez lui ;
- son remplacement s'écrit dans `journal`, avec le motif.

## Choisir un modèle, et en essayer un nouveau

Depuis le 26/09/2026, tout tourne **sans frais** (`jarvis/parole.cjs`) : Gemini gratuit (plusieurs modèles, chacun son quota), puis le modèle local du serveur ; l'`eclaireur` adopte les meilleurs gratuits. Le routage payant par tâche (`ROUTER` dans `agents/lib.js`) ne sert que si Basile rallume OpenRouter (`OPENROUTER_PAYANT=1`).

Pour intégrer un modèle dont on a entendu parler :

1. vérifier qu'il existe sur OpenRouter (table `models` après la synchronisation) ;
2. le passer au `sas` : la batterie d'essais le note face au modèle en place, sur plusieurs passages ;
3. il remplace le sortant **seulement** s'il fait mieux, ou aussi bien pour moins cher ; le motif va dans `journal` avec le chemin de retour en arrière ;
4. l'`eclaireur` le remesure chaque jour avec la batterie de `metrologie/`, parce qu'un modèle gratuit change en silence.

Automatiser un **fait** (un prix) est sûr. Automatiser un **jugement** sans mesure de qualité ne l'est pas.

## Secrets

Dans `/opt/raime/.env` et `/opt/raime/raime-brain/.env` (chmod 600), lus par `run.sh`. Jamais dans le code, jamais dans un message, jamais dans un dépôt. Une clé qui apparaît quelque part se remplace le jour même.

## Ce qui reste hors du cerveau

Les comptes bancaires, les moyens de paiement et les identifiants personnels restent chez Basile. Voir la compétence `argent`.

Compétences liées : `cerveau`, `agent`, `argent`, `evolution`.
