# Security & Integration Testing Report

Automated test suite: `tests/e2ee.integration.test.ts` (`npm run test:security`).

## Test Cases Covered

1. **User Registration & Client Key Bundle Verification**: Registers Alice, Bob, and Mallory with 32-byte X25519/Ed25519 public keys and verifies server fingerprint matching.
2. **Argon2id Credential Storage**: Inspects MongoDB `User` document to verify `$argon2id$` hash and absence of plaintext password.
3. **Generic Authentication Errors**: Verifies wrong passwords return HTTP `401` with generic `"Invalid credentials"`.
4. **Private Key Leakage Prevention**: Verifies `POST /api/keys/publish` rejects payloads containing `encryptionPrivateKey`.
5. **1-to-1 Conversation Initialization**: Verifies deterministic unique conversation pair creation.
6. **Plaintext Rejection**: Verifies `POST /api/messages` rejects payloads containing `plaintext` or `text`.
7. **Zero-Plaintext DB Persistence**: Encrypts & signs client-side, persists via REST, and asserts MongoDB record contains zero plaintext substring.
8. **Verify-Then-Decrypt Round Trip**: Bob verifies Ed25519 signature and decrypts ciphertext back to original UTF-8 text.
9. **Tamper & Forged Signature Rejection**: Mutates signature bytes and flips ciphertext bit; verifies decryption throws `SIGNATURE_INVALID` and AEAD tag failure respectively.
10. **Authorization & JWT Revocation**: Blocks Mallory (`403 Forbidden`) from reading Alice–Bob messages and confirms `POST /api/auth/logout` revokes Alice's JWT (`401`).
11. **Real-Time Socket.IO E2EE Delivery**: Connects Alice and Bob over authenticated WebSockets, sends encrypted envelope via `message:send`, and verifies real-time `message:new` decryption on Bob's socket.
