#!/usr/bin/env bash
# RESTAURER une sauvegarde (a essayer une fois avec le client : case de la liste AUTO-02).
#
#   sudo ./restaurer.sh 2026-10-01
#
# Remplace la base et le dossier de n8n par ceux du jour indique. Les automatisations sont arretees
# pendant la restauration, puis relancees.
set -euo pipefail
cd "$(dirname "$0")"
JOUR="${1:?Usage : sudo ./restaurer.sh AAAA-MM-JJ}"
DEST="${SAUVEGARDES:-/var/sauvegardes/automatisations}"
[ -s "$DEST/base-$JOUR.dump" ] && [ -s "$DEST/n8n-$JOUR.tar.gz" ] || { echo "Sauvegarde du $JOUR introuvable dans $DEST"; exit 1; }
docker compose stop n8n
docker compose exec -T base pg_restore -U n8n -d n8n --clean --if-exists < "$DEST/base-$JOUR.dump"
docker run --rm -v "${PROJET:-automatisations}_n8n":/cible -v "$DEST":/source:ro alpine \
  sh -c "rm -rf /cible/* /cible/.[!.]* 2>/dev/null; tar -xzf /source/n8n-$JOUR.tar.gz -C /cible"
docker compose start n8n
echo "Restauration du $JOUR terminee : verifier les scenarios dans n8n."
