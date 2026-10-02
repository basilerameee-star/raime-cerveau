"""Outils communs des agents Whop (02/10/2026), dans raime-envoyeur : navigateur rechargé avec la session de Basile
(/data/whop_etat.json), cookies refusés, cadre de l'application Content Rewards, ouverture d'une campagne par son nom."""
import json, os

ETAT = "/data/whop_etat.json"
APP = "https://whop.com/discover/app/app_QRxsQodZgK1r4D/"


def ouvrir(pw):
    nav = pw.chromium.launch(headless=False, args=["--disable-blink-features=AutomationControlled", "--no-sandbox"])
    ctx = nav.new_context(storage_state=ETAT if os.path.exists(ETAT) else None, locale="fr-FR",
                          viewport={"width": 1366, "height": 900})
    pg = ctx.new_page()
    pg.goto(APP, wait_until="domcontentloaded", timeout=60000)
    app = cadre(pg)
    pg.wait_for_timeout(5000)
    refuser_cookies(pg)
    refuser_cookies(app)
    return nav, ctx, pg, app


def fermer(nav, ctx):
    try:
        ctx.storage_state(path=ETAT)                       # la session rafraîchie est gardée pour le passage suivant
    finally:
        nav.close()


def cadre(pg):
    for _ in range(45):
        f = next((f for f in pg.frames if "apps.whop.com" in f.url), None)
        if f:
            return f
        pg.wait_for_timeout(1000)
    raise RuntimeError("application Content Rewards introuvable")


def refuser_cookies(lieu):
    """Toujours le choix le plus discret : refuser les cookies non nécessaires."""
    for sel in ("[role=dialog][aria-label='Cookie consent'] button", "button"):
        b = lieu.locator(sel)
        for i in range(min(b.count(), 40)):
            try:
                t = b.nth(i).inner_text().strip().lower()
            except Exception:
                continue
            if t in ("decline", "reject all", "tout refuser", "refuser"):
                b.nth(i).click()
                lieu.wait_for_timeout(1200) if hasattr(lieu, "wait_for_timeout") else None
                return True
    return False


def connecte(pg, app):
    """Vrai si whop.com et l'application reconnaissent Basile (pas de « Se connecter » / « Sign in »)."""
    haut = pg.inner_text("body")[:1500]
    return "Se connecter" not in haut and "Sign in" not in app.inner_text("body")[:800]


def ouvrir_campagne(pg, app, nom, groupe=None):
    """Ouvre la fiche d'une campagne : par son nom, ou par le nom de son groupe (« 5 campaigns ») puis son nom."""
    for etape in [x for x in (groupe, nom) if x]:
        c = app.get_by_text(etape, exact=False)
        for _ in range(10):
            if c.count():
                break
            pg.mouse.wheel(0, 1500)
            pg.wait_for_timeout(1200)
        if not c.count():
            raise RuntimeError("campagne introuvable : %s" % etape)
        c.last.click()
        pg.wait_for_timeout(6000)
        app = cadre(pg)
    return app
