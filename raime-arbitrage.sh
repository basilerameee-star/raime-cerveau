#!/usr/bin/env bash
# =====================================================================
#  rAIme — ARBITRAGE DE PLUSIEURS OFFRES, EN UNE COMMANDE
#
#  ./raime-arbitrage.sh "Nom du client" "<maturite>" "<cout horaire>" offre1.pdf offre2.docx [...]
#
#  maturite : constatée chez le client, ex. "M1=oui,M2=non,M3=oui,M4=oui".
#             Mettre "-" si elle n'est pas encore constatée : les offres sont lues,
#             mais l'axe C (réalisme) n'est pas noté, et le rapport le dit.
#  cout horaire : coût horaire chargé des équipes du client, en euros (ex. 38).
#             Un prestataire ne le fournit jamais : il se constate chez le client.
#             Mettre "-" s'il est inconnu : l'axe B (rentabilité) n'est alors pas noté.
#
#  Exemple :
#    ./raime-arbitrage.sh "Cabinet Martin" "M1=oui,M2=oui,M3=non,M4=oui" 38 nexaflow.pdf atelier.docx
#
#  Chaque offre passe par l'Analyste, l'Auditeur (Score rAIme v2.0) et le Contradicteur ;
#  le classement et le rapport (modèle ARB-01) sont ensuite calculés par du code.
#  Produit : un rapport PDF dans la charte noire, prêt à relire puis à envoyer.
# =====================================================================
set -euo pipefail

VPS_USER=root
VPS_IP=2.29.6.94
VPS_KEY="$HOME/.ssh/raime_vps"
VPS_DIR=/opt/raime/raime-brain
CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"
SORTIE_DIR="$HOME/OneDrive/Desktop/rAIme/arbitrages"
ICI="$(cd "$(dirname "$0")" && pwd)"

CLIENT="${1:?Usage: ./raime-arbitrage.sh \"Nom du client\" \"M1=oui,...\"|- 38|- offre1 offre2 [...]}"
MATURITE="${2:?Maturité requise (ou - si elle n’est pas encore constatée)}"
COUT_HORAIRE="${3:?Coût horaire requis (ou - s’il est inconnu)}"
shift 3
[ $# -ge 1 ] || { echo "Au moins une offre est nécessaire."; exit 1; }
# Une apostrophe droite casserait la commande distante : on passe à l'apostrophe typographique.
CLIENT="${CLIENT//\'/’}"
mkdir -p "$SORTIE_DIR"
TRAVAIL="$(mktemp -d)"

SSH="ssh -o BatchMode=yes -o ConnectTimeout=20 -i $VPS_KEY $VPS_USER@$VPS_IP"
DISTANTS=""
for f in "$@"; do
  [ -f "$f" ] || { echo "Fichier introuvable : $f"; exit 1; }
  nom=$(printf '%s' "$(basename "${f%.*}")" | tr -c 'A-Za-z0-9._-' '_')
  case "${f,,}" in
    *.txt|*.md) cp "$f" "$TRAVAIL/$nom.txt" ;;
    *) echo "▸ Lecture de $(basename "$f")..."
       python "$ICI/tools/extraire_texte.py" "$f" "$TRAVAIL/$nom.txt" || exit 1 ;;
  esac
  DISTANTS="$DISTANTS samples/arbitrage-$nom.txt"
done

echo "▸ Envoi des offres sur le serveur..."
for t in "$TRAVAIL"/*.txt; do
  scp -q -o BatchMode=yes -i "$VPS_KEY" "$t" "$VPS_USER@$VPS_IP:$VPS_DIR/samples/arbitrage-$(basename "$t")"
done

echo "▸ Arbitrage en cours (2 à 3 minutes par offre)..."
ARGS="--client \"$CLIENT\""
[ "$MATURITE" != "-" ] && ARGS="$ARGS --maturite \"$MATURITE\""
[ "$COUT_HORAIRE" != "-" ] && ARGS="$ARGS --cout-horaire \"$COUT_HORAIRE\""
ARGS="$ARGS $DISTANTS"

RESULTAT=$($SSH "PGPASS=\$(docker exec raime-postgres-1 printenv POSTGRES_PASSWORD); \
timeout 1500 docker run --rm --network raime_default \
 -e DATABASE_URL=\"postgres://n8n:\$PGPASS@raime-postgres-1:5432/raime_brain\" \
 --env-file $VPS_DIR/.env -v $VPS_DIR:/app -w /app \
 node:20-alpine sh -c 'node agents/arbitrage.js $ARGS'")
echo "$RESULTAT"

MD=$(echo "$RESULTAT" | grep -oE 'out/arbitrage-[a-z0-9-]+\.md' | head -1)
[ -n "$MD" ] || { echo "Aucun rapport produit — voir la sortie ci-dessus."; exit 1; }

echo "▸ Récupération du rapport..."
scp -q -o BatchMode=yes -i "$VPS_KEY" "$VPS_USER@$VPS_IP:$VPS_DIR/$MD" "$SORTIE_DIR/"
LOCAL_MD="$SORTIE_DIR/$(basename "$MD")"

echo "▸ Génération du PDF de marque..."
HTML="${LOCAL_MD%.md}.html"
python "$ICI/tools/md2html.py" "$LOCAL_MD" "$HTML" "Arbitrage indépendant · confidentiel"
PDF_WIN=$(cygpath -w "${LOCAL_MD%.md}.pdf")
HTML_URL="file:///$(cygpath -m "$HTML")"
"$CHROME" --headless=new --disable-gpu --no-first-run --no-default-browser-check \
  --no-pdf-header-footer --allow-file-access-from-files --virtual-time-budget=9000 \
  --print-to-pdf="$PDF_WIN" "$HTML_URL" >/dev/null 2>&1
rm -f "$HTML"
rm -rf "$TRAVAIL"

echo ""
echo "══════════════════════════════════════════════════════"
echo " RAPPORT PRÊT : ${LOCAL_MD%.md}.pdf"
echo "══════════════════════════════════════════════════════"
echo " ⚠ Relis-le avant envoi (autonomie A1 : tu signes)."
