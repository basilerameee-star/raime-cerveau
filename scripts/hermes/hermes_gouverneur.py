#!/usr/bin/env python3
"""Gouverneur des jetons d'Hermes (16/10/2026), sans modèle : 0 jeton. Cron de l'hôte, toutes les 10 min.

1. COMPTE : lit le journal d'Hermes (logs/agent.log*) et range, par jour, origine et modèle, les appels,
   les jetons (entrée, sortie, cache), les échecs et les relais pris → table hermes_conso (raime_brain).
2. PLAFOND : réglages dans hermes-data/gouverneur.json. À 80 % du plafond du jour : une ligne pour Basile
   (une fois par jour). À 100 % : REPLI LOCAL — la veille horaire passe sur le modèle local du serveur
   jusqu'à minuit UTC ; elle revient d'elle-même le lendemain. Rappels, réflexion et Telegram continuent.
3. RÉSUMÉ : atelier/gouverneur/aujourdhui.txt (lu par Hermes, le rapport du matin et le cockpit).
"""
import glob
import json
import os
import re
import subprocess
import time

H = "/opt/raime/hermes-data"
REGLAGES = H + "/gouverneur.json"
ETAT = H + "/gouverneur.etat.json"
RESUME = "/opt/raime/harness/travail/gouverneur/aujourdhui.txt"
POUR_BASILE = "/opt/raime/harness/travail/veille/pour-basile.md"
VEILLE = "d2d3f6a80fe1"
OUTILS = {"veille-horaire": ["file", "memory", "terminal"], "rappels-du-matin": ["file", "memory"],
          "reflexion-de-nuit": ["file", "memory", "session_search"], "controle-du-matin": ["file"]}
DEFAUT = {"plafond_jetons_jour": 3000000, "seuil_avertissement": 0.8,
          "repli_modele": "qwen3:4b", "repli_fournisseur": "local"}
NOMS = {"4e2ff4fa79a9": "controle-du-matin", "d2d3f6a80fe1": "veille-horaire", "00d533f0a395": "rappels-du-matin", "488f5c420810": "reflexion-de-nuit"}

APPEL = re.compile(r"^(\d{4}-\d{2}-\d{2}) [\d:,]+ INFO \[([^\]]+)\] agent\.conversation_loop: API call #\d+: "
                   r"model=(\S+) provider=\S+ in=(\d+) out=(\d+) total=\d+")
CACHE = re.compile(r"cache=(\d+)/")
TOUR = re.compile(r"conversation turn: session=(\S+) .*platform=(\S+)")
ECHEC = re.compile(r"^(\d{4}-\d{2}-\d{2}) .*\[([^\]]+)\].*API call failed.*model=(\S+)")
RELAIS = re.compile(r"^(\d{4}-\d{2}-\d{2}) .*\[([^\]]+)\].*Fallback activated: (\S+) → (\S+)")


def psql(sql):
    r = subprocess.run(["docker", "exec", "-i", "raime-postgres-1", "psql", "-U", "n8n", "-d", "raime_brain",
                        "-v", "ON_ERROR_STOP=1", "-tA"], input=sql, capture_output=True, text=True, timeout=60)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip()[-300:])
    return r.stdout.strip()


def esc(s):
    return "'" + str(s).replace("'", "''") + "'"


def origine(session, plateformes):
    if session.startswith("cron_"):
        return NOMS.get(session.split("_")[1], "tâche " + session.split("_")[1])
    return plateformes.get(session, "autre")


def compter(jours):
    lignes = []
    for f in sorted(glob.glob(H + "/logs/agent.log*"), reverse=True):
        if re.search(r"\.\d+$", f) and os.path.getmtime(f) < time.time() - 3 * 86400:
            continue
        with open(f, encoding="utf-8", errors="replace") as fh:
            lignes += [l for l in fh if l[:10] in jours]
    plateformes = {m.group(1): m.group(2) for l in lignes for m in [TOUR.search(l)] if m}
    agg = {}

    def case(j, sess, mod):
        return agg.setdefault((j, origine(sess, plateformes), mod),
                              {"appels": 0, "entree": 0, "sortie": 0, "cache": 0, "echecs": 0, "relais": 0})
    for l in lignes:
        m = APPEL.search(l)
        if m:
            c = case(m.group(1), m.group(2), m.group(3))
            c["appels"] += 1
            c["entree"] += int(m.group(4))
            c["sortie"] += int(m.group(5))
            k = CACHE.search(l)
            c["cache"] += int(k.group(1)) if k else 0
            continue
        m = ECHEC.search(l)
        if m:
            case(m.group(1), m.group(2), m.group(3))["echecs"] += 1
            continue
        m = RELAIS.search(l)
        if m:
            case(m.group(1), m.group(2), m.group(4))["relais"] += 1
    return agg


def enregistrer(agg, jours):
    sql = ["CREATE TABLE IF NOT EXISTS hermes_conso (jour date, origine text, modele text, appels int, "
           "jetons_entree bigint, jetons_sortie bigint, jetons_cache bigint, echecs int, relais int, "
           "maj_le timestamptz DEFAULT now(), PRIMARY KEY (jour, origine, modele));",
           "BEGIN;", "DELETE FROM hermes_conso WHERE jour IN (%s);" % ",".join(esc(j) for j in jours)]
    for (j, o, mod), c in agg.items():
        sql.append("INSERT INTO hermes_conso VALUES (%s,%s,%s,%d,%d,%d,%d,%d,%d,now());" % (
            esc(j), esc(o), esc(mod), c["appels"], c["entree"], c["sortie"], c["cache"], c["echecs"], c["relais"]))
    sql.append("COMMIT;")
    psql("\n".join(sql))


def hermes(*args):
    return subprocess.run(["docker", "exec", "-u", "1000", "raime-hermes", "hermes", "cron"] + list(args),
                          capture_output=True, text=True, timeout=120).returncode


def remettre_outils():
    p = H + "/cron/jobs.json"
    d = json.load(open(p))
    for j in (d["jobs"] if isinstance(d, dict) and "jobs" in d else d):
        if j.get("name") in OUTILS:
            j["enabled_toolsets"] = OUTILS[j["name"]]
    mode = os.stat(p).st_mode & 0o777
    with open(p + ".tmp", "w") as f:
        json.dump(d, f, ensure_ascii=False, indent=2)
    os.chown(p + ".tmp", 1000, 1000)
    os.chmod(p + ".tmp", mode)
    os.replace(p + ".tmp", p)


def noter_pour_basile(texte):
    with open(POUR_BASILE, "a", encoding="utf-8") as f:
        f.write("- %s (gouverneur) : %s\n" % (time.strftime("%d/%m %H:%M UTC", time.gmtime()), texte))


def main():
    reg = dict(DEFAUT)
    if os.path.exists(REGLAGES):
        reg.update(json.load(open(REGLAGES)))
    else:
        with open(REGLAGES, "w") as f:
            json.dump(DEFAUT, f, indent=2)
        os.chown(REGLAGES, 1000, 1000)
    aujourd = time.strftime("%Y-%m-%d", time.gmtime())
    hier = time.strftime("%Y-%m-%d", time.gmtime(time.time() - 86400))
    agg = compter({aujourd, hier})
    enregistrer(agg, [hier, aujourd])

    etat = json.load(open(ETAT)) if os.path.exists(ETAT) else {}
    pause_ordres = "/opt/raime/harness/travail/gouverneur/ordres-en-pause"   # lu par le relais du Cockpit (jarvis/relais.cjs)
    if etat.get("jour") != aujourd and os.path.exists(pause_ordres):
        os.remove(pause_ordres)        # nouveau jour : les ordres repartent
    if etat.get("jour") != aujourd:  # nouveau jour : on lève le repli d'hier
        if etat.get("repli"):
            hermes("resume", VEILLE)   # 21/10/2026 : la veille reprend ; plus de modèle local (il prenait 4 cœurs)
            remettre_outils()
        etat = {"jour": aujourd, "averti": False, "repli": False}

    du_jour = {k: v for k, v in agg.items() if k[0] == aujourd}
    total = sum(c["entree"] + c["sortie"] for c in du_jour.values())
    plafond = int(reg["plafond_jetons_jour"])
    part = total / plafond if plafond else 0
    if part >= reg["seuil_avertissement"] and not etat["averti"]:
        noter_pour_basile("%d %% du plafond de jetons du jour atteint (%d sur %d)." % (part * 100, total, plafond))
        etat["averti"] = True
    if part >= 1 and not etat["repli"]:
        # 21/10/2026 : au plafond, la veille horaire se met en PAUSE jusqu'à minuit UTC (le relevé de l'hôte, 0 jeton,
        # continue) ; avant, elle passait sur qwen3:4b local, qui prenait 4 cœurs sur 8 pour 0,65 mot par seconde
        if hermes("pause", VEILLE) == 0:
            remettre_outils()
            etat["repli"] = True
            noter_pour_basile("plafond atteint : la veille horaire est en pause jusqu'à minuit UTC.")

    # 21/10/2026 : un plafond par origine pour les ordres du Cockpit (api_server : 40 M jetons sur 61 en 7 jours) ;
    # au-delà, le relais n'envoie plus rien à Hermes jusqu'à minuit UTC (l'ordre attend, rien n'est perdu)
    ordres = sum(c["entree"] + c["sortie"] for (j, o, mod), c in du_jour.items() if o == "api_server")
    plafond_ordres = int(reg.get("plafond_ordres_jour", 1500000))
    if ordres >= plafond_ordres and not os.path.exists(pause_ordres):
        with open(pause_ordres, "w") as f:
            f.write("plafond des ordres atteint : %d jetons sur %d (%s UTC)\n" % (ordres, plafond_ordres, time.strftime("%H:%M", time.gmtime())))
        os.chown(pause_ordres, 1000, 1000)
        noter_pour_basile("plafond des ordres atteint (%d jetons) : les ordres attendent minuit UTC." % ordres)
    lignes = ["Gouverneur des jetons — %s (UTC)" % aujourd,
              "Total du jour : %d jetons sur %d (%d %%)%s" % (total, plafond, part * 100,
                                                             " — veille EN PAUSE (plafond)" if etat["repli"] else "")]
    for (j, o, mod), c in sorted(du_jour.items(), key=lambda kv: -(kv[1]["entree"] + kv[1]["sortie"])):
        lignes.append("- %s / %s : %d appels, %d jetons (dont %d en cache), %d échecs, %d relais" % (
            o, mod, c["appels"], c["entree"] + c["sortie"], c["cache"], c["echecs"], c["relais"]))
    os.makedirs(os.path.dirname(RESUME), exist_ok=True)
    with open(RESUME, "w", encoding="utf-8") as f:
        f.write("\n".join(lignes) + "\n")
    os.chown(RESUME, 1000, 1000)
    with open(ETAT, "w") as f:
        json.dump(etat, f)


if __name__ == "__main__":
    main()
