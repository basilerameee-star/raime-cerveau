# Carnet du cerveau rAIme

*La mémoire des sessions de travail sur ce dépôt. Une entrée par sous-tâche, la plus récente en bas. On lit tout au démarrage, on ajoute à la fin, on ne réécrit jamais une entrée passée.*

Format d'une entrée :

```
## AAAA-MM-JJ — <chantier> — <sous-tâche>
- Action :
- Résultat :
- Évaluation : (écart entre l'attendu et l'obtenu)
- Correction :
- Leçon :
```

---

## Leçons déjà apprises (sessions locales, 23 septembre 2026)

- **Mesurer d'abord.** Le héraut échouait trois fois sur quatre : on accusait sa consigne, la mesure a trouvé trois autres causes. Réparé, il est passé de 0 message conforme sur 3 à 3 sur 3, pour cinq fois moins cher.
- **Un modèle qui raisonne peut rendre une réponse vide.** `deepseek-v4-flash` dépensait tout son budget à réfléchir et renvoyait zéro caractère (`finish_reason: length`). `lib.js` coupe désormais le raisonnement pour la rédaction et rejoue toute réponse vide.
- **Une consigne et un contrôle peuvent se contredire.** La consigne interdisait la question de clôture pendant que le code en exigeait une : trois messages sur quatre refusés à tort.
- **Un garde-fou peut refuser le juste.** « Madame, Monsieur, » était pris pour une civilité devinée ; « transport routier » pour une faute sur « Transports Vallet ».
- **Les modèles « gratuits » du catalogue sont peu fiables** : 404 (plus gratuits), 429 (bridés), ou hors format. Mesurer avant d'y croire.
- **Chercher l'existant avant de créer.** Un ménage a retiré 14 flux en double sur 34 ; une collecte déjà faite a failli être refaite.
- **La recherche doit lire les titres.** L'architecte cherchait « Carte commerciale » et recevait de la documentation technique : le titre n'était pas indexé. Corrigé (migration `018`).
- **Une donnée technique en masse noie la maison.** 1 564 morceaux de documentation anglaise écrasaient les notes commerciales ; la recherche passe désormais d'abord par les domaines de la maison.
- **Ce qui manque vraiment** (constat de l'architecte, rejoint par Basile) : rien ne décrit encore **qui viser, quel message, quelle promesse** pour la prospection. Question posée à Basile, en attente.
