import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { createBackendApp } from './backend/app.ts';
import { connectDatabase, disconnectDatabase } from './backend/config/db.ts';
import { env } from './backend/config/env.ts';
import { initSocketServer } from './backend/sockets/chatSocket.ts';

async function startServer(): Promise<void> {
  // Start database initialization without blocking HTTP port binding
  // so Cloud Run / PaaS startup probes succeed immediately.
  connectDatabase().catch((err) => {
    console.error('[CipherLine] Initial database connection error:', err);
  });

  const app = createBackendApp();
  const httpServer = http.createServer(app);

  initSocketServer(httpServer);

  const isProduction = env.nodeEnv === 'production';

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  httpServer.listen(env.port, '0.0.0.0', () => {
    console.log(`[CipherLine] Server listening on http://0.0.0.0:${env.port}`);
  });

  const shutdown = async () => {
    console.log('[CipherLine] Shutting down gracefully...');
    httpServer.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

startServer().catch((err) => {
  console.error('[CipherLine] Fatal startup error:', err);
  process.exit(1);
});
