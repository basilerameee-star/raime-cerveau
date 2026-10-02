# L'Envoyeur de Jarvis : Chromium dans un écran virtuel (Xvfb), visible par noVNC sur le réseau interne
# (Caddy le sert sous cockpit.raime.fr/navigateur/ derrière le mot de passe du Cockpit).
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PYTHONIOENCODING=utf-8 DISPLAY=:99 DONNEES=/data TZ=Europe/Zurich
RUN apt-get update && apt-get install -y --no-install-recommends xvfb x11vnc novnc websockify fluxbox fonts-dejavu tzdata \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir playwright==1.55.0 \
    && playwright install --with-deps chromium
WORKDIR /app
COPY demarrer.sh /demarrer.sh
RUN chmod +x /demarrer.sh
EXPOSE 6080
CMD ["/demarrer.sh"]
