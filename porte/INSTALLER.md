# Installer la porte de déploiement — pour la session locale de Basile

À faire **une seule fois**, depuis l'ordinateur de Basile, qui a déjà l'accès au serveur
(`~/.ssh/raime_vps`, comme `deploy.sh`). La session cloud n'a pas cet accès : ces étapes
lui sont impossibles, et c'est voulu.

Une fois faites, chaque fusion sur `main` part en ligne toute seule (`.github/workflows/deployer.yml`).

## 1. Poser la porte sur le serveur

La porte vit **hors** du dossier du cerveau : une fusion ne peut donc jamais la modifier
elle-même. Une nouvelle version de la porte se pose à la main, avec cette même commande.

```bash
ssh -i ~/.ssh/raime_vps root@2.29.6.94 'mkdir -p /opt/raime/porte /opt/raime/caddy-services'
scp -i ~/.ssh/raime_vps porte/porte.sh root@2.29.6.94:/opt/raime/porte/porte.sh
ssh -i ~/.ssh/raime_vps root@2.29.6.94 'chown root:root /opt/raime/porte/porte.sh && chmod 755 /opt/raime/porte/porte.sh \
  && command -v flock tar cmp && /opt/raime/porte/porte.sh etat'
```

Attendu : trois chemins d'outils, puis `en service :` (vide) et `précédente :` (vide).

## 2. La clé qui ne sait ouvrir que la porte

```bash
ssh-keygen -t ed25519 -N "" -C porte-github -f ./porte_github
PUB=$(cat ./porte_github.pub)
ssh -i ~/.ssh/raime_vps root@2.29.6.94 \
  "echo 'command=\"/opt/raime/porte/porte.sh\",restrict $PUB' >> /root/.ssh/authorized_keys"
# Essai : même en demandant autre chose, seule la porte répond.
ssh -i ./porte_github root@2.29.6.94 'ls /'      # → « REFUS : demande inconnue »
ssh -i ./porte_github root@2.29.6.94 etat       # → en service : …
```

## 3. Les trois secrets GitHub

Dans le dépôt `raime-cerveau` → Settings → Secrets and variables → Actions → New repository secret :

| Nom | Valeur |
|---|---|
| `PORTE_CLE` | tout le contenu de `./porte_github` (la clé **privée**) |
| `PORTE_HOTE` | `root@2.29.6.94` |
| `PORTE_HOTE_CONNU` | la sortie de `ssh-keyscan -t ed25519 2.29.6.94` (une ligne) |

Puis **effacer** `./porte_github` et `./porte_github.pub` de l'ordinateur : la clé vit
désormais seulement dans GitHub.

## 4. Caddy lit les blocs des services

Chaque service posé par la porte écrit son bloc dans `/opt/raime/caddy-services/<nom>.caddy`.
Caddy doit les voir et les lire :

1. Dans `/opt/raime/docker-compose.yml` (ou l'override), au service `caddy`, ajouter le volume :
   `- ./caddy-services:/etc/caddy/services:ro`
2. À la fin du `Caddyfile`, ajouter la ligne : `import /etc/caddy/services/*.caddy`
3. `cd /opt/raime && docker compose up -d caddy && docker exec raime-caddy-1 caddy validate --config /etc/caddy/Caddyfile`

Si le conteneur ne s'appelle pas `raime-caddy-1`, ou le réseau pas `raime_default`, le dire
à la session cloud : ce sont deux réglages en tête de `porte/porte.sh`.

## 5. Le DNS des sous-domaines

Un enregistrement **A** générique : `*.raime.fr → 2.29.6.94`. Chaque service `<nom>`
répond alors à `https://<nom>.raime.fr` sans autre geste ; Caddy obtient le certificat seul.

## 6. Premier envoi

GitHub → Actions → « Livraison » → Run workflow. Au premier passage, la porte photographie
le cerveau en service (version « initiale ») avant d'y toucher : en cas d'échec, il revient tel quel.

## Revenir en arrière à la main

```bash
ssh -i ./porte_github root@2.29.6.94 revenir     # ou, sans la clé de la porte :
ssh -i ~/.ssh/raime_vps root@2.29.6.94 '/opt/raime/porte/porte.sh revenir'
```

Le journal de la porte : `/opt/raime/porte/journal.log`.

## 7. Le jeton des chantiers (l'architecte demande, la session cloud construit)

Sur GitHub → Settings (du compte) → Developer settings → Fine-grained tokens → Generate :
dépôt **raime-cerveau seulement**, permission **Issues : Read and write**, rien d'autre, expiration un an.
Puis, sur le serveur, l'ajouter au `.env` du cerveau (jamais dans le dépôt) :

```bash
ssh -i ~/.ssh/raime_vps root@2.29.6.94 "echo 'GITHUB_CHANTIER_TOKEN=<le jeton>' >> /opt/raime/raime-brain/.env"
```

Essai : lancer un cycle de l'architecte ; s'il constate un manque mesuré, une issue « chantier » apparaît sur le dépôt.

## 8. Le moteur de recherche du cerveau (SearXNG)

Pour que `rechercher_solution` lise aussi les documentations et les forums, sans clé ni abonnement :
un conteneur `searxng/searxng` sur le réseau `raime_default`, **sans** bloc Caddy (il reste interne),
avec le format JSON activé (`search.formats: [html, json]` dans `settings.yml`). Puis, dans le `.env` du cerveau :
`RECHERCHE_URL=http://searxng:8080`. Sans lui, la recherche passe par la bibliothèque, GitHub, Hacker News et arXiv.
