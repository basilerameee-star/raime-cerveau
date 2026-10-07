## ⚠ DEPUIS LE 2026-09-25 : raime.fr est la version NOIRE — lire d'abord

- Reproduire la production :
  1. `python parcours.py --noir --prod` ;
  2. `python pages_annexes.py` (produit mentions légales, CGV, confidentialité, 404 et merci-livre, en noir et blanc) ;
  3. sauvegarder `dist/` dans `_sauvegardes/` ;
  4. copier dans `dist/` et `public/` : `index.html`, `404.html`, `mentions-legales/`, `cgv/`, `confidentialite/`, `merci-livre/` et `projets/*.webp` de `apercu-noir/` ;
  5. déployer main.
  6. recopier dans le dépôt GitHub du cerveau : `~/Projets/rAIme/cerveau/tools/site_vers_depot.sh --commit` (accord de Basile du 25/09/2026 : le site vit aussi sur GitHub, dossier `site/` du dépôt `raime-cerveau`, pour que le cerveau le lise et, plus tard, le corrige).

  Ne pas copier `_headers` : celui de `dist/` garde le noindex de `/d/*`.
- **01/10/2026** : `dist/` et `public/` contiennent `tiktokaWRVaiU1dJwRAA1Djp7CPWmwC1n26DVh.txt`, le fichier de vérification de raime.fr pour TikTok for Developers. Ne jamais le supprimer, sinon l'application TikTok perd sa vérification.
- **Aperçu privé** : `python parcours.py --noir` (sans `--prod`), puis wrangler `--branch noir` (https://noir.raime.pages.dev, en noindex). Après un build `--prod`, relancer sans `--prod` avant de redéployer l'aperçu.
- `pages_annexes.py` lit le texte légal dans `_sauvegardes/avant-noir-prod-2026-09-25/dist/`. Un texte légal se corrige sans demander quand il décrit mal la réalité (règle de Basile du 25/09/2026) ; un nouvel engagement (prix, médiateur, adresse à publier) reste sa décision.
- Le moteur de particules des versions bleue et rose est gardé dans `generateurs/particules_moteur.html` : `dist/index.html` ne le contient plus.
- Sauvegarde de la production rose : `_sauvegardes/avant-noir-prod-2026-09-25/` (dist et public).
- `CPF_ACTIF = False` : ne l'allumer que le jour où la formation est inscrite sur Mon Compte Formation.
- **Livre retiré du site le 2026-09-25** : il n'apparaît plus en noir. `merci-livre/` et `/d/` restent en ligne pour les acheteurs passés.
- **25/09/2026, EN PRODUCTION (accord de Basile)** : fond noir pur (plus de panneaux gris, de matière floue, de colonnes ni de trame ; bloc CSS « FOND NOIR PUR » dans `parcours.py`), champ de particules léger et animé derrière toutes les pages (`fond_vivant()`), textes des parties synthétisés (mêmes informations), plus d'espace. Sauvegarde d'avant : `_sauvegardes/avant-fond-pur-2026-09-25/`.
- **25/09/2026, jour / nuit — EN PRODUCTION (accord de Basile, après double vérification)** : bouton (cercle à moitié plein) à côté de la langue ; la nuit = le site d'origine, le jour = blanc et noir inversés sur fond gris clair #ededed (jamais un blanc pur ; le fond se peint sur html, jamais sur body, sinon il masque les particules), mots-clés en rose #db4f8b (plus clair que le rose papier, lisible à 3:1 au moins). La feuille jour est DÉRIVÉE automatiquement de la feuille noire par `generateurs/jour.py` (appelé après `alleger` dans `parcours.py` et dans `pages_annexes.py`) : ne jamais écrire de couleurs de jour à la main. Choix gardé dans localStorage `pc-jour`. Les pages secondaires ont aussi le bouton et le fond noir pur.
- **25/09/2026, vérification complète avant mise en ligne** : tarifs « Automatiser » = 30 % du gain annuel estimé (règle de Basile, au lieu de « sur devis ») ; sitemap au 25/09 ; ancien dossier `dist/s/` (styles de l'explorateur, plus référencé) déplacé dans `_sauvegardes/anciens-styles-s-2026-09-25/`. Sauvegarde d'avant : `_sauvegardes/avant-jour-nuit-2026-09-25/`.
- En noir, `alleger.py` élague la feuille de style de la page produite. Les variantes grises (`--nardo`, `--nardo-blanc`, `nardo.py`) sont des essais non retenus.

## Du 2026-09-21 au 2026-09-25 : le PARCOURS rose (historique)

- `dist/index.html` (et `public/index.html`) = **sortie de `_sauvegardes/generateurs/parcours.py --prod`**, et non plus de
  l'explorateur. **Ne pas relancer `construire.sh` / `theme.py` vers `dist/` : cela remettrait l'ancien site.**
- Chaîne :
  1. modifier `NOEUDS` (textes), `OUTILS` (bandeau) ou `RESEAUX` dans `parcours.py` ;
  2. lancer `python parcours.py` pour produire l'aperçu `apercu-parcours/` en noindex, qu'on déploie sur la branche `parcours` (parcours.raime.pages.dev) ;
  3. après validation de Basile, lancer `python parcours.py --prod`, sauvegarder `dist/` dans `_sauvegardes/`, copier `apercu-parcours/index.html` et les images de `projets/` dans `dist/` et `public/`, puis déployer main.
- **La production est ROSE** : la commande qui reproduit raime.fr est `python parcours.py --rose --prod` (sortie `apercu-rose/`).
  Depuis le 2026-09-25, la règle des couleurs remplace tout ce qui reste en bleu (le bas de page restait bleu) ;
  vérifier par une comparaison avec `dist/index.html` que seul le changement voulu apparaît.
- Le script lit le moteur de particules dans `dist/index.html` (`<script id="raime-particules-js">`) : la nouvelle page le contient, donc la chaîne reste autonome. `data-theme="bleu"` sur `<html>` est obligatoire, sinon les particules passent en indigo.
- Les anciennes ancres (`#formation`, `#audit`, `#contact`…) sont converties en JavaScript vers les nouvelles pages (`#/pro/formation`…). `dist/_redirects` reste valable.
- Pages légales, 404, pré-audits, `functions/` (webhook du livre) : inchangés. Sauvegarde de l'explorateur d'avant : `_sauvegardes/avant-parcours-prod-2026-09-21/`.
- **Livre (2026-09-21)** : bouton « Le livre » sous les réseaux (`LIVRE_URL` dans `parcours.py`, lien de paiement Stripe). PDF dans `dist/d/` et `public/d/`
  (fabriqué par `OneDrive/Desktop/rAIme/11_Livre_IA_pour_tous/_fabriquer.py`), page `dist/merci-livre/` copiée depuis
  `_sauvegardes/generateurs/merci-livre.html`, en-tête noindex sur `/d/*` dans `dist/_headers`. L'e-mail de `functions/stripe-webhook.js`
  exige les secrets Cloudflare `STRIPE_WEBHOOK_SECRET` et `RESEND_API_KEY`, absents au 2026-09-21.

## Historique : l'explorateur (en ligne du 2026-09-10 au 2026-09-21)

- raime.fr est une page statique : `dist/index.html` (miroir dans `public/index.html`), plus les pages
  légales `dist/{mentions-legales,cgv,confidentialite}/` et `dist/404.html`. Aucun React, aucun Astro en ligne.
- **Ne pas lancer `astro build`** : il régénérerait l'ancien site (src/pages) par-dessus la page en ligne.
- Déploiement : `npx wrangler pages deploy dist --project-name raime --branch main --commit-dirty=true`
  depuis ce dossier (le dossier `functions/` — livraison du livre via Stripe — part avec).
- Anciennes adresses redirigées : `dist/_redirects`. Ancien site et fichiers retirés : `_sauvegardes/bascule-2026-09-10/`.
- **Depuis le 2026-09-12 : en ligne = l'explorateur, déclinaison BLEUE** (fenêtres de verre à onglets, fiches lues de
  haut en bas, bandeau d'outils dans l'en-tête, fond bleu quadrillé en particules WebGL, textes sans « je » ni négatif).
  Charte : `OneDrive/Desktop/rAIme/08_Marque_Logo/Charte_graphique/` (skill Claude Code `charte-raime`).
- **`dist/` ne contient que la version compilée** (une feuille `s/*.css` par groupe de pages) ; la source non compilée est
  `source/`. Chaîne : `_sauvegardes/generateurs/construire.sh` (LISEZMOI.txt) -> `apercu-compile/`, puis
  `theme.py apercu-compile apercu-bleu-clair bleu clair` -> `apercu-bleu-clair/` (en ligne depuis le 2026-09-18 : bleu plus clair, fenêtres fines ; sans l'argument `clair`, retour à l'ancien bleu). Vérifier (contraste, tests, compilation au pixel), puis
  **copier `apercu-bleu-clair/` dans `dist/` et `public/`** (sauvegarder `dist/` avant dans `_sauvegardes/`) et déployer main.
- **En ligne depuis le 2026-09-19 : `apercu-reserver/`** (`theme.py apercu-compile apercu-reserver bleu clair`). Il contient :
  - le bouton « Réserver un échange » (agenda Google 1 h, `RESERVER` dans `explorateur.py`) ;
  - l'accueil en parcours client ;
  - la formation par public ;
  - la fenêtre **Projets** (`PROJETS` dans `contenus_fiches.py`, captures dans `source/projets/*.webp`).

  Toute reconstruction reprend ces éléments. Sauvegarde de la production d'avant : `_sauvegardes/avant-projets-prod-2026-09-19/dist`.
- Sauvegarde de l'ancien carrousel indigo : `_sauvegardes/bascule-2026-09-12/`.
- Pré-audits (`source/dossiers/`) : générés par `OneDrive/Desktop/rAIme/04_Offre_de_formation/_sources/gen_preaudit.py`.

## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)
