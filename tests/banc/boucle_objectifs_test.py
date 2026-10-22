"""La boucle des objectifs (22/10/2026) : chaque objectif manqué reçoit une cause et une action ; une plateforme en pause
remonte à Basile ; trois jours manqués de suite remontent à Basile ; Hermes reçoit 2 ordres par jour au plus ; le lendemain,
un objectif redevenu tenu est noté comme réussite de l'action."""
import json
import os
import sys
import tempfile
import time
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "tools"))
import boucle_objectifs as b  # noqa: E402


class Boucle(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp()
        b.ANALYSE = os.path.join(self.d, "analyse")
        b.CLIPPEUR = os.path.join(self.d, "clippeur")
        os.makedirs(b.ANALYSE)
        os.makedirs(b.CLIPPEUR)
        self.ordres = []
        b.psql = lambda q: (self.ordres.append(q), "%d" % len(self.ordres))[1] if q.startswith("INSERT") else ""
        b.resultats = lambda: {}

    def matin(self, jugement):
        json.dump({"jugement": jugement}, open(os.path.join(b.ANALYSE, "matin.json"), "w"))

    def test_plateforme_en_pause_remonte_a_basile(self):
        open(os.path.join(b.CLIPPEUR, "pause-tiktok"), "w").close()
        r = b.remede("3 clips sur tiktok", "0 publié(s)")
        self.assertEqual(r["qui"], "basile")
        self.assertIn("relier", r["action"])

    def test_inconnu_va_a_hermes_deux_par_jour(self):
        self.matin([{"objectif": "objectif x%d" % i, "tenu": False, "detail": "d"} for i in range(4)])
        b.main()
        o = json.load(open(os.path.join(b.ANALYSE, "objectifs.json"), encoding="utf-8"))
        self.assertEqual(sum(1 for a in o["actions"] if a.get("ordre")), 2)
        self.assertTrue(all("'harness', 'objectifs'" in q for q in self.ordres))

    def test_trois_jours_de_suite_remontent_et_reussite_notee(self):
        hier = time.strftime("%Y-%m-%d", time.gmtime(time.time() - 86400))
        json.dump({hier: {"actions": [{"objectif": "rebonds d'e-mails sous 5 %", "manque_jours": 2},
                                      {"objectif": "Hermes sous 3 M jetons", "manque_jours": 1, "action": "plafonds"}]}},
                  open(os.path.join(b.ANALYSE, "objectifs_historique.json"), "w"))
        self.matin([{"objectif": "rebonds d'e-mails sous 5 %", "tenu": False, "detail": "3 sur 20"},
                    {"objectif": "Hermes sous 3 M jetons", "tenu": True, "detail": "1 M"}])
        b.main()
        o = json.load(open(os.path.join(b.ANALYSE, "objectifs.json"), encoding="utf-8"))
        self.assertEqual(o["basile"][0]["objectif"], "rebonds d'e-mails sous 5 %")
        self.assertTrue(any(l.startswith("✓ Hermes sous 3 M jetons") for l in o["lignes"]))


if __name__ == "__main__":
    unittest.main()
