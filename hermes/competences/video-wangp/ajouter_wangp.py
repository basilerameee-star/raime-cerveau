"""Ajoute le serveur MCP de WanGP a la configuration d'Hermes (une fois, avec copie de secours).

Sur le PC de Basile : python ajouter_wangp.py
Aucune bibliotheque a installer ; le reste du fichier de configuration n'est pas touche.
"""
import os
import re
import shutil

HOME = os.environ.get("HERMES_HOME") or os.path.join(os.path.expanduser("~"), ".hermes")
CONFIG = os.path.join(HOME, "config.yaml")
ADRESSE = os.environ.get("WANGP_MCP_URL", "http://127.0.0.1:7866/mcp")
BLOC = f'  wangp:\n    url: "{ADRESSE}"\n'

texte = open(CONFIG, encoding="utf-8").read() if os.path.exists(CONFIG) else ""
if re.search(r"^\s+wangp:\s*$", texte, re.M):
    print("deja present dans", CONFIG)
else:
    if texte:
        shutil.copyfile(CONFIG, CONFIG + ".avant-wangp")
    if re.search(r"^mcp_servers:\s*$", texte, re.M):
        texte = re.sub(r"^mcp_servers:\s*\n", lambda m: m.group(0) + BLOC, texte, count=1, flags=re.M)
    else:
        texte = texte.rstrip("\n") + ("\n\n" if texte else "") + "mcp_servers:\n" + BLOC
    os.makedirs(HOME, exist_ok=True)
    open(CONFIG, "w", encoding="utf-8").write(texte)
    print("ajoute :", ADRESSE, "dans", CONFIG)
