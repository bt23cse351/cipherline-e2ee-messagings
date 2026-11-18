import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  KeyRound,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  computePairSafetyNumber,
  formatFingerprintGroups,
} from '../crypto/e2ee';
import { exportEncryptedVaultBackup } from '../crypto/keyVault';
import { api } from '../services/api';
import type { PublicUser, SecurityLogItem } from '../types/messaging';

interface SecurityDetailsViewProps {
  initialContact?: PublicUser | null;
}

export function SecurityDetailsView({ initialContact }: SecurityDetailsViewProps) {
  const {
    user,
    token,
    keyBundle,
    verifiedContacts,
    markContactVerified,
    revokeContactVerification,
    generateAndPublishFreshKeys,
  } = useAuth();

  const [contacts, setContacts] = useState<PublicUser[]>([]);
  const [selectedPeer, setSelectedPeer] = useState<PublicUser | null>(initialContact || null);
  const [safetyNumber, setSafetyNumber] = useState<string[]>([]);
  const [logs, setLogs] = useState<SecurityLogItem[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);

  const [backupPassphrase, setBackupPassphrase] = useState('');
  const [exportedBackup, setExportedBackup] = useState('');
  const [copiedBackup, setCopiedBackup] = useState(false);

  const [rotatePassword, setRotatePassword] = useState('');
  const [rotating, setRotating] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    if (initialContact) {
      setSelectedPeer(initialContact);
    }
  }, [initialContact]);

  useEffect(() => {
    if (!token) return;
    let active = true;

    Promise.all([api.searchUsers(token, ''), api.getSecurityLogs(token)])
      .then(([usersRes, logsRes]) => {
        if (!active) return;
        setContacts(usersRes.users);
        if (!selectedPeer && usersRes.users.length > 0) {
          setSelectedPeer(usersRes.users[0]);
        }
        setLogs(logsRes.logs);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLogsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedPeer, token]);

  useEffect(() => {
    if (!user?.fingerprint || !selectedPeer?.fingerprint) {
      setSafetyNumber([]);
      return;
    }
    computePairSafetyNumber(user.fingerprint, selectedPeer.fingerprint).then(setSafetyNumber);
  }, [selectedPeer, user]);

  const handleExportBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !keyBundle) return;
    setActionError('');
    if (backupPassphrase.length < 8) {
      setActionError('Backup passphrase must be at least 8 characters.');
      return;
    }
    const json = await exportEncryptedVaultBackup(user.id, backupPassphrase, keyBundle);
    setExportedBackup(json);
    setActionMessage('Encrypted vault backup generated. Copy and store it safely offline.');
  };

  const handleCopyBackup = async () => {
    if (!exportedBackup) return;
    await navigator.clipboard.writeText(exportedBackup);
    setCopiedBackup(true);
    setTimeout(() => setCopiedBackup(false), 2000);
  };

  const handleRotateKeys = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError('');
    setActionMessage('');
    if (rotatePassword.length < 10) {
      setActionError('Enter your strong vault password (10+ characters) to rotate keys.');
      return;
    }
    setRotating(true);
    try {
      await generateAndPublishFreshKeys(rotatePassword);
      setRotatePassword('');
      setActionMessage(
        'Generated new X25519 + Ed25519 key pairs and published updated public keys.'
      );
      if (token) {
        const res = await api.getSecurityLogs(token);
        setLogs(res.logs);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Key rotation failed');
    } finally {
      setRotating(false);
    }
  };

  if (!user) return null;

  const ownFingerprintGroups = formatFingerprintGroups(user.fingerprint);
  const verifiedRecord = selectedPeer ? verifiedContacts[selectedPeer.id] : undefined;
  const isSelectedPeerVerified =
    Boolean(selectedPeer) &&
    Boolean(verifiedRecord) &&
    verifiedRecord?.fingerprint === selectedPeer?.fingerprint;

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-5 sm:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-900">
            Security & Key Fingerprints
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Verify contact safety numbers out-of-band, inspect your X25519 and Ed25519 public
            keys, manage encrypted vault backups, and audit account security events.
          </p>
        </div>

        {actionMessage && (
          <div className="p-3.5 bg-teal-50 border border-teal-200 rounded-lg text-xs text-teal-900">
            {actionMessage}
          </div>
        )}
        {actionError && (
          <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
            {actionError}
          </div>
        )}

        {/* Own Public Keys & Fingerprint */}
        <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-4">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Your Public Identity Keys
              </h2>
              <p className="text-xs text-slate-500">
                @{user.username} · Key Version {user.keyVersion} · SHA-256 Fingerprint
              </p>
            </div>
            <span className="text-xs font-medium text-teal-700">
              Private keys stay in your local encrypted vault
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <div className="font-medium text-slate-700 mb-1">
                X25519 Encryption Public Key (Base64)
              </div>
              <pre className="p-3 bg-slate-50 border border-slate-200 rounded-lg font-mono text-[11px] break-all whitespace-pre-wrap text-slate-800">
                {user.encryptionPublicKey || 'Not published'}
              </pre>
            </div>
            <div>
              <div className="font-medium text-slate-700 mb-1">
                Ed25519 Signing Public Key (Base64)
              </div>
              <pre className="p-3 bg-slate-50 border border-slate-200 rounded-lg font-mono text-[11px] break-all whitespace-pre-wrap text-slate-800">
                {user.signingPublicKey || 'Not published'}
              </pre>
            </div>
          </div>

          <div>
            <div className="text-xs font-medium text-slate-700 mb-2">
              SHA-256 Public Key Fingerprint
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 p-3.5 bg-slate-900 text-teal-300 rounded-lg font-mono text-xs tabular-nums">
              {ownFingerprintGroups.map((group, idx) => (
                <span key={`${group}-${idx}`} className="text-center">
                  {group}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Contact Safety Number Verification */}
        <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Out-of-Band Contact Fingerprint Verification
              </h2>
              <p className="text-xs text-slate-500">
                Compare this 60-digit Safety Number with your contact in person or via voice
                call to prevent Man-in-the-Middle key substitution.
              </p>
            </div>

            <select
              value={selectedPeer?.id || ''}
              onChange={(e) => {
                const found = contacts.find((c) => c.id === e.target.value) || null;
                setSelectedPeer(found);
              }}
              className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              aria-label="Select contact to verify"
            >
              {contacts.length === 0 ? (
                <option value="">No contacts available</option>
              ) : (
                contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    @{c.username} (Key v{c.keyVersion})
                  </option>
                ))
              )}
            </select>
          </div>

          {selectedPeer ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-slate-600">
                  Contact:{' '}
                  <span className="font-medium text-slate-900">@{selectedPeer.username}</span> ·
                  Key v{selectedPeer.keyVersion} · Status:{' '}
                  <span
                    className={`font-medium ${
                      isSelectedPeerVerified ? 'text-teal-700' : 'text-amber-700'
                    }`}
                  >
                    {isSelectedPeerVerified ? 'Verified Out-of-Band' : 'Unverified'}
                  </span>
                </div>

                {isSelectedPeerVerified ? (
                  <button
                    type="button"
                    onClick={() => revokeContactVerification(selectedPeer.id)}
                    className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors"
                  >
                    Revoke Verification
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => markContactVerified(selectedPeer)}
                    className="px-3.5 py-1.5 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Mark Fingerprint Verified</span>
                  </button>
                )}
              </div>

              {safetyNumber.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5 p-4 bg-slate-50 border border-slate-200 rounded-lg font-mono text-sm tabular-nums text-slate-900">
                  {safetyNumber.map((block, idx) => (
                    <div key={`${block}-${idx}`} className="text-center font-medium">
                      {block}
                    </div>
                  ))}
                </div>
              )}

              <div className="text-xs text-slate-500 font-mono break-all">
                Contact SHA-256 Fingerprint: {selectedPeer.fingerprint || 'Unavailable'}
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              Register or search for another user to compare Safety Numbers.
            </p>
          )}
        </section>

        {/* Vault Backup & Key Rotation */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-teal-700" />
              <h2 className="font-display text-base font-semibold text-slate-900">
                Encrypted Vault Backup
              </h2>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Export a passphrase-encrypted copy of your X25519 and Ed25519 private keys so you
              can unlock your chat history on another browser without sending private keys to
              the server.
            </p>

            <form onSubmit={handleExportBackup} className="space-y-3">
              <input
                type="password"
                value={backupPassphrase}
                onChange={(e) => setBackupPassphrase(e.target.value)}
                placeholder="Backup passphrase (8+ characters)"
                className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-lg"
              />
              <button
                type="submit"
                disabled={!keyBundle}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-medium rounded-lg"
              >
                Generate Encrypted Backup String
              </button>
            </form>

            {exportedBackup && (
              <div className="space-y-2">
                <textarea
                  readOnly
                  rows={3}
                  value={exportedBackup}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-[11px]"
                />
                <button
                  type="button"
                  onClick={handleCopyBackup}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span>{copiedBackup ? 'Copied!' : 'Copy Encrypted Backup'}</span>
                </button>
              </div>
            )}
          </section>

          <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-teal-700" />
              <h2 className="font-display text-base font-semibold text-slate-900">
                Key Rotation & Protocol Limitations
              </h2>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Rotating keys generates brand-new X25519 + Ed25519 key pairs and increments your
              Key Version. Note: this educational protocol uses static identity X25519 + per-message
              HKDF salts, so it does not provide Signal-style Double Ratchet Forward Secrecy.
            </p>

            <form onSubmit={handleRotateKeys} className="space-y-3">
              <input
                type="password"
                value={rotatePassword}
                onChange={(e) => setRotatePassword(e.target.value)}
                placeholder="Enter your strong vault password to confirm"
                className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-lg"
              />
              <button
                type="submit"
                disabled={rotating}
                className="px-4 py-2 bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white text-xs font-medium rounded-lg"
              >
                {rotating ? 'Rotating Keys...' : 'Rotate Device Keys'}
              </button>
            </form>
          </section>
        </div>

        {/* Security Audit Logs */}
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Security Audit Log
              </h2>
              <p className="text-xs text-slate-500">
                Recent authentication, key publication, and access control events stored in
                MongoDB (no message plaintext is ever logged).
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4 font-medium">Timestamp</th>
                  <th className="py-2.5 px-4 font-medium">Action</th>
                  <th className="py-2.5 px-4 font-medium">Outcome</th>
                  <th className="py-2.5 px-4 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logsLoading ? (
                  <tr>
                    <td colSpan={4} className="py-6 px-4 text-center text-slate-500">
                      Loading security audit logs...
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 px-4 text-center text-slate-500">
                      No audit events recorded yet.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-4 font-mono tabular-nums text-slate-500 whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-slate-900 whitespace-nowrap">
                        {log.action}
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 font-medium ${
                            log.result === 'SUCCESS'
                              ? 'text-emerald-700'
                              : log.result === 'BLOCKED'
                                ? 'text-red-700'
                                : 'text-amber-700'
                          }`}
                        >
                          {log.result === 'SUCCESS' ? (
                            <ShieldCheck className="h-3.5 w-3.5" />
                          ) : (
                            <ShieldAlert className="h-3.5 w-3.5" />
                          )}
                          <span>{log.result}</span>
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-slate-600">{log.detail}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
