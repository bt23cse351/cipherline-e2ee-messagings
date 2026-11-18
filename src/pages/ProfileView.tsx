import { Check, Copy, KeyRound, Lock, RefreshCw, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { FingerprintIdenticon } from '../components/GraphicsPrimitives';
import { useAuth } from '../context/AuthContext';
import { formatFingerprint } from '../crypto/e2ee';

interface ProfileViewProps {
  onOpenVaultModal: () => void;
}

export function ProfileView({ onOpenVaultModal }: ProfileViewProps) {
  const { user, identityKeys, vaultExists, exportVaultBackup, lockVault } = useAuth();
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [backupPayload, setBackupPayload] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);

  if (!user) return null;

  async function copyText(field: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1600);
    } catch {
      // Ignore clipboard failures
    }
  }

  async function handleRevealBackup() {
    setBackupError(null);
    try {
      const json = await exportVaultBackup();
      setBackupPayload(json);
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : 'Unable to export encrypted vault');
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
            <div className="flex items-center gap-4">
              <FingerprintIdenticon fingerprint={user.fingerprint} />
              <div>
                <h1 className="text-lg font-semibold text-slate-900">
                  Identity Keys &amp; Local Vault
                </h1>
                <p className="text-xs text-slate-600 mt-0.5">
                  Signed in as @{user.username} ({user.email}) · Key Version v{user.keyVersion}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              {identityKeys ? (
                <button
                  type="button"
                  onClick={lockVault}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Lock Vault</span>
                </button>
              ) : null}
              <button
                type="button"
                onClick={onOpenVaultModal}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-gradient-to-r from-teal-600 to-cyan-600 rounded-lg hover:from-teal-700 hover:to-cyan-700 shadow-xs whitespace-nowrap"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{identityKeys ? 'Manage / Rotate Keys' : 'Unlock Vault'}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div
              className={`p-4 rounded-lg border space-y-1 ${
                identityKeys
                  ? 'bg-emerald-50/70 border-emerald-200'
                  : vaultExists
                  ? 'bg-amber-50/70 border-amber-200'
                  : 'bg-rose-50/70 border-rose-200'
              }`}
            >
              <span className="text-slate-600">Local Key Vault Status</span>
              <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                {identityKeys ? (
                  <>
                    <ShieldCheck className="w-4 h-4 text-emerald-700" />
                    <span>Unlocked in Memory</span>
                  </>
                ) : vaultExists ? (
                  <>
                    <Lock className="w-4 h-4 text-amber-700" />
                    <span>Encrypted on Device (Locked)</span>
                  </>
                ) : (
                  <>
                    <KeyRound className="w-4 h-4 text-rose-700" />
                    <span>No Local Vault on This Browser</span>
                  </>
                )}
              </div>
            </div>
            <div className="p-4 rounded-lg bg-sky-50/70 border border-sky-200 space-y-1">
              <span className="text-slate-600">Private Key Exposure</span>
              <p className="font-semibold text-slate-900">
                Zero server transmission (PBKDF2 + AES-GCM local only)
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-700">
                  SHA-256 Public Key Fingerprint
                </span>
                {user.fingerprint && (
                  <button
                    type="button"
                    onClick={() => void copyText('fp', user.fingerprint)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"
                  >
                    {copiedField === 'fp' ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-700" />
                        <span className="text-emerald-700">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy Hex</span>
                      </>
                    )}
                  </button>
                )}
              </div>
              <p className="text-xs font-mono text-slate-900 bg-slate-50 border border-slate-200 rounded-lg p-3 break-all">
                {formatFingerprint(user.fingerprint)}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <span className="text-xs font-medium text-slate-700">
                  X25519 Encryption Public Key (Base64)
                </span>
                <p className="text-xs font-mono text-slate-800 bg-slate-50 border border-slate-200 rounded-lg p-3 break-all">
                  {user.encryptionPublicKey || 'Not published'}
                </p>
              </div>
              <div className="space-y-1.5">
                <span className="text-xs font-medium text-slate-700">
                  Ed25519 Signing Public Key (Base64)
                </span>
                <p className="text-xs font-mono text-slate-800 bg-slate-50 border border-slate-200 rounded-lg p-3 break-all">
                  {user.signingPublicKey || 'Not published'}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Encrypted Vault Backup Payload
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                Copy this AES-256-GCM encrypted JSON envelope to restore your private keys on another
                browser without exposing plaintext keys.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleRevealBackup()}
              disabled={!vaultExists}
              className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              Show Encrypted Backup JSON
            </button>
          </div>

          {backupError && (
            <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">
              {backupError}
            </p>
          )}

          {backupPayload && (
            <div className="space-y-2">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => void copyText('backup', backupPayload)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800"
                >
                  {copiedField === 'backup' ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Copied Encrypted JSON</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Encrypted JSON</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="text-xs font-mono text-slate-800 bg-slate-50 border border-slate-200 rounded-lg p-3 max-h-48 overflow-y-auto break-all whitespace-pre-wrap">
                {backupPayload}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
