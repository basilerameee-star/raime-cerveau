import {bases} from './outils.mjs';
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {preparer,traiter,suivre} from '../../agents/reflexivite.js';
import {hash} from '../../agents/outils_autonomes.js';
let b;
before(async()=>{
  b=await bases();
  await b.brain.query(`CREATE TABLE IF NOT EXISTS commandes(id serial PRIMARY KEY,texte text,source text,pour text,etat text DEFAULT 'a_faire',cree_le timestamptz DEFAULT now(),traite_le timestamptz,reponse text)`);
  await b.brain.query(`CREATE TABLE IF NOT EXISTS boucle_passages(agent text,statut text,fin_le timestamptz DEFAULT now())`);
  await preparer(b.brain);await b.brain.query('TRUNCATE reflexions');
});

test('une interruption au troisième bail devient un blocage explicite et ne disparaît pas', async()=>{
  await b.brain.query(`INSERT INTO reflexions(empreinte,agent,probleme,etat,tentatives,bail,bail_fin)
    VALUES('banc-troisieme-bail','banc_crash','Recherche interrompue','en_cours',3,
    '00000000-0000-4000-8000-000000000001',now()-interval '1 minute')`);
  await traiter({brain:b.brain,rechercher:async()=>{throw new Error('ne doit pas être rejoué');}});
  const {rows:[r]}=await b.brain.query(`SELECT * FROM reflexions WHERE empreinte='banc-troisieme-bail'`);
  assert.equal(r.etat,'bloquee');
  assert.equal(r.bail,null);
  assert.equal(r.bail_fin,null);
  assert.match(r.resultat,/interruption/i);
});
after(async()=>{await b.brain.query(`DROP TRIGGER IF EXISTS reflexivite_panne ON journal`);await b.brain.query(`DELETE FROM commandes WHERE source='reflexivite'`);await b.fermer();});
test('une vraie ligne d’échec déclenche une panne durable, les répétitions se regroupent',async()=>{
  for(let i=0;i<2;i++)await b.brain.query(`INSERT INTO journal(acteur,changement,motif) VALUES('boucle','Échec de l''agent banc_panne','connexion : 504')`);
  const {rows:[r]}=await b.brain.query(`SELECT * FROM reflexions WHERE agent='banc_panne'`);
  assert.equal(r.occurrences,2);assert.equal(r.etat,'attente');assert.equal(r.commande,null);
});
test('recherche échouée reste en attente et ne crée pas un faux travail terminé',async()=>{
  await traiter({brain:b.brain,rechercher:async()=>({pistes:[],muettes:['moteur absent']})});
  const {rows:[r]}=await b.brain.query(`SELECT * FROM reflexions WHERE agent='banc_panne'`);
  assert.equal(r.etat,'attente');assert.equal(r.commande,null);assert.match(r.resultat,/aucune source/);
});
test('un bail expiré reprend après interruption et confie une seule commande sourcée',async()=>{
  await b.brain.query(`UPDATE reflexions SET etat='en_cours',bail_fin=now()-interval '1 minute',prochaine=now()-interval '1 minute'`);
  const rechercher=async()=>({pistes:[{titre:'Documentation',lien:'https://postgresql.org',note:90,resume:'Connexion',refus:null}]});
  const r=await traiter({brain:b.brain,rechercher});assert.ok(r.commande);
  assert.equal(await traiter({brain:b.brain,rechercher}),null);
  const {rows:[c]}=await b.brain.query('SELECT texte FROM commandes WHERE id=$1',[r.commande]);assert.match(c.texte,/postgresql.org/);
});
test('le compte rendu d’Hermes ne résout pas une panne, le passage réel la résout',async()=>{
  const {rows:[r]}=await b.brain.query(`SELECT * FROM reflexions WHERE agent='banc_panne'`);
  await b.brain.query(`UPDATE commandes SET etat='faite',traite_le=now(),reponse='Corrigé dans mon atelier' WHERE id=$1`,[r.commande]);
  await suivre({brain:b.brain});
  assert.equal((await b.brain.query('SELECT etat FROM reflexions WHERE id=$1',[r.id])).rows[0].etat,'verification');
  await b.brain.query(`INSERT INTO boucle_passages(agent,statut,fin_le) VALUES('banc_panne','ok',now()+interval '1 second')`);
  await suivre({brain:b.brain});
  assert.equal((await b.brain.query('SELECT etat FROM reflexions WHERE id=$1',[r.id])).rows[0].etat,'resolue');
});

test('une adoption attend la livraison du registre puis reprend une seule fois avec la sortie de l’outil',async()=>{
  await b.brain.query(`TRUNCATE reflexions`);
  await b.brain.query(`DELETE FROM commandes WHERE source='reflexivite'`);
  await b.brain.query(`INSERT INTO journal(acteur,changement,motif) VALUES('boucle','Échec de l''agent banc_outil','analyse JSON indisponible')`);
  const recherche=async()=>({pistes:[{titre:'Outil JSON',lien:'https://github.com/exemple/outil',note:90,refus:null}]});
  const c=await traiter({brain:b.brain,rechercher:recherche});
  const terminer=async(id,reponse)=>b.brain.query(`UPDATE commandes SET etat='faite',traite_le=now(),reponse=$2 WHERE id=$1`,[id,reponse]);
  const compter=async()=>Number((await b.brain.query(`SELECT count(*) AS n FROM commandes WHERE source='reflexivite'`)).rows[0].n);
  await terminer(c.commande,'EN_ATTENTE_OUTIL:7');
  await suivre({brain:b.brain,lireOutil:async()=>({termine:false})});
  assert.equal(await compter(),1,'une attente ne crée aucune nouvelle commande');
  const suivi={termine:true,etat:'adopte',id:'banc-json'};
  await suivre({brain:b.brain,lireOutil:async()=>suivi});
  assert.equal(await compter(),1,'une adoption GitHub sans registre livré reste en attente');
  const chemin=new URL('../../extensions/outils/registre.json',import.meta.url);
  const avant=fs.readFileSync(chemin,'utf8');
  const p={version:1,id:'banc-json',repo:'exemple/outil',commit:'a'.repeat(40),langage:'python',entree:'cli.py',besoin:'Analyser trois données JSON',cas:[1,2,3].map(n=>({entree:n,attendu:n+1}))};
  try {
    const registre=JSON.parse(avant);
    registre.outils[p.id]={proposition:p,candidat_sha:hash(p),source_sha:'b'.repeat(64),preuve:{passes:3}};
    fs.writeFileSync(chemin,JSON.stringify(registre));
    await suivre({brain:b.brain,lireOutil:async()=>suivi});
    await suivre({brain:b.brain,lireOutil:async()=>suivi});
    assert.equal(await compter(),2,'le registre effectivement relu ne reprend le travail qu’une fois');
    let r=(await b.brain.query(`SELECT * FROM reflexions WHERE id=$1`,[c.evenement])).rows[0];
    await terminer(r.commande,'EN_ATTENTE_OUTIL:8');
    await suivre({brain:b.brain,lireOutil:async()=>({termine:true,etat:'execute',sortie:{total:42}})});
    assert.equal(await compter(),3);
    r=(await b.brain.query(`SELECT * FROM reflexions WHERE id=$1`,[c.evenement])).rows[0];
    const ordre=(await b.brain.query(`SELECT texte FROM commandes WHERE id=$1`,[r.commande])).rows[0].texte;
    assert.match(ordre,/"total":42/,'la vraie sortie du banc est transmise à la reprise');
    await terminer(r.commande,'Résultat vérifié');await suivre({brain:b.brain});
    assert.equal((await b.brain.query(`SELECT etat FROM reflexions WHERE id=$1`,[c.evenement])).rows[0].etat,'verification');
    await b.brain.query(`INSERT INTO boucle_passages(agent,statut,fin_le) VALUES('banc_outil','ok',now()+interval '1 second')`);
    await suivre({brain:b.brain});
    assert.equal((await b.brain.query(`SELECT etat FROM reflexions WHERE id=$1`,[c.evenement])).rows[0].etat,'resolue');
  } finally {fs.writeFileSync(chemin,avant);}
});

test('une panne d’Hermes exige la réussite du même ordre, pas d’un autre travail',async()=>{
  await b.brain.query(`TRUNCATE reflexions`);
  await b.brain.query(`DELETE FROM commandes WHERE source='reflexivite'`);
  const original=(await b.brain.query(`INSERT INTO commandes(texte,source,pour,etat) VALUES('Livrable interne de banc','banc','harness','a_faire') RETURNING id`)).rows[0].id;
  const autre=(await b.brain.query(`INSERT INTO commandes(texte,source,pour,etat) VALUES('Autre tâche de banc','banc','harness','faite') RETURNING id`)).rows[0].id;
  try {
    await b.brain.query(`INSERT INTO journal(acteur,changement,motif) VALUES('executant',$1,'Moteur indisponible')`,[`Ordre n°${original} bloqué`]);
    const c=await traiter({brain:b.brain,rechercher:async()=>({pistes:[{titre:'Documentation',lien:'https://example.com',note:80,refus:null}]})});
    await b.brain.query(`UPDATE commandes SET etat='faite',traite_le=now(),reponse='Réparation préparée' WHERE id=$1`,[c.commande]);
    await suivre({brain:b.brain});
    await b.brain.query(`UPDATE commandes SET traite_le=now()+interval '1 second' WHERE id=$1`,[autre]);
    await suivre({brain:b.brain});
    assert.equal((await b.brain.query(`SELECT etat FROM reflexions WHERE id=$1`,[c.evenement])).rows[0].etat,'verification');
    await b.brain.query(`UPDATE commandes SET etat='faite',traite_le=now()+interval '1 second' WHERE id=$1`,[original]);
    await suivre({brain:b.brain});
    assert.equal((await b.brain.query(`SELECT etat FROM reflexions WHERE id=$1`,[c.evenement])).rows[0].etat,'resolue');
  } finally {await b.brain.query(`DELETE FROM commandes WHERE id IN ($1,$2)`,[original,autre]);}
});

