# Cryptographic Protocol Specification

## 1. Primitives & Key Formats

- **Key Exchange**: X25519 (`crypto_box_keypair` / `crypto_scalarmult`), 32-byte Base64 (`ORIGINAL` variant) public keys.
- **Digital Signatures**: Ed25519 (`crypto_sign_keypair` / `crypto_sign_detached` / `crypto_sign_verify_detached`), 32-byte public key, 64-byte private key, 64-byte detached signature.
- **Key Derivation**: `HKDF-SHA256` (Web Crypto API), 16-byte per-message random salt (`ephemeralPublicKey` field encoded as `hkdf-v1:<base64-salt>`), producing a 256-bit symmetric encryption key.
- **Authenticated Encryption**: `XChaCha20-Poly1305` (`crypto_aead_xchacha20poly1305_ietf_encrypt`), 24-byte CSPRNG nonce (`nonce` field), 16-byte Poly1305 authentication tag appended to ciphertext.
- **Public Key Fingerprint**: `HEX_UPPER(SHA-256(raw_x25519_pub || raw_ed25519_pub))` (64 hex characters).
- **Symmetric Safety Number**: 12 groups of 5 digits (60 digits total) derived from `SHA-256("CipherLine-Safety-v1:" + sorted([fpA, fpB]).join(":"))`.

## 2. HKDF Context & Associated Data

- **HKDF Info**: `CipherLine-E2EE-v1|conv:<conversationId>|kv:<keyVersion>`
- **AEAD Associated Data (AAD)**: `CipherLine-AAD-v1|<messageId>|<conversationId>|<senderId>|<recipientId>|<clientTimestamp>|<keyVersion>`

## 3. Deterministic Ed25519 Signature Transcript

Before decryption, the recipient verifies the sender's Ed25519 signature over the exact newline-delimited canonical transcript:

```text
CipherLine-Sig-v1
<messageId>
<conversationId>
<senderId>
<recipientId>
<clientTimestamp>
<keyVersion>
<senderKeyVersion>
<recipientKeyVersion>
<ephemeralPublicKey>
<nonce>
<ciphertext>
```

If signature verification fails, decryption is aborted immediately and a `SIGNATURE_WARNING` event is logged.
