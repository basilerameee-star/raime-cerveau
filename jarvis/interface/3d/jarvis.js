// JARVIS DANS LA 3D (07/10/2026, note 20 « Plan de l'interface 3D ») : le script de la page actuelle (jarvis/interface/index.html),
// porté fonction par fonction dans la carte de Codex. Écrire, dicter, conversation orale, voix et muet, sous-titres, historique,
// monétisation, À appeler, rappels, décisions, compteurs, pensée de la nuit, ce qui a bougé, pastilles Parole et Mains, tiroirs
// E-mails, Prospection, Vitrines et Capacités : mêmes routes, mêmes gestes. La sphère de particules vit dans le panneau Jarvis.
// application.js de Codex (antérieur au 06/10 : ordres, résumé des e-mails, Facebook dans l'objectif) n'est pas chargé ;
// relancer un ordre (code mort depuis le 06/10) n'est pas repris. La carte elle-même : ontologie-app.js et /api/reseau.
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var ecrire = { 'Content-Type': 'application/json', 'X-Jarvis': '1' };
  function avis(t) { var a = $('avis'); a.textContent = t; a.style.display = 'block'; clearTimeout(avis.m); avis.m = setTimeout(function () { a.style.display = 'none'; }, 5000); }
  function el(tag, cls, texte) { var e = document.createElement(tag); if (cls) e.className = cls; if (texte != null) e.textContent = texte; return e; }
  // Un tiroir, la scène ou un champ en cours de saisie : la barre d'espace ne leur est pas volée.
  function enSaisie() { var a = document.activeElement; return !!a && (/^(INPUT|TEXTAREA|SELECT|BUTTON|A|SUMMARY)$/.test(a.tagName) || a.isContentEditable); }

  // ── L'état : affiché au-dessus des sous-titres, dans le panneau Jarvis ─────────────────
  var etat = 'repos';
  var LIBELLES = { repos: 'en veille', ecoute: "j'écoute", reflexion: 'je réfléchis', parole: 'je parle', dictee: 'je transcris ta dictée' };
  function changer(e) { etat = e; document.body.dataset.etat = e === 'dictee' ? 'ecoute' : e; $('etat').textContent = LIBELLES[e] || e; }

  // ── La sphère (26/09/2026, voulue par Basile à la place du visage), gardée dans le panneau Jarvis de la 3D :
  //    des particules sur deux coques, dessinées par la carte graphique. Elle suit la voix : le volume gonfle la surface,
  //    les graves la font onduler, les aigus frissonner, la hauteur de la voix change sa couleur. Plus petite qu'avant,
  //    elle porte moins de particules ; elle ne se dessine que panneau ouvert et onglet visible (téléphone, batterie).
  var sphere = (function () {
    var c = $('sphere'), D = Math.min(window.devicePixelRatio || 1, 2), gl = null;
    try { gl = c.getContext('webgl', { antialias: false, alpha: true, premultipliedAlpha: false }); } catch (e) {}
    var x = gl ? null : c.getContext('2d');
    var N = innerWidth < 700 ? 2400 : 3600, P = new Float32Array(N * 4), or = Math.PI * (3 - Math.sqrt(5));
    for (var i = 0; i < N; i++) {                          // spirale de Fibonacci : une répartition régulière
      var coque = i % 7 === 0 ? .62 : 1, y = 1 - 2 * (i + .5) / N, r = Math.sqrt(1 - y * y), a = i * or;
      P[i * 4] = Math.cos(a) * r * coque; P[i * 4 + 1] = y * coque; P[i * 4 + 2] = Math.sin(a) * r * coque; P[i * 4 + 3] = Math.random();
    }
    var ETATS = { repos: { v: .12, s: .15 }, ecoute: { v: .2, s: .5 }, dictee: { v: .2, s: .5 }, reflexion: { v: .9, s: .35 }, parole: { v: .25, s: .75 } };
    var W = 1, H = 1, t0 = performance.now(), calme = matchMedia('(prefers-reduced-motion: reduce)').matches;
    var source = null, spectre = null, bandes = { niveau: 0, bas: 0, milieu: 0, haut: 0, hauteur: .35 }, pouls = 0;
    var souris = { x: 0, y: 0 }, suivi = { x: 0, y: 0 }, lacet = 0, tourne = false;
    addEventListener('pointermove', function (e) { souris.x = e.clientX / innerWidth * 2 - 1; souris.y = e.clientY / innerHeight * 2 - 1; });
    addEventListener('deviceorientation', function (e) { if (e.gamma != null) { souris.x = Math.max(-1, Math.min(1, e.gamma / 35)); souris.y = Math.max(-1, Math.min(1, (e.beta - 40) / 35)); } });
    function taille() { var b = c.getBoundingClientRect(); W = Math.max(1, b.width); H = Math.max(1, b.height); c.width = W * D; c.height = H * D; if (x) x.setTransform(D, 0, 0, D, 0, 0); if (gl) gl.viewport(0, 0, c.width, c.height); }
    // La voix, lue à chaque image : volume, trois bandes de fréquences, et la hauteur (centre de gravité du spectre).
    function ecouterVoix() {
      var cible = { niveau: 0, bas: 0, milieu: 0, haut: 0, hauteur: bandes.hauteur };
      if (source) {
        if (!spectre || spectre.length !== source.frequencyBinCount) spectre = new Uint8Array(source.frequencyBinCount);
        source.getByteFrequencyData(spectre);
        var n = spectre.length, b = 0, m = 0, h = 0, somme = 0, pond = 0;
        for (var k = 1; k < n; k++) {
          var v = spectre[k] / 255, f = k / n;
          if (f < .06) b += v; else if (f < .25) m += v; else if (f < .6) h += v;
          somme += v; pond += v * f;
        }
        cible.bas = Math.min(1, b / (n * .06) * 1.6); cible.milieu = Math.min(1, m / (n * .19) * 2); cible.haut = Math.min(1, h / (n * .35) * 3);
        cible.niveau = Math.min(1, (cible.bas + cible.milieu + cible.haut) / 1.6);
        if (somme > 1) cible.hauteur = Math.min(1, pond / somme * 4);
      }
      cible.niveau = Math.max(cible.niveau, pouls); cible.milieu = Math.max(cible.milieu, pouls * .8);
      for (var cle in cible) bandes[cle] += (cible[cle] - bandes[cle]) * (cible[cle] > bandes[cle] ? .35 : .08);   // monte vite, retombe en douceur
      pouls *= .9;
    }
    var prog = null, U = {};
    if (gl) {
      var VS = 'attribute vec4 aP;uniform float uT,uNiv,uBas,uMil,uHaut,uHaut2,uYaw,uPitch,uR,uD,uVit;uniform vec2 uRes;varying vec4 vCol;'
        + 'void main(){vec3 p=aP.xyz;float coque=length(p);vec3 n=p/coque;float t=uT*uVit;'
        // trois ondes : lente (graves), moyenne (voix), fine (aigus) ; plus la respiration de repos
        + 'float o1=sin(n.x*2.1+t*1.1)*sin(n.y*2.7-t*.9)*sin(n.z*1.9+t*.7);'
        + 'float o2=sin(n.x*5.3-t*2.3+aP.w)*sin(n.y*4.7+t*1.9)*cos(n.z*5.1+t*1.3);'
        + 'float o3=sin(dot(n,vec3(13.1,11.7,12.3))+t*7.+aP.w*6.28);'
        + 'float d=.03*sin(uT*.8+aP.w)+uBas*.22*o1+uMil*.14*o2+uHaut*.05*o3+uNiv*.08;'
        + 'vec3 q=n*coque*(1.+d);'
        + 'float cy=cos(uYaw*(coque<.8?1.6:1.)),sy=sin(uYaw*(coque<.8?1.6:1.)),cp=cos(uPitch),sp=sin(uPitch);'
        + 'float X=q.x*cy-q.z*sy,Z=q.x*sy+q.z*cy,Y=q.y*cp-Z*sp;Z=q.y*sp+Z*cp;'
        + 'float k=3./(3.+Z);vec2 s=uRes*.5+vec2(X,-Y)*uR*k;gl_Position=vec4(s.x/uRes.x*2.-1.,1.-s.y/uRes.y*2.,0.,1.);'
        + 'float face=clamp(.55-Z*.5,0.,1.);float bord=pow(1.-abs(dot(n,vec3(0.,0.,1.))),2.);'
        // couleur : bleu de la carte au repos, vers le blanc quand la voix monte, vers le magenta pour une voix aiguë
        + 'vec3 base=mix(vec3(.45,.68,1.),vec3(.88,.94,1.),clamp(d*4.,0.,1.));base=mix(base,vec3(1.,.45,.85),uHaut2*.55*clamp(o3*.5+.5,0.,1.));'
        + 'float a=(.18+.75*face+.4*bord)*(coque<.8?.45:1.)*(.85+uNiv*.6);'
        + 'vCol=vec4(base,min(1.,a));gl_PointSize=(1.+1.9*face+uNiv*1.2)*k*uD;}';
      var FS = 'precision mediump float;varying vec4 vCol;void main(){vec2 d=gl_PointCoord-.5;float r=dot(d,d)*4.;if(r>1.)discard;gl_FragColor=vec4(vCol.rgb*vCol.a*exp(-r*2.4),1.);}';
      var nuanceur = function (type, src) { var sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); return sh; };
      try {
        prog = gl.createProgram(); gl.attachShader(prog, nuanceur(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, nuanceur(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
        gl.useProgram(prog);
        var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, P, gl.STATIC_DRAW);
        var l = gl.getAttribLocation(prog, 'aP'); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 4, gl.FLOAT, false, 0, 0);
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.clearColor(0, 0, 0, 0);
      } catch (e) { console.warn('WebGL indisponible pour la sphère, dessin 2D :', e.message); gl = null; x = c.getContext('2d'); }
    }
    function u(nom) { return U[nom] || (U[nom] = gl.getUniformLocation(prog, nom)); }
    if (window.ResizeObserver) new ResizeObserver(taille).observe(c); else addEventListener('resize', taille);
    taille();
    var avant = performance.now();
    function visible() { return !document.hidden && !$('core-conversation').hidden; }
    function image(now) {
      if (!visible()) { tourne = false; return; }
      var t = (now - t0) / 1000, dt = Math.min(.05, (now - avant) / 1000); avant = now;
      ecouterVoix();
      var e = ETATS[etat] || ETATS.repos;
      suivi.x += (souris.x - suivi.x) * .06; suivi.y += (souris.y - suivi.y) * .06;
      lacet += dt * (calme ? 0 : e.v * .6 + bandes.niveau * .8);
      var yaw = lacet + suivi.x * .9, pitch = .15 + suivi.y * .55, R = Math.min(W, H) * .34 * (1 + bandes.bas * .06);
      if (gl) {
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform1f(u('uT'), t); gl.uniform1f(u('uVit'), calme ? .2 : 1 + e.s); gl.uniform1f(u('uNiv'), bandes.niveau);
        gl.uniform1f(u('uBas'), bandes.bas + (etat === 'reflexion' ? .35 : 0)); gl.uniform1f(u('uMil'), bandes.milieu); gl.uniform1f(u('uHaut'), bandes.haut);
        gl.uniform1f(u('uHaut2'), bandes.hauteur); gl.uniform1f(u('uYaw'), yaw); gl.uniform1f(u('uPitch'), pitch);
        gl.uniform1f(u('uR'), R); gl.uniform1f(u('uD'), D); gl.uniform2f(u('uRes'), W, H);
        gl.drawArrays(gl.POINTS, 0, N);
      } else if (x) {
        x.clearRect(0, 0, W, H); x.globalCompositeOperation = 'lighter'; x.fillStyle = 'rgba(143,184,255,.55)';
        var cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
        for (var i = 0; i < N; i += 3) {
          var px = P[i * 4], py = P[i * 4 + 1], pz = P[i * 4 + 2], d = 1 + bandes.niveau * .12 * Math.sin(py * 6 + t * 3);
          var X = (px * cy - pz * sy) * d, Z = (px * sy + pz * cy) * d, Y = py * d * cp - Z * sp; Z = py * d * sp + Z * cp;
          var k = 3 / (3 + Z); x.fillRect(W / 2 + X * R * k, H / 2 - Y * R * k, 1.3 * k, 1.3 * k);
        }
        x.globalCompositeOperation = 'source-over';
      }
      requestAnimationFrame(image);
    }
    // La boucle repart quand le panneau s'ouvre ou que l'onglet revient.
    function reveiller() { if (tourne || !visible()) return; tourne = true; taille(); avant = performance.now(); requestAnimationFrame(image); }
    new MutationObserver(reveiller).observe($('core-conversation'), { attributes: true, attributeFilter: ['hidden'] });
    document.addEventListener('visibilitychange', reveiller);
    reveiller();
    return { ecouter: function (an) { source = an; }, pousser: function (v) { pouls = Math.min(1, pouls + v); } };
  })();

  // ── Le tableau : /api/etat lu toutes les 10 secondes, en pause quand l'onglet est caché (note 20). Une exception :
  //    si les notifications sont permises, une lecture par minute continue, pour qu'un rappel arrive à son échéance
  //    même onglet en arrière-plan, comme avec la page actuelle (/api/etat annonce les rappels échus une seule fois).
  var echecs = 0, dernier = null, ficheOuverte = null, minuterie = 0, enCours = false;
  function notifications() { try { return !!window.Notification && Notification.permission === 'granted'; } catch (e) { return false; } }
  function remplir(d) {
    dernier = d;
    $('version').textContent = 'v ' + d.version;
    var mains = $('p-mains'), me = d.mains && d.mains.etat;
    mains.className = 'puce ' + (me === 'libre' ? 'ok' : me === 'occupe' ? 'occupe' : 'ko');
    mains.querySelector('span').textContent = 'MAINS · ' + (me === 'libre' ? 'PRÊTES' : me === 'occupe' ? 'AU TRAVAIL' : 'HORS LIGNE');
    mains.title = d.mains && d.mains.raison || 'Hermes, les mains';
    voixGemini = d.voix === 'gemini';
    var pa = $('p-parole'); pa.className = 'puce large ok'; pa.title = 'Parole : ' + d.parole; pa.querySelector('span').textContent = 'PAROLE · SANS FRAIS';
    // objectif
    var o = d.objectif || { mois: 0, objectif: 2000 }, pct = Math.min(100, Math.round(100 * o.mois / o.objectif));
    $('arc').setAttribute('stroke-dasharray', (2.64 * pct).toFixed(1) + ' 264');
    $('o-pct').textContent = pct + ' %'; $('o-mois').textContent = o.mois.toLocaleString('fr-FR') + ' €';
    $('o-detail').textContent = detailPlateformes(o);
    $('o-reste').textContent = o.mois >= o.objectif ? 'Objectif atteint.' : 'Encore ' + (o.objectif - o.mois).toLocaleString('fr-FR') + ' € pour les ' + o.objectif.toLocaleString('fr-FR') + ' €.';
    // à appeler : commerçants et prospects contactés par e-mail, sans réponse depuis 7 jours (jarvis/appels.cjs)
    var ap = d.appels || { a_faire: 0, prochains: [] }, boxa = $('appels');
    $('a-n').textContent = ap.a_faire ? ap.a_faire + ' à appeler' : '';
    $('n-appels').textContent = ap.a_faire ? '· ' + ap.a_faire : '';
    $('j-appels').textContent = ap.a_faire || 0;
    if (ap.prochains && ap.prochains.length) {
      boxa.textContent = '';
      ap.prochains.forEach(function (x) {
        var d2 = el('div', 'ordre'), tete = el('div', 'tete');
        tete.appendChild(el('span', 'num', x.nom || '?'));
        if (x.repondu) tete.appendChild(el('span', 'etiq fait', 'a répondu'));
        d2.appendChild(tete);
        d2.appendChild(el('p', 'rep', (x.raison || (x.envoye_le ? 'E-mail envoyé il y a ' + x.jours + ' jours · pas de retour' : 'pas de retour'))
          + (x.ville ? ' · ' + x.ville : '') + (x.segment ? ' · ' + x.segment : '')));
        var act = el('div', 'actions');
        if (x.telephone) { var tel = el('a', '', '☎ ' + x.telephone); tel.href = 'tel:' + String(x.telephone).replace(/[^0-9+]/g, ''); act.appendChild(tel); }
        [['appele', '✓ appelé'], ['plus_tard', '↻ plus tard'], ['pas_interesse', '✕ pas intéressé']].forEach(function (e) {
          var b = el('button', 'lien', e[1]); b.type = 'button';
          b.onclick = function () { fetch('/api/appels/' + x.siren, { method: 'POST', headers: ecrire, body: JSON.stringify({ etat: e[0] }) }).then(function () { d2.remove(); }); };
          act.appendChild(b);
        });
        d2.appendChild(act);
        boxa.appendChild(d2);
      });
    } else boxa.innerHTML = '<p class="vide">Personne à relancer pour l’instant.</p>';
    // Une pastille sur les pièces Growth et Sales de la carte (ontologie-app.js) tant qu'il reste des appels.
    pastilles();
    // rappels : ceux qui arrivent à échéance sont dits à voix haute et affichés
    var rp = d.rappels || { echus: [], a_venir: [] };
    $('bloc-rappels').hidden = !rp.a_venir.length;
    liste($('rappels'), rp.a_venir.map(function (r) { return [new Date(r.echeance).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }), null, r.texte]; }), '');
    rp.echus.forEach(function (r) {
      $('lui').textContent = '⏰ ' + r.texte; avis('⏰ ' + r.texte);
      try { if (window.Notification && Notification.permission === 'granted') new Notification('Jarvis', { body: r.texte }); } catch (e) {}
      if (!parleEnCours) parler('Rappel : ' + r.texte);
    });
    // e-mails : le compteur du menu (le tiroir garde la liste)
    var cm = d.courriels || {};
    $('n-courriels').textContent = cm.non_vus ? '· ' + cm.non_vus : '';
    // cerveau : le tiroir Données et les compteurs du panneau Jarvis
    var c = d.compteurs || {};
    $('c-agents').textContent = c.agents; $('c-biblio').textContent = (c.bibliotheque || 0).toLocaleString('fr-FR');
    $('c-veille').textContent = c.veille; $('c-brouillons').textContent = c.brouillons;
    $('j-agents').textContent = c.agents; $('j-brouillons').textContent = c.brouillons;
    $('n-brouillons').textContent = c.brouillons ? '· ' + c.brouillons : '';
    var ve = d.vitrines_envoi || {};
    $('n-vitrines').textContent = ve.a_valider ? '· ' + ve.a_valider : '';
    liste($('pensee'), (d.pensee || []).map(function (p) { return [null, p.titre, p.proposition]; }), 'Pas encore de pensée.');
    // L'initiative du cerveau : une idée de la nuit se confie à Hermes d'un geste (Basile garde la main).
    Array.prototype.forEach.call($('pensee').children, function (li, i) {
      var p = (d.pensee || [])[i]; if (!p) return;
      var b = el('button', 'lien', '→ confier à Hermes'); b.type = 'button'; b.style.cssText = 'display:block;padding:4px 0 0';
      b.onclick = function () { demander('Fais ceci : ' + p.titre + ' — ' + p.proposition, false); };
      li.appendChild(b);
    });
    liste($('journal'), (d.journal || []).slice(0, 8).map(function (j) { return [j.heure, j.qui, j.quoi]; }), 'Rien de neuf.');
    $('bloc-questions').hidden = !(d.questions && d.questions.length);
    liste($('questions'), (d.questions || []).map(function (q) { return [null, null, q]; }), '');
    $('j-questions').textContent = (d.questions || []).length;
    if (ficheOuverte && ficheOuverte.isConnected) completerFiche(ficheOuverte, ficheOuverte.dataset.noeud);
  }
  function detailPlateformes(o) {
    return (o.plateformes || []).map(function (p) { return ({ tiktok: 'TikTok', youtube: 'YouTube', instagram: 'Instagram' }[p.plateforme] || p.plateforme) + ' ' + p.montant.toLocaleString('fr-FR') + ' / ' + (p.objectif || 2000).toLocaleString('fr-FR') + ' €'; }).join(' · ');
  }
  function liste(ul, lignes, vide) {
    ul.textContent = '';
    if (!lignes.length) { if (vide) ul.appendChild(el('li', 'vide', vide)); return; }
    lignes.forEach(function (l) { var li = el('li'); if (l[0]) li.appendChild(el('em', '', l[0])); if (l[1]) { li.appendChild(el('strong', '', l[1])); li.appendChild(document.createTextNode(l[2] ? ' — ' : '')); } li.appendChild(document.createTextNode(l[2] || '')); ul.appendChild(li); });
  }
  function charger() {
    clearTimeout(minuterie); minuterie = 0;
    if (enCours || (document.hidden && !notifications())) return;
    enCours = true;
    fetch('/api/etat', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (d) { echecs = 0; remplir(d); })
      .catch(function () { if (++echecs === 3) avis('Le serveur ne répond pas pour l’instant : je réessaie tout seul.'); })
      .then(function () {
        enCours = false;
        if (!document.hidden) minuterie = setTimeout(charger, 10000);
        else if (notifications()) minuterie = setTimeout(charger, 60000);
      });
  }
  charger();
  document.addEventListener('visibilitychange', function () { if (!document.hidden) charger(); });
  document.addEventListener('click', function premier() { try { if (window.Notification && Notification.permission === 'default') Notification.requestPermission(); } catch (e) {} document.removeEventListener('click', premier); });
  function heure() { $('p-heure').textContent = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }
  heure(); setInterval(function () { if (!document.hidden) heure(); }, 5000);

  $('o-ajouter').onclick = function () { $('f-encaisse').classList.toggle('ouvert'); };
  $('f-encaisse').onsubmit = function (e) {
    e.preventDefault(); var f = e.target;
    fetch('/api/revenus', { method: 'POST', headers: ecrire, body: JSON.stringify({ montant: f.montant.value, source: f.source.value, plateforme: f.plateforme.value }) })
      .then(function (r) { return r.json(); }).then(function (d) { if (!d.ok) return avis(d.erreur || 'Refusé.'); f.reset(); f.classList.remove('ouvert'); charger(); });
  };

  // ── La carte : pastilles des pièces et fiches complétées (ontologie-app.js envoie « carte:prete » et « carte:fiche ») ──
  function pastilles() {
    var n = dernier && dernier.appels ? dernier.appels.a_faire : 0;
    dispatchEvent(new CustomEvent('carte:pastilles', { detail: n ? { croissance: n + ' à appeler', admin: n + ' à appeler' } : {} }));
  }
  addEventListener('carte:prete', function () { if (dernier) pastilles(); });
  addEventListener('carte:fiche', function (e) {
    var s = el('section', 'fiche-jarvis'); s.dataset.noeud = e.detail.noeud.id;
    if (completerFiche(s, s.dataset.noeud)) { e.detail.fiche.appendChild(s); ficheOuverte = s; }
  });
  function boutonFiche(texte, faire) { var b = el('button', 'detail-link', texte); b.type = 'button'; b.onclick = faire; return b; }
  // Ce que Jarvis sait d'un élément : la monétisation (Finance), les appels (Growth, Sales), les brouillons (Prospection),
  // les mains d'Hermes (Exécution). Rien pour les autres ; tant que /api/etat n'a pas répondu, la fiche le dit.
  function completerFiche(s, id) {
    var titres = { finance: 'MONÉTISATION', croissance: 'À APPELER', admin: 'À APPELER', prospection: 'BROUILLONS À VALIDER',
      execution: 'MAINS · HERMES', 'module:execution:hermes': 'MAINS · HERMES' };
    if (!titres[id]) return false;
    s.textContent = ''; s.appendChild(el('h2', '', titres[id]));
    var d = dernier;
    if (!d) { s.appendChild(el('p', '', 'Lecture de l’état en cours.')); return true; }
    if (id === 'finance') {
      var o = d.objectif || { mois: 0, objectif: 2000 };
      s.appendChild(el('p', '', o.mois.toLocaleString('fr-FR') + ' € ce mois sur ' + o.objectif.toLocaleString('fr-FR') + ' €.' + (detailPlateformes(o) ? ' ' + detailPlateformes(o) + '.' : '')));
      s.appendChild(boutonFiche('Ouvrir l’activité (+ Revenu)', function () { ouvrir('t-activite'); }));
    } else if (id === 'croissance' || id === 'admin') {
      var n = d.appels ? d.appels.a_faire : 0;
      s.appendChild(el('p', '', n ? n + ' commerçant(s) ou prospect(s) à appeler.' : 'Personne à relancer pour l’instant.'));
      s.appendChild(boutonFiche('Ouvrir la liste À appeler', function () { ouvrir('t-activite'); }));
    } else if (id === 'prospection') {
      var c = d.compteurs || {};
      s.appendChild(el('p', '', (c.brouillons || 0) + ' brouillon(s) à valider · ' + (c.envoyes || 0) + ' envoyé(s) en 7 jours.'));
      s.appendChild(boutonFiche('Ouvrir les brouillons', function () { ouvrir('t-prospection'); }));
      var a = el('a', 'detail-link', 'Page Prospection ↗'); a.href = '/prospection'; s.appendChild(a);
    } else {
      var me = d.mains && d.mains.etat;
      s.appendChild(el('p', '', (me === 'libre' ? 'Prêtes.' : me === 'occupe' ? 'Au travail.' : 'Hors ligne.') + (d.mains && d.mains.raison ? ' ' + d.mains.raison : '')));
    }
    return true;
  }

  // ── Les tiroirs ────────────────────────────────────────────────────────────────────
  document.querySelectorAll('[data-tiroir]').forEach(function (b) { b.addEventListener('click', function () { ouvrir(b.dataset.tiroir); }); });
  document.querySelectorAll('.tiroir .fermer').forEach(function (b) { b.onclick = function () { b.closest('.tiroir').classList.remove('ouvert'); }; });
  function fermerTiroirs() { document.querySelectorAll('.tiroir.ouvert').forEach(function (t) { t.classList.remove('ouvert'); }); }
  $('map-home').addEventListener('click', fermerTiroirs);
  function ouvrir(id) {
    document.querySelectorAll('.tiroir.ouvert').forEach(function (t) { if (t.id !== id) t.classList.remove('ouvert'); });
    $(id).classList.add('ouvert');
    if (id === 't-conversation') fetch('/api/conversation').then(function (r) { return r.json(); }).then(function (d) {
      var h = $('historique'); h.textContent = '';
      (d.messages || []).forEach(function (m) { h.appendChild(el('div', 'bulle ' + (m.role === 'user' ? 'user' : 'assistant'), m.content)); });
      h.scrollTop = h.scrollHeight;
    });
    if (id === 't-prospection') brouillons();
    if (id === 't-vitrines') vitrines();
    if (id === 't-courriels') courriels();
    if (id === 't-capacites') capacites();
  }
  $('c-relever').onclick = function () {
    var b = this; b.disabled = true; b.textContent = '… relevé en cours';
    fetch('/api/courriels/relever', { method: 'POST', headers: ecrire }).then(function (r) { return r.json(); })
      .then(function (d) { if (d.etat && d.etat !== 'ok') avis('Boîte : ' + d.etat); courriels(); charger(); })
      .catch(function () { avis('Relevé impossible pour l’instant.'); })
      .then(function () { b.disabled = false; b.textContent = '↻ Relever maintenant'; });
  };
  function courriels() {
    fetch('/api/courriels').then(function (r) { return r.json(); }).then(function (d) {
      var box = $('courriels'); box.textContent = '';
      if (!(d.courriels || []).length) { box.appendChild(el('p', 'vide', 'Aucun e-mail trié pour l’instant.')); return; }
      d.courriels.forEach(function (m) {
        var x = el('div', 'mail' + (m.vu ? ' vu' : '')), meta = el('div', 'meta');
        meta.appendChild(el('span', 'cat' + (m.importance === 3 ? ' i3' : ''), m.categorie));
        meta.appendChild(el('span', '', (m.de || '').replace(/<.*>/, '').trim() || m.de));
        meta.appendChild(el('span', '', new Date(m.recu_le).toLocaleString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })));
        x.appendChild(meta); x.appendChild(el('p', '', m.sujet));
        x.appendChild(el('p', 'rep', m.resume + (m.action ? ' → ' + m.action : '')));
        if (!m.vu) { var v = el('button', 'lien', '✓ vu'); v.type = 'button'; v.style.cssText = 'padding:4px 0';
          v.onclick = function () { fetch('/api/courriels/' + m.id + '/vu', { method: 'POST', headers: ecrire }).then(function () { courriels(); charger(); }); }; x.appendChild(v); }
        box.appendChild(x);
      });
    });
  }
  function capacites() {
    fetch('/api/capacites').then(function (r) { return r.json(); }).then(function (d) {
      var box = $('capacites'); box.textContent = ''; box.className = 'corps capa';
      var lib = { en_place: 'EN PLACE', a_brancher: 'À BRANCHER', a_faire: 'À FAIRE', interdit: 'INTERDIT' };
      (d.domaines || []).forEach(function (dom) {
        box.appendChild(el('h3', '', dom.nom)); var ul = el('ul');
        dom.capacites.forEach(function (x) {
          var li = el('li'); li.appendChild(document.createTextNode(x.nom)); li.appendChild(el('span', 'etat-capa ' + x.etat, lib[x.etat] || x.etat));
          if (x.detail) li.appendChild(el('small', '', x.detail)); if (x.il_faut) li.appendChild(el('small', '', 'Il faut : ' + x.il_faut));
          ul.appendChild(li);
        });
        box.appendChild(ul);
      });
    });
  }
  function brouillons() {
    fetch('/api/prospection').then(function (r) { return r.json(); }).then(function (d) {
      var b = $('brouillons'); b.textContent = '';
      if (!(d.brouillons || []).length) { b.appendChild(el('p', 'vide', 'Aucun brouillon à valider.')); return; }
      d.brouillons.forEach(function (x) {
        var c = el('div', 'brouillon');
        c.appendChild(el('h3', '', x.prospect_name || 'Prospect')); c.appendChild(el('div', 'meta', (x.segment || '') + ' · ' + (x.to_email || '')));
        c.appendChild(el('p', '', x.subject || '')); c.appendChild(el('pre', '', x.body || ''));
        var a = el('div', 'actions'), ok = el('button', 'bouton', '✓ Valider'), non = el('button', 'bouton', '✗ Refuser');
        ok.onclick = function () { decider(x.id, 'valide'); }; non.onclick = function () { decider(x.id, 'refuse'); };
        a.appendChild(ok); a.appendChild(non); c.appendChild(a); b.appendChild(c);
      });
    });
  }
  // Les vitrines : le mode d'envoi (pause, essai vers ta boîte, réel vers les commerçants) et les brouillons à valider.
  var MODES = { pause: 'Pause', test: 'Essai (vers ta boîte)', live: 'Réel' };
  function vitrines() {
    fetch('/api/vitrines/envoi').then(function (r) { return r.json(); }).then(function (e) {
      var box = $('envoi-vitrines'); box.textContent = '';
      if (e.mode === 'absent') { box.appendChild(el('p', 'vide', 'Le canal d’envoi n’est pas encore en place.')); return; }
      box.appendChild(el('b', '', 'Envoi des e-mails'));
      var m = el('div', 'modes');
      Object.keys(MODES).forEach(function (k) {
        var b = el('button', 'bouton' + (e.mode === k ? ' actif' : ''), MODES[k]); b.type = 'button';
        b.onclick = function () {
          if (k === 'live' && !confirm('Les e-mails validés partiront vers les commerçants, ' + e.plafond_jour + ' par jour au plus, en semaine à 9 h. Confirmer ?')) return;
          fetch('/api/vitrines/envoi', { method: 'POST', headers: ecrire, body: JSON.stringify({ mode: k }) }).then(function () { vitrines(); charger(); });
        };
        m.appendChild(b);
      });
      box.appendChild(m);
      box.appendChild(el('small', '', e.en_file + ' en file · ' + e.envoyes_aujourdhui + ' parti(s) aujourd’hui · ' + e.envoyes + ' en tout · ' + e.essais + ' essai(s)'
        + (e.refuses ? ' · ' + e.refuses + ' refusé(s)' : '')));
    });
    reponsesVitrines();
    fetch('/api/vitrines?statut=brouillon').then(function (r) { return r.json(); }).then(function (d) {
      var b = $('vitrines'); b.textContent = '';
      if ((d.vitrines || []).length) b.appendChild(el('h3', '', 'Brouillons à valider'));
      if (!(d.vitrines || []).length) { b.appendChild(el('p', 'vide', 'Aucun brouillon à valider.')); return; }
      d.vitrines.forEach(function (x) {
        var c = el('div', 'brouillon');
        c.appendChild(el('h3', '', x.nom || 'Commerce'));
        c.appendChild(el('div', 'meta', [x.metier, x.ville, x.email, x.telephone].filter(Boolean).join(' · ')));
        if (x.brouillon) { c.appendChild(el('p', '', x.brouillon.sujet)); c.appendChild(el('pre', '', x.brouillon.corps)); }
        var a = el('div', 'actions');
        if (x.maquette) { var l = el('a', 'bouton', 'Voir la maquette'); l.href = x.maquette; l.target = '_blank'; l.rel = 'noopener'; a.appendChild(l); }
        var ok = el('button', 'bouton', '✓ Valider'), non = el('button', 'bouton', '✗ Écarter');
        ok.onclick = function () { agirVitrine(x.id, 'valider'); }; non.onclick = function () { agirVitrine(x.id, 'ecarter'); };
        a.appendChild(ok); a.appendChild(non); c.appendChild(a); b.appendChild(c);
      });
    });
  }
  // Ceux qui ont répondu : à appeler d'abord ; leur maquette premium (Hermes) se regarde puis se publie d'un clic.
  function reponsesVitrines() {
    fetch('/api/vitrines?statut=repondu').then(function (r) { return r.json(); }).then(function (d) {
      var b = $('vitrines-reponses'); b.textContent = '';
      if (!(d.vitrines || []).length) return;
      b.appendChild(el('h3', '', 'Ont répondu : à appeler'));
      d.vitrines.forEach(function (x) {
        var c = el('div', 'brouillon');
        c.appendChild(el('h3', '', x.nom || 'Commerce'));
        c.appendChild(el('div', 'meta', [x.metier, x.ville, x.telephone].filter(Boolean).join(' · ')));
        if (x.motif) c.appendChild(el('p', '', x.motif));
        var a = el('div', 'actions'), p = x.premium;
        var lien = function (texte, href) { var l = el('a', 'bouton', texte); l.href = href; l.target = '_blank'; l.rel = 'noopener'; return l; };
        if (x.maquette) a.appendChild(lien('Maquette en ligne', x.maquette));
        if (!p) a.appendChild(el('span', 'meta', 'Maquette premium : pas commandée'));
        else if (!p.prete) a.appendChild(el('span', 'meta', 'Maquette premium : en préparation par Hermes'));
        else {
          a.appendChild(lien('Voir la premium', p.apercu));
          var pub = el('button', 'bouton', p.publiee_le ? 'Rétablir la simple' : 'Publier la premium');
          pub.onclick = function () { agirVitrine(x.id, p.publiee_le ? 'retablir_simple' : 'publier_premium'); };
          a.appendChild(pub);
        }
        if (x.paiement) { var pay = el('button', 'bouton', 'Copier le lien de paiement (500 €)'); pay.onclick = function () { navigator.clipboard.writeText(x.paiement); pay.textContent = 'Lien copié'; }; a.appendChild(pay); }
        var oui = el('button', 'bouton', '✓ Client'), non = el('button', 'bouton', '✗ Pas intéressé');
        oui.onclick = function () { agirVitrine(x.id, 'client'); }; non.onclick = function () { agirVitrine(x.id, 'pas_interesse'); };
        a.appendChild(oui); a.appendChild(non); c.appendChild(a); b.appendChild(c);
      });
    });
  }
  function agirVitrine(id, action) {
    fetch('/api/vitrines/' + id, { method: 'POST', headers: ecrire, body: JSON.stringify({ action: action }) }).then(function () { vitrines(); charger(); });
  }
  function decider(id, action) {
    fetch('/api/prospection/' + id, { method: 'POST', headers: ecrire, body: JSON.stringify({ action: action }) }).then(function () { brouillons(); charger(); });
  }

  // ── La voix de Jarvis ────────────────────────────────────────────────────────────────
  // D'abord la plus naturelle des voix françaises du navigateur (Edge « Natural », Chrome « Google »…),
  // sinon la voix du serveur (Piper), sinon le texte seul.
  var voixGemini = false, muet = false, son = new Audio(), ctxA = null, anaVoix = null, anaMic = null, voixNav = null;
  function choisirVoix() {
    if (!('speechSynthesis' in window)) return;
    var fr = speechSynthesis.getVoices().filter(function (v) { return /^fr(-|_|$)/i.test(v.lang); });
    var note = function (v) { return (/natural|neural|online/i.test(v.name) ? 8 : 0) + (/google/i.test(v.name) ? 5 : 0) + (/premium|enhanced|amélioré/i.test(v.name) ? 6 : 0) + (/fr-FR/i.test(v.lang) ? 2 : 0) + (/denise|henri|vivienne|remy|amélie|thomas/i.test(v.name) ? 1 : 0); };
    fr.sort(function (a, b) { return note(b) - note(a); });
    voixNav = fr[0] && note(fr[0]) >= 5 ? fr[0] : null;
  }
  if ('speechSynthesis' in window) { choisirVoix(); speechSynthesis.onvoiceschanged = choisirVoix; }
  function audio() {
    if (!ctxA) {
      ctxA = new (window.AudioContext || window.webkitAudioContext)();
      var s = ctxA.createMediaElementSource(son); anaVoix = ctxA.createAnalyser(); anaVoix.fftSize = 1024; s.connect(anaVoix); anaVoix.connect(ctxA.destination);
    }
    if (ctxA.state === 'suspended') ctxA.resume();
  }
  function pourLaVoix(t) {
    return String(t).replace(/https?:\/\/\S+/g, '').replace(/\[[^\]]*\]/g, '').replace(/[*_#>`|]/g, '')
      .replace(/\s*\n+\s*/g, '. ').replace(/\.\s*\./g, '.').replace(/\s{2,}/g, ' ').trim().slice(0, 1600);
  }
  var parleEnCours = false;
  function taire() { parleEnCours = false; try { son.pause(); } catch (e) {} if ('speechSynthesis' in window) speechSynthesis.cancel(); }
  function parler(texte, suite) {
    var t = pourLaVoix(texte), fini = function () { if (!parleEnCours) return; parleEnCours = false; sphere.ecouter(null); suite && suite(); };
    if (!t || muet) { if (suite) suite(); return; }
    parleEnCours = true; changer('parole');
    var navigateur = function () {
      if (!('speechSynthesis' in window)) return fini();
      var u = new SpeechSynthesisUtterance(t); u.lang = 'fr-FR'; u.rate = 1.04; u.pitch = .96;
      var v = voixNav || speechSynthesis.getVoices().filter(function (x) { return /^fr/i.test(x.lang); })[0]; if (v) u.voice = v;
      u.onboundary = function () { sphere.pousser(.4); }; u.onend = fini; u.onerror = fini;
      speechSynthesis.cancel(); speechSynthesis.speak(u);
    };
    if (voixNav && !voixGemini) return navigateur();   // avec Gemini, la voix du serveur passe d'abord : c'est la plus humaine
    fetch('/api/voix/parler', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texte: t }) })
      .then(function (r) { if (!r.ok) throw 0; return r.blob(); })
      .then(function (b) {
        var url = URL.createObjectURL(b); son.src = url; sphere.ecouter(anaVoix);
        son.onended = function () { URL.revokeObjectURL(url); fini(); }; son.onerror = fini;
        return son.play();
      }).catch(navigateur);
  }

  // ── Dire quelque chose à Jarvis (texte, dictée ou conversation : le même chemin) ─────────
  function demander(message, oral, suite, essai) {
    message = String(message || '').trim(); if (!message) return;
    essai = essai || 0; taire();
    $('toi').textContent = '« ' + message + ' »'; $('lui').textContent = ''; changer('reflexion');
    fetch('/api/dire', { method: 'POST', headers: ecrire, body: JSON.stringify({ message: message, oral: oral }) })
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (d) {
        var rep = d.reply || '(pas de réponse)';
        // Demandé à la voix : réponse à la voix seulement, sans texte affiché (Basile, 30/09/2026) ; voix coupée : le texte.
        var ecrit = !oral || muet;
        $('lui').textContent = ecrit ? rep : ''; $('lui').scrollTop = 0; charger();
        parler(rep, function () { if (suite) suite(); else changer('repos'); });
        if (muet && !suite) changer('repos');
      })
      .catch(function () {
        if (essai < 3) return setTimeout(function () { demander(message, oral, suite, essai + 1); }, 2500 * (essai + 1));
        $('lui').textContent = 'Je ne joins pas le serveur. Réessaie dans un instant.'; changer('repos');
      });
  }
  $('barre').onsubmit = function (e) { e.preventDefault(); audio(); var i = $('saisie'); demander(i.value, false); i.value = ''; };

  // ── L'oreille : le micro, la détection de fin de phrase, la transcription par le serveur ──
  var flux = null;
  function micro() {
    if (flux) return Promise.resolve(flux);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.reject(new Error('micro indisponible'));
    return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }).then(function (f) {
      flux = f; audio(); var s = ctxA.createMediaStreamSource(f); anaMic = ctxA.createAnalyser(); anaMic.fftSize = 1024; s.connect(anaMic); return f;
    });
  }
  function niveauMic() { var b = new Uint8Array(anaMic.fftSize), s = 0; anaMic.getByteTimeDomainData(b); for (var i = 0; i < b.length; i++) { var v = (b[i] - 128) / 128; s += v * v; } return Math.sqrt(s / b.length); }
  // Enregistre une phrase : commence quand tu parles, finit après un silence ; rend le texte transcrit.
  function unePhrase(opts) {
    return micro().then(function (f) {
      return new Promise(function (resolve, reject) {
        var type = window.MediaRecorder && MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
        var rec = new MediaRecorder(f, type ? { mimeType: type } : undefined), morceaux = [], aParle = false, silence = 0, debut = Date.now(), annule = false;
        var seuil = opts.seuil || .022, fin = opts.silence || 1100, max = opts.max || 60000, attente = opts.attente || 15000;
        rec.ondataavailable = function (e) { if (e.data.size) morceaux.push(e.data); };
        rec.onstop = function () {
          clearInterval(tic); sphere.ecouter(null);
          if (annule || !aParle) return resolve('');
          changer('reflexion');
          fetch('/api/voix/transcrire', { method: 'POST', body: new Blob(morceaux, { type: rec.mimeType || 'audio/webm' }) })
            .then(function (r) { return r.json(); }).then(function (d) { resolve(String(d.texte || '').trim()); }).catch(reject);
        };
        var tic = setInterval(function () {
          var n = niveauMic();
          if (n > seuil) { aParle = true; silence = 0; } else if (aParle) silence += 100;
          if ((aParle && silence >= fin) || Date.now() - debut > max || (!aParle && Date.now() - debut > attente)) { if (rec.state === 'recording') rec.stop(); }
        }, 100);
        unePhrase.arreter = function (sansEnvoi) { annule = !!sansEnvoi; if (!sansEnvoi) aParle = aParle || Date.now() - debut > 600; if (rec.state === 'recording') rec.stop(); };
        sphere.ecouter(anaMic); rec.start(250);
      });
    });
  }

  // La dictée : ta voix devient du texte dans la barre ; tu relis, tu envoies.
  var dicte = false;
  $('b-dicter').onclick = function () {
    audio();
    if (dicte) { unePhrase.arreter(false); return; }
    if (conversation) basculer();
    dicte = true; this.classList.add('dicte'); changer('dictee');
    var b = this;
    unePhrase({ silence: 2200, attente: 20000, max: 120000 }).then(function (t) {
      var i = $('saisie'); if (t) i.value = (i.value ? i.value + ' ' : '') + t; i.focus();
    }).catch(function () { avis('Micro refusé ou voix du serveur indisponible.'); })
      .then(function () { dicte = false; b.classList.remove('dicte'); changer('repos'); });
  };

  // La conversation orale : il t'écoute, sent quand tu as fini, répond à voix haute, puis t'écoute de nouveau.
  var conversation = false, vides = 0;
  var FIN = /^(stop|arr[êe]te|merci (jarvis|c'est tout)|c'est tout|au revoir|[çc]a ira|bonne nuit|fin de la conversation)\b/i;
  function ecouter() {
    if (!conversation) return;
    changer('ecoute');
    unePhrase({}).then(function (t) {
      if (!conversation) return;
      if (!t) { if (++vides >= 3) { basculer(); $('lui').textContent = 'Je me mets en veille. Touche la sphère pour reprendre.'; } else ecouter(); return; }
      vides = 0;
      if (FIN.test(t)) { basculer(); $('toi').textContent = '« ' + t + ' »'; parler('Très bien, je reste là si tu as besoin.'); return; }
      demander(t, true, ecouter);
    }).catch(function () { basculer(); avis('Micro refusé ou voix du serveur indisponible : écris-moi en attendant.'); });
  }
  function basculer() {
    audio();
    conversation = !conversation; vides = 0;
    $('b-conversation').classList.toggle('actif', conversation);
    if (conversation) { taire(); ecouter(); }
    else { if (unePhrase.arreter) unePhrase.arreter(true); changer('repos'); }
  }
  $('b-conversation').onclick = basculer;
  $('reacteur').onclick = function () { if (parleEnCours) { taire(); changer(conversation ? 'ecoute' : 'repos'); if (conversation) ecouter(); return; } basculer(); };
  $('b-muet').onclick = function () { muet = !muet; if (muet) taire(); $('onde').style.display = muet ? 'none' : ''; this.title = 'Voix de Jarvis : ' + (muet ? 'coupée' : 'activée'); };
  // La barre d'espace parle à Jarvis, sauf en caméra Libre (elle y fait monter la caméra) et pendant une saisie.
  addEventListener('keydown', function (e) {
    if (e.code === 'Space' && !e.repeat && !enSaisie() && $('scene').dataset.camera !== 'free') { e.preventDefault(); basculer(); }
    if (e.key === 'Escape') { taire(); fermerTiroirs(); }
  });
})();
