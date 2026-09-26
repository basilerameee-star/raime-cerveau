#!/usr/bin/env bash
# RÉPÉTITION DE BOUT EN BOUT — le vrai Hermes derrière le vrai Cockpit, sans serveur ni frais.
#
# Joue, sur cette machine, le chemin d'une demande de Basile :
#   Cockpit Jarvis (jarvis/, tel quel) → relais (hermes/executant.js) → Hermes Agent (vrai code)
#   → modèle de substitution (tests/repetition/modele_substitut.mjs, à la place d'OpenRouter)
#   → catalogue d'outils d'Hermes → serveur MCP du cerveau (agents/raime_mcp.js) → Gardien → base.
# Réussite : la demande passe « faite », sa réponse contient la question témoin lue dans la base, et le
# journal du cerveau porte l'appel d'Hermes et la demande faite.
# Puis la panne du 25/09 rejouée : budget en « arrêt », OpenRouter à crédit épuisé (402), aucune clé
# Gemini. Réussite : Jarvis répond quand même (modèle local), et un ordre est quand même exécuté.
#
#   HERMES_SRC=/chemin/hermes-agent  bash tests/repetition/hermes_bout_en_bout.sh
# HERMES_SRC : NousResearch/hermes-agent au commit d0288be5, installé par
#   uv sync --frozen --python 3.14.7 --extra all --extra messaging
set -euo pipefail
DEPOT="$(cd "$(dirname "$0")/../.." && pwd)"
: "${HERMES_SRC:?HERMES_SRC : dossier de hermes-agent (commit d0288be5) installé}"
HERMES="$HERMES_SRC/.venv/bin/hermes"
[ -x "$HERMES" ] || { echo "ECHEC : $HERMES introuvable"; exit 1; }
PGBIN=$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)
T=$(mktemp -d /tmp/repetition-hermes-XXXX); chmod 755 "$T"
PIDS=()
nettoyer() { for p in "${PIDS[@]}"; do kill "$p" 2>/dev/null || true; done
  [ -f "$T/pg/postmaster.pid" ] && kill -INT "$(head -1 "$T/pg/postmaster.pid")" 2>/dev/null || true; }
trap nettoyer EXIT
fond() { local log=$1; shift; nohup "$@" > "$T/$log" 2>&1 & PIDS+=($!); }
attendre() { for _ in $(seq 1 "$2"); do eval "$1" && return 0; sleep 1; done; echo "ECHEC : $3"; tail -20 "$T"/*.log; exit 1; }
sql() { psql -h "$T" -p 5433 -U raime -d raime_brain -Atc "$1"; }

echo "1/9 base jetable (structure de production, données fictives)"
PG_SU=(); [ "$(id -u)" = 0 ] && { chown postgres "$T"; PG_SU=(su postgres -c); }
initdb_cmd="$PGBIN/initdb -D $T/pg -U raime --auth=trust >/dev/null && $PGBIN/pg_ctl -D $T/pg -o '-p 5433 -k $T' -l $T/pg.log start >/dev/null"
if [ ${#PG_SU[@]} -gt 0 ]; then "${PG_SU[@]}" "$initdb_cmd"; else bash -c "$initdb_cmd"; fi
attendre "psql -h $T -p 5433 -U raime -d postgres -Atc 'select 1' >/dev/null 2>&1" 20 "Postgres ne démarre pas"
for b in raime_brain n8n; do psql -q -h "$T" -p 5433 -U raime -d postgres -c "CREATE DATABASE $b"; done
sed -E '/^\\(un)?restrict /d' "$DEPOT/db/schema_raime_brain.sql" | psql -q -v ON_ERROR_STOP=1 -h "$T" -p 5433 -U raime -d raime_brain >/dev/null
sed -E '/^\\(un)?restrict /d' "$DEPOT/db/schema_n8n_extrait.sql" | psql -q -v ON_ERROR_STOP=1 -h "$T" -p 5433 -U raime -d n8n >/dev/null
psql -q -v ON_ERROR_STOP=1 -h "$T" -p 5433 -U raime -d raime_brain -f "$DEPOT/tests/banc/donnees_brain.sql" >/dev/null
psql -q -h "$T" -p 5433 -U raime -d raime_brain -f "$DEPOT/migrations/021_jarvis_commandes.sql" >/dev/null
sql "INSERT INTO demandes(question, pourquoi, bloquant) VALUES ('TEMOIN-REPETITION : question fictive', 'répétition', true)" >/dev/null

echo "2/9 modèle de substitution et serveur MCP du cerveau"
JETON=$(openssl rand -hex 16); CLE=$(openssl rand -hex 32)
fond substitut.log env JOURNAL="$T/substitut.jsonl" node "$DEPOT/tests/repetition/modele_substitut.mjs"
PID_PRINCIPAL=${PIDS[-1]}
fond local.log env PORT=9997 SIGNE=local JOURNAL="$T/local.jsonl" node "$DEPOT/tests/repetition/modele_substitut.mjs"
URL_BASE="postgresql://raime@localhost:5433"
fond mcp.log env DATABASE_URL="$URL_BASE/raime_brain?host=$T" DATABASE_URL_N8N="$URL_BASE/n8n?host=$T" \
  RAIME_MCP_JETON="$JETON" RAIME_MCP_HOTE=127.0.0.1 node "$DEPOT/agents/raime_mcp.js"
attendre "grep -q 'à l.écoute' $T/mcp.log" 20 "raime-mcp ne démarre pas"

echo "3/9 Hermes, avec la configuration et l'âme du serveur (seuls le modèle et les chemins changent)"
mkdir -p "$T/hermes-data/skills" "$T/travail"
cp "$DEPOT/hermes/SOUL.md" "$T/hermes-data/"; cp -r "$DEPOT/hermes/competences/video-wangp" "$T/hermes-data/skills/"
python3 - "$DEPOT/hermes/config.yaml" "$T" <<'PY'
import re, sys
s = open(sys.argv[1]).read(); T = sys.argv[2]
s = re.sub(r'model:\n(  .*\n)+', 'model:\n  provider: "custom"\n  default: "substitut"\n  base_url: "http://127.0.0.1:9999/v1"\n  api_key: "sans-cle"\n', s, count=1)
s = s.replace('cwd: "/travail"', f'cwd: "{T}/travail"').replace('http://raime-mcp:8766/mcp', 'http://127.0.0.1:8766/mcp')
s = s.replace('api: http://raime-ollama:11434/v1', 'api: http://127.0.0.1:9997/v1')
assert 'fallback_providers' in s and 'api: http://127.0.0.1:9997/v1' in s, 'chaîne de repli ou modèle local absent de la configuration'
open(f'{T}/hermes-data/config.yaml', 'w').write(s)
PY
fond hermes.log env HERMES_HOME="$T/hermes-data" RAIME_MCP_JETON="$JETON" API_SERVER_KEY="$CLE" API_SERVER_HOST=127.0.0.1 "$HERMES" gateway run
attendre "curl -sf 127.0.0.1:8642/health >/dev/null" 90 "le serveur API d'Hermes ne répond pas"
attendre "grep -q \"MCP server 'raime'.*registered 5 tool\" $T/hermes-data/logs/*.log" 30 "Hermes n'a pas branché le serveur du cerveau"

echo "4/9 relais « harness » et Cockpit Jarvis (le code même du serveur)"
fond relais.log env HERMES_URL=http://127.0.0.1:8642 API_SERVER_KEY="$CLE" TRAVAIL_DIR="$T/travail" node "$DEPOT/hermes/executant.js"
attendre "curl -sf 127.0.0.1:8201/sante | grep -q '\"moteur\":\"hermes\"'" 20 "le relais ne répond pas"
: > "$T/coffre.env"
fond cockpit.log env PGHOST="$T" PGPORT=5433 PGUSER=raime PGPASSWORD=x PGDATABASE=n8n PGDATABASE_CERVEAU=raime_brain \
  EXECUTANT_URL=http://127.0.0.1:8201 LIVRABLES_DIR="$T/travail" COFFRE_FICHIER="$T/coffre.env" \
  MODELE_LOCAL_URL=http://127.0.0.1:9997 RECHERCHE_URL=http://127.0.0.1:1 PORT=8090 node "$DEPOT/jarvis/demarrer.cjs"
attendre "grep -q 'en service sur' $T/cockpit.log" 20 "le Cockpit Jarvis ne démarre pas"

echo "5/9 une demande de Basile, notée comme Jarvis la note"
ID=$(sql "INSERT INTO commandes (texte, pour) VALUES ('Dis-moi quelles questions le cerveau attend de moi.', 'harness') RETURNING id" | head -1)
attendre "[ \"\$(sql \"SELECT etat FROM commandes WHERE id = $ID\")\" = faite ]" 120 "la demande n° $ID n'est pas faite"

echo "6/9 vérifications"
REPONSE=$(sql "SELECT reponse FROM commandes WHERE id = $ID")
echo "$REPONSE" | grep -q "TEMOIN-REPETITION" || { echo "ECHEC : la réponse ne vient pas de la base"; echo "$REPONSE"; exit 1; }
sql "SELECT count(*) FROM journal WHERE acteur = 'hermes' AND changement = 'questions_pour_basile'" | grep -qx 1 || { echo "ECHEC : appel d'Hermes absent du journal"; exit 1; }
sql "SELECT count(*) FROM journal WHERE acteur = 'executant' AND changement LIKE 'Ordre n°$ID fait%'" | grep -qx 1 || { echo "ECHEC : demande absente du journal"; exit 1; }
[ -f "$T/travail/demande-$ID/.resultat.json" ] || { echo "ECHEC : .resultat.json absent"; exit 1; }
grep -q '"skill_video_vue":true' "$T/substitut.jsonl" || { echo "ECHEC : Hermes ne voit pas la compétence vidéo"; exit 1; }
echo "PREUVE OK : Cockpit → relais → Hermes → cerveau → base, demande n° $ID faite ; compétence vidéo chargée."

echo "7/9 la panne du 25/09 : budget en « arrêt », OpenRouter à crédit épuisé (402), aucune clé Gemini"
kill "$PID_PRINCIPAL"; sleep 1
fond principal-402.log env PORT=9999 PANNE=402 JOURNAL="$T/principal-402.jsonl" node "$DEPOT/tests/repetition/modele_substitut.mjs"
attendre "grep -q 'panne 402' $T/principal-402.log" 10 "le principal en panne ne démarre pas"
sql "CREATE TABLE IF NOT EXISTS regime_budget (le timestamptz NOT NULL DEFAULT now(), mode text NOT NULL, facteur float, pauses text[], chiffres jsonb, mesures text[]);
     INSERT INTO regime_budget (mode) VALUES ('arret')" >/dev/null
JARVIS=$(curl -s -m 200 -X POST 127.0.0.1:8090/api/chat -H 'Content-Type: application/json' -d '{"message":"Bonjour Jarvis, tu es là ?"}')
echo "$JARVIS" | grep -q '\[local\]' || { echo "ECHEC : Jarvis ne répond pas en panne de crédit : $JARVIS"; exit 1; }
echo "   Jarvis répond : $(echo "$JARVIS" | head -c 120)"

echo "8/9 un ordre en régime « arrêt » (pas de clé Gemini → le local)"
ID2=$(sql "INSERT INTO commandes (texte, pour) VALUES ('Dis-moi quelles questions le cerveau attend de moi.', 'harness') RETURNING id" | head -1)
attendre "[ \"\$(sql \"SELECT etat FROM commandes WHERE id = $ID2\")\" = faite ]" 200 "l'ordre n° $ID2 n'est pas exécuté en panne de crédit"
REPONSE2=$(sql "SELECT reponse FROM commandes WHERE id = $ID2")
echo "$REPONSE2" | grep -q '\[local\]' || { echo "ECHEC : l'ordre n'a pas été servi par le modèle local"; echo "$REPONSE2" | head -c 300; exit 1; }

echo "9/9 budget normal, mais crédit OpenRouter épuisé (la panne exacte du 25/09) : un ordre"
sql "INSERT INTO regime_budget (mode) VALUES ('normal')" >/dev/null
ID3=$(sql "INSERT INTO commandes (texte, pour) VALUES ('Dis-moi quelles questions le cerveau attend de moi.', 'harness') RETURNING id" | head -1)
attendre "[ \"\$(sql \"SELECT etat FROM commandes WHERE id = $ID3\")\" = faite ]" 200 "l'ordre n° $ID3 n'est pas exécuté (budget normal, crédit épuisé)"
sql "SELECT reponse FROM commandes WHERE id = $ID3" | grep -q '\[local\]' || { echo "ECHEC : l'ordre n° $ID3 n'a pas été servi par le modèle local"; exit 1; }
grep -q '"panne":402' "$T/principal-402.jsonl" || { echo "ECHEC : le principal (402) n'a pas été sollicité"; exit 1; }
echo "PREUVE OK : crédit épuisé ou budget à l'arrêt, Jarvis répond et les ordres n° $ID2 et $ID3 sont exécutés, sans rien payer."
