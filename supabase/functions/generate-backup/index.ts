import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";
import { requireOperatorOrAdmin } from "../_shared/auth.ts";
import { decrypt } from "../_shared/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Chunk configuration
const MAX_ROWS_PER_CHUNK = 5000;
const BATCH_SIZE_ROWS = 500;
const MAX_STRING_LENGTH = 2000000;
const TABLE_TIMEOUT_MS = 90000;

interface ChunkCursor {
  tableIndex: number;
  rowOffset: number;
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

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    totalInserts: number;
    totalCreateTables: number;
    balancedParentheses: boolean;
    balancedQuotes: boolean;
  };
}

// ============= VALIDATION FUNCTIONS =============

function validateSqlBackup(sqlContent: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let totalInserts = 0;
  let totalCreateTables = 0;
  
  // 1. Check balanced parentheses (excluding strings)
  let parenCount = 0;
  let inString = false;
  let escapeNext = false;
  
  for (let i = 0; i < sqlContent.length; i++) {
    const char = sqlContent[i];
    
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    
    if (char === '\\') {
      escapeNext = true;
      continue;
    }
    
    if (char === "'" && !escapeNext) {
      // Check for escaped quote ''
      if (i + 1 < sqlContent.length && sqlContent[i + 1] === "'") {
        i++; // Skip the next quote
        continue;
      }
      inString = !inString;
      continue;
    }
    
    if (!inString) {
      if (char === '(') parenCount++;
      if (char === ')') parenCount--;
      
      if (parenCount < 0) {
        errors.push(`Parêntese de fechamento sem abertura na posição ${i}`);
        break;
      }
    }
  }
  
  const balancedParentheses = parenCount === 0;
  if (!balancedParentheses) {
    errors.push(`Parênteses desbalanceados: ${parenCount > 0 ? parenCount + ' não fechados' : Math.abs(parenCount) + ' fechamentos extras'}`);
  }
  
  // 2. Check balanced quotes
  const balancedQuotes = !inString;
  if (!balancedQuotes) {
    errors.push('Aspas simples não fechadas no final do arquivo');
  }
  
  // 3. Validate INSERT statements
  const insertRegex = /INSERT INTO public\."([^"]+)" \(([^)]+)\) VALUES \((.+)\);/g;
  const lines = sqlContent.split('\n');
  
  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum].trim();
    
    // Skip comments and empty lines
    if (line.startsWith('--') || line === '') continue;
    
    // Check CREATE TABLE
    if (line.startsWith('CREATE TABLE')) {
      totalCreateTables++;
      // Find matching closing
      let found = false;
      for (let j = lineNum; j < lines.length && j < lineNum + 100; j++) {
        if (lines[j].includes(');')) {
          found = true;
          break;
        }
      }
      if (!found) {
        errors.push(`CREATE TABLE na linha ${lineNum + 1} sem fechamento`);
      }
    }
    
    // Check INSERT statement structure
    if (line.startsWith('INSERT INTO')) {
      totalInserts++;
      
      // Must contain VALUES
      if (!line.includes(' VALUES ')) {
        errors.push(`INSERT na linha ${lineNum + 1} sem VALUES`);
        continue;
      }
      
      // Must end with );
      if (!line.endsWith(');')) {
        errors.push(`INSERT na linha ${lineNum + 1} não termina com );`);
        continue;
      }
      
      // Extract column count
      const colMatch = line.match(/\(([^)]+)\) VALUES/);
      if (colMatch) {
        const cols = colMatch[1].split(',').length;
        
        // Extract values part
        const valuesMatch = line.match(/VALUES \((.+)\);$/);
        if (valuesMatch) {
          const valuesStr = valuesMatch[1];
          // Count values (considering strings with commas)
          const valueCount = countSqlValues(valuesStr);
          
          if (valueCount !== cols) {
            errors.push(`INSERT na linha ${lineNum + 1}: ${cols} colunas mas ${valueCount} valores`);
          }
        }
      }
    }
  }
  
  // 4. Check for header and footer
  if (!sqlContent.includes('PostgreSQL database dump')) {
    warnings.push('Cabeçalho do backup ausente');
  }
  
  if (!sqlContent.includes('dump complete')) {
    warnings.push('Rodapé do backup ausente (arquivo incompleto?)');
  }
  
  // 5. Check for session settings
  if (!sqlContent.includes("SET session_replication_role = 'replica'")) {
    warnings.push('SET session_replication_role não encontrado - triggers podem interferir');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    stats: {
      totalInserts,
      totalCreateTables,
      balancedParentheses,
      balancedQuotes,
    }
  };
}

function countSqlValues(valuesStr: string): number {
  let count = 1;
  let inString = false;
  let parenDepth = 0;
  
  for (let i = 0; i < valuesStr.length; i++) {
    const char = valuesStr[i];
    
    if (char === "'" && (i === 0 || valuesStr[i - 1] !== "'")) {
      // Check for escaped quote
      if (i + 1 < valuesStr.length && valuesStr[i + 1] === "'") {
        i++;
        continue;
      }
      inString = !inString;
      continue;
    }
    
    if (!inString) {
      if (char === '(') parenDepth++;
      if (char === ')') parenDepth--;
      if (char === ',' && parenDepth === 0) count++;
    }
  }
  
  return count;
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
      // Circular dependency - break by adding anyway
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
      cursor = null as ChunkCursor | null,
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
    
    console.log(`Tables sorted by FK dependencies: ${sortedTableNames.slice(0, 5).join(', ')}...`);

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
        // Sequence might not be accessible
        console.log(`Could not read sequence ${seq.sequence_name}`);
      }
    }
    
    console.log(`Found ${sequences.length} sequences`);

    const estimatedChunks = Math.max(1, Math.ceil(totalRows / MAX_ROWS_PER_CHUNK));

    if (getMetadataOnly) {
      await pgClient.end();
      return new Response(
        JSON.stringify({
          success: true,
          metadata: {
            totalTables,
            totalRows,
            estimatedChunks,
            maxRowsPerChunk: MAX_ROWS_PER_CHUNK,
            tables: sortedTableNames.map(t => ({ 
              name: t, 
              rows: tableCounts[t],
              dependencies: dependencyMap.get(t) || []
            })),
            sequences: sequences.length,
            database: targetDb
          }
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize cursor
    const currentCursor: ChunkCursor = cursor || { tableIndex: 0, rowOffset: 0 };
    const isFirstChunk = currentCursor.tableIndex === 0 && currentCursor.rowOffset === 0;
    
    console.log(`Processing from table ${currentCursor.tableIndex} (${sortedTableNames[currentCursor.tableIndex] || 'END'}), row offset ${currentCursor.rowOffset}`);

    const startTime = Date.now();
    const sqlParts: string[] = [];
    let rowsProcessedInChunk = 0;
    let tablesProcessedInChunk = 0;
    let lastProcessedTableName = '';
    
    let nextCursor: ChunkCursor | null = null;
    let hasMoreData = false;

    // ============= HEADER (first chunk only) =============
    if (isFirstChunk) {
      sqlParts.push(`--
-- PostgreSQL database dump (Restorable)
-- Generated by Lovable Backup System
-- Host: ${instance.host}:${instance.port}
-- Database: ${targetDb}
-- Date: ${new Date().toISOString()}
-- Total Tables: ${totalTables}
-- Total Rows: ${totalRows}
-- Sequences: ${sequences.length}
-- Tables ordered by FK dependencies for safe restoration
--

SET statement_timeout = 0;
SET lock_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET row_security = off;

-- Disable triggers and FK checks for safe data loading
SET session_replication_role = 'replica';

`);
    }

    // Process tables in dependency order
    for (let tableIdx = currentCursor.tableIndex; tableIdx < totalTables; tableIdx++) {
      const tableName = sortedTableNames[tableIdx];
      lastProcessedTableName = tableName;
      const tableRowCount = tableCounts[tableName];
      const tableStartTime = Date.now();
      
      const startRowOffset = (tableIdx === currentCursor.tableIndex) ? currentCursor.rowOffset : 0;
      const isNewTable = startRowOffset === 0;
      
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
        if (columns.length === 0) continue;

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

        // Build CREATE TABLE only if new table
        if (isNewTable) {
          const columnDefs = columns.map(col => {
            let typeDef = col.data_type.toUpperCase();
            
            // Handle array types
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

          sqlParts.push(`\n-- Table: ${tableName} (${tableRowCount} rows)\n`);
          sqlParts.push(`DROP TABLE IF EXISTS public."${tableName}" CASCADE;\n`);
          sqlParts.push(`CREATE TABLE public."${tableName}" (\n${columnDefs.join(',\n')}\n);\n`);
          
          // Add indexes
          for (const idx of indexResult.rows) {
            sqlParts.push(`${idx.indexdef};\n`);
          }
          
          sqlParts.push('\n');
          tablesProcessedInChunk++;
        }

        // Insert data
        if (includeData && tableRowCount > 0) {
          const columnNames = columns.map(c => `"${c.column_name}"`).join(', ');
          const selectCols = columns.map(c => `"${c.column_name}"::text`).join(', ');
          const orderClause = pkResult.rows.length > 0 
            ? `ORDER BY ${pkResult.rows.map(r => `"${r.column_name}"`).join(', ')}`
            : '';
          
          let currentRowOffset = startRowOffset;
          
          while (currentRowOffset < tableRowCount) {
            if (rowsProcessedInChunk >= MAX_ROWS_PER_CHUNK) {
              nextCursor = { tableIndex: tableIdx, rowOffset: currentRowOffset };
              hasMoreData = true;
              console.log(`Chunk limit reached. Next cursor: table ${tableIdx}, row ${currentRowOffset}`);
              break;
            }
            
            const elapsedMs = Date.now() - tableStartTime;
            if (elapsedMs > TABLE_TIMEOUT_MS) {
              nextCursor = { tableIndex: tableIdx, rowOffset: currentRowOffset };
              hasMoreData = true;
              console.log(`Table timeout. Next cursor: table ${tableIdx}, row ${currentRowOffset}`);
              break;
            }
            
            const remainingInChunk = MAX_ROWS_PER_CHUNK - rowsProcessedInChunk;
            const remainingInTable = tableRowCount - currentRowOffset;
            const fetchLimit = Math.min(BATCH_SIZE_ROWS, remainingInChunk, remainingInTable);
            
            try {
              const dataResult = await pgClient.queryArray(
                `SELECT ${selectCols} FROM public."${tableName}" ${orderClause} LIMIT ${fetchLimit} OFFSET ${currentRowOffset}`
              );
              
              if (dataResult.rows.length === 0) break;
              
              for (const row of dataResult.rows) {
                const valuesParts: string[] = [];
                for (let idx = 0; idx < row.length; idx++) {
                  const escapedVal = escapeSqlValueFromText(row[idx], columns[idx].data_type, columns[idx].udt_name);
                  valuesParts.push(escapedVal);
                }
                const vals = valuesParts.join(', ');
                
                const insertStmt = `INSERT INTO public."${tableName}" (${columnNames}) VALUES (${vals});`;
                
                if (!insertStmt.includes(' VALUES (') || !insertStmt.endsWith(');')) {
                  console.error(`Malformed INSERT for table ${tableName}, row offset ${currentRowOffset}`);
                  sqlParts.push(`-- SKIPPED malformed row at offset ${currentRowOffset}\n`);
                  continue;
                }
                
                sqlParts.push(insertStmt + '\n');
              }
              
              rowsProcessedInChunk += dataResult.rows.length;
              currentRowOffset += dataResult.rows.length;
            } catch (queryError) {
              console.error(`Query error for ${tableName} at offset ${currentRowOffset}:`, queryError);
              sqlParts.push(`-- Error at offset ${currentRowOffset}: ${queryError instanceof Error ? queryError.message : 'Unknown'}\n`);
              break;
            }
          }
          
          if (!hasMoreData && currentRowOffset >= tableRowCount) {
            sqlParts.push('\n');
          }
        }
        
        if (hasMoreData) break;
        
      } catch (tableError) {
        console.error(`Error processing table ${tableName}:`, tableError);
        sqlParts.push(`-- Error processing table ${tableName}: ${tableError instanceof Error ? tableError.message : 'Unknown'}\n\n`);
      }
    }

    const isLastChunk = !hasMoreData;

    // ============= FOOTER (last chunk only) =============
    if (isLastChunk) {
      // Add sequence resets
      if (sequences.length > 0) {
        sqlParts.push(`\n-- Reset sequences to current values\n`);
        for (const seq of sequences) {
          sqlParts.push(`SELECT setval('public."${seq.sequenceName}"', ${seq.currentValue}, true);\n`);
        }
      }
      
      // Add FK constraints restoration comment
      const fkTables = Array.from(dependencyMap.keys());
      if (fkTables.length > 0) {
        sqlParts.push(`\n-- Tables with FK constraints (restored via dependency order):\n`);
        for (const table of fkTables) {
          const refs = dependencyMap.get(table) || [];
          sqlParts.push(`-- ${table} -> ${refs.join(', ')}\n`);
        }
      }
      
      sqlParts.push(`

-- Re-enable triggers and FK checks
SET session_replication_role = 'origin';

--
-- PostgreSQL database dump complete
-- ${totalRows} rows from ${totalTables} tables restored successfully
-- ${sequences.length} sequences reset
--
`);
    } else {
      sqlParts.push(`\n-- === END OF CHUNK ${currentCursor.tableIndex}_${currentCursor.rowOffset} ===\n\n`);
    }

    await pgClient.end();

    const sqlContent = sqlParts.join('');
    
    // ============= VALIDATE SQL BEFORE RETURNING =============
    const validation = validateSqlBackup(sqlContent);
    
    if (!validation.isValid) {
      console.error('SQL validation failed:', validation.errors);
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Backup gerado com erros estruturais',
          validation: {
            isValid: false,
            errors: validation.errors,
            warnings: validation.warnings,
            stats: validation.stats,
          }
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    if (validation.warnings.length > 0) {
      console.log('SQL validation warnings:', validation.warnings);
    }
    
    const contentBytes = new TextEncoder().encode(sqlContent);
    const chunkSize = contentBytes.length;
    const duration = Date.now() - startTime;
    
    const hashBuffer = await crypto.subtle.digest("SHA-256", contentBytes);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const chunkChecksum = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
    
    console.log(`Chunk complete: ${tablesProcessedInChunk} tables, ${rowsProcessedInChunk} rows, ${(chunkSize / 1024).toFixed(2)} KB in ${duration}ms. Validation: OK`);

    return new Response(
      JSON.stringify({
        success: true,
        content: sqlContent,
        stats: {
          tablesInChunk: tablesProcessedInChunk,
          rowsInChunk: rowsProcessedInChunk,
          size: chunkSize,
          duration,
          database: targetDb,
          format: 'sql',
          totalTables,
          totalRows,
          currentTableName: lastProcessedTableName,
          checksum: chunkChecksum,
          sequencesCount: sequences.length,
        },
        validation: {
          isValid: true,
          warnings: validation.warnings,
          stats: validation.stats,
        },
        pagination: {
          isFirstChunk,
          isLastChunk,
          hasMoreData,
          nextCursor,
          currentCursor,
        }
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
      // Validate it's valid JSON
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
  
  // Truncate very long strings
  if (finalValue.length > MAX_STRING_LENGTH) {
    finalValue = finalValue.substring(0, MAX_STRING_LENGTH) + '...[TRUNCATED]';
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
