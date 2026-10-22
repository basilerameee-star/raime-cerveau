# L'Envoyeur (08/10/2026, audit) : ce que le robot répond dans un formulaire de candidature. Aucun test ne tenait ces deux
# modules : l'essai à blanc Michael Page a rempli « CDI » dans le salaire et « Oui » à « avez-vous un visa ».
# Lancé par la CI : python3 -m unittest tests/banc/envoyeur_test.py
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "envoyeur"))
import michaelpage as mp  # noqa: E402
import regles  # noqa: E402

PROFIL = {"salaire": {"suisse_annuel_brut": "54 600 CHF (13 salaires)", "suisse_mensuel_brut_min": "4 200 CHF"},
          "contrats": ["CDI", "CDD"], "permis_travail_suisse": "Frontalier UE – permis G à obtenir par l'employeur"}


class Salaire(unittest.TestCase):
    def test_le_libelle_visible_passe_avant_le_nom_technique(self):
        champ = {"label": "Minimum Expected Salary", "name": "mp_job_type[salary][amount]", "id": "edit-job-type-salary"}
        visible = " ".join(str(champ.get(k) or "") for k in ("label", "placeholder")).strip()
        tout = " ".join(str(champ.get(k) or "") for k in ("label", "name", "id", "placeholder"))
        cle = (mp.cle_profil(visible) if visible else None) or mp.cle_profil(tout)
        self.assertEqual(cle, "salaire")
        self.assertEqual(mp.valeur(cle, PROFIL, champ["label"]), "54600")
        self.assertEqual(mp.cle_profil(tout), "contrat", "le piège existe bien : le nom seul dit « job type »")

    def test_le_code_du_formulaire_suit_cette_regle(self):
        source = (Path(mp.__file__)).read_text(encoding="utf-8")
        self.assertIn('(cle_profil(visible) if visible else None) or cle_profil(tout)', source)

    def test_mensuel_ou_annuel_selon_la_question(self):
        self.assertEqual(mp.valeur("salaire", PROFIL, "Salaire mensuel souhaité"), "4200")
        self.assertEqual(mp.valeur("salaire", PROFIL, "Prétentions salariales"), "54600")


class OuiNon(unittest.TestCase):
    def test_visa_actuel_non(self):
        self.assertEqual(regles.repondre("Do you currently have a working visa for Switzerland?"), "Non")
        self.assertEqual(regles.repondre("Avez-vous actuellement un permis de travail suisse ?"), "Non")

    def test_decisions_deja_prises_par_basile(self):
        self.assertEqual(regles.repondre("Avez-vous un permis de travail ?"), "Oui")
        self.assertEqual(regles.repondre("Êtes-vous frontalier ?"), "Oui")
        self.assertEqual(regles.repondre("Parlez-vous allemand ?"), "Non")
        self.assertEqual(regles.repondre("Avez-vous de l'expérience dans la vente ?"), "Oui")

    def test_un_fait_inconnu_n_est_jamais_affirme(self):
        self.assertIsNone(regles.repondre("Avez-vous un diplôme d'ingénieur ?"))
        self.assertIsNone(regles.repondre("Votre casier judiciaire est-il vierge ?"))
        self.assertEqual(regles.repondre("Avez-vous 5 ans d'expérience en Suisse ?"), "Non")


if __name__ == "__main__":
    unittest.main()


class PauseOubliee(unittest.TestCase):
    # 22/10/2026 : un essai interrompu à 11 h 43 a laissé /data/pause ; plus rien ne partait du serveur pendant des heures
    def test_seule_une_pause_de_geste_vieille_de_2_h_est_levee(self):
        import tempfile
        import time
        try:
            import playwright.sync_api  # noqa: F401
        except ImportError:                                # la CI n'a pas Playwright : serveur.py n'en a pas besoin ici
            import types
            for nom in ("playwright", "playwright.sync_api"):
                sys.modules[nom] = types.ModuleType(nom)
            sys.modules["playwright.sync_api"].sync_playwright = None
        import serveur
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "pause"
            p.write_text("geste en cours (essai)")
            self.assertFalse(serveur.pause_oubliee(p, time.time() + 3600), "une heure : le geste peut encore tourner")
            self.assertTrue(serveur.pause_oubliee(p, time.time() + 3 * 3600))
            p.write_text("")
            self.assertFalse(serveur.pause_oubliee(p, time.time() + 30 * 3600), "la pause voulue par Basile reste")
            self.assertFalse(serveur.pause_oubliee(Path(d) / "absente", time.time()))


class FormulairesReels(unittest.TestCase):
    # 22/10/2026, essais à blanc JUST (CVdropper) et Adecco : ce qui manquait pour un envoi réel
    P = {"civilite": "Monsieur", "prenom": "Basile", "nom": "Rame",
         "langues": {"Français": "Langue maternelle", "Anglais": "C2 (bilingue)"}}

    def champ(self, n, **k):
        c = {"n": n, "tag": "input", "type": "text", "name": "", "id": "", "label": "", "question": "", "placeholder": "",
             "required": False, "value": "", "checked": False, "maxlength": 0, "options": []}
        c.update(k)
        return c

    def test_genre_par_les_seules_etiquettes(self):
        champs = [self.champ(i, type="radio", name="g", label=l) for i, l in enumerate(("femme", "homme", "divers"))]
        actions, _ = mp.decider(champs, self.P, {}, set())
        self.assertEqual([(a["n"], a["faire"]) for a in actions], [(1, "cocher")])

    def test_confidentialite_cochee_meme_sans_etoile_jamais_la_publicite(self):
        prive = self.champ(0, type="checkbox", label="J’ai lu et j’accepte la politique de confidentialité.")
        pub = self.champ(1, type="checkbox", label="J'accepte de recevoir des offres et la newsletter")
        actions, _ = mp.decider([prive, pub], self.P, {}, set())
        self.assertEqual([a["n"] for a in actions], [0])

    def test_langue_de_communication(self):
        self.assertEqual(mp.valeur("langue", self.P, "Langue de communication préférée du candidat"), "Français")


class FormulaireAdecco(unittest.TestCase):
    # 22/10/2026, essai Adecco : « Code Pays » en liste puis le numéro ; l'accord de confidentialité est une liste
    P = {"telephone": "+33 6 07 65 61 70", "civilite": "Monsieur"}

    def champ(self, n, **k):
        c = {"n": n, "tag": "input", "type": "text", "name": "", "id": "", "label": "", "question": "", "placeholder": "",
             "required": False, "value": "", "checked": False, "maxlength": 0, "options": []}
        c.update(k)
        return c

    def test_indicatif_puis_numero_national(self):
        code = self.champ(0, tag="select", type="select", label="Téléphone (Portable)", required=True,
                          options=[["", "Code Pays"], ["CH", "Suisse (+41)"], ["FR", "France (+33)"]])
        num = self.champ(1, label="Téléphone (Portable)", required=True)
        actions, _ = mp.decider([code, num], self.P, {}, set())
        self.assertEqual([(a["n"], a["valeur"]) for a in actions], [(0, "FR"), (1, "06 07 65 61 70")])

    def test_accord_de_confidentialite_jamais_les_alertes(self):
        opts = [["", "Veuillez indiquer votre accord."], ["1", "J'accepte"], ["0", "Je ne suis pas d'accord"]]
        prive = self.champ(0, tag="select", type="select", required=True, options=opts,
                           label="Chez Adecco Group, nous prenons votre vie privée au sérieux. Notre déclaration de confidentialité définit le traitement de vos informations personnelles.")
        alertes = self.champ(1, tag="select", type="select", options=opts,
                             label="Envie de rejoindre notre communauté mondiale de talents ? vous acceptez de recevoir des communications et des alertes d'emploi")
        actions, _ = mp.decider([prive, alertes], self.P, {}, set())
        self.assertEqual([(a["n"], a["valeur"]) for a in actions], [(0, "1")])


class CantonExige(unittest.TestCase):
    # Basile, 22/10/2026 : un canton est exigé et Ville-la-Grand n'en a pas → code postal 1201, ville Genève, pays France,
    # canton Genève ; la rue ne change pas. Sans champ de canton, l'adresse reste celle du profil.
    P = {"code_postal": "74100", "ville": "Ville-la-Grand", "pays": "FRANCE", "adresse": "2 rue des Voirons"}

    def champ(self, n, **k):
        c = {"n": n, "tag": "input", "type": "text", "name": "", "id": "", "label": "", "question": "", "placeholder": "",
             "required": True, "value": "", "checked": False, "maxlength": 0, "options": []}
        c.update(k)
        return c

    def adresse(self, canton):
        champs = [self.champ(0, label="Code postal"), self.champ(1, label="Ville"), self.champ(2, label="Rue")]
        if canton:
            champs.append(self.champ(3, tag="select", type="select", label="Canton/State",
                                     options=[["", "--"], ["VD", "Vaud"], ["GE", "Genève"], ["VS", "Valais"]]))
        actions, _ = mp.decider(champs, self.P, {}, set())
        return {a["n"]: a["valeur"] for a in actions}

    def test_canton_exige(self):
        self.assertEqual(self.adresse(True), {0: "1201", 1: "Genève", 2: "2 rue des Voirons", 3: "GE"})

    def test_sans_canton_rien_ne_change(self):
        self.assertEqual(self.adresse(False), {0: "74100", 1: "Ville-la-Grand", 2: "2 rue des Voirons"})


class Confirmation(unittest.TestCase):
    # 22/10/2026 : JUST a répondu « Merci beaucoup pour ta candidature. Elle a été transmise avec succès. » ; le robot l'a
    # lue comme un refus et l'aurait renvoyée en double
    def test_les_reponses_de_succes_reelles(self):
        import formulaire
        for t in ("Merci beaucoup pour ta candidature. Elle a été transmise avec succès. Tu peux maintenant fermer cette page.",
                  "Votre candidature a bien été envoyée", "Your application was successfully submitted",
                  "Merci pour votre candidature"):
            self.assertTrue(formulaire.CONFIRMATION.search(t), t)
        self.assertFalse(formulaire.CONFIRMATION.search("Veuillez remplir ce champ"))


class ListeOuiNon(unittest.TestCase):
    # 22/10/2026 (Lidl) : « Avons-nous été recommandés en tant qu'employeur par un(e) collaborateur/-trice ? » en liste Oui/Non
    def test_recommandation_non_et_liste_oui_non(self):
        q = "Recommandation (Avons-nous été recommandés en tant qu'employeur par un(e) collaborateur/-trice Lidl ?)"
        self.assertEqual(regles.repondre(q), "Non")
        c = {"n": 0, "tag": "select", "type": "select", "name": "reco", "id": "", "label": q, "question": "", "placeholder": "",
             "required": True, "value": "", "checked": False, "maxlength": 0, "options": [["", "--"], ["1", "Oui"], ["0", "Non"]]}
        actions, _ = mp.decider([c], {}, {}, set())
        self.assertEqual([(a["n"], a["valeur"]) for a in actions], [(0, "0")])
