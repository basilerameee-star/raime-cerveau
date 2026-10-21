"""Ce qu'on voit et entend dans un clip, mesuré dans la vidéo elle-même (21/10/2026, demande de Basile : savoir ce qui
retient le spectateur, à l'image et dans les couleurs). 0 jeton : OpenCV et le fichier de sous-titres.

Pour chaque clip : durée, luminosité, saturation, part de couleurs chaudes, contraste, « colorfulness » (Hasler et
Süsstrunk, 2003), mouvement moyen, coupes par 10 s, visage dans la première seconde et demie, délai avant le premier mot,
longueur du titre à l'image, et les variantes d'essai inscrites au montage (variantes.json).
Lancé dans le conteneur du clippeur (cv2 et ffmpeg) par analyste.py :
    python /app/caracteristiques.py /sortie/<campagne>/clip-NN.mp4 [...]   → une ligne JSON par clip
"""
import json
import os
import re
import sys


def mesurer(chemin):
    import cv2
    import numpy as np
    cap = cv2.VideoCapture(chemin)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    duree = n / fps if n else 0
    det = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    lum, sat, chaud, contraste, couleur, mouv = [], [], [], [], [], []
    coupes, precedent, visage = 0, None, False
    pas = 1 / 5                                                   # 5 images par seconde suffisent pour le rythme
    saut = max(1, int(round(fps * pas)))
    i = -1
    while True:                                                   # lecture continue : grab() saute vite les images inutiles
        i += 1
        if not cap.grab():
            break
        if i % saut:
            continue
        ok, im = cap.retrieve()
        if not ok:
            break
        t = i / fps
        petit = cv2.resize(im, (180, 320))
        hsv = cv2.cvtColor(petit, cv2.COLOR_BGR2HSV)
        gris = cv2.cvtColor(petit, cv2.COLOR_BGR2GRAY)
        if abs(t - round(t)) < pas / 2:                          # les couleurs : une image par seconde
            lum.append(float(hsv[..., 2].mean()) / 255)
            sat.append(float(hsv[..., 1].mean()) / 255)
            h = hsv[..., 0]
            vive = hsv[..., 1] > 60
            chaud.append(float(((h < 25) | (h > 160))[vive].mean()) if vive.any() else 0.0)
            contraste.append(float(gris.std()) / 255)
            b, g, r = [petit[..., i].astype(float) for i in range(3)]
            rg, yb = r - g, .5 * (r + g) - b
            couleur.append(float(np.sqrt(rg.std() ** 2 + yb.std() ** 2) + .3 * np.sqrt(rg.mean() ** 2 + yb.mean() ** 2)))
        if precedent is not None:
            d = float(cv2.absdiff(gris, precedent).mean()) / 255
            mouv.append(d)
            if d > .18:                                           # changement brusque de plan
                coupes += 1
        precedent = gris
        if t <= 1.5 and not visage:
            g2 = cv2.cvtColor(cv2.resize(im, (540, 960)), cv2.COLOR_BGR2GRAY)
            visage = len(det.detectMultiScale(g2, 1.1, 6, minSize=(60, 60))) > 0
    cap.release()
    moy = lambda l: round(sum(l) / len(l), 3) if l else None
    return {"duree_s": round(duree, 1), "luminosite": moy(lum), "saturation": moy(sat), "chaud": moy(chaud), "contraste": moy(contraste),
            "colorfulness": moy(couleur), "mouvement": moy(mouv), "coupes_10s": round(10 * coupes / duree, 2) if duree else None,
            "visage_debut": visage}


def sous_titres(ass):
    """Le délai avant le premier mot affiché et le titre à l'image, lus dans le fichier .ass du clip."""
    premier, titre = None, ""
    try:
        for l in open(ass, encoding="utf-8"):
            if not l.startswith("Dialogue:"):
                continue
            champs = l.split(",", 9)
            if champs[3] == "Mot" and premier is None:
                h, m, s = champs[1].split(":")
                premier = int(h) * 3600 + int(m) * 60 + float(s)
            elif champs[3] == "Titre" and not titre:
                titre = re.sub(r"\{[^}]*\}", "", champs[9]).strip()
    except OSError:
        pass
    return {"parole_debut_s": premier, "titre_mots": len(titre.split()) if titre else 0}


def variantes(chemin):
    f = os.path.join(os.path.dirname(chemin), "variantes.json")
    try:
        return json.load(open(f, encoding="utf-8")).get(os.path.basename(chemin), {})
    except (OSError, ValueError):
        return {}


if __name__ == "__main__":
    for chemin in sys.argv[1:]:
        try:
            r = {"chemin": chemin, **mesurer(chemin), **sous_titres(chemin[:-4] + ".ass"), "variantes": variantes(chemin)}
        except Exception as e:                                    # une vidéo illisible reste inconnue, jamais des zéros
            r = {"chemin": chemin, "erreur": str(e)[:200]}
        print(json.dumps(r, ensure_ascii=False), flush=True)
