#!/bin/bash
# Entretien quotidien d'Hermes (16/10/2026, décision de Basile : « que ça se fasse seul, tous les jours »).
# Cron de l'hôte à 3 h 15 UTC : après la sauvegarde des bases (3 h 00), avant la copie externe chiffrée (3 h 30).
# 1) SAUVEGARDE de la mémoire d'Hermes (sans ses accès : auth.json et .env exclus) et de ses dossiers de travail.
# 2) CORBEILLE : les dossiers périmés et les sauvegardes de réglages de plus de 7 jours y partent ;
#    la corbeille est vidée après 7 jours de plus (une semaine pour récupérer une erreur).
set -u
TS=$(date -u +%Y%m%d-%H%M)
B=/opt/raime/backups
H=/opt/raime/hermes-data
T=/opt/raime/harness/travail
C=/opt/raime/corbeille/$(date -u +%F)

# 1) Sauvegarde (14 gardées sur place ; la copie externe emporte la plus récente)
tar -czf "$B/hermes_$TS.tar.gz.tmp" --ignore-failed-read \
  -C / opt/raime/hermes-data/config.yaml opt/raime/hermes-data/SOUL.md opt/raime/hermes-data/memories \
  opt/raime/hermes-data/apprentissage.md opt/raime/hermes-data/cron/jobs.json opt/raime/hermes-data/skills \
  opt/raime/hermes-data/scripts opt/raime/hermes-data/state.db opt/raime/hermes-data/gouverneur.json \
  opt/raime/harness/travail/etat opt/raime/harness/travail/reflexion opt/raime/harness/travail/veille \
  opt/raime/harness/travail/matin opt/raime/harness/travail/gouverneur opt/raime/harness/travail/hermes \
  opt/raime/scripts 2>/dev/null
mv "$B/hermes_$TS.tar.gz.tmp" "$B/hermes_$TS.tar.gz"
ls -1t $B/hermes_*.tar.gz | tail -n +15 | xargs -r rm -f

# 2) Corbeille
mkdir -p "$C"
for d in veille matin reflexion gouverneur test-telegram.txt; do   # copies périmées depuis le 16/10 (le vrai dossier est harness/travail)
  [ -e "$H/atelier/$d" ] && mv "$H/atelier/$d" "$C/atelier-$d"
done
find $H $H/cron $H/scripts /opt/raime/scripts $T/etat /opt/raime -maxdepth 1 -type f \
  \( -name '*.avant-*' -o -name '*.avant_*' \) -ctime +7 -exec mv -t "$C" {} + 2>/dev/null
rmdir "$C" 2>/dev/null
find /opt/raime/corbeille -mindepth 1 -maxdepth 1 -type d -mtime +7 -exec rm -rf {} + 2>/dev/null

echo "entretien $(date -u +%FT%TZ) : sauvegarde $(du -h $B/hermes_$TS.tar.gz | cut -f1) ; corbeille : $(ls /opt/raime/corbeille 2>/dev/null | tr '\n' ' ')"
