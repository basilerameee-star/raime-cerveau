"""Ouvre le navigateur du serveur (raime-envoyeur, écran noVNC) pour que Basile se connecte à Whop (02/10/2026).
La session Whop ne survit pas à la fermeture du navigateur : elle est enregistrée toutes les 30 s dans /data/whop_etat.json,
que les agents (chercheur, soumetteur) rechargent. Se ferme quand /data/whop_fin existe (ou au bout d'une heure)."""
import os, sys
sys.path.insert(0, "/app")
from playwright.sync_api import sync_playwright
import serveur

DEPART = sys.argv[1] if len(sys.argv) > 1 else "https://whop.com/login"
with sync_playwright() as pw:
    ctx = pw.chromium.launch_persistent_context(
        str(serveur.DONNEES / "navigateur"), headless=False, locale="fr-FR", viewport={"width": 1366, "height": 900},
        args=["--disable-blink-features=AutomationControlled", "--no-sandbox", "--hide-crash-restore-bubble"])
    if os.path.exists("/data/whop_etat.json"):
        import json
        try:
            ctx.add_cookies(json.load(open("/data/whop_etat.json"))["cookies"])
        except Exception:
            pass
    pg = ctx.pages[0] if ctx.pages else ctx.new_page()
    pg.goto(DEPART)
    open("/data/whop_connexion.actif", "w").close()
    n = 0
    while not os.path.exists("/data/whop_fin") and n < 3600:
        try:
            ctx.pages[0].wait_for_timeout(1000)
        except Exception:
            pg = ctx.new_page()
            pg.goto(DEPART)
        n += 1
        if n % 30 == 0:
            ctx.storage_state(path="/data/whop_etat.json")
    ctx.storage_state(path="/data/whop_etat.json")
    ctx.close()
    os.remove("/data/whop_connexion.actif")
