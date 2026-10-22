"""Candidature simplifiée LinkedIn (« Easy Apply ») — 22/10/2026.

Basile (22/10) : « Je veux qu'on le fasse quand même. C'est pas grave si c'est bloqué, tant pis. » Il sait que LinkedIn
interdit l'automatisation et peut restreindre son compte ; il a choisi de prendre ce risque.
Garde-fous : sa propre session seulement (il se connecte une fois dans le navigateur du serveur, serveur.py connexion) ;
jamais de mot de passe tapé ; un captcha ou une vérification de sécurité arrêtent tout (« captcha ») ; peu d'envois par jour
(LINKEDIN_PAR_JOUR, 8 par défaut) et 3 à 6 minutes entre deux, pour rester proche d'un usage humain.
Une offre sans candidature simplifiée renvoie vers le site de l'employeur : elle passe au canal formulaire (sans compte).
Les étapes du formulaire sont celles de formulaire.etapes (le moteur honnête de Michael Page : une question sans réponse
vraie dans la fiche du candidat revient à Basile).
"""
import os
import re
import time
from pathlib import Path

import formulaire
from jobcloud import AToi

SIMPLIFIEE = re.compile(r"^\s*(candidature simplifi[ée]e|easy apply|einfach bewerben)\b", re.I)
EXTERNE = re.compile(r"^\s*(postuler|apply|bewerben)\s*$", re.I)
SECURITE = re.compile(r"v[ée]rification de s[ée]curit[ée]|security verification|let.s do a quick security check|"
                      r"nous voulons nous assurer qu.il s.agit bien de vous|unusual activity|activit[ée] inhabituelle", re.I)
PAR_JOUR = int(os.environ.get("LINKEDIN_PAR_JOUR", "8"))
COMPTEUR = Path(os.environ.get("DONNEES", "/data")) / "linkedin_envois.txt"


def envois_du_jour():
    jour = time.strftime("%Y-%m-%d")
    try:
        return sum(1 for l in COMPTEUR.read_text().splitlines() if l.startswith(jour))
    except FileNotFoundError:
        return 0


def postuler(page, f, dos, p, envoyer=True, journal=None, captures=None):
    dire = journal or formulaire._dire
    if envoyer and envois_du_jour() >= PAR_JOUR:
        raise AToi("trop_de_requetes", "plafond LinkedIn du jour atteint (%d)" % PAR_JOUR)
    oid = re.sub(r"[^\w.-]", "_", str(f.get("id") or "offre"))
    dos = Path(dos)
    cv, lettre_pdf = dos / "CV_Basile_Rame.pdf", dos / "Lettre_Basile_Rame.pdf"
    if captures is None and not envoyer:
        captures = Path(os.environ.get("DONNEES", "/data")) / "echecs"
    photos = []

    def photo(pg, nom):
        if not captures:
            return
        try:
            Path(captures).mkdir(parents=True, exist_ok=True)
            chemin = Path(captures) / ("%s-essai-%d-%s.png" % (oid, len(photos) + 1, re.sub(r"[^\w-]", "_", nom)))
            pg.screenshot(path=str(chemin), full_page=False)
            photos.append(str(chemin))
        except Exception as e:
            dire("  capture impossible : %s" % e)

    lien = re.sub(r"^https?://[a-z]{2}\.linkedin\.com", "https://www.linkedin.com", f.get("lien") or "")
    rep = page.goto(lien, wait_until="domcontentloaded")
    page.wait_for_timeout(4000)
    if re.search(r"/login|/authwall|/checkpoint|/uas/", page.url):
        raise AToi("reconnexion", "linkedin")
    texte = formulaire.corps(page.main_frame)
    if SECURITE.search(texte[:4000]):
        raise AToi("captcha", "vérification de sécurité LinkedIn")
    formulaire.captcha(page)
    if re.search(r"n.accepte plus les candidatures|no longer accepting applications|offre (a )?expir", texte, re.I) or (rep and rep.status in (404, 410)):
        raise AToi("expiree", "l'offre n'accepte plus de candidatures")
    if re.search(r"candidature envoy[ée]e|applied \d|vous avez postul[ée]|you applied", texte[:6000], re.I):
        return {"deja": True, "url": page.url}
    bouton = page.get_by_role("button", name=SIMPLIFIEE)
    if not bouton.count():
        externe = page.get_by_role("button", name=EXTERNE).or_(page.get_by_role("link", name=EXTERNE))
        if externe.count():
            raise AToi("formulaire", "pas de candidature simplifiée : l'offre renvoie au site de l'employeur")
        raise AToi("formulaire", "bouton « Candidature simplifiée » introuvable")
    bouton.first.click()
    page.wait_for_timeout(2500)
    if SECURITE.search(formulaire.corps(page.main_frame)[:4000]):
        raise AToi("captcha", "vérification de sécurité LinkedIn")
    out = formulaire.etapes(page, f, p, cv, lettre_pdf, envoyer, dire, photo, photos, oid, exiger_cv=False, nom="linkedin", garder=True)
    if envoyer and out.get("envoye"):
        with COMPTEUR.open("a") as fl:
            fl.write(time.strftime("%Y-%m-%d %H:%M ") + oid + "\n")
    return out
