# System Architecture & Diagrams

## 1. High-Level System Architecture

CipherLine follows a **Zero-Knowledge Relay Architecture** where the backend server acts strictly as an authenticated router, public-key directory, and encrypted message store. All plaintext handling, key generation, key exchange, digital signing, signature verification, and decryption occur exclusively inside the client browser.

```text
+-------------------------------------+          +-------------------------------------+
|        Client A (Browser)           |          |        Client B (Browser)           |
|  - React + Vite + Tailwind CSS      |          |  - React + Vite + Tailwind CSS      |
|  - libsodium (X25519, Ed25519,      |          |  - libsodium (X25519, Ed25519,      |
|    XChaCha20-Poly1305) + WebCrypto  |          |    XChaCha20-Poly1305) + WebCrypto  |
|  - PBKDF2 + AES-GCM Key Vault       |          |  - PBKDF2 + AES-GCM Key Vault       |
+------------------+------------------+          +------------------+------------------+
                   |                                                |
                   | HTTPS REST API + Socket.IO (JWT Auth)          |
                   | Transmits ONLY: Public Keys, Ciphertext,       |
                   | Nonce, HKDF Salt Ref, Ed25519 Signature        |
                   v                                                v
+--------------------------------------------------------------------------------------+
|                          Node.js + Express + Socket.IO Server                        |
|  - Argon2id Password Verification & JWT Issuance / Revocation                        |
|  - Rate Limiter, Helmet, CORS, Zod Payload Validation                                |
|  - Socket.IO Presence, Room Membership Enforcement, Read Receipts                    |
+------------------------------------------+-------------------------------------------+
                                           | Mongoose ODM
                                           v
+--------------------------------------------------------------------------------------+
|                                   MongoDB Database                                   |
|  Collections: Users | Conversations | Messages (Ciphertext Only) | SecurityLogs      |
+--------------------------------------------------------------------------------------+
```

---

## 2. Data Flow Diagrams (DFD)

### Level 0 DFD (Context Diagram)

```text
  +----------+   Auth / Public Keys / Ciphertext    +--------------------+   Encrypted Relay   +----------+
  |  User A  | -----------------------------------> |  CipherLine E2EE   | ------------------> |  User B  |
  | (Sender) | <----------------------------------- | Messaging Platform | <------------------ | (Recip.) |
  +----------+   Delivery & Read Receipts           +--------------------+   Auth / Ciphertext +----------+
```

### Level 1 DFD (Message Encryption & Delivery Flow)

1. **1.0 Authentication & Vault Unlock:** User submits credentials -> Server verifies Argon2id hash -> Issues JWT -> Client unlocks local AES-256-GCM key vault in browser memory.
2. **2.0 Key Directory Lookup:** Sender fetches Recipient's X25519 `encryptionPublicKey` and Ed25519 `signingPublicKey` via `GET /api/keys/:userId`.
3. **3.0 Client Encryption & Signing:** Sender derives `sharedSecret = X25519(A_priv, B_pub)`, generates 16-byte HKDF salt & 24-byte nonce, derives `messageKey = HKDF-SHA256`, encrypts plaintext via `XChaCha20-Poly1305`, and signs canonical envelope with `Ed25519(A_sign_priv)`.
4. **4.0 Server Validation & Persistence:** Backend verifies JWT, checks Conversation membership, confirms no plaintext fields exist, stores encrypted envelope in MongoDB `Messages`, and emits `message:new` via Socket.IO.
5. **5.0 Client Verification & Decryption:** Recipient reconstructs canonical payload, verifies `Ed25519` signature using Sender's `signingPublicKey`. Only if valid does Recipient derive `messageKey` and decrypt ciphertext.

---

## 3. Use Case Diagram

```text
                     +-------------------------------------------+
                     |          CipherLine E2EE System           |
                     |                                           |
  +--------+         |  ( Register & Generate Local Key Pairs )  |
  |        | ------> |  ( Login & Unlock Encrypted Key Vault )   |
  |  User  | ------> |  ( Search Registered Users )              |
  |        | ------> |  ( Verify Out-of-Band Safety Number )     |
  +--------+ ------> |  ( Send & Receive E2EE Messages )         |
                     |  ( Inspect Message Crypto Envelope )      |
                     |  ( Rotate Keys / Export Vault Backup )    |
                     |  ( View Security Audit Logs / Logout )    |
                     +-------------------------------------------+
```

---

## 4. Cryptographic Workflow Diagram

```text
  SENDER DEVICE (Alice)                                       RECIPIENT DEVICE (Bob)
  ---------------------                                       ----------------------
  1. Fetch Bob's X25519 PubKey                                6. Receive Envelope via Socket.IO
  2. shared = X25519(Alice_EncPriv, Bob_EncPub)               7. Reconstruct Canonical Payload
  3. salt = CSPRNG(16B), nonce = CSPRNG(24B)                  8. Verify Ed25519(sig, canonical, Alice_SignPub)
  4. msgKey = HKDF-SHA256(shared, salt, contextInfo)             [IF INVALID -> REJECT & WARN USER]
  5. cipher = XChaCha20-Poly1305(plaintext, AAD, nonce, key)  9. shared = X25519(Bob_EncPriv, Alice_EncPub)
  6. sig = Ed25519_Sign(canonicalEnvelope, Alice_SignPriv)   10. msgKey = HKDF-SHA256(shared, salt, contextInfo)
  7. Send { cipher, nonce, salt, sig, ... } to Server ------>11. plaintext = Decrypt(cipher, AAD, nonce, msgKey)
```
