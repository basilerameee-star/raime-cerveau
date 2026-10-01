# Feuille de route du cerveau rAIme

*Mise à jour : 2026-10-01. Fichier produit depuis `jarvis/feuille_de_route.json` (la source) : ne pas le modifier à la main.*

Décidée avec Basile le 30/09/2026. Cette liste fait foi : chaque session (Claude, routines, Codex) la reprend là où elle en est, jusqu'à ce que tout soit fait.

**Avancement : 2 point(s) fait(s) sur 41.**

## Règles

- Un point n'est « fait » que quand sa condition « fini quand » est prouvée en production (la preuve est écrite).
- Un moteur de revenus à la fois (Basile, 30/09/2026) : les sites à 500 € d'abord, puis la niche (marque média et produits : une audience pour deux revenus ; l'objectif de 6 000 € ne compte que la monétisation), puis rAIme avec une preuve avant le prix ; le suivant démarre quand le précédent tourne seul.
- Chaque moteur est mesuré chaque semaine ; s'il ne rapporte rien après 6 semaines de fonctionnement complet, on le revoit avec Basile.
- La preuve avant le prix, partout : une maquette, un pré-audit chiffré, une démonstration.
- Clip farming : jamais la vidéo d'un autre sans son autorisation ; des sous-titres ne suffisent pas en France.
- Groupe « seul » : Claude le fait sans attendre. Groupe « basile » : il faut un compte, une clé ou un accord de Basile ; on le fait avec lui, étape par étape.
- L'argent en dernier : Basile finance la création de contenu et la publicité une fois tout le reste vérifié ; chaque dépense avec son accord.
- L'interface 3D finale est celle de Codex (plus tard) : ici, on fournit les données et les gestes.
- Les points marqués « routine » peuvent être faits par la routine Claude « Ingénierie » (sans accès au serveur) ; un point « en cours » n'est pris par personne d'autre.

## Groupe 1 : sans intervention de Basile

| Rang | N° | Moteur | Point | Il faut de Basile | Fini quand | État |
|---|---|---|---|---|---|---|
| 1 | 12 | Moteur 1 : sites à 500 € | Canal d'envoi des e-mails des vitrines | — | Un e-mail validé part depuis raime.fr par le flux n8n dédié, plafonné par jour, avec désinscription ; une réponse passe la vitrine à « répondu ». | FAIT (preuve : 01/10/2026 : workflow n8n « Vitrines · Envoi » (vitrinesEnvoi01) actif ; le vrai brouillon n°106 (Techni Nails) est parti de contact@raime.fr par Resend en mode essai, arrivé dans la boîte de réception de Basile, marqué « teste » ; plafond du jour, désinscription, réponse → « répondu » et « stop » prouvés au banc (tests/banc/vitrines_envoi.test.mjs).) |
| 4 | 18 | Moteur 1 : sites à 500 € | Écarter les chaînes et franchises | — | Aucune enseigne nationale (Paul, Brioche Dorée…) n'arrive en brouillon ; test à l'appui. | FAIT (preuve : 01/10/2026 : liste d'enseignes nationales dans agents/vitrines.js (découverte, qualification, et réexamen à chaque passage) ; en production, aucune enseigne en brouillon ni dans les appels (Carrefour fleurs, Paul, Brioche Dorée, Marie Blachère écartées) ; test « point 18 » au banc (« Boulangerie Paul Martin » reste, « Boulangerie Paul » sort).) |
| 6 | 16 | Moteur 1 : sites à 500 € | Maquettes premium pour ceux qui répondent | — | Une vitrine « répondu » reçoit une maquette soignée par Hermes (site-premium) ; la vidéo au défilement vient avec le point 26. | à faire |
| 9 | 19 | Moteur 2 : la niche (contenus et produits) | Agent de recherche de produits dans la niche retenue | — | Chaque semaine, 3 produits proposés dans Jarvis : saison, tendance sourcée, conformité UE, prix de vente visé, note du goût. | à faire |
| 10 | 21 | Moteur 2 : la niche (contenus et produits) | Calcul de rentabilité d'un produit | — | Pour chaque produit proposé : prix d'achat, livraison, frais de paiement, pub par vente, marge nette ; estimation signalée tant qu'AliExpress n'est pas branché. | en cours |
| 11 | 11 | Moteur 2 : la niche (contenus et produits) | Lire une page web (y compris JavaScript) pour tous les agents | — | Un outil commun rend le texte d'une page, même construite en JavaScript ; utilisé par la recherche de produits. | à faire |
| 13 | 25 | Moteur 2 : la niche (contenus et produits) | Réalisateur publicitaire UGC (produits et contenus de la niche) | — | D'un produit : script, images clés, prompts d'animation, montage FFmpeg, sous-titres, mention « Image virtuelle » ; chaîne prouvée à blanc, vraie vidéo au point 26. | à faire |
| 16 | 28 | Moteur 2 : la niche (contenus et produits) | Calendrier de publication des 6 comptes | — | Un calendrier de la semaine (2 marques × 3 plateformes) tenu en base et visible dans Jarvis ; publication dès que les comptes sont branchés. | à faire |
| 17 | 29 | Moteur 2 : la niche (contenus et produits) | Stratégie de campagne | — | Pour un produit ou une offre : publics, questions de ciblage, variantes A/B, règle d'arrêt des perdants, rapport ; prête à lancer. | à faire |
| 19 | 24 | Moteur 2 : la niche (contenus et produits) | Décision boutique (page et Stripe, puis TikTok Shop et Instagram Shop) | — | Recommandation écrite et sourcée (conditions de TikTok Shop en France, délais de livraison exigés). | à faire |
| 27 | 1 | Jarvis | Réponse vocale plus rapide | — | Jarvis commence à parler avant d'avoir fini d'écrire ; délai mesuré avant/après. | à faire |
| 28 | 2 | Jarvis | Fil « ce qui se passe derrière » | — | À la demande, Jarvis raconte l'activité réelle des agents des dernières heures, et un résumé du jour. | à faire |
| 29 | 4 | Jarvis | Gestes à la voix | — | « valide le produit 3 », « écarte », « publie », « lance la campagne » exécutés par du code, avec confirmation. | à faire |
| 30 | 3 | Jarvis | Données pour l'interface 3D | — | Produits, appels, vitrines, vidéos, campagnes, dépenses et feuille de route disponibles par l'API pour l'interface de Codex. | à faire |
| 31 | 32 | Mesure | Apprentissage sur les résultats | — | Chaque semaine, ce qui a marché (accroches, formats, heures) nourrit le plan suivant, par écrit. | à faire |
| 32 | 33 | Mesure | Suivi des revenus : 2 000 € par mois sur chacune de TikTok, YouTube et Instagram | — | Jarvis donne, chaque mois, la monétisation de TikTok, YouTube et Instagram face à 2 000 € chacune (6 000 € au total), et à part les ventes de produits et de rAIme. | à faire |
| 33 | 34 | Mesure | Réglage du goût sur les résultats réels | — | Les seuils du goût sont ajustés à partir des suites notées des jugements ; changement tracé. | à faire |
| 34 | 39 | Mesure | L'économe compte toutes les dépenses réelles | — | JEV, Higgsfield, Google et publicité comptés ; alerte avant tout dépassement. | à faire |
| 35 | 36 | Fiabilité | Configuration d'Hermes posée à chaque livraison | — | Une livraison qui change hermes/config.yaml la pose sur le serveur et redémarre Hermes quand il est libre. | à faire |
| 36 | 37 | Fiabilité | Page de confidentialité : retirer Oracle Cloud | — | raime.fr ne cite plus de prestataire retiré. | à faire |
| 37 | 38 | Fiabilité | Anciens ordres échoués (14 à 21) | — | Chacun relancé ou clos avec son motif. | à faire |
| 38 | 40 | Fiabilité | Suivi de chaque tâche de bout en bout | — | Une demande se suit de Jarvis à l'agent, à l'outil et au résultat, avec son coût. | à faire |
| 39 | 41 | Fiabilité | Un seul flux de réflexion | — | Architecte, réflexif, penseur et prospective regroupés ; un seul flux d'idées jugées par le goût. | à faire |

## Groupe 2 : avec Basile (clé, compte ou accord)

| Rang | N° | Moteur | Point | Il faut de Basile | Fini quand | État |
|---|---|---|---|---|---|---|
| 2 | 14 | Moteur 1 : sites à 500 € | Google Places branché | La clé GOOGLE_PLACES_API_KEY au coffre (projet Google Cloud, Places API (New), budget 1 € d'alerte). | Un passage de l'agent trouve des commerces par Google, avec téléphone, sous 900 recherches par mois. | attend Basile |
| 3 | 13 | Moteur 1 : sites à 500 € | Envoi automatique des vitrines (après n°12) | Lire l'essai reçu le 01/10/2026 (« [ESSAI] Techni Nails : j'ai préparé votre site ») ; si le texte convient : dans Jarvis, tiroir VITRINES, valider les brouillons, puis choisir « Réel » (10 e-mails par jour au plus, en semaine à 9 h). | Les brouillons validés partent seuls, au plafond du jour, et Jarvis dit combien sont partis. | attend Basile |
| 5 | 17 | Moteur 1 : sites à 500 € | Parcours de vente des sites à 500 € | Un lien de paiement Stripe à 500 €, créé une fois par Basile. | Oui → rendez-vous → lien de paiement → site du client en ligne ; un premier site vendu. | attend Basile |
| 7 | 15 | Moteur 1 : sites à 500 € | Adresse demo.raime.fr (option) | Un enregistrement DNS chez Cloudflare. | Les maquettes s'ouvrent sur demo.raime.fr. | attend Basile |
| 8 | 30 | Moteur 2 : la niche (contenus et produits) | Le personnage influenceur et sa niche (marque média et produits) | Nom retenu le 01/10/2026 : « Obito AF », masque d'Obito (spirale orange), photo de profil prête. Reste avec Basile : la niche, et le personnage 3D (Blender) : homme au style street, toujours masqué, visage jamais montré, train de vie fastueux, montres ; tenues et couleurs qui changent. | Le nom, la niche et la fiche du personnage sont écrits en tête de contenus/POSITIONNEMENT.md ; le personnage 3D existe ; le plan de la semaine et la recherche de produits les suivent. | attend Basile |
| 12 | 20 | Moteur 2 : la niche (contenus et produits) | Fournisseurs AliExpress | Compte AliExpress Open Platform (clé d'application). | Pour un produit : fournisseurs réels, stock, délai vers la France, entrepôt UE, note ; prix d'achat réel dans la rentabilité. | attend Basile |
| 14 | 6 | Moteur 2 : la niche (contenus et produits) | Publier sur Facebook et Instagram | Comptes de la marque (au nom du personnage) : nouvelle Page Facebook et nouveau compte Instagram professionnel (Créateur) reliés, dans le portefeuille Bahet, assignés à cerveau-raime (étapes données le 01/10/2026) ; Page RAIME assignée aussi. | Une publication (image puis Reel) part par l'API officielle et ses statistiques se lisent. | attend Basile |
| 15 | 10 | Moteur 2 : la niche (contenus et produits) | Règle d'autonomie des publications | L'accord écrit de Basile, inscrit dans la Constitution et le cap. | Les publications organiques partent seules après le contrôle du goût ; l'argent reste à l'accord de Basile. | attend Basile |
| 18 | 22 | Moteur 2 : la niche (contenus et produits) | Page produit avec paiement (après n°19, n°21) | Activité de vente à distance déclarée ; lien ou compte Stripe. | Une page produit légère en ligne, paiement Stripe, CGV, rétractation 14 jours, mentions ; un achat test réussi. | attend Basile |
| 20 | 7 | Moteur 2 : la niche (contenus et produits) | Campagnes Meta Ads gérées par le cerveau (après n°6, n°29) | Moyen de paiement du compte publicitaire ; accord de Basile par campagne. | Une campagne créée par l'API, plafonnée (300 €/mois au plus), suivie et arrêtée seule si elle perd. | attend Basile |
| 21 | 26 | Moteur 2 : la niche (contenus et produits) | Vidéos Higgsfield réelles (après n°25) | Recharge du solde de l'API Higgsfield (50 € au plus, sans recharge automatique), en dernier, une fois tout vérifié. | Une vidéo UGC finale livrée à Basile pour validation, coût réel noté. | attend Basile |
| 22 | 23 | Moteur 2 : la niche (contenus et produits) | Commandes aux fournisseurs et service client (après n°20, n°22) | Accord de Basile pour chaque paiement fournisseur, au début. | Une commande client suivie de bout en bout : paiement, commande fournisseur, suivi, message au client. | attend Basile |
| 23 | 8 | Moteur 2 : la niche (contenus et produits) | Publier sur TikTok | Compte TikTok ; application développeur à faire valider (ou passage par le connecteur Higgsfield). | Une vidéo publiée sur TikTok par le cerveau, statistiques lues. | attend Basile |
| 24 | 9 | Moteur 2 : la niche (contenus et produits) | Publier sur YouTube Shorts | Compte YouTube et autorisation de l'application. | Un Short publié par le cerveau, statistiques lues. | attend Basile |
| 25 | 31 | Moteur 2 : la niche (contenus et produits) | Statistiques des plateformes (après n°6, n°8, n°9) | Les comptes des points 6, 8 et 9 branchés. | Vues, abonnés, clics, ventes et coût par vente relevés chaque jour en base. | attend Basile |
| 26 | 35 | Moteur 3 : rAIme | Prospection des cabinets comptables avec une preuve avant le prix | La validation par Basile du texte et du pré-audit chiffré joint (métier des cabinets comptables). | Chaque e-mail aux cabinets comptables porte un pré-audit chiffré de leur métier ; taux de réponse mesuré avant / après. | attend Basile |
| 40 | 5 | Accès | Chantiers GitHub ouverts par le cerveau | Un jeton GitHub (droit Issues sur raime-cerveau) au coffre. | Le cerveau ouvre un chantier, la routine d'ingénierie le traite en pull request. | attend Basile |
| 41 | 27 | Contenu | Clip farming | Des sources autorisées : les vidéos de Basile, des campagnes de clipping rémunérées où le créateur autorise la découpe, ou des vidéos sous licence libre qui permet l'usage commercial (CC BY). | D'une vidéo autorisée : moments forts repérés, clips verticaux sous-titrés, source et autorisation notées, en file de publication. | attend Basile |

## Déjà fait le 30/09/2026

- Hermes et les agents de réflexion réparés (repli gratuit, clé Gemini de la boucle)
- Le cap et le goût (JEV) en tête de toutes les consignes ; questions à Basile triées
- Ancien modèle retiré ; requêtes automatiques vers 1 848 API publiques
- Routines Claude : ingénierie (2 fois par jour) et moteur de contenu (lundi)
- Appels de relance à J+7 ; agent des vitrines (maquettes publiques, brouillons, fiches)
- Jarvis : réponses brèves jamais transformées en ordres ; relance par numéro ; voix seule
