# Scripts d'Hermes côté serveur (copie de /opt/raime/scripts, 22/10/2026)

Ces scripts tournent sur l'hôte (crontab de root), pas par la porte : le dépôt en garde la version en service
pour qu'elle ne vive plus seulement sur le serveur. Pour en changer un : le modifier ici, puis le poser à la main
dans /opt/raime/scripts (sauvegarde `.avant-<date>` à côté).

- hermes_releve.py (*/15) : l'état commun etat.json / etat.txt, avec une ligne par analyste et gouverneur ;
- hermes_gouverneur.py (*/10) : jetons par origine, pause de la veille et des ordres au plafond ;
- hermes_silence.py (*/30) : une alerte si Hermes se tait ;
- hermes_carte.py (*/10) : la carte Hermes du cockpit ;
- hermes_marque_modele.py (23 h 15 UTC) : le modèle qui a écrit la réflexion de nuit ;
- hermes_bilan_relais.py (5 h 30 UTC) : le bilan des relais gratuits ;
- hermes_entretien.sh (3 h 15 UTC) : sauvegarde et corbeille.
