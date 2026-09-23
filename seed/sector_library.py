#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Bibliotheque d'automatisations par secteur (pilier 7 : referentiel marche).
Genere le SQL de creation + seed. C'est l'actif de credibilite de rAIme :
pour chaque secteur, ce qui s'automatise vraiment, ce que les prestataires
SURVENDENT, et le piege classique.
"""
import json, io

SCHEMA = """
CREATE TABLE IF NOT EXISTS sector_playbooks (
  id            serial PRIMARY KEY,
  secteur       text UNIQUE NOT NULL,
  priorite      integer,              -- 1 = cible prioritaire
  contexte      text,
  volumetrie    text,
  reglementation text[],
  maturite_ia   text,
  pression_ia   text,                 -- a quel point ils sont demarches
  updated_at    timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sector_automations (
  id               serial PRIMARY KEY,
  secteur          text NOT NULL,
  processus        text NOT NULL,
  automatisation   text,
  niveau_ia        text,   -- regles | petit_modele | llm | agents
  approche_sobre   text,
  approche_survendue text, -- ce que les prestataires proposent en trop
  piege            text,   -- le piege classique a debusquer en audit
  gain_type        text,
  complexite       text,
  UNIQUE(secteur, processus)
);
"""

PLAYBOOKS = [
 # secteur, priorite, contexte, volumetrie, reglementation, maturite, pression
 ("Cabinets comptables", 1,
  "Volume documentaire massif et repetitif, forte pression sur les delais fiscaux, marge sous tension. Demarches en continu par les editeurs.",
  "Plusieurs centaines a milliers de pieces/mois, 1 000-2 000 e-mails/semaine pour 40+ collaborateurs",
  ["Secret professionnel comptable","RGPD","AI Act art.4","Deontologie OEC"],
  "faible a moyenne", "tres forte"),
 ("Cabinets d'avocats", 2,
  "Recherche et redaction chronophages, confidentialite critique, facturation au temps qui rend le gain de temps directement monetisable.",
  "Volumes variables, forte valeur par dossier",
  ["Secret professionnel absolu","RGPD","AI Act art.4","RIN / deontologie"],
  "faible", "forte"),
 ("Organismes de formation", 3,
  "Production de contenus pedagogiques et gestion administrative Qualiopi lourde. Doivent eux-memes se conformer a l'AI Act.",
  "Fort volume administratif, contenus a produire en continu",
  ["Qualiopi","RGPD","AI Act art.4","Code du travail (formation)"],
  "moyenne", "moyenne"),
 ("Cabinets de conseil", 4,
  "Production de livrables et veille intensive. Paradoxe : vendent de la transformation, souvent peu outilles eux-memes.",
  "Forte production documentaire, faible volume transactionnel",
  ["RGPD","AI Act art.4","Confidentialite client"],
  "moyenne a bonne", "forte"),
 ("Immobilier / syndics", 5,
  "Gestion locative et syndic tres administratives, relances et etats des lieux repetitifs, faible informatisation.",
  "Volume eleve de courriers, appels et relances",
  ["RGPD","Loi ALUR","AI Act art.4"],
  "faible", "moyenne"),
 ("RH / recrutement", 6,
  "Tri de CV et sourcing = terrain de jeu historique de l'IA, mais zone reglementaire a haut risque (l'AI Act classe le recrutement en haut risque).",
  "Centaines a milliers de candidatures",
  ["RGPD","AI Act HAUT RISQUE (annexe III)","Non-discrimination","Code du travail"],
  "moyenne", "tres forte"),
 ("Sante privee / cliniques", 7,
  "Administratif lourd (prise de RDV, comptes rendus), mais donnees de sante = regime le plus contraint. Prudence maximale.",
  "Flux patients continu",
  ["Donnees de sante (HDS)","RGPD renforce","Secret medical","AI Act haut risque possible"],
  "faible", "moyenne"),
 ("Industrie / logistique", 8,
  "Flux physiques et documentaires (commandes, bons, factures), gains mesurables et ROI facile a prouver.",
  "Volumes transactionnels eleves",
  ["RGPD","AI Act art.4","Normes sectorielles"],
  "moyenne", "moyenne"),
]

AUTOMATIONS = [
 # secteur, processus, automatisation, niveau_ia, sobre, survendu, piege, gain, complexite
 ("Cabinets comptables","Collecte des pieces clients",
  "Relances automatiques et depot structure des justificatifs","regles",
  "Regles de relance calendaires + portail de depot + OCR standard du logiciel metier",
  "Agent conversationnel IA qui 'dialogue' avec le client pour reclamer les pieces",
  "L'OCR comptable est deja inclus dans la plupart des logiciels metier : on fait payer deux fois la meme fonction",
  "temps","faible"),
 ("Cabinets comptables","Tri et qualification des e-mails",
  "Classement par type de demande et routage au bon collaborateur","petit_modele",
  "Regles Outlook/Power Automate sur expediteur, objet, pieces jointes + petit modele pour les cas ambigus",
  "Architecture multi-agents avec base vectorielle et modele haut de gamme",
  "80% des e-mails se trient sur des regles simples : le LLM ne sert que sur la marge, mais on facture le LLM sur 100% du volume",
  "temps","faible"),
 ("Cabinets comptables","Reponses de premier niveau",
  "Reponses type sur questions frequentes (TVA, delais, documents)","llm",
  "Bibliotheque de reponses pre-validees + generation encadree avec validation humaine",
  "Reponses autonomes non supervisees",
  "Une reponse fiscale erronee engage la responsabilite du cabinet : l'autonomie totale est un risque deontologique, jamais un gain",
  "temps","moyenne"),
 ("Cabinets comptables","Preparation des dossiers de revision",
  "Pre-remplissage et detection d'anomalies","petit_modele",
  "Regles metier + controles de coherence deterministes",
  "IA generative pour 'analyser' les comptes",
  "Les controles de coherence sont deterministes par nature : un LLM y est moins fiable ET plus cher",
  "qualite","moyenne"),

 ("Cabinets d'avocats","Recherche jurisprudentielle",
  "Recherche augmentee dans les bases juridiques","llm",
  "RAG sur bases juridiques licenciees + citation obligatoire des sources",
  "Modele generaliste qui 'connait le droit'",
  "L'hallucination de jurisprudence est documentee et a deja values des sanctions : exiger la citation verifiable, sinon refuser",
  "temps","moyenne"),
 ("Cabinets d'avocats","Redaction d'actes repetitifs",
  "Generation de premiers jets sur trames validees","llm",
  "Trames + variables + generation encadree, relecture systematique",
  "Redaction autonome d'actes",
  "La valeur de l'avocat est dans la personnalisation : automatiser la trame, jamais le jugement",
  "temps","faible"),
 ("Cabinets d'avocats","Analyse de pieces volumineuses",
  "Synthese et indexation de dossiers","llm",
  "Extraction structuree + index consultable, humain sur la qualification",
  "Agent qui 'analyse le dossier et donne une strategie'",
  "Confidentialite : verifier ou partent les pieces. Beaucoup de solutions envoient hors UE sans le dire",
  "temps","moyenne"),

 ("Organismes de formation","Production de supports pedagogiques",
  "Generation de premiers jets de contenus et exercices","llm",
  "Trames pedagogiques + generation encadree + relecture formateur",
  "Plateforme complete de creation autonome de formations",
  "Qualiopi exige la tracabilite de la conception : un contenu genere sans trace de validation fragilise l'audit Qualiopi",
  "temps","faible"),
 ("Organismes de formation","Administratif Qualiopi",
  "Constitution et suivi des preuves","regles",
  "Automatisation documentaire deterministe (modeles, relances, archivage)",
  "IA pour 'gerer la conformite'",
  "La conformite se prouve par des documents traces, pas par une IA : le deterministe est ici superieur ET moins cher",
  "temps","faible"),

 ("Cabinets de conseil","Veille et synthese",
  "Veille automatisee et notes de synthese","llm",
  "Flux RSS/sources qualifiees + resume avec citation des sources",
  "Agent de veille autonome multi-sources",
  "Sans sources citees et verifiables, une veille IA cree un risque reputationnel superieur au gain",
  "temps","faible"),
 ("Cabinets de conseil","Production de livrables",
  "Assemblage de livrables sur trames","llm",
  "Bibliotheque de trames + generation encadree",
  "Generation autonome de rapports clients",
  "Le livrable engage le cabinet : validation humaine obligatoire, sinon risque contractuel",
  "temps","moyenne"),

 ("Immobilier / syndics","Relances et courriers",
  "Generation et envoi de courriers types","regles",
  "Modeles + fusion de donnees, zero IA necessaire",
  "IA generative pour rediger chaque courrier",
  "Un publipostage fait le travail pour un cout nul : payer un LLM par courrier est un pur surcout",
  "temps","faible"),
 ("Immobilier / syndics","Qualification des demandes locataires",
  "Tri et routage des demandes","petit_modele",
  "Regles + petit modele sur les cas ambigus",
  "Assistant conversationnel complet",
  "Le volume ne justifie souvent pas l'investissement : verifier le nombre reel de demandes/mois avant tout",
  "temps","faible"),

 ("RH / recrutement","Tri de candidatures",
  "Pre-selection et scoring de CV","llm",
  "Criteres explicites et auditables, humain decisionnaire, tracabilite complete",
  "Scoring automatique des candidats avec classement autonome",
  "ZONE HAUT RISQUE AI ACT (annexe III) : obligations renforcees, analyse d'impact, non-discrimination. Beaucoup de prestataires l'ignorent totalement",
  "temps","elevee"),
 ("RH / recrutement","Redaction d'offres",
  "Generation d'annonces","llm",
  "Trames + generation encadree",
  "Optimisation IA autonome des annonces",
  "Risque de biais discriminatoires dans la formulation : relecture obligatoire",
  "temps","faible"),

 ("Sante privee / cliniques","Prise de rendez-vous",
  "Qualification et planification","regles",
  "Regles de planification + creneaux, IA seulement sur la comprehension de la demande",
  "Assistant medical conversationnel",
  "Donnees de sante : hebergement HDS obligatoire. Verifier la certification du prestataire ET de ses sous-traitants",
  "temps","moyenne"),
 ("Sante privee / cliniques","Comptes rendus",
  "Transcription et mise en forme","llm",
  "Transcription + trame, validation praticien systematique",
  "Redaction autonome de comptes rendus medicaux",
  "Responsabilite medicale : jamais d'autonomie. Verifier ou transite l'audio",
  "temps","elevee"),

 ("Industrie / logistique","Traitement des commandes",
  "Extraction et saisie automatique","petit_modele",
  "OCR + regles de validation deterministes + exceptions vers humain",
  "Agents autonomes de gestion des commandes",
  "Une erreur de saisie coute cher : le taux d'erreur doit etre mesure sur donnees reelles avant tout engagement",
  "temps","moyenne"),
 ("Industrie / logistique","Rapprochement de factures",
  "Controle facture / bon de livraison","regles",
  "Regles de rapprochement deterministes",
  "IA de rapprochement intelligent",
  "Le rapprochement est un probleme de correspondance exacte : le deterministe est superieur, plus fiable et gratuit",
  "cout","faible"),
]

def q(s):
    if s is None: return "NULL"
    return "'" + str(s).replace("'", "''") + "'"

def arr(lst):
    return "ARRAY[" + ",".join(q(x) for x in lst) + "]::text[]"

out = io.StringIO()
out.write(SCHEMA)
out.write("\n-- ============ SEED SECTEURS ============\n")
for s, p, ctx, vol, reg, mat, pres in PLAYBOOKS:
    out.write(f"INSERT INTO sector_playbooks(secteur,priorite,contexte,volumetrie,reglementation,maturite_ia,pression_ia) "
              f"VALUES({q(s)},{p},{q(ctx)},{q(vol)},{arr(reg)},{q(mat)},{q(pres)}) "
              f"ON CONFLICT(secteur) DO UPDATE SET priorite=EXCLUDED.priorite,contexte=EXCLUDED.contexte,"
              f"volumetrie=EXCLUDED.volumetrie,reglementation=EXCLUDED.reglementation,maturite_ia=EXCLUDED.maturite_ia,"
              f"pression_ia=EXCLUDED.pression_ia,updated_at=now();\n")
out.write("\n-- ============ SEED AUTOMATISATIONS ============\n")
for sec, proc, auto, niv, sobre, surv, piege, gain, cx in AUTOMATIONS:
    out.write(f"INSERT INTO sector_automations(secteur,processus,automatisation,niveau_ia,approche_sobre,"
              f"approche_survendue,piege,gain_type,complexite) VALUES({q(sec)},{q(proc)},{q(auto)},{q(niv)},"
              f"{q(sobre)},{q(surv)},{q(piege)},{q(gain)},{q(cx)}) "
              f"ON CONFLICT(secteur,processus) DO UPDATE SET automatisation=EXCLUDED.automatisation,"
              f"niveau_ia=EXCLUDED.niveau_ia,approche_sobre=EXCLUDED.approche_sobre,"
              f"approche_survendue=EXCLUDED.approche_survendue,piege=EXCLUDED.piege;\n")

open("seed/sector_library.sql", "w", encoding="utf-8").write(out.getvalue())
print("SQL genere :", len(out.getvalue()), "octets |", len(PLAYBOOKS), "secteurs |", len(AUTOMATIONS), "automatisations")
