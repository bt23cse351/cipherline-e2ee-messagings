# Project Presentation Deck Outline (15 Slides)

1. **Slide 1 — Title Slide:** Secure Messaging System with End-to-End Encryption, Key Exchange, Digital Signatures and Authentication (*CipherLine*) | B.Tech CSE Major Project.
2. **Slide 2 — Motivation & Problem Statement:** Why HTTPS/TLS alone is insufficient (server-side plaintext exposure, DB breaches, insider threats, message tampering).
3. **Slide 3 — Project Objectives:** Client-side E2EE, X25519 key exchange, Ed25519 signatures, Argon2id auth, Socket.IO real-time messaging, MongoDB ciphertext-only storage.
4. **Slide 4 — Existing vs. Proposed System:** Comparison table highlighting Zero-Knowledge Server design.
5. **Slide 5 — Technology Stack:** React + Vite + Tailwind CSS + Socket.IO Client | Node.js + Express + Socket.IO + MongoDB/Mongoose | `libsodium-wrappers` + Web Crypto API + `argon2`.
6. **Slide 6 — System Architecture:** Client browser crypto boundary vs. untrusted relay backend & MongoDB.
7. **Slide 7 — Authentication & Local Key Vault:** Argon2id password hashing, JWT revocation on logout, PBKDF2-SHA256 (310k) + AES-256-GCM local browser key vault.
8. **Slide 8 — Key Exchange & Key Derivation:** X25519 ECDH shared secret + HKDF-SHA256 with conversation context & 16-byte per-message random salt.
9. **Slide 9 — Authenticated Encryption & Digital Signatures:** XChaCha20-Poly1305 (24-byte nonce + AAD) + deterministic Ed25519 signature verified *before* decryption.
10. **Slide 10 — Out-of-Band Fingerprint Verification:** 60-digit symmetric Safety Numbers & key-change alerts against MITM attacks.
11. **Slide 11 — Database Schema & Indexes:** `Users`, `Conversations`, `Messages`, `SecurityLogs`, `RevokedTokens` (TTL).
12. **Slide 12 — Real-Time Messaging Flow:** Socket.IO JWT handshake, membership verification, instant delivery, Sent/Delivered/Read receipts.
13. **Slide 13 — Live Application Screenshots / Demo Walkthrough:** Login/Register, Chats, Crypto Envelope Inspector, Safety Number Verification, Audit Logs.
14. **Slide 14 — Security Testing Results:** 11/11 automated tests passing (plaintext absent from DB, tampered ciphertext/signature rejected, unauthorized access blocked).
15. **Slide 15 — Limitations, Future Scope & Conclusion:** Honest discussion of Static X25519 vs. Signal Double Ratchet (Forward Secrecy), XSS considerations, and future enhancements.
