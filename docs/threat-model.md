# Threat Model & Honest Security Analysis

## 1. Mitigated Threats

| Threat | Mitigation in CipherLine |
| :--- | :--- |
| Server / DB Compromise | MongoDB stores only Argon2id hashes and XChaCha20-Poly1305 ciphertext; server cannot decrypt messages. |
| Ciphertext or Metadata Tampering | Ed25519 signature over full canonical transcript + Poly1305 AEAD tag + AAD immediately rejects modified packets. |
| Impersonation / Spoofing | JWT authentication + Ed25519 sender signature verification against published signing key. |
| Unauthorized Conversation Access | REST & Socket.IO enforce participant membership checks (`403 Forbidden`) and log `UNAUTHORIZED_ACCESS`. |
| Credential Brute Force | Express rate limiting on `/api/auth/*`, strong password policy, generic login errors, Argon2id (64 MiB). |
| Replay Attacks | Client-generated unique `messageId` enforced by MongoDB unique index (`409 Conflict`). |
| Key Substitution / MITM | 64-hex SHA-256 fingerprints, 60-digit symmetric Safety Numbers, and Key-Changed banner alerts. |

## 2. Documented Limitations

1. **No Post-Compromise Forward Secrecy**: CipherLine uses static per-device X25519 identity keys with per-message HKDF salts rather than Signal's ephemeral Double Ratchet. If a user's long-term X25519 private key is later stolen from a compromised endpoint, past ciphertexts captured under that key version could be decrypted.
2. **Browser XSS Exposure**: Like all web-based E2EE apps, if an attacker achieves arbitrary JavaScript execution (XSS) in the browser origin while the vault is unlocked in memory, they could read unlocked keys or plaintext DOM content.
3. **Metadata Visibility**: The server still observes social graph metadata (`senderId`, `recipientId`, timestamps, online presence) necessary to route real-time messages.
