# 🚀 NanoBackup - Instalação no Docker Manager da Hostinger

Guia completo passo a passo para instalar o NanoBackup no Docker Manager da Hostinger VPS.

---

## 📋 Pré-requisitos

Antes de começar, certifique-se de ter:

1. ✅ **VPS Hostinger** com acesso SSH
2. ✅ **Docker Manager** habilitado no painel hPanel
3. ✅ **Acesso root** ou usuário com permissões sudo
4. ✅ **Domínio ou subdomínio** apontando para o IP do VPS (opcional, mas recomendado)

---

## 📦 PARTE 1: Preparar os Arquivos

### 1.1 - Gerar o Pacote de Build

No seu computador local (onde está o código fonte):

```bash
# 1. Navegue até a pasta do projeto
cd /caminho/para/nanobackup

# 2. Dê permissão de execução ao script
chmod +x docs/self-hosted-server/build.sh

# 3. Execute o script de build
./docs/self-hosted-server/build.sh
```

**Resultado:** Um arquivo `nanobackup-selfhosted.zip` será criado na raiz do projeto.

### 1.2 - Transferir para o Servidor

Opção A - Via SCP (Terminal):
```bash
scp nanobackup-selfhosted.zip root@SEU_IP_VPS:/root/
```

Opção B - Via SFTP (FileZilla, WinSCP):
1. Conecte ao servidor via SFTP
2. Faça upload do arquivo `nanobackup-selfhosted.zip` para `/root/`

---

## 🐳 PARTE 2: Instalar PostgreSQL Client no Docker

### 2.1 - Acessar o Servidor via SSH

```bash
ssh root@SEU_IP_VPS
```

### 2.2 - Extrair os Arquivos

```bash
# Navegue para o diretório home
cd /root

# Instale o unzip (se não tiver)
apt update && apt install -y unzip

# Extraia o pacote
unzip nanobackup-selfhosted.zip

# Entre na pasta
cd nanobackup-selfhosted
```

### 2.3 - Verificar Estrutura dos Arquivos

```bash
ls -la
```

Você deve ver:
```
drwxr-xr-x  dist/
-rw-r--r--  Dockerfile
-rw-r--r--  docker-compose.yml
-rw-r--r--  package.json
-rw-r--r--  server.js
-rw-r--r--  README.md
-rw-r--r--  INSTALL-HOSTINGER.md
```

---

## 🔧 PARTE 3: Build e Deploy com Docker

### 3.1 - Build da Imagem Docker

```bash
# Construir a imagem (pode levar alguns minutos)
docker build -t nanobackup:latest .
```

**Aguarde a conclusão.** Você verá mensagens como:
```
Step 1/15 : FROM node:20-alpine
...
Successfully built abc123def456
Successfully tagged nanobackup:latest
```

### 3.2 - Verificar se a Imagem foi Criada

```bash
docker images | grep nanobackup
```

Saída esperada:
```
nanobackup   latest   abc123def456   1 minute ago   250MB
```

### 3.3 - Iniciar o Container

**Opção A - Com Docker Compose (Recomendado):**
```bash
docker-compose up -d
```

**Opção B - Com Docker Run:**
```bash
docker run -d \
  --name nanobackup \
  --restart unless-stopped \
  -p 3000:3000 \
  -e TZ=America/Sao_Paulo \
  -v nanobackup-temp:/tmp/backups \
  nanobackup:latest
```

### 3.4 - Verificar se o Container está Rodando

```bash
docker ps
```

Saída esperada:
```
CONTAINER ID   IMAGE              COMMAND           STATUS         PORTS                    NAMES
abc123def      nanobackup:latest  "node server.js"  Up 10 seconds  0.0.0.0:3000->3000/tcp   nanobackup
```

### 3.5 - Testar a Aplicação

```bash
# Testar endpoint de saúde
curl http://localhost:3000/api/health
```

Resposta esperada:
```json
{"status":"ok","timestamp":"2024-...","pg_dump_available":true}
```

---

## 🌐 PARTE 4: Configurar Acesso Externo

### 4.1 - Verificar Firewall

```bash
# Liberar porta 3000 no firewall (se estiver usando ufw)
ufw allow 3000/tcp
ufw reload

# Ou se usar firewalld
firewall-cmd --permanent --add-port=3000/tcp
firewall-cmd --reload
```

### 4.2 - Testar Acesso Externo

No seu navegador, acesse:
```
http://SEU_IP_VPS:3000
```

A interface do NanoBackup deve aparecer.

---

## 🔒 PARTE 5: Configurar HTTPS com Nginx (Recomendado)

### 5.1 - Instalar Nginx e Certbot

```bash
apt update
apt install -y nginx certbot python3-certbot-nginx
```

### 5.2 - Criar Configuração do Nginx

```bash
nano /etc/nginx/sites-available/nanobackup
```

Cole o seguinte conteúdo (substitua `backup.seudominio.com`):

```nginx
server {
    listen 80;
    server_name backup.seudominio.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeout para backups longos
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
```

### 5.3 - Ativar o Site

```bash
ln -s /etc/nginx/sites-available/nanobackup /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

### 5.4 - Gerar Certificado SSL

```bash
certbot --nginx -d backup.seudominio.com
```

Siga as instruções na tela. O Certbot irá:
1. Verificar a propriedade do domínio
2. Gerar o certificado SSL
3. Configurar o Nginx automaticamente

### 5.5 - Testar HTTPS

Acesse no navegador:
```
https://backup.seudominio.com
```

---

## 🔄 PARTE 6: Comandos de Manutenção

### Ver Logs do Container

```bash
# Logs em tempo real
docker logs -f nanobackup

# Últimas 100 linhas
docker logs --tail 100 nanobackup
```

### Reiniciar o Container

```bash
docker restart nanobackup
```

### Parar o Container

```bash
docker stop nanobackup
```

### Remover e Recriar o Container

```bash
docker stop nanobackup
docker rm nanobackup
docker-compose up -d
```

### Atualizar a Aplicação

```bash
# 1. Pare o container atual
docker stop nanobackup

# 2. Remova o container
docker rm nanobackup

# 3. Faça upload do novo pacote e extraia
# (repita os passos da PARTE 1 e 2)

# 4. Reconstrua a imagem
docker build -t nanobackup:latest .

# 5. Inicie o novo container
docker-compose up -d
```

---

## 📊 PARTE 7: Usar o Docker Manager da Hostinger (Interface Gráfica)

Se preferir usar a interface gráfica do Docker Manager no hPanel:

### 7.1 - Acessar o Docker Manager

1. Faça login no **hPanel da Hostinger**
2. Vá em **VPS** → Selecione seu VPS
3. Clique em **Docker** no menu lateral

### 7.2 - Criar Container via Interface

1. Clique em **"Add Container"** ou **"Criar Container"**
2. Preencha os campos:

| Campo | Valor |
|-------|-------|
| **Image** | `nanobackup:latest` (após fazer o build via SSH) |
| **Container Name** | `nanobackup` |
| **Port Mapping** | Host: `3000` → Container: `3000` |
| **Restart Policy** | `Unless Stopped` |
| **Environment Variables** | `TZ=America/Sao_Paulo` |

3. Clique em **"Create"** ou **"Criar"**

### 7.3 - Monitorar via Interface

O Docker Manager mostra:
- ✅ Status do container
- 📊 Uso de CPU e memória
- 📝 Logs em tempo real
- 🔄 Opções de restart/stop

---

## ❓ Solução de Problemas

### Container não inicia

```bash
# Ver logs de erro
docker logs nanobackup

# Verificar se a porta está em uso
netstat -tlnp | grep 3000
```

### pg_dump não encontrado

A imagem Docker já inclui o PostgreSQL client. Se houver problemas:

```bash
# Entrar no container
docker exec -it nanobackup sh

# Verificar pg_dump
which pg_dump
pg_dump --version
```

### Erro de conexão com banco de dados

1. Verifique se o IP do VPS tem acesso ao servidor PostgreSQL de destino
2. Verifique as credenciais no NanoBackup
3. Teste a conexão manualmente:

```bash
docker exec -it nanobackup sh
psql -h HOST -U USER -d DATABASE -c "SELECT 1"
```

### Erro de upload FTP/SFTP

1. Verifique as credenciais do destino FTP
2. Verifique se a porta FTP/SFTP está aberta
3. Teste a conexão via interface do NanoBackup

---

## 📞 Suporte

Se encontrar problemas:

1. Verifique os logs: `docker logs nanobackup`
2. Verifique o status: `docker ps -a`
3. Verifique o endpoint de saúde: `curl http://localhost:3000/api/health`

---

**🎉 Pronto!** O NanoBackup está instalado e funcionando no seu VPS Hostinger.
