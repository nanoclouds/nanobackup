import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface FtpDownloadResult {
  success: boolean;
  content?: string;
  encoding?: 'text' | 'base64';
  size?: number;
  originalSize?: number;
  wasDecompressed?: boolean;
  checksum?: string;
  duration?: number;
  remotePath?: string;
  protocol?: string;
  message?: string;
}

export async function downloadBackupFromFtp(
  destinationId: string,
  remotePath: string,
  decompress: boolean = true
): Promise<FtpDownloadResult> {
  const { data, error } = await supabase.functions.invoke('download-from-ftp', {
    body: {
      destinationId,
      remotePath,
      decompress,
    },
  });

  if (error) {
    return { success: false, message: error.message };
  }

  return data as FtpDownloadResult;
}

export function triggerBlobDownload(content: string, fileName: string, isBase64: boolean = false): void {
  let blob: Blob;
  
  if (isBase64) {
    // Decode base64 to binary
    const binaryString = atob(content);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    blob = new Blob([bytes], { type: 'application/octet-stream' });
  } else {
    // Text content
    blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  }
  
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function downloadBackupFile(storagePath: string, fileName: string) {
  try {
    const { data, error } = await supabase.storage
      .from('backups')
      .download(storagePath);
    
    if (error) throw error;
    
    // Create blob URL and trigger download
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast.success(`Download iniciado: ${fileName}`);
  } catch (error) {
    console.error('Download error:', error);
    toast.error('Erro ao baixar arquivo');
    throw error;
  }
}

export async function getBackupDownloadUrl(storagePath: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage
      .from('backups')
      .createSignedUrl(storagePath, 3600); // 1 hour expiry
    
    if (error) throw error;
    return data.signedUrl;
  } catch (error) {
    console.error('Error creating signed URL:', error);
    return null;
  }
}

// Generate a simulated backup file for demo purposes
export function generateDemoBackupFile(databaseName: string, fileName: string): Blob {
  const content = `-- PostgreSQL database dump
-- Dumped from database version 18.1
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Database: ${databaseName}
-- Generated: ${new Date().toISOString()}
-- File: ${fileName}
--

-- This is a demonstration backup file
-- In production, this would contain the actual database dump

CREATE SCHEMA IF NOT EXISTS public;
COMMENT ON SCHEMA public IS 'standard public schema';

-- Demo table structure
CREATE TABLE IF NOT EXISTS demo_table (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Demo data
INSERT INTO demo_table (name) VALUES 
    ('Demo record 1'),
    ('Demo record 2'),
    ('Demo record 3');

-- End of dump
`;
  
  return new Blob([content], { type: 'application/sql' });
}

export function downloadDemoBackup(databaseName: string, fileName: string) {
  const blob = generateDemoBackupFile(databaseName, fileName);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  toast.success(`Download iniciado: ${fileName}`);
}

export function formatBytesReadable(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
