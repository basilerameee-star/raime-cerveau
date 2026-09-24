#!/usr/bin/env bash
# =====================================================================
#  rAIme — AUDIT D'UNE PROPOSITION, EN UNE COMMANDE
#
#  ./raime-audit.sh <proposition.pdf|.docx|.odt|.txt> "Nom du client" [secteur] [taille] [maturite] [cout horaire]
#
#  maturite : constatée chez le client, ex. "M1=oui,M2=non,M3=oui,M4=oui" (sans elle,
#  l'axe C du Score rAIme ne se note pas et le rapport le dit).
#  cout horaire : coût horaire chargé des équipes du client, en euros (ex. 38) ; sans lui,
#  l'axe B (rentabilité) ne se note pas, un prestataire ne le fournissant jamais.
#
#  Exemple :
#    ./raime-audit.sh devis-nexaflow.txt "Cabinet Martin" "Expertise comptable" "30 salaries"
#
#  Produit : un rapport PDF de marque, prêt à envoyer au client.
# =====================================================================
set -euo pipefail

VPS_USER=root
VPS_IP=2.29.6.94
VPS_KEY="$HOME/.ssh/raime_vps"
VPS_DIR=/opt/raime/raime-brain
CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"
SORTIE_DIR="$HOME/OneDrive/Desktop/rAIme/audits"

FICHIER="${1:?Usage: ./raime-audit.sh <fichier> \"Nom du client\" [secteur] [taille] [maturite]}"
CLIENT="${2:?Nom du client requis}"
SECTEUR="${3:-}"
TAILLE="${4:-}"
MATURITE="${5:-}"
COUT_HORAIRE="${6:-}"
# Une apostrophe droite casserait la commande distante : on passe à l'apostrophe typographique.
CLIENT="${CLIENT//\'/’}"

[ -f "$FICHIER" ] || { echo "Fichier introuvable : $FICHIER"; exit 1; }

# PDF, Word, OpenDocument : le texte est extrait ici, avant l'envoi. Un scan est refusé.
case "${FICHIER,,}" in
  *.txt|*.md) ;;
  *) TXT="$(mktemp -d)/$(basename "${FICHIER%.*}").txt"
     echo "▸ Lecture du document..."
     python "$(dirname "$0")/tools/extraire_texte.py" "$FICHIER" "$TXT" || exit 1
     FICHIER="$TXT" ;;
esac
mkdir -p "$SORTIE_DIR"

SSH="ssh -o BatchMode=yes -o ConnectTimeout=20 -i $VPS_KEY $VPS_USER@$VPS_IP"
BASE=$(basename "$FICHIER")

echo "▸ Envoi de la proposition sur le serveur..."
scp -q -o BatchMode=yes -i "$VPS_KEY" "$FICHIER" "$VPS_USER@$VPS_IP:$VPS_DIR/samples/$BASE"

echo "▸ Lancement de la mission (2 à 3 minutes)..."
ARGS="samples/$BASE --client \"$CLIENT\""
[ -n "$SECTEUR" ] && ARGS="$ARGS --secteur \"$SECTEUR\""
[ -n "$TAILLE" ]  && ARGS="$ARGS --taille \"$TAILLE\""
[ -n "$MATURITE" ] && ARGS="$ARGS --maturite \"$MATURITE\""
[ -n "$COUT_HORAIRE" ] && [ "$COUT_HORAIRE" != "-" ] && ARGS="$ARGS --cout-horaire \"$COUT_HORAIRE\""

RESULTAT=$($SSH "PGPASS=\$(docker exec raime-postgres-1 printenv POSTGRES_PASSWORD); \
timeout 540 docker run --rm --network raime_default \
 -e DATABASE_URL=\"postgres://n8n:\$PGPASS@raime-postgres-1:5432/raime_brain\" \
 --env-file $VPS_DIR/.env -v $VPS_DIR:/app -w /app \
 node:20-alpine sh -c 'node agents/mission.js $ARGS'")
echo "$RESULTAT"

MD=$(echo "$RESULTAT" | grep -oE 'out/audit-[a-z0-9-]+\.md' | head -1)
[ -n "$MD" ] || { echo "Aucun rapport produit — voir la sortie ci-dessus."; exit 1; }

echo "▸ Récupération du rapport..."
scp -q -o BatchMode=yes -i "$VPS_KEY" "$VPS_USER@$VPS_IP:$VPS_DIR/$MD" "$SORTIE_DIR/"
LOCAL_MD="$SORTIE_DIR/$(basename "$MD")"

echo "▸ Génération du PDF de marque..."
HTML="${LOCAL_MD%.md}.html"
python "$(dirname "$0")/tools/md2html.py" "$LOCAL_MD" "$HTML" "Analyse indépendante · confidentiel"
PDF_WIN=$(cygpath -w "${LOCAL_MD%.md}.pdf")
HTML_URL="file:///$(cygpath -m "$HTML")"
"$CHROME" --headless=new --disable-gpu --no-first-run --no-default-browser-check \
  --no-pdf-header-footer --allow-file-access-from-files --virtual-time-budget=9000 \
  --print-to-pdf="$PDF_WIN" "$HTML_URL" >/dev/null 2>&1
rm -f "$HTML"

echo ""
echo "══════════════════════════════════════════════════════"
echo " RAPPORT PRÊT : ${LOCAL_MD%.md}.pdf"
echo "══════════════════════════════════════════════════════"
echo " ⚠ Relis-le avant envoi (autonomie A1 : tu signes)."
