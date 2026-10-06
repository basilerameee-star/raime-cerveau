"""Réponses aux questions Oui/Non des formulaires.

Règle de Basile (02/10/2026) : en cas de doute, « Oui » — il a fait beaucoup de métiers.
Exception : les FAITS vérifiables (langues, nationalité, diplômes, certificats, casier, permis précis…) ne sont
jamais affirmés au hasard : connus → réponse vraie ; inconnus → None (l'offre est abandonnée, rien d'inventé).
"""
import re

# Faits connus (profil confirmé par Basile) — le premier motif qui correspond gagne.
FAITS = [
    (r"\bCFC\b|certificat f[ée]d[ée]ral", "Non"),
    (r"nationalit[ée] suisse|citoyen suisse|passeport suisse", "Non"),
    (r"allemand|german|deutsch|suisse[- ]allemand|schwiizer|italien|italian", "Non"),
    (r"permis de conduire|v[ée]hicule|voiture", "Oui"),
    (r"r[ée]sidez .*(suisse|frontali)|r[ée]gions? frontali|frontalier", "Oui"),
    # aucune expérience professionnelle en Suisse (pas de permis G) : jamais « Oui » à une expérience située en Suisse (06/10/2026)
    (r"exp[ée]rience.{0,120}(en suisse|in der schweiz|switzerland|march[ée] suisse)|(en suisse|switzerland).{0,60}exp[ée]rience", "Non"),
    (r"permis de travail|autorisation de travail|work permit|citoyen.*(ue|union europ)", "Oui"),
    (r"(ma[îi]trise|parlez|niveau|courant).*(fran[çc]ais|anglais|english|french)|bilingue|fran[çc]ais et .*anglais", "Oui"),
    (r"espagnol|spanish", "Oui"),
    (r"formation (initiale )?commerciale|dipl[ôo]me .*(commerce|vente)|bachelor|licence", "Oui"),
    (r"disponib|imm[ée]diat|de suite", "Oui"),
    (r"majeur|18 ans", "Oui"),
]
# Faits vérifiables qu'on ne connaît pas : jamais « Oui » au hasard.
INVERIFIABLES = re.compile(r"dipl[ôo]me|certificat|certification|brevet|AFA\b|f[ée]d[ée]ral|casier|extrait du registre|"
                           r"poursuites|nationalit|langue maternelle|natif|native|langue|permis [A-Z]\b|cariste|"
                           r"master|doctorat|universit", re.I)


def repondre(question):
    q = question.lower()
    for motif, rep in FAITS:
        if re.search(motif, q, re.I):
            return rep
    if INVERIFIABLES.search(q):
        return None
    return "Oui"  # expérience, compétence, savoir-faire : « Oui » par défaut (règle de Basile)
