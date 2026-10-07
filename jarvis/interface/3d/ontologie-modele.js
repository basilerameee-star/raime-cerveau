import { construireGraphe } from './carte-modele.js';

// Twelve visual territories: ten operational departments and two shared layers.
// A shared layer is never presented as an independent reasoning agent.
const BRANCHES = ['watchdog', 'data', 'contenu', 'croissance', 'analytics', 'admin', 'livraison', 'finance', 'builder', 'tresorerie', 'knowledge', 'event-bus'];
// Two wings, three rows and a shared central atrium. Connections never define
// the placement: rooms follow the organisation's functional structure.
const ROOMS = [
  ['watchdog',0,0],['data',1,0],['admin',2,0],['livraison',3,0],
  ['knowledge',0,1],['builder',1,1],['finance',2,1],['tresorerie',3,1],
  ['event-bus',0,2],['contenu',1,2],['analytics',2,2],['croissance',3,2],
];
const hash = (value) => {
  let number = 2166136261;
  for (const char of value) number = Math.imul(number ^ char.charCodeAt(0), 16777619);
  return (number >>> 0) / 4294967296;
};
const infrastructure = (id, name, description, parentId = 'jarvis') => ({
  id, name, description, type: parentId === 'jarvis' ? 'infrastructure' : 'capability',
  parentId, department: parentId === 'jarvis' ? id : 'event-bus',
  depth: parentId === 'jarvis' ? 1 : 2, status: 'PLANNED',
  modules: [], traces: [], implementation: 'Architecture cible · à instrumenter',
  source: 'architecture_cible', accentColor: '#8c80ba', x: 0, y: 0,
  role: 'shared-infrastructure',
});

/** A pure 3D presentation adapter; it grants no permissions and starts no service. */
export function construireOntologie(payload = {}) {
  const graph = construireGraphe(payload);
  const nodes = graph.nodes.map((node) => ({ ...node }));
  const index = new Map(nodes.map((node) => [node.id, node]));
  const extras = [
    infrastructure('knowledge', 'Knowledge Layer', 'Infrastructure partagée de mémoire et de connaissances ; ne raisonne pas de façon indépendante.'),
    infrastructure('event-bus', 'Event Bus', 'Représentation cible des files, workflows et journaux partagés ; activité non instrumentée.'),
    infrastructure('event-queues', 'Files & workflows', 'Acheminement déterministe des tâches et des événements prévu dans l’architecture.', 'event-bus'),
    infrastructure('event-logging', 'Journal des événements', 'Journalisation commune prévue ; aucune communication en direct n’est déduite de la hiérarchie.', 'event-bus'),
  ];
  for (const node of extras) {
    // These IDs belong to the visual adapter, not to backend agents.
    const existing = index.get(node.id);
    if (existing) Object.assign(existing, node);
    else { nodes.push(node); index.set(node.id, node); }
  }
  const memory = index.get('memoire');
  if (memory) memory.parentId = 'knowledge';
  const root = index.get('jarvis');
  root.name = 'Jarvis';
  root.spatial = { x: 0, y: 0, z: 0, angle: 0, compact: { x: 0, y: 0, z: 0 } };
  root.branch = false;

  const children = new Map();
  for (const node of nodes) {
    node.branch = BRANCHES.includes(node.id);
    if (!node.parentId) continue;
    if (!children.has(node.parentId)) children.set(node.parentId, []);
    children.get(node.parentId).push(node);
  }
  for (const siblings of children.values()) siblings.sort((a, b) => a.id.localeCompare(b.id, 'en'));

  function classify(parent) {
    for (const node of children.get(parent.id) || []) {
      if (node.branch) continue;
      node.department = parent.branch ? parent.id : parent.department;
      node.depth = parent.depth + 1;
      node.accentColor = parent.accentColor;
      classify(node);
    }
  }
  classify(root);
  for (const id of BRANCHES) classify(index.get(id));
  const metrics = new Map(ROOMS.map(([id]) => {
    const count = (children.get(id) || []).filter(n => !n.branch).length;
    const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
    return [id, { width: Math.max(8.6, cols * 1.85 + 2.6), depth: Math.max(8.6, Math.ceil(count / cols) * 1.85 + 2.6), cols }];
  }));
  const columns = [0,1,2,3].map(col => Math.max(...ROOMS.filter(r => r[1] === col).map(r => metrics.get(r[0]).width)));
  const rows = [0,1,2].map(row => Math.max(...ROOMS.filter(r => r[2] === row).map(r => metrics.get(r[0]).depth)));
  const xs = [-4-columns[1]-2-columns[0]/2, -4-columns[1]/2, 4+columns[2]/2, 4+columns[2]+2+columns[3]/2];
  const zs = [-rows[1]/2-2-rows[0]/2, 0, rows[1]/2+2+rows[2]/2];
  for (const [id,col,row] of ROOMS) {
    const room = metrics.get(id), point = { x: xs[col], y: 0, z: zs[row] };
    index.get(id).spatial = { ...point, angle: col < 2 ? 0 : Math.PI, compact: {...point}, room: {...room, col, row} };
  }
  function placeChildren(parent) {
    const descendants = (children.get(parent.id) || []).filter(n => !n.branch);
    const room = parent.spatial.room;
    descendants.forEach((node, ordinal) => {
      let compact, full;
      if (room || parent.id === 'jarvis') {
        const cols = room?.cols || 2, rowsCount = Math.ceil(descendants.length/cols);
        const x = (ordinal % cols - (cols-1)/2) * 1.85;
        const z = (Math.floor(ordinal/cols) - (rowsCount-1)/2) * 1.85;
        compact = {x:parent.spatial.x+x,y:.96,z:parent.spatial.z+z};
        if(parent.id==='jarvis') compact.z += 3.3;
        full = {...compact,y:compact.y+1.7};
      } else {
        const cols = 4, layer = Math.floor(ordinal/12), slot = ordinal%12;
        compact = {x:parent.spatial.compact.x+(slot%cols-1.5)*.25,y:parent.spatial.compact.y+.30+layer*.32,z:parent.spatial.compact.z+(Math.floor(slot/cols)-1)*.25+.14};
        full = {...compact,y:parent.spatial.y+1.0+layer*.32};
      }
      node.spatial = {...full,angle:hash(node.id)*Math.PI*2,compact};
      placeChildren(node);
    });
  }
  placeChildren(root);
  for(const id of BRANCHES) placeChildren(index.get(id));

  return { ...graph, nodes,
    edges: nodes.filter((node) => node.parentId).map((node) => ({ id: `${node.parentId}>${node.id}`, source: node.parentId, target: node.id, type: 'hierarchy' })),
    branches: [...BRANCHES],
    precision: `${graph.precision} Le plan d’entreprise présente douze espaces : dix départements et deux infrastructures partagées prévues. Les connexions décrivent leur rattachement, sans déduire une activité en direct.`,
  };
}
