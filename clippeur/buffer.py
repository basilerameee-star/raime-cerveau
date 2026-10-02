# -*- coding: utf-8 -*-
"""Le relais Buffer (02/10/2026) : programme sur les comptes KinGKlip les clips que Basile a validés sur /clips.

Basile clique « Programmer » sur un clip : le cockpit inscrit une ligne par plateforme dans clips_buffer, avec son
créneau (heure du soir à New York). Ce script, lancé par cron toutes les 2 minutes sur le serveur :
  1. donne à Buffer le lien signé du clip (7 jours, /pubclip/ du cockpit, hors mot de passe : accord de Basile du 02/10/2026) ;
     les liens signés R2 ne conviennent pas (Buffer vérifie le fichier par une requête HEAD, que R2 refuse) ;
  2. crée la publication programmée dans Buffer (clé BUFFER_API_KEY du coffre, jamais affichée) ;
  3. une fois la publication partie, note son lien dans clips_publies (à déclarer à Whop).
Sans Claude, sans frais. Chaque ligne vient d'un clic de Basile : le clic vaut accord, clip par clip.
"""
import fcntl
import hashlib
import hmac
import time
import json
import os
import urllib.request

from file import sql, CLIPS, COFFRE, prevenir

VERROU = "/tmp/clippeur-buffer.lock"
SERVICES = {"youtube": "youtube", "tiktok": "tiktok", "instagram": "instagram"}


def cle():
    for ligne in open(COFFRE, encoding="utf-8"):
        if ligne.startswith("BUFFER_API_KEY="):
            return ligne.split("=", 1)[1].strip().strip('"')
    return ""


def buffer(requete, variables=None):
    k = cle()
    req = urllib.request.Request("https://api.buffer.com", data=json.dumps({"query": requete, "variables": variables or {}}).encode(),
                                 headers={"Content-Type": "application/json", "Authorization": "Bearer " + k})
    d = json.loads(urllib.request.urlopen(req, timeout=60).read().decode())
    if d.get("errors"):
        raise RuntimeError(json.dumps(d["errors"])[:300].replace(k, "***"))
    return d["data"]


def chaines():
    """Les chaînes branchées dans Buffer, par service (youtube, tiktok, instagram)."""
    orgs = buffer("{ account { organizations { id } } }")["account"]["organizations"]
    out = {}
    for o in orgs:
        for c in buffer("query($i: ChannelsInput!) { channels(input: $i) { id service } }", {"i": {"organizationId": o["id"]}})["channels"]:
            out.setdefault(str(c["service"]).lower(), c["id"])
    return out


def lignes(etat):
    r = sql("SELECT coalesce(json_agg(b), '[]') FROM (SELECT * FROM clips_buffer WHERE etat = :'p0' AND (etat <> 'a_faire' OR quand <= now()) ORDER BY quand LIMIT 20) b;", etat)
    return json.loads(r[r.index("["):] if "[" in r else "[]")      # json_agg s'étale sur plusieurs lignes


def legendes(campagne, clip):
    base = os.path.join(CLIPS, campagne, clip[:-4])
    try:
        leg = json.load(open(base + ".json", encoding="utf-8"))
    except (OSError, ValueError):
        leg = {}
    try:
        info = next(c for c in json.load(open(os.path.join(CLIPS, campagne, "clips.json"), encoding="utf-8"))["clips"] if c["clip"] == clip)
    except (OSError, ValueError, StopIteration):
        info = {}
    texte = open(base + ".txt", encoding="utf-8").read() if os.path.isfile(base + ".txt") else ""
    return leg, info.get("titre", ""), texte


def lien_public(campagne, clip, duree=7 * 86400):
    """Le même lien signé que le cockpit (jarvis/clips.cjs, clé CLIPS_SIGNATURE du coffre) : 7 jours, fichiers des clips seulement."""
    cle_sig = next((l.split("=", 1)[1].strip().strip('"') for l in open(COFFRE, encoding="utf-8") if l.startswith("CLIPS_SIGNATURE=")), "")
    if not cle_sig:
        raise RuntimeError("CLIPS_SIGNATURE absente du coffre : ouvrir une fois la page Clips")
    exp = int(time.time()) + duree
    sig = hmac.new(cle_sig.encode(), ("%d/%s/%s" % (exp, campagne, clip)).encode(), hashlib.sha256).hexdigest()[:32]
    return "https://cockpit.raime.fr/pubclip/%d/%s/%s/%s" % (exp, sig, campagne, clip)


class FileBufferPleine(Exception):
    """La file Buffer de la chaîne est pleine (offre gratuite) : on réessaiera plus tard, sans échec."""


def programmer(b, ids):
    camp, clip, pl = b["campagne"], b["clip"], b["plateforme"]
    if pl not in ids:
        raise RuntimeError("Chaîne %s absente de Buffer : la brancher dans Buffer." % pl)
    url = b.get("url") or lien_public(camp, clip)
    leg, titre, texte = legendes(camp, clip)
    meta = {"youtube": {"youtube": {"title": (titre or "N3on R3born")[:100], "privacy": "public", "madeForKids": False,
                                    "notifySubscribers": True, "categoryId": "24"}},
            "tiktok": {"tiktok": {"title": titre[:90]}},
            "instagram": {"instagram": {"type": "reel", "shouldShareToFeed": True}}}[pl]
    entree = {"channelId": ids[pl], "text": (leg.get(pl) or texte)[:2200], "mode": "addToQueue",          # les créneaux réglés par Basile dans Buffer (4 par jour et par chaîne)
              "schedulingType": "automatic", "needsApproval": False, "assets": [{"video": {"url": url}}], "metadata": meta}
    d = buffer("""mutation($e: CreatePostInput!) { createPost(input: $e) {
        ... on PostActionSuccess { post { id } } ... on MutationError { message } } }""", {"e": entree})["createPost"]
    if not d.get("post"):
        msg = d.get("message") or "Buffer a refusé la publication"
        if "limit" in msg.lower():
            raise FileBufferPleine(msg)
        raise RuntimeError(msg)
    sql("UPDATE clips_buffer SET etat = 'programme', post_id = :'p0', message = NULL, maj = now() WHERE id = :p1;", d["post"]["id"], b["id"])


def suivre(b):
    """La publication est partie ? On note son lien (à déclarer à Whop) et on retire le clip du relais."""
    p = buffer("query($i: PostInput!) { post(input: $i) { status externalLink error { message } } }", {"i": {"id": b["post_id"]}})["post"]
    statut = str(p.get("status", "")).lower()
    if statut == "sent" and p.get("externalLink"):
        sql("""INSERT INTO clips_publies (campagne, clip, plateforme, lien) VALUES (:'p0', :'p1', :'p2', :'p3')
               ON CONFLICT (campagne, clip, plateforme) DO UPDATE SET lien = EXCLUDED.lien, publie_le = now();""",
            b["campagne"], b["clip"], b["plateforme"], p["externalLink"])
        sql("UPDATE clips_buffer SET etat = 'publie', lien = :'p0', maj = now() WHERE id = :p1;", p["externalLink"], b["id"])
        with open(os.path.join(CLIPS, b["campagne"], "liens-whop.txt"), "a", encoding="utf-8") as f:
            f.write(" | ".join((b["clip"], b["plateforme"], p["externalLink"])) + "\n")
    elif statut == "error":
        msg = ((p.get("error") or {}).get("message") or "erreur Buffer")[:300]
        if "limit" in msg.lower():                         # quota du jour (ex. YouTube non vérifié) : on retire et on réessaie demain
            try:
                buffer("mutation($i: DeletePostInput!) { deletePost(input: $i) { __typename } }", {"i": {"id": b["post_id"]}})
            except Exception:
                pass
            sql("UPDATE clips_buffer SET etat = 'a_faire', post_id = NULL, message = :'p0', quand = now() + interval '20 hours', maj = now() WHERE id = :p1;", msg, b["id"])
        else:
            sql("UPDATE clips_buffer SET etat = 'echec', message = :'p0', maj = now() WHERE id = :p1;", msg, b["id"])


def main():
    verrou = open(VERROU, "w")
    try:
        fcntl.flock(verrou, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        return
    sql("""CREATE TABLE IF NOT EXISTS clips_buffer (id serial PRIMARY KEY, campagne text NOT NULL, clip text NOT NULL,
           plateforme text NOT NULL, quand timestamptz NOT NULL, etat text NOT NULL DEFAULT 'a_faire', post_id text, lien text,
           message text, cree_le timestamptz NOT NULL DEFAULT now(), maj timestamptz NOT NULL DEFAULT now(),
           UNIQUE (campagne, clip, plateforme));
           ALTER TABLE clips_buffer ADD COLUMN IF NOT EXISTS url text;""")
    a_faire = lignes("a_faire")
    if a_faire:
        ids, pleines = chaines(), set()
        for b in a_faire:
            if b["plateforme"] in pleines or os.path.exists("/opt/raime/clippeur/pause-" + b["plateforme"]):
                continue                                   # file pleine, ou plateforme en pause (ex. changement de compte)
            try:
                programmer(b, ids)
            except FileBufferPleine:
                pleines.add(b["plateforme"])               # la suite attend que Buffer publie et libère de la place
            except Exception as e:
                sql("UPDATE clips_buffer SET etat = 'echec', message = :'p0', maj = now() WHERE id = :p1;", str(e)[:300], b["id"])
    avant = {(x["campagne"], x["clip"], x["plateforme"]) for x in lignes("publie")}
    for b in lignes("programme"):
        try:
            suivre(b)
        except Exception as e:
            print("suivi", b["id"], str(e)[:200], flush=True)
    nouveaux = [x for x in lignes("publie") if (x["campagne"], x["clip"], x["plateforme"]) not in avant]
    if nouveaux:
        prevenir("%d lien(s) à déclarer à Whop" % len(nouveaux),
                 chr(10).join("%s · %s · %s : %s" % (x["campagne"], x["clip"], x["plateforme"], x["lien"]) for x in nouveaux))


if __name__ == "__main__":
    main()
