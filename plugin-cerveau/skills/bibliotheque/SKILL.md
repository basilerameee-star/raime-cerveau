---
name: bibliotheque
description: La mémoire longue de rAIme — déposer des connaissances (notes, offres, sources, documents de métier, droit, santé, sciences) et les retrouver par le sens des mots, dans Postgres, sans appeler de fournisseur. À utiliser pour nourrir le cerveau, répondre depuis ses propres connaissances, ou préparer un audit, une formation, un argumentaire.
---

# La bibliothèque du cerveau

Une seule règle : **ce qui compte entre dans la bibliothèque**. Le reste s'oublie.

## Comment ça marche

- Les fichiers déposés dans `/opt/raime/raime-brain/bibliotheque/<domaine>/` sont avalés deux fois par jour par l'agent `bibliothecaire`.
- Formats lus : `.md`, `.txt`, `.csv`, `.json` (moins de 4 Mo par fichier).
- Chaque texte est découpé en morceaux de 1 400 caractères, aux frontières de paragraphe, avec un recouvrement : une idée reste entière.
- La recherche se fait dans Postgres, en français (racines, accents, pluriels). **Aucun appel extérieur, aucune dépense.** Une sauvegarde suffit à déplacer la bibliothèque ailleurs.
- Le nom du premier dossier devient le **domaine** : `notes`, `offre`, `cerveau`, et demain `droit`, `sante`, `sciences`, `finance`.

## Déposer

```bash
scp -i ~/.ssh/raime_vps -r <dossier>/. root@2.29.6.94:/opt/raime/raime-brain/bibliotheque/<domaine>/
ssh -i ~/.ssh/raime_vps root@2.29.6.94 '/opt/raime/raime-brain/run.sh "node agents/bibliothecaire.js ranger"'
```

Un même passage déposé deux fois occupe une seule place : l'empreinte l'empêche de doubler.

## Chercher

```bash
ssh -i ~/.ssh/raime_vps root@2.29.6.94 '/opt/raime/raime-brain/run.sh "node agents/bibliothecaire.js chercher \"votre question\""'
```

Depuis un agent :

```js
import { chercher } from './bibliothecaire.js';
const passages = await chercher({ brain, question: 'tarif audit PME', combien: 5, domaine: 'notes' });
```

La recherche passe en deux temps : les passages qui portent **tous** les mots, puis ceux qui en portent **quelques-uns**. Une question longue trouve toujours de quoi répondre.

## Ce qu'il faut y mettre

Les notes de la maison, l'offre et ses prix, les sources d'étude, la méthode d'audit, les comptes rendus de mission, les textes de droit utiles, et tout domaine que Basile veut garder souverain. Un document utile dans un an mérite sa place ; un brouillon du jour, non.

## Ce qu'il ne faut jamais y mettre

Une clé, un mot de passe, une pièce d'identité, un relevé bancaire complet, les données personnelles d'un client sans motif.

## À surveiller

`SELECT domaine, count(*) FROM kb_chunks GROUP BY 1 ORDER BY 2 DESC;` — une bibliothèque qui ne grossit plus est une bibliothèque qu'on a cessé de nourrir.

Compétences liées : `cerveau`, `agent`, `souverainete`.
