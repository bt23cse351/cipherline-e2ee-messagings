# CipherLine System Architecture

## 1. High-Level Overview

CipherLine is a strict 1-to-1 real-time end-to-end encrypted (E2EE) messaging system. The server acts purely as an authenticated identity directory, public-key registry, and untrusted ciphertext relay.

```
+---------------------------+                     +---------------------------+
|      Client A Browser     |                     |      Client B Browser     |
|  - X25519 + Ed25519 keys  |                     |  - X25519 + Ed25519 keys  |
|  - PBKDF2+AES-GCM Vault   |                     |  - PBKDF2+AES-GCM Vault   |
|  - XChaCha20-Poly1305     |                     |  - Verify-Then-Decrypt    |
+-------------+-------------+                     +-------------+-------------+
              |                                                 |
              | HTTPS REST + WSS Socket.IO (Ciphertext Only)    |
              +------------------------+------------------------+
                                       |
                                       v
                     +-----------------------------------+
                     |   Node.js + Express + Socket.IO   |
                     |  - Argon2id Password Verification |
                     |  - JWT HS256 + JTI Revocation     |
                     |  - Membership & Schema Validation |
                     +-----------------+-----------------+
                                       |
                                       v
                     +-----------------------------------+
                     |         MongoDB / Mongoose        |
                     |  Users | Conversations | Messages |
                     |  SecurityLogs | RevokedTokens     |
                     +-----------------------------------+
```

## 2. Trust Boundaries

1. **Client Boundary (Trusted for User's Own Plaintext & Private Keys)**:
   - Generates X25519 (`32-byte`) encryption and Ed25519 (`32-byte` pub / `64-byte` priv) signing keys locally using `libsodium-wrappers`.
   - Wraps private keys in IndexedDB (with `localStorage` fallback) using `PBKDF2-SHA256` (310,000 iterations) + `AES-256-GCM`.
   - Keeps unlocked private keys strictly in React memory (`AuthContext`); never transmits them over HTTP/Socket.IO.
2. **Server & Database Boundary (Untrusted for Message Confidentiality)**:
   - Rejects any payload containing `plaintext`, `text`, `encryptionPrivateKey`, `signingPrivateKey`, or `privateKey`.
   - Stores only Argon2id hashes, public key bundles, SHA-256 fingerprints, and authenticated ciphertext envelopes.
