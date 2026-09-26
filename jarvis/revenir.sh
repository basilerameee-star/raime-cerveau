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
SURCHARGE="$WD/docker-compose.jarvis.yml"
ARGS=(--project-directory "$WD"); IFS=',' read -ra F <<< "$FICHIERS"
for f in "${F[@]}"; do [ "$f" = "$SURCHARGE" ] || ARGS+=(-f "$f"); done
rm -f "$SURCHARGE"
# Le .env du dossier retrouve sa ligne COMPOSE_FILE d'avant (ou aucune).
if grep -qF "$MARQUE" "$WD/.env" 2>/dev/null; then
  { grep -vF "$MARQUE" "$WD/.env" | grep -v '^COMPOSE_FILE=' || true; cat /opt/raime/compose-file-avant-jarvis.txt 2>/dev/null || true; } > "$WD/.env.jarvis"
  cat "$WD/.env.jarvis" > "$WD/.env"; rm -f "$WD/.env.jarvis"
  echo "ligne COMPOSE_FILE d'avant remise dans $WD/.env"
fi
[ -s /opt/raime/cockpit-avant-jarvis.txt ] && docker tag raime-cockpit-ancien:avant-jarvis "$(cat /opt/raime/cockpit-avant-jarvis.txt)"
docker compose "${ARGS[@]}" up -d --no-deps "$SVC"
for _ in $(seq 1 20); do docker exec "$C" wget -qO- http://127.0.0.1:8090/healthz >/dev/null 2>&1 && { echo "REVENU : l'ancien Cockpit repond"; exit 0; }; sleep 2; done
echo "ECHEC : l'ancien Cockpit ne repond pas"; exit 1
