FROM node:20-alpine
WORKDIR /app
RUN npm init -y >/dev/null 2>&1 && npm install pg@8 >/dev/null 2>&1
COPY server.js index.html ./
EXPOSE 8090
CMD ["node","server.js"]
