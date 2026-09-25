#!/usr/bin/env python3
# Ajoute au rapport du matin (workflow n8n « Héraut · Rapport quotidien », 7 h 30) la partie
# « Le cerveau » lue sur le cockpit (/api/rapport). Si le cockpit ne répond pas, le rapport part
# comme avant. Sauvegarde d'abord ; ne s'applique qu'une fois ; met à jour la version en service.
import json, subprocess, sys

WF = 'heraut00000001'
MARQUE = 'api/rapport'
DEBUT = "let c = null; try { c = await this.helpers.httpRequest({ url: 'http://cockpit:8090/api/rapport', json: true, timeout: 15000 }); } catch (e) {} "
SECTION = ("+(c && c.sections ? c.sections.map(s => '<h3 style=\"color:#0a5a3e;font-size:14px;margin:14px 0 4px\">'+esc(s.titre)+'</h3>'"
           "+'<ul style=\"margin:2px 0;padding-left:18px;font-size:13px\">'+(s.lignes||[]).map(l => '<li>'+esc(l)+'</li>').join('')+'</ul>').join('') : '')\n")
AVANT = "+'<h3 style=\"color:#b45309"

def psql(sql, entree=None):
    p = subprocess.run(['sh', '-c', 'docker exec -i $(docker ps -qf name=postgres | head -1) psql -U n8n -d n8n -At -v ON_ERROR_STOP=1' + ('' if entree else f' -c "{sql}"')],
                       input=entree, capture_output=True, text=True)
    if p.returncode: sys.exit('psql : ' + p.stderr.strip()[:300])
    return p.stdout

version = psql(f"select \\\"activeVersionId\\\" from workflow_entity where id='{WF}'").strip()
cibles = [('workflow_entity', 'id', WF), ('workflow_history', '"versionId"', version)]
for table, cle, val in cibles:
    brut = psql(f"select nodes from {table} where {cle.replace(chr(34), chr(92)+chr(34))}='{val}'").strip()
    nodes = json.loads(brut)
    with open(f'/opt/raime/backups/rapport-matin-{table}-avant-cerveau.json', 'w') as f: f.write(brut)
    n = next(x for x in nodes if x.get('name') == 'Format email')
    code = n['parameters']['jsCode']
    if MARQUE in code: print(f'{table} : déjà à jour'); continue
    assert code.count('const raw = (') == 1 and code.count(AVANT) == 1, f'{table} : repères introuvables'
    code = code.replace('const raw = (', DEBUT + 'const raw = (', 1).replace(AVANT, SECTION + AVANT, 1)
    n['parameters']['jsCode'] = code
    texte = json.dumps(nodes, ensure_ascii=False)
    assert '$wf$' not in texte
    psql(None, f"UPDATE {table} SET nodes = $wf${texte}$wf$::json WHERE {cle} = '{val}';")
    print(f'{table} : partie « Le cerveau » ajoutée')
