# Testing & Verification Report

## 1. Execution Command & Environment

- **Command Executed:** `npm run test:security` (`tsx tests/e2ee.integration.test.ts`)
- **Runtime:** Node.js `v22.23.2`, MongoDB (WiredTiger persistent test instance via `mongodb-memory-server`), Express + Socket.IO + `libsodium-wrappers` + Web Crypto API.
- **Result Summary:** **11 / 11 automated integration & security test suites PASSED** (exit code `0`).

---

## 2. Executed Test Cases & Observed Results

| Category | Test Case | Verification Method | Result |
| :--- | :--- | :--- | :--- |
| **Authentication** | Register accounts (`alice_test`, `bob_test`, `mallory_test`) | Verified HTTP `201`, JWT issuance, and `$argon2id$` PHC hash stored in MongoDB `User` | **PASS** |
| **Authentication** | Reject duplicate accounts | Submitted duplicate username to `/api/auth/register`; verified HTTP `409` | **PASS** |
| **Authentication** | Login with valid credentials | Submitted valid credentials to `/api/auth/login`; verified HTTP `200` + JWT | **PASS** |
| **Authentication** | Reject wrong password | Submitted wrong password; verified HTTP `401` and generic `"Invalid credentials"` | **PASS** |
| **Authentication** | Reject expired, invalid, and revoked JWTs | Tested expired JWT, malformed JWT, and JWT after `POST /api/auth/logout`; all rejected with `401` | **PASS** |
| **Cryptography** | X25519 + HKDF-SHA256 key compatibility | Derived shared secret & HKDF-SHA256 key independently on Alice & Bob; verified byte-for-byte equality | **PASS** |
| **Encryption** | Client-side E2EE & zero plaintext in DB | Encrypted `"Confidential BTech CSE E2EE Viva Message #42!"`, queried raw MongoDB `Message`, confirmed plaintext absent, decrypted on Bob | **PASS** |
| **Signatures** | Reject modified ciphertext, modified signature, wrong sender | Mutated ciphertext byte, mutated signature byte, and substituted Mallory's Ed25519 key; all failed signature verification before decryption | **PASS** |
| **Authorization** | Reject unauthorized read, send, read receipt, plaintext, and private key | Mallory blocked (`403`) on `GET /api/messages/:id`, `POST /api/messages`, Socket room join; Alice blocked (`403`) on self-read-receipt; plaintext & private keys rejected (`400`) | **PASS** |
| **Realtime** | Socket.IO auth, live delivery, read receipts, reconnection | Rejected unauthenticated socket; verified live `message:new`, `message:read` delivery, and disconnect/reconnect | **PASS** |
| **Database** | Indexes, safe logging, and persistence across restart | Verified unique indexes on `User`, `Message`; confirmed `SecurityLogs` contain zero plaintext/passwords/keys; stopped & restarted MongoDB using same WiredTiger `dbPath` and confirmed messages persisted | **PASS** |

---

## 3. Build & Type Verification

- `npm run build` (`vite build`): **PASS** — Compiled production client bundle cleanly.
- `npm run lint` (`tsc --noEmit`): **PASS** — Zero TypeScript errors across frontend, backend, and tests.
