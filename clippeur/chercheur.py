# -*- coding: utf-8 -*-
"""Le chercheur de campagnes Whop (02/10/2026), chaque matin sur le serveur, sans Claude, sans frais.

1. lit Content Rewards dans le navigateur du serveur, avec la session Whop de Basile (whop_lire.py dans raime-envoyeur) ;
2. Gemini gratuit en tire les campagnes (nom, marque, budget, prix pour 1 000 vues, type) et dit lesquelles collent
   à la niche du pôle (streamers pour KinGKlip) ;
3. garde celles qui passent la grille (clippeur/selection.json : 1 $ / 1 000 vues au moins, budget restant ≥ 500 $),
   classe par budget restant puis prix, et propose les 3 meilleures à Basile par e-mail et sur Jarvis (table
   campagnes_proposees). Le taux d'approbation et le délai de validation (fiche de chaque campagne) : version 2.
Basile rejoint la campagne choisie et dépose son brief sur /clips (réponse par e-mail qui déclenche tout : version 2).
"""
import json
import os
import subprocess
import sys

sys.path.insert(0, "/opt/raime/clippeur")
from file import sql, prevenir, cle_gemini
from clippeur import gemini

NICHE = "streamers et créateurs de contenu en live (N3on, Kai Cenat, IShowSpeed, Adin Ross…), leurs shows, défis et vlogs, célébrités d'internet"


def lire():
    subprocess.run(["docker", "cp", "/opt/raime/clippeur/whop_lire.py", "raime-envoyeur:/tmp/whop_lire.py"], check=True)
    r = subprocess.run(["docker", "exec", "-e", "DISPLAY=:99", "raime-envoyeur", "python", "/tmp/whop_lire.py"],
                       capture_output=True, text=True, timeout=600)
    return r.stdout


def main():
    texte = lire()
    if len(texte) < 300:
        prevenir("chercheur de campagnes : page illisible",
                 "La page Content Rewards n'a pas pu être lue (session Whop expirée ?). Reconnecte-toi dans le navigateur du serveur.")
        return
    campagnes = gemini(
        "Voici le texte de la page « Discover » de Whop Content Rewards. Extrais chaque campagne, sans rien inventer. "
        "Pour chacune dis aussi si elle colle à cette niche : " + NICHE + ".\n"
        "Réponds en JSON : [{\"nom\": \"\", \"marque\": \"\", \"budget_restant\": dollars (nombre), \"budget_total\": dollars, "
        "\"cpm\": dollars pour 1 000 vues (nombre, 0 si paiement par publication), \"par_publication\": dollars ou 0, "
        "\"candidature\": true si « Application », \"niche\": true ou false, \"pourquoi\": \"5 mots\"}]\n\n" + texte[:40000],
        cle_gemini())
    bons = [c for c in campagnes if isinstance(c, dict) and c.get("niche") and float(c.get("budget_restant") or 0) >= 500
            and (float(c.get("cpm") or 0) >= 1 or float(c.get("par_publication") or 0) > 0)]
    bons.sort(key=lambda c: (-float(c.get("budget_restant") or 0), -float(c.get("cpm") or 0)))
    top = bons[:3]
    sql("""CREATE TABLE IF NOT EXISTS campagnes_proposees (id serial PRIMARY KEY, le date NOT NULL DEFAULT current_date,
           rang int, nom text, marque text, budget_restant numeric, cpm numeric, par_publication numeric, candidature boolean,
           pourquoi text, UNIQUE (le, nom));""")
    for i, c in enumerate(top, 1):
        sql("""INSERT INTO campagnes_proposees (rang, nom, marque, budget_restant, cpm, par_publication, candidature, pourquoi)
               VALUES (:p0, :'p1', :'p2', :p3, :p4, :p5, :p6, :'p7') ON CONFLICT (le, nom) DO NOTHING;""",
            i, c.get("nom", ""), c.get("marque", ""), float(c.get("budget_restant") or 0), float(c.get("cpm") or 0),
            float(c.get("par_publication") or 0), "true" if c.get("candidature") else "false", c.get("pourquoi", ""))
    if top:
        lignes = ["%d. %s (%s) : %s $ restants, %s $ / 1 000 vues%s%s" % (
            i, c.get("nom"), c.get("marque"), int(float(c.get("budget_restant") or 0)), c.get("cpm"),
            ", %s $ par publication" % c["par_publication"] if float(c.get("par_publication") or 0) else "",
            " (sur candidature)" if c.get("candidature") else "") for i, c in enumerate(top, 1)]
        prevenir("3 campagnes proposées pour KinGKlip",
                 "\n".join(lignes) + "\n\nAvant de rejoindre : vérifie sur la fiche le taux d’approbation (30 %% au moins) et le délai "
                 "de validation (48 h au plus). Puis rejoins-la dans Whop et dépose son brief sur la page Clips.\n"
                 "(%d campagnes lues, %d dans la niche et la grille.)" % (len(campagnes), len(bons)))
    print(len(campagnes), "campagnes lues,", len(bons), "retenues")


if __name__ == "__main__":
    main()
