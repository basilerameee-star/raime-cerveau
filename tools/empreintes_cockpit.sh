#!/usr/bin/env bash
# Régénère cockpit/empreintes_connues.txt : toutes les versions versées au dépôt des fichiers du Cockpit, plus
# la version de travail. À lancer avant chaque commit qui touche au Cockpit (le banc le vérifie).
set -euo pipefail
cd "$(dirname "$0")/.."
{ echo "# Empreintes sha256 de toutes les versions versées au dépôt des fichiers du Cockpit (cockpit/mettre_a_jour.sh)."
  echo "# Un fichier en service dont l'empreinte n'est pas ici a été modifié hors dépôt : la mise à jour s'arrête."
  for f in server.js index.html jarvis.html Dockerfile parole.js; do
    { git log --format=%h -- "cockpit/$f" | while read -r c; do git show "$c:cockpit/$f" 2>/dev/null | sha256sum; done
      sha256sum < "cockpit/$f"; } | cut -c1-64 | sort -u | sed "s/\$/  $f/"
  done; } > cockpit/empreintes_connues.txt
