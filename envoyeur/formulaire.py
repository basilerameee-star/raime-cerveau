"""Candidature par le formulaire du site de l'employeur, SANS compte (22/10/2026).

Basile (22/10) : « les sites d'employeurs qui acceptent une candidature sans compte, tu peux les automatiser ». Sur ~95 offres,
une soixantaine d'outils de recrutement différents (prospective.ch, umantis, aplitrak, smartrecruiters, join.com…) : ce canal
ne connaît aucun site par cœur. Il ouvre le lien de candidature, suit au besoin le bouton « Postuler », trouve le formulaire
(dans la page ou dans un cadre), puis décide champ par champ avec le moteur du canal Michael Page (michaelpage.decider : la
fiche du candidat seulement, jamais une valeur inventée ; un champ obligatoire inconnu ou une question sans réponse vraie
arrêtent tout et reviennent à Basile ; les cases facultatives restent décochées).
Jamais : créer un compte, taper un mot de passe (un site qui l'exige → « compte »), résoudre un captcha (→ « captcha »).
Essai à blanc (envoyer=False) : tout est rempli, une capture par étape, arrêt juste avant « Envoyer ».
"""
import os
import re
import time
from pathlib import Path

import michaelpage as mp
from jobcloud import AToi

# Ces outils exigent un compte candidat : jamais automatisés (Basile ne veut pas qu'on crée de comptes à sa place)
AVEC_COMPTE = re.compile(r"myworkdayjobs|workday\.com|successfactors|/apply/authentication|csod\.com|dayforcehcm|taleo\.net|icims\.com|oraclecloud|"
                         r"brassring|kenexa|ultipro|adp\.com", re.I)
COMPTE = re.compile(r"cr[ée]e[rz]? (un|votre) compte|create (an|your) account|sign in to apply|log ?in to apply|"
                    r"connectez-vous pour postuler|se connecter pour postuler|konto erstellen|registrieren sie sich|"
                    r"already have an account\?|vous avez d[ée]j[àa] un compte", re.I)
BOUTON_POSTULER = re.compile(r"^\s*(postuler|candidater|apply|apply now|apply for this job|bewerben|jetzt bewerben|"
                             r"postuler maintenant|postuler en ligne|je postule|d[ée]poser (ma|une) candidature|"
                             r"envoyer (ma|une) candidature|candidature en ligne|online bewerben)\b", re.I)
REFUS_COOKIES = re.compile(r"^\s*(tout refuser|refuser|refuser tout|reject all|reject|decline|nur notwendige|"
                           r"nur essenzielle|essentiels uniquement|cookies essentiels|uniquement les cookies (n[ée]cessaires|essentiels)|"
                           r"necessary only|only necessary|only essential|continuer sans accepter)\b", re.I)

# La lecture du formulaire : le <form> qui a le plus de champs visibles (ou la page entière s'il n'y a pas de <form>).
ETAT = r"""() => {
  const vis = (e) => !!e && !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length) && getComputedStyle(e).visibility !== 'hidden';
  const txt = (e) => (e ? (e.innerText || e.textContent || '') : '').replace(/\s+/g, ' ').trim();
  const utiles = (r) => [...r.querySelectorAll('input, select, textarea')].filter((el) => {
    const t = (el.getAttribute('type') || '').toLowerCase();
    return !['hidden', 'submit', 'button', 'image', 'reset', 'search'].includes(t) && !el.disabled;
  });
  let racine = null, max = -1;
  for (const f of document.querySelectorAll('form')) { const n = utiles(f).filter((e) => vis(e) || e.type === 'file').length; if (n > max) { max = n; racine = f; } }
  if (!racine || max < 1) racine = document.body;
  if (!racine) return null;
  document.querySelectorAll('[data-raime],[data-raime-bouton]').forEach((e) => { e.removeAttribute('data-raime'); e.removeAttribute('data-raime-bouton'); });
  const libelle = (el) => {
    let l = '';
    if (el.id) { const x = document.querySelector('label[for="' + CSS.escape(el.id) + '"]'); if (x) l = txt(x); }
    if (!l && el.closest('label')) l = txt(el.closest('label'));
    if (!l && el.getAttribute('aria-label')) l = el.getAttribute('aria-label');
    if (!l && el.getAttribute('aria-labelledby')) l = el.getAttribute('aria-labelledby').split(/\s+/).map((i) => txt(document.getElementById(i))).join(' ');
    if (!l) { const bloc = el.closest('.form-group, .form-item, .field, .form-field, .input-group, .row, div'); const x = bloc && bloc.querySelector('label, .label, legend'); if (x) l = txt(x); }
    return l.slice(0, 300);
  };
  const champs = [];
  let n = 0;
  for (const el of utiles(racine)) {
    const type = (el.tagName === 'INPUT' ? (el.getAttribute('type') || 'text') : el.tagName).toLowerCase();
    const bloc = el.closest('.form-group, .form-item, .field, .form-field, label, div') || el.parentElement;
    const visible = type === 'file' ? true : ['select', 'checkbox', 'radio'].includes(type) ? (vis(el) || vis(bloc)) : vis(el);
    if (!visible) continue;
    el.setAttribute('data-raime', String(n));
    const label = libelle(el);
    let question = '';
    if (type === 'radio' || type === 'checkbox') {
      const g = el.closest('fieldset, [role="radiogroup"], [role="group"]');
      const lg = g ? g.querySelector('legend, [class*="label"], [class*="question"]') : null;
      if (lg) question = txt(lg).slice(0, 300);
    }
    const etoile = /\*\s*$/.test(label) || /\*\s*$/.test(question) || !!(bloc && bloc.querySelector('.required, .mandatory, abbr[title*="requis" i], abbr[title*="required" i]'));
    const requis = el.required || el.getAttribute('aria-required') === 'true' || etoile;
    champs.push({ n: n++, tag: el.tagName.toLowerCase(), type, name: el.name || '', id: el.id || '', label, question,
      placeholder: el.getAttribute('placeholder') || '', required: requis, value: type === 'file' ? (el.files && el.files[0] ? el.files[0].name : '') : (el.value || ''),
      checked: !!el.checked, maxlength: el.maxLength > 0 ? el.maxLength : 0,
      options: el.tagName === 'SELECT' ? [...el.options].map((o) => [o.value, txt(o)]) : [] });
  }
  const boutons = [];
  let b = 0;
  const vus = new Set();
  for (const el of [...racine.querySelectorAll('button, input[type="submit"], input[type="button"], a[role="button"]'),
                    ...document.querySelectorAll('button, input[type="submit"], input[type="button"], a[role="button"], a.button, a.btn')]) {
    if (vus.has(el) || !vis(el) || el.disabled) continue;
    vus.add(el);
    el.setAttribute('data-raime-bouton', String(b));
    boutons.push({ n: b++, texte: (el.tagName === 'INPUT' ? (el.value || '') : (txt(el) || el.getAttribute('aria-label') || el.getAttribute('title') || '')).slice(0, 80) });
  }
  const mdp = [...document.querySelectorAll('input[type="password"]')].some(vis);
  return { champs, boutons, etape: '', mot_de_passe: mdp,
    erreurs: [...document.querySelectorAll('.error, .errors, .invalid-feedback, .field-error, [role="alert"], .alert-danger, .has-error .help-block')]
      .filter(vis).map(txt).filter((t) => t && t.length < 200).slice(0, 5) };
}"""

LIENS_POSTULER = r"""() => {
  const vis = (e) => !!e && !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
  const l = [];
  const nom = (e) => ((e.innerText || e.value || '').trim() || e.getAttribute('aria-label') || e.getAttribute('title')
    || ((e.querySelector('img') || {}).alt) || '').trim();
  document.querySelectorAll('a, button, input[type="button"], input[type="submit"]').forEach((e, i) => { if (vis(e)) { e.setAttribute('data-raime-lien', String(i)); l.push([String(i), nom(e).slice(0, 80)]); } });
  return l;
}"""


def _dire(t):
    print(t, flush=True)


def corps(cadre):
    try:
        return cadre.locator("body").inner_text(timeout=8000)
    except Exception:
        return ""


def captcha(page):
    """Un captcha visible arrête la candidature : il n'est jamais résolu, ni contourné."""
    for cadre in page.frames:
        try:
            loc = cadre.locator(mp.CAPTCHA)
            for i in range(min(loc.count(), 20)):
                if loc.nth(i).is_visible():
                    raise AToi("captcha", "formulaire de l'employeur")
        except AToi:
            raise
        except Exception:
            pass
    if mp.TEXTE_CAPTCHA.search(corps(page.main_frame)[:5000]):
        raise AToi("captcha", "formulaire de l'employeur")


def refuser_cookies(page):
    """Le bandeau de cookies : toujours le refus (ou « essentiels seulement »), jamais « tout accepter »."""
    mp.refuser_cookies(page)
    for cadre in page.frames:
        try:
            for role in ("button", "link"):
                loc = cadre.get_by_role(role, name=REFUS_COOKIES)
                if loc.count() and loc.first.is_visible():
                    loc.first.click(timeout=3000)
                    page.wait_for_timeout(800)
                    return
        except Exception:
            pass


def meilleur(page):
    """(cadre, état) du formulaire le plus fourni de la page, cadres compris."""
    choix = (None, None)
    for cadre in page.frames:
        try:
            e = cadre.evaluate(ETAT)
        except Exception:
            continue
        if e is None:
            continue
        poids = sum(1 for c in e["champs"] if c["type"] not in ("checkbox", "radio")) + (3 if any(c["type"] == "file" for c in e["champs"]) else 0)
        if choix[1] is None or poids > choix[1]["_poids"]:
            e["_poids"] = poids
            choix = (cadre, e)
    return choix


# un bouton court qui parle de postuler (« Postuler maintenant », « Jetzt online bewerben », « Apply for this position »),
# jamais celui d'un réseau (« Postuler avec LinkedIn ») ni un lien d'alerte
POSTULER_LARGE = re.compile(r"postul|apply|bewerb|candidat", re.I)
PAS_CELUI_LA = re.compile(r"linkedin|xing|indeed|google|facebook|alerte|alert|abonn|partager|share|spontan", re.I)


def suivre_postuler(page):
    """Sur la page de l'annonce, le bouton « Postuler » qui ouvre le formulaire (même onglet ou nouvel onglet), cadres compris."""
    candidats = []
    for cadre in page.frames:
        try:
            for i, texte in cadre.evaluate(LIENS_POSTULER):
                t = (texte or "").strip()
                if t and len(t) <= 45 and not PAS_CELUI_LA.search(t) and (BOUTON_POSTULER.search(t) or POSTULER_LARGE.search(t)):
                    candidats.append((0 if BOUTON_POSTULER.search(t) else 1, cadre, i))
        except Exception:
            continue
    for _, cadre, i in sorted(candidats, key=lambda x: x[0]):
        loc = cadre.locator('[data-raime-lien="%s"]' % i).first
        try:
            with page.context.expect_page(timeout=4000) as nouvelle:
                loc.click(timeout=5000)
            p2 = nouvelle.value
            p2.wait_for_load_state("domcontentloaded")
            p2.wait_for_timeout(3000)
            return p2
        except Exception:
            page.wait_for_timeout(3000)               # même onglet (ou formulaire déplié sur place)
            return page
    return page


def postuler(page, f, dos, p, envoyer=True, journal=None, captures=None):
    """Postule à l'offre f par le formulaire de l'employeur (f["url_externe"]), avec le dossier dos (CV et lettre en PDF)."""
    dire = journal or _dire
    oid = re.sub(r"[^\w.-]", "_", str(f.get("id") or "offre"))
    dos = Path(dos)
    cv, lettre_pdf = dos / "CV_Basile_Rame.pdf", dos / "Lettre_Basile_Rame.pdf"
    if captures is None and not envoyer:
        captures = Path(os.environ.get("DONNEES", "/data")) / "echecs"
    photos = []

    def photo(pg, nom):
        if not captures:
            return
        try:
            Path(captures).mkdir(parents=True, exist_ok=True)
            chemin = Path(captures) / ("%s-essai-%d-%s.png" % (oid, len(photos) + 1, re.sub(r"[^\w-]", "_", nom)))
            pg.screenshot(path=str(chemin), full_page=True)
            photos.append(str(chemin))
        except Exception as e:
            dire("  capture impossible : %s" % e)

    url = f.get("url_externe") or f.get("lien") or ""
    if not url.startswith("http"):
        raise AToi("formulaire", "aucun lien de candidature")
    if AVEC_COMPTE.search(url):
        raise AToi("compte", "ce site exige un compte candidat : " + url[:80])
    rep = page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(3500)
    if AVEC_COMPTE.search(page.url):
        raise AToi("compte", "ce site exige un compte candidat : " + page.url[:80])
    refuser_cookies(page)
    captcha(page)
    texte = corps(page.main_frame)
    if mp.expiree(rep.status if rep else 0, texte):
        raise AToi("expiree", "annonce retirée par l'employeur")
    if mp.DEJA.search(texte):
        return {"deja": True, "url": page.url}
    pg = page
    cadre, e = meilleur(pg)
    if e is None or e["_poids"] < 3:                    # la page de l'annonce : on ouvre le formulaire
        for _ in range(2):
            pg = suivre_postuler(pg)
            refuser_cookies(pg)
            cadre, e = meilleur(pg)
            if e is not None and e["_poids"] >= 3:
                break
    if e is None or e["_poids"] < 3:
        if COMPTE.search(corps(pg.main_frame)) or (e and e["mot_de_passe"]):
            raise AToi("compte", "ce site demande un compte candidat")
        raise AToi("formulaire", "formulaire de candidature introuvable : " + pg.url[:120])
    if e["mot_de_passe"] or (COMPTE.search(corps(cadre)) and not any(c["type"] == "file" for c in e["champs"])):
        raise AToi("compte", "ce site demande un compte candidat : " + pg.url[:80])
    if AVEC_COMPTE.search(pg.url):
        raise AToi("compte", "ce site exige un compte candidat : " + pg.url[:80])

    return etapes(pg, f, p, cv, lettre_pdf, envoyer, dire, photo, photos, oid)


# Les boutons d'étape : « Vérifier » / « Review » (LinkedIn) mènent à l'étape suivante, jamais à l'envoi
VERIFIER = re.compile(r"^\s*(v[ée]rifier|review|revoir|continuer|continue|weiter|suivant|next)\b", re.I)


def role(texte):
    r = mp.role(texte)
    return "suivant" if r == "autre" and VERIFIER.search(texte or "") else r


def etapes(pg, f, p, cv, lettre_pdf, envoyer, dire, photo, photos, oid, exiger_cv=True, nom="formulaire", garder=False):
    """Les étapes du formulaire, jusqu'au bouton d'envoi (cliqué seulement si envoyer=True)."""
    fait, recap = set(), []
    for tour in range(6):
        captcha(pg)
        cadre, e = meilleur(pg)
        if e is None:
            raise AToi("formulaire", "formulaire disparu")
        if e["mot_de_passe"]:
            raise AToi("compte", "le formulaire demande un mot de passe (création de compte)")
        for _ in range(3):                                 # un choix peut faire apparaître d'autres champs
            actions, notes = mp.decider(e["champs"], p, f, fait, garder=garder)
            recap += notes
            if not actions:
                break
            mp.appliquer(cadre, actions, cv, lettre_pdf)
            pg.wait_for_timeout(1200)
            captcha(pg)
            cadre, e = meilleur(pg)
            if e is None:
                raise AToi("formulaire", "formulaire disparu")
        dire("  " + nom + " %s : étape %d remplie (%d champs)" % (oid, tour + 1, len(e["champs"])))
        photo(pg, "etape-%d" % (tour + 1))
        boutons = [dict(b, role=role(b["texte"])) for b in e["boutons"]]
        envoi = next((b for b in boutons if b["role"] == "envoi"), None)
        if envoi:
            if exiger_cv and not any(c["type"] == "file" and c.get("value") for c in e["champs"]) and not any("CV" in n for n in recap):
                raise AToi("formulaire", "aucun champ pour joindre le CV")
            if not envoyer:
                return {"verifie": True, "url": pg.url, "etapes": tour + 1, "reponses": " | ".join(recap)[:1500],
                        "captures": photos, "lettre": bool((f.get("lettre") or "").strip()), "bouton": envoi["texte"]}
            cadre.locator('[data-raime-bouton="%s"]' % envoi["n"]).first.click()
            return attendre_confirmation(pg, recap)
        suivant = next((b for b in boutons if b["role"] == "suivant"), None)
        if not suivant:
            raise AToi("formulaire", "ni « Suivant » ni « Envoyer » sur la page (étape %d)" % (tour + 1))
        avant = tuple(sorted((c.get("name") or c.get("id") or "") for c in e["champs"]))
        cadre.locator('[data-raime-bouton="%s"]' % suivant["n"]).first.click()
        for _ in range(40):
            pg.wait_for_timeout(500)
            _, nouvel = meilleur(pg)
            if nouvel is not None and tuple(sorted((c.get("name") or c.get("id") or "") for c in nouvel["champs"])) != avant:
                break
        else:
            raise AToi("formulaire", "étape %d refusée : %s" % (tour + 1, "; ".join(e["erreurs"])[:200] or "sans message"))
    raise AToi("formulaire", "parcours plus long que prévu (6 étapes)")


CONFIRMATION = re.compile(mp.CONFIRMATION.pattern + r"|thank you for (your )?appl|we have received your appl|"
                          r"vielen dank f[üu]r ihre bewerbung|votre candidature (a [ée]t[ée] )?(bien )?(envoy|enregistr|re[çc])", re.I)


def attendre_confirmation(page, recap):
    for _ in range(45):
        page.wait_for_timeout(1000)
        if re.search(r"success|merci|thank-?you|confirmation|danke", page.url, re.I) or CONFIRMATION.search(corps(page.main_frame)):
            return {"envoye": True, "url": page.url, "quand": time.strftime("%d.%m.%Y %H:%M"), "reponses": " | ".join(recap)[:1500]}
        captcha(page)
        _, e = meilleur(page)
        if e is not None and e["erreurs"]:
            raise AToi("formulaire", "envoi refusé : " + "; ".join(e["erreurs"])[:200])
    raise AToi("incertain", "« Envoyer » cliqué, confirmation non reconnue : vérifie dans ta boîte e-mail avant de revalider")
