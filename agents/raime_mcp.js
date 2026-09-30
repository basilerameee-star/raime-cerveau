// LE CERVEAU OUVERT À HERMES — un serveur MCP (Model Context Protocol) sur le réseau interne.
//
// Hermes Agent (NousResearch, licence MIT) apporte ses outils : terminal, navigateur, fichiers,
// mémoire, compétences, tâches planifiées, messageries. Ce serveur lui apporte LA MAISON : ce que
// le cerveau sait, ce qu'il a décidé, ce qu'il attend de Basile, et le droit d'ouvrir un chantier.
// Ainsi Hermes devient « maison » : il travaille avec la mémoire, les règles et le journal de rAIme.
//
// GARDES, dans le code :
//   - un jeton (RAIME_MCP_JETON) exigé à chaque requête ; sans jeton posé, le serveur refuse de démarrer ;
//   - chaque appel passe par l'aiguillage du Gardien (agents/gardien.js) : seul « exécuter » passe ;
//   - catalogue fermé : lire (bibliothèque, journal, questions, état) et ouvrir un chantier ; rien
//     qui écrit à un tiers, dépense, efface ou touche la Constitution ;
//   - chaque appel laisse sa ligne au journal (acteur « hermes »).
//
// Protocole : JSON-RPC 2.0 sur HTTP (transport « Streamable HTTP », réponses JSON simples).
//   node agents/raime_mcp.js       écoute sur RAIME_MCP_HOTE:RAIME_MCP_PORT (par défaut 0.0.0.0:8766, réseau Docker)
import http from 'node:http';
import crypto from 'node:crypto';
import { aiguiller } from './gardien.js';

export const VERSION_PROTOCOLE = '2025-06-18';
const TAILLE_MAX = 64_000;

// ── Le catalogue fermé ─────────────────────────────────────────────────────
export const OUTILS = {
  bibliotheque_chercher: {
    description: 'Cherche dans la bibliothèque de rAIme (notes de la maison, offre, veille, savoir général), en français. Rend les passages et leur source.',
    inputSchema: { type: 'object', properties: { question: { type: 'string', minLength: 3 }, domaine: { type: 'string' } }, required: ['question'] },
    action: (a) => ({ type: 'lire', cible: 'kb_chunks', contenu: a.question }),
    async faire({ brain, a }) {
      const { chercher } = await import('./bibliothecaire.js');
      const r = await chercher({ brain, question: String(a.question), combien: 5, domaine: a.domaine || null,
        exclure: a.domaine ? [] : ['harness'] });
      return r.length ? r.map((p) => `[${p.domaine}] ${p.titre} — ${p.source}\n${p.extrait}`).join('\n\n---\n\n')
        : 'La bibliothèque ne contient rien sur ce point.';
    },
  },
  journal_lire: {
    description: 'Lit les dernières décisions tracées du cerveau (acteur, changement, motif).',
    inputSchema: { type: 'object', properties: { combien: { type: 'integer', minimum: 1, maximum: 50 }, acteur: { type: 'string' } } },
    action: () => ({ type: 'lire', cible: 'journal' }),
    async faire({ brain, a }) {
      const n = Math.min(50, Math.max(1, Number(a.combien) || 15));
      const { rows } = await brain.query(`SELECT acteur, changement, motif, created_at::text AS le FROM journal
        WHERE ($2::text IS NULL OR acteur = $2) ORDER BY created_at DESC LIMIT $1`, [n, a.acteur || null]);
      return rows.map((r) => `${r.le.slice(0, 16)} · ${r.acteur} · ${r.changement}${r.motif ? ` — ${r.motif}` : ''}`).join('\n') || 'Journal vide.';
    },
  },
  questions_pour_basile: {
    description: 'Les questions que le cerveau attend de Basile, les plus bloquantes d’abord.',
    inputSchema: { type: 'object', properties: {} },
    action: () => ({ type: 'lire', cible: 'demandes' }),
    async faire({ brain }) {
      const { rows } = await brain.query(`SELECT id, question, pourquoi, bloquant FROM demandes WHERE etat = 'ouverte'
        ORDER BY bloquant DESC, cree_le`);
      return rows.map((r) => `n° ${r.id}${r.bloquant ? ' (bloquant)' : ''} : ${r.question}${r.pourquoi ? ` — ${r.pourquoi}` : ''}`).join('\n')
        || 'Aucune question en attente.';
    },
  },
  etat_maison: {
    description: 'Relevé chiffré de la maison : agents vivants, passages, coût des modèles sur 30 jours, bibliothèque, veille, décisions.',
    inputSchema: { type: 'object', properties: {} },
    action: () => ({ type: 'lire', cible: 'agent_runs' }),
    async faire({ brain, n8n }) {
      const { ACTIONS } = await import('./architecte.js');
      return (await ACTIONS.mesurer({ brain, n8n })).resume;
    },
  },
  cap_lire: {
    description: 'Le cap de rAIme : objectifs, règles, goût, la bonne réponse, règles commerciales, le passé et le futur du moment. À relire avant une décision qui engage.',
    inputSchema: { type: 'object', properties: {} },
    action: () => ({ type: 'lire', cible: 'cap' }),
    async faire({ brain }) {
      const { capActuel } = await import('./cap.js');
      return (await capActuel({ brain })).texte;
    },
  },
  feuille_de_route_lire: {
    description: 'La feuille de route du cerveau rAIme décidée avec Basile : chaque point, son rang, ce qu\'il faut de Basile, quand il est fini, et son état.',
    inputSchema: { type: 'object', properties: {} },
    action: () => ({ type: 'lire', cible: 'feuille_de_route' }),
    async faire() {
      const { versMarkdown } = await import('../tools/feuille_vers_markdown.mjs');
      return versMarkdown();
    },
  },
  api_publique_chercher: {
    description: 'Cherche une API publique existante pour un besoin (répertoire public-apis, près de 2 000 API, en anglais) avant de construire un outil. Rend le nom, la description, la clé exigée ou non, et le lien.',
    inputSchema: { type: 'object', properties: { besoin: { type: 'string', minLength: 3 }, sans_cle: { type: 'boolean' } }, required: ['besoin'] },
    action: (a) => ({ type: 'lire', cible: 'apis_publiques', contenu: a.besoin }),
    async faire({ brain, a }) {
      const { chercher, enLigne } = await import('./apis_publiques.js');
      const r = await chercher({ brain, besoin: String(a.besoin), sansCle: a.sans_cle === true });
      return r.length ? r.map(enLigne).join('\n') : 'Aucune API publique trouvée pour ce besoin.';
    },
  },
  chantier_ouvrir: {
    description: 'Demande un changement du code du cerveau : une issue « chantier » avec constat, mesure chiffrée, attendu et piste. Trois ouverts au plus.',
    inputSchema: { type: 'object', properties: { titre: { type: 'string' }, constat: { type: 'string' }, mesure: { type: 'string' },
      attendu: { type: 'string' }, piste: { type: 'string' } }, required: ['titre', 'constat', 'mesure', 'attendu'] },
    // Interne et réversible (une issue se ferme) : zone 1 de la Constitution.
    action: (a) => ({ type: 'ouvrir_chantier', cible: 'issue', contenu: `${a.titre} ${a.constat} ${a.mesure} ${a.attendu} ${a.piste || ''}` }),
    async faire({ brain, a }) {
      const { ouvrirChantier } = await import('./chantiers.js');
      const r = await ouvrirChantier({ ...a, source: 'hermes' }, { brain });
      return r.ouvert ? `Chantier n° ${r.numero} ouvert : ${r.url}` : `Chantier non ouvert : ${r.motif}`;
    },
  },
};

// ── Le traitement d'un message JSON-RPC ────────────────────────────────────
const erreur = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
const resultat = (id, result) => ({ jsonrpc: '2.0', id, result });

function valider(schema, a) {
  for (const k of schema.required || []) if (a[k] == null || String(a[k]).trim() === '') return `argument « ${k} » manquant`;
  for (const [k, v] of Object.entries(a)) {
    const s = schema.properties?.[k];
    if (!s) return `argument inconnu : « ${k} »`;
    if (s.type === 'string' && typeof v !== 'string') return `« ${k} » doit être un texte`;
    if (s.type === 'integer' && !Number.isInteger(v)) return `« ${k} » doit être un entier`;
    if (s.minLength && String(v).length < s.minLength) return `« ${k} » trop court`;
  }
  return null;
}

export async function traiter(message, { brain, n8n = null }) {
  const { id, method, params = {} } = message || {};
  if (message?.jsonrpc !== '2.0' || typeof method !== 'string') return erreur(id, -32600, 'requête invalide');
  const notification = id === undefined;

  switch (method) {
    case 'initialize':
      return resultat(id, {
        protocolVersion: params.protocolVersion || VERSION_PROTOCOLE,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'raime-cerveau', version: '1.0.0' },
        instructions: 'Outils de la maison rAIme. La Constitution prime : rien ne part vers un tiers, rien ne se dépense, '
          + 'rien ne s’invente. Pour tout changement du code du cerveau, ouvrir un chantier.',
      });
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return null;
    case 'ping':
      return resultat(id, {});
    case 'tools/list':
      return resultat(id, { tools: Object.entries(OUTILS).map(([name, o]) => ({ name, description: o.description, inputSchema: o.inputSchema })) });
    case 'tools/call': {
      const nom = params.name;
      const a = params.arguments || {};
      const outil = OUTILS[nom];
      if (!outil) return erreur(id, -32602, `outil inconnu : ${nom}`);
      const invalide = valider(outil.inputSchema, a);
      if (invalide) return resultat(id, { isError: true, content: [{ type: 'text', text: invalide }] });

      // Le Gardien aiguille AVANT toute exécution.
      const action = { agent: 'hermes', ...outil.action(a) };
      const voie = aiguiller(action);
      const tracer = (changement, motif) => brain.query(`INSERT INTO journal(acteur, changement, motif) VALUES($1,$2,$3)`,
        ['hermes', changement.slice(0, 300), String(motif || '').slice(0, 500)]).catch(() => {});
      if (voie.voie !== 'executer') {
        await tracer(`${nom} refusé par le Gardien (${voie.voie})`, voie.motifs.join(' ; '));
        return resultat(id, { isError: true, content: [{ type: 'text', text: `Refusé par le Gardien (${voie.voie}) : ${voie.motifs.join(' ; ')}` }] });
      }
      try {
        const texte = String(await outil.faire({ brain, n8n, a })).slice(0, TAILLE_MAX);
        await tracer(`${nom}`, JSON.stringify(a).slice(0, 300));
        return resultat(id, { content: [{ type: 'text', text: texte }] });
      } catch (e) {
        await tracer(`${nom} en échec`, e.message);
        return resultat(id, { isError: true, content: [{ type: 'text', text: `Échec : ${e.message.slice(0, 300)}` }] });
      }
    }
    default:
      return notification ? null : erreur(id, -32601, `méthode inconnue : ${method}`);
  }
}

// ── Le serveur HTTP : un seul chemin, un jeton, des réponses JSON ──────────
export function creerServeur({ brain, n8n = null, jeton }) {
  if (!jeton || jeton.length < 24) throw new Error('RAIME_MCP_JETON absent ou trop court (24 caractères au moins)');
  const attendu = Buffer.from(`Bearer ${jeton}`);
  return http.createServer(async (req, res) => {
    const repondre = (code, corps, entetes = {}) => {
      res.writeHead(code, { 'Content-Type': 'application/json', ...entetes });
      res.end(corps === null ? '' : JSON.stringify(corps));
    };
    if (req.url !== '/mcp') return repondre(404, { erreur: 'chemin inconnu' });
    const recu = Buffer.from(req.headers.authorization || '');
    if (recu.length !== attendu.length || !crypto.timingSafeEqual(recu, attendu)) return repondre(401, { erreur: 'jeton refusé' });
    if (req.method === 'GET') return repondre(405, null, { Allow: 'POST' });   // pas de flux serveur → client
    if (req.method !== 'POST') return repondre(405, null, { Allow: 'POST' });

    let corps = '';
    for await (const morceau of req) {
      corps += morceau;
      if (corps.length > TAILLE_MAX) return repondre(413, erreur(null, -32600, 'requête trop grande'));
    }
    let message;
    try { message = JSON.parse(corps); } catch { return repondre(400, erreur(null, -32700, 'JSON illisible')); }
    if (Array.isArray(message)) {
      const r = (await Promise.all(message.map((m) => traiter(m, { brain, n8n })))).filter(Boolean);
      return r.length ? repondre(200, r) : repondre(202, null);
    }
    const r = await traiter(message, { brain, n8n });
    return r ? repondre(200, r) : repondre(202, null);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { db } = await import('./lib.js');
  const pg = (await import('pg')).default;
  const brain = db(); await brain.connect();
  let n8n = null;
  try { n8n = new pg.Client({ connectionString: process.env.DATABASE_URL_N8N }); await n8n.connect(); } catch { n8n = null; }
  const hote = process.env.RAIME_MCP_HOTE || '0.0.0.0', port = Number(process.env.RAIME_MCP_PORT || 8766);
  creerServeur({ brain, n8n, jeton: process.env.RAIME_MCP_JETON }).listen(port, hote,
    () => console.log(`[raime-mcp] à l'écoute sur ${hote}:${port}/mcp — ${Object.keys(OUTILS).length} outils`));
}
