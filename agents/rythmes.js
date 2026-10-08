// LES RYTHMES DES AGENTS (08/10/2026 : sortis de la boucle pour être lus aussi par le Directeur, agents/directeur.js,
// sans lancer la boucle). Chaque agent : son module, sa fonction, son intervalle minimal, ses heures permises.
const MIN = 60_000;
export const H = 60 * MIN;

// Rythmes : intervalle minimal entre deux exécutions d'un même agent.
export const RYTHMES = [
  // Le cordon passe AVANT tout le reste : un message fautif annulé tard est un message parti.
  { nom: 'cordon', module: './cordon.js', fn: 'cordon', toutes: 1 * H, besoinN8n: true },
  // Les instruments passent en premier : les agents de jugement lisent ce qu'ils posent.
  { nom: 'instruments', module: './instruments.js', fn: 'relever', toutes: 1 * H, besoinN8n: true },
  // Le radar de mesure : ce qui sort, à quel prix, et ce que des acheteurs paient.
  { nom: 'radar', module: './radar.js', fn: 'scruter', toutes: 6 * H, besoinN8n: true },
  // Le plus fréquent : une réponse non réconciliée est une réponse invisible.
  { nom: 'reconciliateur', module: './reconciliateur.js', fn: 'reconcilier', toutes: 2 * H, besoinN8n: true },
  // 08/10/2026 : retiré, remplacé par le Directeur (agents/directeur.js, un seul flux de réflexion). 
  // { nom: 'superviseur',  module: './superviseur.js', fn: 'superviser', toutes: 4 * H,   besoinN8n: true },
  // EN PAUSE depuis le 2026-09-23, sur la parole de Basile : « on ne s'est pas mis d'accord
  // sur l'e-mail ». Le Heraut ne redige plus de brouillons tant que le nouveau message n'est
  // pas valide. Pour le relancer : retirer les deux barres de commentaire ci-dessous.
  // REPRIS le 2026-09-25 : Basile a dicté le message (heraut v3). Il ne rédige que des BROUILLONS ;
  // rien ne part sans la validation de Basile dans le cockpit.
  // 07/10/2026 : remplacé par prospection_auto (le même e-mail que les vitrines, avec le pré-audit, écrit par le code).
  // 07/10/2026 : le Fureteur réécrit (remplace le workflow n8n) — il trouve l'adresse sur le site PROUVÉ de l'entreprise.
  { nom: 'fureteur',     module: './fureteur.js',    fn: 'passer',      toutes: 1 * H, besoinN8n: true, args: { combien: 25, recherches: 8 } },
  { nom: 'prospection', module: './prospection_auto.js', fn: null,     toutes: 24 * H, besoinN8n: true,  cmd: 'prospection' },
  // 08/10/2026 : les entreprises que le Fureteur déclare sans site ne sont plus perdues — une fiche VITRINES chacune, à
  // appeler (numéro vérifié) ou à compléter (Basile lit le numéro dans l'annuaire de la profession). Rien n'est envoyé.
  { nom: 'sans_site',    module: './sans_site.js',   fn: 'depuisSherlock', toutes: 2 * H, besoinN8n: true },
  // Le reflexif passe chaque jour : il mesure les agents, designe le maillon faible et propose
  // une version de prompt INACTIVE, jamais activee par lui-meme. Mesure du 2026-09-23 : 0,0028 $.
  // 08/10/2026 : retiré, remplacé par le Directeur (agents/directeur.js, un seul flux de réflexion). 
  // { nom: 'reflexif',     module: './reflexif.js',    fn: 'reflechir',   toutes: 24 * H, besoinN8n: true },
  // L'éclaireur : les modèles GRATUITS, repérés, mesurés par la batterie de métrologie, et les meilleurs
  // adoptés par la parole (jarvis/parole.cjs). Le 30/09/2026, la chaîne des modèles PAYANTS (sync du
  // catalogue OpenRouter, sas.balayer, chasseur, métrologue) est retirée : OpenRouter est coupé depuis le 26/09.
  { nom: 'eclaireur',    module: './eclaireur.js',   fn: 'eclairer',    toutes: 24 * H, besoinN8n: false },
  // La bibliotheque avale ce qu on depose dans bibliotheque/ : notes, offres, sources.
  // Recherche en francais dans Postgres, sans appeler personne et sans depenser un centime.
  { nom: 'bibliothecaire', module: './bibliothecaire.js', fn: 'ranger', toutes: 12 * H, besoinN8n: false },
  // L'agent reflexif : il tient les buts, choisit ses sous-taches, s'evalue, corrige ses
  // croyances et pose ses questions a Basile. Premier cycle v2 mesure : 0,0062 $.
  // 08/10/2026 : retiré, remplacé par le Directeur (agents/directeur.js, un seul flux de réflexion). 
  // { nom: 'architecte',   module: './architecte.js',  fn: 'architecte',  toutes: 6 * H, besoinN8n: true },
  // Le savoir general : 23 domaines voulus par Basile (finance, droit, sante, sciences,
  // quantique, philosophie, metaphysique, spiritualite, esoterisme...). 30 articles par
  // domaine et par jour, source Wikipedia (CC BY-SA), sans cle ni depense.
  // 60 par domaine depuis le 2026-09-24 : environ 1 400 articles par jour, 2 Go par mois au
  // plus, pour 131 Go libres. Le disque tient plus de cinq ans a ce rythme.
  // EN PAUSE depuis le 2026-09-25, sur la parole de Basile : « on évite les sources comme
  // Wikipédia, c'est un peu du slop ». Le savoir viendra de la recherche Internet classique
  // (moteur souverain + Gemini) et des sources premières.
  // { nom: 'encyclopediste', module: './encyclopediste.js', fn: 'nourrir', toutes: 24 * H, besoinN8n: false, args: { combien: 60 } },
  // Ce que Basile demande a Cortex et que la bibliotheque ignorait y entre dans l'heure.
  { nom: 'curieux',      module: './encyclopediste.js', fn: 'apprendreDemandes', toutes: 1 * H, besoinN8n: false },
  // Les yeux dehors : forums, depots de code, nouveaux modeles, travaux de recherche.
  // Quatre API publiques, tri par du code, rangement dans la bibliotheque. Cout : zero.
  { nom: 'veilleur',     module: './veilleur.js',    fn: 'veiller',     toutes: 24 * H, besoinN8n: false },
  // 08/10/2026 : retiré, remplacé par le Directeur (agents/directeur.js, un seul flux de réflexion). 
  // { nom: 'prospective',  module: './prospective.js', fn: 'projeter',    toutes: 7 * 24 * H, besoinN8n: false },
  // Les portes d'entrée (CCI, organismes de formation) : 40 sites lus par jour, robots.txt
  // respecté ; un lot de 30 portes présenté à Basile quand il est prêt. RIEN n'est envoyé ici.
  { nom: 'portes',       module: './portes.js',      fn: 'portes',      toutes: 24 * H, besoinN8n: true },
  // La publicité de la semaine suivante : neuf BROUILLONS (LinkedIn, Facebook, Instagram,
  // TikTok), texte et image fixe, relus par le code. Rien n'est publié : aucun compte n'existe.
  { nom: 'publiciste',   module: './publiciste.js',  fn: 'preparerSemaine', toutes: 7 * 24 * H, besoinN8n: false },
  // Les vitrines (30/09/2026) : les commerçants sans site ou au site ancien, une maquette, un brouillon d'e-mail,
  // et la liste d'appels. Du code, aucun modèle ; RIEN n'est envoyé ici.
  // 08/10/2026 : 15 fiches par passage (au lieu de 8) : une ville entière est découverte à chaque passage.
  { nom: 'vitrines',     module: './vitrines.js',    fn: 'passer',      toutes: 2 * H, besoinN8n: false, args: { combien: 15 } },
  // L'envoi des vitrines validées : la file du workflow n8n « Vitrines · Envoi », son issue, les réponses et les « stop ».
  { nom: 'vitrines_envoi', module: './vitrines.js', fn: 'synchroniser', toutes: 1 * H, besoinN8n: true },
  // Le répertoire des API publiques (public-apis, MIT) : relu chaque semaine, reversé seulement si le
  // dépôt a changé. Du code, aucun modèle : coût zéro. Demande de Basile, 30/09/2026.
  { nom: 'apis',         module: './apis_publiques.js', fn: 'actualiser', toutes: 7 * 24 * H, besoinN8n: false },
  // Le penseur : la pensée de la nuit (au plus trois idées sourcées, sans conseil de placement),
  // relue par Jarvis au matin. Entre 2 h et 5 h, heure de Paris, une fois par nuit.
  // 08/10/2026 : retiré, remplacé par le Directeur (agents/directeur.js, un seul flux de réflexion). 
  // { nom: 'penseur',      module: './penseur.js',     fn: 'penser',      toutes: 12 * H, besoinN8n: false, args: { garder: true }, heures: [2, 5] },
  // LE DIRECTEUR (08/10/2026, points 41 et 58) : une fois par jour, entre 5 h et 7 h à Paris (avant l'e-mail de 7 h 30),
  // l'état réel de chaque agent, ce que la maison a produit, les alertes, les idées de la nuit jugées par le goût (le
  // penseur est appelé par lui), au plus un diagnostic confié à Hermes, et UN bilan. Il remplace l'architecte, le
  // superviseur, le réflexif, la prospective et le penseur comme agents séparés.
  { nom: 'directeur',    module: './directeur.js',   fn: 'diriger',     toutes: 24 * H, besoinN8n: true, heures: [5, 7] },
];
