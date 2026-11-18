import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.ts';
import { User } from '../models/User.ts';
import { isValidObjectId } from '../utils/validation.ts';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function listUsers(req: AuthenticatedRequest, res: Response): Promise<void> {
  const searchRaw = typeof req.query.search === 'string' ? req.query.search.trim() : '';

  const filter: Record<string, unknown> = {};
  if (req.user?.id) {
    filter._id = { $ne: req.user.id };
  }

  if (searchRaw) {
    const safePattern = escapeRegex(searchRaw.slice(0, 32));
    filter.username = { $regex: safePattern, $options: 'i' };
  }

  const users = await User.find(filter)
    .select('username email encryptionPublicKey signingPublicKey fingerprint keyVersion isOnline lastSeen createdAt')
    .sort({ isOnline: -1, username: 1 })
    .limit(50)
    .lean();

  res.status(200).json({
    users: users.map((u) => ({
      id: String(u._id),
      username: u.username,
      encryptionPublicKey: u.encryptionPublicKey,
      signingPublicKey: u.signingPublicKey,
      fingerprint: u.fingerprint,
      keyVersion: u.keyVersion,
      isOnline: u.isOnline,
      lastSeen: u.lastSeen,
      createdAt: u.createdAt,
    })),
  });
}

export async function getUserById(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = String(req.params.id || '');
  if (!isValidObjectId(userId)) {
    res.status(400).json({ error: 'Invalid user ID' });
    return;
  }

  const user = await User.findById(userId)
    .select('username encryptionPublicKey signingPublicKey fingerprint keyVersion isOnline lastSeen createdAt')
    .lean();

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.status(200).json({
    user: {
      id: String(user._id),
      username: user.username,
      encryptionPublicKey: user.encryptionPublicKey,
      signingPublicKey: user.signingPublicKey,
      fingerprint: user.fingerprint,
      keyVersion: user.keyVersion,
      isOnline: user.isOnline,
      lastSeen: user.lastSeen,
      createdAt: user.createdAt,
    },
  });
}
