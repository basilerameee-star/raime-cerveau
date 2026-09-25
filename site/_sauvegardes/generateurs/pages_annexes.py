# -*- coding: utf-8 -*-
"""
PAGES ANNEXES en noir et blanc (25/09/2026) : mentions legales, CGV, confidentialite, page 404 et
remerciement du livre, au meme habillage que l'accueil (noir, blanc, gris ; reflet rose sur les
mots-cles ; echelle Sam Crawford : titre, sous-titres 18 en gras, texte 18, petit 14, etiquette 12).

Le texte des pages legales est repris tel quel de dist/ (il ne change que sur la parole de Basile),
avec une correction factuelle : la politique de confidentialite nommait Oracle Cloud, abandonne le
23/09/2026, au lieu des prestataires reels.

USAGE   python pages_annexes.py          -> ../../apercu-noir/  (apres parcours.py --noir)
"""
import io, pathlib, re, sys

ICI = pathlib.Path(__file__).resolve().parent
SITE = ICI.parent.parent
# Le texte d'origine des pages legales : depuis la mise en ligne du noir (25/09/2026), dist/ contient
# deja les pages refaites ; on relit donc la sauvegarde d'avant, qui garde le texte de reference.
DIST = ICI.parent / "avant-noir-prod-2026-09-25" / "dist"
CIBLE = SITE / "apercu-noir"
# --nardo : la variante gris Nardo mat, texte noir (voir nardo.py), dans apercu-nardo/
NARDO = "--nardo" in sys.argv
if NARDO:
    CIBLE = SITE / "apercu-nardo"
NARDO_BLANC = "--nardo-blanc" in sys.argv
if NARDO_BLANC:
    CIBLE = SITE / "apercu-nardo-blanc"
RESERVER = "https://calendar.app.google/HdhqAt3BaQFWfx2g7"
# La meme fenetre de reservation que sur l'accueil : l'agenda Google (vue integrable) sans quitter le site.
AGENDA = ("https://calendar.google.com/calendar/appointments/schedules/"
          "AcZssZ1NsZX-UR_txvtIcaGo06kKAj-Q8YzeMIQC5A7fbAst5bN7Su43SJM_RvMYFP1-mP6pU4W2ngTI?gv=true")

STYLE = """
@font-face{font-family:Inter;font-style:normal;font-weight:100 900;font-display:swap;src:url(/fonts/InterVariable.woff2) format("woff2")}
:root{--t1:clamp(40px,4.9vw,84px);--t2:clamp(32px,3.9vw,64px);--texte:#fff;--gris:#a6a6a6;--trait:rgba(255,255,255,.12)}
*{box-sizing:border-box}
html,body{margin:0;background:#000;color:var(--texte);font-family:Inter,-apple-system,"Segoe UI",sans-serif;font-size:18px;line-height:1.65;
  -webkit-font-smoothing:antialiased}
body{background:#000}
.droite{display:flex;align-items:center;gap:14px}
.jour{display:inline-grid;place-items:center;width:24px;height:24px;padding:0;border:1px solid rgba(255,255,255,.3);border-radius:999px;
  background:none;color:#a6a6a6;cursor:pointer;transition:color .3s,border-color .3s}
.jour:hover{color:#fff;border-color:#fff}
.jour svg{width:12px;height:12px}
a{color:#fff}
.tete{position:sticky;top:0;z-index:5;display:flex;align-items:center;justify-content:space-between;gap:20px;height:76px;
  padding:0 clamp(20px,5vw,72px);background:linear-gradient(180deg,rgba(0,0,0,.94),rgba(0,0,0,.7) 70%,rgba(0,0,0,0))}
.logo{display:flex;align-items:center;gap:12px;color:#fff;text-decoration:none;font-size:22px;font-weight:600;letter-spacing:-.03em}
.logo img{height:38px;width:auto}
.appel{display:inline-flex;align-items:center;height:36px;padding:0 18px;border-radius:999px;background:#fff;color:#000;
  font-size:14px;font-weight:600;text-decoration:none}
main{width:min(760px,100%);margin:0 auto;padding:clamp(40px,8vh,90px) clamp(20px,5vw,40px) 120px}
.kick,.etiq{display:block;margin:0 0 16px;font:12px ui-monospace,"SF Mono",Menlo,Consolas,monospace;letter-spacing:.14em;
  text-transform:uppercase;color:var(--gris)}
.kick::before,.etiq::before{content:"/// ";opacity:.45}
h1{margin:0;font-size:var(--t2);line-height:1.02;letter-spacing:-.04em;font-weight:600;color:#fff}
h1 em{display:block;font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;font-style:normal;font-weight:500;letter-spacing:-.05em;
  color:#ff7eb0}
@keyframes reflet{0%{background-position:100% 0}60%,100%{background-position:0 0}}
.sub{margin:18px 0 36px;font-size:14px;color:var(--gris)}
h2{margin:40px 0 10px;padding-top:22px;border-top:1px solid var(--trait);font-size:18px;font-weight:600;letter-spacing:-.01em;color:#fff}
p,li{margin:0 0 14px}
ul{margin:0 0 14px;padding-left:1.1em}
li::marker{color:var(--gris)}
strong,b{color:#fff;font-weight:600}
.bouton{display:inline-flex;align-items:center;gap:16px;height:50px;padding:0 26px 0 0;margin:8px 0 26px;background:#fff;color:#000;
  font-size:15px;font-weight:500;text-decoration:none}
.bouton i{width:50px;height:50px;border:1px solid #fff;background:radial-gradient(circle at 1px 1px,rgba(255,255,255,.65) 1px,transparent 0) 0 0/5px 5px,#000}
.bouton svg{display:none}
.lien{margin-left:18px;color:var(--gris)}
.petit{font-size:14px;color:var(--gris)}
.pied{position:fixed;left:0;right:0;bottom:0;display:flex;justify-content:space-between;gap:16px;height:44px;align-items:center;
  padding:0 clamp(20px,5vw,72px);border-top:1px solid rgba(255,255,255,.08);background:rgba(0,0,0,.9);font-size:14px}
.pied a{color:var(--gris);text-decoration:none}.pied a:hover{color:#fff}
.pied span{display:flex;gap:20px}
.pied a{white-space:nowrap}
@media (max-width:560px){.pied{font-size:12px;gap:10px}.pied span{gap:11px}.appel{height:34px;padding:0 14px;font-size:12px}}
@media (prefers-reduced-motion:reduce){h1 em{animation:none}}
.rdv{position:fixed;inset:0;z-index:20;display:grid;place-items:center;padding:clamp(10px,3vw,40px);background:rgba(0,0,0,.74);
  -webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);opacity:0;visibility:hidden;transition:opacity .35s,visibility .35s}
.rdv.ouvert{opacity:1;visibility:visible}
.rdv-boite{width:min(1040px,100%);height:min(780px,100%);display:flex;flex-direction:column;background:#e8e8e8;border:1px solid rgba(255,255,255,.22)}
.rdv-tete{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;padding:20px 24px 18px;background:#000;color:#fff}
.rdv-tete .etiq{margin:0}.rdv-tete h2{margin:8px 0 0;padding:0;border:0}
.rdv-fermer{flex:none;width:40px;height:40px;border:1px solid #fff;border-radius:50%;background:none;color:#fff;font-size:16px;cursor:pointer}
.rdv iframe{flex:1;width:100%;border:0;background:#fff}
"""

PAGE = """<!doctype html>
<html lang="fr" data-theme="noir"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
%(robots)s<title>%(titre)s</title>
<meta name="description" content="%(description)s">
%(canonical)s<link rel="icon" href="/favicon.png">
<style>%(style)s</style>
</head>
<body>
<header class="tete"><a class="logo" href="/" aria-label="rAIme, accueil"><img src="/logo-mark-blanc.png" alt="">rAIme</a>
<span class="droite"><button class="jour" type="button" data-jour-bascule aria-label="Passer en version jour"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M8 1.8a6.2 6.2 0 0 1 0 12.4z" fill="currentColor"/></svg></button>
<a class="appel" href="%(reserver)s" target="_blank" rel="noopener">Réserver un appel</a></span></header>
<main>%(contenu)s</main>
<div class="rdv" id="rdv" role="dialog" aria-modal="true" aria-hidden="true"><div class="rdv-boite"><div class="rdv-tete"><div><p class="etiq">Un appel d'une heure</p><h2>Choisissez votre créneau</h2></div><button class="rdv-fermer" data-fermer aria-label="Fermer">✕</button></div><iframe id="rdv-cadre" title="Agenda de réservation"></iframe></div></div>
<script>(function(){var m=document.getElementById("rdv"),f=document.getElementById("rdv-cadre");function r(o){if(o&&!f.getAttribute("src"))f.setAttribute("src","%(agenda)s");m.classList.toggle("ouvert",o);m.setAttribute("aria-hidden",o?"false":"true");document.documentElement.style.overflow=o?"hidden":"";}document.addEventListener("click",function(e){if(e.target.closest(".appel")){e.preventDefault();r(true);}else if(e.target.closest("[data-fermer]")||e.target===m){r(false);}});document.addEventListener("keydown",function(e){if(e.key==="Escape")r(false);});
var d=document.documentElement,b=document.querySelector("[data-jour-bascule]");function et(){if(b)b.setAttribute("aria-label",d.hasAttribute("data-jour")?"Passer en version nuit":"Passer en version jour");}et();
document.addEventListener("click",function(e){if(!e.target.closest("[data-jour-bascule]"))return;var j=!d.hasAttribute("data-jour");if(j)d.setAttribute("data-jour","");else d.removeAttribute("data-jour");try{localStorage.setItem("pc-jour",j?"1":"0");}catch(x){}et();});})();</script>
<footer class="pied"><a href="mailto:contact@raime.fr">contact@raime.fr</a>
<span><a href="/mentions-legales/">Mentions légales</a><a href="/cgv/">CGV</a><a href="/confidentialite/">Confidentialité</a></span></footer>
</body></html>
"""


def lire(chemin):
    return io.open(DIST / chemin, encoding="utf-8").read()


def meta(t, nom):
    m = re.search(r'<meta name="%s" content="([^"]*)"' % nom, t)
    return m.group(1) if m else ""


def ecrire(chemin, titre, description, contenu, canonique=None, indexable=True):
    sortie = CIBLE / chemin
    sortie.parent.mkdir(parents=True, exist_ok=True)
    page = PAGE % dict(titre=titre, description=description, contenu=contenu, style=STYLE, reserver=RESERVER, agenda=AGENDA,
                       robots="" if indexable else '<meta name="robots" content="noindex">\n',
                       canonical=('<link rel="canonical" href="%s">\n' % canonique) if canonique else "")
    if not (NARDO or NARDO_BLANC):
        from jour import appliquer_jour
        page = appliquer_jour(page)
    if NARDO:
        from nardo import nardo
        page = nardo(page)
    if NARDO_BLANC:
        from nardo import nardo_blanc
        page = nardo_blanc(page)
    io.open(sortie, "w", encoding="utf-8", newline="\n").write(page)
    print("écrit", sortie.relative_to(SITE))


def legale(dossier, corrections=()):
    t = lire(dossier + "/index.html")
    contenu = re.search(r'<main class="legal">(.*?)</main>', t, re.S).group(1).strip()
    for avant, apres in corrections:
        assert avant in contenu, avant[:60]
        contenu = contenu.replace(avant, apres)
    titre = re.search(r"<title>(.*?)</title>", t).group(1)
    ecrire(dossier + "/index.html", titre, meta(t, "description"), contenu, "https://raime.fr/%s/" % dossier)


def main():
    # 25/09/2026 : les textes legaux disent ce qui existe vraiment (accord general de Basile pour ces corrections)
    legale("mentions-legales", corrections=[
        ("(formulaire de contact, réservation)", "(message par e-mail, réservation d'un appel)"),
        ('adresse communiquée sur demande<br>Email : <a href="mailto:contact@raime.fr">contact@raime.fr</a>',
         'adresse communiquée sur demande<br>Email : <a href="mailto:contact@raime.fr">contact@raime.fr</a>'
         '<br>Téléphone : 06 07 65 61 70')])
    legale("cgv", corrections=[(  # les prestations proposees aujourd'hui (product building retire le 25/09, site web ensuite)
        "(product building, création de site web, automatisation)",
        "(audit des postes, analyse des propositions, automatisation, suivi)")])
    legale("confidentialite", corrections=[
        ("<strong>Formulaire de contact</strong> : nom, email et message",
         "<strong>Message par e-mail</strong> : nom, adresse e-mail et contenu du message"),
        ("<strong>consentement</strong>(formulaire, prise de rendez-vous)", "<strong>consentement</strong> (message, prise de rendez-vous)"), (
        "Elles peuvent être traitées par nos prestataires techniques agissant comme sous-traitants (hébergement Cloudflare et Oracle Cloud, outil de réservation, service d'emailing, outil d'automatisation).",
        "Elles peuvent être traitées par nos prestataires techniques agissant comme sous-traitants : Cloudflare (hébergement du site), Hetzner, en Allemagne (hébergement de nos outils internes), Google (messagerie et agenda de réservation), Stripe (paiements en ligne), ainsi qu'un service d'envoi d'e-mails.")])
    ecrire("404.html", "Page introuvable — rAIme", "Cette adresse a changé : tout est réuni sur l'accueil de rAIme.",
           '<span class="kick">Erreur 404</span><h1>Cette page a changé <em>d\'adresse.</em></h1>'
           '<p class="sub">Tout est réuni sur la page d\'accueil.</p>'
           '<p><a class="bouton" href="/"><i></i>Revenir à l\'accueil</a></p>'
           '<p>Nos offres et nos prix : <a href="/#/tarifs">Offres et tarifs</a>. Une question : '
           '<a href="mailto:contact@raime.fr">contact@raime.fr</a>.</p>', indexable=False)
    t = lire("merci-livre/index.html")
    corps = re.search(r"<main[^>]*>(.*?)</main>", t, re.S) or re.search(r"<body[^>]*>(.*?)</body>", t, re.S)
    contenu = re.sub(r"<script.*?</script>|<style.*?</style>", "", corps.group(1), flags=re.S).strip()
    contenu = contenu.replace(' style="color:#fff;font-weight:600"', "")
    contenu = re.sub(r'(<a class="bouton"[^>]*>)<svg.*?</svg>', r"\1<i></i>", contenu, flags=re.S)
    ecrire("merci-livre/index.html", "Merci — rAIme", "Votre livre « L'IA pour tous » est prêt à télécharger.", contenu,
           indexable=False)


if __name__ == "__main__":
    main()
