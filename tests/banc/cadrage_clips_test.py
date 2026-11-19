# Le cadrage des clips (21/10/2026). Basile (16/10) : les clips étaient trop zoomés, la carte ou le jeu ne se voyait pas
# en entier (le format « bandes » coupait un carré dans le 16:9). Ce banc tient : un visage seul et stable = fenêtre 4:3
# centrée sur lui ; aucun visage, deux visages ou un visage qui se déplace = l'image entière ; une source verticale ne
# déborde pas ; le titre est au-dessus de l'image et les mots en dessous ; le montage garde toute la largeur demandée ;
# la remontée de la réserve compare les sous-titres sans les balises de couleur. Aucune vidéo, aucun ffmpeg.
# Lancé par la CI : python3 -m unittest tests/banc/cadrage_clips_test.py
import re
import sys
import tempfile
import unittest
from pathlib import Path

DEPOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(DEPOT / "clippeur"))
import clippeur as C  # noqa: E402
import remonter  # noqa: E402

LARGE, HAUT = 1920, 1080


def vu(*boites, fois=12):
    """La réponse de visages() : la même image vue `fois` fois (boîtes x, y, largeur, hauteur)."""
    return lambda source, debut, fin: (LARGE, HAUT, [list(boites) for _ in range(fois)])


class Cadre(unittest.TestCase):
    def tearDown(self):
        C.visages = VRAI

    def test_sans_visage_l_image_entiere(self):
        C.visages = vu()
        self.assertEqual(C.cadre_sujet("s", 0, 10), (.5, 16 / 9))

    def test_un_visage_seul_une_fenetre_4_3_centree_sur_lui(self):
        C.visages = vu((1100, 300, 200, 200))
        cx, rapport = C.cadre_sujet("s", 0, 10)
        self.assertAlmostEqual(rapport, 4 / 3)
        self.assertAlmostEqual(cx, 1200 / LARGE)

    def test_deux_personnes_l_image_entiere(self):
        # le procès : la témoin à gauche, l'avocat à droite, de taille voisine
        C.visages = vu((300, 300, 200, 200), (1300, 320, 180, 180))
        self.assertEqual(C.cadre_sujet("s", 0, 10)[1], 16 / 9)

    def test_un_petit_visage_au_fond_ne_compte_pas(self):
        C.visages = vu((900, 300, 260, 260), (1600, 200, 100, 100))
        self.assertAlmostEqual(C.cadre_sujet("s", 0, 10)[1], 4 / 3)

    def test_un_visage_qui_traverse_l_image(self):
        C.visages = lambda s, d, f: (LARGE, HAUT, [[(100 + 140 * k, 300, 200, 200)] for k in range(12)])
        self.assertEqual(C.cadre_sujet("s", 0, 10)[1], 16 / 9)

    def test_visage_vu_trop_rarement(self):
        C.visages = lambda s, d, f: (LARGE, HAUT, [[(900, 300, 200, 200)]] * 3 + [[]] * 9)
        self.assertEqual(C.cadre_sujet("s", 0, 10)[1], 16 / 9)

    def test_cadrage_centre_l_image_entiere(self):
        C.visages = vu((1100, 300, 200, 200))
        self.assertEqual(C.cadre_sujet("s", 0, 10, "centre"), (.5, 16 / 9))

    def test_source_verticale(self):
        C.visages = lambda s, d, f: (1080, 1920, [[] for _ in range(12)])
        self.assertAlmostEqual(C.cadre_sujet("s", 0, 10)[1], 1080 / 1920)


class Disposition(unittest.TestCase):
    def test_tailles(self):
        self.assertEqual(C.disposition(16 / 9), (1080, 608, 636))
        self.assertEqual(C.disposition(4 / 3), (1080, 810, 535))
        l, h, haut = C.disposition(9 / 16)                     # verticale : jamais plus de 1 300 px de haut
        self.assertEqual(h, 1300)
        self.assertLessEqual(l, 1080)

    def test_titre_au_dessus_et_mots_en_dessous(self):
        for rapport in (16 / 9, 4 / 3):
            l, h, haut = C.disposition(rapport)
            with tempfile.TemporaryDirectory() as d:
                ass = Path(d) / "c.ass"
                mots = [{"d": 0.0, "f": .4, "m": "Bonjour"}, {"d": .5, "f": .9, "m": "tout"}, {"d": 1.0, "f": 1.4, "m": "le monde."}]
                C.sous_titres(mots, 0, 2, "Le titre", ass, True, "bandes", rapport)
                styles = {l.split(",")[0][7:]: int(l.split(",")[21]) for l in ass.read_text(encoding="utf-8").splitlines()
                          if l.startswith("Style:")}
            self.assertLess(1920 - styles["Titre"], haut)       # la ligne du titre finit au-dessus de l'image
            self.assertGreater(1920 - styles["Mot"] - 92, haut + h)   # les mots commencent sous l'image


class Montage(unittest.TestCase):
    def test_bandes_garde_toute_la_largeur_demandee(self):
        vus = []
        C.lancer, avant = vus.append, C.lancer
        try:
            C.monter("s.mp4", 0, 10, Path("c.ass"), Path("c.mp4"), "visage", None, "bandes", (.5, 16 / 9))
        finally:
            C.lancer = avant
        filtre = vus[0][vus[0].index("-filter_complex") + 1]
        self.assertIn("crop='min(iw,trunc(ih*1.7778/2)*2)'", filtre)
        self.assertIn("scale=1080:608", filtre)
        self.assertIn("overlay=0:636", filtre)
        self.assertNotIn("crop=ih:ih", filtre)                 # l'ancien carré
        self.assertNotIn("black", filtre)                      # plus de noir (21/10) : le fond est la même image, floutée
        self.assertIn("boxblur", filtre)

    def test_fin_follow_for_more_sur_les_2_dernieres_secondes(self):
        with tempfile.TemporaryDirectory() as d:
            ass = Path(d) / "c.ass"
            C.sous_titres([], 0, 20, "Le titre", ass, True, "bandes", 16 / 9)
            lignes = [l for l in ass.read_text(encoding="utf-8").splitlines() if l.startswith("Dialogue:")]
            C.sous_titres([], 0, 20, "Le titre", ass, True, "bandes", 16 / 9, abonnement=False)
            sans = [l for l in ass.read_text(encoding="utf-8").splitlines() if l.startswith("Dialogue:")]
        titre = next(l for l in lignes if ",Titre," in l)
        fin = next(l for l in lignes if ",Fin," in l)
        self.assertIn("0:00:18.00", titre)                     # le titre s'efface 2 s avant la fin
        self.assertIn("0:00:18.00,0:00:20.00", fin)
        self.assertIn("FOLLOW FOR MORE", fin)
        self.assertFalse(any(",Fin," in l for l in sans))


def faux_png(chemin, largeur, hauteur):
    """Juste l'en-tête d'un PNG (signature + IHDR) : assez pour lire sa taille, sans image ni bibliothèque."""
    import struct
    Path(chemin).write_bytes(b"\x89PNG\r\n\x1a\n" + b"\x00\x00\x00\rIHDR" + struct.pack(">II", largeur, hauteur) + b"\x08\x06\x00\x00\x00")


class Incrustation(unittest.TestCase):
    """19/11/2026, KreekCraft GTA 6 : « The official KreekCraft logo overlay must remain clearly visible throughout the
    entire clip. Clips without it will be rejected. » et « Watch KreekCraft on YouTube and Twitch » dans la légende."""

    def montages(self, *appels):
        vus = []
        C.lancer, avant = vus.append, C.lancer
        try:
            for args, kw in appels:
                C.monter("s.mp4", 0, 10, Path("c.ass"), Path("c.mp4"), *args, **kw)
        finally:
            C.lancer = avant
        return vus

    def test_sans_logo_la_commande_ne_change_pas(self):
        sans, = self.montages((("visage", None, "bandes", (.5, 16 / 9)), {}))
        self.assertEqual(sans.count("-i"), 1)
        self.assertTrue(sans[sans.index("-filter_complex") + 1].endswith("[v]"))
        self.assertNotIn("[lg]", " ".join(sans))

    def test_le_logo_reste_tout_le_clip_au_dessus_du_titre(self):
        with tempfile.TemporaryDirectory() as d:
            logo = str(Path(d) / "logo.png")
            faux_png(logo, 1600, 533)                          # la vraie taille du logo de KreekCraft
            bandes, vertical, plein = self.montages(
                (("visage", None, "bandes", (.5, 16 / 9)), {"logo": (logo, 520)}),
                (("visage", None, "bandes", (.5, 9 / 16)), {"logo": (logo, 520)}),
                (("centre", None, "plein", None), {"logo": (logo, 520)}))
        for cmd in (bandes, vertical, plein):
            self.assertEqual(cmd.count("-i"), 2)
            self.assertEqual(cmd[cmd.index("-i", cmd.index("-i") + 1) + 1], logo)     # 2e entrée : l'image du logo
            self.assertLess(cmd.index("-ss"), cmd.index("-i"))  # la coupe ne vise que la vidéo
            graphe = cmd[cmd.index("-filter_complex") + 1]
            self.assertIn("[1:v]scale=520:174,format=rgba[lg]", graphe)
            self.assertTrue(graphe.endswith("[v]"))
            self.assertEqual(cmd[cmd.index("-map") + 1], "[v]")
            self.assertNotIn("eof_action", graphe)             # overlay répète l'image jusqu'à la fin du clip
        # 16:9 : image de 636 à 1244 ; le logo (174 px) finit 200 px au-dessus, à la place d'un titre de deux lignes
        self.assertIn("[v0][lg]overlay=280:262[v]", bandes[bandes.index("-filter_complex") + 1])
        # source verticale : pas la place au-dessus (le haut de l'image est à 290 px) : en haut de l'image
        self.assertIn("[v0][lg]overlay=280:310[v]", vertical[vertical.index("-filter_complex") + 1])
        self.assertIn("[v0][lg]overlay=280:170[v]", plein[plein.index("-filter_complex") + 1])
        # jamais sous la barre du haut des plateformes, jamais sur le titre d'une source 16:9 ou 4:3
        for rapport in (16 / 9, 4 / 3):
            _, _, haut = C.disposition(rapport)
            with tempfile.TemporaryDirectory() as d:
                logo = str(Path(d) / "logo.png")
                faux_png(logo, 1600, 533)
                _, _, h, _, y = C.place_logo((logo, 520), haut)
            self.assertGreaterEqual(y, 150)
            self.assertLessEqual(y + h, haut - 190)

    def test_logo_exige_mais_absent_arrete_la_decoupe(self):
        self.assertIsNone(C.incrustation({}))
        with self.assertRaises(SystemExit):
            C.incrustation({"incrustation": "/nulle/part/logo.png"})
        with tempfile.TemporaryDirectory() as d:
            logo = str(Path(d) / "logo.png")
            faux_png(logo, 1600, 533)
            self.assertEqual(C.incrustation({"incrustation": logo}), (logo, 520))
            self.assertEqual(C.incrustation({"incrustation": {"image": logo, "largeur": 5000}}), (logo, 1000))

    def test_la_phrase_exigee_dans_chaque_legende(self):
        tags = {"instagram": "KreekCraft", "youtube": "@Kreek"}
        h = ["#GTA6", "#KreekCraft", "#GrandTheftAutoVI", "#gaming"]
        texte, par = C.legendes_clip("Bank heist fail", "Would you run?", tags, h, "Watch KreekCraft on YouTube and Twitch")
        self.assertEqual(texte, "Bank heist fail\n\nWatch KreekCraft on YouTube and Twitch\n\n#GTA6 #KreekCraft #GrandTheftAutoVI #gaming")
        self.assertEqual(par["youtube"], "Bank heist fail @Kreek\n\nWatch KreekCraft on YouTube and Twitch\n\nWould you run?\n\n"
                                         "#GTA6 #KreekCraft #GrandTheftAutoVI")
        self.assertIn("Watch KreekCraft on YouTube and Twitch", par["instagram"])
        # sans phrase exigée : exactement les légendes d'avant le 19/11
        texte, par = C.legendes_clip("Titre", "Question ?", {"instagram": "@x"}, ["#a", "#b"])
        self.assertEqual(texte, "Titre\n\n#a #b")
        self.assertEqual(par, {"instagram": "Titre @x\n\nQuestion ?\n\n#a #b"})
        self.assertEqual(C.legendes_clip("T", "", None, ["#a"]), ("T\n\n#a", {}))


class Titres(unittest.TestCase):
    def test_titre_court_et_percutant(self):
        # Basile (21/10/2026) : « 15k/month at 22 » plutôt que « How a 22-year-old makes 15k a month »
        self.assertFalse(C.trop_long("15k/month at 22"))
        self.assertFalse(C.trop_long("$2M in 8 months"))
        self.assertTrue(C.trop_long("How a 22-year-old makes 15k a month"))
        self.assertTrue(C.trop_long("The most shocking accusation dropped during a group hug"))
        court = json_court()
        self.assertFalse([t for t in court.values() if C.trop_long(t)])   # les titres posés sur la réserve tiennent la règle


def json_court():
    import json
    f = DEPOT / "clippeur" / "titres-courts.json"
    return json.loads(f.read_text(encoding="utf-8")) if f.is_file() else {}


class Essais(unittest.TestCase):
    def test_variantes_tirees_a_parts_egales_et_stables(self):
        v = [C.variante("camp", "clip-%02d.mp4" % i) for i in range(400)]
        for cle in ("barre", "fin"):
            part = sum(x[cle] for x in v) / len(v)
            self.assertTrue(.4 < part < .6, (cle, part))
        self.assertEqual(C.variante("camp", "clip-07.mp4"), C.variante("camp", "clip-07.mp4"), "toujours la même variante")
        self.assertEqual(C.variante("camp", "clip-07.mp4", essais=False), {"barre": False, "fin": True}, "essais coupés : le style validé")

    def test_barre_de_progression(self):
        vus = []
        C.lancer, avant = vus.append, C.lancer
        try:
            C.monter("s.mp4", 0, 20, Path("c.ass"), Path("c.mp4"), "visage", None, "bandes", (.5, 16 / 9), barre=True)
            C.monter("s.mp4", 0, 20, Path("c.ass"), Path("c.mp4"), "visage", None, "bandes", (.5, 16 / 9), barre=False)
        finally:
            C.lancer = avant
        avec, sans = [x[x.index("-filter_complex") + 1] for x in vus]
        self.assertIn("overlay=x='-w+w*t/20.00':y=main_h-10:eval=frame", avec)
        self.assertNotIn("0xFFE600", sans)


class Remontee(unittest.TestCase):
    def test_compare_le_texte_sans_les_couleurs(self):
        with tempfile.TemporaryDirectory() as d:
            ass = Path(d) / "c.ass"
            ass.write_text("Dialogue: 0,0:00:00.00,0:00:01.00,Mot,,0,0,0,,{\\c&H0000E6FF&}Bonjour {\\c&H00FFFFFF&}tout\n"
                           "Dialogue: 1,0:00:00.00,0:00:05.00,Titre,,0,0,0,,Un titre, avec virgule\n", encoding="utf-8")
            self.assertEqual(remonter.textes(ass, "Mot"), ["Bonjour tout"])
            self.assertEqual(remonter.textes(ass, "Titre"), ["Un titre, avec virgule"])


VRAI = C.visages

if __name__ == "__main__":
    unittest.main()


class ChoixVide(unittest.TestCase):
    # 22/10/2026 : Jay Guapo (Kick, 66 min) a donné 0 clip : Gemini avait rendu une liste vide ; rejouée, 7 moments notés 8-9
    def test_une_reponse_vide_est_redemandee_une_fois(self):
        mots = [{"d": float(i), "f": i + .9, "m": "word."} for i in range(200)]
        reponses = [Exception("saturé"), [], [{"debut": 10, "fin": 45, "note": 8}]]

        def faux(prompt, cle):
            r = reponses.pop(0)
            if isinstance(r, Exception):
                raise r
            return r
        vrai, C.gemini = C.gemini, faux
        try:
            self.assertEqual([(c["debut"], c["fin"]) for c in C.choisir(mots, "en", 5, 30, 60, "", "cle")], [(10.0, 45.0)])
        finally:
            C.gemini = vrai


class GeminiSature(unittest.TestCase):
    # 22/10/2026 : Jay Guapo en échec sur « HTTP Error 503 » des trois modèles ; une saturation passe en quelques minutes
    def test_trois_tours_avant_d_abandonner(self):
        import io
        import json as js
        appels = []

        def ouvrir(req, timeout=0):
            appels.append(req.full_url)
            if len(appels) <= len(C.MODELES):
                raise OSError("HTTP Error 503: Service Unavailable")
            return io.StringIO(js.dumps({"candidates": [{"content": {"parts": [{"text": "[1]"}]}}]}))
        vrai, attente = C.urllib.request.urlopen, C.ATTENTE_GEMINI
        C.urllib.request.urlopen, C.ATTENTE_GEMINI = ouvrir, 0
        try:
            self.assertEqual(C.gemini("p", "cle"), [1])
            self.assertEqual(len(appels), len(C.MODELES) + 1)
        finally:
            C.urllib.request.urlopen, C.ATTENTE_GEMINI = vrai, attente


class MomentsCourts(unittest.TestCase):
    # 22/10/2026 : Jay Guapo, 14 moments notés 7-9 mais de 8 à 20 s pour une campagne de 30 à 60 s : tous jetés, 0 clip
    def test_un_moment_trop_court_est_elargi_autour_de_lui(self):
        mots = [{"d": float(i), "f": i + .9, "m": "word."} for i in range(300)]
        vrai = C.gemini
        C.gemini = lambda prompt, cle: [{"debut": 100, "fin": 112, "note": 9}, {"debut": 2, "fin": 6, "note": 8},
                                        {"debut": 280, "fin": 295, "note": 8}]
        try:
            r = C.choisir(mots, "en", 5, 30, 60, "", "cle")
        finally:
            C.gemini = vrai
        self.assertEqual(len(r), 3)
        for c in r:
            self.assertGreaterEqual(c["fin"] - c["debut"], 30)
            self.assertGreaterEqual(c["debut"], 0)
            self.assertLessEqual(c["fin"], 299.9)
        milieu = next(c for c in r if c["debut"] < 112 < c["fin"])
        self.assertLessEqual(milieu["debut"], 100)
        self.assertGreaterEqual(milieu["fin"], 112)
