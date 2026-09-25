# La bibliothèque universelle — sources légales

*Voulue par Basile le 25/09/2026 : « dans toutes les langues du monde, tous les livres religieux, ésotériques, de médecine, les sources du FBI, de la CIA, de la BRI… le but, c'est qu'il comprenne le monde ». Règle d'entrée de la Constitution v2 : seulement ce qui est publié légalement.*

## La règle
- **Texte intégral** : domaine public, licence libre (CC0, CC BY, etc.), publication officielle, archive déclassifiée.
- **Sous droits d'auteur** (presse, livres récents, articles payants) : le titre, le lien et un résumé court de notre main, jamais le texte.
- **Chaque passage garde** sa source, sa date, sa langue, sa licence, et son rang de fiabilité (1 officiel ou revu par des pairs · 2 référence reconnue · 3 témoignage ou tradition).
- Un texte religieux ou ésotérique est rangé comme **tradition** : il éclaire ce que les hommes croient et pensent, il ne prouve jamais un fait physique.

## Les sources, par domaine

| Domaine | Source | Accès | Licence | Langues |
|---|---|---|---|---|
| Religions | Project Gutenberg (Bible Segond 1910, King James, Coran trad. Kasimirski, Bhagavad-Gita, Tao Te King, Dhammapada…) | téléchargement par numéro | domaine public (vérifié par œuvre) | toutes |
| Religions | Wikisource (textes sacrés et commentaires anciens) | API MediaWiki | domaine public, CC BY-SA | toutes |
| Ésotérisme | Gutenberg, Wikisource (Corpus Hermeticum trad. Ménard 1866, Kybalion 1908, Swedenborg, Papus…) | idem | domaine public (auteur mort depuis plus de 70 ans) | FR, EN, DE, LA |
| Médecine | Europe PMC / PubMed Central, sous-ensemble en libre accès | API REST | CC BY et assimilées (vérifiée par article) | EN surtout |
| Médecine | Organisation mondiale de la santé (IRIS), Haute Autorité de santé, Santé publique France | téléchargement | publications officielles (CC BY-NC-SA pour l'OMS : usage interne seulement) | FR, EN, multiples |
| Renseignement | CIA : annuaire mondial des pays, salle de lecture des documents déclassifiés (FOIA) | téléchargement | domaine public (gouvernement fédéral américain) | EN |
| Renseignement | FBI : archives publiques (FBI Vault, FOIA) | téléchargement | domaine public | EN |
| Finance | Banque des règlements internationaux (BRI) : rapport économique annuel, revue trimestrielle, documents de travail, statistiques | téléchargement, portail de données | publications officielles (citation obligatoire) | EN, FR, DE, ES… |
| Finance | Banque centrale européenne, Banque de France (Webstat), FMI, Banque mondiale, OCDE, Eurostat | API de données | données ouvertes (CC BY pour la Banque mondiale) | multiples |
| Économie | Insee (séries et publications) | API | licence ouverte Etalab | FR |
| Sciences | arXiv (déjà relié), OpenAlex (métadonnées de toute la recherche) | API | CC BY / CC0 | toutes |
| Droit | Légifrance, EUR-Lex | API (inscription gratuite pour Légifrance) | données publiques | FR, langues de l'UE |
| Documents mondiaux | Bibliothèque numérique des Nations unies | téléchargement | documents officiels | 6 langues de l'ONU |
| Actualité | GDELT (événements mondiaux), fils des agences | API | ouvert (GDELT) ; presse : titres et liens seulement | toutes |

## Comment elles entrent
1. **Le registre** (`sources.json`, à écrire) : une ligne par source, avec son adresse, sa licence, sa langue, son rythme et sa part du budget.
2. **Le rapatrieur** (agent à écrire) : chaque nuit, un lot borné par source (par exemple 20 documents), déposé dans `bibliotheque/<domaine>/` avec son en-tête (source, date, langue, licence, fiabilité). Il refuse tout document dont la licence n'est pas vérifiée.
3. **Le bibliothécaire** (en service) : il avale ces dossiers toutes les 12 heures, découpe en passages et rend la recherche possible en français.
4. **La langue** : les passages gardent leur langue d'origine. La recherche passe par des représentations multilingues, et la réponse se fait en français.
5. **Le coût** : le rapatriement ne coûte rien (téléchargement). Le découpage et la recherche tournent sur le serveur. Seule la pensée de la nuit appelle un modèle (environ 1 centime par nuit mesuré le 25/09).

## Ce qu'elle permet
- **Le penseur** relie ce qu'il voit la nuit à ce que la bibliothèque sait (finance, santé, technologie, traditions).
- **Les prédictions** s'appuient sur des séries officielles (BRI, BCE, FMI, OMS) et sont notées à leur échéance.
- **Cortex et Jarvis** répondent en citant des sources vérifiables.
