"""Candidature simplifiée jobup.ch / jobs.ch (même plateforme JobCloud).

Même méthode que celle vérifiée à la main le 2026-10-01 (Assura, Manotel) :
1. formulaire /application/create/<id>/ ; 2. retirer les documents proposés par défaut (ancien CV) ;
3. CV dans la section CV, lettre dans la section lettre (l'input id=cv-upload-input est celui de la LETTRE) ;
4. code postal, disponibilité, réponses Oui/Non par règles ; 5. page de vérification relue ; 6. envoi ; 7. preuve.
"""
import os
import re
import time

from regles import repondre

BASE = {"jobup": "https://www.jobup.ch/fr/application/create/{id}/",
        "jobs.ch": "https://www.jobs.ch/fr/application/create/{id}/"}


class AToi(Exception):
    """Cas que l'Envoyeur ne traite pas seul (question inconnue, reconnexion, formulaire inattendu, annonce expirée)."""

    def __init__(self, motif, detail=""):
        super().__init__(f"{motif}: {detail}")
        self.motif, self.detail = motif, detail


def postuler(page, source, oid, cv, lettre, code_postal="74100", envoyer=True, texte_lettre="", email="", profil=None):
    page.goto(BASE[source].format(id=oid), wait_until="domcontentloaded")
    page.wait_for_timeout(3000)
    if "/login" in page.url or "connexion" in page.url:
        raise AToi("reconnexion", source)
    if "/application/ok/" in page.url or page.get_by_text("déjà postulé").count():
        return {"deja": True, "url": page.url}
    if page.get_by_text("Cette annonce est expirée").count() or page.get_by_text("n'est plus active").count():
        raise AToi("expiree", "l'annonce a été retirée par l'employeur")
    page.wait_for_selector("main", timeout=20000)
    # 1 bis. le bandeau de cookies recouvre tout le formulaire : toujours « cookies essentiels uniquement » (06/10/2026)
    for nom in ("Uniquement les cookies essentiels", "Nur essenzielle Cookies", "Only essential cookies"):
        b = page.get_by_role("button", name=nom)
        if b.count():
            b.first.click()
            page.wait_for_timeout(800)
            break
    # 1 ter. sans session ouverte, le formulaire demande les coordonnées : on les remplit depuis la fiche du candidat,
    #        ce qui évite de dépendre d'une connexion à jobup / jobs.ch (qui expire)
    p = profil or {}
    for cle, valeur in (("firstname", p.get("prenom")), ("lastname", p.get("nom")), ("email", p.get("email") or email)):
        champ = page.locator("main input#%s" % cle)
        if valeur and champ.count() and not champ.first.input_value():
            champ.first.fill(str(valeur))
    tel = page.locator("main input#phone")
    if p.get("telephone") and tel.count() and not tel.first.input_value().strip("+0123456789 ") and len(tel.first.input_value()) < 6:
        numero = str(p["telephone"]).replace(" ", "")
        if numero.startswith("+") and not numero.startswith("+41"):   # la Suisse est proposée par défaut : on choisit le bon pays
            page.locator("#phone-select-dropdown-trigger").click()
            page.wait_for_timeout(1500)
            choisi = None
            for n in (2, 3, 1):                            # indicatifs à 2 chiffres (33, 49…) d'abord, puis 3, puis 1
                code = numero[1:1 + n]
                choix = page.locator("[role=option]").filter(has_text=re.compile(r"^\s*\+%s(\D|$)" % code))
                if choix.count():
                    choix.first.click()
                    choisi = code
                    break
            if not choisi:
                raise AToi("formulaire", "indicatif téléphonique introuvable")
            page.wait_for_timeout(800)
        # l'indicatif du pays (« +33 ») reste affiché et ne s'efface pas : on tape seulement la suite du numéro,
        # puis on exige que le champ contienne exactement le numéro complet (06/10 : « +33 3 36… » parti une fois)
        attendu = re.sub(r"\D", "", numero)
        tel.first.click()
        tel.first.press("Control+a")
        tel.first.press("Backspace")
        prefixe = re.sub(r"\D", "", tel.first.input_value())
        if prefixe and not attendu.startswith(prefixe):
            raise AToi("formulaire", "indicatif affiché (+%s) différent du numéro du profil" % prefixe)
        suite = attendu[len(prefixe):].lstrip("0") if prefixe else attendu
        tel.first.press_sequentially(suite, delay=40)
        page.wait_for_timeout(500)
        if re.sub(r"\D", "", tel.first.input_value()) != prefixe + suite:
            raise AToi("formulaire", "numéro de téléphone mal saisi : " + tel.first.input_value())

    # 2. retirer les documents préchargés (ancien CV « IA Expert », etc.)
    for _ in range(6):
        b = page.locator('[id^="delete-document"], [name^="delete-document"]')
        if not b.count():
            break
        b.first.click()
        page.wait_for_timeout(900)

    # 3. CV puis lettre, chacun dans sa section
    page.locator("#document-section-cv-wrapper input[type=file]").set_input_files(str(cv))
    page.wait_for_timeout(2500)
    # La lettre : en fichier quand le formulaire le permet, sinon dans la zone de texte (2 500 caractères au plus).
    lettre_en_texte = not page.locator("#cv-upload-input").count()
    if lettre_en_texte:
        zone = page.locator('textarea[name="motivationalLetter"]')
        if not zone.count() or not texte_lettre:
            raise AToi("formulaire", "pas de place pour la lettre")
        zone.fill(texte_lettre[:2500])
        page.wait_for_timeout(500)
    else:
        page.locator("#cv-upload-input").set_input_files(str(lettre))
        page.wait_for_timeout(2500)
    texte = page.locator("main").inner_text()
    sec_cv = texte.split("Ajouter votre CV")[1].split("Ajouter votre lettre")[0]
    sec_lettre = texte.split("Ajouter votre lettre")[1].split("Autres documents")[0]
    if cv.name not in sec_cv or (not lettre_en_texte and lettre.name not in sec_lettre):
        raise AToi("formulaire", "documents mal placés")

    # 4. informations supplémentaires
    cp = page.locator('input[name="zipCode"]')
    if cp.count():
        cp.fill(code_postal)
    dispo = page.get_by_role("combobox", name=re.compile("Disponibilit"))
    if dispo.count():
        dispo.click()
        page.get_by_role("option", name="Immédiatement").click()
        page.wait_for_timeout(400)
    # permis de travail (liste) : réponse vraie du profil — Basile est citoyen de l'UE, sans permis G
    permis = page.get_by_role("combobox", name=re.compile("Permis de travail|Arbeitsbewilligung|Work permit"))
    if permis.count():
        permis.first.click()
        page.wait_for_timeout(600)
        choix = page.get_by_role("option", name=(profil or {}).get("permis_travail") or "Citoyen de l'UE", exact=True)
        if not choix.count():
            raise AToi("formulaire", "permis de travail : option introuvable")
        choix.first.click()
        page.wait_for_timeout(400)
    groupes = page.locator("#requirements [role=group]").all()
    blocs = [(g.locator("xpath=..").locator("p").first.inner_text(), g) for g in groupes]
    if not blocs:                                          # ancienne mise en page (avant octobre 2026)
        for bloc in page.locator("main").locator(":scope *:has(> button:text-is('Oui')):has(> button:text-is('Non'))").all():
            blocs.append((bloc.locator("xpath=..").inner_text().split("\nOui")[0], bloc))
    for question, bloc in blocs:
        question = question.strip().replace("*", "")
        rep = repondre(question)
        if rep is None:
            raise AToi("question", question)
        bouton = bloc.get_by_role("button", name=rep, exact=True)   # le texte est dans des <span> imbriqués (octobre 2026)
        bouton.click()
        page.wait_for_timeout(300)
        if bouton.get_attribute("aria-pressed") == "false":
            raise AToi("formulaire", "réponse non prise : " + question[:80])

    # 5. vérification
    page.get_by_role("button", name="Continuer").click()
    try:
        page.wait_for_url(re.compile(r"/application/preview/"), timeout=30000)
    except Exception:
        trop_vite(page)
        raise
    page.wait_for_timeout(2500)
    verif = page.locator("main").inner_text()
    morceau = next((p for p in texte_lettre.split("\n\n")[1:] if p.strip()), texte_lettre)[:50]
    lettre_ok = (morceau in verif) if lettre_en_texte else (lettre.name in verif)
    if cv.name not in verif or not lettre_ok or (email and email not in verif):
        raise AToi("formulaire", "page de vérification incomplète")
    recap = verif.split("Informations supplémentaires")[-1].split("En envoyant ce formulaire")[0].strip()
    recap = re.sub(r"\n+", " | ", recap)
    # partage des données avec « Spotted by jobup.ch » : jamais (option non essentielle)
    partage = page.get_by_role("checkbox", name=re.compile("Spotted|partager mes données"))
    if partage.count() and partage.first.is_checked():
        partage.first.uncheck()
        page.wait_for_timeout(300)
    if partage.count() and partage.first.is_checked():
        raise AToi("formulaire", "case de partage des données impossible à décocher")
    if not envoyer:
        return {"verifie": True, "url": page.url, "reponses": recap}

    # 6. envoi + 7. preuve
    page.get_by_role("button", name="Envoyer ma candidature").click()
    try:
        page.wait_for_url(re.compile(r"/application/ok/"), timeout=45000)
    except Exception:
        # 07/10/2026 : jobup a refusé un envoi (« Trop de requêtes. Veuillez réessayer. ») et renvoyé au formulaire :
        # rien n'est parti. On le dit tel quel pour que l'Envoyeur fasse une pause au lieu de compter un échec.
        trop_vite(page)
        raise
    return {"envoye": True, "url": page.url, "quand": time.strftime("%d.%m.%Y %H:%M"), "reponses": recap}


def trop_vite(page):
    try:
        if page.get_by_text(re.compile("Trop de requêtes|Too many requests|Zu viele Anfragen", re.I)).count():
            raise AToi("trop_de_requetes", "jobup demande d'attendre : rien n'est parti")
    except AToi:
        raise
    except Exception:
        pass
