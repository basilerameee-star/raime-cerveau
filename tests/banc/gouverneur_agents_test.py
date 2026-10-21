# Le gouverneur des agents (22/10/2026). Ce banc tient : seuls les agents en panne ou à vide sont suivis ; au-delà de
# 7 jours de panne, l'arrêt est PROPOSÉ (jamais fait seul) ; l'infrastructure n'est jamais proposée à l'arrêt ; la ligne
# reprise dans l'état commun nomme les agents. Fonctions pures. CI : python3 -m unittest tests/banc/gouverneur_agents_test.py
import datetime
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools"))
import gouverneur_agents as G  # noqa: E402

MAINTENANT = datetime.datetime(2026, 10, 22, 6, 0, tzinfo=datetime.timezone.utc)


def agent(nom, etat, depuis="2026-10-08T08:00:00Z", secteur="clipping", raison="r"):
    return {"id": nom, "nom": nom, "etat": etat, "depuis": depuis, "secteur": secteur, "raison": raison}


class Juger(unittest.TestCase):
    def test_panne_vide_et_arret_propose(self):
        l = G.juger([agent("A", "ok"), agent("B", "panne"), agent("C", "panne", "2026-10-20T08:00:00Z"), agent("D", "vide")], MAINTENANT)
        self.assertEqual([x["nom"] for x in l], ["B", "C", "D"], "pannes d'abord, la plus ancienne en tête")
        self.assertIn("proposer l'arrêt", l[0]["proposition"])
        self.assertEqual(l[0]["jours"], 13)
        self.assertIn("à réparer", l[1]["proposition"])
        self.assertIn("sert encore", l[2]["proposition"])

    def test_infrastructure_jamais_a_l_arret(self):
        l = G.juger([agent("Machine", "panne", secteur="serveur")], MAINTENANT)
        self.assertNotIn("arrêt à Basile", l[0]["proposition"])

    def test_ligne_de_l_etat(self):
        l = G.juger([agent("B", "panne"), agent("D", "vide")], MAINTENANT)
        self.assertEqual(G.ligne_etat(l), "Agents en panne : B ; à vide : D")
        self.assertEqual(G.ligne_etat([]), "Agents en panne : aucun ; à vide : aucun")


if __name__ == "__main__":
    unittest.main()
