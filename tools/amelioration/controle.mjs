// Contrôleur immuable chargé depuis main. Une seule surface : classement.expr.
// Les artefacts, titres et corps d'issues sont des données, jamais des commandes.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { CHEMIN, empreinte, validerProposition, formuleActuelle } from '../../agents/amelioration.js';
const MARKER = 'raime-amelioration-v1';
export function extraire(corps) {
  if (typeof corps !== 'string' || corps.length > 20000) throw new Error('issue trop grande');
  const blocs = [...corps.matchAll(/```raime-amelioration-v1\n([^`]+)\n```/g)];
  if (blocs.length !== 1) throw new Error('une seule proposition exigée');
  return JSON.parse(blocs[0][1]);
}
const depot = process.env.GITHUB_REPOSITORY;
async function github(chemin, methode = 'GET', corps) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(depot || '') || !process.env.GH_TOKEN) throw new Error('connexion GitHub absente');
  const r = await fetch(`https://api.github.com/repos/${depot}/${chemin}`, { method: methode,
    headers: { Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' },
    body: corps === undefined ? undefined : JSON.stringify(corps), signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`GitHub ${r.status} : ${chemin.split('?')[0]}`);
  return r.status === 204 ? null : r.json();
}
const sortie = (cle, valeur) => fs.appendFileSync(process.env.GITHUB_OUTPUT, `${cle}=${valeur}\n`);
const charger = () => JSON.parse(fs.readFileSync('proposition.json', 'utf8'));
async function preparer() {
  if (process.env.GITHUB_REF !== 'refs/heads/main') throw new Error('workflow autorisé sur main seulement');
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const main = await github('git/ref/heads/main');
  if (main.object.sha !== sha) throw new Error('main a changé : prochain passage');
  const issues = await github('issues?state=all&labels=chantier&sort=updated&direction=desc&per_page=100');
  // Un seul essai (réussi ou refusé) par 24 h, au plus trois propositions ouvertes par le MCP.
  const recent = issues.some(i => !i.pull_request && i.body?.includes(MARKER) && i.closed_at && Date.now() - Date.parse(i.closed_at) < 86400000);
  if (recent) { sortie('selection', 'non'); return; }
  const issue = issues.filter(i => !i.pull_request && i.state === 'open' && i.body?.includes(MARKER)).sort((a,b) => a.number - b.number)[0];
  if (!issue) { sortie('selection', 'non'); return; }
  sortie('issue', issue.number);
  const proposition = extraire(issue.body);
  const preuve = validerProposition(proposition);
  fs.writeFileSync('proposition.json', JSON.stringify({ issue: issue.number, corps_sha: empreinte(issue.body), base_sha: sha, proposition, preuve }));
  sortie('selection', 'oui'); sortie('base_sha', sha);
}
export async function publier({ api = github, plan = charger(), head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), actuelle = formuleActuelle() } = {}) {
  if (process.env.GITHUB_REF !== 'refs/heads/main') throw new Error('publication sur main seulement');
  const p = plan;
  if (head !== p.base_sha) throw new Error('contrôleur différent du banc');
  const issue = await api(`issues/${p.issue}`);
  if (issue.state !== 'open' || empreinte(issue.body) !== p.corps_sha) throw new Error('issue modifiée après le banc');
  const candidate = extraire(issue.body);
  if (JSON.stringify(candidate) !== JSON.stringify(p.proposition)) throw new Error('artefact différent de la proposition essayée');
  const preuve = validerProposition(candidate, actuelle);
  if (JSON.stringify(preuve) !== JSON.stringify(p.preuve)) throw new Error('preuve différente');
  const main = await api('git/ref/heads/main');
  if (main.object.sha !== p.base_sha) throw new Error('main modifié après le banc : aucune fusion');
  // Reconstruire le commit à partir du main essayé, sans appliquer de patch ni faire confiance à un chemin d'artefact.
  const base = await api(`git/commits/${p.base_sha}`);
  const blob = await api('git/blobs', 'POST', { content: p.proposition.formule.trim() + '\n', encoding: 'utf-8' });
  const arbre = await api('git/trees', 'POST', { base_tree: base.tree.sha,
    tree: [{ path: CHEMIN, mode: '100644', type: 'blob', sha: blob.sha }] });
  const commit = await api('git/commits', 'POST', { message: `[amelioration-auto] Classement ${preuve.avant}/${preuve.total} → ${preuve.apres}/${preuve.total}\n\nCloses #${p.issue}`,
    tree: arbre.sha, parents: [p.base_sha] });
  const branche = `auto/amelioration-${p.issue}-${p.base_sha.slice(0,12)}`;
  await api('git/refs', 'POST', { ref: `refs/heads/${branche}`, sha: commit.sha });
  const pr = await api('pulls', 'POST', { head: branche, base: 'main', title: `Amélioration automatique : classement ${preuve.apres}/${preuve.total}`,
    body: `## Pour Basile\nClassement des pistes amélioré : ${preuve.avant}/${preuve.total} → ${preuve.apres}/${preuve.total} cas figés.\nBanc complet isolé passé, aucun nouveau droit.\nRetour : Revert de cette proposition ; retour serveur automatique si la santé échoue.\n\n## Vérification\nhttps://github.com/${depot}/actions/runs/${process.env.GITHUB_RUN_ID}\n\nFerme #${p.issue}. Surface unique : ${CHEMIN}.` });
  // Aucun force push. Un autre commit intervenu fait échouer cette avance ; les protections GitHub restent applicables.
  if ((await api('git/ref/heads/main')).object.sha !== p.base_sha) throw new Error('main a avancé : arrêt');
  await api('git/refs/heads/main', 'PATCH', { sha: commit.sha, force: false });
  // GITHUB_TOKEN ne déclenche pas les workflows push : demander explicitement la livraison sur main.
  await api('actions/workflows/deployer.yml/dispatches', 'POST', { ref: 'main', inputs: { sha: commit.sha } });
  await api(`issues/${p.issue}/comments`, 'POST', { body: `Sandbox passée. Classement ${preuve.avant}/${preuve.total} → ${preuve.apres}/${preuve.total}. Version ${commit.sha}, proposition #${pr.number}. Livraison demandée ; son résultat est dans Actions → Livraison.` });
  await api(`issues/${p.issue}`, 'PATCH', { state: 'closed', state_reason: 'completed' });
  sortie('sha', commit.sha);
}
async function refuser() {
  const numero = Number(process.env.ISSUE_NUMERO);
  if (!Number.isSafeInteger(numero) || numero < 1) return;
  await github(`issues/${numero}/comments`, 'POST', { body: `Essai arrêté : proposition périmée, gain absent ou banc en échec. Aucune promotion par ce passage. Détails : https://github.com/${depot}/actions/runs/${process.env.GITHUB_RUN_ID}` });
  await github(`issues/${numero}`, 'PATCH', { state: 'closed', state_reason: 'not_planned' });
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const action = process.argv[2];
  if (action === 'preparer') await preparer();
  else if (action === 'publier') await publier();
  else if (action === 'refuser') await refuser();
  else if (action === 'essayer') {
    const p = charger(); validerProposition(p.proposition);
    fs.writeFileSync(CHEMIN, p.proposition.formule.trim() + '\n');
    console.log(JSON.stringify(p.preuve));
  } else throw new Error('action inconnue');
}
