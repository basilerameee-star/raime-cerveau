# -*- coding: utf-8 -*-
"""Le pilote des clips KinGKlip (15/10/2026) : le « run complet » demandé par Basile le 14/10, de la sélection de campagne
aux publications, 3 fois par jour sur le serveur (cron), sans Claude, sans frais.

Délégation du 08/10/2026 : Claude choisit seul les campagnes et publie en autonomie sur Instagram et YouTube KinGKlip.
Ordre du 14/10/2026 : au moins 3 publications par jour, tous les jours, sur les deux. Plus de réponse « 1, 2 ou 3 » attendue.

  1. lit le marché Content Rewards (contentrewards.py, API publique) et note chaque campagne (grille en code) ;
  2. mesure la réserve de chaque chaîne active : les clips prêts et pas encore partis, plus ceux en découpe (estimés) ;
  3. sous RESERVE_CIBLE jours, lance seul les meilleures campagnes qui ont une source connue (lien dans la description,
     ou sources.json) : demande de découpe, plateformes payées, profil (mentions, hashtags) ; donne à Basile le lien exact
     pour « Rejoindre » ;
  4. sous ALERTE jours de clips prêts, alerte Basile, une fois par jour au plus.

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
RESERVE_CIBLE = 7                                           # jours d'avance visés
ALERTE = 3                                                  # jours de clips prêts sous lesquels Basile est prévenu
ATTENDU = 8                                                 # clips comptés par source en cours de découpe
NOTE_MINI = 40
LANCEMENTS_MAX = 3                                          # sources lancées au plus par passage


def slug(nom):
    s = unicodedata.normalize("NFD", nom.lower())
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:50]


def sources_connues():
    """Les sources vérifiées, par campagne (sources.json : id Content Rewards → vidéo, mentions, hashtags)."""
    try:
        return json.load(open(os.path.join(ICI, "sources.json"), encoding="utf-8")).get("campagnes", {})
    except (OSError, ValueError):
        return {}


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


def choisir(notes, sources, reserve, deja):
    """Les campagnes à lancer maintenant (fonction pure) : tant que la réserve la plus faible des chaînes actives, découpes
    en cours comprises, reste sous RESERVE_CIBLE jours. Jamais une campagne exclue, sur candidature, à comptes dédiés,
    déjà lancée, ni une source déjà utilisée."""
    if not reserve:
        return []
    attendu = min(r["pret"] + r["attendu"] for r in reserve.values())
    lancer, urls = [], {d.get("url") for d in deja}
    lancees = {d.get("cr_id") for d in deja}
    for e in notes:
        if len(lancer) >= LANCEMENTS_MAX or jours(attendu) >= RESERVE_CIBLE:
            break
        s = source_de(e, sources)
        if (e["exclusion"] or e["candidature"] or e["dedies"] or e["note"] < NOTE_MINI or not s
                or e["cr_id"] in lancees or s["url"] in urls or not set(e["plateformes"]) & set(reserve)):
            continue
        lancer.append((e, s))
        urls.add(s["url"])
        attendu += int(s.get("attendu") or ATTENDU)
    return lancer


def a_alerter(reserve, deja_ce_jour):
    """(alerte ?, jours) : sous ALERTE jours de clips PRÊTS sur une chaîne active, une fois par jour au plus."""
    if not reserve:
        return False, 0
    j = min(jours(r["pret"]) for r in reserve.values())
    return j < ALERTE and not deja_ce_jour, j


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


def pourquoi(e):
    bouts = ["note %s/100" % e["note"], "Instagram %g $ et YouTube %g $ les 1 000 vues" % (e["ig"], e["yt"]),
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
        p = {"nom": e["nom"], "min": int(s.get("min") or 12), "max": int(s.get("max") or 35),
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
    a_lancer = choisir(notes, sources_connues(), reserve, deja)
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
    alerte, j = a_alerter(reserve, deja_ce_jour)
    etat = " · ".join("%s : %d prêts, %d en découpe (%.1f jours)" % (pl, x["pret"], x["attendu"], jours(x["pret"]))
                      for pl, x in reserve.items())
    sans_source = [e for e in notes if not e["exclusion"] and not e["candidature"] and not e["dedies"]
                   and not source_de(e, sources_connues())][:3]
    if blocs or alerte or (panne and not deja_ce_jour):
        texte = ("Campagnes lancées (rejoins-les sur Content Rewards, puis déclare les liens que tu recevras) :\n\n" + "\n\n".join(blocs) + "\n\n") if blocs else ""
        if alerte:
            texte += "Réserve basse : %.1f jours de clips prêts (seuil %d jours).\n" % (j, ALERTE)
        if panne:
            texte += "Marché Content Rewards illisible ce passage : %s\n" % panne
        texte += "Réserve : %s\nCalcul : %d créneaux par jour et par chaîne, %d publications garanties, %d jours visés.\n" % (etat, CADENCE, GARANTIE, RESERVE_CIBLE)
        if sans_source and (alerte or not blocs):
            texte += "\nBonnes campagnes sans source connue (lien de vidéo à ajouter dans clippeur/sources.json) :\n" + "\n".join(
                "- %s : %s (%s)" % (e["nom"], e["lien"], pourquoi(e)) for e in sans_source)
        prevenir(("%d campagne(s) lancée(s)" % len(blocs)) if blocs else ("réserve basse : %.1f jours" % j if alerte else "marché illisible"), texte)
        if alerte or panne:
            with open(marque, "w", encoding="utf-8") as f:
                f.write(time.strftime("%Y-%m-%d"))
    print(time.strftime("%Y-%m-%d %H:%M"), len(campagnes), "campagnes,", len([e for e in notes if not e["exclusion"]]), "dans la grille,",
          len(a_lancer), "lancée(s) ;", etat, ("; panne : " + panne) if panne else "", flush=True)


if __name__ == "__main__":
    main()
