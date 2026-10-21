"""Remonte au nouveau cadrage (21/10/2026) les clips déjà coupés en carré mais pas encore partis vers Buffer.

Basile (16/10/2026) : les clips étaient trop zoomés ; le cadrage est corrigé dans clippeur.py (cadre_sujet), mais la
réserve (14 jours de clips) avait été montée avant. Rien n'est redemandé à Gemini ni à Whisper : le passage vient de
clips.json, les mots de transcription.json, le titre de l'ancien fichier de sous-titres. Les sous-titres doivent sortir
mot pour mot comme avant, et la durée à 0,3 s près ; sinon le clip garde son ancien montage. L'ancien est rangé dans
<campagne>/avant-cadrage/.

Sur l'hôte :   python3 remonter.py            (les clips « a_faire » de clips_buffer, dans l'ordre où Buffer les prendra)
Conteneur :    python remonter.py --un <campagne> <clip-NN.mp4>   (lancé par l'hôte, un clip à la fois)
"""
import json, os, pathlib, re, subprocess, sys, time

MARQUE = ".cadrage-2026-10-21b"     # b : fond flou au lieu du noir, fin « FOLLOW FOR MORE »
CLIPS = "/opt/raime/harness/travail/clips"


def textes(ass, style):
    """Le texte affiché d'un style, sans les balises de couleur : ce qui doit rester identique."""
    out = []
    for l in pathlib.Path(ass).read_text(encoding="utf-8").splitlines():
        if l.startswith("Dialogue:") and l.split(",")[3] == style:
            out.append(re.sub(r"\{[^}]*\}", "", l.split(",", 9)[9]))
    return out


def duree(fichier):
    r = subprocess.run(["ffprobe", "-v", "0", "-show_entries", "format=duration", "-of", "csv=p=0", str(fichier)],
                       capture_output=True, text=True)
    return float(r.stdout.strip() or 0)


def un(campagne, nom):
    sys.path.insert(0, "/app")
    import clippeur as C
    dossier = C.SORTIE / campagne
    mp4, ass = dossier / nom, dossier / nom.replace(".mp4", ".ass")
    if (dossier / (nom + MARQUE)).exists():
        return print("déjà fait")
    p = pathlib.Path("/campagnes/%s.json" % campagne)
    profil = json.loads(p.read_text(encoding="utf-8")) if p.is_file() else {}
    fmt = profil.get("format", "bandes")
    if fmt != "bandes":
        return print("format %s : rien à changer" % fmt)
    info = json.loads((dossier / "clips.json").read_text(encoding="utf-8"))
    c = next((x for x in info["clips"] if x["clip"] == nom), None)
    if not c or not mp4.is_file() or not ass.is_file():
        sys.exit("ÉCART : %s absent de clips.json ou fichiers manquants" % nom)
    source = pathlib.Path(info["source"]) if str(info["source"]).startswith("/sortie/") else None
    if not (source and source.is_file()):
        videos = sorted([f for f in (dossier / "drive").rglob("*") if f.suffix.lower() in C.VIDEOS],
                        key=lambda f: f.stat().st_size, reverse=True) if (dossier / "drive").is_dir() else []
        source = videos[0] if videos else None                 # la règle de telecharger() : la plus grosse vidéo du Drive
    if not source:
        sys.exit("ÉCART : source introuvable")
    mots = json.loads((dossier / "transcription.json").read_text(encoding="utf-8"))
    debut, fin = float(c["debut"]), float(c["fin"])
    garde = C.sans_blancs(mots, debut, fin) if profil.get("sans_blancs", True) else [(debut, fin)]
    titre = (textes(ass, "Titre") or [""])[0]
    cadre = C.cadre_sujet(source, debut, fin, profil.get("cadrage", "visage"))
    neuf_ass, neuf_mp4 = dossier / (nom + ".neuf.ass"), dossier / (nom + ".neuf.mp4")
    if len(garde) > 1:
        mots_c, d = C.recaler(mots, garde)
        C.sous_titres(mots_c, 0, d, titre, neuf_ass, profil.get("sous_titres", True), fmt, cadre[1], profil.get("fin_abonnement", True))
    else:
        C.sous_titres(mots, debut, fin, titre, neuf_ass, profil.get("sous_titres", True), fmt, cadre[1], profil.get("fin_abonnement", True))
    if textes(neuf_ass, "Mot") != textes(ass, "Mot") or textes(neuf_ass, "Titre") != textes(ass, "Titre"):
        neuf_ass.unlink()
        sys.exit("ÉCART : les sous-titres ne sortent pas comme avant, ancien montage gardé")
    C.monter(source, debut, fin, neuf_ass, neuf_mp4, profil.get("cadrage", "visage"), garde, fmt, cadre)
    try:
        os.remove(str(neuf_mp4) + ".coupe.mp4")
    except OSError:
        pass
    if abs(duree(neuf_mp4) - duree(mp4)) > .3:
        neuf_mp4.unlink(); neuf_ass.unlink()
        sys.exit("ÉCART : durée %.1f s au lieu de %.1f s, ancien montage gardé" % (duree(neuf_mp4), duree(mp4)))
    (dossier / "avant-cadrage").mkdir(exist_ok=True)
    for vieux in (mp4, ass):                                   # l'original (le carré) est gardé une seule fois
        if (dossier / "avant-cadrage" / vieux.name).exists():
            vieux.unlink()
        else:
            os.replace(vieux, dossier / "avant-cadrage" / vieux.name)
    os.replace(neuf_mp4, mp4)                                  # même nom : Buffer prendra le nouveau au moment de programmer
    os.replace(neuf_ass, ass)
    (dossier / (nom + MARQUE)).write_text("visage 4:3" if abs(cadre[1] - 4 / 3) < .01 else "image entière")
    print("remonté : %s" % (dossier / (nom + MARQUE)).read_text())


def psql(requete):
    r = subprocess.run(["docker", "exec", "-i", "raime-postgres-1", "psql", "-U", "n8n", "-d", "raime_brain", "-At", "-c", requete],
                       capture_output=True, text=True)
    return [l.split("|") for l in r.stdout.splitlines() if l]


def hote():
    a_faire = psql("SELECT campagne, clip FROM clips_buffer WHERE etat = 'a_faire' GROUP BY campagne, clip ORDER BY min(id);")
    print(time.strftime("%Y-%m-%d %H:%M"), "%d clips à remonter" % len(a_faire), flush=True)
    for campagne, nom in a_faire:
        # encore aucune ligne programmée chez Buffer pour ce clip : sinon l'ancien est déjà parti, on n'y touche plus
        if psql("SELECT 1 FROM clips_buffer WHERE campagne = '%s' AND clip = '%s' AND etat <> 'a_faire' LIMIT 1;"
                % (campagne.replace("'", "''"), nom.replace("'", "''"))):
            print(campagne, nom, ": déjà programmé, laissé tel quel", flush=True)
            continue
        r = subprocess.run(["nice", "-n", "10", "docker", "run", "--rm", "--cpus", "2", "-v", "%s:/sortie" % CLIPS,
                            "-v", "/opt/raime/clippeur/campagnes:/campagnes:ro",
                            "-v", "/opt/raime/clippeur/clippeur.py:/app/clippeur.py:ro",
                            "-v", "/opt/raime/clippeur/remonter.py:/app/remonter.py:ro",
                            "--entrypoint", "python", "raime-clippeur", "/app/remonter.py", "--un", campagne, nom],
                           capture_output=True, text=True)
        fin = [l for l in r.stdout.splitlines() if l.strip()][-1:] or [(r.stderr.strip().splitlines() or ["?"])[-1]]
        print(time.strftime("%H:%M"), campagne, nom, ":", fin[0], flush=True)


if __name__ == "__main__":
    if sys.argv[1:2] == ["--un"]:
        un(sys.argv[2], sys.argv[3])
    else:
        hote()
