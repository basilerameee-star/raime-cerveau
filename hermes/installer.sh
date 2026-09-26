#!/usr/bin/env bash
# TOUT EN UNE COMMANDE, sur le serveur, en root (autorise par Basile le 26/09/2026) :
#   bash /opt/raime/raime-brain/hermes/installer.sh
# 1. la cle Gemini gratuite du coffre est donnee a Hermes et aux agents du cerveau (jamais affichee) ;
# 2. Hermes devient l'executant du Cockpit (brancher.sh ; retour : revenir.sh) ;
# 3. le modele local (Ollama) : Gemma 4 E4B (Qwen3 4B, essaye le 26/09, reflechissait plusieurs minutes) ;
# 4. le nouveau Cockpit Jarvis remplace l'ancien et se mettra a jour seul (jarvis/installer.sh ; retour : jarvis/revenir.sh).
# Aucun appel a OpenRouter : tout tourne sur Gemini gratuit, puis sur le modele local.
# Relancer ne double rien.
set -euo pipefail
cd /opt/raime
H=/opt/raime/raime-brain/hermes
MODELE=gemma4:e4b    # 22 s, Apache 2.0 (mesure et licence lues sur le serveur, 26/09/2026)

echo "=== 1/4 cle Gemini gratuite pour Hermes et pour les agents"
CLE=$(docker exec raime-cockpit-1 sh -c "grep '^GEMINI_API_KEY=.' /coffre/secrets.env 2>/dev/null | head -1" || true)
for f in /opt/raime/hermes.env /opt/raime/raime-brain/.env; do
  if grep -q '^GEMINI_API_KEY=.' "$f" 2>/dev/null; then echo "deja presente : $f"
  elif [ -n "$CLE" ]; then (umask 077; printf '%s\n' "$CLE" >> "$f"); echo "cle Gemini transmise : $f"
  fi
done
[ -n "$CLE" ] || echo "pas de cle Gemini au coffre : tout passera par le modele local du serveur (ajouter la cle dans le coffre du Cockpit, puis relancer)"
unset CLE

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
  rep=$(docker exec raime-cockpit-1 wget -qO- -T 180 --header 'Content-Type: application/json' \
    --post-data "{\"model\":\"$m\",\"stream\":false,\"think\":false,\"messages\":[{\"role\":\"user\",\"content\":\"En une phrase, en francais : qu'est-ce que rAIme peut faire pour une PME ?\"}]}" \
    http://raime-ollama:11434/api/chat) || { echo "$m : ne repond pas"; return 1; }
  printf '%s' "$rep" | grep -q '"content":"[^"]' || { echo "$m : reponse vide"; return 1; }
  echo "$m : $(( $(date +%s) - t0 )) s -> $(printf '%s' "$rep" | sed -n 's/.*"content":"\([^"]*\)".*/\1/p' | head -c 160)"
}
docker exec raime-ollama ollama pull "$MODELE"
essayer "$MODELE" || { echo "ECHEC : le modele local ne repond pas"; exit 1; }
echo "--- licence de $MODELE (debut) :"; docker exec raime-ollama ollama show "$MODELE" --license 2>/dev/null | head -3 || true

echo "=== 4/4 le nouveau Cockpit Jarvis"
bash /opt/raime/raime-brain/jarvis/installer.sh
# Les agents relisent leur environnement (cle Gemini) : la boucle redemarre.
docker restart raime-boucle >/dev/null 2>&1 && echo "boucle des agents relancee" || true

echo
echo "INSTALLE : Jarvis (nouveau Cockpit) et Hermes tournent sans frais ; chaque livraison GitHub est prise en compte seule."
echo "Retour en arriere : bash /opt/raime/raime-brain/jarvis/revenir.sh (Cockpit) ; bash /opt/raime/raime-brain/hermes/revenir.sh (Hermes)"
