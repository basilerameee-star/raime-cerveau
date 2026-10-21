"""Hermes passe sur DeepSeek V4 Flash, chez DeepSeek même (22/10/2026, décision de Basile : « je veux juste le modèle
DeepSeek V4 Flash […] j'ai envie d'utiliser le modèle lui-même », sans revendeur entre les deux, ni OpenRouter ni Nous).

Hermes a un fournisseur « deepseek » intégré (https://api.deepseek.com/v1, clé DEEPSEEK_API_KEY). Ce script :
  1. lit la clé au coffre (/opt/raime/coffre/secrets.env, nom DEEPSEEK ou DEEPSEEK_API_KEY) sans jamais l'afficher ;
  2. demande à DeepSeek la liste de ses modèles et garde le Flash (deepseek-v4-flash d'abord) ;
  3. fait un VRAI appel d'outil : sans réponse avec appel d'outil, rien ne change ;
  4. sauvegarde puis écrit la clé dans le fichier de clés d.Hermes (hermes-data/.env) et le modèle dans config.yaml ; les relais gratuits restent en secours,
     le modèle local (4 cœurs pour 0,65 mot par seconde) sort de la chaîne ;
  5. redémarre Hermes sans avis à Basile (demande de vidange silencieuse), puis vérifie que Telegram revient.
Essai à blanc : python3 passer_deepseek.py --essai (étapes 1 à 3 seulement).
"""
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.request

COFFRE = "/opt/raime/coffre/secrets.env"
HERMES = "/opt/raime/hermes-data"
API = "https://api.deepseek.com/v1"


def cle():
    for l in open(COFFRE, encoding="utf-8"):
        m = re.match(r"(DEEPSEEK|DEEPSEEK_API_KEY)=(.+)", l.strip())
        if m:
            return m.group(2).strip().strip('"')
    sys.exit("Pas de clé DeepSeek au coffre (nom DEEPSEEK) : rien n'est changé.")


def appel(chemin, k, corps=None):
    req = urllib.request.Request(API + chemin, data=json.dumps(corps).encode() if corps else None,
                                 headers={"Authorization": "Bearer " + k, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.load(r)


def choisir_modele(ids):
    for voulu in ("deepseek-v4-flash", "deepseek-v4.1-flash", "deepseek-flash"):
        if voulu in ids:
            return voulu
    flash = [i for i in ids if "flash" in i]
    return flash[0] if flash else None


def essai_outil(k, modele):
    t = time.time()
    r = appel("/chat/completions", k, {"model": modele, "max_tokens": 200, "messages": [
        {"role": "user", "content": "Quelle heure est-il à Genève ? Utilise l'outil."}],
        "tools": [{"type": "function", "function": {"name": "heure", "description": "Donne l'heure d'une ville",
                                                    "parameters": {"type": "object", "properties": {"ville": {"type": "string"}}, "required": ["ville"]}}}]})
    m = r["choices"][0]["message"]
    ok = bool(m.get("tool_calls")) and m["tool_calls"][0]["function"]["name"] == "heure"
    return ok, round(time.time() - t, 1), r.get("usage", {})


def poser(k, modele):
    jour = time.strftime("%Y-%m-%d")
    # le fichier de clés d'Hermes lui-même (/opt/data/.env) : relu à chaque démarrage, il passe avant l'environnement du
    # conteneur (hermes.env n'est lu qu'à sa création) ; propriétaire 1000, lisible par lui seul
    env = os.path.join(HERMES, ".env")
    cfg = os.path.join(HERMES, "config.yaml")
    for f in (env, cfg):
        shutil.copy2(f, "%s.avant-deepseek-%s" % (f, jour))
    lignes = [l for l in open(env, encoding="utf-8").read().splitlines() if not l.startswith("DEEPSEEK_API_KEY=")]
    open(env, "w", encoding="utf-8").write("\n".join(lignes + ["DEEPSEEK_API_KEY=" + k]) + "\n")
    t = open(cfg, encoding="utf-8").read()
    t = re.sub(r'model:\n  provider: "[^"]*"\n  default: "[^"]*"',
               'model:\n  # 22/10/2026 : DeepSeek V4 Flash chez DeepSeek même (décision de Basile), les relais gratuits en secours\n'
               '  provider: "deepseek"\n  default: "%s"' % modele, t, count=1)
    t = re.sub(r"  - provider: local\n    model: qwen3:4b\n    base_url: http://raime-ollama:11434/v1\n", "", t)
    import yaml
    yaml.safe_load(t)
    open(cfg, "w", encoding="utf-8").write(t)
    for f in (env, cfg):
        os.chown(f, 1000, 1000)
    os.chmod(env, 0o600)


def redemarrer():
    code = ("from gateway.drain_control import write_drain_request\n"
            "write_drain_request(principal='claude-livraison', suppress_notification=True)\n")
    open("/tmp/vidange.py", "w").write(code)
    subprocess.run(["docker", "cp", "/tmp/vidange.py", "raime-hermes:/tmp/vidange.py"], check=True)
    subprocess.run(["docker", "exec", "-u", "1000", "-e", "HERMES_HOME=/opt/data", "raime-hermes", "/opt/hermes/.venv/bin/python", "/tmp/vidange.py"], check=True)
    time.sleep(3)
    subprocess.run(["docker", "restart", "raime-hermes"], check=True, capture_output=True)
    time.sleep(35)
    logs = subprocess.run(["docker", "logs", "--since", "60s", "raime-hermes"], capture_output=True, text=True)
    return "Connected to Telegram" in (logs.stdout + logs.stderr)


def main():
    k = cle()
    ids = [m["id"] for m in appel("/models", k).get("data", [])]
    print("modèles DeepSeek :", ", ".join(ids))
    modele = choisir_modele(ids)
    if not modele:
        sys.exit("Aucun modèle Flash chez DeepSeek : rien n'est changé.")
    ok, s, usage = essai_outil(k, modele)
    print("appel d'outil avec %s : %s en %s s (%s jetons)" % (modele, "réussi" if ok else "ÉCHEC", s, usage.get("total_tokens")))
    if not ok:
        sys.exit("Appel d'outil raté : rien n'est changé.")
    if "--essai" in sys.argv:
        return
    poser(k, modele)
    print("Hermes redémarré, Telegram revenu :", redemarrer())


if __name__ == "__main__":
    main()
