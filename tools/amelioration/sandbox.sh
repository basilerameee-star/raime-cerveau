#!/usr/bin/env bash
# Seulement des données fictives ; ni jeton, ni .env, ni .git, ni accès Internet dans l'essai.
set -euo pipefail
racine="$(pwd)"
source_banc="$(mktemp -d)"
# Le répertoire ne contient que l'archive publique au banc ; le conteneur tourne
# comme node (1000), pas comme l'utilisateur du runner qui possède mktemp (0700).
chmod 0755 "$source_banc"
reseau="raime-banc-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"
base_banc="$reseau-pg"
nettoyer() {
  docker rm -f "$base_banc" "$reseau-test" >/dev/null 2>&1 || true
  docker network rm "$reseau" >/dev/null 2>&1 || true
  rm -rf "$source_banc"
}
trap nettoyer EXIT
# git archive exclut les identifiants de checkout et les fichiers de travail du runner.
git archive HEAD | tar -x -C "$source_banc"
if [ -f proposition.json ]; then cp proposition.json "$source_banc/proposition.json"; fi
docker build -f tools/amelioration/Dockerfile -t raime-banc-pur "$source_banc"
docker network create --internal "$reseau" >/dev/null
docker run -d --name "$base_banc" --network "$reseau" --memory 512m --cpus 1 --pids-limit 256 \
  -e POSTGRES_USER=raime -e POSTGRES_PASSWORD=banc postgres:16 >/dev/null
for tour in $(seq 1 30); do
  docker exec "$base_banc" pg_isready -U raime >/dev/null 2>&1 && break
  if [ "$tour" = 30 ]; then echo 'base jetable indisponible' >&2; exit 1; fi
  sleep 1
done
timeout --kill-after=10s 600s docker run --rm --name "$reseau-test" --network "$reseau" \
  --read-only --cap-drop ALL --security-opt no-new-privileges --memory 1536m --cpus 2 --pids-limit 256 \
  --tmpfs /tmp:rw,nosuid,nodev,size=256m --tmpfs /work:rw,nosuid,nodev,size=512m,mode=1777 \
  --mount "type=bind,source=$source_banc,target=/source,readonly" \
  -e PGHOST="$base_banc" -e PGUSER=raime -e PGPASSWORD=banc \
  raime-banc-pur sh -ec '
    cp -R /source/. /work/
    ln -s /deps/node_modules /work/node_modules
    npm test
    python3 -m unittest tests/banc/porte_http_test.py tests/banc/envoyeur_test.py
    if [ -f proposition.json ]; then
      node tools/amelioration/controle.mjs essayer
      npm test
      python3 -m unittest tests/banc/porte_http_test.py tests/banc/envoyeur_test.py
    fi
  '
