// AGENT AUDITEUR
// Applique les 7 regards + 8 questions (chargés depuis le cerveau) à une proposition,
// en confrontant systématiquement à une ALTERNATIVE PLUS SOBRE chiffrée.
// Règle d'or : aucune conclusion engageante sur une preuve de niveau C seul.
import { askJson, db, logRun, money } from './lib.js';
import { appliquerGardeFous } from './garde_audit.js';
import { depuisExtraction, formuler, BAREME, VERSION as SCORE_VERSION } from './score.js';

const PROMPT_VERSION = 'auditeur-v2-score';

// Liste des 22 criteres, construite DEPUIS le bareme : le prompt ne peut pas
// diverger de la methode publiee, meme si un poids change demain.
const CRITERES_PROMPT = BAREME
  .map((b) => `- ${b.code} : ${b.libelle}`)
  .join('\n');

const SYSTEM = `Tu es l'Auditeur d'un cabinet indépendant qui représente les intérêts du CLIENT face aux intégrateurs.
Tu ne vends aucune technologie et tu ne touches aucune commission. Ton avis engage le cabinet.

MÉTHODE — pour chaque regard d'audit fourni, tu produis un constat argumenté.

NIVEAUX DE PREUVE (obligatoire sur chaque constat) :
- "A" = mesuré (test sur les données réelles du client)
- "B" = documenté (source vérifiable et datée : la proposition elle-même, un tarif public)
- "C" = estimé (modélisation avec hypothèses explicites)

RÈGLE ABSOLUE : une recommandation engageante ne peut PAS reposer uniquement sur du niveau C.
Si tu ne disposes que de C, tu l'écris explicitement et tu demandes la mesure manquante.

TU DOIS TOUJOURS produire une "alternative_sobre" : la version la plus simple qui atteindrait
le même résultat métier (modèle plus léger, logique déterministe, moins d'agents), avec son ordre
de grandeur de coût. Un audit sans alternative chiffrée n'est pas un audit.

Une BIBLIOTHÈQUE SECTORIELLE t'est fournie : elle indique, pour ce secteur, le niveau d'IA réellement
justifié par processus, ce que les prestataires survendent habituellement, et les pièges connus.
Utilise-la pour ancrer tes constats dans la réalité du métier du client. Si la proposition tombe dans
un piège répertorié, dis-le explicitement.

Ton ton est factuel, précis, sans complaisance et sans dramatisation.

SCORE rAIme — TU NE CALCULES RIEN, TU CONSTATES.
Le score est calculé par du code, pas par toi. Ton travail est purement factuel : dire ce que
la proposition CONTIENT. Deux règles, sans exception :
1. Un critère n'est satisfait que s'il est ÉCRIT NOIR SUR BLANC dans la proposition. Une
   intention, une formule vague, une promesse orale rapportée : non satisfait.
2. Une grandeur économique absente reste ABSENTE. Tu ne l'estimes pas, tu ne la déduis pas
   d'un ordre de grandeur habituel. Mets null. Une valeur inventée fausserait le score de
   tous les autres dossiers.

Les 22 critères, à reporter par leur code :
${CRITERES_PROMPT}

Réponds UNIQUEMENT en JSON valide :
{
  "synthese": "3 phrases maximum, la conclusion pour un dirigeant pressé",
  "score_raime_entrees": {
    "criteres_satisfaits": ["les codes des critères ÉCRITS dans la proposition, rien d'autre"],
    "justifications": {"CODE": "la phrase de la proposition qui satisfait ce critère"},
    "economie": {
      "volumeMensuel": null, "tempsActuelMin": null, "tempsResiduelMin": null,
      "coutHoraire": null, "partReaffectee": null, "miseEnRoute": null,
      "abonnementMensuel": null, "licencesMensuelles": null, "maintenanceAnnuelle": null,
      "joursInternes": null, "coutJour": null
    },
    "origine_economie": {"champ": "proposition|profil entreprise|absent"}
  },
  "constats": [
    {"regard":"code du regard","titre":"","constat":"","preuve":"A|B|C","source":"","score":0,"risque":"faible|moyen|eleve"}
  ],
  "questions_au_prestataire": ["les questions précises à lui poser, tirées de la méthode"],
  "alternative_sobre": {"description":"","pourquoi":"","ordre_de_grandeur_cout":"","ecart_estime":""},
  "informations_manquantes": ["ce qu'il faut obtenir avant de décider"],
  "recommandation": "la recommandation argumentée, ou l'indication que des mesures manquent",
  "niveau_confiance": "eleve|moyen|faible"
}
Le champ "score" va de 0 à 10 (10 = parfaitement justifié pour le besoin réel).`;

export async function auditer({ proposalId, companyId = null, client }) {
  const own = !client;
  const c = client || db();
  if (own) await c.connect();
  try {
    // 1. On charge la MÉTHODE depuis le cerveau (source de vérité unique)
    const { rows: regards } = await c.query('SELECT code,label,description,checks FROM audit_criteria ORDER BY rank');
    const { rows: questions } = await c.query('SELECT rank,question,method,criterion FROM audit_questions ORDER BY rank');
    if (!regards.length) throw new Error('Aucun regard d’audit en base — le cerveau est vide.');

    // 2. La proposition + le profil entreprise
    const { rows: props } = await c.query('SELECT id,vendor,parsed,company_id FROM proposals WHERE id=$1', [proposalId]);
    if (!props.length) throw new Error(`Proposition ${proposalId} introuvable`);
    const prop = props[0];
    const cid = companyId || prop.company_id;
    let profil = null;
    if (cid) {
      const { rows } = await c.query('SELECT name,sector,size,profile FROM companies WHERE id=$1', [cid]);
      profil = rows[0] || null;
    }

    // 3bis. BIBLIOTHÈQUE SECTORIELLE (pilier ⑦) — ce qui s'automatise vraiment dans ce secteur,
    // ce que les prestataires survendent, et les pièges connus. C'est la pertinence métier.
    let biblio = [];
    if (profil?.sector) {
      const { rows } = await c.query(
        `SELECT processus, automatisation, niveau_ia, approche_sobre, approche_survendue, piege
         FROM sector_automations
         WHERE secteur ILIKE '%' || $1 || '%' OR $1 ILIKE '%' || split_part(secteur,' ',1) || '%'`,
        [profil.sector]);
      biblio = rows;
    }
    if (!biblio.length) {
      const { rows } = await c.query(
        `SELECT secteur, processus, niveau_ia, approche_sobre, approche_survendue, piege
         FROM sector_automations ORDER BY random() LIMIT 6`);
      biblio = rows;
    }

    // 3. Repères de coût issus du catalogue (pour chiffrer l'alternative sobre)
    const { rows: reperes } = await c.query(
      `SELECT openrouter_id, price_in, price_out, context_tokens FROM models
       WHERE price_in IS NOT NULL AND price_in > 0 AND context_tokens >= 100000
       ORDER BY price_in ASC LIMIT 8`);

    const user = `## PROFIL DE L'ENTREPRISE
${profil ? JSON.stringify(profil) : '(profil non renseigné — signale-le dans les informations manquantes)'}

## PROPOSITION DU PRESTATAIRE (extraite)
${JSON.stringify(prop.parsed)}

## LES REGARDS D'AUDIT À APPLIQUER
${regards.map(r => `- [${r.code}] ${r.label} : ${r.description}\n  points de contrôle : ${JSON.stringify(r.checks)}`).join('\n')}

## LES QUESTIONS DE CHALLENGE (méthode du cabinet)
${questions.map(q => `${q.rank}. ${q.question}\n   → méthode : ${q.method}`).join('\n')}

## BIBLIOTHÈQUE SECTORIELLE rAIme — ce qui s'automatise vraiment ici
${biblio.map(b => `- ${b.processus} (niveau justifié : ${b.niveau_ia})
  approche sobre : ${b.approche_sobre}
  ce que les prestataires survendent : ${b.approche_survendue}
  PIÈGE À VÉRIFIER : ${b.piege}`).join(String.fromCharCode(10))}

## REPÈRES DE COÛT DU MARCHÉ (modèles ≥100k contexte, USD/1M tokens, catalogue à jour)
${reperes.map(m => `- ${m.openrouter_id} : ${Number(m.price_in).toFixed(3)} entrée / ${Number(m.price_out).toFixed(3)} sortie`).join('\n')}

Produis l'audit.`;

    const res = await askJson({ task: 'raisonnement', system: SYSTEM, user, maxTokens: 16000, temperature: 0.15 });
    const r = res.meta;
    let status = res.status;
    let a = res.data || { erreur: 'JSON invalide ou tronque', brut: res.raw || '' };

    // 4. GARDE-FOU DÉTERMINISTE (pilier ④) — la règle de preuve est appliquée par du code, pas par le modèle.
    let garde = null;
    if (status === 'ok' && Array.isArray(a.constats) && a.constats.length) {
      const niveaux = a.constats.map(x => String(x.preuve || 'C').toUpperCase());
      const aDuSolide = niveaux.some(n => n === 'A' || n === 'B');
      if (!aDuSolide) {
        garde = 'Aucun constat de niveau A ou B : la recommandation est suspendue jusqu’à obtention de mesures.';
        a.recommandation = `[SUSPENDUE PAR LE GARDE-FOU] ${garde} Recommandation provisoire : ${a.recommandation || '(néant)'}`;
        a.niveau_confiance = 'faible';
      }
      const scores = a.constats.map(x => Number(x.score)).filter(n => !Number.isNaN(n));
      a.score_global = scores.length ? Number((scores.reduce((s, n) => s + n, 0) / scores.length).toFixed(2)) : null;
    }

    // 5. GARDE-FOUS DE LIVRAISON — le rapport porte la signature de Basile.
    // Sanctions chiffrées, financements indisponibles, promesses certaines, jugements sur
    // le prestataire, références inventées : chacun engage sa responsabilité. Un rapport
    // qui en contient un ne part pas.
    const controle = appliquerGardeFous(a);
    a = controle.audit;
    if (controle.bloquant) garde = (garde ? garde + ' | ' : '') + a.motif_blocage;

    // 6. SCORE rAIme — le modele a CONSTATE, le code CALCULE.
    // C'est la seule note que le cabinet publie, et elle doit etre recalculable
    // par un tiers a partir de la methode publiee. Elle ne peut donc pas sortir
    // d'un modele : elle sort de score.js, a partir de ce que le modele a releve.
    let score = null;
    if (status === 'ok' && a.score_raime_entrees) {
      score = depuisExtraction(a.score_raime_entrees);
      a.score_raime = score;
      if (score.rendu) {
        a.synthese = `Score rAIme ${score.score}/100 — ${score.mention} (methode v${SCORE_VERSION}). `
          + (a.synthese || '');
      } else {
        a.synthese = `Score rAIme non rendu : axe economique non mesurable, `
          + `${score.donneesManquantes.length} grandeur(s) a obtenir. ` + (a.synthese || '');
      }
    }

    const scoresParRegard = {};
    if (Array.isArray(a.constats)) for (const x of a.constats) if (x.regard) scoresParRegard[x.regard] = x.score;

    const ins = await c.query(
      `INSERT INTO audits(company_id, proposal_id, scores, findings, recommendation, cost_model)
       VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
      [cid, proposalId, JSON.stringify({ par_regard: scoresParRegard, global: a.score_global ?? null,
                          raime: score && score.rendu ? score.score : null,
                          raime_axe_a: score ? score.axeA?.note ?? null : null,
                          raime_axe_b: score ? score.axeB?.note ?? null : null,
                          raime_version: score ? score.version : null }),
       JSON.stringify(a.constats || []), a.recommandation || null,
       JSON.stringify({ synthese: a.synthese || null,
                        alternative_sobre: a.alternative_sobre || null,
                        questions_au_prestataire: a.questions_au_prestataire || [],
                        informations_manquantes: a.informations_manquantes || [],
                        niveau_confiance: a.niveau_confiance || null,
                        score_raime: score,
                        garde_fou: garde,
                        modele: r.model, cout_usd: r.costUsd, prompt: PROMPT_VERSION })]
    );
    const id = ins.rows[0].id;
    await logRun(c, { agent: 'auditeur', task: 'raisonnement', model: r.model, tokensIn: r.tokensIn,
      tokensOut: r.tokensOut, costUsd: r.costUsd, ms: r.ms, status, ref: id, promptVersion: PROMPT_VERSION });

    return { id, audit: a, garde, meta: { model: r.model, cout: money(r.costUsd), ms: r.ms, status } };
  } finally { if (own) await c.end(); }
}

// CLI : node agents/auditeur.js <proposalId>
if (import.meta.url === `file://${process.argv[1]}`) {
  const out = await auditer({ proposalId: process.argv[2] });
  console.log(JSON.stringify(out.audit, null, 2));
  console.log(`\n[auditeur] ${out.meta.model} · ${out.meta.cout} · ${out.meta.ms} ms · audit ${out.id}`);
  if (out.garde) console.log(`[garde-fou] ${out.garde}`);
}
