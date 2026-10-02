# -*- coding: utf-8 -*-
"""La file du clippeur (02/10/2026) : prend la plus ancienne demande de /clips (table clips_demandes), la passe au
clippeur, note le résultat. Lancé par cron sur le serveur toutes les 2 minutes ; une seule découpe à la fois (verrou).
Les consignes du brief sont transmises telles quelles au choix des passages. Sans Claude, sans frais.
"""
import fcntl
import json
import shutil
import os
import subprocess
import sys

BASE = "raime_brain"
VERROU = "/tmp/clippeur-file.lock"
CLIPS = "/opt/raime/harness/travail/clips"
COFFRE = "/opt/raime/coffre/secrets.env"


def sql(requete, *params):
    """psql dans le conteneur Postgres ; les paramètres passent par des variables psql (jamais collés dans la requête)."""
    cmd = ["docker", "exec", "-i", "raime-postgres-1", "sh", "-c",
           'psql -U "$POSTGRES_USER" -d %s -tAq -v ON_ERROR_STOP=1 %s' % (BASE, " ".join("-v p%d=%s" % (i, "'" + str(p).replace("'", "") + "'") for i, p in enumerate(params)))]
    r = subprocess.run(cmd, input=requete, capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(r.stderr[-400:])
    return r.stdout.strip()


def cle_gemini():
    for ligne in open(COFFRE, encoding="utf-8"):
        if ligne.startswith("GEMINI_API_KEY="):
            return ligne.split("=", 1)[1].strip().strip('"')
    return ""


def main():
    verrou = open(VERROU, "w")
    try:
        fcntl.flock(verrou, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        return                                            # une découpe est déjà en cours
    ligne = sql("""UPDATE clips_demandes SET etat = 'en_cours', maj = now() WHERE id = (SELECT id FROM clips_demandes
                   WHERE etat = 'a_faire' ORDER BY id LIMIT 1) RETURNING row_to_json(clips_demandes);""")
    if not ligne:
        return
    d = json.loads(next(l for l in ligne.splitlines() if l.startswith("{")))      # la ligne JSON, sans le compte rendu de psql
    source = d["url"]
    if any(h in d["url"] for h in ("youtube.com", "youtu.be")):
        # YouTube bloque l'adresse du serveur : la vidéo vient du PC de Basile, déposée dans sources/<campagne>.mp4
        local = os.path.join(CLIPS, "sources", d["campagne"] + ".mp4")
        if not os.path.isfile(local):
            sql("UPDATE clips_demandes SET etat = 'a_faire', message = :'p0', maj = now() WHERE id = :p1;",
                "En attente de la vidéo depuis le PC (YouTube bloque le serveur)", d["id"])
            return
        source = "/sortie/sources/%s.mp4" % d["campagne"]
    profil = "/opt/raime/clippeur/campagnes/%s.json" % d["campagne"]
    if not os.path.isfile(profil):                        # le brief d'abord : sans lui, aucune découpe (règle de Basile, 02/10/2026)
        sql("UPDATE clips_demandes SET etat = 'echec', message = :'p0', maj = now() WHERE id = :p1;",
            "Brief manquant : déposer clippeur/campagnes/%s.json avant la découpe" % d["campagne"], d["id"])
        return
    # le dossier de la campagne rassemble tout : brief et conditions de paiement, source, clips, liens à déclarer à Whop
    dossier = os.path.join(CLIPS, d["campagne"])
    os.makedirs(dossier, exist_ok=True)
    shutil.copyfile(profil, os.path.join(dossier, "brief.json"))
    env = dict(os.environ, GEMINI_API_KEY=cle_gemini())
    cmd = ["docker", "run", "--rm", "-e", "GEMINI_API_KEY", "-v", "%s:/sortie" % CLIPS, "-v", "clippeur-modeles:/root/.cache",
           "-v", "/opt/raime/clippeur/campagnes:/campagnes:ro",
           "raime-clippeur", source, "--campagne", d["campagne"], "--nombre", str(d["nombre"])]
    # le profil de la campagne (tags, hashtags, mots interdits, consignes du brief), s'il existe
    if os.path.isfile("/opt/raime/clippeur/campagnes/%s.json" % d["campagne"]):
        cmd += ["--profil", "/campagnes/%s.json" % d["campagne"]]
    if d.get("consignes"):
        cmd += ["--consignes", d["consignes"]]
    r = subprocess.run(cmd, env=env, capture_output=True, text=True, timeout=4 * 3600)
    print(chr(10).join((r.stdout + r.stderr).splitlines()[-25:]), flush=True)   # le compte rendu de la découpe, pour le diagnostic
    fin = [l for l in r.stdout.splitlines() if l.startswith("FINI")]
    if r.returncode == 0 and fin:
        sql("UPDATE clips_demandes SET etat = 'fait', message = :'p0', maj = now() WHERE id = :p1;", fin[-1][:300], d["id"])
    else:
        sql("UPDATE clips_demandes SET etat = 'echec', message = :'p0', maj = now() WHERE id = :p1;",
            (r.stderr or r.stdout)[-300:].replace("\n", " "), d["id"])


if __name__ == "__main__":
    main()
