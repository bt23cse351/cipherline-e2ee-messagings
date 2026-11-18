import type { NextFunction, Request, Response } from 'express';
import { verifyAuthToken } from '../utils/jwt.ts';
import { logSecurityEvent } from '../utils/securityLogger.ts';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    username: string;
    jti: string;
    exp?: number;
  };
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const payload = await verifyAuthToken(token);
    req.user = {
      id: payload.sub,
      username: payload.username,
      jti: payload.jti,
      exp: payload.exp,
    };
    next();
  } catch {
    await logSecurityEvent({
      action: 'UNAUTHORIZED_ACCESS',
      result: 'BLOCKED',
      detail: `Rejected invalid or expired JWT on ${req.method} ${req.path}`,
    });
    res.status(401).json({ error: 'Session expired or invalid token' });
  }
}
