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
PROD = "--prod" in sys.argv   # raime.fr : indexable ; sinon apercu en noindex
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
        phrase="Formation, audit des postes, analyse des propositions reçues.",
        enfants=["particulier", "pro", "projets"]),

    "particulier": dict(type="fiche", titre="Se former à l'IA", etiquette="Particulier",
        libelle="Particulier", court="Formez-vous à l'IA : plaisir et projets",
        phrase="Apprenez à vous servir de l'IA au quotidien, pour le plaisir, pour créer, ou pour lancer votre activité.",
        faits=[("Pour qui", "Les débutants, les curieux, les futurs indépendants"),
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
               ("Durée", "Une journée, chez vous ou en visio"),
               ("Tarif", "À la journée ou au forfait"),
               ("Le résultat", "Vos priorités, écrites et datées")]),

    "pro/formation/codir": dict(type="fiche", titre="Codir", etiquette="Formation",
        court="Toute la direction, dans le même sens",
        phrase="Une journée pour que toute la direction parle le même langage.",
        faits=[("Pour qui", "Votre comité de direction, jusqu'à 8 personnes"),
               ("Durée", "Une journée"),
               ("Tarif", "À la journée ou au forfait"),
               ("Le résultat", "Un cap commun et des règles claires pour tous")]),

    "pro/formation/employes": dict(type="fiche", titre="Employés", etiquette="Formation",
        court="Du temps gagné dès le lendemain",
        phrase="Une journée pour que vos équipes gagnent du temps dès le lendemain.",
        faits=[("Pour qui", "Vos équipes, jusqu'à 10 personnes"),
               ("Durée", "Une journée, ou plus au forfait, sur leurs vraies tâches"),
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
        phrase="Vingt-quatre agents font tourner l'entreprise, jour et nuit : ils cherchent, écrivent, surveillent et préviennent.",
        faits=[("Ce qu'ils font", "Repèrent des entreprises, trouvent les contacts, rédigent, suivent l'actualité de l'IA"),
               ("Chaque matin", "Un rapport complet, envoyé automatiquement"),
               ("Leur force", "Une proposition commerciale analysée en 144 secondes")],
        image=("/projets/raime-cockpit.webp", "Le tableau de bord des agents rAIme", 1280, 600),
        chiffres=[("24", "agents en service"), ("2 887", "entreprises repérées"), ("150", "articles lus chaque jour")]),

    "projets/cockpit": dict(type="projet", titre="Cockpit", etiquette="Projets",
        court="Le poste de pilotage d'un assistant de direction",
        phrase="Le poste de pilotage d'un assistant de direction : la journée, les contacts et l'agenda au même endroit.",
        faits=[("Comment ça marche", "La journée se construit seule, à partir des routines et de l'agenda"),
               ("L'agent", "Lit l'agenda et propose les actions, toujours validées par l'humain"),
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
}

STYLE = """
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
"""

JS = """
(function(){
  var N = __NOEUDS__, RES = "__RESERVER__";
  var scene = document.getElementById("pc-scene"), fil = document.getElementById("pc-fil"),
      retour = document.getElementById("pc-retour");
  var NOMS = {"accueil":"Accueil","particulier":"Particulier","pro":"Professionnel","projets":"Projets",
              "pro/formation":"Formation","pro/audit":"Audit","pro/arbitrage":"Arbitrage","pro/automatisation":"Automatisation"};
  function esc(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
  function nom(id){ return NOMS[id] || (N[id] && N[id].titre) || id; }
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
    var legal = id === "accueil" ? '<p class="pc-legal"><a href="mailto:contact@raime.fr">contact@raime.fr</a>'
      + '<a href="/mentions-legales/">Mentions légales</a><a href="/cgv/">CGV</a><a href="/confidentialite/">Confidentialité</a></p>' : '';
    var h = '<div class="pc-vue pc-vue--chemins"><div class="pc-haut">' + tete(id,n) + '</div><div class="pc-chemins pc-chemins--' + n.enfants.length + '" style="--n:' + n.enfants.length + '">';
    n.enfants.forEach(function(e,i){
      var x = N[e];
      h += '<button class="pc-chemin" data-vers="' + e + '" style="animation-delay:' + (120 + i*70) + 'ms">'
         + '<b>' + esc(x.libelle || (x.type === "chemins" ? (NOMS[e] || x.etiquette) : x.titre)) + '</b>'
         + '<small>' + esc(x.court || "") + '</small><i>→</i></button>';
    });
    return h + '</div>' + legal + '</div>';
  }
  function fiche(id,n){
    var preuve = n.preuve ? '<button class="pc-preuve" data-vers="' + n.preuve[1] + '">' + esc(n.preuve[0]) + ' →</button>' : '';
    return '<div class="pc-vue pc-vue--fiche"><div>' + tete(id,n) + '</div><div>' + faits(n) + preuve
      + '<div class="pc-actions"><a class="pc-bouton" href="' + RES + '" target="_blank" rel="noopener">Réserver un appel d\\'une heure</a></div>'
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
  function rendre(id){
    if(!N[id]) id = "accueil";
    var n = N[id];
    scene.innerHTML = n.type === "chemins" ? chemins(id,n) : (n.type === "projet" ? projet(id,n) : fiche(id,n));
    fil.innerHTML = id === "accueil" ? "" : chemin(id).map(function(x,i){
      return (i ? '<span>›</span>' : "") + '<button data-vers="' + x + '">' + esc(x === "accueil" ? "Accueil" : nom(x)) + '</button>';
    }).join("");
    retour.classList.toggle("pc-la", id !== "accueil");
    retour.setAttribute("data-vers", parent(id));
    document.title = (id === "accueil" ? "rAIme — conseil en intelligence artificielle" : nom(id) + " — rAIme");
    window.scrollTo(0, 0);
  }
  function aller(id){ location.hash = id === "accueil" ? "#" : "#/" + id; }
  var ANCIENNES = {"offres":"pro","formation":"pro/formation","audit":"pro/audit","diagnostic":"pro/audit",
    "arbitrage":"pro/arbitrage","verifications":"pro/arbitrage","suivi":"pro","pilotage":"pro","accompagnement":"pro",
    "projets":"projets","automatisation":"pro/automatisation","automatiser":"pro/automatisation","approche":"accueil","methode":"accueil","secteurs":"pro","contact":"accueil","formulaire":"accueil"};
  function lire(){
    var h = location.hash.replace(/^#\\/?/, "");
    if(h && !N[h] && ANCIENNES[h.replace(/^\\//, "")]){ h = ANCIENNES[h.replace(/^\\//, "")]; history.replaceState(null, "", h === "accueil" ? "#" : "#/" + h); }
    return h || "accueil";
  }

  document.addEventListener("click", function(e){
    var b = e.target.closest("[data-vers]");
    if(b){ e.preventDefault(); aller(b.getAttribute("data-vers")); }
  });
  window.addEventListener("hashchange", function(){ rendre(lire()); });
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
OUTILS = [("Claude", "claude"), ("ChatGPT", "openai"), ("DeepSeek", "deepseek"), ("Qwen", "qwen"), ("Gemini", None),
          ("Groq", "groq"), ("OpenRouter", "openrouter"), ("Hugging Face", "huggingface"), ("n8n", "n8n"),
          ("Python", None), ("FastAPI", None), ("React", "react"), ("PostgreSQL", "postgresql"), ("Docker", "docker"),
          ("Hetzner", "hetzner"), ("Oracle Cloud", "oracle"), ("Cloudflare", "cloudflare"), ("GitHub", "github"),
          ("Resend", None), ("Stripe", None), ("Metabase", None), ("Tailscale", None), ("Obsidian", "obsidian"),
          ("Figma", "figma")]


def chemin_logo(fichier):
    if fichier == "github":
        return RESEAUX[0][2]
    if not fichier or not (LOGOS / (fichier + ".svg")).exists():
        return None
    s = (LOGOS / (fichier + ".svg")).read_text(encoding="utf-8")
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


def particules():
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
    if PROD:
        if (CIBLE / "_headers").exists():
            (CIBLE / "_headers").unlink()
    else:
        io.open(CIBLE / "_headers", "w", encoding="utf-8", newline="\n").write("/*\n  X-Robots-Tag: noindex\n")

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
<meta property="og:image" content="https://raime.fr/logo-mark.png">
<link rel="icon" href="/favicon.png">
<style id="raime-parcours">%(style)s</style>
</head>
<body>
<div class="pc-charge" id="pc-charge"><img src="/logo-mark-blanc.png" alt=""><div class="pc-piste"><i></i></div><p>rAIme</p></div>
<header class="pc-tete">
  <a class="pc-logo" href="#" data-vers="accueil" aria-label="rAIme, accueil"><img src="/logo-mark-blanc.png" alt="rAIme"></a>
  <button class="pc-retour" id="pc-retour" data-vers="accueil" aria-label="Revenir">‹</button>
  <nav class="pc-fil" id="pc-fil" aria-label="Votre chemin"></nav>
  <div class="pc-droite">
    <nav class="pc-reseaux" aria-label="Réseaux">%(reseaux)s</nav>
    <a class="pc-livre" href="%(livre)s" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19"/></svg><span>Le livre<i> · L'IA pour tous</i></span></a>
  </div>
</header>
<main class="pc-scene" id="pc-scene"></main>
<div class="pc-outils" aria-label="Les outils de rAIme" style="--defile:%(defile)ss">%(outils)s</div>
%(particules)s
<script id="raime-parcours-js">%(js)s</script>
</body></html>
""" % dict(style=STYLE, particules=particules(),
           outils=bandeau(), defile=len(OUTILS) * 4, description=DESCRIPTION, livre=LIVRE_URL,
           robots="" if PROD else '<meta name="robots" content="noindex">',
           reseaux="".join('<a href="%s" target="_blank" rel="noopener" aria-label="%s">'
                           '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="%s"/></svg><span>%s</span></a>'
                           % (u, n, d, n) for n, u, d in RESEAUX if u),
           js=JS.replace("__NOEUDS__", json.dumps(NOEUDS, ensure_ascii=False)).replace("__RESERVER__", RESERVER))

    if ROSE_ESSAI:
        # Le moteur de particules est lu dans dist/index.html : depuis la mise en ligne du rose,
        # certaines teintes y sont deja. On passe alors son tour, au lieu de s'arreter.
        for a, b in ROSE:
            if b in page:
                continue
            assert a in page, a
            page = page.replace(a, b)
    io.open(CIBLE / "index.html", "w", encoding="utf-8", newline="\n").write(page)
    print("écrit %s (%d Ko)" % (CIBLE / "index.html", (CIBLE / "index.html").stat().st_size // 1024))


if __name__ == "__main__":
    main()
