# -*- coding: utf-8 -*-
"""Le pilote des clips KinGKlip (15/10/2026) : le « run complet » demandé par Basile le 14/10, de la sélection de campagne
aux publications, 3 fois par jour sur le serveur (cron), sans Claude, sans frais.

Délégation du 08/10/2026 : Claude choisit seul les campagnes et publie en autonomie sur Instagram et YouTube KinGKlip.
Ordre du 14/10/2026 : au moins 3 publications par jour, tous les jours, sur les deux. Plus de réponse « 1, 2 ou 3 » attendue.

  1. lit le marché Content Rewards (contentrewards.py, API publique) et note chaque campagne (grille en code) ;
  2. mesure la réserve de chaque chaîne active : les clips prêts et pas encore partis, plus ceux en découpe (estimés) ;
  3. sous LANCER_SOUS (14) jours, remonte jusqu'à RESERVE_CIBLE (14) jours : lance seul les meilleures campagnes qui ont une source connue (lien dans la description,
     ou sources.json) : demande de découpe, plateformes payées, profil (mentions, hashtags) ; donne à Basile le lien exact
     pour « Rejoindre » ;
  4. sous ALERTE (2) jours de clips prêts, alerte Basile UNE fois, jusqu'à ce que la réserve remonte.

LE CALCUL (15/10/2026)
- Buffer publie à 4 créneaux par jour et par chaîne (réglés par Basile). Chaque campagne retenue paie Instagram ET
  YouTube : un même clip part sur les deux. Il faut donc 4 clips par jour (3 au minimum garanti), soit 28 clips pour
  7 jours d'avance (21 au minimum).
- Rendement observé : une source de 20 à 25 minutes donne 6 à 10 clips notés 7/10 ou plus ; un podcast d'1 h 30 une
  vingtaine (R3born : 18 clips pour 1 h). On compte ATTENDU = 8 clips par source tant que la découpe n'est pas finie.
- D'où 3 à 4 sources par semaine, et 3 campagnes en parallèle sur des sources différentes : le relais alterne les
  campagnes (règles « contenu non authentique » de YouTube et d'originalité d'Instagram depuis le 30/04/2026 : jamais
  le même moment deux fois, jamais deux fois de suite la même source, 4 publications par jour au plus).
"""
import json
import os
import re
import sys
import time
import unicodedata

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import contentrewards as cr                                 # noqa: E402

ICI = os.path.dirname(os.path.abspath(__file__))
CADENCE = 4                                                 # créneaux Buffer par jour et par chaîne
GARANTIE = 3                                                # publications par jour promises, au minimum
RESERVE_CIBLE = 14                                          # jours d'avance visés : 2 semaines par chaîne (Basile, 15/10 au soir)
LANCER_SOUS = RESERVE_CIBLE                                 # Basile, 15/10 21 h : chercher des campagnes tout le temps, sous 2 semaines
ALERTE = 2                                                  # sous 2 jours de clips prêts : UNE alerte à Basile (ordre du 15/10)
ATTENDU = 8                                                 # clips comptés par source en cours de découpe
NOTE_MINI = 40
LANCEMENTS_MAX = 3                                          # sources lancées au plus par passage


def slug(nom):
    s = unicodedata.normalize("NFD", nom.lower())
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:50]


AUTO = os.path.join(ICI, "sources_auto.json")               # écrit par l'agent (briefs lus après adhésion), hors du rsync
REJOINDRE_MAX = 5                                           # campagnes rejointes au plus par passage (3 passages par jour)


def sources_connues():
    """Les sources par campagne : vérifiées à la main (sources.json), puis lues dans le brief par l'agent (sources_auto.json)."""
    out = {}
    for f in (AUTO, os.path.join(ICI, "sources.json")):     # la main l'emporte sur l'agent
        try:
            out.update({k: v for k, v in json.load(open(f, encoding="utf-8")).get("campagnes", {}).items() if v.get("url") and une_video(v["url"])})
        except (OSError, ValueError):
            pass
    return out


def une_video(u):
    """Un lien qui désigne UNE vidéo (ou un dossier/fichier de la marque), jamais une chaîne entière (15/10/2026 :
    twitch.tv/Awake et youtube.com/@tonalexina avaient été pris pour des sources)."""
    if "youtu" in u:
        return bool(re.search(r"watch\?v=|/shorts/|youtu\.be/|/live/", u))
    if "twitch.tv" in u:
        return bool(re.search(r"/videos?/|/clip/|clips\.twitch", u))
    if "kick.com" in u:
        return "/videos/" in u or "/clips/" in u
    return True


def chaine_twitch(u):
    """Le nom de la chaîne d'un lien Twitch qui désigne une chaîne entière (twitch.tv/irubyana), sinon None."""
    m = re.match(r"https?://(?:www\.|m\.)?twitch\.tv/([A-Za-z0-9_]{3,25})/?(?:videos?/?)?(?:[?#].*)?$", u or "")
    return m.group(1) if m and m.group(1).lower() not in ("videos", "directory", "p", "downloads", "jobs") else None


def derniere_video_twitch(chaine, lancer=None):
    """La dernière vidéo enregistrée d'une chaîne Twitch d'au moins 15 min (22/10/2026 : les campagnes de streamers
    donnent une chaîne, pas une vidéo). La liste se lit depuis le serveur (yt-dlp, conteneur du clippeur) ; Kick ne
    donne que le direct, il reste de côté."""
    import subprocess
    lancer = lancer or (lambda cmd: subprocess.run(cmd, capture_output=True, text=True, timeout=120).stdout)
    sortie = lancer(["docker", "run", "--rm", "--entrypoint", "yt-dlp", "raime-clippeur", "--flat-playlist", "-I", "1:6",
                     "--print", "%(id)s|%(duration)s", "https://www.twitch.tv/%s/videos?filter=archives&sort=time" % chaine])
    for ligne in (sortie or "").splitlines():
        ident, _, duree = ligne.strip().partition("|")
        if re.fullmatch(r"v?\d{6,}", ident) and duree.replace(".", "", 1).isdigit() and float(duree) >= 900:
            return "https://www.twitch.tv/videos/%s" % ident.lstrip("v")
    return None


def source_du_brief(e, brief, resoudre=None):
    """Ce que le pilote lit d'un brief rejoint (fonction pure) : la vidéo source (fichiers de la marque, Drive d'abord :
    YouTube bloque le serveur), les mentions, les mots-dièse et les consignes. url None : aucune vidéo dans le brief."""
    import cr_agent
    morceaux = cr_agent.textes(brief.get("requirements")) if isinstance(brief, dict) else []
    texte = "\n".join(dict.fromkeys(morceaux))
    liens = sorted([u for u in dict.fromkeys(cr.liens_video(texte)) if une_video(u)], key=lambda u: (not any(v in u for v in ("drive.google", "dropbox")), u))
    if not liens and resoudre:                     # une chaîne Twitch : sa dernière vidéo enregistrée (22/10/2026)
        for chaine in dict.fromkeys(filter(None, map(chaine_twitch, cr.liens_video(texte) + (e.get("sources") or [])))):
            v = resoudre(chaine)
            if v:
                liens = [v]
                break
    tags = sorted(set(re.findall(r"(?<![\w@])@[A-Za-z0-9_.]{2,30}", texte)))
    return {"nom": e["nom"], "url": liens[0] if liens else None, "autres": liens[1:6], "nombre": 20,
            "tags": {pl: " ".join(tags[:2]) for pl in e["plateformes"]},
            "hashtags": list({h.lower(): h for h in re.findall(r"(?<![\w#])#[A-Za-z][A-Za-z0-9_]{1,30}", texte)}.values())[:5],
            "consignes": texte[:6000], "verifie": "%s : brief Content Rewards lu par l'agent après adhésion" % time.strftime("%d/%m/%Y")}


def a_rejoindre(notes, deja_lus, reserve):
    """Les campagnes compatibles de la grille pas encore rejointes (fonction pure). Basile, 15/10/2026 21 h 15 : en
    rejoindre au maximum, en continu, pas seulement de quoi remplir la réserve."""
    return [e for e in notes if not (e["exclusion"] or e["candidature"] or e["dedies"]) and e["note"] >= NOTE_MINI
            and (e["cr_id"] not in deja_lus or reessayer(deja_lus[e["cr_id"]])) and set(e["plateformes"]) & set(reserve)][:REJOINDRE_MAX]


def reessayer(lu, aujourd_hui=None):
    """Une adhésion manquée (bouton absent, fenêtre imprévue) se retente le lendemain ; un brief lu, jamais."""
    return bool(lu.get("echec")) and lu.get("le", "") < (aujourd_hui or time.strftime("%Y-%m-%d"))


def rejoindre_et_lire(notes, reserve, prevenir, lanceur=None, sql=None):
    """L'agent rejoint les campagnes compatibles et écrit leur brief dans sources_auto.json ; blocage : une alerte."""
    import cr_lanceur
    lanceur = lanceur or cr_lanceur
    try:
        auto = json.load(open(AUTO, encoding="utf-8"))
    except (OSError, ValueError):
        auto = {"_lisezmoi": "Écrit par pilote.py et cr_agent.py (briefs lus après adhésion). Ne pas éditer à la main.", "campagnes": {}}
    if not lanceur.pret():
        lanceur.alerter_si_bloque(prevenir)
        return 0
    cibles = a_rejoindre(notes, auto["campagnes"], reserve)
    if not cibles:
        return 0
    par_id = {e["cr_id"]: e for e in cibles}
    n = 0
    for r in lanceur.lancer("rejoindre", *par_id):
        e = par_id.get(r.get("cr_id"))
        if e and r.get("ok"):
            auto["campagnes"][e["cr_id"]] = source_du_brief(e, r.get("brief") or {}, derniere_video_twitch)
            n += 1
            if sql:                                         # le compte des campagnes rejointes (rapport du matin)
                sql("""CREATE TABLE IF NOT EXISTS cr_adhesions (cr_id text PRIMARY KEY, nom text, source text, le timestamptz NOT NULL DEFAULT now());
                       INSERT INTO cr_adhesions (cr_id, nom, source) VALUES (:'p0', :'p1', :'p2') ON CONFLICT (cr_id) DO NOTHING;""",
                    e["cr_id"], e["nom"], auto["campagnes"][e["cr_id"]]["url"] or "")
        elif e and not r.get("bloque"):
            auto["campagnes"][e["cr_id"]] = {"nom": e["nom"], "url": None, "echec": (r.get("raison") or "")[:300],
                                             "le": time.strftime("%Y-%m-%d")}
    with open(AUTO, "w", encoding="utf-8") as f:
        json.dump(auto, f, ensure_ascii=False, indent=1)
    lanceur.alerter_si_bloque(prevenir)
    return n


def source_de(e, sources):
    """La vidéo source d'une campagne : sources.json d'abord, puis un lien de sa description (Drive avant YouTube :
    YouTube bloque le serveur, le PC de Basile doit alors télécharger)."""
    s = sources.get(e["cr_id"])
    if s and s.get("url"):
        return s
    liens = sorted(e.get("sources") or [], key=lambda u: "drive.google" not in u)
    return {"url": liens[0]} if liens else None


def jours(pret, attendu=0):
    return (pret + attendu) / float(CADENCE)


def choisir(notes, sources, reserve, deja, reserve_niche=None):
    """Les campagnes à lancer maintenant (fonction pure) : tant que la réserve la plus faible des chaînes actives, découpes
    en cours comprises, reste sous RESERVE_CIBLE jours. Jamais une campagne exclue, sur candidature, à comptes dédiés,
    déjà lancée, ni une source déjà utilisée."""
    if not reserve:
        return []
    attendu = min(r["pret"] + r["attendu"] for r in reserve.values())
    # 22/10/2026 (focus streamers) : moins de 2 jours de clips de la niche en file = une source de la niche part, même si la
    # réserve totale (encore pleine de clips d'avant) dépasse 2 semaines ; une seule par passage
    focus_bas = bool(cr.FOCUS) and reserve_niche is not None and jours(min(reserve_niche.values() or [0])) < 2
    if jours(attendu) >= LANCER_SOUS and not focus_bas:     # 2 semaines d'avance : rien ne part ; sinon, on remonte à 14
        return []
    plafond = LANCEMENTS_MAX if jours(attendu) < LANCER_SOUS else 1
    lancer, urls = [], {d.get("url") for d in deja}
    lancees = {d.get("cr_id") for d in deja}
    # Basile, 15/10/2026 22 h 50 : les sources que le serveur télécharge seul (Drive, lien direct) passent avant YouTube,
    # qui exige le PC ; à source égale, l'ordre de la grille
    def youtube(e):
        s = source_de(e, sources)
        return bool(s) and any(h in s["url"] for h in ("youtube.com", "youtu.be"))
    for e in sorted(notes, key=youtube):
        if len(lancer) >= plafond or (jours(attendu) >= RESERVE_CIBLE and not focus_bas):
            break
        s = source_de(e, sources)
        if (e["exclusion"] or e["candidature"] or e["dedies"] or e["note"] < NOTE_MINI or not s
                or e["cr_id"] in lancees or s["url"] in urls or not set(e["plateformes"]) & set(reserve)):
            continue
        lancer.append((e, s))
        urls.add(s["url"])
        attendu += int(s.get("attendu") or ATTENDU)
    return lancer


def a_alerter(reserve, deja_signale):
    """(alerte ?, jours) : sous ALERTE jours de clips PRÊTS sur une chaîne active, UNE seule fois tant que la réserve n'est
    pas remontée (deja_signale : la marque pilote-reserve-basse, effacée dès que la réserve repasse au-dessus)."""
    if not reserve:
        return False, 0
    j = min(jours(r["pret"]) for r in reserve.values())
    return j < ALERTE and not deja_signale, j


# ---- base et effets (serveur) ----

def schema(sql):
    sql("""CREATE TABLE IF NOT EXISTS campagnes_proposees (id serial PRIMARY KEY, le date NOT NULL DEFAULT current_date,
           rang int, nom text, marque text, budget_restant numeric, cpm numeric, par_publication numeric, candidature boolean,
           pourquoi text, UNIQUE (le, nom));
           ALTER TABLE campagnes_proposees ADD COLUMN IF NOT EXISTS fiche text, ADD COLUMN IF NOT EXISTS videos text,
             ADD COLUMN IF NOT EXISTS url_fiche text, ADD COLUMN IF NOT EXISTS lancee boolean NOT NULL DEFAULT false,
             ADD COLUMN IF NOT EXISTS cr_id text, ADD COLUMN IF NOT EXISTS note numeric, ADD COLUMN IF NOT EXISTS ig numeric,
             ADD COLUMN IF NOT EXISTS yt numeric, ADD COLUMN IF NOT EXISTS exclusion text, ADD COLUMN IF NOT EXISTS dedies boolean,
             ADD COLUMN IF NOT EXISTS public_exige boolean;
           ALTER TABLE clips_demandes ADD COLUMN IF NOT EXISTS cr_id text, ADD COLUMN IF NOT EXISTS plateformes text;
           ALTER TABLE clips_buffer ADD COLUMN IF NOT EXISTS prevu timestamptz;""")


def mesurer(sql, actives):
    """{plateforme: {"pret": clips prêts pas encore partis, "attendu": clips estimés des découpes en cours}}."""
    out = {}
    for pl in actives:
        pret = int(sql("SELECT count(*) FROM clips_buffer WHERE plateforme = :'p0' AND etat IN ('a_faire', 'programme');", pl) or 0)
        en_cours = int(sql("""SELECT count(*) FROM clips_demandes WHERE etat IN ('a_faire', 'en_cours')
                              AND (plateformes IS NULL OR plateformes LIKE '%%' || :'p0' || '%%');""", pl) or 0)
        out[pl] = {"pret": pret, "attendu": en_cours * ATTENDU}
    return out


def mesurer_niche(sql, actives):
    """{plateforme: clips prêts de la niche visée (cr.FOCUS)}, la niche lue dans le nom de la campagne (analyste.niche)."""
    from analyste import niche
    out = {}
    for pl in actives:
        r = sql("SELECT coalesce(json_agg(campagne), '[]') FROM clips_buffer WHERE plateforme = :'p0' AND etat IN ('a_faire', 'programme');", pl)
        out[pl] = sum(niche(c) == cr.FOCUS for c in json.loads(r[r.index("["):] if "[" in r else "[]"))
    return out


def ecrire_reserve(sql, reserve):
    """L'avance de chaque chaîne, en jours, pour le rapport du matin et le cockpit (table clips_reserve, 15/10/2026)."""
    sql("""CREATE TABLE IF NOT EXISTS clips_reserve (plateforme text PRIMARY KEY, pret int NOT NULL, attendu int NOT NULL,
           jours numeric NOT NULL, maj timestamptz NOT NULL DEFAULT now());""")
    for pl, r in reserve.items():
        sql("""INSERT INTO clips_reserve (plateforme, pret, attendu, jours) VALUES (:'p0', :p1, :p2, :p3)
               ON CONFLICT (plateforme) DO UPDATE SET pret = EXCLUDED.pret, attendu = EXCLUDED.attendu, jours = EXCLUDED.jours,
               maj = now();""", pl, r["pret"], r["attendu"], round(jours(r["pret"]), 1))


def pourquoi(e):
    bouts = ["note %s/100" % e["note"], "Instagram %g $ et YouTube %g $ les 1 000 vues" % (e["ig"], e["yt"]),
             "payé dès %d vues par clip" % e.get("vues_min", 0),
             "%d $ restants sur %d $" % (e["restant"], e["total"]), "%d créateurs" % e["createurs"]]
    if e["public"]:
        bouts.append("public exigé (anglais, heures américaines)")
    if e["dedies"]:
        bouts.append("comptes dédiés exigés : il faudrait vider les comptes")
    if e["candidature"]:
        bouts.append("sur candidature")
    return " · ".join(bouts)


def noter_jour(sql, notes, lancees):
    """Les meilleures campagnes du jour dans campagnes_proposees (Jarvis, cockpit), mises à jour à chaque passage."""
    ids = {e["cr_id"] for e, _ in lancees}
    for rang, e in enumerate([e for e in notes if not e["exclusion"]][:10], 1):
        sql("""INSERT INTO campagnes_proposees (rang, nom, marque, budget_restant, cpm, par_publication, candidature, pourquoi,
               videos, url_fiche, lancee, cr_id, note, ig, yt, exclusion, dedies, public_exige)
               VALUES (:p0, :'p1', :'p2', :p3, :p4, 0, :p5, :'p6', :'p7', :'p8', :p9, :'p10', :p11, :p12, :p13, '', :p14, :p15)
               ON CONFLICT (le, nom) DO UPDATE SET rang = EXCLUDED.rang, budget_restant = EXCLUDED.budget_restant,
               cpm = EXCLUDED.cpm, pourquoi = EXCLUDED.pourquoi, note = EXCLUDED.note, ig = EXCLUDED.ig, yt = EXCLUDED.yt,
               cr_id = EXCLUDED.cr_id, url_fiche = EXCLUDED.url_fiche, lancee = campagnes_proposees.lancee OR EXCLUDED.lancee;""",
            rang, e["nom"], e["marque"], e["restant"], max(e["ig"], e["yt"]), "true" if e["candidature"] else "false", pourquoi(e),
            json.dumps(e["sources"]), e["lien"], "true" if e["cr_id"] in ids else "false", e["cr_id"], e["note"], e["ig"], e["yt"],
            "true" if e["dedies"] else "false", "true" if e["public"] else "false")


def regles_liees(description, lire=None):
    """Le texte des pages de règles citées dans la description (ex. reachclipping.com/Expedia-Speed : mots-dièse
    obligatoires, cadrage, délai de soumission) ; les liens de vidéo n'en sont pas. Rien si la page ne répond pas."""
    import html
    import urllib.request
    morceaux = []
    for u in [u.rstrip(".,)") for u in re.findall(r"https?://[^\s)>\]\"']+", description or "")
              if not any(v in u for v in cr.VIDEO)][:2]:
        try:
            if lire:
                h = lire(u)
            else:
                req = urllib.request.Request(u, headers={"User-Agent": cr.AGENT})
                h = urllib.request.urlopen(req, timeout=25).read(400000).decode("utf-8", "replace")
        except Exception:
            continue
        h = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", h)
        t = re.sub(r"\s*\n\s*", "\n", html.unescape(re.sub(r"<[^>]+>", "\n", h))).strip()
        morceaux.append("Règles (%s) :\n%s" % (u, t[:6000]))
    return "\n\n".join(morceaux)


def lancer(sql, e, s, campagnes_dir):
    """Une demande de découpe pour la campagne, avec ses plateformes payées. Source vérifiée (sources.json) : son profil
    (mentions, mots-dièse, consignes) est écrit ici ; sinon le brief complet (description et pages de règles liées) part
    au clippeur, qui en tire le profil (file.py, brief_auto)."""
    nom = slug(e["nom"])
    profil = os.path.join(campagnes_dir, nom + ".json")
    if s.get("verifie") and not os.path.isfile(profil):
        p = {"nom": e["nom"], "min": int(s.get("min") or 30), "max": int(s.get("max") or 60),
             "tags": s.get("tags") or {pl: "" for pl in e["plateformes"]}, "hashtags": s.get("hashtags", []),
             "interdits": s.get("interdits", []), "consignes": (s.get("consignes", "") + " " + e.get("description", "")).strip(),
             "remuneration": {"type": "CPM", "detail": pourquoi(e)}, "sources_autorisees": s["url"],
             "sous_titres": True, "cadrage": s.get("cadrage", "visage"), "publication_auto": True, "plateformes": e["plateformes"],
             "_source": "pilote.py, %s : fiche Content Rewards %s" % (time.strftime("%d/%m/%Y"), e["lien"])}
        with open(profil, "w", encoding="utf-8") as f:
            json.dump(p, f, ensure_ascii=False, indent=2)
    brief = "Campagne Content Rewards : %s (%s)\nFiche : %s\n%s\n\n%s\n\n%s\n\n%s" % (
        e["nom"], e["marque"], e["lien"], pourquoi(e), e.get("description", ""), s.get("consignes", ""),
        regles_liees(e.get("description", "")))
    sql("""INSERT INTO clips_demandes (url, campagne, nombre, consignes, cr_id, plateformes)
           VALUES (:'p0', :'p1', :p2, :'p3', :'p4', :'p5');""",
        s["url"], nom, int(s.get("nombre") or 20), brief[:30000], e["cr_id"], json.dumps(e["plateformes"]))
    sql("UPDATE campagnes_proposees SET lancee = true WHERE cr_id = :'p0' AND le = current_date;", e["cr_id"])
    return nom


def main():
    from file import sql, prevenir, CLIPS                  # noqa: F401  (serveur seulement)
    schema(sql)
    actives = [pl for pl in cr.NOS_PLATEFORMES if not os.path.exists(os.path.join(ICI, "pause-" + pl))]
    panne = ""
    try:
        campagnes = cr.lister()
        notes = cr.classer(campagnes)
        par_id = {c.get("id"): c for c in campagnes}
        for e in notes:
            e["description"] = (par_id.get(e["cr_id"]) or {}).get("description") or ""
    except Exception as err:
        campagnes, notes, panne = [], [], str(err)[:300]
    r = sql("SELECT coalesce(json_agg(json_build_object('cr_id', cr_id, 'url', url, 'campagne', campagne)), '[]') FROM clips_demandes;")
    deja = json.loads(r[r.index("["):] if "[" in r else "[]")
    if campagnes:
        # une campagne lancée qui a fermé ou épuisé son budget ne prend plus de créneau : ses clips en attente sont écartés
        vivantes = {e["cr_id"] for e in notes if e["restant"] >= 25 and not e["exclusion"].startswith("campagne fermée")}
        for d in deja:
            if d.get("cr_id") and d["cr_id"] not in vivantes:
                sql("""UPDATE clips_buffer SET etat = 'campagne_close', message = 'campagne fermée ou budget épuisé', maj = now()
                       WHERE campagne = :'p0' AND etat = 'a_faire';""", d["campagne"])
    reserve = mesurer(sql, actives)
    try:
        rejointes = rejoindre_et_lire(notes, reserve, prevenir, sql=sql)
    except Exception as err:                                # l'agent ne bloque jamais le reste du pilote
        rejointes = 0
        print("agent Content Rewards :", str(err)[:200], flush=True)
    a_lancer = choisir(notes, sources_connues(), reserve, deja, mesurer_niche(sql, actives) if cr.FOCUS else None)
    noter_jour(sql, notes, a_lancer)
    blocs = []
    for e, s in a_lancer:
        nom = lancer(sql, e, s, os.path.join(ICI, "campagnes"))
        blocs.append("%s (%s)\n   Rejoindre (une fois, un clic) : %s\n   Source : %s\n   %s\n   Dossier : %s" % (
            e["nom"], e["marque"], e["lien"], s["url"], pourquoi(e), nom))
    marque = os.path.join(ICI, "pilote-alerte")
    try:
        deja_ce_jour = open(marque, encoding="utf-8").read().strip() == time.strftime("%Y-%m-%d")
    except OSError:
        deja_ce_jour = False
    basse = os.path.join(ICI, "pilote-reserve-basse")
    alerte, j = a_alerter(reserve, os.path.exists(basse))
    if reserve and j >= ALERTE and os.path.exists(basse):
        os.remove(basse)                                    # la réserve est remontée : la prochaine baisse sera signalée
    ecrire_reserve(sql, reserve)
    etat = " · ".join("%s : %d prêts, %d en découpe (%.1f jours)" % (pl, x["pret"], x["attendu"], jours(x["pret"]))
                      for pl, x in reserve.items())
    sans_source = [e for e in notes if not e["exclusion"] and not e["candidature"] and not e["dedies"]
                   and not source_de(e, sources_connues())][:3]
    if blocs or alerte or (panne and not deja_ce_jour):
        texte = ("Campagnes lancées (l’agent les rejoint et déclare les clips lui-même) :\n\n" + "\n\n".join(blocs) + "\n\n") if blocs else ""
        if alerte:
            texte += "Réserve basse : %.1f jours de clips prêts (seuil %d jours).\n" % (j, ALERTE)
        if panne:
            texte += "Marché Content Rewards illisible ce passage : %s\n" % panne
        texte += "Réserve : %s\nCalcul : %d créneaux par jour et par chaîne, %d publications garanties, %d jours visés.\n" % (etat, CADENCE, GARANTIE, RESERVE_CIBLE)
        if sans_source and (alerte or not blocs):
            texte += "\nBonnes campagnes sans source connue (lien de vidéo à ajouter dans clippeur/sources.json) :\n" + "\n".join(
                "- %s : %s (%s)" % (e["nom"], e["lien"], pourquoi(e)) for e in sans_source)
        prevenir(("%d campagne(s) lancée(s)" % len(blocs)) if blocs else ("réserve basse : %.1f jours" % j if alerte else "marché illisible"), texte)
        if panne:
            with open(marque, "w", encoding="utf-8") as f:
                f.write(time.strftime("%Y-%m-%d"))
        if alerte:
            with open(basse, "w", encoding="utf-8") as f:
                f.write(time.strftime("%Y-%m-%d %H:%M"))
    print(time.strftime("%Y-%m-%d %H:%M"), len(campagnes), "campagnes,", len([e for e in notes if not e["exclusion"]]), "dans la grille,",
          len(a_lancer), "lancée(s),", rejointes, "rejointe(s) ;", etat, ("; panne : " + panne) if panne else "", flush=True)


if __name__ == "__main__":
    main()
