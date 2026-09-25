// CAS FIGÉS — le Gardien version sas (voulue par Basile le 25/09/2026).
// Le risqué va au bac à sable ; l'interdit va au coupe-circuit sans essai ; après l'essai, le
// dangereux coupe, le mitigé ne garde que le positif, le sain suit sa zone.
import { aiguiller, trancher, ligneJournal } from '../agents/gardien.js';

let ok = 0, ko = 0;
const verifie = (nom, cond, info = '') => { if (cond) ok++; else { ko++; console.log('  ÉCHEC :', nom, info); } };

// ① aiguiller
verifie('note interne : exécutée', aiguiller({ agent: 'architecte', type: 'ecrire_note', cible: 'notes/x' }).voie === 'executer');
verifie('code extérieur : bac à sable', aiguiller({ agent: 'essayeur', type: 'integrer', origine: 'exterieur', cible: 'extensions/slugify' }).voie === 'bac_a_sable');
verifie('publication : bac à sable', aiguiller({ agent: 'publiciste', type: 'publier', cible: 'linkedin' }).voie === 'bac_a_sable');
verifie('son propre code : bac à sable', aiguiller({ type: 'modifier_code', cible: 'agents/sas.js' }).voie === 'bac_a_sable');
verifie('virement : coupe-circuit direct', aiguiller({ type: 'virement', cible: 'compte', domaine: 'argent' }).voie === 'coupe_circuit');
verifie('ordre de bourse : coupe-circuit direct', aiguiller({ type: 'ordre', cible: 'action X', domaine: 'argent' }).voie === 'coupe_circuit');
verifie('réécrire la Constitution : coupe-circuit', aiguiller({ type: 'ecrire', cible: 'plugin-cerveau/CONSTITUTION.md' }).voie === 'coupe_circuit');
verifie('élargir ses droits : coupe-circuit', aiguiller({ type: 'elargir_droits', cible: 'architecte' }).voie === 'coupe_circuit');
verifie('secret dans le contenu : coupe-circuit', aiguiller({ type: 'publier', cible: 'x', contenu: 'clé sk-abcdefghijklmnopqrstu' }).voie === 'coupe_circuit');
verifie('proposition de la Constitution v2 (autre fichier) : pas un interdit', aiguiller({ type: 'ecrire', cible: 'plugin-cerveau/CONSTITUTION_v2_proposition.md' }).voie !== 'coupe_circuit');

// ③ trancher
const act = { agent: 'essayeur', type: 'integrer', origine: 'exterieur', cible: 'extensions/x' };
let d = trancher(act, { parties: [{ nom: 'a', reussi: true, gain: 2 }, { nom: 'b', reussi: true, gain: 1, dangereux: true }] });
verifie('une partie dangereuse : coupe-circuit, rien gardé, Basile prévenu', d.decision === 'coupe_circuit' && !d.garder.length && d.prevenir && d.revenir);
d = trancher(act, { parties: [{ nom: 'a', reussi: true, gain: 3 }, { nom: 'b', reussi: false, gain: 0 }, { nom: 'c', reussi: true, gain: 0 }] });
verifie('mitigé : on n’extrait que le positif', d.decision === 'extraire_positif' && d.garder.join() === 'a' && d.ecartees.join() === 'b,c', JSON.stringify(d));
d = trancher(act, { parties: [{ nom: 'a', reussi: true, gain: 1 }, { nom: 'b', reussi: true, gain: 2 }] });
verifie('tout passe : suit sa zone', d.decision === 'suivre_zone' && d.garder.length === 2);
d = trancher(act, { parties: [{ nom: 'a', reussi: false, gain: 5 }] });
verifie('rien ne passe : rejet', d.decision === 'rejet');
verifie('essai vide : rejet', trancher(act, { parties: [] }).decision === 'rejet');

// la trace
const j = ligneJournal(act, aiguiller(act), trancher(act, { parties: [{ nom: 'a', reussi: true, gain: 1, dangereux: true }] }));
verifie('journal : acteur, changement, motif, retour arrière', j.acteur === 'gardien' && /coupe_circuit/.test(j.changement) && j.motif && /restauré/.test(j.retour_arriere));

console.log(`cas figes gardien : ${ok}/${ok + ko} ${ko ? 'KO' : 'OK'}`);
process.exit(ko ? 1 : 0);
