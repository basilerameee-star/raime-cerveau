# Kit serveur client rAIme

Les automatisations d'un client tournent **chez lui**, sur un serveur **à son nom**. Le client garde la propriété, les accès et la possibilité de partir ; rAIme reçoit un accès d'administration délégué. C'est ce que le Score rAIme exige des autres prestataires (clauses C2, C3, C4) : rAIme se l'applique.

Essayé le 25/09/2026 sur le serveur de rAIme, dans un projet à part : installation, réponse de n8n, sauvegarde, restauration, puis tout supprimé.

## Ce qui est installé
- **n8n 2.34.6** : les automatisations (mêmes versions que chez rAIme).
- **PostgreSQL 16** : la base, jamais exposée.
- **Caddy 2.11** : le cadenas HTTPS (certificat automatique), seule porte ouverte (80, 443).
- **Une sauvegarde chaque nuit** (3 h) : la base, le dossier n8n et ses clés ; 14 jours gardés.
- **Un pare-feu** : seuls SSH, HTTP et HTTPS entrent.

## Les étapes, avec le client
1. **Le client ouvre le serveur à son nom.** Par défaut : Hetzner Cloud (Allemagne, quelques euros par mois), Ubuntu 24.04. Variante française : OVHcloud. Le client ajoute la clé publique d'administration de rAIme.
2. **Le nom.** Une adresse du client (ex. `automatisation.entreprise.fr`) pointe vers le serveur (enregistrement DNS A).
3. **L'installation.** Copier ce dossier sur le serveur, puis : `sudo ./installer.sh automatisation.entreprise.fr adresse@entreprise.fr`. Les secrets sont tirés au hasard sur place, jamais affichés.
4. **Le compte n8n.** Créé par le client à la première ouverture de l'adresse.
5. **L'essai de restauration.** `sudo ./restaurer.sh AAAA-MM-JJ` une fois, devant le client (case de la liste AUTO-02).
6. **La remise des accès.** Les accès administrateur restent au client ; la clé `N8N_ENCRYPTION_KEY` (dans `.env`) est gardée par lui aussi.

## Ce qui reste au client
- Le compte et la facture de l'hébergeur.
- Une copie de sauvegarde hors du serveur, s'il le souhaite (ligne prévue dans `sauvegarde.sh`).
