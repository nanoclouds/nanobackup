# NanoBackup - Self-Hosted Server

Servidor para rodar o NanoBackup em seu próprio servidor, executando backups via `pg_dump` nativo.

## Requisitos

- Node.js 18+
- PostgreSQL client tools (`pg_dump`, `psql`)
- Acesso de rede ao PostgreSQL e FTP de destino

## Instalação Rápida

```bash
# 1. Clonar/copiar os arquivos
mkdir nanobackup && cd nanobackup

# 2. Copiar server.js e package.json deste diretório

# 3. Instalar dependências
npm install

# 4. Copiar o build do frontend (pasta dist/)
# Execute "npm run build" no projeto principal e copie a pasta dist/ para cá

# 5. Instalar PostgreSQL client (se ainda não tiver)
# Ubuntu/Debian:
sudo apt install postgresql-client

# CentOS/RHEL:
sudo yum install postgresql

# 6. Iniciar servidor
npm start
```

## Estrutura de Arquivos

```
nanobackup/
├── server.js       # Servidor Node.js
├── package.json    # Dependências
├── dist/           # Build do frontend React (copiar após npm run build)
│   ├── index.html
│   └── assets/
└── /tmp/backups/   # Arquivos temporários (configurável)
```

## Configuração

Variáveis de ambiente opcionais:

```bash
# Porta do servidor (padrão: 3000)
export PORT=3000

# Diretório temporário para backups (padrão: /tmp/backups)
export TEMP_DIR=/var/backups/temp

# Diretório do frontend build (padrão: ./dist)
export DIST_DIR=/path/to/dist
```

## Endpoints da API

### GET /api/health
Verifica status do servidor.

```bash
curl http://localhost:3000/api/health
```

### POST /api/backup
Inicia um backup.

```bash
curl -X POST http://localhost:3000/api/backup \
  -H "Content-Type: application/json" \
  -d '{
    "database": {
      "host": "localhost",
      "port": 5432,
      "name": "meu_banco",
      "username": "postgres",
      "password": "senha"
    },
    "destination": {
      "protocol": "sftp",
      "host": "ftp.exemplo.com",
      "port": 22,
      "username": "ftpuser",
      "password": "ftpsenha",
      "baseDirectory": "/backups"
    },
    "options": {
      "format": "custom",
      "compression": "gzip",
      "databases": ["banco1", "banco2"]
    }
  }'
```

### GET /api/backup/:backupId
Verifica status de um backup.

### POST /api/backup/:backupId/cancel
Cancela um backup em andamento.

### POST /api/test-postgres
Testa conexão com PostgreSQL.

### POST /api/test-ftp
Testa conexão com FTP/SFTP.

## Produção com PM2

```bash
# Instalar PM2
npm install -g pm2

# Iniciar com PM2
pm2 start server.js --name nanobackup

# Configurar auto-start
pm2 save
pm2 startup
```

## Docker

```dockerfile
FROM node:18-alpine

# Instalar pg_dump
RUN apk add --no-cache postgresql-client

WORKDIR /app

# Instalar dependências
COPY package*.json ./
RUN npm ci --only=production

# Copiar servidor
COPY server.js ./

# Copiar frontend build
COPY dist/ ./dist/

EXPOSE 3000

CMD ["node", "server.js"]
```

```bash
# Build
docker build -t nanobackup .

# Run
docker run -d -p 3000:3000 --name nanobackup nanobackup
```

## Nginx Reverse Proxy (HTTPS)

```nginx
server {
    listen 443 ssl;
    server_name backup.seudominio.com;

    ssl_certificate /etc/ssl/certs/seu-certificado.crt;
    ssl_certificate_key /etc/ssl/private/sua-chave.key;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Segurança

1. **Use HTTPS** em produção (configure com nginx/caddy)
2. **Firewall**: Limite acesso apenas a IPs autorizados
3. **Rede**: Mantenha o servidor na mesma rede que os bancos PostgreSQL
4. **Autenticação**: Configure autenticação no seu proxy reverso se necessário
