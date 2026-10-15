#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""LE RELEVÉ DU SERVEUR (14/10/2026), pour le cockpit v6 (jarvis/v6.cjs).

Le conteneur du cockpit ne voit que jarvis/ : ni les journaux des tâches planifiées (sauvegardes, clippeur, candidatures,
Gardien), ni le journal de la porte, ni l'état des conteneurs. Toutes les 10 minutes (cron de l'hôte), ce script les lit, en
lecture seule, et écrit UNE ligne dans raime_brain.releve_hote ; le cockpit la lit avec son heure, et un relevé de plus de
30 minutes n'y décide plus de rien. Aucun secret : les lignes sont tronquées, ce qui ressemble à une clé est masqué.

usage : python3 tools/releve_hote.py [--essai]     (--essai : affiche le relevé sans rien écrire)
cron  : */10 * * * * /usr/bin/python3 /opt/raime/raime-brain/tools/releve_hote.py >> /opt/raime/backups/releve_hote.log 2>&1
"""
import base64
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone

JOURNAUX = {
    "backup": "/opt/raime/backups/backup.log",
    "offsite": "/opt/raime/backups/offsite.log",
    "restauration": "/opt/raime/backups/restauration.log",
    "isolation": "/opt/raime/backups/isolation.log",
    "gardien": "/opt/raime/backups/gardien.log",
    "veille_candidatures": "/opt/raime/backups/veille_candidatures.log",
    "postuler_email": "/opt/raime/backups/postuler_email.log",
    "workflows": "/opt/raime/backups/workflows-git.log",
    "inventaire": "/opt/raime/backups/inventaire.log",
    "chercheur": "/opt/raime/clippeur/chercheur.log",
    "buffer": "/opt/raime/clippeur/buffer.log",
    "file": "/opt/raime/clippeur/file.log",
    "reponses": "/opt/raime/clippeur/reponses.log",
    "verificateur": "/opt/raime/clippeur/verificateur.log",
}
PORTE = "/opt/raime/porte/journal.log"
COURANTE = "/opt/raime/porte/courante"
SECRET = re.compile(r"(sk-[A-Za-z0-9_-]{8,}|\bre_[A-Za-z0-9_]{12,}|gh[pousr]_[A-Za-z0-9]{12,}|github_pat_\w+|\$2[aby]\$\S+|"
                    r"(?:key|token|secret|password|passwd|mot_de_passe|jeton|authorization)\s*[=:]\s*\S+)", re.I)
UTILE = re.compile(r"déploiement de [0-9a-f]{12,40} demandé|EN SERVICE :|\bRETOUR\b|ÉCHEC|ECHEC|REFUS")


def propre(ligne, n=220):
    return SECRET.sub("[masqué]", ligne.strip())[:n]


def iso(t):
    return datetime.fromtimestamp(t, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def fin(chemin, n=3):
    """Les n dernières lignes non vides, lues depuis la fin (un journal peut être gros)."""
    with open(chemin, "rb") as f:
        f.seek(0, 2)
        f.seek(max(0, f.tell() - 16384))
        lignes = f.read().decode("utf-8", "replace").splitlines()
    return [propre(l) for l in lignes if l.strip()][-n:]


def journaux():
    sortie = {}
    for cle, chemin in JOURNAUX.items():
        try:
            sortie[cle] = {"modifie": iso(os.path.getmtime(chemin)), "fin": fin(chemin)}
        except OSError:
            sortie[cle] = None
    return sortie


def porte():
    try:
        lignes = open(PORTE, encoding="utf-8", errors="replace").read().splitlines()
    except OSError:
        return None
    service = [l for l in lignes if "EN SERVICE :" in l]
    echecs = [l for l in lignes if re.search(r"\bRETOUR\b|ÉCHEC|ECHEC|REFUS", l) and "[web]" not in l]
    try:
        courante = open(COURANTE, encoding="utf-8").read().strip()
    except OSError:
        courante = None
    return {"en_service": len(service), "echecs": len(echecs), "premier": service[0].split()[0] if service else None,
            "courante": courante, "lignes": [propre(l, 260) for l in lignes if UTILE.search(l)][-120:]}


def conteneurs():
    r = subprocess.run(["docker", "ps", "-a", "--format", "{{.Names}}\t{{.Status}}"], capture_output=True, text=True, timeout=30)
    if r.returncode:
        return None
    return [{"nom": n, "etat": e} for n, e in (l.split("\t", 1) for l in r.stdout.splitlines() if "\t" in l)]


def ecrire(donnees):
    b = base64.b64encode(json.dumps(donnees, ensure_ascii=False).encode("utf-8")).decode("ascii")
    requete = ("CREATE TABLE IF NOT EXISTS releve_hote (id bigserial PRIMARY KEY, le timestamptz NOT NULL DEFAULT now(), donnees jsonb NOT NULL);\n"
               "INSERT INTO releve_hote (donnees) VALUES (convert_from(decode(:'b', 'base64'), 'UTF8')::jsonb);\n"
               "DELETE FROM releve_hote WHERE le < now() - interval '2 days';\n")
    r = subprocess.run(["docker", "exec", "-i", "raime-postgres-1", "psql", "-U", "n8n", "-d", "raime_brain", "-q", "-v", "ON_ERROR_STOP=1", "-v", "b=" + b],
                       input=requete, capture_output=True, text=True, timeout=60)
    if r.returncode:
        raise RuntimeError(r.stderr.strip()[-400:])


def main():
    d = {"journaux": journaux(), "porte": porte(), "conteneurs": conteneurs()}
    if "--essai" in sys.argv:
        print(json.dumps(d, ensure_ascii=False, indent=1))
        return
    ecrire(d)
    lus = sum(1 for v in d["journaux"].values() if v)
    print(datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), f"relevé : {lus} journaux, "
          f"{len((d['porte'] or {}).get('lignes', []))} lignes de la porte, {len(d['conteneurs'] or [])} conteneurs", flush=True)


if __name__ == "__main__":
    main()
