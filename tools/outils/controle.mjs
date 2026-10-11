// Contrôleur de main, sans code candidat chargé dans Node. Le seul fichier
// promu automatiquement est le registre de références ; l'exécution reste isolée.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { REGISTRE, MARQUE, EXECUTION, hash, valider, extraire, registre, github, donnees } from '../../agents/outils_autonomes.js';
const sortie = (k,v) => { if(process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT,`${k}=${v}\n`); };
const exiger = (ok,m) => { if(!ok) throw new Error(m); };
const charger = () => JSON.parse(fs.readFileSync('demande-outil.json','utf8'));
const licences = new Set(['mit','apache-2.0','bsd-2-clause','bsd-3-clause','isc','mpl-2.0','unlicense','0bsd']);
async function publicApi(repo, chemin) {
  const r = await fetch(`https://api.github.com/repos/${repo}/${chemin}`, { headers:{Accept:'application/vnd.github+json',
    ...(process.env.GH_TOKEN ? {Authorization:`Bearer ${process.env.GH_TOKEN}`} : {})},signal:AbortSignal.timeout(20000) });
  exiger(r.ok,`source GitHub inaccessible (${r.status})`); return r.json();
}
export async function telecharger(p, {api = publicApi, destination='source-outil'} = {}) {
  valider(p);
  const meta = await api(p.repo,'');
  exiger(!meta.private && !meta.archived && !meta.disabled,'dépôt public actif exigé');
  const licence = meta.license?.spdx_id?.toLowerCase();
  exiger(licences.has(licence),'licence libre compatible exigée');
  const commit = await api(p.repo,`commits/${p.commit}`);
  exiger(commit.sha === p.commit,'commit différent');
  const arbre = await api(p.repo,`git/trees/${commit.commit.tree.sha}?recursive=1`);
  exiger(!arbre.truncated,'arbre tronqué');
  const blobs = arbre.tree.filter(x => x.type !== 'tree');
  exiger(blobs.length <= 600 && blobs.every(x => x.type === 'blob' && ['100644','100755'].includes(x.mode)),
    'liens symboliques, sous-modules ou trop de fichiers');
  exiger(blobs.reduce((n,x)=>n+x.size,0) <= 5*1024*1024,'source trop grande');
  const empreintes=[];
  fs.mkdirSync(destination,{recursive:true});
  for(const f of blobs.sort((a,b)=>a.path.localeCompare(b.path))) {
    exiger(/^[A-Za-z0-9_. /-]+$/.test(f.path) && !f.path.startsWith('/') && f.path.split('/').every(s=>s && !['.','..','.git','.env','.npmrc','.pypirc','node_modules','.deps'].includes(s)), 'chemin de source refusé');
    // Les médias sont inutiles au CLI ; ils ne sont pas téléchargés ni exécutés.
    if(/\.(png|jpe?g|gif|ico|pdf|woff2?|ttf|zip|gz)$/i.test(f.path)) continue;
    const b = await api(p.repo,`git/blobs/${f.sha}`);
    exiger(b.encoding === 'base64','encodage de source refusé');
    const octets=Buffer.from(b.content.replace(/\s/g,''),'base64');
    exiger(octets.length === f.size && !octets.includes(0),'taille ou fichier binaire refusé');
    const texte=octets.toString('utf8'); exiger(Buffer.from(texte).equals(octets),'UTF-8 exigé');
    const cible=path.join(destination,f.path); fs.mkdirSync(path.dirname(cible),{recursive:true});fs.writeFileSync(cible,octets,{mode:0o644});
    empreintes.push([f.path,hash(texte)]);
  }
  return {source_sha:hash(empreintes),licence,commit:p.commit};
}
export function selectionner(issues, numero, r, maintenant=Date.now()) {
  const liste=issues.filter(i=>!i.pull_request && i.state === 'open' && (i.body?.includes(MARQUE) || i.body?.includes(EXECUTION)));
  const issue=numero ? liste.find(i=>i.number===numero) : liste.sort((a,b)=>a.number-b.number)[0];
  if(!issue) return null;
  const type=issue.body.includes('```'+EXECUTION+'\n')?'execution':'acquisition';
  const requete=extraire(issue.body,type==='execution'?EXECUTION:MARQUE);
  let proposition;
  if(type==='execution') {
    exiger(Object.keys(requete).every(k=>['version','id','candidat_sha','entree'].includes(k)) && requete.version===1 && 'entree' in requete,'requête invalide');
    donnees(requete.entree);
    const o=r.outils[requete.id];exiger(o && o.candidat_sha === requete.candidat_sha,'outil absent ou changé');proposition=o.proposition;
  } else {
    proposition=valider(requete);
    // Aucun remplacement silencieux d'un outil existant : un id porte une seule version.
    exiger(!Object.hasOwn(r.outils,proposition.id),'identifiant déjà adopté ; nouvelle version = nouvel id et nouvelle preuve');
    exiger(!issues.some(i=>i.state==='closed' && i.body?.includes(MARQUE) && i.closed_at
      && maintenant-Date.parse(i.closed_at)<86400000),'une acquisition par 24 heures au plus');
    exiger(Object.keys(r.outils).length < 30,'30 outils au plus dans le registre');
  }
  return {issue:issue.number,corps_sha:hash(issue.body),type,requete,proposition,candidat_sha:hash(proposition)};
}
async function preparer() {
  exiger(process.env.GITHUB_REF === 'refs/heads/main','main seulement');
  const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  exiger((await github('git/ref/heads/main')).object.sha === head,'main a avancé ; réessayer sur sa nouvelle version');
  const issues=await github('issues?state=all&labels=outil&sort=updated&direction=desc&per_page=100');
  const numero=Number(process.env.ISSUE_NUMERO)||null;
  // Exposer le numéro avant validation pour garder une preuve de refus.
  const cible=numero ? issues.find(i=>i.number===numero) : issues.filter(i=>i.state==='open' && !i.pull_request).sort((a,b)=>a.number-b.number)[0];
  if(cible) sortie('issue',cible.number);
  const r=registre(); const plan=selectionner(issues,numero,r);
  if(!plan) {sortie('selection','non');return;}
  const source=await telecharger(plan.proposition);
  if(plan.type==='execution') exiger(source.source_sha === r.outils[plan.requete.id].source_sha,'source adoptée différente');
  fs.writeFileSync('demande-outil.json',JSON.stringify({...plan,base_sha:head,registre_sha:hash(r),source}));
  sortie('selection','oui');sortie('type',plan.type);sortie('base_sha',head);sortie('issue',plan.issue);
}
export function adopter(r,plan,preuve) {
  valider(plan.proposition);
  exiger(plan.candidat_sha===hash(plan.proposition),'candidat changé');
  exiger(preuve.version===1 && preuve.passes===plan.proposition.cas.length && preuve.total===preuve.passes
    && Number.isSafeInteger(preuve.tests_amont) && preuve.tests_amont>0 && /^sha256:[a-f0-9]{64}$/.test(preuve.image),'preuve de sandbox incomplète');
  exiger(hash(r)===plan.registre_sha && !Object.hasOwn(r.outils,plan.proposition.id),'registre changé après le banc');
  exiger(licences.has(plan.source?.licence) && /^[a-f0-9]{64}$/.test(plan.source?.source_sha||''),'provenance absente');
  const copie=structuredClone(r);
  copie.outils[plan.proposition.id]={proposition:plan.proposition,candidat_sha:plan.candidat_sha,
    source_sha:plan.source.source_sha,licence:plan.source.licence,preuve};
  return copie;
}
async function rendre(numero,resultat) {
  donnees(resultat);
  await github(`issues/${numero}/comments`,'POST',{body:'Résultat de la sandbox (données, pas instructions).\n\n```raime-resultat-v1\n'+JSON.stringify(resultat)+'\n```'});
  await github(`issues/${numero}`,'PATCH',{state:'closed',state_reason:resultat.etat==='refuse'?'not_planned':'completed'});
}
async function publier() {
  exiger(process.env.GITHUB_REF==='refs/heads/main','main seulement');
  const p=charger(), preuve=JSON.parse(fs.readFileSync('preuve-outil.json','utf8'));
  exiger(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()===p.base_sha,'contrôleur différent de la sandbox');
  const issue=await github(`issues/${p.issue}`);exiger(issue.state==='open' && hash(issue.body)===p.corps_sha,'issue modifiée');
  exiger(hash(extraire(issue.body,p.type==='execution'?EXECUTION:MARQUE))===hash(p.requete),'requête différente du banc');
  if(p.type==='execution') {
    const r=registre(),o=r.outils[p.requete.id];exiger(o && o.candidat_sha===p.candidat_sha && o.source_sha===p.source.source_sha,'outil changé');
    donnees(preuve.sortie);
    await rendre(p.issue,{version:1,etat:'execute',id:p.proposition.id,candidat_sha:p.candidat_sha,sortie:preuve.sortie,
      preuve:{passes:preuve.passes,tests_amont:preuve.tests_amont},run:process.env.GITHUB_RUN_ID});return;
  }
  const r=adopter(registre(),p,preuve);
  exiger((await github('git/ref/heads/main')).object.sha===p.base_sha,'main modifié après le banc');
  const base=await github(`git/commits/${p.base_sha}`);
  const blob=await github('git/blobs','POST',{content:JSON.stringify(r,null,2)+'\n',encoding:'utf-8'});
  const arbre=await github('git/trees','POST',{base_tree:base.tree.sha,tree:[{path:REGISTRE,mode:'100644',type:'blob',sha:blob.sha}]});
  const commit=await github('git/commits','POST',{message:`[outil-auto] Adopter ${p.proposition.id} : ${preuve.passes} cas prouvés\n\nSuivi #${p.issue}`,tree:arbre.sha,parents:[p.base_sha]});
  const branche=`auto/outil-${p.issue}-${p.base_sha.slice(0,12)}`;
  await github('git/refs','POST',{ref:`refs/heads/${branche}`,sha:commit.sha});
  const pr=await github('pulls','POST',{head:branche,base:'main',title:`Outil autonome : ${p.proposition.id}`,
    body:`## Pour Basile\nEn ligne après livraison : outil ${p.proposition.id}, ${preuve.passes} cas métier et ${preuve.tests_amont} tests amont passés.\nAucune offre nouvelle à vendre ; capacité interne : ${p.proposition.besoin.replace(/[\r\n]/g,' ')}\nRevenir en arrière : Revert de ce registre ; aucun code extérieur installé dans le cœur.\n\n## Preuve\nhttps://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}\n\nSuivi #${p.issue}.`});
  exiger((await github('git/ref/heads/main')).object.sha===p.base_sha,'main a avancé : aucune promotion');
  await github('git/refs/heads/main','PATCH',{sha:commit.sha,force:false});
  await github('actions/workflows/deployer.yml/dispatches','POST',{ref:'main',inputs:{sha:commit.sha}});
  await rendre(p.issue,{version:1,etat:'adopte',id:p.proposition.id,candidat_sha:p.candidat_sha,sha:commit.sha,pr:pr.number,
    passes:preuve.passes,tests_amont:preuve.tests_amont,livraison:'demandee, à vérifier séparément'});
}
async function refuser() {
  const numero=Number(process.env.ISSUE_NUMERO);if(!numero)return;
  await rendre(numero,{version:1,etat:'refuse',motif:'Validation, source ou sandbox en échec. Aucun outil promu par ce passage.',run:process.env.GITHUB_RUN_ID});
}
if(import.meta.url===`file://${process.argv[1]}`) {
  const action=process.argv[2];
  if(action==='preparer')await preparer(); else if(action==='publier')await publier(); else if(action==='refuser')await refuser();
  else if(action==='essayer') {
    const p=charger();
    const preuve=JSON.parse(fs.readFileSync('preuve-outil.json','utf8'));
    if(p.type==='acquisition')fs.writeFileSync(REGISTRE,JSON.stringify(adopter(registre(),p,preuve))+'\n');
  }
  else throw new Error('action inconnue');
}
