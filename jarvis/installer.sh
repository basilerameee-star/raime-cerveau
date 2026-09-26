#!/usr/bin/env bash
# LE NOUVEAU COCKPIT JARVIS remplace l'ancien (demande de Basile, 26/09/2026). Sur le serveur, en root :
#   bash /opt/raime/raime-brain/jarvis/installer.sh
# (hermes/installer.sh l'appelle aussi). Retour en arrière : bash /opt/raime/raime-brain/jarvis/revenir.sh
#
# L'ancien Cockpit était une image construite une fois : les livraisons de GitHub n'y entraient pas.
# Le nouveau garde la même place (même conteneur, même adresse, même mot de passe, même coffre, mêmes
# livrables) mais lit son code directement dans le dépôt livré (/opt/raime/raime-brain/jarvis, en lecture
# seule) et se recharge seul à chaque livraison. Ce script, relancé, ne double rien.
set -euo pipefail
C=raime-cockpit-1
CERVEAU=/opt/raime/raime-brain
J="$CERVEAU/jarvis"
MARQUE="# pose par raime-brain/jarvis/installer.sh"

[ -f "$J/demarrer.cjs" ] && [ -f "$J/serveur.cjs" ] || { echo "ECHEC : $J n'est pas encore livre sur le serveur"; exit 1; }
[ -f "$CERVEAU/node_modules/pg/package.json" ] || { echo "ECHEC : $CERVEAU/node_modules/pg manque (la livraison installe les dependances)"; exit 1; }
V=$(docker compose version --short 2>/dev/null | sed 's/^v//')
[ "$(printf '%s\n2.24.4\n' "$V" | sort -V | head -1)" = 2.24.4 ] || { echo "ECHEC : docker compose ${V:-absent} est trop ancien (2.24.4 au moins)"; exit 1; }

etiquette() { docker inspect "$C" --format "{{index .Config.Labels \"$1\"}}"; }
WD=$(etiquette com.docker.compose.project.working_dir)
FICHIERS=$(etiquette com.docker.compose.project.config_files)
SVC=$(etiquette com.docker.compose.service)
[ -n "$WD" ] && [ -n "$FICHIERS" ] && [ -n "$SVC" ] || { echo "ECHEC : le Cockpit n'a pas ete lance par docker compose ; rien n'est touche"; exit 1; }

# Le fichier de surcharge que docker compose lit tout seul dans ce dossier : le changement est permanent,
# même si quelqu'un relance « docker compose up » plus tard.
PREMIER=$(printf '%s' "$FICHIERS" | cut -d, -f1)
case "$(basename "$PREMIER")" in
  compose.yaml|compose.yml) SURCHARGE="$WD/compose.override.yaml" ;;
  *) SURCHARGE="$WD/docker-compose.override.yml" ;;
esac
if [ -f "$SURCHARGE" ] && ! grep -qF "$MARQUE" "$SURCHARGE"; then
  echo "ECHEC : $SURCHARGE existe deja et n'est pas le notre ; rien n'est touche"; exit 1
fi
ARGS=(--project-directory "$WD"); IFS=',' read -ra F <<< "$FICHIERS"
for f in "${F[@]}"; do [ "$f" = "$SURCHARGE" ] || ARGS+=(-f "$f"); done

# L'ancienne version est gardée pour revenir en arrière (image étiquetée, surcharge absente = ancien Cockpit).
if ! grep -qF "$MARQUE" "$SURCHARGE" 2>/dev/null; then
  docker tag "$(docker inspect "$C" --format '{{.Image}}')" raime-cockpit-ancien:avant-jarvis
  docker inspect "$C" --format '{{.Config.Image}}' > /opt/raime/cockpit-avant-jarvis.txt
  echo "ancien Cockpit garde sous raime-cockpit-ancien:avant-jarvis"
fi

cat > "$SURCHARGE" <<EOF
$MARQUE (nouveau Cockpit Jarvis, $(date -u +%F)).
# Retour a l'ancien : bash $J/revenir.sh
services:
  $SVC:
    build: !reset null
    image: node:22-alpine
    working_dir: /app
    command: ["node", "jarvis/demarrer.cjs"]
    volumes:
      - $J:/app/jarvis:ro
      - $CERVEAU/node_modules:/app/node_modules:ro
EOF
docker compose "${ARGS[@]}" -f "$SURCHARGE" config -q || { rm -f "$SURCHARGE"; echo "ECHEC : configuration refusee ; rien n'est change"; exit 1; }

# La version attendue : l'empreinte du code de jarvis/ (calculée comme serveur.cjs la calcule).
ATTENDU=$(cd "$J" && LC_ALL=C ls | grep -E '\.(cjs|json)$' | LC_ALL=C sort | xargs cat | sha256sum | cut -c1-12)
sante() { for _ in $(seq 1 30); do
  [ "$(docker exec "$C" wget -qO- http://127.0.0.1:8090/healthz 2>/dev/null)" = "ok $ATTENDU" ] && return 0; sleep 2; done; return 1; }

if docker compose "${ARGS[@]}" -f "$SURCHARGE" up -d --no-deps "$SVC" && sante; then
  # L'ancien Cockpit est désinstallé : son conteneur est remplacé ; la copie du dépôt qu'il laissait est retirée.
  rm -rf "$CERVEAU/cockpit"
  echo "JARVIS EN SERVICE : version $ATTENDU ; il se mettra a jour seul a chaque livraison."
  echo "Ouvrir https://cockpit.raime.fr (Ctrl+F5 la premiere fois)."
  exit 0
fi
echo "le nouveau Cockpit ne repond pas : retour a l'ancien"
docker logs --tail 30 "$C" 2>&1 | sed 's/^/   /' || true
rm -f "$SURCHARGE"
docker tag raime-cockpit-ancien:avant-jarvis "$(cat /opt/raime/cockpit-avant-jarvis.txt)"
docker compose "${ARGS[@]}" up -d --no-deps "$SVC"
for _ in $(seq 1 20); do docker exec "$C" wget -qO- http://127.0.0.1:8090/healthz >/dev/null 2>&1 && { echo "REVENU : l'ancien Cockpit repond"; exit 3; }; sleep 2; done
echo "ECHEC : l'ancien Cockpit ne repond pas non plus"; exit 4
