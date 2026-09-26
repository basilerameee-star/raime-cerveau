---
name: video-wangp
description: Créer une vidéo (ou une image, une musique) sur le PC de Basile avec WanGP (Wan2GP, RTX 3060 12 Go), par son serveur MCP local. À utiliser dès qu'une demande parle de vidéo, clip, animation, publicité animée, image générée ou bande-son.
version: 1.0.0
metadata:
  hermes:
    tags: [video, image, audio, wangp, local, gratuit]
---

# Vidéo avec WanGP, sur le PC de Basile

WanGP (github.com/deepbeepmeep/Wan2GP) tourne sur le PC de Basile (RTX 3060, 12 Go de mémoire vidéo).
Il sert un serveur MCP : tu le pilotes par ses outils, sans cliquer dans son interface. Rien ne sort
du PC, rien ne se paie.

## 1. Joindre WanGP

- Adresse MCP : `http://127.0.0.1:7866/mcp` ; si tu tournes dans Docker : `http://host.docker.internal:7866/mcp`.
- Si aucune ne répond : WanGP n'est pas lancé en mode Hermes. Ne le lance pas toi-même, ne l'installe
  pas : dis à Basile en une phrase de double-cliquer `lancer_wangp_hermes.bat` (hermes/INSTALLER.md, étape 6).
- API v2 (par défaut) : un outil sans `action` liste ses actions ; une `action` sans `arguments` donne
  son contrat ; `arguments` l'exécute. Lis d'abord la ressource `wangp://guides/workflows`.

## 2. Choisir le modèle — licence d'abord

Autorisés (licence ouverte, usage commercial en France) :
- **Wan 2.1 / 2.2** (Apache 2.0) : texte → vidéo, image → vidéo. Premier choix.
- **Qwen Image** (Apache 2.0) : images, affiches, visuels de publicité, et le visage de l'avatar.
- **InfiniteTalk** (Apache 2.0, MeiGen-AI) : un visage + une voix → une personne qui parle face caméra,
  longues vidéos. Premier choix pour l'influenceur.
- **MultiTalk** (Apache 2.0) : deux personnes qui se parlent.
- **LongCat Avatar 1.5** (MIT, Meituan) : avatar animé par la voix, autre choix à comparer.
- **Wan 2.2 Animate 2** (Apache 2.0) : l'avatar reprend les gestes d'une vidéo modèle.
- **LTX-2.5** (licence communautaire LTX-2.x : gratuite sous 10 M$ de chiffre d'affaires annuel, ce qui
  est le cas de rAIme ; au-delà, licence payante) : vidéo et son synchronisés en une passe.
  (Licences lues à la source le 26/09/2026.)
- Tout autre modèle : lis sa licence sur sa page officielle AVANT le premier usage, et note le verdict
  dans la section « Journal des essais » ci-dessous. Sans verdict écrit, tu ne l'utilises pas.

Interdits :
- **MiniMax H3 / Hailuo 3** : sa licence exclut l'Union européenne. rAIme est en France : jamais.
- Tout modèle dont la licence exclut l'UE, la France ou l'usage commercial.

## 3. Réglages sûrs pour 12 Go

- `wangp_models` / `search` pour trouver le `model_type` exact ; `wangp_model` / `capabilities` puis
  `defaults` avant de générer. Pars des défauts, change le moins possible.
- Commence petit : 480p, 3 à 5 secondes (`video_length: "5s"`). Monte seulement si l'essai est bon.
- Préfère un profil « LoRA accélérateur » (4 à 8 pas) quand le modèle en propose un : moins de temps GPU.
- Une vidéo à la fois : la carte n'en porte pas deux.

## 4. Générer, vérifier, livrer

1. `wangp_generate` / `generate` avec les réglages ; la v2 attend la fin (`wait` vrai par défaut).
2. Vérifie le résultat : fichier présent, durée et résolution attendues (`wangp_io` / `info`).
3. Livre le chemin du fichier et les réglages utilisés, en une ligne chacun.
4. Rien ne se publie : une vidéo pour Facebook, Instagram ou TikTok reste un brouillon jusqu'au « ok » de Basile.

## 5. L'influenceur IA de rAIme (demande de Basile, 26/09/2026)

Un personnage inventé, reconnaissable, ludique, qui parle des nouveautés de l'IA, filmé « depuis sa
caméra », dans sa chambre, au format vertical (9:16).
1. **Le personnage** : une fiche fixe (nom, âge apparent, style, décor de la chambre, tics de langage)
   rangée dans ta mémoire ; un visage créé avec Qwen Image, JAMAIS celui d'une personne réelle ; garde
   l'image de référence et réutilise-la à chaque vidéo (même visage, même chambre).
2. **Le texte** : 30 à 60 s, une accroche dans les 2 premières secondes, une nouveauté vérifiée et sourcée,
   une chute. Ton ludique ; rien d'inventé.
3. **La voix** : un modèle de voix de WanGP dont la licence est vérifiée et notée ci-dessous ; toujours la
   même voix pour le personnage.
4. **L'image qui parle** : InfiniteTalk (visage de référence + voix), 480p d'abord ; monter si l'essai est bon.
5. **Finition** : sous-titres incrustés, format 9:16, mention « personnage créé par IA » (obligatoire sur
   TikTok et Instagram).
6. **Brouillon seulement** : la vidéo et sa légende partent à Basile pour son « ok » ; rien ne se publie seul.

## 6. Règles de rAIme pour les images et vidéos

- Aucune personne réelle reconnaissable, aucun logo ou marque d'un tiers, aucune voix clonée sans accord écrit.
- Textes à l'écran : aucun « je », aucune tournure négative, aucune mention du CPF.

## 7. Apprendre

À la fin de chaque vidéo réussie, ajoute une ligne au journal ci-dessous : modèle, résolution, durée,
pas, temps de calcul, verdict. La fois suivante, repars du meilleur réglage noté. Si un réglage
échoue (mémoire pleine, résultat flou), note-le aussi : c'est ce qui évite de le refaire.

## Journal des essais

| Date | Modèle | Résolution | Durée | Pas | Temps | Verdict |
|---|---|---|---|---|---|---|
