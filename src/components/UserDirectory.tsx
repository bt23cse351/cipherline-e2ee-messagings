import { useEffect, useState } from 'react';
import { MessageSquare, Search, ShieldCheck, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import type { PublicUser } from '../types/messaging';
import { Avatar } from './Avatar';

interface UserDirectoryProps {
  onStartConversation: (peer: PublicUser) => Promise<void>;
  onInspectContactSecurity: (peer: PublicUser) => void;
}

export function UserDirectory({
  onStartConversation,
  onInspectContactSecurity,
}: UserDirectoryProps) {
  const { token, verifiedContacts } = useAuth();
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [startingUserId, setStartingUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const res = await api.searchUsers(token, query);
        if (active) setUsers(res.users);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load users');
        }
      } finally {
        if (active) setLoading(false);
      }
    }, 180);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, token]);

  const handleStart = async (peer: PublicUser) => {
    setStartingUserId(peer.id);
    try {
      await onStartConversation(peer);
    } finally {
      setStartingUserId(null);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="p-5 sm:p-6 border-b border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900">
              Registered User Directory
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Search users by username, inspect public-key fingerprints, and initiate encrypted
              1-to-1 chats.
            </p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search username..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 focus:bg-white"
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 sm:p-6">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="p-4 border border-slate-200 rounded-lg flex items-center justify-between animate-pulse"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-slate-200" />
                  <div className="space-y-2">
                    <div className="h-3.5 w-32 bg-slate-200 rounded" />
                    <div className="h-3 w-48 bg-slate-100 rounded" />
                  </div>
                </div>
                <div className="h-8 w-24 bg-slate-200 rounded-lg" />
              </div>
            ))}
          </div>
        ) : users.length === 0 ? (
          <div className="py-16 text-center max-w-sm mx-auto">
            <div className="mx-auto h-11 w-11 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center">
              <Users className="h-5 w-5" />
            </div>
            <h3 className="mt-3 text-sm font-medium text-slate-900">
              {query ? 'No matching users found' : 'No other registered users yet'}
            </h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              {query
                ? `No account matches "${query}". Check the spelling or clear the search filter.`
                : 'Register a second account in another browser window or tab to test live encrypted messaging.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl bg-white overflow-hidden">
            {users.map((peer) => {
              const verified =
                verifiedContacts[peer.id]?.fingerprint === peer.fingerprint &&
                Boolean(peer.fingerprint);
              const shortFp = peer.fingerprint
                ? `${peer.fingerprint.slice(0, 8)}...${peer.fingerprint.slice(-8)}`
                : 'Keys not published';

              return (
                <div
                  key={peer.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 hover:bg-slate-50/70 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar username={peer.username} isOnline={peer.isOnline} showPresence />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium text-slate-900 truncate">
                          @{peer.username}
                        </span>
                        <span className="text-xs text-slate-500">
                          · {peer.isOnline ? 'Online' : 'Offline'}
                        </span>
                        {verified && (
                          <span className="text-xs font-medium text-teal-700">
                            · Fingerprint Verified
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500 font-mono tabular-nums">
                        <span>Key v{peer.keyVersion}</span>
                        <span aria-hidden="true">/</span>
                        <span className="truncate">{shortFp}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onInspectContactSecurity(peer)}
                      className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <ShieldCheck className="h-3.5 w-3.5 text-teal-700" />
                      <span>Verify Key</span>
                    </button>
                    <button
                      type="button"
                      disabled={startingUserId === peer.id || !peer.encryptionPublicKey}
                      onClick={() => handleStart(peer)}
                      className="px-3.5 py-1.5 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      <span>{startingUserId === peer.id ? 'Opening...' : 'Message'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
