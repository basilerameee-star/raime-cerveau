"""Installe la competence video dans Hermes et lui ajoute le serveur MCP de WanGP.

Sur le PC de Basile, depuis le depot : python hermes\\competences\\video-wangp\\ajouter_wangp.py
Aucune bibliotheque a installer. Le dossier d'Hermes est calcule comme Hermes le calcule ; la
configuration existante n'est pas touchee (une copie de secours est gardee), et relancer ne double rien.
"""
import os
import re
import shutil
import sys

ICI = os.path.dirname(os.path.abspath(__file__))
NOM = "video-wangp"


def dossier_hermes(plateforme=sys.platform, env=os.environ, maison=None):
    """Comme hermes_constants.py (Hermes, commit d0288be5) : HERMES_HOME s'il est pose ;
    sinon %LOCALAPPDATA%\\hermes sous Windows, ~/.hermes ailleurs."""
    maison = maison or os.path.expanduser("~")
    if env.get("HERMES_HOME", "").strip():
        return os.path.expanduser(os.path.expandvars(env["HERMES_HOME"]))
    if plateforme == "win32":
        base = env.get("LOCALAPPDATA", "").strip() or os.path.join(maison, "AppData", "Local")
        return os.path.join(base, "hermes")
    return os.path.join(maison, ".hermes")


def ajouter_serveur(config, adresse):
    """Ajoute mcp_servers.wangp a config.yaml ; rend 'ajoute' ou 'deja present'."""
    texte = open(config, encoding="utf-8").read() if os.path.exists(config) else ""
    if re.search(r"^\s+wangp:\s*$", texte, re.M):
        return "deja present"
    if texte:
        shutil.copyfile(config, config + ".avant-wangp")
    bloc = f'  wangp:\n    url: "{adresse}"\n'
    if re.search(r"^mcp_servers:\s*$", texte, re.M):
        texte = re.sub(r"^mcp_servers:\s*\n", lambda m: m.group(0) + bloc, texte, count=1, flags=re.M)
    else:
        texte = texte.rstrip("\n") + ("\n\n" if texte else "") + "mcp_servers:\n" + bloc
    os.makedirs(os.path.dirname(config), exist_ok=True)
    with open(config, "w", encoding="utf-8") as f:
        f.write(texte)
    return "ajoute"


def installer(home, adresse):
    cible = os.path.join(home, "skills", NOM)
    os.makedirs(os.path.dirname(cible), exist_ok=True)
    shutil.copytree(ICI, cible, dirs_exist_ok=True,
                    ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    etat = ajouter_serveur(os.path.join(home, "config.yaml"), adresse)
    return cible, etat


if __name__ == "__main__":
    home = dossier_hermes()
    cible, etat = installer(home, os.environ.get("WANGP_MCP_URL", "http://127.0.0.1:7866/mcp"))
    print("competence installee dans :", cible)
    print("serveur WanGP :", etat, "dans", os.path.join(home, "config.yaml"))
