import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { env } from './env.ts';

let memoryServer: MongoMemoryServer | null = null;
let activeDbMode: 'external' | 'embedded' = 'external';
let lastDbError: string | null = null;
let connectingPromise: Promise<{
  uri: string;
  mode: 'external' | 'embedded';
}> | null = null;

function isDbConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

export async function connectDatabase(customUri?: string): Promise<{
  uri: string;
  mode: 'external' | 'embedded';
}> {
  if (isDbConnected()) {
    return {
      uri: mongoose.connection.host,
      mode: activeDbMode,
    };
  }

  if (connectingPromise && !customUri) {
    return connectingPromise;
  }

  const runConnect = async (): Promise<{
    uri: string;
    mode: 'external' | 'embedded';
  }> => {
    lastDbError = null;
    const targetUri = (customUri || env.mongodbUri || '').trim();
    const isPlaceholderUri =
      targetUri.includes('<') ||
      targetUri.includes('>') ||
      targetUri.includes('REPLACE_WITH');

    if (targetUri && !isPlaceholderUri) {
      try {
        await mongoose.connect(targetUri, {
          serverSelectionTimeoutMS: 5000,
        });
        activeDbMode = 'external';
        console.log('[CipherLine] Connected to external MongoDB instance.');
        return { uri: targetUri, mode: 'external' };
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'connection error';
        console.log(
          `[CipherLine] External MongoDB connection skipped (${reason}); using embedded MongoDB.`
        );
        await mongoose.disconnect().catch(() => {});
      }
    } else if (isPlaceholderUri) {
      console.log(
        '[CipherLine] MONGODB_URI contains placeholder text (<db_password>); using embedded MongoDB.'
      );
    }

    const usePersistDir =
      process.env.PERSIST_EMBEDDED_DB === 'true' &&
      process.env.NODE_ENV !== 'test' &&
      process.env.NODE_ENV !== 'production';

    if (usePersistDir) {
      const persistDir = path.resolve(process.cwd(), '.data', 'mongodb');
      fs.mkdirSync(persistDir, { recursive: true });
      try {
        memoryServer = await MongoMemoryServer.create({
          instance: {
            dbPath: persistDir,
            storageEngine: 'wiredTiger',
          },
        });
      } catch {
        memoryServer = await MongoMemoryServer.create();
      }
    } else {
      memoryServer = await MongoMemoryServer.create();
    }

    const memoryUri = memoryServer.getUri('cipherline_e2ee');
    await mongoose.connect(memoryUri);
    activeDbMode = 'embedded';
    console.log('[CipherLine] Connected to embedded MongoDB.');
    return { uri: memoryUri, mode: 'embedded' };
  };

  const promise = runConnect()
    .catch((err) => {
      lastDbError = err instanceof Error ? err.message : 'Database connection failed';
      throw err;
    })
    .finally(() => {
      if (!customUri) {
        connectingPromise = null;
      }
    });

  if (!customUri) {
    connectingPromise = promise;
  }

  return promise;
}

export async function waitForDatabase(timeoutMs = 25000): Promise<boolean> {
  if (isDbConnected()) {
    return true;
  }
  if (!connectingPromise) {
    connectDatabase().catch(() => {});
  }
  if (!connectingPromise) {
    return isDbConnected();
  }

  try {
    await Promise.race([
      connectingPromise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('DB init timeout')), timeoutMs)
      ),
    ]);
    return isDbConnected();
  } catch {
    return isDbConnected();
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
}

export function getDatabaseMode(): 'external' | 'embedded' {
  return activeDbMode;
}

export function getDatabaseStatus() {
  return {
    ready: isDbConnected(),
    mode: activeDbMode,
    error: lastDbError,
  };
}
