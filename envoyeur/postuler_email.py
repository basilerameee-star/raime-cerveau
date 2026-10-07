# -*- coding: utf-8 -*-
"""Le canal « candidature par e-mail » (07/10/2026), sur l'hôte, toutes les 15 minutes de 7 h à 20 h (cron), sans Claude.

Quand l'annonce dit d'envoyer le dossier à une adresse (repéré par Jarvis : candidatures.cjs, adresseCandidature) et que
Basile valide, la candidature part de SON Gmail (accès du coffre, jamais copié ailleurs) : la lettre validée dans le corps
du message, le CV du bon modèle en pièce jointe. Une seule fois par offre (envoyes.txt, partagé avec l'Envoyeur), cinq au
plus par passage, une minute entre deux. La preuve (Message-ID) remonte à Jarvis ; Gmail en garde la copie dans « Envoyés ».

python3 postuler_email.py           -> un passage
python3 postuler_email.py --essai   -> montre le message de la première candidature en file, sans rien envoyer
"""
import json
import smtplib
import subprocess
import sys
import time
import urllib.request
from email.message import EmailMessage
from email.utils import formatdate, make_msgid
from pathlib import Path

DONNEES = Path("/opt/raime/envoyeur-data")
COFFRE = "/opt/raime/coffre/secrets.env"
CV = {"Vente": "CV_Suisse_Vente", "Commercial": "CV_Suisse_Commercial", "Sales EN": "CV_Suisse_Sales_EN",
      "Vente + IA": "CV_Suisse_Vente_IA", "Commercial (France)": "CV_Basile_Rame_Commercial"}
PAR_PASSAGE = 5


def jarvis(chemin, donnees=None):
    ip = subprocess.run(["docker", "inspect", "-f", "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}", "raime-cockpit-1"],
                        capture_output=True, text=True).stdout.strip()
    req = urllib.request.Request("http://%s:8090%s" % (ip, chemin), method="POST" if donnees is not None else "GET",
                                 data=json.dumps(donnees).encode() if donnees is not None else None,
                                 headers={"x-envoyeur-jeton": (DONNEES / "jeton.txt").read_text().strip(), "Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=60).read())


def coffre():
    return {l.split("=", 1)[0]: l.split("=", 1)[1].strip().strip('"') for l in open(COFFRE, encoding="utf-8") if "=" in l}


def message(f, p, expediteur):
    m = EmailMessage()
    m["From"] = "%s %s <%s>" % (p["prenom"], p["nom"], expediteur)
    m["To"] = f["email"]
    m["Reply-To"] = expediteur
    m["Subject"] = ("Application: " if f.get("langue") == "Anglais" else "Candidature : ") + f["titre"]
    m["Date"] = formatdate(localtime=True)
    m["Message-ID"] = make_msgid(domain=expediteur.split("@")[-1])
    m.set_content(f["lettre"].strip())                 # la signature du profil porte déjà téléphone et e-mail
    cv = DONNEES / "cv" / ("%s.pdf" % CV.get(f.get("cv"), "CV_Suisse_Vente"))
    m.add_attachment(cv.read_bytes(), maintype="application", subtype="pdf", filename="CV_%s_%s.pdf" % (p["prenom"], p["nom"]))
    return m


def main():
    essai = "--essai" in sys.argv
    file = [f for f in jarvis("/envoyeur/file") if f.get("canal") == "email" and f.get("email") and f.get("lettre")][:PAR_PASSAGE]
    if not file:
        if essai:
            print("aucune candidature par e-mail validée en file")
        return
    p = json.loads((DONNEES / "profil_candidat.json").read_text(encoding="utf-8"))
    c = coffre()
    expediteur = c["GMAIL_ADRESSE"]
    if essai:
        m = message(file[0], p, expediteur)
        print("\n".join("%s: %s" % (k, v) for k, v in m.items()))
        print(m.get_body(("plain",)).get_content()[:600])
        return
    registre = DONNEES / "envoyes.txt"
    deja = set(registre.read_text().split()) if registre.exists() else set()
    with smtplib.SMTP("smtp.gmail.com", 587, timeout=60) as s:          # le port 465 est fermé sur le serveur
        s.starttls()
        s.login(expediteur, c["GMAIL_MOT_DE_PASSE_APPLI"])
        for i, f in enumerate(file):
            r = {"id": f["id"], "source": f.get("source", ""), "canal": "email", "a": f["email"]}
            if f["id"] in deja:
                r.update(statut="deja", detail="déjà envoyée (registre)")
            else:
                try:
                    m = message(f, p, expediteur)
                    s.send_message(m)
                    with registre.open("a") as fr:
                        fr.write(f["id"] + "\n")
                    r.update(statut="envoye", message_id=m["Message-ID"], quand=time.strftime("%d.%m.%Y %H:%M"))
                except Exception as e:
                    r.update(statut="erreur", detail="%s: %s" % (type(e).__name__, str(e)[:200]))
            try:
                jarvis("/envoyeur/resultat", r)
            except Exception as e:
                print("résultat non transmis :", e, flush=True)
            print(time.strftime("%Y-%m-%d %H:%M"), r["statut"], f["titre"][:60], "->", f["email"], flush=True)
            if i < len(file) - 1:
                time.sleep(60)


if __name__ == "__main__":
    main()
