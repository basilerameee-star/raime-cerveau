# -*- coding: utf-8 -*-
"""Le vérificateur des publications (08/10/2026), chaque matin sur le serveur, sans Claude, sans frais.

Le 08/10/2026, Basile a découvert que 16 clips TikTok avaient disparu sans que rien ne le dise. Ce script teste chaque
lien de la table clips_publies, YouTube et Instagram d'abord (le clipping s'y concentre depuis le 08/10), TikTok ensuite :
  - YouTube et TikTok : leur service public oEmbed (la fiche d'une vidéo) ; 200 = en ligne, 400 ou 404 = disparu ;
  - Instagram : la page du clip, qui porte og:url ou og:image tant qu'il est en ligne.
Chaque plateforme a un TÉMOIN, une publication publique qui ne disparaît pas, contrôlé avant et après ses clips. S'il ne
répond pas « en ligne », la plateforme est illisible ce jour-là : aucun clip n'y est déclaré disparu à tort.
L'état (en_ligne ou disparu) et la date du contrôle vont dans clips_publies (migrations/025_verification_clips.sql).
Un clip qui passe à « disparu » est écrit au journal du Gardien (gardien_log, base n8n) : la Sentinelle l'envoie par
Resend à son passage suivant, et le Héraut le reprend dans l'e-mail de 7 h 30.
Seuls les liens des clips, déjà publics, partent vers leur propre plateforme. Rien d'autre ne sort du serveur.

Cron sur le serveur : 40 3 * * * (5 h 40 à Paris, avant la Sentinelle de 6 h et le rapport de 7 h 30).
À la main : python3 verificateur.py --essai   (contrôle et affiche, sans rien écrire)
            python3 verificateur.py --hors-campagne sartain [--compte @kinggklip]
              (les publications d'un compte qui ne sont pas de la campagne, à retirer avant de la relancer ; lecture seule)
"""
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ORDRE = ("youtube", "instagram", "tiktok")
NOMS = {"youtube": "YouTube", "instagram": "Instagram", "tiktok": "TikTok"}
# Des publications publiques qui ne disparaissent pas : la première vidéo de YouTube (2005), l'exemple de la
# documentation oEmbed de TikTok, la photo la plus aimée d'Instagram (2019). Toutes trois vérifiées le 08/10/2026.
TEMOINS = {"youtube": "https://www.youtube.com/watch?v=jNQXAC9IVRw",
           "tiktok": "https://www.tiktok.com/@scout2015/video/6718335390845095173",
           "instagram": "https://www.instagram.com/p/BsOGulcndj-/"}
NAVIGATEUR = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
# Instagram ne sert ses balises og: qu'aux robots d'aperçu de lien : un navigateur ordinaire reçoit une page vide.
APERCU = "facebookexternalhit/1.1"
PAUSE = 1.5                                  # secondes entre deux liens d'une même plateforme
DISPARU_OEMBED = (400, 401, 403, 404)        # la plateforme dit qu'elle ne connaît pas (ou plus) cette vidéo
OG = re.compile(r'<meta[^>]+property="og:(?:url|image)"')

# La même chose que migrations/025_verification_clips.sql : le banc vérifie qu'ils ne divergent pas.
MIGRATION = """-- Le vérificateur des publications (clippeur/verificateur.py, 08/10/2026). Le 08/10, Basile a découvert que 16 clips
-- TikTok avaient disparu sans que rien ne le signale. Chaque matin, chaque lien de clips_publies est testé, et son état
-- est noté ici. Le vérificateur passe aussi ces lignes lui-même à chaque passage (idempotent) ; ce fichier les rend visibles.
ALTER TABLE clips_publies ADD COLUMN IF NOT EXISTS etat text;               -- 'en_ligne' ou 'disparu' ; vide : jamais contrôlé
ALTER TABLE clips_publies ADD COLUMN IF NOT EXISTS controle_le timestamptz; -- le dernier contrôle qui a pu conclure
ALTER TABLE clips_publies ADD COLUMN IF NOT EXISTS disparu_le timestamptz;  -- la première fois qu'il a été vu disparu
ALTER TABLE clips_publies ADD COLUMN IF NOT EXISTS controle_note text;      -- la réponse de la plateforme, en clair
ALTER TABLE clips_publies ADD COLUMN IF NOT EXISTS compte text;             -- le compte qui porte le clip, lu à la plateforme
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clips_publies_etat_check') THEN
    ALTER TABLE clips_publies ADD CONSTRAINT clips_publies_etat_check CHECK (etat IS NULL OR etat IN ('en_ligne', 'disparu'));
  END IF;
END $$;
"""


def ouvrir(adresse, agent=NAVIGATEUR, delai=25):
    """(code HTTP, texte) ; (None, raison) quand la plateforme ne répond pas. Ne lève jamais d'exception."""
    try:
        req = urllib.request.Request(adresse, headers={"User-Agent": agent, "Accept-Language": "fr,en"})
        with urllib.request.urlopen(req, timeout=delai) as r:
            return r.status, r.read(4000000).decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, ""
    except Exception as e:                    # délai dépassé, réseau coupé, nom introuvable
        return None, str(e)[:120]


def oembed(plateforme, lien):
    if plateforme == "youtube":
        return "https://www.youtube.com/oembed?format=json&url=" + urllib.parse.quote(lien, safe="")
    return "https://www.tiktok.com/oembed?url=" + urllib.parse.quote(lien, safe="")


def compte_du_lien(lien):
    """Le compte écrit dans le lien lui-même (TikTok : /@compte/video/…), même quand la vidéo a disparu."""
    m = re.search(r"/@([A-Za-z0-9._-]+)", lien or "")
    return "@" + m.group(1) if m else None


def compte_de_fiche(fiche):
    """Le compte d'une fiche oEmbed : author_url (https://www.youtube.com/@KinGKlip-x8j), sinon author_unique_id."""
    return compte_du_lien(fiche.get("author_url")) or ("@" + fiche["author_unique_id"] if fiche.get("author_unique_id") else None)


def controler(plateforme, lien, ouvrir=ouvrir):
    """(« en_ligne » | « disparu » | None, note en clair, compte ou None). None : rien ne permet de conclure, on réessaie
    au prochain passage. Les notes n'ont pas d'apostrophe droite : file.sql les retire des paramètres."""
    etat, note, compte = _controler(plateforme, lien, ouvrir)
    return etat, note, compte or compte_du_lien(lien)


def _controler(plateforme, lien, ouvrir):
    nom = NOMS.get(plateforme, plateforme)
    if plateforme in ("youtube", "tiktok"):
        code, texte = ouvrir(oembed(plateforme, lien))
        if code == 200:
            try:
                fiche = json.loads(texte)
            except ValueError:
                return None, "réponse illisible de %s" % nom, None
            if isinstance(fiche, dict) and (fiche.get("title") is not None or fiche.get("html") or fiche.get("author_name")):
                return "en_ligne", "en ligne (%s)" % (fiche.get("author_name") or "auteur non indiqué"), compte_de_fiche(fiche)
            return None, "réponse de %s sans fiche de vidéo" % nom, None
        if code in DISPARU_OEMBED:
            return "disparu", "introuvable : %s répond %d" % (nom, code), None
        return None, "pas de conclusion : %s" % (("%s répond %d" % (nom, code)) if code else texte), None
    if plateforme == "instagram":
        code, texte = ouvrir(lien, APERCU)
        if code == 200:
            if OG.search(texte):
                m = re.search(r'property="og:url" content="https://www\.instagram\.com/([A-Za-z0-9._]+)/(?:reel|p)/', texte)
                return "en_ligne", "en ligne (la page porte og:url ou og:image)", ("@" + m.group(1)) if m else None
            return "disparu", "introuvable : la page Instagram ne porte ni og:url ni og:image", None
        if code in (404, 410):
            return "disparu", "introuvable : Instagram répond %d" % code, None
        return None, "pas de conclusion : %s" % (("Instagram répond %d" % code) if code else texte), None
    return None, "aucun contrôle prévu pour la plateforme %s" % nom, None


def plateformes(clips):
    """YouTube, Instagram, puis TikTok ; une plateforme inattendue passe en dernier (elle reste « non vérifiée »)."""
    autres = sorted({c["plateforme"] for c in clips} - set(ORDRE))
    return [p for p in ORDRE if any(c["plateforme"] == p for c in clips)] + autres


def passer(clips, ouvrir=ouvrir, pause=None):
    """Contrôle chaque clip. Rend (resultats, illisibles) :
    resultats = la ligne de chaque clip + « nouveau » (en_ligne, disparu ou None) et « note » ;
    illisibles = {plateforme: raison} quand son témoin n'a pas répondu « en ligne » avant ou après ses clips."""
    pause = PAUSE if pause is None else pause
    resultats, illisibles = [], {}
    for p in plateformes(clips):
        lot = [c for c in clips if c["plateforme"] == p]
        if p not in TEMOINS:
            resultats += [dict(c, nouveau=None, note=controler(p, c["lien"], ouvrir)[1], lu=None) for c in lot]
            continue
        avant = controler(p, TEMOINS[p], ouvrir)
        lus = []
        for c in lot:
            time.sleep(pause)
            lus.append((c,) + controler(p, c["lien"], ouvrir))
        time.sleep(pause)
        apres = controler(p, TEMOINS[p], ouvrir)
        if avant[0] != "en_ligne" or apres[0] != "en_ligne":
            illisibles[p] = "le témoin ne répond pas « en ligne » (%s)" % (avant[1] if avant[0] != "en_ligne" else apres[1])
            # Un « en ligne » reste une preuve (la page a répondu) ; un « disparu » ne l'est plus ce jour-là.
            lus = [(c, e, n, k) if e == "en_ligne" else (c, None, "non vérifié : %s illisible ce jour-là" % NOMS[p], k)
                   for c, e, n, k in lus]
        resultats += [dict(c, nouveau=e, note=n, lu=k) for c, e, n, k in lus]
    return resultats, illisibles


def nouveaux_disparus(resultats):
    """Les clips vus disparus aujourd'hui pour la première fois (en ligne hier, ou jamais contrôlés) : ceux-là alertent."""
    return [r for r in resultats if r["nouveau"] == "disparu" and r.get("etat") != "disparu"]


def resume(resultats, illisibles):
    """Une ligne par plateforme, dans l'ordre du contrôle : « YouTube : 12 en ligne sur 12 »."""
    lignes = []
    for p in plateformes(resultats):
        lot = [r for r in resultats if r["plateforme"] == p]
        ok = sum(r["nouveau"] == "en_ligne" for r in lot)
        ko = sum(r["nouveau"] == "disparu" for r in lot)
        nc = len(lot) - ok - ko
        t = "%s : %d en ligne sur %d" % (NOMS.get(p, p), ok, len(lot))
        if ko:
            t += ", %d introuvable%s" % (ko, "s" if ko > 1 else "")
        if nc:
            t += ", %d non vérifié%s" % (nc, "s" if nc > 1 else "")
        if p in illisibles:
            t += " (%s)" % illisibles[p]
        lignes.append(t)
    return lignes


def texte_alerte(nouveaux, longueur=1800):
    """Le détail que la Sentinelle envoie : le nombre, puis chaque clip et son lien, à ouvrir d'un clic."""
    tete = ("%d clips ne sont plus en ligne : " % len(nouveaux)) if len(nouveaux) > 1 else "1 clip n’est plus en ligne : "
    morceaux, t = [], tete
    for i, r in enumerate(nouveaux):
        m = "%s %s/%s %s" % (NOMS.get(r["plateforme"], r["plateforme"]), r["campagne"], r["clip"], r["lien"])
        reste = " ; et %d autres (cockpit.raime.fr/clips)" % (len(nouveaux) - i)
        if len(t) + len(m) + len(reste) + 3 > longueur:
            return t + reste
        morceaux.append(m)
        t = tete + " ; ".join(morceaux)
    return t


def hors_campagne(clips, campagne, compte=None):
    """Pour relancer une campagne sur des comptes qui ne montrent qu'elle (Sartain, 14/10/2026) : les publications de
    chaque compte qui ne sont PAS de cette campagne et restent visibles (en ligne, ou jamais contrôlées).
    campagne : un morceau du nom (« sartain » couvre « michael-sartain-ep1 ») ; compte : « @kinggklip », facultatif.
    Sans compte : les comptes qui portent au moins un clip de la campagne. Rend {compte: [clips]}."""
    cle = campagne.strip().lower()
    voulus = {compte.lower()} if compte else {c["compte"].lower() for c in clips if c.get("compte") and cle in c["campagne"].lower()}
    tri = {}
    for c in clips:
        k = c.get("compte")
        if k and k.lower() in voulus and cle not in c["campagne"].lower() and c.get("etat") != "disparu":
            tri.setdefault(k, []).append(c)
    return tri


def lire_clips(sql):
    """Les clips et leur état d'hier. to_jsonb : la lecture marche aussi en essai, avant que les colonnes existent."""
    brut = sql("SELECT coalesce(json_agg(json_build_object('campagne', campagne, 'clip', clip, 'plateforme', plateforme, "
               "'lien', lien, 'etat', to_jsonb(c) ->> 'etat', 'compte', to_jsonb(c) ->> 'compte') ORDER BY publie_le), '[]') "
               "FROM clips_publies c;")
    return json.loads(next(l for l in brut.splitlines() if l.startswith("[")))


def afficher_hors_campagne(campagne, compte=None):
    sys.path.insert(0, "/opt/raime/clippeur")
    from file import sql
    tri = hors_campagne(lire_clips(sql), campagne, compte)
    print("Publications hors de la campagne « %s »%s, encore visibles. Source : clips_publies (ce que le relais a publié ;"
          " une publication faite à la main hors du relais n'y figure pas)." % (campagne, (" sur " + compte) if compte else ""))
    if not tri:
        print("Aucune." if compte else "Aucune, ou aucun compte connu ne porte encore cette campagne (le compte se lit au contrôle du matin).")
    for k, lot in sorted(tri.items()):
        print("%s : %d publication%s" % (k, len(lot), "s" if len(lot) > 1 else ""))
        for c in lot:
            print("  %s %s/%s %s (%s)" % (NOMS.get(c["plateforme"], c["plateforme"]), c["campagne"], c["clip"], c["lien"],
                                          c.get("etat") or "jamais contrôlé"))
    return tri


def main(essai=False, ouvrir=ouvrir):
    sys.path.insert(0, "/opt/raime/clippeur")
    from file import sql                      # ici : le banc d'essai lit ce module sans Postgres ni Docker
    debut = time.time()
    if not essai:
        sql(MIGRATION)
    clips = lire_clips(sql)
    resultats, illisibles = passer(clips, ouvrir)
    lignes, nouveaux = resume(resultats, illisibles), nouveaux_disparus(resultats)
    revenus = [r for r in resultats if r["nouveau"] == "en_ligne" and r.get("etat") == "disparu"]
    print("%s · %s" % (time.strftime("%Y-%m-%d %H:%M"), " · ".join(lignes)), flush=True)
    for r in nouveaux:
        print("  disparu : %s %s/%s %s (%s)" % (NOMS.get(r["plateforme"]), r["campagne"], r["clip"], r["lien"], r["note"]), flush=True)
    if essai:
        print("essai : rien n'est écrit", flush=True)
        return resultats, illisibles
    for r in resultats:
        if r["nouveau"]:
            sql("""UPDATE clips_publies SET etat = :'p0', controle_le = now(), controle_note = :'p1',
                   disparu_le = CASE WHEN :'p0' = 'disparu' THEN coalesce(disparu_le, now()) END,
                   compte = coalesce(nullif(:'p5', ''), compte)
                   WHERE campagne = :'p2' AND clip = :'p3' AND plateforme = :'p4';""",
                r["nouveau"], r["note"], r["campagne"], r["clip"], r["plateforme"], r.get("lu") or "")
        else:                                 # rien de conclu : l'état et la date du dernier contrôle restent ceux d'avant
            sql("UPDATE clips_publies SET controle_note = :'p0' WHERE campagne = :'p1' AND clip = :'p2' AND plateforme = :'p3';",
                "%s (essai du %s)" % (r["note"], time.strftime("%d/%m")), r["campagne"], r["clip"], r["plateforme"])
    if nouveaux:
        sql("INSERT INTO gardien_log (severity, rule, detail) VALUES ('dur', 'Clips disparus', :'p0');", texte_alerte(nouveaux), base="n8n")
    if illisibles:
        sql("INSERT INTO gardien_log (severity, rule, detail) VALUES ('souple', 'Clips non vérifiés', :'p0');",
            " ; ".join("%s : %s, les clips gardent leur dernier état connu" % (NOMS.get(p, p), r) for p, r in illisibles.items()), base="n8n")
    motif = ("Nouveaux disparus : " + texte_alerte(nouveaux, 900)) if nouveaux else "Aucun nouveau clip disparu."
    if revenus:
        motif += " De nouveau en ligne : " + ", ".join("%s %s/%s" % (NOMS.get(r["plateforme"]), r["campagne"], r["clip"]) for r in revenus) + "."
    sql("INSERT INTO journal (acteur, changement, motif) VALUES ('verificateur_clips', :'p0', :'p1');",
        "Vérification des clips : " + " · ".join(lignes), motif)
    sql("INSERT INTO boucle_passages (agent, statut, duree_ms) VALUES ('verificateur_clips', 'ok', :p0);", int((time.time() - debut) * 1000))
    return resultats, illisibles


if __name__ == "__main__":
    a = sys.argv
    if "--hors-campagne" in a:                # lecture seule
        afficher_hors_campagne(a[a.index("--hors-campagne") + 1], a[a.index("--compte") + 1] if "--compte" in a else None)
        sys.exit(0)
    essai = "--essai" in a
    try:
        main(essai)
    except Exception as e:
        print("vérificateur en échec :", str(e)[:300], flush=True)
        if not essai:
            try:                              # une panne du vérificateur se voit : Gardien, Sentinelle, rapport du matin
                from file import sql
                sql("INSERT INTO gardien_log (severity, rule, detail) VALUES ('souple', 'Vérificateur des clips en échec', :'p0');",
                    str(e)[:600].replace("'", "’"), base="n8n")
                sql("INSERT INTO boucle_passages (agent, statut) VALUES ('verificateur_clips', 'echec');")
            except Exception:
                pass
        sys.exit(1)
