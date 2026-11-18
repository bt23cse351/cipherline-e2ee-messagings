export interface PublicUser {
  id: string;
  username: string;
  email?: string;
  encryptionPublicKey: string;
  signingPublicKey: string;
  fingerprint: string;
  keyVersion: number;
  isOnline: boolean;
  lastSeen: string;
  createdAt?: string;
}

export interface ClientKeyBundle {
  encryptionPublicKey: string;
  encryptionPrivateKey: string;
  signingPublicKey: string;
  signingPrivateKey: string;
  fingerprint: string;
  keyVersion: number;
  createdAt: string;
}

export interface EncryptedMessageEnvelope {
  id?: string;
  messageId: string;
  conversationId: string;
  senderId: string;
  recipientId: string;
  ciphertext: string;
  nonce: string;
  ephemeralPublicKey: string;
  signature: string;
  keyVersion: number;
  senderKeyVersion: number;
  recipientKeyVersion: number;
  clientTimestamp: string;
  deliveredAt?: string | null;
  readAt?: string | null;
  createdAt?: string;
}

export interface DecryptedMessageItem {
  envelope: EncryptedMessageEnvelope;
  plaintext: string;
  signatureValid: boolean;
  decryptionOk: boolean;
  securityError?: string;
  errorType?: 'SIGNATURE_INVALID' | 'DECRYPTION_FAILED' | 'KEY_MISMATCH' | 'VAULT_LOCKED';
}

export interface ConversationSummary {
  id: string;
  participants: PublicUser[];
  peer: PublicUser;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
  unreadCount: number;
  lastMessage: EncryptedMessageEnvelope | null;
}

export interface SecurityLogItem {
  id: string;
  action: string;
  result: 'SUCCESS' | 'FAILURE' | 'BLOCKED';
  detail: string;
  timestamp: string;
}

export interface VerifiedContactRecord {
  userId: string;
  username: string;
  fingerprint: string;
  keyVersion: number;
  verifiedAt: string;
}
