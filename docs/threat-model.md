# Threat Model & Security Analysis

## 1. Trust Boundaries: What the Server Can and Cannot See

| Data / Artifact | Visible to Server & MongoDB? | Reason |
| :--- | :--- | :--- |
| Message Plaintext | **NO** | Encrypted client-side with XChaCha20-Poly1305 before leaving browser. |
| Raw User Password | **NO** | Hashed with Argon2id (`m=65536, t=3, p=1`) on auth; never stored in plaintext. |
| X25519 / Ed25519 Private Keys | **NO** | Generated in browser and kept inside password-encrypted local IndexedDB vault. |
| X25519 Shared Secret / HKDF Keys | **NO** | Computed locally inside sender and recipient browsers only. |
| Usernames, Emails, Public Keys, Fingerprints | **YES** | Required for user discovery, login, and public key distribution. |
| Metadata (Sender ID, Recipient ID, Timestamps, Ciphertext Size) | **YES** | Required by the server to route Socket.IO messages, enforce membership, and persist envelopes. |

---

## 2. Threat Matrix & Mitigations

1. **Database Compromise / Server Breach (Passive Adversary):**
   - *Threat:* Attacker dumps the entire MongoDB database.
   - *Mitigation:* `Messages` contains only `ciphertext`, `nonce`, `ephemeralPublicKey` (HKDF salt), and `signature`. Without users' local private keys, message plaintexts remain confidential. `Users.passwordHash` uses memory-hard Argon2id.
2. **Ciphertext Tampering / Bit-Flipping:**
   - *Threat:* Compromised server or relay alters `ciphertext`, `nonce`, `timestamp`, or `recipientId`.
   - *Mitigation:* **Verify-then-Decrypt**: Ed25519 signature binds `messageId`, `conversationId`, `senderId`, `recipientId`, `clientTimestamp`, `keyVersion`, `ephemeralPublicKey`, `nonce`, and `ciphertext`. Tampering invalidates both the Ed25519 signature and the Poly1305 AEAD tag + AAD check.
3. **Replay Attack:**
   - *Threat:* Adversary resends a previously valid captured message envelope.
   - *Mitigation:* Client generates unique `messageId`; MongoDB enforces a unique index on `messageId` and rejects duplicates with HTTP `409` or Socket.IO rejection.
4. **Man-in-the-Middle (MITM) Key Substitution:**
   - *Threat:* A malicious server replaces Bob's published public key with Mallory's public key.
   - *Mitigation:* CipherLine provides SHA-256 fingerprints and symmetric 60-digit **Safety Numbers** for out-of-band comparison, plus alerts the user immediately if a verified contact's fingerprint changes.
5. **Unauthorized Conversation / Receipt Access (IDOR):**
   - *Threat:* User C requests `GET /api/messages/:convId` or `PATCH /api/messages/:id/read` for User A and User B's chat.
   - *Mitigation:* Every REST endpoint and Socket.IO event verifies `req.user.id` membership in `Conversation.participants` (or `message.recipientId` for read receipts) and logs blocked attempts in `SecurityLogs`.
6. **Brute-Force Login & Account Enumeration:**
   - *Threat:* Attacker tests common passwords or probes valid usernames.
   - *Mitigation:* Rate limiting on `/api/auth/login` and `/api/auth/register` plus generic `401 Invalid credentials` responses.
7. **Session Hijacking After Logout:**
   - *Threat:* Stolen JWT reused after user logs out.
   - *Mitigation:* `POST /api/auth/logout` stores the token's `jti` in the `RevokedTokens` TTL collection, immediately invalidating the JWT on both REST and Socket.IO handshakes.
8. **Cross-Site Scripting (XSS) & Browser Storage Exposure:**
   - *Threat:* Malicious script injected into the browser reads `sessionStorage`, `localStorage`, or `IndexedDB`.
   - *Mitigation:* React escapes rendered text by default (zero `dangerouslySetInnerHTML`), Helmet sets protective HTTP headers, and private keys are encrypted at rest with PBKDF2-SHA256 + AES-256-GCM. However, browser JS storage is never immune to a full XSS compromise; production deployments must enforce strict Content Security Policy (CSP) and HTTPS.
