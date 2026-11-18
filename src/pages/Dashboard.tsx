import { Lock, LogOut, Unlock } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { ChatWindow } from '../components/ChatWindow';
import { ConversationList } from '../components/ConversationList';
import { EncryptedHandshakeGraphic } from '../components/GraphicsPrimitives';
import { UserDirectory } from '../components/UserDirectory';
import { VaultUnlockModal } from '../components/VaultUnlockModal';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { createChatSocket } from '../services/socket';
import type {
  ConversationSummary,
  EncryptedMessageEnvelope,
  UserProfile,
} from '../types/messaging';
import { ProfileView } from './ProfileView';
import { SecurityDetailsView } from './SecurityDetailsView';

type ActiveView = 'messages' | 'directory' | 'security' | 'profile';

export function Dashboard() {
  const {
    user,
    token,
    identityKeys,
    needsVaultUnlock,
    verifiedContacts,
    logoutAccount,
    lockVault,
  } = useAuth();

  const [activeView, setActiveView] = useState<ActiveView>('messages');
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [loadingConversations, setLoadingConversations] = useState(true);

  const [directoryUsers, setDirectoryUsers] = useState<UserProfile[]>([]);
  const [directorySearch, setDirectorySearch] = useState('');
  const [loadingDirectory, setLoadingDirectory] = useState(false);

  const [showVaultModal, setShowVaultModal] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const [socketInstance, setSocketInstance] = useState<Socket | null>(null);

  const fetchConversations = useCallback(async () => {
    if (!token) return;
    try {
      const { conversations: list } = await api.listConversations(token);
      const validList = list.filter((c) => Boolean(c && c.id && c.peer?.id));
      setConversations(validList);
      setActiveConversationId((prev) => prev || validList[0]?.id || null);
    } finally {
      setLoadingConversations(false);
    }
  }, [token]);

  const fetchDirectory = useCallback(
    async (search = '') => {
      if (!token) return;
      setLoadingDirectory(true);
      try {
        const { users } = await api.listUsers(token, search);
        setDirectoryUsers(users);
      } finally {
        setLoadingDirectory(false);
      }
    },
    [token]
  );

  useEffect(() => {
    void fetchConversations();
    void fetchDirectory('');
  }, [fetchConversations, fetchDirectory]);

  useEffect(() => {
    if (!token) return;
    const socket = createChatSocket(token);
    socketRef.current = socket;
    setSocketInstance(socket);

    socket.on('connect', () => {
      setSocketConnected(true);
    });
    socket.on('disconnect', () => {
      setSocketConnected(false);
    });

    socket.on('user:online', (evt: { userId: string; lastSeen: string }) => {
      setDirectoryUsers((prev) =>
        prev.map((u) => (u.id === evt.userId ? { ...u, isOnline: true, lastSeen: evt.lastSeen } : u))
      );
      setConversations((prev) =>
        prev.map((c) =>
          c.peer?.id === evt.userId
            ? { ...c, peer: { ...c.peer, isOnline: true, lastSeen: evt.lastSeen } }
            : c
        )
      );
    });

    socket.on('user:offline', (evt: { userId: string; lastSeen: string }) => {
      setDirectoryUsers((prev) =>
        prev.map((u) =>
          u.id === evt.userId ? { ...u, isOnline: false, lastSeen: evt.lastSeen } : u
        )
      );
      setConversations((prev) =>
        prev.map((c) =>
          c.peer?.id === evt.userId
            ? { ...c, peer: { ...c.peer, isOnline: false, lastSeen: evt.lastSeen } }
            : c
        )
      );
    });

    socket.on('message:new', (envelope: EncryptedMessageEnvelope) => {
      setConversations((prev) => {
        const exists = prev.some((c) => c.id === envelope.conversationId);
        if (!exists) {
          void fetchConversations();
          return prev;
        }
        const updated = prev.map((c) => {
          if (c.id !== envelope.conversationId) return c;
          const isIncoming = user ? envelope.recipientId === user.id : false;
          const isCurrentlyOpen = activeConversationId === envelope.conversationId;
          return {
            ...c,
            lastMessage: envelope,
            lastMessageAt: envelope.clientTimestamp,
            updatedAt: new Date().toISOString(),
            unreadCount:
              isIncoming && !isCurrentlyOpen ? (c.unreadCount || 0) + 1 : c.unreadCount,
          };
        });
        return updated.sort(
          (a, b) =>
            Date.parse(b.lastMessageAt || b.updatedAt) -
            Date.parse(a.lastMessageAt || a.updatedAt)
        );
      });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setSocketInstance(null);
      setSocketConnected(false);
    };
  }, [token, user, activeConversationId, fetchConversations]);

  const handleSearchDirectory = useCallback(
    (query: string) => {
      setDirectorySearch(query);
      void fetchDirectory(query);
    },
    [fetchDirectory]
  );

  const handleStartChat = useCallback(
    async (targetUser: UserProfile) => {
      if (!token) return;
      const { conversation } = await api.createOrGetConversation(token, targetUser.id);
      if (!conversation?.peer?.id) return;

      setConversations((prev) => {
        const filtered = prev.filter((c) => c.id !== conversation.id);
        return [conversation, ...filtered];
      });
      setActiveConversationId(conversation.id);
      setActiveView('messages');
    },
    [token]
  );

  const handleSelectConversation = useCallback((conversationId: string) => {
    setActiveConversationId(conversationId);
    setActiveView('messages');
    setConversations((prev) =>
      prev.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c))
    );
  }, []);

  const handleConversationActivity = useCallback(
    (conversationId: string, envelope: EncryptedMessageEnvelope) => {
      setConversations((prev) => {
        const updated = prev.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                lastMessage: envelope,
                lastMessageAt: envelope.clientTimestamp,
                updatedAt: new Date().toISOString(),
              }
            : c
        );
        return updated.sort(
          (a, b) =>
            Date.parse(b.lastMessageAt || b.updatedAt) -
            Date.parse(a.lastMessageAt || a.updatedAt)
        );
      });
    },
    []
  );

  const activeConversation = conversations.find((c) => c.id === activeConversationId) || null;

  return (
    <div className="h-screen flex flex-col bg-slate-50 overflow-hidden">
      <header className="px-5 py-3 bg-slate-900 border-b border-slate-800 text-white flex items-center justify-between gap-8 shrink-0">
        <span className="text-base font-display font-bold tracking-tight text-white whitespace-nowrap shrink-0">
          CipherLine
        </span>

        <nav className="flex items-center gap-6 overflow-x-auto text-xs font-medium">
          {(
            [
              { id: 'messages', label: 'Messages' },
              { id: 'directory', label: 'Directory' },
              { id: 'security', label: 'Security' },
              { id: 'profile', label: 'Keys & Profile' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveView(tab.id);
                if (tab.id === 'directory') {
                  void fetchDirectory(directorySearch);
                }
              }}
              className={`py-1.5 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                activeView === tab.id
                  ? 'border-teal-400 text-teal-300 font-semibold'
                  : 'border-transparent text-slate-300 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <span className="hidden md:inline text-xs text-slate-300 whitespace-nowrap">
            @{user?.username} ·{' '}
            <span className={socketConnected ? 'text-emerald-400' : 'text-amber-300'}>
              {socketConnected ? 'Connected' : 'Reconnecting'}
            </span>
          </span>
          {identityKeys ? (
            <button
              type="button"
              onClick={lockVault}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-100 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 whitespace-nowrap shrink-0"
            >
              <Lock className="w-3.5 h-3.5 text-teal-400" />
              <span>Lock Vault</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowVaultModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-gradient-to-r from-teal-500 to-emerald-500 rounded-lg hover:from-teal-600 hover:to-emerald-600 whitespace-nowrap shrink-0"
            >
              <Unlock className="w-3.5 h-3.5" />
              <span>Unlock Vault</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => void logoutAccount()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-100 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 whitespace-nowrap shrink-0"
          >
            <LogOut className="w-3.5 h-3.5 text-slate-300" />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex overflow-hidden">
        <aside className="w-72 lg:w-80 border-r border-slate-200 bg-white shrink-0 hidden sm:flex flex-col">
          <ConversationList
            conversations={conversations}
            activeConversationId={activeConversationId}
            verifiedContacts={verifiedContacts}
            loading={loadingConversations}
            onSelectConversation={handleSelectConversation}
            onOpenDirectory={() => setActiveView('directory')}
          />
        </aside>

        <main className="flex-1 min-w-0 min-h-0">
          {activeView === 'messages' ? (
            activeConversation ? (
              <ChatWindow
                conversation={activeConversation}
                socket={socketInstance}
                onUnlockVaultClick={() => setShowVaultModal(true)}
                onConversationActivity={handleConversationActivity}
              />
            ) : (
              <>
                <div className="h-full flex flex-col sm:hidden">
                  <ConversationList
                    conversations={conversations}
                    activeConversationId={activeConversationId}
                    verifiedContacts={verifiedContacts}
                    loading={loadingConversations}
                    onSelectConversation={handleSelectConversation}
                    onOpenDirectory={() => setActiveView('directory')}
                  />
                </div>
                <div className="hidden sm:flex h-full items-center justify-center p-8 bg-chat-canvas">
                  <div className="max-w-md w-full text-center bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
                    <div className="h-1.5 bg-gradient-to-r from-teal-500 via-sky-500 to-indigo-500" />
                    <div className="p-8 space-y-4">
                      <EncryptedHandshakeGraphic />
                      <div className="space-y-1.5">
                        <h2 className="text-base font-semibold text-slate-900">
                          Select a Conversation or Start a New Chat
                        </h2>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          Choose an existing encrypted thread from the sidebar or open the
                          directory to connect with another registered user.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveView('directory')}
                        className="px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-teal-600 to-cyan-600 rounded-lg hover:from-teal-700 hover:to-cyan-700 shadow-xs whitespace-nowrap"
                      >
                        Open User Directory
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )
          ) : activeView === 'directory' ? (
            <UserDirectory
              users={directoryUsers}
              loading={loadingDirectory}
              verifiedContacts={verifiedContacts}
              onSearchChange={handleSearchDirectory}
              onStartChat={handleStartChat}
            />
          ) : activeView === 'security' ? (
            <SecurityDetailsView />
          ) : (
            <ProfileView onOpenVaultModal={() => setShowVaultModal(true)} />
          )}
        </main>
      </div>

      {(showVaultModal || needsVaultUnlock) && (
        <VaultUnlockModal
          allowDismiss={!needsVaultUnlock || showVaultModal}
          onClose={() => setShowVaultModal(false)}
        />
      )}
    </div>
  );
}
