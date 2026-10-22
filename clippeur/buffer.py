# -*- coding: utf-8 -*-
"""Le relais Buffer (02/10/2026, refait le 15/10/2026) : programme sur les comptes KinGKlip les clips prêts.

Les clips entrent dans clips_buffer, une ligne par plateforme payée (clippeur/file.py). Ce script, lancé par cron toutes
les 2 minutes sur le serveur :
  1. garde dans Buffer FILE_BUFFER créneaux d'avance, aux heures CRENEAUX, les mêmes pour toutes les chaînes actives
     (l'API ne règle pas les créneaux de Buffer : chaque publication porte son heure) ; la réserve attend dans clips_buffer ;
  2. donne à chaque créneau un clip, publié sur toutes les chaînes qui l'attendent, en alternant les campagnes (jamais deux
     fois de suite la même source quand une autre attend) et en vidant d'abord la plus grosse réserve ;
  3. donne à Buffer le lien signé du clip (7 jours, /pubclip/ du cockpit ; Buffer vérifie le fichier par une requête HEAD,
     que les liens signés R2 refusent) ;
  4. lit en UN appel toutes les publications parties ou en erreur, seulement après l'heure prévue d'une publication, et
     note les liens dans clips_publies (à déclarer à Whop).
Quota réel de Buffer (en-têtes x-ratelimit, 15/10/2026) : 3 000 appels sur 30 jours glissants, 100 par 15 minutes. Avant
le 15/10, chaque publication programmée était relue toutes les 40 minutes (une centaine d'appels par publication).
Sans Claude, sans frais. Délégation de Basile du 08/10/2026 : publication en autonomie sur Instagram et YouTube.
"""
import fcntl
import hashlib
import hmac
import time
import json
import os
import urllib.error
import urllib.request
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from file import sql, CLIPS, COFFRE, prevenir

ICI = "/opt/raime/clippeur"
VERROU = "/tmp/clippeur-buffer.lock"
RALENTI = "/tmp/clippeur-buffer-429"                       # posé quand Buffer répond « trop de demandes » : l'heure de reprise
COMPTE = os.path.join(ICI, "buffer-compte.json")           # le reste du quota (en-tête de Buffer) et les appels des 15 dernières minutes
CHAINES = os.path.join(ICI, "buffer-chaines.json")         # les chaînes branchées : lues une fois, gardées
LECTURE = os.path.join(ICI, "buffer-lecture")              # l'heure de la dernière lecture groupée
ORGANISATION = "6abfab2f5ee6a202b90cb90b"
PLATEFORMES = ("youtube", "instagram", "tiktok")
FILE_BUFFER = 6                                            # créneaux programmés d'avance (1,5 jour ; l'offre gratuite en garde 10)
# LES MÊMES HEURES SUR INSTAGRAM ET YOUTUBE (accord de Basile du 15/10/2026) : le même clip part au même moment sur les
# deux, une seule déclaration par créneau. Heures de Paris = 20 h, 9 h, 13 h et 17 h à New York (public anglophone).
CRENEAUX = ("02:00", "15:00", "19:00", "23:00")
FUSEAU = ZoneInfo("Europe/Paris")
GARDE_QUOTA = 60                                           # appels laissés de côté sur les 30 jours (essais, autres agents)
PLAFOND_15MIN = 80                                         # sur 100 permis par Buffer
SUIVI_MIN = 10                                             # minutes entre deux lectures groupées


def cle():
    for ligne in open(COFFRE, encoding="utf-8"):
        if ligne.startswith("BUFFER_API_KEY="):
            return ligne.split("=", 1)[1].strip().strip('"')
    return ""


class TropDeDemandes(Exception):
    """Buffer limite le nombre d'appels : on s'arrête tout de suite au lieu d'insister (06/10/2026 : 24 000 refus en 2 jours)."""


def compte():
    try:
        return json.load(open(COMPTE, encoding="utf-8"))
    except (OSError, ValueError):
        return {"reste": None, "appels": []}


def appel_permis(c, maintenant=None):
    """(permis, raison) : le reste du quota de Buffer et le plafond des 15 dernières minutes."""
    maintenant = maintenant or time.time()
    if c.get("reste") is not None and c["reste"] <= GARDE_QUOTA and maintenant < (c.get("reprise") or 0):
        return False, "quota Buffer presque épuisé (%s appels restants)" % c["reste"]
    if len([t for t in c.get("appels", []) if t > maintenant - 900]) >= PLAFOND_15MIN:
        return False, "plafond de %d appels en 15 minutes" % PLAFOND_15MIN
    return True, ""


def attente_restante():
    """Les secondes à attendre encore après un refus de Buffer (0 : on peut appeler)."""
    try:
        jusqua = float(open(RALENTI, encoding="utf-8").read().strip() or 0)
    except (OSError, ValueError):
        jusqua = 0
    if not jusqua and os.path.exists(RALENTI):                 # ancien format (fichier vide) : 2 h après sa pose
        jusqua = os.path.getmtime(RALENTI) + 7200
    return max(0, jusqua - time.time())


def buffer(requete, variables=None):
    c = compte()
    permis, raison = appel_permis(c)
    if not permis:
        raise TropDeDemandes("Buffer : " + raison)
    k = cle()
    req = urllib.request.Request("https://api.buffer.com", data=json.dumps({"query": requete, "variables": variables or {}}).encode(),
                                 headers={"Content-Type": "application/json", "Authorization": "Bearer " + k})
    c["appels"] = [t for t in c.get("appels", []) if t > time.time() - 900] + [time.time()]
    try:
        r = urllib.request.urlopen(req, timeout=60)
        entetes = r.headers
        d = json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        entetes = e.headers
        if e.code == 429:
            try:
                attendre = max(600, min(86400, int(e.headers.get("Retry-After") or 7200)))
            except ValueError:
                attendre = 7200
            with open(RALENTI, "w", encoding="utf-8") as f:
                f.write(str(time.time() + attendre))
            raise TropDeDemandes("Buffer : trop de demandes (reprise dans %d min)" % (attendre // 60))
        raise
    finally:
        try:
            if entetes.get("x-ratelimit-remaining") is not None:
                c["reste"], c["reprise"] = int(entetes["x-ratelimit-remaining"]), int(entetes.get("x-ratelimit-reset") or 0)
        except (NameError, ValueError, AttributeError):
            pass
        with open(COMPTE, "w", encoding="utf-8") as f:
            json.dump(c, f)
    if d.get("errors"):
        raise RuntimeError(json.dumps(d["errors"])[:300].replace(k, "***"))
    return d["data"]


# Les comptes bannis ou abandonnés, jamais choisis même s'ils restent branchés dans Buffer (22/10/2026)
EXCLUES = {"bahethora0"}
# TikTok a banni le premier compte le 04/10 pour « trop de publications par API » : le nouveau démarre à 1 par jour
TIKTOK_PAR_JOUR = int(os.environ.get("TIKTOK_PAR_JOUR", "1"))


def chaines():
    """Les chaînes branchées dans Buffer, par service ; relues toutes les 6 heures (un compte relié par Basile est vu seul) ;
    un compte exclu ou déconnecté n'est jamais choisi. Un nouveau compte TikTok relié lève seul la pause de TikTok."""
    try:
        if time.time() - os.path.getmtime(CHAINES) < 6 * 3600:
            return json.load(open(CHAINES, encoding="utf-8"))
    except (OSError, ValueError):
        pass
    out = {}
    for c in buffer("query($i: ChannelsInput!) { channels(input: $i) { id service name isDisconnected } }",
                    {"i": {"organizationId": ORGANISATION}})["channels"]:
        if c.get("isDisconnected") or (c.get("name") or "").lower() in EXCLUES:
            continue
        out.setdefault(str(c["service"]).lower(), c["id"])
    with open(CHAINES, "w", encoding="utf-8") as f:
        json.dump(out, f)
    pause = os.path.join(ICI, "pause-tiktok")
    if "tiktok" in out and os.path.exists(pause):
        os.remove(pause)
        print(time.strftime("%Y-%m-%d %H:%M"), "nouveau compte TikTok relié : la pause de TikTok est levée", flush=True)
    return out


def tiktok_du_jour(quand):
    """Les publications TikTok programmées ou faites le jour du créneau (plafond TIKTOK_PAR_JOUR)."""
    jour = time.strftime("%Y-%m-%d", time.gmtime(quand))
    r = sql("""SELECT count(*) FROM clips_buffer WHERE plateforme = 'tiktok' AND etat IN ('programme', 'publie')
               AND to_char(coalesce(prevu, maj) AT TIME ZONE 'UTC', 'YYYY-MM-DD') = :'p0';""", jour)
    try:
        return int(str(r).strip().splitlines()[-1])
    except (ValueError, IndexError):
        return TIKTOK_PAR_JOUR


def en_pause(pl):
    return os.path.exists(os.path.join(ICI, "pause-" + pl))


def parts_analyste():
    """La part des créneaux par niche proposée par l'analyste (<clips>/analyse.json) ; rien si le bilan manque ou date de
    plus de 3 jours : on revient alors à la simple alternance."""
    try:
        f = os.path.join(CLIPS, "analyse.json")
        if time.time() - os.path.getmtime(f) > 3 * 86400:
            return None
        return json.load(open(f, encoding="utf-8")).get("repartition") or None
    except (OSError, ValueError):
        return None


def rangs(requete, *params):
    r = sql(requete, *params)
    return json.loads(r[r.index("["):] if "[" in r else "[]")      # json_agg s'étale sur plusieurs lignes


def palier(vues):
    """Le rang de paiement d'une campagne : payée dès 1 000 vues (0), 2 000 (1), inconnue (2), au-delà (3)."""
    if vues is None:
        return 2
    return 0 if vues <= 1000 else 1 if vues <= 2000 else 3


def seuils_campagnes():
    """{campagne: vues à partir desquelles un clip est payé}, écrit par le pilote à chaque passage (seuils.json)."""
    try:
        return json.load(open(os.path.join(ICI, "seuils.json"), encoding="utf-8"))
    except (OSError, ValueError):
        return None


def prochains(lignes, dernier=None, n=1, parts=None, seuils=None):
    """Les n clips à programmer sur une chaîne, pris dans ses lignes « a_faire » (ordre de création) : jamais la même
    campagne deux fois de suite quand une autre attend ; la campagne qui a le plus de clips en attente passe d'abord.
    parts (analyste.py, 21/10/2026) : la part des créneaux visée par niche ; la niche la plus en retard sur sa part passe
    d'abord (30 % de la part reste toujours à l'essai : aucune niche n'est jamais coupée).
    seuils (22/10/2026) : la campagne payée le plus tôt (vues par clip) passe avant tout le reste ; nos clips font 150 vues
    de médiane, un créneau donné à une campagne payée dès 4 000 vues n'a encore jamais rapporté."""
    from analyste import niche
    par = {}
    for b in lignes:
        par.setdefault(b["campagne"], []).append(b)
    choisis, faits = [], {}
    for _ in range(n):
        restes = [c for c in par if par[c]]
        if not restes:
            break
        autres = [c for c in restes if c != dernier] or restes
        retard = (lambda c: parts.get(niche(c), min(parts.values())) * (len(choisis) + 1) - faits.get(niche(c), 0)) if parts else (lambda c: 0)
        paye = (lambda c: -palier(seuils.get(c))) if seuils else (lambda c: 0)
        camp = max(autres, key=lambda c: (paye(c), retard(c), len(par[c]), -par[c][0]["id"]))
        faits[niche(camp)] = faits.get(niche(camp), 0) + 1
        choisis.append(par[camp].pop(0))
        dernier = camp
    return choisis


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


def creneaux_apres(t, n):
    """Les n prochains créneaux (secondes UTC) strictement après t, aux heures CRENEAUX de Paris (heure d'été comprise)."""
    out, jour = [], datetime.fromtimestamp(t, FUSEAU).date()
    while len(out) < n:
        for h in CRENEAUX:
            s = datetime(jour.year, jour.month, jour.day, int(h[:2]), int(h[3:]), tzinfo=FUSEAU).timestamp()
            if s > t and len(out) < n:
                out.append(s)
        jour += timedelta(days=1)
    return out


def repartir(lignes, actives, dernier, creneaux, parts=None, seuils=None):
    """[(créneau, [lignes du clip, une par chaîne])] : un clip par créneau, le même sur toutes les chaînes actives qui
    l'attendent ; le clip suit l'alternance de prochains() (fonction pure)."""
    clips, par = [], {}
    for b in sorted(lignes, key=lambda b: b["id"]):
        if b["plateforme"] not in actives:
            continue
        cle = (b["campagne"], b["clip"])
        if cle not in par:
            par[cle] = []
            clips.append({"id": b["id"], "campagne": b["campagne"], "clip": b["clip"]})
        par[cle].append(b)
    return [(s, par[(c["campagne"], c["clip"])]) for s, c in zip(creneaux, prochains(clips, dernier, len(creneaux), parts, seuils))]


class FileBufferPleine(Exception):
    """La file Buffer de la chaîne est pleine (offre gratuite) : on réessaiera plus tard, sans échec."""


def programmer(b, ids, quand):
    camp, clip, pl = b["campagne"], b["clip"], b["plateforme"]
    if pl not in ids:
        raise RuntimeError("Chaîne %s absente de Buffer : la brancher dans Buffer." % pl)
    url = b.get("url") or lien_public(camp, clip)
    leg, titre, texte = legendes(camp, clip)
    meta = {"youtube": {"youtube": {"title": (titre or "KinGKlip")[:100], "privacy": "public", "madeForKids": False,
                                    "notifySubscribers": True, "categoryId": "24"}},
            "tiktok": {"tiktok": {"title": titre[:90]}},
            "instagram": {"instagram": {"type": "reel", "shouldShareToFeed": True}}}[pl]
    entree = {"channelId": ids[pl], "text": (leg.get(pl) or texte)[:2200], "mode": "customScheduled",      # l'heure du créneau, la même sur chaque chaîne
              "dueAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(quand)), "schedulingType": "automatic", "needsApproval": False, "assets": [{"video": {"url": url}}], "metadata": meta}
    d = buffer("""mutation($e: CreatePostInput!) { createPost(input: $e) {
        ... on PostActionSuccess { post { id dueAt } } ... on MutationError { message } } }""", {"e": entree})["createPost"]
    if not d.get("post"):
        msg = d.get("message") or "Buffer a refusé la publication"
        if "limit" in msg.lower():
            raise FileBufferPleine(msg)
        raise RuntimeError(msg)
    sql("UPDATE clips_buffer SET etat = 'programme', post_id = :'p0', prevu = nullif(:'p1', '')::timestamptz, message = NULL, maj = now() WHERE id = :p2;",
        d["post"]["id"], d["post"].get("dueAt") or "", b["id"])


def noter_partie(b, p):
    """Une publication lue chez Buffer : partie (lien noté, à déclarer), en erreur, ou pas encore."""
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
            sql("UPDATE clips_buffer SET etat = 'a_faire', post_id = NULL, prevu = NULL, message = :'p0', quand = now() + interval '20 hours', maj = now() WHERE id = :p1;", msg, b["id"])
        else:
            sql("UPDATE clips_buffer SET etat = 'echec', message = :'p0', maj = now() WHERE id = :p1;", msg, b["id"])


def lecture_due(programmees, derniere, maintenant):
    """Lire Buffer seulement quand une publication programmée vient de passer son heure (puis, si elle n'est toujours pas
    partie, toutes les 2 heures ; sans heure connue, toutes les 3 heures), et jamais plus d'une fois en SUIVI_MIN minutes."""
    if maintenant - derniere < SUIVI_MIN * 60:
        return False

    def due(b):
        prevu, maj = b.get("prevu_s") or 0, b.get("maj_s") or 0
        if prevu:
            return prevu < maintenant - 120 and (maj < prevu + 120 or maj < maintenant - 7200)
        return maj < maintenant - 3 * 3600
    return any(due(b) for b in programmees)


def suivre_tout(programmees, ids):
    """UNE lecture pour toutes les chaînes : les publications parties ou en erreur depuis la plus ancienne programmée."""
    depuis = min([b["prevu_s"] for b in programmees if b.get("prevu_s")] + [b["maj_s"] for b in programmees]) - 86400
    d = buffer("""query($i: PostsInput!) { posts(first: 100, input: $i) { edges { node { id status externalLink error { message } } } } }""",
               {"i": {"organizationId": ORGANISATION, "filter": {"channelIds": sorted(set(ids.values())), "status": ["sent", "error"],
                                                                  "dueAt": {"start": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(depuis))}}}})
    lus = {e["node"]["id"]: e["node"] for e in d["posts"]["edges"]}
    for b in programmees:
        if b.get("post_id") in lus:
            noter_partie(b, lus[b["post_id"]])
        else:
            sql("UPDATE clips_buffer SET maj = now() WHERE id = :p0;", b["id"])


def main():
    verrou = open(VERROU, "w")
    try:
        fcntl.flock(verrou, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        return
    if attente_restante() > 0 or not appel_permis(compte())[0]:
        return                                             # le délai donné par Buffer, le quota des 30 jours, les 15 minutes
    sql("""CREATE TABLE IF NOT EXISTS clips_buffer (id serial PRIMARY KEY, campagne text NOT NULL, clip text NOT NULL,
           plateforme text NOT NULL, quand timestamptz NOT NULL, etat text NOT NULL DEFAULT 'a_faire', post_id text, lien text,
           message text, cree_le timestamptz NOT NULL DEFAULT now(), maj timestamptz NOT NULL DEFAULT now(),
           UNIQUE (campagne, clip, plateforme));
           ALTER TABLE clips_buffer ADD COLUMN IF NOT EXISTS url text, ADD COLUMN IF NOT EXISTS prevu timestamptz;
           ALTER TABLE clips_demandes ADD COLUMN IF NOT EXISTS cr_id text, ADD COLUMN IF NOT EXISTS plateformes text;
           ALTER TABLE campagnes_proposees ADD COLUMN IF NOT EXISTS cr_id text;""")
    actives = [pl for pl in PLATEFORMES if not en_pause(pl)]   # une plateforme en pause (TikTok banni le 04/10) ne coûte aucun appel
    try:
        ids = chaines()
    except TropDeDemandes:
        return
    # 1. FILE_BUFFER créneaux d'avance, les mêmes pour toutes les chaînes actives
    futurs = rangs("""SELECT coalesce(json_agg(DISTINCT extract(epoch FROM prevu)), '[]') FROM clips_buffer
                      WHERE etat = 'programme' AND prevu > now();""")
    manque = FILE_BUFFER - len(futurs)
    if manque > 0:
        lignes = rangs("SELECT coalesce(json_agg(b), '[]') FROM (SELECT * FROM clips_buffer WHERE etat = 'a_faire' AND quand <= now()) b;")
        dernier = sql("""SELECT campagne FROM clips_buffer WHERE etat IN ('programme', 'publie')
                         ORDER BY coalesce(prevu, maj) DESC LIMIT 1;""") or None
        depart = max([time.time() + 900] + [float(x) for x in futurs])
        for quand, clip in repartir(lignes, actives, dernier, creneaux_apres(depart, manque), parts_analyste(),
                                     seuils_campagnes()):
            for b in clip:
                if b.get("plateforme") == "tiktok" and tiktok_du_jour(quand) >= TIKTOK_PAR_JOUR:
                    continue                               # au-delà du plafond du jour, le clip TikTok attend le jour suivant
                try:
                    programmer(b, ids, quand)
                except FileBufferPleine:
                    break                                  # la suite attend que Buffer publie et libère de la place
                except TropDeDemandes:
                    return
                except Exception as e:
                    sql("UPDATE clips_buffer SET etat = 'echec', message = :'p0', maj = now() WHERE id = :p1;", str(e)[:300], b["id"])
    # 2. au-delà de 7 jours, une publication jamais partie est perdue (effacée chez Buffer) : on cesse de l'attendre
    sql("""UPDATE clips_buffer SET etat = 'perdu', message = coalesce(message, 'jamais publiée par Buffer en 7 jours'), maj = now()
           WHERE etat = 'programme' AND coalesce(prevu, cree_le) < now() - interval '7 days';""")
    # 3. une lecture groupée, seulement quand une publication a passé son heure
    programmees = rangs("""SELECT coalesce(json_agg(json_build_object('id', id, 'campagne', campagne, 'clip', clip, 'plateforme', plateforme,
                           'post_id', post_id, 'prevu_s', extract(epoch FROM prevu), 'maj_s', extract(epoch FROM maj))), '[]')
                           FROM clips_buffer WHERE etat = 'programme';""")
    try:
        derniere = os.path.getmtime(LECTURE)
    except OSError:
        derniere = 0
    if not programmees or not lecture_due(programmees, derniere, time.time()):
        return
    open(LECTURE, "w").close()
    avant = set(r for r in sql("SELECT id FROM clips_buffer WHERE etat = 'publie';").split())
    try:
        suivre_tout(programmees, ids)
    except TropDeDemandes:
        return
    nouveaux = rangs("""SELECT coalesce(json_agg(json_build_object('id', b.id, 'campagne', b.campagne, 'clip', b.clip, 'plateforme', b.plateforme,
                        'lien', b.lien, 'nom', d.nom, 'fiche', d.fiche) ORDER BY b.campagne, b.id), '[]') FROM clips_buffer b
                        LEFT JOIN LATERAL (SELECT p.nom, p.url_fiche AS fiche FROM clips_demandes q JOIN campagnes_proposees p ON p.cr_id = q.cr_id
                        WHERE q.campagne = b.campagne ORDER BY p.id DESC LIMIT 1) d ON true WHERE b.etat = 'publie';""")
    nouveaux = [x for x in nouveaux if str(x["id"]) not in avant]
    if nouveaux:
        blocs, vus = [], []
        for x in nouveaux:
            if x["campagne"] not in vus:
                vus.append(x["campagne"])
                blocs.append("%s%s :" % (x.get("nom") or x["campagne"], (" (" + x["fiche"] + ")") if x.get("fiche") else ""))
            blocs.append(x["lien"])
        prevenir("%d lien(s) à déclarer à Whop" % len(nouveaux),
                 # par campagne : son nom et sa page Content Rewards, puis les liens bruts, un par ligne, à copier dans « Submit clip »
                 chr(10).join(blocs) + chr(10) * 2 + "À déclarer dans Content Rewards (« Submit clip ») le plus tôt possible : "
                 "le budget est payé dans l'ordre d'approbation.")


if __name__ == "__main__":
    main()
