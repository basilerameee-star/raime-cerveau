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

# LE FILTRE GARDER / COUPER (Basile, 22/10/2026 : « couper tous les agents qui ne rapportent rien pour le moment », par
# l'analyste, selon des critères précis ; le Médecin applique). Dans l'ordre, le premier critère qui s'applique décide :
#   1. déjà arrêté → rien ; pas encore construit → à construire ;
#   2. la santé du système (serveur, gouvernance, Jarvis, direction) → garder, toujours ;
#   3. il a rapporté de l'argent sur 30 jours (table revenus, par secteur) → garder ;
#   4. il sert une chaîne d'argent en essai (clips, candidatures, sites, prospection, appels, dropshipping) → garder,
#      réparer s'il est en panne, couper s'il est en panne depuis 14 jours ou plus ;
#   5. tout le reste (aucun revenu, aucune chaîne d'argent, pas la santé du système) → couper.
PROTEGES = {"serveur", "gouvernance", "jarvis", "direction"}
CHAINES = {"clipping", "candidatures", "siteweb", "integration", "appels", "dropshipping"}
JOURS_PANNE_CHAINE = 14


def verdict(a, jours, revenus):
    """(verdict, raison) pour une fiche ; revenus = {secteur: euros sur 30 jours}. Fonction pure."""
    secteur, etat, j = a.get("secteur") or "", a.get("etat") or "", jours or 0
    if etat == "arret":
        return "arrete", "déjà arrêté"
    if etat in ("afaire", "construction"):
        return "a_construire", "pas encore construit"
    if secteur in PROTEGES:
        return "garder", "santé du système"
    if revenus.get(secteur, 0) > 0:
        return "garder", "a rapporté %g € sur 30 jours" % revenus[secteur]
    if secteur in CHAINES:
        if etat == "panne" and j >= JOURS_PANNE_CHAINE:
            return "couper", "chaîne d'argent, mais en panne depuis %d jours sans rien rapporter" % j
        if etat == "panne":
            return "reparer", "chaîne d'argent en essai, en panne depuis %d jour(s)" % j
        return "garder", "chaîne d'argent en essai (suivie par la boucle des objectifs)"
    return "couper", "ne rapporte rien et ne sert ni une chaîne d'argent ni la santé du système"


def verdicts(agents, maintenant, revenus):
    out = []
    for a in agents:
        j = jours_depuis(a.get("depuis") or a.get("dernier"), maintenant)
        v, raison = verdict(a, j, revenus)
        out.append({"id": a.get("id"), "nom": a.get("nom"), "secteur": a.get("secteur"), "src": a.get("src") or "",
                    "verdict": v, "raison": raison})
    return out


def revenus_par_secteur():
    """{secteur: euros sur 30 jours} ; la source d'un revenu est rangée sous le secteur qu'elle nomme."""
    try:
        r = subprocess.run(["docker", "exec", "raime-postgres-1", "psql", "-U", "n8n", "-d", "raime_brain", "-tAF", "\t", "-c",
                            "SELECT source, sum(montant_eur) FROM revenus WHERE le > now() - interval '30 days' GROUP BY 1"],
                           capture_output=True, text=True, timeout=60).stdout
    except Exception:
        return {}
    out = {}
    for l in r.splitlines():
        if "\t" in l:
            s, m = l.split("\t")[:2]
            out[s.strip().lower()] = out.get(s.strip().lower(), 0) + float(m or 0)
    return out


def lire_cockpit():
    js = ("fetch('http://127.0.0.1:8090/api/v6').then(r=>r.json()).then(D=>console.log(JSON.stringify((D.agents||[]).map(a=>"
          "({id:a.id,nom:a.nom,secteur:a.secteur,etat:a.etat,depuis:a.depuis,dernier:a.dernier,raison:(a.derniere_panne||{}).texte||a.bloque||'',"
          "mesure:a.mesure||'',src:a.src||''})))))")
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
    if t.tzinfo is None:                          # « 2026-10-22 » : une date seule, comptée en UTC
        t = t.replace(tzinfo=datetime.timezone.utc)
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
    filtre = verdicts(agents, datetime.datetime.now(datetime.timezone.utc), revenus_par_secteur())
    json.dump({"le": time.strftime("%Y-%m-%d %H:%M"), "fiches": len(agents), "suivis": liste, "ligne": ligne_etat(liste),
               "filtre": filtre},
              open(os.path.join(SORTIE, "agents.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    t = texte(liste, len(agents))
    coupes = [x for x in filtre if x["verdict"] == "couper"]
    if coupes:
        t += "\nÀ couper (filtre) : " + " ; ".join("%s (%s)" % (x["nom"], x["raison"]) for x in coupes)
    open(os.path.join(SORTIE, "agents.txt"), "w", encoding="utf-8").write(t + "\n")
    print(t, flush=True)


if __name__ == "__main__":
    main()
