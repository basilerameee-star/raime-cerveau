"""France : offres en télétravail complet sur HelloWork (vente / commercial / service client).

python chasse_fr.py -> ajoute à offres.json (à lancer après chasse.py, jamais en même temps).
"""
import html
import json
import re
import sys
import time
import urllib.parse

from chasse import FICHIER, get, noter

TERMES = ["commercial", "vendeur", "conseiller de vente", "conseiller clientèle", "téléconseiller",
          "business developer", "account manager", "chargé de clientèle", "inside sales",
          "sales", "télévente", "intelligence artificielle"]
URL = "https://www.hellowork.com/fr-fr/emploi/recherche.html?k={t}+t%C3%A9l%C3%A9travail&l=France&p={p}"
ANCRE = re.compile(r'<a\s[^>]*?href="/fr-fr/emplois/(\d+)\.html"[^>]*?aria-label="([^"]*)"', re.S)
LABEL = re.compile(r"Voir offre de (?P<titre>.+?) à (?P<lieu>.+?), chez (?P<ent>.+?), pour un (?P<contrat>[^,]+)(?P<reste>.*)")
# Autour de chez Basile : Ville-la-Grand / Annemasse et 30 min de train (Léman Express)
LOCAL = re.compile(r"annemasse|ville-la-grand|ambilly|gaillard|vétraz|vetraz|reignier|la roche-sur-foron|bonneville|"
                   r"saint-julien-en-genevois|thonon|bons-en-chablais|machilly|perrignier|saint-cergues|cranves|"
                   r"étrembières|etrembieres|collonges-sous-sal|archamps|saint-pierre-en-faucigny", re.I)
URL_LOCAL = "https://www.hellowork.com/fr-fr/emploi/recherche.html?k={t}&l=Annemasse+74100&ray=30&p={p}"
EXCLU = re.compile(r"alternan|apprenti|stage|stagiaire|ing[ée]nieur|d[ée]veloppeur|comptable|freelance|"
                   r"ind[ée]pendant|auto-?entrepreneur|mandataire|VDI|agent commercial", re.I)


def detail(oid):
    t = get(f"https://www.hellowork.com/fr-fr/emplois/{oid}.html")
    t = re.sub(r"<script.*?</script>|<style.*?</style>", "", t, flags=re.S)
    t = html.unescape(re.sub(r"<[^>]+>", "\n", t))
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r"\n\s*\n+", "\n", t)
    a = t.find("Les missions du poste")
    if a < 0:
        a = t.find("Le poste")
    return t[max(a, 0):][:9000].strip()


def main():
    base = json.loads(FICHIER.read_text(encoding="utf-8")) if FICHIER.exists() else {}
    for terme, p, url in [(t, p, u) for t in TERMES for p in (1, 2) for u in (URL, URL_LOCAL)]:
            try:
                page = get(url.format(t=urllib.parse.quote(terme), p=p))
            except Exception as e:
                print(f"  ! {terme} p{p}: {e}", file=sys.stderr)
                continue
            for oid, label in ANCRE.findall(page):
                label = html.unescape(label)
                m = LABEL.match(label)
                if not m or not ("Télétravail complet" in label or LOCAL.search(m["lieu"])):
                    continue
                cle = "hw-" + oid
                if cle in base or EXCLU.search(m["titre"] + " " + m["contrat"]):
                    continue
                sal = re.search(r"salaire de ([^,]+)", m["reste"])
                base[cle] = {
                    "id": cle, "titre": m["titre"], "entreprise": m["ent"],
                    "lieu": ("Télétravail complet (" + m["lieu"] + ")") if "Télétravail complet" in label else m["lieu"],
                    "taux": [50, 100] if "partiel" in m["reste"] else [100, 100],
                    "contrat": m["contrat"].strip(), "salaire": sal.group(1) if sal else "",
                    "publie": "", "source": "HelloWork", "lien": f"https://www.hellowork.com/fr-fr/emplois/{oid}.html",
                    "candidature_simplifiee": False, "trouve_le": time.strftime("%Y-%m-%d"), "statut": "nouvelle",
                    "pays": "FR",
                }
            time.sleep(0.6)
    print(f"{len(base)} offres en base", file=sys.stderr)
    for o in base.values():
        if o.get("pays") == "FR" and "description" not in o:
            try:
                o["description"] = detail(o["id"][3:])
            except Exception as e:
                o["description"] = ""
                print(f"  ! détail {o['id']}: {e}", file=sys.stderr)
            time.sleep(0.4)
        o["score"], o["raisons"], o["alertes"] = noter(o)
    FICHIER.write_text(json.dumps(base, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
