import { Lock, LogOut, ShieldCheck, UserCheck } from 'lucide-react';
import { Avatar } from '../components/Avatar';
import { useAuth } from '../context/AuthContext';

export function ProfileView() {
  const { user, vaultStatus, socketConnected, lockVaultMemory, logout } = useAuth();

  if (!user) return null;

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-5 sm:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-900">
            Account Profile
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Manage your active CipherLine identity, local key vault lock state, and session.
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-6">
            <div className="flex items-center gap-4">
              <Avatar username={user.username} isOnline={socketConnected} showPresence size="lg" />
              <div>
                <h2 className="font-display text-lg font-semibold text-slate-900">
                  @{user.username}
                </h2>
                <p className="text-xs text-slate-500">{user.email}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={lockVaultMemory}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Lock className="h-3.5 w-3.5" />
                <span>Lock Vault</span>
              </button>
              <button
                type="button"
                onClick={logout}
                className="px-3.5 py-2 text-xs font-medium text-white bg-red-700 hover:bg-red-800 rounded-lg transition-colors flex items-center gap-1.5"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-xs">
            <div>
              <dt className="text-slate-500">User ID</dt>
              <dd className="mt-1 font-mono text-slate-900 break-all">{user.id}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Active Key Version</dt>
              <dd className="mt-1 font-mono tabular-nums text-slate-900">
                v{user.keyVersion} (X25519 + Ed25519)
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Local Key Vault Status</dt>
              <dd className="mt-1 flex items-center gap-1.5 font-medium text-slate-900">
                <ShieldCheck className="h-4 w-4 text-teal-700" />
                <span>
                  {vaultStatus === 'unlocked'
                    ? 'Unlocked in memory'
                    : vaultStatus === 'locked'
                      ? 'Locked (AES-256-GCM)'
                      : 'Missing on this browser'}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Real-Time Socket State</dt>
              <dd className="mt-1 flex items-center gap-1.5 font-medium text-slate-900">
                <UserCheck className="h-4 w-4 text-teal-700" />
                <span>{socketConnected ? 'Connected via Socket.IO' : 'Disconnected'}</span>
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-slate-500">Account Created</dt>
              <dd className="mt-1 font-mono tabular-nums text-slate-900">
                {user.createdAt ? new Date(user.createdAt).toLocaleString() : 'Active session'}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
