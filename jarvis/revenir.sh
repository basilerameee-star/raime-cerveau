#!/usr/bin/env bash
# Retour a l'ancien Cockpit (celui d'avant Jarvis), sur le serveur, en root :
#   bash /opt/raime/raime-brain/jarvis/revenir.sh
set -euo pipefail
C=raime-cockpit-1
MARQUE="# pose par raime-brain/jarvis/installer.sh"
etiquette() { docker inspect "$C" --format "{{index .Config.Labels \"$1\"}}"; }
WD=$(etiquette com.docker.compose.project.working_dir)
FICHIERS=$(etiquette com.docker.compose.project.config_files)
SVC=$(etiquette com.docker.compose.service)
ARGS=(--project-directory "$WD"); IFS=',' read -ra F <<< "$FICHIERS"
for f in "${F[@]}"; do grep -qF "$MARQUE" "$f" 2>/dev/null && { rm -f "$f"; echo "surcharge retiree : $f"; continue; }; ARGS+=(-f "$f"); done
for s in "$WD/docker-compose.override.yml" "$WD/compose.override.yaml"; do grep -qF "$MARQUE" "$s" 2>/dev/null && rm -f "$s"; done
[ -s /opt/raime/cockpit-avant-jarvis.txt ] && docker tag raime-cockpit-ancien:avant-jarvis "$(cat /opt/raime/cockpit-avant-jarvis.txt)"
docker compose "${ARGS[@]}" up -d --no-deps "$SVC"
for _ in $(seq 1 20); do docker exec "$C" wget -qO- http://127.0.0.1:8090/healthz >/dev/null 2>&1 && { echo "REVENU : l'ancien Cockpit repond"; exit 0; }; sleep 2; done
echo "ECHEC : l'ancien Cockpit ne repond pas"; exit 1
