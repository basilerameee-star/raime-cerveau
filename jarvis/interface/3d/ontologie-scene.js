import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { CameraLibre } from './ontologie-camera-libre.js';
import { RenduStudio } from './ontologie-studio.js';

const PALETTE = {
  background: 0x080f20, silver: 0xc8d6ec,
  graphite: 0x14233c, violet: 0x8a73c8, green: 0x84b39b,
  displayViolet: 0xaaa8f4, cyan: 0x78aaff,
};
const DEFAULT_DIRECTION = new THREE.Vector3(.48, .70, .53).normalize();
const UP = new THREE.Vector3(0, 1, 0);
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const hash = value => Array.from(String(value)).reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0);
// Téléphone (07/10/2026, note 20) : écran de moins de 768 px ou appareil tactile → densité de pixels plafonnée
// à 1,25 (1,7 ailleurs) et sans occlusion GTAO, la passe la plus coûteuse. Suivi en direct (rotation, fenêtre).
const LEGER = '(max-width: 767px), (pointer: coarse)';



function roundedPlate(width, length, thickness, radius=.18) {
  const shape = new THREE.Shape(), x=-width/2, z=-length/2;
  shape.moveTo(x+radius,z); shape.lineTo(x+width-radius,z);
  shape.quadraticCurveTo(x+width,z,x+width,z+radius); shape.lineTo(x+width,z+length-radius);
  shape.quadraticCurveTo(x+width,z+length,x+width-radius,z+length); shape.lineTo(x+radius,z+length);
  shape.quadraticCurveTo(x,z+length,x,z+length-radius); shape.lineTo(x,z+radius);
  shape.quadraticCurveTo(x,z,x+radius,z);
  const bevel=Math.min(.025,thickness*.16);
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:thickness,bevelEnabled:true,bevelThickness:bevel,bevelSize:bevel,bevelSegments:3,curveSegments:8,steps:1});
  geometry.translate(0,0,-thickness/2); geometry.rotateX(-Math.PI/2);return geometry;
}

/** A navigable model of the organisation; geometry never implies live execution. */
export class SceneOntologie {
  constructor({ canvas, onSelect = () => {}, onHover = () => {}, onMetrics = () => {}, onError = () => {}, onFrame = () => {} }) {
    if (!canvas) throw new Error('Le canevas 3D est absent.');
    this.canvas = canvas;
    this.onSelect = onSelect;
    this.onHover = onHover;
    this.onMetrics = onMetrics;
    this.onError = onError;
    this.onFrame = onFrame;
    this.disposed = false;
    this.lost = false;
    this.selected = null;
    this.mode = 'perspective';
    this.explodeAmount = 1;
    this.connectionsVisible = true;
    this.nodes = new Map();
    this.positions = new Map();
    this.anchors = new Map();
    this.pickables = [];
    this.instanceIds = [];
    this.departmentMarkers = new Map();
    this.activePointers = new Set();
    this.graphResources = [];
    this.resources = [];
    this.raf = 0;
    this.dirty = true;
    this.idleFrames = 0;
    this.metricAt = 0;
    this.metricSamples = [];
    this.motion = matchMedia('(prefers-reduced-motion: reduce)');
    this.reducedMotion = this.motion.matches;
    this.handlers = [];
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(PALETTE.background);
    this.scene.fog = new THREE.Fog(PALETTE.background, 140, 360);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000);
    this.camera.position.copy(DEFAULT_DIRECTION).multiplyScalar(66);

    try {
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch (error) {
      onError({ code: 'WEBGL_UNAVAILABLE', message: 'La vue 3D nécessite WebGL 2. Active l’accélération graphique de ton navigateur.', error });
      throw error;
    }
    this.leger = matchMedia(LEGER);
    this.renderer.setPixelRatio(this._densite());
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.10;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = !this.reducedMotion;
    this.controls.dampingFactor = 0.10;
    this.controls.rotateSpeed = 0.65;
    this.controls.panSpeed = 0.8;
    this.controls.zoomSpeed = 0.85;
    this.controls.screenSpacePanning = true;
    this.controls.minDistance = 2.2;
    this.controls.maxDistance = 420;
    this.controls.minPolarAngle = 0.015;
    this.controls.maxPolarAngle = Math.PI * 0.96;
    this.controls.target.set(0, 0, 0);
    this.controls.update();

    this.freeCamera = new CameraLibre({ camera: this.camera, canvas,
      onChange: () => { this.tween = null; this._wake(); },
      onExit: () => this.view('perspective'),
    });

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this._lightAndGround();
    this.graphGroup = new THREE.Group();
    this.graphGroup.name = 'raime-ontology';
    this.scene.add(this.graphGroup);
    this.selectionRing = this._ring(PALETTE.violet);
    this.hoverRing = this._ring(PALETTE.cyan);
    this.scene.add(this.selectionRing, this.hoverRing);
    this._qualite();
    this._events();
    this.resize();
  }

  _densite() { return Math.min(window.devicePixelRatio || 1, this.leger.matches ? 1.25 : 1.7); }

  // Le rendu studio (GTAO) n'est créé que hors téléphone ; un passage en écran étroit le coupe sans le libérer.
  _qualite() {
    if (!this.leger.matches && !this.studio) this.studio = new RenduStudio({ renderer: this.renderer, scene: this.scene, camera: this.camera });
    if (this.studio) { this.studio.enabled = !this.leger.matches; this.studio.setNodeCount(this.nodes.size); }
  }

  _keep(value, graph = false) {
    (graph ? this.graphResources : this.resources).push(value);
    return value;
  }

  _material(color, options = {}, graph = true) {
    const Material = Object.hasOwn(options, 'clearcoat') ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
    return this._keep(new Material({ color, roughness: 0.48, metalness: 0.08, ...options }), graph);
  }

  _lightAndGround() {
    // A neutral studio environment gives metal and glass legible reflections.
    // It is generated locally and does not depict activity or require an asset.
    const studio = new THREE.Scene();
    const roomGeometry = new THREE.BoxGeometry(100, 80, 100);
    const roomMaterial = new THREE.MeshBasicMaterial({ color: 0x58657b, side: THREE.BackSide });
    studio.add(new THREE.Mesh(roomGeometry, roomMaterial));
    const softboxGeometry = new THREE.BoxGeometry(1, 1, 1);
    const softboxMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.1, 3.1, 3.1) });
    for (const [position, scale] of [[[0, 35, 0], [75, 0.1, 50]], [[-46, 12, 6], [0.1, 28, 70]], [[38, 18, -35], [15, 24, 0.1]]]) {
      const panel = new THREE.Mesh(softboxGeometry, softboxMaterial);
      panel.position.set(...position); panel.scale.set(...scale); studio.add(panel);
    }
    const generator = new THREE.PMREMGenerator(this.renderer);
    const environment = this._keep(generator.fromScene(studio, 0.035), false);
    this.scene.environment = environment.texture;
    this.scene.environmentIntensity = .85;
    generator.dispose(); roomGeometry.dispose(); roomMaterial.dispose(); softboxGeometry.dispose(); softboxMaterial.dispose();
    this.renderer.toneMappingExposure = .82;
    this.scene.add(new THREE.HemisphereLight(0xe4ecff, 0x20283a, 1.05));
    const light = new THREE.DirectionalLight(0xfff8f1, 2.65);
    light.position.set(-22, 35, 24);
    light.castShadow = true;
    light.shadow.mapSize.set(2048, 2048);
    Object.assign(light.shadow.camera, { left: -36, right: 36, top: 36, bottom: -36, near: 1, far: 100 });
    light.shadow.bias = -0.0003;
    light.shadow.normalBias = 0.055;
    light.shadow.radius = 3.2;
    this.scene.add(light);
    const fill = new THREE.DirectionalLight(0xb8d3ed, 1.10);
    fill.position.set(24, 15, -28); this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0xa696e3, 0.65);
    rim.position.set(-25, 9, -31); this.scene.add(rim);

  }

  _ring(color) {
    const ring = new THREE.Mesh(
      this._keep(new THREE.TorusGeometry(1, 0.025, 6, 64)),
      this._keep(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.76, depthWrite: false })),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    return ring;
  }

  _mesh(geometry, material, group, position = [0, 0, 0], nodeId) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (nodeId) {
      mesh.userData.nodeId = nodeId;
      this.pickables.push(mesh);
    }
    group.add(mesh);
    return mesh;
  }

  _nodePosition(node, index) {
    const spatial = node.spatial || {};
    const angle = finite(spatial.angle, (index / 12) * Math.PI * 2);
    const radius = node.depth === 0 ? 0 : node.depth === 1 ? 16 : 21;
    return new THREE.Vector3(finite(spatial.x, Math.cos(angle) * radius), finite(spatial.y), finite(spatial.z, Math.sin(angle) * radius));
  }

  setGraph(graph) {
    if (this.disposed || !Array.isArray(graph?.nodes)) return;
    const nodes = graph.nodes.filter(node => node && typeof node.id === 'string');
    const signature = nodes.map(node => `${node.id}:${node.parentId}:${node.depth}:${JSON.stringify(node.spatial || {})}`).join('|');
    this.nodes = new Map(nodes.map(node => [node.id, node]));
    this.studio?.setNodeCount(nodes.length);
    if (this.signature === signature) {
      this._updateStates();
      this._wake();
      return;
    }
    const wasEmpty = !this.signature;
    const pendingExplosion = this.explodeTween?.to;
    this.signature = signature;
    this._clearGraph();
    this.fullPositions = new Map(nodes.map((node, index) => [node.id, this._nodePosition(node, index)]));
    this.compactPositions = new Map(nodes.map(node => {
      const full = this.fullPositions.get(node.id), compact = node.spatial?.compact;
      return [node.id, compact ? new THREE.Vector3(finite(compact.x, full.x), finite(compact.y, full.y), finite(compact.z, full.z)) : full.clone()];
    }));
    for (const [id, full] of this.fullPositions) this.positions.set(id, full.clone());
    this.silver = this._material(PALETTE.silver, { roughness: .20, metalness: .78, clearcoat: .65, clearcoatRoughness: .12 });
    this.violet = this._material(PALETTE.displayViolet, { roughness: .25, metalness: .55, emissive: 0x383e85, emissiveIntensity: .20 });
    this.cyan = this._material(PALETTE.cyan, { roughness: .23, metalness: .62, emissive: 0x284f91, emissiveIntensity: .35 });
    this.glass = this._material(0xa5caff, { roughness: .08, metalness: .12, clearcoat: 1, clearcoatRoughness: .05, transparent: true, opacity: .15, depthWrite: false });
    this.wall = this._material(0xdce3eb,{roughness:.50,metalness:.12,clearcoat:.18});
    this.floorMaterial = this._material(0x8d9bb0,{roughness:.65,metalness:.10});
    this.roomFloor = this._material(0xbfcad7,{roughness:.45,metalness:.13,clearcoat:.22});
    this.furniture = this._material(0x213148,{roughness:.38,metalness:.38});
    this.box = this._keep(new THREE.BoxGeometry(1,1,1),true);
    this.markerGeometry = this._keep(new THREE.SphereGeometry(.075,12,8),true);
    this._building(nodes);

    for (const node of nodes) {
      if (node.depth === 0) this._director(node);
      else if (node.branch) this._department(node);
    }
    this._stations(nodes.filter(node => node.depth > 0 && !node.branch));
    this._connections(nodes);
    this._captureExplodeTargets();
    this._applyExplode(this.explodeAmount ?? 1);
    this._updateStates();
    this._applyAttention();
    this.renderer.shadowMap.needsUpdate = true;
    this._placeRing(this.selectionRing, this.selected);
    this.hoverRing.visible = false;
    if (wasEmpty) this.home();
    if (Number.isFinite(pendingExplosion)) this.setExplode(pendingExplosion);
    this._wake();
  }

  _director(node) {
    const group = new THREE.Group(); group.name = node.id;
    const position = this.positions.get(node.id); group.position.copy(position);
    this.graphGroup.add(group);
    const pedestal=this._mesh(this._keep(roundedPlate(5.2,4.5,.22,.5),true),this.furniture,group,[0,.2,0],node.id);
    const console=this._mesh(this._keep(roundedPlate(2.8,1.1,.15,.18),true),this.silver,group,[0,.92,1.4],node.id);
    const stem=this._mesh(this.box,this.furniture,group,[0,.54,1.4],node.id);stem.scale.set(1.1,.76,.6);
    const nucleusGroup=new THREE.Group();nucleusGroup.position.y=2.45;group.add(nucleusGroup);
    const shell = this._keep(new THREE.SphereGeometry(1.65, 64, 40), true);
    const inner = this._keep(new THREE.SphereGeometry(.80, 48, 32), true);
    const shellMaterial = this._material(0xd1dfff, { roughness: .06, metalness: .15, clearcoat: 1, clearcoatRoughness: .04, transparent: true, opacity: .22, depthWrite: false });
    const coreMaterial = this._material(0x739fef, { roughness: .17, metalness: .58, clearcoat: 1, emissive: 0x274da0, emissiveIntensity: .35 });
    this._mesh(inner, coreMaterial, nucleusGroup, [0, 0, 0], node.id);
    this._mesh(shell, shellMaterial, nucleusGroup, [0, 0, 0], node.id);
    const braid = this._keep(new THREE.TorusKnotGeometry(1.0, .022, 180, 8, 2, 3), true);
    this._mesh(braid, this.silver, nucleusGroup, [0, 0, 0], node.id);
    const orbit = this._keep(new THREE.TorusGeometry(2.13, .012, 8, 128), true);
    const orientations = [[.52, .18, .36], [1.27, .66, -.42], [.17, -.74, 1.13]];
    orientations.forEach((rotation, index) => {
      const ring = this._mesh(orbit, index === 1 ? this.violet : this.cyan, nucleusGroup, [0, 0, 0], node.id);
      ring.rotation.set(...rotation);
      for (let tick = 0; tick < 4; tick++) {
        const angle = tick * Math.PI / 2 + index * .6;
        const marker = new THREE.Vector3(Math.cos(angle) * 2.13, Math.sin(angle) * 2.13, 0).applyEuler(ring.rotation);
        this._mesh(this.markerGeometry, this.silver, nucleusGroup, marker.toArray(), node.id);
      }
    });
    this.anchors.set(node.id, position.clone().add(new THREE.Vector3(0, 4.7, 0)));
  }

  _building(nodes) {
    const bounds=new THREE.Box3();
    for(const node of nodes.filter(n=>n.spatial.room)) {
      const p=this.positions.get(node.id),r=node.spatial.room;
      bounds.expandByPoint(p.clone().add(new THREE.Vector3(-r.width/2-1,0,-r.depth/2-1)));
      bounds.expandByPoint(p.clone().add(new THREE.Vector3(r.width/2+1,0,r.depth/2+1)));
    }
    this.buildingBounds=bounds;
    const size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
    const foundation=this._mesh(this._keep(roundedPlate(size.x,size.z,.22,.45),true),this.furniture,this.graphGroup,[center.x,-.17,center.z]);
    foundation.userData.presentation='architecture';
    const floor=this._mesh(this._keep(roundedPlate(size.x-.12,size.z-.12,.08,.4),true),this.floorMaterial,this.graphGroup,[center.x,-.015,center.z]);
    floor.userData.presentation='architecture';
  }

  _department(node) {
    const group=new THREE.Group();group.name=node.id;
    const position=this.positions.get(node.id);group.position.copy(position);this.graphGroup.add(group);
    const room=node.spatial.room,w=room.width,d=room.depth;
    this._mesh(this._keep(roundedPlate(w,d,.12,.22),true),this.roomFloor,group,[0,.07,0],node.id);
    const part=(material,p,scale)=>{const mesh=this._mesh(this.box,material,group,p,node.id);mesh.scale.set(...scale);return mesh;};
    // Open roof and a doorway towards the shared circulation corridor.
    const doorSide=room.col<2?1:-1;
    part(this.wall,[-doorSide*w/2,1.04,0],[.15,1.84,d]);
    for(const sign of [-1,1]) {
      part(this.wall,[0,1.04,sign*d/2],[w,1.84,.15]);
      part(this.silver,[0,2.0,sign*d/2],[w,.035,.17]);
      part(this.furniture,[0,.18,sign*(d/2-.09)],[w,.08,.025]);
      const segment=(d-1.6)/2;
      part(this.wall,[doorSide*w/2,1.04,sign*(d/2-segment/2)],[.15,1.84,segment]);
    }
    const accent=part(this.cyan,[-doorSide*(w/2-.11),1.12,0],[.022,.035,Math.min(d-1,3.0)]);
    accent.userData.presentation='static-room-accent';
    // A glazed panel and cabinet give the space scale and fine material detail.
    part(this.glass,[-doorSide*(w/2-.13),1.38,0],[.04,.86,2.35]);
    part(this.furniture,[0,.53,-d/2+.4],[1.72,.84,.5]);
    part(this.silver,[0,.97,-d/2+.4],[1.77,.035,.54]);
    const stateMaterial=this._material(this._stateColor(node),{roughness:.24,metalness:.4});
    this._mesh(this.markerGeometry,stateMaterial,group,[doorSide*(w/2-.3),1.9,1.0],node.id);
    this.departmentMarkers.set(node.id,stateMaterial);
    this.anchors.set(node.id,position.clone().add(new THREE.Vector3(0,2.05,-d/2+.8)));
  }

  _stations(nodes) {
    this.instanceIds=nodes.map(n=>n.id);if(!nodes.length)return;
    const markerGeometry=this._keep(new THREE.SphereGeometry(.115,20,12),true);
    const markers=this._keep(new THREE.InstancedMesh(markerGeometry,this._material(0xffffff,{roughness:.2,metalness:.55,clearcoat:.8}),nodes.length),true);
    markers.userData.instanceNodes=[...this.instanceIds];markers.name='agent-state-markers';this.stationMarkers=markers;
    this.graphGroup.add(markers);this.pickables.push(markers);
    const transform=new THREE.Object3D();
    nodes.forEach((n,i)=>{const desk=n.type!=='module';transform.position.copy(this.positions.get(n.id));if(desk)transform.position.y+=.13;transform.scale.setScalar(desk?1:.8);transform.rotation.set(0,0,0);transform.updateMatrix();markers.setMatrixAt(i,transform.matrix);markers.setColorAt(i,new THREE.Color(this._stateColor(n)));this.anchors.set(n.id,this.positions.get(n.id).clone().add(new THREE.Vector3(0,desk?.65:.18,0)));});
    const desks=nodes.filter(n=>n.type!=='module');
    const desk=this._keep(roundedPlate(1.45,1.1,.09,.12),true);
    const seat=this._keep(roundedPlate(.50,.46,.07,.11),true);
    const chairBase=this._keep(new THREE.CylinderGeometry(.22,.25,.045,24),true);
    const batches=[{geometry:desk,material:this.silver,offset:[0,0,0],scale:[1,1,1],name:'workstations'},
      {geometry:this.box,material:this.furniture,offset:[0,-.42,0],scale:[.38,.8,.4],name:'desk-pedestals'},
      {geometry:this.box,material:this.furniture,offset:[0,.30,-.25],scale:[.60,.40,.055],name:'monitors'},
      {geometry:this.box,material:this.cyan,offset:[0,.30,-.218],scale:[.54,.32,.007],name:'static-display-surfaces'},
      {geometry:this.box,material:this.furniture,offset:[0,.065,.27],scale:[.48,.022,.2],name:'keyboard-surfaces'},
      {geometry:seat,material:this.furniture,offset:[0,-.36,.85],scale:[1,1,1],name:'chair-seats'},
      {geometry:this.box,material:this.furniture,offset:[0,-.14,1.05],scale:[.48,.42,.06],name:'chair-backs'},
      {geometry:this.box,material:this.silver,offset:[0,-.62,.85],scale:[.065,.48,.065],name:'chair-stems'},
      {geometry:chairBase,material:this.furniture,offset:[0,-.86,.85],scale:[1,1,1],name:'chair-feet'}];
    for(const b of batches) {
      if(!desks.length)continue;
      const mesh=this._keep(new THREE.InstancedMesh(b.geometry,b.material,desks.length),true);
      mesh.userData.instanceNodes=desks.map(n=>n.id);mesh.name=b.name;mesh.castShadow=mesh.receiveShadow=true;this.graphGroup.add(mesh);this.pickables.push(mesh);
      desks.forEach((n,i)=>{transform.position.copy(this.positions.get(n.id)).add(new THREE.Vector3(...b.offset));transform.scale.set(...b.scale);transform.rotation.set(0,0,0);transform.updateMatrix();mesh.setMatrixAt(i,transform.matrix);});
      mesh.computeBoundingSphere();
    }
    markers.computeBoundingSphere();
  }

  _relationCurve(node,poses) {
    const parent=poses.get(node.parentId).clone(),end=poses.get(node.id).clone();
    const parentNode=this.nodes.get(node.parentId);
    if(node.branch) {
      // A routed backbone along the atrium: never straight spokes from Jarvis.
      const side=parent.clone();side.y=.20;side.z=end.z;
      const entrance=end.clone();entrance.y=.20;entrance.x += end.x<0?node.spatial.room.width/2:-node.spatial.room.width/2;
      const finish=end.clone();finish.y=.20;
      const start=parent.clone();start.y=.20;
      // Avoid duplicate control points for the middle row.
      const points=start.distanceTo(side)<.01?[start,entrance,finish]:[start,side,entrance,finish];
      return new THREE.CatmullRomCurve3(points,false,'centripetal');
    }
    if(parentNode.depth===1)parent.y=.20;
    const middle=parent.clone().lerp(end,.5);middle.y+=.32;
    return new THREE.CatmullRomCurve3([parent,middle,end]);
  }

  _connections(nodes) {
    this.connectionGroup = new THREE.Group(); this.connectionGroup.name = 'hierarchy-connections';
    this.connectionGroup.visible = this.connectionsVisible !== false;
    this.graphGroup.add(this.connectionGroup);
    this.connectionLayouts = [];
    const primaryMaterial = this._material(0x6386ba, { roughness: .45, metalness: .25, emissive: 0x294568, emissiveIntensity: .20 });
    const secondaryMaterial = this._material(0x405777, { roughness: .50, metalness: .18 });
    this.linkMaterials = { primary: primaryMaterial, secondary: secondaryMaterial, dim: this._material(0x152942, { roughness: .55, metalness: .15 }), focused: this._material(0x98c3ff, { roughness: .3, emissive: 0x417be1, emissiveIntensity: .7 }) };
    for (const node of nodes) {
      if (!this.positions.has(node.parentId) || node.depth === 0) continue;
      const segments = node.depth === 1 ? 32 : 18, radialSegments = 6;
      const radius = node.depth === 1 ? .018 : .012;
      const fullGeometry = this._keep(new THREE.TubeGeometry(this._relationCurve(node, this.fullPositions), segments, radius, radialSegments, false), true);
      const compactGeometry = new THREE.TubeGeometry(this._relationCurve(node, this.compactPositions), segments, radius, radialSegments, false);
      fullGeometry.computeBoundingSphere(); compactGeometry.computeBoundingSphere();
      fullGeometry.boundingSphere.union(compactGeometry.boundingSphere);
      const mesh = this._mesh(fullGeometry, node.depth === 1 ? primaryMaterial : secondaryMaterial, this.connectionGroup);
      mesh.name = `relation-${node.parentId}-${node.id}`;
      mesh.userData.relation = { parentId: node.parentId, nodeId: node.id };
      mesh.castShadow = mesh.receiveShadow = false;
      this.connectionLayouts.push({ mesh, geometry: fullGeometry,
        full: fullGeometry.attributes.position.array.slice(), compact: compactGeometry.attributes.position.array.slice(),
        fullNormals: fullGeometry.attributes.normal.array.slice(), compactNormals: compactGeometry.attributes.normal.array.slice(),
      });
      compactGeometry.dispose();
    }
  }

  _captureExplodeTargets() {
    this.layoutGroups = this.graphGroup.children.filter(object => object.isGroup && this.nodes.has(object.name)).map(group => ({ group, id: group.name }));
    this.layoutInstances = this.graphGroup.children.filter(object => object.isInstancedMesh).map(mesh => ({ mesh, fullMatrices: mesh.instanceMatrix.array.slice(), ids: mesh.userData.instanceNodes }));
    this.anchorOffsets = new Map([...this.anchors].map(([id, anchor]) => [id, anchor.clone().sub(this.fullPositions.get(id))]));
    this.layoutOffsets = new Map([...this.fullPositions].map(([id]) => [id, new THREE.Vector3()]));
    for (const { mesh, fullMatrices, ids } of this.layoutInstances) {
      mesh.computeBoundingSphere(); const fullBounds = mesh.boundingSphere.clone();
      const data = mesh.instanceMatrix.array;
      ids.forEach((id, index) => {
        const full = this.fullPositions.get(id), compact = this.compactPositions.get(id), at = index * 16;
        data[at + 12] = fullMatrices[at + 12] + compact.x - full.x;
        data[at + 13] = fullMatrices[at + 13] + compact.y - full.y;
        data[at + 14] = fullMatrices[at + 14] + compact.z - full.z;
      });
      mesh.computeBoundingSphere(); mesh.boundingSphere.union(fullBounds);
      data.set(fullMatrices); mesh.instanceMatrix.needsUpdate = true;
    }
  }

  _applyExplode(amount) {
    this.explodeAmount = amount;
    const offsets = this.layoutOffsets;
    for (const [id, full] of this.fullPositions) {
      const position = this.positions.get(id);
      position.lerpVectors(this.compactPositions.get(id), full, amount);
      offsets.get(id).copy(position).sub(full);
      this.anchors.get(id).copy(position).add(this.anchorOffsets.get(id));
    }
    for (const { group, id } of this.layoutGroups) group.position.copy(this.positions.get(id));
    for (const { mesh, fullMatrices, ids } of this.layoutInstances) {
      const data = mesh.instanceMatrix.array;
      ids.forEach((id, index) => {
        const offset = offsets.get(id), at = index * 16;
        data[at + 12] = fullMatrices[at + 12] + offset.x;
        data[at + 13] = fullMatrices[at + 13] + offset.y;
        data[at + 14] = fullMatrices[at + 14] + offset.z;
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
    for (const layout of this.connectionLayouts) {
      const positions = layout.geometry.attributes.position, normals = layout.geometry.attributes.normal;
      for (let index = 0; index < positions.array.length; index += 3) {
        for (let axis = 0; axis < 3; axis++) {
          positions.array[index + axis] = layout.compact[index + axis] + (layout.full[index + axis] - layout.compact[index + axis]) * amount;
          normals.array[index + axis] = layout.compactNormals[index + axis] + (layout.fullNormals[index + axis] - layout.compactNormals[index + axis]) * amount;
        }
        const length = Math.hypot(normals.array[index], normals.array[index + 1], normals.array[index + 2]) || 1;
        normals.array[index] /= length; normals.array[index + 1] /= length; normals.array[index + 2] /= length;
      }
      positions.needsUpdate = normals.needsUpdate = true;
    }
    this._placeRing(this.selectionRing, this.selected);
    this._placeRing(this.hoverRing, this.hoverRing.visible ? this.hoverRing.userData?.nodeId : null);
    this.renderer.shadowMap.needsUpdate = true;
    this.dirty = true;
  }

  setExplode(amount) {
    if (!Number.isFinite(amount) || this.disposed) return;
    const next = THREE.MathUtils.clamp(amount, 0, 1);
    if (!this.fullPositions?.size) { this.explodeAmount = next; return; }
    if (this.reducedMotion) { this.explodeTween = null; this._applyExplode(next); }
    else if (next !== this.explodeAmount) {
      this.explodeTween = { started: performance.now(), duration: 700, from: this.explodeAmount, to: next };
    } else this.explodeTween = null;
    this._wake();
  }

  setConnectionsVisible(visible) {
    this.connectionsVisible = Boolean(visible);
    if (this.connectionGroup) this.connectionGroup.visible = this.connectionsVisible;
    this._wake();
  }
  _stateColor(node) {
    if (['ERROR', 'FAILED', 'APPROVAL_REQUIRED', 'WAITING'].includes(node.status)) return PALETTE.violet;
    if (['RUNNING', 'COMPLETED', 'READY', 'IDLE'].includes(node.status)) return PALETTE.green;
    return PALETTE.silver;
  }

  _updateStates() {
    for (const [id, material] of this.departmentMarkers) material.color.setHex(this._stateColor(this.nodes.get(id) || {}));
    if (this.stationMarkers) {
      this.instanceIds.forEach((id, index) => this.stationMarkers.setColorAt(index, new THREE.Color(this._stateColor(this.nodes.get(id) || {}))));
      this.stationMarkers.instanceColor.needsUpdate = true;
    }
    // A colour marks a known state, never a fabricated stream of activity.
  }

  _clearGraph() {
    this.graphGroup.clear();
    for (const value of this.graphResources) value.dispose?.();
    this.graphResources = [];
    this.positions.clear();
    this.anchors.clear();
    this.pickables = [];
    this.instanceIds = [];
    this.stationMarkers = null;
    this.departmentMarkers.clear();
    this.fullPositions?.clear(); this.compactPositions?.clear();
    this.layoutGroups = []; this.layoutInstances = []; this.connectionLayouts = [];
    this.connectionGroup = null; this.linkMaterials = null; this.anchorOffsets = null; this.layoutOffsets = null;
    this.explodeTween = null;
  }

  _applyAttention() {
    if (!this.connectionLayouts?.length || !this.linkMaterials) return;
    const related = new Set();
    let ancestor = this.nodes.get(this.selected);
    while (ancestor && !related.has(ancestor.id)) { related.add(ancestor.id); ancestor = this.nodes.get(ancestor.parentId); }
    const descendants = [this.selected];
    for (let i = 0; i < descendants.length; i++) for (const node of this.nodes.values()) {
      if (node.parentId === descendants[i] && !related.has(node.id)) { related.add(node.id); descendants.push(node.id); }
    }
    for (const { mesh } of this.connectionLayouts) {
      const { nodeId, parentId } = mesh.userData.relation;
      const active = this.selected && related.has(nodeId) && related.has(parentId);
      mesh.userData.focused = Boolean(active);
      mesh.visible=Boolean(this.selected)&&Boolean(active);
      mesh.material = this.selected ? active ? this.linkMaterials.focused : this.linkMaterials.dim : this.nodes.get(nodeId)?.depth === 1 ? this.linkMaterials.primary : this.linkMaterials.secondary;
    }
  }

  _placeRing(ring, id) {
    const node = this.nodes.get(id), position = this.positions.get(id);
    ring.visible = Boolean(node && position);
    if (!ring.visible) return;
    ring.userData.nodeId = id; ring.position.copy(position);
    ring.scale.setScalar(node.depth === 0 ? 2.4 : node.depth === 1 ? 1.5 : node.depth >= 3 ? .42 : .52);
  }

  _transition(position, target) {
    this.controls.update();
    if (this.reducedMotion) {
      this.camera.position.copy(position);
      this.controls.target.copy(target);
      this.controls.update();
      this.tween = null;
    } else {
      this.tween = {
        started: performance.now(), duration: 720,
        fromEye: this.camera.position.clone(), toEye: position,
        fromTarget: this.controls.target.clone(), toTarget: target,
      };
    }
    this._wake();
  }

  _intent() {
    return {
      eye: (this.tween?.toEye || this.camera.position).clone(),
      target: (this.tween?.toTarget || this.controls.target).clone(),
    };
  }

  focus(id) {
    const node = this.nodes.get(id);
    const position = this.positions.get(id);
    if (!node || !position || this.disposed) return;
    this.selected = id;
    this._applyAttention();
    this._placeRing(this.selectionRing, id);
    if (this.mode === 'free') { this._wake(); return; }
    const target = position.clone().add(new THREE.Vector3(0,node.depth===0?2.0:node.branch?1.1:0,0));
    const distance = node.depth === 0 ? 13 : node.branch ? Math.max(17,node.spatial.room.width*1.65) : node.depth >= 3 ? 6.5 : 8.5;
    const intent = this._intent();
    const direction = this.mode === 'top' ? new THREE.Vector3(0, 1, 0.001).normalize() : intent.eye.sub(intent.target).normalize();
    this._transition(target.clone().addScaledVector(direction, distance), target);
  }

  home() {
    if (this.disposed) return;
    if (this.mode === 'free') { this.freeCamera.setEnabled(false); this.mode = 'perspective'; this.controls.enabled = true; this.controls.enableRotate = true; }
    this.selected = null;
    this._applyAttention();
    this.selectionRing.visible = false;
    const direction = this.mode === 'top' ? new THREE.Vector3(0, 1, 0.001).normalize() : DEFAULT_DIRECTION;
    const bounds = new THREE.Box3();
    const corners = [];
    for (const [id, p] of this.positions) {
      const node = this.nodes.get(id);
      const half = node?.depth === 0 ? 3 : node?.branch ? node.spatial.room.width/2+1 : .8;
      const height = node?.depth===0?5:node?.branch?2.4:1;
      const halfZ=node?.branch?node.spatial.room.depth/2+1:half;
      for (const x of [-half, half]) for (const z of [-halfZ, halfZ]) for (const y of [0, height]) {
        const corner = p.clone().add(new THREE.Vector3(x, y, z));
        corners.push(corner); bounds.expandByPoint(corner);
      }
    }
    const target = bounds.isEmpty() ? new THREE.Vector3(0, 1, 0) : bounds.getCenter(new THREE.Vector3());
    const right = new THREE.Vector3().crossVectors(UP, direction).normalize();
    const cameraUp = new THREE.Vector3().crossVectors(direction, right).normalize();
    const tanV = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * .70;
    const tanH = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * Math.max(.35, this.camera.aspect) * .86;
    let fit = 20;
    for (const corner of corners) {
      const relative = corner.clone().sub(target), depth = relative.dot(direction);
      fit = Math.max(fit, Math.abs(relative.dot(cameraUp)) / tanV + depth, Math.abs(relative.dot(right)) / tanH + depth);
    }
    const distance = Math.min(this.controls.maxDistance, fit);
    this._transition(target.clone().addScaledVector(direction, distance), target);
  }

  walk() {
    if(this.disposed)return;
    this.view('free');this.camera.position.set(0,1.85,7);this.camera.lookAt(0,2,0);this.freeCamera.syncFromCamera();this._wake();
  }

  view(mode = 'perspective') {
    if (this.disposed) return;
    if (mode === 'free') {
      this.tween = null;
      this.interacting = false;
      this.controls.enabled = false;
      this.mode = 'free';
      this.freeCamera.setEnabled(true);
      this._wake();
      return;
    }
    this.freeCamera.setEnabled(false);
    this.controls.enabled = true;
    this.mode = mode === 'top' ? 'top' : 'perspective';
    this.controls.enableRotate = this.mode !== 'top';
    if (!this.selected) { this.home(); return; }
    const intent = this._intent();
    const distance = intent.eye.distanceTo(intent.target);
    const direction = this.mode === 'top' ? new THREE.Vector3(0, 1, 0.001).normalize() : DEFAULT_DIRECTION;
    const target = intent.target;
    this._transition(target.clone().addScaledVector(direction, distance), target);
  }

  zoom(factor) {
    if (!Number.isFinite(factor) || factor <= 0 || this.disposed) return;
    if (this.mode === 'free') { this.freeCamera.dolly((factor - 1) * 10); return; }
    const intent = this._intent();
    const target = intent.target;
    const offset = intent.eye.sub(target);
    const distance = THREE.MathUtils.clamp(offset.length() / factor, this.controls.minDistance, this.controls.maxDistance);
    this._transition(target.clone().add(offset.normalize().multiplyScalar(distance)), target);
  }

  project(id) {
    const anchor = this.anchors.get(id);
    if (!anchor || this.disposed) return { x: 0, y: 0, visible: false };
    const projected = anchor.clone().project(this.camera);
    return {
      x: (projected.x * 0.5 + 0.5) * this.width,
      y: (-projected.y * 0.5 + 0.5) * this.height,
      visible: projected.z >= -1 && projected.z <= 1 && Math.abs(projected.x) < 1.03 && Math.abs(projected.y) < 1.03,
      distance: anchor.distanceTo(this.camera.position),
    };
  }

  getViewState() {
    return {
      eye: this.camera.position.toArray(), target: this.controls.target.toArray(),
      distance: this.camera.position.distanceTo(this.controls.target), selected: this.selected,
      moving: Boolean(this.tween || this.explodeTween || this.interacting || this.freeCamera.moving || this.idleFrames < 4), mode: this.mode,
      explode: this.explodeAmount, explosion: this.explodeAmount, exploding: Boolean(this.explodeTween), connectionsVisible: this.connectionsVisible,
    };
  }

  exportRoot() {
    this.graphGroup.updateMatrixWorld(true);
    return this.graphGroup;
  }

  resize() {
    if (this.disposed) return;
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height, false);
    this.studio?.resize(this.width, this.height);
    this._wake();
  }

  _pick(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.pickables, false)[0];
    if (!hit) return null;
    const id = hit.object.userData.instanceNodes?.[hit.instanceId] || hit.object.userData.nodeId;
    return this.nodes.get(id) || null;
  }

  _listen(target, type, listener, options) {
    target.addEventListener(type, listener, options);
    this.handlers.push(() => target.removeEventListener(type, listener, options));
  }

  _events() {
    this._listen(this.controls, 'start', () => { this.interacting = true; this.tween = null; this._wake(); });
    this._listen(this.controls, 'end', () => { this.interacting = false; this._wake(); });
    this._listen(this.controls, 'change', () => { this.dirty = true; this._wake(); });
    this._listen(this.canvas, 'pointerdown', event => {
      this.activePointers.add(event.pointerId);
      if (this.activePointers.size > 1) this.down = null;
      else if (event.button === 0) this.down = { x: event.clientX, y: event.clientY, at: performance.now(), pointerId: event.pointerId };
    });
    this._listen(this.canvas, 'pointerup', event => {
      this.activePointers.delete(event.pointerId);
      if (!this.down || event.pointerId !== this.down.pointerId) return;
      const click = Math.hypot(event.clientX - this.down.x, event.clientY - this.down.y) < 6 && performance.now() - this.down.at < 850;
      this.down = null;
      if (click) {
        const node = this._pick(event);
        if (node) this.onSelect(node);
      }
    });
    this._listen(this.canvas, 'pointercancel', event => { this.activePointers.delete(event.pointerId); this.down = null; });
    this._listen(this.canvas, 'pointermove', event => {
      if (this.down || event.pointerType === 'touch') return;
      const node = this._pick(event);
      const rect = this.canvas.getBoundingClientRect();
      this.canvas.style.cursor = node ? 'pointer' : 'grab';
      this._placeRing(this.hoverRing, node?.id);
      this.onHover(node, { x: event.clientX - rect.left, y: event.clientY - rect.top });
      this._wake();
    });
    this._listen(this.canvas, 'pointerleave', () => {
      this.hoverRing.visible = false;
      this.onHover(null, { x: 0, y: 0 });
      this._wake();
    });
    this._listen(this.canvas, 'contextmenu', event => event.preventDefault());
    this._listen(this.canvas, 'keydown', event => {
      if (this.freeCamera.enabled) return;
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      if (!event.shiftKey && this.mode === 'top') this.view('perspective');
      const intent = this._intent();
      const offset = intent.eye.clone().sub(intent.target);
      if (event.shiftKey) {
        const forward = offset.clone().negate();
        forward.y = 0;
        forward.normalize();
        const right = forward.clone().cross(UP).normalize();
        const delta = event.key === 'ArrowLeft' ? right.negate() : event.key === 'ArrowRight' ? right : event.key === 'ArrowUp' ? forward : forward.negate();
        delta.multiplyScalar(offset.length() * 0.045);
        this._transition(intent.eye.add(delta), intent.target.add(delta));
      } else {
        const spherical = new THREE.Spherical().setFromVector3(offset);
        if (event.key === 'ArrowLeft') spherical.theta -= 0.105;
        else if (event.key === 'ArrowRight') spherical.theta += 0.105;
        else if (event.key === 'ArrowUp') spherical.phi -= 0.085;
        else spherical.phi += 0.085;
        spherical.phi = THREE.MathUtils.clamp(spherical.phi, this.controls.minPolarAngle, this.controls.maxPolarAngle);
        this._transition(intent.target.clone().add(new THREE.Vector3().setFromSpherical(spherical)), intent.target);
      }
    });
    this._listen(this.canvas, 'webglcontextlost', event => {
      event.preventDefault();
      this.lost = true;
      this.controls.enabled = false;
      this.freeCamera.setEnabled(false);
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.onError({ code: 'WEBGL_CONTEXT_LOST', message: 'Le contexte graphique a été interrompu. La vue reprendra dès sa restauration.' });
    });
    this._listen(this.canvas, 'webglcontextrestored', () => {
      this.lost = false;
      this.controls.enabled = this.mode !== 'free';
      this.freeCamera.setEnabled(this.mode === 'free');
      this.renderer.shadowMap.needsUpdate = true;
      this.onError(null);
      this._wake();
    });
    this._listen(document, 'visibilitychange', () => {
      if (document.hidden) {
        cancelAnimationFrame(this.raf);
        this.raf = 0;
      } else this._wake();
    });
    this._listen(this.motion, 'change', event => {
      this.reducedMotion = event.matches;
      this.controls.enableDamping = !this.reducedMotion;
      if (this.reducedMotion && this.explodeTween) {
        this._applyExplode(this.explodeTween.to);
        this.explodeTween = null;
      }
      if (this.reducedMotion && this.tween) {
        this.camera.position.copy(this.tween.toEye);
        this.controls.target.copy(this.tween.toTarget);
        this.tween = null;
        this.controls.update();
      }
      this._wake();
    });
    this._listen(this.leger, 'change', () => { this.renderer.setPixelRatio(this._densite()); this._qualite(); this.resize(); });
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(this.canvas);
  }

  _wake() {
    if (this.disposed || this.lost || document.hidden) return;
    this.dirty = true;
    if (!this.raf && !this.inTick) this.raf = requestAnimationFrame(now => this._tick(now));
  }

  _tick(now) {
    this.raf = 0;
    if (this.disposed || this.lost || document.hidden) return;
    this.inTick = true;
    const delta = Math.min(.1, Math.max(0, (now - (this.lastTick ?? now)) / 1000));
    this.lastTick = now;
    if (this.explodeTween) {
      const progress = THREE.MathUtils.clamp((now - this.explodeTween.started) / this.explodeTween.duration, 0, 1);
      const eased = progress < .5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
      this._applyExplode(this.explodeTween.from + (this.explodeTween.to - this.explodeTween.from) * eased);
      if (progress === 1) this.explodeTween = null;
    }
    if (this.tween) {
      const progress = Math.min(1, (now - this.tween.started) / this.tween.duration);
      const eased = progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
      this.camera.position.lerpVectors(this.tween.fromEye, this.tween.toEye, eased);
      this.controls.target.lerpVectors(this.tween.fromTarget, this.tween.toTarget, eased);
      if (progress === 1) this.tween = null;
      this.dirty = true;
    }
    const changed = this.mode === 'free' ? this.freeCamera.update(delta) : this.controls.update();
    if (this.mode === 'free') this.controls.target.copy(this.camera.position).addScaledVector(this.camera.getWorldDirection(new THREE.Vector3()), 8);
    this.idleFrames = changed || this.tween || this.explodeTween || this.interacting || this.freeCamera.moving ? 0 : this.idleFrames + 1;
    if (this.dirty || changed || this.tween) {
      const started = performance.now();
      try {
        this.studio ? this.studio.render() : this.renderer.render(this.scene, this.camera);
      } catch (error) {
        this.lost = true;
        this.inTick = false;
        this.onError({ code: 'WEBGL_RENDER_FAILED', message: 'Le rendu 3D s’est interrompu.', error });
        return;
      }
      const drawMs = performance.now() - started;
      this.metricSamples.push(drawMs);
      if (now - this.metricAt >= 500) {
        this.onMetrics({ drawMs: this.metricSamples.reduce((sum, value) => sum + value, 0) / this.metricSamples.length, nodes: this.nodes.size });
        this.metricSamples = [];
        this.metricAt = now;
      }
      this.onFrame();
      this.dirty = false;
    }
    this.inTick = false;
    if (this.tween || this.explodeTween || this.interacting || this.freeCamera.moving || this.idleFrames < 4) this.raf = requestAnimationFrame(next => this._tick(next));
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    for (const remove of this.handlers) remove();
    this.controls.dispose();
    this.freeCamera.dispose();
    this.studio?.dispose();
    this._clearGraph();
    for (const value of this.resources) value.dispose?.();
    this.renderer.dispose();
    this.scene.clear();
  }
}
