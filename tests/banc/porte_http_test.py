"""La porte web, essayée à blanc : une fausse clé « GitHub » fabriquée par openssl signe des
jetons ; seul le jeton juste doit passer, et chaque mensonge doit être refusé.

    python3 -m unittest tests/banc/porte_http_test.py
"""
import base64, importlib.util, json, os, pathlib, subprocess, sys, tempfile, time, unittest

ICI = pathlib.Path(__file__).resolve().parent
TMP = tempfile.mkdtemp(prefix='banc-porte-web-')
os.environ['PORTE_MAISON'] = TMP
spec = importlib.util.spec_from_file_location('porte_http', ICI.parent.parent / 'porte' / 'porte_http.py')
porte = importlib.util.module_from_spec(spec)
spec.loader.exec_module(porte)

CLE = os.path.join(TMP, 'cle.pem')
subprocess.run(['openssl', 'genrsa', '-out', CLE, '2048'], check=True, capture_output=True)
MODULE = subprocess.run(['openssl', 'rsa', '-in', CLE, '-noout', '-modulus'],
                        check=True, capture_output=True, text=True).stdout.strip().split('=')[1]
b64 = lambda b: base64.urlsafe_b64encode(b).rstrip(b'=').decode()
JWK = {'kid': 'essai', 'kty': 'RSA', 'n': b64(bytes.fromhex(MODULE)), 'e': b64((65537).to_bytes(3, 'big'))}
cles = lambda kid: JWK if kid == 'essai' else None

SHA = 'a' * 40
JUSTE = {'iss': porte.EMETTEUR, 'aud': 'raime-porte', 'repository': porte.DEPOT, 'repository_id': '42',
         'ref': 'refs/heads/main', 'job_workflow_ref': porte.ACTION, 'sha': SHA, 'event_name': 'push',
         'nbf': int(time.time()) - 5, 'exp': int(time.time()) + 300}
n_jeton = 0


def jeton(**changes):
    global n_jeton
    n_jeton += 1
    corps = {**JUSTE, 'jti': f'j{n_jeton}', **changes}
    tete = b64(json.dumps({'alg': 'RS256', 'kid': 'essai'}).encode())
    signe = f'{tete}.{b64(json.dumps(corps).encode())}'
    sig = subprocess.run(['openssl', 'dgst', '-sha256', '-sign', CLE], input=signe.encode(),
                         check=True, capture_output=True).stdout
    return f'{signe}.{b64(sig)}'


def verifier(j, sha=SHA):
    return porte.verifier_jeton(j, sha, cles=cles)


class PorteWeb(unittest.TestCase):
    def test_le_jeton_juste_passe(self):
        self.assertEqual(verifier(jeton())['repository'], porte.DEPOT)

    def refuse(self, j, sha=SHA):
        with self.assertRaises(ValueError):
            verifier(j, sha)

    def test_une_autre_branche_est_refusee(self):
        self.refuse(jeton(ref='refs/heads/essai'))

    def test_un_autre_depot_est_refuse(self):
        self.refuse(jeton(repository='quelquun/autre'))

    def test_une_autre_action_est_refusee(self):
        self.refuse(jeton(job_workflow_ref=f'{porte.DEPOT}/.github/workflows/tests.yml@refs/heads/main'))

    def test_une_demande_de_fusion_est_refusee(self):
        self.refuse(jeton(event_name='pull_request'))

    def test_une_autre_audience_est_refusee(self):
        self.refuse(jeton(aud='sts.amazonaws.com'))

    def test_une_autre_version_que_celle_signee_est_refusee(self):
        self.refuse(jeton(), sha='b' * 40)

    def test_un_jeton_perime_est_refuse(self):
        self.refuse(jeton(exp=int(time.time()) - 1))

    def test_un_jeton_ne_sert_qu_une_fois(self):
        j = jeton()
        verifier(j)
        self.refuse(j)

    def test_un_corps_modifie_apres_signature_est_refuse(self):
        tete, corps, sig = jeton().split('.')
        faux = json.loads(base64.urlsafe_b64decode(corps + '=' * (-len(corps) % 4)))
        faux['sha'] = 'b' * 40
        self.refuse(f"{tete}.{b64(json.dumps(faux).encode())}.{sig}", sha='b' * 40)

    def test_l_algorithme_none_est_refuse(self):
        tete = b64(json.dumps({'alg': 'none', 'kid': 'essai'}).encode())
        self.refuse(f"{tete}.{b64(json.dumps({**JUSTE, 'jti': 'x'}).encode())}.")

    def test_un_depot_recree_sous_le_meme_nom_est_refuse(self):
        verifier(jeton())  # épingle le numéro 42
        self.refuse(jeton(repository_id='43'))


if __name__ == '__main__':
    unittest.main()
