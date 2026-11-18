# B.Tech CSE Viva Questions and Answers

**Q1. What is End-to-End Encryption (E2EE), and how is it different from HTTPS/TLS?**  
**A:** HTTPS/TLS encrypts data only between the client and the server; the server still decrypts and sees plaintext. In E2EE, plaintext is encrypted on the sender's device and decrypted only on the recipient's device, so the server and database never see plaintext.

**Q2. Which cryptographic libraries did you use and why?**  
**A:** We used `libsodium-wrappers` (compiled from audited NaCl/libsodium C cryptography) for X25519, Ed25519, and XChaCha20-Poly1305, the browser Web Crypto API (`crypto.subtle`) for HKDF-SHA256 and AES-256-GCM key vault wrapping, and `argon2` on Node.js for password hashing. Using audited libraries prevents side-channel and implementation bugs.

**Q3. Why did you choose Argon2id over bcrypt or SHA-256 for password hashing?**  
**A:** SHA-256 is fast and vulnerable to GPU brute-forcing. Argon2id (winner of the Password Hashing Competition) is memory-hard and hybrid, resisting both GPU/ASIC cracking and side-channel attacks.

**Q4. Why do users have two separate key pairs (X25519 and Ed25519)?**  
**A:** Cryptographic key separation is a best practice: X25519 (Montgomery curve) is specialized for Diffie-Hellman key agreement, while Ed25519 (Edwards curve) is specialized for digital signatures. Separating keys prevents cross-protocol attacks.

**Q5. How does X25519 key exchange work in CipherLine?**  
**A:** Alice multiplies her X25519 private key with Bob's public key (`X25519(a, B)`), and Bob multiplies his private key with Alice's public key (`X25519(b, A)`). Both obtain the exact same 32-byte shared secret without ever transmitting it over the network.

**Q6. Why do you pass the X25519 shared secret through HKDF-SHA256 instead of using it directly as the cipher key?**  
**A:** Raw Diffie-Hellman output is not uniformly distributed and lacks domain separation. HKDF-SHA256 extracts uniform entropy and binds conversation ID, sorted user IDs, key versions, and a fresh 16-byte per-message random salt to derive a unique 256-bit key per message.

**Q7. Why use XChaCha20-Poly1305 instead of standard AES-CBC?**  
**A:** AES-CBC does not authenticate ciphertext (vulnerable to padding oracle attacks). XChaCha20-Poly1305 is an AEAD (Authenticated Encryption with Associated Data) cipher with a 24-byte (192-bit) nonce, making random nonce collisions negligible while providing a Poly1305 authentication tag.

**Q8. What is Associated Authenticated Data (AAD) in your encryption?**  
**A:** AAD binds routing metadata (`conversationId`, `senderId`, `recipientId`, `messageId`, `clientTimestamp`, `keyVersion`) to the Poly1305 tag without encrypting those routing headers, preventing ciphertext transplantation between conversations.

**Q9. Why do you verify the Ed25519 digital signature BEFORE decrypting?**  
**A:** Verify-then-Decrypt ensures we never feed unauthenticated or attacker-crafted ciphertext into the decryption routine, and proves the message genuinely originated from the claimed sender before trusting its content.

**Q10. What happens if an attacker modifies even 1 bit of ciphertext in MongoDB?**  
**A:** First, the Ed25519 signature verification fails on the recipient's browser, decryption is aborted, and a red "Signature Verification Failed" warning is shown. Even if signature checking were bypassed, Poly1305 AEAD verification would fail.

**Q11. How do you guarantee deterministic signature verification between sender and receiver?**  
**A:** Both serialize the envelope into a strict newline-delimited UTF-8 canonical format (`CipherLine-Sig-v1\nmessageId\nconversationId\n...`) rather than relying on `JSON.stringify`, whose key ordering can vary.

**Q12. How are private keys stored in the browser, and what are the limitations?**  
**A:** Private keys are wrapped using PBKDF2-SHA256 (310,000 iterations) + AES-256-GCM into IndexedDB and kept decrypted only in React memory during an active session. Limitation: browser JS storage is exposed if an XSS vulnerability exists, and losing both password and backup prevents decrypting old messages.

**Q13. Does your protocol provide Forward Secrecy? Explain honestly.**  
**A:** No. Because CipherLine uses static long-term X25519 identity keys (with per-message HKDF salts), compromising a user's X25519 private key allows decrypting past messages under that key version. Production systems like Signal solve this using X3DH + Double Ratchet ephemeral prekeys.

**Q14. How do users protect against a malicious server substituting public keys (MITM)?**  
**A:** Users compare their symmetric 60-digit **Safety Number** (computed from both users' SHA-256 public-key fingerprints) out-of-band (voice/in-person) and mark the contact as Verified. If the contact's key ever changes, the UI raises a Key Change alert.

**Q15. How do you prevent replay attacks?**  
**A:** Each message includes a client-generated unique `messageId` signed inside the Ed25519 envelope and enforced with a unique index in MongoDB (`409` on duplicate).

**Q16. Why is `participantPairKey` used in the `Conversations` MongoDB schema?**  
**A:** Sorting the two user ObjectIds and storing a unique `minId:maxId` string prevents race conditions from creating duplicate 1-to-1 conversation threads.

**Q17. How does Socket.IO authenticate real-time connections?**  
**A:** The client passes the JWT in `socket.handshake.auth.token`. Server middleware verifies the HS256 signature, expiration, and checks `RevokedTokens` before allowing the socket connection.

**Q18. How do you prevent a logged-in user from reading another user's conversation?**  
**A:** Both REST (`GET /api/messages/:conversationId`) and Socket.IO (`conversation:join`) verify `req.user.id` is in `conversation.participants`, returning `403` and logging `UNAUTHORIZED_ACCESS` in `SecurityLogs` if not.

**Q19. How does logout invalidate an active JWT?**  
**A:** `POST /api/auth/logout` extracts the token's unique `jti` and inserts it into the `RevokedTokens` collection (which auto-expires via a MongoDB TTL index when the JWT naturally expires).

**Q20. How did you verify that plaintext is never stored in MongoDB?**  
**A:** Our backend rejects any request containing `plaintext` or `text` fields, and our automated test suite (`npm run test:security`) inspects the raw Mongoose `Message` document after sending and asserts the plaintext substring is completely absent.
