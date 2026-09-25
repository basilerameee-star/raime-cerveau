# demande-9 — Mes courses par note vocale (rAIme)

Réponse à la demande de Basile : « Crée-moi une application pour enregistrer mes
courses à partir de notes vocales, sans avoir à ouvrir l'application. »

## L'app livrée — comment marche

Une **page web unique et entièrement statique** : `app/index.html`. Elle tourne **dans
votre navigateur**, sans clé, sans serveur, sans compte :

- **Dictée** : bouton 🎤 (reconnaissance vocale du navigateur / micro du clavier)
  ou champ texte. Dites votre séance comme vous la raconteriez :
  « j'ai couru 10 km en 54 minutes hier soir, super, note 8 ».
- **Extraction** : la phrase est lue et le formulaire se remplit tout seul
  (type, distance, unité km/m, durée, allure min/km calculée, date, ressenti, note 1-10).
- **Enregistrement** : un appui sur « Enregistrer la course ». Le carnet reste **chez vous**,
  en localStorage, avec totaux (courses, km, temps, répartition) et **export CSV / JSON**
  (régulièrement, pour garder vos données).

### Comment l'utiliser au quotidien (« sans ouvrir l'application »)
1. **Raccourci écran d'accueil (le plus simple)** : sur le téléphone, menu ⋯ du navigateur →
   *Ajouter à l'écran d'accueil / Installer l'application*. Une icône « Mes courses » apparaît :
   **un appui** ouvre directement la dictée. Aucune navigation.
2. **Micro** : sur mobile, appuyez sur 🎤 (ou le micro du clavier), parlez
   « huit kilomètres en cinquante minutes hier soir » → la phrase est écrite puis analysée.
3. **Favori pré-rempli** : un raccourci du type `index.html?dist=10&duree=54&type=course%20a%20pied`
   ouvre un formulaire déjà rempli — il ne reste qu'à valider.

Données **100 % locales** : rien n'est envoyé ni stocké en ligne. Pour suivre dans le temps,
exportez en CSV (ouvrable dans Excel / LibreOffice) ou en JSON.

## Contenu
| Chemin | Quoi |
|---|---|
| `app/index.html` | **L'app livrée** — statique, chemins relatifs (ouvrir dans un navigateur ou servir le dossier `app/`). |
| `cerveau/` | Le code du cerveau rAIme copié, **amélioré et testé** (dépôt git, branche propre à 2 ajouts). |
| `changement.diff` | L'amélioration + le **résultat des tests** (`node tests/cas_figes_*.mjs`). |
| `tests_coherence.mjs` | Banc : le `parseCourse` de l'app == `extraireCourse` du cerveau, 21/21. |
| `tests_flow.mjs` | Banc : flux complet analyse → enregistrement → dossier (sans navigateur). |

## Run
- **L'app** : ouvrez `app/index.html` dans un navigateur (Chrome/Edge/Safari/Firefox récents).
- **L'extraction du cerveau, testée** : dans `cerveau/`, `node atelier/course.js "j'ai couru 10 km en 54 minutes"`.
- **Les bancs** : `node tests/cas_figes_course.mjs`, puis `node ../tests_coherence.mjs`
  et `node ../tests_flow.mjs` depuis `demande-9/`.

## Amélioration du cerveau (demande-9/cerveau, + changement.diff)
Le cerveau gagne une capacité, jugée par le code et verrouillée par cas figés :
**lire une note vocale de sport et en tirer une course structurée** (type, distance,
durée, allure, date, ressenti, note). Rien ne s'invente (Règle 4) : une quantité ne vaut
que si la phrase porte son unité, l'allure ne se calcule que si distance ET durée sont
dites, la date est celle que dit la phrase (sinon « maintenant »). Aucun test existant
n'a été modifié — ajout sans régression : **13/13 cas figés exécutables OK** (41 nouveaux
pour la course) ; `cas_figes_heraut.mjs` exige PostgreSQL, absent de ce bac à sable
(limite identique sur l'original `/cerveau`).

Aucune clé ni mot de passe dans ce livrable.