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


def postuler(page, source, oid, cv, lettre, code_postal="74100", envoyer=True, texte_lettre="", email=""):
    page.goto(BASE[source].format(id=oid), wait_until="domcontentloaded")
    page.wait_for_timeout(3000)
    if "/login" in page.url or "connexion" in page.url:
        raise AToi("reconnexion", source)
    if "/application/ok/" in page.url or page.get_by_text("déjà postulé").count():
        return {"deja": True, "url": page.url}
    if page.get_by_text("Cette annonce est expirée").count() or page.get_by_text("n'est plus active").count():
        raise AToi("expiree", "l'annonce a été retirée par l'employeur")
    page.wait_for_selector("main", timeout=20000)

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
    for bloc in page.locator("main").locator(":scope *:has(> button:text-is('Oui')):has(> button:text-is('Non'))").all():
        conteneur = bloc.locator("xpath=..")
        question = conteneur.inner_text().split("\nOui")[0].strip().replace("*", "")
        rep = repondre(question)
        if rep is None:
            raise AToi("question", question)
        bloc.locator(f"button:text-is('{rep}')").click()
        page.wait_for_timeout(300)

    # 5. vérification
    page.get_by_role("button", name="Continuer").click()
    page.wait_for_url(re.compile(r"/application/preview/"), timeout=20000)
    page.wait_for_timeout(2500)
    verif = page.locator("main").inner_text()
    morceau = next((p for p in texte_lettre.split("\n\n")[1:] if p.strip()), texte_lettre)[:50]
    lettre_ok = (morceau in verif) if lettre_en_texte else (lettre.name in verif)
    if cv.name not in verif or not lettre_ok or (email and email not in verif):
        raise AToi("formulaire", "page de vérification incomplète")
    recap = verif.split("Informations supplémentaires")[-1].split("En envoyant ce formulaire")[0].strip()
    recap = re.sub(r"\n+", " | ", recap)
    if not envoyer:
        return {"verifie": True, "url": page.url, "reponses": recap}

    # 6. envoi + 7. preuve
    page.get_by_role("button", name="Envoyer ma candidature").click()
    page.wait_for_url(re.compile(r"/application/ok/"), timeout=30000)
    return {"envoye": True, "url": page.url, "quand": time.strftime("%d.%m.%Y %H:%M"), "reponses": recap}
