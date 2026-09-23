---
name: cerveau
description: Carte du cerveau de rAIme — où vit la firme (serveur Hetzner, base, boucle permanente, agents, flux n8n), ce qui tourne déjà et à quel rythme, où écrire. À lire en premier pour toute action touchant les agents, la base, les flux, la veille, la prospection ou l'automatisation de rAIme.
---

# Le cerveau de rAIme

Une seule machine porte la firme. Tout le reste s'y branche.

## Où il vit

- **Serveur** : Hetzner CX43, `root@2.29.6.94`, clé `~/.ssh/raime_vps`. **16 €/mois**, prélèvement automatique.
- **Racine** : `/opt/raime/` (docker-compose, scripts, sauvegardes) et `/opt/raime/raime-brain/` (le cerveau : agents, base de connaissance, migrations).
- **Copie de travail** : `C:\Users\Lenovo\Projets\rAIme\cerveau\`.
- **Conteneurs** (8 attendus) : `raime-postgres-1`, `raime-n8n-1`, `raime-caddy-1`, `raime-boucle`, `raime-cockpit-1`, `raime-metabase-1`, `raime-voyage-1`, `docuseal`.

## Le cœur battant

`raime-boucle` (conteneur `node:20-alpine`, `agents/boucle.js`, redémarrage automatique) réveille chaque agent à son rythme, vérifie toutes les 5 minutes, garde la trace dans `agent_runs` et écrit ses échecs dans `journal`. Il survit aux redémarrages du serveur : **le cron système reste inutile**.

Sous rythme aujourd'hui : `cordon` (1 h), `instruments` (1 h), `reconciliateur` (2 h), `superviseur` (4 h), `radar` (6 h), `sas` (12 h), `sync` OpenRouter (12 h), `heraut` (24 h), `prospective` (7 j), `metrologue` (7 j).

Présents et **en sommeil** (hors boucle) : `auditeur`, `analyste`, `annuaire`, `cartographe`, `contradicteur`, `garde_audit`, `mission`, `redacteur`, `reflexif`, `score`.

## Les autres rythmes (crontab de root)

Sauvegardes (3 h) et copie chez Oracle (3 h 30), sauvegarde des flux n8n (2 h 30), veille des modèles (7 h), radar des modèles (6 h 50), réparateur (30 min), gardien (30 min), watchdog des approvisionnements (3 h), inventaire des services (1er du mois).

## Les flux n8n

`Vigie` (veille RAG), `Sentinelle` (surveillance et alerte), `Radar produit`, `ROI Engine`, `Amy` (capture, qualification, rédaction), `Sherlock` (sourcing), `Passeur` (après-vente), `Plume` (contenu LinkedIn), `Léonard` (fiche d'audit), `Commercial Engine`. Un flux compte comme **en service** seulement s'il a un `activeVersionId`.

## Comment regarder avant d'agir

```bash
ssh -i ~/.ssh/raime_vps root@2.29.6.94 'docker ps --format "{{.Names}} {{.Status}}"; docker logs --tail 20 raime-boucle'
```

Puis la base : `agent_runs` (qui a tourné, quand), `journal` (ce que la firme a décidé et pourquoi), `radar_events`, `companies`, `proposals`, `audits`.

## Règles de conduite

1. **Regarder l'état réel avant d'affirmer.** Les captures de mémoire vieillissent ; la base et `docker ps` disent la vérité.
2. **Tout passe par la boucle.** Un agent utile reçoit un rythme dans `RYTHMES` ; voir la compétence `agent`.
3. **Chaque décision laisse une trace** dans `journal` (acteur, changement, motif).
4. **Le plafond de dépense du cerveau, c'est le serveur : 16 €/mois.** Au-delà, la firme demande avant.
5. Voix des textes destinés au public : la compétence `charte-raime` fait foi.

Compétences liées : `agent`, `souverainete`, `commercial`, `argent`, `identite`, `evolution`.
