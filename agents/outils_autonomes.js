// Acquisition et exécution déportées sur Actions. Aucun code extérieur n'entre
// dans le processus du cerveau ; le registre contient seulement des références.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { expurger } from './reflexivite.js';
export const REGISTRE = 'extensions/outils/registre.json';
export const MARQUE = 'raime-outil-v1', EXECUTION = 'raime-execution-v1';
export const hash = x => crypto.createHash('sha256').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex');
const exiger = (ok, message) => { if (!ok) throw new Error(message); };
function cles(x, attendues) {
  exiger(x && typeof x === 'object' && !Array.isArray(x), 'objet exigé');
  exiger(Object.keys(x).every(k => attendues.includes(k)), 'champ inconnu');
}
export function donnees(x) {
  const texte = JSON.stringify(x);
  exiger(typeof texte === 'string' && texte.length <= 8000, 'données JSON trop grandes');
  const inspecter = valeur => {
    if (!valeur || typeof valeur !== 'object') return;
    for (const [cle, contenu] of Object.entries(valeur)) {
      exiger(!/^(authorization|password|mot de passe|token|api[_ -]?key|private[_ -]?key|secret)$/i.test(cle),
        'champ contenant un secret refusé');
      inspecter(contenu);
    }
  };
  inspecter(x);
  // expurger borne normalement un diagnostic à 1200 caractères. La limite
  // JSON est distincte : vérifier tous les caractères, sans tronquer la donnée.
  exiger(expurger(texte, 8000) === texte, 'données contenant un secret refusées');
  exiger(!/\b(?:BEGIN .*PRIVATE KEY|AKIA[A-Z0-9]{16})/.test(texte), 'secret refusé');
  return x;
}
export function valider(p) {
  cles(p, ['version','id','repo','commit','langage','entree','arguments','besoin','cas']);
  exiger(p.version === 1, 'version exigée : 1');
  exiger(/^[a-z][a-z0-9-]{2,47}$/.test(p.id || ''), 'identifiant invalide');
  exiger(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}\/[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(p.repo || ''), 'dépôt public owner/name exigé');
  exiger(/^[a-f0-9]{40}$/.test(p.commit || ''), 'commit immuable de 40 caractères exigé');
  exiger(['node','python'].includes(p.langage), 'Node ou Python seulement');
  exiger(typeof p.entree === 'string' && /^[a-zA-Z0-9_./-]+$/.test(p.entree) && !p.entree.startsWith('/')
    && p.entree.split('/').every(s => s && !['.','..','.git'].includes(s)), 'chemin relatif sûr exigé');
  exiger(p.langage === 'python' ? p.entree.endsWith('.py') : /\.(?:js|cjs|mjs)$/.test(p.entree), 'entrée de langage incorrecte');
  exiger(typeof p.besoin === 'string' && p.besoin.length >= 10 && p.besoin.length <= 1000, 'besoin observable exigé');
  exiger(!p.arguments || (Array.isArray(p.arguments) && p.arguments.length <= 10
    && p.arguments.every(a => typeof a === 'string' && a.length <= 200 && !/[\r\n\0]/.test(a))), 'arguments invalides');
  exiger(Array.isArray(p.cas) && p.cas.length >= 3 && p.cas.length <= 10, '3 à 10 cas figés exigés');
  for (const c of p.cas) { cles(c, ['entree','attendu']); exiger('entree' in c && 'attendu' in c, 'entrée et attendu exigés'); donnees(c); }
  exiger(new Set(p.cas.map(c => hash(c.entree))).size === p.cas.length, 'entrées de test distinctes exigées');
  donnees(p);
  return p;
}
export function extraire(corps, marque = MARQUE) {
  exiger(typeof corps === 'string' && corps.length <= 20000, 'issue trop grande');
  exiger([MARQUE,EXECUTION].includes(marque), 'marque inconnue');
  const blocs = [...corps.matchAll(new RegExp('```'+marque+'\\n([\\s\\S]*?)\\n```','g'))];
  exiger(blocs.length === 1, 'un seul bloc exigé');
  return JSON.parse(blocs[0][1]);
}
export function registre(chemin = new URL('../'+REGISTRE, import.meta.url)) {
  const r = JSON.parse(fs.readFileSync(chemin,'utf8'));
  exiger(r.version === 1 && r.outils && typeof r.outils === 'object', 'registre invalide');
  for (const [id,o] of Object.entries(r.outils)) {
    valider(o.proposition); exiger(id === o.proposition.id && o.candidat_sha === hash(o.proposition), 'registre altéré');
    exiger(/^[a-f0-9]{64}$/.test(o.source_sha || '') && o.preuve?.passes === o.proposition.cas.length, 'preuve de l’outil absente');
  }
  return r;
}
export async function github(chemin, methode = 'GET', corps) {
  const repo = process.env.GITHUB_DEPOT || process.env.GITHUB_REPOSITORY || 'basilerameee-star/raime-cerveau';
  const jeton = process.env.GITHUB_CHANTIER_TOKEN || process.env.GH_TOKEN;
  exiger(jeton && /^[\w.-]+\/[\w.-]+$/.test(repo), 'connexion GitHub de la file absente');
  const r = await fetch(`https://api.github.com/repos/${repo}/${chemin}`, { method:methode,
    headers:{ Authorization:`Bearer ${jeton}`,Accept:'application/vnd.github+json','Content-Type':'application/json',
      'X-GitHub-Api-Version':'2022-11-28' }, body: corps === undefined ? undefined : JSON.stringify(corps), signal:AbortSignal.timeout(20000) });
  exiger(r.ok, `GitHub ${r.status} : ${chemin.split('?')[0]}`);
  return r.status === 204 ? null : r.json();
}
async function demander(proposition, marque, api = github) {
  const id = hash(proposition);
  const issues = await api('issues?state=all&labels=outil&sort=updated&direction=desc&per_page=100');
  const meme = issues.find(i => !i.pull_request && i.body?.includes(`empreinte:${id}`) && i.state === 'open');
  if (meme) return { ouvert:false,numero:meme.number,url:meme.html_url,motif:'demande identique déjà en attente' };
  exiger(issues.filter(i => !i.pull_request && i.state === 'open').length < 3, '3 demandes d’outil déjà ouvertes');
  exiger(issues.filter(i => !i.pull_request && Date.now()-Date.parse(i.created_at)<86400000).length < 12, '12 demandes par jour au plus');
  const i = await api('issues','POST',{ title:`[outil] ${marque === MARQUE ? 'Adopter' : 'Exécuter'} ${proposition.id}`,
    body:`Besoin interne, sans secret. empreinte:${id}\n\n\x60\x60\x60${marque}\n${JSON.stringify(proposition,null,2)}\n\x60\x60\x60`,labels:['outil'] });
  return { ouvert:true,numero:i.number,url:i.html_url,etat:'en attente de la sandbox' };
}
export async function proposerOutil(p, { api = github } = {}) { valider(p); return demander(p,MARQUE,api); }
export async function executerOutil({ id, entree }, { api = github, r = registre() } = {}) {
  exiger(Object.hasOwn(r.outils,id), 'outil pas encore déployé dans le registre local');
  donnees(entree);
  return demander({version:1,id,candidat_sha:r.outils[id].candidat_sha,entree},EXECUTION,api);
}
export async function suivreOutil(numero, { api = github } = {}) {
  exiger(Number.isSafeInteger(numero) && numero>0, 'numéro invalide');
  const issue = await api(`issues/${numero}`);
  exiger(issue.labels?.some(l => l.name === 'outil'), 'issue hors de la file d’outils');
  const cs = await api(`issues/${numero}/comments?per_page=100`);
  const preuve = cs.filter(c => c.user?.login === 'github-actions[bot]' && c.user?.type === 'Bot')
    .reverse().find(c => c.body?.includes('```raime-resultat-v1\n'));
  if (!preuve) return { termine:false,etat:issue.state === 'closed' ? 'fermée sans preuve' : 'en attente' };
  const m = preuve.body.match(/```raime-resultat-v1\n([\s\S]*?)\n```/);
  const resultat = JSON.parse(m[1]); donnees(resultat);
  exiger(resultat.version === 1 && ['adopte','execute','refuse'].includes(resultat.etat), 'résultat invalide');
  return { termine:true,...resultat };
}
