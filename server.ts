import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { createApp } from './backend/app.ts';
import { connectDatabase } from './backend/config/db.ts';
import { env } from './backend/config/env.ts';
import { initSocketServer } from './backend/sockets/chatSocket.ts';

async function startServer(): Promise<void> {
  const app = createApp();
  const httpServer = http.createServer(app);
  initSocketServer(httpServer);

  const distDir = path.resolve(process.cwd(), 'dist');
  const isProd = env.nodeEnv === 'production' || fs.existsSync(path.join(distDir, 'index.html'));

  if (env.nodeEnv !== 'production' && process.env.SKIP_VITE !== 'true') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (isProd && fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
        next();
        return;
      }
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  connectDatabase().catch((err) => {
    console.error(
      '[CipherLine] Background database initialization error:',
      err instanceof Error ? err.message : err
    );
  });

  httpServer.listen(env.port, '0.0.0.0', () => {
    console.log(`[CipherLine] Server listening on http://0.0.0.0:${env.port}`);
  });
}

startServer().catch((err) => {
  console.error('[CipherLine] Fatal startup error:', err);
  process.exit(1);
});
