// LE LANCEUR — la raison du nouveau Cockpit (26/09/2026). L'ancien était construit une fois dans une image :
// les livraisons de GitHub arrivaient sur le disque du serveur mais le Cockpit gardait l'ancien code.
// Ici, le code est lu directement dans le dépôt livré (monté en lecture seule) ; toutes les 5 secondes le
// lanceur compare les empreintes des fichiers de jarvis/ ; quand elles ont changé et sont stables
// (la livraison a fini d'écrire), il relance le serveur. Si le nouveau code tombe au démarrage, il réessaie
// sans fin, 5 secondes plus tard : une livraison corrigée le remet debout sans geste de Basile.
'use strict';

const { fork } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ICI = __dirname;
const SERVEUR = path.join(ICI, 'serveur.cjs');

function empreinte() {
  const h = crypto.createHash('sha256');
  const parcourir = (d) => {
    for (const n of fs.readdirSync(d).sort()) {
      const p = path.join(d, n);
      const st = fs.statSync(p);
      if (st.isDirectory()) parcourir(p);
      else { h.update(p); h.update(fs.readFileSync(p)); }
    }
  };
  try { parcourir(ICI); } catch (e) { return null; }
  return h.digest('hex');
}

let enfant = null, actuelle = empreinte(), vue = actuelle, arret = false;

function lancer() {
  enfant = fork(SERVEUR, [], { stdio: 'inherit' });
  const lui = enfant;
  lui.on('exit', (code) => {
    if (arret || enfant !== lui) return;
    console.error(`[lanceur] le serveur s'est arrêté (code ${code}) ; relance dans 5 s`);
    enfant = null;
    setTimeout(() => { if (!enfant && !arret) lancer(); }, 5000);
  });
}

setInterval(() => {
  const e = empreinte();
  if (!e) return;
  if (e !== vue) { vue = e; return; }          // en cours d'écriture : on attend qu'elle soit stable
  if (e === actuelle) return;
  actuelle = e;
  console.log('[lanceur] nouveau code livré : Jarvis redémarre');
  const ancien = enfant; enfant = null;
  if (ancien) { ancien.once('exit', lancer); ancien.kill('SIGTERM'); setTimeout(() => ancien.kill('SIGKILL'), 5000).unref(); }
  else lancer();
}, 5000);

for (const s of ['SIGTERM', 'SIGINT']) process.on(s, () => { arret = true; if (enfant) enfant.kill('SIGTERM'); setTimeout(() => process.exit(0), 300); });
lancer();
