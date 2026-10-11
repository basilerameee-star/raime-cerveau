#!/usr/bin/env bash
# BANC D'ESSAI — recrée les deux bases de test à partir de la structure de production,
# puis y verse les données fictives. Rien ici ne touche le serveur.
#
# Connexion : variables PG* habituelles (PGHOST, PGPORT, PGUSER, PGPASSWORD).
# Les noms des bases viennent de BANC_BASE_BRAIN et BANC_BASE_N8N (par défaut :
# raime_brain_test et n8n_test) : un nom de test, pour ne jamais écraser une vraie base.
set -euo pipefail
cd "$(dirname "$0")/../.."

BRAIN="${BANC_BASE_BRAIN:-raime_brain_test}"
N8N="${BANC_BASE_N8N:-n8n_test}"
export PGHOST="${PGHOST:-localhost}" PGPORT="${PGPORT:-5432}" PGUSER="${PGUSER:-raime}"

for base in "$BRAIN" "$N8N"; do
  [[ "$base" =~ ^[A-Za-z][A-Za-z0-9_]*_test$ ]] || { echo "refus : chaque base du banc doit finir par _test et avoir un nom SQL simple" >&2; exit 1; }
done
[ "$BRAIN" != "$N8N" ] || { echo "refus : deux bases de test distinctes sont exigées" >&2; exit 1; }

# \restrict et \unrestrict n'existent que dans les psql récents : on les retire pour
# que le banc se charge avec n'importe quel psql 16.
charger() { sed -E '/^\\(un)?restrict /d' "$2" | psql -q -v ON_ERROR_STOP=1 -d "$1" >/dev/null; }

for base in "$BRAIN" "$N8N"; do
  PGOPTIONS="-c client_min_messages=warning" psql -q -d postgres -c "DROP DATABASE IF EXISTS \"$base\"" >/dev/null
  psql -q -d postgres -c "CREATE DATABASE \"$base\"" >/dev/null
done
charger "$BRAIN" db/schema_raime_brain.sql
charger "$N8N" db/schema_n8n_extrait.sql
psql -q -v ON_ERROR_STOP=1 -d "$BRAIN" -f tests/banc/donnees_brain.sql >/dev/null
psql -q -v ON_ERROR_STOP=1 -d "$N8N" -f tests/banc/donnees_n8n.sql >/dev/null
echo "banc prêt : $BRAIN et $N8N chargées, données fictives versées"

