# Presentation Outline (PPT Slides)

1. **Slide 1 — Title**: CipherLine: Secure Messaging System with E2EE, Key Exchange, Digital Signatures & Authentication
2. **Slide 2 — Problem Statement**: Limitations of TLS-only messaging (plaintext at rest on server)
3. **Slide 3 — Objectives & Strict Scope**: 1-to-1 text E2EE, zero server-side plaintext/private keys
4. **Slide 4 — Tech Stack**: React 19, Vite, Tailwind v4, Express, Socket.IO, MongoDB/Mongoose, libsodium, Argon2id
5. **Slide 5 — System Architecture**: Client Trust Boundary vs. Untrusted Relay Server & Database
6. **Slide 6 — Authentication & Key Vault**: Argon2id, JWT + Revocation TTL, PBKDF2-SHA256 + AES-256-GCM IndexedDB Vault
7. **Slide 7 — End-to-End Encryption Pipeline**: X25519 -> HKDF-SHA256 -> XChaCha20-Poly1305 (24-byte nonce + AAD)
8. **Slide 8 — Authenticity & MITM Defense**: Ed25519 Verify-Then-Decrypt + SHA-256 Fingerprints + 60-digit Safety Numbers
9. **Slide 9 — Live Demo & Envelope Inspector**: Inspecting stored ciphertext in MongoDB vs. decrypted view
10. **Slide 10 — Security Testing & Threat Model**: 11 automated tests + honest discussion of static X25519 limits
