"""L'agent Content Rewards de KinGKlip (15/10/2026) : il REJOINT les campagnes retenues par le pilote, lit leur brief, et
DÉCLARE chaque clip publié dans sa campagne, avec la session de Basile (profil /data/cr_profil, connexion faite une fois
par lui sur l'écran noVNC : cr_connexion.py). Lancé dans raime-envoyeur sur l'écran :99, par pilote.py et declarer.py.

Règles (Basile, 15/10/2026) : jamais de contournement de captcha, aucun cookie extrait (le profil reste dans le conteneur),
aucune autre action que rejoindre, lire le brief et déclarer un lien. Captcha, page de connexion ou blocage : arrêt propre,
/data/cr_bloque reçoit la raison (declarer.py et pilote.py n'envoient alors qu'UNE alerte), et rien n'est retenté avant
une nouvelle connexion de Basile.

    python cr_agent.py etat
    python cr_agent.py relever <cr_id>               # capture et relevé de la page (diagnostic)
    python cr_agent.py rejoindre <cr_id> [...]       # une ligne JSON par campagne : {"cr_id", "ok", "brief"|"raison"}
    python cr_agent.py soumettre <cr_id> <lien>      # {"ok", "verifie", "raison"}
"""
import json
import os
import re
import sys
import time

PROFIL = "/data/cr_profil"
BLOQUE = "/data/cr_bloque"
RELEVES = "/data/cr_releves"
SITE = "https://contentrewards.com"
FICHE = SITE + "/c/campaigns/"
API = SITE + "/api/campaign/campaigns/"
CAPTCHA = ("recaptcha", "hcaptcha", "turnstile", "challenges.cloudflare", "captcha")


def bloquer(raison):
    with open(BLOQUE, "w", encoding="utf-8") as f:
        f.write(time.strftime("%Y-%m-%d %H:%M ") + raison)
    return {"ok": False, "raison": raison, "bloque": True}


def refuser_cookies(pg):
    """Le bandeau des cookies : toujours « Decline » (le plus discret)."""
    b = pg.get_by_role("button", name=re.compile(r"^decline$", re.I))
    if b.count():
        try:
            b.first.click(timeout=3000)
        except Exception:
            pass
    # les fenêtres d'information (ex. « YouTube isn't sending demographics », 15/10/2026) : « Got it », rien d'autre
    for _ in range(3):
        g = pg.locator("button:visible").filter(has_text=re.compile(r"^\s*got it\s*$", re.I))
        if not g.count():
            break
        try:
            g.first.click(timeout=3000)
            pg.wait_for_timeout(800)
        except Exception:
            break


def obstacle(pg):
    """Une raison d'arrêter (captcha, connexion perdue), ou None. On ne touche jamais au captcha."""
    if "/login" in pg.url or "/sign-in" in pg.url:
        return "session Content Rewards expirée : Basile doit se reconnecter une fois"
    if "/onboarding" in pg.url:
        return "profil Content Rewards à finir (nom, téléphone, comptes) : Basile le remplit une fois"
    for fr in pg.frames:
        if any(c in (fr.url or "").lower() for c in CAPTCHA):
            return "captcha affiché par Content Rewards"
    return None


def textes(x, out=None):
    """Toutes les chaînes d'une réponse JSON (le format du brief n'est pas documenté) : on garde tout le texte."""
    out = [] if out is None else out
    if isinstance(x, dict):
        for v in x.values():
            textes(v, out)
    elif isinstance(x, list):
        for v in x:
            textes(v, out)
    elif isinstance(x, str) and x.strip():
        out.append(x.strip())
    return out


def lire_brief(ctx, cr_id):
    """Le brief d'une campagne rejointe (/requirements : 401 sans session, vérifié le 15/10/2026), et sa fiche complète."""
    r = ctx.request.get(API + cr_id + "/requirements", timeout=30000)
    if r.status != 200:
        return None, r.status
    brief = r.json()
    try:
        fiche = ctx.request.get(API + cr_id, timeout=30000).json()
    except Exception:
        fiche = {}
    return {"requirements": brief, "fiche": fiche}, 200


def ouvrir(pw):
    ctx = pw.chromium.launch_persistent_context(
        PROFIL, headless=False, locale="en-US", viewport={"width": 1280, "height": 860},
        args=["--disable-blink-features=AutomationControlled", "--no-sandbox", "--hide-crash-restore-bubble"])
    return ctx, (ctx.pages[0] if ctx.pages else ctx.new_page())


def bouton(pg, *noms):
    """Le premier bouton VISIBLE dont le texte correspond (le nom accessible peut porter une icône : on lit le texte)."""
    for n in noms:
        b = pg.locator("button:visible, a[role=button]:visible").filter(has_text=re.compile(n.strip("^$"), re.I))
        if b.count():
            return b.first
    return None


def rejoindre(ctx, pg, cr_id):
    brief, statut = lire_brief(ctx, cr_id)
    if brief:                                               # déjà rejointe
        return {"cr_id": cr_id, "ok": True, "deja": True, "brief": brief}
    if statut == 401:
        return dict(bloquer("session Content Rewards expirée : Basile doit se reconnecter une fois"), cr_id=cr_id)
    pg.goto(FICHE + cr_id, wait_until="domcontentloaded", timeout=60000)
    pg.wait_for_timeout(4000)
    refuser_cookies(pg)
    o = obstacle(pg)
    if o:
        return dict(bloquer(o), cr_id=cr_id)
    b = bouton(pg, r"^join campaign$", r"^join$")
    if not b:
        return {"cr_id": cr_id, "ok": False, "raison": "bouton « Join Campaign » absent (candidature ou campagne fermée ?)"}
    pg.wait_for_timeout(2000)
    refuser_cookies(pg)                                     # les fenêtres d'information arrivent parfois après le chargement
    b.click(timeout=15000)
    pg.wait_for_timeout(5000)
    o = obstacle(pg)
    if o:
        return dict(bloquer(o), cr_id=cr_id)
    # une fenêtre de confirmation peut suivre (règles de la campagne) : on la valide, rien d'autre
    c = bouton(pg, r"^join campaign$", r"^join$", r"^confirm", r"^continue$", r"^i agree", r"^accept")
    if c and not c.is_enabled():
        infos = releve(pg, "fenetre-rejoindre-" + cr_id)
        return {"cr_id": cr_id, "ok": False, "raison": "fenêtre d'adhésion à remplir", "releve": infos}
    if c:
        c.click()
        pg.wait_for_timeout(5000)
    brief, statut = lire_brief(ctx, cr_id)
    if not brief:
        releve(pg, "rejoindre-" + cr_id)
        return {"cr_id": cr_id, "ok": False, "raison": "rejointe ? le brief reste fermé (%s) ; relevé dans %s" % (statut, RELEVES)}
    return {"cr_id": cr_id, "ok": True, "brief": brief}


def releve(pg, nom):
    os.makedirs(RELEVES, exist_ok=True)
    base = os.path.join(RELEVES, time.strftime("%Y%m%d-%H%M%S-") + nom)
    try:
        pg.screenshot(path=base + ".png", full_page=True)
    except Exception:
        pass
    infos = {"url": pg.url, "boutons": [t.strip() for t in pg.locator("button").all_inner_texts() if t.strip()][:80],
             "champs": [(e.get_attribute("name") or e.get_attribute("placeholder") or "") for e in pg.locator("input, textarea").all()][:40]}
    with open(base + ".json", "w", encoding="utf-8") as f:
        json.dump(infos, f, ensure_ascii=False, indent=1)
    return infos


def soumettre(ctx, pg, cr_id, lien):
    """Déclarer un lien dans sa campagne, puis vérifier qu'il apparaît dans les déclarations de la campagne."""
    pg.goto(FICHE + cr_id, wait_until="domcontentloaded", timeout=60000)
    pg.wait_for_timeout(4000)
    refuser_cookies(pg)
    o = obstacle(pg)
    if o:
        return bloquer(o)
    if lien in pg.content():
        return {"ok": True, "verifie": True, "deja": True}
    b = bouton(pg, r"submit (a )?(clip|post|video|content)", r"^submit$", r"new submission")
    if not b:
        releve(pg, "soumettre-" + cr_id)
        return {"ok": False, "raison": "bouton de déclaration introuvable ; relevé dans " + RELEVES}
    b.click()
    pg.wait_for_timeout(3000)
    champ = pg.locator("input[type=url], input[placeholder*='http' i], input[placeholder*='link' i], input[placeholder*='url' i]")
    if not champ.count():
        releve(pg, "fenetre-" + cr_id)
        return {"ok": False, "raison": "champ du lien introuvable ; relevé dans " + RELEVES}
    champ.first.fill(lien)
    pg.wait_for_timeout(1500)
    envoyer = bouton(pg, r"^submit", r"^send", r"^confirm")
    if not envoyer:
        releve(pg, "envoi-" + cr_id)
        return {"ok": False, "raison": "bouton d'envoi introuvable ; relevé dans " + RELEVES}
    envoyer.click()
    pg.wait_for_timeout(6000)
    o = obstacle(pg)
    if o:
        return bloquer(o)
    # la preuve : le lien figure dans la page de la campagne rechargée (les déclarations du compte)
    pg.goto(FICHE + cr_id, wait_until="domcontentloaded", timeout=60000)
    pg.wait_for_timeout(5000)
    ok = lien in pg.content()
    if not ok:
        releve(pg, "verif-" + cr_id)
    return {"ok": ok, "verifie": ok, "raison": "" if ok else "lien envoyé mais absent de la page de la campagne ; relevé dans " + RELEVES}


def main(args):
    from playwright.sync_api import sync_playwright
    if args[0] not in ("etat", "relever") and os.path.exists(BLOQUE):
        print(json.dumps({"ok": False, "bloque": True, "raison": open(BLOQUE, encoding="utf-8").read()}), flush=True)
        return
    with sync_playwright() as pw:
        ctx, pg = ouvrir(pw)
        try:
            if args[0] == "etat":
                # le témoin : session reconnue ET une fiche de campagne qui s'ouvre sans détour ; le blocage se lève alors seul
                r = ctx.request.get(API + "58795e60-259f-4f9d-932c-87cf1aac7c8d/requirements", timeout=20000).status
                pg.goto(FICHE + "58795e60-259f-4f9d-932c-87cf1aac7c8d", wait_until="domcontentloaded", timeout=60000)
                pg.wait_for_timeout(4000)
                o = obstacle(pg) if r in (200, 403) else "session Content Rewards expirée : Basile doit se reconnecter une fois"
                if not o and os.path.exists(BLOQUE):
                    os.remove(BLOQUE)
                print(json.dumps({"connecte": r in (200, 403), "statut": r, "obstacle": o}, ensure_ascii=False), flush=True)
            elif args[0] == "relever":
                pg.goto(FICHE + args[1], wait_until="domcontentloaded", timeout=60000)
                pg.wait_for_timeout(5000)
                refuser_cookies(pg)
                print(json.dumps(releve(pg, "releve-" + args[1]), ensure_ascii=False), flush=True)
            elif args[0] == "rejoindre":
                for cid in args[1:]:
                    r = rejoindre(ctx, pg, cid)
                    print(json.dumps(r, ensure_ascii=False), flush=True)
                    if r.get("bloque"):
                        break
            elif args[0] == "soumettre":
                print(json.dumps(soumettre(ctx, pg, args[1], args[2]), ensure_ascii=False), flush=True)
        finally:
            ctx.close()


if __name__ == "__main__":
    main(sys.argv[1:] or ["etat"])
