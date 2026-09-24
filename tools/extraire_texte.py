#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Texte d'une proposition reçue en PDF, Word ou OpenDocument, pour l'Analyste.

Usage : python tools/extraire_texte.py <proposition.pdf|.docx|.odt|.txt> <sortie.txt>

- PDF : texte page par page (PyMuPDF). Un PDF scanné (une image par page) n'a pas de
  texte : l'outil s'arrête et le dit, plutôt que d'envoyer une page vide à l'audit.
- Word (.docx) et OpenDocument (.odt) : paragraphes et tableaux, sans dépendance.
- L'ancien format Word (.doc) n'est pas lu : l'enregistrer en .docx ou en PDF.
Code de sortie : 0 si le texte est écrit, 2 si le document n'est pas lisible.
"""
import pathlib
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

MINIMUM = 200  # en dessous, le document est presque vide : scan, image, ou fichier protégé

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
TEXT = "{urn:oasis:names:tc:opendocument:xmlns:text:1.0}"
TABLE = "{urn:oasis:names:tc:opendocument:xmlns:table:1.0}"


class Illisible(Exception):
    pass


def pdf(chemin):
    try:
        import fitz
    except ImportError:
        raise Illisible("PyMuPDF absent : impossible de lire un PDF sur ce poste.")
    doc = fitz.open(str(chemin))
    if doc.needs_pass:
        raise Illisible("PDF protégé par un mot de passe : demander une version sans protection.")
    pages = [p.get_text("text") for p in doc]
    return "\n\n".join(f"[page {i + 1}]\n{t.strip()}" for i, t in enumerate(pages) if t.strip())


def _texte_word(el):
    return "".join(t.text or "" for t in el.iter(W + "t"))


def docx(chemin):
    with zipfile.ZipFile(chemin) as z:
        racine = ET.fromstring(z.read("word/document.xml"))
    corps = racine.find(W + "body")
    lignes = []
    for bloc in corps:
        if bloc.tag == W + "p":
            lignes.append(_texte_word(bloc))
        elif bloc.tag == W + "tbl":
            for tr in bloc.iter(W + "tr"):
                cellules = [_texte_word(tc).strip() for tc in tr.findall(W + "tc")]
                lignes.append(" | ".join(cellules))
    return "\n".join(lignes)


def odt(chemin):
    with zipfile.ZipFile(chemin) as z:
        racine = ET.fromstring(z.read("content.xml"))
    lignes = []
    for el in racine.iter():
        if el.tag in (TEXT + "p", TEXT + "h"):
            lignes.append("".join(el.itertext()))
        elif el.tag == TABLE + "table-row":
            lignes.append(" | ".join("".join(c.itertext()).strip() for c in el.findall(TABLE + "table-cell")))
    return "\n".join(lignes)


def extraire(chemin):
    chemin = pathlib.Path(chemin)
    ext = chemin.suffix.lower()
    if ext in (".txt", ".md"):
        texte = chemin.read_text(encoding="utf-8", errors="replace")
    elif ext == ".pdf":
        texte = pdf(chemin)
    elif ext == ".docx":
        texte = docx(chemin)
    elif ext == ".odt":
        texte = odt(chemin)
    elif ext == ".doc":
        raise Illisible("Ancien format Word (.doc) : l'enregistrer en .docx ou en PDF, puis relancer.")
    else:
        raise Illisible(f"Format non pris en charge : {ext or 'sans extension'} (PDF, .docx, .odt ou .txt).")
    texte = re.sub(r"[ \t]+\n", "\n", texte)
    texte = re.sub(r"\n{3,}", "\n\n", texte).strip()
    utile = len(re.sub(r"\s+|\[page \d+\]", "", texte))
    if utile < MINIMUM:
        raise Illisible(
            f"Presque aucun texte lisible ({utile} caractères). "
            + ("PDF scanné (des images de pages) : demander la version numérique d'origine."
               if ext == ".pdf" else "Document vide ou protégé."))
    return texte


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        return 1
    try:
        texte = extraire(sys.argv[1])
    except Illisible as e:
        print(f"ILLISIBLE : {e}")
        return 2
    except (zipfile.BadZipFile, KeyError, ET.ParseError) as e:
        print(f"ILLISIBLE : fichier abîmé ou mal nommé ({e.__class__.__name__}).")
        return 2
    pathlib.Path(sys.argv[2]).write_text(texte, encoding="utf-8")
    print(f"texte extrait : {len(texte)} caractères -> {sys.argv[2]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
