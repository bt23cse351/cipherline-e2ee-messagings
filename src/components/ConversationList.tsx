import { Lock, Search, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import type { ConversationSummary, VerifiedContactRecord } from '../types/messaging';
import { Avatar } from './Avatar';

interface ConversationListProps {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  verifiedContacts: Record<string, VerifiedContactRecord>;
  loading: boolean;
  onSelectConversation: (conversationId: string) => void;
  onOpenDirectory: () => void;
}

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return '';
  const diffSec = Math.floor((Date.now() - ts) / 1000);
  if (diffSec < 60) return 'now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`;
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function ConversationList({
  conversations,
  activeConversationId,
  verifiedContacts,
  loading,
  onSelectConversation,
  onOpenDirectory,
}: ConversationListProps) {
  const [filter, setFilter] = useState('');

  const visibleConversations = conversations.filter((conv) => {
    if (!conv.peer?.id) return false;
    if (!filter.trim()) return true;
    return conv.peer.username.toLowerCase().includes(filter.trim().toLowerCase());
  });

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-slate-200 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Encrypted Chats</h2>
          <button
            type="button"
            onClick={onOpenDirectory}
            className="text-xs font-medium text-teal-700 hover:text-teal-800 whitespace-nowrap shrink-0"
          >
            New Chat
          </button>
        </div>
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter conversations..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
        {loading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3].map((item) => (
              <div key={item} className="h-14 rounded-lg bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : visibleConversations.length === 0 ? (
          <div className="p-6 text-center space-y-3">
            <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-900">No conversations yet</p>
              <p className="text-xs text-slate-500 mt-1">
                Pick a registered contact from the directory to establish an encrypted channel.
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenDirectory}
              className="px-3.5 py-2 text-xs font-semibold text-white bg-gradient-to-r from-teal-600 to-cyan-600 rounded-lg hover:from-teal-700 hover:to-cyan-700 transition-all whitespace-nowrap"
            >
              Browse User Directory
            </button>
          </div>
        ) : (
          visibleConversations.map((conv) => {
            const peer = conv.peer;
            if (!peer?.id) return null;
            const isSelected = conv.id === activeConversationId;
            const isVerified =
              Boolean(verifiedContacts[peer.id]) &&
              verifiedContacts[peer.id].fingerprint === peer.fingerprint;

            return (
              <button
                key={conv.id}
                type="button"
                onClick={() => onSelectConversation(conv.id)}
                className={`w-full text-left px-4 py-3.5 flex items-center gap-3 transition-colors ${
                  isSelected
                    ? 'bg-gradient-to-r from-teal-50 to-sky-50/70'
                    : 'hover:bg-slate-50'
                }`}
              >
                <Avatar username={peer.username} isOnline={peer.isOnline} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-sm font-semibold text-slate-900 truncate">
                        @{peer.username}
                      </span>
                      {isVerified && (
                        <ShieldCheck
                          className="w-3.5 h-3.5 text-emerald-700 shrink-0"
                          aria-label="Verified contact fingerprint"
                        />
                      )}
                    </div>
                    <span className="text-xs text-slate-400 tabular-nums shrink-0">
                      {formatRelativeTime(conv.lastMessageAt || conv.updatedAt)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <span className="text-xs text-slate-500 truncate">
                      {conv.lastMessage
                        ? 'Encrypted message'
                        : 'Key channel ready'}
                      {' · '}
                      {peer.isOnline ? 'Online' : 'Offline'}
                    </span>
                    {conv.unreadCount > 0 && (
                      <span className="text-xs font-mono font-semibold text-teal-700 tabular-nums shrink-0">
                        {conv.unreadCount} new
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
