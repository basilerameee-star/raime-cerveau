# Le vérificateur des publications (08/10/2026) : le 08/10, 16 clips TikTok avaient disparu sans alerte. Ce banc tient :
# ce que chaque plateforme répond (en ligne, disparu, ou rien de concluant), le témoin qui empêche de déclarer disparu un
# clip quand la plateforme est illisible, l'alerte une seule fois, et un passage complet sur les vraies bases du banc
# (réseau simulé, Postgres réel) quand psql et les bases de test sont là (CI : après npm test, qui les prépare).
# Lancé par la CI : python3 -m unittest tests/banc/verificateur_clips_test.py
import os
import shutil
import subprocess
import sys
import types
import unittest
from pathlib import Path

DEPOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(DEPOT / "clippeur"))
import verificateur as v  # noqa: E402

v.PAUSE = 0
YT = "https://www.youtube.com/shorts/qOe0CrcZXMs"
TT = "https://tiktok.com/@bahethora0/video/7692086618278186273"
IG = "https://www.instagram.com/reel/Dd_w4kqDoLr/"
FICHE_YT = '{"title": "N3on", "author_name": "KinGKlip", "author_url": "https://www.youtube.com/@KinGKlip-x8j"}'
PAGE_IG = '<meta property="og:url" content="https://www.instagram.com/kinggklip/reel/Dd_w4kqDoLr/" /><meta property="og:image" content="x">'


def reseau(reponses, journal=None):
    """Un faux réseau : {morceau d'adresse: (code, texte)} ; tout le reste répond comme un témoin en ligne."""
    def ouvrir(adresse, agent=v.NAVIGATEUR, delai=25):
        if journal is not None:
            journal.append(adresse)
        for morceau, r in reponses.items():
            if morceau in adresse:
                return r
        if "instagram" in adresse:
            return 200, PAGE_IG
        return 200, FICHE_YT
    return ouvrir


class Controle(unittest.TestCase):
    def test_youtube(self):
        self.assertEqual(v.controler("youtube", YT, reseau({}))[0::2], ("en_ligne", "@KinGKlip-x8j"))
        self.assertEqual(v.controler("youtube", YT, reseau({"qOe0": (404, "Not Found")}))[0], "disparu")
        for panne in [(503, ""), (429, ""), (None, "timed out"), (200, "<html>pas du json</html>")]:
            self.assertIsNone(v.controler("youtube", YT, reseau({"qOe0": panne}))[0], "inconnu reste inconnu : %r" % (panne,))

    def test_tiktok_le_compte_se_lit_dans_le_lien_meme_disparu(self):
        e, note, compte = v.controler("tiktok", TT, reseau({"76920866": (400, '{"message":"Something went wrong","code":400}')}))
        self.assertEqual((e, compte), ("disparu", "@bahethora0"))
        self.assertIn("400", note)

    def test_instagram(self):
        self.assertEqual(v.controler("instagram", IG, reseau({}))[0::2], ("en_ligne", "@kinggklip"))
        self.assertEqual(v.controler("instagram", IG, reseau({"Dd_w4": (200, "<title>Instagram</title>")}))[0], "disparu")
        self.assertEqual(v.controler("instagram", IG, reseau({"Dd_w4": (404, "")}))[0], "disparu")
        self.assertIsNone(v.controler("instagram", IG, reseau({"Dd_w4": (429, "")}))[0])

    def test_instagram_est_lu_comme_un_robot_d_apercu(self):
        agents = []
        v.controler("instagram", IG, lambda a, agent=v.NAVIGATEUR, delai=25: agents.append(agent) or (200, PAGE_IG))
        self.assertEqual(agents, [v.APERCU])

    def test_aucune_note_n_a_d_apostrophe_droite(self):
        cas = [("youtube", {}), ("youtube", {"qOe0": (404, "")}), ("youtube", {"qOe0": (None, "x")}),
               ("instagram", {}), ("instagram", {"Dd_w4": (200, "")}), ("instagram", {"Dd_w4": (500, "")}), ("x", {})]
        for p, r in cas:
            self.assertNotIn("'", v.controler(p, {"youtube": YT, "instagram": IG}.get(p, TT), reseau(r))[1])


def clips():
    lot = [{"campagne": "r3born-ep1-v2", "clip": "clip-%02d.mp4" % i, "plateforme": "youtube", "lien": YT + str(i), "etat": None} for i in range(12)]
    lot += [{"campagne": "r3born-ep1-v2", "clip": "clip-%02d.mp4" % i, "plateforme": "instagram", "lien": IG + str(i), "etat": None} for i in range(17)]
    lot += [{"campagne": "r3born-ep1-v2", "clip": "clip-%02d.mp4" % i, "plateforme": "tiktok", "lien": TT + str(i), "etat": None} for i in range(16)]
    return lot


TIKTOK_PARTI = {"bahethora0": (400, '{"code":400}')}


class Passage(unittest.TestCase):
    def test_les_chiffres_du_08_10_et_l_ordre_youtube_instagram_tiktok(self):
        adresses = []
        r, illisibles = v.passer(clips(), reseau(TIKTOK_PARTI, adresses))
        self.assertEqual(v.resume(r, illisibles), ["YouTube : 12 en ligne sur 12", "Instagram : 17 en ligne sur 17",
                                                   "TikTok : 0 en ligne sur 16, 16 introuvables"])
        self.assertEqual(len(v.nouveaux_disparus(r)), 16)
        ordre = [("youtube" if "youtube" in a else "instagram" if "instagram" in a else "tiktok") for a in adresses]
        self.assertEqual(ordre, sorted(ordre, key=["youtube", "instagram", "tiktok"].index))
        self.assertEqual(adresses.count(v.oembed("tiktok", v.TEMOINS["tiktok"])), 2, "le témoin avant et après")

    def test_temoin_muet_rien_n_est_declare_disparu(self):
        for quand in ("avant", "apres"):
            appels = {"n": 0}

            def ouvrir(a, agent=v.NAVIGATEUR, delai=25):
                if "BsOGulcndj" in a:                        # le témoin d'Instagram
                    appels["n"] += 1
                    muet = (quand == "avant" and appels["n"] == 1) or (quand == "apres" and appels["n"] == 2)
                    return (200, "<title>Instagram</title>") if muet else (200, PAGE_IG)
                return (200, "<title>Instagram</title>") if "Dd_w4kqDoLr/1" in a else reseau({})(a, agent)
            r, illisibles = v.passer(clips(), ouvrir)
            ig = [x for x in r if x["plateforme"] == "instagram"]
            self.assertIn("instagram", illisibles, quand)
            self.assertFalse([x for x in ig if x["nouveau"] == "disparu"], quand)
            self.assertEqual(sum(x["nouveau"] == "en_ligne" for x in ig), 9, quand)   # « /1 » : les liens 1 et 10 à 16 sont partis
            self.assertFalse([x for x in r if x["plateforme"] == "youtube" and x["nouveau"] != "en_ligne"], "YouTube n'en souffre pas")

    def test_une_alerte_par_disparition_pas_chaque_matin(self):
        lot = clips()
        for c in lot:
            if c["plateforme"] == "tiktok":
                c["etat"] = "disparu"
        r, _ = v.passer(lot, reseau(TIKTOK_PARTI))
        self.assertEqual(v.nouveaux_disparus(r), [])

    def test_texte_d_alerte_borne_et_sans_apostrophe(self):
        r, _ = v.passer(clips(), reseau(TIKTOK_PARTI))
        t = v.texte_alerte(v.nouveaux_disparus(r), 600)
        self.assertLessEqual(len(t), 600)
        self.assertTrue(t.startswith("16 clips ne sont plus en ligne : TikTok r3born-ep1-v2/clip-00.mp4"))
        self.assertIn("et ", t)
        self.assertNotIn("'", t)


class HorsCampagne(unittest.TestCase):
    def test_les_autres_publications_des_comptes_de_la_campagne(self):
        lot = [{"campagne": "michael-sartain-ep1", "clip": "a", "plateforme": "instagram", "lien": "l1", "compte": "@kinggklip", "etat": "en_ligne"},
               {"campagne": "r3born-ep1-v2", "clip": "b", "plateforme": "instagram", "lien": "l2", "compte": "@kinggklip", "etat": "en_ligne"},
               {"campagne": "r3born-ep1-v2", "clip": "c", "plateforme": "instagram", "lien": "l3", "compte": "@kinggklip", "etat": "disparu"},
               {"campagne": "r3born-ep1-v2", "clip": "d", "plateforme": "youtube", "lien": "l4", "compte": "@KinGKlip-x8j", "etat": None}]
        self.assertEqual({k: [c["clip"] for c in l] for k, l in v.hors_campagne(lot, "Sartain").items()}, {"@kinggklip": ["b"]})
        self.assertEqual([c["clip"] for c in v.hors_campagne(lot, "sartain", "@kingklip-x8j")["@KinGKlip-x8j"]], ["d"])


class Migration(unittest.TestCase):
    def test_le_script_porte_la_meme_migration_que_le_depot(self):
        fichier = (DEPOT / "migrations" / "025_verification_clips.sql").read_text(encoding="utf-8").replace("\r\n", "\n")
        self.assertEqual(v.MIGRATION, fichier)


# ── Un passage réel sur les bases du banc : état écrit, alerte au Gardien une fois, journal, passage de boucle ──
BRAIN = os.environ.get("BANC_BASE_BRAIN", "raime_brain_test")
N8N = os.environ.get("BANC_BASE_N8N", "n8n_test")


def psql(base, requete, *params):
    """Comme clippeur/file.sql, mais sur les bases du banc et sans Docker (mêmes variables psql, mêmes apostrophes retirées)."""
    cmd = ["psql", "-w", "-d", {"raime_brain": BRAIN, "n8n": N8N}.get(base, base), "-tAq", "-v", "ON_ERROR_STOP=1"]
    for i, p in enumerate(params):
        cmd += ["-v", "p%d=%s" % (i, str(p).replace("'", ""))]
    r = subprocess.run(cmd, input=requete, capture_output=True, text=True, timeout=30, env=dict(os.environ, PGCONNECT_TIMEOUT="5"))
    if r.returncode:
        raise RuntimeError(r.stderr[-400:])
    return r.stdout.strip()


def bases_presentes():
    if not shutil.which("psql"):
        return False
    try:
        return psql("raime_brain", "SELECT 1;") == "1" and psql("n8n", "SELECT 1;") == "1"
    except Exception:
        return False


@unittest.skipUnless(bases_presentes(), "psql et les bases du banc (npm test les prépare)")
class PassageReel(unittest.TestCase):
    def setUp(self):
        psql("raime_brain", """DROP TABLE IF EXISTS clips_publies;
          CREATE TABLE clips_publies (campagne text NOT NULL, clip text NOT NULL, plateforme text NOT NULL, lien text NOT NULL,
            publie_le timestamptz NOT NULL DEFAULT now(), declare_whop boolean NOT NULL DEFAULT false, PRIMARY KEY (campagne, clip, plateforme));
          CREATE TABLE IF NOT EXISTS boucle_passages (agent text NOT NULL, fin_le timestamptz NOT NULL DEFAULT now(), statut text NOT NULL, duree_ms int);
          DELETE FROM journal WHERE acteur = 'verificateur_clips'; DELETE FROM boucle_passages WHERE agent = 'verificateur_clips';
          INSERT INTO clips_publies (campagne, clip, plateforme, lien) VALUES
            ('r3born-ep1-v2', 'clip-01.mp4', 'youtube', '%s'), ('r3born-ep1-v2', 'clip-01.mp4', 'instagram', '%s'),
            ('r3born-ep1-v2', 'clip-01.mp4', 'tiktok', '%s');""" % (YT, IG, TT))
        psql("n8n", "CREATE TABLE IF NOT EXISTS gardien_log (id serial PRIMARY KEY, severity text, rule text, detail text, created_at timestamptz DEFAULT now());"
                    "DELETE FROM gardien_log WHERE rule LIKE 'Clips%';")
        sys.modules["file"] = types.SimpleNamespace(sql=lambda requete, *p, base="raime_brain": psql(base, requete, *p))

    def tearDown(self):
        sys.modules.pop("file", None)

    def ligne(self, plateforme):
        return psql("raime_brain", "SELECT etat || '|' || coalesce(compte, '') || '|' || (controle_le IS NOT NULL) || '|' || (disparu_le IS NOT NULL) "
                                   "FROM clips_publies WHERE plateforme = :'p0';", plateforme)

    def test_deux_passages(self):
        v.main(ouvrir=reseau(TIKTOK_PARTI))
        self.assertEqual(self.ligne("youtube"), "en_ligne|@KinGKlip-x8j|true|false")
        self.assertEqual(self.ligne("instagram"), "en_ligne|@kinggklip|true|false")
        self.assertEqual(self.ligne("tiktok"), "disparu|@bahethora0|true|true")
        self.assertEqual(psql("n8n", "SELECT severity || '|' || rule FROM gardien_log WHERE rule LIKE 'Clips%';"), "dur|Clips disparus")
        self.assertIn("1 clip n’est plus en ligne : TikTok r3born-ep1-v2/clip-01.mp4 " + TT,
                      psql("n8n", "SELECT detail FROM gardien_log WHERE rule = 'Clips disparus';"))
        self.assertIn("TikTok : 0 en ligne sur 1, 1 introuvable", psql("raime_brain", "SELECT changement FROM journal WHERE acteur = 'verificateur_clips';"))
        self.assertEqual(psql("raime_brain", "SELECT statut FROM boucle_passages WHERE agent = 'verificateur_clips';"), "ok")
        # le lendemain, YouTube ne répond pas : rien n'est conclu, l'état d'hier reste, aucune nouvelle alerte
        v.main(ouvrir=reseau({**TIKTOK_PARTI, "youtube.com/oembed": (503, "")}))
        self.assertEqual(self.ligne("youtube"), "en_ligne|@KinGKlip-x8j|true|false")
        self.assertIn("non vérifié", psql("raime_brain", "SELECT controle_note FROM clips_publies WHERE plateforme = 'youtube';"))
        self.assertEqual(psql("n8n", "SELECT count(*) FROM gardien_log WHERE rule = 'Clips disparus';"), "1", "une alerte, pas une par matin")
        self.assertEqual(psql("n8n", "SELECT count(*) FROM gardien_log WHERE rule = 'Clips non vérifiés';"), "1")


def charger_poseur():
    import importlib.util
    spec = importlib.util.spec_from_file_location("poser_veilleurs", DEPOT / "n8n" / "poser_veilleurs.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)                 # rien ne part vers n8n à l'import : poser() n'est appelé qu'en direct
    return m


class PoserLesNoeuds(unittest.TestCase):
    """n8n/poser_veilleurs.py : le 14/10/2026, la clause s'est collée au GROUP BY (« w.nameUNION ALL ») et la requête de la
    Sentinelle ne passait plus. La requête recomposée doit rester valide, et la pose ne s'applique qu'une fois."""
    REQUETE = "SELECT probleme FROM ( SELECT 'avant' AS probleme FROM (VALUES (1)) v(n) GROUP BY v.n ) x"

    def test_la_clause_garde_son_espace_et_ne_se_pose_qu_une_fois(self):
        m = charger_poseur()
        noeuds = [{"name": "Diagnostic", "parameters": {"query": self.REQUETE}}]
        self.assertTrue(m.sentinelle(noeuds))
        q = noeuds[0]["parameters"]["query"]
        self.assertIn("GROUP BY v.n UNION ALL SELECT g.rule", q)
        self.assertTrue(q.endswith(" ) x"))
        self.assertFalse(m.sentinelle(noeuds), "déjà posée : rien ne change")

    @unittest.skipUnless(bases_presentes(), "psql et les bases du banc (npm test les prépare)")
    def test_la_requete_recomposee_s_execute(self):
        m = charger_poseur()
        noeuds = [{"name": "Diagnostic", "parameters": {"query": self.REQUETE}}]
        m.sentinelle(noeuds)
        sortie = psql("n8n", """CREATE TEMP TABLE gardien_log (id serial, severity text, rule text, detail text, created_at timestamptz DEFAULT now());
            CREATE TEMP TABLE execution_entity ("workflowId" text, status text, "startedAt" timestamptz);
            INSERT INTO gardien_log (severity, rule, detail) VALUES ('dur', 'Clips disparus', '1 clip n’est plus en ligne');
            """ + noeuds[0]["parameters"]["query"] + ";")
        self.assertEqual(sorted(sortie.splitlines()), ["Clips disparus : 1 clip n’est plus en ligne", "avant"])

    def test_le_code_du_heraut_ne_remplace_que_la_version_attendue(self):
        m = charger_poseur()
        vieux = [{"name": "Format email", "parameters": {"jsCode": "// L'e-mail de 7 h 30 (refait le 08/10/2026) : …"}}]
        self.assertTrue(m.heraut(vieux))
        self.assertEqual(vieux[0]["parameters"]["jsCode"], m.CODE)
        self.assertFalse(m.heraut(vieux))
        with self.assertRaises(AssertionError):
            m.heraut([{"name": "Format email", "parameters": {"jsCode": "// une autre version, changée à la main"}}])


if __name__ == "__main__":
    unittest.main()
