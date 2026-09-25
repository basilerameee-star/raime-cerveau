#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""BAC A SABLE — essaie le code des candidats rapatries par l'essayeur (agents/essayeur.js).

Tourne sur l'HOTE (il lance Docker). Chaque candidat est essaye dans un conteneur jetable :
  phase 1, les dependances : reseau ouvert, mais aucun script du candidat ne tourne
           (npm --ignore-scripts ; pip --only-binary, donc aucun setup.py), aucune cle, aucun
           dossier du cerveau, utilisateur sans droits, memoire et duree bornees ;
  phase 2, les tests : AUCUN reseau, systeme en lecture seule (seule la copie jetable s'ecrit), /tmp en memoire, aucune capacite
           systeme, 512 Mo, un processeur, 128 processus, 4 minutes.
Le code du candidat est copie dans un dossier jetable : la quarantaine n'est jamais modifiee.

    python3 tools/bac_a_sable.py essais/<id>
"""
import json
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile
import time

DURCI = ["--rm", "--user", "1000:1000", "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
         "--pids-limit", "128", "-e", "HOME=/tmp", "-e", "CI=1"]


def phase_dependances(image, travail, commande):
    return (["docker", "run", *DURCI, "--memory", "1g", "--cpus", "1", "--network", "bridge",
             "-v", "%s:/code" % travail, "-w", "/code", image, "sh", "-c", commande], 300)


def phase_tests(image, travail, commande):
    return (["docker", "run", *DURCI, "--memory", "512m", "--cpus", "1", "--network", "none", "--read-only",
             "--tmpfs", "/tmp:rw,size=256m", "-v", "%s:/code" % travail, "-w", "/code", image, "sh", "-c", commande], 240)


def lancer(args, delai):
    debut = time.time()
    try:
        r = subprocess.run(args, capture_output=True, text=True, timeout=delai)
        code, sortie = r.returncode, (r.stdout + r.stderr)
    except subprocess.TimeoutExpired as e:
        code, sortie = 124, ((e.stdout or b"").decode("utf8", "replace") if isinstance(e.stdout, bytes) else (e.stdout or "")) + "\n[temps depasse]"
    return code, round(time.time() - debut, 1), "\n".join(sortie.strip().splitlines()[-60:])


def essayer(candidat):
    plan_f = candidat / "plan.json"
    plan = json.loads(plan_f.read_text(encoding="utf-8"))
    if plan.get("bloque") or not plan.get("plan"):
        return None
    p = plan["plan"]
    travail = pathlib.Path(tempfile.mkdtemp(prefix="bac-"))
    try:
        shutil.copytree(candidat / "code", travail, dirs_exist_ok=True, symlinks=True)
        os.chown(travail, 1000, 1000)
        for racine, dossiers, fichiers in os.walk(travail):
            for n in dossiers + fichiers:
                try:
                    os.lchown(os.path.join(racine, n), 1000, 1000)
                except OSError:
                    pass
        code1, d1, s1 = lancer(*phase_dependances(p["image"], travail, p["installer"]))
        if code1 != 0:
            res = {"code": code1, "duree": d1, "phase": "dependances", "sortie": s1}
        else:
            code2, d2, s2 = lancer(*phase_tests(p["image"], travail, p["tester"]))
            res = {"code": code2, "duree": d2, "phase": "tests", "sortie": s2, "duree_dependances": d1}
    finally:
        shutil.rmtree(travail, ignore_errors=True)
    (candidat / "resultat.json").write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
    return res


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    essai = pathlib.Path(sys.argv[1]).resolve()
    for candidat in sorted((essai / "candidats").iterdir()):
        res = essayer(candidat)
        etat = "ecarte avant essai" if res is None else ("REUSSI" if res["code"] == 0 else "echec (%s, code %s)" % (res["phase"], res["code"]))
        print("%-45s %s" % (candidat.name, etat))
    return 0


if __name__ == "__main__":
    sys.exit(main())
