# -*- coding: utf-8 -*-
"""Le chercheur de campagnes Whop (02/10/2026), chaque matin sur le serveur, sans Claude, sans frais.

1. lit Content Rewards (page Discover puis la fiche des meilleures candidates) dans le navigateur du serveur ;
   la lecture se fait sans connexion : aucune dépendance à la session Whop ;
2. Gemini gratuit en tire les campagnes et dit lesquelles collent à la niche du pôle (streamers pour KinGKlip) ;
3. garde celles qui passent la grille (clippeur/selection.json) : 1 $ / 1 000 vues au moins (ou paiement par publication),
   budget restant ≥ 500 $, jamais de jeux d'argent, de contenu adulte ni de politique ; classe par budget restant puis prix ;
4. lit la fiche des 3 meilleures : règles (Content requirements), liens des vidéos (Reference materials), prix par plateforme ;
5. les propose à Basile par e-mail (numérotées) et sur Jarvis (table campagnes_proposees). Basile répond « 1 », « 2 » ou
   « 3 » : clippeur/reponses.py lance alors la découpe tout seul.
"""
import json
import re
import subprocess
import sys

sys.path.insert(0, "/opt/raime/clippeur")
from file import sql, prevenir, cle_gemini
from clippeur import gemini

NICHE = "streamers et créateurs de contenu en live (N3on, Kai Cenat, IShowSpeed, Adin Ross…), leurs shows, défis et vlogs, célébrités d'internet"
EXCLUS = "jeux d'argent (casino, paris, crypto-casino comme Shuffle, Stake), contenu adulte, politique"
VIDEO = ("youtu", "drive.google", "dropbox", "vimeo", "twitch", "kick.com", "streamable", "frame.io")


def lire(*args):
    subprocess.run(["docker", "cp", "/opt/raime/clippeur/whop_lire.py", "raime-envoyeur:/tmp/whop_lire.py"], check=True)
    r = subprocess.run(["docker", "exec", "-e", "DISPLAY=:99", "raime-envoyeur", "python", "/tmp/whop_lire.py"] + list(args),
                       capture_output=True, text=True, timeout=1200)
    lignes = [l for l in r.stdout.splitlines() if l.startswith("{")]
    return json.loads(lignes[-1]) if lignes else {}


def nombre(x):
    try:
        return float(re.sub(r"[^0-9.]", "", str(x)) or 0)
    except ValueError:
        return 0.0


def main():
    texte = lire("liste").get("texte", "")
    if len(texte) < 300:
        prevenir("chercheur de campagnes : page illisible", "La page Content Rewards n'a pas pu être lue ce matin. Je réessaie demain.")
        return
    campagnes = gemini(
        "Voici le texte de la page « Discover » de Whop Content Rewards. Extrais chaque campagne, sans rien inventer. "
        "Dis si elle colle à cette niche : " + NICHE + ". Dis si elle relève de : " + EXCLUS + ".\n"
        "Réponds en JSON : [{\"nom\": \"le titre exact tel qu'écrit\", \"marque\": \"\", \"budget_restant\": dollars (nombre), "
        "\"cpm\": dollars pour 1 000 vues (nombre, 0 si paiement par publication), \"par_publication\": dollars ou 0, "
        "\"candidature\": true si « Application », \"niche\": true ou false, \"exclue\": true ou false}]\n\n" + texte[:40000],
        cle_gemini())
    bons = [c for c in campagnes if isinstance(c, dict) and c.get("niche") and not c.get("exclue")
            and nombre(c.get("budget_restant")) >= 500 and (nombre(c.get("cpm")) >= 1 or nombre(c.get("par_publication")) > 0)]
    bons.sort(key=lambda c: (-nombre(c.get("budget_restant")), -nombre(c.get("cpm"))))
    fiches = {f["nom"]: f for f in lire("fiche", *[c["nom"] for c in bons[:5]]).get("fiches", [])} if bons else {}
    retenues = []
    for c in bons[:5]:
        f = fiches.get(c["nom"], {})
        if not f.get("texte"):
            continue
        d = gemini(
            "Voici la fiche d'une campagne Whop Content Rewards et ses liens. Sans rien inventer, réponds en JSON : "
            "{\"exclue\": true si " + EXCLUS + ", \"rejoindre\": true si un bouton « Join Campaign » est présent, "
            "\"regles\": \"les Content requirements et consignes, résumés en français, phrases courtes\", "
            "\"paiement\": \"prix pour 1 000 vues, minimum et maximum par clip, par plateforme, en une ligne\", "
            "\"approbation\": \"taux d'approbation s'il est affiché, sinon vide\", \"validation\": \"délai moyen de validation s'il est affiché, sinon vide\"}\n\n"
            + f["texte"] + "\n\nLIENS : " + json.dumps(f.get("liens", []), ensure_ascii=False), cle_gemini())
        if isinstance(d, list):                             # Gemini rend parfois une liste d'un seul élément
            d = next((x for x in d if isinstance(x, dict)), {})
        if d.get("exclue"):
            continue
        videos = [h for _, h in f.get("liens", []) if any(v in h for v in VIDEO)]
        retenues.append(dict(c, **d, fiche=f["texte"], url_fiche=f.get("url", ""), videos=videos))
        if len(retenues) == 3:
            break
    sql("""CREATE TABLE IF NOT EXISTS campagnes_proposees (id serial PRIMARY KEY, le date NOT NULL DEFAULT current_date,
           rang int, nom text, marque text, budget_restant numeric, cpm numeric, par_publication numeric, candidature boolean,
           pourquoi text, UNIQUE (le, nom));
           ALTER TABLE campagnes_proposees ADD COLUMN IF NOT EXISTS fiche text, ADD COLUMN IF NOT EXISTS videos text,
             ADD COLUMN IF NOT EXISTS url_fiche text, ADD COLUMN IF NOT EXISTS lancee boolean NOT NULL DEFAULT false;
           DELETE FROM campagnes_proposees WHERE le = current_date AND NOT lancee;""")
    for i, c in enumerate(retenues, 1):
        sql("""INSERT INTO campagnes_proposees (rang, nom, marque, budget_restant, cpm, par_publication, candidature, pourquoi, fiche, videos, url_fiche)
               VALUES (:p0, :'p1', :'p2', :p3, :p4, :p5, :p6, :'p7', :'p8', :'p9', :'p10') ON CONFLICT (le, nom) DO NOTHING;""",
            i, c.get("nom", ""), c.get("marque", ""), nombre(c.get("budget_restant")), nombre(c.get("cpm")),
            nombre(c.get("par_publication")), "true" if c.get("candidature") else "false", c.get("regles", "")[:300],
            c.get("fiche", "")[:12000], json.dumps(c["videos"]), c.get("url_fiche", ""))
    if not retenues:
        print(len(campagnes), "lues, aucune retenue")
        return
    blocs = []
    for i, c in enumerate(retenues, 1):
        blocs.append("%d. %s (%s)\n   %s $ restants · %s%s\n   Paiement : %s\n   Règles : %s\n   Approbation : %s · Validation : %s\n   Vidéos : %s" % (
            i, c.get("nom"), c.get("marque"), int(nombre(c.get("budget_restant"))),
            "%s $ / 1 000 vues" % c.get("cpm") if nombre(c.get("cpm")) else "%s $ par publication" % c.get("par_publication"),
            " · sur candidature" if c.get("candidature") else (" · à rejoindre (Join Campaign)" if c.get("rejoindre") else ""),
            c.get("paiement", ""), c.get("regles", ""), c.get("approbation") or "non affiché", c.get("validation") or "non affiché",
            ", ".join(c["videos"][:3]) or "aucun lien de vidéo trouvé"))
    prevenir("3 campagnes proposées pour KinGKlip",
             "\n\n".join(blocs) + "\n\nRéponds à cet e-mail avec le numéro choisi (« 1 », « 2 » ou « 3 ») : la découpe se lance toute seule, "
             "puis les clips partent dans Buffer. Si la campagne est « à rejoindre », clique d'abord sur « Join Campaign » dans Whop.\n"
             "(%d campagnes lues, %d dans la niche et la grille.)" % (len(campagnes), len(bons)))
    print(len(campagnes), "campagnes lues,", len(bons), "dans la grille,", len(retenues), "proposées")


if __name__ == "__main__":
    main()
