# Le clippeur : découpe des vidéos sources de campagnes Whop en clips verticaux sous-titrés (voir clippeur.py).
FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-inter fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir yt-dlp faster-whisper "opencv-python-headless==4.10.0.84" pypdf
WORKDIR /app
COPY clippeur.py .
ENTRYPOINT ["python", "clippeur.py"]
