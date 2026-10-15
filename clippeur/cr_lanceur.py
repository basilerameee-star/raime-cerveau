"""Côté hôte : lance l'agent Content Rewards (cr_agent.py) dans raime-envoyeur, sur l'écran :99 (15/10/2026, accord écrit
de Basile : « l'agent peut rejoindre les campagnes et déclarer mes clips sur Content Rewards avec ma session »).
pilote.py s'en sert pour rejoindre les campagnes, declarer.py pour déclarer les clips. Un seul agent à la fois (verrou) :
le profil Chromium de Basile ne s'ouvre pas deux fois. Rien ne sort du conteneur que les lignes JSON de l'agent."""
import fcntl
import json
import os
import subprocess
import time

ICI = os.path.dirname(os.path.abspath(__file__))
CONTENEUR = "raime-envoyeur"
DONNEES = "/opt/raime/envoyeur-data"                         # /data dans le conteneur
BLOQUE = os.path.join(DONNEES, "cr_bloque")
CONNECTE = os.path.join(DONNEES, "cr_connecte")
VERROU = "/tmp/cr_agent.lock"
ALERTE = os.path.join(ICI, "cr-alerte")                      # la raison déjà signalée à Basile : une seule alerte par blocage
LIEN_CONNEXION = "https://cockpit.raime.fr/navigateur/vnc.html?path=navigateur/websockify&autoconnect=true&resize=scale"


def bloque():
    try:
        return open(BLOQUE, encoding="utf-8").read().strip()
    except OSError:
        return ""


def occupe(maintenant=None):
    """Le profil est ouvert ailleurs (Basile se connecte ou finit son profil sur l'écran) : Chromium y tient SingletonLock.
    Un verrou de plus de 13 heures est un reste de plantage : on l'ignore."""
    lien = os.path.join(DONNEES, "cr_profil", "SingletonLock")
    try:
        return (maintenant or time.time()) - os.lstat(lien).st_mtime < 13 * 3600
    except OSError:
        return False


TEMOIN = os.path.join(ICI, "cr-temoin")                     # l'heure du dernier contrôle d'un blocage


def pret(maintenant=None):
    """L'agent peut-il travailler ? Il faut la connexion de Basile, et aucun blocage. Un blocage est recontrôlé une fois
    par heure au plus (cr_agent.py etat) : il se lève seul quand Basile s'est reconnecté ou a fini son profil."""
    if not os.path.exists(CONNECTE) or occupe():
        return False
    if not bloque():
        return True
    maintenant = maintenant or time.time()
    try:
        if maintenant - os.path.getmtime(TEMOIN) < 3600:
            return False
    except OSError:
        pass
    open(TEMOIN, "w").close()
    lancer("etat", delai=180)
    return not bloque()


def lancer(*args, delai=900):
    """Les réponses JSON de l'agent, une par ligne ; [] si un autre agent tourne déjà."""
    verrou = open(VERROU, "w")
    try:
        fcntl.flock(verrou, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        return []
    subprocess.run(["docker", "cp", os.path.join(ICI, "cr_agent.py"), CONTENEUR + ":/tmp/cr_agent.py"], check=True, capture_output=True)
    r = subprocess.run(["docker", "exec", "-e", "DISPLAY=:99", CONTENEUR, "python", "/tmp/cr_agent.py"] + [str(a) for a in args],
                       capture_output=True, text=True, timeout=delai)
    out = []
    for ligne in r.stdout.splitlines():
        try:
            out.append(json.loads(ligne))
        except ValueError:
            pass
    if not out and r.returncode:
        out.append({"ok": False, "raison": "agent en échec : " + (r.stderr or r.stdout)[-300:].replace("\n", " ")})
    return out


def alerter_si_bloque(prevenir):
    """UNE alerte par blocage (captcha, session expirée) ; la marque s'efface quand le blocage est levé."""
    raison = bloque()
    try:
        deja = open(ALERTE, encoding="utf-8").read().strip()
    except OSError:
        deja = ""
    if not raison:
        if deja:
            os.remove(ALERTE)
        return False
    if raison == deja:
        return False
    prevenir("Content Rewards : agent arrêté", raison + "\n\nPour relancer : ouvre " + LIEN_CONNEXION + " , connecte-toi à "
             "Content Rewards dans la fenêtre affichée, puis ferme l'onglet. Rien d'autre à faire.")
    with open(ALERTE, "w", encoding="utf-8") as f:
        f.write(raison)
    return True
