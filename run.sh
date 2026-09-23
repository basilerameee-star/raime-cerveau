#!/usr/bin/env bash
# Lanceur unique des agents rAIme sur le VPS.
# Les secrets ne sont jamais en dur : le mot de passe Postgres est lu depuis le conteneur,
# la cle OpenRouter depuis le fichier .env (chmod 600).
#
#   /opt/raime/raime-brain/run.sh "node agents/superviseur.js"
set -euo pipefail
cd /opt/raime/raime-brain
PGPASS=$(docker exec raime-postgres-1 printenv POSTGRES_PASSWORD)
exec docker run --rm --network raime_default \
  -e DATABASE_URL="postgres://n8n:${PGPASS}@raime-postgres-1:5432/raime_brain" \
  -e DATABASE_URL_N8N="postgres://n8n:${PGPASS}@raime-postgres-1:5432/n8n" \
  --env-file /opt/raime/raime-brain/.env \
  -v /opt/raime/raime-brain:/app -w /app \
  node:20-alpine sh -c "$1"
