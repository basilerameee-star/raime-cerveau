FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client python3 openssl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /deps
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
USER node
WORKDIR /work
