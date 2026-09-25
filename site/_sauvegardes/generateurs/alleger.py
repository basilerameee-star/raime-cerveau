# -*- coding: utf-8 -*-
"""
ALLEGER (25/09/2026) : retire de la feuille de style de la page finie les regles qui ne peuvent plus
rien toucher. Une regle est retiree quand chacun de ses selecteurs cite une classe ou un id qui
n'apparait nulle part ailleurs dans la page (HTML, textes, script). La feuille source ne change pas :
seule la page produite est allegee, les versions bleue et rose gardent tout.

Les classes fabriquees par morceaux dans le script (« pc-chemins-- » + un nombre) sont protegees.
"""
import re

PROTEGES = ("pc-chemins--",)


def _regles(css):
    """Decoupe une feuille en blocs de premier niveau : (prelude, corps) ; corps = texte ou liste de blocs."""
    blocs, i, n = [], 0, len(css)
    while i < n:
        j = css.find("{", i)
        if j < 0:
            break
        prelude = css[i:j].strip()
        prof, k = 1, j + 1
        while k < n and prof:
            if css[k] == "{":
                prof += 1
            elif css[k] == "}":
                prof -= 1
            k += 1
        corps = css[j + 1:k - 1]
        if prelude.startswith("@media") or prelude.startswith("@supports"):
            blocs.append((prelude, _regles(corps)))
        else:
            blocs.append((prelude, corps))
        i = k
    return blocs


def _vivant(selecteur, texte):
    for nom in re.findall(r"[.#]([A-Za-z_][\w-]*)", re.sub(r"\[[^\]]*\]|url\([^)]*\)", "", selecteur)):
        if any(nom.startswith(p) for p in PROTEGES):
            continue
        if not re.search(r"(?<![\w-])%s(?![\w-])" % re.escape(nom), texte):
            return False
    return True


def _ecrire(blocs, texte, retires):
    sortie = []
    for prelude, corps in blocs:
        if isinstance(corps, list):
            dedans = _ecrire(corps, texte, retires)
            if dedans:
                sortie.append("%s{%s}" % (prelude, dedans))
            continue
        if prelude.startswith("@") or prelude.startswith(":root") or not prelude:
            sortie.append("%s{%s}" % (prelude, corps))
            continue
        garde = [s for s in (x.strip() for x in prelude.split(",")) if _vivant(s, texte)]
        retires.extend(s for s in (x.strip() for x in prelude.split(",")) if s not in garde)
        if garde:
            sortie.append("%s{%s}" % (",".join(garde), corps))
    return "\n".join(sortie)


def alleger(page, rapport=False):
    """Allege chaque <style> de la page ; renvoie la page (et, si demande, les selecteurs retires)."""
    styles = list(re.finditer(r"(<style[^>]*>)(.*?)(</style>)", page, re.S))
    texte = page
    for m in styles:
        texte = texte.replace(m.group(0), " ")
    retires = []
    for m in reversed(styles):
        css = re.sub(r"/\*.*?\*/", "", m.group(2), flags=re.S)
        nouveau = _ecrire(_regles(css), texte, retires)
        page = page[:m.start(2)] + nouveau + page[m.end(2):]
    return (page, retires) if rapport else page


if __name__ == "__main__":
    import sys, io
    f = sys.argv[1]
    avant = io.open(f, encoding="utf-8").read()
    apres, retires = alleger(avant, rapport=True)
    print("avant %.1f Ko, apres %.1f Ko, %d selecteurs retires" % (len(avant.encode()) / 1024, len(apres.encode()) / 1024, len(retires)))
    for s in retires[:400]:
        print("  -", s)
