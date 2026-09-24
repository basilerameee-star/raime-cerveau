# -*- coding: utf-8 -*-
"""CAS FIGÉS — lecture des propositions reçues (PDF, Word, OpenDocument).

Tourne sur le poste (l'extraction se fait avant l'envoi au serveur) :
    python tests/cas_figes_lecture.py
Chaque cas fabrique son document, le lit, et vérifie qu'aucun chiffre ne se perd,
et qu'un document illisible est refusé au lieu de partir vide à l'audit.
"""
import pathlib
import sys
import tempfile
import zipfile

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "tools"))
from extraire_texte import extraire, Illisible  # noqa: E402

RACINE = pathlib.Path(__file__).resolve().parent.parent
PROPOSITION = (RACINE / "samples" / "proposition-exemple.txt").read_text(encoding="utf-8")
ok = ko = 0


def verifie(nom, cond, info=""):
    global ok, ko
    if cond:
        ok += 1
    else:
        ko += 1
        print("  ÉCHEC :", nom, info)


def refuse(chemin):
    try:
        extraire(chemin)
        return False
    except Illisible:
        return True


def docx(chemin, paragraphes, tableau):
    w = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
    esc = lambda s: s.replace("&", "&amp;").replace("<", "&lt;")
    corps = "".join(f"<w:p><w:r><w:t>{esc(p)}</w:t></w:r></w:p>" for p in paragraphes)
    lignes = "".join("<w:tr>" + "".join(f"<w:tc><w:p><w:r><w:t>{esc(c)}</w:t></w:r></w:p></w:tc>" for c in l) + "</w:tr>"
                     for l in tableau)
    xml = f'<?xml version="1.0" encoding="UTF-8"?><w:document {w}><w:body>{corps}<w:tbl>{lignes}</w:tbl></w:body></w:document>'
    with zipfile.ZipFile(chemin, "w") as z:
        z.writestr("word/document.xml", xml)


def odt(chemin, paragraphes):
    ns = ('xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" '
          'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"')
    esc = lambda s: s.replace("&", "&amp;").replace("<", "&lt;")
    corps = "".join(f"<text:p>{esc(p)}</text:p>" for p in paragraphes)
    xml = f'<?xml version="1.0" encoding="UTF-8"?><office:document-content {ns}><office:body><office:text>{corps}</office:text></office:body></office:document-content>'
    with zipfile.ZipFile(chemin, "w") as z:
        z.writestr("content.xml", xml)


with tempfile.TemporaryDirectory() as d:
    d = pathlib.Path(d)
    lignes = [l for l in PROPOSITION.splitlines() if l.strip()]

    # 1. Word : paragraphes et tableau de prix, sans rien perdre
    docx(d / "offre.docx", lignes, [["Mise en route", "18 500 €"], ["Abonnement", "1 450 € / mois"]])
    t = extraire(d / "offre.docx")
    verifie("docx : texte", "NexaFlow" in t and "1 200 e-mails" in t)
    verifie("docx : tableau", "Mise en route | 18 500 €" in t, t[-200:])

    # 2. OpenDocument
    odt(d / "offre.odt", lignes)
    verifie("odt : texte", "Cabinet Delmas" in extraire(d / "offre.odt"))

    # 3. PDF numérique : le texte de chaque page revient, pages repérées
    try:
        import fitz
        doc = fitz.open()
        moitie = len(lignes) // 2
        for bloc in (lignes[:moitie], lignes[moitie:]):
            page = doc.new_page()
            page.insert_textbox(fitz.Rect(40, 40, 560, 800), "\n".join(bloc), fontsize=8)
        doc.save(d / "offre.pdf")
        t = extraire(d / "offre.pdf")
        verifie("pdf : texte", "NexaFlow" in t and "[page 2]" in t, t[:120])

        # 4. PDF scanné (image seule) : refusé, jamais envoyé vide
        scan = fitz.open()
        p = scan.new_page()
        p.draw_rect(fitz.Rect(50, 50, 500, 700), fill=(0.9, 0.9, 0.9))
        scan.save(d / "scan.pdf")
        verifie("pdf scanne refuse", refuse(d / "scan.pdf"))
    except ImportError:
        print("  (PyMuPDF absent : cas PDF sautés)")

    # 5. ancien Word, format inconnu, fichier abîmé
    (d / "vieux.doc").write_bytes(b"\xd0\xcf\x11\xe0")
    verifie("doc refuse", refuse(d / "vieux.doc"))
    (d / "offre.xlsx").write_bytes(b"PK")
    verifie("format inconnu refuse", refuse(d / "offre.xlsx"))

    # 6. texte brut : passe tel quel
    verifie("txt : tel quel", "NF-2026-0847" in extraire(RACINE / "samples" / "proposition-exemple.txt"))

print(f"cas figes lecture : {ok}/{ok + ko} {'KO' if ko else 'OK'}")
sys.exit(1 if ko else 0)
