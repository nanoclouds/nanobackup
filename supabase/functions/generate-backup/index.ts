import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";
import { requireOperatorOrAdmin } from "../_shared/auth.ts";
import { decrypt } from "../_shared/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Configuration
const TABLE_TIMEOUT_MS = 120000; // 2 minutes per table

// ============= SAFE BASE64 ENCODING (avoids stack overflow) =============
function safeBase64Encode(bytes: Uint8Array): string {
  const CHUNK_SIZE = 8192; // Process 8KB at a time to avoid stack overflow
  let result = '';
  
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.slice(i, Math.min(i + CHUNK_SIZE, bytes.length));
    result += String.fromCharCode.apply(null, Array.from(chunk));
  }
  
  return btoa(result);
}

interface TableDependency {
  tableName: string;
  referencedTables: string[];
  rowCount: number;
}

interface SequenceInfo {
  sequenceName: string;
  tableName: string;
  columnName: string;
  currentValue: number;
}

// ============= TOPOLOGICAL SORT FOR FK DEPENDENCIES =============

function topologicalSort(tables: TableDependency[]): string[] {
  const sorted: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  
  const tableMap = new Map<string, TableDependency>();
  tables.forEach(t => tableMap.set(t.tableName, t));
  
  function visit(tableName: string): boolean {
    if (visited.has(tableName)) return true;
    if (visiting.has(tableName)) {
      console.log(`Circular dependency detected for table: ${tableName}`);
      return true;
    }
    
    visiting.add(tableName);
    
    const table = tableMap.get(tableName);
    if (table) {
      for (const ref of table.referencedTables) {
        if (tableMap.has(ref)) {
          visit(ref);
        }
      }
    }
    
    visiting.delete(tableName);
    visited.add(tableName);
    sorted.push(tableName);
    return true;
  }
  
  for (const table of tables) {
    if (!visited.has(table.tableName)) {
      visit(table.tableName);
    }
  }
  
  return sorted;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let pgClient: Client | null = null;

  try {
    const authHeader = req.headers.get("Authorization");
    
    await requireOperatorOrAdmin(
      authHeader,
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader! } } }
    );

    const { 
      instanceId, 
      databaseName, 
      format = 'sql', 
      includeData = true,
      getMetadataOnly = false,
      tableName: requestedTable = null, // Process specific table
      tableIndex = null as number | null, // Table index for progress tracking
    } = await req.json();
    
    if (!instanceId) throw new Error("instanceId is required");

    const { data: instance, error: instanceError } = await supabaseClient
      .from("postgres_instances")
      .select("*")
      .eq("id", instanceId)
      .single();

    if (instanceError || !instance) throw new Error("Instance not found");

    const targetDb = databaseName || instance.database;
    
    const decryptedPassword = await decrypt(instance.password);
    
    pgClient = new Client({
      hostname: instance.host,
      port: instance.port,
      user: instance.username,
      password: decryptedPassword,
      database: targetDb,
      tls: instance.ssl_enabled ? { enabled: true, enforce: false } : undefined,
      connection: { attempts: 1 },
    });

    await pgClient.connect();
    console.log(`Connected to ${instance.host}:${instance.port}/${targetDb}`);

    // ============= GET FOREIGN KEY DEPENDENCIES =============
    const fkResult = await pgClient.queryObject<{
      table_name: string;
      referenced_table: string;
    }>(`
      SELECT DISTINCT
        tc.table_name,
        ccu.table_name AS referenced_table
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage ccu 
        ON tc.constraint_name = ccu.constraint_name
      WHERE tc.table_schema = 'public' 
        AND tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name != ccu.table_name
    `);
    
    // Build dependency map
    const dependencyMap = new Map<string, string[]>();
    for (const row of fkResult.rows) {
      const deps = dependencyMap.get(row.table_name) || [];
      deps.push(row.referenced_table);
      dependencyMap.set(row.table_name, deps);
    }

    // Get all tables with row counts
    const tablesResult = await pgClient.queryObject<{ table_name: string }>(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    const tableDependencies: TableDependency[] = [];
    const tableCounts: { [key: string]: number } = {};
    let totalRows = 0;
    
    for (const t of tablesResult.rows) {
      const countResult = await pgClient.queryObject<{ cnt: number }>(
        `SELECT COUNT(*)::int as cnt FROM public."${t.table_name}"`
      );
      const count = countResult.rows[0]?.cnt || 0;
      tableCounts[t.table_name] = count;
      totalRows += count;
      
      tableDependencies.push({
        tableName: t.table_name,
        referencedTables: dependencyMap.get(t.table_name) || [],
        rowCount: count,
      });
    }
    
    // Sort tables by FK dependencies (referenced tables first)
    const sortedTableNames = topologicalSort(tableDependencies);
    const totalTables = sortedTableNames.length;
    
    console.log(`Tables sorted by FK dependencies: ${sortedTableNames.join(', ')}`);

    // ============= GET SEQUENCES =============
    const sequencesResult = await pgClient.queryObject<{
      sequence_name: string;
      table_name: string;
      column_name: string;
    }>(`
      SELECT 
        s.relname as sequence_name,
        t.relname as table_name,
        a.attname as column_name
      FROM pg_class s
      JOIN pg_depend d ON d.objid = s.oid
      JOIN pg_class t ON t.oid = d.refobjid
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
      WHERE s.relkind = 'S'
        AND t.relkind = 'r'
        AND t.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    `);
    
    const sequences: SequenceInfo[] = [];
    for (const seq of sequencesResult.rows) {
      try {
        const valResult = await pgClient.queryObject<{ last_value: number }>(
          `SELECT last_value FROM public."${seq.sequence_name}"`
        );
        sequences.push({
          sequenceName: seq.sequence_name,
          tableName: seq.table_name,
          columnName: seq.column_name,
          currentValue: valResult.rows[0]?.last_value || 1,
        });
      } catch {
        console.log(`Could not read sequence ${seq.sequence_name}`);
      }
    }
    
    console.log(`Found ${sequences.length} sequences`);

    // ============= METADATA ONLY =============
    if (getMetadataOnly) {
      await pgClient.end();
      return new Response(
        JSON.stringify({
          success: true,
          metadata: {
            totalTables,
            totalRows,
            tables: sortedTableNames.map((t, idx) => ({ 
              name: t, 
              rows: tableCounts[t],
              index: idx,
              dependencies: dependencyMap.get(t) || []
            })),
            sequences: sequences.length,
            database: targetDb
          }
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============= PROCESS SINGLE TABLE =============
    if (requestedTable) {
      const tableName = requestedTable;
      const tableRowCount = tableCounts[tableName] || 0;
      const startTime = Date.now();
      const sqlParts: string[] = [];
      
      console.log(`Processing table: ${tableName} (${tableRowCount} rows)`);
      
      try {
        // Get columns
        const columnsResult = await pgClient.queryObject<{
          column_name: string;
          data_type: string;
          is_nullable: string;
          column_default: string | null;
          character_maximum_length: number | null;
          udt_name: string;
        }>(`
          SELECT column_name, data_type, is_nullable, column_default, character_maximum_length, udt_name
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1
          ORDER BY ordinal_position
        `, [tableName]);

        const columns = columnsResult.rows;
        if (columns.length === 0) {
          throw new Error(`Table ${tableName} not found or has no columns`);
        }

        // Get primary key
        const pkResult = await pgClient.queryObject<{ column_name: string }>(`
          SELECT kcu.column_name FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
          WHERE tc.table_schema = 'public' AND tc.table_name = $1 AND tc.constraint_type = 'PRIMARY KEY'
        `, [tableName]);
        
        // Get unique constraints
        const uniqueResult = await pgClient.queryObject<{ 
          constraint_name: string; 
          column_name: string 
        }>(`
          SELECT tc.constraint_name, kcu.column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
          WHERE tc.table_schema = 'public' AND tc.table_name = $1 AND tc.constraint_type = 'UNIQUE'
          ORDER BY tc.constraint_name, kcu.ordinal_position
        `, [tableName]);
        
        // Get indexes
        const indexResult = await pgClient.queryObject<{
          indexname: string;
          indexdef: string;
        }>(`
          SELECT indexname, indexdef 
          FROM pg_indexes 
          WHERE schemaname = 'public' AND tablename = $1
            AND indexname NOT LIKE '%_pkey'
        `, [tableName]);

        // Build CREATE TABLE
        const columnDefs = columns.map(col => {
          let typeDef = col.data_type.toUpperCase();
          
          if (col.data_type === 'ARRAY') {
            typeDef = col.udt_name.replace('_', '') + '[]';
          } else if (col.character_maximum_length) {
            typeDef = `${typeDef}(${col.character_maximum_length})`;
          }
          
          if (col.is_nullable === 'NO') typeDef += ' NOT NULL';
          if (col.column_default) typeDef += ` DEFAULT ${col.column_default}`;
          return `  "${col.column_name}" ${typeDef}`;
        });

        if (pkResult.rows.length > 0) {
          const pkCols = pkResult.rows.map(r => `"${r.column_name}"`).join(', ');
          columnDefs.push(`  PRIMARY KEY (${pkCols})`);
        }
        
        // Group unique constraints
        const uniqueGroups = new Map<string, string[]>();
        for (const u of uniqueResult.rows) {
          const cols = uniqueGroups.get(u.constraint_name) || [];
          cols.push(`"${u.column_name}"`);
          uniqueGroups.set(u.constraint_name, cols);
        }
        for (const [, cols] of uniqueGroups) {
          columnDefs.push(`  UNIQUE (${cols.join(', ')})`);
        }

        sqlParts.push(`-- Tabela: ${tableName} (${tableRowCount} registros)\n`);
        sqlParts.push(`DROP TABLE IF EXISTS public."${tableName}" CASCADE;\n`);
        sqlParts.push(`CREATE TABLE public."${tableName}" (\n${columnDefs.join(',\n')}\n);\n`);
        
        // Add indexes
        for (const idx of indexResult.rows) {
          sqlParts.push(`${idx.indexdef};\n`);
        }
        
        sqlParts.push('\n');

        // Insert ALL data at once
        if (includeData && tableRowCount > 0) {
          const columnNames = columns.map(c => `"${c.column_name}"`).join(', ');
          const selectCols = columns.map(c => `"${c.column_name}"::text`).join(', ');
          const orderClause = pkResult.rows.length > 0 
            ? `ORDER BY ${pkResult.rows.map(r => `"${r.column_name}"`).join(', ')}`
            : '';
          
          console.log(`Fetching all ${tableRowCount} rows from ${tableName}...`);
          
          const dataResult = await pgClient.queryArray(
            `SELECT ${selectCols} FROM public."${tableName}" ${orderClause}`
          );
          
          console.log(`Fetched ${dataResult.rows.length} rows, generating INSERTs...`);
          
          let insertCount = 0;
          for (const row of dataResult.rows) {
            const valuesParts: string[] = [];
            for (let idx = 0; idx < row.length; idx++) {
              const escapedVal = escapeSqlValueFromText(row[idx], columns[idx].data_type, columns[idx].udt_name);
              valuesParts.push(escapedVal);
            }
            const vals = valuesParts.join(', ');
            sqlParts.push(`INSERT INTO public."${tableName}" (${columnNames}) VALUES (${vals});\n`);
            insertCount++;
          }
          
          console.log(`Generated ${insertCount} INSERT statements`);
        }
        
        await pgClient.end();
        
        const sqlContent = sqlParts.join('');
        const contentBytes = new TextEncoder().encode(sqlContent);
        const duration = Date.now() - startTime;
        
        const hashBuffer = await crypto.subtle.digest("SHA-256", contentBytes);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const checksum = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
        
        // Encode content as base64 to prevent JSON serialization corruption
        const base64Content = safeBase64Encode(contentBytes);
        
        console.log(`Table ${tableName} complete: ${tableRowCount} rows, ${(contentBytes.length / 1024).toFixed(2)} KB in ${duration}ms`);

        return new Response(
          JSON.stringify({
            success: true,
            contentBase64: base64Content,
            stats: {
              tableName,
              tableIndex,
              totalTables,
              rowCount: tableRowCount,
              size: contentBytes.length,
              duration,
              database: targetDb,
              checksum,
            }
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
        
      } catch (tableError) {
        console.error(`Error processing table ${tableName}:`, tableError);
        await pgClient.end();
        
        return new Response(
          JSON.stringify({
            success: false,
            message: `Erro na tabela ${tableName}: ${tableError instanceof Error ? tableError.message : 'Unknown'}`
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ============= GENERATE HEADER =============
    if (tableIndex === -1) {
      await pgClient.end();
      
      const header = `--
-- Backup PostgreSQL (Restaurável)
-- Gerado por Lovable Backup System
-- Host: ${instance.host}:${instance.port}
-- Database: ${targetDb}
-- Data: ${new Date().toISOString()}
-- Total Tabelas: ${totalTables}
-- Total Registros: ${totalRows}
-- Sequences: ${sequences.length}
-- Tabelas ordenadas por dependências FK
--

SET statement_timeout = 0;
SET lock_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET row_security = off;

-- Desabilitar triggers e FK checks para carga segura
SET session_replication_role = 'replica';

`;
      
      const headerBytes = new TextEncoder().encode(header);
      const base64Header = safeBase64Encode(headerBytes);
      
      return new Response(
        JSON.stringify({
          success: true,
          contentBase64: base64Header,
          type: 'header',
          stats: { totalTables, totalRows, sequencesCount: sequences.length }
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============= GENERATE FOOTER =============
    if (tableIndex === -2) {
      const footerParts: string[] = [];
      
      // Add sequence resets
      if (sequences.length > 0) {
        footerParts.push(`\n-- Reset sequences para valores atuais\n`);
        for (const seq of sequences) {
          footerParts.push(`SELECT setval('public."${seq.sequenceName}"', ${seq.currentValue}, true);\n`);
        }
      }
      
      // Add FK constraints info
      const fkTables = Array.from(dependencyMap.keys());
      if (fkTables.length > 0) {
        footerParts.push(`\n-- Tabelas com FK constraints (ordem de dependência):\n`);
        for (const table of fkTables) {
          const refs = dependencyMap.get(table) || [];
          footerParts.push(`-- ${table} -> ${refs.join(', ')}\n`);
        }
      }
      
      footerParts.push(`

-- Re-habilitar triggers e FK checks
SET session_replication_role = 'origin';

--
-- Backup completo
-- ${totalRows} registros de ${totalTables} tabelas
-- ${sequences.length} sequences resetados
--
`);

      await pgClient.end();
      
      const footerContent = footerParts.join('');
      const footerBytes = new TextEncoder().encode(footerContent);
      const base64Footer = safeBase64Encode(footerBytes);
      
      return new Response(
        JSON.stringify({
          success: true,
          contentBase64: base64Footer,
          type: 'footer',
          stats: { totalTables, totalRows, sequencesCount: sequences.length }
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // No specific action requested
    await pgClient.end();
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Especifique: getMetadataOnly, tableName, ou tableIndex (-1 header, -2 footer)'
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Backup error:", errorMessage);
    
    if (pgClient) {
      try { await pgClient.end(); } catch { /* ignore */ }
    }

    return new Response(
      JSON.stringify({ success: false, message: errorMessage }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Escape SQL value from text representation
function escapeSqlValueFromText(value: unknown, dataType: string, udtName: string = ''): string {
  if (value === null || value === undefined) return 'NULL';
  
  const strValue = String(value);
  
  if (strValue === '' || strValue === 'null' || strValue === 'undefined') {
    if (dataType.includes('char') || dataType === 'text' || dataType === 'name') {
      return "''";
    }
    return 'NULL';
  }
  
  // Handle boolean
  if (dataType === 'boolean') {
    const lower = strValue.toLowerCase();
    if (lower === 't' || lower === 'true' || strValue === '1') return 'TRUE';
    if (lower === 'f' || lower === 'false' || strValue === '0') return 'FALSE';
    return 'NULL';
  }
  
  // Handle numeric types
  if (dataType.includes('int') || dataType.includes('numeric') || dataType.includes('decimal') || 
      dataType === 'real' || dataType === 'double precision' || dataType === 'money') {
    const cleanValue = strValue.replace(/,/g, '.').trim();
    if (cleanValue === '' || isNaN(Number(cleanValue.replace(/[^\d.-]/g, '')))) {
      return 'NULL';
    }
    return cleanValue;
  }
  
  // Handle UUID
  if (dataType === 'uuid' || udtName === 'uuid') {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(strValue)) {
      return 'NULL';
    }
    return `'${strValue}'`;
  }
  
  // Handle JSON/JSONB
  if (dataType === 'json' || dataType === 'jsonb' || udtName === 'json' || udtName === 'jsonb') {
    try {
      JSON.parse(strValue);
      return escapeStringValue(strValue);
    } catch {
      return "'{}'";
    }
  }
  
  // Handle arrays
  if (dataType === 'ARRAY' || udtName.startsWith('_')) {
    return escapeStringValue(strValue);
  }
  
  // Handle bytea/binary
  if (dataType === 'bytea') {
    if (strValue.length > 20000) {
      return `'[BINARY_DATA_TRUNCATED_${strValue.length}_CHARS]'`;
    }
    return escapeStringValue(strValue);
  }
  
  // Handle all other types as strings
  return escapeStringValue(strValue);
}

// Escape string values for SQL
function escapeStringValue(value: string): string {
  let finalValue = value;
  
  // Truncate very long strings (2MB max)
  if (finalValue.length > 2000000) {
    finalValue = finalValue.substring(0, 2000000) + '...[TRUNCATED]';
  }
  
  // Remove null bytes and control characters
  finalValue = finalValue.replace(/\x00/g, '');
  finalValue = finalValue.replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  
  // Escape backslashes FIRST
  finalValue = finalValue.replace(/\\/g, '\\\\');
  
  // Escape single quotes
  finalValue = finalValue.replace(/'/g, "''");
  
  // Convert newlines to spaces (prevents SQL statement corruption)
  finalValue = finalValue.replace(/\r\n/g, ' ');
  finalValue = finalValue.replace(/\n/g, ' ');
  finalValue = finalValue.replace(/\r/g, ' ');
  finalValue = finalValue.replace(/\t/g, ' ');
  
  // Remove remaining problematic characters
  finalValue = finalValue.replace(/[\u0000-\u001F]/g, '');
  
  // Collapse multiple spaces
  finalValue = finalValue.replace(/  +/g, ' ');
  
  // Trim
  finalValue = finalValue.trim();
  
  if (finalValue === '') {
    return "''";
  }
  
  return `'${finalValue}'`;
}
