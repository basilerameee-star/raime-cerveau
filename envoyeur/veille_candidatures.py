# -*- coding: utf-8 -*-
"""La veille du Bureau des candidatures (06/10/2026), toutes les 30 minutes sur le serveur (cron), sans Claude, sans frais.

Quatre jours d'Envoyeur en échec sont passés sans un signal : plus jamais. Un e-mail à Basile (Gmail vers Gmail) quand :
- une candidature validée n'est pas partie 3 heures après (Envoyeur arrêté, file bloquée) ;
- une candidature revient « à toi » (question dont la réponse vraie est inconnue, ou 3 échecs) : avec la raison ;
- l'Envoyeur ne tourne plus, ou aucune offre n'est arrivée depuis 30 heures (collecte en panne) ;
- et deux fois par jour (8 h et 17 h, heure de Paris), les nouvelles offres à valider.
Chaque alerte ne part qu'une fois (table candidatures_alertes).
"""
import json
import subprocess
import sys
import time
from datetime import datetime
from zoneinfo import ZoneInfo

sys.path.insert(0, "/opt/raime/clippeur")
from file import sql, prevenir

PAGE = "https://cockpit.raime.fr/candidatures"


def alerter(cle, sujet, texte):
    """N'envoie qu'une fois par clé."""
    if sql("INSERT INTO candidatures_alertes (cle) VALUES (:'p0') ON CONFLICT DO NOTHING RETURNING 1;", cle):
        prevenir(sujet, texte, prefixe="[Candidatures]", page=PAGE)
        print(time.strftime("%Y-%m-%d %H:%M"), "alerte :", sujet, flush=True)


def lignes(requete):
    r = sql("SELECT coalesce(json_agg(x), '[]') FROM (" + requete + ") x;")
    return json.loads(r[r.index("["):] if "[" in r else "[]")


def main():
    sql("CREATE TABLE IF NOT EXISTS candidatures_alertes (cle text PRIMARY KEY, le timestamptz NOT NULL DEFAULT now());"
        "DELETE FROM candidatures_alertes WHERE le < now() - interval '60 days';")

    bloquees = lignes("SELECT id, offre->>'titre' AS titre, offre->>'entreprise' AS ent FROM candidatures "
                      "WHERE statut = 'valide' AND maj < now() - interval '3 hours' ORDER BY maj")
    if bloquees:
        alerter("bloquees-" + "-".join(sorted(b["id"] for b in bloquees))[:300],
                "%d candidature(s) validée(s) pas encore partie(s)" % len(bloquees),
                "Validées depuis plus de 3 heures et toujours pas envoyées :\n\n"
                + "\n".join("- %s — %s" % (b["titre"], b["ent"]) for b in bloquees)
                + "\n\nL'Envoyeur est peut-être arrêté. Claude regarde à la prochaine session ; rien n'est perdu, elles restent dans la file.")

    for a in lignes("SELECT id, offre->>'titre' AS titre, offre->>'entreprise' AS ent, offre->>'lien' AS lien, envoi->>'detail' AS raison, "
                    "envoi->>'essais' AS essais FROM candidatures WHERE statut = 'a_toi' AND maj > now() - interval '2 days' "
                    "AND envoi ? 'essais'"):          # seulement celles du nouvel Envoyeur (06/10), pas l'ancien stock
        alerter("a_toi-" + a["id"], "à toi : %s — %s" % (a["titre"], a["ent"]),
                "Cette candidature validée n'a pas pu partir seule.\n\nRaison : %s\nEssais : %s\nOffre : %s\n\n"
                "Dans le Bureau, onglet « À toi » : réponds à la question ou postule toi-même, puis « Valider l'envoi » la remet dans la file."
                % (a["raison"] or "inconnue", a["essais"] or "1", a["lien"] or ""))

    marche = subprocess.run(["docker", "inspect", "-f", "{{.State.Running}}", "raime-envoyeur"], capture_output=True, text=True).stdout.strip()
    if marche != "true":
        alerter("envoyeur-arrete-" + time.strftime("%Y-%m-%d"), "l'Envoyeur est arrêté",
                "Le conteneur raime-envoyeur ne tourne pas : aucune candidature validée ne peut partir.")

    if sql("SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM candidatures WHERE cree_le > now() - interval '30 hours');"):
        alerter("sourcing-" + time.strftime("%Y-%m-%d"), "aucune nouvelle offre depuis 30 heures",
                "La collecte des offres semble en panne : rien n'est arrivé dans le Bureau depuis 30 heures.")

    heure = datetime.now(ZoneInfo("Europe/Paris")).hour     # le serveur est en UTC
    if heure in (8, 17):
        nouvelles = lignes("SELECT offre->>'titre' AS titre, offre->>'entreprise' AS ent, offre->>'lieu' AS lieu, fiche->>'avis' AS avis "
                           "FROM candidatures WHERE statut = 'a_valider' AND cree_le > now() - interval '24 hours' "
                           "ORDER BY (fiche->>'avis' = 'postuler') DESC, cree_le DESC")
        total = sql("SELECT count(*) FROM candidatures WHERE statut = 'a_valider';")
        if nouvelles:
            alerter("offres-%s-%d" % (time.strftime("%Y-%m-%d"), heure), "%d nouvelle(s) offre(s) à valider" % len(nouvelles),
                    "Toutes partent seules dès que tu les valides (moins de 15 minutes).\n\n"
                    + "\n".join("- %s%s — %s (%s)" % ("★ " if n["avis"] == "postuler" else "", n["titre"], n["ent"], n["lieu"]) for n in nouvelles[:30])
                    + "\n\n%s offre(s) à valider en tout." % total)


if __name__ == "__main__":
    main()
