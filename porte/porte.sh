#!/usr/bin/env bash
# LA PORTE DE DÉPLOIEMENT — le seul programme que la clé de GitHub peut lancer sur le serveur.
#
# Installée une fois (voir porte/INSTALLER.md), elle est imposée par authorized_keys :
#   command="/opt/raime/porte/porte.sh",restrict ssh-ed25519 AAAA… porte-github
# Quoi que demande le client SSH, c'est ce script qui s'exécute, et il ne comprend que :
#
#   deployer <sha>   le code arrive en tar.gz sur l'entrée standard ; il est posé, vérifié,
#                    et revient seul à la version précédente si la vérification échoue
#   revenir          remet la version précédente
#   etat             affiche la version en service et la précédente
#
# CE QU'ELLE MET EN SERVICE
#   ① le cerveau : les fichiers du dépôt recopiés dans raime-brain/, sans jamais toucher
#     .env, out/, bibliotheque/, node_modules/ ni les listes de prospection ;
#   ② chaque services/<nom>/ du dépôt : un conteneur construit depuis son Dockerfile, sur le
#     réseau de Caddy, et un bloc « <nom>.raime.fr » (modèle : briques/hebergement/).
#
# CODES DE SORTIE : 0 en service · 2 demande refusée · 3 échec, version précédente remise
#                   4 échec et aucune version précédente pour revenir
set -euo pipefail
umask 022

# ── Réglages. Le banc d'essai les remplace ; en production, sshd ne transmet pas ces
#    variables (AcceptEnv ne les laisse pas passer) : ce sont les valeurs par défaut.
RACINE="${PORTE_RACINE:-/opt/raime}"
CERVEAU="${PORTE_CERVEAU:-$RACINE/raime-brain}"
MAISON="${PORTE_MAISON:-$RACINE/porte}"
CADDY_DOSSIER="${PORTE_CADDY_DOSSIER:-$RACINE/caddy-services}"
CADDY_CONTENEUR="${PORTE_CADDY_CONTENEUR:-raime-caddy-1}"
RESEAU="${PORTE_RESEAU:-raime_default}"
DOMAINE="${PORTE_DOMAINE:-raime.fr}"
DOCKER="${PORTE_DOCKER:-docker}"
CURL="${PORTE_CURL:-curl}"
LANCEUR="${PORTE_LANCEUR:-$CERVEAU/run.sh}"
ESSAIS="${PORTE_ESSAIS:-6}"          # vérifications d'un service avant de conclure à l'échec
PAUSE="${PORTE_PAUSE:-10}"           # secondes entre deux essais (le premier certificat prend du temps)
TAILLE_MAX="${PORTE_TAILLE_MAX:-209715200}"   # 200 Mo : au-delà, ce n'est pas le dépôt
GARDER=5                              # versions conservées pour revenir en arrière
# La boucle garde en mémoire les modules qu'elle a chargés : sans redémarrage, le code
# livré dort sur le disque. Vide : aucune boucle à relancer (banc d'essai).
BOUCLE="${PORTE_BOUCLE-raime-boucle}"
ATTENTE_BOUCLE="${PORTE_ATTENTE_BOUCLE:-20}"   # secondes laissées à la boucle pour démarrer

VERSIONS="$MAISON/versions"
JOURNAL="$MAISON/journal.log"
# Noms déjà pris sur le serveur : aucun service du dépôt ne peut les remplacer.
RESERVES=" www raime n8n cockpit voyage metabase docuseal postgres caddy boucle porte api mail "
# Ce que le cerveau garde d'un déploiement à l'autre : jamais écrasé par le dépôt.
PROTEGES=(.env '*.env' ./.git ./services ./out ./bibliotheque ./node_modules ./.attente ./.sauvegarde
          ./competences-candidates cibles.json cibles_compact.json liste74.json liste74_compact.json)

mkdir -p "$VERSIONS" "$CADDY_DOSSIER"
dire() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*" | tee -a "$JOURNAL" >&2; }
refuser() { dire "REFUS : $*"; exit 2; }

# ── Ce que le client demande ────────────────────────────────────────────────
DEMANDE="${SSH_ORIGINAL_COMMAND:-${*:-}}"
read -r ACTION ARG RESTE <<<"$DEMANDE" || true
[ -z "${RESTE:-}" ] || refuser "demande trop longue : « $DEMANDE »"

courante()   { cat "$MAISON/courante" 2>/dev/null || true; }
precedente() { cat "$MAISON/precedente" 2>/dev/null || true; }

# ── Les services d'une version ──────────────────────────────────────────────
# services/<nom>/service.conf, lignes clé=valeur, sans exécution :
#   port=8080            le port écouté dans le conteneur
#   chemin=/             la page vérifiée après la mise en service
#   contient=Bienvenue   un texte que cette page doit contenir
lire_conf() { sed -n "s/^$2=//p" "$1" | head -n1 | tr -d '\r'; }

services_de() {   # affiche les noms valides des services d'une version
  local v="$VERSIONS/$1" d nom
  [ -d "$v/services" ] || return 0
  for d in "$v"/services/*/; do
    [ -f "$d/service.conf" ] && [ -f "$d/Dockerfile" ] || continue
    nom="$(basename "$d")"
    printf '%s\n' "$nom"
  done
}

valider_services() {   # refuse la version entière si un service est mal décrit
  local sha="$1" nom conf port chemin contient
  for nom in $(services_de "$sha"); do
    [[ "$nom" =~ ^[a-z0-9]([a-z0-9-]{0,28}[a-z0-9])?$ ]] || { echo "nom de service invalide : $nom"; return 1; }
    [[ "$RESERVES" != *" $nom "* ]] || { echo "nom réservé : $nom"; return 1; }
    conf="$VERSIONS/$sha/services/$nom/service.conf"
    port="$(lire_conf "$conf" port)"; chemin="$(lire_conf "$conf" chemin)"; contient="$(lire_conf "$conf" contient)"
    [[ "$port" =~ ^[0-9]{2,5}$ ]] || { echo "$nom : port invalide « $port »"; return 1; }
    [[ -z "$chemin" || "$chemin" =~ ^/[A-Za-z0-9._~/-]*$ ]] || { echo "$nom : chemin invalide"; return 1; }
    [ -n "$contient" ] || { echo "$nom : « contient= » manque, la page ne pourrait pas être vérifiée"; return 1; }
  done
}

conteneur() { printf 'raime-service-%s' "$1"; }

mettre_service() {   # construit et lance un service, écrit son bloc Caddy
  # Chaque étape rend son échec explicite : appelée dans un « if », une fonction bash
  # ignore set -e, et un docker build raté passerait sans bruit.
  local sha="$1" nom="$2" conf port
  conf="$VERSIONS/$sha/services/$nom/service.conf"
  port="$(lire_conf "$conf" port)"
  "$DOCKER" build -q -t "raime-service-$nom:${sha:0:12}" "$VERSIONS/$sha/services/$nom" >/dev/null \
    || { echo "$nom : construction échouée"; return 1; }
  "$DOCKER" rm -f "$(conteneur "$nom")" >/dev/null 2>&1 || true
  "$DOCKER" run -d --name "$(conteneur "$nom")" --network "$RESEAU" --restart always \
    --memory 256m --label raime.porte=1 --label "raime.version=$sha" \
    "raime-service-$nom:${sha:0:12}" >/dev/null || { echo "$nom : lancement échoué"; return 1; }
  printf '%s.%s {\n  reverse_proxy %s:%s\n}\n' "$nom" "$DOMAINE" "$(conteneur "$nom")" "$port" \
    > "$CADDY_DOSSIER/$nom.caddy"
}

retirer_service() {
  "$DOCKER" rm -f "$(conteneur "$1")" >/dev/null 2>&1 || true
  rm -f "$CADDY_DOSSIER/$1.caddy"
}

# ── Appliquer une version : le cerveau, puis les services ───────────────────
exclusions_tar() { local p; for p in "${PROTEGES[@]}"; do printf -- '--exclude=%s\0' "$p"; done; }

appliquer() {
  local sha="$1" v="$VERSIONS/$1" exclusions=() p nom avant
  mapfile -d '' exclusions < <(exclusions_tar)
  # Recopie sans effacer : un fichier présent sur le serveur et absent du dépôt reste en place.
  tar -C "$v" "${exclusions[@]}" -cf - . | tar -C "$CERVEAU" -xf - --no-same-owner \
    || { echo "recopie du cerveau échouée"; return 1; }
  avant="$(courante)"
  if [ ! -d "$CERVEAU/node_modules" ] || ! cmp -s "$v/package-lock.json" "$VERSIONS/$avant/package-lock.json" 2>/dev/null; then
    "$LANCEUR" "npm ci --omit=dev --no-audit --no-fund" >/dev/null || { echo "installation des dépendances échouée"; return 1; }
  fi
  if [ -n "$BOUCLE" ]; then
    date -u +%FT%TZ > "$MAISON/.boucle_depuis"
    "$DOCKER" restart "$BOUCLE" >/dev/null || { echo "la boucle ne redémarre pas"; return 1; }
  fi
  # Les services de la version sont mis ; ceux que la porte avait posés et qui n'y sont plus, retirés.
  for nom in $(services_de "$sha"); do mettre_service "$sha" "$nom" || return 1; done
  for p in "$CADDY_DOSSIER"/*.caddy; do
    [ -e "$p" ] || continue
    nom="$(basename "$p" .caddy)"
    services_de "$sha" | grep -qx "$nom" || retirer_service "$nom"
  done
  "$DOCKER" exec "$CADDY_CONTENEUR" caddy reload --config /etc/caddy/Caddyfile >/dev/null \
    || { echo "Caddy refuse la configuration"; return 1; }
}

# ── Vérifier : le cerveau se charge, chaque adresse répond ce qu'elle doit ──
verifier() {
  local sha="$1" nom conf chemin contient page i ok
  "$LANCEUR" 'for f in agents/*.js; do node --check "$f" || exit 1; done && node -e "import(\"./agents/lib.js\")"' >/dev/null \
    || { echo "le cerveau ne se charge pas"; return 1; }
  if [ -n "$BOUCLE" ]; then
    local depuis journal
    sleep "$ATTENTE_BOUCLE"
    depuis="$(cat "$MAISON/.boucle_depuis" 2>/dev/null || echo 10m)"
    [ "$("$DOCKER" inspect -f '{{.State.Running}}' "$BOUCLE" 2>/dev/null)" = "true" ] \
      || { echo "la boucle ne tourne plus après le redémarrage"; return 1; }
    journal="$("$DOCKER" logs --since "$depuis" "$BOUCLE" 2>&1 || true)"
    grep -qF '[boucle] démarrée' <<<"$journal" || { echo "la boucle n'a pas redémarré proprement"; return 1; }
    ! grep -qF 'arrêt fatal' <<<"$journal" || { echo "la boucle s'est arrêtée : arrêt fatal"; return 1; }
  fi
  for nom in $(services_de "$sha"); do
    conf="$VERSIONS/$sha/services/$nom/service.conf"
    chemin="$(lire_conf "$conf" chemin)"; contient="$(lire_conf "$conf" contient)"
    ok=0
    for ((i = 1; i <= ESSAIS; i++)); do
      # Interrogé sur le serveur même, par Caddy : la vérification ne dépend pas du DNS.
      page="$("$CURL" -fsS --max-time 20 --resolve "$nom.$DOMAINE:443:127.0.0.1" \
        "https://$nom.$DOMAINE${chemin:-/}" 2>/dev/null || true)"
      if [ -n "$page" ] && grep -qF -- "$contient" <<<"$page"; then ok=1; break; fi
      [ "$i" -lt "$ESSAIS" ] && sleep "$PAUSE"
    done
    [ "$ok" = 1 ] || { echo "$nom.$DOMAINE ne contient pas « $contient »"; return 1; }
  done
}

ranger_versions() {   # garde les GARDER plus récentes, et toujours la courante et la précédente
  local garder=" $(courante) $(precedente) " v
  ls -1t "$VERSIONS" | tail -n +$((GARDER + 1)) | while read -r v; do
    [[ "$garder" == *" $v "* ]] || rm -rf "${VERSIONS:?}/$v"
  done
}

# ── Les trois demandes ──────────────────────────────────────────────────────
exec 9>"$MAISON/.verrou"
flock -w 600 9 || refuser "un autre déploiement est en cours"

case "$ACTION" in
  etat)
    echo "en service : $(courante)"
    echo "précédente : $(precedente)"
    ;;

  deployer)
    [[ "${ARG:-}" =~ ^[0-9a-f]{40}$ ]] || refuser "identifiant de version invalide : « ${ARG:-} »"
    SHA="$ARG"; ANCIENNE="$(courante)"
    dire "déploiement de $SHA demandé (en service : ${ANCIENNE:-aucune})"
    rm -rf "$VERSIONS/$SHA.recu" && mkdir -p "$VERSIONS/$SHA.recu"
    head -c "$TAILLE_MAX" | tar -xzf - -C "$VERSIONS/$SHA.recu" --no-same-owner --no-same-permissions \
      || { rm -rf "$VERSIONS/$SHA.recu"; refuser "archive illisible"; }
    [ -f "$VERSIONS/$SHA.recu/agents/lib.js" ] && [ -f "$VERSIONS/$SHA.recu/package.json" ] \
      || { rm -rf "$VERSIONS/$SHA.recu"; refuser "l'archive n'est pas le dépôt raime-cerveau"; }
    rm -rf "${VERSIONS:?}/$SHA" && mv "$VERSIONS/$SHA.recu" "$VERSIONS/$SHA"
    if ! motif="$(valider_services "$SHA")"; then rm -rf "${VERSIONS:?}/$SHA"; refuser "$motif"; fi

    # Premier passage par la porte : aucune version enregistrée. On photographie d'abord le
    # cerveau en service, pour pouvoir y revenir si la nouvelle version échoue.
    if [ -z "$ANCIENNE" ] && [ -f "$CERVEAU/agents/lib.js" ]; then
      mapfile -d '' exclusions < <(exclusions_tar)
      rm -rf "$VERSIONS/initiale" && mkdir -p "$VERSIONS/initiale"
      tar -C "$CERVEAU" "${exclusions[@]}" -cf - . | tar -C "$VERSIONS/initiale" -xf - \
        || refuser "impossible de photographier le cerveau en service"
      ANCIENNE=initiale
      dire "cerveau en service photographié (version « initiale »)"
    fi

    if motif="$(appliquer "$SHA")" && motif="$(verifier "$SHA")"; then
      if [ -n "$ANCIENNE" ] && [ "$ANCIENNE" != "$SHA" ]; then echo "$ANCIENNE" > "$MAISON/precedente"; fi
      echo "$SHA" > "$MAISON/courante"
      ranger_versions
      dire "EN SERVICE : $SHA"
      for nom in $(services_de "$SHA"); do echo "en ligne : https://$nom.$DOMAINE"; done
      exit 0
    fi
    motif="${motif:-la mise en place a échoué}"
    if [ -n "$ANCIENNE" ] && [ -d "$VERSIONS/$ANCIENNE" ]; then
      dire "ÉCHEC de $SHA : $motif — retour à $ANCIENNE"
      appliquer "$ANCIENNE" >/dev/null || true
      if m2="$(verifier "$ANCIENNE")"; then dire "RETOUR ARRIÈRE réussi : $ANCIENNE en service"
      else dire "RETOUR ARRIÈRE incomplet : ${m2:-}"; fi
      exit 3
    fi
    dire "ÉCHEC de $SHA : $motif — aucune version précédente ; services de cette version retirés"
    for nom in $(services_de "$SHA"); do retirer_service "$nom"; done
    "$DOCKER" exec "$CADDY_CONTENEUR" caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1 || true
    exit 4
    ;;

  revenir)
    CIBLE="$(precedente)"; ACTUELLE="$(courante)"
    [ -n "$CIBLE" ] && [ -d "$VERSIONS/$CIBLE" ] || refuser "aucune version précédente"
    dire "retour demandé : $ACTUELLE → $CIBLE"
    motif="$(appliquer "$CIBLE")" || { dire "RETOUR ARRIÈRE incomplet : $motif"; exit 3; }
    motif="$(verifier "$CIBLE")" || { dire "RETOUR ARRIÈRE incomplet : $motif"; exit 3; }
    echo "$CIBLE" > "$MAISON/courante"; echo "$ACTUELLE" > "$MAISON/precedente"
    dire "EN SERVICE : $CIBLE (retour arrière)"
    ;;

  *) refuser "demande inconnue : « $DEMANDE » (connues : deployer <sha>, revenir, etat)" ;;
esac
