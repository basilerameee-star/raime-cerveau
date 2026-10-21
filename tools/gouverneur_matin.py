"""Le gouverneur du matin (22/10/2026, revue avec Basile) : chaque matin, ce qui était visé hier comparé à ce qui est
arrivé. 0 jeton : des comptes en base, des règles fixes.

Les objectifs tenus ou manqués, pour la veille (jour UTC) :
  - clips : au moins 3 publications par plateforme active (règle de Basile), et chacune déclarée à Content Rewards ;
  - Hermes : sous son plafond de jetons du jour (3 M) et ses ordres sous le leur (1,5 M) ;
  - e-mails : moins de 5 % de rebonds (au-delà, le plafond d'envoi retombe au départ) ;
  - agents : aucun nouvel agent en panne depuis la veille (gouverneur des agents).
Écrit <travail>/analyse/matin.json et matin.txt ; hermes_releve.py en reprend la ligne dans l'état commun.
Cron : 30 6 * * * /usr/bin/python3 /opt/raime/raime-brain/tools/gouverneur_matin.py
"""
import json
import os
import subprocess
import time

SORTIE = os.environ.get("ANALYSE_DIR", "/opt/raime/harness/travail/analyse")
PAUSES = "/opt/raime/clippeur"
OBJECTIFS = {"clips_par_plateforme": 3, "declares": 1.0, "jetons_hermes": 3_000_000, "jetons_ordres": 1_500_000, "rebonds": .05}


def psql(base, requete):
    r = subprocess.run(["docker", "exec", "-i", "raime-postgres-1", "sh", "-c", 'psql -U "$POSTGRES_USER" -d %s -tAq -v ON_ERROR_STOP=1' % base],
                       input=requete, capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(r.stderr[-300:])
    s = r.stdout.strip()
    return json.loads(s[s.index("{"):] if "{" in s else "{}")


def juger(f, actives, hier_pannes=None, pannes=None):
    """[(objectif, tenu ?, détail)] à partir des comptes de la veille (fonction pure)."""
    o = OBJECTIFS
    out = []
    for pl in actives:
        n = (f.get("publies") or {}).get(pl, 0)
        out.append(("%d clips sur %s" % (o["clips_par_plateforme"], pl), n >= o["clips_par_plateforme"], "%d publié(s)" % n))
    pub, dec = f.get("publies_total", 0), f.get("declares", 0)
    out.append(("clips déclarés à Content Rewards", pub == 0 or dec / pub >= o["declares"], "%d sur %d" % (dec, pub)))
    out.append(("Hermes sous 3 M jetons", f.get("jetons", 0) <= o["jetons_hermes"], "%.2f M" % (f.get("jetons", 0) / 1e6)))
    out.append(("ordres sous 1,5 M jetons", f.get("jetons_ordres", 0) <= o["jetons_ordres"], "%.2f M" % (f.get("jetons_ordres", 0) / 1e6)))
    env = f.get("envois", 0)
    reb = f.get("rebonds", 0)
    out.append(("rebonds d'e-mails sous 5 %", env == 0 or reb / env < o["rebonds"], "%d sur %d envois" % (reb, env)))
    if pannes is not None and hier_pannes is not None:
        nouveaux = sorted(set(pannes) - set(hier_pannes))
        out.append(("aucun nouvel agent en panne", not nouveaux, ", ".join(nouveaux) or "aucun"))
    return out


def ligne(jugement):
    manques = [o for o, tenu, d in jugement if not tenu]
    if not manques:
        return "Objectifs d'hier : tous tenus (%d)" % len(jugement)
    return "Objectifs d'hier : %d sur %d tenus ; manqués : %s" % (len(jugement) - len(manques), len(jugement),
                                                                 "; ".join("%s (%s)" % (o, d) for o, tenu, d in jugement if not tenu))


def main():
    brain = psql("raime_brain", """SELECT json_build_object(
        'publies', (SELECT coalesce(json_object_agg(plateforme, n), '{}') FROM (SELECT plateforme, count(*) n FROM clips_publies
                    WHERE publie_le::date = current_date - 1 GROUP BY 1) x),
        'publies_total', (SELECT count(*) FROM clips_publies WHERE publie_le::date = current_date - 1),
        'declares', (SELECT count(*) FROM clips_publies WHERE publie_le::date = current_date - 1 AND coalesce(declare_whop, false)),
        'jetons', (SELECT coalesce(sum(jetons_entree + jetons_sortie), 0) FROM hermes_conso WHERE jour = current_date - 1),
        'jetons_ordres', (SELECT coalesce(sum(jetons_entree + jetons_sortie), 0) FROM hermes_conso WHERE jour = current_date - 1 AND origine = 'api_server'));""")
    n8n = psql("n8n", """SELECT json_build_object(
        'envois', (SELECT count(*) FROM outreach WHERE sent_at::date = current_date - 1) + (SELECT count(*) FROM vitrines_envoi WHERE envoye_le::date = current_date - 1),
        'rebonds', (SELECT count(*) FROM outreach WHERE sent_at::date = current_date - 1 AND to_jsonb(outreach) ->> 'livraison' IN ('bounced', 'complained'))
                 + (SELECT count(*) FROM vitrines_envoi WHERE envoye_le::date = current_date - 1 AND to_jsonb(vitrines_envoi) ->> 'livraison' IN ('bounced', 'complained')));""")
    f = dict(brain, **n8n)
    actives = [pl for pl in ("instagram", "youtube", "tiktok") if not os.path.exists(os.path.join(PAUSES, "pause-" + pl))]
    pannes = hier = None
    try:
        a = json.load(open(os.path.join(SORTIE, "agents.json"), encoding="utf-8"))
        pannes = [x["nom"] for x in a["suivis"] if x["etat"] == "panne"]
        prec = os.path.join(SORTIE, "matin.json")
        hier = json.load(open(prec, encoding="utf-8")).get("pannes") if os.path.exists(prec) else pannes
    except (OSError, ValueError, KeyError):
        pass
    j = juger(f, actives, hier, pannes)
    b = {"le": time.strftime("%Y-%m-%d %H:%M"), "faits": f, "jugement": [{"objectif": o, "tenu": t, "detail": d} for o, t, d in j],
         "pannes": pannes, "ligne": ligne(j)}
    os.makedirs(SORTIE, exist_ok=True)
    json.dump(b, open(os.path.join(SORTIE, "matin.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    t = "\n".join(["Gouverneur du matin, %s" % b["le"]] + ["- %s : %s (%s)" % (o, "tenu" if t else "MANQUÉ", d) for o, t, d in j])
    open(os.path.join(SORTIE, "matin.txt"), "w", encoding="utf-8").write(t + "\n")
    print(t + "\n" + b["ligne"], flush=True)


if __name__ == "__main__":
    main()
