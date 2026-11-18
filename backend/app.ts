import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { getDatabaseStatus, waitForDatabase } from './config/db.ts';
import { env } from './config/env.ts';
import { errorHandler } from './middleware/errorHandler.ts';
import { apiRateLimiter } from './middleware/rateLimit.ts';
import authRoutes from './routes/authRoutes.ts';
import conversationRoutes from './routes/conversationRoutes.ts';
import keyRoutes from './routes/keyRoutes.ts';
import messageRoutes from './routes/messageRoutes.ts';
import securityRoutes from './routes/securityRoutes.ts';
import userRoutes from './routes/userRoutes.ts';

export function createBackendApp(): Express {
  const app = express();

  app.set('trust proxy', 1);

  app.use(
    helmet({
      // Allow preview iframe embedding while retaining nosniff, referrer-policy, etc.
      xFrameOptions: false,
      contentSecurityPolicy: false,
    })
  );

  app.use(
    cors({
      origin:
        env.nodeEnv === 'production' && env.hasExplicitCors ? env.corsOrigins : true,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  // Enforce strict payload size limits
  app.use(express.json({ limit: '128kb' }));
  app.use(express.urlencoded({ extended: false, limit: '32kb' }));

  app.get('/api/health', (_req, res) => {
    const db = getDatabaseStatus();
    res.status(200).json({
      status: 'ok',
      service: 'cipherline-e2ee-backend',
      dbReady: db.ready,
      dbMode: db.mode,
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api', apiRateLimiter);

  // Ensure DB has finished initializing before handling API data routes
  app.use('/api', async (_req, res, next) => {
    const ready = await waitForDatabase(20000);
    if (!ready) {
      res.status(503).json({
        error: 'Database is still initializing. Please try again in a few seconds.',
      });
      return;
    }
    next();
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/keys', keyRoutes);
  app.use('/api/conversations', conversationRoutes);
  app.use('/api/messages', messageRoutes);
  app.use('/api/security', securityRoutes);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
  });

  app.use(errorHandler);
  return app;
}
