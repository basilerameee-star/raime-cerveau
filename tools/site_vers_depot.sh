#!/usr/bin/env bash
# Recopie le site raime.fr dans le depot du cerveau (dossier site/), a l'identique de ce qui est publie.
# A lancer apres chaque mise en ligne du site : GitHub reste alors la copie fidele de raime.fr, et le
# cerveau peut lire, verifier et, plus tard, corriger le site depuis le depot.
#
#   ./tools/site_vers_depot.sh            (copie seulement)
#   ./tools/site_vers_depot.sh --commit   (copie, puis enregistre et envoie sur GitHub)
#
# Ce qui part : la chaine de fabrication (generateurs), les textes legaux sources, les images des
# projets, la fonction Stripe, et dist/ tel qu'il est en ligne. Ce qui ne part pas : les apercus,
# les anciennes sauvegardes, node_modules, l'ancien site Astro.
set -euo pipefail
ICI="$(cd "$(dirname "$0")/.." && pwd)"
SITE="${SITE_SOURCE:-$HOME/Projets/rAIme/site}"
CIBLE="$ICI/site"
[ -f "$SITE/_sauvegardes/generateurs/parcours.py" ] || { echo "Site introuvable : $SITE"; exit 1; }

GEN="_sauvegardes/generateurs"
LEGAL="_sauvegardes/avant-noir-prod-2026-09-25/dist"
mkdir -p "$CIBLE/$GEN" "$CIBLE/$LEGAL" "$CIBLE/source" "$CIBLE/functions"

# la chaine de fabrication du site noir (jour/nuit compris)
for f in parcours.py pages_annexes.py jour.py alleger.py nardo.py particules_moteur.html defile_vues.mjs tout_voir.js; do
  [ -f "$SITE/$GEN/$f" ] && cp "$SITE/$GEN/$f" "$CIBLE/$GEN/$f"
done
for d in logos partage; do rm -rf "$CIBLE/$GEN/$d"; cp -r "$SITE/$GEN/$d" "$CIBLE/$GEN/$d"; done
# les textes legaux sources lus par pages_annexes.py
for d in mentions-legales cgv confidentialite merci-livre; do rm -rf "$CIBLE/$LEGAL/$d"; cp -r "$SITE/$LEGAL/$d" "$CIBLE/$LEGAL/$d"; done
# les images des projets, la fonction de livraison du livre, le mode d'emploi
rm -rf "$CIBLE/source/projets"; cp -r "$SITE/source/projets" "$CIBLE/source/projets"
cp "$SITE/functions/stripe-webhook.js" "$CIBLE/functions/"
cp "$SITE/CLAUDE.md" "$CIBLE/CLAUDE.md"
# le site tel qu'il est en ligne
rm -rf "$CIBLE/dist"; cp -r "$SITE/dist" "$CIBLE/dist"

# aucune cle ne doit partir : on s'arrete si un secret apparait (les commentaires qui en decrivent le format passent)
if grep -rIn --exclude-dir=dist "sk_live_[A-Za-z0-9]\|sk_test_[A-Za-z0-9]\|rk_live_[A-Za-z0-9]\|whsec_[A-Za-z0-9]\{8\}\|BEGIN [A-Z ]*PRIVATE KEY" "$CIBLE"; then
  echo "SECRET DETECTE : rien n'est enregistre."; exit 1
fi
echo "site recopie : $(du -sh "$CIBLE" | cut -f1)"

if [ "${1:-}" = "--commit" ]; then
  cd "$ICI"
  git add site
  if git diff --cached --quiet; then echo "rien de nouveau"; exit 0; fi
  git commit -q -m "Site raime.fr : copie fidele de la version en ligne ($(date +%Y-%m-%d))"
  git push -q origin main
  echo "envoye sur GitHub"
fi
