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
    python cr_agent.py declarations                  # la liste réelle des déclarations du compte (API), avec vues et statut
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


def lire_brief(ctx, pg, cr_id):
    """Le brief d'une campagne rejointe, lu sur SA page (15/10/2026 : /requirements reste à 403 même après adhésion ; la
    page sert le brief par des actions Next.js) : le texte complet, puis les « Reference materials » (Google Docs publics
    lus en texte). (brief, None) si rejointe ; (None, raison) sinon."""
    pg.goto(FICHE + cr_id, wait_until="domcontentloaded", timeout=60000)
    pg.wait_for_timeout(5000)
    refuser_cookies(pg)
    o = obstacle(pg)
    if o:
        return None, o
    if not bouton(pg, r"submit clip"):
        return None, "pas rejointe"
    plus = pg.locator("button:visible, span:visible").filter(has_text=re.compile(r"^\s*show more\s*$", re.I))
    if plus.count():
        try:
            plus.first.click(timeout=3000)
            pg.wait_for_timeout(1000)
        except Exception:
            pass
    texte = pg.locator("main").first.inner_text() if pg.locator("main").count() else pg.inner_text("body")
    liens = pg.locator("a[href]").evaluate_all("els => els.map(e => e.href).filter(h => !h.includes('contentrewards.com'))")
    liens = list(dict.fromkeys(liens))[:20]
    documents = []
    for u in liens:
        m = re.search(r"docs\.google\.com/document/d/([\w-]{20,})", u)
        if m:
            try:
                r = ctx.request.get("https://docs.google.com/document/d/%s/export?format=txt" % m.group(1), timeout=30000)
                if r.ok:
                    documents.append({"lien": u, "texte": r.text()[:20000]})
            except Exception:
                pass
    return {"requirements": {"page": texte[:20000], "liens": liens, "documents": documents}}, None


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
    brief, raison = lire_brief(ctx, pg, cr_id)
    if brief:                                               # déjà rejointe
        return {"cr_id": cr_id, "ok": True, "deja": True, "brief": brief}
    if raison != "pas rejointe":
        return dict(bloquer(raison), cr_id=cr_id)
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
    brief, raison = lire_brief(ctx, pg, cr_id)
    if not brief:
        releve(pg, "rejoindre-" + cr_id)
        return {"cr_id": cr_id, "ok": False, "raison": "adhésion non confirmée (%s) ; relevé dans %s" % (raison, RELEVES)}
    return {"cr_id": cr_id, "ok": True, "brief": brief}


def releve(pg, nom):
    os.makedirs(RELEVES, exist_ok=True)
    base = os.path.join(RELEVES, time.strftime("%Y%m%d-%H%M%S-") + nom)
    try:
        pg.screenshot(path=base + ".png", full_page=True)
    except Exception:
        pass
    infos = {"url": pg.url, "boutons": [(t or "").strip() for t in pg.locator("button").all_inner_texts() if (t or "").strip()][:80],
             "champs": [(e.get_attribute("name") or e.get_attribute("placeholder") or "") for e in pg.locator("input, textarea").all()][:40]}
    with open(base + ".json", "w", encoding="utf-8") as f:
        json.dump(infos, f, ensure_ascii=False, indent=1)
    return infos


def identifiant(lien):
    """L'identifiant de la vidéo dans un lien (reel/<id>, shorts/<id>, watch?v=<id>, video/<id>) : les deux pages ne
    l'écrivent pas pareil (YouTube : shorts/ chez Buffer, watch?v= chez Content Rewards)."""
    m = re.search(r"[?&]v=([\w-]{6,})", lien) or re.search(r"/(?:reel|reels|p|shorts|video)/([\w-]{6,})", lien)
    return m.group(1) if m else lien.rstrip("/").split("/")[-1].split("?")[0]


SOUMISSIONS = SITE + "/api/submission/submissions?limit=50&creatorView=true&retainer=false&status=%s"


def declarations(ctx):
    """Toutes les déclarations du compte, lues par l'API que la page « Your submissions » appelle elle-même (22/10/2026 :
    la page n'affiche que des « View details », sans les liens : 14 clips déclarés passaient pour « absents »).
    Une ligne par clip : identifiant de la vidéo, plateforme, campagne, statut, vues comptées par Content Rewards."""
    out = []
    for statut in ("pending", "approved", "rejected"):
        curseur = None
        for _ in range(20):
            url = SOUMISSIONS % statut + ("&cursor=" + curseur if curseur else "")
            r = ctx.request.get(url, timeout=30000)
            if not r.ok:
                break
            d = r.json()
            for x in d.get("data") or []:
                post = x.get("socialMediaPost") or {}
                out.append({"post_id": str(post.get("postId") or identifiant(post.get("postUrl") or "")), "plateforme": post.get("platform"),
                            "lien": post.get("postUrl"), "campagne_cr": x.get("campaignId"), "campagne_nom": x.get("campaignName"),
                            "statut": x.get("status") or statut, "revue": x.get("reviewStatus"), "vues": int(post.get("views") or 0),
                            "le": x.get("createdAt")})
            curseur = (d.get("pagination") or {}).get("nextCursor")
            if not curseur:
                break
    return out


def deja_declare(ctx, cr_id, lien, pg=None):
    """Le lien figure-t-il parmi les déclarations du compte ? D'abord par l'API (sûr), sinon par les liens « Open on … »
    de la page /c/submissions (relevé le 15/10/2026)."""
    try:
        if identifiant(lien) in {d["post_id"] for d in declarations(ctx)}:
            return True
    except Exception:
        pass
    pg = pg or ctx.new_page()
    try:
        pg.goto(SITE + "/c/submissions", wait_until="domcontentloaded", timeout=60000)
        pg.wait_for_timeout(6000)
        refuser_cookies(pg)
        liens = pg.locator("a[href]").evaluate_all("els => els.map(e => e.href)")
        return identifiant(lien) in {identifiant(h) for h in liens if "contentrewards.com" not in h}
    except Exception:
        return False


def soumettre(ctx, pg, cr_id, lien, essai=False):
    """Déclarer un lien dans sa campagne (fenêtre relevée le 15/10/2026 : champ du lien, trois contrôles « compte relié »,
    « pas déjà déclaré », « publié il y a moins de 30 minutes », case des consignes, bouton « Submit clip »), puis vérifier
    qu'il apparaît dans les déclarations du compte."""
    if deja_declare(ctx, cr_id, lien, pg):
        return {"ok": True, "verifie": True, "deja": True}
    pg.goto(FICHE + cr_id, wait_until="domcontentloaded", timeout=60000)
    pg.wait_for_timeout(5000)
    refuser_cookies(pg)
    o = obstacle(pg)
    if o:
        return bloquer(o)
    # une fenêtre d'annonce ouverte au chargement (fond « fixed inset-0 bg-black/45 », 21/10/2026) prenait le clic : Échap
    pg.keyboard.press("Escape")
    pg.wait_for_timeout(600)
    b = bouton(pg, r"submit clip")
    if not b:
        # 22/10/2026 : 14 clips perdus sur des campagnes non rejointes : on la rejoint maintenant, puis on réessaie une fois
        j = rejoindre(ctx, pg, cr_id)
        if j.get("bloque"):
            return j
        pg.goto(FICHE + cr_id, wait_until="domcontentloaded", timeout=60000)
        pg.wait_for_timeout(5000)
        refuser_cookies(pg)
        pg.keyboard.press("Escape")
        pg.wait_for_timeout(600)
        b = bouton(pg, r"submit clip")
    if not b:
        releve(pg, "soumettre-" + cr_id)
        return {"ok": False, "raison": "bouton « Submit clip » absent même après « Join » (%s) ; relevé dans %s"
                % (j.get("raison") or "adhésion refusée", RELEVES)}
    try:
        b.click(timeout=15000)
    except Exception:
        pg.keyboard.press("Escape")
        pg.wait_for_timeout(800)
        b.click(timeout=15000)
    pg.wait_for_timeout(3000)
    champ = pg.locator("input[placeholder*='http' i]:visible")
    if not champ.count():
        releve(pg, "fenetre-" + cr_id)
        return {"ok": False, "raison": "champ du lien introuvable ; relevé dans " + RELEVES}
    champ.first.fill(lien)
    pg.wait_for_timeout(6000)                               # les trois contrôles de Content Rewards se font en direct
    # la case « I've read the requirements… » : on clique son texte (la case elle-même est un élément décoré)
    accord = pg.get_by_text(re.compile(r"read the requirements", re.I))
    if not accord.count():
        releve(pg, "case-" + cr_id)
        return {"ok": False, "raison": "case des consignes introuvable ; relevé dans " + RELEVES}
    accord.last.click(timeout=10000, force=True)
    pg.wait_for_timeout(1500)
    envoyer = pg.locator("button:visible").filter(has_text=re.compile(r"^\s*submit clip\s*$", re.I)).last
    fenetre = pg.locator("[role=dialog]").first.inner_text()[:600] if pg.locator("[role=dialog]").count() else ""
    if re.search(r"isn.t taking new clips|not accepting (new )?(clips|submissions)", fenetre, re.I):
        releve(pg, "fermee-" + cr_id)
        return {"ok": False, "ferme": True, "raison": "Content Rewards : la campagne n'accepte plus de clips pour l'instant"}
    if not envoyer.count() or not envoyer.is_enabled():
        infos = releve(pg, "refus-" + cr_id)
        refus = pg.locator("[role=dialog]").first.inner_text()[:600] if pg.locator("[role=dialog]").count() else ""
        return {"ok": False, "raison": "Content Rewards refuse le lien (contrôles non validés) : " + refus.replace("\n", " | "), "releve": infos}
    if essai:                                               # essai à blanc : tout est rempli, rien n'est envoyé
        return {"ok": True, "verifie": False, "essai": True, "releve": releve(pg, "essai-" + cr_id)}
    # 22/10/2026 : on quittait la page pendant « Submitting… » (les contrôles de Content Rewards prennent plus de 6 s) :
    # le clip n'arrivait jamais. On garde la réponse de l'API d'envoi et on attend la fin de l'envoi (90 s au plus).
    api = []
    pg.on("response", lambda r: api.append(r) if "/api/submission" in r.url and r.request.method == "POST" else None)
    envoyer.click(timeout=15000)
    for _ in range(45):
        pg.wait_for_timeout(2000)
        if not pg.get_by_text(re.compile(r"submitting", re.I)).count():
            break
    for r in api[-1:]:
        try:
            corps = r.text()[:300]
        except Exception:
            corps = ""
        if not r.ok:
            releve(pg, "api-refus-" + cr_id)
            return {"ok": False, "raison": "Content Rewards refuse l'envoi (HTTP %d) : %s" % (r.status, corps)}
    # ce que Content Rewards répond au clic (fenêtre, bandeau d'erreur ou de succès), lu AVANT de quitter la page : sans
    # lui, un refus ne laissait aucune trace (« lien envoyé mais absent », 21/10/2026)
    reponse = " | ".join((t or "").strip() for t in pg.locator("[role=dialog], [role=alert], [role=status], [data-sonner-toast]")
                         .all_inner_texts() if (t or "").strip())[:400]
    releve(pg, "apres-envoi-" + cr_id)
    pg.wait_for_timeout(3500)
    o = obstacle(pg)
    if o:
        return bloquer(o)
    ok = deja_declare(ctx, cr_id, lien, pg)
    if not ok:
        releve(pg, "verif-" + cr_id)
    return {"ok": ok, "verifie": ok, "reponse": reponse,
            "raison": "" if ok else "lien envoyé mais absent des déclarations du compte (réponse : %s) ; relevé dans %s" % (reponse or "aucune", RELEVES)}


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
            elif args[0] == "declarations":
                print(json.dumps(declarations(ctx), ensure_ascii=False), flush=True)
            elif args[0] == "soumettre":
                print(json.dumps(soumettre(ctx, pg, args[1], args[2], essai="--essai" in args), ensure_ascii=False), flush=True)
        finally:
            ctx.close()


if __name__ == "__main__":
    main(sys.argv[1:] or ["etat"])
