INSERT INTO kb_documents(path,title,tags,body) VALUES('knowledge/methodologie/cadre-operationnel.md','Cadre operationnel rAIme - firme d''audit IA agentique',ARRAY['cadre','strategie','agents','gouvernance','qualite'],$md$---
title: Cadre opérationnel rAIme — firme d'audit IA agentique
tags: [cadre, strategie, agents, gouvernance, qualite]
updated: 2026-09-02
horizon: 4–5 ans
---

# rAIme — Cadre opérationnel d'une firme d'audit IA 100 % agentique

> **Objectif :** délivrer, d'ici 4–5 ans, les meilleurs services d'**audit**, d'**arbitrage** et de **conseil privé en intégration d'IA**, opérés majoritairement par des agents autonomes, sous garantie humaine.

---

## 0. Thèse fondatrice

Le marché se remplit d'intégrateurs qui **construisent**. rAIme **juge**. Or juger exige trois choses qu'une IA peut industrialiser mieux qu'un humain seul : **une mémoire exhaustive et à jour**, **une méthode appliquée sans fatigue ni complaisance**, et **une traçabilité totale**.

**Principe directeur — la doctrine qu'on vend, on se l'applique :**
> Tout ce qui peut être **déterministe** (règle, code, calcul) l'est. Le modèle de langage est appelé **uniquement** là où il apporte un jugement que le code ne sait pas produire — et cet appel doit être justifiable, mesuré, traçable.

C'est ce qui rend la firme **économe, prévisible et auditable** — donc crédible comme auditeur.

---

## 1. Modèle opérationnel cible

Les grands cabinets passent de la **pyramide** (masse de juniors) au **diamant** (base fine, cœur d'experts, sommet d'associés). McKinsey opère déjà ~25 000 agents IA aux côtés de ~35 000 humains.

rAIme saute une étape : **pas de pyramide du tout**. La structure cible est un **noyau** :

```
                    ┌─────────────────────────┐
                    │   HUMAIN (Basile)       │  relation, arbitrage final,
                    │   garantie & signature  │  responsabilité, vente conseil
                    └───────────┬─────────────┘
                                │  autonomie bornée
                    ┌───────────▼─────────────┐
                    │     ORCHESTRATEUR       │  coordination centralisée
                    └───────────┬─────────────┘
        ┌───────────┬───────────┼───────────┬───────────┐
   CONNAISSANCE  COMMERCE    MISSION     CONTRÔLE    ÉCONOMIE
```

**Ce qui reste humain, même à terme :** la relation de confiance, l'arbitrage final, la signature qui engage, et la responsabilité. Un audit indépendant vaut par **qui en répond**.

---

## 2. Les piliers du cerveau souverain

Aux **3 piliers** d'origine, j'en ajoute **3** qui sont indispensables à une firme d'**audit** (et non à un simple assistant).

| # | Pilier | Rôle | État |
|---|--------|------|------|
| ① | **Contexte statique** | La mémoire durable : catalogue des modèles (perf/prix/tâche), méthode d'audit, playbooks secteurs, règles de conformité | ✅ déployé |
| ② | **Contexte dynamique** | Le radar : nouveaux modèles, prix, fournisseurs, réglementation + le mouvant de chaque client | 🔜 sync OpenRouter |
| ③ | **Capacités** | Les agents qui produisent, en suivant des instructions détaillées | 🔜 phase 1 |
| ④ | **Preuve & traçabilité** | Toute affirmation porte sa source, sa méthode, sa mesure et son niveau de confiance. Tout rapport est **rejouable** | ⭐ ajouté |
| ⑤ | **Gouvernance & autonomie bornée** | La Constitution : limites, conflits d'intérêt, seuils d'escalade humaine, journalisation | ⭐ ajouté |
| ⑥ | **Capitalisation** | Chaque mission enrichit la mémoire → l'actif prend de la valeur en continu | ⭐ ajouté |

**Pourquoi ④ est vital :** un auditeur sans traçabilité n'est pas un auditeur. C'est le pilier qui transforme « une IA qui donne un avis » en « une firme dont l'avis engage ».

**Pourquoi ⑥ est vital :** c'est le moteur de la douve. Au bout de 200 missions, la base de profils et de propositions fournisseurs devient un actif qu'aucun concurrent ne peut recréer.

---

## 3. Organigramme agentique

**Décision d'architecture (fondée sur les données) :** orchestration **centralisée**, pas de nuée d'agents indépendants. Les systèmes indépendants **amplifient les erreurs ×17,2**, les systèmes centralisés les contiennent à **×4,4**. Sur les tâches séquentielles, le multi-agent naïf **dégrade** la performance de 39 à 70 %.

### Pôle Connaissance
| Agent | Mission |
|---|---|
| **Radar** | Veille : sorties de modèles, prix, fournisseurs, réglementation. Alimente ② |
| **Archiviste** | Normalise, range, indexe (embeddings), maintient la taxonomie et la qualité des notes |

### Pôle Commerce
| Agent | Mission |
|---|---|
| **Prospecteur** | Sourcing + enrichissement des cibles |
| **Héraut** | Séquences de contact personnalisées (email, tel, LinkedIn) |
| **Portier** | Qualifie les réponses, filtre, cale les rendez-vous |

### Pôle Mission (le cœur)
| Agent | Mission |
|---|---|
| **Profileur** | Construit le profil d'entreprise (statique + dynamique) |
| **Analyste** | Parse la proposition fournisseur : architecture, modèles, coûts, flux de données |
| **Auditeur** | Applique les 7 regards + 8 questions, confronte au catalogue, produit les constats scorés |
| **Économiste** | Modélise le coût complet et le ROI (branché sur le ROI Engine) |
| **Contradicteur** | **Attaque l'audit** : cherche la faille du raisonnement, l'alternative non explorée, le biais |
| **Rédacteur** | Produit le livrable client dans la DA rAIme |

> Le **Contradicteur** est l'agent le plus précieux. C'est lui qui empêche la firme de produire des audits confortables.

### Pôle Contrôle
| Agent | Mission |
|---|---|
| **Gardien** | Applique la Constitution : limites, conflits d'intérêt, escalade humaine, journal |
| **Vérificateur** | Évalue chaque sortie contre des critères mesurables ; bloque ou escalade |
| **Watchdog** | Santé du système : coûts, latence, dérive de performance |

---

## 4. Cycle de mission (bout en bout)

```
1. CAPTATION      Prospecteur → Héraut → Portier            → prospect qualifié
2. CADRAGE        Profileur                                  → profil d'entreprise
3. COLLECTE       Analyste                                   → propositions parsées
4. ANALYSE        Auditeur + Économiste                      → constats + modèle de coût
5. CONTRADICTION  Contradicteur                              → constats attaqués, révisés
6. CONTRÔLE       Vérificateur + Gardien                     → seuils qualité, escalade
7. LIVRAISON      Rédacteur → HUMAIN signe                   → rapport + recommandation
8. CAPITALISATION Archiviste                                 → tout retourne au cerveau
9. SUIVI          Watchdog                                   → contrôle après déploiement
```

L'étape **5** est ce qui distingue rAIme d'un « GPT qui rédige un rapport ». L'étape **7** garde l'humain dans la boucle là où l'engagement se joue.

---

## 5. Cadre qualité & preuve

### Les trois niveaux de preuve
| Niveau | Nature | Exemple |
|---|---|---|
| **A — Mesuré** | Test réalisé sur les données réelles du client | « 97,4 % de réussite sur 500 e-mails du client » |
| **B — Documenté** | Source vérifiable et datée | « prix officiel du modèle au 02/09/2026 » |
| **C — Estimé** | Modélisation avec fourchette et hypothèses explicites | « coût projeté à volume ×10 : 700–950 € » |

**Règle absolue :** aucune recommandation ne peut reposer **uniquement** sur du niveau C. Toute conclusion engageante exige au moins un élément A ou B.

### Traçabilité
Chaque constat porte : **source · méthode · mesure · niveau de confiance · date**. 
Chaque rapport est **rejouable** : quel agent, quel modèle, quel prompt, quelles sources, quand.

### Contradiction obligatoire
Aucun audit ne sort sans être passé par le **Contradicteur**. Les objections non résolues figurent dans le rapport (c'est un gage de sérieux, pas une faiblesse).

### Évaluations continues
Les évaluations de pré-production **deviennent des garde-fous en production** : un score sous le seuil bloque l'action ou déclenche une escalade. La qualité est citée comme le **premier frein** au déploiement d'agents (32 % des organisations) — c'est donc là que se joue l'avantage.

### Garde-fous en entrée et en sortie
Un filtre **avant** que le modèle voie l'entrée, un filtre **avant** que la sortie atteigne le client. Dès le premier jour, pas après.

---

## 6. Gouvernance — les 5 niveaux d'autonomie

On ne décrète pas l'autonomie, on la **gagne par la preuve**, tâche par tâche.

| Niveau | Définition | Contrôle |
|---|---|---|
| **A0** | L'agent propose, l'humain fait | 100 % humain |
| **A1** | L'agent fait, l'humain valide avant envoi | Validation systématique |
| **A2** | L'agent fait et exécute, l'humain contrôle a posteriori | Échantillonnage |
| **A3** | L'agent fait et exécute, un **autre agent** contrôle | Audit périodique humain |
| **A4** | Autonomie complète sur un périmètre borné | Métriques + alertes |

**Règle de montée :** on ne passe au niveau supérieur qu'avec des **métriques prouvées sur ≥ 30 cas réels** (taux d'erreur, taux d'escalade, coût). Toute régression fait redescendre d'un cran automatiquement.

**Ce qui reste à A0/A1 pour toujours :** la signature d'un rapport, la recommandation finale engageante, la gestion d'un conflit d'intérêt, la relation client sensible.

---

## 7. Architecture technique

| Couche | Choix | Pourquoi |
|---|---|---|
| **Orchestration** | DeepSeek harness, coordination **centralisée** | Contient l'amplification d'erreurs (×4,4 vs ×17,2) |
| **Modèles** | OpenRouter, **routage par tâche** | Le bon modèle au juste coût — notre propre doctrine |
| **Socle déterministe** | Code, règles, SQL, ROI Engine | Fiable, quasi gratuit, auditable |
| **Mémoire relationnelle** | PostgreSQL (`raime_brain`) | Profils, propositions, audits, catalogue |
| **Mémoire sémantique** | pgvector + embeddings | Recherche dans les notes |
| **Notes / rédaction** | Obsidian (markdown + git) | Ton interface d'écriture, versionnée |
| **Orchestration de flux** | n8n | Déjà en place |
| **Souveraineté** | VPS Hetzner, modèles interchangeables | Zéro dépendance à un fournisseur unique |
| **Observabilité** | Coût, latence, erreurs, dérive | Sans mesure, pas d'autonomie |

**Indépendance :** aucun fournisseur de modèle ne doit être structurant. Le routage par tâche rend chaque modèle remplaçable en une ligne de configuration.

---

## 8. Verdict : LeCun, JEPA et les world models

**Les faits (2026).** Yann LeCun a quitté Meta (nov. 2025) et cofondé **AMI Labs** à Paris, qui a levé **1,03 Md$** en amorçage (mars 2026, valorisation 3,5 Md$ pre-money, avec NVIDIA, Bezos Expeditions, Samsung, Toyota). Sa thèse : les LLM ne mèneront pas à une intelligence réelle ; **JEPA** prédit des **représentations abstraites** plutôt que des tokens ou des pixels.

**Faut-il bâtir rAIme dessus ? → Non, pas aujourd'hui.** 
JEPA et les world models visent la compréhension **physique et perceptive** (vidéo, robotique, planification dans le monde réel). Le métier de rAIme est l'analyse **documentaire, économique et architecturale**. Il n'existe aucune stack JEPA de production pour ce type de raisonnement. Bâtir dessus serait exactement l'erreur qu'on dénonce chez les prestataires : **choisir la techno impressionnante plutôt que la techno juste**.

**Faut-il le maîtriser ? → Oui, absolument. C'est même stratégique.** Trois raisons :
1. **C'est ton métier.** Tu conseilles sur *quelle* IA intégrer. Tu dois connaître le **challenger crédible des LLM** pour repérer un prestataire qui survend un LLM là où une autre approche (ou pas d'IA du tout) conviendrait.
2. **C'est un critère d'audit.** Ajouter au regard « Architecture » la question : *« le problème posé relève-t-il réellement d'un LLM ? »* Beaucoup de projets échouent parce que la réponse est non.
3. **C'est un angle souverain et français.** AMI Labs est à Paris. Sur ton positionnement européen, savoir en parler avec justesse te distingue.

**Décision :** créer dans le cerveau un domaine de connaissance **« paradigmes & limites des LLM / world models »**, que le **Radar** surveille (publications AMI Labs, JEPA, benchmarks). On **observe**, on **maîtrise le discours**, on **ne parie pas l'architecture** dessus.

---

## 9. Feuille de route 4–5 ans

| Phase | Horizon | Contenu | Autonomie |
|---|---|---|---|
| **0 — Socle** ✅ | fait | Mémoire + méthode déployées (`raime_brain`) | — |
| **1 — Première mission agentique** | 0–6 mois | Profileur, Analyste, Auditeur, Économiste, Rédacteur. Sync OpenRouter. Missions réelles | **A1** |
| **2 — Qualité & commerce** | 6–18 mois | Contradicteur + Vérificateur + évaluations. Prospecteur/Héraut/Portier. Bibliothèque de profils | **A2** |
| **3 — Spécialisation** | 18–36 mois | Playbooks sectoriels, produit d'audit packagé, contrôle après déploiement automatisé | **A3** |
| **4 — Firme agentique** | 3–5 ans | La firme tourne majoritairement en agents ; l'humain sur la relation, l'arbitrage et la garantie | **A4** borné |

**Principe de progression :** on ne monte d'une phase qu'avec les **métriques de la précédente prouvées**. Aucune phase ne se saute.

---

## 10. Métriques de pilotage

| Famille | Indicateur | Cible |
|---|---|---|
| **Qualité** | Constats confirmés après contradiction | > 90 % |
| **Qualité** | Taux d'escalade humaine | Décroissant par tâche |
| **Économie** | Coût IA par audit | < 3 % du prix de vente |
| **Vitesse** | Délai de production d'un audit | Divisé par 5 en phase 2 |
| **Actif** | Profils d'entreprise en base | Croissance continue |
| **Actif** | Taux de réutilisation de la mémoire | > 60 % des constats appuyés sur la base |
| **Autonomie** | % de tâches en A2+ | Progression trimestrielle |

---

## Sources
- LeCun / AMI Labs / JEPA : buildfastwithai, StartupHub.ai, Nasdaq (2026)
- Cabinets & agents : futureofconsulting.ai, Klover.ai, McKinsey UK Insights (2026)
- Fiabilité multi-agents & garde-fous : Medium (Lanham), Arize AI, MLflow, Rattix (2026)
$md$) ON CONFLICT(path) DO UPDATE SET title=EXCLUDED.title,tags=EXCLUDED.tags,body=EXCLUDED.body,updated_at=now();
