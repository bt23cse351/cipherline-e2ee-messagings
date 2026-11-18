# Technical Viva Q&A

**Q1: Why does CipherLine use XChaCha20-Poly1305 instead of standard AES-CBC?**  
A: XChaCha20-Poly1305 is an Authenticated Encryption with Associated Data (AEAD) cipher with a 192-bit (24-byte) nonce, eliminating padding oracle risks and drastically reducing nonce-collision probability with random CSPRNG nonces.

**Q2: Why verify the Ed25519 signature before attempting decryption?**  
A: Verify-then-decrypt prevents malformed or spoofed ciphertexts from reaching the decryption routine and proves sender identity using the sender's Ed25519 public key, whereas an AEAD tag alone only proves possession of the shared symmetric secret (which both parties share).

**Q3: How are private keys protected on the user's browser?**  
A: Private keys are never transmitted to the server. They are encrypted at rest inside IndexedDB using AES-256-GCM wrapped by a key derived from the user's passphrase via 310,000 iterations of PBKDF2-SHA256.

**Q4: What happens if an attacker alters a single byte of ciphertext in MongoDB?**  
A: Both the Ed25519 signature check and the Poly1305 authentication tag fail, causing the recipient UI to display a tampering warning instead of corrupted output.

**Q5: Does CipherLine provide full Signal-style Forward Secrecy?**  
A: We honestly document that static X25519 identity keys with per-message HKDF salts ensure unique per-message encryption keys, but do not provide post-compromise forward secrecy like an ephemeral Double Ratchet.
