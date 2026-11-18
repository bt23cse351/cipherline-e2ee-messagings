import type { ClientKeyBundle, VerifiedContactRecord } from '../types/messaging';

interface EncryptedVaultRecord {
  version: number;
  userId: string;
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
  updatedAt: string;
}

const VAULT_STORAGE_PREFIX = 'cipherline_encrypted_vault_v1_';
const VERIFIED_CONTACTS_PREFIX = 'cipherline_verified_contacts_v1_';
const DB_NAME = 'cipherline_keystore_db';
const STORE_NAME = 'encrypted_vaults';

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function deriveVaultWrappingKey(
  password: string,
  salt: Uint8Array,
  iterations = 310000
): Promise<CryptoKey> {
  const passwordKey = await globalThis.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return globalThis.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: toArrayBuffer(salt),
      iterations,
    },
    passwordKey,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['encrypt', 'decrypt']
  );
}

function openVaultDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
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

async function writeVaultRecord(record: EncryptedVaultRecord): Promise<void> {
  const db = await openVaultDB();
  if (db) {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    }).catch(() => {
      // Fallback below
    });
  }
  try {
    localStorage.setItem(`${VAULT_STORAGE_PREFIX}${record.userId}`, JSON.stringify(record));
  } catch {
    // Ignore storage quota errors
  }
}

async function readVaultRecord(userId: string): Promise<EncryptedVaultRecord | null> {
  const db = await openVaultDB();
  if (db) {
    const fromDb = await new Promise<EncryptedVaultRecord | null>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(userId);
      req.onsuccess = () => resolve((req.result as EncryptedVaultRecord) || null);
      req.onerror = () => resolve(null);
    });
    if (fromDb) return fromDb;
  }

  try {
    const raw = localStorage.getItem(`${VAULT_STORAGE_PREFIX}${userId}`);
    if (!raw) return null;
    return JSON.parse(raw) as EncryptedVaultRecord;
  } catch {
    return null;
  }
}

export async function hasLocalVault(userId: string): Promise<boolean> {
  const record = await readVaultRecord(userId);
  return Boolean(record);
}

export async function encryptAndSaveVault(
  userId: string,
  password: string,
  bundle: ClientKeyBundle
): Promise<void> {
  const salt = new Uint8Array(16);
  const iv = new Uint8Array(12);
  globalThis.crypto.getRandomValues(salt);
  globalThis.crypto.getRandomValues(iv);

  const iterations = 310000;
  const wrappingKey = await deriveVaultWrappingKey(password, salt, iterations);

  const plaintext = new TextEncoder().encode(JSON.stringify(bundle));
  const aad = new TextEncoder().encode(`CipherLine-Vault-v1|${userId}`);

  const encrypted = await globalThis.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(iv),
      additionalData: toArrayBuffer(aad),
    },
    wrappingKey,
    toArrayBuffer(plaintext)
  );

  const record: EncryptedVaultRecord = {
    version: 1,
    userId,
    kdf: 'PBKDF2-SHA256',
    iterations,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(encrypted)),
    updatedAt: new Date().toISOString(),
  };

  await writeVaultRecord(record);
}

export async function unlockLocalVault(
  userId: string,
  password: string
): Promise<ClientKeyBundle> {
  const record = await readVaultRecord(userId);
  if (!record) {
    throw new Error('NO_VAULT');
  }

  const salt = fromBase64(record.salt);
  const iv = fromBase64(record.iv);
  const ciphertext = fromBase64(record.ciphertext);

  const wrappingKey = await deriveVaultWrappingKey(password, salt, record.iterations);
  const aad = new TextEncoder().encode(`CipherLine-Vault-v1|${userId}`);

  try {
    const decrypted = await globalThis.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: toArrayBuffer(iv),
        additionalData: toArrayBuffer(aad),
      },
      wrappingKey,
      toArrayBuffer(ciphertext)
    );
    const json = new TextDecoder().decode(decrypted);
    return JSON.parse(json) as ClientKeyBundle;
  } catch {
    throw new Error('INVALID_VAULT_PASSWORD');
  }
}

export async function exportEncryptedVaultBackup(
  userId: string,
  backupPassphrase: string,
  bundle: ClientKeyBundle
): Promise<string> {
  const salt = new Uint8Array(16);
  const iv = new Uint8Array(12);
  globalThis.crypto.getRandomValues(salt);
  globalThis.crypto.getRandomValues(iv);

  const wrappingKey = await deriveVaultWrappingKey(backupPassphrase, salt, 310000);
  const payload = new TextEncoder().encode(JSON.stringify({ userId, bundle }));
  const encrypted = await globalThis.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(iv),
    },
    wrappingKey,
    toArrayBuffer(payload)
  );

  return JSON.stringify({
    format: 'CIPHERLINE_ENCRYPTED_KEY_BACKUP_V1',
    userId,
    iterations: 310000,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(encrypted)),
  });
}

export async function importEncryptedVaultBackup(
  expectedUserId: string,
  backupPassphrase: string,
  backupJsonString: string,
  localVaultPassword: string
): Promise<ClientKeyBundle> {
  const parsed = JSON.parse(backupJsonString.trim()) as {
    format?: string;
    userId?: string;
    iterations?: number;
    salt?: string;
    iv?: string;
    ciphertext?: string;
  };

  if (
    parsed.format !== 'CIPHERLINE_ENCRYPTED_KEY_BACKUP_V1' ||
    !parsed.salt ||
    !parsed.iv ||
    !parsed.ciphertext
  ) {
    throw new Error('Invalid encrypted vault backup format');
  }

  if (parsed.userId && parsed.userId !== expectedUserId) {
    throw new Error('This key backup belongs to a different user account');
  }

  const wrappingKey = await deriveVaultWrappingKey(
    backupPassphrase,
    fromBase64(parsed.salt),
    parsed.iterations || 310000
  );

  const decrypted = await globalThis.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(fromBase64(parsed.iv)),
    },
    wrappingKey,
    toArrayBuffer(fromBase64(parsed.ciphertext))
  );

  const data = JSON.parse(new TextDecoder().decode(decrypted)) as {
    userId: string;
    bundle: ClientKeyBundle;
  };

  await encryptAndSaveVault(expectedUserId, localVaultPassword, data.bundle);
  return data.bundle;
}

export function getVerifiedContacts(ownerUserId: string): Record<string, VerifiedContactRecord> {
  try {
    const raw = localStorage.getItem(`${VERIFIED_CONTACTS_PREFIX}${ownerUserId}`);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, VerifiedContactRecord>;
  } catch {
    return {};
  }
}

export function setContactVerified(
  ownerUserId: string,
  record: VerifiedContactRecord
): Record<string, VerifiedContactRecord> {
  const current = getVerifiedContacts(ownerUserId);
  const next = { ...current, [record.userId]: record };
  try {
    localStorage.setItem(`${VERIFIED_CONTACTS_PREFIX}${ownerUserId}`, JSON.stringify(next));
  } catch {
    // Ignore storage errors
  }
  return next;
}

export function removeContactVerification(
  ownerUserId: string,
  contactUserId: string
): Record<string, VerifiedContactRecord> {
  const current = getVerifiedContacts(ownerUserId);
  const next = { ...current };
  delete next[contactUserId];
  try {
    localStorage.setItem(`${VERIFIED_CONTACTS_PREFIX}${ownerUserId}`, JSON.stringify(next));
  } catch {
    // Ignore storage errors
  }
  return next;
}
