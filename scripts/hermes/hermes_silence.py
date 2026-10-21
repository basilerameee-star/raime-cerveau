#!/usr/bin/env python3
"""Hermes muet ? (15/10/2026) — UNE alerte par incident, jamais en boucle.

Muet = conteneur arrêté, ou battement de la passerelle (state/gateway.heartbeat) vieux de plus de
SEUIL_H heures, ou ses tâches permanentes en échec depuis plus de SEUIL_H heures.
L'alerte suit le chemin du Gardien (gardien_log + strategy_notes → Sentinelle → e-mail).
Fichier d'état : tant qu'il existe, l'incident est déjà signalé ; il disparaît quand Hermes revient
(une ligne « rétabli » est alors notée, sans e-mail d'alerte). Cron de l'hôte : toutes les 30 min.
"""
import os
import subprocess
import time

SEUIL_H = 3
BATTEMENT = "/opt/raime/hermes-data/state/gateway.heartbeat"
ETAT = "/opt/raime/backups/hermes_muet.incident"


def sh(*cmd):
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=90)
    return r.returncode, r.stdout.strip()


def psql(sql):
    return sh("docker", "exec", "raime-postgres-1", "psql", "-U", "n8n", "-d", "n8n", "-tAc", sql)[1]


def esc(s):
    return "'" + str(s).replace("'", "''") + "'"


def note(sev, regle, detail):
    psql("INSERT INTO gardien_log(severity,rule,detail) VALUES (%s,%s,%s)" % (esc(sev), esc(regle), esc(detail[:800])))
    if sev != 'info':  # le retour à la normale est noté, sans e-mail (Basile reçoit déjà trop d'alertes)
        psql("INSERT INTO strategy_notes(agent,kind,content) VALUES ('Gardien','alerte',%s)"
             % esc("[" + sev.upper() + "] " + regle + " -- " + detail[:280]))


def diagnostic():
    code, etat = sh("docker", "inspect", "-f", "{{.State.Running}}", "raime-hermes")
    if code != 0 or etat != "true":
        return "le conteneur raime-hermes est arrêté"
    try:
        age_h = (time.time() - os.path.getmtime(BATTEMENT)) / 3600
    except OSError:
        return "le battement de la passerelle est introuvable"
    if age_h > SEUIL_H:
        return "la passerelle ne bat plus depuis %.1f h" % age_h
    code, runs = sh("docker", "exec", "-u", "1000", "raime-hermes", "hermes", "cron", "runs")
    lignes = [l for l in runs.splitlines() if " job=" in l]
    recents = lignes[-6:]
    if len(recents) >= 3 and all(" failed " in l for l in recents[-3:]):
        return "ses 3 dernières tâches permanentes ont échoué (toute la chaîne de modèles muette ?)"
    return None


def main():
    probleme = diagnostic()
    deja = os.path.exists(ETAT)
    if probleme and not deja:
        note('dur', 'Hermes muet',
             "Hermes ne répond plus : %s. Il tourne seul d'habitude ; voir docker logs raime-hermes et "
             "hermes cron runs. Une seule alerte pour cet incident." % probleme)
        with open(ETAT, "w", encoding="utf-8") as f:
            f.write(time.strftime("%Y-%m-%d %H:%M UTC ", time.gmtime()) + probleme + "\n")
    elif not probleme and deja:
        os.remove(ETAT)
        note('info', 'Hermes rétabli', "Hermes répond de nouveau ; l'incident est clos.")


if __name__ == "__main__":
    main()
