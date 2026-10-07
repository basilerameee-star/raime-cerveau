// Pure presentation model. A target hierarchy is never evidence of execution.
const DEPARTMENTS = [
  ['watchdog', 'Watchdog', 'Surveillance et reprise des opérations', '#a49bd2', -1.93, 352],
  ['data', 'Data & Intelligence', 'Sources, recherche et mémoire', '#829fce', -1.29, 381],
  ['contenu', 'Content Engine', 'Création et publication de contenus', '#b09ccb', -0.68, 359],
  ['croissance', 'Growth', 'Acquisition et campagnes', '#c28da9', -0.06, 395],
  ['analytics', 'Analytics', 'Mesure et compréhension des résultats', '#80bcc6', 0.56, 365],
  ['admin', 'Sales / Admin', 'Relation commerciale et validations', '#cd9b9b', 1.18, 384],
  ['livraison', 'Client Delivery', 'Missions et livrables clients', '#8ba7d1', 1.81, 351],
  ['finance', 'Finance', 'Budget, facturation et comptabilité', '#c4af85', 2.41, 394],
  ['builder', 'Engineering / DevOps', 'Outils, exécution et infrastructure', '#82b7ad', 3.02, 370],
  ['tresorerie', 'Treasury', 'Trésorerie et engagements', '#bcba8a', 3.66, 405],
];

// These are declared product capabilities, not synthetic agents or activity.
const PLANNED = [
  ['surveillance', 'watchdog', 'Surveillance', 'Observer les anomalies et les exécutions.'],
  ['reprise', 'watchdog', 'Reprise contrôlée', 'Reprendre une opération selon une politique de tentatives limitée.'],
  ['memoire', 'data', 'Mémoire', 'Indexer et retrouver les connaissances.'],
  ['veille', 'data', 'Recherche', 'Collecter et documenter les sources.'],
  ['media', 'contenu', 'Media', 'Profil éditorial Media.'],
  ['business', 'contenu', 'rAIme Business', 'Profil éditorial rAIme Business.'],
  ['studio', 'contenu', 'Studio & QA', 'Produire les médias et contrôler leur qualité.'],
  ['publication', 'contenu', 'Publication', 'Publier des contenus après validation.'],
  ['prospection', 'croissance', 'Prospection', 'Préparer les prises de contact.'],
  ['campagnes', 'croissance', 'Campagnes', 'Préparer et suivre les campagnes.'],
  ['analyse', 'analytics', 'Analyse', 'Comparer les résultats aux objectifs.'],
  ['instruments', 'analytics', 'Instruments', 'Recueillir des mesures déterministes.'],
  ['approbations', 'admin', 'Approbations', 'Centraliser les permissions et les décisions humaines.'],
  ['suivi-commercial', 'admin', 'Suivi commercial', 'Suivre les propositions et leurs validations.'],
  ['cadrage-client', 'livraison', 'Cadrage', 'Définir le périmètre et les critères de réussite d’une mission.'],
  ['livrables-client', 'livraison', 'Livrables', 'Préparer les livrables attendus pour une mission.'],
  ['recette-client', 'livraison', 'Recette', 'Vérifier les livrables avant leur remise au client.'],
  ['budget', 'finance', 'Budget', 'Mesurer les dépenses consolidées et appliquer les plafonds.'],
  ['facturation', 'finance', 'Facturation', 'Préparer et suivre les factures.'],
  ['comptabilite', 'finance', 'Comptabilité', 'Rapprocher les pièces et les écritures à valider.'],
  ['execution', 'builder', 'Exécution', 'Exécuter une demande et produire un résultat vérifiable.'],
  ['modeles', 'builder', 'Modèles', 'Évaluer les modèles et leur disponibilité.'],
  ['architecte', 'builder', 'Architecte', 'Décomposer les objectifs en tâches vérifiables.'],
  ['soldes', 'tresorerie', 'Soldes', 'Consolider les soldes disponibles depuis des sources autorisées.'],
  ['previsions-tresorerie', 'tresorerie', 'Prévisions', 'Estimer les entrées et sorties de trésorerie.'],
  ['engagements', 'tresorerie', 'Engagements', 'Suivre les montants engagés et les échéances.'],
];

const STATES = new Set(['IDLE', 'QUEUED', 'RUNNING', 'WAITING', 'APPROVAL_REQUIRED', 'COMPLETED', 'ERROR', 'OFFLINE', 'PLANNED', 'INACTIVE', 'UNKNOWN', 'OBSERVED']);
const DEPARTMENT_IDS = new Set(DEPARTMENTS.map(([id]) => id));
const ALIASES = { governor: 'jarvis', content: 'contenu', growth: 'croissance', engineering: 'builder', treasury: 'tresorerie', 'client-delivery': 'livraison', sales: 'admin' };
const canonical = (value) => typeof value === 'string' ? (Object.hasOwn(ALIASES, value) ? ALIASES[value] : value) : null;
const text = (value, fallback = '') => typeof value === 'string' ? value : fallback;
const array = (value) => Array.isArray(value) ? value : [];
const statusOf = (value, fallback = 'UNKNOWN') => value === 'READY' ? 'IDLE' : value === 'FAILED' ? 'ERROR' : STATES.has(value) ? value : fallback;
const hash = (value) => {
  let number = 2166136261;
  for (const char of value) number = Math.imul(number ^ char.charCodeAt(0), 16777619);
  return (number >>> 0) / 4294967296;
};
const tracesOf = (value) => array(value).filter((trace) => trace && typeof trace.agent === 'string').map((trace) => ({
  agent: trace.agent,
  fin_le: typeof trace.fin_le === 'string' && Number.isFinite(Date.parse(trace.fin_le)) ? trace.fin_le : null,
  statut: statusOf(trace.statut),
}));

function baseNode(id, name, description, type, parentId, extra = {}) {
  return { id, name, description, type, parentId, department: null, depth: 0,
    status: 'PLANNED', x: 0, y: 0, accentColor: '#b7b7d0', modules: [], traces: [],
    implementation: 'À construire', source: 'organisation_cible', ...extra };
}

/** Adapt /api/reseau without DOM, randomness, live clocks or invented telemetry. */
export function construireGraphe(payload = {}) {
  if (!payload || typeof payload !== 'object') payload = {};
  const nodes = new Map();
  nodes.set('jarvis', baseNode('jarvis', 'Central Governor', 'Point d’entrée et orchestration ciblée des demandes.', 'governor', null));
  for (const [id, name, description, accentColor, angle, radius] of DEPARTMENTS) {
    nodes.set(id, baseNode(id, name, description, 'department', 'jarvis', { department: id, depth: 1, accentColor, angle, radius }));
  }
  for (const [id, parent, name, description] of PLANNED) nodes.set(id, baseNode(id, name, description, 'capability', parent));

  // Known department IDs keep their curated placement and product naming.
  for (const raw of array(payload.noeuds)) {
    if (!raw || typeof raw.id !== 'string' || !raw.id.trim()) continue;
    const id = canonical(raw.id);
    const previous = nodes.get(id);
    const modules = [...new Set(array(raw.modules).filter((module) => typeof module === 'string' && module.trim()))];
    const main = id === 'jarvis' || DEPARTMENT_IDS.has(id);
    nodes.set(id, { ...(previous || baseNode(id, id, '', 'capability', canonical(raw.parent))),
      name: main ? previous.name : text(raw.nom, previous?.name || id),
      description: text(raw.role, previous?.description || ''),
      parentId: main ? previous.parentId : canonical(raw.parent) || previous?.parentId || 'builder',
      implementation: text(raw.implementation, modules.length ? 'Module existant' : 'À instrumenter'),
      status: statusOf(raw.statut), modules, traces: tracesOf(raw.traces), source: 'api_reseau',
    });
  }

  const errors = array(payload.erreurs).filter((error) => typeof error === 'string');
  const invalid = new Set();
  const resolve = (node, visiting = new Set()) => {
    if (node.id === 'jarvis' || DEPARTMENT_IDS.has(node.id)) return true;
    if (visiting.has(node.id) || !nodes.has(node.parentId)) return false;
    visiting.add(node.id);
    const parent = nodes.get(node.parentId);
    if (!resolve(parent, visiting)) return false;
    node.department = parent.department;
    node.depth = parent.depth + 1;
    node.accentColor = parent.accentColor;
    return true;
  };
  for (const node of nodes.values()) if (!resolve(node)) invalid.add(node.id);
  for (const id of invalid) nodes.delete(id);
  if (invalid.size) errors.push('HIERARCHIE_INVALIDE');

  const observedAt = typeof payload.observe_le === 'string' && Number.isFinite(Date.parse(payload.observe_le)) ? payload.observe_le : null;
  const observedTime = observedAt ? Date.parse(observedAt) : NaN;
  const modulesIndex = new Map();
  for (const parent of [...nodes.values()]) {
    for (const module of parent.modules) {
      let id = `module:${parent.id}:${module}`;
      while (nodes.has(id)) id += ':module';
      const traces = parent.traces.filter((trace) => trace.agent === module);
      const newest = [...traces].filter((trace) => trace.fin_le).sort((a, b) => Date.parse(b.fin_le) - Date.parse(a.fin_le))[0];
      const age = newest ? observedTime - Date.parse(newest.fin_le) : NaN;
      let status = newest && age >= 0 && age < 48 * 3600e3 ? (newest.statut === 'COMPLETED' ? 'OBSERVED' : newest.statut) : 'UNKNOWN';
      // Hermes health is authoritative for this single executor, not every agent.
      if (module === 'hermes' && parent.id === 'execution' && parent.modules.length === 1) status = parent.status;
      const node = baseNode(id, module.charAt(0).toUpperCase() + module.slice(1), `Module ${module} · ${parent.description}`, 'module', parent.id,
        { department: parent.department, depth: parent.depth + 1, accentColor: parent.accentColor, implementation: 'Module existant', source: 'api_reseau', status, traces, modules: [module] });
      nodes.set(id, node);
      if (!modulesIndex.has(module)) modulesIndex.set(module, id);
    }
  }

  const children = new Map();
  for (const node of nodes.values()) {
    if (!node.parentId) continue;
    if (!children.has(node.parentId)) children.set(node.parentId, []);
    children.get(node.parentId).push(node);
  }
  for (const siblings of children.values()) siblings.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const placeChildren = (parent) => {
    const descendants = children.get(parent.id) || [];
    descendants.forEach((node, index) => {
      if (node.type === 'department') {
        node.x = Math.cos(node.angle) * node.radius;
        node.y = Math.sin(node.angle) * node.radius;
      } else {
        const direction = Math.atan2(parent.y, parent.x);
        const fraction = descendants.length < 2 ? 0.5 : index / (descendants.length - 1);
        const fan = parent.type === 'department' ? 1.45 : 1.0;
        node.angle = direction + (fraction - 0.5) * fan + (hash(node.id + ':angle') - 0.5) * 0.065;
        node.radius = parent.type === 'department' ? 128 + (index % 3) * 48 + hash(node.id) * 30 : 82 + hash(node.id) * 43;
        node.x = parent.x + Math.cos(node.angle) * node.radius;
        node.y = parent.y + Math.sin(node.angle) * node.radius;
      }
      placeChildren(node);
    });
  };
  placeChildren(nodes.get('jarvis'));

  const events = new Map();
  for (const trace of tracesOf(payload.historique)) {
    if (!trace.fin_le || trace.statut === 'UNKNOWN') continue;
    const id = `${trace.agent}:${trace.fin_le}:${trace.statut}`;
    events.set(id, { id, agent: trace.agent, timestamp: trace.fin_le, status: trace.statut,
      nodeId: modulesIndex.get(trace.agent) || null, type: 'execution', source: 'boucle_passages' });
  }
  return {
    nodes: [...nodes.values()],
    edges: [...nodes.values()].filter((node) => node.parentId).map((node) => ({ id: `${node.parentId}>${node.id}`, source: node.parentId, target: node.id, type: 'hierarchy' })),
    events: [...events.values()].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp) || a.id.localeCompare(b.id)),
    observedAt, errors: [...new Set(errors)],
    sources: payload.sources && typeof payload.sources === 'object' ? { ...payload.sources } : {},
    precision: text(payload.precision, 'Organisation cible. Les capacités prévues ne sont pas des services actifs.'),
  };
}
