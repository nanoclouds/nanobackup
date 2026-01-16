# ============================
# 1) Build do frontend (gera dist/)
# ============================
FROM node:20-alpine AS webbuild
WORKDIR /src

# Dependências
COPY package*.json ./
RUN npm install

# Código
COPY . .

# Build do frontend (Vite)
RUN npm run build


# ============================
# 2) Runtime (produção)
# ============================
FROM node:20-alpine

LABEL maintainer="NanoBackup"
LABEL description="NanoBackup Self-Hosted - Backup PostgreSQL com pg_dump nativo"
LABEL version="1.0.0"

# pg_dump + tz
RUN apk add --no-cache \
    postgresql18-client \
    tzdata

ENV TZ=America/Sao_Paulo
WORKDIR /app

# Diretório temporário
RUN mkdir -p /tmp/backups && chmod 777 /tmp/backups

# Dependências só de produção
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

# Servidor
COPY server.js ./

# Frontend compilado
COPY --from=webbuild /src/dist ./dist

# Usuário não-root
RUN addgroup -g 1001 -S nanobackup && \
    adduser -S nanobackup -u 1001 -G nanobackup && \
    chown -R nanobackup:nanobackup /app /tmp/backups

USER nanobackup

# Variáveis padrão
ENV NODE_ENV=production
ENV PORT=3000
ENV TEMP_DIR=/tmp/backups
ENV DIST_DIR=/app/dist

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
