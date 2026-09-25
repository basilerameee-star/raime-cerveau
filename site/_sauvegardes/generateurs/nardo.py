# -*- coding: utf-8 -*-
"""
GRIS NARDO MAT (demande de Basile, 25/09/2026) : le site noir passe sur un fond gris Nardo mat, le texte
en noir. Appliquee a la page finie (parcours.py --nardo, pages_annexes.py --nardo) : chaque couleur du
noir a sa correspondance, rien d'autre ne change.

Le gris : le vrai Nardo (environ #686a6c) ne laisse au texte noir qu'un contraste de 3,9 : trop peu pour
le petit texte (4,5 exige). Un Nardo a peine plus clair, #7a7c7e, donne 5,0 au noir et 4,5 au #111.
Le texte secondaire reste donc presque noir : la hierarchie passe par la taille et la graisse.
Le mat : un grain tres fin, pose en dessous de tout.
"""
import re

FOND = "#7a7c7e"
FOND_RGB = "122,124,126"
CARTE = "#818386"       # les cartes et les cases, un ton au-dessus du fond
CARTE_2 = "#898b8e"     # les elements mis en avant

COULEURS = {
    # les textes et les traits blancs deviennent noirs
    "#fff": "#000", "#ffffff": "#000",
    "#e6e6e6": "#0a0a0a", "#d9d9d9": "#0a0a0a",
    "#9d9d9d": "#111", "#b9b9b9": "#111", "#b3b3b3": "#111", "#cfcfcf": "#111",
    # les panneaux clairs (menu, cadre de l'agenda) deviennent sombres
    "#e8e8e8": "#111", "#e9e9e9": "#111", "#ececec": "#111", "#555": "#b4b6b8",
    # les fonds noirs deviennent gris Nardo
    "#000": FOND, "#000000": FOND, "#020202": FOND, "#070707": FOND,
    "#030303": CARTE, "#040404": CARTE, "#050505": CARTE, "#08080c": CARTE, "#0b0b10": CARTE, "#0d0d0d": CARTE,
    "#111": CARTE_2, "#141414": CARTE_2, "#151515": CARTE_2, "#222": CARTE_2, "#23232b": CARTE_2,
}

MAT = ("html[data-theme=\"noir\"] .pc-mat,.pc-mat{position:fixed;inset:0;z-index:-2;pointer-events:none;opacity:.2;"
       "background-image:url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'>"
       "<filter id='g'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/>"
       "<feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 .6 0'/></filter>"
       "<rect width='100%' height='100%' filter='url(%23g)'/></svg>\")}"
       # les boutons pleins passent en noir : leur texte en clair, pour rester net
       ".pc-cta,.pc-bouton-carre,.pc-bouton,a.pc-bouton,.bouton,.appel{color:#f2f2f2!important}"
       ".pc-cta:hover,.pc-bouton-carre:hover,.pc-bouton:hover{background:#1c1c1c!important}"
       # le voile des fenetres (agenda, Score) : sombre, pour detacher la fenetre du fond
       ".pc-rdv,.rdv{background:rgba(24,24,26,.55)!important}"
       "html,body{background-color:" + FOND + "}")


# Le reflet des mots-cles : sur un gris moyen, un degrade du noir vers le rose passe par des tons
# gris ou la lettre disparait. Ici, bords francs : les lettres passent du noir a un rose tres clair.
REFLET_NOIR = ("linear-gradient(100deg,#e6e6e6 0%,#e6e6e6 26%,#ffd3e4 36%,#ff7eb0 45%,#ff7eb0 55%,"
               "#ffd3e4 64%,#e6e6e6 74%,#e6e6e6 100%)")
REFLET_NARDO = ("linear-gradient(100deg,#0a0a0a 0%,#0a0a0a 33%,#ffb3d1 35.5%,#ffe0ec 50%,#ffb3d1 64.5%,"
                "#0a0a0a 67%,#0a0a0a 100%)")

# La colonne mise en avant des tarifs passe en noir : son texte en clair.
COLONNE = (".pc-tarif--fort,.pc-tarif--fort h2,.pc-tarif--fort b,.pc-tarif--fort p,.pc-tarif--fort span,"
           ".pc-tarif--fort .pc-comment,.pc-tarif--fort .pc-tarif-bouton{color:#f2f2f2!important}"
           ".pc-tarif--fort small,.pc-tarif--fort .pc-tarif-prix span{color:#c9cbcd!important}"
           ".pc-tarif--fort .pc-comment{text-decoration-color:rgba(242,242,242,.5)!important}"
           ".pc-tarif--fort .pc-tarif-bouton{border-color:#f2f2f2!important}")


def nardo(page):
    """Passe une page du noir au gris Nardo mat, texte noir."""
    page = page.replace(REFLET_NOIR, REFLET_NARDO)
    # 1. le blanc et le noir translucides echangent leurs roles (un repere evite le double remplacement)
    page = (page.replace("rgba(255,255,255,", "\x00B\x00").replace("rgba(0,0,0,", "rgba(%s," % FOND_RGB)
            .replace("\x00B\x00", "rgba(0,0,0,").replace("rgba(230,230,230,", "rgba(17,17,17,"))
    # 2. le champ de particules : noir, et rose sous le curseur
    page = page.replace('"rgba(255," + Math.round(255 - 129*pr) + "," + Math.round(255 - 79*pr) + ","',
                        '"rgba(" + Math.round(255*pr) + "," + Math.round(126*pr) + "," + Math.round(176*pr) + ","')
    # 3. chaque couleur pleine, en un seul passage
    page = re.sub(r"#[0-9a-fA-F]{3,6}\b", lambda m: COULEURS.get(m.group(0).lower(), m.group(0)), page)
    # 4. le logo noir, le grain mat, les boutons
    page = page.replace("/logo-mark-blanc.png", "/logo-mark.png")
    page = page.replace("</style>", MAT + COLONNE + "</style>", 1)
    page = page.replace("<body>", '<body>\n<div class="pc-mat" aria-hidden="true"></div>', 1)
    return page


# ── Variante TEXTE BLANC (25/09/2026, « ok teste le texte en blanc ») ────────────────────────────
# Le blanc se lit bien sur le vrai Nardo (#686a6c) : contraste 5,4. Le texte secondaire reste presque
# blanc (#ededed, 4,8) ; les cartes, un ton plus sombre que le fond. Les boutons restent blancs.
# 25/09 : Basile le veut « un peu plus clair » : #737577, le plus clair ou le blanc tient encore 4,6.
# Le texte secondaire passe donc au blanc aussi (un gris clair y tomberait sous 4,5).
FOND_B = "#737577"
FOND_B_RGB = "115,117,119"
COULEURS_BLANC = {
    "#000": FOND_B, "#000000": FOND_B, "#020202": FOND_B, "#070707": FOND_B,
    "#030303": "#6b6d6f", "#040404": "#6b6d6f", "#050505": "#6b6d6f", "#08080c": "#6b6d6f", "#0b0b10": "#6b6d6f",
    "#0d0d0d": "#6b6d6f",
    "#111": "#646668", "#141414": "#646668", "#151515": "#646668", "#222": "#646668", "#23232b": "#646668",
    "#9d9d9d": "#fff", "#b9b9b9": "#fff", "#b3b3b3": "#fff", "#cfcfcf": "#fff",
    "#d9d9d9": "#fff", "#e6e6e6": "#fff", "#ececec": "#fff",
}
REFLET_BLANC = ("linear-gradient(100deg,#fff 0%,#fff 26%,#ffd3e4 36%,#ff9cc4 45%,#ff9cc4 55%,"
                "#ffd3e4 64%,#fff 74%,#fff 100%)")
# Sur les panneaux clairs (colonne mise en avant, menu), le gris du fond serait trop pale pour le texte :
# on y ecrit en gris tres fonce.
PANNEAUX_B = (".pc-tarif--fort,.pc-tarif--fort h2,.pc-tarif--fort p,.pc-tarif--fort b,.pc-tarif--fort span,.pc-tarif--fort small,"
              ".pc-tarif--fort .pc-comment,.pc-tarif--fort .pc-tarif-bouton,.pc-menu-droite,.pc-menu-droite a,"
              ".pc-menu-droite button,.pc-menu-droite p,.pc-menu-droite span,.pc-onglets button[aria-selected=\"true\"]{color:#1f2021!important}")
MAT_B = MAT.replace("opacity:.2;", "opacity:.24;").replace(
    ".pc-cta,.pc-bouton-carre,.pc-bouton,a.pc-bouton,.bouton,.appel{color:#f2f2f2!important}"
    ".pc-cta:hover,.pc-bouton-carre:hover,.pc-bouton:hover{background:#1c1c1c!important}", "").replace(FOND, FOND_B)


def nardo_blanc(page):
    """Passe une page du noir au gris Nardo mat (le vrai), texte blanc."""
    page = page.replace(REFLET_NOIR, REFLET_BLANC)
    page = page.replace("rgba(0,0,0,", "rgba(%s," % FOND_B_RGB)
    page = re.sub(r"#[0-9a-fA-F]{3,6}\b", lambda m: COULEURS_BLANC.get(m.group(0).lower(), m.group(0)), page)
    page = page.replace("</style>", MAT_B + PANNEAUX_B + "</style>", 1)
    page = page.replace("<body>", '<body>\n<div class="pc-mat" aria-hidden="true"></div>', 1)
    return page
