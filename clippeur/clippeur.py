# -*- coding: utf-8 -*-
"""LE CLIPPEUR (02/10/2026) — d'une vidéo source d'une campagne Whop autorisée, des clips verticaux prêts à publier.

Voulu par Basile pour KinGKlip (TikTok, Instagram, YouTube) : la qualité d'un outil du marché, sans abonnement.
  1. télécharge la source (yt-dlp, meilleure qualité, 1440p minimum, jamais d’agrandissement) ;
  2. transcrit la voix au mot près (faster-whisper, sur le processeur du serveur) ;
  3. choisit les meilleurs passages (modèle gratuit Gemini, à partir de la transcription datée) ;
  4. monte en 1080 × 1920 : la vidéo nette au centre, un fond flou de la même image, l'accroche en haut les
     premières secondes, des sous-titres sobres (blanc, Inter, 3 mots au plus, le mot dit en plein blanc, aucun
     clignotement, aucune couleur criarde), calés sur la voix ;
  5. écrit à côté de chaque clip son texte de publication.

Tourne seul sur le serveur, sans Claude (0 jeton). Aucun envoi, aucune publication ici.
    python clippeur.py <url> --campagne <nom> [--nombre 4] [--min 20] [--max 50] [--consignes "..."]
"""
import argparse
import json
import os
import pathlib
import re
import subprocess
import sys
import urllib.request

SORTIE = pathlib.Path(os.environ.get("SORTIE", "/sortie"))
MODELES = ["gemini-flash-latest", "gemini-2.5-flash", "gemini-flash-lite-latest"]


def lancer(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError("%s : %s" % (cmd[0], r.stderr[-800:]))
    return r.stdout


def telecharger(url, dossier):
    # une source déjà téléchargée (depuis le PC de Basile : YouTube bloque les adresses de serveur) : on la prend telle quelle
    if pathlib.Path(url).is_file():
        return pathlib.Path(url)
    # 1080p au plus ; si la source est plus petite, on ne l'agrandit pas
    lancer(["yt-dlp", "-f", "bv*+ba/b", "-S", "res,br", "--merge-output-format", "mp4",
            "-o", str(dossier / "source.%(ext)s"), "--no-playlist", url])
    return next(dossier.glob("source.*"))


def transcrire(video):
    from faster_whisper import WhisperModel
    m = WhisperModel(os.environ.get("WHISPER", "small"), device="cpu", compute_type="int8")
    segs, info = m.transcribe(str(video), word_timestamps=True, vad_filter=True)
    mots = []
    for s in segs:
        for w in s.words or []:
            m = w.word.strip()
            if mots and (w.word.startswith("'") or m.startswith("'")) and not w.word.startswith(" "):
                mots[-1]["m"] += m; mots[-1]["f"] = round(w.end, 2)          # « y » + « 'all » = « y'all »
            elif mots and m.startswith("'") and mots[-1]["m"].lower() in ("y", "don", "can", "ain", "i", "you", "it", "that"):
                mots[-1]["m"] += m; mots[-1]["f"] = round(w.end, 2)
            else:
                mots.append({"d": round(w.start, 2), "f": round(w.end, 2), "m": m})
    return mots, info.language


def gemini(prompt, cle):
    corps = json.dumps({"contents": [{"parts": [{"text": prompt}]}],
                        "generationConfig": {"responseMimeType": "application/json", "temperature": 0.4}}).encode()
    derniere = None
    for modele in MODELES:
        try:
            req = urllib.request.Request("https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s" % (modele, cle),
                                         data=corps, headers={"Content-Type": "application/json"})
            d = json.load(urllib.request.urlopen(req, timeout=120))
            return json.loads(d["candidates"][0]["content"]["parts"][0]["text"])
        except Exception as e:                       # modèle saturé ou absent : le suivant
            derniere = e
    raise RuntimeError("Gemini indisponible : %s" % derniere)


def choisir(mots, langue, n, mini, maxi, consignes, cle):
    # la transcription par phrases datées (toutes les ~8 s), assez courte pour le modèle gratuit
    lignes, cour, t0 = [], [], None
    for w in mots:
        t0 = w["d"] if t0 is None else t0
        cour.append(w["m"])
        if w["f"] - t0 > 8 or w["m"].endswith((".", "?", "!")):
            lignes.append("[%.1f-%.1f] %s" % (t0, w["f"], " ".join(cour)))
            cour, t0 = [], None
    texte = "\n".join(lignes)[:60000]
    prompt = (
        "Tu es le meilleur monteur de clips courts viraux (TikTok, Reels, Shorts). Voici la transcription datée (secondes) "
        "d'une vidéo en langue « %s ».\n"
        "MÉTHODE (dans cet ordre) :\n"
        "1. Repère les MOMENTS FORTS, pas les scènes : une réplique qu'on cite ou qu'on envoie à un ami (aveu absurde, punchline, "
        "chiffre choc, clash, humiliation drôle, révélation, retournement, échec au dernier moment). Une visite, une arrivée, "
        "une explication de règles ou un décompte NE sont PAS des moments forts. Parcours la vidéo JUSQU'À LA FIN : les meilleurs "
        "moments sont souvent tardifs. Les plus forts : une révélation personnelle inattendue (passé, prison, argent), un chiffre "
        "choc sur la personne, un échec à la dernière seconde suivi de sa réaction, un surnom humiliant, une phrase absurde. "
        "Ne cherche pas à couvrir toute la vidéo.\n"
        "2. Construis chaque clip autour d'un moment : il démarre au plus près du moment, avec juste le contexte indispensable "
        "(jamais d'installation, jamais une phrase banale comme « all right », « let's go », un nombre, jamais une insulte raciale en 1re phrase) ; la PREMIÈRE phrase "
        "doit à elle seule donner envie de rester (question, tension, enjeu, phrase choc). Il finit juste après la chute ou la "
        "réaction (ou juste avant la résolution si les consignes de la campagne le demandent). Aucun remplissage : décomptes, "
        "répétitions, « let's go » en boucle sont coupés en choisissant mieux les bornes.\n"
        "3. Durée entre %d et %d secondes : prends le minimum qui tient, n'allonge jamais pour atteindre une durée.\n"
        "4. Note chaque clip SÉVÈREMENT de 1 à 10 : 9-10 = réplique qu'on partage et qu'on revoit ; 7-8 = moment drôle ou tendu "
        "qui tient seul ; 5-6 = scène agréable sans pic ; 1-4 = transition, visite, explication. La plupart des passages valent "
        "moins de 7.\n"
        "Rends les %d meilleurs (moins s'il n'y en a pas assez de bons), sans chevauchement, le brief de la campagne l'emportant "
        "toujours. %s\n"
        "Réponds en JSON : [{\"debut\": s, \"fin\": s, \"moment\": \"la réplique forte, citée\", \"premiere_phrase\": \"la 1re phrase du clip, citée\", "
        "\"pourquoi\": \"en 1 phrase, pourquoi on regarde jusqu'au bout\", \"note\": 1 à 10, "
        "\"accroche\": \"6 mots au plus, dans la langue de la vidéo : ce qui se passe, jamais une citation, jamais un juron\", "
        "\"titre\": \"titre de publication, 60 caractères au plus, fidèle à la scène\", "
        "\"question\": \"une question courte, dans la langue de la vidéo, sur ce moment précis, qui donne envie de commenter (jamais de juron, jamais trompeuse)\", "
        "\"hashtags\": [\"3 à 5\"]}]\n\n%s"
        % (langue, mini, maxi, n, ("Consignes de la campagne : " + consignes) if consignes else "", texte))
    # étape 1 (recherche du 02/10/2026) : lister d'abord TOUS les moments forts de la vidéo, sans contrainte de durée.
    # Gemini Flash en rate beaucoup quand il doit tout faire d'un coup ; la liste est ensuite imposée à l'étape 2.
    try:
        moments = gemini(
            "Voici la transcription datée (secondes) d'une vidéo en langue « %s ». Liste TOUS ses moments forts, du début à la "
            "FIN de la vidéo : répliques qu'on citerait ou qu'on enverrait à un ami (révélation personnelle inattendue, chiffre "
            "choc, échec à la dernière seconde, surnom humiliant, clash, aveu absurde, punchline, retournement). Pas les visites, "
            "arrivées, explications de règles ni décomptes. Note chacun sévèrement de 1 à 10. %s\n"
            "Réponds en JSON : [{\"t\": seconde de la réplique, \"citation\": \"la réplique\", \"note\": 1 à 10}]\n\n%s"
            % (langue, ("Consignes de la campagne : " + consignes) if consignes else "", texte), cle)
        moments = sorted([m for m in moments if isinstance(m, dict)], key=lambda m: -float(m.get("note") or 0))[:n + 6]
    except Exception:
        moments = []
    if moments:
        prompt += ("\n\nMOMENTS FORTS DÉJÀ REPÉRÉS : OBLIGATOIRE, fais UN clip autour de CHACUN de ces moments (si deux se chevauchent, garde le mieux noté), "
                   "des notes) :\n" + "\n".join("- %.0f s, note %s : %s" % (float(m.get("t") or 0), m.get("note"), m.get("citation", ""))
                                                   for m in moments))
    choix = gemini(prompt, cle)
    bons = []
    for c in choix if isinstance(choix, list) else []:
        d, f = float(c.get("debut", 0)), float(c.get("fin", 0))
        if mini - 3 <= f - d <= maxi + 5:
            bons.append(dict(c, debut=d, fin=f))
    # la qualité avant le volume (décision de Basile, 02/10/2026) : un clip sous 3 000 vues ne paie rien ; on ne garde que
    # les passages notés 7/10 ou plus, les meilleurs d'abord (s'il n'y en a aucun, les 3 meilleurs restent)
    def note(c):
        try:
            return float(c.get("note", 0))
        except (TypeError, ValueError):
            return 0.0
    bons.sort(key=note, reverse=True)
    forts = [c for c in bons if note(c) >= 7] or bons[:3]
    gardes = []                                            # jamais deux clips sur le même moment : le mieux noté reste
    for c in forts:
        if all(c["fin"] <= g["debut"] or c["debut"] >= g["fin"] for g in gardes):
            gardes.append(c)
    forts = gardes
    return sorted(forts[:n], key=lambda c: c["debut"])


CENSURE = ["nigga", "nigger", "niggas", "faggot", "retard", "fuck", "fucking", "shit", "bitch", "cunt", "motherfucker", "pussy", "cuck", "dick", "hoe", "whore"]


def censurer(texte, mots_en_plus=()):
    """Une injure ou un juron affiché à l'écran : la première lettre, puis des étoiles (le son reste celui de la vidéo)."""
    def un(m):
        mot = m.group(0)
        return mot[0] + "*" * (len(mot) - 1)
    for w in list(CENSURE) + list(mots_en_plus):
        texte = re.sub(r"(?i)\b%s\b" % re.escape(w), un, texte)
    return texte


def ass_temps(s):
    s = max(0, s)
    return "%d:%02d:%05.2f" % (s // 3600, (s % 3600) // 60, s % 60)


def sous_titres(mots, debut, fin, accroche, chemin, avec_mots=True):
    """Sous-titres ASS : groupes de 3 mots, le mot prononcé en plein blanc, les autres en blanc atténué ;
    l'accroche en haut pendant 2,5 s. Aucune animation clignotante."""
    tete = ("[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 2\n\n"
            "[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, "
            "Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n"
            "Style: Mot,Inter,100,&H00F5F5F5,&H00F5F5F5,&H00000000,&H64000000,1,0,0,0,100,100,0,0,1,6,3,2,70,70,600,1\n"
            "Style: Accroche,Inter,76,&H00111111,&H00111111,&H00FFFFFF,&H00FFFFFF,1,0,0,0,100,100,0,0,3,22,0,8,70,70,250,1\n\n"
            "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n")
    ev = []
    if accroche:
        pass  # bandeau de titre retiré le 02/10/2026 (jugé laid) ; l accroche reste dans les légendes
        # ev.append("Dialogue: 1,%s,%s,Accroche,,0,0,0,,%s" % (ass_temps(0), ass_temps(fin - debut), censurer(accroche.replace("\n", " ")).upper()))
    dans = [w for w in mots if w["d"] >= debut - .05 and w["f"] <= fin + .05 and w["m"]] if avec_mots else []
    # des groupes de 3 mots au plus, qui ne traversent jamais une fin de phrase
    groupes, g = [], []
    for w in dans:
        g.append(w)
        if len(g) == 3 or w["m"].endswith((".", "?", "!", ",")):
            groupes.append(g); g = []
    if g:
        groupes.append(g)
    for i, g in enumerate(groupes):
        # le groupe reste affiché jusqu'au suivant (sans trou ni clignotement), au plus 1,2 s après le dernier mot
        suite = groupes[i + 1][0]["d"] if i + 1 < len(groupes) else g[-1]["f"] + .4
        fin_g = min(suite, g[-1]["f"] + 1.2)
        for j, w in enumerate(g):
            d = w["d"] - debut
            f = (g[j + 1]["d"] if j + 1 < len(g) else fin_g) - debut
            txt = " ".join(("{\\c&H0000E6FF&}" if k == j else "{\\c&H00FFFFFF&}") + censurer(x["m"]) for k, x in enumerate(g))
            ev.append("Dialogue: 0,%s,%s,Mot,,0,0,0,,%s" % (ass_temps(d), ass_temps(max(f, d + .08)), txt))
    chemin.write_text(tete + "\n".join(ev) + "\n", encoding="utf-8")


def centre_visage(source, debut, fin):
    """Le centre horizontal (0 à 1) du visage qui parle, médiane sur une dizaine d'images du passage ; None sans visage."""
    import cv2
    cap = cv2.VideoCapture(str(source))
    det = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    xs = []
    for k in range(12):
        cap.set(cv2.CAP_PROP_POS_MSEC, (debut + (fin - debut) * (k + .5) / 12) * 1000)
        ok, im = cap.read()
        if not ok:
            continue
        g = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
        f = det.detectMultiScale(g, 1.1, 6, minSize=(int(g.shape[0] * .08),) * 2)
        if len(f):
            x, y, w, h = max(f, key=lambda r: r[2] * r[3])                # le plus grand visage : celui qui parle
            xs.append((x + w / 2) / g.shape[1])
    cap.release()
    if len(xs) < 4:
        return None
    xs.sort()
    return xs[len(xs) // 2]


def sans_blancs(mots, debut, fin, seuil=.45, marge=.12):
    """Les intervalles à garder : la parole, avec une petite marge ; les blancs plus longs que le seuil sont retirés."""
    dans = [w for w in mots if w["d"] >= debut - .05 and w["f"] <= fin + .05]
    if not dans:
        return [(debut, fin)]
    garde = [[max(debut, dans[0]["d"] - marge), min(fin, dans[0]["f"] + marge)]]
    for w in dans[1:]:
        a, b = max(debut, w["d"] - marge), min(fin, w["f"] + marge)
        if a - garde[-1][1] <= seuil:
            garde[-1][1] = max(garde[-1][1], b)
        else:
            garde.append([a, b])
    return [(round(a, 2), round(b, 2)) for a, b in garde if b - a > .15]


def recaler(mots, garde):
    """Les mots sur la nouvelle ligne du temps, une fois les blancs retirés (pour les sous-titres)."""
    out, t0 = [], 0.0
    for a, b in garde:
        for w in mots:
            if w["d"] >= a - .01 and w["f"] <= b + .01:
                out.append({"d": round(t0 + w["d"] - a, 2), "f": round(t0 + w["f"] - a, 2), "m": w["m"]})
        t0 += b - a
    return out, t0


def monter(source, debut, fin, ass, sortie, cadrage="visage", garde=None):
    if garde and len(garde) > 1:
        sel = "+".join("between(t,%.2f,%.2f)" % (a, b) for a, b in garde)
        coupe = "[0:v]select='%s',setpts=N/FRAME_RATE/TB[vc];[0:a]aselect='%s',asetpts=N/SR/TB[ac]" % (sel, sel)
        tmp = str(sortie) + ".coupe.mp4"
        lancer(["ffmpeg", "-y", "-i", str(source), "-filter_complex", coupe, "-map", "[vc]", "-map", "[ac]",
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "14", "-c:a", "aac", "-b:a", "192k", tmp])
        source, debut, fin = tmp, 0.0, sum(b - a for a, b in garde)
    cx = centre_visage(source, debut, fin) if cadrage == "visage" else None
    if cx is None and cadrage == "centre":
        cx = .5                                          # plein écran au centre : les sous-titres incrustés de la source restent lisibles
    if cx is not None:
        # recadrage plein écran sur le visage : une fenêtre 9:16 dans la hauteur de la source, centrée sur lui
        filtre = ("[0:v]crop='min(iw,ih*9/16)':ih:'max(0,min(iw-ih*9/16,%.4f*iw-ih*9/32))':0,scale='if(gt(ih,1920),1080,trunc(ih*9/32)*2)':'if(gt(ih,1920),1920,ih)':flags=lanczos,unsharp=3:3:0.4:3:3:0.0,"
                  "subtitles=%s:fontsdir=/usr/share/fonts[v]" % (cx, str(ass).replace(":", "\\:")))
        lancer(["ffmpeg", "-y", "-ss", "%.2f" % debut, "-to", "%.2f" % fin, "-i", str(source), "-filter_complex", filtre,
                "-map", "[v]", "-map", "0:a?", "-r", "30", "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", str(sortie)])
        return

    # fond : la même image, couvrante, floutée et assombrie ; devant : l'image nette, en largeur, jamais agrandie au-delà de 1080
    filtre = ("[0:v]split[a][b];[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=24:2,"
              "eq=brightness=-0.12[fond];[b]scale='min(1080,iw)':-2[net];[fond][net]overlay=(W-w)/2:(H-h)/2-80,"
              "subtitles=%s:fontsdir=/usr/share/fonts[v]" % str(ass).replace(":", "\\:"))
    lancer(["ffmpeg", "-y", "-ss", "%.2f" % debut, "-to", "%.2f" % fin, "-i", str(source), "-filter_complex", filtre,
            "-map", "[v]", "-map", "0:a?", "-r", "30", "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", str(sortie)])


def main():
    a = argparse.ArgumentParser()
    a.add_argument("url"); a.add_argument("--campagne", required=True)
    a.add_argument("--nombre", type=int, default=4); a.add_argument("--min", type=int, default=20); a.add_argument("--max", type=int, default=50)
    a.add_argument("--consignes", default="")
    a.add_argument("--profil", default="", help="profil de campagne (JSON) : tags, hashtags, interdits, consignes, durées")
    o = a.parse_args()
    profil = json.load(open(o.profil, encoding="utf-8")) if o.profil and os.path.isfile(o.profil) else {}
    if profil:
        o.min, o.max = profil.get("min", o.min), profil.get("max", o.max)
        o.consignes = (profil.get("consignes", "") + " " + o.consignes).strip()
    interdits = [m.lower() for m in profil.get("interdits", [])]
    cle = os.environ.get("GEMINI_API_KEY")
    if not cle:
        sys.exit("GEMINI_API_KEY absente")
    nom = re.sub(r"[^a-z0-9-]+", "-", o.campagne.lower()).strip("-")
    dossier = SORTIE / nom; dossier.mkdir(parents=True, exist_ok=True)
    source = telecharger(o.url, dossier)
    h = subprocess.run(["ffprobe", "-v", "0", "-select_streams", "v:0", "-show_entries", "stream=height", "-of", "csv=p=0", str(source)],
                       capture_output=True, text=True).stdout.strip()
    if h.isdigit() and int(h) < 1440:                     # 1440p minimum (règle de Basile, 02/10/2026) : jamais d'image grossie
        sys.exit("Source en %sp : 1440p minimum exigé" % h)
    tr = dossier / "transcription.json"
    if tr.is_file() and (dossier / "langue.txt").is_file():          # même source déjà transcrite : on la reprend
        mots, langue = json.loads(tr.read_text(encoding="utf-8")), (dossier / "langue.txt").read_text().strip()
    else:
        mots, langue = transcrire(source)
        tr.write_text(json.dumps(mots, ensure_ascii=False), encoding="utf-8")
        (dossier / "langue.txt").write_text(langue)
    choix = choisir(mots, langue, o.nombre + (4 if interdits else 0), o.min, o.max, o.consignes, cle)
    if interdits:
        # un mot interdit prononcé s'afficherait dans les sous-titres : le passage est écarté
        def propre(c):
            dit = " ".join(w["m"] for w in mots if c["debut"] - .05 <= w["d"] and w["f"] <= c["fin"] + .05).lower()
            ecrit = (c.get("titre", "") + " " + c.get("accroche", "") + " " + " ".join(c.get("hashtags", []))).lower()
            return not any(m in dit or m in ecrit for m in interdits)
        ecartes = [c for c in choix if not propre(c)]
        choix = [c for c in choix if propre(c)][:o.nombre]
        for c in ecartes:
            print("écarté (mot interdit) : %.0f-%.0f s" % (c["debut"], c["fin"]), flush=True)
    rendus = []
    for k, c in enumerate(choix, 1):
        ass = dossier / ("clip-%02d.ass" % k); mp4 = dossier / ("clip-%02d.mp4" % k)
        fins = [w for w in mots if c["fin"] - .3 <= w["f"] <= c["fin"] + 5 and w["m"][-1:] in ".?!"]
        if fins:
            c["fin"] = round(fins[0]["f"] + .15, 2)
        else:
            suite = [w for w in mots if w["f"] >= c["fin"] - .05]
            if suite:
                c["fin"] = round(suite[0]["f"] + .1, 2)
        garde = sans_blancs(mots, c["debut"], c["fin"]) if profil.get("sans_blancs", True) else [(c["debut"], c["fin"])]
        if len(garde) > 1:
            mots_c, duree = recaler(mots, garde)
            sous_titres(mots_c, 0, duree, c.get("accroche", ""), ass, profil.get("sous_titres", True))
        else:
            sous_titres(mots, c["debut"], c["fin"], c.get("accroche", ""), ass, profil.get("sous_titres", True))
        monter(source, c["debut"], c["fin"], ass, mp4, profil.get("cadrage", "visage"), garde)
        try:
            os.remove(str(mp4) + ".coupe.mp4")
        except OSError:
            pass
        for faux, juste in profil.get("orthographe", {}).items():
            c["titre"] = re.sub(r"(?i)\b%s\b" % re.escape(faux), juste, c.get("titre", ""))
            c["accroche"] = re.sub(r"(?i)\b%s\b" % re.escape(faux), juste, c.get("accroche", ""))
        if censurer(c.get("accroche", "")) != c.get("accroche", ""):      # un juron dans l'accroche : on prend le titre, sinon on le masque
            c["accroche"] = c.get("titre", "") if censurer(c.get("titre", "")) == c.get("titre", "") else c.get("accroche", "")
        c["titre"], c["accroche"] = censurer(c.get("titre", "")), censurer(c.get("accroche", ""))
        tags_h = list(dict.fromkeys(["#" + h.lstrip("#") for h in profil.get("hashtags", [])] + ["#" + h.lstrip("#") for h in c.get("hashtags", [])]))
        legende = "%s\n\n%s" % (c.get("titre", ""), " ".join(tags_h))
        (dossier / ("clip-%02d.txt" % k)).write_text(legende, encoding="utf-8")
        if profil.get("tags"):
            # une légende par plateforme, avec le tag obligatoire de la campagne
            q = censurer(c.get("question", "")).strip()       # la légende finit par une question (commentaires)
            par = {pl: "%s %s\n\n%s%s" % (c.get("titre", ""), tg, (q + "\n\n") if q else "", " ".join(tags_h)) for pl, tg in profil["tags"].items()}
            (dossier / ("clip-%02d.json" % k)).write_text(json.dumps(par, ensure_ascii=False, indent=1), encoding="utf-8")
        # la note prédite est gardée : l'agent Analytics la comparera aux vues réelles pour calibrer la notation
        rendus.append(dict(clip=mp4.name, debut=c["debut"], fin=c["fin"], titre=c.get("titre", ""), accroche=c.get("accroche", ""),
                           note=c.get("note")))
        print("clip %d : %.0f-%.0f s · %s" % (k, c["debut"], c["fin"], c.get("titre", "")), flush=True)
    (dossier / "clips.json").write_text(json.dumps(dict(source=o.url, langue=langue, clips=rendus), ensure_ascii=False, indent=1), encoding="utf-8")
    print("FINI : %d clips dans %s" % (len(rendus), dossier))


if __name__ == "__main__":
    main()
