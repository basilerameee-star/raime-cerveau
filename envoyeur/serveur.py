"""L'Envoyeur de Jarvis, sur le serveur, 24 h/24 (02/10/2026) — sans Claude, sans frais.

Boucle : toutes les 15 minutes, il prend la file des candidatures validées dans Jarvis et postule ; chaque matin (7 h),
il collecte les offres et les envoie à Jarvis, qui écrit les fiches avec les modèles gratuits.
Son navigateur (Chromium, profil /data/navigateur) tourne dans un écran virtuel visible par Basile via
cockpit.raime.fr/navigateur/ (derrière le mot de passe du Cockpit) : Basile s'y connecte une fois aux sites ;
l'Envoyeur ne voit ni ne stocke aucun mot de passe.

Données (HORS dépôt, volume /data) : jeton.txt, profil_candidat.json, cv/*.pdf, offres.json, deja_dans_jarvis.json.
Commandes : python serveur.py                      -> la boucle
            python serveur.py connexion [url…]     -> ouvre les pages de connexion (Basile se connecte ; 30 min au plus,
                                                      fin anticipée : touch /data/connexion_fin) ; la boucle est en pause
            python serveur.py passage              -> un passage d'envoi tout de suite
            python serveur.py collecte             -> une collecte tout de suite
            python serveur.py essai <id> [canal]   -> essai à blanc sur une offre : tout est rempli, RIEN n'est envoyé,
                                                      une capture par étape dans /data/echecs
"""
import json
import os
import re
import sys
import time
import traceback
import urllib.request
from contextlib import contextmanager
from pathlib import Path

from playwright.sync_api import sync_playwright

import michaelpage
from jobcloud import AToi, postuler

DONNEES = Path(os.environ.get("DONNEES", "/data"))
JARVIS = os.environ.get("JARVIS_URL", "http://cockpit:8090")
JOURNAL = DONNEES / "envoyeur.log"
CV = {"Vente": "CV_Suisse_Vente", "Commercial": "CV_Suisse_Commercial", "Sales EN": "CV_Suisse_Sales_EN",
      "Vente + IA": "CV_Suisse_Vente_IA", "Commercial (France)": "CV_Basile_Rame_Commercial"}
PAR_PASSAGE = int(os.environ.get("PAR_PASSAGE", "15"))
# 08/10/2026 : Michael Page en premier (canal en préparation) ; les sites français sont retirés (France abandonnée le 06/10)
SITES_CONNEXION = ["https://www.michaelpage.ch/fr/mypage", "https://www.jobup.ch/fr/login/", "https://www.jobs.ch/fr/login/",
                   "https://secure.indeed.com/auth"]


def dire(t):
    DONNEES.mkdir(parents=True, exist_ok=True)
    with JOURNAL.open("a", encoding="utf-8") as f:
        f.write(time.strftime("%Y-%m-%d %H:%M ") + t + "\n")
    print(t, flush=True)


def jeton():
    return (DONNEES / "jeton.txt").read_text().strip()


def jarvis(chemin, donnees=None):
    req = urllib.request.Request(JARVIS + chemin, method="POST" if donnees is not None else "GET",
                                 data=json.dumps(donnees).encode() if donnees is not None else None,
                                 headers={"x-envoyeur-jeton": jeton(), "Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=120).read())


def profil():
    return json.loads((DONNEES / "profil_candidat.json").read_text(encoding="utf-8"))


def contexte(pw):
    (DONNEES / "navigateur").mkdir(parents=True, exist_ok=True)
    # 07/10/2026 : jobup/jobs.ch refusent l'IPv4 du serveur ; le navigateur sort par le relais IPv6 de l'hôte (proxy6.py)
    relais = os.environ.get("PROXY_SORTIE")
    return pw.chromium.launch_persistent_context(
        str(DONNEES / "navigateur"), headless=False, locale="fr-CH", viewport={"width": 1366, "height": 900},
        args=["--disable-blink-features=AutomationControlled", "--no-sandbox"],
        **({"proxy": {"server": relais, "bypass": "localhost,127.0.0.1,cockpit,raime-cockpit-1"}} if relais else {}))


CSS = """@page{size:A4;margin:0}*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'DejaVu Sans',Arial,sans-serif;color:#333;font-size:10.5pt;line-height:1.5}
.p{width:210mm;min-height:297mm;padding:22mm 22mm 18mm}
.h{display:flex;justify-content:space-between;border-bottom:1px solid #cfcfcf;padding-bottom:5mm;margin-bottom:12mm}
.h b{font-size:18pt;color:#3a3a3a;display:block}.h small{color:#555;font-size:9pt;text-align:right}
.d{text-align:right;color:#555;margin-bottom:8mm}.o{font-weight:600;margin-bottom:8mm}
p{margin-bottom:4mm;white-space:pre-wrap}"""


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def dossier(ctx, f, p):
    """CV et lettre PDF de la fiche (la lettre telle que validée dans Jarvis)."""
    dos = DONNEES / "envoi" / f["id"]
    dos.mkdir(parents=True, exist_ok=True)
    cv = DONNEES / "cv" / f"{CV.get(f.get('cv'), 'CV_Suisse_Vente')}.pdf"
    (dos / "CV_Basile_Rame.pdf").write_bytes(cv.read_bytes())
    corps = (f.get("lettre") or "").rsplit("\n\nBasile Rame", 1)[0]
    en = f.get("langue") == "Anglais"
    html = (f"<!doctype html><html><head><meta charset='utf-8'><style>{CSS}</style></head><body><div class='p'>"
            f"<div class='h'><b>{esc(p['prenom'])} {esc(p['nom'])}</b><small>{esc(p['ville'])} ({'F' if p['pays'] == 'France' else p['pays']})"
            f"<br>{esc(p['telephone'])}<br>{esc(p['email'])}</small></div>"
            f"<div class='d'>{esc(p['ville'])}, {time.strftime('%d.%m.%Y')}</div>"
            f"<div class='o'>{esc(('Application: ' if en else 'Candidature : ') + f['titre'])}</div>"
            + "".join(f"<p>{esc(x)}</p>" for x in corps.split("\n\n"))
            + f"<p>{esc(p['prenom'])} {esc(p['nom'])}</p></div></body></html>")
    pg = ctx.new_page()
    pg.set_content(html)
    pg.pdf(path=str(dos / "Lettre_Basile_Rame.pdf"), format="A4", print_background=True)
    pg.close()
    return dos


def jobcloud(page, f, dos, p, envoyer=True):
    return postuler(page, f["source"], f["id"], dos / "CV_Basile_Rame.pdf", dos / "Lettre_Basile_Rame.pdf",
                    code_postal=p.get("code_postal", ""), envoyer=envoyer, texte_lettre=f.get("lettre") or "",
                    email=p["email"], profil=p)


def michael_page(page, f, dos, p, envoyer=True):
    return michaelpage.postuler(page, f, dos, p, envoyer=envoyer, journal=dire)


# Un canal = une façon de postuler sans Basile. Jarvis ne propose à la validation que les offres des canaux de sa liste
# CANAUX_AUTO (jarvis/candidatures.cjs) : « michaelpage » n'y entre qu'après un essai à blanc validé par Basile (08/10/2026).
POSTULER = {"jobcloud": jobcloud, "michaelpage": michael_page}


def canal_de(o):
    """Le canal d'une offre de offres.json (même règle que canal() dans Jarvis, pour les sources de l'Envoyeur)."""
    if o.get("source") == "Michael Page":
        return "michaelpage"
    if o.get("source") in ("jobup", "jobs.ch"):
        return "jobcloud"
    return ""


def capture(page, oid):
    """Capture de l'écran au moment de l'échec, pour comprendre sans rejouer (gardée 14 jours)."""
    try:
        (DONNEES / "echecs").mkdir(exist_ok=True)
        page.screenshot(path=str(DONNEES / "echecs" / (re.sub(r"[^\w.-]", "_", oid) + ".png")), full_page=True)
        for vieux in (DONNEES / "echecs").glob("*.png"):
            if time.time() - vieux.stat().st_mtime > 14 * 86400:
                vieux.unlink()
    except Exception:
        pass


def passage():
    try:
        file = jarvis("/envoyeur/file")
    except Exception as e:
        dire(f"Jarvis injoignable : {e}")
        return
    auto = [f for f in file if f.get("canal", "jobcloud") in POSTULER][:PAR_PASSAGE]
    if not auto:
        return
    p = profil()
    with sync_playwright() as pw:
        ctx = contexte(pw)
        page = ctx.new_page()
        envoyes = DONNEES / "envoyes.txt"              # mémoire locale : jamais deux fois la même candidature,
        deja = set(envoyes.read_text().split()) if envoyes.exists() else set()   # même si Jarvis n'a pas reçu la preuve
        bloques = set()                                # 08/10/2026 : un site qui demande de se reconnecter ou montre un
        for f in auto:                                 # captcha n'est plus sollicité de tout le passage ; les autres continuent
            canal = f.get("canal", "jobcloud")
            if canal in bloques:
                continue
            r = {"id": f["id"], "source": f["source"]}
            if f["id"] in deja:
                r.update(statut="deja", detail="déjà envoyée par l'Envoyeur (preuve renvoyée)")
                try:
                    jarvis("/envoyeur/resultat", r)
                except Exception as e:
                    dire(f"  résultat non transmis : {e}")
                continue
            try:
                dos = dossier(ctx, f, p)
                out = POSTULER[canal](page, f, dos, p)
                r.update(out)
                r["statut"] = "envoye" if out.get("envoye") else "deja"
                with envoyes.open("a") as fe:
                    fe.write(f["id"] + chr(10))
            except AToi as e:
                # 06/10/2026 : la vraie raison remonte à Jarvis (expiree, question, formulaire, reconnexion). Une candidature
                # validée n'est plus jamais rangée sans bruit : Jarvis la réessaie, puis la rend à Basile avec la raison.
                r.update(statut=e.motif, detail=f"{e.motif} : {e.detail}")
                capture(page, f["id"])
            except Exception as e:
                r.update(statut="erreur", detail=f"{type(e).__name__}: {str(e)[:300]}")
                capture(page, f["id"])
                with (DONNEES / "erreurs.log").open("a", encoding="utf-8") as fl:
                    fl.write(time.strftime("%Y-%m-%d %H:%M ") + f["id"] + "\n" + traceback.format_exc() + "\n")
            dire(f"{r['statut']:10} {f['titre'][:60]} — {f['entreprise'][:30]}")
            if r["statut"] == "trop_de_requetes":
                # jobup demande d'attendre (07/10/2026) : rien n'est parti, l'offre reste validée sans compter un échec ;
                # le passage s'arrête et reprend dans 15 minutes.
                break
            try:
                jarvis("/envoyeur/resultat", r)
            except Exception as e:
                dire(f"  résultat non transmis : {e}")
            if r["statut"] in ("reconnexion", "captcha"):
                bloques.add(canal)
                continue
            time.sleep(90)                                 # 20 s ne suffisaient pas : « Trop de requêtes » au 4e envoi
        ctx.close()


def collecte():
    import subprocess
    ici = Path(__file__).resolve().parent / "collecte"
    env = {**os.environ, "DONNEES": str(DONNEES), "PYTHONIOENCODING": "utf-8"}
    for s in ("chasse.py", "chasse_plus.py"):              # la France est abandonnée (Basile, 06/10/2026) : Suisse seulement
        r = subprocess.run([sys.executable, str(ici / s)], cwd=ici, env=env, capture_output=True, text=True)
        dire(f"{s} : {(r.stdout or '').strip().splitlines()[-1:] or r.returncode}")
    sys.path.insert(0, str(ici))
    from canaux import canal_jobcloud
    from chasse import ZONE
    # 07/10/2026 : + courtier, relation/service client, clientèle, représentant, B2B, KAM, private client, customer success ;
    # « Business Developer », « Sales Engineer » et « ingénieur commercial » ne sont plus écartés
    vente = re.compile(r"vendeu|vente|sales|client advisor|conseill|commercia|business develop|account|store|magasin|boutique|"
                       r"retail|caiss|h[ôo]te|customer|key holder|ambassad|promot|recrut|placement|personnel|\bIA\b|\bAI\b|"
                       r"intelligence artificielle|automati|t[ée]l[ée]vente|chef de rayon|floor manager|trainee|courtier|broker|"
                       r"relation client|service client|client[eè]le|contact ?cent|repr[ée]sentant|\bB2B\b|\bKAM\b|private client|"
                       r"relationship manager|client manager|charg[ée]e? d.affaires|partnership", re.I)
    non = re.compile(r"CFC|AFP|apprenti|stagiaire|stage|intern\b|internship|(?<!sales )engineer|"
                     r"ing[ée]nieur(?! (commercial|de vente|d.affaires|des ventes))|(?<!business )d[ée]veloppeu|(?<!business )developer|"
                     r"technicien|logisti|magasinier|chauffeur|cuisin|boulang|bouch|poissonn|nurse|infirm|m[ée]decin|pharma|"
                     r"comptab|accountant|controller|finance|trader|juris|avocat|verk[äa]uf|mitarbeiter|berater|leiter|"
                     r"deutsch|german|horloger\b|postdoc|phd|doctora|professeur|teaching", re.I)

    def cle(o):
        t = re.sub(r"\(.*?\)|\d+\s*%|\b(h/f|f/h|m/f|f/m|h/f/d|m/w|m/f/d|f/h/d)\b", "", o["titre"].lower())
        return re.sub(r"\W+", "", t)[:40] + "|" + re.sub(r"\W+", "", (o.get("entreprise") or "").lower())[:12]

    base = json.loads((DONNEES / "offres.json").read_text(encoding="utf-8"))
    fdeja = DONNEES / "deja_dans_jarvis.json"
    deja = set(json.loads(fdeja.read_text(encoding="utf-8"))) if fdeja.exists() else set()
    lot = []
    for o in base.values():
        if o["id"] in deja or cle(o) in deja:
            continue
        if not vente.search(o["titre"]) or non.search(o["titre"]) or not ZONE.search(o.get("lieu") or ""):
            continue
        t = [x for x in (o.get("taux") or []) if x]
        if t and max(t) < (80 if o.get("pays") == "FR" else 50):
            continue
        if o["source"] in ("jobup", "jobs.ch"):
            try:
                c = canal_jobcloud(o["lien"])
                o["methode"], o["url_externe"] = c.get("methode", ""), c.get("url_externe", "")
            except Exception:
                pass
            time.sleep(0.5)
        lot.append(o)
    ajout = 0
    for i in range(0, len(lot), 100):
        ajout += jarvis("/envoyeur/offres", lot[i:i + 100]).get("ajout", 0)
    for o in lot:
        deja.add(o["id"]); deja.add(cle(o))
    fdeja.write_text(json.dumps(sorted(deja)), encoding="utf-8")
    dire(f"collecte : {len(lot)} offres pertinentes, {ajout} nouvelles pour Jarvis")


@contextmanager
def en_pause():
    """La boucle attend le temps d'un geste à part (connexion, essai) : le profil du navigateur ne s'ouvre qu'une fois.
    Seule la pause posée ici est retirée ici : une pause voulue par Basile reste en place (08/10/2026)."""
    pause = DONNEES / "pause"
    posee = not pause.exists()
    if posee:
        DONNEES.mkdir(parents=True, exist_ok=True)
        pause.touch()
    try:
        yield
    finally:
        if posee:
            pause.unlink(missing_ok=True)


def ouvrir(pw, essais=40):
    """Le navigateur, quand la boucle a fini son passage en cours (le profil est verrouillé tant qu'elle s'en sert)."""
    for i in range(essais):
        try:
            return contexte(pw)
        except Exception as e:
            if i == essais - 1 or not re.search(r"singleton|lock|already in use|profile", str(e), re.I):
                raise
            if i == 0:
                dire("navigateur occupé par un passage en cours : attente (20 min au plus)")
            time.sleep(30)


def connexion(*urls):
    """Ouvre les pages de connexion dans le navigateur visible via noVNC (Basile se connecte) ; se ferme seule après
    30 minutes, ou dès que /data/connexion_fin existe. Sans adresse : SITES_CONNEXION (Michael Page en premier)."""
    fin = DONNEES / "connexion_fin"
    fin.unlink(missing_ok=True)
    with en_pause(), sync_playwright() as pw:
        ctx = ouvrir(pw)
        for u in urls or SITES_CONNEXION:
            try:
                ctx.new_page().goto(u)
            except Exception as e:
                dire(f"connexion : {u} ne s'ouvre pas ({str(e)[:120]})")
        dire("connexion : pages ouvertes, Basile se connecte (30 min au plus, boucle en pause)")
        for _ in range(360):
            if fin.exists():
                break
            time.sleep(5)
        ctx.close()
    fin.unlink(missing_ok=True)
    dire("connexion : navigateur fermé, la boucle reprend")


def essai(oid="", canal=""):
    """Essai à blanc d'un canal sur UNE offre (08/10/2026) : tout est rempli comme pour de vrai, puis arrêt juste avant
    l'envoi. Une capture par étape dans /data/echecs ; le résultat va au journal, rien à Jarvis, rien n'est envoyé.
    L'offre est prise dans la file de Jarvis (avec sa lettre validée) ou, à défaut, dans offres.json (sans lettre)."""
    if not oid:
        dire("essai : python serveur.py essai <id de l'offre> [canal]")
        return
    f = None
    try:
        f = next((x for x in jarvis("/envoyeur/file") if x.get("id") == oid), None)
    except Exception as e:
        dire(f"essai : file de Jarvis illisible ({str(e)[:120]}), offre cherchée dans offres.json")
    if f is None:
        base = json.loads((DONNEES / "offres.json").read_text(encoding="utf-8"))
        o = base.get(oid) or next((x for x in base.values() if x.get("id") == oid), None)
        if not o:
            dire(f"essai : offre {oid} introuvable (ni dans la file de Jarvis, ni dans offres.json)")
            return
        f = {"id": o["id"], "source": o.get("source", ""), "lien": o.get("lien", ""), "titre": o.get("titre", ""),
             "entreprise": o.get("entreprise", ""), "pays": o.get("pays", "CH"), "methode": o.get("methode", ""),
             "cv": None, "langue": None, "lettre": ""}
    canal = canal or f.get("canal") or canal_de(f)
    if canal not in POSTULER:
        dire(f"essai : pas de canal automatique pour {oid} ({f.get('source')})")
        return
    p = profil()
    with en_pause(), sync_playwright() as pw:
        ctx = ouvrir(pw)
        page = ctx.new_page()
        try:
            dos = dossier(ctx, f, p)
            out = POSTULER[canal](page, f, dos, p, envoyer=False)
            if canal != "michaelpage":                     # les autres canaux ne font pas leurs captures eux-mêmes
                capture(page, f"{oid}-essai-fin")
            dire(f"essai {oid} ({canal}) : {json.dumps(out, ensure_ascii=False)[:1800]}")
        except AToi as e:
            capture(page, f"{oid}-essai-arret")
            dire(f"essai {oid} ({canal}) : arrêt « {e.motif} » — {e.detail} (capture {oid}-essai-arret.png)")
        except Exception as e:
            capture(page, f"{oid}-essai-erreur")
            dire(f"essai {oid} ({canal}) : erreur {type(e).__name__}: {str(e)[:300]}")
        finally:
            ctx.close()


def boucle():
    dernier_jour = None
    while True:
        if (DONNEES / "pause").exists():
            time.sleep(60)
            continue
        if time.localtime().tm_hour >= 7 and dernier_jour != time.strftime("%Y-%m-%d"):
            try:
                collecte()
            except Exception as e:
                dire(f"collecte en échec : {e}")
            dernier_jour = time.strftime("%Y-%m-%d")
        try:
            passage()
        except Exception as e:
            dire(f"passage en échec : {e}")
        time.sleep(900)                                    # une validation part au plus tard 15 minutes après le clic


if __name__ == "__main__":
    commande, args = (sys.argv[1] if len(sys.argv) > 1 else ""), sys.argv[2:]
    {"connexion": lambda: connexion(*args), "passage": passage, "collecte": collecte,
     "essai": lambda: essai(*args[:2])}.get(commande, boucle)()
