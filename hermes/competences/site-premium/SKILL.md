---
name: site-premium
description: Construire un site ou une application web de niveau premium (3D temps réel, parallaxe, animations au défilement, interactions fines), vérifié visuellement avant livraison. À utiliser pour toute demande de site, page, landing page, vitrine, application web ou démonstration.
version: 1.0.0
metadata:
  hermes:
    tags: [site, web, application, three.js, gsap, parallaxe, premium]
---

# Site premium, de A à Z

Le client voit le résultat, pas le code : une page moyenne est un échec. On livre fini, vérifié, beau.

## 1. Le brief, en 5 lignes (écrites dans `demande-N/brief.md`)
But du site, public, ton, 3 sections essentielles, UNE idée visuelle forte (le « moment » que l'on retient).
Si la demande nomme une marque tierce (ex. Mercedes) : c'est un **concept non officiel** — pas de logo officiel,
pas d'image protégée, mention « Concept non officiel » en pied de page ; marques citées en texte seulement.

## 2. La direction artistique
- Style demandé (cyberpunk, luxe, éditorial…) → palette de 3 couleurs + 1 accent, une ou deux polices libres
  (Google Fonts ou fichiers inclus), une grille, un rythme d'espacements (8 · 16 · 24 · 40 · 64 · 96).
- Pour rAIme : suis la compétence `charte-raime`.
- Images : générées (compétence vidéo/image si disponible), ou banques libres (Unsplash, Pexels) avec crédit ;
  jamais une image d'une personne réelle sans droit.

## 3. La technique (statique, autonome, rapide)
- Dossier `demande-N/app/` : `index.html`, `style.css`, `app.js`, `vendor/`, `img/`. Chemins RELATIFS seulement.
- Bibliothèques recopiées dans `vendor/` (pas de lien externe qui casse) : `npm pack three gsap lenis` ou
  `npm i` dans `demande-N/build/` puis copie des fichiers `build/` ou `dist/` utiles.
  - **Three.js** : la scène 3D du « moment » (héros 3D, particules, modèle, shader) — `requestAnimationFrame`,
    `devicePixelRatio` plafonné à 2, pause quand l'onglet est caché.
  - **GSAP + ScrollTrigger** : apparitions au défilement, sections épinglées, textes révélés mot à mot.
  - **Lenis** : défilement doux.
  - **Parallaxe** : couches à vitesses différentes au défilement et au mouvement de la souris.
- Accessibilité : `prefers-reduced-motion` → animations coupées, contenu intact ; contrastes AA ; textes réels
  (pas d'images de texte) ; navigation au clavier ; `alt` sur les images.
- Performance : moins de 2 Mo au premier chargement, images en WebP, polices en `woff2`, pas de blocage du rendu.

## 4. La vérification (obligatoire, avant de dire « fait »)
Avec le navigateur (outil browser d'Hermes, ou `npx playwright` en tête) :
1. ouvre `app/index.html` en 1440 × 900 et 375 × 812 ; capture chaque section (`demande-N/verif/*.png`) ;
2. **zéro erreur dans la console** ; aucun élément qui déborde ; aucun texte illisible ;
3. regarde les captures (outil vision) et note sur 10 : composition, hiérarchie, finition, effet « waouh » ;
   sous 8/10 : corrige et recommence ;
4. écris `demande-N/verif/rapport.md` : ce qui a été vérifié, les notes, ce qui a été corrigé.

## 5. La livraison
Compte rendu en 3 phrases : ce qui est fait, l'adresse
`https://cockpit.raime.fr/livrables/demande-N/app/index.html`, ce qui reste (clé, contenu à fournir).
Puis améliore cette compétence avec ce que tu as appris (un réglage qui marche, un piège évité).
