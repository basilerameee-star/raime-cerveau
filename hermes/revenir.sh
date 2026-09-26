#!/usr/bin/env bash
# Rend la main a l'ancien executant du Cockpit.
#   bash /opt/raime/raime-brain/hermes/revenir.sh
set -euo pipefail
cd /opt/raime
docker stop raime-executant >/dev/null 2>&1 || true
docker rm raime-executant >/dev/null 2>&1 || true
if docker inspect raime-harness-1 >/dev/null 2>&1; then
  docker update --restart="$(cat /opt/raime/harness-restart.txt 2>/dev/null || echo unless-stopped)" raime-harness-1 >/dev/null
  docker start raime-harness-1 >/dev/null
fi
sleep 5
docker exec raime-cockpit-1 wget -qO- http://harness:8201/sante && echo && echo "REVENU : l'ancien executant a repris."
