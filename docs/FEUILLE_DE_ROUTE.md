# Feuille de route du cerveau rAIme

*Mise à jour : 2026-09-30. Fichier produit depuis `jarvis/feuille_de_route.json` (la source) : ne pas le modifier à la main.*

Décidée avec Basile le 30/09/2026. Cette liste fait foi : chaque session (Claude, routines, Codex) la reprend là où elle en est, jusqu'à ce que tout soit fait.

**Avancement : 0 point(s) fait(s) sur 41.**

## Règles

- Un point n'est « fait » que quand sa condition « fini quand » est prouvée en production (la preuve est écrite).
- Ordre : le revenu le plus proche d'abord ; on suit le rang, sauf blocage.
- Groupe « seul » : Claude le fait sans attendre. Groupe « basile » : il faut un compte, une clé ou un accord de Basile ; on le fait avec lui, étape par étape.
- L'argent en dernier : Basile finance la création de contenu et la publicité une fois tout le reste vérifié ; chaque dépense avec son accord.
- L'interface 3D finale est celle de Codex (plus tard) : ici, on fournit les données et les gestes.
- Les points marqués « routine » peuvent être faits par la routine Claude « Ingénierie » (sans accès au serveur) ; un point « en cours » n'est pris par personne d'autre.

## Groupe 1 : sans intervention de Basile

| Rang | N° | Moteur | Point | Il faut de Basile | Fini quand | État |
|---|---|---|---|---|---|---|
| 1 | 12 | Vitrines | Canal d'envoi des e-mails des vitrines | — | Un e-mail validé part depuis raime.fr par le flux n8n dédié, plafonné par jour, avec désinscription ; une réponse passe la vitrine à « répondu ». | en cours |
| 4 | 18 | Vitrines | Écarter les chaînes et franchises | — | Aucune enseigne nationale (Paul, Brioche Dorée…) n'arrive en brouillon ; test à l'appui. | à faire |
| 5 | 19 | Produits | Agent de recherche de produits | — | Chaque semaine, 3 produits proposés dans Jarvis : saison, tendance sourcée, conformité UE, prix de vente visé, note du goût. | à faire |
| 6 | 21 | Produits | Calcul de rentabilité d'un produit | — | Pour chaque produit proposé : prix d'achat, livraison, frais de paiement, pub par vente, marge nette ; estimation signalée tant qu'AliExpress n'est pas branché. | à faire |
| 7 | 11 | Accès | Lire une page web (y compris JavaScript) pour tous les agents | — | Un outil commun rend le texte d'une page, même construite en JavaScript ; utilisé par la recherche de produits. | à faire |
| 8 | 25 | Vidéo | Réalisateur publicitaire UGC | — | D'un produit : script, images clés, prompts d'animation, montage FFmpeg, sous-titres, mention « Image virtuelle » ; chaîne prouvée à blanc, vraie vidéo au point 26. | à faire |
| 12 | 29 | Publicité | Stratégie de campagne | — | Pour un produit ou une offre : publics, questions de ciblage, variantes A/B, règle d'arrêt des perdants, rapport ; prête à lancer. | à faire |
| 15 | 24 | Boutique | Décision boutique (page et Stripe, puis TikTok Shop et Instagram Shop) | — | Recommandation écrite et sourcée (conditions de TikTok Shop en France, délais de livraison exigés). | à faire |
| 20 | 28 | Publication | Calendrier de publication des 6 comptes | — | Un calendrier de la semaine (2 marques × 3 plateformes) tenu en base et visible dans Jarvis ; publication dès que les comptes sont branchés. | à faire |
| 22 | 1 | Jarvis | Réponse vocale plus rapide | — | Jarvis commence à parler avant d'avoir fini d'écrire ; délai mesuré avant/après. | à faire |
| 23 | 2 | Jarvis | Fil « ce qui se passe derrière » | — | À la demande, Jarvis raconte l'activité réelle des agents des dernières heures, et un résumé du jour. | à faire |
| 24 | 4 | Jarvis | Gestes à la voix | — | « valide le produit 3 », « écarte », « publie », « lance la campagne » exécutés par du code, avec confirmation. | à faire |
| 25 | 3 | Jarvis | Données pour l'interface 3D | — | Produits, appels, vitrines, vidéos, campagnes, dépenses et feuille de route disponibles par l'API pour l'interface de Codex. | à faire |
| 26 | 16 | Vitrines | Maquettes premium pour ceux qui répondent | — | Une vitrine « répondu » reçoit une maquette soignée par Hermes (site-premium) ; la vidéo au défilement vient avec le point 26. | à faire |
| 32 | 32 | Mesure | Apprentissage sur les résultats | — | Chaque semaine, ce qui a marché (accroches, formats, heures) nourrit le plan suivant, par écrit. | à faire |
| 33 | 33 | Mesure | Suivi des revenus vers 2 000 €/mois | — | Jarvis donne le total du mois par source : plateformes, rAIme, sites à 500 €, dropshipping. | à faire |
| 34 | 34 | Mesure | Réglage du goût sur les résultats réels | — | Les seuils du goût sont ajustés à partir des suites notées des jugements ; changement tracé. | à faire |
| 35 | 39 | Mesure | L'économe compte toutes les dépenses réelles | — | JEV, Higgsfield, Google et publicité comptés ; alerte avant tout dépassement. | à faire |
| 37 | 36 | Fiabilité | Configuration d'Hermes posée à chaque livraison | — | Une livraison qui change hermes/config.yaml la pose sur le serveur et redémarre Hermes quand il est libre. | à faire |
| 38 | 37 | Fiabilité | Page de confidentialité : retirer Oracle Cloud | — | raime.fr ne cite plus de prestataire retiré. | à faire |
| 39 | 38 | Fiabilité | Anciens ordres échoués (14 à 21) | — | Chacun relancé ou clos avec son motif. | à faire |
| 40 | 40 | Fiabilité | Suivi de chaque tâche de bout en bout | — | Une demande se suit de Jarvis à l'agent, à l'outil et au résultat, avec son coût. | à faire |
| 41 | 41 | Fiabilité | Un seul flux de réflexion | — | Architecte, réflexif, penseur et prospective regroupés ; un seul flux d'idées jugées par le goût. | à faire |

## Groupe 2 : avec Basile (clé, compte ou accord)

| Rang | N° | Moteur | Point | Il faut de Basile | Fini quand | État |
|---|---|---|---|---|---|---|
| 2 | 14 | Vitrines | Google Places branché | La clé GOOGLE_PLACES_API_KEY au coffre (projet Google Cloud, Places API (New), budget 1 € d'alerte). | Un passage de l'agent trouve des commerces par Google, avec téléphone, sous 900 recherches par mois. | attend Basile |
| 3 | 13 | Vitrines | Envoi automatique des vitrines (après n°12) | La validation par Basile du texte final de l'e-mail (500 €, maquette, agenda). | Les brouillons validés partent seuls, au plafond du jour, et Jarvis dit combien sont partis. | attend Basile |
| 9 | 6 | Publication | Publier sur Facebook et Instagram | Page RAIME assignée à cerveau-raime ; Instagram en compte pro relié à la Page (fait ensemble, étape par étape). | Une publication (image puis Reel) part par l'API officielle et ses statistiques se lisent. | attend Basile |
| 10 | 10 | Publication | Règle d'autonomie des publications | L'accord écrit de Basile, inscrit dans la Constitution et le cap. | Les publications organiques partent seules après le contrôle du goût ; l'argent reste à l'accord de Basile. | attend Basile |
| 11 | 7 | Publicité | Campagnes Meta Ads gérées par le cerveau (après n°6, n°29) | Moyen de paiement du compte publicitaire ; accord de Basile par campagne. | Une campagne créée par l'API, plafonnée (300 €/mois au plus), suivie et arrêtée seule si elle perd. | attend Basile |
| 13 | 20 | Produits | Fournisseurs AliExpress | Compte AliExpress Open Platform (clé d'application). | Pour un produit : fournisseurs réels, stock, délai vers la France, entrepôt UE, note ; prix d'achat réel dans la rentabilité. | attend Basile |
| 14 | 22 | Boutique | Page produit avec paiement (après n°19, n°21) | Activité de vente à distance déclarée ; lien ou compte Stripe. | Une page produit légère en ligne, paiement Stripe, CGV, rétractation 14 jours, mentions ; un achat test réussi. | attend Basile |
| 16 | 26 | Vidéo | Vidéos Higgsfield réelles (après n°25) | Recharge du solde de l'API Higgsfield (50 € au plus, sans recharge automatique), en dernier, une fois tout vérifié. | Une vidéo UGC finale livrée à Basile pour validation, coût réel noté. | attend Basile |
| 17 | 23 | Boutique | Commandes aux fournisseurs et service client (après n°20, n°22) | Accord de Basile pour chaque paiement fournisseur, au début. | Une commande client suivie de bout en bout : paiement, commande fournisseur, suivi, message au client. | attend Basile |
| 18 | 8 | Publication | Publier sur TikTok | Compte TikTok ; application développeur à faire valider (ou passage par le connecteur Higgsfield). | Une vidéo publiée sur TikTok par le cerveau, statistiques lues. | attend Basile |
| 19 | 9 | Publication | Publier sur YouTube Shorts | Compte YouTube et autorisation de l'application. | Un Short publié par le cerveau, statistiques lues. | attend Basile |
| 21 | 30 | Contenu | Niche de la marque média | Le choix de Basile sur l'étude de positionnement (routine « Moteur de contenu »). | La niche est écrite dans contenus/POSITIONNEMENT.md et le plan de la semaine suit. | attend Basile |
| 27 | 17 | Vitrines | Parcours de vente des sites à 500 € | Un lien de paiement Stripe à 500 €, créé une fois par Basile. | Oui → rendez-vous → lien de paiement → site du client en ligne ; un premier site vendu. | attend Basile |
| 28 | 15 | Vitrines | Adresse demo.raime.fr (option) | Un enregistrement DNS chez Cloudflare. | Les maquettes s'ouvrent sur demo.raime.fr. | attend Basile |
| 29 | 5 | Accès | Chantiers GitHub ouverts par le cerveau | Un jeton GitHub (droit Issues sur raime-cerveau) au coffre. | Le cerveau ouvre un chantier, la routine d'ingénierie le traite en pull request. | attend Basile |
| 30 | 27 | Contenu | Clip farming | Des sources autorisées (vidéos de Basile ou programmes de clipping rémunérés). | D'une vidéo longue : moments forts repérés, clips verticaux sous-titrés, en file de publication. | attend Basile |
| 31 | 31 | Mesure | Statistiques des plateformes (après n°6, n°8, n°9) | Les comptes des points 6, 8 et 9 branchés. | Vues, abonnés, clics, ventes et coût par vente relevés chaque jour en base. | attend Basile |
| 36 | 35 | Prospection | Prospection des cabinets comptables recentrée | La validation par Basile des 10 brouillons de son texte du 25/09. | Les envois vont en majorité aux cabinets comptables ; taux de réponse mesuré. | attend Basile |

## Déjà fait le 30/09/2026

- Hermes et les agents de réflexion réparés (repli gratuit, clé Gemini de la boucle)
- Le cap et le goût (JEV) en tête de toutes les consignes ; questions à Basile triées
- Ancien modèle retiré ; requêtes automatiques vers 1 848 API publiques
- Routines Claude : ingénierie (2 fois par jour) et moteur de contenu (lundi)
- Appels de relance à J+7 ; agent des vitrines (maquettes publiques, brouillons, fiches)
- Jarvis : réponses brèves jamais transformées en ordres ; relance par numéro ; voix seule
