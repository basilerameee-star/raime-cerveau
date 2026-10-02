# -*- coding: utf-8 -*-
"""Tâche planifiée du PC de Basile (02/10/2026), toutes les 10 minutes, sans Claude :
YouTube bloque l'adresse du serveur ; le PC télécharge donc les vidéos que le serveur attend (clippeur/attente.py)
et les dépose dans sources/<campagne>.mp4. La découpe repart alors seule sur le serveur."""
import json
import os
import subprocess
import tempfile

CLE = os.path.expanduser("~/.ssh/raime_vps")
SERVEUR = "root@2.29.6.94"
DENO = r"C:\Users\Lenovo\AppData\Local\Python\pythoncore-3.14-64\Scripts\deno.exe"
SOURCES = "/opt/raime/harness/travail/clips/sources/"
JOURNAL = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pc_sources.log")
SANS_FENETRE = 0x08000000


def ssh(*cmd):
    return subprocess.run(["ssh", "-i", CLE, "-o", "BatchMode=yes", SERVEUR] + list(cmd), capture_output=True, text=True,
                          timeout=120, creationflags=SANS_FENETRE).stdout


def noter(texte):
    with open(JOURNAL, "a", encoding="utf-8") as f:
        f.write(texte + "\n")


def main():
    attente = json.loads(ssh("python3", "/opt/raime/clippeur/attente.py") or "[]")
    for d in attente:
        dossier = tempfile.mkdtemp()
        sortie = os.path.join(dossier, d["campagne"] + ".mp4")
        r = subprocess.run(["python", "-m", "yt_dlp", "--js-runtimes", "deno:" + DENO.replace("\\", "/"),
                            "-f", "bv*[protocol^=http]+ba/b", "-S", "res,br", "--merge-output-format", "mp4",
                            "-o", sortie, d["url"]], capture_output=True, text=True, timeout=3600, creationflags=SANS_FENETRE)
        if r.returncode or not os.path.isfile(sortie):
            noter("échec %s : %s" % (d["campagne"], (r.stderr or r.stdout)[-300:]))
            continue
        subprocess.run(["scp", "-q", "-i", CLE, sortie, SERVEUR + ":" + SOURCES + d["campagne"] + ".mp4"],
                       timeout=3600, creationflags=SANS_FENETRE)
        os.remove(sortie)
        noter("déposé %s" % d["campagne"])


if __name__ == "__main__":
    main()
