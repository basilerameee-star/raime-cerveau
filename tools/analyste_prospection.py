"""L'analyste général, module prospection (21/10/2026, demande de Basile : un analyste pour toute l'équipe, pôle par pôle).
Même principe que l'analyste des clips (clippeur/analyste.py) : 0 jeton, du code qui compte et compare.

L'entonnoir de chaque circuit, par métier :
  - pré-audits (n8n.outreach) : envoyés → livrés → rebonds → réponses → appels notés → intéressés ;
  - maquettes (raime_brain.vitrines) : envoyées → réponses → « pas intéressé » → clients ;
  - appels (raime_brain.appels et rappels) : joints, « pas intéressé », intéressés, gagnés.
Écrit <travail>/analyse/prospection.json et prospection.txt ; un métier n'est jugé qu'à partir de 10 envois.
Cron : 20 6 * * * /usr/bin/python3 /opt/raime/raime-brain/tools/analyste_prospection.py
"""
import json
import os
import subprocess
import time

SORTIE = os.environ.get("ANALYSE_DIR", "/opt/raime/harness/travail/analyse")
MINI = 10


def psql(base, requete):
    r = subprocess.run(["docker", "exec", "-i", "raime-postgres-1", "sh", "-c", 'psql -U "$POSTGRES_USER" -d %s -tAq -v ON_ERROR_STOP=1' % base],
                       input=requete, capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(r.stderr[-300:])
    s = r.stdout.strip()
    return json.loads(s[s.index("["):] if "[" in s else "[]")


def taux(a, b):
    return round(a / b, 3) if b else None


def entonnoir_preaudits(lignes, appels):
    """lignes : [{segment, siren, envoye, livre, rebond, reponse}] ; appels : {siren: etat}."""
    par = {}
    for l in lignes:
        g = par.setdefault(l["segment"] or "inconnu", {"envoyes": 0, "livres": 0, "rebonds": 0, "reponses": 0, "appeles": 0, "interesses": 0})
        g["envoyes"] += l["envoye"]; g["livres"] += l["livre"]; g["rebonds"] += l["rebond"]; g["reponses"] += l["reponse"]
        e = appels.get(l["siren"])
        if e:
            g["appeles"] += 1
            g["interesses"] += e == "interesse"
    out = []
    for seg, g in par.items():
        if not g["envoyes"]:
            continue
        out.append(dict(g, metier=seg, taux_reponse=taux(g["reponses"], g["envoyes"]), taux_rebond=taux(g["rebonds"], g["envoyes"]),
                        juge=g["envoyes"] >= MINI))
    return sorted(out, key=lambda g: (-(g["taux_reponse"] or 0), -g["envoyes"]))


def entonnoir_vitrines(lignes):
    """lignes : [{metier, statut, envoye}]."""
    par = {}
    for l in lignes:
        g = par.setdefault(l["metier"] or "commerce", {"envoyes": 0, "reponses": 0, "non": 0, "clients": 0})
        g["envoyes"] += l["envoye"]
        g["reponses"] += l["statut"] in ("repondu", "pas_interesse", "client")
        g["non"] += l["statut"] == "pas_interesse"
        g["clients"] += l["statut"] == "client"
    out = [dict(g, metier=m, taux_reponse=taux(g["reponses"], g["envoyes"]), juge=g["envoyes"] >= MINI) for m, g in par.items() if g["envoyes"]]
    return sorted(out, key=lambda g: (-(g["taux_reponse"] or 0), -g["envoyes"]))


def bilan_appels(etats, resultats):
    """etats : états de la table appels ; resultats : résultats notés des rappels."""
    joints = sum(e in ("appele", "pas_interesse") for e in etats) + sum(r in ("interesse", "pas_interesse", "gagne") for r in resultats)
    return {"notes": len(etats) + len([r for r in resultats if r]), "joints": joints,
            "pas_interesses": etats.count("pas_interesse") + resultats.count("pas_interesse"),
            "interesses": resultats.count("interesse"), "gagnes": resultats.count("gagne"),
            "a_rappeler": etats.count("plus_tard") + resultats.count("rappeler")}


def texte(b):
    def ligne(g, champs):
        return "  %-26s " % g["metier"][:26] + " · ".join(champs(g)) + ("" if g["juge"] else " (trop peu pour juger)")
    out = ["Analyste prospection, %s" % b["le"], "Pré-audits par métier :"]
    out += [ligne(g, lambda g: ["%d envoyés" % g["envoyes"], "%d rebonds" % g["rebonds"], "%d réponse(s)" % g["reponses"],
                                "%d appelés" % g["appeles"], "%d intéressé(s)" % g["interesses"]]) for g in b["preaudits"]]
    out.append("Maquettes par métier :")
    out += [ligne(g, lambda g: ["%d envoyées" % g["envoyes"], "%d réponse(s)" % g["reponses"], "%d non" % g["non"], "%d client(s)" % g["clients"]])
            for g in b["vitrines"]]
    a = b["appels"]
    out.append("Appels : %d notés, %d joints, %d pas intéressés, %d intéressé(s), %d gagné(s), %d à rappeler"
               % (a["notes"], a["joints"], a["pas_interesses"], a["interesses"], a["gagnes"], a["a_rappeler"]))
    e = b["email"]
    out.append("E-mail : %d envoyés, %d réponse(s) (%s) ; téléphone : %d joints, %d intéressé(s)"
               % (e["envoyes"], e["reponses"], "%.1f %%" % (100 * e["taux"]) if e["taux"] is not None else "—", a["joints"], a["interesses"]))
    return "\n".join(out)


def main():
    pre = psql("n8n", """SELECT coalesce(json_agg(x), '[]') FROM (SELECT segment, siren, (status = 'envoye')::int AS envoye,
          coalesce(to_jsonb(o) ->> 'livraison' = 'delivered', false)::int AS livre,
          coalesce(to_jsonb(o) ->> 'livraison' IN ('bounced', 'complained'), false)::int AS rebond,
          (reply_at IS NOT NULL)::int AS reponse FROM outreach o WHERE status IN ('envoye', 'non_recu') OR reply_at IS NOT NULL) x;""")
    appels = psql("raime_brain", "SELECT coalesce(json_agg(x), '[]') FROM (SELECT siren, etat FROM appels) x;")
    rappels = psql("raime_brain", """SELECT coalesce(json_agg(x), '[]') FROM (SELECT cible_type, cible_id, resultat FROM rappels
          WHERE statut = 'fait' AND resultat IS NOT NULL) x;""")
    vit = psql("raime_brain", """SELECT coalesce(json_agg(x), '[]') FROM (SELECT metier, statut, (envoye_le IS NOT NULL)::int AS envoye
          FROM vitrines WHERE envoye_le IS NOT NULL OR statut IN ('repondu', 'pas_interesse', 'client')) x;""")
    etat_appel = {a["siren"]: a["etat"] for a in appels}
    for r in rappels:                                          # un résultat noté au téléphone l'emporte sur l'état d'appel
        if r["cible_type"] == "prospect" and r["resultat"] in ("interesse", "pas_interesse", "gagne"):
            etat_appel[r["cible_id"]] = r["resultat"]
    envoyes = sum(l["envoye"] for l in pre)
    b = {"le": time.strftime("%Y-%m-%d %H:%M"), "preaudits": entonnoir_preaudits(pre, etat_appel), "vitrines": entonnoir_vitrines(vit),
         "appels": bilan_appels([a["etat"] for a in appels], [r["resultat"] for r in rappels]),
         "email": {"envoyes": envoyes + sum(l["envoye"] for l in vit),
                   "reponses": sum(l["reponse"] for l in pre) + sum(l["statut"] in ("repondu", "pas_interesse", "client") for l in vit)}}
    b["email"]["taux"] = taux(b["email"]["reponses"], b["email"]["envoyes"])
    os.makedirs(SORTIE, exist_ok=True)
    json.dump(b, open(os.path.join(SORTIE, "prospection.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    t = texte(b)
    open(os.path.join(SORTIE, "prospection.txt"), "w", encoding="utf-8").write(t + "\n")
    print(t, flush=True)


if __name__ == "__main__":
    main()
