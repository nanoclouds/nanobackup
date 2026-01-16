/**
 * Servidor Self-Hosted - NanoBackup
 * 
 * Serve o frontend React e executa backups pg_dump localmente.
 * Sem necessidade de API externa - tudo roda no mesmo servidor.
 */

const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const SftpClient = require('ssh2-sftp-client');
const ftp = require('basic-ftp');
const crypto = require('crypto');

const app = express();

/* ===== CORS MANUAL (antes das rotas) ===== */
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  next();
});
/* ========================================= */

app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 3000;
const TEMP_DIR = process.env.TEMP_DIR || '/tmp/backups';
const DIST_DIR = process.env.DIST_DIR || path.join(__dirname, 'dist');

// Armazenamento de status dos backups em memória
const backupStatus = new Map();

// Garantir que o diretório temporário existe
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// ============ API ENDPOINTS ============

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    activeBackups: backupStatus.size,
    pgDumpAvailable: isPgDumpAvailable()
  });
});

// Verificar se pg_dump está disponível
function isPgDumpAvailable() {
  try {
    require('child_process').execSync('which pg_dump', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Iniciar backup
app.post('/api/backup', async (req, res) => {
  const { executionId, database, destination, options } = req.body;
  
  if (!database || !destination) {
    return res.status(400).json({ error: 'database e destination são obrigatórios' });
  }
  
  const backupId = uuidv4();
  const databasesToBackup = options?.databases || [database.name];
  
  // Inicializar status
  backupStatus.set(backupId, {
    id: backupId,
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
  processBackup(backupId, database, destination, options);
});

// Status do backup
app.get('/api/backup/:backupId', (req, res) => {
  const status = backupStatus.get(req.params.backupId);
  if (!status) {
    return res.status(404).json({ error: 'Backup não encontrado' });
  }
  res.json(status);
});

// Cancelar backup
app.post('/api/backup/:backupId/cancel', (req, res) => {
  const status = backupStatus.get(req.params.backupId);
  if (!status) {
    return res.status(404).json({ error: 'Backup não encontrado' });
  }
  
  status.status = 'cancelled';
  status.phase = 'cancelled';
  res.json({ success: true, message: 'Backup cancelado' });
});

// Testar conexão PostgreSQL
app.post('/api/test-postgres', async (req, res) => {
  const { host, port, database, username, password, sslEnabled } = req.body;
  
  try {
    const result = await testPostgresConnection(host, port, database, username, password, sslEnabled);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Testar conexão FTP/SFTP
app.post('/api/test-ftp', async (req, res) => {
  const { protocol, host, port, username, password, baseDirectory } = req.body;
  
  try {
    const result = await testFtpConnection(protocol, host, port, username, password, baseDirectory);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ SERVIR FRONTEND REACT ============

// Servir arquivos estáticos do build React
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  
  // SPA fallback - qualquer rota não-API retorna index.html
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      return next();
    }
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

// ============ BACKUP FUNCTIONS ============

/**
 * Processa o backup de todos os bancos de dados
 */
async function processBackup(backupId, database, destination, options) {
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
    
  } catch (error) {
    console.error(`[${backupId}] Erro fatal:`, error);
    status.status = 'failed';
    status.phase = 'error';
    status.errors.push({ error: error.message });
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
      '-v'
    ];
    
    // Formato
    if (format === 'custom') {
      args.push('-Fc');
    } else if (format === 'tar') {
      args.push('-Ft');
    } else {
      args.push('-Fp');
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
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
        reject(new Error(`pg_dump falhou com código ${code}: ${stderr}`));
        return;
      }
      
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
        ...(destination.sshKey && { privateKey: destination.sshKey })
      });
      
      const dir = path.posix.dirname(remotePath);
      try {
        await sftp.mkdir(dir, true);
      } catch (e) {}
      
      await sftp.put(localPath, remotePath);
      
      return { remotePath };
    } finally {
      await sftp.end();
    }
    
  } else {
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
      
      const dir = path.posix.dirname(remotePath);
      try {
        await client.ensureDir(dir);
      } catch (e) {}
      
      await client.uploadFrom(localPath, remotePath);
      
      return { remotePath };
    } finally {
      client.close();
    }
  }
}

/**
 * Testar conexão PostgreSQL usando psql
 */
function testPostgresConnection(host, port, database, username, password, sslEnabled) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    const env = { 
      ...process.env, 
      PGPASSWORD: password 
    };
    
    if (sslEnabled) {
      env.PGSSLMODE = 'require';
    }
    
    // Usar psql para testar conexão e obter versão + bancos
    const args = [
      '-h', host,
      '-p', String(port || 5432),
      '-U', username,
      '-d', database,
      '--no-password',
      '-t', '-A',
      '-c', `SELECT json_build_object(
        'version', version(),
        'databases', (SELECT json_agg(json_build_object('name', datname, 'size', pg_size_pretty(pg_database_size(datname)))) FROM pg_database WHERE datistemplate = false)
      )`
    ];
    
    const psql = spawn('psql', args, { env });
    
    let stdout = '';
    let stderr = '';
    
    psql.stdout.on('data', (data) => { stdout += data.toString(); });
    psql.stderr.on('data', (data) => { stderr += data.toString(); });
    
    psql.on('close', (code) => {
      const latency = Date.now() - startTime;
      
      if (code !== 0) {
        resolve({ success: false, error: stderr || 'Falha na conexão' });
        return;
      }
      
      try {
        const result = JSON.parse(stdout.trim());
        resolve({
          success: true,
          latency,
          version: result.version,
          databases: result.databases
        });
      } catch (e) {
        resolve({ success: true, latency, raw: stdout });
      }
    });
    
    psql.on('error', (error) => {
      resolve({ success: false, error: error.message });
    });
  });
}

/**
 * Testar conexão FTP/SFTP
 */
async function testFtpConnection(protocol, host, port, username, password, baseDirectory) {
  const startTime = Date.now();
  
  if (protocol === 'sftp') {
    const sftp = new SftpClient();
    
    try {
      await sftp.connect({
        host,
        port: port || 22,
        username,
        password
      });
      
      // Tentar listar diretório
      const list = await sftp.list(baseDirectory || '/');
      
      return {
        success: true,
        latency: Date.now() - startTime,
        filesCount: list.length,
        writePermission: true // Assume write permission if connect succeeds
      };
    } finally {
      await sftp.end();
    }
    
  } else {
    const client = new ftp.Client();
    
    try {
      await client.access({
        host,
        port: port || 21,
        user: username,
        password,
        secure: protocol === 'ftps',
        secureOptions: { rejectUnauthorized: false }
      });
      
      // Tentar listar diretório
      const list = await client.list(baseDirectory || '/');
      
      return {
        success: true,
        latency: Date.now() - startTime,
        filesCount: list.length,
        writePermission: true
      };
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

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║             NanoBackup - Self-Hosted Server               ║
╠═══════════════════════════════════════════════════════════╣
║  URL:      http://localhost:${PORT.toString().padEnd(29)}║
║  Temp:     ${TEMP_DIR.padEnd(43)}║
║  pg_dump:  ${isPgDumpAvailable() ? 'Disponível ✓'.padEnd(43) : 'NÃO ENCONTRADO ✗'.padEnd(43)}║
║  Frontend: ${fs.existsSync(DIST_DIR) ? 'Carregado ✓'.padEnd(43) : 'Não encontrado'.padEnd(43)}║
╚═══════════════════════════════════════════════════════════╝
  `);
  
  if (!isPgDumpAvailable()) {
    console.warn('\n⚠️  AVISO: pg_dump não encontrado no PATH!');
    console.warn('   Instale: apt install postgresql-client');
  }
});
