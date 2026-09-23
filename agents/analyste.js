// AGENT ANALYSTE PROPOSITION
// Transforme une proposition fournisseur (texte brut) en objet analysable.
// Les ABSENCES sont des constats : "aucun coût à l'échelle mentionné" vaut une ligne au rapport.
import { ask, parseJson, db, logRun, money } from './lib.js';

const PROMPT_VERSION = 'analyste-v1';

const SYSTEM = `Tu es l'Analyste Proposition d'un cabinet d'audit IA indépendant, du côté du client.
Ta mission : extraire d'une proposition commerciale tout ce qui permettra de l'auditer — sans rien inventer.

RÈGLES ABSOLUES :
- Tu n'inventes JAMAIS une information absente. Si une donnée manque, tu l'inscris dans "non_dits".
- Les absences sont des constats de premier ordre (coût à l'échelle, réversibilité, tests sur données réelles...).
- Tu cites le passage source pour chaque élément important (champ "source").
- Tu restes factuel : aucune opinion, aucune recommandation. Tu extrais.

Réponds UNIQUEMENT en JSON valide avec cette structure :
{
  "fournisseur": "nom ou null",
  "objet": "ce que la proposition promet, en une phrase",
  "architecture": {"description":"", "composants":[], "modeles_ia":[], "part_deterministe":"forte|moyenne|faible|non precise"},
  "volumetrie": {"declaree":"", "unite":"", "source":""},
  "couts": {"initial":null, "recurrent_mensuel":null, "devise":"EUR", "a_l_echelle":"mentionne|non mentionne", "hypotheses":[], "source":""},
  "donnees": {"sortent_de_l_entreprise":"oui|non|non precise", "prestataires_tiers":[], "hebergement":"", "source":""},
  "engagements": {"sla":"", "performance_promise":"", "tests_sur_donnees_client":"oui|non|non precise"},
  "reversibilite": {"export_donnees":"oui|non|non precise", "verrou_proprietaire":"oui|non|non precise", "source":""},
  "maintenance": {"responsable":"", "mises_a_jour":"", "cout":""},
  "non_dits": ["liste des informations absentes qui devraient figurer dans une proposition sérieuse"]
}`;

export async function analyser({ texte, vendor = null, companyId = null, client }) {
  const own = !client;
  const c = client || db();
  if (own) await c.connect();
  try {
    const r = await ask({
      task: 'extraction',
      system: SYSTEM,
      user: `Proposition à analyser :\n\n"""\n${texte}\n"""`,
      maxTokens: 4000,
    });

    let parsed, status = 'ok';
    try { parsed = parseJson(r.text); }
    catch { status = 'parse_error'; parsed = { erreur: 'JSON invalide', brut: r.text.slice(0, 1000) }; }

    // Contrôle déterministe : on force les non-dits sur les points critiques.
    if (status === 'ok') {
      parsed.non_dits = Array.isArray(parsed.non_dits) ? parsed.non_dits : [];
      const ajout = (cond, txt) => { if (cond && !parsed.non_dits.some(x => x.includes(txt.slice(0, 20)))) parsed.non_dits.push(txt); };
      ajout(parsed.couts?.a_l_echelle !== 'mentionne', "Aucun coût projeté à volume supérieur n'est fourni");
      ajout(parsed.engagements?.tests_sur_donnees_client !== 'oui', "Aucun test sur les données réelles du client n'est prévu");
      ajout(parsed.reversibilite?.export_donnees !== 'oui', "L'export des données n'est pas garanti explicitement");
      ajout(!parsed.architecture?.part_deterministe || parsed.architecture.part_deterministe === 'non precise',
            "La part déterministe vs modèle de langage n'est pas précisée");
    }

    const ins = await c.query(
      `INSERT INTO proposals(company_id, vendor, raw, parsed) VALUES($1,$2,$3,$4) RETURNING id`,
      [companyId, vendor || parsed?.fournisseur || null, texte, JSON.stringify(parsed)]
    );
    const id = ins.rows[0].id;
    await logRun(c, { agent: 'analyste', task: 'extraction', model: r.model, tokensIn: r.tokensIn,
      tokensOut: r.tokensOut, costUsd: r.costUsd, ms: r.ms, status, ref: id, promptVersion: PROMPT_VERSION });

    return { id, parsed, meta: { model: r.model, cout: money(r.costUsd), ms: r.ms, status } };
  } finally { if (own) await c.end(); }
}

// CLI : node agents/analyste.js <fichier.txt> [nom_fournisseur]
if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFileSync } = await import('node:fs');
  const texte = readFileSync(process.argv[2], 'utf8');
  const out = await analyser({ texte, vendor: process.argv[3] || null });
  console.log(JSON.stringify(out.parsed, null, 2));
  console.log(`\n[analyste] ${out.meta.model} · ${out.meta.cout} · ${out.meta.ms} ms · proposition ${out.id}`);
}
