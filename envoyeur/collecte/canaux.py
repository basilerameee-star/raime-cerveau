"""Repère le vrai canal de candidature de chaque fiche validée (jobup / jobs.ch : données de la page d'annonce).

python canaux.py -> canaux.json {id: {methode, url_externe, email, source, lien}}
"""
import glob
import json
import re
import time
from pathlib import Path

from chasse import get

ICI = Path(__file__).parent


def canal_jobcloud(lien):
    p = get(lien)
    i = p.find("__REACT_QUERY_STATE__ = ")
    out = {"methode": "", "url_externe": "", "email": ""}
    if i < 0:
        return out
    bloc = p[i:i + 400000].replace("undefined", "null")
    m = re.search(r'"applicationOptions":\{([^{}]*)\}', bloc)
    if m:
        opts = json.loads("{" + m.group(1) + "}")
        out["methode"] = opts.get("method", "")
        out["url_externe"] = (opts.get("url") or opts.get("externalUrl") or "").replace("\\u002F", "/")
        out["email"] = opts.get("email") or ""
        out["brut"] = opts
    return out


def main():
    res = {}
    for f in glob.glob(str(ICI / "lecture_db" / "offres" / "*.json")):
        d = json.load(open(f, encoding="utf-8"))
        d = d.get("data", d)
        oid = Path(f).stem
        r = {"source": d["source"], "lien": d["lien"], "titre": d["titre"], "entreprise": d["entreprise"]}
        if d["source"] in ("jobup", "jobs.ch"):
            try:
                r.update(canal_jobcloud(d["lien"]))
            except Exception as e:
                r["erreur"] = str(e)
            time.sleep(0.5)
        res[oid] = r
    (ICI / "canaux.json").write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
    from collections import Counter
    print(Counter((r["source"], r.get("methode", "")) for r in res.values()))


if __name__ == "__main__":
    main()
