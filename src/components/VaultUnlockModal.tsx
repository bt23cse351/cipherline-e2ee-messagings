import React, { useState } from 'react';
import { AlertTriangle, KeyRound, Lock, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function VaultUnlockModal() {
  const {
    user,
    vaultStatus,
    unlockVaultWithPassword,
    generateAndPublishFreshKeys,
    importVaultBackup,
    logout,
  } = useAuth();

  const [mode, setMode] = useState<'unlock' | 'import' | 'rotate'>(
    vaultStatus === 'missing' ? 'import' : 'unlock'
  );
  const [password, setPassword] = useState('');
  const [backupString, setBackupString] = useState('');
  const [backupPassphrase, setBackupPassphrase] = useState('');
  const [localPassword, setLocalPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!user || vaultStatus === 'unlocked') {
    return null;
  }

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await unlockVaultWithPassword(password);
      setPassword('');
    } catch {
      setError('Incorrect vault password. Could not decrypt local private keys.');
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await importVaultBackup(backupString, backupPassphrase, localPassword);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import encrypted backup');
    } finally {
      setBusy(false);
    }
  };

  const handleGenerateFresh = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (localPassword.length < 10) {
      setError('Enter a strong vault password (10+ characters) to protect your new keys.');
      return;
    }
    setBusy(true);
    try {
      await generateAndPublishFreshKeys(localPassword);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate and publish fresh keys');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl shadow-lg p-6 sm:p-7">
        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-teal-50 text-teal-700 rounded-lg shrink-0">
            <Lock className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900">
              {vaultStatus === 'missing'
                ? 'No Local Private Key Vault Found'
                : 'Unlock Local Encrypted Key Vault'}
            </h2>
            <p className="mt-1 text-xs text-slate-600 leading-relaxed">
              Signed in as <span className="font-medium text-slate-900">@{user.username}</span>.
              Because CipherLine never stores private keys on the server, your private keys must
              be unlocked locally before decrypting or signing messages.
            </p>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          {vaultStatus === 'locked' && (
            <button
              type="button"
              onClick={() => {
                setMode('unlock');
                setError('');
              }}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                mode === 'unlock'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Unlock Vault
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setMode('import');
              setError('');
            }}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
              mode === 'import'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Import Encrypted Backup
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('rotate');
              setError('');
            }}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
              mode === 'rotate'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Generate Fresh Keys
          </button>
        </div>

        {mode === 'unlock' && vaultStatus === 'locked' && (
          <form onSubmit={handleUnlock} className="mt-5 space-y-4">
            <div>
              <label
                htmlFor="vault-unlock-pw"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                Vault Password
              </label>
              <input
                id="vault-unlock-pw"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your account password"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
                {error}
              </div>
            )}
            <div className="flex items-center justify-between gap-3 pt-1">
              <button
                type="button"
                onClick={logout}
                className="text-xs font-medium text-slate-600 hover:text-slate-900"
              >
                Sign out
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white text-xs font-medium rounded-lg flex items-center gap-2"
              >
                <KeyRound className="h-3.5 w-3.5" />
                <span>{busy ? 'Decrypting...' : 'Unlock Key Vault'}</span>
              </button>
            </div>
          </form>
        )}

        {mode === 'import' && (
          <form onSubmit={handleImport} className="mt-5 space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Encrypted Backup JSON String
              </label>
              <textarea
                rows={3}
                required
                value={backupString}
                onChange={(e) => setBackupString(e.target.value)}
                placeholder='{"format":"CIPHERLINE_ENCRYPTED_KEY_BACKUP_V1",...}'
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Backup Passphrase
                </label>
                <input
                  type="password"
                  required
                  value={backupPassphrase}
                  onChange={(e) => setBackupPassphrase(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Local Vault Password
                </label>
                <input
                  type="password"
                  required
                  value={localPassword}
                  onChange={(e) => setLocalPassword(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
                {error}
              </div>
            )}
            <div className="flex items-center justify-between gap-3 pt-1">
              <button
                type="button"
                onClick={logout}
                className="text-xs font-medium text-slate-600 hover:text-slate-900"
              >
                Sign out
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white text-xs font-medium rounded-lg"
              >
                {busy ? 'Importing...' : 'Restore Keys to Device'}
              </button>
            </div>
          </form>
        )}

        {mode === 'rotate' && (
          <form onSubmit={handleGenerateFresh} className="mt-5 space-y-3">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2 text-xs text-amber-900">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-700" />
              <span>
                Generating fresh device keys increments your public key version. Older messages
                encrypted under previous keys cannot be decrypted without your prior key backup.
              </span>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                New Local Vault Password (your account password recommended)
              </label>
              <input
                type="password"
                required
                value={localPassword}
                onChange={(e) => setLocalPassword(e.target.value)}
                placeholder="10+ characters"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
                {error}
              </div>
            )}
            <div className="flex items-center justify-between gap-3 pt-1">
              <button
                type="button"
                onClick={logout}
                className="text-xs font-medium text-slate-600 hover:text-slate-900"
              >
                Sign out
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white text-xs font-medium rounded-lg flex items-center gap-2"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>{busy ? 'Generating...' : 'Generate & Publish New Keys'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
