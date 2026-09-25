# La voix de Jarvis

Service interne `voix` (réseau Docker, jamais exposé) : ta voix devient du texte, et le texte une voix française.
Tout reste sur le serveur.

- **Écouter** : faster-whisper, modèle « small », sur le processeur. `POST /transcrire` prend l'audio brut et rend `{texte, duree, langue}`.
- **Parler** : Piper, voix `fr_FR-siwis-medium`. `POST /parler` prend `{texte}` et rend un fichier WAV.
- **Santé** : `GET /sante`.

Dans `/opt/raime/docker-compose.yml` :

```yaml
  voix:
    build: ./voix
    restart: unless-stopped
    mem_limit: 2g
    environment:
      VOIX_MODELE: small
      VOIX_FILS: "4"
    volumes:
      - voixmodeles:/modeles
```

Le cockpit y accède par `VOIX_URL=http://voix:9000` ; il lit la clé de modèles (`env_file: ./raime-brain/.env`)
seulement pour dire les crédits restants. Mesures du 25/09/2026 : une phrase transcrite en 2 à 2,5 s, une réponse dite en 0,3 s.
