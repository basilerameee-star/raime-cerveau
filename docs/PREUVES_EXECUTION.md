# Preuve de livraison et reprise des ordres

Une réponse d'Hermes n'est pas une preuve. Le code 0 exige maintenant un contrat de fichiers et une lecture indépendante de chaque fichier dans `demande-<id>/`. Le relais relit les critères enregistrés en base et contrôle de nouveau les fichiers : un reçu ancien, modifié ou incomplet ne remplace pas ce contrôle.

Le contrat vient de l'appelant, jamais du modèle. Exemple pour `/api/dire` :

```json
{
  "message": "Crée verification.txt avec le contenu RAIME_OK",
  "verification": {
    "version": 1,
    "fichiers": [{"chemin": "verification.txt", "contient": "RAIME_OK"}]
  }
}
```

Un fichier doit être non vide, inférieur à 2 Mio, sans lien symbolique et contenu dans le dossier de la demande. Chaque critère exige un contenu attendu (`contient`) ou une empreinte SHA-256 (`sha256`). Le contrôleur ne lance jamais un script fourni par Hermes. Ces contrôles prouvent les critères déclarés, pas toutes les qualités sémantiques d'une tâche arbitraire.

Sans contrat ou si un critère échoue, le compte rendu et les fichiers sont conservés : code 2, ordre `a_faire`, destination `verification`. Il n'est pas marqué terminé, ni automatiquement relancé. La lecture de l'état expose `a_verifier`. Les critères peuvent être fournis ensuite à `POST /api/ordres/<id>/verifier` avec `{ "verification": ... }` : cela contrôle le travail déjà présent sans rappeler Hermes. Les anciennes demandes sans critères restent à vérifier ; elles ne sont pas réexécutées pour cette seule raison. La première version couvre les fichiers locaux ; réseau, opérations externes et qualité métier exigent leurs propres contrôleurs avant de pouvoir être déclarés vérifiés.

`EN_ATTENTE_OUTIL:<numéro>` reste une attente, jamais une réussite. La chaîne réflexive suit l'issue et reprend après son résultat ; elle ne clôt pas une réparation dont la livraison reste à vérifier.

Le repli local exige un refus HTTP d'accès (401/402/403/429) avant démarrage, ou un signal structuré `hermes.started=false` avec un statut d'accès. Une erreur de tâche contenant « provider », un texte mentionnant un quota ou une coupure réseau ne suffisent plus. Un démarrage inconnu conserve l'erreur, sans seconde exécution.

Après interruption du troisième bail de réparation, la file passe explicitement à `bloquee`, avec sa cause et un délai, plutôt que de rester éternellement `en_cours`. Une nouvelle panne après le délai peut la remettre en attente conformément au contrat existant.

Retour arrière : Revert de la PR puis livraison normale. La colonne JSONB `commandes.verification`, ajoutée de manière idempotente au démarrage, peut rester en place lors du retour arrière.
