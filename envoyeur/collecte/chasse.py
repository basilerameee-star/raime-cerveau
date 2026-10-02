"""Collecte des offres d'emploi pour Basile (jobup.ch + jobs.ch).

Usage : python chasse.py            -> met à jour offres.json (nouvelles offres + description)
        python chasse.py --sans-detail

Les deux sites appartiennent à JobCloud : même JSON embarqué (__INIT__), même identifiant
d'offre. Le score est déterministe (règles ci-dessous) ; la lettre est écrite ensuite.
"""
import html
import os
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ICI = Path(__file__).parent
FICHIER = Path(os.environ.get("DONNEES", str(ICI))) / "offres.json"  # sur le serveur : /data
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"

TERMES = [
    "vendeur", "vendeuse", "conseiller de vente", "conseillère de vente", "sales advisor",
    "sales associate", "client advisor", "commercial", "business developer", "account manager",
    "conseiller clientèle", "télévente", "inside sales", "key account", "chargé d'affaires",
    "store manager", "gérant magasin", "responsable de magasin", "intelligence artificielle", "IA",
]
LIEUX = ["Genève", "Lausanne", "Nyon", "Morges", "Rolle", "Gland", "Renens", "Meyrin", "Carouge"]
SITES = {
    "jobup": "https://www.jobup.ch/fr/emplois/?term={t}&location={l}&page={p}",
    "jobs.ch": "https://www.jobs.ch/fr/offres-emplois/?term={t}&location={l}&page={p}",
}
DETAIL = {
    "jobup": "https://www.jobup.ch/fr/emplois/detail/{id}/",
    "jobs.ch": "https://www.jobs.ch/fr/offres-emplois/detail/{id}/",
}

# Communes acceptées : arc lémanique Genève -> Lausanne, joignable en train.
ZONE = re.compile(
    r"gen[eè]v|geneva|genf|carouge|meyrin|vernier|lancy|th[oô]nex|ch[eê]ne|plan-les-ouates|"
    r"cointrin|grand-saconnex|versoix|onex|satigny|collonge|cologny|vandœuvres|vandoeuvres|"
    r"bernex|confignon|troinex|veyrier|pr[eé]gny|bellevue|collex|nyon|gland|rolle|morges|"
    r"prangins|coppet|founex|mies|commugny|tannay|eysins|allaman|aubonne|etoy|st-prex|saint-prex|"
    r"renens|ecublens|crissier|bussigny|prilly|lausanne|pully|lutry|epalinges|le mont|"
    r"chavannes|romanel|cheseaux|vevey|montreux|puidoux|lonay|tolochenaz|denges|préverenges|"
    r"preverenges|st-sulpice|saint-sulpice|vufflens|gen[eè]ve|suisse romande|romandie|"
    r"paudex|ch[aâ]telaine|perly|acacias|etagni|signy|mies|plan-les|petit-lancy|grand-lancy|"
    r"annemasse|ville-la-grand|ambilly|gaillard|reignier|roche-sur-foron|bonneville|saint-julien-en-genevois|thonon|"
    r"vaud|waadt|t[ée]l[ée]travail|remote|home office",
    re.I,
)
EXCLU_TITRE = re.compile(
    r"apprenti|apprentissage|lehr|stagiaire|stage\b|praktik|ing[ée]nieur|d[ée]veloppeur|developer|"
    r"m[ée]decin|infirmi|pharmac|comptable|controller|juriste|avocat|chauffeur|cuisinier|"
    r"boulanger|boucher|poissonn|horloger\b|polydesign|électricien|electricien|mécanicien|"
    r"m[ée]canicien|monteur|technicien|nurse|kader|verkäufer|verkauf|berater/in|leiter",
    re.I,
)

RETAIL = re.compile(r"vendeu|conseill[eè]re? de vente|sales (advisor|associate)|client advisor|"
                    r"boutique|magasin|store|retail|caissi", re.I)
COMMERCIAL = re.compile(r"commercial|business develop|account|sales|vente|key account|chargé d'affaires|"
                        r"t[ée]l[ée]vente|inside sales|courtier", re.I)
IA = re.compile(r"\b(IA|AI)\b|intelligence artificielle|artificial intelligence|automatisation|"
                r"automation|n8n|chatgpt|llm|data", re.I)
MANAGER = re.compile(r"manager|responsable|g[ée]rant|chef|head|lead", re.I)
ALLEMAND = re.compile(r"allemand|deutsch|german|suisse[- ]allemand|schweizerdeutsch", re.I)
PERMIS_SUISSE = re.compile(r"permis (B|C|de travail suisse)\b|nationalit[ée] suisse|"
                           r"swiss (work )?permit|valid swiss", re.I)
PORTE_A_PORTE = re.compile(r"porte[- ]à[- ]porte|door[- ]to[- ]door|terrain", re.I)
COMMISSION_PURE = re.compile(r"commission (uniquement|seulement|pure)|100 ?% (à la )?commission|"
                             r"r[ée]mun[ée]ration (uniquement )?(à la|sur) commission", re.I)


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "fr-CH,fr;q=0.9"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "replace")


def etat_init(page):
    i = page.find("__INIT__ = ")
    if i < 0:
        return None
    d, _ = json.JSONDecoder().raw_decode(page[i + len("__INIT__ = "):])
    return d


def recherche(site, terme, lieu, pages=2):
    for p in range(1, pages + 1):
        url = SITES[site].format(t=urllib.parse.quote(terme), l=urllib.parse.quote(lieu), p=p)
        try:
            d = etat_init(get(url))
        except Exception as e:  # réseau, page modifiée
            print(f"  ! {site} {terme}/{lieu} p{p}: {e}", file=sys.stderr)
            return
        if not d:
            return
        main = d["vacancy"]["results"].get("main", {})
        for r in main.get("results", []):
            yield r
        if p >= main.get("meta", {}).get("numPages", 1):
            return
        time.sleep(0.6)


def description(site, oid):
    page = get(DETAIL[site].format(id=oid))
    t = re.sub(r"<script.*?</script>|<style.*?</style>", "", page, flags=re.S)
    t = html.unescape(re.sub(r"<[^>]+>", "\n", t))
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r"\n\s*\n+", "\n", t)
    a = t.find("À propos de cette offre")
    if a < 0:
        a = t.find("About this job")
    if a >= 0:
        t = t[a:]
    for fin in ("Signaler cette offre", "Report this job", "Offres similaires", "Similar jobs", "Postuler maintenant"):
        b = t.find(fin)
        if b > 0:
            t = t[:b]
    return t.strip()[:9000]


def noter(o):
    """Score 0-100 selon les critères de l'interview. Renvoie (score, raisons, alertes)."""
    titre, desc = o["titre"], o.get("description", "")
    tout = titre + "\n" + desc
    s, raisons, alertes = 50, [], []
    if RETAIL.search(titre):
        s += 25; raisons.append("vente en magasin (ton premier choix)")
    elif COMMERCIAL.search(titre):
        s += 15; raisons.append("poste commercial")
    if IA.search(tout):
        s += 8; raisons.append("touche IA / automatisation")
    if MANAGER.search(titre):
        s += 4; raisons.append("niveau manager (ton expérience Moka)")
    tmax = max(o.get("taux") or [0])
    if tmax and tmax < 50:
        s -= 40; alertes.append(f"taux {tmax} % < 50 %")
    elif tmax >= 80:
        s += 5
    if ALLEMAND.search(tout):
        s -= 25; alertes.append("allemand mentionné")
    if PERMIS_SUISSE.search(desc):
        s -= 10; alertes.append("permis suisse mentionné (frontalier G à vérifier)")
    if COMMISSION_PURE.search(desc):
        s -= 30; alertes.append("rémunération à la commission")
    if PORTE_A_PORTE.search(tout):
        alertes.append("terrain / porte-à-porte")
    if o.get("contrat") == "Temporaire":
        raisons.append("démarrage rapide (mission)")
        s += 3
    if not ZONE.search(o["lieu"] or ""):
        s -= 30; alertes.append(f"lieu hors zone : {o['lieu']}")
    return max(0, min(100, s)), raisons, alertes


CONTRATS = {}  # identifiants de contrat JobCloud non fiables : le contrat se lit dans l'annonce


def main():
    detail = "--sans-detail" not in sys.argv
    base = json.loads(FICHIER.read_text(encoding="utf-8")) if FICHIER.exists() else {}
    vus = 0
    for terme in TERMES:
        for lieu in LIEUX:
            for site in SITES:
                for r in recherche(site, terme, lieu):
                    vus += 1
                    oid = r["id"]
                    if oid in base:
                        continue
                    titre = r.get("title", "")
                    if EXCLU_TITRE.search(titre):
                        continue
                    if "apprenticeship" in json.dumps(r.get("employmentPositionIds", [])):
                        continue
                    base[oid] = {
                        "id": oid,
                        "titre": titre,
                        "entreprise": (r.get("company") or {}).get("name", ""),
                        "lieu": r.get("place", ""),
                        "taux": r.get("employmentGrades") or [],
                        "contrat": CONTRATS.get((r.get("employmentTypeIds") or [""])[0], ""),
                        "publie": (r.get("publicationDate") or "")[:10],
                        "source": site,
                        "lien": DETAIL[site].format(id=oid),
                        "candidature_simplifiee": any(t.get("name") in ("quickApply", "easyApply")
                                                      for t in r.get("listingTags", [])),
                        "trouve_le": time.strftime("%Y-%m-%d"),
                        "statut": "nouvelle",
                    }
            print(f"{terme} / {lieu} : {len(base)} offres en base", file=sys.stderr)
    if detail:
        for o in base.values():
            if "description" not in o and o["statut"] == "nouvelle" and ZONE.search(o["lieu"] or ""):
                try:
                    o["description"] = description(o["source"], o["id"])
                except Exception as e:
                    o["description"] = ""
                    print(f"  ! détail {o['id']}: {e}", file=sys.stderr)
                time.sleep(0.4)
    for o in base.values():
        o["score"], o["raisons"], o["alertes"] = noter(o)
    FICHIER.write_text(json.dumps(base, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{vus} résultats lus, {len(base)} offres en base")


if __name__ == "__main__":
    main()
