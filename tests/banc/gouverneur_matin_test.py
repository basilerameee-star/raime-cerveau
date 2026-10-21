# Le gouverneur du matin (22/10/2026). Ce banc tient : 3 clips par plateforme active, toutes les publications déclarées,
# Hermes sous ses plafonds de jetons, rebonds sous 5 %, aucun nouvel agent en panne ; un jour sans envoi ni publication
# ne compte pas comme un échec. Fonctions pures. CI : python3 -m unittest tests/banc/gouverneur_matin_test.py
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools"))
import gouverneur_matin as M  # noqa: E402


class Juger(unittest.TestCase):
    def test_journee_du_20_10(self):
        f = {"publies": {"instagram": 4, "youtube": 4}, "publies_total": 8, "declares": 1, "jetons": 16_120_000,
             "jetons_ordres": 15_100_000, "envois": 18, "rebonds": 2}
        j = M.juger(f, ["instagram", "youtube"], ["A"], ["A"])
        tenus = {o: t for o, t, d in j}
        self.assertTrue(tenus["3 clips sur instagram"])
        self.assertFalse(tenus["clips déclarés à Content Rewards"])
        self.assertFalse(tenus["Hermes sous 3 M jetons"])
        self.assertFalse(tenus["rebonds d'e-mails sous 5 %"])
        self.assertTrue(tenus["aucun nouvel agent en panne"])
        self.assertIn("3 sur 7 tenus", M.ligne(j))

    def test_jour_calme_et_nouvelle_panne(self):
        j = M.juger({"publies": {}, "publies_total": 0, "declares": 0, "jetons": 0, "jetons_ordres": 0, "envois": 0, "rebonds": 0},
                    ["instagram"], ["A"], ["A", "B"])
        tenus = {o: (t, d) for o, t, d in j}
        self.assertFalse(tenus["3 clips sur instagram"][0], "aucun clip publié : l'objectif est manqué")
        self.assertTrue(tenus["clips déclarés à Content Rewards"][0], "rien à déclarer n'est pas un échec")
        self.assertTrue(tenus["rebonds d'e-mails sous 5 %"][0])
        self.assertEqual(tenus["aucun nouvel agent en panne"], (False, "B"))

    def test_tout_tenu(self):
        j = M.juger({"publies": {"instagram": 3}, "publies_total": 3, "declares": 3, "jetons": 1, "jetons_ordres": 1, "envois": 40, "rebonds": 1},
                    ["instagram"])
        self.assertEqual(M.ligne(j), "Objectifs d'hier : tous tenus (5)")


if __name__ == "__main__":
    unittest.main()
