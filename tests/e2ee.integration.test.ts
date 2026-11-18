import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import sodium from 'libsodium-wrappers';
import { io as ioClient, type Socket } from 'socket.io-client';
import { createApp } from '../backend/app.ts';
import { connectDatabase, disconnectDatabase } from '../backend/config/db.ts';
import { Message } from '../backend/models/Message.ts';
import { User } from '../backend/models/User.ts';
import { initSocketServer } from '../backend/sockets/chatSocket.ts';

process.env.NODE_ENV = 'test';

interface TestKeys {
  encPubB64: string;
  encPriv: Uint8Array;
  signPubB64: string;
  signPriv: Uint8Array;
  fingerprint: string;
}

function generateTestKeys(): TestKeys {
  const enc = sodium.crypto_box_keypair();
  const sign = sodium.crypto_sign_keypair();
  const encPubB64 = sodium.to_base64(enc.publicKey, sodium.base64_variants.ORIGINAL);
  const signPubB64 = sodium.to_base64(sign.publicKey, sodium.base64_variants.ORIGINAL);
  const combined = Buffer.concat([
    Buffer.from(encPubB64, 'base64'),
    Buffer.from(signPubB64, 'base64'),
  ]);
  const fingerprint = crypto.createHash('sha256').update(combined).digest('hex').toUpperCase();
  return {
    encPubB64,
    encPriv: enc.privateKey,
    signPubB64,
    signPriv: sign.privateKey,
    fingerprint,
  };
}

async function deriveMessageKey(params: {
  myEncPriv: Uint8Array;
  peerEncPubB64: string;
  conversationId: string;
  keyVersion: number;
  saltB64: string;
}): Promise<Uint8Array> {
  const peerPub = sodium.from_base64(params.peerEncPubB64, sodium.base64_variants.ORIGINAL);
  const shared = sodium.crypto_scalarmult(params.myEncPriv, peerPub);
  const salt = sodium.from_base64(params.saltB64, sodium.base64_variants.ORIGINAL);
  const info = new TextEncoder().encode(
    `CipherLine-E2EE-v1|conv:${params.conversationId}|kv:${params.keyVersion}`
  );
  const ikm = await crypto.webcrypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.webcrypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    ikm,
    256
  );
  return new Uint8Array(bits);
}

async function buildEnvelope(params: {
  plaintext: string;
  conversationId: string;
  senderId: string;
  recipientId: string;
  senderKeys: TestKeys;
  recipientEncPubB64: string;
}) {
  const messageId = `msg_${crypto.randomBytes(12).toString('hex')}`;
  const clientTimestamp = new Date().toISOString();
  const keyVersion = 1;
  const salt = sodium.randombytes_buf(16);
  const saltB64 = sodium.to_base64(salt, sodium.base64_variants.ORIGINAL);
  const ephemeralPublicKey = `hkdf-v1:${saltB64}`;

  const msgKey = await deriveMessageKey({
    myEncPriv: params.senderKeys.encPriv,
    peerEncPubB64: params.recipientEncPubB64,
    conversationId: params.conversationId,
    keyVersion,
    saltB64,
  });

  const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const nonceB64 = sodium.to_base64(nonce, sodium.base64_variants.ORIGINAL);
  const aad = new TextEncoder().encode(
    `CipherLine-AAD-v1|${messageId}|${params.conversationId}|${params.senderId}|${params.recipientId}|${clientTimestamp}|${keyVersion}`
  );
  const ciphertextBytes = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    new TextEncoder().encode(params.plaintext),
    aad,
    null,
    nonce,
    msgKey
  );
  const ciphertextB64 = sodium.to_base64(ciphertextBytes, sodium.base64_variants.ORIGINAL);

  const transcript = new TextEncoder().encode(
    [
      'CipherLine-Sig-v1',
      messageId,
      params.conversationId,
      params.senderId,
      params.recipientId,
      clientTimestamp,
      String(keyVersion),
      '1',
      '1',
      ephemeralPublicKey,
      nonceB64,
      ciphertextB64,
    ].join('\n')
  );
  const sig = sodium.crypto_sign_detached(transcript, params.senderKeys.signPriv);
  const sigB64 = sodium.to_base64(sig, sodium.base64_variants.ORIGINAL);

  return {
    messageId,
    conversationId: params.conversationId,
    recipientId: params.recipientId,
    ciphertext: ciphertextB64,
    nonce: nonceB64,
    ephemeralPublicKey,
    signature: sigB64,
    keyVersion,
    senderKeyVersion: 1,
    recipientKeyVersion: 1,
    clientTimestamp,
  };
}

async function verifyAndDecrypt(params: {
  envelope: Record<string, unknown> & {
    messageId: string;
    conversationId: string;
    senderId: string;
    recipientId: string;
    ciphertext: string;
    nonce: string;
    ephemeralPublicKey: string;
    signature: string;
    keyVersion: number;
    senderKeyVersion: number;
    recipientKeyVersion: number;
    clientTimestamp: string;
  };
  myEncPriv: Uint8Array;
  peerEncPubB64: string;
  senderSignPubB64: string;
}): Promise<string> {
  const e = params.envelope;
  const transcript = new TextEncoder().encode(
    [
      'CipherLine-Sig-v1',
      e.messageId,
      e.conversationId,
      e.senderId,
      e.recipientId,
      e.clientTimestamp,
      String(e.keyVersion),
      String(e.senderKeyVersion),
      String(e.recipientKeyVersion),
      e.ephemeralPublicKey,
      e.nonce,
      e.ciphertext,
    ].join('\n')
  );
  const sigOk = sodium.crypto_sign_verify_detached(
    sodium.from_base64(e.signature, sodium.base64_variants.ORIGINAL),
    transcript,
    sodium.from_base64(params.senderSignPubB64, sodium.base64_variants.ORIGINAL)
  );
  if (!sigOk) {
    throw new Error('SIGNATURE_INVALID');
  }

  const saltB64 = e.ephemeralPublicKey.replace('hkdf-v1:', '');
  const msgKey = await deriveMessageKey({
    myEncPriv: params.myEncPriv,
    peerEncPubB64: params.peerEncPubB64,
    conversationId: e.conversationId,
    keyVersion: e.keyVersion,
    saltB64,
  });

  const aad = new TextEncoder().encode(
    `CipherLine-AAD-v1|${e.messageId}|${e.conversationId}|${e.senderId}|${e.recipientId}|${e.clientTimestamp}|${e.keyVersion}`
  );
  const plaintext = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
    null,
    sodium.from_base64(e.ciphertext, sodium.base64_variants.ORIGINAL),
    aad,
    sodium.from_base64(e.nonce, sodium.base64_variants.ORIGINAL),
    msgKey
  );
  return new TextDecoder().decode(plaintext);
}

async function runTests() {
  await sodium.ready;
  await connectDatabase();

  const app = createApp();
  const server = http.createServer(app);
  initSocketServer(server);

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  async function postJson(path: string, body: unknown, token?: string) {
    const res = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    return { status: res.status, data: await res.json() };
  }

  async function getJson(path: string, token?: string) {
    const res = await fetch(`${baseUrl}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return { status: res.status, data: await res.json() };
  }

  let socketAlice: Socket | null = null;
  let socketBob: Socket | null = null;

  try {
    // 1. Register Alice, Bob, Mallory with client-generated keys
    const aliceKeys = generateTestKeys();
    const bobKeys = generateTestKeys();
    const malloryKeys = generateTestKeys();

    const regAlice = await postJson('/api/auth/register', {
      username: 'alice_sec',
      email: 'alice@cipherline.test',
      password: 'StrongPassword#2026!',
      encryptionPublicKey: aliceKeys.encPubB64,
      signingPublicKey: aliceKeys.signPubB64,
      fingerprint: aliceKeys.fingerprint,
    });
    assert.equal(regAlice.status, 201, 'Alice registration should succeed');
    const aliceToken = regAlice.data.token as string;
    const aliceId = regAlice.data.user.id as string;

    const regBob = await postJson('/api/auth/register', {
      username: 'bob_sec',
      email: 'bob@cipherline.test',
      password: 'StrongPassword#2026!',
      encryptionPublicKey: bobKeys.encPubB64,
      signingPublicKey: bobKeys.signPubB64,
      fingerprint: bobKeys.fingerprint,
    });
    assert.equal(regBob.status, 201, 'Bob registration should succeed');
    const bobToken = regBob.data.token as string;
    const bobId = regBob.data.user.id as string;

    const regMallory = await postJson('/api/auth/register', {
      username: 'mallory_sec',
      email: 'mallory@cipherline.test',
      password: 'StrongPassword#2026!',
      encryptionPublicKey: malloryKeys.encPubB64,
      signingPublicKey: malloryKeys.signPubB64,
      fingerprint: malloryKeys.fingerprint,
    });
    assert.equal(regMallory.status, 201);
    const malloryToken = regMallory.data.token as string;

    // 2. Argon2id hash stored, never plaintext password
    const aliceDb = await User.findById(aliceId).select('+passwordHash').lean();
    assert.ok(aliceDb?.passwordHash.startsWith('$argon2id$'), 'Password must use Argon2id hash');
    assert.notEqual(aliceDb?.passwordHash, 'StrongPassword#2026!');

    // 3. Generic login error on invalid credentials
    const badLogin = await postJson('/api/auth/login', {
      identifier: 'alice_sec',
      password: 'WrongPassword123!',
    });
    assert.equal(badLogin.status, 401);
    assert.equal(badLogin.data.error, 'Invalid credentials');

    // 4. Reject private key submission on key publish
    const privReject = await postJson(
      '/api/keys/publish',
      {
        encryptionPublicKey: aliceKeys.encPubB64,
        signingPublicKey: aliceKeys.signPubB64,
        fingerprint: aliceKeys.fingerprint,
        encryptionPrivateKey: 'leaked',
      },
      aliceToken
    );
    assert.equal(privReject.status, 400);

    // 5. Create 1-to-1 conversation
    const convRes = await postJson('/api/conversations', { recipientId: bobId }, aliceToken);
    assert.equal(convRes.status, 201);
    const conversationId = convRes.data.conversation.id as string;

    // 6. Reject plaintext message on REST
    const plaintextReject = await postJson(
      '/api/messages',
      { conversationId, recipientId: bobId, plaintext: 'hello world' },
      aliceToken
    );
    assert.equal(plaintextReject.status, 400);

    // 7. Encrypt + sign message client-side, send via REST, verify DB stores zero plaintext
    const secretText = 'Confidential BTech major project test payload 2026';
    const env1 = await buildEnvelope({
      plaintext: secretText,
      conversationId,
      senderId: aliceId,
      recipientId: bobId,
      senderKeys: aliceKeys,
      recipientEncPubB64: bobKeys.encPubB64,
    });
    const sendRes = await postJson('/api/messages', env1, aliceToken);
    assert.equal(sendRes.status, 201);

    const dbMsg = await Message.findOne({ messageId: env1.messageId }).lean();
    assert.ok(dbMsg);
    assert.equal(JSON.stringify(dbMsg).includes(secretText), false, 'DB must never contain plaintext');

    // 8. Bob verifies Ed25519 signature and decrypts successfully
    const decryptedByBob = await verifyAndDecrypt({
      envelope: sendRes.data.message,
      myEncPriv: bobKeys.encPriv,
      peerEncPubB64: aliceKeys.encPubB64,
      senderSignPubB64: aliceKeys.signPubB64,
    });
    assert.equal(decryptedByBob, secretText);

    // 9. Modified ciphertext or invalid signature fails verification
    const tamperedSig = {
      ...sendRes.data.message,
      signature: Buffer.from(crypto.randomBytes(64)).toString('base64'),
    };
    await assert.rejects(
      verifyAndDecrypt({
        envelope: tamperedSig,
        myEncPriv: bobKeys.encPriv,
        peerEncPubB64: aliceKeys.encPubB64,
        senderSignPubB64: aliceKeys.signPubB64,
      }),
      /SIGNATURE_INVALID/
    );

    const flippedCiphertextBytes = Buffer.from(sendRes.data.message.ciphertext, 'base64');
    flippedCiphertextBytes[0] ^= 0xff;
    const tamperedCipher = {
      ...sendRes.data.message,
      ciphertext: flippedCiphertextBytes.toString('base64'),
    };
    await assert.rejects(
      verifyAndDecrypt({
        envelope: tamperedCipher,
        myEncPriv: bobKeys.encPriv,
        peerEncPubB64: aliceKeys.encPubB64,
        senderSignPubB64: aliceKeys.signPubB64,
      })
    );

    // 10. Unauthorized 3rd-party user blocked from reading conversation & JWT revocation on logout
    const malloryRead = await getJson(`/api/messages/${conversationId}`, malloryToken);
    assert.equal(malloryRead.status, 403);

    const logoutAlice = await postJson('/api/auth/logout', {}, aliceToken);
    assert.equal(logoutAlice.status, 200);
    const revokedAccess = await getJson('/api/auth/me', aliceToken);
    assert.equal(revokedAccess.status, 401);

    // 11. Real-time Socket.IO delivery between fresh Alice login and Bob
    const reloginAlice = await postJson('/api/auth/login', {
      identifier: 'alice_sec',
      password: 'StrongPassword#2026!',
    });
    assert.equal(reloginAlice.status, 200);
    const freshAliceToken = reloginAlice.data.token as string;

    socketAlice = ioClient(baseUrl, { auth: { token: freshAliceToken }, transports: ['websocket'] });
    socketBob = ioClient(baseUrl, { auth: { token: bobToken }, transports: ['websocket'] });

    await Promise.all([
      new Promise<void>((resolve) => socketAlice!.on('connect', () => resolve())),
      new Promise<void>((resolve) => socketBob!.on('connect', () => resolve())),
    ]);

    const liveText = 'Real-time Socket.IO E2EE envelope!';
    const liveEnv = await buildEnvelope({
      plaintext: liveText,
      conversationId,
      senderId: aliceId,
      recipientId: bobId,
      senderKeys: aliceKeys,
      recipientEncPubB64: bobKeys.encPubB64,
    });

    const receivedPromise = new Promise<Record<string, unknown>>((resolve) => {
      socketBob!.once('message:new', (msg: Record<string, unknown>) => resolve(msg));
    });

    const ack = await new Promise<{ ok: boolean }>((resolve) => {
      socketAlice!.emit('message:send', liveEnv, resolve);
    });
    assert.equal(ack.ok, true);

    const receivedByBob = await receivedPromise;
    const decryptedLive = await verifyAndDecrypt({
      envelope: receivedByBob as never,
      myEncPriv: bobKeys.encPriv,
      peerEncPubB64: aliceKeys.encPubB64,
      senderSignPubB64: aliceKeys.signPubB64,
    });
    assert.equal(decryptedLive, liveText);

    console.log('ALL 11 SECURITY & E2EE INTEGRATION TESTS PASSED');
  } finally {
    socketAlice?.disconnect();
    socketBob?.disconnect();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await disconnectDatabase();
  }
}

runTests().catch((err) => {
  console.error('Security integration test failure:', err);
  process.exit(1);
});
