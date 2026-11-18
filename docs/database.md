# MongoDB Database Design & ER Diagram

## 1. Entity-Relationship (ER) Diagram

```text
+---------------------------+          +----------------------------------+
|           Users           |          |          Conversations           |
+---------------------------+          +----------------------------------+
| PK _id : ObjectId         |<---+     | PK _id : ObjectId                |
| UQ username : String      |    |     | FK participants : [ObjectId]     |
| UQ email : String         |    +-----| UQ participantPairKey : String   |
|    passwordHash : String  |          |    lastMessageAt : Date          |
|    encryptionPublicKey    |          |    createdAt / updatedAt : Date  |
|    signingPublicKey       |          +----------------+-----------------+
| IX fingerprint : String   |                           |
|    keyVersion : Number    |                           | 1 : N
|    isOnline : Boolean     |                           v
|    lastSeen : Date        |          +----------------------------------+
|    createdAt / updatedAt  |          |             Messages             |
+-------------+-------------+          +----------------------------------+
              |                        | PK _id : ObjectId                |
              | 1 : N                  | UQ messageId : String            |
              v                        | IX conversationId : ObjectId     |
+---------------------------+          | FK senderId : ObjectId           |
|       SecurityLogs        |          | FK recipientId : ObjectId        |
+---------------------------+          |    ciphertext : String (Base64)  |
| PK _id : ObjectId         |          |    nonce : String (24B Base64)   |
| IX userId : ObjectId      |          |    ephemeralPublicKey : String   |
| IX action : String        |          |    signature : String (64B B64)  |
|    result : String        |          |    keyVersion / sender/rec Ver   |
|    detail : String        |          |    clientTimestamp : String      |
| IX timestamp : Date       |          |    deliveredAt / readAt : Date   |
+---------------------------+          |    createdAt : Date              |
                                       +----------------------------------+
+---------------------------+
|       RevokedTokens       |
+---------------------------+
| PK _id : ObjectId         |
| UQ jti : String           |
|TTL expiresAt : Date       |
+---------------------------+
```

---

## 2. Collections & Indexes

### 1. `users`
- **Indexes:** `{ username: 1 }` (unique), `{ email: 1 }` (unique), `{ fingerprint: 1 }`.
- **Projection Protection:** `passwordHash` uses `select: false` so it is never returned by normal queries.

### 2. `conversations`
- **Indexes:** `{ participantPairKey: 1 }` (unique), `{ participants: 1 }`, `{ updatedAt: -1 }`.
- **Race-Condition Prevention:** `participantPairKey` stores `"<minObjectId>:<maxObjectId>"` ensuring at most one 1-to-1 conversation document exists between any two users.

### 3. `messages`
- **Indexes:** `{ messageId: 1 }` (unique — replay protection), `{ conversationId: 1, createdAt: 1 }` (chronological history), `{ recipientId: 1, readAt: 1 }` (unread counts).
- **Zero-Plaintext Guarantee:** Plaintext fields (`text`, `plaintext`) are rejected at both Zod schema and Mongoose schema levels. Only `ciphertext`, `nonce`, `ephemeralPublicKey` (HKDF salt reference), `signature`, and routing metadata are persisted.

### 4. `securitylogs`
- **Indexes:** `{ userId: 1, timestamp: -1 }`, `{ action: 1, timestamp: -1 }`.
- **Safe Logging:** Logs only authentication outcomes, key publications, and blocked unauthorized access attempts. Never logs message content, passwords, JWTs, or keys.

### 5. `revokedtokens`
- **Indexes:** `{ jti: 1 }` (unique), `{ expiresAt: 1 }` (`expireAfterSeconds: 0` MongoDB TTL index for automatic cleanup after JWT expiration).
