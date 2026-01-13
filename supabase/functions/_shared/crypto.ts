// AES-GCM Encryption utilities for credential protection
// Uses Web Crypto API available in Deno

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits is recommended for GCM

// Derive a CryptoKey from the ENCRYPTION_KEY environment variable
async function getEncryptionKey(): Promise<CryptoKey> {
  const keyMaterial = Deno.env.get('ENCRYPTION_KEY');
  if (!keyMaterial) {
    throw new Error('ENCRYPTION_KEY not configured');
  }
  
  // Use PBKDF2 to derive a key from the password
  const encoder = new TextEncoder();
  const keyData = encoder.encode(keyMaterial);
  
  // Use a fixed salt (in production, you might want to store salt per-record)
  const salt = encoder.encode('nano-backup-salt-v1');
  
  const baseKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );
  
  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

// Encrypt a plaintext string and return base64-encoded result
export async function encrypt(plaintext: string): Promise<string> {
  if (!plaintext) return '';
  
  const key = await getEncryptionKey();
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);
  
  // Generate a random IV
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  
  // Encrypt
  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    data
  );
  
  // Combine IV + ciphertext and encode as base64
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  
  // Add prefix to identify encrypted data
  return 'enc:' + btoa(String.fromCharCode(...combined));
}

// Decrypt a base64-encoded encrypted string
export async function decrypt(encryptedData: string): Promise<string> {
  if (!encryptedData) return '';
  
  // Check if data is encrypted (has prefix)
  if (!encryptedData.startsWith('enc:')) {
    // Return as-is if not encrypted (for backward compatibility)
    return encryptedData;
  }
  
  const key = await getEncryptionKey();
  
  // Remove prefix and decode base64
  const base64Data = encryptedData.substring(4);
  const combined = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
  
  // Extract IV and ciphertext
  const iv = combined.slice(0, IV_LENGTH);
  const ciphertext = combined.slice(IV_LENGTH);
  
  // Decrypt
  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    ciphertext
  );
  
  return new TextDecoder().decode(decrypted);
}

// Check if a value is encrypted
export function isEncrypted(value: string): boolean {
  return value?.startsWith('enc:') ?? false;
}
