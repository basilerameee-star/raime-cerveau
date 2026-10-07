import {construireOntologie} from './ontologie-modele.js';

const $=id=>document.getElementById(id);
const statuses={PLANNED:'Prévu',UNKNOWN:'État à vérifier',OBSERVED:'Passage observé',IDLE:'Disponible',QUEUED:'En file',RUNNING:'En cours',WAITING:'En attente',APPROVAL_REQUIRED:'Validation requise',COMPLETED:'Terminé',ERROR:'Erreur observée',OFFLINE:'Hors ligne',INACTIVE:'Inactif'};
const types={governor:'Direction',department:'Département',infrastructure:'Infrastructure partagée',capability:'Fonction',module:'Composant'};
const make=(tag,text,cls)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e;};
let graph=construireOntologie(),scene=null,selected='jarvis',stale=false,lastPayload=null,labels=new Map(),detailStamp='',hovered=null;
const panel=$('inspecteur'),directory=$('map-search');
// Jarvis (jarvis.js, 07/10/2026) pose des pastilles sur les pièces (« 3 à appeler » sur Growth et Sales) et complète
// la fiche de certains éléments (Finance, Prospection, Exécution) : deux événements, aucune donnée inventée ici.
const pastilles=new Map();
function coreOpen(open,focusInput=false){$('core-conversation').hidden=!open;$('core-toggle').setAttribute('aria-expanded',String(open));$('echange').classList.toggle('expanded',open);if(open)closePanel();if(open&&focusInput&&!$('saisie').disabled)$('saisie').focus({preventScroll:true});if(scene)placeLabels();}
function counts(){$('atlas-summary').textContent=`${graph.branches.length} pôles · ${graph.nodes.length} éléments à explorer`;$('core-poles').textContent=graph.branches.length;$('core-nodes').textContent=graph.nodes.length;$('core-links').textContent=graph.edges.length;}

function breadcrumb(){
  const chain=[];let n=graph.nodes.find(n=>n.id===selected);
  while(n){chain.unshift(n);n=graph.nodes.find(x=>x.id===n.parentId);}
  const root=$('breadcrumb');root.replaceChildren();
  for(const [i,n] of chain.entries()){if(i)root.append(make('span','/'));const b=make('button',n.depth===0?'Entreprise':n.name);b.onclick=n.depth===0?whole:()=>choose(n);root.append(b);}
}
function closePanel(){panel.classList.remove('visible');panel.hidden=true;detailStamp='';}
function whole(){selected='jarvis';closePanel();coreOpen(false);scene?.home();breadcrumb();$('map-description').textContent='Plan de l’entreprise : sélectionne une pièce ou un agent pour explorer ses connexions.';}
function choose(n){
  if(!n)return;selected=n.id;hovered=null;$('node-tooltip').hidden=true;directory.hidden=true;
  scene?.focus(n.id);breadcrumb();
  if(n.id==='jarvis')coreOpen(true,true);else{coreOpen(false);showDetails(n,true);}
  $('map-description').textContent=n.name+' · '+(statuses[n.status]||n.status)+' · '+n.description;
}
function showDetails(n,focus=false){
  const stamp=JSON.stringify([n,stale]);if(stamp===detailStamp&&!focus)return;detailStamp=stamp;
  const prior=document.activeElement?.dataset?.node;
  const f=$('fiche');f.replaceChildren();
  const branch=graph.nodes.find(b=>b.id===n.department);
  f.append(make('p',(branch&&branch.id!==n.id?branch.name+' / ':'')+(types[n.type]||n.type),'eyebrow'),make('h1',n.name));
  const state=make('p',statuses[n.status]||n.status,'detail-status');state.dataset.status=n.status;f.append(state,make('p',n.description,'detail-description'));
  function section(title,text){const s=make('section');s.append(make('h2',title));if(text)s.append(make('p',text));f.append(s);return s;}
  const neighbors=graph.edges.filter(edge=>edge.source===n.id||edge.target===n.id).map(edge=>({edge,outgoing:edge.source===n.id,node:graph.nodes.find(candidate=>candidate.id===(edge.source===n.id?edge.target:edge.source))})).filter(link=>link.node);
  const parts=section('CONNEXIONS · '+neighbors.length,neighbors.length?null:'Les connexions documentées apparaîtront ici.');
  for(const {node:c,outgoing,edge} of neighbors){const b=make('button',null,'detail-link');b.append(make('span',c.name),make('small',(outgoing?'Vers':'Depuis')+' · '+(edge.type==='hierarchy'?'Rattachement':edge.type||'Lien')));b.dataset.node=c.id;b.onclick=()=>choose(c);parts.append(b);}
  section('MISE EN PLACE',n.implementation||'À documenter.');
  section('SOURCE',n.source==='api_reseau'?'Observation du système existant. Les passages sont historiques ; ils ne prouvent pas une exécution en cours.':'Organisation cible. Cette représentation ne crée ni agent ni permission.');
  const traces=n.traces||[];
  const history=section('DERNIERS PASSAGES',traces.length?null:'Aucune trace disponible pour cet élément.');
  for(const t of traces.slice(0,6)){const line=make('div',null,'run-line');line.append(make('span',t.agent||n.name),make('span',statuses[t.statut]||t.statut||'À vérifier'),make('time',Number.isFinite(Date.parse(t.fin_le))?new Date(t.fin_le).toLocaleString('fr-FR'):'Date inconnue'));history.append(line);}
  if(n.type!=='department'&&n.type!=='infrastructure')section('COÛT / TOKENS','Mesures par composant indisponibles.');
  dispatchEvent(new CustomEvent('carte:fiche',{detail:{noeud:n,fiche:f}}));
  f.append(make('p',stale?'Connexion interrompue : dernières observations conservées.':'Les chemins matérialisent les rattachements. Aucune circulation d’activité n’est simulée.','detail-note'));
  panel.hidden=false;requestAnimationFrame(()=>panel.classList.add('visible'));
  if(focus)$('fermer-inspecteur').focus({preventScroll:true});else if(prior)f.querySelector(`[data-node="${CSS.escape(prior)}"]`)?.focus({preventScroll:true});
}
function openDirectory(){directory.hidden=false;search();$('search-input').focus();}
function search(){
  if(directory.hidden)return;
  const q=$('search-input').value.trim().toLocaleLowerCase('fr');const results=$('search-results');results.replaceChildren();
  const ns=q?graph.nodes.filter(n=>(n.name+' '+n.description).toLocaleLowerCase('fr').includes(q)):graph.nodes.filter(n=>n.branch);
  for(const n of ns.slice(0,70)){const b=make('button');b.append(make('span',n.name),make('small',(types[n.type]||n.type)+' · '+(statuses[n.status]||n.status)));b.onclick=()=>choose(n);results.append(b);}
  if(!ns.length)results.append(make('p','Aucun élément trouvé.','vide'));
}
function buildLabels(){
  const root=$('spatial-labels');root.replaceChildren();labels.clear();
  for(const n of graph.nodes){
    const b=make('button',null,'spatial-label'+(n.depth===0?' root':n.depth>1?' child':''));
    const text=make('strong',n.name);if(n.depth!==0)b.append(make('i'));b.append(text);
    if(n.depth<=1)b.append(make('small',n.depth===0?'DIRECTEUR':n.type==='infrastructure'?'INFRASTRUCTURE':statuses[n.status]||n.status));
    if(pastilles.has(n.id))b.append(make('em',pastilles.get(n.id),'pastille'));
    b.dataset.status=n.status;b.dataset.node=n.id;b.hidden=true;b.onclick=()=>choose(n);
    root.append(b);labels.set(n.id,b);
  }
}
let labelTick=0;
function syncView(){
  const view=scene?.getViewState?.()||{},mode=view.mode||'perspective';
  for(const m of ['perspective','top','free']){const b=$('view-'+m);b.classList.toggle('selected',m===mode);b.setAttribute('aria-pressed',String(m===mode));}
  $('free-camera-guide').hidden=mode!=='free';$('scene').dataset.camera=mode;
  $('scene').dataset.exploded=String(view.explosion??1);$('scene').dataset.layoutMoving=String(!!view.exploding);$('scene').dataset.connections=String(view.connectionsVisible!==false);$('scene').dataset.scale=Number(view.distance)>40?'overview':'detail';
  $('company-map').setAttribute('aria-label',mode==='free'?'Caméra libre. Glisser pour regarder, ZQSD ou WASD et les flèches pour circuler, E pour monter, C pour descendre.':'Organisation en trois dimensions. Glisser pour tourner, Maj et glisser pour déplacer, molette pour avancer.');
}
function placeLabels(){
  if(!scene||!labels.size)return;labelTick++;
  syncView();
  const state=scene.getViewState?.()||{},picked=graph.nodes.find(n=>n.id===selected);
  const department=picked?.branch?picked.id:picked?.department;
  const occupied=['atlas-controls','echange','inspecteur','map-search','free-camera-guide'].map(id=>$(id)).filter(e=>!e.hidden&&getComputedStyle(e).display!=='none').map(e=>{const r=e.getBoundingClientRect();return{x:r.left,y:r.top,w:r.width,h:r.height,ui:true};});const width=$('map-zone').clientWidth,height=$('map-zone').clientHeight;
  const ns=[...graph.nodes].sort((a,b)=>(a.id===selected?-10:a.depth)-(b.id===selected?-10:b.depth));
  for(const n of ns){
    const e=labels.get(n.id);if(!e)continue;
    const p=scene.project(n.id);
    const nearby=state.mode==='free'&&Number.isFinite(p?.distance)&&p.distance<(n.depth>=3?10:20);
    const eligible=n.depth<=1||n.id===selected||n.id===hovered||nearby||(state.mode!=='free'&&n.department===department&&((state.distance<36&&n.depth<=2)||state.distance<20));
    if(!p?.visible||!eligible){e.hidden=true;continue;}
    const ew=e.offsetWidth||Math.min(220,n.name.length*6+22),eh=e.offsetHeight||(n.depth<=1?35:22);
    const x=p.x,y=p.y+(n.depth===0?44:n.depth===1?30:19);
    const box={x:x-ew/2,y:y-eh/2,w:ew,h:eh};
    const outside=box.x<6||box.x+ew>width-6||box.y<72||box.y+eh>height-100;
    const overlaps=a=>a.x<box.x+box.w&&a.x+a.w>box.x&&a.y<box.y+box.h&&a.y+a.h>box.y;
    const overlap=occupied.some(overlaps),uiOverlap=occupied.some(a=>a.ui&&overlaps(a));
    if(outside||uiOverlap||(overlap&&n.id!==selected)){e.hidden=true;continue;}
    occupied.push(box);e.hidden=false;e.style.left=x.toFixed(1)+'px';e.style.top=y.toFixed(1)+'px';e.style.opacity=department&&n.depth>0&&n.department!==department?'.42':'1';e.classList.toggle('selected',n.id===selected);
  }
}
function refresh(payload){
  graph=construireOntologie(payload);
  if(stale)graph.nodes=graph.nodes.map(n=>({...n,status:n.status==='PLANNED'?'PLANNED':'UNKNOWN'}));
  scene?.setGraph(graph);buildLabels();placeLabels();breadcrumb();search();counts();
  if(!panel.hidden)showDetails(graph.nodes.find(n=>n.id===selected)||graph.nodes[0]);
}
// Lue toutes les 15 s (chaque lecture interroge la base), en pause quand l'onglet est caché (note 20, 07/10/2026).
let minuterie=0,enCours=false;
async function poll(){
  clearTimeout(minuterie);minuterie=0;
  if(document.hidden||enCours)return;enCours=true;
  try{
    const r=await fetch('/api/reseau',{cache:'no-store',signal:AbortSignal.timeout(7000)});if(!r.ok)throw Error('http');const d=await r.json();
    if(!d||!Array.isArray(d.noeuds)||!Array.isArray(d.erreurs)||d.noeuds.some(n=>!n||typeof n.id!=='string'||!Array.isArray(n.modules)||!Array.isArray(n.traces)))throw Error('format');
    stale=false;lastPayload=d;refresh(d);
    const time=Number.isFinite(Date.parse(d.observe_le))?new Date(d.observe_le).toLocaleTimeString('fr-FR'):'date inconnue';
    $('synchro').textContent=(d.erreurs.length?'Observations partielles':'Observations connectées')+' · '+time;$('synchro').dataset.offline=String(!!d.erreurs.length);
  }catch{stale=true;$('synchro').textContent='Observations indisponibles · organisation cible visible';$('synchro').dataset.offline='true';refresh(lastPayload||{});}
  finally{enCours=false;if(!document.hidden)minuterie=setTimeout(poll,15000);}
}
function hover(node,p){
  hovered=node?.id||null;const tip=$('node-tooltip');tip.hidden=!node||!panel.hidden;
  if(!node)return;tip.replaceChildren(make('strong',node.name),make('span',statuses[node.status]||node.status),make('small',node.description));
  tip.style.left=Math.max(12,Math.min(p.x+18,innerWidth-250))+'px';tip.style.top=Math.max(80,Math.min(p.y+15,innerHeight-180))+'px';
}
function unavailable(reason){if(reason===null){$('webgl-error').hidden=true;return;}$('webgl-error').hidden=false;$('webgl-error-message').textContent=(typeof reason==='string'?reason:reason?.message)||'WebGL 2 est nécessaire. Active l’accélération graphique du navigateur, puis recharge la page. Le répertoire reste accessible.';}
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(minuterie);minuterie=0;}else poll();});
addEventListener('carte:pastilles',e=>{
  pastilles.clear();for(const [id,t] of Object.entries(e.detail||{}))if(t)pastilles.set(id,String(t));
  for(const [id,b] of labels){b.querySelector('.pastille')?.remove();if(pastilles.has(id))b.append(make('em',pastilles.get(id),'pastille'));}
  placeLabels();
});
$('map-home').onclick=whole;$('recentrer').onclick=whole;
$('agrandir').onclick=()=>scene?.zoom(1.2);$('reduire').onclick=()=>scene?.zoom(1/1.2);
$('open-search').onclick=()=>directory.hidden?openDirectory():directory.hidden=true;$('open-directory').onclick=openDirectory;
$('close-search').onclick=()=>directory.hidden=true;$('fallback-directory').onclick=openDirectory;$('search-input').oninput=search;
$('fermer-inspecteur').onclick=()=>{closePanel();$('company-map').focus({preventScroll:true});};
$('aide-navigation').onclick=()=>{$('navigation-help').hidden=!$('navigation-help').hidden;};
for(const mode of ['perspective','top','free'])$('view-'+mode).onclick=()=>{scene?.view(mode);syncView();if(mode==='free')$('company-map').focus({preventScroll:true});};
$('explode-range').oninput=()=>{const value=Number($('explode-range').value);$('explode-value').textContent=value+' %';scene?.setExplode(value/100);};
$('toggle-connections').onclick=()=>{const visible=$('toggle-connections').getAttribute('aria-pressed')!=='true';$('toggle-connections').setAttribute('aria-pressed',String(visible));$('toggle-connections').textContent=visible?'Connexions à la sélection':'Afficher les connexions';scene?.setConnectionsVisible(visible);};
$('view-walk').onclick=()=>{scene?.walk();syncView();$('company-map').focus({preventScroll:true});};
$('core-toggle').onclick=()=>coreOpen($('core-conversation').hidden,true);
$('core-locate').onclick=()=>choose(graph.nodes.find(n=>n.id==='jarvis'));
$('barre').addEventListener('submit',()=>coreOpen(true));
$('b-conversation').addEventListener('click',()=>coreOpen(true));
const responseObserver=new MutationObserver(()=>{if($('lui').textContent.trim())coreOpen(true);});responseObserver.observe($('lui'),{childList:true,characterData:true,subtree:true});
document.querySelectorAll('[data-tiroir]').forEach(b=>b.addEventListener('click',()=>{$('workspace-menu').open=false;closePanel();}));
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closePanel();coreOpen(false);directory.hidden=true;$('navigation-help').hidden=true;$('company-map').focus({preventScroll:true});}if((e.key==='+'||e.key==='=')&&document.activeElement===$('company-map'))scene?.zoom(1.2);if(e.key==='-'&&document.activeElement===$('company-map'))scene?.zoom(1/1.2);});
buildLabels();breadcrumb();counts();poll();dispatchEvent(new CustomEvent('carte:prete'));
// Sans WebGL 2, Three.js n'est même pas téléchargé : le répertoire, les tiroirs et Jarvis restent utilisables,
// avec le lien vers la version classique (#webgl-error).
const webgl2=(()=>{try{const gl=document.createElement('canvas').getContext('webgl2');gl?.getExtension('WEBGL_lose_context')?.loseContext();return !!gl;}catch{return false;}})();
try{
  if(!webgl2)throw Error('WebGL 2 indisponible');
  const {SceneOntologie}=await import('./ontologie-scene.js');
  scene=new SceneOntologie({canvas:$('company-map'),onSelect:choose,onHover:hover,onFrame:placeLabels,onMetrics:m=>{$('render-metrics').textContent=`${graph.branches.length} pôles · ${graph.nodes.length} éléments · ${Number(m.drawMs||0).toFixed(1)} ms de rendu`;},onError:unavailable});
  scene.setGraph(graph);scene.setExplode(Number($('explode-range').value)/100);scene.setConnectionsVisible($('toggle-connections').getAttribute('aria-pressed')==='true');new ResizeObserver(()=>{scene.resize();placeLabels();}).observe($('map-zone'));
}catch{unavailable();}
