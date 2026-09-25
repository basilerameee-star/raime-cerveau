# Architecture du cerveau rAIme

*Tenue à jour par la session cloud. Dernière révision : 24 septembre 2026 (chantiers 1 à 6).*

Ce document dit **ce qui existe, où, et comment les pièces se parlent**. Pour agir (déployer, revenir en arrière,
lancer un essai), voir [`RUNBOOK.md`](RUNBOOK.md). Pour les règles, la [Constitution](plugin-cerveau/CONSTITUTION.md) prime.

## Vue d'ensemble

```
          Basile : une phrase, un « ok »
                     │
   ┌─────────────────▼──────────────────┐        ┌───────────────────────────────┐
   │  Session cloud (Claude Code)        │        │  GitHub : raime-cerveau (privé)│
   │  lit la mission, le carnet,         │──PR──▶ │  CI « Banc d'essai » (npm test)│
   │  les issues « chantier »            │◀─issue─│  CI « Résumé pour Basile »     │
   └─────────────────────────────────────┘        │  « Livraison » à chaque fusion │
                                                  └──────────────┬────────────────┘
                                                                 │ git archive, par la porte
                                                                 ▼ (clé limitée à un script)
   ┌──────────────────────────── Serveur Hetzner (16 €/mois) ───────────────────────────┐
   │  /opt/raime/porte/porte.sh   pose la version, vérifie, revient seule en arrière     │
   │  /opt/raime/raime-brain/     le cerveau : agents/, .env (clés), out/, bibliotheque/ │
   │  raime-boucle                la boucle permanente qui réveille chaque agent         │
   │  raime-postgres-1            bases raime_brain et n8n                               │
   │  raime-caddy-1               HTTPS pour raime.fr et chaque <nom>.raime.fr           │
   │  raime-service-<nom>         un conteneur par service vendu (atelier)               │
   └────────────────────────────────────────────────────────────────────────────────────┘
```

## Les pièces

### Le socle — `agents/lib.js`
- **Routage par tâche** (`ROUTER`) : `extraction`, `raisonnement`, `contradiction`, `redaction`, `decision`. Le choix du
  modèle est fixé ici ; son prix vient du catalogue synchronisé (table `models`).
- **Modèle factice** (`agents/modele_factice.js`) : avec `MODELE_FACTICE=1`, aucune requête ne part ; la réponse vient
  de `tests/fixtures/modele_factice.json` (choisie par tâche, motif de consigne et, au besoin, texte reçu). Sans fixture,
  erreur franche. Sans la variable, le chemin de production est inchangé.
- Traçabilité : `agent_runs` (coût, jetons, durée), `journal` (acteur, changement, motif).

### La boucle — `agents/boucle.js`
Un conteneur qui ne s'arrête jamais ; chaque agent a son rythme (table `RYTHMES`). Un agent en échec écrit au journal
et la boucle continue. Le héraut (prospection par e-mail) est **en pause**.

### L'agent réflexif — `agents/architecte.js`
Le cycle PROPOSER → EXECUTER → EVALUER → CORRIGER → MEMORISER → METAFLECHIR → DEMANDER_INFOS, chaque étape écrite dans
`etats`. Catalogue **fermé** de huit actions : `mesurer`, `chercher`, `examiner_consigne`, `ecrire_note`,
`proposer_offre`, `rechercher_solution`, `ouvrir_chantier`, `rien`. Tables : `buts`, `croyances`, `limites`, `etats`, `demandes`.

### La boucle d'auto-construction (chantier 4)
- `agents/rechercheur.js` — `rechercher_solution` : bibliothèque, GitHub, Hacker News, arXiv, SearXNG (`RECHERCHE_URL`).
  Chaque piste est notée par le code (sécurité, adéquation, fiabilité, licence, fraîcheur, coût) ; la meilleure va
  en quarantaine (table `pistes`).
- `agents/chantiers.js` — `ouvrir_chantier` : une issue GitHub `chantier` (constat, mesure chiffrée, attendu, piste).
  Jeton `GITHUB_CHANTIER_TOKEN`, trois chantiers ouverts au plus.
- La session cloud lit ces issues d'abord, traite la plus utile, la ferme avec la mesure avant / après.

### La mémoire et la veille
- `agents/bibliothecaire.js` : la bibliothèque (`kb_chunks`), recherche plein texte en français, le titre pèse triple.
- `agents/encyclopediste.js` : le savoir général (Wikipédia en français, CC BY-SA).
- `agents/chiffres_ia.js` : le répertoire des chiffres officiels (Insee, Eurostat) sur l'usage de l'IA par les
  entreprises. Règle : un pourcentage d'adoption ne se cite jamais de mémoire, il se tire d'ici — phrase exacte,
  millésime, source, collection, date et lien figés ; `verifierIntegrite()` écarte toute entrée tronquée.
- `agents/veilleur.js`, `radar.js`, `chasseur.js`, `sas.js`, `metrologue.js` : veille, mesure des modèles (batterie
  `metrologie/taches.js` notée par du code), porte d'entrée des nouveautés.

### L'atelier — `atelier/` (chantier 3)
Une phrase devient un service vendable à `https://<nom>.raime.fr` :
`brief.js` (ce que dit la phrase, rien de plus) → `contenu.js` (rédigé, relu par le code) → `stripe.js` (produit, prix,
lien de paiement ; clé restreinte seulement) → `site.js` (pages et briques) → `controles.js` (8 contrôles) →
`services/<nom>/` (Dockerfile Caddy + `service.conf`). Commande : `node atelier/atelier.js "phrase" [--demonstration]`.
Le compte Stripe de rAIme n'encaisse que pour rAIme, ou en test pour une démonstration.

### La publicité — `agents/publiciste.js` (chantier 5)
Neuf brouillons par semaine (LinkedIn, Facebook, Instagram, TikTok), texte + visuel fixe SVG, tirés de
`publicite/offres.json` (phrases déjà publiées). Table `publications`, vue `publications_mesure`. **Rien n'est publié.**

### Les portes d'entrée — `agents/portes.js` (chantier 4 bis)
CCI et organismes de formation : cartographie des procédures de référencement (pages publiques, `robots.txt`),
balance bénéfice / risque, dossier sans donnée inventée, lot de 30 présenté à Basile (`out/portes/LOT-n.md`).
Table `portes`. **Rien n'est envoyé** avant le « ok » du lot.

### La livraison — `porte/` et `.github/workflows/` (chantier 2)
- `tests.yml` : `npm test` sur chaque pull request (Postgres 16 en service, modèle factice, aucune clé).
- `resume.yml` : la section « Pour Basile » en tête de chaque pull request (`porte/verifier_resume.mjs`).
- `deployer.yml` : à chaque fusion sur `main`, le banc, puis `git archive` envoyé par SSH à `porte.sh deployer <sha>`.
  Un retour en arrière écrit sa ligne au carnet. Sans les secrets `PORTE_*`, l'envoi est sauté avec un avertissement.
- `porte/porte.sh` : recopie le cerveau **sans rien effacer** ni toucher `.env`, `out/`, `bibliotheque/`,
  `node_modules/` ; lance chaque `services/<nom>/` en conteneur + bloc Caddy ; vérifie ; revient seul en arrière.
  Au premier passage, photographie le cerveau en service (« initiale »). Installation : [`porte/INSTALLER.md`](porte/INSTALLER.md).

### Le banc d'essai — `tests/banc/` (chantier 1)
`npm test` recrée deux bases `_test` depuis `db/` (structure de production, aucune donnée), y verse des données
fictives, coupe le réseau (`tests/banc/outils.mjs`) et fait tourner tous les tests.

## Les données

| Base | Tables principales |
|---|---|
| `raime_brain` | `agent_runs`, `journal`, `models`, `metrologie`, `candidats`, `kb_chunks`, `veille`, `idees_offres`, `buts`, `croyances`, `limites`, `etats`, `demandes`, `pistes`, `publications`, `portes` |
| `n8n` | `prospects` (dont CCI et organismes), `outreach`, `veille_ia`, `system_learnings`, `exec_health` |

## Où vivent les secrets

Jamais dans le dépôt. Sur le serveur : `/opt/raime/raime-brain/.env` (OpenRouter, jeton des chantiers, Stripe,
`RECHERCHE_URL`). Dans GitHub : `PORTE_CLE`, `PORTE_HOTE`, `PORTE_HOTE_CONNU` (et `STRIPE_CLE_TEST` pour l'atelier).
