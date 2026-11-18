# API & Socket.IO Documentation

## REST API Endpoints

### Health
- `GET /api/health` — Returns `{ status: "ok", service: "cipherline-e2ee", dbReady, dbMode }`.

### Authentication (`/api/auth`)
- `POST /api/auth/register` — Rate-limited. Creates user with Argon2id hash and optional verified public key bundle (`encryptionPublicKey`, `signingPublicKey`, `fingerprint`). Rejects any private key fields.
- `POST /api/auth/login` — Rate-limited. Returns generic `"Invalid credentials"` on bad username/password.
- `POST /api/auth/logout` — Protected. Revokes JWT `jti` in `RevokedToken` and marks user offline.
- `GET /api/auth/me` — Protected. Returns current authenticated user profile.

### Users (`/api/users`)
- `GET /api/users?search=<query>` — Protected. Searches registered users by username (excluding requester).
- `GET /api/users/:id` — Protected. Returns single user public profile & public keys.

### Keys (`/api/keys`)
- `POST /api/keys/publish` — Protected. Verifies 32-byte key lengths + SHA-256 fingerprint; increments `keyVersion` on rotation.
- `GET /api/keys/:userId` — Protected. Returns peer public key bundle.

### Conversations (`/api/conversations`)
- `POST /api/conversations` — Protected. Creates or retrieves unique 1-to-1 conversation for `{ recipientId }`.
- `GET /api/conversations` — Protected. Lists conversations with peer status, unread count, and latest encrypted envelope.

### Messages (`/api/messages`)
- `GET /api/messages/:conversationId` — Protected & membership-checked. Returns up to 500 encrypted envelopes.
- `POST /api/messages` — Protected & membership-checked. Rejects `plaintext`/`text`, validates Base64 envelope sizes, enforces unique `messageId`.
- `PATCH /api/messages/:id/read` — Protected (recipient-only). Sets `deliveredAt` and `readAt` and broadcasts `message:read`.

### Security (`/api/security`)
- `GET /api/security/logs` — Protected. Returns latest 50 security audit entries for the authenticated user.
- `POST /api/security/signature-warning` — Protected. Records client-side Ed25519 verification failures.

## Socket.IO Events (`/socket.io`)

- Handshake requires valid, non-revoked JWT via `auth.token` or `Authorization: Bearer`.
- Client -> Server: `conversation:join`, `conversation:leave`, `message:send`, `message:delivered`, `message:read`.
- Server -> Client: `user:online`, `user:offline`, `message:new`, `message:delivered`, `message:read`.
