#!/usr/bin/env python3
"""LA PORTE, CÔTÉ WEB : elle reçoit les versions que GitHub livre, sans aucun secret partagé.

Pourquoi : la première porte demandait une clé privée copiée à la main dans les secrets
GitHub. Basile ne manipule pas de clés, et une clé qui dort quelque part peut fuir.

Comment : à chaque livraison, GitHub fabrique un jeton signé (OIDC) qui dit QUI livre :
quel dépôt, quelle branche, quelle action. Ce programme vérifie la signature avec la clé
PUBLIQUE de GitHub, puis chaque affirmation du jeton. Seule l'action « Livraison » du dépôt
raime-cerveau, sur main, après le banc d'essai, peut déposer une version. Il la passe
alors à porte.sh, qui fait le reste et revient seul en arrière en cas d'échec.

Il n'écoute que sur le réseau interne de Docker : Caddy lui transmet
https://cockpit.raime.fr/porte/… ; rien d'autre ne peut l'atteindre.

Aucune dépendance : la bibliothèque standard de Python suffit, vérification RSA comprise.
"""
import base64, hashlib, hmac, json, os, re, subprocess, sys, tempfile, threading, time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

ECOUTE = os.environ.get('PORTE_ECOUTE', '172.18.0.1')
PORT = int(os.environ.get('PORTE_PORT', '8765'))
MAISON = os.environ.get('PORTE_MAISON', '/opt/raime/porte')
SCRIPT = os.environ.get('PORTE_SCRIPT', os.path.join(MAISON, 'porte.sh'))
TAILLE_MAX = 200 * 1024 * 1024

EMETTEUR = 'https://token.actions.githubusercontent.com'
JWKS_URL = EMETTEUR + '/.well-known/jwks'
AUDIENCE = 'raime-porte'
DEPOT = os.environ.get('PORTE_DEPOT', 'basilerameee-star/raime-cerveau')
BRANCHE = 'refs/heads/main'
ACTION = f'{DEPOT}/.github/workflows/deployer.yml@{BRANCHE}'
EVENEMENTS = {'push', 'workflow_dispatch'}

_cles, _cles_le, _verrou_cles = {}, 0.0, threading.Lock()
_jetons_vus, _verrou_jetons = {}, threading.Lock()


def journal(texte):
    ligne = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()) + ' [web] ' + texte
    print(ligne, flush=True)
    try:
        with open(os.path.join(MAISON, 'journal.log'), 'a', encoding='utf-8') as f:
            f.write(ligne + '\n')
    except OSError:
        pass


def b64url(s):
    return base64.urlsafe_b64decode(s + '=' * (-len(s) % 4))


def cles_github(kid):
    """Les clés publiques de GitHub, gardées une heure ; relues si une clé inconnue se présente."""
    global _cles, _cles_le
    with _verrou_cles:
        if kid not in _cles or time.time() - _cles_le > 3600:
            if time.time() - _cles_le > 60 or not _cles:
                with urllib.request.urlopen(JWKS_URL, timeout=10) as r:
                    jwks = json.load(r)
                _cles = {k['kid']: k for k in jwks.get('keys', []) if k.get('kty') == 'RSA'}
                _cles_le = time.time()
        return _cles.get(kid)


def signature_rs256_valide(message, signature, n, e):
    """RSASSA-PKCS1-v1_5 avec SHA-256 : on reconstruit l'empreinte attendue, octet pour
    octet, et on la compare à celle que la signature révèle. Aucun découpage à interpréter,
    donc aucune faille de lecture."""
    k = (n.bit_length() + 7) // 8
    if len(signature) != k:
        return False
    s = int.from_bytes(signature, 'big')
    if s >= n:
        return False
    revele = pow(s, e, n).to_bytes(k, 'big')
    empreinte = bytes.fromhex('3031300d060960864801650304020105000420') + hashlib.sha256(message).digest()
    attendu = b'\x00\x01' + b'\xff' * (k - len(empreinte) - 3) + b'\x00' + empreinte
    return hmac.compare_digest(revele, attendu)


def verifier_jeton(jeton, sha, maintenant=None, cles=cles_github):
    """Rend les affirmations du jeton si tout est juste ; lève ValueError sinon."""
    maintenant = maintenant or time.time()
    try:
        tete_b64, corps_b64, sig_b64 = jeton.split('.')
        tete, corps = json.loads(b64url(tete_b64)), json.loads(b64url(corps_b64))
        signature = b64url(sig_b64)
    except Exception:
        raise ValueError('jeton illisible')
    if tete.get('alg') != 'RS256':
        raise ValueError('algorithme refusé')
    cle = cles(tete.get('kid', ''))
    if not cle:
        raise ValueError('clé de signature inconnue')
    n = int.from_bytes(b64url(cle['n']), 'big')
    e = int.from_bytes(b64url(cle['e']), 'big')
    if e != 65537 or n.bit_length() < 2048:
        raise ValueError('clé de signature trop faible')
    if not signature_rs256_valide(f'{tete_b64}.{corps_b64}'.encode(), signature, n, e):
        raise ValueError('signature fausse')
    attendu = {'iss': EMETTEUR, 'aud': AUDIENCE, 'repository': DEPOT, 'ref': BRANCHE,
               'job_workflow_ref': ACTION, 'sha': sha}
    for champ, valeur in attendu.items():
        if corps.get(champ) != valeur:
            raise ValueError(f'{champ} inattendu : {corps.get(champ)!r}')
    if corps.get('event_name') not in EVENEMENTS:
        raise ValueError(f"événement refusé : {corps.get('event_name')!r}")
    if not (corps.get('nbf', 0) - 60 <= maintenant < corps.get('exp', 0)):
        raise ValueError('jeton périmé ou pas encore valable')
    # Le dépôt est épinglé par son numéro dès le premier passage : un dépôt recréé sous le
    # même nom ne serait plus le même.
    fichier_id = os.path.join(MAISON, 'depot_id')
    depot_id = str(corps.get('repository_id', ''))
    if os.path.exists(fichier_id):
        with open(fichier_id) as f:
            epingle = f.read().strip()
        if epingle != depot_id:
            raise ValueError('numéro de dépôt différent de celui épinglé')
    elif depot_id:
        with open(fichier_id, 'w') as f:
            f.write(depot_id)
    # Un jeton ne sert qu'une fois.
    jti = corps.get('jti', '')
    with _verrou_jetons:
        for vieux in [j for j, t in _jetons_vus.items() if t < maintenant - 3600]:
            del _jetons_vus[vieux]
        if not jti or jti in _jetons_vus:
            raise ValueError('jeton déjà utilisé')
        _jetons_vus[jti] = maintenant
    return corps


class Porte(BaseHTTPRequestHandler):
    server_version = 'porte-raime'
    sys_version = ''

    def log_message(self, *args):
        pass  # le journal de la porte suffit ; aucune adresse ni jeton n'y est écrit

    def repondre(self, code, texte):
        corps = (texte + '\n').encode()
        self.send_response(code)
        self.send_header('Content-Type', 'text/plain; charset=utf-8')
        self.send_header('Content-Length', str(len(corps)))
        self.end_headers()
        self.wfile.write(corps)

    def do_GET(self):
        if urlparse(self.path).path == '/porte/sante':
            return self.repondre(200, 'porte prête')
        return self.repondre(404, 'inconnu')

    def do_POST(self):
        url = urlparse(self.path)
        if url.path not in ('/porte/livrer', '/porte/etat'):
            return self.repondre(404, 'inconnu')
        sha = (parse_qs(url.query).get('sha') or [''])[0]
        if not re.fullmatch(r'[0-9a-f]{40}', sha):
            return self.repondre(400, 'sha invalide')
        auth = self.headers.get('Authorization', '')
        if not auth.startswith('Bearer '):
            return self.repondre(401, 'jeton absent')
        try:
            corps = verifier_jeton(auth[7:].strip(), sha)
        except Exception as e:
            journal(f'REFUS : {e}')
            return self.repondre(403, f'refusé : {e}')

        if url.path == '/porte/etat':
            r = subprocess.run([SCRIPT, 'etat'], capture_output=True, text=True, timeout=700)
            return self.repondre(200, r.stdout + r.stderr + f'code={r.returncode}')

        taille = int(self.headers.get('Content-Length') or 0)
        if not 0 < taille <= TAILLE_MAX:
            return self.repondre(413, 'taille refusée')
        journal(f"livraison acceptée : {sha[:12]} ({corps.get('event_name')}, par {corps.get('actor', '?')})")
        with tempfile.TemporaryFile(dir=MAISON) as archive:
            reste = taille
            while reste:
                morceau = self.rfile.read(min(reste, 1 << 20))
                if not morceau:
                    return self.repondre(400, 'archive incomplète')
                archive.write(morceau)
                reste -= len(morceau)
            archive.seek(0)
            # La réponse coule au fil du déploiement : GitHub voit chaque étape.
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain; charset=utf-8')
            self.send_header('Connection', 'close')
            self.end_headers()
            p = subprocess.Popen([SCRIPT, 'deployer', sha], stdin=archive,
                                 stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
            for ligne in p.stdout:
                try:
                    self.wfile.write(ligne)
                    self.wfile.flush()
                except OSError:
                    pass  # GitHub a raccroché : le déploiement va quand même jusqu'au bout
            code = p.wait()
        journal(f'livraison {sha[:12]} terminée : code {code}')
        try:
            self.wfile.write(f'code={code}\n'.encode())
        except OSError:
            pass
        self.close_connection = True


if __name__ == '__main__':
    os.makedirs(MAISON, exist_ok=True)
    serveur = ThreadingHTTPServer((ECOUTE, PORT), Porte)
    journal(f'porte web à l’écoute sur {ECOUTE}:{PORT}')
    serveur.serve_forever()
