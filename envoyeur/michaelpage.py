"""Candidature Michael Page (michaelpage.ch) — 08/10/2026.

Ce qui a été vu sur le site (pages publiques lues, RIEN envoyé) le 08/10/2026 :
1. le formulaire est à l'adresse de l'annonce avec /job-apply/ à la place de /job-detail/ ; une annonce pourvue renvoie
   vers /job-detail/ en 410 (« Ce poste est déjà pourvu ») ; une adresse inconnue répond 404 ;
2. étape 1 : « Postuler avec mon CV » (a.jaj-apply-cv) ouvre le champ e-mail (#edit-mp-user-mail), puis « Suivant » ;
   un e-mail déjà connu de Michael Page demande le mot de passe (#edit-password) : c'est Basile qui se connecte, une fois,
   dans le navigateur du serveur (serveur.py connexion) ; l'Envoyeur ne tape jamais de mot de passe ;
3. étapes 2 et 3 (coordonnées, CV, questions) : PAS ENCORE VUES. Elles sont remplies seulement avec la fiche du candidat
   (profil_candidat.json) ; un champ obligatoire inconnu arrête tout (« formulaire »), une question sans réponse vraie aussi
   (« question », réponses Oui/Non par regles.py) ; seules les cases obligatoires de confidentialité sont cochées, les
   cases facultatives (alertes, partage, publicité) restent décochées ;
4. un captcha visible arrête tout (« captcha ») : il n'est JAMAIS résolu.
Essai à blanc (envoyer=False) : tout est rempli, une capture par étape, arrêt juste avant « Soumettre ».
"""
import os
import re
import time
import unicodedata
from pathlib import Path

from jobcloud import AToi
from regles import repondre

FORMULAIRE = 'form[id^="mp-job-apply"]'
CAPTCHA = ("iframe[src*='recaptcha'], iframe[src*='hcaptcha'], iframe[src*='turnstile'], iframe[src*='challenges.cloudflare.com'], "
           "iframe[src*='friendlycaptcha'], iframe[title*='captcha' i], .g-recaptcha, .h-captcha, .cf-turnstile, .frc-captcha, "
           "input[name*='captcha' i]:not([type='hidden']), img[src*='captcha' i], fieldset[class*='captcha' i], div[class*='captcha' i]")
TEXTE_CAPTCHA = re.compile(r"v[ée]rifi\w* que vous [êe]tes (un )?humain|verify you are human|je ne suis pas un robot|"
                           r"i.m not a robot|are you a robot", re.I)
EXPIREE = re.compile(r"d[ée]j[àa] pourvu|now filled|n.est plus disponible|is no longer available|a expir[ée]|has expired|"
                     r"page not found|page introuvable", re.I)
DEJA = re.compile(r"d[ée]j[àa] postul[ée]|already applied|vous avez d[ée]j[àa] (postul|candidat)", re.I)
CONFIRMATION = re.compile(r"candidature a (bien )?[ée]t[ée] (envoy|transmis|re[çc]u)|merci (pour|de) votre candidature|"
                          r"thank you for (your )?appl|application has been (sent|submitted|received)", re.I)
SUIVANT = re.compile(r"^\s*(suivant|continuer|next|continue|weiter)\b", re.I)
ENVOI = re.compile(r"^\s*(soumettre|envoyer|postuler|submit|apply|send|valider (ma|la) candidature)\b", re.I)
RECULER = re.compile(r"pr[ée]c[ée]dent|retour|back|previous|modifier", re.I)
# cases obligatoires acceptées (politique de confidentialité, conditions) ; jamais une case facultative
CONSENTEMENT = re.compile(r"confidentialit|privacy|donnees personnelles|personal data|conditions|terms|j.accepte|i agree|"
                          r"consent|politique|protection des donnees")
# 22/10/2026 (JUST) : la case de confidentialité sans étoile bloquait l'envoi ; cochée seulement si elle parle de la
# protection des données d'une candidature, jamais si elle parle de publicité ou d'alertes
CONFIDENTIALITE = re.compile(r"confidentialit|privacy|donnees personnelles|personal data|protection des donnees|datenschutz")
PUBLICITE = re.compile(r"newsletter|offres|marketing|recevoir|communications?\b|alerte|alert|promotion|partenaires|partners|sms")
GENRES = {"femme", "homme", "divers", "autre", "female", "male", "other", "frau", "mann", "monsieur", "madame", "mr", "mrs", "ms",
          "herr", "masculin", "feminin"}
CANTON = r"\bcanton\b|\bkanton\b|\bstate\b"
OUI, NON = {"oui", "yes", "ja"}, {"non", "no", "nein"}

# Champ du formulaire -> donnée du profil : le premier motif qui correspond gagne (texte sans accents, en minuscules).
CHAMPS = [
    ("lettre", r"lettre|motivation|cover|\bmessage\b|commentaire"),
    ("source", r"comment avez vous (connu|entendu|trouve)|how did you (hear|find)|ou avez vous (vu|trouve)"),
    ("employeur", r"employeur actuel|entreprise actuelle|societe actuelle|dernier employeur|current (employer|company)"),
    ("poste", r"poste actuel|dernier poste|fonction actuelle|current (job|role|position)"),
    ("nom_complet", r"nom complet|full name|\bmp name\b|nom et prenom|prenom et nom"),
    # 22/10/2026 : le secteur restait celui du compte (« Energy & Natural Resources / Electricity »), faux pour Basile
    ("sous_secteur", r"sub ?industry|sous.secteur"),
    ("secteur", r"what industry|industry do you|secteur d.activite|\bindustrie\b|\bbranche\b"),
    ("prenom", r"prenom|first ?name|given name"),
    ("nom", r"\bnom\b|last ?name|surname|family name"),
    ("email", r"\be ?mail\b|courriel"),
    ("telephone", r"telephone|phone|mobile|portable|\btel\b"),
    ("code_postal", r"code postal|post ?code|postal code|\bzip\b|\bnpa\b"),
    ("ville", r"\bville\b|\bcity\b|localite|\btown\b|lieu de residence|^lieu\W*$|^ort\W*$"),
    ("genre", r"^genre\W*$|\bgender\b|\bsexe\b|geschlecht"),
    ("region", r"\bcanton\b|\bstate\b|province|departement|region de residence|\bkanton\b"),
    ("etat_civil", r"etat civil|marital|zivilstand|situation familiale"),
    ("adresse", r"adresse|address|\brue\b|street"),
    ("nationalite", r"nationalit"),
    ("pays", r"\bpays\b|country"),
    ("civilite", r"civilite|salutation|formule d.appel|\banrede\b|(?<!job )(?<!position )\btitle\b"),
    ("linkedin", r"linkedin"),
    ("preavis", r"preavis|notice"),
    ("disponibilite", r"disponib|availab|date de debut|start date|entree en fonction"),
    ("permis", r"permis de travail|work permit|autorisation de travail|permis de sejour|statut de residence|statut du permis|aufenthaltsbewilligung"),
    ("contrat", r"type de (poste|contrat|job|emploi)|job type|contract type|type d.emploi"),
    ("salaire", r"salaire|salary|remuneration|pretention|pay ?rate"),
    ("taux", r"taux d.activite|\btaux\b|workload|pensum"),
    ("formation", r"diplome|formation|niveau d.etudes|education|degree"),
    ("langue", r"anglais|english|francais|french|espagnol|spanish|allemand|german|italien|italian|\blangue|language"),
    ("date_naissance", r"date de naissance|birth"),
]
# Les coordonnées de quelqu'un d'autre (référence, entreprise, école) ne sont jamais remplies avec celles de Basile.
AUTRUI = re.compile(r"entreprise|societe|company|employeur|employer|ecole|school|universit|reference|referent|recommand|"
                    r"manager|superieur|contact d.urgence|emergency")
PERSONNELLES = {"nom_complet", "prenom", "nom", "email", "telephone", "code_postal", "ville", "adresse", "pays", "civilite"}
# Dans une question (« … ? »), seules ces données du profil répondent ; le reste est une vraie question pour Basile.
REPONSES_DU_PROFIL = {"source", "salaire", "preavis", "disponibilite", "permis", "taux", "langue", "formation", "linkedin",
                      "nationalite", "pays", "telephone", "email", "contrat"}
LANGUES = {"anglais": r"anglais|english", "francais": r"francais|french", "espagnol": r"espagnol|spanish",
           "allemand": r"allemand|german|deutsch", "italien": r"italien|italian"}
# Mots équivalents pour choisir une option de liste (valeur du profil -> libellés possibles)
SYNONYMES = {"monsieur": ["monsieur", "m.", "m", "mr", "mr.", "homme", "male", "herr"],
             "immediate": ["immediatement", "immediate", "de suite", "tout de suite", "immediately", "sofort"],
             "aucun": ["aucun", "aucune", "pas de preavis", "none", "immediatement", "immediate"],
             "francaise": ["francaise", "france", "french"],
             "cdi": ["permanent", "cdi", "fixe", "contrat a duree indeterminee"],
             "masculin": ["masculin", "homme", "male", "man", "mannlich", "m"],
             "langue maternelle": ["langue maternelle", "maternelle", "native", "natif", "langue natale"]}
SYNONYMES_CLE = {"source": ["site michael page", "michaelpage.ch", "michaelpage ch", "site internet", "site web", "website",
                            "internet", "michael page"],
                 # son métier : la vente en magasin et le luxe ; les offres visées sont dans la vente
                 "secteur": ["retail", "consumer", "commerce de detail", "vente au detail", "luxury", "fmcg"],
                 "sous_secteur": ["retail", "luxury", "fashion", "apparel", "consumer goods", "general"],
                 # Basile est citoyen de l'UE, frontalier ; il n'a PAS encore de permis G (l'employeur le demande)
                 "permis": ["citoyen de l ue", "citoyen ue", "ue/aele", "ue aele", "eu/efta", "eu efta", "ressortissant ue",
                            "union europeenne", "frontalier"]}
VIDES = {"", "_none", "select", "choisir", "selectionner", "veuillez choisir", "aucun choix", "none selected"}


def simple(s):
    """Texte comparable : sans accents, minuscules ; espaces, tirets, apostrophes et soulignés réduits à un espace."""
    s = re.sub(r"[’‘`]", "'", str(s or ""))
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[\s_\-']+", " ", s).strip()


def adresse(lien):
    """L'adresse du formulaire : celle de l'annonce, /job-detail/ remplacé par /job-apply/."""
    lien = str(lien or "").strip()
    if not re.match(r"https://(www\.)?michaelpage\.ch/", lien) or not re.search(r"/job-(detail|apply)/", lien):
        raise AToi("formulaire", "lien Michael Page inattendu : " + lien[:120])
    return lien.replace("/job-detail/", "/job-apply/", 1)


def expiree(statut, texte):
    return statut in (404, 410) or bool(EXPIREE.search(texte or ""))


def role(texte):
    """« envoi », « suivant » ou « autre » pour un bouton du formulaire."""
    t = (texte or "").strip()
    if not t or RECULER.search(t):
        return "autre"
    if ENVOI.search(t):
        return "envoi"
    if SUIVANT.search(t):
        return "suivant"
    return "autre"


def cle_profil(texte):
    t = simple(texte)
    for cle, motif in CHAMPS:
        if re.search(motif, t):
            if cle in PERSONNELLES and AUTRUI.search(t):
                return None
            if "?" in str(texte) and cle not in REPONSES_DU_PROFIL:
                return None
            return cle
    return None


def emploi_actuel(p):
    exps = [e for e in (p.get("experiences") or []) if isinstance(e, dict)]
    return next((e for e in exps if re.search(r"en cours|aujourd|present|actuel", simple(e.get("fin")))), exps[0] if exps else {})


def valeur(cle, p, libelle=""):
    """La valeur VRAIE du profil pour ce champ, ou None (jamais une valeur inventée)."""
    s = simple(libelle)
    if cle == "source":
        return "Site Michael Page"                     # vrai : l'offre a été trouvée sur michaelpage.ch
    if cle == "nom_complet":
        return " ".join(x for x in (p.get("prenom"), p.get("nom")) if x) or None
    if cle == "salaire":
        brut = (p.get("salaire") or {}).get("suisse_mensuel_brut_min" if re.search(r"mensuel|mois|month", s) else "suisse_annuel_brut") or ""
        m = re.search(r"\d[\d'’ . \xa0]*", brut)
        return re.sub(r"\D", "", m.group(0)) if m else None
    if cle == "taux":
        return (p.get("taux") or {}).get("suisse") or None
    if cle == "formation":
        return (p.get("formation") or {}).get("diplome") or None
    if cle == "permis":
        return p.get("permis_travail_suisse") or None
    if cle in ("secteur", "sous_secteur"):
        return "retail"
    if cle == "contrat":
        contrats = p.get("contrats") or []
        return "CDI" if "CDI" in contrats else (contrats[0] if contrats else None)
    if cle == "employeur":
        return emploi_actuel(p).get("entreprise") or None
    if cle == "poste":
        return emploi_actuel(p).get("poste") or None
    if cle == "region" and p.get("canton"):
        return p["canton"]
    if cle == "region":                        # Ville-la-Grand (74100) : la Haute-Savoie, seulement si le code postal le dit
        return "Haute-Savoie" if str(p.get("code_postal") or "").startswith("74") else None
    if cle == "genre":
        return "masculin" if simple(p.get("civilite")) in ("monsieur", "m", "mr") else None
    if cle == "langue" and re.search(r"maternelle|mother tongue|muttersprache|native language|communication|correspondance|"
                                     r"pr[e]fer|preferred|korrespondenz", s):
        return next((k for k, v in (p.get("langues") or {}).items() if "maternelle" in simple(v)), None)
    if cle == "langue":
        langues = {simple(k): v for k, v in (p.get("langues") or {}).items()}
        for nom, motif in LANGUES.items():
            if re.search(motif, s):
                return langues.get(nom)            # langue absente du profil : None, rien d'affirmé
        return None
    v = p.get(cle)
    return str(v).strip() if isinstance(v, (str, int)) and str(v).strip() else None


def choisir_option(options, val, cle=""):
    """La valeur de l'option qui correspond à la valeur du profil, ou None."""
    vraies = [(v, simple(t)) for v, t in options if str(v) not in ("", "_none") and simple(t) not in VIDES]
    sv = simple(val)
    candidats = [sv] + SYNONYMES.get(sv, []) + SYNONYMES_CLE.get(cle, [])
    if cle == "langue":
        candidats += [sv.split(" ")[0]] + [m for m in ("bilingue", "courant", "maternelle") if m in sv]
        candidats += SYNONYMES["langue maternelle"] if "maternelle" in sv else []
    if cle == "formation" and re.search(r"bachelor|licence|bac ?\+ ?3", sv):
        candidats += ["bachelor", "licence", "bac+3", "bac + 3", "universitaire"]
    for c in candidats:                                    # égalité d'abord
        for v, t in vraies:
            if t == c:
                return v
    for c in candidats:                                    # puis inclusion (3 lettres au moins)
        if len(c) < 3:
            continue
        for v, t in vraies:
            if c in t or (len(t) >= 4 and t in c):
                return v
    return None


def ajuster(texte, maximum):
    """La lettre dans la limite du champ, coupée entre deux paragraphes."""
    if not maximum or len(texte) <= maximum:
        return texte
    garde = []
    for morceau in texte.split("\n\n"):
        if len("\n\n".join(garde + [morceau])) > maximum:
            break
        garde.append(morceau)
    return "\n\n".join(garde) or texte[:maximum]


def canton_exige(c):
    """Un champ « Canton / State / Kanton » dont les choix ne contiennent pas la Haute-Savoie (un formulaire suisse)."""
    t = simple(" ".join(str(c.get(k) or "") for k in ("label", "name", "id", "placeholder")))
    if not re.search(CANTON, t):
        return False
    return not any("haute savoie" in simple(x) for _, x in c.get("options") or [])


def decider(champs, p, f, fait=None, garder=True):
    """Ce qu'il faut saisir dans les champs visibles. Rend (actions, notes) ; lève AToi si un champ ne peut pas être
    rempli honnêtement. Fonction pure : testée sans navigateur (tests/banc/michaelpage.test.mjs)."""
    fait = set() if fait is None else fait
    actions, notes, radios = [], [], {}
    # Basile, 22/10/2026 : quand un canton est exigé et que Ville-la-Grand n'en a pas, code postal 1201, ville Genève,
    # canton Genève, pays France ; la rue ne change pas
    if any(canton_exige(c) for c in champs):
        p = dict(p, code_postal="1201", ville="Genève", canton="Genève")
    lettre = (f.get("lettre") or "").strip()

    def agir(c, faire, val, note):
        actions.append({"n": c["n"], "faire": faire, "valeur": val, "id": c.get("id", ""), "cle": c.get("cle"),
                        "libelle": (c.get("label") or c.get("name") or "")[:80]})
        notes.append(note)

    for c in champs:
        if c["type"] == "radio":
            radios.setdefault(c.get("name") or c.get("id") or str(c["n"]), []).append(c)
            continue
        ident = c.get("name") or c.get("id") or str(c["n"])
        if ident in fait:
            continue
        fait.add(ident)
        libelle = (c.get("label") or c.get("placeholder") or c.get("name") or c.get("id") or "").strip()
        tout = " ".join(str(c.get(k) or "") for k in ("label", "name", "id", "placeholder"))
        # le libellé VISIBLE d'abord : le nom technique « …job_type…salary… » faisait remplir « CDI » dans le salaire
        # (essai du 08/10/2026) ; le nom et l'identifiant ne servent que si le libellé ne dit rien
        visible = " ".join(str(c.get(k) or "") for k in ("label", "placeholder")).strip()
        c["cle"] = cle = (cle_profil(visible) if visible else None) or cle_profil(tout)
        actuel = str(c.get("value") or "").strip()
        question = "?" in libelle
        if c["type"] == "file":
            t = simple(tout)
            if "basile" in simple(actuel):
                continue
            if re.search(r"lettre|motivation|cover", t):
                if lettre:
                    agir(c, "fichier", "lettre", "lettre : Lettre_Basile_Rame.pdf")
                elif c.get("required"):
                    raise AToi("formulaire", "lettre exigée, aucune lettre validée pour cette offre")
            elif re.search(r"autre|other|additional|supplementaire|complementaire", t):
                if c.get("required"):
                    raise AToi("formulaire", "document supplémentaire exigé : " + libelle[:80])
            elif "fichier:cv" not in fait:
                fait.add("fichier:cv")
                agir(c, "fichier", "cv", "CV : CV_Basile_Rame.pdf")
            continue
        if c["type"] == "checkbox":
            lib = simple(c.get("label") or c.get("question") or "")
            if c.get("required") and CONSENTEMENT.search(lib):
                if not c.get("checked"):
                    agir(c, "cocher", True, "accepté (obligatoire) : " + libelle[:80])
            elif c.get("required"):
                rep = repondre(libelle)
                if rep != "Oui":
                    raise AToi("question", libelle[:200])
                if not c.get("checked"):
                    agir(c, "cocher", True, libelle[:60] + " : Oui")
            elif CONFIDENTIALITE.search(lib) and not PUBLICITE.search(lib):
                if not c.get("checked"):
                    agir(c, "cocher", True, "accepté (protection des données) : " + libelle[:80])
            elif c.get("checked"):
                agir(c, "decocher", False, "décoché (facultatif) : " + libelle[:80])
            continue
        if c["tag"] == "select":
            lib_s = simple(libelle)
            # 22/10/2026 (Adecco) : l'accord de confidentialité en liste « J'accepte / Je ne suis pas d'accord » ; jamais
            # celui des alertes ou de la communauté de talents
            if CONFIDENTIALITE.search(lib_s) and not PUBLICITE.search(lib_s):
                oui = next((v for v, t in c.get("options") or [] if re.match(r"(j.accepte|i accept|accepter|oui|yes|d.accord)", simple(t))
                            and not re.search(r"\bpas\b|\bnot\b|\bne\b", simple(t))), None)
                if oui is not None:
                    if str(oui) != actuel:
                        agir(c, "choisir", str(oui), "accepté (protection des données) : " + libelle[:60])
                    continue
            # « Code Pays » puis le numéro : l'indicatif du téléphone du profil, et le numéro national dans le champ suivant
            if cle == "telephone":
                m = re.match(r"\s*\+(\d{1,3})", str(p.get("telephone") or ""))
                code = next((v for v, t in c.get("options") or [] if m and re.search(r"\+\s?%s\b|\(%s\)" % (m.group(1), m.group(1)), t or "")), None)
                if code is not None:
                    fait.add("indicatif")
                    if str(code) != actuel:
                        agir(c, "choisir", str(code), "indicatif : " + next(t for v, t in c["options"] if v == code))
                    continue
            val = valeur(cle, p, libelle) if cle and cle != "lettre" else None
            choix = choisir_option(c.get("options") or [], val, cle) if val else None
            if choix is not None:
                if str(choix) != actuel:
                    texte_choix = next((t for v, t in c.get("options") or [] if str(v) == str(choix)), choix)
                    agir(c, "choisir", str(choix), f"{libelle[:50]} : {texte_choix}")
            elif actuel and actuel not in ("_none",) and garder:
                notes.append(f"{libelle[:50]} : gardé tel quel")
            elif actuel and actuel not in ("_none",) and not c.get("required"):
                vide = next((v for v, t in c.get("options") or [] if str(v) in ("", "_none") or simple(t) in VIDES), None)
                if vide is not None and str(vide) != actuel:
                    agir(c, "choisir", str(vide), f"{libelle[:50]} : vidé (valeur proposée par le site)")
            elif actuel and actuel not in ("_none",) and c.get("required"):
                raise AToi("question" if question else "formulaire", "valeur proposée par le site, réponse vraie inconnue : " + libelle[:140])
            elif c.get("required"):
                if val:
                    raise AToi("formulaire", f"{libelle[:80]} : aucune option pour « {val} »")
                raise AToi("question" if question else "formulaire", "champ obligatoire inconnu : " + libelle[:160])
            continue
        # zones de texte
        if cle == "lettre" and c["tag"] == "textarea":
            if not lettre:
                if c.get("required"):
                    raise AToi("formulaire", "lettre exigée, aucune lettre validée pour cette offre")
                notes.append(f"{libelle[:40]} : laissé vide (pas de lettre)")
                continue
            texte = ajuster(lettre, c.get("maxlength"))
            agir(c, "remplir", texte, f"{libelle[:40]} : lettre ({len(texte)} signes)")
            continue
        val = valeur(cle, p, libelle) if cle and cle != "lettre" else None
        if val and cle == "telephone" and "indicatif" in fait:
            val = re.sub(r"^\s*\+\d{1,3}\s*", "0", val)          # l'indicatif est déjà choisi dans la liste
        if val:
            if (cle == "email" and actuel) or simple(actuel) == simple(val):
                notes.append(f"{libelle[:50]} : {actuel}")
            else:
                agir(c, "remplir", val, f"{libelle[:50]} : {val}")
        elif actuel and (garder or not c.get("required")):
            notes.append(f"{libelle[:50]} : gardé tel quel")
        elif actuel or c.get("required"):
            raise AToi("question" if question else "formulaire", "champ obligatoire inconnu : " + libelle[:160])

    for nom, groupe in radios.items():
        if "radio:" + nom in fait:
            continue
        fait.add("radio:" + nom)
        question = (groupe[0].get("question") or nom).strip()
        requis = any(c.get("required") for c in groupe)
        etiquettes = [(c, simple(c.get("label"))) for c in groupe]
        if etiquettes and all(e in OUI | NON for _, e in etiquettes):
            rep = repondre(question)
            if rep is None:
                raise AToi("question", question[:200])
            cible = next((c for c, e in etiquettes if e in (OUI if rep == "Oui" else NON)), None)
            if cible is None:
                raise AToi("formulaire", "réponse introuvable : " + question[:120])
            if not cible.get("checked"):
                agir(cible, "cocher", True, f"{question[:60]} : {rep}")
            else:
                notes.append(f"{question[:60]} : {rep}")
            continue
        tout = simple(question + " " + " ".join(e for _, e in etiquettes))
        nouveau = next((c for c, e in etiquettes if re.search(r"telecharg|upload|nouveau cv|new cv|importer|joindre", e)), None)
        if nouveau is not None and re.search(r"\bcv\b|curriculum|resume", tout):
            if not nouveau.get("checked"):
                agir(nouveau, "cocher", True, "CV : nouveau fichier")
            continue
        cle = cle_profil(question + " " + nom)
        if not cle and etiquettes and all(e in GENRES for _, e in etiquettes):
            cle = "genre"                                  # « femme / homme / divers » sans question (JUST, 22/10/2026)
        val = valeur(cle, p, question) if cle and cle != "lettre" else None
        choix = choisir_option([(str(c["n"]), c.get("label")) for c in groupe], val, cle) if val else None
        if choix is not None:
            cible = next(c for c in groupe if str(c["n"]) == choix)
            if not cible.get("checked"):
                agir(cible, "cocher", True, f"{question[:60]} : {cible.get('label')}")
        elif any(c.get("checked") for c in groupe) and (garder or not requis):
            notes.append(f"{question[:60]} : gardé tel quel")
        elif requis:
            raise AToi("question" if "?" in question or not val else "formulaire", question[:200])
    return actions, notes


# L'état du formulaire, lu en une fois dans la page : champs visibles (marqués data-raime), boutons, étape, erreurs.
ETAT = r"""() => {
  const form = document.querySelector('form[id^="mp-job-apply"]');
  if (!form) return null;
  const vis = (e) => !!e && !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length) && getComputedStyle(e).visibility !== 'hidden';
  const txt = (e) => (e ? (e.innerText || e.textContent || '') : '').replace(/\s+/g, ' ').trim();
  document.querySelectorAll('[data-raime],[data-raime-bouton]').forEach((e) => { e.removeAttribute('data-raime'); e.removeAttribute('data-raime-bouton'); });
  const champs = [];
  let n = 0;
  for (const el of form.querySelectorAll('input, select, textarea')) {
    const type = (el.tagName === 'INPUT' ? (el.getAttribute('type') || 'text') : el.tagName).toLowerCase();
    if (['hidden', 'submit', 'button', 'image', 'reset'].includes(type) || el.disabled) continue;
    const item = el.closest('.js-form-item, .form-item') || el.parentElement;
    const visible = ['select', 'file', 'checkbox', 'radio'].includes(type) ? vis(item) : vis(el);
    if (!visible) continue;
    el.setAttribute('data-raime', String(n));
    let label = '';
    if (el.id) { const l = form.querySelector('label[for="' + CSS.escape(el.id) + '"]'); if (l) label = txt(l); }
    if (!label && el.closest('label')) label = txt(el.closest('label'));
    // la question d'un groupe de boutons : la légende de SON groupe (jamais celle de l'étape entière)
    let question = '', groupe = null;
    if (type === 'radio' || type === 'checkbox') {
      const g = el.closest('fieldset.form-composite, fieldset.fieldgroup, [role="radiogroup"], .form-radios, .form-checkboxes');
      groupe = g ? (g.tagName === 'FIELDSET' ? g : (g.closest('fieldset, .js-form-item, .form-item') || g)) : null;
      if (groupe && groupe.closest('.apply-method-wrapper') === groupe) groupe = null;
      const lg = groupe ? groupe.querySelector('legend, label:not(.option)') : null;
      if (lg) question = txt(lg);
    }
    const requis = el.required || el.classList.contains('required') || el.getAttribute('aria-required') === 'true'
      || !!(item && item.querySelector('label.form-required, .js-form-required'))
      || !!(groupe && groupe.querySelector('legend .form-required, legend .js-form-required, legend.form-required'));
    champs.push({ n: n++, tag: el.tagName.toLowerCase(), type, name: el.name || '', id: el.id || '', label, question,
      placeholder: el.getAttribute('placeholder') || '', required: requis, value: el.value || '', checked: !!el.checked,
      maxlength: el.maxLength > 0 ? el.maxLength : 0,
      options: el.tagName === 'SELECT' ? [...el.options].map((o) => [o.value, txt(o)]) : [] });
  }
  const boutons = [];
  let b = 0;
  for (const el of form.querySelectorAll('button, input[type="submit"], input[type="button"], a.form-nav-next, a.button')) {
    if (!vis(el) || el.disabled) continue;
    el.setAttribute('data-raime-bouton', String(b));
    boutons.push({ n: b++, texte: el.tagName === 'INPUT' ? (el.value || '') : txt(el) });
  }
  const actif = document.querySelector('.step-item.active .step-counter');
  const mdp = document.querySelector('#edit-password');
  return { champs, boutons, etape: txt(actif), connecte: form.classList.contains('job-apply-logged-in'), mot_de_passe: vis(mdp),
    erreurs: [...document.querySelectorAll('.form-item--error-message, .messages--error, .messages.error, [role="alert"].error')]
      .filter(vis).map(txt).filter(Boolean).slice(0, 5) };
}"""


def _dire(t):
    print(t, flush=True)


def corps(page):
    try:
        return page.locator("body").inner_text(timeout=10000)
    except Exception:
        return ""


def etat(page):
    try:
        return page.evaluate(ETAT)
    except Exception:                                      # page en cours de chargement
        return None


def captcha(page):
    """Un captcha visible arrête la candidature : il n'est jamais résolu, ni contourné."""
    loc = page.locator(CAPTCHA)
    for i in range(min(loc.count(), 20)):
        try:
            if loc.nth(i).is_visible():
                raise AToi("captcha", "michaelpage")
        except AToi:
            raise
        except Exception:
            pass
    if TEXTE_CAPTCHA.search(corps(page)[:5000]):
        raise AToi("captcha", "michaelpage")


def refuser_cookies(page):
    """Bandeau OneTrust : toujours « tout refuser » (cookies facultatifs refusés)."""
    for _ in range(5):
        b = page.locator("#onetrust-reject-all-handler")
        if b.count() and b.first.is_visible():
            b.first.click()
            page.wait_for_timeout(800)
            return
        page.wait_for_timeout(500)


def confirme(page):
    try:
        type_page = page.evaluate("() => (((window.drupalSettings || {}).dataLayer) || {}).page_type || ''")
    except Exception:
        type_page = ""
    if str(type_page).endswith("success") or re.search(r"success|merci|thank-you|confirmation", page.url, re.I):
        return True
    return bool(CONFIRMATION.search(corps(page)))


def liberer(page):
    """Michael Page demande « quitter la page ? » en cours de candidature : retiré, pour que l'offre suivante s'ouvre."""
    try:
        page.evaluate("() => { if (document.body) document.body.classList.remove('confirm-leave-page'); window.onbeforeunload = null; }")
    except Exception:
        pass


def appliquer(page, actions, cv, lettre_pdf):
    for a in actions:
        loc = page.locator('[data-raime="%s"]' % a["n"]).first
        if a["faire"] == "fichier":
            loc.set_input_files(str(cv if a["valeur"] == "cv" else lettre_pdf))
            page.wait_for_timeout(3000)
        elif a["faire"] == "remplir":
            loc.fill(a["valeur"])
            page.wait_for_timeout(300)
            lu = loc.input_value()
            if a["cle"] in ("telephone", "code_postal", "salaire"):
                bon = re.sub(r"\D", "", lu).endswith(re.sub(r"\D", "", a["valeur"]).lstrip("0")[-8:])
            else:
                bon = re.sub(r"\s+", "", lu) == re.sub(r"\s+", "", a["valeur"])
            if not bon:
                raise AToi("formulaire", "%s : saisie non prise (%s)" % (a["libelle"][:60], lu[:40]))
        elif a["faire"] == "choisir":
            loc.select_option(value=a["valeur"], force=True)
            page.wait_for_timeout(400)
        elif a["faire"] in ("cocher", "decocher"):
            voulu = a["faire"] == "cocher"
            try:
                loc.set_checked(voulu, force=True)
            except Exception:
                pass
            if loc.is_checked() != voulu and a.get("id"):    # case stylée : clic sur son libellé
                lab = page.locator('label[for="%s"]' % a["id"])
                if lab.count():
                    lab.first.click()
                    page.wait_for_timeout(300)
            if loc.is_checked() != voulu:
                raise AToi("formulaire", "case non prise : " + a["libelle"][:80])
    erreur = page.locator(".upload-list a.mp-cv-upload-error")
    if erreur.count() and erreur.first.is_visible() and "active" not in (erreur.first.get_attribute("class") or ""):
        raise AToi("formulaire", "CV refusé par Michael Page : " + erreur.first.inner_text()[:120])


def signature(e):
    return (e or {}).get("etape"), tuple(sorted((c.get("name") or c.get("id") or "") for c in (e or {}).get("champs", [])))


def postuler(page, f, dos, p, envoyer=True, journal=None, captures=None):
    """Postule à l'offre f (fiche de la file de Jarvis : id, lien, lettre…) avec le dossier dos (CV et lettre en PDF).
    envoyer=False : essai à blanc, arrêt avant « Soumettre », une capture par étape (DONNEES/echecs)."""
    dire = journal or _dire
    oid = re.sub(r"[^\w.-]", "_", str(f.get("id") or "offre"))
    dos = Path(dos)
    cv, lettre_pdf = dos / "CV_Basile_Rame.pdf", dos / "Lettre_Basile_Rame.pdf"
    if captures is None and not envoyer:
        captures = Path(os.environ.get("DONNEES", "/data")) / "echecs"
    photos = []

    def photo(nom):
        if not captures:
            return
        try:
            Path(captures).mkdir(parents=True, exist_ok=True)
            chemin = Path(captures) / ("%s-essai-%d-%s.png" % (oid, len(photos) + 1, re.sub(r"[^\w-]", "_", nom)))
            page.screenshot(path=str(chemin), full_page=True)
            photos.append(str(chemin))
        except Exception as e:
            dire("  capture impossible : %s" % e)

    url = adresse(f.get("lien"))
    try:
        return _parcours(page, f, p, url, cv, lettre_pdf, envoyer, dire, photo, photos, oid)
    finally:
        liberer(page)


def _parcours(page, f, p, url, cv, lettre_pdf, envoyer, dire, photo, photos, oid):
    rep = page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(3000)
    refuser_cookies(page)
    captcha(page)
    texte = corps(page)
    if expiree(rep.status if rep else 0, texte):
        raise AToi("expiree", "Michael Page : poste déjà pourvu ou annonce retirée")
    if "/job-apply-external" in page.url:
        raise AToi("formulaire", "candidature sur le site de l'employeur, hors Michael Page")
    if DEJA.search(texte):
        return {"deja": True, "url": page.url}
    if re.search(r"/user/login|/mypage", page.url):
        raise AToi("reconnexion", "michaelpage")
    if "/job-apply/" not in page.url:
        raise AToi("formulaire", "la page de candidature renvoie ailleurs : " + page.url[:120])
    e = etat(page)
    if e is None:
        raise AToi("formulaire", "formulaire de candidature introuvable")
    if e["mot_de_passe"]:
        raise AToi("reconnexion", "michaelpage")
    # étape 1 : « Postuler avec mon CV » ouvre le champ e-mail (déjà ouvert quand Basile est connecté)
    section = page.locator(".apply-cv-section")
    if not e["connecte"] and section.count() and not section.first.is_visible():
        bouton = page.locator("a.jaj-apply-cv")
        if not bouton.count():
            raise AToi("formulaire", "bouton « Postuler avec mon CV » introuvable")
        bouton.first.click()
        page.wait_for_timeout(1000)

    fait, recap = set(), []
    for tour in range(6):
        captcha(page)
        e = etat(page)
        if e is None:
            raise AToi("formulaire", "formulaire de candidature disparu")
        if e["mot_de_passe"]:
            raise AToi("reconnexion", "michaelpage")
        for _ in range(3):                                 # un choix peut faire apparaître d'autres champs
            actions, notes = decider(e["champs"], p, f, fait)
            recap += notes
            if not actions:
                break
            appliquer(page, actions, cv, lettre_pdf)
            page.wait_for_timeout(1200)
            captcha(page)
            e = etat(page) or e
        nom_etape = e.get("etape") or str(tour + 1)
        dire("  michaelpage %s : étape %s remplie (%d champs)" % (oid, nom_etape, len(e["champs"])))
        photo("etape-" + nom_etape)
        boutons = [dict(b, role=role(b["texte"])) for b in e["boutons"]]
        envoi = next((b for b in boutons if b["role"] == "envoi"), None)
        if envoi:
            if not envoyer:
                return {"verifie": True, "url": page.url, "etapes": tour + 1, "reponses": " | ".join(recap)[:1500],
                        "captures": photos, "lettre": bool((f.get("lettre") or "").strip())}
            page.locator('[data-raime-bouton="%s"]' % envoi["n"]).first.click()
            return attendre_confirmation(page, recap)
        suivant = next((b for b in boutons if b["role"] == "suivant"), None)
        if not suivant:
            raise AToi("formulaire", "ni « Suivant » ni « Soumettre » sur la page (étape %s)" % nom_etape)
        avant = signature(e)
        page.locator('[data-raime-bouton="%s"]' % suivant["n"]).first.click()
        passe = False
        for _ in range(40):                               # 20 s au plus pour l'étape suivante
            page.wait_for_timeout(500)
            mdp = page.locator("#edit-password")
            if mdp.count() and mdp.first.is_visible():
                raise AToi("reconnexion", "michaelpage")   # e-mail connu : Basile doit se connecter dans le navigateur
            nouvel = etat(page)
            if nouvel is not None and signature(nouvel) != avant:
                page.wait_for_timeout(1500)
                passe = True
                break
            if nouvel is not None and nouvel["erreurs"]:
                break
        if not passe:
            captcha(page)
            erreurs = (etat(page) or {}).get("erreurs") or []
            raise AToi("formulaire", "étape %s refusée : %s" % (nom_etape, "; ".join(erreurs)[:200] or "sans message"))
    raise AToi("formulaire", "parcours plus long que prévu (6 étapes)")


def attendre_confirmation(page, recap):
    for _ in range(45):
        page.wait_for_timeout(1000)
        if confirme(page):
            return {"envoye": True, "url": page.url, "quand": time.strftime("%d.%m.%Y %H:%M"), "reponses": " | ".join(recap)[:1500]}
        captcha(page)                                       # captcha après le clic : rien n'est parti
        e = etat(page)
        if e is not None and e["erreurs"]:
            raise AToi("formulaire", "envoi refusé : " + "; ".join(e["erreurs"])[:200])
    # « Soumettre » cliqué sans confirmation reconnue : peut-être partie. Jamais renvoyée seule (Jarvis la rend à Basile).
    raise AToi("incertain", "« Soumettre » cliqué, confirmation non reconnue : vérifie dans ton espace Michael Page avant de revalider")
