# demande-8 — Lovable et l'usine à services rAIme

Réponse à la demande de Basile : « aller chercher le code source de Lovable,
l'installer et le faire tourner, pour créer des applications de services ».

## Le constat (l'essentiel)
**Lovable (lovable.dev) n'a pas de code source public** : c'est un service propriétaire.
On ne peut ni le « récupérer » ni l'« installer ». Son **ancêtre open source officiel**
existe et est installé ici : **gpt-engineer** (AntonOsika/gpt-engineer), écrit par le
fondateur de Lovable. Les clones « style Lovable » les plus vivants sont aussi clonés.

## Contenu
| Chemin | Quoi |
|---|---|
| `app/index.html` | **L'app web livrée** : constat, équivalents GitHub, et une fabrique de services **qui marche ici sans clé externe** (décrivez un service → génère la page de vente dans le navigateur). Statique, chemins relatifs. |
| `sources/gpt-engineer/` | L'ancêtre officiel de Lovable (MIT, Python), cloné. |
| `sources/open-lovable/` | Clone Lovable (firecrawl) cloné — exige clés Firecrawl/IA/sandbox. |
| `sources/Adorable/` | « Open Source Lovable » (freestyle) cloné — exige clés Freestyle/IA. |
| `.venv/` | L'environnement Python où `gpt-engineer` est **installé** (voir Run). |
| `cerveau/` | Le code du cerveau rAIme copié, **amélioré et testé** (dépôt git). |
| `changement.diff` | L'amélioration + le **résultat des tests** (`node tests/cas_figes_*.mjs`). |

## Run
- **L'app web** : ouvrez `app/index.html` dans un navigateur (ou servez le dossier `app/`).
- **gpt-engineer (ancêtre de Lovable)** : `demande-8/.venv/bin/gpte <dossier-projet>`
  avec un fichier `prompt` dedans. La génération réelle exige une clé OpenAI/Anthropic
  (non fournie : consigne « jamais de clé dans le livrable »).
- **Tests du cerveau** : dans `cerveau/`, `node tests/cas_figes_atelier_slug.mjs` et
  les autres `cas_figes_*.mjs`. Bonus : `node --test tests/banc/atelier.test.mjs` (19/19).

## Amélioration du cerveau (demande-8/cerveau, + changement.diff)
Le sous-domaine `.raime.fr` d'un service (slugify) était une copie inline dans
`atelier/brief.js`. Il vit désormais dans `atelier/slug.js`, module unique testé par
`tests/cas_figes_atelier_slug.mjs`. **Aucun changement de comportement** : 11/11 cas
figés exécutables OK (+ 1 nouveau, 12 verts) et 19/19 tests du banc atelier OK
(`cas_figes_heraut.mjs` seul exige PostgreSQL, absent de ce bac à sable — limite
identique sur l'original).

Aucune clé ni mot de passe ne figure dans ce livrable (seul `.env.example` de
`cerveau/` est suivi, avec des placeholders).