"""Importe des compétences (skills) reconnues de GitHub dans hermes/competences/, pour Hermes (les mains de Jarvis).

    python3 tools/importer_competences.py <depot-clone> <sous-dossier-des-skills> <nom-du-paquet> <depot> <licence>

Ce qui est fait, et pourquoi :
- chaque SKILL.md trouvé (récursivement) est copié avec ses fichiers ; les tests, caches et dépôts git sont écartés ;
- la description (frontmatter) est ramenée à sa première phrase, 200 caractères au plus : Hermes liste la description
  de TOUTES ses compétences dans chaque demande ; les descriptions d'origine (jusqu'à 700 caractères chacune)
  ajoutaient ~11 000 jetons par demande et faisaient déborder le modèle local. Le texte complet de la compétence
  est intact : Hermes le lit quand il la charge ;
- les chemins propres à Claude Code (${CLAUDE_PLUGIN_ROOT}/.claude/skills/) deviennent ceux d'Hermes (/opt/data/skills/) ;
- SOURCE.md note le dépôt, le commit, la licence et la date d'import (relancer l'outil met à jour).
"""
import os
import re
import shutil
import subprocess
import sys
from datetime import date

ECARTES = shutil.ignore_patterns('.git', 'tests', 'test', '__pycache__', '*.pyc', 'node_modules', '.DS_Store')
MAX = 200


def courte(description):
    d = ' '.join(description.split())
    phrase = re.split(r'(?<=[.!?])\s', d, maxsplit=1)[0]
    return phrase if len(phrase) <= MAX else phrase[:MAX - 1].rstrip() + '…'


def raccourcir(chemin):
    s = open(chemin, encoding='utf-8').read()
    m = re.match(r'^---\n(.*?)\n---\n', s, re.S)
    if not m:
        return
    tete = m.group(1)
    d = re.search(r'^description:[ \t]*(.*?)(?=^\S[^\n]*:|\Z)', tete, re.M | re.S)
    if not d:
        return
    brut = d.group(1).strip()
    if brut.startswith(('>', '|')):
        brut = brut[1:]
    brut = brut.strip().strip('"\'')
    nouvelle = 'description: "' + courte(brut).replace('\\', '\\\\').replace('"', '\\"') + '"\n'
    tete = tete[:d.start()] + nouvelle + tete[d.end():]
    # Les chemins propres à Claude Code deviennent ceux d'Hermes (ses compétences vivent dans /opt/data/skills).
    corps = s[m.end():].replace('${CLAUDE_PLUGIN_ROOT}/.claude/skills/', '/opt/data/skills/')
    open(chemin, 'w', encoding='utf-8').write('---\n' + tete.rstrip('\n') + '\n---\n' + corps)


def importer(clone, sous, paquet, depot, licence, destination):
    racine = os.path.join(clone, sous)
    cible = os.path.join(destination, paquet)
    if os.path.exists(cible):
        shutil.rmtree(cible)
    if os.path.isfile(os.path.join(racine, 'SKILL.md')):
        shutil.copytree(racine, cible, ignore=ECARTES)
    else:
        for d, _, fichiers in os.walk(racine):
            if 'SKILL.md' in fichiers and '.git' not in d.split(os.sep):
                rel = os.path.relpath(d, racine)
                if any(os.path.isfile(os.path.join(racine, p, 'SKILL.md')) for p in parents(rel)):
                    continue  # déjà copié avec son parent
                shutil.copytree(d, os.path.join(cible, rel), ignore=ECARTES)
    n = 0
    for d, _, fichiers in os.walk(cible):
        if 'SKILL.md' in fichiers:
            raccourcir(os.path.join(d, 'SKILL.md'))
            n += 1
    commit = subprocess.run(['git', '-C', clone, 'log', '-1', '--format=%h %cs'], capture_output=True, text=True).stdout.strip()
    with open(os.path.join(cible, 'SOURCE.md'), 'w', encoding='utf-8') as f:
        f.write(f'# Source\n\n- Dépôt : https://github.com/{depot}\n- Commit : {commit}\n- Licence : {licence}\n'
                f'- Importé le {date.today().isoformat()} par tools/importer_competences.py ({n} compétences).\n'
                '- Modification : la description de chaque compétence est ramenée à une phrase (liste d’Hermes plus légère) ;\n'
                '  le texte des compétences est celui d’origine. Tests et fichiers de développement écartés.\n')
    return n


def parents(rel):
    morceaux = rel.split(os.sep)
    return [os.sep.join(morceaux[:i]) for i in range(1, len(morceaux))]


if __name__ == '__main__':
    clone, sous, paquet, depot, licence = sys.argv[1:6]
    dest = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'hermes', 'competences')
    print(paquet, ':', importer(clone, sous, paquet, depot, licence, dest), 'compétences')
