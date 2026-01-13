# Servidor Externo de Backup PostgreSQL

Este servidor executa backups nativos usando `pg_dump` e faz upload para destinos FTP/SFTP.

## Requisitos

- Node.js 18+
- PostgreSQL client tools (`pg_dump`)
- Acesso de rede ao PostgreSQL e FTP de destino

## Instalação

```bash
# Clonar os arquivos para seu servidor
mkdir backup-server && cd backup-server

# Instalar dependências
npm init -y
npm install express cors ssh2-sftp-client basic-ftp uuid

# Copiar os arquivos server.js e package.json desta pasta
```

## Configuração

Defina a variável de ambiente para autenticação:

```bash
export BACKUP_API_KEY="sua-chave-secreta-aqui"
```

## Execução

```bash
# Desenvolvimento
node server.js

# Produção (com PM2)
npm install -g pm2
pm2 start server.js --name backup-server
pm2 save
pm2 startup
```

## Endpoints

### POST /backup
Inicia um backup completo usando pg_dump.

**Headers:**
- `Authorization: Bearer {BACKUP_API_KEY}`
- `Content-Type: application/json`

**Body:**
```json
{
  "jobId": "uuid-do-job",
  "executionId": "uuid-da-execucao",
  "callbackUrl": "https://seu-projeto.supabase.co/functions/v1/backup-callback",
  "database": {
    "host": "192.168.1.100",
    "port": 5432,
    "name": "meu_banco",
    "username": "postgres",
    "password": "senha",
    "sslEnabled": false
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
}
```

**Response:**
```json
{
  "success": true,
  "message": "Backup iniciado",
  "backupId": "uuid-gerado"
}
```

### GET /status/:backupId
Verifica o status de um backup em andamento.

### GET /health
Health check do servidor.

## Segurança

1. **Use HTTPS** em produção (configure com nginx/caddy)
2. **Firewall**: Permita apenas IPs do Supabase Edge Functions
3. **API Key**: Use uma chave forte e rotacione regularmente
4. **Rede**: Idealmente, o servidor deve estar na mesma rede que os bancos PostgreSQL

## Exemplo com Docker

```dockerfile
FROM node:18-alpine

# Instalar pg_dump
RUN apk add --no-cache postgresql-client

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY server.js ./

EXPOSE 3000
CMD ["node", "server.js"]
```

```bash
docker build -t backup-server .
docker run -d -p 3000:3000 -e BACKUP_API_KEY=sua-chave backup-server
```
