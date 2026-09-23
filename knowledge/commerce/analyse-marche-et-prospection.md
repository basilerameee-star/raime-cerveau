---
title: Analyse de marché, position rAIme et refonte de la prospection
tags: [marche, secteurs, prospection, ai-act, diagnostic]
updated: 2026-09-02
---

# Analyse de marché & refonte de la prospection

---

## 1. Scan de l'existant — ce qui tourne réellement

Inventaire factuel du VPS au 2 septembre 2026.

| Élément | État |
|---|---|
| Workflows n8n | **34** dont **24 actifs** |
| Exécutions | **808 réussies**, 18 en erreur (dernière erreur : 20 août) |
| Bases | `n8n` 36 Mo · `metabase` 34 Mo · `raime_brain` 8,5 Mo |
| Conteneurs | postgres, n8n, caddy, metabase, docuseal, voyage, cockpit |

**Agents déjà en place :** Sherlock (sourcing INSEE), Fureteur (enrichissement), Amy (rédaction e-mails), Expéditeur (envoi), Réceptionniste (réponses), Portier (leads), Héraut (rapport quotidien), Radar / Vigie / Model Radar (veille), Athéna (auto-amélioration), Léonard (devis/fiches), ROI Engine, Sentinelle (santé), Diagnosticien, Plume & Amy LinkedIn.

**Le système fonctionne techniquement.** Le problème n'est pas la machine, c'est ce qu'elle dit et à qui.

---

## 2. L'entonnoir de prospection — la vérité chiffrée

| Étape | Volume | Taux |
|---|---|---|
| Prospects sourcés | 2 883 | — |
| **Avec e-mail trouvé** | **401** | **13,9 %** |
| E-mails rédigés | 193 | |
| **E-mails envoyés** | **152** | |
| **Réponses reçues** | **0** | **0 %** |

**Deux goulots, un échec.**

**Goulot 1 — l'enrichissement (13,9 %).** On source massivement dans le vide : 86 % des prospects sont inexploitables. Pire par secteur : cabinets de conseil **4,7 %** (32/685), cabinets comptables 14,5 %, organismes de formation **34 %** (le seul correct).

**Goulot 2 — le message (0 %).** Zéro réponse sur 152 envois n'est pas de la malchance : un cold e-mail B2B correct obtient 1 à 5 %. C'est structurel.

**Hygiène :** les 2 883 prospects sont tous encore au statut « nouveau ». Le pipeline n'est jamais mis à jour → aucun pilotage possible.

---

## 3. Autopsie du message envoyé 152 fois

> « Je vais être directe : **c'est une intelligence artificielle qui écrit ce message**. Je m'appelle Amy, l'un des agents déployés par rAIme.fr… que serait-il pertinent d'automatiser ? … le site est juste ci-dessus pour me contacter — à bientôt 😉 »

| # | Faute | Gravité |
|---|---|---|
| 1 | **Annonce en 1ʳᵉ ligne que c'est une IA qui écrit** — le lecteur classe en spam avant la 2ᵉ phrase | rédhibitoire |
| 2 | **Aucune demande claire** — on renvoie vers le site, le prospect doit fournir l'effort | rédhibitoire |
| 3 | **Vend de l'automatisation** — l'ancien positionnement, obsolète depuis le pivot | rédhibitoire |
| 4 | **Question ouverte et vague** — « que serait-il pertinent d'automatiser ? » demande du travail au lecteur | élevée |
| 5 | **Signé par un agent**, pas par Basile — on achète du conseil à un humain | élevée |
| 6 | **Emoji et ton familier** vers des cabinets comptables et avocats | moyenne |
| 7 | **Objet sans raison d'ouvrir** — « une curiosité métier » | moyenne |

---

## 4. L'état du marché et la position de rAIme

### La relation fournisseur ↔ client est structurellement déséquilibrée
Le prestataire maîtrise le vocabulaire, les prix, les architectures. Le client n'a **aucun moyen de vérifier**. Il ne peut ni comparer, ni challenger, ni chiffrer. Cette **asymétrie d'information** est le marché de rAIme — exactement comme l'expert automobile face au garagiste, ou le maître d'œuvre face au constructeur.

### Les acteurs en face
- **Intégrateurs / agences d'automatisation** — vendent la construction, marge sur la complexité. *Ils ont intérêt à la sur-architecture.*
- **Éditeurs SaaS verticaux** — vendent un abonnement par siège. *Ils ont intérêt au verrou.*
- **ESN / cabinets IT** — vendent des jours. *Ils ont intérêt à la durée.*
- **Grands cabinets (McKinsey, Deloitte, PwC…)** — vendent la stratégie à des ETI/grands comptes, à des tarifs inaccessibles aux PME.

**Le trou dans le marché :** personne ne représente la PME **contre** ces acteurs, à un prix accessible. C'est la place de rAIme.

### Le levier réglementaire — le déclencheur qu'on attendait
**AI Act, article 4 (« maîtrise de l'IA ») :** applicable depuis le **2 février 2025**, il impose à toute organisation qui *déploie* un système d'IA d'assurer et de **documenter** la formation de son personnel aux usages, limites et risques. L'obligation ne dépend pas du niveau de risque : **utiliser ChatGPT ou Copilot suffit à être concerné**.

**Depuis le 2 août 2026, les sanctions nationales sont applicables : jusqu'à 7,5 M€ ou 1,5 % du chiffre d'affaires mondial.** L'absence de formation documentée constitue un facteur aggravant en cas de contrôle.

**Conséquence commerciale :** la formation rAIme cesse d'être un confort et devient une **mise en conformité datée**, avec un livrable de preuve. Et le recensement des usages IA exigé pour s'y conformer **est un audit**.

---

## 5. Hiérarchie des secteurs par nécessité d'intégration

| Rang | Secteur | Maturité IA | Démarchage subi | Contraintes | Pourquoi ce rang |
|---|---|---|---|---|---|
| 1 | **Cabinets comptables** | faible-moyenne | très forte | 4 | Volume documentaire massif, marge sous tension, démarchés en continu |
| 2 | **Cabinets d'avocats** | faible | forte | 4 | Facturation au temps → le gain est directement monétisable |
| 3 | **Organismes de formation** | moyenne | moyenne | 4 | Doivent eux-mêmes se conformer ; meilleur taux d'enrichissement (34 %) |
| 4 | **Cabinets de conseil** | moyenne-bonne | forte | 3 | Vendent la transformation, souvent peu outillés — mais enrichissement très faible (4,7 %) |
| 5 | **Immobilier / syndics** | faible | moyenne | 3 | Très administratif, peu informatisé |
| 6 | **RH / recrutement** | moyenne | très forte | 4 | **Zone haut risque AI Act (annexe III)** → obligations renforcées, forte valeur d'audit |
| 7 | **Santé privée** | faible | moyenne | 4 | Données de santé (HDS) : prudence maximale, cycle long |
| 8 | **Industrie / logistique** | moyenne | moyenne | 3 | ROI facile à prouver, volumes transactionnels |

---

## 6. La bibliothèque d'automatisations par secteur *(déployée)*

Pour chaque processus métier, le cerveau conserve désormais : le **niveau d'IA réellement justifié**, l'**approche sobre**, ce que les prestataires **survendent**, et le **piège** à débusquer.

**Exemples déjà en base :**
- *Comptable — tri des e-mails* : 80 % se trient par règles simples ; la survente classique est l'architecture multi-agents + base vectorielle facturée sur 100 % du volume.
- *Comptable — collecte de pièces* : l'OCR est déjà inclus dans la plupart des logiciels métier → **on fait payer deux fois la même fonction**.
- *Avocats — recherche juridique* : l'hallucination de jurisprudence est documentée → exiger la citation vérifiable, sinon refuser.
- *RH — tri de CV* : **zone haut risque AI Act**, obligations renforcées que beaucoup de prestataires ignorent.
- *Immobilier — courriers* : un publipostage fait le travail pour un coût nul → payer un LLM par courrier est un pur surcoût.

**8 secteurs · 19 automatisations documentées**, branchées sur l'agent Auditeur. C'est ce qui donne la pertinence métier et le crédit.

---

## 7. La refonte de la prospection

### Principe : arrêter le volume, viser la précision
Sourcer 2 883 entreprises pour en contacter 152 est un gaspillage. **Mieux vaut 200 prospects bien enrichis et bien ciblés que 3 000 fantômes.**

### Nouveau ciblage (par ordre)
1. Secteurs **1 à 3** de la hiérarchie, là où l'enrichissement fonctionne
2. Entreprises de **20 à 250 salariés**
3. Priorité aux signaux : recrutement « transformation digitale », projet IA annoncé, salon, appel d'offres

### Le nouvel e-mail — angle conformité

> **Objet :** obligation de formation IA — [Nom du cabinet]
>
> Bonjour [Prénom],
>
> Depuis le 2 août, les sanctions de l'article 4 de l'AI Act sont applicables : toute entreprise qui utilise un système d'IA doit pouvoir **démontrer** que ses équipes ont été formées à ses usages, ses limites et ses risques — avec une trace documentée.
>
> La plupart des cabinets utilisent déjà ChatGPT ou Copilot au quotidien. L'obligation s'applique donc, même sans projet IA formel.
>
> Nous formons les équipes et nous remettons le dossier de preuve. Le dirigeant peut le financer via son CPF.
>
> **Avez-vous déjà constitué cette documentation ?**
>
> Basile Ramé — rAIme
> Conseil & audit IA indépendant

**Pourquoi celui-ci fonctionne :** un fait daté et vérifiable · une raison d'ouvrir · aucune mention d'IA rédactrice · **une seule question fermée** · signé par un humain · une solution avec financement · zéro jargon.

### Variante « audit » (prospect avec un devis en main)
> **Objet :** votre proposition [Nom du prestataire]
>
> Bonjour [Prénom], vous avez reçu une proposition d'automatisation. Trois questions permettent de savoir si elle est au juste niveau : quel est le coût réel à volume ×10 ? quelle part est déterministe et quelle part dépend d'un modèle ? pouvez-vous partir avec vos données ?
> Si vous n'avez pas les réponses, je vous en fais une lecture en 30 minutes, sans engagement.
> **Vous m'envoyez le devis ?**

### Corrections techniques à appliquer au pipeline
1. **Mettre à jour le statut des prospects** à chaque étape (contacté, répondu, qualifié, perdu) — sans ça, aucun pilotage.
2. **Mesurer le taux de réponse par secteur et par version d'e-mail** — sans mesure, pas d'amélioration.
3. **Vérifier la délivrabilité** (SPF/DKIM/DMARC, réchauffement du domaine) : 0 réponse sur 152 peut aussi signaler un problème de remise.
4. **Arrêter le sourcing de masse** tant que l'enrichissement plafonne à 14 %.
5. **Retirer la signature « Amy, agent IA »** de tous les envois sortants.

---

## 8. La veille marché permanente

Le **Radar** doit être étendu au-delà des modèles :

| Objet surveillé | Pourquoi | Fréquence |
|---|---|---|
| Modèles et prix (OpenRouter) | Le juste coût évolue chaque mois | quotidienne *(actif)* |
| Fournisseurs d'automatisation | Connaître l'offre et les verrous | hebdomadaire |
| Réglementation (AI Act, CNIL) | Chaque échéance crée de la demande | hebdomadaire |
| Nouvelles automatisations par secteur | Enrichir la bibliothèque | mensuelle |

**La règle de capitalisation :** chaque mission alimente la bibliothèque sectorielle. Au bout de 50 audits, rAIme connaît le marché mieux que les prestataires eux-mêmes — c'est la douve.
