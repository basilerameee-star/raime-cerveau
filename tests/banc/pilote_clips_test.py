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
    # la grille elle-même, toutes niches confondues ; le filtre « streamers seulement » (22/10/2026) a son propre essai
    def setUp(self):
        self.focus, cr.FOCUS = cr.FOCUS, None

    def tearDown(self):
        cr.FOCUS = self.focus

    def test_streamers_seulement(self):
        cr.FOCUS = "streamer"
        self.assertTrue(cr.evaluer(campagne())["exclusion"].startswith("hors niche"), "HardScope n'est pas un streamer")
        s = cr.evaluer(campagne(name="Jay Guapo X Mypip Streamer Clips", description="Clip Jay's Twitch streams."))
        self.assertEqual(s["exclusion"], "")
        esport = cr.evaluer(campagne(name="FlyQuest PTL", description="Esports highlights.", categories=[{"id": "gaming"}]))
        self.assertEqual(esport["exclusion"], "")
        pub = cr.evaluer(campagne(name="Animal Valley: Idle Merge Game", description="Gameplay trailer.", categories=[{"id": "gaming"}]))
        self.assertTrue(pub["exclusion"].startswith("hors niche"), "« gaming » seul : une pub de jeu, pas un streamer")

    def test_source_twitch_de_la_chaine(self):
        brief = {"requirements": {"text": "Clip only from https://www.twitch.tv/irubyana streams."}}
        vus = []
        s = pilote.source_du_brief(note("x"), brief, lambda ch: vus.append(ch) or "https://www.twitch.tv/videos/2901902468")
        self.assertEqual(vus, ["irubyana"])
        self.assertEqual(s["url"], "https://www.twitch.tv/videos/2901902468")
        self.assertIsNone(pilote.source_du_brief(note("x"), brief)["url"], "sans résolveur : la chaîne entière reste refusée")
        # 22/10/2026 (BrettLiftsXP, 0 clip) : les Shorts du brief sont des exemples de clips, jamais une source à découper
        exemples = {"requirements": {"text": "Ideas: https://www.youtube.com/shorts/4Xeuo7IjDA4 Twitch: https://m.twitch.tv/brettliftsxp/home"}}
        s = pilote.source_du_brief(note("x"), exemples, lambda ch: "https://www.twitch.tv/videos/2901902468" if ch == "brettliftsxp" else None)
        self.assertEqual(s["url"], "https://www.twitch.tv/videos/2901902468")
        self.assertEqual(pilote.derniere_video_twitch("x", lancer=lambda c: "v1234567|300.0\nv2901902468|3944.0\n"),
                         "https://www.twitch.tv/videos/2901902468", "moins de 15 min : écartée")

    def test_hardscope_retenue_avec_le_lien_pour_rejoindre(self):
        e = cr.evaluer(campagne())
        self.assertEqual(e["exclusion"], "")
        self.assertEqual(e["plateformes"], ["instagram", "tiktok", "youtube"])       # TikTok de nouveau relié (22/10/2026)
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
        # 22/10/2026 : nouveau compte TikTok relié ; une campagne qui paie aussi TikTok y publie (la sélection reste IG/YT)
        self.assertEqual(cr.evaluer(campagne())["plateformes"], ["instagram", "tiktok", "youtube"])
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

    def test_payee_a_notre_portee_d_abord(self):
        # 22/10/2026 : nos clips font 150 vues de médiane (record 1 716) ; un clip n'est payé qu'au-dessus du minimum
        def seuil(cents):
            return [{"platform": p, "rateCents": 100, "minPayoutCents": cents, "maxPayoutCents": 35000, "payoutType": "cpm"}
                    for p in ("instagram", "youtube")]
        mille, quatre, dix = (cr.evaluer(campagne(payouts=seuil(c))) for c in (100, 400, 1000))
        self.assertEqual(mille["vues_min"], 1000)
        self.assertGreater(mille["note"], quatre["note"] + 10)
        self.assertGreater(quatre["note"], dix["note"])
        self.assertEqual(dix["exclusion"], "")
        self.assertIn("minimum de 12000 vues", cr.evaluer(campagne(payouts=seuil(1200)))["exclusion"])
        self.assertIn("payé dès 1000 vues", pilote.pourquoi(mille))

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

    def test_reserve_pleine_mais_sans_streamers(self):
        # 22/10/2026 : 14 jours de clips d'avant, aucun de la niche : une source part quand même, une seule par passage
        reserve = {"instagram": {"pret": 56, "attendu": 0}, "youtube": {"pret": 60, "attendu": 0}}
        focus, cr.FOCUS = cr.FOCUS, "streamer"
        try:
            self.assertEqual(len(pilote.choisir([note(c) for c in "abc"], self.SOURCES, reserve, [], {"instagram": 0, "youtube": 2})), 1)
            self.assertEqual(pilote.choisir([note("a")], self.SOURCES, reserve, [], {"instagram": 20, "youtube": 20}), [],
                             "5 jours de streamers en file : rien ne presse")
        finally:
            cr.FOCUS = focus

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

    def test_drive_avant_youtube(self):
        reserve = {"instagram": {"pret": 0, "attendu": 0}}
        sources = {"a": {"url": "https://youtu.be/a"}, "b": {"url": "https://youtu.be/b"}, "c": {"url": "https://drive.google.com/file/d/c"}}
        choisis = [e["cr_id"] for e, _ in pilote.choisir([note("a"), note("b"), note("c")], sources, reserve, [])]
        self.assertEqual(choisis, ["c", "a", "b"])

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

    def test_payees_le_plus_tot_d_abord(self):
        # 22/10/2026 : un créneau donné à un clip payé dès 1 000 vues peut rapporter, à un clip payé dès 4 000 jamais encore
        lignes = [{"id": i, "campagne": c} for i, c in enumerate("AAAABBC", 1)]
        seuils = {"A": 4000, "B": 1000, "C": 2000}
        ordre = [b["campagne"] for b in self.buffer.prochains(lignes, None, 7, seuils=seuils)]
        self.assertEqual(ordre[:4], ["B", "C", "B", "A"])
        self.assertEqual(sorted(ordre), sorted("AAAABBC"), "rien n'est perdu")
        inconnue = [b["campagne"] for b in self.buffer.prochains([{"id": 1, "campagne": "X"}, {"id": 2, "campagne": "A"}], None, 2,
                                                                seuils=seuils)]
        self.assertEqual(inconnue, ["X", "A"], "seuil inconnu : rang moyen, devant les campagnes à 4 000 vues")
        # la dernière publiée sur la chaîne était de A : B passe d'abord
        self.assertEqual(self.buffer.prochains(lignes, "A", 1)[0]["campagne"], "B")
        self.assertEqual([b["campagne"] for b in self.buffer.prochains(lignes[:2], "A", 2)], ["A", "A"])

    def test_parts_de_l_analyste(self):
        # 21/10/2026 : streamer 60 %, podcast 40 % ; sur 5 créneaux : 3 streamers, 2 podcasts, jamais la même campagne de suite
        lignes = [{"id": i, "campagne": c} for i, c in enumerate(["n3on-a"] * 4 + ["kai-stream-b"] * 4 + ["demi-lovato-podcast"] * 4, 1)]
        ordre = [b["campagne"] for b in self.buffer.prochains(lignes, None, 5, {"streamer": .6, "podcast": .4})]
        from analyste import niche
        self.assertEqual(sorted(niche(c) for c in ordre), ["podcast", "podcast", "streamer", "streamer", "streamer"])
        self.assertTrue(all(x != y for x, y in zip(ordre, ordre[1:])), ordre)

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
        self.assertFalse(self.buffer.lecture_due(passe, t - 120, t))         # 3 minutes entre deux lectures, après l'heure
        # 22/10/2026 : Buffer publie quelques minutes après l'heure ; relue 2 h plus tard, la fenêtre de 30 minutes de
        # Content Rewards était fermée (HTTP 409) : dans les 25 minutes, on relit toutes les 3 minutes
        pas_partie = [{"prevu_s": t - 600, "maj_s": t - 450}]
        self.assertTrue(self.buffer.lecture_due(pas_partie, t - 200, t))
        self.assertFalse(self.buffer.lecture_due([{"prevu_s": t - 3000, "maj_s": t - 450}], t - 300, t), "hors fenêtre : 10 minutes")
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

    def test_montage_bride_a_trois_coeurs(self):
        # 16/10 : le montage occupait plus de 5 cœurs sur 8 ; la commande du conteneur porte la limite de docker
        self.assertEqual(self.file.COEURS, "3")
        source = (DEPOT / "clippeur" / "file.py").read_text(encoding="utf-8")
        montage = [l for l in source.splitlines() if '"docker", "run"' in l and "GEMINI_API_KEY" in l]
        self.assertEqual(len(montage), 1, montage)
        self.assertIn('"--cpus", COEURS,', montage[0])
        self.assertIn('"--name", nom_conteneur,', montage[0], "22/10 : nommé, pour être arrêté après 4 h")

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


class Agent(unittest.TestCase):
    """L'agent Content Rewards (15/10/2026) : brief lu, campagnes à rejoindre, déclaration notée, une seule alerte."""

    def setUp(self):
        sys.modules.setdefault("fcntl", type(sys)("fcntl"))
        import cr_lanceur
        import declarer
        self.lanceur, self.declarer = cr_lanceur, declarer

    def test_source_du_brief_drive_d_abord(self):
        brief = {"requirements": {"text": "Tag @hardscope and use #unpacked. Files: https://youtu.be/abc",
                                  "files": [{"url": "https://drive.google.com/file/d/1abcdefghijklmnopqrstu/view"}]}}
        s = pilote.source_du_brief(note("x"), brief)
        self.assertEqual(s["url"], "https://drive.google.com/file/d/1abcdefghijklmnopqrstu/view")
        self.assertEqual(s["hashtags"], ["#unpacked"])
        self.assertIn("@hardscope", s["tags"]["instagram"])
        self.assertIsNone(pilote.source_du_brief(note("y"), {"requirements": {"text": "clip anything"}})["url"])

    def test_jamais_une_chaine_entiere(self):
        for u in ("https://www.twitch.tv/Awake", "http://www.youtube.com/@tonalexina", "https://kick.com/jayguap00"):
            self.assertFalse(pilote.une_video(u), u)
        for u in ("https://www.youtube.com/watch?v=abc", "https://kick.com/x/videos/01a1", "https://drive.google.com/drive/folders/1"):
            self.assertTrue(pilote.une_video(u), u)

    def test_a_rejoindre_toutes_les_compatibles_pas_deux_fois(self):
        notes = [note("a"), note("b", dedies=True), note("c"), note("d", candidature=True), note("e", n=10)]
        self.assertEqual([e["cr_id"] for e in pilote.a_rejoindre(notes, {"c": {}}, {"instagram": {}})], ["a"])

    def test_declaration_notee_seulement_si_relue(self):
        vus = []
        sql = lambda q, *p: vus.append((q.split()[0], p)) or ""
        c = {"campagne": "k", "clip": "1", "plateforme": "youtube", "lien": "https://y/1", "declare_essais": 4}
        self.assertEqual(self.declarer.noter(sql, c, {"ok": True, "verifie": False}), (False, True))   # 5e essai : abandon
        self.assertEqual(self.declarer.noter(sql, c, {"ok": True, "verifie": True}), (True, False))
        self.assertEqual(self.declarer.noter(sql, c, {"ok": False, "bloque": True}), (False, False))

    def test_campagne_fermee_aux_clips_ses_clips_en_attente_ecartes(self):
        # 21/10 : « This campaign isn't taking new clips right now » ; pas d'alerte, plus de nouvel essai, file libérée
        vus = []
        sql = lambda q, *p: vus.append((" ".join(q.split()), p)) or ""
        c = {"campagne": "k", "clip": "1", "plateforme": "youtube", "lien": "https://y/1", "declare_essais": 0}
        self.assertEqual(self.declarer.noter(sql, c, {"ok": False, "ferme": True, "raison": "fermée"}), (False, False))
        self.assertTrue(any("declare_essais = %d" % self.declarer.ESSAIS_MAX in q for q, p in vus))
        ecarte = [(q, p) for q, p in vus if q.startswith("UPDATE clips_buffer")]
        self.assertEqual(len(ecarte), 1)
        self.assertIn("campagne_close", ecarte[0][0])
        self.assertIn("etat = 'a_faire'", ecarte[0][0])
        self.assertEqual(ecarte[0][1], ("k", "youtube"))

    def test_une_seule_alerte_par_blocage(self):
        import tempfile
        d = Path(tempfile.mkdtemp())
        self.lanceur.BLOQUE, self.lanceur.ALERTE = str(d / "bloque"), str(d / "alerte")
        (d / "bloque").write_text("captcha affiché par Content Rewards", encoding="utf-8")
        envois = []
        prevenir = lambda sujet, texte, **k: envois.append(sujet)
        self.assertTrue(self.lanceur.alerter_si_bloque(prevenir))
        self.assertFalse(self.lanceur.alerter_si_bloque(prevenir))
        (d / "bloque").unlink()
        self.assertFalse(self.lanceur.alerter_si_bloque(prevenir))
        self.assertFalse((d / "alerte").exists())                # levé : la prochaine panne sera signalée
        self.assertEqual(len(envois), 1)

if __name__ == "__main__":
    unittest.main()
