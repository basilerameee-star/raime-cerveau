---
name: agent
description: Ajouter, modifier, réveiller ou arrêter un agent du cerveau rAIme — anatomie d'un agent (lib.js, routage de modèle, journal), rythme dans la boucle, déploiement sur le serveur, vérification. À utiliser dès qu'une tâche doit tourner seule, à heure fixe ou en continu, pour rAIme.
---

# Ajouter ou modifier un agent

Un agent rAIme est un module JavaScript qui fait **une** chose, laisse une trace, et coûte peu.

## Anatomie

```js
// agents/exemple.js
import { db, appeler, tracer } from './lib.js';

export async function exemple({ brain, n8n }) {
  const { rows } = await brain.query(`SELECT ... LIMIT 50`);
  const reponse = await appeler('extraction', [{ role: 'user', content: '...' }]);
  await brain.query(`INSERT INTO journal(acteur, changement, motif) VALUES($1,$2,$3)`,
    ['exemple', 'ce qui a changé', 'pourquoi']);
}
```

- `lib.js` porte le socle : connexion base, appel modèle, traçabilité.
- **Le modèle se choisit par tâche**, jamais par nom en dur : `extraction`, `raisonnement`, `contradiction`, `redaction` (table `ROUTER` de `lib.js`). Les prix viennent du catalogue synchronisé, jamais d'une copie figée.
- Un agent qui juge écrit **pourquoi** dans `journal`. Un agent muet est un agent qu'on retire.

## Lui donner un rythme

Dans `agents/boucle.js`, table `RYTHMES` :

```js
{ nom: 'exemple', module: './exemple.js', fn: 'exemple', toutes: 6 * H, besoinN8n: false },
```

Règle de rythme : plus la donnée bouge vite, plus le passage est fréquent. Une heure pour ce qui part vers un client, six heures pour la veille, une semaine pour la prospective.

## Déployer

```bash
# 1. le fichier part sur le serveur (le dossier est monté en direct dans le conteneur)
scp -i ~/.ssh/raime_vps agents/exemple.js root@2.29.6.94:/opt/raime/raime-brain/agents/

# 2. un essai isolé, hors boucle
ssh -i ~/.ssh/raime_vps root@2.29.6.94 '/opt/raime/raime-brain/run.sh "node agents/exemple.js"'

# 3. si boucle.js a changé, la boucle redémarre ; sinon elle prend le nouveau code au prochain passage
ssh -i ~/.ssh/raime_vps root@2.29.6.94 'docker restart raime-boucle && sleep 5 && docker logs --tail 20 raime-boucle'
```

`run.sh` lit le mot de passe Postgres dans le conteneur et la clé OpenRouter dans `.env` : **aucun secret ne s'écrit dans le code ni dans un message**.

## Vérifier qu'il vit

```sql
SELECT agent, count(*), max(started_at) FROM agent_runs
WHERE started_at > now() - interval '48 hours' GROUP BY 1 ORDER BY 3 DESC;
```

Et la trace des décisions : `SELECT * FROM journal ORDER BY created_at DESC LIMIT 20;`

## Réveiller un agent endormi

`auditeur`, `analyste`, `annuaire`, `cartographe`, `contradicteur`, `garde_audit`, `mission`, `redacteur`, `reflexif`, `score` existent et attendent un rythme. Avant de réveiller : lancer l'agent une fois à la main, lire ce qu'il écrit, mesurer son coût, puis l'inscrire dans `RYTHMES`.

## Garde-fous

- Un nouvel agent tourne d'abord **à blanc** : il écrit ce qu'il ferait, sans le faire.
- Tout ce qui part vers l'extérieur (e-mail, publication, message) passe par le `cordon` et par l'accord de Basile.
- Le cerveau dépense au plus **16 €/mois** de modèles, le prix du serveur. Un agent gourmand se règle ou s'arrête.
- Un agent en échec écrit dans `journal` et la boucle continue : la firme survit à ses agents.

Compétences liées : `cerveau`, `souverainete`, `evolution`.
