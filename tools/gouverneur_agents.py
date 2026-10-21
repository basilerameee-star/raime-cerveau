"""Le gouverneur des agents (22/10/2026, revue avec Basile : « repérer les agents en panne et ceux à vide ; ce qui ne sert
plus, on l'arrête »). 0 jeton : il lit l'état que le Cockpit calcule déjà pour chaque fiche (/api/v6), sans rien refaire.

Pour chaque agent en panne ou à vide : depuis quand, la raison, et une proposition. Au-delà de 7 jours en panne, il
propose l'arrêt (jamais seul : l'arrêt reste la décision de Basile). Écrit <travail>/analyse/agents.json et agents.txt ;
hermes_releve.py en reprend une ligne dans l'état commun (etat.txt).
Cron : 25 6 * * * /usr/bin/python3 /opt/raime/raime-brain/tools/gouverneur_agents.py
"""
import datetime
import json
import os
import subprocess
import time

SORTIE = os.environ.get("ANALYSE_DIR", "/opt/raime/harness/travail/analyse")
JOURS_ARRET = 7
SURVEILLES = ("panne", "vide")


def lire_cockpit():
    js = ("fetch('http://127.0.0.1:8090/api/v6').then(r=>r.json()).then(D=>console.log(JSON.stringify((D.agents||[]).map(a=>"
          "({id:a.id,nom:a.nom,secteur:a.secteur,etat:a.etat,depuis:a.depuis,dernier:a.dernier,raison:(a.derniere_panne||{}).texte||a.bloque||'',"
          "mesure:a.mesure||''})))))")
    r = subprocess.run(["docker", "exec", "raime-cockpit-1", "node", "-e", js], capture_output=True, text=True, timeout=120)
    if r.returncode:
        raise RuntimeError(r.stderr[-300:])
    return json.loads(r.stdout)


def jours_depuis(iso, maintenant):
    if not iso:
        return None
    try:
        t = datetime.datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
    except ValueError:
        return None
    return max(0, (maintenant - t).days)


def juger(agents, maintenant):
    """[{nom, etat, jours, raison, proposition}] pour les agents en panne ou à vide (fonction pure)."""
    out = []
    for a in agents:
        if a.get("etat") not in SURVEILLES:
            continue
        j = jours_depuis(a.get("depuis") or a.get("dernier"), maintenant)
        if a.get("secteur") == "serveur":            # l'infrastructure ne s'arrête jamais : on vérifie
            prop = "à vérifier (infrastructure, jamais arrêtée)"
        elif a["etat"] == "panne":
            prop =("proposer l'arrêt à Basile : en panne depuis %d jours" % j if j is not None and j >= JOURS_ARRET
                    else "à réparer : en panne depuis %s" % ("%d jour(s)" % j if j is not None else "une date inconnue"))
        else:
            prop = "tourne sans rien produire : vérifier s'il sert encore"
        out.append({"id": a.get("id"), "nom": a.get("nom"), "secteur": a.get("secteur"), "etat": a["etat"], "jours": j,
                    "raison": (a.get("raison") or a.get("mesure") or "")[:200], "proposition": prop})
    return sorted(out, key=lambda x: (x["etat"] != "panne", -(x["jours"] or 0)))


def texte(liste, total):
    pannes = [x for x in liste if x["etat"] == "panne"]
    vides = [x for x in liste if x["etat"] == "vide"]
    out = ["Gouverneur des agents, %s : %d fiches, %d en panne, %d à vide" % (time.strftime("%Y-%m-%d %H:%M"), total, len(pannes), len(vides))]
    for x in liste:
        out.append("- %s (%s) : %s. %s" % (x["nom"], x["etat"], x["raison"].rstrip("."), x["proposition"]))
    return "\n".join(out)


def ligne_etat(liste):
    """La ligne reprise dans l'état commun : les noms seulement, les plus anciens d'abord."""
    pannes = [x["nom"] for x in liste if x["etat"] == "panne"]
    vides = [x["nom"] for x in liste if x["etat"] == "vide"]
    return "Agents en panne : %s ; à vide : %s" % (", ".join(pannes) or "aucun", ", ".join(vides) or "aucun")


def main():
    agents = lire_cockpit()
    liste = juger(agents, datetime.datetime.now(datetime.timezone.utc))
    os.makedirs(SORTIE, exist_ok=True)
    json.dump({"le": time.strftime("%Y-%m-%d %H:%M"), "fiches": len(agents), "suivis": liste, "ligne": ligne_etat(liste)},
              open(os.path.join(SORTIE, "agents.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    t = texte(liste, len(agents))
    open(os.path.join(SORTIE, "agents.txt"), "w", encoding="utf-8").write(t + "\n")
    print(t, flush=True)


if __name__ == "__main__":
    main()
