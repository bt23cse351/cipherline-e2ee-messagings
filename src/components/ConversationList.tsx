import { useEffect, useState } from 'react';
import { Lock, MessageSquarePlus, Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { verifyAndDecryptMessage } from '../crypto/e2ee';
import type { ConversationSummary } from '../types/messaging';
import { Avatar } from './Avatar';

interface ConversationListProps {
  conversations: ConversationSummary[];
  selectedConversationId: string | null;
  loading: boolean;
  onSelectConversation: (conversation: ConversationSummary) => void;
  onOpenDirectory: () => void;
}

function formatShortTime(iso?: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const sameDay =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();
  return sameDay
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function ConversationList({
  conversations,
  selectedConversationId,
  loading,
  onSelectConversation,
  onOpenDirectory,
}: ConversationListProps) {
  const { user, keyBundle, verifiedContacts } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [previews, setPreviews] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    const decryptPreviews = async () => {
      if (!user || !keyBundle) {
        if (active) setPreviews({});
        return;
      }

      const next: Record<string, string> = {};
      await Promise.all(
        conversations.map(async (conv) => {
          const msg = conv.lastMessage;
          if (!msg || !conv.peer) return;
          const senderSignPub =
            msg.senderId === user.id
              ? keyBundle.signingPublicKey
              : conv.peer.signingPublicKey;
          const res = await verifyAndDecryptMessage({
            envelope: msg,
            myUserId: user.id,
            myKeys: keyBundle,
            senderSigningPublicKey: senderSignPub,
            peerEncryptionPublicKey: conv.peer.encryptionPublicKey,
          });
          next[conv.id] = res.ok
            ? res.plaintext
            : res.errorType === 'SIGNATURE_INVALID'
              ? 'Warning: Signature verification failed'
              : 'Encrypted message';
        })
      );

      if (active) {
        setPreviews(next);
      }
    };

    decryptPreviews();
    return () => {
      active = false;
    };
  }, [conversations, keyBundle, user]);

  const filtered = conversations.filter((c) =>
    Boolean(c.peer) &&
    c.peer.username.toLowerCase().includes(searchTerm.trim().toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-white border-r border-slate-200">
      <div className="p-4 border-b border-slate-200 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-base font-semibold text-slate-900">Chats</h2>
          <button
            type="button"
            onClick={onOpenDirectory}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors whitespace-nowrap"
          >
            <MessageSquarePlus className="h-3.5 w-3.5" />
            <span>New Chat</span>
          </button>
        </div>

        <div className="relative">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filter conversations..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 focus:bg-white"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
        {loading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="flex items-center gap-3 animate-pulse">
                <div className="h-10 w-10 rounded-full bg-slate-200 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-28 bg-slate-200 rounded" />
                  <div className="h-3 w-44 bg-slate-100 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center">
            <div className="mx-auto h-10 w-10 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center">
              <Lock className="h-4 w-4" />
            </div>
            <p className="mt-3 text-sm font-medium text-slate-900">
              {searchTerm ? 'No matching chats' : 'No encrypted chats yet'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {searchTerm
                ? 'Try a different username filter.'
                : 'Search for a registered user to start an end-to-end encrypted conversation.'}
            </p>
            {!searchTerm && (
              <button
                type="button"
                onClick={onOpenDirectory}
                className="mt-4 px-3.5 py-2 bg-teal-700 hover:bg-teal-800 text-white text-xs font-medium rounded-lg transition-colors"
              >
                Browse Registered Users
              </button>
            )}
          </div>
        ) : (
          filtered.map((conv) => {
            const isSelected = conv.id === selectedConversationId;
            const verifiedRecord = verifiedContacts[conv.peer.id];
            const isVerified =
              Boolean(verifiedRecord) &&
              verifiedRecord.fingerprint === conv.peer.fingerprint;
            const preview = conv.lastMessage
              ? previews[conv.id] || 'Encrypted message'
              : 'Channel initialized · No messages yet';

            return (
              <button
                key={conv.id}
                type="button"
                onClick={() => onSelectConversation(conv)}
                className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors ${
                  isSelected
                    ? 'bg-teal-50/70'
                    : 'hover:bg-slate-50'
                }`}
              >
                <Avatar
                  username={conv.peer.username}
                  isOnline={conv.peer.isOnline}
                  showPresence
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-sm font-medium text-slate-900 truncate">
                        @{conv.peer.username}
                      </span>
                      {isVerified && (
                        <span
                          className="text-[11px] font-medium text-teal-700 shrink-0"
                          title="Fingerprint verified"
                        >
                          · Verified
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                      {formatShortTime(conv.lastMessage?.clientTimestamp || conv.updatedAt)}
                    </span>
                  </div>

                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <p className="text-xs text-slate-500 truncate">{preview}</p>
                    {conv.unreadCount > 0 && (
                      <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[11px] font-medium bg-teal-700 text-white rounded-full tabular-nums shrink-0">
                        {conv.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
