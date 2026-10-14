#!/usr/bin/env bash
# Vérification de livraison, exécutée par run.sh sur l'hôte. Aucun secret.
# L'ancienne porte installée utilise déjà ce lanceur : pas de clé SSH nouvelle.
set -euo pipefail
racine="${RAIME_RECHARGE_RACINE:-$(cd "$(dirname "$0")/.." && pwd)}"
porte="${RAIME_RECHARGE_PORTE:-/opt/raime/porte}"
DOCKER="${RAIME_RECHARGE_DOCKER:-docker}"
DELAI="${RAIME_RECHARGE_DELAI:-900}"
DELAI_SANTE="${RAIME_RECHARGE_SANTE:-60}"
DRAIN="${RAIME_RECHARGE_DRAIN:-15}"
[[ "$DELAI" =~ ^[0-9]+$ && "$DELAI_SANTE" =~ ^[0-9]+$ && "$DRAIN" =~ ^[0-9]+$ ]] || exit 1
attendue=$(cat "$racine/hermes/executant.js" "$racine/jarvis/verification.cjs" | sha256sum | cut -d' ' -f1)

etat() {
  timeout 10s "$DOCKER" exec raime-executant node -e '
    fetch("http://127.0.0.1:8201/sante",{signal:AbortSignal.timeout(7000)})
      .then(r=>r.json()).then(d=>{
        if(!["libre","occupe","indisponible"].includes(d.etat))process.exit(1);
        console.log(d.etat+" "+(/^[a-f0-9]{64}$/.test(d.version)?d.version:"ancienne"));
      }).catch(()=>process.exit(1));' 2>/dev/null
}
ligne=$(etat) || { echo 'Exécutant injoignable : livraison arrêtée avant tout redémarrage.' >&2; exit 1; }
read -r statut version <<<"$ligne"
if [ "$version" = "$attendue" ] && [ "$statut" != indisponible ]; then
  echo "Exécutant déjà chargé : $attendue"; exit 0
fi

# La suspension utilise le volume réellement partagé avec Jarvis, pas un chemin supposé.
travail=$("$DOCKER" inspect -f '{{range .Mounts}}{{if eq .Destination "/travail"}}{{.Source}}{{end}}{{end}}' raime-executant)
[[ "$travail" = /* && "$travail" != *$'\n'* && -d "$travail" ]] || { echo 'Volume de travail introuvable.' >&2; exit 1; }
exec 8>"$travail/.recharge-verrou"
flock -w 10 8 || exit 1
marque="$travail/.maintenance"; posee=0; bascule=0; reussie=0
ancien=$(cat "$porte/courante")
[[ "$ancien" = initiale || "$ancien" =~ ^[a-f0-9]{40}$ ]] || exit 1
avant="$porte/versions/$ancien"
[ -f "$avant/hermes/executant.js" ] || { echo 'Code précédent absent : aucun redémarrage.' >&2; exit 1; }

nettoyer() {
  if [ "$bascule" = 1 ] && [ "$reussie" = 0 ]; then
    # La porte va ensuite remettre tout le dépôt. Recharger ici aussi le relais
    # précédent : l'ancienne porte ne connaît pas encore ce conteneur.
    cp "$avant/hermes/executant.js" "$racine/hermes/executant.js"
    if [ -f "$avant/jarvis/verification.cjs" ]; then cp "$avant/jarvis/verification.cjs" "$racine/jarvis/verification.cjs"; fi
    if timeout 30s "$DOCKER" restart raime-executant >/dev/null; then
      echo 'Redémarrage du relais précédent demandé ; la porte rétablit le dépôt.' >&2
    else echo 'Échec du rechargement précédent : intervention nécessaire.' >&2; fi
  fi
  if [ "$posee" = 1 ]; then rm -f "$marque"; fi
}
trap nettoyer EXIT
if [ ! -e "$marque" ]; then touch "$marque"; posee=1; fi
# Première transition depuis le relais ancien : laisser Jarvis terminer son
# rechargement (deux observations à cinq secondes puis arrêt du processus ancien).
# Les versions suivantes refusent aussi /tache pendant cette maintenance.
sleep "$DRAIN"
fin=$((SECONDS + DELAI))
while :; do
  ligne=$(etat) || { echo 'Santé inconnue : aucun redémarrage.' >&2; exit 1; }
  read -r statut version <<<"$ligne"
  [ "$statut" = libre ] && break
  [ "$statut" = occupe ] || { echo 'Relais indisponible : livraison arrêtée.' >&2; exit 1; }
  [ "$SECONDS" -lt "$fin" ] || { echo 'Travail toujours en cours : livraison arrêtée sans interruption.' >&2; exit 1; }
  sleep 1
done
bascule=1
timeout 30s "$DOCKER" restart raime-executant >/dev/null
fin=$((SECONDS + DELAI_SANTE))
while :; do
  ligne=$(etat || true); read -r statut version <<<"$ligne"
  if [ "$statut" = libre ] && [ "$version" = "$attendue" ]; then
    reussie=1; echo "Exécutant vérifié : $attendue"; exit 0
  fi
  [ "$SECONDS" -lt "$fin" ] || { echo 'Nouvelle version non vérifiée : retour au relais précédent.' >&2; exit 1; }
  sleep 1
done
