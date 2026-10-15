#!/usr/bin/env python3
# Pose dans n8n l'envoi seul et la Sentinelle du 14/10/2026 (accord de Basile : « oui, pose et ouvre l'envoi seul »), sur le
# serveur, après la livraison du dépôt :
#   ① la base n8n : n8n/envois.sql (colonnes de Resend, vues des e-mails prêts, plafond du jour qui monte), puis les maximums
#      choisis le 14/10 : 30 pré-audits et 20 vitrines par jour (seulement s'ils valent encore 18 et 10, jamais un choix plus récent) ;
#   ② « Expéditeur · Envoi emails (gated) » et « Vitrines · Envoi des maquettes » : nœuds et liens de n8n/expediteur_envoi.json
#      et n8n/vitrines_envoi.json (un e-mail toutes les 0,7 s, chacun marqué selon la réponse de Resend) ;
#   ③ « Sentinelle · Surveillance & alerte » : n8n/sentinelle_diagnostic.sql (+ la clause des clips) et n8n/sentinelle_formate.js.
# Sauvegarde d'abord chaque version (/opt/raime/backups/<workflow>-<table>.avant-envois-AAAA-MM-JJ.json), écrit la table des
# workflows ET la version en service (n8n 2.x : activeVersionId), puis relance n8n, qui ne relit un workflow planifié qu'à
# son démarrage. Se rejoue sans dommage.
# Usage : python3 /opt/raime/raime-brain/n8n/poser_envois.py [--essai]   (--essai : dit ce qui changerait, n'écrit rien)
import json
import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from poser_veilleurs import CLAUSE, ICI, lire, psql  # noqa: E402

ESSAI = "--essai" in sys.argv
JOUR = time.strftime("%Y-%m-%d")
MAXIMUMS = ("UPDATE send_config SET daily_cap = 30 WHERE id = 1 AND daily_cap = 18;\n"
            "UPDATE vitrines_envoi_config SET plafond_jour = 20 WHERE id = 1 AND plafond_jour = 10;\n")


def requete_sentinelle():
    """Le Diagnostic posé : le fichier sans ses commentaires, sur une ligne, la clause des clips avant le « ) x » final."""
    base = " ".join(l.strip() for l in lire("sentinelle_diagnostic.sql").splitlines() if l.strip() and not l.strip().startswith("--"))
    assert base.endswith(") x"), "sentinelle_diagnostic.sql doit finir par « ) x »"
    return base[:-len(") x")].rstrip() + CLAUSE + " ) x"


def flux(fichier, anciens):
    """Remplace nœuds et liens par ceux du dépôt ; refuse d'écraser un workflow qui n'est ni l'ancien ni le nouveau."""
    with open(os.path.join(ICI, fichier), encoding="utf-8") as f:
        neuf = json.load(f)
    noms = {n["name"] for n in neuf["nodes"]}

    def faire(nodes, connections):
        if nodes == neuf["nodes"] and connections == neuf["connections"]:
            return None
        presents = {n.get("name") for n in nodes}
        assert presents <= (anciens | noms), "%s : nœuds inattendus %s, rien n'est écrasé" % (fichier, sorted(presents - anciens - noms))
        return neuf["nodes"], neuf["connections"]
    return faire


def sentinelle(nodes, connections):
    q, code = requete_sentinelle(), lire("sentinelle_formate.js").rstrip("\n")
    diag = next(x for x in nodes if x.get("name") == "Diagnostic")
    form = next(x for x in nodes if x.get("name") == "Formate alerte")
    if diag["parameters"]["query"] == q and form["parameters"]["jsCode"] == code:
        return None
    assert "Fureteur" in diag["parameters"]["query"] or "envoi_preaudits" in diag["parameters"]["query"], \
        "Diagnostic : version inattendue, rien n'est écrasé"
    diag["parameters"]["query"] = q
    form["parameters"]["jsCode"] = code
    return nodes, connections


TRAVAUX = (
    ("expediteurEnv001", flux("expediteur_envoi.json", {"Chaque jour 08h", "A la demande", "Lire config", "A envoyer", "Prepare",
                                                       "Resend envoie", "Marque envoye", "Ecrit statut"})),
    ("vitrinesEnvoi01", flux("vitrines_envoi.json", set())),
    ("sentinelleMon01", sentinelle),
)


def base():
    # ① le schéma et les maximums : dans une transaction, annulée en essai (tout est vérifié, rien ne reste)
    psql(None, "BEGIN;\n" + lire("envois.sql") + "\n" + MAXIMUMS + ("ROLLBACK;\n" if ESSAI else "COMMIT;\n"))
    print("base n8n : envois.sql et maximums %s" % ("vérifiés (annulés)" if ESSAI else "posés"))


def poser():
    base()
    change = False
    for wf, faire in TRAVAUX:
        version = psql('select "activeVersionId" from workflow_entity where id=\'%s\'' % wf).strip()
        assert version, wf + " : aucune version en service"
        for table, cle, val in (("workflow_entity", "id", wf), ("workflow_history", '"versionId"', version)):
            brut = psql("select json_build_object('nodes', nodes, 'connections', connections) from %s where %s='%s'" % (table, cle, val)).strip()
            avant = json.loads(brut)
            res = faire(json.loads(json.dumps(avant["nodes"])), avant["connections"])
            if res is None:
                print("%s / %s : déjà à jour" % (wf, table))
                continue
            if ESSAI:
                print("%s / %s : serait mis à jour" % (wf, table))
                continue
            sauvegarde = "/opt/raime/backups/%s-%s.avant-envois-%s.json" % (wf, table, JOUR)
            if not os.path.exists(sauvegarde):                 # la première sauvegarde du jour est la bonne
                with open(sauvegarde, "w", encoding="utf-8") as f:
                    f.write(brut)
            nodes, connections = (json.dumps(x, ensure_ascii=False) for x in res)
            assert "$wf$" not in nodes + connections
            psql(None, "UPDATE %s SET nodes = $wf$%s$wf$::json, connections = $wf$%s$wf$::json WHERE %s = '%s';"
                 % (table, nodes, connections, cle, val))
            print("%s / %s : mis à jour (sauvegarde : %s)" % (wf, table, sauvegarde))
            change = True
    if change:
        subprocess.run(["docker", "restart", "raime-n8n-1"], check=True, capture_output=True)
        print("n8n relancé")


if __name__ == "__main__":
    poser()
