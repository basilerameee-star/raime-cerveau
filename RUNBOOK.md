# Runbook — déployer, vérifier, revenir en arrière

*Les gestes, dans l'ordre. L'état réel est décrit dans [`docs/ARCHITECTURE_CURRENT.md`](docs/ARCHITECTURE_CURRENT.md).*

## Faire un changement

1. Une branche `cloud/<sujet>` (session cloud) ou `auto/<sujet>` (cerveau).
2. `npm test` en local (voir « Lancer le banc ») : tout doit passer.
3. Une pull request qui commence par la section **« ## Pour Basile »** (cinq lignes au plus : ce qui change en ligne,
   ce qu'il pourra vendre, comment revenir en arrière) — la CI « Résumé pour Basile » la vérifie.
4. CI verte avant toute fusion sur `main`. Pour les changements ordinaires, accord de Basile ; pour la surface
   autonome décrite ci-dessous, l'autorisation permanente de Basile du 11/10/2026 remplace cet accord à chaque passage.
   Jamais une pull request rouge, jamais un élargissement automatique des droits.

## Boucle autonome autorisée (11/10/2026)

Le Directeur constate un besoin mesuré, Hermes prépare une proposition via MCP `amelioration_proposer`.
Chaque jour, « Amélioration autonome » compare le classement avant/après, exécute le banc complet deux fois dans
un conteneur sans Internet, secrets ou accès à la production, puis avance `main` et demande explicitement « Livraison ».
Il n'y a pas d'accord humain entre le banc réussi et cette livraison. La porte conserve son retour arrière automatique.

Cette première surface est **uniquement** `agents/ameliorables/classement.expr` : du code arithmétique interprété,
sur les six notes de recherche. Le programme peut choisir ses calculs ; il ne peut pas exécuter JavaScript, installer
une dépendance, lire un secret, modifier une autorisation ou changer les tests. Constitution, garde-fous, budget,
envois, paiements, infrastructure et workflows restent hors de cette surface. Les autres pannes gardent leur
diagnostic et leur chantier d'ingénierie : elles ne sont pas couvertes par cette première livraison autonome.

Un gain strict sur des cas figés, aucune régression sur les cas déjà réussis, maintien de chaque critère, empreinte
de la formule inchangée, issue inchangée et `main` inchangé sont exigés. Un seul essai traité par 24 heures.
L'historique garde une PR et le journal d'Actions. Les protections GitHub ne sont jamais contournées ; si elles
interdisent l'écriture de l'action sur `main` ou la création de PR, l'action échoue sans promotion.

Arrêt : désactiver « Amélioration autonome » dans Actions. Retour : Revert de sa PR, ou le geste d'urgence ci-dessous.
Les tests prouvent le résultat sur le banc, pas un gain commercial ni l'absence de tout bug futur.

## Déployer

**Automatique** : chaque fusion sur `main` lance l'action « Livraison » (banc, puis envoi par la porte).
Suivre : GitHub → Actions → Livraison. Le résumé de l'étape « Vérifier depuis l'extérieur » donne les adresses en ligne.

**À la main** (même chemin) : GitHub → Actions → Livraison → *Run workflow* sur `main`.

**Secours**, si la porte est hors service : `./deploy.sh <fichiers…>` depuis l'ordinateur de Basile (accès root,
essai sur le serveur, retour arrière si l'essai échoue).

## Mettre un service en ligne (atelier)

```bash
node atelier/atelier.js "un site pour vendre … à 24 €" [--demonstration]
# → services/<nom>/ (site, Dockerfile, service.conf) si les 8 contrôles passent
```
Puis une pull request avec `services/<nom>/` ; à la fusion, la porte lance le conteneur et le bloc Caddy
`<nom>.raime.fr`, et vérifie que la page contient le texte de `service.conf`.
Sans `STRIPE_CLE_TEST` ou sans prix, la page propose « Demander un devis ».

## Vérifier

```bash
ssh -i ./porte_github root@2.29.6.94 etat                        # version en service et précédente
ssh -i ~/.ssh/raime_vps root@2.29.6.94 'tail -n 30 /opt/raime/porte/journal.log'
```
```sql
SELECT agent, count(*), max(created_at) FROM agent_runs WHERE created_at > now() - interval '48 hours' GROUP BY 1 ORDER BY 3 DESC;
SELECT acteur, changement, motif, created_at FROM journal ORDER BY created_at DESC LIMIT 20;
```

## Revenir en arrière

| Situation | Geste |
|---|---|
| La nouvelle version ne passe pas sa vérification | rien : la porte remet seule la précédente (code 3) et le carnet reçoit une ligne |
| Une version en ligne déplaît | « Revert » de la pull request sur GitHub : la fusion du revert redéploie l'ancienne |
| Urgence, sans attendre GitHub | `ssh -i ./porte_github root@2.29.6.94 revenir` |
| Revenir avant le tout premier passage par la porte | `revenir` jusqu'à la version « initiale » (photographiée au premier passage) |
| Un service à retirer | supprimer `services/<nom>/` dans une pull request : la porte retire le conteneur et le bloc Caddy |

## Lancer le banc d'essai en local

```bash
# Postgres 16 local, un rôle qui peut créer des bases (ici « raime »)
export PGHOST=localhost PGUSER=raime PGPASSWORD=…
npm ci && npm test          # recrée raime_brain_test et n8n_test, puis tous les tests
```
Aucune clé, aucun réseau : le modèle est factice, `fetch` est coupé. Une consigne sans fixture fait échouer le test.

## Les secrets à poser (une fois)

Voir [`porte/INSTALLER.md`](porte/INSTALLER.md) : la porte, **sans aucun secret** — GitHub signe chaque livraison (1),
Caddy (2), DNS `*.raime.fr` (3), premier envoi (4), jeton des chantiers (5), moteur SearXNG (6). Pour l'atelier : une clé Stripe **restreinte de test**
(`rk_test_…`, écriture sur produits, prix, liens de paiement) dans le secret GitHub et le `.env` : `STRIPE_CLE_TEST`.

## Mise en service autonome (25/09/2026)

