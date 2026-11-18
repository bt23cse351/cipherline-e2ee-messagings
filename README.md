# CipherLine — Secure Real-Time Messaging System with End-to-End Encryption

**B.Tech Computer Science & Engineering Major Project**  
**Title:** *Secure Messaging System with End-to-End Encryption, Key Exchange, Digital Signatures and Authentication*

CipherLine is a full-stack, real-time one-to-one messaging web application where every message is encrypted and digitally signed inside the sender's browser before leaving the device, relayed in real time via Socket.IO, stored strictly as ciphertext in MongoDB, and verified and decrypted only on the recipient's device.

---

## Key Features

- **Genuine Client-Side End-to-End Encryption (E2EE):** Uses **X25519** key exchange, **HKDF-SHA256** per-message key derivation, and **XChaCha20-Poly1305** authenticated encryption via `libsodium-wrappers` and Web Crypto API.
- **Ed25519 Digital Signatures:** Every outgoing message envelope is serialized into a deterministic canonical format and signed with the sender's Ed25519 private key. Recipients verify the signature **before** attempting decryption and see an explicit security warning if verification fails.
- **Encrypted Local Key Vault:** Private keys never leave the client device and are encrypted locally in IndexedDB/browser storage using a password-derived **PBKDF2-SHA256 (310,000 iterations) + AES-256-GCM** key vault.
- **Argon2id Authentication & JWT Revocation:** Passwords are hashed on the backend using **Argon2id**, protected with rate limiting, generic login error messages, and immediate JWT revocation on logout (`RevokedToken` TTL collection).
- **Out-of-Band Key Fingerprint Verification:** Users can compare symmetric 60-digit **Safety Numbers** and SHA-256 public-key fingerprints to detect Man-in-the-Middle key substitution.
- **Real-Time Socket.IO Messaging:** Instant message delivery, online/offline presence, sent/delivered/read receipts, automatic reconnection sync, and strict server-side conversation membership checks.

---

## Project Folder Structure

```text
cipherline-e2ee/
├── backend/
│   ├── config/          # Environment loader & MongoDB connection (external + embedded fallback)
│   ├── controllers/     # Auth, User search, Public Keys, Conversations, Messages, Audit logs
│   ├── middleware/      # JWT auth guard, rate limiters, centralized error handler
│   ├── models/          # Mongoose schemas & indexes (User, Conversation, Message, SecurityLog, RevokedToken)
│   ├── routes/          # Express REST API routers
│   ├── sockets/         # Authenticated Socket.IO real-time messaging server
│   ├── utils/           # Zod validators, JWT sign/verify/revocation, safe SecurityLogger
│   ├── app.ts           # Express app factory with Helmet, CORS, payload size limits
│   └── .env.example     # Backend environment template
├── src/
│   ├── components/      # Avatar, ChatWindow, ConversationList, UserDirectory, VaultUnlockModal, CryptoInspectorModal
│   ├── context/         # AuthContext (JWT session, Socket.IO lifecycle, in-memory unlocked keys)
│   ├── crypto/          # e2ee.ts (X25519, HKDF-SHA256, XChaCha20-Poly1305, Ed25519) & keyVault.ts
│   ├── pages/           # AuthPages (Login/Register), Dashboard, SecurityDetailsView, ProfileView
│   ├── services/        # REST API client & Socket.IO client
│   ├── types/           # Shared TypeScript interfaces
│   ├── App.tsx          # Root React application
│   └── index.css        # Tailwind CSS v4 styles
├── docs/                # Architecture, Cryptography, Database, API, Threat Model, Testing, Report, PPT, Viva Q&A
├── tests/               # Automated E2EE, Signature, Auth, Authorization, Socket.IO, and DB integration tests
├── server.ts            # Unified Node.js/Express + Socket.IO + Vite server (Port 3000)
├── package.json
└── .env.example
```

---

## Windows 10 / 11 & VS Code Installation Guide

### Prerequisites

1. **Install Node.js (v20 LTS or v22 LTS):**
   - Download from [https://nodejs.org/](https://nodejs.org/) (Windows Installer `.msi`).
   - Verify installation in VS Code Terminal (PowerShell):
     ```powershell
     node -v
     npm -v
     ```
2. **Install MongoDB Community Server (or use MongoDB Atlas):**
   - **Option A — Local MongoDB Community Server:** Download from [https://www.mongodb.com/try/download/community](https://www.mongodb.com/try/download/community) and install with **"Install MongoDB as a Service"** checked.
   - **Option B — MongoDB Atlas (Cloud):** Create a free M0 cluster on [https://www.mongodb.com/atlas](https://www.mongodb.com/atlas) and copy your connection string (`mongodb+srv://...`).
   - **Option C — Zero-Config Demo Mode:** If `MONGODB_URI` is left blank in `.env`, the backend automatically boots an embedded persistent `MongoMemoryServer` database inside `.data/mongodb`.

### Step-by-Step Setup in VS Code PowerShell

1. **Open the project folder in VS Code:**
   ```powershell
   cd path\to\cipherline-e2ee
   code .
   ```

2. **Install all project dependencies:**
   ```powershell
   npm install
   ```

3. **Create your `.env` file from `.env.example`:**
   ```powershell
   Copy-Item .env.example .env
   ```
   Open `.env` in VS Code and configure your values:
   ```env
   PORT=3000
   MONGODB_URI="mongodb://127.0.0.1:27017/cipherline_e2ee"
   JWT_SECRET="generate_a_long_64_char_random_hex_string_here"
   JWT_EXPIRES_IN="12h"
   CORS_ORIGIN="http://localhost:3000,http://localhost:5173"
   ```
   To generate a strong 64-character `JWT_SECRET` in PowerShell using Node.js:
   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

4. **Ensure MongoDB service is running (if using local MongoDB Community Server):**
   ```powershell
   Get-Service MongoDB
   # If stopped, run in an Administrator PowerShell:
   Start-Service MongoDB
   ```

5. **Run the automated security & integration test suite:**
   ```powershell
   npm run test:security
   ```

6. **Start the full-stack server (Backend + Socket.IO + React Vite Frontend):**
   ```powershell
   npm run dev
   ```
   Or build for production and start:
   ```powershell
   npm run build
   npm start
   ```

7. **Access the application:**
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Testing with Two Separate Accounts

1. Open **Window 1** (normal Chrome/Edge window) at `http://localhost:3000` and register **Alice** (`alice_dev`, strong password like `AliceSecure!2026`).
2. Open **Window 2** (an Incognito/Private window or a second browser tab, since JWTs are stored per-tab in `sessionStorage`) at `http://localhost:3000` and register **Bob** (`bob_dev`, strong password like `BobSecure!2026`).
3. In Alice's window, open **People**, search for `bob_dev`, and click **Message**.
4. Send a message from Alice to Bob:
   - Observe instant delivery in Bob's window with **Delivered / Read** double checkmarks.
   - Click the **`</>` (Inspect Envelope)** icon on any message to show your project guide the actual Base64 **ciphertext**, **24-byte nonce**, **HKDF salt**, and **64-byte Ed25519 signature** stored in MongoDB.
   - Open the **Security** tab on both windows to verify the identical **60-digit Safety Number** out-of-band.

---

## Security Disclaimer

This application is designed as a B.Tech Computer Science major project demonstrating real cryptographic primitives (`libsodium` X25519, Ed25519, XChaCha20-Poly1305, HKDF-SHA256, Argon2id). It uses static identity X25519 keys with per-message random HKDF salts and does not implement the Signal Double Ratchet (so it does not provide Per-Message Forward Secrecy). See `docs/cryptography.md` and `docs/threat-model.md` for full security boundaries and limitations.
