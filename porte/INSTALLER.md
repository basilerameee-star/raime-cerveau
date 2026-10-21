# Installer la porte de déploiement — pour la session locale de Basile

À faire **une seule fois**, depuis l'ordinateur de Basile, qui a déjà l'accès au serveur
(`~/.ssh/raime_vps`). La session cloud n'a pas cet accès : ces étapes lui sont impossibles,
et c'est voulu.

Une fois faites, chaque fusion sur `main` part en ligne toute seule (`.github/workflows/deployer.yml`).

## Aucun secret (version du 24 septembre 2026)

La première version demandait une clé privée copiée dans les secrets GitHub. Basile ne
manipule pas de clés, et une clé qui dort quelque part peut fuir. La porte fonctionne donc
autrement : à chaque livraison, **GitHub signe un jeton** (OIDC) qui dit quel dépôt, quelle
branche et quelle action livrent. Sur le serveur, `porte/porte_http.py` vérifie la signature
avec la clé **publique** de GitHub, puis chaque affirmation : dépôt `raime-cerveau`, branche
`main`, action `deployer.yml` (donc après le banc d'essai), jeton neuf et non périmé. Alors
seulement la version passe à `porte.sh`.

Rien à copier dans GitHub. Rien à effacer ensuite.

## 1. Poser la porte et son écoute

La porte vit **hors** du dossier du cerveau : une fusion ne peut jamais la modifier.
Une nouvelle version se pose à la main, avec ces mêmes commandes.

```bash
K="-i ~/.ssh/raime_vps"
ssh $K root@2.29.6.94 'mkdir -p /opt/raime/porte /opt/raime/caddy-services'
scp $K porte/porte.sh porte/porte_http.py porte/raime-porte.service root@2.29.6.94:/opt/raime/porte/
ssh $K root@2.29.6.94 'cd /opt/raime/porte && chmod 755 porte.sh porte_http.py \
  && mv raime-porte.service /etc/systemd/system/ && systemctl daemon-reload \
  && systemctl enable --now raime-porte && ./porte.sh etat \
  && docker exec raime-caddy-1 wget -qO- http://172.18.0.1:8765/porte/sante'
```

Attendu : `en service :` (vide), `précédente :` (vide), puis `porte prête`.

**Deux pièges rencontrés à la pose (25/09/2026)** :
- *Fins de ligne* : sur Windows, Git écrit les fichiers avec des fins de ligne Windows ; `porte.sh`
  copié tel quel répond « env: bash ». Copier depuis Git (`git show HEAD:porte/porte.sh`) ou
  corriger sur le serveur (`sed -i 's/$//' porte.sh porte_http.py`). Même raison pour tout envoi
  manuel du dépôt : `git -c core.autocrlf=false archive HEAD`.
- *Pare-feu* : le serveur n'accepte que SSH. Caddy (réseau Docker 172.18.0.0/16) ne joignait pas
  la porte ; une seule ouverture, étroite :
  `ufw allow from 172.18.0.0/16 to 172.18.0.1 port 8765 proto tcp`.
L'écoute se fait sur `172.18.0.1:8765`, la passerelle du réseau Docker `raime_default` :
Caddy la joint, Internet non.

## 2. Caddy : l'entrée de la porte et les blocs des services

Sauvegarder `Caddyfile` et `docker-compose.yml`, puis :

1. Dans le bloc `cockpit.raime.fr`, la porte échappe au mot de passe (elle a sa propre
   vérification) et passe avant le Cockpit :

   ```
   cockpit.raime.fr {
     @protected not path /unsub* /porte/*
     basic_auth @protected { … inchangé … }
     handle /porte/* {
       reverse_proxy 172.18.0.1:8765 {
         flush_interval -1
       }
     }
     handle {
       reverse_proxy cockpit:8090
     }
   }
   ```

2. À la fin du `Caddyfile` : `import /etc/caddy/services/*.caddy`
3. Dans `docker-compose.yml`, au service `caddy`, le volume
   `- ./caddy-services:/etc/caddy/services:ro`
4. Écrire le `Caddyfile` **en place** (`cat nouveau > Caddyfile`, jamais `sed -i` : le fichier
   est monté seul dans le conteneur, un nouveau fichier ne serait pas vu), puis
   `docker compose up -d --no-deps caddy` et
   `docker exec raime-caddy-1 caddy validate --config /etc/caddy/Caddyfile`.
5. Depuis l'extérieur : `curl https://cockpit.raime.fr/porte/sante` → `porte prête`.

## 3. Le DNS des sous-domaines

Un enregistrement **A** générique chez Cloudflare, **sans le nuage orange** :
`*.raime.fr → 2.29.6.94`. Chaque service `<nom>` répond alors à `https://<nom>.raime.fr`,
Caddy obtient le certificat seul. Sans lui, un service ne peut pas avoir de certificat, sa
vérification échoue et la porte revient en arrière : c'est bloquant pour les services, pas
pour le cerveau.

## 4. Premier envoi

GitHub → Actions → « Livraison » → Run workflow (ou la prochaine fusion sur `main`).
Au premier passage, la porte photographie le cerveau en service (version « initiale »)
avant d'y toucher : en cas d'échec, il revient tel quel. Elle redémarre ensuite la boucle
et vérifie qu'elle repart proprement, sinon elle revient en arrière.

## Revenir en arrière à la main

```bash
ssh -i ~/.ssh/raime_vps root@2.29.6.94 '/opt/raime/porte/porte.sh revenir'
```

Le journal de la porte : `/opt/raime/porte/journal.log` (réception web et déploiements).

## 5. Le jeton des chantiers (l'architecte demande, la session cloud construit)

Sur GitHub → Settings (du compte) → Developer settings → Fine-grained tokens → Generate :
dépôt **raime-cerveau seulement**, permission **Issues : Read and write**, rien d'autre, expiration un an.
Puis, sur le serveur, l'ajouter au `.env` du cerveau (jamais dans le dépôt) :

```bash
ssh -i ~/.ssh/raime_vps root@2.29.6.94 "echo 'GITHUB_CHANTIER_TOKEN=<le jeton>' >> /opt/raime/raime-brain/.env"
```

Essai : lancer un cycle de l'architecte ; s'il constate un manque mesuré, une issue « chantier » apparaît sur le dépôt.

## 6. Le moteur de recherche du cerveau (SearXNG)

Pour que `rechercher_solution` lise aussi les documentations et les forums, sans clé ni abonnement :
un conteneur `searxng/searxng:2026.9.23-3cd69d30e` (version fixée le 21/10/2026, jamais « latest ») sur le réseau `raime_default`, **sans** bloc Caddy (il reste interne),
avec le format JSON activé (`search.formats: [html, json]` dans `settings.yml`). Puis, dans le `.env` du cerveau :
`RECHERCHE_URL=http://searxng:8080`. Sans lui, la recherche passe par la bibliothèque, GitHub, Hacker News et arXiv.
