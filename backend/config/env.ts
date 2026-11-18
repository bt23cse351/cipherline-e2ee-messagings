import crypto from 'node:crypto';
import dotenv from 'dotenv';

dotenv.config();

const rawSecret = process.env.JWT_SECRET;
const isPlaceholderSecret =
  !rawSecret ||
  rawSecret.includes('REPLACE_WITH') ||
  rawSecret.length < 32;

const runtimeSecret = isPlaceholderSecret
  ? crypto.randomBytes(48).toString('hex')
  : rawSecret;

if (isPlaceholderSecret && process.env.NODE_ENV !== 'test') {
  console.warn(
    '[CipherLine] JWT_SECRET not configured or too short; using ephemeral CSPRNG secret for this process.'
  );
}

const explicitCors = (process.env.CORS_ORIGIN || '').trim();
const autoOrigins = [
  process.env.APP_URL,
  process.env.RENDER_EXTERNAL_URL,
  process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '',
]
  .map((u) => (u || '').trim())
  .filter(Boolean);

const defaultCors = ['http://localhost:3000', 'http://localhost:5173'];

export const env = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  mongodbUri: (process.env.MONGODB_URI || '').trim(),
  jwtSecret: runtimeSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  hasExplicitCors: Boolean(explicitCors),
  corsOrigins: Array.from(
    new Set([
      ...(explicitCors
        ? explicitCors.split(',').map((o) => o.trim()).filter(Boolean)
        : defaultCors),
      ...autoOrigins,
    ])
  ),
};
