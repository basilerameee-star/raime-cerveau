# -*- coding: utf-8 -*-
"""
MAQUETTE « PARCOURS » v5 (retours de Basile du 2026-09-21)
==========================================================
Le fond du site, de la typographie blanche par-dessus, aucune fenetre.
A gauche le titre, a droite les chemins en lignes. Un clic descend d'un etage ;
une petite fleche remonte.

v5 : fond plus sombre et moins vif ; accueil sans « Basile Rame, independant » ;
textes plus vendeurs, « Pour qui » repond toujours par des personnes ;
projets sans bouton, avec capture, explication et lien GitHub ; Cockpit ajoute ;
Gotham et le QG presentes comme termines.

USAGE   python parcours.py            -> ../../apercu-parcours/
"""
import io, json, shutil, pathlib, sys

ICI = pathlib.Path(__file__).resolve().parent
SITE = ICI.parent.parent
DIST = SITE / "dist"
SOURCE = SITE / "source"
CIBLE = SITE / "apercu-parcours"
# --rose : essai de la teinte « Pocket » (rose poudre et mauve) a la place du bleu, dans apercu-rose/
ROSE_ESSAI = "--rose" in sys.argv
if ROSE_ESSAI:
    CIBLE = SITE / "apercu-rose"
ROSE = [
    ('data-theme="bleu"', 'data-theme="rose"'),
    # particules : blanches, a peine rosees
    ("bleu:[[.78,.86,1],[1,1,1],[1,1,1],[1,1,1],0,1]}", "bleu:[[.78,.86,1],[1,1,1],[1,1,1],[1,1,1],0,1],rose:[[1,.84,.9],[1,1,1],[1,1,1],[1,1,1],0,1]}"),
    # fond : du mauve profond au rose poudre de la photo
    ("#1d3f78 0%,#2855a0 38%,#3469b8 70%,#417dc8 100%", "#6e5569 0%,#8c7187 38%,#ab8fa4 70%,#cfa9ba 100%"),
    # voile plus leger que sur le bleu : la photo est claire et poudree
    ("rgba(8,16,34,.62) 0%,rgba(8,16,34,.42) 45%,rgba(8,16,34,.24) 80%,rgba(8,16,34,.32) 100%",
     "rgba(42,24,38,.46) 0%,rgba(42,24,38,.3) 45%,rgba(42,24,38,.12) 80%,rgba(42,24,38,.2) 100%"),
    ("background:#1f457f}", "background:#6f5669}"),
    ("linear-gradient(118deg,#14305e,#2c5a9c)", "linear-gradient(118deg,#4e3b4b,#9b7d92)"),
    ("rgba(8,16,34,", "rgba(42,24,38,"), ("rgba(4,12,30,", "rgba(36,18,32,"), ("rgba(3,10,30,", "rgba(32,14,28,"),
    # textes : blancs un peu chauds ; l'italique des titres prend le rose de la carte
    ("--texte:#dfe5ee; --gris:#c3ccda;", "--texte:#f2e8ee; --gris:#e2d0da;"),
    ("color:#d7dde8}", "color:#f6d3dc}"),
    ("rgba(223,229,238,.72)", "rgba(242,232,238,.74)"),
    # bouton principal : le rose de la carte, texte prune
    ("background:#f4f7fb;color:#0f2447;", "background:#f5d0d8;color:#3d2437;"),
    (".pc-bouton:hover{background:#fff;", ".pc-bouton:hover{background:#fbe1e6;"),
]
RESERVER = "https://calendar.app.google/HdhqAt3BaQFWfx2g7"
# La meme page de reservation, dans sa version integrable (?gv=true : Google autorise son affichage
# dans une fenetre d'un autre site). Verifiee le 25/09/2026.
AGENDA = ("https://calendar.google.com/calendar/appointments/schedules/"
          "AcZssZ1NsZX-UR_txvtIcaGo06kKAj-Q8YzeMIQC5A7fbAst5bN7Su43SJM_RvMYFP1-mP6pU4W2ngTI?gv=true")
# Les avis Google de rAIme : note sur 5, nombre d'avis, lien vers la fiche. Tant que le nombre
# vaut 0, rien ne s'affiche en ligne ; l'apercu montre seulement l'emplacement.
AVIS = dict(note=None, nombre=0, lien=None)
# La mention « finançable par le CPF » : a n'allumer QUE le jour ou la formation est inscrite sur
# Mon Compte Formation (par rAIme, ou par un organisme partenaire comme Revolia). Avant, ce serait une
# publicite trompeuse ; le logo « Mon Compte Formation » est reserve aux organismes inscrits.
CPF_ACTIF = False
PROD = "--prod" in sys.argv   # raime.fr : indexable ; sinon apercu en noindex

# --noir : essai du 25/09/2026, voulu par Basile d'apres le site Armory AI : fond noir, et une
# page d'accueil qui se deroule, avec des blocs alternes (texte d'un cote, visuel de l'autre)
# qui expliquent l'IA de plus pres. Sortie dans apercu-noir/ ; la production ne bouge pas.
NOIR_ESSAI = "--noir" in sys.argv or "--nardo" in sys.argv
if NOIR_ESSAI:
    CIBLE = SITE / "apercu-noir"
# --nardo (25/09/2026, demande de Basile) : le noir sur fond gris Nardo mat, texte noir (voir nardo.py)
NARDO = "--nardo" in sys.argv
if NARDO:
    CIBLE = SITE / "apercu-nardo"
# --nardo-blanc : le vrai gris Nardo, texte blanc (voir nardo.py)
NARDO_BLANC = "--nardo-blanc" in sys.argv
if NARDO_BLANC:
    NOIR_ESSAI = True
    CIBLE = SITE / "apercu-nardo-blanc"
NOIR = [
    ('data-theme="bleu"', 'data-theme="noir"'),
    # un fond de nuit plutot qu'un noir pur, et un quadrillage a peine visible
    ("rgba(255,255,255,.035) 1px,transparent 1px) 0 0/72px 72px,\n             linear-gradient(90deg,rgba(255,255,255,.035) 1px",
     "rgba(255,255,255,.016) 1px,transparent 1px) 0 0/72px 72px,\n             linear-gradient(90deg,rgba(255,255,255,.016) 1px"),
    ("#1d3f78 0%,#2855a0 38%,#3469b8 70%,#417dc8 100%", "#000 0%,#020202 45%,#040404 75%,#070707 100%"),
    ("rgba(8,16,34,.62) 0%,rgba(8,16,34,.42) 45%,rgba(8,16,34,.24) 80%,rgba(8,16,34,.32) 100%",
     "rgba(0,0,0,.30) 0%,rgba(0,0,0,.18) 45%,rgba(0,0,0,.08) 80%,rgba(0,0,0,.2) 100%"),
    ("background:#1f457f}", "background:#000}"),
    ("linear-gradient(118deg,#14305e,#2c5a9c)", "linear-gradient(118deg,#000,#0d0d0d)"),
    ("rgba(8,16,34,", "rgba(0,0,0,"), ("rgba(4,12,30,", "rgba(0,0,0,"), ("rgba(3,10,30,", "rgba(0,0,0,"),
    ("--texte:#dfe5ee; --gris:#c3ccda;", "--texte:#f5f5f5; --gris:#a6a6a6;"),
    ("color:#d7dde8}", "color:#b9b9b9}"),
    ("rgba(223,229,238,.72)", "rgba(230,230,230,.66)"),
    ("background:#f4f7fb;color:#0f2447;", "background:#fff;color:#000;"),
    (".pc-bouton:hover{background:#fff;", ".pc-bouton:hover{background:#e9e9e9;"),
]
DESCRIPTION = ("rAIme, conseil en intelligence artificielle : formation des dirigeants et des équipes, "
               "audit des postes, analyse des propositions, automatisation.")
GH = "https://github.com/basilerameee-star/"
# reseaux affiches en haut a droite, avec leur logo (Simple Icons, CC0).
# LinkedIn s'affiche des que son adresse est renseignee.
LINKEDIN_URL = "https://www.linkedin.com/in/basile-rame-b02866391/"
LIVRE_URL = "https://buy.stripe.com/7sYcN49e9b2u352d98fw400"  # paiement Stripe ; livraison par functions/stripe-webhook.js
RESEAUX = [("GitHub", "https://github.com/basilerameee-star", "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"),
           ("LinkedIn", LINKEDIN_URL, "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 4.892v6.249zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z")]

# ── L'arbre ─────────────────────────────────────────────────────────────────
NOEUDS = {
    "accueil": dict(type="chemins", etiquette="rAIme",
        titre=("rAIme,", "conseil en intelligence artificielle."),
        phrase="Formation, automatisation, audit des postes, analyse des propositions reçues.",
        enfants=["particulier", "pro", "projets"]),

    "particulier": dict(type="fiche", titre="Se former à l'IA", etiquette="Particulier",
        libelle="Particulier", court="Formez-vous à l'IA : plaisir et projets",
        phrase="Apprenez à vous servir de l'IA au quotidien, pour le plaisir, pour créer, ou pour lancer votre activité.",
        faits=[("Pour qui", "Les débutants, les curieux, les futurs indépendants"),
               ("Durée", "16 heures de formation"),
               ("Le format", "Un accompagnement personnel, avec un formateur"),
               ("Et après", "Une plateforme de cours, accès à vie")]),

    "pro": dict(type="chemins", etiquette="Professionnel", court="Pour votre entreprise : former, auditer, arbitrer, automatiser",
        titre=("Pour", "votre entreprise."),
        phrase="Former vos équipes, trouver où gagner du temps, choisir le bon prestataire, automatiser le reste.",
        enfants=["pro/formation", "pro/audit", "pro/arbitrage", "pro/automatisation"]),

    "pro/formation": dict(type="chemins", etiquette="Formation", court="Vos équipes, prêtes à s'en servir",
        titre=("Une journée,", "pour chaque niveau."),
        phrase="Du dirigeant aux équipes, chacun repart avec ce qui lui sert.",
        enfants=["pro/formation/dirigeant", "pro/formation/codir", "pro/formation/employes"]),

    "pro/formation/dirigeant": dict(type="fiche", titre="Dirigeant", etiquette="Formation",
        court="Comprendre et fixer le cap",
        phrase="Comprenez l'IA en une journée, et fixez le cap de votre entreprise.",
        faits=[("Pour qui", "Dirigeants, gérants, associés"),
               ("Durée", "Une journée de 7 heures, chez vous ou en visio"),
               ("Tarif", "À la journée ou au forfait"),
               ("Le résultat", "Vos priorités, écrites et datées")]),

    "pro/formation/codir": dict(type="fiche", titre="Codir", etiquette="Formation",
        court="Toute la direction, dans le même sens",
        phrase="Une journée pour que toute la direction parle le même langage.",
        faits=[("Pour qui", "Votre comité de direction, jusqu'à 8 personnes"),
               ("Durée", "Une journée de 7 heures"),
               ("Tarif", "À la journée ou au forfait"),
               ("Le résultat", "Un cap commun et des règles claires pour tous")]),

    "pro/formation/employes": dict(type="fiche", titre="Employés", etiquette="Formation",
        court="Du temps gagné dès le lendemain",
        phrase="Une journée pour que vos équipes gagnent du temps dès le lendemain.",
        faits=[("Pour qui", "Vos équipes, jusqu'à 10 personnes"),
               ("Durée", "Une journée de 7 heures, ou plus au forfait, sur leurs vraies tâches"),
               ("Le résultat", "Des gestes utilisés dès le jour suivant")]),

    "pro/audit": dict(type="fiche", titre="Audit de vos postes", etiquette="Professionnel",
        court="Combien d'heures pouvez-vous gagner ?",
        phrase="Découvrez, poste par poste, où l'IA vous fait gagner du temps, avant d'investir un euro.",
        faits=[("Pour qui", "Les entreprises qui veulent savoir où l'IA rapporte, de la TPE au groupe"),
               ("Durée", "Une à deux semaines"),
               ("Le résultat", "Les gains classés et un plan d'action sur 90 jours")]),

    "pro/arbitrage": dict(type="fiche", titre="Arbitrage", etiquette="Professionnel",
        court="Le bon prestataire, au bon prix",
        phrase="Un prestataire vous propose de l'IA ? Un avis indépendant avant de signer.",
        faits=[("Pour qui", "Dirigeants qui ont reçu une ou plusieurs offres"),
               ("Durée", "Une semaine"),
               ("Indépendance", "Aucune commission, d'aucun prestataire"),
               ("Le résultat", "Le coût réel sur trois ans, et une recommandation claire")]),

    "pro/automatisation": dict(type="fiche", titre="Automatisation", etiquette="Professionnel",
        court="Là où l'IA travaille pour vous",
        phrase="Confiez vos tâches répétitives à des agents qui travaillent pour vous, jour et nuit.",
        faits=[("Pour qui", "Les entreprises dont les équipes passent des heures sur des tâches répétitives"),
               ("Durée", "De quelques jours à quelques semaines, selon le projet"),
               ("Le résultat", "Des agents en service, suivis, et du temps rendu à vos équipes")],
        preuve=("La preuve : les agents qui font tourner rAIme", "projets/raime")),

    "projets": dict(type="chemins", etiquette="Projets", court="Des outils qui tournent chaque jour",
        titre=("Nos projets,", "en service."),
        phrase="Des outils construits pour de vrai, qui tournent chaque jour.",
        enfants=["projets/raime", "projets/cockpit", "projets/qg", "projets/clio", "projets/voyage", "projets/gotham"]),

    "projets/raime": dict(type="projet", titre="Les agents rAIme", etiquette="Projets",
        court="Une équipe d'agents qui fait tourner l'entreprise",
        phrase="Vingt-huit agents et automatismes font tourner l'entreprise, jour et nuit : ils cherchent, écrivent, surveillent et préviennent.",
        faits=[("Ce qu'ils font", "Ils repèrent des entreprises, trouvent les contacts, rédigent et suivent l'actualité de l'IA"),
               ("Chaque matin", "Un rapport complet, envoyé automatiquement"),
               ("Leur force", "Une proposition commerciale analysée en 144 secondes")],
        image=("/projets/raime-cockpit.webp", "Le tableau de bord des agents rAIme", 1280, 600),
        chiffres=[("28", "agents et automatismes en service"), ("2 887", "entreprises repérées"), ("200+", "articles lus chaque jour")]),

    "projets/cockpit": dict(type="projet", titre="Cockpit", etiquette="Projets",
        court="Le poste de pilotage d'un assistant de direction",
        phrase="Le poste de pilotage d'un assistant de direction : la journée, les contacts et l'agenda au même endroit.",
        faits=[("Comment ça marche", "La journée se construit seule, à partir des routines et de l'agenda"),
               ("L'agent", "Il lit l'agenda et propose les actions, toujours validées par l'humain"),
               ("Les données", "Restent sur l'ordinateur, exportables d'un clic")],
        image=("/projets/cockpit-pa.webp", "Le Cockpit assistant personnel, vue de la journée", 1040, 660),
        liens=[("Voir le code", GH + "Cockpit-P.A")]),

    "projets/qg": dict(type="projet", titre="Le QG", etiquette="Projets",
        court="Le pro et le perso, au même endroit",
        phrase="Tout le pro et le perso au même endroit, sur l'ordinateur comme sur le téléphone.",
        faits=[("Commande vocale", "Une phrase dictée devient une tâche, rangée au bon endroit"),
               ("Tri automatique", "Ce qui arrive est classé seul ; le reste attend dans « À trier »"),
               ("Partout", "L'ordinateur et le téléphone restent synchronisés")],
        image=("/projets/qg.webp", "Le QG, la semaine vue comme un agenda, couleurs selon l'importance", 1296, 720)),

    "projets/clio": dict(type="projet", titre="Clio", etiquette="Projets",
        court="Réviser l'histoire en clair",
        phrase="Un cours d'histoire devient une fiche claire, un quiz et une chronologie, en quelques secondes.",
        faits=[("Pour qui", "Les étudiants"),
               ("Conçu en", "3 jours"),
               ("Comment ça marche", "Le cours est lu, résumé en fiche en 36 secondes, relu, puis transformé en quiz")],
        image=("/projets/clio.webp", "Clio, une fiche de révision générée", 1280, 600),
        chiffres=[("36 s", "pour une fiche complète"), ("100", "questions de quiz"), ("0 €", "par fiche")],
        liens=[("Voir le code", GH + "Clio")]),

    "projets/voyage": dict(type="projet", titre="Voyage Live", etiquette="Projets",
        court="Le vrai prix d'un séjour",
        phrase="Le vrai prix d'un séjour, destination par destination, mis à jour en continu.",
        faits=[("Pour qui", "Les voyageurs qui comparent leurs destinations"),
               ("En ligne en", "2 jours"),
               ("Couverture", "500 destinations, notées sur six critères")],
        image=("/projets/voyage.webp", "Voyage Live, le prix des destinations", 1280, 600),
        chiffres=[("500", "destinations"), ("6", "critères dans le score"), ("2 jours", "pour la mise en ligne")],
        liens=[("Voir le site", "https://voyage.raime.fr/"), ("Voir le code", GH + "voyage.raime")]),

    "projets/gotham": dict(type="projet", titre="Gotham", etiquette="Projets",
        court="Le monde en direct, sur un globe en 3D",
        phrase="Une veille géopolitique en direct : le monde sur un globe en 3D, pays par pays.",
        faits=[("Comment ça marche", "Chaque pays a sa fiche : population, indicateurs, rang de puissance"),
               ("En direct", "Les actualités du monde défilent en temps réel"),
               ("Pour creuser", "Un clic mène aux sources : actualités, économie, encyclopédie")],
        image=("/projets/gotham.webp", "Gotham 2.0, le globe centré sur l'Europe", 1048, 660)),

    # Les prix fixes par Basile le 25/09/2026 (Dirigeant 690, Codir 990, Equipe sur vos cas reels 1 400 ;
    # audit et arbitrage inchanges ; automatisation sur devis tant qu'il n'a pas donne de prix de depart).
    "tarifs": dict(type="tarifs", etiquette="Offres et tarifs", titre=("Nos tarifs,", "nets et clairs."),
        phrase="Un appel d'une heure pour cadrer le besoin, puis un devis écrit.",
        onglets=dict(
          pro=dict(
            colonnes=[dict(nom="Former", pour="Dirigeants, comités de direction, équipes", prix="690 €", unite="à partir de, la journée"),
                      dict(nom="Auditer", pour="Les entreprises qui veulent savoir où l'IA rapporte", prix="1 500 €", unite="à partir de", fort=True, comment="audit"),
                      dict(nom="Arbitrer", pour="Les dirigeants qui ont reçu une ou plusieurs offres", prix="2 500 €", unite="à partir de", comment="arbitrage"),
                      dict(nom="Automatiser", pour="Les entreprises dont les équipes passent des heures sur des tâches répétitives",
                           prix="30 %", unite="du gain annuel estimé")],
            lignes=[("Durée", "Une journée de 7 heures", "Une à deux semaines", "Une semaine", "De quelques jours à quelques semaines"),
                    ("Les prix", "Dirigeant 690 € · Codir 990 € · Équipe, sur vos cas réels 1 400 €",
                     "Jusqu'à 20 personnes 1 500 € · Au-delà 2 500 €", "Analyse d'une offre 2 500 € · Arbitrage complet 4 000 €",
                     "30 % du gain annuel estimé, calculé avec vous ligne à ligne"),
                    ("Le résultat", "Des gestes utilisés dès le lendemain", "Les gains classés et un plan d'action sur 90 jours",
                     "Le coût réel sur trois ans, et une recommandation claire", "Des agents en service, suivis, et du temps rendu à vos équipes")],
            notes=["Suivi mensuel : 900 € par mois, deux réunions, après une formation ou un audit.",
                   "Prix nets, TVA non applicable (article 293 B du CGI)."]),
          particulier=dict(
            colonnes=[dict(nom="Se former", pour="Les débutants, les curieux, les futurs indépendants", prix="1 650 €", unite="la formation",
                           fort=True, cpf="Finançable jusqu'à 1 500 € avec votre compte CPF")],
            # (le livre a ete retire du site le 25/09/2026, a la demande de Basile)
            lignes=[("Durée", "16 heures de formation"),
                    ("Le format", "Un accompagnement personnel, avec un formateur"),
                    ("Et après", "Une plateforme de cours, accès à vie")],
            notes=["Prix nets, TVA non applicable (article 293 B du CGI)."]))),
}


# ── La version anglaise (25/09/2026) : memes pages, memes liens, textes traduits ──
EN = {
    "accueil": dict(titre=("rAIme,", "artificial intelligence consulting."),
        phrase="Training, automation, workplace audits, independent review of the offers you receive."),
    "particulier": dict(titre="Learn AI", etiquette="Individuals", libelle="Individuals",
        court="Learn AI: for fun and for your projects",
        phrase="Learn to use AI every day, for fun, to create, or to launch your business.",
        faits=[("Who it's for", "Beginners, the curious, future freelancers"), ("Duration", "16 hours of training"),
               ("Format", "Personal coaching with a trainer"), ("And after", "A course platform, lifetime access")]),
    "pro": dict(etiquette="Business", court="For your company: train, audit, review, automate",
        titre=("For", "your company."),
        phrase="Train your teams, find where to save time, choose the right provider, automate the rest."),
    "pro/formation": dict(etiquette="Training", court="Your teams, ready to use it",
        titre=("One day,", "for every level."), phrase="From executives to teams, everyone leaves with what they need."),
    "pro/formation/dirigeant": dict(titre="Executives", etiquette="Training", court="Understand and set the course",
        phrase="Understand AI in one day, and set your company's course.",
        faits=[("Who it's for", "Executives, managers, partners"), ("Duration", "One 7-hour day, at your office or online"),
               ("Price", "Per day or as a package"), ("The result", "Your priorities, written and dated")]),
    "pro/formation/codir": dict(titre="Leadership team", etiquette="Training", court="The whole leadership, aligned",
        phrase="One day for the whole leadership team to speak the same language.",
        faits=[("Who it's for", "Your leadership team, up to 8 people"), ("Duration", "One 7-hour day"),
               ("Price", "Per day or as a package"), ("The result", "A shared direction and clear rules for everyone")]),
    "pro/formation/employes": dict(titre="Employees", etiquette="Training", court="Time saved from the very next day",
        phrase="One day for your teams to save time from the very next day.",
        faits=[("Who it's for", "Your teams, up to 10 people"),
               ("Duration", "One 7-hour day, or more as a package, on their real tasks"),
               ("The result", "Skills used from the very next day")]),
    "pro/audit": dict(titre="Workplace audit", etiquette="Business", court="How many hours could you save?",
        phrase="Find out, role by role, where AI saves you time, before investing a single euro.",
        faits=[("Who it's for", "Companies that want to know where AI pays off, from small businesses to groups"),
               ("Duration", "One to two weeks"), ("The result", "Ranked gains and a 90-day action plan")]),
    "pro/arbitrage": dict(titre="Independent review", etiquette="Business", court="The right provider, at the right price",
        phrase="A provider is offering you AI? An independent opinion before you sign.",
        faits=[("Who it's for", "Executives who have received one or more offers"), ("Duration", "One week"),
               ("Independence", "No commission from any provider"),
               ("The result", "The real three-year cost, and a clear recommendation")]),
    "pro/automatisation": dict(titre="Automation", etiquette="Business", court="Where AI works for you",
        phrase="Hand your repetitive tasks to agents that work for you, day and night.",
        faits=[("Who it's for", "Companies whose teams spend hours on repetitive tasks"),
               ("Duration", "From a few days to a few weeks, depending on the project"),
               ("The result", "Agents in service, monitored, and time given back to your teams")],
        preuve=("The proof: the agents that run rAIme", "projets/raime")),
    "projets": dict(etiquette="Projects", court="Tools that run every day", titre=("Our projects,", "in production."),
        phrase="Tools built for real, running every day."),
    "projets/raime": dict(titre="The rAIme agents", etiquette="Projects", court="A team of agents running the company",
        phrase="Twenty-eight agents and automations run the company, day and night: they search, write, monitor and alert.",
        faits=[("What they do", "They find companies, locate contacts, write, and follow AI news"),
               ("Every morning", "A full report, sent automatically"),
               ("Their strength", "A sales proposal analysed in 144 seconds")],
        image=("/projets/raime-cockpit.webp", "The rAIme agents dashboard", 1280, 600),
        chiffres=[("28", "agents and automations in service"), ("2,887", "companies identified"), ("200+", "articles read every day")]),
    "projets/cockpit": dict(titre="Cockpit", etiquette="Projects", court="An executive assistant's control panel",
        phrase="An executive assistant's control panel: the day, contacts and calendar in one place.",
        faits=[("How it works", "The day builds itself from routines and the calendar"),
               ("The agent", "It reads the calendar and suggests actions, always approved by a human"),
               ("The data", "Stays on the computer, exportable in one click")],
        image=("/projets/cockpit-pa.webp", "The personal assistant Cockpit, day view", 1040, 660),
        liens=[("See the code", GH + "Cockpit-P.A")]),
    "projets/qg": dict(titre="The HQ", etiquette="Projects", court="Work and personal life, in one place",
        phrase="All your work and personal life in one place, on computer and phone.",
        faits=[("Voice command", "A dictated sentence becomes a task, filed in the right place"),
               ("Automatic sorting", "Incoming items are sorted automatically; the rest waits in “To sort”"),
               ("Everywhere", "Computer and phone stay in sync")],
        image=("/projets/qg.webp", "The HQ, the week as a calendar, colours by importance", 1296, 720)),
    "projets/clio": dict(titre="Clio", etiquette="Projects", court="History revision, made clear",
        phrase="A history lesson becomes a clear summary sheet, a quiz and a timeline, in seconds.",
        faits=[("Who it's for", "Students"), ("Built in", "3 days"),
               ("How it works", "The lesson is read, summarised in 36 seconds, checked, then turned into a quiz")],
        image=("/projets/clio.webp", "Clio, a generated revision sheet", 1280, 600),
        chiffres=[("36 s", "for a complete sheet"), ("100", "quiz questions"), ("€0", "per sheet")],
        liens=[("See the code", GH + "Clio")]),
    "projets/voyage": dict(titre="Voyage Live", etiquette="Projects", court="The real price of a trip",
        phrase="The real price of a trip, destination by destination, updated continuously.",
        faits=[("Who it's for", "Travellers comparing destinations"), ("Online in", "2 days"),
               ("Coverage", "500 destinations, rated on six criteria")],
        image=("/projets/voyage.webp", "Voyage Live, destination prices", 1280, 600),
        chiffres=[("500", "destinations"), ("6", "criteria in the score"), ("2 days", "to go live")],
        liens=[("See the site", "https://voyage.raime.fr/"), ("See the code", GH + "voyage.raime")]),
    "projets/gotham": dict(titre="Gotham", etiquette="Projects", court="The world live, on a 3D globe",
        phrase="Live geopolitical monitoring: the world on a 3D globe, country by country.",
        faits=[("How it works", "Each country has its profile: population, indicators, power ranking"),
               ("Live", "World news scrolls in real time"),
               ("Dig deeper", "One click leads to the sources: news, economy, encyclopedia")],
        image=("/projets/gotham.webp", "Gotham 2.0, the globe centred on Europe", 1048, 660)),
    "tarifs": dict(etiquette="Offers & pricing", titre=("Our prices,", "clear and simple."),
        phrase="A one-hour call to frame your needs, then a written quote.",
        onglets=dict(
          pro=dict(
            colonnes=[dict(nom="Train", pour="Executives, leadership teams, staff", prix="€690", unite="from, per day"),
                      dict(nom="Audit", pour="Companies that want to know where AI pays off", prix="€1,500", unite="from", fort=True, comment="audit"),
                      dict(nom="Review", pour="Executives who have received one or more offers", prix="€2,500", unite="from", comment="arbitrage"),
                      dict(nom="Automate", pour="Companies whose teams spend hours on repetitive tasks", prix="30%", unite="of the estimated annual gain")],
            lignes=[("Duration", "One 7-hour day", "One to two weeks", "One week", "From a few days to a few weeks"),
                    ("Prices", "Executives €690 · Leadership team €990 · Team, on your real cases €1,400",
                     "Up to 20 people €1,500 · Beyond €2,500", "Review of one offer €2,500 · Full comparison €4,000",
                     "30% of the estimated annual gain, calculated with you line by line"),
                    ("The result", "Skills used from the very next day", "Ranked gains and a 90-day action plan",
                     "The real three-year cost, and a clear recommendation", "Agents in service, monitored, and time given back to your teams")],
            notes=["Monthly support: €900 per month, two meetings, after a training course or an audit.",
                   "Net prices, VAT not applicable (French tax code, art. 293 B)."]),
          particulier=dict(
            colonnes=[dict(nom="Learn", pour="Beginners, the curious, future freelancers", prix="€1,650", unite="the training",
                           fort=True, cpf="Eligible for up to €1,500 with your French CPF account")],
            lignes=[("Duration", "16 hours of training"),
                    ("Format", "Personal coaching with a trainer"),
                    ("And after", "A course platform, lifetime access")],
            notes=["Net prices, VAT not applicable (French tax code, art. 293 B)."]))),
}
assert set(EN) == set(NOEUDS), set(NOEUDS) ^ set(EN)
NOEUDS_EN = {k: {**v, **EN[k]} for k, v in NOEUDS.items()}

# Les mots de l'interface, dans les deux langues.
UI = {
    "fr": dict(accueil="Accueil", titre="rAIme — conseil en intelligence artificielle", reserver="Réserver un appel d'une heure",
               decouvrir="Découvrir", legal=["Mentions légales", "CGV", "Confidentialité"], autre="Read in English",
               jour="Passer en version jour", nuit="Passer en version nuit",
               cta="Réserver un appel", avis="avis Google", avis_bientot="Vos avis Google s'afficheront ici",
               cle=["Améliorer votre quotidien", "avec l'IA."], comment="Comment ça marche", rdv_mono="Un appel d'une heure",
               rdv_titre="Choisissez votre créneau. La confirmation arrive par e-mail.", menu="Menu", fermer="Fermer", liens_rapides="Liens rapides", autres_liens="Autres liens", contact="Nous écrire",
               livre_court="Le livre", menu_phrase="Choisir la bonne IA, et le prouver.", menu_lieu="Haute-Savoie · Genève · à distance",
               livre="Le livre<i> · L'IA pour tous</i>",
               noms={"accueil": "Accueil", "particulier": "Particulier", "pro": "Professionnel", "projets": "Projets",
                     "pro/formation": "Formation", "pro/audit": "Audit", "pro/arbitrage": "Arbitrage",
                     "pro/automatisation": "Automatisation", "tarifs": "Offres et tarifs",
                     "tarifs/particulier": "Particulier"}, onglet_pro="Professionnel", onglet_part="Particulier"),
    "en": dict(accueil="Home", titre="rAIme — artificial intelligence consulting", reserver="Book a one-hour call",
               decouvrir="Discover", legal=["Legal notice", "Terms", "Privacy"], autre="Lire en français",
               jour="Switch to day mode", nuit="Switch to night mode",
               cta="Book a call", avis="Google reviews", avis_bientot="Your Google reviews will appear here",
               cle=["Improve your daily life", "with AI."], comment="How it works", rdv_mono="A one-hour call",
               rdv_titre="Pick your slot. The confirmation arrives by email.", menu="Menu", fermer="Close", liens_rapides="Quick links", autres_liens="Other links", contact="Write to us",
               livre_court="The book (French)", menu_phrase="Choose the right AI, and prove it.", menu_lieu="Haute-Savoie · Geneva · remote",
               livre="The book<i> · in French</i>",
               noms={"accueil": "Home", "particulier": "Individuals", "pro": "Business", "projets": "Projects",
                     "pro/formation": "Training", "pro/audit": "Audit", "pro/arbitrage": "Review",
                     "pro/automatisation": "Automation", "tarifs": "Offers & pricing",
                     "tarifs/particulier": "Individuals"}, onglet_pro="Business", onglet_part="Individuals"),
}

STYLE = """
/* L'AUDIT EN CARTE ANIMÉE (02/10/2026) : le fil de lumière, le classement des tâches, le plan qui se remplit. */
.pa-etapes{margin-top:40px!important}
.pa-etapes{list-style:none;padding:0;margin:0 0 44px;display:grid;grid-template-columns:repeat(4,1fr);gap:0;position:relative}
.pa-etapes::before{content:"";position:absolute;left:12%;right:12%;top:17px;height:1px;background:rgba(255,255,255,.18);transform-origin:left;transform:scaleX(0);animation:pa-trace 1.4s cubic-bezier(.16,1,.3,1) .2s forwards}
.pa-etapes::after{content:"";position:absolute;left:12%;top:15px;width:42px;height:5px;border-radius:5px;background:radial-gradient(closest-side,#fff,rgba(255,255,255,0));opacity:0;animation:pa-lumiere 3.2s linear 1.6s infinite}
.pa-etapes li{position:relative;text-align:center;padding:0 10px;opacity:0;transform:translateY(12px);animation:pa-monte .8s cubic-bezier(.16,1,.3,1) calc(.25s + var(--k)*.22s) forwards}
.pa-n{display:inline-grid;place-items:center;width:34px;height:34px;border-radius:50%;border:1px solid rgba(255,255,255,.4);background:#000;position:relative;z-index:1;
  font:500 12px ui-monospace,"SF Mono",Menlo,Consolas,monospace;margin-bottom:14px;animation:pa-allume .9s ease calc(1.6s + var(--k)*.8s) 1 both}
.pa-etapes b{display:block;font-size:18px;font-weight:600;letter-spacing:-.01em}
.pa-etapes small{display:block;margin-top:6px;font-size:13px;line-height:1.4;color:#a6a6a6}
.pa-deux{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:40px;padding-top:30px;border-top:1px solid rgba(255,255,255,.12)}
.pa-doutes{list-style:none;padding:0;margin:14px 0 0}
.pa-doutes li{padding:14px 0;border-bottom:1px solid rgba(255,255,255,.08);font-size:17px;line-height:1.35;cursor:help}
.pa-texte{color:#a6a6a6;position:relative;transition:color .4s}
.pa-texte.pa-repondu{color:#fff}
.pa-texte::after{content:"";position:absolute;left:0;right:0;top:55%;height:1px;background:#a6a6a6;transform:scaleX(0);transform-origin:left;transition:transform .5s cubic-bezier(.65,0,.35,1)}
.pa-texte.pa-barre::after{transform:scaleX(1)}
.pa-texte.pa-repondu::after{transform:scaleX(0);transition:none}
.pa-jours{margin:12px 0 18px;font-size:16px;color:#a6a6a6}
.pa-jours b{display:inline-block;min-width:2ch;font-size:clamp(56px,6vw,84px);font-weight:600;letter-spacing:-.05em;line-height:1;color:#fff;font-variant-numeric:tabular-nums;margin-right:6px}
.pa-recu{font-size:17px;line-height:1.4;color:#fff;min-height:1.4em}
.pa-recu--2{color:#a6a6a6;margin-top:8px}
@keyframes pa-trace{to{transform:scaleX(1)}}
@keyframes pa-monte{to{opacity:1;transform:none}}
@keyframes pa-apparait{to{opacity:1}}
@keyframes pa-allume{50%{border-color:#fff;box-shadow:0 0 18px rgba(255,255,255,.55)}}
@keyframes pa-lumiere{0%{left:12%;opacity:0}8%{opacity:1}92%{opacity:1}100%{left:calc(88% - 42px);opacity:0}}
@media (max-width:760px){
  .pa-etapes{grid-template-columns:1fr;gap:22px;text-align:left}
  .pa-etapes::before,.pa-etapes::after{display:none}
  .pa-etapes li{text-align:left;display:grid;grid-template-columns:44px 1fr;column-gap:12px;padding:0}
  .pa-n{grid-row:span 2;margin:0}
  .pa-deux{grid-template-columns:1fr;gap:28px}
}
@media (prefers-reduced-motion:reduce){.pa *,.pa *::before,.pa *::after,.pa-etapes::before,.pa-etapes::after{animation-duration:.01ms!important;animation-delay:0s!important;animation-iteration-count:1!important}}
@font-face{font-family:Inter;font-style:normal;font-weight:100 900;font-display:swap;src:url(/fonts/InterVariable.woff2) format("woff2")}
@font-face{font-family:Inter;font-style:italic;font-weight:400;font-display:swap;src:url(/fonts/Inter-Italic-400.woff2) format("woff2")}
:root{--encre:#ececec; --texte:#dfe5ee; --gris:#c3ccda; --trait:rgba(255,255,255,.14); --doux:cubic-bezier(.22,1,.36,1)}
*{box-sizing:border-box}
html,body{min-height:100%}
body{margin:0;color:var(--texte);font-family:Inter,-apple-system,"Segoe UI",sans-serif;font-size:16px;line-height:1.5;
  letter-spacing:-.011em;-webkit-font-smoothing:antialiased;scrollbar-width:none;background:#1f457f}
body::-webkit-scrollbar{display:none}
body::before{content:"";position:fixed;inset:0;z-index:-3;pointer-events:none;
  background:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px) 0 0/72px 72px,
             linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px) 0 0/72px 72px,
             linear-gradient(118deg,#1d3f78 0%,#2855a0 38%,#3469b8 70%,#417dc8 100%)}
.rp-fond{position:fixed;left:0;top:0;width:100vw;height:100lvh;z-index:-1;pointer-events:none;opacity:0;
  transition:opacity 1.4s var(--doux)}
.rp-fond.rp-pret{opacity:.48}
/* un voile plus soutenu, sans bord : un fond plus sombre et moins vif, le texte blanc ressort */
body::after{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;
  background:linear-gradient(104deg,rgba(8,16,34,.62) 0%,rgba(8,16,34,.42) 45%,rgba(8,16,34,.24) 80%,rgba(8,16,34,.32) 100%)}
a{color:inherit}
:focus-visible{outline:2px solid rgba(255,255,255,.85);outline-offset:4px}

/* CHARGEMENT */
.pc-charge{position:fixed;inset:0;z-index:60;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;
  background:linear-gradient(118deg,#14305e,#2c5a9c);transition:opacity .7s ease,visibility .7s}
.pc-charge img{width:56px;height:auto;opacity:.92}
.pc-piste{width:min(220px,46vw);height:1px;background:rgba(255,255,255,.22);overflow:hidden}
.pc-piste i{display:block;height:100%;width:0;background:#fff;transition:width 1.1s var(--doux)}
.pc-charge p{margin:0;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.7)}
.pc-charge.pc-partie{opacity:0;visibility:hidden}

/* EN-TETE : logo, fleche de retour, chemin */
.pc-tete{position:fixed;top:0;left:0;right:0;z-index:20;display:flex;align-items:center;gap:18px;height:76px;
  padding:0 clamp(20px,5vw,72px)}
.pc-logo{display:block;line-height:0}
.pc-logo img{height:38px;width:auto}
.pc-retour{appearance:none;width:34px;height:34px;display:none;place-items:center;border:0;border-radius:50%;
  background:rgba(255,255,255,.08);color:var(--encre);font-size:19px;line-height:1;cursor:pointer;
  transition:background-color .3s,transform .3s var(--doux)}
.pc-retour.pc-la{display:grid}
.pc-retour:hover{background:rgba(255,255,255,.16);transform:translateX(-2px)}
.pc-fil{display:flex;align-items:center;gap:10px;font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:var(--gris)}
.pc-fil button{appearance:none;background:none;border:0;padding:0;font:inherit;color:var(--gris);cursor:pointer}
.pc-fil button:hover{color:var(--encre)}
.pc-fil span{opacity:.4}

/* SCENE : rien que du texte sur le champ */
.pc-scene{position:relative;min-height:100svh;display:flex;align-items:center;
  padding:110px clamp(20px,5vw,72px) 64px}
.pc-vue{width:min(1180px,100%);margin:0 auto;display:grid;grid-template-columns:minmax(0,5fr) minmax(0,6fr);
  gap:clamp(32px,6vw,96px);align-items:center}
.pc-vue--fiche{grid-template-columns:minmax(0,6fr) minmax(0,5fr);align-items:start}
.pc-vue--projet{grid-template-columns:minmax(0,5fr) minmax(0,6fr);align-items:start}

.pc-etiquette{margin:0 0 18px;font-size:12px;font-weight:500;letter-spacing:.16em;text-transform:uppercase;color:var(--gris);
  opacity:0;animation:pc-monte .6s var(--doux) forwards}
.pc-titre{margin:0;font-size:clamp(38px,5.4vw,72px);line-height:1.02;letter-spacing:-.04em;font-weight:600;color:#fff;
  text-shadow:0 2px 26px rgba(4,12,30,.5);opacity:0;animation:pc-monte .7s var(--doux) .05s forwards}
.pc-titre em{display:block;font-style:italic;font-weight:400;color:#d7dde8}
.pc-phrase{margin:22px 0 0;font-size:clamp(16px,1.4vw,19px);line-height:1.6;color:var(--texte);max-width:46ch;
  text-shadow:0 1px 16px rgba(4,12,30,.55);opacity:0;animation:pc-monte .7s var(--doux) .12s forwards}
@keyframes pc-monte{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.pc-etiquette,.pc-titre,.pc-phrase,.pc-chemin,.pc-fait,.pc-actions,.pc-image,.pc-chiffres div{animation:none!important;opacity:1!important;transform:none!important}}

/* LES CHEMINS : des lignes */
.pc-vue--chemins{display:block}
.pc-haut{max-width:880px}
.pc-haut .pc-phrase{max-width:60ch}
.pc-chemins{display:grid;grid-template-columns:repeat(var(--n,3),minmax(0,1fr));gap:clamp(18px,2.2vw,32px);margin-top:clamp(40px,7vh,80px)}
.pc-chemin{position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:10px;width:100%;
  padding:clamp(18px,2vw,24px) 0 4px;border:0;border-top:1px solid var(--trait);background:none;color:var(--texte);
  font:inherit;text-align:left;cursor:pointer;opacity:0;animation:pc-monte .6s var(--doux) forwards;transition:color .3s}
.pc-chemin::after{content:"";position:absolute;left:0;right:0;top:-1px;height:1px;background:#fff;
  transform:scaleX(0);transform-origin:left;transition:transform .5s var(--doux)}
.pc-chemin:hover{color:#fff}
.pc-chemin:hover::after{transform:scaleX(1)}
.pc-chemin b{font-size:clamp(22px,2.4vw,30px);font-weight:600;letter-spacing:-.03em;line-height:1.1;color:#fff;
  text-shadow:0 2px 20px rgba(4,12,30,.5)}
.pc-chemin small{font-size:clamp(14px,1.1vw,16px);line-height:1.45;color:var(--gris)}
.pc-chemin i{margin-top:4px;font-style:normal;font-size:20px;color:var(--gris);transition:transform .35s var(--doux),color .3s}
.pc-chemin:hover i{color:#fff;transform:translateX(6px)}

/* FICHE : des faits courts, puis l'action */
.pc-faits{display:grid;gap:clamp(18px,2vw,26px);margin:0}
.pc-vue--projet .pc-faits{margin-top:34px}
.pc-fait{border-top:1px solid var(--trait);padding-top:14px;opacity:0;animation:pc-monte .6s var(--doux) forwards}
.pc-fait b{display:block;margin-bottom:6px;font-size:12px;font-weight:500;letter-spacing:.16em;text-transform:uppercase;color:var(--gris)}
.pc-fait span{font-size:clamp(17px,1.5vw,20px);line-height:1.4;color:#fff;text-shadow:0 1px 16px rgba(4,12,30,.5)}
.pc-vue--projet .pc-fait span{font-size:clamp(16px,1.3vw,18px)}
.pc-actions{margin-top:clamp(28px,3vw,40px);display:flex;flex-wrap:wrap;align-items:center;gap:18px 26px;
  opacity:0;animation:pc-monte .6s var(--doux) .3s forwards}
.pc-bouton{display:inline-flex;align-items:center;height:50px;padding:0 28px;border-radius:999px;background:#f4f7fb;color:#0f2447;
  font-size:15px;font-weight:600;text-decoration:none;box-shadow:0 14px 30px -16px rgba(3,10,30,.8);
  transition:transform .3s var(--doux),background-color .3s}
.pc-bouton:hover{background:#fff;transform:translateY(-2px)}
.pc-liens{display:flex;flex-wrap:wrap;gap:12px 28px;margin-top:28px;opacity:0;animation:pc-monte .6s var(--doux) .35s forwards}
.pc-liens a{font-size:15px;color:#fff;text-decoration:none;border-bottom:1px solid rgba(255,255,255,.35);padding-bottom:2px;
  transition:border-color .3s}
.pc-liens a:hover{border-color:#fff}

/* PROJET : la capture a droite */
.pc-image{margin:0;opacity:0;animation:pc-monte .8s var(--doux) .18s forwards}
.pc-image img{display:block;width:100%;height:auto;border-radius:16px;border:1px solid rgba(255,255,255,.16);
  box-shadow:0 40px 80px -40px rgba(3,10,30,.9)}

.pc-chiffres{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;margin-top:26px}
.pc-chiffres div{border-top:1px solid var(--trait);padding-top:14px;opacity:0;animation:pc-monte .6s var(--doux) forwards}
.pc-chiffres b{display:block;font-size:clamp(28px,2.8vw,40px);line-height:1;font-weight:600;letter-spacing:-.04em;color:#fff;
  text-shadow:0 2px 24px rgba(4,12,30,.5)}
.pc-chiffres span{display:block;margin-top:8px;font-size:14px;line-height:1.35;color:var(--gris)}
.pc-legal{display:flex;flex-wrap:wrap;gap:8px 20px;margin:clamp(36px,6vh,64px) 0 0;font-size:13px;opacity:0;animation:pc-monte .6s var(--doux) .3s forwards}
.pc-legal a{color:var(--gris);text-decoration:none;transition:color .3s}
.pc-legal a:hover{color:#fff}
.pc-preuve{appearance:none;margin-top:22px;padding:0 0 2px;border:0;border-bottom:1px solid rgba(255,255,255,.35);background:none;
  color:#fff;font:inherit;font-size:15px;cursor:pointer;opacity:0;animation:pc-monte .6s var(--doux) .35s forwards;transition:border-color .3s}
.pc-preuve:hover{border-color:#fff}
/* LE BANDEAU DES OUTILS, en bas : il defile, s'arrete au survol */
.pc-scene{padding-bottom:96px}
.pc-outils{position:fixed;left:0;right:0;bottom:0;z-index:15;height:52px;display:flex;align-items:center;overflow:hidden;
  border-top:1px solid rgba(255,255,255,.08);background:linear-gradient(0deg,rgba(8,16,34,.55),rgba(8,16,34,0));
  -webkit-mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent);mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent)}
.pc-outils ul{display:flex;gap:40px;margin:0;padding:0 20px;list-style:none;flex:none;animation:pc-defile var(--defile,80s) linear infinite}
.pc-outils:hover ul{animation-play-state:paused}
.pc-outils li{display:flex;align-items:center;gap:9px;flex:none;font-size:13px;font-weight:500;letter-spacing:-.005em;color:rgba(223,229,238,.72);white-space:nowrap}
.pc-outils svg{width:18px;height:18px;fill:currentColor}
.pc-outils i{width:6px;height:6px;border-radius:50%;background:currentColor;opacity:.6}
@keyframes pc-defile{to{transform:translateX(-100%)}}
@media (prefers-reduced-motion:reduce){.pc-outils ul{animation:none}}
.pc-droite{margin-left:auto;display:flex;flex-direction:column;align-items:flex-end;gap:9px}
.pc-reseaux{display:flex;gap:22px}
.pc-reseaux a{display:inline-flex;align-items:center;gap:8px;font-size:12px;font-weight:500;letter-spacing:.14em;
  text-transform:uppercase;color:var(--gris);text-decoration:none;transition:color .3s}
.pc-reseaux svg{width:17px;height:17px;fill:currentColor}
.pc-langue{appearance:none;height:24px;padding:0 9px;border:1px solid rgba(255,255,255,.3);border-radius:999px;background:none;color:var(--gris);font:inherit;font-size:11px;font-weight:600;letter-spacing:.14em;cursor:pointer;transition:color .3s,border-color .3s}
.pc-langue:hover{color:#fff;border-color:#fff}
.pc-jour{display:inline-grid;place-items:center;width:24px;padding:0;margin-right:8px}
.pc-jour svg{width:12px;height:12px}
.pc-reseaux a:hover{color:#fff}
.pc-livre{display:inline-flex;align-items:center;gap:8px;height:30px;padding:0 14px 0 12px;border-radius:999px;
  border:1px solid rgba(255,255,255,.34);background:rgba(255,255,255,.07);color:#fff;font-size:12.5px;font-weight:600;
  letter-spacing:-.005em;text-decoration:none;transition:background-color .3s,border-color .3s,transform .3s var(--doux)}
.pc-livre svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linejoin:round}
.pc-livre i{font-style:normal;font-weight:500;color:rgba(255,255,255,.78)}
.pc-livre:hover{background:rgba(255,255,255,.16);border-color:rgba(255,255,255,.6);transform:translateY(-1px)}
@media (max-width:700px){.pc-fil,.pc-reseaux span,.pc-livre i{display:none}.pc-retour{flex:none}.pc-reseaux{gap:16px}.pc-droite{gap:7px}.pc-livre{height:28px;font-size:12px}}

/* des rangees equilibrees : 6 -> 3+3 -> 2 ; 4 -> 2+2 ; tout en colonne sur telephone */
@media (max-width:1200px){.pc-chemins--6,.pc-chemins--5{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (max-width:900px){.pc-chemins--4,.pc-chemins--5,.pc-chemins--6{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:700px){.pc-chemins{grid-template-columns:minmax(0,1fr)!important}}

@media (max-width:900px){
  .pc-vue,.pc-vue--fiche,.pc-vue--projet{grid-template-columns:1fr;gap:34px;align-items:start}
  .pc-scene{padding-top:96px;align-items:flex-start}
  .pc-tete{height:64px}
  .pc-phrase{max-width:none}
}

/* LE DESSOUS DE L'ACCUEIL (essai noir) : la page se deroule, blocs alternes texte / visuel */
/* l'en-tete fixe garde un fond : le texte qui defile passe dessous sans se melanger au logo */
html[data-theme="noir"] .pc-tete{background:linear-gradient(180deg,rgba(0,0,0,.94) 0%,rgba(0,0,0,.78) 62%,rgba(0,0,0,0) 100%)}
.pc-scene--long{display:block;padding-bottom:0}
.pc-heros{min-height:calc(100svh - 206px);display:flex;flex-direction:column;justify-content:center}
@media (max-width:700px){.pc-heros{padding-bottom:72px}}
.pc-descendre{appearance:none;align-self:flex-start;margin-top:clamp(28px,5vh,56px);display:inline-flex;align-items:center;gap:10px;
  padding:0;border:0;background:none;color:var(--gris);font:inherit;font-size:12px;letter-spacing:.16em;text-transform:uppercase;
  cursor:pointer;opacity:0;animation:pc-monte .6s var(--doux) .5s forwards;transition:color .3s}
.pc-descendre:hover{color:#fff}
.pc-descendre span{display:inline-block;animation:pc-flotte 1.8s ease-in-out infinite}
@keyframes pc-flotte{50%{transform:translateY(5px)}}
.pc-dessous{width:min(1180px,100%);margin:0 auto;padding:clamp(72px,12vh,140px) 0 150px}
.pc-mono{margin:0;font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--gris)}
.pc-mono::before{content:"/// ";opacity:.45}
.pc-intro{max-width:780px;margin-bottom:clamp(44px,7vh,88px)}
.pc-dessous h2{margin:14px 0 0;font-size:clamp(30px,3.6vw,52px);line-height:1.05;letter-spacing:-.035em;font-weight:600;color:#fff}
.pc-dessous h2 em{font-style:italic;font-weight:400;color:#b9b9b9}
.pc-intro p,.pc-texte p{margin:18px 0 0;font-size:clamp(16px,1.25vw,18px);line-height:1.65;color:var(--texte);max-width:50ch}
.pc-bloc{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);border-top:1px solid var(--trait);min-height:clamp(360px,50vh,520px)}
.pc-texte{padding:clamp(32px,4vw,60px) clamp(20px,3vw,52px) clamp(32px,4vw,60px) 0;display:flex;flex-direction:column;justify-content:center}
.pc-bloc--inverse .pc-texte{order:2;padding-left:clamp(20px,3vw,52px);padding-right:0}
.pc-visuel{position:relative;display:grid;place-items:center;overflow:hidden;border-left:1px solid var(--trait);padding:28px 0;
  background:radial-gradient(circle at 1px 1px,rgba(255,255,255,.08) 1px,transparent 0) 0 0/18px 18px}
.pc-bloc--inverse .pc-visuel{border-left:0;border-right:1px solid var(--trait)}
.pc-visuel--image{padding:0;background:none}
.pc-visuel--image img{width:100%;height:100%;object-fit:cover;object-position:left top;opacity:.92;filter:grayscale(.35) contrast(1.05)}
.pc-apparait{opacity:0;transform:translateY(26px);transition:opacity .9s var(--doux),transform .9s var(--doux)}
.pc-apparait.pc-vu{opacity:1;transform:none}
.pc-jetons{display:flex;flex-wrap:wrap;gap:6px;width:min(420px,86%)}
.pc-jetons span{padding:6px 9px;border:1px solid rgba(255,255,255,.22);border-radius:6px;background:rgba(255,255,255,.04);color:#fff;
  font:13px ui-monospace,"SF Mono",Menlo,Consolas,monospace;opacity:0;transform:translateY(6px)}
.pc-vu .pc-jetons span{animation:pc-jeton .5s var(--doux) forwards;animation-delay:calc(var(--i) * 120ms)}
@keyframes pc-jeton{to{opacity:1;transform:none}}
.pc-legende{width:min(420px,86%);margin:18px 0 0;font:12px/1.6 ui-monospace,"SF Mono",Menlo,Consolas,monospace;color:var(--gris)}
.pc-prompts{display:grid;gap:14px;width:min(460px,88%)}
.pc-prompt{border:1px solid rgba(255,255,255,.18);border-radius:10px;padding:16px 18px;background:rgba(0,0,0,.55)}
.pc-prompt--apres{border-color:rgba(255,255,255,.5)}
.pc-prompt b{display:flex;justify-content:space-between;gap:12px;margin-bottom:9px;font:11px ui-monospace,"SF Mono",Menlo,Consolas,monospace;
  letter-spacing:.12em;text-transform:uppercase;color:var(--gris)}
.pc-prompt b i{font-style:normal;color:#fff}
.pc-prompt p{margin:0;font-size:14.5px;line-height:1.55;color:#fff}
.pc-grands{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border-top:1px solid var(--trait);border-bottom:1px solid var(--trait)}
.pc-grands div{padding:clamp(30px,3vw,46px) clamp(16px,2vw,30px);border-right:1px solid var(--trait)}
.pc-grands div:first-child{padding-left:0}
.pc-grands div:last-child{border-right:0}
.pc-grands b{display:block;font-size:clamp(48px,5.8vw,88px);font-weight:500;letter-spacing:-.05em;line-height:1;color:#fff}
.pc-grands span{display:block;margin-top:16px;font:12.5px/1.55 ui-monospace,"SF Mono",Menlo,Consolas,monospace;color:var(--gris);max-width:32ch}
.pc-routes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1px;width:min(470px,88%);background:var(--trait);border:1px solid var(--trait)}
.pc-route{background:#040404;padding:20px 18px}
.pc-route svg{width:36px;height:36px;fill:none;stroke:#fff;stroke-width:1.2;stroke-linecap:round;stroke-linejoin:round}
.pc-route b{display:block;margin-top:14px;font:12px ui-monospace,"SF Mono",Menlo,Consolas,monospace;letter-spacing:.1em;text-transform:uppercase;color:#fff}
.pc-route span{display:block;margin-top:6px;font-size:13.5px;line-height:1.45;color:var(--gris)}
.pc-schema{width:min(480px,90%);height:auto;overflow:visible}
.pc-schema rect{fill:#050505;stroke:rgba(255,255,255,.55);stroke-width:1}
.pc-schema text{fill:#fff;font:12px ui-monospace,"SF Mono",Menlo,Consolas,monospace;letter-spacing:.06em}
.pc-schema .pc-petit{fill:#9d9d9d;font-size:10.5px}
.pc-schema .pc-flux{fill:none;stroke:#fff;stroke-width:1.2;stroke-dasharray:4 6;animation:pc-flux 1.1s linear infinite}
.pc-schema .pc-cadre{fill:none;stroke:rgba(255,255,255,.25);stroke-dasharray:3 5}
@keyframes pc-flux{to{stroke-dashoffset:-20}}
.pc-logos{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:1px;margin-top:clamp(28px,4vh,44px);background:var(--trait);border:1px solid var(--trait)}
.pc-logos div{display:flex;flex-direction:column;align-items:center;gap:12px;padding:24px 8px;background:#030303;font-size:12.5px;color:var(--gris)}
.pc-logos svg{width:28px;height:28px;fill:#fff;animation:pc-respire 4.2s ease-in-out infinite;animation-delay:calc(var(--i) * -.37s)}
@keyframes pc-respire{50%{transform:translateY(-5px);opacity:.62}}
.pc-bloc-logos{margin-top:clamp(64px,10vh,120px)}
.pc-fin{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:24px;margin-top:clamp(64px,10vh,120px);
  padding-top:34px;border-top:1px solid var(--trait)}
.pc-fin h2{margin:0}
@media (max-width:900px){
  .pc-bloc{grid-template-columns:1fr;min-height:0}
  .pc-texte,.pc-bloc--inverse .pc-texte{order:0;padding:36px 0 30px}
  .pc-visuel,.pc-bloc--inverse .pc-visuel{border:0;border-top:1px solid var(--trait);min-height:300px}
  .pc-grands{grid-template-columns:1fr}
  .pc-grands div{padding:28px 0;border-right:0;border-bottom:1px solid var(--trait)}
  .pc-grands div:last-child{border-bottom:0}
  .pc-logos{grid-template-columns:repeat(3,minmax(0,1fr))}
}
/* LE FOND VIVANT (essai noir) : une aurore lente aux couleurs de rAIme, une constellation clairsemee */
.pc-aurore{position:fixed;inset:-25%;z-index:-2;pointer-events:none;opacity:1;
  background:radial-gradient(36% 40% at 24% 30%,rgba(255,255,255,.075),transparent 70%),
             radial-gradient(32% 38% at 78% 66%,rgba(255,255,255,.06),transparent 70%),
             radial-gradient(26% 30% at 60% 18%,rgba(255,255,255,.045),transparent 70%);
  animation:pc-aurore 34s ease-in-out infinite alternate}
@keyframes pc-aurore{0%{transform:translate3d(-4%,-3%,0) scale(1)}50%{transform:translate3d(3%,2%,0) scale(1.1)}
  100%{transform:translate3d(-1%,4%,0) scale(1.04)}}
.pc-points{position:fixed;inset:0;z-index:-1;pointer-events:none;opacity:.45}
/* LE HEROS (essai noir et blanc) : grand menu a droite, grand titre en bas a gauche */
.pc-heros2{min-height:calc(100svh - 150px);display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);
  grid-template-rows:auto 1fr;gap:28px clamp(24px,5vw,80px)}
.pc-grand-menu{grid-column:2;grid-row:1;display:flex;flex-direction:column;align-items:flex-start;gap:2px}
.pc-gm{appearance:none;display:flex;align-items:baseline;gap:14px;padding:3px 0;border:0;background:none;color:#fff;font:inherit;
  font-size:clamp(30px,3.5vw,54px);font-weight:500;letter-spacing:-.035em;line-height:1.08;cursor:pointer;text-align:left;
  opacity:0;animation:pc-monte .6s var(--doux) forwards;transition:transform .45s var(--doux)}
.pc-gm small{font:12px ui-monospace,"SF Mono",Menlo,Consolas,monospace;letter-spacing:.1em;color:var(--gris);transform:translateY(-1.1em)}
.pc-gm i{font-style:normal;font-size:.55em;opacity:0;transform:translateX(-10px);transition:opacity .3s,transform .45s var(--doux)}
.pc-gm:hover{transform:translateX(10px)}
.pc-gm:hover i{opacity:1;transform:none}
.pc-grand-menu .pc-avis{margin-top:clamp(20px,3.5vh,36px)}
.pc-heros2-bas{grid-column:2;grid-row:2;align-self:end}
.pc-titre--geant{font-size:clamp(40px,5vw,80px);line-height:1;letter-spacing:-.045em;font-weight:500}
.pc-titre--geant em{display:block}
html[data-theme="noir"] .pc-logo{display:flex;align-items:center;gap:12px;line-height:1;text-decoration:none}
.pc-nom{font-size:22px;font-weight:600;letter-spacing:-.03em;color:#fff}
@media (max-width:420px){.pc-nom{font-size:18px}}
.pc-cpf{display:flex;align-items:center;gap:10px;margin:-8px 0 20px;font-size:13.5px;line-height:1.4}
.pc-cpf span{padding:3px 7px;border:1px solid currentColor;border-radius:4px;font:600 11px ui-monospace,"SF Mono",Menlo,Consolas,monospace;letter-spacing:.08em}
.pc-heros2-actions{display:flex;flex-wrap:wrap;align-items:center;gap:18px 30px;margin-top:clamp(24px,4vh,40px);
  opacity:0;animation:pc-monte .6s var(--doux) .3s forwards}
.pc-heros2-actions .pc-descendre{margin-top:0;animation:none;opacity:1}
@media (max-width:900px){.pc-heros2{grid-template-columns:1fr;grid-template-rows:auto auto;min-height:0}
  .pc-grand-menu{grid-column:1;grid-row:2}.pc-heros2-bas{grid-column:1;grid-row:1}.pc-gm{font-size:clamp(28px,8vw,40px)}}
/* le menu plein ecran */
.pc-burger{appearance:none;margin-left:24px;width:46px;height:32px;display:flex;flex-direction:column;justify-content:center;gap:7px;
  padding:0 4px;border:0;background:none;cursor:pointer}
.pc-burger span{display:block;height:1.6px;background:#fff;transition:transform .35s var(--doux)}
.pc-burger:hover span:first-child{transform:translateX(-5px)}
.pc-menu{position:fixed;inset:0;z-index:70;display:grid;grid-template-columns:1fr 1fr;background:#000;opacity:0;visibility:hidden;
  transition:opacity .45s var(--doux),visibility .45s}
.pc-menu.pc-ouvert{opacity:1;visibility:visible}
.pc-menu-gauche{display:flex;flex-direction:column;justify-content:center;gap:16px;padding:clamp(28px,6vw,110px);
  background:radial-gradient(circle at 1px 1px,rgba(255,255,255,.13) 1px,transparent 0) 0 0/16px 16px,#030303}
.pc-menu-gauche p{margin:0;color:var(--gris);font-size:15px}
.pc-menu-gauche h2{margin:0;font-size:clamp(34px,3.8vw,58px);line-height:1.05;letter-spacing:-.035em;font-weight:500;color:#fff;max-width:14ch}
.pc-menu-gauche small{font:12px ui-monospace,"SF Mono",Menlo,Consolas,monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--gris)}
.pc-menu-droite{position:relative;display:grid;grid-template-columns:1fr 1fr;align-content:start;gap:36px;
  padding:clamp(80px,12vh,130px) clamp(28px,5vw,80px) 40px;background:#e8e8e8;color:#000;overflow:auto}
.pc-menu-droite .pc-mono{color:#555;margin-bottom:20px}
.pc-menu-droite a,.pc-menu-droite button[data-vers]{display:flex;align-items:center;gap:8px;appearance:none;padding:7px 0;border:0;background:none;
  color:#111;font:inherit;font-size:clamp(18px,1.6vw,22px);text-decoration:none;cursor:pointer;text-align:left}
.pc-menu-droite a:hover,.pc-menu-droite button[data-vers]:hover{text-decoration:underline;text-underline-offset:5px}
.pc-menu-droite i{font-style:normal;font-size:.8em}
.pc-menu-fermer{position:absolute;top:26px;right:clamp(20px,4vw,48px);appearance:none;width:46px;height:38px;border:1.5px solid #000;
  border-radius:3px;background:none;color:#000;font-size:18px;cursor:pointer}
@media (max-width:900px){.pc-menu{grid-template-columns:1fr}.pc-menu-gauche{display:none}.pc-menu-droite{grid-template-columns:1fr}}
/* LES TARIFS : trois colonnes, celle du milieu en clair */
.pc-vue--tarifs{display:block}
.pc-tarifs{display:grid;grid-template-columns:repeat(var(--n,3),minmax(0,1fr));margin-top:clamp(34px,6vh,60px);border:1px solid var(--trait)}
.pc-tarif{display:flex;flex-direction:column;padding:clamp(24px,2.6vw,40px);border-right:1px solid var(--trait);background:rgba(0,0,0,.4);
  opacity:0;animation:pc-monte .6s var(--doux) forwards}
.pc-tarif:last-child{border-right:0}
.pc-tarif h2{margin:0;font-size:26px;font-weight:500;letter-spacing:-.02em;color:#fff}
.pc-tarif-pour{margin:12px 0 0;min-height:3.2em;color:var(--texte);font-size:15.5px;line-height:1.55}
.pc-tarif-prix{margin:24px 0 22px;display:flex;align-items:baseline;flex-wrap:wrap;gap:6px 10px}
.pc-tarif-prix b{font:500 clamp(34px,3.4vw,48px)/1 ui-monospace,"SF Mono",Menlo,Consolas,monospace;letter-spacing:-.03em;color:#fff}
.pc-tarif-prix b.pc-prix-mot{font-size:clamp(24px,2.2vw,32px)}
.pc-tarif-prix span{font:11px ui-monospace,"SF Mono",Menlo,Consolas,monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--gris)}
.pc-tarif-bouton{align-self:flex-start;display:inline-flex;align-items:center;gap:16px;height:46px;padding:0 24px 0 0;border:1px solid #fff;
  background:#000;color:#fff;font-size:14.5px;font-weight:500;text-decoration:none;transition:background-color .3s}
.pc-tarif-bouton i{width:46px;height:44px;border-right:1px solid #fff;
  background:radial-gradient(circle at 1px 1px,rgba(255,255,255,.55) 1px,transparent 0) 0 0/5px 5px}
.pc-tarif-bouton:hover{background:#151515}
.pc-tarif-ligne{border-top:1px solid var(--trait);padding:14px 0}
.pc-tarif-ligne:first-of-type{margin-top:28px}
.pc-tarif-ligne small{display:block;margin-bottom:6px;font:11px ui-monospace,"SF Mono",Menlo,Consolas,monospace;letter-spacing:.12em;
  text-transform:uppercase;color:var(--gris)}
.pc-tarif-ligne span{font-size:15px;line-height:1.5;color:#fff}
.pc-tarif--fort{background:#e9e9e9}
.pc-tarif--fort h2,.pc-tarif--fort .pc-tarif-prix b,.pc-tarif--fort .pc-tarif-ligne span{color:#000}
.pc-tarif--fort .pc-tarif-pour{color:#222}
.pc-tarif--fort .pc-tarif-prix span,.pc-tarif--fort .pc-tarif-ligne small{color:#555}
.pc-tarif--fort .pc-tarif-ligne{border-top-color:rgba(0,0,0,.14)}
.pc-tarif--fort .pc-tarif-bouton{background:#fff;border-color:#000;color:#000}
.pc-tarif--fort .pc-tarif-bouton i{border-right-color:#000;background:radial-gradient(circle at 1px 1px,rgba(0,0,0,.6) 1px,transparent 0) 0 0/5px 5px}
.pc-tarif-notes{list-style:none;margin:28px 0 0;padding:0;display:grid;gap:10px;color:var(--texte);font-size:15px}
.pc-tarif-notes li::before{content:"— ";color:var(--gris)}
@media (max-width:1100px){.pc-tarifs{grid-template-columns:repeat(2,minmax(0,1fr))}.pc-tarif{border-bottom:1px solid var(--trait)}}
@media (max-width:700px){.pc-tarifs{grid-template-columns:1fr}.pc-tarif{border-right:0}}
.pc-onglets{display:inline-flex;margin-top:30px;border:1px solid var(--trait);opacity:0;animation:pc-monte .6s var(--doux) .2s forwards}
.pc-onglets button{appearance:none;padding:12px 22px;border:0;background:none;color:var(--gris);cursor:pointer;
  font:12px ui-monospace,"SF Mono",Menlo,Consolas,monospace;letter-spacing:.12em;text-transform:uppercase;transition:color .3s,background-color .3s}
.pc-onglets button:hover{color:#fff}
.pc-onglets button[aria-selected="true"]{background:#e9e9e9;color:#000}
.pc-globe{position:fixed;inset:0;z-index:-1;pointer-events:none;transition:opacity .5s}
/* ARMORY : colonnes fines, en-tete epure, menu au milieu, titre sobre en bas a gauche */
.pc-colonnes{position:fixed;inset:0;z-index:-1;pointer-events:none;
  background-image:linear-gradient(rgba(255,255,255,.055),rgba(255,255,255,.055)),linear-gradient(rgba(255,255,255,.055),rgba(255,255,255,.055)),
    linear-gradient(rgba(255,255,255,.055),rgba(255,255,255,.055));
  background-size:1px 100%;background-position:25% 0,50% 0,75% 0;background-repeat:no-repeat}
html[data-theme="noir"] .pc-reseaux a,html[data-theme="noir"] .pc-livre{display:none}
.pc-heros2{position:relative;isolation:isolate;column-gap:0;grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
.pc-nuage{position:absolute;z-index:-1;pointer-events:none;top:-110px;bottom:-40px;
  left:calc(-1 * clamp(20px,5vw,72px));right:calc(-1 * clamp(20px,5vw,72px));width:calc(100% + 2 * clamp(20px,5vw,72px));height:calc(100% + 150px)}
.pc-grand-menu{gap:0}
.pc-gm{font-size:clamp(26px,2.5vw,44px);font-weight:400;letter-spacing:-.03em;line-height:1.28;padding:0}
.pc-grand-menu .pc-avis{margin-top:clamp(26px,4vh,44px)}
.pc-heros2-bas{grid-column:1 / -1;max-width:min(900px,64%)}
.pc-heros2 .pc-titre--geant{font-size:clamp(50px,6.2vw,112px);font-weight:450;line-height:.98;letter-spacing:-.045em;text-shadow:none}
html[data-theme="noir"] .pc-heros2 .pc-titre em{display:block}
.pc-heros2 .pc-phrase{font-size:clamp(16px,1.2vw,18px);max-width:44ch;color:#d9d9d9}
.pc-bouton-carre{display:inline-flex;align-items:center;gap:18px;height:50px;padding:0 26px 0 0;background:#fff;color:#000;
  font-size:15px;font-weight:500;text-decoration:none;transition:background-color .3s}
.pc-bouton-carre i{width:50px;height:50px;background:radial-gradient(circle at 1px 1px,rgba(0,0,0,.65) 1px,transparent 0) 0 0/5px 5px,#000;
  border:1px solid #fff}
.pc-bouton-carre:hover{background:#e6e6e6}
@media (max-width:900px){.pc-heros2-bas{max-width:none}.pc-nuage{top:-96px}}
/* LE CHAMP DE PARTICULES, au fond du heros */
.pc-champ{position:absolute;z-index:-1;pointer-events:none;bottom:-40px;height:54%;
  left:calc(-1 * clamp(20px,5vw,72px));width:calc(100% + 2 * clamp(20px,5vw,72px));
  -webkit-mask-image:linear-gradient(to bottom,transparent,#000 36%,#000 50%,rgba(0,0,0,.62) 64%,rgba(0,0,0,.3) 78%,rgba(0,0,0,.1) 90%,transparent);
  mask-image:linear-gradient(to bottom,transparent,#000 36%,#000 50%,rgba(0,0,0,.62) 64%,rgba(0,0,0,.3) 78%,rgba(0,0,0,.1) 90%,transparent)}
/* le champ du heros deborde sous le heros et s'y efface lentement : le fond de la page prend le relais sans ligne */
html[data-theme="noir"] .pc-champ{bottom:-200px;height:calc(54% + 160px)}
@media (max-width:900px){html[data-theme="noir"] .pc-champ{bottom:-120px;height:calc(40% + 100px)}}
html[data-theme="noir"] .pc-grand-menu{padding-left:clamp(0px,11vw,210px)}
@media (max-width:900px){html[data-theme="noir"] .pc-grand-menu{padding-left:0}.pc-champ{height:40%}}
/* LA FENETRE DE RESERVATION */
.pc-rdv{position:fixed;inset:0;z-index:80;display:grid;place-items:center;padding:clamp(10px,3vw,40px);background:rgba(0,0,0,.74);
  -webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);opacity:0;visibility:hidden;transition:opacity .35s var(--doux),visibility .35s}
.pc-rdv.pc-ouvert{opacity:1;visibility:visible}
.pc-rdv-boite{width:min(1040px,100%);height:min(780px,100%);display:flex;flex-direction:column;background:#e8e8e8;border:1px solid rgba(255,255,255,.22)}
.pc-rdv-tete{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;padding:20px 24px 18px;background:#000;color:#fff}
.pc-rdv-tete h2{margin:8px 0 0;font-size:18px;font-weight:600;letter-spacing:-.01em;color:#fff}
.pc-rdv-fermer{position:static;flex:none;border-color:#fff;color:#fff}
.pc-rdv iframe{flex:1;width:100%;border:0;background:#fff}
/* LA FENETRE « COMMENT ÇA MARCHE » (Score rAIme) */
.pc-comment{appearance:none;align-self:flex-start;display:inline-flex;align-items:center;gap:8px;margin:-4px 0 18px;padding:0;border:0;
  background:none;color:#fff;font:inherit;font-size:14px;cursor:pointer;text-decoration:underline;text-decoration-color:rgba(255,255,255,.4);
  text-underline-offset:4px;transition:text-decoration-color .3s}
.pc-comment:hover{text-decoration-color:#ff7eb0}
/* une seule offre dans l'onglet (Particulier, depuis le retrait du livre) : une carte, pas une bande */
.pc-tarifs[style*="--n:1"]{grid-template-columns:minmax(0,460px);width:fit-content;max-width:100%}
/* dans la colonne mise en avant (fond clair), le lien passe en noir */
.pc-tarif--fort .pc-comment{color:#000;text-decoration-color:rgba(0,0,0,.4)}
.pc-comment span{transition:transform .3s}.pc-comment:hover span{transform:translateX(3px)}
.pc-score-boite{position:relative;width:min(920px,100%);max-height:min(90vh,940px);overflow:auto;padding:clamp(26px,4vw,52px);
  background:#050505;border:1px solid rgba(255,255,255,.22);color:var(--texte);overscroll-behavior:contain}
.pc-score .pc-rdv-fermer{position:absolute;top:18px;right:18px}
.pc-score-contenu h2{margin:14px 56px 0 0;font-size:var(--t2);line-height:1.05;letter-spacing:-.035em;font-weight:600;color:#fff}
.pc-score-contenu h2 em{display:inline-block;font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;font-style:normal;font-weight:500;
  letter-spacing:-.05em;background:linear-gradient(100deg,#e6e6e6 0%,#e6e6e6 26%,#ffd3e4 36%,#ff7eb0 45%,#ff7eb0 55%,#ffd3e4 64%,#e6e6e6 74%,#e6e6e6 100%);
  background-size:320% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent;
  animation:pc-reflet 10s ease-in-out infinite}
.pc-score-intro{margin:18px 0 0;font-size:18px;line-height:1.65;max-width:60ch}
.pc-score-axes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;margin-top:32px;background:var(--trait);border:1px solid var(--trait)}
.pc-score-axes div{padding:22px 20px;background:#030303}
.pc-score-axes b{display:block;font:500 12px ui-monospace,"SF Mono",Menlo,Consolas,monospace;letter-spacing:.12em;color:var(--gris)}
.pc-score-axes h3{margin:10px 0 0;font-size:18px;font-weight:600;color:#fff}
.pc-score-axes p{margin:8px 0 0;font-size:14px;line-height:1.55;color:var(--gris)}
.pc-score-regle{margin-top:32px;padding-top:24px;border-top:1px solid var(--trait)}
.pc-score-formule{margin:12px 0 0;font:500 18px ui-monospace,"SF Mono",Menlo,Consolas,monospace;color:#fff}
.pc-score-regle p:last-child{margin:10px 0 0;font-size:18px;line-height:1.6;max-width:60ch}
.pc-score-deux{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr);gap:32px;margin-top:32px;padding-top:24px;border-top:1px solid var(--trait)}
.pc-score-echelle{margin:12px 0 0}
.pc-score-echelle div{display:flex;justify-content:space-between;gap:16px;padding:9px 0;border-bottom:1px solid var(--trait);font-size:14px}
.pc-score-echelle dt{font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;color:#fff}
.pc-score-echelle dd{margin:0;color:var(--texte);text-align:right}
.pc-score-garanties{margin:12px 0 0;padding-left:1.1em;font-size:14px;line-height:1.55;color:var(--texte)}
.pc-score-garanties li{margin-bottom:10px}
.pc-score-usages{margin-top:28px;padding-top:24px;border-top:1px solid var(--trait)}
.pc-score-usages p{margin:0 0 12px;font-size:14px;line-height:1.55;color:var(--texte)}
.pc-score-usages b{display:block;margin-bottom:2px;font-size:18px;font-weight:600;color:#fff}
.pc-score-axes--4{grid-template-columns:repeat(2,minmax(0,1fr))}
@media (max-width:760px){.pc-score-axes,.pc-score-deux{grid-template-columns:1fr}}
@media (prefers-reduced-motion:reduce){.pc-score-contenu h2 em{animation:none}}
/* LE MOUVEMENT (Basile, 25/09/2026) : la matiere floue du fond, et le curseur rose */
html[data-theme="noir"] .pc-aurore{display:none}
.pc-matiere{position:fixed;inset:-12%;z-index:-3;pointer-events:none;overflow:hidden}
.pc-matiere i{position:absolute;border-radius:50%;will-change:transform;filter:blur(46px)}
.pc-matiere i:nth-child(1){left:6%;top:4%;width:54vw;height:54vw;background:radial-gradient(circle,rgba(255,255,255,.12),transparent 66%)}
.pc-matiere i:nth-child(2){right:2%;top:36%;width:48vw;height:48vw;background:radial-gradient(circle,rgba(255,255,255,.085),transparent 66%)}
.pc-matiere i:nth-child(3){left:48%;top:0;width:36vw;height:36vw;background:radial-gradient(circle,rgba(255,126,176,.14),transparent 66%)}
.pc-matiere i:nth-child(4){left:14%;top:60%;width:42vw;height:42vw;background:radial-gradient(circle,rgba(255,255,255,.065),transparent 66%)}
.pc-curseur,.pc-curseur-point{position:fixed;left:0;top:0;z-index:120;pointer-events:none;border-radius:50%;opacity:0;
  transition:opacity .3s,width .35s cubic-bezier(.2,.7,.2,1),height .35s cubic-bezier(.2,.7,.2,1),margin .35s cubic-bezier(.2,.7,.2,1),background-color .3s}
.pc-curseur-point{width:6px;height:6px;margin:-3px 0 0 -3px;background:#ff7eb0;box-shadow:0 0 10px 2px rgba(255,126,176,.65)}
.pc-curseur{width:34px;height:34px;margin:-17px 0 0 -17px;border:1px solid rgba(255,126,176,.85);
  box-shadow:0 0 24px 5px rgba(255,126,176,.26),inset 0 0 12px rgba(255,126,176,.16)}
.pc-curseur.pc-sur{width:56px;height:56px;margin:-28px 0 0 -28px;background:rgba(255,126,176,.08)}
html.pc-curseur-actif,html.pc-curseur-actif *{cursor:none!important}
html.pc-curseur-actif iframe{cursor:auto!important}
@media (max-width:900px){html[data-theme="noir"] .pc-bloc,html[data-theme="noir"] .pc-bloc-freins,html[data-theme="noir"] .pc-bloc-logos,
  html[data-theme="noir"] .pc-grands{-webkit-backdrop-filter:none;backdrop-filter:none;background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,.03)),rgba(14,14,14,.82)}}
@media (prefers-reduced-motion:reduce){.pc-matiere i{will-change:auto}}
/* LES PARTIES 01 A 07, EN RELIEF : chaque partie sur un panneau a peine plus clair que le fond,
   eclaire par le haut, avec une ombre portee ; le numero en grand, en contour */
html[data-theme="noir"] .pc-bloc,html[data-theme="noir"] .pc-bloc-freins,html[data-theme="noir"] .pc-bloc-logos,
html[data-theme="noir"] .pc-grands{position:relative;margin-top:clamp(28px,4vh,48px);border:1px solid rgba(255,255,255,.11);
  background:linear-gradient(180deg,rgba(255,255,255,.075) 0%,rgba(255,255,255,.035) 38%,rgba(255,255,255,.028) 100%),rgba(14,14,14,.58);
  -webkit-backdrop-filter:blur(18px) saturate(120%);backdrop-filter:blur(18px) saturate(120%);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.12),0 1px 0 rgba(0,0,0,.9),0 44px 90px -44px rgba(0,0,0,.95)}
html[data-theme="noir"] .pc-bloc .pc-texte{padding-left:clamp(22px,3.2vw,52px)}
html[data-theme="noir"] .pc-bloc--inverse .pc-texte{padding-right:clamp(22px,3.2vw,52px)}
html[data-theme="noir"] .pc-bloc-freins,html[data-theme="noir"] .pc-bloc-logos{padding:clamp(28px,4vw,56px)}
html[data-theme="noir"] .pc-grands div:first-child{padding-left:clamp(22px,3.2vw,52px)}
html[data-theme="noir"] .pc-bloc-freins + .pc-intro,html[data-theme="noir"] .pc-bloc--large + .pc-intro{margin-top:clamp(64px,10vh,120px)}
html[data-theme="noir"] .pc-dessous p.pc-num{margin:0 0 10px;font:500 var(--t3) ui-monospace,"SF Mono",Menlo,Consolas,monospace;line-height:1;letter-spacing:-.04em;
  color:transparent;-webkit-text-stroke:1px rgba(255,255,255,.5)}
.pc-frein-etiq{display:block;margin-bottom:14px;font:12px ui-monospace,"SF Mono",Menlo,Consolas,monospace;letter-spacing:.12em;
  text-transform:uppercase;color:var(--gris)}
.pc-frein h3{line-height:1.4}
html[data-theme="noir"] .pc-frein{background:linear-gradient(180deg,rgba(255,255,255,.03),rgba(255,255,255,0) 60%),#030303}
/* RESTRICTION VOLONTAIRE (principe Sam Crawford, demande de Basile) : deux graisses pour Inter (400, 600),
   une seule etiquette (12 px, chasse fixe, capitales, gris), trois couleurs de texte (blanc, gris, rose) */
html[data-theme="noir"]{--texte:#fff}
html[data-theme="noir"] .pc-heros2 .pc-titre--geant,html[data-theme="noir"] .pc-grands b,html[data-theme="noir"] .pc-frein b{font-weight:600}
html[data-theme="noir"] .pc-etiquette,html[data-theme="noir"] .pc-descendre,html[data-theme="noir"] .pc-fil,html[data-theme="noir"] .pc-fil button,
html[data-theme="noir"] .pc-fait b,html[data-theme="noir"] .pc-langue{font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
  font-size:12px;font-weight:400;letter-spacing:.12em;text-transform:uppercase}
html[data-theme="noir"] .pc-heros2 .pc-phrase,html[data-theme="noir"] .pc-retour{color:#fff}
html[data-theme="noir"] .pc-texte p.pc-sources,html[data-theme="noir"] p.pc-sources{font-size:12px;line-height:1.6}
html[data-theme="noir"] .pc-tarif h2{font-weight:600}
html[data-theme="noir"] .pc-tarif-prix b{font-weight:500}
/* LES MOTS-CLES ET LES GRANDS CHIFFRES : rose fixe, sans reflet (Basile, 25/09/2026) */
html[data-theme="noir"] .pc-titre em,html[data-theme="noir"] .pc-dessous h2 em,html[data-theme="noir"] .pc-heros2 .pc-titre em,
.pc-score-contenu h2 em{background:none!important;color:#ff7eb0!important;-webkit-text-fill-color:#ff7eb0!important;animation:none!important}
html[data-theme="noir"] .pc-grands b,html[data-theme="noir"] .pc-frein b{background:none!important;color:#ff7eb0!important;
  -webkit-text-fill-color:#ff7eb0!important;animation:none!important}
/* ECHELLE TYPOGRAPHIQUE (principes Sam Crawford) : trois tailles de titres, texte 18 et 14, une etiquette 12 */
html[data-theme="noir"]{--t1:clamp(40px,4.9vw,84px);--t2:clamp(32px,3.9vw,64px);--t3:clamp(24px,2.5vw,40px)}
html[data-theme="noir"] .pc-titre,html[data-theme="noir"] .pc-heros2 .pc-titre--geant{font-size:var(--t1)}
html[data-theme="noir"] .pc-dessous h2,html[data-theme="noir"] .pc-grands b,html[data-theme="noir"] .pc-menu-gauche h2{font-size:var(--t2)}
html[data-theme="noir"] .pc-gm,html[data-theme="noir"] .pc-chemin b,html[data-theme="noir"] .pc-tarif h2,
html[data-theme="noir"] .pc-tarif-prix b,html[data-theme="noir"] .pc-chiffres b{font-size:var(--t3)}
html[data-theme="noir"] .pc-tarif-prix b.pc-prix-mot{font-size:var(--t3)}
html[data-theme="noir"] .pc-phrase,html[data-theme="noir"] .pc-texte p,html[data-theme="noir"] .pc-intro p,
html[data-theme="noir"] .pc-fait span,html[data-theme="noir"] .pc-heros2 .pc-phrase,html[data-theme="noir"] .pc-menu-droite a,
html[data-theme="noir"] .pc-menu-droite button[data-vers]{font-size:18px}
html[data-theme="noir"] .pc-tarif-pour,html[data-theme="noir"] .pc-tarif-ligne span,html[data-theme="noir"] .pc-tarif-notes,
html[data-theme="noir"] .pc-prompt p,html[data-theme="noir"] .pc-route span,html[data-theme="noir"] .pc-chemin small,
html[data-theme="noir"] .pc-pied,html[data-theme="noir"] .pc-avis,html[data-theme="noir"] .pc-cpf,
html[data-theme="noir"] .pc-liens a,html[data-theme="noir"] .pc-legal,html[data-theme="noir"] .pc-menu-gauche p,
html[data-theme="noir"] .pc-logos div,html[data-theme="noir"] .pc-jetons span,html[data-theme="noir"] .pc-prompt{font-size:14px}
html[data-theme="noir"] .pc-bouton,html[data-theme="noir"] .pc-bouton-carre,html[data-theme="noir"] .pc-tarif-bouton,
html[data-theme="noir"] .pc-preuve,html[data-theme="noir"] .pc-cta{font-size:14px;font-weight:600}
html[data-theme="noir"] .pc-langue,html[data-theme="noir"] .pc-prompt b,html[data-theme="noir"] .pc-prompt i,
html[data-theme="noir"] .pc-cpf span,html[data-theme="noir"] .pc-etoiles,html[data-theme="noir"] .pc-fil{font-size:12px}
@media (max-width:560px){html[data-theme="noir"] .pc-pied{font-size:12px}}
html[data-theme="noir"] .pc-mono,html[data-theme="noir"] p.pc-mono,html[data-theme="noir"] .pc-tarif-ligne small,html[data-theme="noir"] .pc-tarif-prix span,
html[data-theme="noir"] .pc-fait b,html[data-theme="noir"] .pc-etiquette,html[data-theme="noir"] .pc-grands span,
html[data-theme="noir"] .pc-legende,html[data-theme="noir"] .pc-onglets button,html[data-theme="noir"] .pc-descendre{font-size:12px}
/* LES MOTS-CLES : la police des etiquettes, droite, avec un reflet rose qui passe */
html[data-theme="noir"] .pc-titre em,html[data-theme="noir"] .pc-dessous h2 em,html[data-theme="noir"] .pc-heros2 .pc-titre em{
  font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;font-style:normal;font-weight:500;letter-spacing:-.05em;
  background:linear-gradient(100deg,#e6e6e6 0%,#e6e6e6 26%,#ffd3e4 36%,#ff7eb0 45%,#ff7eb0 55%,#ffd3e4 64%,#e6e6e6 74%,#e6e6e6 100%);
  background-size:320% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent;
  text-shadow:none;animation:pc-reflet 10s ease-in-out infinite}
html[data-theme="noir"] .pc-grands b{
  background:linear-gradient(100deg,#e6e6e6 0%,#e6e6e6 26%,#ffd3e4 36%,#ff7eb0 45%,#ff7eb0 55%,#ffd3e4 64%,#e6e6e6 74%,#e6e6e6 100%);
  background-size:320% 100%;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;
  animation:pc-reflet 10s ease-in-out infinite}
html[data-theme="noir"] .pc-frein b{
  background:linear-gradient(100deg,#e6e6e6 0%,#e6e6e6 26%,#ffd3e4 36%,#ff7eb0 45%,#ff7eb0 55%,#ffd3e4 64%,#e6e6e6 74%,#e6e6e6 100%);
  background-size:320% 100%;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;
  animation:pc-reflet 10s ease-in-out infinite}
html[data-theme="noir"] .pc-frein:nth-child(3n+2) b{animation-delay:.8s}
html[data-theme="noir"] .pc-frein:nth-child(3n) b{animation-delay:1.6s}
/* LE MARCHE : le schema d'ontologie, juste apres le heros */
.pc-marche{margin:0;width:100%;display:flex;flex-direction:column;align-items:center;gap:14px}
.pc-marche .pm{width:min(660px,96%);height:auto;overflow:visible}
.pc-marche figcaption{font:12px ui-monospace,"SF Mono",Menlo,Consolas,monospace;color:var(--gris);text-align:center;padding:0 12px}
.pm text{font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace}
.pm-noeud{fill:#050505;stroke:rgba(255,255,255,.6);stroke-width:1.1}
.pm-centre{fill:#141414;stroke:#fff;stroke-width:1.6}
.pm-raime{stroke:#ff7eb0;stroke-width:1.3}
.pm-titre{fill:#fff;font-size:11px;letter-spacing:.08em}
.pm-sous{fill:#9d9d9d;font-size:10px}
.pm-rel{fill:#cfcfcf;font-size:10px;paint-order:stroke;stroke:#000;stroke-width:6px;stroke-linejoin:round}
.pm-panneau{fill:rgba(0,0,0,.65);stroke:rgba(255,255,255,.3);stroke-dasharray:3 5}
.pm-ligne{fill:#e6e6e6;font-size:10px}
.pm-fond{fill:rgba(255,255,255,.12)}
.pm-barre{fill:#fff;transform-box:fill-box;transform-origin:left center;transform:scaleX(0);transition:transform 1.2s var(--doux)}
.pc-vu .pm-barre{transform:none}
.pc-marche .pc-flux{fill:none;stroke:#fff;stroke-width:1.1;stroke-dasharray:4 6;animation:pc-flux 1.1s linear infinite}
.pc-bloc--large + .pc-intro,.pc-bloc-freins + .pc-intro{margin-top:clamp(72px,11vh,130px)}
.pm-m{display:none;width:min(420px,100%);padding:0 4px;font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace}
.pm-m-noeud{padding:12px 14px;border:1px solid rgba(255,255,255,.6);border-radius:10px;background:#050505;text-align:center}
.pm-m-noeud b{display:block;font-size:12px;font-weight:500;letter-spacing:.08em;color:#fff}
.pm-m-noeud span{display:block;margin-top:4px;font-size:12px;color:var(--gris)}
.pm-m-centre{background:#141414;border:1.6px solid #fff}
.pm-m-raime{border-color:#ff7eb0}
.pm-m-rel{margin:0;padding:8px 0;text-align:center;font-size:12px;color:#cfcfcf}
.pm-m-panneau{padding:12px 14px;border:1px dashed rgba(255,255,255,.3);border-radius:10px}
.pm-m-panneau b{display:block;margin-bottom:8px;font-size:12px;font-weight:500;letter-spacing:.08em;color:#fff}
.pm-m-panneau p{display:flex;flex-wrap:wrap;justify-content:space-between;margin:0 0 10px;font-size:12px;color:#e6e6e6}
.pm-m-panneau i{font-style:normal}
.pm-m-panneau s{flex:0 0 100%;height:3px;margin-top:5px;background:rgba(255,255,255,.12);text-decoration:none}
.pm-m-panneau u{display:block;height:3px;background:#fff}
@media (max-width:700px){.pc-marche .pm{display:none}.pm-m{display:block}}
html[data-theme="noir"] .pc-sources,.pc-sources{margin:22px 0 0;font:12px/1.6 ui-monospace,"SF Mono",Menlo,Consolas,monospace;color:var(--gris);max-width:60ch}
/* LES FREINS, en fin de page, a la place de l'appel final */
.pc-bloc-freins{margin-top:clamp(72px,11vh,130px);padding-top:34px;border-top:1px solid var(--trait)}
html[data-theme="noir"] .pc-freins-intro{margin:18px 0 0;font-size:18px;line-height:1.65;color:var(--texte);max-width:56ch}
.pc-freins{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;margin-top:clamp(28px,4vh,44px);background:var(--trait);border:1px solid var(--trait)}
.pc-frein{display:flex;flex-direction:column;padding:clamp(24px,2.6vw,36px) clamp(18px,2vw,28px);background:#030303}
.pc-frein b{display:block;font-size:var(--t3,36px);font-weight:500;letter-spacing:-.04em;line-height:1;color:#fff}
.pc-frein h3{margin:18px 0 0;font-size:18px;font-weight:600;letter-spacing:-.01em;color:#fff}
.pc-frein p{margin:8px 0 0;font-size:14px;line-height:1.55;color:var(--gris)}
.pc-frein .pc-frein-rep{margin-top:auto;padding-top:18px;color:#fff}
@media (max-width:1000px){.pc-freins{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:640px){.pc-freins{grid-template-columns:1fr}}
@media (prefers-reduced-motion:reduce){.pm-barre{transition:none;transform:none}.pc-marche .pc-flux,html[data-theme="noir"] .pc-frein b{animation:none}}
.pc-points{opacity:.3}
/* le bouton d'appel, au centre de l'en-tete */
.pc-cta{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:inline-flex;align-items:center;height:36px;
  padding:0 18px;border-radius:999px;background:#fff;color:#000;font-size:13.5px;font-weight:600;text-decoration:none;
  white-space:nowrap;box-shadow:0 10px 30px -14px rgba(0,0,0,.8);transition:background-color .3s,box-shadow .3s}
.pc-cta:hover{background:#e6e6e6;box-shadow:0 12px 34px -12px rgba(255,255,255,.35)}
@media (max-width:1100px){.pc-cta{display:none}}
/* le pied de page, a la place du bandeau : contact et pages legales */
.pc-pied{position:fixed;left:0;right:0;bottom:0;z-index:15;height:44px;display:flex;align-items:center;justify-content:space-between;
  gap:16px;padding:0 clamp(20px,5vw,72px);border-top:1px solid rgba(255,255,255,.08);font-size:12.5px;
  background:linear-gradient(0deg,rgba(0,0,0,.9),rgba(0,0,0,.45));-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
.pc-pied a{color:var(--gris);text-decoration:none;transition:color .3s}
.pc-pied a:hover{color:#fff}
.pc-pied-droite{display:flex;gap:20px}
@media (max-width:560px){.pc-pied{font-size:11px;gap:10px}.pc-pied-droite{gap:11px}}
/* les avis Google, en bas de l'accueil */
.pc-avis{align-self:flex-start;display:inline-flex;align-items:center;gap:10px;margin-top:clamp(26px,4vh,40px);padding:9px 16px 9px 12px;
  border:1px solid rgba(255,255,255,.2);border-radius:999px;background:rgba(255,255,255,.05);color:#fff;font-size:13.5px;
  text-decoration:none;opacity:0;animation:pc-monte .6s var(--doux) .42s forwards;transition:border-color .3s}
a.pc-avis:hover{border-color:rgba(255,255,255,.6)}
.pc-avis svg{width:16px;height:16px;fill:#fff;flex:none}
.pc-avis span{white-space:nowrap}
@media (max-width:420px){.pc-avis{font-size:12.5px;gap:8px}.pc-etoiles{font-size:11px;letter-spacing:1px}}
.pc-etoiles{color:#fff;letter-spacing:2px;font-size:13px}
.pc-avis--vide{border-style:dashed;color:var(--gris)}
.pc-avis--vide .pc-etoiles{opacity:.45}
/* le cerveau de rAIme, dessine comme un editeur d'agents */
.pc-bloc--large{grid-template-columns:minmax(0,4fr) minmax(0,7fr)}
.pc-visuel--onto{padding:18px 8px}
.pc-onto{width:100%;max-width:700px;height:auto;overflow:visible}
.pc-onto .po-noeud rect{fill:#0b0b10;stroke:rgba(255,255,255,.88);stroke-width:1.3}
.pc-onto .po-noeud g{fill:none;stroke:#fff;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.pc-onto .po-port{fill:#fff}
.pc-onto .pc-flux{fill:none;stroke:#fff;stroke-width:1.2;stroke-dasharray:4 6;animation:pc-flux 1.1s linear infinite}
.pc-onto .pc-cadre{fill:rgba(0,0,0,.22);stroke:rgba(255,255,255,.4);stroke-width:1;stroke-dasharray:7 6}
.pc-onto text{font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace}
.pc-onto .po-titre{fill:#fff;font-size:10.5px;letter-spacing:.06em}
.pc-onto .po-agent{fill:#fff;font-size:12.5px;font-weight:600}
.pc-onto .po-sous{fill:#9d9d9d;font-size:9px;letter-spacing:.04em}
.pc-onto .po-case,.pc-onto .po-bouton{fill:#08080c;stroke:rgba(255,255,255,.34)}
.pc-onto .po-bouton-plein{fill:#fff}
.pc-onto .po-bouton-texte{fill:#000;font-size:10.5px;letter-spacing:.1em}
.pc-onto .po-clair{fill:#fff}
.pc-onto svg{fill:#fff}
.pc-onto .po-plus,.pc-onto .po-trait{fill:none;stroke:#fff;stroke-width:1.4}
.pc-onto .po-curseur rect{fill:#23232b;stroke:rgba(255,255,255,.18)}
.pc-onto .po-curseur text{fill:#fff;font-family:Inter,sans-serif;font-size:11px}
@media (max-width:900px){.pc-bloc--large{grid-template-columns:1fr}}
@media (prefers-reduced-motion:reduce){.pc-onto .po-curseur{display:none}.pc-onto .pc-flux{animation:none}}
/* le reflet rose des mots-cles et des grands chiffres : voir LES MOTS-CLES, plus haut */
html[data-theme="noir"] .pc-grands div:nth-child(2) b{animation-delay:.6s}
html[data-theme="noir"] .pc-grands div:nth-child(3) b{animation-delay:1.2s}
@keyframes pc-reflet{0%{background-position:100% 0}60%,100%{background-position:0 0}}
.pc-point{display:block;width:8px;height:8px;margin:10px 0;border-radius:50%;background:#fff;opacity:.7;
  animation:pc-respire 4.2s ease-in-out infinite;animation-delay:calc(var(--i) * -.37s)}
@media (prefers-reduced-motion:reduce){.pc-aurore,html[data-theme="noir"] .pc-titre em,html[data-theme="noir"] .pc-dessous h2 em,
  html[data-theme="noir"] .pc-grands b,.pc-point{animation:none}}
@media (prefers-reduced-motion:reduce){
  .pc-apparait{opacity:1;transform:none;transition:none}
  .pc-jetons span{animation:none!important;opacity:1;transform:none}
  .pc-schema .pc-flux,.pc-logos svg,.pc-descendre span{animation:none}
}
/* FOND NOIR PUR (Basile, 25/09/2026) : blanc sur noir, rien d'autre. Plus de panneaux gris, plus de matiere
   floue, plus de colonnes ni de trames : les parties se separent par l'espace et un filet. Derriere toutes
   les pages, le champ de particules du heros, plus leger, qui ondule seul et se souleve sous le curseur. */
html[data-theme="noir"] .pc-matiere,html[data-theme="noir"] .pc-colonnes{display:none}
html[data-theme="noir"] body::before,html[data-theme="noir"] body::after{display:none}
html[data-theme="noir"] body,html[data-theme="noir"] .pc-charge{background:#000}
html[data-theme="noir"] .pc-points{opacity:1;z-index:-2}
html[data-theme="noir"] .pc-bloc,html[data-theme="noir"] .pc-bloc-freins,html[data-theme="noir"] .pc-bloc-logos,
html[data-theme="noir"] .pc-grands{background:none!important;border:0!important;border-top:1px solid var(--trait)!important;
  box-shadow:none!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important;margin-top:clamp(110px,16vh,200px)}
html[data-theme="noir"] .pc-grands{border-bottom:1px solid var(--trait)!important}
html[data-theme="noir"] .pc-bloc .pc-texte{padding-left:0}
html[data-theme="noir"] .pc-bloc--inverse .pc-texte{padding-right:0;padding-left:clamp(28px,4vw,64px)}
html[data-theme="noir"] .pc-bloc-freins,html[data-theme="noir"] .pc-bloc-logos{padding:clamp(44px,6vh,72px) 0 0}
html[data-theme="noir"] .pc-grands div:first-child{padding-left:0}
html[data-theme="noir"] .pc-visuel{background:none}
html[data-theme="noir"] .pc-freins,html[data-theme="noir"] .pc-routes{background:none;border:0;gap:0 clamp(24px,3vw,48px)}
html[data-theme="noir"] .pc-logos{background:none;border:0;gap:0}
html[data-theme="noir"] .pc-frein,html[data-theme="noir"] .pc-route{background:none!important;border-top:1px solid var(--trait)}
html[data-theme="noir"] .pc-frein{padding:clamp(28px,3vw,40px) 0 clamp(40px,5vw,60px)}
html[data-theme="noir"] .pc-route{padding:20px 0}
html[data-theme="noir"] .pc-logos div{background:none}
html[data-theme="noir"] .pc-jetons span,html[data-theme="noir"] .pc-prompt,html[data-theme="noir"] .pc-avis,
html[data-theme="noir"] .pc-tarif{background:none}
html[data-theme="noir"] .pc-tarif--fort{background:none;outline:1px solid rgba(255,255,255,.7);outline-offset:-1px}
html[data-theme="noir"] .pc-tarif--fort h2,html[data-theme="noir"] .pc-tarif--fort .pc-tarif-prix b,
html[data-theme="noir"] .pc-tarif--fort .pc-tarif-ligne span{color:#fff}
html[data-theme="noir"] .pc-tarif--fort .pc-tarif-pour{color:var(--texte)}
html[data-theme="noir"] .pc-tarif--fort .pc-tarif-prix span,html[data-theme="noir"] .pc-tarif--fort .pc-tarif-ligne small{color:var(--gris)}
html[data-theme="noir"] .pc-tarif--fort .pc-tarif-ligne{border-top-color:var(--trait)}
html[data-theme="noir"] .pc-tarif--fort .pc-comment{color:#fff;text-decoration-color:rgba(255,255,255,.4)}
html[data-theme="noir"] .pc-onglets button[aria-selected="true"]{background:none;color:#fff;box-shadow:inset 0 -1px 0 #fff}
/* la respiration : plus d'air entre les parties, des lignes de texte plus courtes */
html[data-theme="noir"] .pc-intro{margin-bottom:clamp(56px,9vh,112px)}
html[data-theme="noir"] .pc-intro p,html[data-theme="noir"] .pc-texte p{max-width:44ch}
html[data-theme="noir"] .pc-bloc-freins + .pc-intro,html[data-theme="noir"] .pc-bloc--large + .pc-intro{margin-top:clamp(130px,20vh,240px)}
"""

JS = """
(function(){
  var LANGUES = __LANGUES__, RES = "__RESERVER__", AGENDA = "__AGENDA__", LIVRE = "__LIVRE__", CPF = __CPF__, PIED = __PIED__, AVIS = __AVIS__, N, DESSOUS, U, LANGUE;
  var scene = document.getElementById("pc-scene"), fil = document.getElementById("pc-fil"),
      retour = document.getElementById("pc-retour");
  // La langue : celle choisie par le visiteur, sinon celle de son navigateur.
  function choisir(){
    var l = null; try{ l = localStorage.getItem("pc-langue"); }catch(err){}
    return l === "fr" || l === "en" ? l : (/^en/i.test(navigator.language || "") ? "en" : "fr");
  }
  function langue(l){
    LANGUE = l; N = LANGUES[l].N; DESSOUS = LANGUES[l].D; U = LANGUES[l].U;
    document.documentElement.lang = l;
    var b = document.getElementById("pc-langue");
    if(b){ b.textContent = l === "fr" ? "EN" : "FR"; b.setAttribute("aria-label", U.autre); }
    etiquetteJour();
    var lv = document.getElementById("pc-livre-texte"); if(lv) lv.innerHTML = U.livre;
    var cta = document.getElementById("pc-cta"); if(cta) cta.textContent = U.cta;
    var sf = document.querySelector("[data-score-fermer]"); if(sf) sf.setAttribute("aria-label", U.fermer);
    var rm = document.getElementById("pc-rdv-mono"), rt = document.getElementById("pc-rdv-titre");
    if(rm) rm.textContent = U.rdv_mono; if(rt) rt.textContent = U.rdv_titre;
    menu();
    var bg = document.getElementById("pc-burger"); if(bg) bg.setAttribute("aria-label", U.menu);
    var pied = document.getElementById("pc-pied");
    if(pied) pied.innerHTML = '<a href="mailto:contact@raime.fr">contact@raime.fr</a><span class="pc-pied-droite">'
      + '<a href="/mentions-legales/">' + U.legal[0] + '</a><a href="/cgv/">' + U.legal[1] + '</a><a href="/confidentialite/">' + U.legal[2] + '</a></span>';
  }
  // Les avis Google : la note et le nombre ; en apercu, l'emplacement vide tant qu'il n'y a pas d'avis.
  function avis(){
    if(!AVIS) return "";
    var n = AVIS.nombre || 0;
    if(!n && !AVIS.apercu) return "";
    var note = AVIS.note ? String(AVIS.note).replace(".", LANGUE === "fr" ? "," : ".") + " · " : "";
    var dedans = '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#o-google"/></svg>'
      + '<span class="pc-etoiles" aria-hidden="true">★★★★★</span><span>' + esc(n ? note + n + " " + U.avis : U.avis_bientot) + '</span>';
    return AVIS.lien && n ? '<a class="pc-avis" href="' + AVIS.lien + '" target="_blank" rel="noopener">' + dedans + '</a>'
      : '<div class="pc-avis' + (n ? '' : ' pc-avis--vide') + '">' + dedans + '</div>';
  }
  // Le menu plein ecran : liens rapides et autres liens, dans la langue du moment.
  function menu(){
    var m = document.getElementById("pc-menu"); if(!m) return;
    var rapides = [["accueil",U.noms.accueil],["tarifs/particulier",U.noms.particulier],["tarifs",U.noms.pro],["projets",U.noms.projets]]
      .map(function(e){ return '<button data-vers="' + e[0] + '">' + esc(e[1]) + ' <i>↗</i></button>'; }).join("")
      + '<a href="mailto:contact@raime.fr">' + esc(U.contact) + ' <i>↗</i></a>';
    var autres = '<a href="/mentions-legales/">' + esc(U.legal[0]) + ' <i>↗</i></a><a href="/cgv/">' + esc(U.legal[1]) + ' <i>↗</i></a>'
      + '<a href="/confidentialite/">' + esc(U.legal[2]) + ' <i>↗</i></a>'
      + '<a href="' + RES + '" target="_blank" rel="noopener">' + esc(U.cta) + ' <i>↗</i></a>'
      + '<a href="__GH__" target="_blank" rel="noopener">GitHub <i>↗</i></a><a href="__LI__" target="_blank" rel="noopener">LinkedIn <i>↗</i></a>';
    m.innerHTML = '<div class="pc-menu-gauche"><p>rAIme 2026</p><h2>' + esc(U.menu_phrase) + '</h2><small>' + esc(U.menu_lieu) + '</small></div>'
      + '<div class="pc-menu-droite"><button class="pc-menu-fermer" data-fermer aria-label="' + esc(U.fermer) + '">✕</button>'
      + '<div><p class="pc-mono">' + esc(U.liens_rapides) + '</p>' + rapides + '</div>'
      + '<div><p class="pc-mono">' + esc(U.autres_liens) + '</p>' + autres + '</div></div>';
  }
  // La reservation : l'agenda Google de Basile (vue integrable) dans une fenetre du site. Les rendez-vous
  // arrivent dans son agenda, avec la confirmation par e-mail, sans ouvrir de nouvelle page.
  // La fenetre « Comment ça marche » des tarifs : le Score rAIme, dans la langue du moment.
  function score(oui, quoi){
    var m = document.getElementById("pc-score"); if(!m) return false;
    if(oui){ document.getElementById("pc-score-contenu").innerHTML = LANGUES[LANGUE].S[quoi] || LANGUES[LANGUE].S.arbitrage; animer(document.getElementById("pc-score-contenu")); }
    m.classList.toggle("pc-ouvert", oui); m.setAttribute("aria-hidden", oui ? "false" : "true");
    document.documentElement.style.overflow = oui ? "hidden" : "";
    if(oui){ var f = m.querySelector("[data-score-fermer]"); if(f) f.focus(); }
    return true;
  }
  // ?ouvrir=audit (ou arbitrage) : la fenêtre « Comment ça marche » s'ouvre d'elle-même, pour un lien à envoyer
  setTimeout(function(){ var q = (location.search.match(/[?&]ouvrir=(audit|arbitrage)(?:&|$)/) || [])[1]; if(q) score(true, q); }, 700);
  // Le mouvement sur le texte et les chiffres (02/10/2026) : un chiffre monte jusqu'à sa valeur ; un texte
  // s'écrit en se brouillant ; un doute se barre, puis se réécrit en notre réponse.
  var SIGNES = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%+=";
  function brouiller(el, cible, duree, fin){
    var t0 = performance.now(), dep = el.textContent;
    (function pas(){
      var f = Math.min(1, (performance.now() - t0) / duree), n = Math.floor(cible.length * f), s = cible.slice(0, n);
      for(var i = n; i < cible.length; i++) s += cible[i] === " " ? " " : SIGNES[(Math.random() * SIGNES.length) | 0];
      el.textContent = f < 1 ? s : cible;
      if(f < 1) requestAnimationFrame(pas); else if(fin) fin();
    })();
  }
  function animer(racine){
    var doux = matchMedia("(prefers-reduced-motion: reduce)").matches;
    [].forEach.call(racine.querySelectorAll("[data-compte]"), function(b){
      var v = +b.getAttribute("data-compte"), t0 = 0;
      if(doux){ b.textContent = v; return; }
      setTimeout(function(){ t0 = performance.now(); (function pas(){
        var f = Math.min(1, (performance.now() - t0) / 1800), e = 1 - Math.pow(2, -10 * f);
        b.textContent = Math.round(v * (f >= 1 ? 1 : e)); if(f < 1) requestAnimationFrame(pas); })(); }, 1500);
    });
    [].forEach.call(racine.querySelectorAll("[data-ecrit]"), function(p, k){
      var txt = p.textContent; if(doux) return; p.textContent = "";
      setTimeout(function(){ brouiller(p, txt, 900); }, 2300 + k * 500);
    });
    [].forEach.call(racine.querySelectorAll("[data-de]"), function(s){
      var k = +s.getAttribute("data-k"), vers = s.getAttribute("data-vers");
      if(doux){ s.textContent = vers; s.classList.add("pa-repondu"); return; }
      setTimeout(function(){ s.classList.add("pa-barre"); }, 1700 + k * 650);
      setTimeout(function(){ s.classList.add("pa-repondu"); brouiller(s, vers, 800); }, 2300 + k * 650);
    });
  }
  function reserver(oui){
    var m = document.getElementById("pc-rdv"); if(!m) return false;
    if(oui){ var f = document.getElementById("pc-rdv-cadre"); if(f && !f.getAttribute("src")) f.setAttribute("src", AGENDA); }
    m.classList.toggle("pc-ouvert", oui); m.setAttribute("aria-hidden", oui ? "false" : "true");
    document.documentElement.style.overflow = oui ? "hidden" : "";
    return true;
  }
  function ouvrir(oui){
    var m = document.getElementById("pc-menu"); if(!m) return;
    m.classList.toggle("pc-ouvert", oui); m.setAttribute("aria-hidden", oui ? "false" : "true");
  }
  // Le heros de l'accueil, a la maniere d'Armory : le menu part du milieu, en haut ; le titre sobre
  // en bas a gauche ; au fond, le papillon de rAIme en nuage de particules.
  function heros(id,n){
    var items = [["tarifs/particulier",U.noms.particulier],["tarifs",U.noms.pro],["projets",U.noms.projets]].map(function(e,i){
      return '<button class="pc-gm" data-vers="' + e[0] + '" style="animation-delay:' + (100 + i*80) + 'ms">' + esc(e[1]) + '<i>→</i></button>'; }).join("");
    return '<div class="pc-heros2"><canvas class="pc-champ" aria-hidden="true"></canvas>'
      + '<nav class="pc-grand-menu" aria-label="' + esc(U.menu) + '">' + items + avis() + '</nav>'
      + '<div class="pc-heros2-bas"><h1 class="pc-titre pc-titre--geant">' + esc(U.cle[0]) + ' <em>' + esc(U.cle[1]) + '</em></h1>'
      + '<p class="pc-phrase">' + esc(n.phrase) + '</p><div class="pc-heros2-actions">'
      + '<a class="pc-bouton-carre" href="' + RES + '" target="_blank" rel="noopener"><i></i>' + esc(U.reserver) + '</a>'
      + '<button class="pc-descendre" data-descendre>' + U.decouvrir + ' <span>↓</span></button></div></div></div>';
  }
  // Le champ de particules au fond du heros : une nappe de points en perspective qui ondule
  // lentement et se souleve sous le curseur (ou le doigt). Il vit dans le heros, defile avec lui,
  // et s'arrete quand le heros disparait.
  var POINTEUR = {x:-9999, y:-9999, f:0}, SUIVI = false;
  function animerChamp(){
    var c = scene.querySelector(".pc-champ"); if(!c) return;
    if(!SUIVI){ SUIVI = true; window.addEventListener("pointermove", function(e){
      POINTEUR.x = e.clientX; POINTEUR.y = e.clientY; POINTEUR.f = 1; }, {passive:true}); }
    var calme = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    var x = c.getContext("2d"), D = Math.min(window.devicePixelRatio || 1, 2), t0 = performance.now(), COLS = 96, RANGS = 26;
    function image(){
      if(!c.isConnected) return false;
      var r = c.getBoundingClientRect(), W = r.width, H = r.height;
      if(!W || !H) return true;
      if(c.width !== Math.round(W*D) || c.height !== Math.round(H*D)){ c.width = Math.round(W*D); c.height = Math.round(H*D); }
      x.setTransform(D,0,0,D,0,0); x.clearRect(0,0,W,H);
      var t = calme ? 0 : (performance.now() - t0) / 1000, px = POINTEUR.x - r.left, py = POINTEUR.y - r.top,
          J = document.documentElement.hasAttribute("data-jour");
      POINTEUR.f *= .985;
      for(var j = 0; j < RANGS; j++){
        var v = j / (RANGS - 1), yb = H*(.1 + .9*Math.pow(v, 1.7)), ecart = .55 + 1.25*v;
        for(var i = 0; i < COLS; i++){
          var u = i / (COLS - 1) - .5, sx = W*.5 + u*W*ecart;
          if(sx < -10 || sx > W + 10) continue;
          var onde = Math.sin(u*10 + t*.8 + v*5) * Math.cos(v*7 - t*.55);
          var dx = sx - px, dy = yb - py, pr = POINTEUR.f * Math.exp(-(dx*dx + dy*dy) / 12000);
          var sy = yb - (onde*7 + pr*34) * (.35 + .65*v), a = (.1 + .45*v) * (.72 + .28*onde) + pr*.55;
          // sous le curseur, les points soulevés prennent la teinte rose du reflet des mots-clés
          x.fillStyle = J ? "rgba(" + Math.round(219*pr) + "," + Math.round(79*pr) + "," + Math.round(139*pr) + "," + Math.min(.9, a).toFixed(3) + ")"
                          : "rgba(255," + Math.round(255 - 129*pr) + "," + Math.round(255 - 79*pr) + "," + Math.min(.9, a).toFixed(3) + ")";
          var s = .9 + 1.2*v + pr*1.2; x.fillRect(sx, sy, s, s);
        }
      }
      return true;
    }
    function tour(){
      if(!image() || calme) return;
      if(document.hidden) setTimeout(function(){ requestAnimationFrame(tour); }, 600); else requestAnimationFrame(tour);
    }
    tour(); setTimeout(image, 1200);
  }
  // Les tarifs : un onglet Particulier, un onglet Professionnel ; une colonne par offre, la plus
  // demandee en clair ; chaque ligne porte son intitule (lisible aussi sur telephone).
  function tarifs(id,n,onglet){
    var o = n.onglets[onglet];
    var tabs = '<div class="pc-onglets" role="tablist">' + [["tarifs/particulier",U.onglet_part,"particulier"],["tarifs",U.onglet_pro,"pro"]]
      .map(function(x){ return '<button role="tab" data-vers="' + x[0] + '" aria-selected="' + (x[2] === onglet) + '">' + esc(x[1]) + '</button>'; })
      .join("") + '</div>';
    var cols = o.colonnes.map(function(c,i){
      var lien = c.lien || RES, libelle = c.bouton || U.cta;
      return '<div class="pc-tarif' + (c.fort ? ' pc-tarif--fort' : '') + '" style="animation-delay:' + (120 + i*90) + 'ms">'
        + '<h2>' + esc(c.nom) + '</h2><p class="pc-tarif-pour">' + esc(c.pour) + '</p>'
        + '<p class="pc-tarif-prix"><b' + (/\\d/.test(c.prix) ? '' : ' class="pc-prix-mot"') + '>' + esc(c.prix) + '</b><span>' + esc(c.unite) + '</span></p>'
        + (c.cpf && CPF ? '<p class="pc-cpf"><span>CPF</span>' + esc(c.cpf) + '</p>' : '')
        + (c.comment ? '<button class="pc-comment" type="button" data-score="' + c.comment + '">' + esc(U.comment) + ' <span>→</span></button>' : '')
        + '<a class="pc-tarif-bouton" href="' + lien + '" target="_blank" rel="noopener"><i></i>' + esc(libelle) + '</a>'
        + o.lignes.map(function(l){ return '<div class="pc-tarif-ligne"><small>' + esc(l[0]) + '</small><span>' + esc(l[i+1]) + '</span></div>'; }).join("")
        + '</div>'; }).join("");
    var notes = (o.notes || []).map(function(x){ return '<li>' + esc(x) + '</li>'; }).join("");
    return '<div class="pc-vue pc-vue--tarifs"><div class="pc-haut">' + tete(id,n) + tabs + '</div>'
      + '<div class="pc-tarifs" style="--n:' + o.colonnes.length + '">' + cols + '</div>'
      + (notes ? '<ul class="pc-tarif-notes">' + notes + '</ul>' : '') + '</div>';
  }
  function esc(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
  function nom(id){ return U.noms[id] || (N[id] && N[id].titre) || id; }
  function parent(id){ var i = id.lastIndexOf("/"); return i < 0 ? "accueil" : id.slice(0,i); }

  function tete(id,n){
    var t = Array.isArray(n.titre) ? esc(n.titre[0]) + '<em>' + esc(n.titre[1]) + '</em>' : esc(n.titre);
    return (id === "accueil" ? "" : '<p class="pc-etiquette">' + esc(n.etiquette) + '</p>')
      + '<h1 class="pc-titre">' + t + '</h1><p class="pc-phrase">' + esc(n.phrase) + '</p>';
  }
  function faits(n){
    return '<div class="pc-faits">' + (n.faits || []).map(function(f,i){
      return '<div class="pc-fait" style="animation-delay:' + (160 + i*70) + 'ms"><b>' + esc(f[0]) + '</b><span>' + esc(f[1]) + '</span></div>';
    }).join("") + '</div>';
  }
  function chemins(id,n){
    var legal = id === "accueil" && !PIED ? '<p class="pc-legal"><a href="mailto:contact@raime.fr">contact@raime.fr</a>'
      + '<a href="/mentions-legales/">' + U.legal[0] + '</a><a href="/cgv/">' + U.legal[1] + '</a><a href="/confidentialite/">' + U.legal[2] + '</a></p>' : '';
    var h = '<div class="pc-vue pc-vue--chemins"><div class="pc-haut">' + tete(id,n) + '</div><div class="pc-chemins pc-chemins--' + n.enfants.length + '" style="--n:' + n.enfants.length + '">';
    n.enfants.forEach(function(e,i){
      var x = N[e];
      h += '<button class="pc-chemin" data-vers="' + e + '" style="animation-delay:' + (120 + i*70) + 'ms">'
         + '<b>' + esc(x.libelle || (x.type === "chemins" ? (U.noms[e] || x.etiquette) : x.titre)) + '</b>'
         + '<small>' + esc(x.court || "") + '</small><i>→</i></button>';
    });
    return h + '</div>' + legal + '</div>';
  }
  function fiche(id,n){
    var preuve = n.preuve ? '<button class="pc-preuve" data-vers="' + n.preuve[1] + '">' + esc(n.preuve[0]) + ' →</button>' : '';
    return '<div class="pc-vue pc-vue--fiche"><div>' + tete(id,n) + '</div><div>' + faits(n) + preuve
      + '<div class="pc-actions"><a class="pc-bouton" href="' + RES + '" target="_blank" rel="noopener">' + esc(U.reserver) + '</a></div>'
      + '</div></div>';
  }
  function projet(id,n){
    var liens = (n.liens || []).map(function(l){
      return '<a href="' + l[1] + '" target="_blank" rel="noopener">' + esc(l[0]) + ' ↗</a>';
    }).join("");
    var img = n.image ? '<figure class="pc-image"><img src="' + n.image[0] + '" alt="' + esc(n.image[1]) + '" width="' + n.image[2]
      + '" height="' + n.image[3] + '" decoding="async"></figure>' : '';
    if(n.chiffres){ img += '<div class="pc-chiffres">' + n.chiffres.map(function(c,i){
      return '<div style="animation-delay:' + (380 + i*80) + 'ms"><b>' + esc(c[0]) + '</b><span>' + esc(c[1]) + '</span></div>';
    }).join("") + '</div>'; }
    return '<div class="pc-vue pc-vue--projet"><div>' + tete(id,n) + faits(n)
      + (liens ? '<div class="pc-liens">' + liens + '</div>' : '') + '</div>'
      + '<div>' + img + '</div></div>';
  }
  function chemin(id){
    var bouts = id === "accueil" ? [] : id.split("/"), liste = ["accueil"], acc = "";
    bouts.forEach(function(b){ acc = acc ? acc + "/" + b : b; liste.push(acc); });
    return liste;
  }
  // Sous l'accueil, quand il existe : la page se deroule, chaque bloc apparait a son tour.
  function apparaitre(){
    var els = scene.querySelectorAll(".pc-apparait");
    if(!("IntersectionObserver" in window)){ for(var i = 0; i < els.length; i++) els[i].classList.add("pc-vu"); return; }
    var io = new IntersectionObserver(function(es){ es.forEach(function(x){
      if(x.isIntersecting){ x.target.classList.add("pc-vu"); io.unobserve(x.target); } }); }, {threshold:.16});
    for(var j = 0; j < els.length; j++) io.observe(els[j]);
  }
  function rendre(id){
    // Essai noir : les pages Particulier et Professionnel sont remplacees par les onglets des tarifs.
    if(PIED){ if(id === "particulier") id = "tarifs/particulier"; else if(id === "pro" || id.indexOf("pro/") === 0) id = "tarifs"; }
    var onglet = id === "tarifs/particulier" ? "particulier" : (id === "tarifs" ? "pro" : null);
    if(!N[id] && !onglet) id = "accueil";
    var n = onglet ? N.tarifs : N[id], long = id === "accueil" && !!DESSOUS;
    var vue = long ? heros(id,n) : onglet ? tarifs(id,n,onglet) : n.type === "chemins" ? chemins(id,n)
      : n.type === "projet" ? projet(id,n) : fiche(id,n);
    scene.classList.toggle("pc-scene--long", long);
    scene.innerHTML = long ? vue + DESSOUS : vue;
    if(long) animerChamp();
    ouvrir(false);
    if(long) apparaitre();
    fil.innerHTML = id === "accueil" ? "" : chemin(id).map(function(x,i){
      return (i ? '<span>›</span>' : "") + '<button data-vers="' + x + '">' + esc(x === "accueil" ? U.accueil : nom(x)) + '</button>';
    }).join("");
    retour.classList.toggle("pc-la", id !== "accueil");
    retour.setAttribute("data-vers", parent(id));
    document.title = (id === "accueil" ? U.titre : nom(onglet ? "tarifs" : id) + " — rAIme");
    window.scrollTo(0, 0);
  }
  function aller(id){
    var cible = id === "accueil" ? "" : "#/" + id, ici = location.hash === "#" ? "" : location.hash;
    if(ici === cible){ rendre(id); return; }   // meme adresse : on reaffiche et on remonte en haut
    location.hash = id === "accueil" ? "#" : "#/" + id;
  }
  var ANCIENNES = {"offres":"pro","formation":"pro/formation","audit":"pro/audit","diagnostic":"pro/audit",
    "arbitrage":"pro/arbitrage","verifications":"pro/arbitrage","suivi":"pro","pilotage":"pro","accompagnement":"pro",
    "projets":"projets","automatisation":"pro/automatisation","automatiser":"pro/automatisation","approche":"accueil","methode":"accueil","secteurs":"pro","contact":"accueil","formulaire":"accueil"};
  function lire(){
    var h = location.hash.replace(/^#\\/?/, "");
    if(h && !N[h] && h !== "tarifs/particulier" && ANCIENNES[h.replace(/^\\//, "")]){ h = ANCIENNES[h.replace(/^\\//, "")]; history.replaceState(null, "", h === "accueil" ? "#" : "#/" + h); }
    return h || "accueil";
  }

  // Jour ou nuit : la nuit est le site d'origine ; le jour inverse le blanc et le noir (voir jour.py).
  function etiquetteJour(){
    var j = document.getElementById("pc-jour"); if(!j || !U.jour) return;
    var jour = document.documentElement.hasAttribute("data-jour");
    j.setAttribute("aria-label", jour ? U.nuit : U.jour); j.setAttribute("aria-pressed", jour ? "true" : "false");
  }
  document.addEventListener("click", function(e){
    var jb = e.target.closest("[data-jour-bascule]");
    if(jb){ e.preventDefault(); var r = document.documentElement, jour = !r.hasAttribute("data-jour");
      if(jour) r.setAttribute("data-jour", ""); else r.removeAttribute("data-jour");
      try{ localStorage.setItem("pc-jour", jour ? "1" : "0"); }catch(err){}
      etiquetteJour(); return; }
    var lg = e.target.closest("[data-langue]");
    if(lg){ e.preventDefault(); var l = LANGUE === "fr" ? "en" : "fr"; try{ localStorage.setItem("pc-langue", l); }catch(err){}
      langue(l); rendre(lire()); return; }
    var sc = e.target.closest("[data-score]");
    if(sc){ e.preventDefault(); score(true, sc.getAttribute("data-score")); return; }
    if(e.target.closest("[data-score-fermer]") || e.target.id === "pc-score"){ e.preventDefault(); score(false); return; }
    var lien = e.target.closest("a");
    if(lien && PIED && lien.getAttribute("href") === RES && reserver(true)){ e.preventDefault(); ouvrir(false); return; }
    if(e.target.closest("[data-rdv-fermer]") || e.target.id === "pc-rdv"){ e.preventDefault(); reserver(false); return; }
    if(e.target.closest("[data-menu]")){ e.preventDefault(); ouvrir(true); return; }
    if(e.target.closest("[data-fermer]")){ e.preventDefault(); ouvrir(false); return; }
    var d = e.target.closest("[data-descendre]");
    if(d){ e.preventDefault(); var s = document.getElementById("pc-dessous"); if(s) s.scrollIntoView({behavior:"smooth", block:"start"}); return; }
    var b = e.target.closest("[data-vers]");
    if(b){ e.preventDefault(); aller(b.getAttribute("data-vers")); }
  });
  window.addEventListener("hashchange", function(){ rendre(lire()); });
  document.addEventListener("keydown", function(e){ if(e.key === "Escape"){ ouvrir(false); reserver(false); score(false); } });
  langue(choisir());
  rendre(lire());

  var voile = document.getElementById("pc-charge"), barre = voile && voile.querySelector("i");
  if(voile){
    var deja = false; try{ deja = sessionStorage.getItem("pc-vu") === "1"; }catch(err){}
    if(deja || (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches)){ voile.classList.add("pc-partie"); }
    else {
      requestAnimationFrame(function(){ barre.style.width = "100%"; });
      setTimeout(function(){ voile.classList.add("pc-partie"); try{ sessionStorage.setItem("pc-vu","1"); }catch(err){} }, 1200);
    }
  }
})();
"""


LOGOS = pathlib.Path(r"C:\Users\Lenovo\OneDrive\Desktop\rAIme\08_Marque_Logo\Charte_graphique\logos\outils")
# (nom affiche, fichier logo de la charte ou None) ; un logo absent laisse un point a la place
OUTILS = [("Claude", "claude"), ("ChatGPT", "openai"), ("Gemini", "googlegemini"), ("Copilot", None), ("Firefly", None),
          ("DeepSeek", "deepseek"), ("Qwen", "qwen"), ("Ollama", "ollama"), ("Groq", "groq"), ("OpenRouter", "openrouter"),
          ("Hugging Face", "huggingface"), ("LangChain", "langchain"), ("ChromaDB", None), ("n8n", "n8n"),
          ("Python", "python"), ("FastAPI", "fastapi"), ("Node.js", "nodedotjs"), ("JavaScript", "javascript"),
          ("React", "react"), ("Astro", "astro"), ("PostgreSQL", "postgresql"), ("Docker", "docker"),
          ("Hetzner", "hetzner"), ("Cloudflare", "cloudflare"), ("Caddy", "caddy"), ("GitHub", "github"),
          ("Tailscale", "tailscale"), ("SearXNG", "searxng"), ("Stripe", "stripe"), ("Resend", "resend"),
          ("Metabase", "metabase"), ("DocuSeal", None), ("Obsidian", "obsidian"), ("Figma", "figma")]
# Logos complementaires (Simple Icons, CC0), ranges a cote du generateur le 25/09/2026.
LOGOS_PLUS = ICI / "logos"


def chemin_logo(fichier):
    if fichier == "github":
        return RESEAUX[0][2]
    source = next((d / (fichier + ".svg") for d in (LOGOS, LOGOS_PLUS) if fichier and (d / (fichier + ".svg")).exists()), None)
    if not source:
        return None
    s = source.read_text(encoding="utf-8")
    d = s[s.index(' d="') + 4:]
    return d[:d.index('"')]


def bandeau():
    # chaque logo est declare une fois (symbol), puis reutilise dans les deux copies de la liste
    symboles, items = [], []
    for n, f in OUTILS:
        d = chemin_logo(f)
        if d:
            symboles.append('<symbol id="o-%s" viewBox="0 0 24 24"><path d="%s"/></symbol>' % (f, d))
            items.append('<li><svg aria-hidden="true"><use href="#o-%s"/></svg>%s</li>' % (f, n))
        else:
            items.append("<li><i></i>%s</li>" % n)
    un = "".join(items)
    sprite = '<svg width="0" height="0" style="position:absolute" aria-hidden="true">%s</svg>' % "".join(symboles)
    # deux fois la liste : le defilement boucle sans couture
    return '%s<ul>%s</ul><ul aria-hidden="true">%s</ul>' % (sprite, un, un)


# Les textes du dessous de l'accueil, en francais et en anglais. Relus le 25/09/2026 : phrases
# completes, aucun jargon (« RAG », « index », « question de cloture » retires), chiffres mesures.
TEXTES_DESSOUS = {
  "fr": dict(
    intro_mono="L'IA, vue de près", intro_titre="Ce qui se passe derrière <em>une réponse.</em>",
    intro="Choisir l'IA, la payer au juste prix, bien s'en servir. Tous les chiffres viennent des mesures de rAIme.",
    j_mono="Les jetons", j_titre="Tout se compte <em>en jetons.</em>",
    j_texte="L'IA lit et écrit par morceaux de mots : les jetons. Chacun est facturé. Lire un million de jetons coûte de 0,017 $ à 0,78 $ selon le modèle : jusqu'à 46 fois plus, pour le même travail.",
    j_puces=["Rés", "ume", "ce", "contrat", "en", "trois", "points", "."],
    j_legende="Exemple : 6 mots, 8 jetons.",
    c_mono="La demande", c_titre="Une demande claire coûte <em>moins cher.</em>",
    c_texte="Une demande floue fait tâtonner l'IA : plus d'essais, plus de jetons, un résultat moyen. Chez rAIme, une demande réécrite et un réglage corrigé : de 0 à 3 messages réussis sur 3, pour un coût divisé par cinq.",
    avant="Avant", avant_note="0 réussi sur 3", avant_texte="« Ne pose aucune question. » … puis, plus loin : « Termine par une question. »",
    apres="Après", apres_note="3 sur 3 · coût ÷ 5", apres_texte="« Une seule demande, claire. Six à dix lignes. Aucun prix. »",
    grands=[("46 fois", "plus cher, pour le même travail : 1 € avec une IA, 46 € avec une autre."),
            ("506", "IA comparées chaque nuit, sur leur prix et leurs capacités."),
            ("34 s", "suffisent à nos outils pour revenir seuls à la version d'avant, si une mise à jour échoue.")],
    m_mono="Le bon modèle", m_titre="À chaque tâche, <em>son modèle.</em>",
    m_texte="Quatre tâches, quatre modèles. rAIme teste chaque modèle sur ses tâches avant de l'adopter, et en change dès qu'un autre fait mieux pour moins cher. Chez vous, même méthode : la bonne IA à chaque poste, au juste prix.",
    routes=[("Extraire", "Un modèle léger : 0,09 $ le million de jetons lus"),
            ("Raisonner", "Un modèle puissant, pour les décisions importantes"),
            ("Rédiger", "Rapide et économique : 0,03 $ le million de jetons lus"),
            ("Trier", "Le plus petit : 5 fois moins cher, presque aussi juste")],
    d_mono="Vos données", d_titre="Vos documents deviennent <em>un assistant.</em>",
    d_texte="L'assistant cherche dans vos documents et répond en citant ses sources. Tout reste sur un serveur que vous contrôlez ; l'IA se remplace à tout moment, sans rien reconstruire.",
    schema=("VOTRE SERVEUR", "DOCUMENTS", "contrats, notes", "RECHERCHE", "dans vos textes", "ASSISTANT", "répond, cite"),
    schema_alt="Vos documents, une recherche sur votre serveur, un assistant qui répond en citant ses sources",
    p_mono="La preuve", p_titre="Une entreprise qui fonctionne <em>à l'IA.</em>",
    p_texte="rAIme applique d'abord à elle-même ce qu'elle conseille : des agents qui cherchent, mesurent, écrivent et se corrigent, jour et nuit.",
    p_bouton="Voir les agents →", p_alt="Le cerveau de rAIme : veille, savoir, agent IA, recherche, tests, accord, mise en ligne",
    onto=dict(barre=("MODE AGENT", "LE CERVEAU DE rAIme"), panneau=("AGENT IA", "CHAT", "MODÈLES", "AUTO"), vous="Vous",
              noeuds=[("VEILLE", "200+/jour"), ("SAVOIR", "10 000+ passages"), ("Agent IA", "l'architecte"),
                      ("RECHERCHE", "web, code"), ("TESTS", "127 vérifications"), ("ACCORD", "votre oui"),
                      ("SI", "tout est vert ?"), ("EN LIGNE", "retour en 34 s")]),
    o_mono="Les outils", o_titre="Les outils que nous <em>maîtrisons.</em>",
    fin_titre="Parlons de <em>votre projet.</em>", reserver="Réserver un appel d'une heure",
    a_mono="L'IA aujourd'hui", a_titre="L'IA entre dans <em>les entreprises.</em>",
    a_texte=["En 2026, 2 700 milliards de dollars iront à l'IA dans le monde, près de 50 % de plus qu'en 2025. "
             "88 % des organisations interrogées par McKinsey s'en servent dans au moins un service ; "
             "un tiers seulement l'étend à toute l'entreprise.",
             "En France, 18 % des entreprises de 10 salariés ou plus l'utilisent, trois fois plus qu'en 2023 : "
             "pour analyser des textes, rédiger, créer des images. Le but : gagner du temps, fiabiliser le travail."],
    a_sources="Sources : Gartner, septembre 2026 · McKinsey, The State of AI, 2025 · Insee Première n° 2120, juillet 2026",
    a_alt="Le marché de l'IA : les laboratoires fabriquent les modèles, qui animent les outils, qui équipent les entreprises ; "
          "leurs usages, leurs objectifs et leurs freins",
    marche=dict(noeuds=[("LABORATOIRES", "OpenAI, Google, Mistral…", ""), ("MODÈLES", "506 suivis chaque nuit", ""),
                        ("OUTILS D'IA", "assistants, agents", ""), ("ENTREPRISES", "18 % en France", "58 % des 250 salariés et +"),
                        ("rAIme", "choisit · forme · mesure", ""), ("FREINS", "compétences, données, coûts", "")],
                liens=["fabriquent", "animent", "équipent", "compare", "accompagne", "s'en servent pour", "visent", "butent sur"],
                usages=("USAGES", [("Analyser des textes", 56), ("Générer texte, voix", 43), ("Images, vidéo, son", 41),
                                   ("Transcrire la voix", 34)]),
                objectifs=("OBJECTIFS", [("Optimiser les coûts", 73), ("Qualité, fiabilité", 64), ("Travaux complexes", 56)]),
                legende="Pourcentages : part des entreprises qui utilisent l'IA (Insee, 2025)"),
    f_mono="Ce qui bloque", f_titre="Ce qui <em>les freine.</em>",
    f_texte="Beaucoup essaient l'IA, peu en tirent un vrai gain. Chaque obstacle a sa réponse.",
    # (etiquette, chiffre, la phrase qui continue le chiffre, un complement, la reponse de rAIme)
    freins=[("Utilité", "71 %", "des entreprises sans IA ne voient pas à quoi elle leur servirait.", "",
             "L'audit des postes montre où l'IA vous fait gagner des heures."),
            ("Compétences", "54 %", "des entreprises sans IA disent manquer d'expertise.",
             "Et 53 % de celles qui l'utilisent en sont freinées.", "La formation, sur vos propres cas."),
            ("Données", "43 %", "des entreprises qui utilisent l'IA craignent pour la protection de leurs données.", "",
             "Vos outils sur un serveur que vous contrôlez."),
            ("Coûts", "33 %", "des entreprises qui utilisent l'IA jugent les coûts trop élevés.", "",
             "Le bon modèle à chaque tâche, au juste prix."),
            ("Résultats", "60 %", "des entreprises dans le monde ne tirent presque aucune valeur de leurs investissements en IA.", "",
             "Chaque proposition lue et notée avant de signer."),
            ("Passage à l'échelle", "Près de 2/3", "des organisations n'ont pas encore étendu l'IA à toute l'entreprise.", "",
             "Un suivi chaque mois, de l'essai à l'usage.")],
    f_sources="Sources : Insee, enquête TIC 2025, entreprises de 10 salariés ou plus (71, 54, 43, 33 %) · "
              "BCG, The Widening AI Value Gap, septembre 2025 (60 %) · McKinsey, The State of AI, 2025 (2/3)"),
  "en": dict(
    intro_mono="AI, up close", intro_titre="What happens behind <em>an answer.</em>",
    intro="Choose AI, pay the right price, use it well. Every figure comes from rAIme's own measurements.",
    j_mono="Tokens", j_titre="Everything is counted <em>in tokens.</em>",
    j_texte="AI reads and writes in pieces of words: tokens. Each one is billed. Reading one million tokens costs $0.017 to $0.78 depending on the model: up to 46 times more, for the same job.",
    j_puces=["Summ", "arize", "this", "contract", "in", "three", "points", "."],
    j_legende="Example: 6 words, 8 tokens.",
    c_mono="The request", c_titre="A clear request costs <em>less.</em>",
    c_texte="A vague request makes AI fumble: more attempts, more tokens, an average result. At rAIme, a rewritten request and a corrected setting: from 0 to 3 successful messages out of 3, at one fifth of the cost.",
    avant="Before", avant_note="0 out of 3", avant_texte="“Ask no questions.” … then, further down: “End with a question.”",
    apres="After", apres_note="3 out of 3 · cost ÷ 5", apres_texte="“One clear request. Six to ten lines. No prices.”",
    grands=[("46 times", "more expensive, for the same job: €1 with one AI, €46 with another."),
            ("506", "AI models compared every night, on price and capability."),
            ("34 s", "is all our tools need to roll back on their own if an update fails.")],
    m_mono="The right model", m_titre="Every task <em>has its model.</em>",
    m_texte="Four tasks, four models. rAIme tests each model on its tasks before adopting it, and switches as soon as another does better for less. For you, the same method: the right AI for every role, at the right price.",
    routes=[("Extract", "A light model: $0.09 per million tokens read"),
            ("Reason", "A powerful model, for important decisions"),
            ("Write", "Fast and cheap: $0.03 per million tokens read"),
            ("Sort", "The smallest: 5 times cheaper, almost as accurate")],
    d_mono="Your data", d_titre="Your documents become <em>an assistant.</em>",
    d_texte="The assistant searches your documents and answers with its sources. Everything stays on a server you control; the AI can be replaced at any time, without rebuilding anything.",
    schema=("YOUR SERVER", "DOCUMENTS", "contracts, notes", "SEARCH", "in your texts", "ASSISTANT", "answers, cites"),
    schema_alt="Your documents, a search on your server, an assistant that answers and cites its sources",
    p_mono="The proof", p_titre="A company that runs <em>on AI.</em>",
    p_texte="rAIme first applies to itself what it recommends: agents that search, measure, write and correct themselves, day and night.",
    p_bouton="See the agents →", p_alt="The rAIme brain: monitoring, knowledge, AI agent, search, tests, approval, going live",
    onto=dict(barre=("AGENT MODE", "THE rAIme BRAIN"), panneau=("AI AGENT", "CHAT", "MODELS", "AUTO"), vous="You",
              noeuds=[("MONITORING", "200+/day"), ("KNOWLEDGE", "10,000+ passages"), ("AI agent", "the architect"),
                      ("SEARCH", "web, code"), ("TESTS", "127 checks"), ("APPROVAL", "your yes"),
                      ("IF", "all green?"), ("LIVE", "rollback in 34 s")]),
    o_mono="Tools", o_titre="The tools we <em>master.</em>",
    fin_titre="Let's talk about <em>your project.</em>", reserver="Book a one-hour call",
    a_mono="AI today", a_titre="AI is moving into <em>business.</em>",
    a_texte=["In 2026, 2.7 trillion dollars will go to AI worldwide, almost 50% more than in 2025. "
             "88% of the organisations surveyed by McKinsey use it in at least one department; "
             "only a third roll it out across the whole company.",
             "In France, 18% of companies with 10 or more employees use it, three times more than in 2023: "
             "to analyse text, write, create images. The goal: save time, make work more reliable."],
    a_sources="Sources: Gartner, September 2026 · McKinsey, The State of AI, 2025 · Insee Première no. 2120, July 2026",
    a_alt="The AI market: labs build the models, which power the tools, which equip companies; "
          "their uses, their goals and their barriers",
    marche=dict(noeuds=[("LABS", "OpenAI, Google, Mistral…", ""), ("MODELS", "506 tracked every night", ""),
                        ("AI TOOLS", "assistants, agents", ""), ("COMPANIES", "18% in France", "58% of firms with 250+ staff"),
                        ("rAIme", "chooses · trains · measures", ""), ("BARRIERS", "skills, data, costs", "")],
                liens=["build", "power", "equip", "compares", "supports", "use it to", "aim to", "run into"],
                usages=("USES", [("Analyse text", 56), ("Generate text, voice", 43), ("Images, video, sound", 41),
                                 ("Transcribe speech", 34)]),
                objectifs=("GOALS", [("Optimise costs", 73), ("Quality, reliability", 64), ("Complex work", 56)]),
                legende="Percentages: share of companies that use AI (Insee, 2025)"),
    f_mono="Obstacles", f_titre="What holds <em>them back.</em>",
    f_texte="Many try AI, few get a real gain. Each obstacle has an answer.",
    freins=[("Usefulness", "71%", "of companies without AI do not see what it would do for them.", "",
             "The job audit shows where AI saves you hours."),
            ("Skills", "54%", "of companies without AI say they lack the expertise.",
             "And 53% of those using it are held back by it.", "Training, built on your own cases."),
            ("Data", "43%", "of companies using AI worry about protecting their data.", "",
             "Your tools on a server you control."),
            ("Costs", "33%", "of companies using AI find the costs too high.", "",
             "The right model for each task, at the right price."),
            ("Results", "60%", "of companies worldwide get almost no value from their AI investments.", "",
             "Every proposal read and scored before you sign."),
            ("Scaling up", "Nearly 2/3", "of organisations have not yet rolled AI out across the whole company.", "",
             "A monthly follow-up, from trial to everyday use.")],
    f_sources="Sources: Insee, ICT survey 2025, companies with 10+ employees (71, 54, 43, 33%) · "
              "BCG, The Widening AI Value Gap, September 2025 (60%) · McKinsey, The State of AI, 2025 (2/3)"),
}

ICONES_ROUTES = [
    '<path d="M9 5h13l5 5v21H9z"/><path d="M22 5v5h5"/><path d="M13 16h10M13 20h10M13 24h6"/>',
    '<circle cx="9" cy="10" r="3"/><circle cx="27" cy="10" r="3"/><circle cx="18" cy="27" r="3"/><path d="M11.5 11.8l4.6 12.6M24.5 11.8l-4.6 12.6M12 10h12"/>',
    '<path d="M8 28l3-9L24 6l6 6-13 13z"/><path d="M21 9l6 6"/><path d="M8 31h20"/>',
    '<path d="M6 8h24l-9 11v9l-6-3v-6z"/>',
]


ICONES_ONTO = [
    '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="M12 12l6-6"/>',
    '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H20v14H5.5A1.5 1.5 0 0 0 4 19.5z"/><path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H20"/>',
    '<path d="M13 2L4 14h7l-1 8 9-12h-7z" fill="#fff" stroke="none"/>',
    '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
    '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M3.5 6l1.5 1.5L7.5 5M3.5 12l1.5 1.5 2.5-2.5M3.5 18l1.5 1.5 2.5-2.5"/>',
    '<circle cx="12" cy="12" r="8.5"/><path d="M8 12.5l2.7 2.7L16.5 9"/>',
    '<path d="M12 3v18"/><path d="M5 6h11l3 2.5L16 11H5z"/>',
    '<path d="M4 12l16-8-6 16-2.5-6.5z"/><path d="M11.5 13.5L20 4"/>',
]


def ontologie(T):
    """Le cerveau de rAIme dessine comme un editeur d'agents : une palette de modeles a gauche, les
    etapes reliees par des traits qui defilent, et un curseur qui se promene. Tout y est vrai :
    veille, savoir, agent, recherche, tests, accord de Basile, verification, mise en ligne."""
    O = T["onto"]
    n = O["noeuds"]

    def carre(cx, cy, i, titre, sous):
        return ('<g class="po-noeud"><rect x="%d" y="%d" width="46" height="46" rx="11"/>'
                '<g transform="translate(%d %d)">%s</g>'
                '<circle class="po-port" cx="%d" cy="%d" r="3.2"/><circle class="po-port" cx="%d" cy="%d" r="3.2"/>'
                '<text class="po-titre" x="%d" y="%d" text-anchor="middle">%s</text>'
                '<text class="po-sous" x="%d" y="%d" text-anchor="middle">%s</text></g>'
                % (cx - 23, cy - 23, cx - 12, cy - 12, ICONES_ONTO[i], cx - 23, cy, cx + 23, cy,
                   cx, cy + 40, titre, cx, cy + 53, sous))

    y1, y2 = 118, 268
    agent = ('<g class="po-noeud"><rect x="316" y="%d" width="132" height="46" rx="11"/>'
             '<g transform="translate(330 %d)">%s</g>'
             '<circle class="po-port" cx="316" cy="%d" r="3.2"/><circle class="po-port" cx="448" cy="%d" r="3.2"/>'
             '<text class="po-agent" x="362" y="%d">%s</text><text class="po-sous" x="362" y="%d">%s</text></g>'
             % (y1 - 23, y1 - 12, ICONES_ONTO[2], y1, y1, y1 - 2, n[2][0], y1 + 12, n[2][1]))
    logos = ["deepseek", "qwen", "openai", "claude", "openrouter"]
    palette = "".join('<rect class="po-case" x="%d" y="%d" width="34" height="34" rx="3"/>'
                      '<svg x="%d" y="%d" width="16" height="16" viewBox="0 0 24 24"><use href="#o-%s"/></svg>'
                      % (14 + 40 * (k % 3), 128 + 40 * (k // 3), 23 + 40 * (k % 3), 137 + 40 * (k // 3), f)
                      for k, f in enumerate(logos) if chemin_logo(f))
    palette += '<rect class="po-case" x="94" y="168" width="34" height="34" rx="3"/><path class="po-plus" d="M111 179v12M105 185h12"/>'
    return ('<svg class="pc-onto" viewBox="0 0 660 390" role="img" aria-label="%s">'
            '<defs><pattern id="po-hachures" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">'
            '<rect width="2.2" height="5" fill="#fff"/></pattern></defs>'
            # la palette a gauche
            '<rect class="po-bouton-plein" x="14" y="18" width="114" height="30" rx="2"/><text class="po-bouton-texte" x="71" y="37" text-anchor="middle">%s</text>'
            '<rect class="po-bouton" x="14" y="56" width="114" height="30" rx="2"/><text class="po-bouton-texte po-clair" x="71" y="75" text-anchor="middle">%s</text>'
            '<text class="po-sous" x="14" y="118">%s</text>%s'
            '<path class="po-trait" d="M6 228v96M6 336v14l14 14h52"/>'
            '<text class="po-sous" x="44" y="360">%s</text><rect x="86" y="352" width="46" height="10" fill="url(#po-hachures)"/>'
            # la barre d'outils
            '<rect class="po-bouton" x="152" y="18" width="116" height="30" rx="2"/><text class="po-bouton-texte po-clair" x="210" y="37" text-anchor="middle">%s ✦</text>'
            '<rect class="po-bouton" x="268" y="18" width="178" height="30" rx="2"/><text class="po-bouton-texte po-clair" x="357" y="37" text-anchor="middle">%s</text>'
            # les liaisons
            '<path class="pc-flux" d="M198 %d H236"/><path class="pc-flux" d="M282 %d H316"/>'
            '<path class="pc-flux" d="M448 %d H490"/><path class="pc-flux" d="M536 %d H574"/>'
            '<path class="pc-flux" d="M597 %d v34 q0 10 -10 10 H363 q-10 0 -10 10 v%d"/>'
            '<rect class="pc-cadre" x="300" y="%d" width="346" height="150" rx="16"/>'
            '<path class="pc-flux" d="M376 %d H440"/><path class="pc-flux" d="M486 %d H550"/><path class="pc-flux" d="M596 %d H614"/>'
            '<rect class="po-case" x="614" y="%d" width="14" height="14" rx="2"/><path class="po-plus" d="M621 %dv8M617 %dh8"/>'
            # les etapes
            '%s%s%s%s%s%s%s%s'
            '</svg>'
            % (T["p_alt"], O["panneau"][0], O["panneau"][1], O["panneau"][2], palette, O["panneau"][3],
               O["barre"][0], O["barre"][1],
               y1, y1, y1, y1, y1 + 23, y2 - 23 - (y1 + 23) - 44,
               y2 - 60, y2, y2, y2, y2 - 7, y2 - 4, y2,
               carre(175, y1, 0, *n[0]), carre(259, y1, 1, *n[1]), agent, carre(513, y1, 3, *n[3]), carre(597, y1, 4, *n[4]),
               carre(353, y2, 5, *n[5]), carre(463, y2, 6, *n[6]), carre(573, y2, 7, *n[7])))


def marche_svg(T):
    """Le marche de l'IA en ontologie : des entites reliees par des relations nommees. A gauche la
    chaine laboratoires -> modeles -> outils -> entreprises ; rAIme compare les modeles et accompagne
    les entreprises ; a droite ce que font les entreprises (usages, objectifs), en bas leurs freins.
    Les pourcentages viennent de l'Insee (enquete TIC 2025)."""
    M = T["marche"]
    nd, li = M["noeuds"], M["liens"]

    def noeud(x, y, w, h, n, classe="pm-noeud"):
        titre, sous, sous2 = n
        ty = y + (h / 2) - (8 if sous2 else 4)
        s = ('<rect class="%s" x="%d" y="%d" width="%d" height="%d" rx="10"/>'
             '<text class="pm-titre" x="%d" y="%d" text-anchor="middle">%s</text>'
             '<text class="pm-sous" x="%d" y="%d" text-anchor="middle">%s</text>'
             % (classe, x, y, w, h, x + w / 2, ty, titre, x + w / 2, ty + 15, sous))
        if sous2:
            s += '<text class="pm-sous" x="%d" y="%d" text-anchor="middle">%s</text>' % (x + w / 2, ty + 28, sous2)
        return s

    def panneau(y, titre, lignes, decalage):
        s = ('<rect class="pm-panneau" x="470" y="%d" width="180" height="%d" rx="10"/>'
             '<text class="pm-titre" x="482" y="%d">%s</text>' % (y, 34 + 34 * len(lignes), y + 22, titre))
        for k, (nom, pc) in enumerate(lignes):
            ly = y + 48 + 34 * k
            s += ('<text class="pm-ligne" x="482" y="%d">%s</text><text class="pm-ligne" x="638" y="%d" text-anchor="end">%d %%</text>'
                  '<rect class="pm-fond" x="482" y="%d" width="156" height="3"/>'
                  '<rect class="pm-barre" x="482" y="%d" width="%d" height="3" style="transition-delay:%dms"/>'
                  % (ly, nom, ly, pc, ly + 8, ly + 8, round(156 * pc / 100), (decalage + k) * 140))
        return s

    def rel(x, y, texte, ancre="middle"):
        return '<text class="pm-rel" x="%d" y="%d" text-anchor="%s">%s</text>' % (x, y, ancre, texte)

    fleche = ' marker-end="url(#pm-fleche)"'
    return ('<svg class="pm" viewBox="0 0 660 450" role="img" aria-label="%s">'
            '<defs><marker id="pm-fleche" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">'
            '<path d="M0 0L8 4L0 8z" fill="#fff"/></marker></defs>'
            # les relations
            '<path class="pc-flux" d="M100 74V127"%s/><path class="pc-flux" d="M100 184V237"%s/>'
            '<path class="pc-flux" d="M180 267H247"%s/>'
            '<path class="pc-flux" d="M260 127C222 127 218 157 183 157"%s/><path class="pc-flux" d="M340 154V229"%s/>'
            '<path class="pc-flux" d="M430 255C452 255 448 115 467 115"%s/><path class="pc-flux" d="M430 287C452 287 448 342 467 342"%s/>'
            '<path class="pc-flux" d="M340 302V367"%s/>'
            # les entites
            '%s%s%s%s%s%s%s%s'
            # le nom des relations, par-dessus les traits
            '%s%s%s%s%s%s%s%s'
            '</svg>'
            % ((T["a_alt"],) + (fleche,) * 8
               + (noeud(20, 20, 160, 54, nd[0]), noeud(20, 130, 160, 54, nd[1]), noeud(20, 240, 160, 54, nd[2]),
                  noeud(250, 232, 180, 70, nd[3], "pm-noeud pm-centre"), noeud(260, 100, 160, 54, nd[4], "pm-noeud pm-raime"),
                  noeud(260, 370, 160, 54, nd[5]),
                  panneau(20, M["usages"][0], M["usages"][1], 0), panneau(284, M["objectifs"][0], M["objectifs"][1], 4))
               + (rel(108, 105, li[0], "start"), rel(108, 215, li[1], "start"), rel(214, 259, li[2]),
                  rel(222, 118, li[3]), rel(332, 196, li[4], "end"), rel(446, 212, li[5], "end"),
                  rel(452, 330, li[6]), rel(348, 340, li[7], "start"))))


# Le Score rAIme v2.0 explique au client (fenetre « Comment ça marche » des tarifs). Source : la
# specification publiee (OneDrive/10_Score_rAIme) et le code v2 (cerveau/agents/score.js). Aucun
# chiffre ajoute : 22 points de controle, trois axes, le plus faible x 10, plafond a 40, mentions.
SCORE_TEXTES = {
  "fr": dict(
    mono="Comment ça marche", titre="Le Score rAIme, <em>sur 1000.</em>",
    intro="Une question, une note : une proposition d'IA est-elle prête à être signée ? La méthode est publique : "
          "chacun peut refaire le calcul à la main, y compris le prestataire noté.",
    axes=[("A", "Sincérité", "Ce que la proposition écrit, et ce qu'elle tait : 22 points de contrôle sur le besoin, "
                             "les coûts, le contrat, la propriété des données et les conditions de sortie."),
          ("B", "Rentabilité", "Ce que les chiffres donnent : le temps gagné, le coût complet, et le nombre de mois "
                               "pour rembourser l'investissement."),
          ("C", "Réalisme", "La démarche proposée (pilote, étapes, arrêt possible à coût connu) et la maturité "
                            "de votre entreprise : données accessibles, tâches décrites, un porteur du projet, du temps pour l'adoption.")],
    regle_mono="La règle", formule="Score = min(A, B, C) × 10",
    regle="La note finale est celle de l'axe le plus faible, jamais la moyenne. Un contrat parfait ne rattrape pas "
          "un investissement qui ne rapporte pas.",
    echelle_mono="Lire la note",
    echelle=[("800 – 1000", "Signable"), ("600 – 790", "Signable sous conditions"), ("400 – 590", "À renégocier"),
             ("200 – 390", "À refaire"), ("0 – 190", "À refuser")],
    garanties_mono="Trois garanties",
    garanties=["Une clause essentielle absente (propriété des données, propriété de ce qui est construit, conditions "
               "de sortie) plafonne la Sincérité à 40 sur 100.",
               "Un chiffre manque ? La note n'est pas rendue : nous indiquons quelles données obtenir.",
               "Chaque note est rendue avec le détail des points perdus et la version de la méthode (v2.0)."],
    usages=[("Dans l'arbitrage", "Chaque offre reçue est notée sur 1000, avec ce qu'il faut obtenir avant de signer.")]),
  "en": dict(
    mono="How it works", titre="The rAIme Score, <em>out of 1000.</em>",
    intro="One question, one score: is an AI proposal ready to be signed? The method is public: anyone can redo "
          "the calculation by hand, including the provider being scored.",
    axes=[("A", "Transparency", "What the proposal states, and what it leaves out: 22 checkpoints on the need, costs, "
                                "contract, data ownership and exit terms."),
          ("B", "Return", "What the figures say: time saved, full cost, and how many months it takes to pay back "
                          "the investment."),
          ("C", "Realism", "The proposed approach (pilot, stages, the option to stop at a known cost) and your "
                           "company's readiness: accessible data, documented tasks, a project owner, time for adoption.")],
    regle_mono="The rule", formule="Score = min(A, B, C) × 10",
    regle="The final score is the weakest axis, never the average. A perfect contract does not make up for an "
          "investment that does not pay off.",
    echelle_mono="Reading the score",
    echelle=[("800 – 1000", "Ready to sign"), ("600 – 790", "Sign with conditions"), ("400 – 590", "Renegotiate"),
             ("200 – 390", "Ask for a new proposal"), ("0 – 190", "Decline")],
    garanties_mono="Three guarantees",
    garanties=["A missing key clause (data ownership, ownership of what is built, exit terms) caps Transparency "
               "at 40 out of 100.",
               "A figure is missing? No score is given: we tell you which data to obtain.",
               "Every score comes with the detail of lost points and the method version (v2.0)."],
    usages=[("In the review", "Every offer you receive is scored out of 1000, with what to obtain before signing.")]),
}


def score_html(langue="fr"):
    """La fenetre « Comment ça marche » : les trois axes, la regle, l'echelle, les garanties."""
    S = SCORE_TEXTES[langue]
    return ('<p class="pc-mono">%s</p><h2 id="pc-score-titre">%s</h2><p class="pc-score-intro">%s</p>'
            '<div class="pc-score-axes">%s</div>'
            '<div class="pc-score-regle"><p class="pc-mono">%s</p><p class="pc-score-formule">%s</p><p>%s</p></div>'
            '<div class="pc-score-deux"><div><p class="pc-mono">%s</p><dl class="pc-score-echelle">%s</dl></div>'
            '<div><p class="pc-mono">%s</p><ul class="pc-score-garanties">%s</ul></div></div>'
            '<div class="pc-score-usages">%s</div>'
            % (S["mono"], S["titre"], S["intro"],
               "".join('<div><b>%s</b><h3>%s</h3><p>%s</p></div>' % a for a in S["axes"]),
               S["regle_mono"], S["formule"], S["regle"],
               S["echelle_mono"], "".join('<div><dt>%s</dt><dd>%s</dd></div>' % e for e in S["echelle"]),
               S["garanties_mono"], "".join("<li>%s</li>" % g for g in S["garanties"]),
               "".join('<p><b>%s</b>%s</p>' % u for u in S["usages"])))


# L'audit des postes explique au client. Source : la fiche d'audit (notes/06 : cartographie des taches,
# impact = temps x frequence x penibilite, faisabilite, classement impact / effort, plan en trois temps) et le
# moteur de retour sur investissement v1.1 (origine de chaque chiffre, indice de confiance, recommandation qui
# sait dire non). Aucun perimetre en jours ou en entretiens : ils ne sont pas encore valides par Basile.
AUDIT_TEXTES = {
  "fr": dict(
    mono="Comment ça marche", titre="L'audit de vos postes, en <em>quatre temps.</em>",
    intro="Une question : où l'IA vous fait-elle gagner du temps, et combien ? Chaque gain est chiffré, "
          "et chaque chiffre dit d'où il vient.",
    etapes=[("1", "Cartographier", "Pour chaque tâche répétitive : sa fréquence, son temps, qui la fait, avec quels "
                                   "outils, et à quel point elle pèse sur l'équipe, de 1 à 5."),
            ("2", "Mesurer l'impact", "Le temps passé, multiplié par la fréquence et par la pénibilité."),
            ("3", "Juger la faisabilité", "Des données propres et accessibles, des outils qui se connectent, "
                                          "un risque maîtrisé."),
            ("4", "Classer et chiffrer", "Les gains en heures et en euros par an, et le nombre de mois pour "
                                         "rembourser l'investissement.")],
    regle_mono="La règle", formule="Priorité = impact ÷ effort",
    regle="Les tâches sont classées de la plus rentable à la moins rentable. Les trois premières forment "
          "votre plan d'action.",
    resultat_mono="Ce que vous recevez",
    resultat=["Les gains classés, tâche par tâche.",
              "Un plan d'action sur 90 jours, en trois temps : les gains rapides, les chantiers de fond, "
              "puis l'optimisation."],
    garanties_mono="Trois garanties",
    garanties=["Chaque chiffre porte son origine : mesuré chez vous, déclaré par vous, ou estimé. Une estimation "
               "est toujours signalée.",
               "Chaque gain a un indice de confiance, haut, moyen ou faible, selon la qualité des données.",
               "L'audit sait dire non : une tâche qui ne se rembourse pas est déconseillée."],
    # la carte animée (02/10/2026) : les mêmes informations, un mot et une ligne par nœud
    courts=["Vos tâches répétitives, une par une", "Temps × fréquence × pénibilité", "Données, outils, risque",
            "En heures et en euros par an"],
    taches="8 tâches, avant et après le classement", top="Les 3 premières : votre plan",
    plan_mono="Votre plan d'action", plan=["Gains rapides", "Chantiers de fond", "Optimisation"], jours="jours",
    garanties_courtes=["Chaque chiffre dit d'où il vient", "Un indice de confiance par gain", "L'audit sait dire non"],
    doutes_mono="Pourquoi on hésite", doutes=["« Ces chiffres sont gonflés. »", "« Ça ne marchera pas chez nous. »",
                                              "« On va me vendre quelque chose. »"],
    recu_mono="Ce que vous recevez", recu=["Les gains classés, tâche par tâche", "Gains rapides, chantiers de fond, optimisation"]),
  "en": dict(
    mono="How it works", titre="Your job audit, in <em>four steps.</em>",
    intro="One question: where does AI save you time, and how much? Every gain is quantified, and every figure "
          "says where it comes from.",
    etapes=[("1", "Map", "For each repetitive task: how often, how long, who does it, with which tools, and how "
                         "much it weighs on the team, from 1 to 5."),
            ("2", "Measure the impact", "Time spent, multiplied by frequency and by burden."),
            ("3", "Check feasibility", "Clean, accessible data, tools that connect, a controlled risk."),
            ("4", "Rank and quantify", "Gains in hours and euros per year, and how many months it takes to pay "
                                       "back the investment.")],
    regle_mono="The rule", formule="Priority = impact ÷ effort",
    regle="Tasks are ranked from the most to the least profitable. The top three make up your action plan.",
    resultat_mono="What you receive",
    resultat=["The gains, ranked task by task.",
              "A 90-day action plan in three stages: quick wins, deeper projects, then optimisation."],
    garanties_mono="Three guarantees",
    garanties=["Every figure shows its origin: measured on site, stated by you, or estimated. An estimate is always "
               "flagged.",
               "Every gain has a confidence level, high, medium or low, depending on data quality.",
               "The audit can say no: a task that does not pay back is advised against."],
    courts=["Your repetitive tasks, one by one", "Time × frequency × burden", "Data, tools, risk",
            "In hours and euros per year"],
    taches="8 tasks, before and after ranking", top="The top 3: your plan",
    plan_mono="Your action plan", plan=["Quick wins", "Deeper projects", "Optimisation"], jours="days",
    garanties_courtes=["Every figure shows its origin", "A confidence level for every gain", "The audit can say no"],
    doutes_mono="Why people hesitate", doutes=["“These figures are inflated.”", "“It won't work for us.”",
                                               "“They'll try to sell me something.”"],
    recu_mono="What you receive", recu=["The gains, ranked task by task", "Quick wins, deeper projects, optimisation"]),
}


def audit_html(langue="fr"):
    """La fenêtre « Comment ça marche » de l'audit, en carte animée (02/10/2026, demande de Basile : moins de texte,
    de l'ontologie, du mouvement sur les données) : les quatre temps reliés par un fil de lumière ; la règle montrée
    par huit tâches qui se classent sous les yeux (les barres n'ont pas de chiffre : elles illustrent le classement) ;
    le plan sur 90 jours qui se remplit ; les garanties en trois mots, le détail au survol. Animation pure CSS,
    rejouée à chaque ouverture (le contenu est réinséré)."""
    A = AUDIT_TEXTES[langue]
    etapes = "".join('<li style="--k:%d"><span class="pa-n">%s</span><b>%s</b><small>%s</small></li>' % (k, e[0], e[1], c)
                     for k, (e, c) in enumerate(zip(A["etapes"], A["courts"])))
    # chaque doute s'affiche, puis se réécrit en notre réponse (la garantie) : data-de -> data-vers
    doutes = "".join('<li title="%s"><span class="pa-texte" data-de="%s" data-vers="%s" data-k="%d">%s</span></li>'
                     % (g.replace('"', "&quot;"), d.replace('"', "&quot;"), c.replace('"', "&quot;"), k, d)
                     for k, (d, c, g) in enumerate(zip(A["doutes"], A["garanties_courtes"], A["garanties"])))
    return ('<div class="pa"><p class="pc-mono">%s</p><h2 id="pc-score-titre">%s</h2>'
            '<ol class="pa-etapes">%s</ol>'
            '<div class="pa-deux"><div><p class="pc-mono">%s</p><ul class="pa-doutes">%s</ul></div>'
            '<div><p class="pc-mono">%s</p><p class="pa-jours"><b data-compte="90">0</b> %s</p>'
            '<p class="pa-recu" data-ecrit>%s</p><p class="pa-recu pa-recu--2" data-ecrit>%s</p></div></div></div>'
            % (A["mono"], A["titre"], etapes, A["doutes_mono"], doutes,
               A["recu_mono"], A["jours"], A["recu"][0], A["recu"][1]))


def marche_mobile(T):
    """Sur telephone, le schema serait illisible : la meme ontologie, posee a la verticale."""
    M = T["marche"]
    nd, li = M["noeuds"], M["liens"]

    def n(k, classe=""):
        titre, sous, sous2 = nd[k]
        return '<div class="pm-m-noeud%s"><b>%s</b><span>%s%s</span></div>' % (
            classe, titre, sous, (" · " + sous2) if sous2 else "")

    def r(texte):
        return '<p class="pm-m-rel">↓ %s</p>' % texte

    def panneau(titre, lignes):
        return ('<div class="pm-m-panneau"><b>%s</b>%s</div>'
                % (titre, "".join('<p><span>%s</span><i>%d %%</i><s><u style="width:%d%%"></u></s></p>' % (a, pc, pc)
                                  for a, pc in lignes)))

    return ('<div class="pm-m" aria-hidden="true">' + n(0) + r(li[0]) + n(1) + r(li[1]) + n(2) + r(li[2])
            + n(3, " pm-m-centre") + '<p class="pm-m-rel">%s ↓</p>' % li[5] + panneau(*M["usages"])
            + '<p class="pm-m-rel">%s ↓</p>' % li[6] + panneau(*M["objectifs"])
            + '<p class="pm-m-rel">%s ↓</p>' % li[7] + n(5)
            + '<p class="pm-m-rel">+</p>' + n(4, " pm-m-raime") + '</div>')


def dessous(langue="fr"):
    """Sous l'accueil : l'IA de plus pres. Chaque chiffre vient d'une mesure de rAIme
    (catalogue releve chaque nuit, batterie du metrologue, journal de la porte) ; aucun n'est invente."""
    T = TEXTES_DESSOUS[langue]

    def numero(n, mono):
        """Le numero de la partie en grand (en relief), puis son etiquette."""
        return ('<p class="pc-num" aria-hidden="true">%s</p><p class="pc-mono">%s</p>' % (n, mono)) if n \
            else '<p class="pc-mono">%s</p>' % mono

    def bloc(n, mono, titre, texte, visuel, inverse=False, classe_visuel=""):
        large = " pc-bloc--large" if "onto" in classe_visuel else ""
        return ('<section class="pc-bloc pc-apparait%s%s"><div class="pc-texte">%s'
                '<h2>%s</h2>%s</div><div class="pc-visuel%s">%s</div></section>'
                % (" pc-bloc--inverse" if inverse else "", large, numero(n, mono), titre, texte,
                   classe_visuel, visuel))

    v_jetons = ('<div class="pc-jetons">%s</div><p class="pc-legende">%s</p>'
                % ("".join('<span style="--i:%d">%s</span>' % (i, j) for i, j in enumerate(T["j_puces"])), T["j_legende"]))
    v_prompts = ('<div class="pc-prompts">'
                 '<div class="pc-prompt"><b>%s <i>%s</i></b><p>%s</p></div>'
                 '<div class="pc-prompt pc-prompt--apres"><b>%s <i>%s</i></b><p>%s</p></div></div>'
                 % (T["avant"], T["avant_note"], T["avant_texte"], T["apres"], T["apres_note"], T["apres_texte"]))
    v_routes = '<div class="pc-routes">%s</div>' % "".join(
        '<div class="pc-route"><svg viewBox="0 0 36 36" aria-hidden="true">%s</svg><b>%s</b><span>%s</span></div>'
        % (ICONES_ROUTES[i], r[0], r[1]) for i, r in enumerate(T["routes"]))
    s = T["schema"]
    v_schema = ('<svg class="pc-schema" viewBox="0 0 480 210" role="img" aria-label="%s">'
                '<rect class="pc-cadre" x="2" y="30" width="476" height="150" rx="10"/>'
                '<text class="pc-petit" x="16" y="22">%s</text>'
                '<rect x="18" y="74" width="122" height="52" rx="6"/><text x="79" y="104" text-anchor="middle">%s</text>'
                '<rect x="179" y="74" width="122" height="52" rx="6"/><text x="240" y="104" text-anchor="middle">%s</text>'
                '<rect x="340" y="74" width="122" height="52" rx="6"/><text x="401" y="104" text-anchor="middle">%s</text>'
                '<path class="pc-flux" d="M140 100H179"/><path class="pc-flux" d="M301 100H340"/>'
                '<path class="pc-flux" d="M401 126v36H79v-36"/>'
                '<text class="pc-petit" x="79" y="148" text-anchor="middle">%s</text>'
                '<text class="pc-petit" x="240" y="148" text-anchor="middle">%s</text>'
                '<text class="pc-petit" x="401" y="148" text-anchor="middle">%s</text></svg>'
                % (T["schema_alt"], s[0], s[1], s[3], s[5], s[2], s[4], s[6]))
    v_onto = ontologie(T)
    logos = "".join(
        ('<div><svg style="--i:%d" aria-hidden="true"><use href="#o-%s"/></svg>%s</div>' % (i, f, n)) if chemin_logo(f)
        else ('<div><i class="pc-point" style="--i:%d"></i>%s</div>' % (i, n))
        for i, (n, f) in enumerate(OUTILS))
    grands = "".join('<div><b>%s</b><span>%s</span></div>' % g for g in T["grands"])
    v_marche = ('<figure class="pc-marche">%s%s<figcaption>%s</figcaption></figure>'
                % (marche_svg(T), marche_mobile(T), T["marche"]["legende"]))
    freins = "".join('<div class="pc-frein"><span class="pc-frein-etiq">%s</span><b>%s</b><h3>%s</h3>%s'
                     '<p class="pc-frein-rep">→ %s</p></div>'
                     % (e, c, ph, ('<p>%s</p>' % co) if co else "", rep) for e, c, ph, co, rep in T["freins"])
    return ('<div class="pc-dessous" id="pc-dessous">'
            + bloc("", T["a_mono"], T["a_titre"],
                   "".join("<p>%s</p>" % x for x in T["a_texte"]) + '<p class="pc-sources">%s</p>' % T["a_sources"],
                   v_marche, classe_visuel=" pc-visuel--onto pc-visuel--marche")
            + '<section class="pc-bloc-freins pc-apparait">%s<h2>%s</h2><p class="pc-freins-intro">%s</p>'
              '<div class="pc-freins">%s</div><p class="pc-sources">%s</p></section>'
              % (numero("01", T["f_mono"]), T["f_titre"], T["f_texte"], freins, T["f_sources"])
            + '<div class="pc-intro pc-apparait"><p class="pc-mono">%s</p><h2>%s</h2><p>%s</p></div>'
            % (T["intro_mono"], T["intro_titre"], T["intro"])
            + bloc("02", T["j_mono"], T["j_titre"], "<p>%s</p>" % T["j_texte"], v_jetons)
            + bloc("03", T["c_mono"], T["c_titre"], "<p>%s</p>" % T["c_texte"], v_prompts, inverse=True)
            + '<div class="pc-grands pc-apparait">%s</div>' % grands
            + bloc("04", T["m_mono"], T["m_titre"], "<p>%s</p>" % T["m_texte"], v_routes)
            + bloc("05", T["d_mono"], T["d_titre"], "<p>%s</p>" % T["d_texte"], v_schema, inverse=True)
            + bloc("06", T["p_mono"], T["p_titre"],
                   '<p>%s</p><button class="pc-preuve" data-vers="projets/raime">%s</button>' % (T["p_texte"], T["p_bouton"]),
                   v_onto, classe_visuel=" pc-visuel--onto")
            + '<div class="pc-bloc-logos pc-apparait">%s<h2>%s</h2><div class="pc-logos">%s</div></div>'
              % (numero("07", T["o_mono"]), T["o_titre"], logos)
            + '</div>')


def fond_vivant():
    """Demande de Basile (25/09/2026) : les particules du heros derriere toutes les pages, encore plus
    legeres, avec du mouvement. Sans demarcation : la nappe deborde l'ecran sur les cotes et apparait en
    fondu depuis le haut (aucune premiere rangee nette). Une nappe de points en perspective, fixe derriere la page : elle ondule
    seule, glisse doucement au defilement et se souleve en rose sous le curseur. Sur l'accueil, elle
    s'efface tant que le heros (qui a son propre champ) est a l'ecran. Pause quand l'onglet est cache,
    une seule image si le visiteur demande moins d'animations."""
    return ('<script id="raime-fond-vivant">(function(){'
            'var c=document.createElement("canvas");c.className="pc-points";c.setAttribute("aria-hidden","true");'
            'document.body.appendChild(c);var x=c.getContext("2d"),D=Math.min(window.devicePixelRatio||1,2),W=0,H=0,'
            't0=performance.now(),mm=window.matchMedia,calme=mm&&mm("(prefers-reduced-motion: reduce)").matches,'
            'P={x:-9999,y:-9999,f:0},roule=false,n=0;'
            'function taille(){W=innerWidth;H=innerHeight;c.width=Math.round(W*D);c.height=Math.round(H*D);'
            'c.style.width=W+"px";c.style.height=H+"px";}'
            'function relais(){var h=document.querySelector(".pc-champ");if(!h)return null;var r=h.getBoundingClientRect();'
            'if(r.bottom<=0||!r.height)return null;return{a:r.top+r.height*.5,b:r.bottom};}'
            'function image(now){var t=calme?0:(now-t0)/1000,z=relais();x.setTransform(D,0,0,D,0,0);x.clearRect(0,0,W,H);'
            'var COLS=W<700?44:78,RANGS=W<700?16:22,d=scrollY*.0012,J=document.documentElement.hasAttribute("data-jour");P.f*=.975;'
            'for(var j=0;j<RANGS;j++){var v=j/(RANGS-1),yb=H*(-.04+1.1*Math.pow(v,1.35)),e=1.12+.9*v,'
            'g=Math.min(1,v/.45),fondu=g*g*(3-2*g);'
            'for(var i=0;i<COLS;i++){var u=i/(COLS-1)-.5,sx=W*.5+u*W*e;if(sx<-10||sx>W+10)continue;'
            'var o=Math.sin(u*8+t*.45+v*4+d*6)*Math.cos(v*6-t*.32-d*4),dx=sx-P.x,dy=yb-P.y,'
            'pr=P.f*Math.exp(-(dx*dx+dy*dy)/22000),y=yb-(o*9+pr*30)*(.35+.65*v),'
            'k=z?Math.max(0,Math.min(1,(y-z.a)/(z.b-z.a))):1,a=((.035+.13*v)*(.7+.3*o)*fondu+pr*.55)*k*k*(3-2*k);'
            'x.fillStyle=J?"rgba("+Math.round(219*pr)+","+Math.round(79*pr)+","+Math.round(139*pr)+","+Math.min(.5,a).toFixed(3)+")"'
            ':"rgba(255,"+Math.round(255-129*pr)+","+Math.round(255-79*pr)+","+Math.min(.5,a).toFixed(3)+")";'
            'var s=.8+.9*v+pr*1.4;x.fillRect(sx,y,s,s);}}}'
            'function tour(now){if(document.hidden){roule=false;return;}if((n++&1)===0||P.f>.05)image(now);'
            'if(calme){roule=false;return;}requestAnimationFrame(tour);}'
            'function lancer(){if(!roule&&!document.hidden){roule=true;requestAnimationFrame(tour);}}'
            'addEventListener("pointermove",function(e){P.x=e.clientX;P.y=e.clientY;P.f=1;lancer();},{passive:true});'
            'addEventListener("resize",function(){taille();image(performance.now());});'
            'addEventListener("scroll",lancer,{passive:true});document.addEventListener("visibilitychange",lancer);'
            'taille();image(performance.now());lancer();'
            '})();</script>')


def mouvement():
    """Demande de Basile (25/09/2026) : du mouvement. Une matiere floue (quatre nappes de lumiere, dont une
    rose) qui glisse en parallaxe avec la souris et le defilement, derriere des panneaux translucides ; et un
    curseur rose : un point, un cercle qui le suit avec un leger retard, un halo. Rien sur ecran tactile,
    rien si le visiteur demande moins d'animations, pause quand l'onglet est cache."""
    # 25/09/2026 : la matiere floue est retiree (fond noir pur) ; le curseur rose reste.
    return ('<script id="raime-mouvement">(function(){'
            'var mm=window.matchMedia,calme=mm&&mm("(prefers-reduced-motion: reduce)").matches,fin=mm&&mm("(pointer: fine)").matches;'
            'var nappes=[].slice.call(document.querySelectorAll(".pc-matiere i")),P=[34,-46,58,-28];'
            'var mx=innerWidth/2,my=innerHeight/2,nx=0,ny=0,cx=mx,cy=my,roule=false,point=null,anneau=null;'
            'if(fin&&!calme){point=document.createElement("div");point.className="pc-curseur-point";'
            'anneau=document.createElement("div");anneau.className="pc-curseur";'
            'document.body.appendChild(anneau);document.body.appendChild(point);'
            'document.documentElement.classList.add("pc-curseur-actif");}'
            'function place(el,x,y){el.style.transform="translate3d("+x.toFixed(1)+"px,"+y.toFixed(1)+"px,0)";}'
            'function tour(){roule=false;var fx=mx/innerWidth-.5,fy=my/innerHeight-.5,bouge=false,sy=scrollY;'
            'nx+=(fx-nx)*.06;ny+=(fy-ny)*.06;if(Math.abs(fx-nx)>.001||Math.abs(fy-ny)>.001)bouge=true;'
            'for(var i=0;i<nappes.length;i++)place(nappes[i],nx*P[i]*2,ny*P[i]*2-sy*(.04+i*.015));'
            'if(anneau){cx+=(mx-cx)*.18;cy+=(my-cy)*.18;if(Math.abs(mx-cx)>.3||Math.abs(my-cy)>.3)bouge=true;place(anneau,cx,cy);}'
            'if(bouge)demander();}'
            'function demander(){if(!roule&&!document.hidden&&!calme){roule=true;requestAnimationFrame(tour);}}'
            'addEventListener("pointermove",function(e){mx=e.clientX;my=e.clientY;'
            'if(point&&e.pointerType!=="touch"){place(point,mx,my);point.style.opacity=anneau.style.opacity="1";'
            'var s=e.target.closest&&e.target.closest("a,button,[data-vers],[data-score],[data-menu],[role=tab]");'
            'anneau.classList.toggle("pc-sur",!!s);}demander();},{passive:true});'
            'addEventListener("pointerout",function(e){if(!e.relatedTarget&&point){point.style.opacity=anneau.style.opacity="0";}});'
            'addEventListener("scroll",demander,{passive:true});'
            'document.addEventListener("visibilitychange",demander);'
            'demander();'
            '})();</script>')


def sprite_logos():
    """Les dessins des logos (outils et Google), declares une fois et reutilises partout sur la page."""
    symboles = []
    for f in [f for _, f in OUTILS] + ["google"]:
        d = chemin_logo(f)
        if d:
            symboles.append('<symbol id="o-%s" viewBox="0 0 24 24"><path d="%s"/></symbol>' % (f, d))
    return '<svg width="0" height="0" style="position:absolute" aria-hidden="true">%s</svg>' % "".join(symboles)


def noeuds_utiles(noeuds):
    """Sur le site noir, les pages Particulier et Professionnel renvoient aux onglets des tarifs : leurs
    textes ne peuvent plus s'afficher, on ne les embarque plus (allegement du 25/09/2026)."""
    if not NOIR_ESSAI:
        return noeuds
    return {k: v for k, v in noeuds.items() if not (k == "particulier" or k == "pro" or k.startswith("pro/"))}


def ui_utile(ui):
    """Sur le site noir, plus de livre : ses libelles ne partent plus avec la page."""
    if not NOIR_ESSAI:
        return ui
    return {k: v for k, v in ui.items() if k not in ("livre", "livre_court")}


def particules():
    # Depuis la mise en ligne du noir (25/09/2026), dist/index.html n'a plus le moteur de particules :
    # il est garde dans particules_moteur.html, a cote de ce script (versions bleue et rose).
    garde = ICI / "particules_moteur.html"
    if garde.exists():
        return io.open(garde, encoding="utf-8").read()
    t = io.open(DIST / "index.html", encoding="utf-8").read()
    d = t.index('<script id="raime-particules-js">')
    f = t.index("</script>", d) + len("</script>")
    return t[d:f]


def main():
    CIBLE.mkdir(exist_ok=True)
    for dossier, depuis in (("fonts", DIST / "fonts"), ("projets", SOURCE / "projets")):
        if (CIBLE / dossier).exists():
            shutil.rmtree(CIBLE / dossier)
        shutil.copytree(depuis, CIBLE / dossier)
    for nom in ("logo-mark.png", "logo-mark-blanc.png", "favicon.png"):
        shutil.copy2(DIST / nom, CIBLE / nom)
    if NOIR_ESSAI:
        shutil.copy2(ICI / "partage" / "partage.png", CIBLE / "partage.png")
    if PROD:
        if (CIBLE / "_headers").exists():
            (CIBLE / "_headers").unlink()
    else:
        io.open(CIBLE / "_headers", "w", encoding="utf-8", newline="\n").write("/*\n  X-Robots-Tag: noindex\n")

    fond = (fond_vivant() + mouvement()) if NOIR_ESSAI else particules()
    page = """<!doctype html>
<html lang="fr" data-theme="bleu"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
%(robots)s
<title>rAIme — conseil en intelligence artificielle</title>
<meta name="description" content="%(description)s">
<link rel="canonical" href="https://raime.fr/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="rAIme">
<meta property="og:locale" content="fr_FR">
<meta property="og:url" content="https://raime.fr/">
<meta property="og:title" content="rAIme — conseil en intelligence artificielle">
<meta property="og:description" content="%(description)s">
%(partage)s
<link rel="icon" href="/favicon.png">
<style id="raime-parcours">%(style)s</style>
</head>
<body>
<div class="pc-charge" id="pc-charge"><img src="/logo-mark-blanc.png" alt=""><div class="pc-piste"><i></i></div><p>rAIme</p></div>
<header class="pc-tete">
  <a class="pc-logo" href="#" data-vers="accueil" aria-label="rAIme, accueil"><img src="/logo-mark-blanc.png" alt="rAIme">%(nom)s</a>
  <button class="pc-retour" id="pc-retour" data-vers="accueil" aria-label="Revenir">‹</button>
  <nav class="pc-fil" id="pc-fil" aria-label="Votre chemin"></nav>
%(cta)s  <div class="pc-droite">
    <nav class="pc-reseaux" aria-label="Réseaux">%(reseaux)s</nav>
%(livre_debut)s    <a class="pc-livre" href="%(livre)s" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19"/></svg><span id="pc-livre-texte">Le livre<i> · L'IA pour tous</i></span></a>%(livre_fin)s
  </div>
%(burger)s</header>
<main class="pc-scene" id="pc-scene"></main>
%(bas)s
%(particules)s
<script id="raime-parcours-js">%(js)s</script>
</body></html>
""" % dict(style=STYLE, particules=fond,
           description=DESCRIPTION, livre=LIVRE_URL,
           # l'image de partage (LinkedIn, WhatsApp, X) : generateurs/partage/partage.png, 1200 x 630, charte noire
           partage=("\n".join([
                        '<meta property="og:image" content="https://raime.fr/partage.png">',
                        '<meta property="og:image:width" content="1200">',
                        '<meta property="og:image:height" content="630">',
                        '<meta property="og:image:alt" content="rAIme : améliorer votre quotidien avec l’IA.">',
                        '<meta name="twitter:card" content="summary_large_image">',
                        '<meta name="twitter:image" content="https://raime.fr/partage.png">']))
                   if NOIR_ESSAI else '<meta property="og:image" content="https://raime.fr/logo-mark.png">',
           # sur le site noir, plus de livre du tout (on le met en commentaire HTML, retire au nettoyage ci-dessous)
           livre_debut="<!--LIVRE" if NOIR_ESSAI else "", livre_fin="LIVRE-->" if NOIR_ESSAI else "",
           nom='<span class="pc-nom">rAIme</span>' if NOIR_ESSAI else "",
           cta=('  <a class="pc-cta" id="pc-cta" href="%s" target="_blank" rel="noopener">Réserver un appel</a>\n' % RESERVER)
               if NOIR_ESSAI else "",
           burger=('  <button class="pc-burger" id="pc-burger" type="button" data-menu aria-label="Menu"><span></span><span></span></button>\n')
                  if NOIR_ESSAI else "",
           bas=(sprite_logos() + '<div class="pc-colonnes" aria-hidden="true"></div><footer class="pc-pied" id="pc-pied"></footer>'
                + '<div class="pc-menu" id="pc-menu" role="dialog" aria-modal="true" aria-hidden="true"></div>'
                + '<div class="pc-rdv" id="pc-rdv" role="dialog" aria-modal="true" aria-hidden="true"><div class="pc-rdv-boite">'
                  '<div class="pc-rdv-tete"><div><p class="pc-mono" id="pc-rdv-mono"></p><h2 id="pc-rdv-titre"></h2></div>'
                  '<button class="pc-menu-fermer pc-rdv-fermer" data-rdv-fermer aria-label="Fermer">✕</button></div>'
                  '<iframe id="pc-rdv-cadre" title="Agenda de réservation"></iframe></div></div>'
                + '<div class="pc-rdv pc-score" id="pc-score" role="dialog" aria-modal="true" aria-labelledby="pc-score-titre" aria-hidden="true">'
                  '<div class="pc-score-boite"><button class="pc-menu-fermer pc-rdv-fermer" data-score-fermer aria-label="Fermer">✕</button>'
                  '<div class="pc-score-contenu" id="pc-score-contenu"></div></div></div>') if NOIR_ESSAI else
               ('<div class="pc-outils" aria-label="Les outils de rAIme" style="--defile:%ss">%s</div>' % (len(OUTILS) * 4, bandeau())),
           robots="" if PROD else '<meta name="robots" content="noindex">',
           reseaux="".join('<a href="%s" target="_blank" rel="noopener" aria-label="%s">'
                           '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="%s"/></svg><span>%s</span></a>'
                           % (u, n, d, n) for n, u, d in RESEAUX if u)
                   + ('<button class="pc-langue pc-jour" id="pc-jour" type="button" data-jour-bascule aria-label="Passer en version jour">'
                      '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.3"/>'
                      '<path d="M8 1.8a6.2 6.2 0 0 1 0 12.4z" fill="currentColor"/></svg></button>' if NOIR_ESSAI else '')
                   + '<button class="pc-langue" id="pc-langue" type="button" data-langue aria-label="Read in English">EN</button>',
           js=JS.replace("__LANGUES__", json.dumps({
                    "fr": {"N": noeuds_utiles(NOEUDS), "D": dessous("fr") if NOIR_ESSAI else "", "U": ui_utile(UI["fr"]), "S": {"arbitrage": score_html("fr"), "audit": audit_html("fr")}},
                    "en": {"N": noeuds_utiles(NOEUDS_EN), "D": dessous("en") if NOIR_ESSAI else "", "U": ui_utile(UI["en"]), "S": {"arbitrage": score_html("en"), "audit": audit_html("en")}}},
                   ensure_ascii=False))
                .replace("__RESERVER__", RESERVER).replace("__AGENDA__", AGENDA).replace("__LIVRE__", "" if NOIR_ESSAI else LIVRE_URL).replace("__GH__", RESEAUX[0][1]).replace("__LI__", LINKEDIN_URL).replace("__CPF__", "true" if CPF_ACTIF else "false")
                .replace("__PIED__", "true" if NOIR_ESSAI else "false")
                .replace("__AVIS__", json.dumps({**AVIS, "apercu": not PROD} if NOIR_ESSAI else None)))

    if NOIR_ESSAI:
        for a, b in NOIR:
            if a in page:
                page = page.replace(a, b)
            else:
                assert b in page, a
        import re
        from alleger import alleger
        page = re.sub(r"<!--LIVRE.*?LIVRE-->", "", page, flags=re.S)
        page = alleger(page)
        from jour import appliquer_jour
        page = appliquer_jour(page)
    if NARDO:
        from nardo import nardo
        page = nardo(page)
    if NARDO_BLANC:
        from nardo import nardo_blanc
        page = nardo_blanc(page)
    if ROSE_ESSAI:
        # Le moteur de particules est lu dans dist/index.html : depuis la mise en ligne du rose,
        # certaines teintes y sont deja. On passe alors son tour, au lieu de s'arreter.
        # On remplace ce qui reste en bleu ; une teinte deja rose ne bloque plus un remplacement
        # generique (le bas de page restait bleu : correction du 2026-09-25).
        for a, b in ROSE:
            if a in page:
                page = page.replace(a, b)
            else:
                assert b in page, a
    io.open(CIBLE / "index.html", "w", encoding="utf-8", newline="\n").write(page)
    print("écrit %s (%d Ko)" % (CIBLE / "index.html", (CIBLE / "index.html").stat().st_size // 1024))


if __name__ == "__main__":
    main()
