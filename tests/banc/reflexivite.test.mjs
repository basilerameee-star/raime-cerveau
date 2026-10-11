import {bases} from './outils.mjs';
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {preparer,traiter,suivre} from '../../agents/reflexivite.js';
let b;
before(async()=>{
  b=await bases();
  await b.brain.query(`CREATE TABLE IF NOT EXISTS commandes(id serial PRIMARY KEY,texte text,source text,pour text,etat text DEFAULT 'a_faire',cree_le timestamptz DEFAULT now(),traite_le timestamptz,reponse text)`);
  await b.brain.query(`CREATE TABLE IF NOT EXISTS boucle_passages(agent text,statut text,fin_le timestamptz DEFAULT now())`);
  await preparer(b.brain);await b.brain.query('TRUNCATE reflexions');
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
