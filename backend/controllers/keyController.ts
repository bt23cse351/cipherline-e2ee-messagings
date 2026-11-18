import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.ts';
import { User } from '../models/User.ts';
import { logSecurityEvent } from '../utils/securityLogger.ts';
import {
  computePublicKeyFingerprint,
  isValidObjectId,
  publishKeysSchema,
} from '../utils/validation.ts';

export async function publishKeys(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const rawBody = req.body as Record<string, unknown>;
  if (
    'encryptionPrivateKey' in rawBody ||
    'signingPrivateKey' in rawBody ||
    'privateKey' in rawBody
  ) {
    res.status(400).json({
      error: 'Private keys must never be sent to the server',
    });
    return;
  }

  const parsed = publishKeysSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Invalid key publication payload',
    });
    return;
  }

  const { encryptionPublicKey, signingPublicKey, fingerprint } = parsed.data;
  const expectedFingerprint = computePublicKeyFingerprint(encryptionPublicKey, signingPublicKey);

  if (expectedFingerprint !== fingerprint) {
    res.status(400).json({
      error: 'Fingerprint does not match provided X25519 + Ed25519 public keys',
    });
    return;
  }

  const user = await User.findById(req.user.id);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const keysChanged =
    Boolean(user.encryptionPublicKey) &&
    (user.encryptionPublicKey !== encryptionPublicKey ||
      user.signingPublicKey !== signingPublicKey);

  user.encryptionPublicKey = encryptionPublicKey;
  user.signingPublicKey = signingPublicKey;
  user.fingerprint = expectedFingerprint;
  if (keysChanged) {
    user.keyVersion += 1;
  }
  await user.save();

  await logSecurityEvent({
    userId: String(user._id),
    action: 'KEY_PUBLISH',
    result: 'SUCCESS',
    detail: `Published public keys (keyVersion=${user.keyVersion})`,
  });

  res.status(200).json({
    userId: String(user._id),
    username: user.username,
    encryptionPublicKey: user.encryptionPublicKey,
    signingPublicKey: user.signingPublicKey,
    fingerprint: user.fingerprint,
    keyVersion: user.keyVersion,
  });
}

export async function getUserKeys(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = String(req.params.userId || '');
  if (!isValidObjectId(userId)) {
    res.status(400).json({ error: 'Invalid user ID' });
    return;
  }

  const user = await User.findById(userId)
    .select('username encryptionPublicKey signingPublicKey fingerprint keyVersion')
    .lean();

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  if (!user.encryptionPublicKey || !user.signingPublicKey) {
    res.status(404).json({ error: 'User has not published encryption keys yet' });
    return;
  }

  res.status(200).json({
    userId: String(user._id),
    username: user.username,
    encryptionPublicKey: user.encryptionPublicKey,
    signingPublicKey: user.signingPublicKey,
    fingerprint: user.fingerprint,
    keyVersion: user.keyVersion,
  });
}
