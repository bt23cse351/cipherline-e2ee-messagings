import { Eye, EyeOff, KeyRound, Lock, ShieldCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';

export function AuthPages() {
  const { loginAccount, registerAccount } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');

  const [identifier, setIdentifier] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordChecks = [
    { label: 'At least 10 characters', valid: password.length >= 10 },
    { label: 'Uppercase & lowercase letter', valid: /[A-Z]/.test(password) && /[a-z]/.test(password) },
    { label: 'Number & special symbol', valid: /[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password) },
  ];

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      if (mode === 'login') {
        await loginAccount({ identifier: identifier.trim(), password });
      } else {
        await registerAccount({
          username: username.trim().toLowerCase(),
          email: email.trim().toLowerCase(),
          password,
        });
      }
    } catch (err) {
      let message = err instanceof Error ? err.message : 'Authentication failed';
      if (mode === 'login' && message.toLowerCase().includes('invalid credentials')) {
        try {
          const healthRes = await fetch('/api/health');
          if (healthRes.ok) {
            const health = (await healthRes.json()) as {
              dbMode?: string;
              dbWarning?: string | null;
            };
            if (health.dbMode === 'embedded') {
              const reason = health.dbWarning
                ? ` (${health.dbWarning})`
                : ' (external MongoDB Atlas is not connected, so accounts reset when the server restarts)';
              message = `${message}. Note: Server is using temporary in-memory database${reason}`;
            }
          }
        } catch {
          // Keep original error message if health probe fails
        }
      }
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="px-6 sm:px-10 py-5 border-b border-slate-200 bg-white flex items-center justify-between gap-6">
        <span className="text-lg font-display font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
          CipherLine
        </span>
        <div className="flex items-center gap-4 text-xs text-slate-600">
          <span className="hidden sm:inline whitespace-nowrap">
            X25519 · HKDF-SHA256 · XChaCha20-Poly1305 · Ed25519
          </span>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-10 lg:py-16 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
        <section className="lg:col-span-6 space-y-6">
          <div className="space-y-3">
            <p className="text-xs font-medium text-teal-700 tracking-wide">
              End-to-End Encrypted 1-to-1 Messaging
            </p>
            <h1 className="text-3xl sm:text-4xl font-display font-bold text-slate-900 tracking-tight leading-tight text-balance">
              Zero-plaintext messaging verified on your device.
            </h1>
            <p className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-xl">
              Your browser generates X25519 encryption and Ed25519 signing keys locally before any
              message leaves your screen. MongoDB persists only authenticated ciphertext, nonces,
              and cryptographic signatures.
            </p>
          </div>

          <div className="border border-slate-200 rounded-xl bg-white divide-y divide-slate-200">
            <div className="p-4 flex items-start gap-3">
              <KeyRound className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  Client-Side Key Generation &amp; Vault
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Private keys are wrapped with PBKDF2-SHA256 (310,000 iterations) and AES-256-GCM
                  in browser IndexedDB. Never transmitted to the backend.
                </p>
              </div>
            </div>
            <div className="p-4 flex items-start gap-3">
              <Lock className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  X25519 + HKDF-SHA256 + XChaCha20-Poly1305
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Each message derives a unique per-message AEAD key using a fresh 16-byte HKDF
                  salt and 24-byte random nonce.
                </p>
              </div>
            </div>
            <div className="p-4 flex items-start gap-3">
              <ShieldCheck className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  Ed25519 Signatures &amp; Safety Numbers
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Every envelope is verified before decryption and contacts expose 60-digit safety
                  numbers for out-of-band fingerprint checks.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="lg:col-span-6">
          <div className="max-w-md mx-auto bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
            <div className="p-6 pb-4 border-b border-slate-200">
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError(null);
                  }}
                  className={`flex-1 px-4 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    mode === 'login'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setError(null);
                  }}
                  className={`flex-1 px-4 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    mode === 'register'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Create Account
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {mode === 'login' ? (
                <div>
                  <label
                    htmlFor="auth-identifier"
                    className="block text-xs font-medium text-slate-700 mb-1.5"
                  >
                    Username or Email
                  </label>
                  <input
                    id="auth-identifier"
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="alice or alice@example.com"
                    autoComplete="username"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                  />
                </div>
              ) : (
                <>
                  <div>
                    <label
                      htmlFor="auth-username"
                      className="block text-xs font-medium text-slate-700 mb-1.5"
                    >
                      Unique Username
                    </label>
                    <input
                      id="auth-username"
                      type="text"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="alice_dev"
                      autoComplete="username"
                      className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      3–24 characters: lowercase letters, numbers, or underscores.
                    </p>
                  </div>
                  <div>
                    <label
                      htmlFor="auth-email"
                      className="block text-xs font-medium text-slate-700 mb-1.5"
                    >
                      Email Address
                    </label>
                    <input
                      id="auth-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="alice@example.com"
                      autoComplete="email"
                      className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                    />
                  </div>
                </>
              )}

              <div>
                <label
                  htmlFor="auth-password"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="auth-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter strong password"
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    className="w-full pl-3.5 pr-10 py-2.5 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {mode === 'register' && (
                  <div className="mt-2.5 space-y-1">
                    {passwordChecks.map((check) => (
                      <p
                        key={check.label}
                        className={`text-xs ${
                          check.valid ? 'text-emerald-700 font-medium' : 'text-slate-500'
                        }`}
                      >
                        {check.valid ? 'Pass' : 'Required'} · {check.label}
                      </p>
                    ))}
                  </div>
                )}
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs font-medium text-rose-700">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 px-4 text-sm font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800 disabled:opacity-60 transition-colors whitespace-nowrap"
              >
                {submitting
                  ? mode === 'login'
                    ? 'Authenticating...'
                    : 'Generating Keys & Creating Account...'
                  : mode === 'login'
                  ? 'Sign In'
                  : 'Generate Keys & Register'}
              </button>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}
