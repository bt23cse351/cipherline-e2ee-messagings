# CipherLine — Secure Real-Time Messaging System with End-to-End Encryption

**Project Title:** Secure Messaging System with End-to-End Encryption, Key Exchange, Digital Signatures and Authentication  
**Scope:** Strictly 1-to-1 real-time encrypted text messaging (no file uploads, no cloud storage, no AI modules).

## Cryptographic & Security Architecture

| Layer | Primitive / Mechanism | Purpose |
| :--- | :--- | :--- |
| Password Hashing | Argon2id (`64 MiB`, `t=3`, `p=1`) | Memory-hard server credential verification |
| Session Auth | JWT (`HS256`) + MongoDB `RevokedToken` TTL store | Stateless API & Socket.IO auth with immediate logout revocation |
| Key Agreement | X25519 (Curve25519 ECDH, 32-byte keys) | Client-only shared secret derivation |
| Key Derivation | HKDF-SHA256 (`16-byte` random salt + conversation context) | Unique 256-bit symmetric key per message |
| Authenticated Encryption | XChaCha20-Poly1305 (`24-byte` CSPRNG nonce + AAD) | Confidentiality and tamper rejection |
| Digital Signatures | Ed25519 Detached Signatures (Verify-Then-Decrypt) | Sender authenticity over metadata + ciphertext |
| Local Key Vault | PBKDF2-SHA256 (`310,000` iter) + AES-256-GCM in IndexedDB | Protects private keys at rest on the client |

## Running Locally

```bash
npm install
npm run dev
```

Run the 11-test security & E2EE integration suite:

```bash
npm run test:security
```

## Documentation Index

- `docs/architecture.md` — System components, data flow, and trust boundaries
- `docs/cryptography.md` — Exact primitives, byte sizes, HKDF context, AAD, and signature transcript
- `docs/database.md` — MongoDB/Mongoose collections and indexes
- `docs/api-documentation.md` — REST endpoints and Socket.IO real-time events
- `docs/threat-model.md` — Mitigated threats and honest static-key/browser limitations
- `docs/testing-report.md` — Automated test coverage and verification methodology
- `docs/college-project-report.md` — Academic project report
- `docs/presentation-ppt.md` — Slide-by-slide presentation deck outline
- `docs/viva-qa.md` — Technical viva questions and answers
