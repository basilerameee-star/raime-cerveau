# DeepSeek Harness, l'exécutant du cerveau rAIme (paquet npm officiel @deepseek-ai/dsh, version épinglée).
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates python3 curl bash \
 && rm -rf /var/lib/apt/lists/* && npm i -g @deepseek-ai/dsh@0.1.5-rc.3
COPY executeur.mjs /app/executeur.mjs
# le dossier personnel du Harness appartient à son utilisateur (sinon : EACCES au premier démarrage)
RUN mkdir -p /home/node/.dsh && chown -R node:node /home/node/.dsh
USER node
ENV DSH_HOME=/home/node/.dsh
WORKDIR /travail
EXPOSE 8201
CMD ["node", "/app/executeur.mjs"]
