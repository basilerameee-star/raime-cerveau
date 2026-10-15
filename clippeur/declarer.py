"""La déclaration des clips KinGKlip à Content Rewards (15/10/2026, accord écrit de Basile dans la session) : chaque lien
publié (clips_publies, noté par buffer.py 2 à 12 minutes après la publication) part dans SA campagne, sous 30 minutes
(règle Reach), par l'agent du navigateur du serveur (cr_agent.py soumettre), avec la session de Basile. La déclaration
n'est notée faite (declare_whop) que si le lien se relit sur la page de la campagne. Cron toutes les 3 minutes :
    */3 * * * * cd /opt/raime/clippeur && /usr/bin/python3 declarer.py >> /opt/raime/clippeur/declarer.log 2>&1
"""
import fcntl
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cr_lanceur                                           # noqa: E402

VERROU = "/tmp/clippeur-declarer.lock"
# posé une fois les comptes KinGKlip reliés à Content Rewards (vérifié) : sans eux, chaque déclaration serait rejetée
ACTIF = os.path.join(os.path.dirname(os.path.abspath(__file__)), "declarer-actif")
ESSAIS_MAX = 5
PAR_PASSAGE = 4


def a_declarer(sql):
    sql("""ALTER TABLE clips_publies ADD COLUMN IF NOT EXISTS declare_whop boolean, ADD COLUMN IF NOT EXISTS declare_le timestamptz,
           ADD COLUMN IF NOT EXISTS declare_essais int NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS declare_note text;""")
    r = sql("""SELECT coalesce(json_agg(x), '[]') FROM (SELECT p.campagne, p.clip, p.plateforme, p.lien, p.declare_essais,
               (SELECT d.cr_id FROM clips_demandes d WHERE d.campagne = p.campagne AND d.cr_id IS NOT NULL ORDER BY d.id DESC LIMIT 1) AS cr_id
               FROM clips_publies p WHERE NOT coalesce(p.declare_whop, false) AND p.declare_essais < %d
               AND p.publie_le > now() - interval '25 minutes' ORDER BY p.publie_le LIMIT %d) x WHERE x.cr_id IS NOT NULL;""" % (ESSAIS_MAX, PAR_PASSAGE))
    return json.loads(r[r.index("["):] if "[" in r else "[]")


def noter(sql, c, r):
    """Le résultat d'une déclaration ; (fait ?, abandon ?)."""
    if r.get("ok") and r.get("verifie"):
        sql("""UPDATE clips_publies SET declare_whop = true, declare_le = now(), declare_note = 'relu dans les déclarations du compte'
               WHERE campagne = :'p0' AND clip = :'p1' AND plateforme = :'p2';""", c["campagne"], c["clip"], c["plateforme"])
        return True, False
    if r.get("bloque"):                                     # captcha, session : rien n'est compté, l'alerte part une fois
        return False, False
    sql("""UPDATE clips_publies SET declare_essais = declare_essais + 1, declare_note = :'p3'
           WHERE campagne = :'p0' AND clip = :'p1' AND plateforme = :'p2';""",
        c["campagne"], c["clip"], c["plateforme"], (r.get("raison") or "réponse vide de l'agent")[:300])
    return False, c["declare_essais"] + 1 >= ESSAIS_MAX


def main(sql=None, prevenir=None, lanceur=cr_lanceur):
    if sql is None:
        from file import sql, prevenir                     # noqa: F811  (serveur seulement)
    verrou = open(VERROU, "w")
    try:
        fcntl.flock(verrou, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        return
    if not os.path.exists(ACTIF):
        return
    if not lanceur.pret():
        lanceur.alerter_si_bloque(prevenir)
        return
    for c in a_declarer(sql):
        r = (lanceur.lancer("soumettre", c["cr_id"], c["lien"], delai=300) or [{}])[0]
        fait, abandon = noter(sql, c, r)
        print(time.strftime("%Y-%m-%d %H:%M"), c["campagne"], c["plateforme"], c["lien"], "déclaré" if fait else r.get("raison", "?"), flush=True)
        if abandon:
            prevenir("clip non déclaré : " + c["campagne"], "L'agent n'a pas réussi à déclarer ce lien en %d essais :\n%s\nDernière raison : %s\n"
                     "À déclarer à la main dans Content Rewards (« Submit »)." % (ESSAIS_MAX, c["lien"], r.get("raison", "?")))
        if r.get("bloque"):
            lanceur.alerter_si_bloque(prevenir)
            return


if __name__ == "__main__":
    main()
