/**
 * Servidor de Backup PostgreSQL com pg_dump nativo
 * 
 * Este servidor recebe requisições de backup, executa pg_dump,
 * e faz upload do arquivo para o destino FTP/SFTP.
 */

const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const SftpClient = require('ssh2-sftp-client');
const ftp = require('basic-ftp');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.BACKUP_API_KEY;
const TEMP_DIR = process.env.TEMP_DIR || '/tmp/backups';

// Armazenamento de status dos backups em memória
const backupStatus = new Map();

// Garantir que o diretório temporário existe
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Middleware de autenticação
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autenticação necessário' });
  }
  
  const token = authHeader.substring(7);
  if (token !== API_KEY) {
    return res.status(403).json({ error: 'Token inválido' });
  }
  
  next();
};

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    activeBackups: backupStatus.size
  });
});

// Iniciar backup
app.post('/backup', authenticate, async (req, res) => {
  const { jobId, executionId, callbackUrl, database, destination, options } = req.body;
  
  if (!database || !destination) {
    return res.status(400).json({ error: 'database e destination são obrigatórios' });
  }
  
  const backupId = uuidv4();
  const databasesToBackup = options?.databases || [database.name];
  
  // Inicializar status
  backupStatus.set(backupId, {
    id: backupId,
    jobId,
    executionId,
    status: 'running',
    phase: 'starting',
    databases: databasesToBackup,
    currentDatabase: null,
    currentDatabaseIndex: 0,
    totalDatabases: databasesToBackup.length,
    progress: 0,
    startedAt: new Date().toISOString(),
    files: [],
    errors: [],
    totalSize: 0
  });
  
  // Responder imediatamente
  res.json({ 
    success: true, 
    message: 'Backup iniciado',
    backupId 
  });
  
  // Executar backup em background
  processBackup(backupId, database, destination, options, callbackUrl);
});

// Status do backup
app.get('/status/:backupId', authenticate, (req, res) => {
  const status = backupStatus.get(req.params.backupId);
  if (!status) {
    return res.status(404).json({ error: 'Backup não encontrado' });
  }
  res.json(status);
});

// Cancelar backup
app.post('/cancel/:backupId', authenticate, (req, res) => {
  const status = backupStatus.get(req.params.backupId);
  if (!status) {
    return res.status(404).json({ error: 'Backup não encontrado' });
  }
  
  status.status = 'cancelled';
  status.phase = 'cancelled';
  res.json({ success: true, message: 'Backup cancelado' });
});

/**
 * Processa o backup de todos os bancos de dados
 */
async function processBackup(backupId, database, destination, options, callbackUrl) {
  const status = backupStatus.get(backupId);
  const databasesToBackup = options?.databases || [database.name];
  const format = options?.format || 'custom';
  const compression = options?.compression || 'gzip';
  
  try {
    for (let i = 0; i < databasesToBackup.length; i++) {
      const dbName = databasesToBackup[i];
      
      // Verificar se foi cancelado
      if (status.status === 'cancelled') {
        break;
      }
      
      status.currentDatabase = dbName;
      status.currentDatabaseIndex = i + 1;
      status.phase = 'dumping';
      status.progress = Math.round((i / databasesToBackup.length) * 100);
      
      console.log(`[${backupId}] Iniciando backup do banco: ${dbName}`);
      
      try {
        // Executar pg_dump
        const dumpResult = await executePgDump(database, dbName, format, compression);
        
        if (status.status === 'cancelled') break;
        
        status.phase = 'uploading';
        console.log(`[${backupId}] Upload do arquivo: ${dumpResult.fileName}`);
        
        // Upload para FTP/SFTP
        const uploadResult = await uploadToDestination(
          destination, 
          dumpResult.filePath, 
          dumpResult.fileName
        );
        
        // Calcular checksum
        const checksum = await calculateChecksum(dumpResult.filePath);
        
        // Registrar arquivo
        status.files.push({
          database: dbName,
          fileName: dumpResult.fileName,
          remotePath: uploadResult.remotePath,
          size: dumpResult.size,
          checksum,
          duration: dumpResult.duration
        });
        
        status.totalSize += dumpResult.size;
        
        // Limpar arquivo temporário
        fs.unlinkSync(dumpResult.filePath);
        
        console.log(`[${backupId}] Backup concluído: ${dbName} (${formatBytes(dumpResult.size)})`);
        
      } catch (dbError) {
        console.error(`[${backupId}] Erro no banco ${dbName}:`, dbError.message);
        status.errors.push({
          database: dbName,
          error: dbError.message
        });
      }
    }
    
    // Finalizar
    status.phase = status.errors.length > 0 ? 'completed_with_errors' : 'completed';
    status.status = status.errors.length === databasesToBackup.length ? 'failed' : 'success';
    status.progress = 100;
    status.completedAt = new Date().toISOString();
    
    console.log(`[${backupId}] Backup finalizado: ${status.status}`);
    
    // Callback para o Supabase
    if (callbackUrl) {
      await sendCallback(callbackUrl, status);
    }
    
  } catch (error) {
    console.error(`[${backupId}] Erro fatal:`, error);
    status.status = 'failed';
    status.phase = 'error';
    status.errors.push({ error: error.message });
    
    if (callbackUrl) {
      await sendCallback(callbackUrl, status);
    }
  }
}

/**
 * Executa pg_dump para um banco de dados
 */
function executePgDump(database, dbName, format, compression) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    // Determinar extensão baseado no formato
    let ext = '.sql';
    if (format === 'custom') ext = '.dump';
    else if (format === 'tar') ext = '.tar';
    
    // Adicionar extensão de compressão
    if (compression === 'gzip' && format !== 'custom') ext += '.gz';
    
    const fileName = `${dbName}_${timestamp}${ext}`;
    const filePath = path.join(TEMP_DIR, fileName);
    
    // Construir argumentos do pg_dump
    const args = [
      '-h', database.host,
      '-p', String(database.port || 5432),
      '-U', database.username,
      '-d', dbName,
      '--no-password',
      '-v' // verbose para logs
    ];
    
    // Formato
    if (format === 'custom') {
      args.push('-Fc'); // Custom format (já comprimido)
    } else if (format === 'tar') {
      args.push('-Ft');
    } else {
      args.push('-Fp'); // Plain SQL
    }
    
    // Compressão para formato plain
    if (format === 'sql' && compression === 'gzip') {
      args.push('-Z', '6');
    }
    
    // Arquivo de saída
    args.push('-f', filePath);
    
    // Configurar variável de ambiente para senha
    const env = { 
      ...process.env, 
      PGPASSWORD: database.password 
    };
    
    if (database.sslEnabled) {
      env.PGSSLMODE = 'require';
    }
    
    console.log(`Executando: pg_dump para ${dbName}`);
    
    const pgDump = spawn('pg_dump', args, { env });
    
    let stderr = '';
    
    pgDump.stderr.on('data', (data) => {
      stderr += data.toString();
      // Log de progresso (pg_dump -v mostra tabelas sendo processadas)
      const lines = data.toString().split('\n').filter(l => l.trim());
      lines.forEach(line => {
        if (line.includes('dumping')) {
          console.log(`  ${line.trim()}`);
        }
      });
    });
    
    pgDump.on('close', (code) => {
      const duration = Math.round((Date.now() - startTime) / 1000);
      
      if (code !== 0) {
        // Limpar arquivo parcial se existir
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
        reject(new Error(`pg_dump falhou com código ${code}: ${stderr}`));
        return;
      }
      
      // Verificar se o arquivo foi criado
      if (!fs.existsSync(filePath)) {
        reject(new Error('Arquivo de backup não foi criado'));
        return;
      }
      
      const stats = fs.statSync(filePath);
      
      resolve({
        filePath,
        fileName,
        size: stats.size,
        duration
      });
    });
    
    pgDump.on('error', (error) => {
      reject(new Error(`Erro ao executar pg_dump: ${error.message}`));
    });
  });
}

/**
 * Upload do arquivo para FTP/SFTP
 */
async function uploadToDestination(destination, localPath, fileName) {
  const remotePath = path.posix.join(destination.baseDirectory || '/', fileName);
  
  if (destination.protocol === 'sftp') {
    const sftp = new SftpClient();
    
    try {
      await sftp.connect({
        host: destination.host,
        port: destination.port || 22,
        username: destination.username,
        password: destination.password,
        // Se tiver chave SSH
        ...(destination.sshKey && { privateKey: destination.sshKey })
      });
      
      // Criar diretório se não existir
      const dir = path.posix.dirname(remotePath);
      try {
        await sftp.mkdir(dir, true);
      } catch (e) {
        // Diretório pode já existir
      }
      
      await sftp.put(localPath, remotePath);
      
      return { remotePath };
    } finally {
      await sftp.end();
    }
    
  } else {
    // FTP/FTPS
    const client = new ftp.Client();
    client.ftp.verbose = false;
    
    try {
      await client.access({
        host: destination.host,
        port: destination.port || 21,
        user: destination.username,
        password: destination.password,
        secure: destination.protocol === 'ftps',
        secureOptions: { rejectUnauthorized: false }
      });
      
      // Criar diretório se não existir
      const dir = path.posix.dirname(remotePath);
      try {
        await client.ensureDir(dir);
      } catch (e) {
        // Diretório pode já existir
      }
      
      await client.uploadFrom(localPath, remotePath);
      
      return { remotePath };
    } finally {
      client.close();
    }
  }
}

/**
 * Calcula MD5 checksum do arquivo
 */
function calculateChecksum(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(filePath);
    
    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Envia callback para o Supabase Edge Function
 */
async function sendCallback(callbackUrl, status) {
  try {
    const response = await fetch(callbackUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify(status)
    });
    
    if (!response.ok) {
      console.error('Callback falhou:', await response.text());
    }
  } catch (error) {
    console.error('Erro ao enviar callback:', error.message);
  }
}

/**
 * Formata bytes para exibição
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Limpar backups antigos do mapa a cada hora
setInterval(() => {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  for (const [id, status] of backupStatus.entries()) {
    if (new Date(status.startedAt).getTime() < oneHourAgo) {
      backupStatus.delete(id);
    }
  }
}, 60 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║         Servidor de Backup PostgreSQL Iniciado            ║
╠═══════════════════════════════════════════════════════════╣
║  Porta: ${PORT.toString().padEnd(48)}║
║  Temp:  ${TEMP_DIR.padEnd(48)}║
║  Auth:  ${API_KEY ? 'Configurado'.padEnd(48) : 'NÃO CONFIGURADO (BACKUP_API_KEY)'.padEnd(48)}║
╚═══════════════════════════════════════════════════════════╝
  `);
});
