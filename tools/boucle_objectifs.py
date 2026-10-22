"""La boucle des objectifs (22/10/2026, point 61 de la feuille de route). Basile : « objectifs tenus hier 4 sur 7, c'est pas
bon : est-ce que l'information est relayée, et y a-t-il une chaîne logique de recherche de solutions et d'application ? »

Chaque matin après le gouverneur du matin (analyse/matin.json) et le Médecin, pour CHAQUE objectif manqué :
  1. la cause, relevée en code (0 jeton) quand on sait la lire ;
  2. l'action : appliquée seule quand elle est sûre et réversible, sinon confiée à Hermes (ordre « harness », 2 par jour au
     plus, jetons justifiés), sinon remontée à Basile quand elle dépend de lui (compte, clé, paiement) ;
  3. la mesure le lendemain : l'objectif est-il tenu après l'action ? Deux échecs de suite sur le même objectif → Basile.
Et les RÉSULTATS, pas seulement l'activité : clips au-dessus de 1 000 et de 4 000 vues (seuil de paiement de Content Rewards),
candidatures envoyées, euros encaissés sur 30 jours.
Sorties : <travail>/analyse/objectifs.json et .txt, historique dans objectifs_historique.json.
Cron : 40 6 * * * /usr/bin/python3 /opt/raime/raime-brain/tools/boucle_objectifs.py
"""
import json
import os
import re
import subprocess
import sys
import time

TRAVAIL = os.environ.get("TRAVAIL_DIR", "/opt/raime/harness/travail")
ANALYSE = os.path.join(TRAVAIL, "analyse")
CLIPPEUR = os.environ.get("CLIPPEUR_DIR", "/opt/raime/clippeur")
ORDRES_PAR_JOUR = 2
SEUIL_PAIEMENT = 4000


def sh(cmd, timeout=60):
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout).stdout


def psql(requete):
    u = sh(["docker", "exec", "raime-postgres-1", "printenv", "POSTGRES_USER"]).strip() or "n8n"
    return sh(["docker", "exec", "raime-postgres-1", "psql", "-U", u, "-d", "raime_brain", "-tAF", "\t", "-c", requete], timeout=120)


def lire(nom, defaut):
    try:
        return json.load(open(os.path.join(ANALYSE, nom), encoding="utf-8"))
    except (OSError, ValueError):
        return defaut


# ── les remèdes connus : (motif de l'objectif, fonction) ; chaque fonction rend {cause, action, qui} ──────────────────
def r_declares(objectif, detail):
    lignes = psql("SELECT coalesce(left(declare_note, 60), 'pas encore tenté'), count(*) FROM clips_publies "
                  "WHERE publie_le > now() - interval '1 day' AND NOT coalesce(declare_whop, false) GROUP BY 1 ORDER BY 2 DESC")
    causes = "; ".join("%s ×%s" % tuple(l.split("\t")[:2]) for l in lignes.splitlines() if "\t" in l) or "inconnue"
    try:                                               # la liste réelle de Content Rewards corrige les comptes faux tout de suite
        os.remove("/tmp/clippeur-declarer-rattrapage")
    except OSError:
        pass
    return {"cause": "clips non déclarés : " + causes, "qui": "seul",
            "action": "rattrapage forcé de la liste réelle des déclarations ; adhésion automatique aux campagnes en service (22/10)"}


def r_plateforme(objectif, detail):
    m = re.search(r"clips sur (\w+)", objectif)
    pl = m.group(1) if m else ""
    if os.path.exists(os.path.join(CLIPPEUR, "pause-" + pl)):
        return {"cause": "%s en pause (compte banni ou non relié à Buffer)" % pl, "qui": "basile",
                "action": "relier un compte %s à Buffer ; la pause se lève ensuite" % pl}
    attente = psql("SELECT count(*) FROM clips_buffer WHERE plateforme = '%s' AND etat IN ('a_faire', 'programme')" % pl).strip()
    if attente in ("", "0"):
        return {"cause": "aucun clip prêt pour %s (file vide)" % pl, "qui": "seul",
                "action": "le pilote choisit plus de campagnes à la prochaine passe (5 h, 13 h, 21 h UTC)"}
    return {"cause": "%s clips prêts mais pas assez publiés" % attente, "qui": "hermes", "action": None}


def r_jetons(objectif, detail):
    try:
        g = json.load(open("/opt/raime/hermes-data/gouverneur.json", encoding="utf-8"))
    except (OSError, ValueError):
        g = {}
    return {"cause": "consommation d'Hermes : " + detail, "qui": "seul",
            "action": "plafonds du gouverneur des jetons en place (jour %s, ordres %s) : la veille s'arrête au plafond"
                      % (g.get("plafond_jetons_jour", "?"), g.get("plafond_ordres_jour", "?"))}


def r_rebonds(objectif, detail):
    return {"cause": "adresses invalides : " + detail, "qui": "hermes", "action": None}


def r_pannes(objectif, detail):
    return {"cause": "nouvelles pannes : " + detail, "qui": "seul", "action": "confiées au Médecin du système (6 h 35), qui les donne à Hermes"}


REMEDES = [(r"clips déclarés", r_declares), (r"^\d+ clips sur", r_plateforme), (r"jetons", r_jetons), (r"rebonds", r_rebonds),
           (r"nouvel agent en panne", r_pannes)]


def remede(objectif, detail):
    for motif, f in REMEDES:
        if re.search(motif, objectif):
            try:
                return f(objectif, detail)
            except Exception as e:
                return {"cause": "relevé impossible (%s)" % str(e)[:80], "qui": "hermes", "action": None}
    return {"cause": "inconnue", "qui": "hermes", "action": None}


def ordre_hermes(objectif, detail, cause):
    texte = ("Boucle des objectifs — objectif manqué hier : « %s » (%s). Cause relevée : %s.\n"
             "Ta mission : trouve la cause exacte (journaux, base raime_brain, code dans /opt/raime/raime-brain, en lecture), puis "
             "propose UNE action qui fera tenir l'objectif demain : écris-la en 5 lignes dans /travail/analyse/actions/%s.txt "
             "(cause, action, risque, comment la vérifier) et, si c'est du code, le diff et son test dans le même dossier. "
             "Ne livre rien toi-même ; si l'action dépend de Basile (compte, clé, argent), dis-le en une phrase."
             % (objectif, detail, cause, re.sub(r"\W+", "-", objectif.lower()).strip("-")[:50]))
    sortie = psql("INSERT INTO commandes (texte, pour, source) VALUES ('%s', 'harness', 'objectifs') RETURNING id" % texte.replace("'", "''"))
    return (sortie.strip().splitlines() or [""])[0]


def resultats():
    """Les résultats qui comptent pour l'argent (pas l'activité)."""
    r = {}
    l = psql("SELECT count(*) FILTER (WHERE vues >= 1000), count(*) FILTER (WHERE vues >= %d), count(*), coalesce(max(vues), 0), "
             "count(*) FILTER (WHERE statut = 'approved') FROM cr_declarations" % SEUIL_PAIEMENT).strip()
    if l and "\t" in l:
        a, b, n, mx, ap = (int(x or 0) for x in l.split("\t")[:5])
        r["clips"] = {"declares": n, "au_dessus_1000": a, "au_dessus_4000": b, "record": mx, "approuves": ap}
    l = psql("SELECT count(*) FILTER (WHERE maj > now() - interval '1 day'), count(*) FROM candidatures WHERE statut = 'envoye'").strip()
    if l and "\t" in l:
        j, t = (int(x or 0) for x in l.split("\t")[:2])
        r["candidatures"] = {"hier": j, "total": t, "objectif_total": 300}
    l = psql("SELECT coalesce(sum(montant_eur), 0) FROM revenus WHERE le > now() - interval '30 days'").strip()
    try:
        r["euros_30j"] = float(l.splitlines()[0])
    except (ValueError, IndexError):
        pass
    return r


def main():
    os.makedirs(os.path.join(ANALYSE, "actions"), exist_ok=True)
    matin = lire("matin.json", None)
    if not matin:
        print("pas de bilan du gouverneur du matin")
        return
    histo = lire("objectifs_historique.json", {})
    jour = time.strftime("%Y-%m-%d")
    hier = sorted(k for k in histo if k < jour)[-1:] or [None]
    avant = {a["objectif"]: a for a in histo.get(hier[0], {}).get("actions", [])} if hier[0] else {}
    actions, lignes, ordres = [], [], 0
    for o in matin.get("jugement", []):
        if o["tenu"]:
            if o["objectif"] in avant:
                lignes.append("✓ %s : tenu après l'action d'hier (%s)" % (o["objectif"], avant[o["objectif"]].get("action") or "Hermes"))
            continue
        r = remede(o["objectif"], o["detail"])
        r["objectif"], r["detail"] = o["objectif"], o["detail"]
        r["manque_jours"] = avant.get(o["objectif"], {}).get("manque_jours", 0) + 1
        if r["manque_jours"] >= 3 and r["qui"] != "basile":
            r["qui"], r["escalade"] = "basile", "manqué %d jours de suite malgré les actions" % r["manque_jours"]
        if r["qui"] == "hermes" and ordres < ORDRES_PAR_JOUR:
            r["ordre"] = ordre_hermes(o["objectif"], o["detail"], r["cause"])
            r["action"] = r.get("action") or "confié à Hermes (ordre %s)" % r["ordre"]
            ordres += 1
        actions.append(r)
        lignes.append("✕ %s (%s) — cause : %s — action : %s%s" % (o["objectif"], o["detail"], r["cause"], r.get("action") or "à décider",
                      " — À BASILE" if r["qui"] == "basile" else ""))
    res = resultats()
    c = res.get("clips")
    if c:
        lignes.append("Résultat clips : %d déclarés, %d au-dessus de 1 000 vues, %d au-dessus de %d (payables), record %d, %d approuvés."
                      % (c["declares"], c["au_dessus_1000"], c["au_dessus_4000"], SEUIL_PAIEMENT, c["record"], c["approuves"]))
    if res.get("candidatures"):
        lignes.append("Résultat candidatures : %d envoyées hier, %d au total (objectif 300)." % (res["candidatures"]["hier"], res["candidatures"]["total"]))
    if "euros_30j" in res:
        lignes.append("Encaissé sur 30 jours : %d €." % res["euros_30j"])
    sortie = {"le": time.strftime("%Y-%m-%d %H:%M"), "actions": actions, "resultats": res, "lignes": lignes,
              "basile": [a for a in actions if a["qui"] == "basile"]}
    histo[jour] = {"actions": actions, "resultats": res}
    for k in sorted(histo)[:-30]:
        histo.pop(k)
    json.dump(histo, open(os.path.join(ANALYSE, "objectifs_historique.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    json.dump(sortie, open(os.path.join(ANALYSE, "objectifs.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    open(os.path.join(ANALYSE, "objectifs.txt"), "w", encoding="utf-8").write("Boucle des objectifs — " + sortie["le"] + " UTC\n" + "\n".join(lignes) + "\n")
    sys.stdout.buffer.write(("\n".join(lignes) + "\n").encode("utf-8"))   # sûr aussi sur une console qui n'est pas en UTF-8


if __name__ == "__main__":
    main()
