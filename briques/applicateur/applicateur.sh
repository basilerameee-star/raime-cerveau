#!/bin/bash
# L'APPLICATEUR — le cerveau met lui-même en service les améliorations de son propre code
# (accord écrit de Basile le 25/09/2026 : « après tests, avec retour arrière automatique »).
# Code de confiance, lancé par le serveur toutes les 5 minutes : ce n'est jamais l'agent qui pousse.
#
# Pour chaque travail/demande-N/changement.diff pas encore traité :
#   ① refus s'il touche ce qui protège le système (Constitution, livraison, coffre, briques, cockpit)
#      ou s'il ajoute un secret ;
#   ② application sur le dépôt à jour, puis TOUS les cas figés, dans un conteneur sans réseau ;
#   ③ si tout passe : commit + push sur main. La porte relance les tests, met en service, et revient
#      seule en arrière en cas d'échec. Chaque décision va au journal, que Jarvis lit.
set -u
exec 9>/tmp/applicateur.verrou; flock -n 9 || exit 0

T=/opt/raime/harness/travail
D=/opt/raime/cerveau-git
P=$(docker ps -qf name=postgres | head -1)
INTERDIT='^(plugin-cerveau/CONSTITUTION|\.github/|deploy\.sh|run\.sh|porte/|briques/|cockpit/|jarvis/)'
SECRET='sk-[A-Za-z0-9_-]{16}|BEGIN [A-Z ]*PRIVATE KEY|ghp_[A-Za-z0-9]{20}|github_pat_|AIza[0-9A-Za-z_-]{30}|xox[bp]-'

journal() { # $1 changement, $2 motif — textes venus de l'exécutant : on retire « $ » (fin de citation SQL)
  local a=${1//\$/} b=${2//\$/}
  docker exec -i "$P" psql -U n8n -d raime_brain -q -v ON_ERROR_STOP=1 \
    -c "INSERT INTO journal(acteur, changement, motif) VALUES ('applicateur', \$q\$$a\$q\$, \$q\$$b\$q\$)" >/dev/null 2>&1
}
refuser() { # $1 dossier, $2 n, $3 raison
  echo "$3" > "$1/.refuse"; journal "Amélioration n°$2 refusée" "$3"
  echo "$(date -Is) n°$2 refusée : $3"
}

cd "$D" || exit 0
for f in "$T"/demande-*/changement.diff; do
  [ -f "$f" ] || continue
  dir=$(dirname "$f"); n=${dir##*demande-}
  [[ "$n" =~ ^[0-9]+$ ]] || continue   # le nom du dossier vient de l'exécutant : un numéro, rien d'autre
  { [ -e "$dir/.applique" ] || [ -e "$dir/.refuse" ]; } && continue
  fichiers=$(grep -E '^\+\+\+ b/' "$f" | sed 's#^+++ b/##')
  [ -z "$fichiers" ] && { refuser "$dir" "$n" "changement vide ou illisible (format git diff attendu)"; continue; }
  zone=$(echo "$fichiers" | grep -E "$INTERDIT" | head -3 | tr '\n' ' ')
  [ -n "$zone" ] && { refuser "$dir" "$n" "touche une zone protégée : $zone"; continue; }
  grep -E '^\+' "$f" | grep -Eq "$SECRET" && { refuser "$dir" "$n" "contient ce qui ressemble à un secret"; continue; }
  # Le code mis en service tourne dans la boucle, qui a la base et les clés. Ce qui lance des
  # commandes, évalue du code, lit les clés ou appelle le réseau n'entre pas seul : Claude relit
  # d'abord (l'exécutant lit Internet ; une page piégée ne doit pas pouvoir s'installer ainsi).
  sensible=$(grep -E '^\+' "$f" | grep -vE '^\+\+\+' | grep -oE "child_process|execSync|exec\(|spawn\(|\beval\(|new Function|process\.env|fetch\(|https?\.request|require\(['\"](net|dgram|http|https)['\"]\)|from ['\"]node:(net|dgram|http|https|child_process)['\"]" | sort -u | head -5 | tr '\n' ' ')
  if [ -n "$sensible" ]; then
    refuser "$dir" "$n" "à relire par Claude avant mise en service (motifs sensibles : $sensible)"
    docker exec -i "$P" psql -U n8n -d raime_brain -q -c "UPDATE commandes SET pour = 'claude', reponse = coalesce(reponse, '') || ' [Applicateur : amélioration à relire par Claude avant mise en service]' WHERE id = $n" >/dev/null 2>&1
    continue
  fi

  git fetch -q origin main && git reset -q --hard origin/main && git clean -qfd -e node_modules
  if ! git apply --index "$f" 2>"$dir/.application.log"; then
    refuser "$dir" "$n" "ne s'applique pas sur le code actuel (voir .application.log)"; continue
  fi
  # Les tests qui font foi : ceux de la livraison automatique (deploy.sh), plus ceux que le changement
  # apporte lui-même. Celui du Héraut a besoin de la base : la porte ne le lance pas, nous non plus.
  tests=$( { grep -oE 'tests/cas_figes[a-z_0-9]*\.mjs' deploy.sh; echo "$fichiers" | grep -E '^tests/cas_figes[a-z_0-9]*\.mjs$'; } | sort -u | tr '\n' ' ')
  if docker run --rm --network none -v "$D":/app -v /opt/raime/raime-brain/node_modules:/app/node_modules:ro -w /app \
       node:20-alpine sh -c "for t in $tests; do node \"\$t\" || exit 1; done" >"$dir/.tests.log" 2>&1; then
    titre=$(head -1 "$dir/changement.md" 2>/dev/null | sed 's/^#* *//' | cut -c1-90)
    [ -z "$titre" ] && titre="amélioration demandée"
    git commit -q -m "Cerveau (demande n°$n) : $titre" \
      -m "Appliqué par l'applicateur après tous les cas figés ($(grep -c ' OK' "$dir/.tests.log") séries). Retour arrière : git revert." \
      && git push -q origin HEAD:main \
      && { touch "$dir/.applique"; journal "Amélioration n°$n mise en service : $titre" "$(echo $fichiers | cut -c1-300)"; echo "$(date -Is) n°$n poussée sur main"; } \
      || refuser "$dir" "$n" "envoi vers GitHub impossible"
  else
    git reset -q --hard origin/main
    refuser "$dir" "$n" "cas figés en échec : $(grep -m1 -E 'ÉCHEC|KO|Error' "$dir/.tests.log" | cut -c1-200)"
  fi
done
