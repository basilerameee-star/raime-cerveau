#!/usr/bin/env python3
"""Le contrôleur est du code de main. Les candidats sont seulement des données.
Le réseau sert à installer les dépendances verrouillées ; il est coupé pendant
TOUTE exécution de code candidat. Aucun jeton ni répertoire du cerveau n'est monté.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import resource
import subprocess
import sys
import tempfile
import uuid

IMAGES = {'node': 'node:22-bookworm-slim', 'python': 'python:3.12-slim-bookworm'}
IMAGES_EXEC = {}
LIMITES = 5 * 1024 * 1024

def verifier_source(racine, p):
    racine = Path(racine)
    fichiers = sorted(racine.rglob('*'))
    if any(f.is_symlink() for f in fichiers):
        raise ValueError('liens symboliques interdits')
    fichiers = [f for f in fichiers if f.is_file()]
    if len(fichiers) > 600 or sum(f.stat().st_size for f in fichiers) > LIMITES:
        raise ValueError('source trop grande')
    for f in fichiers:
        rel = f.relative_to(racine).as_posix()
        if any(s in ('.git', 'node_modules', '.deps', '.npmrc', '.pypirc', '.env') for s in rel.split('/')):
            raise ValueError('configuration ou cache de dépendances interdit')
    if not (racine / p['entree']).is_file():
        raise ValueError('entrée absente')
    if p['langage'] == 'node':
        pkg = json.loads((racine / 'package.json').read_text())
        if any(s in pkg.get('scripts', {}) for s in ('preinstall', 'install', 'postinstall', 'prepare')):
            raise ValueError('hook d’installation interdit')
        if not pkg.get('scripts', {}).get('test'):
            raise ValueError('test amont absent')
        lock = json.loads((racine / 'package-lock.json').read_text())
        if lock.get('lockfileVersion', 0) < 2:
            raise ValueError('verrou npm moderne exigé')
        for nom, v in lock.get('packages', {}).items():
            if not nom: continue
            if v.get('link') or v.get('hasInstallScript') or not v.get('integrity', '').startswith('sha512-'):
                raise ValueError('dépendance sans intégrité ou avec hook')
            if not re.fullmatch(r'https://registry\.npmjs\.org/[^\s]+', v.get('resolved', '')):
                raise ValueError('dépendance hors du registre npm')
        return ['npm', 'ci', '--ignore-scripts', '--no-audit', '--no-fund'], ['npm', 'test', '--ignore-scripts']
    req = racine / 'requirements.txt'
    if req.exists() and req.read_text().strip():
        # Les outils Python sans dépendance sont admissibles dès cette version.
        # Une exigence non verrouillée n'est jamais installée automatiquement.
        raise ValueError('dépendances Python non prises en charge : choisir un outil autonome')
    if not (racine / 'tests').is_dir():
        raise ValueError('tests unittest amont absents')
    return None, ['python', '-m', 'unittest', 'discover', '-s', 'tests']

def lancer(racine, langage, commande, entree=None, reseau='none', writable=False, secondes=60):
    nom = 'raime-outil-' + uuid.uuid4().hex
    uid = os.getuid()
    if uid == 0: raise ValueError('le contrôleur d’outils doit être non privilégié')
    cmd = ['docker', 'run', '--rm', '--name', nom, '--network', reseau,
           '--user', f'{uid}:{os.getgid()}', '--read-only', '--cap-drop', 'ALL',
           '--security-opt', 'no-new-privileges', '--pids-limit', '128',
           '--memory', '512m', '--cpus', '1', '--tmpfs', '/tmp:rw,nosuid,nodev,size=64m',
           '--mount', f'type=bind,source={Path(racine).resolve()},target=/code' + ('' if writable else ',readonly'),
           '--workdir', '/code', '--env', 'HOME=/tmp', '--env', 'CI=1',
           '--env', 'PYTHONDONTWRITEBYTECODE=1', '--env', 'PYTHONPATH=/code',
           '--env', 'NPM_CONFIG_CACHE=/tmp/npm', '-i', IMAGES_EXEC.get(langage, IMAGES[langage])] + commande
    try:
        with tempfile.TemporaryFile() as sortie, tempfile.TemporaryFile() as erreurs:
            data = None if entree is None else json.dumps(entree).encode()
            try:
                r = subprocess.run(cmd, input=data, stdout=sortie, stderr=erreurs, timeout=secondes, check=False,
                    preexec_fn=lambda: resource.setrlimit(resource.RLIMIT_FSIZE, (64000, 64000)))
            except subprocess.TimeoutExpired:
                raise ValueError('outil arrêté : délai dépassé')
            if sortie.tell() > 64000 or erreurs.tell() > 64000:
                raise ValueError('sortie de l’outil trop grande')
            sortie.seek(0); erreurs.seek(0)
            out, err = sortie.read().decode('utf8'), erreurs.read().decode('utf8')
            if r.returncode: raise ValueError(f'outil en échec ({r.returncode}) : {err[-1200:]}')
            return out, err
    finally:
        # Le timeout du client Docker ne garantit pas l'arrêt du conteneur.
        subprocess.run(['docker', 'rm', '-f', nom], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=20, check=False)

def verifier(racine, p):
    installation, tests = verifier_source(racine, p)
    if p['langage'] not in IMAGES_EXEC:
        subprocess.run(['docker', 'pull', IMAGES[p['langage']]], check=True, stdout=subprocess.DEVNULL, timeout=120)
        IMAGES_EXEC[p['langage']] = subprocess.check_output(['docker', 'image', 'inspect', '--format', '{{.Id}}', IMAGES[p['langage']]], text=True).strip()
    image = IMAGES_EXEC[p['langage']]
    # Fixer l'image exacte pour toutes les phases de ce passage.
    if installation: lancer(racine, p['langage'], installation, reseau='bridge', writable=True, secondes=180)
    out, err = lancer(racine, p['langage'], tests, secondes=180)
    texte = out + err
    motif = r'# tests ([1-9][0-9]*)' if p['langage'] == 'node' else r'Ran ([1-9][0-9]*) tests?'
    compte = re.search(motif, texte)
    if not compte: raise ValueError('aucun test amont exécuté avec un compte observable')
    if p['langage'] == 'node' and not re.search(r'# fail 0\b', texte):
        raise ValueError('preuves TAP incomplètes')
    cli = ['node' if p['langage'] == 'node' else 'python', '/code/' + p['entree']] + p.get('arguments', [])
    passes = 0
    for cas in p['cas']:
        out, _ = lancer(racine, p['langage'], cli, entree=cas['entree'], secondes=20)
        if json.loads(out) != cas['attendu']: raise ValueError('cas métier échoué')
        passes += 1
    return {'version': 1, 'passes': passes, 'total': len(p['cas']), 'tests_amont': int(compte.group(1)), 'image': image}

if __name__ == '__main__':
    plan = json.loads(Path('demande-outil.json').read_text())
    p = plan['proposition']
    preuve = verifier('source-outil', p)
    if plan['type'] == 'execution':
        cli = ['node' if p['langage'] == 'node' else 'python', '/code/' + p['entree']] + p.get('arguments', [])
        out, _ = lancer('source-outil', p['langage'], cli, entree=plan['requete']['entree'], secondes=20)
        preuve['sortie'] = json.loads(out)
    Path('preuve-outil.json').write_text(json.dumps(preuve))
