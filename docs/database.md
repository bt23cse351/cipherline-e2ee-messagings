# Database Schema Documentation (MongoDB & Mongoose)

## 1. `users` Collection (`User`)
- `username` (`String`, unique, lowercase, 3–24 chars)
- `email` (`String`, unique, lowercase)
- `passwordHash` (`String`, `select: false`, Argon2id PHC string)
- `encryptionPublicKey` (`String`, Base64 32-byte X25519 public key)
- `signingPublicKey` (`String`, Base64 32-byte Ed25519 public key)
- `fingerprint` (`String`, 64-char uppercase hex SHA-256)
- `keyVersion` (`Number`, integer >= 1)
- `isOnline` (`Boolean`), `lastSeen` (`Date`), `createdAt`, `updatedAt`

## 2. `conversations` Collection (`Conversation`)
- `participants` (`[ObjectId]`, ref `User`, indexed)
- `participantPairKey` (`String`, unique sorted `<idA>:<idB>`)
- `lastMessageAt` (`Date | null`), `createdAt`, `updatedAt`

## 3. `messages` Collection (`Message`)
- `messageId` (`String`, unique client-generated ID for replay prevention)
- `conversationId` (`ObjectId`, indexed), `senderId` (`ObjectId`), `recipientId` (`ObjectId`)
- `ciphertext` (`String`, Base64 XChaCha20-Poly1305 ciphertext + tag)
- `nonce` (`String`, Base64 24-byte nonce)
- `ephemeralPublicKey` (`String`, `hkdf-v1:<saltB64>`)
- `signature` (`String`, Base64 64-byte Ed25519 signature)
- `keyVersion`, `senderKeyVersion`, `recipientKeyVersion` (`Number`)
- `clientTimestamp` (`String`, ISO-8601)
- `deliveredAt` (`Date | null`), `readAt` (`Date | null`), `createdAt` (`Date`)

## 4. `securitylogs` Collection (`SecurityLog`)
- `userId` (`ObjectId | null`), `action` (`String`), `result` (`SUCCESS | FAILURE | BLOCKED`), `detail` (`String`), `timestamp` (`Date`)

## 5. `revokedtokens` Collection (`RevokedToken`)
- `jti` (`String`, unique), `expiresAt` (`Date`, MongoDB TTL index `expireAfterSeconds: 0`)
