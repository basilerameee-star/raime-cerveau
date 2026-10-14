'use strict';
// Critères fournis AVANT le travail par l'appelant, jamais tirés du compte rendu.
// Lecture seulement : aucun script candidat, réseau ou commande du modèle.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const hash = x => crypto.createHash('sha256').update(x).digest('hex');

function validerContrat(c) {
  if (c == null) return null;
  if (!c || Array.isArray(c) || c.version !== 1 || Object.keys(c).some(k => !['version','fichiers'].includes(k))
      || !Array.isArray(c.fichiers) || !c.fichiers.length || c.fichiers.length > 20) throw new Error('contrat de vérification invalide');
  const chemins = new Set();
  for (const f of c.fichiers) {
    if (!f || Array.isArray(f) || Object.keys(f).some(k => !['chemin','contient','sha256'].includes(k))
        || typeof f.chemin !== 'string' || f.chemin.length > 200 || !/^[A-Za-z0-9_./-]+$/.test(f.chemin)
        || f.chemin.startsWith('/') || f.chemin.split('/').some(p => !p || p === '.' || p === '..' || p.startsWith('.'))
        || chemins.has(f.chemin)) throw new Error('chemin de vérification invalide');
    chemins.add(f.chemin);
    if (f.contient !== undefined && (typeof f.contient !== 'string' || !f.contient.length || f.contient.length > 10000))
      throw new Error('contenu attendu invalide');
    if (f.sha256 !== undefined && !/^[a-f0-9]{64}$/.test(f.sha256)) throw new Error('empreinte attendue invalide');
    if (f.contient === undefined && f.sha256 === undefined) throw new Error('contenu ou empreinte attendu exigé');
  }
  return structuredClone(c);
}

function verifierDossier(dossier, contrat) {
  try {
    const c = validerContrat(contrat);
    if (!c) return { etat: 'a_verifier', raison: 'Aucun critère indépendant fourni avant le travail.' };
    // Même le dossier de demande ne peut être un lien vers un autre travail.
    if (!fs.lstatSync(dossier).isDirectory() || fs.lstatSync(dossier).isSymbolicLink()) throw new Error('dossier de travail invalide');
    const racine = fs.realpathSync(dossier);
    const fichiers = c.fichiers.map(f => {
      let courant = dossier;
      for (const segment of f.chemin.split('/')) {
        courant = path.join(courant, segment);
        if (fs.lstatSync(courant).isSymbolicLink()) throw new Error('lien symbolique refusé');
      }
      const reel = fs.realpathSync(courant);
      if (!reel.startsWith(racine + path.sep)) throw new Error('fichier hors du dossier');
      const fd = fs.openSync(courant, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
      try {
        const stat = fs.fstatSync(fd);
        if (!stat.isFile() || stat.size === 0 || stat.size > 2 * 1024 * 1024) throw new Error('fichier absent, vide ou trop grand');
        const octets = fs.readFileSync(fd);
        if (octets.length > 2 * 1024 * 1024) throw new Error('fichier trop grand');
        const sha256 = hash(octets);
        if (f.sha256 && sha256 !== f.sha256) throw new Error('empreinte différente');
        if (f.contient !== undefined && !octets.toString('utf8').includes(f.contient)) throw new Error('contenu attendu absent');
        return { chemin: f.chemin, sha256, octets: octets.length };
      } finally { fs.closeSync(fd); }
    });
    return { etat: 'verifie', contrat_sha256: hash(JSON.stringify(c)), fichiers };
  } catch (e) {
    // Les erreurs de FS peuvent contenir des chemins privés ; ne pas les publier.
    const raison = e.code ? 'Un livrable attendu est absent ou inaccessible.' : e.message;
    return { etat: 'a_verifier', raison };
  }
}

function verifierResultat(id, contrat, travail = '/travail') {
  if (!/^[0-9]+$/.test(String(id))) return { etat: 'a_verifier', raison: 'Identifiant de demande invalide.' };
  return verifierDossier(path.join(travail, `demande-${id}`), contrat);
}
module.exports = { validerContrat, verifierDossier, verifierResultat };
