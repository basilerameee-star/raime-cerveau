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


def prevenir(sujet, texte):
    """Alerte à Basile, de son Gmail vers son Gmail (GMAIL_ADRESSE et GMAIL_MOT_DE_PASSE_APPLI du coffre). Jamais bloquant."""
    import smtplib
    from email.message import EmailMessage
    try:
        c = {l.split("=", 1)[0]: l.split("=", 1)[1].strip().strip('"') for l in open(COFFRE, encoding="utf-8") if "=" in l}
        m = EmailMessage(); m["From"] = m["To"] = c["GMAIL_ADRESSE"]; m["Subject"] = "[Clips] " + sujet
        m.set_content(texte + chr(10) * 2 + "Tout est sur https://cockpit.raime.fr/clips")
        with smtplib.SMTP("smtp.gmail.com", 587, timeout=30) as s:   # le port 465 est fermé sur le serveur
            s.starttls(); s.login(c["GMAIL_ADRESSE"], c["GMAIL_MOT_DE_PASSE_APPLI"]); s.send_message(m)
    except Exception as e:
        print("alerte non envoyée :", str(e)[:120], flush=True)


LIRE_DOC = r"""
import sys, json, re, io
b = sys.stdin.buffer.read(); texte, liens = "", []
if b[:4] == b"%PDF":
    from pypdf import PdfReader
    r = PdfReader(io.BytesIO(b))
    for p in r.pages:
        texte += (p.extract_text() or "") + "\n"
        for a in (p.get("/Annots") or []):
            o = a.get_object(); u = (o.get("/A") or {}).get("/URI")
            if u: liens.append(str(u))
else:
    texte = b.decode("utf-8", "replace")
liens += re.findall(r"https?://[^\s)>\]\"']+", texte)
print(json.dumps({"texte": texte, "liens": list(dict.fromkeys(liens))}))
"""
VIDEO = ("youtu", "drive.google", "dropbox", "vimeo", "twitch", "kick.com", "streamable", "wetransfer", "mega.nz", "frame.io")


def lire_document(d):
    """Le brief déposé en document : son texte entier (il guide le montage) et le lien de la vidéo source qu'il contient."""
    import base64
    r = subprocess.run(["docker", "run", "--rm", "-i", "--entrypoint", "python", "raime-clippeur", "-c", LIRE_DOC],
                       input=base64.b64decode(d["brief_fichier"]), capture_output=True, timeout=300)
    doc = json.loads(r.stdout.decode() or "{}")
    texte = ((d.get("consignes") or "") + "\n\n" + doc.get("texte", "")).strip()[:30000]
    url = d["url"]
    if not url.startswith("http"):
        url = next((l for l in doc.get("liens", []) if any(v in l for v in VIDEO)), "")
    sql("UPDATE clips_demandes SET consignes = :'p0', url = :'p1', brief_fichier = NULL WHERE id = :p2;", texte.replace("'", "’"), url or "introuvable", d["id"])
    d.update(consignes=texte, url=url or "introuvable", brief_fichier=None)


def brief_auto(d):
    """Le brief collé sur /clips devient le profil de la campagne (Gemini gratuit en extrait les règles), sans Claude.
    Publication automatique activée (accord de Basile du 02/10/2026 : de la campagne choisie au poste, sans intervention)."""
    texte = (d.get("consignes") or "").strip()
    if len(texte) < 40:
        return None
    sys.path.insert(0, "/opt/raime/clippeur")
    from clippeur import gemini
    p = gemini("""Voici le brief d'une campagne de clipping (Whop Content Rewards). Extrais-en les règles, sans rien inventer.
Réponds en JSON : {"nom": "nom court de la campagne", "min": durée minimale d'un clip en secondes (22 si non précisé ou si inférieur),
"max": durée maximale en secondes (40 si non précisé), "tags": {"youtube": "@compte à mentionner ou vide", "tiktok": "...", "instagram": "...", "x": "..."},
"hashtags": ["#obligatoires"], "interdits": ["mots ou sujets interdits, en minuscules"],
"consignes": "toutes les règles de contenu et de montage du brief, en anglais, phrases courtes",
"remuneration": {"type": "CPM ou par publication", "detail": "montants, minimum, maximum, plateformes, tels qu'écrits"},
"sources_autorisees": "quelles vidéos source sont autorisées"}
Brief :
""" + texte[:12000], cle_gemini())
    p.update({"_source": "Brief collé sur /clips (demande n°%s), extrait par Gemini." % d["id"], "brief_brut": texte[:12000],
              "sous_titres": True, "cadrage": "visage", "publication_auto": True})
    p["min"] = max(int(p.get("min") or 22), 22); p["max"] = max(int(p.get("max") or 40), p["min"] + 8)
    return p


def main():
    verrou = open(VERROU, "w")
    try:
        fcntl.flock(verrou, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        return                                            # une découpe est déjà en cours
    ligne = sql("""UPDATE clips_demandes SET etat = 'en_cours', maj = now() WHERE id = (SELECT id FROM clips_demandes
                   WHERE etat = 'a_faire' ORDER BY (coalesce(message, '') LIKE 'En attente%'), id LIMIT 1) RETURNING row_to_json(clips_demandes);""")
    if not ligne:
        return
    d = json.loads(next(l for l in ligne.splitlines() if l.startswith("{")))      # la ligne JSON, sans le compte rendu de psql
    if d.get("brief_fichier"):
        try:
            lire_document(d)
        except Exception as e:
            print("document", str(e)[:200], flush=True)
    if not d["url"].startswith("http"):
        sql("UPDATE clips_demandes SET etat = 'echec', message = :'p0', maj = now() WHERE id = :p1;",
            "Aucun lien de vidéo trouvé dans le brief : colle-le dans le champ du haut", d["id"])
        prevenir("lien de vidéo introuvable : " + d["campagne"], "Le brief ne contient pas de lien de vidéo lisible. Recommence en collant le lien dans le champ du haut de la page Clips.")
        return
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
    if not os.path.isfile(profil):                        # le brief collé sur la page devient le profil de la campagne
        try:
            p = brief_auto(d)
        except Exception as e:
            p = None; print("brief_auto", str(e)[:200], flush=True)
        if p:
            json.dump(p, open(profil, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    if not os.path.isfile(profil):                        # le brief d'abord : sans lui, aucune découpe (règle de Basile, 02/10/2026)
        sql("UPDATE clips_demandes SET etat = 'echec', message = :'p0', maj = now() WHERE id = :p1;",
            "Brief manquant : déposer clippeur/campagnes/%s.json avant la découpe" % d["campagne"], d["id"])
        prevenir("brief illisible : " + d["campagne"], "Le brief de la campagne %s n'a pas pu être lu. Recolle-le en entier sur la page Clips." % d["campagne"])
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
        prevenir("clips prêts : " + d["campagne"], fin[-1] + chr(10) + "Ils partent seuls dans Buffer, 4 par jour et par chaîne. Les liens publiés arrivent sur la page Clips.")
        # publication automatique (brief : "publication_auto": true, accord de Basile du 02/10/2026) : chaque clip entre
        # dans la file Buffer des 3 chaînes ; buffer.py l'envoie au rythme des créneaux réglés dans Buffer
        brief = json.load(open(profil, encoding="utf-8"))
        if brief.get("publication_auto"):
            try:
                clips = json.load(open(os.path.join(dossier, "clips.json"), encoding="utf-8"))["clips"]
            except (OSError, ValueError, KeyError):
                clips = []
            deja = brief.get("deja_publies", [])            # moments déjà publiés ailleurs [début, fin] : jamais deux fois
            for c in clips:
                if any(c["debut"] < f and c["fin"] > d0 for d0, f in deja):
                    continue
                for pl in ("youtube", "tiktok", "instagram"):
                    sql("""INSERT INTO clips_buffer (campagne, clip, plateforme, quand) VALUES (:'p0', :'p1', :'p2', now())
                           ON CONFLICT (campagne, clip, plateforme) DO NOTHING;""", d["campagne"], c["clip"], pl)
    else:
        sql("UPDATE clips_demandes SET etat = 'echec', message = :'p0', maj = now() WHERE id = :p1;",
            (r.stderr or r.stdout)[-300:].replace("\n", " "), d["id"])
        prevenir("échec de découpe : " + d["campagne"], (r.stderr or r.stdout)[-600:])


if __name__ == "__main__":
    main()
