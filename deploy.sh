#!/usr/bin/env bash
# SAS DE DÉPLOIEMENT — rien n'entre en production sans avoir été vérifié SUR PLACE.
#
# Trois barrieres, dans cet ordre :
#   1. syntaxe verifiee localement
#   2. fichier depose en zone d'attente sur le serveur, jamais directement en place
#   3. syntaxe + cas figes rejoues DANS le conteneur, contre le fichier candidat
# Ce n'est qu'apres les trois que le fichier remplace l'ancien.
#
#   ./deploy.sh agents/heraut.js agents/reflexif.js
set -euo pipefail
KEY="$HOME/.ssh/raime_vps"; HOTE="root@2.29.6.94"; DIST="/opt/raime/raime-brain"
[ $# -gt 0 ] || { echo "usage: ./deploy.sh <fichier> [fichier...]"; exit 1; }

echo "── 1/3 syntaxe locale"
for f in "$@"; do node --check "$f" >/dev/null || { echo "  REFUSE : $f ne compile pas"; exit 1; }; echo "  ok  $f"; done

echo "── 2/3 depot en zone d'attente"
ssh -o BatchMode=yes -i "$KEY" "$HOTE" "rm -rf $DIST/.attente && mkdir -p $DIST/.attente/agents $DIST/.attente/tools $DIST/.attente/tests"
for f in "$@"; do scp -q -o BatchMode=yes -i "$KEY" "$f" "$HOTE:$DIST/.attente/$f"; done

echo "── 3/3 verification sur le serveur (sauvegarde, essai, retour arriere si echec)"
ssh -o BatchMode=yes -i "$KEY" "$HOTE" "
  cd $DIST
  rm -rf .sauvegarde && mkdir -p .sauvegarde
  # On sauvegarde AVANT de toucher a quoi que ce soit.
  for f in \$(cd .attente && find . -type f); do
    mkdir -p .sauvegarde/\$(dirname \$f)
    [ -f \"\$f\" ] && cp \"\$f\" \".sauvegarde/\$f\"
  done
  cp -r .attente/* .
  if ./run.sh 'node --check agents/heraut.js && node tests/cas_figes.mjs && node tests/cas_figes_audit.mjs && node tests/cas_figes_score.mjs'; then
    echo '  verification passee'
  else
    echo '  ECHEC — retour a la version precedente'
    cp -r .sauvegarde/* . 2>/dev/null || true
    exit 1
  fi
" || { echo "  REFUSE : production restauree dans son etat anterieur"; exit 1; }

echo "✓ deploye : $*"
