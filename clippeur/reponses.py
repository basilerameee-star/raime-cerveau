# -*- coding: utf-8 -*-
"""La réponse de Basile aux campagnes proposées (02/10/2026), toutes les 5 minutes sur le serveur, sans Claude.

Basile répond « 1 », « 2 » ou « 3 » à l'e-mail « [Clips] 3 campagnes proposées » : on lit sa boîte Gmail (IMAP, accès du
coffre ; seuls ses propres messages en réponse à cet e-mail sont lus), on retrouve la campagne du jour, et on lance la
découpe : le brief = la fiche de la campagne (règles, paiement, liens), la source = le 1er lien de vidéo des Reference
materials. Sa réponse vaut accord pour cette campagne. Un e-mail confirme le lancement.
"""
import email
import imaplib
import json
import re
import sys
import unicodedata
from email.header import decode_header

sys.path.insert(0, "/opt/raime/clippeur")
from file import sql, prevenir, COFFRE


def coffre():
    return {l.split("=", 1)[0]: l.split("=", 1)[1].strip().strip('"') for l in open(COFFRE, encoding="utf-8") if "=" in l}


def nom_campagne(s):
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:50]


def texte_du_message(m):
    for part in (m.walk() if m.is_multipart() else [m]):
        if part.get_content_type() == "text/plain":
            corps = part.get_payload(decode=True).decode(part.get_content_charset() or "utf-8", "replace")
            return corps.split("\nLe ")[0].split("\nOn ")[0]          # sans la citation de l'e-mail d'origine
    return ""


def main():
    c = coffre()
    adresse, mdp = c.get("GMAIL_ADRESSE"), c.get("GMAIL_MOT_DE_PASSE_APPLI")
    if not adresse or not mdp:
        return
    sql("CREATE TABLE IF NOT EXISTS reponses_lues (message_id text PRIMARY KEY, lu_le timestamptz NOT NULL DEFAULT now());")
    m = imaplib.IMAP4_SSL("imap.gmail.com", 993)
    m.login(adresse, mdp)
    m.select("INBOX")
    _, ids = m.search(None, '(FROM "%s" SUBJECT "campagnes propos" SINCE "%s")' % (adresse, __import__("time").strftime("%d-%b-%Y")))
    for num in ids[0].split():
        _, data = m.fetch(num, "(RFC822)")
        msg = email.message_from_bytes(data[0][1])
        mid = msg.get("Message-ID", "").strip()
        sujet = "".join(t.decode(e or "utf-8") if isinstance(t, bytes) else t for t, e in decode_header(msg.get("Subject", "")))
        if not mid or not sujet.lower().startswith(("re", "tr", "fw")):
            continue                                       # seulement ses réponses, jamais l'e-mail d'origine
        if sql("SELECT 1 FROM reponses_lues WHERE message_id = :'p0';", mid):
            continue
        sql("INSERT INTO reponses_lues (message_id) VALUES (:'p0') ON CONFLICT DO NOTHING;", mid)
        choix = re.search(r"\b([1-3])\b", texte_du_message(msg))
        if not choix:
            prevenir("réponse non comprise", "Ta réponse ne contient pas de numéro (1, 2 ou 3). Réponds simplement avec le numéro de la campagne.")
            continue
        r = sql("""SELECT coalesce(json_agg(c), '[]') FROM (SELECT id, nom, fiche, videos, url_fiche FROM campagnes_proposees
                   WHERE rang = :p0 ORDER BY le DESC LIMIT 1) c;""", choix.group(1))
        lignes = json.loads(r[r.index("["):] if "[" in r else "[]")
        if not lignes:
            prevenir("campagne introuvable", "Je ne retrouve pas la campagne n°%s des propositions récentes." % choix.group(1))
            continue
        camp = lignes[0]
        videos = json.loads(camp.get("videos") or "[]")
        if not videos:
            prevenir("lien de vidéo introuvable : " + camp["nom"],
                     "La fiche de « %s » ne donne pas de lien de vidéo. Dépose son brief et le lien sur la page Clips." % camp["nom"])
            continue
        nom = nom_campagne(camp["nom"])
        brief = "Campagne Whop : %s\nFiche : %s\n\n%s\n\nLiens des vidéos : %s" % (camp["nom"], camp.get("url_fiche", ""), camp.get("fiche", ""), " ".join(videos))
        sql("INSERT INTO clips_demandes (url, campagne, nombre, consignes) VALUES (:'p0', :'p1', 20, :'p2');", videos[0], nom, brief[:30000])
        sql("UPDATE campagnes_proposees SET lancee = true WHERE id = :p0;", camp["id"])
        prevenir("campagne lancée : " + camp["nom"],
                 "C'est parti pour « %s » (dossier « %s »). La découpe démarre ; tu recevras « clips prêts », puis les liens à "
                 "soumettre dans Whop. Si la campagne demande « Join Campaign », clique-le dans Whop." % (camp["nom"], nom))
    m.logout()


if __name__ == "__main__":
    main()
