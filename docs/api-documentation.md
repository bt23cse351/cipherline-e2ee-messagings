# REST API & Socket.IO Event Documentation

## 1. Authentication & Security Headers

All protected endpoints require an HTTP `Authorization: Bearer <jwt>` header.
Rate limiting (`express-rate-limit`), `helmet` security headers, strict JSON size limits (`128kb`), and Zod validation protect every route.

---

## 2. REST API Endpoints

### Auth Routes (`/api/auth`)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Public | Registers user with Argon2id password hash and optional verified public keys (`encryptionPublicKey`, `signingPublicKey`, `fingerprint`). Rejects private keys (`400`) or duplicates (`409`). |
| `POST` | `/api/auth/login` | Public | Verifies Argon2id password hash; returns JWT + user profile or generic `401 Invalid credentials`. |
| `POST` | `/api/auth/logout` | Bearer | Revokes active JWT `jti` in `RevokedToken`, marks user offline, logs `LOGOUT`. |
| `GET` | `/api/auth/me` | Bearer | Returns authenticated user's public profile. |

### User Directory Routes (`/api/users`)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/users?search=<q>` | Bearer | Lists/searches registered users (excluding current user) with public keys and online status. |
| `GET` | `/api/users/:id` | Bearer | Retrieves a specific user's public profile and public keys. |

### Public Key Exchange Routes (`/api/keys`)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/keys/publish` | Bearer | Validates 32-byte X25519 + Ed25519 public keys, verifies SHA-256 fingerprint match, increments `keyVersion` on rotation. Rejects any private key fields. |
| `GET` | `/api/keys/:userId` | Bearer | Returns `{ userId, username, encryptionPublicKey, signingPublicKey, fingerprint, keyVersion }`. |

### Conversation Routes (`/api/conversations`)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/conversations` | Bearer | Body `{ recipientId }`. Creates or retrieves atomic 1-to-1 conversation. |
| `GET` | `/api/conversations` | Bearer | Returns user's conversations with peer metadata, latest encrypted message envelope, and unread count. |

### Encrypted Message Routes (`/api/messages`)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/messages/:conversationId` | Bearer | Verifies conversation membership (`403` otherwise); returns ordered encrypted envelopes. |
| `POST` | `/api/messages` | Bearer | Verifies membership & unique `messageId`; rejects plaintext (`400`); persists ciphertext + signature; emits Socket.IO `message:new`. |
| `PATCH` | `/api/messages/:id/read` | Bearer | Verifies `req.user.id === message.recipientId` (`403` otherwise); updates `readAt` and emits `message:read`. |

### Security Audit Routes (`/api/security`)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/security/logs` | Bearer | Returns latest 50 `SecurityLog` events for the authenticated user. |
| `POST` | `/api/security/signature-warning` | Bearer | Records client-detected Ed25519 signature verification failures in `SecurityLog`. |

---

## 3. Socket.IO Real-Time Events

Socket handshake requires `auth: { token: "<jwt>" }`. Unauthenticated connections or revoked tokens are rejected immediately.

| Event | Direction | Payload | Server Verification & Behavior |
| :--- | :--- | :--- | :--- |
| `user:online` | Server -> Clients | `{ userId, username, isOnline: true, lastSeen }` | Emitted when a user opens their first active socket. |
| `user:offline` | Server -> Clients | `{ userId, username, isOnline: false, lastSeen }` | Emitted when a user closes their last active socket. |
| `conversation:join` | Client -> Server | `{ conversationId }` | Verifies user is a participant in `conversationId` before joining room `conv:<id>`. |
| `message:send` | Client -> Server | Encrypted envelope (`messageId`, `ciphertext`, `nonce`, `ephemeralPublicKey`, `signature`, ...) | Validates Zod schema, membership, and uniqueness; persists to MongoDB; emits `message:new` & `message:delivered`. |
| `message:new` | Server -> Recipient | Serialized encrypted envelope | Delivered to `user:<recipientId>` and `conv:<conversationId>`. |
| `message:delivered` | Bidirectional | `{ id, messageId, conversationId, deliveredAt }` | Confirms receipt by recipient's socket; updates MongoDB `deliveredAt`. |
| `message:read` | Bidirectional | `{ messageId }` / `{ id, messageId, conversationId, deliveredAt, readAt }` | Verifies `socket.data.userId === message.recipientId` before updating `readAt`. |
