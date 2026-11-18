import sodium from 'libsodium-wrappers';
import type {
  EncryptedMessageEnvelope,
  IdentityKeyBundle,
  VerificationStatus,
} from '../types/messaging';

let sodiumInitialized = false;

export async function ensureSodiumReady(): Promise<typeof sodium> {
  if (!sodiumInitialized) {
    await sodium.ready;
    sodiumInitialized = true;
  }
  return sodium;
}

function toBase64(s: typeof sodium, bytes: Uint8Array): string {
  return s.to_base64(bytes, s.base64_variants.ORIGINAL);
}

function fromBase64(s: typeof sodium, value: string): Uint8Array {
  return s.from_base64(value, s.base64_variants.ORIGINAL);
}

function bytesToHexUpper(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export async function computeFingerprintFromPublicKeys(
  encryptionPublicKeyB64: string,
  signingPublicKeyB64: string
): Promise<string> {
  const s = await ensureSodiumReady();
  const encBytes = fromBase64(s, encryptionPublicKeyB64);
  const signBytes = fromBase64(s, signingPublicKeyB64);
  const combined = new Uint8Array(encBytes.length + signBytes.length);
  combined.set(encBytes, 0);
  combined.set(signBytes, encBytes.length);
  const digest = await crypto.subtle.digest('SHA-256', toArrayBuffer(combined));
  return bytesToHexUpper(new Uint8Array(digest));
}

export function formatFingerprint(fingerprint: string): string {
  const clean = (fingerprint || '').replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
  if (!clean) return 'Not published';
  return clean.match(/.{1,4}/g)?.join(' ') || clean;
}

export async function computeSafetyNumber(
  fingerprintA: string,
  fingerprintB: string
): Promise<string> {
  const a = (fingerprintA || '').trim().toUpperCase();
  const b = (fingerprintB || '').trim().toUpperCase();
  if (!a || !b) return '';
  const sorted = [a, b].sort();
  const encoder = new TextEncoder();
  const input = encoder.encode(`CipherLine-Safety-v1:${sorted[0]}:${sorted[1]}`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', toArrayBuffer(input)));

  const groups: string[] = [];
  for (let i = 0; i < 12; i++) {
    const offset = (i * 2) % (digest.length - 1);
    const val = ((digest[offset] << 8) | digest[offset + 1]) % 100000;
    groups.push(String(val).padStart(5, '0'));
  }
  return groups.join(' ');
}

export async function generateIdentityKeyBundle(keyVersion = 1): Promise<IdentityKeyBundle> {
  const s = await ensureSodiumReady();
  const encPair = s.crypto_box_keypair();
  const signPair = s.crypto_sign_keypair();

  const encryptionPublicKey = toBase64(s, encPair.publicKey);
  const encryptionPrivateKey = toBase64(s, encPair.privateKey);
  const signingPublicKey = toBase64(s, signPair.publicKey);
  const signingPrivateKey = toBase64(s, signPair.privateKey);

  encPair.privateKey.fill(0);
  signPair.privateKey.fill(0);

  const fingerprint = await computeFingerprintFromPublicKeys(
    encryptionPublicKey,
    signingPublicKey
  );

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

function parseHkdfSaltB64(ephemeralPublicKeyField: string): string {
  if (ephemeralPublicKeyField.startsWith('hkdf-v1:')) {
    return ephemeralPublicKeyField.slice('hkdf-v1:'.length);
  }
  return ephemeralPublicKeyField;
}

async function deriveConversationMessageKey(params: {
  myEncPrivateKeyB64: string;
  peerEncPublicKeyB64: string;
  conversationId: string;
  keyVersion: number;
  saltB64: string;
}): Promise<Uint8Array> {
  const s = await ensureSodiumReady();
  const myPriv = fromBase64(s, params.myEncPrivateKeyB64);
  const peerPub = fromBase64(s, params.peerEncPublicKeyB64);
  const saltBytes = fromBase64(s, params.saltB64);

  const sharedSecret = s.crypto_scalarmult(myPriv, peerPub);
  myPriv.fill(0);

  const ikm = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(sharedSecret),
    'HKDF',
    false,
    ['deriveBits']
  );
  sharedSecret.fill(0);

  const infoText = `CipherLine-E2EE-v1|conv:${params.conversationId}|kv:${params.keyVersion}`;
  const infoBytes = new TextEncoder().encode(infoText);

  const derivedBits = await crypto.subtle.deriveBits(
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

function buildSignatureTranscript(params: {
  messageId: string;
  conversationId: string;
  senderId: string;
  recipientId: string;
  clientTimestamp: string;
  keyVersion: number;
  senderKeyVersion: number;
  recipientKeyVersion: number;
  ephemeralPublicKey: string;
  nonce: string;
  ciphertext: string;
}): Uint8Array {
  const canonical = [
    'CipherLine-Sig-v1',
    params.messageId,
    params.conversationId,
    params.senderId,
    params.recipientId,
    params.clientTimestamp,
    String(params.keyVersion),
    String(params.senderKeyVersion),
    String(params.recipientKeyVersion),
    params.ephemeralPublicKey,
    params.nonce,
    params.ciphertext,
  ].join('\n');

  return new TextEncoder().encode(canonical);
}

function buildAssociatedData(params: {
  messageId: string;
  conversationId: string;
  senderId: string;
  recipientId: string;
  clientTimestamp: string;
  keyVersion: number;
}): Uint8Array {
  const aad = [
    'CipherLine-AAD-v1',
    params.messageId,
    params.conversationId,
    params.senderId,
    params.recipientId,
    params.clientTimestamp,
    String(params.keyVersion),
  ].join('|');

  return new TextEncoder().encode(aad);
}

function generateMessageId(): string {
  const randomBytes = new Uint8Array(12);
  crypto.getRandomValues(randomBytes);
  const hex = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `msg_${hex}`;
}

export async function encryptAndSignMessage(params: {
  plaintext: string;
  conversationId: string;
  senderId: string;
  recipientId: string;
  senderKeys: IdentityKeyBundle;
  recipientEncryptionPublicKey: string;
  recipientKeyVersion: number;
}): Promise<EncryptedMessageEnvelope> {
  const s = await ensureSodiumReady();

  const messageId = generateMessageId();
  const clientTimestamp = new Date().toISOString();
  const keyVersion = Math.max(params.senderKeys.keyVersion, params.recipientKeyVersion);

  const saltBytes = s.randombytes_buf(16);
  const saltB64 = toBase64(s, saltBytes);
  const ephemeralPublicKey = `hkdf-v1:${saltB64}`;

  const messageKey = await deriveConversationMessageKey({
    myEncPrivateKeyB64: params.senderKeys.encryptionPrivateKey,
    peerEncPublicKeyB64: params.recipientEncryptionPublicKey,
    conversationId: params.conversationId,
    keyVersion,
    saltB64,
  });

  const nonceBytes = s.randombytes_buf(s.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const nonce = toBase64(s, nonceBytes);

  const aadBytes = buildAssociatedData({
    messageId,
    conversationId: params.conversationId,
    senderId: params.senderId,
    recipientId: params.recipientId,
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
  messageKey.fill(0);

  const ciphertext = toBase64(s, ciphertextBytes);

  const transcript = buildSignatureTranscript({
    messageId,
    conversationId: params.conversationId,
    senderId: params.senderId,
    recipientId: params.recipientId,
    clientTimestamp,
    keyVersion,
    senderKeyVersion: params.senderKeys.keyVersion,
    recipientKeyVersion: params.recipientKeyVersion,
    ephemeralPublicKey,
    nonce,
    ciphertext,
  });

  const signPrivBytes = fromBase64(s, params.senderKeys.signingPrivateKey);
  const signatureBytes = s.crypto_sign_detached(transcript, signPrivBytes);
  signPrivBytes.fill(0);
  const signature = toBase64(s, signatureBytes);

  return {
    messageId,
    conversationId: params.conversationId,
    senderId: params.senderId,
    recipientId: params.recipientId,
    ciphertext,
    nonce,
    ephemeralPublicKey,
    signature,
    keyVersion,
    senderKeyVersion: params.senderKeys.keyVersion,
    recipientKeyVersion: params.recipientKeyVersion,
    clientTimestamp,
    deliveredAt: null,
    readAt: null,
  };
}

export async function verifyAndDecryptMessage(params: {
  envelope: EncryptedMessageEnvelope;
  myEncPrivateKeyB64: string;
  peerEncPublicKeyB64: string;
  senderSignPublicKeyB64: string;
}): Promise<{
  ok: boolean;
  status: VerificationStatus;
  plaintext: string;
  errorReason?: string;
}> {
  const { envelope, myEncPrivateKeyB64, peerEncPublicKeyB64, senderSignPublicKeyB64 } = params;

  if (!peerEncPublicKeyB64 || !senderSignPublicKeyB64) {
    return {
      ok: false,
      status: 'KEY_UNAVAILABLE',
      plaintext: '',
      errorReason: 'Sender or peer public keys are not available yet.',
    };
  }

  try {
    const s = await ensureSodiumReady();

    const transcript = buildSignatureTranscript({
      messageId: envelope.messageId,
      conversationId: envelope.conversationId,
      senderId: envelope.senderId,
      recipientId: envelope.recipientId,
      clientTimestamp: envelope.clientTimestamp,
      keyVersion: envelope.keyVersion,
      senderKeyVersion: envelope.senderKeyVersion,
      recipientKeyVersion: envelope.recipientKeyVersion,
      ephemeralPublicKey: envelope.ephemeralPublicKey,
      nonce: envelope.nonce,
      ciphertext: envelope.ciphertext,
    });

    const signatureBytes = fromBase64(s, envelope.signature);
    const senderSignPubBytes = fromBase64(s, senderSignPublicKeyB64);

    const isSigValid = s.crypto_sign_verify_detached(
      signatureBytes,
      transcript,
      senderSignPubBytes
    );

    if (!isSigValid) {
      return {
        ok: false,
        status: 'SIGNATURE_INVALID',
        plaintext: '',
        errorReason: 'Ed25519 digital signature verification failed.',
      };
    }

    const saltB64 = parseHkdfSaltB64(envelope.ephemeralPublicKey);
    const messageKey = await deriveConversationMessageKey({
      myEncPrivateKeyB64,
      peerEncPublicKeyB64,
      conversationId: envelope.conversationId,
      keyVersion: envelope.keyVersion,
      saltB64,
    });

    const aadBytes = buildAssociatedData({
      messageId: envelope.messageId,
      conversationId: envelope.conversationId,
      senderId: envelope.senderId,
      recipientId: envelope.recipientId,
      clientTimestamp: envelope.clientTimestamp,
      keyVersion: envelope.keyVersion,
    });

    const ciphertextBytes = fromBase64(s, envelope.ciphertext);
    const nonceBytes = fromBase64(s, envelope.nonce);

    try {
      const plaintextBytes = s.crypto_aead_xchacha20poly1305_ietf_decrypt(
        null,
        ciphertextBytes,
        aadBytes,
        nonceBytes,
        messageKey
      );
      messageKey.fill(0);
      const plaintext = new TextDecoder().decode(plaintextBytes);
      return {
        ok: true,
        status: 'VERIFIED',
        plaintext,
      };
    } catch {
      messageKey.fill(0);
      return {
        ok: false,
        status: 'CIPHERTEXT_TAMPERED',
        plaintext: '',
        errorReason: 'XChaCha20-Poly1305 authentication tag rejected modified or mismatched ciphertext.',
      };
    }
  } catch (err) {
    return {
      ok: false,
      status: 'CIPHERTEXT_TAMPERED',
      plaintext: '',
      errorReason: err instanceof Error ? err.message : 'Cryptographic verification failed',
    };
  }
}
