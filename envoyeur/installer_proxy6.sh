#!/bin/sh
# Installe le relais de sortie IPv6 de l'Envoyeur (envoyeur/proxy6.py) comme service systemd sur l'hôte (07/10/2026).
set -e
cat > /etc/systemd/system/raime-proxy6.service <<UNIT
[Unit]
Description=Relais de sortie IPv6 de l'Envoyeur (jobup/jobs.ch refusent l'IPv4 du serveur)
After=network-online.target docker.service
Wants=network-online.target

[Service]
ExecStart=/usr/bin/python3 /opt/raime/raime-brain/envoyeur/proxy6.py
Restart=always
RestartSec=5
DynamicUser=yes
NoNewPrivileges=yes

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now raime-proxy6
systemctl restart raime-proxy6
sleep 1
systemctl is-active raime-proxy6
