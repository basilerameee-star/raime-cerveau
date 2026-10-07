#!/bin/sh
# Construit l'image et (re)lance le conteneur de l'Envoyeur. À lancer sur le serveur.
set -e
cd "$(dirname "$0")"
docker build -t raime-envoyeur .
docker rm -f raime-envoyeur 2>/dev/null || true
mkdir -p /opt/raime/envoyeur-data
# Sortie par le relais IPv6 de l'hôte (installer_proxy6.sh) : jobup/jobs.ch refusent l'IPv4 du serveur (07/10/2026).
R=http://172.18.0.1:3128
docker run -d --name raime-envoyeur --restart unless-stopped --network raime_default --shm-size=1g \
  -e PROXY_SORTIE=$R -e HTTPS_PROXY=$R -e https_proxy=$R -e NO_PROXY=cockpit,raime-cockpit-1,localhost,127.0.0.1 \
  -v /opt/raime/raime-brain/envoyeur:/app:ro -v /opt/raime/envoyeur-data:/data raime-envoyeur
