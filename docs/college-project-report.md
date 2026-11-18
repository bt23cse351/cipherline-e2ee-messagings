# B.Tech CSE Major Project Report — CipherLine

**Project Title:** Secure Messaging System with End-to-End Encryption, Key Exchange, Digital Signatures and Authentication

## Chapter 1: Introduction & Problem Statement
Traditional client-server messaging applications terminate TLS at the backend, allowing database administrators, cloud providers, or attackers with database read access to view plaintext conversations. CipherLine eliminates server-side plaintext visibility by performing key generation, ECDH key agreement, authenticated encryption, and digital signature verification strictly inside the client browser.

## Chapter 2: Objectives & Scope
- Implement 1-to-1 real-time encrypted messaging using React, Node.js, Express, Socket.IO, and MongoDB.
- Secure credentials using Argon2id and stateless/revocable JWT authentication.
- Implement X25519 key agreement, HKDF-SHA256 key derivation, XChaCha20-Poly1305 AEAD, and Ed25519 signatures via `libsodium-wrappers` and Web Crypto API.
- Restrict scope strictly to 1-to-1 text messaging without file sharing, cloud storage, or AI modules.

## Chapter 3: System Design & Implementation
Detailed in `docs/architecture.md`, `docs/cryptography.md`, `docs/database.md`, and `docs/api-documentation.md`.

## Chapter 4: Security Evaluation & Results
Verified against all 11 automated integration tests (`npm run test:security`) covering Argon2id hashing, zero-plaintext storage, tamper detection, replay protection, RBAC/membership enforcement, and real-time WebSocket delivery.

## Chapter 5: Conclusion & Future Scope
CipherLine demonstrates practical client-side E2EE in a modern TypeScript web stack. Future extensions could incorporate Signal's X3DH pre-key bundles and Double Ratchet for full asynchronous forward secrecy.
