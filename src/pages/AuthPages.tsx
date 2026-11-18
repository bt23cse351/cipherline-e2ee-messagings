import React, { useMemo, useState } from 'react';
import { Eye, EyeOff, KeyRound, Lock, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function AuthPages() {
  const { register, login } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');

  const passwordChecks = useMemo(() => {
    return [
      { label: 'At least 10 characters', ok: password.length >= 10 },
      { label: 'Uppercase letter (A-Z)', ok: /[A-Z]/.test(password) },
      { label: 'Lowercase letter (a-z)', ok: /[a-z]/.test(password) },
      { label: 'Number (0-9)', ok: /[0-9]/.test(password) },
      { label: 'Special character (!@#$...)', ok: /[^A-Za-z0-9]/.test(password) },
    ];
  }, [password]);

  const allPasswordChecksPass = passwordChecks.every((c) => c.ok);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      if (mode === 'register') {
        if (!allPasswordChecksPass) {
          setError('Please meet all password strength requirements.');
          setSubmitting(false);
          return;
        }
        setStatusMessage('Generating X25519 & Ed25519 keys locally and encrypting key vault...');
        await register({
          username: username.trim().toLowerCase(),
          email: email.trim().toLowerCase(),
          password,
        });
      } else {
        setStatusMessage('Verifying Argon2id credentials and unlocking local key vault...');
        await login({
          identifier: identifier.trim(),
          password,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setSubmitting(false);
      setStatusMessage('');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col lg:flex-row">
      {/* Left Architectural Briefing Panel */}
      <div className="lg:w-[46%] bg-slate-900 text-slate-100 p-8 sm:p-12 lg:p-16 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-800">
        <div>
          <div className="flex items-center gap-2.5 text-teal-400">
            <Lock className="h-5 w-5" />
            <span className="font-display text-lg font-semibold tracking-tight text-white">
              CipherLine
            </span>
          </div>

          <h1 className="mt-10 font-display text-3xl sm:text-4xl font-semibold tracking-tight text-white leading-tight [text-wrap:balance]">
            End-to-end encrypted real-time messaging.
          </h1>
          <p className="mt-4 text-sm sm:text-base text-slate-300 leading-relaxed max-w-md">
            Messages are encrypted, signed, and verified exclusively inside your browser before
            touching the network. The server relays only ciphertext and public key metadata.
          </p>

          <dl className="mt-10 space-y-6 border-t border-slate-800 pt-8 max-w-md">
            <div>
              <dt className="text-xs font-medium text-teal-400">Key Agreement & Derivation</dt>
              <dd className="mt-1 text-sm text-slate-300">
                X25519 Elliptic Curve Diffie-Hellman paired with HKDF-SHA256 and per-message
                random salts.
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-teal-400">Authenticated Encryption</dt>
              <dd className="mt-1 text-sm text-slate-300">
                XChaCha20-Poly1305 with unique 192-bit CSPRNG nonces and associated metadata
                binding.
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-teal-400">Digital Signatures & Auth</dt>
              <dd className="mt-1 text-sm text-slate-300">
                Deterministic Ed25519 message envelope signatures verified prior to decryption,
                with Argon2id password hashing.
              </dd>
            </div>
          </dl>
        </div>

        <p className="mt-10 text-xs text-slate-400">
          Private keys remain inside your password-encrypted local vault and are never
          transmitted to the backend.
        </p>
      </div>

      {/* Right Authentication Form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 sm:p-8 shadow-sm">
          <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-5">
            <div>
              <h2 className="font-display text-xl font-semibold text-slate-900">
                {mode === 'login' ? 'Sign in to CipherLine' : 'Create encrypted account'}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                {mode === 'login'
                  ? 'Authenticate and unlock your local private key vault.'
                  : 'Generates X25519 and Ed25519 keys locally on your device.'}
              </p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError('');
              }}
              className={`py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                mode === 'login'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError('');
              }}
              className={`py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                mode === 'register'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Register
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {mode === 'register' ? (
              <>
                <div>
                  <label
                    htmlFor="reg-username"
                    className="block text-xs font-medium text-slate-700 mb-1.5"
                  >
                    Username
                  </label>
                  <input
                    id="reg-username"
                    type="text"
                    required
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="alice_dev"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-teal-600"
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    3–24 characters using lowercase letters, numbers, or underscores.
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="reg-email"
                    className="block text-xs font-medium text-slate-700 mb-1.5"
                  >
                    Email Address
                  </label>
                  <input
                    id="reg-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="alice@university.edu"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-teal-600"
                  />
                </div>
              </>
            ) : (
              <div>
                <label
                  htmlFor="login-identifier"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  Username or Email
                </label>
                <input
                  id="login-identifier"
                  type="text"
                  required
                  autoComplete="username"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="alice_dev or alice@university.edu"
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-teal-600"
                />
              </div>
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
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter strong password"
                  className="w-full px-3.5 py-2.5 pr-10 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-teal-600"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {mode === 'register' && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1.5">
                <div className="text-xs font-medium text-slate-700">Password Strength Rules</div>
                <ul className="space-y-1">
                  {passwordChecks.map((check) => (
                    <li
                      key={check.label}
                      className={`text-xs flex items-center gap-2 ${
                        check.ok ? 'text-emerald-700' : 'text-slate-500'
                      }`}
                    >
                      <span aria-hidden="true">{check.ok ? '✓' : '○'}</span>
                      <span>{check.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800"
              >
                {error}
              </div>
            )}

            {statusMessage && (
              <div className="p-3 bg-teal-50 border border-teal-200 rounded-lg text-xs text-teal-900 flex items-center gap-2">
                <KeyRound className="h-4 w-4 shrink-0" />
                <span>{statusMessage}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <ShieldCheck className="h-4 w-4" />
              <span>
                {submitting
                  ? mode === 'login'
                    ? 'Authenticating...'
                    : 'Generating Keys...'
                  : mode === 'login'
                    ? 'Sign In & Unlock Vault'
                    : 'Create Account & Generate Keys'}
              </span>
            </button>
          </form>

          <p className="mt-5 text-[11px] text-slate-500 leading-relaxed">
            Tip for testing: Open a second browser tab or incognito window to register a second
            user and verify real-time E2EE messaging between two live accounts.
          </p>
        </div>
      </div>
    </div>
  );
}
