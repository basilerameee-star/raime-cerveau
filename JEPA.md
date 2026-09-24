# Un modèle du monde pour le cerveau (type JEPA)

*Voulu par Basile le 25 septembre 2026 : « il y a un intérêt de mettre un modèle JEPA tout de suite ».*

## L'idée

La famille JEPA (Yann LeCun, Meta) — images, vidéo, son, texte, actions de robot — apprend à
**prédire la conséquence d'une action dans une représentation abstraite**, plutôt que de tout
redessiner. Pour un cerveau qui agit seul, c'est la pièce qui manque : savoir, avant d'agir,
ce qui va probablement arriver, et mesurer après coup à quel point il s'est trompé.

## Ce qui existe déjà

- `etats` (l'architecte) : pour chaque action, ce qui était **attendu**, la probabilité d'échec
  estimée, le **résultat** et l'**écart**. C'est déjà une mémoire de prédictions.
- `experiences` (depuis le 25/09/2026, `agents/experience.js`) : pour chaque passage de chaque
  agent, la situation **avant**, l'**action**, la situation **après**, le résultat.

## Les trois étapes

1. **Amasser** (en place) : chaque passage de la boucle devient un exemple
   (avant, action, après, résultat). Aucune donnée personnelle : des comptages.
2. **Apprendre** (quand il y aura quelques milliers d'exemples, soit quelques semaines) :
   - un encodeur de texte léger, multilingue, qui tourne sur le processeur du serveur, place
     les situations et les actions dans un même espace ;
   - un petit prédicteur, à la manière de JEPA, apprend à passer de (avant, action) à
     l'empreinte de (après) ; l'erreur se mesure dans cet espace, pas sur les mots ;
   - entraînement sur le serveur actuel : pas de carte graphique nécessaire à cette taille.
3. **Servir** : avant chaque action proposée, l'architecte demande au prédicteur ce qui va
   arriver et le compare à sa propre estimation.

## La règle d'adoption (Constitution : mesurer avant de changer)

Le prédicteur n'est consulté pour décider que s'il prédit **mieux** que l'estimation actuelle
de l'architecte, sur des exemples qu'il n'a jamais vus. Chiffre avant, chiffre après.
Sinon, il reste en observation et continue d'apprendre.

## Ce qu'on ne promet pas

Pas de projection 3D : les actions du cerveau sont des dossiers, des pages, des messages, des
mesures. Pas de garantie de résultat : c'est un chantier de recherche, piloté par la mesure.

Suivi : but « Apprendre à prédire la conséquence de ses actes avant d'agir » (table `buts`),
mesuré par l'écart moyen entre attendu et obtenu, mois après mois.
