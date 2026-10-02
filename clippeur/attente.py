# -*- coding: utf-8 -*-
"""Les vidéos YouTube que le serveur attend (02/10/2026) : une ligne JSON par demande en attente de sa source.
Lu par la tâche du PC de Basile (clippeur/pc_sources.py), qui télécharge et dépose sources/<campagne>.mp4."""
import json
import os
import sys

sys.path.insert(0, "/opt/raime/clippeur")
from file import sql, CLIPS

r = sql("""SELECT coalesce(json_agg(json_build_object('campagne', campagne, 'url', url)), '[]') FROM clips_demandes
           WHERE etat = 'a_faire' AND (url LIKE '%youtube.com%' OR url LIKE '%youtu.be%');""")
liste = json.loads(r[r.index("["):] if "[" in r else "[]")      # json_agg s'étale sur plusieurs lignes
print(json.dumps([d for d in liste if not os.path.isfile(os.path.join(CLIPS, "sources", d["campagne"] + ".mp4"))]))
