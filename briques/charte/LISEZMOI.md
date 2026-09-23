# Charte graphique rAIme

Mise à jour : 11 septembre 2026. Les valeurs sont relevées directement sur le site.

## Dans ce dossier
- `charte-graphique.html` : la charte à lire (ouvrir dans le navigateur).
- `tokens.json` : les valeurs pour les outils (agent d'images, slides, rapports).
- `tokens.css` : les mêmes valeurs en variables CSS, prêtes à l'emploi.
- `polices/` : Inter (droit, graisses 100 à 900) et Inter italique. Licence libre SIL OFL.
- `logos/` : le « r. » (logo-mark), le logo complet, le favicon.
- `exemples/post-exemple.html` et `.png` : un post de 1080 × 1350 px pour LinkedIn, Facebook et TikTok.
- `exemples/apercu-charte.png` : la charte en image.

## Modèles (depuis le 11 septembre 2026)
- `modeles/document-a4.css` : tous les documents PDF. Ils sont construits par `04_Offre_de_formation/_sources/build.py` à partir des fragments `*.body.html`, et les pré-audits par `gen_preaudit.py`.
- `modeles/slides-16x9.css` et `slides-exemple.html` : les slides de formation (rendu dans `exemples/slides-exemple.pdf`).
- `09_Commercial/Emails/generer_emails.py` : les emails (réponse à un contact, envoi d'un pré-audit, proposition à une CCI).
- `logos/logo-mark-blanc.png` : le logo blanc pour les fonds bleus (en-tête et filigrane).
- Dans Claude Code, la skill `charte-raime` rappelle tout cela à chaque nouveau document.

## L'essentiel
- **Déclinaison principale : bleu.** Les autres déclinaisons (clair argent et indigo, noir-bleu, noir-citron) sont dans `tokens.json`.
- **Typographie :** une seule police, Inter.
  - 6 rôles : 64 / 36 / 18 / 15 / 14 / 12 px.
  - Le mot-clé est en italique, avec le dégradé métal.
- **Espaces :** 8 · 16 · 24 · 40 px. Le titre reste près de son contenu, et les groupes sont bien séparés.
- **Voix :**
  - sans « je » ni « moi » ; des mots simples, des listes brutes ;
  - aucune tournure négative (sans, jamais, ne… pas, aucun, éviter, zéro, perdre, inutile, rien) ;
  - des chiffres vérifiables seulement.
