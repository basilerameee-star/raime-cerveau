---
title: Spécifications des agents rAIme — audit, comparaison, hiérarchisation
tags: [agents, audit, comparaison, scoring, specifications]
updated: 2026-09-02
---

# Spécifications des agents rAIme

> Chaque agent est défini par : **entrées → traitement → sorties → critères qualité → niveau d'autonomie → modèle recommandé**. Aucun agent ne travaille sans ces six lignes.

---

## 0. Les 3 piliers manquants

Tu pressentais juste : il en manquait trois pour faire ce que tu décris.

| # | Pilier ajouté | Pourquoi il manquait |
|---|---|---|
| ⑦ | **Référentiel marché & fournisseurs** | ② couvre les *modèles*, pas les *solutions ni les prestataires*. Or tu veux savoir « ce qui se fait de mieux sur le marché ». Sans ce pilier, aucune comparaison sérieuse n'est possible. |
| ⑧ | **Critères & préférences client** | La hiérarchisation dépend des **priorités de la direction** (coût ? souveraineté ? délai ?). Ces pondérations sont une donnée à part entière, pas une opinion de l'agent. |
| ⑨ | **Économie & valeur** | Pour maximiser le revenu, il faut mesurer ce que chaque mission rapporte, quel segment paie le mieux, quel est le coût IA par audit. Sans ça, on optimise à l'aveugle. |

**Le cerveau compte donc 9 piliers.** ⑧ est le plus sous-estimé : c'est lui qui rend l'audit **personnalisé et défendable** — on n'impose pas nos priorités, on applique les leurs.

---

## 1. Vue d'ensemble du flux

```
  [CLIENT]                          [MARCHÉ]
     │                                  │
 ┌───▼────────┐                  ┌──────▼───────┐
 │ COLLECTEUR │                  │  VEILLEUR    │  fournisseurs, solutions,
 │  données   │                  │ FOURNISSEURS │  prix, références
 │ entreprise │                  └──────┬───────┘
 └───┬────────┘                         │
     │                            ┌─────▼──────┐
 ┌───▼──────────┐                 │  ANALYSTE  │  parse les propositions
 │ INTERVIEWEUR │ critères &      │ PROPOSITION│
 │  (pilier ⑧)  │ pondérations    └─────┬──────┘
 └───┬──────────┘                       │
     │                                  │
 ┌───▼──────────────────────────────────▼──────┐
 │            HIÉRARCHISEUR                     │  scoring pondéré
 │  besoins classés par importance + contraintes│
 └───┬──────────────────────────────────┬──────┘
     │                                  │
 ┌───▼────────┐                  ┌──────▼───────┐
 │  AUDITEUR  │ 7 regards        │ COMPARATEUR  │ options vs besoins
 │            │ 8 questions      │              │ vs état de l'art
 └───┬────────┘                  └──────┬───────┘
     │                                  │
     └────────────┬─────────────────────┘
            ┌─────▼──────┐
            │CONTRADICTEUR│  attaque les conclusions
            └─────┬──────┘
            ┌─────▼──────┐
            │ RÉDACTEUR  │ → rapport + recommandation → HUMAIN signe
            └────────────┘
```

---

## 2. Agent COLLECTEUR (données entreprise)

| | |
|---|---|
| **Rôle** | Rassembler tout ce qu'on sait de l'entreprise auditée |
| **Entrées** | Site web, documents fournis, entretien, sources publiques (SIRENE, presse), outils actuels déclarés |
| **Traitement** | Extraction → nettoyage → normalisation vers le schéma `companies.profile`. **Nettoyer avant d'envoyer au modèle** (réduit coût et bruit) |
| **Sorties** | Profil structuré : secteur, taille, processus, volumes, outils, contraintes données, maturité IA |
| **Qualité** | Chaque champ porte sa **source** et sa **date**. Champ sans source = champ vide |
| **Autonomie** | **A2** (exécute, contrôle par échantillon) |
| **Modèle** | Petit/moyen — tâche d'extraction cadrée, le déterministe fait l'essentiel |

---

## 3. Agent INTERVIEWEUR (critères & préférences — pilier ⑧)

| | |
|---|---|
| **Rôle** | Capter ce que **la direction** veut vraiment, et le traduire en **pondérations** |
| **Entrées** | Entretien dirigeant, réponses à un questionnaire court, contraintes réglementaires |
| **Traitement** | Convertit des intentions floues en poids chiffrés + contraintes éliminatoires |
| **Sorties** | Vecteur de pondération (somme = 100) + liste des **éliminatoires** |
| **Qualité** | Les pondérations sont **validées explicitement par le client** avant tout scoring |
| **Autonomie** | **A1** (l'humain valide — c'est la base de toute la suite) |
| **Modèle** | Moyen — nuance de langage nécessaire |

**Grille de pondération type (à faire remplir par le dirigeant) :**

| Critère | Poids par défaut |
|---|---|
| Adéquation au besoin réel | 25 |
| Performance démontrée | 20 |
| Coût total sur 3 ans | 20 |
| Réversibilité / absence de verrou | 15 |
| Sécurité & conformité des données | 12 |
| Exploitabilité / maintenance | 8 |
| **Total** | **100** |

**Éliminatoires typiques :** données hors UE · absence d'export des données · aucun test possible sur données réelles · dépendance à un fournisseur unique sans plan de sortie.

---

## 4. Agent HIÉRARCHISEUR (le cœur du classement)

| | |
|---|---|
| **Rôle** | Classer les besoins **et** les options par ordre d'importance, selon les critères du client |
| **Entrées** | Profil entreprise (Collecteur) + pondérations (Interviewer) + options évaluées |
| **Traitement** | 1) applique les **éliminatoires** (une option qui en viole un est écartée, avec motif) · 2) note chaque option de 0 à 10 par critère · 3) calcule le **score pondéré** · 4) trie |
| **Sorties** | Classement + **justification par critère** + niveau de preuve (A/B/C) |
| **Qualité** | Aucune note sans justification. Le calcul est **déterministe et rejouable** |
| **Autonomie** | **A2** — le calcul est du code, seule la notation qualitative vient du modèle |
| **Modèle** | Le scoring est **du code**, pas un LLM. Le modèle ne sert qu'à noter les critères qualitatifs |

**Formule :** `score = Σ (note_critère × poids_critère) / 100`, sur 10.
**Règle :** deux options à moins de **0,5 point** d'écart sont déclarées **équivalentes** — on ne fabrique pas une fausse précision.

---

## 5. Agent VEILLEUR FOURNISSEURS (pilier ⑦)

| | |
|---|---|
| **Rôle** | Savoir ce qui se fait de mieux sur le marché, en continu |
| **Entrées** | Sites fournisseurs, annuaires, appels d'offres publics, communautés, tarifs publics, avis |
| **Traitement** | Fiche par fournisseur : offre, stack, modèle tarifaire, verrous, références, pérennité |
| **Sorties** | Table `vendors` + `solutions` : catégorie, périmètre couvert, prix indicatif, réversibilité, signaux de risque |
| **Qualité** | Toute donnée horodatée et sourcée. Prix relevés > prix annoncés commercialement |
| **Autonomie** | **A2** |
| **Modèle** | Petit modèle + scraping déterministe |

**Ce que le Veilleur doit toujours capturer :** le **modèle tarifaire réel** (par siège ? par exécution ? par token ?), la **clause de sortie**, et **qui héberge les données**. Ce sont les trois points où les prestataires restent flous.

---

## 6. Agent ANALYSTE PROPOSITION

| | |
|---|---|
| **Rôle** | Transformer un devis/une proposition en objet analysable |
| **Entrées** | PDF, e-mail, présentation du prestataire |
| **Traitement** | Extraction : architecture, modèles, volumétrie, hypothèses de coût, flux de données, engagements, SLA, clauses |
| **Sorties** | `proposals.parsed` — structure normalisée + **liste des non-dits** |
| **Qualité** | Les **absences** sont des constats : « aucun coût à l'échelle mentionné » vaut une ligne au rapport |
| **Autonomie** | **A2** |
| **Modèle** | Moyen (lecture de documents hétérogènes) |

---

## 7. Agent AUDITEUR ⭐

| | |
|---|---|
| **Rôle** | Produire l'audit : appliquer les 7 regards et les 8 questions à la situation réelle |
| **Entrées** | Profil entreprise · proposition parsée · pondérations · catalogue modèles · référentiel marché |
| **Traitement** | Pour chaque regard : constat → preuve (A/B/C) → score → risque. Confronte systématiquement à une **alternative plus sobre** |
| **Sorties** | `audits` : scores par regard, constats justifiés, risques, alternatives chiffrées |
| **Qualité** | **Aucune conclusion sur du niveau C seul.** Chaque constat porte source · méthode · mesure · confiance · date |
| **Autonomie** | **A1** au départ, **A2** après 30 audits mesurés |
| **Modèle** | Haut de gamme (raisonnement) — c'est le seul poste où l'on accepte de payer le meilleur modèle |

**Règle d'or de l'Auditeur :** il doit **toujours** produire l'option sobre en face de l'option proposée. Un audit sans alternative chiffrée n'est pas un audit.

---

## 8. Agent COMPARATEUR D'AUTOMATISATION ⭐

| | |
|---|---|
| **Rôle** | Comparer les propositions entre elles **et** avec ce qui se fait de mieux sur le marché |
| **Entrées** | Propositions parsées · besoins hiérarchisés · référentiel fournisseurs · catalogue modèles |
| **Traitement** | 1) normalise les offres sur une **grille commune** · 2) reconstruit le **coût total 3 ans** de chaque option · 3) ajoute une **option de référence marché** (le meilleur rapport perf/prix connu) · 4) ajoute une **option sobre** construite par nous · 5) score pondéré |
| **Sorties** | Tableau comparatif + gagnant + **écart chiffré** + conditions de réussite |
| **Qualité** | Toujours au moins **3 options comparées** : celle du prestataire, la référence marché, l'option sobre |
| **Autonomie** | **A1** puis **A2** |
| **Modèle** | Moyen/haut — le calcul de coût reste déterministe |

**Le livrable qui fait vendre :** une page, trois colonnes, un écart en euros par an. C'est ce tableau que le client montre à son prestataire.

---

## 9. Agent CONTRADICTEUR

| | |
|---|---|
| **Rôle** | Attaquer nos propres conclusions avant que le client ne le fasse |
| **Entrées** | L'audit et la comparaison, **sans** l'historique de raisonnement (pour éviter l'ancrage) |
| **Traitement** | Cherche : hypothèse fragile · alternative non explorée · biais de sélection · preuve de niveau C traitée comme un fait |
| **Sorties** | Liste d'objections classées par gravité + verdict *maintenir / réviser / retirer* |
| **Qualité** | Les objections **non résolues** figurent dans le rapport final |
| **Autonomie** | **A2** — mais son verdict « retirer » **bloque** la livraison jusqu'à arbitrage humain |
| **Modèle** | Haut de gamme, et **différent** de celui de l'Auditeur (éviter l'angle mort commun) |

---

## 10. Agent RÉDACTEUR

| | |
|---|---|
| **Rôle** | Produire le livrable client dans la DA rAIme |
| **Entrées** | Audit validé · comparatif · objections retenues |
| **Sorties** | Rapport PDF (filigrane rAIme), synthèse une page, tableau comparatif, plan d'action |
| **Qualité** | Zéro affirmation absente du corps de l'audit. Le rédacteur **n'invente jamais** |
| **Autonomie** | **A1** — l'humain signe |
| **Modèle** | Moyen |

---

## 11. Documents internes (circulation de l'information)

| Document | Produit par | Sert à |
|---|---|---|
| **Fiche entreprise** | Collecteur | Base de toute mission, réutilisable |
| **Grille de pondération signée** | Interviewer | Rendre le classement défendable |
| **Fiche fournisseur** | Veilleur | Capitaliser le marché mission après mission |
| **Fiche proposition** | Analyste | Objet analysable, comparable |
| **Note de constats** | Auditeur | Matière brute du rapport |
| **Tableau comparatif** | Comparateur | Le document qui déclenche la décision |
| **Note de contradiction** | Contradicteur | Traçabilité de l'esprit critique |
| **Rapport final** | Rédacteur | Livrable client signé |
| **Fiche de capitalisation** | Archiviste | Ce que la mission apprend au cerveau |

**Règle :** chaque document est **daté, sourcé, versionné** et rangé dans le cerveau. Un document qui n'entre pas dans la base n'existe pas.

---

## 12. Ce qui garantit l'indépendance

- Rémunération au **forfait ou au jour**, jamais au pourcentage d'un projet.
- **Aucune commission** d'un fournisseur, jamais — clause écrite dans chaque mandat.
- Si rAIme recommande une solution où elle a un intérêt, c'est **déclaré en tête de rapport**.
- Le Contradicteur et l'Auditeur utilisent des **modèles différents**.
- Le classement suit **les pondérations du client**, pas nos préférences.

---

## 13. Ordre de construction

| Priorité | Agent | Pourquoi d'abord |
|---|---|---|
| 1 | **Analyste Proposition** | Sans proposition parsée, rien n'est possible |
| 2 | **Auditeur** | C'est le produit vendu |
| 3 | **Comparateur** | C'est le livrable qui déclenche la décision |
| 4 | **Interviewer** (pondérations) | Rend le classement défendable |
| 5 | **Collecteur** | Accélère et réutilise |
| 6 | **Contradicteur** | Passage obligé avant de monter en autonomie |
| 7 | **Veilleur fournisseurs** | Construit la douve marché |
| 8 | **Rédacteur** | Industrialise le livrable |
