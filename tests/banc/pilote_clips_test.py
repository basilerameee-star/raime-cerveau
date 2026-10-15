# Le pilote des clips KinGKlip (15/10/2026). Ce banc tient : la grille des campagnes (budget lu dans la fiche, plateformes
# payées, thèmes exclus, langue, comptes dédiés, public exigé), le choix des lancements selon la réserve, l'alerte sous
# 3 jours, l'alternance des campagnes dans Buffer, la lecture groupée de Buffer et son quota, les plateformes où part un
# clip et la hauteur minimale des sources. Fonctions pures : aucune base, aucun réseau.
# Lancé par la CI : python3 -m unittest tests/banc/pilote_clips_test.py
import json
import sys
import time
import unittest
from pathlib import Path

DEPOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(DEPOT / "clippeur"))
import contentrewards as cr  # noqa: E402
import pilote  # noqa: E402


def campagne(**k):
    """Une campagne telle que la liste publique de Content Rewards la donne (valeurs du 15/10/2026 par défaut)."""
    c = {"id": "58795e60-259f-4f9d-932c-87cf1aac7c8d", "name": "HardScope UnPacked Episode 2 x ClipFarm", "organizationName": "Clip Farm",
         "status": "active", "payoutType": "cpm", "budgetCents": 370000, "requiresApplication": False,
         "description": "Unpacked is MatCrackz's new collectibles show on HardScope.", "categories": [{"id": "entertainment"}],
         "metrics": {"budgetSpentCents": 8900, "creatorCount": 3, "approvedSubmissionCount": 5},
         "payouts": [{"platform": p, "rateCents": 100, "minPayoutCents": 300, "maxPayoutCents": 35000, "payoutType": "cpm"}
                     for p in ("tiktok", "instagram", "youtube")]}
    c.update(k)
    return c


class Grille(unittest.TestCase):
    def test_hardscope_retenue_avec_le_lien_pour_rejoindre(self):
        e = cr.evaluer(campagne())
        self.assertEqual(e["exclusion"], "")
        self.assertEqual(e["plateformes"], ["instagram", "youtube"])
        self.assertEqual(e["restant"], 3611)
        self.assertEqual(e["lien"], "https://contentrewards.com/c/campaigns/58795e60-259f-4f9d-932c-87cf1aac7c8d")
        self.assertGreater(e["note"], 60)

    def test_le_budget_restant_est_celui_de_la_fiche(self):
        # 09/10 : Dillon Danis noté à 4 000 $ (budget de la liste) quand il restait 2 $
        e = cr.evaluer(campagne(name="Dillon Danis Clipping", budgetCents=400000, metrics={"budgetSpentCents": 399800}))
        self.assertEqual(e["restant"], 2)
        self.assertIn("budget restant", e["exclusion"])

    def test_plateformes_non_payees(self):
        seul_tiktok = [{"platform": "tiktok", "rateCents": 300, "payoutType": "cpm"}, {"platform": "youtube", "rateCents": 50, "payoutType": "cpm"}]
        self.assertIn("ni Instagram ni YouTube", cr.evaluer(campagne(payouts=seul_tiktok))["exclusion"])
        # la fiche l'emporte sur la liste : YouTube retiré du modèle de paiement
        fiche = {"configuration": {"payoutModel": [{"platform": "instagram", "rate": 100, "minPayout": 100, "maxPayout": 35000}],
                                   "content": {"contentTypes": [{"id": "clipping"}]}}}
        self.assertEqual(cr.evaluer(campagne(), fiche)["plateformes"], ["instagram"])

    def test_exclusions(self):
        cas = {"thème exclu": dict(name="$10,000 Doug Clipping Campaign", description="Clip content from Doug Gambles youtube videos"),
               "pas du clipping": dict(name="Cantina UGC Reposting Campaign"),
               "langue": dict(name="Call of Duty MW4 (en Français)"),
               "fermée": dict(status="completed"),
               "aberrant": dict(name="Coworker", payouts=[{"platform": "instagram", "rateCents": 100000, "payoutType": "cpm"}]),
               "langue ": dict(name="SAMSUNG AI KOELKAST - €4 per 1.000 views")}
        for motif, k in cas.items():
            self.assertIn(motif, cr.evaluer(campagne(**k))["exclusion"], motif)
        jeu = cr.evaluer(campagne(name="SEGA - Metaphor: ReFantazio Switch 2 Demo Clipping"))
        self.assertLess(jeu["note"], cr.evaluer(campagne())["note"] - 10)
        politique = campagne(categories=[{"id": "news-politics"}])
        self.assertIn("thème exclu", cr.evaluer(politique)["exclusion"])
        ugc = {"configuration": {"content": {"contentTypes": [{"id": "ugc"}]}}}
        self.assertIn("pas du clipping", cr.evaluer(campagne(), ugc)["exclusion"])

    def test_exigences_reperees_et_penalisees(self):
        base = cr.evaluer(campagne())["note"]
        dedie = cr.evaluer(campagne(description="Post only on a dedicated page for this creator."))
        self.assertTrue(dedie["dedies"])
        self.assertLess(dedie["note"], base - 30)
        public = cr.evaluer(campagne(name="[35%+UK] STRANGER THAN HEAVEN-Business Mode"))
        self.assertTrue(public["public"])
        self.assertEqual(public["exclusion"], "")
        self.assertTrue(cr.evaluer(campagne(requiresApplication=True))["candidature"])

    def test_liens_video_de_la_description(self):
        e = cr.evaluer(campagne(description="Footage: https://drive.google.com/drive/folders/abc and https://youtu.be/xyz."))
        self.assertEqual(e["sources"], ["https://drive.google.com/drive/folders/abc", "https://youtu.be/xyz"])

    def test_liste_paginee_sans_reseau(self):
        pages = {None: {"data": [campagne(id="a")], "pagination": {"nextCursor": "c2"}},
                 "c2": {"data": [campagne(id="b")], "pagination": {}}}

        def ouvrir(url):
            return pages["c2" if "cursor=c2" in url else None]
        self.assertEqual([c["id"] for c in cr.lister(ouvrir)], ["a", "b"])


def note(cid, n=70, **k):
    e = {"cr_id": cid, "nom": cid, "exclusion": "", "candidature": False, "dedies": False, "note": n,
         "plateformes": ["instagram", "youtube"], "sources": []}
    e.update(k)
    return e


class Pilote(unittest.TestCase):
    SOURCES = {c: {"url": "https://youtu.be/" + c} for c in ("a", "b", "c", "d", "e")}

    def test_reserve_vide_lance_trois_sources_au_plus(self):
        reserve = {"instagram": {"pret": 0, "attendu": 0}, "youtube": {"pret": 0, "attendu": 0}}
        notes = [note(c) for c in "abcde"]
        self.assertEqual([e["cr_id"] for e, _ in pilote.choisir(notes, self.SOURCES, reserve, [])], ["a", "b", "c"])

    def test_reserve_pleine_ne_lance_rien(self):
        reserve = {"instagram": {"pret": 56, "attendu": 0}, "youtube": {"pret": 60, "attendu": 0}}
        self.assertEqual(pilote.choisir([note("a")], self.SOURCES, reserve, []), [])

    def test_la_decoupe_en_cours_compte(self):
        reserve = {"instagram": {"pret": 12, "attendu": 8}, "youtube": {"pret": 12, "attendu": 8}}
        # 56 clips = 14 jours : deux semaines d'avance, rien ne part (Basile, 15/10/2026 au soir)
        plein = {"instagram": {"pret": 48, "attendu": 8}, "youtube": {"pret": 50, "attendu": 8}}
        self.assertEqual(pilote.choisir([note(c) for c in "abc"], self.SOURCES, plein, []), [])
        # 19 clips = 4,75 jours : on remonte vers 14 jours, 3 sources au plus par passage
        reserve = {"instagram": {"pret": 12, "attendu": 7}, "youtube": {"pret": 12, "attendu": 8}}
        self.assertEqual(len(pilote.choisir([note(c) for c in "abc"], self.SOURCES, reserve, [])), 3)

    def test_jamais_exclue_dediee_candidature_sans_source_ou_deja_lancee(self):
        reserve = {"instagram": {"pret": 0, "attendu": 0}}
        notes = [note("a", exclusion="budget restant trop bas"), note("b", dedies=True), note("c", candidature=True),
                 note("z"), note("d"), note("e", n=10), note("f", plateformes=["youtube"])]
        sources = dict(self.SOURCES, f={"url": "https://youtu.be/f"})
        choisis = pilote.choisir(notes, sources, reserve, [{"cr_id": "d", "url": "https://youtu.be/d"}])
        self.assertEqual([e["cr_id"] for e, _ in choisis], [])

    def test_source_du_fichier_puis_drive_avant_youtube(self):
        self.assertEqual(pilote.source_de(note("a"), self.SOURCES)["url"], "https://youtu.be/a")
        e = note("x", sources=["https://youtu.be/v", "https://drive.google.com/file/d/1"])
        self.assertEqual(pilote.source_de(e, {})["url"], "https://drive.google.com/file/d/1")

    def test_alerte_sous_deux_jours_une_seule_fois(self):
        basse = {"instagram": {"pret": 7, "attendu": 16}, "youtube": {"pret": 40, "attendu": 0}}
        self.assertEqual(pilote.a_alerter(basse, False), (True, 1.75))
        self.assertFalse(pilote.a_alerter({"instagram": {"pret": 11, "attendu": 0}}, False)[0])   # 2,75 jours : pas d'alerte
        self.assertFalse(pilote.a_alerter(basse, True)[0])
        self.assertFalse(pilote.a_alerter({"instagram": {"pret": 12, "attendu": 0}}, False)[0])

    def test_regles_liees_sans_les_liens_de_video(self):
        pages = []
        lire = lambda u: pages.append(u) or "<h1>Rules</h1><script>var x</script><p>Your captions must use #IShowSpeed #Expedia</p>"  # noqa: E731
        t = pilote.regles_liees("VOD: https://drive.google.com/file/d/1 Rules: https://reachclipping.com/Expedia-Speed.", lire)
        self.assertEqual(pages, ["https://reachclipping.com/Expedia-Speed"])
        self.assertIn("#IShowSpeed #Expedia", t)
        self.assertNotIn("<", t)
        self.assertNotIn("var x", t)

    def test_slug(self):
        self.assertEqual(pilote.slug("N3ON X MPJ Podcast clips (Curious Mike)"), "n3on-x-mpj-podcast-clips-curious-mike")


@unittest.skipUnless(sys.platform.startswith("linux"), "file.py et buffer.py tournent sur le serveur (fcntl)")
class Relais(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import buffer
        sys.modules.setdefault("fcntl", type(sys)("fcntl"))   # Windows : file.py ne s'en sert qu'à la découpe
        import file
        cls.buffer, cls.file = buffer, file

    def test_alternance_des_campagnes(self):
        lignes = [{"id": i, "campagne": c} for i, c in enumerate("AAAAABBC", 1)]
        ordre = [b["campagne"] for b in self.buffer.prochains(lignes, None, 8)]
        self.assertEqual(ordre[:3], ["A", "B", "A"])
        self.assertTrue(all(x != y for x, y in zip(ordre, ordre[1:4])), ordre)
        self.assertEqual(sorted(ordre), sorted("AAAAABBC"))
        # la dernière publiée sur la chaîne était de A : B passe d'abord
        self.assertEqual(self.buffer.prochains(lignes, "A", 1)[0]["campagne"], "B")
        self.assertEqual([b["campagne"] for b in self.buffer.prochains(lignes[:2], "A", 2)], ["A", "A"])

    def test_creneaux_aux_memes_heures_de_paris(self):
        from datetime import datetime
        from zoneinfo import ZoneInfo
        paris = ZoneInfo("Europe/Paris")
        t = datetime(2026, 10, 15, 16, 0, tzinfo=paris).timestamp()
        heures = [datetime.fromtimestamp(x, paris).strftime("%d %H:%M") for x in self.buffer.creneaux_apres(t, 5)]
        self.assertEqual(heures, ["15 19:00", "15 23:00", "16 02:00", "16 15:00", "16 19:00"])
        hiver = datetime(2026, 10, 25, 14, 0, tzinfo=paris).timestamp()         # le jour du passage à l'heure d'hiver
        self.assertEqual(datetime.fromtimestamp(self.buffer.creneaux_apres(hiver, 1)[0], paris).strftime("%H:%M"), "15:00")

    def test_un_clip_par_creneau_sur_les_deux_chaines(self):
        lignes = [{"id": i, "campagne": c, "clip": k, "plateforme": p} for i, (c, k, p) in enumerate(
            [("A", "1", "instagram"), ("A", "1", "youtube"), ("A", "2", "instagram"), ("A", "2", "youtube"),
             ("B", "1", "instagram"), ("B", "1", "youtube"), ("C", "1", "tiktok")], 1)]
        plan = self.buffer.repartir(lignes, ["instagram", "youtube"], None, [100, 200, 300])
        self.assertEqual([(s, sorted(b["plateforme"] for b in bs), bs[0]["campagne"]) for s, bs in plan],
                         [(100, ["instagram", "youtube"], "A"), (200, ["instagram", "youtube"], "B"),
                          (300, ["instagram", "youtube"], "A")])

    def test_lecture_groupee_seulement_apres_l_heure(self):
        t = 1_800_000_000
        avant = [{"prevu_s": t + 600, "maj_s": t - 60}]
        self.assertFalse(self.buffer.lecture_due(avant, 0, t))
        passe = [{"prevu_s": t - 300, "maj_s": t - 3600}]
        self.assertTrue(self.buffer.lecture_due(passe, 0, t))
        self.assertFalse(self.buffer.lecture_due(passe, t - 300, t))         # 10 minutes entre deux lectures
        relue = [{"prevu_s": t - 3600, "maj_s": t - 1800}]                   # lue après l'heure, pas encore partie
        self.assertFalse(self.buffer.lecture_due(relue, 0, t))
        self.assertTrue(self.buffer.lecture_due([{"prevu_s": t - 9000, "maj_s": t - 7300}], 0, t))
        self.assertTrue(self.buffer.lecture_due([{"prevu_s": None, "maj_s": t - 4 * 3600}], 0, t))

    def test_quota_de_buffer(self):
        t = time.time()
        self.assertTrue(self.buffer.appel_permis({"reste": 1483, "appels": []}, t)[0])
        self.assertFalse(self.buffer.appel_permis({"reste": 40, "reprise": t + 3600, "appels": []}, t)[0])
        self.assertTrue(self.buffer.appel_permis({"reste": 40, "reprise": t - 1, "appels": []}, t)[0])
        self.assertFalse(self.buffer.appel_permis({"reste": 900, "appels": [t - 10] * 80}, t)[0])
        self.assertTrue(self.buffer.appel_permis({"reste": 900, "appels": [t - 1000] * 80}, t)[0])

    def test_plateformes_payees_et_actives(self):
        f = self.file.plateformes_a_publier
        jamais = lambda pl: False  # noqa: E731
        # avant le 15/10 : YouTube, TikTok et Instagram pour chaque clip, payé ou non
        self.assertEqual(f({}, jamais), ["youtube", "instagram"])
        self.assertEqual(f({"plateformes": '["instagram"]'}, jamais), ["instagram"])
        self.assertEqual(f({"plateformes": '["tiktok", "youtube"]'}, lambda pl: pl == "tiktok"), ["youtube"])

    def test_hauteur_minimale(self):
        self.assertEqual(self.file.hauteur_minimale("bandes"), 1080)
        self.assertEqual(self.file.hauteur_minimale(None), 1080)
        self.assertEqual(self.file.hauteur_minimale("plein"), 1440)


class SourcesVerifiees(unittest.TestCase):
    def test_chaque_source_a_un_lien_et_sa_verification(self):
        s = json.load(open(DEPOT / "clippeur" / "sources.json", encoding="utf-8"))["campagnes"]
        self.assertGreaterEqual(len(s), 3)
        for cid, x in s.items():
            self.assertRegex(cid, r"^[0-9a-f-]{36}$")
            self.assertTrue(x["url"].startswith("https://"), cid)
            self.assertIn("2026", x["verifie"], cid)



class Drive(unittest.TestCase):
    """Le lien Drive de la marque, sans le PC (15/10/2026) : gdown simulé, fichiers réels écrits sur disque."""

    def setUp(self):
        import tempfile
        self.dossier = Path(tempfile.mkdtemp())
        sys.modules.setdefault("gdown", type(sys)("gdown"))
        import clippeur as cl
        self.cl = cl

    def faux(self, refuse=(), quota=False):
        from collections import namedtuple
        F = namedtuple("F", "id path local_path")
        cible, vus = self.dossier, []

        class G:
            @staticmethod
            def download_folder(url, output, skip_download, quiet):
                return [F("p1", "A/PRE OP/1.JPG", str(cible / "A/PRE OP/1.JPG")),
                        F("v1", "A/VIDEO/Video 1.MOV", str(cible / "A/VIDEO/Video 1.MOV")),
                        F("v2", "B/VIDEO/Vid.mp4", str(cible / "B/VIDEO/Vid.mp4"))]

            @staticmethod
            def download(id=None, url=None, output=None, quiet=True, resume=True):
                vus.append(id)
                if quota:
                    raise RuntimeError("Too many users have viewed or downloaded this file recently. Quota exceeded")
                if id in refuse:
                    raise RuntimeError("Failed to retrieve file url")
                Path(output if not output.endswith("/") else output + id + ".mp4").write_bytes(b"x" * (10 if id == "v1" else 5))
        return G, vus

    def test_dossier_les_videos_seules(self):
        g, vus = self.faux()
        self.cl.telecharger_drive("https://drive.google.com/drive/folders/abc", self.dossier, gd=g)
        self.assertEqual(vus, ["v1", "v2"])                       # aucune photo demandée
        self.assertTrue((self.dossier / "A/VIDEO/Video 1.MOV").is_file())

    def test_dossier_une_video_refusee_n_arrete_pas_les_autres(self):
        g, _ = self.faux(refuse=("v1",))
        self.cl.telecharger_drive("https://drive.google.com/drive/folders/abc", self.dossier, gd=g)
        self.assertTrue((self.dossier / "B/VIDEO/Vid.mp4").is_file())

    def test_fichier_quota_sort_avec_quota_drive(self):
        g, vus = self.faux(quota=True)
        with self.assertRaises(SystemExit) as e:
            self.cl.telecharger_drive("https://drive.google.com/file/d/1pcUMz8ZpbIcku3ylk6dhOi6xjWAT3juc/view?usp=sharing", self.dossier, gd=g)
        self.assertIn("QUOTA_DRIVE", str(e.exception))
        self.assertEqual(vus, ["1pcUMz8ZpbIcku3ylk6dhOi6xjWAT3juc"])

    def test_autre_panne_remonte(self):
        g, _ = self.faux(refuse=("1pcUMz8ZpbIcku3ylk6dhOi6xjWAT3juc",))
        with self.assertRaises(RuntimeError):
            self.cl.telecharger_drive("https://drive.google.com/file/d/1pcUMz8ZpbIcku3ylk6dhOi6xjWAT3juc/view", self.dossier, gd=g)

    def test_quota_retente_trois_jours_au_plus(self):
        import datetime
        sys.modules.setdefault("fcntl", type(sys)("fcntl"))   # Windows : file.py ne s'en sert qu'à la découpe
        import file
        now = datetime.datetime(2026, 10, 18, 8, 0)
        self.assertFalse(file.trop_vieux({"cree_le": "2026-10-15T09:26:00+00:00"}, maintenant=now))
        self.assertTrue(file.trop_vieux({"cree_le": "2026-10-15T07:26:00+00:00"}, maintenant=now))

if __name__ == "__main__":
    unittest.main()
