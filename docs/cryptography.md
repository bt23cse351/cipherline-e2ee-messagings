# Cryptographic Protocol Specification (`CipherLine-E2EE-v1`)

## 1. Primitive Selection & Libraries

All cryptographic operations use maintained, industry-standard libraries (`libsodium-wrappers` v0.8.x + Web Crypto API `crypto.subtle`, and `argon2` on Node.js). No custom cryptographic algorithms are used.

| Purpose | Algorithm | Key / Output Size | Library |
| :--- | :--- | :--- | :--- |
| Password Hashing (Server) | Argon2id (`m=65536, t=3, p=1`) | Variable PHC string | `argon2` |
| Key Agreement | X25519 (Curve25519 ECDH) | 32-byte pub / 32-byte priv | `libsodium` (`crypto_box_keypair`, `crypto_scalarmult`) |
| Key Derivation | HKDF-SHA256 | 32-byte (256-bit) symmetric key | Web Crypto API (`crypto.subtle`) |
| Authenticated Encryption | XChaCha20-Poly1305 IETF | 32-byte key, 24-byte nonce, 16-byte MAC tag | `libsodium` (`crypto_aead_xchacha20poly1305_ietf_*`) |
| Digital Signatures | Ed25519 | 32-byte pub, 64-byte priv, 64-byte sig | `libsodium` (`crypto_sign_keypair`, `crypto_sign_detached`) |
| Fingerprint & Safety Numbers | SHA-256 | 32-byte digest (64 hex chars / 60 digits) | Web Crypto API / Node `crypto` |
| Local Key Vault Protection | PBKDF2-SHA256 (310k iter) + AES-256-GCM | 256-bit wrap key, 12-byte IV | Web Crypto API (`crypto.subtle`) |

---

## 2. Key Formats & Generation

Upon account registration on the client browser:
1. **Encryption Key Pair:** `sodium.crypto_box_keypair()` generates an X25519 public key (32 bytes, Base64) and private key (32 bytes, Base64).
2. **Signing Key Pair:** `sodium.crypto_sign_keypair()` generates a separate Ed25519 public key (32 bytes, Base64) and private key (64 bytes, Base64).
3. **Public Key Fingerprint:**
   ```text
   fingerprint = HEX_UPPER(SHA-256(encPublicKeyBytes || signPublicKeyBytes))
   ```
   The server recomputes `SHA-256` on `POST /api/keys/publish` and registration to verify that the submitted fingerprint matches the published public keys.
4. **Symmetric Safety Number (Out-of-Band Verification):**
   To allow two users to compare a single identical 60-digit code (12 groups of 5 digits):
   ```text
   sorted = sort([fingerprintA, fingerprintB]).join(":")
   seed = SHA-256("CipherLine-Safety-v1:" + sorted) || SHA-256(digest1)
   ```

---

## 3. Key Exchange & HKDF-SHA256 Context

Given Alice (`A`) and Bob (`B`):
1. Alice computes: `sharedSecret = X25519(A_encPriv, B_encPub)`.
2. Bob computes: `sharedSecret = X25519(B_encPriv, A_encPub)`.
3. By Curve25519 Diffie-Hellman commutativity, both clients derive the exact same 32-byte `sharedSecret`, which is **never transmitted** over the network. Low-order all-zero points are rejected.
4. For each message, the sender generates a fresh 16-byte random salt (`saltBytes`) stored in the `ephemeralPublicKey` metadata field as `hkdf-salt-v1:<base64>`.
5. Both clients derive the 256-bit per-message encryption key using **HKDF-SHA256**:
   ```text
   contextInfo = "CipherLine-E2EE-v1|" + conversationId + "|" + min(senderId, recipientId) + ":" + max(senderId, recipientId) + "|sv:" + senderKeyVersion + "|rv:" + recipientKeyVersion
   messageKey = HKDF-SHA256(ikm = sharedSecret, salt = saltBytes, info = UTF8(contextInfo), length = 256 bits)
   ```
   Because `senderId`/`recipientId` are sorted canonically inside `contextInfo`, both the sender (reloading their own sent history) and the recipient derive the identical `messageKey`.

---

## 4. Authenticated Encryption & Nonce Specification

- **Algorithm:** XChaCha20-Poly1305 (`crypto_aead_xchacha20poly1305_ietf_encrypt`).
- **Nonce:** 24 bytes (192 bits) freshly generated via CSPRNG (`sodium.randombytes_buf(24)`) for every message, avoiding nonce reuse collisions.
- **Associated Authenticated Data (AAD):**
  ```text
  AAD = UTF8("CipherLine-AAD-v1|" + conversationId + "|" + senderId + "|" + recipientId + "|" + messageId + "|" + clientTimestamp + "|" + keyVersion)
  ```
  Any modification to ciphertext, tag, nonce, or AAD fields causes Poly1305 authentication to fail.

---

## 5. Deterministic Canonical Digital Signature Format

Before transmitting a message envelope, the sender constructs a newline-delimited canonical UTF-8 payload binding all critical envelope fields:

```text
CipherLine-Sig-v1
<messageId>
<conversationId>
<senderId>
<recipientId>
<clientTimestamp>
<keyVersion>
<ephemeralPublicKey>
<nonce>
<ciphertext>
```

The sender signs these canonical bytes with `sodium.crypto_sign_detached(canonicalBytes, senderSignPriv)` producing a 64-byte Ed25519 signature.

**Verification Order (Verify-Then-Decrypt):**
The recipient reconstructs `canonicalBytes` from the received envelope, retrieves the sender's `signingPublicKey`, and executes `sodium.crypto_sign_verify_detached(sigBytes, canonicalBytes, senderSignPub)`.
If verification returns `false`, decryption is **aborted immediately** and the UI displays a high-visibility **Signature Verification Failed** security warning.

---

## 6. Encrypted Local Key Vault & Security Limitations

- **Local Key Storage:** Private keys are wrapped using `AES-256-GCM` with a key derived from the user's password via `PBKDF2-SHA256` (310,000 iterations, random 16-byte salt, random 12-byte IV) and stored in browser IndexedDB (`cipherline_keystore_db`). Decrypted private keys exist only in React memory while the session is unlocked.
- **Recovery Limitation:** Because the server never receives private keys, forgetting your password or clearing browser storage without exporting an encrypted backup permanently prevents decrypting older messages.
- **XSS Risk:** Browser storage (`IndexedDB` and `localStorage`) is accessible to JavaScript running on the same origin. If an attacker injects malicious scripts (XSS), active in-memory keys or tokens could be exposed. Strict input sanitization, React automatic escaping, and Helmet security headers mitigate XSS, though browser storage cannot be considered hardware-enclave secure.
- **Forward Secrecy Limitation:** Static identity X25519 keys paired with per-message HKDF salts provide unique keys per message, **but do NOT provide Forward Secrecy**. If a user's long-term X25519 private key is compromised, past messages encrypted under that `keyVersion` can be decrypted. A production messaging system should adopt the **Signal Protocol (X3DH + Double Ratchet)** with ephemeral prekeys for forward secrecy and post-compromise security.
