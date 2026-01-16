#!/bin/bash

# =============================================================================
# NanoBackup - Script de Build para Deploy Self-Hosted
# =============================================================================
# Este script gera um pacote completo contendo:
# - Frontend React compilado (pasta dist/)
# - Servidor Node.js (server.js)
# - Dependências (package.json)
# - Dockerfile e docker-compose.yml
# - Documentação de instalação
# =============================================================================

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Diretório base do projeto (dois níveis acima de docs/self-hosted-server)
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BUILD_DIR="${PROJECT_ROOT}/nanobackup-selfhosted"
DOCS_DIR="$(dirname "${BASH_SOURCE[0]}")"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   NanoBackup - Build Self-Hosted      ${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Limpar build anterior
echo -e "${YELLOW}[1/6] Limpando build anterior...${NC}"
rm -rf "${BUILD_DIR}"
mkdir -p "${BUILD_DIR}"

# Build do frontend React
echo -e "${YELLOW}[2/6] Compilando frontend React...${NC}"
cd "${PROJECT_ROOT}"
npm run build

# Copiar arquivos do servidor
echo -e "${YELLOW}[3/6] Copiando arquivos do servidor...${NC}"
cp "${DOCS_DIR}/server.js" "${BUILD_DIR}/"
cp "${DOCS_DIR}/package.json" "${BUILD_DIR}/"
cp "${DOCS_DIR}/Dockerfile" "${BUILD_DIR}/" 2>/dev/null || echo "Dockerfile será criado"
cp "${DOCS_DIR}/docker-compose.yml" "${BUILD_DIR}/" 2>/dev/null || echo "docker-compose.yml será criado"
cp "${DOCS_DIR}/.dockerignore" "${BUILD_DIR}/" 2>/dev/null || echo ".dockerignore será criado"

# Copiar frontend compilado
echo -e "${YELLOW}[4/6] Copiando frontend compilado...${NC}"
cp -r "${PROJECT_ROOT}/dist" "${BUILD_DIR}/"

# Copiar documentação
echo -e "${YELLOW}[5/6] Copiando documentação...${NC}"
cp "${DOCS_DIR}/README.md" "${BUILD_DIR}/"
cp "${DOCS_DIR}/INSTALL-HOSTINGER.md" "${BUILD_DIR}/" 2>/dev/null || echo "Documentação Hostinger será incluída"

# Criar arquivo de versão
echo -e "${YELLOW}[6/6] Gerando metadados...${NC}"
echo "BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")" > "${BUILD_DIR}/.build-info"
echo "BUILD_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')" >> "${BUILD_DIR}/.build-info"

# Criar arquivo zip para deploy
echo -e "${YELLOW}Criando pacote zip...${NC}"
cd "${PROJECT_ROOT}"
zip -r "nanobackup-selfhosted.zip" "nanobackup-selfhosted" -x "*.git*"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}   Build concluído com sucesso!        ${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "Arquivos gerados:"
echo -e "  📁 ${BUILD_DIR}/"
echo -e "  📦 ${PROJECT_ROOT}/nanobackup-selfhosted.zip"
echo ""
echo -e "Próximos passos:"
echo -e "  1. Faça upload do arquivo ${YELLOW}nanobackup-selfhosted.zip${NC} para seu servidor"
echo -e "  2. Siga as instruções em ${YELLOW}INSTALL-HOSTINGER.md${NC} para deploy no Docker"
echo ""
