#!/usr/bin/env python3
"""Une vraie exécution Docker, y compris un contre-test métier qui doit échouer."""
import json
from pathlib import Path
import tempfile
from sandbox import verifier, lancer

with tempfile.TemporaryDirectory(prefix='qualification-outil-') as d:
    racine=Path(d)
    (racine/'tests').mkdir()
    (racine/'cli.py').write_text('import sys,json\nx=json.load(sys.stdin)\nprint(json.dumps(x["valeur"]+1))\n')
    (racine/'tests'/'test_isolement.py').write_text('''import os,socket,unittest
from pathlib import Path
class Isolement(unittest.TestCase):
    def test_reseau(self):
        s=socket.socket();s.settimeout(1)
        with self.assertRaises(OSError): s.connect(('192.0.2.1',443))
        s.close()
    def test_secrets(self):
        for nom in ['GH_TOKEN','GITHUB_TOKEN','GITHUB_CHANTIER_TOKEN','DATABASE_URL','RAIME_MCP_JETON']:
            self.assertNotIn(nom,os.environ)
        self.assertFalse(Path('/cerveau').exists())
        self.assertFalse(Path('/var/run/docker.sock').exists())
    def test_source_lecture_seule(self):
        with self.assertRaises(OSError): Path('/code/intrusion').write_text('non')
''')
    p={'langage':'python','entree':'cli.py','cas':[{'entree':{'valeur':i},'attendu':i+1} for i in range(3)]}
    preuve=verifier(racine,p)
    assert preuve['passes']==3 and preuve['tests_amont']==3
    p['cas'][0]['attendu']=999
    try: verifier(racine,p)
    except ValueError as e: assert 'cas métier' in str(e)
    else: raise AssertionError('le faux résultat a été accepté')
    (racine/'attendre.py').write_text('import time\ntime.sleep(120)\n')
    try: lancer(racine,'python',['python','attendre.py'],secondes=2)
    except ValueError as e: assert 'délai' in str(e)
    else: raise AssertionError('le délai maximal n’a pas arrêté l’outil')
    print(json.dumps({'preuve':preuve,'contre_test_metier':'refusé','delai':'arrêté'}))
