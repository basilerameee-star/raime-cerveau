# L'analyste des clips (21/10/2026). Ce banc tient : la niche lue dans le nom de la campagne, les liens Instagram et
# YouTube reconnus, un clip de moins de 48 h hors du bilan, les médianes par caractéristique, et la part des créneaux :
# 70 % suivent la donnée, 30 % restent à l'essai, une niche jugée sur moins de 3 clips ne garde que sa part d'essai.
# Fonctions pures : aucune base, aucun réseau. Lancé par la CI : python3 -m unittest tests/banc/analyste_clips_test.py
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "clippeur"))
import analyste as A  # noqa: E402


def clip(niche="streamer", vues=100, age_h=72, plateforme="instagram", regarde=.5, **k):
    return dict({"campagne": "c", "clip": "clip-01.mp4", "plateforme": plateforme, "age_h": age_h, "vues": vues, "regarde": regarde,
                 "niche": niche, "duree": "20 à 35 s", "cadrage": "ancien (carré)", "heure": "19 h", "titre": "long", "titre_texte": "t"}, **k)


class Lecture(unittest.TestCase):
    def test_niche_du_nom_de_campagne(self):
        self.assertEqual(A.niche("r3born-ep1-v2"), "streamer")
        self.assertEqual(A.niche("8-000-ishowspeed-x-expedia-clipping-campaign"), "streamer")
        self.assertEqual(A.niche("hardscope-love-and-justice-ep-2-x-clipfarm"), "tele-realite")
        self.assertEqual(A.niche("demi-lovato-podcast-clipping-campaign"), "podcast")
        self.assertEqual(A.niche("juvon-clips-3-cpm-expanding-budget"), "business")
        self.assertEqual(A.niche("inconnue"), "autre")

    def test_liens(self):
        self.assertEqual(A.code_ig("https://www.instagram.com/reel/DeweNJSgXSS/"), "DeweNJSgXSS")
        self.assertEqual(A.id_youtube("https://www.youtube.com/shorts/PvYAgHmAIho"), "PvYAgHmAIho")
        self.assertEqual(A.id_youtube("https://www.youtube.com/watch?v=e92XSaFuJ-Q"), "e92XSaFuJ-Q")


class Bilan(unittest.TestCase):
    def test_un_clip_trop_jeune_n_est_pas_juge(self):
        b = A.bilan([clip(vues=5000, age_h=10), clip(vues=100)])
        self.assertEqual(b["clips_murs"], 1)
        self.assertEqual(b["meilleurs"][0]["vues"], 100)

    def test_medianes_par_niche(self):
        b = A.bilan([clip("streamer", 1700), clip("streamer", 220), clip("streamer", 210), clip("podcast", 150), clip("podcast", 90), clip("podcast", 120)])
        n = {g["valeur"]: g for g in b["par_niche"]}
        self.assertEqual(n["streamer"]["vues_mediane"], 220)
        self.assertEqual(n["streamer"]["meilleur"], 1700)
        self.assertEqual(n["podcast"]["vues_mediane"], 120)
        self.assertEqual(b["par_niche"][0]["valeur"], "streamer", "le mieux classé d'abord")

    def test_repartition_70_30_jamais_enfermee(self):
        par = A.agreger([clip("streamer", 300)] * 3 + [clip("podcast", 100)] * 3 + [clip("business", 900)] * 2, "niche")
        r = A.repartition(par)
        self.assertAlmostEqual(sum(r.values()), 1, places=1)
        self.assertAlmostEqual(r["streamer"], .1 + .7 * 300 / 400, delta=.01)
        self.assertAlmostEqual(r["business"], .1, places=2, msg="2 clips seulement : sa part d'essai, rien de plus")
        self.assertGreater(r["podcast"], 0, "une niche moins bonne garde toujours de l'essai")

    def test_sans_donnee_tout_a_l_essai(self):
        r = A.repartition(A.agreger([clip("streamer", 300), clip("podcast", 100)], "niche"))
        self.assertEqual(r, {"streamer": .5, "podcast": .5})

    def test_classes_creatives(self):
        c = A.tranches_creatif({"luminosite": .15, "saturation": .65, "chaud": .94, "coupes_10s": 4.6, "mouvement": .01,
                                "visage_debut": True, "parole_debut_s": .04, "variantes": {"barre": True, "fin": False}})
        self.assertEqual((c["luminosite"], c["saturation"], c["couleurs"], c["rythme"], c["mouvement"]),
                         ("sombre", "vive", "chaudes", "coupes rapides", "calme"))
        self.assertEqual((c["visage_debut"], c["parole_debut"], c["essai_barre"], c["essai_fin"]),
                         ("visage dès 1,5 s", "parole immédiate", "avec barre", "sans fin (boucle)"))
        vide = A.tranches_creatif(None)
        self.assertEqual(vide["luminosite"], "inconnue")
        self.assertEqual(vide["essai_barre"], "pas d'essai")

    def test_un_clip_non_mesure_ne_compte_pas_dans_un_croisement_creatif(self):
        b = A.bilan([clip(vues=900, luminosite="claire")] * 3 + [clip(vues=100, luminosite="inconnue")] * 3)
        self.assertEqual([g["valeur"] for g in b["par_luminosite"]], ["claire"])

    def test_texte_lisible(self):
        t = A.texte(A.bilan([clip("streamer", 1700, regarde=.6)] * 3))
        self.assertIn("streamer", t)
        self.assertIn("regardé 60 %", t)


if __name__ == "__main__":
    unittest.main()
