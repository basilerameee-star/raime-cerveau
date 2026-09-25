#!/bin/bash
# LE DÉPOSEUR — tout ce que le cerveau réalise est déposé sur GitHub (voulu par Basile le 25/09/2026).
# Branche « realisations » du dépôt raime-cerveau : elle ne déclenche aucune mise en service (la porte
# ne regarde que main). Chaque demande terminée y entre dans son dossier demande-N, SANS les
# dépendances installées (node_modules, .venv…), sans la copie du code du cerveau (elle passe par
# l'applicateur), sans fichier de plus de 20 Mo, et jamais si un secret y apparaît.
set -u
exec 9>/tmp/deposeur.verrou; flock -n 9 || exit 0

T=/opt/raime/harness/travail
R=/opt/raime/realisations-git
SECRET='sk-[A-Za-z0-9_-]{16}|BEGIN [A-Z ]*PRIVATE KEY|ghp_[A-Za-z0-9]{20}|github_pat_|AIza[0-9A-Za-z_-]{30}|xox[bp]-'
export GIT_SSH_COMMAND="ssh -i /opt/raime/cles/github_cerveau -o IdentitiesOnly=yes"

if [ ! -d "$R/.git" ]; then
  git clone -q git@github.com:basilerameee-star/raime-cerveau.git "$R" || exit 0
  cd "$R"; git config user.name "cerveau-raime"; git config user.email "cerveau-raime@users.noreply.github.com"
  if git ls-remote --exit-code --heads origin realisations >/dev/null 2>&1; then
    git checkout -q -b realisations origin/realisations
  else
    # Branche orpheline VIDE : on retire de l'index et du disque la copie de main (erreur du 25/09 :
    # un « git rm » sans -f avait échoué, et le code entier du cerveau était parti dans la branche).
    git checkout -q --orphan realisations && git rm -rqf --cached . >/dev/null && git clean -qfdx && printf "# Réalisations du cerveau rAIme\n\nUn dossier par demande faite par l'exécutant. Les dépendances installées n'y sont pas : elles se réinstallent.\n" > README.md && git add README.md && git commit -qm "Réalisations : ouverture de la branche" && git push -q origin realisations
  fi
fi
cd "$R" && git fetch -q origin realisations && git reset -q --hard origin/realisations

for dir in "$T"/demande-*/; do
  dir=${dir%/}; n=${dir##*demande-}
  [ -f "$dir/.resultat.json" ] || [ -f "$dir/.applique" ] || continue      # seulement ce qui est terminé
  [ -f "$dir/.depose" ] && [ ! "$dir" -nt "$dir/.depose" ] && continue       # déjà déposé, rien de neuf
  rsync -a --delete --max-size=20m \
    --exclude node_modules --exclude .venv --exclude venv --exclude __pycache__ --exclude .git \
    --exclude cerveau --exclude '.*' --exclude '*.log' --exclude dist-ssr \
    "$dir/" "$R/demande-$n/"
  sz=$(du -sm "$R/demande-$n" | cut -f1)
  if [ "$sz" -gt 100 ]; then   # GitHub supporte mal les dépôts lourds : au-delà, on ne dépose pas
    rm -rf "$R/demande-$n"; echo "trop lourd ($sz Mo sans les dépendances) : non déposé" > "$dir/.depose-refuse"
    touch "$dir/.depose"; echo "$(date -Is) demande $n NON déposée ($sz Mo)"; continue
  fi
  if grep -rIlE "$SECRET" "$R/demande-$n" >/dev/null 2>&1; then
    rm -rf "$R/demande-$n"; echo "secret détecté : non déposé" > "$dir/.depose-refuse"
    echo "$(date -Is) demande $n NON déposée (secret détecté)"; continue
  fi
  git add -A "demande-$n"
  if ! git diff --cached --quiet; then
    git commit -qm "Réalisation : demande n°$n" && git push -q origin realisations \
      && echo "$(date -Is) demande $n déposée sur GitHub"
  fi
  touch "$dir/.depose"
done
