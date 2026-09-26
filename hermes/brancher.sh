#!/usr/bin/env bash
# Hermes devient l'executant du Cockpit. A lancer sur le serveur, en root :
#   bash /opt/raime/raime-brain/hermes/brancher.sh
# Retour en arriere : bash /opt/raime/raime-brain/hermes/revenir.sh
set -euo pipefail
cd /opt/raime
H=/opt/raime/raime-brain/hermes

TRAVAIL=$(docker inspect raime-cockpit-1 --format '{{range .Mounts}}{{if eq .Destination "/travail"}}{{.Source}}{{end}}{{end}}')
[ -n "$TRAVAIL" ] && [ -d "$TRAVAIL" ] || { echo "ECHEC : dossier /travail du Cockpit introuvable"; exit 1; }
PROPRIO=$(stat -c %u "$TRAVAIL"); GROUPE=$(stat -c %g "$TRAVAIL")
umask 077
printf 'TRAVAIL_HOTE=%s\nHERMES_UID=%s\nHERMES_GID=%s\n' "$TRAVAIL" "$PROPRIO" "$GROUPE" > /opt/raime/hermes-compose.env

# La cle entre le relais et Hermes : creee une fois, jamais affichee.
if ! grep -q '^API_SERVER_KEY=' /opt/raime/hermes.env; then
  echo "API_SERVER_KEY=$(openssl rand -hex 32)" >> /opt/raime/hermes.env
fi
grep '^API_SERVER_KEY=' /opt/raime/hermes.env > /opt/raime/executant.env

# La configuration a jour (dossier de travail /travail) et l'ame d'Hermes.
cp "$H/config.yaml" "$H/SOUL.md" /opt/raime/hermes-data/
# Sans cle Gemini gratuite, le modele local du serveur passe en premier (jamais OpenRouter).
if ! grep -q '^GEMINI_API_KEY=.' /opt/raime/hermes.env; then
  sed -i 's/^  provider: "gemini"$/  provider: "local"/; s/^  default: "gemini-3.8-flash"$/  default: "gemma4:e4b"/' /opt/raime/hermes-data/config.yaml
  echo "pas de cle Gemini : Hermes travaille sur le modele local du serveur"
fi
# Les competences de la maison (site-premium, charte-raime...) ; la video reste sur le PC (WanGP).
mkdir -p /opt/raime/hermes-data/skills
for d in "$H"/competences/*/; do [ -d "$d" ] || continue; n=$(basename "$d"); [ "$n" = video-wangp ] && continue; if [ -d "/opt/raime/hermes-data/skills/$n" ]; then mkdir -p /opt/raime/hermes-data/skills-anciennes; rm -rf "/opt/raime/hermes-data/skills-anciennes/$n"; mv "/opt/raime/hermes-data/skills/$n" "/opt/raime/hermes-data/skills-anciennes/$n"; fi; cp -r "$d" "/opt/raime/hermes-data/skills/$n"; done
chown -R "$PROPRIO:$GROUPE" /opt/raime/hermes-data/skills
echo "competences : $(ls /opt/raime/hermes-data/skills | tr '\n' ' ')"
cp "$H/docker-compose.hermes.yml" /opt/raime/docker-compose.hermes.yml

# L'ancien executant s'arrete ; sa regle de redemarrage est gardee pour revenir en arriere.
if docker inspect raime-harness-1 >/dev/null 2>&1; then
  docker inspect raime-harness-1 --format '{{.HostConfig.RestartPolicy.Name}}' > /opt/raime/harness-restart.txt
  docker update --restart=no raime-harness-1 >/dev/null
  docker stop raime-harness-1 >/dev/null
  echo "ancien executant arrete (garde pour revenir en arriere)"
fi

docker compose --env-file /opt/raime/hermes-compose.env -f docker-compose.hermes.yml up -d --force-recreate hermes raime-executant
sleep 25
echo "--- sante vue depuis le Cockpit :"
docker exec raime-cockpit-1 wget -qO- http://harness:8201/sante || { echo "ECHEC : le Cockpit ne joint pas le relais ; lancer revenir.sh"; exit 1; }
echo
docker ps --filter name=raime-hermes --filter name=raime-executant --format '{{.Names}} {{.Status}}'
echo "BRANCHE : les demandes d'action du Cockpit vont a Hermes."
