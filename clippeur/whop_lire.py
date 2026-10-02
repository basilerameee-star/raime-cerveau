"""Lu dans le conteneur raime-envoyeur (navigateur du serveur, session Whop de Basile) : le texte de la page Discover de
Content Rewards, après défilement, sur la sortie standard. Utilisé par clippeur/chercheur.py (02/10/2026)."""
import sys, time
sys.path.insert(0, "/app")
from playwright.sync_api import sync_playwright
import serveur

with sync_playwright() as pw:
    ctx = serveur.contexte(pw)
    pg = ctx.pages[0] if ctx.pages else ctx.new_page()
    texte = ""
    for adresse in ("https://whop.com/discover/app/app_QRxsQodZgK1r4D/",):
        pg.goto(adresse, wait_until="domcontentloaded", timeout=60000)
        time.sleep(8)
        for _ in range(10):
            pg.mouse.wheel(0, 2500)
            time.sleep(1.5)
        for fr in pg.frames:                               # l'application vit dans un cadre (apps.whop.com)
            if "apps.whop.com" in fr.url:
                try:
                    texte += fr.inner_text("body") + "\n"
                except Exception:
                    pass
    ctx.close()
print(texte)
