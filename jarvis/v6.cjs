// LE COCKPIT V6 EN DIRECT (14/10/2026). La maquette validée par Basile (« tout le reste, c'est bien »), branchée sur les
// vraies données et sur de vrais boutons : https://cockpit.raime.fr/v6, derrière le mot de passe de Caddy. Les pages /,
// /jarvis et /jarvis3d ne changent pas tant que Basile n'a pas dit oui.
//
// /api/v6 assemble l'objet D de la maquette, même forme. Ce qui se calcule en direct l'est : les passages des agents
// (boucle_passages), les flux n8n, le relevé du serveur (tools/releve_hote.py : journaux des tâches planifiées, porte,
// conteneurs), les appels, rappels et relances, les offres, les jetons, les simulations. Les textes fixes viennent de
// jarvis/v6.json, avec leur date. Un chiffre qu'on ne peut pas calculer en direct garde sa date, jamais l'air d'être frais ;
// une lecture en échec se dit (direct.erreurs), jamais un zéro.
//
// Les boutons : noter un appel (/api/v6/appel, par l'agenda et la liste d'appels existants), une demande pour Claude
// (/api/v6/demande, la file des ordres que surveille le veilleur) ; le reste passe par les routes qui existaient déjà.
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const bases = require('./bases.cjs');
const agenda = require('./agenda.cjs');
const appels = require('./appels.cjs');
const ordresRetard = require('./ordres_retard.cjs');
const telephone = require('./telephone.cjs');

const ZONE = 'Europe/Paris';
const H = 3600e3;
const EXECUTANT = process.env.EXECUTANT_URL || 'http://harness:8201';
const TEXTES = JSON.parse(fs.readFileSync(path.join(__dirname, 'v6.json'), 'utf8'));
const PAGE = path.join(__dirname, 'interface', 'v6.html');
const DEPOT = 'https://github.com/basilerameee-star/raime-cerveau/commit/';

// ── Les dates, à Paris ────────────────────────────────────────────────────────────────────────
const iso = (d) => (d ? new Date(d).toISOString() : null);
const jourDe = (d) => (d ? agenda.aujourdhui(new Date(d)) : null);
const court = (j) => (j ? `${String(j).slice(8, 10)}/${String(j).slice(5, 7)}` : '');
const heure = (d) => new Date(d).toLocaleTimeString('fr-FR', { timeZone: ZONE, hour: '2-digit', minute: '2-digit' }).replace(':', ' h ');
// « aujourd'hui à 21 h 47 », « hier à 5 h 21 », « le 08/10 à 14 h 16 »
function quand(d, auj) {
  if (!d) return '—';
  const j = jourDe(d), n = agenda.ecart(j, auj);
  return `${n === 0 ? 'aujourd’hui' : n === 1 ? 'hier' : 'le ' + court(j)} à ${heure(d)}`;
}
const nombre = (n) => Number(n || 0).toLocaleString('fr-FR');
const euros = (n) => Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const pourcent = (p) => `${p > 0 ? '+' : p < 0 ? '−' : ''}${Math.abs(p).toFixed(1).replace('.', ',')} %`;
const pluriel = (n, un, plusieurs) => `${nombre(n)} ${n > 1 ? plusieurs : un}`;
// un numéro français lisible (« 04 50 67 23 16 ») ; un autre reste tel quel
const tel = (t) => { if (!t) return ''; try { const n = telephone.normaliser(t); return n ? telephone.lisible(n) : String(t); } catch (e) { return String(t); } };
// une lecture en échec, dite simplement (le détail technique reste dans le journal du serveur)
const pourquoi = (e) => { const m = String((e && e.message) || e); console.error('[v6]', m);
  return /does not exist|n'existe pas/i.test(m) ? 'table absente' : /timeout|délai/i.test(m) ? 'délai dépassé' : /ECONNREFUSED|ENOTFOUND|connect/i.test(m) ? 'base injoignable' : 'lecture impossible'; };
const propre = (t, n = 160) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

async function preparer() {
  // le relevé du serveur (tools/releve_hote.py, cron de l'hôte) : créé ici aussi, pour que son absence se lise « pas encore de relevé »
  await bases.lire(`CREATE TABLE IF NOT EXISTS releve_hote (id bigserial PRIMARY KEY, le timestamptz NOT NULL DEFAULT now(), donnees jsonb NOT NULL)`);
}

// ── La porte (journal de livraison, transmis par le relevé du serveur) ──────────────────────────
// Lignes : « <date> déploiement de <sha> demandé (…) », « <date> EN SERVICE : <sha> », un retour arrière (RETOUR, ÉCHEC, REFUS).
function livraisons(porte) {
  if (!porte || !Array.isArray(porte.lignes)) return null;
  const demandes = new Map(), liste = [];
  for (const l of porte.lignes) {
    const m = /^(\S+Z)\s+(.*)$/.exec(String(l)); if (!m) continue;
    const le = m[1], reste = m[2];
    let x;
    if ((x = /déploiement de ([0-9a-f]{12,40}) demandé/.exec(reste))) demandes.set(x[1].slice(0, 12), le);
    else if ((x = /^EN SERVICE : ([0-9a-f]{12,40})/.exec(reste))) {
      const sha = x[1].slice(0, 12), d = demandes.get(sha);
      liste.push({ le, sha, ok: true, porte: d ? Math.round((new Date(le) - new Date(d)) / 1000) : null });
    } else if (/(^|[^A-Za-zÀ-ÿ])(RETOUR|ÉCHEC|ECHEC|REFUS)(?![A-Za-zÀ-ÿ])/.test(reste) && !/\[web\]/.test(reste)) {
      const s = /([0-9a-f]{12,40})/.exec(reste);
      liste.push({ le, sha: s ? s[1].slice(0, 12) : null, ok: false, porte: null, texte: propre(reste, 160) });
    }
  }
  const ok = liste.filter((l) => l.ok && l.porte != null).map((l) => l.porte).sort((a, b) => a - b);
  return {
    n: Number(porte.en_service) || liste.filter((l) => l.ok).length, echecs: Number(porte.echecs) || liste.filter((l) => !l.ok).length,
    depuis: porte.premier || (liste[0] && liste[0].le) || null, mediane: ok.length ? ok[Math.floor(ok.length / 2)] : null, sur: ok.length,
    dernieres: liste.slice(-14).reverse().map((l) => ({ ...l, sujet: TEXTES.majs.sujets[l.sha] || null, lien: l.sha ? DEPOT + l.sha : null })),
    courante: porte.courante ? String(porte.courante).slice(0, 12) : null,
  };
}

// ── L'état d'une source qui passe (la boucle, un flux n8n, un journal du serveur) ───────────────
// p : { dernier, statut ('ok' | 'echec'), premier, echecs, dernier_echec, gueri_le, panne_depuis, cause, debut_releve }
function etatSource(p, src, maintenant) {
  if (!p || !p.dernier) return null;
  const retard = src.retard_h || (src.toutes_h ? Math.max(2, 3 * src.toutes_h) : null);
  if (p.statut === 'echec') {
    return { etat: 'panne', dernier: p.dernier, depuis: p.panne_depuis || p.dernier_echec || p.dernier,
      derniere_panne: { le: p.dernier_echec || p.dernier, texte: p.cause ? `échec du passage : ${propre(p.cause, 140)}` : 'dernier passage en échec' } };
  }
  if (retard && maintenant - new Date(p.dernier) > retard * H) {
    return { etat: 'panne', dernier: p.dernier, depuis: p.dernier, derniere_panne: { le: p.dernier, texte: `ne passe plus depuis le ${court(jourDe(p.dernier))}` } };
  }
  const sante = p.dernier_echec
    ? { type: 'sain', depuis: p.gueri_le || p.dernier, panne: p.dernier_echec }
    : p.premier ? { type: 'jamais', depuis: p.premier, ...(p.debut_releve ? { debut_releve: p.debut_releve } : {}) } : null;
  return { etat: 'ok', dernier: p.dernier, ...(sante ? { sante } : {}),
    ...(p.dernier_echec ? { derniere_panne: { le: p.dernier_echec, texte: p.cause ? `échec du passage : ${propre(p.cause, 140)}` : 'un passage en échec' } } : {}) };
}
// Plusieurs sources pour un agent : la pire décide, le passage le plus récent est le « dernier ».
function fusionner(etats) {
  const l = etats.filter(Boolean);
  if (!l.length) return null;
  const pire = l.find((e) => e.etat === 'panne') || l.find((e) => e.etat === 'arret') || l.slice().sort((a, b) => new Date(b.dernier || 0) - new Date(a.dernier || 0))[0];
  const dernier = l.map((e) => e.dernier).filter(Boolean).sort().pop();
  return { ...pire, dernier };
}

// ── Les mesures propres à chaque agent : une phrase lue en direct, parfois un état (à vide, en panne) ──
// L : tout ce qui a été lu ; chaque fonction rend { texte?, dernier?, etat?, depuis?, derniere_panne? } ou null (rien lu).
const MESURES = {
  vitrines(L) {
    if (!L.vitStats) return null;
    const s = (k) => (L.vitStats.find((x) => x.statut === k) || { n: 0 }).n, n24 = L.vitStats.reduce((t, x) => t + x.n24, 0);
    return { texte: `${pluriel(n24, 'fiche trouvée', 'fiches trouvées')} en 24 h ; ${pluriel(s('a_appeler'), 'commerce', 'commerces')} à appeler, ${nombre(s('nouveau'))} à trier.` };
  },
  maquettes(L) {
    if (!L.vitStats) return null;
    const m = L.vitStats.filter((x) => x.statut !== 'ecarte'), t = m.reduce((s, x) => s + x.maquettes, 0), n = m.reduce((s, x) => s + x.maquettes24, 0);
    return { texte: `${pluriel(n, 'maquette faite', 'maquettes faites')} en 24 h ; ${pluriel(t, 'maquette prête', 'maquettes prêtes')} en tout.` };
  },
  envoi_vit(L, A) {
    if (!L.envoiVit || !L.vitStats) return null;
    const s = (k) => (L.envoiVit.find((x) => x.statut === k) || { n: 0, dernier: null });
    const b = (k) => (L.vitStats.find((x) => x.statut === k) || { n: 0 }).n;
    const sansTel = (L.vitrines || []).filter((v) => v.statut === 'valide' && !v.telephone).length;
    const c = L.envoiConf;
    return { texte: `${pluriel(s('envoye').n, 'maquette envoyée', 'maquettes envoyées')} en tout${s('envoye').dernier ? `, la dernière ${quand(s('envoye').dernier, A.auj)}` : ''} ; `
      + `${nombre(s('a_envoyer').n)} en file, ${nombre(b('brouillon'))} à valider${sansTel ? `, ${pluriel(sansTel, 'validée bloquée', 'validées bloquées')} sans téléphone` : ''}`
      + `${c ? ` ; envoi « ${c.mode} », ${nombre(c.plafond_jour)} par jour au plus` : ''}.` };
  },
  sherlock(L) { return L.prosStats ? { texte: `${pluriel(L.prosStats.trouves24, 'entreprise trouvée', 'entreprises trouvées')} en 24 h.` } : null; },
  fureteur(L) {
    // son journal, une ligne par passage : « 25 fiches : 0 sites prouvés, … » ; le moteur de recherche dans le motif
    const j = L.fureteur; if (!j) return null;
    let lues = 0, prouves = 0, ferme = 0;
    for (const x of j) { const m = /^(\d+) fiches : (\d+) sites prouvés/.exec(x.changement || ''); if (m) { lues += +m[1]; prouves += +m[2]; } if (/Moteur : fermé/.test(x.motif || '')) ferme++; }
    return { texte: `En 24 h : ${pluriel(j.length, 'passage', 'passages')}, ${pluriel(lues, 'fiche lue', 'fiches lues')}, ${pluriel(prouves, 'site prouvé', 'sites prouvés')}${ferme ? ` ; moteur de recherche fermé à ${pluriel(ferme, 'passage', 'passages')}` : ''}.`,
      ...(lues > 0 && prouves === 0 ? { etat: 'vide' } : {}) };
  },
  redacteur(L) {
    return L.outStats ? { texte: `${pluriel(L.outStats.ecrits24, 'e-mail écrit', 'e-mails écrits')} en 24 h ; ${pluriel(L.outStats.brouillons, 'attend', 'attendent')} ta validation.` } : null;
  },
  expediteur(L, A) {
    const o = L.outStats; if (!o) return null;
    return { texte: `${pluriel(o.envoyes24, 'e-mail envoyé', 'e-mails envoyés')} en 24 h, ${nombre(o.envoyes7)} en 7 jours${o.dernier_envoi ? `, le dernier ${quand(o.dernier_envoi, A.auj)}` : ''} ; `
      + `${pluriel(o.valides, 'validé partira', 'validés partiront')} au prochain passage.` };
  },
  receptionniste(L, A) {
    const e = (L.executions || []).find((x) => x.id === 'receptionni01'); if (!e) return null;
    return { texte: `${pluriel(e.n7, 'e-mail reçu traité', 'e-mails reçus traités')} en 7 jours${e.dernier ? ` ; le dernier ${quand(e.dernier, A.auj)}` : ''}.` };
  },
  liste_app(L, A) {
    if (!A.liste) return null;
    const l = A.liste, n = (t) => l.filter((x) => x.type === t).length;
    return { texte: `Aujourd’hui : ${pluriel(n('rdv'), 'rendez-vous', 'rendez-vous')}, ${pluriel(n('rappel'), 'rappel', 'rappels')}, ${pluriel(n('relance'), 'relance', 'relances')} à 7 jours ; ${pluriel(n('nouveau'), 'nouveau numéro', 'nouveaux numéros')} en réserve.`,
      dernier: A.maintenant };
  },
  agenda(L, A) {
    if (!L.rappels) return null;
    const o = L.rappels.filter((r) => r.statut === 'a_faire');
    return { texte: `${pluriel(o.length, 'rappel ouvert', 'rappels ouverts')}, dont ${nombre(o.filter((r) => r.note).length)} avec une note et ${nombre(o.filter((r) => r.jour < A.auj).length)} en retard.`,
      dernier: A.maintenant };
  },
  collecte(L, A) {
    const c = L.candStats; if (!c) return null;
    const vieux = !c.derniere || A.maintenant - new Date(c.derniere) > 30 * H;
    return { texte: `${pluriel(c.n24, 'offre reçue', 'offres reçues')} en 24 h${c.derniere ? ` ; la dernière ${quand(c.derniere, A.auj)}` : ''}.`, dernier: c.derniere,
      ...(vieux ? { etat: 'panne', depuis: c.derniere, derniere_panne: { le: c.derniere, texte: `aucune nouvelle offre depuis le ${court(jourDe(c.derniere))}` } } : {}) };
  },
  lettres(L) {
    if (!L.offres) return null;
    return { texte: `${pluriel(L.offres.filter((o) => o.lettre && o.statut !== 'envoye').length, 'offre a', 'offres ont')} sa lettre prête.`.replace('offres ont sa', 'offres ont leur'), dernier: L.candStats && L.candStats.derniere_fiche };
  },
  envoyeur(L, A) {
    const c = L.candStats; if (!c) return null;
    const base = `${pluriel(c.envois7, 'candidature envoyée', 'candidatures envoyées')} en 7 jours${c.dernier_envoi ? ` ; la dernière ${quand(c.dernier_envoi, A.auj)}` : ''}.`;
    if (c.valides && c.valide_depuis && A.maintenant - new Date(c.valide_depuis) > 3 * H) {
      return { texte: base, dernier: c.dernier_envoi, etat: 'panne', depuis: c.valide_depuis,
        derniere_panne: { le: c.valide_depuis, texte: `${pluriel(c.valides, 'candidature validée attend', 'candidatures validées attendent')} depuis le ${court(jourDe(c.valide_depuis))}${c.valide_detail ? ` (« ${propre(c.valide_detail, 80)} »)` : ''}` } };
    }
    return { texte: base, dernier: c.dernier_envoi, ...(c.envois7 === 0 ? { etat: 'vide' } : {}) };
  },
  veille_cand(L, A) {
    const j = A.hote('veille_candidatures');
    const al = L.candAlerte;
    return j || al ? { texte: `${al ? `Dernière alerte ${quand(al, A.auj)}` : 'Aucune alerte'}${j && j.fin ? ` ; son journal : « ${propre(j.fin, 110)} »` : ''}.` } : null;
  },
  chercheur(L, A) {
    const j = A.hote('chercheur'), c = L.campagnes;
    if (!j && !c) return null;
    const vide = j && /aucune retenue/i.test(j.fin || '');
    return { texte: `${j && j.fin ? `Dernier passage : « ${propre(j.fin, 90)} »` : 'Journal non relevé'}${c ? ` ; ${pluriel(c.n7, 'campagne proposée', 'campagnes proposées')} en 7 jours, ${nombre(c.lancees7)} lancée${c.lancees7 > 1 ? 's' : ''}` : ''}.`,
      ...(vide ? { etat: 'vide' } : {}) };
  },
  decoupeur(L) {
    const d = L.demandes; if (!d) return null;
    const enCours = d.filter((x) => !['fait', 'erreur', 'annule'].includes(x.etat)).reduce((s, x) => s + x.n, 0);
    const dernier = d.map((x) => x.dernier).filter(Boolean).map(iso).sort().pop() || null;
    return { texte: enCours ? `${pluriel(enCours, 'demande', 'demandes')} en cours.` : `Aucune demande en cours${dernier ? ` ; la dernière le ${court(jourDe(dernier))}` : ''}.`, dernier,
      ...(enCours ? {} : { etat: 'arret', depuis: dernier }) };
  },
  publication(L, A) {
    const c = L.clips; if (!c) return null;
    const dernier = c.map((x) => x.publie_le).filter(Boolean).map(iso).sort().pop() || null;
    const enAttente = (L.buffer || []).filter((x) => x.etat === 'a_faire').reduce((s, x) => s + x.n, 0);
    const vieux = !dernier || A.maintenant - new Date(dernier) > 3 * 24 * H;
    return { texte: `${pluriel(c.length, 'clip publié', 'clips publiés')} en tout${dernier ? `, le dernier ${quand(dernier, A.auj)}` : ''} ; ${nombre(enAttente)} en file.`, dernier,
      ...(vieux && !enAttente ? { etat: 'arret', depuis: dernier } : {}) };
  },
  verif_pub(L, A) {
    const c = L.clips; if (!c) return null;
    const dernier = c.map((x) => x.controle_le).filter(Boolean).map(iso).sort().pop() || null;
    if (!dernier) return { texte: 'Aucun lien encore vérifié.' };
    const en = c.filter((x) => x.etat === 'en_ligne').length, dis = c.filter((x) => x.etat === 'disparu').length;
    const vieux = A.maintenant - new Date(dernier) > 26 * H;
    return { texte: `Dernière vérification ${quand(dernier, A.auj)} : ${nombre(en)} en ligne, ${nombre(dis)} introuvables.`, dernier,
      ...(vieux ? { etat: 'panne', depuis: dernier, derniere_panne: { le: dernier, texte: `n’a plus vérifié depuis le ${court(jourDe(dernier))}` } } : {}) };
  },
  trading(L, A, a) {
    if (!L.trading) return null;
    const l = L.trading.filter((t) => a.echelles.includes(t.agent) && t.valeur != null);
    if (!l.length) return { texte: 'Pas encore de portefeuille.' };
    const flux = L.bougie;
    const texte = l.map((t) => `${l.length > 1 ? t.libelle.replace(/^à (la |l’)?/, '') + ' : ' : ''}${euros(t.valeur)} (${pourcent(t.perf)}) · ${pluriel(t.operations, 'opération', 'opérations')} · ${euros(t.frais)} de frais`).join(' ; ') + '.';
    if (!flux || A.maintenant - new Date(flux) > 15 * 60e3) {
      return { texte, dernier: flux, etat: 'panne', depuis: flux, derniere_panne: { le: flux, texte: flux ? `le flux des cours ne bouge plus depuis ${quand(flux, A.auj)}` : 'aucun cours reçu' } };
    }
    const perdant = l.find((t) => t.perf <= -50);
    if (perdant) return { texte, dernier: flux, etat: 'panne', depuis: perdant.depuis, derniere_panne: { le: null, texte: `${pourcent(perdant.perf)} depuis le ${court(jourDe(perdant.depuis))} : les frais mangent ses gains` } };
    return { texte, dernier: flux };
  },
  bourse(L) {
    if (!L.bourse) return null;
    const reel = L.bourse.filter((b) => b.mode === 'reel');
    if (!reel.length) return { texte: 'Pas encore de calcul en réel.' };
    const v = reel.map((b) => b.valeur), jour = reel.map((b) => b.jour).sort().pop();
    return { texte: `En réel, le ${court(jour)} : de ${euros(Math.min(...v))} à ${euros(Math.max(...v))} sur 1 000 € fictifs.` };
  },
  directeur(L, A) {
    const d = L.direction; if (!d) return null;
    return { texte: `Dernier bilan ${quand(d.le, A.auj)} : ${pluriel(d.alertes, 'alerte', 'alertes')}${d.premiere ? ` ; « ${propre(d.premiere, 120)} »` : ''}.` };
  },
  penseur(L, A) {
    const p = L.pensees, r = (L.runsDerniers || []).find((x) => x.agent === 'penseur');
    const dernier = [p && p.dernier, r && r.dernier].filter(Boolean).map(iso).sort().pop() || null;
    if (!dernier) return null;
    const vieux = A.maintenant - new Date(dernier) > 50 * H;
    return { texte: p && p.nuit ? `Dernière nuit, le ${court(p.nuit)} : ${pluriel(p.n, 'idée', 'idées')}.` : 'Aucune idée encore écrite.', dernier,
      ...(vieux ? { etat: 'panne', depuis: dernier, derniere_panne: { le: dernier, texte: `aucune idée depuis le ${court(jourDe(dernier))}` } } : {}) };
  },
  veille(L) {
    if (!L.veillePoles) return null;
    const t = L.veillePoles.reduce((s, x) => s + x.n, 0);
    return { texte: `${pluriel(t, 'trouvaille', 'trouvailles')} en 24 h${t ? ' : ' + L.veillePoles.map((x) => `${x.pole} ${x.n}`).join(', ') : ''}.` };
  },
  hermes(L, A) {
    const s = L.hermes, dernier = L.ordresStats && L.ordresStats.dernier_traite;
    if (!s) return { texte: 'Injoignable depuis le cockpit.', dernier, etat: 'panne', depuis: null, derniere_panne: { le: null, texte: 'le relais d’Hermes ne répond pas' } };
    const e = String(s.etat || 'inconnu');
    if (/indisponible|panne|erreur/.test(e)) return { texte: `Indisponible${s.raison ? ` : ${propre(s.raison, 120)}` : ''}.`, dernier, etat: 'panne', depuis: null, derniere_panne: { le: null, texte: propre(s.raison || e, 140) } };
    return { texte: `${e === 'libre' ? 'Disponible' : 'Au travail'}${dernier ? ` ; dernier ordre traité ${quand(dernier, A.auj)}` : ''}.`, dernier, etat: 'ok' };
  },
  ordres(L, A) {
    const o = L.ordresOuverts; if (!o) return null;
    const claude = o.filter((x) => ['claude', 'routine'].includes(x.pour));
    const vieux = claude.filter((x) => A.maintenant - new Date(x.cree_le) > 24 * H).sort((a, b) => new Date(a.cree_le) - new Date(b.cree_le));
    const texte = claude.length ? `${pluriel(claude.length, 'ordre attend', 'ordres attendent')} Claude ; le plus ancien, n° ${claude.slice().sort((a, b) => a.id - b.id)[0].id}.` : 'Aucun ordre n’attend Claude.';
    if (vieux.length) return { texte, dernier: A.maintenant, etat: 'panne', depuis: vieux[0].cree_le,
      derniere_panne: { le: vieux[0].cree_le, texte: `${pluriel(vieux.length, 'ordre attend', 'ordres attendent')} depuis plus de 24 h ; le plus ancien, n° ${vieux[0].id}, depuis le ${court(jourDe(vieux[0].cree_le))}` } };
    return { texte, dernier: A.maintenant };
  },
  courrier(L, A) {
    const c = L.courriels; if (!c) return null;
    const vieux = !c.dernier || A.maintenant - new Date(c.dernier) > 2 * H;
    return { texte: `${pluriel(c.classes24, 'e-mail classé', 'e-mails classés')} en 24 h${c.dernier ? ` ; le dernier ${quand(c.dernier, A.auj)}` : ''}.`, dernier: c.dernier,
      ...(vieux ? { etat: 'panne', depuis: c.dernier, derniere_panne: { le: c.dernier, texte: c.dernier ? `plus rien de classé depuis ${quand(c.dernier, A.auj)}` : 'rien de classé' } } : {}) };
  },
  sentinelle(L, A) {
    const g = A.hote('gardien');
    return g && g.fin ? { texte: `Gardien, à ${heure(g.modifie)} : « ${propre(g.fin, 110)} ».` } : null;
  },
  sauvegardes(L, A) {
    const b = A.hote('backup'), o = A.hote('offsite'), r = A.hote('restauration');
    if (!b && !o) return null;
    // « backup <date> : n8n 3.8M, raime_brain 42M » → « n8n 3.8M, cerveau 42M » ; la copie R2 et la restauration : OK, sinon leur ligne
    const apres = (t) => propre(String(t || '').replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, '').replace(/^[^:]*:\s*/, '').replace(/raime_brain/g, 'cerveau'), 110);
    const ok = (t) => (/\bOK\b|PASS/.test(t || '') && !/\b(échec|echec|erreur|error|failed)\b/i.test(t || '') ? 'OK' : apres(t));
    return { texte: [b && `Sauvegarde ${quand(b.modifie, A.auj)} (${apres(b.fin)})`, o && `copie hors du serveur ${quand(o.modifie, A.auj)} : ${ok(o.fin)}`,
      r && `restauration testée ${quand(r.modifie, A.auj)} : ${ok(r.fin)}`].filter(Boolean).join(' ; ') + '.' };
  },
  livraison(L, A) {
    const p = A.porte; if (!p) return null;
    const d = p.dernieres[0];
    return { texte: `${pluriel(p.n, 'livraison', 'livraisons')}${p.depuis ? ` depuis le ${court(jourDe(p.depuis))}` : ''} ; la dernière ${d ? quand(d.le, A.auj) : '—'}${d && d.sujet ? ` : « ${propre(d.sujet, 90)} »` : ''}.`,
      dernier: d && d.le };
  },
  machine(L, A) {
    const conteneurs = A.conteneurs, f = (A.factures || []).find((x) => x.cle === 'hetzner');
    if (!conteneurs && !f) return null;
    const enService = conteneurs ? conteneurs.filter((c) => /^Up\b/.test(c.etat)).length : null;
    const texte = `${conteneurs ? `${pluriel(enService, 'conteneur', 'conteneurs')} en service sur ${nombre(conteneurs.length)}` : 'Conteneurs non relevés'}`
      + `${f && f.dernierMail ? ` ; dernier e-mail de Hetzner : « ${f.dernierMail.sujet} », ${quand(f.dernierMail.le, A.auj)}` : ''}.`;
    if (f && f.etat === 'panne') return { texte, dernier: A.releveLe, etat: 'panne', depuis: f.dernierMail ? f.dernierMail.le : null,
      derniere_panne: { le: f.dernierMail ? f.dernierMail.le : null, texte: 'facture Hetzner impayée' } };
    return { texte, dernier: A.releveLe };
  },
  inutiles(L, A) {
    if (!A.conteneurs) return null;
    const l = A.conteneurs.filter((c) => TEXTES.conteneurs_inutiles.includes(c.nom));
    const allumes = l.filter((c) => /^Up\b/.test(c.etat));
    return { texte: allumes.length ? allumes.map((c) => `${c.nom.replace(/^raime-|-1$/g, '')} : ${c.etat.replace(/^Up/, 'allumé depuis').replace(/weeks?/, 'semaines').replace(/days?/, 'jours').replace(/hours?/, 'heures')}`).join(' ; ') + '.' : 'Plus rien d’allumé pour rien.',
      etat: allumes.length ? 'arret' : 'ok', dernier: A.releveLe };
  },
};

// ── L'assemblage ──────────────────────────────────────────────────────────────────────────────
async function assembler({ maintenant = new Date(), executant = EXECUTANT, fetch = globalThis.fetch } = {}) {
  const t0 = Date.now();
  const erreurs = [];
  const lecteur = (pool, base) => async (nom, sql, params) => {
    try { return (await pool.query(sql, params || [])).rows; } catch (e) { erreurs.push(`${nom} : ${pourquoi(e)}`); return null; }
  };
  const B = lecteur(bases.cerveau, 'cerveau'), N = lecteur(bases.n8n, 'n8n');
  const un = (p) => p.then((r) => (r ? r[0] || null : null));
  const auj = agenda.aujourdhui(maintenant);
  const flux = [...new Set(TEXTES.agents.map((a) => a.src && a.src.n8n).filter(Boolean))];
  const simulations = import(require('url').pathToFileURL(path.join(__dirname, 'simulations.mjs')).href);
  const facturesMail = TEXTES.factures.filter((f) => f.courriels);

  const [passages, debutPassages, causes, executions, debutN8n, actifs, releve, vitrines, vitStats, appelsR, rappels, autresRappels,
    offres, candStats, candAlerte, outreach, outStats, runs, runsAgents, runsDerniers, ordresOuverts, ordresStats, enRetard, clips, demandes, campagnes,
    buffer, direction, courriels, budget, pensees, veillePoles, envoiVit, envoiConf, bougie, bourseJour, prosStats, mails, hermes, trading, bourse, fureteur] = await Promise.all([
    B('passages', `WITH a AS (SELECT agent, max(fin_le) FILTER (WHERE statut <> 'ok') AS de, max(fin_le) FILTER (WHERE statut = 'ok') AS dok FROM boucle_passages GROUP BY agent)
      SELECT p.agent, count(*)::int AS n, min(p.fin_le) AS premier, max(p.fin_le) AS dernier, (array_agg(p.statut ORDER BY p.fin_le DESC))[1] AS statut,
        a.de AS dernier_echec, count(*) FILTER (WHERE p.statut <> 'ok')::int AS echecs,
        min(p.fin_le) FILTER (WHERE p.statut = 'ok' AND p.fin_le > a.de) AS gueri_le,
        min(p.fin_le) FILTER (WHERE p.statut <> 'ok' AND (a.dok IS NULL OR p.fin_le > a.dok)) AS panne_depuis
      FROM boucle_passages p JOIN a USING (agent) GROUP BY p.agent, a.de, a.dok`),
    un(B('passages', 'SELECT min(fin_le) AS debut FROM boucle_passages')),
    B('journal', `SELECT DISTINCT ON (x.agent) x.agent, x.motif, x.created_at FROM (SELECT substring(changement from 'Échec de l''agent (.+)$') AS agent, motif, created_at
      FROM journal WHERE acteur = 'boucle' AND changement LIKE 'Échec de l''agent %') x ORDER BY x.agent, x.created_at DESC`),
    N('exécutions n8n', `WITH e AS (SELECT "workflowId" AS w, status, "startedAt" AS le FROM execution_entity WHERE "workflowId" = ANY($1) AND "startedAt" IS NOT NULL),
      a AS (SELECT w, max(le) FILTER (WHERE status IN ('error', 'crashed')) AS de, max(le) FILTER (WHERE status = 'success') AS dok FROM e GROUP BY w)
      SELECT e.w AS id, count(*)::int AS n, count(*) FILTER (WHERE e.le > now() - interval '7 days')::int AS n7, min(e.le) AS premier, max(e.le) AS dernier, (array_agg(e.status ORDER BY e.le DESC))[1] AS statut,
        a.de AS dernier_echec, count(*) FILTER (WHERE e.status IN ('error', 'crashed'))::int AS echecs,
        min(e.le) FILTER (WHERE e.status = 'success' AND e.le > a.de) AS gueri_le,
        min(e.le) FILTER (WHERE e.status IN ('error', 'crashed') AND (a.dok IS NULL OR e.le > a.dok)) AS panne_depuis
      FROM e JOIN a USING (w) GROUP BY e.w, a.de, a.dok`, [flux]),
    un(N('exécutions n8n', 'SELECT min("startedAt") AS debut FROM execution_entity')),
    N('flux n8n', 'SELECT id, name, active FROM workflow_entity WHERE id = ANY($1)', [flux]),
    un(B('relevé du serveur', 'SELECT le, donnees FROM releve_hote ORDER BY id DESC LIMIT 1')),
    B('vitrines', `SELECT id, nom, metier, ville, adresse, telephone, email, slug, statut, motif, envoye_le, cree_le, maj_le, source,
        CASE WHEN statut IN ('brouillon', 'valide', 'envoye') THEN sujet END AS sujet, CASE WHEN statut IN ('brouillon', 'valide', 'envoye') THEN corps END AS corps
      FROM vitrines WHERE nom IS NOT NULL AND statut NOT IN ('ecarte', 'nouveau') ORDER BY id`),
    B('vitrines', `SELECT statut, count(*)::int AS n, count(*) FILTER (WHERE cree_le > now() - interval '24 hours')::int AS n24,
      count(*) FILTER (WHERE slug IS NOT NULL)::int AS maquettes, count(*) FILTER (WHERE slug IS NOT NULL AND cree_le > now() - interval '24 hours')::int AS maquettes24
      FROM vitrines GROUP BY statut`),
    B('appels', 'SELECT siren, etat, note, rappel_le::text AS rappel_le, maj_le FROM appels'),
    B('rappels', `SELECT id, cible_type, cible_id, nom, motif, note, priorite, statut, resultat, to_char(echeance AT TIME ZONE '${ZONE}', 'YYYY-MM-DD') AS jour, cree_le, fait_le
      FROM rappels WHERE cible_type IN ('prospect', 'vitrine') AND cible_id IS NOT NULL ORDER BY coalesce(fait_le, cree_le), id`),
    un(B('rappels', `SELECT count(*)::int AS n FROM rappels WHERE statut = 'a_faire' AND cible_type NOT IN ('prospect', 'vitrine', 'libre')`)),
    B('candidatures', `SELECT id, statut, offre->>'titre' AS titre, trim(offre->>'entreprise') AS entreprise, offre->>'lieu' AS lieu, offre->>'source' AS source,
        coalesce(nullif(offre->>'url_externe', ''), offre->>'lien') AS lien, offre->>'score' AS score, coalesce(fiche ? 'lettre', false) AS lettre,
        envoi->>'statut' AS envoi_statut, envoi->>'detail' AS envoi_detail, maj
      FROM candidatures WHERE statut IN ('a_valider', 'valide', 'a_toi', 'hors_auto', 'envoye', 'entretien') AND coalesce(offre->>'pays', '') <> 'FR'
      ORDER BY maj DESC`),
    un(B('candidatures', `SELECT max(cree_le) AS derniere, count(*) FILTER (WHERE cree_le > now() - interval '24 hours')::int AS n24,
        count(*) FILTER (WHERE statut = 'envoye')::int AS envoyees, count(*) FILTER (WHERE statut = 'a_toi')::int AS a_toi,
        count(*) FILTER (WHERE statut = 'hors_auto' AND coalesce(offre->>'pays', '') <> 'FR')::int AS sans_canal,
        count(*) FILTER (WHERE statut = 'ecartee' AND maj > now() - interval '7 days')::int AS ecartees7,
        count(*) FILTER (WHERE statut = 'envoye' AND maj > now() - interval '7 days')::int AS envois7,
        count(*) FILTER (WHERE statut = 'envoye' AND maj >= (date_trunc('day', now() AT TIME ZONE '${ZONE}') AT TIME ZONE '${ZONE}'))::int AS envois_jour,
        max(maj) FILTER (WHERE statut = 'envoye') AS dernier_envoi, max(maj) FILTER (WHERE fiche ? 'lettre') AS derniere_fiche,
        count(*) FILTER (WHERE statut = 'valide')::int AS valides, min(maj) FILTER (WHERE statut = 'valide') AS valide_depuis,
        (array_agg(envoi->>'detail' ORDER BY maj) FILTER (WHERE statut = 'valide'))[1] AS valide_detail
      FROM candidatures`)),
    un(B('candidatures', 'SELECT max(le) AS le FROM candidatures_alertes')).then((r) => (r ? r.le : null)),
    N('outreach', `SELECT o.id, o.siren, o.prospect_name, o.segment, o.to_email, o.subject, o.status, o.created_at, o.sent_at, o.reply_at,
        CASE WHEN o.status = 'brouillon' THEN o.body END AS body
      FROM outreach o WHERE o.siren ~ '^[0-9]{9}$' AND o.status IN ('brouillon', 'valide', 'envoye', 'non_recu') ORDER BY o.created_at`),
    un(N('outreach', `SELECT count(*) FILTER (WHERE status = 'envoye' AND sent_at > now() - interval '24 hours')::int AS envoyes24,
        count(*) FILTER (WHERE status = 'envoye' AND sent_at > now() - interval '7 days')::int AS envoyes7, max(sent_at) FILTER (WHERE status = 'envoye') AS dernier_envoi,
        count(*) FILTER (WHERE status = 'valide')::int AS valides, count(*) FILTER (WHERE status = 'brouillon')::int AS brouillons,
        count(*) FILTER (WHERE created_at > now() - interval '24 hours')::int AS ecrits24, max(reply_at) AS derniere_reponse,
        count(*) FILTER (WHERE reply_at > now() - interval '7 days')::int AS reponses7 FROM outreach`)),
    B('jetons', `SELECT model, sum(coalesce(tokens_in, 0) + coalesce(tokens_out, 0))::bigint AS j30,
        coalesce(sum(coalesce(tokens_in, 0) + coalesce(tokens_out, 0)) FILTER (WHERE created_at > now() - interval '7 days'), 0)::bigint AS j7,
        coalesce(sum(cost_usd), 0)::float AS cout, string_agg(DISTINCT agent, ', ' ORDER BY agent) AS agents
      FROM agent_runs WHERE created_at > now() - interval '30 days' GROUP BY model ORDER BY 2 DESC`),
    B('jetons', `SELECT agent, model, sum(coalesce(tokens_in, 0) + coalesce(tokens_out, 0))::bigint AS j7 FROM agent_runs
      WHERE created_at > now() - interval '7 days' GROUP BY agent, model`),
    B('jetons', 'SELECT agent, max(created_at) AS dernier FROM agent_runs GROUP BY agent'),
    B('ordres', `SELECT id, texte, etat, pour, source, cree_le FROM commandes WHERE etat IN ('a_faire', 'en_cours') ORDER BY id`),
    un(B('ordres', 'SELECT max(traite_le) AS dernier_traite FROM commandes')),
    ordresRetard.enRetard((sql, p) => bases.cerveau.query(sql, p || []).then((r) => r.rows)).catch((e) => { erreurs.push(`ordres en retard (cerveau) : ${pourquoi(e)}`); return null; }),
    B('clips', 'SELECT plateforme, compte, etat, publie_le, controle_le, coalesce(declare_whop, false) AS declare_whop FROM clips_publies'),
    B('clips', 'SELECT etat, count(*)::int AS n, max(maj) AS dernier FROM clips_demandes GROUP BY etat'),
    un(B('clips', `SELECT max(le)::text AS derniere, count(*) FILTER (WHERE le > current_date - 7)::int AS n7,
      count(*) FILTER (WHERE lancee AND le > current_date - 7)::int AS lancees7 FROM campagnes_proposees`)),
    B('clips', 'SELECT etat, count(*)::int AS n, max(maj) AS dernier FROM clips_buffer GROUP BY etat'),
    un(B('direction', `SELECT le, jsonb_array_length(coalesce(bilan->'alertes', '[]'::jsonb))::int AS alertes, split_part(texte, E'\\n', 1) AS premiere
      FROM direction ORDER BY le DESC LIMIT 1`)),
    un(B('courriels', `SELECT count(*) FILTER (WHERE classe_le > now() - interval '24 hours')::int AS classes24, max(classe_le) AS dernier FROM courriels`)),
    un(B('budget', 'SELECT le, mode, chiffres FROM regime_budget ORDER BY le DESC LIMIT 1')),
    un(B('pensées', `SELECT max(nuit)::text AS nuit, max(cree_le) AS dernier, count(*) FILTER (WHERE nuit = (SELECT max(nuit) FROM pensees))::int AS n FROM pensees`)),
    B('veille', `SELECT pole, count(*)::int AS n FROM veille_poles WHERE vu_le > now() - interval '24 hours' GROUP BY pole ORDER BY 2 DESC`),
    N('envoi des vitrines', 'SELECT statut, count(*)::int AS n, max(envoye_le) AS dernier FROM vitrines_envoi WHERE id > 0 GROUP BY statut'),
    un(N('envoi des vitrines', 'SELECT mode, plafond_jour FROM vitrines_envoi_config WHERE id = 1')),
    un(B('trading', 'SELECT max(debut) AS le FROM trading_bougies')).then((r) => (r ? r.le : null)),
    un(B('bourse', `SELECT max(jour)::text AS jour FROM bourse_valeurs WHERE mode = 'reel'`)),
    un(N('prospects', `SELECT count(*) FILTER (WHERE found_at > now() - interval '24 hours')::int AS trouves24,
        count(*) FILTER (WHERE (to_jsonb(p) ->> 'furete_le')::timestamptz > now() - interval '24 hours')::int AS lus24,
        count(*) FILTER (WHERE (to_jsonb(p) ->> 'furete_le')::timestamptz > now() - interval '24 hours' AND to_jsonb(p) ->> 'site_preuve' IS NOT NULL)::int AS prouves24
      FROM prospects p`)),
    Promise.all(facturesMail.map((f) => B('courriels', `SELECT de, sujet, recu_le FROM courriels WHERE de ~* $1 AND sujet ~* $2 ORDER BY recu_le DESC LIMIT 6`,
      [f.courriels.de, f.courriels.sujets]).then((r) => [f.cle, r]))),
    fetch(executant + '/sante', { signal: AbortSignal.timeout(2500) }).then((r) => r.json()).catch(() => null),
    simulations.then((s) => s.resumeTrading(bases.cerveau)).catch((e) => { erreurs.push(`trading (cerveau) : ${pourquoi(e)}`); return null; }),
    simulations.then((s) => s.resumeBourse(bases.cerveau)).catch((e) => { erreurs.push(`bourse (cerveau) : ${pourquoi(e)}`); return null; }),
    B('journal', `SELECT changement, motif, created_at FROM journal WHERE acteur = 'fureteur' AND created_at > now() - interval '24 hours'`),
  ]);
  const { ECHELLES } = await simulations.catch(() => ({ ECHELLES: {} }));

  // ── Les prospects (base n8n) : ceux qu'on a écrits, appelés ou rappelés, et ceux à appeler sans jamais avoir été écrits ──
  const sirens = [...new Set([...(outreach || []).map((o) => o.siren), ...(appelsR || []).map((a) => a.siren).filter((s) => /^\d{9}$/.test(s)),
    ...(rappels || []).filter((r) => r.cible_type === 'prospect').map((r) => r.cible_id)])];
  const prospects = await N('prospects', `SELECT p.siren, p.name, p.naf, p.sector, p.city, p.telephone, p.contact_email, p.status, p.website,
      to_jsonb(p) ->> 'site_preuve' AS site_preuve, p.found_at, NOT EXISTS (SELECT 1 FROM outreach o WHERE o.siren = p.siren) AS jamais_ecrit
    FROM prospects p WHERE p.siren = ANY($1::text[])
      OR (to_jsonb(p) ->> 'site_preuve' IS NOT NULL AND coalesce(p.telephone, '') <> '' AND coalesce(p.status, '') <> 'exclu'
          AND NOT EXISTS (SELECT 1 FROM outreach o WHERE o.siren = p.siren))`, [sirens]);

  // ── Le relevé du serveur : journaux des tâches planifiées, porte, conteneurs ──
  const R = releve && releve.donnees ? releve.donnees : null;
  const releveLe = releve ? iso(releve.le) : null;
  const ageReleve = releveLe ? Math.round((maintenant - new Date(releveLe)) / 60e3) : null;
  const releveFrais = ageReleve != null && ageReleve <= 30;
  const hote = (k) => {
    const j = releveFrais && R && R.journaux && R.journaux[k];
    return j && j.modifie ? { modifie: j.modifie, fin: Array.isArray(j.fin) ? j.fin.filter(Boolean).slice(-1)[0] : j.fin, lignes: j.fin } : null;
  };
  const porte = releveFrais && R && R.porte ? livraisons(R.porte) : null;
  const conteneurs = releveFrais && R && Array.isArray(R.conteneurs) ? R.conteneurs : null;

  // ── Les factures : le relevé du 08/10, et les e-mails de facturation reçus depuis (boîte Gmail, classée par Jarvis) ──
  const mailsPar = Object.fromEntries((mails || []).map(([k, r]) => [k, r]));
  const factures = TEXTES.factures.map((f) => {
    const sortie = { ...f, lignes: f.lignes.slice(), date: TEXTES.factures_date };
    const m = (mailsPar[f.cle] || []).filter((x) => jourDe(x.recu_le) > TEXTES.factures_date);
    if (m.length) {
      for (const x of m.slice().reverse()) sortie.lignes.push([court(jourDe(x.recu_le)), `E-mail reçu : « ${propre(x.sujet, 90)} »`]);
      sortie.dernierMail = { le: iso(m[0].recu_le), sujet: propre(m[0].sujet, 90) };
      if (/warning|reminder|mahnung|overdue|failed|échec|rappel|unpaid|impay/i.test(m[0].sujet)) {
        Object.assign(sortie, { etat: 'panne', etatTxt: 'Paiement en retard', etatDate: jourDe(m[0].recu_le) });
      } else if (/receipt|reçu|paid|payé|payment received|zahlungseingang/i.test(m[0].sujet)) {
        Object.assign(sortie, { etat: 'ok', etatTxt: 'Payé', etatDate: jourDe(m[0].recu_le) });
      }
    }
    if (mailsPar[f.cle] === null) sortie.lecture = 'courriels illisibles';
    return sortie;
  });

  // ── Les clients : commerces (vitrines) et entreprises (prospects), avec leurs appels et rappels ──
  const appelDe = new Map((appelsR || []).map((a) => [a.siren, a]));
  const rappelsPar = new Map();
  for (const r of rappels || []) {
    const cle = (r.cible_type === 'vitrine' ? 'v' : 'p') + r.cible_id;
    if (!rappelsPar.has(cle)) rappelsPar.set(cle, []);
    rappelsPar.get(cle).push(r);
  }
  const RESULTAT = { joint: 'joint', pas_joint: 'pas joint', rappeler: 'à rappeler', interesse: 'intéressé', pas_interesse: 'pas intéressé', gagne: 'gagné', fait: 'fait' };
  const ETAT_APPEL = { appele: 'joint', pas_interesse: 'pas intéressé', plus_tard: 'à rappeler' };
  function suivi(cle, cleAppel) {
    const rs = rappelsPar.get(cle) || [], ap = appelDe.get(cleAppel) || null;
    const ouvert = rs.filter((r) => r.statut === 'a_faire').pop() || null;
    const faits = rs.filter((r) => r.statut === 'fait' && r.resultat).sort((a, b) => new Date(a.fait_le) - new Date(b.fait_le));
    const dernierFait = faits.pop() || null;
    const histo = [];
    for (const r of rs) {
      if (r.statut === 'fait' && r.fait_le) histo.push([iso(r.fait_le), `Appel noté : ${RESULTAT[r.resultat] || r.resultat || 'fait'}${r.note ? ` — ${r.note}` : ''}`]);
      else if (r.statut === 'a_faire') histo.push([iso(r.cree_le), `Rappel prévu le ${court(r.jour)}${r.note ? ` — ${r.note}` : r.motif ? ` — ${r.motif}` : ''}`]);
      else if (r.statut === 'annule' && r.fait_le) histo.push([iso(r.fait_le), 'Rappel annulé']);
    }
    if (ap && !rs.some((r) => r.statut === 'fait')) histo.push([iso(ap.maj_le), `Appel noté : ${ETAT_APPEL[ap.etat] || ap.etat}${ap.note ? ` — ${ap.note}` : ''}`]);
    return { ouvert, dernierFait, ap, histo };
  }
  const trier = (h) => h.filter(([le]) => le).sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([le, t]) => [court(jourDe(le)), t]);
  const dernierTexte = (s, envoye, defaut) => s.dernierFait ? `Appel du ${court(jourDe(s.dernierFait.fait_le))} : ${RESULTAT[s.dernierFait.resultat] || s.dernierFait.resultat}`
    : s.ap ? `Appel du ${court(jourDe(s.ap.maj_le))} : ${ETAT_APPEL[s.ap.etat] || s.ap.etat}` : envoye ? envoye : defaut;

  const clients = [];
  for (const v of vitrines || []) {
    const cle = 'v' + v.id, s = suivi(cle, cle), res = s.dernierFait && s.dernierFait.resultat;
    let etape;
    if (v.statut === 'pas_interesse' || (s.ap && s.ap.etat === 'pas_interesse') || res === 'pas_interesse') etape = 'non';
    else if (v.statut === 'client' || res === 'gagne') etape = 'gagne';
    else if (res === 'interesse') etape = 'interesse';
    else if (s.ouvert) etape = 'rappel';
    else if (s.ap && s.ap.etat === 'appele') etape = 'appele';
    else if (v.statut === 'repondu') etape = 'repondu';
    else if (v.statut === 'envoye') etape = 'attente';
    else if (v.statut === 'brouillon') etape = 'aenvoyer';
    else if (v.statut === 'valide') etape = v.telephone ? 'valide' : 'completer';
    else if (v.statut === 'a_completer') etape = 'completer';
    else if (v.statut === 'a_appeler') etape = 'aappeler';
    else etape = v.statut;
    const envoye = v.envoye_le ? jourDe(v.envoye_le) : null;
    const histo = s.histo.slice();
    if (v.envoye_le) histo.push([iso(v.envoye_le), 'Maquette envoyée par e-mail']);
    if (v.cree_le) histo.push([iso(v.cree_le), v.source === 'sirene' ? 'Trouvé au registre des entreprises, sans site' : 'Trouvé par le Chercheur de commerces']);
    clients.push({ cle, seg: 'site', vid: v.id, statut: v.statut, nom: v.nom, metier: v.metier || 'commerce', ville: v.ville || '', tel: tel(v.telephone), email: v.email || '',
      slug: v.slug || '', histo: trier(histo), etape, envoye, rappel: s.ouvert ? s.ouvert.jour : null,
      dernier: dernierTexte(s, envoye ? `Maquette envoyée le ${court(envoye)}` : null, etape === 'aenvoyer' ? 'E-mail prêt, pas encore validé' : 'Jamais appelé'),
      ...(etape === 'completer' ? { raison: v.statut === 'valide' ? 'Validée, jamais partie : numéro de téléphone manquant' : 'Numéro introuvable : à lire dans un annuaire' } : {}),
      ...(v.sujet ? { sujet: v.sujet, corps: v.corps || '' } : {}) });
  }
  const parSiren = new Map();
  for (const o of outreach || []) { if (!parSiren.has(o.siren)) parSiren.set(o.siren, []); parSiren.get(o.siren).push(o); }
  const brouillons = [];
  for (const p of prospects || []) {
    if (appels.exclu(p)) continue;
    const cle = 'p' + p.siren, s = suivi(cle, p.siren), res = s.dernierFait && s.dernierFait.resultat;
    const os = parSiren.get(p.siren) || [];
    const brouillon = os.filter((o) => o.status === 'brouillon').pop() || null;
    const parti = os.filter((o) => o.status === 'envoye' && o.sent_at).sort((a, b) => new Date(a.sent_at) - new Date(b.sent_at)).pop() || null;
    const valide = os.find((o) => o.status === 'valide') || null;
    const reponse = os.filter((o) => o.reply_at).sort((a, b) => new Date(a.reply_at) - new Date(b.reply_at)).pop() || null;
    if (!os.length && !s.ap && !(rappelsPar.get(cle) || []).length && !(p.site_preuve && p.telephone && p.jamais_ecrit)) continue;
    let etape;
    if ((s.ap && s.ap.etat === 'pas_interesse') || res === 'pas_interesse') etape = 'non';
    else if (res === 'gagne') etape = 'gagne';
    else if (res === 'interesse') etape = 'interesse';
    else if (s.ouvert) etape = 'rappel';
    else if (s.ap && s.ap.etat === 'appele') etape = 'appele';
    else if (reponse) etape = 'repondu';
    else if (parti) etape = 'attente';
    else if (valide) etape = 'valide';
    else if (brouillon) etape = 'aenvoyer';
    else if (os.some((o) => o.status === 'non_recu')) etape = 'nonrecu';
    else etape = p.telephone ? 'aappeler' : 'completer';
    const envoye = parti ? jourDe(parti.sent_at) : null;
    const histo = s.histo.slice();
    for (const o of os) {
      if (o.reply_at) histo.push([iso(o.reply_at), 'A répondu à l’e-mail']);
      if (o.sent_at && o.status === 'envoye') histo.push([iso(o.sent_at), `E-mail envoyé : « ${propre(o.subject, 70)} »`]);
      else if (o.status === 'brouillon') histo.push([iso(o.created_at), 'E-mail écrit, en attente de ta validation']);
      else if (o.status === 'valide') histo.push([iso(o.created_at), 'E-mail validé, il part au prochain envoi']);
    }
    if (p.site_preuve) histo.push([iso(p.found_at), 'Site prouvé par le Fureteur']);
    const nom = (brouillon || parti || os[0] || {}).prospect_name || agenda.joli(p.name) || p.siren;
    const client = { cle, seg: 'ia', siren: p.siren, nom, metier: appels.activite(p.naf, p.name, p.sector), ville: agenda.joli(p.city) || '', tel: tel(p.telephone),
      email: (brouillon && brouillon.to_email) || p.contact_email || '', histo: trier(histo), etape, envoye, rappel: s.ouvert ? s.ouvert.jour : null,
      dernier: dernierTexte(s, envoye ? `E-mail envoyé le ${court(envoye)}` : null, brouillon ? 'E-mail prêt, pas encore validé' : valide ? 'E-mail validé, pas encore parti' : 'Jamais contacté'),
      ...(etape === 'completer' ? { raison: 'Numéro de téléphone inconnu' } : {}),
      ...(brouillon ? { outreach: Number(brouillon.id), sujet: brouillon.subject || '', corps: brouillon.body || '' } : parti ? { sujet: parti.subject || '' } : {}) };
    clients.push(client);
    if (brouillon && etape === 'aenvoyer') brouillons.push([brouillon.created_at, cle]);
  }

  // ── Les rappels ouverts, la liste d'appels du jour, les relances à 7 jours ──
  const connus = new Set(clients.map((c) => c.cle));
  const rappelsOuverts = (rappels || []).filter((r) => r.statut === 'a_faire').map((r) => ({ id: Number(r.id), cle: (r.cible_type === 'vitrine' ? 'v' : 'p') + r.cible_id,
    nom: r.nom || '', jour: r.jour, note: r.note || '', motif: r.motif || '', priorite: Number(r.priorite) || 2 })).filter((r) => connus.has(r.cle));
  const plus = (j, n) => agenda.plusJours(j, n);
  const relancesDe = (seg) => {
    const futur = {}; let retard = 0;
    for (const c of clients) {
      if (c.seg !== seg || c.etape !== 'attente' || !c.envoye || rappelsOuverts.some((r) => r.cle === c.cle)) continue;
      const j = plus(c.envoye, appels.DELAI_JOURS);
      if (j < auj) retard++; else futur[j] = (futur[j] || 0) + 1;
    }
    return { jours: Object.fromEntries(Object.entries(futur).sort()), retard };
  };
  const relSite = relancesDe('site'), relIa = relancesDe('ia');
  // la même liste que la page (rendez-vous avec note, rappels, relances à 7 jours, nouveaux), pour la phrase de l'agent
  const liste = [];
  for (const seg of ['site', 'ia']) {
    const avec = new Set(rappelsOuverts.map((r) => r.cle));
    for (const r of rappelsOuverts) { const c = clients.find((x) => x.cle === r.cle); if (c && c.seg === seg && c.tel && r.jour <= auj && c.etape !== 'non') liste.push({ type: r.note ? 'rdv' : 'rappel' }); }
    for (const c of clients) {
      if (c.seg !== seg || !c.tel || avec.has(c.cle)) continue;
      if (c.etape === 'attente' && c.envoye && plus(c.envoye, appels.DELAI_JOURS) <= auj) liste.push({ type: 'relance' });
      else if (c.etape === 'aappeler') liste.push({ type: 'nouveau' });
    }
  }

  // ── Les offres d'emploi (Suisse seulement : une offre française n'est jamais proposée, règle du 06/10) ──
  const RAISONS = { site_employeur: 'le formulaire renvoie au site de l’employeur', question: 'une question dont la vraie réponse est inconnue', captcha: 'un captcha',
    incertain: 'envoi incertain : à vérifier avant de renvoyer', formulaire: 'le formulaire a refusé l’envoi' };
  const offresD = (offres || []).map((o) => ({ cle: o.id, titre: o.titre || 'Offre', entreprise: o.entreprise || '', lieu: o.lieu || '', source: o.source || '', lien: o.lien || '',
    score: Number(o.score) || null, lettre: !!o.lettre, statut: o.statut,
    etat: ['envoye', 'entretien'].includes(o.statut) ? 'envoye' : o.statut === 'a_valider' ? 'clic' : o.statut === 'valide' ? 'file' : o.source === 'Michael Page' ? 'mpage' : 'ouvrir',
    ...(o.statut === 'a_toi' && o.envoi_statut ? { raison: RAISONS[o.envoi_statut] || o.envoi_statut } : {}),
    ...(o.statut === 'valide' ? { depuis: iso(o.maj), detail: o.envoi_detail || null } : {}) }));

  // ── Les agents ──
  const passagesPar = new Map((passages || []).map((p) => [p.agent, p]));
  const causesPar = new Map((causes || []).map((c) => [c.agent, c.motif]));
  const execPar = new Map((executions || []).map((e) => [e.id, e]));
  const actifPar = new Map((actifs || []).map((w) => [w.id, w.active]));
  const debutBoucle = debutPassages && debutPassages.debut ? iso(debutPassages.debut) : null;
  const debutN = debutN8n && debutN8n.debut ? iso(debutN8n.debut) : null;
  const pres = (a, b) => a && b && Math.abs(new Date(a) - new Date(b)) < 2 * H;
  const A = { maintenant, auj, hote, porte, conteneurs, factures, releveLe, liste };
  const L = { vitrines, vitStats, envoiVit, envoiConf, prosStats, outStats, fureteur, executions, rappels, candStats, candAlerte, offres, campagnes, demandes, clips, buffer, trading, bougie: bougie ? iso(bougie) : null,
    bourse, direction, pensees, runsDerniers, veillePoles, hermes, ordresStats, ordresOuverts, courriels };
  const agentsD = TEXTES.agents.map((a) => {
    const src = a.src || {};
    const sources = [];
    for (const nom of src.boucle || []) {
      const p = passagesPar.get(nom);
      if (passages && !p) { sources.push({ etat: 'panne', dernier: null, depuis: null, derniere_panne: { le: null, texte: 'aucun passage enregistré' } }); continue; }
      if (p) sources.push(etatSource({ ...p, statut: p.statut === 'ok' ? 'ok' : 'echec', cause: causesPar.get(nom), debut_releve: pres(p.premier, debutBoucle) ? 'début du relevé des passages' : null }, src, maintenant));
    }
    if (src.n8n) {
      const e = execPar.get(src.n8n);
      if (actifs && actifPar.get(src.n8n) === false) sources.push({ etat: 'arret', dernier: e ? e.dernier : null, depuis: e ? e.dernier : null, derniere_panne: { le: null, texte: 'flux désactivé dans n8n' } });
      else if (e) sources.push(etatSource({ ...e, statut: ['error', 'crashed'].includes(e.statut) ? 'echec' : 'ok', debut_releve: pres(e.premier, debutN) ? 'plus ancienne trace gardée par n8n' : null }, src, maintenant));
      else if (executions) sources.push({ etat: 'panne', dernier: null, depuis: null, derniere_panne: { le: null, texte: 'aucune exécution gardée par n8n' } });
    }
    for (const k of src.hote || []) {
      if (k === 'porte' && porte) {
        const ok = porte.dernieres.find((x) => x.ok), ko = porte.dernieres.find((x) => !x.ok);
        sources.push({ etat: 'ok', dernier: ok ? ok.le : releveLe, sante: ko ? { type: 'sain', depuis: ok && ok.le > ko.le ? ok.le : releveLe, panne: ko.le } : { type: 'jamais', depuis: porte.depuis, debut_releve: 'journal de la porte' },
          ...(ko ? { derniere_panne: { le: ko.le, texte: 'version refusée par la vérification, retour arrière réussi' } } : {}) });
      } else if (k === 'conteneurs' && conteneurs) sources.push({ etat: 'ok', dernier: releveLe });
      else {
        const j = hote(k);
        if (j) sources.push(etatSource({ dernier: j.modifie, premier: null, statut: /\b(échec|echec|erreur|error|failed|traceback|exception)\b/i.test(j.fin || '') ? 'echec' : 'ok', cause: j.fin }, src, maintenant));
      }
    }
    const vie = fusionner(sources);
    const m = a.mesure && MESURES[a.mesure] ? MESURES[a.mesure](L, A, a) : null;
    const sortie = { secteur: a.secteur, id: a.id, nom: a.nom, etat: a.etat || 'afaire', rythme: a.rythme, outils: a.outils || [], sous: [],
      maintenant: a.maintenant, bloque: a.bloque, ensuite: a.ensuite, texte_le: TEXTES.date };
    if (a.outils_runs && runsAgents) {
      const parModele = {};
      for (const r of runsAgents.filter((x) => a.outils_runs.includes(x.agent))) parModele[r.model] = (parModele[r.model] || 0) + Number(r.j7);
      const chips = Object.entries(parModele).filter(([, n]) => n > 0).sort((x, y) => y[1] - x[1])
        .map(([mod, n]) => [mod.replace(/^Gemini · gemini-/, 'Gemini ').replace(/^local · /, ''), `${n >= 1000 ? Math.round(n / 1000) + ' k' : n} jetons / 7 j`, 'ia']);
      sortie.outils = [...chips, ...(a.outils || []).filter((o) => !/jetons \/ 7 j/.test(o[1]))];
      if (!chips.length && a.outils_runs.length > 1) sortie.outils.unshift(['Modèles', '0 jeton / 7 j', 'ia']);
    }
    if (m && m.texte) sortie.mesure = m.texte;
    // une mesure lue vaut preuve pour un agent qui n'a qu'elle (mesure, cockpit) ; jamais à la place d'une source qui n'a pas répondu
    const vivant = vie || (m && (m.etat || m.dernier || src.mesure || src.cockpit));
    if (!vivant && a.src) {   // une source prévue mais illisible maintenant : « non relevé », jamais l'état d'un autre jour
      Object.assign(sortie, { etat: 'inconnu', depuis: null, derniere_panne: { le: releveLe, texte: (a.src.hote || []).length
        ? (releveLe ? `le relevé du serveur date de ${quand(releveLe, auj)}` : 'pas encore de relevé du serveur') : 'sa source n’a pas pu être lue' } });
      return sortie;
    }
    if (!vivant) {   // aucune source en direct (à construire, en construction…) : l'état écrit le jour des textes
      Object.assign(sortie, { fige: true, etat: a.etat || 'afaire', ...(a.depuis ? { depuis: a.depuis } : {}), ...(a.duree ? { duree: a.duree } : {}) });
      return sortie;
    }
    const base = vie || { etat: 'ok', dernier: null };
    let etat = base.etat;
    if (etat !== 'panne' && etat !== 'arret' && m && m.etat) etat = m.etat;              // la mesure voit plus loin que le passage : à vide, en panne, à l'arrêt
    if (etat === 'ok' && a.constat) { etat = a.constat; sortie.constat_le = TEXTES.date; }  // un jugement fait à la main ce jour-là
    sortie.etat = etat;
    sortie.dernier = (m && m.dernier && (!base.dernier || iso(m.dernier) > iso(base.dernier)) ? iso(m.dernier) : iso(base.dernier)) || null;
    if (etat === 'panne' || etat === 'arret' || etat === 'vide') {
      const p = base.etat === 'panne' || base.etat === 'arret' ? base : m || {};
      sortie.depuis = iso(p.depuis) || null;   // inconnu reste inconnu : « à vide » mesuré sur 24 h n'a pas de début
      if (p.derniere_panne) sortie.derniere_panne = { le: iso(p.derniere_panne.le), texte: p.derniere_panne.texte };
    } else {
      if (base.sante) sortie.sante = { ...base.sante, depuis: iso(base.sante.depuis), ...(base.sante.panne ? { panne: iso(base.sante.panne) } : {}) };
      if (base.derniere_panne) sortie.derniere_panne = { le: iso(base.derniere_panne.le), texte: base.derniere_panne.texte };
    }
    return sortie;
  });

  // ── Les pages d'agents : les textes de v6.json, et ce qui se calcule ──
  const vies = JSON.parse(JSON.stringify(TEXTES.vies));
  if (clips) {
    const plat = { youtube: 'YouTube', instagram: 'Instagram', tiktok: 'TikTok' };
    const parP = {};
    for (const c of clips) { const k = c.plateforme; (parP[k] = parP[k] || { comptes: new Set(), n: 0, ok: 0, ko: 0 }); parP[k].comptes.add(c.compte || '—'); parP[k].n++; if (c.etat === 'en_ligne') parP[k].ok++; if (c.etat === 'disparu') parP[k].ko++; }
    const dernierControle = clips.map((c) => c.controle_le).filter(Boolean).map(iso).sort().pop() || null;
    const dernierePub = clips.map((c) => c.publie_le).filter(Boolean).map(iso).sort().pop() || null;
    const declares = clips.filter((c) => c.declare_whop).length;
    const en = clips.filter((c) => c.etat === 'en_ligne'), dis = clips.filter((c) => c.etat === 'disparu');
    const v = vies.clipping;
    v.verification = Object.entries(parP).map(([k, x]) => [plat[k] || k, [...x.comptes].join(' · '), x.n, x.ok, x.ko]);
    v.verification_le = dernierControle;
    v.resume = `${dernierePub && maintenant - new Date(dernierePub) > 3 * 24 * H ? `À l’arrêt depuis le ${court(jourDe(dernierePub))}. ` : ''}${pluriel(clips.length, 'clip publié', 'clips publiés')} ; `
      + (declares ? `${pluriel(declares, 'déclaré', 'déclarés')} sur Whop.` : 'aucun déclaré sur Whop, donc 0 € gagné.');
    const enCours = (demandes || []).filter((x) => !['fait', 'erreur', 'annule'].includes(x.etat)).reduce((s, x) => s + x.n, 0)
      + (buffer || []).filter((x) => x.etat === 'a_faire').reduce((s, x) => s + x.n, 0);
    const ch = hote('chercheur');
    v.present = [['En production', enCours ? `${pluriel(enCours, 'clip ou demande', 'clips ou demandes')} en cours.` : 'Rien : aucune campagne en cours, la file est vide.'],
      ...(dernierControle ? [[`Vérifié le ${court(jourDe(dernierControle))}`, `Sur ${nombre(clips.length)} liens : ${Object.entries(parP).map(([k, x]) => `${plat[k] || k} ${nombre(x.ok)} en ligne${x.ko ? `, ${nombre(x.ko)} introuvables` : ''}`).join(' ; ')}.`]] : []),
      ['Argent', `${pluriel(declares, 'clip déclaré', 'clips déclarés')} sur Whop${declares ? '' : ', donc 0 €'}.`],
      ...(ch && ch.fin ? [[`Chercheur, ${court(jourDe(ch.modifie))}`, propre(ch.fin, 120)]] : []), ...v.present];
    if (en.length) v.reussites.splice(1, 0, `${pluriel(en.length, 'clip toujours en ligne', 'clips toujours en ligne')} (${Object.entries(parP).filter(([, x]) => x.ok).map(([k, x]) => `${nombre(x.ok)} ${plat[k] || k}`).join(', ')}).`);
    if (dis.length) v.problemes.splice(1, 0, `${pluriel(dis.length, 'clip a disparu', 'clips ont disparu')} (${Object.entries(parP).filter(([, x]) => x.ko).map(([k, x]) => `${nombre(x.ko)} ${plat[k] || k}`).join(', ')}), vus par le vérificateur.`);
  }
  if (trading) {
    const v = vies.trading, t = trading.filter((x) => x.valeur != null);
    const lib = (x) => x.libelle.charAt(0).toUpperCase() + x.libelle.slice(1);
    v.tableau = t.map((x) => [lib(x), (ECHELLES[x.agent] || {}).regle === 'tendance' ? 'Suivi de tendance' : 'Retour à la moyenne', x.valeur, x.operations, x.frais]);
    if (t.length) {
      const min = t.reduce((a, b) => (b.valeur < a.valeur ? b : a)), max = t.reduce((a, b) => (b.valeur > a.valeur ? b : a));
      const frais = t.reduce((s, x) => s + x.frais, 0), sec = t.find((x) => x.agent === 'seconde');
      v.present = [['Valeur', `De ${euros(min.valeur)} (${min.libelle}) à ${euros(max.valeur)} (${max.libelle}), sur 1 000 € fictifs chacun.`],
        ['Frais payés', `${euros(frais)} au total${sec ? `, dont ${euros(sec.frais)} pour l’agent à la seconde` : ''}.`]];
      v.problemes = [...t.filter((x) => x.perf <= -10).map((x) => `L’agent ${x.libelle} : ${pourcent(x.perf)} depuis le ${court(jourDe(x.depuis))}, dont ${euros(x.frais)} de frais.`),
        ...t.filter((x) => !x.operations).map((x) => `L’agent ${x.libelle} n’a encore rien fait.`)];
    }
  }
  if (bourse) {
    const v = vies.trading, noms = [...new Set(bourse.map((b) => b.nom))];
    v.bourse = noms.map((n) => { const r = bourse.find((b) => b.nom === n && b.mode === 'retro'), e = bourse.find((b) => b.nom === n && b.mode === 'reel'), x = r || e;
      return [x.libelle, r ? pourcent(r.perf) : '—', e ? euros(e.valeur) : '—']; });
    v.bourse_le = bourseJour && bourseJour.jour;
    const reel = bourse.filter((b) => b.mode === 'reel');
    if (reel.length) (v.present = v.present || []).push(['Bourse', `En réel depuis le ${court(reel[0].debut)} : de ${euros(Math.min(...reel.map((b) => b.valeur)))} à ${euros(Math.max(...reel.map((b) => b.valeur)))} sur 1 000 €.`]);
  }
  if (candStats) {
    const v = vies.candidatures, c = candStats;
    v.resume = `${pluriel(c.envoyees, 'candidature envoyée', 'candidatures envoyées')} en tout ; ${pluriel(c.a_toi, 'offre « à toi » t’attend', 'offres « à toi » t’attendent')}.`;
    v.present = [['À toi', `${pluriel(c.a_toi, 'offre', 'offres')} sans envoi automatique : la lettre est prête, tu postules depuis l’annonce.`],
      ['Sans canal', `${pluriel(c.sans_canal, 'offre n’a', 'offres n’ont')} aucun canal automatique.`],
      ['Écartées', `${nombre(c.ecartees7)} en 7 jours, hors de tes critères.`],
      ...(c.valides ? [['Dans la file', `${pluriel(c.valides, 'validée attend', 'validées attendent')} l’Envoyeur depuis le ${court(jourDe(c.valide_depuis))}.`]] : [])];
    v.problemes = [`${pluriel(c.sans_canal, 'offre', 'offres')} sans canal automatique.`, ...(c.envois_jour ? [] : ['Aucune candidature envoyée aujourd’hui.']),
      ...(c.derniere && maintenant - new Date(c.derniere) > 30 * H ? [`Aucune nouvelle offre depuis le ${court(jourDe(c.derniere))} : la collecte de ton PC ne tourne plus.`] : [])];
  }
  const etatVie = { clipping: ['chercheur_camp', 'publication'], trading: ['t_seconde', 't_minute', 't_heure', 't_longs'], candidatures: ['collecte', 'envoyeur'] };
  for (const [k, ids] of Object.entries(etatVie)) {
    const l = agentsD.filter((x) => ids.includes(x.id));
    if (l.length && vies[k]) vies[k].etat = l.some((x) => x.etat === 'panne') ? 'panne' : l.some((x) => ['vide', 'arret', 'alerte'].includes(x.etat)) ? 'alerte' : 'ok';
  }
  if (clips && vies.clipping && agentsD.find((x) => x.id === 'publication').etat === 'arret') vies.clipping.etat = 'panne';

  // ── Les modèles d'IA et leurs jetons ──
  const nomModele = (m) => {
    for (const [re, nom, chez, prix] of TEXTES.noms_modeles) {
      const r = new RegExp(re);
      if (r.test(m)) return { nom: m.replace(r, nom).replace(/(\d)-(?=[a-z])/g, '$1 ').replace(/-/g, ' ').replace(/\b(flash|lite|pro)\b/g, (x) => x[0].toUpperCase() + x.slice(1)), fournisseur: chez, prix };
    }
    return { nom: m, fournisseur: '—', prix: '—' };
  };
  const modelesIA = [...(runs || []).map((r) => ({ ...nomModele(r.model), j7: Number(r.j7), j30: Number(r.j30), cout: r.cout ? `${r.cout.toFixed(4).replace('.', ',')} $` : '0 $', agents: r.agents || '' })),
    ...TEXTES.modeles_hors_compteur];

  // ── Le budget : l'Économe (base, chaque heure) et le Gardien (journal du serveur) ──
  const ch = budget && budget.chiffres ? budget.chiffres : null;
  const g = hote('gardien');
  const gardien = g && g.fin ? (() => { const x = /est_eur=([\d.]+)\/budget=([\d.]+)/.exec(g.fin); return x ? { estime: Number(x[1]), budget: Number(x[2]), le: g.modifie } : null; })() : null;

  // ── Les mises à jour : livraisons (porte), ordres en cours et en attente ──
  const DEST = { claude: 'Claude', routine: 'Claude', harness: 'Hermes', verification: 'vérification', outil: 'un outil' };
  const majs = {
    stats: porte ? { n: porte.n, echecs: porte.echecs, porte_med: porte.mediane, porte_sur: porte.sur, depuis: porte.depuis, total_med: TEXTES.majs.stats_08_10.total_med, total_date: TEXTES.majs.stats_08_10.date }
      : { ...TEXTES.majs.stats_08_10, fige: true },
    livrees: porte ? porte.dernieres.map((l) => ({ le: l.le, sujet: l.sujet || (l.ok ? null : l.texte), sha: l.sha, lien: l.lien, total: null, porte: l.porte, ok: l.ok })) : [],
    encours: [...(ordresOuverts || []).filter((o) => o.etat === 'en_cours').map((o) => ({ titre: TEXTES.majs.titres[o.id] || propre(o.texte, 90), pour: DEST[o.pour] || o.pour, depuis: iso(o.cree_le), detail: `Ordre n° ${o.id}, en cours.` })),
      ...TEXTES.majs.encours.map((e) => ({ ...e, date: TEXTES.date }))],
    // tous les ordres ouverts (une demande faite ici s'y voit tout de suite) ; en rouge ceux que le veilleur signale (plus de 24 h)
    attente: (ordresOuverts || []).filter((o) => o.etat === 'a_faire').map((o) => ({ id: Number(o.id), depuis: iso(o.cree_le), pour: DEST[o.pour] || o.pour,
      titre: TEXTES.majs.titres[o.id] || propre(o.texte, 90), texte: propre(o.texte, 220), retard: (enRetard || []).some((x) => Number(x.id) === Number(o.id)) })),
    ...(ordresOuverts === null || enRetard === null ? { attente_erreur: 'lecture des ordres en échec' } : {}),
  };

  // ── Les catégories d'e-mail : leurs phrases (à valider), et combien de commerces de ce métier sont dans ta base ──
  const parMetier = {};
  for (const c of clients) if (c.seg === 'site') parMetier[c.metier] = (parMetier[c.metier] || 0) + 1;
  const categories = TEXTES.categories.map((k) => ({ ...k, n: k.metiers.reduce((s, x) => s + (parMetier[x] || 0), 0) }));

  return {
    NOW: maintenant.toISOString(),
    agents: agentsD,
    plan: TEXTES.plan,
    majs,
    factures,
    clients,
    rappels: rappelsOuverts,
    brouillons: brouillons.sort((a, b) => new Date(b[0]) - new Date(a[0])).map(([, k]) => k),
    modeles: TEXTES.modeles,
    vies,
    relances: relSite.jours,
    relancesRetard: relSite.retard,
    relancesIa: relIa.jours,
    relancesIaRetard: relIa.retard,
    offres: offresD,
    modelesIA,
    modelesSource: 'agent_runs, 30 jours, lu en direct ; les trois dernières lignes sont relevées à la main, avec leur date',
    modelesNote: TEXTES.modeles_note,
    credits: { ...TEXTES.credits },
    budget: ch ? { le: iso(budget.le), mode: budget.mode, plafond: Number(ch.plafond_eur), depense: Number(ch.depense_mois_eur), reste: Number(ch.reste_eur), gardien } : { gardien },
    categories,
    depuis: TEXTES.notes,
    autresRappels: autresRappels ? autresRappels.n : null,
    direct: { lu_le: maintenant.toISOString(), duree_ms: Date.now() - t0, erreurs, textes_le: TEXTES.date, modeles_le: TEXTES.modeles_date,
      releve_hote: releveLe ? { le: releveLe, age_min: ageReleve, frais: releveFrais } : null },
  };
}

// ── Les gestes ────────────────────────────────────────────────────────────────────────────────
// Noter un appel depuis la liste : « intéressé », « pas intéressé », « pas joint » passent par l'agenda (la relance ouverte du
// contact est faite, et sa suite créée : relance à 2 jours pour un intéressé, nouvel essai à 7 jours pour un pas joint) ; un
// contact sans relance ouverte en reçoit une pour aujourd'hui, aussitôt faite. « À rappeler » passe par la liste d'appels
// (appels.noter : ligne d'appel, journal, relance datée) ; la note de Basile est posée sur cette relance.
function cibleDe(cle) {
  const m = /^(v)(\d+)$|^(p)(\d{9})$/.exec(String(cle));
  if (!m) return null;
  return m[1] ? { cible_type: 'vitrine', cible_id: m[2], siren: 'v' + m[2] } : { cible_type: 'prospect', cible_id: m[4], siren: m[4] };
}
async function noterAppel(cle, d = {}) {
  const c = cibleDe(cle);
  if (!c) return { ok: false, erreur: 'contact inconnu' };
  const note = propre(d.note, 500) || null;
  const ouvert = async () => (await bases.lire(`SELECT id FROM rappels WHERE statut = 'a_faire' AND cible_type = $1 AND cible_id = $2 ORDER BY id DESC LIMIT 1`, [c.cible_type, c.cible_id]))[0] || null;
  if (d.resultat === 'rappeler') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.echeance || ''))) return { ok: false, erreur: 'date attendue' };
    const r = await appels.noter(c.siren, { etat: 'plus_tard', rappel_le: d.echeance, note });
    if (!r.ok) return r;
    const o = await ouvert();
    if (!o) return { ok: false, erreur: 'la relance n’a pas pu être créée dans l’agenda' };
    if (note) { const n = await agenda.agir(o.id, { action: 'noter', note }); if (!n.ok) return n; }
    return { ok: true, jour: d.echeance, rappel: Number(o.id), note: !!note };
  }
  if (!['interesse', 'pas_interesse', 'pas_joint'].includes(d.resultat)) return { ok: false, erreur: 'résultat attendu : interesse, pas_interesse, pas_joint ou rappeler' };
  let o = await ouvert();
  if (!o) {
    const n = await agenda.creer({ cible_type: c.cible_type, cible_id: c.cible_id, echeance: agenda.aujourdhui(), motif: 'appel noté depuis le cockpit', source: 'appels' });
    if (!n.ok) return n;
    o = { id: n.id };
  }
  const r = await agenda.agir(o.id, { action: 'fait', resultat: d.resultat, note });
  if (!r.ok) return r;
  return { ok: true, suivant: r.suivant ? { jour: r.suivant.jour, motif: r.suivant.motif } : null };
}

// Une demande pour Claude (bouton « Demande » et « Signaler ») : un ordre dans la file de Claude. Le veilleur des ordres le fait
// remonter en rouge au-delà de 24 h ; Basile le suit dans « Mises à jour ». Rien n'est envoyé ailleurs.
const SECRETS = [/\bsk-[A-Za-z0-9_-]{16,}/, /\b(rk|sk)_(live|test)_[A-Za-z0-9]{8,}/, /\bgh[pousr]_[A-Za-z0-9]{20,}/, /\bgithub_pat_[A-Za-z0-9_]{20,}/, /\bre_[A-Za-z0-9]{20,}/];
async function demande(d = {}) {
  const texte = String(d.texte || '').trim().slice(0, 4000), sujet = propre(d.sujet, 200);
  if (!texte) return { ok: false, erreur: 'demande vide' };
  if (SECRETS.some((re) => re.test(texte))) return { ok: false, erreur: 'la demande contient ce qui ressemble à une clé secrète : retire-la' };
  const [r] = await bases.lire(`INSERT INTO commandes (texte, source, pour) VALUES ($1, 'cockpit', 'claude') RETURNING id`,
    [sujet && sujet !== 'Le cockpit en général' ? `${sujet} : ${texte}` : texte]);
  return r ? { ok: true, id: Number(r.id) } : { ok: false, erreur: 'la file des ordres est illisible pour l’instant' };
}

// ── Les routes ────────────────────────────────────────────────────────────────────────────────
function envoyerGz(req, res, corps, type) {
  const gz = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  const b = gz ? zlib.gzipSync(corps, { level: 6 }) : corps;
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store', Vary: 'Accept-Encoding', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex', 'Content-Length': b.length, ...(gz ? { 'Content-Encoding': 'gzip' } : {}) });
  res.end(b);
}
// La page : à /v6, et depuis le 15/10/2026 à / et /jarvis (jarvis/serveur.cjs), sur le « oui » de Basile.
function page(req, res) {
  let html; try { html = fs.readFileSync(PAGE); } catch (e) { res.writeHead(404); res.end(); return; }
  envoyerGz(req, res, html, 'text/html; charset=utf-8');
}
async function router(req, res, { url, m, envoyer, json, autorise }) {
  if (m === 'GET' && (url === '/v6' || url === '/v6/')) { page(req, res); return true; }
  if (!url.startsWith('/api/v6')) return false;
  if (m === 'GET' && url === '/api/v6') { envoyerGz(req, res, Buffer.from(JSON.stringify(await assembler())), 'application/json; charset=utf-8'); return true; }
  let r;
  if (m === 'POST' && (r = url.match(/^\/api\/v6\/appel\/(v\d+|p\d{9})$/))) {
    if (!autorise(req)) { envoyer(res, 403, { ok: false }); return true; }
    envoyer(res, 200, await noterAppel(r[1], await json(req, 4000))); return true;
  }
  if (m === 'POST' && url === '/api/v6/demande') {
    if (!autorise(req)) { envoyer(res, 403, { ok: false }); return true; }
    envoyer(res, 200, await demande(await json(req, 10000))); return true;
  }
  return false;
}

module.exports = { router, page, assembler, noterAppel, demande, preparer, livraisons, etatSource, cibleDe, MESURES, TEXTES };
