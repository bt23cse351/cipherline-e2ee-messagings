import argon2 from 'argon2';
import type { Request, Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.ts';
import { User } from '../models/User.ts';
import { revokeToken, signAuthToken } from '../utils/jwt.ts';
import { logSecurityEvent } from '../utils/securityLogger.ts';
import {
  computePublicKeyFingerprint,
  isValidBase64ByteLength,
  loginSchema,
  registerSchema,
} from '../utils/validation.ts';

function serializeUser(user: {
  _id: unknown;
  username: string;
  email: string;
  encryptionPublicKey: string;
  signingPublicKey: string;
  fingerprint: string;
  keyVersion: number;
  isOnline: boolean;
  lastSeen: Date;
  createdAt: Date;
}) {
  return {
    id: String(user._id),
    username: user.username,
    email: user.email,
    encryptionPublicKey: user.encryptionPublicKey,
    signingPublicKey: user.signingPublicKey,
    fingerprint: user.fingerprint,
    keyVersion: user.keyVersion,
    isOnline: user.isOnline,
    lastSeen: user.lastSeen,
    createdAt: user.createdAt,
  };
}

export async function register(req: Request, res: Response): Promise<void> {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Invalid registration data',
    });
    return;
  }

  const { username, email, password, encryptionPublicKey, signingPublicKey, fingerprint } =
    parsed.data;

  const rawBody = req.body as Record<string, unknown>;
  if (
    'encryptionPrivateKey' in rawBody ||
    'signingPrivateKey' in rawBody ||
    'privateKey' in rawBody
  ) {
    res.status(400).json({
      error: 'Private keys must never be transmitted to the server',
    });
    return;
  }

  const existing = await User.findOne({
    $or: [{ username }, { email }],
  }).lean();

  if (existing) {
    res.status(409).json({
      error:
        existing.username === username
          ? 'Username is already taken'
          : 'An account with this email already exists',
    });
    return;
  }

  let verifiedEncPub = '';
  let verifiedSignPub = '';
  let verifiedFingerprint = '';

  if (encryptionPublicKey || signingPublicKey || fingerprint) {
    if (
      !encryptionPublicKey ||
      !signingPublicKey ||
      !fingerprint ||
      !isValidBase64ByteLength(encryptionPublicKey, 32) ||
      !isValidBase64ByteLength(signingPublicKey, 32)
    ) {
      res.status(400).json({
        error: 'Invalid client public key bundle',
      });
      return;
    }
    const expectedFp = computePublicKeyFingerprint(encryptionPublicKey, signingPublicKey);
    if (expectedFp !== fingerprint.toUpperCase()) {
      res.status(400).json({
        error: 'Public key fingerprint verification failed',
      });
      return;
    }
    verifiedEncPub = encryptionPublicKey;
    verifiedSignPub = signingPublicKey;
    verifiedFingerprint = expectedFp;
  }

  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });

  const user = await User.create({
    username,
    email,
    passwordHash,
    encryptionPublicKey: verifiedEncPub,
    signingPublicKey: verifiedSignPub,
    fingerprint: verifiedFingerprint,
    keyVersion: 1,
    isOnline: false,
    lastSeen: new Date(),
  });

  const { token, expiresAt } = signAuthToken(String(user._id), user.username);

  await logSecurityEvent({
    userId: String(user._id),
    action: 'REGISTER',
    result: 'SUCCESS',
    detail: `Account registered for @${user.username}`,
  });

  res.status(201).json({
    token,
    expiresAt: expiresAt.toISOString(),
    user: serializeUser(user),
  });
}

export async function login(req: Request, res: Response): Promise<void> {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid credentials',
    });
    return;
  }

  const identifier = parsed.data.identifier.toLowerCase();
  const password = parsed.data.password;

  const user = await User.findOne({
    $or: [{ username: identifier }, { email: identifier }],
  }).select('+passwordHash');

  if (!user) {
    await logSecurityEvent({
      action: 'LOGIN_FAILURE',
      result: 'FAILURE',
      detail: 'Unknown identifier login attempt',
    });
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const isPasswordValid = await argon2.verify(user.passwordHash, password);
  if (!isPasswordValid) {
    await logSecurityEvent({
      userId: String(user._id),
      action: 'LOGIN_FAILURE',
      result: 'FAILURE',
      detail: `Failed password check for @${user.username}`,
    });
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const { token, expiresAt } = signAuthToken(String(user._id), user.username);

  await logSecurityEvent({
    userId: String(user._id),
    action: 'LOGIN_SUCCESS',
    result: 'SUCCESS',
    detail: `Authenticated session issued for @${user.username}`,
  });

  res.status(200).json({
    token,
    expiresAt: expiresAt.toISOString(),
    user: serializeUser(user),
  });
}

export async function logout(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  await revokeToken(req.user.jti, req.user.exp);
  await User.findByIdAndUpdate(req.user.id, {
    isOnline: false,
    lastSeen: new Date(),
  });

  await logSecurityEvent({
    userId: req.user.id,
    action: 'LOGOUT',
    result: 'SUCCESS',
    detail: `Session revoked for @${req.user.username}`,
  });

  res.status(200).json({ message: 'Logged out successfully' });
}

export async function getMe(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const user = await User.findById(req.user.id).lean();
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.status(200).json({
    user: serializeUser(user),
  });
}
