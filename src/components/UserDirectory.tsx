import { MessageSquarePlus, Search, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { formatFingerprint } from '../crypto/e2ee';
import type { UserProfile, VerifiedContactRecord } from '../types/messaging';
import { Avatar } from './Avatar';

interface UserDirectoryProps {
  users: UserProfile[];
  loading: boolean;
  verifiedContacts: Record<string, VerifiedContactRecord>;
  onSearchChange: (query: string) => void;
  onStartChat: (user: UserProfile) => void;
}

export function UserDirectory({
  users,
  loading,
  verifiedContacts,
  onSearchChange,
  onStartChat,
}: UserDirectoryProps) {
  const [query, setQuery] = useState('');
  const [startingUserId, setStartingUserId] = useState<string | null>(null);

  function handleQuery(value: string) {
    setQuery(value);
    onSearchChange(value);
  }

  async function handleStart(user: UserProfile) {
    setStartingUserId(user.id);
    try {
      await onStartChat(user);
    } finally {
      setStartingUserId(null);
    }
  }

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="px-6 py-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Registered User Directory</h1>
          <p className="text-xs text-slate-600 mt-0.5">
            Inspect SHA-256 public key fingerprints and initiate 1-to-1 encrypted channels.
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => handleQuery(e.target.value)}
            placeholder="Search username..."
            className="w-full pl-9 pr-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((row) => (
              <div key={row} className="h-20 rounded-lg bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : users.length === 0 ? (
          <div className="max-w-md mx-auto py-16 text-center space-y-2">
            <p className="text-sm font-semibold text-slate-900">No matching users found</p>
            <p className="text-xs text-slate-500">
              Open a second browser tab and register another account to test real-time E2EE messaging
              between two users.
            </p>
          </div>
        ) : (
          <div className="border border-slate-200 rounded-xl divide-y divide-slate-200 bg-white">
            {users.map((contact) => {
              const hasKeys = Boolean(contact.encryptionPublicKey && contact.signingPublicKey);
              const isVerified =
                Boolean(verifiedContacts[contact.id]) &&
                verifiedContacts[contact.id].fingerprint === contact.fingerprint;

              return (
                <div
                  key={contact.id}
                  className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    <Avatar username={contact.username} isOnline={contact.isOnline} size="md" />
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-900">
                          @{contact.username}
                        </span>
                        <span className="text-xs text-slate-500">
                          {contact.isOnline ? 'Online' : 'Offline'} · Key v{contact.keyVersion}
                        </span>
                        {isVerified && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>Verified</span>
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-mono text-slate-600 break-all">
                        {hasKeys
                          ? formatFingerprint(contact.fingerprint).slice(0, 49) + '...'
                          : 'Public keys not yet published'}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={!hasKeys || startingUserId === contact.id}
                    onClick={() => void handleStart(contact)}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                  >
                    <MessageSquarePlus className="w-3.5 h-3.5" />
                    <span>
                      {startingUserId === contact.id
                        ? 'Opening...'
                        : hasKeys
                        ? 'Start Encrypted Chat'
                        : 'Keys Pending'}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
