# L'analyste général, module prospection (21/10/2026). Ce banc tient : l'entonnoir des pré-audits par métier (envoyés,
# rebonds, réponses, appels notés, intéressés), celui des maquettes, le bilan des appels, et la règle « jugé à partir de
# 10 envois ». Fonctions pures : aucune base. Lancé par la CI : python3 -m unittest tests/banc/analyste_prospection_test.py
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools"))
import analyste_prospection as P  # noqa: E402


class Entonnoir(unittest.TestCase):
    def test_preaudits_par_metier(self):
        l = [{"segment": "Notaires", "siren": str(i), "envoye": 1, "livre": i % 2, "rebond": 1 - i % 2, "reponse": int(i == 3)} for i in range(10)]
        l += [{"segment": "Architectes", "siren": "a", "envoye": 1, "livre": 1, "rebond": 0, "reponse": 0}]
        g = {x["metier"]: x for x in P.entonnoir_preaudits(l, {"3": "interesse", "4": "pas_interesse"})}
        n = g["Notaires"]
        self.assertEqual((n["envoyes"], n["rebonds"], n["reponses"], n["appeles"], n["interesses"]), (10, 5, 1, 2, 1))
        self.assertEqual(n["taux_rebond"], .5)
        self.assertTrue(n["juge"])
        self.assertFalse(g["Architectes"]["juge"], "un seul envoi ne juge rien")

    def test_maquettes_et_appels(self):
        v = P.entonnoir_vitrines([{"metier": "boucherie", "statut": "pas_interesse", "envoye": 1}, {"metier": "boucherie", "statut": "envoye", "envoye": 1},
                                  {"metier": "boucherie", "statut": "client", "envoye": 1}])
        self.assertEqual((v[0]["envoyes"], v[0]["reponses"], v[0]["non"], v[0]["clients"]), (3, 2, 1, 1))
        a = P.bilan_appels(["appele", "pas_interesse", "plus_tard"], ["interesse", "gagne", "rappeler", None])
        self.assertEqual((a["joints"], a["pas_interesses"], a["interesses"], a["gagnes"], a["a_rappeler"]), (4, 1, 1, 1, 2))

    def test_texte(self):
        b = {"le": "x", "preaudits": P.entonnoir_preaudits([{"segment": "Notaires", "siren": "1", "envoye": 1, "livre": 1, "rebond": 0, "reponse": 0}], {}),
             "vitrines": [], "appels": P.bilan_appels([], []), "email": {"envoyes": 1, "reponses": 0, "taux": 0.0}}
        self.assertIn("trop peu pour juger", P.texte(b))


if __name__ == "__main__":
    unittest.main()
