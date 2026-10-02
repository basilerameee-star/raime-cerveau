#!/bin/sh
# Construit l'image et (re)lance le conteneur de l'Envoyeur. À lancer sur le serveur.
set -e
cd "$(dirname "$0")"
docker build -t raime-envoyeur .
docker rm -f raime-envoyeur 2>/dev/null || true
mkdir -p /opt/raime/envoyeur-data
docker run -d --name raime-envoyeur --restart unless-stopped --network raime_default --shm-size=1g \
  -v /opt/raime/raime-brain/envoyeur:/app:ro -v /opt/raime/envoyeur-data:/data raime-envoyeur
