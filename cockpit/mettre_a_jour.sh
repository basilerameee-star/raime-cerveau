#!/usr/bin/env bash
# Reconstruit le Cockpit depuis le depot (cockpit/), avec retour arriere automatique.
#   bash /opt/raime/raime-brain/cockpit/mettre_a_jour.sh [mot-temoin]
# Le mot-temoin (par defaut repondreSansFrais) est un mot du nouveau code : s'il n'est pas dans le
# dossier de construction, rien n'est touche ; s'il n'est pas dans le conteneur relance, ou si le
# Cockpit ne repond pas, la version precedente est remise.
set -euo pipefail
C=raime-cockpit-1
MARQUE="${1:-repondreSansFrais}"
etiquette() { docker inspect "$C" --format "{{index .Config.Labels \"$1\"}}"; }
WD=$(etiquette com.docker.compose.project.working_dir)
FICHIERS=$(etiquette com.docker.compose.project.config_files)
SVC=$(etiquette com.docker.compose.service)
[ -n "$WD" ] && [ -n "$FICHIERS" ] && [ -n "$SVC" ] || { echo "ECHEC : le Cockpit n'a pas ete lance par docker compose"; exit 1; }
ARGS=(--project-directory "$WD"); IFS=',' read -ra F <<< "$FICHIERS"; for f in "${F[@]}"; do ARGS+=(-f "$f"); done

CTX=$(docker compose "${ARGS[@]}" config --format json | python3 -c "
import json, sys
s = json.load(sys.stdin)['services']['$SVC']
b = s.get('build') or {}
print(b.get('context', '') if isinstance(b, dict) else b)")
[ -n "$CTX" ] || { echo "ECHEC : le Cockpit tourne sur une image fixe, pas construite par compose ; rien n'est touche"; exit 1; }
grep -q "$MARQUE" "$CTX/server.js" 2>/dev/null || { echo "ECHEC : $CTX/server.js n'a pas encore la nouvelle version ; rien n'est touche"; exit 1; }

IMAGE=$(docker inspect "$C" --format '{{.Config.Image}}')
SAUVE="${IMAGE%%:*}:avant-maj"
docker tag "$(docker inspect "$C" --format '{{.Image}}')" "$SAUVE"
echo "version en service gardee sous $SAUVE"

sante() { for _ in $(seq 1 20); do
  docker exec "$C" wget -qO- http://127.0.0.1:8090/healthz >/dev/null 2>&1 && docker exec "$C" grep -q "$MARQUE" /app/server.js && return 0
  sleep 2; done; return 1; }

if docker compose "${ARGS[@]}" build "$SVC" && docker compose "${ARGS[@]}" up -d --no-deps "$SVC" && sante; then
  echo "COCKPIT A JOUR"
  exit 0
fi
echo "la nouvelle version ne repond pas : retour a la precedente"
docker tag "$SAUVE" "$IMAGE"
docker compose "${ARGS[@]}" up -d --no-deps "$SVC"
for _ in $(seq 1 20); do docker exec "$C" wget -qO- http://127.0.0.1:8090/healthz >/dev/null 2>&1 && { echo "REVENU : l'ancien Cockpit repond"; exit 3; }; sleep 2; done
echo "ECHEC : l'ancien Cockpit ne repond pas non plus"; exit 4
