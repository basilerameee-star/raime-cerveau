"""Sources en plus : LinkedIn (offres publiques, sans compte), recherche par employeur sur jobup/jobs.ch,
Michael Page. Ajoute à offres.json en dédoublonnant (même poste + même employeur = une seule offre).

python chasse_plus.py   (après chasse.py et chasse_fr.py, jamais en même temps)
"""
import html
import json
import re
import sys
import time
import urllib.parse

from chasse import DETAIL, EXCLU_TITRE, FICHIER, ZONE, description, get, noter, recherche

# Grands employeurs et agences cités par Basile (2026-10-01) + enseignes proches
EMPLOYEURS = ["Manor", "Globus", "Inditex", "Zara", "Massimo Dutti", "Pull&Bear", "Bershka", "Stradivarius",
              "Albedis", "Manpower", "Adecco", "Randstad", "Interiman", "Michael Page", "Kelly Services",
              "Migros", "Coop", "Fnac", "Jelmoli", "Bucherer", "Swatch", "Nespresso", "Apple", "Sephora",
              "Lacoste", "Hugo Boss", "Uniqlo", "Decathlon", "Ochsner Sport", "Balexert",
              # agences d'intérim et de recrutement actives en Suisse romande
              "Kelly", "Gi Group", "Careerplus", "Helvetic Emploi", "PGN", "Actual", "One Placement", "Flexsis",
              "Synergie", "Proman", "Start People", "Hays", "Robert Walters", "Axepta", "Interima",
              "Work Selection", "Mega Personnel", "Partner Job", "Prime Job", "Academic Work", "Page Personnel",
              "Hudson", "Spring Professional", "Experis", "Kelly Services", "Valjob", "Adia"]
LI_TERMES = ["vendeur", "conseiller de vente", "sales advisor", "sales associate", "client advisor",
             "commercial", "business developer", "account manager", "store manager", "conseiller clientèle",
             "vente", "retail"] + EMPLOYEURS[:16]
LI_LIEUX = ["Genève, Suisse", "Lausanne, Suisse", "Nyon, Suisse", "Morges, Suisse"]
LI_URL = ("https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?"
          "keywords={k}&location={l}&f_TPR=r1209600&start={s}")
LI_DETAIL = "https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/{id}"
MP_URL = "https://www.michaelpage.ch/fr/jobs/{k}/{l}"


def cle(titre, entreprise):
    t = re.sub(r"\(.*?\)|\d+\s*%|\b(h/f|f/h|m/f|f/m|h/f/d|m/w|m/f/d|f/h/d)\b", "", titre.lower())
    return re.sub(r"\W+", "", t)[:40] + "|" + re.sub(r"\W+", "", entreprise.lower())[:12]


def texte(fragment):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", fragment))).strip()


def linkedin(k, l):
    for s in (0, 25, 50):
        try:
            page = get(LI_URL.format(k=urllib.parse.quote(k), l=urllib.parse.quote(l), s=s))
        except Exception as e:
            print(f"  ! linkedin {k}/{l}: {e}", file=sys.stderr)
            return
        cartes = page.split("<li>")[1:]
        if not cartes:
            return
        for c in cartes:
            m = re.search(r'href="(https://[a-z]+\.linkedin\.com/jobs/view/[^"?]*-(\d+))(?=[?"])', c)
            titre = re.search(r'base-search-card__title">(.*?)</h3>', c, re.S)
            ent = re.search(r'base-search-card__subtitle">(.*?)</h4>', c, re.S)
            lieu = re.search(r'job-search-card__location">(.*?)</span>', c, re.S)
            date = re.search(r'datetime="([^"]+)"', c)
            if m and titre:
                yield {"lid": m.group(2), "lien": m.group(1), "titre": texte(titre.group(1)),
                       "entreprise": texte(ent.group(1)) if ent else "", "lieu": texte(lieu.group(1)) if lieu else "",
                       "publie": date.group(1) if date else ""}
        time.sleep(1.5)


def linkedin_desc(lid):
    p = get(LI_DETAIL.format(id=lid))
    m = re.search(r'show-more-less-html__markup[^>]*>(.*?)</div>', p, re.S)
    if not m:
        return ""
    t = re.sub(r"<br\s*/?>|</li>|</p>", "\n", m.group(1)).replace("<li>", "• ")
    t = html.unescape(re.sub(r"<[^>]+>", "", t))
    return re.sub(r"\n\s*\n+", "\n", t).strip()[:9000]


def manor():
    """Site carrières Manor (live.solique.ch) : Genève et Vaud, toutes les pages."""
    for region in ("6-GE*", "6-VD*"):
        for page in range(1, 8):
            try:
                p = get(f"https://live.solique.ch/manor/fr/?location={urllib.parse.quote(region)}&page={page}")
            except Exception:
                break
            lignes = re.findall(r'job/details/(\d+)/">([^<]+)</a></span><br />\s*<span class="job-row-3">(.*?)</span>', p, re.S)
            if not lignes:
                break
            for jid, titre, infos in lignes:
                infos = [texte(x) for x in infos.split("<i> | </i>")]
                taux = [int(x) for x in re.findall(r"(\d+)%", " ".join(infos))]
                yield {"id": "manor-" + jid, "titre": html.unescape(titre).strip(), "entreprise": "Manor",
                       "lieu": infos[0] if infos else "", "taux": taux[:1] * 2 if taux else [],
                       "contrat": infos[2] if len(infos) > 2 else "", "source": "Manor",
                       "lien": f"https://live.solique.ch/manor/job/details/{jid}/"}
            time.sleep(0.6)


def globus():
    """Site carrières Globus : toutes les offres, filtrées ensuite par la zone."""
    p = get("https://jobs.globus.ch/offre-emplois.html")
    for m in re.finditer(r'joboffer_title_text joboffer_box">\s*<a[^>]*href="([^"]+)">(.*?)</a>.*?'
                         r'joboffer_box">\s*(.*?)\s*</div>.*?fa-map-marker[^>]*></i>([^<]+)', p, re.S):
        lien, titre, taux, lieu = m.groups()
        t = [int(x) for x in re.findall(r"(\d+)\s*%", taux)]
        jid = re.search(r"-j(\d+)\.html", lien)
        yield {"id": "globus-" + (jid.group(1) if jid else lien[-12:]), "titre": html.unescape(titre).strip(),
               "entreprise": "Globus", "lieu": lieu.strip(), "taux": [min(t), max(t)] if t else [],
               "source": "Globus", "lien": lien}


def michael_page():
    for k in ("vente", "commercial", "retail"):
        for l in ("geneve", "lausanne", "vaud"):
            try:
                p = get(MP_URL.format(k=k, l=l))
            except Exception:
                continue
            for m in re.finditer(r'href="(/fr/job-detail/[^"]+/ref/([a-z0-9-]+))"', p):
                debut = p.find(">", m.end()) + 1
                bloc = texte(p[debut:debut + 1500]).split(" Sauvegarder")[0]
                yield {"ref": m.group(2), "lien": "https://www.michaelpage.ch" + m.group(1), "bloc": bloc}
            time.sleep(0.8)


def main():
    base = json.loads(FICHIER.read_text(encoding="utf-8"))
    vus = {cle(o["titre"], o["entreprise"]) for o in base.values()}
    ajout = 0

    def ajoute(oid, o):
        nonlocal ajout
        k = cle(o["titre"], o["entreprise"])
        if oid in base or k in vus or EXCLU_TITRE.search(o["titre"]):
            return
        vus.add(k)
        o.update({"id": oid, "trouve_le": time.strftime("%Y-%m-%d"), "statut": "nouvelle"})
        o.setdefault("taux", []); o.setdefault("contrat", ""); o.setdefault("candidature_simplifiee", False)
        base[oid] = o
        ajout += 1

    # 1. recherche par employeur sur jobup / jobs.ch
    for emp in EMPLOYEURS:
        for lieu in ("Genève", "Lausanne"):
            for site in ("jobup", "jobs.ch"):
                for r in recherche(site, emp, lieu, pages=1):
                    ajoute(r["id"], {"titre": r.get("title", ""), "entreprise": (r.get("company") or {}).get("name", ""),
                                     "lieu": r.get("place", ""), "taux": r.get("employmentGrades") or [],
                                     "publie": (r.get("publicationDate") or "")[:10], "source": site,
                                     "lien": DETAIL[site].format(id=r["id"]),
                                     "candidature_simplifiee": any(t.get("name") in ("quickApply", "easyApply")
                                                                   for t in r.get("listingTags", []))})
        print(f"employeur {emp} : +{ajout}", file=sys.stderr)
    # 2. LinkedIn
    for k in LI_TERMES:
        for l in LI_LIEUX:
            for r in linkedin(k, l):
                ajoute("li-" + r["lid"], {"titre": r["titre"], "entreprise": r["entreprise"], "lieu": r["lieu"],
                                         "publie": r["publie"], "source": "LinkedIn", "lien": r["lien"]})
        print(f"linkedin {k} : +{ajout}", file=sys.stderr)
    # 3. sites carrières des employeurs (Manor, Globus)
    for gen in (manor, globus):
        try:
            for r in gen():
                oid = r.pop("id")
                ajoute(oid, r)
        except Exception as e:
            print(f"  ! {gen.__name__}: {e}", file=sys.stderr)
        print(f"site {gen.__name__} : +{ajout}", file=sys.stderr)
    # 4. Michael Page
    for r in michael_page():
        b = r["bloc"]
        lieu = "Genève" if "Genève" in b else ("Lausanne" if "Lausanne" in b else "Vaud")
        ajoute("mp-" + r["ref"], {"titre": b.split(" Genève")[0].split(" Lausanne")[0][:120], "entreprise": "Michael Page (client)",
                                  "lieu": lieu, "source": "Michael Page", "lien": r["lien"]})
    # descriptions des nouvelles offres dans la zone
    for o in base.values():
        if o["statut"] == "nouvelle" and "description" not in o and ZONE.search(o.get("lieu") or ""):
            try:
                if o["source"] == "LinkedIn":
                    o["description"] = linkedin_desc(o["id"][3:]); time.sleep(1.2)
                elif o["source"] in ("Michael Page", "Manor", "Globus"):
                    o["description"] = texte(get(o["lien"]))[:9000]
                else:
                    o["description"] = description(o["source"], o["id"]); time.sleep(0.4)
            except Exception as e:
                o["description"] = ""
                print(f"  ! détail {o['id']}: {e}", file=sys.stderr)
        o["score"], o["raisons"], o["alertes"] = noter(o)
    FICHIER.write_text(json.dumps(base, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{ajout} nouvelles offres ajoutées, {len(base)} en base")


if __name__ == "__main__":
    main()
