#!/usr/bin/env python3
"""Continuité entre modèles (16/10/2026), sans modèle : 0 jeton.

Pour chaque réflexion de nuit, inscrit EN TÊTE du fichier le ou les modèles qui l'ont écrite (lus dans
le compteur d'Hermes, cron/usage_audit.jsonl) et leur niveau. Un modèle « faible » = ses conclusions
restent [À VÉRIFIER] jusqu'à confirmation par un fait. Tient aussi un index stable
(atelier/reflexion/index.jsonl) que n'importe quel modèle relit. Cron de l'hôte : 23 h 15 UTC.
"""
import glob
import json
import os
import re

RACINE = "/opt/raime/hermes-data"
AUDIT = RACINE + "/cron/usage_audit.jsonl"
DOSSIER = "/opt/raime/harness/travail/reflexion"
TACHE = "488f5c420810"  # reflexion-de-nuit
# Modèles jugés assez solides pour qu'une conclusion soit appliquée sans revérification.
FIABLES = ("deepseek/deepseek-v4-pro", "gemini-3.8-flash")


def modeles_par_date():
    vus = {}
    try:
        with open(AUDIT, encoding="utf-8") as f:
            for l in f:
                try:
                    e = json.loads(l)
                except ValueError:
                    continue
                if e.get("job_id") == TACHE and e.get("model"):
                    vus.setdefault(e["ts"][:10], {}).setdefault(e["model"], 0)
                    vus[e["ts"][:10]][e["model"]] += int(e.get("total_tokens") or 0)
    except OSError:
        pass
    return vus


def main():
    vus = modeles_par_date()
    index = []
    for chemin in sorted(glob.glob(DOSSIER + "/????-??-??.md")):
        date = os.path.basename(chemin)[:10]
        modeles = vus.get(date, {})
        if not modeles:
            continue
        niveau = "fiable" if all(m in FIABLES for m in modeles) else "faible"
        entete = ("> Écrit par : %s — niveau %s%s\n\n" % (
            ", ".join("%s (%d jetons)" % (m, t) for m, t in modeles.items()), niveau,
            " : conclusions à revérifier par un fait avant toute application" if niveau == "faible" else ""))
        texte = open(chemin, encoding="utf-8").read()
        texte = re.sub(r"\A> Écrit par : .*\n\n", "", texte)
        if not texte.startswith(entete):
            with open(chemin + ".tmp", "w", encoding="utf-8") as f:
                f.write(entete + texte)
            os.chown(chemin + ".tmp", 1000, 1000)
            os.replace(chemin + ".tmp", chemin)
        index.append({"date": date, "fichier": os.path.basename(chemin), "modeles": sorted(modeles), "niveau": niveau})
    with open(DOSSIER + "/index.jsonl", "w", encoding="utf-8") as f:
        for e in index:
            f.write(json.dumps(e, ensure_ascii=False) + "\n")
    os.chown(DOSSIER + "/index.jsonl", 1000, 1000)


if __name__ == "__main__":
    main()
