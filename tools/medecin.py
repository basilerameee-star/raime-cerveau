"""Le Médecin du système (22/10/2026). Basile : « que l'intelligence interne fasse ce travail-là et prenne les décisions pour
maintenir constamment la santé, la sécurité et l'efficacité du système ; une fois par jour, vérifier que tout fonctionne, qu'il
n'y ait pas de bugs, trouver les solutions s'il y en a. Les jetons sont justifiés quand une solution est déployée. »

Chaque matin, 0 jeton pour le relevé :
  1. les agents qui ne vont pas (bilan du gouverneur des agents, analyse/agents.json) ;
  2. les erreurs des journaux des tâches planifiées des dernières 24 h, regroupées par signature (fichier + message) ;
  3. la chaîne de l'argent : clips publiés mais jamais déclarés à Content Rewards, candidatures validées en échec ;
  4. la machine : conteneurs arrêtés ou qui redémarrent en boucle, disque, mémoire, charge ;
  5. les fiches du cockpit écrites à la main et plus relues depuis 7 jours.
Ce qu'il fait seul (sûr et réversible) : relancer un conteneur raime-* arrêté, une fois par jour au plus.
Ce qu'il confie à Hermes (jetons justifiés) : chaque NOUVELLE panne (signature jamais vue), 3 par jour au plus, en ordre
« harness » : le dossier de diagnostic et la mission de proposer un correctif testé dans <travail>/sante/correctifs/,
sans rien livrer lui-même (la livraison passe par la porte, banc d'essai au vert). Il peut chercher une solution connue sur
GitHub en lecture seule ; un code trouvé ne s'importe jamais tel quel.
Sorties : <travail>/sante/aujourdhui.json et .txt (lus par le cockpit et l'état commun), vus.json (signatures déjà confiées).
Cron : 35 6 * * * /usr/bin/python3 /opt/raime/raime-brain/tools/medecin.py
"""
import glob
import hashlib
import json
import os
import re
import shutil
import subprocess
import time

TRAVAIL = os.environ.get("TRAVAIL_DIR", "/opt/raime/harness/travail")
SANTE = os.path.join(TRAVAIL, "sante")
JOURNAUX = os.environ.get("JOURNAUX", "/opt/raime/backups/*.log,/opt/raime/clippeur/*.log").split(",")
ORDRES_PAR_JOUR = 3
ERREUR = re.compile(r"Traceback|Error\b|Exception|ERREUR|en échec|échec :|FATAL|panic|refused|Permission denied", re.I)
BRUIT = re.compile(r"^\s*(File \"|\^+|~+|\s*$)")


def sh(cmd, timeout=60):
    r = subprocess.run(cmd, shell=isinstance(cmd, str), capture_output=True, text=True, timeout=timeout)
    return r.stdout


def psql(base, requete):
    u = sh(["docker", "exec", "raime-postgres-1", "printenv", "POSTGRES_USER"]).strip() or "n8n"
    return sh(["docker", "exec", "raime-postgres-1", "psql", "-U", u, "-d", base, "-tAF", "\t", "-c", requete], timeout=120)


def signature(fichier, message):
    """Une panne = un fichier + son message, chiffres et identifiants retirés (la même erreur chaque nuit = une seule panne)."""
    m = re.sub(r"^\d{4}-\d{2}-\d{2}[ t]\d{2}:\d{2}(:\d{2})?\s*", "", message.lower())
    m = re.sub(r"https?://\S+", "<url>", m)
    m = re.sub(r"\b[a-z0-9]+(-[a-z0-9]+){2,}\b", "<nom>", m)          # les noms de campagne, d'offre ou de fichier
    m = re.sub(r"\b[0-9a-f]{8,}\b|\d+", "#", m)
    m = re.sub(r"[\^~]{2,}", "", m).strip()[:160]
    return hashlib.sha1((os.path.basename(fichier) + "|" + m).encode()).hexdigest()[:12]


def erreurs_des_journaux(depuis_s=86400, maintenant=None):
    """[{fichier, signature, message, n, exemple}] pour les lignes d'erreur écrites dans les 24 dernières heures."""
    maintenant = maintenant or time.time()
    groupes = {}
    for motif in JOURNAUX:
        for f in glob.glob(motif.strip()):
            try:
                if maintenant - os.path.getmtime(f) > depuis_s:
                    continue
                with open(f, encoding="utf-8", errors="replace") as fl:
                    lignes = fl.readlines()[-4000:]
            except OSError:
                continue
            jour = time.strftime("%Y-%m-%d", time.localtime(maintenant))
            hier = time.strftime("%Y-%m-%d", time.localtime(maintenant - 86400))
            for i, l in enumerate(lignes):
                if not ERREUR.search(l) or BRUIT.match(l) or l[:1] in (" ", "\t"):   # l'intérieur d'une trace : sa dernière ligne suffit
                    continue
                datee = re.match(r"^(\d{4}-\d{2}-\d{2})", l)
                if datee and datee.group(1) not in (jour, hier):
                    continue
                message = l.strip()
                if message.startswith("Traceback"):          # la dernière ligne de la trace sera comptée, elle
                    continue
                s = signature(f, message)
                g = groupes.setdefault(s, {"fichier": f, "signature": s, "message": message[:300], "n": 0, "exemple": ""})
                g["n"] += 1
                if not g["exemple"]:
                    g["exemple"] = "".join(lignes[max(0, i - 3):i + 12])[-1500:]
    return sorted(groupes.values(), key=lambda g: -g["n"])


def chaine_argent():
    pertes = []
    l = psql("raime_brain", "SELECT campagne, plateforme, lien, left(coalesce(declare_note,''),120) FROM clips_publies "
                            "WHERE publie_le > now() - interval '1 day' AND declare_essais >= 5 AND coalesce(declare_note,'') !~ 'relu dans les déclarations'")
    for ligne in l.splitlines():
        c = ligne.split("\t")
        if len(c) >= 4:
            pertes.append({"quoi": "clip non déclaré à Content Rewards", "campagne": c[0], "plateforme": c[1], "lien": c[2], "raison": c[3]})
    l = psql("raime_brain", "SELECT left(offre->>'titre',60), left(coalesce(envoi->>'detail', note, ''),120) FROM candidatures "
                            "WHERE statut = 'a_toi' AND maj > now() - interval '1 day'")
    for ligne in l.splitlines():
        c = ligne.split("\t")
        if len(c) >= 2:
            pertes.append({"quoi": "candidature validée revenue « à toi »", "titre": c[0], "raison": c[1]})
    return pertes


def machine():
    m = {"conteneurs_arretes": [], "redemarrages": []}
    for ligne in sh(["docker", "ps", "-a", "--format", "{{.Names}}\t{{.Status}}"]).splitlines():
        nom, _, etat = ligne.partition("\t")
        if (etat.startswith("Exited") or etat.startswith("Dead")) and nom not in geles():
            m["conteneurs_arretes"].append({"nom": nom, "etat": etat})
        if "Restarting" in etat:
            m["redemarrages"].append({"nom": nom, "etat": etat})
    du = shutil.disk_usage("/")
    m["disque_pct"] = round(100 * du.used / du.total)
    try:
        m["charge"] = round(os.getloadavg()[1], 1)
        m["coeurs"] = os.cpu_count()
    except OSError:
        pass
    return m


def geles():
    """Les services gelés par Basile (22/10/2026 : trading, voix) : jamais relancés, jamais signalés comme pannes."""
    try:
        return set(json.load(open(os.path.join(SANTE, "geles.json"), encoding="utf-8")).get("conteneurs", []))
    except (OSError, ValueError):
        return set()


def soigner(m, deja):
    """Les remèdes sûrs : relancer un conteneur raime-* arrêté (une fois par jour au plus), sauf s'il est gelé."""
    faits = []
    for c in m["conteneurs_arretes"]:
        if not c["nom"].startswith("raime-") or c["nom"] in deja or c["nom"] in geles():
            continue
        sh(["docker", "start", c["nom"]])
        faits.append("conteneur relancé : " + c["nom"])
    return faits


COUPES_PAR_JOUR = 2


def couper_cron(texte, src, raison, jour):
    """(nouveau texte, nombre de lignes coupées) : les lignes actives du cron qui lancent src passent en commentaire, avec la
    date et la raison (réversible : il suffit d'ôter le commentaire). Fonction pure."""
    nom = os.path.basename(src or "")
    if not nom:
        return texte, 0
    out, n = [], 0
    for l in texte.splitlines():
        if l.strip() and not l.lstrip().startswith("#") and re.search(r"(^|[/\s])" + re.escape(nom) + r"(\s|$)", l):
            out.append("# coupé par le Médecin le %s (%s) : %s" % (jour, raison, l))
            n += 1
        else:
            out.append(l)
    return "\n".join(out) + ("\n" if texte.endswith("\n") else ""), n


def couper(filtre, jour):
    """Les coupes décidées par l'analyste (gouverneur des agents, verdict « couper ») : jamais la santé du système, deux par
    jour au plus, la crontab gardée avant chaque changement. Un agent sans ligne de cron est signalé, pas touché."""
    faites, a_la_main = [], []
    for x in filtre:
        if x.get("verdict") != "couper" or x.get("secteur") in ("serveur", "gouvernance", "jarvis", "direction"):
            continue
        if len(faites) >= COUPES_PAR_JOUR:
            break
        cron = sh(["crontab", "-l"])
        nouveau, n = couper_cron(cron, x.get("src"), "%s : %s" % (x.get("secteur"), x.get("raison")), jour)
        if not n:
            a_la_main.append(x.get("nom"))
            continue
        open("/opt/raime/backups/crontab.avant-coupe-%s" % jour, "w").write(cron)
        subprocess.run(["crontab", "-"], input=nouveau, text=True, timeout=30)
        faites.append("%s coupé (%s)" % (x.get("nom"), x.get("raison")))
    return faites, a_la_main


def ordre_pour_hermes(panne):
    return ("Médecin du système — panne à soigner (signature %s), vue %d fois en 24 h dans %s.\n"
            "Message : %s\nExtrait du journal :\n%s\n\n"
            "Ta mission : 1) trouve la cause (lis le code concerné dans /opt/raime/raime-brain, en lecture) ; 2) si une solution "
            "connue existe, tu peux la chercher sur GitHub ou dans la documentation (lecture seule, jamais de code importé tel quel) ; "
            "3) écris un correctif minimal sous forme de diff dans /travail/sante/correctifs/%s.diff, avec le test qui échoue avant "
            "et passe après ; 4) écris en 5 lignes dans /travail/sante/correctifs/%s.txt : cause, correctif, risque, test. "
            "Ne livre rien toi-même et ne touche à aucun secret ; si la cause est hors de portée du code (compte, clé, paiement), "
            "dis-le en une phrase et arrête-toi."
            % (panne["signature"], panne["n"], panne["fichier"], panne["message"], panne["exemple"][-900:], panne["signature"], panne["signature"]))


def confier(pannes, vus, maintenant):
    confiees = []
    for p in pannes:
        if len(confiees) >= ORDRES_PAR_JOUR:
            break
        if p["signature"] in vus:
            continue
        texte = ordre_pour_hermes(p).replace("'", "''")
        sortie = psql("raime_brain", "INSERT INTO commandes (texte, pour, source) VALUES ('%s', 'harness', 'medecin') RETURNING id" % texte)
        ident = (sortie.strip().splitlines() or [""])[0]
        vus[p["signature"]] = {"le": time.strftime("%Y-%m-%d", time.gmtime(maintenant)), "ordre": ident, "message": p["message"][:160]}
        confiees.append({"signature": p["signature"], "ordre": ident, "message": p["message"][:160]})
    return confiees


SEUIL_DEGEL = 1000   # € encaissés sur 30 jours (note Obsidian « Projets gelés (22-10-2026) »)


def revenus_30j():
    l = psql("raime_brain", "SELECT coalesce(sum(montant_eur), 0) FROM revenus WHERE le > now() - interval '30 days'").strip()
    try:
        return float(l.splitlines()[0])
    except (ValueError, IndexError):
        return None


def bilan(agents, erreurs, pertes, m, remedes, confiees, revenus=None):
    lignes = []
    if revenus is not None and revenus >= SEUIL_DEGEL and geles():
        lignes.append("Revenus suffisants (%d € sur 30 jours) : proposer à Basile de dégeler les projets gelés (trading, voix…)." % revenus)
    mal = [a for a in agents if a.get("etat") in ("panne", "vide")]
    lignes.append("%d agents ne vont pas, %d erreurs différentes dans les journaux, %d pertes sur la chaîne de l'argent."
                  % (len(mal), len(erreurs), len(pertes)))
    for p in pertes[:5]:
        lignes.append("- " + p["quoi"] + " : " + (p.get("lien") or p.get("titre") or "") + " (" + p.get("raison", "")[:80] + ")")
    for e in erreurs[:5]:
        lignes.append("- erreur ×%d dans %s : %s" % (e["n"], os.path.basename(e["fichier"]), e["message"][:120]))
    if m["conteneurs_arretes"]:
        lignes.append("- conteneurs arrêtés : " + ", ".join(c["nom"] for c in m["conteneurs_arretes"]))
    if m.get("disque_pct", 0) >= 85:
        lignes.append("- disque plein à %d %%" % m["disque_pct"])
    for r in remedes:
        lignes.append("- fait seul : " + r)
    for c in confiees:
        lignes.append("- confié à Hermes (ordre %s) : %s" % (c["ordre"], c["message"][:100]))
    return lignes


def main():
    os.makedirs(os.path.join(SANTE, "correctifs"), exist_ok=True)
    maintenant = time.time()
    try:
        agents = json.load(open(os.path.join(TRAVAIL, "analyse", "agents.json"), encoding="utf-8")).get("suivis", [])
    except (OSError, ValueError):
        agents = []
    erreurs = erreurs_des_journaux(maintenant=maintenant)
    pertes = chaine_argent()
    m = machine()
    chemin_vus = os.path.join(SANTE, "vus.json")
    try:
        vus = json.load(open(chemin_vus, encoding="utf-8"))
    except (OSError, ValueError):
        vus = {}
    aujourd = time.strftime("%Y-%m-%d", time.gmtime(maintenant))
    relances = {k for k, v in vus.items() if k.startswith("relance:") and v.get("le") == aujourd}
    remedes = soigner(m, {k.split(":", 1)[1] for k in relances})
    for r in remedes:
        vus["relance:" + r.split(" : ")[-1]] = {"le": aujourd}
    confiees = confier(erreurs, vus, maintenant)
    try:
        filtre = json.load(open(os.path.join(TRAVAIL, "analyse", "agents.json"), encoding="utf-8")).get("filtre", [])
    except (OSError, ValueError):
        filtre = []
    coupes, a_la_main = couper(filtre, aujourd)
    remedes += coupes
    if a_la_main:
        remedes.append("à couper, sans ligne de cron (conteneur ou cockpit) : " + ", ".join(a_la_main))
    json.dump(vus, open(chemin_vus, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    sortie = {"le": time.strftime("%Y-%m-%d %H:%M", time.gmtime(maintenant)), "agents": agents, "erreurs": erreurs[:30],
              "pertes": pertes, "machine": m, "remedes": remedes, "confiees": confiees,
              "revenus_30j": revenus_30j(), "lignes": None}
    sortie["lignes"] = bilan(agents, erreurs, pertes, m, remedes, confiees, sortie["revenus_30j"])
    for x in sortie["erreurs"]:
        x.pop("exemple", None)
    json.dump(sortie, open(os.path.join(SANTE, "aujourdhui.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    open(os.path.join(SANTE, "aujourdhui.txt"), "w", encoding="utf-8").write("Médecin du système — " + sortie["le"] + " UTC\n" + "\n".join(sortie["lignes"]) + "\n")
    print("\n".join(sortie["lignes"]))


if __name__ == "__main__":
    main()
