"""Lu dans le conteneur raime-envoyeur (02/10/2026) : Content Rewards se lit SANS connexion (navigateur neuf, aucun
profil, donc aucun conflit avec l'Envoyeur). Sortie JSON sur la sortie standard.
  python whop_lire.py liste               → {"texte": texte de la page Discover}
  python whop_lire.py fiche "Nom" ...     → {"fiches": [{"nom", "url", "texte", "liens"}]}
"""
import json, sys
sys.path.insert(0, "/tmp")
from playwright.sync_api import sync_playwright

APP = "https://whop.com/discover/app/app_QRxsQodZgK1r4D/"


def cadre(pg):
    for _ in range(45):
        f = next((f for f in pg.frames if "apps.whop.com" in f.url), None)
        if f:
            return f
        pg.wait_for_timeout(1000)
    raise RuntimeError("application introuvable")


def refuser(lieu):
    b = lieu.locator("button")
    for i in range(min(b.count(), 60)):
        try:
            if b.nth(i).inner_text().strip().lower() in ("decline", "reject all", "tout refuser"):
                b.nth(i).click()
                return
        except Exception:
            pass


def charger(nav):
    pg = nav.new_page(locale="fr-FR", viewport={"width": 1366, "height": 900})
    pg.goto(APP, wait_until="domcontentloaded", timeout=60000)
    app = cadre(pg)
    pg.wait_for_timeout(6000)
    refuser(pg)
    refuser(app)
    pg.wait_for_timeout(1000)
    return pg, app


with sync_playwright() as pw:
    nav = pw.chromium.launch(headless=False, args=["--no-sandbox", "--disable-blink-features=AutomationControlled"])
    sortie = {}
    if sys.argv[1] == "liste":
        pg, app = charger(nav)
        for _ in range(10):
            pg.mouse.wheel(0, 2500)
            pg.wait_for_timeout(1500)
        sortie["texte"] = app.inner_text("body")
    else:
        sortie["fiches"] = []
        for nom in sys.argv[2:]:
            pg, app = charger(nav)
            try:
                c = app.get_by_text(nom, exact=False)
                for _ in range(10):
                    if c.count():
                        break
                    pg.mouse.wheel(0, 2000)
                    pg.wait_for_timeout(1200)
                c.first.click()
                pg.wait_for_timeout(7000)
                app = cadre(pg)
                liens = app.eval_on_selector_all("a[href]", "els => els.map(e => [(e.innerText||'').trim().slice(0,60), e.href])")
                sortie["fiches"].append({"nom": nom, "url": app.url, "texte": app.inner_text("body")[:12000],
                                         "liens": [l for l in liens if "apps.whop.com" not in l[1]]})
            except Exception as e:
                sortie["fiches"].append({"nom": nom, "erreur": str(e)[:200]})
            pg.close()
    nav.close()
print(json.dumps(sortie, ensure_ascii=False))
