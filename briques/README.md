# Les briques validées

**Règle unique : ce qui a été validé une fois n'est plus redemandé.** Pour construire un service, le cerveau prend d'abord ses briques ici ; il ne réinvente que ce qui n'y figure pas, et chaque nouvelle brique qui passe ses contrôles et sert en production s'ajoute à ce registre.

| Brique | Fichiers | Validée | Règle d'usage |
|---|---|---|---|
| **Identité rAIme — palette rose** | `site/generateur_parcours.py` (liste `ROSE`) | par Basile, 23/09/2026 (« vraiment nickel »), en ligne sur raime.fr | palette **actuelle** de rAIme : fond #6e5569 → #cfa9ba, bouton #f5d0d8 texte #3d2437, italique des titres #f6d3dc, texte #f2e8ee, gris #e2d0da |
| Identité rAIme — charte bleue | `charte/tokens.css`, `charte/tokens.json`, `charte/LISEZMOI.md` | 12/09/2026 | **historique** : documents imprimés existants (formation, livre). Les nouveaux supports web prennent le rose |
| Police | `charte/polices/InterVariable.woff2`, `Inter-Italic-400.woff2` | charte | Inter partout ; libre de droits (licence OFL) |
| Logos | `charte/logos/` | charte | `logo-mark-blanc.png` sur fond sombre ou coloré, `logo-mark.png` sur fond clair |
| **Site en parcours** | `site/generateur_parcours.py` | en ligne sur raime.fr depuis le 21/09/2026 | un seul fichier HTML autonome : accroche en haut, choix en ligne dessous, flèche de retour, fond à particules, aucun prix affiché pour les services |
| **Paiement Stripe** | `paiement/` | livre « L'IA pour tous », 19 €, en vente depuis le 21/09/2026 | lien de paiement Stripe → page de remerciement avec téléchargement ; la fonction `stripe-webhook.js` envoie le produit par e-mail (Resend) une fois ses deux clés posées |
| Pages légales | `legal/` | en ligne sur raime.fr | modèles pour **rAIme**. Pour le site d'un client, l'identité légale est celle du client : elle vient du brief, jamais inventée |
| **Hébergement** | `hebergement/exemple_voyage.txt` | voyage.raime.fr, cockpit.raime.fr, n8n.raime.fr | un service = un conteneur dans `docker-compose.override.yml` + un bloc Caddy `<nom>.raime.fr { reverse_proxy <nom>:<port> }` ; Caddy obtient le certificat tout seul |
| Sauvegardes | (serveur) | 23/09/2026 | chaque nuit : base chiffrée vers Cloudflare R2 + seconde copie sur le serveur |

## La voix, pour tout texte public

Français courant, **aucun « je »**, **aucune tournure négative**, peu de jargon. Le client d'abord : est-ce pour moi, qu'est-ce que je reçois, comment commencer. **Aucun prix inventé**, **aucune mention du CPF**.

## Ce qu'aucune brique ne fournit — à demander, jamais à deviner

- le **prix** d'un nouveau produit ou service ;
- l'**identité légale** d'un client (raison sociale, SIREN, adresse, responsable de publication) ;
- les **clés** d'un compte que la maison ne possède pas encore.

Quand l'une manque, le service part quand même en ligne : le bouton d'achat devient « demander un devis », et la question part à Basile.
