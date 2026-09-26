#!/usr/bin/env bash
# TOUT EN UNE COMMANDE, sur le serveur, en root (autorise par Basile le 26/09/2026) :
#   bash /opt/raime/raime-brain/hermes/installer.sh
# 1. la cle Gemini du coffre du Cockpit est aussi donnee a Hermes (jamais affichee) ;
# 2. Hermes devient l'executant du Cockpit (brancher.sh ; retour : revenir.sh) ;
# 3. le modele local (Ollama) : Qwen3 4B, en service, et Gemma 4 E4B, essaye a cote (vitesse, licence) ;
# 4. le Cockpit est reconstruit avec la parole sans frais (retour arriere automatique).
# Relancer ne double rien.
set -euo pipefail
cd /opt/raime
H=/opt/raime/raime-brain/hermes
MODELE=qwen3:4b
ESSAI=gemma4:e4b

echo "=== 1/4 cle Gemini pour Hermes"
if grep -q '^GEMINI_API_KEY=' /opt/raime/hermes.env; then
  echo "deja presente"
else
  CLE=$(docker exec raime-cockpit-1 sh -c "grep '^GEMINI_API_KEY=' /coffre/secrets.env 2>/dev/null | head -1" || true)
  if [ -n "$CLE" ]; then
    printf '%s\n' "$CLE" >> /opt/raime/hermes.env; echo "cle Gemini transmise a Hermes"
  else
    echo "pas de cle Gemini au coffre : Hermes passera directement au modele local"
  fi
fi

echo "=== 2/4 Hermes devient l'executant du Cockpit"
bash "$H/brancher.sh"

echo "=== 3/4 le modele local"
mkdir -p /opt/raime/ollama
COMPOSE=(docker compose --env-file /opt/raime/hermes-compose.env -f docker-compose.hermes.yml)
"${COMPOSE[@]}" up -d raime-ollama
for _ in $(seq 1 30); do docker exec raime-ollama ollama list >/dev/null 2>&1 && break; sleep 2; done
essayer() {
  local m=$1 t0 rep
  t0=$(date +%s)
  rep=$(docker exec raime-cockpit-1 wget -qO- -T 600 --header 'Content-Type: application/json' \
    --post-data "{\"model\":\"$m\",\"stream\":false,\"think\":false,\"messages\":[{\"role\":\"user\",\"content\":\"En une phrase, en francais : qu'est-ce que rAIme peut faire pour une PME ?\"}]}" \
    http://raime-ollama:11434/api/chat) || { echo "$m : ne repond pas"; return 1; }
  printf '%s' "$rep" | grep -q '"content":"[^"]' || { echo "$m : reponse vide"; return 1; }
  echo "$m : $(( $(date +%s) - t0 )) s -> $(printf '%s' "$rep" | sed -n 's/.*"content":"\([^"]*\)".*/\1/p' | head -c 160)"
}
docker exec raime-ollama ollama pull "$MODELE"
essayer "$MODELE" || { echo "ECHEC : le modele local en service ne repond pas"; exit 1; }
if docker exec raime-ollama ollama pull "$ESSAI"; then
  essayer "$ESSAI" || true
  echo "--- licence de $ESSAI (debut) :"; docker exec raime-ollama ollama show "$ESSAI" --license 2>/dev/null | head -8 || true
else
  echo "$ESSAI indisponible pour l'instant : $MODELE reste seul"
fi

echo "=== 4/4 le Cockpit, avec la parole sans frais"
bash /opt/raime/raime-brain/cockpit/mettre_a_jour.sh repondreSansFrais

echo
echo "INSTALLE : Hermes execute les ordres du Cockpit ; Jarvis et les ordres continuent meme sans credit ni quota."
echo "Retour en arriere : bash /opt/raime/raime-brain/hermes/revenir.sh"
