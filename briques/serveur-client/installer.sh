#!/usr/bin/env bash
# INSTALLER LE KIT SUR LE SERVEUR DU CLIENT (Ubuntu 24.04, serveur a son nom).
#
#   sudo ./installer.sh automatisation.entreprise-client.fr contact@entreprise-client.fr
#
# Ce que fait ce script, dans l'ordre :
#   1. pare-feu : seuls SSH, HTTP et HTTPS entrent ;
#   2. Docker, s'il manque (depot officiel Docker) ;
#   3. les secrets (mot de passe de la base, cle de chiffrement de n8n) sont TIRES AU HASARD ICI,
#      ecrits dans .env (lisible par root seulement) et jamais affiches ;
#   4. demarrage, puis controle : la base repond, n8n repond, le certificat HTTPS est servi ;
#   5. la sauvegarde de chaque nuit est programmee (sauvegarde.sh, 3 h du matin).
set -euo pipefail
cd "$(dirname "$0")"
DOMAINE="${1:?Usage : sudo ./installer.sh <domaine> <adresse pour les certificats>}"
EMAIL="${2:?Adresse e-mail pour les certificats requise}"
[ "$(id -u)" = 0 ] || { echo "A lancer avec sudo."; exit 1; }

echo "1/5 pare-feu"
if command -v ufw >/dev/null; then
  ufw allow OpenSSH >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
  ufw --force enable >/dev/null
fi

echo "2/5 Docker"
if ! command -v docker >/dev/null; then
  apt-get update -qq && apt-get install -y -qq ca-certificates curl >/dev/null
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq && apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin >/dev/null
fi

echo "3/5 secrets"
if [ ! -f .env ]; then
  umask 077
  {
    echo "DOMAINE=$DOMAINE"
    echo "EMAIL_CERTIFICATS=$EMAIL"
    echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"
    echo "N8N_ENCRYPTION_KEY=$(openssl rand -hex 32)"
  } > .env
  chmod 600 .env
  echo "   .env cree (non affiche). La cle N8N_ENCRYPTION_KEY doit etre gardee : sans elle, les acces enregistres dans n8n sont perdus."
else
  echo "   .env existe deja : garde tel quel"
fi

echo "4/5 demarrage et controle"
docker compose up -d
for i in $(seq 1 30); do
  if docker compose exec -T base pg_isready -U n8n -d n8n >/dev/null 2>&1 \
     && docker compose exec -T n8n wget -q -O- http://localhost:5678/healthz >/dev/null 2>&1; then
    echo "   base et n8n repondent"; break
  fi
  sleep 5
  [ "$i" = 30 ] && { echo "   ECHEC : n8n ne repond pas. Voir : docker compose logs n8n"; exit 1; }
done
if curl -fsS --max-time 30 "https://$DOMAINE/healthz" >/dev/null 2>&1; then
  echo "   https://$DOMAINE repond, certificat en place"
else
  echo "   https://$DOMAINE ne repond pas encore : verifier que le nom pointe bien vers ce serveur (DNS), puis relancer."
fi

echo "5/5 sauvegarde de chaque nuit"
chmod +x sauvegarde.sh
( crontab -l 2>/dev/null | grep -v "automatisations/sauvegarde.sh" ; echo "0 3 * * * $(pwd)/sauvegarde.sh >> /var/log/sauvegarde-automatisations.log 2>&1" ) | crontab -
echo "Installation terminee. Reste a faire avec le client : creer le compte n8n (https://$DOMAINE), essayer une restauration (restaurer.sh), remettre les acces."
