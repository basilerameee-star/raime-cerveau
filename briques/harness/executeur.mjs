// L'EXÉCUTANT — DeepSeek Harness au service du cerveau rAIme (25/09/2026).
//
// Reçoit une tâche par HTTP sur le réseau Docker interne (jamais exposé), la confie à
// `dsh --profile headless` et rend la réponse finale. Une tâche à la fois, quarante-cinq minutes au plus.
// Il ne voit que son dossier /travail et les clés de modèles : aucun accès à la base, au site ni
// au reste du serveur. C'est le cockpit qui lui passe les commandes de Jarvis et note le résultat.
import http from 'node:http';
import { spawn } from 'node:child_process';

const MAX_MS = 45 * 60_000; // cloner, installer, construire : 45 minutes au plus
let occupe = false;

function executer(tache) {
  return new Promise((ok) => {
    const t0 = Date.now();
    const p = spawn('dsh', ['--profile', 'headless', '--patch', '/cfg/openrouter.yml', tache],
      { cwd: '/travail', env: process.env });
    let sortie = '', trace = '';
    p.stdout.on('data', (d) => { sortie = (sortie + d).slice(-200_000); });
    p.stderr.on('data', (d) => { trace = (trace + d).slice(-20_000); });
    const minuteur = setTimeout(() => p.kill('SIGTERM'), MAX_MS);
    p.on('close', (code) => {
      clearTimeout(minuteur);
      ok({ code, sortie: sortie.trim(), trace: trace.slice(-2000), duree_s: Math.round((Date.now() - t0) / 1000) });
    });
  });
}

http.createServer((req, res) => {
  const repondre = (c, d) => { res.writeHead(c, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(d)); };
  if (req.method === 'GET' && req.url === '/sante') return repondre(200, { etat: occupe ? 'occupe' : 'libre' });
  if (req.method !== 'POST' || req.url !== '/tache') return repondre(404, { erreur: 'inconnu' });
  if (occupe) return repondre(409, { erreur: 'une tâche est déjà en cours' });
  let corps = '';
  req.on('data', (c) => { corps += c; if (corps.length > 20_000) req.destroy(); });
  req.on('end', async () => {
    let tache = '';
    try { tache = String(JSON.parse(corps).tache || '').trim(); } catch {}
    if (!tache) return repondre(400, { erreur: 'tâche vide' });
    occupe = true;
    try { repondre(200, await executer(tache)); } finally { occupe = false; }
  });
}).listen(8201, () => console.log('exécutant prêt sur :8201'));
