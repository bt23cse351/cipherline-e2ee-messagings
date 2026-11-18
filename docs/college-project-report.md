# B.Tech CSE Major Project Report

## Title
**Secure Messaging System with End-to-End Encryption, Key Exchange, Digital Signatures and Authentication (CipherLine)**

---

## 1. Project Synopsis & Abstract

Digital communication platforms frequently store or process messages in plaintext on centralized servers, exposing private user conversations to server breaches, insider threats, and unauthorized surveillance. **CipherLine** is a full-stack real-time one-to-one messaging web application engineered with genuine client-side End-to-End Encryption (E2EE).

Every user generates an **X25519** encryption key pair and an **Ed25519** digital signature key pair locally inside the browser. Private keys are never transmitted to the server; instead, they are protected inside an **AES-256-GCM** encrypted local vault derived from the user's password via **PBKDF2-SHA256**. Messages are encrypted with **XChaCha20-Poly1305** using keys derived from X25519 shared secrets via **HKDF-SHA256**, signed deterministically with Ed25519, relayed in real time via **Socket.IO**, and stored strictly as ciphertext in **MongoDB**. User accounts are secured using **Argon2id** password hashing, **JWT** authentication with token revocation, and strict server-side authorization checks.

---

## 2. Problem Statement

Conventional web messaging systems often rely solely on transport encryption (HTTPS/TLS), which protects data only in transit between client and server. Once messages arrive at the application server, they are decrypted, inspected, or persisted in plaintext inside the database. If the server or database is compromised, all historical messages are exposed. Furthermore, unauthenticated messages can be tampered with or spoofed in transit.

---

## 3. Objectives

1. Design and build a full-stack real-time one-to-one messaging web application using React, Vite, Tailwind CSS, Node.js, Express, Socket.IO, and MongoDB.
2. Implement genuine client-side End-to-End Encryption using X25519 key exchange, HKDF-SHA256 key derivation, and XChaCha20-Poly1305 authenticated encryption.
3. Enforce message authenticity and integrity using deterministic Ed25519 digital signatures verified prior to decryption.
4. Secure user authentication with Argon2id password hashing, JWT session expiration, token revocation, and rate limiting.
5. Provide out-of-band Safety Number / public-key fingerprint verification to detect Man-in-the-Middle key substitution.
6. Verify security guarantees through automated cryptographic, authorization, and persistence integration tests.

---

## 4. Existing System vs. Proposed System

| Aspect | Existing System (Transport-Only Chat) | Proposed System (CipherLine E2EE) |
| :--- | :--- | :--- |
| Encryption Scope | TLS in transit only; plaintext on server | Client-to-client E2EE; server sees ciphertext only |
| Database Storage | Plaintext messages stored in DB | Ciphertext, nonce, HKDF salt, and signature only |
| Message Integrity | Relies on transport layer trust | Per-message Ed25519 signature + Poly1305 AEAD tag |
| Private Key Custody | Managed by server or absent | Generated & encrypted locally in browser vault |
| Password Security | Often bcrypt or weak hashes | Memory-hard Argon2id (`m=65536, t=3, p=1`) |
| Key Verification | None | SHA-256 Fingerprints & 60-digit Safety Numbers |

---

## 5. System Architecture & Modules

*(Refer to `docs/architecture.md`, `docs/cryptography.md`, and `docs/database.md` for detailed DFD, Use Case, ER, and Cryptographic Workflow diagrams.)*

1. **Authentication & Session Module:** Handles registration, strong password validation, Argon2id hashing, generic login errors, JWT issuance, and logout revocation.
2. **Client Cryptography & Key Vault Module (`src/crypto/`):** Uses `libsodium-wrappers` and Web Crypto API for key generation, X25519 ECDH, HKDF-SHA256, XChaCha20-Poly1305, Ed25519 signing/verification, and PBKDF2 + AES-GCM local storage.
3. **Real-Time Messaging Module (`backend/sockets/`):** Authenticated Socket.IO channels enforcing room membership, instant delivery, presence (`user:online`/`user:offline`), and delivery/read receipts.
4. **MongoDB Persistence Layer (`backend/models/`):** Indexed Mongoose collections (`User`, `Conversation`, `Message`, `SecurityLog`, `RevokedToken`) prohibiting plaintext storage.
5. **Security Audit & Inspection UI:** Enables inspecting raw stored ciphertext envelopes, comparing 60-digit Safety Numbers, rotating keys, exporting encrypted vault backups, and reviewing security logs.

---

## 6. Security Analysis Summary

- **Confidentiality:** Guaranteed by XChaCha20-Poly1305 with unique 24-byte nonces and per-message HKDF-SHA256 keys derived from X25519 shared secrets.
- **Authenticity & Non-Repudiation (within key lifetime):** Enforced by deterministic Ed25519 signatures verified prior to decryption.
- **Access Control:** Enforced on every REST and Socket.IO event by checking `Conversation.participants` and `Message.recipientId`.

---

## 7. Limitations and Future Scope

### Current Limitations
1. **No Per-Message Forward Secrecy:** Static identity X25519 keys mean compromise of a user's long-term X25519 private key exposes past messages encrypted under that key version.
2. **Browser XSS Exposure:** Web browser storage (`IndexedDB` / `localStorage`) is vulnerable if an attacker executes arbitrary JavaScript via XSS.
3. **Single-Device Key Vault:** Users moving to a new browser must manually transfer an encrypted vault backup string or rotate keys.

### Future Scope
1. Upgrade key agreement to the **Signal Protocol (X3DH + Double Ratchet)** for full Forward Secrecy and Post-Compromise Security.
2. Add **multi-device key synchronization** using primary-to-secondary encrypted device linking via QR codes.
3. Support **encrypted group chats** using Sender Keys or TreeKEM.

---

## 8. Conclusion

CipherLine successfully demonstrates how modern applied cryptography (`libsodium`, X25519, HKDF-SHA256, XChaCha20-Poly1305, Ed25519, Argon2id) integrates seamlessly with a responsive React, Node.js, Socket.IO, and MongoDB stack to deliver private, verifiable, real-time messaging without trusting the server with plaintext data.
