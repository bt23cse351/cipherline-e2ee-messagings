import { RefreshCw, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { CryptoPipelineDiagram } from '../components/GraphicsPrimitives';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import type { SecurityLogEntry } from '../types/messaging';

export function SecurityDetailsView() {
  const { token } = useAuth();
  const [logs, setLogs] = useState<SecurityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.getSecurityLogs(token);
      setLogs(res.logs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to fetch security logs');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const protocolSpecs = [
    {
      layer: 'Password Storage',
      primitive: 'Argon2id (64 MiB RAM, t=3, p=1)',
      purpose: 'Memory-hard server-side credential verification',
    },
    {
      layer: 'Session Authentication',
      primitive: 'JWT HS256 + JTI Revocation List',
      purpose: 'Stateless API & Socket.IO auth with immediate logout revocation',
    },
    {
      layer: 'Key Agreement',
      primitive: 'X25519 (Curve25519 ECDH, 32-byte keys)',
      purpose: 'Client-only shared secret derivation between peers',
    },
    {
      layer: 'Key Derivation',
      primitive: 'HKDF-SHA256 (16-byte random salt per message)',
      purpose: 'Domain-separated 256-bit message key bound to conversationId & keyVersion',
    },
    {
      layer: 'Authenticated Encryption',
      primitive: 'XChaCha20-Poly1305 (24-byte CSPRNG nonce + AAD)',
      purpose: 'Confidentiality and ciphertext/AAD tamper rejection',
    },
    {
      layer: 'Digital Signatures',
      primitive: 'Ed25519 Detached Signature (Verify-Then-Decrypt)',
      purpose: 'Sender authenticity and non-repudiation across the full envelope',
    },
    {
      layer: 'Local Key Vault',
      primitive: 'PBKDF2-SHA256 (310,000 iter) + AES-256-GCM',
      purpose: 'Encrypts private keys at rest inside browser IndexedDB',
    },
  ];

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex items-start gap-3.5">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-teal-600 to-cyan-600 text-white flex items-center justify-center shrink-0 mt-0.5">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-900">
                Cryptographic Protocol &amp; Honest Threat Model
              </h1>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Every primitive in CipherLine uses audited libsodium and Web Crypto APIs. Private
                keys, shared secrets, and plaintext messages never leave the browser.
              </p>
            </div>
          </div>

          <CryptoPipelineDiagram />

          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-900 border-b border-slate-800 text-xs font-semibold text-teal-200">
                  <th className="py-2.5 px-4">Security Layer</th>
                  <th className="py-2.5 px-4">Algorithm / Parameters</th>
                  <th className="py-2.5 px-4">Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {protocolSpecs.map((spec) => (
                  <tr key={spec.layer}>
                    <td className="py-2.5 px-4 font-semibold text-slate-900 whitespace-nowrap">
                      {spec.layer}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-800">{spec.primitive}</td>
                    <td className="py-2.5 px-4 text-slate-600">{spec.purpose}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1.5">
            <p className="font-semibold text-slate-900">Documented Cryptographic Scope &amp; Limits</p>
            <p>
              CipherLine uses static per-device X25519 identity keys combined with per-message random
              HKDF-SHA256 salts so message keys never repeat. Unlike Signal&apos;s ephemeral Double
              Ratchet, static X25519 identity keys do not provide post-compromise forward secrecy if
              a long-term private key is later extracted from a compromised endpoint, and browser
              runtimes remain vulnerable to XSS if untrusted scripts execute in the origin.
            </p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Account Security Audit Trail</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Server-recorded authentication, key publication, ciphertext relay, and blocked
                tamper/authorization events.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadLogs()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>
          </div>

          {error && (
            <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">
              {error}
            </p>
          )}

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 rounded bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">
              No security events recorded yet for this account.
            </p>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-700">
                    <th className="py-2.5 px-4">Timestamp</th>
                    <th className="py-2.5 px-4">Event</th>
                    <th className="py-2.5 px-4">Outcome</th>
                    <th className="py-2.5 px-4">Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {logs.map((entry) => (
                    <tr key={entry.id}>
                      <td className="py-2.5 px-4 font-mono text-slate-500 tabular-nums whitespace-nowrap">
                        {new Date(entry.timestamp).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-4 font-mono font-medium text-slate-900 whitespace-nowrap">
                        {entry.action}
                      </td>
                      <td
                        className={`py-2.5 px-4 font-medium whitespace-nowrap ${
                          entry.result === 'SUCCESS'
                            ? 'text-emerald-700'
                            : entry.result === 'BLOCKED'
                            ? 'text-amber-700'
                            : 'text-rose-700'
                        }`}
                      >
                        {entry.result}
                      </td>
                      <td className="py-2.5 px-4 text-slate-600">{entry.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
