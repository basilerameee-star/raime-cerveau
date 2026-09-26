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
- **Qwen Image** (Apache 2.0) : images, affiches, visuels de publicité.
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

## 5. Règles de rAIme pour les images et vidéos

- Aucune personne réelle reconnaissable, aucun logo ou marque d'un tiers, aucune voix clonée sans accord écrit.
- Textes à l'écran : aucun « je », aucune tournure négative, aucune mention du CPF.

## 6. Apprendre

À la fin de chaque vidéo réussie, ajoute une ligne au journal ci-dessous : modèle, résolution, durée,
pas, temps de calcul, verdict. La fois suivante, repars du meilleur réglage noté. Si un réglage
échoue (mémoire pleine, résultat flou), note-le aussi : c'est ce qui évite de le refaire.

## Journal des essais

| Date | Modèle | Résolution | Durée | Pas | Temps | Verdict |
|---|---|---|---|---|---|---|
