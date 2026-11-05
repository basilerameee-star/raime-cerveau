// Cockpit radial rAIme — l'état du système au 04/11/2026, après l'allègement.
// Rien n'est inventé. Sources de chaque état :
//  - boucle : agents/rythmes.js du dépôt raime-cerveau, commit 0d3737c (04/11/2026) : 4 agents actifs, 16 commentés le 04/11 ;
//  - n8n : note « allègement » du 04/11 : 21 flux dépubliés et archivés, seul Héraut (rapport de 7 h 30) publié ;
//  - conteneurs : supprimés le 04/11 : raime-trading, raime-voix-1, docuseal, searxng, raime-ollama ; 9 services restent ;
//  - tâches planifiées : 10 coupées le 04/11 (« surtout des surveillances et des gouverneurs ; le Médecin reste ») — la liste
//    exacte n'a pas été relevée ici : ces agents sont marqués « non relevé » plutôt que devinés ;
//  - Moon & Pillow : dépôt Moon-Pillow (22 commits du 23/10 au 04/11 22 h 11), moonandpillow.com répond (200, relevé le 05/11) ;
//    pause de la boutique notée au carnet le 04/11 ; 568 images virtuelles dans public/img/virtuelles ; 39 décors dans
//    public/img/decors, tous datés du 29/10, non suivis par Git ;
//  - cockpit : cockpit.raime.fr répond 401 (mot de passe) le 05/11 à 19 h 37 ; il refusait la connexion le 04/11 vers 21 h 30
//    (premier essai de bascule) ;
//  - migration : message de la session de migration du 05/11 : bascule de 19 h 24 à 19 h 36 (heure de Paris), le CX23 porte
//    les adresses de l'ancien serveur ; cockpit 401, boucle à 4 agents, n8n /healthz 200, 9 conteneurs en marche, porte active ;
//    l'ancien CX43 est éteint, pas supprimé ;
//  - disque : 39 Go utilisés sur 160 Go après l'allègement (note du 04/11) ; sauvegardes R2 : dernière vérification relevée le 30/09.
// Quand la page est servie par le cockpit, /api/v6 est lu en plus : il donne le dernier passage réel de chaque agent.
// États : actif · garde (tourne, sans e-mail) · coupe (arrêté le 04/11, réversible) · supprime · encours · nonreleve
window.RAIME = {
  releve: '2026-11-05T19:40:00+01:00',
  titre: 'rAIme',
  sousTitre: 'Système interne seul · allégé le 04/11/2026',
  anneaux: [
    { cle: 'courriels', valeur: '1', texte: 'seul e-mail restant : le rapport de 7 h 30' },
    { cle: 'boucle', valeur: '4 / 20', texte: 'agents de la boucle encore actifs' },
    { cle: 'n8n', valeur: '1', texte: 'flux n8n publié, le Héraut (21 dépubliés le 04/11)' },
    { cle: 'services', valeur: '9', texte: 'services sur le serveur (5 supprimés)' },
    { cle: 'serveur', valeur: '5,99 €', texte: 'par mois HT pour le serveur CX23 (environ 19,70 € avant)' },
  ],
  poles: [
    {
      cle: 'machine', nom: 'Machine', etat: 'actif',
      resume: 'Tout tourne sur le petit serveur CX23 depuis le 05/11 à 19 h 36. L’ancien CX43 est éteint, gardé en secours.',
      branches: [
        { id: 'machine', nom: 'Ancien serveur CX43', etat: 'encours', texte: 'Éteint le 05/11, pas supprimé : il reste en secours. Sa suppression attend ton accord.', detail: ['8 cœurs · 16 Go · 160 Go', 'environ 19,70 €/mois HT avec sauvegardes et IPv4 tant qu’il existe'] },
        { id: 'cx23', nom: 'Petit serveur CX23 (Helsinki)', etat: 'actif', texte: 'Sert tout le système depuis le 05/11 à 19 h 36 (5,99 €/mois HT). Vérifié : cockpit, boucle à 4 agents, n8n, 9 services, porte.', detail: ['2 cœurs · 4 Go · 40 Go', 'le premier essai, le 04/11 au soir, avait échoué sur un réglage de Docker'] },
        { id: 'bascule', nom: 'Bascule des adresses IP', etat: 'actif', texte: 'Faite le 05/11 entre 19 h 24 et 19 h 36 : le CX23 a repris les adresses de l’ancien serveur. Le domaine n’a rien changé.' },
        { id: 'nettoyage_clips', nom: 'Nettoyage des vidéos de clips', etat: 'nonreleve', texte: 'Le script existe. Sa planification sur le nouveau serveur n’est pas relevée ici. Il évite qu’une vidéo source (3 à 11 Go) remplisse le petit disque.' },
        { id: 'sauvegardes', nom: 'Sauvegardes de nuit', etat: 'nonreleve', texte: 'Prévues chaque nuit, sur le serveur et dans Cloudflare R2. Gardées, mais leur dernière vérification relevée date du 30/09.' },
        { id: 'livraison', nom: 'Livraison du code (la porte)', etat: 'actif', texte: 'A livré l’allègement le 04/11 à 16 h 05 UTC (commit 0d3737c), test vert sur le serveur.' },
        { id: 'conteneurs', nom: 'Services en marche', etat: 'actif', texte: 'hermes, n8n, postgres, cockpit, caddy, boucle, executant, mcp, envoyeur.' },
        { id: 'supprimes', nom: 'Services supprimés', etat: 'supprime', texte: 'Trading, voix, signature de contrats (DocuSeal), moteur de recherche interne (SearXNG), modèle local (Ollama). Copies de leurs réglages gardées.' },
      ],
    },
    {
      cle: 'direction', nom: 'Direction', etat: 'actif',
      resume: 'Le Directeur, Hermes et le suivi de tes ordres continuent.',
      branches: [
        { id: 'directeur', nom: 'Directeur', etat: 'actif', texte: 'Un passage chaque matin entre 5 h et 7 h. Un des 4 agents gardés dans la boucle.' },
        { id: 'veilleur_ordres', nom: 'Veilleur des ordres', etat: 'actif', texte: 'Toutes les heures : repère un ordre en attente depuis plus de 24 h.' },
        { id: 'hermes', nom: 'Hermes', etat: 'actif', texte: 'Son service tourne toujours (sur ordre).' },
        { id: 'medecin', nom: 'Médecin du système', etat: 'actif', texte: 'Gardé quand les tâches planifiées ont été coupées.' },
        { id: 'routine_inge', nom: 'Routine Claude « Ingénierie »', etat: 'coupe', texte: 'En pause depuis le 04/11 (2 fois par jour). Elle échouait déjà : forfait épuisé.' },
        { id: 'routine_contenu', nom: 'Routine Claude « Moteur de contenu »', etat: 'coupe', texte: 'En pause depuis le 04/11 (chaque lundi).' },
        { id: 'gouverneurs', nom: 'Gouverneurs et analystes', etat: 'nonreleve', texte: 'Une partie des 10 tâches planifiées coupées le 04/11 (surtout des surveillances et des gouverneurs). Lesquels exactement : à relever sur le serveur.' },
        { id: 'veille', nom: 'Veille par pôle', etat: 'coupe', texte: 'Retirée de la boucle le 04/11 (poles, veilleur).' },
      ],
    },
    {
      cle: 'savoir', nom: 'Mémoire', etat: 'actif',
      resume: 'La bibliothèque et le garde-fou des envois restent.',
      branches: [
        { id: 'bibliothecaire', nom: 'Bibliothécaire', etat: 'actif', texte: 'Toutes les 12 h : range ce qui est déposé dans la bibliothèque. Sans appel payant.' },
        { id: 'cordon', nom: 'Cordon et nettoyage', etat: 'actif', texte: 'Toutes les heures, en premier : le garde-fou des messages.' },
        { id: 'eclaireur', nom: 'Éclaireur des modèles', etat: 'coupe', texte: 'Retiré de la boucle le 04/11.' },
        { id: 'curieux', nom: 'Curieux', etat: 'coupe', texte: 'Retiré de la boucle le 04/11.' },
        { id: 'apis', nom: 'Répertoire des API publiques', etat: 'coupe', texte: 'Retiré de la boucle le 04/11.' },
        { id: 'instruments', nom: 'Instruments et radar', etat: 'coupe', texte: 'Retirés de la boucle le 04/11 (instruments, radar, réconciliateur).' },
      ],
    },
    {
      cle: 'jarvis', nom: 'Jarvis', etat: 'actif',
      resume: 'Plus d’alertes par e-mail : elles sont notées dans un journal. Seul le rapport de 7 h 30 part.',
      branches: [
        { id: 'matin', nom: 'Rapport de 7 h 30 (Héraut)', etat: 'actif', texte: 'Le seul e-mail automatique restant, et le seul flux n8n publié. Il contient encore la liste des prospects à relancer.' },
        { id: 'alertes', nom: 'Alertes des clips et candidatures', etat: 'coupe', texte: 'Plus d’e-mail : écrites dans alertes.log sur le serveur (environ 180 e-mails en 14 jours avant).' },
        { id: 'sentinelle', nom: 'Sentinelle', etat: 'coupe', texte: 'Flux n8n dépublié le 04/11 (un e-mail par jour avant).' },
        { id: 'voix', nom: 'Voix de Jarvis', etat: 'supprime', texte: 'Service raime-voix supprimé le 04/11.' },
        { id: 'courrier', nom: 'Tri du courrier', etat: 'nonreleve', texte: 'État non relevé après l’allègement.' },
        { id: 'cockpit', nom: 'Cockpit', etat: 'actif', texte: 'Répond sur le CX23 (vérifié le 05/11 à 19 h 37). Coupé le 04/11 au soir pendant le premier essai de bascule, puis 12 minutes le 05/11 pendant la bascule.' },
      ],
    },
    {
      cle: 'clipping', nom: 'Clipping', etat: 'garde',
      resume: 'La machine à clips tourne, sans e-mail. Les campagnes ne sont plus proposées par e-mail.',
      branches: [
        { id: 'chercheur_camp', nom: 'Pilote des campagnes', etat: 'garde', texte: 'Tourne toujours. Le choix « 1, 2 ou 3 » par e-mail ne marche plus pour l’instant.' },
        { id: 'decoupeur', nom: 'Découpeur', etat: 'garde', texte: 'Tourne, sans e-mail. Vidéos sources de plus de 3 jours effacées le 04/11 ; clips finis des 30 derniers jours gardés.' },
        { id: 'publication', nom: 'Publication', etat: 'garde', texte: 'Tourne, sans e-mail.' },
        { id: 'verif_pub', nom: 'Vérificateur de publications', etat: 'garde', texte: 'Tourne, sans e-mail.' },
        { id: 'soumission', nom: 'Déclaration Content Rewards', etat: 'garde', texte: 'Tourne, sans e-mail.' },
      ],
    },
    {
      cle: 'candidatures', nom: 'Candidatures', etat: 'garde',
      resume: 'Tes candidatures continuent, sans e-mail d’alerte.',
      branches: [
        { id: 'collecte', nom: 'Collecte des offres', etat: 'garde', texte: 'Deux fois par jour, depuis ton PC.' },
        { id: 'lettres', nom: 'Rédacteur des lettres', etat: 'garde', texte: 'Tourne, sans e-mail.' },
        { id: 'envoyeur', nom: 'Envoyeur', etat: 'garde', texte: 'Son service (envoyeur) tourne toujours.' },
        { id: 'veille_cand', nom: 'Veille des candidatures', etat: 'nonreleve', texte: 'Ses alertes ne partent plus par e-mail. État de la tâche non relevé.' },
      ],
    },
    {
      cle: 'vente', nom: 'Vente externe', etat: 'coupe',
      resume: 'Arrêtée le 04/11 : plus de prospection, plus de vitrines, plus d’envoi aux entreprises.',
      branches: [
        { id: 'fureteur', nom: 'Fureteur', etat: 'coupe', texte: 'Retiré de la boucle le 04/11.' },
        { id: 'redacteur', nom: 'Prospection (pré-audits)', etat: 'coupe', texte: 'Retirée de la boucle le 04/11.' },
        { id: 'expediteur', nom: 'Expéditeur', etat: 'coupe', texte: 'Flux n8n dépublié le 04/11.' },
        { id: 'vitrines', nom: 'Chercheur de commerces et maquettes', etat: 'coupe', texte: 'Retirés de la boucle le 04/11 (vitrines, sans site).' },
        { id: 'envoi_vit', nom: 'Envoi des maquettes', etat: 'coupe', texte: 'Flux n8n « Vitrines envoi » et « après l’appel » dépubliés le 04/11.' },
        { id: 'sherlock', nom: 'Sherlock et Réceptionniste', etat: 'coupe', texte: 'Flux n8n dépubliés et archivés le 04/11.' },
        { id: 'portes', nom: 'Portes d’entrée et publiciste', etat: 'coupe', texte: 'Retirés de la boucle le 04/11.' },
        { id: 'signature', nom: 'Signature de contrats', etat: 'supprime', texte: 'DocuSeal supprimé le 04/11.' },
      ],
    },
    {
      cle: 'argent', nom: 'Argent', etat: 'coupe',
      resume: 'Trading supprimé, bourse retirée de la boucle.',
      branches: [
        { id: 't_heure', nom: 'Trading', etat: 'supprime', texte: 'Service raime-trading supprimé le 04/11 (il était déjà arrêté).' },
        { id: 'portefeuilles', nom: 'Portefeuilles boursiers', etat: 'coupe', texte: 'Retirés de la boucle le 04/11.' },
        { id: 'produits', nom: 'Recherche de produits', etat: 'nonreleve', texte: 'État non relevé après l’allègement.' },
      ],
    },
    {
      cle: 'moon', nom: 'Moon & Pillow', etat: 'encours',
      resume: 'Boutique mise en pause le 04/11. Le site reste en ligne et son travail continue.',
      branches: [
        { id: 'mp_site', nom: 'Site moonandpillow.com', etat: 'actif', texte: 'En ligne (répond le 05/11). Nouvelle navigation verticale, collection à colonne gauche et palette sombre chaude, enregistrées le 04/11 à 22 h 11.', detail: ['22 versions enregistrées depuis le 23/10'] },
        { id: 'mp_vente', nom: 'Conditions de vente', etat: 'actif', texte: 'Livraison offerte dès 100 €, retours gratuits sous 14 jours, médiateur CM2C, mentions légales (28/10).' },
        { id: 'mp_images', nom: 'Images virtuelles Gemini', etat: 'actif', texte: '568 images virtuelles des produits AW et CJ, en mises en scène plutôt que sur fond blanc.' },
        { id: 'mp_decors', nom: 'Génération des décors', etat: 'encours', texte: '39 décors produits avec Gemini le 29/10, pas encore enregistrés dans le site.' },
      ],
    },
  ],
};
