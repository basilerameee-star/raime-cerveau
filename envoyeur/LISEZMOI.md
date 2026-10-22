# L'Envoyeur de Jarvis (serveur, 24 h/24)

Conteneur `raime-envoyeur` (réseau raime_default), code = ce dossier monté en lecture seule dans /app,
données personnelles HORS dépôt dans `/opt/raime/envoyeur-data` (monté sur /data) :
jeton.txt (= ENVOYEUR_JETON du coffre), profil_candidat.json, cv/*.pdf, offres.json, deja_dans_jarvis.json, navigateur/.

- Boucle : collecte chaque matin (7 h), puis un passage d'envoi par heure (candidature simplifiée jobup / jobs.ch).
- Ce qui ne peut pas partir honnêtement (question inconnue sur un fait, annonce expirée, formulaire inattendu)
  est abandonné et rangé dans Jarvis, jamais renvoyé à Basile.
- Connexion de Basile (une fois) : `touch /opt/raime/envoyeur-data/pause`, puis
  `docker exec raime-envoyeur python /app/serveur.py connexion`, Basile ouvre https://cockpit.raime.fr/navigateur/vnc.html?path=navigateur/websockify&autoconnect=true&resize=scale (sans « path », l’écran reste vide),
  se connecte, puis `rm /opt/raime/envoyeur-data/pause`.
- Lancement : voir installer.sh.
