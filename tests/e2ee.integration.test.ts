import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { createBackendApp } from '../backend/app.ts';
import { env } from '../backend/config/env.ts';
import { Conversation } from '../backend/models/Conversation.ts';
import { Message } from '../backend/models/Message.ts';
import { RevokedToken } from '../backend/models/RevokedToken.ts';
import { SecurityLog } from '../backend/models/SecurityLog.ts';
import { User } from '../backend/models/User.ts';
import { initSocketServer } from '../backend/sockets/chatSocket.ts';
import {
  buildHkdfContextInfo,
  deriveMessageKeyHKDF,
  deriveX25519SharedSecret,
  encryptAndSignMessage,
  generateIdentityKeyBundle,
  verifyAndDecryptMessage,
} from '../src/crypto/e2ee.ts';
import type { ClientKeyBundle, EncryptedMessageEnvelope } from '../src/types/messaging.ts';

interface TestResult {
  category: string;
  name: string;
  passed: boolean;
  detail: string;
}

const results: TestResult[] = [];

async function runCase(category: string, name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    results.push({ category, name, passed: true, detail: 'Passed' });
    console.log(`  [PASS] (${category}) ${name}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ category, name, passed: false, detail: msg });
    console.error(`  [FAIL] (${category}) ${name}: ${msg}`);
    throw err;
  }
}

async function apiJson(
  baseUrl: string,
  urlPath: string,
  method: string,
  body?: unknown,
  token?: string
): Promise<{ status: number; data: Record<string, unknown> }> {
  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, data };
}

async function main() {
  process.env.NODE_ENV = 'test';
  const dbTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cipherline-persist-'));
  let mongod: MongoMemoryServer | null = null;
  let server: http.Server | null = null;

  try {
    mongod = await MongoMemoryServer.create({
      instance: {
        dbPath: dbTempDir,
        storageEngine: 'wiredTiger',
      },
    });
    const mongoUri = mongod.getUri('cipherline_test');
    await mongoose.connect(mongoUri);
    await Promise.all([
      User.init(),
      Conversation.init(),
      Message.init(),
      SecurityLog.init(),
      RevokedToken.init(),
    ]);

    const app = createBackendApp();
    server = http.createServer(app);
    const io = initSocketServer(server);

    await new Promise<void>((resolve) => {
      server!.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address();
    assert.ok(addr && typeof addr === 'object');
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    console.log(`\nRunning CipherLine E2EE Security & Integration Tests against ${baseUrl}\n`);

    let aliceKeys!: ClientKeyBundle;
    let bobKeys!: ClientKeyBundle;
    let malloryKeys!: ClientKeyBundle;
    let aliceToken = '';
    let bobToken = '';
    let malloryToken = '';
    let aliceId = '';
    let bobId = '';
    let malloryId = '';
    let convId = '';
    let savedEnvelope!: EncryptedMessageEnvelope;
    const secretPlaintext = 'Confidential BTech CSE E2EE Viva Message #42!';

    // 1. Authentication Tests
    await runCase('Authentication', 'Register accounts with Argon2id + public keys', async () => {
      aliceKeys = await generateIdentityKeyBundle(1);
      bobKeys = await generateIdentityKeyBundle(1);
      malloryKeys = await generateIdentityKeyBundle(1);

      const resA = await apiJson(baseUrl, '/api/auth/register', 'POST', {
        username: 'alice_test',
        email: 'alice@example.edu',
        password: 'StrongPassword!99',
        encryptionPublicKey: aliceKeys.encryptionPublicKey,
        signingPublicKey: aliceKeys.signingPublicKey,
        fingerprint: aliceKeys.fingerprint,
      });
      assert.equal(resA.status, 201);
      aliceToken = String(resA.data.token);
      aliceId = String((resA.data.user as { id: string }).id);

      const resB = await apiJson(baseUrl, '/api/auth/register', 'POST', {
        username: 'bob_test',
        email: 'bob@example.edu',
        password: 'StrongPassword!88',
        encryptionPublicKey: bobKeys.encryptionPublicKey,
        signingPublicKey: bobKeys.signingPublicKey,
        fingerprint: bobKeys.fingerprint,
      });
      assert.equal(resB.status, 201);
      bobToken = String(resB.data.token);
      bobId = String((resB.data.user as { id: string }).id);

      const resM = await apiJson(baseUrl, '/api/auth/register', 'POST', {
        username: 'mallory_test',
        email: 'mallory@example.edu',
        password: 'StrongPassword!77',
        encryptionPublicKey: malloryKeys.encryptionPublicKey,
        signingPublicKey: malloryKeys.signingPublicKey,
        fingerprint: malloryKeys.fingerprint,
      });
      assert.equal(resM.status, 201);
      malloryToken = String(resM.data.token);
      malloryId = String((resM.data.user as { id: string }).id);

      const dbAlice = await User.findById(aliceId).select('+passwordHash').lean();
      assert.ok(dbAlice?.passwordHash.startsWith('$argon2id$'));
    });

    await runCase('Authentication', 'Reject duplicate username or email', async () => {
      const dup = await apiJson(baseUrl, '/api/auth/register', 'POST', {
        username: 'alice_test',
        email: 'alice_other@example.edu',
        password: 'StrongPassword!99',
      });
      assert.equal(dup.status, 409);
    });

    await runCase('Authentication', 'Login with correct password', async () => {
      const loginOk = await apiJson(baseUrl, '/api/auth/login', 'POST', {
        identifier: 'alice_test',
        password: 'StrongPassword!99',
      });
      assert.equal(loginOk.status, 200);
      assert.ok(typeof loginOk.data.token === 'string');
      aliceToken = String(loginOk.data.token);
    });

    await runCase('Authentication', 'Reject incorrect password with generic error', async () => {
      const badPass = await apiJson(baseUrl, '/api/auth/login', 'POST', {
        identifier: 'alice_test',
        password: 'WrongPassword!123',
      });
      assert.equal(badPass.status, 401);
      assert.equal(badPass.data.error, 'Invalid credentials');
    });

    await runCase('Authentication', 'Reject invalid, expired, and revoked JWTs', async () => {
      const expired = jwt.sign(
        { sub: aliceId, username: 'alice_test', jti: 'exp-jti-1' },
        env.jwtSecret,
        { expiresIn: -10 }
      );
      const resExp = await apiJson(baseUrl, '/api/auth/me', 'GET', undefined, expired);
      assert.equal(resExp.status, 401);

      const resBad = await apiJson(baseUrl, '/api/auth/me', 'GET', undefined, 'bad.jwt.token');
      assert.equal(resBad.status, 401);

      // Logout revokes active JWT
      const tempLogin = await apiJson(baseUrl, '/api/auth/login', 'POST', {
        identifier: 'mallory_test',
        password: 'StrongPassword!77',
      });
      const tempToken = String(tempLogin.data.token);
      const logoutRes = await apiJson(baseUrl, '/api/auth/logout', 'POST', undefined, tempToken);
      assert.equal(logoutRes.status, 200);

      const afterLogout = await apiJson(baseUrl, '/api/auth/me', 'GET', undefined, tempToken);
      assert.equal(afterLogout.status, 401);
    });

    // 2. Key Exchange & Encryption Tests
    await runCase('Cryptography', 'Both clients derive identical X25519 + HKDF-SHA256 keys', async () => {
      const convRes = await apiJson(
        baseUrl,
        '/api/conversations',
        'POST',
        { recipientId: bobId },
        aliceToken
      );
      assert.equal(convRes.status, 201);
      convId = String((convRes.data.conversation as { id: string }).id);

      const secretAlice = await deriveX25519SharedSecret(
        aliceKeys.encryptionPrivateKey,
        bobKeys.encryptionPublicKey
      );
      const secretBob = await deriveX25519SharedSecret(
        bobKeys.encryptionPrivateKey,
        aliceKeys.encryptionPublicKey
      );
      assert.deepEqual(Buffer.from(secretAlice), Buffer.from(secretBob));

      const salt = new Uint8Array(16).fill(7);
      const info = buildHkdfContextInfo({
        conversationId: convId,
        senderId: aliceId,
        recipientId: bobId,
        senderKeyVersion: 1,
        recipientKeyVersion: 1,
      });
      const keyA = await deriveMessageKeyHKDF(secretAlice, salt, info);
      const keyB = await deriveMessageKeyHKDF(secretBob, salt, info);
      assert.deepEqual(Buffer.from(keyA), Buffer.from(keyB));
    });

    await runCase('Encryption', 'Encrypt on Alice, persist ciphertext in MongoDB, confirm plaintext absent, decrypt on Bob', async () => {
      savedEnvelope = await encryptAndSignMessage({
        plaintext: secretPlaintext,
        conversationId: convId,
        senderId: aliceId,
        recipientId: bobId,
        senderKeys: aliceKeys,
        recipientPublicKeys: {
          encryptionPublicKey: bobKeys.encryptionPublicKey,
          signingPublicKey: bobKeys.signingPublicKey,
          keyVersion: 1,
        },
      });

      const sendRes = await apiJson(baseUrl, '/api/messages', 'POST', savedEnvelope, aliceToken);
      assert.equal(sendRes.status, 201);

      const rawDbMsg = await Message.findOne({ messageId: savedEnvelope.messageId }).lean();
      assert.ok(rawDbMsg);
      const serializedRaw = JSON.stringify(rawDbMsg);
      assert.equal(serializedRaw.includes(secretPlaintext), false);
      assert.equal(serializedRaw.includes('Confidential BTech'), false);

      const bobDecrypt = await verifyAndDecryptMessage({
        envelope: savedEnvelope,
        myUserId: bobId,
        myKeys: bobKeys,
        senderSigningPublicKey: aliceKeys.signingPublicKey,
        peerEncryptionPublicKey: aliceKeys.encryptionPublicKey,
      });
      assert.equal(bobDecrypt.ok, true);
      assert.equal(bobDecrypt.signatureValid, true);
      assert.equal(bobDecrypt.plaintext, secretPlaintext);
    });

    // 3. Digital Signature Tests
    await runCase('Signatures', 'Reject modified ciphertext, modified signature, and wrong sender identity', async () => {
      const tamperedCipher = {
        ...savedEnvelope,
        ciphertext:
          (savedEnvelope.ciphertext[0] === 'A' ? 'B' : 'A') +
          savedEnvelope.ciphertext.slice(1),
      };
      const resTamperCipher = await verifyAndDecryptMessage({
        envelope: tamperedCipher,
        myUserId: bobId,
        myKeys: bobKeys,
        senderSigningPublicKey: aliceKeys.signingPublicKey,
        peerEncryptionPublicKey: aliceKeys.encryptionPublicKey,
      });
      assert.equal(resTamperCipher.ok, false);
      assert.equal(resTamperCipher.signatureValid, false);
      assert.equal(resTamperCipher.errorType, 'SIGNATURE_INVALID');

      const tamperedSig = {
        ...savedEnvelope,
        signature:
          (savedEnvelope.signature[0] === 'A' ? 'B' : 'A') +
          savedEnvelope.signature.slice(1),
      };
      const resTamperSig = await verifyAndDecryptMessage({
        envelope: tamperedSig,
        myUserId: bobId,
        myKeys: bobKeys,
        senderSigningPublicKey: aliceKeys.signingPublicKey,
        peerEncryptionPublicKey: aliceKeys.encryptionPublicKey,
      });
      assert.equal(resTamperSig.ok, false);
      assert.equal(resTamperSig.signatureValid, false);

      // Verify against wrong sender identity (Mallory's signing public key)
      const resWrongSender = await verifyAndDecryptMessage({
        envelope: savedEnvelope,
        myUserId: bobId,
        myKeys: bobKeys,
        senderSigningPublicKey: malloryKeys.signingPublicKey,
        peerEncryptionPublicKey: aliceKeys.encryptionPublicKey,
      });
      assert.equal(resWrongSender.ok, false);
      assert.equal(resWrongSender.signatureValid, false);
    });

    // 4. Authorization & Input Rejection Tests
    await runCase('Authorization', 'Reject unauthorized conversation read, send, read receipts, plaintext, and private keys', async () => {
      const unauthRead = await apiJson(
        baseUrl,
        `/api/messages/${convId}`,
        'GET',
        undefined,
        malloryToken
      );
      assert.equal(unauthRead.status, 403);

      const unauthSend = await apiJson(
        baseUrl,
        '/api/messages',
        'POST',
        savedEnvelope,
        malloryToken
      );
      assert.equal(unauthSend.status, 403);

      // Sender Alice cannot forge read receipt on her own sent message
      const unauthReceipt = await apiJson(
        baseUrl,
        `/api/messages/${savedEnvelope.messageId}/read`,
        'PATCH',
        undefined,
        aliceToken
      );
      assert.equal(unauthReceipt.status, 403);

      // Reject plaintext payloads
      const rejectPlaintext = await apiJson(
        baseUrl,
        '/api/messages',
        'POST',
        { plaintext: 'Hello unencrypted' },
        aliceToken
      );
      assert.equal(rejectPlaintext.status, 400);

      // Reject private key transmission
      const rejectPriv = await apiJson(
        baseUrl,
        '/api/keys/publish',
        'POST',
        {
          encryptionPublicKey: aliceKeys.encryptionPublicKey,
          signingPublicKey: aliceKeys.signingPublicKey,
          fingerprint: aliceKeys.fingerprint,
          privateKey: aliceKeys.encryptionPrivateKey,
        },
        aliceToken
      );
      assert.equal(rejectPriv.status, 400);
    });

    // 5. Real-time Socket.IO Tests
    await runCase('Realtime', 'Socket.IO auth, instant encrypted delivery, read receipts, and reconnection', async () => {
      // Unauthenticated socket rejected
      await new Promise<void>((resolve, reject) => {
        const badSock = ioClient(baseUrl, { auth: {}, reconnection: false });
        badSock.on('connect_error', () => {
          badSock.close();
          resolve();
        });
        badSock.on('connect', () => {
          badSock.close();
          reject(new Error('Unauthenticated socket should not connect'));
        });
      });

      const aliceSock: ClientSocket = ioClient(baseUrl, { auth: { token: aliceToken } });
      const bobSock: ClientSocket = ioClient(baseUrl, { auth: { token: bobToken } });

      await Promise.all([
        new Promise<void>((resolve) => aliceSock.on('connect', () => resolve())),
        new Promise<void>((resolve) => bobSock.on('connect', () => resolve())),
      ]);

      await new Promise<void>((resolve, reject) => {
        bobSock.emit('conversation:join', { conversationId: convId }, (ack: { ok: boolean }) => {
          if (ack?.ok) resolve();
          else reject(new Error('Bob failed to join conversation room'));
        });
      });

      // Unauthorized user Mallory cannot join Alice-Bob room
      const mallorySock: ClientSocket = ioClient(baseUrl, { auth: { token: malloryToken } });
      await new Promise<void>((resolve) => mallorySock.on('connect', () => resolve()));
      await new Promise<void>((resolve, reject) => {
        mallorySock.emit('conversation:join', { conversationId: convId }, (ack: { ok: boolean }) => {
          if (!ack?.ok) resolve();
          else reject(new Error('Mallory should be blocked from joining Alice-Bob room'));
        });
      });
      mallorySock.disconnect();

      const liveText = 'Real-time Socket.IO E2EE payload #2!';
      const liveEnvelope = await encryptAndSignMessage({
        plaintext: liveText,
        conversationId: convId,
        senderId: aliceId,
        recipientId: bobId,
        senderKeys: aliceKeys,
        recipientPublicKeys: {
          encryptionPublicKey: bobKeys.encryptionPublicKey,
          signingPublicKey: bobKeys.signingPublicKey,
          keyVersion: 1,
        },
      });

      const receivedByBob = new Promise<EncryptedMessageEnvelope>((resolve) => {
        bobSock.once('message:new', (msg: EncryptedMessageEnvelope) => resolve(msg));
      });
      const readByAlice = new Promise<{ messageId: string; readAt: string }>((resolve) => {
        aliceSock.once('message:read', (receipt: { messageId: string; readAt: string }) =>
          resolve(receipt)
        );
      });

      await new Promise<void>((resolve, reject) => {
        aliceSock.emit('message:send', liveEnvelope, (ack: { ok: boolean; error?: string }) => {
          if (ack?.ok) resolve();
          else reject(new Error(ack?.error || 'Socket send failed'));
        });
      });

      const deliveredEnv = await receivedByBob;
      assert.equal(deliveredEnv.messageId, liveEnvelope.messageId);
      const bobDecrypted = await verifyAndDecryptMessage({
        envelope: deliveredEnv,
        myUserId: bobId,
        myKeys: bobKeys,
        senderSigningPublicKey: aliceKeys.signingPublicKey,
        peerEncryptionPublicKey: aliceKeys.encryptionPublicKey,
      });
      assert.equal(bobDecrypted.ok, true);
      assert.equal(bobDecrypted.plaintext, liveText);

      // Bob emits read receipt
      bobSock.emit('message:read', { messageId: liveEnvelope.messageId });
      const receipt = await readByAlice;
      assert.equal(receipt.messageId, liveEnvelope.messageId);
      assert.ok(receipt.readAt);

      // Reconnection test
      bobSock.disconnect();
      bobSock.connect();
      await new Promise<void>((resolve) => bobSock.once('connect', () => resolve()));

      aliceSock.disconnect();
      bobSock.disconnect();
    });

    // 6. Database Indexes, Safe Logging, and Persistence After Restart
    await runCase('Database', 'Verify indexes, zero sensitive logging, and persistence across restart', async () => {
      const userIndexes = await User.collection.indexes();
      assert.ok(userIndexes.some((idx) => idx.key?.username === 1 && idx.unique));
      assert.ok(userIndexes.some((idx) => idx.key?.email === 1 && idx.unique));

      const msgIndexes = await Message.collection.indexes();
      assert.ok(msgIndexes.some((idx) => idx.key?.messageId === 1 && idx.unique));

      const logs = await SecurityLog.find({}).lean();
      assert.ok(logs.length > 0);
      const logsJson = JSON.stringify(logs);
      assert.equal(logsJson.includes(secretPlaintext), false);
      assert.equal(logsJson.includes('StrongPassword!99'), false);
      assert.equal(logsJson.includes(aliceKeys.encryptionPrivateKey), false);

      // Simulate server + MongoDB restart using same WiredTiger dbPath
      io.close();
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      await mongoose.disconnect();
      await mongod!.stop();

      mongod = await MongoMemoryServer.create({
        instance: {
          dbPath: dbTempDir,
          storageEngine: 'wiredTiger',
        },
      });
      await mongoose.connect(mongod.getUri('cipherline_test'));
      const persistedMessages = await Message.countDocuments({ conversationId: convId });
      assert.equal(persistedMessages, 2);
      const persistedAlice = await User.findById(aliceId).lean();
      assert.equal(persistedAlice?.username, 'alice_test');
      void malloryId;
    });

    console.log(`\nAll ${results.length} security & integration tests PASSED!\n`);
  } finally {
    if (server && server.listening) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    if (mongod) {
      await mongod.stop();
    }
    fs.rmSync(dbTempDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('\nIntegration suite failed:', err);
  process.exit(1);
});
