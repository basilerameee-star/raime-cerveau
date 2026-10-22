"""Le Médecin du système (22/10/2026) : une même panne chaque nuit = une seule signature ; l'intérieur d'une trace ne compte
pas, sa dernière ligne oui ; un ordre pour Hermes porte la mission (diff + test, rien de livré) ; 3 par jour au plus."""
import os
import sys
import tempfile
import time
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "tools"))
import medecin  # noqa: E402


class Medecin(unittest.TestCase):
    def test_une_panne_par_signature(self):
        a = medecin.signature("/x/declarer.log", "2026-10-21 19:06 juvon-clips-3-cpm instagram https://www.instagram.com/reel/A1/ agent en échec :  ^^^")
        b = medecin.signature("/x/declarer.log", "2026-10-22 02:15 colin-kaepernick-podcast instagram https://www.instagram.com/reel/B2/ agent en échec : ^^")
        self.assertEqual(a, b)
        self.assertNotEqual(a, medecin.signature("/x/file.log", "2026-10-22 02:15 agent en échec"))

    def test_journal_trace_regroupee(self):
        with tempfile.TemporaryDirectory() as d:
            f = os.path.join(d, "file.log")
            jour = time.strftime("%Y-%m-%d")
            open(f, "w").write("Traceback (most recent call last):\n  File \"a.py\", line 1\n    x = json.loads('')\n"
                               "json.decoder.JSONDecodeError: Expecting value: line 1\n" * 3 + jour + " 10:00 tout va bien\n")
            medecin.JOURNAUX = [os.path.join(d, "*.log")]
            e = medecin.erreurs_des_journaux()
            self.assertEqual(len(e), 1)
            self.assertEqual(e[0]["n"], 3)
            self.assertIn("JSONDecodeError", e[0]["message"])

    def test_ordre_et_plafond(self):
        ordres = []
        medecin.psql = lambda base, req: (ordres.append(req), "%d\n" % len(ordres))[1]
        pannes = [{"signature": "s%d" % i, "n": 1, "fichier": "f.log", "message": "m%d" % i, "exemple": "x"} for i in range(5)]
        vus = {"s0": {}}
        c = medecin.confier(pannes, vus, time.time())
        self.assertEqual([x["signature"] for x in c], ["s1", "s2", "s3"])
        self.assertIn("'harness', 'medecin'", ordres[0])
        self.assertIn("Ne livre rien toi-même", ordres[0])


if __name__ == "__main__":
    unittest.main()
