#!/usr/bin/env python3
# Pose dans n8n les deux nœuds des veilleurs (08/10/2026), sur le serveur, après la livraison du dépôt :
#   ① « Héraut · Rapport quotidien », nœud « Format email » : le code de n8n/heraut_format_email.js (ordres en retard en rouge) ;
#   ② « Sentinelle · Surveillance & alerte », nœud « Diagnostic » : la clause de n8n/sentinelle_clips.sql (clips disparus).
# Sauvegarde d'abord chaque version (/opt/raime/backups/<workflow>-<table>.avant-AAAA-MM-JJ.json), ne s'applique qu'une
# fois, écrit la table des workflows ET la version en service (n8n 2.x : activeVersionId), puis relance n8n, qui ne
# relit un workflow planifié qu'à son démarrage.
# Usage : python3 /opt/raime/raime-brain/n8n/poser_veilleurs.py [--essai]   (--essai : dit ce qui changerait, n'écrit rien)
import json
import os
import subprocess
import sys
import time

ICI = os.path.dirname(os.path.abspath(__file__))
ESSAI = "--essai" in sys.argv
JOUR = time.strftime("%Y-%m-%d")


def psql(sql, entree=None):
    p = subprocess.run(["docker", "exec", "-i", "raime-postgres-1", "psql", "-U", "n8n", "-d", "n8n", "-At", "-v", "ON_ERROR_STOP=1"]
                       + ([] if entree else ["-c", sql]), input=entree, capture_output=True, text=True)
    if p.returncode:
        sys.exit("psql : " + p.stderr.strip()[:300])
    return p.stdout


def lire(nom):
    with open(os.path.join(ICI, nom), encoding="utf-8") as f:
        return f.read().replace("\r\n", "\n")


CODE = lire("heraut_format_email.js").rstrip("\n")
# L'espace de tête compte : sans lui, la requête devenait « GROUP BY w.nameUNION ALL » (posé ainsi le 14/10/2026, réparé
# avant le passage suivant de la Sentinelle ; tests/banc/verificateur_clips_test.py le tient).
CLAUSE = " " + " ".join(l.strip() for l in lire("sentinelle_clips.sql").splitlines() if l.strip() and not l.strip().startswith("--"))


def heraut(nodes):
    n = next(x for x in nodes if x.get("name") == "Format email")
    code = n["parameters"]["jsCode"]
    if code == CODE:
        return False
    # La version attendue : celle du 08/10 (sans rouge). Autre chose : quelqu'un l'a changée, on ne l'écrase pas.
    assert "refait le 08/10/2026" in code and "ROUGE" not in code, "Format email : version inattendue, rien n'est écrasé"
    n["parameters"]["jsCode"] = CODE
    return True


def sentinelle(nodes):
    n = next(x for x in nodes if x.get("name") == "Diagnostic")
    q = n["parameters"]["query"]
    if CLAUSE in q:
        return False
    assert "Clips disparus" not in q and q.rstrip().endswith(") x"), "Diagnostic : version inattendue, rien n'est écrasé"
    n["parameters"]["query"] = q.rstrip()[:-len(") x")].rstrip() + CLAUSE + " ) x"
    return True


def poser():
    change = False
    for wf, faire in (("heraut00000001", heraut), ("sentinelleMon01", sentinelle)):
        version = psql('select "activeVersionId" from workflow_entity where id=\'%s\'' % wf).strip()
        assert version, wf + " : aucune version en service"
        for table, cle, val in (("workflow_entity", "id", wf), ("workflow_history", '"versionId"', version)):
            brut = psql("select nodes from %s where %s='%s'" % (table, cle, val)).strip()
            nodes = json.loads(brut)
            if not faire(nodes):
                print("%s / %s : déjà à jour" % (wf, table))
                continue
            if ESSAI:
                print("%s / %s : serait mis à jour" % (wf, table))
                continue
            sauvegarde = "/opt/raime/backups/%s-%s.avant-%s.json" % (wf, table, JOUR)
            if not os.path.exists(sauvegarde):                 # la première sauvegarde du jour est la bonne
                with open(sauvegarde, "w", encoding="utf-8") as f:
                    f.write(brut)
            texte = json.dumps(nodes, ensure_ascii=False)
            assert "$wf$" not in texte
            psql(None, "UPDATE %s SET nodes = $wf$%s$wf$::json WHERE %s = '%s';" % (table, texte, cle, val))
            print("%s / %s : mis à jour (sauvegarde : %s)" % (wf, table, sauvegarde))
            change = True
    if change:
        subprocess.run(["docker", "restart", "raime-n8n-1"], check=True, capture_output=True)
        print("n8n relancé")


if __name__ == "__main__":
    poser()
