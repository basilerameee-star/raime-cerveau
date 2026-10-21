#!/usr/bin/env python3
"""Bilan de qualité des relais gratuits d'Hermes (16/10/2026), sans modèle : 0 jeton. Cron 5 h 30 UTC.

Sur les 3 derniers jours : par modèle, appels réussis, échecs et relais (table hermes_conso) ; par nuit,
le modèle de la réflexion et ce qu'en a dit le contrôle du matin (CONFIRMÉE / INFIRMÉE / EN ATTENTE).
Écrit /opt/raime/harness/travail/hermes/bilan-relais.txt (lu par Claude pour le bilan à Basile,
et visible dans le cockpit : /livrables/hermes/bilan-relais.txt).
"""
import glob
import json
import os
import re
import subprocess

T = "/opt/raime/harness/travail"
SORTIE = T + "/hermes/bilan-relais.txt"


def psql(sql):
    return subprocess.run(["docker", "exec", "raime-postgres-1", "psql", "-U", "n8n", "-d", "raime_brain", "-tA", "-F", "|",
                           "-c", sql], capture_output=True, text=True, timeout=60).stdout.strip()


def main():
    lignes = ["Bilan des relais d'Hermes — 3 derniers jours (UTC)", "",
              "Par modèle : appels réussis / échecs (taux de réussite) / relais pris / jetons"]
    for l in psql("SELECT modele, sum(appels), sum(echecs), sum(relais), sum(jetons_entree+jetons_sortie) FROM hermes_conso "
                  "WHERE jour > current_date - 3 GROUP BY 1 ORDER BY 5 DESC").splitlines():
        m, a, e, r, j = l.split("|")
        a, e = int(a), int(e)
        taux = 100 * a / (a + e) if a + e else 0
        lignes.append("- %s : %d / %d (%d %%) / %s relais / %s jetons" % (m, a, e, taux, r, j))
    lignes += ["", "Par nuit : modèle de la réflexion et verdict du contrôle du matin"]
    niveaux = {}
    try:
        for l in open(T + "/reflexion/index.jsonl", encoding="utf-8"):
            d = json.loads(l)
            niveaux[d["date"]] = "%s (%s)" % (", ".join(d["modeles"]), d["niveau"])
    except (OSError, ValueError):
        pass
    for f in sorted(glob.glob(T + "/reflexion/controle-*.md"))[-3:]:
        txt = open(f, encoding="utf-8").read()
        c = {k: len(re.findall(r"\[%s\]" % k, txt)) for k in ("CONFIRMÉE", "INFIRMÉE", "EN ATTENTE")}
        date = os.path.basename(f)[9:19]
        lignes.append("- contrôle du %s : %d confirmées, %d infirmées, %d en attente — réflexion de la veille : %s" % (
            date, c["CONFIRMÉE"], c["INFIRMÉE"], c["EN ATTENTE"], niveaux.get(sorted(niveaux)[-1] if niveaux else "", "?")))
    os.makedirs(os.path.dirname(SORTIE), exist_ok=True)
    with open(SORTIE, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lignes) + "\n")
    os.chown(SORTIE, 1000, 1000)


if __name__ == "__main__":
    main()
