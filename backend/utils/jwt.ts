import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.ts';
import { RevokedToken } from '../models/RevokedToken.ts';

export interface AuthTokenPayload {
  sub: string;
  username: string;
  jti: string;
  iat?: number;
  exp?: number;
}

export function signAuthToken(userId: string, username: string): {
  token: string;
  jti: string;
  expiresAt: Date;
} {
  const jti = crypto.randomUUID();
  const token = jwt.sign(
    {
      sub: userId,
      username,
      jti,
    },
    env.jwtSecret,
    {
      expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'],
      algorithm: 'HS256',
    }
  );

  const decoded = jwt.decode(token) as jwt.JwtPayload | null;
  const expSeconds = decoded?.exp ?? Math.floor(Date.now() / 1000) + 43200;

  return {
    token,
    jti,
    expiresAt: new Date(expSeconds * 1000),
  };
}

export async function verifyAuthToken(token: string): Promise<AuthTokenPayload> {
  const decoded = jwt.verify(token, env.jwtSecret, {
    algorithms: ['HS256'],
  }) as AuthTokenPayload;

  if (!decoded?.sub || !decoded?.jti) {
    throw new Error('Malformed token claims');
  }

  const revoked = await RevokedToken.exists({ jti: decoded.jti });
  if (revoked) {
    throw new Error('Token has been revoked');
  }

  return decoded;
}

export async function revokeToken(jti: string, expUnix?: number): Promise<void> {
  const expiresAt = expUnix ? new Date(expUnix * 1000) : new Date(Date.now() + 24 * 3600 * 1000);
  await RevokedToken.updateOne(
    { jti },
    { $setOnInsert: { jti, expiresAt } },
    { upsert: true }
  );
}
