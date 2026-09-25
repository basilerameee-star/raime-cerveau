# -*- coding: utf-8 -*-
"""VERSION JOUR du site noir (demande de Basile, 25/09/2026).

La nuit est le site tel qu'il est : blanc sur noir. Le jour, le blanc et le noir s'inversent ;
les mots-cles restent roses (le rose « papier » de la charte, #c9245f, lisible sur blanc).
Le visiteur choisit avec le bouton a cote de la langue ; son choix est garde dans son navigateur.

La feuille « jour » n'est pas ecrite a la main : elle est DERIVEE de la feuille noire. Chaque
declaration qui porte une couleur est recopiee sous html[data-jour], avec sa couleur inversee
(clarte L -> 1 - L, teinte et saturation gardees). Une retouche de la feuille noire se retrouve
donc le jour, sans double saisie. Les masques (mask-image) ne sont jamais inverses : ils portent
une transparence, pas une couleur.

    from jour import appliquer_jour
    page = appliquer_jour(page)          # apres alleger(page)
"""
import colorsys
import re

# Retouches de Basile (25/09/2026) : le fond du jour n'est pas un blanc pur mais un gris clair, a peine
# plus fonce que le blanc ; le rose du jour est plus clair que le rose papier, tout en restant lisible
# sur ce gris (contraste 3:1 au moins pour les grands titres).
FOND_JOUR = 237                                   # #ededed : le noir de la nuit devient ce gris clair
ROSES = {(255, 126, 176): (219, 79, 139)}         # #db4f8b

# les blocs qu'on ne recopie pas : ils ne portent pas de couleur a inverser
SANS_COULEUR = ("@keyframes", "@-webkit-keyframes", "@font-face", "@page", "@import", "@charset")

COULEUR = re.compile(
    r"#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3,4}\b"
    r"|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*[\d.]+%?\s*)?\)"
    r"|\b(?:white|black)\b")
URL = re.compile(r"url\([^)]*\)")
# Les proprietes qui portent une couleur : elles sont TOUJOURS recopiees, meme quand leur valeur n'en
# contient pas (none, transparent, 0, var(...)). Sinon un « background:none » de la nuit, pose pour
# annuler une couleur plus generale, manquerait le jour, et la couleur generale inversee reviendrait.
PORTE_COULEUR = re.compile(
    r"^(color|background(-color|-image)?|border(-(top|right|bottom|left))?(-color)?|outline(-color)?"
    r"|box-shadow|text-shadow|fill|stroke|-webkit-text-fill-color|-webkit-text-stroke(-color)?"
    r"|text-decoration(-color)?|caret-color|column-rule(-color)?|accent-color|stop-color)$")


def inverse(r, g, b):
    """Clarte inversee, teinte gardee ; le rose des mots-cles devient le rose papier."""
    if (r, g, b) in ROSES:
        return ROSES[(r, g, b)]
    h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    r2, g2, b2 = colorsys.hls_to_rgb(h, (1 - l) * FOND_JOUR / 255, s)
    return round(r2 * 255), round(g2 * 255), round(b2 * 255)


def _hex(c):
    c = c[1:]
    if len(c) in (3, 4):
        c = "".join(x * 2 for x in c)
    return int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16), (c[6:8] if len(c) == 8 else "")


def inverser_couleur(m):
    t = m.group(0)
    if t == "white":
        return "black"
    if t == "black":
        return "white"
    if t.startswith("#"):
        r, g, b, a = _hex(t)
        r, g, b = inverse(r, g, b)
        return "#%02x%02x%02x%s" % (r, g, b, a)
    nums = re.findall(r"[\d.]+%?", t)
    r, g, b = (int(x) for x in nums[:3])
    r, g, b = inverse(r, g, b)
    if len(nums) == 4:
        return "rgba(%d,%d,%d,%s)" % (r, g, b, nums[3])
    return "rgb(%d,%d,%d)" % (r, g, b)


def inverser_valeur(v):
    """Inverse les couleurs d'une valeur CSS, sans toucher aux adresses url(...)."""
    morceaux, dernier = [], 0
    for u in URL.finditer(v):
        morceaux.append(COULEUR.sub(inverser_couleur, v[dernier:u.start()]))
        morceaux.append(u.group(0))
        dernier = u.end()
    morceaux.append(COULEUR.sub(inverser_couleur, v[dernier:]))
    return "".join(morceaux)


def _decouper(texte, sep):
    """Decoupe au premier niveau (hors parentheses et guillemets)."""
    out, prof, cour, guil = [], 0, [], None
    for ch in texte:
        if guil:
            cour.append(ch)
            if ch == guil:
                guil = None
            continue
        if ch in "\"'":
            guil = ch
        elif ch == "(":
            prof += 1
        elif ch == ")":
            prof -= 1
        elif ch == sep and prof == 0:
            out.append("".join(cour))
            cour = []
            continue
        cour.append(ch)
    out.append("".join(cour))
    return out


def _blocs(css):
    """(entete, contenu) au premier niveau d'une feuille, sans les commentaires."""
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    i, n, out = 0, len(css), []
    while i < n:
        j = css.find("{", i)
        if j < 0:
            break
        entete = css[i:j].strip()
        prof, k, guil = 1, j + 1, None
        while k < n and prof:
            ch = css[k]
            if guil:
                if ch == guil:
                    guil = None
            elif ch in "\"'":
                guil = ch
            elif ch == "{":
                prof += 1
            elif ch == "}":
                prof -= 1
            k += 1
        out.append((entete.split(";")[-1].strip(), css[j + 1:k - 1]))
        i = k
    return out


def prefixer(sel):
    s = sel.strip()
    m = re.match(r'html\[data-theme="noir"\]', s)
    if m:
        return 'html[data-theme="noir"][data-jour]' + s[m.end():]
    if re.match(r"html(?![\w-])", s):
        return "html[data-jour]" + s[4:]
    if s.startswith(":root"):
        return ":root[data-jour]" + s[5:]
    return "html[data-jour] " + s


def feuille_jour(css):
    """La feuille jour, derivee de la feuille nuit : seules les declarations colorees, inversees."""
    sortie = []
    for entete, contenu in _blocs(css):
        if not entete:
            continue
        if entete.startswith(SANS_COULEUR):
            continue
        if entete.startswith("@"):
            dedans = feuille_jour(contenu)
            if dedans:
                sortie.append("%s{%s}" % (entete, dedans))
            continue
        decls = []
        for d in _decouper(contenu, ";"):
            if ":" not in d:
                continue
            prop, _, val = d.partition(":")
            prop = prop.strip()
            if not prop or "mask" in prop or prop in ("src", "font", "font-family", "content"):
                continue
            sans_url = URL.sub("", val)
            if not COULEUR.search(sans_url) and not PORTE_COULEUR.match(prop.lower()):
                continue
            decls.append("%s:%s" % (prop, inverser_valeur(val.strip())))
        if decls:
            selecteurs = ",".join(prefixer(s) for s in _decouper(entete, ",") if s.strip())
            sortie.append("%s{%s}" % (selecteurs, ";".join(decls)))
    return "\n".join(sortie)


# ce que la derivation ne peut pas deviner
COMPLEMENT = """
html[data-jour]{color-scheme:light;background:#ededed}
/* le fond est peint sur html, jamais sur body : un body colore passerait par-dessus le calque des particules */
html[data-jour] body,html[data-theme="noir"][data-jour] body{background:transparent!important}
html[data-jour] [fill="#fff"]{fill:#000}
html[data-jour] img[src*="logo-mark-blanc"]{filter:invert(1)}
"""

# avant le premier affichage : le choix du visiteur, sans eclair de la mauvaise couleur
AVANT = ('<script id="raime-jour-avant">try{if(localStorage.getItem("pc-jour")==="1")'
         'document.documentElement.setAttribute("data-jour","")}catch(e){}</script>')


def appliquer_jour(page):
    """Ajoute a la page la feuille jour derivee de toutes ses feuilles, et le choix garde."""
    feuilles = re.findall(r"<style[^>]*>(.*?)</style>", page, flags=re.S)
    css = feuille_jour("\n".join(feuilles)) + COMPLEMENT
    page = page.replace("</head>", '<style id="raime-jour">%s</style>\n</head>' % css, 1)
    return re.sub(r"(<head[^>]*>)", r"\1" + AVANT.replace("\\", "\\\\"), page, count=1)


if __name__ == "__main__":
    # essais rapides
    assert inverser_valeur("#fff") == "#000000"
    assert inverser_valeur("rgba(255,255,255,.12)") == "rgba(0,0,0,.12)"
    assert inverser_valeur("#ff7eb0") == "#db4f8b"
    assert inverser_valeur("rgba(255,126,176,.26)") == "rgba(219,79,139,.26)"
    assert inverser_valeur("url(#po-hachures) #000") == "url(#po-hachures) #ededed"
    assert inverser_valeur("#a6a6a6") == "#535353", inverser_valeur("#a6a6a6")
    f = feuille_jour('html[data-theme="noir"] .a{color:#fff;padding:2px}.b{mask-image:linear-gradient(#000,transparent)}'
                     '@media (max-width:900px){.c{background:rgba(0,0,0,.5)}}@keyframes k{to{color:#fff}}')
    assert f == ('html[data-theme="noir"][data-jour] .a{color:#000000}\n'
                 '@media (max-width:900px){html[data-jour] .c{background:rgba(237,237,237,.5)}}'), f
    # un « background:none » de la nuit est recopie : il continue d'annuler la couleur generale le jour
    g = feuille_jour('.t{background:#e9e9e9;color:#000}html[data-theme="noir"] .t{background:none;color:#fff;border-radius:2px}')
    assert 'html[data-theme="noir"][data-jour] .t{background:none;color:#000000}' in g, g
    print("jour.py : essais OK")
