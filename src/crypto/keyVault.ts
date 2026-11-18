import type { IdentityKeyBundle, VerifiedContactRecord } from '../types/messaging';

const DB_NAME = 'CipherLineVaultDB';
const DB_VERSION = 1;
const STORE_NAME = 'vaults';
const PBKDF2_ITERATIONS = 310000;

interface EncryptedVaultEnvelope {
  version: 1;
  userId: string;
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  cipher: 'AES-256-GCM';
  saltB64: string;
  ivB64: string;
  ciphertextB64: string;
  publicBundle: {
    encryptionPublicKey: string;
    signingPublicKey: string;
    fingerprint: string;
    keyVersion: number;
  };
  updatedAt: string;
}

function bytesToB64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function b64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function openVaultDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return null;
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'userId' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function putVaultRecord(record: EncryptedVaultEnvelope): Promise<void> {
  const serialized = JSON.stringify(record);
  try {
    localStorage.setItem(`cipherline_vault_${record.userId}`, serialized);
  } catch {
    // Ignore storage quota fallback
  }

  const db = await openVaultDB();
  if (!db) return;

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

async function getVaultRecord(userId: string): Promise<EncryptedVaultEnvelope | null> {
  const db = await openVaultDB();
  if (db) {
    const fromIdb = await new Promise<EncryptedVaultEnvelope | null>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(userId);
        req.onsuccess = () => {
          db.close();
          resolve((req.result as EncryptedVaultEnvelope) || null);
        };
        req.onerror = () => {
          db.close();
          resolve(null);
        };
      } catch {
        db.close();
        resolve(null);
      }
    });
    if (fromIdb) return fromIdb;
  }

  try {
    const raw = localStorage.getItem(`cipherline_vault_${userId}`);
    if (raw) {
      return JSON.parse(raw) as EncryptedVaultEnvelope;
    }
  } catch {
    return null;
  }
  return null;
}

async function deriveVaultWrappingKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number
): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(new TextEncoder().encode(passphrase)),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: toArrayBuffer(salt),
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function hasEncryptedVault(userId: string): Promise<boolean> {
  const record = await getVaultRecord(userId);
  return Boolean(record && record.ciphertextB64);
}

export async function saveEncryptedVault(
  userId: string,
  bundle: IdentityKeyBundle,
  passphrase: string
): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aesKey = await deriveVaultWrappingKey(passphrase, salt, PBKDF2_ITERATIONS);

  const plaintext = new TextEncoder().encode(JSON.stringify(bundle));
  const ciphertextBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    aesKey,
    toArrayBuffer(plaintext)
  );
  plaintext.fill(0);

  const record: EncryptedVaultEnvelope = {
    version: 1,
    userId,
    kdf: 'PBKDF2-SHA256',
    iterations: PBKDF2_ITERATIONS,
    cipher: 'AES-256-GCM',
    saltB64: bytesToB64(salt),
    ivB64: bytesToB64(iv),
    ciphertextB64: bytesToB64(new Uint8Array(ciphertextBuf)),
    publicBundle: {
      encryptionPublicKey: bundle.encryptionPublicKey,
      signingPublicKey: bundle.signingPublicKey,
      fingerprint: bundle.fingerprint,
      keyVersion: bundle.keyVersion,
    },
    updatedAt: new Date().toISOString(),
  };

  await putVaultRecord(record);
}

export async function unlockEncryptedVault(
  userId: string,
  passphrase: string
): Promise<IdentityKeyBundle> {
  const record = await getVaultRecord(userId);
  if (!record) {
    throw new Error('No encrypted local key vault found on this device.');
  }

  const salt = b64ToBytes(record.saltB64);
  const iv = b64ToBytes(record.ivB64);
  const ciphertext = b64ToBytes(record.ciphertextB64);
  const aesKey = await deriveVaultWrappingKey(passphrase, salt, record.iterations || PBKDF2_ITERATIONS);

  try {
    const decryptedBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(iv) },
      aesKey,
      toArrayBuffer(ciphertext)
    );
    const jsonText = new TextDecoder().decode(new Uint8Array(decryptedBuf));
    return JSON.parse(jsonText) as IdentityKeyBundle;
  } catch {
    throw new Error('Incorrect vault passphrase or corrupted key backup.');
  }
}

export async function exportEncryptedVaultBackup(userId: string): Promise<string> {
  const record = await getVaultRecord(userId);
  if (!record) {
    throw new Error('No local encrypted key vault exists for export.');
  }
  return JSON.stringify(record, null, 2);
}

export async function importEncryptedVaultBackup(
  userId: string,
  backupJson: string,
  passphrase: string
): Promise<IdentityKeyBundle> {
  let parsed: EncryptedVaultEnvelope;
  try {
    parsed = JSON.parse(backupJson) as EncryptedVaultEnvelope;
  } catch {
    throw new Error('Backup file is not valid JSON.');
  }

  if (!parsed || parsed.version !== 1 || !parsed.saltB64 || !parsed.ivB64 || !parsed.ciphertextB64) {
    throw new Error('Invalid CipherLine encrypted vault backup format.');
  }

  const normalized: EncryptedVaultEnvelope = {
    ...parsed,
    userId,
    updatedAt: new Date().toISOString(),
  };

  const salt = b64ToBytes(normalized.saltB64);
  const iv = b64ToBytes(normalized.ivB64);
  const ciphertext = b64ToBytes(normalized.ciphertextB64);
  const aesKey = await deriveVaultWrappingKey(
    passphrase,
    salt,
    normalized.iterations || PBKDF2_ITERATIONS
  );

  let bundle: IdentityKeyBundle;
  try {
    const decryptedBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(iv) },
      aesKey,
      toArrayBuffer(ciphertext)
    );
    bundle = JSON.parse(new TextDecoder().decode(new Uint8Array(decryptedBuf))) as IdentityKeyBundle;
  } catch {
    throw new Error('Incorrect passphrase for this encrypted vault backup.');
  }

  await putVaultRecord(normalized);
  return bundle;
}

export async function deleteLocalVault(userId: string): Promise<void> {
  try {
    localStorage.removeItem(`cipherline_vault_${userId}`);
  } catch {
    // Ignore
  }
  const db = await openVaultDB();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(userId);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

export function getVerifiedContacts(ownerUserId: string): Record<string, VerifiedContactRecord> {
  try {
    const raw = localStorage.getItem(`cipherline_verified_contacts_${ownerUserId}`);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, VerifiedContactRecord>;
  } catch {
    return {};
  }
}

export function saveVerifiedContact(
  ownerUserId: string,
  record: VerifiedContactRecord
): Record<string, VerifiedContactRecord> {
  const existing = getVerifiedContacts(ownerUserId);
  const next = { ...existing, [record.userId]: record };
  try {
    localStorage.setItem(`cipherline_verified_contacts_${ownerUserId}`, JSON.stringify(next));
  } catch {
    // Ignore
  }
  return next;
}

export function removeVerifiedContact(
  ownerUserId: string,
  peerUserId: string
): Record<string, VerifiedContactRecord> {
  const existing = getVerifiedContacts(ownerUserId);
  const next = { ...existing };
  delete next[peerUserId];
  try {
    localStorage.setItem(`cipherline_verified_contacts_${ownerUserId}`, JSON.stringify(next));
  } catch {
    // Ignore
  }
  return next;
}
