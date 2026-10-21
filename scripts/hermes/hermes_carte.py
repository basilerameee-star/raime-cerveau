#!/usr/bin/env python3
"""Garanties visibles d'Hermes (16/10/2026), sans modèle : 0 jeton. Cron de l'hôte, toutes les 10 min.

1. CARTE « Hermes » : /opt/raime/harness/travail/hermes/index.html, servie par le cockpit
   (https://cockpit.raime.fr/livrables/hermes/) : dernière veille, réflexion, contrôle et rappels,
   modèle utilisé et relais pris, jetons du jour, alerte en cours, Telegram.
2. LIGNE DU RAPPORT DU MATIN : une fois par jour après 5 h 20 UTC, une ligne « [info] Hermes : … » dans
   gardien_log ; le rapport quotidien (7 h 30) reprend les lignes du Gardien des dernières 24 h.
   Les lignes « info » ne déclenchent aucune alerte de la Sentinelle.
"""
import html
import json
import os
import re
import subprocess
import time
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

TRAVAIL = "/opt/raime/harness/travail"
H = "/opt/raime/hermes-data"
CARTE = TRAVAIL + "/hermes/index.html"
ETAT = H + "/carte.etat.json"
TACHES = {"d2d3f6a80fe1": "Veille horaire", "4e2ff4fa79a9": "Contrôle du matin",
          "00d533f0a395": "Rappels du matin", "488f5c420810": "Réflexion de nuit"}
PARIS = ZoneInfo("Europe/Paris")


def sh(*cmd):
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=90)
    return r.stdout


def heure(iso):
    try:
        return datetime.fromisoformat(iso).astimezone(PARIS).strftime("%d/%m à %H h %M")
    except ValueError:
        return iso


def derniers_passages():
    vus = {}
    for l in sh("docker", "exec", "-u", "1000", "raime-hermes", "hermes", "cron", "runs").splitlines():
        m = re.search(r"\s(\w+)\s+job=(\w+)\s+source=\S+\s+(\S+)$", l)
        if m and m.group(2) in TACHES and m.group(3) > vus.get(m.group(2), ("", ""))[1]:
            vus[m.group(2)] = (m.group(1), m.group(3))
    return vus


def telegram():
    try:
        lignes = [l for l in open(H + "/logs/gateway.log", encoding="utf-8", errors="replace") if "telegram" in l.lower()]
    except OSError:
        return "inconnu"
    for l in reversed(lignes):
        if "telegram connected" in l:
            return "connecté"
        if re.search(r"telegram.*(disconnect|fatal|error)", l, re.I):
            return "en panne"
    return "inconnu"


def main():
    passages = derniers_passages()
    resume = open(TRAVAIL + "/gouverneur/aujourdhui.txt", encoding="utf-8").read().splitlines() \
        if os.path.exists(TRAVAIL + "/gouverneur/aujourdhui.txt") else []
    total = resume[1] if len(resume) > 1 else "Total du jour : inconnu"
    detail = [l[2:] for l in resume[2:]]
    relais = sum(int(m.group(1)) for l in detail for m in [re.search(r"(\d+) relais", l)] if m)
    modele = re.search(r'default: "([^"]+)"', open(H + "/config.yaml").read())
    modele = modele.group(1) if modele else "inconnu"
    incident = open("/opt/raime/backups/hermes_muet.incident").read().strip() \
        if os.path.exists("/opt/raime/backups/hermes_muet.incident") else ""
    niveau = ""
    try:
        derniere = open(TRAVAIL + "/reflexion/index.jsonl", encoding="utf-8").read().strip().splitlines()[-1]
        d = json.loads(derniere)
        niveau = "%s : écrite par %s (niveau %s)" % (d["date"], ", ".join(d["modeles"]), d["niveau"])
    except (OSError, IndexError, ValueError):
        pass
    tg = telegram()

    lignes = []
    for job, nom in TACHES.items():
        st, ts = passages.get(job, ("—", ""))
        etat = {"completed": "faite", "failed": "ÉCHEC", "running": "en cours"}.get(st, st)
        lignes.append((nom, ("%s, %s" % (heure(ts), etat)) if ts else "pas encore passée"))
    lignes += [("Modèle principal", modele), ("Relais pris aujourd'hui", str(relais)),
               ("Jetons", total.replace("Total du jour : ", "")),
               ("Dernière réflexion", niveau or "—"), ("Telegram", tg),
               ("Alerte en cours", incident or "aucune")]
    maj = datetime.now(PARIS).strftime("%d/%m/%Y à %H h %M")
    corps = "\n".join("<tr><th>%s</th><td>%s</td></tr>" % (html.escape(a), html.escape(b)) for a, b in lignes)
    det = "\n".join("<li>%s</li>" % html.escape(l) for l in detail[:8])
    page = """<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="300"><title>Hermes</title><style>
body{font-family:Inter,system-ui,sans-serif;background:#0b1220;color:#e8eefc;margin:0;padding:24px}
.carte{max-width:720px;margin:auto;background:#121c33;border:1px solid #24345e;border-radius:14px;padding:22px}
h1{font-size:22px;margin:0 0 4px}p{color:#9fb0d6;margin:0 0 16px;font-size:14px}
table{width:100%%;border-collapse:collapse}th,td{text-align:left;padding:8px 6px;border-bottom:1px solid #22304f;font-size:15px}
th{color:#9fb0d6;font-weight:500;width:42%%}.alerte{color:#ff8a8a}ul{color:#c5d2f0;font-size:13px;padding-left:18px}
</style></head><body><div class="carte"><h1>Hermes</h1><p>Mis à jour le %s (toutes les 10 minutes, sans modèle)</p>
<table>%s</table><h2 style="font-size:15px;margin:18px 0 6px">Jetons du jour par tâche et modèle</h2><ul>%s</ul></div></body></html>
""" % (maj, corps, det)
    os.makedirs(os.path.dirname(CARTE), exist_ok=True)
    with open(CARTE + ".tmp", "w", encoding="utf-8") as f:
        f.write(page)
    os.replace(CARTE + ".tmp", CARTE)
    for p in (CARTE, os.path.dirname(CARTE)):
        os.chown(p, 1000, 1000)

    # Ligne du rapport du matin : une fois par jour, après 5 h 20 UTC.
    maintenant = datetime.now(timezone.utc)
    etat = json.load(open(ETAT)) if os.path.exists(ETAT) else {}
    jour = maintenant.strftime("%Y-%m-%d")
    if maintenant.hour * 60 + maintenant.minute >= 320 and etat.get("ligne") != jour:
        v = dict(lignes)
        texte = "Hermes : veille %s ; réflexion %s ; contrôle %s ; modèle %s, %s relais ; jetons %s ; Telegram %s ; alerte : %s" % (
            v["Veille horaire"], v["Réflexion de nuit"], v["Contrôle du matin"], modele, relais,
            total.replace("Total du jour : ", ""), tg, incident or "aucune")
        esc = texte.replace("'", "''")[:400]
        sh("docker", "exec", "raime-postgres-1", "psql", "-U", "n8n", "-d", "n8n", "-tAc",
           "INSERT INTO gardien_log(severity,rule,detail) VALUES ('info','%s','Bilan quotidien d Hermes (carte : cockpit.raime.fr/livrables/hermes/)')" % esc)
        etat["ligne"] = jour
        with open(ETAT, "w") as f:
            json.dump(etat, f)


if __name__ == "__main__":
    main()
