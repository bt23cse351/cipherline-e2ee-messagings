export interface UserProfile {
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

export interface PublicKeyBundle {
  userId: string;
  username: string;
  encryptionPublicKey: string;
  signingPublicKey: string;
  fingerprint: string;
  keyVersion: number;
}

export interface IdentityKeyBundle {
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
  deliveredAt: string | null;
  readAt: string | null;
  createdAt?: string;
}

export type VerificationStatus =
  | 'VERIFIED'
  | 'SIGNATURE_INVALID'
  | 'CIPHERTEXT_TAMPERED'
  | 'KEY_UNAVAILABLE'
  | 'LOCKED';

export interface DecryptedMessage {
  envelope: EncryptedMessageEnvelope;
  plaintext: string;
  status: VerificationStatus;
  errorReason?: string;
}

export interface ConversationSummary {
  id: string;
  participants: UserProfile[];
  peer: UserProfile;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
  unreadCount: number;
  lastMessage: EncryptedMessageEnvelope | null;
}

export interface SecurityLogEntry {
  id: string;
  action:
    | 'REGISTER'
    | 'LOGIN_SUCCESS'
    | 'LOGIN_FAILURE'
    | 'LOGOUT'
    | 'KEY_PUBLISH'
    | 'CONVERSATION_CREATE'
    | 'MESSAGE_SENT'
    | 'UNAUTHORIZED_ACCESS'
    | 'SIGNATURE_WARNING';
  result: 'SUCCESS' | 'FAILURE' | 'BLOCKED';
  detail: string;
  timestamp: string;
}

export interface VerifiedContactRecord {
  userId: string;
  username: string;
  fingerprint: string;
  safetyNumber: string;
  verifiedAt: string;
}
