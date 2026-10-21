#!/usr/bin/env python3
"""Relevé de veille pour Hermes (15/10/2026), sans modèle : 0 jeton.

Écrit /opt/raime/harness/travail/veille/releve.txt (vu par Hermes dans /travail/veille/).
Le texte ne contient AUCUNE heure : tant que rien ne change, il reste identique au bit près, et la
veille horaire d'Hermes (--monitor-script) ne réveille pas le modèle. Gouverneur des jetons, étape 1.
Lancé par la crontab de l'hôte toutes les 15 minutes.
"""
import os
import re
import subprocess

SORTIE = "/opt/raime/harness/travail/veille/releve.txt"

REQUETES = [
    ("Ordres en attente", """SELECT 'n° '||id||' ('||pour||', depuis le '||to_char(cree_le,'DD/MM')||') : '||left(regexp_replace(texte,'\\s+',' ','g'),140)
        FROM commandes WHERE etat='a_faire' ORDER BY cree_le"""),
    ("Rappels échus ou du jour", """SELECT 'n° '||id||' (échéance '||to_char(echeance,'DD/MM')||', '||coalesce(priorite::text,'-')||') : '||coalesce(cible_type,'rappel')||' (nom et contact au cockpit : donnée de prospect, jamais envoyée au modèle)'
        FROM rappels WHERE statut='a_faire' AND echeance < (current_date + 1) ORDER BY echeance"""),
    ("Questions ouvertes pour Basile", """SELECT 'n° '||id||CASE WHEN bloquant THEN ' (bloquant)' ELSE '' END||' : '||left(regexp_replace(question,'\\s+',' ','g'),140)
        FROM demandes WHERE etat='ouverte' ORDER BY bloquant DESC, cree_le"""),
    ("Agents en échec (6 dernières heures)", """SELECT agent||' : '||count(*)||' échec(s), statut '||string_agg(DISTINCT status, '/')
        FROM agent_runs WHERE created_at > now()-interval '6 hours' AND status <> 'ok' GROUP BY agent ORDER BY agent"""),
]


def psql(sql):
    r = subprocess.run(["docker", "exec", "-i", "raime-postgres-1", "psql", "-U", "n8n", "-d", "raime_brain", "-tA"],
                       input=sql, capture_output=True, text=True, timeout=60)
    if r.returncode != 0:
        return ["(lecture impossible : " + r.stderr.strip().splitlines()[-1][:120] + ")"] if r.stderr.strip() else ["(lecture impossible)"]
    return [l for l in r.stdout.splitlines() if l.strip()]


def alertes_gardien():
    """Dernières alertes du Gardien, heures retirées (texte stable)."""
    try:
        with open("/opt/raime/backups/gardien.log", encoding="utf-8", errors="replace") as f:
            lignes = f.readlines()[-40:]
    except OSError:
        return []
    vues = []
    for l in lignes:
        if re.search(r"alerte|échec|echec|erreur|panne|down|KO", l, re.I):
            l = re.sub(r"\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(\+\d{2}(:?\d{2})?|Z)?", "", l)
            l = re.sub(r"\b\d{1,2}[:h]\d{2}(:\d{2})?\b", "", l).strip(" -|[]\n")
            if l and l not in vues:
                vues.append(l[:160])
    return vues[-8:]


ETAT_DIR = "/opt/raime/harness/travail/etat"
JOURNAUX_AGENTS = {"Clips : pilote (campagnes, clips prêts)": "/opt/raime/clippeur/pilote.log",
                   "Clips : déclaration Content Rewards": "/opt/raime/clippeur/declarer.log",
                   "Clips : publication Buffer": "/opt/raime/clippeur/buffer.log",
                   "Clips : vérificateur des clips en ligne": "/opt/raime/clippeur/verificateur.log",
                   "Clips : réponses": "/opt/raime/clippeur/reponses.log"}


def derniere_ligne(chemin):
    try:
        with open(chemin, encoding="utf-8", errors="replace") as f:
            lignes = [l.strip() for l in f.readlines()[-30:] if l.strip()]
        return lignes[-1][:260] if lignes else "journal vide"
    except OSError:
        return "pas de journal"
TACHES = {"d2d3f6a80fe1": "veille horaire", "4e2ff4fa79a9": "contrôle du matin",
          "00d533f0a395": "rappels du matin", "488f5c420810": "réflexion de nuit"}


def etat_unique(bruts):
    """Fichier d'état UNIQUE (16/10/2026) : la seule vérité sur le présent, pour Hermes et les autres."""
    import json
    from datetime import datetime
    from zoneinfo import ZoneInfo
    paris = ZoneInfo("Europe/Paris")
    plan = open(ETAT_DIR + "/plan.md", encoding="utf-8").read() if os.path.exists(ETAT_DIR + "/plan.md") else ""
    taches = {}
    try:
        for l in open("/opt/raime/hermes-data/cron/usage_audit.jsonl", encoding="utf-8"):
            e = json.loads(l)
            if e.get("job_id") in TACHES:
                le = datetime.fromisoformat(e["ts"].replace("Z", "+00:00")).astimezone(paris).strftime("%d/%m %H:%M")
                taches[TACHES[e["job_id"]]] = {"le": le, "modele": e.get("model"), "jetons": e.get("total_tokens")}
    except (OSError, ValueError):
        pass
    analyses = lire_analyses()
    inc = "/opt/raime/backups/hermes_muet.incident"
    incident = open(inc).read().strip() if os.path.exists(inc) else ""
    etat = {"releve_le": datetime.now(paris).strftime("%d/%m/%Y %H:%M"), "plan": plan,
            "ordres_ouverts": bruts["Ordres en attente"],
            "rappels_prospects_echus": len(bruts["Rappels échus ou du jour"]),
            "questions_ouvertes": bruts["Questions ouvertes pour Basile"],
            "agents_en_echec": bruts["Agents en échec (6 dernières heures)"],
            "alertes": ([incident] if incident else []) + alertes_gardien(), "taches_hermes": taches,
            "agents": {k: derniere_ligne(v) for k, v in JOURNAUX_AGENTS.items()}, "analyses": analyses}
    os.makedirs(ETAT_DIR, exist_ok=True)
    with open(ETAT_DIR + "/etat.json.tmp", "w", encoding="utf-8") as f:
        json.dump(etat, f, ensure_ascii=False, indent=1)
    os.replace(ETAT_DIR + "/etat.json.tmp", ETAT_DIR + "/etat.json")
    t = ["ÉTAT ACTUEL — relevé le %s (seule vérité sur le présent ; tout autre fichier n'est que de l'historique)" % etat["releve_le"], "",
         "Ordres ouverts : %d" % len(etat["ordres_ouverts"])] + ["- " + o for o in etat["ordres_ouverts"]]
    t += ["Rappels de prospects échus : %d (détail au cockpit)" % etat["rappels_prospects_echus"],
          "Questions ouvertes pour Basile : %d" % len(etat["questions_ouvertes"])] + ["- " + q for q in etat["questions_ouvertes"][:6]]
    t += ["Agents en échec : %s" % (", ".join(etat["agents_en_echec"]) or "aucun")] + analyses + [
          ]
    t += [
          "Alertes : %s" % ("; ".join(etat["alertes"]) or "aucune"),
          "Activité des agents (dernière ligne de leur journal, heure UTC) :"] + [
         "- %s : %s" % (k, derniere_ligne(v)) for k, v in JOURNAUX_AGENTS.items()] + [
         "Dernières tâches d'Hermes : " + ("; ".join("%s le %s (%s)" % (k, v["le"], v["modele"]) for k, v in taches.items()) or "aucune")]
    with open(ETAT_DIR + "/etat.txt.tmp", "w", encoding="utf-8") as f:
        f.write("\n".join(t) + "\n\n" + plan)
    os.replace(ETAT_DIR + "/etat.txt.tmp", ETAT_DIR + "/etat.txt")
    for x in ("etat.json", "etat.txt"):
        os.chown(ETAT_DIR + "/" + x, 1000, 1000)


def lire_analyses(dossier="/opt/raime/harness/travail/analyse", clips="/opt/raime/harness/travail/clips/analyse.json"):
    """22/10/2026 (un seul état) : une ligne par analyste et gouverneur, si leur bilan a moins de 26 h ; sinon rien
    (un bilan périmé ne parle jamais du présent)."""
    import json
    import time as _t
    def frais(f):
        return os.path.exists(f) and _t.time() - os.path.getmtime(f) < 26 * 3600
    out = []
    try:
        if frais(dossier + "/matin.json"):
            out.append(json.load(open(dossier + "/matin.json", encoding="utf-8"))["ligne"])
        if frais(dossier + "/agents.json"):
            out.append(json.load(open(dossier + "/agents.json", encoding="utf-8"))["ligne"])
        if frais(clips):
            c = json.load(open(clips, encoding="utf-8"))
            ig = next((g for g in c.get("par_plateforme", []) if g["valeur"] == "instagram"), None)
            out.append("Clips : %d suivis%s ; créneaux par niche : %s" % (c.get("clips_suivis", 0),
                       ", Instagram %d vues en médiane, record %d" % (ig["vues_mediane"] or 0, ig["meilleur"]) if ig else "",
                       ", ".join("%s %d %%" % (k, round(100 * v)) for k, v in (c.get("repartition") or {}).items()) or "—"))
        if frais(dossier + "/prospection.json"):
            pr = json.load(open(dossier + "/prospection.json", encoding="utf-8"))
            e, a = pr["email"], pr["appels"]
            out.append("Prospection : %d e-mails, %d réponse(s) ; %d appels joints, %d intéressé(s), %d gagné(s)"
                       % (e["envoyes"], e["reponses"], a["joints"], a["interesses"], a["gagnes"]))
    except (OSError, ValueError, KeyError, TypeError):
        out.append("Analyses : lecture en échec")
    return out


def main():
    blocs = []
    bruts = {}
    for titre, sql in REQUETES:
        lignes = psql(sql)
        bruts[titre] = lignes
        blocs.append(f"## {titre} : {len(lignes)}\n" + ("\n".join("- " + l for l in lignes) if lignes else "- rien"))
    g = alertes_gardien()
    blocs.append(f"## Alertes du Gardien (dernières lignes) : {len(g)}\n" + ("\n".join("- " + l for l in g) if g else "- rien"))
    etat_unique(bruts)
    texte = "# Relevé de veille (sans heure : il ne change que si les faits changent)\n\n" + "\n\n".join(blocs) + "\n"
    os.makedirs(os.path.dirname(SORTIE), exist_ok=True)
    ancien = open(SORTIE, encoding="utf-8").read() if os.path.exists(SORTIE) else None
    if texte != ancien:
        tmp = SORTIE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(texte)
        os.replace(tmp, SORTIE)
        os.chown(SORTIE, 1000, 1000)
        os.chown(os.path.dirname(SORTIE), 1000, 1000)


if __name__ == "__main__":
    main()
