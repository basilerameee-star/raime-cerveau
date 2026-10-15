"""La connexion de Basile à Content Rewards, une seule fois, dans le navigateur du serveur (15/10/2026).

Lancé dans raime-envoyeur sur l'écran noVNC (https://cockpit.raime.fr/navigateur/vnc.html?path=navigateur/websockify
&autoconnect=true&resize=scale) : Basile s'y connecte lui-même (aucun mot de passe ne passe par Claude ni par le dépôt).
Profil à part (/data/cr_profil) : aucun conflit avec l'Envoyeur. Se ferme seul dès que la session est reconnue, ou au
bout de 30 minutes ; /data/cr_connecte reçoit alors la date. L'agent de soumission (cr_agent.py) réutilise ce profil.
    python cr_connexion.py
"""
import time

from playwright.sync_api import sync_playwright

PROFIL = "/data/cr_profil"
CONNEXION = "https://contentrewards.com/login?next=%2Fc%2Fdiscover"
# réservé aux comptes connectés : 401 sans session (vérifié le 15/10/2026)
TEMOIN = "https://contentrewards.com/api/campaign/campaigns/58795e60-259f-4f9d-932c-87cf1aac7c8d/requirements"


def connecte(ctx):
    try:
        return ctx.request.get(TEMOIN, timeout=20000).status in (200, 403)
    except Exception:
        return False


with sync_playwright() as pw:
    ctx = pw.chromium.launch_persistent_context(
        PROFIL, headless=False, locale="fr-FR", viewport={"width": 1280, "height": 860},
        args=["--disable-blink-features=AutomationControlled", "--no-sandbox", "--hide-crash-restore-bubble"])
    pg = ctx.pages[0] if ctx.pages else ctx.new_page()
    ok = connecte(ctx)
    if not ok:
        pg.goto(CONNEXION, wait_until="domcontentloaded", timeout=60000)
        fin = time.time() + 1800
        while time.time() < fin and not ok:
            pg.wait_for_timeout(5000)
            ok = connecte(ctx)
    if ok:
        with open("/data/cr_connecte", "w") as f:
            f.write(time.strftime("%Y-%m-%d %H:%M"))
        pg.goto("https://contentrewards.com/c/discover", wait_until="domcontentloaded", timeout=60000)
        pg.wait_for_timeout(4000)
    ctx.close()
print("connecté" if ok else "pas de connexion en 30 minutes", flush=True)
