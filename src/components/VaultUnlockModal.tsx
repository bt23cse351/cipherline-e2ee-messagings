import { useState, type FormEvent } from 'react';
import { KeyRound, Lock, RefreshCw, ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface VaultUnlockModalProps {
  onClose?: () => void;
  allowDismiss?: boolean;
}

export function VaultUnlockModal({ onClose, allowDismiss = false }: VaultUnlockModalProps) {
  const { user, vaultExists, unlockVault, generateAndPublishKeys, importBackupAndUnlock } =
    useAuth();

  const [mode, setMode] = useState<'unlock' | 'import' | 'rotate'>(
    vaultExists ? 'unlock' : 'import'
  );
  const [passphrase, setPassphrase] = useState('');
  const [backupJson, setBackupJson] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!passphrase || passphrase.length < 8) {
      setError('Enter a passphrase of at least 8 characters.');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'unlock') {
        await unlockVault(passphrase);
      } else if (mode === 'import') {
        if (!backupJson.trim()) {
          setError('Paste your encrypted JSON key backup payload.');
          setSubmitting(false);
          return;
        }
        await importBackupAndUnlock(backupJson, passphrase);
      } else {
        await generateAndPublishKeys(passphrase);
      }
      onClose?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to unlock cryptographic vault');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="vault-modal-title"
        className="w-full max-w-lg bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden"
      >
        <div className="px-6 py-5 border-b border-slate-200 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center shrink-0">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h2 id="vault-modal-title" className="text-base font-semibold text-slate-900">
                Unlock Local Key Vault
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                Private keys stay encrypted in this browser and are never transmitted to the server.
              </p>
            </div>
          </div>
          {allowDismiss && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-xs font-medium text-slate-500 hover:text-slate-800 whitespace-nowrap shrink-0 px-2 py-1"
            >
              Close
            </button>
          )}
        </div>

        <div className="px-6 pt-4">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {vaultExists && (
              <button
                type="button"
                onClick={() => {
                  setMode('unlock');
                  setError(null);
                }}
                className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  mode === 'unlock'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Unlock Device Vault
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setMode('import');
                setError(null);
              }}
              className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                mode === 'import'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Restore JSON Backup
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('rotate');
                setError(null);
              }}
              className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                mode === 'rotate'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Generate New Keys
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {mode === 'rotate' && (
            <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <p>
                Generating a new X25519 + Ed25519 key pair increments your public key version.
                Messages encrypted under prior keys cannot be decrypted without the original vault
                backup.
              </p>
            </div>
          )}

          {mode === 'import' && (
            <div>
              <label
                htmlFor="vault-backup-json"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                Encrypted Vault Backup Payload (JSON)
              </label>
              <textarea
                id="vault-backup-json"
                rows={4}
                value={backupJson}
                onChange={(e) => setBackupJson(e.target.value)}
                placeholder='{"version":1,"kdf":"PBKDF2-SHA256",...}'
                className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
              />
            </div>
          )}

          <div>
            <label
              htmlFor="vault-passphrase"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              {mode === 'rotate'
                ? 'Passphrase to encrypt new local key vault'
                : 'Account or Vault Passphrase'}
            </label>
            <input
              id="vault-passphrase"
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="Enter passphrase (min 8 chars)"
              autoComplete="current-password"
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
            />
          </div>

          {error && (
            <p className="text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-3 pt-1">
            {allowDismiss && onClose && (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800 disabled:opacity-60 transition-colors whitespace-nowrap"
            >
              {mode === 'rotate' ? (
                <RefreshCw className="w-3.5 h-3.5" />
              ) : (
                <KeyRound className="w-3.5 h-3.5" />
              )}
              <span>
                {submitting
                  ? 'Deriving Key...'
                  : mode === 'unlock'
                  ? 'Unlock Vault'
                  : mode === 'import'
                  ? 'Restore & Unlock'
                  : 'Generate & Publish Keys'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
