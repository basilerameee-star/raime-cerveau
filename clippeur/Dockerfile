# Le clippeur : découpe des vidéos sources de campagnes Whop en clips verticaux sous-titrés (voir clippeur.py).
FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-inter fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
# yt-dlp[curl-cffi] : Kick exige l'usurpation d'un navigateur (22/10/2026, VOD des streamers en 404 sans elle)
RUN pip install --no-cache-dir "yt-dlp[default,curl-cffi]" faster-whisper "opencv-python-headless==4.10.0.84" pypdf gdown
WORKDIR /app
COPY clippeur.py .
ENTRYPOINT ["python", "clippeur.py"]
