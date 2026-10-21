"""L'analyste des clips (21/10/2026, demande de Basile : « ce qui fonctionne, ce qui ne fonctionne pas », pour ne pas
reboucler sur un seul modèle tant que la donnée croisée ne dit pas ce qui marche le mieux). 0 jeton : du code seul.

Chaque jour :
  1. relève, pour chaque clip publié (clips_publies), ce que la plateforme en dit :
     - Instagram : l'API Graph (jeton système META_SYSTEM_TOKEN du coffre) : vues, portée, durée moyenne regardée,
       partages, enregistrements, j'aime, commentaires ;
     - YouTube : le compteur de vues de la page publique (le serveur la lit, contrairement aux téléchargements) ;
  2. le range dans clips_mesures (une ligne par clip, plateforme et jour : la courbe se lit dans le temps) ;
  3. croise ces mesures avec ce qu'on sait du clip (niche de la campagne, durée, cadrage, longueur du titre, heure,
     note donnée par Gemini) et écrit le bilan dans <clips>/analyse.json et analyse.txt.
Un clip n'entre dans le bilan qu'après 48 h (avant, ses vues montent encore). Le bilan donne aussi la part des créneaux
proposée par niche : 70 % suivent la donnée, 30 % restent à l'essai, pour ne jamais s'enfermer dans un seul modèle.

Cron : 10 6 * * * cd /opt/raime/clippeur && /usr/bin/python3 analyste.py >> /opt/raime/clippeur/analyste.log 2>&1
"""
import datetime
import json
import os
import re
import statistics
import sys
import time
import urllib.parse
import urllib.request

ICI = os.path.dirname(os.path.abspath(__file__))
IG_COMPTE = "17841423601017607"                   # @kinggklip
GRAPH = "https://graph.facebook.com/v23.0/"
NAVIGATEUR = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"
MUR_H = 48                                         # avant 48 h, les vues d'un clip montent encore
ESSAI = .30                                        # part des créneaux toujours laissée à l'essai

NICHES = [("streamer", r"n3on|r3born|ishowspeed|speed|kai-?cenat|stream|guapo|twitch|kick|flyquest|adin"),
          ("tele-realite", r"hardscope|love-and-justice|unpacked|court"),
          ("podcast", r"podcast|kaepernick|lovato"),
          ("business", r"juvon|tjr|automation|money|trade|business"),
          ("marque", r"maxim|hair|glp|expedia|brand")]


def niche(campagne):
    """La famille d'une campagne, d'après son nom : c'est elle que l'algorithme apprend à associer au compte."""
    for nom, motif in NICHES:
        if re.search(motif, campagne or "", re.I):
            return nom
    return "autre"


def tranche_duree(s):
    return "moins de 20 s" if s < 20 else "20 à 35 s" if s < 35 else "35 à 60 s" if s <= 60 else "plus de 60 s"


def tranche_heure(h):
    return {2: "2 h", 15: "15 h", 19: "19 h", 23: "23 h"}.get(h, "%d h" % h)


def code_ig(lien):
    m = re.search(r"/(?:reel|reels|p)/([\w-]+)", lien or "")
    return m.group(1) if m else None


def id_youtube(lien):
    m = re.search(r"(?:shorts/|[?&]v=|youtu\.be/)([\w-]{6,})", lien or "")
    return m.group(1) if m else None


def mediane(l):
    l = [x for x in l if x is not None]
    return statistics.median(l) if l else None


def agreger(lignes, cle):
    """Les clips mûrs regroupés par une caractéristique : nombre, médiane des vues, médiane de la part regardée."""
    groupes = {}
    for l in lignes:
        groupes.setdefault(l[cle], []).append(l)
    out = []
    for k, g in groupes.items():
        out.append({"valeur": k, "clips": len(g), "vues_mediane": mediane([x["vues"] for x in g]),
                    "regarde_mediane": mediane([x.get("regarde") for x in g]),
                    "meilleur": max(x["vues"] or 0 for x in g)})
    return sorted(out, key=lambda x: -(x["vues_mediane"] or 0))


def repartition(par_niche, essai=ESSAI):
    """La part des créneaux par niche : (1 - essai) au prorata des vues médianes, essai réparti à égalité. Une niche
    jugée sur moins de 3 clips n'a que sa part d'essai : trop peu de donnée pour la suivre."""
    fiables = [g for g in par_niche if g["clips"] >= 3 and (g["vues_mediane"] or 0) > 0]
    total = sum(g["vues_mediane"] for g in fiables)
    n = len(par_niche) or 1
    parts = {g["valeur"]: essai / n for g in par_niche}
    for g in fiables:
        parts[g["valeur"]] += (1 - essai) * g["vues_mediane"] / total
    if not fiables:                                 # aucune donnée solide : tout reste à l'essai, à parts égales
        parts = {g["valeur"]: 1 / n for g in par_niche}
    return {k: round(v, 2) for k, v in sorted(parts.items(), key=lambda kv: -kv[1])}


def bilan(lignes):
    """Le bilan croisé des clips mûrs (≥ 48 h)."""
    murs = [l for l in lignes if (l.get("age_h") or 0) >= MUR_H]
    b = {"le": time.strftime("%Y-%m-%d %H:%M"), "clips_murs": len(murs), "clips_suivis": len(lignes)}
    b["par_plateforme"] = agreger(murs, "plateforme")
    # les croisements se font sur Instagram seul : c'est là que la donnée existe (vues, part regardée) ; YouTube montre à
    # peine nos Shorts (21/10/2026 : 3 vues en médiane) et noierait toute différence entre niches, durées ou heures
    ig = [l for l in murs if l["plateforme"] == "instagram"]
    for cle in ("niche", "duree", "cadrage", "heure", "titre"):
        b["par_" + cle] = agreger(ig, cle)
    b["meilleurs"] = sorted(murs, key=lambda l: -(l["vues"] or 0))[:5]
    b["repartition"] = repartition(b["par_niche"])
    return b


def texte(b):
    def ligne(g):
        r = " · regardé %d %%" % round(100 * g["regarde_mediane"]) if g.get("regarde_mediane") else ""
        return "  %-14s %3d clip(s) · vues médianes %s · meilleur %s%s" % (g["valeur"], g["clips"], int(g["vues_mediane"] or 0), g["meilleur"], r)
    out = ["Analyste des clips, %s : %d clips suivis, %d de plus de 48 h" % (b["le"], b["clips_suivis"], b["clips_murs"])]
    for cle, nom in (("plateforme", "Par plateforme"), ("niche", "Instagram, par niche"), ("duree", "Instagram, par durée"),
                     ("cadrage", "Instagram, par cadrage"), ("heure", "Instagram, par heure"), ("titre", "Instagram, par titre")):
        out.append(nom + " :")
        out += [ligne(g) for g in b["par_" + cle]]
    out.append("Meilleurs : " + " ; ".join("%s (%s, %s vues)" % (l.get("titre_texte", l["titre"])[:40], l["plateforme"], l["vues"]) for l in b["meilleurs"]))
    out.append("Créneaux proposés par niche (70 % la donnée, 30 % l'essai) : " + ", ".join("%s %d %%" % (k, round(100 * v)) for k, v in b["repartition"].items()))
    return "\n".join(out)


# ── Le relevé (serveur seulement) ────────────────────────────────────────────────────────────────────────────────
def jeton_meta(coffre="/opt/raime/coffre/secrets.env"):
    for l in open(coffre, encoding="utf-8"):
        if l.startswith("META_SYSTEM_TOKEN="):
            return l.split("=", 1)[1].strip().strip('"')
    return ""


def graph(chemin, jeton, **params):
    params["access_token"] = jeton
    with urllib.request.urlopen(GRAPH + chemin + "?" + urllib.parse.urlencode(params), timeout=30) as r:
        return json.load(r)


def reels(jeton):
    """Tous les reels du compte : code du lien → identifiant Graph."""
    out, chemin, params = {}, IG_COMPTE + "/media", {"fields": "id,permalink", "limit": 100}
    while chemin:
        d = graph(chemin, jeton, **params)
        for m in d.get("data", []):
            if code_ig(m.get("permalink")):
                out[code_ig(m["permalink"])] = m["id"]
        nxt = d.get("paging", {}).get("next")
        chemin, params = (nxt.split(GRAPH, 1)[1].split("?")[0], dict(urllib.parse.parse_qsl(nxt.split("?", 1)[1]))) if nxt else (None, {})
        params.pop("access_token", None)
    return out


def mesure_ig(media, jeton):
    d = {i["name"]: i["values"][0]["value"] for i in graph(media + "/insights", jeton,
         metric="views,reach,ig_reels_avg_watch_time,shares,saved,likes,comments")["data"]}
    return {"vues": d.get("views"), "portee": d.get("reach"), "duree_moy_s": round((d.get("ig_reels_avg_watch_time") or 0) / 1000, 1),
            "partages": d.get("shares"), "enreg": d.get("saved"), "likes": d.get("likes"), "commentaires": d.get("comments")}


def mesure_yt(video):
    req = urllib.request.Request("https://www.youtube.com/watch?v=" + video, headers={"User-Agent": NAVIGATEUR, "Accept-Language": "en"})
    with urllib.request.urlopen(req, timeout=30) as r:
        page = r.read().decode("utf-8", "replace")
    m = re.search(r'"viewCount":"(\d+)"', page)
    return {"vues": int(m.group(1)) if m else None}


def fiche(clips_dir, campagne, clip):
    """Ce qu'on sait du clip : sa ligne de clips.json et son cadrage (marque laissée par remonter.py)."""
    try:
        c = next(x for x in json.load(open(os.path.join(clips_dir, campagne, "clips.json"), encoding="utf-8"))["clips"] if x["clip"] == clip)
    except (OSError, ValueError, KeyError, StopIteration):
        c = {}
    marques = [f for f in os.listdir(os.path.join(clips_dir, campagne)) if f.startswith(clip + ".cadrage-")] if os.path.isdir(os.path.join(clips_dir, campagne)) else []
    return c, marques


def main():
    sys.path.insert(0, ICI)
    from file import sql, CLIPS
    sql("""CREATE TABLE IF NOT EXISTS clips_mesures (campagne text NOT NULL, clip text NOT NULL, plateforme text NOT NULL, jour date NOT NULL,
           vues int, portee int, duree_moy_s numeric, partages int, enreg int, likes int, commentaires int, age_h int,
           maj_le timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (campagne, clip, plateforme, jour));""")
    r = sql("""SELECT coalesce(json_agg(x), '[]') FROM (SELECT campagne, clip, plateforme, lien, publie_le,
               extract(epoch FROM now() - publie_le)::int / 3600 AS age_h, extract(hour FROM publie_le AT TIME ZONE 'Europe/Paris')::int AS heure
               FROM clips_publies WHERE lien IS NOT NULL AND disparu_le IS NULL AND plateforme IN ('instagram', 'youtube')) x;""")
    publies = json.loads(r[r.index("["):] if "[" in r else "[]")
    jeton = jeton_meta()
    ig = reels(jeton) if jeton else {}
    lignes, echecs = [], 0
    for p in publies:
        try:
            if p["plateforme"] == "instagram":
                media = ig.get(code_ig(p["lien"]))
                if not media:
                    continue
                m = mesure_ig(media, jeton)
            else:
                m = mesure_yt(id_youtube(p["lien"]))
                time.sleep(1.5)                       # la page publique : sans hâte
        except Exception as e:                         # une mesure ratée reste inconnue, jamais un zéro
            echecs += 1
            print("mesure impossible :", p["campagne"], p["clip"], p["plateforme"], str(e)[:120], flush=True)
            continue
        if m.get("vues") is None:
            echecs += 1
            continue
        sql("""INSERT INTO clips_mesures (campagne, clip, plateforme, jour, vues, portee, duree_moy_s, partages, enreg, likes, commentaires, age_h)
               VALUES (:'p0', :'p1', :'p2', current_date, nullif(:'p3', '')::int, nullif(:'p4', '')::int, nullif(:'p5', '')::numeric,
                       nullif(:'p6', '')::int, nullif(:'p7', '')::int, nullif(:'p8', '')::int, nullif(:'p9', '')::int, :'p10'::int)
               ON CONFLICT (campagne, clip, plateforme, jour) DO UPDATE SET vues = EXCLUDED.vues, portee = EXCLUDED.portee,
                 duree_moy_s = EXCLUDED.duree_moy_s, partages = EXCLUDED.partages, enreg = EXCLUDED.enreg, likes = EXCLUDED.likes,
                 commentaires = EXCLUDED.commentaires, age_h = EXCLUDED.age_h, maj_le = now();""",
            p["campagne"], p["clip"], p["plateforme"], *["" if m.get(k) is None else m[k] for k in
                                                          ("vues", "portee", "duree_moy_s", "partages", "enreg", "likes", "commentaires")], p["age_h"])
        c, marques = fiche(CLIPS, p["campagne"], p["clip"])
        duree = (float(c["fin"]) - float(c["debut"])) if c.get("fin") else None
        titre = c.get("accroche") or c.get("titre") or ""
        lignes.append({"campagne": p["campagne"], "clip": p["clip"], "plateforme": p["plateforme"], "age_h": p["age_h"], "vues": m["vues"],
                       "regarde": (m["duree_moy_s"] / duree) if m.get("duree_moy_s") and duree else None,
                       "niche": niche(p["campagne"]), "duree": tranche_duree(duree) if duree else "inconnue",
                       "cadrage": "nouveau (fond flou)" if any(x.endswith(("21b", "21c")) for x in marques) else "ancien (carré)",
                       "heure": tranche_heure(p["heure"]), "titre": "court (≤ 5 mots)" if len(titre.split()) <= 5 else "long",
                       "note_gemini": c.get("note"), "titre_texte": titre})
    b = bilan(lignes)
    b["echecs"] = echecs
    json.dump(b, open(os.path.join(CLIPS, "analyse.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1, default=str)
    t = texte(b)
    open(os.path.join(CLIPS, "analyse.txt"), "w", encoding="utf-8").write(t + "\n")
    print(t, "\nmesures : %d, impossibles : %d" % (len(lignes), echecs), flush=True)


if __name__ == "__main__":
    main()
