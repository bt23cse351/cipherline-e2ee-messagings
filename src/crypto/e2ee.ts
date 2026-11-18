import sodium from 'libsodium-wrappers';
import type { ClientKeyBundle, EncryptedMessageEnvelope } from '../types/messaging';

let cryptoReadyPromise: Promise<typeof sodium> | null = null;

export async function ensureCryptoReady(): Promise<typeof sodium> {
  if (!cryptoReadyPromise) {
    cryptoReadyPromise = sodium.ready.then(() => sodium);
  }
  return cryptoReadyPromise;
}

function toBase64(bytes: Uint8Array): string {
  return sodium.to_base64(bytes, sodium.base64_variants.ORIGINAL);
}

function fromBase64(b64: string): Uint8Array {
  return sodium.from_base64(b64, sodium.base64_variants.ORIGINAL);
}

function toHexUpper(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export async function computeFingerprintHex(
  encryptionPublicKeyB64: string,
  signingPublicKeyB64: string
): Promise<string> {
  await ensureCryptoReady();
  const encBytes = fromBase64(encryptionPublicKeyB64);
  const signBytes = fromBase64(signingPublicKeyB64);
  const combined = new Uint8Array(encBytes.length + signBytes.length);
  combined.set(encBytes, 0);
  combined.set(signBytes, encBytes.length);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', toArrayBuffer(combined));
  return toHexUpper(new Uint8Array(digest));
}

export function formatFingerprintGroups(hexFingerprint: string): string[] {
  const clean = hexFingerprint.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
  const groups: string[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    groups.push(clean.slice(i, i + 4));
  }
  return groups;
}

/**
 * Generates a symmetric 60-digit Safety Number (12 groups of 5 digits)
 * so both peers see the exact same verification code out-of-band.
 */
export async function computePairSafetyNumber(
  fingerprintA: string,
  fingerprintB: string
): Promise<string[]> {
  if (!fingerprintA || !fingerprintB) {
    return [];
  }
  const sorted = [fingerprintA.toUpperCase(), fingerprintB.toUpperCase()].sort().join(':');
  const encoded = new TextEncoder().encode(`CipherLine-Safety-v1:${sorted}`);
  const digest1 = new Uint8Array(
    await globalThis.crypto.subtle.digest('SHA-256', toArrayBuffer(encoded))
  );
  const digest2 = new Uint8Array(
    await globalThis.crypto.subtle.digest('SHA-256', toArrayBuffer(digest1))
  );
  const combined = new Uint8Array(digest1.length + digest2.length);
  combined.set(digest1, 0);
  combined.set(digest2, digest1.length);

  const groups: string[] = [];
  for (let i = 0; i < 12; i++) {
    const offset = i * 4;
    const val =
      ((combined[offset] << 24) |
        (combined[offset + 1] << 16) |
        (combined[offset + 2] << 8) |
        combined[offset + 3]) >>>
      0;
    groups.push(String(val % 100000).padStart(5, '0'));
  }
  return groups;
}

export async function generateIdentityKeyBundle(keyVersion = 1): Promise<ClientKeyBundle> {
  const s = await ensureCryptoReady();
  const encKeyPair = s.crypto_box_keypair();
  const signKeyPair = s.crypto_sign_keypair();

  const encryptionPublicKey = toBase64(encKeyPair.publicKey);
  const encryptionPrivateKey = toBase64(encKeyPair.privateKey);
  const signingPublicKey = toBase64(signKeyPair.publicKey);
  const signingPrivateKey = toBase64(signKeyPair.privateKey);

  // Zero sensitive buffers after encoding
  s.memzero(encKeyPair.privateKey);
  s.memzero(signKeyPair.privateKey);

  const fingerprint = await computeFingerprintHex(encryptionPublicKey, signingPublicKey);

  return {
    encryptionPublicKey,
    encryptionPrivateKey,
    signingPublicKey,
    signingPrivateKey,
    fingerprint,
    keyVersion,
    createdAt: new Date().toISOString(),
  };
}

export async function deriveX25519SharedSecret(
  myEncryptionPrivateKeyB64: string,
  peerEncryptionPublicKeyB64: string
): Promise<Uint8Array> {
  const s = await ensureCryptoReady();
  const myPriv = fromBase64(myEncryptionPrivateKeyB64);
  const peerPub = fromBase64(peerEncryptionPublicKeyB64);

  if (myPriv.length !== 32 || peerPub.length !== 32) {
    throw new Error('Invalid X25519 key length');
  }

  const sharedSecret = s.crypto_scalarmult(myPriv, peerPub);
  s.memzero(myPriv);

  // Verify shared secret is not all-zeros (low-order point check)
  let nonZero = 0;
  for (let i = 0; i < sharedSecret.length; i++) {
    nonZero |= sharedSecret[i];
  }
  if (nonZero === 0) {
    throw new Error('Invalid X25519 shared secret (all zero)');
  }

  return sharedSecret;
}

export async function deriveMessageKeyHKDF(
  sharedSecret: Uint8Array,
  saltBytes: Uint8Array,
  contextInfo: string
): Promise<Uint8Array> {
  const ikm = await globalThis.crypto.subtle.importKey(
    'raw',
    toArrayBuffer(sharedSecret),
    'HKDF',
    false,
    ['deriveBits']
  );

  const infoBytes = new TextEncoder().encode(contextInfo);
  const derivedBits = await globalThis.crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: toArrayBuffer(saltBytes),
      info: toArrayBuffer(infoBytes),
    },
    ikm,
    256
  );

  return new Uint8Array(derivedBits);
}

export function buildHkdfContextInfo(params: {
  conversationId: string;
  senderId: string;
  recipientId: string;
  senderKeyVersion: number;
  recipientKeyVersion: number;
}): string {
  const pair = [params.senderId, params.recipientId].sort().join(':');
  return `CipherLine-E2EE-v1|${params.conversationId}|${pair}|sv:${params.senderKeyVersion}|rv:${params.recipientKeyVersion}`;
}

export function buildCanonicalSignatureString(envelope: {
  messageId: string;
  conversationId: string;
  senderId: string;
  recipientId: string;
  clientTimestamp: string;
  keyVersion: number;
  ephemeralPublicKey: string;
  nonce: string;
  ciphertext: string;
}): string {
  return [
    'CipherLine-Sig-v1',
    envelope.messageId,
    envelope.conversationId,
    envelope.senderId,
    envelope.recipientId,
    envelope.clientTimestamp,
    String(envelope.keyVersion),
    envelope.ephemeralPublicKey,
    envelope.nonce,
    envelope.ciphertext,
  ].join('\n');
}

export function buildAssociatedData(envelope: {
  conversationId: string;
  senderId: string;
  recipientId: string;
  messageId: string;
  clientTimestamp: string;
  keyVersion: number;
}): Uint8Array {
  const aad = `CipherLine-AAD-v1|${envelope.conversationId}|${envelope.senderId}|${envelope.recipientId}|${envelope.messageId}|${envelope.clientTimestamp}|${envelope.keyVersion}`;
  return new TextEncoder().encode(aad);
}

export function generateClientMessageId(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function encryptAndSignMessage(params: {
  plaintext: string;
  conversationId: string;
  senderId: string;
  recipientId: string;
  senderKeys: ClientKeyBundle;
  recipientPublicKeys: {
    encryptionPublicKey: string;
    signingPublicKey: string;
    keyVersion: number;
  };
}): Promise<EncryptedMessageEnvelope> {
  const s = await ensureCryptoReady();

  if (!params.recipientPublicKeys.encryptionPublicKey) {
    throw new Error('Recipient has not published an X25519 encryption key');
  }

  const messageId = generateClientMessageId();
  const clientTimestamp = new Date().toISOString();
  const senderKeyVersion = params.senderKeys.keyVersion || 1;
  const recipientKeyVersion = params.recipientPublicKeys.keyVersion || 1;
  const keyVersion = senderKeyVersion;

  // Fresh 16-byte HKDF salt & 24-byte XChaCha20-Poly1305 nonce per message
  const saltBytes = s.randombytes_buf(16);
  const ephemeralPublicKey = `hkdf-salt-v1:${toBase64(saltBytes)}`;
  const nonceBytes = s.randombytes_buf(s.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);

  const sharedSecret = await deriveX25519SharedSecret(
    params.senderKeys.encryptionPrivateKey,
    params.recipientPublicKeys.encryptionPublicKey
  );

  const contextInfo = buildHkdfContextInfo({
    conversationId: params.conversationId,
    senderId: params.senderId,
    recipientId: params.recipientId,
    senderKeyVersion,
    recipientKeyVersion,
  });

  const messageKey = await deriveMessageKeyHKDF(sharedSecret, saltBytes, contextInfo);
  s.memzero(sharedSecret);

  const aadBytes = buildAssociatedData({
    conversationId: params.conversationId,
    senderId: params.senderId,
    recipientId: params.recipientId,
    messageId,
    clientTimestamp,
    keyVersion,
  });

  const plaintextBytes = new TextEncoder().encode(params.plaintext);
  const ciphertextBytes = s.crypto_aead_xchacha20poly1305_ietf_encrypt(
    plaintextBytes,
    aadBytes,
    null,
    nonceBytes,
    messageKey
  );
  s.memzero(messageKey);

  const nonce = toBase64(nonceBytes);
  const ciphertext = toBase64(ciphertextBytes);

  const canonical = buildCanonicalSignatureString({
    messageId,
    conversationId: params.conversationId,
    senderId: params.senderId,
    recipientId: params.recipientId,
    clientTimestamp,
    keyVersion,
    ephemeralPublicKey,
    nonce,
    ciphertext,
  });

  const signPrivBytes = fromBase64(params.senderKeys.signingPrivateKey);
  const signatureBytes = s.crypto_sign_detached(
    new TextEncoder().encode(canonical),
    signPrivBytes
  );
  s.memzero(signPrivBytes);

  return {
    messageId,
    conversationId: params.conversationId,
    senderId: params.senderId,
    recipientId: params.recipientId,
    ciphertext,
    nonce,
    ephemeralPublicKey,
    signature: toBase64(signatureBytes),
    keyVersion,
    senderKeyVersion,
    recipientKeyVersion,
    clientTimestamp,
  };
}

export async function verifyAndDecryptMessage(params: {
  envelope: EncryptedMessageEnvelope;
  myUserId: string;
  myKeys: ClientKeyBundle;
  senderSigningPublicKey: string;
  peerEncryptionPublicKey: string;
}): Promise<{
  ok: boolean;
  plaintext: string;
  signatureValid: boolean;
  error?: string;
  errorType?: 'SIGNATURE_INVALID' | 'DECRYPTION_FAILED' | 'KEY_MISMATCH';
}> {
  const s = await ensureCryptoReady();
  const { envelope } = params;

  if (!params.senderSigningPublicKey || !params.peerEncryptionPublicKey) {
    return {
      ok: false,
      plaintext: '',
      signatureValid: false,
      errorType: 'KEY_MISMATCH',
      error: 'Missing peer public keys for verification or decryption.',
    };
  }

  // Step 1: Verify Ed25519 signature BEFORE attempting decryption
  let signatureValid = false;
  try {
    const canonical = buildCanonicalSignatureString(envelope);
    const canonicalBytes = new TextEncoder().encode(canonical);
    const sigBytes = fromBase64(envelope.signature);
    const senderSignPubBytes = fromBase64(params.senderSigningPublicKey);

    if (sigBytes.length !== 64 || senderSignPubBytes.length !== 32) {
      signatureValid = false;
    } else {
      signatureValid = s.crypto_sign_verify_detached(
        sigBytes,
        canonicalBytes,
        senderSignPubBytes
      );
    }
  } catch {
    signatureValid = false;
  }

  if (!signatureValid) {
    return {
      ok: false,
      plaintext: '',
      signatureValid: false,
      errorType: 'SIGNATURE_INVALID',
      error:
        'Ed25519 signature verification failed. Message authenticity or integrity could not be verified.',
    };
  }

  // Step 2: Derive X25519 + HKDF-SHA256 message key and decrypt XChaCha20-Poly1305
  try {
    if (!envelope.ephemeralPublicKey.startsWith('hkdf-salt-v1:')) {
      throw new Error('Unsupported session salt prefix');
    }
    const saltB64 = envelope.ephemeralPublicKey.slice('hkdf-salt-v1:'.length);
    const saltBytes = fromBase64(saltB64);

    const sharedSecret = await deriveX25519SharedSecret(
      params.myKeys.encryptionPrivateKey,
      params.peerEncryptionPublicKey
    );

    const contextInfo = buildHkdfContextInfo({
      conversationId: envelope.conversationId,
      senderId: envelope.senderId,
      recipientId: envelope.recipientId,
      senderKeyVersion: envelope.senderKeyVersion || envelope.keyVersion,
      recipientKeyVersion: envelope.recipientKeyVersion || envelope.keyVersion,
    });

    const messageKey = await deriveMessageKeyHKDF(sharedSecret, saltBytes, contextInfo);
    s.memzero(sharedSecret);

    const aadBytes = buildAssociatedData({
      conversationId: envelope.conversationId,
      senderId: envelope.senderId,
      recipientId: envelope.recipientId,
      messageId: envelope.messageId,
      clientTimestamp: envelope.clientTimestamp,
      keyVersion: envelope.keyVersion,
    });

    const ciphertextBytes = fromBase64(envelope.ciphertext);
    const nonceBytes = fromBase64(envelope.nonce);

    const decryptedBytes = s.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      ciphertextBytes,
      aadBytes,
      nonceBytes,
      messageKey
    );
    s.memzero(messageKey);

    const plaintext = new TextDecoder().decode(decryptedBytes);
    return {
      ok: true,
      plaintext,
      signatureValid: true,
    };
  } catch {
    return {
      ok: false,
      plaintext: '',
      signatureValid: true,
      errorType: 'DECRYPTION_FAILED',
      error:
        'Authenticated decryption (XChaCha20-Poly1305) failed. Keys may have rotated or ciphertext was altered.',
    };
  }
}
