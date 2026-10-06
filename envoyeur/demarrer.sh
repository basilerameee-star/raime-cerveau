#!/bin/sh
# Écran virtuel + gestionnaire de fenêtres + VNC local + noVNC (port 6080, réseau interne seulement), puis la boucle.
rm -f /tmp/.X99-lock /tmp/.X11-unix/X99   # verrou laissé par un arrêt brutal : sans ce retrait, plus d’écran ni de navigateur
Xvfb :99 -screen 0 1366x900x24 &
sleep 1
fluxbox >/dev/null 2>&1 &
x11vnc -display :99 -forever -shared -nopw -localhost -quiet &
websockify --web /usr/share/novnc 6080 localhost:5900 >/dev/null 2>&1 &
exec python /app/serveur.py
