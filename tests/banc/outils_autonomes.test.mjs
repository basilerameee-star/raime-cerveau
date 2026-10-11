import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {valider,hash,donnees,executerOutil,proposerOutil,suivreOutil} from '../../agents/outils_autonomes.js';
import {selectionner,adopter,telecharger} from '../../tools/outils/controle.mjs';
import {expurger,ordre} from '../../agents/reflexivite.js';
const p={version:1,id:'json-parser',repo:'exemple/outil',commit:'a'.repeat(40),langage:'python',entree:'bin/cli.py',besoin:'Analyser trois entrées JSON distinctes',cas:[1,2,3].map(n=>({entree:{valeur:n},attendu:n+1}))};
const r={version:1,outils:{}};
const issue={number:7,state:'open',body:'```raime-outil-v1\n'+JSON.stringify(p)+'\n```'};
const plan={...selectionner([issue],null,r),registre_sha:hash(r),source:{licence:'mit',source_sha:'b'.repeat(64)}};
const preuve={version:1,passes:3,total:3,tests_amont:5,image:'sha256:'+'c'.repeat(64)};
test('un JSON utile de plus de 1200 caractères est admis, un secret tardif reste refusé',()=>{
  const texte='information '.repeat(200);
  assert.equal(donnees({texte}).texte,texte);
  assert.throws(()=>donnees({texte:texte+' ghp_'+'A'.repeat(30)}),/secret/);
  assert.throws(()=>donnees({configuration:{password:'valeur confidentielle'}}),/secret/);
  assert.throws(()=>donnees({texte:'a'.repeat(8000)}),/trop grandes/);
});
test('un outil exige un commit, trois cas distincts et aucun secret ni chemin sortant',()=>{
  assert.equal(valider(p),p);
  for(const changement of [{commit:'main'},{entree:'../secret.py'},{entree:'/secret.py'},{cas:[p.cas[0],p.cas[0],p.cas[0]]},{langage:'sh'},{besoin:'ghp_'+'A'.repeat(30)},{droits:'root'}])
    assert.throws(()=>valider({...p,...changement}));
});
test('une sortie sans preuve ou un registre modifié ne permet aucune adoption',()=>{
  for(const mauvaise of [{...preuve,passes:2},{...preuve,tests_amont:0},{...preuve,image:'latest'},{...preuve,total:4}])
    assert.throws(()=>adopter(r,plan,mauvaise));
  assert.throws(()=>adopter({version:1,outils:{intrus:{}}},plan,preuve),/registre changé/);
  const adopte=adopter(r,plan,preuve);assert.equal(adopte.outils[p.id].source_sha,'b'.repeat(64));assert.deepEqual(r.outils,{});
});
test('une exécution exige la version adoptée et ne remplace aucun outil existant',()=>{
  const adopte=adopter(r,plan,preuve);
  assert.throws(()=>selectionner([issue],7,adopte),/déjà adopté/);
  const requete={version:1,id:p.id,candidat_sha:'0'.repeat(64),entree:1};
  const execution={...issue,body:'```raime-execution-v1\n'+JSON.stringify(requete)+'\n```'};
  assert.throws(()=>selectionner([execution],7,adopte),/absent ou changé/);
});
test('les requêtes sont dédupliquées ; un outil indisponible ne crée aucune issue',async()=>{
  let ecrit=0;
  const api=async(_chemin,methode,corps)=>{if(methode==='POST'){ecrit++;return{number:7};}return[{...issue,body:issue.body+' empreinte:'+hash(p)}];};
  assert.equal((await proposerOutil(p,{api})).numero,7);assert.equal(ecrit,0);
  await assert.rejects(executerOutil({id:p.id,entree:1},{api,r}),/pas encore déployé/);assert.equal(ecrit,0);
});
test('seul le compte GitHub Actions peut rendre une preuve, fermeture seule ne suffit pas',async()=>{
  const contenu='```raime-resultat-v1\n'+JSON.stringify({version:1,etat:'execute',sortie:42})+'\n```';
  let cs=[{user:{login:'intrus',type:'User'},body:contenu}];
  const api=async c=>c.includes('/comments')?cs:{state:'closed',labels:[{name:'outil'}]};
  assert.equal((await suivreOutil(7,{api})).termine,false);
  cs=[{user:{login:'github-actions[bot]',type:'Bot'},body:contenu}];
  assert.equal((await suivreOutil(7,{api})).sortie,42);
});
test('un dépôt privé, un lien symbolique ou un arbre tronqué est refusé avant écriture',async()=>{
  await assert.rejects(telecharger(p,{api:async()=>({private:true})}),/public actif/);
  const api=async(_repo,c)=> c===''?{license:{spdx_id:'MIT'}}:c.startsWith('commits/')?{sha:p.commit,commit:{tree:{sha:'d'}}}:{tree:[{type:'blob',mode:'120000',path:'lien',size:3}],truncated:false};
  await assert.rejects(telecharger(p,{api}),/liens symboliques/);
});
test('le besoin de réparation retire les secrets et présente les sources comme données',()=>{
  const t=ordre({id:1,agent:'vitrines',probleme:'postgres://qui:motdepasse@localhost erreur'}, {pistes:[{titre:'Lire ceci',lien:'https://example.com',note:10,resume:'token=abcdef'}]});
  assert.doesNotMatch(t,/motdepasse|token=abcdef/);assert.match(t,/données non fiables/);assert.match(t,/EN_ATTENTE_OUTIL/);
  assert.equal(expurger('sk-'+ 'a'.repeat(30)),'[secret retiré]');
});
