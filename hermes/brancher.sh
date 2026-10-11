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
  CLE=$(openssl rand -hex 32) || { echo "ECHEC : generation de la cle du relais impossible"; exit 1; }
  [[ "$CLE" =~ ^[0-9a-f]{64}$ ]] || { echo "ECHEC : cle du relais mal formee"; exit 1; }
  printf 'API_SERVER_KEY=%s\n' "$CLE" >> /opt/raime/hermes.env
  unset CLE
fi
grep -m1 '^API_SERVER_KEY=' /opt/raime/hermes.env > /opt/raime/executant.env
# Hermes lit aussi son propre fichier (/opt/data/.env), qui passe AVANT son environnement : une autre clé
# écrite là (assistant WhatsApp…) faisait refuser chaque ordre (« 401 Invalid gateway API key », 26/09/2026).
# La même clé y est donc écrite, sans toucher aux autres lignes.
HENV=/opt/raime/hermes-data/.env
touch "$HENV"
{ grep -v '^API_SERVER_KEY=' "$HENV" || true; cat /opt/raime/executant.env; } > "$HENV.nouveau"
cat "$HENV.nouveau" > "$HENV"; rm -f "$HENV.nouveau"
chmod 600 "$HENV"; chown "$PROPRIO:$GROUPE" "$HENV"

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
# Le vrai test : le relais présente sa clé à Hermes, qui doit l'accepter (200) ; sinon chaque ordre échoue (401).
CODE=0
for _ in $(seq 1 12); do
  CODE=$(docker exec raime-executant node -e "fetch((process.env.HERMES_URL||'http://raime-hermes:8642')+'/v1/models',{headers:{Authorization:'Bearer '+process.env.API_SERVER_KEY}}).then(r=>console.log(r.status)).catch(()=>console.log(0))" 2>/dev/null || echo 0)
  [ "$CODE" = 200 ] && break; sleep 5
done
[ "$CODE" = 200 ] && echo "LIEN HERMES OK : Hermes accepte la cle du relais" || { echo "ECHEC : Hermes refuse la cle du relais (code $CODE)"; exit 1; }
docker ps --filter name=raime-hermes --filter name=raime-executant --format '{{.Names}} {{.Status}}'
echo "BRANCHE : les demandes d'action du Cockpit vont a Hermes."
