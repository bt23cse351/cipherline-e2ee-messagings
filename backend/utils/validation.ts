import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { z } from 'zod';

const BASE64_REGEX = /^[A-Za-z0-9+/]+={0,2}$/;

export function isValidObjectId(value: string): boolean {
  return mongoose.Types.ObjectId.isValid(value);
}

export function isValidBase64ByteLength(value: string, expectedBytes: number): boolean {
  if (!BASE64_REGEX.test(value)) {
    return false;
  }
  try {
    const buf = Buffer.from(value, 'base64');
    return buf.length === expectedBytes;
  } catch {
    return false;
  }
}

export function computePublicKeyFingerprint(
  encryptionPublicKeyBase64: string,
  signingPublicKeyBase64: string
): string {
  const encBytes = Buffer.from(encryptionPublicKeyBase64, 'base64');
  const signBytes = Buffer.from(signingPublicKeyBase64, 'base64');
  const combined = Buffer.concat([encBytes, signBytes]);
  return crypto.createHash('sha256').update(combined).digest('hex').toUpperCase();
}

export const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'Username must be at least 3 characters')
    .max(24, 'Username must be at most 24 characters')
    .regex(/^[a-z0-9_]+$/, 'Username may contain only lowercase letters, numbers, and underscores'),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Valid email address is required')
    .max(120, 'Email is too long'),
  password: z
    .string()
    .min(10, 'Password must be at least 10 characters')
    .max(128, 'Password must be at most 128 characters')
    .regex(/[A-Z]/, 'Password must include at least one uppercase letter')
    .regex(/[a-z]/, 'Password must include at least one lowercase letter')
    .regex(/[0-9]/, 'Password must include at least one digit')
    .regex(/[^A-Za-z0-9]/, 'Password must include at least one special character'),
  encryptionPublicKey: z.string().optional(),
  signingPublicKey: z.string().optional(),
  fingerprint: z.string().optional(),
});

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Username or email is required').max(120),
  password: z.string().min(1, 'Password is required').max(128),
});

export const publishKeysSchema = z.object({
  encryptionPublicKey: z
    .string()
    .refine((val) => isValidBase64ByteLength(val, 32), 'Invalid 32-byte X25519 encryption public key'),
  signingPublicKey: z
    .string()
    .refine((val) => isValidBase64ByteLength(val, 32), 'Invalid 32-byte Ed25519 signing public key'),
  fingerprint: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[0-9A-F]{64}$/, 'Invalid SHA-256 fingerprint format'),
});

export const createConversationSchema = z.object({
  recipientId: z.string().refine(isValidObjectId, 'Invalid recipient ID'),
});

export const sendMessageSchema = z.object({
  messageId: z
    .string()
    .trim()
    .min(12)
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/, 'Invalid messageId format'),
  conversationId: z.string().refine(isValidObjectId, 'Invalid conversationId'),
  recipientId: z.string().refine(isValidObjectId, 'Invalid recipientId'),
  ciphertext: z
    .string()
    .min(16, 'Ciphertext missing')
    .max(65536, 'Encrypted payload exceeds 64KB limit')
    .regex(BASE64_REGEX, 'Ciphertext must be Base64 encoded'),
  nonce: z
    .string()
    .refine((val) => isValidBase64ByteLength(val, 24), 'Nonce must be 24-byte Base64 for XChaCha20-Poly1305'),
  ephemeralPublicKey: z
    .string()
    .min(16)
    .max(256)
    .regex(/^[A-Za-z0-9+/=:-]+$/, 'Invalid HKDF session salt reference'),
  signature: z
    .string()
    .refine((val) => isValidBase64ByteLength(val, 64), 'Signature must be 64-byte Ed25519 Base64'),
  keyVersion: z.number().int().min(1),
  senderKeyVersion: z.number().int().min(1),
  recipientKeyVersion: z.number().int().min(1),
  clientTimestamp: z
    .string()
    .refine((val) => !Number.isNaN(Date.parse(val)), 'clientTimestamp must be a valid ISO-8601 timestamp'),
});
