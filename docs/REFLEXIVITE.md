# Contrat de la boucle réflexive

Une panne → événement durable → recherche sourcée → atelier Hermes → proposition d'outil →
tests amont et cas métier dans la sandbox → registre livré → utilisation isolée → passage réel vérifié.

Le déclencheur local est transactionnel (trigger et NOTIFY Postgres), sans exposer une nouvelle route publique.
Le webhook GitHub `issues.opened` déclenche immédiatement les essais distants. Les deux files ont un
rattrapage périodique. Un crash n'efface pas le besoin ; une attente, un refus ou une sortie manquante ne
devient jamais « terminé » par défaut.

Exemple de proposition (remplacer le commit par un SHA réel ; ceci n'est pas exécuté) :

```json
{
  "version": 1,
  "id": "extracteur-json",
  "repo": "organisation/outil",
  "commit": "0000000000000000000000000000000000000000",
  "langage": "python",
  "entree": "bin/cli.py",
  "arguments": ["champ"],
  "besoin": "Extraire un champ des résultats publics de recherche",
  "cas": [
    {"entree": {"champ": 1}, "attendu": 1},
    {"entree": {"champ": "texte"}, "attendu": "texte"},
    {"entree": {"champ": [1, 2]}, "attendu": [1, 2]}
  ]
}
```

Tous les appels d'outil sont asynchrones : ouvrir, suivre, attendre la livraison du registre, exécuter,
suivre le résultat. La sortie est une donnée ; elle n'autorise aucune action extérieure et ne doit pas
être réinterprétée comme une instruction. Les secrets et données personnelles ne passent pas par cette file.

Le gain initial est une capacité vérifiée auparavant indisponible, pas une affirmation générale de progrès.
Un nouvel identifiant est exigé pour une version différente. La provenance, le commit, les cas, l'image
Docker réellement utilisée et les preuves restent attachés au registre et à l'issue.

Limites explicites : Node avec dépendances npm verrouillées sans hook ; Python sans dépendance tierce ;
CLI stdin/stdout JSON ; dépôt public ≤ 600 fichiers et 5 Mo, sans liens ni sous-modules. Ces limites
permettent une adoption sans privilège supplémentaire. Les outils réseau, les logiciels système et les
modifications arbitraires du cœur ne passent pas par ce contrat. Le contrôleur lui-même ne s'auto-modifie pas.

Les tests figés attestent les cas connus. La santé de production atteste le service reçu ; elle ne prouve
pas tous les comportements futurs. La mémoire d'expérience s'enrichit ; cela n'est pas un entraînement
des poids du modèle. Un événement non résolu garde son état et sa raison.
