# -*- coding: utf-8 -*-
"""Le marché Content Rewards, lu sans connexion (15/10/2026).

L'API publique de contentrewards.com (celle que la page Discover appelle) donne, pour chaque campagne : le budget
total et le budget déjà dépensé, le prix des 1 000 vues par plateforme (avec le minimum et le maximum par clip), la
candidature, le nombre de clips approuvés et la description complète. Le brief détaillé et les fichiers de référence
restent réservés aux comptes qui ont rejoint la campagne.

Remplace la lecture de la page par Gemini (09/10 : budget lu dans la liste et non dans la fiche, fiche d'une autre
campagne ouverte, plateformes payées, comptes dédiés, langue et public exigé ignorés). La grille est ici, en code,
sans modèle : elle se teste (tests/banc/pilote_clips_test.py).
"""
import json
import re
import urllib.parse
import urllib.request

API = "https://contentrewards.com/api/campaign/campaigns"
FICHE = "https://contentrewards.com/c/campaigns/"          # la page publique : bouton « Rejoindre la campagne »
AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36"
NOS_PLATEFORMES = ("instagram", "youtube")                  # KinGKlip ; TikTok en pause (compte banni le 04/10/2026)
PRIX_MINI = 1.0                                             # 1 $ les 1 000 vues au moins (grille du 02/10/2026)
PRIX_ABERRANT = 20.0
# 22/10/2026 : un clip n'est payé qu'au-dessus du minimum de la campagne ; les nôtres font 150 vues de médiane (record
# 1 716). Une campagne payée dès 1 000 vues est à notre portée, une à 4 000 (Demi Lovato) ne l'a jamais été.
PAYABLE_BAS, PAYABLE_HAUT, PAYABLE_MAXI = 1000, 5000, 10000                                        # au-delà, une donnée fausse (15/10 : « Coworker » à 1 000 $)
VIDEO = ("youtu", "drive.google", "dropbox", "vimeo", "twitch.tv", "kick.com", "streamable", "frame.io", "wetransfer", "mega.nz")

# exclusions (selection.json) : jeux d'argent, contenu adulte, politique ; pas de clipping ; autre langue que l'anglais
CATEGORIES_EXCLUES = {"gambling", "crypto", "crypto-trading", "prediction-markets", "politics", "news-politics", "adult"}
THEME_EXCLU = re.compile(r"casino|gambl|poker|\bbet(s|ting)?\b|stake\.com|\bshuffle\b|roulette|\bslots?\b|crypto|pump\.fun|"
                         r"memecoin|onlyfans|sinparty|nsfw|\b18\+|hornyt|election|prop firm", re.I)   # la politique : par catégorie
PAS_CLIPPING = re.compile(r"\bugc\b|slideshow|sound campaign|official sound|tutorial|screen-record|scripted|reposting campaign|"
                          r"repost existing|logo campaign|edits? campaign|fan edits", re.I)
AUTRE_LANGUE = re.compile(r"fran[cç]ais|\(fr\)|\bfr\b|france|🇫🇷|espa[nñ]ol|hablando|por cada|visitas|🇪🇸|deutsch|\(de\)|"
                          r"🇩🇪|arab|عرب|darija|\bital(ia|iano)\b|kannada|hindi|portugu|🇸🇦|🇦🇪|\bksa\b|nederland|dutch|"
                          r"vlaams|🇳🇱|€", re.I)                    # 15/10 : campagnes néerlandaises payées en euros
# exigences lues dans la description (la seule partie publique du brief)
COMPTES_DEDIES = re.compile(r"dedicated|new (page|account)s?\b|fresh (page|account)s?\b|brand[- ]new (page|account)|"
                            r"theme pages?|fan pages? only", re.I)
PUBLIC_EXIGE = re.compile(r"tier[- ]?1|\d+\s?%\s?\+?\s?(us|usa|uk|u\.s\.)\b|\b(us|usa|uk|american|united states) "
                          r"(audience|viewers)|audience (in|from) (the )?(us|usa|uk)", re.I)
# la niche du pôle KinGKlip (décision du 02/10/2026) : les streamers et leurs shows
# 22/10/2026 (Basile) : « si on se concentre uniquement sur les streamers […] autant ne sélectionner que ces campagnes-là ».
# Les campagnes déjà lancées hors niche gardent leurs clips en file (elles ne sont pas « fermées ») ; None = toutes les niches.
FOCUS = "streamer"
STREAMER = re.compile(r"streamer|\bstream(?:s|ing|er)?\b|twitch|kick\.com|\bkick\b|\birl\b|\be-?sports?\b|n3on|kai cenat|ishowspeed|adin ross|"
                      r"sneako|jynxzi|\bxqc\b|plaqueboymax|fanum|duke dennis|agent ?00|yourrage|\blacy\b|\bclix\b|stable ronaldo", re.I)


def est_streamer(texte, categories=()):
    """Une campagne de streamer ou de jeu vidéo en direct : nom, description ou catégorie Content Rewards."""
    # « gaming » seul ne suffit pas (22/10/2026 : Animal Valley, Decentraland = des pubs de jeux, sans streamer qui parle)
    return bool(STREAMER.search(texte or "")) or "streamer" in set(categories)


NICHE = re.compile(r"n3on|kai cenat|ishowspeed|adin ross|sneako|yourrage|jynxzi|hardscope|streamer|livestream", re.I)
# des images de jeu sans parole : le clippeur choisit par la voix (selection.json, « adéquation »)
JEU = re.compile(r"gameplay|trailer|\bdemo\b|steam|wishlist|switch 2|\bps5\b|xbox|roblox|fortnite|call of duty|warfare|"
                 r"total war|early access|\bmap\b", re.I)
PAROLE = {"podcast", "business-podcast", "streamer", "twitch", "kick", "content-creator", "personal-brand", "entertainment",
          "celebrity", "comedy", "reactions", "movie-tv-show", "youtuber", "documentary", "relationships-dating"}
SANS_PAROLE = {"music", "music-video", "hip-hop-rap", "gaming", "pc-gaming", "mobile-gaming", "roblox", "sports",
               "consumer-brand", "fashion", "luxury-fashion", "beauty", "live-performance", "artist-promo"}


def lire_json(url, ouvrir=None):
    """Une page de l'API (ouvrir : faux réseau des tests)."""
    if ouvrir:
        return ouvrir(url)
    req = urllib.request.Request(url, headers={"User-Agent": AGENT, "Accept": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=40))


def lister(ouvrir=None, pages=15):
    """Toutes les campagnes de Discover (100 par page), sans les groupes repliés."""
    tout, curseur = [], None
    for _ in range(pages):
        j = lire_json(API + "/discover?collapseGroups=false&limit=100&view=summary&sortBy=newest"
                      + ("&cursor=" + urllib.parse.quote(curseur) if curseur else ""), ouvrir)
        tout += j.get("data") or []
        curseur = (j.get("pagination") or {}).get("nextCursor")
        if not curseur or not j.get("data"):
            break
    return tout


def detail(cid, ouvrir=None):
    return (lire_json(API + "/" + cid, ouvrir) or {}).get("data") or {}


def tarifs(c, d=None):
    """{plateforme: (prix des 1 000 vues, minimum par clip, maximum par clip)} en dollars ; la fiche l'emporte sur la liste."""
    modele = ((d or {}).get("configuration") or {}).get("payoutModel")
    if modele:
        return {p["platform"]: (p.get("rate", 0) / 100, p.get("minPayout", 0) / 100, p.get("maxPayout", 0) / 100) for p in modele}
    return {p["platform"]: (p.get("rateCents", 0) / 100, p.get("minPayoutCents", 0) / 100, p.get("maxPayoutCents", 0) / 100)
            for p in c.get("payouts") or [] if p.get("payoutType", "cpm") == "cpm"}


def liens_video(texte):
    return [u.rstrip(".,)") for u in re.findall(r"https?://[^\s)>\]\"']+", texte or "") if any(v in u for v in VIDEO)]


def _entre(x, bas, haut):
    return max(0.0, min(1.0, (x - bas) / (haut - bas)))


def evaluer(c, d=None):
    """La grille de selection.json, en code : exclusion (ou ""), exigences repérées et note sur 100."""
    d = d or {}
    m = c.get("metrics") or d.get("metrics") or {}
    texte = "%s\n%s" % (c.get("name", ""), d.get("description") or c.get("description") or "")
    categories = {x.get("id") for x in (c.get("categories") or [])}
    types = {x.get("id") for x in (((d.get("configuration") or {}).get("content") or {}).get("contentTypes") or [])}
    t = tarifs(c, d)
    nos = {p: t[p] for p in NOS_PLATEFORMES if p in t and t[p][0] >= PRIX_MINI}
    total = (c.get("budgetCents") or (d.get("configuration") or {}).get("budget") or 0) / 100
    restant = total - (m.get("budgetSpentCents") or 0) / 100
    approuves = m.get("approvedSubmissionCount") or 0
    candidature = bool(c.get("requiresApplication") or d.get("requiresApplication")
                       or ((d.get("configuration") or {}).get("requirement") or {}).get("preApproval"))
    e = {"cr_id": c.get("id"), "nom": c.get("name", "").strip(), "marque": c.get("organizationName") or (d.get("organization") or {}).get("name", ""),
         "lien": FICHE + str(c.get("id")), "plateformes": sorted(nos), "ig": t.get("instagram", (0,))[0], "yt": t.get("youtube", (0,))[0],
         "restant": round(restant), "total": round(total), "createurs": m.get("creatorCount") or 0, "approuves": approuves,
         "candidature": candidature, "dedies": bool(COMPTES_DEDIES.search(texte)), "public": bool(PUBLIC_EXIGE.search(texte)),
         "sources": liens_video(texte), "exclusion": "", "note": 0}
    vues_min = max([v[1] / v[0] * 1000 for v in nos.values()] or [0])
    e["vues_min"] = round(vues_min)
    if c.get("status", "active") != "active":
        e["exclusion"] = "campagne fermée"
    elif (c.get("payoutType") or d.get("type") or "cpm") != "cpm":
        e["exclusion"] = "payée à la publication, pas aux vues"
    elif not nos:
        e["exclusion"] = "ne paie ni Instagram ni YouTube à %g $ les 1 000 vues" % PRIX_MINI
    elif max(v[0] for v in nos.values()) > PRIX_ABERRANT:
        e["exclusion"] = "prix aberrant (%g $ les 1 000 vues) : donnée douteuse" % max(v[0] for v in nos.values())
    elif restant < 500 or (total and restant < .15 * total):
        e["exclusion"] = "budget restant trop bas (%d $)" % restant
    elif categories & CATEGORIES_EXCLUES or THEME_EXCLU.search(texte):
        e["exclusion"] = "thème exclu (jeux d'argent, adulte, crypto ou politique)"
    elif (types and "clipping" not in types) or PAS_CLIPPING.search(texte):
        e["exclusion"] = "pas du clipping (UGC, son, tutoriel ou reprise)"
    elif AUTRE_LANGUE.search(texte):
        e["exclusion"] = "langue ou public non anglais"
    elif vues_min > PAYABLE_MAXI:
        e["exclusion"] = "minimum de %d vues par clip" % vues_min
    elif FOCUS == "streamer" and not est_streamer(texte, categories):
        e["exclusion"] = "hors niche : streamers seulement (Basile, 22/10/2026)"
    if e["exclusion"]:
        return e
    prix = sum(v[0] for v in nos.values()) / len(NOS_PLATEFORMES)          # une plateforme non payée compte pour 0
    maxi = max(v[2] for v in nos.values())
    adequation = .4 if JEU.search(texte) else (1.0 if categories & PAROLE else (.4 if categories & SANS_PAROLE else .6))
    note = (30 * _entre(prix, .2, 3) + 20 * min(1.0, restant / 10000) + 20 * _entre(restant / max(approuves, 1), 5, 50)
            + 20 * adequation + 10 * (1.0 if maxi == 0 or maxi >= 300 else _entre(maxi, 20, 300)))
    note += 10 if NICHE.search(texte) else 0
    note += 20 * (1 - _entre(vues_min, PAYABLE_BAS, PAYABLE_HAUT)) - (15 if vues_min > PAYABLE_HAUT else 0)
    note -= (30 if candidature else 0) + (40 if e["dedies"] else 0) + (15 if e["public"] else 0)
    e["note"] = round(max(0.0, min(100.0, note)), 1)
    return e


def classer(campagnes, ouvrir=None, fiches=25):
    """Note toutes les campagnes ; relit la fiche des meilleures (types de contenu, pré-approbation, tarifs de la fiche)."""
    notes = sorted((evaluer(c) for c in campagnes), key=lambda e: -e["note"])
    par_id = {c.get("id"): c for c in campagnes}
    for i, e in enumerate(notes[:fiches]):
        if not e["exclusion"]:
            try:
                notes[i] = evaluer(par_id[e["cr_id"]], detail(e["cr_id"], ouvrir))
            except Exception as err:                       # fiche illisible : la note de la liste reste
                notes[i]["motif_fiche"] = str(err)[:120]
    return sorted(notes, key=lambda e: (bool(e["exclusion"]), -e["note"]))
