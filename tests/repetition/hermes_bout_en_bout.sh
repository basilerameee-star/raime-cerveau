#!/usr/bin/env bash
# RÉPÉTITION DE BOUT EN BOUT — le vrai Hermes derrière le vrai Cockpit, sans serveur ni frais.
#
# Joue, sur cette machine, le chemin d'une demande de Basile :
#   Cockpit (cockpit/server.js, tel quel) → relais (hermes/executant.js) → Hermes Agent (vrai code)
#   → modèle de substitution (tests/repetition/modele_substitut.mjs, à la place d'OpenRouter)
#   → catalogue d'outils d'Hermes → serveur MCP du cerveau (agents/raime_mcp.js) → Gardien → base.
# Réussite : la demande passe « faite », sa réponse contient la question témoin lue dans la base, et le
# journal du cerveau porte l'appel d'Hermes et la demande faite.
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

echo "1/6 base jetable (structure de production, données fictives)"
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

echo "2/6 modèle de substitution et serveur MCP du cerveau"
JETON=$(openssl rand -hex 16); CLE=$(openssl rand -hex 32)
fond substitut.log env JOURNAL="$T/substitut.jsonl" node "$DEPOT/tests/repetition/modele_substitut.mjs"
URL_BASE="postgresql://raime@localhost:5433"
fond mcp.log env DATABASE_URL="$URL_BASE/raime_brain?host=$T" DATABASE_URL_N8N="$URL_BASE/n8n?host=$T" \
  RAIME_MCP_JETON="$JETON" RAIME_MCP_HOTE=127.0.0.1 node "$DEPOT/agents/raime_mcp.js"
attendre "grep -q 'à l.écoute' $T/mcp.log" 20 "raime-mcp ne démarre pas"

echo "3/6 Hermes, avec la configuration et l'âme du serveur (seuls le modèle et les chemins changent)"
mkdir -p "$T/hermes-data/skills" "$T/travail"
cp "$DEPOT/hermes/SOUL.md" "$T/hermes-data/"; cp -r "$DEPOT/hermes/competences/video-wangp" "$T/hermes-data/skills/"
python3 - "$DEPOT/hermes/config.yaml" "$T" <<'PY'
import re, sys
s = open(sys.argv[1]).read(); T = sys.argv[2]
s = re.sub(r'model:\n(  .*\n)+', 'model:\n  provider: "custom"\n  default: "substitut"\n  base_url: "http://127.0.0.1:9999/v1"\n  api_key: "sans-cle"\n', s, count=1)
s = s.replace('cwd: "/travail"', f'cwd: "{T}/travail"').replace('http://raime-mcp:8766/mcp', 'http://127.0.0.1:8766/mcp')
open(f'{T}/hermes-data/config.yaml', 'w').write(s)
PY
fond hermes.log env HERMES_HOME="$T/hermes-data" RAIME_MCP_JETON="$JETON" API_SERVER_KEY="$CLE" API_SERVER_HOST=127.0.0.1 "$HERMES" gateway run
attendre "curl -sf 127.0.0.1:8642/health >/dev/null" 90 "le serveur API d'Hermes ne répond pas"
attendre "grep -q \"MCP server 'raime'.*registered 5 tool\" $T/hermes-data/logs/*.log" 30 "Hermes n'a pas branché le serveur du cerveau"

echo "4/6 relais « harness » et Cockpit (copie conforme de son conteneur)"
fond relais.log env HERMES_URL=http://127.0.0.1:8642 API_SERVER_KEY="$CLE" TRAVAIL_DIR="$T/travail" node "$DEPOT/hermes/executant.js"
attendre "curl -sf 127.0.0.1:8201/sante | grep -q '\"moteur\":\"hermes\"'" 20 "le relais ne répond pas"
mkdir -p "$T/cockpit" && (cd "$T/cockpit" && npm init -y >/dev/null 2>&1 && npm install -q pg@8 >/dev/null 2>&1)
cp "$DEPOT"/cockpit/{server.js,index.html,jarvis.html} "$T/cockpit/"
fond cockpit.log env -C "$T/cockpit" PGHOST="$T" PGPORT=5433 PGUSER=raime PGPASSWORD=x PGDATABASE=n8n \
  EXECUTANT_URL=http://127.0.0.1:8201 LIVRABLES_DIR="$T/travail" node server.js
attendre "grep -q 'cockpit live' $T/cockpit.log" 20 "le Cockpit ne démarre pas"

echo "5/6 une demande de Basile, notée comme Jarvis la note"
ID=$(sql "INSERT INTO commandes (texte, pour) VALUES ('Dis-moi quelles questions le cerveau attend de moi.', 'harness') RETURNING id" | head -1)
attendre "[ \"\$(sql \"SELECT etat FROM commandes WHERE id = $ID\")\" = faite ]" 120 "la demande n° $ID n'est pas faite"

echo "6/6 vérifications"
REPONSE=$(sql "SELECT reponse FROM commandes WHERE id = $ID")
echo "$REPONSE" | grep -q "TEMOIN-REPETITION" || { echo "ECHEC : la réponse ne vient pas de la base"; echo "$REPONSE"; exit 1; }
sql "SELECT count(*) FROM journal WHERE acteur = 'hermes' AND changement = 'questions_pour_basile'" | grep -qx 1 || { echo "ECHEC : appel d'Hermes absent du journal"; exit 1; }
sql "SELECT count(*) FROM journal WHERE acteur = 'executant' AND changement LIKE 'Demande n°$ID faite%'" | grep -qx 1 || { echo "ECHEC : demande absente du journal"; exit 1; }
[ -f "$T/travail/demande-$ID/.resultat.json" ] || { echo "ECHEC : .resultat.json absent"; exit 1; }
grep -q '"skill_video_vue":true' "$T/substitut.jsonl" || { echo "ECHEC : Hermes ne voit pas la compétence vidéo"; exit 1; }
echo "PREUVE OK : Cockpit → relais → Hermes → cerveau → base, demande n° $ID faite ; compétence vidéo chargée."
