# =============================================================================
# NanoBackup - Dockerfile para Deploy Self-Hosted
# =============================================================================
# Imagem otimizada com Node.js + PostgreSQL Client para executar pg_dump
# =============================================================================

FROM node:20-alpine

# Metadados da imagem
LABEL maintainer="NanoBackup"
LABEL description="NanoBackup Self-Hosted - Backup PostgreSQL com pg_dump nativo"
LABEL version="1.0.0"

# Instalar PostgreSQL client (necessário para pg_dump e psql)
RUN apk add --no-cache \
    postgresql18-client \
    tzdata \
    && rm -rf /var/cache/apk/*

# Definir timezone (ajuste conforme necessário)
ENV TZ=America/Sao_Paulo

# Criar diretório da aplicação
WORKDIR /app

# Criar diretório para backups temporários
RUN mkdir -p /tmp/backups && chmod 777 /tmp/backups

# Copiar arquivos de dependências primeiro (para cache do Docker)
COPY package*.json ./

# Instalar dependências de produção
RUN npm ci --only=production && npm cache clean --force

# Copiar servidor Node.js
COPY server.js ./

# Copiar frontend compilado
COPY dist/ ./dist/

# Criar usuário não-root para segurança
RUN addgroup -g 1001 -S nanobackup && \
    adduser -S nanobackup -u 1001 -G nanobackup && \
    chown -R nanobackup:nanobackup /app /tmp/backups

# Usar usuário não-root
USER nanobackup

# Variáveis de ambiente padrão
ENV NODE_ENV=production
ENV PORT=3000
ENV TEMP_DIR=/tmp/backups
ENV DIST_DIR=/app/dist

# Expor porta
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Comando para iniciar o servidor
CMD ["node", "server.js"]
