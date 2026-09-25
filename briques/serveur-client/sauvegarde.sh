#!/usr/bin/env bash
# SAUVEGARDE DE CHAQUE NUIT : la base (tous les scenarios, les executions, les acces chiffres) et le
# dossier de n8n (dont la cle). 14 jours gardes. Pour une copie hors du serveur, ajouter ici une
# copie vers le stockage choisi par le client (ex. rclone vers un stockage S3 europeen).
set -euo pipefail
cd "$(dirname "$0")"
DEST="${SAUVEGARDES:-/var/sauvegardes/automatisations}"
JOUR=$(date +%Y-%m-%d)
mkdir -p "$DEST"
chmod 700 "$DEST"
docker compose exec -T base pg_dump -U n8n -d n8n --format=custom > "$DEST/base-$JOUR.dump"
docker run --rm -v "${PROJET:-automatisations}_n8n":/source:ro -v "$DEST":/dest alpine \
  tar -czf "/dest/n8n-$JOUR.tar.gz" -C /source .
cp .env "$DEST/env-$JOUR" && chmod 600 "$DEST/env-$JOUR"
find "$DEST" -type f -mtime +14 -delete
# une sauvegarde vide ne compte pas : on le dit tout de suite
[ -s "$DEST/base-$JOUR.dump" ] || { echo "$JOUR : SAUVEGARDE DE LA BASE VIDE"; exit 1; }
echo "$JOUR : sauvegarde faite ($(du -sh "$DEST" | cut -f1) au total)"
